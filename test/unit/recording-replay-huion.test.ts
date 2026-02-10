/**
 * Recording Replay Tests - Huion Inspiroy 2M
 * 
 * These tests replay recorded walkthrough data from a Huion Inspiroy 2M tablet
 * through the WalkthroughEngine and verify that the generated configuration
 * matches expected values.
 * 
 * Huion tablets have different characteristics from XP-Pen:
 * - Report ID 10 (vs 7 for XP-Pen driverless)
 * - Digitizer Usage Page 65280 (vendor-specific, vs 13 for standard)
 * - Status bytes: 192=hover, 193=contact (vs 160/161 for XP-Pen)
 * - Keyboard HID interface for buttons (vs embedded in pen packets)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { WalkthroughEngine } from '../../src/core/walkthrough/index.js';

// Recording files to test against
const HUION_RECORDING_FILES = [
  'huion-inspiroy2m-nodriver-recording.json',
  'huion-inspiroy2m-nodriver-recording2.json',
];

// Expected config for Huion
const EXPECTED_HUION_CONFIG_PATH = join(__dirname, '../../common-test-fixtures/huion-inspiroy2m.json');

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
    stylusModeStatusByte?: number;
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
      keyboardButtons?: any;
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
 * Load expected Huion config
 */
function loadExpectedHuionConfig(): ExpectedConfig {
  return JSON.parse(readFileSync(EXPECTED_HUION_CONFIG_PATH, 'utf-8'));
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
    collections: [{ usagePage: 65280, usage: 2 }], // Huion uses vendor-specific usage page
    allInterfaces: [1, 13, 65280],
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
    name: 'Huion Inspiroy 2 Medium',
    manufacturer: 'Huion',
    model: 'Inspiroy 2 Medium',
    description: 'Huion Inspiroy 2M config for testing',
    buttonCount: 30,
  });

  return engine.getCompleteConfig();
}

