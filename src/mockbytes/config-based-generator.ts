/**
 * Config-Based Mock Data Generator
 * Generates mock HID packets that match a specific device configuration
 */

import { TabletDataGenerator, GeneratorConfig } from './tablet-data-generator.js';

export interface DeviceConfig {
  name?: string;
  manufacturer?: string;
  model?: string;
  vendorId?: string;
  productId?: string;
  reportId?: number;
  digitizerUsagePage?: number;
  deviceInfo?: {
    vendor_id?: number;
    product_id?: number;
    product_string?: string;
    interfaces?: number[];
  };
  byteCodeMappings?: Record<string, any>;
  modes?: Array<{
    reportId?: number;
    digitizerUsagePage?: number;
    byteCodeMappings?: Record<string, any>;
  }>;
}

export interface ConfigDeviceInfo {
  vendor_id: number;
  product_id: number;
  product_name: string;
  product_string: string;
  manufacturer: string;
  usage_page: number;
  usage: number;
  interfaces: number[];
  report_id: number;
}

/**
 * Generates mock data tailored to a specific device configuration.
 * Accepts a config object and creates packets matching the exact byte structure.
 */
export class ConfigBasedGenerator {
  private config: DeviceConfig;
  private mappings: Record<string, any>;
  private generator: TabletDataGenerator;
  private buttonConfig: Record<string, any>;

  readonly maxX: number;
  readonly maxY: number;
  readonly maxPressure: number;
  readonly reportId: number;
  readonly sampleRate: number = 200;

  /**
   * Create a ConfigBasedGenerator from a device config object.
   * @param config - The device configuration object (parsed JSON)
   */
  constructor(config: DeviceConfig) {
    this.config = config;

    // Support both multi-mode format (modes array) and legacy single-mode format
    if (this.config.modes && Array.isArray(this.config.modes) && this.config.modes.length > 0) {
      // Multi-mode format: extract from first mode
      const firstMode = this.config.modes[0];
      this.mappings = firstMode.byteCodeMappings || {};
      this.reportId = firstMode.reportId ?? 2;
    } else {
      // Legacy single-mode format
      this.mappings = this.config.byteCodeMappings || {};
      this.reportId = this.config.reportId ?? 2;
    }

    // Extract device parameters from config
    this.maxX = this.getMaxValue('x');
    this.maxY = this.getMaxValue('y');
    this.maxPressure = this.getMaxValue('pressure');

    // Get button configuration (always uses 'code' type now - bit-flags removed)
    this.buttonConfig = this.mappings.tabletButtons || {};

    // Create underlying generator with config parameters
    this.generator = new TabletDataGenerator({
      maxX: this.maxX,
      maxY: this.maxY,
      maxPressure: this.maxPressure,
      reportId: this.reportId,
      sampleRate: this.sampleRate,
    });
  }

  private getMaxValue(key: string): number {
    const mapping = this.mappings[key] || {};
    // Generic fallbacks: 16-bit for coordinates, 13-bit for pressure
    return mapping.max ?? (key === 'x' || key === 'y' ? 65535 : 8191);
  }

  private convertTiltToByte(tilt: number, tiltKey: string): number {
    const tiltMapping = this.mappings[tiltKey] || {};

    // Get ranges from config (if bipolar-range type)
    if (tiltMapping.type === 'bipolar-range') {
      const positiveMax = tiltMapping.positiveMax ?? 127;
      const negativeMin = tiltMapping.negativeMin ?? 128;
      const negativeMax = tiltMapping.negativeMax ?? 255;

      if (tilt >= 0) {
        // Positive tilt: 0 to positive_max
        return Math.round(tilt * positiveMax);
      } else {
        // Negative tilt: negative_min to negative_max
        return Math.round(negativeMin + (-tilt) * (negativeMax - negativeMin));
      }
    } else {
      // Fallback to full 0-255 range
      return Math.round(((tilt + 1) / 2) * 255);
    }
  }

