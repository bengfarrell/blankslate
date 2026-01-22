/**
 * Byte Detection Utilities
 * 
 * This module contains the core logic for analyzing HID packets and identifying
 * which bytes represent coordinates, pressure, tilt, and other tablet data.
 */

export interface ByteAnalysis {
  byteIndex: number;
  min: number;
  max: number;
  variance: number;
}

export interface CoordinateConfig {
  byteIndex: number[];
  max: number;
  type: 'multi-byte-range';
}

export interface TiltConfig {
  byteIndex: number[];
  positiveMax: number;
  negativeMin: number;
  negativeMax: number;
  type: 'bipolar-range';
}

export interface StatusValue {
  state: string;
  primaryButtonPressed?: boolean;
  secondaryButtonPressed?: boolean;
}

export interface StatusConfig {
  byteIndex: number[];
  type: 'code';
  values: Record<string, StatusValue>;
}

export interface TabletButtonsConfig {
  byteIndex: number[];
  buttonCount: number;
  type: 'bit-flags' | 'code' | 'keyboard-events';
  values?: Record<string, { button: number }>;
  keyMappings?: Record<string, {
    key: string;
    code: string;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
  }>;
}

/**
 * Button mapping from interactive detection
 */
export interface ButtonMapping {
  buttonNumber: number;
  statusByte?: number;
  scanCode?: number;
  // Keyboard event properties (when driver is active)
  key?: string;
  code?: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}

export interface DeviceByteCodeMappings {
  status?: StatusConfig;
  x: CoordinateConfig;
  y: CoordinateConfig;
  pressure: CoordinateConfig;
  tiltX?: TiltConfig;
  tiltY?: TiltConfig;
  tabletButtons?: TabletButtonsConfig;
}

/**
 * Analyzes captured HID packets and calculates statistics for each byte position.
 * Returns min, max, and variance for each byte across all packets.
 */
export function analyzeBytes(packets: Uint8Array[]): ByteAnalysis[] {
  if (packets.length === 0) {
    return [];
  }

  const analysis: ByteAnalysis[] = [];
  const packetLength = packets[0].length;

  for (let byteIndex = 0; byteIndex < packetLength; byteIndex++) {
    let min = 255;
    let max = 0;

    for (const packet of packets) {
      const value = packet[byteIndex];
      if (value < min) min = value;
      if (value > max) max = value;
    }

    const variance = max - min;

    analysis.push({
      byteIndex,
      min,
      max,
      variance,
    });
  }

  return analysis;
}

/**
 * Identifies the most significant bytes based on variance.
 * 
 * Strategy:
 * - If maxBytes === 1: Looking for a single byte (like tilt) - returns highest variance byte
 * - Otherwise: Prioritizes consecutive byte pairs (multi-byte values like coordinates)
 * 
 * @param analysis - Byte analysis results from analyzeBytes()
 * @param maxBytes - Maximum number of bytes to return (1 for single-byte, 2+ for multi-byte)
 * @param minVariance - Minimum variance threshold to filter out noise (default: 50)
 */
export function getBestGuessBytesByVariance(
  analysis: ByteAnalysis[],
  maxBytes = 3,
  minVariance = 50
): ByteAnalysis[] {
  const significantBytes = analysis
      .filter(byte => byte.variance > minVariance)
      .sort((a, b) => b.variance - a.variance);

  const result: ByteAnalysis[] = [];
  const used = new Set<number>();

  // For single-byte detection (tilt), skip the pair logic and just return the top byte
  if (maxBytes === 1) {
    if (significantBytes.length > 0) {
      return [significantBytes[0]];
    }
    return [];
  }

  // First pass: Find consecutive byte pairs where at least ONE has high variance
  // This identifies multi-byte values (X, Y, pressure) which use 2 bytes each
  // For 16-bit values, the high byte may have low variance if the value doesn't exceed 255
  for (let i = 0; i < analysis.length - 1; i++) {
    const byte = analysis[i];
    const nextByte = analysis[i + 1];

    if (used.has(byte.byteIndex) || used.has(nextByte.byteIndex)) continue;

    // Check if they're consecutive and at least one has high variance
    // The other byte should have at least SOME variance (> 0) to be part of the value
    if (
        nextByte.byteIndex === byte.byteIndex + 1 &&
        (byte.variance > minVariance || nextByte.variance > minVariance) &&
        byte.variance > 0 &&
        nextByte.variance > 0
    ) {
      // Consecutive bytes with variance - likely a multi-byte value
      result.push(byte);
      result.push(nextByte);
      used.add(byte.byteIndex);
      used.add(nextByte.byteIndex);

      // For coordinate detection, we typically want just 1 pair (2 bytes)
      // This prevents detecting tilt bytes (8, 9) when looking for X (2, 3)
      if (result.length >= 2) break;
    }
  }

  // Second pass: If we didn't find consecutive pairs, add single high-variance bytes
  // This handles single-byte values like tilt
  if (result.length === 0) {
    for (const byte of significantBytes) {
      if (used.has(byte.byteIndex)) continue;

      result.push(byte);
      used.add(byte.byteIndex);

      if (result.length >= maxBytes) break;
    }
  }

  return result.sort((a, b) => a.byteIndex - b.byteIndex);
}

