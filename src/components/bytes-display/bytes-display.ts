import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { styles } from './bytes-display.styles.js';
import '../byte-display-block/byte-display-block.js';

export interface ByteData {
  byteIndex: number;
  value: number;
  min?: number;
  max?: number;
  variance?: number;
  isBestGuess?: boolean;
  isIdentified?: boolean;
  label?: string;
}

export interface DeviceInfo {
  deviceNumber?: number;
  packetCount?: number;
  digitizerUsagePage?: number;
  isMock?: boolean;
}

/**
 * Component that displays a grid of byte cells
 */
@customElement('bytes-display')
export class BytesDisplay extends LitElement {
  static styles = styles;

  @property({ type: Array })
  bytes: ByteData[] = [];

  @property({ type: Boolean })
  isEmpty = false;

  @property({ type: Number })
  placeholderCount = 9;

  @property({ type: Object })
  deviceInfo?: DeviceInfo;

  render() {
    const deviceInfoHtml = this.deviceInfo ? html`
      <div class="device-info-header">
        ${this.deviceInfo.deviceNumber !== undefined ? html`
          <span class="info-item">
            <span class="info-label">Device:</span>
            <span class="info-value">${this.deviceInfo.isMock ? 'Simulated' : this.deviceInfo.deviceNumber}</span>
          </span>
        ` : ''}
        ${this.deviceInfo.packetCount !== undefined ? html`
          <span class="info-item">
            <span class="info-label">Packets:</span>
            <span class="info-value">${this.deviceInfo.packetCount}</span>
          </span>
        ` : ''}
        ${this.deviceInfo.digitizerUsagePage !== undefined ? html`
          <span class="info-item">
            <span class="info-label">Digitizer Usage Page:</span>
            <span class="info-value">${this.deviceInfo.digitizerUsagePage}</span>
          </span>
        ` : ''}
        ${this.deviceInfo.digitizerUsagePage === 13 ? html`
          <span class="info-badge digitizer ${this.deviceInfo.isMock ? 'mock' : ''}">
            ${this.deviceInfo.isMock ? 'Simulated Pen' : 'Digitizer - Pen'}
          </span>
        ` : ''}
      </div>
    ` : '';

    if (this.isEmpty) {
      // Show empty placeholder cells
      return html`
        <div class="bytes-container">
          ${deviceInfoHtml}
          <div class="bytes-grid">
            ${Array.from({ length: this.placeholderCount }).map((_, index) => html`
              <byte-display-block
                .byteIndex=${index}
                .isEmpty=${true}>
              </byte-display-block>
            `)}
          </div>
        </div>
      `;
    }

    return html`
      <div class="bytes-container">
        ${deviceInfoHtml}
        <div class="bytes-grid">
          ${this.bytes.map(byte => html`
            <byte-display-block
              .byteIndex=${byte.byteIndex}
              .value=${byte.value}
              .min=${byte.min}
              .max=${byte.max}
              .variance=${byte.variance}
              .isBestGuess=${byte.isBestGuess || false}
              .isIdentified=${byte.isIdentified || false}
              .label=${byte.label}>
            </byte-display-block>
          `)}
        </div>
      </div>
    `;
  }
}

