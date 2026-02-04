/**
 * WalkthroughController
 * Platform-agnostic controller that orchestrates the walkthrough flow.
 * Both CLI and Web UI use this controller, implementing only the view layer.
 */

import { WalkthroughEngine, type WalkthroughEngineOptions } from './walkthrough-engine.js';
import {
  type WalkthroughStep,
  type StepInfo,
  type GestureType,
  STEP_INFO,
} from './walkthrough-types.js';
import type { IHIDReader } from '../hid/hid-interface.js';
import type { ByteAnalysis, DeviceByteCodeMappings, ButtonMapping } from '../../utils/byte-detector.js';

/**
 * Navigation action chosen by user after each step
 */
export type NavigationAction = 'next' | 'retry' | 'previous' | 'cancel';

/**
 * Data source selection
 */
export type DataSource = 'mock' | 'device' | 'exit';

/**
 * Button mapping detected during walkthrough
 */
export interface DetectedButton {
  buttonNumber: number;
  statusByte?: number;
  scanCode?: number;
  // Keyboard event properties (when driver is active)
  key?: string;
  code?: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  // Keyboard HID interface properties (Huion-style tablets)
  interfaceType?: 'digitizer' | 'keyboard';
  reportId?: number;      // HID report ID (3=keyboard, 4=consumer, 5=scroll)
  modifier?: number;      // Keyboard modifier byte (for Report ID 3)
  keycode?: number;       // Keyboard keycode (for Report ID 3)
  consumerCode?: number;  // Consumer control code (for Report ID 4)
  scrollDelta?: number;   // Scroll delta (for Report ID 5)
}

/**
 * Capture status during a step
 */
export interface CaptureStatus {
  packetCount: number;
  duplicatesFiltered: number;
  idleFiltered: number;
  isCapturing: boolean;
}

/**
 * Metadata form data
 */
export interface MetadataFormData {
  name: string;
  manufacturer: string;
  model: string;
  description?: string;
  buttonCount?: number;
}

/**
 * Device info for configuration
 */
export interface DeviceConnectionInfo {
  vendorId: number;
  productId: number;
  productName: string;
  collections?: Array<{ usagePage: number; usage: number }>;
  allInterfaces?: number[];
  /** The usage page of the interface that actually sends pen data */
  dataSourceUsagePage?: number;
}

/**
 * View interface that platform-specific implementations must provide
 */
export interface IWalkthroughView {
  // Lifecycle
  showHeader(): void;
  showStepInfo(stepInfo: StepInfo): void;
  showCompletion(config: any): void;
  showError(message: string): void;
  showSuccess(message: string): void;
  showInfo(message: string): void;
  
  // Capture feedback
  onCaptureStart(): void;
  onCaptureProgress(status: CaptureStatus): void;
  onCaptureComplete(status: CaptureStatus): void;
  onBytesDetected(bytes: ByteAnalysis[]): void;
  
  // User input (async - view handles how to get input)
  promptDataSource(): Promise<DataSource>;
  promptNavigation(): Promise<NavigationAction>;
  promptButtonCount(): Promise<number>;
  promptMetadata(defaults?: Partial<MetadataFormData>): Promise<MetadataFormData>;
  promptSaveConfig(config: any): Promise<{ save: boolean; filename?: string }>;
  
  // Button detection
  showButtonDetectionStart(totalButtons: number): void;
  showButtonDetectionPrompt(buttonNumber: number): void;
  showButtonDetected(button: DetectedButton): void;
  showButtonSkipped(buttonNumber: number): void;
  showButtonDetectionSummary(buttons: DetectedButton[], totalExpected: number): void;
  
  // Wait for user gesture (for real device capture)
  waitForGestureComplete(): Promise<void>;
}

/**
 * Reader factory interface for creating HID readers
 */
