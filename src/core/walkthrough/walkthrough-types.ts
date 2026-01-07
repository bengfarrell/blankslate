/**
 * Walkthrough Types
 * Platform-agnostic type definitions for the walkthrough process
 */

import type { ByteAnalysis, DeviceByteCodeMappings, StatusValue } from '../../utils/byte-detector.js';
import { loadStringsSync, type StepStrings } from '../../utils/strings-loader.js';

/**
 * Walkthrough step identifiers
 */
export type WalkthroughStep =
  | 'idle'
  | 'step1-horizontal'
  | 'step2-vertical'
  | 'step3-pressure'
  | 'step4-hover-movement'
  | 'step5-tilt-x'
  | 'step6-tilt-y'
  | 'step7-primary-button'
  | 'step8-secondary-button'
  | 'step9-tablet-buttons'
  | 'step10-metadata'
  | 'complete';

/**
 * Gesture types for simulation/testing
 */
export type GestureType =
  | 'horizontal'
  | 'vertical'
  | 'pressure'
  | 'circle'
  | 'tilt-x'
  | 'tilt-y'
  | 'primary-button'
  | 'secondary-button'
  | 'tablet-buttons';

/**
 * Step descriptions for UI display
 */
export interface StepInfo {
  id: WalkthroughStep;
  number: number;
  title: string;
  description: string;
  instructions: string;
  gesture: GestureType | null;
}

/**
 * Collected data for each step
 */
export interface StepData {
  packets: Uint8Array[];
  detectedBytes: ByteAnalysis[];
  statusValues?: Map<number, StatusValue>;
  buttonStates?: Set<number>;
}

/**
 * User-provided device metadata
 */
export interface UserMetadata {
  name: string;
  manufacturer: string;
  model: string;
  description: string;
  buttonCount: number;
}

/**
 * Device information from HID
 */
export interface DeviceInfo {
  vendorId: number;
  productId: number;
  productName: string;
  collections?: Array<{ usagePage: number; usage: number }>;
  allInterfaces?: number[];
  detectedReportId?: number;
}

/**
 * Complete walkthrough state
 */
export interface WalkthroughState {
  currentStep: WalkthroughStep;
  isCapturing: boolean;
  stepData: Map<WalkthroughStep, StepData>;
  deviceInfo: DeviceInfo | null;
  userMetadata: UserMetadata | null;
  generatedConfig: DeviceByteCodeMappings | null;
  completeConfig: any | null;
}

/**
 * Events emitted by the walkthrough engine
 */
export type WalkthroughEvent =
  | { type: 'step-changed'; step: WalkthroughStep }
  | { type: 'capture-started'; step: WalkthroughStep }
  | { type: 'capture-stopped'; step: WalkthroughStep; packetCount: number }
  | { type: 'packet-received'; packet: Uint8Array; count: number }
  | { type: 'bytes-detected'; step: WalkthroughStep; bytes: ByteAnalysis[] }
  | { type: 'config-generated'; config: DeviceByteCodeMappings }
  | { type: 'walkthrough-complete'; config: any }
  | { type: 'error'; message: string };

/**
 * Callback for walkthrough events
 */
export type WalkthroughEventHandler = (event: WalkthroughEvent) => void;

/**
 * Gesture mappings for each step (code-defined, not localizable)
 */
const STEP_GESTURES: Record<WalkthroughStep, GestureType | null> = {
  'idle': null,
  'step1-horizontal': 'horizontal',
  'step2-vertical': 'vertical',
  'step3-pressure': 'pressure',
  'step4-hover-movement': 'circle',
  'step5-tilt-x': 'tilt-x',
  'step6-tilt-y': 'tilt-y',
  'step7-primary-button': 'primary-button',
  'step8-secondary-button': 'secondary-button',
  'step9-tablet-buttons': 'tablet-buttons',
  'step10-metadata': null,
  'complete': null,
};

/**
 * Build step info by merging gesture mappings with loaded strings
 */
function buildStepInfo(): Record<WalkthroughStep, StepInfo> {
  const strings = loadStringsSync();
  const result: Record<string, StepInfo> = {};

  for (const [stepId, gesture] of Object.entries(STEP_GESTURES)) {
    const stepStrings: StepStrings = strings.steps[stepId] || {
      number: 0,
      title: stepId,
      description: '',
      instructions: '',
    };

    result[stepId] = {
      id: stepId as WalkthroughStep,
      number: stepStrings.number,
      title: stepStrings.title,
      description: stepStrings.description,
      instructions: stepStrings.instructions,
      gesture: gesture,
    };
  }

  return result as Record<WalkthroughStep, StepInfo>;
}

/**
 * Step information lookup - loaded from strings JSON at runtime
 */
export const STEP_INFO: Record<WalkthroughStep, StepInfo> = buildStepInfo();

/**
 * Get the next step in the walkthrough sequence
 */
export function getNextStep(currentStep: WalkthroughStep): WalkthroughStep {
  const stepOrder: WalkthroughStep[] = [
    'idle',
    'step1-horizontal',
    'step2-vertical',
    'step3-pressure',
    'step4-hover-movement',
    'step5-tilt-x',
    'step6-tilt-y',
    'step7-primary-button',
    'step8-secondary-button',
    'step9-tablet-buttons',
    'step10-metadata',
    'complete',
  ];

  const currentIndex = stepOrder.indexOf(currentStep);
  if (currentIndex === -1 || currentIndex >= stepOrder.length - 1) {
    return 'complete';
  }
  return stepOrder[currentIndex + 1];
}

/**
 * Get the previous step in the walkthrough sequence
 */
export function getPreviousStep(currentStep: WalkthroughStep): WalkthroughStep {
  const stepOrder: WalkthroughStep[] = [
    'idle',
    'step1-horizontal',
    'step2-vertical',
    'step3-pressure',
    'step4-hover-movement',
    'step5-tilt-x',
    'step6-tilt-y',
    'step7-primary-button',
    'step8-secondary-button',
    'step9-tablet-buttons',
    'step10-metadata',
    'complete',
  ];

  const currentIndex = stepOrder.indexOf(currentStep);
  if (currentIndex <= 0) {
    return 'idle';
  }
  return stepOrder[currentIndex - 1];
}

