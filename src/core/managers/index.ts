/**
 * Tablet Data Managers
 * Reusable utilities for handling tablet data from various sources
 */

export * from './types.js';
export * from './tablet-data-processor.js';
export { WebSocketManager, type WebSocketManagerEvents, type StrummerConfigData } from './websocket-manager.js';
export { WebHIDManager, type WebHIDManagerEvents } from './webhid-manager.js';
export { 
  MockDataManager, 
  type MockDataManagerEvents,
  type MockSimulation,
  DEFAULT_SIMULATIONS 
} from './mock-data-manager.js';
