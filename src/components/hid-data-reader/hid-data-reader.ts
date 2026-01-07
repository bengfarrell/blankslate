import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { styles } from './hid-data-reader.styles.js';

// Import from shared core
import {
  WalkthroughEngine,
  type WalkthroughStep,
  type WalkthroughEvent,
  type ByteAnalysis,
  type DeviceByteCodeMappings,
  type StatusConfig,
  type CoordinateConfig,
  type TiltConfig,
  MockHIDReader,
  createMockHIDReader,
  WebHIDReader,
  createWebHIDReader,
  generateCompleteConfig,
  type UserProvidedMetadata,
} from '../../core/index.js';

import { DeviceFinder, type DeviceConnectionResult } from '../../utils/finddevice.js';
import '../hid-devices/hid-devices.js';
import type { DeviceStream, DeviceDetails } from '../device-list-minimal/device-list-minimal.js';
import type { ByteData, DeviceInfo } from '../bytes-display/bytes-display.js';
import '../hid-json-config/hid-json-config.js';
import '../hid-walkthrough/hid-walkthrough.js';
import type { MetadataFormData } from '../device-metadata-form/device-metadata-form.js';

/**
 * HID Data Reader component for visualizing raw HID bytes
 * Refactored to use shared WalkthroughEngine for state management
 */
@customElement('hid-data-reader')
export class HidDataReader extends LitElement {
  static styles = styles;

  // Walkthrough engine (shared core)
  private engine: WalkthroughEngine;

  // Device readers
  private mockReader: MockHIDReader | null = null;
  private webReaders: WebHIDReader[] = [];
  private deviceFinder?: DeviceFinder;

  // UI State
  @state()
  private isPlaying = false;

  @state()
  private currentGesture = '';

  @state()
  private walkthroughStep: WalkthroughStep = 'step1-horizontal';

  @state()
  private capturedPacketCount = 0;

  @state()
  private horizontalBytes: ByteAnalysis[] = [];

  @state()
  private verticalBytes: ByteAnalysis[] = [];

  @state()
  private pressureBytes: ByteAnalysis[] = [];

  @state()
  private tiltXBytes: ByteAnalysis[] = [];

  @state()
  private tiltYBytes: ByteAnalysis[] = [];

  @state()
  private tabletButtonBytes: ByteAnalysis[] = [];

  @state()
  private detectedButtonStates: Set<number> = new Set();

  @state()
  private deviceConfig: DeviceByteCodeMappings | null = null;

  @state()
  private isConfigPanelExpanded = true;

  @state()
  private isRealDevice = false;

  @state()
  private realDeviceName = '';

  @state()
  private isConnecting = false;

  @state()
  private completeConfig: any = null;

  @state()
  private deviceDataStreams: Map<number, { lastPacket: string; packetCount: number; lastUpdate: number }> = new Map();

  // Track which device is currently sending data
  @state()
  private currentActiveDeviceIndex: number | undefined = undefined;

  // Raw packets for display
  private capturedPackets: Uint8Array[] = [];
  private lastCapturedPackets: Uint8Array[] = [];

  // Device metadata for config generation
  private deviceMetadata: {
    vendorId?: number;
    productId?: number;
    productName?: string;
    collections?: Array<{ usagePage: number; usage: number }>;
    allInterfaces?: number[];
    detectedReportId?: number;
  } = {};

  constructor() {
    super();
    
    // Initialize the walkthrough engine
    this.engine = new WalkthroughEngine({
      minPacketsPerStep: 50,
      minVarianceThreshold: 30,
    });

    // Subscribe to engine events
    this.engine.on((event) => this.handleEngineEvent(event));
  }

  connectedCallback() {
    super.connectedCallback();
    this._setupMockReader();
    this._setupDeviceFinder();
    this._checkForRealDevice();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._stopGesture();
    this._disconnectRealDevice();
  }

