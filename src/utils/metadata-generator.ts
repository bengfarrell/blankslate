/**
 * Metadata Generation Utilities
 *
 * This module contains utilities for generating device configuration metadata
 * from detected byte mappings and WebHID device information.
 */

import type { DeviceByteCodeMappings } from './byte-detector.js';
import type { ConfigData, ConfigMode } from '../models/config.js';
import type { DetectedButton } from '../core/walkthrough/walkthrough-controller.js';
import { keyCodeArrayToHidUsages } from './keyboard-hid-codes.js';

export interface DeviceMetadata {
  vendorId?: number;
  productId?: number;
  productName?: string;
  collections?: Array<{ usagePage: number; usage: number }>;
  allInterfaces?: number[];
  detectedReportId?: number;
  /** Report ID for button packets (if different from pen data report ID) */
  detectedButtonReportId?: number;
  /** The usage page of the interface that actually sends pen data */
  dataSourceUsagePage?: number;
}

export interface UserProvidedMetadata {
  name: string;
  manufacturer: string;
  model: string;
  description: string;
  buttonCount: number;
}

/**
 * Infer device capabilities from detected byte mappings
 */
export function inferCapabilities(
  byteCodeMappings: DeviceByteCodeMappings
): ConfigMode['capabilities'] {
  const hasPressure = !!byteCodeMappings.pressure;
  const hasTilt = !!(byteCodeMappings.tiltX || byteCodeMappings.tiltY);
  
  // Calculate pressure levels from max value (round to nearest power of 2)
  let pressureLevels = 8192; // default
  if (byteCodeMappings.pressure?.max) {
    const max = byteCodeMappings.pressure.max;
    // Find nearest power of 2
    pressureLevels = Math.pow(2, Math.round(Math.log2(max + 1)));
  }

  // Use max values as resolution
  // Use config values; fallback to generic 16-bit max if not specified
  const resolutionX = byteCodeMappings.x.max || 65535;
  const resolutionY = byteCodeMappings.y.max || 65535;

  return {
    hasButtons: false, // Will be set based on user input
    buttonCount: 0, // Will be set based on user input
    hasPressure,
    pressureLevels,
    hasTilt,
    resolution: {
      x: resolutionX,
      y: resolutionY,
    },
  };
}

/**
 * Detect the digitizer usage page from device collections
 */
export function detectDigitizerUsagePage(
  collections?: Array<{ usagePage: number; usage: number }>
): number {
  if (!collections || collections.length === 0) {
    return 13; // Default digitizer usage page
  }

  // Find the digitizer collection (usage page 13, usage 2 = pen)
  const digitizer = collections.find(c => c.usagePage === 13 && c.usage === 2);
  if (digitizer) {
    return digitizer.usagePage;
  }

  // Fallback to first collection's usage page
  return collections[0].usagePage;
}

/**
 * Detect the stylus mode status byte from status byte values
 * This is typically the "hover" state value
 */
export function detectStylusModeStatusByte(
  byteCodeMappings: DeviceByteCodeMappings
): number | undefined {
  if (!byteCodeMappings.status?.values) {
    return undefined;
  }

  // Find the status code for "hover" state
  for (const [code, value] of Object.entries(byteCodeMappings.status.values)) {
    if (value.state === 'hover' && !value.primaryButtonPressed && !value.secondaryButtonPressed) {
      return parseInt(code, 10);
    }
  }

  return undefined;
}

/**
 * Detect excluded usage pages (non-digitizer interfaces)
 * Note: We don't exclude any interfaces if buttons are configured,
 * since button data often comes from keyboard interfaces (usagePage 1)
 */
export function detectExcludedUsagePages(
  allInterfaces?: number[],
  digitizerUsagePage?: number,
  hasButtons?: boolean
): number[] {
  // Don't exclude anything if buttons are configured - they may come from other interfaces
  if (hasButtons) {
    return [];
  }
  
  if (!allInterfaces || allInterfaces.length === 0) {
    return [];
  }

  const digUsagePage = digitizerUsagePage || 13;
  
  // Exclude all interfaces that are not the digitizer
  return allInterfaces.filter(up => up !== digUsagePage);
}



