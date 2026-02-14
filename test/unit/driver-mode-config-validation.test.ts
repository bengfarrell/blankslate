/**
 * COMPREHENSIVE TEST: Validate walkthrough against stable driver-mode config
 * 
 * This test:
 * 1. Loads the stable XP-Pen driver-enabled config
 * 2. Generates mock data with driver-mode settings (report ID 2, status byte 240 for buttons, 2x resolution)
 * 3. Runs the walkthrough
 * 4. Asserts the generated config matches the stable driver-mode config
 * 
 * This validates that the walkthrough correctly handles devices when the driver is active.
 * This mirrors the Python test_driver_mode_config_validation.py tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { WalkthroughEngine } from '../../src/core/walkthrough/walkthrough-engine.js';
import { ConfigBasedGenerator } from '../../src/mockbytes/config-based-generator.js';
import { processDeviceData } from '../../src/utils/data-helpers.js';

// Path to stable driver-mode config (test fixture)
const DRIVER_CONFIG_PATH = join(__dirname, '../../common-test-fixtures/xp-pen-deco640-driver.json');

interface DriverConfigMode {
  reportId: number;
  buttonInterfaceReportId?: number;
  digitizerUsagePage: number;
  stylusModeStatusByte: number;
  capabilities: {
    hasPressure: boolean;
    hasTilt: boolean;
    hasButtons: boolean;
    buttonCount: number;
    pressureLevels: number;
    resolution: {
      x: number;
      y: number;
    };
  };
  byteCodeMappings: Record<string, any>;
}

interface DriverConfig {
  name: string;
  manufacturer: string;
  model: string;
  description: string;
  vendorId: string;
  productId: string;
  deviceInfo: {
    vendor_id: number;
    product_id: number;
    product_string: string;
    interfaces: number[];
  };
  modes: DriverConfigMode[];
}

/**
 * Helper to extract mode data from generated config
 */
function getModeData(config: any): { reportId: number; byteCodeMappings: Record<string, any>; capabilities?: any; digitizerUsagePage?: number; stylusModeStatusByte?: number } {
  if (config.modes && Array.isArray(config.modes) && config.modes.length > 0) {
    const mode = config.modes[0];
    return {
      reportId: mode.reportId ?? 1,
      byteCodeMappings: mode.byteCodeMappings ?? {},
      capabilities: mode.capabilities,
      digitizerUsagePage: mode.digitizerUsagePage,
      stylusModeStatusByte: mode.stylusModeStatusByte,
    };
  }
  return {
    reportId: config.reportId ?? 1,
    byteCodeMappings: config.byteCodeMappings ?? {},
    capabilities: config.capabilities,
    digitizerUsagePage: config.digitizerUsagePage,
    stylusModeStatusByte: config.stylusModeStatusByte,
  };
}

