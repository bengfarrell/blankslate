import { describe, it, expect } from 'vitest';
import {
  inferCapabilities,
  detectDigitizerUsagePage,
  detectStylusModeStatusByte,
  detectExcludedUsagePages,
  generateCompleteConfig,
  type DeviceMetadata,
  type UserProvidedMetadata,
} from '../../src/utils/metadata-generator.js';
import type { DeviceByteCodeMappings } from '../../src/utils/byte-detector.js';

describe('Metadata Generator', () => {
  describe('inferCapabilities', () => {
    it('should infer capabilities from byte mappings', () => {
      const byteCodeMappings: DeviceByteCodeMappings = {
        x: { byteIndex: [2, 3], max: 16000, type: 'multi-byte-range' },
        y: { byteIndex: [4, 5], max: 9000, type: 'multi-byte-range' },
        pressure: { byteIndex: [6, 7], max: 16383, type: 'multi-byte-range' },
        tiltX: { byteIndex: [8], positiveMax: 127, negativeMin: 128, negativeMax: 255, type: 'bipolar-range' },
        tiltY: { byteIndex: [9], positiveMax: 127, negativeMin: 128, negativeMax: 255, type: 'bipolar-range' },
      };

      const capabilities = inferCapabilities(byteCodeMappings);

      expect(capabilities.hasPressure).toBe(true);
      expect(capabilities.hasTilt).toBe(true);
      expect(capabilities.pressureLevels).toBe(16384); // 2^14
      expect(capabilities.resolution.x).toBe(16000);
      expect(capabilities.resolution.y).toBe(9000);
    });

    it('should handle device without tilt', () => {
      const byteCodeMappings: DeviceByteCodeMappings = {
        x: { byteIndex: [2, 3], max: 10000, type: 'multi-byte-range' },
        y: { byteIndex: [4, 5], max: 6000, type: 'multi-byte-range' },
        pressure: { byteIndex: [6, 7], max: 8191, type: 'multi-byte-range' },
      };

      const capabilities = inferCapabilities(byteCodeMappings);

      expect(capabilities.hasTilt).toBe(false);
      expect(capabilities.pressureLevels).toBe(8192); // 2^13
    });
  });

  describe('detectDigitizerUsagePage', () => {
    it('should detect digitizer usage page from collections', () => {
      const collections = [
        { usagePage: 13, usage: 2 }, // Digitizer - Pen
        { usagePage: 1, usage: 6 },  // Generic Desktop - Keyboard
      ];

      const usagePage = detectDigitizerUsagePage(collections);
      expect(usagePage).toBe(13);
    });

    it('should return default when no collections provided', () => {
      const usagePage = detectDigitizerUsagePage(undefined);
      expect(usagePage).toBe(13);
    });

    it('should fallback to first collection if no digitizer found', () => {
      const collections = [
        { usagePage: 1, usage: 6 },  // Generic Desktop - Keyboard
      ];

      const usagePage = detectDigitizerUsagePage(collections);
      expect(usagePage).toBe(1);
    });
  });

  describe('detectStylusModeStatusByte', () => {
    it('should detect hover status byte', () => {
      const byteCodeMappings: DeviceByteCodeMappings = {
        x: { byteIndex: [2, 3], max: 16000, type: 'multi-byte-range' },
        y: { byteIndex: [4, 5], max: 9000, type: 'multi-byte-range' },
        pressure: { byteIndex: [6, 7], max: 16383, type: 'multi-byte-range' },
        status: {
          byteIndex: [1],
          type: 'code',
          values: {
            '160': { state: 'hover' },
            '161': { state: 'contact' },
            '192': { state: 'none' },
          },
        },
      };

      const statusByte = detectStylusModeStatusByte(byteCodeMappings);
      expect(statusByte).toBe(160);
    });

    it('should return undefined when no status config', () => {
      const byteCodeMappings: DeviceByteCodeMappings = {
        x: { byteIndex: [2, 3], max: 16000, type: 'multi-byte-range' },
        y: { byteIndex: [4, 5], max: 9000, type: 'multi-byte-range' },
        pressure: { byteIndex: [6, 7], max: 16383, type: 'multi-byte-range' },
      };

      const statusByte = detectStylusModeStatusByte(byteCodeMappings);
      expect(statusByte).toBeUndefined();
    });
  });

  describe('detectExcludedUsagePages', () => {
    it('should exclude non-digitizer interfaces', () => {
      const allInterfaces = [13, 65290, 1];
      const digitizerUsagePage = 13;

      const excluded = detectExcludedUsagePages(allInterfaces, digitizerUsagePage);
      expect(excluded).toEqual([65290, 1]);
    });

    it('should return empty array when no interfaces', () => {
      const excluded = detectExcludedUsagePages(undefined, 13);
      expect(excluded).toEqual([]);
    });
  });

  describe('generateCompleteConfig', () => {
    it('should generate complete configuration', () => {
      const deviceMetadata: DeviceMetadata = {
        vendorId: 0x28bd,
        productId: 0x2904,
        productName: 'Deco 640',
        collections: [
          { usagePage: 13, usage: 2 },
        ],
        allInterfaces: [13, 65290],
        detectedReportId: 7,
      };

      const userMetadata: UserProvidedMetadata = {
        name: 'XP-Pen Deco 640',
        manufacturer: 'XP-Pen',
        model: 'Deco 640',
        description: 'XP-Pen Deco 640 graphics tablet',
        buttonCount: 8,
      };

      const byteCodeMappings: DeviceByteCodeMappings = {
        x: { byteIndex: [2, 3], max: 16000, type: 'multi-byte-range' },
        y: { byteIndex: [4, 5], max: 9000, type: 'multi-byte-range' },
        pressure: { byteIndex: [6, 7], max: 16383, type: 'multi-byte-range' },
        status: {
          byteIndex: [1],
          type: 'code',
          values: {
            '160': { state: 'hover' },
            '161': { state: 'contact' },
          },
        },
      };

      const config = generateCompleteConfig(deviceMetadata, userMetadata, byteCodeMappings);

      expect(config.name).toBe('XP-Pen Deco 640');
      expect(config.manufacturer).toBe('XP-Pen');
      expect(config.vendorId).toBe('0x28bd');
      expect(config.productId).toBe('0x2904');
      expect(config.reportId).toBe(7);
      expect(config.digitizerUsagePage).toBe(13);
      expect(config.stylusModeStatusByte).toBe(160);
      // When buttons are configured, we don't exclude any usage pages (they may contain button data)
      expect(config.excludedUsagePages).toBeUndefined();
      expect(config.capabilities.hasButtons).toBe(true);
      expect(config.capabilities.buttonCount).toBe(8);
      expect(config.capabilities.hasPressure).toBe(true);
      expect(config.capabilities.hasTilt).toBe(false);
      expect(config.deviceInfo.vendor_id).toBe(0x28bd);
      expect(config.deviceInfo.product_id).toBe(0x2904);
      expect(config.deviceInfo.product_string).toBe('Deco 640');
    });
  });
});

