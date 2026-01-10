import { describe, it, expect } from 'vitest';
import { analyzeBytes, getBestGuessBytesByVariance, generateDeviceConfig } from '../../src/utils/byte-detector.js';
import { inferCapabilities } from '../../src/utils/metadata-generator.js';
import { TabletDataGenerator } from '../../src/mockbytes/tablet-data-generator.js';

describe('Walkthrough Byte Detection', () => {
  const generator = new TabletDataGenerator({
    width: 16000,
    height: 9000,
    maxPressure: 16383,
    sampleRate: 200,
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

  describe('Step 1: Horizontal Movement (X Coordinate)', () => {
    it('should detect X coordinate at bytes 2-3 (indices 1-2)', () => {
      // Generate horizontal drag with constant pressure
      const packets = collectPackets(
        generator.generateLineConstantPressure(0, 0.5, 1, 0.5, 0.5, 1500)
      );

      // Analyze bytes
      const analysis = analyzeBytes(packets);
      const detectedBytes = getBestGuessBytesByVariance(analysis, 2);

      // Verify X coordinate bytes (0-based indices 1, 2)
      expect(detectedBytes.map(b => b.byteIndex)).toEqual([1, 2]);
    });
  });

  describe('Step 2: Vertical Movement (Y Coordinate)', () => {
    it('should detect Y coordinate at bytes 4-5 (indices 3-4)', () => {
      // Generate vertical drag with constant pressure
      const packets = collectPackets(
        generator.generateLineConstantPressure(0.5, 0, 0.5, 1, 0.5, 1500)
      );

      // Analyze bytes
      const analysis = analyzeBytes(packets);

      // Filter out X coordinate bytes (indices 1, 2)
      const knownByteIndices = new Set([1, 2]);
      const filteredAnalysis = analysis.filter(b => !knownByteIndices.has(b.byteIndex));

      const detectedBytes = getBestGuessBytesByVariance(filteredAnalysis, 2);

      // Verify Y coordinate bytes (0-based indices 3, 4)
      expect(detectedBytes.map(b => b.byteIndex)).toEqual([3, 4]);
    });
  });

  describe('Step 3: Pressure Detection', () => {
    it('should detect pressure at bytes 6-7 (indices 5-6)', () => {
      // Generate pressure variation at a fixed point
      const packets = collectPackets(
        generator.generateLine(0.5, 0.5, 0.5, 0.5, 1500)
      );

      // Analyze bytes
      const analysis = analyzeBytes(packets);

      // Filter out X and Y coordinate bytes (indices 1, 2, 3, 4)
      const knownByteIndices = new Set([1, 2, 3, 4]);
      const filteredAnalysis = analysis.filter(b => !knownByteIndices.has(b.byteIndex));

      const detectedBytes = getBestGuessBytesByVariance(filteredAnalysis, 2);

      // Verify pressure bytes (0-based indices 5, 6)
      expect(detectedBytes.map(b => b.byteIndex)).toEqual([5, 6]);
    });
  });

  describe('Step 4: Hover Movement (X and Y Coordinate Confirmation)', () => {
    it('should detect both X and Y coordinates from freeform hover movement', () => {
      // Generate hover movement with both horizontal and vertical components
      // Combine horizontal and vertical hover to simulate freeform movement
      const horizontalPackets = collectPackets(
        generator.generateHoverLine(0, 0.5, 1, 0.5, 1500),
        150
      );
      const verticalPackets = collectPackets(
        generator.generateHoverLine(0.5, 0, 0.5, 1, 1500),
        150
      );
      const packets = [...horizontalPackets, ...verticalPackets];

      // Analyze bytes
      const analysis = analyzeBytes(packets);
      const filteredAnalysis = analysis.filter(b => b.byteIndex !== 0); // Exclude status byte

      // Get top 4 bytes (2 pairs for X and Y) - this simulates what the UI does
      let coordinateBytes = getBestGuessBytesByVariance(filteredAnalysis, 4);

      // If we only got 2 bytes (first pair), that's expected behavior from getBestGuessBytesByVariance
      // In the actual walkthrough, we'd get X from the first call, then filter and get Y
      // Let's simulate that process:
      if (coordinateBytes.length === 2) {
        // First pair is X coordinates
        const xBytes = coordinateBytes;
        expect(xBytes.map(b => b.byteIndex)).toEqual([1, 2]);

        // Now filter out X bytes and get Y
        const knownByteIndices = new Set(xBytes.map(b => b.byteIndex));
        const filteredForY = filteredAnalysis.filter(b => !knownByteIndices.has(b.byteIndex));
        const yBytes = getBestGuessBytesByVariance(filteredForY, 2);

        // Verify Y coordinate bytes (0-based indices 3, 4)
        expect(yBytes.map(b => b.byteIndex)).toEqual([3, 4]);
      } else {
        // If we got 4 bytes, verify them all
        coordinateBytes.sort((a, b) => a.byteIndex - b.byteIndex);
        expect(coordinateBytes.map(b => b.byteIndex)).toEqual([1, 2, 3, 4]);
      }
    });
  });

  describe('Step 5: Tilt X Detection', () => {
    it('should detect tilt X at byte 8 (index 7)', () => {
      // Generate tilt X variation
      const packets = collectPackets(
        generator.generateTiltXLine(0.5, 0.5, 0.5, 0.5, 1500)
      );

      // Analyze bytes
      const analysis = analyzeBytes(packets);

      // Filter out X, Y, and pressure bytes (indices 1, 2, 3, 4, 5, 6)
      const knownByteIndices = new Set([1, 2, 3, 4, 5, 6]);
      const filteredAnalysis = analysis.filter(b => !knownByteIndices.has(b.byteIndex));

      const detectedBytes = getBestGuessBytesByVariance(filteredAnalysis, 1);

      // Verify tilt X byte (0-based index 7)
      expect(detectedBytes.map(b => b.byteIndex)).toEqual([7]);
    });
  });

  describe('Step 6: Tilt Y Detection', () => {
    it('should detect tilt Y at byte 9 (index 8)', () => {
      // Generate tilt Y variation
      const packets = collectPackets(
        generator.generateTiltYLine(0.5, 0.5, 0.5, 0.5, 1500)
      );

      // Analyze bytes
      const analysis = analyzeBytes(packets);

      // Filter out X, Y, pressure, and tilt X bytes (indices 1, 2, 3, 4, 5, 6, 7)
      const knownByteIndices = new Set([1, 2, 3, 4, 5, 6, 7]);
      const filteredAnalysis = analysis.filter(b => !knownByteIndices.has(b.byteIndex));

      const detectedBytes = getBestGuessBytesByVariance(filteredAnalysis, 1);

      // Verify tilt Y byte (0-based index 8)
      expect(detectedBytes.map(b => b.byteIndex)).toEqual([8]);
    });
  });

  describe('Step 7 & 8: Button Detection', () => {
    it('should detect status byte changes for button presses', () => {
      // Generate normal contact packets
      const normalPackets = collectPackets(
        generator.generateLine(0.5, 0.5, 0.5, 0.5, 500)
      );

      // Generate packets with primary button pressed
      const primaryButtonPackets = collectPackets(
        generator.generatePrimaryButtonLine(0.5, 0.5, 0.5, 0.5, 500)
      );

      // Generate packets with secondary button pressed
      const secondaryButtonPackets = collectPackets(
        generator.generateSecondaryButtonLine(0.5, 0.5, 0.5, 0.5, 500)
      );

      // Status byte should be at index 0
      const normalStatus = normalPackets[0][0];
      const primaryStatus = primaryButtonPackets[0][0];
      const secondaryStatus = secondaryButtonPackets[0][0];

      // Verify status byte changes with button presses
      expect(primaryStatus).not.toBe(normalStatus);
      expect(secondaryStatus).not.toBe(normalStatus);
      expect(primaryStatus).not.toBe(secondaryStatus);
    });
  });

  describe('Final: Complete Configuration Generation', () => {
    it('should generate configuration matching XP-Pen Deco 640 structure', () => {
      // Simulate all walkthrough steps to collect data
      // Use higher maxPackets to ensure we capture the pen away packets at the end
      const horizontalPackets = collectPackets(
        generator.generateLineConstantPressure(0, 0.5, 1, 0.5, 0.5, 1500),
        350
      );
      const verticalPackets = collectPackets(
        generator.generateLineConstantPressure(0.5, 0, 0.5, 1, 0.5, 1500),
        350
      );
      const pressurePackets = collectPackets(
        generator.generateLine(0.5, 0.5, 0.5, 0.5, 1500),
        350
      );
      const hoverHorizontalPackets = collectPackets(
        generator.generateHoverLine(0, 0.5, 1, 0.5, 1500),
        350
      );
      const hoverVerticalPackets = collectPackets(
        generator.generateHoverLine(0.5, 0, 0.5, 1, 1500),
        350
      );
      const tiltXPackets = collectPackets(
        generator.generateTiltXLine(0.5, 0.5, 0.5, 0.5, 1500),
        350
      );
      const tiltYPackets = collectPackets(
        generator.generateTiltYLine(0.5, 0.5, 0.5, 0.5, 1500),
        350
      );
      const primaryButtonPackets = collectPackets(
        generator.generatePrimaryButtonLine(0, 0.5, 1, 0.5, 1500),
        350
      );
      const secondaryButtonPackets = collectPackets(
        generator.generateSecondaryButtonLine(0, 0.5, 1, 0.5, 1500),
        350
      );

      // Detect bytes for each step (excluding status byte 0)
      const horizontalAnalysis = analyzeBytes(horizontalPackets);
      const filteredHorizontal = horizontalAnalysis.filter(b => b.byteIndex !== 0);
      const horizontalBytes = getBestGuessBytesByVariance(filteredHorizontal, 2);

      const verticalAnalysis = analyzeBytes(verticalPackets);
      const filteredVertical = verticalAnalysis.filter(b => ![0, 1, 2].includes(b.byteIndex));
      const verticalBytes = getBestGuessBytesByVariance(filteredVertical, 2);

      const pressureAnalysis = analyzeBytes(pressurePackets);
      const filteredPressure = pressureAnalysis.filter(b => ![0, 1, 2, 3, 4].includes(b.byteIndex));
      const pressureBytes = getBestGuessBytesByVariance(filteredPressure, 2);

      const tiltXAnalysis = analyzeBytes(tiltXPackets);
      const filteredTiltX = tiltXAnalysis.filter(b => ![0, 1, 2, 3, 4, 5, 6].includes(b.byteIndex));
      const tiltXBytes = getBestGuessBytesByVariance(filteredTiltX, 1);

      const tiltYAnalysis = analyzeBytes(tiltYPackets);
      const filteredTiltY = tiltYAnalysis.filter(b => ![0, 1, 2, 3, 4, 5, 6, 7].includes(b.byteIndex));
      const tiltYBytes = getBestGuessBytesByVariance(filteredTiltY, 1);

      // Collect all packets
      const allPackets = [
        ...horizontalPackets,
        ...verticalPackets,
        ...pressurePackets,
        ...hoverHorizontalPackets,
        ...hoverVerticalPackets,
        ...tiltXPackets,
        ...tiltYPackets,
        ...primaryButtonPackets,
        ...secondaryButtonPackets,
      ];

      // Track status byte values from all packets
      const statusByteValues = new Map();
      const statusByteIndex = 0;

      allPackets.forEach(packet => {
        const statusByte = packet[statusByteIndex];

        // Skip if already tracked
        if (statusByteValues.has(statusByte)) return;

        // Check if this is a "pen away" packet (all zeros except status byte)
        const allZeros = packet.slice(1).every(b => b === 0);

        if (allZeros) {
          // Pen away state (status byte 192/0xc0)
          statusByteValues.set(statusByte, { state: 'none' });
        } else if (statusByte === 0xa0) {
          // 160: hover
          statusByteValues.set(statusByte, { state: 'hover' });
        } else if (statusByte === 0xa1) {
          // 161: contact
          statusByteValues.set(statusByte, { state: 'contact' });
        } else if (statusByte === 0xa2) {
          // 162: hover + secondary button
          statusByteValues.set(statusByte, { state: 'hover', secondaryButtonPressed: true });
        } else if (statusByte === 0xa3) {
          // 163: contact + secondary button
          statusByteValues.set(statusByte, { state: 'contact', secondaryButtonPressed: true });
        } else if (statusByte === 0xa4) {
          // 164: hover + primary button
          statusByteValues.set(statusByte, { state: 'hover', primaryButtonPressed: true });
        } else if (statusByte === 0xa5) {
          // 165: contact + primary button
          statusByteValues.set(statusByte, { state: 'contact', primaryButtonPressed: true });
        }
      });

      // Generate configuration
      const generatedConfig = generateDeviceConfig(
        horizontalBytes,
        verticalBytes,
        pressureBytes,
        tiltXBytes,
        tiltYBytes,
        statusByteValues,
        allPackets
      );

      // Verify configuration matches expected structure (0-based indexing)
      expect(generatedConfig.x.byteIndex).toEqual([1, 2]);
      expect(generatedConfig.y.byteIndex).toEqual([3, 4]);
      expect(generatedConfig.pressure.byteIndex).toEqual([5, 6]);
      expect(generatedConfig.tiltX.byteIndex).toEqual([7]);
      expect(generatedConfig.tiltY.byteIndex).toEqual([8]);

      // Verify types
      expect(generatedConfig.x.type).toBe('multi-byte-range');
      expect(generatedConfig.y.type).toBe('multi-byte-range');
      expect(generatedConfig.pressure.type).toBe('multi-byte-range');
      expect(generatedConfig.tiltX.type).toBe('bipolar-range');
      expect(generatedConfig.tiltY.type).toBe('bipolar-range');

      // Verify status block
      expect(generatedConfig.status).toBeDefined();
      expect(generatedConfig.status!.byteIndex).toEqual([0]);
      expect(generatedConfig.status!.type).toBe('code');
      expect(generatedConfig.status!.values).toBeDefined();

      // Verify all 7 status codes are present
      const statusValues = generatedConfig.status!.values;
      expect(Object.keys(statusValues)).toHaveLength(7);

      // Verify each status code
      expect(statusValues['192']).toEqual({ state: 'none' });
      expect(statusValues['160']).toEqual({ state: 'hover' });
      expect(statusValues['161']).toEqual({ state: 'contact' });
      expect(statusValues['162']).toEqual({ state: 'hover', secondaryButtonPressed: true });
      expect(statusValues['163']).toEqual({ state: 'contact', secondaryButtonPressed: true });
      expect(statusValues['164']).toEqual({ state: 'hover', primaryButtonPressed: true });
      expect(statusValues['165']).toEqual({ state: 'contact', primaryButtonPressed: true });
    });

    it('should infer device capabilities from detected byte mappings', () => {
      // Simulate all walkthrough steps to collect data
      const horizontalPackets = collectPackets(
        generator.generateLineConstantPressure(0, 0.5, 1, 0.5, 0.5, 1500),
        350
      );
      const verticalPackets = collectPackets(
        generator.generateLineConstantPressure(0.5, 0, 0.5, 1, 0.5, 1500),
        350
      );
      const pressurePackets = collectPackets(
        generator.generateLine(0.5, 0.5, 0.5, 0.5, 1500),
        350
      );
      const hoverHorizontalPackets = collectPackets(
        generator.generateHoverLine(0, 0.5, 1, 0.5, 1500),
        350
      );
      const hoverVerticalPackets = collectPackets(
        generator.generateHoverLine(0.5, 0, 0.5, 1, 1500),
        350
      );
      const tiltXPackets = collectPackets(
        generator.generateTiltXLine(0.5, 0.5, 0.5, 0.5, 1500),
        350
      );
      const tiltYPackets = collectPackets(
        generator.generateTiltYLine(0.5, 0.5, 0.5, 0.5, 1500),
        350
      );
      const primaryButtonPackets = collectPackets(
        generator.generatePrimaryButtonLine(0, 0.5, 1, 0.5, 1500),
        350
      );
      const secondaryButtonPackets = collectPackets(
        generator.generateSecondaryButtonLine(0, 0.5, 1, 0.5, 1500),
        350
      );

      // Detect bytes for each step
      const horizontalAnalysis = analyzeBytes(horizontalPackets);
      const filteredHorizontal = horizontalAnalysis.filter(b => b.byteIndex !== 0);
      const horizontalBytes = getBestGuessBytesByVariance(filteredHorizontal, 2);

      const verticalAnalysis = analyzeBytes(verticalPackets);
      const filteredVertical = verticalAnalysis.filter(b => ![0, 1, 2].includes(b.byteIndex));
      const verticalBytes = getBestGuessBytesByVariance(filteredVertical, 2);

      const pressureAnalysis = analyzeBytes(pressurePackets);
      const filteredPressure = pressureAnalysis.filter(b => ![0, 1, 2, 3, 4].includes(b.byteIndex));
      const pressureBytes = getBestGuessBytesByVariance(filteredPressure, 2);

      const tiltXAnalysis = analyzeBytes(tiltXPackets);
      const filteredTiltX = tiltXAnalysis.filter(b => ![0, 1, 2, 3, 4, 5, 6].includes(b.byteIndex));
      const tiltXBytes = getBestGuessBytesByVariance(filteredTiltX, 1);

      const tiltYAnalysis = analyzeBytes(tiltYPackets);
      const filteredTiltY = tiltYAnalysis.filter(b => ![0, 1, 2, 3, 4, 5, 6, 7].includes(b.byteIndex));
      const tiltYBytes = getBestGuessBytesByVariance(filteredTiltY, 1);

      // Collect all packets
      const allPackets = [
        ...horizontalPackets,
        ...verticalPackets,
        ...pressurePackets,
        ...hoverHorizontalPackets,
        ...hoverVerticalPackets,
        ...tiltXPackets,
        ...tiltYPackets,
        ...primaryButtonPackets,
        ...secondaryButtonPackets,
      ];

      // Track status byte values
      const statusByteValues = new Map();
      const statusByteIndex = 0;

      allPackets.forEach(packet => {
        const statusByte = packet[statusByteIndex];
        if (statusByteValues.has(statusByte)) return;

        const allZeros = packet.slice(1).every(b => b === 0);
        if (allZeros) {
          statusByteValues.set(statusByte, { state: 'none' });
        } else if (statusByte === 0xa0) {
          statusByteValues.set(statusByte, { state: 'hover' });
        } else if (statusByte === 0xa1) {
          statusByteValues.set(statusByte, { state: 'contact' });
        } else if (statusByte === 0xa2) {
          statusByteValues.set(statusByte, { state: 'hover', secondaryButtonPressed: true });
        } else if (statusByte === 0xa3) {
          statusByteValues.set(statusByte, { state: 'contact', secondaryButtonPressed: true });
        } else if (statusByte === 0xa4) {
          statusByteValues.set(statusByte, { state: 'hover', primaryButtonPressed: true });
        } else if (statusByte === 0xa5) {
          statusByteValues.set(statusByte, { state: 'contact', primaryButtonPressed: true });
        }
      });

      // Generate configuration
      const generatedConfig = generateDeviceConfig(
        horizontalBytes,
        verticalBytes,
        pressureBytes,
        tiltXBytes,
        tiltYBytes,
        statusByteValues,
        allPackets
      );

      // Infer capabilities from the generated config
      const capabilities = inferCapabilities(generatedConfig);

      // Verify auto-detected capabilities
      expect(capabilities.hasPressure).toBe(true);
      expect(capabilities.hasTilt).toBe(true);

      // Pressure levels should be a power of 2 based on the detected max
      expect(capabilities.pressureLevels).toBeGreaterThan(0);
      expect(Math.log2(capabilities.pressureLevels) % 1).toBe(0); // Should be a power of 2

      // Resolution should match the detected max values
      expect(capabilities.resolution.x).toBeGreaterThan(0);
      expect(capabilities.resolution.y).toBeGreaterThan(0);

      // These are user-provided, so they should be defaults
      expect(capabilities.hasButtons).toBe(false);
      expect(capabilities.buttonCount).toBe(0);
    });
  });
});


