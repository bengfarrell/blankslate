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

import { TabletReaderBase, normalizeTabletEvent } from './tablet-reader-base.js';

interface StreamOptions {
  config: string;
  mock?: boolean;
  raw?: boolean;
  compact?: boolean;
  live?: boolean;
}

export class EventStreamer extends TabletReaderBase {
  private showRaw: boolean;
  private compactOutput: boolean;
  private liveMode: boolean;

  // Live mode state
  private lastEvents: Record<string, string | number | boolean> = {};
  private lastRawData: Uint8Array = new Uint8Array(0);
  private lastLiveUpdate = 0;
  private lastDisplayedState: string | null = null;

  // Multi-mode support
  private currentMode: any = null;
  private detectedReportId: number | null = null;

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
    super(configPath, { mock: options.mock });
    this.showRaw = options.raw ?? false;
    this.compactOutput = options.compact ?? false;
    this.liveMode = options.live ?? false;
  }

  async start(): Promise<void> {
    this.printHeader('Tablet Event Viewer');

    if (!this.isMockMode) {
      console.log(chalk.cyan('Mode:'), chalk.yellow('Exclusive (mouse input suppressed)'));
    }
    console.log();

    // Initialize reader
    console.log(chalk.gray('Initializing...'));
    await this.initializeReader();

    if (!this.reader) {
      throw new Error('Reader not initialized');
    }

    // Start reading - set up callback BEFORE any data comes in
    console.log(chalk.gray('Setting up data callback...'));
    this.reader.startReading((data, reportId) => {
      this.handlePacket(data, reportId);
    });

    console.log(chalk.green('✓ Started reading data'));
    console.log(chalk.gray('Press Ctrl+C to stop\n'));

    if (this.isMockMode) {
      this.startMockGestureCycle();
    }

    // Handle graceful shutdown
    this.setupShutdownHandlers();

    // Keep process alive
    await new Promise(() => {});
  }

  protected lastReportId: number | undefined;

  protected handlePacket(data: Uint8Array, reportId?: number): void {
    try {
      this.packetCount++;
      this.lastReportId = reportId;

      // Process the data using the config
      const events = this.processPacket(data, reportId);

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

    // Get mappings from current mode (for multi-mode configs) or from config directly
    let mappings;
    if (this.configData.isMultiMode()) {
      if (!this.currentMode) {
        // Mode not detected yet, try to detect it
        // Use the lastReportId that was passed to handlePacket
        if (this.lastReportId !== undefined) {
          const reportId = this.lastReportId;
          this.detectedReportId = reportId;
          this.currentMode = this.configData.getModeByReportId(reportId);

          if (this.currentMode) {
            console.log(chalk.green(`\n✓ Detected device mode: `) + chalk.cyan.bold(`Report ID ${reportId}`));
            console.log(chalk.cyan(`  Resolution: `) + chalk.white(`${this.currentMode.capabilities.resolution.x}x${this.currentMode.capabilities.resolution.y}\n`));
          } else {
            console.log(chalk.yellow(`\n⚠ Warning: Unknown Report ID ${reportId}`));
            console.log(chalk.yellow(`  Available modes:`));
            for (const mode of this.configData.modes || []) {
              console.log(chalk.yellow(`    - Report ID ${mode.reportId}`));
            }
            console.log();
            return;
          }
        } else {
          return;
        }
      }
      mappings = this.currentMode.byteCodeMappings;
    } else {
      mappings = this.configData.byteCodeMappings;
    }

    if (!mappings) {
      return;
    }

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

    // Get mappings from current mode (for multi-mode configs) or from config directly
    const mappings = this.configData.isMultiMode()
      ? this.currentMode?.byteCodeMappings
      : this.configData.byteCodeMappings;

    if (!mappings) {
      return;
    }

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

    // Report ID
    if (this.lastReportId !== undefined) {
      parts.push(`rid:${this.lastReportId}`);
    }

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

    lines.push(chalk.gray(`────────────────────────────────────────────────────────────`));
    const reportIdStr = this.lastReportId !== undefined ? chalk.yellow(` [ReportID: ${this.lastReportId}]`) : '';
    lines.push(chalk.cyan(`Packet #${this.packetCount}`) + reportIdStr + chalk.gray(` @ ${timestamp}`));

    // Always show raw hex
    const hex = Array.from(data).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    lines.push(chalk.gray(`Raw: ${hex}`));

    // Show all parsed events for debugging
    if (Object.keys(events).length > 0) {
      const eventsStr = Object.entries(events).map(([k, v]) => `${k}=${v}`).join(', ');
      lines.push(chalk.gray(`Events: ${eventsStr}`));
    }

    // State - always show, even if missing
    const state = events.state ?? 'unknown';
    const stateColor = state === 'contact' ? chalk.green :
      state === 'hover' ? chalk.yellow :
        state === 'buttons' ? chalk.magenta :
          state === 'keyboard' ? chalk.magenta :
            chalk.gray;
    lines.push(`  State: ${stateColor(String(state))}`);

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

    // Buttons - always show button state
    const buttons: string[] = [];
    if (events.primaryButton || events.primaryButtonPressed) buttons.push(chalk.magenta('Primary'));
    if (events.secondaryButton || events.secondaryButtonPressed) buttons.push(chalk.magenta('Secondary'));

    const tabletButton = typeof events.tabletButtons === 'number' ? events.tabletButtons : 0;
    if (tabletButton !== 0) {
      buttons.push(chalk.blue(`Express Key: ${tabletButton}`));
    }

    // Always show button line, even if no buttons pressed
    if (buttons.length > 0) {
      lines.push(`  Buttons: ${buttons.join(' | ')}`);
    } else {
      // Check if this looks like it should have button data
      if (events.state === 'buttons' || events.state === 'keyboard' || this.lastReportId === 6) {
        lines.push(`  Buttons: ${chalk.gray('(none detected)')}`);
      }
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
    // Get mappings from current mode (for multi-mode configs) or from config directly
    const mappings = this.configData.isMultiMode()
      ? this.currentMode?.byteCodeMappings
      : this.configData.byteCodeMappings;

    if (!mappings) {
      return;
    }

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
      const normalPart = width;
      return chalk.red('█'.repeat(normalPart)) + chalk.red.bold('▶');
    }
  }

  async stop(): Promise<void> {
    // Show cursor again (in case live mode hid it)
    process.stdout.write('\x1b[?25h');
    await super.stop();
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