export interface IReaderFactory {
  createMockReader(): IHIDReader;
  createDeviceReader(): Promise<IHIDReader | null>;
  getDeviceInfo(): DeviceConnectionInfo | null;
}

/**
 * Controller options
 */
export interface WalkthroughControllerOptions extends WalkthroughEngineOptions {
  /** Auto-play gestures in mock mode */
  autoPlayMockGestures?: boolean;
  /** Gesture play duration in ms */
  gesturePlayDuration?: number;
  /** Required button press confirmations */
  buttonConfirmations?: number;
}

/**
 * Platform-agnostic walkthrough controller
 * Handles all logic, delegating rendering to the view
 */
export class WalkthroughController {
  private engine: WalkthroughEngine;
  private view: IWalkthroughView;
  private readerFactory: IReaderFactory;
  private reader: IHIDReader | null = null;
  private options: Required<WalkthroughControllerOptions>;
  
  private isMockMode = false;
  private buttonCount = 0;
  private detectedButtons: DetectedButton[] = [];
  private captureStatus: CaptureStatus = {
    packetCount: 0,
    duplicatesFiltered: 0,
    idleFiltered: 0,
    isCapturing: false,
  };

  constructor(
    view: IWalkthroughView,
    readerFactory: IReaderFactory,
    options: WalkthroughControllerOptions = {}
  ) {
    this.view = view;
    this.readerFactory = readerFactory;
    this.options = {
      minPacketsPerStep: options.minPacketsPerStep ?? 50,
      minVarianceThreshold: options.minVarianceThreshold ?? 30,
      autoAdvance: options.autoAdvance ?? false,
      skipDuplicates: options.skipDuplicates ?? true,
      filterIdlePackets: options.filterIdlePackets ?? true,
      packetIncludesReportId: options.packetIncludesReportId ?? true, // Node.js default, WebHID sets false
      autoPlayMockGestures: options.autoPlayMockGestures ?? true,
      gesturePlayDuration: options.gesturePlayDuration ?? 2000,
      buttonConfirmations: options.buttonConfirmations ?? 3,
    };

    this.engine = new WalkthroughEngine({
      minPacketsPerStep: this.options.minPacketsPerStep,
      minVarianceThreshold: this.options.minVarianceThreshold,
      autoAdvance: this.options.autoAdvance,
      skipDuplicates: this.options.skipDuplicates,
      filterIdlePackets: this.options.filterIdlePackets,
      packetIncludesReportId: this.options.packetIncludesReportId, // Critical for WebHID!
    });

    this.setupEngineEvents();
  }

  /**
   * Set up engine event handlers
   */
  private setupEngineEvents(): void {
    this.engine.on((event) => {
      switch (event.type) {
        case 'packet-received':
          this.captureStatus.packetCount = event.count;
          this.view.onCaptureProgress(this.captureStatus);
          break;
        case 'bytes-detected':
          this.view.onBytesDetected(event.bytes);
          break;
        case 'error':
          this.view.showError(event.message);
          break;
      }
    });
  }

  /**
   * Get the walkthrough engine (for direct access if needed)
   */
  getEngine(): WalkthroughEngine {
    return this.engine;
  }

  /**
   * Get current step info
   */
  getCurrentStepInfo(): StepInfo {
    return this.engine.getCurrentStepInfo();
  }

  /**
   * Get current step
   */
  getCurrentStep(): WalkthroughStep {
    return this.engine.getState().currentStep;
  }

  /**
   * Check if currently capturing
   */
  isCapturing(): boolean {
    return this.captureStatus.isCapturing;
  }

  /**
   * Get capture status
   */
  getCaptureStatus(): CaptureStatus {
    return { ...this.captureStatus };
  }

  /**
   * Get detected buttons
   */
  getDetectedButtons(): DetectedButton[] {
    return [...this.detectedButtons];
  }

