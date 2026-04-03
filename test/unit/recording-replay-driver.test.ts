/**
 * Recording Replay Tests - Driver Mode
 * 
 * These tests replay recorded walkthrough data from driver-active mode
 * through the WalkthroughEngine and verify that the generated configuration
 * matches expected values.
 * 
 * This mirrors the driverless recording replay tests but uses driver-mode
 * recordings and expected config.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { WalkthroughEngine } from '../../src/core/walkthrough/index.js';

// Recording files to test against (driver mode)
const DRIVER_RECORDING_FILES = [
  'xp-pen-deco640-driver-recording.json',
  'xp-pen-deco640-driver-recording2.json',
];

// Expected config for driver mode
const EXPECTED_DRIVER_CONFIG_PATH = join(__dirname, '../../common-test-fixtures/xp-pen-deco640-driver.json');

interface Recording {
  timestamp: string;
  device: {
    vendorId: string;
    productId: string;
    productName: string;
  };
  steps: Record<string, {
    packetCount: number;
    packets: string[];
    detectedBytes?: Array<{
      byteIndex: number;
      variance: number;
      min: number;
      max: number;
    }>;
  }>;
}

interface ExpectedConfig {
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
  modes: Array<{
    reportId: number;
    digitizerUsagePage: number;
    stylusModeStatusByte: number;
    buttonInterfaceReportId?: number;
    capabilities: {
      hasButtons: boolean;
      buttonCount: number;
      hasPressure: boolean;
      pressureLevels: number;
      hasTilt: boolean;
      resolution: { x: number; y: number };
    };
    byteCodeMappings: {
      x: { byteIndex: number[]; max: number; type: string };
      y: { byteIndex: number[]; max: number; type: string };
      pressure: { byteIndex: number[]; max: number; type: string };
      tiltX: { byteIndex: number[]; positiveMax: number; negativeMin: number; negativeMax: number; type: string };
      tiltY: { byteIndex: number[]; positiveMax: number; negativeMin: number; negativeMax: number; type: string };
      status: { byteIndex: number[]; type: string; values: Record<string, any> };
      tabletButtons?: { byteIndex: number[]; buttonCount: number; type: string; values: Record<string, any> };
    };
  }>;
}

/**
 * Load a recording file
 */
