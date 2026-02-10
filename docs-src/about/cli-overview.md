---
layout: page.njk
title: CLI Tools Overview
description: Command-line tools for tablet configuration and event viewing
---

# CLI Tools Overview

Blankslate provides three CLI tools available in both Node.js and Python:

| Tool | Purpose |
|------|---------|
| **Config Generator** | Interactive wizard to create tablet configurations |
| **Event Viewer** | Real-time display of tablet events |
| **WebSocket Server** | Broadcast tablet events over WebSocket |

## Tool Comparison

Both Node.js and Python implementations provide identical functionality:

| Feature | Node.js | Python |
|---------|---------|--------|
| Config generation | ✅ | ✅ |
| Live event viewing | ✅ | ✅ |
| WebSocket server | ✅ | ✅ |
| Mock mode | ✅ | ✅ |
| Raw byte display | ✅ | ✅ |
| Multi-interface support | ✅ | ✅ |

## Quick Reference

### Config Generator

Creates JSON configuration files for your tablet:

```bash
# Node.js
npm run config
npx tsx src/cli/config-generator.ts --mock

# Python
tablet-config-generator
tablet-config-generator --mock
```

### Event Viewer

Displays real-time tablet data:

```bash
# Node.js
npm run events -- -c config.json --live
npx tsx src/cli/event-viewer.ts -c config.json --live --raw

# Python
tablet-events -c config.json --live
tablet-events -c config.json --live --raw
```

### WebSocket Server

Broadcasts tablet events for remote applications:

```bash
# Node.js
npm run websocket -- -c config.json
npx tsx src/cli/tablet-websocket-server.ts -c config.json --port 9000

# Python
tablet-websocket -c config.json
tablet-websocket -c config.json --port 9000
```

## Common Options

All tools support these options:

| Option | Description |
|--------|-------------|
| `-c, --config <file>` | Path to tablet configuration JSON |
| `--mock` | Use simulated tablet data |
| `--help` | Show help message |

## Mock Mode

All tools support `--mock` for testing without hardware:

```bash
# Test config generation workflow
npm run config -- --mock

# View simulated tablet events
tablet-events -c config.json --mock --live
```

Mock mode generates realistic data patterns:
- Horizontal and vertical lines
- Circular movements
- Pressure sweeps
- Tilt variations
- Button presses

## Output Formats

### Event Viewer Modes

| Mode | Flag | Description |
|------|------|-------------|
| Live | `--live` | Interactive dashboard with real-time updates |
| Compact | `--compact` | Single-line format for logging |
| Raw | `--raw` | Include raw HID bytes |
| Default | (none) | Detailed multi-line format |

### WebSocket Data Formats

**Translated Events (default):**
```json
{
  "type": "tablet-data",
  "timestamp": 1234567890,
  "x": 0.5,
  "y": 0.5,
  "pressure": 0.8,
  "tiltX": 0.0,
  "tiltY": 0.0,
  "primaryButton": false,
  "secondaryButton": false
}
```

**Raw Bytes (`--raw` flag):**
Binary Uint8Array sent directly over WebSocket.

---

## Platform-Specific Guides

- **[Node.js CLI](/about/cli-node/)** - Detailed Node.js usage
- **[Python CLI](/about/cli-python/)** - Detailed Python usage
