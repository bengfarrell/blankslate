"""
Unit tests for config-based mock data generation
Tests that mock data correctly matches device configurations
"""

import pytest
import json
from pathlib import Path

from thelearningtablet.mockbytes import ConfigBasedGenerator, create_config_based_generator
from thelearningtablet.core.data_helpers import process_device_data


@pytest.fixture
def test_config_path():
    """Path to test config file"""
    return str(Path(__file__).parent.parent / 'fixtures' / 'test-tablet-config.json')


@pytest.fixture
def xp_pen_config_path():
    """Path to XP-Pen config file"""
    return str(Path(__file__).parent.parent.parent.parent / 'public' / 'configs' / 'xp-pen-deco640-osx-python-nodriver.json')


@pytest.fixture
def test_generator(test_config_path):
    """Create a config-based generator for test config"""
    return ConfigBasedGenerator(test_config_path)


@pytest.fixture
def xp_pen_generator(xp_pen_config_path):
    """Create a config-based generator for XP-Pen config"""
    return ConfigBasedGenerator(xp_pen_config_path)


class TestConfigBasedGenerator:
    """Test the ConfigBasedGenerator class"""

    def test_generator_initialization(self, test_generator):
        """Test that generator initializes correctly from config"""
        assert test_generator.max_x == 65535
        assert test_generator.max_y == 65535
        assert test_generator.max_pressure == 8191
        assert test_generator.report_id == 1

    def test_xp_pen_initialization(self, xp_pen_generator):
        """Test that XP-Pen generator initializes correctly"""
        assert xp_pen_generator.max_x == 15999
        assert xp_pen_generator.max_y == 8999
        assert xp_pen_generator.max_pressure == 16383
        assert xp_pen_generator.report_id == 7  # XP-Pen Deco 640 uses report ID 7 (from stable config)

    def test_get_device_info(self, test_generator):
        """Test device info extraction from config"""
        info = test_generator.get_device_info()
        assert info['vendor_id'] == 0x1234
        assert info['product_id'] == 0x5678
        assert info['product_name'] == 'Test Tablet'
        assert info['manufacturer'] == 'Test Manufacturer'

    def test_stylus_packet_generation(self, test_generator, test_config_path):
        """Test that stylus packets are generated correctly"""
        # Load config for processing
        with open(test_config_path) as f:
            config = json.load(f)

        # Generate a stylus packet
        packet = test_generator.generate_stylus_packet(0.5, 0.5, 0.5)

        # Prepend report ID (config byte indices assume report ID at byte 0)
        report_id = config.get('reportId', 1)
        packet_with_report_id = bytes([report_id]) + packet

        # Process it through the config
        result = process_device_data(packet_with_report_id, config['byteCodeMappings'])

        # Verify the data is processed correctly
        assert 'x' in result
        assert 'y' in result
        assert 'pressure' in result

        # Check values are in expected range
        assert 0 <= result['x'] <= test_generator.max_x
        assert 0 <= result['y'] <= test_generator.max_y
        assert 0 <= result['pressure'] <= test_generator.max_pressure

    def test_horizontal_line_generation(self, test_generator):
        """Test horizontal line gesture generation"""
        packets = list(test_generator.generate_horizontal_line(y=0.5, pressure=0.5, duration=100))

        # Should have some packets
        assert len(packets) > 0

        # All packets should be bytes
        for packet in packets:
            assert isinstance(packet, bytes)

    def test_vertical_line_generation(self, test_generator):
        """Test vertical line gesture generation"""
        packets = list(test_generator.generate_vertical_line(x=0.5, pressure=0.5, duration=100))

        assert len(packets) > 0
        for packet in packets:
            assert isinstance(packet, bytes)

    def test_pressure_sweep_generation(self, test_generator):
        """Test pressure sweep gesture generation"""
        packets = list(test_generator.generate_pressure_sweep(x=0.5, y=0.5, duration=100))

        assert len(packets) > 0
        for packet in packets:
            assert isinstance(packet, bytes)


class TestXPPenButtonGeneration:
    """Test button generation for XP-Pen config with statusOverrides"""

    def test_button_packet_generation(self, xp_pen_generator, xp_pen_config_path):
        """Test that button packets are generated correctly"""
        with open(xp_pen_config_path) as f:
            config = json.load(f)

        # Generate button 1 packet
        packet = xp_pen_generator.generate_button_packet(1)

        # Prepend report ID (config byte indices assume report ID at byte 0)
        report_id = config.get('reportId', 7)
        packet_with_report_id = bytes([report_id]) + packet

        # Process it
        result = process_device_data(packet_with_report_id, config['byteCodeMappings'])

        # Should detect button 1
        assert result.get('tabletButtons') == 1
        assert result.get('button1') == True
        assert result.get('button2') == False

    def test_button_with_status_override(self, xp_pen_generator, xp_pen_config_path):
        """Test button 8 which uses statusOverrides"""
        with open(xp_pen_config_path) as f:
            config = json.load(f)

        # Generate button 8 packet (uses statusOverrides)
        packet = xp_pen_generator.generate_button_packet(8)

        # Prepend report ID (config byte indices assume report ID at byte 0)
        report_id = config.get('reportId', 7)
        packet_with_report_id = bytes([report_id]) + packet

        # Process it
        result = process_device_data(packet_with_report_id, config['byteCodeMappings'])

        # Should detect button 8
        assert result.get('tabletButtons') == 8
        assert result.get('button8') == True
        assert result.get('button7') == False

    def test_all_buttons(self, xp_pen_generator, xp_pen_config_path):
        """Test all 8 buttons generate correctly"""
        with open(xp_pen_config_path) as f:
            config = json.load(f)

        report_id = config.get('reportId', 7)

        for button_num in range(1, 9):
            packet = xp_pen_generator.generate_button_packet(button_num)
            # Prepend report ID (config byte indices assume report ID at byte 0)
            packet_with_report_id = bytes([report_id]) + packet
            result = process_device_data(packet_with_report_id, config['byteCodeMappings'])

            # Should detect the correct button
            assert result.get('tabletButtons') == button_num, f"Button {button_num} not detected correctly"
            assert result.get(f'button{button_num}') == True, f"button{button_num} flag not set"

    def test_button_sequence_generation(self, xp_pen_generator):
        """Test button sequence generation"""
        packets = list(xp_pen_generator.generate_button_sequence(button_count=8, duration=200))

        # Should have packets for all buttons
        assert len(packets) > 0

        # All should be bytes
        for packet in packets:
            assert isinstance(packet, bytes)


