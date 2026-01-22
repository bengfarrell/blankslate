# Multi-Mode Config Usage Guide

## Overview

The XP-Pen Deco 640 tablet can operate in two different firmware modes:
- **Driver Mode** (Report ID 2): Full resolution (31998 x 17998)
- **Driverless Mode** (Report ID 7): Reduced resolution (15999 x 8999)

The multi-mode config format allows a single configuration file (`public/configs/xp-pen-deco640.json`) to support both modes, with automatic detection based on the Report ID in the first packet.

## Config File Format

```json
{
  "name": "XP Pen Deco 640 (Multi-Mode)",
  "vendorId": "0x28bd",
  "productId": "0x2904",
  "deviceInfo": { ... },
  "modes": [
    {
      "reportId": 2,
      "capabilities": { ... },
      "byteCodeMappings": { ... }
    },
    {
      "reportId": 7,
      "capabilities": { ... },
      "byteCodeMappings": { ... }
    }
  ]
}
```

## TypeScript/Node Usage

```typescript
import { Config } from './models';

// Load the multi-mode config
const config = await Config.load('public/configs/xp-pen-deco640.json');

// Check if it's a multi-mode config
if (config.isMultiMode()) {
  console.log('Multi-mode config loaded');
  
  // Open device and read first packet
  const device = await openDevice(config);
  const firstPacket = await readFirstPacket(device);
  const reportId = firstPacket[0];
  
  // Get the appropriate mode configuration
  const mode = config.getModeByReportId(reportId);
  
  if (mode) {
    console.log(`Device in Report ID ${reportId}`);
    console.log(`Resolution: ${mode.capabilities.resolution.x} x ${mode.capabilities.resolution.y}`);

    // Use mode-specific settings for parsing
    const reader = new HIDReader(device, {
      mappings: mode.byteCodeMappings,
      reportId: mode.reportId
    }, (data) => {
      console.log('Tablet data:', data);
    });
  } else {
    console.error(`Unknown Report ID: ${reportId}`);
  }
}
```

## Python Usage

```python
from blankslate.models import Config

# Load the multi-mode config
config = Config.load('public/configs/xp-pen-deco640.json')

# Check if it's a multi-mode config
if config.is_multi_mode():
    print('Multi-mode config loaded')
    
    # Open device and read first packet
    device = open_device(config)
    first_packet = read_first_packet(device)
    report_id = first_packet[0]
    
    # Get the appropriate mode configuration
    mode = config.get_mode_by_report_id(report_id)
    
    if mode:
        print(f'Device in Report ID {report_id}')
        print(f'Resolution: {mode.capabilities.resolution.x} x {mode.capabilities.resolution.y}')

        # Use mode-specific settings for parsing
        from blankslate.core import HIDReader
        reader = HIDReader(device, mode, on_data)
    else:
        print(f'Unknown Report ID: {report_id}')
```

## Backward Compatibility

The system still supports single-mode (legacy) configs:

```json
{
  "name": "XP Pen Deco 640",
  "reportId": 2,
  "capabilities": { ... },
  "byteCodeMappings": { ... }
}
```

These will load normally, and `isMultiMode()` / `is_multi_mode()` will return `false`.

## Testing

Test the multi-mode config with both modes:

```bash
# TypeScript
npx tsx src/cli/event-viewer.ts -c public/configs/xp-pen-deco640.json

# Python
cd python
./venv/bin/python view_events.py -c ../public/configs/xp-pen-deco640.json
```

The viewer should automatically detect which mode the device is in and use the appropriate settings.