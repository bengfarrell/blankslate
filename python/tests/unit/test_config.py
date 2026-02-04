"""
Config Tests

Port of test/unit/config.test.ts to Python with pytest
"""

import pytest
import json
import os
from pathlib import Path

from blankslate.models import Config


class TestConfigUtilities:
    """Test Config class utilities"""
    
    @pytest.fixture
    def mock_config_data(self):
        """Mock configuration data - multi-mode format"""
        return {
            'name': 'Test Tablet',
            'manufacturer': 'Test Manufacturer',
            'model': 'Test Model',
            'description': 'A test tablet configuration',
            'vendorId': '0x1234',
            'productId': '0x5678',
            'deviceInfo': {
                'vendor_id': 0x1234,
                'product_id': 0x5678,
                'product_string': 'Test Tablet',
                'usage_page': 13,
                'usage': 2,
                'interfaces': [0],
            },
            'modes': [
                {
                    'reportId': 1,
                    'digitizerUsagePage': 13,
                    'capabilities': {
                        'hasButtons': True,
                        'buttonCount': 8,
                        'hasPressure': True,
                        'pressureLevels': 8191,
                        'hasTilt': True,
                        'resolution': {
                            'x': 32768,
                            'y': 32768,
                        },
                    },
                    'byteCodeMappings': {
                        'status': {
                            'byteIndex': [0],
                            'type': 'code',
                            'values': {
                                '160': {'state': 'stylus'},
                            },
                        },
                        'x': {
                            'byteIndex': [1, 2],
                            'max': 65535,
                            'type': 'multi-byte-range',
                        },
                        'y': {
                            'byteIndex': [3, 4],
                            'max': 65535,
                            'type': 'multi-byte-range',
                        },
                        'pressure': {
                            'byteIndex': [5, 6],
                            'max': 8191,
                            'type': 'multi-byte-range',
                        },
                    },
                }
            ],
        }
    
    @pytest.fixture
    def mock_config(self, mock_config_data):
        """Create a Config instance from mock data"""
        return Config.from_json(json.dumps(mock_config_data))
    
    def test_to_json_compact(self, mock_config, mock_config_data):
        """Should convert Config to JSON string (compact)"""
        result = mock_config.to_json()
        assert isinstance(result, str)
        assert '\n' not in result  # compact format

        parsed = json.loads(result)
        assert parsed['name'] == mock_config.name
        assert parsed['vendorId'] == mock_config.vendorId

        # Check core fields (ignore optional None fields)
        for key in ['name', 'manufacturer', 'model', 'vendorId', 'productId']:
            assert parsed[key] == mock_config_data[key]
    
    def test_to_json_pretty(self, mock_config, mock_config_data):
        """Should convert Config to JSON string (pretty)"""
        result = mock_config.to_json(pretty=True)
        assert isinstance(result, str)
        assert '\n' in result  # pretty format

        parsed = json.loads(result)
        assert parsed['name'] == mock_config.name

        # Check core fields (ignore optional None fields)
        for key in ['name', 'manufacturer', 'model', 'vendorId', 'productId']:
            assert parsed[key] == mock_config_data[key]
    
    def test_from_json_valid(self, mock_config_data):
        """Should parse valid JSON string to Config"""
        json_string = json.dumps(mock_config_data)
        result = Config.from_json(json_string)
        
        assert isinstance(result, Config)
        assert result.name == mock_config_data['name']
        assert result.vendorId == mock_config_data['vendorId']
        # Access byteCodeMappings through the modes array
        assert result.modes[0].byteCodeMappings == mock_config_data['modes'][0]['byteCodeMappings']
    
    def test_from_json_invalid(self):
        """Should raise error for invalid JSON"""
        with pytest.raises(ValueError, match='Invalid JSON'):
            Config.from_json('invalid json')
    
    def test_from_json_non_object(self):
        """Should raise error for non-object JSON"""
        with pytest.raises(ValueError, match='must be an object'):
            Config.from_json('"just a string"')
    
    def test_from_json_missing_fields(self):
        """Should raise error for missing required fields"""
        incomplete = {'name': 'Test'}
        with pytest.raises(ValueError, match='missing required field'):
            Config.from_json(json.dumps(incomplete))
    
    def test_from_json_all_required_fields(self, mock_config_data):
        """Should validate all required fields"""
        # Top-level required fields for multi-mode format
        required_fields = [
            'name', 'manufacturer', 'model', 'description',
            'vendorId', 'productId', 'deviceInfo', 'modes'
        ]
        
        for field in required_fields:
            incomplete = mock_config_data.copy()
            del incomplete[field]
            
            with pytest.raises(ValueError, match=f"missing required field '{field}'"):
                Config.from_json(json.dumps(incomplete))
    
    def test_load_method_exists(self):
        """Should have load method"""
        assert hasattr(Config, 'load')
        assert callable(Config.load)
    
    def test_round_trip_conversion(self, mock_config):
        """Should maintain data integrity through to_json -> from_json"""
        json_string = mock_config.to_json()
        parsed = Config.from_json(json_string)
        
        assert isinstance(parsed, Config)
        assert parsed.name == mock_config.name
        assert parsed.vendorId == mock_config.vendorId
        # Access byteCodeMappings through modes
        assert parsed.modes[0].byteCodeMappings == mock_config.modes[0].byteCodeMappings
    
    def test_round_trip_pretty(self, mock_config):
        """Should maintain data integrity through to_json (pretty) -> from_json"""
        json_string = mock_config.to_json(pretty=True)
        parsed = Config.from_json(json_string)
        
        assert isinstance(parsed, Config)
        assert parsed.name == mock_config.name
        assert parsed.modes[0].byteCodeMappings == mock_config.modes[0].byteCodeMappings


