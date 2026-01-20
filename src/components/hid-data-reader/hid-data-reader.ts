import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { styles } from './hid-data-reader.styles.js';

// Import from shared core - USE THE CONTROLLER
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
  type WalkthroughStep,
  MockHIDReader,
  createMockHIDReader,
  WebHIDReader,
  createWebHIDReader,
} from '../../core/index.js';

import { DeviceFinder, type DeviceConnectionResult } from '../../utils/finddevice.js';
import '../hid-devices/hid-devices.js';
import type { DeviceStream, DeviceDetails } from '../device-list-minimal/device-list-minimal.js';
import type { ByteData, DeviceInfo } from '../bytes-display/bytes-display.js';
import '../hid-json-config/hid-json-config.js';
import '../hid-walkthrough-progress/hid-walkthrough-progress.js';
import '@spectrum-web-components/button/sp-button.js';
import '@spectrum-web-components/action-button/sp-action-button.js';
import '@spectrum-web-components/textfield/sp-textfield.js';
import '@spectrum-web-components/field-label/sp-field-label.js';
import '@spectrum-web-components/help-text/sp-help-text.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-play.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-link.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-refresh.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-document.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-save-floppy.js';
import '../device-metadata-form/device-metadata-form.js';
import { WALKTHROUGH_STRINGS } from '../../strings/walkthrough-strings.js';
import type { IHIDReader } from '../../core/hid/hid-interface.js';

const strings = WALKTHROUGH_STRINGS;

/**
 * HID Data Reader component
 * Uses the SHARED WalkthroughController for all walkthrough logic
 * This ensures CLI and Web have identical behavior
 */
@customElement('hid-data-reader')
export class HidDataReader extends LitElement implements IWalkthroughView {
  static styles = styles;

  // SHARED CONTROLLER - same logic as CLI
  private controller: WalkthroughController;

  // Device readers
  private mockReader: MockHIDReader | null = null;
  private webReaders: WebHIDReader[] = [];
  private deviceFinder?: DeviceFinder;
  private activeReader: IHIDReader | null = null;

  // UI State
  @state() private isPlaying = false;
  @state() private isMockMode = true;
  @state() private walkthroughStep: WalkthroughStep = 'idle';
  @state() private stepInfo: StepInfo | null = null;
  @state() private captureStatus: CaptureStatus = { packetCount: 0, duplicatesFiltered: 0, idleFiltered: 0, isCapturing: false };
  @state() private detectedBytes: ByteAnalysis[] = [];
  @state() private messages: Array<{ type: 'success' | 'error' | 'info'; text: string }> = [];

  // Button detection state
  @state() private detectedButtons: DetectedButton[] = [];
  @state() private currentButtonPrompt: number | null = null;
  @state() private buttonCount = 0;

  // Device state
  @state() private isRealDevice = false;
  @state() private realDeviceName = '';
  @state() private isConnecting = false;
  @state() private completeConfig: any = null;
  @state() private isConfigPanelExpanded = true;
  @state() private deviceDataStreams: Map<number, { lastPacket: string; packetCount: number; lastUpdate: number }> = new Map();
  @state() private currentActiveDeviceIndex: number | undefined = undefined;

  // Pending promise resolvers for async prompts
  private pendingDataSource: ((value: DataSource) => void) | null = null;
  private pendingNavigation: ((value: NavigationAction) => void) | null = null;
  private pendingButtonCount: ((value: number) => void) | null = null;
  private pendingMetadata: ((value: MetadataFormData) => void) | null = null;
  private pendingSaveConfig: ((value: { save: boolean; filename?: string }) => void) | null = null;
  private pendingGestureComplete: (() => void) | null = null;

  // Packet display
  private capturedPackets: Uint8Array[] = [];
  private lastCapturedPackets: Uint8Array[] = [];
  private latestDisplayPacket: Uint8Array | null = null;

  // Device metadata
  private deviceMetadata: DeviceConnectionInfo = {
    vendorId: 0,
    productId: 0,
    productName: '',
  };

  constructor() {
    super();
    
    // Create controller with this component as the view
    // Set packetIncludesReportId: false for WebHID since browser API strips report ID
    this.controller = new WalkthroughController(
      this, // IWalkthroughView
      this._createReaderFactory(),
      {
        autoPlayMockGestures: true,
        gesturePlayDuration: 2000,
        buttonConfirmations: 3,
        packetIncludesReportId: false, // WebHID browser API strips report ID
      }
    );
    
    // Subscribe to engine events for real-time updates
    const engine = this.controller.getEngine();
    engine.on((event) => {
      switch (event.type) {
        case 'packet-received':
          this.captureStatus.packetCount = event.count;
          if (this.captureStatus.isCapturing) {
            this.capturedPackets.push(new Uint8Array(event.packet));
          }
          this.requestUpdate();
          break;
        case 'bytes-detected':
          this.detectedBytes = event.bytes;
          this.requestUpdate();
          break;
        case 'step-changed':
          this.walkthroughStep = event.step;
          this.stepInfo = this.controller.getCurrentStepInfo();
          
          // Handle step 9 (button detection) specially - use interactive flow
          if (event.step === 'step9-tablet-buttons') {
            // Reset state for button detection
            this.capturedPackets = [];
            this.detectedButtons = [];
            this.currentButtonPrompt = null;
            this.captureStatus = { packetCount: 0, duplicatesFiltered: 0, idleFiltered: 0, isCapturing: false };
            
            // Show button count prompt
            this.pendingButtonCount = (count: number) => {
              this.buttonCount = count;
              if (count > 0) {
                // Start interactive button detection
                this._startButtonDetection();
              }
            };
            this.requestUpdate();
            break;
          }
          
          // Auto-start capture for gesture steps (steps 1-8)
          // This ensures data is captured for both mock and real device modes
          // Note: step9 is handled above with its own flow
          const isGestureStep = event.step.startsWith('step') && 
                               event.step !== 'step10-metadata';
          if (isGestureStep) {
            // Reset and start capture for this step
            this.capturedPackets = [];
            this.captureStatus = { packetCount: 0, duplicatesFiltered: 0, idleFiltered: 0, isCapturing: true };
            engine.startCapture();
          } else {
            // Stop capture for non-gesture steps
            if (this.captureStatus.isCapturing) {
              engine.stopCapture();
              this.captureStatus.isCapturing = false;
            }
          }
          
          this.requestUpdate();
          break;
        case 'config-generated':
          // Config is being generated
          break;
        case 'walkthrough-complete':
          this.completeConfig = event.config;
          this.walkthroughStep = 'complete';
          this.isConfigPanelExpanded = true;
          this.requestUpdate();
          break;
        case 'error':
          this.showError(event.message);
          break;
      }
    });
  }

