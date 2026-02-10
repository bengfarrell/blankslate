/**
 * Unit tests for byte-detector module
 * 
 * Tests byte analysis and detection algorithms.
 * Ported from Python's test_byte_detector.py
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeBytes,
  getBestGuessBytesByVariance,
  calculateMultiByteMax,
  calculateBipolarRange,
  findStatusByte,
} from '../../src/utils/byte-detector.js';

describe('Byte Detector', () => {
  describe('analyzeBytes', () => {
    it('should analyze simple packet data', () => {
      const packets = [
        new Uint8Array([0, 10, 20, 30]),
        new Uint8Array([0, 15, 25, 35]),
        new Uint8Array([0, 20, 30, 40]),
      ];

      const analysis = analyzeBytes(packets);

      expect(analysis.length).toBe(4);
      expect(analysis[0].byteIndex).toBe(0);
      expect(analysis[0].min).toBe(0);
      expect(analysis[0].max).toBe(0);
      expect(analysis[0].variance).toBe(0);

      expect(analysis[1].min).toBe(10);
      expect(analysis[1].max).toBe(20);
      expect(analysis[1].variance).toBe(10);
    });

    it('should handle empty packet list', () => {
      const packets: Uint8Array[] = [];
      const analysis = analyzeBytes(packets);

      expect(analysis).toEqual([]);
    });

    it('should calculate variance correctly', () => {
      const packets = [
        new Uint8Array([0, 0, 255]),
        new Uint8Array([0, 128, 128]),
        new Uint8Array([0, 255, 0]),
      ];

      const analysis = analyzeBytes(packets);

      expect(analysis[1].variance).toBe(255); // 0 to 255
      expect(analysis[2].variance).toBe(255); // 0 to 255
    });
  });

  describe('getBestGuessBytesByVariance', () => {
    it('should find single high-variance byte', () => {
      const packets = [
        new Uint8Array([0, 10, 20, 30]),
        new Uint8Array([0, 100, 25, 35]),
        new Uint8Array([0, 200, 30, 40]),
      ];

      const analysis = analyzeBytes(packets);
      const result = getBestGuessBytesByVariance(analysis, 1, 50);

      expect(result.length).toBe(1);
      expect(result[0].byteIndex).toBe(1); // Highest variance
    });

    it('should find high-variance bytes', () => {
      const packets = [
        new Uint8Array([2, 10, 20, 5, 100]),
        new Uint8Array([2, 50, 60, 5, 150]),
        new Uint8Array([2, 100, 120, 5, 200]),
      ];

      const analysis = analyzeBytes(packets);
      const result = getBestGuessBytesByVariance(analysis, 3, 50);

      // Should find bytes with variance >= 50 (bytes 1, 2, and 4)
      expect(result.length).toBeGreaterThanOrEqual(2);
      // At least one result should have high variance
      expect(result.some(b => b.variance >= 50)).toBe(true);
    });

    it('should filter out low-variance bytes', () => {
      const packets = [
        new Uint8Array([0, 5, 200, 10]),
        new Uint8Array([0, 6, 250, 11]),
        new Uint8Array([0, 7, 100, 12]),
      ];

      const analysis = analyzeBytes(packets);
      const result = getBestGuessBytesByVariance(analysis, 3, 50);

      // Only byte 2 has variance > 50
      expect(result.length).toBeLessThanOrEqual(2);
    });
  });

  describe('calculateMultiByteMax', () => {
    it('should calculate max from two-byte values', () => {
      const packets = [
        new Uint8Array([0, 0x34, 0x12, 0]), // 0x1234 = 4660
        new Uint8Array([0, 0xff, 0x00, 0]), // 0x00FF = 255
        new Uint8Array([0, 0x00, 0x01, 0]), // 0x0100 = 256
      ];

      const maxVal = calculateMultiByteMax([1, 2], packets);

      expect(maxVal).toBe(4660);
    });

    it('should return default for empty packets', () => {
      const packets: Uint8Array[] = [];
      const maxVal = calculateMultiByteMax([1, 2], packets);

      expect(maxVal).toBe(0);
    });

    it('should return sensible default for all zeros', () => {
      const packets = [
        new Uint8Array([0, 0, 0, 0]),
        new Uint8Array([0, 0, 0, 0]),
      ];

      const maxVal = calculateMultiByteMax([1, 2], packets);

      expect(maxVal).toBe(65535); // 16-bit default
    });
  });

  describe('calculateBipolarRange', () => {
    it('should calculate bipolar range for tilt data', () => {
      const packets = [
        new Uint8Array([0, 0, 0]),   // Neutral
        new Uint8Array([0, 30, 0]),  // Positive
        new Uint8Array([0, 60, 0]),  // Max positive
        new Uint8Array([0, 226, 0]), // Negative (256-30)
        new Uint8Array([0, 196, 0]), // Max negative (256-60)
      ];

      const result = calculateBipolarRange(1, packets);

      expect(result.positiveMax).toBe(60);
      expect(result.negativeMin).toBe(196);
      expect(result.negativeMax).toBe(226);
    });

    it('should return defaults for empty packets', () => {
      const packets: Uint8Array[] = [];
      const result = calculateBipolarRange(1, packets);

      expect(result.positiveMax).toBe(127);
      expect(result.negativeMin).toBe(128);
      expect(result.negativeMax).toBe(255);
    });
  });

  describe('findStatusByte', () => {
    it('should find status byte with discrete values', () => {
      const packets = [
        new Uint8Array([0, 160, 100, 200]), // Status byte at index 1
        new Uint8Array([0, 161, 105, 205]),
        new Uint8Array([0, 160, 110, 210]),
        new Uint8Array([0, 162, 115, 215]),
      ];

      const exclude = new Set([2, 3]); // Exclude coordinate bytes
      const result = findStatusByte(packets, exclude);

      expect(result).toBe(1);
    });

    it('should return null when no suitable status byte found', () => {
      const packets = [
        new Uint8Array([0, 0, 0, 0]),
        new Uint8Array([0, 0, 0, 0]),
      ];

      const exclude = new Set<number>();
      const result = findStatusByte(packets, exclude);

      expect(result).toBeNull();
    });

    it('should exclude specified indices from search', () => {
      const packets = [
        new Uint8Array([0, 160, 100, 200]),
        new Uint8Array([0, 161, 105, 205]),
        new Uint8Array([0, 160, 110, 210]),
      ];

      const exclude = new Set([1]); // Exclude the actual status byte
      const result = findStatusByte(packets, exclude);

      // Should not return index 1
      expect(result).not.toBe(1);
    });
  });
});
