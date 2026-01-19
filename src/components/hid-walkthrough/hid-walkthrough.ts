import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { styles } from './hid-walkthrough.styles.js';

// Import shared types and step info from core
import { 
  STEP_INFO, 
  type WalkthroughStep, 
  type GestureType,
  type StepInfo 
} from '../../core/walkthrough/index.js';
import type { ByteAnalysis, DeviceByteCodeMappings } from '../../utils/byte-detector.js';
import type { MetadataFormData } from '../device-metadata-form/device-metadata-form.js';

// Import strings
import { WALKTHROUGH_STRINGS } from '../../strings/walkthrough-strings.js';

import '../hid-walkthrough-progress/hid-walkthrough-progress.js';
import '../device-metadata-form/device-metadata-form.js';
import '@spectrum-web-components/action-button/sp-action-button.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-refresh.js';

// Re-export types for consumers
export type { WalkthroughStep };

export interface WalkthroughStepCompleteEvent {
  step: WalkthroughStep;
  gesture: string;
}

export interface WalkthroughResetEvent {
  step: WalkthroughStep;
}

export interface WalkthroughMetadataSubmitEvent {
  metadata: MetadataFormData;
}

/**
 * HID Walkthrough component for guiding users through device configuration
 * Uses shared step info and strings from JSON for consistency with CLI
 */
@customElement('hid-walkthrough')
export class HidWalkthrough extends LitElement {
  static styles = styles;

  // Current walkthrough step
  @property({ type: String })
  currentStep: WalkthroughStep = 'step1-horizontal';

  // Whether a gesture is currently playing
  @property({ type: Boolean })
  isPlaying = false;

  // Number of captured packets in current step
  @property({ type: Number })
  capturedPacketCount = 0;

  // Detected bytes for each step
  @property({ type: Array })
  horizontalBytes: ByteAnalysis[] = [];

  @property({ type: Array })
  verticalBytes: ByteAnalysis[] = [];

  @property({ type: Array })
  pressureBytes: ByteAnalysis[] = [];

  @property({ type: Array })
  tiltXBytes: ByteAnalysis[] = [];

  @property({ type: Array })
  tiltYBytes: ByteAnalysis[] = [];

  @property({ type: Array })
  tabletButtonBytes: ByteAnalysis[] = [];

  // Detected button states (for step 9)
  @property({ type: Object })
  detectedButtonStates: Set<number> = new Set();

  // Generated device configuration
  @property({ type: Object })
  deviceConfig: DeviceByteCodeMappings | null = null;

  // Complete configuration with metadata
  @property({ type: Object })
  completeConfig: any = null;

  /**
   * Get step info from the shared STEP_INFO constant
   */
  private _getStepInfo(step: WalkthroughStep): StepInfo {
    return STEP_INFO[step];
  }

  render() {
    return html`
      <div class="walkthrough-container">
        ${this._renderCurrentStep()}
      </div>
    `;
  }

  private _renderCurrentStep() {
    const stepInfo = this._getStepInfo(this.currentStep);

    switch (this.currentStep) {
      case 'step1-horizontal':
      case 'step2-vertical':
      case 'step3-pressure':
      case 'step4-hover-movement':
      case 'step5-tilt-x':
      case 'step6-tilt-y':
      case 'step7-primary-button':
      case 'step8-secondary-button':
        return this._renderGestureStep(stepInfo);
      case 'step9-tablet-buttons':
        return this._renderTabletButtonsStep(stepInfo);
      case 'step10-metadata':
        return this._renderMetadataStep(stepInfo);
      case 'complete':
        return this._renderComplete(stepInfo);
      default:
        return html``;
    }
  }

  private _renderStepHeader(stepNumber: number, title: string, hasNextButton = true) {
    const hasData = this.capturedPacketCount > 0;
    return html`
      <div class="step-header">
        <h3>${title}</h3>
        <sp-action-button quiet @click="${this._handleReset}" title="Reset">
          <sp-icon-refresh slot="icon"></sp-icon-refresh>
        </sp-action-button>
        <hid-walkthrough-progress currentStep="${stepNumber}" totalSteps="10"></hid-walkthrough-progress>
        ${hasNextButton ? html`
          <button 
            class="icon-button" 
            ?disabled="${!hasData}" 
            @click="${this._handleNext}" 
            title="Next Step">→</button>
        ` : ''}
      </div>
    `;
  }

