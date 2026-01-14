import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import '@spectrum-web-components/button/sp-button.js';
import '@spectrum-web-components/textfield/sp-textfield.js';
import '@spectrum-web-components/field-label/sp-field-label.js';
import '@spectrum-web-components/help-text/sp-help-text.js';

export interface MetadataFormData {
  name: string;
  manufacturer: string;
  model: string;
  description: string;
  buttonCount: number;
}

/**
 * Form component for collecting device metadata from the user
 */
@customElement('device-metadata-form')
export class DeviceMetadataForm extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: system-ui, -apple-system, sans-serif;
    }

    .form-container {
      background: #f5f5f5;
      border: 2px solid #ddd;
      border-radius: 8px;
      padding: 24px;
      max-width: 600px;
      margin: 0 auto;
    }

    .form-header {
      margin-bottom: 20px;
    }

    .form-header h2 {
      margin: 0 0 8px 0;
      color: #333;
      font-size: 1.5rem;
    }

    .form-header p {
      margin: 0;
      color: #666;
      font-size: 0.9rem;
    }

    .form-field {
      margin-bottom: 16px;
    }

    label {
      display: block;
      margin-bottom: 6px;
      color: #333;
      font-weight: 500;
      font-size: 0.9rem;
    }

    input, textarea {
      width: 100%;
      padding: 10px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 0.95rem;
      font-family: inherit;
      box-sizing: border-box;
    }

    input:focus, textarea:focus {
      outline: none;
      border-color: #4CAF50;
      box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.1);
    }

    textarea {
      resize: vertical;
      min-height: 80px;
    }

    input[type="number"] {
      width: 120px;
    }

    .form-actions {
      display: flex;
      gap: 12px;
      margin-top: 24px;
      justify-content: flex-end;
    }

    button {
      padding: 10px 24px;
      border: none;
      border-radius: 4px;
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-primary {
      background: #4CAF50;
      color: white;
    }

    .btn-primary:hover {
      background: #45a049;
    }

    .btn-secondary {
      background: #ddd;
      color: #333;
    }

    .btn-secondary:hover {
      background: #ccc;
    }

    .hint {
      font-size: 0.85rem;
      color: #666;
      margin-top: 4px;
    }

    .readonly-value {
      padding: 10px;
      background: #e8f5e9;
      border: 1px solid #c8e6c9;
      border-radius: 4px;
      color: #2e7d32;
      font-size: 0.95rem;
    }
  `;

  @property({ type: String })
  suggestedName = '';

  @property({ type: String })
  suggestedManufacturer = '';

  @property({ type: String })
  suggestedModel = '';

  @property({ type: String })
  suggestedDescription = '';

  @property({ type: Number })
  suggestedButtonCount = 0;

  @state()
  private formData: MetadataFormData = {
    name: '',
    manufacturer: '',
    model: '',
    description: '',
    buttonCount: 0,
  };

  connectedCallback() {
    super.connectedCallback();
    // Initialize with suggested values if provided
    if (this.suggestedName) {
      this.formData.name = this.suggestedName;
    }
    if (this.suggestedManufacturer) {
      this.formData.manufacturer = this.suggestedManufacturer;
    }
    if (this.suggestedModel) {
      this.formData.model = this.suggestedModel;
    }
    if (this.suggestedDescription) {
      this.formData.description = this.suggestedDescription;
    }
    if (this.suggestedButtonCount) {
      this.formData.buttonCount = this.suggestedButtonCount;
    }
  }

  private _handleSubmit(e: Event) {
    e.preventDefault();
    
    // Dispatch custom event with form data
    this.dispatchEvent(new CustomEvent('metadata-submit', {
      detail: this.formData,
      bubbles: true,
      composed: true,
    }));
  }

  private _handleCancel() {
    this.dispatchEvent(new CustomEvent('metadata-cancel', {
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    return html`
      <div class="form-container" data-spectrum-pattern="form">
        <div class="form-header">
          <h2>Device Configuration Details</h2>
          <p>Please provide additional information about your device to complete the configuration.</p>
        </div>

        <form @submit=${this._handleSubmit}>
          <div class="form-field">
            <sp-field-label for="name" required>Device Name</sp-field-label>
            <sp-textfield
              id="name"
              required
              .value=${this.formData.name}
              @input=${(e: Event) => {
                this.formData.name = (e.target as HTMLInputElement).value;
              }}
              placeholder="e.g., XP-Pen Deco 640">
            </sp-textfield>
          </div>

          <div class="form-field">
            <sp-field-label for="manufacturer" required>Manufacturer</sp-field-label>
            <sp-textfield
              id="manufacturer"
              required
              .value=${this.formData.manufacturer}
              @input=${(e: Event) => {
                this.formData.manufacturer = (e.target as HTMLInputElement).value;
              }}
              placeholder="e.g., XP-Pen">
            </sp-textfield>
          </div>

          <div class="form-field">
            <sp-field-label for="model" required>Model</sp-field-label>
            <sp-textfield
              id="model"
              required
              .value=${this.formData.model}
              @input=${(e: Event) => {
                this.formData.model = (e.target as HTMLInputElement).value;
              }}
              placeholder="e.g., Deco 640">
            </sp-textfield>
          </div>

          <div class="form-field">
            <sp-field-label for="description" required>Description</sp-field-label>
            <sp-textfield
              id="description"
              multiline
              required
              .value=${this.formData.description}
              @input=${(e: Event) => {
                this.formData.description = (e.target as HTMLInputElement).value;
              }}
              placeholder="e.g., XP-Pen Deco 640 graphics tablet with 8 express keys">
            </sp-textfield>
          </div>

          ${this.suggestedButtonCount > 0 ? html`
            <!-- Button count already collected in step 9, show as read-only info -->
            <div class="form-field">
              <sp-field-label>Express Keys/Buttons</sp-field-label>
              <div class="readonly-value">${this.suggestedButtonCount} buttons detected in previous step</div>
            </div>
          ` : html`
            <div class="form-field">
              <sp-field-label for="buttonCount">Number of Express Keys/Buttons</sp-field-label>
              <sp-textfield
                type="number"
                id="buttonCount"
                min="0"
                max="32"
                .value=${this.formData.buttonCount.toString()}
                @input=${(e: Event) => {
                  this.formData.buttonCount = parseInt((e.target as HTMLInputElement).value) || 0;
                }}>
              </sp-textfield>
              <sp-help-text>Enter 0 if your device has no express keys</sp-help-text>
            </div>
          `}

          <div class="form-actions">
            <sp-button
              type="button"
              variant="secondary"
              @click=${this._handleCancel}>
              Cancel
            </sp-button>
            <sp-button
              type="submit"
              variant="accent">
              Generate Configuration
            </sp-button>
          </div>
        </form>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'device-metadata-form': DeviceMetadataForm;
  }
}