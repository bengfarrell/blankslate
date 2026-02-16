---
layout: page.njk
title: Getting Started
description: Quick start guide to install and run Blankslate
---

# Getting Started

Get up and running with Blankslate quickly. Choose your platform and start reading tablet data!

## Prerequisites

Choose your runtime:

| Platform | Requirements |
|----------|-------------|
| **Node.js** | Node.js 18+, npm |
| **Python** | Python 3.8+, pip |
| **Web** | Chrome, Edge, or Brave browser |

## Installation

### Node.js

```bash
# Clone the repository
git clone https://github.com/bengfarrell/blankslate.git
cd blankslate

# Install dependencies
npm install

# Run the event viewer
npm run events -- -c public/configs/xp-pen-deco640.json --live
```

Or install globally:

```bash
npm install -g blankslate

# Then use the CLI commands
tablet-events -c config.json --live
```

### Python

```bash
# Clone the repository
git clone https://github.com/bengfarrell/blankslate.git
cd blankslate/python

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install the package
pip install -e ".[dev,websocket]"

# Run the event viewer
tablet-events -c ../public/configs/xp-pen-deco640.json --live
```

### Web Application

```bash
# Clone and install
git clone https://github.com/bengfarrell/blankslate.git
cd blankslate
npm install

# Start the dev server
npm run dev
```

Open http://localhost:3000 in Chrome, Edge, or Brave.

---

## Quick Test (Mock Mode)

Test without a physical tablet using mock mode:

**Node.js:**
```bash
npm run events -- -c public/configs/xp-pen-deco640.json --mock --live
```

**Python:**
```bash
tablet-events -c ../public/configs/xp-pen-deco640.json --mock --live
```

Mock mode generates realistic tablet data (circles, lines, pressure sweeps) so you can test the tools without hardware.

---

## Connecting a Real Tablet

### 1. Find Your Tablet

**Node.js:**
```bash
# List HID devices with digitizer usage page
node -e "const HID = require('node-hid'); console.log(HID.devices().filter(d => d.usagePage === 13))"
```

**Python:**
```bash
python -c "import hid; print([d for d in hid.enumerate() if d['usage_page'] == 13])"
```

Look for devices with `usage_page: 13` (Digitizer).

### 2. Generate a Configuration

If your tablet isn't in `public/configs/`, generate one:

**Node.js:**
```bash
npm run config
```

**Python:**
```bash
tablet-config-generator
```

The interactive walkthrough guides you through:
1. Connecting your device
2. Drawing horizontal/vertical lines
3. Applying pressure
4. Tilting the stylus
5. Pressing tablet buttons
6. Entering device metadata

### 3. View Tablet Events

```bash
# Node.js
npm run events -- -c your-config.json --live

# Python
tablet-events -c your-config.json --live
```

---

## Common Commands

### Node.js

| Command | Description |
|---------|-------------|
| `npm run dev` | Start web dev server |
| `npm run config` | Generate tablet config |
| `npm run events -- -c config.json --live` | View live events |
| `npm run websocket -- -c config.json` | Start WebSocket server |


### Python

| Command | Description |
|---------|-------------|
| `tablet-config-generator` | Generate tablet config |
| `tablet-events -c config.json --live` | View live events |
| `tablet-websocket -c config.json` | Start WebSocket server |

---

## Troubleshooting

### "Device not found"

- Ensure the tablet is connected via USB
- Check that no other application has exclusive access to the device
- On macOS, grant terminal/IDE permission to access USB devices

### "Open failed" error

The tablet driver or another application may be holding the device:

1. Quit the manufacturer's tablet application (XP-Pen, Wacom, etc.)
2. Try again

### WebHID not working

- Use Chrome, Edge, or Brave (Firefox/Safari don't support WebHID)
- The page must be served over HTTPS or localhost
- Click "Connect" and select your tablet in the browser dialog

---

## Next Steps

- **[CLI Tools](/about/cli-overview/)** - Learn the command-line interface
- **[Configuration Schema](/about/config-schema/)** - Understand config files
- **[Web Application](/about/web-app/)** - Use the browser-based tools
