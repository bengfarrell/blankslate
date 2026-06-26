import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import '../components/tablet-visualizer/tablet-visualizer.js';
import '../components/events-display/events-display.js';
import type { TabletEvent } from '../components/events-display/events-display.js';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface ServerHello {
  type: 'connected';
  config: {
    name: string;
    manufacturer: string;
    model: string;
    maxX: number;
    maxY: number;
    maxPressure: number;
  };
  mode: 'device';
  dataFormat: 'translated';
}

interface ServerTabletData {
  type: 'tablet-data';
  timestamp: number;
  state: 'hover' | 'contact' | 'none' | 'buttons';
  x: number;
  y: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  tiltXY: number;
  primaryButtonPressed: boolean;
  secondaryButtonPressed: boolean;
  auxCodes: number[];
}

interface ServerStatus {
  type: 'status';
  status: 'connected' | 'disconnected';
  message: string;
  timestamp: number;
}

type ServerMessage = ServerHello | ServerTabletData | ServerStatus;

const DEFAULT_URL = `ws://${location.hostname || 'localhost'}:8765`;
const MAX_EVENTS = 200;
const RECONNECT_DELAY_MS = 1500;

@customElement('viewer-app')
export class ViewerApp extends LitElement {
  static styles = css`
    :host {
      display: block;
      padding: 24px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: var(--spectrum-gray-900);
    }
    header {
      display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap;
    }
    h1 { font-size: 18px; margin: 0; font-weight: 600; }
    .badge {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 12px; padding: 3px 10px; border-radius: 10px;
      background: var(--spectrum-gray-200); color: var(--spectrum-gray-800);
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--spectrum-gray-500); }
    .dot.connecting { background: #f0a000; }
    .dot.connected { background: var(--spectrum-positive-color-900); }
    .dot.disconnected, .dot.error { background: var(--spectrum-negative-color-900); }
    .meta { font-size: 12px; color: var(--spectrum-gray-700); font-family: 'JetBrains Mono', monospace; }

    .visualizers-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 16px;
      max-width: 100%;
    }
    @media (max-width: 900px) {
      .visualizers-grid { grid-template-columns: 1fr 1fr; }
      .visualizer-card.events-panel { grid-column: span 2; }
    }
    @media (max-width: 600px) {
      .visualizers-grid { grid-template-columns: 1fr; }
      .visualizer-card.events-panel { grid-column: span 1; }
    }
    .visualizer-card {
      background: var(--spectrum-gray-50);
      border-radius: 12px;
      padding: 12px;
      border: 1px solid var(--spectrum-gray-200);
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .visualizer-wrapper {
      flex: 1;
      max-height: 280px;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      overflow: hidden;
    }
    .data-values {
      display: flex;
      justify-content: space-around;
      gap: 8px;
      margin-top: auto;
      padding: 8px 0 0;
      border-top: 1px solid var(--spectrum-gray-200);
    }
    .data-item {
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      flex: 1; min-width: 0;
    }
    .data-label {
      font-size: 0.6rem; color: var(--spectrum-gray-600);
      text-transform: uppercase; letter-spacing: 0.03em;
      font-family: 'JetBrains Mono', monospace;
    }
    .data-value {
      font-size: 0.85rem; font-weight: 600;
      color: var(--spectrum-positive-color-900);
      font-family: 'JetBrains Mono', monospace;
    }
    .data-value.zero { color: var(--spectrum-gray-800); }
  `;

  @state() private status: ConnectionStatus = 'connecting';
  @state() private url = DEFAULT_URL;
  @state() private serverHello: ServerHello | null = null;
  @state() private latest: ServerTabletData | null = null;
  @state() private events: TabletEvent[] = [];

  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;

  connectedCallback() {
    super.connectedCallback();
    const params = new URLSearchParams(location.search);
    const override = params.get('ws');
    if (override) this.url = override;
    this.connect();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }

