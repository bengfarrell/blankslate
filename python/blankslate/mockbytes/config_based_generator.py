"""
Config-Based Mock Data Generator
Generates mock HID packets that match a specific device configuration
"""

from typing import Dict, Any, Generator, Optional
import json
from pathlib import Path

from .tablet_data_generator import TabletDataGenerator, GeneratorConfig


class ConfigBasedGenerator:
    """
    Generates mock data tailored to a specific device configuration.
    Reads the config and creates packets matching the exact byte structure.
    """

    def __init__(self, config_path: str):
        """
        Initialize generator from a config file

        Args:
            config_path: Path to the device config JSON file
        """
        with open(config_path, 'r') as f:
            self.config = json.load(f)

        # Support both multi-mode format (modes array) and legacy single-mode format
        if 'modes' in self.config and isinstance(self.config['modes'], list) and len(self.config['modes']) > 0:
            # Multi-mode format: extract from first mode
            first_mode = self.config['modes'][0]
            self.mappings = first_mode.get('byteCodeMappings', {})
            self.report_id = first_mode.get('reportId', 2)
        else:
            # Legacy single-mode format
            self.mappings = self.config.get('byteCodeMappings', {})
            self.report_id = self.config.get('reportId', 2)

        # Extract device parameters from config
        self.max_x = self._get_max_value('x')
        self.max_y = self._get_max_value('y')
        self.max_pressure = self._get_max_value('pressure')

        # Get button configuration
        self.button_config = self.mappings.get('tabletButtons', {})
        self.button_type = self.button_config.get('type', 'bit-flags')

        # Sample rate for packet generation
        self.sample_rate = 200

        # Create underlying generator with config parameters
        self.generator = TabletDataGenerator(GeneratorConfig(
            max_x=self.max_x,
            max_y=self.max_y,
            max_pressure=self.max_pressure,
            report_id=self.report_id,
            sample_rate=self.sample_rate
        ))

    def _get_max_value(self, key: str) -> int:
        """Get max value for a coordinate/pressure mapping"""
        mapping = self.mappings.get(key, {})
        # Generic fallbacks: 16-bit for coordinates, 13-bit for pressure
        return mapping.get('max', 65535 if key in ['x', 'y'] else 8191)

    def _convert_tilt_to_byte(self, tilt: float, tilt_key: str) -> int:
        """
        Convert tilt value (-1.0 to 1.0) to byte value using config ranges

        Args:
            tilt: Tilt value from -1.0 (negative) to 1.0 (positive)
            tilt_key: 'tiltX' or 'tiltY'

        Returns:
            Byte value matching the device's tilt range
        """
        tilt_mapping = self.mappings.get(tilt_key, {})

        # Get ranges from config (if bipolar-range type)
        if tilt_mapping.get('type') == 'bipolar-range':
            positive_max = tilt_mapping.get('positiveMax', 127)
            negative_min = tilt_mapping.get('negativeMin', 128)
            negative_max = tilt_mapping.get('negativeMax', 255)

            if tilt >= 0:
                # Positive tilt: 0 to positive_max
                return round(tilt * positive_max)
            else:
                # Negative tilt: negative_min to negative_max
                # tilt is -1.0 to 0, map to negative_min to negative_max
                return round(negative_min + (-tilt) * (negative_max - negative_min))
        else:
            # Fallback to full 0-255 range
            return round(((tilt + 1) / 2) * 255)

    def _get_status_byte_for_state(self, state: str, **kwargs) -> int:
        """
        Find the status byte value for a given state

        Args:
            state: State name (hover, contact, buttons, etc.)
            **kwargs: Additional properties to match (primaryButtonPressed, etc.)

        Returns:
            Status byte value
        """
        status_mapping = self.mappings.get('status', {})
        values = status_mapping.get('values', {})

        for byte_str, props in values.items():
            if props.get('state') == state:
                # Check if all kwargs match
                match = True
                for key, value in kwargs.items():
                    if props.get(key) != value:
                        match = False
                        break
                if match:
                    return int(byte_str)

        # Fallback defaults
        if state == 'hover':
            return 0xa0  # 160
        elif state == 'contact':
            return 0xa1  # 161
        elif state == 'buttons':
            return 0x01
        elif state == 'keyboard':
            return 0x00
        else:
            return 0xc0  # none/away

    def generate_button_packet(self, button_number: int) -> bytes:
        """
        Generate a button press packet matching the config

        Args:
            button_number: Button number (1-8)

        Returns:
            HID packet bytes (report ID will be prepended by mock reader)
        """
        if self.button_type == 'code':
            # Find the scan code for this button
            values = self.button_config.get('values', {})
            status_overrides = self.button_config.get('statusOverrides', [])

            # Find scan code for this button
            scan_code = None
            status_byte = self._get_status_byte_for_state('buttons')

            # Check if this button is in statusOverrides
            for override in status_overrides:
                if override.get('buttonNumber') == button_number:
                    scan_code = override.get('scanCode')
                    status_byte = override.get('statusByte')
                    break

            # If not in overrides, find in values
            if scan_code is None:
                for code_str, props in values.items():
                    if props.get('button') == button_number:
                        scan_code = int(code_str)
                        break

            if scan_code is None:
                # Fallback to button number as scan code
                scan_code = button_number

            # Get button byte index from config (subtract 1 since no report ID)
            byte_indices = self.button_config.get('byteIndex', [2])
            button_byte_index = (byte_indices[0] - 1) if byte_indices and byte_indices[0] > 0 else 1

            # Get status byte index from config (subtract 1 since no report ID)
            status_mapping = self.mappings.get('status', {})
            status_byte_indices = status_mapping.get('byteIndex', [1])
            status_byte_index = (status_byte_indices[0] - 1) if status_byte_indices and status_byte_indices[0] > 0 else 0

            # Create packet - size based on max byte index + 1
            packet_size = max(button_byte_index, status_byte_index) + 1
            packet = bytearray(packet_size)
            packet[status_byte_index] = status_byte
            packet[button_byte_index] = scan_code

            return bytes(packet)

        elif self.button_type == 'bit-flags':
            # Use bit-flags approach
            return self.generator.generate_button_packet(button_number)

        else:
            # keyboard-events type - not supported in mock yet
            raise NotImplementedError(f"Button type '{self.button_type}' not supported in mock generator")

    def generate_stylus_packet(self, x: float, y: float, pressure: float,
                               tilt_x: float = 0, tilt_y: float = 0,
                               primary_button: bool = False,
                               secondary_button: bool = False) -> bytes:
        """
        Generate a stylus packet matching the config

        Args:
            x, y: Coordinates (0.0 to 1.0)
            pressure: Pressure (0.0 to 1.0)
            tilt_x, tilt_y: Tilt values (-1.0 to 1.0)
            primary_button: Primary button pressed
            secondary_button: Secondary button pressed

        Returns:
            HID packet bytes
        """
        # Normalize coordinates to device range
        normalized_x = round(x * self.max_x)
        normalized_y = round(y * self.max_y)
        normalized_pressure = round(pressure * self.max_pressure)

        # Convert tilt to byte range using config-specified ranges
        tilt_x_byte = self._convert_tilt_to_byte(tilt_x, 'tiltX')
        tilt_y_byte = self._convert_tilt_to_byte(tilt_y, 'tiltY')

        # Determine status byte
        if pressure > 0:
            state = 'contact'
        else:
            state = 'hover'

        status_byte = self._get_status_byte_for_state(
            state,
            primaryButtonPressed=primary_button if primary_button else None,
            secondaryButtonPressed=secondary_button if secondary_button else None
        )

        # Build packet according to config byte mappings
        # Config byte indices assume report ID at byte 0
        # We generate packets WITHOUT report ID (mock reader will prepend it)
        # So we subtract 1 from all config indices
        max_byte_index = 0
        for key in ['x', 'y', 'pressure', 'status', 'tiltX', 'tiltY']:
            mapping = self.mappings.get(key, {})
            byte_indices = mapping.get('byteIndex', [])
            if byte_indices:
                max_byte_index = max(max_byte_index, max(byte_indices))

        # Packet size is max_index (not +1) because we don't include report ID
        packet_size = max_byte_index
        packet = bytearray(packet_size)

        # Set status byte (config index - 1 since no report ID)
        status_mapping = self.mappings.get('status', {})
        status_indices = status_mapping.get('byteIndex', [1])
        if status_indices and status_indices[0] > 0:
            packet[status_indices[0] - 1] = status_byte

        # Set X coordinate (config indices - 1)
        x_mapping = self.mappings.get('x', {})
        x_indices = x_mapping.get('byteIndex', [2, 3])
        if len(x_indices) >= 2 and x_indices[0] > 0:
            packet[x_indices[0] - 1] = normalized_x & 0xff
            packet[x_indices[1] - 1] = (normalized_x >> 8) & 0xff

        # Set Y coordinate (config indices - 1)
        y_mapping = self.mappings.get('y', {})
        y_indices = y_mapping.get('byteIndex', [4, 5])
        if len(y_indices) >= 2 and y_indices[0] > 0:
            packet[y_indices[0] - 1] = normalized_y & 0xff
            packet[y_indices[1] - 1] = (normalized_y >> 8) & 0xff

        # Set pressure (config indices - 1)
        pressure_mapping = self.mappings.get('pressure', {})
        pressure_indices = pressure_mapping.get('byteIndex', [6, 7])
        if len(pressure_indices) >= 2 and pressure_indices[0] > 0:
            packet[pressure_indices[0] - 1] = normalized_pressure & 0xff
            packet[pressure_indices[1] - 1] = (normalized_pressure >> 8) & 0xff

        # Set tilt X (config index - 1)
        tilt_x_mapping = self.mappings.get('tiltX', {})
        tilt_x_indices = tilt_x_mapping.get('byteIndex', [])
        if tilt_x_indices and tilt_x_indices[0] > 0 and (tilt_x_indices[0] - 1) < len(packet):
            packet[tilt_x_indices[0] - 1] = tilt_x_byte

        # Set tilt Y (config index - 1)
        tilt_y_mapping = self.mappings.get('tiltY', {})
        tilt_y_indices = tilt_y_mapping.get('byteIndex', [])
        if tilt_y_indices and tilt_y_indices[0] > 0 and (tilt_y_indices[0] - 1) < len(packet):
            packet[tilt_y_indices[0] - 1] = tilt_y_byte

        return bytes(packet)

    def generate_pen_away_packet(self) -> bytes:
        """
        Generate a 'pen away' packet (out of range) matching the device config structure

        Returns:
            HID packet bytes with 'none' status (report ID will be prepended by mock reader)
        """
        # Get status byte for 'none' state
        status_byte = self._get_status_byte_for_state('none')

        # Get all byte indices to determine packet size
        all_indices = []
        for mapping in self.mappings.values():
            if 'byteIndex' in mapping:
                all_indices.extend(mapping['byteIndex'])

        max_byte_index = max(all_indices) if all_indices else 9
        # Packet size is max_index (no report ID included)
        packet_size = max_byte_index
        packet = bytearray(packet_size)

        # Set status byte (config index - 1 since no report ID)
        status_mapping = self.mappings.get('status', {})
        status_indices = status_mapping.get('byteIndex', [1])
        if status_indices and status_indices[0] > 0:
            packet[status_indices[0] - 1] = status_byte

        return bytes(packet)

    # Convenience methods for common gestures

    def generate_horizontal_line(self, y: float = 0.5, pressure: float = 0.5,
                                 duration: int = 1500) -> Generator[bytes, None, None]:
        """Generate horizontal line gesture with realistic tilt variation"""
        import random
        total_samples = (duration * 200) // 1000
        for i in range(total_samples):
            # Use (total_samples - 1) to ensure t reaches exactly 1.0 at the end
            t = i / (total_samples - 1) if total_samples > 1 else 0
            x = t
            # Add realistic tilt variation (small random changes like real hand movement)
            # This ensures X bytes have more variance than tilt bytes
            tilt_x = random.uniform(-0.1, 0.1)  # Small random tilt
            tilt_y = random.uniform(-0.1, 0.1)
            yield self.generate_stylus_packet(x, y, pressure, tilt_x=tilt_x, tilt_y=tilt_y)

        # Pen away
        for _ in range(3):
            yield self.generate_pen_away_packet()

    def generate_vertical_line(self, x: float = 0.5, pressure: float = 0.5,
                              duration: int = 1500) -> Generator[bytes, None, None]:
        """Generate vertical line gesture with realistic tilt variation"""
        import random
        total_samples = (duration * 200) // 1000
        for i in range(total_samples):
            # Use (total_samples - 1) to ensure t reaches exactly 1.0 at the end
            t = i / (total_samples - 1) if total_samples > 1 else 0
            y = t
            # Add realistic tilt variation (small random changes like real hand movement)
            tilt_x = random.uniform(-0.1, 0.1)
            tilt_y = random.uniform(-0.1, 0.1)
            yield self.generate_stylus_packet(x, y, pressure, tilt_x=tilt_x, tilt_y=tilt_y)

        # Pen away
        for _ in range(3):
            yield self.generate_pen_away_packet()

    def generate_pressure_sweep(self, x: float = 0.5, y: float = 0.5,
                               duration: int = 1500) -> Generator[bytes, None, None]:
        """Generate pressure sweep gesture with realistic position noise"""
        import random
        total_samples = (duration * 200) // 1000
        for i in range(total_samples):
            # Use (total_samples - 1) to ensure t reaches exactly 1.0 at the end
            t = i / (total_samples - 1) if total_samples > 1 else 0
            pressure = t
            # Add small position/tilt noise (hand naturally moves slightly during pressure changes)
            noisy_x = x + random.uniform(-0.02, 0.02)
            noisy_y = y + random.uniform(-0.02, 0.02)
            tilt_x = random.uniform(-0.1, 0.1)
            tilt_y = random.uniform(-0.1, 0.1)
            yield self.generate_stylus_packet(noisy_x, noisy_y, pressure, tilt_x=tilt_x, tilt_y=tilt_y)

        # Pen away
        for _ in range(3):
            yield self.generate_pen_away_packet()

    def generate_button_sequence(self, button_count: int = 8,
                                duration: int = 2000) -> Generator[bytes, None, None]:
        """Generate sequence of button presses"""
        samples_per_button = (duration * 200) // (1000 * button_count)

        for button_num in range(1, button_count + 1):
            for _ in range(samples_per_button):
                yield self.generate_button_packet(button_num)

    def get_device_info(self) -> Dict[str, Any]:
        """Get device info from config"""
        device_info_config = self.config.get('deviceInfo', {})

        return {
            'vendor_id': int(self.config.get('vendorId', '0x0000'), 16),
            'product_id': int(self.config.get('productId', '0x0000'), 16),
            'product_name': self.config.get('name', 'Mock Tablet'),
            'product_string': device_info_config.get('product_string', self.config.get('name', 'Mock Tablet')),
            'manufacturer': self.config.get('manufacturer', 'Mock'),
            'usage_page': device_info_config.get('usage_page', 13),
            'usage': device_info_config.get('usage', 2),
            'interfaces': device_info_config.get('interfaces', [13]),
            'report_id': self.config.get('reportId', 2)
        }

    # Additional gesture methods for compatibility with TabletDataGenerator

    def generate_circle(self, center_x: float, center_y: float, radius: float, duration: int):
        """Generate circular motion gesture"""
        import math
        num_packets = int((duration / 1000.0) * self.sample_rate)

        for i in range(num_packets):
            angle = (i / num_packets) * 2 * math.pi
            x = center_x + radius * math.cos(angle)
            y = center_y + radius * math.sin(angle)
            yield self.generate_stylus_packet(x, y, 0.5)

        # Pen away
        for _ in range(3):
            yield self.generate_pen_away_packet()

    def generate_hover_circle(self, center_x: float, center_y: float, radius: float, duration: int):
        """Generate hover circle (no pressure)"""
        import math
        num_packets = int((duration / 1000.0) * self.sample_rate)

        for i in range(num_packets):
            angle = (i / num_packets) * 2 * math.pi
            x = center_x + radius * math.cos(angle)
            y = center_y + radius * math.sin(angle)
            yield self.generate_stylus_packet(x, y, 0.0)

        # Pen away
        for _ in range(3):
            yield self.generate_pen_away_packet()

    def generate_tilt_x_sweep(self, x: float, y: float, duration: int):
        """Generate tilt X sweep gesture"""
        num_packets = int((duration / 1000.0) * self.sample_rate)

        for i in range(num_packets):
            progress = i / (num_packets - 1) if num_packets > 1 else 0
            tilt_x = -1.0 + (progress * 2.0)  # -1 to 1
            yield self.generate_stylus_packet(x, y, 0.5, tilt_x=tilt_x)

        # Pen away
        for _ in range(3):
            yield self.generate_pen_away_packet()

    def generate_tilt_y_sweep(self, x: float, y: float, duration: int):
        """Generate tilt Y sweep gesture"""
        num_packets = int((duration / 1000.0) * self.sample_rate)

        for i in range(num_packets):
            progress = i / (num_packets - 1) if num_packets > 1 else 0
            tilt_y = -1.0 + (progress * 2.0)  # -1 to 1
            yield self.generate_stylus_packet(x, y, 0.5, tilt_y=tilt_y)

        # Pen away
        for _ in range(3):
            yield self.generate_pen_away_packet()

    def generate_primary_button_press(self, start_x: float, start_y: float,
                                     end_x: float, end_y: float, duration: int):
        """Generate primary button press gesture"""
        num_packets = int((duration / 1000.0) * self.sample_rate)

        for i in range(num_packets):
            progress = i / num_packets
            x = start_x + (end_x - start_x) * progress
            y = start_y + (end_y - start_y) * progress
            yield self.generate_stylus_packet(x, y, 0.5, primary_button=True)

        # Pen away
        for _ in range(3):
            yield self.generate_pen_away_packet()

    def generate_secondary_button_press(self, start_x: float, start_y: float,
                                       end_x: float, end_y: float, duration: int):
        """Generate secondary button press gesture"""
        num_packets = int((duration / 1000.0) * self.sample_rate)

        for i in range(num_packets):
            progress = i / num_packets
            x = start_x + (end_x - start_x) * progress
            y = start_y + (end_y - start_y) * progress
            yield self.generate_stylus_packet(x, y, 0.5, secondary_button=True)

        # Pen away
        for _ in range(3):
            yield self.generate_pen_away_packet()

    def generate_line_constant_pressure(self, start_x: float, start_y: float,
                                       end_x: float, end_y: float,
                                       pressure: float, duration: int):
        """Generate line with constant pressure"""
        num_packets = int((duration / 1000.0) * self.sample_rate)

        for i in range(num_packets):
            progress = i / num_packets
            x = start_x + (end_x - start_x) * progress
            y = start_y + (end_y - start_y) * progress
            yield self.generate_stylus_packet(x, y, pressure)

        # Pen away
        for _ in range(3):
            yield self.generate_pen_away_packet()

    def generate_line_varying_pressure(self, start_x: float, start_y: float,
                                      end_x: float, end_y: float, duration: int):
        """Generate line with varying pressure"""
        import math
        num_packets = int((duration / 1000.0) * self.sample_rate)

        for i in range(num_packets):
            progress = i / num_packets
            x = start_x + (end_x - start_x) * progress
            y = start_y + (end_y - start_y) * progress
            # Vary pressure from 0 to 1 and back
            pressure = abs(math.sin(progress * math.pi))
            yield self.generate_stylus_packet(x, y, pressure)

        # Pen away
        for _ in range(3):
            yield self.generate_pen_away_packet()

    def generate_tablet_button_presses(self, button_count: int, duration: int):
        """Alias for generate_button_sequence for compatibility"""
        return self.generate_button_sequence(button_count, duration)


def create_config_based_generator(config_path: str) -> ConfigBasedGenerator:
    """
    Factory function to create a config-based generator

    Args:
        config_path: Path to device config JSON file

    Returns:
        ConfigBasedGenerator instance
    """
    return ConfigBasedGenerator(config_path)