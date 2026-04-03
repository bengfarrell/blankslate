/**
 * Tablet Configuration Model
 * Direct mapping to tablet configuration JSON files for HID byte data reading
 * 
 * @example
 * // Load a configuration using the static method
 * import { Config } from './models';
 * const config = await Config.load('/exampleconfigurations/xp_pen_deco_640_osx_nodriver.json');
 * 
 * // Or parse from JSON string
 * const response = await fetch('/exampleconfigurations/xp_pen_deco_640_osx_nodriver.json');
 * const jsonString = await response.text();
 * const config = Config.fromJSON(jsonString);
 * 
 * // Use with HIDReader
 * const reader = new HIDReader(device, {
 *   mappings: config.byteCodeMappings,
 *   reportId: config.reportId
 * }, (data) => {
 *   console.log('Tablet data:', data);
 * });
 * 
 * // Serialize config to JSON (instance method)
 * const jsonOutput = config.toJSON(true);
 */

/**
 * Mapping type constants for byte code mappings
 */
export class MappingType {
  static readonly CODE = 'code' as const;
  static readonly MULTI_BYTE_RANGE = 'multi-byte-range' as const;
  static readonly BIPOLAR_RANGE = 'bipolar-range' as const;
  static readonly KEYBOARD_EVENTS = 'keyboard-events' as const;
}

/**
 * Type union of all mapping types
 */
export type MappingTypeValue = typeof MappingType[keyof typeof MappingType];

/**
 * Mode-specific configuration
 */
export interface ConfigMode {
  name?: string;
  reportId: number;
  digitizerUsagePage: number;
  buttonInterfaceReportId?: number;
  stylusModeStatusByte?: number;
  excludedUsagePages?: number[];
  capabilities: {
    hasButtons: boolean;
    buttonCount: number;
    hasPressure: boolean;
    pressureLevels: number;
    hasTilt: boolean;
    resolution: {
      x: number;
      y: number;
    };
  };
  byteCodeMappings: {
    status?: {
      byteIndex: number[];
      type: typeof MappingType.CODE;
      values: Record<string, {
        state?: string;
        button?: number;
        primaryButtonPressed?: boolean;
        secondaryButtonPressed?: boolean;
        [key: string]: string | number | boolean | undefined;
      }>;
    };
    x?: {
      byteIndex: number[];
      max: number;
      type: typeof MappingType.MULTI_BYTE_RANGE;
    };
    y?: {
      byteIndex: number[];
      max: number;
      type: typeof MappingType.MULTI_BYTE_RANGE;
    };
    pressure?: {
      byteIndex: number[];
      max: number;
      type: typeof MappingType.MULTI_BYTE_RANGE;
    };
    tiltX?: {
      byteIndex: number[];
      positiveMax: number;
      negativeMin: number;
      negativeMax: number;
      type: typeof MappingType.BIPOLAR_RANGE;
    };
    tiltY?: {
      byteIndex: number[];
      positiveMax: number;
      negativeMin: number;
      negativeMax: number;
      type: typeof MappingType.BIPOLAR_RANGE;
    };
    tabletButtons?: {
      type?: typeof MappingType.KEYBOARD_EVENTS | typeof MappingType.CODE;  // Optional: defaults to CODE
      buttonCount?: number;
      byteIndex?: number[];
      keyMappings?: Record<string, {
        key: string;
        code: string;
        ctrlKey?: boolean;
        shiftKey?: boolean;
        altKey?: boolean;
        metaKey?: boolean;
      }>;
      values?: Record<string, {
        button?: number;
        [key: string]: string | number | boolean | undefined;
      }>;
      statusOverrides?: Array<{
        scanCode: number;
        statusByte: number;
        buttonNumber: number;
      }>;
    };
    [key: string]: any;
  };
}

/**
 * Type definitions for Config properties
 */
export interface ConfigData {
  // Device identification
  name: string;
  manufacturer: string;
  model: string;
  description: string;
  vendorId: string;
  productId: string;

  // Device information
  deviceInfo: {
    vendor_id: number;
    product_id: number;
    product_string: string;
    interfaces: number[];
  };

  // Multi-mode support
  modes: ConfigMode[];
}

/**
 * Main tablet configuration class
 * Handles tablet configuration with serialization/deserialization methods
 */
export class Config implements ConfigData {
  // Device identification
  name: string;
  manufacturer: string;
  model: string;
  description: string;
  vendorId: string;
  productId: string;

