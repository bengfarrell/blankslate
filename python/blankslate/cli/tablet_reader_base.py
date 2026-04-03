#!/usr/bin/env python3
"""
Tablet Reader Base

Shared functionality between tablet CLI tools (event-viewer, websocket-server)
Handles config loading, device initialization, mock mode, and graceful shutdown.
"""

import asyncio
import sys
import time
import signal
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, Callable, List
from dataclasses import dataclass

try:
    import hid
    from ..models import Config
    from ..core.data_helpers import process_device_data, process_keyboard_button_data
    from ..mockbytes import create_mock_hid_reader, MockHIDReader, create_config_based_generator
    from ..utils import find_and_open_device
except ImportError:
    import os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))
    import hid
    from blankslate.models import Config
    from blankslate.core.data_helpers import process_device_data, process_keyboard_button_data
    from blankslate.mockbytes import create_mock_hid_reader, MockHIDReader, create_config_based_generator
    from blankslate.utils import find_and_open_device


# ANSI color codes for terminal output
class Colors:
    RESET = '\033[0m'
    BOLD = '\033[1m'
    
    # Foreground colors
    BLACK = '\033[30m'
    RED = '\033[31m'
    GREEN = '\033[32m'
    YELLOW = '\033[33m'
    BLUE = '\033[34m'
    MAGENTA = '\033[35m'
    CYAN = '\033[36m'
    WHITE = '\033[37m'
    GRAY = '\033[90m'
    
    # Background colors
    BG_RED = '\033[41m'
    BG_GREEN = '\033[42m'
    BG_YELLOW = '\033[43m'


def colored(text: str, color: str, bold: bool = False) -> str:
    """Apply color to text"""
    prefix = Colors.BOLD if bold else ''
    return f"{prefix}{color}{text}{Colors.RESET}"


# Mock gesture sequence used for demo/testing
MOCK_GESTURES = [
    {'name': 'horizontal', 'duration': 2000, 'description': 'Horizontal line (X coordinate test)'},
    {'name': 'vertical', 'duration': 2000, 'description': 'Vertical line (Y coordinate test)'},
    {'name': 'circle', 'duration': 3000, 'description': 'Circle pattern (combined X/Y)'},
    {'name': 'pressure', 'duration': 2000, 'description': 'Pressure variation'},
    {'name': 'tilt-x', 'duration': 2000, 'description': 'Tilt X variation'},
    {'name': 'tilt-y', 'duration': 2000, 'description': 'Tilt Y variation'},
    {'name': 'hover', 'duration': 2000, 'description': 'Hover movement (no pressure)'},
    {'name': 'primary-button', 'duration': 1500, 'description': 'Primary button press'},
    {'name': 'secondary-button', 'duration': 1500, 'description': 'Secondary button press'},
    {'name': 'tablet-buttons', 'duration': 3000, 'description': 'Express key presses'},
]


@dataclass
class TabletEventData:
    """Processed tablet event with normalized values"""
    state: str
    x: float
    y: float
    pressure: float
    tiltX: float
    tiltY: float
    tiltXY: float
    primaryButtonPressed: bool
    secondaryButtonPressed: bool
    tabletButtons: int
    # Dynamic button properties (button1, button2, ..., buttonN) are added at runtime
    # Access via result['button1'], result['button2'], etc.


def normalize_tablet_event(events: Dict[str, Any]) -> TabletEventData:
    """Convert raw processDeviceData output to normalized TabletEventData.

    Supports dynamic button counts - will include all buttonN properties from the input.
    """
    tilt_x = float(events.get('tiltX', 0))
    tilt_y = float(events.get('tiltY', 0))

    # Calculate combined tilt
    import math
    import re
    tilt_xy = math.sqrt(tilt_x * tilt_x + tilt_y * tilt_y)
    if tilt_x * tilt_y != 0:
        tilt_xy *= math.copysign(1, tilt_x * tilt_y)

    # Create the base TabletEventData with known fields
    base_data = TabletEventData(
        state=str(events.get('state', 'unknown')),
        x=float(events.get('x', 0)),
        y=float(events.get('y', 0)),
        pressure=float(events.get('pressure', 0)),
        tiltX=tilt_x,
        tiltY=tilt_y,
        tiltXY=max(-1, min(1, tilt_xy)),
        primaryButtonPressed=bool(events.get('primaryButton') or events.get('primaryButtonPressed')),
        secondaryButtonPressed=bool(events.get('secondaryButton') or events.get('secondaryButtonPressed')),
        tabletButtons=int(events.get('tabletButtons', 0)),
    )

    # Dynamically add all button properties (button1, button2, ..., buttonN) as attributes
    button_pattern = re.compile(r'^button\d+$')
    for key in events:
        if button_pattern.match(key):
            setattr(base_data, key, bool(events[key]))

    return base_data


