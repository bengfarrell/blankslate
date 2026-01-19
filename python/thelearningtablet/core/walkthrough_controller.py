"""
WalkthroughController
Orchestrates the walkthrough process between the engine and view
"""

from typing import Protocol, Optional
from abc import abstractmethod

from .walkthrough_types import (
    WalkthroughStep, StepInfo, CaptureStatus, DetectedButton,
    DataSource, NavigationAction, UserMetadata, DeviceInfo,
    ByteAnalysis, GestureType
)
from .walkthrough_engine import WalkthroughEngine, WalkthroughEngineOptions


class IHIDReader(Protocol):
    """Interface for HID readers"""
    
    @abstractmethod
    def start_reading(self, callback) -> None:
        """Start reading HID packets"""
        pass
    
    @abstractmethod
    def stop_reading(self) -> None:
        """Stop reading HID packets"""
        pass
    
    @abstractmethod
    async def close(self) -> None:
        """Close the reader"""
        pass


class IReaderFactory(Protocol):
    """Interface for creating HID readers"""
    
    @abstractmethod
    async def create_device_reader(self, device_info: DeviceInfo) -> Optional[IHIDReader]:
        """Create a reader for a real device"""
        pass
    
    @abstractmethod
    async def create_mock_reader(self) -> IHIDReader:
        """Create a mock reader"""
        pass
    
    @abstractmethod
    async def list_devices(self) -> list:
        """List available HID devices"""
        pass


class IWalkthroughView(Protocol):
    """Interface for walkthrough views (CLI, GUI, etc.)"""
    
    @abstractmethod
    def show_header(self) -> None:
        """Show walkthrough header"""
        pass
    
    @abstractmethod
    async def prompt_data_source(self) -> DataSource:
        """Prompt user to select data source"""
        pass
    
    @abstractmethod
    async def prompt_device_selection(self, devices: list) -> Optional[DeviceInfo]:
        """Prompt user to select a device"""
        pass
    
    @abstractmethod
    def show_step_info(self, step_info: StepInfo) -> None:
        """Show information about current step"""
        pass
    
    @abstractmethod
    def on_capture_start(self) -> None:
        """Called when capture starts"""
        pass

    @abstractmethod
    def on_capture_progress(self, status: CaptureStatus) -> None:
        """Called during capture with progress updates"""
        pass

    @abstractmethod
    def on_capture_complete(self, status: CaptureStatus) -> None:
        """Called when capture completes"""
        pass

    @abstractmethod
    def on_bytes_detected(self, bytes_info: list) -> None:
        """Called when bytes are detected after capture"""
        pass

    @abstractmethod
    async def wait_for_gesture_complete(self) -> None:
        """Wait for user to complete gesture"""
        pass
    
    @abstractmethod
    async def prompt_navigation(self) -> NavigationAction:
        """Prompt for navigation action"""
        pass
    
    @abstractmethod
    async def prompt_button_count(self) -> int:
        """Prompt for number of tablet buttons"""
        pass

    @abstractmethod
    def show_button_detection_start(self, total_buttons: int) -> None:
        """Show button detection start message"""
        pass

    @abstractmethod
    def show_button_detection_prompt(self, button_number: int) -> None:
        """Show prompt for detecting a specific button"""
        pass

    @abstractmethod
    def show_button_detected(self, button: DetectedButton) -> None:
        """Show that a button was detected"""
        pass

    @abstractmethod
    def show_button_skipped(self, button_number: int) -> None:
        """Show that a button was skipped"""
        pass

    @abstractmethod
    def show_button_detection_summary(self, buttons: list, total_expected: int) -> None:
        """Show summary of button detection"""
        pass

    @abstractmethod
    async def prompt_metadata(self) -> UserMetadata:
        """Prompt for device metadata"""
        pass
    
    @abstractmethod
    def show_completion(self, config: dict) -> None:
        """Show completion message"""
        pass
    
    @abstractmethod
    async def prompt_save_config(self, config: dict) -> tuple:
        """Prompt to save configuration"""
        pass
    
    @abstractmethod
    def show_error(self, message: str) -> None:
        """Show error message"""
        pass
    
    @abstractmethod
    def show_info(self, message: str) -> None:
        """Show info message"""
        pass
    
    @abstractmethod
    def show_success(self, message: str) -> None:
        """Show success message"""
        pass