  /**
   * Handle events from the walkthrough engine
   */
  private handleEngineEvent(event: WalkthroughEvent): void {
    switch (event.type) {
      case 'step-changed':
        this.walkthroughStep = event.step;
        this.capturedPackets = [];
        break;

      case 'capture-started':
        this.capturedPackets = [];
        break;

      case 'capture-stopped':
        this.lastCapturedPackets = [...this.capturedPackets];
        break;

      case 'packet-received':
        this.capturedPacketCount = event.count;
        this.capturedPackets.push(new Uint8Array(event.packet));
        this.requestUpdate();
        break;

      case 'bytes-detected':
        this.updateDetectedBytes(event.step, event.bytes);
        break;

      case 'config-generated':
        this.deviceConfig = event.config;
        break;

      case 'walkthrough-complete':
        this.completeConfig = event.config;
        this.isConfigPanelExpanded = true;
        break;

      case 'error':
        console.error('[Walkthrough] Error:', event.message);
        break;
    }
  }

  /**
   * Update UI state with detected bytes for each step
   */
  private updateDetectedBytes(step: WalkthroughStep, bytes: ByteAnalysis[]): void {
    switch (step) {
      case 'step1-horizontal':
        this.horizontalBytes = bytes;
        break;
      case 'step2-vertical':
        this.verticalBytes = bytes;
        break;
      case 'step3-pressure':
        this.pressureBytes = bytes;
        break;
      case 'step5-tilt-x':
        this.tiltXBytes = bytes;
        break;
      case 'step6-tilt-y':
        this.tiltYBytes = bytes;
        break;
      case 'step9-tablet-buttons':
        this.tabletButtonBytes = bytes;
        break;
    }
  }

  render() {
    return html`
      <div class="header">
        ${this._renderDeviceStatus()}
      </div>

      <div class="content">
        ${this._renderWalkthrough()}

        ${this.deviceDataStreams.size > 0
          ? this._renderDeviceStreams()
          : ''
        }
      </div>
    `;
  }

  private _renderDeviceStatus() {
    return html`
      <div class="device-status">
        ${!this.isRealDevice
          ? html`
              <button
                class="button small connect"
                ?disabled="${this.isConnecting}"
                @click="${this._connectRealDevice}">
                ${this.isConnecting ? '⏳ Connecting...' : '🔌 Connect Real Tablet'}
              </button>
            `
          : ''}
      </div>
    `;
  }

  private _renderDeviceStreams() {
    const streams: DeviceStream[] = Array.from(this.deviceDataStreams.entries()).map(([index, data]) => ({
      index,
      lastPacket: data.lastPacket,
      packetCount: data.packetCount,
      lastUpdate: data.lastUpdate
    }));

    const deviceDetails = new Map<number, DeviceDetails>();
    streams.forEach(stream => {
      if (stream.index === -1) {
        deviceDetails.set(-1, { usagePage: 13, usage: 2 });
      } else {
        const reader = this.webReaders[stream.index];
        if (reader) {
          const info = reader.deviceInfo;
          deviceDetails.set(stream.index, {
            usagePage: info.usagePage,
            usage: info.usage,
            opened: reader.isOpen
          });
        }
      }
    });

    const { bytesData, deviceInfo, isEmpty } = this._getBytesDisplayData();

    return html`
      <div class="section">
        <h3>Device Interfaces</h3>
        <hid-devices
          .streams=${streams}
          .deviceDetails=${deviceDetails}
          .bytes=${bytesData}
          .bytesEmpty=${isEmpty}
          .bytesPlaceholderCount=${9}
          .bytesDeviceInfo=${deviceInfo}
          .isConnected=${this.isRealDevice}
          .connectedDeviceName=${this.realDeviceName}
          .isDeviceOpened=${this.webReaders[0]?.isOpen || false}
          @disconnect=${this._disconnectRealDevice}>
        </hid-devices>
      </div>
    `;
  }

  private _getBytesDisplayData(): { bytesData: ByteData[], deviceInfo: DeviceInfo | undefined, isEmpty: boolean } {
    const packetsToShow = this.capturedPackets.length > 0
      ? this.capturedPackets
      : this.lastCapturedPackets;

    const activeDeviceIndex = this.currentActiveDeviceIndex;
    const deviceStream = activeDeviceIndex !== undefined ? this.deviceDataStreams.get(activeDeviceIndex) : undefined;
    const isMockDevice = activeDeviceIndex === -1;

    const deviceInfo: DeviceInfo | undefined = activeDeviceIndex !== undefined ? {
      deviceNumber: activeDeviceIndex,
      packetCount: deviceStream?.packetCount || 0,
      usagePage: isMockDevice ? 13 : this.webReaders[activeDeviceIndex]?.deviceInfo.usagePage,
      usage: isMockDevice ? 2 : this.webReaders[activeDeviceIndex]?.deviceInfo.usage,
      isMock: isMockDevice
    } : undefined;

    if (packetsToShow.length === 0) {
      return { bytesData: [], deviceInfo, isEmpty: true };
    }

    const latestPacket = packetsToShow[packetsToShow.length - 1];

    // Build byte data with labels from detected bytes
    const bytesData: ByteData[] = Array.from(latestPacket).map((value, byteIndex) => {
      const byteLabel = this._getByteLabel(byteIndex);

      return {
        byteIndex,
        value,
        isIdentified: !!byteLabel,
        label: byteLabel || undefined
      };
    });

    return { bytesData, deviceInfo, isEmpty: false };
  }

