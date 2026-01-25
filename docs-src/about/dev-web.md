---
layout: page.njk
title: Web Development
description: Setting up web development environment
---

# Web Development Setup

Guide for developing the browser-based web application.

## Prerequisites

- Node.js 18+ and npm
- Chromium-based browser (Chrome, Edge, Brave)

## Quick Start

```bash
# Clone and install
git clone https://github.com/bengfarrell/blankslate.git
cd blankslate
npm install

# Start dev server
npm run dev
```

Open http://localhost:3000 in your browser.

---

## Technology Stack

| Technology | Purpose |
|------------|---------|
| **Vite** | Dev server, bundler, HMR |
| **LitElement** | Web components |
| **TypeScript** | Type safety |
| **WebHID** | Browser HID API |
| **Spectrum Web Components** | UI components |

---

## Project Structure

```
src/
├── components/              # LitElement web components
│   ├── hid-data-reader/     # Main HID reader component
│   ├── hid-dashboard/       # Dashboard view
│   ├── hid-walkthrough/     # Config walkthrough
│   ├── bytes-display/       # Byte visualization
│   ├── drawing-canvas/      # Drawing surface
│   └── tablet-visualizer/   # Tablet visualization
├── core/
│   ├── hid/                 # HID interfaces
│   └── walkthrough/         # Walkthrough engine
├── utils/
│   ├── finddevice.ts        # WebHID device discovery
│   ├── data-helpers.ts      # Data processing
│   └── byte-detector.ts     # Byte analysis
├── mockbytes/               # Mock tablet simulation
└── index.ts                 # Public API
```

---

## Component Architecture

### Main Components

| Component | Description |
|-----------|-------------|
| `<hid-data-reader>` | Main app shell, manages device connection |
| `<hid-dashboard>` | Real-time tablet data visualization |
| `<hid-walkthrough>` | Step-by-step config generator |
| `<bytes-display>` | Raw byte visualization |
| `<tablet-visualizer>` | SVG tablet representation |

### Component Pattern

Each component follows this structure:

```
src/components/component-name/
├── component-name.ts        # Component logic
└── component-name.styles.ts # Separated CSS styles
```

Example component:

```typescript
import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { styles } from './my-component.styles.js';

@customElement('my-component')
export class MyComponent extends LitElement {
  static styles = styles;

  @property({ type: String })
  name = 'World';

  render() {
    return html`<p>Hello, ${this.name}!</p>`;
  }
}
```

---

## WebHID Integration

### Device Discovery

```typescript
import { findDevice, openDevice } from './utils/finddevice.js';

// Request device access
const device = await findDevice();

// Open the device
await openDevice(device);

// Listen for input reports
device.addEventListener('inputreport', (event) => {
  const bytes = new Uint8Array(event.data.buffer);
  console.log('Received:', bytes);
});
```

### Multi-Interface Support

Some tablets expose multiple HID interfaces:

```typescript
import { MultiInterfaceManager } from './utils/finddevice.js';

const manager = new MultiInterfaceManager();
await manager.connect();

manager.on('data', (bytes, interfaceId) => {
  console.log(`Interface ${interfaceId}:`, bytes);
});
```

---

## Mock Mode

For development without a physical tablet:

```typescript
import { MockTabletDevice } from './mockbytes/mock-tablet-device.js';

const mock = new MockTabletDevice(config);
mock.start();

mock.addEventListener('inputreport', (event) => {
  // Same API as real WebHID device
});
```

The mock generates realistic patterns:
- Circular movements
- Horizontal/vertical lines
- Pressure sweeps
- Tilt variations
- Button presses

---

## Development Workflow

### Hot Module Replacement

Vite provides instant updates:

1. Edit a component file
2. Save
3. Browser updates automatically (no refresh needed)

### Debugging

1. Open Chrome DevTools (F12)
2. Use the Elements panel to inspect web components
3. Use the Console for logging
4. Use the Network panel to monitor WebHID

### Testing Components

```bash
# Unit tests
npm test

# Integration tests (requires Playwright)
npm run test:integration
```

---

## Building for Production

```bash
npm run build
```

Output goes to `dist/`:
- `dist/index.js` - Bundled library
- `dist/index.d.ts` - TypeScript definitions

---

## Browser Compatibility

| Feature | Chrome | Edge | Brave | Firefox | Safari |
|---------|--------|------|-------|---------|--------|
| WebHID | ✅ | ✅ | ✅ | ❌ | ❌ |
| Web Components | ✅ | ✅ | ✅ | ✅ | ✅ |

> **Note:** WebHID requires HTTPS in production. Localhost works without HTTPS.

---

## Common Tasks

### Adding a New Component

1. Create folder: `src/components/my-component/`
2. Create files:
   - `my-component.ts` - Component logic
   - `my-component.styles.ts` - Styles
3. Export from `src/index.ts`
4. Add tests in `test/unit/`

### Modifying the Walkthrough

The walkthrough engine is in `src/core/walkthrough/`:

- `walkthrough-engine.ts` - State machine
- `walkthrough-controller.ts` - High-level API
- `walkthrough-types.ts` - Type definitions

UI strings are in `src/strings/walkthrough-strings.ts`.

### Adding Mock Patterns

Edit `src/mockbytes/tablet-data-generator.ts` to add new gesture patterns.

---

## Troubleshooting

### WebHID not available

- Use Chrome, Edge, or Brave
- Ensure HTTPS or localhost
- Check browser permissions

### Component not rendering

- Check for JavaScript errors in console
- Verify the component is registered (`@customElement`)
- Check that styles are imported

### HMR not working

- Check Vite console for errors
- Try hard refresh (Ctrl+Shift+R)
- Restart dev server
