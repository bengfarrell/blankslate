#!/usr/bin/env node
/**
 * CLI Walkthrough
 * Interactive terminal-based walkthrough for configuring HID tablets
 * 
 * This is the VIEW layer - it implements IWalkthroughView and delegates
 * all logic to the shared WalkthroughController.
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import { writeFile } from 'fs/promises';
import { join } from 'path';

import {
  WalkthroughController,
  type IWalkthroughView,
  type IReaderFactory,
  type StepInfo,
  type CaptureStatus,
  type DetectedButton,
  type DataSource,
  type NavigationAction,
  type MetadataFormData,
  type DeviceConnectionInfo,
  type ByteAnalysis,
} from '../core/walkthrough/index.js';
import { MockHIDReader, createMockHIDReader } from '../core/hid/mock-hid-reader.js';
import type { IHIDReader, HIDDeviceInfo } from '../core/hid/hid-interface.js';
import { NodeHIDDeviceManager, formatDeviceInfo, MultiInterfaceReader, type NodeHIDReaderOptions } from './node-hid-reader.js';
import { WALKTHROUGH_STRINGS, format } from '../strings/walkthrough-strings.js';

const strings = WALKTHROUGH_STRINGS;

// ============================================================================
// Theme / Styling
// ============================================================================

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

// ============================================================================
// CLI View Implementation
// ============================================================================

/**
 * CLI implementation of IWalkthroughView
 * Handles all terminal rendering and user input
 */
class CLIWalkthroughView implements IWalkthroughView {
  private spinner: Ora | null = null;
  private gestureResolve: (() => void) | null = null;

  // -------------------- Lifecycle --------------------

  showHeader(): void {
    const title = `${strings.header.emoji} ${strings.header.title}`;
    const padding = Math.max(0, 61 - title.length);
    const paddedTitle = ' '.repeat(Math.floor(padding / 2)) + title + ' '.repeat(Math.ceil(padding / 2));
    
    console.log('\n');
    console.log(theme.title('╔═══════════════════════════════════════════════════════════════╗'));
    console.log(theme.title('║') + chalk.bold.white(paddedTitle) + theme.title('║'));
    console.log(theme.title('╚═══════════════════════════════════════════════════════════════╝'));
    console.log('\n');
  }

  showStepInfo(stepInfo: StepInfo): void {
    console.log('\n');
    console.log(theme.step(`━━━ Step ${stepInfo.number}/10: ${stepInfo.title} ━━━`));
    console.log(theme.dim(stepInfo.description));
    console.log(theme.info(`Instructions: ${stepInfo.instructions}`));
    console.log('');
  }

  showCompletion(config: any): void {
    console.log('\n');
    console.log(theme.success('╔═══════════════════════════════════════════════════════════════╗'));
    console.log(theme.success('║') + chalk.bold.white('           ✅ Configuration Complete!                        ') + theme.success('║'));
    console.log(theme.success('╚═══════════════════════════════════════════════════════════════╝'));
    console.log('\n');

    if (config) {
      console.log(theme.info('Generated configuration:'));
      console.log(theme.dim('─'.repeat(60)));
      console.log(theme.data(JSON.stringify(config, null, 2)));
      console.log(theme.dim('─'.repeat(60)));
    }
  }

  showError(message: string): void {
    console.log(theme.error(`\n✗ ${message}`));
  }

  showSuccess(message: string): void {
    console.log(theme.success(`\n✓ ${message}`));
  }

  showInfo(message: string): void {
    console.log(theme.info(`\n${message}`));
  }

  // -------------------- Capture Feedback --------------------

  onCaptureStart(): void {
    this.spinner = ora('Capturing packets...').start();
  }

  onCaptureProgress(status: CaptureStatus): void {
    if (this.spinner) {
      this.spinner.text = `Capturing... ${status.packetCount} packets`;
    }
  }

  onCaptureComplete(status: CaptureStatus): void {
    if (this.spinner) {
      const filterInfo = status.duplicatesFiltered > 0 || status.idleFiltered > 0
        ? ` (filtered: ${status.duplicatesFiltered} duplicates, ${status.idleFiltered} idle)`
        : '';
      this.spinner.succeed(`Captured ${status.packetCount} packets${filterInfo}`);
      this.spinner = null;
    }
  }

  onBytesDetected(bytes: ByteAnalysis[]): void {
    console.log(theme.success('\n✓ Bytes detected:'));
    if (bytes.length === 0) {
      console.log(theme.dim('  No bytes detected'));
    } else {
      bytes.forEach(b => {
        console.log(`  Byte ${b.byteIndex}: min=${b.min}, max=${b.max}, variance=${b.variance.toFixed(0)}`);
      });
    }
  }

