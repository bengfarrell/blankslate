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
```

> **macOS + Huion tablets:** If your tablet sends buttons via the Keyboard HID interface, you'll need `sudo` to detect buttons during the walkthrough:
> ```bash
> sudo npx tsx src/cli/config-generator.ts
> ```

**Features:**
- Automatic device detection
- Interactive walkthrough for byte mapping detection
- Supports pen position, pressure, tilt, and buttons
- Multi-interface support (pen + keyboard interfaces)
- Mock mode for testing without physical hardware
- Generates JSON config files compatible with all tools

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