  private _renderWalkthrough() {
    if (this.walkthroughStep === 'step10-metadata') {
      return html`
        <div class="section walkthrough active">
          <hid-walkthrough
            .currentStep=${this.walkthroughStep}
            .isPlaying=${this.isPlaying}
            .capturedPacketCount=${this.capturedPacketCount}
            @play-gesture=${(e: CustomEvent) => this._playGesture(e.detail.gesture)}
            @step-complete=${() => this._completeManualStep('metadata')}
            @step-reset=${() => this._resetCapture()}
            @metadata-submit=${(e: CustomEvent<MetadataFormData>) => this._handleMetadataSubmit(e)}
          ></hid-walkthrough>
        </div>
      `;
    }

    if (this.walkthroughStep === 'complete') {
      return html`
        <div class="section walkthrough active">
          <div class="step-header">
            <h3>✅ Configuration Complete!</h3>
            <button class="icon-button" @click="${this._resetWalkthrough}" title="Reset">🔄</button>
            <button class="icon-button" disabled title="Next Step">→</button>
          </div>
          <p>Your complete device configuration is ready!</p>

          ${this._renderConfigPanel()}
        </div>
      `;
    }

    return html`
      <hid-walkthrough
        .currentStep=${this.walkthroughStep}
        .isPlaying=${this.isPlaying}
        .capturedPacketCount=${this.capturedPacketCount}
        .horizontalBytes=${this.horizontalBytes}
        .verticalBytes=${this.verticalBytes}
        .pressureBytes=${this.pressureBytes}
        .tiltXBytes=${this.tiltXBytes}
        .tiltYBytes=${this.tiltYBytes}
        .tabletButtonBytes=${this.tabletButtonBytes}
        .detectedButtonStates=${this.detectedButtonStates}
        .deviceConfig=${this.deviceConfig}
        .completeConfig=${this.completeConfig}
        @play-gesture=${(e: CustomEvent) => this._playGesture(e.detail.gesture)}
        @step-complete=${() => this._completeManualStep(this._getGestureForStep(this.walkthroughStep))}
        @step-reset=${() => this._resetCapture()}
      ></hid-walkthrough>
    `;
  }

  private _getGestureForStep(step: WalkthroughStep): string {
    const gestureMap: Record<string, string> = {
      'step1-horizontal': 'horizontal',
      'step2-vertical': 'vertical',
      'step3-pressure': 'pressure',
      'step4-hover-movement': 'hover-movement',
      'step5-tilt-x': 'tilt-x',
      'step6-tilt-y': 'tilt-y',
      'step7-primary-button': 'primary-button',
      'step8-secondary-button': 'secondary-button',
      'step9-tablet-buttons': 'tablet-buttons',
    };
    return gestureMap[step] || '';
  }

  private _renderConfigPanel() {
    if (!this.deviceConfig) return '';

    return html`
      <div class="config-panel">
        <div class="config-panel-header" @click="${() => this.isConfigPanelExpanded = !this.isConfigPanelExpanded}">
          <h4>📄 Device Configuration</h4>
          <span class="collapse-icon">${this.isConfigPanelExpanded ? '▼' : '▶'}</span>
        </div>
        ${this.isConfigPanelExpanded ? html`
          <hid-json-config .config=${this.completeConfig || this.deviceConfig}></hid-json-config>
        ` : ''}
      </div>
    `;
  }

  // ==================== Device Setup ====================

