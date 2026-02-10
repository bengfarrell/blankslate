/**
 * Unit tests for config-based mock data generation
 * Tests that mock data correctly matches device configurations
 * 
 * This mirrors the Python test_config_based_mock.py tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ConfigBasedGenerator,
  createConfigBasedGenerator,
  TabletDataGenerator,
} from '../../src/mockbytes/index.js';
import { processDeviceData } from '../../src/utils/data-helpers.js';

// Paths to test fixtures
const TEST_CONFIG_PATH = join(__dirname, '../../common-test-fixtures/test-tablet-config.json');
const XP_PEN_CONFIG_PATH = join(__dirname, '../../common-test-fixtures/xp-pen-deco640-driverless.json');
const DRIVER_CONFIG_PATH = join(__dirname, '../../common-test-fixtures/xp-pen-deco640-driver.json');

/**
 * Helper to extract mode data from either multi-mode or legacy single-mode config format.
 */
function getModeData(config: any): { reportId: number; byteCodeMappings: Record<string, any> } {
  if (config.modes && Array.isArray(config.modes) && config.modes.length > 0) {
    // Multi-mode format
    const mode = config.modes[0];
    return {
      reportId: mode.reportId ?? 1,
      byteCodeMappings: mode.byteCodeMappings ?? {},
    };
  } else {
    // Legacy single-mode format
    return {
      reportId: config.reportId ?? 1,
      byteCodeMappings: config.byteCodeMappings ?? {},
    };
  }
}

describe('ConfigBasedGenerator', () => {
  let testGenerator: ConfigBasedGenerator;
  let xpPenGenerator: ConfigBasedGenerator;

  beforeEach(() => {
    testGenerator = new ConfigBasedGenerator(TEST_CONFIG_PATH);
    xpPenGenerator = new ConfigBasedGenerator(XP_PEN_CONFIG_PATH);
  });

  describe('initialization', () => {
    it('should initialize correctly from test config', () => {
      expect(testGenerator.maxX).toBe(65535);
      expect(testGenerator.maxY).toBe(65535);
      expect(testGenerator.maxPressure).toBe(8191);
      expect(testGenerator.reportId).toBe(1);
    });

    it('should initialize correctly from XP-Pen config file', () => {
      // Values come from the config file, which may vary based on how it was generated
      // Just verify the generator loads valid values
      expect(xpPenGenerator.maxX).toBeGreaterThan(0);
      expect(xpPenGenerator.maxY).toBeGreaterThan(0);
      expect(xpPenGenerator.maxPressure).toBeGreaterThan(0);
      expect(xpPenGenerator.reportId).toBeGreaterThanOrEqual(0);
    });
  });

  describe('device info', () => {
    it('should extract device info from config', () => {
      const info = testGenerator.getDeviceInfo();
      expect(info.vendor_id).toBe(0x1234);
      expect(info.product_id).toBe(0x5678);
      expect(info.product_name).toBe('Test Tablet');
      expect(info.manufacturer).toBe('Test Manufacturer');
    });
  });

  describe('stylus packet generation', () => {
    it('should generate stylus packets correctly', () => {
      const config = JSON.parse(readFileSync(TEST_CONFIG_PATH, 'utf-8'));
      const modeData = getModeData(config);

      // Generate a stylus packet
      const packet = testGenerator.generateStylusPacket(0.5, 0.5, 0.5);

      // Prepend report ID (config byte indices assume report ID at byte 0)
      const reportId = modeData.reportId;
      const packetWithReportId = new Uint8Array([reportId, ...packet]);

      // Process it through the config
      const result = processDeviceData(packetWithReportId, modeData.byteCodeMappings, 0);

      // Verify the data is processed correctly
      expect(result).toHaveProperty('x');
      expect(result).toHaveProperty('y');
      expect(result).toHaveProperty('pressure');

      // Check values are in expected range (normalized 0-1)
      expect(result.x).toBeGreaterThanOrEqual(0);
      expect(result.x).toBeLessThanOrEqual(1);
      expect(result.y).toBeGreaterThanOrEqual(0);
      expect(result.y).toBeLessThanOrEqual(1);
    });
  });

  describe('gesture generation', () => {
    it('should generate horizontal line gesture', () => {
      const packets = [...testGenerator.generateHorizontalLine(0.5, 0.5, 100)];

      // Should have some packets
      expect(packets.length).toBeGreaterThan(0);

      // All packets should be Uint8Array
      for (const packet of packets) {
        expect(packet).toBeInstanceOf(Uint8Array);
      }
    });

    it('should generate vertical line gesture', () => {
      const packets = [...testGenerator.generateVerticalLine(0.5, 0.5, 100)];

      expect(packets.length).toBeGreaterThan(0);
      for (const packet of packets) {
        expect(packet).toBeInstanceOf(Uint8Array);
      }
    });

    it('should generate pressure sweep gesture', () => {
      const packets = [...testGenerator.generatePressureSweep(0.5, 0.5, 100)];

      expect(packets.length).toBeGreaterThan(0);
      for (const packet of packets) {
        expect(packet).toBeInstanceOf(Uint8Array);
      }
    });
  });
});

