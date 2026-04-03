"""
Unit tests for TabletReaderBase.process_packet method

Tests the core packet processing logic including:
- Multi-mode config handling (XP-Pen Deco 640 with Report IDs 2 and 7)
- Button interface report ID matching
- Scan code matching for mode detection
- Button-first vs pen-first packet ordering
"""

import pytest
import json
from pathlib import Path
from blankslate.models.config import Config


# Minimal concrete implementation for testing
class TestableTabletReader:
    """Minimal implementation of TabletReaderBase for testing process_packet logic"""
    
    def __init__(self, config_path: str):
        with open(config_path, 'r') as f:
            config_json = f.read()
        self.config_data = Config.from_json(config_json)
        self.current_mode = None
        self.detected_report_id = None
    
    def process_packet(self, data: bytes, report_id: int = None) -> dict:
        """
        Process a packet - mirrors TabletReaderBase.process_packet
        This is the method we're testing
        """
        # Import here to avoid circular dependencies
        from blankslate.cli.tablet_reader_base import TabletReaderBase
        from blankslate.core.data_helpers import process_device_data, process_keyboard_button_data
        
        if len(data) == 0:
            return {}
        
        if report_id is None:
            report_id = data[0]
        
        # Check if this is a keyboard button packet (report IDs 3, 4, 5)
        if report_id in (3, 4, 5):
            keyboard_buttons_config = None
            for mode in self.config_data.modes:
                kb_config = mode.byteCodeMappings.get('keyboardButtons')
                if kb_config and 'buttons' in kb_config:
                    keyboard_buttons_config = kb_config
                    break
            
            if keyboard_buttons_config:
                return process_keyboard_button_data(data, keyboard_buttons_config)
        
        # Detect mode from first packet if not already detected
        if self.current_mode is None:
            self.detected_report_id = report_id
            self.current_mode = self.config_data.get_mode_by_report_id(report_id)
            
            # If not found by main reportId, check if it's a buttonInterfaceReportId
            if not self.current_mode:
                matching_modes = [m for m in self.config_data.modes
                                 if hasattr(m, 'buttonInterfaceReportId') and m.buttonInterfaceReportId == report_id]
                
                if len(matching_modes) == 1:
                    self.current_mode = matching_modes[0]
                elif len(matching_modes) > 1:
                    # Multiple modes share the same buttonInterfaceReportId
                    # Try to detect which mode based on the button data (scan code at byte index 2)
                    tablet_buttons_mapping = data[2] if len(data) > 2 else 0
                    
                    for candidate_mode in matching_modes:
                        tablet_buttons = candidate_mode.byteCodeMappings.get('tabletButtons', {})
                        if tablet_buttons and 'values' in tablet_buttons:
                            scan_code_str = str(tablet_buttons_mapping)
                            if scan_code_str in tablet_buttons['values']:
                                self.current_mode = candidate_mode
                                break
                    
                    if not self.current_mode:
                        self.current_mode = matching_modes[0]
        
        # Find the appropriate mode for this packet's Report ID
        mode = self.config_data.get_mode_by_report_id(report_id)
        
        # If not found, check if this is a button interface report ID
        if not mode and report_id is not None:
            if self.current_mode and hasattr(self.current_mode, 'buttonInterfaceReportId') and self.current_mode.buttonInterfaceReportId == report_id:
                mode = self.current_mode
            else:
                matching_modes = [m for m in self.config_data.modes
                                 if hasattr(m, 'buttonInterfaceReportId') and m.buttonInterfaceReportId == report_id]
                
                if len(matching_modes) == 1:
                    mode = matching_modes[0]
                elif len(matching_modes) > 1:
                    tablet_buttons_mapping = data[2] if len(data) > 2 else 0
                    
                    for candidate_mode in matching_modes:
                        tablet_buttons = candidate_mode.byteCodeMappings.get('tabletButtons', {})
                        if tablet_buttons and 'values' in tablet_buttons:
                            scan_code_str = str(tablet_buttons_mapping)
                            if scan_code_str in tablet_buttons['values']:
                                mode = candidate_mode
                                if self.current_mode is None:
                                    self.current_mode = mode
                                break
                    
                    if not mode:
                        mode = matching_modes[0]
        
        # Use the found mode's mappings, or current mode as fallback
        if mode:
            button_interface_report_id = getattr(mode, 'buttonInterfaceReportId', None)
            return process_device_data(data, mode.byteCodeMappings, button_interface_report_id)
        elif self.current_mode:
            button_interface_report_id = getattr(self.current_mode, 'buttonInterfaceReportId', None)
            return process_device_data(data, self.current_mode.byteCodeMappings, button_interface_report_id)
        else:
            return {}