/**
 * Generate complete device configuration from all available data in multi-mode format
 */
export function generateCompleteConfig(
  deviceMetadata: DeviceMetadata,
  userMetadata: UserProvidedMetadata,
  byteCodeMappings: DeviceByteCodeMappings,
  detectedButtons?: DetectedButton[]
): any {
  const capabilities = inferCapabilities(byteCodeMappings);
  const digitizerUsagePage = detectDigitizerUsagePage(deviceMetadata.collections);
  const stylusModeStatusByte = detectStylusModeStatusByte(byteCodeMappings);

  // Update capabilities with user-provided button info
  capabilities.hasButtons = userMetadata.buttonCount > 0;
  capabilities.buttonCount = userMetadata.buttonCount;

  // Don't exclude interfaces if buttons are configured (they may come from keyboard interface)
  const excludedUsagePages = detectExcludedUsagePages(
    deviceMetadata.allInterfaces,
    digitizerUsagePage,
    capabilities.hasButtons
  );

  // Find the collection for correct usage_page and usage
  // Priority: 1) dataSourceUsagePage with pen usage (13, 2), 2) dataSourceUsagePage (any usage), 3) Digitizer pen (13, 2), 4) Any digitizer (13), 5) First collection
  let primaryCollection;

  if (deviceMetadata.dataSourceUsagePage !== undefined) {
    // Use the interface that actually sent data (works with or without driver)
    // Prefer pen interface (usage 2) if available for the data source usage page
    const dataSourcePen = deviceMetadata.collections?.find(
      c => c.usagePage === deviceMetadata.dataSourceUsagePage && c.usage === 2
    );
    const dataSourceAny = deviceMetadata.collections?.find(
      c => c.usagePage === deviceMetadata.dataSourceUsagePage
    );
    primaryCollection = dataSourcePen || dataSourceAny;
  }

  if (!primaryCollection) {
    // Fallback to standard digitizer interface
    const digitizerPen = deviceMetadata.collections?.find(c => c.usagePage === 13 && c.usage === 2);
    const anyDigitizer = deviceMetadata.collections?.find(c => c.usagePage === 13);
    primaryCollection = digitizerPen || anyDigitizer || deviceMetadata.collections?.[0];
  }

  const usagePage = primaryCollection?.usagePage || 13;
  const usage = primaryCollection?.usage || 2;

  // Build mode configuration
  const modeConfig: any = {
    reportId: deviceMetadata.detectedReportId || 0,
    digitizerUsagePage,
    capabilities,
    byteCodeMappings,
  };

  // Add optional fields to mode
  if (stylusModeStatusByte !== undefined) {
    modeConfig.stylusModeStatusByte = stylusModeStatusByte;
  }
  if (excludedUsagePages.length > 0) {
    modeConfig.excludedUsagePages = excludedUsagePages;
  }

  // Add buttonInterfaceReportId if buttons come on a different report ID than pen data
  if (deviceMetadata.detectedButtonReportId !== undefined &&
      deviceMetadata.detectedButtonReportId !== deviceMetadata.detectedReportId) {
    modeConfig.buttonInterfaceReportId = deviceMetadata.detectedButtonReportId;
  }

  // Note: Keyboard button mappings are now handled in byte-detector.ts
  // as part of tabletButtons with type: 'keyboard'

  // Always generate multi-mode format (with single mode in array)
  return {
    name: userMetadata.name,
    manufacturer: userMetadata.manufacturer,
    model: userMetadata.model,
    description: userMetadata.description,
    vendorId: deviceMetadata.vendorId ? `0x${deviceMetadata.vendorId.toString(16)}` : '0x0000',
    productId: deviceMetadata.productId ? `0x${deviceMetadata.productId.toString(16)}` : '0x0000',
    deviceInfo: {
      vendor_id: deviceMetadata.vendorId || 0,
      product_id: deviceMetadata.productId || 0,
      product_string: deviceMetadata.productName || '',
      // Use the interface that actually sent data (works with or without driver)
      usage_page: usagePage,
      usage: usage,
      interfaces: deviceMetadata.allInterfaces || [],
    },
    modes: [modeConfig],
  };
}