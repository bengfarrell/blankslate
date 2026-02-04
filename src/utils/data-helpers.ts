/**
 * Data parsing helper functions for HID device data
 */

import { MappingType } from '../models/index.js';

/**
 * Interface for keyboard button configuration
 */
export interface KeyboardButtonConfig {
  button: number;
  reportId: number;
  type: 'keyboard' | 'consumer' | 'scroll';
  modifier?: number;
  keycode?: number;
  consumerCode?: number;
  scrollDelta?: number;
}

/**
 * Interface for keyboardButtons config section
 */
export interface KeyboardButtonsConfig {
  description?: string;
  usagePage?: number;
  usage?: number;
  buttonCount?: number;
  buttons: KeyboardButtonConfig[];
}

/**
 * Process keyboard HID interface data for tablet buttons (Huion-style tablets).
 *
 * Keyboard HID packet formats:
 * - Report ID 3: Keyboard shortcuts [03, modifier, keycode, 0, 0, 0, 0, 0]
 * - Report ID 4: Consumer Control [04, consumer_code, 0]
 * - Report ID 5: Relative scroll [05, 0, 0, 0, 0, 0, scroll_delta]
 *
 * @param data - Raw bytes from keyboard HID interface
 * @param keyboardButtonsConfig - The keyboardButtons config section
 * @returns Object with button state (tabletButtons, button1, button2, etc.)
 */
export function processKeyboardButtonData(
  data: Uint8Array,
  keyboardButtonsConfig: KeyboardButtonsConfig
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};

  if (data.length < 2) {
    return result;
  }

  const dataList = Array.from(data);
  const reportId = dataList[0];
  const buttonsList = keyboardButtonsConfig.buttons || [];
  const buttonCount = keyboardButtonsConfig.buttonCount ?? buttonsList.length;

  // Initialize all buttons to false
  for (let i = 1; i <= buttonCount; i++) {
    result[`button${i}`] = false;
  }
  result.tabletButtons = 0;
  result.button = 0;

  let matchedButton: number | undefined;

  if (reportId === 3) {
    // Keyboard shortcut format: [03, modifier, keycode, ...]
    if (dataList.length >= 3) {
      const modifier = dataList[1];
      const keycode = dataList[2];

      // Skip idle packets (no key pressed)
      if (keycode === 0) {
        return result;
      }

      // Find matching button in config
      for (const btnConfig of buttonsList) {
        if (btnConfig.reportId === 3 &&
            btnConfig.type === 'keyboard' &&
            btnConfig.modifier === modifier &&
            btnConfig.keycode === keycode) {
          matchedButton = btnConfig.button;
          break;
        }
      }
    }
  } else if (reportId === 4) {
    // Consumer Control format: [04, consumer_code, ...]
    if (dataList.length >= 2) {
      const consumerCode = dataList[1];

      // Skip idle packets
      if (consumerCode === 0) {
        return result;
      }

      // Find matching button in config
      for (const btnConfig of buttonsList) {
        if (btnConfig.reportId === 4 &&
            btnConfig.type === 'consumer' &&
            btnConfig.consumerCode === consumerCode) {
          matchedButton = btnConfig.button;
          break;
        }
      }
    }
  } else if (reportId === 5) {
    // Scroll wheel format: [05, 0, 0, 0, 0, 0, scroll_delta]
    // Scroll delta is typically in the last byte
    const scrollDelta = dataList.length > 6 ? dataList[6] : (dataList.length > 1 ? dataList[dataList.length - 1] : 0);

    // Skip idle packets
    if (scrollDelta === 0) {
      return result;
    }

    // Find matching button in config
    for (const btnConfig of buttonsList) {
      if (btnConfig.reportId === 5 &&
          btnConfig.type === 'scroll' &&
          btnConfig.scrollDelta === scrollDelta) {
        matchedButton = btnConfig.button;
        break;
      }
    }
  }

  // Set the matched button state
  if (matchedButton !== undefined) {
    result.tabletButtons = matchedButton;
    result.button = matchedButton;
    result[`button${matchedButton}`] = true;
    result.state = 'buttons';  // Indicate we're in button mode
  }

  return result;
}