  private _createReaderFactory(): IReaderFactory {
    const self = this;
    return {
      createMockReader(): IHIDReader {
        self.isMockMode = true;
        self.mockReader = createMockHIDReader({
          productName: 'Mock Graphics Tablet',
          vendorId: 0x0000,  // Generic mock device
          productId: 0x0000,
        });
        return self.mockReader;
      },
      async createDeviceReader(): Promise<IHIDReader | null> {
        self.isMockMode = false;
        // For web, we'll handle device connection separately
        // Return the first web reader if available
        if (self.webReaders.length > 0 && self.webReaders[0].isOpen) {
          return self.webReaders[0];
        }
        return null;
      },
      getDeviceInfo(): DeviceConnectionInfo | null {
        return self.deviceMetadata.vendorId ? self.deviceMetadata : null;
      }
    };
  }

  connectedCallback() {
    super.connectedCallback();
    this._setupMockReader();
    this._setupDeviceFinder();
    this._checkForRealDevice();
    
    // Keyboard handler for navigation
    this._keyHandler = (e: KeyboardEvent) => {
      // Skip if typing in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      // Enter key: advance to next step if data captured
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
        const hasData = this.captureStatus.packetCount > 0;
        if (hasData && !this.isPlaying && this.stepInfo) {
          e.preventDefault();
          this._handleStepNext();
        }
      }
      
      // DEBUG: Press '9' to jump to step 9 for testing
      if (e.key === '9' && !e.ctrlKey && !e.metaKey) {
        console.log('[DEBUG] Jumping to step 9');
        const engine = this.controller.getEngine();
        engine.goToStep('step9-tablet-buttons');
        this.walkthroughStep = 'step9-tablet-buttons';
        this.stepInfo = this.controller.getCurrentStepInfo();
        this.requestUpdate();
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }
  
  private _keyHandler: ((e: KeyboardEvent) => void) | null = null;

  disconnectedCallback() {
    super.disconnectedCallback();
    this.controller.cleanup();
    this._disconnectRealDevice();
    
    // Clean up keyboard handler
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
    }
  }

  // ============================================================================
  // IWalkthroughView Implementation - SAME INTERFACE AS CLI
  // ============================================================================

  showHeader(): void {
    // Header is rendered as part of the component
  }

  showStepInfo(stepInfo: StepInfo): void {
    this.stepInfo = stepInfo;
    this.walkthroughStep = stepInfo.id as WalkthroughStep;
    this.detectedBytes = [];
    this.messages = [];
    this.capturedPackets = [];
    this.requestUpdate();
  }

  showCompletion(config: any): void {
    this.walkthroughStep = 'complete';
    this.completeConfig = config;
    this.isConfigPanelExpanded = true;
    this.requestUpdate();
  }

  showError(message: string): void {
    this.messages = [...this.messages, { type: 'error', text: message }];
    this.requestUpdate();
  }

  showSuccess(message: string): void {
    this.messages = [...this.messages, { type: 'success', text: message }];
    this.requestUpdate();
  }

  showInfo(message: string): void {
    this.messages = [...this.messages, { type: 'info', text: message }];
    this.requestUpdate();
  }

  onCaptureStart(): void {
    this.captureStatus = { ...this.captureStatus, isCapturing: true, packetCount: 0 };
    this.capturedPackets = [];
    this.requestUpdate();
  }

  onCaptureProgress(status: CaptureStatus): void {
    this.captureStatus = { ...status };
    this.requestUpdate();
  }

  onCaptureComplete(status: CaptureStatus): void {
    this.captureStatus = { ...status, isCapturing: false };
    this.lastCapturedPackets = [...this.capturedPackets];
    this.requestUpdate();
  }

  onBytesDetected(bytes: ByteAnalysis[]): void {
    this.detectedBytes = bytes;
    this.requestUpdate();
  }

  async promptDataSource(): Promise<DataSource> {
    return new Promise((resolve) => {
      this.pendingDataSource = resolve;
      this.requestUpdate();
    });
  }

  async promptNavigation(): Promise<NavigationAction> {
    return new Promise((resolve) => {
      this.pendingNavigation = resolve;
      this.requestUpdate();
    });
  }

  async promptButtonCount(): Promise<number> {
    return new Promise((resolve) => {
      this.pendingButtonCount = resolve;
      this.requestUpdate();
    });
  }

  async promptMetadata(defaults?: Partial<MetadataFormData>): Promise<MetadataFormData> {
    return new Promise((resolve) => {
      this.pendingMetadata = resolve;
      this.requestUpdate();
    });
  }

  async promptSaveConfig(config: any): Promise<{ save: boolean; filename?: string }> {
    return new Promise((resolve) => {
      this.pendingSaveConfig = resolve;
      this.requestUpdate();
    });
  }

  showButtonDetectionStart(totalButtons: number): void {
    this.buttonCount = totalButtons;
    this.detectedButtons = [];
    this.showInfo(`We'll now detect each of your ${totalButtons} button(s).`);
    this.requestUpdate();
  }

