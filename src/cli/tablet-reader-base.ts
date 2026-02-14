/**
 * Tablet Reader Base
 * 
 * Shared functionality between tablet CLI tools (event-viewer, websocket-server)
 * Handles config loading, device initialization, mock mode, and graceful shutdown.
 */

import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import HID from 'node-hid';

import { Config } from '../models/config.js';
import { processDeviceData, processKeyboardButtonData, type KeyboardButtonsConfig } from '../utils/data-helpers.js';
import { MockHIDReader, createMockHIDReader } from '../core/hid/mock-hid-reader.js';
import type { IHIDReader, HIDDeviceInfo, HIDInterfaceType } from '../core/hid/hid-interface.js';
import { createNodeHIDManager, MultiInterfaceReader, type NodeHIDReaderOptions } from './node-hid-reader.js';

/**
 * Mock gesture sequence used for demo/testing
 */
export const MOCK_GESTURES = [
  { name: 'horizontal', duration: 2000, description: 'Horizontal line (X coordinate test)' },
  { name: 'vertical', duration: 2000, description: 'Vertical line (Y coordinate test)' },
  { name: 'circle', duration: 3000, description: 'Circle pattern (combined X/Y)' },
  { name: 'pressure', duration: 2000, description: 'Pressure variation' },
  { name: 'tilt-x', duration: 2000, description: 'Tilt X variation' },
  { name: 'tilt-y', duration: 2000, description: 'Tilt Y variation' },
  { name: 'hover', duration: 2000, description: 'Hover movement (no pressure)' },
  { name: 'primary-button', duration: 1500, description: 'Primary button press' },
  { name: 'secondary-button', duration: 1500, description: 'Secondary button press' },
  { name: 'tablet-buttons', duration: 3000, description: 'Express key presses' },
] as const;

export type MockGesture = (typeof MOCK_GESTURES)[number];

/**
 * Processed tablet event with normalized values
 */
export interface TabletEventData {
  state: string;
  x: number;
  y: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  tiltXY: number;
  primaryButtonPressed: boolean;
  secondaryButtonPressed: boolean;
  tabletButtons: number;
  button1: boolean;
  button2: boolean;
  button3: boolean;
  button4: boolean;
  button5: boolean;
  button6: boolean;
  button7: boolean;
  button8: boolean;
}

/**
 * Base options for tablet readers
 */
export interface TabletReaderOptions {
  mock?: boolean;
  exitOnStop?: boolean; // Whether to call process.exit() in stop() - default true
  configDir?: string; // Directory to search for configs when auto-detecting devices
}

/**
 * Load a tablet config from a file path
 */
