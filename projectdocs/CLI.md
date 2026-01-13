# The Learning Tablet - CLI Tools

Command-line tools for configuring and testing HID graphics tablets.

## Development

Run directly with tsx:

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

## Building for npm

Build the CLI for distribution:

```bash
npm run build:cli
```

This compiles to `dist/cli/` and the package.json bin entries point there:

- `tablet-config` → Interactive configuration generator
- `tablet-events` → Real-time event viewer
- `tablet-websocket` → WebSocket server for broadcasting tablet events

## Tools

### Config Generator (`config-generator.ts`)

Interactive step-by-step wizard to generate tablet configurations:

```bash
npx tsx src/cli/config-generator.ts
npx tsx src/cli/config-generator.ts --output my-config.json
npx tsx src/cli/config-generator.ts --mock  # Use mock data for testing
```

### Event Viewer (`event-viewer.ts`)

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

### WebSocket Server (`tablet-websocket-server.ts`)

Broadcast tablet events over WebSocket for remote applications:

```bash
# Start server on default port (8765)
npx tsx src/cli/tablet-websocket-server.ts -c config.json

# Specify custom port
npx tsx src/cli/tablet-websocket-server.ts -c config.json --port 9000

# Use mock data for testing
npx tsx src/cli/tablet-websocket-server.ts -c config.json --mock
```

**Features:**
- Reads HID tablet data using your config file
- Broadcasts high-level tablet events (position, pressure, buttons) over WebSocket
- Supports multiple simultaneous client connections
- Automatic client connection/disconnection handling
- Mock mode for testing without physical hardware

**Event Format:**
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

**Client Example:**
```javascript
const ws = new WebSocket('ws://localhost:8765');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Tablet event:', data);
};
```