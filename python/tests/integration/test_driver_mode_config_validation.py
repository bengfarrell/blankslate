#!/usr/bin/env python3
"""
COMPREHENSIVE TEST: Validate walkthrough against stable driver-mode config
This test:
1. Loads the stable XP-Pen driver-enabled config
2. Generates mock data with driver-mode settings (report ID 2, status byte 240 for buttons, 2x resolution)
3. Runs the walkthrough
4. Asserts the generated config matches the stable driver-mode config

This validates that the walkthrough correctly handles devices when the driver is active.
"""
import asyncio
import json
import sys
from pathlib import Path

from blankslate.core.walkthrough_controller import WalkthroughController, WalkthroughControllerOptions, UserMetadata
from blankslate.core.hid_reader_factory import HIDReaderFactory
from blankslate.mockbytes.mock_hid_reader import MockHIDReader
from blankslate.mockbytes.tablet_data_generator import TabletDataGenerator, DRIVER_MODE_CONFIG
from blankslate.cli.cli_walkthrough_view import CLIWalkthroughView


# Path to stable driver-mode config (relative to this file's location)
STABLE_CONFIG_PATH = Path(__file__).parent.parent.parent.parent / 'public' / 'configs' / 'xp-pen-deco640-osx-python-driver.json'


class SingleReportIDGenerator:
    """Generator that wraps TabletDataGenerator and adds a single report ID"""

    def __init__(self, base_generator, report_id=2, device_info=None):
        self.generator = base_generator
        self.report_id = report_id
        self._device_info = device_info or {}

    def get_device_info(self):
        """Return device info for the mock reader"""
        return self._device_info

    def _wrap_generator(self, gen):
        """Wrap generator to add report IDs"""
        for packet in gen:
            yield (packet, self.report_id)

    def __getattr__(self, name):
        """Delegate to underlying generator"""
        attr = getattr(self.generator, name)
        if callable(attr):
            def wrapper(*args, **kwargs):
                return self._wrap_generator(attr(*args, **kwargs))
            return wrapper
        return attr


class ReportIDMockReader(MockHIDReader):
    """Mock reader that handles (packet, report_id) tuples"""

    async def play(self, packets):
        self.is_playing = True
        try:
            for packet_data in packets:
                if not self.is_playing:
                    break

                if isinstance(packet_data, tuple):
                    packet, report_id = packet_data
                else:
                    packet = packet_data
                    report_id = 2  # Default to report ID 2 for driver mode

                if self.is_reading and self.callback:
                    # Prepend report ID to match real HID reader behavior
                    packet_with_report_id = bytes([report_id]) + packet
                    self.callback(packet_with_report_id, report_id)

                await asyncio.sleep(self.config.packet_interval / 1000.0)
        finally:
            self.is_playing = False


class AutoView(CLIWalkthroughView):
    """Automated view"""
    def __init__(self, stable_config):
        super().__init__()
        self.stable_config = stable_config

    def show_header(self):
        print("\n🧪 Driver Mode Stable Config Validation Test")
        print("=" * 70)

    def show_step_info(self, step_info):
        print(f"\n[Step {step_info.number}] {step_info.title}")

    def on_capture_complete(self, status):
        print(f"  ✓ {status.packet_count} packets")

    def on_bytes_detected(self, bytes_info):
        if bytes_info:
            print(f"  ✓ Bytes: {[b.byte_index for b in bytes_info]}")

    async def prompt_data_source(self): return 'mock'
    async def wait_for_gesture_complete(self): await asyncio.sleep(0.1)
    async def prompt_navigation(self): return 'next'
    async def prompt_button_count(self):
        return self.stable_config.get('capabilities', {}).get('buttonCount', 0)
    async def prompt_metadata(self):
        return UserMetadata(
            name=self.stable_config.get('name', 'Test'),
            manufacturer=self.stable_config.get('manufacturer', 'Test'),
            model=self.stable_config.get('model', 'Test'),
            description=self.stable_config.get('description', 'Test'),
            button_count=self.stable_config.get('capabilities', {}).get('buttonCount', 0)
        )
    def show_completion(self, config): print("\n✅ Walkthrough Complete!")
    async def prompt_save_config(self, config): return (False, None)
    def on_capture_start(self): pass
    def on_capture_progress(self, status): pass
    def show_button_detection_prompt(self, button_number): pass
    def show_info(self, message): pass
    def show_success(self, message): pass
    def show_error(self, message): print(f"❌ {message}")


