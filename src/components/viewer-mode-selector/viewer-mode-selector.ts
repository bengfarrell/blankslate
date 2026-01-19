import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { styles } from './viewer-mode-selector.styles.js';
import '@spectrum-web-components/button/sp-button.js';

export type ViewerMode = 'webhid' | 'mock-raw' | 'mock-translated' | 'websocket';

/**
 * Viewer mode selection component
 * Allows users to choose how they want to view tablet data
 */
@customElement('viewer-mode-selector')
export class ViewerModeSelector extends LitElement {
  static styles = styles;

  private _handleModeSelect(mode: ViewerMode) {
    this.dispatchEvent(new CustomEvent('mode-selected', {
      detail: { mode },
      bubbles: true,
      composed: true
    }));
  }

  render() {
    return html`
      <div class="mode-selector">
        <div class="hero">
          <h1>Select Viewer Mode</h1>
          <p class="tagline">Choose how you want to view tablet data</p>
        </div>

        <div class="modes-grid">
          <!-- WebHID Mode -->
          <div class="mode-card webhid" @click=${() => this._handleModeSelect('webhid')}>
            <div class="card-icon">HID</div>
            <h2>Live WebHID</h2>
            <p>Connect to your tablet via WebHID and view live data with raw bytes</p>
            <div class="features">
              <div class="feature">
                <span>• Raw byte display</span>
              </div>
              <div class="feature">
                <span>• Real-time tablet input</span>
              </div>
              <div class="feature">
                <span>• Debug byte mappings</span>
              </div>
            </div>
            <sp-button variant="primary" data-spectrum-pattern="button-primary">
              Select →
            </sp-button>
          </div>

          <!-- Mock Data Mode -->
          <div class="mode-card mock-data" @click=${() => this._handleModeSelect('mock-translated')}>
            <div class="card-icon">MOCK</div>
            <h2>Mock Data</h2>
            <p>Test with simulated tablet data - no physical device needed</p>
            <div class="features">
              <div class="feature">
                <span>• Simulated gestures</span>
              </div>
              <div class="feature">
                <span>• Event stream display</span>
              </div>
              <div class="feature">
                <span>• Perfect for testing</span>
              </div>
            </div>
            <sp-button variant="primary" data-spectrum-pattern="button-primary">
              Select →
            </sp-button>
          </div>

          <!-- WebSocket Mode -->
          <div class="mode-card websocket" @click=${() => this._handleModeSelect('websocket')}>
            <div class="card-icon">WS</div>
            <h2>WebSocket</h2>
            <p>Connect to a WebSocket server for remote tablet data streaming</p>
            <div class="features">
              <div class="feature">
                <span>• Remote connection</span>
              </div>
              <div class="feature">
                <span>• Event stream display</span>
              </div>
              <div class="feature">
                <span>• Node.js server support</span>
              </div>
            </div>
            <sp-button variant="primary" data-spectrum-pattern="button-primary">
              Select →
            </sp-button>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'viewer-mode-selector': ViewerModeSelector;
  }
}