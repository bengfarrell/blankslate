/**
 * WalkthroughEngine
 * Platform-agnostic state machine and detection logic for the walkthrough process
 * 
 * This engine can be used in both browser (WebHID) and Node.js (node-hid) environments.
 */

import {
  type WalkthroughStep,
  type WalkthroughState,
  type WalkthroughEvent,
  type WalkthroughEventHandler,
  type StepData,
  type UserMetadata,
  type DeviceInfo,
  type GestureType,
  STEP_INFO,
  getNextStep,
  getPreviousStep,
} from './walkthrough-types.js';

import {
  analyzeBytes,
  getBestGuessBytesByVariance,
  generateDeviceConfig,
  type ByteAnalysis,
  type StatusValue,
  type DeviceByteCodeMappings,
  type ButtonMapping,
} from '../../utils/byte-detector.js';

import {
  generateCompleteConfig,
  type DeviceMetadata,
  type UserProvidedMetadata,
} from '../../utils/metadata-generator.js';

/**
 * Configuration options for the walkthrough engine
 */
export interface WalkthroughEngineOptions {
  /** Minimum packets to capture per step (default: 50) */
  minPacketsPerStep?: number;
  /** Minimum variance threshold for byte detection (default: 50) */
  minVarianceThreshold?: number;
  /** Auto-advance to next step after detection (default: false) */
  autoAdvance?: boolean;
  /** Skip duplicate packets (default: true) */
  skipDuplicates?: boolean;
  /** Filter out idle/out-of-range packets (default: true) */
  filterIdlePackets?: boolean;
  /** 
   * Whether packets include the report ID at byte 0 (default: true for Node.js)
   * Set to false for WebHID since browser strips the report ID
   * 
   * When true: byte 0 = report ID, byte 1 = status, byte 2+ = data
   * When false: byte 0 = status, byte 1+ = data
   * 
   * Config generation will adjust indices to always represent physical truth
   * (report ID at byte 0, status at byte 1)
   */
  packetIncludesReportId?: boolean;
}

/**
 * Packet with associated report ID for button detection
 */
export interface PacketWithReportId {
  packet: Uint8Array;
  reportId?: number;
}

/**
 * Platform-agnostic walkthrough engine
 * Manages state, packet collection, and byte detection
 */
export class WalkthroughEngine {
  private state: WalkthroughState;
  private eventHandlers: Set<WalkthroughEventHandler> = new Set();
  private options: Required<WalkthroughEngineOptions>;
  private captureBuffer: Uint8Array[] = [];
  private captureBufferWithReportId: PacketWithReportId[] = [];  // For button detection
  private statusByteValues: Map<number, StatusValue> = new Map();
  private allPackets: Uint8Array[] = [];
  private lastPacket: Uint8Array | null = null;
  private duplicateCount: number = 0;
  private idlePacketCount: number = 0;
  private buttonMappings: ButtonMapping[] = [];

  // Report ID detection (matches Python implementation)
  private detectedReportId: number | undefined = undefined;  // Will be set to first valid report ID seen
  private candidateReportIds: Set<number> = new Set();
  private reportIdLocked: boolean = false;

  // Button interface report ID detection
  private detectedButtonReportId: number | undefined = undefined;
  private buttonReportIdCandidates: Set<number> = new Set();

  constructor(options: WalkthroughEngineOptions = {}) {
    this.options = {
      minPacketsPerStep: options.minPacketsPerStep ?? 50,
      minVarianceThreshold: options.minVarianceThreshold ?? 50,
      autoAdvance: options.autoAdvance ?? false,
      skipDuplicates: options.skipDuplicates ?? true,
      filterIdlePackets: options.filterIdlePackets ?? true,
      packetIncludesReportId: options.packetIncludesReportId ?? true, // Node.js default
    };

    this.state = this.createInitialState();
  }

  /**
   * Create initial walkthrough state
   */
  private createInitialState(): WalkthroughState {
    return {
      currentStep: 'idle',
      isCapturing: false,
      stepData: new Map(),
      deviceInfo: null,
      userMetadata: null,
      generatedConfig: null,
      completeConfig: null,
    };
  }

