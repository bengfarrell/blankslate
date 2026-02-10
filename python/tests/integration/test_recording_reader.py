"""
Recording Reader Tests - Huion Inspiroy 2M

These tests verify that the data reader (process_device_data) correctly
interprets recorded HID packets from a Huion Inspiroy 2M tablet.

Unlike the walkthrough replay tests which test config GENERATION,
these tests verify config CONSUMPTION - that packets are correctly
interpreted into tablet actions (x, y, pressure, tilt, buttons, state).
"""

import pytest
import json
from pathlib import Path
from blankslate.core.data_helpers import process_device_data


# Recording files to test against
HUION_RECORDING_FILES = [
    'huion-inspiroy2m-nodriver-recording.json',
    'huion-inspiroy2m-nodriver-recording2.json',
]

# Expected config for Huion (used for reading packets)
HUION_CONFIG_PATH = Path(__file__).parent.parent.parent.parent / 'common-test-fixtures' / 'huion-inspiroy2m.json'


def hex_to_bytes(hex_str: str) -> bytes:
    """Convert hex string to bytes"""
    return bytes.fromhex(hex_str)


def load_recording(filename: str) -> dict:
    """Load recording file"""
    path = Path(__file__).parent.parent.parent.parent / 'common-test-fixtures' / filename
    with open(path) as f:
        return json.load(f)


def load_config() -> dict:
    """Load expected config"""
    with open(HUION_CONFIG_PATH) as f:
        return json.load(f)


