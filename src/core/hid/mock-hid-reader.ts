/**
 * Mock HID Reader
 * Implements IHIDReader using mock tablet data for testing
 * 
 * This implementation works in both browser and Node.js environments
 */

import type { IHIDReader, HIDDeviceInfo, HIDDataCallback } from './hid-interface.js';
import { TabletDataGenerator, type GeneratorConfig } from '../../mockbytes/tablet-data-generator.js';

/**
 * Configuration for mock device
 */
export interface MockHIDReaderConfig extends Partial<GeneratorConfig> {
  vendorId?: number;
  productId?: number;
  productName?: string;
  reportId?: number;
  /** Interval between packets in ms (default: 5) */
  packetInterval?: number;
}

/**
 * Mock HID reader for testing without physical hardware
 */
export class MockHIDReader implements IHIDReader {
  private _isOpen = false;
  private _deviceInfo: HIDDeviceInfo;
  private generator: TabletDataGenerator;
  private config: MockHIDReaderConfig;
  private dataCallback: HIDDataCallback | null = null;
  private currentGenerator: Generator<Uint8Array> | null = null;
  private playbackTimer: ReturnType<typeof setInterval> | null = null;
  private isPlaying = false;

  constructor(config: MockHIDReaderConfig = {}) {
    this.config = {
      vendorId: config.vendorId ?? 0x056a, // Wacom vendor ID
      productId: config.productId ?? 0x0001,
      productName: config.productName ?? 'Mock Graphics Tablet',
      reportId: config.reportId ?? 2,
      packetInterval: config.packetInterval ?? 5,
      ...config,
    };

    this._deviceInfo = {
      vendorId: this.config.vendorId!,
      productId: this.config.productId!,
      productName: this.config.productName!,
      manufacturer: 'Mock Device',
      usagePage: 13,
      usage: 2,
      collections: [{ usagePage: 13, usage: 2 }],
    };

    this.generator = new TabletDataGenerator({
      maxX: config.maxX ?? 16000,
      maxY: config.maxY ?? 9000,
      reportId: this.config.reportId!,
      sampleRate: config.sampleRate ?? 200,
      pressureVariation: config.pressureVariation ?? 0.2,
    });
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  get deviceInfo(): HIDDeviceInfo {
    return this._deviceInfo;
  }

  async open(): Promise<void> {
    this._isOpen = true;
  }

  async close(): Promise<void> {
    this.stopReading();
    this._isOpen = false;
  }

  startReading(callback: HIDDataCallback, _reportId?: number): void {
    this.dataCallback = callback;
  }

  stopReading(): void {
    this.stop();
    this.dataCallback = null;
  }

  /**
   * Play a gesture pattern
   */
  play(generator: Generator<Uint8Array>): Promise<void> {
    return new Promise((resolve) => {
      this.stop();
      this.currentGenerator = generator;
      this.isPlaying = true;

      this.playbackTimer = setInterval(() => {
        if (!this.currentGenerator || !this.isPlaying) {
          this.stop();
          resolve();
          return;
        }

        const result = this.currentGenerator.next();
        if (result.done) {
          this.stop();
          resolve();
          return;
        }

        if (this.dataCallback) {
          this.dataCallback(result.value, this.config.reportId);
        }
      }, this.config.packetInterval);
    });
  }

  /**
   * Stop current playback
   */
  stop(): void {
    this.isPlaying = false;
    if (this.playbackTimer !== null) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = null;
    }
    this.currentGenerator = null;
  }

  /**
   * Check if currently playing
   */
  get playing(): boolean {
    return this.isPlaying;
  }

  // Gesture methods

  playHorizontalDrag(y = 0.5, duration = 1500): Promise<void> {
    return this.play(this.generator.generateLineConstantPressure(0, y, 1, y, 0.5, duration));
  }

  playVerticalDrag(x = 0.5, duration = 1500): Promise<void> {
    return this.play(this.generator.generateLineConstantPressure(x, 0, x, 1, 0.5, duration));
  }

  playPressureSweep(duration = 1500): Promise<void> {
    // Generate pressure sweep (stationary but varying pressure)
    return this.play(this.generator.generateLineConstantPressure(0.5, 0.5, 0.5, 0.5, 0.5, duration));
  }

  playCircle(centerX = 0.5, centerY = 0.5, radius = 0.3, duration = 2000): Promise<void> {
    return this.play(this.generator.generateCircle(centerX, centerY, radius, duration));
  }

  playHoverCircle(centerX = 0.5, centerY = 0.5, duration = 2000): Promise<void> {
    // Create a hover circle pattern
    const gen = this.generator.generateHoverLine(
      centerX - 0.3, centerY,
      centerX + 0.3, centerY,
      duration
    );
    return this.play(gen);
  }

  playTiltXSweep(duration = 1500): Promise<void> {
    return this.play(this.generator.generateTiltXLine(0, 0.5, 1, 0.5, duration));
  }

  playTiltYSweep(duration = 1500): Promise<void> {
    return this.play(this.generator.generateTiltYLine(0.5, 0, 0.5, 1, duration));
  }

  playPrimaryButton(duration = 1500): Promise<void> {
    return this.play(this.generator.generatePrimaryButtonLine(0, 0.5, 1, 0.5, duration));
  }

  playSecondaryButton(duration = 1500): Promise<void> {
    return this.play(this.generator.generateSecondaryButtonLine(0, 0.5, 1, 0.5, duration));
  }

  playTabletButtons(buttonCount = 8, duration = 2000): Promise<void> {
    return this.play(this.generator.generateTabletButtonSequence(buttonCount, duration));
  }

  /**
   * Play a hover movement pattern
   */
  playHoverMovement(duration = 2000): Promise<void> {
    return this.play(this.generator.generateHoverLine(0.2, 0.2, 0.8, 0.8, duration));
  }

  /**
   * Play the gesture matching the walkthrough step
   */
  async playGestureForStep(gesture: string, duration = 1500): Promise<void> {
    switch (gesture) {
      case 'horizontal':
        return this.playHorizontalDrag(0.5, duration);
      case 'vertical':
        return this.playVerticalDrag(0.5, duration);
      case 'pressure':
        return this.playPressureSweep(duration);
      case 'circle':
        return this.playCircle(0.5, 0.5, 0.3, duration);
      case 'hover':
      case 'hover-movement':
        return this.playHoverMovement(duration);
      case 'tilt-x':
        return this.playTiltXSweep(duration);
      case 'tilt-y':
        return this.playTiltYSweep(duration);
      case 'primary-button':
        return this.playPrimaryButton(duration);
      case 'secondary-button':
        return this.playSecondaryButton(duration);
      case 'tablet-buttons':
        return this.playTabletButtons(8, duration);
      default:
        console.warn(`Unknown gesture: ${gesture}`);
    }
  }
}

/**
 * Create a mock HID reader for testing
 */
export function createMockHIDReader(config?: MockHIDReaderConfig): MockHIDReader {
  return new MockHIDReader(config);
}

