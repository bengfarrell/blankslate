---
layout: page.njk
title: Configuration Schema
description: Understanding tablet configuration files
---

# Configuration Schema

This document describes the JSON configuration file format used by Blankslate to interpret HID packets from drawing tablets.

## Overview

Configuration files define how raw HID byte data maps to meaningful tablet events (coordinates, pressure, tilt, buttons). The walkthrough tool generates these configs automatically, but they can also be created or edited manually.

## Top-Level Structure

```json
{
  "name": "XP Pen Deco 640",
  "manufacturer": "XP Pen",
  "model": "Deco 640",
  "description": "XP Pen Deco 640 with driver and driverless mode support",
  "vendorId": "0x28bd",
  "productId": "0x2904",
  "deviceInfo": { ... },
  "modes": [ ... ]
}
```

### Device Identification

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Human-readable device name |
| `manufacturer` | string | Device manufacturer |
| `model` | string | Device model number/name |
| `description` | string | Optional description of the configuration |
| `vendorId` | string | USB Vendor ID (hex string, e.g., `"0x28bd"`) |
| `productId` | string | USB Product ID (hex string, e.g., `"0x2904"`) |

### Device Info

The `deviceInfo` object contains detailed USB/HID information:

```json
"deviceInfo": {
  "vendor_id": 10429,
  "product_id": 10500,
  "product_string": "Deco 640",
  "usage_page": 13,
  "usage": 2,
  "interfaces": [13, 1, 65290]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `vendor_id` | number | USB Vendor ID (decimal) |
| `product_id` | number | USB Product ID (decimal) |
| `product_string` | string | USB product string descriptor |
| `usage_page` | number | HID usage page (13 = Digitizer) |
| `usage` | number | HID usage within the page |
| `interfaces` | number[] | List of HID interface usage pages available |

---

## Modes

The `modes` array contains one or more mode configurations. Each mode represents a different operating state (e.g., with driver vs. driverless).

```json
"modes": [
  {
    "reportId": 2,
    "buttonInterfaceReportId": 6,
    "digitizerUsagePage": 13,
    "stylusModeStatusByte": 160,
    "capabilities": { ... },
    "byteCodeMappings": { ... },
    "keyboardMappings": { ... }
  }
]
```

### Mode Properties

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | Optional name for this mode |
| `reportId` | number | Yes | HID report ID for pen/stylus data |
| `buttonInterfaceReportId` | number | No | Separate report ID for tablet button data |
| `digitizerUsagePage` | number | Yes | HID usage page (typically 13 for digitizers) |
| `stylusModeStatusByte` | number | No | Status byte value that indicates stylus/pen mode |
| `excludedUsagePages` | number[] | No | Usage pages to ignore when reading HID data |
| `capabilities` | object | Yes | Device capabilities |
| `byteCodeMappings` | object | Yes | Byte-to-data mappings |
| `keyboardMappings` | object | No | Keyboard shortcut mappings (WebHID only) |

### Capabilities

```json
"capabilities": {
  "hasButtons": true,
  "buttonCount": 8,
  "hasPressure": true,
  "pressureLevels": 16384,
  "hasTilt": true,
  "resolution": {
    "x": 31998,
    "y": 17998
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `hasButtons` | boolean | Whether the tablet has express keys |
| `buttonCount` | number | Number of tablet buttons |
| `hasPressure` | boolean | Whether pressure sensitivity is supported |
| `pressureLevels` | number | Maximum pressure value (e.g., 8192, 16384) |
| `hasTilt` | boolean | Whether tilt detection is supported |
| `resolution.x` | number | Maximum X coordinate value |
| `resolution.y` | number | Maximum Y coordinate value |

---

## Byte Code Mappings

The `byteCodeMappings` object defines how to extract data from HID packets. Each mapping specifies which byte(s) contain the data and how to interpret them.

### Mapping Types

| Type | Description |
|------|-------------|
| `multi-byte-range` | Multi-byte value (little-endian), scaled to a max value |
| `bipolar-range` | Signed value with separate positive and negative ranges |
| `code` | Discrete values mapped to specific meanings |
| `bit-flags` | Individual bits represent boolean states |

---

### X/Y Coordinates (`multi-byte-range`)

```json
"x": {
  "byteIndex": [2, 3],
  "max": 31998,
  "type": "multi-byte-range"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `byteIndex` | number[] | Byte positions (little-endian: low byte first) |
| `max` | number | Maximum coordinate value |
| `type` | string | Always `"multi-byte-range"` |

**Interpretation:** Value = `byte[0] + (byte[1] << 8)` for 2-byte values.

---

### Pressure (`multi-byte-range`)

```json
"pressure": {
  "byteIndex": [6, 7],
  "max": 16383,
  "type": "multi-byte-range"
}
```

Same structure as coordinates. The `max` value indicates the pressure levels.

---

### Tilt (`bipolar-range`)

```json
"tiltX": {
  "byteIndex": [8],
  "positiveMax": 60,
  "negativeMin": 196,
  "negativeMax": 255,
  "type": "bipolar-range"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `byteIndex` | number[] | Byte position(s) for tilt value |
| `positiveMax` | number | Maximum positive tilt value |
| `negativeMin` | number | Start of negative range |
| `negativeMax` | number | End of negative range (typically 255) |
| `type` | string | Always `"bipolar-range"` |

**Interpretation:**
- Values 0 to `positiveMax`: Positive tilt (0° to +60°)
- Values `negativeMin` to `negativeMax`: Negative tilt (-60° to 0°)

---

### Status Byte (`code`)

```json
"status": {
  "byteIndex": [1],
  "type": "code",
  "values": {
    "160": { "state": "hover" },
    "161": { "state": "contact" },
    "162": { "state": "hover", "secondaryButtonPressed": true },
    "163": { "state": "contact", "secondaryButtonPressed": true },
    "192": { "state": "none" },
    "240": { "state": "buttons" }
  }
}
```

**Status Value Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `state` | string | Pen state: `"hover"`, `"contact"`, `"none"`, `"buttons"` |
| `primaryButtonPressed` | boolean | Pen barrel button 1 pressed |
| `secondaryButtonPressed` | boolean | Pen barrel button 2 pressed |

---

### Tablet Buttons (`code`)

```json
"tabletButtons": {
  "byteIndex": [2],
  "buttonCount": 8,
  "type": "code",
  "values": {
    "1": { "button": 1 },
    "2": { "button": 2 },
    "4": { "button": 3 },
    "8": { "button": 4 }
  }
}
```

Each button press sends a unique scan code value.

---

### Keyboard HID Buttons (`keyboardButtons`)

Some tablets (notably Huion) send button presses through a separate **Keyboard HID interface** rather than through the digitizer interface. These tablets use the `keyboardButtons` mapping instead of `tabletButtons`.

```json
"keyboardButtons": {
  "description": "Buttons from keyboard HID interface (requires sudo on macOS)",
  "usagePage": 1,
  "usage": 6,
  "buttonCount": 30,
  "buttons": [
    { "button": 1, "reportId": 3, "type": "keyboard", "modifier": 0, "keycode": 5 },
    { "button": 2, "reportId": 3, "type": "keyboard", "modifier": 7, "keycode": 17 },
    { "button": 21, "reportId": 4, "type": "consumer", "consumerCode": 182 },
    { "button": 25, "reportId": 5, "type": "scroll", "scrollDelta": 1 }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | Human-readable description |
| `usagePage` | number | HID usage page (1 = Generic Desktop/Keyboard) |
| `usage` | number | HID usage (6 = Keyboard) |
| `buttonCount` | number | Total number of buttons |
| `buttons` | array | Array of button definitions |

#### Button Types

**Keyboard buttons** (`type: "keyboard"`):
```json
{ "button": 1, "reportId": 3, "type": "keyboard", "modifier": 0, "keycode": 5 }
```

| Field | Description |
|-------|-------------|
| `reportId` | HID report ID (typically 3 for keyboard) |
| `modifier` | Modifier byte (bit flags: 1=Ctrl, 2=Shift, 4=Alt, 8=GUI/Cmd) |
| `keycode` | USB HID keycode (e.g., 5 = "B", 17 = "N") |

**Consumer Control buttons** (`type: "consumer"`):
```json
{ "button": 21, "reportId": 4, "type": "consumer", "consumerCode": 182 }
```

| Field | Description |
|-------|-------------|
| `reportId` | HID report ID (typically 4 for consumer control) |
| `consumerCode` | USB HID consumer code (e.g., 182 = Previous Track, 233 = Volume Up) |

**Scroll buttons** (`type: "scroll"`):
```json
{ "button": 25, "reportId": 5, "type": "scroll", "scrollDelta": 1 }
```

| Field | Description |
|-------|-------------|
| `reportId` | HID report ID (typically 5 for relative input) |
| `scrollDelta` | Scroll direction (1 = up/forward, 255 = down/backward) |

> **Note:** On macOS, reading from the Keyboard HID interface (usage page 1) requires `sudo`. See [Known Limitations](/about/limitations/#keyboard-hid-interface-buttons-huion-style) for details.

---

## Byte Indexing

All `byteIndex` values are **0-indexed** relative to the HID report data (after the report ID).

**Packet Structure:**
```
[Report ID] [Byte 0] [Byte 1] [Byte 2] [Byte 3] ...
     ↑          ↑
  Stripped   byteIndex: [0]
  by reader
```

- Report ID is handled separately
- `byteIndex: [1]` refers to the second byte of the report data
- Multi-byte values use little-endian order: `[lowByte, highByte]`