  // -------------------- User Prompts --------------------

  async promptDataSource(): Promise<DataSource> {
    const { source } = await inquirer.prompt([{
      type: 'list',
      name: 'source',
      message: 'Select data source:',
      choices: [
        { name: '🎮 Use mock data (for testing)', value: 'mock' },
        { name: '🔌 Connect to real HID device', value: 'device' },
        { name: '🚪 Exit', value: 'exit' },
      ],
    }]);
    return source;
  }

  async promptNavigation(): Promise<NavigationAction> {
    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: '→ Next step', value: 'next' },
        { name: '↻ Retry this step', value: 'retry' },
        { name: '← Previous step', value: 'previous' },
        { name: '✕ Cancel walkthrough', value: 'cancel' },
      ],
    }]);
    return action;
  }

  async promptButtonCount(): Promise<number> {
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
    return buttonCount || 0;
  }

  async promptMetadata(defaults?: Partial<MetadataFormData>): Promise<MetadataFormData> {
    const metadata = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Device name:',
        default: defaults?.name || 'My Graphics Tablet',
        validate: (input) => input.length > 0 || 'Name is required',
      },
      {
        type: 'input',
        name: 'manufacturer',
        message: 'Manufacturer:',
        default: defaults?.manufacturer || 'Unknown',
        validate: (input) => input.length > 0 || 'Manufacturer is required',
      },
      {
        type: 'input',
        name: 'model',
        message: 'Model:',
        default: defaults?.model || 'Unknown',
        validate: (input) => input.length > 0 || 'Model is required',
      },
      {
        type: 'input',
        name: 'description',
        message: 'Description:',
        default: defaults?.description || 'Graphics tablet configured via CLI walkthrough',
      },
    ]);

    return {
      ...metadata,
      buttonCount: defaults?.buttonCount,
    };
  }

  async promptSaveConfig(config: any): Promise<{ save: boolean; filename?: string }> {
    const { save } = await inquirer.prompt([{
      type: 'confirm',
      name: 'save',
      message: 'Would you like to save this configuration?',
      default: true,
    }]);

    if (!save) {
      return { save: false };
    }

    const { filename } = await inquirer.prompt([{
      type: 'input',
      name: 'filename',
      message: 'Filename:',
      default: `${config.name.toLowerCase().replace(/\s+/g, '_')}_config.json`,
    }]);

    // Actually save the file
    try {
      const savePath = join(process.cwd(), filename);
      await writeFile(savePath, JSON.stringify(config, null, 2));
      return { save: true, filename: savePath };
    } catch (error) {
      this.showError(`Failed to save: ${(error as Error).message}`);
      return { save: false };
    }
  }

  // -------------------- Button Detection --------------------

  showButtonDetectionStart(totalButtons: number): void {
    console.log(theme.info(`\nWe'll now detect each of your ${totalButtons} button(s).`));
    console.log(theme.dim('For each button, press and hold it until detection completes.\n'));
  }

  showButtonDetectionPrompt(buttonNumber: number): void {
    console.log(theme.highlight(`\n👆 Press Button ${buttonNumber} three times (or Enter to skip)...`));
  }

  showButtonDetected(button: DetectedButton): void {
    console.log(theme.success(`  ✓ Button ${button.buttonNumber}: status=${button.statusByte}, scanCode=${button.scanCode}`));
  }

  showButtonSkipped(buttonNumber: number): void {
    console.log(theme.dim(`  (Button ${buttonNumber} skipped)`));
  }

  showButtonDetectionSummary(buttons: DetectedButton[], totalExpected: number): void {
    console.log('\n' + theme.info('Button Detection Summary:'));
    console.log(theme.dim('─'.repeat(40)));

    if (buttons.length > 0) {
      // Check for conflicts (same scanCode with different status bytes)
      const scanCodeGroups = new Map<number, DetectedButton[]>();
      for (const btn of buttons) {
        const existing = scanCodeGroups.get(btn.scanCode) || [];
        existing.push(btn);
        scanCodeGroups.set(btn.scanCode, existing);
      }

      for (const btn of buttons) {
        const group = scanCodeGroups.get(btn.scanCode) || [];
        if (group.length > 1) {
          console.log(theme.data(`  Button ${btn.buttonNumber}: scanCode=${btn.scanCode} + status=${btn.statusByte} ${theme.dim('(uses status byte)')}`));
        } else {
          console.log(theme.data(`  Button ${btn.buttonNumber}: scanCode=${btn.scanCode}`));
        }
      }
      console.log(theme.success(`\n✓ Detected ${buttons.length}/${totalExpected} buttons\n`));
    } else {
      console.log(theme.error('  No buttons detected\n'));
    }
  }

  // -------------------- Gesture Wait --------------------

  async waitForGestureComplete(): Promise<void> {
    console.log(theme.highlight('\n👆 Perform the gesture on your tablet now...'));
    console.log(theme.dim('(Press Enter when done)'));

    return new Promise<void>((resolve) => {
      this.gestureResolve = resolve;

      // Save original stdin state
      const wasRaw = process.stdin.isRaw;

      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }

      const handler = (data: Buffer) => {
        const char = data.toString();
        if (char === '\r' || char === '\n' || char === '\x03') {
          if (char === '\x03') {
            process.exit(0);
          }
          process.stdin.removeListener('data', handler);
          if (process.stdin.isTTY) {
            process.stdin.setRawMode(wasRaw ?? false);
          }
          this.gestureResolve = null;
          resolve();
        }
      };

      process.stdin.on('data', handler);

      // 30 second timeout
      setTimeout(() => {
        process.stdin.removeListener('data', handler);
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(wasRaw ?? false);
        }
        if (this.gestureResolve) {
          this.gestureResolve = null;
          resolve();
        }
      }, 30000);
    });
  }
}

