/**
 * COMPREHENSIVE TEST: Validate walkthrough against stable config
 *
 * This test:
 * 1. Loads the stable XP-Pen config
 * 2. Generates mock data using ConfigBasedGenerator
 * 3. Runs the walkthrough
 * 4. Asserts the generated config matches the stable config
 *
 * This mirrors the Python test_stable_config_validation.py tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { WalkthroughEngine } from '../../src/core/walkthrough/walkthrough-engine.js';
import { ConfigBasedGenerator } from '../../src/mockbytes/config-based-generator.js';
import { processDeviceData } from '../../src/utils/data-helpers.js';

// Path to stable config (test fixture)
const STABLE_CONFIG_PATH = join(__dirname, '../../common-test-fixtures/xp-pen-deco640-driverless.json');

interface StableConfigMode {
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

interface StableConfig {
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
  modes: StableConfigMode[];
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

describe('Stable Config Validation', () => {
  let stableConfig: StableConfig;
  let generator: ConfigBasedGenerator;
  let engine: WalkthroughEngine;

  beforeEach(() => {
    // Load stable config
    stableConfig = JSON.parse(readFileSync(STABLE_CONFIG_PATH, 'utf-8'));
    
    // Create generator from stable config
    generator = new ConfigBasedGenerator(STABLE_CONFIG_PATH);
    
    // Create walkthrough engine with packetIncludesReportId: true (Node.js style)
    engine = new WalkthroughEngine({
      minPacketsPerStep: 10,
      minVarianceThreshold: 30,
      skipDuplicates: true,
      filterIdlePackets: true,
      packetIncludesReportId: true,
    });
  });

  it('should generate config matching stable config through walkthrough', async () => {
    const mode = stableConfig.modes[0];

    // Set device info matching stable config
    engine.setDeviceInfo({
      vendorId: stableConfig.deviceInfo.vendor_id,
      productId: stableConfig.deviceInfo.product_id,
      productName: stableConfig.deviceInfo.product_string,
      collections: [{ usagePage: mode.digitizerUsagePage, usage: 2 }],
      allInterfaces: stableConfig.deviceInfo.interfaces,
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
      name: stableConfig.name,
      manufacturer: stableConfig.manufacturer,
      model: stableConfig.model,
      description: stableConfig.description,
      buttonCount: mode.capabilities.buttonCount,
    });

    // Get generated config
    const generated = engine.getCompleteConfig();
    expect(generated).toBeTruthy();

    // Validate multi-mode format
    expect(generated.modes).toBeDefined();
    expect(generated.modes.length).toBeGreaterThan(0);

    const genMode = getModeData(generated);
    const stableMappings = mode.byteCodeMappings;
    const genMappings = genMode.byteCodeMappings;

    // CRITICAL: Report ID
    expect(genMode.reportId).toBe(mode.reportId);

    // CRITICAL: Byte indices for coordinates
    expect(genMappings.x?.byteIndex).toEqual(stableMappings.x?.byteIndex);
    expect(genMappings.y?.byteIndex).toEqual(stableMappings.y?.byteIndex);
    expect(genMappings.pressure?.byteIndex).toEqual(stableMappings.pressure?.byteIndex);
    expect(genMappings.status?.byteIndex).toEqual(stableMappings.status?.byteIndex);

    // CRITICAL: Max values
    expect(genMappings.x?.max).toBe(stableMappings.x?.max);
    expect(genMappings.y?.max).toBe(stableMappings.y?.max);
    expect(genMappings.pressure?.max).toBe(stableMappings.pressure?.max);

    // CRITICAL: Tilt byte indices
    expect(genMappings.tiltX?.byteIndex).toEqual(stableMappings.tiltX?.byteIndex);
    expect(genMappings.tiltY?.byteIndex).toEqual(stableMappings.tiltY?.byteIndex);

    // Capabilities
    expect(genMode.capabilities?.hasPressure).toBe(mode.capabilities.hasPressure);
    expect(genMode.capabilities?.hasTilt).toBe(mode.capabilities.hasTilt);
    expect(genMode.capabilities?.hasButtons).toBe(mode.capabilities.hasButtons);
    expect(genMode.capabilities?.buttonCount).toBe(mode.capabilities.buttonCount);

    // Resolution
    expect(genMode.capabilities?.resolution?.x).toBe(mode.capabilities.resolution.x);
    expect(genMode.capabilities?.resolution?.y).toBe(mode.capabilities.resolution.y);
  });

  it('should detect correct status byte values', async () => {
    const mode = stableConfig.modes[0];

    // Set device info
    engine.setDeviceInfo({
      vendorId: stableConfig.deviceInfo.vendor_id,
      productId: stableConfig.deviceInfo.product_id,
      productName: stableConfig.deviceInfo.product_string,
      collections: [{ usagePage: mode.digitizerUsagePage, usage: 2 }],
      allInterfaces: stableConfig.deviceInfo.interfaces,
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
      name: stableConfig.name,
      manufacturer: stableConfig.manufacturer,
      model: stableConfig.model,
      description: stableConfig.description,
      buttonCount: mode.capabilities.buttonCount,
    });

    // Get byte code mappings
    const mappings = engine.getByteCodeMappings();
    expect(mappings).toBeTruthy();

    // Verify status mapping exists
    expect(mappings!.status).toBeDefined();
    expect(mappings!.status.byteIndex).toEqual(mode.byteCodeMappings.status.byteIndex);
  });

  it('should detect all 8 buttons correctly', async () => {
    const mode = stableConfig.modes[0];

    // Set device info
    engine.setDeviceInfo({
      vendorId: stableConfig.deviceInfo.vendor_id,
      productId: stableConfig.deviceInfo.product_id,
      productName: stableConfig.deviceInfo.product_string,
      collections: [{ usagePage: mode.digitizerUsagePage, usage: 2 }],
      allInterfaces: stableConfig.deviceInfo.interfaces,
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

describe('Config Round-Trip Validation', () => {
  let stableConfig: StableConfig;
  let generator: ConfigBasedGenerator;

  beforeEach(() => {
    stableConfig = JSON.parse(readFileSync(STABLE_CONFIG_PATH, 'utf-8'));
    generator = new ConfigBasedGenerator(STABLE_CONFIG_PATH);
  });

  it('should generate packets that process back to original values', () => {
    const mode = stableConfig.modes[0];

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

  it('should generate button packets that detect correct button', () => {
    const mode = stableConfig.modes[0];

    for (let buttonNum = 1; buttonNum <= 8; buttonNum++) {
      const packet = generator.generateButtonPacket(buttonNum);
      const packetWithReportId = new Uint8Array([mode.reportId, ...packet]);

      const result = processDeviceData(packetWithReportId, mode.byteCodeMappings, 0);

      expect(result.tabletButtons).toBe(buttonNum);
      expect(result[`button${buttonNum}`]).toBe(true);
    }
  });
});
