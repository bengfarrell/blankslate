"""
Mock HID Reader
Simulates HID device for testing and walkthrough
"""

import asyncio
import time
from typing import Optional, Callable, Dict
from dataclasses import dataclass

from .tablet_data_generator import TabletDataGenerator, GeneratorConfig


@dataclass
class MockHIDReaderConfig:
    """Configuration for mock HID reader"""
    vendor_id: int = 0x056a  # Wacom vendor ID
    product_id: int = 0x0001
    product_name: str = 'Mock Graphics Tablet'
    report_id: int = 2
    packet_interval: int = 5  # milliseconds between packets
    max_x: int = 16000
    max_y: int = 9000
    sample_rate: int = 200


class MockHIDReader:
    """
    Mock HID reader for testing
    Simulates a graphics tablet by generating realistic HID packets
    """

    def __init__(self, config: Optional[MockHIDReaderConfig] = None, custom_generator=None):
        self.config = config or MockHIDReaderConfig()

        # Use custom generator if provided, otherwise create default
        if custom_generator:
            self.generator = custom_generator
            # Get device info from custom generator if available
            if hasattr(custom_generator, 'get_device_info'):
                self.device_info = custom_generator.get_device_info()
            else:
                self.device_info = {
                    'vendor_id': self.config.vendor_id,
                    'product_id': self.config.product_id,
                    'product_name': self.config.product_name,
                    'manufacturer': 'Mock Device',
                    'usage_page': 13,
                    'usage': 2
                }
        else:
            self.generator = TabletDataGenerator(GeneratorConfig(
                max_x=self.config.max_x,
                max_y=self.config.max_y,
                report_id=self.config.report_id,
                sample_rate=self.config.sample_rate
            ))
            self.device_info = {
                'vendor_id': self.config.vendor_id,
                'product_id': self.config.product_id,
                'product_name': self.config.product_name,
                'manufacturer': 'Mock Device',
                'usage_page': 13,
                'usage': 2
            }

        self.is_reading = False
        self.is_playing = False
        self.callback: Optional[Callable] = None
        self.read_task: Optional[asyncio.Task] = None
        self.play_task: Optional[asyncio.Task] = None
    
    def get_device_info(self) -> Dict:
        """Get device information"""
        return self.device_info
    
    def start_reading(self, callback: Callable[[bytes, Optional[int]], None]) -> None:
        """
        Start reading HID packets

        Args:
            callback: Function to call with each packet (data, report_id)
                     report_id is optional for backwards compatibility
        """
        self.callback = callback
        self.is_reading = True
    
    def stop_reading(self) -> None:
        """Stop reading HID packets"""
        self.is_reading = False
        self.callback = None
    
    async def close(self) -> None:
        """Close the reader"""
        self.stop_reading()
        self.stop_playing()
        if self.read_task:
            self.read_task.cancel()
        if self.play_task:
            self.play_task.cancel()
    
    def stop_playing(self) -> None:
        """Stop playing current gesture"""
        self.is_playing = False
    
    async def play(self, packets) -> None:
        """
        Play a sequence of packets

        Args:
            packets: Generator or iterable of packets
        """
        self.is_playing = True

        # Get report ID from generator if available, otherwise use config
        report_id = self.config.report_id
        if hasattr(self.generator, 'report_id'):
            report_id = self.generator.report_id

        try:
            for packet in packets:
                if not self.is_playing:
                    break

                if self.is_reading and self.callback:
                    # Prepend report ID to match real HID reader behavior
                    # Real readers pass full data including report ID at byte 0
                    # This matches stable config byte indices: status at [1], x at [2,3], etc.
                    packet_with_report_id = bytes([report_id]) + packet
                    try:
                        self.callback(packet_with_report_id, report_id)
                    except TypeError:
                        # Backwards compatibility: callback doesn't accept report_id
                        self.callback(packet_with_report_id)

                # Wait between packets
                await asyncio.sleep(self.config.packet_interval / 1000.0)
        finally:
            self.is_playing = False
    
    # Gesture methods
    
    async def play_horizontal_drag(self, y: float = 0.5, duration: int = 1500) -> None:
        """Play horizontal drag gesture"""
        # Use config generator's method if available, otherwise use default
        if hasattr(self.generator, 'generate_horizontal_line'):
            packets = self.generator.generate_horizontal_line(y, 0.5, duration)
        else:
            packets = self.generator.generate_line_constant_pressure(0, y, 1, y, 0.5, duration)
        await self.play(packets)

    async def play_vertical_drag(self, x: float = 0.5, duration: int = 1500) -> None:
        """Play vertical drag gesture"""
        # Use config generator's method if available, otherwise use default
        if hasattr(self.generator, 'generate_vertical_line'):
            packets = self.generator.generate_vertical_line(x, 0.5, duration)
        else:
            packets = self.generator.generate_line_constant_pressure(x, 0, x, 1, 0.5, duration)
        await self.play(packets)

    async def play_pressure_sweep(self, duration: int = 1500) -> None:
        """Play pressure sweep gesture (stationary with varying pressure)"""
        # Use config generator's method if available, otherwise use default
        if hasattr(self.generator, 'generate_pressure_sweep'):
            packets = self.generator.generate_pressure_sweep(0.5, 0.5, duration)
        else:
            packets = self.generator.generate_line_varying_pressure(0.5, 0.5, 0.5, 0.5, duration)
        await self.play(packets)
    
    async def play_circle(
        self,
        center_x: float = 0.5,
        center_y: float = 0.5,
        radius: float = 0.3,
        duration: int = 1500
    ) -> None:
        """Play circular motion gesture"""
        packets = self.generator.generate_circle(center_x, center_y, radius, duration)
        await self.play(packets)
    
    async def play_hover_movement(self, duration: int = 1500) -> None:
        """Play hover movement gesture (circle without pressure)"""
        packets = self.generator.generate_hover_circle(0.5, 0.5, 0.3, duration)
        await self.play(packets)
    
    async def play_tilt_x_sweep(self, duration: int = 1500) -> None:
        """Play tilt X sweep gesture"""
        packets = self.generator.generate_tilt_x_sweep(0.5, 0.5, duration)
        await self.play(packets)
    
    async def play_tilt_y_sweep(self, duration: int = 1500) -> None:
        """Play tilt Y sweep gesture"""
        packets = self.generator.generate_tilt_y_sweep(0.5, 0.5, duration)
        await self.play(packets)
    
    async def play_primary_button(self, duration: int = 1500) -> None:
        """Play primary button press gesture"""
        packets = self.generator.generate_primary_button_press(0.3, 0.5, 0.7, 0.5, duration)
        await self.play(packets)
    
    async def play_secondary_button(self, duration: int = 1500) -> None:
        """Play secondary button press gesture"""
        packets = self.generator.generate_secondary_button_press(0.3, 0.5, 0.7, 0.5, duration)
        await self.play(packets)
    
    async def play_tablet_buttons(self, button_count: int = 4, duration: int = 2000) -> None:
        """Play tablet button press sequence"""
        # Use config generator's method if available, otherwise use default
        if hasattr(self.generator, 'generate_button_sequence'):
            packets = self.generator.generate_button_sequence(button_count, duration)
        else:
            packets = self.generator.generate_tablet_button_presses(button_count, duration)
        await self.play(packets)
    
    async def play_gesture_for_step(self, gesture: str, duration: int = 1500) -> None:
        """
        Play the gesture matching the walkthrough step

        Args:
            gesture: Gesture type (horizontal, vertical, pressure, etc.)
            duration: Duration in milliseconds
        """
        gesture_map = {
            'horizontal': lambda d: self.play_horizontal_drag(duration=d),
            'vertical': lambda d: self.play_vertical_drag(duration=d),
            'pressure': lambda d: self.play_pressure_sweep(duration=d),
            'circle': lambda d: self.play_circle(duration=d),
            'hover': lambda d: self.play_hover_movement(duration=d),
            'hover-movement': lambda d: self.play_hover_movement(duration=d),
            'tilt-x': lambda d: self.play_tilt_x_sweep(duration=d),
            'tilt-y': lambda d: self.play_tilt_y_sweep(duration=d),
            'primary-button': lambda d: self.play_primary_button(duration=d),
            'secondary-button': lambda d: self.play_secondary_button(duration=d),
            'tablet-buttons': lambda d: self.play_tablet_buttons(4, d)
        }

        play_func = gesture_map.get(gesture)
        if play_func:
            await play_func(duration)
        else:
            print(f"Unknown gesture: {gesture}")


def create_mock_hid_reader(config: Optional[MockHIDReaderConfig] = None) -> MockHIDReader:
    """
    Factory function to create a mock HID reader
    
    Args:
        config: Optional configuration
    
    Returns:
        MockHIDReader instance
    """
    return MockHIDReader(config)