  private getStatusByteForState(state: string, options: Record<string, any> = {}): number {
    const statusMapping = this.mappings.status || {};
    const values = statusMapping.values || {};

    for (const [byteStr, props] of Object.entries(values)) {
      if ((props as any).state === state) {
        // Check if all options match
        let match = true;
        for (const [key, value] of Object.entries(options)) {
          if ((props as any)[key] !== value) {
            match = false;
            break;
          }
        }
        if (match) {
          return parseInt(byteStr, 10);
        }
      }
    }

    // Fallback defaults
    switch (state) {
      case 'hover': return 0xa0; // 160
      case 'contact': return 0xa1; // 161
      case 'buttons': return 0x01;
      case 'keyboard': return 0x00;
      default: return 0xc0; // none/away
    }
  }

  /**
   * Generate a button press packet matching the config
   * Uses 'code' type (scan code mapping) - bit-flags removed
   */
  generateButtonPacket(buttonNumber: number): Uint8Array {
    // Find the scan code for this button
    const values = this.buttonConfig.values || {};
    const statusOverrides = this.buttonConfig.statusOverrides || [];

    // Find scan code for this button
    let scanCode: number | null = null;
    let statusByte = this.getStatusByteForState('buttons');

    // Check if this button is in statusOverrides
    for (const override of statusOverrides) {
      if (override.buttonNumber === buttonNumber) {
        scanCode = override.scanCode;
        statusByte = override.statusByte;
        break;
      }
    }

    // If not in overrides, find in values
    if (scanCode === null) {
      for (const [codeStr, props] of Object.entries(values)) {
        if ((props as any).button === buttonNumber) {
          scanCode = parseInt(codeStr, 10);
          break;
        }
      }
    }

    if (scanCode === null) {
      // Fallback to button number as scan code
      scanCode = buttonNumber;
    }

    // Get button byte index from config (subtract 1 since no report ID)
    const byteIndices = this.buttonConfig.byteIndex || [2];
    const buttonByteIndex = byteIndices[0] > 0 ? byteIndices[0] - 1 : 1;

    // Get status byte index from config (subtract 1 since no report ID)
    const statusMapping = this.mappings.status || {};
    const statusByteIndices = statusMapping.byteIndex || [1];
    const statusByteIndex = statusByteIndices[0] > 0 ? statusByteIndices[0] - 1 : 0;

    // Create packet - size based on max byte index + 1
    const packetSize = Math.max(buttonByteIndex, statusByteIndex) + 1;
    const packet = new Uint8Array(packetSize);
    packet[statusByteIndex] = statusByte;
    packet[buttonByteIndex] = scanCode;

    return packet;
  }

