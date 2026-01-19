/**
 * Web Walkthrough View
 * Implements IWalkthroughView for browser/Lit environment
 * 
 * This is the VIEW layer - it handles rendering and user input,
 * delegating all logic to the shared WalkthroughController.
 */

import { LitElement, html, css } from 'lit';
import { customElement, state, property } from 'lit/decorators.js';

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
} from '../../core/walkthrough/index.js';
import { MockHIDReader, createMockHIDReader } from '../../core/hid/mock-hid-reader.js';
import type { IHIDReader } from '../../core/hid/hid-interface.js';
import { WALKTHROUGH_STRINGS } from '../../strings/walkthrough-strings.js';

import '../hid-walkthrough-progress/hid-walkthrough-progress.js';
import '../device-metadata-form/device-metadata-form.js';

const strings = WALKTHROUGH_STRINGS;

// ============================================================================
// Web View Implementation
// ============================================================================

/**
 * Web implementation of IWalkthroughView
 * Renders using Lit HTML and handles user input via events
 */
@customElement('walkthrough-web-view')
export class WalkthroughWebView extends LitElement implements IWalkthroughView {
  static styles = css`
    :host {
      display: block;
    }

    .walkthrough-container {
      padding: 1rem;
    }

    .step-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }

    .step-header h3 {
      margin: 0;
      flex: 1;
      min-width: 200px;
    }

    .step-description {
      margin-bottom: 1.5rem;
    }

    .step-description p {
      margin: 0.5rem 0;
    }

    .instructions {
      color: var(--text-secondary, #666);
      font-style: italic;
    }

    .navigation-buttons {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-top: 1rem;
    }

    .nav-button {
      padding: 0.5rem 1rem;
      border: 1px solid var(--border-color, #ccc);
      border-radius: 4px;
      background: var(--bg-button, #f0f0f0);
      cursor: pointer;
      font-size: 0.9rem;
    }

    .nav-button:hover:not(:disabled) {
      background: var(--bg-button-hover, #e0e0e0);
    }

    .nav-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .nav-button.primary {
      background: var(--bg-primary, #4a90d9);
      color: white;
      border-color: var(--bg-primary, #4a90d9);
    }

    .nav-button.primary:hover:not(:disabled) {
      background: var(--bg-primary-hover, #357abd);
    }

    .nav-button.danger {
      color: var(--text-danger, #d9534f);
    }

    .capture-status {
      padding: 1rem;
      background: var(--bg-surface, #f5f5f5);
      border-radius: 4px;
      margin: 1rem 0;
    }

    .capture-status.capturing {
      border-left: 4px solid var(--color-active, #4a90d9);
    }

    .packet-count {
      font-size: 1.5rem;
      font-weight: bold;
      color: var(--text-primary, #333);
    }

    .bytes-detected {
      margin-top: 1rem;
      padding: 0.5rem;
      background: var(--bg-success, #dff0d8);
      border-radius: 4px;
    }

    .bytes-detected h4 {
      margin: 0 0 0.5rem;
      color: var(--text-success, #3c763d);
    }

    .byte-item {
      font-family: monospace;
      font-size: 0.85rem;
      padding: 0.25rem 0;
    }

    /* Button Detection */
    .button-detection {
      margin: 1rem 0;
    }

    .button-prompt {
      font-size: 1.1rem;
      color: var(--text-highlight, #9b59b6);
      margin: 1rem 0;
    }

    .detected-button {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem;
      margin: 0.25rem 0;
      background: var(--bg-success, #dff0d8);
      border-radius: 4px;
    }

    .skipped-button {
      color: var(--text-secondary, #999);
      font-style: italic;
    }

    .button-summary {
      margin-top: 1rem;
      padding: 1rem;
      background: var(--bg-surface, #f5f5f5);
      border-radius: 4px;
    }

    /* Completion */
    .completion {
      text-align: center;
      padding: 2rem;
    }

    .completion h2 {
      color: var(--text-success, #3c763d);
    }

    .config-preview {
      text-align: left;
      background: var(--bg-code, #f8f8f8);
      padding: 1rem;
      border-radius: 4px;
      overflow-x: auto;
      max-height: 400px;
      overflow-y: auto;
    }

    .config-preview pre {
      margin: 0;
      font-family: monospace;
      font-size: 0.85rem;
    }

    .message {
      padding: 0.75rem 1rem;
      border-radius: 4px;
      margin: 0.5rem 0;
    }

    .message.success {
      background: var(--bg-success, #dff0d8);
      color: var(--text-success, #3c763d);
    }

    .message.error {
      background: var(--bg-error, #f2dede);
      color: var(--text-error, #a94442);
    }

    .message.info {
      background: var(--bg-info, #d9edf7);
      color: var(--text-info, #31708f);
    }

    .simulate-button {
      padding: 0.75rem 1.5rem;
      background: var(--bg-primary, #4a90d9);
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 1rem;
    }

    .simulate-button:hover:not(:disabled) {
      background: var(--bg-primary-hover, #357abd);
    }

    .simulate-button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  `;

