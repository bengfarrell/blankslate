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

/**
 * WebSocket tablet event structure
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
  button1?: boolean;
  button2?: boolean;
  button3?: boolean;
  button4?: boolean;
  button5?: boolean;
  button6?: boolean;
  button7?: boolean;
  button8?: boolean;
  button?: number;
  config?: {
    name?: string;
    manufacturer?: string;
    model?: string;
  };
  mode?: string;
  dataFormat?: 'raw' | 'translated';
  fullConfig?: any;
}

/**
 * Connection state for any data source
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Data source type
 */
export type DataSource = 'none' | 'webhid' | 'websocket' | 'mock';
