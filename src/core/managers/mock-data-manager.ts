/**
 * MockDataManager
 * Handles mock tablet device simulation for testing and demos
 */

import type { ConnectionState, TabletDataEvent } from './types.js';
import type { Config } from '../../models/config.js';
import { MockTabletDevice } from '../../mockbytes/mock-tablet-device.js';

export interface MockSimulation {
  id: string;
  label: string;
  action: (device: MockTabletDevice) => void;
}

export interface MockDataManagerEvents {
  'state-change': { isSimulating: boolean; currentSimulation: string };
  'raw-bytes': Uint8Array;
  'tablet-data': TabletDataEvent;
  'error': Error;
}

type EventCallback<T> = (data: T) => void;

/**
 * Default simulation options
 */
export const DEFAULT_SIMULATIONS: MockSimulation[] = [
  { id: 'circle', label: 'Draw Circle', action: (d) => d.playCircle() },
  { id: 'line', label: 'Draw Line', action: (d) => d.playLine() },
  { id: 'scribble', label: 'Scribble', action: (d) => d.playScribble() },
  { id: 'horizontal', label: 'Horizontal Drag', action: (d) => d.playHorizontalDrag() },
  { id: 'vertical', label: 'Vertical Drag', action: (d) => d.playVerticalDrag() },
  { id: 'hover-h', label: 'Hover Horizontal', action: (d) => d.playHoverHorizontalDrag() },
  { id: 'hover-v', label: 'Hover Vertical', action: (d) => d.playHoverVerticalDrag() },
  { id: 'tilt-x', label: 'Tilt X Sweep', action: (d) => d.playTiltXDrag() },
  { id: 'tilt-y', label: 'Tilt Y Sweep', action: (d) => d.playTiltYDrag() },
  { id: 'primary-btn', label: 'Primary Button', action: (d) => d.playPrimaryButtonDrag() },
  { id: 'secondary-btn', label: 'Secondary Button', action: (d) => d.playSecondaryButtonDrag() },
  { id: 'tablet-btns', label: 'Tablet Buttons', action: (d) => d.playTabletButtons(8) },
];

/**
 * Mock data manager for tablet simulation
 */
export class MockDataManager {
  private mockDevice: MockTabletDevice | null = null;
  private _isSimulating = false;
  private _currentSimulation = '';
  private _dataMode: 'raw' | 'translated' = 'translated';
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  
  private listeners: Map<string, Set<EventCallback<any>>> = new Map();

  get isSimulating(): boolean { return this._isSimulating; }
  get currentSimulation(): string { return this._currentSimulation; }
  get dataMode(): 'raw' | 'translated' { return this._dataMode; }
  get simulations(): MockSimulation[] { return DEFAULT_SIMULATIONS; }

  on<K extends keyof MockDataManagerEvents>(
    event: K,
    callback: EventCallback<MockDataManagerEvents[K]>
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off<K extends keyof MockDataManagerEvents>(
    event: K,
    callback: EventCallback<MockDataManagerEvents[K]>
  ): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit<K extends keyof MockDataManagerEvents>(
    event: K,
    data: MockDataManagerEvents[K]
  ): void {
    this.listeners.get(event)?.forEach(cb => cb(data));
  }

  /**
   * Initialize mock device with optional config
   */
  initialize(config?: Config | null): void {
    if (this.mockDevice) return;

    const mappings = config?.getByteCodeMappings();
    const maxX = mappings?.x?.max ?? 65535;
    const maxY = mappings?.y?.max ?? 65535;

    this.mockDevice = new MockTabletDevice({
      maxX,
      maxY,
      deviceName: 'Mock ' + (config?.name || 'Tablet'),
      translateEvents: this._dataMode === 'translated',
      byteCodeMappings: mappings,
    });

    this.mockDevice.addEventListener('inputreport', (data: Uint8Array) => {
      this.emit('raw-bytes', data);
    });

    this.mockDevice.addEventListener('tablet-event', (data: Uint8Array) => {
      const jsonStr = new TextDecoder().decode(data);
      const translated = JSON.parse(jsonStr) as TabletDataEvent;
      this.emit('tablet-data', translated);
    });
  }

  /**
   * Set data mode (raw or translated)
   */
  setDataMode(mode: 'raw' | 'translated', config?: Config | null): void {
    if (this._dataMode === mode) return;
    
    this._dataMode = mode;
    
    if (this.mockDevice) {
      this.stop();
      this.mockDevice = null;
      this.initialize(config);
    }
  }

  /**
   * Run a simulation
   */
  runSimulation(simulation: MockSimulation, config?: Config | null): void {
    this.initialize(config);
    if (!this.mockDevice) return;

    this.stop();

    this._isSimulating = true;
    this._currentSimulation = simulation.label;
    this.emitStateChange();

    simulation.action(this.mockDevice);

    this.checkInterval = setInterval(() => {
      if (this.mockDevice && !this.mockDevice.playing) {
        this._isSimulating = false;
        this._currentSimulation = '';
        this.emitStateChange();
        if (this.checkInterval) {
          clearInterval(this.checkInterval);
          this.checkInterval = null;
        }
      }
    }, 100);
  }

  /**
   * Run simulation by ID
   */
  runSimulationById(id: string, config?: Config | null): void {
    const simulation = DEFAULT_SIMULATIONS.find(s => s.id === id);
    if (simulation) {
      this.runSimulation(simulation, config);
    }
  }

  /**
   * Stop current simulation
   */
  stop(): void {
    if (this.mockDevice) {
      this.mockDevice.stop();
    }
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this._isSimulating = false;
    this._currentSimulation = '';
    this.emitStateChange();
  }

  private emitStateChange(): void {
    this.emit('state-change', {
      isSimulating: this._isSimulating,
      currentSimulation: this._currentSimulation
    });
  }

  dispose(): void {
    this.stop();
    this.mockDevice = null;
    this.listeners.clear();
  }
}
