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
import { processDeviceData } from '../utils/data-helpers.js';
import { MockHIDReader, createMockHIDReader } from '../core/hid/mock-hid-reader.js';
import type { IHIDReader, HIDDeviceInfo } from '../core/hid/hid-interface.js';
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
  const configUsagePage = config.deviceInfo?.usage_page;
  const configUsage = config.deviceInfo?.usage;

  // Priority:
  // 1. Match config's deviceInfo.usage_page and usage (from walkthrough)
  // 2. Vendor-specific interface (usagePage >= 0xFF00) - often required on macOS
  // 3. Standard digitizer pen interface (usagePage 13, usage 2)
  // 4. Any digitizer interface (usagePage 13)
  // 5. First available interface

  const configMatch = configUsagePage !== undefined && configUsage !== undefined
    ? devices.find(d => d.usagePage === configUsagePage && d.usage === configUsage)
    : undefined;

  const vendorSpecific = devices.find(d => d.usagePage && d.usagePage >= 0xFF00);
  const digitizerPen = devices.find(d => d.usagePage === 13 && d.usage === 2);
  const anyDigitizer = devices.find(d => d.usagePage === 13);

  const device = configMatch || vendorSpecific || digitizerPen || anyDigitizer || devices[0];

  if (configMatch) {
    console.log(chalk.green(`Using interface from config: usagePage:${configUsagePage} usage:${configUsage}`));
  } else if (vendorSpecific) {
    console.log(chalk.yellow('Note: Using vendor-specific interface'));
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
 * Abstract base class for tablet readers (event-viewer, websocket-server, etc.)
 */
export abstract class TabletReaderBase {
  protected reader: IHIDReader | null = null;
  protected configData: Config;
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

  constructor(configPath: string, options: TabletReaderOptions) {
    this.isMockMode = options.mock ?? false;
    this.exitOnStop = options.exitOnStop ?? true;
    this.configData = loadConfig(configPath);
  }

  /**
   * Print the application header banner
   */
  protected printHeader(title: string): void {
    console.log(chalk.blue.bold('╔════════════════════════════════════════════════════════════╗'));
    console.log(chalk.blue.bold('║           ') + chalk.blue.bold(title.padEnd(48)) + chalk.blue.bold('║'));
    console.log(chalk.blue.bold('╚════════════════════════════════════════════════════════════╝'));
    console.log();
    console.log(chalk.cyan('Config:'), chalk.white(this.configData.name || 'Unknown'));
    console.log(chalk.cyan('Mode:'), this.isMockMode ? chalk.yellow('Mock Data') : chalk.green('Real Device'));

    if (!this.isMockMode) {
      const vid = this.configData.deviceInfo?.vendor_id;
      const pid = this.configData.deviceInfo?.product_id;
      console.log(chalk.cyan('Device IDs:'), chalk.white(`0x${vid?.toString(16) || '?'} : 0x${pid?.toString(16) || '?'}`));
    }
    console.log();
  }

  /**
   * Initialize the HID reader (mock or real)
   */
  protected async initializeReader(): Promise<void> {
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
   */
  protected processPacket(data: Uint8Array, reportId?: number): Record<string, string | number | boolean> {
    // For multi-mode configs, get Report ID and appropriate mappings
    let mappings;
    let buttonInterfaceReportId;

    if (this.configData.isMultiMode()) {
      // Use provided reportId, or extract from first byte if not provided
      const rid = reportId !== undefined ? reportId : (data.length > 0 ? data[0] : undefined);

      // First try to find mode by main report ID
      let mode = rid !== undefined ? this.configData.getModeByReportId(rid) : null;

      // If found by main report ID, this becomes the current mode
      if (mode && this.currentMode === null) {
        this.currentMode = mode;
        this.detectedReportId = rid ?? null;
        console.log(chalk.green(`\n✓ Detected device mode: `) + chalk.cyan.bold(`Report ID ${rid}`));
        if (mode.capabilities?.resolution) {
          console.log(chalk.cyan(`  Resolution: `) + chalk.white(`${mode.capabilities.resolution.x}x${mode.capabilities.resolution.y}\n`));
        }
      }

      // If not found by main report ID, check if this is a button interface report ID
      // IMPORTANT: Check current mode first to avoid ambiguity when multiple modes share the same buttonInterfaceReportId
      if (!mode && rid !== undefined) {
        // First check if it matches the current mode's button interface
        if (this.currentMode && this.currentMode.buttonInterfaceReportId === rid) {
          mode = this.currentMode;
        }
        // If not, search all modes (fallback for first button packet before stylus packet)
        else if (this.configData.modes) {
          mode = this.configData.modes.find(m => m.buttonInterfaceReportId === rid) || null;
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
      // Single-mode config
      mappings = this.configData.byteCodeMappings;
      buttonInterfaceReportId = this.configData.buttonInterfaceReportId;
    }

    return processDeviceData(data, mappings, 0, {
      buttonInterfaceReportId,
    });
  }

  /**
   * Handle a received packet - override in subclasses
   */
  protected abstract handlePacket(data: Uint8Array): void;

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
   * Check if the device is physically present in the system
   */
  protected async isDevicePresent(): Promise<boolean> {
    try {
      const vendorId = this.configData.deviceInfo?.vendor_id;
      const productId = this.configData.deviceInfo?.product_id;

      if (!vendorId || !productId) {
        return false;
      }

      const manager = createNodeHIDManager();
      const devices = await manager.listDevices({ vendorId, productId });
      return devices.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Attempt to reconnect to the device
   * Called after device presence is confirmed
   */
  protected async attemptReconnect(): Promise<void> {
    if (this.isReconnecting) return;

    this.isReconnecting = true;

    console.log(chalk.yellow('Attempting to reconnect...'));

    try {
      // Try to reinitialize the device
      await this.initializeReader();

      if (!this.reader) {
        throw new Error('Failed to initialize reader');
      }

      // Restart reading
      this.reader.startReading((data) => {
        this.handlePacket(data);
      });

      console.log(chalk.green('✓ Device reconnected successfully!'));
      this.isReconnecting = false;
      this.reconnectAttempts = 0;

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
}