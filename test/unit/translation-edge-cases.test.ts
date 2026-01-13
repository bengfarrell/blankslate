import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockTabletDevice } from '../../src/mockbytes/mock-tablet-device.js';
import { processDeviceData } from '../../src/utils/data-helpers.js';

describe('Translation Edge Cases and Error Handling', () => {
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

  describe('Missing or Invalid Mappings', () => {
    it('should handle translation without mappings gracefully', (done) => {
      // Enable translation but don't provide mappings
      device.setTranslateEvents(true);

      let errorOccurred = false;

      device.addEventListener('tablet-event', (data: Uint8Array) => {
        try {
          const jsonStr = new TextDecoder().decode(data);
          const translated = JSON.parse(jsonStr);
          expect(translated).toBeDefined();
        } catch (error) {
          errorOccurred = true;
        }

        device.stop();
        // Should not throw errors even without mappings
        expect(errorOccurred).toBe(false);
        done();
      });

      device.playCircle();
    });

    it('should handle empty mappings object', (done) => {
      device.setTranslateEvents(true, {});

      device.addEventListener('tablet-event', (data: Uint8Array) => {
        const jsonStr = new TextDecoder().decode(data);
        const translated = JSON.parse(jsonStr);

        expect(translated).toBeDefined();
        device.stop();
        done();
      });

      device.playCircle();
    });

    it('should handle partial mappings', (done) => {
      const partialMappings = {
        x: { byteIndex: [1, 2], min: 0, max: 16000 },
        // Missing y, pressure, etc.
      };

      device.setTranslateEvents(true, partialMappings);

      device.addEventListener('tablet-event', (data: Uint8Array) => {
        const jsonStr = new TextDecoder().decode(data);
        const translated = JSON.parse(jsonStr);

        expect(translated).toBeDefined();
        expect(translated).toHaveProperty('x');
        device.stop();
        done();
      });

      device.playCircle();
    });

    it('should handle invalid mapping structure', () => {
      const invalidMappings = {
        x: 'invalid',
        y: null,
        pressure: undefined,
      } as any;

      expect(() => {
        device.setTranslateEvents(true, invalidMappings);
      }).not.toThrow();
    });
  });

  describe('Boundary Values', () => {
    it('should handle zero values', (done) => {
      const byteCodeMappings = {
        x: { byteIndex: [1, 2], min: 0, max: 16000 },
        y: { byteIndex: [3, 4], min: 0, max: 9000 },
      };

      device.setTranslateEvents(true, byteCodeMappings);

      device.addEventListener('tablet-event', (data: Uint8Array) => {
        const jsonStr = new TextDecoder().decode(data);
        const translated = JSON.parse(jsonStr);

        // Values should be valid numbers
        expect(typeof translated.x).toBe('number');
        expect(typeof translated.y).toBe('number');
        expect(isNaN(translated.x)).toBe(false);
        expect(isNaN(translated.y)).toBe(false);

        device.stop();
        done();
      });

      device.playCircle();
    });

    it('should handle maximum values', (done) => {
      const byteCodeMappings = {
        x: { byteIndex: [1, 2], min: 0, max: 65535 },
        y: { byteIndex: [3, 4], min: 0, max: 65535 },
      };

      device.setTranslateEvents(true, byteCodeMappings);

      device.addEventListener('tablet-event', (data: Uint8Array) => {
        const jsonStr = new TextDecoder().decode(data);
        const translated = JSON.parse(jsonStr);

        expect(translated.x).toBeGreaterThanOrEqual(0);
        expect(translated.x).toBeLessThanOrEqual(1);
        expect(translated.y).toBeGreaterThanOrEqual(0);
        expect(translated.y).toBeLessThanOrEqual(1);

        device.stop();
        done();
      });

      device.playCircle();
    });

    it('should handle negative ranges for tilt', (done) => {
      const byteCodeMappings = {
        tiltX: { byteIndex: [7], min: -60, max: 60 },
        tiltY: { byteIndex: [8], min: -60, max: 60 },
      };

      device.setTranslateEvents(true, byteCodeMappings);

      device.addEventListener('tablet-event', (data: Uint8Array) => {
        const jsonStr = new TextDecoder().decode(data);
        const translated = JSON.parse(jsonStr);

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
  });

  describe('State Management', () => {
    it('should handle rapid mode toggling', () => {
      const mappings = {
        x: { byteIndex: [1, 2], min: 0, max: 16000 },
      };

      for (let i = 0; i < 10; i++) {
        device.setTranslateEvents(true, mappings);
        device.setTranslateEvents(false);
      }

      expect(device['config'].translateEvents).toBe(false);
    });

    it('should handle stop during playback', (done) => {
      device.addEventListener('inputreport', () => {
        device.stop();
        // Should not throw errors
        done();
      });

      device.playCircle();
    });
  });
});

