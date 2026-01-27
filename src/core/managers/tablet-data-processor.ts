/**
 * TabletDataProcessor
 * Handles normalization, byte synthesis, and formatting of tablet data
 */

import type { TabletData, TabletDataEvent, ByteData, TabletEvent } from './types.js';

/**
 * Default byte mappings for mock device format
 */
export const DEFAULT_MOCK_BYTE_MAPPINGS = {
  status: {
    byteIndex: [0],
    type: 'code',
    values: {
      '192': { state: 'none' },
      '160': { state: 'hover' },
      '161': { state: 'contact' },
      '162': { state: 'secondary-hover', secondaryButtonPressed: true },
      '163': { state: 'secondary-contact', secondaryButtonPressed: true },
      '164': { state: 'primary-hover', primaryButtonPressed: true },
      '165': { state: 'primary-contact', primaryButtonPressed: true },
      '240': { state: 'buttons' },
    },
  },
  x: { byteIndex: [1, 2], type: 'multi-byte-range', min: 0, max: 65535 },
  y: { byteIndex: [3, 4], type: 'multi-byte-range', min: 0, max: 65535 },
  pressure: { byteIndex: [5, 6], type: 'multi-byte-range', min: 0, max: 8191 },
  tiltX: { byteIndex: [7], type: 'bipolar-range', positiveMin: 128, positiveMax: 255, negativeMin: 0, negativeMax: 127 },
  tiltY: { byteIndex: [8], type: 'bipolar-range', positiveMin: 128, positiveMax: 255, negativeMin: 0, negativeMax: 127 },
  tabletButtons: { byteIndex: [1], type: 'bit-flags', buttonCount: 8 },
};

/**
 * Normalize raw tablet data event to standard TabletData format
 */
export function normalizeTabletData(data: TabletDataEvent): TabletData {
  const normalizedX = typeof data.x === 'number' ? data.x : 0;
  const normalizedY = typeof data.y === 'number' ? data.y : 0;
  const normalizedPressure = typeof data.pressure === 'number' ? data.pressure : 0;
  const tiltX = typeof data.tiltX === 'number' ? data.tiltX : 0;
  const tiltY = typeof data.tiltY === 'number' ? data.tiltY : 0;
  const tiltXY = Math.sqrt(tiltX * tiltX + tiltY * tiltY) * Math.sign(tiltX * tiltY || 1);

  return {
    x: normalizedX,
    y: normalizedY,
    pressure: normalizedPressure,
    tiltX,
    tiltY,
    tiltXY: Math.min(1, Math.max(-1, tiltXY)),
    primaryButtonPressed: data.primaryButtonPressed ?? false,
    secondaryButtonPressed: data.secondaryButtonPressed ?? false,
    button: data.button,
    state: data.state,
  };
}

/**
 * Synthesize raw bytes from translated event data
 * Used when receiving translated events without raw bytes
 */
export function synthesizeRawBytes(data: TabletDataEvent): ByteData[] {
  const x = Math.round((data.x ?? 0) * 65535);
  const y = Math.round((data.y ?? 0) * 65535);
  const pressure = Math.round((data.pressure ?? 0) * 8191);
  const tiltX = Math.round(((data.tiltX ?? 0) + 1) * 127.5);
  const tiltY = Math.round(((data.tiltY ?? 0) + 1) * 127.5);

  const bytes = new Uint8Array([
    0x02, // Report ID placeholder
    (data.primaryButtonPressed ? 0x01 : 0x00) | (data.secondaryButtonPressed ? 0x02 : 0x00),
    x & 0xFF, (x >> 8) & 0xFF,
    y & 0xFF, (y >> 8) & 0xFF,
    pressure & 0xFF, (pressure >> 8) & 0xFF,
    tiltX & 0xFF,
    tiltY & 0xFF,
    data.button ?? 0,
    0x00
  ]);

  const labels = ['reportId', 'buttons', 'xLow', 'xHigh', 'yLow', 'yHigh', 'pressLow', 'pressHigh', 'tiltX', 'tiltY', 'tabletBtn', 'pad'];
  
  return Array.from(bytes).map((value, index) => ({
    byteIndex: index,
    value,
    label: labels[index] || undefined,
    isIdentified: index < labels.length
  }));
}

/**
 * Convert raw bytes to ByteData format with labels from config mappings
 */
export function rawBytesToByteData(data: Uint8Array, mappings?: Record<string, any>): ByteData[] {
  return Array.from(data).map((value, index) => {
    const byteData: ByteData = {
      byteIndex: index,
      value,
    };

    if (mappings) {
      for (const [key, mapping] of Object.entries(mappings)) {
        if (mapping && 'byteIndex' in mapping) {
          const byteIndices = mapping.byteIndex as number[];
          if (byteIndices.includes(index)) {
            byteData.label = key;
            byteData.isIdentified = true;
            break;
          }
        }
      }
    }

    return byteData;
  });
}

/**
 * Create a TabletEvent from TabletData for event stream display
 */
export function createTabletEvent(data: TabletData, buttonNum?: number): TabletEvent {
  return {
    timestamp: Date.now(),
    x: data.x,
    y: data.y,
    pressure: data.pressure,
    tiltX: data.tiltX,
    tiltY: data.tiltY,
    tiltXY: data.tiltXY,
    primaryButtonPressed: data.primaryButtonPressed,
    secondaryButtonPressed: data.secondaryButtonPressed,
    button1: typeof buttonNum === 'number' ? buttonNum === 1 : undefined,
    button2: typeof buttonNum === 'number' ? buttonNum === 2 : undefined,
    button3: typeof buttonNum === 'number' ? buttonNum === 3 : undefined,
    button4: typeof buttonNum === 'number' ? buttonNum === 4 : undefined,
    button5: typeof buttonNum === 'number' ? buttonNum === 5 : undefined,
    button6: typeof buttonNum === 'number' ? buttonNum === 6 : undefined,
    button7: typeof buttonNum === 'number' ? buttonNum === 7 : undefined,
    button8: typeof buttonNum === 'number' ? buttonNum === 8 : undefined,
    state: data.state,
  };
}

/**
 * Format a numeric value for display
 */
export function formatValue(value: number, decimals: number = 2): string {
  return value.toFixed(decimals);
}

/**
 * Extract pressed buttons from tablet data
 */
export function extractPressedButtons(data: TabletData | TabletDataEvent): Set<number> {
  const button = data.button;
  if (button !== undefined && button > 0) {
    return new Set([button]);
  }
  return new Set();
}