  // Device information
  deviceInfo: {
    vendor_id: number;
    product_id: number;
    product_string: string;
    interfaces: number[];
  };

  // Multi-mode support
  modes: ConfigMode[];

  constructor(data: ConfigData) {
    this.name = data.name;
    this.manufacturer = data.manufacturer;
    this.model = data.model;
    this.description = data.description;
    this.vendorId = data.vendorId;
    this.productId = data.productId;
    this.deviceInfo = data.deviceInfo;
    this.modes = data.modes;
  }

  /**
   * Get mode configuration for a specific Report ID
   * @param reportId The Report ID to find
   * @returns The matching mode configuration, or undefined if not found
   */
  getModeByReportId(reportId: number): ConfigMode | undefined {
    return this.modes.find(mode => mode.reportId === reportId);
  }

  /**
   * Get byteCodeMappings for a specific mode
   * @param reportId Optional Report ID to get mappings for specific mode
   * @returns The byteCodeMappings, or undefined if not found
   */
  getByteCodeMappings(reportId?: number): ConfigMode['byteCodeMappings'] | undefined {
    if (reportId !== undefined) {
      const mode = this.getModeByReportId(reportId);
      return mode?.byteCodeMappings;
    }
    // If no reportId specified, return first mode's mappings as default
    return this.modes[0]?.byteCodeMappings;
  }

  /**
   * Get capabilities for a specific mode
   * @param reportId Optional Report ID to get capabilities for specific mode
   * @returns The capabilities, or undefined if not found
   */
  getCapabilities(reportId?: number): ConfigMode['capabilities'] | undefined {
    if (reportId !== undefined) {
      const mode = this.getModeByReportId(reportId);
      return mode?.capabilities;
    }
    // If no reportId specified, return first mode's capabilities as default
    return this.modes[0]?.capabilities;
  }

  /**
   * Converts this Config instance to a JSON string
   * @param pretty Whether to pretty-print the JSON (default: false)
   * @returns JSON string representation of the config
   *
   * @example
   * const config = new Config(data);
   * const jsonString = config.toJSON(true);
   * console.log(jsonString);
   */
  toJSON(pretty: boolean = false): string {
    // Create a plain object to avoid recursion with JSON.stringify
    const data: ConfigData = {
      name: this.name,
      manufacturer: this.manufacturer,
      model: this.model,
      description: this.description,
      vendorId: this.vendorId,
      productId: this.productId,
      deviceInfo: this.deviceInfo,
      modes: this.modes,
    };
    return JSON.stringify(data, null, pretty ? 2 : 0);
  }

  /**
   * Parses a JSON string into a Config object
   * @param jsonString JSON string to parse
   * @returns Parsed Config instance
   * @throws Error if JSON is invalid or doesn't match Config structure
   *
   * @example
   * const config = Config.fromJSON(jsonString);
   */
  static fromJSON(jsonString: string): Config {
    try {
      const parsed = JSON.parse(jsonString);

      // Basic validation
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid config: must be an object');
      }

      // Validate required fields
      const requiredFields = [
        'name', 'manufacturer', 'model', 'description',
        'vendorId', 'productId', 'deviceInfo', 'modes'
      ];

      for (const field of requiredFields) {
        if (!(field in parsed)) {
          throw new Error(`Invalid config: missing required field '${field}'`);
        }
      }

      // Validate modes array
      if (!Array.isArray(parsed.modes)) {
        throw new Error('Invalid config: modes must be an array');
      }
      if (parsed.modes.length === 0) {
        throw new Error('Invalid config: modes array cannot be empty');
      }
      // Validate each mode has required fields
      for (const mode of parsed.modes) {
        if (!('reportId' in mode)) {
          throw new Error('Invalid config: each mode must have a reportId');
        }
      }

      return new Config(parsed as ConfigData);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Loads a Config from a URL
   * @param url URL to fetch the configuration from
   * @returns Promise resolving to the loaded Config instance
   * @throws Error if fetch fails or response is not valid JSON/Config
   * 
   * @example
   * const config = await Config.load('/exampleconfigurations/xp_pen_deco_640_osx_nodriver.json');
   * console.log('Loaded config:', config.name);
   */
  static async load(url: string): Promise<Config> {
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch config: ${response.status} ${response.statusText}`);
      }
      
      const jsonString = await response.text();
      return Config.fromJSON(jsonString);
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(`Network error loading config from '${url}': ${error.message}`);
      }
      throw error;
    }
  }
}