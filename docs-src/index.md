---
layout: page.njk
title: Welcome to Blankslate
description: Universal HID tablet configuration toolkit for Node.js, Python, and the Web
---

# Welcome to Blankslate

<p style="margin: 20px 0;">
  <a href="app/" style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 1.1em; box-shadow: 0 2px 8px rgba(0,0,0,0.15);">🚀 Launch the Web App</a>
</p>

Hi, welcome to Blankslate! Much of this project and documentation were done with AI coding tools, but I wanted to
write this introduction myself.

Blankslate is the second iteration of a project I was working on. The human interface device part of that project became
a little to big and confusing, so I broke it out into this project.  

I started with a $30 drawing tablet ([the XPPen Deco 640](https://www.amazon.com/Deco-640-Sensitivity-Battery-Free-Designing/dp/B0D6XZF9N4)) with the goal to 
use like a musical instrument - specifically to strum a guitar like the [Suzuki Omnichord](https://www.suzuki-music.co.jp/special/omnichord_om-108/en/).

Choosing to use a drawing tablet not as a drawing tablet requires reading and interpreting those low level bytes.
I only have this one drawing tablet right now, and if I plan to share what I've done, other drawing tablets need to work.

Unfortunately, it's looking like reading those bytes across tablets will all be different. So in addition to reading a data stream and translating to tablet events,
this project also features a way to generate JSON configuration files that can be used to interpret the raw data into tablet events.

Will this work for your tablet? I don't know! I've just done the one so far.

Blankslate has support for Node.js, Python and Web. Node.js and Python are low level enough that things work pretty well.
Web is based on Chrome's experimental [WebHID API](https://developer.mozilla.org/en-US/docs/Web/API/WebHID_API). There are some restrictions here.
For one, the tablet has some "hot shortcut" keys. The keys are buttons that a user would tap to perform some kind of action. Node.js and Python can easily
read these with the HID interface. I'm seeing that WebHID cannot without the driver app installed/running. Instead, they come in as keyboard events only.

This project supports learning and viewing these buttons as keyboard events for when the driver is not loaded.

It's a quirk, but one that we work around.

## Tablet Modes

For the most part, the same tablet will require the same configuration regardless of how you run it. The bytes will
be interpreted largely the same. When having the tablet's driver app loaded, the tablet could actually send data through
another interface. We can see this with different ReportIDs.

Each configuration file can have multiple modes. Each mode supports reading the different interfaces.

Realistically, when generating a configuration file, you can't have both modes active simultaneously.
So only one mode will be added to your configuration file. Running the configuration utility in a different mode (with the driver or not)
will generate a new configuration file. You can manually drop the new mode into an existing file.

The viewer will see which report ID is being used when connecting and choose the right mode from this array and properly read the tablet event stream.

## Mouse control

Both Node and Python are low level enough that when they connect to the tablet, they get exclusive control.
This means your OS won't control the mouse anymore. This is what I want from this project, otherwise, we could
just use the tablet as a mouse and Blankslate wouldn't even be necessary.

WebHID however, when doing this in a browser only, cannot get exclusive control. This means that while your tablet
is sending events, you'll also be controlling the mouse. At least on OSX, this seems too low level to turn this off in the
OS level settings. Maybe this is better on Windows or Linux.

There is one workaround, and it's a hack. That is, to start the XPPen driver tablet app. This gives the app mouse control, but then when quitting
this driver app, the tablet will still have the mouse being read in this mode. However, without the driver app to intercept,
your mouse no longer moves.


## Summary

To sum up, Blankslate is a utility to read raw byte data from a HID (human interface device) drawing tablet
and translate those events into what the user is actually doing. We can see horizontal and vertical coordinates, pressure,
tilt, and button presses (both hotkeys and stylus buttons).

Blankslate also provides a way to generate JSON configuration files to interpret those raw bytes.
Again, it's only tested on a single tablet, so there will likely be some work to get other tablets working. But for now it's a start! 


### Key Features

- **Cross-Platform**: Works on macOS, Linux, and Windows
- **Multi-Runtime**: Node.js CLI, Python CLI, and WebHID browser app
- **Configuration Generator**: Interactive walkthrough to create configs for any tablet
- **Real-Time Viewer**: Visualize tablet data as you draw
- **WebSocket Server**: Stream tablet events to any application
- **Driver-Independent**: Works with or without manufacturer drivers installed

## Quick Example

With a configuration file, reading tablet data is straightforward:

**Node.js:**
```bash
# View live tablet events
npx tsx src/cli/event-viewer.ts -c config.json --live
```

**Python:**
```bash
# View live tablet events
tablet-events -c config.json --live
```

**Web:**
Open the web app, connect your tablet via WebHID, and see real-time visualization of pen position, pressure, and tilt.

## Use Cases

- **Custom Applications**: Build drawing apps, music controllers, or accessibility tools
- **Tablet Testing**: Verify tablet functionality and calibration
- **Driver Development**: Understand HID protocols for new tablet support
- **Cross-Platform Tools**: Create apps that work identically across platforms

## Getting Started

1. **[Getting Started](/about/getting-started/)** - Quick setup guide
2. **[CLI Tools](/about/cli-overview/)** - Command-line interface for Node.js and Python
3. **[Web Application](/about/web-app/)** - Browser-based tablet viewer and config generator
4. **[Configuration Schema](/about/config-schema/)** - Understanding config files

## Supported Tablets

Blankslate works with any HID-compatible graphics tablet. Currently tested:

- **XP-Pen Deco 640** - Full support with included configuration
- **Huion Inspiroy 2 M (H951P)** - Full support with included configuration (requires `sudo` on macOS for buttons)
- **Other tablets** - Use the config generator walkthrough to create support

## System Requirements

### Node.js
- Node.js 18+ and npm
- Works on macOS, Linux, Windows

### Python
- Python 3.8+
- hidapi library (installed automatically)

### Web
- Chromium-based browser (Chrome, Edge, Brave) for WebHID support
- Firefox and Safari do not support WebHID

## Project Structure

```
blankslate/
├── src/                    # TypeScript source (Node.js + Web)
│   ├── cli/                # CLI tools
│   ├── components/         # Web components (LitElement)
│   ├── core/               # Shared walkthrough engine
│   └── utils/              # Data processing utilities
├── python/                 # Python implementation
│   └── blankslate/         # Python package
├── public/configs/         # Sample tablet configurations
└── docs/                   # This documentation
```

Ready to get started? Head to the [Getting Started](/about/getting-started/) guide!