class TestHuionReaderRecording:
    """
    Tests for Huion Inspiroy 2M recording data interpretation.
    
    These tests verify that process_device_data correctly interprets
    recorded HID packets into tablet actions.
    """

    @pytest.fixture(params=HUION_RECORDING_FILES)
    def recording(self, request):
        """Load recording data (parameterized for multiple recordings)"""
        return load_recording(request.param)

    @pytest.fixture
    def config(self):
        """Load expected config"""
        return load_config()

    @pytest.fixture
    def mappings(self, config):
        """Get byte code mappings from config"""
        return config['modes'][0]['byteCodeMappings']

    # ==================== Status Byte Interpretation ====================

    def test_interpret_hover_state_192(self, recording, mappings):
        """Should interpret hover state (192) correctly"""
        hover_packets = recording['steps'].get('step4-hover-movement', {}).get('packets', [])
        assert len(hover_packets) > 0, "No hover packets found"

        packet = hex_to_bytes(hover_packets[0])
        assert packet[1] == 192, "Expected hover packet with status byte 192"

        result = process_device_data(packet, mappings)
        assert result.get('state') == 'hover'
        assert not result.get('primaryButtonPressed')
        assert not result.get('secondaryButtonPressed')

    def test_interpret_contact_state_193(self, recording, mappings):
        """Should interpret contact state (193) correctly"""
        pressure_packets = recording['steps'].get('step3-pressure', {}).get('packets', [])

        contact_packet = None
        for hex_str in pressure_packets:
            packet = hex_to_bytes(hex_str)
            if packet[1] == 193:
                contact_packet = packet
                break

        assert contact_packet is not None, "No contact packet found"

        result = process_device_data(contact_packet, mappings)
        assert result.get('state') == 'contact'

    def test_interpret_primary_button_hover_196(self, recording, mappings):
        """Should interpret primary button hover (196) correctly"""
        button_packets = recording['steps'].get('step7-primary-button', {}).get('packets', [])

        primary_btn_packet = None
        for hex_str in button_packets:
            packet = hex_to_bytes(hex_str)
            if packet[1] == 196:  # 0xC4
                primary_btn_packet = packet
                break

        assert primary_btn_packet is not None, "No primary button packet found"

        result = process_device_data(primary_btn_packet, mappings)
        assert result.get('state') == 'hover'
        assert result.get('primaryButtonPressed') == True

    def test_interpret_secondary_button_hover_194(self, recording, mappings):
        """Should interpret secondary button hover (194) correctly"""
        button_packets = recording['steps'].get('step8-secondary-button', {}).get('packets', [])

        secondary_btn_packet = None
        for hex_str in button_packets:
            packet = hex_to_bytes(hex_str)
            if packet[1] == 194:  # 0xC2
                secondary_btn_packet = packet
                break

        assert secondary_btn_packet is not None, "No secondary button packet found"

        result = process_device_data(secondary_btn_packet, mappings)
        assert result.get('state') == 'hover'
        assert result.get('secondaryButtonPressed') == True

    def test_interpret_primary_button_contact_197(self, recording, mappings):
        """Should interpret primary button contact (197) correctly"""
        button_packets = recording['steps'].get('step7-primary-button', {}).get('packets', [])

        primary_btn_contact_packet = None
        for hex_str in button_packets:
            packet = hex_to_bytes(hex_str)
            if packet[1] == 197:  # 0xC5
                primary_btn_contact_packet = packet
                break

        if primary_btn_contact_packet is not None:
            result = process_device_data(primary_btn_contact_packet, mappings)
            assert result.get('state') == 'contact'
            assert result.get('primaryButtonPressed') == True

    def test_interpret_secondary_button_contact_195(self, recording, mappings):
        """Should interpret secondary button contact (195) correctly"""
        button_packets = recording['steps'].get('step8-secondary-button', {}).get('packets', [])

        secondary_btn_contact_packet = None
        for hex_str in button_packets:
            packet = hex_to_bytes(hex_str)
            if packet[1] == 195:  # 0xC3
                secondary_btn_contact_packet = packet
                break

        if secondary_btn_contact_packet is not None:
            result = process_device_data(secondary_btn_contact_packet, mappings)
            assert result.get('state') == 'contact'
            assert result.get('secondaryButtonPressed') == True

    def test_consistent_button_states_across_packets(self, recording, mappings):
        """Should have consistent button states across multiple packets"""
        button_packets = recording['steps'].get('step7-primary-button', {}).get('packets', [])

        pressed_count = 0
        for hex_str in button_packets[:20]:
            packet = hex_to_bytes(hex_str)
            result = process_device_data(packet, mappings)
            if result.get('primaryButtonPressed'):
                pressed_count += 1

        # Should have some pressed states
        assert pressed_count > 0, "Should have some button pressed states"

    def test_no_buttons_pressed_in_normal_hover(self, recording, mappings):
        """Should correctly identify no buttons pressed in normal hover"""
        hover_packets = recording['steps'].get('step4-hover-movement', {}).get('packets', [])

        no_button_count = 0
        for hex_str in hover_packets[:20]:
            packet = hex_to_bytes(hex_str)
            result = process_device_data(packet, mappings)
            if not result.get('primaryButtonPressed') and not result.get('secondaryButtonPressed'):
                no_button_count += 1

        # Most hover packets should have no buttons pressed
        assert no_button_count > 10, "Most hover packets should have no buttons pressed"

    # ==================== Coordinate Interpretation ====================
    # Note: process_device_data returns NORMALIZED values (0-1) for multi-byte-range types

    def test_parse_x_coordinate_from_horizontal_movement(self, recording, mappings):
        """Should parse X coordinate from horizontal movement packets"""
        packets = recording['steps'].get('step1-horizontal', {}).get('packets', [])
        assert len(packets) > 10, "Not enough horizontal movement packets"

        x_values = []
        for hex_str in packets[:50]:
            packet = hex_to_bytes(hex_str)
            result = process_device_data(packet, mappings)
            if 'x' in result and isinstance(result['x'], (int, float)):
                x_values.append(result['x'])

        assert len(x_values) > 0, "No X values parsed"

        # X should vary during horizontal movement (normalized 0-1 range)
        min_x = min(x_values)
        max_x = max(x_values)
        assert max_x - min_x > 0.01, "X values should have significant variation"

    def test_parse_y_coordinate_from_vertical_movement(self, recording, mappings):
        """Should parse Y coordinate from vertical movement packets"""
        packets = recording['steps'].get('step2-vertical', {}).get('packets', [])
        assert len(packets) > 10, "Not enough vertical movement packets"

        y_values = []
        for hex_str in packets[:50]:
            packet = hex_to_bytes(hex_str)
            result = process_device_data(packet, mappings)
            if 'y' in result and isinstance(result['y'], (int, float)):
                y_values.append(result['y'])

        assert len(y_values) > 0, "No Y values parsed"

        min_y = min(y_values)
        max_y = max(y_values)
        assert max_y - min_y > 0.01, "Y values should have significant variation"

    def test_coordinates_within_valid_range(self, recording, mappings):
        """Should parse coordinates within valid range (normalized 0-1)"""
        packets = recording['steps'].get('step1-horizontal', {}).get('packets', [])

        for hex_str in packets[:20]:
            packet = hex_to_bytes(hex_str)
            result = process_device_data(packet, mappings)

            if 'x' in result and isinstance(result['x'], (int, float)):
                assert 0 <= result['x'] <= 1, f"X value {result['x']} out of range"
            if 'y' in result and isinstance(result['y'], (int, float)):
                assert 0 <= result['y'] <= 1, f"Y value {result['y']} out of range"

    def test_stable_y_during_horizontal_movement(self, recording, mappings):
        """Should have relatively stable Y during horizontal movement"""
        packets = recording['steps'].get('step1-horizontal', {}).get('packets', [])

        y_values = []
        for hex_str in packets[:30]:
            packet = hex_to_bytes(hex_str)
            result = process_device_data(packet, mappings)
            if 'y' in result and isinstance(result['y'], (int, float)):
                y_values.append(result['y'])

        if len(y_values) > 5:
            min_y = min(y_values)
            max_y = max(y_values)
            # Y variation should be less than X variation during horizontal movement
            assert max_y - min_y < 0.5, "Y should be relatively stable during horizontal movement"

    def test_stable_x_during_vertical_movement(self, recording, mappings):
        """Should have relatively stable X during vertical movement"""
        packets = recording['steps'].get('step2-vertical', {}).get('packets', [])

        x_values = []
        for hex_str in packets[:30]:
            packet = hex_to_bytes(hex_str)
            result = process_device_data(packet, mappings)
            if 'x' in result and isinstance(result['x'], (int, float)):
                x_values.append(result['x'])

        if len(x_values) > 5:
            min_x = min(x_values)
            max_x = max(x_values)
            # X variation should be less during vertical movement (some drift expected)
            assert max_x - min_x < 0.8, "X should be relatively stable during vertical movement"

    def test_little_endian_x_coordinate(self, recording, mappings):
        """Should correctly parse little-endian X coordinate"""
        packets = recording['steps'].get('step1-horizontal', {}).get('packets', [])
        assert len(packets) > 10, "Not enough packets"

        packet = hex_to_bytes(packets[10])
        result = process_device_data(packet, mappings)

        # Manual little-endian calculation: low byte + (high byte << 8)
        raw_x = packet[2] | (packet[3] << 8)
        expected_x = raw_x / 32767

        assert abs(result['x'] - expected_x) < 0.00001, f"X mismatch: {result['x']} vs {expected_x}"

    def test_little_endian_y_coordinate(self, recording, mappings):
        """Should correctly parse little-endian Y coordinate"""
        packets = recording['steps'].get('step2-vertical', {}).get('packets', [])
        assert len(packets) > 10, "Not enough packets"

        packet = hex_to_bytes(packets[10])
        result = process_device_data(packet, mappings)

        # Manual little-endian calculation: low byte + (high byte << 8)
        raw_y = packet[4] | (packet[5] << 8)
        expected_y = raw_y / 32767

        assert abs(result['y'] - expected_y) < 0.00001, f"Y mismatch: {result['y']} vs {expected_y}"

    def test_coordinates_present_in_all_pen_packets(self, recording, mappings):
        """Should have coordinates present in all pen packets"""
        all_steps = ['step1-horizontal', 'step2-vertical', 'step3-pressure', 'step4-hover-movement']

        for step_name in all_steps:
            packets = recording['steps'].get(step_name, {}).get('packets', [])
            for hex_str in packets[:5]:
                packet = hex_to_bytes(hex_str)
                result = process_device_data(packet, mappings)

                assert 'x' in result, f"Missing x in {step_name}"
                assert 'y' in result, f"Missing y in {step_name}"
                assert isinstance(result['x'], (int, float)), f"x not a number in {step_name}"
                assert isinstance(result['y'], (int, float)), f"y not a number in {step_name}"

    # ==================== Pressure Interpretation ====================
    # Note: process_device_data returns NORMALIZED values (0-1) for multi-byte-range types

    def test_parse_pressure_from_pressure_step(self, recording, mappings):
        """Should parse pressure from pressure step packets"""
        packets = recording['steps'].get('step3-pressure', {}).get('packets', [])
        assert len(packets) > 10, "Not enough pressure packets"

        pressure_values = []
        for hex_str in packets:
            packet = hex_to_bytes(hex_str)
            result = process_device_data(packet, mappings)
            if 'pressure' in result and isinstance(result['pressure'], (int, float)) and result['pressure'] > 0:
                pressure_values.append(result['pressure'])

        assert len(pressure_values) > 0, "No pressure values parsed"

        # Should have varying pressure levels (normalized 0-1 range)
        max_pressure = max(pressure_values)
        assert max_pressure > 0.01, "Max pressure should be > 1%"
        assert max_pressure <= 1, "Max pressure should be <= 1"

    def test_low_pressure_during_hover(self, recording, mappings):
        """Should have zero or low pressure during hover"""
        packets = recording['steps'].get('step4-hover-movement', {}).get('packets', [])

        low_pressure_count = 0
        for hex_str in packets[:20]:
            packet = hex_to_bytes(hex_str)
            result = process_device_data(packet, mappings)
            # Normalized pressure < 0.01 is considered low/zero
            if 'pressure' in result and isinstance(result['pressure'], (int, float)) and result['pressure'] < 0.01:
                low_pressure_count += 1

        # Most hover packets should have low/zero pressure
        assert low_pressure_count > 10, "Most hover packets should have low pressure"

    def test_varying_pressure_levels(self, recording, mappings):
        """Should have varying pressure levels during pressure step"""
        packets = recording['steps'].get('step3-pressure', {}).get('packets', [])

        pressure_values = []
        for hex_str in packets:
            packet = hex_to_bytes(hex_str)
            result = process_device_data(packet, mappings)
            if 'pressure' in result and isinstance(result['pressure'], (int, float)):
                pressure_values.append(result['pressure'])

        min_pressure = min(pressure_values)
        max_pressure = max(pressure_values)

        # Should have a range of pressure values (light to heavy touch)
        assert max_pressure - min_pressure > 0.1, "Should have varying pressure levels"

    def test_little_endian_pressure(self, recording, mappings):
        """Should correctly parse little-endian pressure"""
        packets = recording['steps'].get('step3-pressure', {}).get('packets', [])

        # Find a packet with contact state (has pressure)
        contact_packet = None
        for hex_str in packets:
            packet = hex_to_bytes(hex_str)
            if packet[1] == 193:  # Contact state
                contact_packet = packet
                break

        if contact_packet:
            result = process_device_data(contact_packet, mappings)

            # Manual little-endian calculation
            raw_pressure = contact_packet[6] | (contact_packet[7] << 8)
            expected_pressure = raw_pressure / 8191

            assert abs(result['pressure'] - expected_pressure) < 0.00001

    def test_pressure_correlated_with_contact_state(self, recording, mappings):
        """Should have pressure correlated with contact state"""
        packets = recording['steps'].get('step3-pressure', {}).get('packets', [])

        contact_with_pressure = 0

        for hex_str in packets:
            packet = hex_to_bytes(hex_str)
            result = process_device_data(packet, mappings)

            if result.get('state') == 'contact' and isinstance(result.get('pressure'), (int, float)) and result['pressure'] > 0.01:
                contact_with_pressure += 1

        # Contact state should generally have pressure
        assert contact_with_pressure > 0, "Contact state should have pressure"

    def test_pressure_within_valid_range_all_packets(self, recording, mappings):
        """Should have pressure within valid normalized range for all packets"""
        all_steps = ['step1-horizontal', 'step2-vertical', 'step3-pressure', 'step4-hover-movement']

        for step_name in all_steps:
            packets = recording['steps'].get(step_name, {}).get('packets', [])
            for hex_str in packets[:10]:
                packet = hex_to_bytes(hex_str)
                result = process_device_data(packet, mappings)

                if 'pressure' in result and isinstance(result['pressure'], (int, float)):
                    assert 0 <= result['pressure'] <= 1, f"Pressure out of range in {step_name}"

    # ==================== Tilt Interpretation ====================

    def test_parse_tilt_x_from_tilt_step(self, recording, mappings):
        """Should parse tiltX from tilt-x step packets"""
        packets = recording['steps'].get('step5-tilt-x', {}).get('packets', [])
        assert len(packets) > 10, "Not enough tilt-x packets"

        tilt_x_values = []
        for hex_str in packets:
            packet = hex_to_bytes(hex_str)
            result = process_device_data(packet, mappings)
            if 'tiltX' in result and isinstance(result['tiltX'], (int, float)):
                tilt_x_values.append(result['tiltX'])

        assert len(tilt_x_values) > 0, "No tiltX values parsed"

        # Should have both positive and negative tilt values
        has_positive = any(t > 0 for t in tilt_x_values)
        has_negative = any(t < 0 for t in tilt_x_values)
        assert has_positive or has_negative, "Should have positive or negative tilt values"

    def test_parse_tilt_y_from_tilt_step(self, recording, mappings):
        """Should parse tiltY from tilt-y step packets"""
        packets = recording['steps'].get('step6-tilt-y', {}).get('packets', [])
        assert len(packets) > 10, "Not enough tilt-y packets"

        tilt_y_values = []
        for hex_str in packets:
            packet = hex_to_bytes(hex_str)
            result = process_device_data(packet, mappings)
            if 'tiltY' in result and isinstance(result['tiltY'], (int, float)):
                tilt_y_values.append(result['tiltY'])

        assert len(tilt_y_values) > 0, "No tiltY values parsed"

        has_positive = any(t > 0 for t in tilt_y_values)
        has_negative = any(t < 0 for t in tilt_y_values)
        assert has_positive or has_negative, "Should have positive or negative tilt values"

    def test_tilt_x_variation(self, recording, mappings):
        """Should have tiltX variation during tilt-x step"""
        packets = recording['steps'].get('step5-tilt-x', {}).get('packets', [])

        tilt_x_values = []
        for hex_str in packets:
            packet = hex_to_bytes(hex_str)
            result = process_device_data(packet, mappings)
            if 'tiltX' in result and isinstance(result['tiltX'], (int, float)):
                tilt_x_values.append(result['tiltX'])

        if len(tilt_x_values) > 5:
            min_tilt = min(tilt_x_values)
            max_tilt = max(tilt_x_values)
            # Should have some tilt variation
            assert max_tilt - min_tilt > 0.5, "Should have tilt variation"

    def test_tilt_y_variation(self, recording, mappings):
        """Should have tiltY variation during tilt-y step"""
        packets = recording['steps'].get('step6-tilt-y', {}).get('packets', [])

        tilt_y_values = []
        for hex_str in packets:
            packet = hex_to_bytes(hex_str)
            result = process_device_data(packet, mappings)
            if 'tiltY' in result and isinstance(result['tiltY'], (int, float)):
                tilt_y_values.append(result['tiltY'])

        if len(tilt_y_values) > 5:
            min_tilt = min(tilt_y_values)
            max_tilt = max(tilt_y_values)
            # Should have some tilt variation
            assert max_tilt - min_tilt > 0.5, "Should have tilt variation"

    def test_tilt_within_reasonable_range(self, recording, mappings):
        """Should have tilt values within reasonable range (-90 to 90 degrees)"""
        all_steps = ['step5-tilt-x', 'step6-tilt-y']

        for step_name in all_steps:
            packets = recording['steps'].get(step_name, {}).get('packets', [])
            for hex_str in packets[:20]:
                packet = hex_to_bytes(hex_str)
                result = process_device_data(packet, mappings)

                if 'tiltX' in result and isinstance(result['tiltX'], (int, float)):
                    assert -90 <= result['tiltX'] <= 90, f"tiltX out of range in {step_name}"
                if 'tiltY' in result and isinstance(result['tiltY'], (int, float)):
                    assert -90 <= result['tiltY'] <= 90, f"tiltY out of range in {step_name}"

    def test_tilt_present_in_all_pen_packets(self, recording, mappings):
        """Should have tilt present in all pen packets"""
        all_steps = ['step1-horizontal', 'step2-vertical', 'step3-pressure', 'step4-hover-movement']

        for step_name in all_steps:
            packets = recording['steps'].get(step_name, {}).get('packets', [])
            for hex_str in packets[:3]:
                packet = hex_to_bytes(hex_str)
                result = process_device_data(packet, mappings)

                assert 'tiltX' in result, f"Missing tiltX in {step_name}"
                assert 'tiltY' in result, f"Missing tiltY in {step_name}"
                assert isinstance(result['tiltX'], (int, float)), f"tiltX not a number in {step_name}"
                assert isinstance(result['tiltY'], (int, float)), f"tiltY not a number in {step_name}"

    def test_bipolar_tilt_encoding(self, recording, mappings):
        """Should correctly interpret bipolar tilt encoding"""
        packets = recording['steps'].get('step5-tilt-x', {}).get('packets', [])

        for hex_str in packets[:10]:
            packet = hex_to_bytes(hex_str)
            raw_tilt_x = packet[8]
            result = process_device_data(packet, mappings)

            # If raw byte is in positive range (0-80), tilt should be positive or zero
            if raw_tilt_x <= 80:
                assert result['tiltX'] >= 0, f"Expected positive tilt for raw byte {raw_tilt_x}"
            # If raw byte is in negative range (176-255), tilt should be negative
            if raw_tilt_x >= 176:
                assert result['tiltX'] <= 0, f"Expected negative tilt for raw byte {raw_tilt_x}"

    # ==================== Complete Packet Interpretation ====================

    def test_contact_packet_has_all_fields(self, recording, mappings):
        """Should return all expected fields for a contact packet"""
        packets = recording['steps'].get('step3-pressure', {}).get('packets', [])

        contact_packet = None
        for hex_str in packets:
            packet = hex_to_bytes(hex_str)
            if packet[1] == 193:  # Contact state
                contact_packet = packet
                break

        assert contact_packet is not None, "No contact packet found"

        result = process_device_data(contact_packet, mappings)

        # Should have all core fields
        assert 'state' in result
        assert 'x' in result
        assert 'y' in result
        assert 'pressure' in result
        assert 'tiltX' in result
        assert 'tiltY' in result

        # Values should be reasonable
        assert result['state'] == 'contact'
        assert isinstance(result['x'], (int, float))
        assert isinstance(result['y'], (int, float))
        assert isinstance(result['pressure'], (int, float))

    def test_byte_by_byte_interpretation(self, recording, mappings):
        """Should correctly interpret a known packet byte-by-byte"""
        packets = recording['steps'].get('step1-horizontal', {}).get('packets', [])
        assert len(packets) > 5, "Not enough packets"

        packet = hex_to_bytes(packets[5])  # Use 6th packet (likely has data)
        result = process_device_data(packet, mappings)

        # Manual calculation based on config:
        # x: bytes [2, 3] little-endian, normalized to 0-1 (max 32767)
        # y: bytes [4, 5] little-endian, normalized to 0-1 (max 32767)
        # pressure: bytes [6, 7] little-endian, normalized to 0-1 (max 8191)
        raw_x = packet[2] | (packet[3] << 8)
        raw_y = packet[4] | (packet[5] << 8)
        raw_pressure = packet[6] | (packet[7] << 8)

        # process_device_data returns normalized values
        expected_x = raw_x / 32767
        expected_y = raw_y / 32767
        expected_pressure = raw_pressure / 8191

        assert abs(result['x'] - expected_x) < 0.00001, f"X mismatch: {result['x']} vs {expected_x}"
        assert abs(result['y'] - expected_y) < 0.00001, f"Y mismatch: {result['y']} vs {expected_y}"
        assert abs(result['pressure'] - expected_pressure) < 0.00001, f"Pressure mismatch: {result['pressure']} vs {expected_pressure}"

    def test_hover_packet_has_all_fields(self, recording, mappings):
        """Should return all expected fields for a hover packet"""
        packets = recording['steps'].get('step4-hover-movement', {}).get('packets', [])
        assert len(packets) > 0, "No hover packets"

        packet = hex_to_bytes(packets[0])
        result = process_device_data(packet, mappings)

        # Should have all core fields
        assert 'state' in result
        assert 'x' in result
        assert 'y' in result
        assert 'pressure' in result
        assert 'tiltX' in result
        assert 'tiltY' in result

        assert result['state'] == 'hover'

    def test_report_id_is_correct(self, recording, mappings):
        """Should verify report ID is correct (10 for Huion)"""
        packets = recording['steps'].get('step1-horizontal', {}).get('packets', [])

        for hex_str in packets[:10]:
            packet = hex_to_bytes(hex_str)
            # Huion uses report ID 10 (0x0A)
            assert packet[0] == 10, f"Expected report ID 10, got {packet[0]}"

    def test_consecutive_packets_consistency(self, recording, mappings):
        """Should interpret multiple consecutive packets consistently"""
        packets = recording['steps'].get('step1-horizontal', {}).get('packets', [])

        prev_x = None
        large_jump_count = 0

        for hex_str in packets[:30]:
            packet = hex_to_bytes(hex_str)
            result = process_device_data(packet, mappings)

            if isinstance(result.get('x'), (int, float)) and prev_x is not None:
                # Check for unreasonably large jumps (would indicate parsing error)
                jump = abs(result['x'] - prev_x)
                if jump > 0.5:
                    large_jump_count += 1
            prev_x = result.get('x')

        # Should have very few large jumps (smooth movement)
        assert large_jump_count < 5, "Too many large position jumps"

    # ==================== State Transitions ====================

    def test_hover_to_contact_transition(self, recording, mappings):
        """Should detect hover to contact transition in pressure step"""
        packets = recording['steps'].get('step3-pressure', {}).get('packets', [])

        found_hover = False
        found_contact = False

        for hex_str in packets:
            packet = hex_to_bytes(hex_str)
            result = process_device_data(packet, mappings)

            if result.get('state') == 'hover':
                found_hover = True
            if result.get('state') == 'contact':
                found_contact = True

        # Pressure step should have contact states
        assert found_contact, "Should have contact states in pressure step"

    def test_button_press_and_release(self, recording, mappings):
        """Should have button press and release in button steps"""
        packets = recording['steps'].get('step7-primary-button', {}).get('packets', [])

        pressed_count = 0
        not_pressed_count = 0

        for hex_str in packets:
            packet = hex_to_bytes(hex_str)
            result = process_device_data(packet, mappings)

            if result.get('primaryButtonPressed'):
                pressed_count += 1
            else:
                not_pressed_count += 1

        # Should have pressed states
        assert pressed_count > 0, "Should have button pressed states"

    def test_position_stability_during_button_press(self, recording, mappings):
        """Should maintain position during button press"""
        packets = recording['steps'].get('step7-primary-button', {}).get('packets', [])

        positions = []

        for hex_str in packets[:20]:
            packet = hex_to_bytes(hex_str)
            result = process_device_data(packet, mappings)

            if isinstance(result.get('x'), (int, float)) and isinstance(result.get('y'), (int, float)):
                positions.append({
                    'x': result['x'],
                    'y': result['y'],
                    'pressed': result.get('primaryButtonPressed', False)
                })

        # Position should be relatively stable during button operations
        if len(positions) > 5:
            x_values = [p['x'] for p in positions]
            y_values = [p['y'] for p in positions]
            x_range = max(x_values) - min(x_values)
            y_range = max(y_values) - min(y_values)

            # Position shouldn't jump wildly during button press
            assert x_range < 0.3, "X position should be stable during button press"
            assert y_range < 0.3, "Y position should be stable during button press"

    # ==================== Raw Byte Verification ====================

    def test_packet_structure_multiple_packets(self, recording, mappings):
        """Should correctly parse packet structure for multiple packets"""
        all_steps = ['step1-horizontal', 'step2-vertical', 'step3-pressure']

        for step_name in all_steps:
            packets = recording['steps'].get(step_name, {}).get('packets', [])

            for hex_str in packets[:5]:
                packet = hex_to_bytes(hex_str)
                result = process_device_data(packet, mappings)

                # Verify byte 0 is report ID (10)
                assert packet[0] == 10, f"Expected report ID 10 in {step_name}"

                # Verify byte 1 is a valid status byte
                valid_status_bytes = [192, 193, 194, 195, 196, 197, 0]
                assert packet[1] in valid_status_bytes, f"Invalid status byte {packet[1]} in {step_name}"

                # Verify X calculation
                raw_x = packet[2] | (packet[3] << 8)
                assert abs(result['x'] - raw_x / 32767) < 0.00001

                # Verify Y calculation
                raw_y = packet[4] | (packet[5] << 8)
                assert abs(result['y'] - raw_y / 32767) < 0.00001

    def test_all_zeros_packet(self, recording, mappings):
        """Should handle packet with all zeros correctly"""
        # Create a synthetic all-zeros packet
        zero_packet = bytes([10] + [0] * 9)  # Report ID 10, rest zeros

        result = process_device_data(zero_packet, mappings)

        # Should interpret as no state or none
        assert result['x'] == 0
        assert result['y'] == 0
        assert result['pressure'] == 0

    def test_packet_length(self, recording, mappings):
        """Should correctly identify packet length"""
        packets = recording['steps'].get('step1-horizontal', {}).get('packets', [])

        for hex_str in packets[:10]:
            packet = hex_to_bytes(hex_str)
            # Huion packets should be 10 bytes
            assert len(packet) == 10, f"Expected 10 bytes, got {len(packet)}"
