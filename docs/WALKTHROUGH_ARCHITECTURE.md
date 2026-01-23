# Walkthrough / Config Generator Architecture

The walkthrough guides users through the process of generating a configuration file for their tablet. It captures raw HID data while the user performs specific actions (draw, press buttons, tilt), then analyzes the bytes to automatically detect mappings.

- **Web Walkthrough** - Browser-based UI using WebHID
- **Node.js Config Generator** - CLI tool using node-hid

Both share the core walkthrough engine and byte detection logic.

---

## File Overview

### Shared Files (Used by Both Web and Node.js)

| File | Description |
|------|-------------|
| `src/core/walkthrough/walkthrough-engine.ts` | **Walkthrough engine** - State machine managing walkthrough steps; processes packets, triggers byte analysis, generates config |
| `src/core/walkthrough/walkthrough-controller.ts` | **Walkthrough controller** - High-level API wrapping the engine; manages HID reader connection and coordinates data flow |
| `src/core/walkthrough/walkthrough-types.ts` | **Type definitions** - Shared types for walkthrough state, steps, device info, and events |
| `src/utils/byte-detector.ts` | **Byte analyzer** - Analyzes captured packets to detect byte patterns (ranges, codes, bit flags, multi-byte values) |
| `src/utils/metadata-generator.ts` | **Config generator** - Converts detected byte mappings + device metadata into final JSON config format |
| `src/strings/walkthrough-strings.ts` | **UI strings** - Localized step titles, descriptions, and instructions used by both platforms |
| `src/core/hid/hid-interface.ts` | **HID interface** - Platform-agnostic `IHIDReader` interface |
| `src/core/hid/mock-hid-reader.ts` | **Mock HID reader** - For testing walkthrough without hardware |
| `src/models/config.ts` | **Config model** - Validates and loads generated configuration |

---

### Web Walkthrough Files

| File | Description |
|------|-------------|
| `src/components/hid-walkthrough/` | **Walkthrough view** - Main UI component; renders step-by-step wizard with instructions and progress |
| `src/components/hid-data-reader/` | **Data reader** - Manages WebHID device connection; displays live byte streams during capture |
| `src/components/hid-walkthrough-progress/` | **Progress indicator** - Visual step progress bar |
| `src/components/device-metadata-form/` | **Metadata form** - User input for device name, manufacturer, model |
| `src/components/hid-json-config/` | **Config display** - Shows generated JSON config with download button |
| `src/utils/finddevice.ts` | **Device finder** - WebHID device discovery, connection, and multi-interface management |

**Data Flow (Web):**
```
User Action → Physical Tablet → WebHID → WalkthroughController
                                              ↓
                                    WalkthroughEngine (state machine)
                                              ↓
                                    ByteDetector (analyze patterns)
                                              ↓
                                    MetadataGenerator → JSON Config
```

---

### Node.js Config Generator Files

| File | Description |
|------|-------------|
| `src/cli/config-generator.ts` | **CLI config generator** - Interactive terminal wizard using inquirer; prompts user through each step |
| `src/cli/node-hid-reader.ts` | **Node HID reader** - Implements `IHIDReader` using node-hid; includes `MultiInterfaceReader` |

**Data Flow (Node.js):**
```
User Action → Physical Tablet → node-hid → WalkthroughController
                                              ↓
                                    WalkthroughEngine (state machine)
                                              ↓
                                    ByteDetector (analyze patterns)
                                              ↓
                                    MetadataGenerator → JSON Config → File
```

---

## Shared vs Platform-Specific

```
┌─────────────────────────────────────────────────────────────────┐
│                        SHARED LAYER                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              src/core/walkthrough/                        │   │
│  │  walkthrough-engine.ts   - State machine & step logic     │   │
│  │  walkthrough-controller.ts - High-level coordination      │   │
│  │  walkthrough-types.ts    - Shared type definitions        │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────┐  ┌─────────────────────────────────┐   │
│  │ utils/              │  │ core/hid/                       │   │
│  │ byte-detector.ts    │  │ hid-interface.ts                │   │
│  │ metadata-generator  │  │ mock-hid-reader.ts              │   │
│  └─────────────────────┘  └─────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ strings/walkthrough-strings.ts - Shared UI text          │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
            │                                     │
            ▼                                     ▼
┌───────────────────────────┐       ┌───────────────────────────┐
│       WEB LAYER           │       │     NODE.JS LAYER         │
│  ┌─────────────────────┐  │       │  ┌─────────────────────┐  │
│  │ hid-walkthrough/    │  │       │  │ config-generator.ts │  │
│  │ hid-data-reader/    │  │       │  │ node-hid-reader.ts  │  │
│  │ hid-walkthrough-    │  │       │  └─────────────────────┘  │
│  │   progress/         │  │       │                           │
│  │ device-metadata-    │  │       │  Uses: node-hid,          │
│  │   form/             │  │       │  inquirer, commander,     │
│  │ hid-json-config/    │  │       │  chalk, ora               │
│  │ finddevice.ts       │  │       │                           │
│  └─────────────────────┘  │       │                           │
│                           │       │                           │
│  Uses: Lit, WebHID API    │       │                           │
└───────────────────────────┘       └───────────────────────────┘
```

