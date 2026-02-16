---
layout: page.njk
title: Sharing Code
description: How to use Blankslate as a library in other projects
---

# Sharing Code with Other Projects

Blankslate is designed to be used as a library by other projects. This guide explains how to import and use Blankslate's modules in your own applications.

## Setup Methods

### Method 1: npm link (Local Development)

For local development when both projects are on your machine:

```bash
# In the blankslate directory
npm run build    # Build the dist/ folder
npm link         # Create global symlink

# In your project directory
npm link blankslate
```

This creates a symlink so changes to blankslate are immediately available.

### Method 2: File Path Dependency

Reference blankslate directly in your `package.json`:

```json
{
  "dependencies": {
    "blankslate": "file:../path/to/blankslate"
  }
}
```

Then run `npm install`.

### Method 3: Git Repository

Install directly from GitHub:

```bash
npm install github:bengfarrell/blankslate
```

Or in `package.json`:

```json
{
  "dependencies": {
    "blankslate": "github:bengfarrell/blankslate"
  }
}
```

### Method 4: npm Registry

Once published to npm:

```bash
npm install blankslate
```

---

## Available Exports

Blankslate provides multiple entry points for different use cases:

### Main Entry (`blankslate`)

```typescript
import { 
  Config,
  analyzeBytes,
  processDeviceData,
  calculateMultiByteMax,
  getBestGuessBytesByVariance
} from 'blankslate';
```

Includes utilities, models, mock devices, and walkthrough strings.

### Core Module (`blankslate/core`)

```typescript
import {
  // Walkthrough engine
  WalkthroughEngine,
  WalkthroughController,

  // HID interfaces
  IHIDReader,
  MockHIDReader,

  // Data processing
  processDeviceData,
  analyzeBytes,
  generateCompleteConfig,

  // Mock data
  TabletDataGenerator,

  // Config
  Config
} from 'blankslate/core';
```

Platform-agnostic code for both browser and Node.js environments.

### Models (`blankslate/models`)

```typescript
import { Config } from 'blankslate/models';

const config = await Config.load('path/to/config.json');
```

### Utilities (`blankslate/utils`)

```typescript
import {
  analyzeBytes,
  processDeviceData,
  getBestGuessBytesByVariance,
  calculateMultiByteMax,
  MockHIDReader
} from 'blankslate/utils';
```

### Web Components (`blankslate/components`)

```typescript
// Import all components
import 'blankslate/components';

// Or import specific components
import { TabletVisualizer } from 'blankslate/components';
import { HidDashboard } from 'blankslate/components';
import { BytesDisplay } from 'blankslate/components';
```

### CLI Modules (`blankslate/cli/*`)

For Node.js applications that need HID device access:

```typescript
import { TabletReaderBase } from 'blankslate/cli/tablet-reader-base';
import { NodeHIDReader, MultiInterfaceReader } from 'blankslate/cli/node-hid-reader';
```

---

## Usage Examples

### Reading Tablet Data (Node.js)

```typescript
import { Config } from 'blankslate/models';
import { processDeviceData } from 'blankslate/utils';
import { NodeHIDDeviceManager, MultiInterfaceReader } from 'blankslate/cli/node-hid-reader';

// Load configuration
const config = await Config.load('./my-tablet-config.json');
const mode = config.modes[0]; // Get first mode configuration

// Create HID device manager and find device
const manager = new NodeHIDDeviceManager();
const devices = await manager.listDevices({
  vendorId: config.deviceInfo.vendor_id,
  productId: config.deviceInfo.product_id
});

// Open the device
const reader = new MultiInterfaceReader(devices);
await reader.open();

// Process incoming data using mode's byte mappings
reader.onData((bytes: Uint8Array) => {
  const event = processDeviceData(bytes, mode.byteCodeMappings, 0);
  console.log(`X: ${event.x}, Y: ${event.y}, Pressure: ${event.pressure}`);
});

reader.startReading();
```

### Using Web Components

```typescript
import { TabletVisualizer } from 'blankslate/components';
import { Config } from 'blankslate/models';

// Components auto-register their custom elements
// Use in HTML:
// <tablet-visualizer></tablet-visualizer>

// Or create programmatically
const visualizer = document.createElement('tablet-visualizer');
visualizer.config = await Config.load('./config.json');
document.body.appendChild(visualizer);
```

### Using the Walkthrough Engine

```typescript
import { 
  WalkthroughEngine, 
  WalkthroughController,
  MockHIDReader 
} from 'blankslate/core';

// Create a mock reader for testing
const mockReader = new MockHIDReader(mockConfig);

// Create walkthrough controller
const controller = new WalkthroughController(
  myViewImplementation,  // Implements IWalkthroughView
  mockReader,
  { packetIncludesReportId: true }
);

// Start the walkthrough
controller.start();
```

### Mock Data for Testing

```typescript
import { TabletDataGenerator, PRESETS } from 'blankslate/core';
import { MockHIDReader } from 'blankslate/utils';

// Create a data generator with a preset
const generator = new TabletDataGenerator(PRESETS.XP_PEN_DECO_640);

// Generate mock packets
const packet = generator.generatePacket({
  x: 0.5,
  y: 0.5,
  pressure: 0.8
});

// Or use MockHIDReader for continuous data
const mockReader = new MockHIDReader(config);
mockReader.onData((bytes) => {
  // Process mock tablet data
});
mockReader.start();
```

---

## TypeScript Support

All exports include TypeScript type definitions. Import types as needed:

```typescript
import type { 
  DeviceByteCodeMappings,
  ByteAnalysis,
  TabletEvent,
  WalkthroughStep,
  WalkthroughState
} from 'blankslate/core';

import type { ConfigJSON } from 'blankslate/models';
```

---

## Building Before Use

Before using blankslate as a dependency, ensure it's built:

```bash
cd blankslate
npm install
npm run build
```

This generates the `dist/` folder with compiled JavaScript and type definitions.

---

## Troubleshooting

### "Cannot find module 'blankslate'"

Ensure you've run `npm run build` in the blankslate directory and that the link/dependency is properly set up.

### Type errors with imports

Make sure your `tsconfig.json` has:

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler",  // or "node16"
    "esModuleInterop": true
  }
}
```

### Web components not rendering

Web components must be imported before use. Import at your app's entry point:

```typescript
// main.ts or index.ts
import 'blankslate/components';
```

### Node.js HID errors

The `node-hid` library requires native compilation. If you see build errors:

```bash
npm rebuild node-hid
```

On macOS, you may need to grant terminal/IDE permissions in System Preferences → Security & Privacy → Input Monitoring.
