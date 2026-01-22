# Viewer Architecture

The viewer displays real-time tablet data (position, pressure, tilt, buttons) from either a physical device or a mock simulator. There are two versions:

- **Web Viewer** - Browser-based dashboard using WebHID
- **Node.js Viewer** - CLI tool using node-hid

Both share core data processing logic.

---

## File Overview

### Shared Files (Used by Both Web and Node.js)

| File | Description |
|------|-------------|
| `src/utils/data-helpers.ts` | **Core data processing** - `processDeviceData()` parses raw HID bytes into normalized tablet events (x, y, pressure, tilt, buttons) using config mappings |
| `src/models/config.ts` | **Config model** - Defines the `Config` class for loading and validating tablet configuration JSON files |
| `src/core/hid/hid-interface.ts` | **HID interface** - Platform-agnostic `IHIDReader` interface that both WebHID and node-hid readers implement |
| `src/core/hid/mock-hid-reader.ts` | **Mock HID reader** - Implements `IHIDReader` for testing without hardware; generates simulated tablet data |
| `src/mockbytes/tablet-data-generator.ts` | **Data generator** - Generates realistic tablet byte sequences (circles, lines, pressure sweeps, etc.) for mock devices |

---

### Web Viewer Files

| File | Description |
|------|-------------|
| `src/components/hid-dashboard/` | **Dashboard component** - Main viewer UI; displays tablet visualizer, pressure/tilt gauges, and raw bytes. Connects via WebHID |
| `src/components/tablet-visualizer/` | **Tablet visualizer** - SVG-based visualization showing pen position, pressure indicator, tilt angle, and tablet buttons |
| `src/components/bytes-display/` | **Bytes display** - Shows raw HID packet bytes with labels from config mappings |
| `src/mockbytes/mock-tablet-device.ts` | **Mock tablet device** - Browser-compatible mock that emits `inputreport` events like a real WebHID device |

**Data Flow (Web):**
```
Physical Tablet → WebHID API → processDeviceData() → Dashboard UI
       or
MockTabletDevice → processDeviceData() → Dashboard UI
```

---

### Node.js Viewer Files

| File | Description |
|------|-------------|
| `src/cli/event-viewer.ts` | **CLI event viewer** - Terminal-based viewer; displays live tablet data, supports mock mode, calibration warnings |
| `src/cli/node-hid-reader.ts` | **Node HID reader** - Implements `IHIDReader` using `node-hid` library; includes `MultiInterfaceReader` for tablets with multiple HID interfaces |

**Data Flow (Node.js):**
```
Physical Tablet → node-hid → NodeHIDReader → processDeviceData() → Terminal Output
       or
MockHIDReader → processDeviceData() → Terminal Output
```

---

## Shared vs Platform-Specific

```
┌─────────────────────────────────────────────────────────────┐
│                      SHARED LAYER                           │
│  ┌─────────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ data-helpers.ts │  │  config.ts  │  │ hid-interface.ts│  │
│  │ processDevice   │  │   Config    │  │   IHIDReader    │  │
│  │ Data()          │  │   class     │  │   interface     │  │
│  └─────────────────┘  └─────────────┘  └─────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ mockbytes/ - tablet-data-generator.ts, mock-hid-reader  ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
            │                                   │
            ▼                                   ▼
┌─────────────────────────┐       ┌─────────────────────────┐
│      WEB LAYER          │       │     NODE.JS LAYER       │
│  ┌───────────────────┐  │       │  ┌───────────────────┐  │
│  │ hid-dashboard/    │  │       │  │ event-viewer.ts   │  │
│  │ tablet-visualizer/│  │       │  │ node-hid-reader.ts│  │
│  │ bytes-display/    │  │       │  └───────────────────┘  │
│  │ mock-tablet-device│  │       │                         │
│  └───────────────────┘  │       │  Uses: node-hid,        │
│                         │       │  commander, chalk       │
│  Uses: Lit, WebHID API  │       │                         │
└─────────────────────────┘       └─────────────────────────┘
```

---

## Packet Format and Byte Index Architecture

The HID packet format differs between platforms due to how each API handles the report ID:

### Physical Packet Structure (on the wire)
```
[Report ID][Status][X_lo][X_hi][Y_lo][Y_hi][Pressure_lo][Pressure_hi][TiltX][TiltY]...
    0         1       2     3     4     5       6            7          8      9
```

### How Each Platform Sees the Packet

| Platform | Report ID Handling | Packet Start | Status Index |
|----------|-------------------|--------------|--------------|
| **Python (hidapi)** | Included in data | Report ID | 1 |
| **Node.js (node-hid)** | Included in data | Report ID | 1 |
| **WebHID (browser)** | Stripped by browser | Status | 0 |

### Unified Configuration Format

**Config files always represent physical truth** - byte indices are based on the full packet with report ID at byte 0:

```json
{
  "byteCodeMappings": {
    "status": { "byteIndex": [1] },
    "x": { "byteIndex": [2, 3] },
    "y": { "byteIndex": [4, 5] },
    "pressure": { "byteIndex": [6, 7] },
    "tiltX": { "byteIndex": [8] },
    "tiltY": { "byteIndex": [9] },
    "tabletButtons": { "byteIndex": [2] }
  }
}
```

### Byte Index Offset Handling

Since WebHID strips the report ID, the browser viewer subtracts 1 from config indices:

```typescript
// Node.js/Python - use config indices directly
processDeviceData(packet, mappings, 0);   // offset = 0

// WebHID - subtract 1 from config indices
processDeviceData(packet, mappings, -1);  // offset = -1
```

### Walkthrough Config Generation

The walkthrough engine also accounts for this:

```typescript
// Node.js CLI - packets include report ID, detected indices are final
new WalkthroughController(view, reader, { packetIncludesReportId: true });

// WebHID browser - packets don't include report ID, add 1 to detected indices
new WalkthroughController(view, reader, { packetIncludesReportId: false });
```

This ensures configs generated from either platform have consistent byte indices.

---

## Key Design Decisions

1. **`processDeviceData()` is the single source of truth** - Both platforms use the exact same function to parse raw bytes into tablet events

2. **`IHIDReader` interface enables polymorphism** - Real devices, mock devices, and multi-interface readers all implement the same interface

3. **Config-driven byte parsing** - The JSON config file defines how to interpret each byte, making the viewer work with any HID tablet without code changes

4. **Mock devices for testing** - Both platforms have mock implementations that generate realistic data, enabling development without physical hardware

5. **Unified byte indices in configs** - Configuration files always use indices based on the full physical packet (report ID at byte 0), with runtime offset applied for WebHID