  private connect() {
    this.status = 'connecting';
    const ws = new WebSocket(this.url);
    this.socket = ws;
    ws.addEventListener('open', () => { this.status = 'connected'; });
    ws.addEventListener('close', () => { this.status = 'disconnected'; this.scheduleReconnect(); });
    ws.addEventListener('error', () => { this.status = 'error'; });
    ws.addEventListener('message', (e) => this.handleMessage(e.data));
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_DELAY_MS);
  }

  private handleMessage(raw: unknown) {
    if (typeof raw !== 'string') return;
    let msg: ServerMessage;
    try { msg = JSON.parse(raw) as ServerMessage; } catch { return; }
    if (msg.type === 'connected') {
      this.serverHello = msg;
    } else if (msg.type === 'tablet-data') {
      this.latest = msg;
      const next = [...this.events, msg as unknown as TabletEvent];
      if (next.length > MAX_EVENTS) next.splice(0, next.length - MAX_EVENTS);
      this.events = next;
    }
  }

  private fmt(v: number | undefined): string {
    return typeof v === 'number' ? v.toFixed(3) : '—';
  }

  render() {
    const cfg = this.serverHello?.config;
    const externalTabletData = this.latest ? {
      x: this.latest.x, y: this.latest.y, pressure: this.latest.pressure,
      tiltX: this.latest.tiltX, tiltY: this.latest.tiltY, tiltXY: this.latest.tiltXY,
      primaryButtonPressed: this.latest.primaryButtonPressed,
      secondaryButtonPressed: this.latest.secondaryButtonPressed,
    } : { x: 0, y: 0, pressure: 0, tiltX: 0, tiltY: 0, tiltXY: 0, primaryButtonPressed: false, secondaryButtonPressed: false };
    const connected = this.status === 'connected';
    const t = externalTabletData;
    return html`
      <header>
        <h1>blankslate viewer</h1>
        <span class="badge"><span class="dot ${this.status}"></span>${this.status}</span>
        ${cfg ? html`<span class="meta">${cfg.name}</span>` : ''}
        <span class="meta">${this.url}</span>
      </header>
      <div class="visualizers-grid">
        <div class="visualizer-card">
          <div class="visualizer-wrapper">
            <tablet-visualizer
              mode="tablet"
              socketMode
              .tabletConnected=${connected}
              .tabletDeviceInfo=${cfg ?? null}
              .externalTabletData=${externalTabletData}>
            </tablet-visualizer>
          </div>
          <div class="data-values">
            <div class="data-item">
              <span class="data-label">X</span>
              <span class="data-value ${t.x === 0 ? 'zero' : ''}">${this.fmt(t.x)}</span>
            </div>
            <div class="data-item">
              <span class="data-label">Y</span>
              <span class="data-value ${t.y === 0 ? 'zero' : ''}">${this.fmt(t.y)}</span>
            </div>
          </div>
        </div>

        <div class="visualizer-card">
          <div class="visualizer-wrapper">
            <tablet-visualizer
              mode="tilt"
              socketMode
              .tabletConnected=${connected}
              .tabletDeviceInfo=${cfg ?? null}
              .externalTabletData=${externalTabletData}>
            </tablet-visualizer>
          </div>
          <div class="data-values">
            <div class="data-item">
              <span class="data-label">Pressure</span>
              <span class="data-value ${t.pressure === 0 ? 'zero' : ''}">${this.fmt(t.pressure)}</span>
            </div>
            <div class="data-item">
              <span class="data-label">Tilt X</span>
              <span class="data-value ${t.tiltX === 0 ? 'zero' : ''}">${this.fmt(t.tiltX)}</span>
            </div>
            <div class="data-item">
              <span class="data-label">Tilt Y</span>
              <span class="data-value ${t.tiltY === 0 ? 'zero' : ''}">${this.fmt(t.tiltY)}</span>
            </div>
          </div>
        </div>

        <div class="visualizer-card events-panel">
          <events-display
            .events=${this.events}
            .isEmpty=${this.events.length === 0}
            .deviceInfo=${{ packetCount: this.events.length }}>
          </events-display>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'viewer-app': ViewerApp;
  }
}
