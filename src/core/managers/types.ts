/**
 * Shared types for tablet data managers
 */

/**
 * Normalized tablet data - all values are normalized to standard ranges
 * x, y, pressure: 0-1
 * tiltX, tiltY: -1 to 1
 */
export interface TabletData {
  x: number;
  y: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  tiltXY: number;
  primaryButtonPressed: boolean;
  secondaryButtonPressed: boolean;
  button?: number;
  state?: string;
}

/**
 * Raw tablet event from various sources
 */
export interface TabletDataEvent {
  x?: number;
  y?: number;
  pressure?: number;
  tiltX?: number;
  tiltY?: number;
  button?: number;
  primaryButtonPressed?: boolean;
  secondaryButtonPressed?: boolean;
  state?: string;
  [key: string]: string | number | boolean | undefined;
}

/**
 * Byte data for raw bytes display
 */
export interface ByteData {
  byteIndex: number;
  value: number;
  label?: string;
  isIdentified?: boolean;
}

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

/**
 * WebSocket tablet event structure
 * Supports dynamic button counts via index signature (button1, button2, ..., buttonN)
 */
export interface WebSocketTabletEvent {
  type: 'tablet-data' | 'connected' | 'config';
  timestamp?: number;
  state?: string;
  x?: number;
  y?: number;
  pressure?: number;
  tiltX?: number;
  tiltY?: number;
  tiltXY?: number;
  primaryButtonPressed?: boolean;
  secondaryButtonPressed?: boolean;
  tabletButtons?: number;
  button?: number;
  config?: {
    name?: string;
    manufacturer?: string;
    model?: string;
  };
  mode?: string;
  dataFormat?: 'raw' | 'translated';
  fullConfig?: any;
  // Dynamic button properties (button1, button2, ..., buttonN)
  [key: string]: string | number | boolean | undefined | { name?: string; manufacturer?: string; model?: string; };
}

/**
 * Connection state for any data source
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Data source type
 */
export type DataSource = 'none' | 'webhid' | 'websocket' | 'mock';
