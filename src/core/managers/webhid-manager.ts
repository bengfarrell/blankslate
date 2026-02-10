/**
 * WebHIDManager
 * Handles WebHID device connection and input report handling
 */

import type { ConnectionState } from './types.js';
import type { Config } from '../../models/config.js';

export interface WebHIDManagerEvents {
  'connection-change': ConnectionState;
  'input-report': { bytes: Uint8Array; reportId: number };
  'device-info': { name: string; vendorId: number; productId: number };
  'error': Error;
}

type EventCallback<T> = (data: T) => void;

/**
 * WebHID connection manager for tablet devices
 */
export class WebHIDManager {
  private device: HIDDevice | null = null;
  private secondaryDevice: HIDDevice | null = null;
  private tertiaryDevice: HIDDevice | null = null;
  private _state: ConnectionState = 'disconnected';
  private _deviceName: string = '';
  private _currentReportId: number | null = null;
  
  private listeners: Map<string, Set<EventCallback<any>>> = new Map();

  get state(): ConnectionState { return this._state; }
  get connected(): boolean { return this._state === 'connected'; }
  get deviceName(): string { return this._deviceName; }
  get currentReportId(): number | null { return this._currentReportId; }

  on<K extends keyof WebHIDManagerEvents>(
    event: K,
    callback: EventCallback<WebHIDManagerEvents[K]>
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off<K extends keyof WebHIDManagerEvents>(
    event: K,
    callback: EventCallback<WebHIDManagerEvents[K]>
  ): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit<K extends keyof WebHIDManagerEvents>(
    event: K,
    data: WebHIDManagerEvents[K]
  ): void {
    this.listeners.get(event)?.forEach(cb => cb(data));
  }

  private setState(state: ConnectionState): void {
    this._state = state;
    this.emit('connection-change', state);
  }

  /**
   * Connect to a HID device using the provided config
   */
  async connect(config: Config): Promise<void> {
    if (this.connected) return;

    this.setState('connecting');

    try {
      const requestedDevices = await navigator.hid.requestDevice({
        filters: [{
          vendorId: config.deviceInfo.vendor_id,
          productId: config.deviceInfo.product_id
        }]
      });

      if (requestedDevices.length === 0) {
        this.setState('disconnected');
        return;
      }

      const allDevices = await navigator.hid.getDevices();
      const tabletDevices = allDevices.filter(d =>
        d.vendorId === config.deviceInfo.vendor_id &&
        d.productId === config.deviceInfo.product_id
      );

      const primaryDevice = this.selectPrimaryDevice(tabletDevices, config);
      
      if (!primaryDevice) {
        this.setState('error');
        this.emit('error', new Error('No suitable device interface found'));
        return;
      }

      this.device = primaryDevice;
      this._deviceName = primaryDevice.productName || config.name;

      if (!primaryDevice.opened) {
        await primaryDevice.open();
      }

      this.setupDeviceListeners(primaryDevice);
      
      // Try secondary/tertiary devices
      await this.setupSecondaryDevices(tabletDevices, primaryDevice, config);

      this.setState('connected');
      this.emit('device-info', {
        name: this._deviceName,
        vendorId: primaryDevice.vendorId,
        productId: primaryDevice.productId
      });

    } catch (err) {
      this.setState('error');
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }

  private selectPrimaryDevice(devices: HIDDevice[], config: Config): HIDDevice | undefined {
    const digitizerUsagePage = config.modes?.[0]?.digitizerUsagePage ?? 13;

    // Priority: vendor-specific > digitizerUsagePage match > standard digitizer > first
    const vendorDevice = devices.find(d =>
      d.collections.some(c => c.usagePage && c.usagePage >= 0xFF00)
    );
    const usagePageMatch = devices.find(d =>
      d.collections.some(c => c.usagePage === digitizerUsagePage)
    );
    const digitizerDevice = devices.find(d =>
      d.collections.some(c => c.usagePage === 13)
    );

    return vendorDevice || usagePageMatch || digitizerDevice || devices[0];
  }

  private async setupSecondaryDevices(
    devices: HIDDevice[], 
    primary: HIDDevice, 
    config: Config
  ): Promise<void> {
    const digitizerDevice = devices.find(d =>
      d.collections.some(c => c.usagePage === 13) && d !== primary
    );
    const device0 = devices[0] !== primary ? devices[0] : null;

    if (digitizerDevice) {
      try {
        if (!digitizerDevice.opened) await digitizerDevice.open();
        this.setupDeviceListeners(digitizerDevice);
        this.secondaryDevice = digitizerDevice;
      } catch { /* ignore */ }
    }

    if (device0 && device0 !== this.secondaryDevice) {
      try {
        if (!device0.opened) await device0.open();
        this.setupDeviceListeners(device0);
        this.tertiaryDevice = device0;
      } catch { /* ignore */ }
    }
  }

  private setupDeviceListeners(device: HIDDevice): void {
    device.addEventListener('inputreport', (event: HIDInputReportEvent) => {
      const dv = event.data;
      const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
      this._currentReportId = event.reportId;
      this.emit('input-report', { bytes, reportId: event.reportId });
    });

    device.addEventListener('error', (event: any) => {
      this.emit('error', new Error(`HID Device Error: ${event}`));
    });
  }

  /**
   * Disconnect from HID device
   */
  disconnect(): void {
    [this.device, this.secondaryDevice, this.tertiaryDevice].forEach(d => {
      if (d) {
        try { d.close(); } catch { /* ignore */ }
      }
    });
    
    this.device = null;
    this.secondaryDevice = null;
    this.tertiaryDevice = null;
    this._deviceName = '';
    this._currentReportId = null;
    this.setState('disconnected');
  }

  dispose(): void {
    this.disconnect();
    this.listeners.clear();
  }
}
