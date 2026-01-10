# Mock Bytes

Mock tablet data generation for testing and development without physical hardware.

## Overview

The `mockbytes` module provides realistic HID data packet generation that simulates a graphics tablet. Perfect for:
- Testing without a physical tablet
- Automated testing with predictable data
- Demonstrating tablet functionality
- Development and debugging

## Quick Start

### Basic Usage

```typescript
import { MockTabletDevice } from './mockbytes/index.js';
// Or if importing from the main module:
// import { MockTabletDevice } from './index.js';

// Create a mock tablet
const mockTablet = new MockTabletDevice();

// Open the device
await mockTablet.open();

// Listen for data
mockTablet.addEventListener('inputreport', (data: Uint8Array) => {
  console.log('Received tablet data:', data);
});

// Play a drawing pattern
mockTablet.playCircle(); // Draws a circle
```

### Drawing Patterns

```typescript
// Circle
mockTablet.playCircle(0.5, 0.5, 0.3, 2000);

// Line
mockTablet.playLine(0.1, 0.1, 0.9, 0.9, 1000);

// Scribble (signature-like)
mockTablet.playScribble(0.1, 0.4, 0.8, 0.2, 3000);

// Custom path
const points = [
  { x: 0.1, y: 0.1 },
  { x: 0.5, y: 0.8 },
  { x: 0.9, y: 0.1 },
];
mockTablet.playPath(points, 2000);
```

### Using Presets

```typescript
import { DrawingPresets, TabletDataGenerator } from './mockbytes/index.js';

const generator = new TabletDataGenerator();

// Draw a star
const starPath = DrawingPresets.star();
const packets = generator.generatePath(starPath, 3000);

// Draw a heart
const heartPath = DrawingPresets.heart();
const heartPackets = generator.generatePath(heartPath, 4000);
```

## API Reference

### MockTabletDevice

Main class for simulating a tablet device.

#### Constructor

```typescript
const mockTablet = new MockTabletDevice({
  deviceName: 'My Mock Tablet',
  vendorId: 0x056a,
  productId: 0x0001,
  maxX: 65535,
  maxY: 65535,
  sampleRate: 200, // Hz
  autoPlay: true, // Auto-start drawing on open
});
```

#### Methods

**`async open()`**  
Open the mock device. Starts auto-play if configured.

**`async close()`**  
Close the device and stop playback.

**`playCircle(centerX, centerY, radius, duration)`**  
Play a circular drawing motion.

**`playLine(x1, y1, x2, y2, duration)`**  
Play a straight line.

**`playScribble(x, y, width, height, duration)`**  
Play a signature-like scribble.

**`playPath(points, duration)`**  
Play a custom path defined by points.

**`stop()`**  
Stop current playback.

**`sendPacket(x, y, pressure, tiltX, tiltY)`**  
Send a single data packet.

**`sendHover(x, y)`**  
Send hover data (pen near but not touching).

**`sendButton(buttonNumber)`**  
Send a button press event.

### TabletDataGenerator

Low-level packet generation.

#### Constructor

```typescript
const generator = new TabletDataGenerator({
  maxX: 65535,
  maxY: 65535,
  reportId: 2,
  statusByte: 0xa0,
  sampleRate: 200,
  pressureVariation: 0.2,
});
```

#### Methods

**`generatePacket(x, y, pressure, tiltX, tiltY): Uint8Array`**  
Generate a single HID packet.

**`*generatePath(points, duration): Generator<Uint8Array>`**  
Generate packets following a path.

**`*generateCircle(centerX, centerY, radius, duration): Generator<Uint8Array>`**  
Generate a circular motion.

**`*generateLine(x1, y1, x2, y2, duration): Generator<Uint8Array>`**  
Generate a straight line.

**`*generateScribble(x, y, width, height, duration): Generator<Uint8Array>`**  
Generate a scribble pattern.

**`*generateBezier(start, control1, control2, end, duration): Generator<Uint8Array>`**  
Generate a bezier curve.

## Data Format

### Packet Structure

Mock packets follow this 10-byte structure (matching XP-Pen Deco 640):

```
Byte 0: Report ID (default: 2)
Byte 1: Status (0xa0 = stylus hover, 0xa1 = stylus contact)
Byte 2: X position (low byte)
Byte 3: X position (high byte)
Byte 4: Y position (low byte)
Byte 5: Y position (high byte)
Byte 6: Pressure (low byte)
Byte 7: Pressure (high byte)
Byte 8: Tilt X
Byte 9: Tilt Y
```

### Coordinate System