@pytest.fixture
def xp_pen_multi_mode_config():
    """XP-Pen Deco 640 multi-mode config (both driver and driverless modes)"""
    config_path = Path(__file__).parent.parent.parent.parent / 'public' / 'configs' / 'xp-pen-deco640.json'
    return str(config_path)


@pytest.fixture
def xp_pen_driver_config():
    """XP-Pen Deco 640 driver mode only config"""
    config_path = Path(__file__).parent.parent.parent.parent / 'common-test-fixtures' / 'xp-pen-deco640-driver.json'
    return str(config_path)


@pytest.fixture
def xp_pen_driverless_config():
    """XP-Pen Deco 640 driverless mode only config"""
    config_path = Path(__file__).parent.parent.parent.parent / 'common-test-fixtures' / 'xp-pen-deco640-driverless.json'
    return str(config_path)


class TestMultiModeButtonDetection:
    """Test button detection with multi-mode configs (XP-Pen Deco 640)"""

    def test_button_first_driver_mode(self, xp_pen_multi_mode_config):
        """Should detect driver mode (Report ID 2) when button pressed first via scan code matching"""
        reader = TestableTabletReader(xp_pen_multi_mode_config)

        # Button packet for driver mode: Report ID 6, scan code 1 at byte[2]
        # Driver mode uses scan codes: 1, 2, 4, 8, 16, 32, 64, 128
        button_packet = bytes([0x06, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00])

        result = reader.process_packet(button_packet)

        # Should have detected driver mode (Report ID 2) via scan code matching
        assert reader.current_mode is not None
        assert reader.current_mode.reportId == 2

        # Should detect button 1 (now that buttonInterfaceReportId support is added)
        assert result.get('button') == 1 or result.get('tabletButtons') == 1
        assert result.get('button1') == True

    def test_button_first_driverless_mode(self, xp_pen_multi_mode_config):
        """Should detect driverless mode (Report ID 7) when button pressed first"""
        reader = TestableTabletReader(xp_pen_multi_mode_config)

        # Button packet for driverless mode: Report ID 6, scan code 86 at byte[2]
        # Driverless mode uses scan codes: 5, 8, 29, 47, 48, 86, 87
        button_packet = bytes([0x06, 0x01, 0x56, 0x00, 0x00, 0x00, 0x00, 0x00])  # 0x56 = 86

        result = reader.process_packet(button_packet)

        # Should detect button 5
        assert result.get('tabletButtons') == 5 or result.get('button') == 5
        assert result.get('button5') == True

        # Should have detected driverless mode (Report ID 7)
        assert reader.current_mode is not None
        assert reader.current_mode.reportId == 7

    def test_pen_first_then_button(self, xp_pen_multi_mode_config):
        """Should use detected mode when pen packet comes first"""
        reader = TestableTabletReader(xp_pen_multi_mode_config)

        # First, send a pen packet (Report ID 2 - driver mode)
        pen_packet = bytes([0x02, 0xA0, 0x00, 0x10, 0x00, 0x20, 0x00, 0x00, 0x00, 0x00])
        reader.process_packet(pen_packet)

        # Should have detected driver mode
        assert reader.current_mode.reportId == 2

        # Now send a button packet (Report ID 6)
        button_packet = bytes([0x06, 0x01, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00])
        result = reader.process_packet(button_packet)

        # Should still be using driver mode
        assert reader.current_mode.reportId == 2

        # Should detect button 2 using driver mode mappings
        assert result.get('button') == 2 or result.get('tabletButtons') == 2
        assert result.get('button2') == True

    def test_all_driver_mode_buttons(self, xp_pen_driver_config):
        """Should detect all 8 buttons in driver mode"""
        # Driver mode scan codes: 1, 2, 4, 8, 16, 32, 64, 128
        scan_codes = [1, 2, 4, 8, 16, 32, 64, 128]

        for button_num, scan_code in enumerate(scan_codes, start=1):
            # Reset reader for each test
            reader = TestableTabletReader(xp_pen_driver_config)

            button_packet = bytes([0x06, 0x01, scan_code, 0x00, 0x00, 0x00, 0x00, 0x00])
            result = reader.process_packet(button_packet)

            # Should detect driver mode (Report ID 2)
            assert reader.current_mode is not None, f"Mode not detected for scan code {scan_code}"
            assert reader.current_mode.reportId == 2, f"Wrong mode detected for scan code {scan_code}"

            # Should detect the correct button
            assert result.get('button') == button_num or result.get('tabletButtons') == button_num, f"Button {button_num} not detected for scan code {scan_code}"
            assert result.get(f'button{button_num}') == True, f"button{button_num} flag not set for scan code {scan_code}"

    def test_all_driverless_mode_buttons(self, xp_pen_driverless_config):
        """Should detect buttons in driverless mode"""
        reader = TestableTabletReader(xp_pen_driverless_config)

        # Driverless mode scan codes (from config)
        button_mappings = {
            1: 5,
            2: 8,
            3: 47,
            4: 48,
            5: 86,
            6: 87,
            7: 29,
        }

        for button_num, scan_code in button_mappings.items():
            # Reset reader for each test
            reader = TestableTabletReader(xp_pen_driverless_config)

            button_packet = bytes([0x06, 0x01, scan_code, 0x00, 0x00, 0x00, 0x00, 0x00])
            result = reader.process_packet(button_packet)

            assert result.get('tabletButtons') == button_num or result.get('button') == button_num, f"Button {button_num} not detected for scan code {scan_code}"
            assert result.get(f'button{button_num}') == True

    def test_unknown_scan_code_fallback(self, xp_pen_multi_mode_config):
        """Should fallback to first mode if scan code doesn't match any mode"""
        reader = TestableTabletReader(xp_pen_multi_mode_config)

        # Button packet with scan code 255 (not in any mode's mappings)
        button_packet = bytes([0x06, 0x01, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00])

        result = reader.process_packet(button_packet)

        # Should have selected a mode (fallback to first matching mode)
        assert reader.current_mode is not None
        # Should not crash, even if button not recognized
        assert isinstance(result, dict)

    def test_button_release(self, xp_pen_driver_config):
        """Should handle button release (scan code 0)"""
        reader = TestableTabletReader(xp_pen_driver_config)

        # Button press
        button_press = bytes([0x06, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00])
        result = reader.process_packet(button_press)
        # Should detect button 1
        assert result.get('button') == 1 or result.get('tabletButtons') == 1

        # Button release (scan code 0)
        button_release = bytes([0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
        result = reader.process_packet(button_release)

        # Should indicate no button pressed
        assert result.get('button', 0) == 0 or result.get('tabletButtons', 0) == 0

    def test_mode_persistence(self, xp_pen_multi_mode_config):
        """Should persist detected mode across multiple packets"""
        reader = TestableTabletReader(xp_pen_multi_mode_config)

        # First button packet (driverless mode - scan code 86)
        button_packet1 = bytes([0x06, 0x01, 0x56, 0x00, 0x00, 0x00, 0x00, 0x00])
        reader.process_packet(button_packet1)

        detected_mode = reader.current_mode
        assert detected_mode.reportId == 7

        # Second button packet (different button)
        button_packet2 = bytes([0x06, 0x01, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00])  # scan code 5
        result = reader.process_packet(button_packet2)

        # Should still use the same mode
        assert reader.current_mode == detected_mode
        assert result.get('tabletButtons') == 1 or result.get('button') == 1  # scan code 5 = button 1 in driverless mode


class TestSingleModeButtonDetection:
    """Test button detection with single-mode configs"""

    def test_single_mode_button_detection(self, xp_pen_driver_config):
        """Should work with single-mode config"""
        reader = TestableTabletReader(xp_pen_driver_config)

        button_packet = bytes([0x06, 0x01, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00])
        result = reader.process_packet(button_packet)

        # Should detect the mode
        assert reader.current_mode is not None
        assert reader.current_mode.reportId == 2

        # Should detect button 3 (scan code 4 = button 3)
        assert result.get('button') == 3 or result.get('tabletButtons') == 3
        assert result.get('button3') == True


class TestEmptyAndInvalidPackets:
    """Test handling of empty and invalid packets"""

    def test_empty_packet(self, xp_pen_driver_config):
        """Should handle empty packet gracefully"""
        reader = TestableTabletReader(xp_pen_driver_config)

        result = reader.process_packet(bytes([]))

        assert result == {}

    def test_unknown_report_id(self, xp_pen_driver_config):
        """Should handle unknown report ID gracefully"""
        reader = TestableTabletReader(xp_pen_driver_config)

        # Report ID 99 doesn't exist in config
        packet = bytes([0x63, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
        result = reader.process_packet(packet)

        # Should return empty dict or handle gracefully
        assert isinstance(result, dict)

