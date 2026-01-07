/**
 * Core HID Module - Node.js version
 * Exports only Node.js compatible interfaces (no WebHID)
 */

export * from './hid-interface.js';
export * from './mock-hid-reader.js';
// Note: web-hid-reader.ts is NOT exported here as it requires browser APIs