  /**
   * Generate a stylus packet matching the config
   */
  generateStylusPacket(
    x: number,
    y: number,
    pressure: number,
    tiltX: number = 0,
    tiltY: number = 0,
    primaryButton: boolean = false,
    secondaryButton: boolean = false
  ): Uint8Array {
    // Normalize coordinates to device range
    const normalizedX = Math.round(x * this.maxX);
    const normalizedY = Math.round(y * this.maxY);
    const normalizedPressure = Math.round(pressure * this.maxPressure);

    // Convert tilt to byte range using config-specified ranges
    const tiltXByte = this.convertTiltToByte(tiltX, 'tiltX');
    const tiltYByte = this.convertTiltToByte(tiltY, 'tiltY');

    // Determine status byte
    const state = pressure > 0 ? 'contact' : 'hover';
    const options: Record<string, any> = {};
    if (primaryButton) options.primaryButtonPressed = true;
    if (secondaryButton) options.secondaryButtonPressed = true;
    const statusByte = this.getStatusByteForState(state, options);

    // Build packet according to config byte mappings
    // Config byte indices assume report ID at byte 0
    // We generate packets WITHOUT report ID (mock reader will prepend it)
    // So we subtract 1 from all config indices
    let maxByteIndex = 0;
    for (const key of ['x', 'y', 'pressure', 'status', 'tiltX', 'tiltY']) {
      const mapping = this.mappings[key] || {};
      const byteIndices = mapping.byteIndex || [];
      if (byteIndices.length > 0) {
        maxByteIndex = Math.max(maxByteIndex, Math.max(...byteIndices));
      }
    }

    // Packet size is max_index (not +1) because we don't include report ID
    const packetSize = maxByteIndex;
    const packet = new Uint8Array(packetSize);

    // Set status byte (config index - 1 since no report ID)
    const statusMapping = this.mappings.status || {};
    const statusIndices = statusMapping.byteIndex || [1];
    if (statusIndices.length > 0 && statusIndices[0] > 0) {
      packet[statusIndices[0] - 1] = statusByte;
    }

    // Set X coordinate (config indices - 1)
    const xMapping = this.mappings.x || {};
    const xIndices = xMapping.byteIndex || [2, 3];
    if (xIndices.length >= 2 && xIndices[0] > 0) {
      packet[xIndices[0] - 1] = normalizedX & 0xff;
      packet[xIndices[1] - 1] = (normalizedX >> 8) & 0xff;
    }

    // Set Y coordinate (config indices - 1)
    const yMapping = this.mappings.y || {};
    const yIndices = yMapping.byteIndex || [4, 5];
    if (yIndices.length >= 2 && yIndices[0] > 0) {
      packet[yIndices[0] - 1] = normalizedY & 0xff;
      packet[yIndices[1] - 1] = (normalizedY >> 8) & 0xff;
    }

    // Set pressure (config indices - 1)
    const pressureMapping = this.mappings.pressure || {};
    const pressureIndices = pressureMapping.byteIndex || [6, 7];
    if (pressureIndices.length >= 2 && pressureIndices[0] > 0) {
      packet[pressureIndices[0] - 1] = normalizedPressure & 0xff;
      packet[pressureIndices[1] - 1] = (normalizedPressure >> 8) & 0xff;
    }

    // Set tilt X (config index - 1)
    const tiltXMapping = this.mappings.tiltX || {};
    const tiltXIndices = tiltXMapping.byteIndex || [];
    if (tiltXIndices.length > 0 && tiltXIndices[0] > 0 && (tiltXIndices[0] - 1) < packet.length) {
      packet[tiltXIndices[0] - 1] = tiltXByte;
    }

    // Set tilt Y (config index - 1)
    const tiltYMapping = this.mappings.tiltY || {};
    const tiltYIndices = tiltYMapping.byteIndex || [];
    if (tiltYIndices.length > 0 && tiltYIndices[0] > 0 && (tiltYIndices[0] - 1) < packet.length) {
      packet[tiltYIndices[0] - 1] = tiltYByte;
    }

    return packet;
  }

  /**
   * Generate a 'pen away' packet (out of range)
   */
  generatePenAwayPacket(): Uint8Array {
    const statusByte = this.getStatusByteForState('none');

    // Get all byte indices to determine packet size
    const allIndices: number[] = [];
    for (const mapping of Object.values(this.mappings)) {
      if (mapping && typeof mapping === 'object' && 'byteIndex' in mapping) {
        allIndices.push(...(mapping as any).byteIndex);
      }
    }

    const maxByteIndex = allIndices.length > 0 ? Math.max(...allIndices) : 9;
    const packetSize = maxByteIndex;
    const packet = new Uint8Array(packetSize);

    // Set status byte (config index - 1 since no report ID)
    const statusMapping = this.mappings.status || {};
    const statusIndices = statusMapping.byteIndex || [1];
    if (statusIndices.length > 0 && statusIndices[0] > 0) {
      packet[statusIndices[0] - 1] = statusByte;
    }

    return packet;
  }

