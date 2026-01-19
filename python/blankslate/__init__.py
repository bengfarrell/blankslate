"""
The Learning Tablet - Python Package
Graphics tablet controller for reading HID data and processing tablet events

This package provides:
- Core functionality for reading and processing HID tablet data
- CLI utilities for configuration, event viewing, and WebSocket server
- Models for tablet configuration
- Mock data generators for testing

Example:
    # Load a configuration and read from a device
    from blankslate.models import Config
    from blankslate.utils import find_and_open_device
    from blankslate.core import HIDReader
    
    config = Config.load('path/to/config.json')
    device = find_and_open_device(config.deviceInfo)
    
    def on_data(data):
        print(f"X: {data.get('x')}, Y: {data.get('y')}, Pressure: {data.get('pressure')}")
    
    reader = HIDReader(device, config, on_data)
    reader.start_reading()
"""

__version__ = '1.0.0'

# Export main classes and functions
from .models.config import Config, MappingType
from .core.data_helpers import (
    parse_code,
    parse_range_data,
    parse_multi_byte_range_data,
    parse_bipolar_range_data,
    parse_bit_flags,
    process_device_data
)
from .core.hid_reader import HIDReader
from .utils.finddevice import find_and_open_device, find_and_open_all_interfaces, auto_detect_device

__all__ = [
    '__version__',
    'Config',
    'MappingType',
    'HIDReader',
    'find_and_open_device',
    'find_and_open_all_interfaces',
    'auto_detect_device',
    'parse_code',
    'parse_range_data',
    'parse_multi_byte_range_data',
    'parse_bipolar_range_data',
    'parse_bit_flags',
    'process_device_data',
]

