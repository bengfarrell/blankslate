---
layout: page.njk
title: Keyboard HID Interface
description: How Blankslate handles tablet buttons that use keyboard HID interfaces
---

# Keyboard HID Interface

Some drawing tablets send button presses through a **Keyboard HID interface** rather than through the digitizer interface. This page explains how Blankslate reads these HID packets and the configuration format used.

## Project Scope: HID-Only

**Important:** Blankslate is focused exclusively on reading **HID (Human Interface Device) data**. We do **not** use OS-level keyboard event listeners (like `keydown`/`keyup` events). Even when tablets use the "Keyboard HID interface," we read the raw HID packets directly—not browser or OS keyboard events.

## Background: How Tablets Send Button Data

Drawing tablets can send button data through two different HID interfaces:

### 1. Digitizer Interface - Native Buttons (XP-Pen style)

Most tablets include button data in the same HID packet as pen data:

```
[reportId, status, x_lo, x_hi, y_lo, y_hi, pressure_lo, pressure_hi, tiltX, tiltY, buttonByte]
```

The button byte contains scan codes indicating which buttons are pressed. This data comes through the **Digitizer HID interface** (usage page 13).

**Config format:** `tabletButtons` with `byteIndex` and `values` lookup

### 2. Keyboard Interface - HID Button Packets (Huion style)

Some tablets (notably Huion) send button presses through a completely separate **Keyboard HID interface** (usage page 1, usage 6). These are **raw HID packets** (not OS keyboard events):

| Report ID | Type | Data Format | Example |
|-----------|------|-------------|---------|
| 3 | Standard Keyboard | `[modifier, 0, keycode, 0, 0, 0, 0, 0]` | Button 1 → `modifier: 0, keycode: 5` (B key) |
| 4 | Consumer Control | `[consumerCode_lo, consumerCode_hi]` | Button 21 → `consumerCode: 182` (media key) |
| 5 | Relative Input | `[scrollDelta]` | Scroll up → `scrollDelta: 1`, down → `255` |

**Config format:** `keyboardButtons` with per-button `reportId`, `type`, and type-specific fields

**Important:** The scroll wheel (Report ID 5) is hardware that physically rotates, but the HID packets contain discrete delta values (`1` or `255`/-1), not variable scroll amounts. We treat each delta value as a separate button trigger.

---

## Identifying Common Button Types

When analyzing HID packets from the Keyboard interface during config generation, you'll encounter these common patterns:

### Standard Keyboard Shortcuts (Report ID 3)

```
Packet: [03 00 00 05 00 00 00 00 00]
         ↑  ↑  ↑  ↑
         │  │  │  └─ keycode: 5 (B key)
         │  │  └──── reserved byte
         │  └─────── modifier: 0 (no modifiers)
         └────────── Report ID: 3
```

**Identifies as:** Single key press (e.g., 'B')

**With modifiers:**
```
Packet: [03 01 00 1d 00 00 00 00 00]
         ↑  ↑     ↑
         │  │     └─ keycode: 29 (Z key)
         │  └─────── modifier: 1 (Left Ctrl)
         └────────── Report ID: 3
```

**Identifies as:** Keyboard shortcut (e.g., Ctrl+Z)

### Media Keys (Report ID 4)

```
Packet: [04 b6 00]
         ↑  ↑  ↑
         │  │  └─ consumerCode high byte
         │  └──── consumerCode: 182 (0xB6 = Scan Next Track)
         └─────── Report ID: 4
```

**Identifies as:** Media control button (Play, Pause, Volume, etc.)

### Scroll Wheel (Report ID 5)

```
Scroll Up:   [05 01]
              ↑  ↑
              │  └─ scrollDelta: 1
              └──── Report ID: 5

Scroll Down: [05 ff]
              ↑  ↑
              │  └─ scrollDelta: 255 (-1 in signed 8-bit)
              └──── Report ID: 5
```

**Identifies as:** Wheel rotation (creates two button entries: one for up, one for down)

**Key insight:** Even though the hardware is a rotating wheel, we see only two distinct values in practice. The config maps each delta value to a separate button number.

---

## Platform Differences

### Raw HID Access

| Platform | Can Read Keyboard HID Interface |
|----------|--------------------------------|
| Node.js (Linux) | ✅ Yes |
| Node.js (macOS) | ⚠️ Requires `sudo` |
| Python (Linux) | ✅ Yes |
| Python (macOS) | ⚠️ Requires `sudo` |
| WebHID (Browser) | ❌ No (security blocklist) |

### macOS Sudo Requirement

