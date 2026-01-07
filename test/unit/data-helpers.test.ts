import { describe, it, expect } from 'vitest';
import {
  parseCode,
  parseRangeData,
  parseMultiByteRangeData,
  parseBipolarRangeData,
  parseBitFlags,
} from '../../src/utils/data-helpers';

describe('Data Helpers', () => {
  describe('parseCode', () => {
    it('should parse known code values', () => {
      const data = [0, 160, 0];
      const values = {
        '160': { state: 'stylus', mode: 'active' },
        '2': { state: 'buttons' },
      };

      const result = parseCode(data, 1, values);
      expect(result).toEqual({ state: 'stylus', mode: 'active' });
    });

    it('should return byte value for unknown codes', () => {
      const data = [0, 99, 0];
      const values = {
        '160': { state: 'stylus' },
      };

      const result = parseCode(data, 1, values);
      expect(result).toBe('99');
    });

    it('should handle out of bounds index', () => {
      const data = [0, 160];
      const values = { '160': { state: 'stylus' } };

      const result = parseCode(data, 5, values);
      expect(result).toBeNull();
    });

    it('should handle empty values map', () => {
      const data = [0, 160];
      const values = {};

      const result = parseCode(data, 1, values);
      expect(result).toBe('160');
    });
  });

  describe('parseRangeData', () => {
    it('should normalize byte value to 0-1 range', () => {
      const data = [0, 128, 0];
      const result = parseRangeData(data, 1, 0, 255);
      
      expect(result).toBeCloseTo(0.502, 2);
    });

    it('should return 0 for minimum value', () => {
      const data = [0, 0, 0];
      const result = parseRangeData(data, 1, 0, 255);
      
      expect(result).toBe(0);
    });

    it('should return 1 for maximum value', () => {
      const data = [0, 255, 0];
      const result = parseRangeData(data, 1, 0, 255);
      
      expect(result).toBe(1);
    });

    it('should handle custom ranges', () => {
      const data = [0, 150, 0];
      const result = parseRangeData(data, 1, 100, 200);
      
      expect(result).toBeCloseTo(0.5, 2);
    });

    it('should return 0 for out of bounds index', () => {
      const data = [0, 128];
      const result = parseRangeData(data, 5, 0, 255);
      
      expect(result).toBe(0);
    });

    it('should return 0 when min equals max', () => {
      const data = [0, 128, 0];
      const result = parseRangeData(data, 1, 100, 100);
      
      expect(result).toBe(0);
    });
  });

  describe('parseMultiByteRangeData', () => {
    it('should parse 2-byte little-endian value', () => {
      const data = [0, 0xFF, 0x00]; // 255 in little-endian
      const result = parseMultiByteRangeData(data, [1, 2], 0, 65535);
      
      expect(result).toBeCloseTo(0.00389, 3);
    });

    it('should parse 2-byte value at maximum', () => {
      const data = [0, 0xFF, 0xFF]; // 65535 in little-endian
      const result = parseMultiByteRangeData(data, [1, 2], 0, 65535);
      
      expect(result).toBe(1);
    });

    it('should parse 2-byte value at minimum', () => {
      const data = [0, 0x00, 0x00]; // 0 in little-endian
      const result = parseMultiByteRangeData(data, [1, 2], 0, 65535);
      
      expect(result).toBe(0);
    });

    it('should parse 3-byte little-endian value', () => {
      const data = [0, 0xFF, 0xFF, 0x00]; // 65535 in 3-byte little-endian
      const result = parseMultiByteRangeData(data, [1, 2, 3], 0, 16777215);
      
      expect(result).toBeCloseTo(0.00391, 3);
    });

    it('should parse 4-byte little-endian value', () => {
      const data = [0, 0xFF, 0x00, 0x00, 0x00]; // 255 in 4-byte little-endian
      const result = parseMultiByteRangeData(data, [1, 2, 3, 4], 0, 4294967295);
      
      expect(result).toBeGreaterThan(0);
    });

    it('should handle out of bounds indices', () => {
      const data = [0, 0xFF];
      const result = parseMultiByteRangeData(data, [1, 5], 0, 65535);
      
      expect(result).toBe(0);
    });

    it('should return 0 when min equals max', () => {
      const data = [0, 0xFF, 0xFF];
      const result = parseMultiByteRangeData(data, [1, 2], 100, 100);
      
      expect(result).toBe(0);
    });

    it('should handle single byte index', () => {
      const data = [0, 128];
      const result = parseMultiByteRangeData(data, [1], 0, 255);
      
      expect(result).toBeCloseTo(0.502, 2);
    });

    it('should correctly calculate multi-byte values', () => {
      // Test specific bit pattern: low byte = 0x64 (100), high byte = 0x00
      const data = [0, 100, 0];
      const result = parseMultiByteRangeData(data, [1, 2], 0, 65535);
      
      // 100 / 65535 ≈ 0.001526
      expect(result).toBeCloseTo(0.001526, 4);
    });
  });

  describe('parseBipolarRangeData', () => {
    it('should parse positive values', () => {
      const data = [0, 200, 0];
      const result = parseBipolarRangeData(data, 1, 128, 255, 0, 127);
      
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(1);
    });

    it('should parse negative values', () => {
      const data = [0, 50, 0];
      const result = parseBipolarRangeData(data, 1, 128, 255, 0, 127);
      
      expect(result).toBeLessThan(0);
      expect(result).toBeGreaterThanOrEqual(-1);
    });

    it('should return maximum positive value', () => {
      const data = [0, 255, 0];
      const result = parseBipolarRangeData(data, 1, 128, 255, 0, 127);
      
      expect(result).toBe(1);
    });

    it('should return maximum negative value', () => {
      const data = [0, 0, 0];
      const result = parseBipolarRangeData(data, 1, 128, 255, 0, 127);
      
      // At negativeMin (0), should return -1 (maximum negative)
      // Formula: -((negativeMax - value) / (negativeMax - negativeMin)) = -((127 - 0) / (127 - 0)) = -1
      expect(result).toBe(-1);
    });

    it('should return 0 at positive minimum boundary', () => {
      const data = [0, 128, 0];
      const result = parseBipolarRangeData(data, 1, 128, 255, 0, 127);
      
      expect(result).toBe(0);
    });

    it('should handle out of bounds index', () => {
      const data = [0, 200];
      const result = parseBipolarRangeData(data, 5, 128, 255, 0, 127);
      
      expect(result).toBe(0);
    });

    it('should handle value outside both ranges', () => {
      const data = [0, 64, 0];
      // Value 64 is within negative range (0-127)
      const result = parseBipolarRangeData(data, 1, 128, 255, 0, 127);
      
      expect(result).toBeLessThan(0);
    });

    it('should return 0 when positive min equals max', () => {
      const data = [0, 200, 0];
      const result = parseBipolarRangeData(data, 1, 100, 100, 0, 50);
      
      expect(result).toBe(0);
    });

    it('should return 0 when negative min equals max', () => {
      const data = [0, 50, 0];
      const result = parseBipolarRangeData(data, 1, 100, 200, 50, 50);
      
      expect(result).toBe(0);
    });

    it('should handle symmetric tilt ranges', () => {
      // Common tablet tilt configuration
      const data = [0, 192, 0]; // Positive tilt
      const result = parseBipolarRangeData(data, 1, 128, 255, 0, 127);
      
      // (192 - 128) / (255 - 128) = 64 / 127 ≈ 0.504
      expect(result).toBeCloseTo(0.504, 2);
    });
  });

  describe('parseBitFlags', () => {
    it('should parse button states from byte', () => {
      const data = [0, 0b00000101]; // Buttons 1 and 3 pressed
      const result = parseBitFlags(data, 1, 8);
      
      expect(result.button1).toBe(true);
      expect(result.button2).toBe(false);
      expect(result.button3).toBe(true);
      expect(result.button4).toBe(false);
      expect(result.button5).toBe(false);
      expect(result.button6).toBe(false);
      expect(result.button7).toBe(false);
      expect(result.button8).toBe(false);
    });

    it('should handle all buttons pressed', () => {
      const data = [0, 0xFF]; // All bits set
      const result = parseBitFlags(data, 1, 8);
      
      for (let i = 1; i <= 8; i++) {
        expect(result[`button${i}`]).toBe(true);
      }
    });

    it('should handle no buttons pressed', () => {
      const data = [0, 0x00]; // No bits set
      const result = parseBitFlags(data, 1, 8);
      
      for (let i = 1; i <= 8; i++) {
        expect(result[`button${i}`]).toBe(false);
      }
    });

    it('should handle different button counts', () => {
      const data = [0, 0b0011]; // Buttons 1 and 2 pressed
      const result = parseBitFlags(data, 1, 4);
      
      expect(result.button1).toBe(true);
      expect(result.button2).toBe(true);
      expect(result.button3).toBe(false);
      expect(result.button4).toBe(false);
      expect(result.button5).toBeUndefined();
    });

    it('should handle out of bounds index', () => {
      const data = [0, 0xFF];
      const result = parseBitFlags(data, 5, 8);
      
      expect(Object.keys(result)).toHaveLength(0);
    });

    it('should parse individual bit positions correctly', () => {
      // Test each bit position individually
      for (let i = 0; i < 8; i++) {
        const data = [0, 1 << i]; // Set only bit i
        const result = parseBitFlags(data, 1, 8);
        
        for (let j = 1; j <= 8; j++) {
          if (j === i + 1) {
            expect(result[`button${j}`]).toBe(true);
          } else {
            expect(result[`button${j}`]).toBe(false);
          }
        }
      }
    });

    it('should handle alternating pattern', () => {
      const data = [0, 0b10101010]; // Buttons 2, 4, 6, 8
      const result = parseBitFlags(data, 1, 8);
      
      expect(result.button1).toBe(false);
      expect(result.button2).toBe(true);
      expect(result.button3).toBe(false);
      expect(result.button4).toBe(true);
      expect(result.button5).toBe(false);
      expect(result.button6).toBe(true);
      expect(result.button7).toBe(false);
      expect(result.button8).toBe(true);
    });

    it('should handle 16 buttons', () => {
      const data = [0, 0xFF]; // Lower 8 bits
      const result = parseBitFlags(data, 1, 16);
      
      // First 8 buttons should be true
      for (let i = 1; i <= 8; i++) {
        expect(result[`button${i}`]).toBe(true);
      }
      // Last 8 buttons should be false (bits 8-15 not set)
      for (let i = 9; i <= 16; i++) {
        expect(result[`button${i}`]).toBe(false);
      }
    });
  });

  describe('Edge Cases and Integration', () => {
    it('should handle empty data array', () => {
      const data: number[] = [];
      
      expect(parseCode(data, 0, {})).toBeNull();
      expect(parseRangeData(data, 0, 0, 255)).toBe(0);
      expect(parseMultiByteRangeData(data, [0], 0, 255)).toBe(0);
      expect(parseBipolarRangeData(data, 0, 128, 255, 0, 127)).toBe(0);
      expect(parseBitFlags(data, 0, 8)).toEqual({});
    });

    it('should handle single byte data', () => {
      const data = [128];
      
      expect(parseRangeData(data, 0, 0, 255)).toBeCloseTo(0.502, 2);
      expect(parseBitFlags(data, 0, 8).button1).toBe(false);
    });

    it('should handle large data arrays', () => {
      const data = new Array(1000).fill(0);
      data[500] = 255;
      
      expect(parseRangeData(data, 500, 0, 255)).toBe(1);
      expect(parseBitFlags(data, 500, 8).button1).toBe(true);
    });
  });
});

