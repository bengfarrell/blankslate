/**
 * EventViewer Packet Routing Tests
 * 
 * These tests verify that EventViewer.handlePacket() correctly routes packets
 * based on interfaceType and config type:
 * 
 * - XP-Pen style: keyboard interface + tabletButtons config → processPacket()
 * - Huion style: keyboard interface + keyboardButtons config → processKeyboardPacket()
 * - Digitizer interface → always processPacket()
 * 
 * This addresses a test coverage gap where the bug existed in handlePacket()
 * routing logic, but tests only exercised WalkthroughEngine.processPacket().
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Config } from '../../src/models/config.js';
import { processDeviceData, processKeyboardButtonData, type KeyboardButtonsConfig } from '../../src/utils/data-helpers.js';
import type { HIDInterfaceType } from '../../src/core/hid/hid-interface.js';

// Config paths
const XP_PEN_CONFIG_PATH = 'public/configs/xp-pen-deco640.json';
const HUION_CONFIG_PATH = 'public/configs/huion-inspiroy2m.json';

/**
 * Testable implementation of EventViewer's handlePacket routing logic
 * This isolates the routing decision from the display/output logic
 */
class TestableEventViewerRouter {
  protected configData: Config;
  protected currentMode: any = null;
  protected detectedReportId: number | null = null;

  // Track which processing path was taken
  public lastRoutingDecision: 'processPacket' | 'processKeyboardPacket' | null = null;
  public lastHasTabletButtonsForReportId: boolean | null = null;

  constructor(configPath: string) {
    const fullPath = join(process.cwd(), configPath);
    const configString = readFileSync(fullPath, 'utf-8');
    this.configData = Config.fromJSON(configString);
  }

  /**
   * Set the current mode by report ID (simulates receiving a pen packet first)
   * This is needed for multi-mode configs where button packets alone can't determine the mode
   */
  setModeByReportId(reportId: number): void {
    this.currentMode = this.configData.getModeByReportId(reportId);
    this.detectedReportId = reportId;
  }

  /**
   * Set the current mode by index (0 = first mode, 1 = second mode, etc.)
   */
  setModeByIndex(index: number): void {
    if (this.configData.modes && index < this.configData.modes.length) {
      this.currentMode = this.configData.modes[index];
      this.detectedReportId = this.currentMode.reportId;
    }
  }

  /**
   * Simulates EventViewer.handlePacket() routing logic
   * Returns the processed events and tracks which path was taken
   */
  handlePacket(
    data: Uint8Array,
    reportId?: number,
    interfaceType?: HIDInterfaceType
  ): Record<string, any> {
    // Check if any mode has this as a buttonInterfaceReportId with tabletButtons config
    const hasTabletButtonsForReportId = this.configData.modes?.some(mode =>
      mode.buttonInterfaceReportId === reportId &&
      mode.byteCodeMappings?.tabletButtons
    ) ?? false;

    this.lastHasTabletButtonsForReportId = hasTabletButtonsForReportId;

    let events: Record<string, any>;

    if (interfaceType === 'keyboard' && !hasTabletButtonsForReportId) {
      // Huion-style: keyboard interface with keyboardButtons config
      this.lastRoutingDecision = 'processKeyboardPacket';
      events = this.processKeyboardPacket(data);
    } else {
      // XP-Pen style or digitizer: use standard packet processing
      this.lastRoutingDecision = 'processPacket';
      events = this.processPacket(data, reportId);
    }

    return events;
  }

  /**
   * Process keyboard HID interface packets (Huion-style)
   */
  protected processKeyboardPacket(data: Uint8Array): Record<string, any> {
    let keyboardButtonsConfig: KeyboardButtonsConfig | undefined;

    const mode = this.currentMode ?? this.configData.modes[0];
    keyboardButtonsConfig = mode?.byteCodeMappings?.keyboardButtons as KeyboardButtonsConfig | undefined;

    if (!keyboardButtonsConfig) {
      return {};
    }

    return processKeyboardButtonData(data, keyboardButtonsConfig);
  }

