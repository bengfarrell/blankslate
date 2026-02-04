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

Tablet buttons work differently depending on whether the manufacturer's driver is active and which HID interface the tablet uses for buttons.

For detailed information about button handling, including the different configuration formats (`tabletButtons`, `keyboardButtons`, `keyboardMappings`), see [Keyboard Input Handling](/about/keyboard-input/).

**Key points:**
- Some tablets (XP-Pen) send buttons via the digitizer interface
- Some tablets (Huion) send buttons via a keyboard HID interface
- WebHID cannot read keyboard HID interfaces due to the security blocklist
- For best compatibility, generate configs using Node.js/Python in driverless mode

---

## Platform-Specific Limitations

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

## Keyboard HID Interface Buttons

Some tablets (notably Huion) send button presses through a **Keyboard HID interface** (usage page 1, usage 6) rather than through the digitizer interface. This requires special handling:

- **macOS**: Requires `sudo` to read keyboard HID interfaces
- **WebHID**: Cannot read keyboard HID interfaces (security blocklist)
- **Config format**: Uses `keyboardButtons` instead of `tabletButtons`

See [Keyboard Input Handling](/about/keyboard-input/) for full details on how this works and the different configuration formats.

---

## WebHID Security Blocklist

WebHID maintains a [security blocklist](https://github.com/WICG/webhid/blob/main/blocklist.txt) that blocks access to keyboard and mouse HID interfaces. This prevents malicious websites from creating keyloggers.

**Impact on tablets:** Huion-style tablets that send buttons via keyboard HID cannot have their button data read by WebHID. The workaround is to generate configs using Node.js or Python with `sudo` on macOS.

See [Keyboard Input Handling](/about/keyboard-input/) for details and workarounds.

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
- **macOS + Keyboard HID buttons**: Tablets that send buttons via the keyboard HID interface require `sudo`. See [Keyboard Input Handling](/about/keyboard-input/) for details.
