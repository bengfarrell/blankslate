---
layout: page.njk
title: Multi-Mode Configs
description: Supporting multiple tablet operating modes
---

# Multi-Mode Configurations

Some tablets operate differently depending on whether the manufacturer's driver is installed. Blankslate supports multi-mode configurations that handle both scenarios.

## Overview

The XP-Pen Deco 640, for example, can operate in two modes:

| Mode | Report ID | Resolution | When Active |
|------|-----------|------------|-------------|
| **Driver Mode** | 2 | 31998 × 17998 | Driver software running |
| **Driverless Mode** | 7 | 15999 × 8999 | No driver installed |

A multi-mode config supports both, with automatic detection based on the Report ID.

## Config File Format

```json
{
  "name": "XP Pen Deco 640 (Multi-Mode)",
  "vendorId": "0x28bd",
  "productId": "0x2904",
  "deviceInfo": { ... },
  "modes": [
    {
      "name": "Driver Mode",
      "reportId": 2,
      "capabilities": {
        "resolution": { "x": 31998, "y": 17998 },
        "pressureLevels": 16384
      },
      "byteCodeMappings": { ... }
    },
    {
      "name": "Driverless Mode",
      "reportId": 7,
      "capabilities": {
        "resolution": { "x": 15999, "y": 8999 },
        "pressureLevels": 8192
      },
      "byteCodeMappings": { ... }
    }
  ]
}
```

## Mode Detection

When reading tablet data, Blankslate:

1. Reads the first HID packet
2. Extracts the Report ID from byte 0
3. Finds the matching mode in the config
4. Uses that mode's mappings for all subsequent packets

```typescript
// Automatic mode selection
const reportId = packet[0];
const mode = config.modes.find(m => m.reportId === reportId);
```

## Mode-Specific Differences

### Resolution

Different modes may report different coordinate ranges:

```json
// Driver mode
"capabilities": {
  "resolution": { "x": 31998, "y": 17998 }
}

// Driverless mode
"capabilities": {
  "resolution": { "x": 15999, "y": 8999 }
}
```

### Pressure Levels

Pressure sensitivity may vary:

```json
// Driver mode: 16384 levels
"pressure": {
  "byteIndex": [6, 7],
  "max": 16383,
  "type": "multi-byte-range"
}

// Driverless mode: 8192 levels
"pressure": {
  "byteIndex": [6, 7],
  "max": 8191,
  "type": "multi-byte-range"
}
```

### Button Handling

Button data may come from different interfaces or use different scan codes:

```json
// Driver mode: Buttons on separate interface
{
  "reportId": 2,
  "buttonInterfaceReportId": 6,
  "byteCodeMappings": {
    "tabletButtons": {
      "byteIndex": [2],
      "type": "bit-flags"
    }
  }
}

// Driverless mode: Buttons as scan codes
{
  "reportId": 7,
  "byteCodeMappings": {
    "tabletButtons": {
      "byteIndex": [2],
      "type": "code",
      "values": {
        "1": { "button": 1 },
        "2": { "button": 2 }
      }
    }
  }
}
```

## Creating Multi-Mode Configs

### Option 1: Run Walkthrough Twice

1. Run the config generator with the driver installed
2. Save the config
3. Uninstall/disable the driver
4. Run the config generator again
5. Manually merge the two configs into a `modes` array

### Option 2: Manual Editing

If you understand the HID protocol:

1. Generate a single-mode config
2. Convert to multi-mode format
3. Add the second mode with appropriate mappings

## Best Practices

1. **Test both modes** - Verify the config works with and without the driver
2. **Document mode names** - Use descriptive names like "Driver Mode" and "Driverless Mode"
3. **Include all capabilities** - Each mode should have complete capability information
4. **Match byte mappings** - Ensure each mode's mappings are accurate for that mode

## Fallback Behavior

If no mode matches the incoming Report ID:

- The viewer will use the first mode as a fallback
- A warning will be logged
- Data may be incorrectly interpreted

Always ensure your config includes modes for all Report IDs your tablet might send.
