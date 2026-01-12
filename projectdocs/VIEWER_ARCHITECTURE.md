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

## Key Design Decisions

1. **`processDeviceData()` is the single source of truth** - Both platforms use the exact same function to parse raw bytes into tablet events

2. **`IHIDReader` interface enables polymorphism** - Real devices, mock devices, and multi-interface readers all implement the same interface

3. **Config-driven byte parsing** - The JSON config file defines how to interpret each byte, making the viewer work with any HID tablet without code changes

4. **Mock devices for testing** - Both platforms have mock implementations that generate realistic data, enabling development without physical hardware
