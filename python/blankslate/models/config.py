"""
Tablet Configuration Model
Direct mapping to tablet configuration JSON files for HID byte data reading

Python port of src/models/config.ts

Example:
    # Load a configuration from a file
    from blankslate.models import Config
    config = Config.load('/path/to/config.json')

    # Or parse from JSON string
    import json
    with open('/path/to/config.json') as f:
        json_string = f.read()
    config = Config.from_json(json_string)

    # Use with HIDReader
    from blankslate.core import HIDReader
    reader = HIDReader(device, config, lambda data: print('Tablet data:', data))
"""

import json
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field, asdict


class MappingType:
    """Mapping type constants for byte code mappings"""
    CODE = 'code'
    MULTI_BYTE_RANGE = 'multi-byte-range'
    BIPOLAR_RANGE = 'bipolar-range'
    KEYBOARD_EVENTS = 'keyboard-events'
    BIT_FLAGS = 'bit-flags'


@dataclass
class DeviceInfo:
    """Device information structure"""
    vendor_id: int
    product_id: int
    product_string: str
    usage_page: int
    usage: int
    interfaces: List[int] = field(default_factory=list)


@dataclass
class Resolution:
    """Resolution structure"""
    x: int
    y: int


@dataclass
class Capabilities:
    """Device capabilities structure"""
    hasButtons: bool
    buttonCount: int
    hasPressure: bool
    pressureLevels: int
    hasTilt: bool
    resolution: Resolution


@dataclass
class Config:
    """
    Main tablet configuration class
    Handles tablet configuration with serialization/deserialization methods
    """
    # Device identification
    name: str
    manufacturer: str
    model: str
    description: str
    vendorId: str
    productId: str

    # Device information
    deviceInfo: DeviceInfo

    # HID report configuration
    reportId: int
    digitizerUsagePage: int
    buttonInterfaceReportId: Optional[int] = None
    stylusModeStatusByte: Optional[int] = None
    excludedUsagePages: Optional[List[int]] = None

    # Device capabilities
    capabilities: Capabilities = None

    # Byte code mappings for parsing HID data
    byteCodeMappings: Dict[str, Any] = field(default_factory=dict)

    # Convenience property for accessing mappings
    @property
    def mappings(self) -> Dict[str, Any]:
        """Alias for byteCodeMappings for easier access"""
        return self.byteCodeMappings

    def to_json(self, pretty: bool = False) -> str:
        """
        Converts this Config instance to a JSON string

        Args:
            pretty: Whether to pretty-print the JSON (default: False)

        Returns:
            JSON string representation of the config

        Example:
            config = Config(...)
            json_string = config.to_json(pretty=True)
            print(json_string)
        """
        # Convert dataclass to dict, handling nested dataclasses
        data = asdict(self)

        # Convert deviceInfo dataclass to dict if needed
        if isinstance(self.deviceInfo, DeviceInfo):
            data['deviceInfo'] = asdict(self.deviceInfo)

        # Convert capabilities dataclass to dict if needed
        if isinstance(self.capabilities, Capabilities):
            caps_dict = asdict(self.capabilities)
            # Convert resolution dataclass to dict
            if isinstance(self.capabilities.resolution, Resolution):
                caps_dict['resolution'] = asdict(self.capabilities.resolution)
            data['capabilities'] = caps_dict

        indent = 2 if pretty else None
        return json.dumps(data, indent=indent)

    @staticmethod
    def from_json(json_string: str) -> 'Config':
        """
        Parses a JSON string into a Config object

        Args:
            json_string: JSON string to parse

        Returns:
            Parsed Config instance

        Raises:
            ValueError: If JSON is invalid or doesn't match Config structure

        Example:
            config = Config.from_json(json_string)
        """
        try:
            parsed = json.loads(json_string)

            # Basic validation
            if not isinstance(parsed, dict):
                raise ValueError('Invalid config: must be an object')

            # Validate required fields
            required_fields = [
                'name', 'manufacturer', 'model', 'description',
                'vendorId', 'productId', 'deviceInfo', 'reportId',
                'digitizerUsagePage', 'capabilities', 'byteCodeMappings'
            ]

            for field_name in required_fields:
                if field_name not in parsed:
                    raise ValueError(f"Invalid config: missing required field '{field_name}'")

            # Convert nested dicts to dataclasses
            device_info_data = parsed['deviceInfo']
            device_info = DeviceInfo(**device_info_data)

            capabilities_data = parsed['capabilities']
            resolution_data = capabilities_data.get('resolution', {})
            resolution = Resolution(**resolution_data)
            capabilities = Capabilities(
                hasButtons=capabilities_data['hasButtons'],
                buttonCount=capabilities_data['buttonCount'],
                hasPressure=capabilities_data['hasPressure'],
                pressureLevels=capabilities_data['pressureLevels'],
                hasTilt=capabilities_data['hasTilt'],
                resolution=resolution
            )

            # Create Config instance
            return Config(
                name=parsed['name'],
                manufacturer=parsed['manufacturer'],
                model=parsed['model'],
                description=parsed['description'],
                vendorId=parsed['vendorId'],
                productId=parsed['productId'],
                deviceInfo=device_info,
                reportId=parsed['reportId'],
                digitizerUsagePage=parsed['digitizerUsagePage'],
                buttonInterfaceReportId=parsed.get('buttonInterfaceReportId'),
                stylusModeStatusByte=parsed.get('stylusModeStatusByte'),
                excludedUsagePages=parsed.get('excludedUsagePages'),
                capabilities=capabilities,
                byteCodeMappings=parsed['byteCodeMappings']
            )

        except json.JSONDecodeError as e:
            raise ValueError(f'Invalid JSON: {e}')

    @staticmethod
    def load(file_path: str) -> 'Config':
        """
        Loads a Config from a file path

        Args:
            file_path: Path to the configuration JSON file

        Returns:
            Loaded Config instance

        Example:
            config = Config.load('/path/to/config.json')
        """
        with open(file_path, 'r') as f:
            json_string = f.read()
        return Config.from_json(json_string)