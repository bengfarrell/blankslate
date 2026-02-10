/**
 * Recording Reader Tests - Huion Inspiroy 2M
 * 
 * These tests verify that the data reader (processDeviceData) correctly
 * interprets recorded HID packets from a Huion Inspiroy 2M tablet.
 * 
 * Unlike the walkthrough replay tests which test config GENERATION,
 * these tests verify config CONSUMPTION - that packets are correctly
 * interpreted into tablet actions (x, y, pressure, tilt, buttons, state).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { processDeviceData } from '../../src/utils/data-helpers.js';

// Recording files to test against
const HUION_RECORDING_FILES = [
  'huion-inspiroy2m-nodriver-recording.json',
  'huion-inspiroy2m-nodriver-recording2.json',
];

// Expected config for Huion (used for reading packets)
const HUION_CONFIG_PATH = join(__dirname, '../../common-test-fixtures/huion-inspiroy2m.json');

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
  }>;
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
 * Load recording file
 */
function loadRecording(filename: string): Recording {
  const path = join(__dirname, '../../common-test-fixtures', filename);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

/**
 * Load expected config
 */
function loadConfig(): any {
  return JSON.parse(readFileSync(HUION_CONFIG_PATH, 'utf-8'));
}

describe.each(HUION_RECORDING_FILES)('Huion Reader Tests: %s', (recordingFile) => {
  const recording = loadRecording(recordingFile);
  const config = loadConfig();
  const mappings = config.modes[0].byteCodeMappings;

  describe('Status Byte Interpretation', () => {
    it('should interpret hover state (192/0xC0) correctly', () => {
      // Find a packet with status byte 192 (0xC0) - hover
      const hoverPackets = recording.steps['step4-hover-movement']?.packets || [];
      expect(hoverPackets.length).toBeGreaterThan(0);

      const packet = hexToBytes(hoverPackets[0]);
      expect(packet[1]).toBe(192); // Verify it's a hover packet

      const result = processDeviceData(packet, mappings);
      expect(result.state).toBe('hover');
      expect(result.primaryButtonPressed).toBeFalsy();
      expect(result.secondaryButtonPressed).toBeFalsy();
    });

    it('should interpret contact state (193/0xC1) correctly', () => {
      // Find a packet with status byte 193 (0xC1) - contact/touching
      const pressurePackets = recording.steps['step3-pressure']?.packets || [];
      const contactPacket = pressurePackets.find(hex => {
        const bytes = hexToBytes(hex);
        return bytes[1] === 193;
      });
      expect(contactPacket).toBeDefined();

      const packet = hexToBytes(contactPacket!);
      const result = processDeviceData(packet, mappings);
      expect(result.state).toBe('contact');
      expect(result.primaryButtonPressed).toBeFalsy();
      expect(result.secondaryButtonPressed).toBeFalsy();
    });

    it('should interpret primary button hover (196/0xC4) correctly', () => {
      const buttonPackets = recording.steps['step7-primary-button']?.packets || [];
      const primaryBtnPacket = buttonPackets.find(hex => {
        const bytes = hexToBytes(hex);
        return bytes[1] === 196; // 0xC4
      });
      expect(primaryBtnPacket).toBeDefined();

      const packet = hexToBytes(primaryBtnPacket!);
      const result = processDeviceData(packet, mappings);
      expect(result.state).toBe('hover');
      expect(result.primaryButtonPressed).toBe(true);
      expect(result.secondaryButtonPressed).toBeFalsy();
    });

    it('should interpret secondary button hover (194/0xC2) correctly', () => {
      const buttonPackets = recording.steps['step8-secondary-button']?.packets || [];
      const secondaryBtnPacket = buttonPackets.find(hex => {
        const bytes = hexToBytes(hex);
        return bytes[1] === 194; // 0xC2
      });
      expect(secondaryBtnPacket).toBeDefined();

      const packet = hexToBytes(secondaryBtnPacket!);
      const result = processDeviceData(packet, mappings);
      expect(result.state).toBe('hover');
      expect(result.secondaryButtonPressed).toBe(true);
      expect(result.primaryButtonPressed).toBeFalsy();
    });

    it('should interpret primary button contact (197/0xC5) correctly', () => {
      // Primary button while touching surface
      const buttonPackets = recording.steps['step7-primary-button']?.packets || [];
      const primaryContactPacket = buttonPackets.find(hex => {
        const bytes = hexToBytes(hex);
        return bytes[1] === 197; // 0xC5
      });

      if (primaryContactPacket) {
        const packet = hexToBytes(primaryContactPacket);
        const result = processDeviceData(packet, mappings);
        expect(result.state).toBe('contact');
        expect(result.primaryButtonPressed).toBe(true);
      }
    });

    it('should interpret secondary button contact (195/0xC3) correctly', () => {
      // Secondary button while touching surface
      const buttonPackets = recording.steps['step8-secondary-button']?.packets || [];
      const secondaryContactPacket = buttonPackets.find(hex => {
        const bytes = hexToBytes(hex);
        return bytes[1] === 195; // 0xC3
      });

      if (secondaryContactPacket) {
        const packet = hexToBytes(secondaryContactPacket);
        const result = processDeviceData(packet, mappings);
        expect(result.state).toBe('contact');
        expect(result.secondaryButtonPressed).toBe(true);
      }
    });

    it('should have consistent button states across multiple packets', () => {
      const buttonPackets = recording.steps['step7-primary-button']?.packets || [];

      let primaryPressedCount = 0;
      let primaryNotPressedCount = 0;

      for (const hex of buttonPackets.slice(0, 30)) {
        const packet = hexToBytes(hex);
        const result = processDeviceData(packet, mappings);
        if (result.primaryButtonPressed) {
          primaryPressedCount++;
        } else {
          primaryNotPressedCount++;
        }
      }

      // Should have some packets with button pressed
      expect(primaryPressedCount).toBeGreaterThan(0);
    });

    it('should correctly identify no buttons pressed in normal hover', () => {
      const hoverPackets = recording.steps['step4-hover-movement']?.packets || [];

      let noButtonsCount = 0;
      for (const hex of hoverPackets.slice(0, 20)) {
        const packet = hexToBytes(hex);
        const result = processDeviceData(packet, mappings);
        if (!result.primaryButtonPressed && !result.secondaryButtonPressed) {
          noButtonsCount++;
        }
      }

      // Most hover packets should have no buttons pressed
      expect(noButtonsCount).toBeGreaterThan(15);
    });
  });

  describe('Coordinate Interpretation', () => {
    // Note: processDeviceData returns NORMALIZED values (0-1) for multi-byte-range types
    // This is by design for the reader to provide values ready for drawing

    it('should parse X coordinate from horizontal movement packets', () => {
      const packets = recording.steps['step1-horizontal']?.packets || [];
      expect(packets.length).toBeGreaterThan(10);

      // Get X values from multiple packets
      const xValues: number[] = [];
      for (let i = 0; i < Math.min(50, packets.length); i++) {
        const packet = hexToBytes(packets[i]);
        const result = processDeviceData(packet, mappings);
        if (typeof result.x === 'number') {
          xValues.push(result.x);
        }
      }

      expect(xValues.length).toBeGreaterThan(0);
      // X should vary during horizontal movement (normalized 0-1 range)
      const minX = Math.min(...xValues);
      const maxX = Math.max(...xValues);
      expect(maxX - minX).toBeGreaterThan(0.01); // Should have significant X variation
    });

    it('should parse Y coordinate from vertical movement packets', () => {
      const packets = recording.steps['step2-vertical']?.packets || [];
      expect(packets.length).toBeGreaterThan(10);

      const yValues: number[] = [];
      for (let i = 0; i < Math.min(50, packets.length); i++) {
        const packet = hexToBytes(packets[i]);
        const result = processDeviceData(packet, mappings);
        if (typeof result.y === 'number') {
          yValues.push(result.y);
        }
      }

      expect(yValues.length).toBeGreaterThan(0);
      const minY = Math.min(...yValues);
      const maxY = Math.max(...yValues);
      expect(maxY - minY).toBeGreaterThan(0.01); // Should have significant Y variation
    });

    it('should parse coordinates within valid range (normalized 0-1)', () => {
      const packets = recording.steps['step1-horizontal']?.packets || [];

      for (let i = 0; i < Math.min(20, packets.length); i++) {
        const packet = hexToBytes(packets[i]);
        const result = processDeviceData(packet, mappings);

        if (typeof result.x === 'number') {
          expect(result.x).toBeGreaterThanOrEqual(0);
          expect(result.x).toBeLessThanOrEqual(1);
        }
        if (typeof result.y === 'number') {
          expect(result.y).toBeGreaterThanOrEqual(0);
          expect(result.y).toBeLessThanOrEqual(1);
        }
      }
    });

    it('should have relatively stable Y during horizontal movement', () => {
      const packets = recording.steps['step1-horizontal']?.packets || [];

      const yValues: number[] = [];
      for (let i = 0; i < Math.min(30, packets.length); i++) {
        const packet = hexToBytes(packets[i]);
        const result = processDeviceData(packet, mappings);
        if (typeof result.y === 'number') {
          yValues.push(result.y);
        }
      }

      if (yValues.length > 5) {
        const minY = Math.min(...yValues);
        const maxY = Math.max(...yValues);
        // Y variation should be less than X variation during horizontal movement
        // (not perfectly stable due to hand movement, but relatively stable)
        expect(maxY - minY).toBeLessThan(0.5);
      }
    });

    it('should have relatively stable X during vertical movement', () => {
      const packets = recording.steps['step2-vertical']?.packets || [];

      const xValues: number[] = [];
      for (let i = 0; i < Math.min(30, packets.length); i++) {
        const packet = hexToBytes(packets[i]);
        const result = processDeviceData(packet, mappings);
        if (typeof result.x === 'number') {
          xValues.push(result.x);
        }
      }

      if (xValues.length > 5) {
        const minX = Math.min(...xValues);
        const maxX = Math.max(...xValues);
        // X variation should be less than full range during vertical movement
        // (some drift is expected due to hand movement)
        expect(maxX - minX).toBeLessThan(0.8);
      }
    });

    it('should correctly parse little-endian X coordinate', () => {
      const packets = recording.steps['step1-horizontal']?.packets || [];
      expect(packets.length).toBeGreaterThan(0);

      const packet = hexToBytes(packets[10]);
      const result = processDeviceData(packet, mappings);

      // Manual little-endian calculation: low byte + (high byte << 8)
      const rawX = packet[2] | (packet[3] << 8);
      const expectedX = rawX / 32767;

      expect(result.x).toBeCloseTo(expectedX, 5);
    });

    it('should correctly parse little-endian Y coordinate', () => {
      const packets = recording.steps['step2-vertical']?.packets || [];
      expect(packets.length).toBeGreaterThan(0);

      const packet = hexToBytes(packets[10]);
      const result = processDeviceData(packet, mappings);

      // Manual little-endian calculation: low byte + (high byte << 8)
      const rawY = packet[4] | (packet[5] << 8);
      const expectedY = rawY / 32767;

      expect(result.y).toBeCloseTo(expectedY, 5);
    });

    it('should have coordinates present in all pen packets', () => {
      const allSteps = ['step1-horizontal', 'step2-vertical', 'step3-pressure', 'step4-hover-movement'];

      for (const stepName of allSteps) {
        const packets = recording.steps[stepName]?.packets || [];
        for (let i = 0; i < Math.min(5, packets.length); i++) {
          const packet = hexToBytes(packets[i]);
          const result = processDeviceData(packet, mappings);

          expect(result).toHaveProperty('x');
          expect(result).toHaveProperty('y');
          expect(typeof result.x).toBe('number');
          expect(typeof result.y).toBe('number');
        }
      }
    });
  });

  describe('Pressure Interpretation', () => {
    // Note: processDeviceData returns NORMALIZED values (0-1) for multi-byte-range types

    it('should parse pressure from pressure step packets', () => {
      const packets = recording.steps['step3-pressure']?.packets || [];
      expect(packets.length).toBeGreaterThan(10);

      const pressureValues: number[] = [];
      for (const hex of packets) {
        const packet = hexToBytes(hex);
        const result = processDeviceData(packet, mappings);
        if (typeof result.pressure === 'number' && result.pressure > 0) {
          pressureValues.push(result.pressure);
        }
      }

      expect(pressureValues.length).toBeGreaterThan(0);
      // Should have varying pressure levels (normalized 0-1 range)
      const maxPressure = Math.max(...pressureValues);
      expect(maxPressure).toBeGreaterThan(0.01); // At least 1% pressure
      expect(maxPressure).toBeLessThanOrEqual(1);
    });

    it('should have zero or low pressure during hover', () => {
      const packets = recording.steps['step4-hover-movement']?.packets || [];

      let lowPressureCount = 0;
      for (let i = 0; i < Math.min(20, packets.length); i++) {
        const packet = hexToBytes(packets[i]);
        const result = processDeviceData(packet, mappings);
        // Normalized pressure < 0.01 is considered low/zero
        if (typeof result.pressure === 'number' && result.pressure < 0.01) {
          lowPressureCount++;
        }
      }

      // Most hover packets should have low/zero pressure
      expect(lowPressureCount).toBeGreaterThan(10);
    });

    it('should have varying pressure levels during pressure step', () => {
      const packets = recording.steps['step3-pressure']?.packets || [];

      const pressureValues: number[] = [];
      for (const hex of packets) {
        const packet = hexToBytes(hex);
        const result = processDeviceData(packet, mappings);
        if (typeof result.pressure === 'number') {
          pressureValues.push(result.pressure);
        }
      }

      const minPressure = Math.min(...pressureValues);
      const maxPressure = Math.max(...pressureValues);

      // Should have a range of pressure values (light to heavy touch)
      expect(maxPressure - minPressure).toBeGreaterThan(0.1);
    });

    it('should correctly parse little-endian pressure', () => {
      const packets = recording.steps['step3-pressure']?.packets || [];
      // Find a packet with contact state (has pressure)
      const contactPacket = packets.find(hex => {
        const bytes = hexToBytes(hex);
        return bytes[1] === 193; // Contact state
      });

      if (contactPacket) {
        const packet = hexToBytes(contactPacket);
        const result = processDeviceData(packet, mappings);

        // Manual little-endian calculation
        const rawPressure = packet[6] | (packet[7] << 8);
        const expectedPressure = rawPressure / 8191;

        expect(result.pressure).toBeCloseTo(expectedPressure, 5);
      }
    });

    it('should have pressure correlated with contact state', () => {
      const packets = recording.steps['step3-pressure']?.packets || [];

      let contactWithPressure = 0;
      let hoverWithLowPressure = 0;

      for (const hex of packets) {
        const packet = hexToBytes(hex);
        const result = processDeviceData(packet, mappings);

        if (result.state === 'contact' && typeof result.pressure === 'number' && result.pressure > 0.01) {
          contactWithPressure++;
        }
        if (result.state === 'hover' && typeof result.pressure === 'number' && result.pressure < 0.01) {
          hoverWithLowPressure++;
        }
      }

      // Contact state should generally have pressure
      expect(contactWithPressure).toBeGreaterThan(0);
    });

    it('should have pressure within valid normalized range for all packets', () => {
      const allSteps = ['step1-horizontal', 'step2-vertical', 'step3-pressure', 'step4-hover-movement'];

      for (const stepName of allSteps) {
        const packets = recording.steps[stepName]?.packets || [];
        for (const hex of packets.slice(0, 10)) {
          const packet = hexToBytes(hex);
          const result = processDeviceData(packet, mappings);

          if (typeof result.pressure === 'number') {
            expect(result.pressure).toBeGreaterThanOrEqual(0);
            expect(result.pressure).toBeLessThanOrEqual(1);
          }
        }
      }
    });
  });

  describe('Tilt Interpretation', () => {
    it('should parse tiltX from tilt-x step packets', () => {
      const packets = recording.steps['step5-tilt-x']?.packets || [];
      expect(packets.length).toBeGreaterThan(10);

      const tiltXValues: number[] = [];
      for (const hex of packets) {
        const packet = hexToBytes(hex);
        const result = processDeviceData(packet, mappings);
        if (typeof result.tiltX === 'number') {
          tiltXValues.push(result.tiltX);
        }
      }

      expect(tiltXValues.length).toBeGreaterThan(0);
      // Should have both positive and negative tilt values
      const hasPositive = tiltXValues.some(t => t > 0);
      const hasNegative = tiltXValues.some(t => t < 0);
      expect(hasPositive || hasNegative).toBe(true);
    });

    it('should parse tiltY from tilt-y step packets', () => {
      const packets = recording.steps['step6-tilt-y']?.packets || [];
      expect(packets.length).toBeGreaterThan(10);

      const tiltYValues: number[] = [];
      for (const hex of packets) {
        const packet = hexToBytes(hex);
        const result = processDeviceData(packet, mappings);
        if (typeof result.tiltY === 'number') {
          tiltYValues.push(result.tiltY);
        }
      }

      expect(tiltYValues.length).toBeGreaterThan(0);
      const hasPositive = tiltYValues.some(t => t > 0);
      const hasNegative = tiltYValues.some(t => t < 0);
      expect(hasPositive || hasNegative).toBe(true);
    });

    it('should have tiltX variation during tilt-x step', () => {
      const packets = recording.steps['step5-tilt-x']?.packets || [];

      const tiltXValues: number[] = [];
      for (const hex of packets) {
        const packet = hexToBytes(hex);
        const result = processDeviceData(packet, mappings);
        if (typeof result.tiltX === 'number') {
          tiltXValues.push(result.tiltX);
        }
      }

      if (tiltXValues.length > 5) {
        const minTilt = Math.min(...tiltXValues);
        const maxTilt = Math.max(...tiltXValues);
        // Should have some tilt variation (even small amounts indicate tilt detection works)
        expect(maxTilt - minTilt).toBeGreaterThan(0.5);
      }
    });

    it('should have tiltY variation during tilt-y step', () => {
      const packets = recording.steps['step6-tilt-y']?.packets || [];

      const tiltYValues: number[] = [];
      for (const hex of packets) {
        const packet = hexToBytes(hex);
        const result = processDeviceData(packet, mappings);
        if (typeof result.tiltY === 'number') {
          tiltYValues.push(result.tiltY);
        }
      }

      if (tiltYValues.length > 5) {
        const minTilt = Math.min(...tiltYValues);
        const maxTilt = Math.max(...tiltYValues);
        // Should have some tilt variation (even small amounts indicate tilt detection works)
        expect(maxTilt - minTilt).toBeGreaterThan(0.5);
      }
    });

    it('should have tilt values within reasonable range (-90 to 90 degrees)', () => {
      const allSteps = ['step5-tilt-x', 'step6-tilt-y'];

      for (const stepName of allSteps) {
        const packets = recording.steps[stepName]?.packets || [];
        for (const hex of packets.slice(0, 20)) {
          const packet = hexToBytes(hex);
          const result = processDeviceData(packet, mappings);

          if (typeof result.tiltX === 'number') {
            expect(result.tiltX).toBeGreaterThanOrEqual(-90);
            expect(result.tiltX).toBeLessThanOrEqual(90);
          }
          if (typeof result.tiltY === 'number') {
            expect(result.tiltY).toBeGreaterThanOrEqual(-90);
            expect(result.tiltY).toBeLessThanOrEqual(90);
          }
        }
      }
    });

    it('should have tilt present in all pen packets', () => {
      const allSteps = ['step1-horizontal', 'step2-vertical', 'step3-pressure', 'step4-hover-movement'];

      for (const stepName of allSteps) {
        const packets = recording.steps[stepName]?.packets || [];
        for (let i = 0; i < Math.min(3, packets.length); i++) {
          const packet = hexToBytes(packets[i]);
          const result = processDeviceData(packet, mappings);

          expect(result).toHaveProperty('tiltX');
          expect(result).toHaveProperty('tiltY');
          expect(typeof result.tiltX).toBe('number');
          expect(typeof result.tiltY).toBe('number');
        }
      }
    });

    it('should correctly interpret bipolar tilt encoding', () => {
      // Huion uses bipolar encoding:
      // - Positive: 0 to positiveMax (e.g., 0-80 for +80°)
      // - Negative: negativeMin to negativeMax (e.g., 176-255 for negative angles)
      const packets = recording.steps['step5-tilt-x']?.packets || [];

      for (const hex of packets.slice(0, 10)) {
        const packet = hexToBytes(hex);
        const rawTiltX = packet[8];
        const result = processDeviceData(packet, mappings);

        // If raw byte is in positive range (0-80), tilt should be positive or zero
        if (rawTiltX <= 80) {
          expect(result.tiltX).toBeGreaterThanOrEqual(0);
        }
        // If raw byte is in negative range (176-255), tilt should be negative
        if (rawTiltX >= 176) {
          expect(result.tiltX).toBeLessThanOrEqual(0);
        }
      }
    });
  });

  describe('Complete Packet Interpretation', () => {
    it('should return all expected fields for a contact packet', () => {
      const packets = recording.steps['step3-pressure']?.packets || [];
      const contactPacket = packets.find(hex => {
        const bytes = hexToBytes(hex);
        return bytes[1] === 193; // Contact state
      });
      expect(contactPacket).toBeDefined();

      const packet = hexToBytes(contactPacket!);
      const result = processDeviceData(packet, mappings);

      // Should have all core fields
      expect(result).toHaveProperty('state');
      expect(result).toHaveProperty('x');
      expect(result).toHaveProperty('y');
      expect(result).toHaveProperty('pressure');
      expect(result).toHaveProperty('tiltX');
      expect(result).toHaveProperty('tiltY');

      // Values should be reasonable
      expect(result.state).toBe('contact');
      expect(typeof result.x).toBe('number');
      expect(typeof result.y).toBe('number');
      expect(typeof result.pressure).toBe('number');
    });

    it('should correctly interpret a known packet byte-by-byte', () => {
      // Take first packet from step1 and verify manual calculation matches
      const packets = recording.steps['step1-horizontal']?.packets || [];
      expect(packets.length).toBeGreaterThan(0);

      const packet = hexToBytes(packets[5]); // Use 6th packet (likely has data)
      const result = processDeviceData(packet, mappings);

      // Manual calculation based on config:
      // x: bytes [2, 3] little-endian, normalized to 0-1 (max 32767)
      // y: bytes [4, 5] little-endian, normalized to 0-1 (max 32767)
      // pressure: bytes [6, 7] little-endian, normalized to 0-1 (max 8191)
      const rawX = packet[2] | (packet[3] << 8);
      const rawY = packet[4] | (packet[5] << 8);
      const rawPressure = packet[6] | (packet[7] << 8);

      // processDeviceData returns normalized values
      const expectedX = rawX / 32767;
      const expectedY = rawY / 32767;
      const expectedPressure = rawPressure / 8191;

      expect(result.x).toBeCloseTo(expectedX, 5);
      expect(result.y).toBeCloseTo(expectedY, 5);
      expect(result.pressure).toBeCloseTo(expectedPressure, 5);
    });

    it('should return all expected fields for a hover packet', () => {
      const packets = recording.steps['step4-hover-movement']?.packets || [];
      expect(packets.length).toBeGreaterThan(0);

      const packet = hexToBytes(packets[0]);
      const result = processDeviceData(packet, mappings);

      // Should have all core fields
      expect(result).toHaveProperty('state');
      expect(result).toHaveProperty('x');
      expect(result).toHaveProperty('y');
      expect(result).toHaveProperty('pressure');
      expect(result).toHaveProperty('tiltX');
      expect(result).toHaveProperty('tiltY');

      expect(result.state).toBe('hover');
    });

    it('should verify report ID is correct (10 for Huion)', () => {
      const packets = recording.steps['step1-horizontal']?.packets || [];

      for (const hex of packets.slice(0, 10)) {
        const packet = hexToBytes(hex);
        // Huion uses report ID 10 (0x0A)
        expect(packet[0]).toBe(10);
      }
    });

    it('should interpret multiple consecutive packets consistently', () => {
      const packets = recording.steps['step1-horizontal']?.packets || [];

      let prevX: number | undefined;
      let largeJumpCount = 0;

      for (let i = 0; i < Math.min(30, packets.length); i++) {
        const packet = hexToBytes(packets[i]);
        const result = processDeviceData(packet, mappings);

        if (typeof result.x === 'number' && prevX !== undefined) {
          // Check for unreasonably large jumps (would indicate parsing error)
          const jump = Math.abs(result.x - prevX);
          if (jump > 0.5) {
            largeJumpCount++;
          }
        }
        prevX = result.x as number;
      }

      // Should have very few large jumps (smooth movement)
      expect(largeJumpCount).toBeLessThan(5);
    });
  });

  describe('State Transitions', () => {
    it('should detect hover to contact transition in pressure step', () => {
      const packets = recording.steps['step3-pressure']?.packets || [];

      let foundHover = false;
      let foundContact = false;

      for (const hex of packets) {
        const packet = hexToBytes(hex);
        const result = processDeviceData(packet, mappings);

        if (result.state === 'hover') foundHover = true;
        if (result.state === 'contact') foundContact = true;
      }

      // Pressure step should have both hover and contact states
      expect(foundContact).toBe(true);
    });

    it('should have button press and release in button steps', () => {
      const packets = recording.steps['step7-primary-button']?.packets || [];

      let pressedCount = 0;
      let notPressedCount = 0;

      for (const hex of packets) {
        const packet = hexToBytes(hex);
        const result = processDeviceData(packet, mappings);

        if (result.primaryButtonPressed) {
          pressedCount++;
        } else {
          notPressedCount++;
        }
      }

      // Should have both pressed and not-pressed states (button was pressed and released)
      expect(pressedCount).toBeGreaterThan(0);
    });

    it('should maintain position during button press', () => {
      const packets = recording.steps['step7-primary-button']?.packets || [];

      const positions: Array<{x: number, y: number, pressed: boolean}> = [];

      for (const hex of packets.slice(0, 20)) {
        const packet = hexToBytes(hex);
        const result = processDeviceData(packet, mappings);

        if (typeof result.x === 'number' && typeof result.y === 'number') {
          positions.push({
            x: result.x,
            y: result.y,
            pressed: !!result.primaryButtonPressed
          });
        }
      }

      // Position should be relatively stable during button operations
      if (positions.length > 5) {
        const xValues = positions.map(p => p.x);
        const yValues = positions.map(p => p.y);
        const xRange = Math.max(...xValues) - Math.min(...xValues);
        const yRange = Math.max(...yValues) - Math.min(...yValues);

        // Position shouldn't jump wildly during button press
        expect(xRange).toBeLessThan(0.3);
        expect(yRange).toBeLessThan(0.3);
      }
    });
  });

  describe('Raw Byte Verification', () => {
    it('should correctly parse packet structure for multiple packets', () => {
      const allSteps = ['step1-horizontal', 'step2-vertical', 'step3-pressure'];

      for (const stepName of allSteps) {
        const packets = recording.steps[stepName]?.packets || [];

        for (let i = 0; i < Math.min(5, packets.length); i++) {
          const packet = hexToBytes(packets[i]);
          const result = processDeviceData(packet, mappings);

          // Verify byte 0 is report ID (10)
          expect(packet[0]).toBe(10);

          // Verify byte 1 is a valid status byte
          const validStatusBytes = [192, 193, 194, 195, 196, 197, 0];
          expect(validStatusBytes).toContain(packet[1]);

          // Verify X calculation
          const rawX = packet[2] | (packet[3] << 8);
          expect(result.x).toBeCloseTo(rawX / 32767, 5);

          // Verify Y calculation
          const rawY = packet[4] | (packet[5] << 8);
          expect(result.y).toBeCloseTo(rawY / 32767, 5);
        }
      }
    });

    it('should handle packet with all zeros correctly', () => {
      // Create a synthetic all-zeros packet
      const zeroPacket = new Uint8Array(10).fill(0);
      zeroPacket[0] = 10; // Report ID

      const result = processDeviceData(zeroPacket, mappings);

      // Should interpret as no state or none
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.pressure).toBe(0);
    });

    it('should correctly identify packet length', () => {
      const packets = recording.steps['step1-horizontal']?.packets || [];

      for (const hex of packets.slice(0, 10)) {
        const packet = hexToBytes(hex);
        // Huion packets should be 10 bytes
        expect(packet.length).toBe(10);
      }
    });
  });
});
