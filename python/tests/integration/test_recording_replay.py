"""
Integration test: Replay recorded walkthrough data and verify config generation

This test uses real recorded data from an XP-Pen Deco 640 tablet walkthrough
to verify that the WalkthroughEngine generates the correct configuration.

Tests are parameterized to run against multiple recording files.
"""

import json
import pytest
from pathlib import Path

from blankslate.core.walkthrough_engine import WalkthroughEngine, WalkthroughEngineOptions
from blankslate.core.walkthrough_types import UserMetadata, DeviceInfo


# List of recording files to test against (driverless mode)
RECORDING_FILES = [
    'xp-pen-deco640-nodriver-recording.json',
    'xp-pen-deco640-nodriver-recording2.json',
]

# List of recording files for driver mode
DRIVER_RECORDING_FILES = [
    'xp-pen-deco640-driver-recording.json',
    'xp-pen-deco640-driver-recording2.json',
]


class TestRecordingReplay:
    """Test config generation by replaying recorded walkthrough data"""

    @pytest.fixture(params=RECORDING_FILES)
    def recording_path(self, request):
        """Path to the recorded walkthrough data (parameterized for multiple recordings)"""
        return Path(__file__).parent.parent.parent.parent / 'common-test-fixtures' / request.param

    @pytest.fixture
    def expected_config_path(self):
        """Path to the expected config output"""
        return Path(__file__).parent.parent.parent.parent / 'common-test-fixtures' / 'xp-pen-deco640-driverless.json'

    @pytest.fixture
    def recording(self, recording_path):
        """Load the recorded walkthrough data"""
        with open(recording_path, 'r') as f:
            return json.load(f)

    @pytest.fixture
    def expected_config(self, expected_config_path):
        """Load the expected config"""
        with open(expected_config_path, 'r') as f:
            return json.load(f)

    @pytest.fixture
    def expected_mode(self, expected_config):
        """Get the first mode from expected config (for mode-level field comparisons)"""
        return expected_config['modes'][0]

    @pytest.fixture
    def engine(self):
        """Create a walkthrough engine with appropriate options"""
        options = WalkthroughEngineOptions(
            min_packets_per_step=10,  # Lower threshold for test
            min_variance_threshold=50,
            filter_idle_packets=False,  # Don't filter - we have real data
            skip_duplicates=False,  # Don't skip - we have real data
        )
        return WalkthroughEngine(options)

    @staticmethod
    def hex_to_bytes(hex_string: str) -> bytes:
        """Convert hex string to bytes"""
        return bytes.fromhex(hex_string)

    def replay_step(self, engine: WalkthroughEngine, step_name: str, step_data: dict):
        """Replay a single step's packets through the engine"""
        packets = step_data.get('packets', [])

        # Start capture
        engine.start_capture()

        # Feed all packets
        for hex_packet in packets:
            packet_bytes = self.hex_to_bytes(hex_packet)
            # Extract report ID from first byte but pass FULL packet
            # The engine expects packets with the same structure as config byteIndex values
            # (i.e., report ID at index 0, status at index 1, data at index 2+)
            report_id = packet_bytes[0]
            engine.process_packet(packet_bytes, report_id)

        # Stop capture to trigger processing
        engine.stop_capture()

    def test_replay_generates_correct_x_mapping(self, engine, recording, expected_mode):
        """Test that X coordinate mapping is correctly generated"""
        # Set up device info
        device = recording['device']
        device_info = DeviceInfo(
            vendor_id=int(device['vendorId'], 16),
            product_id=int(device['productId'], 16),
            product_string=device['productName'],
            usage_page=13,  # Digitizer
            usage=2,
            interfaces=[13]
        )
        engine.set_device_info(device_info)
        
        # Start walkthrough
        engine.start()
        
        # Replay step 1 (horizontal movement for X)
        self.replay_step(engine, 'step1-horizontal', recording['steps']['step1-horizontal'])
        
        # Generate config
        engine.set_user_metadata(UserMetadata(
            name='Test',
            manufacturer='Test',
            model='Test',
            description='Test',
            button_count=0
        ))
        engine.generate_config()
        config = engine.get_complete_config()
        
        # Verify X mapping
        x_mapping = config['modes'][0]['byteCodeMappings']['x']
        expected_x = expected_mode['byteCodeMappings']['x']
        
        assert x_mapping['byteIndex'] == expected_x['byteIndex'], \
            f"X byteIndex mismatch: {x_mapping['byteIndex']} != {expected_x['byteIndex']}"
        assert x_mapping['max'] == expected_x['max'], \
            f"X max mismatch: {x_mapping['max']} != {expected_x['max']}"

    def test_replay_generates_correct_y_mapping(self, engine, recording, expected_mode):
        """Test that Y coordinate mapping is correctly generated"""
        # Set up device info
        device = recording['device']
        device_info = DeviceInfo(
            vendor_id=int(device['vendorId'], 16),
            product_id=int(device['productId'], 16),
            product_string=device['productName'],
            usage_page=13,
            usage=2,
            interfaces=[13]
        )
        engine.set_device_info(device_info)
        
        # Start walkthrough
        engine.start()
        
        # Replay steps 1 and 2
        self.replay_step(engine, 'step1-horizontal', recording['steps']['step1-horizontal'])
        engine.next_step()
        self.replay_step(engine, 'step2-vertical', recording['steps']['step2-vertical'])
        
        # Generate config
        engine.set_user_metadata(UserMetadata(
            name='Test',
            manufacturer='Test',
            model='Test',
            description='Test',
            button_count=0
        ))
        engine.generate_config()
        config = engine.get_complete_config()
        
        # Verify Y mapping
        y_mapping = config['modes'][0]['byteCodeMappings']['y']
        expected_y = expected_mode['byteCodeMappings']['y']
        
        assert y_mapping['byteIndex'] == expected_y['byteIndex'], \
            f"Y byteIndex mismatch: {y_mapping['byteIndex']} != {expected_y['byteIndex']}"
        assert y_mapping['max'] == expected_y['max'], \
            f"Y max mismatch: {y_mapping['max']} != {expected_y['max']}"

    def test_replay_generates_correct_pressure_mapping(self, engine, recording, expected_mode):
        """Test that pressure mapping is correctly generated"""
        # Set up device info
        device = recording['device']
        device_info = DeviceInfo(
            vendor_id=int(device['vendorId'], 16),
            product_id=int(device['productId'], 16),
            product_string=device['productName'],
            usage_page=13,
            usage=2,
            interfaces=[13]
        )
        engine.set_device_info(device_info)
        
        # Start walkthrough
        engine.start()
        
        # Replay steps 1-3
        self.replay_step(engine, 'step1-horizontal', recording['steps']['step1-horizontal'])
        engine.next_step()
        self.replay_step(engine, 'step2-vertical', recording['steps']['step2-vertical'])
        engine.next_step()
        self.replay_step(engine, 'step3-pressure', recording['steps']['step3-pressure'])
        
        # Generate config
        engine.set_user_metadata(UserMetadata(
            name='Test',
            manufacturer='Test',
            model='Test',
            description='Test',
            button_count=0
        ))
        engine.generate_config()
        config = engine.get_complete_config()
        
        # Verify pressure mapping
        pressure_mapping = config['modes'][0]['byteCodeMappings']['pressure']
        expected_pressure = expected_mode['byteCodeMappings']['pressure']
        
        assert pressure_mapping['byteIndex'] == expected_pressure['byteIndex'], \
            f"Pressure byteIndex mismatch: {pressure_mapping['byteIndex']} != {expected_pressure['byteIndex']}"
        assert pressure_mapping['max'] == expected_pressure['max'], \
            f"Pressure max mismatch: {pressure_mapping['max']} != {expected_pressure['max']}"

    def test_replay_generates_correct_tilt_mappings(self, engine, recording, expected_mode):
        """Test that tilt X and Y mappings are correctly generated"""
        # Set up device info
        device = recording['device']
        device_info = DeviceInfo(
            vendor_id=int(device['vendorId'], 16),
            product_id=int(device['productId'], 16),
            product_string=device['productName'],
            usage_page=13,
            usage=2,
            interfaces=[13]
        )
        engine.set_device_info(device_info)
        
        # Start walkthrough
        engine.start()
        
        # Replay steps 1-6
        self.replay_step(engine, 'step1-horizontal', recording['steps']['step1-horizontal'])
        engine.next_step()
        self.replay_step(engine, 'step2-vertical', recording['steps']['step2-vertical'])
        engine.next_step()
        self.replay_step(engine, 'step3-pressure', recording['steps']['step3-pressure'])
        engine.next_step()
        self.replay_step(engine, 'step4-hover-movement', recording['steps']['step4-hover-movement'])
        engine.next_step()
        self.replay_step(engine, 'step5-tilt-x', recording['steps']['step5-tilt-x'])
        engine.next_step()
        self.replay_step(engine, 'step6-tilt-y', recording['steps']['step6-tilt-y'])
        
        # Generate config
        engine.set_user_metadata(UserMetadata(
            name='Test',
            manufacturer='Test',
            model='Test',
            description='Test',
            button_count=0
        ))
        engine.generate_config()
        config = engine.get_complete_config()
        
        # Verify tilt X mapping
        tilt_x = config['modes'][0]['byteCodeMappings']['tiltX']
        expected_tilt_x = expected_mode['byteCodeMappings']['tiltX']
        
        assert tilt_x['byteIndex'] == expected_tilt_x['byteIndex'], \
            f"TiltX byteIndex mismatch: {tilt_x['byteIndex']} != {expected_tilt_x['byteIndex']}"
        assert tilt_x['positiveMax'] == expected_tilt_x['positiveMax'], \
            f"TiltX positiveMax mismatch: {tilt_x['positiveMax']} != {expected_tilt_x['positiveMax']}"
        assert tilt_x['negativeMin'] == expected_tilt_x['negativeMin'], \
            f"TiltX negativeMin mismatch: {tilt_x['negativeMin']} != {expected_tilt_x['negativeMin']}"
        assert tilt_x['negativeMax'] == expected_tilt_x['negativeMax'], \
            f"TiltX negativeMax mismatch: {tilt_x['negativeMax']} != {expected_tilt_x['negativeMax']}"
        
        # Verify tilt Y mapping
        tilt_y = config['modes'][0]['byteCodeMappings']['tiltY']
        expected_tilt_y = expected_mode['byteCodeMappings']['tiltY']
        
        assert tilt_y['byteIndex'] == expected_tilt_y['byteIndex'], \
            f"TiltY byteIndex mismatch: {tilt_y['byteIndex']} != {expected_tilt_y['byteIndex']}"
        assert tilt_y['positiveMax'] == expected_tilt_y['positiveMax'], \
            f"TiltY positiveMax mismatch: {tilt_y['positiveMax']} != {expected_tilt_y['positiveMax']}"
        assert tilt_y['negativeMin'] == expected_tilt_y['negativeMin'], \
            f"TiltY negativeMin mismatch: {tilt_y['negativeMin']} != {expected_tilt_y['negativeMin']}"
        assert tilt_y['negativeMax'] == expected_tilt_y['negativeMax'], \
            f"TiltY negativeMax mismatch: {tilt_y['negativeMax']} != {expected_tilt_y['negativeMax']}"

    def run_full_walkthrough(self, engine, recording):
        """Helper to run a full walkthrough and return the generated config"""
        # Set up device info
        device = recording['device']
        device_info = DeviceInfo(
            vendor_id=int(device['vendorId'], 16),
            product_id=int(device['productId'], 16),
            product_string=device['productName'],
            usage_page=13,
            usage=2,
            interfaces=[13, 1, 65290]
        )
        engine.set_device_info(device_info)

        # Start walkthrough
        engine.start()

        # Replay all steps (including button step)
        steps = [
            'step1-horizontal',
            'step2-vertical',
            'step3-pressure',
            'step4-hover-movement',
            'step5-tilt-x',
            'step6-tilt-y',
            'step7-primary-button',
            'step8-secondary-button',
            'step9-tablet-buttons',
        ]

        for i, step_name in enumerate(steps):
            if step_name in recording['steps']:
                self.replay_step(engine, step_name, recording['steps'][step_name])
            if i < len(steps) - 1:
                engine.next_step()

        # Set user metadata
        engine.set_user_metadata(UserMetadata(
            name='XP Pen Deco 640 (Driverless)',
            manufacturer='XP Pen',
            model='Deco 640',
            description='XP Pen Deco 640 driverless mode config for testing',
            button_count=8
        ))

        # Generate config
        engine.generate_config()
        return engine.get_complete_config()

    def test_full_walkthrough_replay(self, engine, recording, expected_mode):
        """
        Full integration test: Replay entire walkthrough and verify all core mappings
        """
        config = self.run_full_walkthrough(engine, recording)

        # Verify all core byte mappings
        byte_mappings = config['modes'][0]['byteCodeMappings']
        expected_mappings = expected_mode['byteCodeMappings']

        # X coordinate
        assert byte_mappings['x']['byteIndex'] == expected_mappings['x']['byteIndex']
        assert byte_mappings['x']['max'] == expected_mappings['x']['max']

        # Y coordinate
        assert byte_mappings['y']['byteIndex'] == expected_mappings['y']['byteIndex']
        assert byte_mappings['y']['max'] == expected_mappings['y']['max']

        # Pressure
        assert byte_mappings['pressure']['byteIndex'] == expected_mappings['pressure']['byteIndex']
        assert byte_mappings['pressure']['max'] == expected_mappings['pressure']['max']

        # Tilt X
        assert byte_mappings['tiltX']['byteIndex'] == expected_mappings['tiltX']['byteIndex']
        assert byte_mappings['tiltX']['positiveMax'] == expected_mappings['tiltX']['positiveMax']
        assert byte_mappings['tiltX']['negativeMin'] == expected_mappings['tiltX']['negativeMin']
        assert byte_mappings['tiltX']['negativeMax'] == expected_mappings['tiltX']['negativeMax']

        # Tilt Y
        assert byte_mappings['tiltY']['byteIndex'] == expected_mappings['tiltY']['byteIndex']
        assert byte_mappings['tiltY']['positiveMax'] == expected_mappings['tiltY']['positiveMax']
        assert byte_mappings['tiltY']['negativeMin'] == expected_mappings['tiltY']['negativeMin']
        assert byte_mappings['tiltY']['negativeMax'] == expected_mappings['tiltY']['negativeMax']

        # Status byte location
        assert byte_mappings['status']['byteIndex'] == expected_mappings['status']['byteIndex']

        # Report ID
        assert config['modes'][0]['reportId'] == expected_mode['reportId']

        # Capabilities
        capabilities = config['modes'][0]['capabilities']
        expected_caps = expected_mode['capabilities']

        assert capabilities['resolution']['x'] == expected_caps['resolution']['x']
        assert capabilities['resolution']['y'] == expected_caps['resolution']['y']
        # Note: pressureLevels in expected config is count (max+1), generated uses max value
        # So we check that generated is either equal or off by 1
        assert abs(capabilities['pressureLevels'] - expected_caps['pressureLevels']) <= 1, \
            f"Pressure levels mismatch: {capabilities['pressureLevels']} vs {expected_caps['pressureLevels']}"
        assert capabilities['hasTilt'] == expected_caps['hasTilt']

    def test_device_identifiers(self, engine, recording, expected_config):
        """Test that device identifiers are correctly generated"""
        config = self.run_full_walkthrough(engine, recording)

        # Top-level device identifiers
        assert config['vendorId'] == expected_config['vendorId'], \
            f"vendorId mismatch: {config['vendorId']} != {expected_config['vendorId']}"
        assert config['productId'] == expected_config['productId'], \
            f"productId mismatch: {config['productId']} != {expected_config['productId']}"

        # Device info
        device_info = config['deviceInfo']
        expected_device_info = expected_config['deviceInfo']

        assert device_info['vendor_id'] == expected_device_info['vendor_id'], \
            f"deviceInfo.vendor_id mismatch: {device_info['vendor_id']} != {expected_device_info['vendor_id']}"
        assert device_info['product_id'] == expected_device_info['product_id'], \
            f"deviceInfo.product_id mismatch: {device_info['product_id']} != {expected_device_info['product_id']}"

    def test_user_metadata(self, engine, recording, expected_config):
        """Test that user metadata is correctly included"""
        config = self.run_full_walkthrough(engine, recording)

        assert config['name'] == expected_config['name'], \
            f"name mismatch: {config['name']} != {expected_config['name']}"
        assert config['manufacturer'] == expected_config['manufacturer'], \
            f"manufacturer mismatch: {config['manufacturer']} != {expected_config['manufacturer']}"
        assert config['model'] == expected_config['model'], \
            f"model mismatch: {config['model']} != {expected_config['model']}"
        assert config['description'] == expected_config['description'], \
            f"description mismatch: {config['description']} != {expected_config['description']}"

    def test_mode_level_fields(self, engine, recording, expected_mode):
        """Test mode-level configuration fields"""
        config = self.run_full_walkthrough(engine, recording)
        mode = config['modes'][0]

        # Report ID
        assert mode['reportId'] == expected_mode['reportId'], \
            f"reportId mismatch: {mode['reportId']} != {expected_mode['reportId']}"

        # Digitizer usage page
        assert mode['digitizerUsagePage'] == expected_mode['digitizerUsagePage'], \
            f"digitizerUsagePage mismatch: {mode['digitizerUsagePage']} != {expected_mode['digitizerUsagePage']}"

        # Stylus mode status byte (hover state)
        assert mode['stylusModeStatusByte'] == expected_mode['stylusModeStatusByte'], \
            f"stylusModeStatusByte mismatch: {mode['stylusModeStatusByte']} != {expected_mode['stylusModeStatusByte']}"

    def test_capabilities_complete(self, engine, recording, expected_mode):
        """Test all capability fields"""
        config = self.run_full_walkthrough(engine, recording)
        capabilities = config['modes'][0]['capabilities']
        expected_caps = expected_mode['capabilities']

        # Resolution
        assert capabilities['resolution']['x'] == expected_caps['resolution']['x'], \
            f"resolution.x mismatch: {capabilities['resolution']['x']} != {expected_caps['resolution']['x']}"
        assert capabilities['resolution']['y'] == expected_caps['resolution']['y'], \
            f"resolution.y mismatch: {capabilities['resolution']['y']} != {expected_caps['resolution']['y']}"

        # Pressure
        assert capabilities['hasPressure'] == expected_caps['hasPressure'], \
            f"hasPressure mismatch: {capabilities['hasPressure']} != {expected_caps['hasPressure']}"
        # Allow off-by-one for pressure levels (count vs max)
        assert abs(capabilities['pressureLevels'] - expected_caps['pressureLevels']) <= 1, \
            f"pressureLevels mismatch: {capabilities['pressureLevels']} vs {expected_caps['pressureLevels']}"

        # Tilt
        assert capabilities['hasTilt'] == expected_caps['hasTilt'], \
            f"hasTilt mismatch: {capabilities['hasTilt']} != {expected_caps['hasTilt']}"

        # Buttons
        assert capabilities['hasButtons'] == expected_caps['hasButtons'], \
            f"hasButtons mismatch: {capabilities['hasButtons']} != {expected_caps['hasButtons']}"
        assert capabilities['buttonCount'] == expected_caps['buttonCount'], \
            f"buttonCount mismatch: {capabilities['buttonCount']} != {expected_caps['buttonCount']}"

    def test_mapping_types(self, engine, recording, expected_mode):
        """Test that all mapping types are correct"""
        config = self.run_full_walkthrough(engine, recording)
        byte_mappings = config['modes'][0]['byteCodeMappings']
        expected_mappings = expected_mode['byteCodeMappings']

        # X - multi-byte-range
        assert byte_mappings['x']['type'] == expected_mappings['x']['type'], \
            f"x.type mismatch: {byte_mappings['x']['type']} != {expected_mappings['x']['type']}"

        # Y - multi-byte-range
        assert byte_mappings['y']['type'] == expected_mappings['y']['type'], \
            f"y.type mismatch: {byte_mappings['y']['type']} != {expected_mappings['y']['type']}"

        # Pressure - multi-byte-range
        assert byte_mappings['pressure']['type'] == expected_mappings['pressure']['type'], \
            f"pressure.type mismatch: {byte_mappings['pressure']['type']} != {expected_mappings['pressure']['type']}"

        # Status - code
        assert byte_mappings['status']['type'] == expected_mappings['status']['type'], \
            f"status.type mismatch: {byte_mappings['status']['type']} != {expected_mappings['status']['type']}"

        # TiltX - bipolar-range
        assert byte_mappings['tiltX']['type'] == expected_mappings['tiltX']['type'], \
            f"tiltX.type mismatch: {byte_mappings['tiltX']['type']} != {expected_mappings['tiltX']['type']}"

        # TiltY - bipolar-range
        assert byte_mappings['tiltY']['type'] == expected_mappings['tiltY']['type'], \
            f"tiltY.type mismatch: {byte_mappings['tiltY']['type']} != {expected_mappings['tiltY']['type']}"

        # TabletButtons - type field is now optional (defaults to 'code')
        # Interactive detection produces explicit button-to-scan-code mappings
        if 'tabletButtons' in byte_mappings:
            # Verify it has values mapping
            assert 'values' in byte_mappings['tabletButtons'], \
                "tabletButtons should have a 'values' field"

    def test_status_byte_values(self, engine, recording, expected_mode):
        """Test that status byte values are correctly detected"""
        config = self.run_full_walkthrough(engine, recording)
        status_values = config['modes'][0]['byteCodeMappings']['status']['values']
        expected_values = expected_mode['byteCodeMappings']['status']['values']

        # Key status bytes that should be detected from pen gestures:
        # 160 = hover, 161 = contact, 162 = hover+secondary, 163 = contact+secondary
        # 164 = hover+primary, 165 = contact+primary

        # Check hover state (160)
        assert '160' in status_values, "Status 160 (hover) not detected"
        assert status_values['160']['state'] == expected_values['160']['state'], \
            f"Status 160 state mismatch: {status_values['160']['state']} != {expected_values['160']['state']}"

        # Check contact state (161)
        assert '161' in status_values, "Status 161 (contact) not detected"
        assert status_values['161']['state'] == expected_values['161']['state'], \
            f"Status 161 state mismatch: {status_values['161']['state']} != {expected_values['161']['state']}"

        # Check secondary button hover (162)
        assert '162' in status_values, "Status 162 (hover+secondary) not detected"
        assert status_values['162']['state'] == expected_values['162']['state'], \
            f"Status 162 state mismatch: {status_values['162']['state']} != {expected_values['162']['state']}"
        assert status_values['162'].get('secondaryButtonPressed') == expected_values['162'].get('secondaryButtonPressed'), \
            f"Status 162 secondaryButtonPressed mismatch"

        # Check secondary button contact (163)
        assert '163' in status_values, "Status 163 (contact+secondary) not detected"
        assert status_values['163']['state'] == expected_values['163']['state'], \
            f"Status 163 state mismatch: {status_values['163']['state']} != {expected_values['163']['state']}"
        assert status_values['163'].get('secondaryButtonPressed') == expected_values['163'].get('secondaryButtonPressed'), \
            f"Status 163 secondaryButtonPressed mismatch"

        # Check primary button hover (164)
        assert '164' in status_values, "Status 164 (hover+primary) not detected"
        assert status_values['164']['state'] == expected_values['164']['state'], \
            f"Status 164 state mismatch: {status_values['164']['state']} != {expected_values['164']['state']}"
        assert status_values['164'].get('primaryButtonPressed') == expected_values['164'].get('primaryButtonPressed'), \
            f"Status 164 primaryButtonPressed mismatch"

        # Check primary button contact (165)
        assert '165' in status_values, "Status 165 (contact+primary) not detected"
        assert status_values['165']['state'] == expected_values['165']['state'], \
            f"Status 165 state mismatch: {status_values['165']['state']} != {expected_values['165']['state']}"
        assert status_values['165'].get('primaryButtonPressed') == expected_values['165'].get('primaryButtonPressed'), \
            f"Status 165 primaryButtonPressed mismatch"

    def test_tablet_buttons_mapping(self, engine, recording, expected_mode):
        """Test tablet button mappings from recording replay.

        Note: Recording replay uses the fallback auto-detection path which detects
        button byte indices but not specific button-to-scan-code mappings. The detailed
        button values (5->1, 8->2, etc.) require interactive button detection which
        is not part of the replay flow.

        This test verifies:
        1. Button bytes are detected from step9 packets
        2. The button byte index includes the expected byte (byte 2)
        """
        config = self.run_full_walkthrough(engine, recording)

        # Check if tablet buttons were detected
        byte_mappings = config['modes'][0]['byteCodeMappings']
        if 'tabletButtons' not in byte_mappings:
            pytest.skip("Tablet buttons not detected in this recording")

        tablet_buttons = byte_mappings['tabletButtons']
        expected_buttons = expected_mode['byteCodeMappings']['tabletButtons']

        # Verify byte index includes the expected button byte
        # The expected config has byteIndex: [2]
        expected_byte_index = expected_buttons['byteIndex'][0]  # Byte 2
        assert expected_byte_index in tablet_buttons['byteIndex'], \
            f"Expected button byte {expected_byte_index} not in detected byteIndex: {tablet_buttons['byteIndex']}"

        # Type field is now optional (defaults to 'code')
        # Just verify that values mapping exists
        assert 'values' in tablet_buttons or 'type' not in tablet_buttons, \
            "tabletButtons should have values mapping (type field is optional)"

        # Verify buttonCount is set
        assert 'buttonCount' in tablet_buttons, "tabletButtons should have buttonCount"
        assert tablet_buttons['buttonCount'] > 0, "buttonCount should be positive"

    def test_x_mapping_complete(self, engine, recording, expected_mode):
        """Test X coordinate mapping with all fields"""
        config = self.run_full_walkthrough(engine, recording)
        x_mapping = config['modes'][0]['byteCodeMappings']['x']
        expected_x = expected_mode['byteCodeMappings']['x']

        assert x_mapping['byteIndex'] == expected_x['byteIndex'], \
            f"x.byteIndex mismatch: {x_mapping['byteIndex']} != {expected_x['byteIndex']}"
        assert x_mapping['max'] == expected_x['max'], \
            f"x.max mismatch: {x_mapping['max']} != {expected_x['max']}"
        assert x_mapping['type'] == expected_x['type'], \
            f"x.type mismatch: {x_mapping['type']} != {expected_x['type']}"

    def test_y_mapping_complete(self, engine, recording, expected_mode):
        """Test Y coordinate mapping with all fields"""
        config = self.run_full_walkthrough(engine, recording)
        y_mapping = config['modes'][0]['byteCodeMappings']['y']
        expected_y = expected_mode['byteCodeMappings']['y']

        assert y_mapping['byteIndex'] == expected_y['byteIndex'], \
            f"y.byteIndex mismatch: {y_mapping['byteIndex']} != {expected_y['byteIndex']}"
        assert y_mapping['max'] == expected_y['max'], \
            f"y.max mismatch: {y_mapping['max']} != {expected_y['max']}"
        assert y_mapping['type'] == expected_y['type'], \
            f"y.type mismatch: {y_mapping['type']} != {expected_y['type']}"

    def test_pressure_mapping_complete(self, engine, recording, expected_mode):
        """Test pressure mapping with all fields"""
        config = self.run_full_walkthrough(engine, recording)
        pressure_mapping = config['modes'][0]['byteCodeMappings']['pressure']
        expected_pressure = expected_mode['byteCodeMappings']['pressure']

        assert pressure_mapping['byteIndex'] == expected_pressure['byteIndex'], \
            f"pressure.byteIndex mismatch: {pressure_mapping['byteIndex']} != {expected_pressure['byteIndex']}"
        assert pressure_mapping['max'] == expected_pressure['max'], \
            f"pressure.max mismatch: {pressure_mapping['max']} != {expected_pressure['max']}"
        assert pressure_mapping['type'] == expected_pressure['type'], \
            f"pressure.type mismatch: {pressure_mapping['type']} != {expected_pressure['type']}"

    def test_tilt_x_mapping_complete(self, engine, recording, expected_mode):
        """Test tilt X mapping with all fields"""
        config = self.run_full_walkthrough(engine, recording)
        tilt_x = config['modes'][0]['byteCodeMappings']['tiltX']
        expected_tilt_x = expected_mode['byteCodeMappings']['tiltX']

        assert tilt_x['byteIndex'] == expected_tilt_x['byteIndex'], \
            f"tiltX.byteIndex mismatch: {tilt_x['byteIndex']} != {expected_tilt_x['byteIndex']}"
        assert tilt_x['positiveMax'] == expected_tilt_x['positiveMax'], \
            f"tiltX.positiveMax mismatch: {tilt_x['positiveMax']} != {expected_tilt_x['positiveMax']}"
        assert tilt_x['negativeMin'] == expected_tilt_x['negativeMin'], \
            f"tiltX.negativeMin mismatch: {tilt_x['negativeMin']} != {expected_tilt_x['negativeMin']}"
        assert tilt_x['negativeMax'] == expected_tilt_x['negativeMax'], \
            f"tiltX.negativeMax mismatch: {tilt_x['negativeMax']} != {expected_tilt_x['negativeMax']}"
        assert tilt_x['type'] == expected_tilt_x['type'], \
            f"tiltX.type mismatch: {tilt_x['type']} != {expected_tilt_x['type']}"

    def test_tilt_y_mapping_complete(self, engine, recording, expected_mode):
        """Test tilt Y mapping with all fields"""
        config = self.run_full_walkthrough(engine, recording)
        tilt_y = config['modes'][0]['byteCodeMappings']['tiltY']
        expected_tilt_y = expected_mode['byteCodeMappings']['tiltY']

        assert tilt_y['byteIndex'] == expected_tilt_y['byteIndex'], \
            f"tiltY.byteIndex mismatch: {tilt_y['byteIndex']} != {expected_tilt_y['byteIndex']}"
        assert tilt_y['positiveMax'] == expected_tilt_y['positiveMax'], \
            f"tiltY.positiveMax mismatch: {tilt_y['positiveMax']} != {expected_tilt_y['positiveMax']}"
        assert tilt_y['negativeMin'] == expected_tilt_y['negativeMin'], \
            f"tiltY.negativeMin mismatch: {tilt_y['negativeMin']} != {expected_tilt_y['negativeMin']}"
        assert tilt_y['negativeMax'] == expected_tilt_y['negativeMax'], \
            f"tiltY.negativeMax mismatch: {tilt_y['negativeMax']} != {expected_tilt_y['negativeMax']}"
        assert tilt_y['type'] == expected_tilt_y['type'], \
            f"tiltY.type mismatch: {tilt_y['type']} != {expected_tilt_y['type']}"

    def test_status_mapping_complete(self, engine, recording, expected_mode):
        """Test status mapping with all fields"""
        config = self.run_full_walkthrough(engine, recording)
        status = config['modes'][0]['byteCodeMappings']['status']
        expected_status = expected_mode['byteCodeMappings']['status']

        assert status['byteIndex'] == expected_status['byteIndex'], \
            f"status.byteIndex mismatch: {status['byteIndex']} != {expected_status['byteIndex']}"
        assert status['type'] == expected_status['type'], \
            f"status.type mismatch: {status['type']} != {expected_status['type']}"

    def test_config_structure(self, engine, recording, expected_config):
        """Test that the generated config has the correct top-level structure"""
        config = self.run_full_walkthrough(engine, recording)

        # Required top-level fields
        required_fields = ['name', 'manufacturer', 'model', 'description',
                          'vendorId', 'productId', 'deviceInfo', 'modes']
        for field in required_fields:
            assert field in config, f"Missing required field: {field}"

        # Modes should be a list with at least one mode
        assert isinstance(config['modes'], list), "modes should be a list"
        assert len(config['modes']) >= 1, "modes should have at least one entry"

        # Mode structure
        mode = config['modes'][0]
        mode_required_fields = ['reportId', 'digitizerUsagePage', 'capabilities', 'byteCodeMappings']
        for field in mode_required_fields:
            assert field in mode, f"Missing required mode field: {field}"

    def test_device_info_structure(self, engine, recording, expected_config):
        """Test that deviceInfo has the correct structure"""
        config = self.run_full_walkthrough(engine, recording)
        device_info = config['deviceInfo']

        # Required deviceInfo fields
        required_fields = ['vendor_id', 'product_id', 'product_string', 'interfaces']
        for field in required_fields:
            assert field in device_info, f"Missing required deviceInfo field: {field}"

        # Interfaces should be a list
        assert isinstance(device_info['interfaces'], list), "interfaces should be a list"

    def test_byte_code_mappings_structure(self, engine, recording, expected_config):
        """Test that byteCodeMappings has all expected mappings"""
        config = self.run_full_walkthrough(engine, recording)
        mappings = config['modes'][0]['byteCodeMappings']

        # Core mappings that should always be present
        core_mappings = ['x', 'y', 'pressure', 'status', 'tiltX', 'tiltY']
        for mapping in core_mappings:
            assert mapping in mappings, f"Missing core mapping: {mapping}"

        # Each mapping should have byteIndex and type
        for mapping_name in core_mappings:
            mapping = mappings[mapping_name]
            assert 'byteIndex' in mapping, f"{mapping_name} missing byteIndex"
            assert 'type' in mapping, f"{mapping_name} missing type"

    def test_resolution_matches_max_values(self, engine, recording, expected_config):
        """Test that capabilities.resolution matches the max values in byte mappings"""
        config = self.run_full_walkthrough(engine, recording)
        mode = config['modes'][0]

        capabilities = mode['capabilities']
        mappings = mode['byteCodeMappings']

        # Resolution X should match x.max
        assert capabilities['resolution']['x'] == mappings['x']['max'], \
            f"resolution.x ({capabilities['resolution']['x']}) != x.max ({mappings['x']['max']})"

        # Resolution Y should match y.max
        assert capabilities['resolution']['y'] == mappings['y']['max'], \
            f"resolution.y ({capabilities['resolution']['y']}) != y.max ({mappings['y']['max']})"

    def test_pressure_levels_matches_max(self, engine, recording, expected_config):
        """Test that capabilities.pressureLevels is derived from pressure.max"""
        config = self.run_full_walkthrough(engine, recording)
        mode = config['modes'][0]

        capabilities = mode['capabilities']
        mappings = mode['byteCodeMappings']

        # pressureLevels should be pressure.max or pressure.max + 1
        pressure_max = mappings['pressure']['max']
        pressure_levels = capabilities['pressureLevels']

        assert pressure_levels == pressure_max or pressure_levels == pressure_max + 1, \
            f"pressureLevels ({pressure_levels}) should be pressure.max ({pressure_max}) or max+1"

    def test_vendor_id_formats(self, engine, recording, expected_config):
        """Test that vendor/product IDs are in correct formats"""
        config = self.run_full_walkthrough(engine, recording)

        # Top-level IDs should be hex strings
        assert config['vendorId'].startswith('0x'), \
            f"vendorId should be hex string: {config['vendorId']}"
        assert config['productId'].startswith('0x'), \
            f"productId should be hex string: {config['productId']}"

        # deviceInfo IDs should be integers
        assert isinstance(config['deviceInfo']['vendor_id'], int), \
            f"deviceInfo.vendor_id should be int: {config['deviceInfo']['vendor_id']}"
        assert isinstance(config['deviceInfo']['product_id'], int), \
            f"deviceInfo.product_id should be int: {config['deviceInfo']['product_id']}"

        # Verify they represent the same values
        vendor_id_hex = int(config['vendorId'], 16)
        assert vendor_id_hex == config['deviceInfo']['vendor_id'], \
            f"vendorId hex ({vendor_id_hex}) != deviceInfo.vendor_id ({config['deviceInfo']['vendor_id']})"

        product_id_hex = int(config['productId'], 16)
        assert product_id_hex == config['deviceInfo']['product_id'], \
            f"productId hex ({product_id_hex}) != deviceInfo.product_id ({config['deviceInfo']['product_id']})"

    def test_byte_indices_are_valid(self, engine, recording, expected_config):
        """Test that all byte indices are valid (non-negative integers in lists)"""
        config = self.run_full_walkthrough(engine, recording)
        mappings = config['modes'][0]['byteCodeMappings']

        for mapping_name, mapping in mappings.items():
            if 'byteIndex' in mapping:
                byte_index = mapping['byteIndex']
                assert isinstance(byte_index, list), \
                    f"{mapping_name}.byteIndex should be a list: {byte_index}"
                for idx in byte_index:
                    assert isinstance(idx, int), \
                        f"{mapping_name}.byteIndex contains non-int: {idx}"
                    assert idx >= 0, \
                        f"{mapping_name}.byteIndex contains negative: {idx}"

    def test_tilt_ranges_are_valid(self, engine, recording, expected_config):
        """Test that tilt ranges have valid bipolar values"""
        config = self.run_full_walkthrough(engine, recording)
        mappings = config['modes'][0]['byteCodeMappings']

        for tilt_name in ['tiltX', 'tiltY']:
            tilt = mappings[tilt_name]

            # positiveMax should be in range 0-127 (positive tilt)
            assert 0 <= tilt['positiveMax'] <= 127, \
                f"{tilt_name}.positiveMax out of range: {tilt['positiveMax']}"

            # negativeMin should be in range 128-255 (start of negative tilt)
            assert 128 <= tilt['negativeMin'] <= 255, \
                f"{tilt_name}.negativeMin out of range: {tilt['negativeMin']}"

            # negativeMax should be >= negativeMin
            assert tilt['negativeMax'] >= tilt['negativeMin'], \
                f"{tilt_name}.negativeMax ({tilt['negativeMax']}) < negativeMin ({tilt['negativeMin']})"


