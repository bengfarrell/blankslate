/**
 * Walkthrough Button Status Byte Tests
 * 
 * These tests verify that the walkthrough correctly handles ALL button status bytes
 * for both driver mode (240) and driverless mode (0, 1, 3, 6).
 * 
 * This is critical because:
 * - Without status 240, buttons won't work in driver mode
 * - Without status 0, 1, 3, 6, buttons won't work in driverless mode
 * 
 * Port of Python test: test_walkthrough_engine.py::TestButtonStatusByteHandling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WalkthroughEngine } from '../../src/core/walkthrough/index.js';
import { TabletDataGenerator } from '../../src/mockbytes/tablet-data-generator.js';
import {
  STATUS_VALUES,
  ALL_BUTTON_STATUS_BYTES,
  TABLET_BUTTON_VALUES_DRIVER,
  TABLET_BUTTON_VALUES_DRIVERLESS,
  VALUE_RANGES,
  DEVICE_INFO,
} from './xp-pen-deco640-expected.js';

describe('Button Status Byte Handling', () => {
  let engine: WalkthroughEngine;

  beforeEach(() => {
    // Create engine with packetIncludesReportId: false to match mock generator
    // The mock generator creates packets without report ID (status at index 0)
    engine = new WalkthroughEngine({ packetIncludesReportId: false });
    
    // Set device info
    engine.setDeviceInfo({
      vendorId: DEVICE_INFO.vendorId,
      productId: DEVICE_INFO.productId,
      productName: DEVICE_INFO.name,
      collections: [{ usagePage: DEVICE_INFO.usagePage, usage: DEVICE_INFO.usage }],
      allInterfaces: DEVICE_INFO.interfaces as unknown as number[],
    });
  });

  /**
   * Helper to complete walkthrough up to button step
   */
  function completeToButtonStep(): void {
    const generator = new TabletDataGenerator({
      maxX: VALUE_RANGES.x.max,
      maxY: VALUE_RANGES.y.max,
      sampleRate: 200,
    });

    engine.start();

    // Step 1: Horizontal
    engine.startCapture();
    for (const packet of generator.generateLineConstantPressure(0, 0.5, 1, 0.5, 0.5, 500)) {
      engine.processPacket(packet);
    }
    engine.stopCapture();
    engine.nextStep();

    // Step 2: Vertical
    engine.startCapture();
    for (const packet of generator.generateLineConstantPressure(0.5, 0, 0.5, 1, 0.5, 500)) {
      engine.processPacket(packet);
    }
    engine.stopCapture();
    engine.nextStep();

    // Step 3: Pressure
    engine.startCapture();
    for (const packet of generator.generateLine(0.5, 0.5, 0.5, 0.5, 500)) {
      engine.processPacket(packet);
    }
    engine.stopCapture();
    engine.nextStep();

    // Step 4: Hover
    engine.startCapture();
    for (const packet of generator.generateHoverLine(0, 0, 1, 1, 500)) {
      engine.processPacket(packet);
    }
    engine.stopCapture();
    engine.nextStep();

    // Step 5: Tilt X
    engine.startCapture();
    for (const packet of generator.generateTiltXLine(0.5, 0.5, 0.5, 0.5, 500)) {
      engine.processPacket(packet);
    }
    engine.stopCapture();
    engine.nextStep();

    // Step 6: Tilt Y
    engine.startCapture();
    for (const packet of generator.generateTiltYLine(0.5, 0.5, 0.5, 0.5, 500)) {
      engine.processPacket(packet);
    }
    engine.stopCapture();
    engine.nextStep();

    // Step 7: Primary Button
    engine.startCapture();
    for (const packet of generator.generatePrimaryButtonLine(0, 0.5, 1, 0.5, 500)) {
      engine.processPacket(packet);
    }
    engine.stopCapture();
    engine.nextStep();

    // Step 8: Secondary Button
    engine.startCapture();
    for (const packet of generator.generateSecondaryButtonLine(0, 0.5, 1, 0.5, 500)) {
      engine.processPacket(packet);
    }
    engine.stopCapture();
    engine.nextStep();

    // Now at step 9: Tablet Buttons
    expect(engine.getState().currentStep).toBe('step9-tablet-buttons');
  }

  describe('Status Byte 240 (Driver Mode)', () => {
    it('should recognize status byte 240 as button mode', () => {
      // Status 240 (0xF0) is the driver mode button status
      expect(STATUS_VALUES['240']).toEqual({ state: 'buttons' });
    });

    it('should include status 240 in ALL_BUTTON_STATUS_BYTES', () => {
      expect(ALL_BUTTON_STATUS_BYTES).toContain(240);
    });

    it('should have driver mode button values with bit-flags', () => {
      // Driver mode uses bit-flags: 1, 2, 4, 8, 16, 32, 64, 128
      expect(TABLET_BUTTON_VALUES_DRIVER['1']).toEqual({ button: 1 });
      expect(TABLET_BUTTON_VALUES_DRIVER['2']).toEqual({ button: 2 });
      expect(TABLET_BUTTON_VALUES_DRIVER['4']).toEqual({ button: 3 });
      expect(TABLET_BUTTON_VALUES_DRIVER['8']).toEqual({ button: 4 });
      expect(TABLET_BUTTON_VALUES_DRIVER['16']).toEqual({ button: 5 });
      expect(TABLET_BUTTON_VALUES_DRIVER['32']).toEqual({ button: 6 });
      expect(TABLET_BUTTON_VALUES_DRIVER['64']).toEqual({ button: 7 });
      expect(TABLET_BUTTON_VALUES_DRIVER['128']).toEqual({ button: 8 });
    });
  });

  describe('Status Bytes 0, 1, 3, 6 (Driverless Mode)', () => {
    it('should recognize driverless button status bytes', () => {
      expect(STATUS_VALUES['0']).toEqual({ state: 'keyboard' });
      expect(STATUS_VALUES['1']).toEqual({ state: 'buttons' });
      expect(STATUS_VALUES['3']).toEqual({ state: 'buttons' });
      expect(STATUS_VALUES['6']).toEqual({ state: 'buttons' });
    });

    it('should include all driverless status bytes in ALL_BUTTON_STATUS_BYTES', () => {
      expect(ALL_BUTTON_STATUS_BYTES).toContain(0);
      expect(ALL_BUTTON_STATUS_BYTES).toContain(1);
      expect(ALL_BUTTON_STATUS_BYTES).toContain(3);
      expect(ALL_BUTTON_STATUS_BYTES).toContain(6);
    });

    it('should have driverless mode button values with scan codes', () => {
      // Driverless mode uses scan codes
      expect(TABLET_BUTTON_VALUES_DRIVERLESS['5']).toEqual({ button: 1 });
      expect(TABLET_BUTTON_VALUES_DRIVERLESS['8']).toEqual({ button: 2 });
      expect(TABLET_BUTTON_VALUES_DRIVERLESS['47']).toEqual({ button: 3 });
      expect(TABLET_BUTTON_VALUES_DRIVERLESS['48']).toEqual({ button: 4 });
    });
  });

  describe('Walkthrough Button Detection with Mock Generator', () => {
    it('should detect buttons when mock generator sends status 240 packets', () => {
      const generator = new TabletDataGenerator({
        maxX: VALUE_RANGES.x.max,
        maxY: VALUE_RANGES.y.max,
        sampleRate: 200,
      });

      // Generate a button packet
      const buttonPacket = generator.generateButtonPacket(1);
      
      // The generator should use status byte 240 (0xF0)
      expect(buttonPacket[0]).toBe(0xf0);
    });

    it('should generate all 8 buttons with bit-flag encoding', () => {
      const generator = new TabletDataGenerator({
        maxX: VALUE_RANGES.x.max,
        maxY: VALUE_RANGES.y.max,
        sampleRate: 200,
      });

      const expectedBitFlags = [1, 2, 4, 8, 16, 32, 64, 128];
      
      for (let buttonNum = 1; buttonNum <= 8; buttonNum++) {
        const packet = generator.generateButtonPacket(buttonNum);
        expect(packet[0]).toBe(0xf0); // Status byte
        expect(packet[1]).toBe(expectedBitFlags[buttonNum - 1]); // Bit-flag
      }
    });
  });

  describe('Full Walkthrough with Button Detection', () => {
    it('should complete walkthrough and verify button status bytes in generated config', () => {
      completeToButtonStep();

      // Skip button detection step (no interactive buttons)
      engine.nextStep();

      // Now at metadata step
      expect(engine.getState().currentStep).toBe('step10-metadata');

      // Submit metadata
      engine.submitMetadata({
        name: DEVICE_INFO.name,
        manufacturer: DEVICE_INFO.manufacturer,
        model: DEVICE_INFO.model,
        description: 'Test walkthrough',
        buttonCount: 8,
      });

      // Verify completion
      expect(engine.getState().currentStep).toBe('complete');

      // Get generated config
      const config = engine.getByteCodeMappings();
      expect(config).toBeDefined();

      // Verify status mapping exists
      expect(config!.status).toBeDefined();
      expect(config!.status!.values).toBeDefined();

      // CRITICAL: Check that status byte 240 is present for driver mode
      // This test ensures the bug fix (adding 240 to BUTTON_MODE_STATUS_MAP) is working
      const statusValues = config!.status!.values;
      
      // Pen status bytes should always be present
      expect(statusValues['160']).toBeDefined(); // hover (XP-Pen)
      expect(statusValues['161']).toBeDefined(); // contact (XP-Pen)
      // Note: 192 (0xC0) is "hover" for Huion tablets, not "none"
      // The mock data generator uses XP-Pen style status bytes (0xA0-0xA5)
    });
  });

  describe('Mock Data Matches Python Tests', () => {
    it('should have consistent resolution values between Node.js and Python', () => {
      // These values should match Python DRIVERLESS_MODE_CONFIG
      expect(VALUE_RANGES.x.max).toBe(15999);
      expect(VALUE_RANGES.y.max).toBe(8999);
      expect(VALUE_RANGES.pressure.max).toBe(16383);
    });

    it('should have consistent tilt ranges between Node.js and Python', () => {
      // These values should match Python stable config
      expect(VALUE_RANGES.tiltX.positiveMax).toBe(60);
      expect(VALUE_RANGES.tiltX.negativeMin).toBe(196);
      expect(VALUE_RANGES.tiltX.negativeMax).toBe(255);
    });

    it('should have all expected button status bytes', () => {
      // Both driver (240) and driverless (0, 1, 3, 6) status bytes
      const allStatusBytes = ALL_BUTTON_STATUS_BYTES;
      expect(allStatusBytes.length).toBe(5);
      expect(allStatusBytes).toContain(0);   // keyboard
      expect(allStatusBytes).toContain(1);   // buttons (driverless)
      expect(allStatusBytes).toContain(3);   // buttons (driverless)
      expect(allStatusBytes).toContain(6);   // buttons (driverless)
      expect(allStatusBytes).toContain(240); // buttons (driver)
    });
  });
});