  showButtonDetectionPrompt(buttonNumber: number): void {
    this.currentButtonPrompt = buttonNumber;
    this.requestUpdate();
  }

  showButtonDetected(button: DetectedButton): void {
    this.detectedButtons = [...this.detectedButtons, button];
    this.currentButtonPrompt = null;
    this.requestUpdate();
  }

  showButtonSkipped(buttonNumber: number): void {
    this.currentButtonPrompt = null;
    this.showInfo(`Button ${buttonNumber} skipped`);
    this.requestUpdate();
  }

  showButtonDetectionSummary(buttons: DetectedButton[], totalExpected: number): void {
    this.detectedButtons = buttons;
    this.currentButtonPrompt = null;
    this.requestUpdate();
  }

  async waitForGestureComplete(): Promise<void> {
    return new Promise((resolve) => {
      this.pendingGestureComplete = resolve;
    });
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private handleDataSourceSelect(source: DataSource): void {
    if (this.pendingDataSource) {
      this.pendingDataSource(source);
      this.pendingDataSource = null;
    }
  }


  private handleButtonCountSubmit(count: number): void {
    if (this.pendingButtonCount) {
      this.pendingButtonCount(count);
      this.pendingButtonCount = null;
    }
  }

  private handleMetadataSubmit(e: CustomEvent<MetadataFormData>): void {
    // If using the async controller flow (pendingMetadata is set)
    if (this.pendingMetadata) {
      this.pendingMetadata(e.detail);
      this.pendingMetadata = null;
      return;
    }
    
    // Direct mode: Submit metadata to engine and generate config
    const metadata = e.detail as MetadataFormData;
    const engine = this.controller.getEngine();
    engine.submitMetadata({
      name: metadata.name,
      manufacturer: metadata.manufacturer,
      model: metadata.model,
      description: metadata.description ?? '',
      buttonCount: metadata.buttonCount ?? 0,
    });
    
    // Get the generated config
    this.completeConfig = engine.getCompleteConfig() ?? null;
    this.walkthroughStep = 'complete';
    this.pendingSaveConfig = () => {}; // Enable the save prompt
    this.requestUpdate();
  }
  
  private handleMetadataCancel(): void {
    // Reset walkthrough
    this._resetWalkthrough();
  }

  /**
   * Start interactive button detection - prompts user to press each button 3 times
   */
  private async _startButtonDetection(): Promise<void> {
    const engine = this.controller.getEngine();
    const MIN_CONFIRMATIONS = 3;
    
    this.detectedButtons = [];
    
    for (let buttonNum = 1; buttonNum <= this.buttonCount; buttonNum++) {
      // Show prompt for this button
      this.currentButtonPrompt = buttonNum;
      this.capturedPackets = [];
      this.captureStatus = { packetCount: 0, duplicatesFiltered: 0, idleFiltered: 0, isCapturing: true };
      engine.startCapture();
      this.requestUpdate();
      
      // Wait for button detection or skip
      const detected = await this._detectSingleButton(buttonNum, MIN_CONFIRMATIONS);
      
      engine.stopCapture();
      this.captureStatus.isCapturing = false;
      
      if (detected) {
        this.detectedButtons = [...this.detectedButtons, detected];
      }
      
      this.currentButtonPrompt = null;
      this.requestUpdate();
    }
    
    // Store all button mappings in engine for config generation
    engine.setButtonMappings(this.detectedButtons.map(btn => ({
      buttonNumber: btn.buttonNumber,
      statusByte: btn.statusByte,
      scanCode: btn.scanCode,
    })));
    
    // Show summary and enable navigation
    this.showInfo(`Detected ${this.detectedButtons.length} of ${this.buttonCount} buttons`);
    this.requestUpdate();
  }
  
  /**
   * Detect a single button press with confirmation
   * Processes packets as they arrive and looks for 3 matching patterns
   * that differ from "idle" state
   * Also listens for keyboard events (for when driver is active)
   */
  private async _detectSingleButton(
    buttonNumber: number,
    minConfirmations: number
  ): Promise<DetectedButton | null> {
    const engine = this.controller.getEngine();
    console.log(`[ButtonDetect] Starting button ${buttonNumber}`);

    // Status bytes that indicate button packets (not pen data)
    const BUTTON_STATUS_BYTES = [0xF0, 0x02, 0x03]; // 240, 2, 3 - common button status bytes

    return new Promise((resolve) => {
      // Track ONLY button packet patterns (status 0xF0 etc), ignoring pen data
      const buttonPatterns = new Map<string, { packet: Uint8Array; count: number }>();
      // Track keyboard events
      const keyboardPatterns = new Map<string, { event: KeyboardEvent; count: number }>();
      let lastProcessedIndex = 0;
      let resolved = false;
      let logCounter = 0;

      // Keyboard event handler
      const handleKeyDown = (e: KeyboardEvent) => {
        if (resolved) return;

        // Ignore modifier-only keys
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
          return;
        }

        // Create a unique key for this keyboard event
        const keySignature = `${e.code}-${e.key}-${e.ctrlKey}-${e.shiftKey}-${e.altKey}-${e.metaKey}`;

        console.log(`[ButtonDetect] Keyboard event: ${keySignature}`);

        const existing = keyboardPatterns.get(keySignature);
        if (existing) {
          existing.count++;

          // Check if we have enough confirmations
          if (existing.count >= minConfirmations) {
            console.log(`[ButtonDetect] Button ${buttonNumber} DETECTED via keyboard: ${keySignature}, count=${existing.count}`);
            resolved = true;
            clearInterval(interval);
            window.removeEventListener('keydown', handleKeyDown);

            resolve({
              buttonNumber,
              key: e.key,
              code: e.code,
              ctrlKey: e.ctrlKey || undefined,
              shiftKey: e.shiftKey || undefined,
              altKey: e.altKey || undefined,
              metaKey: e.metaKey || undefined,
            });
            return;
          }
        } else {
          keyboardPatterns.set(keySignature, { event: e, count: 1 });
        }
      };

      // Add keyboard listener
      window.addEventListener('keydown', handleKeyDown);

      // Set up skip handler
      this.pendingGestureComplete = () => {
        console.log(`[ButtonDetect] Button ${buttonNumber} skipped`);
        resolved = true;
        clearInterval(interval);
        window.removeEventListener('keydown', handleKeyDown);
        resolve(null);
      };

      // Process new packets incrementally - read directly from engine's buffer
      const processNewPackets = () => {
        if (resolved) return;

        // Get packets directly from the engine's capture buffer
        const enginePackets = engine.getCapturedPackets();

        // Log status every second
        logCounter++;
        if (logCounter % 20 === 0) {
          const patterns = Array.from(buttonPatterns.entries())
            .map(([k, d]) => `${k.substring(0, 20)}...(${d.count})`);
          const keyPatterns = Array.from(keyboardPatterns.entries())
            .map(([k, d]) => `${k}(${d.count})`);
          console.log(`[ButtonDetect] Button ${buttonNumber}: ${enginePackets.length} HID packets, ${buttonPatterns.size} HID patterns, ${keyboardPatterns.size} key patterns`);
          if (keyPatterns.length > 0) {
            console.log(`  Key patterns: [${keyPatterns.join(', ')}]`);
          }
        }

        // Only process packets we haven't seen yet
        const newPackets = enginePackets.slice(lastProcessedIndex);
        lastProcessedIndex = enginePackets.length;

        for (const packet of newPackets) {
          if (packet.length < 2) continue;

          const statusByte = packet[0];
          const scanCode = packet[1];

          // Only track button packets (status 0xF0, 0x02, 0x03, etc)
          // Skip pen data (0xA0, 0xA1, 0xC0, etc) and "no button" state (scanCode 0)
          if (!BUTTON_STATUS_BYTES.includes(statusByte)) {
            continue;
          }

          // Skip "no button pressed" state (scanCode 0 with button status)
          if (scanCode === 0) {
            continue;
          }

          // Create a key from the packet bytes
          const key = Array.from(packet).join('-');

          const existing = buttonPatterns.get(key);
          if (existing) {
            existing.count++;

            // Check if we have enough confirmations
            if (existing.count >= minConfirmations) {
              console.log(`[ButtonDetect] Button ${buttonNumber} DETECTED via HID: scanCode=${scanCode}, status=${statusByte}, count=${existing.count}`);
              resolved = true;
              clearInterval(interval);
              window.removeEventListener('keydown', handleKeyDown);

              resolve({
                buttonNumber,
                scanCode,
                statusByte,
              });
              return;
            }
          } else {
            buttonPatterns.set(key, { packet: new Uint8Array(packet), count: 1 });
          }
        }
      };

      // Check for new packets periodically
      const interval = setInterval(processNewPackets, 50);

      // No timeout - user must skip or press button
    });
  }

