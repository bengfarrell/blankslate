"""
Data parsing helper functions for HID device data

Python port of src/utils/data-helpers.ts
"""

from typing import Dict, List, Any, Union, Optional


def parse_code(
    data: List[int],
    byte_index: int,
    values: Dict[str, Any]
) -> Any:
    """
    Parse a code value from a specific byte index and return the corresponding value
    
    Args:
        data: List of byte values
        byte_index: Index of the byte to parse
        values: Dictionary mapping byte values to their meanings
        
    Returns:
        The mapped value or the byte value as string if not found
    """
    if byte_index >= len(data):
        return None
    
    byte_value = str(data[byte_index])
    return values.get(byte_value, byte_value)


def parse_range_data(
    data: List[int],
    byte_index: int,
    min_val: int,
    max_val: int
) -> float:
    """
    Parse a range value (0-255) to a normalized value (0-1)
    
    Args:
        data: List of byte values
        byte_index: Index of the byte to parse
        min_val: Minimum value in the range
        max_val: Maximum value in the range
        
    Returns:
        Normalized value between 0 and 1
    """
    if byte_index >= len(data):
        return 0.0
    
    value = data[byte_index]
    if min_val == max_val:
        return 0.0
    
    return (value - min_val) / (max_val - min_val)


def parse_multi_byte_range_data(
    data: List[int],
    byte_indices: List[int],
    min_val: int,
    max_val: int,
    debug_name: Optional[str] = None
) -> float:
    """
    Parse a multi-byte range value to a normalized value (0-1)
    
    Args:
        data: List of byte values
        byte_indices: List of byte indices to combine (little-endian)
        min_val: Minimum value in the range
        max_val: Maximum value in the range
        debug_name: Optional name for debugging
        
    Returns:
        Normalized value between 0 and 1
    """
    # Combine bytes into a single value (little-endian)
    value = 0
    for i, byte_index in enumerate(byte_indices):
        if byte_index >= len(data):
            return 0.0
        value += data[byte_index] << (i * 8)
    
    if min_val == max_val:
        return 0.0
    
    return (value - min_val) / (max_val - min_val)


def parse_bipolar_range_data(
    data: List[int],
    byte_index: int,
    positive_min: int,
    positive_max: int,
    negative_min: int,
    negative_max: int
) -> float:
    """
    Parse a bipolar range value (e.g., tilt that can be positive or negative)
    
    For tilt encoded in a single byte:
    - Positive range: 0 to positiveMax (e.g., 0-60 for +60°)
    - Negative range: negativeMin to negativeMax (e.g., 196-255 for -60° to ~0°)
    
    In the negative range:
    - negativeMin (e.g., 196) represents MAX negative tilt (-1.0)
    - negativeMax (e.g., 255) represents near-zero tilt (~0.0)
    
    Args:
        data: List of byte values
        byte_index: Index of the byte to parse
        positive_min: Minimum value for positive range
        positive_max: Maximum value for positive range
        negative_min: Minimum value for negative range
        negative_max: Maximum value for negative range
        
    Returns:
        Normalized value between -1 and 1
    """
    if byte_index >= len(data):
        return 0.0
    
    value = data[byte_index]
    
    # Check if value is in positive range (e.g., 1-60)
    # Higher byte value = more positive tilt
    if positive_min <= value <= positive_max:
        if positive_max == positive_min:
            return 0.0
        return (value - positive_min) / (positive_max - positive_min)
    
    # Check if value is in negative range (e.g., 196-255)
    # Lower byte value (196) = max negative tilt (-1.0)
    # Higher byte value (255) = near zero tilt (~0.0)
    if negative_min <= value <= negative_max:
        if negative_max == negative_min:
            return 0.0
        # Invert: negativeMin maps to -1, negativeMax maps to ~0
        return -((negative_max - value) / (negative_max - negative_min))
    
    return 0.0





