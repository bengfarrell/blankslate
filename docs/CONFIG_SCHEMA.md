# Device Configuration Schema

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
| `buttonInterfaceReportId` | number | No | Separate report ID for tablet button data (if different from pen) |
| `digitizerUsagePage` | number | Yes | HID usage page (typically 13 for digitizers) |
| `stylusModeStatusByte` | number | No | Status byte value that indicates stylus/pen mode (for filtering) |
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
| `byteIndex` | number[] | Byte positions (little-endian order: low byte first) |
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

Same structure as coordinates. The `max` value indicates the pressure levels (e.g., 8191 for 8192 levels, 16383 for 16384 levels).

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
| `positiveMax` | number | Maximum positive tilt value (0 to positiveMax = positive tilt) |
| `negativeMin` | number | Start of negative range (negativeMin to negativeMax = negative tilt) |
| `negativeMax` | number | End of negative range (typically 255) |
| `type` | string | Always `"bipolar-range"` |

**Interpretation:**
- Values 0 to `positiveMax`: Positive tilt (0° to +60°)
- Values `negativeMin` to `negativeMax`: Negative tilt (-60° to 0°)
- Values between `positiveMax` and `negativeMin`: Neutral/undefined

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
    "164": { "state": "hover", "primaryButtonPressed": true },
    "165": { "state": "contact", "primaryButtonPressed": true },
    "192": { "state": "none" },
    "240": { "state": "buttons" }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `byteIndex` | number[] | Byte position for status value |
| `type` | string | Always `"code"` |
| `values` | object | Map of byte values to their meanings |

**Status Value Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `state` | string | Pen state: `"hover"`, `"contact"`, `"none"`, `"buttons"`, `"keyboard"` |
| `primaryButtonPressed` | boolean | Pen barrel button 1 pressed |
| `secondaryButtonPressed` | boolean | Pen barrel button 2 pressed |

**Common Status Byte Values:**
- `160-165` (0xA0-0xA5): Pen/stylus mode (hover, contact, with buttons)
- `192` (0xC0): Pen out of range / no contact
- `240` (0xF0): Tablet button mode (with driver)
- `0, 1, 3, 6`: Tablet button mode (without driver)

---

### Tablet Buttons

Tablet buttons can be configured in three ways depending on how the device reports them.

#### Type: `code` (Scan Code Mapping)

Most common format. Each button press sends a unique scan code value.

```json
"tabletButtons": {
  "byteIndex": [2],
  "buttonCount": 8,
  "type": "code",
  "values": {
    "1": { "button": 1 },
    "2": { "button": 2 },
    "4": { "button": 3 },
    "8": { "button": 4 },
    "16": { "button": 5 },
    "32": { "button": 6 },
    "64": { "button": 7 },
    "128": { "button": 8 }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `byteIndex` | number[] | Byte position for button scan code |
| `buttonCount` | number | Total number of buttons |
| `type` | string | `"code"` |
| `values` | object | Map of scan code values to button info |

**Value Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `button` | number | Button number (1-indexed) |

#### Scan Code Conflicts (`statusOverrides`)

Some tablets reuse scan codes for different buttons, differentiated by the status byte:

```json
"tabletButtons": {
  "byteIndex": [2],
  "buttonCount": 8,
  "type": "code",
  "values": {
    "29": { "button": 7 }
  },
  "statusOverrides": [
    {
      "scanCode": 29,
      "statusByte": 3,
      "buttonNumber": 8
    }
  ]
}
```

When scan code 29 is received:
- If status byte is NOT 3: Button 7
- If status byte IS 3: Button 8

#### Type: `bit-flags`

Each bit in the byte represents a button state:

```json
"tabletButtons": {
  "byteIndex": [9],
  "buttonCount": 6,
  "type": "bit-flags"
}
```

**Interpretation:** Bit 0 = Button 1, Bit 1 = Button 2, etc.

---

## Keyboard Mappings (WebHID Only)

When the tablet driver is active, it may block the HID button interface and instead send keyboard shortcuts. The `keyboardMappings` section documents these shortcuts for WebHID fallback.

```json
"keyboardMappings": {
  "description": "Keyboard shortcuts for WebHID mode when driver is active",
  "buttons": [
    { "button": 1, "keys": ["KeyB"] },
    { "button": 2, "keys": ["KeyE"] },
    { "button": 5, "keys": ["ControlLeft", "NumpadSubtract"] },
    { "button": 7, "keys": ["ControlLeft", "KeyZ"] },
    { "button": 8, "keys": ["ControlLeft", "ShiftLeft", "KeyZ"] }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | Optional description |
| `buttons` | array | Button-to-keyboard mappings |

**Button Mapping:**

| Field | Type | Description |
|-------|------|-------------|
| `button` | number | Button number |
| `keys` | string[] | JavaScript `KeyboardEvent.code` values |

### Platform Limitation

> **Important:** Keyboard mappings are only captured and used by WebHID (browser-based) implementations.
>
> When the tablet driver is active:
> - **WebHID** can capture keyboard events via the browser's `keydown` API
> - **Python/Node.js** cannot intercept OS-level keyboard events
>
> This means keyboard-only button detection only works in WebHID mode. For Python/Node.js compatibility, generate configs in **driverless mode** to capture HID scan codes.

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

- Report ID is handled separately and not included in byte indices
- `byteIndex: [1]` refers to the second byte of the report data
- Multi-byte values use little-endian order: `[lowByte, highByte]`

---

## Example: Complete Configuration

See `public/configs/sample.json` for a complete example with multiple modes.

---

## Legacy Single-Mode Format

Older configs may use a flat structure instead of the `modes` array:

```json
{
  "name": "...",
  "vendorId": "...",
  "productId": "...",
  "deviceInfo": { ... },
  "reportId": 2,
  "digitizerUsagePage": 13,
  "capabilities": { ... },
  "byteCodeMappings": { ... }
}
```

This format is still supported for backward compatibility. The reader will treat it as a single-mode configuration.
