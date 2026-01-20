import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { styles } from './hid-dashboard.styles.js';
import '../tablet-visualizer/tablet-visualizer.js';
import '../bytes-display/bytes-display.js';
import '../events-display/events-display.js';
import type { ByteData, DeviceInfo } from '../bytes-display/bytes-display.js';
import type { TabletEvent, EventsDeviceInfo } from '../events-display/events-display.js';
import { Config, type ConfigData } from '../../models/config.js';
import { MockTabletDevice } from '../../mockbytes/mock-tablet-device.js';
import { processDeviceData } from '../../utils/data-helpers.js';
import '@spectrum-web-components/button/sp-button.js';
import '@spectrum-web-components/action-button/sp-action-button.js';
import '@spectrum-web-components/action-menu/sp-action-menu.js';
import '@spectrum-web-components/menu/sp-menu.js';
import '@spectrum-web-components/menu/sp-menu-item.js';
import '@spectrum-web-components/textfield/sp-textfield.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-settings.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-folder-open.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-document.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-magic-wand.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-stop.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-play.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-link.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-data.js';

/**
 * Tablet event structure received from WebSocket server
 */
interface WebSocketTabletEvent {
  type: 'tablet-data' | 'connected';
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
  config?: {
    name?: string;
    manufacturer?: string;
    model?: string;
  };
  mode?: string;
  dataFormat?: 'raw' | 'translated';
  fullConfig?: ConfigData;
}

interface TabletDataEvent {
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

interface MockDataOption {
  id: string;
  label: string;
  action: (device: MockTabletDevice) => void;
}

/**
 * Default byte mappings matching the mock device's raw output format
 * Used when no config is loaded to enable raw->event translation
 * 
 * Mock device packet format (9 bytes for stylus, 11 bytes for buttons):
 * - Byte 0: Status (0xa0=hover, 0xa1=contact, 0xf0=buttons, etc.)
 * - Bytes 1-2: X coordinate (little-endian)
 * - Bytes 3-4: Y coordinate (little-endian)
 * - Bytes 5-6: Pressure (little-endian)
 * - Byte 7: Tilt X (0-255, 128=center)
 * - Byte 8: Tilt Y (0-255, 128=center)
 */
const DEFAULT_MOCK_BYTE_MAPPINGS = {
  status: {
    byteIndex: [0],
    type: 'code',
    values: {
      '192': { state: 'none' },           // 0xC0 - pen out of range
      '160': { state: 'hover' },          // 0xA0 - hovering
      '161': { state: 'contact' },        // 0xA1 - drawing
      '162': { state: 'secondary-hover', secondaryButtonPressed: true },   // 0xA2
      '163': { state: 'secondary-contact', secondaryButtonPressed: true }, // 0xA3
      '164': { state: 'primary-hover', primaryButtonPressed: true },       // 0xA4
      '165': { state: 'primary-contact', primaryButtonPressed: true },     // 0xA5
      '240': { state: 'buttons' },        // 0xF0 - tablet buttons
    },
  },
  x: {
    byteIndex: [1, 2],
    type: 'multi-byte-range',
    min: 0,
    max: 65535,
  },
  y: {
    byteIndex: [3, 4],
    type: 'multi-byte-range',
    min: 0,
    max: 65535,
  },
  pressure: {
    byteIndex: [5, 6],
    type: 'multi-byte-range',
    min: 0,
    max: 8191,
  },
  tiltX: {
    byteIndex: [7],
    type: 'bipolar-range',
    positiveMin: 128,
    positiveMax: 255,
    negativeMin: 0,
    negativeMax: 127,
  },
  tiltY: {
    byteIndex: [8],
    type: 'bipolar-range',
    positiveMin: 128,
    positiveMax: 255,
    negativeMin: 0,
    negativeMax: 127,
  },
  tabletButtons: {
    byteIndex: [1],
    type: 'bit-flags',
    buttonCount: 8,
  },
};

/**
 * Dashboard component for visualizing tablet data
 * Unified dashboard that supports WebHID, WebSocket, and Mock data simultaneously
 */
@customElement('hid-dashboard')
export class HidDashboard extends LitElement {
  static styles = styles;

  @property({ type: Object })
  config: Config | null = null;

  // WebHID state
  @state()
  private hidConnected = false;

  @state()
  private hidDeviceName = '';

  // WebSocket state
  @state()
  private websocketConnected = false;

  @state()
  private websocketUrl = 'ws://localhost:8765';

  @state()
  private websocketServerInfo = '';

  @state()
  private websocketDataMode: 'raw' | 'translated' = 'translated';

  // Mock data state
  @state()
  private isSimulating = false;

