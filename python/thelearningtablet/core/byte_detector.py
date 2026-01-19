"""
Byte Detection Utilities

This module contains the core logic for analyzing HID packets and identifying
which bytes represent coordinates, pressure, tilt, and other tablet data.

Python port of src/utils/byte-detector.ts
"""

from typing import List, Dict, Set, Optional, Any, TypedDict
from dataclasses import dataclass


@dataclass
class ByteAnalysis:
    """Analysis of a single byte position across multiple packets"""
    byte_index: int
    min: int
    max: int
    variance: int


class StatusValue(TypedDict, total=False):
    """Status byte value mapping"""
    state: str
    primaryButtonPressed: bool
    secondaryButtonPressed: bool


class ButtonMapping(TypedDict, total=False):
    """Button mapping from interactive detection"""
    buttonNumber: int
    statusByte: int
    scanCode: int
    # Keyboard event properties (when driver is active)
    key: str
    code: str
    ctrlKey: bool
    shiftKey: bool
    altKey: bool
    metaKey: bool


def analyze_bytes(packets: List[bytes]) -> List[ByteAnalysis]:
    """
    Analyzes captured HID packets and calculates statistics for each byte position.
    Returns min, max, and variance for each byte across all packets.
    
    Args:
        packets: List of HID packets as bytes
        
    Returns:
        List of ByteAnalysis for each byte position
    """
    if not packets:
        return []

    analysis: List[ByteAnalysis] = []
    # Find the maximum packet length to handle variable-length packets
    packet_length = max(len(p) for p in packets)

    for byte_index in range(packet_length):
        min_val = 255
        max_val = 0

        for packet in packets:
            # Skip if this packet is shorter than the current byte index
            if byte_index >= len(packet):
                continue
            value = packet[byte_index]
            if value < min_val:
                min_val = value
            if value > max_val:
                max_val = value

        variance = max_val - min_val

        analysis.append(ByteAnalysis(
            byte_index=byte_index,
            min=min_val,
            max=max_val,
            variance=variance
        ))

    return analysis


def get_best_guess_bytes_by_variance(
    analysis: List[ByteAnalysis],
    max_bytes: int = 3,
    min_variance: int = 50
) -> List[ByteAnalysis]:
    """
    Identifies the most significant bytes based on variance.
    
    Strategy:
    - If maxBytes === 1: Looking for a single byte (like tilt) - returns highest variance byte
    - Otherwise: Prioritizes consecutive byte pairs (multi-byte values like coordinates)
    
    Args:
        analysis: Byte analysis results from analyze_bytes()
        max_bytes: Maximum number of bytes to return (1 for single-byte, 2+ for multi-byte)
        min_variance: Minimum variance threshold to filter out noise (default: 50)
        
    Returns:
        List of most significant ByteAnalysis objects
    """
    significant_bytes = [
        byte for byte in analysis if byte.variance > min_variance
    ]
    significant_bytes.sort(key=lambda b: b.variance, reverse=True)
    
    result: List[ByteAnalysis] = []
    used: Set[int] = set()
    
    # For single-byte detection (tilt), skip the pair logic and just return the top byte
    if max_bytes == 1:
        if significant_bytes:
            return [significant_bytes[0]]
        return []
    
    # First pass: Find consecutive byte pairs where at least ONE has high variance
    # This identifies multi-byte values (X, Y, pressure) which use 2 bytes each
    # For 16-bit values, the high byte may have low variance if the value doesn't exceed 255
    #
    # IMPORTANT: We iterate in byte order (low indices first) and pick the FIRST valid pair.
    # This matches the Node.js behavior and prevents high-variance bytes at later positions
    # (like tilt at bytes 8,9) from being incorrectly detected as coordinates (bytes 2,3).
    # The assumption is that coordinate bytes come before tilt bytes in the packet structure.
    for i in range(len(analysis) - 1):
        byte = analysis[i]
        next_byte = analysis[i + 1]
        
        if byte.byte_index in used or next_byte.byte_index in used:
            continue

        # Check if they're consecutive and at least one has high variance
        # The other byte should have at least SOME variance (> 0) to be part of the value
        if (next_byte.byte_index == byte.byte_index + 1 and
            (byte.variance > min_variance or next_byte.variance > min_variance) and
            byte.variance > 0 and
            next_byte.variance > 0):
            
            result.append(byte)
            result.append(next_byte)
            used.add(byte.byte_index)
            used.add(next_byte.byte_index)
            
            # For coordinate detection, we want just 1 pair (2 bytes)
            # This prevents detecting tilt bytes (8, 9) when looking for X (2, 3)
            if len(result) >= 2:
                break
    
    # If we found a pair, return it immediately (don't add more bytes from second pass)
    if len(result) >= max_bytes:
        return sorted(result, key=lambda b: b.byte_index)[:max_bytes]
    
    # Second pass: If we didn't find consecutive pairs, add single high-variance bytes
    # This handles single-byte values like tilt
    if len(result) == 0:
        for byte in significant_bytes:
            if byte.byte_index not in used:
                result.append(byte)
                used.add(byte.byte_index)
                
                if len(result) >= max_bytes:
                    break
    
    return sorted(result, key=lambda b: b.byte_index)[:max_bytes]



