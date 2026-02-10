---
layout: page.njk
title: Node.js CLI
description: Command-line tools for Node.js
---

# Node.js CLI Tools

Command-line tools for configuring and testing HID graphics tablets using Node.js.

## Development Mode

Run directly with tsx (no build required):

```bash
# Interactive configuration generator
npm run config
# or
npx tsx src/cli/config-generator.ts

# View tablet events
npm run events -- -c path/to/config.json --live
# or
npx tsx src/cli/event-viewer.ts -c path/to/config.json --live

# Start WebSocket server
npm run websocket -- -c path/to/config.json
# or
npx tsx src/cli/tablet-websocket-server.ts -c path/to/config.json
```

## Building for Distribution

Build the CLI for npm distribution:

```bash
npm run build:cli
```

This compiles to `dist/cli/` and the package.json bin entries point there:

- `tablet-config` → Interactive configuration generator
- `tablet-events` → Real-time event viewer
- `tablet-websocket` → WebSocket server

---

## Config Generator

Interactive step-by-step wizard to generate tablet configurations:

```bash
npx tsx src/cli/config-generator.ts
npx tsx src/cli/config-generator.ts --output my-config.json
npx tsx src/cli/config-generator.ts --mock  # Use mock data for testing
npx tsx src/cli/config-generator.ts --record captured-data.json  # Save all captured packets
```

> **macOS + Huion tablets:** If your tablet sends buttons via the Keyboard HID interface, you'll need `sudo` to detect buttons during the walkthrough:
> ```bash
> sudo npx tsx src/cli/config-generator.ts
> ```

**Options:**

| Option | Short | Description |
|--------|-------|-------------|
| `--output <path>` | `-o` | Output path for generated config JSON |
| `--mock` | `-m` | Use mock data instead of real device |
| `--record <path>` | `-r` | Save all captured packet data to a JSON file |

**Features:**
- Automatic device detection
- Interactive walkthrough for byte mapping detection
- Supports pen position, pressure, tilt, and buttons
- Multi-interface support (pen + keyboard interfaces)
- Mock mode for testing without physical hardware
- Generates JSON config files compatible with all tools
- Record mode to capture all raw packet data for debugging

### Recorded Data Format

When using `--record`, the tool saves all captured HID packets organized by walkthrough step:

```json
{
  "timestamp": "2026-02-10T17:00:00.000Z",
  "device": {
    "vendorId": "0x28bd",
    "productId": "0x2904",
    "productName": "XP-Pen Deco 640"
  },
  "steps": {
    "step1-horizontal": {
      "packetCount": 150,
      "packets": ["a000ff3c2a00...", "a000ff3d2b00...", "..."],
      "detectedBytes": [
        { "byteIndex": 2, "variance": 200, "min": 0, "max": 255 },
        { "byteIndex": 3, "variance": 180, "min": 0, "max": 200 }
      ]
    },
    "step2-vertical": { "..." },
    "step3-pressure": { "..." },
    "step4-tiltX": { "..." },
    "step5-tiltY": { "..." },
    "step6-buttons": { "..." }
  }
}
```

| Field | Description |
|-------|-------------|
| `timestamp` | ISO 8601 timestamp when recording completed |
| `device` | Device info (vendorId, productId, productName) |
| `steps` | Map of step name → captured data |
| `packetCount` | Number of packets captured in this step |
| `packets` | Array of hex-encoded HID packets |
| `detectedBytes` | Bytes identified as significant (high variance) |

This is useful for:
- Debugging byte detection issues
- Sharing raw data for troubleshooting
- Replaying captures for testing
- Analyzing packet patterns

---

## Event Viewer

View and visualize tablet events in real-time:

```bash
# Live dashboard mode (recommended)
npx tsx src/cli/event-viewer.ts -c config.json --live

# Compact single-line mode
npx tsx src/cli/event-viewer.ts -c config.json --compact

# Show raw bytes
npx tsx src/cli/event-viewer.ts -c config.json --live --raw

# Use mock data
npx tsx src/cli/event-viewer.ts -c config.json --mock --live
```

> **macOS + Keyboard HID buttons:** If your config has `keyboardButtons` (Huion-style tablets), use `sudo` to read button events:
> ```bash
> sudo npx tsx src/cli/event-viewer.ts -c config.json --live
> ```

**Display Modes:**

| Mode | Flag | Description |
|------|------|-------------|
| Live | `--live` | Interactive dashboard with updating values |
| Compact | `--compact` | Single-line format for each event |
| Raw | `--raw` | Show raw HID bytes alongside events |
| Default | (none) | Detailed multi-line format |

---

## WebSocket Server

Broadcast tablet events over WebSocket for remote applications:

```bash
# Start server on default port (8765)
npx tsx src/cli/tablet-websocket-server.ts -c config.json

# Specify custom port
npx tsx src/cli/tablet-websocket-server.ts -c config.json --port 9000

# Send raw bytes instead of translated events
npx tsx src/cli/tablet-websocket-server.ts -c config.json --raw

# Use mock data for testing
npx tsx src/cli/tablet-websocket-server.ts -c config.json --mock
```

**Features:**
- Reads HID tablet data using your config file
- Broadcasts high-level tablet events over WebSocket
- Supports raw byte mode (`--raw`) for debugging
- Multiple simultaneous client connections
- Automatic client connection/disconnection handling
- Mock mode for testing without physical hardware
- Web client auto-detects data format

**Translated Event Format (default):**
```json
{
  "type": "tablet-data",
  "timestamp": 1234567890,
  "x": 0.5,
  "y": 0.5,
  "pressure": 0.8,
  "buttons": [false, true, false]
}
```

**Raw Byte Format (`--raw` flag):**
Binary data (Uint8Array) sent directly over WebSocket.

**Client Example:**
```javascript
const ws = new WebSocket('ws://localhost:8765');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Tablet event:', data);
};
```

---

## Interface Diagnostic

List all HID devices and their interfaces:

```bash
npm run diagnose
# or
npx tsx src/cli/interface-diagnostic.ts
```

Useful for finding your tablet's vendor ID, product ID, and usage pages.

---

## npm Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run config` | Run config generator |
| `npm run events` | Run event viewer |
| `npm run websocket` | Run WebSocket server |
| `npm run diagnose` | Run interface diagnostic |
| `npm run build:cli` | Build CLI for distribution |
