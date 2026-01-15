#!/usr/bin/env node
/**
 * Node HID Reader
 * Implements IHIDReader using node-hid for Node.js environments
 */

import HID from 'node-hid';
import type { IHIDReader, IHIDDeviceManager, HIDDeviceInfo, HIDDeviceFilter, HIDDataCallback } from '../core/hid/hid-interface.js';

/**
 * Convert node-hid device to our HIDDeviceInfo format
 */
function toDeviceInfo(device: HID.Device): HIDDeviceInfo {
  return {
    vendorId: device.vendorId,
    productId: device.productId,
    productName: device.product || 'Unknown Device',
    manufacturer: device.manufacturer,
    serialNumber: device.serialNumber,
    path: device.path,
    usagePage: device.usagePage,
    usage: device.usage,
  };
}

export interface NodeHIDReaderOptions {
  /**
   * If true, attempt to open device in exclusive mode (suppresses mouse input)
   * Note: On macOS, node-hid cannot truly grab exclusive access.
   * The XP-Pen/Wacom driver will still process input as mouse movement.
   * To prevent mouse movement on macOS, disable "use as mouse" in the tablet driver settings.
   */
  exclusive?: boolean;

  /**
   * Callback invoked when device is disconnected
   */
  onDisconnect?: () => void;
}

/**
 * Node.js HID Reader implementation
 */
export class NodeHIDReader implements IHIDReader {
  private device: HID.HID | null = null;
  private _isOpen = false;
  private _deviceInfo: HIDDeviceInfo;
  private dataCallback: HIDDataCallback | null = null;
  private reportIdFilter: number | undefined;
  private devicePath: string;
  private options: NodeHIDReaderOptions;