def get_byte_indices_from_analysis(bytes_list):
    """Extract and sort byte indices from ByteAnalysis list"""
    indices = [b.byte_index for b in bytes_list]
    indices.sort()
    return indices


def calculate_multi_byte_max(byte_indices, packets, debug=False):
    """Calculate maximum value from multi-byte data (little-endian)

    Args:
        byte_indices: Array of byte indices that form the multi-byte value
        packets: Raw HID packets to analyze
        debug: If True, logs debug information

    Returns:
        The maximum combined value observed across all packets
    """
    if not byte_indices or not packets:
        return 0

    max_combined_value = 0
    for packet in packets:
        combined_value = 0
        valid_packet = True

        for i, byte_index in enumerate(byte_indices):
            if byte_index >= len(packet):
                valid_packet = False
                break
            combined_value += packet[byte_index] << (i * 8)

        if valid_packet and combined_value > max_combined_value:
            max_combined_value = combined_value

    if max_combined_value > 0:
        return max_combined_value

    return 65535 if len(byte_indices) == 2 else 255


def calculate_bipolar_range(byte_index, packets):
    """Calculate bipolar range values from tilt data

    Tilt values are typically encoded as:
    - 0 = no tilt
    - 1 to positiveMax = positive tilt (e.g., 1-60)
    - negativeMin to 255 = negative tilt (e.g., 196-255, where 196 = 256-60)

    Args:
        byte_index: The byte index for the tilt value (can be int or list)
        packets: Raw HID packets to analyze

    Returns:
        Dict with positiveMax, negativeMin, negativeMax (camelCase keys)
    """
    if not packets:
        return {'positiveMax': 127, 'negativeMin': 128, 'negativeMax': 255}

    # Handle both int and list inputs
    if isinstance(byte_index, list):
        if not byte_index:
            return {'positiveMax': 127, 'negativeMin': 128, 'negativeMax': 255}
        byte_index = byte_index[0]

    values = set()
    for packet in packets:
        if byte_index < len(packet):
            values.add(packet[byte_index])

    if not values:
        return {'positiveMax': 127, 'negativeMin': 128, 'negativeMax': 255}

    positive_max = 0
    negative_min = 255
    negative_max = 128
    has_positive = False
    has_negative = False

    for value in values:
        if value == 0:
            continue

        if value < 128:
            has_positive = True
            if value > positive_max:
                positive_max = value
        else:
            has_negative = True
            if value < negative_min:
                negative_min = value
            if value > negative_max:
                negative_max = value

    if not has_positive:
        positive_max = 127
    if not has_negative:
        negative_min = 128
        negative_max = 255

    return {
        'positiveMax': positive_max,
        'negativeMin': negative_min,
        'negativeMax': negative_max
    }


def find_status_byte(packets, exclude_indices):
    """Find the status byte in HID packet"""
    if not packets:
        return None
    
    analysis = analyze_bytes(packets)
    
    for byte in analysis:
        if byte.byte_index in exclude_indices:
            continue
        
        if byte.variance > 0:
            distinct_values = set()
            for packet in packets:
                distinct_values.add(packet[byte.byte_index])
            
            if 2 <= len(distinct_values) <= 10:
                return byte.byte_index
    
    return None


def generate_device_config(step_data, device_info, user_metadata):
    """Generate complete device configuration from walkthrough data"""
    # This is a simplified version - full implementation would be more complex
    config = {
        'name': user_metadata.get('name', 'Unknown Device'),
        'manufacturer': user_metadata.get('manufacturer', 'Unknown'),
        'model': user_metadata.get('model', 'Unknown'),
        'description': user_metadata.get('description', ''),
        'vendorId': device_info.get('vendorId', '0x0000'),
        'productId': device_info.get('productId', '0x0000'),
        'deviceInfo': device_info,
        'reportId': device_info.get('reportId', 2),
        'digitizerUsagePage': 13,
        'capabilities': {
            'hasButtons': True,
            'buttonCount': 8,
            'hasPressure': True,
            'pressureLevels': 8192,
            'hasTilt': True,
            'resolution': {'x': 32768, 'y': 32768}
        },
        'byteCodeMappings': {}
    }
    return config