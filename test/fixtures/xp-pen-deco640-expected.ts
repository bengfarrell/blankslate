/**
 * XP-Pen Deco 640 Expected Configuration
 * 
 * This file contains the expected values for the XP-Pen Deco 640 tablet
 * running on macOS without the official driver, using Node.js HID access.
 * 
 * These values serve as the "source of truth" for walkthrough tests.
 * The walkthrough should generate a config that matches these expectations.
 */

// ============================================================================
// Device Identification
// ============================================================================

export const DEVICE_INFO = {
  name: 'XP Pen Deco 640',
  manufacturer: 'XP Pen',
  model: 'Deco 640',
  vendorId: 0x28bd,  // 10429 decimal
  productId: 0x2904, // 10500 decimal
  usagePage: 13,     // Digitizer
  usage: 2,          // Pen
  interfaces: [13, 1], // Digitizer + Keyboard (for express keys)
} as const;

// ============================================================================
// Byte Layout
// ============================================================================

/**
 * HID Packet Structure (9 bytes, 0-indexed):
 * 
 * Byte 0: Status byte (hover/contact/buttons)
 * Bytes 1-2: X coordinate (little-endian, 16-bit)
 * Bytes 3-4: Y coordinate (little-endian, 16-bit)
 * Bytes 5-6: Pressure (little-endian, 16-bit)
 * Byte 7: Tilt X (bipolar: 0=neutral, <128=left, >128=right)
 * Byte 8: Tilt Y (bipolar: 0=neutral, <128=forward, >128=backward)
 */
export const BYTE_LAYOUT = {
  status: { byteIndex: [0] },
  x: { byteIndex: [1, 2] },
  y: { byteIndex: [3, 4] },
  pressure: { byteIndex: [5, 6] },
  tiltX: { byteIndex: [7] },
  tiltY: { byteIndex: [8] },
  tabletButtons: { byteIndex: [1] }, // On keyboard interface, byte 1 is scan code
} as const;

// ============================================================================
// Value Ranges
// ============================================================================

export const VALUE_RANGES = {
  x: {
    max: 15999,
    type: 'multi-byte-range' as const,
  },
  y: {
    max: 8999,
    type: 'multi-byte-range' as const,
  },
  pressure: {
    max: 16383,
    type: 'multi-byte-range' as const,
  },
  tiltX: {
    positiveMax: 60,    // Maximum positive tilt value
    negativeMin: 196,   // Start of negative range
    negativeMax: 255,   // Maximum negative tilt value
    type: 'bipolar-range' as const,
  },
  tiltY: {
    positiveMax: 60,
    negativeMin: 196,
    negativeMax: 255,
    type: 'bipolar-range' as const,
  },
} as const;

// ============================================================================
// Status Byte Values
// ============================================================================

export const STATUS_BYTES = {
  // Pen states
  none: 192,     // 0xC0 - Pen away from tablet
  hover: 160,    // 0xA0 - Pen hovering
  contact: 161,  // 0xA1 - Pen in contact

  // Button combinations (contact)
  contactSecondary: 163,  // 0xA3 - Contact + secondary button
  contactPrimary: 165,    // 0xA5 - Contact + primary button

  // Button combinations (hover)
  hoverSecondary: 162,    // 0xA2 - Hover + secondary button
  hoverPrimary: 164,      // 0xA4 - Hover + primary button

  // Tablet button interface status
  keyboard: 0,   // Keyboard interface sends status 0
  buttons1: 1,   // Some buttons send status 1
  buttons3: 3,   // Button 8 sends status 3
} as const;

/**
 * Complete status mapping as it should appear in the generated config
 */
export const STATUS_VALUES = {
  '0': { state: 'keyboard' },
  '1': { state: 'buttons' },
  '3': { state: 'buttons' },
  '160': { state: 'hover' },
  '161': { state: 'contact' },
  '162': { state: 'hover', secondaryButtonPressed: true },
  '163': { state: 'contact', secondaryButtonPressed: true },
  '164': { state: 'hover', primaryButtonPressed: true },
  '165': { state: 'contact', primaryButtonPressed: true },
  '192': { state: 'none' },
} as const;

// ============================================================================
// Tablet Express Keys
// ============================================================================

/**
 * Button mappings for the 8 express keys on the tablet body.
 * These are sent on the keyboard interface (usagePage: 1) as scan codes.
 */
