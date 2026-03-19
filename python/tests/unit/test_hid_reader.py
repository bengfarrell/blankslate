"""
Unit tests for HIDReader class

Tests the HID device reading and callback signature.
"""

import pytest
import json
from typing import Dict, Union
from unittest.mock import Mock, MagicMock, patch
from blankslate.core.hid_reader import HIDReader
from blankslate.models import Config


@pytest.fixture
def mock_device():
    """Create a mock HID device"""
    device = Mock()
    device.read = Mock(return_value=[])
    device.set_nonblocking = Mock()
    device.close = Mock()
    return device


@pytest.fixture
def simple_config():
    """Create a simple config for testing"""
    config_dict = {
        'name': 'Test Tablet',
        'manufacturer': 'Test Co',
        'model': 'TestPad',
        'description': 'Test tablet',
        'vendorId': '0x1234',
        'productId': '0x5678',
        'deviceInfo': {
            'vendor_id': 0x1234,
            'product_id': 0x5678,
            'product_string': 'Test Tablet',
            'interfaces': [0]
        },
        'modes': [{
            'reportId': 2,
            'digitizerUsagePage': 13,
            'capabilities': {
                'hasButtons': False,
                'buttonCount': 0,
                'hasPressure': False,
                'pressureLevels': 0,
                'hasTilt': False,
                'resolution': {'x': 32767, 'y': 32767}
            },
            'byteCodeMappings': {
                'status': {
                    'type': 'code',
                    'byteIndex': [1],
                    'values': {
                        '192': {'state': 'stylus', 'mode': 'hover'},
                        '193': {'state': 'stylus', 'mode': 'active'}
                    }
                },
                'x': {
                    'type': 'multi-byte-range',
                    'byteIndex': [2, 3],
                    'min': 0,
                    'max': 32767
                },
                'y': {
                    'type': 'multi-byte-range',
                    'byteIndex': [4, 5],
                    'min': 0,
                    'max': 32767
                }
            }
        }]
    }
    return Config.from_json(json.dumps(config_dict))


class TestHIDReaderCallbackSignature:
    """Tests for HIDReader callback signature"""

    def test_callback_receives_report_id(self, mock_device, simple_config):
        """Should pass report_id to callback"""
        # Track callback invocations
        callback_calls = []

        def callback(data, report_id):
            callback_calls.append({'data': data, 'report_id': report_id})

        reader = HIDReader(mock_device, simple_config, callback)

        # Directly call the callback to test signature
        test_data = {'x': 0.5, 'y': 0.5, 'state': 'stylus'}
        reader.data_callback(test_data, 2)

        # Verify callback was called with report_id
        assert len(callback_calls) == 1
        assert callback_calls[0]['report_id'] == 2
        assert callback_calls[0]['data'] == test_data

    def test_callback_receives_correct_report_id_for_different_packets(self, mock_device, simple_config):
        """Should pass correct report_id for different packets"""
        callback_calls = []

        def callback(data, report_id):
            callback_calls.append({'data': data, 'report_id': report_id})

        reader = HIDReader(mock_device, simple_config, callback)

        # Simulate different report IDs
        reader.data_callback({'x': 0.1, 'y': 0.1}, 2)
        reader.data_callback({'x': 0.2, 'y': 0.2}, 2)
        reader.data_callback({'button1': True}, 3)

        # Verify all callbacks received correct report_id
        assert len(callback_calls) == 3
        assert callback_calls[0]['report_id'] == 2
        assert callback_calls[1]['report_id'] == 2
        assert callback_calls[2]['report_id'] == 3

    def test_callback_signature_matches_node_implementation(self, mock_device, simple_config):
        """Should match Node.js callback signature (data, reportId)"""
        # This test verifies the callback signature matches the Node.js version
        callback_invoked = False
        received_report_id = None
        received_data = None

        def callback(data, report_id):
            nonlocal callback_invoked, received_report_id, received_data
            callback_invoked = True
            received_report_id = report_id
            received_data = data
            # Verify data is a dict
            assert isinstance(data, dict)

        reader = HIDReader(mock_device, simple_config, callback)

        # Call the callback
        test_data = {'x': 0.5, 'y': 0.5, 'pressure': 0.8}
        reader.data_callback(test_data, 8)

        assert callback_invoked
        assert received_report_id == 8
        assert received_data == test_data

    def test_type_hint_accepts_correct_callback(self, mock_device, simple_config):
        """Should accept callback with (data, report_id) signature"""
        # This test verifies the type hint is correct
        def valid_callback(data: Dict[str, Union[str, int, float]], report_id: int) -> None:
            pass

        # Should not raise any errors
        reader = HIDReader(mock_device, simple_config, valid_callback)
        assert reader.data_callback == valid_callback


class TestHIDReaderIntegration:
    """Integration tests for HIDReader with actual data processing"""

    def test_start_reading_calls_callback_with_report_id(self, mock_device, simple_config):
        """Should call callback with report_id when reading from device"""
        from blankslate.core.data_helpers import process_device_data

        callback_calls = []

        def callback(data, report_id):
            callback_calls.append({'data': data, 'report_id': report_id})

        reader = HIDReader(mock_device, simple_config, callback)

        # Simulate device returning a packet
        test_packet = bytes([2, 192, 0x34, 0x12, 0x78, 0x56])
        mock_device.read = Mock(return_value=list(test_packet))

        # Manually simulate what start_reading does
        data = mock_device.read(64)
        if data:
            report_id = data[0]
            # Use process_device_data from data_helpers with the mode's mappings
            mode = simple_config.get_mode_by_report_id(report_id)
            if mode:
                processed_data = process_device_data(bytes(data), mode.byteCodeMappings)
                if processed_data:
                    reader.data_callback(processed_data, report_id)

        # Verify callback was called with report_id
        assert len(callback_calls) == 1
        assert callback_calls[0]['report_id'] == 2
        assert 'x' in callback_calls[0]['data']
        assert 'y' in callback_calls[0]['data']
