"""
Tablet Data Generator
Generates realistic HID packets for testing and walkthrough simulation
"""

import math
from typing import Generator, List, Tuple, Optional
from dataclasses import dataclass


@dataclass
class GeneratorConfig:
    """Configuration for tablet data generator"""
    max_x: int = 15999  # Match XP-Pen Deco 640 stable config
    max_y: int = 8999   # Match XP-Pen Deco 640 stable config
    max_pressure: int = 16383  # Match XP-Pen Deco 640 stable config
    report_id: int = 7  # Match XP-Pen Deco 640 stable config (reportId: 7)
    sample_rate: int = 200
    pressure_variation: float = 0.2
    driver_mode: bool = False  # Use driver-mode button encoding (status byte 240)


# Preset for driver-enabled mode (XP-Pen Deco 640 with driver active)
# Note: Resolution is determined by hardware, same as driverless mode
# The only difference is the button status byte (240 vs 1/3/6)
DRIVER_MODE_CONFIG = GeneratorConfig(
    max_x=15999,        # Same resolution as driverless (hardware constant)
    max_y=8999,         # Same resolution as driverless (hardware constant)
    max_pressure=16383,
    report_id=2,        # Driver mode may use different report ID
    sample_rate=200,
    pressure_variation=0.2,
    driver_mode=True    # Uses status byte 240 for buttons
)


# Preset for driverless mode (default, XP-Pen Deco 640 without driver)
DRIVERLESS_MODE_CONFIG = GeneratorConfig(
    max_x=15999,
    max_y=8999,
    max_pressure=16383,
    report_id=7,
    sample_rate=200,
    pressure_variation=0.2,
    driver_mode=False   # Uses status bytes 1/3/6 for buttons
)


