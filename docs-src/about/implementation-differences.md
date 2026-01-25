---
layout: page.njk
title: Platform Differences
description: Differences between Node.js, Python, and Web implementations
---

# Platform Differences

Blankslate provides implementations for Node.js, Python, and the Web. While they share core logic, there are important differences in how each platform handles HID data.

## Architecture Overview

### Shared vs Platform-Specific

```
┌─────────────────────────────────────────────────────────────┐
│                      SHARED LAYER                           │
│  ┌─────────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ data-helpers    │  │   Config    │  │  IHIDReader     │  │
│  │ processDevice   │  │   class     │  │  interface      │  │
│  │ Data()          │  │             │  │                 │  │
│  └─────────────────┘  └─────────────┘  └─────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Walkthrough Engine, Byte Detector, Mock HID Reader      ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
            │                    │                    │
            ▼                    ▼                    ▼
┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
│     NODE.JS       │ │      PYTHON       │ │       WEB         │
│  ┌─────────────┐  │ │  ┌─────────────┐  │ │  ┌─────────────┐  │
│  │ node-hid    │  │ │  │   hidapi    │  │ │  │   WebHID    │  │
│  │ library     │  │ │  │   library   │  │ │  │   API       │  │
│  └─────────────┘  │ │  └─────────────┘  │ │  └─────────────┘  │
│  CLI tools        │ │  CLI tools        │ │  Web components   │
└───────────────────┘ └───────────────────┘ └───────────────────┘
```

### Shared Files (Used by All Platforms)

| File | Description |
|------|-------------|
| `src/utils/data-helpers.ts` | **Core data processing** - `processDeviceData()` parses raw HID bytes into normalized tablet events |
| `src/models/config.ts` | **Config model** - Defines the `Config` class for loading and validating tablet configuration JSON files |
| `src/core/hid/hid-interface.ts` | **HID interface** - Platform-agnostic `IHIDReader` interface that all readers implement |
| `src/core/hid/mock-hid-reader.ts` | **Mock HID reader** - Implements `IHIDReader` for testing without hardware |
| `src/mockbytes/tablet-data-generator.ts` | **Data generator** - Generates realistic tablet byte sequences for mock devices |

---

## Packet Format Differences

The most significant difference is how each platform receives HID packets.

### Physical Packet Structure (on the wire)

```
[Report ID][Status][X_lo][X_hi][Y_lo][Y_hi][Pressure_lo][Pressure_hi]...
    0         1       2     3     4     5       6            7
```

### How Each Platform Sees the Packet

| Platform | Report ID Handling | Packet Start | Status Index |
|----------|-------------------|--------------|--------------|
| **Python (hidapi)** | Included in data | Report ID | 1 |
| **Node.js (node-hid)** | Included in data | Report ID | 1 |
| **WebHID (browser)** | Stripped by browser | Status | 0 |

### Byte Index Offset Handling

To handle this, viewers apply an offset when reading config byte indices:

```typescript
// Node.js/Python - use config indices directly
processDeviceData(packet, mappings, 0);   // offset = 0

// WebHID - subtract 1 from config indices
processDeviceData(packet, mappings, -1);  // offset = -1
```

---

## Config Generation

When generating configs, the walkthrough accounts for platform differences:

| Platform | `packetIncludesReportId` | Index Adjustment |
|----------|--------------------------|------------------|
| Node.js | `true` | None |
| Python | `true` | None |
| WebHID | `false` | +1 to detected indices |

This ensures all configs use the same indexing convention (report ID at byte 0).

```typescript
// Node.js CLI walkthrough
new WalkthroughController(view, reader, {
  packetIncludesReportId: true  // Detected indices used as-is
});

// WebHID browser walkthrough  
new WalkthroughController(view, reader, {
  packetIncludesReportId: false  // +1 added to detected indices
});
```

---

## Config Interchangeability

**Configs are fully interchangeable** across all platforms and driver states. Testing with the XP-Pen Deco 640 confirmed that all 6 generated configs (Python driver/nodriver, Node.js driver/nodriver, WebHID driver/nodriver) have **identical `byteCodeMappings`**:

| Mapping | Value | All Configs |
|---------|-------|-------------|
| `x.byteIndex` | `[2, 3]` | ✅ Same |
| `y.byteIndex` | `[4, 5]` | ✅ Same |
| `pressure.byteIndex` | `[6, 7]` | ✅ Same |
| `status.byteIndex` | `[1]` | ✅ Same |
| `tiltX/Y.byteIndex` | `[8]` / `[9]` | ✅ Same |
| `tabletButtons.byteIndex` | `[2]` | ✅ Same |

### The `reportId` Field

The only notable difference between configs is the `reportId` field:

| Platform | `reportId` Value | Reason |
|----------|------------------|--------|
| Python / Node.js | `2` (actual value) | Raw HID packets include Report ID |
| WebHID | `0` | Browser strips Report ID from packets |

**Important:** The `reportId` field is purely **informational metadata**. The viewer does **not** use this field to determine byte offsets. Instead, the viewer applies offsets based on the **runtime environment**:

```typescript
// WebHID viewer always applies -1 offset (browser strips report ID)
processDeviceData(bytes, config.byteCodeMappings, -1);

// Node.js/Python viewer uses 0 offset (packet includes report ID)
processDeviceData(bytes, config.byteCodeMappings, 0);
```