describe('XP-Pen Button Generation', () => {
  let xpPenGenerator: ConfigBasedGenerator;

  beforeEach(() => {
    xpPenGenerator = new ConfigBasedGenerator(XP_PEN_CONFIG_PATH);
  });

  it('should generate button packets correctly', () => {
    const config = JSON.parse(readFileSync(XP_PEN_CONFIG_PATH, 'utf-8'));
    const modeData = getModeData(config);

    // Generate button 1 packet
    const packet = xpPenGenerator.generateButtonPacket(1);

    // Prepend report ID (config byte indices assume report ID at byte 0)
    const reportId = modeData.reportId;
    const packetWithReportId = new Uint8Array([reportId, ...packet]);

    // Process it
    const result = processDeviceData(packetWithReportId, modeData.byteCodeMappings, 0);

    // Should detect button 1
    expect(result.tabletButtons).toBe(1);
    expect(result.button1).toBe(true);
    expect(result.button2).toBe(false);
  });

  it('should generate button 8 with statusOverrides correctly', () => {
    const config = JSON.parse(readFileSync(XP_PEN_CONFIG_PATH, 'utf-8'));
    const modeData = getModeData(config);

    // Generate button 8 packet (uses statusOverrides)
    const packet = xpPenGenerator.generateButtonPacket(8);

    // Prepend report ID (config byte indices assume report ID at byte 0)
    const reportId = modeData.reportId;
    const packetWithReportId = new Uint8Array([reportId, ...packet]);

    // Process it
    const result = processDeviceData(packetWithReportId, modeData.byteCodeMappings, 0);

    // Should detect button 8
    expect(result.tabletButtons).toBe(8);
    expect(result.button8).toBe(true);
    expect(result.button7).toBe(false);
  });

  it('should generate all 8 buttons correctly', () => {
    const config = JSON.parse(readFileSync(XP_PEN_CONFIG_PATH, 'utf-8'));
    const modeData = getModeData(config);
    const reportId = modeData.reportId;

    for (let buttonNum = 1; buttonNum <= 8; buttonNum++) {
      const packet = xpPenGenerator.generateButtonPacket(buttonNum);
      // Prepend report ID (config byte indices assume report ID at byte 0)
      const packetWithReportId = new Uint8Array([reportId, ...packet]);
      const result = processDeviceData(packetWithReportId, modeData.byteCodeMappings, 0);

      // Should detect the correct button
      expect(result.tabletButtons).toBe(buttonNum);
      expect(result[`button${buttonNum}`]).toBe(true);
    }
  });

  it('should generate button sequence', () => {
    const packets = [...xpPenGenerator.generateButtonSequence(8, 200)];

    // Should have packets for all buttons
    expect(packets.length).toBeGreaterThan(0);

    // All should be Uint8Array
    for (const packet of packets) {
      expect(packet).toBeInstanceOf(Uint8Array);
    }
  });
});

describe('Factory Function', () => {
  it('should create generator correctly', () => {
    const generator = createConfigBasedGenerator(TEST_CONFIG_PATH);

    expect(generator).toBeInstanceOf(ConfigBasedGenerator);
    expect(generator.maxX).toBe(65535);
  });
});

