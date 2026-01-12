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

## Key Design Decisions

1. **`WalkthroughEngine` is platform-agnostic** - All step logic, state transitions, and byte analysis happen in shared code

2. **`WalkthroughController` abstracts HID access** - Accepts any `IHIDReader` implementation (WebHID, node-hid, or mock)

3. **`ByteDetector` uses heuristics** - Automatically identifies byte roles by analyzing value ranges, change patterns, and correlations

4. **Shared strings for consistency** - Both platforms use the same instructional text from `walkthrough-strings.ts`

5. **Mock mode for development** - Both platforms support `--mock` flag for testing without physical hardware
