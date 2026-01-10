/**
 * WebHID Reader
 * Implements IHIDReader using the WebHID API for browser environments
 */

import type { IHIDReader, IHIDDeviceManager, HIDDeviceInfo, HIDDeviceFilter, HIDDataCallback } from './hid-interface.js';

/**
 * Convert WebHID device to our HIDDeviceInfo format
 */
function toDeviceInfo(device: HIDDevice): HIDDeviceInfo {
  return {
    vendorId: device.vendorId,
    productId: device.productId,
    productName: device.productName || 'Unknown Device',
    usagePage: device.collections[0]?.usagePage,
    usage: device.collections[0]?.usage,
    collections: device.collections
      .filter(c => c.usagePage !== undefined && c.usage !== undefined)
      .map(c => ({
        usagePage: c.usagePage!,
        usage: c.usage!,
      })),
  };
}

/**
 * WebHID Reader implementation
 */
export class WebHIDReader implements IHIDReader {
  private device: HIDDevice;
  private _deviceInfo: HIDDeviceInfo;
  private dataCallback: HIDDataCallback | null = null;
  private reportIdFilter: number | undefined;
  private inputReportHandler: ((event: HIDInputReportEvent) => void) | null = null;

  constructor(device: HIDDevice) {
    this.device = device;
    this._deviceInfo = toDeviceInfo(device);
  }

  get isOpen(): boolean {
    return this.device.opened;
  }

  get deviceInfo(): HIDDeviceInfo {
    return this._deviceInfo;
  }

  /**
   * Get the underlying HIDDevice (for advanced use)
   */
  get rawDevice(): HIDDevice {
    return this.device;
  }

  async open(): Promise<void> {
    if (this.device.opened) return;
    await this.device.open();
  }

  async close(): Promise<void> {
    this.stopReading();
    if (this.device.opened) {
      await this.device.close();
    }
  }

  startReading(callback: HIDDataCallback, reportId?: number): void {
    this.dataCallback = callback;
    this.reportIdFilter = reportId;

    // Remove any existing handler
    if (this.inputReportHandler) {
      this.device.removeEventListener('inputreport', this.inputReportHandler);
    }

    // Create and attach new handler
    this.inputReportHandler = (event: HIDInputReportEvent) => {
      if (!this.dataCallback) return;

      // Filter by report ID if specified
      if (this.reportIdFilter !== undefined && event.reportId !== this.reportIdFilter) {
        return;
      }

      // WebHID provides data as a DataView, which may be a view into a larger ArrayBuffer
      // We must use byteOffset and byteLength to get only the valid portion
      const dataView = event.data;
      const data = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
      this.dataCallback(data, event.reportId);
    };

    this.device.addEventListener('inputreport', this.inputReportHandler);
  }

  stopReading(): void {
    if (this.inputReportHandler) {
      this.device.removeEventListener('inputreport', this.inputReportHandler);
      this.inputReportHandler = null;
    }
    this.dataCallback = null;
  }
}

/**
 * WebHID Device Manager
 */
export class WebHIDDeviceManager implements IHIDDeviceManager {
  /**
   * Check if WebHID is available
   */
  static isAvailable(): boolean {
    return 'hid' in navigator;
  }

  /**
   * List already-authorized HID devices
   */
  async listDevices(filter?: HIDDeviceFilter): Promise<HIDDeviceInfo[]> {
    if (!WebHIDDeviceManager.isAvailable()) {
      console.warn('WebHID is not available in this browser');
      return [];
    }

    const devices = await navigator.hid.getDevices();
    
    let filtered = devices;
    
    if (filter) {
      filtered = devices.filter(device => {
        if (filter.vendorId !== undefined && device.vendorId !== filter.vendorId) {
          return false;
        }
        if (filter.productId !== undefined && device.productId !== filter.productId) {
          return false;
        }
        if (filter.usagePage !== undefined) {
          const hasUsagePage = device.collections.some(c => c.usagePage === filter.usagePage);
          if (!hasUsagePage) return false;
        }
        if (filter.usage !== undefined) {
          const hasUsage = device.collections.some(c => c.usage === filter.usage);
          if (!hasUsage) return false;
        }
        return true;
      });
    }
    
    return filtered.map(toDeviceInfo);
  }

  /**
   * Request user to select a device via browser picker
   */
  async requestDevice(filter?: HIDDeviceFilter): Promise<WebHIDReader | null> {
    if (!WebHIDDeviceManager.isAvailable()) {
      throw new Error('WebHID is not available in this browser');
    }

    const filters: HIDDeviceRequestOptions['filters'] = [];
    
    if (filter) {
      const f: { vendorId?: number; productId?: number; usagePage?: number; usage?: number } = {};
      if (filter.vendorId !== undefined) f.vendorId = filter.vendorId;
      if (filter.productId !== undefined) f.productId = filter.productId;
      if (filter.usagePage !== undefined) f.usagePage = filter.usagePage;
      if (filter.usage !== undefined) f.usage = filter.usage;
      if (Object.keys(f).length > 0) {
        filters.push(f);
      }
    }

    const devices = await navigator.hid.requestDevice({
      filters: filters.length > 0 ? filters : [],
    });

    if (devices.length === 0) {
      return null;
    }

    return new WebHIDReader(devices[0]);
  }

  /**
   * Open a specific device (must be already authorized)
   */
  async openDevice(identifier: string | HIDDeviceInfo): Promise<WebHIDReader> {
    const devices = await navigator.hid.getDevices();
    
    let device: HIDDevice | undefined;
    
    if (typeof identifier === 'string') {
      // Can't use path in WebHID, search by vendor/product from parsed string
      throw new Error('Device path lookup not supported in WebHID. Use HIDDeviceInfo instead.');
    } else {
      device = devices.find(d => 
        d.vendorId === identifier.vendorId && 
        d.productId === identifier.productId
      );
    }

    if (!device) {
      throw new Error('Device not found. Make sure it has been authorized.');
    }

    return new WebHIDReader(device);
  }

  /**
   * List devices that look like graphics tablets
   */
  async listTabletDevices(): Promise<HIDDeviceInfo[]> {
    const allDevices = await this.listDevices();
    
    // Filter for digitizer devices (usage page 13 = Digitizers)
    return allDevices.filter(device => 
      device.usagePage === 13 || // Digitizer
      device.collections?.some(c => c.usagePage === 13)
    );
  }

  /**
   * Request all HID interfaces for a tablet device
   * Some tablets expose multiple HID interfaces (pen, buttons, etc.)
   */
  async requestAllInterfaces(filter?: HIDDeviceFilter): Promise<WebHIDReader[]> {
    if (!WebHIDDeviceManager.isAvailable()) {
      throw new Error('WebHID is not available in this browser');
    }

    const filters: HIDDeviceRequestOptions['filters'] = [];
    
    if (filter) {
      const f: { vendorId?: number; productId?: number } = {};
      if (filter.vendorId !== undefined) f.vendorId = filter.vendorId;
      if (filter.productId !== undefined) f.productId = filter.productId;
      if (Object.keys(f).length > 0) {
        filters.push(f);
      }
    }

    const devices = await navigator.hid.requestDevice({
      filters: filters.length > 0 ? filters : [],
    });

    return devices.map(d => new WebHIDReader(d));
  }
}

/**
 * Create a WebHID device manager
 */
export function createWebHIDManager(): WebHIDDeviceManager {
  return new WebHIDDeviceManager();
}

/**
 * Create a WebHID reader from an existing HIDDevice
 */
export function createWebHIDReader(device: HIDDevice): WebHIDReader {
  return new WebHIDReader(device);
}

