# MockHIDReader

A comprehensive mock implementation of the HIDReader that simulates a real graphics tablet (XP-Pen Deco 640) for testing and development purposes.

## Overview

The `MockHIDReader` generates realistic HID device data that matches the byte structure and behavior of a physical graphics tablet. It's perfect for:

- **Development**: Build and test tablet features without physical hardware
- **Testing**: Create automated tests with predictable tablet input
- **Demos**: Showcase tablet functionality in presentations or documentation
- **Debugging**: Isolate and reproduce specific tablet behaviors

## Features

### 📍 Position Control
- X/Y coordinates (normalized 0-1 or device coordinates 0-16000 x 0-9000)
- Smooth transitions between positions
- Hover vs. contact states

### 💪 Pressure Sensitivity
- 16,384 pressure levels (0-16383)
- Normalized pressure input (0-1)
- Pressure variation during drawing

### 🎨 Stylus Tilt
- Tilt X and Y angles (-60° to +60°)
- Smooth tilt transitions
- Realistic tilt encoding matching device specs

### 🖱️ Button Support
- **Stylus buttons**: Primary and secondary buttons
- **Tablet buttons**: All 8 express keys
- Press and hold simulation
- Button state tracking

### ⚡ Performance
- Configurable update rate (default ~60Hz)
- Efficient byte generation
- Real-time data processing

### 🎯 High-Level Commands
- `drawLine()`: Draw between two points
- `hoverTo()`: Move stylus without contact
- `drawCircle()`: Draw circular paths
- `pressStylusButton()`: Simulate stylus button press
- `pressTabletButton()`: Simulate express key press
- `tiltTo()`: Change stylus tilt angle

## Installation

The MockHIDReader is included in the utils package:

```typescript
import { MockHIDReader } from './utils/mock-hid-reader.js';
import { Config } from './models/index.js';
```

## Basic Usage

```typescript
// Load your tablet configuration
const config = await Config.load('/path/to/config.json');

// Create mock reader with data callback
const mockReader = new MockHIDReader(
  { 
    mappings: config.byteCodeMappings, 
    reportId: config.reportId 
  },
  (data) => {
    console.log('Tablet data:', data);
    // data contains: x, y, pressure, state, tiltX, tiltY, buttons, etc.
  }
);

// Start generating data
await mockReader.startReading();

// Interact with the mock tablet
await mockReader.hoverTo(0.5, 0.5, 500); // Hover to center
await mockReader.drawLine(0.8, 0.8, 0.7, 1000); // Draw with 70% pressure

// Clean up
await mockReader.close();
```

## API Reference

### Constructor

```typescript
new MockHIDReader(
  config: HIDConfig,
  dataCallback: HIDDataCallback,
  warningCallback?: WarningCallback
)
```

- **config**: HID configuration with mappings and report ID
- **dataCallback**: Function called with processed tablet data
- **warningCallback**: Optional function for warnings

### Methods

#### State Control

**`setState(options: Partial<MockDeviceOptions>): void`**

Update the mock device state. Options include:
- `isContact`: Boolean - stylus touching tablet
- `x`, `y`: Number (0-1) - normalized position
- `pressure`: Number (0-1) - normalized pressure
- `tiltX`, `tiltY`: Number (-60 to 60) - tilt angles in degrees
- `primaryButton`, `secondaryButton`: Boolean - stylus button states
- `tabletButton`: Number (1-8) or null - which express key is pressed
- `updateInterval`: Number (ms) - data generation rate

**`getState(): Readonly<MockDeviceOptions>`**

Get the current device state.

#### Movement

**`async hoverTo(toX: number, toY: number, duration: number = 300): Promise<void>`**

Smoothly move stylus to position without touching the tablet.

**`async drawLine(toX: number, toY: number, pressure: number = 0.5, duration: number = 500): Promise<void>`**

Draw a line from current position to target with specified pressure.

**`async drawCircle(centerX: number = 0.5, centerY: number = 0.5, radius: number = 0.2, pressure: number = 0.5, duration: number = 2000): Promise<void>`**

Draw a circular path.

#### Stylus Features

**`async tiltTo(tiltX: number, tiltY: number, duration: number = 300): Promise<void>`**

Smoothly transition stylus tilt angles.

**`async pressStylusButton(primary: boolean = true, duration: number = 100): Promise<void>`**

Press and release a stylus button.

#### Tablet Buttons

**`async pressTabletButton(buttonNumber: number, duration: number = 100): Promise<void>`**

Press and release a tablet express key (1-8).

#### Device Control

**`async startReading(): Promise<void>`**

Begin generating mock device data at the configured interval.

**`stop(): void`**