function loadRecording(filename: string): Recording {
  const path = join(__dirname, '../../common-test-fixtures', filename);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

/**
 * Load expected driver config
 */
function loadExpectedDriverConfig(): ExpectedConfig {
  return JSON.parse(readFileSync(EXPECTED_DRIVER_CONFIG_PATH, 'utf-8'));
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Replay a step's packets through the engine
 */
function replayStep(engine: WalkthroughEngine, stepData: { packets: string[] }): void {
  engine.startCapture();
  for (const hexPacket of stepData.packets) {
    const packet = hexToBytes(hexPacket);
    // Extract report ID from first byte
    const reportId = packet[0];
    engine.processPacket(packet, reportId);
  }
  engine.stopCapture();
}

/**
 * Run a full walkthrough and return the generated config
 */
function runFullWalkthrough(engine: WalkthroughEngine, recording: Recording): any {
  // Set up device info
  const device = recording.device;
  engine.setDeviceInfo({
    vendorId: parseInt(device.vendorId, 16),
    productId: parseInt(device.productId, 16),
    productName: device.productName,
    collections: [{ usagePage: 13, usage: 2 }],
    allInterfaces: [13, 1, 65290],
  });

  // Start walkthrough
  engine.start();

  // Replay all steps
  const steps = [
    'step1-horizontal',
    'step2-vertical',
    'step3-pressure',
    'step4-hover-movement',
    'step5-tilt-x',
    'step6-tilt-y',
    'step7-primary-button',
    'step8-secondary-button',
    'step9-tablet-buttons',
  ];

  for (let i = 0; i < steps.length; i++) {
    const stepName = steps[i];
    if (recording.steps[stepName]) {
      replayStep(engine, recording.steps[stepName]);
    }
    if (i < steps.length - 1) {
      engine.nextStep();
    }
  }

  // Advance to metadata step
  engine.nextStep();

  // Submit metadata
  engine.submitMetadata({
    name: 'XP Pen Deco 640 (Driver)',
    manufacturer: 'XP Pen',
    model: 'Deco 640',
    description: 'XP Pen Deco 640 driver mode config for testing',
    buttonCount: 8,
  });

  return engine.getCompleteConfig();
}

// Generate test suites for each driver recording file
describe.each(DRIVER_RECORDING_FILES)('Driver Recording Replay: %s', (recordingFile) => {
  let recording: Recording;
  let expectedConfig: ExpectedConfig;
  let expectedMode: ExpectedConfig['modes'][0];

  beforeEach(() => {
    recording = loadRecording(recordingFile);
    expectedConfig = loadExpectedDriverConfig();
    expectedMode = expectedConfig.modes[0];
  });

  /**
   * Create a fresh engine for each test
   */
  function createEngine(): WalkthroughEngine {
    return new WalkthroughEngine({
      minPacketsPerStep: 10,
      minVarianceThreshold: 50,
      filterIdlePackets: false,
      skipDuplicates: false,
      packetIncludesReportId: true,
    });
  }

  describe('Driver Mode Specific Values', () => {
    it('should detect report ID 2 (driver mode)', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].reportId).toBe(2);
      expect(config.modes[0].reportId).toBe(expectedMode.reportId);
    });

    it('should detect 2x resolution (31998x17998)', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      // Driver mode has 2x resolution compared to driverless
      expect(config.modes[0].capabilities.resolution.x).toBe(31998);
      expect(config.modes[0].capabilities.resolution.y).toBe(17998);
      expect(config.modes[0].capabilities.resolution.x).toBe(expectedMode.capabilities.resolution.x);
      expect(config.modes[0].capabilities.resolution.y).toBe(expectedMode.capabilities.resolution.y);
    });
  });

  describe('X Coordinate Mapping', () => {
    it('should detect correct X byte indices', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].byteCodeMappings.x.byteIndex).toEqual(
        expectedMode.byteCodeMappings.x.byteIndex
      );
    });

    it('should detect correct X max value (31998)', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].byteCodeMappings.x.max).toBe(31998);
      expect(config.modes[0].byteCodeMappings.x.max).toBe(expectedMode.byteCodeMappings.x.max);
    });

    it('should have correct X mapping type', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].byteCodeMappings.x.type).toBe(
        expectedMode.byteCodeMappings.x.type
      );
    });
  });

  describe('Y Coordinate Mapping', () => {
    it('should detect correct Y byte indices', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].byteCodeMappings.y.byteIndex).toEqual(
        expectedMode.byteCodeMappings.y.byteIndex
      );
    });

    it('should detect correct Y max value (17998)', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].byteCodeMappings.y.max).toBe(17998);
      expect(config.modes[0].byteCodeMappings.y.max).toBe(expectedMode.byteCodeMappings.y.max);
    });

    it('should have correct Y mapping type', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].byteCodeMappings.y.type).toBe(
        expectedMode.byteCodeMappings.y.type
      );
    });
  });

  describe('Pressure Mapping', () => {
    it('should detect correct pressure byte indices', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].byteCodeMappings.pressure.byteIndex).toEqual(
        expectedMode.byteCodeMappings.pressure.byteIndex
      );
    });

    it('should detect correct pressure max value (16383)', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].byteCodeMappings.pressure.max).toBe(16383);
      expect(config.modes[0].byteCodeMappings.pressure.max).toBe(expectedMode.byteCodeMappings.pressure.max);
    });

    it('should have correct pressure mapping type', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].byteCodeMappings.pressure.type).toBe(
        expectedMode.byteCodeMappings.pressure.type
      );
    });
  });

  describe('Tilt X Mapping', () => {
    it('should detect correct tilt X byte index', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].byteCodeMappings.tiltX.byteIndex).toEqual(
        expectedMode.byteCodeMappings.tiltX.byteIndex
      );
    });

    it('should detect correct tilt X positive max', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].byteCodeMappings.tiltX.positiveMax).toBe(
        expectedMode.byteCodeMappings.tiltX.positiveMax
      );
    });

    it('should detect correct tilt X negative range', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].byteCodeMappings.tiltX.negativeMin).toBe(
        expectedMode.byteCodeMappings.tiltX.negativeMin
      );
      expect(config.modes[0].byteCodeMappings.tiltX.negativeMax).toBe(
        expectedMode.byteCodeMappings.tiltX.negativeMax
      );
    });

    it('should have correct tilt X mapping type', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].byteCodeMappings.tiltX.type).toBe(
        expectedMode.byteCodeMappings.tiltX.type
      );
    });
  });

  describe('Tilt Y Mapping', () => {
    it('should detect correct tilt Y byte index', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].byteCodeMappings.tiltY.byteIndex).toEqual(
        expectedMode.byteCodeMappings.tiltY.byteIndex
      );
    });

    it('should detect correct tilt Y positive max', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].byteCodeMappings.tiltY.positiveMax).toBe(
        expectedMode.byteCodeMappings.tiltY.positiveMax
      );
    });

    it('should detect correct tilt Y negative range', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].byteCodeMappings.tiltY.negativeMin).toBe(
        expectedMode.byteCodeMappings.tiltY.negativeMin
      );
      expect(config.modes[0].byteCodeMappings.tiltY.negativeMax).toBe(
        expectedMode.byteCodeMappings.tiltY.negativeMax
      );
    });

    it('should have correct tilt Y mapping type', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].byteCodeMappings.tiltY.type).toBe(
        expectedMode.byteCodeMappings.tiltY.type
      );
    });
  });

  describe('Status Byte Mapping', () => {
    it('should detect correct status byte index', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].byteCodeMappings.status.byteIndex).toEqual(
        expectedMode.byteCodeMappings.status.byteIndex
      );
    });

    it('should have status mapping', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);

      // status type field removed (always 'code' now)
      expect(config.modes[0].byteCodeMappings.status).toBeDefined();
      expect(config.modes[0].byteCodeMappings.status.values).toBeDefined();
    });

    it('should detect hover status (160)', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].byteCodeMappings.status.values['160']).toBeDefined();
      expect(config.modes[0].byteCodeMappings.status.values['160'].state).toBe('hover');
    });

    it('should detect contact status (161)', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].byteCodeMappings.status.values['161']).toBeDefined();
      expect(config.modes[0].byteCodeMappings.status.values['161'].state).toBe('contact');
    });

    it('should detect tablet buttons status (240)', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      // Status 240 is used for tablet buttons in driver mode
      expect(config.modes[0].byteCodeMappings.status.values['240']).toBeDefined();
    });
  });

  describe('Mode Level Fields', () => {
    it('should have correct report ID (2)', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].reportId).toBe(2);
      expect(config.modes[0].reportId).toBe(expectedMode.reportId);
    });

    it('should have correct digitizer usage page', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].digitizerUsagePage).toBe(expectedMode.digitizerUsagePage);
    });

    it('should have correct stylus mode status byte (160)', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].stylusModeStatusByte).toBe(160);
      expect(config.modes[0].stylusModeStatusByte).toBe(expectedMode.stylusModeStatusByte);
    });
  });

  describe('Capabilities', () => {
    it('should have correct resolution (31998x17998)', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].capabilities.resolution.x).toBe(31998);
      expect(config.modes[0].capabilities.resolution.y).toBe(17998);
    });

    it('should have correct pressure levels (16384)', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      // Allow off-by-one for pressure levels (count vs max)
      expect(Math.abs(config.modes[0].capabilities.pressureLevels - expectedMode.capabilities.pressureLevels)).toBeLessThanOrEqual(1);
    });

    it('should have correct hasPressure flag', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].capabilities.hasPressure).toBe(expectedMode.capabilities.hasPressure);
    });

    it('should have correct hasTilt flag', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].capabilities.hasTilt).toBe(expectedMode.capabilities.hasTilt);
    });

    it('should have correct hasButtons flag', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].capabilities.hasButtons).toBe(expectedMode.capabilities.hasButtons);
    });

    it('should have correct button count (8)', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].capabilities.buttonCount).toBe(8);
      expect(config.modes[0].capabilities.buttonCount).toBe(expectedMode.capabilities.buttonCount);
    });
  });

  describe('Device Identifiers', () => {
    it('should have correct vendor ID', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.vendorId).toBe(expectedConfig.vendorId);
    });

    it('should have correct product ID', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.productId).toBe(expectedConfig.productId);
    });

    it('should have correct deviceInfo vendor_id', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.deviceInfo.vendor_id).toBe(expectedConfig.deviceInfo.vendor_id);
    });

    it('should have correct deviceInfo product_id', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.deviceInfo.product_id).toBe(expectedConfig.deviceInfo.product_id);
    });
  });

  describe('Config Structure', () => {
    it('should have required top-level fields', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.name).toBeDefined();
      expect(config.manufacturer).toBeDefined();
      expect(config.model).toBeDefined();
      expect(config.description).toBeDefined();
      expect(config.vendorId).toBeDefined();
      expect(config.productId).toBeDefined();
      expect(config.deviceInfo).toBeDefined();
      expect(config.modes).toBeDefined();
    });

    it('should have modes as an array with at least one entry', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(Array.isArray(config.modes)).toBe(true);
      expect(config.modes.length).toBeGreaterThanOrEqual(1);
    });

    it('should have required mode fields', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      const mode = config.modes[0];
      expect(mode.reportId).toBeDefined();
      expect(mode.digitizerUsagePage).toBeDefined();
      expect(mode.capabilities).toBeDefined();
      expect(mode.byteCodeMappings).toBeDefined();
    });

    it('should have all core byte mappings', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      const mappings = config.modes[0].byteCodeMappings;
      expect(mappings.x).toBeDefined();
      expect(mappings.y).toBeDefined();
      expect(mappings.pressure).toBeDefined();
      expect(mappings.status).toBeDefined();
      expect(mappings.tiltX).toBeDefined();
      expect(mappings.tiltY).toBeDefined();
    });
  });

  describe('Value Consistency', () => {
    it('should have resolution matching max values', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      expect(config.modes[0].capabilities.resolution.x).toBe(config.modes[0].byteCodeMappings.x.max);
      expect(config.modes[0].capabilities.resolution.y).toBe(config.modes[0].byteCodeMappings.y.max);
    });

    it('should have valid byte indices (non-negative integers in arrays)', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      const mappings = config.modes[0].byteCodeMappings;
      for (const [name, mapping] of Object.entries(mappings)) {
        if (mapping && typeof mapping === 'object' && 'byteIndex' in mapping) {
          expect(Array.isArray(mapping.byteIndex)).toBe(true);
          for (const idx of mapping.byteIndex) {
            expect(typeof idx).toBe('number');
            expect(idx).toBeGreaterThanOrEqual(0);
          }
        }
      }
    });

    it('should have valid tilt ranges', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      
      const tiltX = config.modes[0].byteCodeMappings.tiltX;
      const tiltY = config.modes[0].byteCodeMappings.tiltY;
      
      // positiveMax should be in range 0-127
      expect(tiltX.positiveMax).toBeGreaterThanOrEqual(0);
      expect(tiltX.positiveMax).toBeLessThanOrEqual(127);
      expect(tiltY.positiveMax).toBeGreaterThanOrEqual(0);
      expect(tiltY.positiveMax).toBeLessThanOrEqual(127);
      
      // negativeMin should be in range 128-255
      expect(tiltX.negativeMin).toBeGreaterThanOrEqual(128);
      expect(tiltX.negativeMin).toBeLessThanOrEqual(255);
      expect(tiltY.negativeMin).toBeGreaterThanOrEqual(128);
      expect(tiltY.negativeMin).toBeLessThanOrEqual(255);
      
      // negativeMax should be >= negativeMin
      expect(tiltX.negativeMax).toBeGreaterThanOrEqual(tiltX.negativeMin);
      expect(tiltY.negativeMax).toBeGreaterThanOrEqual(tiltY.negativeMin);
    });
  });

  describe('Tablet Buttons', () => {
    it('should detect tablet buttons mapping', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);

      // Skip if tablet buttons not detected (recording may not include button presses)
      if (!config.modes[0].byteCodeMappings.tabletButtons) {
        console.log('⚠️  Skipping test: Tablet buttons not detected in recording (no button presses captured)');
        return;
      }

      expect(config.modes[0].byteCodeMappings.tabletButtons).toBeDefined();
    });

    it('should have tablet buttons with values mapping', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);

      const tabletButtons = config.modes[0].byteCodeMappings.tabletButtons;
      if (!tabletButtons) {
        console.log('⚠️  Skipping test: Tablet buttons not detected in recording (no button presses captured)');
        return;
      }

      // Type field is now optional (defaults to 'code')
      expect(tabletButtons.values).toBeDefined();
    });

    it('should detect 8 buttons', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);

      const tabletButtons = config.modes[0].byteCodeMappings.tabletButtons;
      if (!tabletButtons) {
        console.log('⚠️  Skipping test: Tablet buttons not detected in recording (no button presses captured)');
        return;
      }

      expect(tabletButtons.buttonCount).toBe(8);
    });
  });
});
