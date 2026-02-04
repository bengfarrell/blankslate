/**
 * HID Interface
 * Platform-agnostic interface for HID device communication
 * 
 * This interface abstracts the differences between WebHID (browser) and node-hid (Node.js)
 */

/**
 * Device information returned when listing devices
 */
export interface HIDDeviceInfo {
  vendorId: number;
  productId: number;
  productName: string;
  manufacturer?: string;
  serialNumber?: string;
  path?: string; // For node-hid
  usagePage?: number;
  usage?: number;
  interface?: number; // HID interface number
  collections?: Array<{ usagePage: number; usage: number }>;
}

/**
 * Filter options for device selection
 */
export interface HIDDeviceFilter {
  vendorId?: number;
  productId?: number;
  usagePage?: number;
  usage?: number;
}

/**
 * Interface type for HID interfaces
 * - 'keyboard': Keyboard HID interface (Usage Page 1, Usage 6) - used by Huion for buttons
 * - 'digitizer': Digitizer interface (Usage Page 13) - pen data
 * - 'other': Other interfaces (vendor-specific, etc.)
 */
export type HIDInterfaceType = 'keyboard' | 'digitizer' | 'other';

/**
 * Callback for incoming HID data
 * @param data - Raw HID packet data
 * @param reportId - Optional Report ID (first byte of packet)
 * @param interfaceType - Optional interface type ('keyboard', 'digitizer', 'other')
 */
export type HIDDataCallback = (data: Uint8Array, reportId?: number, interfaceType?: HIDInterfaceType) => void;

/**
 * Abstract HID reader interface
 * Implement this for each platform (WebHID, node-hid, mock)
 */
export interface IHIDReader {
  /** Whether the device is currently open */
  readonly isOpen: boolean;
  
  /** Device information */
  readonly deviceInfo: HIDDeviceInfo | null;

  /**
   * Open the HID device for reading
   */
  open(): Promise<void>;

  /**
   * Close the HID device
   */
  close(): Promise<void>;

  /**
   * Start reading from the device
   * @param callback Function to call when data is received
   * @param reportId Optional report ID to filter (only process reports matching this ID)
   */
  startReading(callback: HIDDataCallback, reportId?: number): void;

  /**
   * Stop reading from the device
   */
  stopReading(): void;
}

/**
 * Abstract HID device manager interface
 * Handles device enumeration and selection
 */
export interface IHIDDeviceManager {
  /**
   * List available HID devices matching the filter
   * @param filter Optional filter to narrow device list
   */
  listDevices(filter?: HIDDeviceFilter): Promise<HIDDeviceInfo[]>;

  /**
   * Request user to select a device (browser) or auto-select (CLI)
   * @param filter Optional filter for device selection
   */
  requestDevice(filter?: HIDDeviceFilter): Promise<IHIDReader | null>;

  /**
   * Open a specific device by path or identifiers
   * @param identifier Device path (node-hid) or device info
   */
  openDevice(identifier: string | HIDDeviceInfo): Promise<IHIDReader>;
}

/**
 * Options for creating an HID reader
 */
export interface HIDReaderOptions {
  /** Expected report ID for filtering */
  reportId?: number;
  /** Timeout for opening device (ms) */
  openTimeout?: number;
}