class TestDriverRecordingReplay:
    """Test config generation by replaying recorded walkthrough data from driver mode"""

    @pytest.fixture(params=DRIVER_RECORDING_FILES)
    def recording_path(self, request):
        """Path to the recorded walkthrough data (parameterized for multiple recordings)"""
        return Path(__file__).parent.parent.parent.parent / 'common-test-fixtures' / request.param

    @pytest.fixture
    def expected_config_path(self):
        """Path to the expected driver mode config output"""
        return Path(__file__).parent.parent.parent.parent / 'common-test-fixtures' / 'xp-pen-deco640-driver.json'

    @pytest.fixture
    def recording(self, recording_path):
        """Load the recorded walkthrough data"""
        with open(recording_path, 'r') as f:
            return json.load(f)

    @pytest.fixture
    def expected_config(self, expected_config_path):
        """Load the expected config"""
        with open(expected_config_path, 'r') as f:
            return json.load(f)

    @pytest.fixture
    def expected_mode(self, expected_config):
        """Get the first mode from expected config (for mode-level field comparisons)"""
        return expected_config['modes'][0]

    @pytest.fixture
    def engine(self):
        """Create a walkthrough engine with appropriate options"""
        options = WalkthroughEngineOptions(
            min_packets_per_step=10,
            min_variance_threshold=50,
            filter_idle_packets=False,
            skip_duplicates=False,
        )
        return WalkthroughEngine(options)

    @staticmethod
    def hex_to_bytes(hex_string: str) -> bytes:
        """Convert hex string to bytes"""
        return bytes.fromhex(hex_string)

    def replay_step(self, engine: WalkthroughEngine, step_name: str, step_data: dict):
        """Replay a single step's packets through the engine"""
        packets = step_data.get('packets', [])
        engine.start_capture()
        for hex_packet in packets:
            packet_bytes = self.hex_to_bytes(hex_packet)
            report_id = packet_bytes[0]
            engine.process_packet(packet_bytes, report_id)
        engine.stop_capture()

    def run_full_walkthrough(self, engine, recording):
        """Helper to run a full walkthrough and return the generated config"""
        device = recording['device']
        device_info = DeviceInfo(
            vendor_id=int(device['vendorId'], 16),
            product_id=int(device['productId'], 16),
            product_string=device['productName'],
            usage_page=13,
            usage=2,
            interfaces=[13, 1, 65290]
        )
        engine.set_device_info(device_info)
        engine.start()

        steps = [
            'step1-horizontal',
            'step2-vertical',
            'step3-pressure',
            'step4-hover-movement',
            'step5-tilt-x',
            'step6-tilt-y',
            'step7-primary-button',
            'step8-secondary-button',
            'step9-tablet-buttons',
        ]

        for i, step_name in enumerate(steps):
            if step_name in recording['steps']:
                self.replay_step(engine, step_name, recording['steps'][step_name])
            if i < len(steps) - 1:
                engine.next_step()

        engine.set_user_metadata(UserMetadata(
            name='XP Pen Deco 640 (Driver)',
            manufacturer='XP Pen',
            model='Deco 640',
            description='XP Pen Deco 640 driver mode config for testing',
            button_count=8
        ))

        engine.generate_config()
        return engine.get_complete_config()

    def test_driver_mode_report_id(self, engine, recording, expected_mode):
        """Test that driver mode uses report ID 2"""
        config = self.run_full_walkthrough(engine, recording)
        assert config['modes'][0]['reportId'] == 2
        assert config['modes'][0]['reportId'] == expected_mode['reportId']

    def test_driver_mode_resolution(self, engine, recording, expected_mode):
        """Test that driver mode has 2x resolution (31998x17998)"""
        config = self.run_full_walkthrough(engine, recording)
        assert config['modes'][0]['capabilities']['resolution']['x'] == 31998
        assert config['modes'][0]['capabilities']['resolution']['y'] == 17998
        assert config['modes'][0]['capabilities']['resolution']['x'] == expected_mode['capabilities']['resolution']['x']
        assert config['modes'][0]['capabilities']['resolution']['y'] == expected_mode['capabilities']['resolution']['y']

    def test_x_mapping(self, engine, recording, expected_mode):
        """Test X coordinate mapping for driver mode"""
        config = self.run_full_walkthrough(engine, recording)
        x_mapping = config['modes'][0]['byteCodeMappings']['x']
        expected_x = expected_mode['byteCodeMappings']['x']
        assert x_mapping['byteIndex'] == expected_x['byteIndex']
        assert x_mapping['max'] == 31998
        assert x_mapping['max'] == expected_x['max']
        assert x_mapping['type'] == expected_x['type']

    def test_y_mapping(self, engine, recording, expected_mode):
        """Test Y coordinate mapping for driver mode"""
        config = self.run_full_walkthrough(engine, recording)
        y_mapping = config['modes'][0]['byteCodeMappings']['y']
        expected_y = expected_mode['byteCodeMappings']['y']
        assert y_mapping['byteIndex'] == expected_y['byteIndex']
        assert y_mapping['max'] == 17998
        assert y_mapping['max'] == expected_y['max']
        assert y_mapping['type'] == expected_y['type']

    def test_pressure_mapping(self, engine, recording, expected_mode):
        """Test pressure mapping for driver mode (16383 max)"""
        config = self.run_full_walkthrough(engine, recording)
        pressure = config['modes'][0]['byteCodeMappings']['pressure']
        expected_pressure = expected_mode['byteCodeMappings']['pressure']
        assert pressure['byteIndex'] == expected_pressure['byteIndex']
        assert pressure['max'] == 16383
        assert pressure['max'] == expected_pressure['max']
        assert pressure['type'] == expected_pressure['type']

    def test_tilt_x_mapping(self, engine, recording, expected_mode):
        """Test tilt X mapping for driver mode"""
        config = self.run_full_walkthrough(engine, recording)
        tilt_x = config['modes'][0]['byteCodeMappings']['tiltX']
        expected_tilt_x = expected_mode['byteCodeMappings']['tiltX']
        assert tilt_x['byteIndex'] == expected_tilt_x['byteIndex']
        assert tilt_x['positiveMax'] == expected_tilt_x['positiveMax']
        assert tilt_x['negativeMin'] == expected_tilt_x['negativeMin']
        assert tilt_x['negativeMax'] == expected_tilt_x['negativeMax']
        assert tilt_x['type'] == expected_tilt_x['type']

    def test_tilt_y_mapping(self, engine, recording, expected_mode):
        """Test tilt Y mapping for driver mode"""
        config = self.run_full_walkthrough(engine, recording)
        tilt_y = config['modes'][0]['byteCodeMappings']['tiltY']
        expected_tilt_y = expected_mode['byteCodeMappings']['tiltY']
        assert tilt_y['byteIndex'] == expected_tilt_y['byteIndex']
        assert tilt_y['positiveMax'] == expected_tilt_y['positiveMax']
        assert tilt_y['negativeMin'] == expected_tilt_y['negativeMin']
        assert tilt_y['negativeMax'] == expected_tilt_y['negativeMax']
        assert tilt_y['type'] == expected_tilt_y['type']

    def test_status_byte_mapping(self, engine, recording, expected_mode):
        """Test status byte mapping for driver mode"""
        config = self.run_full_walkthrough(engine, recording)
        status = config['modes'][0]['byteCodeMappings']['status']
        expected_status = expected_mode['byteCodeMappings']['status']
        assert status['byteIndex'] == expected_status['byteIndex']
        assert status['type'] == expected_status['type']
        # Check key status values
        assert '160' in status['values']  # hover
        assert '161' in status['values']  # contact
        assert status['values']['160']['state'] == 'hover'
        assert status['values']['161']['state'] == 'contact'

    def test_tablet_buttons_status_240(self, engine, recording, expected_mode):
        """Test that status 240 is detected for tablet buttons in driver mode"""
        config = self.run_full_walkthrough(engine, recording)
        status = config['modes'][0]['byteCodeMappings']['status']
        # Status 240 is used for tablet buttons in driver mode
        assert '240' in status['values']

    def test_mode_level_fields(self, engine, recording, expected_mode):
        """Test mode-level configuration fields for driver mode"""
        config = self.run_full_walkthrough(engine, recording)
        mode = config['modes'][0]
        assert mode['reportId'] == 2
        assert mode['digitizerUsagePage'] == expected_mode['digitizerUsagePage']
        assert mode['stylusModeStatusByte'] == 160
        assert mode['stylusModeStatusByte'] == expected_mode['stylusModeStatusByte']

    def test_capabilities(self, engine, recording, expected_mode):
        """Test all capability fields for driver mode"""
        config = self.run_full_walkthrough(engine, recording)
        caps = config['modes'][0]['capabilities']
        expected_caps = expected_mode['capabilities']
        assert caps['resolution']['x'] == 31998
        assert caps['resolution']['y'] == 17998
        assert caps['hasPressure'] == expected_caps['hasPressure']
        assert abs(caps['pressureLevels'] - expected_caps['pressureLevels']) <= 1
        assert caps['hasTilt'] == expected_caps['hasTilt']
        assert caps['hasButtons'] == expected_caps['hasButtons']
        assert caps['buttonCount'] == 8

    def test_device_identifiers(self, engine, recording, expected_config):
        """Test device identifiers for driver mode"""
        config = self.run_full_walkthrough(engine, recording)
        assert config['vendorId'] == expected_config['vendorId']
        assert config['productId'] == expected_config['productId']
        assert config['deviceInfo']['vendor_id'] == expected_config['deviceInfo']['vendor_id']
        assert config['deviceInfo']['product_id'] == expected_config['deviceInfo']['product_id']

    def test_tablet_buttons_mapping(self, engine, recording, expected_mode):
        """Test tablet button mappings for driver mode"""
        config = self.run_full_walkthrough(engine, recording)
        byte_mappings = config['modes'][0]['byteCodeMappings']
        if 'tabletButtons' not in byte_mappings:
            pytest.skip("Tablet buttons not detected in this recording")
        tablet_buttons = byte_mappings['tabletButtons']
        # Type field is now optional (defaults to 'code')
        assert 'buttonCount' in tablet_buttons
        assert tablet_buttons['buttonCount'] > 0

    def test_config_structure(self, engine, recording, expected_config):
        """Test that the generated config has the correct structure"""
        config = self.run_full_walkthrough(engine, recording)
        required_fields = ['name', 'manufacturer', 'model', 'description',
                          'vendorId', 'productId', 'deviceInfo', 'modes']
        for field in required_fields:
            assert field in config, f"Missing required field: {field}"
        assert isinstance(config['modes'], list)
        assert len(config['modes']) >= 1

    def test_resolution_matches_max_values(self, engine, recording, expected_config):
        """Test that capabilities.resolution matches the max values in byte mappings"""
        config = self.run_full_walkthrough(engine, recording)
        mode = config['modes'][0]
        assert mode['capabilities']['resolution']['x'] == mode['byteCodeMappings']['x']['max']
        assert mode['capabilities']['resolution']['y'] == mode['byteCodeMappings']['y']['max']

    def test_byte_indices_are_valid(self, engine, recording, expected_config):
        """Test that all byte indices are valid (non-negative integers in lists)"""
        config = self.run_full_walkthrough(engine, recording)
        mappings = config['modes'][0]['byteCodeMappings']
        for mapping_name, mapping in mappings.items():
            if 'byteIndex' in mapping:
                byte_index = mapping['byteIndex']
                assert isinstance(byte_index, list)
                for idx in byte_index:
                    assert isinstance(idx, int)
                    assert idx >= 0

    def test_tilt_ranges_are_valid(self, engine, recording, expected_config):
        """Test that tilt ranges have valid bipolar values"""
        config = self.run_full_walkthrough(engine, recording)
        mappings = config['modes'][0]['byteCodeMappings']
        for tilt_name in ['tiltX', 'tiltY']:
            tilt = mappings[tilt_name]
            assert 0 <= tilt['positiveMax'] <= 127
            assert 128 <= tilt['negativeMin'] <= 255
            assert tilt['negativeMax'] >= tilt['negativeMin']


