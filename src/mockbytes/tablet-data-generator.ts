/**
 * Tablet Data Generator
 * Generates realistic mock HID data packets that simulate drawing on a graphics tablet
 * 
 * @module mockbytes
 */

export interface Point {
  x: number;
  y: number;
}

export interface TabletDataPacket {
  reportId: number;
  status: number;
  x: number;
  y: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  buttons: number;
}

export interface DrawingPath {
  points: Point[];
  pressure: number[];
  timestamp: number[];
}

export interface GeneratorConfig {
  maxX: number;
  maxY: number;
  maxPressure: number;  // Maximum pressure value (e.g., 8191 for 13-bit, 16383 for 14-bit)
  reportId: number;
  statusByte: number;
  sampleRate: number; // Hz (samples per second)
  pressureVariation: number; // 0-1, amount of pressure variation
}

/**
 * Generates realistic tablet data packets for testing
 * 
 * Default values are generic; device-specific values should come from config.
 */
export class TabletDataGenerator {
  private config: GeneratorConfig;
  private defaultConfig: GeneratorConfig = {
    maxX: 65535,        // Generic 16-bit max (actual value from config)
    maxY: 65535,        // Generic 16-bit max (actual value from config)
    maxPressure: 8191,  // Generic 13-bit max (actual value from config)
    reportId: 2,        // Most common report ID (actual value from config)
    statusByte: 0xa0,   // Stylus hover (0xa0 = 160)
    sampleRate: 200,    // 200 Hz
    pressureVariation: 0.2,
  };

  // Number of "pen away" packets to add at the end of gestures
  // Increased to 30 to ensure they're captured (150ms at 200Hz)
  private readonly PEN_AWAY_PACKETS = 30;

  // Track last generated packet state for translation
  private lastPacketState: {
    x: number;
    y: number;
    pressure: number;
    tiltX: number;
    tiltY: number;
    status: number;
    button: number; // For tablet buttons (1-8), 0 = none
  } = {
    x: 0,
    y: 0,
    pressure: 0,
    tiltX: 0,
    tiltY: 0,
    status: 0xc0,
    button: 0,
  };

  constructor(config?: Partial<GeneratorConfig>) {
    this.config = { ...this.defaultConfig, ...config };
  }

  /**
   * Get the last packet state as a translated event
   * Returns normalized values (0-1 for x, y, pressure; -1 to 1 for tilt)
   */
  getLastState(): any {
    const status = this.lastPacketState.status;

    // Decode stylus button states from status byte
    // 0xa2 (162) = hover + secondary, 0xa3 (163) = contact + secondary
    // 0xa4 (164) = hover + primary, 0xa5 (165) = contact + primary
    const primaryButtonPressed = (status === 0xa4 || status === 0xa5);
    const secondaryButtonPressed = (status === 0xa2 || status === 0xa3);

    return {
      x: this.lastPacketState.x / this.config.maxX,
      y: this.lastPacketState.y / this.config.maxY,
      pressure: this.lastPacketState.pressure / this.config.maxPressure,
      tiltX: this.lastPacketState.tiltX,
      tiltY: this.lastPacketState.tiltY,
      status: status,
      primaryButtonPressed,
      secondaryButtonPressed,
      button: this.lastPacketState.button, // Tablet button (1-8)
      timestamp: Date.now(),
    };
  }

