import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { styles } from './hid-dashboard.styles.js';
import '../tablet-visualizer/tablet-visualizer.js';
import '../bytes-display/bytes-display.js';
import type { ByteData, DeviceInfo } from '../bytes-display/bytes-display.js';
import { Config } from '../../models/config.js';
import { HIDReader } from '../../utils/hid-reader.js';
import { MockTabletDevice } from '../../mockbytes/mock-tablet-device.js';
import { processDeviceData } from '../../utils/data-helpers.js';

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
  private packetCount = 0;

  @state()
  private isSimulating = false;

  @state()
  private showSimulationMenu = false;

  @state()
  private currentSimulation = '';

  private hidDevice: HIDDevice | null = null;
  private hidReader: HIDReader | null = null;
  private mockDevice: MockTabletDevice | null = null;

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
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._disconnect();
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

  private _initMockDevice() {
    if (this.mockDevice) return;

    // Create mock device with config matching the loaded config
    const maxX = this.config?.byteCodeMappings.x?.max ?? 16000;
    const maxY = this.config?.byteCodeMappings.y?.max ?? 9000;

    this.mockDevice = new MockTabletDevice({
      maxX,
      maxY,
      deviceName: 'Mock ' + (this.config?.name || 'Tablet'),
    });

    // Listen for mock data and process it through the config
    this.mockDevice.addEventListener('inputreport', (data: Uint8Array) => {
      this._processMockData(data);
    });
  }

  private _processMockData(data: Uint8Array) {
    if (!this.config) return;

    // Update raw bytes display
    this._updateRawBytes(data);

    // Process through the config mappings
    const processed = processDeviceData(data, this.config.byteCodeMappings);
    
    // Update tablet data using the same handler as real device
    this._handleTabletData(processed as TabletDataEvent);
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
      if (this.config) {
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

  private async _handleConnect() {
    if (!this.config) {
      console.error('No config loaded');
      return;
    }

    try {
      // Request HID device access
      const devices = await navigator.hid.requestDevice({
        filters: [{
          vendorId: this.config.deviceInfo.vendor_id,
          productId: this.config.deviceInfo.product_id
        }]
      });

      if (devices.length === 0) {
        console.log('No device selected');
        return;
      }

      const device = devices[0];
      this.hidDevice = device;
      this.deviceName = device.productName || this.config.name;
      this.deviceConnected = true;

      // Create HID reader with config mappings
      this.hidReader = new HIDReader(
        device,
        {
          mappings: this.config.byteCodeMappings,
          reportId: this.config.reportId
        },
        (data) => this._handleTabletData(data as TabletDataEvent)
      );

      // Start reading from the device
      await this.hidReader.startReading();

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

    // Handle tablet buttons if present
    if (data.button !== undefined) {
      const newSet = new Set(this.pressedButtons);
      // Simple toggle logic - in reality this would need proper button state tracking
      if (data.button > 0) {
        newSet.add(data.button);
      }
      this.pressedButtons = newSet;
    }
  }

  private _disconnect() {
    if (this.hidReader) {
      this.hidReader.close();
      this.hidReader = null;
    }
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

  private _formatValue(value: number, decimals: number = 2): string {
    return value.toFixed(decimals);
  }

  render() {
    if (!this.config) {
      return html`
        <div class="dashboard">
          <div class="empty-state">
            <h2>No Configuration Loaded</h2>
            <p>Please load a tablet configuration to use the dashboard.</p>
          </div>
        </div>
      `;
    }

    return html`
      <div class="dashboard">
        <div class="dashboard-header">
          <div class="header-info">
            <h1>Tablet Dashboard</h1>
            <span class="config-name">${this.config.name}</span>
          </div>

          <div class="header-controls">
            <!-- Simulation Dropdown -->
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

            <!-- Connection Status -->
            <div class="connection-status">
              <div class="status-badge ${this.deviceConnected ? 'connected' : 'disconnected'}">
                <span class="status-dot"></span>
                ${this.deviceConnected ? `Connected: ${this.deviceName}` : 'Disconnected'}
              </div>

              ${this.deviceConnected ? html`
                <button class="disconnect-button" @click=${this._disconnect}>
                  Disconnect
                </button>
              ` : html`
                <button class="connect-button" @click=${this._handleConnect}>
                  Connect Tablet
                </button>
              `}
            </div>
          </div>
        </div>

        <div class="visualizers-grid">
          <!-- Coordinates Panel -->
          <div class="visualizer-card compact">
            <h2><span class="card-icon">📍</span> Position</h2>
            <div class="visualizer-wrapper">
              <tablet-visualizer
                mode="tablet"
                .socketMode=${this.deviceConnected || this.isSimulating}
                .tabletConnected=${this.deviceConnected || this.isSimulating}
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
                .socketMode=${this.deviceConnected || this.isSimulating}
                .tabletConnected=${this.deviceConnected || this.isSimulating}
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

          <!-- Raw Bytes Panel (50% width) -->
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