  /**
   * Main entry point - run the complete walkthrough
   */
  async run(forceMock?: boolean): Promise<void> {
    this.view.showHeader();

    // Select data source
    let source: DataSource;
    if (forceMock) {
      source = 'mock';
      this.view.showInfo('Using mock data mode');
    } else {
      source = await this.view.promptDataSource();
    }

    if (source === 'exit') {
      return;
    }

    // Initialize reader
    const initialized = await this.initializeReader(source);
    if (!initialized) {
      this.view.showError('Failed to initialize device reader');
      return;
    }

    // Run walkthrough steps
    await this.runSteps();

    // Cleanup
    await this.cleanup();
  }

  /**
   * Initialize the appropriate reader
   */
  private async initializeReader(source: DataSource): Promise<boolean> {
    if (source === 'mock') {
      this.isMockMode = true;
      this.reader = this.readerFactory.createMockReader();
      
      // Set mock device info on engine (generic mock IDs)
      this.engine.setDeviceInfo({
        vendorId: 0x0000,  // Generic mock device
        productId: 0x0000,
        productName: 'Mock Tablet',
        collections: [{ usagePage: 13, usage: 2 }],
        allInterfaces: [13],
        detectedReportId: 2,
      });
      
      this.view.showSuccess('Mock device initialized');
      return true;
    } else {
      this.reader = await this.readerFactory.createDeviceReader();
      if (!this.reader) {
        return false;
      }

      const deviceInfo = this.readerFactory.getDeviceInfo();
      if (deviceInfo) {
        this.engine.setDeviceInfo({
          vendorId: deviceInfo.vendorId,
          productId: deviceInfo.productId,
          productName: deviceInfo.productName,
          collections: deviceInfo.collections || [],
          allInterfaces: deviceInfo.allInterfaces || [],
          dataSourceUsagePage: deviceInfo.dataSourceUsagePage,
        });
      }

      this.view.showSuccess('Device ready');
      return true;
    }
  }

  /**
   * Run through all walkthrough steps
   */
  private async runSteps(): Promise<void> {
    this.engine.start();

    while (true) {
      const currentStep = this.getCurrentStep();

      if (currentStep === 'complete') {
        await this.handleCompletion();
        break;
      }

      if (currentStep === 'step10-metadata') {
        await this.handleMetadataStep();
        continue;
      }

      if (currentStep === 'step9-tablet-buttons') {
        await this.handleButtonDetectionStep();
        continue;
      }

      // Regular gesture step
      await this.handleGestureStep();
    }
  }

  /**
   * Handle a regular gesture capture step
   */
  private async handleGestureStep(): Promise<void> {
    const stepInfo = this.getCurrentStepInfo();
    this.view.showStepInfo(stepInfo);

    // Run capture
    await this.runCapture(stepInfo.gesture);

    // Get navigation action
    const action = await this.view.promptNavigation();
    this.handleNavigation(action);
  }

  /**
   * Handle the button detection step
   */
  private async handleButtonDetectionStep(): Promise<void> {
    const stepInfo = this.getCurrentStepInfo();
    this.view.showStepInfo(stepInfo);

    // Get button count
    this.buttonCount = await this.view.promptButtonCount();

    if (this.buttonCount > 0) {
      await this.runButtonDetection();
    }

    // Navigation
    const action = await this.view.promptNavigation();
    this.handleNavigation(action);
  }

  /**
   * Handle the metadata step
   */
  private async handleMetadataStep(): Promise<void> {
    const stepInfo = this.getCurrentStepInfo();
    this.view.showStepInfo(stepInfo);

    const metadata = await this.view.promptMetadata({
      buttonCount: this.buttonCount,
    });

    // Pass button mappings to engine
    this.engine.setButtonMappings(this.detectedButtons);

    // Submit metadata
    this.engine.submitMetadata({
      name: metadata.name,
      manufacturer: metadata.manufacturer,
      model: metadata.model,
      description: metadata.description || '',
      buttonCount: metadata.buttonCount ?? this.buttonCount,
    });
  }