  /**
   * Standard packet processing (pen data or XP-Pen style buttons)
   */
  protected processPacket(data: Uint8Array, reportId?: number): Record<string, any> {
    if (data.length === 0) {
      return {};
    }

    const rid = reportId !== undefined ? reportId : data[0];

    // For multi-mode configs, detect mode from report ID
    let mappings: any;
    let buttonInterfaceReportId: number | undefined;

    if (this.configData.modes.length > 1) {
      // If mode is already set (e.g., from a previous pen packet), use it
      if (this.currentMode) {
        mappings = this.currentMode.byteCodeMappings;
        buttonInterfaceReportId = this.currentMode.buttonInterfaceReportId;
      } else {
        // Try to detect mode from report ID
        let mode = this.configData.getModeByReportId(rid);

        // If not found by main report ID, check button interface report ID
        if (!mode) {
          mode = this.configData.modes.find(m => m.buttonInterfaceReportId === rid) || null;
        }

        if (mode) {
          this.currentMode = mode;
          mappings = mode.byteCodeMappings;
          buttonInterfaceReportId = mode.buttonInterfaceReportId;
        } else {
          const fallbackMode = this.configData.modes[0];
          mappings = fallbackMode?.byteCodeMappings;
          buttonInterfaceReportId = fallbackMode?.buttonInterfaceReportId;
        }
      }
    } else {
      const mode = this.configData.modes[0];
      mappings = mode?.byteCodeMappings;
      buttonInterfaceReportId = mode?.buttonInterfaceReportId;
    }

    return processDeviceData(data, mappings, 0, { buttonInterfaceReportId });
  }
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// ============================================================================
// XP-Pen Style Tests (keyboard interface + tabletButtons config)
// ============================================================================

describe('EventViewer Packet Routing: XP-Pen Style', () => {
  let router: TestableEventViewerRouter;

  beforeEach(() => {
    router = new TestableEventViewerRouter(XP_PEN_CONFIG_PATH);
  });

  describe('Routing Decision', () => {
    it('should route keyboard interface packets to processPacket when config has tabletButtons', () => {
      // XP-Pen driverless button packet: Report ID 6, status=1, scanCode=0x57 (87 = button 6)
      const packet = hexToBytes('06015700000000');
      
      router.handlePacket(packet, 6, 'keyboard');

      expect(router.lastRoutingDecision).toBe('processPacket');
      expect(router.lastHasTabletButtonsForReportId).toBe(true);
    });

    it('should detect hasTabletButtonsForReportId=true for report ID 6', () => {
      const packet = hexToBytes('06015700000000');
      
      router.handlePacket(packet, 6, 'keyboard');

      expect(router.lastHasTabletButtonsForReportId).toBe(true);
    });

    it('should route digitizer interface packets to processPacket', () => {
      // XP-Pen pen packet: Report ID 7, status=0xA0 (hover)
      const packet = hexToBytes('07a0401f0023000000003c3c');
      
      router.handlePacket(packet, 7, 'digitizer');

      expect(router.lastRoutingDecision).toBe('processPacket');
    });
  });

  describe('Button Detection', () => {
    beforeEach(() => {
      // Set driverless mode (mode index 1, report ID 7) which uses scan codes
      // In real usage, this would be detected from a pen packet first
      router.setModeByIndex(1);
    });

    it('should detect button 1 from scan code 5', () => {
      // Driverless mode: status=1, scanCode=5 → button 1
      const packet = hexToBytes('0601050000000000');

      const result = router.handlePacket(packet, 6, 'keyboard');

      expect(result.tabletButtons).toBe(1);
      expect(result.button1).toBe(true);
    });

    it('should detect button 2 from scan code 8', () => {
      // Driverless mode: status=1, scanCode=8 → button 2
      const packet = hexToBytes('0601080000000000');

      const result = router.handlePacket(packet, 6, 'keyboard');

      expect(result.tabletButtons).toBe(2);
      expect(result.button2).toBe(true);
    });

    it('should detect button 5 from scan code 86 (0x56)', () => {
      // Driverless mode: status=1, scanCode=86 → button 5
      const packet = hexToBytes('0601560000000000');

      const result = router.handlePacket(packet, 6, 'keyboard');

      expect(result.tabletButtons).toBe(5);
      expect(result.button5).toBe(true);
    });

    it('should detect button 6 from scan code 87 (0x57)', () => {
      // Driverless mode: status=1, scanCode=87 → button 6
      const packet = hexToBytes('0601570000000000');

      const result = router.handlePacket(packet, 6, 'keyboard');

      expect(result.tabletButtons).toBe(6);
      expect(result.button6).toBe(true);
    });

    it('should handle button release (no scan code)', () => {
      // Button release: status=0, scanCode=0
      const packet = hexToBytes('0600000000000000');

      const result = router.handlePacket(packet, 6, 'keyboard');

      // Should not have any button pressed
      expect(result.tabletButtons).toBeFalsy();
    });
  });

  describe('Pen Data Processing', () => {
    it('should process pen hover data from digitizer interface', () => {
      // Report ID 7 (driverless), status=0xA0 (hover), x=8000, y=4500
      // x = 8000 = 0x1F40, y = 4500 = 0x1194
      const packet = hexToBytes('07a0401f941100000000003c3c');
      
      const result = router.handlePacket(packet, 7, 'digitizer');

      expect(result.state).toBe('hover');
      expect(result.x).toBeDefined();
      expect(result.y).toBeDefined();
    });

    it('should process pen contact data from digitizer interface', () => {
      // Report ID 7 (driverless), status=0xA1 (contact), with pressure
      const packet = hexToBytes('07a1401f9411ff3f00003c3c');
      
      const result = router.handlePacket(packet, 7, 'digitizer');

      expect(result.state).toBe('contact');
      expect(result.pressure).toBeDefined();
    });
  });
});

// ============================================================================
// Huion Style Tests (keyboard interface + keyboardButtons config)
// ============================================================================

describe('EventViewer Packet Routing: Huion Style', () => {
  let router: TestableEventViewerRouter;

  beforeEach(() => {
    router = new TestableEventViewerRouter(HUION_CONFIG_PATH);
  });

  describe('Routing Decision', () => {
    it('should route keyboard interface packets to processKeyboardPacket when config has keyboardButtons', () => {
      // Huion keyboard button packet: Report ID 3, modifier=0, keycode=5
      const packet = hexToBytes('0300050000000000');
      
      router.handlePacket(packet, 3, 'keyboard');

      expect(router.lastRoutingDecision).toBe('processKeyboardPacket');
      expect(router.lastHasTabletButtonsForReportId).toBe(false);
    });

    it('should detect hasTabletButtonsForReportId=false for Huion config', () => {
      const packet = hexToBytes('0300050000000000');
      
      router.handlePacket(packet, 3, 'keyboard');

      // Huion doesn't have tabletButtons config, uses keyboardButtons instead
      expect(router.lastHasTabletButtonsForReportId).toBe(false);
    });

    it('should route digitizer interface packets to processPacket', () => {
      // Huion pen packet: Report ID 10
      const packet = hexToBytes('0ac04121c93c000050b3');
      
      router.handlePacket(packet, 10, 'digitizer');

      expect(router.lastRoutingDecision).toBe('processPacket');
    });
  });

  describe('Button Detection via keyboardButtons', () => {
    it('should detect button 1 from keyboard packet (modifier=0, keycode=5)', () => {
      // Button 1: reportId=3, modifier=0, keycode=5
      const packet = hexToBytes('0300050000000000');
      
      const result = router.handlePacket(packet, 3, 'keyboard');

      expect(result.tabletButtons).toBe(1);
      expect(result.button1).toBe(true);
    });

    it('should detect button 3 from keyboard packet (modifier=0, keycode=8)', () => {
      // Button 3: reportId=3, modifier=0, keycode=8
      const packet = hexToBytes('0300080000000000');
      
      const result = router.handlePacket(packet, 3, 'keyboard');

      expect(result.tabletButtons).toBe(3);
      expect(result.button3).toBe(true);
    });

    it('should handle button release (keycode=0)', () => {
      // Button release: modifier=0, keycode=0
      const packet = hexToBytes('0300000000000000');
      
      const result = router.handlePacket(packet, 3, 'keyboard');

      // Should not have any button pressed
      expect(result.tabletButtons === 0 || result.tabletButtons === undefined).toBe(true);
    });
  });

  describe('Pen Data Processing', () => {
    it('should process pen data from digitizer interface', () => {
      // Huion pen packet: Report ID 10, status=0xC0 (hover)
      const packet = hexToBytes('0ac04121c93c000050b3');
      
      const result = router.handlePacket(packet, 10, 'digitizer');

      expect(result.state).toBe('hover');
      expect(result.x).toBeDefined();
      expect(result.y).toBeDefined();
    });
  });
});

// ============================================================================
// Edge Cases and Mixed Scenarios
// ============================================================================

describe('EventViewer Packet Routing: Edge Cases', () => {
  describe('Unknown Interface Type', () => {
    it('should route unknown interface type to processPacket (XP-Pen config)', () => {
      const router = new TestableEventViewerRouter(XP_PEN_CONFIG_PATH);
      const packet = hexToBytes('07a0401f941100000000003c3c');
      
      // 'other' interface type should go to processPacket
      router.handlePacket(packet, 7, 'other');

      expect(router.lastRoutingDecision).toBe('processPacket');
    });

    it('should route undefined interface type to processPacket', () => {
      const router = new TestableEventViewerRouter(XP_PEN_CONFIG_PATH);
      const packet = hexToBytes('07a0401f941100000000003c3c');
      
      // undefined interface type should go to processPacket
      router.handlePacket(packet, 7, undefined);

      expect(router.lastRoutingDecision).toBe('processPacket');
    });
  });

  describe('Report ID Mismatch', () => {
    it('should handle report ID that does not match any buttonInterfaceReportId', () => {
      const router = new TestableEventViewerRouter(XP_PEN_CONFIG_PATH);
      // Report ID 99 doesn't exist in config
      const packet = hexToBytes('63000000000000');
      
      router.handlePacket(packet, 99, 'keyboard');

      // Should still route to processKeyboardPacket since hasTabletButtonsForReportId will be false
      expect(router.lastHasTabletButtonsForReportId).toBe(false);
      expect(router.lastRoutingDecision).toBe('processKeyboardPacket');
    });
  });

  describe('Empty Packet', () => {
    it('should handle empty packet gracefully', () => {
      const router = new TestableEventViewerRouter(XP_PEN_CONFIG_PATH);
      const packet = new Uint8Array(0);
      
      const result = router.handlePacket(packet, 6, 'keyboard');

      expect(result).toEqual({});
    });
  });

  describe('Multi-Mode Config Handling', () => {
    it('should check all modes for tabletButtons config', () => {
      const router = new TestableEventViewerRouter(XP_PEN_CONFIG_PATH);
      
      // Both XP-Pen modes (driver and driverless) have buttonInterfaceReportId: 6
      // and both have tabletButtons config
      const packet = hexToBytes('06015700000000');
      
      router.handlePacket(packet, 6, 'keyboard');

      // Should find tabletButtons in at least one mode
      expect(router.lastHasTabletButtonsForReportId).toBe(true);
    });

    it('should correctly route driver mode button packets', () => {
      const router = new TestableEventViewerRouter(XP_PEN_CONFIG_PATH);
      
      // Driver mode button packet: Report ID 6, status=0xF0 (240), bit-flag=1 (button 1)
      const packet = hexToBytes('06f00100000000');
      
      const result = router.handlePacket(packet, 6, 'keyboard');

      expect(router.lastRoutingDecision).toBe('processPacket');
      // In driver mode, bit-flag 1 = button 1
      expect(result.tabletButtons).toBe(1);
    });
  });

  describe('Interleaved Packets', () => {
    it('should handle rapid switching between pen and button packets (XP-Pen)', () => {
      const router = new TestableEventViewerRouter(XP_PEN_CONFIG_PATH);
      // Set driverless mode (report ID 7) which uses scan codes for buttons
      router.setModeByReportId(7);

      // Pen packet (driverless mode, report ID 7)
      const penPacket = hexToBytes('07a0401f941100000000003c3c');
      let result = router.handlePacket(penPacket, 7, 'digitizer');
      expect(router.lastRoutingDecision).toBe('processPacket');
      expect(result.state).toBe('hover');

      // Button packet (scan code 87 = button 6 in driverless mode)
      const buttonPacket = hexToBytes('0601570000000000');
      result = router.handlePacket(buttonPacket, 6, 'keyboard');
      expect(router.lastRoutingDecision).toBe('processPacket');
      expect(result.tabletButtons).toBe(6);

      // Back to pen packet
      result = router.handlePacket(penPacket, 7, 'digitizer');
      expect(router.lastRoutingDecision).toBe('processPacket');
      expect(result.state).toBe('hover');
    });

    it('should handle rapid switching between pen and button packets (Huion)', () => {
      const router = new TestableEventViewerRouter(HUION_CONFIG_PATH);
      
      // Pen packet
      const penPacket = hexToBytes('0ac04121c93c000050b3');
      let result = router.handlePacket(penPacket, 10, 'digitizer');
      expect(router.lastRoutingDecision).toBe('processPacket');
      expect(result.state).toBe('hover');

      // Button packet
      const buttonPacket = hexToBytes('0300050000000000');
      result = router.handlePacket(buttonPacket, 3, 'keyboard');
      expect(router.lastRoutingDecision).toBe('processKeyboardPacket');
      expect(result.tabletButtons).toBe(1);

      // Back to pen packet
      result = router.handlePacket(penPacket, 10, 'digitizer');
      expect(router.lastRoutingDecision).toBe('processPacket');
      expect(result.state).toBe('hover');
    });
  });
});

// ============================================================================
// Regression Tests for the Original Bug
// ============================================================================

describe('EventViewer Packet Routing: Regression Tests', () => {
  describe('Original Bug: XP-Pen buttons not detected', () => {
    it('should NOT route XP-Pen keyboard interface packets to processKeyboardPacket', () => {
      const router = new TestableEventViewerRouter(XP_PEN_CONFIG_PATH);
      
      // This was the bug: keyboard interface packets were being routed to
      // processKeyboardPacket() which expects Huion-style keyboardButtons config,
      // but XP-Pen uses tabletButtons config
      const packet = hexToBytes('06015700000000');
      
      router.handlePacket(packet, 6, 'keyboard');

      // The fix: should route to processPacket, NOT processKeyboardPacket
      expect(router.lastRoutingDecision).toBe('processPacket');
      expect(router.lastRoutingDecision).not.toBe('processKeyboardPacket');
    });

    it('should detect XP-Pen buttons when packets come from keyboard interface', () => {
      const router = new TestableEventViewerRouter(XP_PEN_CONFIG_PATH);
      // Set driverless mode (report ID 7) which uses scan codes for buttons
      router.setModeByReportId(7);

      // Button 6 packet from keyboard interface (scan code 87 = 0x57)
      const packet = hexToBytes('0601570000000000');

      const result = router.handlePacket(packet, 6, 'keyboard');

      // Should correctly detect button 6
      expect(result.tabletButtons).toBe(6);
      expect(result.button6).toBe(true);
    });

    it('should detect all XP-Pen driverless buttons from keyboard interface', () => {
      const router = new TestableEventViewerRouter(XP_PEN_CONFIG_PATH);
      // Set driverless mode (report ID 7) which uses scan codes for buttons
      router.setModeByReportId(7);

      // Test all driverless mode scan codes
      const buttonTests = [
        { scanCode: '05', expectedButton: 1 },
        { scanCode: '08', expectedButton: 2 },
        { scanCode: '2f', expectedButton: 3 },  // 47
        { scanCode: '30', expectedButton: 4 },  // 48
        { scanCode: '56', expectedButton: 5 },  // 86
        { scanCode: '57', expectedButton: 6 },  // 87
        { scanCode: '1d', expectedButton: 7 },  // 29
      ];

      for (const test of buttonTests) {
        const packet = hexToBytes(`0601${test.scanCode}0000000000`);
        const result = router.handlePacket(packet, 6, 'keyboard');

        expect(result.tabletButtons).toBe(test.expectedButton);
        expect(result[`button${test.expectedButton}`]).toBe(true);
      }
    });
  });

  describe('Huion should still work correctly', () => {
    it('should still route Huion keyboard packets to processKeyboardPacket', () => {
      const router = new TestableEventViewerRouter(HUION_CONFIG_PATH);
      
      // Huion button packet
      const packet = hexToBytes('0300050000000000');
      
      router.handlePacket(packet, 3, 'keyboard');

      // Huion should still use processKeyboardPacket
      expect(router.lastRoutingDecision).toBe('processKeyboardPacket');
    });

    it('should detect Huion buttons correctly', () => {
      const router = new TestableEventViewerRouter(HUION_CONFIG_PATH);
      
      // Button 1 packet
      const packet = hexToBytes('0300050000000000');
      
      const result = router.handlePacket(packet, 3, 'keyboard');

      expect(result.tabletButtons).toBe(1);
      expect(result.button1).toBe(true);
    });
  });
});
