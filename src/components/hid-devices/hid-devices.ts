import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { styles } from './hid-devices.styles.js';
import '../device-list-minimal/device-list-minimal.js';
import '../bytes-display/bytes-display.js';
import type { DeviceStream, DeviceDetails } from '../device-list-minimal/device-list-minimal.js';
import type { ByteData, DeviceInfo } from '../bytes-display/bytes-display.js';
import '@spectrum-web-components/button/sp-button.js';

/**
 * Component that wraps device list and bytes display together
 */
@customElement('hid-devices')
export class HidDevices extends LitElement {
  static styles = styles;

  @property({ type: Array })
  streams: DeviceStream[] = [];

  @property({ type: Object })
  deviceDetails: Map<number, DeviceDetails> = new Map();

  @property({ type: Array })
  bytes: ByteData[] = [];

  @property({ type: Boolean })
  bytesEmpty = false;

  @property({ type: Number })
  bytesPlaceholderCount = 9;

  @property({ type: Object })
  bytesDeviceInfo?: DeviceInfo;

  @property({ type: Boolean })
  isConnected = false;

  @property({ type: String })
  connectedDeviceName = '';

  @property({ type: Boolean })
  isDeviceOpened = false;

  private _handleDisconnect() {
    this.dispatchEvent(new CustomEvent('disconnect', {
      bubbles: true,
      composed: true
    }));
  }

  render() {
    return html`
      <div class="hid-devices">
        <div class="header-actions">
          ${this.isConnected ? html`
            <div class="status-badge connected">
              <span class="status-icon">✓</span>
              <span>Connected: ${this.connectedDeviceName}</span>
              ${this.isDeviceOpened
                ? html`<span class="status-detail">• Opened</span>`
                : html`<span class="status-detail warning">• Not Opened</span>`}
            </div>
            <sp-button
              size="s"
              variant="negative"
              data-spectrum-pattern="button-negative"
              @click="${this._handleDisconnect}">
              Disconnect
            </sp-button>
          ` : ''}
        </div>

        <device-list-minimal
          .streams=${this.streams}
          .deviceDetails=${this.deviceDetails}>
        </device-list-minimal>

        <bytes-display
          .bytes=${this.bytes}
          .isEmpty=${this.bytesEmpty}
          .placeholderCount=${this.bytesPlaceholderCount}
          .deviceInfo=${this.bytesDeviceInfo}>
        </bytes-display>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hid-devices': HidDevices;
  }
}