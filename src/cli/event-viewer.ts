#!/usr/bin/env node
/**
 * CLI Tool: Stream Events
 * Converts raw HID byte data into tablet events using a config file
 * 
 * Usage:
 *   npx tsx src/cli/stream-events.ts --config path/to/config.json
 *   npx tsx src/cli/stream-events.ts --config path/to/config.json --mock
 */

import { program } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

import { Config } from '../models/config.js';
import { processDeviceData } from '../utils/data-helpers.js';
import { MockHIDReader, createMockHIDReader } from '../core/hid/mock-hid-reader.js';
import type { IHIDReader, HIDDeviceInfo } from '../core/hid/hid-interface.js';
import { NodeHIDDeviceManager, createNodeHIDManager, MultiInterfaceReader, type NodeHIDReaderOptions } from './node-hid-reader.js';

// Gesture sequence for mock data cycling
const MOCK_GESTURES = [
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
];

interface StreamOptions {
  config: string;
  mock?: boolean;
  raw?: boolean;
  compact?: boolean;
  live?: boolean;
}

export class EventStreamer {
  private reader: IHIDReader | null = null;
  private configData: Config;
  private isMockMode: boolean;
  private showRaw: boolean;
  private compactOutput: boolean;
  private liveMode: boolean;
  private packetCount = 0;
  private currentGestureIndex = 0;
  private gestureTimer: NodeJS.Timeout | null = null;
  
  // Live mode state
  private lastEvents: Record<string, string | number | boolean> = {};
  private lastRawData: Uint8Array = new Uint8Array(0);
  private lastLiveUpdate = 0;
  private lastDisplayedState: string | null = null;
  
  // Calibration tracking - track actual max values seen vs config
  private observedMaxX = 0;
  private observedMaxY = 0;
  private observedMaxPressure = 0;
  private calibrationWarnings: string[] = [];
  
