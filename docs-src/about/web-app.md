---
layout: page.njk
title: Web Application
description: Browser-based tablet viewer and configuration tool
---

# Web Application

The Blankslate web application provides a browser-based interface for connecting to tablets, viewing real-time data, and generating configuration files.

## Quick Start

```bash
# Start the dev server
npm run dev
```

Open http://localhost:3000 in Chrome, Edge, or Brave.

---

## Features

### Real-Time Dashboard

The dashboard displays live tablet data:

- **Pen Position**: X/Y coordinates with visual indicator
- **Pressure**: Current pressure level with bar graph
- **Tilt**: X/Y tilt angles
- **Buttons**: Pen and tablet button states
- **Raw Bytes**: Live HID packet visualization

### Configuration Walkthrough

Interactive step-by-step wizard to generate tablet configs:

1. **Connect Device**: Select your tablet from the WebHID dialog
2. **Detect X Axis**: Draw horizontal lines
3. **Detect Y Axis**: Draw vertical lines
4. **Detect Pressure**: Apply varying pressure
5. **Detect Tilt**: Tilt the stylus
6. **Detect Buttons**: Press tablet buttons
7. **Enter Metadata**: Name, manufacturer, model
8. **Export Config**: Download JSON file

### Drawing Canvas

Test your tablet with a simple drawing surface:

- Pressure-sensitive brush
- Tilt-responsive angle
- Clear canvas button

---

## Browser Requirements

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome | ✅ Full | Recommended |
| Edge | ✅ Full | Chromium-based |
| Brave | ✅ Full | Chromium-based |
| Firefox | ❌ None | No WebHID support |
| Safari | ❌ None | No WebHID support |

> **Note:** WebHID requires HTTPS in production. Localhost works without HTTPS.

---

## Connecting a Tablet

### First-Time Connection

1. Click the **Connect** button
2. A browser dialog appears listing HID devices
3. Select your tablet from the list
4. Click **Connect** in the dialog

### Permissions

- Permission is granted per-device, per-origin
- The browser remembers your choice
- You can revoke permissions in browser settings

### Troubleshooting Connection

**Device not appearing in list:**
- Ensure the tablet is connected via USB
- Try unplugging and reconnecting
- Check that no other application has exclusive access

**"Access denied" error:**
- Close other applications using the tablet
- Quit the manufacturer's driver software
- Restart the browser

---

## Using the Dashboard

### Pen Position

The position display shows:
- **X**: Horizontal position (0.0 to 1.0)
- **Y**: Vertical position (0.0 to 1.0)
- **Visual indicator**: Dot showing pen location

### Pressure

- **Bar graph**: Visual pressure level
- **Numeric value**: 0.0 (no pressure) to 1.0 (max pressure)
- **Levels**: Shows raw pressure value and max

### Tilt

- **X Tilt**: Left/right angle (-1.0 to 1.0)
- **Y Tilt**: Forward/back angle (-1.0 to 1.0)
- **Visual indicator**: Shows tilt direction

### Buttons

- **Pen buttons**: Primary and secondary barrel buttons
- **Tablet buttons**: Express keys on the tablet
- **Visual indicators**: Light up when pressed

### Raw Bytes

- **Hex display**: Current packet in hexadecimal
- **Byte highlighting**: Changed bytes highlighted
- **Report ID**: Shown separately

---

## Configuration Walkthrough

### Starting the Walkthrough

1. Connect your tablet
2. Click **Generate Config** or **Walkthrough**
3. Follow the on-screen instructions

### Step-by-Step Process

#### 1. Connect Device
Select your tablet from the WebHID dialog.

#### 2. Detect X Axis
- Draw horizontal lines across the tablet
- The walkthrough detects which bytes change
- Confirms the X coordinate mapping

#### 3. Detect Y Axis
- Draw vertical lines up and down
- Detects Y coordinate bytes
- Confirms the Y coordinate mapping

#### 4. Detect Pressure
- Press lightly, then firmly
- Detects pressure bytes
- Confirms pressure range

#### 5. Detect Tilt (if supported)
- Tilt the stylus left/right
- Tilt forward/back
- Detects tilt bytes and ranges

#### 6. Detect Buttons
- Press each tablet button
- Records button scan codes
- Maps buttons to indices

#### 7. Enter Metadata
- Device name
- Manufacturer
- Model number
- Description

#### 8. Export Config
- Review the generated config
- Download as JSON file
- Use with CLI tools or web app

---

## Mock Mode

Test the web app without a physical tablet:

1. Open the app
2. Click **Use Mock Device** (or add `?mock=true` to URL)
3. The mock generates realistic tablet data

Mock patterns include:
- Circular movements
- Horizontal/vertical lines
- Pressure sweeps
- Tilt variations
- Button presses

---

## Loading Existing Configs

### From File

1. Click **Load Config**
2. Select a JSON config file
3. The app uses the config for data interpretation

### From URL

Add the config URL as a query parameter:
```
http://localhost:3000?config=path/to/config.json
```

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `C` | Connect device |
| `D` | Toggle dashboard |
| `W` | Start walkthrough |
| `M` | Toggle mock mode |
| `R` | Toggle raw bytes |
| `Esc` | Cancel current action |

---

## Troubleshooting

### Tablet moves mouse cursor

This is expected behavior. WebHID cannot prevent the tablet from controlling the system cursor. See [Known Limitations](/about/limitations/) for workarounds.

### Data looks wrong

- Verify you're using the correct config file
- Check that the tablet is in the expected mode (driver vs. driverless)
- Try regenerating the config

### High latency

- Close other browser tabs
- Disable browser extensions
- Check CPU usage

### Walkthrough detection fails

- Move the pen more slowly
- Make larger movements
- Ensure good contact with the tablet surface