export const EXPRESS_KEY_MAPPINGS = {
  button1: { scanCode: 5, statusByte: 0 },
  button2: { scanCode: 8, statusByte: 0 },
  button3: { scanCode: 47, statusByte: 0 },
  button4: { scanCode: 48, statusByte: 0 },
  button5: { scanCode: 86, statusByte: 0 },
  button6: { scanCode: 87, statusByte: 0 },
  button7: { scanCode: 29, statusByte: 1 },
  button8: { scanCode: 29, statusByte: 3 }, // Same scan code as button 7, different status
} as const;

/**
 * Scan code to button mapping as it should appear in the config
 */
export const TABLET_BUTTON_VALUES = {
  '5': { button: 1 },
  '8': { button: 2 },
  '29': { button: 7 }, // Note: button 8 uses statusOverrides
  '47': { button: 3 },
  '48': { button: 4 },
  '86': { button: 5 },
  '87': { button: 6 },
} as const;

/**
 * Status overrides for buttons that share the same scan code
 */
export const STATUS_OVERRIDES = [
  { scanCode: 29, statusByte: 3, buttonNumber: 8 },
] as const;

// ============================================================================
// Capabilities
// ============================================================================

export const CAPABILITIES = {
  hasButtons: true,
  buttonCount: 8,
  hasPressure: true,
  pressureLevels: 16384,
  hasTilt: true,
  resolution: {
    x: 15999,
    y: 8999,
  },
} as const;

// ============================================================================
// Test Packet Helpers
// ============================================================================

/**
 * Generate a test packet with the given values
 */
export function createTestPacket(options: {
  status?: number;
  x?: number;
  y?: number;
  pressure?: number;
  tiltX?: number;
  tiltY?: number;
}): Uint8Array {
  const packet = new Uint8Array(9);
  packet[0] = options.status ?? STATUS_BYTES.hover;
  
  // X coordinate (little-endian)
  const x = options.x ?? 0;
  packet[1] = x & 0xff;
  packet[2] = (x >> 8) & 0xff;
  
  // Y coordinate (little-endian)
  const y = options.y ?? 0;
  packet[3] = y & 0xff;
  packet[4] = (y >> 8) & 0xff;
  
  // Pressure (little-endian)
  const pressure = options.pressure ?? 0;
  packet[5] = pressure & 0xff;
  packet[6] = (pressure >> 8) & 0xff;
  
  // Tilt
  packet[7] = options.tiltX ?? 0;
  packet[8] = options.tiltY ?? 0;
  
  return packet;
}

/**
 * Generate a keyboard interface packet (for express keys)
 */
export function createKeyboardPacket(options: {
  status?: number;
  scanCode?: number;
}): Uint8Array {
  const packet = new Uint8Array(7);
  packet[0] = options.status ?? 0;
  packet[1] = options.scanCode ?? 0;
  // Bytes 2-6 are unused (zeros)
  return packet;
}

// ============================================================================
// Full Expected Config (for comparison)
// ============================================================================

export const EXPECTED_BYTE_CODE_MAPPINGS = {
  x: {
    byteIndex: BYTE_LAYOUT.x.byteIndex,
    max: VALUE_RANGES.x.max,
    type: VALUE_RANGES.x.type,
  },
  y: {
    byteIndex: BYTE_LAYOUT.y.byteIndex,
    max: VALUE_RANGES.y.max,
    type: VALUE_RANGES.y.type,
  },
  pressure: {
    byteIndex: BYTE_LAYOUT.pressure.byteIndex,
    max: VALUE_RANGES.pressure.max,
    type: VALUE_RANGES.pressure.type,
  },
  tiltX: {
    byteIndex: BYTE_LAYOUT.tiltX.byteIndex,
    positiveMax: VALUE_RANGES.tiltX.positiveMax,
    negativeMin: VALUE_RANGES.tiltX.negativeMin,
    negativeMax: VALUE_RANGES.tiltX.negativeMax,
    type: VALUE_RANGES.tiltX.type,
  },
  tiltY: {
    byteIndex: BYTE_LAYOUT.tiltY.byteIndex,
    positiveMax: VALUE_RANGES.tiltY.positiveMax,
    negativeMin: VALUE_RANGES.tiltY.negativeMin,
    negativeMax: VALUE_RANGES.tiltY.negativeMax,
    type: VALUE_RANGES.tiltY.type,
  },
  status: {
    byteIndex: BYTE_LAYOUT.status.byteIndex,
    type: 'code' as const,
    values: STATUS_VALUES,
  },
  tabletButtons: {
    byteIndex: BYTE_LAYOUT.tabletButtons.byteIndex,
    buttonCount: CAPABILITIES.buttonCount,
    type: 'code' as const,
    values: TABLET_BUTTON_VALUES,
    statusOverrides: STATUS_OVERRIDES,
  },
} as const;