  /**
   * Handle completion
   */
  private async handleCompletion(): Promise<void> {
    const config = this.engine.getCompleteConfig();
    this.view.showCompletion(config);

    if (config) {
      const { save, filename } = await this.view.promptSaveConfig(config);
      if (save && filename) {
        // View handles the actual saving (platform-specific)
        this.view.showSuccess(`Configuration saved to: ${filename}`);
      }
    }
  }

  /**
   * Run capture for current step
   */
  async runCapture(gesture: GestureType | null): Promise<void> {
    if (!this.reader) return;

    // Reset capture status
    this.captureStatus = {
      packetCount: 0,
      duplicatesFiltered: 0,
      idleFiltered: 0,
      isCapturing: true,
    };

    this.view.onCaptureStart();

    // Start reading - pass report ID for multi-interface device handling
    this.reader.startReading((data, reportId) => {
      this.engine.processPacket(data, reportId);
    });

    this.engine.startCapture();

    // For mock mode with gesture, auto-play
    if (this.isMockMode && gesture && 'playGestureForStep' in this.reader) {
      const mockReader = this.reader as any;
      await mockReader.playGestureForStep(gesture, this.options.gesturePlayDuration);
      await new Promise(resolve => setTimeout(resolve, 500));
    } else {
      // Wait for user to complete gesture
      await this.view.waitForGestureComplete();
    }

    // Stop capture
    this.engine.stopCapture();
    this.reader.stopReading();

    // Update status with filter stats
    const stats = this.engine.getFilterStats();
    this.captureStatus = {
      packetCount: stats.captured,
      duplicatesFiltered: stats.duplicates,
      idleFiltered: stats.idle,
      isCapturing: false,
    };

    this.view.onCaptureComplete(this.captureStatus);
  }

  /**
   * Run interactive button detection
   */
  private async runButtonDetection(): Promise<void> {
    this.detectedButtons = [];
    this.view.showButtonDetectionStart(this.buttonCount);

    for (let i = 1; i <= this.buttonCount; i++) {
      const button = await this.detectSingleButton(i);
      if (button) {
        this.detectedButtons.push(button);
        this.view.showButtonDetected(button);
      } else {
        this.view.showButtonSkipped(i);
      }
    }

    this.view.showButtonDetectionSummary(this.detectedButtons, this.buttonCount);
  }

