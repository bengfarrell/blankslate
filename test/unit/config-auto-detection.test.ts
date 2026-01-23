import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock node-hid before importing the module
vi.mock('node-hid', () => ({
  default: {
    devices: vi.fn(() => []),
  },
}));

// Import after mocking
import HID from 'node-hid';
import { findConfigForDevice, resolveConfigPath } from '../../src/cli/tablet-reader-base';

describe('Config Auto-Detection', () => {
  const testConfigDir = path.join(__dirname, 'test-configs');
  const xpPenConfig = {
    name: 'XP-Pen Deco 640',
    deviceInfo: {
      vendor_id: 0x28bd,
      product_id: 0x0042,
    },
  };
  const wacomConfig = {
    name: 'Wacom Intuos',
    deviceInfo: {
      vendor_id: 0x056a,
      product_id: 0x0357,
    },
  };

  beforeEach(() => {
    // Create test config directory
    if (!fs.existsSync(testConfigDir)) {
      fs.mkdirSync(testConfigDir, { recursive: true });
    }
    // Write test config files
    fs.writeFileSync(
      path.join(testConfigDir, 'xp-pen.json'),
      JSON.stringify(xpPenConfig, null, 2)
    );
    fs.writeFileSync(
      path.join(testConfigDir, 'wacom.json'),
      JSON.stringify(wacomConfig, null, 2)
    );
    // Write an invalid JSON file to test error handling
    fs.writeFileSync(
      path.join(testConfigDir, 'invalid.json'),
      'not valid json {'
    );
    // Write a config without deviceInfo
    fs.writeFileSync(
      path.join(testConfigDir, 'no-device-info.json'),
      JSON.stringify({ name: 'No Device Info' }, null, 2)
    );
  });

  afterEach(() => {
    // Clean up test config directory
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true });
    }
    vi.clearAllMocks();
  });

  describe('findConfigForDevice', () => {
    it('should return null for non-existent directory', () => {
      const result = findConfigForDevice('/non/existent/path');
      expect(result).toBeNull();
    });

    it('should return null when no tablet devices are connected', () => {
      vi.mocked(HID.devices).mockReturnValue([]);
      const result = findConfigForDevice(testConfigDir);
      expect(result).toBeNull();
    });

    it('should find matching config for connected XP-Pen device', () => {
      vi.mocked(HID.devices).mockReturnValue([
        { vendorId: 0x28bd, productId: 0x0042, usagePage: 13 },
      ]);
      const result = findConfigForDevice(testConfigDir);
      expect(result).toBe(path.join(testConfigDir, 'xp-pen.json'));
    });

    it('should find matching config for connected Wacom device', () => {
      vi.mocked(HID.devices).mockReturnValue([
        { vendorId: 0x056a, productId: 0x0357, usagePage: 13 },
      ]);
      const result = findConfigForDevice(testConfigDir);
      expect(result).toBe(path.join(testConfigDir, 'wacom.json'));
    });

    it('should return null when connected device has no matching config', () => {
      vi.mocked(HID.devices).mockReturnValue([
        { vendorId: 0x28bd, productId: 0x9999, usagePage: 13 }, // Unknown product
      ]);
      const result = findConfigForDevice(testConfigDir);
      expect(result).toBeNull();
    });

    it('should filter devices by tablet vendor IDs', () => {
      vi.mocked(HID.devices).mockReturnValue([
        { vendorId: 0x1234, productId: 0x5678, usagePage: 1 }, // Not a tablet
        { vendorId: 0x28bd, productId: 0x0042, usagePage: 1 }, // XP-Pen (known vendor)
      ]);
      const result = findConfigForDevice(testConfigDir);
      expect(result).toBe(path.join(testConfigDir, 'xp-pen.json'));
    });

    it('should filter devices by digitizer usage page', () => {
      vi.mocked(HID.devices).mockReturnValue([
        { vendorId: 0x28bd, productId: 0x0042, usagePage: 13 }, // Digitizer
      ]);
      const result = findConfigForDevice(testConfigDir);
      expect(result).toBe(path.join(testConfigDir, 'xp-pen.json'));
    });

    it('should handle empty config directory', () => {
      const emptyDir = path.join(__dirname, 'empty-configs');
      fs.mkdirSync(emptyDir, { recursive: true });
      try {
        const result = findConfigForDevice(emptyDir);
        expect(result).toBeNull();
      } finally {
        fs.rmSync(emptyDir, { recursive: true });
      }
    });

    it('should skip invalid JSON files gracefully', () => {
      vi.mocked(HID.devices).mockReturnValue([
        { vendorId: 0x28bd, productId: 0x0042, usagePage: 13 },
      ]);
      // Should still find valid config despite invalid.json existing
      const result = findConfigForDevice(testConfigDir);
      expect(result).toBe(path.join(testConfigDir, 'xp-pen.json'));
    });

    it('should skip configs without deviceInfo', () => {
      vi.mocked(HID.devices).mockReturnValue([
        { vendorId: 0x1111, productId: 0x2222, usagePage: 13 },
      ]);
      // no-device-info.json should be skipped
      const result = findConfigForDevice(testConfigDir);
      expect(result).toBeNull();
    });
  });

  describe('resolveConfigPath', () => {
    it('should return .json file path directly', () => {
      const jsonPath = '/path/to/config.json';
      const result = resolveConfigPath(jsonPath);
      expect(result).toBe(jsonPath);
    });

    it('should search directory when given a directory path', () => {
      vi.mocked(HID.devices).mockReturnValue([
        { vendorId: 0x28bd, productId: 0x0042, usagePage: 13 },
      ]);
      const result = resolveConfigPath(testConfigDir);
      expect(result).toBe(path.join(testConfigDir, 'xp-pen.json'));
    });

    it('should throw when no matching config found in directory', () => {
      vi.mocked(HID.devices).mockReturnValue([]);
      expect(() => resolveConfigPath(testConfigDir)).toThrow(
        /No matching config found/
      );
    });

    it('should use default directory when path does not exist', () => {
      vi.mocked(HID.devices).mockReturnValue([
        { vendorId: 0x28bd, productId: 0x0042, usagePage: 13 },
      ]);
      const result = resolveConfigPath('nonexistent', testConfigDir);
      expect(result).toBe(path.join(testConfigDir, 'xp-pen.json'));
    });

    it('should throw when default directory has no matching config', () => {
      vi.mocked(HID.devices).mockReturnValue([]);
      expect(() => resolveConfigPath('nonexistent', testConfigDir)).toThrow(
        /No matching config found/
      );
    });
  });
});
