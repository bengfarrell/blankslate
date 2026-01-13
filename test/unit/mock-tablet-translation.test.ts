import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MockTabletDevice } from '../../src/mockbytes/mock-tablet-device.js';
import { processDeviceData } from '../../src/utils/data-helpers.js';

describe('MockTabletDevice Translation', () => {
  let device: MockTabletDevice;

  beforeEach(() => {
    device = new MockTabletDevice({
      maxX: 16000,
      maxY: 9000,
    });
  });

  afterEach(() => {
    device.stop();
  });

  describe('Raw Bytes Mode (Default)', () => {
    it('should emit raw bytes by default', (done) => {
      let eventCount = 0;

      device.addEventListener('inputreport', (data: Uint8Array) => {
        expect(data).toBeInstanceOf(Uint8Array);
        expect(data.length).toBeGreaterThan(0);
        eventCount++;

        if (eventCount >= 3) {
          device.stop();
          done();
        }
      });

      device.playCircle();
    });

    it('should not emit tablet-event in raw mode', (done) => {
      let rawEventCount = 0;
      let translatedEventCount = 0;

      device.addEventListener('inputreport', () => {
        rawEventCount++;

        if (rawEventCount >= 5) {
          device.stop();
          expect(translatedEventCount).toBe(0);
          done();
        }
      });

      device.addEventListener('tablet-event', () => {
        translatedEventCount++;
      });

      device.playCircle();
    });

    it('should emit valid byte arrays for different gestures', (done) => {
      const gestures = [
        { name: 'circle', action: () => device.playCircle() },
        { name: 'line', action: () => device.playLine() },
        { name: 'scribble', action: () => device.playScribble() },
      ];

      let gestureIndex = 0;
      let eventCount = 0;

      const testNextGesture = () => {
        if (gestureIndex >= gestures.length) {
          done();
          return;
        }

        eventCount = 0;
        device.addEventListener('inputreport', (data: Uint8Array) => {
          expect(data).toBeInstanceOf(Uint8Array);
          expect(data.length).toBeGreaterThan(0);
          eventCount++;

          if (eventCount >= 2) {
            device.stop();
            gestureIndex++;
            setTimeout(testNextGesture, 10);
          }
        });

        gestures[gestureIndex].action();
      };

      testNextGesture();
    });
  });

  describe('Translated Events Mode', () => {
    const byteCodeMappings = {
      x: { byteIndex: [1, 2], min: 0, max: 16000 },
      y: { byteIndex: [3, 4], min: 0, max: 9000 },
      pressure: { byteIndex: [5, 6], min: 0, max: 8191 },
      tiltX: { byteIndex: [7], min: -60, max: 60 },
      tiltY: { byteIndex: [8], min: -60, max: 60 },
    };

    it('should emit translated events when enabled', (done) => {
      device.setTranslateEvents(true, byteCodeMappings);

      let translatedEventCount = 0;
      let rawEventCount = 0;

      device.addEventListener('tablet-event', (data: Uint8Array) => {
        const jsonStr = new TextDecoder().decode(data);
        const translated = JSON.parse(jsonStr);

        expect(translated).toHaveProperty('x');
        expect(translated).toHaveProperty('y');
        expect(translated).toHaveProperty('pressure');

        translatedEventCount++;

        if (translatedEventCount >= 3) {
          device.stop();
          expect(rawEventCount).toBeGreaterThan(0);
          done();
        }
      });

      device.addEventListener('inputreport', () => {
        rawEventCount++;
      });

      device.playCircle();
    });

    it('should emit both raw and translated events simultaneously', (done) => {
      device.setTranslateEvents(true, byteCodeMappings);

      let rawEventCount = 0;
      let translatedEventCount = 0;

      device.addEventListener('inputreport', () => {
        rawEventCount++;
      });

      device.addEventListener('tablet-event', () => {
        translatedEventCount++;

        if (translatedEventCount >= 5) {
          device.stop();
          expect(rawEventCount).toBe(translatedEventCount);
          done();
        }
      });

      device.playCircle();
    });

    it('should produce valid normalized values in translated events', (done) => {
      device.setTranslateEvents(true, byteCodeMappings);

      device.addEventListener('tablet-event', (data: Uint8Array) => {
        const jsonStr = new TextDecoder().decode(data);
        const translated = JSON.parse(jsonStr);

        // Check that values are normalized (0-1 for x, y, pressure)
        if (typeof translated.x === 'number') {
          expect(translated.x).toBeGreaterThanOrEqual(0);
          expect(translated.x).toBeLessThanOrEqual(1);
        }

        if (typeof translated.y === 'number') {
          expect(translated.y).toBeGreaterThanOrEqual(0);
          expect(translated.y).toBeLessThanOrEqual(1);
        }

        if (typeof translated.pressure === 'number') {
          expect(translated.pressure).toBeGreaterThanOrEqual(0);
          expect(translated.pressure).toBeLessThanOrEqual(1);
        }

        // Check that tilt values are in -1 to 1 range
        if (typeof translated.tiltX === 'number') {
          expect(translated.tiltX).toBeGreaterThanOrEqual(-1);
          expect(translated.tiltX).toBeLessThanOrEqual(1);
        }

        if (typeof translated.tiltY === 'number') {
          expect(translated.tiltY).toBeGreaterThanOrEqual(-1);
          expect(translated.tiltY).toBeLessThanOrEqual(1);
        }

        device.stop();
        done();
      });

      device.playCircle();
    });

    it('should handle translation without optional mappings', (done) => {
      const minimalMappings = {
        x: { byteIndex: [1, 2], min: 0, max: 16000 },
        y: { byteIndex: [3, 4], min: 0, max: 9000 },
      };

      device.setTranslateEvents(true, minimalMappings);

      device.addEventListener('tablet-event', (data: Uint8Array) => {
        const jsonStr = new TextDecoder().decode(data);
        const translated = JSON.parse(jsonStr);

        expect(translated).toHaveProperty('x');
        expect(translated).toHaveProperty('y');
        // Pressure and tilt may or may not be present

        device.stop();
        done();
      });

      device.playCircle();
    });
  });

  describe('Mode Toggling', () => {
    const byteCodeMappings = {
      x: { byteIndex: [1, 2], min: 0, max: 16000 },
      y: { byteIndex: [3, 4], min: 0, max: 9000 },
    };

    it('should allow toggling translation mode', () => {
      // Start with translation disabled
      expect(device['config'].translateEvents).toBeFalsy();

      // Enable translation
      device.setTranslateEvents(true, byteCodeMappings);
      expect(device['config'].translateEvents).toBe(true);
      expect(device['config'].byteCodeMappings).toBe(byteCodeMappings);

      // Disable translation
      device.setTranslateEvents(false);
      expect(device['config'].translateEvents).toBe(false);
    });

    it('should update mappings when toggling', () => {
      const mappings1 = {
        x: { byteIndex: [1, 2], min: 0, max: 16000 },
      };

      const mappings2 = {
        x: { byteIndex: [1, 2], min: 0, max: 16000 },
        y: { byteIndex: [3, 4], min: 0, max: 9000 },
      };

      device.setTranslateEvents(true, mappings1);
      expect(device['config'].byteCodeMappings).toBe(mappings1);

      device.setTranslateEvents(true, mappings2);
      expect(device['config'].byteCodeMappings).toBe(mappings2);
    });

    it('should preserve mappings when only toggling mode', () => {
      device.setTranslateEvents(true, byteCodeMappings);
      const savedMappings = device['config'].byteCodeMappings;

      device.setTranslateEvents(false);
      expect(device['config'].byteCodeMappings).toBe(savedMappings);
    });
  });

  describe('Configuration Options', () => {
    it('should accept translation config in constructor', () => {
      const byteCodeMappings = {
        x: { byteIndex: [1, 2], min: 0, max: 16000 },
        y: { byteIndex: [3, 4], min: 0, max: 9000 },
      };

      const deviceWithTranslation = new MockTabletDevice({
        maxX: 16000,
        maxY: 9000,
        translateEvents: true,
        byteCodeMappings,
      });

      expect(deviceWithTranslation['config'].translateEvents).toBe(true);
      expect(deviceWithTranslation['config'].byteCodeMappings).toBe(byteCodeMappings);

      deviceWithTranslation.stop();
    });

    it('should work with different device configurations', () => {
      const configs = [
        { maxX: 16000, maxY: 9000 },
        { maxX: 32000, maxY: 18000 },
        { maxX: 8000, maxY: 4500 },
      ];

      configs.forEach(config => {
        const testDevice = new MockTabletDevice(config);
        expect(testDevice).toBeDefined();
        expect(testDevice['config'].maxX).toBe(config.maxX);
        expect(testDevice['config'].maxY).toBe(config.maxY);
        testDevice.stop();
      });
    });
  });
});