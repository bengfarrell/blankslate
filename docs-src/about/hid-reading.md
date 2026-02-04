---
layout: page.njk
title: HID Reading
description: How Blankslate reads and interprets HID data
---

# HID Reading

This document explains how Blankslate reads raw HID (Human Interface Device) data from graphics tablets and translates it into meaningful events.

## HID Basics

### What is HID?

HID (Human Interface Device) is a USB protocol for input devices like keyboards, mice, and drawing tablets. Devices send data in fixed-size packets called "reports."

### Report Structure

A typical tablet report looks like:

```
[Report ID][Status][X_lo][X_hi][Y_lo][Y_hi][Pressure_lo][Pressure_hi][Tilt_X][Tilt_Y]
    0         1       2     3     4     5       6            7          8       9
```

- **Report ID**: Identifies the type of report
- **Status**: Pen state (hovering, touching, buttons)
- **X/Y**: Pen position (little-endian 16-bit)
- **Pressure**: Pen pressure (little-endian 16-bit)
- **Tilt**: Pen angle (signed 8-bit)

---

## Reading HID Data

### Node.js (node-hid)

```typescript
import HID from 'node-hid';

// Find the device
const devices = HID.devices();
const tablet = devices.find(d => 
  d.vendorId === 0x28bd && 
  d.productId === 0x2904 &&
  d.usagePage === 13  // Digitizer
);

// Open and read
const device = new HID.HID(tablet.path);
device.on('data', (data: Buffer) => {
  // data includes Report ID at byte 0
  const reportId = data[0];
  const status = data[1];
  const x = data[2] | (data[3] << 8);
  // ...
});
```

### Python (hidapi)

```python
import hid

# Find the device
devices = hid.enumerate()
tablet = next(d for d in devices 
              if d['vendor_id'] == 0x28bd 
              and d['product_id'] == 0x2904
              and d['usage_page'] == 13)

# Open and read
device = hid.device()
device.open_path(tablet['path'])

while True:
    data = device.read(64)  # Includes Report ID at byte 0
    report_id = data[0]
    status = data[1]
    x = data[2] | (data[3] << 8)
    # ...
```

### WebHID (Browser)

```javascript
// Request device access
const [device] = await navigator.hid.requestDevice({
  filters: [{ vendorId: 0x28bd, productId: 0x2904 }]
});

await device.open();

device.addEventListener('inputreport', (event) => {
  // WebHID strips the Report ID!
  const data = new Uint8Array(event.data.buffer);
  const reportId = event.reportId;  // Available separately
  const status = data[0];  // First byte is status, not report ID
  const x = data[1] | (data[2] << 8);
  // ...
});
```

---

## Data Processing

### The `processDeviceData` Function

Blankslate's core data processing function handles all platforms:

```typescript
function processDeviceData(
  data: Uint8Array,
  mappings: ByteCodeMappings,
  offset: number = 0
): TabletEvent {
  // Apply offset for WebHID (offset = -1)
  const getIndex = (idx: number) => idx + offset;
  
  // Extract X coordinate
  const xBytes = mappings.x.byteIndex.map(i => data[getIndex(i)]);
  const x = parseMultiByteRange(xBytes, mappings.x.max);
  
  // Extract Y coordinate
  const yBytes = mappings.y.byteIndex.map(i => data[getIndex(i)]);
  const y = parseMultiByteRange(yBytes, mappings.y.max);
  
  // ... pressure, tilt, status, buttons
  
  return { x, y, pressure, tiltX, tiltY, status, buttons };
}
```

### Multi-Byte Values

Coordinates and pressure are typically 16-bit little-endian:

```typescript
function parseMultiByteRange(bytes: number[], max: number): number {
  // Little-endian: low byte first
  let value = 0;
  for (let i = 0; i < bytes.length; i++) {
    value |= bytes[i] << (i * 8);
  }
  // Normalize to 0-1 range
  return value / max;
}
```

### Bipolar Values (Tilt)

Tilt uses a bipolar encoding where:
- 0 to `positiveMax` = positive tilt
- `negativeMin` to 255 = negative tilt

```typescript
function parseBipolarRange(
  value: number,
  positiveMax: number,
  negativeMin: number
): number {
  if (value <= positiveMax) {
    // Positive range: 0 to positiveMax → 0 to 1
    return value / positiveMax;
  } else if (value >= negativeMin) {
    // Negative range: negativeMin to 255 → -1 to 0
    return (value - 256) / (256 - negativeMin);
  }
  return 0;
}
```

---