  /**
   * Generate a single data packet
   * Note: WebHID strips the Report ID from inputreport events, so we don't include it
   */
  generatePacket(x: number, y: number, pressure: number, tiltX = 0, tiltY = 0, statusByteOverride?: number): Uint8Array {
    // Normalize coordinates to device range
    const normalizedX = Math.round((x / 1.0) * this.config.maxX);
    const normalizedY = Math.round((y / 1.0) * this.config.maxY);
    // Pressure is 2-byte, scaled to config max
    const normalizedPressure = Math.round((pressure / 1.0) * this.config.maxPressure);

    // Convert tilt to byte range (-1 to 1 becomes 0-255)
    const tiltXByte = Math.round(((tiltX + 1) / 2) * 255);
    const tiltYByte = Math.round(((tiltY + 1) / 2) * 255);

    // Determine status byte based on pressure if not overridden
    // 0xa0 (160) = hover (no pressure)
    // 0xa1 (161) = contact (with pressure)
    let statusByte = statusByteOverride;
    if (statusByte === undefined) {
      statusByte = normalizedPressure > 0 ? 0xa1 : 0xa0;
    }

    // Store state for translation
    this.lastPacketState = {
      x: normalizedX,
      y: normalizedY,
      pressure: normalizedPressure,
      tiltX,
      tiltY,
      status: statusByte,
      button: 0, // Stylus packets don't have tablet buttons
    };

    // Create HID packet matching XP-Pen Deco 640 structure (without Report ID)
    // WebHID strips the Report ID from inputreport events, so we match that behavior
    const packet = new Uint8Array(9);
    packet[0] = statusByte; // Status byte (hover/contact/buttons)
    packet[1] = normalizedX & 0xff;             // X low byte
    packet[2] = (normalizedX >> 8) & 0xff;      // X high byte
    packet[3] = normalizedY & 0xff;             // Y low byte
    packet[4] = (normalizedY >> 8) & 0xff;      // Y high byte
    packet[5] = normalizedPressure & 0xff;      // Pressure low byte
    packet[6] = (normalizedPressure >> 8) & 0xff; // Pressure high byte
    packet[7] = tiltXByte;                      // Tilt X
    packet[8] = tiltYByte;                      // Tilt Y

    return packet;
  }

  /**
   * Generate a stream of packets following a path
   */
  *generatePath(path: Point[], duration: number): Generator<Uint8Array> {
    const totalSamples = Math.floor((duration / 1000) * this.config.sampleRate);
    const samplesPerPoint = Math.max(1, Math.floor(totalSamples / (path.length - 1)));

    for (let i = 0; i < path.length - 1; i++) {
      const start = path[i];
      const end = path[i + 1];

      // Interpolate between points
      for (let j = 0; j < samplesPerPoint; j++) {
        const t = j / samplesPerPoint;
        const x = start.x + (end.x - start.x) * t;
        const y = start.y + (end.y - start.y) * t;

        // Simulate realistic pressure variation
        const basePressure = this.calculatePressure(t, i / path.length);
        const pressure = this.addPressureVariation(basePressure);

        // Simulate subtle tilt based on direction
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const tiltX = Math.max(-1, Math.min(1, dx * 0.3));
        const tiltY = Math.max(-1, Math.min(1, dy * 0.3));

        yield this.generatePacket(x, y, pressure, tiltX, tiltY);
      }
    }
  }

  /**
   * Generate a circular drawing motion
   */
  *generateCircle(
    centerX: number,
    centerY: number,
    radius: number,
    duration: number
  ): Generator<Uint8Array> {
    const totalSamples = Math.floor((duration / 1000) * this.config.sampleRate);

    for (let i = 0; i < totalSamples; i++) {
      const t = i / totalSamples;
      const angle = t * Math.PI * 2;

      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      const pressure = this.calculatePressure(t, 0);

      // Tilt follows the drawing direction
      const tiltX = Math.cos(angle + Math.PI / 2) * 0.3;
      const tiltY = Math.sin(angle + Math.PI / 2) * 0.3;

      yield this.generatePacket(x, y, pressure, tiltX, tiltY);
    }
  }

  /**
   * Generate a straight line
   */
  *generateLine(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    duration: number
  ): Generator<Uint8Array> {
    const path = [
      { x: startX, y: startY },
      { x: endX, y: endY },
    ];
    yield* this.generatePath(path, duration);
  }

