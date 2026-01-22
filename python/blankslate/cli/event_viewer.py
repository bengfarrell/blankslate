#!/usr/bin/env python3
"""
Tablet Event Viewer

CLI Tool: Stream Events
Converts raw HID byte data into tablet events using a config file

Usage:
    tablet-events -c config.json --live
    tablet-events -c config.json --compact
    tablet-events -c config.json --mock
"""

import sys
import argparse
import asyncio
from typing import Dict, Any, Optional
from dataclasses import dataclass

try:
    from .tablet_reader_base import TabletReaderBase, Colors, colored, normalize_tablet_event
except ImportError:
    import os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))
    from blankslate.cli.tablet_reader_base import TabletReaderBase, Colors, colored, normalize_tablet_event


@dataclass
class CalibrationTracking:
    """Track observed max values for calibration warnings"""
    observed_max_x: int = 0
    observed_max_y: int = 0
    observed_max_pressure: int = 0


class EventViewer(TabletReaderBase):
    """Enhanced event viewer with multiple display modes"""

    def __init__(self, config_path: str, mock: bool = False,
                 raw: bool = False, compact: bool = False, live: bool = False):
        super().__init__(config_path, mock=mock, exit_on_stop=True)
        self.show_raw = raw
        self.compact_output = compact
        self.live_mode = live

        # Live mode state
        self.last_events: Dict[str, Any] = {}
        self.last_raw_data: bytes = b''
        self.last_live_update = 0
        self.last_displayed_state: Optional[str] = None
        self.last_report_id: Optional[int] = None

        # Calibration tracking
        self.calibration = CalibrationTracking()
        self.calibration_warnings: list[str] = []
    
    def start(self):
        """Start viewing events"""
        self.print_header('Tablet Event Viewer')

        if not self.is_mock_mode:
            print(colored('Mode: ', Colors.CYAN) + colored('Exclusive (mouse input suppressed)', Colors.YELLOW))
        print()

        # Initialize reader
        print(colored('Initializing...', Colors.GRAY))
        self.initialize_reader_sync()

        if not self.reader:
            raise RuntimeError('Reader not initialized')

        # Start reading
        print(colored('Setting up data callback...', Colors.GRAY))
        if hasattr(self.reader, 'start_reading'):
            # Accept both old (data only) and new (data, report_id) signatures
            self.reader.start_reading(lambda data, report_id=None: self.handle_packet(data))

        print(colored('✓ Started reading data', Colors.GREEN))
        print(colored('Press Ctrl+C to stop\n', Colors.GRAY))

        self.is_running = True

        if self.is_mock_mode:
            self.start_mock_gesture_cycle_sync()

        # Keep process alive - simple blocking loop like old code
        # This allows KeyboardInterrupt to propagate naturally
        import time
        try:
            while self.is_running:
                time.sleep(0.1)
        except KeyboardInterrupt:
            pass
        finally:
            self.stop_sync()
    
    def handle_packet(self, data: bytes):
        """Handle incoming packet"""
        try:
            self.packet_count += 1

            # Extract Report ID from first byte
            report_id = data[0] if len(data) > 0 else None
            self.last_report_id = report_id

            # Process the data using the config
            events = self.process_packet(data)

            # Track raw values for calibration warnings
            self._track_raw_values(data)

            # Store for live mode
            self.last_events = events
            self.last_raw_data = data
            
            # Format output
            if self.live_mode:
                self._print_live(events, data)
            elif self.compact_output:
                self._print_compact(events, data)
            else:
                self._print_detailed(events, data)
        except Exception as e:
            # Print errors to stderr for debugging
            import traceback
            import sys
            sys.stderr.write(f"\n[ERROR] Failed to process packet: {e}\n")
            traceback.print_exc(file=sys.stderr)
            sys.stderr.flush()
    
    def _track_raw_values(self, data: bytes):
        """Extract raw multi-byte values and track max values seen"""
        data_list = list(data)

        # Get mappings from current mode (for multi-mode configs) or from config directly
        if self.config_data.is_multi_mode():
            if not self.current_mode:
                return  # Mode not detected yet
            mappings = self.current_mode.byteCodeMappings
        else:
            mappings = self.config_data.byteCodeMappings

        if not mappings:
            return

        # Extract raw X value
        x_mapping = mappings.get('x')
        if x_mapping and x_mapping.get('type') == 'multi-byte-range':
            indices = x_mapping.get('byteIndex', [])
            if not isinstance(indices, list):
                indices = [indices]
            
            raw_x = 0
            for i, idx in enumerate(indices):
                if 0 <= idx < len(data_list):
                    raw_x += data_list[idx] << (i * 8)
            
            if raw_x > self.calibration.observed_max_x:
                self.calibration.observed_max_x = raw_x
                self._update_calibration_warnings()
        
        # Extract raw Y value
        y_mapping = mappings.get('y')
        if y_mapping and y_mapping.get('type') == 'multi-byte-range':
            indices = y_mapping.get('byteIndex', [])
            if not isinstance(indices, list):
                indices = [indices]
            
            raw_y = 0
            for i, idx in enumerate(indices):
                if 0 <= idx < len(data_list):
                    raw_y += data_list[idx] << (i * 8)
            
            if raw_y > self.calibration.observed_max_y:
                self.calibration.observed_max_y = raw_y
                self._update_calibration_warnings()
        
        # Extract raw pressure value
        p_mapping = mappings.get('pressure')
        if p_mapping and p_mapping.get('type') == 'multi-byte-range':
            indices = p_mapping.get('byteIndex', [])
            if not isinstance(indices, list):
                indices = [indices]
            
            raw_p = 0
            for i, idx in enumerate(indices):
                if 0 <= idx < len(data_list):
                    raw_p += data_list[idx] << (i * 8)
            
            if raw_p > self.calibration.observed_max_pressure:
                self.calibration.observed_max_pressure = raw_p
                self._update_calibration_warnings()
    
    def _update_calibration_warnings(self):
        """Check if observed values exceed config max and generate warnings"""
        self.calibration_warnings = []

        # Get mappings from current mode (for multi-mode configs) or from config directly
        if self.config_data.is_multi_mode():
            if not self.current_mode:
                return  # Mode not detected yet
            mappings = self.current_mode.byteCodeMappings
        else:
            mappings = self.config_data.byteCodeMappings

        if not mappings:
            return

        config_max_x = mappings.get('x', {}).get('max', 65535)
        config_max_y = mappings.get('y', {}).get('max', 65535)
        config_max_pressure = mappings.get('pressure', {}).get('max', 8191)
        
        if self.calibration.observed_max_x > config_max_x:
            self.calibration_warnings.append(
                f"X: config max={config_max_x}, observed={self.calibration.observed_max_x}"
            )
        if self.calibration.observed_max_y > config_max_y:
            self.calibration_warnings.append(
                f"Y: config max={config_max_y}, observed={self.calibration.observed_max_y}"
            )
        if self.calibration.observed_max_pressure > config_max_pressure:
            self.calibration_warnings.append(
                f"Pressure: config max={config_max_pressure}, observed={self.calibration.observed_max_pressure}"
            )
    
    def _print_compact(self, events: Dict[str, Any], data: bytes):
        """Print compact single-line format"""
        parts = []
        
        # Position
        if 'x' in events and 'y' in events:
            parts.append(f"pos:({events['x']},{events['y']})")
        
        # Pressure
        if 'pressure' in events and events['pressure'] != 0:
            parts.append(f"p:{events['pressure']}")
        
        # Tilt
        if 'tiltX' in events or 'tiltY' in events:
            tx = events.get('tiltX', 0)
            ty = events.get('tiltY', 0)
            parts.append(f"tilt:({tx},{ty})")
        
        # State
        parts.append(f"state:{events.get('state', 'unknown')}")
        
        # Buttons
        if events.get('primaryButton') or events.get('primaryButtonPressed'):
            parts.append(colored('BTN1', Colors.MAGENTA))
        if events.get('secondaryButton') or events.get('secondaryButtonPressed'):
            parts.append(colored('BTN2', Colors.MAGENTA))
        
        # Raw bytes
        if self.show_raw:
            hex_str = ' '.join(f'{b:02x}' for b in data)
            parts.append(colored(f'[{hex_str}]', Colors.GRAY))
        
        packet_info = colored(f'#{self.packet_count}', Colors.GRAY)
        if self.last_report_id is not None:
            packet_info += colored(f' [R:{self.last_report_id}]', Colors.YELLOW)
        output = f"\r{packet_info} {' '.join(parts)}"
        sys.stdout.write(output.ljust(120))
        sys.stdout.flush()
    
    def _print_detailed(self, events: Dict[str, Any], data: bytes):
        """Print detailed multi-line format"""
        import datetime
        timestamp = datetime.datetime.now().strftime('%H:%M:%S.%f')[:-3]
        lines = []
        
        lines.append(colored('─' * 60, Colors.GRAY))
        packet_line = colored(f'Packet #{self.packet_count}', Colors.CYAN)
        if self.last_report_id is not None:
            packet_line += colored(f' [ReportID: {self.last_report_id}]', Colors.YELLOW)
        packet_line += colored(f' @ {timestamp}', Colors.GRAY)
        lines.append(packet_line)

        # Always show raw hex for debugging
        hex_str = ' '.join(f'{b:02X}' for b in data)
        lines.append(colored(f'Raw: {hex_str}', Colors.GRAY))

        # Show all parsed events for debugging
        if events:
            events_str = ', '.join(f'{k}={v}' for k, v in events.items())
            lines.append(colored(f'Events: {events_str}', Colors.GRAY))
        
        # State - always show, even if missing
        state = events.get('state', 'unknown')
        if state == 'contact':
            state_colored = colored(state, Colors.GREEN)
        elif state == 'hover':
            state_colored = colored(state, Colors.YELLOW)
        elif state == 'buttons':
            state_colored = colored(state, Colors.MAGENTA)
        elif state == 'unknown':
            state_colored = colored(state, Colors.GRAY)
        else:
            state_colored = colored(state, Colors.GRAY)
        lines.append(f"  State: {state_colored}")
        
        # Position
        if 'x' in events and 'y' in events:
            x = events['x']
            y = events['y']
            x_percent = (x / 65535) * 100 if isinstance(x, (int, float)) else 0
            y_percent = (y / 65535) * 100 if isinstance(y, (int, float)) else 0
            lines.append(f"  Position: {colored(f'X: {x}', Colors.WHITE)} ({x_percent:.1f}%) | " +
                        f"{colored(f'Y: {y}', Colors.WHITE)} ({y_percent:.1f}%)")
        
        # Pressure
        if 'pressure' in events:
            pressure = events['pressure']
            if isinstance(pressure, (int, float)):
                pressure_percent = (pressure / 8191) * 100
                bar = self._create_bar(pressure, 8191, 20)
                lines.append(f"  Pressure: {colored(str(pressure), Colors.WHITE)} " +
                           f"({pressure_percent:.1f}%) {bar}")
        
        # Tilt
        if 'tiltX' in events or 'tiltY' in events:
            tilt_x = events.get('tiltX', 0)
            tilt_y = events.get('tiltY', 0)
            lines.append(f"  Tilt: X: {colored(f'{tilt_x:.2f}', Colors.WHITE)} | " +
                        f"Y: {colored(f'{tilt_y:.2f}', Colors.WHITE)}")
        
        # Buttons - always show button state
        buttons = []
        if events.get('primaryButton') or events.get('primaryButtonPressed'):
            buttons.append(colored('Primary', Colors.MAGENTA))
        if events.get('secondaryButton') or events.get('secondaryButtonPressed'):
            buttons.append(colored('Secondary', Colors.MAGENTA))

        tablet_button = events.get('tabletButtons', 0)
        if tablet_button != 0:
            buttons.append(colored(f"Express Key: {tablet_button}", Colors.BLUE))

        # Always show button line, even if no buttons pressed
        if buttons:
            lines.append(f"  Buttons: {' | '.join(buttons)}")
        else:
            # Check if this looks like it should have button data
            if events.get('state') == 'buttons' or self.last_report_id == 6:
                lines.append(f"  Buttons: {colored('(none detected)', Colors.GRAY)}")
        
        print('\n'.join(lines))
        sys.stdout.flush()
    
    def _create_bar(self, value: float, max_val: float, width: int) -> str:
        """Create a progress bar"""
        filled = int((value / max_val) * width)
        empty = width - filled
        return colored('█' * filled, Colors.GREEN) + colored('░' * empty, Colors.GRAY)
    
    def _print_live(self, events: Dict[str, Any], data: bytes):
        """Live dashboard mode - updates in place without scrolling"""
        import time
        
        # Throttle to ~10fps, but always update on state change
        now = time.time()
        current_state = str(events.get('state', 'unknown'))
        state_changed = current_state != self.last_displayed_state
        
        if not state_changed and now - self.last_live_update < 0.1:
            return  # Skip this update
        
        self.last_live_update = now
        self.last_displayed_state = current_state
        
        # ANSI codes
        HIDE_CURSOR = '\x1b[?25l'
        CLEAR_LINE = '\x1b[2K'
        MOVE_HOME = '\x1b[H'
        
        # Get config max values
        # Get mappings from current mode (for multi-mode configs) or from config directly
        if self.config_data.is_multi_mode():
            if not self.current_mode:
                return  # Mode not detected yet
            mappings = self.current_mode.byteCodeMappings
        else:
            mappings = self.config_data.byteCodeMappings

        if not mappings:
            return

        config_max_x = mappings.get('x', {}).get('max', 65535)
        config_max_y = mappings.get('y', {}).get('max', 65535)
        config_max_pressure = mappings.get('pressure', {}).get('max', 8191)
        
        # Check for calibration issues
        x_miscalibrated = self.calibration.observed_max_x > config_max_x
        y_miscalibrated = self.calibration.observed_max_y > config_max_y
        pressure_miscalibrated = self.calibration.observed_max_pressure > config_max_pressure
        has_miscalibration = x_miscalibrated or y_miscalibrated or pressure_miscalibrated
        
        # Build the display
        lines = []
        
        # Header
        lines.append(colored('┌─────────────────────────────────────────────────────────────┐', Colors.CYAN, bold=True))
        lines.append(colored('│', Colors.CYAN, bold=True) + 
                    colored('                    TABLET LIVE VIEW                         ', Colors.WHITE, bold=True) + 
                    colored('│', Colors.CYAN, bold=True))
        lines.append(colored('├─────────────────────────────────────────────────────────────┤', Colors.CYAN, bold=True))
        
        # Packet counter and state
        packet_str = f"Packets: {self.packet_count}".ljust(20)
        state_value = events.get('state', 'unknown')
        
        if state_value == 'contact':
            state_colored = colored(str(state_value).ljust(10), Colors.GREEN, bold=True)
        elif state_value == 'hover':
            state_colored = colored(str(state_value).ljust(10), Colors.YELLOW, bold=True)
        elif state_value == 'buttons':
            state_colored = colored(str(state_value).ljust(10), Colors.MAGENTA, bold=True)
        else:
            state_colored = colored(str(state_value).ljust(10), Colors.GRAY)
        
        state_str = f"State: {state_colored}"
        lines.append(colored('│', Colors.CYAN, bold=True) + f" {packet_str} {state_str}".ljust(61) + 
                    colored('│', Colors.CYAN, bold=True))
        
        lines.append(colored('├─────────────────────────────────────────────────────────────┤', Colors.CYAN, bold=True))
        
        # Get normalized values
        x_norm = float(events.get('x', 0))
        y_norm = float(events.get('y', 0))
        pressure_norm = float(events.get('pressure', 0))
        
        # Position section
        pos_label = " Position"
        if has_miscalibration and (x_miscalibrated or y_miscalibrated):
            pos_label += colored(' ⚠ RECALIBRATE', Colors.YELLOW, bold=True)
        lines.append(colored('│', Colors.CYAN, bold=True) + pos_label.ljust(61) + 
                    colored('│', Colors.CYAN, bold=True))
        
        # X coordinate
        x_warning = colored('!', Colors.RED, bold=True) if x_miscalibrated else ' '
        x_value_str = f"{x_norm * 100:.0f}%" if x_norm > 1 else f"{x_norm * 100:.1f}%"
        if x_norm > 1:
            x_value_str = colored(x_value_str, Colors.RED, bold=True)
        else:
            x_value_str = colored(x_value_str, Colors.WHITE)
        
        x_bar = self._create_bar_with_overflow(x_norm, 30)
        lines.append(colored('│', Colors.CYAN, bold=True) + 
                    f"  {x_warning}X: {x_value_str.ljust(7)}  {x_bar} ".ljust(61) + 
                    colored('│', Colors.CYAN, bold=True))
        
        # Y coordinate
        y_warning = colored('!', Colors.RED, bold=True) if y_miscalibrated else ' '
        y_value_str = f"{y_norm * 100:.0f}%" if y_norm > 1 else f"{y_norm * 100:.1f}%"
        if y_norm > 1:
            y_value_str = colored(y_value_str, Colors.RED, bold=True)
        else:
            y_value_str = colored(y_value_str, Colors.WHITE)
        
        y_bar = self._create_bar_with_overflow(y_norm, 30)
        lines.append(colored('│', Colors.CYAN, bold=True) + 
                    f"  {y_warning}Y: {y_value_str.ljust(7)}  {y_bar} ".ljust(61) + 
                    colored('│', Colors.CYAN, bold=True))
        
        # Pressure section
        pressure_label = " Pressure"
        if pressure_miscalibrated:
            pressure_label += colored(' ⚠', Colors.YELLOW, bold=True)
        lines.append(colored('│', Colors.CYAN, bold=True) + pressure_label.ljust(61) + 
                    colored('│', Colors.CYAN, bold=True))
        
        p_warning = colored('!', Colors.RED, bold=True) if pressure_miscalibrated else ' '
        p_value_str = f"{pressure_norm * 100:.0f}%" if pressure_norm > 1 else f"{pressure_norm * 100:.1f}%"
        if pressure_norm > 1:
            p_value_str = colored(p_value_str, Colors.RED, bold=True)
        else:
            p_value_str = colored(p_value_str, Colors.WHITE)
        
        p_bar = self._create_bar_with_overflow(pressure_norm, 30)
        lines.append(colored('│', Colors.CYAN, bold=True) + 
                    f"  {p_warning}{p_value_str.ljust(8)}  {p_bar} ".ljust(61) + 
                    colored('│', Colors.CYAN, bold=True))
        
        # Tilt
        tilt_x = float(events.get('tiltX', 0))
        tilt_y = float(events.get('tiltY', 0))
        lines.append(colored('│', Colors.CYAN, bold=True) + 
                    " Tilt                                                        " + 
                    colored('│', Colors.CYAN, bold=True))
        lines.append(colored('│', Colors.CYAN, bold=True) + 
                    f"   X: {colored(f'{tilt_x:.2f}'.rjust(6), Colors.WHITE)}    " +
                    f"Y: {colored(f'{tilt_y:.2f}'.rjust(6), Colors.WHITE)}                              " + 
                    colored('│', Colors.CYAN, bold=True))
        
        # Buttons
        btn_primary = colored('●', Colors.GREEN, bold=True) if (events.get('primaryButton') or events.get('primaryButtonPressed')) else colored('○', Colors.GRAY)
        btn_secondary = colored('●', Colors.GREEN, bold=True) if (events.get('secondaryButton') or events.get('secondaryButtonPressed')) else colored('○', Colors.GRAY)
        tablet_btn = events.get('tabletButtons', 0)
        
        lines.append(colored('│', Colors.CYAN, bold=True) + 
                    " Buttons                                                     " + 
                    colored('│', Colors.CYAN, bold=True))
        lines.append(colored('│', Colors.CYAN, bold=True) + 
                    f"   Primary: {btn_primary}  Secondary: {btn_secondary}  " +
                    f"Express Keys: {colored(str(tablet_btn).rjust(2), Colors.WHITE)}          " + 
                    colored('│', Colors.CYAN, bold=True))
        
        # Calibration warning section
        if has_miscalibration:
            lines.append(colored('├─────────────────────────────────────────────────────────────┤', Colors.YELLOW, bold=True))
            lines.append(colored('│', Colors.YELLOW, bold=True) + 
                        colored(' ⚠  CONFIG NEEDS RECALIBRATION                               ', Colors.YELLOW) + 
                        colored('│', Colors.YELLOW, bold=True))
            lines.append(colored('│', Colors.YELLOW, bold=True) + 
                        colored(' Values exceed config max. Run walkthrough with full range:  ', Colors.GRAY) + 
                        colored('│', Colors.YELLOW, bold=True))
            
            if x_miscalibrated:
                x_info = f"  X: max={config_max_x} but saw {self.calibration.observed_max_x}".ljust(59)
                lines.append(colored('│', Colors.YELLOW, bold=True) + colored(x_info, Colors.RED) + 
                           colored('│', Colors.YELLOW, bold=True))
            if y_miscalibrated:
                y_info = f"  Y: max={config_max_y} but saw {self.calibration.observed_max_y}".ljust(59)
                lines.append(colored('│', Colors.YELLOW, bold=True) + colored(y_info, Colors.RED) + 
                           colored('│', Colors.YELLOW, bold=True))
            if pressure_miscalibrated:
                p_info = f"  Pressure: max={config_max_pressure} but saw {self.calibration.observed_max_pressure}".ljust(59)
                lines.append(colored('│', Colors.YELLOW, bold=True) + colored(p_info, Colors.RED) + 
                           colored('│', Colors.YELLOW, bold=True))
        
        # Raw bytes
        if self.show_raw:
            hex_str = ' '.join(f'{b:02X}' for b in data)
            lines.append(colored('├─────────────────────────────────────────────────────────────┤', Colors.CYAN, bold=True))
            lines.append(colored('│', Colors.CYAN, bold=True) + 
                        f" Raw: {colored(hex_str[:53].ljust(53), Colors.GRAY)} " + 
                        colored('│', Colors.CYAN, bold=True))
        
        lines.append(colored('└─────────────────────────────────────────────────────────────┘', Colors.CYAN, bold=True))
        lines.append(colored('Press Ctrl+C to stop', Colors.GRAY))
        
        # Build complete output
        content = '\n'.join([CLEAR_LINE + line for line in lines]) + '\n'
        
        # Write to stdout
        sys.stdout.write(HIDE_CURSOR + MOVE_HOME + content)
        sys.stdout.flush()
    
    def _create_bar_with_overflow(self, normalized_value: float, width: int) -> str:
        """Create a progress bar that shows overflow (values > 1.0)"""
        if normalized_value <= 1.0:
            filled = int(normalized_value * width)
            empty = width - filled
            return colored('█' * filled, Colors.GREEN) + colored('░' * empty, Colors.GRAY)
        else:
            # Show overflow - fill entire bar in red
            return colored('█' * width, Colors.RED) + colored('▶', Colors.RED, bold=True)
    
    async def stop(self):
        """Stop and show cursor again"""
        # Show cursor again (in case live mode hid it)
        sys.stdout.write('\x1b[?25h')
        sys.stdout.flush()
        await super().stop()


def main():
    parser = argparse.ArgumentParser(description='Tablet Event Viewer')
    parser.add_argument('-c', '--config', required=True, help='Path to tablet config JSON file')
    parser.add_argument('-m', '--mock', action='store_true', help='Use mock data instead of real device')
    parser.add_argument('-l', '--live', action='store_true', help='Live dashboard mode (updates in place)')
    parser.add_argument('--compact', action='store_true', help='Use compact single-line output')
    parser.add_argument('-r', '--raw', action='store_true', help='Show raw byte data')
    
    args = parser.parse_args()
    
    viewer = None
    try:
        viewer = EventViewer(
            args.config,
            mock=args.mock,
            raw=args.raw,
            compact=args.compact,
            live=args.live
        )

        # Run synchronously - no asyncio needed
        viewer.start()
    except KeyboardInterrupt:
        print(colored('\n\nShutdown signal received...', Colors.YELLOW))
        if viewer:
            viewer.stop_sync()
        print(colored('\n✓ Exited cleanly', Colors.GREEN))
        sys.exit(0)
    except Exception as error:
        print(colored('Error: ', Colors.RED) + str(error))
        sys.exit(1)


if __name__ == '__main__':
    main()