## Status Byte Decoding

The status byte indicates pen state and button presses:

```typescript
const statusValues = {
  160: { state: 'hover' },
  161: { state: 'contact' },
  162: { state: 'hover', secondaryButton: true },
  163: { state: 'contact', secondaryButton: true },
  192: { state: 'none' },
  240: { state: 'buttons' }  // Tablet button press
};

function decodeStatus(byte: number, mappings: StatusMapping) {
  return mappings.values[byte] || { state: 'unknown' };
}
```

---

## Multi-Interface Reading

Some tablets send pen data and button data on separate HID interfaces:

```typescript
class MultiInterfaceReader {
  private penInterface: HIDDevice;
  private buttonInterface: HIDDevice;

  async connect(config: Config) {
    // Open digitizer interface (usage page 13)
    this.penInterface = await this.openInterface(13);

    // Open keyboard interface (usage page 1) for buttons
    if (config.buttonInterfaceReportId) {
      this.buttonInterface = await this.openInterface(1);
    }
  }

  private mergeEvents(penEvent: TabletEvent, buttonEvent: ButtonEvent) {
    return {
      ...penEvent,
      tabletButtons: buttonEvent.buttons
    };
  }
}
```

### HID Usage Pages

Tablets expose different interfaces identified by their **usage page**:

| Usage Page | Name | Purpose | macOS Access |
|------------|------|---------|--------------|
| 1 | Generic Desktop | Keyboard/mouse input, tablet buttons (Huion) | **Requires sudo** |
| 12 | Consumer Control | Media keys (volume, playback) | Requires sudo |
| 13 | Digitizer | Pen position, pressure, tilt | ✅ No sudo needed |
| 65280 | Vendor-Specific | Pen data on some tablets (Huion) | ✅ No sudo needed |

### Tablet Button Interface Styles

Different tablet manufacturers use different approaches for button data:

**XP-Pen style** - Buttons in digitizer interface:
- Buttons sent as part of pen packets (same interface)
- Uses `tabletButtons` mapping with `byteIndex`
- No special permissions needed

**Huion style** - Buttons via keyboard HID:
- Buttons sent through separate Keyboard HID interface (usage page 1)
- Uses `keyboardButtons` mapping with button array
- **Requires `sudo` on macOS** to read button data
- Supports multiple button types: keyboard shortcuts, media keys, scroll

See [Configuration Schema](/about/config-schema/#keyboard-hid-buttons-keyboardbuttons) for config format details.

---

## Byte Detection (Walkthrough)

The config generator detects byte mappings by analyzing changes:

```typescript
class ByteDetector {
  private baseline: Uint8Array;
  
  detectChanges(current: Uint8Array): ByteChange[] {
    const changes: ByteChange[] = [];
    
    for (let i = 0; i < current.length; i++) {
      if (current[i] !== this.baseline[i]) {
        changes.push({
          index: i,
          oldValue: this.baseline[i],
          newValue: current[i],
          delta: current[i] - this.baseline[i]
        });
      }
    }
    
    return changes;
  }
  
  detectMultiByteRange(samples: Uint8Array[]): MultiByteMapping {
    // Find bytes that change together in a pattern
    // indicating a multi-byte value
  }
}
```

---

## Error Handling

### Device Disconnection

```typescript
device.on('error', (err) => {
  if (err.message.includes('disconnected')) {
    // Attempt reconnection
    reconnect();
  }
});
```

### Invalid Data

```typescript
function validatePacket(data: Uint8Array, config: Config): boolean {
  // Check packet length
  if (data.length < config.expectedLength) {
    return false;
  }
  
  // Check report ID
  const reportId = data[0];
  if (!config.modes.some(m => m.reportId === reportId)) {
    return false;
  }
  
  return true;
}
```

---

## Performance Considerations

### Packet Rate

Tablets typically send 100-200 packets per second. For smooth visualization:

```typescript
// Throttle UI updates
let lastUpdate = 0;
const UPDATE_INTERVAL = 16; // ~60fps

function onData(event: TabletEvent) {
  const now = performance.now();
  if (now - lastUpdate >= UPDATE_INTERVAL) {
    updateUI(event);
    lastUpdate = now;
  }
}
```

### Memory Management

```typescript
// Reuse buffers instead of creating new ones
const eventBuffer = new TabletEvent();

function processData(data: Uint8Array): TabletEvent {
  // Update existing object instead of creating new
  eventBuffer.x = parseX(data);
  eventBuffer.y = parseY(data);
  // ...
  return eventBuffer;
}
```
