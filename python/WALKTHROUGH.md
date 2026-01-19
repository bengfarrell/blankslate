# Python Walkthrough Implementation

## Overview

The Python walkthrough is a complete port of the Node.js/TypeScript interactive configuration generator. It guides users through detecting their tablet's HID byte mappings by performing various gestures.

## Architecture

The walkthrough follows a clean MVC-like architecture with three main layers:

### 1. Engine Layer (Core Logic)
- **`walkthrough_engine.py`** - State machine and byte detection logic
- **`walkthrough_types.py`** - Type definitions and step information
- **`byte_detector.py`** - Byte analysis and detection algorithms

### 2. Controller Layer (Orchestration)
- **`walkthrough_controller.py`** - Coordinates engine, view, and data sources
- **`hid_reader_factory.py`** - Creates real or mock HID readers

### 3. View Layer (UI)
- **`cli_walkthrough_view.py`** - Terminal-based UI with inquirer prompts
- **`config_generator.py`** - Main CLI entry point

### 4. Data Layer
- **`tablet_data_generator.py`** - Generates realistic HID packets for testing
- **`mock_hid_reader.py`** - Simulates tablet device for walkthrough testing

## Walkthrough Steps

The walkthrough consists of 10 steps:

1. **Horizontal Movement** - Detect X coordinate bytes
2. **Vertical Movement** - Detect Y coordinate bytes  
3. **Pressure Variation** - Detect pressure bytes
4. **Hover Movement** - Verify hover detection
5. **Tilt X** - Detect X-axis tilt bytes
6. **Tilt Y** - Detect Y-axis tilt bytes
7. **Primary Button** - Detect primary stylus button
8. **Secondary Button** - Detect secondary stylus button
9. **Tablet Buttons** - Detect tablet express keys
10. **Device Metadata** - Collect device information

## Usage

### Interactive Mode

```bash
# With real tablet device
cd python
source venv/bin/activate
tablet-config-generator

# With mock device (for testing)
tablet-config-generator --mock
```

### Programmatic Usage

```python
import asyncio
from thelearningtablet.core import (
    WalkthroughController,
    WalkthroughControllerOptions,
    HIDReaderFactory
)
from thelearningtablet.cli import CLIWalkthroughView

async def run_walkthrough():
    view = CLIWalkthroughView()
    factory = HIDReaderFactory()
    
    controller = WalkthroughController(
        view,
        factory,
        WalkthroughControllerOptions(
            auto_play_mock_gestures=True,
            gesture_play_duration=2000
        )
    )
    
    await controller.run(force_mock=True)

asyncio.run(run_walkthrough())
```

## Testing

### Unit Tests

Run the existing unit tests:

```bash
cd python
source venv/bin/activate
pytest
```

### Integration Test

Run the walkthrough integration test:

```bash
cd python
source venv/bin/activate
python test_walkthrough.py
```

This test:
- Creates a walkthrough engine
- Simulates horizontal and vertical gestures
- Detects byte mappings
- Generates a configuration

## Key Features

### 1. Byte Detection

The engine automatically detects which bytes represent different tablet features:

- **Variance Analysis** - Identifies bytes that change during gestures
- **Consecutive Pair Detection** - Finds multi-byte values (coordinates, pressure)
- **Exclusion Filtering** - Prevents re-detecting already-found bytes
- **Status Byte Tracking** - Maps status codes to device states

### 2. Mock Data Generation

The mock tablet generator creates realistic HID packets:

```python
from thelearningtablet.mockbytes import TabletDataGenerator

generator = TabletDataGenerator()

# Generate horizontal line
packets = generator.generate_line_constant_pressure(
    start_x=0, start_y=0.5,
    end_x=1, end_y=0.5,
    pressure=0.5,
    duration=1500
)

for packet in packets:
    print(packet.hex())
```

### 3. Gesture Playback

The mock reader can play back gestures automatically:

```python
from thelearningtablet.mockbytes import create_mock_hid_reader

reader = create_mock_hid_reader()
reader.start_reading(lambda packet: print(packet.hex()))

# Play horizontal drag
await reader.play_horizontal_drag(duration=1500)

# Play circle
await reader.play_circle(center_x=0.5, center_y=0.5, radius=0.3)
```

