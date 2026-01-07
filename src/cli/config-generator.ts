#!/usr/bin/env node
/**
 * CLI Walkthrough
 * Interactive terminal-based walkthrough for configuring HID tablets
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import { writeFile } from 'fs/promises';
import { join } from 'path';

import { WalkthroughEngine, STEP_INFO, type GestureType } from '../core/walkthrough/index.js';
import { MockHIDReader, createMockHIDReader } from '../core/hid/mock-hid-reader.js';
import type { IHIDReader, HIDDeviceInfo } from '../core/hid/hid-interface.js';
import { NodeHIDDeviceManager, formatDeviceInfo, MultiInterfaceReader, type NodeHIDReaderOptions } from './node-hid-reader.js';
import { loadStringsSync, format, type WalkthroughStrings } from '../utils/strings-loader.js';

// Load strings at startup
const strings: WalkthroughStrings = loadStringsSync();

/**
 * CLI color theme
 */
const theme = {
  title: chalk.bold.cyan,
  step: chalk.yellow,
  success: chalk.green,
  error: chalk.red,
  info: chalk.blue,
  dim: chalk.gray,
  highlight: chalk.magenta,
  data: chalk.white,
};

/**
 * Print a styled header
 */
function printHeader(): void {
  const title = `${strings.header.emoji} ${strings.header.title}`;
  const padding = Math.max(0, 61 - title.length);
  const paddedTitle = ' '.repeat(Math.floor(padding / 2)) + title + ' '.repeat(Math.ceil(padding / 2));
  
  console.log('\n');
  console.log(theme.title('╔═══════════════════════════════════════════════════════════════╗'));
  console.log(theme.title('║') + chalk.bold.white(paddedTitle) + theme.title('║'));
  console.log(theme.title('╚═══════════════════════════════════════════════════════════════╝'));
  console.log('\n');
}

/**
 * Print step information
 */
function printStepInfo(stepNumber: number, title: string, description: string): void {
  console.log('\n');
  console.log(theme.step(`━━━ Step ${stepNumber}/10: ${title} ━━━`));
  console.log(theme.dim(description));
  console.log('');
}

/**
 * Format byte analysis for display
 */
function formatByteAnalysis(bytes: Array<{ byteIndex: number; min: number; max: number; variance: number }>): string {
  if (bytes.length === 0) return theme.dim('No bytes detected');
  
  return bytes.map(b => 
    `  Byte ${b.byteIndex}: min=${b.min}, max=${b.max}, variance=${b.variance}`
  ).join('\n');
}

/**
 * Options for the CLI walkthrough
 */
export interface CLIWalkthroughOptions {
  /** Output path for the generated config JSON */
  outputPath?: string;
  /** Use mock data instead of real device */
  useMock?: boolean;
}

/**
 * Button mapping detected during walkthrough
 */
interface ButtonMapping {
  buttonNumber: number;
  statusByte: number;
  scanCode: number;
}

/**
 * CLI Walkthrough Runner
 */
export class CLIWalkthrough {
  private engine: WalkthroughEngine;
  private reader: IHIDReader | null = null;
  private useMock: boolean = false;
  private spinner: Ora | null = null;
  private captureTimeout: ReturnType<typeof setTimeout> | null = null;
  private outputPath?: string;
  private buttonCount: number = 0;
  private buttonMappings: ButtonMapping[] = [];

  constructor(options: CLIWalkthroughOptions = {}) {
    this.outputPath = options.outputPath;
    this.useMock = options.useMock ?? false;
    
    this.engine = new WalkthroughEngine({
      minPacketsPerStep: 50,
      minVarianceThreshold: 30,
    });

    // Set up event handlers
    this.engine.on((event) => {
      switch (event.type) {
        case 'packet-received':
          if (this.spinner) {
            this.spinner.text = `Capturing... ${event.count} packets`;
          }
          break;
        case 'bytes-detected':
          console.log(theme.success('\n✓ Bytes detected:'));
          console.log(formatByteAnalysis(event.bytes));
          break;
        case 'error':
          console.log(theme.error(`\n✗ Error: ${event.message}`));
          break;
      }
    });
  }

