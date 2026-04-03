"""
Recording Replay Button Tests

These tests replay real recorded button data from actual XP-Pen Deco 640 hardware
to verify that button detection works correctly with real-world data.

This provides an extra layer of protection against regressions in button handling.
"""

import json
import pytest
from pathlib import Path
from blankslate.cli.tablet_reader_base import TabletReaderBase
from blankslate.models.config import Config


# Path to common test fixtures
FIXTURES_DIR = Path(__file__).parent.parent.parent.parent / "common-test-fixtures"


class TestableTabletReader(TabletReaderBase):
    """Testable version of TabletReaderBase that doesn't require actual HID device"""

    def __init__(self, config_data):
        self.config_data = config_data
        self.current_mode = None
        self.detected_mode_from_button = False

    def start(self):
        """Not needed for testing"""
        pass

    def handle_packet(self, data):
        """Not needed for testing - we call process_packet directly"""
        pass
    
    def process_packet(self, data):
        """Process a single packet and return the result"""
        from blankslate.core.data_helpers import process_device_data
        
        # Convert hex string to bytes if needed
        if isinstance(data, str):
            data = bytes.fromhex(data)
        
        # Extract report ID
        if len(data) == 0:
            return {}
        
        report_id = data[0]
        
        # Try to find matching mode by report ID
        mode = None
        for m in self.config_data.modes:
            if m.reportId == report_id:
                mode = m
                break
        
        # If no mode found yet, try scan code matching for button packets
        if not mode and report_id == 6:  # Button interface report ID
            # Try to match scan code to a mode's button configuration
            if len(data) >= 3:
                scan_code = data[2]
                for m in self.config_data.modes:
                    tablet_buttons = m.byteCodeMappings.get('tabletButtons')
                    # Type field is now optional (defaults to 'code')
                    if tablet_buttons:
                        values = tablet_buttons.get('values', {})
                        if str(scan_code) in values:
                            mode = m
                            self.detected_mode_from_button = True
                            break
        
        # Set current mode if found
        if mode and not self.current_mode:
            self.current_mode = mode
        
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
def xp_pen_driverless_config():
    """Load the XP-Pen Deco 640 driverless config"""
    config_path = FIXTURES_DIR / "xp-pen-deco640-driverless.json"
    return Config.load(str(config_path))


@pytest.fixture
def xp_pen_driverless_recording():
    """Load the XP-Pen Deco 640 driverless recording"""
    recording_path = FIXTURES_DIR / "xp-pen-deco640-nodriver-recording.json"
    with open(recording_path, 'r') as f:
        return json.load(f)


class TestRecordingReplayButtons:
    """Test button detection using real recorded data"""
    
    def test_driverless_button_packets(self, xp_pen_driverless_config, xp_pen_driverless_recording):
        """Test that all button packets from real recording are parsed correctly"""
        reader = TestableTabletReader(xp_pen_driverless_config)
        
        # Get button packets from step9-tablet-buttons
        button_packets = xp_pen_driverless_recording['steps']['step9-tablet-buttons']['packets']
        
        # Expected button sequence based on scan codes in the recording:
        # Scan codes: 05, 08, 2f(47), 30(48), 56(86), 57(87), 1d(29)
        # These map to buttons: 1, 2, 3, 4, 5, 6, 7, 8 in driverless mode
        # Note: Scan code 29 (0x1d) maps to button 7 normally, but button 8 when status byte is 3
        expected_buttons = [
            (5, 1),   # Scan code 5 = button 1
            (8, 2),   # Scan code 8 = button 2
            (47, 3),  # Scan code 47 = button 3
            (48, 4),  # Scan code 48 = button 4
            (86, 5),  # Scan code 86 = button 5
            (87, 6),  # Scan code 87 = button 6
            (29, 7),  # Scan code 29 (status 0 or 1) = button 7
            (29, 8),  # Scan code 29 (status 3) = button 8 (statusOverrides)
        ]
        
        detected_buttons = set()
        
        for packet_hex in button_packets:
            packet = bytes.fromhex(packet_hex)
            
            # Skip release packets (scan code 0)
            if len(packet) >= 3 and packet[2] == 0:
                continue
            
            result = reader.process_packet(packet)
            
            # Check if a button was detected
            button_num = result.get('button') or result.get('tabletButtons')
            if button_num and button_num > 0:
                detected_buttons.add(button_num)
        
        # Should have detected all 8 buttons
        assert detected_buttons == {1, 2, 3, 4, 5, 6, 7, 8}, f"Expected buttons 1-8, got {detected_buttons}"