### 4. Configuration Generation

The engine generates complete device configurations:

```python
engine = WalkthroughEngine()

# ... perform walkthrough steps ...

config = engine.get_complete_config()
# Returns:
# {
#   "name": "My Tablet",
#   "manufacturer": "Wacom",
#   "model": "Intuos S",
#   "vendorId": "0x056a",
#   "productId": "0x0374",
#   "byteCodeMappings": {
#     "x": {"byteIndex": [1, 2], "max": 15200, "type": "multi-byte-range"},
#     "y": {"byteIndex": [3, 4], "max": 9500, "type": "multi-byte-range"},
#     "pressure": {"byteIndex": [5, 6], "max": 8191, "type": "multi-byte-range"},
#     ...
#   }
# }
```

## File Structure

```
python/
├── thelearningtablet/
│   ├── core/
│   │   ├── walkthrough_types.py       # Type definitions
│   │   ├── walkthrough_engine.py      # Core state machine
│   │   ├── walkthrough_controller.py  # Orchestration
│   │   ├── hid_reader_factory.py      # Reader factory
│   │   └── byte_detector.py           # Byte analysis
│   ├── mockbytes/
│   │   ├── tablet_data_generator.py   # Packet generation
│   │   └── mock_hid_reader.py         # Mock device
│   └── cli/
│       ├── cli_walkthrough_view.py    # Terminal UI
│       └── config_generator.py        # CLI entry point
├── test_walkthrough.py                # Integration test
└── WALKTHROUGH.md                     # This file
```

## Comparison with Node.js Version

The Python implementation is a **complete port** of the Node.js version with:

✅ **Same Architecture** - Engine/Controller/View separation  
✅ **Same Steps** - All 10 walkthrough steps  
✅ **Same Detection Logic** - Byte analysis algorithms  
✅ **Same Mock Data** - Realistic packet generation  
✅ **Same Configuration Output** - Compatible JSON format  

### Differences

- **UI Library**: Uses `inquirer` (Python) instead of `inquirer` (Node.js)
- **Async**: Uses `asyncio` instead of Promises
- **Type System**: Uses type hints instead of TypeScript
- **Entry Point**: `tablet-config-generator` instead of `npm run config`

## Extending the Walkthrough

### Adding a New Step

1. Add step to `STEP_ORDER` in `walkthrough_types.py`
2. Add step info to `STEP_INFO` dictionary
3. Add detection logic in `_detect_bytes_for_step()` in `walkthrough_engine.py`
4. Add gesture to mock reader if needed

### Creating a Custom View

Implement the `IWalkthroughView` protocol:

```python
class CustomView:
    def show_header(self): ...
    async def prompt_data_source(self) -> DataSource: ...
    def show_step_info(self, step_info: StepInfo): ...
    # ... implement all required methods
```

### Using Real HID Devices

The factory automatically detects and lists HID devices:

```python
factory = HIDReaderFactory()
devices = await factory.list_devices()

for device in devices:
    print(f"{device.product_string} - VID: 0x{device.vendor_id:04x}")
```

## Troubleshooting

### No Devices Found

Make sure `hidapi` is installed:

```bash
pip install hidapi
```

On Linux, you may need udev rules for device access.

### Import Errors

Reinstall the package in editable mode:

```bash
cd python
pip install -e .
```

### Mock Gestures Not Playing

Ensure you're using `await` with async gesture methods:

```python
await reader.play_horizontal_drag()  # ✓ Correct
reader.play_horizontal_drag()        # ✗ Wrong
```

## Future Enhancements

Potential improvements:

- [ ] GUI walkthrough view (PyQt/Tkinter)
- [ ] Web-based walkthrough (Flask/FastAPI)
- [ ] Advanced button detection (bit pattern analysis)
- [ ] Multi-interface device support
- [ ] Configuration validation and testing
- [ ] Export to multiple formats (JSON, YAML, TOML)

## Contributing

When contributing to the walkthrough:

1. Maintain parity with Node.js version
2. Add tests for new features
3. Update this documentation
4. Follow existing code style

## License

Same as the main project.
