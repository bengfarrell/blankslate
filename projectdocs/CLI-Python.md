# The Learning Tablet - Python CLI Tools

Command-line tools for configuring and testing HID graphics tablets.

## Installation

Install the Python package:

```bash
cd python
pip install -e .
```

This installs three CLI commands:
- `tablet-config` → Interactive configuration generator
- `tablet-events` → Real-time event viewer
- `tablet-websocket` → WebSocket server for broadcasting tablet events

## Development

### Running Without Installation

For development, you can run the tools directly without installing the package. This is useful for testing changes and debugging in IDEs like WebStorm.

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
python view_events.py -c ../public/configs/xp-pen-deco640-osx-python-nodriver.json --live
python view_events.py -c my-tablet-config.json --mock --live
# or
./run_viewer.sh                        # Shell script wrapper
# or
python run_event_viewer.py -c my-tablet-config.json --live
```

**Why multiple scripts?**
- `generate_config.py` / `view_events.py` - Standalone scripts that work well in IDEs (Ctrl+C works properly)
- `run_config_generator.py` / `run_event_viewer.py` - Simple wrappers for the CLI modules
- `run_config_gen.sh` / `run_viewer.sh` - Shell scripts with automatic venv activation

### Running With Installation

After installing with `pip install -e .`:

```bash
# Interactive configuration generator
python -m thelearningtablet.cli.config_generator
# or
tablet-config

# View tablet events
python -m thelearningtablet.cli.event_viewer -c path/to/config.json --live
# or
tablet-events -c path/to/config.json --live

# Start WebSocket server
python -m thelearningtablet.cli.websocket_server -c path/to/config.json
# or
tablet-websocket -c path/to/config.json
```

## Tools

### Config Generator (`config_generator.py`)

Interactive step-by-step wizard to generate tablet configurations:

```bash
# With installation
tablet-config
tablet-config --mock  # Use mock data for testing

# Without installation (development)
cd python
python generate_config.py
python generate_config.py --mock
```

**Features:**
- Automatic device detection
- Interactive walkthrough for byte mapping detection
- Supports pen position, pressure, tilt, and buttons
- Multi-interface support (pen + keyboard interfaces)
- Mock mode for testing without physical hardware
- Generates JSON config files compatible with all tools

### Event Viewer (`event_viewer.py`)

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

**Features:**
- Real-time event visualization
- Live mode with updating dashboard
- Compact mode for continuous logging
- Raw byte display for debugging
- Calibration warnings for max values
- Mock mode with automatic gesture cycling
- Color-coded output for easy reading

**Display Modes:**
- `--live`: Interactive dashboard with live updates
- `--compact`: Single-line format for each event
- `--raw`: Show raw HID bytes alongside events
- Default: Detailed multi-line format

### WebSocket Server (`websocket_server.py`)

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

## Mock Mode

All tools support `--mock` flag for testing without physical hardware:

```bash
# With installation
tablet-config --mock
tablet-events -c config.json --mock --live
tablet-websocket -c config.json --mock

# Without installation (development)
cd python
python generate_config.py --mock
python view_events.py -c ../public/configs/xp-pen-deco640-osx-python-nodriver.json --mock --live
```

**Mock Features:**
- Config-based packet generation (matches your device's byte structure)
- Automatic gesture cycling (horizontal, vertical, circle, pressure, tilt, buttons)
- Realistic timing and packet rates
- Perfect for development and testing

## Quick Reference

### Development Scripts (No Installation Required)

Located in `python/` directory:

| Script | Purpose | Example |
|--------|---------|---------|
| `generate_config.py` | Generate tablet config | `python generate_config.py --mock` |
| `view_events.py` | View tablet events | `python view_events.py -c config.json --live` |
| `run_config_gen.sh` | Shell wrapper for config gen | `./run_config_gen.sh --mock` |
| `run_viewer.sh` | Shell wrapper for event viewer | `./run_viewer.sh` |
| `run_config_generator.py` | Python wrapper for config gen | `python run_config_generator.py` |
| `run_event_viewer.py` | Python wrapper for event viewer | `python run_event_viewer.py -c config.json` |

**Note:** The standalone scripts (`generate_config.py`, `view_events.py`) work best in IDEs like WebStorm because Ctrl+C signal handling works properly.