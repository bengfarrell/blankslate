/**
 * WebSocketManager
 * Handles WebSocket connection lifecycle and message parsing for tablet data
 */

import type { ConnectionState, WebSocketTabletEvent, TabletDataEvent } from './types.js';
import type { Config, ConfigData } from '../../models/config.js';
import { Config as ConfigClass } from '../../models/config.js';

/**
 * Strummer config data sent by strummer-websocket-server
 * This is a minimal interface - the full config is in the `config` property
 */
export interface StrummerConfigData {
  throttleMs: number;
  notes: Array<{ notation: string; octave: number }>;
  /** Full strummer configuration (typed by consuming application) */
  config?: Record<string, unknown>;
}

export interface WebSocketManagerEvents {
  'connection-change': ConnectionState;
  'tablet-data': TabletDataEvent;
  'raw-bytes': Uint8Array;
  'server-info': { name: string; dataFormat: 'raw' | 'translated' };
  'config-received': Config;
  'strummer-config': StrummerConfigData;
  'error': Error;
}

type EventCallback<T> = (data: T) => void;

/**
 * WebSocket connection manager for tablet data
 */
export class WebSocketManager {
  private websocket: WebSocket | null = null;
  private _url: string = 'ws://localhost:8765';
  private _state: ConnectionState = 'disconnected';
  private _dataFormat: 'raw' | 'translated' = 'translated';
  private _serverInfo: string = '';
  private _config: Config | null = null;
  
  private listeners: Map<string, Set<EventCallback<any>>> = new Map();

  get url(): string { return this._url; }
  set url(value: string) { this._url = value; }

  get state(): ConnectionState { return this._state; }
  get connected(): boolean { return this._state === 'connected'; }
  get dataFormat(): 'raw' | 'translated' { return this._dataFormat; }
  get serverInfo(): string { return this._serverInfo; }
  get config(): Config | null { return this._config; }

  /**
   * Subscribe to events
   */
  on<K extends keyof WebSocketManagerEvents>(
    event: K,
    callback: EventCallback<WebSocketManagerEvents[K]>
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * Unsubscribe from events
   */
  off<K extends keyof WebSocketManagerEvents>(
    event: K,
    callback: EventCallback<WebSocketManagerEvents[K]>
  ): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit<K extends keyof WebSocketManagerEvents>(
    event: K,
    data: WebSocketManagerEvents[K]
  ): void {
    this.listeners.get(event)?.forEach(cb => cb(data));
  }

  private setState(state: ConnectionState): void {
    this._state = state;
    this.emit('connection-change', state);
  }

  /**
   * Connect to WebSocket server
   */
  connect(url?: string): void {
    if (this.connected) return;
    
    if (url) this._url = url;
    if (!this._url) return;

    this.setState('connecting');

    try {
      this.websocket = new WebSocket(this._url);
      this.websocket.binaryType = 'arraybuffer';

      this.websocket.onopen = () => {
        this.setState('connected');
      };

      this.websocket.onmessage = (event) => {
        this.handleMessage(event);
      };

      this.websocket.onclose = () => {
        this.setState('disconnected');
        this._serverInfo = '';
        this.websocket = null;
      };

      this.websocket.onerror = () => {
        this.setState('error');
        this.websocket = null;
      };

    } catch (err) {
      this.setState('error');
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
    this.setState('disconnected');
    this._serverInfo = '';
  }

  private handleMessage(event: MessageEvent): void {
    if (typeof event.data === 'string') {
      try {
        const data = JSON.parse(event.data) as WebSocketTabletEvent;
        this.handleJsonMessage(data);
      } catch {
        // Failed to parse
      }
    } else if (event.data instanceof Blob) {
      event.data.arrayBuffer().then((buffer) => {
        this.handleRawBytes(new Uint8Array(buffer));
      });
    } else if (event.data instanceof ArrayBuffer) {
      this.handleRawBytes(new Uint8Array(event.data));
    }
  }

  private handleJsonMessage(data: WebSocketTabletEvent): void {
    if (data.type === 'connected') {
      this._serverInfo = data.config?.name || 'WebSocket Server';

      if (data.dataFormat) {
        this._dataFormat = data.dataFormat;
        this.emit('server-info', {
          name: this._serverInfo,
          dataFormat: this._dataFormat
        });

        if (data.dataFormat === 'raw' && data.fullConfig) {
          this._config = new ConfigClass(data.fullConfig as ConfigData);
          this.emit('config-received', this._config);
        }
      }
      return;
    }

    // Handle strummer config message (from strummer-websocket-server)
    if (data.type === 'config' && 'data' in data) {
      const configData = (data as unknown as { type: 'config'; data: StrummerConfigData }).data;
      this.emit('strummer-config', configData);
      return;
    }

    if (data.type === 'tablet-data') {
      const tabletData: TabletDataEvent & { strum?: unknown } = {
        x: data.x,
        y: data.y,
        pressure: data.pressure,
        tiltX: data.tiltX,
        tiltY: data.tiltY,
        primaryButtonPressed: data.primaryButtonPressed,
        secondaryButtonPressed: data.secondaryButtonPressed,
        button: data.tabletButtons ?? data.button,
        state: data.state,
      };
      // Pass through strum data if present (for sketchatone compatibility)
      if ('strum' in data) {
        tabletData.strum = data.strum;
      }
      this.emit('tablet-data', tabletData);
    }
  }

  private handleRawBytes(bytes: Uint8Array): void {
    if (this._dataFormat !== 'raw') {
      this._dataFormat = 'raw';
    }
    this.emit('raw-bytes', bytes);
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.disconnect();
    this.listeners.clear();
  }
}
