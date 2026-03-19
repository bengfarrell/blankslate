#!/usr/bin/env python3
"""
Quick test to verify button report_id is being passed through correctly
"""

from blankslate.models import Config
from blankslate.core.hid_reader import HIDReader
from unittest.mock import Mock

# Load XP Pen config
config = Config.load('../dist/configs/xp-pen-deco640.json')

print("XP Pen Deco 640 Configuration:")
print(f"Number of modes: {len(config.modes)}")
for mode in config.modes:
    print(f"  Mode - Report ID: {mode.reportId}, buttonInterfaceReportId: {getattr(mode, 'buttonInterfaceReportId', None)}")

# Create mock device
mock_device = Mock()
mock_device.read = Mock(return_value=[])
mock_device.set_nonblocking = Mock()

# Track callback calls
callback_calls = []

def test_callback(data, report_id):
    callback_calls.append({'data': data, 'report_id': report_id})
    print(f"\n✓ Callback received:")
    print(f"  Report ID: {report_id}")
    print(f"  Data: {data}")

# Create reader
reader = HIDReader(mock_device, config, test_callback)

# Simulate button packet (Report ID 6)
print("\n\nSimulating button packet with Report ID 6...")
button_data = {'button1': True, 'button2': False}
reader.data_callback(button_data, 6)

# Verify
if len(callback_calls) == 1 and callback_calls[0]['report_id'] == 6:
    print("\n✅ SUCCESS: report_id is being passed correctly!")
else:
    print("\n❌ FAILURE: report_id not passed correctly")
    print(f"Callback calls: {callback_calls}")