  constructor(
    configPath: string,
    options: {
      mock?: boolean;
      raw?: boolean;
      compact?: boolean;
      live?: boolean;
    }
  ) {
    this.isMockMode = options.mock ?? false;
    this.showRaw = options.raw ?? false;
    this.compactOutput = options.compact ?? false;
    this.liveMode = options.live ?? false;

    // Load config
    const fullPath = path.resolve(configPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Config file not found: ${fullPath}`);
    }

    const configString = fs.readFileSync(fullPath, 'utf-8');
    this.configData = Config.fromJSON(configString);

    console.log(chalk.blue.bold('╔════════════════════════════════════════════════════════════╗'));
    console.log(chalk.blue.bold('║           Tablet Event Viewer                              ║'));
    console.log(chalk.blue.bold('╚════════════════════════════════════════════════════════════╝'));
    console.log();
    console.log(chalk.cyan('Config:'), chalk.white(this.configData.name || 'Unknown'));
    console.log(chalk.cyan('Mode:'), this.isMockMode ? chalk.yellow('Mock Data') : chalk.green('Real Device'));
    if (!this.isMockMode) {
      const vid = this.configData.deviceInfo?.vendor_id;
      const pid = this.configData.deviceInfo?.product_id;
      console.log(chalk.cyan('Device IDs:'), chalk.white(`0x${vid?.toString(16) || '?'} : 0x${pid?.toString(16) || '?'}`));
      console.log(chalk.cyan('Mode:'), chalk.yellow('Exclusive (mouse input suppressed)'));
    }
    console.log();

    // Create reader
    if (this.isMockMode) {
      this.reader = createMockHIDReader({
        productName: 'Mock Tablet',
        vendorId: this.configData.deviceInfo?.vendor_id || 0x28bd,
        productId: this.configData.deviceInfo?.product_id || 0x2904,
      });
    } else {
      const vendorId = this.configData.deviceInfo?.vendor_id;
      const productId = this.configData.deviceInfo?.product_id;

      if (!vendorId || !productId) {
        throw new Error('Config must include deviceInfo.vendor_id and deviceInfo.product_id');
      }

      // Will be initialized in start()
      this.vendorId = vendorId;
      this.productId = productId;
    }
  }

  private vendorId?: number;
  private productId?: number;

  async start(): Promise<void> {
    console.log(chalk.gray('Initializing...'));
    
    // Initialize reader for real device mode
    if (!this.isMockMode && !this.reader) {
      if (!this.vendorId || !this.productId) {
        throw new Error('Vendor ID and Product ID required for real device mode');
      }

      console.log(chalk.gray(`Searching for device 0x${this.vendorId.toString(16)}:0x${this.productId.toString(16)}...`));
      
      const manager = createNodeHIDManager();
      // Always open in exclusive mode to suppress mouse input
      const readerOptions: NodeHIDReaderOptions = {
        exclusive: true,
      };

      // Get all available interfaces for this device
      const devices = await manager.listDevices({
        vendorId: this.vendorId,
        productId: this.productId,
      });

      if (devices.length === 0) {
        throw new Error(`No device found with Vendor ID 0x${this.vendorId.toString(16)} and Product ID 0x${this.productId.toString(16)}`);
      }

      // Show all matching interfaces
      console.log(chalk.cyan('\nFound'), chalk.white(`${devices.length}`), chalk.cyan('interface(s) for this device:'));
      devices.forEach((d, i) => {
        const usageInfo = d.usagePage ? `usagePage:${d.usagePage} usage:${d.usage}` : 'no usage info';
        console.log(chalk.gray(`  ${i + 1}. ${d.productName} - ${usageInfo}`));
      });
      console.log();

      // Determine which interfaces to open
      const configInterfaces = this.configData.deviceInfo?.interfaces || [];
      
      if (configInterfaces.length > 1) {
        // Config has multiple interfaces recorded from walkthrough - open ONE per usagePage
        // On macOS, prefer vendor-specific interfaces (>=0xFF00) as standard ones are often locked
        const matchingDevices: typeof devices = [];
        const seenUsagePages = new Set<number>();
        
        // Sort to prefer:
        // 1. Vendor-specific interfaces (>=0xFF00) - more likely to open on macOS
        // 2. For usagePage 1: prefer usage:6 (keyboard) over usage:2 (mouse) for express keys
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
            this.reader = new MultiInterfaceReader(matchingDevices, readerOptions);
            await this.reader.open();
          } catch (error) {
            // Multi-interface failed (common on macOS where system locks standard interfaces)
            // Fall back to auto-select which prefers vendor-specific interfaces
            console.log(chalk.yellow('\nMulti-interface failed, falling back to auto-select...'));
            const device = this.autoSelectInterface(devices);
            this.reader = await manager.openDevice(device, readerOptions);
            await this.reader.open();
          }
        } else {
          // Fallback: config interfaces don't match available devices
          console.log(chalk.yellow('Config interfaces not found, falling back to auto-select...'));
          const device = this.autoSelectInterface(devices);
          this.reader = await manager.openDevice(device, readerOptions);
          await this.reader.open();
        }
      } else {
        // Single interface or no config - auto-select best one
        const device = this.autoSelectInterface(devices);
        console.log(chalk.cyan('Using:'), chalk.white(`${device.productName}`));
        console.log(chalk.gray(`  usagePage: ${device.usagePage}, usage: ${device.usage}`));
        
        this.reader = await manager.openDevice(device, readerOptions);
        await this.reader.open();
      }
      
      console.log(chalk.gray('Device opened.'));
    }

    if (!this.reader) {
      throw new Error('Reader not initialized');
    }

    // Start reading - set up callback BEFORE any data comes in
    console.log(chalk.gray('Setting up data callback...'));
    this.reader.startReading((data, _reportId) => {
      this.handlePacket(data);
    });

    console.log(chalk.green('✓ Started reading data'));
    console.log(chalk.gray('Press Ctrl+C to stop\n'));

    if (this.isMockMode) {
      this.startMockGestureCycle();
    }

    // Handle graceful shutdown - ensure device is properly closed
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

    // Keep process alive
    await new Promise(() => {});
  }

  /**
   * Auto-select the best interface when config doesn't specify multiple
   */
  private autoSelectInterface(devices: HIDDeviceInfo[]): HIDDeviceInfo {
    const configUsagePage = this.configData.deviceInfo?.usage_page;
    const configUsage = this.configData.deviceInfo?.usage;
    
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

  private handlePacket(data: Uint8Array): void {
    try {
      this.packetCount++;

      // Process the data using the config
      const events = processDeviceData(data, this.configData.byteCodeMappings);
      
      // Track raw values for calibration warnings
      this.trackRawValues(data);
      
      // Store for live mode
      this.lastEvents = events;
      this.lastRawData = data;

      // Format output
      if (this.liveMode) {
        this.printLive(events, data);
      } else if (this.compactOutput) {
        this.printCompact(events, data);
      } else {
        this.printDetailed(events, data);
      }
    } catch {
      // Silently ignore unexpected packet formats (e.g., tablet buttons on different interface)
    }
  }

  /**
   * Extract raw multi-byte values from data and track max values seen
   */
  private trackRawValues(data: Uint8Array): void {
    const dataList = Array.from(data);
    const mappings = this.configData.byteCodeMappings;
    
    // Extract raw X value
    const xMapping = mappings.x;
    if (xMapping && xMapping.type === 'multi-byte-range') {
      const indices = Array.isArray(xMapping.byteIndex) ? xMapping.byteIndex : [xMapping.byteIndex];
      let rawX = 0;
      for (let i = 0; i < indices.length; i++) {
        const idx = indices[i];
        if (idx >= 0 && idx < dataList.length) {
          rawX += dataList[idx] << (i * 8);
        }
      }
      if (rawX > this.observedMaxX) {
        this.observedMaxX = rawX;
        this.updateCalibrationWarnings();
      }
    }
    
    // Extract raw Y value
    const yMapping = mappings.y;
    if (yMapping && yMapping.type === 'multi-byte-range') {
      const indices = Array.isArray(yMapping.byteIndex) ? yMapping.byteIndex : [yMapping.byteIndex];
      let rawY = 0;
      for (let i = 0; i < indices.length; i++) {
        const idx = indices[i];
        if (idx >= 0 && idx < dataList.length) {
          rawY += dataList[idx] << (i * 8);
        }
      }
      if (rawY > this.observedMaxY) {
        this.observedMaxY = rawY;
        this.updateCalibrationWarnings();
      }
    }
    
    // Extract raw pressure value
    const pressureMapping = mappings.pressure;
    if (pressureMapping && pressureMapping.type === 'multi-byte-range') {
      const indices = Array.isArray(pressureMapping.byteIndex) ? pressureMapping.byteIndex : [pressureMapping.byteIndex];
      let rawPressure = 0;
      for (let i = 0; i < indices.length; i++) {
        const idx = indices[i];
        if (idx >= 0 && idx < dataList.length) {
          rawPressure += dataList[idx] << (i * 8);
        }
      }
      if (rawPressure > this.observedMaxPressure) {
        this.observedMaxPressure = rawPressure;
        this.updateCalibrationWarnings();
      }
    }
  }
  
  /**
   * Check if observed values exceed config max and generate warnings
   */
  private updateCalibrationWarnings(): void {
    this.calibrationWarnings = [];
    const mappings = this.configData.byteCodeMappings;
    
    const configMaxX = mappings.x?.max ?? 65535;
    const configMaxY = mappings.y?.max ?? 65535;
    const configMaxPressure = mappings.pressure?.max ?? 8191;
    
    if (this.observedMaxX > configMaxX) {
      this.calibrationWarnings.push(
        `X: config max=${configMaxX}, observed=${this.observedMaxX}`
      );
    }
    if (this.observedMaxY > configMaxY) {
      this.calibrationWarnings.push(
        `Y: config max=${configMaxY}, observed=${this.observedMaxY}`
      );
    }
    if (this.observedMaxPressure > configMaxPressure) {
      this.calibrationWarnings.push(
        `Pressure: config max=${configMaxPressure}, observed=${this.observedMaxPressure}`
      );
    }
  }

  private printCompact(events: Record<string, string | number | boolean>, data: Uint8Array): void {
    const parts: string[] = [];

    // Position
    if (events.x !== undefined && events.y !== undefined) {
      parts.push(`pos:(${events.x},${events.y})`);
    }

    // Pressure
    if (events.pressure !== undefined && events.pressure !== 0) {
      parts.push(`p:${events.pressure}`);
    }

    // Tilt
    if (events.tiltX !== undefined || events.tiltY !== undefined) {
      parts.push(`tilt:(${events.tiltX ?? 0},${events.tiltY ?? 0})`);
    }

    // State - always show it
    parts.push(`state:${events.state ?? 'unknown'}`);

    // Buttons (status config uses 'primaryButtonPressed' / 'secondaryButtonPressed')
    if (events.primaryButton || events.primaryButtonPressed) parts.push(chalk.magenta('BTN1'));
    if (events.secondaryButton || events.secondaryButtonPressed) parts.push(chalk.magenta('BTN2'));

    // Raw bytes (if enabled)
    if (this.showRaw) {
      const hex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ');
      parts.push(chalk.gray(`[${hex}]`));
    }

    process.stdout.write(`\r${chalk.gray(`#${this.packetCount}`)} ${parts.join(' ')}`.padEnd(120));
  }

  private printDetailed(
    events: Record<string, string | number | boolean>,
    data: Uint8Array
  ): void {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    const lines: string[] = [];

    lines.push(chalk.gray(`─────────────────────────────────────────────────────`));
    lines.push(chalk.cyan(`Packet #${this.packetCount}`) + chalk.gray(` @ ${timestamp}`));

    if (this.showRaw) {
      const hex = Array.from(data).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      lines.push(chalk.gray(`Raw: ${hex}`));
    }

    // State
    if (events.state) {
      const stateColor = events.state === 'contact' ? chalk.green :
                        events.state === 'hover' ? chalk.yellow :
                        events.state === 'buttons' ? chalk.magenta :
                        chalk.gray;
      lines.push(`  State: ${stateColor(String(events.state))}`);
    }

    // Position
    if (events.x !== undefined && events.y !== undefined) {
      const xPercent = typeof events.x === 'number' ? ((events.x / 65535) * 100).toFixed(1) : '?';
      const yPercent = typeof events.y === 'number' ? ((events.y / 65535) * 100).toFixed(1) : '?';
      lines.push(`  Position: ${chalk.white(`X: ${events.x}`)} (${xPercent}%) | ${chalk.white(`Y: ${events.y}`)} (${yPercent}%)`);
    }

    // Pressure
    if (events.pressure !== undefined) {
      const pressureValue = typeof events.pressure === 'number' ? events.pressure : 0;
      const pressurePercent = ((pressureValue / 8191) * 100).toFixed(1);
      const bar = this.createBar(pressureValue, 8191, 20);
      lines.push(`  Pressure: ${chalk.white(pressureValue)} (${pressurePercent}%) ${bar}`);
    }

    // Tilt (normalized -1 to 1)
    if (events.tiltX !== undefined || events.tiltY !== undefined) {
      const tiltX = typeof events.tiltX === 'number' ? events.tiltX.toFixed(2) : '0.00';
      const tiltY = typeof events.tiltY === 'number' ? events.tiltY.toFixed(2) : '0.00';
      lines.push(`  Tilt: X: ${chalk.white(tiltX)} | Y: ${chalk.white(tiltY)}`);
    }

    // Buttons (status config uses 'primaryButtonPressed' / 'secondaryButtonPressed')
    const buttons: string[] = [];
    if (events.primaryButton || events.primaryButtonPressed) buttons.push(chalk.magenta('Primary'));
    if (events.secondaryButton || events.secondaryButtonPressed) buttons.push(chalk.magenta('Secondary'));
    if (events.tabletButtons !== undefined && events.tabletButtons !== 0) {
      buttons.push(chalk.blue(`Express Key: ${events.tabletButtons}`));
    }
    if (buttons.length > 0) {
      lines.push(`  Buttons: ${buttons.join(' | ')}`);
    }

    // Output all lines at once using process.stdout.write for proper flushing
    process.stdout.write(lines.join('\n') + '\n');
  }

  private createBar(value: number, max: number, width: number): string {
    const filled = Math.round((value / max) * width);
    const empty = width - filled;
    return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  }

  /**
   * Live dashboard mode - updates in place without scrolling
   */
  private printLive(
    events: Record<string, string | number | boolean>,
    data: Uint8Array
  ): void {
    // Throttle to ~10fps, but always update on state change
    const now = Date.now();
    const currentState = String(events.state ?? 'unknown');
    const stateChanged = currentState !== this.lastDisplayedState;
    
    if (!stateChanged && now - this.lastLiveUpdate < 100) {
      return;  // Skip this update (throttled and no state change)
    }
    this.lastLiveUpdate = now;
    this.lastDisplayedState = currentState;
    
    // ANSI codes
    const HIDE_CURSOR = '\x1b[?25l';
    const CLEAR_LINE = '\x1b[2K';

    // Get config max values for calibration warnings
    const mappings = this.configData.byteCodeMappings;
    const configMaxX = mappings.x?.max ?? 65535;
    const configMaxY = mappings.y?.max ?? 65535;
    const configMaxPressure = mappings.pressure?.max ?? 8191;
    
    // Check for calibration issues
    const xMiscalibrated = this.observedMaxX > configMaxX;
    const yMiscalibrated = this.observedMaxY > configMaxY;
    const pressureMiscalibrated = this.observedMaxPressure > configMaxPressure;
    const hasMiscalibration = xMiscalibrated || yMiscalibrated || pressureMiscalibrated;

    // Build the display
    const lines: string[] = [];
    
    // Header
    lines.push(chalk.cyan.bold('┌─────────────────────────────────────────────────────────────┐'));
    lines.push(chalk.cyan.bold('│') + chalk.white.bold('                    TABLET LIVE VIEW                         ') + chalk.cyan.bold('│'));
    lines.push(chalk.cyan.bold('├─────────────────────────────────────────────────────────────┤'));
    
    // Packet counter
    const packetStr = `Packets: ${this.packetCount}`.padEnd(20);
    const stateValue = events.state ?? 'unknown';
    const stateColor = stateValue === 'contact' ? chalk.green.bold :
                      stateValue === 'hover' ? chalk.yellow.bold :
                      stateValue === 'buttons' ? chalk.magenta.bold :
                      chalk.gray;
    const stateStr = `State: ${stateColor(String(stateValue).padEnd(10))}`;
    lines.push(chalk.cyan.bold('│') + ` ${packetStr} ${stateStr}`.padEnd(61) + chalk.cyan.bold('│'));
    
    lines.push(chalk.cyan.bold('├─────────────────────────────────────────────────────────────┤'));
    
    // Get normalized values (0-1 range, can exceed 1 if miscalibrated)
    const xNorm = typeof events.x === 'number' ? events.x : 0;
    const yNorm = typeof events.y === 'number' ? events.y : 0;
    const pressureNorm = typeof events.pressure === 'number' ? events.pressure : 0;
    
    // Position section with warning indicators
    const posLabel = hasMiscalibration && (xMiscalibrated || yMiscalibrated) 
      ? ` Position ${chalk.yellow.bold('⚠ RECALIBRATE')}`
      : ` Position`;
    lines.push(chalk.cyan.bold('│') + posLabel.padEnd(61) + chalk.cyan.bold('│'));
    
    // X coordinate
    const xWarning = xMiscalibrated ? chalk.red.bold('!') : ' ';
    const xValueStr = xNorm > 1 
      ? chalk.red.bold((xNorm * 100).toFixed(0) + '%') 
      : chalk.white((xNorm * 100).toFixed(1) + '%');
    lines.push(chalk.cyan.bold('│') + `  ${xWarning}X: ${xValueStr.padStart(7)}  ${this.createBarWithOverflow(xNorm, 30)} ` + chalk.cyan.bold('│'));
    
    // Y coordinate
    const yWarning = yMiscalibrated ? chalk.red.bold('!') : ' ';
    const yValueStr = yNorm > 1 
      ? chalk.red.bold((yNorm * 100).toFixed(0) + '%') 
      : chalk.white((yNorm * 100).toFixed(1) + '%');
    lines.push(chalk.cyan.bold('│') + `  ${yWarning}Y: ${yValueStr.padStart(7)}  ${this.createBarWithOverflow(yNorm, 30)} ` + chalk.cyan.bold('│'));
    
    // Pressure section
    const pressureLabel = pressureMiscalibrated 
      ? ` Pressure ${chalk.yellow.bold('⚠')}`
      : ` Pressure`;
    lines.push(chalk.cyan.bold('│') + pressureLabel.padEnd(61) + chalk.cyan.bold('│'));
    
    const pWarning = pressureMiscalibrated ? chalk.red.bold('!') : ' ';
    const pValueStr = pressureNorm > 1 
      ? chalk.red.bold((pressureNorm * 100).toFixed(0) + '%') 
      : chalk.white((pressureNorm * 100).toFixed(1) + '%');
    lines.push(chalk.cyan.bold('│') + `  ${pWarning}${pValueStr.padStart(8)}  ${this.createBarWithOverflow(pressureNorm, 30)} ` + chalk.cyan.bold('│'));
    
    // Tilt (normalized -1 to 1)
    const tiltX = typeof events.tiltX === 'number' ? events.tiltX : 0;
    const tiltY = typeof events.tiltY === 'number' ? events.tiltY : 0;
    lines.push(chalk.cyan.bold('│') + ` Tilt                                                        ` + chalk.cyan.bold('│'));
    lines.push(chalk.cyan.bold('│') + `   X: ${chalk.white(tiltX.toFixed(2).padStart(6))}    Y: ${chalk.white(tiltY.toFixed(2).padStart(6))}                              ` + chalk.cyan.bold('│'));
    
    // Buttons (status config uses 'primaryButtonPressed' / 'secondaryButtonPressed')
    const btnPrimary = (events.primaryButton || events.primaryButtonPressed) ? chalk.green.bold('●') : chalk.gray('○');
    const btnSecondary = (events.secondaryButton || events.secondaryButtonPressed) ? chalk.green.bold('●') : chalk.gray('○');
    const tabletBtn = events.tabletButtons ?? 0;
    lines.push(chalk.cyan.bold('│') + ` Buttons                                                     ` + chalk.cyan.bold('│'));
    lines.push(chalk.cyan.bold('│') + `   Primary: ${btnPrimary}  Secondary: ${btnSecondary}  Express Keys: ${chalk.white(String(tabletBtn).padStart(2))}          ` + chalk.cyan.bold('│'));
    
    // Calibration warning section
    if (hasMiscalibration) {
      lines.push(chalk.yellow.bold('├─────────────────────────────────────────────────────────────┤'));
      lines.push(chalk.yellow.bold('│') + chalk.yellow(' ⚠  CONFIG NEEDS RECALIBRATION                               ') + chalk.yellow.bold('│'));
      lines.push(chalk.yellow.bold('│') + chalk.gray(' Values exceed config max. Run walkthrough with full range:  ') + chalk.yellow.bold('│'));
      
      if (xMiscalibrated) {
        const xInfo = `  X: max=${configMaxX} but saw ${this.observedMaxX}`.padEnd(59);
        lines.push(chalk.yellow.bold('│') + chalk.red(xInfo) + chalk.yellow.bold('│'));
      }
      if (yMiscalibrated) {
        const yInfo = `  Y: max=${configMaxY} but saw ${this.observedMaxY}`.padEnd(59);
        lines.push(chalk.yellow.bold('│') + chalk.red(yInfo) + chalk.yellow.bold('│'));
      }
      if (pressureMiscalibrated) {
        const pInfo = `  Pressure: max=${configMaxPressure} but saw ${this.observedMaxPressure}`.padEnd(59);
        lines.push(chalk.yellow.bold('│') + chalk.red(pInfo) + chalk.yellow.bold('│'));
      }
    }
    
    // Raw bytes (if enabled)
    if (this.showRaw) {
      const hex = Array.from(data).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      lines.push(chalk.cyan.bold('├─────────────────────────────────────────────────────────────┤'));
      lines.push(chalk.cyan.bold('│') + ` Raw: ${chalk.gray(hex.substring(0, 53).padEnd(53))} ` + chalk.cyan.bold('│'));
    }
    
    lines.push(chalk.cyan.bold('└─────────────────────────────────────────────────────────────┘'));
    lines.push(chalk.gray('Press Ctrl+C to stop'));

    // Build complete output - use absolute positioning to row 1
    const MOVE_HOME = '\x1b[H';  // Move to row 1, col 1
    const content = lines.map(line => CLEAR_LINE + line).join('\n') + '\n';
    
    // Always move to home position and write
    process.stdout.write(HIDE_CURSOR + MOVE_HOME + content);
  }
  
  /**
   * Create a progress bar that shows overflow (values > 1.0)
   */
  private createBarWithOverflow(normalizedValue: number, width: number): string {
    if (normalizedValue <= 1.0) {
      const filled = Math.round(normalizedValue * width);
      const empty = width - filled;
      return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
    } else {
      // Show overflow - fill entire bar in red
      const overflowRatio = Math.min(normalizedValue, 2.0); // Cap at 200%
      const normalPart = width;
      return chalk.red('█'.repeat(normalPart)) + chalk.red.bold('▶');
    }
  }

  private startMockGestureCycle(): void {
    console.log(chalk.yellow('Mock gesture cycle starting...'));
    console.log(chalk.gray('Gestures will cycle automatically\n'));

    this.playNextGesture();
  }

  private async playNextGesture(): Promise<void> {
    if (!this.reader || !(this.reader instanceof MockHIDReader)) return;

    const gesture = MOCK_GESTURES[this.currentGestureIndex];
    
    console.log();
    console.log(chalk.yellow.bold(`▶ Playing: ${gesture.description}`));
    console.log(chalk.gray(`  Duration: ${gesture.duration}ms`));
    console.log();

    // Play the gesture
    await (this.reader as MockHIDReader).playGestureForStep(gesture.name);

    // Schedule next gesture
    this.gestureTimer = setTimeout(() => {
      this.currentGestureIndex = (this.currentGestureIndex + 1) % MOCK_GESTURES.length;
      this.playNextGesture();
    }, gesture.duration + 500); // Add small gap between gestures
  }

  async stop(): Promise<void> {
    // Show cursor again (in case live mode hid it)
    process.stdout.write('\x1b[?25h');
    
    console.log();
    console.log(chalk.yellow('\nStopping...'));

    if (this.gestureTimer) {
      clearTimeout(this.gestureTimer);
    }

    if (this.reader) {
      this.reader.stopReading();
      try {
        await this.reader.close();
        console.log(chalk.gray('Device closed.'));
      } catch (error) {
        // Ignore close errors
      }
    }

    console.log(chalk.green(`✓ Processed ${this.packetCount} packets`));
    process.exit(0);
  }
}

// CLI Setup
program
  .name('tablet-events')
  .description('View tablet events in real-time using a config file')
  .version('1.0.0')
  .requiredOption('-c, --config <path>', 'Path to tablet config JSON file')
  .option('-m, --mock', 'Use mock data instead of real device')
  .option('-l, --live', 'Live dashboard mode (updates in place)')
  .option('--compact', 'Use compact single-line output')
  .option('-r, --raw', 'Show raw byte data')
  .action(async (options: StreamOptions) => {
    try {
      const streamer = new EventStreamer(options.config, {
        mock: options.mock,
        raw: options.raw,
        compact: options.compact,
        live: options.live,
      });

      await streamer.start();
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();

