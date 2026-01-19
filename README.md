# The Learning Tablet

A comprehensive toolkit for reading and processing HID data from graphics tablets, available in both **TypeScript/Node.js** and **Python**.

## 📦 Packages

This repository contains two implementations:

- **[TypeScript/Node.js Package](#nodejs--typescript)** - Web components, CLI tools, and library for Node.js
- **[Python Package](#python)** - CLI tools and library for Python

Both packages share the same core functionality and configuration format.

## 📚 Documentation

All documentation is organized in the [`projectdocs/`](./projectdocs) folder:

- **[Quick Start Guide](./projectdocs/QUICKSTART.md)** - Get up and running in minutes
- **[Python Setup Guide](./projectdocs/PYTHON_SETUP.md)** - Complete Python development setup with venv
- **[Test Coverage](./projectdocs/TEST_COVERAGE.md)** - Comprehensive testing documentation
- **[Component Organization](./projectdocs/COMPONENT_ORGANIZATION.md)** - Architecture and structure guide
- **[Project Structure](./projectdocs/PROJECT_STRUCTURE.md)** - Complete directory organization
- **[Dependencies](./projectdocs/DEPENDENCIES.md)** - Dependency guide and management

→ **[View all documentation](./projectdocs/README.md)**

## 🚀 Features

### Core Features (Both Packages)
- **HID Data Processing** - Parse and interpret raw HID bytes from graphics tablets
- **Byte Detection** - Automatic detection of byte mappings for coordinates, pressure, tilt, and buttons
- **Device Configuration** - JSON-based configuration format for tablet devices
- **Mock Data Generators** - Test without physical hardware
- **CLI Tools** - Command-line utilities for device configuration and event monitoring

### TypeScript/Node.js Specific
- **LitElement Web Components** - Modern, lightweight web components
- **WebHID Integration** - Direct browser access to graphics tablets
- **Interactive Walkthrough** - Guided configuration wizard in the browser
- **WebSocket Server** - Broadcast tablet events over WebSocket

### Python Specific
- **hidapi Integration** - Cross-platform HID device access
- **Async WebSocket Server** - Real-time event broadcasting
- **Simple CLI Tools** - Easy-to-use command-line interface

---

# Node.js / TypeScript

## 📋 Prerequisites

- Node.js 18+ and npm
- A Chromium-based browser (Chrome, Edge, etc.) for WebHID support

## 🛠️ Installation

```bash
npm install thelearningtablet
```

Or for development:

```bash
git clone https://github.com/bengfarrell/thelearningtablet.git
cd thelearningtablet
npm install
```

## 📚 Usage

### As a Library

```typescript
import { Config, analyzeBytes, calculateMultiByteMax } from 'thelearningtablet';

// Load configuration
const config = await Config.load('path/to/config.json');

// Analyze HID packets
const packets: Uint8Array[] = [/* captured packets */];
const analysis = analyzeBytes(packets);

// Find coordinate bytes
const xBytes = getBestGuessBytesByVariance(analysis, 2);
const xMax = calculateMultiByteMax(xBytes.map(b => b.byteIndex), packets);
```

### Web Components

```typescript
import 'thelearningtablet/components';

// Use in HTML
<hid-app></hid-app>
<tablet-visualizer></tablet-visualizer>
```

### CLI Tools

```bash
# Generate device configuration
npx tablet-config

# View tablet events
npx tablet-events -c config.json --live

# Start WebSocket server
npx tablet-websocket -c config.json --port 8765
```

## 🏃 Development

Start the development server with hot module replacement:

```bash
npm run dev
```

The app will open at `http://localhost:3000`

## 🧪 Testing

### Unit Tests (Vitest)

Run unit tests for the tablet services:

```bash
npm test                # Run tests in watch mode
npm run test:ui         # Run with Vitest UI
npm run test:coverage   # Generate coverage report
```

### Integration Tests (Playwright)

Run end-to-end tests for the UI components:

```bash
npm run test:integration        # Run integration tests
npm run test:integration:ui     # Run with Playwright UI
```

Install Playwright browsers (first time only):

```bash
npx playwright install
```

## 🏗️ Building

Build the project for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## 📁 Project Structure

```
thelearningtablet/
├── src/
│   ├── components/           # LitElement web components
│   │   ├── hid-data-reader/  # Main HID data reader component
│   │   ├── bytes-display/    # Byte visualization component
│   │   ├── drawing-canvas/   # Interactive drawing canvas
│   │   └── ...               # Other UI components
│   ├── utils/                # Utility modules
│   │   ├── finddevice.ts     # HID device discovery
│   │   ├── hid-reader.ts     # HID data reading
│   │   ├── data-helpers.ts   # Data parsing utilities
│   │   └── byte-detector.ts  # Byte analysis for config detection
│   ├── models/               # Data models
│   │   └── config.ts         # Tablet configuration model
│   ├── mockbytes/            # Mock tablet simulation
│   └── index.ts              # Public API exports
├── test/
│   ├── unit/                 # Vitest unit tests
│   ├── integration/          # Playwright integration tests
│   └── setup.ts              # Test setup configuration
├── index.html                # App entry point
├── vite.config.ts            # Vite configuration
├── playwright.config.ts      # Playwright configuration
└── tsconfig.json             # TypeScript configuration
```

## 🎨 Components

### `<hid-data-reader>`
Main application component that provides an interactive walkthrough for configuring tablet devices. Guides users through detecting byte mappings for coordinates, pressure, tilt, and buttons.

### `<bytes-display>`
Visualizes raw HID byte data with real-time analysis and labeling of detected byte functions.

### `<drawing-canvas>`
Interactive canvas for drawing with mouse or tablet input.

## 🧩 Core Services

### HIDReader
Handles reading data from HID devices and processing raw data according to configuration mappings.

### DeviceFinder
Manages device discovery, enumeration, and connection via WebHID API.

### Config
Tablet configuration model with serialization/deserialization for loading and saving device configurations.

## 📝 Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm test` - Run unit tests (watch mode)
- `npm run test:coverage` - Run tests with coverage
- `npm run test:integration` - Run Playwright integration tests
- `npm run lint` - Lint TypeScript files
- `npm run format` - Format code with Prettier

## 🌐 Browser Support

This application requires WebHID API support, which is available in:
- Chrome/Edge 89+
- Opera 75+

WebHID is **not** currently supported in Firefox or Safari.

---

# Python

## 📋 Prerequisites

- Python 3.8+
- pip

## 🛠️ Quick Setup

**For complete setup instructions, see [Python Setup Guide](./projectdocs/PYTHON_SETUP.md)**

### Quick Start

```bash
# Navigate to Python directory
cd python

# Run setup script (creates venv and installs everything)
./setup_venv.sh

# Or manually:
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -e ".[dev,websocket,keyboard]"
```

### Verify Installation

```bash
# Test CLI tools
tablet-config --help
tablet-events --help

# Run tests
pytest
```

## 📚 Usage

### As a Library

```python
from thelearningtablet import Config, HIDReader, find_and_open_device

# Load configuration
config = Config.load('path/to/config.json')

# Find and open device
device = find_and_open_device(config.deviceInfo)

# Create reader with callback
def on_tablet_data(data):
    print(f"X: {data.get('x'):.3f}, Y: {data.get('y'):.3f}")
    print(f"Pressure: {data.get('pressure'):.3f}")

reader = HIDReader(device, config, on_tablet_data)

# Start reading
try:
    reader.start_reading()
except KeyboardInterrupt:
    reader.stop()
    reader.close()
```

### CLI Tools

#### Configuration Generator
```bash
tablet-config
tablet-config --output my-config.json
```

#### Event Viewer
```bash
# Live dashboard mode
tablet-events -c config.json --live

# Compact mode
tablet-events -c config.json --compact
```

#### WebSocket Server
```bash
tablet-websocket -c config.json
tablet-websocket -c config.json --port 8765
```

## 🧪 Testing (Python)

```bash
cd python
pip install -e ".[dev]"
pytest
```

## 📁 Python Package Structure

```
python/
├── pyproject.toml              # Modern Python packaging
├── thelearningtablet/
│   ├── __init__.py            # Main package exports
│   ├── core/                  # Core functionality
│   │   ├── data_helpers.py    # Data parsing functions
│   │   ├── hid_reader.py      # HID data reader
│   │   └── byte_detector.py   # Byte detection utilities
│   ├── models/                # Data models
│   │   └── config.py          # Configuration model
│   ├── utils/                 # Utilities
│   │   ├── finddevice.py      # Device discovery
│   │   └── websocket_server.py # WebSocket server
│   └── cli/                   # CLI tools
│       ├── config_generator.py
│       ├── event_viewer.py
│       └── websocket_server.py
```

---

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.