"""
Unit tests for byte_detector module

Tests byte analysis and detection algorithms.
"""

import pytest
from thelearningtablet.core.byte_detector import (
    analyze_bytes,
    get_best_guess_bytes_by_variance,
    calculate_multi_byte_max,
    calculate_bipolar_range,
    find_status_byte,
)


class TestAnalyzeBytes:
    """Tests for analyze_bytes function"""
    
    def test_analyze_simple_packets(self):
        """Should analyze simple packet data"""
        packets = [
            bytes([0, 10, 20, 30]),
            bytes([0, 15, 25, 35]),
            bytes([0, 20, 30, 40]),
        ]
        
        analysis = analyze_bytes(packets)
        
        assert len(analysis) == 4
        assert analysis[0].byte_index == 0
        assert analysis[0].min == 0
        assert analysis[0].max == 0
        assert analysis[0].variance == 0
        
        assert analysis[1].min == 10
        assert analysis[1].max == 20
        assert analysis[1].variance == 10
    
    def test_handle_empty_packets(self):
        """Should handle empty packet list"""
        packets = []
        analysis = analyze_bytes(packets)
        
        assert analysis == []
    
    def test_calculate_variance_correctly(self):
        """Should calculate variance correctly"""
        packets = [
            bytes([0, 0, 255]),
            bytes([0, 128, 128]),
            bytes([0, 255, 0]),
        ]
        
        analysis = analyze_bytes(packets)
        
        assert analysis[1].variance == 255  # 0 to 255
        assert analysis[2].variance == 255  # 0 to 255


class TestGetBestGuessBytesByVariance:
    """Tests for get_best_guess_bytes_by_variance function"""
    
    def test_find_single_high_variance_byte(self):
        """Should find single high-variance byte"""
        packets = [
            bytes([0, 10, 20, 30]),
            bytes([0, 100, 25, 35]),
            bytes([0, 200, 30, 40]),
        ]
        
        analysis = analyze_bytes(packets)
        result = get_best_guess_bytes_by_variance(analysis, max_bytes=1, min_variance=50)
        
        assert len(result) == 1
        assert result[0].byte_index == 1  # Highest variance
    
    def test_find_consecutive_byte_pairs(self):
        """Should find high-variance bytes"""
        packets = [
            bytes([2, 10, 20, 5, 100]),
            bytes([2, 50, 60, 5, 150]),
            bytes([2, 100, 120, 5, 200]),
        ]

        analysis = analyze_bytes(packets)
        result = get_best_guess_bytes_by_variance(analysis, max_bytes=3, min_variance=50)

        # Should find bytes with variance >= 50 (bytes 1, 2, and 4)
        assert len(result) >= 2
        # At least one result should have high variance
        assert any(b.variance >= 50 for b in result)
    
    def test_filter_by_min_variance(self):
        """Should filter out low-variance bytes"""
        packets = [
            bytes([0, 5, 200, 10]),
            bytes([0, 6, 250, 11]),
            bytes([0, 7, 100, 12]),
        ]
        
        analysis = analyze_bytes(packets)
        result = get_best_guess_bytes_by_variance(analysis, max_bytes=3, min_variance=50)
        
        # Only byte 2 has variance > 50
        assert len(result) <= 2


class TestCalculateMultiByteMax:
    """Tests for calculate_multi_byte_max function"""
    
    def test_calculate_two_byte_max(self):
        """Should calculate max from two-byte values"""
        packets = [
            bytes([0, 0x34, 0x12, 0]),  # 0x1234 = 4660
            bytes([0, 0xFF, 0x00, 0]),  # 0x00FF = 255
            bytes([0, 0x00, 0x01, 0]),  # 0x0100 = 256
        ]
        
        max_val = calculate_multi_byte_max([1, 2], packets)
        
        assert max_val == 4660
    
    def test_return_default_for_empty_packets(self):
        """Should return default for empty packets"""
        packets = []
        max_val = calculate_multi_byte_max([1, 2], packets)
        
        assert max_val == 0
    
    def test_return_default_for_all_zeros(self):
        """Should return sensible default for all zeros"""
        packets = [
            bytes([0, 0, 0, 0]),
            bytes([0, 0, 0, 0]),
        ]
        
        max_val = calculate_multi_byte_max([1, 2], packets)
        
        assert max_val == 65535  # 16-bit default


class TestCalculateBipolarRange:
    """Tests for calculate_bipolar_range function"""
    
    def test_calculate_tilt_range(self):
        """Should calculate bipolar range for tilt data"""
        packets = [
            bytes([0, 0, 0]),    # Neutral
            bytes([0, 30, 0]),   # Positive
            bytes([0, 60, 0]),   # Max positive
            bytes([0, 226, 0]),  # Negative (256-30)
            bytes([0, 196, 0]),  # Max negative (256-60)
        ]
        
        result = calculate_bipolar_range(1, packets)
        
        assert result['positiveMax'] == 60
        assert result['negativeMin'] == 196
        assert result['negativeMax'] == 226
    
    def test_return_defaults_for_empty_packets(self):
        """Should return defaults for empty packets"""
        packets = []
        result = calculate_bipolar_range(1, packets)
        
        assert result['positiveMax'] == 127
        assert result['negativeMin'] == 128
        assert result['negativeMax'] == 255


class TestFindStatusByte:
    """Tests for find_status_byte function"""
    
    def test_find_status_byte_with_discrete_values(self):
        """Should find status byte with discrete values"""
        packets = [
            bytes([0, 160, 100, 200]),  # Status byte at index 1
            bytes([0, 161, 105, 205]),
            bytes([0, 160, 110, 210]),
            bytes([0, 162, 115, 215]),
        ]
        
        exclude = {2, 3}  # Exclude coordinate bytes
        result = find_status_byte(packets, exclude)
        
        assert result == 1
    
    def test_return_none_for_no_suitable_byte(self):
        """Should return None when no suitable status byte found"""
        packets = [
            bytes([0, 0, 0, 0]),
            bytes([0, 0, 0, 0]),
        ]
        
        exclude = set()
        result = find_status_byte(packets, exclude)
        
        assert result is None
    
    def test_exclude_specified_indices(self):
        """Should exclude specified indices from search"""
        packets = [
            bytes([0, 160, 100, 200]),
            bytes([0, 161, 105, 205]),
            bytes([0, 160, 110, 210]),
        ]
        
        exclude = {1}  # Exclude the actual status byte
        result = find_status_byte(packets, exclude)
        
        # Should not return index 1
        assert result != 1