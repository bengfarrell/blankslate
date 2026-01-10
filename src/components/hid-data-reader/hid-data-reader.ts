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

  // Device metadata
  private deviceMetadata: DeviceConnectionInfo = {
    vendorId: 0,
    productId: 0,
    productName: '',
  };

  constructor() {
    super();
    
    // Create controller with this component as the view
    this.controller = new WalkthroughController(
      this, // IWalkthroughView
      this._createReaderFactory(),
      {
        autoPlayMockGestures: true,
        gesturePlayDuration: 2000,
        buttonConfirmations: 3,
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
          vendorId: 0x28bd,
          productId: 0x2904,
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
    
    // DEBUG: Press '9' to jump to step 9 for testing
    this._debugKeyHandler = (e: KeyboardEvent) => {
      if (e.key === '9' && !e.ctrlKey && !e.metaKey && 
          !(e.target instanceof HTMLInputElement) && 
          !(e.target instanceof HTMLTextAreaElement)) {
        console.log('[DEBUG] Jumping to step 9');
        const engine = this.controller.getEngine();
        engine.goToStep('step9-tablet-buttons');
        this.walkthroughStep = 'step9-tablet-buttons';
        this.stepInfo = this.controller.getCurrentStepInfo();
        this.requestUpdate();
      }
    };
    window.addEventListener('keydown', this._debugKeyHandler);
  }
  
  private _debugKeyHandler: ((e: KeyboardEvent) => void) | null = null;

  disconnectedCallback() {
    super.disconnectedCallback();
    this.controller.cleanup();
    this._disconnectRealDevice();
    
    // Clean up debug handler
    if (this._debugKeyHandler) {
      window.removeEventListener('keydown', this._debugKeyHandler);
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
      let lastProcessedIndex = 0;
      let resolved = false;
      let logCounter = 0;
      
      // Set up skip handler
      this.pendingGestureComplete = () => {
        console.log(`[ButtonDetect] Button ${buttonNumber} skipped`);
        resolved = true;
        clearInterval(interval);
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
          console.log(`[ButtonDetect] Button ${buttonNumber}: ${enginePackets.length} total packets, ${buttonPatterns.size} button patterns: [${patterns.join(', ')}]`);
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
              console.log(`[ButtonDetect] Button ${buttonNumber} DETECTED: scanCode=${scanCode}, status=${statusByte}, count=${existing.count}`);
              resolved = true;
              clearInterval(interval);
              
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
        vendorId: 0x28bd,
        productId: 0x2904,
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
      <div class="header">
        ${this._renderDeviceStatus()}
      </div>

      <div class="content">
        ${this._renderMessages()}
        ${this._renderCurrentStep()}
        ${this.deviceDataStreams.size > 0 ? this._renderDeviceStreams() : ''}
      </div>
    `;
  }

  private _renderMessages() {
    return html`
      ${this.messages.map(msg => html`
        <div class="message ${msg.type}">${msg.text}</div>
      `)}
    `;
  }

  private _renderDeviceStatus() {
    return html`
      <div class="device-status">
        ${this.isRealDevice 
          ? html`<span class="connected">🟢 ${this.realDeviceName}</span>`
          : html`
              <button
                class="button small connect"
                ?disabled="${this.isConnecting}"
                @click="${this._connectRealDevice}">
                ${this.isConnecting ? '⏳ Connecting...' : '🔌 Connect Real Tablet'}
              </button>
            `
        }
      </div>
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
        <button class="button primary" @click="${() => this.handleStartWalkthrough()}">
          Start Walkthrough
        </button>
      </div>
    `;
  }

  private _renderDataSourceSelection() {
    return html`
      <div class="section walkthrough">
        <h3>Select Data Source</h3>
        <div class="button-row">
          <button class="button" @click=${() => this.handleDataSourceSelect('mock')}>
            🎮 Use Mock Data
          </button>
          <button class="button primary" @click=${() => this.handleDataSourceSelect('device')}
                  ?disabled="${!this.isRealDevice}">
            🔌 Use Real Device ${!this.isRealDevice ? '(connect first)' : ''}
          </button>
          <button class="button danger" @click=${() => this.handleDataSourceSelect('exit')}>
            Cancel
          </button>
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
          <button class="icon-button" @click="${this.handleReset}" title="Reset">🔄</button>
          <hid-walkthrough-progress currentStep="${info.number - 1}" totalSteps="10"></hid-walkthrough-progress>
        </div>

        <div class="step-description">
          <p>${info.description}</p>
          <p class="instructions">${info.instructions}</p>
        </div>

        ${this._renderCaptureStatus()}
        ${this._renderDetectedBytes()}

        <div class="button-row">
          ${this.isMockMode ? html`
            <button 
              class="button" 
              ?disabled=${this.isPlaying}
              @click=${this.handleSimulate}>
              ${this.isPlaying ? '⏳ Simulating...' : `🤖 ${strings.ui.buttons.simulate}`}
            </button>
          ` : ''}
        </div>

        ${this._renderStepNavigation(hasData)}
      </div>
    `;
  }
  
  private _renderStepNavigation(hasData: boolean) {
    return html`
      <div class="navigation-buttons">
        <button 
          class="button primary" 
          ?disabled=${!hasData || this.isPlaying}
          @click=${() => this._handleStepNext()}>
          → ${strings.ui.buttons.next}
        </button>
        <button class="button" @click=${() => this._handleStepRetry()}>
          ↻ Retry
        </button>
        <button class="button" ?disabled=${this.walkthroughStep === 'step1-horizontal'} @click=${() => this._handleStepPrevious()}>
          ← Back
        </button>
        <button class="button danger" @click=${() => this._resetWalkthrough()}>
          ✕ Cancel
        </button>
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
          <button class="icon-button" @click="${this.handleReset}" title="Reset">🔄</button>
          <hid-walkthrough-progress currentStep="${info.number - 1}" totalSteps="10"></hid-walkthrough-progress>
        </div>

        <div class="step-description">
          <p>${info.description}</p>
          <p class="instructions">${info.instructions}</p>
        </div>

        ${this._renderCaptureStatus()}
        ${this._renderDetectedBytes()}

        ${this.pendingButtonCount ? html`
          <div class="button-count-prompt">
            <label>How many tablet buttons does your device have?</label>
            <input 
              type="number" 
              id="buttonCountInput"
              min="0" 
              max="20" 
              value="0"
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === 'Enter') {
                  const input = e.target as HTMLInputElement;
                  this.handleButtonCountSubmit(parseInt(input.value) || 0);
                }
              }}
            />
            <button 
              class="button primary"
              @click=${() => {
                const input = this.shadowRoot?.getElementById('buttonCountInput') as HTMLInputElement;
                this.handleButtonCountSubmit(parseInt(input?.value) || 0);
              }}>
              Continue
            </button>
          </div>
        ` : ''}
        
        ${this.currentButtonPrompt !== null ? html`
          <div class="button-prompt">
            <p>👆 Press Button ${this.currentButtonPrompt} three times</p>
            <button class="button" @click=${this.handleSkipButton}>Skip this button</button>
          </div>
        ` : ''}

        ${this.detectedButtons.length > 0 ? html`
          <div class="button-summary">
            <h4>Detected Buttons:</h4>
            ${this.detectedButtons.map(btn => html`
              <div class="detected-button">
                ✓ Button ${btn.buttonNumber}: scanCode=${btn.scanCode}, status=${btn.statusByte}
              </div>
            `)}
          </div>
        ` : ''}

        <div class="button-row">
          ${this.isMockMode ? html`
            <button 
              class="button" 
              ?disabled=${this.isPlaying}
              @click=${this.handleSimulate}>
              ${this.isPlaying ? '⏳ Simulating...' : `🤖 ${strings.ui.buttons.simulate}`}
            </button>
          ` : ''}
        </div>

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
          <button class="icon-button" @click="${this._resetWalkthrough}" title="Start Over">🔄</button>
        </div>

        <p>Your device configuration has been generated.</p>

        ${this.completeConfig ? html`
          <div class="config-panel">
            <div class="config-panel-header" @click="${() => this.isConfigPanelExpanded = !this.isConfigPanelExpanded}">
              <h4>📄 Device Configuration</h4>
              <span class="collapse-icon">${this.isConfigPanelExpanded ? '▼' : '▶'}</span>
            </div>
            ${this.isConfigPanelExpanded ? html`
              <hid-json-config .config=${this.completeConfig}></hid-json-config>
            ` : ''}
          </div>

          ${this.pendingSaveConfig ? html`
            <div class="button-row">
              <button class="button primary" @click=${() => this.handleSaveConfig(true)}>
                💾 Download Configuration
              </button>
              <button class="button" @click=${() => this.handleSaveConfig(false)}>
                Skip
              </button>
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
        ${this.captureStatus.duplicatesFiltered > 0 || this.captureStatus.idleFiltered > 0 ? html`
          <div class="filter-stats">
            Filtered: ${this.captureStatus.duplicatesFiltered} duplicates, 
            ${this.captureStatus.idleFiltered} idle
          </div>
        ` : ''}
      </div>
    `;
  }

  private _renderDetectedBytes() {
    if (this.detectedBytes.length === 0) return '';

    return html`
      <div class="bytes-detected">
        <h4>✓ Bytes Detected:</h4>
        ${this.detectedBytes.map(b => html`
          <div class="byte-item">
            Byte ${b.byteIndex}: min=${b.min}, max=${b.max}, variance=${b.variance.toFixed(0)}
          </div>
        `)}
      </div>
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
    const packetsToShow = this.capturedPackets.length > 0
      ? this.capturedPackets
      : this.lastCapturedPackets;

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

    if (packetsToShow.length === 0) {
      return { bytesData: [], deviceInfo, isEmpty: true };
    }

    const latestPacket = packetsToShow[packetsToShow.length - 1];

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
      vendorId: 0x28bd,
      productId: 0x2904,
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

    this.deviceMetadata = {
      vendorId: result.primaryDevice.vendorId,
      productId: result.primaryDevice.productId,
      productName: result.primaryDevice.productName,
      collections: result.primaryDevice.collections
        .filter(c => c.usagePage !== undefined && c.usage !== undefined)
        .map(c => ({ usagePage: c.usagePage!, usage: c.usage! })),
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
    if (deviceIndex >= 0 && this.webReaders[deviceIndex] && !this.deviceMetadata.dataSourceUsagePage) {
      const reader = this.webReaders[deviceIndex];
      const usagePage = reader.deviceInfo.usagePage;
      if (usagePage !== undefined) {
        console.log(`[HIDDataReader] Data source detected: interface with usagePage=${usagePage}`);
        this.deviceMetadata.dataSourceUsagePage = usagePage;
        // Update controller's device info with the data source
        this.controller.setDeviceInfo(this.deviceMetadata);
      }
    }

    // Feed packet to controller (which feeds to engine)
    this.controller.processPacket(data);

    // Also store for display
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
