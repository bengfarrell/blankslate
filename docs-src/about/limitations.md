---
layout: page.njk
title: Known Limitations
description: Platform limitations and workarounds
---

# Known Limitations

This document outlines known limitations of Blankslate, particularly around WebHID and driver interactions.

## WebHID Limitations

### Device Ownership

WebHID cannot "own" or exclusively claim a drawing tablet device. By default, the tablet continues to control the system mouse cursor even when connected via WebHID. This means:

- Stylus movements will move your mouse pointer
- Stylus clicks will trigger mouse clicks
- This can make the tablet unusable for drawing since input is duplicated

#### Workaround: Driver Mode Toggle

To prevent the tablet from controlling the mouse:

1. **Start the manufacturer's driver application** - This redirects tablet input through the driver
2. **Stop/quit the driver application** - The tablet remains in "driver mode" but with no active driver
3. **The tablet now sends data via WebHID without controlling the mouse**

This workaround is necessary for practical use of WebHID with drawing tablets.

---

## Tablet Button Capture

### Without a Driver (Driverless Mode)

- WebHID **cannot** capture the raw byte codes for tablet buttons
- The tablet sends default keyboard events (scan codes) for button presses
- These keyboard scan codes are what get recorded in the configuration
- This is specific to WebHID and is used only in that context

### With a Driver (Driver Mode)

- Button mappings are controlled by the driver software
- Users can customize buttons to perform any action
- Capturing key codes in driver mode doesn't make sense for a global configuration because:
  - The mappings are user-specific and customizable
  - They don't represent the tablet's inherent button behavior
  - Different users will have different driver configurations

### Implications for Configuration Files

The `modes` array in configuration files reflects these differences:

- **Mode 1 (Driver)**: Uses bit-flag button values, doesn't include keyboard scan codes
- **Mode 2 (Driverless)**: Includes `statusOverrides` with keyboard scan codes for button detection

---

## Platform-Specific Limitations

### Keyboard Event Capture

| Platform | Can Capture Keyboard Events |
|----------|----------------------------|
| WebHID (Browser) | ✅ Yes, via `keydown` API |
| Node.js | ❌ No, only raw HID packets |
| Python | ❌ No, only raw HID packets |

When the tablet driver is active, it often converts button presses to keyboard shortcuts. WebHID can capture these via the browser's keyboard API, but Node.js and Python cannot intercept OS-level keyboard events.

**Recommendation:** For best cross-platform compatibility, generate configs in **driverless mode** to capture HID scan codes that work everywhere.

### Multi-Interface Devices

Some tablets expose multiple HID interfaces:
- **Digitizer interface** (usage page 13) - Pen position, pressure, tilt
- **Vendor-specific interface** (usage page 65280) - Pen data on some tablets (e.g., Huion)
- **Keyboard interface** (usage page 1) - Tablet buttons as keyboard shortcuts
- **Consumer interface** (usage page 12) - Media keys (volume, playback)

| Platform | Multi-Interface Support |
|----------|------------------------|
| WebHID | ✅ Can open multiple interfaces |
| Node.js | ✅ `MultiInterfaceReader` class |
| Python | ✅ Multiple device handles |

---

## Keyboard HID Interface Buttons (Huion-style)

Some tablets (notably Huion) send tablet button presses through a **Keyboard HID interface** (usage page 1, usage 6) rather than through the digitizer interface. This has important implications:

### How It Works

Instead of sending button data as part of the pen packet, these tablets send button presses as keyboard shortcuts:

| Report ID | Type | Data Format |
|-----------|------|-------------|
| 3 | Keyboard | `[modifier, 0, keycode, 0, 0, 0, 0, 0]` |
| 4 | Consumer Control | `[consumerCode_lo, consumerCode_hi]` (media keys) |
| 5 | Relative Scroll | `[scrollDelta]` (scroll wheel) |

For example, pressing button 1 might send `modifier=0, keycode=5` (the "B" key), while button 2 sends `modifier=7, keycode=17` (Ctrl+Shift+Alt+N).

### macOS Sudo Requirement

**On macOS, the Keyboard HID interface (usage page 1) is protected by the operating system.** Applications cannot read from this interface without elevated privileges.

```bash
# This will NOT detect button presses on Huion-style tablets:
npx tsx src/cli/event-viewer.ts my-config.json --live

# This WILL detect button presses:
sudo npx tsx src/cli/event-viewer.ts my-config.json --live
```

The same applies to Python:
```bash
# Without sudo - pen works, buttons don't
python view_events.py -c my-config.json --live

# With sudo - everything works
sudo python view_events.py -c my-config.json --live
```

### Config File Format

Tablets with keyboard HID buttons use a different config format. Instead of `tabletButtons` with byte indices, they use `keyboardButtons`:

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

See [Configuration Schema](/about/config-schema/) for full details on the `keyboardButtons` format.

### Comparison: XP-Pen vs Huion Button Handling

| Aspect | XP-Pen Style | Huion Style |
|--------|--------------|-------------|
| **Button interface** | Digitizer (usage page 13) | Keyboard (usage page 1) |
| **Data location** | Same packet as pen data | Separate HID interface |
| **Config format** | `tabletButtons` with `byteIndex` | `keyboardButtons` with button array |
| **macOS permissions** | No sudo needed | **Sudo required** |
| **Button types** | Bit flags or scan codes | Keyboard shortcuts, media keys, scroll |

### Detecting Your Tablet Type

Run the config generator to see which interface your tablet uses:

```bash
# Node.js
sudo npx tsx src/cli/config-generator.ts

# Python
sudo python generate_config.py
```

If the walkthrough detects buttons on usage page 1, your tablet uses the keyboard HID interface.

---

## Browser Support

WebHID is only supported in Chromium-based browsers:

| Browser | WebHID Support |
|---------|---------------|
| Chrome | ✅ Full support |
| Edge | ✅ Full support |
| Brave | ✅ Full support |
| Firefox | ❌ Not supported |
| Safari | ❌ Not supported |

---

## Device Compatibility

### Tested Devices

| Device | Status | Notes |
|--------|--------|-------|
| XP-Pen Deco 640 | ✅ Full support | Included config, buttons via digitizer interface |
| Huion Inspiroy 2 M (H951P) | ✅ Full support | Included config, buttons via keyboard HID (requires sudo on macOS) |

### Untested Devices

Blankslate should work with any HID-compatible tablet, but:

- You'll need to generate a configuration using the walkthrough
- Some tablets may have unusual byte layouts
- Tablets with keyboard HID buttons require sudo on macOS
- Proprietary protocols may not be fully supported

---

## Performance Considerations

### Packet Rate

Drawing tablets typically send packets at 100-200 Hz. All platforms handle this well, but:

- WebSocket broadcasting adds latency
- Complex UI updates may lag at high packet rates
- Consider throttling for visualization-heavy applications

### Memory Usage

- Mock mode generates continuous data and may accumulate memory over long sessions
- WebSocket servers with many clients may use significant memory
- Close unused connections to free resources

---

## Security Considerations

### WebHID Permissions

- Users must explicitly grant permission to access HID devices
- Permission is per-device and per-origin
- HTTPS is required (except for localhost)

### Node.js/Python

- Requires appropriate OS permissions to access USB devices
- On macOS, may need to grant terminal/IDE access to USB
- On Linux, may need udev rules for non-root access
- **macOS + Keyboard HID buttons**: Tablets that send buttons via the keyboard HID interface (usage page 1) require `sudo` to read button data. See [Keyboard HID Interface Buttons](#keyboard-hid-interface-buttons-huion-style) above.
