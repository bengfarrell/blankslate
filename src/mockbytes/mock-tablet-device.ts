/**
 * Mock Tablet Device
 * Simulates a HID tablet device for testing without physical hardware
 */

import { TabletDataGenerator, GeneratorConfig } from './tablet-data-generator.js';
import { processDeviceData } from '../utils/data-helpers.js';

export interface MockDeviceConfig extends Partial<GeneratorConfig> {
  deviceName?: string;
  vendorId?: number;
  productId?: number;
  autoPlay?: boolean;
  /** If true, emit translated tablet events instead of raw bytes */
  translateEvents?: boolean;
  /** Config mappings for translating bytes to events (required if translateEvents is true) */
  byteCodeMappings?: Record<string, any>;
}

/**
 * Mock HID Device that simulates a graphics tablet
 */
export class MockTabletDevice {
  private generator: TabletDataGenerator;
  private config: MockDeviceConfig;
  private isPlaying = false;
  private listeners: Map<string, Set<(data: Uint8Array) => void>> = new Map();
  private currentGenerator: Generator<Uint8Array> | null = null;
  private playbackInterval: number | null = null;

  deviceName: string;
  vendorId: number;
  productId: number;
  opened = false;

  constructor(config: MockDeviceConfig = {}) {
    this.config = config;
    this.generator = new TabletDataGenerator(config);
    this.deviceName = config.deviceName || 'Mock Graphics Tablet';
    this.vendorId = config.vendorId || 0x0000; // Generic mock device
    this.productId = config.productId || 0x0001;
  }

  /**
   * Simulate opening the device
   */
  async open(): Promise<void> {
    this.opened = true;
    console.log('[MockTablet] Device opened');
    
    if (this.config.autoPlay) {
      this.playCircle();
    }
  }

  /**
   * Simulate closing the device
   */
  async close(): Promise<void> {
    this.opened = false;
    this.stop();
    console.log('[MockTablet] Device closed');
  }

  /**
   * Add event listener (simulates addEventListener)
   */
  addEventListener(event: string, callback: (data: Uint8Array) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * Remove event listener
   */
  removeEventListener(event: string, callback: (data: Uint8Array) => void): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Emit a data packet to listeners
   */
  private emit(event: string, data: Uint8Array): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }

