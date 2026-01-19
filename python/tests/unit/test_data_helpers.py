"""
Unit tests for data_helpers module

Tests the core data parsing functions that interpret HID bytes.
"""

import pytest
from blankslate.core.data_helpers import (
    parse_code,
    parse_range_data,
    parse_multi_byte_range_data,
    parse_bipolar_range_data,
    parse_bit_flags,
)


class TestParseCode:
    """Tests for parse_code function"""

    def test_parse_known_code_values(self):
        """Should parse known code values"""
        data = bytes([0, 160, 0])
        values = {
            '160': {'state': 'stylus', 'mode': 'active'},
            '2': {'state': 'buttons'},
        }

        result = parse_code(data, 1, values)
        assert result == {'state': 'stylus', 'mode': 'active'}

    def test_return_byte_value_for_unknown_codes(self):
        """Should return byte value for unknown codes"""
        data = bytes([0, 99, 0])
        values = {'160': {'state': 'stylus'}}

        result = parse_code(data, 1, values)
        assert result == '99'

    def test_handle_out_of_bounds_index(self):
        """Should handle out of bounds index"""
        data = bytes([0, 160])
        values = {'160': {'state': 'stylus'}}

        result = parse_code(data, 5, values)
        assert result is None

    def test_handle_empty_values_map(self):
        """Should handle empty values map"""
        data = bytes([0, 160])
        values = {}

        result = parse_code(data, 1, values)
        assert result == '160'


class TestParseRangeData:
    """Tests for parse_range_data function"""

    def test_normalize_byte_value_to_0_1_range(self):
        """Should normalize byte value to 0-1 range"""
        data = bytes([0, 128, 0])
        result = parse_range_data(data, 1, 0, 255)

        assert abs(result - 0.502) < 0.01

    def test_return_0_for_minimum_value(self):
        """Should return 0 for minimum value"""
        data = bytes([0, 0, 0])
        result = parse_range_data(data, 1, 0, 255)

        assert result == 0

    def test_return_1_for_maximum_value(self):
        """Should return 1 for maximum value"""
        data = bytes([0, 255, 0])
        result = parse_range_data(data, 1, 0, 255)

        assert result == 1

    def test_handle_custom_ranges(self):
        """Should handle custom ranges"""
        data = bytes([0, 150, 0])
        result = parse_range_data(data, 1, 100, 200)

        assert abs(result - 0.5) < 0.01

    def test_return_0_for_out_of_bounds_index(self):
        """Should return 0 for out of bounds index"""
        data = bytes([0, 128])
        result = parse_range_data(data, 5, 0, 255)

        assert result == 0


class TestParseMultiByteRangeData:
    """Tests for parse_multi_byte_range_data function"""

    def test_parse_two_byte_little_endian(self):
        """Should parse two-byte little-endian values"""
        # 0x1234 = 4660 in decimal
        # Little endian: low byte first, high byte second
        data = bytes([0, 0x34, 0x12, 0])  # bytes at index 1,2
        result = parse_multi_byte_range_data(data, [1, 2], 0, 65535)

        expected = 4660 / 65535
        assert abs(result - expected) < 0.001

    def test_return_0_for_zero_value(self):
        """Should return 0 for zero value"""
        data = bytes([0, 0, 0, 0])
        result = parse_multi_byte_range_data(data, [1, 2], 0, 65535)

        assert result == 0

    def test_return_1_for_maximum_value(self):
        """Should return 1 for maximum value"""
        data = bytes([0, 0xFF, 0xFF, 0])
        result = parse_multi_byte_range_data(data, [1, 2], 0, 65535)

        assert result == 1

    def test_handle_three_byte_values(self):
        """Should handle three-byte values"""
        # 0x123456 = 1193046 in decimal
        data = bytes([0, 0x56, 0x34, 0x12, 0])
        result = parse_multi_byte_range_data(data, [1, 2, 3], 0, 16777215)

        expected = 1193046 / 16777215
        assert abs(result - expected) < 0.001

    def test_return_0_for_out_of_bounds(self):
        """Should return 0 for out of bounds indices"""
        data = bytes([0, 0x34, 0x12])
        result = parse_multi_byte_range_data(data, [5, 6], 0, 65535)

        assert result == 0





class TestParseBipolarRangeData:
    """Tests for parse_bipolar_range_data function"""

    def test_parse_positive_tilt(self):
        """Should parse positive tilt values"""
        data = bytes([0, 30, 0])  # Positive tilt
        result = parse_bipolar_range_data(data, 1, 0, 60, 196, 255)

        # 30 out of 60 = 0.5
        assert abs(result - 0.5) < 0.01

    def test_parse_negative_tilt(self):
        """Should parse negative tilt values"""
        data = bytes([0, 226, 0])  # Negative tilt (226 = 256 - 30)
        result = parse_bipolar_range_data(data, 1, 0, 60, 196, 255)

        # Should be negative
        assert result < 0
        assert abs(result - (-0.5)) < 0.01

    def test_return_0_for_neutral_position(self):
        """Should return 0 for neutral position"""
        data = bytes([0, 0, 0])
        result = parse_bipolar_range_data(data, 1, 0, 60, 196, 255)

        assert result == 0


class TestParseBitFlags:
    """Tests for parse_bit_flags function"""

    def test_parse_single_button(self):
        """Should parse single button press"""
        data = bytes([0, 0b00000001, 0])  # Button 1
        result = parse_bit_flags(data, 1, 8)

        assert result == {
            'button1': True,
            'button2': False,
            'button3': False,
            'button4': False,
            'button5': False,
            'button6': False,
            'button7': False,
            'button8': False,
        }

    def test_parse_multiple_buttons(self):
        """Should parse multiple button presses"""
        data = bytes([0, 0b00000101, 0])  # Buttons 1 and 3
        result = parse_bit_flags(data, 1, 8)

        assert result['button1'] is True
        assert result['button2'] is False
        assert result['button3'] is True

    def test_parse_no_buttons(self):
        """Should parse no buttons pressed"""
        data = bytes([0, 0b00000000, 0])
        result = parse_bit_flags(data, 1, 8)

        assert all(not v for v in result.values())

    def test_parse_all_buttons(self):
        """Should parse all buttons pressed"""
        data = bytes([0, 0b11111111, 0])
        result = parse_bit_flags(data, 1, 8)

        assert all(v for v in result.values())