  /**
   * Detect a single button press
   * Listens for HID packets. Keyboard event listening is platform-specific
   * and should be handled by the view/CLI layer.
   */
  private async detectSingleButton(buttonNumber: number): Promise<DetectedButton | null> {
    if (!this.reader) return null;

    this.view.showButtonDetectionPrompt(buttonNumber);

    return new Promise<DetectedButton | null>((resolve) => {
      let detected: DetectedButton | null = null;
      let finished = false;
      // Track packets with interface type for keyboard HID support
      const seenPackets: Array<{
        status: number;
        scanCode: number;
        interfaceType?: 'digitizer' | 'keyboard';
        modifier?: number;
        keycode?: number;
        consumerCode?: number;
        scrollDelta?: number;
      }> = [];
      const MIN_CONFIRMATIONS = this.options.buttonConfirmations;

      const finish = (result: DetectedButton | null) => {
        if (finished) return;
        finished = true;
        this.reader!.stopReading();
        resolve(result);
      };

      // Set up skip handler (view will call this when user wants to skip)
      const skipPromise = this.view.waitForGestureComplete().then(() => {
        if (!detected) {
          finish(null);
        }
      });

      const dataHandler = (data: Uint8Array, _reportId?: number, interfaceType?: string) => {
        if (finished) return;

        // Handle keyboard HID interface packets (Huion-style tablets)
        if (interfaceType === 'keyboard') {
          const reportId = this.options.packetIncludesReportId ? data[0] : _reportId;

          // Keyboard HID packets:
          // Report ID 3: [03, modifier, keycode, 0, 0, 0, 0, 0] - keyboard shortcuts
          // Report ID 4: [04, consumer_code, 0] - consumer control (media keys)
          // Report ID 5: [05, 0, 0, 0, 0, 0, scroll_delta] - scroll wheel

          if (reportId === 3) {
            // Keyboard shortcut packet
            const modifierIdx = this.options.packetIncludesReportId ? 1 : 0;
            const keycodeIdx = this.options.packetIncludesReportId ? 2 : 1;
            const modifier = data.length > modifierIdx ? data[modifierIdx] : 0;
            const keycode = data.length > keycodeIdx ? data[keycodeIdx] : 0;

            // Skip idle packets (no key pressed)
            if (keycode === 0) return;

            // Create a unique identifier for this button (modifier << 8 | keycode)
            const combinedCode = (modifier << 8) | keycode;
            seenPackets.push({
              status: reportId,
              scanCode: combinedCode,
              interfaceType: 'keyboard',
              modifier,
              keycode,
            });
          } else if (reportId === 4) {
            // Consumer control packet
            const consumerIdx = this.options.packetIncludesReportId ? 1 : 0;
            const consumerCode = data.length > consumerIdx ? data[consumerIdx] : 0;

            // Skip idle packets
            if (consumerCode === 0) return;

            seenPackets.push({
              status: reportId,
              scanCode: consumerCode,
              interfaceType: 'keyboard',
              consumerCode,
            });
          } else if (reportId === 5) {
            // Scroll wheel packet
            const scrollIdx = this.options.packetIncludesReportId ? 6 : 5;
            const scrollDelta = data.length > scrollIdx ? (data[scrollIdx] > 127 ? data[scrollIdx] - 256 : data[scrollIdx]) : 0;

            // Skip idle packets
            if (scrollDelta === 0) return;

            // Use scroll direction as the identifier (positive = up, negative = down)
            const scrollDirection = scrollDelta > 0 ? 1 : -1;
            seenPackets.push({
              status: reportId,
              scanCode: scrollDirection,
              interfaceType: 'keyboard',
              scrollDelta,
            });
          } else {
            // Unknown keyboard report ID, skip
            return;
          }
        } else {
          // Digitizer interface packets (XP-Pen style)
          // Packet structure depends on packetIncludesReportId:
          // Node.js (true):  [reportId, status, scanCode, ...]
          // WebHID (false):  [status, scanCode, ...]
          const statusIndex = this.options.packetIncludesReportId ? 1 : 0;
          const scanCodeIndex = this.options.packetIncludesReportId ? 2 : 1;

          const statusByte = data.length > statusIndex ? data[statusIndex] : 0;
          const scanCode = data.length > scanCodeIndex ? data[scanCodeIndex] : 0;

          // Skip idle packets
          if (scanCode === 0) return;

          // Skip known pen status bytes (160-165, 192)
          if (statusByte >= 0xA0 && statusByte <= 0xA5) return;
          if (statusByte === 0xC0) return;

          // Only process button mode packets:
          //   No driver: 0 (keyboard), 1, 3, 6 (buttons) - scan codes at byte 2
          //   With driver: 240 (0xF0) - bit-flags at byte 1
          const BUTTON_MODE_STATUS = new Set([0, 1, 3, 6, 240]);
          if (!BUTTON_MODE_STATUS.has(statusByte)) return;

          seenPackets.push({ status: statusByte, scanCode, interfaceType: 'digitizer' });
        }

        // Check for enough confirmations
        if (seenPackets.length >= MIN_CONFIRMATIONS) {
          const packetCounts = new Map<string, { count: number; packet: typeof seenPackets[0] }>();
          for (const p of seenPackets) {
            // Create unique key based on interface type and scan code
            const key = `${p.interfaceType || 'digitizer'}-${p.status}-${p.scanCode}`;
            const existing = packetCounts.get(key);
            if (existing) {
              existing.count++;
            } else {
              packetCounts.set(key, { count: 1, packet: p });
            }
          }

          let bestPacket: typeof seenPackets[0] | null = null;
          let bestCount = 0;
          for (const [_key, data] of packetCounts) {
            if (data.count > bestCount) {
              bestCount = data.count;
              bestPacket = data.packet;
            }
          }

          if (bestCount >= MIN_CONFIRMATIONS && bestPacket) {
            detected = {
              buttonNumber,
              statusByte: bestPacket.status,
              scanCode: bestPacket.scanCode,
              interfaceType: bestPacket.interfaceType,
              modifier: bestPacket.modifier,
              keycode: bestPacket.keycode,
              consumerCode: bestPacket.consumerCode,
              scrollDelta: bestPacket.scrollDelta,
            };
            finish(detected);
          }
        }
      };

      this.reader!.startReading(dataHandler);
    });
  }

