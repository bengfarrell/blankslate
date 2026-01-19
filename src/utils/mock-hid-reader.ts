/**
 * Mock HID Reader Module
 * Simulates a real HID device for testing and development
 * Generates realistic device data that can be processed by processDeviceData
 * 
 * Defaults are generic values; actual device specs come from the provided config.
 */

import { processDeviceData } from './data-helpers.js';
import type { Config } from '../models/index.js';

/**
 * Configuration for the mock HID reader
 */
export interface HIDConfig {
    mappings: Record<string, any> | Config['byteCodeMappings'];
    reportId?: number;
}

/**
 * Callback for processed HID data
 */
export type HIDDataCallback = (data: Record<string, string | number | boolean>) => void;

/**
 * Callback for warnings during data processing
 */
export type WarningCallback = (message: string) => void;

/**
 * Configuration options for mock device behavior
 */
export interface MockDeviceOptions {
  /** Whether the stylus is in contact with the tablet (vs hovering) */
  isContact?: boolean;
  /** X position (0-1, normalized) */
  x?: number;
  /** Y position (0-1, normalized) */
  y?: number;
  /** Pressure (0-1, normalized) */
  pressure?: number;
  /** Tilt X angle in degrees (-60 to 60) */
  tiltX?: number;
  /** Tilt Y angle in degrees (-60 to 60) */
  tiltY?: number;
  /** Primary stylus button pressed */
  primaryButton?: boolean;
  /** Secondary stylus button pressed */
  secondaryButton?: boolean;
  /** Which tablet button is pressed (1-8), or null for none */
  tabletButton?: number | null;
  /** Update interval in milliseconds */
  updateInterval?: number;
}

/**
 * Mock HID Reader that simulates XP-Pen Deco 640 tablet
 * Generates realistic byte data matching the device's HID report format
 */
export class MockHIDReader {
  private config: HIDConfig;
  private dataCallback: HIDDataCallback;
  private isRunning: boolean = false;
  private intervalId?: number;
  
  // Mock device state
  private state: Required<MockDeviceOptions> = {
    isContact: false,
    x: 0.5,
    y: 0.5,
    pressure: 0,
    tiltX: 0,
    tiltY: 0,
    primaryButton: false,
    secondaryButton: false,
    tabletButton: null,
    updateInterval: 16, // ~60Hz
  };

  // Device specifications - populated from config in constructor
  // Defaults are generic values that work for most tablets
  private specs = {
    reportId: 2,              // Most common report ID (will be read from config)
    buttonReportId: 6,        // Common button interface report ID
    maxX: 65535,              // Generic 16-bit max (will be read from config)
    maxY: 65535,              // Generic 16-bit max (will be read from config)
    maxPressure: 8191,        // Generic 13-bit max (will be read from config)
    tiltRange: { positive: 60, negativeMin: 196, negativeMax: 256 },
    // Common status codes (HID Digitizer standard values)
    statusCodes: {
      none: 192,              // 0xC0
      hover: 160,             // 0xA0
      hoverSecondary: 162,    // 0xA2
      hoverPrimary: 164,      // 0xA4
      contact: 161,           // 0xA1
      contactSecondary: 163,  // 0xA3
      contactPrimary: 165,    // 0xA5
      buttons: 240,           // 0xF0
    },
  };

  constructor(
    config: HIDConfig,
    dataCallback: HIDDataCallback,
    _warningCallback?: WarningCallback
  ) {
    this.config = config;
    this.dataCallback = dataCallback;
    
    // Populate specs from config (use defaults if not specified)
    const mappings = config.mappings as Record<string, any>;
    if (config.reportId !== undefined) {
      this.specs.reportId = config.reportId;
    }
    if (mappings?.x?.max !== undefined) {
      this.specs.maxX = mappings.x.max;
    }
    if (mappings?.y?.max !== undefined) {
      this.specs.maxY = mappings.y.max;
    }
    if (mappings?.pressure?.max !== undefined) {
      this.specs.maxPressure = mappings.pressure.max;
    }
  }

  /**
   * Update the mock device state
   * @param options Partial state updates
   */
  setState(options: Partial<MockDeviceOptions>): void {
    Object.assign(this.state, options);
  }

  /**
   * Get the current mock device state
   */
  getState(): Readonly<MockDeviceOptions> {
    return { ...this.state };
  }

