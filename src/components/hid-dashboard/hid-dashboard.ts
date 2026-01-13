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

export type ViewerMode = 'webhid' | 'mock-raw' | 'mock-translated' | 'websocket';

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
  icon: string;
  action: (device: MockTabletDevice) => void;
}

/**
 * Dashboard component for visualizing tablet data
 * Displays various visualizers including tablet position, pressure, and tilt
 */
@customElement('hid-dashboard')
export class HidDashboard extends LitElement {
  static styles = styles;

  @property({ type: Object })
  config: Config | null = null;

  @property({ type: String })
  viewerMode: ViewerMode | null = null;

  @state()
  private deviceConnected = false;

  @state()
  private deviceName = '';

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

  @state()
  private isSimulating = false;

  @state()
  private showSimulationMenu = false;

  @state()
  private currentSimulation = '';

  @state()
  private websocketConnected = false;

  @state()
  private websocketUrl = 'ws://localhost:8765';

  @state()
  private showWebSocketInput = false;

  @state()
  private websocketServerInfo = '';

  @state()
  private simulationDataMode: 'raw' | 'translated' = 'raw';

  @state()
  private websocketDataMode: 'raw' | 'translated' = 'translated';

  private hidDevice: HIDDevice | null = null;
  private mockDevice: MockTabletDevice | null = null;
  private websocket: WebSocket | null = null;

  private readonly mockDataOptions: MockDataOption[] = [
    { id: 'circle', label: 'Draw Circle', icon: '⭕', action: (d) => d.playCircle() },
    { id: 'line', label: 'Draw Line', icon: '📏', action: (d) => d.playLine() },
    { id: 'scribble', label: 'Scribble', icon: '✏️', action: (d) => d.playScribble() },
    { id: 'horizontal', label: 'Horizontal Drag', icon: '↔️', action: (d) => d.playHorizontalDrag() },
    { id: 'vertical', label: 'Vertical Drag', icon: '↕️', action: (d) => d.playVerticalDrag() },
    { id: 'hover-h', label: 'Hover Horizontal', icon: '👆', action: (d) => d.playHoverHorizontalDrag() },
    { id: 'hover-v', label: 'Hover Vertical', icon: '👇', action: (d) => d.playHoverVerticalDrag() },
    { id: 'tilt-x', label: 'Tilt X Sweep', icon: '↗️', action: (d) => d.playTiltXDrag() },
    { id: 'tilt-y', label: 'Tilt Y Sweep', icon: '↘️', action: (d) => d.playTiltYDrag() },
    { id: 'primary-btn', label: 'Primary Button', icon: '🔘', action: (d) => d.playPrimaryButtonDrag() },
    { id: 'secondary-btn', label: 'Secondary Button', icon: '⚪', action: (d) => d.playSecondaryButtonDrag() },
    { id: 'tablet-btns', label: 'Tablet Buttons', icon: '🎹', action: (d) => d.playTabletButtons(8) },
  ];

  connectedCallback() {
    super.connectedCallback();
    // Close dropdown when clicking outside
    this._handleOutsideClick = this._handleOutsideClick.bind(this);
    document.addEventListener('click', this._handleOutsideClick);

    // Auto-initialize based on viewer mode
    this._initializeViewerMode();
  }