/**
 * Parse a code value from a specific byte index and return the corresponding value
 */
export function parseCode(
  data: number[],
  byteIndex: number,
  values: Record<string, any>
): any {
  if (byteIndex >= data.length) {
    return null;
  }
  
  const byteValue = String(data[byteIndex]);
  return values[byteValue] || byteValue;
}

/**
 * Parse a range value (0-255) to a normalized value (0-1)
 */
export function parseRangeData(
  data: number[],
  byteIndex: number,
  min: number,
  max: number
): number {
  if (byteIndex >= data.length) {
    return 0;
  }
  
  const value = data[byteIndex];
  if (min === max) {
    return 0;
  }
  
  return (value - min) / (max - min);
}

/**
 * Parse a multi-byte range value to a normalized value (0-1)
 */
export function parseMultiByteRangeData(
  data: number[],
  byteIndices: number[],
  min: number,
  max: number,
  _key?: string
): number {
  // Combine bytes into a single value (little-endian)
  let value = 0;
  for (let i = 0; i < byteIndices.length; i++) {
    const byteIndex = byteIndices[i];
    if (byteIndex >= data.length) {
      return 0;
    }
    value += data[byteIndex] << (i * 8);
  }
  
  if (min === max) {
    return 0;
  }
  
  return (value - min) / (max - min);
}

/**
 * Parse a bipolar range value (e.g., tilt that can be positive or negative)
 * 
 * For tilt encoded in a single byte:
 * - Positive range: 0 to positiveMax (e.g., 0-60 for +60°)
 * - Negative range: negativeMin to negativeMax (e.g., 196-255 for -60° to ~0°)
 * 
 * In the negative range:
 * - negativeMin (e.g., 196) represents MAX negative tilt (-1.0)
 * - negativeMax (e.g., 255) represents near-zero tilt (~0.0)
 */
export function parseBipolarRangeData(
  data: number[],
  byteIndex: number,
  positiveMin: number,
  positiveMax: number,
  negativeMin: number,
  negativeMax: number
): number {
  if (byteIndex >= data.length) {
    return 0;
  }
  
  const value = data[byteIndex];
  
  // Check if value is in positive range (e.g., 1-60)
  // Higher byte value = more positive tilt
  if (value >= positiveMin && value <= positiveMax) {
    if (positiveMax === positiveMin) {
      return 0;
    }
    return (value - positiveMin) / (positiveMax - positiveMin);
  }
  
  // Check if value is in negative range (e.g., 196-255)
  // Lower byte value (196) = max negative tilt (-1.0)
  // Higher byte value (255) = near zero tilt (~0.0)
  if (value >= negativeMin && value <= negativeMax) {
    if (negativeMax === negativeMin) {
      return 0;
    }
    // Invert: negativeMin maps to -1, negativeMax maps to ~0
    return -((negativeMax - value) / (negativeMax - negativeMin));
  }
  
  return 0;
}

/**
 * Parse bit flags from a byte (e.g., for button states)
 */
export function parseBitFlags(
  data: number[],
  byteIndex: number,
  buttonCount: number
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  
  if (byteIndex >= data.length) {
    return result;
  }
  
  const bits = data[byteIndex];
  
  for (let i = 0; i < buttonCount; i++) {
    const buttonNum = i + 1;
    result[`button${buttonNum}`] = (bits & (1 << i)) !== 0;
  }
  
  return result;
}

/**
 * Process raw device data according to configuration byte code mappings
 * 
 * @param data - Raw HID device data as Uint8Array
 * @param mappings - Configuration mappings defining how to interpret the data
 * @param byteIndexOffset - Offset to apply to all byte indices from config (default: 0)
 *                          Use -1 for WebHID since browser strips report ID from packets
 *                          Use 0 for Node.js/Python which keep full packet with report ID
 * @returns Processed data as key-value pairs
 * 
 * @example
 * // Node.js/Python - packet includes report ID, config indices are direct
 * const result = processDeviceData(rawData, config.byteCodeMappings, 0);
 * 
 * // WebHID - browser strips report ID, subtract 1 from config indices
 * const result = processDeviceData(rawData, config.byteCodeMappings, -1);
 * 
 * // With button interface report ID from config
 * const result = processDeviceData(rawData, config.byteCodeMappings, 0, { buttonInterfaceReportId: 6 });
 */