// ============================================================================
// CLI Reader Factory
// ============================================================================

/**
 * Factory for creating HID readers in CLI environment
 */
class CLIReaderFactory implements IReaderFactory {
  private deviceInfo: DeviceConnectionInfo | null = null;
  private reader: IHIDReader | null = null;

  createMockReader(): IHIDReader {
    return createMockHIDReader({
      productName: 'Mock Tablet (CLI)',
      vendorId: 0x28bd,
      productId: 0x2904,
    });
  }

  async createDeviceReader(): Promise<IHIDReader | null> {
    const manager = new NodeHIDDeviceManager();
    const view = new CLIWalkthroughView();

    const spinner = ora(strings.messages.scanning).start();
    const devices = await manager.listTabletDevices();
    spinner.stop();

    if (devices.length === 0) {
      console.log(theme.error('\n' + strings.messages.noTabletsFound));

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
          return this.openDevice(manager, allDevices[deviceIndex - 1]);
        }
      }
      return null;
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
      return this.openDevice(manager, devices[deviceIndex]);
    }

    return null;
  }

  private async openDevice(manager: NodeHIDDeviceManager, device: HIDDeviceInfo): Promise<IHIDReader | null> {
    const spinner = ora(strings.messages.openingDevice).start();

    try {
      const readerOptions: NodeHIDReaderOptions = { exclusive: true };
      this.reader = await manager.openAllInterfaces(
        device.vendorId,
        device.productId,
        readerOptions
      );
      await this.reader.open();

      const readerInfo = this.reader.deviceInfo;
      const collections = readerInfo && readerInfo.usagePage !== undefined && readerInfo.usage !== undefined
        ? [{ usagePage: readerInfo.usagePage, usage: readerInfo.usage }]
        : device.collections || [];

      this.deviceInfo = {
        vendorId: device.vendorId,
        productId: device.productId,
        productName: device.productName,
        collections,
        allInterfaces: device.usagePage ? [device.usagePage] : [],
      };

      spinner.succeed(strings.messages.deviceReady);
      return this.reader;
    } catch (error) {
      spinner.fail(format(strings.errors.failedToOpenDevice, { error: (error as Error).message }));
      return null;
    }
  }

  getDeviceInfo(): DeviceConnectionInfo | null {
    return this.deviceInfo;
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

export interface CLIWalkthroughOptions {
  outputPath?: string;
  useMock?: boolean;
}

/**
 * Run the CLI walkthrough
 */
export async function runCLI(options: CLIWalkthroughOptions = {}): Promise<void> {
  const view = new CLIWalkthroughView();
  const readerFactory = new CLIReaderFactory();
  
  const controller = new WalkthroughController(view, readerFactory, {
    autoPlayMockGestures: true,
    gesturePlayDuration: 2000,
  });

  // Set up signal handlers
  const handleExit = async () => {
    console.log(theme.dim('\n\nCleaning up...'));
    await controller.cleanup();
    process.exit(0);
  };

  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);

  try {
    await controller.run(options.useMock);
  } catch (error) {
    console.error(theme.error('Error:'), error instanceof Error ? error.message : error);
    await controller.cleanup();
    process.exit(1);
  }
}

// CLI Setup
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