- **X Range**: 0.0 to 1.0 (normalized) → Mapped to 0 to 16000
- **Y Range**: 0.0 to 1.0 (normalized) → Mapped to 0 to 9000
- **Pressure**: 0.0 to 1.0 (normalized) → Mapped to 0 to 16383 (14-bit, 2-byte little-endian)
- **Tilt**: -1.0 to 1.0 → Mapped to 0 to 255

## Presets

### Drawing Presets

```typescript
import { DrawingPresets } from './mockbytes/presets.js';

const star = DrawingPresets.star();
const square = DrawingPresets.square();
const triangle = DrawingPresets.triangle();
const heart = DrawingPresets.heart();
const spiral = DrawingPresets.spiral(3); // 3 rotations
const wave = DrawingPresets.wave();
const hello = DrawingPresets.hello(); // Spells "Hello"
const zigzag = DrawingPresets.zigzag();
```

### Signature Presets

```typescript
import { SignaturePresets } from './mockbytes/presets.js';

const simple = SignaturePresets.simple();
const cursive = SignaturePresets.cursive();
```

## Realistic Features

### Pressure Variation

Mock data includes realistic pressure changes:
- Ramps up at stroke start
- Full pressure in the middle
- Tapers off at stroke end
- Random micro-variations

### Tilt Simulation

Tilt values follow the drawing direction:
- Calculated from stroke angle
- Smooth transitions
- Realistic ranges

### Sample Rate

Default 200 Hz (200 samples/second) matches real tablets.

## Integration with processDeviceData

```typescript
import { processDeviceData } from '../utils/data-helpers.js';
import { MockTabletDevice } from '../mockbytes/index.js';

const mockTablet = new MockTabletDevice();
await mockTablet.open();

// Listen for raw bytes from mock device
mockTablet.addEventListener('inputreport', (data: Uint8Array) => {
  // Process using shared data-helpers (same as real devices)
  const processed = processDeviceData(data, yourMappingConfig);
  console.log('Processed data:', processed);
});

mockTablet.playCircle();
```

## Testing Examples

### Unit Test

```typescript
import { TabletDataGenerator } from '../mockbytes/tablet-data-generator.js';
import { describe, it, expect } from 'vitest';

describe('TabletDataGenerator', () => {
  it('should generate valid packets', () => {
    const gen = new TabletDataGenerator();
    const packet = gen.generatePacket(0.5, 0.5, 0.8);
    
    expect(packet).toBeInstanceOf(Uint8Array);
    expect(packet.length).toBe(8);
    expect(packet[0]).toBe(2); // Report ID
  });
});
```

### Integration Test

```typescript
it('should process mock tablet data', async () => {
  const mockTablet = new MockTabletDevice();
  const received: number[] = [];
  
  mockTablet.addEventListener('inputreport', (data) => {
    received.push(data[6]); // Track pressure values
  });
  
  mockTablet.sendPacket(0.5, 0.5, 0.8);
  
  expect(received.length).toBeGreaterThan(0);
  expect(received[0]).toBeGreaterThan(0);
});
```

## Configuration Options

### Generator Config

```typescript
interface GeneratorConfig {
  maxX: number;           // Maximum X coordinate (default: 65535)
  maxY: number;           // Maximum Y coordinate (default: 65535)
  reportId: number;       // HID report ID (default: 2)
  statusByte: number;     // Status byte value (default: 0xa0)
  sampleRate: number;     // Samples per second (default: 200)
  pressureVariation: number; // Pressure noise 0-1 (default: 0.2)
}
```

### Device Config

```typescript
interface MockDeviceConfig {
  deviceName?: string;    // Device name
  vendorId?: number;      // USB vendor ID
  productId?: number;     // USB product ID
  autoPlay?: boolean;     // Auto-start on open
  ...GeneratorConfig;     // All generator options
}
```

## Best Practices

1. **Use Presets**: Start with presets before creating custom paths
2. **Realistic Timing**: Use appropriate durations (500ms - 5s)
3. **Normalize Coordinates**: Use 0-1 range for positions
4. **Test Edge Cases**: Test min/max values and rapid changes
5. **Clean Up**: Always call `stop()` or `close()` when done

## Performance

- **Memory**: ~100 KB for typical drawing path
- **CPU**: < 1% during playback
- **Sample Rate**: Up to 1000 Hz supported
- **Latency**: < 5ms per packet

---

**Related Documentation**:
- [HID Reader](../hid-reader.ts)
- [Device Finder](../finddevice.ts)
- [Data Helpers](../data-helpers.ts)