  /**
   * Generate horizontal line gesture
   */
  *generateHorizontalLine(y: number = 0.5, pressure: number = 0.5, duration: number = 1500): Generator<Uint8Array> {
    const totalSamples = Math.floor((duration * 200) / 1000);
    for (let i = 0; i < totalSamples; i++) {
      const t = totalSamples > 1 ? i / (totalSamples - 1) : 0;
      const x = t;
      const tiltX = Math.random() * 0.2 - 0.1;
      const tiltY = Math.random() * 0.2 - 0.1;
      yield this.generateStylusPacket(x, y, pressure, tiltX, tiltY);
    }
    // Pen away
    for (let i = 0; i < 3; i++) {
      yield this.generatePenAwayPacket();
    }
  }

  /**
   * Generate vertical line gesture
   */
  *generateVerticalLine(x: number = 0.5, pressure: number = 0.5, duration: number = 1500): Generator<Uint8Array> {
    const totalSamples = Math.floor((duration * 200) / 1000);
    for (let i = 0; i < totalSamples; i++) {
      const t = totalSamples > 1 ? i / (totalSamples - 1) : 0;
      const y = t;
      const tiltX = Math.random() * 0.2 - 0.1;
      const tiltY = Math.random() * 0.2 - 0.1;
      yield this.generateStylusPacket(x, y, pressure, tiltX, tiltY);
    }
    // Pen away
    for (let i = 0; i < 3; i++) {
      yield this.generatePenAwayPacket();
    }
  }

  /**
   * Generate pressure sweep gesture
   */
  *generatePressureSweep(x: number = 0.5, y: number = 0.5, duration: number = 1500): Generator<Uint8Array> {
    const totalSamples = Math.floor((duration * 200) / 1000);
    for (let i = 0; i < totalSamples; i++) {
      const t = totalSamples > 1 ? i / (totalSamples - 1) : 0;
      const pressure = t;
      const noisyX = x + Math.random() * 0.04 - 0.02;
      const noisyY = y + Math.random() * 0.04 - 0.02;
      const tiltX = Math.random() * 0.2 - 0.1;
      const tiltY = Math.random() * 0.2 - 0.1;
      yield this.generateStylusPacket(noisyX, noisyY, pressure, tiltX, tiltY);
    }
    // Pen away
    for (let i = 0; i < 3; i++) {
      yield this.generatePenAwayPacket();
    }
  }

  /**
   * Generate sequence of button presses
   */
  *generateButtonSequence(buttonCount: number = 8, duration: number = 2000): Generator<Uint8Array> {
    const samplesPerButton = Math.floor((duration * 200) / (1000 * buttonCount));
    for (let buttonNum = 1; buttonNum <= buttonCount; buttonNum++) {
      for (let i = 0; i < samplesPerButton; i++) {
        yield this.generateButtonPacket(buttonNum);
      }
    }
  }

  /**
   * Get device info from config
   */
  getDeviceInfo(): ConfigDeviceInfo {
    const deviceInfoConfig = this.config.deviceInfo || {};
    const modes = this.config.modes || [];
    const digitizerUsagePage = modes.length > 0
      ? (modes[0].digitizerUsagePage ?? 13)
      : (this.config.digitizerUsagePage ?? 13);

    return {
      vendor_id: parseInt(this.config.vendorId || '0x0000', 16),
      product_id: parseInt(this.config.productId || '0x0000', 16),
      product_name: this.config.name || 'Mock Tablet',
      product_string: deviceInfoConfig.product_string || this.config.name || 'Mock Tablet',
      manufacturer: this.config.manufacturer || 'Mock',
      usage_page: digitizerUsagePage,
      usage: 2, // Standard pen usage
      interfaces: deviceInfoConfig.interfaces || [13],
      report_id: this.reportId,
    };
  }
}

/**
 * Factory function to create a config-based generator from a config object
 */
export function createConfigBasedGenerator(config: DeviceConfig): ConfigBasedGenerator {
  return new ConfigBasedGenerator(config);
}
