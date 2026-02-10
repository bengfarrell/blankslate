---
layout: page.njk
title: Python CLI
description: Command-line tools for Python
---

# Python CLI Tools

Command-line tools for configuring and testing HID graphics tablets using Python.

## Installation

Install the Python package:

```bash
cd python
pip install -e .
```

This installs three CLI commands:
- `tablet-config-generator` → Interactive configuration generator
- `tablet-events` → Real-time event viewer
- `tablet-websocket` → WebSocket server for broadcasting tablet events

For development with all extras:
```bash
pip install -e ".[dev,websocket,keyboard]"
```

---

## Development Mode

For development, you can run the tools directly without installing the package. This is useful for testing changes and debugging in IDEs like WebStorm.

### Running Without Installation

**Config Generator:**
```bash
cd python
python generate_config.py              # Interactive mode
python generate_config.py --mock       # Mock mode
# or
./run_config_gen.sh                    # Shell script wrapper
# or
python run_config_generator.py         # Python wrapper
```

**Event Viewer:**
```bash
cd python
python view_events.py -c ../public/configs/xp-pen-deco640.json --live
python view_events.py -c my-config.json --mock --live
# or
./run_viewer.sh                        # Shell script wrapper
# or
python run_event_viewer.py -c my-config.json --live
```

**Why multiple scripts?**
- `generate_config.py` / `view_events.py` - Standalone scripts that work well in IDEs (Ctrl+C works properly)
- `run_config_generator.py` / `run_event_viewer.py` - Simple wrappers for the CLI modules
- `run_config_gen.sh` / `run_viewer.sh` - Shell scripts with automatic venv activation

### Running With Installation

After installing with `pip install -e .`:

```bash
# Interactive configuration generator
python -m blankslate.cli.config_generator
# or
tablet-config-generator

# View tablet events
python -m blankslate.cli.event_viewer -c path/to/config.json --live
# or
tablet-events -c path/to/config.json --live

# Start WebSocket server
python -m blankslate.cli.websocket_server -c path/to/config.json
# or
tablet-websocket -c path/to/config.json
```

---

## Config Generator

Interactive step-by-step wizard to generate tablet configurations:

```bash
# With installation
tablet-config-generator
tablet-config-generator --mock  # Use mock data for testing
tablet-config-generator --record captured-data.json  # Save all captured packets

# Without installation (development)
cd python
python generate_config.py
python generate_config.py --mock
python generate_config.py --record captured-data.json
```

> **macOS + Huion tablets:** If your tablet sends buttons via the Keyboard HID interface, you'll need `sudo` to detect buttons during the walkthrough:
> ```bash
> sudo tablet-config-generator
> # or
> sudo python generate_config.py
> ```

**Options:**

| Option | Short | Description |
|--------|-------|-------------|
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
  "timestamp": "2026-02-10T17:00:00.000000",
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
tablet-events -c config.json --live

# Compact single-line mode
tablet-events -c config.json --compact

# Show raw bytes
tablet-events -c config.json --live --raw

# Use mock data
tablet-events -c config.json --mock --live
```

> **macOS + Keyboard HID buttons:** If your config has `keyboardButtons` (Huion-style tablets), use `sudo` to read button events:
> ```bash
> sudo tablet-events -c config.json --live
> # or
> sudo python view_events.py -c config.json --live
> ```

**Features:**
- Real-time event visualization
- Live mode with updating dashboard
- Compact mode for continuous logging
- Raw byte display for debugging
- Calibration warnings for max values
- Mock mode with automatic gesture cycling
- Color-coded output for easy reading

**Display Modes:**

| Mode | Flag | Description |
|------|------|-------------|
| Live | `--live` | Interactive dashboard with live updates |
| Compact | `--compact` | Single-line format for each event |
| Raw | `--raw` | Show raw HID bytes alongside events |
| Default | (none) | Detailed multi-line format |

---

## WebSocket Server

Broadcast tablet events over WebSocket for remote applications:

```bash
# Start server on default port (8765)
tablet-websocket -c config.json

# Specify custom port
tablet-websocket -c config.json --port 9000

# Send raw bytes instead of translated events
tablet-websocket -c config.json --raw

# Use mock data for testing
tablet-websocket -c config.json --mock
```

**Features:**
- Reads HID tablet data using your config file
- Broadcasts high-level tablet events (position, pressure, buttons) over WebSocket
- Supports raw byte mode (`--raw`) for debugging and low-level analysis
- Supports multiple simultaneous client connections
- Automatic client connection/disconnection handling
- Device reconnection with exponential backoff
- Mock mode for testing without physical hardware
- Status broadcasts for connection state
- Web client auto-detects data format (raw vs translated)

**Translated Event Format (default):**
```json
{
  "type": "tablet-data",
  "timestamp": 1234567890.123,
  "x": 0.5,
  "y": 0.5,
  "pressure": 0.8,
  "tiltX": 0.0,
  "tiltY": 0.0,
  "primaryButton": false,
  "secondaryButton": false,
  "tabletButtons": 0,
  "button1": false,
  "button2": false
}
```

**Raw Byte Format (`--raw` flag):**
Binary data sent directly over WebSocket. The web client will automatically detect this format and display the raw bytes viewer with config-based byte interpretation.

**Status Messages:**
```json
{
  "type": "status",
  "status": "connected",
  "message": "Device connected"
}
```

**Client Example:**
```python
import asyncio
import websockets
import json

async def receive_events():
    uri = "ws://localhost:8765"
    async with websockets.connect(uri) as websocket:
        async for message in websocket:
            data = json.loads(message)
            print(f"Tablet event: {data}")

asyncio.run(receive_events())
```

---

## Mock Mode

All tools support `--mock` flag for testing without physical hardware:

```bash
# With installation
tablet-config-generator --mock
tablet-events -c config.json --mock --live
tablet-websocket -c config.json --mock

# Without installation (development)
cd python
python generate_config.py --mock
python view_events.py -c ../public/configs/xp-pen-deco640.json --mock --live
```

**Mock Features:**
- Config-based packet generation (matches your device's byte structure)
- Automatic gesture cycling (horizontal, vertical, circle, pressure, tilt, buttons)
- Realistic timing and packet rates
- Perfect for development and testing

---

## Development Scripts

Located in `python/` directory:

| Script | Purpose | Example |
|--------|---------|---------|
| `generate_config.py` | Generate tablet config | `python generate_config.py --mock` |
| `view_events.py` | View tablet events | `python view_events.py -c config.json --live` |
| `run_config_gen.sh` | Shell wrapper for config gen | `./run_config_gen.sh --mock` |
| `run_viewer.sh` | Shell wrapper for event viewer | `./run_viewer.sh` |
| `run_config_generator.py` | Python wrapper for config gen | `python run_config_generator.py` |
| `run_event_viewer.py` | Python wrapper for event viewer | `python run_event_viewer.py -c config.json` |

> **Note:** The standalone scripts (`generate_config.py`, `view_events.py`) work best in IDEs like WebStorm/PyCharm because Ctrl+C signal handling works properly.

---

## Troubleshooting

### Ctrl+C doesn't work in IDE

Use the direct script wrapper instead of the module:
```bash
# Instead of: python -m blankslate.cli.event_viewer
# Use:
python view_events.py -c my-config.json
```

### Device won't open / "open failed" error

A stuck process or the tablet driver may be holding the device:
```bash
./kill_tablet_processes.sh
```

This script will:
- Find all Python tablet processes
- Kill the XTouch driver if running
- Free the device for use