  constructor(devicePath: string, deviceInfo: HIDDeviceInfo, options: NodeHIDReaderOptions = {}) {
    this.devicePath = devicePath;
    this._deviceInfo = deviceInfo;
    this.options = options;
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  get deviceInfo(): HIDDeviceInfo {
    return this._deviceInfo;
  }

  async open(): Promise<void> {
    if (this._isOpen) return;

    try {
      // Open with exclusive mode if requested
      // node-hid uses { nonExclusive: false } for exclusive access
      const hidOptions = this.options.exclusive 
        ? { nonExclusive: false }  // exclusive = grab device
        : { nonExclusive: true };  // non-exclusive = share device
      
      this.device = new HID.HID(this.devicePath, hidOptions);
      this._isOpen = true;
      
      if (this.options.exclusive) {
        console.log('[NodeHID] Opened device in EXCLUSIVE mode (mouse input suppressed)');
      }

      // Set up data handler
      this.device.on('data', (data: Buffer) => {
        if (this.dataCallback) {
          // Convert Buffer to Uint8Array
          const packet = new Uint8Array(data);
          
          // Report ID is typically the first byte for node-hid
          const reportId = packet[0];
          
          // Filter by report ID if specified
          if (this.reportIdFilter !== undefined && reportId !== this.reportIdFilter) {
            return;
          }

          // Pass data without the report ID (to match WebHID behavior)
          // WebHID strips the report ID from the data
          const dataWithoutReportId = packet.slice(1);
          this.dataCallback(dataWithoutReportId, reportId);
        }
      });

      this.device.on('error', (err: Error) => {
        console.error('[NodeHID] Device error:', err.message);

        // Check if this is a disconnection error
        // node-hid typically throws "could not read from HID device" when disconnected
        if (err.message.includes('could not read') ||
            err.message.includes('device disconnected') ||
            err.message.includes('LIBUSB_ERROR')) {
          this._handleDisconnect();
        }
      });

      // IMPORTANT: Resume the device to start receiving data events
      // node-hid pauses the read stream by default
      this.device.resume();

    } catch (error) {
      const err = error as Error;
      throw new Error(`Failed to open HID device: ${err.message}`);
    }
  }

  async close(): Promise<void> {
    this.stopReading();
    
    if (this.device) {
      try {
        this.device.close();
      } catch (error) {
        // Ignore close errors
      }
      this.device = null;
    }
    
    this._isOpen = false;
  }

  startReading(callback: HIDDataCallback, reportId?: number): void {
    this.dataCallback = callback;
    this.reportIdFilter = reportId;
    
    // node-hid starts reading automatically when opened
    // Data comes through the 'data' event handler set up in open()
  }

  stopReading(): void {
    this.dataCallback = null;
  }

  /**
   * Write data to the device (for output reports)
   */
  write(data: number[]): void {
    if (!this.device || !this._isOpen) {
      throw new Error('Device not open');
    }
    this.device.write(data);
  }

  /**
   * Check if the device is still physically connected
   * @returns true if device is found in the system device list
   */
  isDeviceConnected(): boolean {
    if (!this.devicePath) return false;

    try {
      const devices = HID.devices();
      return devices.some(d => d.path === this.devicePath);
    } catch {
      return false;
    }
  }

  /**
   * Handle device disconnection
   */
  private _handleDisconnect(): void {
    console.log('[NodeHID] Device disconnected');

    // Mark as closed
    this._isOpen = false;

    // Clean up device reference
    if (this.device) {
      try {
        this.device.close();
      } catch {
        // Ignore errors when closing disconnected device
      }
      this.device = null;
    }

    // Invoke disconnect callback if provided
    if (this.options.onDisconnect) {
      this.options.onDisconnect();
    }
  }

  /**
   * Send a feature report
   */
  sendFeatureReport(data: number[]): void {
    if (!this.device || !this._isOpen) {
      throw new Error('Device not open');
    }
    this.device.sendFeatureReport(data);
  }

  /**
   * Get a feature report
   */
  getFeatureReport(reportId: number, length: number): number[] {
    if (!this.device || !this._isOpen) {
      throw new Error('Device not open');
    }
    return this.device.getFeatureReport(reportId, length);
  }
}

/**
 * Multi-interface HID Reader
 * Opens and reads from all interfaces of a device simultaneously
 * Tracks which interface sends data for config generation
 */
export class MultiInterfaceReader implements IHIDReader {
  private readers: NodeHIDReader[] = [];
  private readerToInterface: Map<NodeHIDReader, HIDDeviceInfo> = new Map();
  private _isOpen = false;
  private _deviceInfo: HIDDeviceInfo;
  private dataCallback: HIDDataCallback | null = null;
  private interfaces: HIDDeviceInfo[];
  private options: NodeHIDReaderOptions;
  private disconnectHandled = false;

  // Track which interface has sent data (for config generation)
  private _activeInterface: HIDDeviceInfo | null = null;
  private _dataReceivedFrom: Set<number> = new Set(); // usagePages that sent data

  constructor(interfaces: HIDDeviceInfo[], options: NodeHIDReaderOptions = {}) {
    if (interfaces.length === 0) {
      throw new Error('At least one interface required');
    }
    this.interfaces = interfaces;

    // Wrap the onDisconnect callback to only fire once for all interfaces
    const originalOnDisconnect = options.onDisconnect;
    this.options = {
      ...options,
      onDisconnect: () => {
        if (!this.disconnectHandled) {
          this.disconnectHandled = true;
          if (originalOnDisconnect) {
            originalOnDisconnect();
          }
        }
      }
    };

    // Use the first interface's info as the primary device info
    this._deviceInfo = {
      ...interfaces[0],
      productName: `${interfaces[0].productName} (${interfaces.length} interfaces)`,
    };
  }
  
  /**
   * Get the first interface that sent data
   * Useful for primary interface selection
   */
  get activeInterface(): HIDDeviceInfo | null {
    return this._activeInterface;
  }
  
