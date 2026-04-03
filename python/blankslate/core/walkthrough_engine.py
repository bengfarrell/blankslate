"""
WalkthroughEngine
Platform-agnostic state machine and detection logic for the walkthrough process
"""

from typing import Dict, List, Optional, Set, Callable
from dataclasses import dataclass, field

from .walkthrough_types import (
    WalkthroughStep, StepData, UserMetadata, DeviceInfo,
    ByteAnalysis, STEP_INFO, get_next_step, get_previous_step
)
from .byte_detector import (
    analyze_bytes, get_best_guess_bytes_by_variance,
    calculate_multi_byte_max, calculate_bipolar_range,
    find_status_byte
)


@dataclass
class WalkthroughState:
    """Current state of the walkthrough"""
    current_step: WalkthroughStep = 'idle'
    is_capturing: bool = False
    step_data: Dict[WalkthroughStep, StepData] = field(default_factory=dict)
    device_info: Optional[DeviceInfo] = None
    user_metadata: Optional[UserMetadata] = None
    generated_config: Optional[Dict] = None
    complete_config: Optional[Dict] = None


@dataclass
class WalkthroughEngineOptions:
    """Configuration options for the walkthrough engine"""
    min_packets_per_step: int = 50
    min_variance_threshold: int = 50
    auto_advance: bool = False
    skip_duplicates: bool = True
    filter_idle_packets: bool = True