### Practical Implications

1. **Generate once, use anywhere** - A config created on Python works in the Node.js viewer and WebHID viewer
2. **Driver state doesn't matter** - Configs created with the driver enabled work identically when the driver is disabled (and vice versa)
3. **No need for platform-specific configs** - A single config file serves all use cases for a given tablet model

---

## Tablet Button Detection

Tablet buttons can be detected in different ways depending on the driver state and platform.

### Detection Methods

| Method | When Used | Config Output |
|--------|-----------|---------------|
| **HID Scan Codes** | Driverless mode (all platforms) | `type: "code"` with `{ button: N }` |
| **HID Bitmask** | Some tablets (driver mode) | `type: "code"` with bitmask values |
| **Keyboard Events** | WebHID only, driver active | `type: "code"` with `{ button: N, key: "x" }` |

### Detection Methods by Platform

| Method | Node.js | Python | WebHID |
|--------|---------|--------|--------|
| HID Scan Codes | ✅ | ✅ | ✅ |
| HID Bitmask | ✅ | ✅ | ✅ |
| Keyboard Events | ❌ | ❌ | ✅ |

### Keyboard Fallback (WebHID Only)

When the tablet driver is active, it often intercepts the HID button interface and converts button presses to keyboard shortcuts. In this case:

- **WebHID** can capture keyboard events via the browser's `keydown` API alongside HID data
- **Python/Node.js** only read raw HID packets and cannot capture OS keyboard events

This means WebHID can detect buttons via keyboard events even when the driver blocks HID button data:

```json
"tabletButtons": {
  "byteIndex": [],
  "buttonCount": 8,
  "type": "code",
  "values": {
    "1": { "button": 1, "key": "b", "code": "KeyB" },
    "2": { "button": 2, "key": "e", "code": "KeyE" }
  }
}
```

**Key points:**
- When `byteIndex` is empty `[]`, buttons were detected via keyboard events only
- The `key` and `code` fields match the browser's KeyboardEvent properties
- Python/Node readers cannot use keyboard-only configs - they require HID scan codes
- WebHID configs include both HID button numbers and keyboard shortcut info, allowing Python/Node to use the `button` field while preserving keyboard info

### Platform Comparison for Button Detection

| Scenario | Python/Node.js | WebHID |
|----------|----------------|--------|
| Driverless mode | ✅ Full HID button detection | ✅ Full HID button detection |
| Driver active | ⚠️ May not see button HID data | ✅ Keyboard fallback available |

**Recommendation:** For best cross-platform compatibility, generate configs in **driverless mode** when possible. This ensures HID scan codes are captured, which work across all platforms.

---

## Feature Comparison

| Feature | Node.js | Python | WebHID |
|---------|---------|--------|--------|
| Config generation | ✅ | ✅ | ✅ |
| Event viewing | ✅ CLI | ✅ CLI | ✅ GUI |
| WebSocket server | ✅ | ✅ | N/A |
| Mock mode | ✅ | ✅ | ✅ |
| Multi-interface | ✅ | ✅ | ✅ |
| Keyboard capture | ❌ | ❌ | ✅ |
| GUI visualization | ❌ | ❌ | ✅ |
| No browser required | ✅ | ✅ | ❌ |

---

## Library Dependencies

### Node.js

| Library | Purpose |
|---------|---------|
| `node-hid` | HID device access |
| `commander` | CLI argument parsing |
| `inquirer` | Interactive prompts |
| `chalk` | Terminal colors |
| `ora` | Spinners |
| `ws` | WebSocket server |

### Python

| Library | Purpose |
|---------|---------|
| `hidapi` | HID device access |
| `click` | CLI framework |
| `rich` | Terminal formatting |
| `websockets` | WebSocket server |

### Web

| Library | Purpose |
|---------|---------|
| `lit` | Web components |
| `@spectrum-web-components` | UI components |
| WebHID API | Browser HID access |

---

## Key Design Decisions

1. **`processDeviceData()` is the single source of truth** - Both platforms use the exact same function to parse raw bytes into tablet events

2. **`IHIDReader` interface enables polymorphism** - Real devices, mock devices, and multi-interface readers all implement the same interface

3. **Config-driven byte parsing** - The JSON config file defines how to interpret each byte, making the viewer work with any HID tablet without code changes

4. **Mock devices for testing** - Both platforms have mock implementations that generate realistic data, enabling development without physical hardware

5. **Unified byte indices in configs** - Configuration files always use indices based on the full physical packet (report ID at byte 0), with runtime offset applied for WebHID

6. **Combined button + keyboard info** - WebHID configs include both HID button numbers and keyboard shortcut info in the same `tabletButtons.values` entries, allowing Python/Node to use the `button` field while preserving keyboard info for documentation

---

## When to Use Each Platform

### Use Node.js When:
- Building CLI tools or scripts
- Need WebSocket server for other apps
- Want TypeScript type safety
- Integrating with Node.js ecosystem

### Use Python When:
- Building Python applications
- Integrating with data science tools
- Prefer Python syntax
- Need hidapi's cross-platform support

### Use WebHID When:
- Building web applications
- Need visual interface
- Want no installation required
- Need keyboard event capture