  private _setupMockReader() {
    this.mockReader = createMockHIDReader({
      productName: 'Mock Graphics Tablet',
      vendorId: 0x28bd,
      productId: 0x2904,
    });

    // Initialize mock device stream
    this.deviceDataStreams.set(-1, {
      lastPacket: '',
      packetCount: 0,
      lastUpdate: Date.now()
    });

    // Connect mock reader to engine
    this.mockReader.startReading((data) => {
      this._handleDeviceData(-1, data);
    });
  }

  private _setupDeviceFinder() {
    this.deviceFinder = new DeviceFinder(
      (result: DeviceConnectionResult) => {
        this._handleDeviceConnected(result);
      },
      () => {
        this._handleDeviceDisconnected();
      },
      {
        autoConnect: true,
      }
    );
  }

  private async _checkForRealDevice() {
    if (!this.deviceFinder) return;

    try {
      await this.deviceFinder.checkForExistingDevices();
    } catch (error) {
      console.error('[HIDDataReader] Error checking for devices:', error);
    }
  }

  private async _connectRealDevice() {
    if (!this.deviceFinder) return;

    this.isConnecting = true;

    try {
      await this.deviceFinder.requestDevice([]);
    } catch (error) {
      console.error('[HIDDataReader] Error connecting device:', error);
      alert('Failed to connect to device. Please try again.');
    } finally {
      this.isConnecting = false;
    }
  }

