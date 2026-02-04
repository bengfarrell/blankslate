"""
Walkthrough Types
Platform-agnostic type definitions for the walkthrough process
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Literal
from enum import Enum


# Walkthrough step identifiers
WalkthroughStep = Literal[
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
    'complete'
]

# Gesture types for simulation/testing
GestureType = Literal[
    'horizontal',
    'vertical',
    'pressure',
    'circle',
    'tilt-x',
    'tilt-y',
    'primary-button',
    'secondary-button',
    'tablet-buttons'
]

# Data source types
DataSource = Literal['device', 'mock', 'exit']

# Navigation actions
NavigationAction = Literal['next', 'retry', 'previous', 'cancel']


@dataclass
class StepInfo:
    """Step descriptions for UI display"""
    id: WalkthroughStep
    number: int
    title: str
    description: str
    instructions: str
    gesture: Optional[GestureType]


@dataclass
class StepData:
    """Collected data for each step"""
    packets: List[bytes]
    detected_bytes: List['ByteAnalysis']
    status_values: Optional[Dict[int, Dict]] = None
    button_states: Optional[Set[int]] = None


@dataclass
class UserMetadata:
    """User-provided device metadata"""
    name: str
    manufacturer: str
    model: str
    description: str
    button_count: int = 0


@dataclass
class DeviceInfo:
    """Device connection information"""
    vendor_id: int
    product_id: int
    product_string: str
    usage_page: int
    usage: int
    interfaces: List[int]
    path: bytes = b''  # HID device path for opening specific interface


@dataclass
class CaptureStatus:
    """Status of packet capture"""
    packet_count: int
    duplicates_filtered: int
    idle_filtered: int
    is_capturing: bool


@dataclass
class DetectedButton:
    """Information about a detected button"""
    button_number: int
    byte_index: int  # Status byte value (or report ID for keyboard interface)
    bit_position: int  # Scan code value (combined code for keyboard interface)
    interface_type: str = 'digitizer'  # 'digitizer' or 'keyboard'
    # Additional metadata for keyboard interface buttons
    modifier: Optional[int] = None  # Keyboard modifier byte (for Report ID 3)
    keycode: Optional[int] = None  # Keyboard keycode (for Report ID 3)
    consumer_code: Optional[int] = None  # Consumer control code (for Report ID 4)
    scroll_delta: Optional[int] = None  # Scroll delta (for Report ID 5)


@dataclass
class ByteAnalysis:
    """Byte analysis result"""
    byte_index: int
    min: int
    max: int
    variance: int


# Step information mapping
STEP_INFO: Dict[WalkthroughStep, StepInfo] = {
    'idle': StepInfo(
        id='idle',
        number=0,
        title='Ready',
        description='Walkthrough not started',
        instructions='',
        gesture=None
    ),
    'step1-horizontal': StepInfo(
        id='step1-horizontal',
        number=1,
        title='Horizontal Movement',
        description='Detect X coordinate bytes',
        instructions='Move your stylus LEFT and RIGHT across the tablet surface while pressing down.',
        gesture='horizontal'
    ),
    'step2-vertical': StepInfo(
        id='step2-vertical',
        number=2,
        title='Vertical Movement',
        description='Detect Y coordinate bytes',
        instructions='Move your stylus UP and DOWN across the tablet surface while pressing down.',
        gesture='vertical'
    ),
    'step3-pressure': StepInfo(
        id='step3-pressure',
        number=3,
        title='Pressure Variation',
        description='Detect pressure bytes',
        instructions='Press your stylus down with VARYING PRESSURE - light, medium, and hard.',
        gesture='pressure'
    ),
    'step4-hover-movement': StepInfo(
        id='step4-hover-movement',
        number=4,
        title='Hover Movement',
        description='Verify hover detection',
        instructions='Move your stylus in a CIRCLE while HOVERING (not touching) above the tablet.',
        gesture='circle'
    ),
    'step5-tilt-x': StepInfo(
        id='step5-tilt-x',
        number=5,
        title='Tilt X',
        description='Detect X-axis tilt bytes',
        instructions='Tilt your stylus LEFT and RIGHT while keeping it in one spot.',
        gesture='tilt-x'
    ),
    'step6-tilt-y': StepInfo(
        id='step6-tilt-y',
        number=6,
        title='Tilt Y',
        description='Detect Y-axis tilt bytes',
        instructions='Tilt your stylus FORWARD and BACKWARD while keeping it in one spot.',
        gesture='tilt-y'
    ),
    'step7-primary-button': StepInfo(
        id='step7-primary-button',
        number=7,
        title='Primary Button',
        description='Detect primary stylus button',
        instructions='Press and release the PRIMARY BUTTON on your stylus several times.',
        gesture='primary-button'
    ),
    'step8-secondary-button': StepInfo(
        id='step8-secondary-button',
        number=8,
        title='Secondary Button',
        description='Detect secondary stylus button',
        instructions='Press and release the SECONDARY BUTTON on your stylus several times.',
        gesture='secondary-button'
    ),
    'step9-tablet-buttons': StepInfo(
        id='step9-tablet-buttons',
        number=9,
        title='Tablet Buttons',
        description='Detect tablet express keys',
        instructions='Press each button on your tablet one at a time.',
        gesture='tablet-buttons'
    ),
    'step10-metadata': StepInfo(
        id='step10-metadata',
        number=10,
        title='Device Information',
        description='Enter device details',
        instructions='Provide information about your tablet device.',
        gesture=None
    ),
    'complete': StepInfo(
        id='complete',
        number=11,
        title='Complete',
        description='Configuration generated',
        instructions='Your tablet configuration has been generated.',
        gesture=None
    ),
}

# Gesture mappings for each step
STEP_GESTURES: Dict[WalkthroughStep, Optional[GestureType]] = {
    'idle': None,
    'step1-horizontal': 'horizontal',
    'step2-vertical': 'vertical',
    'step3-pressure': 'pressure',
    'step4-hover-movement': 'circle',
    'step5-tilt-x': 'tilt-x',
    'step6-tilt-y': 'tilt-y',
    'step7-primary-button': 'primary-button',
    'step8-secondary-button': 'secondary-button',
    'step9-tablet-buttons': 'tablet-buttons',
    'step10-metadata': None,
    'complete': None,
}

# Step order
STEP_ORDER: List[WalkthroughStep] = [
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
]


def get_next_step(current: WalkthroughStep) -> WalkthroughStep:
    """Get the next step in the walkthrough"""
    if current == 'idle':
        return 'step1-horizontal'
    if current == 'complete':
        return 'complete'
    
    try:
        idx = STEP_ORDER.index(current)
        if idx < len(STEP_ORDER) - 1:
            return STEP_ORDER[idx + 1]
    except ValueError:
        pass
    
    return 'complete'


def get_previous_step(current: WalkthroughStep) -> WalkthroughStep:
    """Get the previous step in the walkthrough"""
    if current in ('idle', 'step1-horizontal'):
        return 'step1-horizontal'
    
    try:
        idx = STEP_ORDER.index(current)
        if idx > 0:
            return STEP_ORDER[idx - 1]
    except ValueError:
        pass
    
    return 'step1-horizontal'