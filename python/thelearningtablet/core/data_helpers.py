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


def parse_bit_flags(
    data: List[int],
    byte_index: int,
    button_count: int
) -> Dict[str, bool]:
    """
    Parse bit flags from a byte (e.g., for button states)

    Args:
        data: List of byte values
        byte_index: Index of the byte containing bit flags
        button_count: Number of buttons to parse

    Returns:
        Dictionary mapping button names to their pressed state
    """
    result: Dict[str, bool] = {}

    if byte_index >= len(data):
        return result

    bits = data[byte_index]

    for i in range(button_count):
        button_num = i + 1
        result[f'button{button_num}'] = (bits & (1 << i)) != 0

    return result


def process_device_data(
    data: Union[bytes, List[int]],
    mappings: Dict[str, Any]
) -> Dict[str, Union[str, int, float, bool]]:
    """
    Process raw device data according to configuration byte code mappings

    Args:
        data: Raw HID device data as bytes or list of ints
        mappings: Configuration mappings defining how to interpret the data

    Returns:
        Processed data as key-value pairs

    Example:
        result = process_device_data(raw_data, config.byte_code_mappings)
        print(result['x'], result['y'], result['pressure'])
    """
    # Convert bytes to list of integers if needed
    data_list = list(data) if isinstance(data, bytes) else data
    result: Dict[str, Union[str, int, float, bool]] = {}

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
        if key == 'tabletButtons' and mapping_type == 'code':
            # Process button codes when in button/keyboard state
            # This handles devices that send buttons on the same interface as pen data
            in_button_mode = device_state in ['buttons', 'keyboard']
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
        elif mapping_type == 'bit-flags':
            button_states = parse_bit_flags(
                data_list,
                first_byte_index,
                mapping.get('buttonCount', 8)
            )
            result.update(button_states)

    return result