    // If translation is enabled, also emit translated events
    if (this.config.translateEvents) {
      const translatedListeners = this.listeners.get('tablet-event');
      if (translatedListeners) {
        let translated;

        if (this.config.byteCodeMappings) {
          // Use config mappings to translate
          // Use offset -1 for WebHID since browser API strips report ID from packets
          translated = processDeviceData(data, this.config.byteCodeMappings, -1);
        } else {
          // Generate synthetic translated events from generator state
          translated = this.generator.getLastState();
        }

        // Encode translated data as JSON in Uint8Array for compatibility
        const jsonStr = JSON.stringify(translated);
        const encoded = new TextEncoder().encode(jsonStr);
        translatedListeners.forEach(callback => callback(encoded));
      }
    }
  }

  /**
   * Set translation mode
   */
  setTranslateEvents(enabled: boolean, byteCodeMappings?: Record<string, any>): void {
    this.config.translateEvents = enabled;
    if (byteCodeMappings) {
      this.config.byteCodeMappings = byteCodeMappings;
    }
  }

  /**
   * Play a drawing pattern
   */
  play(generator: Generator<Uint8Array>, interval = 5): void {
    this.stop();
    this.currentGenerator = generator;
    this.isPlaying = true;

    this.playbackInterval = window.setInterval(() => {
      if (!this.currentGenerator || !this.isPlaying) {
        this.stop();
        return;
      }

      const result = this.currentGenerator.next();
      if (result.done) {
        this.stop();
        return;
      }

      // Emit as inputreport event
      this.emit('inputreport', result.value);
    }, interval);
  }

  /**
   * Stop current playback
   */
  stop(): void {
    this.isPlaying = false;
    if (this.playbackInterval !== null) {
      clearInterval(this.playbackInterval);
      this.playbackInterval = null;
    }
    this.currentGenerator = null;
  }

  /**
   * Play a circle drawing
   */
  playCircle(centerX = 0.5, centerY = 0.5, radius = 0.3, duration = 2000): void {
    const gen = this.generator.generateCircle(centerX, centerY, radius, duration);
    this.play(gen);
  }

  /**
   * Play a line drawing
   */
  playLine(x1 = 0.1, y1 = 0.1, x2 = 0.9, y2 = 0.9, duration = 1000): void {
    const gen = this.generator.generateLine(x1, y1, x2, y2, duration);
    this.play(gen);
  }

  /**
   * Play a scribble
   */
  playScribble(x = 0.1, y = 0.4, width = 0.8, height = 0.2, duration = 3000): void {
    const gen = this.generator.generateScribble(x, y, width, height, duration);
    this.play(gen);
  }

  /**
   * Play a custom path
   */
  playPath(points: Array<{ x: number; y: number }>, duration = 2000): void {
    const gen = this.generator.generatePath(points, duration);
    this.play(gen);
  }

  /**
   * Play a horizontal drag across the full tablet surface
   * Uses constant pressure to isolate X coordinate changes
   */
  playHorizontalDrag(y = 0.5, duration = 1500): void {
    const gen = this.generator.generateLineConstantPressure(0, y, 1, y, 0.5, duration);
    this.play(gen);
  }

  /**
   * Play a vertical drag across the full tablet surface
   * Uses constant pressure to isolate Y coordinate changes
   */
  playVerticalDrag(x = 0.5, duration = 1500): void {
    const gen = this.generator.generateLineConstantPressure(x, 0, x, 1, 0.5, duration);
    this.play(gen);
  }

  /**
   * Play a horizontal hover drag (no pressure)
   */
  playHoverHorizontalDrag(y = 0.5, duration = 1500): void {
    const gen = this.generator.generateHoverLine(0, y, 1, y, duration);
    this.play(gen);
  }

  /**
   * Play a vertical hover drag (no pressure)
   */
  playHoverVerticalDrag(x = 0.5, duration = 1500): void {
    const gen = this.generator.generateHoverLine(x, 0, x, 1, duration);
    this.play(gen);
  }

  /**
   * Play a horizontal drag with X tilt variation
   */
  playTiltXDrag(y = 0.5, duration = 1500): void {
    const gen = this.generator.generateTiltXLine(0, y, 1, y, duration);
    this.play(gen);
  }

  /**
   * Play a vertical drag with Y tilt variation
   */
  playTiltYDrag(x = 0.5, duration = 1500): void {
    const gen = this.generator.generateTiltYLine(x, 0, x, 1, duration);
    this.play(gen);
  }

  /**
   * Play a drag with primary button pressed
   */
  playPrimaryButtonDrag(y = 0.5, duration = 1500): void {
    const gen = this.generator.generatePrimaryButtonLine(0, y, 1, y, duration);
    this.play(gen);
  }

  /**
   * Play a drag with secondary button pressed
   */
  playSecondaryButtonDrag(y = 0.5, duration = 1500): void {
    const gen = this.generator.generateSecondaryButtonLine(0, y, 1, y, duration);
    this.play(gen);
  }

  /**
   * Play a sequence of tablet button presses
   * Simulates pressing each express key on the tablet
   */
  playTabletButtons(buttonCount = 8, duration = 2000): void {
    const gen = this.generator.generateTabletButtonSequence(buttonCount, duration);
    this.play(gen);
  }

  /**
   * Send a single packet
   */
  sendPacket(x: number, y: number, pressure: number, tiltX = 0, tiltY = 0): void {
    const packet = this.generator.generatePacket(x, y, pressure, tiltX, tiltY);
    this.emit('inputreport', packet);
  }

  /**
   * Send hover data (pen near but not touching)
   */
  sendHover(x: number, y: number): void {
    const packet = this.generator.generateHoverPacket(x, y);
    this.emit('inputreport', packet);
  }

  /**
   * Send button press
   */
  sendButton(buttonNumber: number): void {
    const packet = this.generator.generateButtonPacket(buttonNumber);
    this.emit('inputreport', packet);
  }

  /**
   * Check if currently playing
   */
  get playing(): boolean {
    return this.isPlaying;
  }
}

/**
 * Create a mock tablet device for testing
 */
export function createMockTablet(config?: MockDeviceConfig): MockTabletDevice {
  return new MockTabletDevice(config);
}