  /**
   * Generate a straight line with constant pressure
   * Useful for isolating coordinate changes without pressure variation
   */
  *generateLineConstantPressure(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    pressure: number,
    duration: number
  ): Generator<Uint8Array> {
    const totalSamples = Math.floor((duration / 1000) * this.config.sampleRate);

    for (let i = 0; i < totalSamples; i++) {
      const t = i / totalSamples;
      const x = startX + (endX - startX) * t;
      const y = startY + (endY - startY) * t;

      yield this.generatePacket(x, y, pressure, 0, 0);
    }

    // Add pen away packets at the end
    for (let i = 0; i < this.PEN_AWAY_PACKETS; i++) {
      yield this.generatePenAwayPacket();
    }
  }

  /**
   * Generate a signature-like scribble
   */
  *generateScribble(
    startX: number,
    startY: number,
    width: number,
    height: number,
    duration: number
  ): Generator<Uint8Array> {
    const points: Point[] = [];
    const numPoints = 20;

    // Generate random but smooth path
    for (let i = 0; i < numPoints; i++) {
      const t = i / (numPoints - 1);
      const x = startX + Math.sin(t * Math.PI * 4) * width * 0.5 + width * t;
      const y = startY + Math.cos(t * Math.PI * 3) * height * 0.5 + height * 0.5;
      points.push({ x, y });
    }

    yield* this.generatePath(points, duration);
  }

  /**
   * Generate a bezier curve
   */
  *generateBezier(
    start: Point,
    control1: Point,
    control2: Point,
    end: Point,
    duration: number
  ): Generator<Uint8Array> {
    const points: Point[] = [];
    const numPoints = 30;

    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const point = this.bezierPoint(t, start, control1, control2, end);
      points.push(point);
    }