  private _initializeViewerMode() {
    if (!this.viewerMode) return;

    switch (this.viewerMode) {
      case 'mock-raw':
        this.simulationDataMode = 'raw';
        this._initMockDevice();
        break;
      case 'mock-translated':
        this.simulationDataMode = 'translated';
        this._initMockDevice();
        break;
      case 'websocket':
        // WebSocket will be connected manually by user
        break;
      case 'webhid':
        // WebHID will be connected manually by user
        break;
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._disconnect();
    this._disconnectWebSocket();
    this._stopSimulation();
    document.removeEventListener('click', this._handleOutsideClick);
  }

  private _handleOutsideClick(e: Event) {
    if (this.showSimulationMenu) {
      const path = e.composedPath();
      const menu = this.shadowRoot?.querySelector('.simulation-dropdown');
      if (menu && !path.includes(menu)) {
        this.showSimulationMenu = false;
      }
    }
  }

  private _toggleSimulationMenu(e: Event) {
    e.stopPropagation();
    this.showSimulationMenu = !this.showSimulationMenu;
  }

  private async _loadSampleConfig() {
    try {
      const response = await fetch('/configs/xp-pen-deco640-osx-webhid-nodriver-config.json');
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

      // If in mock-translated mode, switch to raw mode
      if (this.viewerMode === 'mock-translated') {
        this.viewerMode = 'mock-raw';
        this.simulationDataMode = 'raw';

        // Reinitialize mock device with config
        this.mockDevice = null;
        this._initMockDevice();
      }
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
    const maxX = this.config?.byteCodeMappings.x?.max ?? 16000;
    const maxY = this.config?.byteCodeMappings.y?.max ?? 9000;

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
    if (this.simulationDataMode === 'translated') {
      this.mockDevice.addEventListener('tablet-event', (data: Uint8Array) => {
        this._processTranslatedData(data);
      });
    }
  }

  private _processMockData(data: Uint8Array) {
    // In translated mode, skip processing raw bytes for visualization
    // (they're still shown in the bytes display)
    if (this.simulationDataMode === 'translated') {
      this._updateRawBytes(data);
      return;
    }

    // Update raw bytes display
    this._updateRawBytes(data);

    // If we have a config, process through the config mappings
    if (this.config) {
      const processed = processDeviceData(data, this.config.byteCodeMappings);
      // Update tablet data using the same handler as real device
      this._handleTabletData(processed as TabletDataEvent);
    }
  }

  private _processTranslatedData(data: Uint8Array) {
    // Decode JSON from Uint8Array
    const jsonStr = new TextDecoder().decode(data);
    const translated = JSON.parse(jsonStr);

    // Update tablet data directly from translated events
    this._handleTabletData(translated as TabletDataEvent);
  }

  private _updateRawBytes(data: Uint8Array) {
    this.packetCount++;
    
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

  private _runSimulation(option: MockDataOption) {
    this._initMockDevice();
    if (!this.mockDevice) return;

    // Stop any current simulation
    this._stopSimulation();

    this.isSimulating = true;
    this.currentSimulation = option.label;
    this.showSimulationMenu = false;

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
    // Reset raw bytes when stopping simulation
    this.rawBytes = [];
    this.packetCount = 0;
  }

  private _toggleDataMode() {
    // Stop any current simulation
    this._stopSimulation();

    // Toggle mode
    this.simulationDataMode = this.simulationDataMode === 'raw' ? 'translated' : 'raw';

    // Recreate mock device with new mode
    this.mockDevice = null;
    this._initMockDevice();
  }

  private _setDataMode(mode: 'raw' | 'translated') {
    if (this.simulationDataMode === mode || this.isSimulating) {
      return;
    }

    // Stop any current simulation
    this._stopSimulation();

    // Set mode
    this.simulationDataMode = mode;

    // Recreate mock device with new mode
    this.mockDevice = null;
    this._initMockDevice();

    // Keep the menu open
    this.requestUpdate();
  }

  private async _handleConnect() {
    if (!this.config) {
      console.error('No config loaded');
      return;
    }

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

      // IMPORTANT: Get ALL authorized devices (like the walkthrough does)
      // The requestDevice picker authorizes access, but we need to get ALL interfaces
      const allDevices = await navigator.hid.getDevices();
      
      // Filter to just devices from this tablet (same vendor/product)
      const tabletDevices = allDevices.filter(d => 
        d.vendorId === this.config!.deviceInfo.vendor_id &&
        d.productId === this.config!.deviceInfo.product_id
      );
      
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
      
      this.hidDevice = primaryDevice;
      this.deviceName = primaryDevice.productName || this.config.name;
      this.deviceConnected = true;

      // Only open and listen to the interface specified in the config
      if (!primaryDevice.opened) {
        await primaryDevice.open();
      }

      // Set up event listener on the config-specified interface
      primaryDevice.addEventListener('inputreport', (event: HIDInputReportEvent) => {
        const dv = event.data;
        const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
        
        // Update raw bytes display
        this._updateRawBytes(bytes);
        
        // Process through config mappings using shared processDeviceData
        const processed = processDeviceData(bytes, this.config!.byteCodeMappings);
        this._handleTabletData(processed as TabletDataEvent);
      });

    } catch (error) {
      console.error('Failed to connect:', error);
      this.deviceConnected = false;
    }
  }

  private _handleTabletData(data: TabletDataEvent) {
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

    // Store event for events display (in translated modes)
    if (this.viewerMode === 'mock-translated' || this.viewerMode === 'websocket') {
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
        state: data.state
      };
      this.tabletEvents = [...this.tabletEvents, event];
      // Keep only last 50 events
      if (this.tabletEvents.length > 50) {
        this.tabletEvents = this.tabletEvents.slice(-50);
      }
    }
  }

  private _disconnect() {
    if (this.hidDevice) {
      this.hidDevice.close();
      this.hidDevice = null;
    }
    this.deviceConnected = false;
    this.deviceName = '';
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

  // ================== WebSocket Connection Methods ==================

  private _toggleWebSocketInput(e: Event) {
    e.stopPropagation();
    this.showWebSocketInput = !this.showWebSocketInput;
  }

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
        this.showWebSocketInput = false;
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
    this._resetTabletData();
  }

  private _handleWebSocketMessage(data: WebSocketTabletEvent) {
    if (data.type === 'connected') {
      // Initial connection message from server
      this.websocketServerInfo = data.config?.name || 'WebSocket Server';
      this.deviceName = `WS: ${this.websocketServerInfo}`;

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

      // Add to event stream for translated mode
      if (this.websocketDataMode === 'translated') {
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
  }

  private _handleWebSocketRawBytes(bytes: Uint8Array) {
    // Auto-detect that we're receiving raw bytes
    if (this.websocketDataMode !== 'raw') {
      this.websocketDataMode = 'raw';
    }

    // Update raw bytes display (this also increments packetCount)
    this._updateRawBytes(bytes);

    // Process through config mappings to update visualizers
    if (this.config) {
      const processed = processDeviceData(bytes, this.config.byteCodeMappings);
      this._handleTabletData(processed as TabletDataEvent);
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
    // For mock modes without config, use a default config name
    const configName = this.config?.name || (this.viewerMode === 'webhid' ? 'No Config Loaded' : 'Mock Tablet');

    return html`
      <div class="dashboard">
        <div class="dashboard-header">
          <div class="header-info">
            <h1>Tablet Dashboard</h1>
            <span class="config-name">${configName}</span>
          </div>

          <div class="header-controls">
            <!-- Config loading options for WebHID mode -->
            ${this.viewerMode === 'webhid' ? html`
              <div class="config-controls">
                <button class="config-button" @click=${this._handleLoadLocalConfig} title="Load config from file">
                  📁 Load Config
                </button>
                <button class="config-button" @click=${this._loadSampleConfig} title="Load sample XP-Pen config">
                  📄 Sample
                </button>
                <button class="config-button" @click=${this._handleGoToGenerator} title="Generate new config">
                  ✨ Generator
                </button>
              </div>
            ` : ''}

            <!-- Load Sample Config button (only in mock-translated mode without config) -->
            ${this.viewerMode === 'mock-translated' && !this.config ? html`
              <button class="load-config-button" @click=${this._loadSampleConfig}>
                📄 Load Sample Config
              </button>
            ` : ''}

            <!-- Simulation Dropdown (only show in mock modes) -->
            ${this.viewerMode === 'mock-raw' || this.viewerMode === 'mock-translated' ? html`
              <div class="simulation-dropdown">
                <button
                  class="simulation-button ${this.isSimulating ? 'active' : ''}"
                  @click=${this._toggleSimulationMenu}>
                  <span class="button-icon">🎮</span>
                  ${this.isSimulating ? html`
                    <span class="simulation-label">${this.currentSimulation}</span>
                    <span class="spinner"></span>
                  ` : html`
                    <span>Simulate</span>
                    <span class="dropdown-arrow">▼</span>
                  `}
                </button>

                ${this.showSimulationMenu ? html`
                  <div class="dropdown-menu">
                    <div class="dropdown-header">Mock Data Patterns</div>
                    ${this.mockDataOptions.map(option => html`
                      <button
                        class="dropdown-item"
                        @click=${() => this._runSimulation(option)}>
                        <span class="item-icon">${option.icon}</span>
                        <span class="item-label">${option.label}</span>
                      </button>
                    `)}
                  </div>
                ` : ''}

                ${this.isSimulating ? html`
                  <button class="stop-button" @click=${this._stopSimulation}>
                    ⏹ Stop
                  </button>
                ` : ''}
              </div>
            ` : ''}

            <!-- Connection Status (only show in webhid and websocket modes) -->
            ${this.viewerMode === 'webhid' || this.viewerMode === 'websocket' ? html`
              <div class="connection-status">
                ${this.viewerMode === 'webhid' && !this.config ? html`
                  <div class="status-badge warning">
                    <span class="status-dot"></span>
                    Load a config to connect
                  </div>
                ` : html`
                  <div class="status-badge ${this.deviceConnected || this.websocketConnected ? 'connected' : 'disconnected'}">
                    <span class="status-dot"></span>
                    ${this.deviceConnected ? `Connected: ${this.deviceName}` :
                      this.websocketConnected ? `WebSocket: ${this.websocketServerInfo || this.websocketUrl}` :
                      'Disconnected'}
                  </div>
                `}

                ${this.deviceConnected ? html`
                  <button class="disconnect-button" @click=${this._disconnect}>
                    Disconnect
                  </button>
                ` : this.websocketConnected ? html`
                  <button class="disconnect-button" @click=${this._disconnectWebSocket}>
                    Disconnect WS
                  </button>
                ` : html`
                  <div class="connect-options">
                    ${this.viewerMode === 'webhid' ? html`
                      <button
                        class="connect-button"
                        @click=${this._handleConnect}
                        ?disabled=${!this.config}
                        title=${!this.config ? 'Load a config first' : 'Connect to tablet'}>
                        🔌 Connect Tablet
                      </button>
                    ` : ''}
                    ${this.viewerMode === 'websocket' ? html`
                      <div class="websocket-dropdown">
                        <button class="connect-button websocket-btn" @click=${this._toggleWebSocketInput}>
                          🌐 WebSocket ${this.showWebSocketInput ? '▲' : '▼'}
                        </button>
                        ${this.showWebSocketInput ? html`
                          <div class="websocket-input-panel">
                            <input
                              type="text"
                              class="websocket-url-input"
                              .value=${this.websocketUrl}
                              @input=${this._handleWebSocketUrlChange}
                              @keydown=${(e: KeyboardEvent) => {
                                if (e.key === 'Enter') this._connectWebSocket();
                              }}
                              placeholder="ws://localhost:8765"
                            />
                            <button class="connect-ws-btn" @click=${this._connectWebSocket}>
                              Connect
                            </button>
                          </div>
                        ` : ''}
                      </div>
                    ` : ''}
                  </div>
                `}
              </div>
            ` : ''}
          </div>
        </div>

        <div class="visualizers-grid">
          <!-- Coordinates Panel -->
          <div class="visualizer-card compact">
            <h2><span class="card-icon">📍</span> Position</h2>
            <div class="visualizer-wrapper">
              <tablet-visualizer
                mode="tablet"
                .socketMode=${this.deviceConnected || this.isSimulating || this.websocketConnected}
                .tabletConnected=${this.deviceConnected || this.isSimulating || this.websocketConnected}
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
            <h2><span class="card-icon">🎯</span> Pressure & Tilt</h2>
            <div class="visualizer-wrapper">
              <tablet-visualizer
                mode="tilt"
                .socketMode=${this.deviceConnected || this.isSimulating || this.websocketConnected}
                .tabletConnected=${this.deviceConnected || this.isSimulating || this.websocketConnected}
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

          <!-- Raw Bytes or Events Panel (50% width) -->
          ${this.viewerMode === 'webhid' || this.viewerMode === 'mock-raw' || (this.viewerMode === 'websocket' && this.websocketDataMode === 'raw') ? html`
            <div class="visualizer-card half-width">
              <h2><span class="card-icon">📊</span> Raw Bytes</h2>
              <bytes-display
                .bytes=${this.rawBytes}
                .isEmpty=${this.rawBytes.length === 0}
                .placeholderCount=${10}
                .deviceInfo=${{
                  isMock: this.isSimulating && !this.deviceConnected,
                  packetCount: this.packetCount,
                  usagePage: this.config?.deviceInfo?.usage_page,
                  usage: this.config?.deviceInfo?.usage
                } as DeviceInfo}>
              </bytes-display>
            </div>
          ` : html`
            <div class="visualizer-card half-width">
              <h2><span class="card-icon">📋</span> Event Stream</h2>
              <events-display
                .events=${this.tabletEvents}
                .isEmpty=${this.tabletEvents.length === 0}
                .deviceInfo=${{
                  packetCount: this.packetCount,
                  isMock: this.viewerMode === 'mock-translated'
                } as EventsDeviceInfo}>
              </events-display>
            </div>
          `}
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