On macOS, the Keyboard HID interface is protected by the operating system. Applications cannot read from this interface without elevated privileges:

```bash
# Without sudo - pen works, buttons don't
npx tsx src/cli/event-viewer.ts my-config.json --live

# With sudo - everything works
sudo npx tsx src/cli/event-viewer.ts my-config.json --live
```

### WebHID Security Blocklist

WebHID maintains a [security blocklist](https://github.com/WICG/webhid/blob/main/blocklist.txt) that prevents websites from accessing certain HID device types. This includes:

| Usage Page | Usage | Description |
|------------|-------|-------------|
| 0x0001 | 0x0006 | Generic Desktop / Keyboard |
| 0x0001 | 0x0007 | Generic Desktop / Keypad |

This blocklist exists to prevent malicious websites from creating keyloggers. Unfortunately, it also blocks access to tablet buttons that use the keyboard interface.

**Impact:** WebHID can open and enumerate the keyboard interface, but **cannot receive input reports** from it. Raw HID button data is not accessible.

---

## Configuration Formats

Blankslate uses different configuration formats depending on how button data is accessed:

### `tabletButtons` - Digitizer Interface Buttons

For tablets where buttons come through the digitizer interface:

```json
"tabletButtons": {
  "byteIndex": [10],
  "buttonCount": 8,
  "type": "bit-flags"
}
```

Or with scan code mappings:

```json
"tabletButtons": {
  "byteIndex": [1],
  "buttonCount": 8,
  "type": "code",
  "values": {
    "1": { "button": 1 },
    "3": { "button": 2 },
    "6": { "button": 3 }
  }
}
```

**Used by:** All platforms (WebHID, Node.js, Python)

### `keyboardButtons` - Raw Keyboard HID Data

For tablets where buttons come through the keyboard HID interface, with raw USB HID keycodes:

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

**Button Types:**
- `type: "keyboard"` - Standard keyboard shortcut (modifier + keycode)
- `type: "consumer"` - Media control keys (play, pause, volume, etc.)
- `type: "scroll"` - Scroll wheel with discrete delta values

**Generated by:** Node.js and Python config generators (with sudo on macOS)

**Used by:** All platforms (WebHID, Node.js, Python)

### Understanding Scroll Wheels

The scroll wheel uses HID Report ID 5 (Relative Input) and sends a `scrollDelta` value. While the hardware is a physical rotating wheel, the HID packets contain **discrete delta values**:

- **Scroll Up**: `scrollDelta: 1`
- **Scroll Down**: `scrollDelta: 255` (which is -1 in signed 8-bit)

We treat each delta value as a **separate button trigger** rather than a continuous scroll amount. This means the config will have two button entries—one for "up" and one for "down"—each mapped to its specific delta value.

**Why it's called "scrollDelta":** The naming follows the USB HID specification. Even though we treat it like discrete buttons in practice, the config preserves the actual HID protocol structure for accuracy and debugging.

---

## Summary: Two HID Button Modalities

Blankslate supports two ways tablets send button data over HID:

| Modality | HID Interface | Config Format | Example Tablet |
|----------|---------------|---------------|----------------|
| **Native Buttons** | Digitizer (Usage Page 13) | `tabletButtons` | XP-Pen |
| **Keyboard HID Buttons** | Keyboard (Usage Page 1) | `keyboardButtons` | Huion |

Both modalities read **raw HID packets** directly from the device—we do not use OS-level keyboard event listeners.

## Recommendations

### For Best Compatibility

1. **Generate configs using Node.js or Python CLI** with `sudo` on macOS (if using keyboard HID interface)
2. **Use driverless mode** when possible to capture raw HID codes
3. Both `tabletButtons` and `keyboardButtons` formats work across all platforms

### Comparison Table

| Scenario | Config Generator | Button Format | Works In | Driver Required |
|----------|------------------|---------------|----------|-----------------|
| XP-Pen (any mode) | Any | `tabletButtons` | All platforms | No |
| Huion (driverless) | Node.js/Python + sudo | `keyboardButtons` | All platforms | No |
| Huion (driver mode) | Node.js/Python + sudo | `keyboardButtons` | All platforms | Optional* |

*When the driver is active, it may claim exclusive access to the keyboard HID interface, preventing Blankslate from reading it. Run in driverless mode for reliable HID access.

---

## See Also

- [Configuration Schema](/about/config-schema/) - Full details on all config formats
- [Known Limitations](/about/limitations/) - Platform-specific limitations
- [HID Reading](/about/hid-reading/) - How Blankslate reads HID data
