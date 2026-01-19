"""
Unit tests for WalkthroughEngine

Tests button status byte handling and config generation
"""

import pytest
from thelearningtablet.core.walkthrough_engine import WalkthroughEngine, WalkthroughEngineOptions
from thelearningtablet.core.walkthrough_types import UserMetadata, DeviceInfo


class TestButtonStatusByteHandling:
    """Tests for button status byte detection and config generation"""

    @pytest.fixture
    def engine(self):
        """Create a walkthrough engine instance"""
        return WalkthroughEngine(WalkthroughEngineOptions())

    @pytest.fixture
    def device_info(self):
        """Sample device info"""
        return DeviceInfo(
            vendor_id=0x28bd,
            product_id=0x2904,
            product_string='Test Tablet',
            usage_page=13,
            usage=2,
            interfaces=[13]
        )

    @pytest.fixture
    def user_metadata(self):
        """Sample user metadata"""
        return UserMetadata(
            name='Test Tablet',
            manufacturer='Test',
            model='Test Model',
            description='Test description',
            button_count=8
        )

    def test_driverless_button_status_bytes_included(self, engine, device_info, user_metadata):
        """
        Test that driverless button status bytes (0, 1, 3, 6) are included in generated config
        when buttons are detected with those status bytes
        """
        engine.set_device_info(device_info)
        engine.set_user_metadata(user_metadata)

        # Simulate button detection with driverless status byte (1)
        button_mappings = [
            {'buttonNumber': 1, 'statusByte': 1, 'scanCode': 5},
            {'buttonNumber': 2, 'statusByte': 1, 'scanCode': 8},
        ]
        engine.set_button_mappings(button_mappings)

        # Generate config
        engine.generate_config()
        config = engine.get_complete_config()

        # Assert status byte 1 is in the generated config
        status_values = config['byteCodeMappings']['status']['values']
        assert '1' in status_values, "Status byte 1 should be in config"
        assert status_values['1']['state'] == 'buttons'

        # All common driverless status bytes should be included
        for status_byte in ['0', '1', '3', '6']:
            assert status_byte in status_values, f"Status byte {status_byte} should be in config"

    def test_driver_mode_button_status_byte_240_included(self, engine, device_info, user_metadata):
        """
        REGRESSION TEST: Ensure status byte 240 is included when buttons are detected
        with driver-mode status byte.

        This was a bug where status 240 was not added to the config because it was
        missing from BUTTON_MODE_STATUS_MAP in set_button_mappings().
        """
        engine.set_device_info(device_info)
        engine.set_user_metadata(user_metadata)

        # Simulate button detection with driver-mode status byte (240)
        button_mappings = [
            {'buttonNumber': 1, 'statusByte': 240, 'scanCode': 1},
            {'buttonNumber': 2, 'statusByte': 240, 'scanCode': 2},
            {'buttonNumber': 3, 'statusByte': 240, 'scanCode': 4},
        ]
        engine.set_button_mappings(button_mappings)

        # Generate config
        engine.generate_config()
        config = engine.get_complete_config()

        # CRITICAL ASSERTION: Status byte 240 MUST be in the generated config
        status_values = config['byteCodeMappings']['status']['values']
        assert '240' in status_values, (
            "Status byte 240 (driver mode) MUST be in config! "
            "Without this, buttons won't be detected in the viewer when driver is active."
        )
        assert status_values['240']['state'] == 'buttons'

    def test_mixed_status_bytes_all_included(self, engine, device_info, user_metadata):
        """
        Test that when buttons are detected with BOTH driverless (1, 3, 6) and
        driver-mode (240) status bytes, ALL are included in the config.

        This ensures a universal config that works in both modes.
        """
        engine.set_device_info(device_info)
        engine.set_user_metadata(user_metadata)

        # Simulate mixed button detection (some with status 1, some with 240)
        button_mappings = [
            {'buttonNumber': 1, 'statusByte': 1, 'scanCode': 5},
            {'buttonNumber': 2, 'statusByte': 240, 'scanCode': 2},
            {'buttonNumber': 3, 'statusByte': 3, 'scanCode': 29},
            {'buttonNumber': 4, 'statusByte': 240, 'scanCode': 8},
        ]
        engine.set_button_mappings(button_mappings)

        # Generate config
        engine.generate_config()
        config = engine.get_complete_config()

        status_values = config['byteCodeMappings']['status']['values']

        # Both driverless and driver mode status bytes should be present
        assert '1' in status_values, "Driverless status byte 1 should be in config"
        assert '3' in status_values, "Driverless status byte 3 should be in config"
        assert '240' in status_values, "Driver mode status byte 240 should be in config"

        # All should map to buttons state
        assert status_values['1']['state'] == 'buttons'
        assert status_values['3']['state'] == 'buttons'
        assert status_values['240']['state'] == 'buttons'

    def test_button_mode_status_map_includes_240(self, engine, device_info, user_metadata):
        """
        Verify the BUTTON_MODE_STATUS_MAP constant includes 240.
        This is a direct check to prevent regression.
        """
        # Set up minimal data needed to call set_button_mappings
        engine.set_device_info(device_info)
        engine.set_user_metadata(user_metadata)

        # Call with a single button using status 240
        engine.set_button_mappings([
            {'buttonNumber': 1, 'statusByte': 240, 'scanCode': 1}
        ])

        # Check that 240 was added to status_byte_values
        assert 240 in engine.status_byte_values, (
            "Status byte 240 should be in engine.status_byte_values after set_button_mappings()"
        )
        assert engine.status_byte_values[240]['state'] == 'buttons'

    def test_config_works_with_viewer_simulation(self, engine, device_info, user_metadata):
        """
        End-to-end test: Generate a config with driver-mode buttons,
        then verify it can correctly identify button packets.
        """
        from thelearningtablet.core.data_helpers import process_device_data

        engine.set_device_info(device_info)
        engine.set_user_metadata(user_metadata)

        # Simulate driver-mode button detection
        button_mappings = [
            {'buttonNumber': i, 'statusByte': 240, 'scanCode': 1 << (i - 1)}
            for i in range(1, 9)
        ]
        engine.set_button_mappings(button_mappings)

        # Generate config
        engine.generate_config()
        config = engine.get_complete_config()

        # Simulate a driver-mode button packet
        # Packet: [report_id, status_byte, button_data, ...]
        test_packet = bytes([2, 240, 4, 0, 0, 0, 0, 0, 0, 0])  # Button 3 (bit-flag 4)

        # Process the packet using the generated config
        result = process_device_data(test_packet, config['byteCodeMappings'])

        # The packet should be recognized as button mode
        assert result.get('state') == 'buttons', (
            f"Packet with status 240 should be recognized as 'buttons' state, got: {result.get('state')}"
        )

        # Button 3 should be detected
        assert result.get('tabletButtons') == 3, (
            f"Button 3 should be detected, got: {result.get('tabletButtons')}"
        )
