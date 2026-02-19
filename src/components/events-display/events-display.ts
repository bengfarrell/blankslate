import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { styles } from './events-display.styles.js';

/**
 * Tablet event for event stream display
 * Supports dynamic button counts via index signature (button1, button2, ..., buttonN)
 */
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
  state?: string;
  // Dynamic button properties (button1, button2, ..., buttonN)
  [key: string]: number | boolean | string | undefined;
}

export interface EventsDeviceInfo {
  packetCount?: number;
  isMock?: boolean;
  isTranslated?: boolean;
}

/**
 * Component that displays the latest tablet event
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

  protected _formatValue(value: number | undefined, decimals: number = 3): string {
    if (value === undefined) return '—';
    return value.toFixed(decimals);
  }

  protected _getPressedTabletButton(event: TabletEvent): number | null {
    // Dynamically check for any buttonN property that is true
    for (const key of Object.keys(event)) {
      const match = key.match(/^button(\d+)$/);
      if (match && event[key] === true) {
        return parseInt(match[1], 10);
      }
    }
    return null;
  }

  render() {
    if (this.isEmpty || this.events.length === 0) {
      return html`
        <div class="events-container empty">
          <div class="empty-state">
            <div class="empty-icon">—</div>
            <p>No events yet</p>
          </div>
        </div>
      `;
    }

    // Get the latest event
    const event = this.events[this.events.length - 1];

    return html`
      <div class="events-container">
        <div class="event-header">
          <span class="event-count">${this.deviceInfo?.packetCount ?? this.events.length}</span>
          <span class="event-label">events</span>
          <div class="header-badges">
            ${this.deviceInfo?.isMock ? html`<span class="source-badge mock">mock</span>` : ''}
            ${this.deviceInfo?.isTranslated ? html`<span class="source-badge translated">translated</span>` : ''}
          </div>
        </div>
        
        <div class="event-grid">
          <div class="event-field">
            <span class="field-label">X</span>
            <span class="field-value">${this._formatValue(event.x)}</span>
          </div>
          <div class="event-field">
            <span class="field-label">Y</span>
            <span class="field-value">${this._formatValue(event.y)}</span>
          </div>
          <div class="event-field">
            <span class="field-label">Pressure</span>
            <span class="field-value">${this._formatValue(event.pressure)}</span>
          </div>
          <div class="event-field">
            <span class="field-label">Tilt X</span>
            <span class="field-value">${this._formatValue(event.tiltX)}</span>
          </div>
          <div class="event-field">
            <span class="field-label">Tilt Y</span>
            <span class="field-value">${this._formatValue(event.tiltY)}</span>
          </div>
        </div>

        <div class="button-status">
          <div class="button-indicator ${event.primaryButtonPressed ? 'active' : ''}">
            <span class="button-label">Primary</span>
          </div>
          <div class="button-indicator ${event.secondaryButtonPressed ? 'active' : ''}">
            <span class="button-label">Secondary</span>
          </div>
          <div class="button-indicator tablet-btn ${this._getPressedTabletButton(event) ? 'active' : ''}">
            <span class="button-label">Tablet ${this._getPressedTabletButton(event) ?? '—'}</span>
          </div>
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
