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
class ConfigMode:
    """Mode-specific configuration"""
    reportId: int
    digitizerUsagePage: int
    capabilities: Capabilities
    byteCodeMappings: Dict[str, Any]
    name: Optional[str] = None
    buttonInterfaceReportId: Optional[int] = None
    stylusModeStatusByte: Optional[int] = None
    excludedUsagePages: Optional[List[int]] = None


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

    # Multi-mode support
    modes: List[ConfigMode] = field(default_factory=list)

    def get_mode_by_report_id(self, report_id: int) -> Optional[ConfigMode]:
        """
        Get mode configuration for a specific Report ID

        Args:
            report_id: The Report ID to find

        Returns:
            The matching mode configuration, or None if not found
        """
        return next((mode for mode in self.modes if mode.reportId == report_id), None)

    def get_byte_code_mappings(self, report_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
        """
        Get byteCodeMappings for a specific mode

        Args:
            report_id: Optional Report ID to get mappings for specific mode

        Returns:
            The byteCodeMappings, or None if not found
        """
        if report_id is not None:
            mode = self.get_mode_by_report_id(report_id)
            return mode.byteCodeMappings if mode else None
        # If no reportId specified, return first mode's mappings as default
        return self.modes[0].byteCodeMappings if self.modes else None

    def is_multi_mode(self) -> bool:
        """
        Check if config has multiple modes

        Returns:
            True if the config has more than one mode
        """
        return len(self.modes) > 1

    def get_capabilities(self, report_id: Optional[int] = None) -> Optional[Capabilities]:
        """
        Get capabilities for a specific mode

        Args:
            report_id: Optional Report ID to get capabilities for specific mode

        Returns:
            The capabilities, or None if not found
        """
        if report_id is not None:
            mode = self.get_mode_by_report_id(report_id)
            return mode.capabilities if mode else None
        # If no reportId specified, return first mode's capabilities as default
        return self.modes[0].capabilities if self.modes else None

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
                'vendorId', 'productId', 'deviceInfo', 'modes'
            ]

            for field_name in required_fields:
                if field_name not in parsed:
                    raise ValueError(f"Invalid config: missing required field '{field_name}'")

            # Convert device info
            device_info_data = parsed['deviceInfo']
            device_info = DeviceInfo(**device_info_data)

            # Validate modes array
            if not isinstance(parsed['modes'], list):
                raise ValueError('Invalid config: modes must be an array')
            if len(parsed['modes']) == 0:
                raise ValueError('Invalid config: modes array cannot be empty')

            # Parse modes array
            modes = []
            for mode_data in parsed['modes']:
                if 'reportId' not in mode_data:
                    raise ValueError('Invalid config: each mode must have a reportId')

                # Parse capabilities for this mode
                caps_data = mode_data['capabilities']
                res_data = caps_data.get('resolution', {})
                resolution = Resolution(**res_data)
                mode_capabilities = Capabilities(
                    hasButtons=caps_data['hasButtons'],
                    buttonCount=caps_data['buttonCount'],
                    hasPressure=caps_data['hasPressure'],
                    pressureLevels=caps_data['pressureLevels'],
                    hasTilt=caps_data['hasTilt'],
                    resolution=resolution
                )

                mode = ConfigMode(
                    name=mode_data.get('name'),
                    reportId=mode_data['reportId'],
                    digitizerUsagePage=mode_data['digitizerUsagePage'],
                    buttonInterfaceReportId=mode_data.get('buttonInterfaceReportId'),
                    stylusModeStatusByte=mode_data.get('stylusModeStatusByte'),
                    excludedUsagePages=mode_data.get('excludedUsagePages'),
                    capabilities=mode_capabilities,
                    byteCodeMappings=mode_data['byteCodeMappings']
                )
                modes.append(mode)

            # Create Config instance
            return Config(
                name=parsed['name'],
                manufacturer=parsed['manufacturer'],
                model=parsed['model'],
                description=parsed['description'],
                vendorId=parsed['vendorId'],
                productId=parsed['productId'],
                deviceInfo=device_info,
                modes=modes
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