  /**
   * Handle navigation action
   */
  handleNavigation(action: NavigationAction): boolean {
    switch (action) {
      case 'next':
        this.engine.nextStep();
        return true;
      case 'retry':
        this.engine.resetCurrentStep();
        this.detectedButtons = []; // Reset button detection on retry
        return true;
      case 'previous':
        this.engine.previousStep();
        return true;
      case 'cancel':
        return false;
    }
  }

  /**
   * Manually advance to next step (for simpler UI flows)
   */
  nextStep(): void {
    this.engine.nextStep();
  }

  /**
   * Manually go to previous step
   */
  previousStep(): void {
    this.engine.previousStep();
  }

  /**
   * Reset current step
   */
  resetStep(): void {
    this.engine.resetCurrentStep();
  }

  /**
   * Start capture (for external control)
   */
  startCapture(): void {
    if (!this.reader) return;
    
    this.captureStatus.isCapturing = true;
    this.captureStatus.packetCount = 0;
    
    this.reader.startReading((data, reportId) => {
      this.engine.processPacket(data, reportId);
    });
    this.engine.startCapture();
    this.view.onCaptureStart();
  }

  /**
   * Stop capture (for external control)
   */
  stopCapture(): void {
    if (!this.reader) return;
    
    this.engine.stopCapture();
    this.reader.stopReading();
    
    const stats = this.engine.getFilterStats();
    this.captureStatus = {
      packetCount: stats.captured,
      duplicatesFiltered: stats.duplicates,
      idleFiltered: stats.idle,
      isCapturing: false,
    };
    
    this.view.onCaptureComplete(this.captureStatus);
  }

  /**
   * Set the reader directly (for web UI where reader is created externally)
   */
  setReader(reader: IHIDReader): void {
    this.reader = reader;
  }

  /**
   * Set device info on engine
   */
  setDeviceInfo(info: DeviceConnectionInfo): void {
    this.engine.setDeviceInfo({
      vendorId: info.vendorId,
      productId: info.productId,
      productName: info.productName,
      collections: info.collections || [],
      allInterfaces: info.allInterfaces || [],
      dataSourceUsagePage: info.dataSourceUsagePage,
    });
  }

  /**
   * Process a packet (for external feeding)
   */
  processPacket(data: Uint8Array, reportId?: number): void {
    this.engine.processPacket(data, reportId);
  }

  /**
   * Get generated config
   */
  getGeneratedConfig(): DeviceByteCodeMappings | null {
    return this.engine.getByteCodeMappings();
  }

  /**
   * Get complete config
   */
  getCompleteConfig(): any {
    return this.engine.getCompleteConfig();
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.reader) {
      try {
        this.reader.stopReading();
        await this.reader.close();
      } catch {
        // Ignore cleanup errors
      }
      this.reader = null;
    }
  }
}

// Re-export types
export type { WalkthroughStep, StepInfo, GestureType, ByteAnalysis, ButtonMapping };