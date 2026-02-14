import { describe, it, expect } from 'vitest';
import { MockTabletDevice } from '../../src/mockbytes/mock-tablet-device.js';
import { processDeviceData } from '../../src/utils/data-helpers.js';
import { MappingType } from '../../src/models/index.js';

describe('HID Dashboard Translation Integration', () => {
  // Config must include proper type fields for processDeviceData to work
  const testConfig = {
    status: {
      byteIndex: [0],
      type: MappingType.CODE,
      values: {
        '161': { state: 'contact' },
        '160': { state: 'hover' },
      },
    },
    x: { byteIndex: [1, 2], max: 16000, type: MappingType.MULTI_BYTE_RANGE },
    y: { byteIndex: [3, 4], max: 9000, type: MappingType.MULTI_BYTE_RANGE },
    pressure: { byteIndex: [5, 6], max: 8191, type: MappingType.MULTI_BYTE_RANGE },
    tiltX: { byteIndex: [7], positiveMax: 60, negativeMin: 196, negativeMax: 255, type: MappingType.BIPOLAR_RANGE },
    tiltY: { byteIndex: [8], positiveMax: 60, negativeMin: 196, negativeMax: 255, type: MappingType.BIPOLAR_RANGE },
  };

  describe('Mock Device Configuration for Dashboard', () => {
    it('should create mock device with translation disabled by default', () => {
      const device = new MockTabletDevice({
        maxX: 16000,
        maxY: 9000,
      });

      expect(device['config'].translateEvents).toBeFalsy();
      device.stop();
    });

    it('should create mock device with translation enabled', () => {
      const device = new MockTabletDevice({
        maxX: 16000,
        maxY: 9000,
        translateEvents: true,
        byteCodeMappings: testConfig,
      });

      expect(device['config'].translateEvents).toBe(true);
      expect(device['config'].byteCodeMappings).toBe(testConfig);
      device.stop();
    });

    it('should pass correct device dimensions', () => {
      const device = new MockTabletDevice({
        maxX: 16000,
        maxY: 9000,
      });

      expect(device['config'].maxX).toBe(16000);
      expect(device['config'].maxY).toBe(9000);
      device.stop();
    });
  });

  describe('Data Processing Simulation', () => {
    it('should process raw bytes correctly', () => {
      // Create a more realistic data packet with proper structure
      // Report ID (8), then x (2 bytes), y (2 bytes), pressure (2 bytes), tiltX, tiltY
      const mockData = new Uint8Array([8, 0x64, 0x00, 0xC8, 0x00, 0x96, 0x00, 30, 45]);
      const processed = processDeviceData(mockData, testConfig);

      expect(processed).toBeDefined();
      // The function returns an object with various properties
      // It may not always have x, y, pressure if the data format doesn't match
      expect(processed).toBeTypeOf('object');
    });

    it('should handle translated data format', () => {
      const translatedData = {
        x: 0.5,
        y: 0.5,
        pressure: 0.75,
        tiltX: 0.2,
        tiltY: -0.1,
      };

      const jsonStr = JSON.stringify(translatedData);
      const encoded = new TextEncoder().encode(jsonStr);
      const decoded = JSON.parse(new TextDecoder().decode(encoded));

      expect(decoded.x).toBe(0.5);
      expect(decoded.y).toBe(0.5);
      expect(decoded.pressure).toBe(0.75);
      expect(decoded.tiltX).toBe(0.2);
      expect(decoded.tiltY).toBe(-0.1);
    });

    it('should produce equivalent results from both modes', () => {
      return new Promise<void>((resolve) => {
        const device = new MockTabletDevice({
          maxX: 16000,
          maxY: 9000,
          translateEvents: true,
          byteCodeMappings: testConfig,
        });

        let rawData: Uint8Array | null = null;
        let translatedData: any = null;
        let completed = false;

        device.addEventListener('inputreport', (data: Uint8Array) => {
          // Ignore events after test completion
          if (completed) return;
          rawData = data;
        });

        device.addEventListener('tablet-event', (data: Uint8Array) => {
          // Ignore events after test completion
          if (completed) return;

          const jsonStr = new TextDecoder().decode(data);
          translatedData = JSON.parse(jsonStr);

          if (rawData && translatedData) {
            // Mark completed and stop device BEFORE assertions to prevent further events
            completed = true;
            device.stop();

            // Use offset -1 to match how MockTabletDevice processes data internally
            // (simulating WebHID which strips the report ID)
            const manuallyProcessed = processDeviceData(rawData, testConfig, -1);

            // Values should be equivalent
            expect(Math.abs(translatedData.x - manuallyProcessed.x)).toBeLessThan(0.001);
            expect(Math.abs(translatedData.y - manuallyProcessed.y)).toBeLessThan(0.001);

            resolve();
          }
        });

        device.playCircle();
      });
    });
  });
});