export function processDeviceData(
  data: Uint8Array,
  mappings: Record<string, any> | undefined,
  byteIndexOffset: number = 0,
  options?: { buttonInterfaceReportId?: number }
): Record<string, string | number | boolean> {
  // Convert Uint8Array to number array
  const dataList = Array.from(data);
  const result: Record<string, string | number | boolean> = {};

  // Return empty result if no mappings provided
  if (!mappings) {
    return result;
  }

  // Check Report ID - only valid when packet includes report ID (byteIndexOffset === 0)
  // WebHID strips the report ID, so this check only applies to Node.js/Python
  // Uses config's buttonInterfaceReportId if specified, otherwise don't assume
  let isButtonInterface = false;
  if (byteIndexOffset === 0 && dataList.length > 0 && options?.buttonInterfaceReportId !== undefined) {
    const reportId = dataList[0];
    isButtonInterface = reportId === options.buttonInterfaceReportId;
  }

  // Parse the status to determine device state
  let deviceState: string | null = null;
  let statusByteActualIndex: number | null = null;  // Track actual index for later use
  for (const [key, mapping] of Object.entries(mappings)) {
    if (mapping.type === MappingType.CODE) {
      // Handle byteIndex as either number or array
      const rawByteIndex = mapping.byteIndex ?? 0;
      const configByteIndex = Array.isArray(rawByteIndex) ? rawByteIndex[0] : rawByteIndex;
      // Apply offset for WebHID (browser strips report ID)
      const byteIndex = configByteIndex + byteIndexOffset;
      
      if (byteIndex >= 0 && byteIndex < dataList.length) {
        statusByteActualIndex = byteIndex;  // Remember for later button mode checks
        const codeResult = parseCode(dataList, byteIndex, mapping.values ?? {});
        if (typeof codeResult === 'object' && codeResult !== null) {
          Object.assign(result, codeResult);
          deviceState = codeResult.state ?? null;
        } else {
          // Unknown status code - check if it's an idle/out-of-range state
          const statusByte = dataList[byteIndex];
          // Common idle status bytes: 0x00 (no data), 0xC0 (192 = out of range)
          if (statusByte === 0x00 || statusByte === 0xC0) {
            result.state = 'none';
            deviceState = 'none';
          } else {
            // Show the unknown status byte value to help with debugging
            result.state = `unknown(${statusByte})`;
            result[key] = codeResult;
          }
        }
        break;
      }
    }
  }
  
  // If no state was determined, check if all data is zeros (pen out of range)
  if (!deviceState && dataList.every(b => b === 0)) {
    result.state = 'none';
    deviceState = 'none';
  }

  // Keyboard interface packets should be treated like button interface
  if (deviceState === 'keyboard') {
    isButtonInterface = true;
  }

  // Process remaining mappings based on device state
  for (const [key, mapping] of Object.entries(mappings)) {
    const mappingType = mapping.type;
    // Handle byteIndex - keep as array for multi-byte types, extract first for single-byte
    const rawByteIndex = mapping.byteIndex ?? 0;
    // For multi-byte-range, keep the full array; for others, use first element
    // Apply byteIndexOffset to account for WebHID stripping report ID
    const byteIndex = mappingType === MappingType.MULTI_BYTE_RANGE
      ? (Array.isArray(rawByteIndex) 
          ? rawByteIndex.map((i: number) => i + byteIndexOffset)  // Apply offset to each index
          : [rawByteIndex + byteIndexOffset])
      : (Array.isArray(rawByteIndex) 
          ? rawByteIndex[0] + byteIndexOffset 
          : rawByteIndex + byteIndexOffset);

    // Skip if already processed (status/code), unless it's tabletButtons with code type
    if (mappingType === MappingType.CODE && key !== 'tabletButtons') {
      continue;
    }

    // Handle tabletButtons with code type (custom value mapping)
    if (key === 'tabletButtons' && mappingType === MappingType.CODE) {
      // Process button codes when in button mode
      // Use status byte at actual index (already computed with offset)
      // For WebHID (byteIndexOffset < 0), status byte is at raw index 0
      let statusByte: number;
      if (statusByteActualIndex !== null) {
        statusByte = dataList[statusByteActualIndex];
      } else if (byteIndexOffset < 0 && dataList.length > 0) {
        // WebHID fallback: status byte is at index 0 when no status mapping exists
        statusByte = dataList[0];
      } else {
        statusByte = 0;
      }
      const inButtonMode = isButtonInterface || deviceState === 'buttons' || statusByte === 240;
      if (inButtonMode) {
        // Use 0-based indexing directly
        if (byteIndex >= 0 && byteIndex < dataList.length) {
          const byteValue = String(dataList[byteIndex]);
          const valuesMap = mapping.values ?? {};
          const statusOverrides = mapping.statusOverrides as Array<{ scanCode: number; statusByte: number; buttonNumber: number }> | undefined;
          
          let buttonNum: number | undefined;
          
          if (byteValue in valuesMap) {
            buttonNum = valuesMap[byteValue].button;
            
            // Check for status byte overrides (buttons sharing same scan code)
            // Use the statusByte we already computed (handles WebHID fallback)
            if (statusOverrides) {
              const scanCode = parseInt(byteValue, 10);
              const override = statusOverrides.find(
                o => o.scanCode === scanCode && o.statusByte === statusByte
              );
              if (override) {
                buttonNum = override.buttonNumber;
              }
            }
          }
          
          if (buttonNum) {
            // Set the active button number and individual flags
            result.tabletButtons = buttonNum;
            result.button = buttonNum;  // Also set generic 'button' for dashboard compatibility
            const buttonCount = mapping.buttonCount ?? 8;
            for (let i = 1; i <= buttonCount; i++) {
              result[`button${i}`] = i === buttonNum;
            }
          } else {
            // No button pressed - clear button state
            result.button = 0;
            result.tabletButtons = 0;
          }
        }
      }
      continue;
    }

    // Skip button parsing if not in button mode (unless we're on button-only interface)
    if (mappingType === MappingType.BIT_FLAGS && deviceState !== 'buttons' && !isButtonInterface) {
      continue;
    }

    // Skip coordinate/pressure/tilt parsing if on button-only interface or in button mode
    if ((isButtonInterface || deviceState === 'buttons') && 
        ['x', 'y', 'pressure', 'tiltX', 'tiltY'].includes(key)) {
      continue;
    }

    if (mappingType === 'range') {
      // Use 0-based indexing directly
      if (byteIndex < 0 || byteIndex >= dataList.length) {
        continue;
      }
      result[key] = parseRangeData(
        dataList,
        byteIndex,
        mapping.min ?? 0,
        mapping.max ?? 0
      );
    } else if (mappingType === MappingType.MULTI_BYTE_RANGE) {
      // Use byteIndex (standardized to always be an array)
      const byteIndices = Array.isArray(byteIndex) ? byteIndex : [byteIndex];
      // Use 0-based indexing directly
      // Validate all indices are within bounds
      if (byteIndices.every((idx: number) => idx >= 0 && idx < dataList.length)) {
        result[key] = parseMultiByteRangeData(
          dataList,
          byteIndices,
          mapping.min ?? 0,
          mapping.max ?? 0,
          key  // Pass the key name for debug logging
        );
      }
    } else if (mappingType === MappingType.BIPOLAR_RANGE) {
      // Use 0-based indexing directly
      if (byteIndex < 0 || byteIndex >= dataList.length) {
        continue;
      }
      result[key] = parseBipolarRangeData(
        dataList,
        byteIndex,
        mapping.positiveMin ?? 0,
        mapping.positiveMax ?? 0,
        mapping.negativeMin ?? 0,
        mapping.negativeMax ?? 0
      );
    } else if (mappingType === MappingType.BIT_FLAGS) {
      // Use 0-based indexing directly
      if (byteIndex < 0 || byteIndex >= dataList.length) {
        continue;
      }
      const buttonStates = parseBitFlags(
        dataList,
        byteIndex,
        mapping.buttonCount ?? 8
      );
      Object.assign(result, buttonStates);
    }
  }

  return result;
}