class TabletReaderBase(ABC):
    """Abstract base class for tablet readers (event-viewer, websocket-server, etc.)"""
    
    def __init__(self, config_path: str, mock: bool = False, exit_on_stop: bool = True):
        self.config_path = config_path
        self.is_mock_mode = mock
        self.exit_on_stop = exit_on_stop

        # Load config
        self.config_data = Config.load(config_path)

        # Multi-mode support
        self.current_mode = None  # Will be set when first packet is received
        self.detected_report_id = None

        # State
        self.reader: Optional[Any] = None
        self.device = None
        self.packet_count = 0
        self.current_gesture_index = 0
        self.is_running = False
        
        # Timers and tasks
        self.gesture_task: Optional[asyncio.Task] = None
        self.reconnect_task: Optional[asyncio.Task] = None
        self.is_reconnecting = False
        self.reconnect_attempts = 0
        self.max_reconnect_attempts = 30
        self.reconnect_base_interval = 0.5  # 500ms
        self.reconnect_max_interval = 5.0  # 5 seconds
        self.device_check_interval = 0.2  # 200ms
        
    def print_header(self, title: str):
        """Print the application header banner"""
        print(colored('╔════════════════════════════════════════════════════════════╗', Colors.BLUE, bold=True))
        print(colored('║           ', Colors.BLUE, bold=True) +
              colored(title.ljust(48), Colors.BLUE, bold=True) +
              colored('║', Colors.BLUE, bold=True))
        print(colored('╚════════════════════════════════════════════════════════════╝', Colors.BLUE, bold=True))
        print()
        print(colored('Config: ', Colors.CYAN) + colored(self.config_data.name or 'Unknown', Colors.WHITE))

        # Show available modes
        print(colored('Available Modes:', Colors.CYAN))
        for mode in self.config_data.modes:
            print(colored(f'  • Report ID {mode.reportId}', Colors.WHITE))
        print(colored('  (Mode will be auto-detected from first packet)', Colors.GRAY))

        print(colored('Mode: ', Colors.CYAN) +
              (colored('Mock Data', Colors.YELLOW) if self.is_mock_mode else colored('Real Device', Colors.GREEN)))

        if not self.is_mock_mode:
            vid = self.config_data.deviceInfo.vendor_id if self.config_data.deviceInfo else None
            pid = self.config_data.deviceInfo.product_id if self.config_data.deviceInfo else None
            vid_str = f"0x{vid:04x}" if vid else '?'
            pid_str = f"0x{pid:04x}" if pid else '?'
            print(colored('Device IDs: ', Colors.CYAN) + colored(f"{vid_str} : {pid_str}", Colors.WHITE))
        print()
    
    def _has_keyboard_mappings(self) -> bool:
        """Check if any mode in config has keyboard mappings."""
        for mode in self.config_data.modes:
            if hasattr(mode, 'keyboardMappings') and mode.keyboardMappings:
                return True
        return False

    def _get_keyboard_mappings(self) -> Optional[Dict]:
        """Extract keyboard mappings from config."""
        for mode in self.config_data.modes:
            if hasattr(mode, 'keyboardMappings') and mode.keyboardMappings:
                return mode.keyboardMappings
        return None

    async def initialize_reader(self):
        """Initialize the HID reader (mock or real) - async version"""
        if self.is_mock_mode:
            # Use config-based generator for mock mode
            self.config_generator = create_config_based_generator(self.config_path)
            self.reader = MockHIDReader(custom_generator=self.config_generator)
        else:
            # Check if config specifies keyboard mappings
            has_keyboard_mappings = self._has_keyboard_mappings()
            keyboard_mappings = self._get_keyboard_mappings()

            device_info = self.config_data.deviceInfo

            # Three scenarios based on config:
            # 1. Keyboard-only mode (no HID device)
            # 2. Hybrid mode (HID tablet + keyboard buttons)
            # 3. Standard HID mode (existing behavior)

            if not device_info or device_info.vendor_id == 0:
                # Keyboard-only mode
                if has_keyboard_mappings:
                    from ..core.keyboard_listener import KeyboardOnlyReader
                    print(colored('Mode: ', Colors.CYAN) + colored('Keyboard-Only', Colors.YELLOW))
                    print(colored('Using keyboard for button input (no tablet device)', Colors.GRAY))
                    self.reader = KeyboardOnlyReader(keyboard_mappings)
                else:
                    raise ValueError("Config has no device info and no keyboard mappings")

            elif has_keyboard_mappings:
                # Hybrid mode: Tablet HID + Keyboard buttons
                from ..core.hid_reader_factory import HIDReaderFactory
                from ..core.hybrid_reader import HybridReader

                factory = HIDReaderFactory()
                tablet_reader = await factory.create_multi_interface_reader(
                    device_info.vendor_id,
                    device_info.product_id
                )

                if not tablet_reader:
                    raise RuntimeError("Could not find/open tablet device")

                print(colored('Mode: ', Colors.CYAN) + colored('Hybrid (HID + Keyboard)', Colors.YELLOW))
                print(colored('Pen data from tablet, buttons from keyboard', Colors.GRAY))
                self.reader = HybridReader(tablet_reader, keyboard_mappings)

            else:
                # Standard HID-only mode (existing behavior)
                from ..core.hid_reader_factory import HIDReaderFactory
                factory = HIDReaderFactory()

                self.reader = await factory.create_multi_interface_reader(
                    device_info.vendor_id,
                    device_info.product_id
                )

                if not self.reader:
                    raise RuntimeError("Could not find/open device")

    def initialize_reader_sync(self):
        """Initialize the HID reader (mock or real) - synchronous version"""
        if self.is_mock_mode:
            # Use config-based generator for mock mode
            self.config_generator = create_config_based_generator(self.config_path)
            self.reader = MockHIDReader(custom_generator=self.config_generator)
        else:
            # Check if config specifies keyboard mappings
            has_keyboard_mappings = self._has_keyboard_mappings()
            keyboard_mappings = self._get_keyboard_mappings()

            device_info = self.config_data.deviceInfo

            # Three scenarios based on config:
            # 1. Keyboard-only mode (no HID device)
            # 2. Hybrid mode (HID tablet + keyboard buttons)
            # 3. Standard HID mode (existing behavior)

            if not device_info or device_info.vendor_id == 0:
                # Keyboard-only mode
                if has_keyboard_mappings:
                    from ..core.keyboard_listener import KeyboardOnlyReader
                    print(colored('Mode: ', Colors.CYAN) + colored('Keyboard-Only', Colors.YELLOW))
                    print(colored('Using keyboard for button input (no tablet device)', Colors.GRAY))
                    self.reader = KeyboardOnlyReader(keyboard_mappings)
                else:
                    raise ValueError("Config has no device info and no keyboard mappings")

            elif has_keyboard_mappings:
                # Hybrid mode: Tablet HID + Keyboard buttons
                from ..core.hid_reader_factory import HIDReaderFactory
                from ..core.hybrid_reader import HybridReader

                factory = HIDReaderFactory()
                tablet_reader = factory.create_multi_interface_reader_sync(
                    device_info.vendor_id,
                    device_info.product_id
                )

                if not tablet_reader:
                    raise RuntimeError("Could not find/open tablet device")

                print(colored('Mode: ', Colors.CYAN) + colored('Hybrid (HID + Keyboard)', Colors.YELLOW))
                print(colored('Pen data from tablet, buttons from keyboard', Colors.GRAY))
                self.reader = HybridReader(tablet_reader, keyboard_mappings)

            else:
                # Standard HID-only mode (existing behavior)
                from ..core.hid_reader_factory import HIDReaderFactory
                factory = HIDReaderFactory()

                # Use synchronous version - no event loop needed
                self.reader = factory.create_multi_interface_reader_sync(
                    device_info.vendor_id,
                    device_info.product_id
                )

                if not self.reader:
                    raise RuntimeError("Could not find/open device")
    
    def process_packet(self, data: bytes) -> Dict[str, Any]:
        """Process a raw packet through the config mappings"""
        if len(data) == 0:
            return {}

        report_id = data[0]

        # Check if this is a synthetic keyboard button packet (report ID 0)
        # Generated by KeyboardButtonListener
        if report_id == 0 and len(data) >= 3:
            # Synthetic packet format: [0x00, 0x01, button_number, ...]
            # Extract button number and create button event
            button_num = data[2]
            result = {
                'state': 'buttons',
                'tabletButtons': button_num,
                f'button{button_num}': True
            }
            # Set all other buttons to false
            for i in range(1, 33):  # Support up to 32 buttons
                if i != button_num:
                    result[f'button{i}'] = False
            return result

        # Check if this is a keyboard button packet (report IDs 3, 4, 5)
        # These come from a separate keyboard HID interface on some tablets
        if report_id in (3, 4, 5):
            # Try to find keyboardButtons config in any mode
            keyboard_buttons_config = None
            for mode in self.config_data.modes:
                kb_config = mode.byteCodeMappings.get('keyboardButtons')
                if kb_config and 'buttons' in kb_config:
                    keyboard_buttons_config = kb_config
                    break

            if keyboard_buttons_config:
                return process_keyboard_button_data(data, keyboard_buttons_config)
            # If no keyboard buttons config, fall through to normal processing

        # Detect mode from first packet if not already detected
        if self.current_mode is None:
            self.detected_report_id = report_id
            self.current_mode = self.config_data.get_mode_by_report_id(report_id)

            # If not found by main reportId, check if it's a buttonInterfaceReportId
            if not self.current_mode:
                # Check how many modes have this buttonInterfaceReportId
                matching_modes = [m for m in self.config_data.modes
                                 if hasattr(m, 'buttonInterfaceReportId') and m.buttonInterfaceReportId == report_id]

                if len(matching_modes) == 1:
                    # Only one mode has this buttonInterfaceReportId, safe to use it
                    self.current_mode = matching_modes[0]
                    print(colored(f'\n✓ Detected device mode from button interface: ', Colors.GREEN) +
                          colored(f'Report ID {report_id} (buttons)', Colors.CYAN, bold=True))
                elif len(matching_modes) > 1:
                    # Multiple modes share the same buttonInterfaceReportId
                    # Try to detect which mode based on the button data (scan code at byte index 2)
                    tablet_buttons_mapping = data[2] if len(data) > 2 else 0

                    # Find mode whose tabletButtons config contains this scan code
                    for candidate_mode in matching_modes:
                        tablet_buttons = candidate_mode.byteCodeMappings.get('tabletButtons', {})
                        if tablet_buttons and 'values' in tablet_buttons:
                            scan_code_str = str(tablet_buttons_mapping)
                            if scan_code_str in tablet_buttons['values']:
                                self.current_mode = candidate_mode
                                print(colored(f'\n✓ Detected device mode from button data: ', Colors.GREEN) +
                                      colored(f'buttonInterfaceReportId {report_id}, scan code {tablet_buttons_mapping}', Colors.CYAN, bold=True))
                                break

                    # Fallback to first matching mode if no scan code match
                    if not self.current_mode:
                        self.current_mode = matching_modes[0]
                        print(colored(f'\n⚠ Using first matching mode (Report ID {self.current_mode.reportId}) as fallback', Colors.YELLOW))

            if self.current_mode:
                if report_id == self.current_mode.reportId:
                    print(colored(f'\n✓ Detected device mode: ', Colors.GREEN) +
                          colored(f'Report ID {report_id}', Colors.CYAN, bold=True))
                    print(colored(f'  Resolution: ', Colors.CYAN) +
                          colored(f'{self.current_mode.capabilities.resolution.x}x{self.current_mode.capabilities.resolution.y}', Colors.WHITE))
                    print()
            else:
                print(colored(f'\n⚠ Warning: Unknown Report ID {report_id}', Colors.YELLOW))
                print(colored(f'  Available modes:', Colors.YELLOW))
                for mode in self.config_data.modes:
                    print(colored(f'    - Report ID {mode.reportId}', Colors.YELLOW))
                    if hasattr(mode, 'buttonInterfaceReportId'):
                        print(colored(f'      (Button interface: Report ID {mode.buttonInterfaceReportId})', Colors.GRAY))
                print()
                return {}

        # Find the appropriate mode for this packet's Report ID
        # First try to find by main report ID
        mode = self.config_data.get_mode_by_report_id(report_id)

        # If not found, check if this is a button interface report ID for any mode
        # IMPORTANT: Check current mode first to avoid ambiguity when multiple modes share the same buttonInterfaceReportId
        if not mode and report_id is not None:
            # First check if current mode matches
            if self.current_mode and hasattr(self.current_mode, 'buttonInterfaceReportId') and self.current_mode.buttonInterfaceReportId == report_id:
                mode = self.current_mode
            else:
                # Find all modes with matching buttonInterfaceReportId
                matching_modes = [m for m in self.config_data.modes
                                 if hasattr(m, 'buttonInterfaceReportId') and m.buttonInterfaceReportId == report_id]

                if len(matching_modes) == 1:
                    mode = matching_modes[0]
                elif len(matching_modes) > 1:
                    # Multiple modes share the same buttonInterfaceReportId
                    # Try to detect which mode based on the button data (scan code at byte index 2)
                    tablet_buttons_mapping = data[2] if len(data) > 2 else 0

                    # Find mode whose tabletButtons config contains this scan code
                    for candidate_mode in matching_modes:
                        tablet_buttons = candidate_mode.byteCodeMappings.get('tabletButtons', {})
                        if tablet_buttons and 'values' in tablet_buttons:
                            scan_code_str = str(tablet_buttons_mapping)
                            if scan_code_str in tablet_buttons['values']:
                                mode = candidate_mode
                                # Set currentMode so future packets use the same mode
                                if self.current_mode is None:
                                    self.current_mode = mode
                                    print(colored(f'\n✓ Detected device mode from button data: ', Colors.GREEN) +
                                          colored(f'buttonInterfaceReportId {report_id}, scan code {tablet_buttons_mapping}', Colors.CYAN, bold=True))
                                break

                    # Fallback to first matching mode if no scan code match
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
    
    @abstractmethod
    def handle_packet(self, data: bytes):
        """Handle a received packet - override in subclasses"""
        pass
    
    @abstractmethod
    async def start(self):
        """Start the reader - override in subclasses for additional setup"""
        pass
    
    async def start_mock_gesture_cycle(self):
        """Start the mock gesture cycling demo - async version"""
        print(colored('Mock gesture cycle starting...', Colors.YELLOW))
        print(colored('Gestures will cycle automatically\n', Colors.GRAY))
        self.gesture_task = asyncio.create_task(self._gesture_cycle_loop())

    async def _gesture_cycle_loop(self):
        """Loop through mock gestures - async version"""
        while self.is_running:
            gesture = MOCK_GESTURES[self.current_gesture_index]
            print(colored(f"▶ Playing: {gesture['description']}", Colors.YELLOW, bold=True))

            # Play the gesture
            if isinstance(self.reader, MockHIDReader):
                await self.reader.play_gesture_for_step(gesture['name'])

            # Wait for duration + pause
            await asyncio.sleep((gesture['duration'] + 500) / 1000.0)

            # Move to next gesture
            self.current_gesture_index = (self.current_gesture_index + 1) % len(MOCK_GESTURES)

    def start_mock_gesture_cycle_sync(self):
        """Start the mock gesture cycling demo - synchronous version"""
        import threading
        import time

        print(colored('Mock gesture cycle starting...', Colors.YELLOW))
        print(colored('Gestures will cycle automatically\n', Colors.GRAY))

        def gesture_loop():
            while self.is_running:
                gesture = MOCK_GESTURES[self.current_gesture_index]
                print(colored(f"▶ Playing: {gesture['description']}", Colors.YELLOW, bold=True))

                # Play the gesture
                if isinstance(self.reader, MockHIDReader):
                    # Run async method synchronously
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    try:
                        loop.run_until_complete(self.reader.play_gesture_for_step(gesture['name']))
                    finally:
                        loop.close()

                # Wait for duration + pause
                time.sleep((gesture['duration'] + 500) / 1000.0)

                # Move to next gesture
                self.current_gesture_index = (self.current_gesture_index + 1) % len(MOCK_GESTURES)

        # Start in background thread
        thread = threading.Thread(target=gesture_loop, daemon=True)
        thread.start()
    
    def setup_shutdown_handlers(self):
        """Set up graceful shutdown handlers"""
        # Don't override SIGINT - let KeyboardInterrupt propagate naturally
        # Only handle SIGTERM for graceful shutdown from kill command
        def signal_handler(signum, frame):
            print(colored('\n\nShutdown signal received...', Colors.YELLOW))
            self.is_running = False
            # Schedule cleanup
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(self.stop())

        signal.signal(signal.SIGTERM, signal_handler)
    
    async def stop(self):
        """Stop the reader and clean up - async version"""
        print(colored('\nStopping...', Colors.YELLOW))
        self.is_running = False

        # Cancel tasks
        if self.gesture_task:
            self.gesture_task.cancel()
            try:
                await self.gesture_task
            except asyncio.CancelledError:
                pass

        if self.reconnect_task:
            self.reconnect_task.cancel()
            try:
                await self.reconnect_task
            except asyncio.CancelledError:
                pass

        # Close reader
        if self.reader:
            if hasattr(self.reader, 'stop_reading'):
                self.reader.stop_reading()
            if hasattr(self.reader, 'close'):
                try:
                    # Check if close is async or sync
                    import inspect
                    if inspect.iscoroutinefunction(self.reader.close):
                        await self.reader.close()
                    else:
                        self.reader.close()
                    print(colored('Device closed.', Colors.GRAY))
                except Exception as e:
                    print(colored(f'Error closing device: {e}', Colors.RED))

        # Close HID device (if separate from reader)
        if self.device and self.device != self.reader:
            try:
                self.device.close()
            except:
                pass

        print(colored(f'✓ Processed {self.packet_count} packets', Colors.GREEN))

        if self.exit_on_stop:
            sys.exit(0)

    def stop_sync(self):
        """Stop the reader and clean up - synchronous version"""
        print(colored('\nStopping...', Colors.YELLOW))
        self.is_running = False

        # Close reader
        if self.reader:
            if hasattr(self.reader, 'stop_reading'):
                self.reader.stop_reading()
            if hasattr(self.reader, 'close'):
                try:
                    self.reader.close()
                    print(colored('Device closed.', Colors.GRAY))
                except Exception as e:
                    print(colored(f'Error closing device: {e}', Colors.RED))

        # Close HID device (if separate from reader)
        if self.device and self.device != self.reader:
            try:
                self.device.close()
            except:
                pass

        print(colored(f'✓ Processed {self.packet_count} packets', Colors.GREEN))
    
    def handle_device_disconnect(self):
        """Handle device disconnection"""
        print(colored('\n⚠ Device disconnected!', Colors.RED))
        
        if self.reader:
            if hasattr(self.reader, 'stop_reading'):
                self.reader.stop_reading()
            self.reader = None
        
        # Start device polling for reconnection
        if not self.is_reconnecting:
            self.reconnect_attempts = 0
            self.reconnect_task = asyncio.create_task(self._device_polling_loop())
    
    async def _device_polling_loop(self):
        """Poll for device presence"""
        print(colored('Waiting for device to be reconnected...', Colors.YELLOW))
        print(colored('(Checking every 200ms)', Colors.GRAY))
        
        while self.reconnect_attempts < self.max_reconnect_attempts:
            self.reconnect_attempts += 1
            
            # Check if device is present
            if await self._is_device_present():
                print(colored('✓ Device detected!', Colors.GREEN))
                await self._attempt_reconnect()
                return
            
            await asyncio.sleep(self.device_check_interval)
        
        # Give up
        total_time = (self.max_reconnect_attempts * self.device_check_interval)
        print(colored(f'✗ Device not found after {total_time:.1f}s', Colors.RED))
        print(colored('Please reconnect the device and restart the application.', Colors.YELLOW))
    
    async def _is_device_present(self) -> bool:
        """Check if the device is physically present in the system"""
        try:
            device_info = self.config_data.deviceInfo
            if not device_info:
                return False

            vendor_id = device_info.vendor_id
            product_id = device_info.product_id

            if not vendor_id or not product_id:
                return False

            # Check if device exists
            devices = hid.enumerate(vendor_id, product_id)
            return len(devices) > 0
        except:
            return False
    
    async def _attempt_reconnect(self):
        """Attempt to reconnect to the device"""
        if self.is_reconnecting:
            return
        
        self.is_reconnecting = True
        print(colored('Attempting to reconnect...', Colors.YELLOW))
        
        try:
            # Try to reinitialize the device
            await self.initialize_reader()
            
            if not self.reader:
                raise RuntimeError('Failed to initialize reader')
            
            # Restart reading
            if hasattr(self.reader, 'start_reading'):
                self.reader.start_reading(lambda data, report_id=None, interface_type=None: self.handle_packet(data))
            
            print(colored('✓ Device reconnected successfully!', Colors.GREEN))
            self.is_reconnecting = False
            self.reconnect_attempts = 0
            
        except Exception as e:
            # Reconnection failed
            self.is_reconnecting = False
            
            # Use exponential backoff for retry
            backoff_time = min(
                self.reconnect_base_interval * (1.5 ** self.reconnect_attempts),
                self.reconnect_max_interval
            )
            
            print(colored(f'Connection failed, retrying in {int(backoff_time * 1000)}ms...', Colors.GRAY))
            
            await asyncio.sleep(backoff_time)
            
            if await self._is_device_present():
                await self._attempt_reconnect()
            else:
                print(colored('Device disappeared, resuming polling...', Colors.YELLOW))
                self.reconnect_task = asyncio.create_task(self._device_polling_loop())