class WalkthroughEngine:
    """
    Platform-agnostic walkthrough engine
    Manages state, packet collection, and byte detection
    """
    
    def __init__(self, options: Optional[WalkthroughEngineOptions] = None):
        self.options = options or WalkthroughEngineOptions()
        self.state = WalkthroughState()
        self.event_handlers: Set[Callable] = set()
        self.capture_buffer: List[bytes] = []
        self.status_byte_values: Dict[int, Dict] = {}
        self.all_packets: List[bytes] = []
        self.last_packet: Optional[bytes] = None
        self.duplicate_count: int = 0
        self.idle_packet_count: int = 0
        self.button_mappings: List[Dict] = []
        self.detected_report_id: Optional[int] = None  # Will be set to first valid report ID seen
        self.candidate_report_ids: Set[int] = set()  # Track all seen report IDs before locking in
        self.report_id_locked: bool = False  # Flag to track if we've locked onto a report ID
        # Button interface report ID detection (for tablets that send buttons on different report ID)
        self.detected_button_report_id: Optional[int] = None
        self.button_report_id_candidates: Set[int] = set()
    
    def on(self, handler: Callable) -> Callable:
        """Subscribe to walkthrough events"""
        self.event_handlers.add(handler)
        return lambda: self.event_handlers.discard(handler)
    
    def emit(self, event: Dict) -> None:
        """Emit an event to all subscribers"""
        for handler in self.event_handlers:
            try:
                handler(event)
            except Exception:
                pass  # Silently ignore handler errors
    
    def get_state(self) -> WalkthroughState:
        """Get current walkthrough state"""
        return self.state
    
    def get_current_step_info(self):
        """Get current step info"""
        return STEP_INFO[self.state.current_step]
    
    def get_captured_packet_count(self) -> int:
        """Get packet count for current capture"""
        return len(self.capture_buffer)
    
    def get_captured_packets(self) -> List[bytes]:
        """Get all captured packets for current step"""
        return self.capture_buffer.copy()
    
    def set_device_info(self, info: DeviceInfo) -> None:
        """Set device information"""
        self.state.device_info = info
    
    def get_device_info(self) -> Optional[DeviceInfo]:
        """Get current device information"""
        return self.state.device_info
    
    def start(self) -> None:
        """Start the walkthrough"""
        self.state.current_step = 'step1-horizontal'
        self.emit({'type': 'step-changed', 'step': self.state.current_step})
    
    def reset(self) -> None:
        """Reset to initial state"""
        self.state = WalkthroughState()
        self.capture_buffer = []
        self.status_byte_values = {}
        self.all_packets = []
        self.emit({'type': 'step-changed', 'step': 'idle'})
    
    def reset_current_step(self) -> None:
        """Reset current step data"""
        self.capture_buffer = []
        if self.state.current_step in self.state.step_data:
            del self.state.step_data[self.state.current_step]
        self.state.is_capturing = False
    
    def start_capture(self) -> None:
        """Start capturing packets for current step"""
        if self.state.current_step in ('step10-metadata', 'complete'):
            return
        
        self.capture_buffer = []
        self.last_packet = None
        self.duplicate_count = 0
        self.idle_packet_count = 0
        self.state.is_capturing = True
        self.emit({'type': 'capture-started', 'step': self.state.current_step})
    
    def stop_capture(self) -> None:
        """Stop capturing and process collected packets"""
        if not self.state.is_capturing:
            return
        
        self.state.is_capturing = False
        packet_count = len(self.capture_buffer)
        
        self.emit({
            'type': 'capture-stopped',
            'step': self.state.current_step,
            'packet_count': packet_count
        })
        
        if packet_count > 0:
            self._process_step_data()
    
    def process_packet(self, packet: bytes, report_id: Optional[int] = None) -> None:
        """
        Process incoming HID packet

        Args:
            packet: Raw HID packet bytes (without report ID - stripped by reader)
            report_id: Report ID (passed separately by HID reader)
        """
        if not self.state.is_capturing:
            return

        # Check if this is a button step (needed for filtering logic)
        is_button_step = self.state.current_step == 'step9-tablet-buttons'

        # Auto-detect report ID from parameter (passed by HID reader)
        if report_id is not None:
            # Tablet-agnostic pen packet detection:
            # Instead of checking for specific status bytes, detect pen packets by content:
            # - Pen packets have non-zero data in coordinate bytes (typically bytes 2-7)
            # - Idle/empty packets are all zeros or have no meaningful variance
            if len(packet) > 2:
                # Check for non-zero data in the data portion (skip status byte at index 1)
                data_bytes = packet[2:min(len(packet), 8)]  # Check bytes 2-7 (coordinates/pressure)
                has_meaningful_data = any(b != 0 for b in data_bytes)

                if has_meaningful_data:
                    self.candidate_report_ids.add(report_id)

            # Lock onto the first report ID that sends valid pen data
            # No preference for any specific report ID - just use whichever sends data first
            if self.candidate_report_ids and not self.report_id_locked:
                # Lock onto the first (or only) report ID seen
                self.detected_report_id = list(self.candidate_report_ids)[0]
                self.report_id_locked = True

            # For button step, accept all packets (handled separately in controller)
            if not is_button_step:
                # For gesture steps, only accept packets with the detected report ID
                if self.report_id_locked and report_id != self.detected_report_id:
                    return

        # Skip duplicate packets if enabled
        if self.options.skip_duplicates and self.last_packet:
            if packet == self.last_packet:
                self.duplicate_count += 1
                return

        # Filter out idle packets if enabled
        if self.options.filter_idle_packets and len(packet) > 1 and not is_button_step:
            # Status byte is at index 1 (matching stable config byteIndex: [1])
            status_byte = packet[1]

            # Check for true "idle" status byte (0x00 only)
            # Note: 0xC0 is NOT idle - it's "hover" on Huion tablets
            if status_byte == 0x00:
                self.idle_packet_count += 1
                self._track_status_byte(status_byte)
                return

            # Check if packet is essentially empty (all zeros except status byte)
            has_data = any(b != 0 for b in packet[1:])
            if not has_data:
                self.idle_packet_count += 1
                self._track_status_byte(status_byte)
                return
        
        # Track status byte from all packets (not just idle ones)
        # Status byte is at index 1 (matching stable config byteIndex: [1])
        if len(packet) > 1:
            self._track_status_byte(packet[1])

        # Store this packet
        self.capture_buffer.append(packet)
        self.all_packets.append(packet)
        self.last_packet = packet
        
        self.emit({
            'type': 'packet-received',
            'packet': packet,
            'count': len(self.capture_buffer)
        })
        
        # Track status byte values for button detection
        # Byte 0 is typically 0 (report ID placeholder), byte 1 is the actual status byte
        if len(packet) > 1:
            self._track_status_byte(packet[1])
    
    def get_filter_stats(self) -> Dict[str, int]:
        """Get statistics about filtered packets"""
        return {
            'duplicates': self.duplicate_count,
            'idle': self.idle_packet_count,
            'captured': len(self.capture_buffer)
        }
    
    def _track_status_byte(self, byte_value: int) -> None:
        """Track status byte values - records ALL pen-related status codes whenever seen.

        Handles two different tablet encoding schemes:
        - XP-Pen style: 0xA0-0xA5 for pen states, 0xC0 for "none" (pen out of range)
        - Huion style: 0xC0-0xC5 for pen states (no 0xA0 range)

        We detect which scheme is in use by checking if 0xA0 (160) is seen.
        If 0xA0 is present, then 0xC0 means "none". Otherwise, 0xC0 means "hover".
        """
        # === Standard/XP-Pen tablets (0xA0-0xA5 range) ===
        xppen_status_map = {
            0xa0: {'state': 'hover'},           # 160 - pen hovering
            0xa1: {'state': 'contact'},         # 161 - pen touching
            0xa2: {'state': 'hover', 'secondaryButtonPressed': True},    # 162
            0xa3: {'state': 'contact', 'secondaryButtonPressed': True},  # 163
            0xa4: {'state': 'hover', 'primaryButtonPressed': True},      # 164
            0xa5: {'state': 'contact', 'primaryButtonPressed': True},    # 165
        }

        # === Huion tablets (0xC0-0xC5 range) - only used if XP-Pen range not seen ===
        huion_status_map = {
            0xc0: {'state': 'hover'},           # 192 - pen hovering (Huion only)
            0xc1: {'state': 'contact'},         # 193 - pen touching
            0xc2: {'state': 'hover', 'secondaryButtonPressed': True},    # 194
            0xc3: {'state': 'contact', 'secondaryButtonPressed': True},  # 195
            0xc4: {'state': 'hover', 'primaryButtonPressed': True},      # 196
            0xc5: {'state': 'contact', 'primaryButtonPressed': True},    # 197
        }

        # === Common status codes ===
        common_status_map = {
            0x00: {'state': 'none'},            # 0 - pen out of range / idle
            0xf0: {'state': 'buttons'},         # 240 - tablet button mode indicator
        }

        # Check if we're using XP-Pen style (0xA0 range present)
        uses_xppen_style = 0xa0 in self.status_byte_values or byte_value in xppen_status_map

        # Handle XP-Pen style status bytes
        if byte_value in xppen_status_map:
            self.status_byte_values[byte_value] = xppen_status_map[byte_value]
            # If we see XP-Pen style, 0xC0 should be "none" not "hover"
            # Update 0xC0 if it was previously set to "hover"
            if 0xc0 in self.status_byte_values and self.status_byte_values[0xc0].get('state') == 'hover':
                self.status_byte_values[0xc0] = {'state': 'none'}
            return

        # Handle 0xC0 specially - it's "none" for XP-Pen, "hover" for Huion
        if byte_value == 0xc0:
            if uses_xppen_style:
                self.status_byte_values[byte_value] = {'state': 'none'}
            else:
                self.status_byte_values[byte_value] = {'state': 'hover'}
            return

        # Handle other Huion style status bytes (0xC1-0xC5)
        if byte_value in huion_status_map:
            self.status_byte_values[byte_value] = huion_status_map[byte_value]
            return

        # Handle common status codes
        if byte_value in common_status_map:
            self.status_byte_values[byte_value] = common_status_map[byte_value]
    
    def _process_step_data(self) -> None:
        """Process collected step data and detect bytes"""
        step = self.state.current_step
        packets = self.capture_buffer.copy()

        # Analyze bytes in the captured packets
        analysis = analyze_bytes(packets)
        
        # Get best guess bytes based on step type
        detected_bytes = self._detect_bytes_for_step(step, analysis)

        # Store step data
        step_data = StepData(
            packets=packets,
            detected_bytes=detected_bytes,
            status_values=self.status_byte_values.copy()
        )
        self.state.step_data[step] = step_data
        
        self.emit({
            'type': 'bytes-detected',
            'step': step,
            'bytes': detected_bytes
        })
    
    def _detect_bytes_for_step(self, step: WalkthroughStep, analysis: List[ByteAnalysis]) -> List[ByteAnalysis]:
        """Detect bytes for a specific step"""
        min_variance = self.options.min_variance_threshold
        
        # Get already detected byte indices to filter them out
        excluded_indices = self._get_excluded_byte_indices(step)
        filtered_analysis = [b for b in analysis if b.byte_index not in excluded_indices]
        
        if step == 'step1-horizontal':
            # X coordinate bytes (2 bytes)
            return get_best_guess_bytes_by_variance(filtered_analysis, 2, min_variance)
        
        elif step == 'step2-vertical':
            # Y coordinate bytes (2 bytes) - filter out X bytes
            return get_best_guess_bytes_by_variance(filtered_analysis, 2, min_variance)
        
        elif step == 'step3-pressure':
            # Pressure bytes (2 bytes) - filter out X and Y
            return get_best_guess_bytes_by_variance(filtered_analysis, 2, min_variance)
        
        elif step == 'step4-hover-movement':
            # Hover verifies X and Y detection, doesn't detect new bytes
            x_bytes = self.state.step_data.get('step1-horizontal')
            y_bytes = self.state.step_data.get('step2-vertical')
            result = []
            if x_bytes:
                result.extend(x_bytes.detected_bytes)
            if y_bytes:
                result.extend(y_bytes.detected_bytes)
            return result
        
        elif step == 'step5-tilt-x':
            # Tilt X bytes (1 byte typically)
            return get_best_guess_bytes_by_variance(filtered_analysis, 1, min_variance)
        
        elif step == 'step6-tilt-y':
            # Tilt Y bytes (1 byte typically)
            return get_best_guess_bytes_by_variance(filtered_analysis, 1, min_variance)
        
        elif step in ('step7-primary-button', 'step8-secondary-button'):
            # Button detection - status byte changes
            return []
        
        elif step == 'step9-tablet-buttons':
            # Tablet button detection - detect bytes with variance
            # Button packets typically have scan codes at byte 2 (after report ID and status)
            # Filter to bytes with any variance (button presses cause changes)
            button_bytes = [b for b in filtered_analysis if b.variance > 0]
            return button_bytes
        
        return []
    
    def _get_excluded_byte_indices(self, current_step: WalkthroughStep) -> Set[int]:
        """Get byte indices that should be excluded from detection"""
        excluded = set()
        
        # Always exclude byte 0 (report ID) and byte 1 (status byte)
        # Report ID is at index 0, status byte is at index 1 per stable config
        excluded.add(0)  # Report ID
        excluded.add(1)  # Status byte
        
        # Exclude bytes from previous steps
        if current_step in ('step2-vertical', 'step3-pressure', 'step4-hover-movement',
                           'step5-tilt-x', 'step6-tilt-y'):
            # Exclude X bytes
            x_data = self.state.step_data.get('step1-horizontal')
            if x_data:
                excluded.update(b.byte_index for b in x_data.detected_bytes)
        
        if current_step in ('step3-pressure', 'step4-hover-movement',
                           'step5-tilt-x', 'step6-tilt-y'):
            # Exclude Y bytes
            y_data = self.state.step_data.get('step2-vertical')
            if y_data:
                excluded.update(b.byte_index for b in y_data.detected_bytes)
        
        if current_step in ('step5-tilt-x', 'step6-tilt-y'):
            # Exclude pressure bytes
            p_data = self.state.step_data.get('step3-pressure')
            if p_data:
                excluded.update(b.byte_index for b in p_data.detected_bytes)
        
        if current_step == 'step6-tilt-y':
            # Exclude tilt-x bytes
            tx_data = self.state.step_data.get('step5-tilt-x')
            if tx_data:
                excluded.update(b.byte_index for b in tx_data.detected_bytes)
        
        return excluded
    
    def next_step(self) -> None:
        """Advance to next step"""
        self.state.current_step = get_next_step(self.state.current_step)
        self.emit({'type': 'step-changed', 'step': self.state.current_step})
    
    def previous_step(self) -> None:
        """Go back to previous step"""
        self.state.current_step = get_previous_step(self.state.current_step)
        self.emit({'type': 'step-changed', 'step': self.state.current_step})
    
    def set_user_metadata(self, metadata: UserMetadata) -> None:
        """Set user-provided metadata"""
        self.state.user_metadata = metadata
    
    def set_button_mappings(self, mappings: List[Dict]) -> None:
        """Set detected button mappings and record button-mode status codes"""
        self.button_mappings = mappings
        
        # Record button-mode status bytes from detected buttons
        # These status bytes indicate button/keyboard mode packets
        # Status byte values:
        #   0: keyboard mode (no driver)
        #   1, 3, 6: button mode (no driver)
        #   240 (0xF0): button mode (with driver)
        BUTTON_MODE_STATUS_MAP = {
            0: {'state': 'keyboard'},
            1: {'state': 'buttons'},
            3: {'state': 'buttons'},
            6: {'state': 'buttons'},
            240: {'state': 'buttons'},  # Driver mode button status
        }
        
        # Collect unique status bytes from all detected buttons
        seen_status_bytes = set()
        for mapping in mappings:
            status_byte = mapping.get('statusByte')
            if status_byte is not None:
                seen_status_bytes.add(status_byte)
        
        # Add all button-mode status codes that we've seen to status_byte_values
        for status_byte in seen_status_bytes:
            if status_byte in BUTTON_MODE_STATUS_MAP:
                self.status_byte_values[status_byte] = BUTTON_MODE_STATUS_MAP[status_byte]
        
        # Also add the common button mode status codes that may not have been seen
        # but should be in the config for completeness
        for status_byte, status_value in BUTTON_MODE_STATUS_MAP.items():
            if status_byte not in self.status_byte_values:
                self.status_byte_values[status_byte] = status_value

    def store_button_step_data(self, packets: List[bytes], detected_buttons: List,
                                report_id: Optional[int] = None) -> None:
        """Store button step data for recording purposes.

        This is called after button detection completes to store the raw packets
        in step_data so they can be included in recordings.

        Args:
            packets: List of raw HID packets captured during button detection
            detected_buttons: List of DetectedButton objects that were detected
            report_id: Optional report ID of button packets (for buttonInterfaceReportId)
        """
        from .byte_detector import analyze_bytes

        # Track button report ID if provided and different from main report ID
        if report_id is not None:
            self.button_report_id_candidates.add(report_id)
            if self.detected_button_report_id is None:
                self.detected_button_report_id = report_id

        # Analyze the packets to get detected bytes (for consistency with other steps)
        detected_bytes = []
        if packets:
            analysis = analyze_bytes(packets)
            # For button step, we're interested in the button byte (typically byte 2)
            # Filter to bytes with significant variance
            detected_bytes = [b for b in analysis if b.variance > 0]

        # Store step data
        step_data = StepData(
            packets=packets,
            detected_bytes=detected_bytes,
            status_values=self.status_byte_values.copy()
        )
        self.state.step_data['step9-tablet-buttons'] = step_data

        self.emit({
            'type': 'bytes-detected',
            'step': 'step9-tablet-buttons',
            'bytes': detected_bytes
        })

    def generate_config(self) -> None:
        """Generate the final configuration"""
        if not self.state.device_info or not self.state.user_metadata:
            self.emit({
                'type': 'error',
                'message': 'Cannot generate config: missing device info or metadata'
            })
            return
        
        # Build byte code mappings from step data
        config = self._build_byte_code_mappings()
        self.state.generated_config = config
        
        # Generate complete config
        self.state.complete_config = self._generate_complete_config()
        self.state.current_step = 'complete'
        
        self.emit({'type': 'step-changed', 'step': 'complete'})
        self.emit({'type': 'walkthrough-complete', 'config': self.state.complete_config})
    
    def _build_byte_code_mappings(self) -> Dict:
        """Build byte code mappings from collected step data"""
        mappings = {}
        
        # Status byte - at index 1 to match stable config (XP-Pen Deco 640)
        # Packet structure: [reserved byte 0] [status byte at index 1] [data bytes 2+]
        if self.status_byte_values:
            mappings['status'] = {
                'byteIndex': [1],  # Status byte is at index 1 (matching stable config structure)
                'type': 'code',
                'values': {str(k): v for k, v in self.status_byte_values.items()}
            }

        # Byte indices match the packet layout directly (report ID is stripped and passed separately)
        def adjust_indices(indices):
            return indices  # No adjustment needed!

        # X coordinate
        x_data = self.state.step_data.get('step1-horizontal')
        if x_data and x_data.detected_bytes:
            x_indices = [b.byte_index for b in x_data.detected_bytes]
            x_max = calculate_multi_byte_max(x_indices, x_data.packets)
            mappings['x'] = {
                'byteIndex': adjust_indices(x_indices),
                'max': x_max,
                'type': 'multi-byte-range'
            }

        # Y coordinate
        y_data = self.state.step_data.get('step2-vertical')
        if y_data and y_data.detected_bytes:
            y_indices = [b.byte_index for b in y_data.detected_bytes]
            y_max = calculate_multi_byte_max(y_indices, y_data.packets)
            mappings['y'] = {
                'byteIndex': adjust_indices(y_indices),
                'max': y_max,
                'type': 'multi-byte-range'
            }

        # Pressure
        p_data = self.state.step_data.get('step3-pressure')
        if p_data and p_data.detected_bytes:
            p_indices = [b.byte_index for b in p_data.detected_bytes]
            p_max = calculate_multi_byte_max(p_indices, p_data.packets)
            mappings['pressure'] = {
                'byteIndex': adjust_indices(p_indices),
                'max': p_max,
                'type': 'multi-byte-range'
            }

        # Tilt X
        tx_data = self.state.step_data.get('step5-tilt-x')
        if tx_data and tx_data.detected_bytes:
            tx_indices = [b.byte_index for b in tx_data.detected_bytes]
            tilt_range = calculate_bipolar_range(tx_indices[0], tx_data.packets)
            mappings['tiltX'] = {
                'byteIndex': adjust_indices(tx_indices),
                'positiveMax': tilt_range['positiveMax'],
                'negativeMin': tilt_range['negativeMin'],
                'negativeMax': tilt_range['negativeMax'],
                'type': 'bipolar-range'
            }

        # Tilt Y
        ty_data = self.state.step_data.get('step6-tilt-y')
        if ty_data and ty_data.detected_bytes:
            ty_indices = [b.byte_index for b in ty_data.detected_bytes]
            tilt_range = calculate_bipolar_range(ty_indices[0], ty_data.packets)
            mappings['tiltY'] = {
                'byteIndex': adjust_indices(ty_indices),
                'positiveMax': tilt_range['positiveMax'],
                'negativeMin': tilt_range['negativeMin'],
                'negativeMax': tilt_range['negativeMax'],
                'type': 'bipolar-range'
            }
        
        # Tablet Buttons
        if self.button_mappings:
            # Separate buttons by interface type
            digitizer_buttons = [m for m in self.button_mappings if m.get('interfaceType', 'digitizer') == 'digitizer']
            keyboard_buttons = [m for m in self.button_mappings if m.get('interfaceType') == 'keyboard']

            # Handle digitizer interface buttons (XP-Pen style)
            if digitizer_buttons:
                values = {}
                scan_code_groups = {}
                for mapping in digitizer_buttons:
                    scan_code = mapping.get('scanCode')
                    if scan_code is not None:
                        if scan_code not in scan_code_groups:
                            scan_code_groups[scan_code] = []
                        scan_code_groups[scan_code].append(mapping)

                conflicting_buttons = []
                for scan_code, mappings_list in scan_code_groups.items():
                    if len(mappings_list) > 1:
                        sorted_mappings = sorted(mappings_list, key=lambda m: m['buttonNumber'])
                        values[str(scan_code)] = {'button': sorted_mappings[0]['buttonNumber']}
                        for i in range(1, len(sorted_mappings)):
                            status_byte = sorted_mappings[i].get('statusByte')
                            if status_byte is not None:
                                conflicting_buttons.append({
                                    'scanCode': scan_code,
                                    'statusByte': status_byte,
                                    'buttonNumber': sorted_mappings[i]['buttonNumber']
                                })
                    else:
                        values[str(scan_code)] = {'button': mappings_list[0]['buttonNumber']}

                tablet_buttons_config = {
                    'byteIndex': [2],
                    'buttonCount': len(digitizer_buttons),
                    # 'type': 'code' is now implicit/default - no need to specify
                    'values': values
                }
                if conflicting_buttons:
                    tablet_buttons_config['statusOverrides'] = conflicting_buttons
                mappings['tabletButtons'] = tablet_buttons_config

            # Handle keyboard interface buttons (Huion style)
            if keyboard_buttons:
                keyboard_button_mappings = []
                for mapping in keyboard_buttons:
                    btn_config = {
                        'button': mapping['buttonNumber'],
                        'reportId': mapping.get('statusByte'),  # Report ID stored in statusByte
                    }

                    # Add keyboard-specific data based on report ID
                    report_id = mapping.get('statusByte')
                    if report_id == 3:
                        # Keyboard shortcut: modifier + keycode
                        btn_config['type'] = 'keyboard'
                        if mapping.get('modifier') is not None:
                            btn_config['modifier'] = mapping['modifier']
                        if mapping.get('keycode') is not None:
                            btn_config['keycode'] = mapping['keycode']
                    elif report_id == 4:
                        # Consumer control
                        btn_config['type'] = 'consumer'
                        if mapping.get('consumerCode') is not None:
                            btn_config['consumerCode'] = mapping['consumerCode']
                    elif report_id == 5:
                        # Scroll wheel
                        btn_config['type'] = 'scroll'
                        if mapping.get('scrollDelta') is not None:
                            btn_config['scrollDelta'] = mapping['scrollDelta']

                    keyboard_button_mappings.append(btn_config)

                mappings['keyboardButtons'] = {
                    'description': 'Buttons from keyboard HID interface (requires sudo on macOS)',
                    'usagePage': 1,
                    'usage': 6,
                    'buttonCount': len(keyboard_buttons),
                    'buttons': keyboard_button_mappings
                }

        # Note: Removed bit-flags fallback. Interactive button detection is now required
        # for tabletButtons configuration. If buttons are not detected interactively,
        # they won't be included in the config.

        return mappings
    
    def _detect_stylus_mode_status_byte(self) -> Optional[int]:
        """Detect the stylus mode status byte (hover state without buttons)"""
        for status_code, status_value in self.status_byte_values.items():
            if (status_value.get('state') == 'hover' and
                not status_value.get('primaryButtonPressed') and
                not status_value.get('secondaryButtonPressed')):
                return status_code
        return None

    def _generate_complete_config(self) -> Dict:
        """Generate the complete device configuration in multi-mode format"""
        device_info = self.state.device_info
        user_meta = self.state.user_metadata
        byte_mappings = self.state.generated_config

        if not device_info or not user_meta or not byte_mappings:
            return {}

        # Detect stylus mode status byte
        stylus_mode_status_byte = self._detect_stylus_mode_status_byte()

        # Build mode configuration
        mode_config = {
            'reportId': self.detected_report_id if self.detected_report_id is not None else 2,
            'digitizerUsagePage': device_info.usage_page if device_info.usage_page else 13,
            'capabilities': {
                'hasButtons': user_meta.button_count > 0,
                'buttonCount': user_meta.button_count,
                'hasPressure': 'pressure' in byte_mappings,
                'pressureLevels': byte_mappings.get('pressure', {}).get('max', 0),
                'hasTilt': 'tiltX' in byte_mappings or 'tiltY' in byte_mappings,
                'resolution': {
                    'x': byte_mappings.get('x', {}).get('max', 0),
                    'y': byte_mappings.get('y', {}).get('max', 0)
                }
            },
            'byteCodeMappings': byte_mappings
        }

        # Add optional stylus mode status byte if detected
        if stylus_mode_status_byte is not None:
            mode_config['stylusModeStatusByte'] = stylus_mode_status_byte

        # Add buttonInterfaceReportId if buttons come on a different report ID than pen data
        if (self.detected_button_report_id is not None and
            self.detected_button_report_id != self.detected_report_id):
            mode_config['buttonInterfaceReportId'] = self.detected_button_report_id

        # Always generate multi-mode format (with single mode in array)
        return {
            'name': user_meta.name,
            'manufacturer': user_meta.manufacturer,
            'model': user_meta.model,
            'description': user_meta.description,
            'vendorId': f"0x{device_info.vendor_id:04x}",
            'productId': f"0x{device_info.product_id:04x}",
            'deviceInfo': {
                'vendor_id': device_info.vendor_id,
                'product_id': device_info.product_id,
                'product_string': device_info.product_string,
                'interfaces': device_info.interfaces
            },
            'modes': [mode_config]
        }
    
    def get_complete_config(self) -> Optional[Dict]:
        """Get the generated complete configuration"""
        return self.state.complete_config
    
    def get_byte_code_mappings(self) -> Optional[Dict]:
        """Get the byte code mappings configuration"""
        return self.state.generated_config