  /**
   * Get all usagePages that have sent data during this session
   * Useful for saving to config so stream-events knows which interfaces to open
   */
  get dataReceivedFromUsagePages(): number[] {
    return Array.from(this._dataReceivedFrom);
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  get deviceInfo(): HIDDeviceInfo {
    return this._deviceInfo;
  }

  async open(): Promise<void> {
    if (this._isOpen) return;

    const openedInterfaces: string[] = [];
    const failedInterfaces: string[] = [];

    for (const iface of this.interfaces) {
      if (!iface.path) continue;
      
      try {
        const reader = new NodeHIDReader(iface.path, iface, this.options);
        await reader.open();
        this.readers.push(reader);
        this.readerToInterface.set(reader, iface);
        openedInterfaces.push(`usagePage:${iface.usagePage} usage:${iface.usage}`);
      } catch (error) {
        // Some interfaces may fail to open (e.g., already in use by another interface)
        const errMsg = error instanceof Error ? error.message : String(error);
        failedInterfaces.push(`usagePage:${iface.usagePage} usage:${iface.usage} - ${errMsg}`);
      }
    }

    if (this.readers.length === 0) {
      console.log('Failed to open interfaces:');
      failedInterfaces.forEach(i => console.log(`  ✗ ${i}`));
      throw new Error('Failed to open any interfaces');
    }

    this._isOpen = true;
    
    console.log(`Opened ${this.readers.length}/${this.interfaces.length} interfaces:`);
    openedInterfaces.forEach(i => console.log(`  ✓ ${i}`));
    if (failedInterfaces.length > 0) {
      failedInterfaces.forEach(i => console.log(`  ✗ ${i} (shared or in use)`));
    }
  }

  async close(): Promise<void> {
    this.stopReading();
    
    for (const reader of this.readers) {
      try {
        await reader.close();
      } catch (error) {
        // Ignore close errors
      }
    }
    
    this.readers = [];
    this._isOpen = false;
  }

  startReading(callback: HIDDataCallback, reportId?: number): void {
    this.dataCallback = callback;
    
    // Start reading from all interfaces
    for (const reader of this.readers) {
      const iface = this.readerToInterface.get(reader);
      
      reader.startReading((data, rid) => {
        // Track which interfaces send data (for saving to config)
        if (iface && iface.usagePage !== undefined) {
          const isNew = !this._dataReceivedFrom.has(iface.usagePage);
          this._dataReceivedFrom.add(iface.usagePage);
          
          // Set first active interface and log new interfaces
          if (!this._activeInterface) {
            this._activeInterface = iface;
          }
          if (isNew) {
            console.log(`  📡 Data received from usagePage:${iface.usagePage} usage:${iface.usage}`);
          }
        }
        
        if (this.dataCallback) {
          this.dataCallback(data, rid);
        }
      }, reportId);
    }
  }

  stopReading(): void {
    for (const reader of this.readers) {
      reader.stopReading();
    }
    this.dataCallback = null;
  }

  /**
   * Check if any of the device interfaces are still physically connected
   * @returns true if at least one interface is found in the system device list
   */
  isDeviceConnected(): boolean {
    if (this.readers.length === 0) return false;

    // Check if any reader's device is still connected
    return this.readers.some(reader => reader.isDeviceConnected());
  }
}

/**
 * Node.js HID Device Manager
 */
export class NodeHIDDeviceManager implements IHIDDeviceManager {
  /**
   * List all available HID devices
   */
  async listDevices(filter?: HIDDeviceFilter): Promise<HIDDeviceInfo[]> {
    const devices = HID.devices();
    
    let filtered = devices;
    
    if (filter) {
      filtered = devices.filter(device => {
        if (filter.vendorId !== undefined && device.vendorId !== filter.vendorId) {
          return false;
        }
        if (filter.productId !== undefined && device.productId !== filter.productId) {
          return false;
        }
        if (filter.usagePage !== undefined && device.usagePage !== filter.usagePage) {
          return false;
        }
        if (filter.usage !== undefined && device.usage !== filter.usage) {
          return false;
        }
        return true;
      });
    }
    
    return filtered.map(toDeviceInfo);
  }

