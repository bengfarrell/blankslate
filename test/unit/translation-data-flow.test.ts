import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockTabletDevice } from '../../src/mockbytes/mock-tablet-device.js';
import { processDeviceData } from '../../src/utils/data-helpers.js';

describe('Translation Data Flow', () => {
  let device: MockTabletDevice;

  const byteCodeMappings = {
    x: { byteIndex: [1, 2], min: 0, max: 16000 },
    y: { byteIndex: [3, 4], min: 0, max: 9000 },
    pressure: { byteIndex: [5, 6], min: 0, max: 8191 },
    tiltX: { byteIndex: [7], min: -60, max: 60 },
    tiltY: { byteIndex: [8], min: -60, max: 60 },
  };

  beforeEach(() => {
    device = new MockTabletDevice({
      maxX: 16000,
      maxY: 9000,
    });
  });

  afterEach(() => {
    device.stop();
  });

  describe('Raw Bytes Flow', () => {
    it('should process raw bytes through data helpers correctly', (done) => {
      device.addEventListener('inputreport', (data: Uint8Array) => {
        const processed = processDeviceData(data, byteCodeMappings);

        expect(processed).toBeDefined();
        expect(typeof processed.x).toBe('number');
        expect(typeof processed.y).toBe('number');

        device.stop();
        done();
      });

      device.playCircle();
    });

    it('should produce consistent results from raw bytes', (done) => {
      const results: any[] = [];

      device.addEventListener('inputreport', (data: Uint8Array) => {
        const processed = processDeviceData(data, byteCodeMappings);
        results.push(processed);

        if (results.length >= 5) {
          device.stop();

          // Check that all results have the expected structure
          results.forEach(result => {
            expect(result).toHaveProperty('x');
            expect(result).toHaveProperty('y');
            expect(result).toHaveProperty('pressure');
          });

          done();
        }
      });

      device.playCircle();
    });

    it('should handle different gesture patterns', (done) => {
      const gestures = [
        { name: 'circle', action: () => device.playCircle() },
        { name: 'line', action: () => device.playLine() },
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
          const processed = processDeviceData(data, byteCodeMappings);

          expect(processed).toBeDefined();
          expect(typeof processed.x).toBe('number');
          expect(typeof processed.y).toBe('number');

          eventCount++;

          if (eventCount >= 3) {
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

  describe('Translated Events Flow', () => {
    beforeEach(() => {
      device.setTranslateEvents(true, byteCodeMappings);
    });

    it('should emit pre-translated events', (done) => {
      device.addEventListener('tablet-event', (data: Uint8Array) => {
        const jsonStr = new TextDecoder().decode(data);
        const translated = JSON.parse(jsonStr);

        expect(translated).toHaveProperty('x');
        expect(translated).toHaveProperty('y');
        expect(typeof translated.x).toBe('number');
        expect(typeof translated.y).toBe('number');

        device.stop();
        done();
      });

      device.playCircle();
    });

    it('should produce equivalent results to manual processing', (done) => {
      let rawData: Uint8Array | null = null;
      let translatedData: any = null;

      device.addEventListener('inputreport', (data: Uint8Array) => {
        rawData = data;
      });

      device.addEventListener('tablet-event', (data: Uint8Array) => {
        const jsonStr = new TextDecoder().decode(data);
        translatedData = JSON.parse(jsonStr);

        if (rawData && translatedData) {
          const manuallyProcessed = processDeviceData(rawData, byteCodeMappings);

          // Compare values (allowing for small floating point differences)
          expect(Math.abs(translatedData.x - manuallyProcessed.x)).toBeLessThan(0.001);
          expect(Math.abs(translatedData.y - manuallyProcessed.y)).toBeLessThan(0.001);

          device.stop();
          done();
        }
      });

      device.playCircle();
    });
  });
});

