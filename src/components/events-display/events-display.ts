import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { styles } from './events-display.styles.js';

export interface TabletEvent {
  timestamp: number;
  x?: number;
  y?: number;
  pressure?: number;
  tiltX?: number;
  tiltY?: number;
  tiltXY?: number;
  primaryButtonPressed?: boolean;
  secondaryButtonPressed?: boolean;
  button1?: boolean;
  button2?: boolean;
  button3?: boolean;
  button4?: boolean;
  button5?: boolean;
  button6?: boolean;
  button7?: boolean;
  button8?: boolean;
  state?: string;
}

export interface EventsDeviceInfo {
  packetCount?: number;
  isMock?: boolean;
}

/**
 * Component that displays a stream of tablet events
 */
@customElement('events-display')
export class EventsDisplay extends LitElement {
  static styles = styles;

  @property({ type: Array })
  events: TabletEvent[] = [];

  @property({ type: Boolean })
  isEmpty = false;

  @property({ type: Object })
  deviceInfo?: EventsDeviceInfo;

  @state()
  private maxEvents = 10;

  private _formatValue(value: number | undefined, decimals: number = 3): string {
    if (value === undefined) return '-';
    return value.toFixed(decimals);
  }

  private _formatBoolean(value: boolean | undefined): string {
    if (value === undefined) return '-';
    return value ? '✓' : '✗';
  }

  render() {
    const deviceInfoHtml = this.deviceInfo ? html`
      <div class="device-info-header">
        ${this.deviceInfo.packetCount !== undefined ? html`
          <span class="info-item">
            <span class="info-label">Events:</span>
            <span class="info-value">${this.deviceInfo.packetCount}</span>
          </span>
        ` : ''}
        ${this.deviceInfo.isMock ? html`
          <span class="info-badge mock">Simulated Events</span>
        ` : ''}
      </div>
    ` : '';

    if (this.isEmpty || this.events.length === 0) {
      return html`
        <div class="events-container">
          ${deviceInfoHtml}
          <div class="empty-state">
            <div class="empty-icon">📭</div>
            <p>No events received yet</p>
          </div>
        </div>
      `;
    }

    // Show only the most recent events
    const recentEvents = this.events.slice(-this.maxEvents).reverse();

    return html`
      <div class="events-container">
        ${deviceInfoHtml}
        <div class="events-list">
          ${recentEvents.map((event, index) => html`
            <div class="event-item ${index === 0 ? 'latest' : ''}">
              <div class="event-row">
                <span class="event-label">Position:</span>
                <span class="event-value">
                  x: ${this._formatValue(event.x)} 
                  y: ${this._formatValue(event.y)}
                </span>
              </div>
              <div class="event-row">
                <span class="event-label">Pressure:</span>
                <span class="event-value">${this._formatValue(event.pressure)}</span>
              </div>
              ${event.tiltX !== undefined || event.tiltY !== undefined ? html`
                <div class="event-row">
                  <span class="event-label">Tilt:</span>
                  <span class="event-value">
                    X: ${this._formatValue(event.tiltX)} 
                    Y: ${this._formatValue(event.tiltY)}
                  </span>
                </div>
              ` : ''}
              ${event.primaryButtonPressed !== undefined || event.secondaryButtonPressed !== undefined ? html`
                <div class="event-row">
                  <span class="event-label">Stylus:</span>
                  <span class="event-value">
                    Btn1: ${this._formatBoolean(event.primaryButtonPressed)} 
                    Btn2: ${this._formatBoolean(event.secondaryButtonPressed)}
                  </span>
                </div>
              ` : ''}
              ${event.state ? html`
                <div class="event-row">
                  <span class="event-label">State:</span>
                  <span class="event-value state-${event.state}">${event.state}</span>
                </div>
              ` : ''}
            </div>
          `)}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'events-display': EventsDisplay;
  }
}

