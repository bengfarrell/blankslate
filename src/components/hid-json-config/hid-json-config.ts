import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { styles } from './hid-json-config.styles.js';
import '@spectrum-web-components/button/sp-button.js';

/**
 * Component that displays HID device configuration JSON with copy and download buttons
 */
@customElement('hid-json-config')
export class HidJsonConfig extends LitElement {
  static styles = styles;

  @property({ type: Object })
  config: any = null;

  @property({ type: String })
  metadata = '';

  private _getConfigWithMetadata(): string {
    if (!this.config) return '';

    let output = '';

    // Add metadata if provided
    if (this.metadata) {
      output += this.metadata;
    }

    output += JSON.stringify(this.config, null, 2);
    return output;
  }

  private async _copyConfig() {
    if (!this.config) return;

    const configText = this._getConfigWithMetadata();

    try {
      await navigator.clipboard.writeText(configText);
      alert('Configuration copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy:', err);
      alert('Failed to copy to clipboard. Please try again.');
    }
  }

  private _downloadConfig() {
    if (!this.config) return;

    const configText = this._getConfigWithMetadata();
    const blob = new Blob([configText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'device-byte-mappings.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  render() {
    if (!this.config) {
      return html`<div class="no-config">No configuration available yet.</div>`;
    }

    const configText = this._getConfigWithMetadata();

    return html`
      <div class="config-container">
        <pre class="config-display"><code>${configText}</code></pre>
        <div class="config-actions">
          <sp-button
            variant="secondary"
            @click="${this._copyConfig}">
            📋 Copy JSON
          </sp-button>
          <sp-button
            variant="secondary"
            @click="${this._downloadConfig}">
            💾 Download Config
          </sp-button>
        </div>
      </div>
    `;
  }
}