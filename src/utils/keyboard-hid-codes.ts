/**
 * USB HID Keyboard Usage ID mappings
 * Based on USB HID Usage Tables specification
 * https://usb.org/sites/default/files/hut1_5.pdf
 * Page 0x07 - Keyboard/Keypad
 */

/**
 * Map JavaScript KeyboardEvent.code to USB HID Usage ID
 */
export const KEY_CODE_TO_HID_USAGE: Record<string, number> = {
  // Letters (0x04-0x1D)
  'KeyA': 0x04,
  'KeyB': 0x05,
  'KeyC': 0x06,
  'KeyD': 0x07,
  'KeyE': 0x08,
  'KeyF': 0x09,
  'KeyG': 0x0A,
  'KeyH': 0x0B,
  'KeyI': 0x0C,
  'KeyJ': 0x0D,
  'KeyK': 0x0E,
  'KeyL': 0x0F,
  'KeyM': 0x10,
  'KeyN': 0x11,
  'KeyO': 0x12,
  'KeyP': 0x13,
  'KeyQ': 0x14,
  'KeyR': 0x15,
  'KeyS': 0x16,
  'KeyT': 0x17,
  'KeyU': 0x18,
  'KeyV': 0x19,
  'KeyW': 0x1A,
  'KeyX': 0x1B,
  'KeyY': 0x1C,
  'KeyZ': 0x1D,

  // Numbers (0x1E-0x27)
  'Digit1': 0x1E,
  'Digit2': 0x1F,
  'Digit3': 0x20,
  'Digit4': 0x21,
  'Digit5': 0x22,
  'Digit6': 0x23,
  'Digit7': 0x24,
  'Digit8': 0x25,
  'Digit9': 0x26,
  'Digit0': 0x27,

  // Special keys
  'Enter': 0x28,
  'Escape': 0x29,
  'Backspace': 0x2A,
  'Tab': 0x2B,
  'Space': 0x2C,
  'Minus': 0x2D,
  'Equal': 0x2E,
  'BracketLeft': 0x2F,
  'BracketRight': 0x30,
  'Backslash': 0x31,
  'Semicolon': 0x33,
  'Quote': 0x34,
  'Backquote': 0x35,
  'Comma': 0x36,
  'Period': 0x37,
  'Slash': 0x38,
  'CapsLock': 0x39,

  // Function keys (0x3A-0x45)
  'F1': 0x3A,
  'F2': 0x3B,
  'F3': 0x3C,
  'F4': 0x3D,
  'F5': 0x3E,
  'F6': 0x3F,
  'F7': 0x40,
  'F8': 0x41,
  'F9': 0x42,
  'F10': 0x43,
  'F11': 0x44,
  'F12': 0x45,

  // Navigation keys
  'PrintScreen': 0x46,
  'ScrollLock': 0x47,
  'Pause': 0x48,
  'Insert': 0x49,
  'Home': 0x4A,
  'PageUp': 0x4B,
  'Delete': 0x4C,
  'End': 0x4D,
  'PageDown': 0x4E,
  'ArrowRight': 0x4F,
  'ArrowLeft': 0x50,
  'ArrowDown': 0x51,
  'ArrowUp': 0x52,

  // Keypad (0x53-0x63)
  'NumLock': 0x53,
  'NumpadDivide': 0x54,
  'NumpadMultiply': 0x55,
  'NumpadSubtract': 0x56,
  'NumpadAdd': 0x57,
  'NumpadEnter': 0x58,
  'Numpad1': 0x59,
  'Numpad2': 0x5A,
  'Numpad3': 0x5B,
  'Numpad4': 0x5C,
  'Numpad5': 0x5D,
  'Numpad6': 0x5E,
  'Numpad7': 0x5F,
  'Numpad8': 0x60,
  'Numpad9': 0x61,
  'Numpad0': 0x62,
  'NumpadDecimal': 0x63,

  // Modifiers (0xE0-0xE7)
  'ControlLeft': 0xE0,
  'ShiftLeft': 0xE1,
  'AltLeft': 0xE2,
  'MetaLeft': 0xE3,
  'ControlRight': 0xE4,
  'ShiftRight': 0xE5,
  'AltRight': 0xE6,
  'MetaRight': 0xE7,
};

/**
 * Convert KeyboardEvent.code to USB HID Usage ID
 */
export function keyCodeToHidUsage(code: string): number | undefined {
  return KEY_CODE_TO_HID_USAGE[code];
}

/**
 * Convert array of KeyboardEvent codes to USB HID Usage IDs
 */
export function keyCodeArrayToHidUsages(codes: string[]): number[] {
  return codes
    .map(code => keyCodeToHidUsage(code))
    .filter((id): id is number => id !== undefined);
}

/**
 * Format HID usage ID as hex string
 */
export function formatHidUsage(usageId: number): string {
  return `0x${usageId.toString(16).toUpperCase().padStart(2, '0')}`;
}

/**
 * Reverse mapping: USB HID Usage ID to JavaScript KeyboardEvent.code
 * Generated from KEY_CODE_TO_HID_USAGE
 */
export const HID_USAGE_TO_KEY_CODE: Record<number, string> = Object.fromEntries(
  Object.entries(KEY_CODE_TO_HID_USAGE).map(([code, usage]) => [usage, code])
);

/**
 * Convert USB HID Usage ID to JavaScript KeyboardEvent.code
 */
export function hidUsageToKeyCode(usageId: number): string | undefined {
  return HID_USAGE_TO_KEY_CODE[usageId];
}

/**
 * HID modifier byte bit flags
 * Modifier byte format: [CtrlL, ShiftL, AltL, MetaL, CtrlR, ShiftR, AltR, MetaR]
 */
export const HID_MODIFIER_BITS = {
  CTRL_LEFT: 0x01,
  SHIFT_LEFT: 0x02,
  ALT_LEFT: 0x04,
  META_LEFT: 0x08,
  CTRL_RIGHT: 0x10,
  SHIFT_RIGHT: 0x20,
  ALT_RIGHT: 0x40,
  META_RIGHT: 0x80,
};

/**
 * Convert HID modifier byte to array of JavaScript KeyboardEvent.code values
 */
export function hidModifierToKeyCodes(modifier: number): string[] {
  const codes: string[] = [];
  if (modifier & HID_MODIFIER_BITS.CTRL_LEFT) codes.push('ControlLeft');
  if (modifier & HID_MODIFIER_BITS.SHIFT_LEFT) codes.push('ShiftLeft');
  if (modifier & HID_MODIFIER_BITS.ALT_LEFT) codes.push('AltLeft');
  if (modifier & HID_MODIFIER_BITS.META_LEFT) codes.push('MetaLeft');
  if (modifier & HID_MODIFIER_BITS.CTRL_RIGHT) codes.push('ControlRight');
  if (modifier & HID_MODIFIER_BITS.SHIFT_RIGHT) codes.push('ShiftRight');
  if (modifier & HID_MODIFIER_BITS.ALT_RIGHT) codes.push('AltRight');
  if (modifier & HID_MODIFIER_BITS.META_RIGHT) codes.push('MetaRight');
  return codes;
}

