/**
 * Walkthrough Strings
 * Configurable text strings for the walkthrough UI
 * Used by both CLI and web components
 */

/**
 * Step string definition
 */
export interface StepStrings {
  number: number;
  title: string;
  description: string;
  instructions: string;
}

/**
 * Complete walkthrough strings structure
 */
export interface WalkthroughStrings {
  header: {
    title: string;
    emoji: string;
  };
  steps: Record<string, StepStrings>;
  prompts: Record<string, string>;
  messages: Record<string, string>;
  errors: Record<string, string>;
  ui: {
    stepFormat: string;
    progressBar: {
      filled: string;
      empty: string;
    };
    status: Record<string, string>;
    buttons: Record<string, string>;
  };
  eventViewer: {
    header: string;
    liveViewHeader: string;
    labels: Record<string, string>;
    modes: Record<string, string>;
  };
}

/**
 * Default walkthrough strings
 */
export const WALKTHROUGH_STRINGS: WalkthroughStrings = {
  header: {
    title: "The Learning Tablet - Configuration Walkthrough",
    emoji: "🎨"
  },

  steps: {
    "idle": {
      number: 0,
      title: "Ready to Start",
      description: "Connect your device to begin the walkthrough.",
      instructions: "Click Start to begin the configuration process."
    },
    "step1-horizontal": {
      number: 1,
      title: "Horizontal Movement (Contact)",
      description: "This will help us identify which bytes represent the X coordinate.",
      instructions: "Draw a horizontal line from left to right while pressing down on the tablet."
    },
    "step2-vertical": {
      number: 2,
      title: "Vertical Movement (Contact)",
      description: "This will help us identify which bytes represent the Y coordinate.",
      instructions: "Draw a vertical line from top to bottom while pressing down on the tablet."
    },
    "step3-pressure": {
      number: 3,
      title: "Pressure Detection",
      description: "This will help us identify which bytes represent pressure.",
      instructions: "Press down on the tablet and vary your pressure from light to heavy."
    },
    "step4-hover-movement": {
      number: 4,
      title: "Hover Movement",
      description: "This helps identify X and Y coordinate bytes without pressure interference.",
      instructions: "Hover your pen above the tablet and move it around freely (both horizontally and vertically)."
    },
    "step5-tilt-x": {
      number: 5,
      title: "Tilt X Detection",
      description: "This will help us identify which byte represents X tilt.",
      instructions: "Tilt your pen left and right while keeping it in contact with the tablet."
    },
    "step6-tilt-y": {
      number: 6,
      title: "Tilt Y Detection",
      description: "This will help us identify which byte represents Y tilt.",
      instructions: "Tilt your pen forward and backward while keeping it in contact with the tablet."
    },
    "step7-primary-button": {
      number: 7,
      title: "Primary Button Detection",
      description: "This will help us identify the status byte value for primary button.",
      instructions: "Press and hold the primary button on your pen while moving across the tablet."
    },
    "step8-secondary-button": {
      number: 8,
      title: "Secondary Button Detection",
      description: "This will help us identify the status byte value for secondary button.",
      instructions: "Press and hold the secondary button on your pen while moving across the tablet."
    },
    "step9-tablet-buttons": {
      number: 9,
      title: "Tablet Buttons Detection",
      description: "We'll detect how many buttons your tablet has and their byte values.",
      instructions: "Press different buttons on your tablet (not the pen buttons)."
    },
    "step10-metadata": {
      number: 10,
      title: "Device Information",
      description: "Please provide additional information about your device to complete the configuration.",
      instructions: "Fill in the device name, manufacturer, model, and description."
    },
    "complete": {
      number: 11,
      title: "Configuration Complete",
      description: "Your device configuration has been generated.",
      instructions: "You can now save or use the generated configuration."
    }
  },

  prompts: {
    selectDevice: "Select a device:",
    deviceNumber: "Enter device number to select (or 0 to cancel):",
    listAllDevices: "Would you like to see all HID devices?",
    useThisDevice: "Use this device?",
    startCapture: "Press Enter when ready to begin capture...",
    buttonCount: "How many tablet buttons (express keys) does your tablet have?",
    pressButton: "Press Button {n} three times (or Enter to skip)...",
    deviceName: "Device name:",
    manufacturer: "Manufacturer:",
    model: "Model:",
    description: "Description (optional):",
    saveConfig: "Save configuration?",
    outputPath: "Output path:",
    cancel: "Cancel"
  },

  messages: {
    scanning: "Scanning for devices...",
    openingDevice: "Opening all interfaces for device...",
    deviceReady: "Device ready",
    mockInitialized: "Mock device initialized",
    noTabletsFound: "No tablet devices found.",
    foundDevices: "Found {count} HID device(s):",
    foundTablets: "Found {count} tablet device(s):",
    capturingData: "Capturing... Perform the gesture now ({seconds}s)",
    packetsReceived: "Received {count} packets",
    bytesDetected: "Detected bytes that changed:",
    noBytesDetected: "No varying bytes detected",
    configSaved: "Configuration saved to: {path}",
    walkthroughComplete: "Walkthrough complete!",
    buttonDetected: "Detected Button {n}: scanCode={scanCode}, status={status}",
    buttonSkipped: "Skipped Button {n}",
    waitingForButton: "Waiting for button press ({presses}/3)...",
    pressCtrlC: "Press Ctrl+C to stop"
  },

  errors: {
    noDevicesFound: "No HID devices found. Please connect your tablet and try again.",
    failedToOpenDevice: "Failed to open device: {error}",
    configNotFound: "Config file not found: {path}",
    deviceIdsRequired: "Config must include deviceInfo.vendor_id and deviceInfo.product_id",
    readerNotInitialized: "Reader not initialized",
    invalidInterfaceNumber: "Invalid interface number {n}. Must be 1-{max}"
  },

  ui: {
    stepFormat: "Step {current}/{total}: {title}",
    progressBar: {
      filled: "█",
      empty: "░"
    },
    status: {
      none: "None",
      hover: "Hover",
      contact: "Contact",
      buttons: "Buttons",
      keyboard: "Keyboard"
    },
    buttons: {
      primary: "Primary",
      secondary: "Secondary",
      expressKey: "Express Key",
      simulate: "Simulate this data",
      simulating: "Simulating...",
      next: "Next Step",
      reset: "Reset",
      back: "Back",
      cancel: "Cancel",
      save: "Save Configuration",
      connect: "Connect Real Tablet",
      connecting: "Connecting..."
    }
  },

  eventViewer: {
    header: "Tablet Event Viewer",
    liveViewHeader: "TABLET LIVE VIEW",
    labels: {
      config: "Config:",
      mode: "Mode:",
      deviceIds: "Device IDs:",
      packets: "Packets:",
      state: "State:",
      position: "Position",
      pressure: "Pressure",
      tilt: "Tilt",
      buttons: "Buttons"
    },
    modes: {
      mock: "Mock Data",
      real: "Real Device",
      exclusive: "Exclusive (mouse input suppressed)"
    }
  }
};

/**
 * Format a string template with values
 * Replaces {key} placeholders with values from the provided object
 * 
 * @example
 * format("Found {count} devices", { count: 5 }) // "Found 5 devices"
 * format("Press Button {n}", { n: 3 }) // "Press Button 3"
 */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return key in values ? String(values[key]) : match;
  });
}

/**
 * Get step strings by step ID
 */
export function getStepStrings(stepId: string): StepStrings {
  return WALKTHROUGH_STRINGS.steps[stepId] || {
    number: 0,
    title: stepId,
    description: '',
    instructions: '',
  };
}