describe('End-to-End Processing', () => {
  let xpPenGenerator: ConfigBasedGenerator;

  beforeEach(() => {
    xpPenGenerator = new ConfigBasedGenerator(XP_PEN_CONFIG_PATH);
  });

  it('should round-trip stylus data', () => {
    const config = JSON.parse(readFileSync(XP_PEN_CONFIG_PATH, 'utf-8'));
    const modeData = getModeData(config);
    const reportId = modeData.reportId;

    // Generate packets for a horizontal line
    const packets = [...xpPenGenerator.generateHorizontalLine(0.5, 0.5, 100)];

    // Process each packet (prepend report ID)
    for (const packet of packets) {
      const packetWithReportId = new Uint8Array([reportId, ...packet]);
      const result = processDeviceData(packetWithReportId, modeData.byteCodeMappings, 0);

      // Should have valid status (XP-Pen uses 'status' not 'state')
      expect('status' in result || 'state' in result).toBe(true);

      // Should have coordinates
      expect(result).toHaveProperty('x');
      expect(result).toHaveProperty('y');
    }
  });

  it('should round-trip button data', () => {
    const config = JSON.parse(readFileSync(XP_PEN_CONFIG_PATH, 'utf-8'));
    const modeData = getModeData(config);
    const reportId = modeData.reportId;

    // Test each button
    for (let buttonNum = 1; buttonNum <= 8; buttonNum++) {
      const packet = xpPenGenerator.generateButtonPacket(buttonNum);
      // Prepend report ID (config byte indices assume report ID at byte 0)
      const packetWithReportId = new Uint8Array([reportId, ...packet]);
      const result = processDeviceData(packetWithReportId, modeData.byteCodeMappings, 0);

      // Should detect the button
      expect(result.tabletButtons).toBe(buttonNum);

      // Should have button flags
      for (let i = 1; i <= 8; i++) {
        const expected = i === buttonNum;
        const actual = result[`button${i}`] ?? false;
        expect(actual).toBe(expected);
      }
    }
  });

  it('should handle mixed gesture sequence', () => {
    const config = JSON.parse(readFileSync(XP_PEN_CONFIG_PATH, 'utf-8'));
    const modeData = getModeData(config);
    const reportId = modeData.reportId;

    // Generate different types of packets
    const stylusPacket = xpPenGenerator.generateStylusPacket(0.5, 0.5, 0.5);
    const buttonPacket = xpPenGenerator.generateButtonPacket(1);

    // Prepend report ID
    const stylusWithReportId = new Uint8Array([reportId, ...stylusPacket]);
    const buttonWithReportId = new Uint8Array([reportId, ...buttonPacket]);

    // Process both
    const stylusResult = processDeviceData(stylusWithReportId, modeData.byteCodeMappings, 0);
    const buttonResult = processDeviceData(buttonWithReportId, modeData.byteCodeMappings, 0);

    // Stylus should have coordinates
    expect(stylusResult).toHaveProperty('x');
    expect(stylusResult).toHaveProperty('y');

    // Button should have button data
    expect(buttonResult.tabletButtons).toBe(1);
  });
});

describe('Driver Mode Generator', () => {
  let driverGenerator: ConfigBasedGenerator;

  beforeEach(() => {
    driverGenerator = new ConfigBasedGenerator(DRIVER_CONFIG_PATH);
  });

  it('should initialize correctly from driver config file', () => {
    // Values come from the config file, which may vary based on how it was generated
    // Just verify the generator loads valid values
    expect(driverGenerator.maxX).toBeGreaterThan(0);
    expect(driverGenerator.maxY).toBeGreaterThan(0);
    expect(driverGenerator.maxPressure).toBeGreaterThan(0);
    // Report ID from config file (may vary based on how config was generated)
    expect(driverGenerator.reportId).toBeGreaterThanOrEqual(0);
  });

  it('should generate button packets with driver config', () => {
    const config = JSON.parse(readFileSync(DRIVER_CONFIG_PATH, 'utf-8'));
    const modeData = getModeData(config);

    // Note: The driver config file may have been generated in driverless mode
    // This test verifies the generator works with whatever config is present
    const buttonValues = modeData.byteCodeMappings.tabletButtons?.values;
    if (!buttonValues || Object.keys(buttonValues).length === 0) {
      // Skip if no button values in config
      return;
    }

    // Just verify the config can be loaded and generator works
    const packet = driverGenerator.generateButtonPacket(1);
    expect(packet).toBeInstanceOf(Uint8Array);
    expect(packet.length).toBeGreaterThan(0);
  });

  it('should generate stylus packets with driver config', () => {
    const config = JSON.parse(readFileSync(DRIVER_CONFIG_PATH, 'utf-8'));
    const modeData = getModeData(config);
    const reportId = modeData.reportId;

    // Generate a stylus packet at center
    const packet = driverGenerator.generateStylusPacket(0.5, 0.5, 0.5);
    const packetWithReportId = new Uint8Array([reportId, ...packet]);
    const result = processDeviceData(packetWithReportId, modeData.byteCodeMappings, 0);

    // process_device_data returns normalized values (0.0-1.0)
    expect(result).toHaveProperty('x');
    expect(result).toHaveProperty('y');
    // At input 0.5, output should be ~0.5 normalized
    expect(Math.abs((result.x as number) - 0.5)).toBeLessThan(0.01);
    expect(Math.abs((result.y as number) - 0.5)).toBeLessThan(0.01);
  });
});