Stop generating data (but don't close).

**`async close(): Promise<void>`**

Stop and clean up the mock device.

#### Advanced

**`getRawReport(): Uint8Array`**

Get the current raw HID report bytes without processing. Useful for testing the data processing pipeline.

## Examples

### Example 1: Basic Drawing

```typescript
const mockReader = new MockHIDReader(config, (data) => {
  console.log(`Position: (${data.x}, ${data.y}), Pressure: ${data.pressure}`);
});

await mockReader.startReading();
await mockReader.hoverTo(0.2, 0.2);
await mockReader.drawLine(0.8, 0.8, 0.7, 1000);
await mockReader.close();
```

### Example 2: Pressure Variation

```typescript
await mockReader.startReading();
await mockReader.hoverTo(0.1, 0.5);
mockReader.setState({ isContact: true });

// Draw with increasing pressure
for (let i = 0; i <= 10; i++) {
  const pressure = i / 10;
  const x = 0.1 + (i * 0.08);
  mockReader.setState({ x, pressure });
  await new Promise(resolve => setTimeout(resolve, 100));
}

mockReader.setState({ isContact: false, pressure: 0 });
```

### Example 3: Tilt Simulation

```typescript
await mockReader.startReading();

// Vertical (no tilt)
await mockReader.tiltTo(0, 0, 300);

// Tilt right
await mockReader.tiltTo(45, 0, 500);

// Tilt forward
await mockReader.tiltTo(0, 45, 500);

// Return to vertical
await mockReader.tiltTo(0, 0, 300);
```

### Example 4: Button Interaction

```typescript
// Stylus buttons
await mockReader.hoverTo(0.5, 0.5);
await mockReader.pressStylusButton(true, 200); // Primary button
await mockReader.pressStylusButton(false, 200); // Secondary button

// Tablet buttons
for (let i = 1; i <= 8; i++) {
  await mockReader.pressTabletButton(i, 150);
  await new Promise(resolve => setTimeout(resolve, 200));
}
```

### Example 5: Complex Animation

```typescript
// Draw a spiral with varying pressure and tilt
const steps = 100;
const maxRadius = 0.3;

for (let i = 0; i <= steps; i++) {
  const t = i / steps;
  const angle = t * Math.PI * 6; // 3 rotations
  const radius = maxRadius * t;
  const x = 0.5 + Math.cos(angle) * radius;
  const y = 0.5 + Math.sin(angle) * radius;
  const pressure = 0.3 + 0.5 * Math.sin(t * Math.PI);
  const tiltX = 20 * Math.cos(angle * 2);
  const tiltY = 20 * Math.sin(angle * 2);

  mockReader.setState({ 
    x, y, pressure, 
    isContact: true,
    tiltX, tiltY 
  });

  await new Promise(resolve => setTimeout(resolve, 20));
}
```

### Example 6: Interactive Control

```typescript
// Create an interactive controller
const controller = {
  mockReader: new MockHIDReader(config, handleData),
  
  moveTo: (x: number, y: number) => {
    controller.mockReader.setState({ x, y });
  },
  
  startDrawing: (pressure: number = 0.5) => {
    controller.mockReader.setState({ isContact: true, pressure });
  },
  
  stopDrawing: () => {
    controller.mockReader.setState({ isContact: false, pressure: 0 });
  },
  
  setTilt: (tiltX: number, tiltY: number) => {
    controller.mockReader.setState({ tiltX, tiltY });
  },
};

await controller.mockReader.startReading();

// Use controller for interactive input
controller.moveTo(0.5, 0.5);
controller.startDrawing(0.7);
controller.moveTo(0.8, 0.8);
controller.stopDrawing();
```

## Device Specifications

The MockHIDReader simulates an **XP-Pen Deco 640** with the following specifications:

- **Resolution**: 16000 x 9000 units
- **Pressure Levels**: 16384 (14-bit)
- **Tilt Range**: ±60 degrees
- **Stylus Buttons**: 2 (primary and secondary)
- **Express Keys**: 8 programmable buttons
- **Report Rate**: Configurable (default ~60Hz)

## Byte Structure

The mock generates realistic HID reports matching the device format:

### Stylus Report (ID 7) - 12 bytes
```
[0]: Report ID (7)
[1]: Status byte (hover/contact/button states)
[2-3]: X position (16-bit little-endian)
[4-5]: Y position (16-bit little-endian)
[6-7]: Pressure (16-bit little-endian)
[8]: Tilt X (signed byte, special encoding)
[9]: Tilt Y (signed byte, special encoding)
[10-11]: Reserved
```

### Button Report (ID 6) - 8 bytes
```
[0]: Report ID (6)
[1]: Status byte (240 for button mode)
[2]: Button number (1-8)
[3-7]: Additional data
```

## Testing

The MockHIDReader integrates seamlessly with your test suite:

```typescript
import { describe, it, expect } from 'vitest';
import { MockHIDReader } from './mock-hid-reader';

describe('Drawing Tests', () => {
  it('should detect drawing', async () => {
    let isDrawing = false;
    
    const mockReader = new MockHIDReader(config, (data) => {
      isDrawing = data.state === 'contact';
    });
    
    await mockReader.startReading();
    await mockReader.drawLine(0.5, 0.5, 0.5, 100);
    
    expect(isDrawing).toBe(true);
    await mockReader.close();
  });
});
```

## Performance Tuning

Adjust the update interval for different scenarios:

```typescript
// High frequency for smooth animations (~120Hz)
mockReader.setState({ updateInterval: 8 });

// Standard frequency (~60Hz)
mockReader.setState({ updateInterval: 16 });

// Low frequency for testing (~30Hz)
mockReader.setState({ updateInterval: 33 });
```

## Differences from Real HIDReader

While MockHIDReader aims for high fidelity, there are some differences:

1. **No actual USB/HID communication**: Data is generated programmatically
2. **Perfect timing**: No USB latency or jitter
3. **Simplified button reports**: Real keyboard event simulation is simplified
4. **No device errors**: Doesn't simulate USB disconnects or read failures

For production use, always test with real hardware!

## See Also

- [HIDReader Documentation](./hid-reader.ts)
- [Data Helpers Documentation](./data-helpers.ts)
- [Example Usage](../examples/mock-hid-reader-usage.ts)
- [Config Model](../models/config.ts)

## Contributing

When enhancing MockHIDReader, ensure:
- Byte structure matches real device output
- High-level methods provide smooth, realistic motion
- State changes are immediate but transitions are smooth
- Documentation is updated with new features