  @state()
  private currentSimulation = '';

  @state()
  private simulationDataMode: 'raw' | 'translated' = 'translated';

  // Shared visualization state
  @state()
  private tabletData = {
    x: 0,
    y: 0,
    pressure: 0,
    tiltX: 0,
    tiltY: 0,
    tiltXY: 0,
    primaryButtonPressed: false,
    secondaryButtonPressed: false
  };

  @state()
  private pressedButtons: Set<number> = new Set();

  @state()
  private rawBytes: ByteData[] = [];

  @state()
  private tabletEvents: TabletEvent[] = [];

  @state()
  private packetCount = 0;

  // Active data source tracking
  @state()
  private activeSource: 'none' | 'webhid' | 'websocket' | 'mock' = 'none';

  // Track which display is showing translated (non-native) data
  @state()
  private isRawBytesTranslated = false;

  @state()
  private isEventsTranslated = false;

  private hidDevice: HIDDevice | null = null;
  private mockDevice: MockTabletDevice | null = null;
  private websocket: WebSocket | null = null;

  private readonly mockDataOptions: MockDataOption[] = [
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

  connectedCallback() {
    super.connectedCallback();
    // Initialize mock device so it's ready for simulations
    this._initMockDevice();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._disconnectHid();
    this._disconnectWebSocket();
    this._stopSimulation();
  }



  private async _loadSampleConfig() {
    try {
      const response = await fetch('/configs/sample.json');
      if (!response.ok) {
        throw new Error('Failed to fetch sample configuration');
      }
      const text = await response.text();
      const config = Config.fromJSON(text);
      this.config = config;

      // Dispatch event to notify parent
      this.dispatchEvent(new CustomEvent('config-loaded', {
        detail: { config },
        bubbles: true,
        composed: true
      }));

      // Reinitialize mock device with config
      this.mockDevice = null;
      this._initMockDevice();
    } catch (err) {
      console.error('Failed to load sample config:', err);
    }
  }

  private _handleLoadLocalConfig() {
    // Create a file input element
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const config = Config.fromJSON(text);
        this.config = config;

        // Dispatch event to notify parent
        this.dispatchEvent(new CustomEvent('config-loaded', {
          detail: { config },
          bubbles: true,
          composed: true
        }));
      } catch (err) {
        console.error('Failed to load config:', err);
        alert('Failed to load configuration file. Please check the file format.');
      }
    };

    input.click();
  }

  private _handleGoToGenerator() {
    // Dispatch event to navigate to generator
    this.dispatchEvent(new CustomEvent('go-to-generator', {
      bubbles: true,
      composed: true
    }));
  }



  private _initMockDevice() {
    if (this.mockDevice) return;

    // Create mock device with config matching the loaded config
    const maxX = this.config?.byteCodeMappings.x?.max ?? 65535;
    const maxY = this.config?.byteCodeMappings.y?.max ?? 65535;

    this.mockDevice = new MockTabletDevice({
      maxX,
      maxY,
      deviceName: 'Mock ' + (this.config?.name || 'Tablet'),
      translateEvents: this.simulationDataMode === 'translated',
      byteCodeMappings: this.config?.byteCodeMappings,
    });

    // Listen for raw bytes
    this.mockDevice.addEventListener('inputreport', (data: Uint8Array) => {
      this._processMockData(data);
    });

    // Listen for translated events (if in translated mode)
    this.mockDevice.addEventListener('tablet-event', (data: Uint8Array) => {
      this._processTranslatedData(data, 'mock');
    });
  }

  private _processMockData(data: Uint8Array) {
    // Track that mock is the active source
    this.activeSource = 'mock';

    // Raw bytes are always native from mock device
    this.isRawBytesTranslated = false;
    this._updateRawBytes(data, 'mock');

    // In translated mode, the mock device will emit tablet-event separately
    // Events will be native, we still show raw bytes (also native since mock generates both)
    if (this.simulationDataMode === 'translated') {
      // Events will come from _processTranslatedData, raw bytes are still native
      return;
    }

    // In raw mode, we translate raw bytes to events
    this.isEventsTranslated = true;
    
    // Process through config mappings (or default mock mappings) to get events
    const mappings = this.config?.byteCodeMappings ?? DEFAULT_MOCK_BYTE_MAPPINGS;
    const processed = processDeviceData(data, mappings, -1);
    this._handleTabletData(processed as TabletDataEvent, 'mock', true);
  }