/**
 * Groups consecutive byte indices together.
 * Used for multi-byte values like coordinates (e.g., [2, 3] for X coordinate).
 */
export function groupConsecutiveBytes(bytes: ByteAnalysis[]): number[] {
  if (bytes.length === 0) return [];

  const indices = bytes.map(b => b.byteIndex).sort((a, b) => a - b);
  return indices;
}

/**
 * Calculates the maximum value from multi-byte data by combining bytes (little-endian).
 * For multi-byte values, iterates through all packets and finds the highest combined value.
 * 
 * @param byteIndices - Array of byte indices that form the multi-byte value (e.g., [2, 3] for X)
 * @param packets - Raw HID packets to analyze
 * @param debug - If true, logs debug information about the calculation
 * @returns The maximum combined value observed across all packets
 */
export function calculateMultiByteMax(byteIndices: number[], packets: Uint8Array[], debug = false): number {
  if (byteIndices.length === 0 || packets.length === 0) return 0;

  let maxCombinedValue = 0;
  let maxPacket: Uint8Array | null = null;
  let validPacketCount = 0;

  // Iterate through all packets and combine bytes to find the true max
  for (const packet of packets) {
    let combinedValue = 0;
    let validPacket = true;

    // Combine bytes in little-endian order (first byte is low, second is high)
    for (let i = 0; i < byteIndices.length; i++) {
      const byteIndex = byteIndices[i];
      if (byteIndex >= packet.length) {
        validPacket = false;
        break;
      }
      combinedValue += packet[byteIndex] << (i * 8);
    }

    if (validPacket) {
      validPacketCount++;
      if (combinedValue > maxCombinedValue) {
        maxCombinedValue = combinedValue;
        maxPacket = packet;
      }
    }
  }

  if (debug && maxPacket) {
    const bytesStr = byteIndices.map(idx => 
      `[${idx}]=0x${maxPacket![idx].toString(16).padStart(2, '0')}`
    ).join(', ');
    console.log(`  calculateMultiByteMax: indices=[${byteIndices}], max=${maxCombinedValue}, from ${validPacketCount} packets`);
    console.log(`    Max packet bytes: ${bytesStr}`);
    console.log(`    Full packet: ${Array.from(maxPacket).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
  }

  // Return observed max, or sensible defaults
  if (maxCombinedValue > 0) {
    return maxCombinedValue;
  }

  // Fallback defaults based on byte count
  if (byteIndices.length === 2) {
    return 65535; // 16-bit max
  }
  return 255; // 8-bit max
}

/**
 * Calculates the bipolar range values from tilt data.
 * Tilt values are typically encoded as:
 * - 0 = no tilt
 * - 1 to positiveMax = positive tilt (e.g., 1-60)
 * - negativeMin to 255 = negative tilt (e.g., 196-255, where 196 = 256-60)
 * 
 * @param byteIndex - The byte index for the tilt value
 * @param packets - Raw HID packets to analyze
 * @returns Object with positiveMax, negativeMin, negativeMax
 */
export function calculateBipolarRange(
  byteIndex: number,
  packets: Uint8Array[]
): { positiveMax: number; negativeMin: number; negativeMax: number } {
  if (packets.length === 0) {
    // Default to full signed byte range
    return { positiveMax: 127, negativeMin: 128, negativeMax: 255 };
  }

  // Collect all values seen at this byte position
  const values = new Set<number>();
  for (const packet of packets) {
    if (byteIndex < packet.length) {
      values.add(packet[byteIndex]);
    }
  }

  if (values.size === 0) {
    return { positiveMax: 127, negativeMin: 128, negativeMax: 255 };
  }

  // Separate positive (0-127) and negative (128-255) values
  // In unsigned byte representation: 128-255 represents negative values
  let positiveMax = 0;
  let negativeMin = 255;
  let negativeMax = 128;
  let hasPositive = false;
  let hasNegative = false;

  for (const value of values) {
    if (value === 0) {
      // 0 is neutral, don't count as positive range
      continue;
    }
    
    if (value < 128) {
      // Positive range
      hasPositive = true;
      if (value > positiveMax) {
        positiveMax = value;
      }
    } else {
      // Negative range (128-255)
      hasNegative = true;
      if (value < negativeMin) {
        negativeMin = value;
      }
      if (value > negativeMax) {
        negativeMax = value;
      }
    }
  }

  // If we didn't see any positive values, use a sensible default
  if (!hasPositive) {
    positiveMax = 127;
  }

  // If we didn't see any negative values, use defaults
  if (!hasNegative) {
    negativeMin = 128;
    negativeMax = 255;
  }

  return { positiveMax, negativeMin, negativeMax };
}

/**
 * Finds the status byte in the HID packet.
 * Status bytes typically have low variance but multiple distinct values.
 */
export function findStatusByte(
  packets: Uint8Array[],
  excludeIndices: Set<number>
): number | null {
  if (packets.length === 0) return null;

  const analysis = analyzeBytes(packets);

  for (const byte of analysis) {
    // Skip already-identified bytes
    if (excludeIndices.has(byte.byteIndex)) continue;

    // Status byte characteristics:
    // - Has variance (not constant)
    // - Multiple distinct values (discrete codes, not continuous ranges)
    // - Typically 2-10 different states
    // Don't filter by variance amount - status byte can have moderate variance
    if (byte.variance > 0) {
      // Count distinct values
      const distinctValues = new Set<number>();
      for (const packet of packets) {
        distinctValues.add(packet[byte.byteIndex]);
      }

      // Status byte should have 2-10 distinct values
      if (distinctValues.size >= 2 && distinctValues.size <= 10) {
        return byte.byteIndex;
      }
    }
  }

  return null;
}

/**
 * Generates the final device configuration from detected bytes.
 * Config byte indices represent the physical packet structure with report ID at byte 0.
 * 
 * @param tiltXPackets - Optional: packets captured during tilt X gesture (for accurate range detection)
 * @param tiltYPackets - Optional: packets captured during tilt Y gesture (for accurate range detection)
 * @param buttonMappings - Optional: interactive button mappings from per-button detection
 * @param packetIncludesReportId - Whether captured packets include report ID at byte 0 (default: true)
 *                                  For WebHID (browser), set to false since browser strips report ID
 *                                  For Node.js/Python, set to true since full packet is captured
 */
export function generateDeviceConfig(
  horizontalBytes: ByteAnalysis[],
  verticalBytes: ByteAnalysis[],
  pressureBytes: ByteAnalysis[],
  tiltXBytes: ByteAnalysis[],
  tiltYBytes: ByteAnalysis[],
  statusByteValues: Map<number, StatusValue>,
  allPackets: Uint8Array[],
  tabletButtonBytes: ByteAnalysis[] = [],
  tiltXPackets: Uint8Array[] = [],
  tiltYPackets: Uint8Array[] = [],
  buttonMappings: ButtonMapping[] = [],
  packetIncludesReportId: boolean = true
): DeviceByteCodeMappings {
  // WebHID offset: when packets don't include report ID, detected indices are 1 less
  // than physical truth, so we add 1 to convert to config indices
  const indexOffset = packetIncludesReportId ? 0 : 1;
  
  // Keep ORIGINAL indices for max calculation (these match the raw packet structure)
  const xOriginalIndices = groupConsecutiveBytes(horizontalBytes);
  const yOriginalIndices = groupConsecutiveBytes(verticalBytes);
  const pressureOriginalIndices = groupConsecutiveBytes(pressureBytes);

  // Calculate max values using ORIGINAL indices (raw packet structure)
  // Enable debug logging to help diagnose any calibration issues
  const debug = typeof globalThis !== 'undefined' &&
    typeof (globalThis as any).process !== 'undefined' &&
    (globalThis as any).process?.env?.DEBUG_WALKTHROUGH === '1';
  if (debug) {
    console.log('\n[DEBUG] Calculating max values from', allPackets.length, 'packets:');
    console.log(`  packetIncludesReportId: ${packetIncludesReportId}, indexOffset: ${indexOffset}`);
  }
  const xMax = calculateMultiByteMax(xOriginalIndices, allPackets, debug);
  const yMax = calculateMultiByteMax(yOriginalIndices, allPackets, debug);
  const pressureMax = calculateMultiByteMax(pressureOriginalIndices, allPackets, debug);
  
  // Apply offset for CONFIG indices (these go into the final config file)
  const xBytes = xOriginalIndices.map(i => i + indexOffset);
  const yBytes = yOriginalIndices.map(i => i + indexOffset);
  const pressureByteIndices = pressureOriginalIndices.map(i => i + indexOffset);

  // Add button status values FIRST (before building status config)
  // This ensures keyboard/button states are included in the status mapping
  if (buttonMappings.length > 0) {
    const buttonStatusBytes = new Set(
      buttonMappings
        .map(m => m.statusByte)
        .filter((sb): sb is number => sb !== undefined)
    );
    for (const statusByte of buttonStatusBytes) {
      if (!statusByteValues.has(statusByte)) {
        if (statusByte === 0) {
          statusByteValues.set(0, { state: 'keyboard' });
        } else if (statusByte >= 1 && statusByte <= 6) {
          // Status bytes 1, 3, 6 are button mode (no driver)
          statusByteValues.set(statusByte, { state: 'buttons' });
        } else if (statusByte === 240) {
          // Status byte 240 (0xF0) is button mode (with driver)
          statusByteValues.set(240, { state: 'buttons' });
        }
      }
    }
  }

  // Use 0-based indexing
  const config: DeviceByteCodeMappings = {
    x: {
      byteIndex: xBytes,
      max: xMax,
      type: 'multi-byte-range',
    },
    y: {
      byteIndex: yBytes,
      max: yMax,
      type: 'multi-byte-range',
    },
    pressure: {
      byteIndex: pressureByteIndices,
      max: pressureMax,
      type: 'multi-byte-range',
    },
  };

  // Add status byte mappings if detected
  if (statusByteValues.size > 0) {
    const excludeIndices = new Set([
      // Only exclude byte 0 (report ID) if packets include it
      // For WebHID, byte 0 IS the status byte, so don't exclude it
      ...(packetIncludesReportId ? [0] : []),
      // Exclude detected data bytes (using original indices before offset)
      ...horizontalBytes.map(b => b.byteIndex),
      ...verticalBytes.map(b => b.byteIndex),
      ...pressureBytes.map(b => b.byteIndex),
      ...tiltXBytes.map(b => b.byteIndex),
      ...tiltYBytes.map(b => b.byteIndex),
    ]);

    const detectedStatusIndex = findStatusByte(allPackets, excludeIndices);
    // Apply offset to status byte index
    const statusByteIndex = detectedStatusIndex !== null ? detectedStatusIndex + indexOffset : null;

    if (statusByteIndex !== null) {
      const values: Record<string, StatusValue> = {};
      statusByteValues.forEach((value, byteValue) => {
        values[byteValue.toString()] = value;
      });

      config.status = {
        byteIndex: [statusByteIndex], // Use 0-based indexing
        type: 'code',
        values,
      };
    }
  }

  // Add tilt X if detected - use actual captured packets to determine range
  if (tiltXBytes.length > 0) {
    const tiltXIndices = tiltXBytes.map(b => b.byteIndex + indexOffset);
    const packetsToUse = tiltXPackets.length > 0 ? tiltXPackets : allPackets;
    // Use original index for range calculation (matches packet structure)
    const tiltXRange = calculateBipolarRange(tiltXBytes[0].byteIndex, packetsToUse);
    
    if (debug) {
      console.log(`  Tilt X range: positiveMax=${tiltXRange.positiveMax}, negativeMin=${tiltXRange.negativeMin}, negativeMax=${tiltXRange.negativeMax}`);
    }
    
    config.tiltX = {
      byteIndex: tiltXIndices,
      positiveMax: tiltXRange.positiveMax,
      negativeMin: tiltXRange.negativeMin,
      negativeMax: tiltXRange.negativeMax,
      type: 'bipolar-range',
    };
  }

  // Add tilt Y if detected - use actual captured packets to determine range
  if (tiltYBytes.length > 0) {
    const tiltYIndices = tiltYBytes.map(b => b.byteIndex + indexOffset);
    const packetsToUse = tiltYPackets.length > 0 ? tiltYPackets : allPackets;
    // Use original index for range calculation (matches packet structure)
    const tiltYRange = calculateBipolarRange(tiltYBytes[0].byteIndex, packetsToUse);
    
    if (debug) {
      console.log(`  Tilt Y range: positiveMax=${tiltYRange.positiveMax}, negativeMin=${tiltYRange.negativeMin}, negativeMax=${tiltYRange.negativeMax}`);
    }
    
    config.tiltY = {
      byteIndex: tiltYIndices,
      positiveMax: tiltYRange.positiveMax,
      negativeMin: tiltYRange.negativeMin,
      negativeMax: tiltYRange.negativeMax,
      type: 'bipolar-range',
    };
  }

  // Add tablet buttons - prefer interactive mappings over auto-detected bytes
  if (buttonMappings.length > 0) {
    // Check if we have keyboard mappings or HID scan codes
    const hasKeyboardMappings = buttonMappings.some(m => m.key !== undefined);
    const hasHIDMappings = buttonMappings.some(m => m.scanCode !== undefined);

    if (hasKeyboardMappings) {
      // Keyboard event detection (driver active)
      const keyMappings: Record<string, {
        key: string;
        code: string;
        ctrlKey?: boolean;
        shiftKey?: boolean;
        altKey?: boolean;
        metaKey?: boolean;
      }> = {};

      for (const mapping of buttonMappings) {
        if (mapping.key && mapping.code) {
          keyMappings[String(mapping.buttonNumber)] = {
            key: mapping.key,
            code: mapping.code,
            ctrlKey: mapping.ctrlKey,
            shiftKey: mapping.shiftKey,
            altKey: mapping.altKey,
            metaKey: mapping.metaKey,
          };
        }
      }

      config.tabletButtons = {
        byteIndex: [], // Not used for keyboard events
        buttonCount: buttonMappings.length,
        type: 'keyboard-events',
        keyMappings,
      };
    } else if (hasHIDMappings) {
      // HID scan code detection (works for both driver and no-driver mode)
      const values: Record<string, { button: number }> = {};
      const conflictingButtons: Array<{ scanCode: number; statusByte: number; buttonNumber: number }> = [];

      // Check for scan code conflicts and track status byte overrides
      const scanCodeGroups = new Map<number, ButtonMapping[]>();
      for (const mapping of buttonMappings) {
        if (mapping.scanCode !== undefined) {
          const existing = scanCodeGroups.get(mapping.scanCode) || [];
          existing.push(mapping);
          scanCodeGroups.set(mapping.scanCode, existing);
        }
      }

      // Build value mappings - for conflicts, use the lower button number as default
      for (const [scanCode, mappings] of scanCodeGroups) {
        if (mappings.length > 1) {
          // Multiple buttons share this scan code
          const sorted = [...mappings].sort((a, b) => a.buttonNumber - b.buttonNumber);
          values[String(scanCode)] = { button: sorted[0].buttonNumber };

          // Record conflicts for runtime status byte checking
          for (let i = 1; i < sorted.length; i++) {
            const statusByte = sorted[i].statusByte;
            if (statusByte !== undefined) {
              conflictingButtons.push({
                scanCode,
                statusByte,
                buttonNumber: sorted[i].buttonNumber,
              });
            }
          }
        } else {
          values[String(scanCode)] = { button: mappings[0].buttonNumber };
        }
      }

      const tabletButtonsConfig: TabletButtonsConfig = {
        // Button scan code is always at position 1 after status byte
        // Config index is always 2 (works for both Report ID and WebHID cases):
        // - With Report ID: raw index 2, read offset 0 → read from index 2
        // - Without Report ID: raw index 1, read offset -1 → config 2 - 1 = index 1
        byteIndex: [2],
        buttonCount: buttonMappings.length,
        type: 'code',
        values,
      };

      // Add conflict overrides if any buttons share scan codes
      if (conflictingButtons.length > 0) {
        (tabletButtonsConfig as any).statusOverrides = conflictingButtons;
      }

      config.tabletButtons = tabletButtonsConfig;
    }
  } else if (tabletButtonBytes.length > 0) {
    // Fallback: auto-detected bytes with bit-flags type
    const buttonByteIndices = tabletButtonBytes.map(b => b.byteIndex + indexOffset);
    config.tabletButtons = {
      byteIndex: buttonByteIndices,
      buttonCount: 8, // Default to 8 buttons
      type: 'bit-flags',
    };
  }

  return config;
}