// Generate test suites for each Huion recording file
describe.each(HUION_RECORDING_FILES)('Huion Recording Replay: %s', (recordingFile) => {
  let recording: Recording;
  let expectedConfig: ExpectedConfig;
  let expectedMode: ExpectedConfig['modes'][0];

  beforeEach(() => {
    recording = loadRecording(recordingFile);
    expectedConfig = loadExpectedHuionConfig();
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

  describe('Device Identification', () => {
    it('should detect correct vendor ID (0x256c)', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      expect(config.vendorId).toBe('0x256c');
      expect(config.vendorId).toBe(expectedConfig.vendorId);
    });

    it('should detect correct product ID (0x0067)', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      // Compare numeric values to handle formatting differences (0x67 vs 0x0067)
      expect(parseInt(config.productId, 16)).toBe(0x0067);
      expect(parseInt(config.productId, 16)).toBe(parseInt(expectedConfig.productId, 16));
    });

    it('should have correct device info', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      expect(config.deviceInfo.vendor_id).toBe(0x256c);
      expect(config.deviceInfo.product_id).toBe(0x0067);
    });
  });

  describe('Huion-Specific Mode Fields', () => {
    it('should detect report ID 10', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      expect(config.modes[0].reportId).toBe(10);
      expect(config.modes[0].reportId).toBe(expectedMode.reportId);
    });

    it('should detect vendor-specific digitizer usage page (65280)', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      expect(config.modes[0].digitizerUsagePage).toBe(65280);
      expect(config.modes[0].digitizerUsagePage).toBe(expectedMode.digitizerUsagePage);
    });

    it('should detect stylus mode status byte 192 (hover)', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      expect(config.modes[0].stylusModeStatusByte).toBe(192);
    });
  });

  describe('Coordinate Mappings', () => {
    it('should detect X coordinate byte indices [2, 3]', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      expect(config.modes[0].byteCodeMappings.x.byteIndex).toEqual([2, 3]);
      expect(config.modes[0].byteCodeMappings.x.byteIndex).toEqual(expectedMode.byteCodeMappings.x.byteIndex);
    });

    it('should detect Y coordinate byte indices [4, 5]', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      expect(config.modes[0].byteCodeMappings.y.byteIndex).toEqual([4, 5]);
      expect(config.modes[0].byteCodeMappings.y.byteIndex).toEqual(expectedMode.byteCodeMappings.y.byteIndex);
    });

    it('should detect resolution approximately 32767x32767', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      // Allow some variance since actual pen movement may not reach exact max
      expect(config.modes[0].byteCodeMappings.x.max).toBeGreaterThan(30000);
      expect(config.modes[0].byteCodeMappings.y.max).toBeGreaterThan(30000);
    });
  });

  describe('Pressure Mapping', () => {
    it('should detect pressure byte indices [6, 7]', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      expect(config.modes[0].byteCodeMappings.pressure.byteIndex).toEqual([6, 7]);
      expect(config.modes[0].byteCodeMappings.pressure.byteIndex).toEqual(expectedMode.byteCodeMappings.pressure.byteIndex);
    });

    it('should detect pressure max approximately 8191', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      // Allow some variance
      expect(config.modes[0].byteCodeMappings.pressure.max).toBeGreaterThan(7000);
      expect(config.modes[0].byteCodeMappings.pressure.max).toBeLessThanOrEqual(8191);
    });
  });

  describe('Tilt Mappings', () => {
    it('should detect tilt X byte index [8]', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      expect(config.modes[0].byteCodeMappings.tiltX.byteIndex).toEqual([8]);
      expect(config.modes[0].byteCodeMappings.tiltX.byteIndex).toEqual(expectedMode.byteCodeMappings.tiltX.byteIndex);
    });

    it('should detect tilt Y byte index [9]', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      expect(config.modes[0].byteCodeMappings.tiltY.byteIndex).toEqual([9]);
      expect(config.modes[0].byteCodeMappings.tiltY.byteIndex).toEqual(expectedMode.byteCodeMappings.tiltY.byteIndex);
    });

    it('should have valid tilt X bipolar range', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      const tiltX = config.modes[0].byteCodeMappings.tiltX;
      expect(tiltX.positiveMax).toBeGreaterThan(0);
      expect(tiltX.positiveMax).toBeLessThanOrEqual(127);
      expect(tiltX.negativeMin).toBeGreaterThanOrEqual(128);
      expect(tiltX.negativeMax).toBeGreaterThanOrEqual(tiltX.negativeMin);
    });

    it('should have valid tilt Y bipolar range', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      const tiltY = config.modes[0].byteCodeMappings.tiltY;
      expect(tiltY.positiveMax).toBeGreaterThan(0);
      expect(tiltY.positiveMax).toBeLessThanOrEqual(127);
      expect(tiltY.negativeMin).toBeGreaterThanOrEqual(128);
      expect(tiltY.negativeMax).toBeGreaterThanOrEqual(tiltY.negativeMin);
    });
  });

  describe('Status Byte Mappings', () => {
    it('should detect status byte index [1]', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      expect(config.modes[0].byteCodeMappings.status.byteIndex).toEqual([1]);
      expect(config.modes[0].byteCodeMappings.status.byteIndex).toEqual(expectedMode.byteCodeMappings.status.byteIndex);
    });

    it('should detect Huion hover status (192)', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      const statusValues = config.modes[0].byteCodeMappings.status.values;
      expect('192' in statusValues).toBe(true);
      expect(statusValues['192'].state).toBe('hover');
    });

    it('should detect Huion contact status (193)', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      const statusValues = config.modes[0].byteCodeMappings.status.values;
      expect('193' in statusValues).toBe(true);
      expect(statusValues['193'].state).toBe('contact');
    });

    it('should detect primary button hover status (196)', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      const statusValues = config.modes[0].byteCodeMappings.status.values;
      expect('196' in statusValues).toBe(true);
      expect(statusValues['196'].state).toBe('hover');
      expect(statusValues['196'].primaryButtonPressed).toBe(true);
    });

    it('should detect secondary button hover status (194)', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      const statusValues = config.modes[0].byteCodeMappings.status.values;
      expect('194' in statusValues).toBe(true);
      expect(statusValues['194'].state).toBe('hover');
      expect(statusValues['194'].secondaryButtonPressed).toBe(true);
    });
  });

  describe('Capabilities', () => {
    it('should have hasPressure true', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      expect(config.modes[0].capabilities.hasPressure).toBe(true);
    });

    it('should have hasTilt true', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      expect(config.modes[0].capabilities.hasTilt).toBe(true);
    });

    it('should have hasButtons true', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      expect(config.modes[0].capabilities.hasButtons).toBe(true);
    });

    it('should have pressure levels approximately 8191', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      expect(config.modes[0].capabilities.pressureLevels).toBeGreaterThan(7000);
    });

    it('should have resolution matching x/y max values', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      const mode = config.modes[0];
      expect(mode.capabilities.resolution.x).toBe(mode.byteCodeMappings.x.max);
      expect(mode.capabilities.resolution.y).toBe(mode.byteCodeMappings.y.max);
    });
  });

  describe('Config Structure', () => {
    it('should have all required top-level fields', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      expect(config).toHaveProperty('name');
      expect(config).toHaveProperty('manufacturer');
      expect(config).toHaveProperty('model');
      expect(config).toHaveProperty('description');
      expect(config).toHaveProperty('vendorId');
      expect(config).toHaveProperty('productId');
      expect(config).toHaveProperty('deviceInfo');
      expect(config).toHaveProperty('modes');
    });

    it('should have modes as array with at least one entry', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      expect(Array.isArray(config.modes)).toBe(true);
      expect(config.modes.length).toBeGreaterThanOrEqual(1);
    });

    it('should have all required mode fields', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      const mode = config.modes[0];
      expect(mode).toHaveProperty('reportId');
      expect(mode).toHaveProperty('digitizerUsagePage');
      expect(mode).toHaveProperty('capabilities');
      expect(mode).toHaveProperty('byteCodeMappings');
    });

    it('should have all core byte mappings', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      const mappings = config.modes[0].byteCodeMappings;
      expect(mappings).toHaveProperty('x');
      expect(mappings).toHaveProperty('y');
      expect(mappings).toHaveProperty('pressure');
      expect(mappings).toHaveProperty('status');
      expect(mappings).toHaveProperty('tiltX');
      expect(mappings).toHaveProperty('tiltY');
    });
  });

  describe('Byte Index Validation', () => {
    it('should have valid byte indices (non-negative integers)', () => {
      const engine = createEngine();
      const config = runFullWalkthrough(engine, recording);
      const mappings = config.modes[0].byteCodeMappings;
      
      for (const [name, mapping] of Object.entries(mappings)) {
        if (mapping && typeof mapping === 'object' && 'byteIndex' in mapping) {
          const byteIndex = (mapping as any).byteIndex;
          expect(Array.isArray(byteIndex)).toBe(true);
          for (const idx of byteIndex) {
            expect(typeof idx).toBe('number');
            expect(idx).toBeGreaterThanOrEqual(0);
          }
        }
      }
    });
  });
});