  /**
   * Render a standard gesture step (steps 1-8)
   */
  private _renderGestureStep(stepInfo: StepInfo) {
    const { simulate, simulating } = WALKTHROUGH_STRINGS.ui.buttons;

    return html`
      <div class="section walkthrough active">
        ${this._renderStepHeader(stepInfo.number - 1, `Step ${stepInfo.number}: ${stepInfo.title}`)}
        <div class="step-description">
          <p>${stepInfo.description}</p>
          <p class="instructions">${stepInfo.instructions}</p>
          <button 
            class="simulate-button" 
            ?disabled="${this.isPlaying}" 
            @click="${() => this._handlePlayGesture(stepInfo.gesture!)}">
            ${this.isPlaying ? `⏳ ${simulating}` : `🤖 ${simulate}`}
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Render tablet buttons step (step 9)
   */
  private _renderTabletButtonsStep(stepInfo: StepInfo) {
    const buttonCount = this.detectedButtonStates.size;
    const { simulate, simulating } = WALKTHROUGH_STRINGS.ui.buttons;

    return html`
      <div class="section walkthrough active">
        ${this._renderStepHeader(stepInfo.number - 1, `Step ${stepInfo.number}: ${stepInfo.title}`)}
        <div class="step-description">
          <p>${stepInfo.description}</p>
          <p class="instructions">${stepInfo.instructions}</p>
          ${buttonCount > 0 ? html`
            <div class="button-detection-status">
              <strong>Detected ${buttonCount} button state${buttonCount !== 1 ? 's' : ''}</strong>
              <div class="detected-states">
                ${Array.from(this.detectedButtonStates).map(state => html`
                  <span class="state-badge">0x${state.toString(16).toUpperCase().padStart(2, '0')}</span>
                `)}
              </div>
            </div>
          ` : ''}
          <div class="gesture-controls">
            <button
              class="simulate-button"
              ?disabled="${this.isPlaying}"
              @click="${() => this._handlePlayGesture('tablet-buttons')}">
              ${this.isPlaying ? `⏳ ${simulating}` : `🤖 ${simulate}`}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render metadata step (step 10)
   */
  private _renderMetadataStep(stepInfo: StepInfo) {
    return html`
      <div class="section walkthrough active">
        ${this._renderStepHeader(stepInfo.number - 1, `Step ${stepInfo.number}: ${stepInfo.title}`, false)}
        <p>${stepInfo.description}</p>
        <device-metadata-form
          @metadata-submit="${this._handleMetadataSubmit}">
        </device-metadata-form>
      </div>
    `;
  }

  /**
   * Render completion step
   */
  private _renderComplete(stepInfo: StepInfo) {
    return html`
      <div class="section walkthrough complete">
        <h3>✅ ${stepInfo.title}</h3>
        <p>${stepInfo.description}</p>
      </div>
    `;
  }

  private _handlePlayGesture(gesture: GestureType) {
    this.dispatchEvent(new CustomEvent('play-gesture', {
      detail: { gesture },
      bubbles: true,
      composed: true
    }));
  }

  private _handleNext() {
    this.dispatchEvent(new CustomEvent('step-complete', {
      detail: { step: this.currentStep },
      bubbles: true,
      composed: true
    }));
  }

  private _handleReset() {
    this.dispatchEvent(new CustomEvent('step-reset', {
      detail: { step: this.currentStep },
      bubbles: true,
      composed: true
    }));
  }

  private _handleMetadataSubmit(e: CustomEvent<MetadataFormData>) {
    this.dispatchEvent(new CustomEvent('metadata-submit', {
      detail: e.detail,
      bubbles: true,
      composed: true
    }));
  }
}