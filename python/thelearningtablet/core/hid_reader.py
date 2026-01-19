"""
HID Device Reader Module

Handles reading data from HID devices (e.g., graphics tablets)
and processing the raw data according to configuration byte code mappings.
"""

import time
import struct
from typing import Dict, Any, Union, Callable, Optional, TYPE_CHECKING

from .data_helpers import parse_code, parse_range_data, parse_bipolar_range_data, parse_multi_byte_range_data, parse_bit_flags

if TYPE_CHECKING:
    from config import Config


class HIDReader:
    """Manages HID device reading and data processing"""
    
    def __init__(self, device, config: 'Config', data_callback: Callable[[Dict[str, Union[str, int, float]]], None], 
                 warning_callback: Optional[Callable[[str], None]] = None):
        """
        Initialize HID reader
        
        Args:
            device: HID device object (from hid library)
            config: Configuration instance with device byte code mappings
            data_callback: Callback function to handle processed data
            warning_callback: Optional callback function to send warnings (e.g., via websocket)
        """
        self.device = device
        self.config = config
        self.data_callback = data_callback
        self.warning_callback = warning_callback
        self.is_running = False
        # Use reportId from config, default to 2 if not specified
        self.expected_report_id = getattr(config, 'report_id', 2)
        self.wrong_report_id_warned = False  # Only warn once
        
    def process_device_data(self, data: bytes) -> Dict[str, Union[str, int, float]]:
        """
        Process raw device data according to configuration byte code mappings

        Args:
            data: Raw bytes from HID device

        Returns:
            Dictionary with processed data values
        """
        # Convert bytes to list of integers
        data_list = list(data)

        result: Dict[str, Union[str, int, float]] = {}
        
        # Check Report ID - some interfaces (like button interface) don't use status codes
        report_id = data_list[0] if len(data_list) > 0 else 0
        is_button_interface = (report_id == 6)  # Report ID 6 is button-only interface on Linux
        
        # First, parse the status to determine device state (if using single-interface mode)
        device_state = None
        for key, mapping in self.config.mappings.items():
            if mapping.get('type') == 'code':
                # byteIndex is now always a list (even for single-byte)
                byte_index_list = mapping.get('byteIndex', [0])
                byte_index = byte_index_list[0] if isinstance(byte_index_list, list) else byte_index_list
                if byte_index < len(data_list):
                    code_result = parse_code(data_list, byte_index, mapping.get('values', []))
                    if isinstance(code_result, dict):
                        result.update(code_result)
                        device_state = code_result.get('state')
                    else:
                        result[key] = code_result
                    break
        
        # Process remaining mappings based on device state
        for key, mapping in self.config.mappings.items():
            mapping_type = mapping.get('type')
            # byteIndex is now always a list (even for single-byte)
            byte_index_list = mapping.get('byteIndex', [0])
            byte_index_list = byte_index_list if isinstance(byte_index_list, list) else [byte_index_list]
            first_byte_index = byte_index_list[0]

            # Skip if already processed (status/code), unless it's tabletButtons with code type
            if mapping_type == 'code' and key != 'tabletButtons':
                continue

            # Handle tabletButtons with code type (custom value mapping)
            if key == 'tabletButtons' and mapping_type == 'code':
                # Process button codes when in button/keyboard state OR on button-only interface
                # This handles devices that send buttons on the same interface as pen data
                in_button_mode = is_button_interface or device_state in ['buttons', 'keyboard']
                if in_button_mode:
                    if first_byte_index < len(data_list):
                        byte_value = str(data_list[first_byte_index])
                        values_map = mapping.get('values', {})
                        status_overrides = mapping.get('statusOverrides', [])
                        
                        if byte_value in values_map:
                            button_num = values_map[byte_value].get('button')
                            
                            # Check for status byte overrides (buttons sharing same scan code)
                            # This handles driver vs no-driver mode where same code = different button
                            if status_overrides:
                                scan_code = int(byte_value)
                                # Status byte is at index 1 (after report ID)
                                status_byte = data_list[1] if len(data_list) > 1 else 0
                                for override in status_overrides:
                                    if override.get('scanCode') == scan_code and override.get('statusByte') == status_byte:
                                        button_num = override.get('buttonNumber')
                                        break
                            
                            if button_num:
                                # Set only this button as pressed
                                button_count = mapping.get('buttonCount', 8)
                                result['tabletButtons'] = button_num
                                for i in range(1, button_count + 1):
                                    result[f'button{i}'] = (i == button_num)
                continue
            
            # Skip keyboard-events type - these are handled by keyboard listener, not HID
            if key == 'tabletButtons' and mapping_type == 'keyboard-events':
                continue
            
            # Skip button parsing if not in button mode (unless we're on button-only interface)
            if mapping_type == 'bit-flags' and device_state != 'buttons' and not is_button_interface:
                continue
            
            # Skip coordinate/pressure/tilt parsing if on button-only interface or in button mode
            if (is_button_interface or device_state == 'buttons') and key in ['x', 'y', 'pressure', 'tiltX', 'tiltY']:
                continue
            
            # Skip validation - check if first byte index is within bounds
            if first_byte_index >= len(data_list):
                continue
                
            if mapping_type == 'range':
                result[key] = parse_range_data(
                    data_list, 
                    first_byte_index, 
                    mapping.get('min', 0), 
                    mapping.get('max', 0)
                )
            elif mapping_type == 'multi-byte-range':
                # Validate all indices are within bounds
                if all(idx < len(data_list) for idx in byte_index_list):
                    result[key] = parse_multi_byte_range_data(
                        data_list,
                        byte_index_list,
                        mapping.get('min', 0),
                        mapping.get('max', 0),
                        debug_name=key  # Pass the key name for debug logging
                    )
            elif mapping_type == 'bipolar-range':
                result[key] = parse_bipolar_range_data(
                    data_list,
                    first_byte_index,
                    mapping.get('positiveMin', 0),
                    mapping.get('positiveMax', 0),
                    mapping.get('negativeMin', 0),
                    mapping.get('negativeMax', 0)
                )
            elif mapping_type == 'bit-flags':
                button_states = parse_bit_flags(
                    data_list,
                    first_byte_index,
                    mapping.get('buttonCount', 8)
                )
                result.update(button_states)
        
        return result
    
    def start_reading(self, buffer_size: int = 64, sleep_interval: float = 0.001):
        """
        Start reading from the HID device in a loop
        
        Args:
            buffer_size: Size of read buffer in bytes
            sleep_interval: Sleep time between reads when no data (seconds)
        """
        if not self.device:
            raise ValueError("No device available for reading")
        
        self.is_running = True
        
        # Use non-blocking mode to allow signal handling
        self.device.set_nonblocking(True)
        while self.is_running:
            try:
                # Read data from device (non-blocking)
                data = self.device.read(buffer_size)

                if data:
                    # Get report ID from first byte
                    report_id = data[0] if len(data) > 0 else 0
                    
                    # Process the data
                    processed_data = self.process_device_data(bytes(data))

                    # Call the callback with processed data AND report_id
                    if processed_data:
                        self.data_callback(processed_data, report_id)
                else:
                    # Small sleep to prevent CPU spinning
                    time.sleep(sleep_interval)

            except OSError as e:
                # Handle device disconnection
                if "read error" in str(e).lower() or "device" in str(e).lower():
                    self.is_running = False
                    break
                time.sleep(0.1)
            except Exception:
                time.sleep(0.1)
    
    def stop(self):
        """Stop the reading loop"""
        self.is_running = False
    
    def close(self):
        """Close the HID device"""
        if self.device:
            try:
                # Try to ensure the device is in a good state before closing
                try:
                    self.device.set_nonblocking(False)
                except:
                    pass  # Ignore if this fails
                
                self.device.close()
                self.device = None
                
                # Give the OS time to release the device handle (needed on macOS)
                time.sleep(0.5)
                
            except Exception:
                self.device = None  # Clear reference even if close failed