# USB HID Usage IDs for Keyboard Mappings

## Overview

The configuration now records **USB HID Usage IDs** instead of JavaScript KeyboardEvent codes. This provides a platform-independent, standards-based representation of keyboard shortcuts.

## Why USB HID Usage IDs?

1. **Platform-independent**: Works the same on Windows, Mac, Linux, Web
2. **Standards-based**: Follows the official USB HID Usage Tables specification
3. **More compact**: Numeric codes are shorter than strings
4. **Easier to process**: Direct numeric comparison

## Mapping Examples

| Key | JavaScript Code | USB HID Usage ID | Hex |
|-----|----------------|------------------|-----|
| b | `KeyB` | 5 | 0x05 |
| e | `KeyE` | 8 | 0x08 |
| z | `KeyZ` | 29 | 0x1D |
| [ | `BracketLeft` | 47 | 0x2F |
| ] | `BracketRight` | 48 | 0x30 |
| Numpad - | `NumpadSubtract` | 86 | 0x56 |
| Numpad + | `NumpadAdd` | 87 | 0x57 |
| Left Ctrl | `ControlLeft` | 224 | 0xE0 |
| Left Shift | `ShiftLeft` | 225 | 0xE1 |

## Configuration Format

```json
{
  "keyboardMappings": {
    "description": "USB HID keyboard usage IDs sent by driver (HID button interface is blocked)",
    "note": "Based on USB HID Usage Tables specification, Page 0x07 (Keyboard/Keypad)",
    "buttons": [
      {
        "button": 1,
        "usageIds": [5],
        "keys": ["KeyB"]
      },
      {
        "button": 5,
        "usageIds": [224, 86],
        "keys": ["ControlLeft", "NumpadSubtract"]
      },
      {
        "button": 8,
        "usageIds": [224, 225, 29],
        "keys": ["ControlLeft", "ShiftLeft", "KeyZ"]
      }
    ]
  }
}
```

## Important Distinction

**These USB HID keyboard usage IDs are NOT related to the tablet's native HID button codes!**

- **Tablet HID button codes** (1, 2, 4, 8, 16, 32, 64, 128): Tablet-specific bit flags sent in driverless mode
- **USB HID keyboard usage IDs** (5, 8, 29, 224, etc.): Standard keyboard codes sent by the driver in driver mode

When the driver is active:
1. Driver intercepts tablet's native HID button data
2. Driver generates OS keyboard events using USB HID keyboard usage IDs
3. Browser receives KeyboardEvents (which we convert back to usage IDs for storage)
4. Original tablet HID button data is blocked/consumed by the driver

## Reference

Full USB HID Usage Tables specification:
https://usb.org/sites/default/files/hut1_5.pdf
(Page 0x07 - Keyboard/Keypad)