  private _processTranslatedData(data: Uint8Array, source: 'mock' | 'websocket') {
    // Decode JSON from Uint8Array
    const jsonStr = new TextDecoder().decode(data);
    const translated = JSON.parse(jsonStr);

    // Events are native when receiving translated data
    this.isEventsTranslated = false;
    
    // For mock in translated mode, raw bytes are also available (mock generates both)
    // For websocket in translated mode, we need to synthesize raw bytes
    if (source === 'websocket') {
      this.isRawBytesTranslated = true;
      this._synthesizeRawBytes(translated as TabletDataEvent);
    }

    // Update tablet data directly from translated events
    this._handleTabletData(translated as TabletDataEvent, source, false);
  }

  private _updateRawBytes(data: Uint8Array, source: 'webhid' | 'websocket' | 'mock') {
    this.packetCount++;
    this.activeSource = source;
    
    // Convert raw bytes to ByteData format with labels from config
    this.rawBytes = Array.from(data).map((value, index) => {
      const byteData: ByteData = {
        byteIndex: index,
        value: value,
      };
      
      // Try to find a label for this byte from config mappings
      if (this.config && this.config.byteCodeMappings) {
        const mappings = this.config.byteCodeMappings;
        for (const [key, mapping] of Object.entries(mappings)) {
          if (mapping && 'byteIndex' in mapping) {
            const byteIndices = mapping.byteIndex as number[];
            if (byteIndices.includes(index)) {
              byteData.label = key;
              byteData.isIdentified = true;
              break;
            }
          }
        }
      }
      
      return byteData;
    });
  }

  /**
   * Synthesize raw bytes from translated event data
   * Used when receiving translated events without raw bytes (e.g., WebSocket translated mode)
   */
  private _synthesizeRawBytes(data: TabletDataEvent) {
    // Create synthetic bytes based on normalized values
    // This is an approximation - we create a simple 12-byte packet
    const x = Math.round((data.x ?? 0) * 65535);
    const y = Math.round((data.y ?? 0) * 65535);
    const pressure = Math.round((data.pressure ?? 0) * 8191);
    const tiltX = Math.round(((data.tiltX ?? 0) + 1) * 127.5); // -1 to 1 -> 0 to 255
    const tiltY = Math.round(((data.tiltY ?? 0) + 1) * 127.5);
    
    // Build a synthetic byte array
    const bytes = new Uint8Array([
      0x02, // Report ID placeholder
      (data.primaryButtonPressed ? 0x01 : 0x00) | (data.secondaryButtonPressed ? 0x02 : 0x00), // Button state
      x & 0xFF, (x >> 8) & 0xFF, // X low, X high
      y & 0xFF, (y >> 8) & 0xFF, // Y low, Y high
      pressure & 0xFF, (pressure >> 8) & 0xFF, // Pressure low, Pressure high
      tiltX & 0xFF, // Tilt X
      tiltY & 0xFF, // Tilt Y
      data.button ?? 0, // Tablet buttons
      0x00 // Padding
    ]);

    // Convert to ByteData format with synthetic labels
    this.rawBytes = Array.from(bytes).map((value, index) => {
      const labels = ['reportId', 'buttons', 'xLow', 'xHigh', 'yLow', 'yHigh', 'pressLow', 'pressHigh', 'tiltX', 'tiltY', 'tabletBtn', 'pad'];
      return {
        byteIndex: index,
        value: value,
        label: labels[index] || undefined,
        isIdentified: index < labels.length
      } as ByteData;
    });
  }

  private _runSimulation(option: MockDataOption) {
    this._initMockDevice();
    if (!this.mockDevice) return;

    // Stop any current simulation
    this._stopSimulation();

    this.isSimulating = true;
    this.currentSimulation = option.label;
    this.activeSource = 'mock';

    // Run the simulation
    option.action(this.mockDevice);

    // Watch for simulation end
    const checkInterval = setInterval(() => {
      if (this.mockDevice && !this.mockDevice.playing) {
        this.isSimulating = false;
        this.currentSimulation = '';
        clearInterval(checkInterval);
      }
    }, 100);
  }

  private _stopSimulation() {
    if (this.mockDevice) {
      this.mockDevice.stop();
    }
    this.isSimulating = false;
    this.currentSimulation = '';
    // Only reset if mock was the active source
    if (this.activeSource === 'mock') {
      this.rawBytes = [];
      this.packetCount = 0;
    }
  }

  private _setSimulationDataMode(mode: 'raw' | 'translated') {
    if (this.simulationDataMode === mode) return;
    
    this.simulationDataMode = mode;
    
    // Reinitialize mock device with new mode
    if (this.mockDevice) {
      this._stopSimulation();
      this.mockDevice = null;
      this._initMockDevice();
    }
  }