async def test():
    """Run the test"""
    print("=" * 80)
    print("COMPREHENSIVE DRIVER MODE CONFIG VALIDATION TEST")
    print("=" * 80)
    
    # Load stable config
    if not STABLE_CONFIG_PATH.exists():
        print(f"❌ Stable driver-mode config not found: {STABLE_CONFIG_PATH}")
        return 1
    
    with open(STABLE_CONFIG_PATH) as f:
        stable_config = json.load(f)
    
    print(f"\n✓ Loaded stable driver-mode config")
    print(f"  Path: {STABLE_CONFIG_PATH}")
    print(f"  reportId: {stable_config.get('reportId')}")
    print(f"  resolution: {stable_config.get('capabilities', {}).get('resolution', {})}")
    
    # Create base generator with driver mode settings
    # Uses DRIVER_MODE_CONFIG preset: same resolution as driverless, driver_mode=True for button status byte
    base_gen = TabletDataGenerator(DRIVER_MODE_CONFIG)

    # Create device info matching stable config
    device_info = {
        'vendor_id': stable_config['deviceInfo']['vendor_id'],
        'product_id': stable_config['deviceInfo']['product_id'],
        'product_string': stable_config['deviceInfo']['product_string'],
        'manufacturer': stable_config.get('manufacturer', 'Unknown'),
        'usage_page': stable_config['deviceInfo']['usage_page'],
        'usage': stable_config['deviceInfo']['usage'],
        'interfaces': stable_config['deviceInfo']['interfaces']
    }

    # Wrap with single report ID generator (report ID 2 for driver mode)
    single_gen = SingleReportIDGenerator(base_gen, report_id=2, device_info=device_info)
    mock_reader = ReportIDMockReader(custom_generator=single_gen)
    
    class TestFactory(HIDReaderFactory):
        async def create_mock_reader(self): return mock_reader

    controller = WalkthroughController(
        AutoView(stable_config),
        TestFactory(),
        WalkthroughControllerOptions(auto_play_mock_gestures=True, gesture_play_duration=2000, button_confirmations=1)
    )

    # Run walkthrough
    try:
        await asyncio.wait_for(controller.run(force_mock=True), timeout=60.0)
    except asyncio.TimeoutError:
        print("\n❌ Timeout!")
        return 1

    generated = controller.engine.get_complete_config()
    if not generated:
        print("\n❌ No config generated!")
        return 1

    # VALIDATE (in memory, no file output)
    print("\n" + "=" * 80)
    print("VALIDATION")
    print("=" * 80)

    # Generated config should be in multi-mode format
    if 'modes' not in generated or len(generated['modes']) == 0:
        print("\n❌ Generated config is not in multi-mode format!")
        return 1

    print(f"✅ Config is in multi-mode format with {len(generated['modes'])} mode(s)")

    # Extract first mode for comparison
    gen_mode = generated['modes'][0]

    errors = []
    stable_mappings = stable_config.get('byteCodeMappings', {})
    gen_mappings = gen_mode.get('byteCodeMappings', {})

    # Report ID (CRITICAL for driver mode: should be 2)
    gen_report_id = gen_mode.get('reportId')
    stable_report_id = stable_config.get('reportId')
    if gen_report_id != stable_report_id:
        errors.append(f"reportId: {gen_report_id} != {stable_report_id}")
    else:
        print(f"✅ reportId: {gen_report_id}")

    # Vendor ID, Product ID, Device Info (SKIP - these come from the mock device)
    print("⚠️  Skipping vendorId, productId, deviceInfo validation (mock device values)")

    # Digitizer Usage Page (CRITICAL)
    gen_digitizer = generated.get('digitizerUsagePage')
    stable_digitizer = stable_config.get('digitizerUsagePage')
    if gen_digitizer != stable_digitizer:
        errors.append(f"digitizerUsagePage: {gen_digitizer} != {stable_digitizer}")
    else:
        print(f"✅ digitizerUsagePage: {gen_digitizer}")

    # Stylus Mode Status Byte (CRITICAL)
    gen_stylus_byte = generated.get('stylusModeStatusByte')
    stable_stylus_byte = stable_config.get('stylusModeStatusByte')
    if gen_stylus_byte != stable_stylus_byte:
        errors.append(f"stylusModeStatusByte: {gen_stylus_byte} != {stable_stylus_byte}")
    else:
        print(f"✅ stylusModeStatusByte: {gen_stylus_byte}")

    # Capabilities (CRITICAL)
    gen_caps = generated.get('capabilities', {})
    stable_caps = stable_config.get('capabilities', {})

    # Validate all capability fields including button-related ones
    for key in ['hasPressure', 'hasTilt', 'hasButtons', 'buttonCount']:
        gen_val = gen_caps.get(key)
        stable_val = stable_caps.get(key)
        if gen_val != stable_val:
            errors.append(f"capabilities.{key}: {gen_val} != {stable_val}")
        else:
            print(f"✅ capabilities.{key}: {gen_val}")

    # pressureLevels: allow tolerance of ±10
    gen_pressure_levels = gen_caps.get('pressureLevels')
    stable_pressure_levels = stable_caps.get('pressureLevels')
    PRESSURE_TOLERANCE = 10
    if gen_pressure_levels and stable_pressure_levels and abs(gen_pressure_levels - stable_pressure_levels) <= PRESSURE_TOLERANCE:
        print(f"✅ capabilities.pressureLevels: {gen_pressure_levels} (within {PRESSURE_TOLERANCE} of {stable_pressure_levels})")
    elif gen_pressure_levels != stable_pressure_levels:
        errors.append(f"capabilities.pressureLevels: {gen_pressure_levels} != {stable_pressure_levels} (tolerance: {PRESSURE_TOLERANCE})")
    else:
        print(f"✅ capabilities.pressureLevels: {gen_pressure_levels}")

    # Capabilities resolution (same for driver and driverless - hardware constant)
    gen_res = gen_caps.get('resolution', {})
    stable_res = stable_caps.get('resolution', {})
    for key in ['x', 'y']:
        gen_val = gen_res.get(key)
        stable_val = stable_res.get(key)
        if gen_val != stable_val:
            errors.append(f"capabilities.resolution.{key}: {gen_val} != {stable_val}")
        else:
            print(f"✅ capabilities.resolution.{key}: {gen_val}")

    # Byte indices (CRITICAL)
    for key in ['status', 'x', 'y', 'pressure', 'tiltX', 'tiltY']:
        gen_idx = gen_mappings.get(key, {}).get('byteIndex', [])
        stable_idx = stable_mappings.get(key, {}).get('byteIndex', [])
        if gen_idx != stable_idx:
            errors.append(f"{key} byteIndex: {gen_idx} != {stable_idx}")
        else:
            print(f"✅ {key} byteIndex: {gen_idx}")

    # Max values (same for driver and driverless - hardware constant)
    for key in ['x', 'y', 'pressure']:
        gen_max = gen_mappings.get(key, {}).get('max')
        stable_max = stable_mappings.get(key, {}).get('max')
        if gen_max != stable_max:
            errors.append(f"{key} max: {gen_max} != {stable_max}")
        else:
            print(f"✅ {key} max: {gen_max}")

    # Tilt bipolar ranges (CRITICAL)
    for key in ['tiltX', 'tiltY']:
        gen_tilt = gen_mappings.get(key, {})
        stable_tilt = stable_mappings.get(key, {})
        
        for prop in ['positiveMax', 'negativeMin', 'negativeMax']:
            gen_val = gen_tilt.get(prop)
            stable_val = stable_tilt.get(prop)
            if gen_val != stable_val:
                errors.append(f"{key}.{prop}: {gen_val} != {stable_val}")
            else:
                print(f"✅ {key}.{prop}: {gen_val}")

    # Status codes (CRITICAL) - test ALL status codes
    gen_status = gen_mappings.get('status', {}).get('values', {})
    stable_status = stable_mappings.get('status', {}).get('values', {})

    # Test pen-related status codes (160-165, 192)
    pen_status_codes = ['160', '161', '162', '163', '164', '165', '192']
    # Test driver-mode button status code (240 = 0xf0)
    button_status_codes = ['240']
    
    all_status_codes = pen_status_codes + button_status_codes

    for code in all_status_codes:
        gen_val = gen_status.get(code)
        stable_val = stable_status.get(code)
        if stable_val is None:
            continue  # Skip if not in stable config
        if gen_val is None:
            errors.append(f"status.values['{code}']: MISSING (expected '{stable_val}')")
        elif gen_val != stable_val:
            errors.append(f"status.values['{code}']: '{gen_val}' != '{stable_val}'")
        else:
            print(f"✅ status.values['{code}']: {gen_val}")

    # Tablet buttons (CRITICAL for driver mode - bit-flag encoding)
    gen_buttons = gen_mappings.get('tabletButtons', {})
    stable_buttons = stable_mappings.get('tabletButtons', {})
    
    # Check button byte index
    gen_btn_idx = gen_buttons.get('byteIndex', [])
    stable_btn_idx = stable_buttons.get('byteIndex', [])
    if gen_btn_idx != stable_btn_idx:
        errors.append(f"tabletButtons byteIndex: {gen_btn_idx} != {stable_btn_idx}")
    else:
        print(f"✅ tabletButtons byteIndex: {gen_btn_idx}")

    # Check button count
    gen_btn_count = gen_buttons.get('buttonCount')
    stable_btn_count = stable_buttons.get('buttonCount')
    if gen_btn_count != stable_btn_count:
        errors.append(f"tabletButtons buttonCount: {gen_btn_count} != {stable_btn_count}")
    else:
        print(f"✅ tabletButtons buttonCount: {gen_btn_count}")

    # Check button values (driver mode uses bit-flags: 1, 2, 4, 8, 16, 32, 64, 128)
    gen_btn_values = gen_buttons.get('values', {})
    stable_btn_values = stable_buttons.get('values', {})
    driver_mode_bit_flags = ['1', '2', '4', '8', '16', '32', '64', '128']
    
    for code in driver_mode_bit_flags:
        gen_val = gen_btn_values.get(code)
        stable_val = stable_btn_values.get(code)
        if stable_val is None:
            continue
        if gen_val is None:
            errors.append(f"tabletButtons.values['{code}']: MISSING (expected '{stable_val}')")
        elif gen_val != stable_val:
            errors.append(f"tabletButtons.values['{code}']: '{gen_val}' != '{stable_val}'")
        else:
            print(f"✅ tabletButtons.values['{code}']: {gen_val}")

    # Results
    print("\n" + "=" * 80)
    if errors:
        print("❌ TEST FAILED")
        for error in errors:
            print(f"  • {error}")
        print("=" * 80)
        raise AssertionError(f"Failed with {len(errors)} error(s)")
    else:
        print("✅ TEST PASSED")
        print("=" * 80)
        return 0


if __name__ == '__main__':
    sys.exit(asyncio.run(test()))