    yield* this.generatePath(points, duration);
  }

  /**
   * Calculate realistic pressure based on position in stroke
   */
  private calculatePressure(t: number, strokeProgress: number): number {
    // Pressure starts low, builds up, then tapers off
    let pressure: number;

    if (t < 0.1) {
      // Ramp up at start
      pressure = t / 0.1 * 0.7;
    } else if (t > 0.9) {
      // Taper off at end
      pressure = (1 - t) / 0.1 * 0.7;
    } else {
      // Full pressure in middle
      pressure = 0.7 + Math.sin(strokeProgress * Math.PI * 2) * 0.2;
    }

    return Math.max(0, Math.min(1, pressure));
  }

  /**
   * Add realistic pressure variation
   */
  private addPressureVariation(basePressure: number): number {
    const variation = (Math.random() - 0.5) * this.config.pressureVariation;
    return Math.max(0, Math.min(1, basePressure + variation));
  }

  /**
   * Calculate point on cubic bezier curve
   */
  private bezierPoint(t: number, p0: Point, p1: Point, p2: Point, p3: Point): Point {
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    const uuu = uu * u;
    const ttt = tt * t;

    const x = uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x;
    const y = uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y;

    return { x, y };
  }

  /**
   * Generate hover data (pen near surface but not touching)
   */
  generateHoverPacket(x: number, y: number): Uint8Array {
    return this.generatePacket(x, y, 0, 0, 0);
  }

  /**
   * Generate a "pen away" packet (pen not in detection range)
   * Status byte: 0xc0 (192) = none
   */
  generatePenAwayPacket(): Uint8Array {
    // Store state for translation
    this.lastPacketState = {
      x: 0,
      y: 0,
      pressure: 0,
      tiltX: 0,
      tiltY: 0,
      status: 0xc0,
      button: 0,
    };

    const packet = new Uint8Array(9);
    packet[0] = 0xc0; // Status byte for "none" state
    // All other bytes are 0 (no position, pressure, or tilt data)
    return packet;
  }

  /**
   * Generate a hover line (no pressure)
   */
  *generateHoverLine(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    duration: number
  ): Generator<Uint8Array> {
    const totalSamples = Math.floor((duration / 1000) * this.config.sampleRate);

    for (let i = 0; i < totalSamples; i++) {
      const t = i / totalSamples;
      const x = startX + (endX - startX) * t;
      const y = startY + (endY - startY) * t;

      yield this.generateHoverPacket(x, y);
    }

    // Add pen away packets at the end
    for (let i = 0; i < this.PEN_AWAY_PACKETS; i++) {
      yield this.generatePenAwayPacket();
    }
  }

  /**
   * Generate a line with X tilt variation (tilt goes from -1 to +1)
   */
  *generateTiltXLine(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    duration: number
  ): Generator<Uint8Array> {
    const totalSamples = Math.floor((duration / 1000) * this.config.sampleRate);

    for (let i = 0; i < totalSamples; i++) {
      const t = i / totalSamples;
      const x = startX + (endX - startX) * t;
      const y = startY + (endY - startY) * t;

      // Tilt X varies from -1 to +1 as we move across
      const tiltX = (t * 2) - 1; // Maps 0->1 to -1->+1
      const pressure = 0.7; // Moderate constant pressure

      yield this.generatePacket(x, y, pressure, tiltX, 0);
    }

    // Add pen away packets at the end
    for (let i = 0; i < this.PEN_AWAY_PACKETS; i++) {
      yield this.generatePenAwayPacket();
    }
  }

  /**
   * Generate a line with Y tilt variation (tilt goes from -1 to +1)
   */
  *generateTiltYLine(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    duration: number
  ): Generator<Uint8Array> {
    const totalSamples = Math.floor((duration / 1000) * this.config.sampleRate);

    for (let i = 0; i < totalSamples; i++) {
      const t = i / totalSamples;
      const x = startX + (endX - startX) * t;
      const y = startY + (endY - startY) * t;

      // Tilt Y varies from -1 to +1 as we move across
      const tiltY = (t * 2) - 1; // Maps 0->1 to -1->+1
      const pressure = 0.7; // Moderate constant pressure

      yield this.generatePacket(x, y, pressure, 0, tiltY);
    }

    // Add pen away packets at the end
    for (let i = 0; i < this.PEN_AWAY_PACKETS; i++) {
      yield this.generatePenAwayPacket();
    }
  }

  /**
   * Generate a line with primary button pressed (contact)
   * Status byte: 0xa5 (165) = contact + primary button
   */
  *generatePrimaryButtonLine(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    duration: number
  ): Generator<Uint8Array> {
    const totalSamples = Math.floor((duration / 1000) * this.config.sampleRate);
    const halfSamples = Math.floor(totalSamples / 2);

    for (let i = 0; i < totalSamples; i++) {
      const t = i / totalSamples;
      const x = startX + (endX - startX) * t;
      const y = startY + (endY - startY) * t;

      // First half: hover + primary button (0xa4 = 164)
      // Second half: contact + primary button (0xa5 = 165)
      if (i < halfSamples) {
        // Hover with button pressed
        yield this.generatePacket(x, y, 0, 0, 0, 0xa4);
      } else {
        // Contact with button pressed
        const pressure = 0.7; // Moderate constant pressure
        yield this.generatePacket(x, y, pressure, 0, 0, 0xa5);
      }
    }

    // Add pen away packets at the end
    for (let i = 0; i < this.PEN_AWAY_PACKETS; i++) {
      yield this.generatePenAwayPacket();
    }
  }

  /**
   * Generate a line with secondary button pressed (contact)
   * Status byte: 0xa3 (163) = contact + secondary button
   */
  *generateSecondaryButtonLine(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    duration: number
  ): Generator<Uint8Array> {
    const totalSamples = Math.floor((duration / 1000) * this.config.sampleRate);
    const halfSamples = Math.floor(totalSamples / 2);

    for (let i = 0; i < totalSamples; i++) {
      const t = i / totalSamples;
      const x = startX + (endX - startX) * t;
      const y = startY + (endY - startY) * t;

      // First half: hover + secondary button (0xa2 = 162)
      // Second half: contact + secondary button (0xa3 = 163)
      if (i < halfSamples) {
        // Hover with button pressed
        yield this.generatePacket(x, y, 0, 0, 0, 0xa2);
      } else {
        // Contact with button pressed
        const pressure = 0.7; // Moderate constant pressure
        yield this.generatePacket(x, y, pressure, 0, 0, 0xa3);
      }
    }

    // Add pen away packets at the end
    for (let i = 0; i < this.PEN_AWAY_PACKETS; i++) {
      yield this.generatePenAwayPacket();
    }
  }

  /**
   * Generate button press packet
   * Note: WebHID strips the Report ID, so we don't include it
   * Uses a compact structure with button bit-flags at byte 1
   */
  generateButtonPacket(buttonNumber: number): Uint8Array {
    // Store state for translation
    this.lastPacketState = {
      x: 0,
      y: 0,
      pressure: 0,
      tiltX: 0,
      tiltY: 0,
      status: 0xf0,
      button: buttonNumber, // Store which tablet button is pressed
    };

    const packet = new Uint8Array(11);
    packet[0] = 0xf0; // Button mode status (different from stylus 0xa0)
    packet[1] = 1 << (buttonNumber - 1); // Set button bit in byte 1
    packet[2] = 0;
    packet[3] = 0;
    packet[4] = 0;
    packet[5] = 0;
    packet[6] = 0;
    packet[7] = 0;
    packet[8] = 0;
    packet[9] = 0;
    packet[10] = 0;

    return packet;
  }

  /**
   * Generate a sequence of tablet button presses
   * Simulates pressing each button on the tablet (express keys)
   * This helps detect which byte contains button bit-flags
   */
  *generateTabletButtonSequence(
    buttonCount: number = 8,
    duration: number = 2000
  ): Generator<Uint8Array> {
    const samplesPerButton = Math.floor((duration / 1000) * this.config.sampleRate / buttonCount);

    // Press each button individually
    for (let buttonNum = 1; buttonNum <= buttonCount; buttonNum++) {
      for (let i = 0; i < samplesPerButton; i++) {
        yield this.generateButtonPacket(buttonNum);
      }
    }

    // Add some packets with no buttons pressed at the end
    const noButtonPacket = new Uint8Array(11);
    noButtonPacket[0] = 0xf0; // Button mode status
    for (let i = 0; i < 10; i++) {
      yield noButtonPacket;
    }
  }
}

/**
 * Convenience function to create common drawing patterns
 */
export function createDrawingPattern(
  pattern: 'circle' | 'line' | 'scribble' | 'spiral',
  config?: Partial<GeneratorConfig>
): Generator<Uint8Array> {
  const generator = new TabletDataGenerator(config);

  switch (pattern) {
    case 'circle':
      return generator.generateCircle(0.5, 0.5, 0.3, 2000);
    case 'line':
      return generator.generateLine(0.1, 0.1, 0.9, 0.9, 1000);
    case 'scribble':
      return generator.generateScribble(0.1, 0.4, 0.8, 0.2, 3000);
    case 'spiral':
      return createSpiral(generator);
    default:
      return generator.generateCircle(0.5, 0.5, 0.3, 2000);
  }
}

/**
 * Generate a spiral pattern
 */
function* createSpiral(generator: TabletDataGenerator): Generator<Uint8Array> {
  const points: Point[] = [];
  const numPoints = 50;
  const centerX = 0.5;
  const centerY = 0.5;

  for (let i = 0; i < numPoints; i++) {
    const t = i / numPoints;
    const angle = t * Math.PI * 6;
    const radius = t * 0.4;

    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    points.push({ x, y });
  }

  yield* generator.generatePath(points, 4000);
}