  private async _handleDeviceConnected(result: DeviceConnectionResult) {
    this.realDeviceName = result.deviceInfo.name;
    this.isRealDevice = true;

    // Create WebHID readers for all interfaces
    this.webReaders = result.allDevices.map(device => createWebHIDReader(device));

    // Capture device metadata
    this.deviceMetadata = {
      vendorId: result.primaryDevice.vendorId,
      productId: result.primaryDevice.productId,
      productName: result.primaryDevice.productName,
      collections: result.primaryDevice.collections
        .filter(c => c.usagePage !== undefined && c.usage !== undefined)
        .map(c => ({
          usagePage: c.usagePage!,
          usage: c.usage!
        })),
      allInterfaces: result.allDevices
        .flatMap(d => d.collections.map(c => c.usagePage))
        .filter((v): v is number => v !== undefined)
        .filter((v, i, a) => a.indexOf(v) === i)
    };

    // Set device info on engine
    this.engine.setDeviceInfo({
      vendorId: this.deviceMetadata.vendorId!,
      productId: this.deviceMetadata.productId!,
      productName: this.deviceMetadata.productName || 'Unknown',
      collections: this.deviceMetadata.collections,
      allInterfaces: this.deviceMetadata.allInterfaces,
    });

    // Initialize device streams
    const mockStream = this.deviceDataStreams.get(-1);
    this.deviceDataStreams.clear();
    if (mockStream) {
      this.deviceDataStreams.set(-1, mockStream);
    }
    this.webReaders.forEach((_, index) => {
      this.deviceDataStreams.set(index, { lastPacket: '', packetCount: 0, lastUpdate: 0 });
    });

    this.requestUpdate();

    // Start reading from all devices
    this.webReaders.forEach((reader, index) => {
      reader.startReading((data) => {
        this._handleDeviceData(index, data);
      });
    });

    // Open primary device
    const primaryReader = this.webReaders[0];
    if (primaryReader && !primaryReader.isOpen) {
      try {
        await primaryReader.open();
        this.requestUpdate();
      } catch (error) {
        console.error('[HIDDataReader] Error opening device:', error);
        alert(`Failed to open device: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private _handleDeviceDisconnected() {
    this.isRealDevice = false;
    this.realDeviceName = '';
    this.webReaders.forEach(reader => reader.stopReading());
    this.webReaders = [];
  }

  private async _disconnectRealDevice() {
    if (!this.deviceFinder) return;

    try {
      await this.deviceFinder.disconnect();
      this._handleDeviceDisconnected();
    } catch (error) {
      console.error('[HIDDataReader] Error disconnecting:', error);
    }
  }

  // ==================== Data Handling ====================

  private _handleDeviceData(deviceIndex: number, data: Uint8Array) {
    const hexString = Array.from(data)
      .map(byte => byte.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');

    // Update device stream stats
    const stream = this.deviceDataStreams.get(deviceIndex);
    if (stream) {
      stream.lastPacket = hexString;
      stream.packetCount++;
      stream.lastUpdate = Date.now();
      this.deviceDataStreams = new Map(this.deviceDataStreams);
    }

    // Track active device during walkthrough
    const isInWalkthrough = this.walkthroughStep !== 'idle' && 
                           this.walkthroughStep !== 'step10-metadata' && 
                           this.walkthroughStep !== 'complete';
    
    if (isInWalkthrough) {
      this.currentActiveDeviceIndex = deviceIndex;
      
      // Capture report ID from first packet
      if (!this.deviceMetadata.detectedReportId && data.length > 0) {
        this.deviceMetadata.detectedReportId = data[0];
      }
    }

    // Pass packet to engine for processing
    this.engine.processPacket(data);

    // Track button states for step 9
    if (this.walkthroughStep === 'step9-tablet-buttons' && data.length > 1) {
      const buttonByte = data[1];
      if (buttonByte > 0) {
        this.detectedButtonStates = new Set([...this.detectedButtonStates, buttonByte]);
      }
    }

    this.requestUpdate();
  }

  // ==================== Gesture Playback ====================

  private async _playGesture(gesture: string) {
    if (!this.mockReader || this.isPlaying) return;

    // Start capturing
    this.engine.startCapture();
    
    this.isPlaying = true;
    this.currentGesture = gesture;

    // Play the gesture on mock reader
    await this.mockReader.playGestureForStep(gesture);

    // Wait for remaining packets
    await new Promise(resolve => setTimeout(resolve, 200));

    // Stop and auto-advance
    this._stopGesture();
  }

  private _stopGesture() {
    if (!this.mockReader) return;

    this.mockReader.stop();
    this.isPlaying = false;
    this.currentGesture = '';
  }

  // ==================== Step Navigation ====================

  private _completeManualStep(gesture: string) {
    // Stop capturing
    this.engine.stopCapture();
    
    // Advance to next step
    this.engine.nextStep();
  }

  private _resetCapture() {
    this.engine.resetCurrentStep();
    this.capturedPackets = [];
    this.currentActiveDeviceIndex = undefined;

    if (this.walkthroughStep === 'step9-tablet-buttons') {
      this.detectedButtonStates = new Set();
    }

    this.requestUpdate();
  }

  private _resetWalkthrough() {
    this.engine.reset();
    this.engine.start();
    
    this.horizontalBytes = [];
    this.verticalBytes = [];
    this.pressureBytes = [];
    this.tiltXBytes = [];
    this.tiltYBytes = [];
    this.tabletButtonBytes = [];
    this.detectedButtonStates = new Set();
    this.deviceConfig = null;
    this.completeConfig = null;
    this.capturedPackets = [];
    this.lastCapturedPackets = [];
  }

  // ==================== Metadata ====================

  private _handleMetadataSubmit(e: CustomEvent<MetadataFormData>) {
    const userMetadata: UserProvidedMetadata = e.detail;

    // Generate complete configuration using the engine
    this.engine.submitMetadata({
      name: userMetadata.name,
      manufacturer: userMetadata.manufacturer,
      model: userMetadata.model,
      description: userMetadata.description,
      buttonCount: userMetadata.buttonCount,
    });
  }

  // ==================== Helpers ====================

  private _getByteLabel(byteIndex: number): string | null {
    if (this.horizontalBytes.some(b => b.byteIndex === byteIndex)) return 'X';
    if (this.verticalBytes.some(b => b.byteIndex === byteIndex)) return 'Y';
    if (this.pressureBytes.some(b => b.byteIndex === byteIndex)) return 'Pressure';
    if (this.tiltXBytes.some(b => b.byteIndex === byteIndex)) return 'Tilt-X';
    if (this.tiltYBytes.some(b => b.byteIndex === byteIndex)) return 'Tilt-Y';
    if (this.tabletButtonBytes.some(b => b.byteIndex === byteIndex)) return 'Buttons';

    if (this.deviceConfig) {
      for (const [key, mapping] of Object.entries(this.deviceConfig)) {
        if (mapping && 'byteIndex' in mapping) {
          const indices = Array.isArray(mapping.byteIndex) ? mapping.byteIndex : [mapping.byteIndex];
          if (indices.includes(byteIndex)) {
            if (key === 'status') return 'Status';
            return key;
          }
        }
      }
    }

    return null;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hid-data-reader': HidDataReader;
  }
}