class TestFactoryFunction:
    """Test the factory function"""

    def test_create_config_based_generator(self, test_config_path):
        """Test factory function creates generator correctly"""
        generator = create_config_based_generator(test_config_path)

        assert isinstance(generator, ConfigBasedGenerator)
        assert generator.max_x == 65535


class TestMockReaderIntegration:
    """Test integration with MockHIDReader"""

    def test_mock_reader_with_config_generator(self, xp_pen_generator):
        """Test that MockHIDReader works with config generator"""
        from thelearningtablet.mockbytes import MockHIDReader

        # Create mock reader with config generator
        reader = MockHIDReader(custom_generator=xp_pen_generator)

        # Should use the config generator
        assert reader.generator == xp_pen_generator

        # Device info should come from config
        info = reader.get_device_info()
        assert 'vendor_id' in info
        assert 'product_id' in info

    def test_mock_reader_gesture_playback(self, xp_pen_generator):
        """Test that gestures work with config generator"""
        from thelearningtablet.mockbytes import MockHIDReader
        import asyncio

        reader = MockHIDReader(custom_generator=xp_pen_generator)

        # Track received packets
        received_packets = []

        def callback(packet):
            received_packets.append(packet)

        reader.start_reading(callback)

        # Play a short horizontal gesture
        async def test_gesture():
            await reader.play_horizontal_drag(duration=100)

        asyncio.run(test_gesture())

        # Should have received packets
        assert len(received_packets) > 0


class TestEndToEndProcessing:
    """End-to-end tests: generate mock data and process it"""

    def test_stylus_data_round_trip(self, xp_pen_generator, xp_pen_config_path):
        """Test generating and processing stylus data"""
        with open(xp_pen_config_path) as f:
            config = json.load(f)

        report_id = config.get('reportId', 7)

        # Generate packets for a horizontal line
        packets = list(xp_pen_generator.generate_horizontal_line(duration=100))

        # Process each packet (prepend report ID)
        for packet in packets:
            packet_with_report_id = bytes([report_id]) + packet
            result = process_device_data(packet_with_report_id, config['byteCodeMappings'])

            # Should have valid status (XP-Pen uses 'status' not 'state')
            assert 'status' in result or 'state' in result

            # Should have coordinates
            assert 'x' in result
            assert 'y' in result

    def test_button_data_round_trip(self, xp_pen_generator, xp_pen_config_path):
        """Test generating and processing button data"""
        with open(xp_pen_config_path) as f:
            config = json.load(f)

        report_id = config.get('reportId', 7)

        # Test each button
        for button_num in range(1, 9):
            packet = xp_pen_generator.generate_button_packet(button_num)
            # Prepend report ID (config byte indices assume report ID at byte 0)
            packet_with_report_id = bytes([report_id]) + packet
            result = process_device_data(packet_with_report_id, config['byteCodeMappings'])

            # Should detect the button
            assert result.get('tabletButtons') == button_num

            # Should have button flags
            for i in range(1, 9):
                expected = (i == button_num)
                actual = result.get(f'button{i}', False)
                assert actual == expected, f"Button {i} flag incorrect for button {button_num} press"

    def test_mixed_gesture_sequence(self, xp_pen_generator, xp_pen_config_path):
        """Test a sequence of different gestures"""
        with open(xp_pen_config_path) as f:
            config = json.load(f)

        report_id = config.get('reportId', 7)

        # Generate different types of packets
        stylus_packet = xp_pen_generator.generate_stylus_packet(0.5, 0.5, 0.5)
        button_packet = xp_pen_generator.generate_button_packet(1)

        # Prepend report ID
        stylus_packet = bytes([report_id]) + stylus_packet
        button_packet = bytes([report_id]) + button_packet

        # Process both
        stylus_result = process_device_data(stylus_packet, config['byteCodeMappings'])
        button_result = process_device_data(button_packet, config['byteCodeMappings'])

        # Stylus should have coordinates
        assert 'x' in stylus_result
        assert 'y' in stylus_result

        # Button should have button data
        assert button_result.get('tabletButtons') == 1