class TestFixtureIntegration:
    """Test with fixture files"""
    
    @pytest.fixture
    def fixture_path(self):
        """Path to test fixture"""
        return Path(__file__).parent.parent / 'fixtures' / 'test-tablet-config.json'
    
    def test_load_fixture_file(self, fixture_path):
        """Should load and parse the test fixture config file"""
        assert fixture_path.exists(), f"Fixture not found: {fixture_path}"

        with open(fixture_path, 'r') as f:
            fixture_content = f.read()

        # Parse it using Config.from_json
        config = Config.from_json(fixture_content)

        # Validate the parsed config
        assert isinstance(config, Config)
        assert config.name == 'Test Tablet'
        assert config.manufacturer == 'Test Manufacturer'
        assert config.model == 'Test Model'
        assert config.vendorId == '0x1234'
        assert config.productId == '0x5678'
        
        # Access mode-specific properties through modes array
        assert len(config.modes) == 1
        mode = config.modes[0]
        assert mode.reportId == 1
        assert mode.capabilities.hasPressure is True
        assert mode.capabilities.pressureLevels == 8191
        assert 'x' in mode.byteCodeMappings
        assert 'y' in mode.byteCodeMappings
        assert 'pressure' in mode.byteCodeMappings
    
    def test_round_trip_fixture(self, fixture_path):
        """Should round-trip the fixture file through to_json/from_json"""
        with open(fixture_path, 'r') as f:
            fixture_content = f.read()
        
        # Parse, serialize, and parse again
        config1 = Config.from_json(fixture_content)
        serialized = config1.to_json()
        config2 = Config.from_json(serialized)
        
        # Should have identical properties
        assert config2.name == config1.name
        assert config2.modes[0].byteCodeMappings == config1.modes[0].byteCodeMappings
    
    def test_validate_fixture_structure(self, fixture_path):
        """Should validate the fixture file structure"""
        with open(fixture_path, 'r') as f:
            fixture_content = f.read()
        
        # Should not raise an error
        config = Config.from_json(fixture_content)
        
        # Check all required fields exist on Config
        assert hasattr(config, 'name')
        assert hasattr(config, 'manufacturer')
        assert hasattr(config, 'model')
        assert hasattr(config, 'description')
        assert hasattr(config, 'vendorId')
        assert hasattr(config, 'productId')
        assert hasattr(config, 'deviceInfo')
        assert hasattr(config, 'modes')
        
        # Check mode-specific fields exist on first mode
        assert len(config.modes) > 0
        mode = config.modes[0]
        assert hasattr(mode, 'reportId')
        assert hasattr(mode, 'digitizerUsagePage')
        assert hasattr(mode, 'capabilities')
        assert hasattr(mode, 'byteCodeMappings')
