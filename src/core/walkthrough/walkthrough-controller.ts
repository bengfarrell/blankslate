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
  statusByte: number;
  scanCode: number;
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
      
      // Set mock device info on engine
      this.engine.setDeviceInfo({
        vendorId: 0x28bd,
        productId: 0x2904,
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

    // Start reading
    this.reader.startReading((data) => {
      this.engine.processPacket(data);
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
   */
  private async detectSingleButton(buttonNumber: number): Promise<DetectedButton | null> {
    if (!this.reader) return null;

    this.view.showButtonDetectionPrompt(buttonNumber);

    return new Promise<DetectedButton | null>((resolve) => {
      let detected: DetectedButton | null = null;
      let finished = false;
      const seenPackets: Array<{ status: number; scanCode: number }> = [];
      const MIN_CONFIRMATIONS = this.options.buttonConfirmations;

      const finish = () => {
        if (finished) return;
        finished = true;
        this.reader!.stopReading();
        resolve(detected);
      };

      // Set up skip handler (view will call this when user wants to skip)
      const skipPromise = this.view.waitForGestureComplete().then(() => {
        if (!detected) {
          finish();
        }
      });

      const dataHandler = (data: Uint8Array) => {
        if (finished) return;

        const statusByte = data[0];
        const scanCode = data.length > 1 ? data[1] : 0;

        // Skip idle packets
        if (scanCode === 0) return;

        // Skip known pen status bytes
        if (statusByte >= 0xA0 && statusByte <= 0xA5) return;
        if (statusByte === 0xC0) return;

        seenPackets.push({ status: statusByte, scanCode });

        // Check for enough confirmations
        if (seenPackets.length >= MIN_CONFIRMATIONS) {
          const scanCodeCounts = new Map<number, { count: number; status: number }>();
          for (const p of seenPackets) {
            const existing = scanCodeCounts.get(p.scanCode);
            if (existing) {
              existing.count++;
            } else {
              scanCodeCounts.set(p.scanCode, { count: 1, status: p.status });
            }
          }

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

          if (bestCount >= MIN_CONFIRMATIONS) {
            detected = {
              buttonNumber,
              statusByte: bestStatus,
              scanCode: bestScanCode,
            };
            finish();
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
    
    this.reader.startReading((data) => {
      this.engine.processPacket(data);
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
  processPacket(data: Uint8Array): void {
    this.engine.processPacket(data);
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