class TabletDataGenerator:
    """
    Generates realistic tablet HID packets for testing
    Mimics XP-Pen Deco 640 packet structure
    """
    
    PEN_AWAY_PACKETS = 3
    
    # Tilt range constants matching stable config (XP-Pen Deco 640)
    TILT_POSITIVE_MAX = 60
    TILT_NEGATIVE_MIN = 196
    TILT_NEGATIVE_MAX = 255
    
    def __init__(self, config: Optional[GeneratorConfig] = None):
        self.config = config or GeneratorConfig()
        self.last_packet_state = {
            'x': 0,
            'y': 0,
            'pressure': 0,
            'tilt_x': 0,
            'tilt_y': 0,
            'status': 0xc0,
            'button': None
        }
    
    def _convert_tilt_to_byte(self, tilt: float) -> int:
        """
        Convert tilt value (-1.0 to 1.0) to byte value matching stable config ranges.
        
        Positive tilt (0 to 1): maps to 0 to TILT_POSITIVE_MAX (60)
        Negative tilt (-1 to 0): maps to TILT_NEGATIVE_MIN (196) to TILT_NEGATIVE_MAX (255)
        
        Args:
            tilt: Tilt value from -1.0 (negative/left) to 1.0 (positive/right)
            
        Returns:
            Byte value matching the device's tilt range
        """
        if tilt >= 0:
            # Positive tilt: 0 to TILT_POSITIVE_MAX
            return round(tilt * self.TILT_POSITIVE_MAX)
        else:
            # Negative tilt: TILT_NEGATIVE_MIN to TILT_NEGATIVE_MAX
            # tilt is -1.0 to 0, map to TILT_NEGATIVE_MIN to TILT_NEGATIVE_MAX
            return round(self.TILT_NEGATIVE_MIN + (-tilt) * (self.TILT_NEGATIVE_MAX - self.TILT_NEGATIVE_MIN))
    
    def generate_packet(
        self,
        x: float,
        y: float,
        pressure: float,
        tilt_x: float = 0,
        tilt_y: float = 0,
        status_byte_override: Optional[int] = None
    ) -> bytes:
        """
        Generate a single HID packet
        
        Args:
            x: X coordinate (0.0 to 1.0)
            y: Y coordinate (0.0 to 1.0)
            pressure: Pressure (0.0 to 1.0)
            tilt_x: Tilt X (-1.0 to 1.0)
            tilt_y: Tilt Y (-1.0 to 1.0)
            status_byte_override: Override status byte
        
        Returns:
            9-byte HID packet
        """
        # Normalize coordinates to device range
        normalized_x = round(x * self.config.max_x)
        normalized_y = round(y * self.config.max_y)
        # Pressure uses device-specific max value
        normalized_pressure = round(pressure * self.config.max_pressure)
        
        # Convert tilt to byte range matching stable config (XP-Pen Deco 640):
        # Positive tilt: 0 to positiveMax (60)
        # Negative tilt: negativeMin (196) to negativeMax (255)
        tilt_x_byte = self._convert_tilt_to_byte(tilt_x)
        tilt_y_byte = self._convert_tilt_to_byte(tilt_y)
        
        # Determine status byte
        if status_byte_override is not None:
            status_byte = status_byte_override
        elif pressure > 0:
            status_byte = 0xa1  # 161 - contact
        else:
            status_byte = 0xa0  # 160 - hover
        
        # Store state for translation
        self.last_packet_state = {
            'x': normalized_x,
            'y': normalized_y,
            'pressure': normalized_pressure,
            'tilt_x': tilt_x,
            'tilt_y': tilt_y,
            'status': status_byte,
            'button': None
        }
        
        # Create HID packet (without report ID - mock reader will prepend it)
        # When report ID (byte 0) is prepended by mock reader, the layout becomes:
        # Byte 0: Report ID (prepended by mock reader)
        # Byte 1: Status byte (config: status.byteIndex: [1])
        # Bytes 2-3: X coordinate (config: x.byteIndex: [2, 3])
        # Bytes 4-5: Y coordinate (config: y.byteIndex: [4, 5])
        # Bytes 6-7: Pressure (config: pressure.byteIndex: [6, 7])
        # Byte 8: Tilt X (config: tiltX.byteIndex: [8])
        # Byte 9: Tilt Y (config: tiltY.byteIndex: [9])
        packet = bytearray(9)
        packet[0] = status_byte  # Will become byte 1 after report ID prepended
        packet[1] = normalized_x & 0xff
        packet[2] = (normalized_x >> 8) & 0xff
        packet[3] = normalized_y & 0xff
        packet[4] = (normalized_y >> 8) & 0xff
        packet[5] = normalized_pressure & 0xff
        packet[6] = (normalized_pressure >> 8) & 0xff
        packet[7] = tilt_x_byte
        packet[8] = tilt_y_byte

        return bytes(packet)
    
    def generate_pen_away_packet(self) -> bytes:
        """Generate a 'pen away' packet (out of range)"""
        # Report ID will be prepended by mock reader
        packet = bytearray(9)
        packet[0] = 0xc0  # 192 - none/out of range (will become byte 1 after report ID prepended)
        return bytes(packet)
    
    def generate_line_constant_pressure(
        self,
        start_x: float,
        start_y: float,
        end_x: float,
        end_y: float,
        pressure: float,
        duration: int
    ) -> Generator[bytes, None, None]:
        """
        Generate a straight line with constant pressure

        Args:
            start_x, start_y: Start coordinates (0.0 to 1.0)
            end_x, end_y: End coordinates (0.0 to 1.0)
            pressure: Constant pressure (0.0 to 1.0)
            duration: Duration in milliseconds

        Yields:
            HID packets
        """
        total_samples = (duration * self.config.sample_rate) // 1000

        for i in range(total_samples):
            # Use (total_samples - 1) to ensure t reaches exactly 1.0 at the end
            t = i / (total_samples - 1) if total_samples > 1 else 0
            x = start_x + (end_x - start_x) * t
            y = start_y + (end_y - start_y) * t
            yield self.generate_packet(x, y, pressure)

        # Add pen away packets at the end
        for _ in range(self.PEN_AWAY_PACKETS):
            yield self.generate_pen_away_packet()
    
    def generate_line_varying_pressure(
        self,
        start_x: float,
        start_y: float,
        end_x: float,
        end_y: float,
        duration: int
    ) -> Generator[bytes, None, None]:
        """
        Generate a straight line with varying pressure (pressure sweep)

        Args:
            start_x, start_y: Start coordinates (0.0 to 1.0)
            end_x, end_y: End coordinates (0.0 to 1.0)
            duration: Duration in milliseconds

        Yields:
            HID packets
        """
        total_samples = (duration * self.config.sample_rate) // 1000

        for i in range(total_samples):
            # Use (total_samples - 1) to ensure t reaches exactly 1.0 at the end
            t = i / (total_samples - 1) if total_samples > 1 else 0
            x = start_x + (end_x - start_x) * t
            y = start_y + (end_y - start_y) * t

            # Pressure varies from 0 to 1 and back
            pressure = math.sin(t * math.pi)

            yield self.generate_packet(x, y, pressure)

        # Add pen away packets at the end
        for _ in range(self.PEN_AWAY_PACKETS):
            yield self.generate_pen_away_packet()
    
    def generate_circle(
        self,
        center_x: float,
        center_y: float,
        radius: float,
        duration: int,
        pressure: float = 0.5
    ) -> Generator[bytes, None, None]:
        """
        Generate a circular motion
        
        Args:
            center_x, center_y: Center coordinates (0.0 to 1.0)
            radius: Radius (0.0 to 1.0)
            duration: Duration in milliseconds
            pressure: Pressure (0.0 to 1.0)
        
        Yields:
            HID packets
        """
        total_samples = (duration * self.config.sample_rate) // 1000
        
        for i in range(total_samples):
            t = i / (total_samples - 1) if total_samples > 1 else 0
            angle = t * 2 * math.pi
            x = center_x + radius * math.cos(angle)
            y = center_y + radius * math.sin(angle)
            yield self.generate_packet(x, y, pressure)
        
        # Add pen away packets at the end
        for _ in range(self.PEN_AWAY_PACKETS):
            yield self.generate_pen_away_packet()
    
    def generate_hover_circle(
        self,
        center_x: float,
        center_y: float,
        radius: float,
        duration: int
    ) -> Generator[bytes, None, None]:
        """
        Generate a circular motion while hovering (no pressure)
        
        Args:
            center_x, center_y: Center coordinates (0.0 to 1.0)
            radius: Radius (0.0 to 1.0)
            duration: Duration in milliseconds
        
        Yields:
            HID packets
        """
        total_samples = (duration * self.config.sample_rate) // 1000
        
        for i in range(total_samples):
            t = i / (total_samples - 1) if total_samples > 1 else 0
            angle = t * 2 * math.pi
            x = center_x + radius * math.cos(angle)
            y = center_y + radius * math.sin(angle)
            yield self.generate_packet(x, y, 0, 0, 0, 0xa0)  # Hover status
        
        # Add pen away packets at the end
        for _ in range(self.PEN_AWAY_PACKETS):
            yield self.generate_pen_away_packet()
    
    def generate_tilt_x_sweep(
        self,
        x: float,
        y: float,
        duration: int
    ) -> Generator[bytes, None, None]:
        """
        Generate tilt X sweep (left to right tilt)
        
        Args:
            x, y: Position (0.0 to 1.0)
            duration: Duration in milliseconds
        
        Yields:
            HID packets
        """
        total_samples = (duration * self.config.sample_rate) // 1000
        
        for i in range(total_samples):
            t = i / (total_samples - 1) if total_samples > 1 else 0
            # Tilt from -1 (left) to +1 (right)
            tilt_x = -1 + 2 * t
            yield self.generate_packet(x, y, 0.5, tilt_x, 0)
        
        # Add pen away packets at the end
        for _ in range(self.PEN_AWAY_PACKETS):
            yield self.generate_pen_away_packet()
    
    def generate_tilt_y_sweep(
        self,
        x: float,
        y: float,
        duration: int
    ) -> Generator[bytes, None, None]:
        """
        Generate tilt Y sweep (forward to backward tilt)
        
        Args:
            x, y: Position (0.0 to 1.0)
            duration: Duration in milliseconds
        
        Yields:
            HID packets
        """
        total_samples = (duration * self.config.sample_rate) // 1000
        
        for i in range(total_samples):
            t = i / (total_samples - 1) if total_samples > 1 else 0
            # Tilt from -1 (forward) to +1 (backward)
            tilt_y = -1 + 2 * t
            yield self.generate_packet(x, y, 0.5, 0, tilt_y)
        
        # Add pen away packets at the end
        for _ in range(self.PEN_AWAY_PACKETS):
            yield self.generate_pen_away_packet()
    
    def generate_primary_button_press(
        self,
        start_x: float,
        start_y: float,
        end_x: float,
        end_y: float,
        duration: int
    ) -> Generator[bytes, None, None]:
        """
        Generate primary button press gesture
        
        Args:
            start_x, start_y: Start coordinates (0.0 to 1.0)
            end_x, end_y: End coordinates (0.0 to 1.0)
            duration: Duration in milliseconds
        
        Yields:
            HID packets
        """
        total_samples = (duration * self.config.sample_rate) // 1000
        half_samples = total_samples // 2
        
        for i in range(total_samples):
            t = i / (total_samples - 1) if total_samples > 1 else 0
            x = start_x + (end_x - start_x) * t
            y = start_y + (end_y - start_y) * t

            # First half: hover + primary button (0xa4 = 164)
            # Second half: contact + primary button (0xa5 = 165)
            if i < half_samples:
                yield self.generate_packet(x, y, 0, 0, 0, 0xa4)
            else:
                yield self.generate_packet(x, y, 0.7, 0, 0, 0xa5)
        
        # Add pen away packets at the end
        for _ in range(self.PEN_AWAY_PACKETS):
            yield self.generate_pen_away_packet()
    
    def generate_secondary_button_press(
        self,
        start_x: float,
        start_y: float,
        end_x: float,
        end_y: float,
        duration: int
    ) -> Generator[bytes, None, None]:
        """
        Generate secondary button press gesture
        
        Args:
            start_x, start_y: Start coordinates (0.0 to 1.0)
            end_x, end_y: End coordinates (0.0 to 1.0)
            duration: Duration in milliseconds
        
        Yields:
            HID packets
        """
        total_samples = (duration * self.config.sample_rate) // 1000
        half_samples = total_samples // 2
        
        for i in range(total_samples):
            t = i / (total_samples - 1) if total_samples > 1 else 0
            x = start_x + (end_x - start_x) * t
            y = start_y + (end_y - start_y) * t

            # First half: hover + secondary button (0xa2 = 162)
            # Second half: contact + secondary button (0xa3 = 163)
            if i < half_samples:
                yield self.generate_packet(x, y, 0, 0, 0, 0xa2)
            else:
                yield self.generate_packet(x, y, 0.7, 0, 0, 0xa3)
        
        # Add pen away packets at the end
        for _ in range(self.PEN_AWAY_PACKETS):
            yield self.generate_pen_away_packet()
    
    def generate_button_packet(self, button_number: int) -> bytes:
        """
        Generate button press packet
        
        Args:
            button_number: Button number (1-8)
        
        Returns:
            HID packet (report ID will be prepended by mock reader)
        """
        # Driver mode uses status byte 240 (0xf0), driverless uses status byte 1
        status_byte = 0xf0 if self.config.driver_mode else 0x01
        
        # Store state for translation
        self.last_packet_state = {
            'x': 0,
            'y': 0,
            'pressure': 0,
            'tilt_x': 0,
            'tilt_y': 0,
            'status': status_byte,
            'button': button_number
        }
        
        # After report ID is prepended, layout will be:
        # Byte 0: Report ID (prepended by mock reader)
        # Byte 1: Status byte (1 = buttons mode for driverless, 240 = buttons mode for driver)
        # Byte 2: Button scan code (tabletButtons.byteIndex: [2])
        packet = bytearray(10)
        packet[0] = status_byte  # Button mode status (will become byte 1)
        packet[1] = 1 << (button_number - 1)  # Button data (will become byte 2)
        return bytes(packet)
    
    def generate_tablet_button_presses(
        self,
        button_count: int,
        duration: int
    ) -> Generator[bytes, None, None]:
        """
        Generate tablet button press sequence
        
        Args:
            button_count: Number of buttons to press
            duration: Duration in milliseconds
        
        Yields:
            HID packets
        """
        press_duration = duration // button_count
        samples_per_button = (press_duration * self.config.sample_rate) // 1000
        
        for button_num in range(1, button_count + 1):
            # Press button
            for _ in range(samples_per_button // 2):
                yield self.generate_button_packet(button_num)
            
            # Release (pen away)
            for _ in range(samples_per_button // 2):
                yield self.generate_pen_away_packet()