  /**
   * Main entry point - run the full walkthrough
   */
  async run(): Promise<void> {
    // Set up signal handlers for graceful cleanup
    const handleExit = async () => {
      console.log(theme.dim('\n\nCleaning up...'));
      await this.cleanup();
      process.exit(0);
    };
    
    process.on('SIGINT', handleExit);
    process.on('SIGTERM', handleExit);
    process.on('uncaughtException', async (err) => {
      console.error(theme.error('\nUncaught exception:'), err.message);
      await this.cleanup();
      process.exit(1);
    });
    process.on('unhandledRejection', async (reason) => {
      console.error(theme.error('\nUnhandled rejection:'), reason);
      await this.cleanup();
      process.exit(1);
    });

    printHeader();
    
    // If useMock was specified via CLI option, skip the source selection
    let source: 'mock' | 'device' | 'exit';
    if (this.useMock) {
      source = 'mock';
      console.log(theme.info('Using mock data mode (--mock flag)\n'));
    } else {
      source = await this.selectDataSource();
    }
    
    if (source === 'exit') {
      console.log(theme.info('\nGoodbye! 👋\n'));
      return;
    }

    // Initialize the selected reader
    await this.initializeReader(source);

    if (!this.reader) {
      console.log(theme.error('\nFailed to initialize device reader. Exiting.\n'));
      return;
    }

    // Run through all walkthrough steps
    await this.runWalkthroughSteps();
    
    // Cleanup
    await this.cleanup();
  }

  /**
   * Select between mock data and real device
   */
  private async selectDataSource(): Promise<'mock' | 'device' | 'exit'> {
    const { source } = await inquirer.prompt([
      {
        type: 'list',
        name: 'source',
        message: 'Select data source:',
        choices: [
          { name: '🎮 Use mock data (for testing)', value: 'mock' },
          { name: '🔌 Connect to real HID device', value: 'device' },
          { name: '🚪 Exit', value: 'exit' },
        ],
      },
    ]);
    
    return source;
  }

  /**
   * Initialize the appropriate reader
   */
  private async initializeReader(source: 'mock' | 'device'): Promise<void> {
    if (source === 'mock') {
      this.useMock = true;
      this.reader = createMockHIDReader({
        productName: 'Mock Tablet (CLI)',
        vendorId: 0x28bd,
        productId: 0x2904,
      });
      
      this.engine.setDeviceInfo({
        vendorId: 0x28bd,
        productId: 0x2904,
        productName: 'Mock Tablet (CLI)',
        collections: [{ usagePage: 13, usage: 2 }],
        allInterfaces: [13],
        detectedReportId: 2,
      });
      
      console.log(theme.success('\n✓ Mock device initialized\n'));
    } else {
      await this.selectRealDevice();
    }
  }

  /**
   * Let user select a real HID device
   */
  private async selectRealDevice(): Promise<void> {
    const manager = new NodeHIDDeviceManager();
    
    const spinner = ora(strings.messages.scanning).start();
    const devices = await manager.listTabletDevices();
    spinner.stop();

    if (devices.length === 0) {
      console.log(theme.error('\n' + strings.messages.noTabletsFound));
      
      // Offer to list all devices
      const { listAll } = await inquirer.prompt([{
        type: 'confirm',
        name: 'listAll',
        message: strings.prompts.listAllDevices,
        default: true,
      }]);

      if (listAll) {
        const allDevices = await manager.listDevices();
        console.log(theme.info(`\nFound ${allDevices.length} HID devices:\n`));
        
        allDevices.forEach((device, index) => {
          console.log(`  ${index + 1}. ${formatDeviceInfo(device)}`);
        });
        
        const { deviceIndex } = await inquirer.prompt([{
          type: 'number',
          name: 'deviceIndex',
          message: 'Enter device number to select (or 0 to cancel):',
          default: 0,
        }]);

        if (deviceIndex > 0 && deviceIndex <= allDevices.length) {
          const selected = allDevices[deviceIndex - 1];
          await this.openDevice(manager, selected);
        }
      }
      return;
    }

    // Show tablet devices
    console.log(theme.info(`\nFound ${devices.length} tablet device(s):\n`));
    
    const choices = devices.map((device, index) => ({
      name: `${index + 1}. ${formatDeviceInfo(device)}`,
      value: index,
    }));
    choices.push({ name: 'Cancel', value: -1 });

    const { deviceIndex } = await inquirer.prompt([{
      type: 'list',
      name: 'deviceIndex',
      message: strings.prompts.selectDevice,
      choices,
    }]);

    if (deviceIndex >= 0) {
      await this.openDevice(manager, devices[deviceIndex]);
    }
  }