  // -------------------- State --------------------

  @state() private currentStep: WalkthroughStep = 'idle';
  @state() private stepInfo: StepInfo | null = null;
  @state() private captureStatus: CaptureStatus = { packetCount: 0, duplicatesFiltered: 0, idleFiltered: 0, isCapturing: false };
  @state() private detectedBytes: ByteAnalysis[] = [];
  @state() private detectedButtons: DetectedButton[] = [];
  @state() private currentButtonPrompt: number | null = null;
  @state() private buttonCount = 0;
  @state() private messages: Array<{ type: 'success' | 'error' | 'info'; text: string }> = [];
  @state() private completeConfig: any = null;
  @state() private isCapturing = false;
  @state() private isMockMode = false;

  // Controller reference (set by parent)
  @property({ type: Object, attribute: false })
  controller: WalkthroughController | null = null;

  // Pending promise resolvers for async prompts
  private pendingDataSource: ((value: DataSource) => void) | null = null;
  private pendingNavigation: ((value: NavigationAction) => void) | null = null;
  private pendingButtonCount: ((value: number) => void) | null = null;
  private pendingMetadata: ((value: MetadataFormData) => void) | null = null;
  private pendingSaveConfig: ((value: { save: boolean; filename?: string }) => void) | null = null;
  private pendingGestureComplete: (() => void) | null = null;

  // Bound keyboard handler for cleanup
  private boundKeyboardHandler = this.handleKeyboard.bind(this);

  // -------------------- Lifecycle --------------------

  connectedCallback(): void {
    super.connectedCallback();
    // Add keyboard listener for Enter key to trigger Next
    window.addEventListener('keydown', this.boundKeyboardHandler);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    // Clean up keyboard listener
    window.removeEventListener('keydown', this.boundKeyboardHandler);
  }

  private handleKeyboard(e: KeyboardEvent): void {
    // Enter key triggers Next step (if navigation is pending)
    if (e.key === 'Enter' && this.pendingNavigation) {
      // Don't trigger if user is typing in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }
      e.preventDefault();
      this.handleNavigation('next');
    }
    
    // Escape key can skip current gesture (during capture)
    if (e.key === 'Escape' && this.pendingGestureComplete) {
      e.preventDefault();
      this.handleGestureComplete();
    }
  }

  // -------------------- IWalkthroughView Implementation --------------------

  showHeader(): void {
    // Header is handled by parent component
  }

  showStepInfo(stepInfo: StepInfo): void {
    this.stepInfo = stepInfo;
    this.currentStep = stepInfo.id as WalkthroughStep;
    this.detectedBytes = [];
    this.messages = [];
    this.requestUpdate();
  }

  showCompletion(config: any): void {
    this.currentStep = 'complete';
    this.completeConfig = config;
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
    this.isCapturing = true;
    this.requestUpdate();
  }

  onCaptureProgress(status: CaptureStatus): void {
    this.captureStatus = { ...status };
    this.requestUpdate();
  }