  /**
   * Generate a status byte based on current state
   */
  private getStatusByte(): number {
    const { isContact, primaryButton, secondaryButton } = this.state;
    const { statusCodes } = this.specs;

    if (isContact) {
      if (primaryButton) return statusCodes.contactPrimary;
      if (secondaryButton) return statusCodes.contactSecondary;
      return statusCodes.contact;
    } else {
      if (primaryButton) return statusCodes.hoverPrimary;
      if (secondaryButton) return statusCodes.hoverSecondary;
      return statusCodes.hover;
    }
  }

  /**
   * Convert normalized position (0-1) to device coordinates
   */
  private normalizedToDeviceCoords(normalized: number, max: number): number {
    return Math.round(Math.max(0, Math.min(1, normalized)) * max);
  }

  /**
   * Convert angle in degrees to device tilt value
   */
  private angleToDeviceTilt(angle: number): number {
    // Clamp angle to valid range
    const clampedAngle = Math.max(-60, Math.min(60, angle));
    
    if (clampedAngle >= 0) {
      // Positive range: 0-60 degrees
      return Math.round(clampedAngle);
    } else {
      // Negative range: 196-256 (wraps around from 256)
      // -60 degrees = 196, 0 degrees = 256
      return Math.round(256 + clampedAngle);
    }
  }

  /**
   * Write a 16-bit little-endian value to byte array
   */
  private writeUint16LE(buffer: number[], offset: number, value: number): void {
    buffer[offset] = value & 0xFF;
    buffer[offset + 1] = (value >> 8) & 0xFF;
  }

  /**
   * Generate stylus data report (Report ID 7)
   */
  private generateStylusReport(): Uint8Array {
    const buffer = new Array(12).fill(0); // 12 bytes for stylus report

    // Byte 0: Report ID
    buffer[0] = this.specs.reportId;

    // Byte 1: Status code
    buffer[1] = this.getStatusByte();

    // Bytes 2-3: X position (little endian)
    const xCoord = this.normalizedToDeviceCoords(this.state.x, this.specs.maxX);
    this.writeUint16LE(buffer, 2, xCoord);

    // Bytes 4-5: Y position (little endian)
    const yCoord = this.normalizedToDeviceCoords(this.state.y, this.specs.maxY);
    this.writeUint16LE(buffer, 4, yCoord);

    // Bytes 6-7: Pressure (little endian)
    const pressure = this.state.isContact 
      ? this.normalizedToDeviceCoords(this.state.pressure, this.specs.maxPressure)
      : 0;
    this.writeUint16LE(buffer, 6, pressure);

    // Byte 8: Tilt X
    buffer[8] = this.angleToDeviceTilt(this.state.tiltX);

    // Byte 9: Tilt Y
    buffer[9] = this.angleToDeviceTilt(this.state.tiltY);

    // Bytes 10-11: Reserved/unused
    buffer[10] = 0;
    buffer[11] = 0;

    return new Uint8Array(buffer);
  }

  /**
   * Generate button data report (Report ID 6)
   */
  private generateButtonReport(): Uint8Array {
    const buffer = new Array(8).fill(0); // 8 bytes for button report

    // Byte 0: Report ID
    buffer[0] = this.specs.buttonReportId;

    // Byte 1: Status code for buttons mode
    buffer[1] = this.specs.statusCodes.buttons;

    // Byte 2: Button number (if any pressed)
    if (this.state.tabletButton !== null) {
      buffer[2] = this.state.tabletButton;
    }

    // Rest of the bytes are typically used for keyboard event simulation
    // but we'll keep them simple for the mock
    return new Uint8Array(buffer);
  }

  /**
   * Process mock device data and call the callback
   */
  private sendMockData(): void {
    let report: Uint8Array;

    // If a tablet button is pressed, send button report
    if (this.state.tabletButton !== null) {
      report = this.generateButtonReport();
    } else {
      // Otherwise send stylus report
      report = this.generateStylusReport();
    }

    // Process the data using the same pipeline as real device
    const processedData = processDeviceData(report, this.config.mappings);

    // Call the callback with processed data
    if (this.dataCallback) {
      this.dataCallback(processedData);
    }
  }

  /**
   * Start generating mock device data at regular intervals
   */
  async startReading(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Send initial data
    this.sendMockData();

    // Set up interval to send data periodically
    this.intervalId = window.setInterval(() => {
      if (this.isRunning) {
        this.sendMockData();
      }
    }, this.state.updateInterval);
  }

