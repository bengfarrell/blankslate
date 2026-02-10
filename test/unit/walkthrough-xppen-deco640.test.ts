/**
 * Walkthrough Tests - XP-Pen Deco 640
 * 
 * These tests verify that the walkthrough correctly detects byte patterns
 * and generates a configuration matching the XP-Pen Deco 640 tablet.
 * 
 * The expected values are defined in test/unit/xp-pen-deco640-expected.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WalkthroughEngine, STEP_INFO } from '../../src/core/walkthrough/index.js';
import { TabletDataGenerator } from '../../src/mockbytes/tablet-data-generator.js';
import { processDeviceData } from '../../src/utils/data-helpers.js';
import {
  DEVICE_INFO,
  BYTE_LAYOUT,
  RAW_PACKET_LAYOUT,
  VALUE_RANGES,
  STATUS_BYTES,
  EXPRESS_KEY_MAPPINGS,
  CAPABILITIES,
  createTestPacket,
  createKeyboardPacket,
} from './xp-pen-deco640-expected.js';

describe('XP-Pen Deco 640 Walkthrough', () => {
  let engine: WalkthroughEngine;
  let generator: TabletDataGenerator;

  beforeEach(() => {
    // Create engine with packetIncludesReportId: false to match mock generator
    // The mock generator creates packets without report ID (status at index 0)
    engine = new WalkthroughEngine({ packetIncludesReportId: false });
    generator = new TabletDataGenerator({
      maxX: VALUE_RANGES.x.max,
      maxY: VALUE_RANGES.y.max,
      sampleRate: 200,
    });

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
   * Helper to collect packets from a generator
   */
  function collectPackets(gen: Generator<Uint8Array>, maxPackets = 300): Uint8Array[] {
    const packets: Uint8Array[] = [];
    for (const packet of gen) {
      packets.push(packet);
      if (packets.length >= maxPackets) break;
    }
    return packets;
  }

  /**
   * Helper to run a step and process packets
   */
  function runStep(packets: Uint8Array[]): void {
    engine.startCapture();
    for (const packet of packets) {
      engine.processPacket(packet);
    }
    engine.stopCapture();
  }

  // ==========================================================================
  // Step-by-Step Detection Tests
  // ==========================================================================

  describe('Step 1: Horizontal Movement (X Coordinate)', () => {
    it('should detect X coordinate bytes at indices 1-2', () => {
      engine.start();
      expect(engine.getState().currentStep).toBe('step1-horizontal');

      const packets = collectPackets(
        generator.generateLineConstantPressure(0, 0.5, 1, 0.5, 0.5, 1500)
      );
      runStep(packets);

      const stepData = engine.getState().stepData.get('step1-horizontal');
      expect(stepData).toBeDefined();
      // stepData.detectedBytes contains raw packet indices (before +1 offset for config)
      expect(stepData!.detectedBytes.map(b => b.byteIndex)).toEqual(RAW_PACKET_LAYOUT.x.byteIndex);
    });
  });

  describe('Step 2: Vertical Movement (Y Coordinate)', () => {
    it('should detect Y coordinate bytes at indices 3-4', () => {
      engine.start();
      
      // Complete step 1 first
      const horizontalPackets = collectPackets(
        generator.generateLineConstantPressure(0, 0.5, 1, 0.5, 0.5, 1500)
      );
      runStep(horizontalPackets);
      engine.nextStep();

      expect(engine.getState().currentStep).toBe('step2-vertical');

      const verticalPackets = collectPackets(
        generator.generateLineConstantPressure(0.5, 0, 0.5, 1, 0.5, 1500)
      );
      runStep(verticalPackets);

      const stepData = engine.getState().stepData.get('step2-vertical');
      expect(stepData).toBeDefined();
      // stepData.detectedBytes contains raw packet indices (before +1 offset for config)
      expect(stepData!.detectedBytes.map(b => b.byteIndex)).toEqual(RAW_PACKET_LAYOUT.y.byteIndex);
    });
  });

  describe('Step 3: Pressure Detection', () => {
    it('should detect pressure bytes at indices 5-6', () => {
      engine.start();
      
      // Complete steps 1-2
      runStep(collectPackets(generator.generateLineConstantPressure(0, 0.5, 1, 0.5, 0.5, 1500)));
      engine.nextStep();
      runStep(collectPackets(generator.generateLineConstantPressure(0.5, 0, 0.5, 1, 0.5, 1500)));
      engine.nextStep();

      expect(engine.getState().currentStep).toBe('step3-pressure');

      const pressurePackets = collectPackets(
        generator.generateLine(0.5, 0.5, 0.5, 0.5, 1500)
      );
      runStep(pressurePackets);

      const stepData = engine.getState().stepData.get('step3-pressure');
      expect(stepData).toBeDefined();
      // stepData.detectedBytes contains raw packet indices (before +1 offset for config)
      expect(stepData!.detectedBytes.map(b => b.byteIndex)).toEqual(RAW_PACKET_LAYOUT.pressure.byteIndex);
    });
  });

  describe('Step 5: Tilt X Detection', () => {
    it('should detect tilt X byte at index 7', () => {
      engine.start();
      
      // Complete steps 1-4
      runStep(collectPackets(generator.generateLineConstantPressure(0, 0.5, 1, 0.5, 0.5, 1500)));
      engine.nextStep();
      runStep(collectPackets(generator.generateLineConstantPressure(0.5, 0, 0.5, 1, 0.5, 1500)));
      engine.nextStep();
      runStep(collectPackets(generator.generateLine(0.5, 0.5, 0.5, 0.5, 1500)));
      engine.nextStep();
      runStep(collectPackets(generator.generateHoverLine(0, 0, 1, 1, 1500)));
      engine.nextStep();

      expect(engine.getState().currentStep).toBe('step5-tilt-x');

      const tiltXPackets = collectPackets(
        generator.generateTiltXLine(0.5, 0.5, 0.5, 0.5, 1500)
      );
      runStep(tiltXPackets);

      const stepData = engine.getState().stepData.get('step5-tilt-x');
      expect(stepData).toBeDefined();
      // stepData.detectedBytes contains raw packet indices (before +1 offset for config)
      expect(stepData!.detectedBytes.map(b => b.byteIndex)).toEqual(RAW_PACKET_LAYOUT.tiltX.byteIndex);
    });
  });

  describe('Step 6: Tilt Y Detection', () => {
    it('should detect tilt Y byte at index 8', () => {
      engine.start();
      
      // Complete steps 1-5
      runStep(collectPackets(generator.generateLineConstantPressure(0, 0.5, 1, 0.5, 0.5, 1500)));
      engine.nextStep();
      runStep(collectPackets(generator.generateLineConstantPressure(0.5, 0, 0.5, 1, 0.5, 1500)));
      engine.nextStep();
      runStep(collectPackets(generator.generateLine(0.5, 0.5, 0.5, 0.5, 1500)));
      engine.nextStep();
      runStep(collectPackets(generator.generateHoverLine(0, 0, 1, 1, 1500)));
      engine.nextStep();
      runStep(collectPackets(generator.generateTiltXLine(0.5, 0.5, 0.5, 0.5, 1500)));
      engine.nextStep();

      expect(engine.getState().currentStep).toBe('step6-tilt-y');

      const tiltYPackets = collectPackets(
        generator.generateTiltYLine(0.5, 0.5, 0.5, 0.5, 1500)
      );
      runStep(tiltYPackets);

      const stepData = engine.getState().stepData.get('step6-tilt-y');
      expect(stepData).toBeDefined();
      // stepData.detectedBytes contains raw packet indices (before +1 offset for config)
      expect(stepData!.detectedBytes.map(b => b.byteIndex)).toEqual(RAW_PACKET_LAYOUT.tiltY.byteIndex);
    });
  });

  // ==========================================================================
  // Status Byte Detection Tests
  // ==========================================================================

  describe('Status Byte Detection', () => {
    it('should detect hover status byte (0xA0 = 160)', () => {
      const packet = createTestPacket({ status: STATUS_BYTES.hover, x: 8000, y: 4500 });
      expect(packet[0]).toBe(STATUS_BYTES.hover);
    });

    it('should detect contact status byte (0xA1 = 161)', () => {
      const packet = createTestPacket({ 
        status: STATUS_BYTES.contact, 
        x: 8000, 
        y: 4500, 
        pressure: 8000 
      });
      expect(packet[0]).toBe(STATUS_BYTES.contact);
    });

    it('should detect none status byte (0xC0 = 192)', () => {
      const packet = createTestPacket({ status: STATUS_BYTES.none });
      expect(packet[0]).toBe(STATUS_BYTES.none);
    });

    it('should detect primary button status byte (0xA5 = 165)', () => {
      const packet = createTestPacket({ 
        status: STATUS_BYTES.contactPrimary, 
        x: 8000, 
        y: 4500, 
        pressure: 5000 
      });
      expect(packet[0]).toBe(STATUS_BYTES.contactPrimary);
    });

    it('should detect secondary button status byte (0xA3 = 163)', () => {
      const packet = createTestPacket({ 
        status: STATUS_BYTES.contactSecondary, 
        x: 8000, 
        y: 4500, 
        pressure: 5000 
      });
      expect(packet[0]).toBe(STATUS_BYTES.contactSecondary);
    });
  });

  // ==========================================================================
  // Express Key (Tablet Button) Tests
  // ==========================================================================

  describe('Express Key Detection', () => {
    it('should create valid keyboard packets for button 1', () => {
      const packet = createKeyboardPacket({ 
        status: EXPRESS_KEY_MAPPINGS.button1.statusByte,
        scanCode: EXPRESS_KEY_MAPPINGS.button1.scanCode,
      });
      expect(packet[0]).toBe(0);
      expect(packet[1]).toBe(5);
    });

    it('should create valid keyboard packets for button 7', () => {
      const packet = createKeyboardPacket({ 
        status: EXPRESS_KEY_MAPPINGS.button7.statusByte,
        scanCode: EXPRESS_KEY_MAPPINGS.button7.scanCode,
      });
      expect(packet[0]).toBe(1);
      expect(packet[1]).toBe(29);
    });

    it('should create valid keyboard packets for button 8 (shares scan code with button 7)', () => {
      const packet = createKeyboardPacket({ 
        status: EXPRESS_KEY_MAPPINGS.button8.statusByte,
        scanCode: EXPRESS_KEY_MAPPINGS.button8.scanCode,
      });
      expect(packet[0]).toBe(3);
      expect(packet[1]).toBe(29);
      // Same scan code as button 7, different status byte
      expect(packet[1]).toBe(EXPRESS_KEY_MAPPINGS.button7.scanCode);
    });

    it('should distinguish button 7 and 8 by status byte', () => {
      const button7Packet = createKeyboardPacket({ 
        status: EXPRESS_KEY_MAPPINGS.button7.statusByte,
        scanCode: EXPRESS_KEY_MAPPINGS.button7.scanCode,
      });
      const button8Packet = createKeyboardPacket({ 
        status: EXPRESS_KEY_MAPPINGS.button8.statusByte,
        scanCode: EXPRESS_KEY_MAPPINGS.button8.scanCode,
      });
      
      // Same scan code
      expect(button7Packet[1]).toBe(button8Packet[1]);
      // Different status byte
      expect(button7Packet[0]).not.toBe(button8Packet[0]);
      expect(button7Packet[0]).toBe(1);
      expect(button8Packet[0]).toBe(3);
    });
  });

  // ==========================================================================
  // Data Processing Tests
  // ==========================================================================

  describe('Data Processing', () => {
    it('should correctly parse X coordinate from packet', () => {
      // X at 50% (8000 of 15999)
      const x = Math.round(0.5 * VALUE_RANGES.x.max);
      const packet = createTestPacket({ status: STATUS_BYTES.hover, x, y: 0 });
      
      // Verify little-endian encoding
      const reconstructedX = packet[1] | (packet[2] << 8);
      expect(reconstructedX).toBe(x);
    });

    it('should correctly parse Y coordinate from packet', () => {
      // Y at 50% (4500 of 8999)
      const y = Math.round(0.5 * VALUE_RANGES.y.max);
      const packet = createTestPacket({ status: STATUS_BYTES.hover, x: 0, y });
      
      // Verify little-endian encoding
      const reconstructedY = packet[3] | (packet[4] << 8);
      expect(reconstructedY).toBe(y);
    });

    it('should correctly parse pressure from packet', () => {
      const pressure = Math.round(0.75 * VALUE_RANGES.pressure.max);
      const packet = createTestPacket({ 
        status: STATUS_BYTES.contact, 
        x: 8000, 
        y: 4500, 
        pressure 
      });
      
      // Verify little-endian encoding
      const reconstructedPressure = packet[5] | (packet[6] << 8);
      expect(reconstructedPressure).toBe(pressure);
    });
  });

  // ==========================================================================
  // Full Walkthrough Integration Test
  // ==========================================================================

  describe('Full Walkthrough', () => {
    it('should complete all steps and generate valid config', () => {
      engine.start();

      // Step 1: Horizontal
      runStep(collectPackets(generator.generateLineConstantPressure(0, 0.5, 1, 0.5, 0.5, 1500)));
      engine.nextStep();

      // Step 2: Vertical
      runStep(collectPackets(generator.generateLineConstantPressure(0.5, 0, 0.5, 1, 0.5, 1500)));
      engine.nextStep();

      // Step 3: Pressure
      runStep(collectPackets(generator.generateLine(0.5, 0.5, 0.5, 0.5, 1500)));
      engine.nextStep();

      // Step 4: Hover
      runStep(collectPackets(generator.generateHoverLine(0, 0, 1, 1, 1500)));
      engine.nextStep();

      // Step 5: Tilt X
      runStep(collectPackets(generator.generateTiltXLine(0.5, 0.5, 0.5, 0.5, 1500)));
      engine.nextStep();

      // Step 6: Tilt Y
      runStep(collectPackets(generator.generateTiltYLine(0.5, 0.5, 0.5, 0.5, 1500)));
      engine.nextStep();

      // Step 7: Primary Button
      runStep(collectPackets(generator.generatePrimaryButtonLine(0, 0.5, 1, 0.5, 1500)));
      engine.nextStep();

      // Step 8: Secondary Button
      runStep(collectPackets(generator.generateSecondaryButtonLine(0, 0.5, 1, 0.5, 1500)));
      engine.nextStep();

      // Skip button detection for now (step 9)
      engine.nextStep();

      // Verify we're at metadata step
      expect(engine.getState().currentStep).toBe('step10-metadata');

      // Submit metadata
      engine.submitMetadata({
        name: DEVICE_INFO.name,
        manufacturer: DEVICE_INFO.manufacturer,
        model: DEVICE_INFO.model,
        description: 'Test description',
        buttonCount: CAPABILITIES.buttonCount,
      });

      // Verify completion
      expect(engine.getState().currentStep).toBe('complete');

      // Verify generated config
      const config = engine.getByteCodeMappings();
      expect(config).toBeDefined();

      // Verify byte indices match expected
      expect(config!.x.byteIndex).toEqual(BYTE_LAYOUT.x.byteIndex);
      expect(config!.y.byteIndex).toEqual(BYTE_LAYOUT.y.byteIndex);
      expect(config!.pressure.byteIndex).toEqual(BYTE_LAYOUT.pressure.byteIndex);
      expect(config!.tiltX?.byteIndex).toEqual(BYTE_LAYOUT.tiltX.byteIndex);
      expect(config!.tiltY?.byteIndex).toEqual(BYTE_LAYOUT.tiltY.byteIndex);
      expect(config!.status?.byteIndex).toEqual(BYTE_LAYOUT.status.byteIndex);

      // Verify types
      expect(config!.x.type).toBe('multi-byte-range');
      expect(config!.y.type).toBe('multi-byte-range');
      expect(config!.pressure.type).toBe('multi-byte-range');
      expect(config!.tiltX?.type).toBe('bipolar-range');
      expect(config!.tiltY?.type).toBe('bipolar-range');
      expect(config!.status?.type).toBe('code');
    });
  });

  // ==========================================================================
  // Capabilities Inference Tests
  // ==========================================================================

  describe('Capabilities Inference', () => {
    it('should have correct resolution values', () => {
      expect(VALUE_RANGES.x.max).toBe(CAPABILITIES.resolution.x);
      expect(VALUE_RANGES.y.max).toBe(CAPABILITIES.resolution.y);
    });

    it('should have correct pressure levels', () => {
      // Pressure max is 16383, so levels = 16384 (0 to 16383)
      expect(VALUE_RANGES.pressure.max + 1).toBe(CAPABILITIES.pressureLevels);
    });

    it('should have correct button count', () => {
      const buttonKeys = Object.keys(EXPRESS_KEY_MAPPINGS);
      expect(buttonKeys.length).toBe(CAPABILITIES.buttonCount);
    });
  });
});