  onCaptureComplete(status: CaptureStatus): void {
    this.captureStatus = { ...status, isCapturing: false };
    this.isCapturing = false;
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
      // The metadata form component handles this
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

  // -------------------- Event Handlers --------------------

  private handleDataSourceSelect(source: DataSource): void {
    if (this.pendingDataSource) {
      this.pendingDataSource(source);
      this.pendingDataSource = null;
    }
  }

  private handleNavigation(action: NavigationAction): void {
    if (this.pendingNavigation) {
      this.pendingNavigation(action);
      this.pendingNavigation = null;
    }
  }

  private handleButtonCountSubmit(count: number): void {
    if (this.pendingButtonCount) {
      this.pendingButtonCount(count);
      this.pendingButtonCount = null;
    }
  }

  private handleMetadataSubmit(e: CustomEvent<MetadataFormData>): void {
    if (this.pendingMetadata) {
      this.pendingMetadata(e.detail);
      this.pendingMetadata = null;
    }
  }

  private handleSaveConfig(save: boolean, filename?: string): void {
    if (this.pendingSaveConfig) {
      this.pendingSaveConfig({ save, filename });
      this.pendingSaveConfig = null;
    }
  }

  private handleGestureComplete(): void {
    if (this.pendingGestureComplete) {
      this.pendingGestureComplete();
      this.pendingGestureComplete = null;
    }
  }

  private handleSimulate(): void {
    this.dispatchEvent(new CustomEvent('simulate-gesture', {
      detail: { gesture: this.stepInfo?.gesture },
      bubbles: true,
      composed: true,
    }));
  }

  private handleSkipButton(): void {
    this.handleGestureComplete();
  }

  // -------------------- Render Methods --------------------

  render() {
    return html`
      <div class="walkthrough-container">
        ${this.renderMessages()}
        ${this.renderCurrentStep()}
      </div>
    `;
  }

  private renderMessages() {
    return html`
      ${this.messages.map(msg => html`
        <div class="message ${msg.type}">${msg.text}</div>
      `)}
    `;
  }

  private renderCurrentStep() {
    // Data source selection
    if (this.pendingDataSource) {
      return this.renderDataSourceSelection();
    }

    // Completion
    if (this.currentStep === 'complete') {
      return this.renderCompletion();
    }

    // Metadata step
    if (this.currentStep === 'step10-metadata') {
      return this.renderMetadataStep();
    }

    // Button detection step
    if (this.currentStep === 'step9-tablet-buttons') {
      return this.renderButtonDetectionStep();
    }

    // Regular gesture step
    if (this.stepInfo) {
      return this.renderGestureStep();
    }

    return html`<p>Initializing...</p>`;
  }

  private renderDataSourceSelection() {
    return html`
      <div class="data-source-selection">
        <h3>Select Data Source</h3>
        <div class="navigation-buttons">
          <button class="nav-button" @click=${() => this.handleDataSourceSelect('mock')}>
            🎮 Use mock data (for testing)
          </button>
          <button class="nav-button primary" @click=${() => this.handleDataSourceSelect('device')}>
            🔌 Connect to real HID device
          </button>
          <button class="nav-button danger" @click=${() => this.handleDataSourceSelect('exit')}>
            🚪 Exit
          </button>
        </div>
      </div>
    `;
  }

  private renderGestureStep() {
    const info = this.stepInfo!;
    return html`
      <div class="step-header">
        <h3>Step ${info.number}: ${info.title}</h3>
        <hid-walkthrough-progress 
          currentStep="${info.number - 1}" 
          totalSteps="10">
        </hid-walkthrough-progress>
      </div>

      <div class="step-description">
        <p>${info.description}</p>
        <p class="instructions">${info.instructions}</p>
      </div>

      ${this.renderCaptureStatus()}
      ${this.renderDetectedBytes()}

      <div class="navigation-buttons">
        ${this.isMockMode ? html`
          <button 
            class="simulate-button" 
            ?disabled=${this.isCapturing}
            @click=${this.handleSimulate}>
            ${this.isCapturing ? '⏳ Simulating...' : `🤖 ${strings.ui.buttons.simulate}`}
          </button>
        ` : html`
          <button 
            class="nav-button primary"
            ?disabled=${this.isCapturing}
            @click=${this.handleGestureComplete}>
            ✓ Done with gesture
          </button>
        `}
      </div>

      ${this.pendingNavigation ? this.renderNavigationButtons() : ''}
    `;
  }

  private renderButtonDetectionStep() {
    const info = this.stepInfo!;
    return html`
      <div class="step-header">
        <h3>Step ${info.number}: ${info.title}</h3>
        <hid-walkthrough-progress 
          currentStep="${info.number - 1}" 
          totalSteps="10">
        </hid-walkthrough-progress>
      </div>

      <div class="step-description">
        <p>${info.description}</p>
        <p class="instructions">${info.instructions}</p>
      </div>

      ${this.pendingButtonCount ? this.renderButtonCountPrompt() : ''}
      
      <div class="button-detection">
        ${this.currentButtonPrompt !== null ? html`
          <p class="button-prompt">
            👆 Press Button ${this.currentButtonPrompt} three times (or click Skip)
          </p>
          <button class="nav-button" @click=${this.handleSkipButton}>Skip this button</button>
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
      </div>

      ${this.pendingNavigation ? this.renderNavigationButtons() : ''}
    `;
  }

  private renderButtonCountPrompt() {
    return html`
      <div class="button-count-prompt">
        <label>How many tablet buttons does your tablet have?</label>
        <input 
          type="number" 
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
          class="nav-button primary"
          @click=${(e: Event) => {
            const input = (e.target as HTMLElement).previousElementSibling as HTMLInputElement;
            this.handleButtonCountSubmit(parseInt(input.value) || 0);
          }}>
          Continue
        </button>
      </div>
    `;
  }

  private renderMetadataStep() {
    const info = this.stepInfo!;
    return html`
      <div class="step-header">
        <h3>Step ${info.number}: ${info.title}</h3>
        <hid-walkthrough-progress 
          currentStep="${info.number - 1}" 
          totalSteps="10">
        </hid-walkthrough-progress>
      </div>

      <div class="step-description">
        <p>${info.description}</p>
      </div>

      <device-metadata-form
        @metadata-submit=${this.handleMetadataSubmit}>
      </device-metadata-form>
    `;
  }

  private renderCompletion() {
    return html`
      <div class="completion">
        <h2>✅ Configuration Complete!</h2>
        <p>Your device configuration has been generated.</p>

        ${this.completeConfig ? html`
          <div class="config-preview">
            <pre>${JSON.stringify(this.completeConfig, null, 2)}</pre>
          </div>

          ${this.pendingSaveConfig ? html`
            <div class="navigation-buttons" style="justify-content: center; margin-top: 1rem;">
              <button class="nav-button primary" @click=${() => this.handleSaveConfig(true, 'config.json')}>
                💾 Save Configuration
              </button>
              <button class="nav-button" @click=${() => this.handleSaveConfig(false)}>
                Skip
              </button>
            </div>
          ` : ''}
        ` : ''}
      </div>
    `;
  }

  private renderCaptureStatus() {
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

  private renderDetectedBytes() {
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

  private renderNavigationButtons() {
    const hasData = this.captureStatus.packetCount > 0;
    return html`
      <div class="navigation-buttons">
        <button 
          class="nav-button primary" 
          ?disabled=${!hasData}
          @click=${() => this.handleNavigation('next')}>
          → Next step
        </button>
        <button class="nav-button" @click=${() => this.handleNavigation('retry')}>
          ↻ Retry this step
        </button>
        <button class="nav-button" @click=${() => this.handleNavigation('previous')}>
          ← Previous step
        </button>
        <button class="nav-button danger" @click=${() => this.handleNavigation('cancel')}>
          ✕ Cancel
        </button>
      </div>
    `;
  }

  // -------------------- Public Methods for Parent --------------------

  setMockMode(isMock: boolean): void {
    this.isMockMode = isMock;
    this.requestUpdate();
  }

  reset(): void {
    this.currentStep = 'idle';
    this.stepInfo = null;
    this.captureStatus = { packetCount: 0, duplicatesFiltered: 0, idleFiltered: 0, isCapturing: false };
    this.detectedBytes = [];
    this.detectedButtons = [];
    this.currentButtonPrompt = null;
    this.buttonCount = 0;
    this.messages = [];
    this.completeConfig = null;
    this.requestUpdate();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'walkthrough-web-view': WalkthroughWebView;
  }
}