export function loadConfig(configPath: string): Config {
  const fullPath = path.resolve(configPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Config file not found: ${fullPath}`);
  }

  const configString = fs.readFileSync(fullPath, 'utf-8');
  return Config.fromJSON(configString);
}

/**
 * Find a config file in a directory that matches a connected device
 *
 * @param configDir Directory containing JSON config files
 * @returns Path to matching config file, or null if not found
 */
export function findConfigForDevice(configDir: string): string | null {
  const resolvedDir = path.resolve(configDir);
  if (!fs.existsSync(resolvedDir) || !fs.statSync(resolvedDir).isDirectory()) {
    console.log(chalk.yellow(`[FindConfig] Config directory not found: ${configDir}`));
    return null;
  }

  // Get list of JSON files in directory
  const jsonFiles = fs.readdirSync(resolvedDir)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(resolvedDir, f));

  if (jsonFiles.length === 0) {
    console.log(chalk.yellow(`[FindConfig] No JSON files found in: ${configDir}`));
    return null;
  }

  // Get connected devices
  const devices = HID.devices() as Array<{
    vendorId: number;
    productId: number;
    usagePage?: number;
  }>;

  // Filter to likely tablet devices (digitizer usage page or known vendors)
  const tabletVendors = [0x056a, 0x28bd, 0x256c, 0x2179, 0x5543]; // Wacom, XP-Pen, Huion, Parblo, UC-Logic
  const tabletDevices = devices.filter(d =>
    d.usagePage === 13 || tabletVendors.includes(d.vendorId)
  );

  if (tabletDevices.length === 0) {
    console.log(chalk.yellow('[FindConfig] No tablet devices found'));
    return null;
  }

  // Get unique vendor/product pairs
  const devicePairs = new Set(
    tabletDevices.map(d => `${d.vendorId}:${d.productId}`)
  );
  console.log(chalk.gray(`[FindConfig] Found ${devicePairs.size} potential tablet device(s)`));

  // Search config files for matching device
  for (const jsonFile of jsonFiles) {
    try {
      const configString = fs.readFileSync(jsonFile, 'utf-8');
      const config = JSON.parse(configString);

      // Get device info from config
      const deviceInfo = config.deviceInfo || {};
      const configVid = deviceInfo.vendor_id;
      const configPid = deviceInfo.product_id;

      if (configVid === undefined || configPid === undefined) {
        continue;
      }

      // Check if this config matches any connected device
      const configKey = `${configVid}:${configPid}`;
      if (devicePairs.has(configKey)) {
        const configName = config.name || path.basename(jsonFile);
        console.log(chalk.green(`[FindConfig] ✓ Found matching config: ${configName}`));
        console.log(chalk.gray(`[FindConfig]   File: ${jsonFile}`));
        console.log(chalk.gray(`[FindConfig]   Device: 0x${configVid.toString(16)}:0x${configPid.toString(16)}`));
        return jsonFile;
      }
    } catch {
      // Skip invalid JSON files
      continue;
    }
  }

  console.log(chalk.yellow('[FindConfig] No matching config found for connected device(s)'));
  return null;
}

/**
 * Resolve config path - if it's a directory or has no extension, search for matching config
 *
 * @param configArg Config path argument (file or directory)
 * @param defaultDir Default directory to use if configArg has no extension
 * @returns Resolved config file path
 */
export function resolveConfigPath(configArg: string, defaultDir?: string): string {
  // If it's a file with .json extension, use it directly
  if (configArg.endsWith('.json')) {
    return configArg;
  }

  const configPath = path.resolve(configArg);

  // If it's a directory or has no extension, treat as directory
  const isDirectory = fs.existsSync(configPath) && fs.statSync(configPath).isDirectory();
  const hasNoExtension = !path.extname(configArg);

  if (isDirectory || hasNoExtension) {
    let searchDir = isDirectory ? configPath : configArg;

    // If path doesn't exist and no extension, use default directory
    if (!fs.existsSync(configPath) && defaultDir) {
      searchDir = defaultDir;
    }

    const foundConfig = findConfigForDevice(searchDir);
    if (foundConfig) {
      return foundConfig;
    } else {
      throw new Error(`No matching config found in directory: ${searchDir}`);
    }
  }

  // Otherwise treat as file path
  return configArg;
}

/**
 * Create a mock HID reader based on config
 */
export function createMockReader(config: Config): IHIDReader {
  return createMockHIDReader({
    productName: 'Mock Tablet',
    vendorId: config.deviceInfo?.vendor_id || 0x0000,  // Use config value or generic mock ID
    productId: config.deviceInfo?.product_id || 0x0000,
  });
}

/**
 * Auto-select the best interface based on config and available devices
 */
export function autoSelectInterface(devices: HIDDeviceInfo[], config: Config): HIDDeviceInfo {
  const digitizerUsagePage = config.modes?.[0]?.digitizerUsagePage ?? 13;

  // Priority:
  // 1. Vendor-specific interface (usagePage >= 0xFF00) - often required on macOS
  // 2. Match digitizerUsagePage from mode config
  // 3. Standard digitizer pen interface (usagePage 13, usage 2)
  // 4. Any digitizer interface (usagePage 13)
  // 5. First available interface

  const vendorSpecific = devices.find(d => d.usagePage && d.usagePage >= 0xFF00);
  const usagePageMatch = devices.find(d => d.usagePage === digitizerUsagePage);
  const digitizerPen = devices.find(d => d.usagePage === 13 && d.usage === 2);
  const anyDigitizer = devices.find(d => d.usagePage === 13);

  const device = vendorSpecific || usagePageMatch || digitizerPen || anyDigitizer || devices[0];

  if (vendorSpecific) {
    console.log(chalk.yellow('Note: Using vendor-specific interface'));
  } else if (usagePageMatch && digitizerUsagePage !== 13) {
    console.log(chalk.green(`Using interface matching digitizerUsagePage: ${digitizerUsagePage}`));
  }

  return device;
}

/**
 * Initialize a real HID device reader based on config
 */
export async function initializeRealDevice(config: Config, options?: Partial<NodeHIDReaderOptions>): Promise<IHIDReader> {
  const vendorId = config.deviceInfo?.vendor_id;
  const productId = config.deviceInfo?.product_id;

  if (!vendorId || !productId) {
    throw new Error('Config must include deviceInfo.vendor_id and deviceInfo.product_id');
  }

  console.log(chalk.gray(`Searching for device 0x${vendorId.toString(16)}:0x${productId.toString(16)}...`));

  const manager = createNodeHIDManager();
  const readerOptions: NodeHIDReaderOptions = { exclusive: true, ...options };

  const devices = await manager.listDevices({ vendorId, productId });

  if (devices.length === 0) {
    throw new Error(`No device found with Vendor ID 0x${vendorId.toString(16)} and Product ID 0x${productId.toString(16)}`);
  }

  // Show all matching interfaces
  console.log(chalk.cyan('\nFound'), chalk.white(`${devices.length}`), chalk.cyan('interface(s):'));
  devices.forEach((d, i) => {
    const usageInfo = d.usagePage ? `usagePage:${d.usagePage} usage:${d.usage}` : 'no usage info';
    console.log(chalk.gray(`  ${i + 1}. ${d.productName} - ${usageInfo}`));
  });
  console.log();

  const configInterfaces = config.deviceInfo?.interfaces || [];
  let reader: IHIDReader;

  if (configInterfaces.length > 1) {
    // Config has multiple interfaces recorded from walkthrough
    const matchingDevices: HIDDeviceInfo[] = [];
    const seenUsagePages = new Set<number>();

    // Sort to prefer vendor-specific interfaces (>=0xFF00) - more likely to open on macOS
    const sortedDevices = [...devices].sort((a, b) => {
      const aVendor = (a.usagePage ?? 0) >= 0xFF00 ? 0 : 1;
      const bVendor = (b.usagePage ?? 0) >= 0xFF00 ? 0 : 1;
      if (aVendor !== bVendor) return aVendor - bVendor;

      // For usagePage 1, prefer keyboard (usage:6) for express keys
      if (a.usagePage === 1 && b.usagePage === 1) {
        const aKeyboard = a.usage === 6 ? 0 : 1;
        const bKeyboard = b.usage === 6 ? 0 : 1;
        return aKeyboard - bKeyboard;
      }
      return 0;
    });

    for (const d of sortedDevices) {
      if (d.usagePage !== undefined &&
        configInterfaces.includes(d.usagePage) &&
        !seenUsagePages.has(d.usagePage)) {
        matchingDevices.push(d);
        seenUsagePages.add(d.usagePage);
      }
    }

    if (matchingDevices.length > 0) {
      console.log(chalk.green(`Opening ${matchingDevices.length} interface(s) from config:`));
      matchingDevices.forEach(d => {
        console.log(chalk.gray(`  usagePage:${d.usagePage} usage:${d.usage}`));
      });

      try {
        reader = new MultiInterfaceReader(matchingDevices, readerOptions);
        await reader.open();
      } catch {
        // Multi-interface failed (common on macOS where system locks standard interfaces)
        console.log(chalk.yellow('\nMulti-interface failed, falling back to auto-select...'));
        const device = autoSelectInterface(devices, config);
        reader = await manager.openDevice(device, readerOptions);
        await reader.open();
      }
    } else {
      // Fallback: config interfaces don't match available devices
      console.log(chalk.yellow('Config interfaces not found, falling back to auto-select...'));
      const device = autoSelectInterface(devices, config);
      reader = await manager.openDevice(device, readerOptions);
      await reader.open();
    }
  } else {
    // Single interface or no config - auto-select best one
    const device = autoSelectInterface(devices, config);
    console.log(chalk.cyan('Using:'), chalk.white(`${device.productName}`));
    console.log(chalk.gray(`  usagePage: ${device.usagePage}, usage: ${device.usage}`));

    reader = await manager.openDevice(device, readerOptions);
    await reader.open();
  }

  console.log(chalk.gray('Device opened.'));
  return reader;
}

/**
 * Convert raw processDeviceData output to normalized TabletEventData
 */
export function normalizeTabletEvent(events: Record<string, string | number | boolean>): TabletEventData {
  const tiltX = typeof events.tiltX === 'number' ? events.tiltX : 0;
  const tiltY = typeof events.tiltY === 'number' ? events.tiltY : 0;
  const tiltXY = Math.sqrt(tiltX * tiltX + tiltY * tiltY) * Math.sign(tiltX * tiltY || 1);

  return {
    state: String(events.state ?? 'unknown'),
    x: typeof events.x === 'number' ? events.x : 0,
    y: typeof events.y === 'number' ? events.y : 0,
    pressure: typeof events.pressure === 'number' ? events.pressure : 0,
    tiltX,
    tiltY,
    tiltXY: Math.min(1, Math.max(-1, tiltXY)),
    primaryButtonPressed: Boolean(events.primaryButton || events.primaryButtonPressed),
    secondaryButtonPressed: Boolean(events.secondaryButton || events.secondaryButtonPressed),
    tabletButtons: typeof events.tabletButtons === 'number' ? events.tabletButtons : 0,
    button1: Boolean(events.button1),
    button2: Boolean(events.button2),
    button3: Boolean(events.button3),
    button4: Boolean(events.button4),
    button5: Boolean(events.button5),
    button6: Boolean(events.button6),
    button7: Boolean(events.button7),
    button8: Boolean(events.button8),
  };
}

/**
 * Context for packet processing - tracks current mode for multi-mode configs
 */
export interface PacketProcessingContext {
  currentMode: any;
}

/**
 * Process a raw packet through the config mappings
 * This is a standalone function that can be used without extending TabletReaderBase
 *
 * @param data The raw packet data
 * @param configData The tablet configuration
 * @param context Mutable context for tracking current mode (will be updated if mode is detected)
 * @param reportId Optional Report ID (if not included in data)
 * @param interfaceType Optional HID interface type ('keyboard', 'digitizer', 'other')
 * @returns Processed event data
 */
export function processPacketWithConfig(
  data: Uint8Array,
  configData: Config,
  context: PacketProcessingContext,
  reportId?: number,
  interfaceType?: HIDInterfaceType
): Record<string, string | number | boolean> {
  if (data.length === 0) {
    return {};
  }

  // Extract report ID from first byte if not provided
  const rid = reportId !== undefined ? reportId : data[0];

  // Check if any mode has this as a buttonInterfaceReportId with tabletButtons config
  // XP-Pen tablets use tabletButtons (scan codes), while Huion uses keyboardButtons (modifier + keycode)
  const hasTabletButtonsForReportId = configData.modes?.some(mode =>
    mode.buttonInterfaceReportId === rid &&
    mode.byteCodeMappings?.tabletButtons
  ) ?? false;

  // Check if this is a keyboard interface packet
  // Use interfaceType if available, otherwise fall back to checking report IDs (3, 4, 5)
  const isKeyboardPacket = interfaceType === 'keyboard' ||
    (interfaceType === undefined && (rid === 3 || rid === 4 || rid === 5));

  // Only route to processKeyboardButtonData if it's a keyboard packet AND NOT using tabletButtons config
  if (isKeyboardPacket && !hasTabletButtonsForReportId) {
    // Try to find keyboardButtons config in any mode
    let keyboardButtonsConfig: KeyboardButtonsConfig | null = null;
    for (const mode of configData.modes) {
      const kbConfig = mode.byteCodeMappings?.keyboardButtons;
      if (kbConfig && kbConfig.buttons) {
        keyboardButtonsConfig = kbConfig as KeyboardButtonsConfig;
        break;
      }
    }

    if (keyboardButtonsConfig) {
      return processKeyboardButtonData(data, keyboardButtonsConfig);
    }
    // If no keyboard buttons config, fall through to normal processing
  }

  // For multi-mode configs, get Report ID and appropriate mappings
  let mappings;
  let buttonInterfaceReportId;

  // Check if this is a multi-mode config (more than one mode)
  const isMultiMode = configData.modes && configData.modes.length > 1;

  if (isMultiMode) {
    // First try to find mode by main report ID
    let mode = configData.getModeByReportId(rid);

    // If found by main report ID, this becomes the current mode
    if (mode && context.currentMode === null) {
      context.currentMode = mode;
      console.log(chalk.green(`\n✓ Detected device mode: `) + chalk.cyan.bold(`Report ID ${rid}`));
      if (mode.capabilities?.resolution) {
        console.log(chalk.cyan(`  Resolution: `) + chalk.white(`${mode.capabilities.resolution.x}x${mode.capabilities.resolution.y}\n`));
      }
    }

    // If not found by main report ID, check if this is a button interface report ID
    // IMPORTANT: Check current mode first to avoid ambiguity when multiple modes share the same buttonInterfaceReportId
    if (!mode && rid !== undefined) {
      // First check if it matches the current mode's button interface
      if (context.currentMode && context.currentMode.buttonInterfaceReportId === rid) {
        mode = context.currentMode;
      }
      // If not, search all modes (fallback for first button packet before stylus packet)
      else if (configData.modes) {
        // Find all modes with matching buttonInterfaceReportId
        const matchingModes = configData.modes.filter(m => m.buttonInterfaceReportId === rid);

        if (matchingModes.length === 1) {
          mode = matchingModes[0];
        } else if (matchingModes.length > 1) {
          // Multiple modes share the same buttonInterfaceReportId
          // Try to detect which mode based on the button data (scan code at byte index 2)
          const tabletButtonsMapping = data.length > 2 ? data[2] : 0;

          // Find mode whose tabletButtons config contains this scan code
          for (const candidateMode of matchingModes) {
            const tabletButtons = candidateMode.byteCodeMappings?.tabletButtons;
            if (tabletButtons?.values) {
              const scanCodeStr = String(tabletButtonsMapping);
              if (tabletButtons.values[scanCodeStr]) {
                mode = candidateMode;
                // Set currentMode so future packets use the same mode
                if (context.currentMode === null) {
                  context.currentMode = mode;
                  console.log(chalk.green(`\n✓ Detected device mode from button data: `) +
                    chalk.cyan.bold(`buttonInterfaceReportId ${rid}, scan code ${tabletButtonsMapping}`));
                }
                break;
              }
            }
          }

          // Fallback to first matching mode if no scan code match
          if (!mode) {
            mode = matchingModes[0];
          }
        }
      }
    }

    if (mode) {
      mappings = mode.byteCodeMappings;
      buttonInterfaceReportId = mode.buttonInterfaceReportId;
    } else {
      // Unknown Report ID, return empty result
      return {};
    }
  } else {
    // Single-mode config - use first mode
    const mode = configData.modes[0];
    mappings = mode?.byteCodeMappings;
    buttonInterfaceReportId = mode?.buttonInterfaceReportId;
  }

  return processDeviceData(data, mappings, 0, {
    buttonInterfaceReportId,
  });
}

/**
 * Abstract base class for tablet readers (event-viewer, websocket-server, etc.)
 *
 * Supports two initialization modes:
 * 1. Immediate: Pass configPath to constructor - config is loaded immediately
 * 2. Deferred: Pass configDir to constructor - config is loaded when device is detected
 */
export abstract class TabletReaderBase {
  protected reader: IHIDReader | null = null;
  protected configData: Config | null = null;
  protected configDir: string | null = null;
  protected isMockMode: boolean;
  protected exitOnStop: boolean;
  protected packetCount = 0;
  protected currentGestureIndex = 0;
  protected gestureTimer: NodeJS.Timeout | null = null;
  protected reconnectTimer: NodeJS.Timeout | null = null;
  protected reconnectCheckInterval: NodeJS.Timeout | null = null;
  protected isReconnecting = false;
  protected reconnectAttempts = 0;
  protected maxReconnectAttempts = 30; // More attempts with faster polling
  protected reconnectBaseInterval = 500; // Start with 500ms
  protected reconnectMaxInterval = 5000; // Cap at 5 seconds
  protected deviceCheckInterval = 200; // Check for device every 200ms when disconnected

  // Multi-mode support
  protected currentMode: any = null;
  protected detectedReportId: number | null = null;

  /**
   * Create a TabletReaderBase instance.
   *
   * @param configPath - Path to a specific config file (optional if configDir is provided in options)
   * @param options - Reader options including configDir for auto-detection
   *
   * If configPath is provided, the config is loaded immediately.
   * If only configDir is provided (via options), the reader starts without a config
   * and will auto-detect the device when startDevicePolling() is called.
   */
  constructor(configPath: string | null, options: TabletReaderOptions) {
    this.isMockMode = options.mock ?? false;
    this.exitOnStop = options.exitOnStop ?? true;
    this.configDir = options.configDir ?? null;

    if (configPath) {
      this.configData = loadConfig(configPath);
    }
  }

  /**
   * Check if a config has been loaded
   */
  protected hasConfig(): boolean {
    return this.configData !== null;
  }

  /**
   * Load config for a detected device. Called during auto-detection.
   * @returns true if config was loaded successfully
   */
  protected loadConfigForDetectedDevice(): boolean {
    if (!this.configDir) {
      return false;
    }

    const configPath = findConfigForDevice(this.configDir);
    if (configPath) {
      this.configData = loadConfig(configPath);
      return true;
    }
    return false;
  }

  /**
   * Print the application header banner
   */
  protected printHeader(title: string): void {
    console.log(chalk.blue.bold('╔════════════════════════════════════════════════════════════╗'));
    console.log(chalk.blue.bold('║           ') + chalk.blue.bold(title.padEnd(48)) + chalk.blue.bold('║'));
    console.log(chalk.blue.bold('╚════════════════════════════════════════════════════════════╝'));
    console.log();

    if (this.configData) {
      console.log(chalk.cyan('Config:'), chalk.white(this.configData.name || 'Unknown'));
      console.log(chalk.cyan('Mode:'), this.isMockMode ? chalk.yellow('Mock Data') : chalk.green('Real Device'));

      if (!this.isMockMode) {
        const vid = this.configData.deviceInfo?.vendor_id;
        const pid = this.configData.deviceInfo?.product_id;
        console.log(chalk.cyan('Device IDs:'), chalk.white(`0x${vid?.toString(16) || '?'} : 0x${pid?.toString(16) || '?'}`));
      }
    } else {
      console.log(chalk.cyan('Config:'), chalk.yellow('Waiting for device...'));
      console.log(chalk.cyan('Mode:'), chalk.yellow('Auto-detect'));
    }
    console.log();
  }

  /**
   * Initialize the HID reader (mock or real)
   * Requires configData to be loaded first
   */
  protected async initializeReader(): Promise<void> {
    if (!this.configData) {
      throw new Error('Cannot initialize reader: no config loaded');
    }

    if (this.isMockMode) {
      this.reader = createMockReader(this.configData);
    } else {
      this.reader = await initializeRealDevice(this.configData, {
        onDisconnect: () => this.handleDeviceDisconnect()
      });
    }
  }

  /**
   * Start the mock gesture cycling demo
   */
  protected startMockGestureCycle(): void {
    console.log(chalk.yellow('Mock gesture cycle starting...'));
    console.log(chalk.gray('Gestures will cycle automatically\n'));
    this.playNextGesture();
  }

  /**
   * Play the next gesture in the mock cycle
   */
  protected async playNextGesture(): Promise<void> {
    if (!this.reader || !(this.reader instanceof MockHIDReader)) return;

    const gesture = MOCK_GESTURES[this.currentGestureIndex];
    console.log(chalk.yellow.bold(`▶ Playing: ${gesture.description}`));

    await (this.reader as MockHIDReader).playGestureForStep(gesture.name);

    this.gestureTimer = setTimeout(() => {
      this.currentGestureIndex = (this.currentGestureIndex + 1) % MOCK_GESTURES.length;
      this.playNextGesture();
    }, gesture.duration + 500);
  }

  /**
   * Set up graceful shutdown handlers
   */
  protected setupShutdownHandlers(): void {
    const cleanup = async () => {
      await this.stop();
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('uncaughtException', async (err) => {
      console.error(chalk.red('\nUncaught exception:'), err.message);
      await cleanup();
    });
    process.on('unhandledRejection', async (reason) => {
      console.error(chalk.red('\nUnhandled rejection:'), reason);
      await cleanup();
    });
  }

  /**
   * Process a raw packet through the config mappings
   * @param data The raw packet data
   * @param reportId Optional Report ID (if not included in data)
   * @param interfaceType Optional HID interface type ('keyboard', 'digitizer', 'other')
   */
  protected processPacket(data: Uint8Array, reportId?: number, interfaceType?: HIDInterfaceType): Record<string, string | number | boolean> {
    if (!this.configData) {
      return {};
    }

    // Create a context object that wraps our currentMode
    // The standalone function will update context.currentMode, and we sync it back
    const context: PacketProcessingContext = { currentMode: this.currentMode };

    const result = processPacketWithConfig(data, this.configData, context, reportId, interfaceType);

    // Sync the currentMode back from the context
    if (context.currentMode !== this.currentMode) {
      this.currentMode = context.currentMode;
      if (this.currentMode) {
        this.detectedReportId = this.currentMode.reportId ?? null;
      }
    }

    return result;
  }

  /**
   * Handle a received packet - override in subclasses
   * @param data The raw packet data
   * @param reportId Optional Report ID
   * @param interfaceType Optional HID interface type ('keyboard', 'digitizer', 'other')
   */
  protected abstract handlePacket(data: Uint8Array, reportId?: number, interfaceType?: HIDInterfaceType): void;

  /**
   * Start the reader - override in subclasses for additional setup
   */
  abstract start(): Promise<void>;

  /**
   * Stop the reader and clean up
   */
  async stop(): Promise<void> {
    console.log(chalk.yellow('\nStopping...'));

    if (this.gestureTimer) {
      clearTimeout(this.gestureTimer);
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.reconnectCheckInterval) {
      clearInterval(this.reconnectCheckInterval);
    }

    if (this.reader) {
      this.reader.stopReading();
      try {
        await this.reader.close();
        console.log(chalk.gray('Device closed.'));
      } catch {
        // Ignore close errors
      }
    }

    console.log(chalk.green(`✓ Processed ${this.packetCount} packets`));

    // Only exit process if not in test mode
    if (this.exitOnStop) {
      process.exit(0);
    }
  }

  /**
   * Handle device disconnection
   */
  protected handleDeviceDisconnect(): void {
    console.log(chalk.red('\n⚠ Device disconnected!'));

    if (this.reader) {
      this.reader.stopReading();
      this.reader = null;
    }

    // Reset mode tracking
    this.currentMode = null;
    this.detectedReportId = null;

    // In deferred mode (configDir set), clear the config so we can auto-detect
    // a potentially different device on reconnect
    if (this.configDir) {
      this.configData = null;
    }

    // Start device polling for reconnection
    if (!this.isReconnecting) {
      this.reconnectAttempts = 0;
      this.startDevicePolling();
    }
  }

  /**
   * Start polling for device presence
   * More elegant than blind retries - we check if device is actually back
   */
  protected startDevicePolling(): void {
    if (this.reconnectCheckInterval) {
      clearInterval(this.reconnectCheckInterval);
    }

    console.log(chalk.yellow('Waiting for device to be reconnected...'));
    console.log(chalk.gray('(Checking every 200ms)'));

    this.reconnectCheckInterval = setInterval(async () => {
      this.reconnectAttempts++;

      // Check if device is present
      if (await this.isDevicePresent()) {
        // Device detected! Stop polling and attempt connection
        if (this.reconnectCheckInterval) {
          clearInterval(this.reconnectCheckInterval);
          this.reconnectCheckInterval = null;
        }

        console.log(chalk.green('✓ Device detected!'));
        await this.attemptReconnect();
      } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        // Give up after max attempts
        if (this.reconnectCheckInterval) {
          clearInterval(this.reconnectCheckInterval);
          this.reconnectCheckInterval = null;
        }

        const totalTime = (this.maxReconnectAttempts * this.deviceCheckInterval) / 1000;
        console.log(chalk.red(`✗ Device not found after ${totalTime}s`));
        console.log(chalk.yellow('Please reconnect the device and restart the application.'));
      }
    }, this.deviceCheckInterval);
  }

  /**
   * Check if the device is physically present in the system.
   *
   * If configData is loaded, checks for that specific device.
   * If no configData but configDir is set, uses findConfigForDevice to check for any supported device.
   */
  protected async isDevicePresent(): Promise<boolean> {
    try {
      // If we have a config, check for that specific device
      if (this.configData) {
        const vendorId = this.configData.deviceInfo?.vendor_id;
        const productId = this.configData.deviceInfo?.product_id;

        if (!vendorId || !productId) {
          return false;
        }

        const manager = createNodeHIDManager();
        const devices = await manager.listDevices({ vendorId, productId });
        return devices.length > 0;
      }

      // No config loaded - check if any supported device is present using findConfigForDevice
      if (this.configDir) {
        const configPath = findConfigForDevice(this.configDir);
        return configPath !== null;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Attempt to reconnect to the device
   * Called after device presence is confirmed.
   *
   * If no config is loaded yet (deferred initialization mode), this will
   * attempt to load the config for the detected device first.
   */
  protected async attemptReconnect(): Promise<void> {
    if (this.isReconnecting) return;

    this.isReconnecting = true;

    console.log(chalk.yellow('Attempting to reconnect...'));

    try {
      // If no config loaded yet, try to load one for the detected device
      if (!this.configData) {
        if (!this.loadConfigForDetectedDevice()) {
          throw new Error('No config found for detected device');
        }
        // configData is now guaranteed to be set by loadConfigForDetectedDevice
        console.log(chalk.green(`✓ Loaded config: ${this.configData!.name || 'Unknown'}`));
      }

      // Reset mode tracking for new connection
      this.currentMode = null;
      this.detectedReportId = null;

      // Try to reinitialize the device
      await this.initializeReader();

      if (!this.reader) {
        throw new Error('Failed to initialize reader');
      }

      // Restart reading
      this.reader.startReading((data, reportId, interfaceType) => {
        this.handlePacket(data, reportId, interfaceType);
      });

      console.log(chalk.green('✓ Device reconnected successfully!'));
      this.isReconnecting = false;
      this.reconnectAttempts = 0;

      // Notify subclasses that device is connected
      this.onDeviceConnected();

    } catch (error) {
      // Reconnection failed even though device was detected
      // This can happen if device is still initializing
      this.isReconnecting = false;

      // Use exponential backoff for retry
      const backoffTime = Math.min(
        this.reconnectBaseInterval * Math.pow(1.5, this.reconnectAttempts),
        this.reconnectMaxInterval
      );

      console.log(chalk.gray(`Connection failed, retrying in ${Math.round(backoffTime)}ms...`));

      this.reconnectTimer = setTimeout(async () => {
        if (await this.isDevicePresent()) {
          await this.attemptReconnect();
        } else {
          // Device disappeared again, restart polling
          console.log(chalk.yellow('Device disappeared, resuming polling...'));
          this.startDevicePolling();
        }
      }, backoffTime);
    }
  }

  /**
   * Called when a device is successfully connected (or reconnected).
   * Override in subclasses to perform additional setup.
   */
  protected onDeviceConnected(): void {
    // Default implementation does nothing
    // Subclasses can override to send status updates, etc.
  }
}