---

## Walkthrough Steps

Both platforms guide users through the same steps (defined in `walkthrough-engine.ts`):

1. **Connect Device** - Establish HID connection
2. **Draw Horizontal** - Detect X-axis byte mapping
3. **Draw Vertical** - Detect Y-axis byte mapping
4. **Apply Pressure** - Detect pressure byte mapping
5. **Tilt Stylus** - Detect tilt X/Y mappings (if supported)
6. **Press Buttons** - Detect tablet button mappings
7. **Enter Metadata** - User provides device name/model
8. **Generate Config** - Output final JSON configuration

---

## Packet Format Handling

The walkthrough accounts for differences in how each platform receives HID packets:

### Platform Differences

| Platform | Report ID in Packet | Status Byte Index |
|----------|--------------------|--------------------|
| **Python/Node.js** | Yes (byte 0) | 1 |
| **WebHID** | No (stripped by browser) | 0 |

### Byte Index Offset in Config Generation

When generating configs, the walkthrough engine applies an offset for WebHID to ensure all configs use the same indexing convention (report ID at byte 0):

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

### Generated Config Example

Both platforms produce configs with the same byte index convention:

```json
{
  "status": { "byteIndex": [1] },     // Always 1 (after report ID)
  "x": { "byteIndex": [2, 3] },       // Always 2,3
  "y": { "byteIndex": [4, 5] },       // Always 4,5
  "pressure": { "byteIndex": [6, 7] }  // Always 6,7
}
```

This unified format allows configs generated on any platform to work with any viewer.

---

## Config Interchangeability

**Configs are fully interchangeable** across all platforms (Python, Node.js, WebHID) and driver states (driver enabled or disabled). Testing with the XP-Pen Deco 640 confirmed that all 6 generated configs (Python driver/nodriver, Node.js driver/nodriver, WebHID driver/nodriver) have **identical `byteCodeMappings`**:

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

Tablet buttons can be detected in different ways depending on the driver state and platform:

### Detection Methods

| Method | When Used | Config Output |
|--------|-----------|---------------|
| **HID Scan Codes** | Driverless mode (all platforms) | `type: "code"` with `{ button: N }` |
| **HID Bitmask** | Some tablets (driver mode) | `type: "code"` with bitmask values |
| **Keyboard Events** | WebHID only, driver active | `type: "code"` with `{ button: N, key: "x" }` |

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
    "1": { "key": "b", "code": "KeyB" },
    "2": { "key": "e", "code": "KeyE" }
  }
}
```

**Key points:**
- When `byteIndex` is empty `[]`, buttons were detected via keyboard events only
- The `key` and `code` fields match the browser's KeyboardEvent properties
- Python/Node readers cannot use keyboard-only configs - they require HID scan codes

### Platform Comparison

| Scenario | Python/Node.js | WebHID |
|----------|----------------|--------|
| Driverless mode | ✅ Full HID button detection | ✅ Full HID button detection |
| Driver active | ⚠️ May not see button HID data | ✅ Keyboard fallback available |

**Recommendation:** For best results, generate configs in driverless mode when possible. This ensures HID scan codes are captured, which work across all platforms.

---

## Key Design Decisions

1. **`WalkthroughEngine` is platform-agnostic** - All step logic, state transitions, and byte analysis happen in shared code

2. **`WalkthroughController` abstracts HID access** - Accepts any `IHIDReader` implementation (WebHID, node-hid, or mock)

3. **`ByteDetector` uses heuristics** - Automatically identifies byte roles by analyzing value ranges, change patterns, and correlations

4. **Shared strings for consistency** - Both platforms use the same instructional text from `walkthrough-strings.ts`

5. **Mock mode for development** - Both platforms support `--mock` flag for testing without physical hardware

6. **Unified config byte indices** - The `packetIncludesReportId` option ensures all generated configs use consistent indexing (report ID at byte 0) regardless of which platform created them

7. **Combined button + keyboard info** - WebHID configs include both HID button numbers and keyboard shortcut info in the same `tabletButtons.values` entries, allowing Python/Node to use the `button` field while preserving keyboard info for documentation
