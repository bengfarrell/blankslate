"""
Pytest configuration and shared fixtures

This file is automatically loaded by pytest and provides
fixtures that can be used across all test files.
"""

import pytest
import json
import os


@pytest.fixture
def sample_hid_packets():
    """Sample HID packets for testing"""
    return [
        bytes([2, 160, 0x34, 0x12, 0x78, 0x56, 0xFF, 0x1F, 30, 0]),
        bytes([2, 160, 0x45, 0x23, 0x89, 0x67, 0xAB, 0x20, 35, 0]),
        bytes([2, 160, 0x56, 0x34, 0x9A, 0x78, 0xCD, 0x21, 40, 0]),
    ]


@pytest.fixture
def sample_config_dict():
    """Sample configuration dictionary"""
    return {
        'name': 'Test Tablet',
        'manufacturer': 'Test Co',
        'model': 'TestPad 1000',
        'description': 'A test tablet',
        'vendorId': '0x28bd',
        'productId': '0x0914',
        'deviceInfo': {
            'vendor_id': 10429,
            'product_id': 2324,
            'product_string': 'Test Tablet',
            'usage_page': 13,
            'usage': 2,
            'interfaces': [0]
        },
        'reportId': 2,
        'digitizerUsagePage': 13,
        'capabilities': {
            'hasButtons': True,
            'buttonCount': 8,
            'hasPressure': True,
            'pressureLevels': 8192,
            'hasTilt': True,
            'resolution': {
                'x': 32768,
                'y': 32768
            }
        },
        'byteCodeMappings': {
            'status': {
                'byteIndex': [1],
                'type': 'code',
                'values': {
                    '160': {
                        'state': 'stylus',
                        'primaryButtonPressed': False,
                        'secondaryButtonPressed': False
                    },
                    '161': {
                        'state': 'stylus',
                        'primaryButtonPressed': True,
                        'secondaryButtonPressed': False
                    }
                }
            },
            'x': {
                'byteIndex': [2, 3],
                'max': 32768,
                'type': 'multi-byte-range'
            },
            'y': {
                'byteIndex': [4, 5],
                'max': 32768,
                'type': 'multi-byte-range'
            },
            'pressure': {
                'byteIndex': [6, 7],
                'max': 8192,
                'type': 'multi-byte-range'
            },
            'tiltX': {
                'byteIndex': [8],
                'positiveMax': 60,
                'negativeMin': 196,
                'negativeMax': 255,
                'type': 'bipolar-range'
            }
        }
    }


@pytest.fixture
def fixtures_dir():
    """Path to test fixtures directory"""
    return os.path.join(os.path.dirname(__file__), 'fixtures')