def process_device_data(
    data: Union[bytes, List[int]],
    mappings: Dict[str, Any],
    button_interface_report_id: Optional[int] = None
) -> Dict[str, Union[str, int, float, bool]]:
    """
    Process raw device data according to configuration byte code mappings

    Args:
        data: Raw HID device data as bytes or list of ints
        mappings: Configuration mappings defining how to interpret the data
        button_interface_report_id: Optional report ID for button interface packets.
                                    When provided and matches the packet's report ID,
                                    forces button processing even if status byte doesn't
                                    indicate button mode. Used for multi-interface devices
                                    like XP-Pen Deco 640 where buttons come through a
                                    separate interface with a different report ID.

    Returns:
        Processed data as key-value pairs

    Example:
        result = process_device_data(raw_data, config.byte_code_mappings)
        print(result['x'], result['y'], result['pressure'])

        # With button interface report ID (for multi-interface devices)
        result = process_device_data(raw_data, config.byte_code_mappings,
                                     button_interface_report_id=6)
    """
    # Convert bytes to list of integers if needed
    data_list = list(data) if isinstance(data, bytes) else data
    result: Dict[str, Union[str, int, float, bool]] = {}

    # Check if this is a button interface packet
    # Report ID is at byte 0 when packet includes it
    is_button_interface = False
    if button_interface_report_id is not None and len(data_list) > 0:
        report_id = data_list[0]
        is_button_interface = report_id == button_interface_report_id

    # First pass: Parse status/code to determine device state
    device_state = None
    status_byte_index = 0  # Track the status byte index for later use
    for key, mapping in mappings.items():
        if mapping.get('type') == 'code':
            byte_index_list = mapping.get('byteIndex', [0])
            byte_index = byte_index_list[0] if isinstance(byte_index_list, list) else byte_index_list
            status_byte_index = byte_index  # Remember this for statusOverrides
            if byte_index < len(data_list):
                code_result = parse_code(data_list, byte_index, mapping.get('values', {}))
                if isinstance(code_result, dict):
                    result.update(code_result)
                    device_state = code_result.get('state')
                else:
                    result[key] = code_result
                break

    # Second pass: Process remaining mappings
    for key, mapping in mappings.items():
        mapping_type = mapping.get('type')
        byte_index_list = mapping.get('byteIndex', [0])
        byte_index_list = byte_index_list if isinstance(byte_index_list, list) else [byte_index_list]
        first_byte_index = byte_index_list[0]

        # Skip if already processed
        if mapping_type == 'code' and key != 'tabletButtons':
            continue

        # Skip if byte index out of bounds
        if first_byte_index >= len(data_list):
            continue

        # Handle tabletButtons with code type (custom value mapping)
        # Default to 'code' type if not specified (for backward compatibility)
        if key == 'tabletButtons' and (mapping_type == 'code' or not mapping_type):
            # Process button codes when:
            # 1. Device state indicates buttons/keyboard mode, OR
            # 2. This is a button interface packet (separate HID interface for buttons)
            # 3. Status byte is 240 (explicit button mode indicator)
            status_byte = data_list[status_byte_index] if status_byte_index < len(data_list) else 0
            in_button_mode = is_button_interface or device_state in ['buttons', 'keyboard'] or status_byte == 240
            if in_button_mode:
                byte_value = str(data_list[first_byte_index])
                values_map = mapping.get('values', {})
                status_overrides = mapping.get('statusOverrides', [])

                if byte_value in values_map:
                    button_num = values_map[byte_value].get('button')

                    # Check for status byte overrides (buttons sharing same scan code)
                    # Some tablets use the same scan code for multiple buttons, differentiated by status byte
                    if status_overrides and status_byte_index < len(data_list):
                        scan_code = int(byte_value)
                        status_byte = data_list[status_byte_index]  # Use the status byte index from config
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

        # Parse based on mapping type
        if mapping_type == 'range':
            result[key] = parse_range_data(
                data_list,
                first_byte_index,
                mapping.get('min', 0),
                mapping.get('max', 0)
            )
        elif mapping_type == 'multi-byte-range':
            if all(idx < len(data_list) for idx in byte_index_list):
                result[key] = parse_multi_byte_range_data(
                    data_list,
                    byte_index_list,
                    mapping.get('min', 0),
                    mapping.get('max', 0),
                    debug_name=key
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

    return result


def process_keyboard_button_data(
    data: Union[bytes, List[int]],
    keyboard_buttons_config: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Process keyboard HID button data from a separate keyboard interface.

    This handles tablets like Huion that send button presses via a separate
    keyboard HID interface using standard keyboard report format.

    Args:
        data: Raw HID data bytes. Format depends on report ID:
            - Report ID 3 (keyboard): [3, modifier, 0, keycode1, keycode2, ...]
            - Report ID 4 (consumer): [4, consumerCode_low, consumerCode_high]
            - Report ID 5 (scroll): [5, scrollDelta]
        keyboard_buttons_config: The keyboardButtons section from device config
            containing 'buttons' array with button definitions

    Returns:
        Dictionary with button states like {'button1': True, 'button2': False, ...}
    """
    if not data or len(data) < 2:
        return {}

    # Convert to list if bytes
    data_list = list(data) if isinstance(data, bytes) else data

    report_id = data_list[0]
    buttons_config = keyboard_buttons_config.get('buttons', [])

    if not buttons_config:
        return {}

    result: Dict[str, Any] = {}

    # Initialize all buttons to False
    button_count = keyboard_buttons_config.get('buttonCount', 0)
    for i in range(1, button_count + 1):
        result[f'button{i}'] = False

    # Parse based on report ID
    if report_id == 3:
        # Keyboard report format varies by device:
        # - Standard HID: [reportId, modifier, reserved, keycode1, keycode2, ...]
        # - Huion tablets: [reportId, modifier, keycode1, keycode2, ...] (no reserved byte)
        # We detect which format by checking if byte 2 is 0 (reserved) or non-zero (keycode)
        if len(data_list) < 3:
            return result

        modifier = data_list[1]

        # Check if byte 2 looks like a reserved byte (0) or a keycode
        # If byte 2 is 0 and byte 3 has a keycode, use standard format
        # If byte 2 is non-zero, it's likely a keycode (Huion format)
        if len(data_list) >= 4 and data_list[2] == 0 and data_list[3] != 0:
            # Standard HID format: keycodes start at byte 3
            keycodes = [k for k in data_list[3:] if k != 0]
        else:
            # Huion format: keycodes start at byte 2 (no reserved byte)
            keycodes = [k for k in data_list[2:] if k != 0]

        # Find matching button in config
        for btn_config in buttons_config:
            if btn_config.get('reportId') != 3:
                continue
            if btn_config.get('type') != 'keyboard':
                continue

            cfg_modifier = btn_config.get('modifier', 0)
            cfg_keycode = btn_config.get('keycode', 0)

            # Check if this button's modifier and keycode match
            if modifier == cfg_modifier and cfg_keycode in keycodes:
                button_num = btn_config.get('button', 0)
                if button_num > 0:
                    result[f'button{button_num}'] = True

    elif report_id == 4:
        # Consumer control report: [reportId, consumerCode_low, consumerCode_high]
        if len(data_list) < 3:
            return result

        consumer_code = data_list[1] | (data_list[2] << 8)

        if consumer_code == 0:
            return result

        # Find matching button in config
        for btn_config in buttons_config:
            if btn_config.get('reportId') != 4:
                continue
            if btn_config.get('type') != 'consumer':
                continue

            cfg_consumer_code = btn_config.get('consumerCode', 0)

            if consumer_code == cfg_consumer_code:
                button_num = btn_config.get('button', 0)
                if button_num > 0:
                    result[f'button{button_num}'] = True

    elif report_id == 5:
        # Scroll report: [reportId, scrollDelta]
        if len(data_list) < 2:
            return result

        scroll_delta = data_list[1]
        # Convert to signed byte
        if scroll_delta > 127:
            scroll_delta = scroll_delta - 256

        if scroll_delta == 0:
            return result

        # Find matching button in config
        for btn_config in buttons_config:
            if btn_config.get('reportId') != 5:
                continue
            if btn_config.get('type') != 'scroll':
                continue

            cfg_scroll_delta = btn_config.get('scrollDelta', 0)

            if scroll_delta == cfg_scroll_delta:
                button_num = btn_config.get('button', 0)
                if button_num > 0:
                    result[f'button{button_num}'] = True

    return result