  /**
   * Stop generating mock device data
   */
  stop(): void {
    console.log('[MockHID] Stopping mock HID reader...');
    this.isRunning = false;
    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * Close the mock device (cleanup)
   */
  async close(): Promise<void> {
    console.log('[MockHID] Closing mock HID device...');
    this.stop();
    console.log('[MockHID] Mock HID device closed successfully');
  }

  /**
   * Simulate drawing a line from current position to target
   * @param toX Target X position (0-1)
   * @param toY Target Y position (0-1)
   * @param pressure Drawing pressure (0-1)
   * @param duration Duration in milliseconds
   */
  async drawLine(toX: number, toY: number, pressure: number = 0.5, duration: number = 500): Promise<void> {
    const startX = this.state.x;
    const startY = this.state.y;
    const steps = Math.ceil(duration / this.state.updateInterval);
    
    this.setState({ isContact: true, pressure });

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = startX + (toX - startX) * t;
      const y = startY + (toY - startY) * t;
      this.setState({ x, y });
      await new Promise(resolve => setTimeout(resolve, this.state.updateInterval));
    }
  }

  /**
   * Simulate hovering to a position
   * @param toX Target X position (0-1)
   * @param toY Target Y position (0-1)
   * @param duration Duration in milliseconds
   */
  async hoverTo(toX: number, toY: number, duration: number = 300): Promise<void> {
    const startX = this.state.x;
    const startY = this.state.y;
    const steps = Math.ceil(duration / this.state.updateInterval);
    
    this.setState({ isContact: false, pressure: 0 });

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = startX + (toX - startX) * t;
      const y = startY + (toY - startY) * t;
      this.setState({ x, y });
      await new Promise(resolve => setTimeout(resolve, this.state.updateInterval));
    }
  }

  /**
   * Simulate drawing a circle
   * @param centerX Center X position (0-1)
   * @param centerY Center Y position (0-1)
   * @param radius Radius (0-1)
   * @param pressure Drawing pressure (0-1)
   * @param duration Duration in milliseconds
   */
  async drawCircle(
    centerX: number = 0.5,
    centerY: number = 0.5,
    radius: number = 0.2,
    pressure: number = 0.5,
    duration: number = 2000
  ): Promise<void> {
    const steps = Math.ceil(duration / this.state.updateInterval);
    
    // Move to start of circle
    await this.hoverTo(centerX + radius, centerY);
    this.setState({ isContact: true, pressure });

    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      this.setState({ x, y });
      await new Promise(resolve => setTimeout(resolve, this.state.updateInterval));
    }

    this.setState({ isContact: false, pressure: 0 });
  }

  /**
   * Simulate pressing a tablet button
   * @param buttonNumber Button number (1-8)
   * @param duration How long to hold the button (ms)
   */
  async pressTabletButton(buttonNumber: number, duration: number = 100): Promise<void> {
    if (buttonNumber < 1 || buttonNumber > 8) {
      throw new Error('Button number must be between 1 and 8');
    }

    this.setState({ tabletButton: buttonNumber });
    await new Promise(resolve => setTimeout(resolve, duration));
    this.setState({ tabletButton: null });
  }

  /**
   * Simulate pressing a stylus button
   * @param primary True for primary button, false for secondary
   * @param duration How long to hold the button (ms)
   */
  async pressStylusButton(primary: boolean = true, duration: number = 100): Promise<void> {
    if (primary) {
      this.setState({ primaryButton: true });
      await new Promise(resolve => setTimeout(resolve, duration));
      this.setState({ primaryButton: false });
    } else {
      this.setState({ secondaryButton: true });
      await new Promise(resolve => setTimeout(resolve, duration));
      this.setState({ secondaryButton: false });
    }
  }

  /**
   * Simulate tilting the stylus
   * @param tiltX Tilt X angle in degrees (-60 to 60)
   * @param tiltY Tilt Y angle in degrees (-60 to 60)
   * @param duration Duration to transition (ms)
   */
  async tiltTo(tiltX: number, tiltY: number, duration: number = 300): Promise<void> {
    const startTiltX = this.state.tiltX;
    const startTiltY = this.state.tiltY;
    const steps = Math.ceil(duration / this.state.updateInterval);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const currentTiltX = startTiltX + (tiltX - startTiltX) * t;
      const currentTiltY = startTiltY + (tiltY - startTiltY) * t;
      this.setState({ tiltX: currentTiltX, tiltY: currentTiltY });
      await new Promise(resolve => setTimeout(resolve, this.state.updateInterval));
    }
  }

  /**
   * Get a raw report for testing (bypasses processing)
   */
  getRawReport(): Uint8Array {
    if (this.state.tabletButton !== null) {
      return this.generateButtonReport();
    } else {
      return this.generateStylusReport();
    }
  }
}