  /**
   * Subscribe to walkthrough events
   */
  on(handler: WalkthroughEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Emit an event to all subscribers
   */
  private emit(event: WalkthroughEvent): void {
    this.eventHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in walkthrough event handler:', error);
      }
    });
  }

  /**
   * Get current walkthrough state (immutable copy)
   */
  getState(): Readonly<WalkthroughState> {
    return { ...this.state };
  }

  /**
   * Get current step info
   */
  getCurrentStepInfo() {
    return STEP_INFO[this.state.currentStep];
  }

  /**
   * Get packet count for current capture
   */
  getCapturedPacketCount(): number {
    return this.captureBuffer.length;
  }

  /**
   * Get all captured packets for current step
   */
  getCapturedPackets(): Uint8Array[] {
    return [...this.captureBuffer];
  }

  /**
   * Get all captured packets with their report IDs for current step
   * Used for button detection where we need to know which report ID each packet came from
   */
  getCapturedPacketsWithReportId(): PacketWithReportId[] {
    return [...this.captureBufferWithReportId];
  }

  /**
   * Set device information
   */
  setDeviceInfo(info: DeviceInfo): void {
    this.state.deviceInfo = info;
  }

  /**
   * Get current device information
   */
  getDeviceInfo(): DeviceInfo | null {
    return this.state.deviceInfo;
  }

  /**
   * Start the walkthrough
   */
  start(): void {
    this.state.currentStep = 'step1-horizontal';
    this.emit({ type: 'step-changed', step: this.state.currentStep });
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    this.state = this.createInitialState();
    this.captureBuffer = [];
    this.statusByteValues.clear();
    this.allPackets = [];
    // Reset report ID tracking
    this.detectedReportId = undefined;
    this.candidateReportIds.clear();
    this.reportIdLocked = false;
    // Reset button report ID tracking
    this.detectedButtonReportId = undefined;
    this.buttonReportIdCandidates.clear();
    this.emit({ type: 'step-changed', step: 'idle' });
  }

  /**
   * Reset current step data
   */
  resetCurrentStep(): void {
    this.captureBuffer = [];
    this.state.stepData.delete(this.state.currentStep);
    this.state.isCapturing = false;
  }

  /**
   * Start capturing packets for current step
   */
  startCapture(): void {
    if (this.state.currentStep === 'step10-metadata' || this.state.currentStep === 'complete') {
      return;
    }

    this.captureBuffer = [];
    this.captureBufferWithReportId = [];
    this.lastPacket = null;
    this.duplicateCount = 0;
    this.idlePacketCount = 0;
    this.state.isCapturing = true;
    this.emit({ type: 'capture-started', step: this.state.currentStep });
  }

  /**
   * Stop capturing and process collected packets
   */
  stopCapture(): void {
    if (!this.state.isCapturing) return;

    this.state.isCapturing = false;
    const packetCount = this.captureBuffer.length;
    
    this.emit({ 
      type: 'capture-stopped', 
      step: this.state.currentStep, 
      packetCount 
    });

    if (packetCount > 0) {
      this.processStepData();
    }
  }

  /**
   * Process incoming HID packet
   * @param packet Raw HID packet (report ID stripped by reader)
   * @param reportId Report ID (passed separately by HID reader)
   */
  processPacket(packet: Uint8Array, reportId?: number): void {
    if (!this.state.isCapturing) return;

    const isButtonStep = this.state.currentStep === 'step9-tablet-buttons';

    // Status byte location depends on whether packet includes report ID
    // Node.js: [reportId at 0][status at 1][data at 2+] -> statusIndex = 1, dataStart = 2
    // WebHID:  [status at 0][data at 1+] -> statusIndex = 0, dataStart = 1
    const statusIndex = this.options.packetIncludesReportId ? 1 : 0;
    const dataStartIndex = this.options.packetIncludesReportId ? 2 : 1;

    // Check if packet has meaningful data (not all zeros after status byte)
    const hasNonZeroData = packet.length > dataStartIndex &&
                           packet.slice(dataStartIndex).some(b => b !== 0);

    // Report ID detection and locking (tablet-agnostic approach)
    // Instead of checking for specific status bytes, we identify pen data by:
    // 1. Packets that have non-zero data in the coordinate bytes
    // 2. Packets that change over time (indicating pen movement)
    if (reportId !== undefined) {
      // Track report IDs that send packets with actual data
      // This is tablet-agnostic - we don't assume specific status byte values
      if (hasNonZeroData) {
        this.candidateReportIds.add(reportId);
      }

      // Track button report IDs during button step
      // Button packets often have a distinct status byte, but we can't assume which one
      // So we track all report IDs during button step and let the user confirm
      if (isButtonStep && hasNonZeroData) {
        this.buttonReportIdCandidates.add(reportId);
        if (this.detectedButtonReportId === undefined) {
          this.detectedButtonReportId = reportId;
        }
      }

      // Lock onto the first report ID that sends data with content
      // This works for any tablet regardless of status byte conventions
      if (this.candidateReportIds.size > 0 && !this.reportIdLocked) {
        this.detectedReportId = [...this.candidateReportIds][0];
        this.reportIdLocked = true;
      }

      // For gesture steps, only accept packets with the detected report ID
      // This filters out packets from other interfaces (e.g., keyboard HID)
      if (!isButtonStep && this.reportIdLocked && reportId !== this.detectedReportId) {
        return;
      }
    }

    // Skip duplicate packets if enabled
    // This is a tablet-agnostic way to filter out "idle" states
    // When pen is stationary or out of range, packets are often identical
    if (this.options.skipDuplicates && this.lastPacket) {
      if (this.arePacketsEqual(packet, this.lastPacket)) {
        this.duplicateCount++;
        return;
      }
    }

    // Filter out idle/empty packets if enabled
    // Tablet-agnostic approach: only filter packets with no meaningful data
    // NOTE: Skip filtering for step9-tablet-buttons since button packets have different structures
    if (this.options.filterIdlePackets && packet.length > statusIndex && !isButtonStep) {
      const statusByte = packet[statusIndex];

      // Filter packets that are essentially empty (all zeros after status byte)
      // This catches true idle packets regardless of tablet-specific status byte conventions
      if (!hasNonZeroData) {
        this.idlePacketCount++;
        // Still track status byte for config generation
        this.trackStatusByte(statusByte);
        return;
      }
    }

    // Store this packet
    const packetCopy = new Uint8Array(packet);
    this.captureBuffer.push(packetCopy);
    this.captureBufferWithReportId.push({ packet: packetCopy, reportId });
    this.allPackets.push(packetCopy);
    this.lastPacket = packetCopy;

    this.emit({
      type: 'packet-received',
      packet,
      count: this.captureBuffer.length
    });

    // Track status byte values for button detection
    // Use dynamic status index based on packet format
    if (packet.length > statusIndex) {
      const statusByte = packet[statusIndex];
      this.trackStatusByte(statusByte);
    }
  }

  /**
   * Check if two packets are identical
   */
  private arePacketsEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /**
   * Get statistics about filtered packets
   */
  getFilterStats(): { duplicates: number; idle: number; captured: number } {
    return {
      duplicates: this.duplicateCount,
      idle: this.idlePacketCount,
      captured: this.captureBuffer.length,
    };
  }

  /**
   * Track status byte values for button detection
   *
   * Always track ALL pen-related status bytes whenever they're seen,
   * regardless of the current step. This ensures the generated config
   * includes all necessary status mappings even if the user presses
   * stylus buttons during other walkthrough steps.
   *
   * Supports multiple tablet manufacturers with different status byte encodings:
   * - XP-Pen tablets: 0xA0-0xA5 range (160-165)
   * - Huion tablets: 0xC0-0xC5 range (192-197)
   */
  /**
   * Track status byte values for button detection.
   *
   * Handles two different tablet encoding schemes:
   * - XP-Pen style: 0xA0-0xA5 for pen states, 0xC0 for "none" (pen out of range)
   * - Huion style: 0xC0-0xC5 for pen states (no 0xA0 range)
   *
   * We detect which scheme is in use by checking if 0xA0 (160) is seen.
   * If 0xA0 is present, then 0xC0 means "none". Otherwise, 0xC0 means "hover".
   */
  private trackStatusByte(byteValue: number): void {
    // === Standard/XP-Pen tablets (0xA0-0xA5 range) ===
    const XPPEN_STATUS_MAP: Record<number, { state: string; primaryButtonPressed?: boolean; secondaryButtonPressed?: boolean }> = {
      0xa0: { state: 'hover' },           // 160 - pen hovering
      0xa1: { state: 'contact' },         // 161 - pen touching
      0xa2: { state: 'hover', secondaryButtonPressed: true },    // 162
      0xa3: { state: 'contact', secondaryButtonPressed: true },  // 163
      0xa4: { state: 'hover', primaryButtonPressed: true },      // 164
      0xa5: { state: 'contact', primaryButtonPressed: true },    // 165
    };

    // === Huion tablets (0xC0-0xC5 range) - only used if XP-Pen range not seen ===
    const HUION_STATUS_MAP: Record<number, { state: string; primaryButtonPressed?: boolean; secondaryButtonPressed?: boolean }> = {
      0xc0: { state: 'hover' },           // 192 - pen hovering (Huion only)
      0xc1: { state: 'contact' },         // 193 - pen touching
      0xc2: { state: 'hover', secondaryButtonPressed: true },    // 194
      0xc3: { state: 'contact', secondaryButtonPressed: true },  // 195
      0xc4: { state: 'hover', primaryButtonPressed: true },      // 196
      0xc5: { state: 'contact', primaryButtonPressed: true },    // 197
    };

    // === Common status codes ===
    const COMMON_STATUS_MAP: Record<number, { state: string }> = {
      0x00: { state: 'none' },            // 0 - pen out of range / idle
      0xf0: { state: 'buttons' },         // 240 - tablet button mode indicator
    };

    // Check if we're using XP-Pen style (0xA0 range present)
    const usesXppenStyle = this.statusByteValues.has(0xa0) || byteValue in XPPEN_STATUS_MAP;

    // Handle XP-Pen style status bytes
    if (byteValue in XPPEN_STATUS_MAP) {
      this.statusByteValues.set(byteValue, XPPEN_STATUS_MAP[byteValue]);
      // If we see XP-Pen style, 0xC0 should be "none" not "hover"
      // Update 0xC0 if it was previously set to "hover"
      const existingC0 = this.statusByteValues.get(0xc0);
      if (existingC0 && existingC0.state === 'hover') {
        this.statusByteValues.set(0xc0, { state: 'none' });
      }
      return;
    }

    // Handle 0xC0 specially - it's "none" for XP-Pen, "hover" for Huion
    if (byteValue === 0xc0) {
      if (usesXppenStyle) {
        this.statusByteValues.set(byteValue, { state: 'none' });
      } else {
        this.statusByteValues.set(byteValue, { state: 'hover' });
      }
      return;
    }

    // Handle other Huion style status bytes (0xC1-0xC5)
    if (byteValue in HUION_STATUS_MAP) {
      this.statusByteValues.set(byteValue, HUION_STATUS_MAP[byteValue]);
      return;
    }

    // Handle common status codes
    if (byteValue in COMMON_STATUS_MAP) {
      this.statusByteValues.set(byteValue, COMMON_STATUS_MAP[byteValue]);
      return;
    }

    // Also track button-related status bytes (1-6) for driverless mode
    // Note: 0 is already handled above as 'none'
    if (byteValue >= 1 && byteValue <= 6) {
      this.statusByteValues.set(byteValue, { state: 'buttons' });
    }
  }

  /**
   * Process collected step data and detect bytes
   */
  private processStepData(): void {
    const step = this.state.currentStep;
    const packets = [...this.captureBuffer];
    
    // Analyze bytes in the captured packets
    const analysis = analyzeBytes(packets);
    
    // Get best guess bytes based on step type
    const detectedBytes = this.detectBytesForStep(step, analysis);

    // Store step data
    const stepData: StepData = {
      packets,
      detectedBytes,
      statusValues: new Map(this.statusByteValues),
    };
    this.state.stepData.set(step, stepData);

    this.emit({ type: 'bytes-detected', step, bytes: detectedBytes });
  }

  /**
   * Store button step data from externally collected packets
   * This is used by the controller during button detection, which has its own
   * packet collection flow separate from the normal capture mechanism.
   */
  storeButtonStepData(packets: Uint8Array[]): void {
    if (packets.length === 0) return;

    // Analyze bytes in the collected packets
    const analysis = analyzeBytes(packets);

    // Detect bytes with variance (button presses cause changes)
    const buttonBytes = analysis.filter(b => b.variance > 0);

    // Store step data
    const stepData: StepData = {
      packets,
      detectedBytes: buttonBytes,
      statusValues: new Map(this.statusByteValues),
    };
    this.state.stepData.set('step9-tablet-buttons', stepData);

    this.emit({ type: 'bytes-detected', step: 'step9-tablet-buttons', bytes: buttonBytes });
  }

  /**
   * Get set of byte indices already detected in previous steps
   */
  private getKnownByteIndices(): Set<number> {
    const known = new Set<number>();
    
    // Always exclude report ID and status bytes
    // When packetIncludesReportId: byte 0 = report ID, byte 1 = status
    // When !packetIncludesReportId (WebHID): byte 0 = status
    if (this.options.packetIncludesReportId) {
      known.add(0);  // report ID
      known.add(1);  // status byte
    } else {
      known.add(0);  // status byte
    }

    // Add bytes from each completed step
    const stepsToCheck: WalkthroughStep[] = [
      'step1-horizontal',
      'step2-vertical', 
      'step3-pressure',
      'step4-hover-movement',
      'step5-tilt-x',
      'step6-tilt-y',
    ];

    for (const stepName of stepsToCheck) {
      const stepData = this.state.stepData.get(stepName);
      if (stepData?.detectedBytes) {
        stepData.detectedBytes.forEach(b => known.add(b.byteIndex));
      }
    }

    return known;
  }

  /**
   * Detect relevant bytes for a specific step
   */
  private detectBytesForStep(step: WalkthroughStep, analysis: ByteAnalysis[]): ByteAnalysis[] {
    const minVariance = this.options.minVarianceThreshold;
    const knownBytes = this.getKnownByteIndices();

    // Filter out already-identified bytes (except for step1 which has nothing identified yet)
    // Also exclude report ID (byte 0) and status byte
    // Status byte location depends on whether packet includes report ID:
    // - With report ID: byte 0 = report ID, byte 1 = status
    // - Without report ID (WebHID): byte 0 = status
    const statusByteIndex = this.options.packetIncludesReportId ? 1 : 0;
    const reportIdByteIndex = this.options.packetIncludesReportId ? 0 : -1; // -1 = no report ID byte
    
    let filteredAnalysis = analysis;
    if (step !== 'step1-horizontal') {
      filteredAnalysis = analysis.filter(b => !knownBytes.has(b.byteIndex));
    } else {
      // For step 1, exclude report ID (byte 0 if present) and status byte
      filteredAnalysis = analysis.filter(b => 
        b.byteIndex !== reportIdByteIndex && b.byteIndex !== statusByteIndex
      );
    }

    switch (step) {
      case 'step1-horizontal':
        // X coordinate bytes (2 bytes)
        return getBestGuessBytesByVariance(filteredAnalysis, 2, minVariance);
      
      case 'step2-vertical':
        // Y coordinate bytes (2 bytes) - filter out X bytes
        return getBestGuessBytesByVariance(filteredAnalysis, 2, minVariance);
      
      case 'step3-pressure':
        // Pressure bytes (2 bytes) - filter out X and Y
        return getBestGuessBytesByVariance(filteredAnalysis, 2, minVariance);
      
      case 'step4-hover-movement':
        // Hover verifies X and Y detection, doesn't detect new bytes
        // Return the X and Y bytes from previous steps
        const xBytes = this.state.stepData.get('step1-horizontal')?.detectedBytes ?? [];
        const yBytes = this.state.stepData.get('step2-vertical')?.detectedBytes ?? [];
        return [...xBytes, ...yBytes];
      
      case 'step5-tilt-x':
        // Single byte tilt X value
        return getBestGuessBytesByVariance(filteredAnalysis, 1, minVariance);
      
      case 'step6-tilt-y': {
        // Single byte tilt Y value - also filter out tilt X
        const tiltXData = this.state.stepData.get('step5-tilt-x');
        const tiltXIndices = new Set(tiltXData?.detectedBytes.map(b => b.byteIndex) ?? []);
        const withoutTiltX = filteredAnalysis.filter(b => !tiltXIndices.has(b.byteIndex));
        return getBestGuessBytesByVariance(withoutTiltX, 1, minVariance);
      }
      
      case 'step9-tablet-buttons': {
        // Button detection - look for packets that differ from normal pen packets
        // Buttons may come with:
        // 1. A different status byte (0xF0 = 240 is common for buttons)
        // 2. Different packet structure entirely (e.g., from keyboard interface)
        // 3. Same structure but different values in specific bytes
        
        const knownPenStatusBytes = new Set([0xA0, 0xA1, 0xC0, 0xA2, 0xA3, 0xA4, 0xA5]); // hover, contact, none, buttons
        
        // Find packets with non-pen status bytes (likely button packets)
        const buttonPackets = this.captureBuffer.filter(p => {
          const statusByte = p[statusByteIndex];
          // Include if it's 0xF0 (common button status) or any unknown status byte
          return statusByte === 0xF0 || !knownPenStatusBytes.has(statusByte);
        });
        
        // If we found button-specific packets, analyze those
        if (buttonPackets.length > 0) {
          // Record the button status byte
          const buttonStatusByte = buttonPackets[0][statusByteIndex];
          if (!this.statusByteValues.has(buttonStatusByte)) {
            this.statusByteValues.set(buttonStatusByte, { state: 'buttons' });
          }
          
          const buttonAnalysis = analyzeBytes(buttonPackets);
          // Look for bytes with variance (button data changes)
          const varyingBytes = buttonAnalysis.filter(b => {
            if (b.byteIndex === statusByteIndex) return false; // Skip status byte
            if (b.byteIndex === reportIdByteIndex) return false; // Skip report ID byte
            if (b.variance === 0) return false; // Skip constant bytes
            return true;
          });
          
          if (varyingBytes.length > 0) {
            return varyingBytes.slice(0, 1); // Take first varying byte as button byte
          }
        }
        
        // Fallback: analyze all packets for any varying bytes not already identified
        // This handles cases where buttons are sent as different values on normal packets
        const allAnalysis = analyzeBytes(this.captureBuffer);
        const unknownVaryingBytes = allAnalysis.filter(b => {
          if (b.byteIndex === statusByteIndex) return false; // Skip status byte
          if (b.byteIndex === reportIdByteIndex) return false; // Skip report ID byte
          if (b.variance === 0) return false; // Skip constant bytes
          if (knownBytes.has(b.byteIndex)) return false; // Skip already known bytes
          return true;
        });
        
        return unknownVaryingBytes.slice(0, 1); // Take first unknown varying byte
      }
      
      default:
        return [];
    }
  }

  /**
   * Advance to the next step
   */
  nextStep(): void {
    // Note: generateConfig() is called in submitMetadata() to ensure
    // all data (including button mappings) is collected first
    const nextStep = getNextStep(this.state.currentStep);
    this.state.currentStep = nextStep;
    this.captureBuffer = [];
    
    this.emit({ type: 'step-changed', step: nextStep });
  }

  /**
   * Go back to previous step
   */
  previousStep(): void {
    const prevStep = getPreviousStep(this.state.currentStep);
    this.state.currentStep = prevStep;
    this.captureBuffer = [];
    
    this.emit({ type: 'step-changed', step: prevStep });
  }

  /**
   * Skip to a specific step
   */
  goToStep(step: WalkthroughStep): void {
    this.state.currentStep = step;
    this.captureBuffer = [];
    this.emit({ type: 'step-changed', step });
  }

  /**
   * Generate the device byte code mappings config
   */
  private generateConfig(): void {
    const horizontalData = this.state.stepData.get('step1-horizontal');
    const verticalData = this.state.stepData.get('step2-vertical');
    const pressureData = this.state.stepData.get('step3-pressure');
    const tiltXData = this.state.stepData.get('step5-tilt-x');
    const tiltYData = this.state.stepData.get('step6-tilt-y');
    const tabletButtonData = this.state.stepData.get('step9-tablet-buttons');

    const config = generateDeviceConfig(
      horizontalData?.detectedBytes ?? [],
      verticalData?.detectedBytes ?? [],
      pressureData?.detectedBytes ?? [],
      tiltXData?.detectedBytes ?? [],
      tiltYData?.detectedBytes ?? [],
      this.statusByteValues,
      this.allPackets,
      tabletButtonData?.detectedBytes ?? [],
      tiltXData?.packets ?? [],  // Pass tilt X packets for accurate range detection
      tiltYData?.packets ?? [],  // Pass tilt Y packets for accurate range detection
      this.buttonMappings,       // Pass interactive button mappings
      this.options.packetIncludesReportId  // Pass packet format flag for WebHID offset
    );

    this.state.generatedConfig = config;
    this.emit({ type: 'config-generated', config });
  }

  /**
   * Get the detected bytes for a specific step
   */
  getStepBytes(step: WalkthroughStep): ByteAnalysis[] {
    return this.state.stepData.get(step)?.detectedBytes ?? [];
  }

  /**
   * Get all data for a specific step
   */
  getStepData(step: WalkthroughStep): StepData | undefined {
    return this.state.stepData.get(step);
  }

  /**
   * Get all detected status byte values
   */
  getStatusByteValues(): Map<number, StatusValue> {
    return new Map(this.statusByteValues);
  }

  /**
   * Get the detected report ID
   */
  getDetectedReportId(): number | undefined {
    return this.detectedReportId;
  }

  /**
   * Get the detected button interface report ID
   */
  getDetectedButtonReportId(): number | undefined {
    return this.detectedButtonReportId;
  }

  /**
   * Set user metadata and complete the walkthrough
   */
  submitMetadata(metadata: UserMetadata): void {
    this.state.userMetadata = metadata;

    // Always regenerate config to include any late-set data (like button mappings)
    this.generateConfig();

    if (this.state.generatedConfig && this.state.deviceInfo) {
      const deviceMetadata: DeviceMetadata = {
        vendorId: this.state.deviceInfo.vendorId,
        productId: this.state.deviceInfo.productId,
        productName: this.state.deviceInfo.productName,
        collections: this.state.deviceInfo.collections,
        allInterfaces: this.state.deviceInfo.allInterfaces,
        // Use the engine's detected report ID, not deviceInfo which may not have it set
        detectedReportId: this.detectedReportId,
        // Include button interface report ID if detected (for configs where buttons come on different report ID)
        detectedButtonReportId: this.detectedButtonReportId,
        dataSourceUsagePage: this.state.deviceInfo.dataSourceUsagePage,
      };

      const userProvidedMetadata: UserProvidedMetadata = {
        name: metadata.name,
        manufacturer: metadata.manufacturer,
        model: metadata.model,
        description: metadata.description,
        buttonCount: metadata.buttonCount,
      };

      this.state.completeConfig = generateCompleteConfig(
        deviceMetadata,
        userProvidedMetadata,
        this.state.generatedConfig,
        this.buttonMappings as any // Cast to DetectedButton[] (compatible interface)
      );

      this.state.currentStep = 'complete';
      this.emit({ type: 'step-changed', step: 'complete' });
      this.emit({ type: 'walkthrough-complete', config: this.state.completeConfig });
    } else {
      this.emit({ 
        type: 'error', 
        message: 'Cannot generate config: missing device info or byte mappings' 
      });
    }
  }

  /**
   * Get the generated complete configuration
   */
  getCompleteConfig(): any {
    return this.state.completeConfig;
  }

  /**
   * Get the byte code mappings configuration
   */
  getByteCodeMappings(): DeviceByteCodeMappings | null {
    return this.state.generatedConfig;
  }

  /**
   * Check if current step has enough data
   */
  hasEnoughData(): boolean {
    return this.captureBuffer.length >= this.options.minPacketsPerStep;
  }

  /**
   * Get the gesture type for the current step
   */
  getCurrentGesture(): GestureType | null {
    return STEP_INFO[this.state.currentStep].gesture;
  }

  /**
   * Set button mappings from interactive detection
   */
  setButtonMappings(mappings: ButtonMapping[]): void {
    this.buttonMappings = mappings;
  }

  /**
   * Get button mappings
   */
  getButtonMappings(): ButtonMapping[] {
    return [...this.buttonMappings];
  }

  /**
   * Export state for serialization
   */
  exportState(): object {
    return {
      currentStep: this.state.currentStep,
      deviceInfo: this.state.deviceInfo,
      userMetadata: this.state.userMetadata,
      generatedConfig: this.state.generatedConfig,
      completeConfig: this.state.completeConfig,
      buttonMappings: this.buttonMappings,
      stepDataSummary: Array.from(this.state.stepData.entries()).map(([step, data]) => ({
        step,
        packetCount: data.packets.length,
        detectedBytes: data.detectedBytes,
      })),
    };
  }
}