  /**
   * Open and prepare a device
   */
  private async openDevice(manager: NodeHIDDeviceManager, device: HIDDeviceInfo): Promise<void> {
    const spinner = ora(strings.messages.openingDevice).start();
    
    try {
      // Always open in exclusive mode to suppress mouse input
      const readerOptions: NodeHIDReaderOptions = { exclusive: true };
      
      // Open ALL interfaces for this device (by vendorId/productId)
      // This ensures we capture data regardless of which interface sends it
      this.reader = await manager.openAllInterfaces(
        device.vendorId, 
        device.productId, 
        readerOptions
      );
      await this.reader.open();
      
      // Get the interface info from the multi-reader for the config
      // We'll use the first successfully opened interface's usagePage/usage
      const readerInfo = this.reader.deviceInfo;
      const collections = readerInfo && readerInfo.usagePage !== undefined && readerInfo.usage !== undefined
        ? [{ usagePage: readerInfo.usagePage, usage: readerInfo.usage }]
        : device.collections || [];
      
      this.engine.setDeviceInfo({
        vendorId: device.vendorId,
        productId: device.productId,
        productName: device.productName,
        collections: collections,
        allInterfaces: device.usagePage ? [device.usagePage] : [],
        detectedReportId: undefined,
      });
      
      spinner.succeed(strings.messages.deviceReady);
    } catch (error) {
      spinner.fail(format(strings.errors.failedToOpenDevice, { error: (error as Error).message }));
      this.reader = null;
    }
  }

  /**
   * Run through all walkthrough steps
   */
  private async runWalkthroughSteps(): Promise<void> {
    this.engine.start();

    while (true) {
      const state = this.engine.getState();
      const stepInfo = this.engine.getCurrentStepInfo();

      if (state.currentStep === 'complete') {
        await this.showCompletion();
        break;
      }

      if (state.currentStep === 'step10-metadata') {
        await this.collectMetadata();
        continue;
      }

      // Handle tablet buttons step specially - interactive per-button detection
      if (state.currentStep === 'step9-tablet-buttons') {
        await this.runTabletButtonDetection();
        
        // Ask to proceed (same as other steps)
        const { action } = await inquirer.prompt([{
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: '→ Next step', value: 'next' },
            { name: '↻ Retry button detection', value: 'retry' },
            { name: '← Previous step', value: 'prev' },
            { name: '✕ Cancel walkthrough', value: 'cancel' },
          ],
        }]);

        switch (action) {
          case 'next':
            this.engine.nextStep();
            break;
          case 'retry':
            // Re-run button detection
            break;
          case 'prev':
            this.engine.previousStep();
            break;
          case 'cancel':
            console.log(theme.info('\nWalkthrough cancelled.\n'));
            return;
        }
        continue;
      }

      // Show step info
      printStepInfo(stepInfo.number, stepInfo.title, stepInfo.description);
      console.log(theme.info(`Instructions: ${stepInfo.instructions}`));

      // Run the capture for this step
      await this.runStepCapture(stepInfo.gesture);