  private async _handleConnectHid() {
    if (!this.config) {
      console.error('No config loaded');
      return;
    }

    console.log('[Dashboard] Connecting WebHID with config:', {
      vendorId: this.config.deviceInfo.vendor_id,
      productId: this.config.deviceInfo.product_id,
      usagePage: this.config.deviceInfo.usage_page
    });

    try {
      // Request HID device access
      const requestedDevices = await navigator.hid.requestDevice({
        filters: [{
          vendorId: this.config.deviceInfo.vendor_id,
          productId: this.config.deviceInfo.product_id
        }]
      });

      if (requestedDevices.length === 0) {
        console.log('No device selected');
        return;
      }

      console.log('[Dashboard] Requested devices:', requestedDevices.length);

      // IMPORTANT: Get ALL authorized devices (like the walkthrough does)
      // The requestDevice picker authorizes access, but we need to get ALL interfaces
      const allDevices = await navigator.hid.getDevices();
      console.log('[Dashboard] All authorized devices:', allDevices.length);

      // Filter to just devices from this tablet (same vendor/product)
      const tabletDevices = allDevices.filter(d =>
        d.vendorId === this.config!.deviceInfo.vendor_id &&
        d.productId === this.config!.deviceInfo.product_id
      );

      console.log('[Dashboard] Tablet devices found:', tabletDevices.length);
      tabletDevices.forEach((d, i) => {
        const collections = d.collections.map(c => ({
          usagePage: c.usagePage,
          usage: c.usage,
          usagePageHex: c.usagePage ? '0x' + c.usagePage.toString(16) : 'undefined',
          usageHex: c.usage ? '0x' + c.usage.toString(16) : 'undefined'
        }));
        console.log(`[Dashboard] Device ${i}:`, {
          productName: d.productName,
          collections
        });
      });

      // Find the interface matching the config's usage_page
      // This is where the actual pen data comes from (may be vendor-specific like 65290/0xFF0A)
      const configUsagePage = this.config.deviceInfo.usage_page;

      const configuredDevice = tabletDevices.find(d =>
        d.collections.some(c => c.usagePage === configUsagePage)
      );

      // Fallback to digitizer (13) or first device if config's usage_page not found
      const digitizerDevice = tabletDevices.find(d =>
        d.collections.some(c => c.usagePage === 13)
      );
      const primaryDevice = configuredDevice || digitizerDevice || tabletDevices[0];

      if (!primaryDevice) {
        console.error('[Dashboard] No suitable device interface found');
        return;
      }

      const selectedCollections = primaryDevice.collections.map(c => ({
        usagePage: c.usagePage,
        usage: c.usage,
        usagePageHex: c.usagePage ? '0x' + c.usagePage.toString(16) : 'undefined',
        usageHex: c.usage ? '0x' + c.usage.toString(16) : 'undefined'
      }));
      console.log('[Dashboard] Selected device:', {
        productName: primaryDevice.productName,
        collections: selectedCollections,
        opened: primaryDevice.opened
      });

      this.hidDevice = primaryDevice;
      this.hidDeviceName = primaryDevice.productName || this.config.name;
      this.hidConnected = true;

      // Only open and listen to the interface specified in the config
      if (!primaryDevice.opened) {
        await primaryDevice.open();
      }

      // Set up event listener on the config-specified interface
      primaryDevice.addEventListener('inputreport', (event: HIDInputReportEvent) => {
        const dv = event.data;
        const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);

        console.log('[Dashboard] Raw bytes received:', Array.from(bytes));

        // Raw bytes are native from WebHID
        this.isRawBytesTranslated = false;
        this._updateRawBytes(bytes, 'webhid');

        // Process through config mappings using shared processDeviceData
        // Events are translated from raw bytes
        // Use offset -1 for WebHID since browser API strips report ID from packets
        const processed = processDeviceData(bytes, this.config!.byteCodeMappings, -1);
        console.log('[Dashboard] Processed data:', processed);
        this._handleTabletData(processed as TabletDataEvent, 'webhid', true);
      });

    } catch (error) {
      console.error('Failed to connect:', error);
      this.hidConnected = false;
    }
  }

  private _handleTabletData(data: TabletDataEvent, source: 'webhid' | 'websocket' | 'mock', isEventTranslated = false) {
    // Track active source
    this.activeSource = source;

    // Data from processDeviceData is already normalized to 0-1 range
    // x, y, pressure are already 0-1
    // tiltX, tiltY are already -1 to 1 (from bipolar range)
    const normalizedX = typeof data.x === 'number' ? data.x : 0;
    const normalizedY = typeof data.y === 'number' ? data.y : 0;
    const normalizedPressure = typeof data.pressure === 'number' ? data.pressure : 0;

    // Tilt values from bipolar range are already -1 to 1
    const tiltX = typeof data.tiltX === 'number' ? data.tiltX : 0;
    const tiltY = typeof data.tiltY === 'number' ? data.tiltY : 0;
    const tiltXY = Math.sqrt(tiltX * tiltX + tiltY * tiltY) * Math.sign(tiltX * tiltY || 1);

    this.tabletData = {
      x: normalizedX,
      y: normalizedY,
      pressure: normalizedPressure,
      tiltX: tiltX,
      tiltY: tiltY,
      tiltXY: Math.min(1, Math.max(-1, tiltXY)),
      primaryButtonPressed: data.primaryButtonPressed ?? false,
      secondaryButtonPressed: data.secondaryButtonPressed ?? false
    };

    // Handle tablet buttons - track which button is currently pressed
    if (data.button !== undefined) {
      if (data.button > 0) {
        // Button pressed - show it
        this.pressedButtons = new Set([data.button]);
      } else {
        // No button pressed - clear all
        this.pressedButtons = new Set();
      }
    }

    // Always store events for display (track if they're translated)
    this.isEventsTranslated = isEventTranslated;
    
    // Handle tablet buttons - can come as individual booleans or as a single number
    const buttonNum = data.button;
    const event: TabletEvent = {
      timestamp: Date.now(),
      x: normalizedX,
      y: normalizedY,
      pressure: normalizedPressure,
      tiltX: tiltX,
      tiltY: tiltY,
      tiltXY: this.tabletData.tiltXY,
      primaryButtonPressed: data.primaryButtonPressed,
      secondaryButtonPressed: data.secondaryButtonPressed,
      button1: data.button1 ?? (buttonNum === 1),
      button2: data.button2 ?? (buttonNum === 2),
      button3: data.button3 ?? (buttonNum === 3),
      button4: data.button4 ?? (buttonNum === 4),
      button5: data.button5 ?? (buttonNum === 5),
      button6: data.button6 ?? (buttonNum === 6),
      button7: data.button7 ?? (buttonNum === 7),
      button8: data.button8 ?? (buttonNum === 8),
      state: data.state
    };
    this.tabletEvents = [...this.tabletEvents, event];
    // Keep only last 50 events
    if (this.tabletEvents.length > 50) {
      this.tabletEvents = this.tabletEvents.slice(-50);
    }
  }

  private _disconnectHid() {
    if (this.hidDevice) {
      this.hidDevice.close();
      this.hidDevice = null;
    }
    this.hidConnected = false;
    this.hidDeviceName = '';
    // Only reset data if WebHID was the active source
    if (this.activeSource === 'webhid') {
      this._resetTabletData();
    }
  }

  // ================== WebSocket Connection Methods ==================

  private _handleWebSocketUrlChange(e: Event) {
    const input = e.target as HTMLInputElement;
    this.websocketUrl = input.value;
  }

  private _connectWebSocket() {
    if (this.websocketConnected || !this.websocketUrl) return;

    try {
      this.websocket = new WebSocket(this.websocketUrl);
      // Set binary type to arraybuffer for raw bytes
      this.websocket.binaryType = 'arraybuffer';

      this.websocket.onopen = () => {
        console.log('[Dashboard] WebSocket connected');
        this.websocketConnected = true;
      };

      this.websocket.onmessage = (event) => {
        // Try to parse as JSON first (translated events)
        if (typeof event.data === 'string') {
          try {
            const data = JSON.parse(event.data) as WebSocketTabletEvent;
            this._handleWebSocketMessage(data);
          } catch (error) {
            console.error('[Dashboard] Failed to parse WebSocket message:', error);
          }
        } else if (event.data instanceof Blob) {
          // Handle binary data (raw bytes)
          event.data.arrayBuffer().then((buffer) => {
            const bytes = new Uint8Array(buffer);
            this._handleWebSocketRawBytes(bytes);
          });
        } else if (event.data instanceof ArrayBuffer) {
          // Handle ArrayBuffer directly
          const bytes = new Uint8Array(event.data);
          this._handleWebSocketRawBytes(bytes);
        }
      };

      this.websocket.onclose = () => {
        console.log('[Dashboard] WebSocket disconnected');
        this.websocketConnected = false;
        this.websocketServerInfo = '';
        this.websocket = null;
      };

      this.websocket.onerror = (error) => {
        console.error('[Dashboard] WebSocket error:', error);
        this.websocketConnected = false;
        this.websocket = null;
      };

    } catch (error) {
      console.error('[Dashboard] Failed to connect WebSocket:', error);
    }
  }

  private _disconnectWebSocket() {
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
    this.websocketConnected = false;
    this.websocketServerInfo = '';
    // Only reset data if websocket was the active source
    if (this.activeSource === 'websocket') {
      this._resetTabletData();
    }
  }

  private _handleWebSocketMessage(data: WebSocketTabletEvent) {
    if (data.type === 'connected') {
      // Initial connection message from server
      this.websocketServerInfo = data.config?.name || 'WebSocket Server';

      // Detect data format from server
      if (data.dataFormat) {
        this.websocketDataMode = data.dataFormat;
        console.log('[Dashboard] Connected to:', this.websocketServerInfo, 'Mode:', data.mode, 'Format:', data.dataFormat);

        // If raw mode, load the config from server
        if (data.dataFormat === 'raw' && data.fullConfig) {
          this.config = new Config(data.fullConfig);
          console.log('[Dashboard] Loaded config from server:', this.config.name);
        }
      } else {
        console.log('[Dashboard] Connected to:', this.websocketServerInfo, 'Mode:', data.mode);
      }
      return;
    }

    if (data.type === 'tablet-data') {
      this.packetCount++;
      this.activeSource = 'websocket';

      // Events are native in translated WebSocket mode
      this.isEventsTranslated = false;
      // Raw bytes are synthesized (translated) in this mode
      this.isRawBytesTranslated = true;

      // Synthesize raw bytes from the translated event
      this._synthesizeRawBytes(data as unknown as TabletDataEvent);

      // Update tablet data from WebSocket event
      this.tabletData = {
        x: data.x ?? 0,
        y: data.y ?? 0,
        pressure: data.pressure ?? 0,
        tiltX: data.tiltX ?? 0,
        tiltY: data.tiltY ?? 0,
        tiltXY: data.tiltXY ?? 0,
        primaryButtonPressed: data.primaryButtonPressed ?? false,
        secondaryButtonPressed: data.secondaryButtonPressed ?? false
      };

      // Handle tablet buttons
      if (data.tabletButtons !== undefined && data.tabletButtons > 0) {
        this.pressedButtons = new Set([data.tabletButtons]);
      } else {
        // Check individual button flags
        const pressed = new Set<number>();
        for (let i = 1; i <= 8; i++) {
          const key = `button${i}` as keyof WebSocketTabletEvent;
          if (data[key]) {
            pressed.add(i);
          }
        }
        this.pressedButtons = pressed;
      }

      // Add to event stream
      const event: TabletEvent = {
        timestamp: data.timestamp ?? Date.now(),
        x: data.x,
        y: data.y,
        pressure: data.pressure,
        tiltX: data.tiltX,
        tiltY: data.tiltY,
        tiltXY: data.tiltXY,
        primaryButtonPressed: data.primaryButtonPressed,
        secondaryButtonPressed: data.secondaryButtonPressed,
        button1: data.button1,
        button2: data.button2,
        button3: data.button3,
        button4: data.button4,
        button5: data.button5,
        button6: data.button6,
        button7: data.button7,
        button8: data.button8,
        state: data.state
      };
      this.tabletEvents = [...this.tabletEvents, event];
      // Keep only last 50 events
      if (this.tabletEvents.length > 50) {
        this.tabletEvents = this.tabletEvents.slice(-50);
      }
    }
  }

  private _handleWebSocketRawBytes(bytes: Uint8Array) {
    // Auto-detect that we're receiving raw bytes
    if (this.websocketDataMode !== 'raw') {
      this.websocketDataMode = 'raw';
    }

    // Raw bytes are native in raw WebSocket mode
    this.isRawBytesTranslated = false;
    // Events will be translated from raw bytes
    this.isEventsTranslated = true;

    // Update raw bytes display (this also increments packetCount)
    this._updateRawBytes(bytes, 'websocket');

    // Process through config mappings to update visualizers
    // Use offset -1 for WebHID since browser API strips report ID from packets
    if (this.config) {
      const processed = processDeviceData(bytes, this.config.byteCodeMappings, -1);
      this._handleTabletData(processed as TabletDataEvent, 'websocket', true);
    }
  }

  private _resetTabletData() {
    this.tabletData = {
      x: 0,
      y: 0,
      pressure: 0,
      tiltX: 0,
      tiltY: 0,
      tiltXY: 0,
      primaryButtonPressed: false,
      secondaryButtonPressed: false
    };
    this.pressedButtons = new Set();
    this.rawBytes = [];
    this.packetCount = 0;
  }

  private _formatValue(value: number, decimals: number = 2): string {
    return value.toFixed(decimals);
  }

  render() {
    const configName = this.config?.name || 'No Config Loaded';
    const hasActiveConnection = this.hidConnected || this.websocketConnected || this.isSimulating;

    return html`
      <div class="dashboard">
        <div class="dashboard-header">
          <div class="header-info">
            <h1>BlankSlate Event Viewer</h1>
            <span class="config-name">${configName}</span>
          </div>

          <div class="header-controls">
            <!-- Config Menu -->
            <sp-action-menu
              label="Config menu"
              data-spectrum-pattern="action-menu"
              placement="bottom-start"
              @change=${(e: Event) => {
                const menu = e.target as any;
                const selectedItem = menu.selectedItem;
                if (selectedItem) {
                  const action = selectedItem.value;
                  if (action === 'load-file') {
                    this._handleLoadLocalConfig();
                  } else if (action === 'load-sample') {
                    this._loadSampleConfig();
                  } else if (action === 'generate') {
                    this._handleGoToGenerator();
                  }
                }
              }}>
              <sp-icon-settings slot="icon"></sp-icon-settings>
              <span slot="label">Config</span>
              <sp-menu data-spectrum-pattern="menu" style="min-width: 200px;">
                <sp-menu-item value="load-file" data-spectrum-pattern="menu-item">
                  <sp-icon-folder-open slot="icon"></sp-icon-folder-open>
                  Load from File
                </sp-menu-item>
                <sp-menu-item value="load-sample" data-spectrum-pattern="menu-item">
                  <sp-icon-document slot="icon"></sp-icon-document>
                  Load Sample Config
                </sp-menu-item>
                <sp-menu-item value="generate" data-spectrum-pattern="menu-item">
                  <sp-icon-magic-wand slot="icon"></sp-icon-magic-wand>
                  Generate New Config
                </sp-menu-item>
              </sp-menu>
            </sp-action-menu>
          </div>
        </div>

        <!-- Connection Controls Bar -->
        <div class="connection-bar">
          <!-- WebHID Connection -->
          <div class="connection-section">
            <div class="connection-label">WebHID</div>
            ${this.hidConnected ? html`
              <div class="connection-group">
                <div class="status-badge connected">
                  <span class="status-dot"></span>
                  ${this.hidDeviceName}
                </div>
                <sp-button
                  variant="negative"
                  size="s"
                  data-spectrum-pattern="button-negative"
                  @click=${this._disconnectHid}>
                  Disconnect
                </sp-button>
              </div>
            ` : html`
              <sp-button
                variant="accent"
                size="s"
                data-spectrum-pattern=${!this.config ? 'button-disabled' : 'button-accent'}
                @click=${this._handleConnectHid}
                ?disabled=${!this.config}
                title=${!this.config ? 'Load a config first' : 'Connect to tablet via WebHID'}>
                <sp-icon-link slot="icon"></sp-icon-link>
                Connect WebHID
              </sp-button>
            `}
          </div>

          <!-- WebSocket Connection -->
          <div class="connection-section">
            <div class="connection-label">WebSocket</div>
            ${this.websocketConnected ? html`
              <div class="connection-group">
                <div class="status-badge connected">
                  <span class="status-dot"></span>
                  ${this.websocketServerInfo || this.websocketUrl}
                </div>
                <sp-button
                  variant="negative"
                  size="s"
                  data-spectrum-pattern="button-negative"
                  @click=${this._disconnectWebSocket}>
                  Disconnect
                </sp-button>
              </div>
            ` : html`
              <div class="websocket-controls-inline">
                <sp-textfield
                  class="websocket-url-input"
                  data-spectrum-pattern="textfield"
                  size="s"
                  .value=${this.websocketUrl}
                  @input=${this._handleWebSocketUrlChange}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === 'Enter') this._connectWebSocket();
                  }}
                  placeholder="ws://localhost:8765">
                </sp-textfield>
                <sp-button
                  variant="secondary"
                  size="s"
                  data-spectrum-pattern="button-secondary"
                  @click=${this._connectWebSocket}>
                  <sp-icon-data slot="icon"></sp-icon-data>
                  Connect
                </sp-button>
              </div>
            `}
          </div>

          <!-- Mock Data -->
          <div class="connection-section">
            <div class="connection-label">Mock Data</div>
            <div class="mock-controls">
              <div class="data-mode-toggle" data-spectrum-pattern="button-group">
                <button 
                  class="mode-btn ${this.simulationDataMode === 'raw' ? 'active' : ''}"
                  data-spectrum-pattern="toggle-button"
                  @click=${() => this._setSimulationDataMode('raw')}
                  title="Simulate raw byte input">
                  Raw
                </button>
                <button 
                  class="mode-btn ${this.simulationDataMode === 'translated' ? 'active' : ''}"
                  data-spectrum-pattern="toggle-button"
                  @click=${() => this._setSimulationDataMode('translated')}
                  title="Simulate translated event input">
                  Events
                </button>
              </div>
              ${this.isSimulating ? html`
                <sp-button
                  variant="negative"
                  size="s"
                  data-spectrum-pattern="button-negative"
                  @click=${this._stopSimulation}>
                  <sp-icon-stop slot="icon"></sp-icon-stop>
                  Stop ${this.currentSimulation}
                </sp-button>
              ` : html`
                <sp-action-menu
                  label="Simulate menu"
                  data-spectrum-pattern="action-menu"
                  placement="bottom-start"
                  size="s"
                  @change=${(e: Event) => {
                    const menu = e.target as any;
                    const selectedItem = menu.selectedItem;
                    if (selectedItem) {
                      const optionLabel = selectedItem.value;
                      const option = this.mockDataOptions.find(o => o.label === optionLabel);
                      if (option) {
                        this._runSimulation(option);
                      }
                    }
                  }}>
                  <sp-icon-play slot="icon"></sp-icon-play>
                  <span slot="label">Simulate</span>
                  <sp-menu data-spectrum-pattern="menu" style="min-width: 200px;">
                    ${this.mockDataOptions.map(option => html`
                      <sp-menu-item value="${option.label}" data-spectrum-pattern="menu-item">
                        ${option.label}
                      </sp-menu-item>
                    `)}
                  </sp-menu>
                </sp-action-menu>
              `}
            </div>
          </div>
        </div>

        <div class="visualizers-grid">
          <!-- Coordinates Panel -->
          <div class="visualizer-card compact">
            <div class="visualizer-wrapper">
              <tablet-visualizer
                mode="tablet"
                .socketMode=${hasActiveConnection}
                .tabletConnected=${hasActiveConnection}
                .externalTabletData=${this.tabletData}
                .externalPressedButtons=${this.pressedButtons}
                .stringCount=${0}>
              </tablet-visualizer>
            </div>

            <div class="data-values compact">
              <div class="data-item">
                <span class="data-label">X</span>
                <span class="data-value ${this.tabletData.x === 0 ? 'zero' : ''}">
                  ${this._formatValue(this.tabletData.x)}
                </span>
              </div>
              <div class="data-item">
                <span class="data-label">Y</span>
                <span class="data-value ${this.tabletData.y === 0 ? 'zero' : ''}">
                  ${this._formatValue(this.tabletData.y)}
                </span>
              </div>
            </div>
          </div>

          <!-- Pressure & Tilt Panel -->
          <div class="visualizer-card compact">
            <div class="visualizer-wrapper">
              <tablet-visualizer
                mode="tilt"
                .socketMode=${hasActiveConnection}
                .tabletConnected=${hasActiveConnection}
                .externalTabletData=${this.tabletData}
                .externalPressedButtons=${this.pressedButtons}
                .stringCount=${0}>
              </tablet-visualizer>
            </div>

            <div class="data-values compact">
              <div class="data-item">
                <span class="data-label">Pressure</span>
                <span class="data-value ${this.tabletData.pressure === 0 ? 'zero' : ''}">
                  ${this._formatValue(this.tabletData.pressure)}
                </span>
              </div>
              <div class="data-item">
                <span class="data-label">Tilt X</span>
                <span class="data-value ${this.tabletData.tiltX === 0 ? 'zero' : ''}">
                  ${this._formatValue(this.tabletData.tiltX)}
                </span>
              </div>
              <div class="data-item">
                <span class="data-label">Tilt Y</span>
                <span class="data-value ${this.tabletData.tiltY === 0 ? 'zero' : ''}">
                  ${this._formatValue(this.tabletData.tiltY)}
                </span>
              </div>
            </div>
          </div>

          <!-- Event Stream Panel (completes top row) -->
          <div class="visualizer-card events-panel">
            <events-display
              .events=${this.tabletEvents}
              .isEmpty=${this.tabletEvents.length === 0}
              .deviceInfo=${{
                packetCount: this.packetCount,
                isMock: this.activeSource === 'mock',
                isTranslated: this.isEventsTranslated
              } as EventsDeviceInfo}>
            </events-display>
          </div>

          <!-- Raw Bytes Panel (full width row) -->
          <div class="visualizer-card bytes-panel">
            <bytes-display
              .bytes=${this.rawBytes}
              .isEmpty=${this.rawBytes.length === 0}
              .placeholderCount=${10}
              .deviceInfo=${{
                isMock: this.activeSource === 'mock',
                packetCount: this.packetCount,
                usagePage: this.config?.deviceInfo?.usage_page,
                usage: this.config?.deviceInfo?.usage
              } as DeviceInfo}>
            </bytes-display>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hid-dashboard': HidDashboard;
  }
}