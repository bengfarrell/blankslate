/**
 * Core Module
 * Platform-agnostic shared code for browser and Node.js
 * 
 * This module contains:
 * - Walkthrough engine and types
 * - HID interface abstractions
 * - Shared utilities re-exported for convenience
 */

// Walkthrough
export * from './walkthrough/index.js';

// HID
export * from './hid/index.js';

// Re-export utilities that are platform-agnostic
export * from '../utils/byte-detector.js';
export * from '../utils/data-helpers.js';
export * from '../utils/metadata-generator.js';

// Re-export mock data generators
export * from '../mockbytes/tablet-data-generator.js';
export * from '../mockbytes/presets.js';

// Re-export models
export * from '../models/config.js';
export type * from '../types/config-types.js';