class WalkthroughControllerOptions:
    """Options for walkthrough controller"""
    def __init__(
        self,
        auto_play_mock_gestures: bool = True,
        gesture_play_duration: int = 2000,
        button_confirmations: int = 3  # Require 3 presses to avoid mistakes
    ):
        self.auto_play_mock_gestures = auto_play_mock_gestures
        self.gesture_play_duration = gesture_play_duration
        self.button_confirmations = button_confirmations


class WalkthroughController:
    """
    Orchestrates the walkthrough process
    Connects the engine (logic) with the view (UI) and reader (data source)
    """
    
    def __init__(
        self,
        view: IWalkthroughView,
        reader_factory: IReaderFactory,
        options: Optional[WalkthroughControllerOptions] = None
    ):
        self.view = view
        self.reader_factory = reader_factory
        self.options = options or WalkthroughControllerOptions()
        self.engine = WalkthroughEngine()
        self.reader: Optional[IHIDReader] = None
        self.is_mock_mode = False
        self.button_count = 0
        self.capture_status = CaptureStatus(
            packet_count=0,
            duplicates_filtered=0,
            idle_filtered=0,
            is_capturing=False
        )

        # Subscribe to engine events
        self.engine.on(self._handle_engine_event)

    def _handle_engine_event(self, event: dict) -> None:
        """Handle events from the engine"""
        if event['type'] == 'packet-received':
            # Update capture status with real-time packet count
            self.capture_status = CaptureStatus(
                packet_count=event['count'],
                duplicates_filtered=self.engine.duplicate_count,
                idle_filtered=self.engine.idle_packet_count,
                is_capturing=True
            )
            self.view.on_capture_progress(self.capture_status)
        elif event['type'] == 'bytes-detected':
            # Show detected bytes to user
            self.view.on_bytes_detected(event['bytes'])
        elif event['type'] == 'error':
            # Show error to user
            self.view.show_error(event['message'])

    async def run(self, force_mock: bool = False) -> None:
        """Main entry point - run the complete walkthrough"""
        self.view.show_header()
        
        # Select data source
        if force_mock:
            source = 'mock'
            self.view.show_info('Using mock data mode')
        else:
            source = await self.view.prompt_data_source()
        
        if source == 'exit':
            return
        
        # Initialize reader
        initialized = await self.initialize_reader(source)
        if not initialized:
            self.view.show_error('Failed to initialize device reader')
            return
        
        # Run walkthrough steps
        await self.run_steps()
        
        # Cleanup
        await self.cleanup()
    
    async def initialize_reader(self, source: DataSource) -> bool:
        """Initialize the HID reader"""
        try:
            if source == 'mock':
                self.reader = await self.reader_factory.create_mock_reader()
                self.is_mock_mode = True

                # Get device info from mock reader if available
                if hasattr(self.reader, 'get_device_info'):
                    device_info_dict = self.reader.get_device_info()
                    # Convert to DeviceInfo object
                    from .walkthrough_types import DeviceInfo
                    device_info = DeviceInfo(
                        vendor_id=device_info_dict.get('vendor_id', 0x0000),  # Generic mock device
                        product_id=device_info_dict.get('product_id', 0x0000),
                        product_string=device_info_dict.get('product_string', 'Mock Tablet'),
                        usage_page=device_info_dict.get('usage_page', 13),
                        usage=device_info_dict.get('usage', 2),
                        interfaces=device_info_dict.get('interfaces', [13]),
                        path=None
                    )
                    self.engine.set_device_info(device_info)

                    # Also set report ID if available
                    if 'report_id' in device_info_dict:
                        self.engine.detected_report_id = device_info_dict['report_id']

                return True
            
            elif source == 'device':
                devices = await self.reader_factory.list_devices()
                if not devices:
                    self.view.show_error('No HID devices found')
                    return False

                device_info = await self.view.prompt_device_selection(devices)
                if not device_info:
                    return False

                # Use multi-interface reader to capture both pen and button data
                # Tablets often split these across different HID interfaces
                self.reader = await self.reader_factory.create_multi_interface_reader(
                    device_info.vendor_id,
                    device_info.product_id
                )
                if not self.reader:
                    return False

                # Set initial device info (interfaces will be updated after data is received)
                self.engine.set_device_info(device_info)
                self.is_mock_mode = False
                return True
            
            return False
        
        except Exception as e:
            self.view.show_error(f'Error initializing reader: {e}')
            return False
    
    async def run_steps(self) -> None:
        """Run through all walkthrough steps"""
        self.engine.start()
        
        while True:
            current_step = self.engine.get_state().current_step
            
            if current_step == 'complete':
                await self.handle_completion()
                break
            
            if current_step == 'step10-metadata':
                await self.handle_metadata_step()
                continue
            
            if current_step == 'step9-tablet-buttons':
                await self.handle_button_detection_step()
                continue
            
            # Regular gesture step
            await self.handle_gesture_step()
    
    async def handle_gesture_step(self) -> None:
        """Handle a regular gesture capture step"""
        step_info = self.engine.get_current_step_info()
        self.view.show_step_info(step_info)
        
        # Run capture
        await self.run_capture(step_info.gesture)
        
        # Get navigation action
        action = await self.view.prompt_navigation()
        self.handle_navigation(action)
    
    async def handle_button_detection_step(self) -> None:
        """Handle the button detection step"""
        step_info = self.engine.get_current_step_info()
        self.view.show_step_info(step_info)
        
        # Get button count
        self.button_count = await self.view.prompt_button_count()
        
        if self.button_count > 0:
            await self.run_button_detection()
        
        # Navigation
        action = await self.view.prompt_navigation()
        self.handle_navigation(action)
    
    async def handle_metadata_step(self) -> None:
        """Handle the metadata collection step"""
        step_info = self.engine.get_current_step_info()
        self.view.show_step_info(step_info)

        # Update device info with active interfaces from multi-interface reader
        if hasattr(self.reader, 'get_active_interfaces'):
            active_interfaces = self.reader.get_active_interfaces()
            if active_interfaces:
                # Update the device info with actual interfaces that sent data
                device_info = self.engine.get_device_info()
                if device_info:
                    device_info.interfaces = active_interfaces
                    self.engine.set_device_info(device_info)

        # Get metadata
        metadata = await self.view.prompt_metadata()
        metadata.button_count = self.button_count
        self.engine.set_user_metadata(metadata)

        # Generate config
        self.engine.generate_config()
    
    async def handle_completion(self) -> None:
        """Handle completion"""
        config = self.engine.get_complete_config()
        self.view.show_completion(config)
        
        if config:
            save, filename = await self.view.prompt_save_config(config)
            if save and filename:
                self.view.show_success(f'Configuration saved to: {filename}')
    
    async def run_capture(self, gesture: Optional[GestureType]) -> None:
        """Run capture for current step"""
        if not self.reader:
            return
        
        # Reset capture status
        self.capture_status = CaptureStatus(
            packet_count=0,
            duplicates_filtered=0,
            idle_filtered=0,
            is_capturing=True
        )
        
        self.view.on_capture_start()

        # Start reading - callback receives (data, report_id)
        self.reader.start_reading(lambda data, report_id=None: self.engine.process_packet(data, report_id))
        self.engine.start_capture()
        
        # For mock mode with gesture, auto-play
        if self.is_mock_mode and gesture and hasattr(self.reader, 'play_gesture_for_step'):
            await self.reader.play_gesture_for_step(gesture, self.options.gesture_play_duration)
            import asyncio
            await asyncio.sleep(0.5)
        else:
            # Wait for user to complete gesture
            await self.view.wait_for_gesture_complete()
        
        # Stop capture
        self.engine.stop_capture()
        # DON'T stop reading - keep devices alive for button detection
        # self.reader.stop_reading()

        # Update status with filter stats
        stats = self.engine.get_filter_stats()
        self.capture_status = CaptureStatus(
            packet_count=stats['captured'],
            duplicates_filtered=stats['duplicates'],
            idle_filtered=stats['idle'],
            is_capturing=False
        )
        
        self.view.on_capture_complete(self.capture_status)
    
    async def run_button_detection(self) -> None:
        """Run interactive button detection"""
        detected_buttons = []
        self.view.show_button_detection_start(self.button_count)

        for i in range(1, self.button_count + 1):
            button = await self._detect_single_button(i)
            if button:
                detected_buttons.append(button)
                self.view.show_button_detected(button)
            else:
                self.view.show_button_skipped(i)

        self.view.show_button_detection_summary(detected_buttons, self.button_count)

        # Store detected buttons in engine
        if detected_buttons:
            button_mappings = [
                {
                    'buttonNumber': btn.button_number,
                    'statusByte': btn.byte_index,
                    'scanCode': btn.bit_position
                }
                for btn in detected_buttons
            ]
            self.engine.set_button_mappings(button_mappings)

    async def _detect_single_button(self, button_number: int) -> Optional[DetectedButton]:
        """Detect a single button press (via HID or keyboard events)"""
        if not self.reader:
            return None

        self.view.show_button_detection_prompt(button_number)

        import asyncio

        detected: Optional[DetectedButton] = None
        finished = False
        seen_packets = []
        MIN_CONFIRMATIONS = self.options.button_confirmations

        def finish():
            nonlocal finished
            if finished:
                return
            finished = True
            # Don't stop reading here - it causes "cannot join current thread" error
            # The reader will be stopped after this function returns
            # self.reader.stop_reading()

        def data_handler(data: bytes, report_id: int = None):
            try:
                nonlocal detected
                if finished:
                    return

                if len(data) < 3:
                    return

                # Packet structure (with report ID at byte 0):
                # Byte 0: Report ID
                # Byte 1: Status byte (config: status.byteIndex: [1])
                # Byte 2: Scan code for buttons (config: tabletButtons.byteIndex: [2])
                #         OR X low byte for pen data

                status_byte = data[1]  # Status at index 1
                
                # CRITICAL: Only process BUTTON mode packets, not pen packets!
                # Button mode status bytes:
                #   No driver: 0 (keyboard), 1, 3, 6 (buttons) - scan codes at byte 2
                #   With driver: 240 (0xF0) - bit-flags at byte 1
                # Pen mode status bytes: 160-165, 192 (hover, contact, etc.)
                # If we don't filter, pen X/Y coordinates get misinterpreted as button scan codes
                BUTTON_MODE_STATUS_BYTES = {0, 1, 3, 6, 240}
                
                if status_byte not in BUTTON_MODE_STATUS_BYTES:
                    # This is a pen packet, not a button packet - ignore it
                    return

                scan_code = data[2]  # Scan code at index 2

                # Skip idle packets (no button pressed)
                if scan_code == 0:
                    return

                seen_packets.append({'status': status_byte, 'scanCode': scan_code})
            except Exception:
                pass  # Silently ignore errors during button detection

            # Check for enough confirmations
            if len(seen_packets) >= MIN_CONFIRMATIONS:
                scan_code_counts = {}
                for p in seen_packets:
                    code = p['scanCode']
                    if code in scan_code_counts:
                        scan_code_counts[code]['count'] += 1
                    else:
                        scan_code_counts[code] = {'count': 1, 'status': p['status']}

                best_scan_code = 0
                best_status = 0
                best_count = 0
                for code, data_info in scan_code_counts.items():
                    if data_info['count'] > best_count:
                        best_count = data_info['count']
                        best_scan_code = code
                        best_status = data_info['status']

                if best_count >= MIN_CONFIRMATIONS:
                    detected = DetectedButton(
                        button_number=button_number,
                        byte_index=best_status,
                        bit_position=best_scan_code
                    )
                    finish()

        # Note: Keyboard detection is not supported in CLI mode
        # Keyboard events will be echoed to the terminal and interfere with the UI
        # Users should disable their tablet driver so buttons come through as HID data
        # (Keyboard detection works in web UI where we can use window.addEventListener)

        # Start reading HID data
        self.reader.start_reading(data_handler)

        # For mock mode, auto-play a single button press
        if self.is_mock_mode and hasattr(self.reader, 'play_tablet_buttons'):
            # Play just one button press
            asyncio.create_task(self.reader.play_tablet_buttons(1, 300))

        # Wait for user to skip or for detection to complete
        try:
            # Just wait for detection - don't use input() which blocks threads
            # User can press Ctrl+C to abort if needed
            timeout_counter = 0
            max_timeout = 50  # 5 seconds timeout in mock mode
            while not finished:
                await asyncio.sleep(0.1)
                if self.is_mock_mode:
                    timeout_counter += 1
                    if timeout_counter >= max_timeout:
                        # Timeout in mock mode - skip this button
                        break
        finally:
            finish()

        # Stop reading
        self.reader.stop_reading()

        # Brief pause to let any in-flight packets settle (minimal delay)
        await asyncio.sleep(0.05)

        return detected
    
    def handle_navigation(self, action: NavigationAction) -> None:
        """Handle navigation action"""
        if action == 'next':
            self.engine.next_step()
        elif action == 'retry':
            self.engine.reset_current_step()
        elif action == 'previous':
            self.engine.previous_step()
        elif action == 'cancel':
            self.engine.reset()
    
    def get_current_step(self) -> WalkthroughStep:
        """Get current step"""
        return self.engine.get_state().current_step
    
    def get_current_step_info(self) -> StepInfo:
        """Get current step info"""
        return self.engine.get_current_step_info()
    
    async def cleanup(self) -> None:
        """Cleanup resources"""
        if self.reader:
            self.reader.close()
            self.reader = None