      // Ask to proceed
      const { action } = await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '→ Next step', value: 'next' },
          { name: '↻ Retry this step', value: 'retry' },
          { name: '← Previous step', value: 'prev' },
          { name: '✕ Cancel walkthrough', value: 'cancel' },
        ],
      }]);

      switch (action) {
        case 'next':
          this.engine.nextStep();
          break;
        case 'retry':
          this.engine.resetCurrentStep();
          break;
        case 'prev':
          this.engine.previousStep();
          break;
        case 'cancel':
          console.log(theme.info('\nWalkthrough cancelled.\n'));
          return;
      }
    }
  }

  /**
   * Run capture for a specific step
   */
  private async runStepCapture(gesture: GestureType | null): Promise<void> {
    if (!this.reader) return;

    // Start reading from device
    this.reader.startReading((data) => {
      this.engine.processPacket(data);
    });

    this.engine.startCapture();

    if (this.useMock && this.reader instanceof MockHIDReader && gesture) {
      // For mock: auto-play the gesture
      console.log(theme.dim(`\n🤖 Simulating ${gesture} gesture...`));
      this.spinner = ora('Capturing packets...').start();
      
      await this.reader.playGestureForStep(gesture, 2000);
      
      // Wait a bit for remaining packets
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const mockStats = this.engine.getFilterStats();
      this.spinner.succeed(`Captured ${mockStats.captured} packets`);
    } else {
      // For real device: wait for user input
      console.log(theme.highlight('\n👆 Perform the gesture on your tablet now...'));
      console.log(theme.dim('(Press Enter when done)'));
      
      this.spinner = ora('Capturing packets...').start();
      
      // Wait for Enter key
      await new Promise<void>((resolve) => {
        const handler = () => {
          process.stdin.removeListener('data', handler);
          resolve();
        };
        process.stdin.on('data', handler);
        
        // Also set a timeout
        this.captureTimeout = setTimeout(() => {
          process.stdin.removeListener('data', handler);
          resolve();
        }, 30000); // 30 second timeout
      });
      
      if (this.captureTimeout) {
        clearTimeout(this.captureTimeout);
      }
      
      const stats = this.engine.getFilterStats();
      this.spinner.succeed(`Captured ${stats.captured} packets (filtered: ${stats.duplicates} duplicates, ${stats.idle} idle)`);
    }

    this.engine.stopCapture();
    this.reader.stopReading();
    this.spinner = null;
  }

  /**
   * Interactive tablet button detection
   * Asks user for button count, then detects each button's scan code
   */
  private async runTabletButtonDetection(): Promise<void> {
    const stepInfo = STEP_INFO['step9-tablet-buttons'];
    printStepInfo(stepInfo.number, stepInfo.title, stepInfo.description);

    // First ask how many buttons
    const { buttonCount } = await inquirer.prompt([{
      type: 'number',
      name: 'buttonCount',
      message: 'How many tablet buttons (express keys) does your tablet have?',
      default: 0,
      validate: (input) => {
        const num = parseInt(input);
        if (isNaN(num) || num < 0) return 'Please enter a valid number (0 or more)';
        if (num > 20) return 'Maximum 20 buttons supported';
        return true;
      },
    }]);

    this.buttonCount = buttonCount || 0;

    if (this.buttonCount === 0) {
      console.log(theme.dim('\nNo tablet buttons to configure.\n'));
      return;
    }

    console.log(theme.info(`\nWe'll now detect each of your ${this.buttonCount} button(s).`));
    console.log(theme.dim('For each button, press and hold it until detection completes.\n'));

    this.buttonMappings = [];

    for (let i = 1; i <= this.buttonCount; i++) {
      const mapping = await this.detectSingleButton(i);
      if (mapping) {
        this.buttonMappings.push(mapping);
        console.log(theme.success(`  ✓ Button ${i}: status=${mapping.statusByte}, scanCode=${mapping.scanCode}`));
      } else {
        console.log(theme.error(`  ✗ Button ${i}: No data detected`));
      }
    }

    // Show summary
    console.log('\n' + theme.info('Button Detection Summary:'));
    console.log(theme.dim('─'.repeat(40)));
    
    if (this.buttonMappings.length > 0) {
      // Check for conflicts (same scanCode with different status bytes - like buttons 7 and 8)
      const scanCodeGroups = new Map<number, ButtonMapping[]>();
      for (const mapping of this.buttonMappings) {
        const existing = scanCodeGroups.get(mapping.scanCode) || [];
        existing.push(mapping);
        scanCodeGroups.set(mapping.scanCode, existing);
      }

      for (const mapping of this.buttonMappings) {
        const group = scanCodeGroups.get(mapping.scanCode) || [];
        if (group.length > 1) {
          // Multiple buttons share this scan code - differentiated by status byte
          console.log(theme.data(`  Button ${mapping.buttonNumber}: scanCode=${mapping.scanCode} + status=${mapping.statusByte} ${theme.dim('(uses status byte to distinguish)')}`));
        } else {
          console.log(theme.data(`  Button ${mapping.buttonNumber}: scanCode=${mapping.scanCode}`));
        }
      }
      console.log(theme.success(`\n✓ Detected ${this.buttonMappings.length}/${this.buttonCount} buttons\n`));
    } else {
      console.log(theme.error('  No buttons detected\n'));
    }
  }

  /**
   * Detect a single button press
   * Responds immediately when a button is detected (3 presses to confirm)
   * User can press Enter to skip this button
   */
  private async detectSingleButton(buttonNumber: number): Promise<ButtonMapping | null> {
    if (!this.reader) return null;

    console.log(theme.highlight(`\n👆 Press Button ${buttonNumber} three times (or Enter to skip)...`));

    return new Promise<ButtonMapping | null>((resolve) => {
      let detected: ButtonMapping | null = null;
      let finished = false;
      const MIN_CONFIRMATIONS = 3; // Require 3 presses to confirm
      const seenPackets: Array<{ status: number; scanCode: number }> = [];

      // Save original stdin state
      const wasRaw = process.stdin.isRaw;

      const finishDetection = () => {
        if (finished) return;
        finished = true;
        
        // Restore stdin state
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(wasRaw ?? false);
        }
        process.stdin.removeListener('data', stdinHandler);
        this.reader!.stopReading();
        resolve(detected);
      };

      // Set raw mode for immediate key detection
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }

      // Allow Enter key to skip
      const stdinHandler = (data: Buffer) => {
        const char = data.toString();
        // Check for Enter (CR or LF) or Ctrl+C
        if (char === '\r' || char === '\n' || char === '\x03') {
          if (char === '\x03') {
            // Ctrl+C - exit
            finishDetection();
            process.exit(0);
          }
          console.log(theme.dim('  (skipped)'));
          finishDetection();
        }
      };
      process.stdin.on('data', stdinHandler);

      const dataHandler = (data: Uint8Array) => {
        if (finished) return;
        
        // Extract status byte (byte 0) and scan code (byte 1)
        const statusByte = data[0];
        const scanCode = data.length > 1 ? data[1] : 0;
        
        // Skip idle/empty packets
        if (scanCode === 0) return;
        
        // Skip known pen status bytes (0xA0-0xA5, 0xC0 range)
        if (statusByte >= 0xA0 && statusByte <= 0xA5) return;
        if (statusByte === 0xC0) return;
        
        seenPackets.push({ status: statusByte, scanCode });
        
        // Check if we have enough confirmations of the same button
        if (seenPackets.length >= MIN_CONFIRMATIONS) {
          // Find the most common scan code
          const scanCodeCounts = new Map<number, { count: number; status: number }>();
          for (const p of seenPackets) {
            const existing = scanCodeCounts.get(p.scanCode);
            if (existing) {
              existing.count++;
            } else {
              scanCodeCounts.set(p.scanCode, { count: 1, status: p.status });
            }
          }

          // Get the most common scan code
          let bestScanCode = 0;
          let bestStatus = 0;
          let bestCount = 0;
          for (const [code, data] of scanCodeCounts) {
            if (data.count > bestCount) {
              bestCount = data.count;
              bestScanCode = code;
              bestStatus = data.status;
            }
          }

          // If we have enough confirmations of this scan code, we're done
          if (bestCount >= MIN_CONFIRMATIONS) {
            detected = {
              buttonNumber,
              statusByte: bestStatus,
              scanCode: bestScanCode,
            };
            finishDetection();
          }
        }
      };

      this.reader!.startReading(dataHandler);
    });
  }

  /**
   * Collect device metadata from user
   */
  private async collectMetadata(): Promise<void> {
    const stepInfo = STEP_INFO['step10-metadata'];
    printStepInfo(stepInfo.number, stepInfo.title, stepInfo.description);

    const metadata = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Device name:',
        default: 'My Graphics Tablet',
        validate: (input) => input.length > 0 || 'Name is required',
      },
      {
        type: 'input',
        name: 'manufacturer',
        message: 'Manufacturer:',
        default: 'Unknown',
        validate: (input) => input.length > 0 || 'Manufacturer is required',
      },
      {
        type: 'input',
        name: 'model',
        message: 'Model:',
        default: 'Unknown',
        validate: (input) => input.length > 0 || 'Model is required',
      },
      {
        type: 'input',
        name: 'description',
        message: 'Description:',
        default: 'Graphics tablet configured via CLI walkthrough',
      },
    ]);

    // Add button count from earlier detection (no need to ask again)
    metadata.buttonCount = this.buttonCount;

    // Update device info with ALL interfaces that sent data during walkthrough
    // This ensures stream-events opens the right interfaces automatically
    if (this.reader && 'dataReceivedFromUsagePages' in this.reader) {
      const multiReader = this.reader as MultiInterfaceReader;
      const usagePages = multiReader.dataReceivedFromUsagePages;
      const activeIface = multiReader.activeInterface;
      
      if (usagePages.length > 0 || activeIface) {
        const currentInfo = this.engine.getDeviceInfo();
        if (currentInfo) {
          // Use the active interface for primary collection, store all usagePages in allInterfaces
          const collections = activeIface 
            ? [{ usagePage: activeIface.usagePage!, usage: activeIface.usage! }]
            : currentInfo.collections || [];
          
          this.engine.setDeviceInfo({
            ...currentInfo,
            collections,
            allInterfaces: usagePages.length > 0 ? usagePages : currentInfo.allInterfaces,
          });
          
          if (usagePages.length > 1) {
            console.log(theme.info(`\nInterfaces that sent data: ${usagePages.map(up => `usagePage:${up}`).join(', ')}`));
          } else if (activeIface) {
            console.log(theme.info(`\nUsing interface: usagePage:${activeIface.usagePage} usage:${activeIface.usage}`));
          }
        }
      }
    }

    // Pass button mappings to the engine for config generation
    this.engine.setButtonMappings(this.buttonMappings.map(m => ({
      buttonNumber: m.buttonNumber,
      statusByte: m.statusByte,
      scanCode: m.scanCode,
    })));

    this.engine.submitMetadata(metadata);
  }

  /**
   * Show completion and save config
   */
  private async showCompletion(): Promise<void> {
    console.log('\n');
    console.log(theme.success('╔═══════════════════════════════════════════════════════════════╗'));
    console.log(theme.success('║') + chalk.bold.white('           ✅ Configuration Complete!                        ') + theme.success('║'));
    console.log(theme.success('╚═══════════════════════════════════════════════════════════════╝'));
    console.log('\n');

    const config = this.engine.getCompleteConfig();
    
    if (config) {
      console.log(theme.info('Generated configuration:'));
      console.log(theme.dim('─'.repeat(60)));
      console.log(theme.data(JSON.stringify(config, null, 2)));
      console.log(theme.dim('─'.repeat(60)));

      // If output path was specified via CLI, auto-save there
      if (this.outputPath) {
        try {
          // Resolve relative paths from cwd
          const resolvedPath = this.outputPath.startsWith('/') 
            ? this.outputPath 
            : join(process.cwd(), this.outputPath);
          await writeFile(resolvedPath, JSON.stringify(config, null, 2));
          console.log(theme.success(`\n✓ Configuration saved to: ${resolvedPath}\n`));
        } catch (error) {
          console.log(theme.error(`\n✗ Failed to save to ${this.outputPath}: ${(error as Error).message}\n`));
        }
        return;
      }

      // Otherwise, prompt for save
      const { save } = await inquirer.prompt([{
        type: 'confirm',
        name: 'save',
        message: 'Would you like to save this configuration?',
        default: true,
      }]);

      if (save) {
        const { filename } = await inquirer.prompt([{
          type: 'input',
          name: 'filename',
          message: 'Filename:',
          default: `${config.name.toLowerCase().replace(/\s+/g, '_')}_config.json`,
        }]);

        try {
          const savePath = join(process.cwd(), filename);
          await writeFile(savePath, JSON.stringify(config, null, 2));
          console.log(theme.success(`\n✓ Configuration saved to: ${savePath}\n`));
        } catch (error) {
          console.log(theme.error(`\n✗ Failed to save: ${(error as Error).message}\n`));
        }
      }
    }
  }

  private cleanedUp = false;
  
  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    
    if (this.reader) {
      try {
        this.reader.stopReading();
        await this.reader.close();
      } catch (error) {
        // Ignore cleanup errors
      }
      this.reader = null;
    }
  }
}

/**
 * Run the CLI walkthrough
 */
export async function runCLI(options: CLIWalkthroughOptions = {}): Promise<void> {
  const walkthrough = new CLIWalkthrough(options);
  await walkthrough.run();
}

// CLI Setup - only runs when this file is executed directly
import { program } from 'commander';

program
  .name('tablet-config')
  .description('Interactive walkthrough to generate tablet configuration')
  .version('1.0.0')
  .option('-o, --output <path>', 'Output path for generated config JSON')
  .option('-m, --mock', 'Use mock data instead of real device')
  .action(async (options) => {
    try {
      await runCLI({
        outputPath: options.output,
        useMock: options.mock,
      });
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();