  /**
   * Request a device - in CLI this returns the first matching device
   * For interactive selection, use the CLI interface
   */
  async requestDevice(filter?: HIDDeviceFilter): Promise<NodeHIDReader | null> {
    const devices = await this.listDevices(filter);
    
    if (devices.length === 0) {
      return null;
    }
    
    // Return the first matching device
    return this.openDevice(devices[0]);
  }

  /**
   * Open a specific device
   */
  async openDevice(
    identifier: string | HIDDeviceInfo, 
    options: NodeHIDReaderOptions = {}
  ): Promise<NodeHIDReader> {
    let path: string;
    let deviceInfo: HIDDeviceInfo;

    if (typeof identifier === 'string') {
      // It's a path
      path = identifier;
      const devices = HID.devices().filter(d => d.path === path);
      if (devices.length === 0) {
        throw new Error(`Device not found at path: ${path}`);
      }
      deviceInfo = toDeviceInfo(devices[0]);
    } else {
      // It's a device info object
      if (!identifier.path) {
        // Find device by vendorId/productId
        const devices = HID.devices().filter(d => 
          d.vendorId === identifier.vendorId && 
          d.productId === identifier.productId
        );
        if (devices.length === 0) {
          throw new Error(`Device not found: ${identifier.vendorId}:${identifier.productId}`);
        }
        path = devices[0].path!;
      } else {
        path = identifier.path;
      }
      deviceInfo = identifier;
    }

    const reader = new NodeHIDReader(path, deviceInfo, options);
    return reader;
  }

  /**
   * List devices that look like graphics tablets
   * Filters by common digitizer usage pages
   */
  async listTabletDevices(): Promise<HIDDeviceInfo[]> {
    const allDevices = await this.listDevices();
    
    // Filter for digitizer devices (usage page 13 = Digitizers)
    // Also include common tablet vendor IDs
    const tabletVendors = [
      0x056a, // Wacom
      0x28bd, // XP-Pen
      0x256c, // Huion
      0x2179, // Parblo
      0x5543, // UC-Logic
    ];

    return allDevices.filter(device => 
      device.usagePage === 13 || // Digitizer
      (device.usagePage && device.usagePage >= 0xFF00) || // Vendor-specific (often required on macOS)
      tabletVendors.includes(device.vendorId)
    );
  }

  /**
   * Open ALL interfaces for a device by vendor/product ID
   * This is useful when you don't know which interface has the data you need
   */
  async openAllInterfaces(
    vendorId: number, 
    productId: number, 
    options: NodeHIDReaderOptions = {}
  ): Promise<MultiInterfaceReader> {
    const allDevices = await this.listDevices({ vendorId, productId });
    
    if (allDevices.length === 0) {
      throw new Error(`No device found with vendor:0x${vendorId.toString(16)} product:0x${productId.toString(16)}`);
    }

    // Group by unique paths (some entries share paths with different usages)
    const uniqueByPath = new Map<string, HIDDeviceInfo>();
    for (const device of allDevices) {
      if (device.path && !uniqueByPath.has(device.path)) {
        uniqueByPath.set(device.path, device);
      }
    }

    const interfaces = Array.from(uniqueByPath.values());
    return new MultiInterfaceReader(interfaces, options);
  }
}

/**
 * Create a Node HID device manager instance
 */
export function createNodeHIDManager(): NodeHIDDeviceManager {
  return new NodeHIDDeviceManager();
}

/**
 * Convenience function to list all HID devices
 */
export function listAllDevices(): HIDDeviceInfo[] {
  return HID.devices().map(toDeviceInfo);
}

/**
 * Format device info for display
 */
export function formatDeviceInfo(device: HIDDeviceInfo): string {
  const vendor = device.vendorId.toString(16).padStart(4, '0');
  const product = device.productId.toString(16).padStart(4, '0');
  return `${vendor}:${product} - ${device.productName} (${device.manufacturer || 'Unknown'})`;
}