  private handleSaveConfig(save: boolean): void {
    if (this.pendingSaveConfig) {
      if (save && this.completeConfig) {
        // Create download
        const blob = new Blob([JSON.stringify(this.completeConfig, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.completeConfig.name?.toLowerCase().replace(/\s+/g, '_') || 'tablet'}_config.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.pendingSaveConfig({ save: true, filename: a.download });
      } else {
        this.pendingSaveConfig({ save: false });
      }
      this.pendingSaveConfig = null;
    }
  }

  private handleGestureComplete(): void {
    // This is only used for the controller's waitForGestureComplete() promise
    // (e.g., during button detection skip)
    if (this.pendingGestureComplete) {
      this.pendingGestureComplete();
      this.pendingGestureComplete = null;
    }
  }

  private handleSkipButton(): void {
    this.handleGestureComplete();
  }

  private async handleSimulate(): Promise<void> {
    if (!this.mockReader || this.isPlaying || !this.stepInfo?.gesture) return;

    this.isPlaying = true;
    
    // Reset and start capture for this simulation
    const engine = this.controller.getEngine();
    engine.startCapture();
    this.captureStatus.isCapturing = true;
    this.capturedPackets = [];
    this.requestUpdate();

    // Play the gesture on mock reader
    await this.mockReader.playGestureForStep(this.stepInfo.gesture, 2000);

    // Wait a bit for remaining packets
    await new Promise(resolve => setTimeout(resolve, 200));

    // Stop capture and update stats
    engine.stopCapture();
    this.isPlaying = false;
    
    const stats = engine.getFilterStats();
    this.captureStatus = {
      packetCount: stats.captured,
      duplicatesFiltered: stats.duplicates,
      idleFiltered: stats.idle,
      isCapturing: false,
    };
    
    // Get detected bytes
    const stepData = engine.getStepData(this.walkthroughStep);
    if (stepData) {
      this.detectedBytes = stepData.detectedBytes;
    }

    this.requestUpdate();
  }

  private async handleStartWalkthrough(): Promise<void> {
    console.log('[HID] handleStartWalkthrough called');
    // Determine which reader to use
    const useMock = !this.isRealDevice || this.webReaders.length === 0;
    
    if (useMock) {
      this.isMockMode = true;
      this.controller.setReader(this.mockReader!);
      this.controller.setDeviceInfo({
        vendorId: 0x0000,  // Generic mock device
        productId: 0x0000,
        productName: 'Mock Tablet',
      });
    } else {
      this.isMockMode = false;
      this.controller.setReader(this.webReaders[0]);
      this.controller.setDeviceInfo(this.deviceMetadata);
    }
    
    // Start the engine directly (web uses event-driven flow, not blocking run())
    const engine = this.controller.getEngine();
    engine.start();
    
    // Get the current step info and update UI
    this.stepInfo = this.controller.getCurrentStepInfo();
    this.walkthroughStep = this.controller.getCurrentStep();
    this.showInfo(this.isMockMode ? 'Using mock data' : `Connected to ${this.realDeviceName}`);
    this.requestUpdate();
  }

  private handleReset(): void {
    this.controller.resetStep();
    this.capturedPackets = [];
    this.detectedBytes = [];
    this.detectedButtons = [];
    this.currentButtonPrompt = null;
    this.pendingNavigation = null;
    this.requestUpdate();
  }

  // ============================================================================
  // Render
  // ============================================================================

  render() {
    return html`
      <div class="page-header">
        <div class="header-info">
          <h1>BlankSlate Config Generator</h1>
        </div>
        <div class="header-controls">
          ${this._renderDeviceStatus()}
          ${this._renderMessages()}
        </div>
      </div>

      <div class="content">
        ${this._renderCurrentStep()}
        ${this.deviceDataStreams.size > 0 ? this._renderDeviceStreams() : ''}
      </div>
    `;
  }

  private _renderMessages() {
    return html`
      ${this.messages.map(msg => html`
        <span class="message ${msg.type}">${msg.text}</span>
      `)}
    `;
  }

  private _renderDeviceStatus() {
    // Only show connect button when not connected - device info is shown in Device Interfaces section
    if (this.isRealDevice) {
      return '';
    }
    return html`
      <sp-button
        size="s"
        variant="accent"
        data-spectrum-pattern="button-accent"
        ?disabled="${this.isConnecting}"
        @click="${this._connectRealDevice}">
        <sp-icon-link slot="icon"></sp-icon-link>
        ${this.isConnecting ? 'Connecting...' : 'Connect Real Tablet'}
      </sp-button>
    `;
  }

  private _renderCurrentStep() {
    // Data source selection (first step)
    if (this.pendingDataSource) {
      return this._renderDataSourceSelection();
    }

    // Idle - waiting to start
    if (this.walkthroughStep === 'idle' || !this.stepInfo) {
      return this._renderIdleState();
    }

    // Completion
    if (this.walkthroughStep === 'complete') {
      return this._renderCompletion();
    }

    // Metadata step
    if (this.walkthroughStep === 'step10-metadata') {
      return this._renderMetadataStep();
    }

    // Button detection step
    if (this.walkthroughStep === 'step9-tablet-buttons') {
      return this._renderButtonDetectionStep();
    }

    // Regular gesture step
    return this._renderGestureStep();
  }

  private _renderIdleState() {
    return html`
      <div class="section walkthrough">
        <h2>${strings.header.emoji} ${strings.header.title}</h2>
        <p>This walkthrough will help you configure your graphics tablet.</p>
        <sp-button
          variant="accent"
          @click="${() => this.handleStartWalkthrough()}">
          Start Walkthrough
        </sp-button>
      </div>
    `;
  }

  private _renderDataSourceSelection() {
    return html`
      <div class="section walkthrough">
        <h3>Select Data Source</h3>
        <div class="button-row">
          <sp-button
            variant="secondary"
            @click=${() => this.handleDataSourceSelect('mock')}>
            <sp-icon-play slot="icon"></sp-icon-play>
            Use Mock Data
          </sp-button>
          <sp-button
            variant="accent"
            @click=${() => this.handleDataSourceSelect('device')}
            ?disabled="${!this.isRealDevice}">
            <sp-icon-link slot="icon"></sp-icon-link>
            Use Real Device ${!this.isRealDevice ? '(connect first)' : ''}
          </sp-button>
          <sp-button
            variant="negative"
            @click=${() => this.handleDataSourceSelect('exit')}>
            Cancel
          </sp-button>
        </div>
      </div>
    `;
  }

  private _renderGestureStep() {
    const info = this.stepInfo!;
    const hasData = this.captureStatus.packetCount > 0;

    return html`
      <div class="section walkthrough active">
        <div class="step-header">
          <h3>Step ${info.number}/10: ${info.title}</h3>
          <sp-action-button
            quiet
            data-spectrum-pattern="action-button"
            @click="${this.handleReset}"
            label="Reset"
            aria-label="Reset">
            <sp-icon-refresh slot="icon"></sp-icon-refresh>
          </sp-action-button>
          <hid-walkthrough-progress currentStep="${info.number - 1}" totalSteps="10"></hid-walkthrough-progress>
        </div>

        <div class="step-description">
          <p>${info.description}</p>
          <p class="instructions">${info.instructions}</p>
        </div>

        ${this._renderCaptureStatus()}

        ${this._renderStepNavigation(hasData)}
      </div>
    `;
  }

  private _renderStepNavigation(hasData: boolean) {
    return html`
      <div class="navigation-buttons">
        ${this.isMockMode ? html`
          <sp-button
            variant="secondary"
            data-spectrum-pattern="button-secondary"
            ?disabled=${this.isPlaying}
            @click=${this.handleSimulate}>
            ${this.isPlaying ? 'Simulating...' : strings.ui.buttons.simulate}
          </sp-button>
        ` : ''}
        <sp-button
          variant="accent"
          data-spectrum-pattern="button-accent"
          ?disabled=${!hasData || this.isPlaying}
          @click=${() => this._handleStepNext()}>
          ${strings.ui.buttons.next} →
        </sp-button>
        <sp-button
          variant="secondary"
          data-spectrum-pattern="button-secondary"
          @click=${() => this._handleStepRetry()}>
          Retry
        </sp-button>
        <sp-button
          variant="secondary"
          data-spectrum-pattern="button-secondary"
          ?disabled=${this.walkthroughStep === 'step1-horizontal'}
          @click=${() => this._handleStepPrevious()}>
          ← Back
        </sp-button>
        <sp-button
          variant="negative"
          data-spectrum-pattern="button-negative"
          @click=${() => this._resetWalkthrough()}>
          Cancel
        </sp-button>
        ${this._renderDetectedBytes()}
      </div>
    `;
  }
  
  private _handleStepNext(): void {
    const engine = this.controller.getEngine();
    
    // Stop capture and process data
    engine.stopCapture();
    
    // Get detected bytes
    const stepData = engine.getStepData(this.walkthroughStep);
    if (stepData) {
      this.detectedBytes = stepData.detectedBytes;
    }
    
    // Advance to next step
    engine.nextStep();
    this.stepInfo = this.controller.getCurrentStepInfo();
    this.walkthroughStep = this.controller.getCurrentStep();
    this.detectedBytes = [];
    this.capturedPackets = [];
    this.requestUpdate();
  }
  
  private _handleStepRetry(): void {
    const engine = this.controller.getEngine();
    engine.resetCurrentStep();
    
    // Restart capture
    this.capturedPackets = [];
    this.captureStatus = { packetCount: 0, duplicatesFiltered: 0, idleFiltered: 0, isCapturing: true };
    engine.startCapture();
    this.detectedBytes = [];
    this.requestUpdate();
  }
  
  private _handleStepPrevious(): void {
    const engine = this.controller.getEngine();
    engine.stopCapture();
    engine.previousStep();
    this.stepInfo = this.controller.getCurrentStepInfo();
    this.walkthroughStep = this.controller.getCurrentStep();
    this.requestUpdate();
  }

  private _renderButtonDetectionStep() {
    const info = this.stepInfo!;
    const hasData = this.captureStatus.packetCount > 0;
    
    return html`
      <div class="section walkthrough active">
        <div class="step-header">
          <h3>Step ${info.number}/10: ${info.title}</h3>
          <sp-action-button quiet data-spectrum-pattern="action-button" @click="${this.handleReset}" label="Reset" aria-label="Reset">
            <sp-icon-refresh slot="icon"></sp-icon-refresh>
          </sp-action-button>
          <hid-walkthrough-progress currentStep="${info.number - 1}" totalSteps="10"></hid-walkthrough-progress>
        </div>

        <div class="step-description">
          <p>${info.description}</p>
          <p class="instructions">${info.instructions}</p>
        </div>

        ${this._renderCaptureStatus()}

        ${this.pendingButtonCount ? html`
          <div class="button-count-prompt" data-spectrum-pattern="form">
            <sp-field-label for="buttonCountInput" data-spectrum-pattern="field-label">How many tablet buttons does your device have?</sp-field-label>
            <sp-textfield
              type="number"
              id="buttonCountInput"
              data-spectrum-pattern="textfield"
              min="0"
              max="20"
              value="0"
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === 'Enter') {
                  const input = e.target as HTMLInputElement;
                  this.handleButtonCountSubmit(parseInt(input.value) || 0);
                }
              }}>
            </sp-textfield>
            <sp-button
              variant="accent"
              data-spectrum-pattern="button-accent"
              @click=${() => {
                const input = this.shadowRoot?.getElementById('buttonCountInput') as HTMLInputElement;
                this.handleButtonCountSubmit(parseInt(input?.value) || 0);
              }}>
              Continue
            </sp-button>
          </div>
        ` : ''}

        ${this.currentButtonPrompt !== null ? html`
          <div class="button-prompt">
            <p>Press Button ${this.currentButtonPrompt} three times</p>
            <sp-button
              variant="secondary"
              data-spectrum-pattern="button-secondary"
              @click=${this.handleSkipButton}>
              Skip this button
            </sp-button>
          </div>
        ` : ''}

        ${this.detectedButtons.length > 0 ? html`
          <div class="button-summary">
            <h4>Detected Buttons:</h4>
            ${this.detectedButtons.map(btn => html`
              <div class="detected-button">
                ${btn.key ? html`
                  ✓ Button ${btn.buttonNumber}: ${btn.ctrlKey ? 'Ctrl+' : ''}${btn.shiftKey ? 'Shift+' : ''}${btn.altKey ? 'Alt+' : ''}${btn.metaKey ? 'Meta+' : ''}${btn.key} (${btn.code})
                ` : html`
                  ✓ Button ${btn.buttonNumber}: scanCode=${btn.scanCode}, status=${btn.statusByte}
                `}
              </div>
            `)}
          </div>
        ` : ''}

        ${!this.pendingButtonCount && this.currentButtonPrompt === null ? this._renderStepNavigation(hasData) : ''}
      </div>
    `;
  }

  private _renderMetadataStep() {
    const info = this.stepInfo!;
    return html`
      <div class="section walkthrough active">
        <div class="step-header">
          <h3>Step ${info.number}/10: ${info.title}</h3>
          <hid-walkthrough-progress currentStep="${info.number - 1}" totalSteps="10"></hid-walkthrough-progress>
        </div>

        <div class="step-description">
          <p>${info.description}</p>
        </div>

        <device-metadata-form
          .suggestedButtonCount=${this.buttonCount}
          @metadata-submit=${this.handleMetadataSubmit}
          @metadata-cancel=${this.handleMetadataCancel}>
        </device-metadata-form>
      </div>
    `;
  }

  private _renderCompletion() {
    return html`
      <div class="section walkthrough complete">
        <div class="step-header">
          <h3>✅ Configuration Complete!</h3>
          <sp-action-button
            quiet
            data-spectrum-pattern="action-button"
            @click="${this._resetWalkthrough}"
            label="Start Over"
            aria-label="Start Over">
            <sp-icon-refresh slot="icon"></sp-icon-refresh>
          </sp-action-button>
        </div>

        <p>Your device configuration has been generated.</p>

        ${this.completeConfig ? html`
          <div class="config-panel">
            <div class="config-panel-header" @click="${() => this.isConfigPanelExpanded = !this.isConfigPanelExpanded}">
              <h4>Device Configuration</h4>
              <span class="collapse-icon">${this.isConfigPanelExpanded ? '▼' : '▶'}</span>
            </div>
            ${this.isConfigPanelExpanded ? html`
              <hid-json-config .config=${this.completeConfig}></hid-json-config>
            ` : ''}
          </div>

          ${this.pendingSaveConfig ? html`
            <div class="button-row">
              <sp-button
                variant="accent"
                data-spectrum-pattern="button-accent"
                @click=${() => this.handleSaveConfig(true)}>
                <sp-icon-save-floppy slot="icon"></sp-icon-save-floppy>
                Download Configuration
              </sp-button>
              <sp-button
                variant="secondary"
                data-spectrum-pattern="button-secondary"
                @click=${() => this.handleSaveConfig(false)}>
                Skip
              </sp-button>
            </div>
          ` : ''}
        ` : ''}
      </div>
    `;
  }

  private _renderCaptureStatus() {
    return html`
      <div class="capture-status ${this.captureStatus.isCapturing ? 'capturing' : ''}">
        <div class="packet-count">
          ${this.captureStatus.packetCount} packets captured
        </div>
        <div class="filter-stats">
          Filtered: ${this.captureStatus.duplicatesFiltered} duplicates, 
          ${this.captureStatus.idleFiltered} idle
        </div>
      </div>
    `;
  }

  private _renderDetectedBytes() {
    if (this.detectedBytes.length === 0) return '';

    return html`
      <span class="bytes-detected-badge">✓ ${this.detectedBytes.length} byte${this.detectedBytes.length !== 1 ? 's' : ''} detected</span>
    `;
  }


  private _renderDeviceStreams() {
    const streams: DeviceStream[] = Array.from(this.deviceDataStreams.entries()).map(([index, data]) => ({
      index,
      lastPacket: data.lastPacket,
      packetCount: data.packetCount,
      lastUpdate: data.lastUpdate
    }));

    const deviceDetails = new Map<number, DeviceDetails>();
    streams.forEach(stream => {
      if (stream.index === -1) {
        deviceDetails.set(-1, { usagePage: 13, usage: 2 });
      } else {
        const reader = this.webReaders[stream.index];
        if (reader) {
          const info = reader.deviceInfo;
          deviceDetails.set(stream.index, {
            usagePage: info.usagePage,
            usage: info.usage,
            opened: reader.isOpen
          });
        }
      }
    });

    const { bytesData, deviceInfo, isEmpty } = this._getBytesDisplayData();

    return html`
      <div class="section">
        <h3>Device Interfaces</h3>
        <hid-devices
          .streams=${streams}
          .deviceDetails=${deviceDetails}
          .bytes=${bytesData}
          .bytesEmpty=${isEmpty}
          .bytesPlaceholderCount=${9}
          .bytesDeviceInfo=${deviceInfo}
          .isConnected=${this.isRealDevice}
          .connectedDeviceName=${this.realDeviceName}
          .isDeviceOpened=${this.webReaders[0]?.isOpen || false}
          @disconnect=${this._disconnectRealDevice}>
        </hid-devices>
      </div>
    `;
  }

  private _getBytesDisplayData(): { bytesData: ByteData[], deviceInfo: DeviceInfo | undefined, isEmpty: boolean } {
    // Priority: captured packets > last captured > latest display packet
    let latestPacket: Uint8Array | null = null;
    
    if (this.capturedPackets.length > 0) {
      latestPacket = this.capturedPackets[this.capturedPackets.length - 1];
    } else if (this.lastCapturedPackets.length > 0) {
      latestPacket = this.lastCapturedPackets[this.lastCapturedPackets.length - 1];
    } else if (this.latestDisplayPacket) {
      latestPacket = this.latestDisplayPacket;
    }

    const activeDeviceIndex = this.currentActiveDeviceIndex;
    const deviceStream = activeDeviceIndex !== undefined ? this.deviceDataStreams.get(activeDeviceIndex) : undefined;
    const isMockDevice = activeDeviceIndex === -1;

    const deviceInfo: DeviceInfo | undefined = activeDeviceIndex !== undefined ? {
      deviceNumber: activeDeviceIndex,
      packetCount: deviceStream?.packetCount || 0,
      usagePage: isMockDevice ? 13 : this.webReaders[activeDeviceIndex]?.deviceInfo.usagePage,
      usage: isMockDevice ? 2 : this.webReaders[activeDeviceIndex]?.deviceInfo.usage,
      isMock: isMockDevice
    } : undefined;

    if (!latestPacket) {
      return { bytesData: [], deviceInfo, isEmpty: true };
    }

    const bytesData: ByteData[] = Array.from(latestPacket).map((value, byteIndex) => ({
      byteIndex,
      value,
      isIdentified: this.detectedBytes.some(b => b.byteIndex === byteIndex),
      label: undefined
    }));

    return { bytesData, deviceInfo, isEmpty: false };
  }

  // ============================================================================
  // Device Setup
  // ============================================================================

  private _setupMockReader() {
    this.mockReader = createMockHIDReader({
      productName: 'Mock Graphics Tablet',
      vendorId: 0x0000,  // Generic mock device
      productId: 0x0000,
    });

    this.deviceDataStreams.set(-1, {
      lastPacket: '',
      packetCount: 0,
      lastUpdate: Date.now()
    });

    // Connect mock reader - it will be used when controller starts
    this.mockReader.startReading((data) => {
      this._handleDeviceData(-1, data);
    });
  }

  private _setupDeviceFinder() {
    this.deviceFinder = new DeviceFinder(
      (result: DeviceConnectionResult) => {
        this._handleDeviceConnected(result);
      },
      () => {
        this._handleDeviceDisconnected();
      },
      { autoConnect: true }
    );
  }

  private async _checkForRealDevice() {
    if (!this.deviceFinder) return;
    try {
      await this.deviceFinder.checkForExistingDevices();
    } catch (error) {
      console.error('[HIDDataReader] Error checking for devices:', error);
    }
  }

  private async _connectRealDevice() {
    if (!this.deviceFinder) return;
    this.isConnecting = true;
    try {
      await this.deviceFinder.requestDevice([]);
    } catch (error) {
      console.error('[HIDDataReader] Error connecting device:', error);
      this.showError('Failed to connect to device. Please try again.');
    } finally {
      this.isConnecting = false;
    }
  }

  private async _handleDeviceConnected(result: DeviceConnectionResult) {
    this.realDeviceName = result.deviceInfo.name;
    this.isRealDevice = true;
    this.isMockMode = false;

    this.webReaders = result.allDevices.map(device => createWebHIDReader(device));

    // Build collections from ALL devices, not just primaryDevice
    // This ensures we have all interfaces available for config generation
    const allCollections = result.allDevices
      .flatMap(d => d.collections)
      .filter(c => c.usagePage !== undefined && c.usage !== undefined)
      .map(c => ({ usagePage: c.usagePage!, usage: c.usage! }));

    // Remove duplicates based on usagePage+usage combination
    const uniqueCollections = Array.from(
      new Map(allCollections.map(c => [`${c.usagePage}-${c.usage}`, c])).values()
    );

    this.deviceMetadata = {
      vendorId: result.primaryDevice.vendorId,
      productId: result.primaryDevice.productId,
      productName: result.primaryDevice.productName,
      collections: uniqueCollections,
      allInterfaces: result.allDevices
        .flatMap(d => d.collections.map(c => c.usagePage))
        .filter((v): v is number => v !== undefined)
        .filter((v, i, a) => a.indexOf(v) === i)
    };

    // Update device streams
    const mockStream = this.deviceDataStreams.get(-1);
    this.deviceDataStreams.clear();
    if (mockStream) {
      this.deviceDataStreams.set(-1, mockStream);
    }
    this.webReaders.forEach((_, index) => {
      this.deviceDataStreams.set(index, { lastPacket: '', packetCount: 0, lastUpdate: 0 });
    });

    this.requestUpdate();

    // Start reading from all devices
    this.webReaders.forEach((reader, index) => {
      reader.startReading((data) => {
        this._handleDeviceData(index, data);
      });
    });

    // Find and open the primary device (the digitizer interface)
    // Don't assume it's at index 0 - find it by matching against result.primaryDevice
    const primaryReaderIndex = result.allDevices.findIndex(d => d === result.primaryDevice);
    const primaryReader = primaryReaderIndex >= 0 ? this.webReaders[primaryReaderIndex] : this.webReaders[0];
    
    if (primaryReader && !primaryReader.isOpen) {
      try {
        await primaryReader.open();
        this.controller.setReader(primaryReader);
        this.controller.setDeviceInfo(this.deviceMetadata);
        this.requestUpdate();
      } catch (error) {
        console.error('[HIDDataReader] Error opening device:', error);
        this.showError(`Failed to open device: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private _handleDeviceDisconnected() {
    this.isRealDevice = false;
    this.realDeviceName = '';
    this.webReaders.forEach(reader => reader.stopReading());
    this.webReaders = [];
    this.isMockMode = true;
    this.latestDisplayPacket = null;
  }

  private async _disconnectRealDevice() {
    if (!this.deviceFinder) return;
    try {
      await this.deviceFinder.disconnect();
      this._handleDeviceDisconnected();
    } catch (error) {
      console.error('[HIDDataReader] Error disconnecting:', error);
    }
  }

  private _handleDeviceData(deviceIndex: number, data: Uint8Array) {
    const hexString = Array.from(data)
      .map(byte => byte.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');

    const stream = this.deviceDataStreams.get(deviceIndex);
    if (stream) {
      stream.lastPacket = hexString;
      stream.packetCount++;
      stream.lastUpdate = Date.now();
      this.deviceDataStreams = new Map(this.deviceDataStreams);
    }

    this.currentActiveDeviceIndex = deviceIndex;

    // Track which interface is actually sending data (for accurate config generation)
    // Only track for real devices (not mock which has index -1)
    if (deviceIndex >= 0 && this.webReaders[deviceIndex]) {
      const reader = this.webReaders[deviceIndex];
      const usagePage = reader.deviceInfo.usagePage;
      if (usagePage !== undefined && !this.deviceMetadata.dataSourceUsagePage) {
        this.deviceMetadata.dataSourceUsagePage = usagePage;
        // Update controller's device info with the data source
        this.controller.setDeviceInfo(this.deviceMetadata);
      }
    }

    // Feed packet to controller (which feeds to engine)
    this.controller.processPacket(data);

    // Always store latest packet for display
    this.latestDisplayPacket = new Uint8Array(data);

    // Also store for capture when capturing
    if (this.captureStatus.isCapturing) {
      this.capturedPackets.push(new Uint8Array(data));
    }

    this.requestUpdate();
  }

  private _resetWalkthrough() {
    // Reset controller state
    this.walkthroughStep = 'idle';
    this.stepInfo = null;
    this.captureStatus = { packetCount: 0, duplicatesFiltered: 0, idleFiltered: 0, isCapturing: false };
    this.detectedBytes = [];
    this.detectedButtons = [];
    this.currentButtonPrompt = null;
    this.buttonCount = 0;
    this.messages = [];
    this.completeConfig = null;
    this.capturedPackets = [];
    this.lastCapturedPackets = [];
    this.latestDisplayPacket = null;
    this.pendingDataSource = null;
    this.pendingNavigation = null;
    this.pendingButtonCount = null;
    this.pendingMetadata = null;
    this.pendingSaveConfig = null;
    this.pendingGestureComplete = null;
    this.requestUpdate();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hid-data-reader': HidDataReader;
  }
}