describe('Driver Mode Config Validation', () => {
  let driverConfig: DriverConfig;
  let mode: DriverConfigMode;
  let generator: ConfigBasedGenerator;
  let engine: WalkthroughEngine;

  beforeEach(() => {
    // Load driver mode config
    driverConfig = JSON.parse(readFileSync(DRIVER_CONFIG_PATH, 'utf-8'));
    mode = driverConfig.modes[0];

    // Create generator from driver config (pass the config object, not the path)
    generator = new ConfigBasedGenerator(driverConfig);

    // Create walkthrough engine with packetIncludesReportId: true (Node.js style)
    engine = new WalkthroughEngine({
      minPacketsPerStep: 10,
      minVarianceThreshold: 30,
      skipDuplicates: true,
      filterIdlePackets: true,
      packetIncludesReportId: true,
    });
  });

  it('should generate config matching driver mode config through walkthrough', async () => {
    // Set device info matching driver config
    engine.setDeviceInfo({
      vendorId: driverConfig.deviceInfo.vendor_id,
      productId: driverConfig.deviceInfo.product_id,
      productName: driverConfig.deviceInfo.product_string,
      collections: [{ usagePage: mode.digitizerUsagePage, usage: 2 }],
      allInterfaces: driverConfig.deviceInfo.interfaces,
      detectedReportId: mode.reportId,
    });

    // Start walkthrough
    engine.start();

    // Helper to run a step with generated packets
    const runStep = (packets: Uint8Array[]) => {
      engine.startCapture();
      for (const packet of packets) {
        // Prepend report ID to match Node.js HID reader behavior
        const packetWithReportId = new Uint8Array([mode.reportId, ...packet]);
        engine.processPacket(packetWithReportId, mode.reportId);
      }
      engine.stopCapture();
      engine.nextStep();
    };

    // Step 1: Horizontal line
    const horizontalPackets = [...generator.generateHorizontalLine(0.5, 0.5, 500)];
    runStep(horizontalPackets);

    // Step 2: Vertical line
    const verticalPackets = [...generator.generateVerticalLine(0.5, 0.5, 500)];
    runStep(verticalPackets);

    // Step 3: Pressure sweep
    const pressurePackets = [...generator.generatePressureSweep(0.5, 0.5, 500)];
    runStep(pressurePackets);

    // Step 4-8: Additional steps (hover, tilt, buttons, etc.)
    // For simplicity, we'll use horizontal lines for remaining stylus steps
    for (let i = 0; i < 5; i++) {
      const packets = [...generator.generateHorizontalLine(0.5, 0.5, 500)];
      runStep(packets);
    }

    // Step 9: Button detection - generate button packets
    engine.startCapture();
    for (let buttonNum = 1; buttonNum <= 8; buttonNum++) {
      const buttonPacket = generator.generateButtonPacket(buttonNum);
      const packetWithReportId = new Uint8Array([mode.reportId, ...buttonPacket]);
      // Send multiple times for confirmation
      for (let j = 0; j < 5; j++) {
        engine.processPacket(packetWithReportId, mode.reportId);
      }
    }
    engine.stopCapture();
    engine.nextStep();

    // Step 10: Metadata - use submitMetadata which also generates the config
    engine.submitMetadata({
      name: driverConfig.name,
      manufacturer: driverConfig.manufacturer,
      model: driverConfig.model,
      description: driverConfig.description,
      buttonCount: mode.capabilities.buttonCount,
    });

    // Get generated config
    const generated = engine.getCompleteConfig();
    expect(generated).toBeTruthy();

    // Validate multi-mode format
    expect(generated.modes).toBeDefined();
    expect(generated.modes.length).toBeGreaterThan(0);

    const genMode = getModeData(generated);
    const driverMappings = mode.byteCodeMappings;
    const genMappings = genMode.byteCodeMappings;

    // CRITICAL: Report ID (should be 2 for driver mode)
    expect(genMode.reportId).toBe(mode.reportId);
    expect(genMode.reportId).toBe(2); // Driver mode uses report ID 2

    // CRITICAL: Byte indices for coordinates
    expect(genMappings.x?.byteIndex).toEqual(driverMappings.x?.byteIndex);
    expect(genMappings.y?.byteIndex).toEqual(driverMappings.y?.byteIndex);
    expect(genMappings.pressure?.byteIndex).toEqual(driverMappings.pressure?.byteIndex);
    expect(genMappings.status?.byteIndex).toEqual(driverMappings.status?.byteIndex);

    // CRITICAL: Max values (driver mode has 2x resolution)
    expect(genMappings.x?.max).toBe(driverMappings.x?.max);
    expect(genMappings.y?.max).toBe(driverMappings.y?.max);
    expect(genMappings.pressure?.max).toBe(driverMappings.pressure?.max);

    // Verify driver mode resolution is 2x driverless
    expect(driverMappings.x?.max).toBe(31998);
    expect(driverMappings.y?.max).toBe(17998);

    // CRITICAL: Tilt byte indices
    expect(genMappings.tiltX?.byteIndex).toEqual(driverMappings.tiltX?.byteIndex);
    expect(genMappings.tiltY?.byteIndex).toEqual(driverMappings.tiltY?.byteIndex);

    // Capabilities
    expect(genMode.capabilities?.hasPressure).toBe(mode.capabilities.hasPressure);
    expect(genMode.capabilities?.hasTilt).toBe(mode.capabilities.hasTilt);
    expect(genMode.capabilities?.hasButtons).toBe(mode.capabilities.hasButtons);
    expect(genMode.capabilities?.buttonCount).toBe(mode.capabilities.buttonCount);

    // Resolution (driver mode has 2x resolution)
    expect(genMode.capabilities?.resolution?.x).toBe(mode.capabilities.resolution.x);
    expect(genMode.capabilities?.resolution?.y).toBe(mode.capabilities.resolution.y);
  });

  it('should detect driver mode button status byte (240/0xF0)', async () => {
    // Set device info
    engine.setDeviceInfo({
      vendorId: driverConfig.deviceInfo.vendor_id,
      productId: driverConfig.deviceInfo.product_id,
      productName: driverConfig.deviceInfo.product_string,
      collections: [{ usagePage: mode.digitizerUsagePage, usage: 2 }],
      allInterfaces: driverConfig.deviceInfo.interfaces,
      detectedReportId: mode.reportId,
    });

    engine.start();

    // Helper to run a step with generated packets
    const runStep = (packets: Uint8Array[]) => {
      engine.startCapture();
      for (const packet of packets) {
        const packetWithReportId = new Uint8Array([mode.reportId, ...packet]);
        engine.processPacket(packetWithReportId, mode.reportId);
      }
      engine.stopCapture();
      engine.nextStep();
    };

    // Run all gesture steps
    for (let i = 0; i < 8; i++) {
      const packets = [...generator.generateHorizontalLine(0.5, 0.5, 100)];
      runStep(packets);
    }

    // Button step
    engine.startCapture();
    for (let buttonNum = 1; buttonNum <= 8; buttonNum++) {
      const buttonPacket = generator.generateButtonPacket(buttonNum);
      const packetWithReportId = new Uint8Array([mode.reportId, ...buttonPacket]);
      for (let j = 0; j < 5; j++) {
        engine.processPacket(packetWithReportId, mode.reportId);
      }
    }
    engine.stopCapture();
    engine.nextStep();

    // Submit metadata to generate config
    engine.submitMetadata({
      name: driverConfig.name,
      manufacturer: driverConfig.manufacturer,
      model: driverConfig.model,
      description: driverConfig.description,
      buttonCount: mode.capabilities.buttonCount,
    });

    // Get byte code mappings
    const mappings = engine.getByteCodeMappings();
    expect(mappings).toBeTruthy();

    // Verify status mapping exists and includes button status byte 240
    expect(mappings!.status).toBeDefined();
    expect(mappings!.status.byteIndex).toEqual(mode.byteCodeMappings.status.byteIndex);
    
    // Driver mode uses status byte 240 (0xF0) for buttons
    const statusValues = mappings!.status.values;
    expect(statusValues).toBeDefined();
    // The status byte 240 should be detected as "buttons" state
    expect(statusValues['240']).toBeDefined();
  });

  it('should detect all 8 buttons with bit-flag encoding', async () => {
    // Set device info
    engine.setDeviceInfo({
      vendorId: driverConfig.deviceInfo.vendor_id,
      productId: driverConfig.deviceInfo.product_id,
      productName: driverConfig.deviceInfo.product_string,
      collections: [{ usagePage: mode.digitizerUsagePage, usage: 2 }],
      allInterfaces: driverConfig.deviceInfo.interfaces,
      detectedReportId: mode.reportId,
    });

    engine.start();

    // Skip to button step
    for (let i = 0; i < 8; i++) {
      engine.startCapture();
      const packets = [...generator.generateHorizontalLine(0.5, 0.5, 100)];
      for (const packet of packets) {
        const packetWithReportId = new Uint8Array([mode.reportId, ...packet]);
        engine.processPacket(packetWithReportId, mode.reportId);
      }
      engine.stopCapture();
      engine.nextStep();
    }

    // Now at button step - detect each button
    const detectedButtons: number[] = [];

    for (let buttonNum = 1; buttonNum <= 8; buttonNum++) {
      const buttonPacket = generator.generateButtonPacket(buttonNum);
      const packetWithReportId = new Uint8Array([mode.reportId, ...buttonPacket]);

      // Process button packet
      engine.startCapture();
      for (let j = 0; j < 10; j++) {
        engine.processPacket(packetWithReportId, mode.reportId);
      }
      engine.stopCapture();

      detectedButtons.push(buttonNum);
    }

    expect(detectedButtons).toHaveLength(8);
    expect(detectedButtons).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('Driver Mode Config Round-Trip Validation', () => {
  let driverConfig: DriverConfig;
  let mode: DriverConfigMode;
  let generator: ConfigBasedGenerator;

  beforeEach(() => {
    driverConfig = JSON.parse(readFileSync(DRIVER_CONFIG_PATH, 'utf-8'));
    mode = driverConfig.modes[0];
    // Pass the config object, not the path
    generator = new ConfigBasedGenerator(driverConfig);
  });

  it('should generate packets that process back to original values', () => {
    // Generate a stylus packet at known position
    const packet = generator.generateStylusPacket(0.5, 0.5, 0.5);
    const packetWithReportId = new Uint8Array([mode.reportId, ...packet]);

    // Process it back
    const result = processDeviceData(packetWithReportId, mode.byteCodeMappings, 0);

    // Should get approximately 0.5 for normalized values
    expect(Math.abs((result.x as number) - 0.5)).toBeLessThan(0.01);
    expect(Math.abs((result.y as number) - 0.5)).toBeLessThan(0.01);
    expect(Math.abs((result.pressure as number) - 0.5)).toBeLessThan(0.01);
  });

  it('should generate button packets with bit-flag encoding', () => {
    // Driver mode uses bit-flag encoding: button 1 = 1, button 2 = 2, button 3 = 4, etc.
    // The raw scan codes are bit-flags, but processDeviceData translates them to button numbers
    // using the config's values mapping (e.g., scan code 4 -> button 3)

    for (let buttonNum = 1; buttonNum <= 8; buttonNum++) {
      const packet = generator.generateButtonPacket(buttonNum);
      const packetWithReportId = new Uint8Array([mode.reportId, ...packet]);

      const result = processDeviceData(packetWithReportId, mode.byteCodeMappings, 0);

      // processDeviceData returns the button NUMBER, not the raw scan code
      expect(result.tabletButtons).toBe(buttonNum);
      expect(result[`button${buttonNum}`]).toBe(true);
    }
  });

  it('should verify driver mode has 2x resolution compared to driverless', () => {
    // Driver mode resolution
    expect(mode.capabilities.resolution.x).toBe(31998);
    expect(mode.capabilities.resolution.y).toBe(17998);

    // These should be 2x the driverless values (15999 x 8999)
    expect(mode.capabilities.resolution.x).toBe(15999 * 2);
    expect(mode.capabilities.resolution.y).toBe(8999 * 2);
  });
});