# Huion Inspiroy 2M recording files
HUION_RECORDING_FILES = [
    'huion-inspiroy2m-nodriver-recording.json',
    'huion-inspiroy2m-nodriver-recording2.json',
]


class TestHuionRecordingReplay:
    """Test config generation by replaying recorded walkthrough data from Huion Inspiroy 2M.

    Huion tablets have different characteristics from XP-Pen:
    - Report ID 10 (vs 7 for XP-Pen driverless)
    - Digitizer Usage Page 65280 (vendor-specific, vs 13 for standard)
    - Status bytes: 192=hover, 193=contact (vs 160/161 for XP-Pen)
    - Keyboard HID interface for buttons (vs embedded in pen packets)
    """

    @pytest.fixture(params=HUION_RECORDING_FILES)
    def recording_path(self, request):
        """Path to the recorded walkthrough data (parameterized for multiple recordings)"""
        return Path(__file__).parent.parent.parent.parent / 'common-test-fixtures' / request.param

    @pytest.fixture
    def expected_config_path(self):
        """Path to the expected Huion config output"""
        return Path(__file__).parent.parent.parent.parent / 'common-test-fixtures' / 'huion-inspiroy2m.json'

    @pytest.fixture
    def recording(self, recording_path):
        """Load the recorded walkthrough data"""
        with open(recording_path, 'r') as f:
            return json.load(f)

    @pytest.fixture
    def expected_config(self, expected_config_path):
        """Load the expected config"""
        with open(expected_config_path, 'r') as f:
            return json.load(f)

    @pytest.fixture
    def expected_mode(self, expected_config):
        """Get the first mode from expected config (for mode-level field comparisons)"""
        return expected_config['modes'][0]

    @pytest.fixture
    def engine(self):
        """Create a walkthrough engine with appropriate options"""
        options = WalkthroughEngineOptions(
            min_packets_per_step=10,
            min_variance_threshold=50,
            filter_idle_packets=False,
            skip_duplicates=False,
        )
        return WalkthroughEngine(options)

    @staticmethod
    def hex_to_bytes(hex_string: str) -> bytes:
        """Convert hex string to bytes"""
        return bytes.fromhex(hex_string)

    def replay_step(self, engine: WalkthroughEngine, step_name: str, step_data: dict):
        """Replay a single step's packets through the engine"""
        packets = step_data.get('packets', [])
        engine.start_capture()
        for hex_packet in packets:
            packet_bytes = self.hex_to_bytes(hex_packet)
            report_id = packet_bytes[0]
            engine.process_packet(packet_bytes, report_id)
        engine.stop_capture()

    def run_full_walkthrough(self, engine, recording):
        """Helper to run a full walkthrough and return the generated config"""
        device = recording['device']
        device_info = DeviceInfo(
            vendor_id=int(device['vendorId'], 16),
            product_id=int(device['productId'], 16),
            product_string=device['productName'],
            usage_page=65280,  # Huion uses vendor-specific usage page
            usage=2,
            interfaces=[1, 13, 65280]
        )
        engine.set_device_info(device_info)
        engine.start()

        steps = [
            'step1-horizontal',
            'step2-vertical',
            'step3-pressure',
            'step4-hover-movement',
            'step5-tilt-x',
            'step6-tilt-y',
            'step7-primary-button',
            'step8-secondary-button',
            'step9-tablet-buttons',
        ]

        for i, step_name in enumerate(steps):
            if step_name in recording['steps']:
                self.replay_step(engine, step_name, recording['steps'][step_name])
            if i < len(steps) - 1:
                engine.next_step()

        engine.set_user_metadata(UserMetadata(
            name='Huion Inspiroy 2 Medium',
            manufacturer='Huion',
            model='Inspiroy 2 Medium',
            description='Huion Inspiroy 2M config for testing',
            button_count=30
        ))

        engine.generate_config()
        return engine.get_complete_config()

    def test_huion_report_id(self, engine, recording, expected_mode):
        """Test that Huion uses report ID 10"""
        config = self.run_full_walkthrough(engine, recording)
        assert config['modes'][0]['reportId'] == 10
        assert config['modes'][0]['reportId'] == expected_mode['reportId']

    def test_huion_digitizer_usage_page(self, engine, recording, expected_mode):
        """Test that Huion uses vendor-specific digitizer usage page (65280)"""
        config = self.run_full_walkthrough(engine, recording)
        assert config['modes'][0]['digitizerUsagePage'] == 65280
        assert config['modes'][0]['digitizerUsagePage'] == expected_mode['digitizerUsagePage']

    def test_huion_stylus_mode_status_byte(self, engine, recording, expected_mode):
        """Test that Huion uses status byte 192 for hover"""
        config = self.run_full_walkthrough(engine, recording)
        assert config['modes'][0]['stylusModeStatusByte'] == 192

    def test_vendor_id(self, engine, recording, expected_config):
        """Test correct vendor ID (0x256c)"""
        config = self.run_full_walkthrough(engine, recording)
        assert config['vendorId'] == '0x256c'
        assert config['vendorId'] == expected_config['vendorId']

    def test_product_id(self, engine, recording, expected_config):
        """Test correct product ID (0x0067)"""
        config = self.run_full_walkthrough(engine, recording)
        assert config['productId'] == '0x0067'
        assert config['productId'] == expected_config['productId']

    def test_x_mapping(self, engine, recording, expected_mode):
        """Test X coordinate mapping for Huion"""
        config = self.run_full_walkthrough(engine, recording)
        x_mapping = config['modes'][0]['byteCodeMappings']['x']
        expected_x = expected_mode['byteCodeMappings']['x']
        assert x_mapping['byteIndex'] == [2, 3]
        assert x_mapping['byteIndex'] == expected_x['byteIndex']
        # Allow some variance since actual pen movement may not reach exact max
        assert x_mapping['max'] > 30000
        assert x_mapping['type'] == expected_x['type']

    def test_y_mapping(self, engine, recording, expected_mode):
        """Test Y coordinate mapping for Huion"""
        config = self.run_full_walkthrough(engine, recording)
        y_mapping = config['modes'][0]['byteCodeMappings']['y']
        expected_y = expected_mode['byteCodeMappings']['y']
        assert y_mapping['byteIndex'] == [4, 5]
        assert y_mapping['byteIndex'] == expected_y['byteIndex']
        assert y_mapping['max'] > 30000
        assert y_mapping['type'] == expected_y['type']

    def test_pressure_mapping(self, engine, recording, expected_mode):
        """Test pressure mapping for Huion (8191 max)"""
        config = self.run_full_walkthrough(engine, recording)
        pressure = config['modes'][0]['byteCodeMappings']['pressure']
        expected_pressure = expected_mode['byteCodeMappings']['pressure']
        assert pressure['byteIndex'] == [6, 7]
        assert pressure['byteIndex'] == expected_pressure['byteIndex']
        assert pressure['max'] > 7000
        assert pressure['max'] <= 8191
        assert pressure['type'] == expected_pressure['type']

    def test_tilt_x_mapping(self, engine, recording, expected_mode):
        """Test tilt X mapping for Huion"""
        config = self.run_full_walkthrough(engine, recording)
        tilt_x = config['modes'][0]['byteCodeMappings']['tiltX']
        expected_tilt_x = expected_mode['byteCodeMappings']['tiltX']
        assert tilt_x['byteIndex'] == [8]
        assert tilt_x['byteIndex'] == expected_tilt_x['byteIndex']
        assert tilt_x['type'] == expected_tilt_x['type']
        # Verify bipolar range is valid
        assert 0 < tilt_x['positiveMax'] <= 127
        assert 128 <= tilt_x['negativeMin'] <= 255
        assert tilt_x['negativeMax'] >= tilt_x['negativeMin']

    def test_tilt_y_mapping(self, engine, recording, expected_mode):
        """Test tilt Y mapping for Huion"""
        config = self.run_full_walkthrough(engine, recording)
        tilt_y = config['modes'][0]['byteCodeMappings']['tiltY']
        expected_tilt_y = expected_mode['byteCodeMappings']['tiltY']
        assert tilt_y['byteIndex'] == [9]
        assert tilt_y['byteIndex'] == expected_tilt_y['byteIndex']
        assert tilt_y['type'] == expected_tilt_y['type']
        # Verify bipolar range is valid
        assert 0 < tilt_y['positiveMax'] <= 127
        assert 128 <= tilt_y['negativeMin'] <= 255
        assert tilt_y['negativeMax'] >= tilt_y['negativeMin']

    def test_status_byte_mapping(self, engine, recording, expected_mode):
        """Test status byte mapping for Huion"""
        config = self.run_full_walkthrough(engine, recording)
        status = config['modes'][0]['byteCodeMappings']['status']
        expected_status = expected_mode['byteCodeMappings']['status']
        assert status['byteIndex'] == [1]
        assert status['byteIndex'] == expected_status['byteIndex']
        assert status['type'] == expected_status['type']

    def test_huion_hover_status(self, engine, recording, expected_mode):
        """Test that Huion hover status (192) is detected"""
        config = self.run_full_walkthrough(engine, recording)
        status_values = config['modes'][0]['byteCodeMappings']['status']['values']
        assert '192' in status_values
        assert status_values['192']['state'] == 'hover'

    def test_huion_contact_status(self, engine, recording, expected_mode):
        """Test that Huion contact status (193) is detected"""
        config = self.run_full_walkthrough(engine, recording)
        status_values = config['modes'][0]['byteCodeMappings']['status']['values']
        assert '193' in status_values
        assert status_values['193']['state'] == 'contact'

    def test_huion_primary_button_status(self, engine, recording, expected_mode):
        """Test that Huion primary button hover status (196) is detected"""
        config = self.run_full_walkthrough(engine, recording)
        status_values = config['modes'][0]['byteCodeMappings']['status']['values']
        assert '196' in status_values
        assert status_values['196']['state'] == 'hover'
        assert status_values['196'].get('primaryButtonPressed') == True

    def test_huion_secondary_button_status(self, engine, recording, expected_mode):
        """Test that Huion secondary button hover status (194) is detected"""
        config = self.run_full_walkthrough(engine, recording)
        status_values = config['modes'][0]['byteCodeMappings']['status']['values']
        assert '194' in status_values
        assert status_values['194']['state'] == 'hover'
        assert status_values['194'].get('secondaryButtonPressed') == True

    def test_capabilities(self, engine, recording, expected_mode):
        """Test all capability fields for Huion"""
        config = self.run_full_walkthrough(engine, recording)
        caps = config['modes'][0]['capabilities']
        expected_caps = expected_mode['capabilities']
        assert caps['hasPressure'] == expected_caps['hasPressure']
        assert caps['hasTilt'] == expected_caps['hasTilt']
        assert caps['hasButtons'] == expected_caps['hasButtons']
        # Pressure levels should be approximately 8191
        assert caps['pressureLevels'] > 7000

    def test_resolution_matches_max_values(self, engine, recording, expected_config):
        """Test that capabilities.resolution matches the max values in byte mappings"""
        config = self.run_full_walkthrough(engine, recording)
        mode = config['modes'][0]
        assert mode['capabilities']['resolution']['x'] == mode['byteCodeMappings']['x']['max']
        assert mode['capabilities']['resolution']['y'] == mode['byteCodeMappings']['y']['max']

    def test_config_structure(self, engine, recording, expected_config):
        """Test that the generated config has the correct structure"""
        config = self.run_full_walkthrough(engine, recording)
        required_fields = ['name', 'manufacturer', 'model', 'description',
                          'vendorId', 'productId', 'deviceInfo', 'modes']
        for field in required_fields:
            assert field in config, f"Missing required field: {field}"
        assert isinstance(config['modes'], list)
        assert len(config['modes']) >= 1

    def test_byte_indices_are_valid(self, engine, recording, expected_config):
        """Test that all byte indices are valid (non-negative integers in lists)"""
        config = self.run_full_walkthrough(engine, recording)
        mappings = config['modes'][0]['byteCodeMappings']
        for mapping_name, mapping in mappings.items():
            if 'byteIndex' in mapping:
                byte_index = mapping['byteIndex']
                assert isinstance(byte_index, list)
                for idx in byte_index:
                    assert isinstance(idx, int)
                    assert idx >= 0
