# Python Development Setup

Complete guide for setting up and running the Python package in this project.

## Prerequisites

- Python 3.8 or higher
- pip (comes with Python)

Check your Python version:
```bash
python3 --version
```

## Initial Setup

### 1. Create Virtual Environment

A virtual environment isolates Python dependencies for this project.

```bash
# Navigate to the python directory
cd python

# Create virtual environment
python3 -m venv venv

# Activate the virtual environment
# On macOS/Linux:
source venv/bin/activate

# On Windows:
venv\Scripts\activate
```

You'll see `(venv)` in your terminal prompt when activated.

### 2. Install the Package

```bash
# Install in development mode with all dependencies
pip install -e ".[dev,websocket,keyboard]"

# Or just the basics:
pip install -e .
```

**What this does:**
- `-e` = "editable" mode - changes to code are immediately available
- `.[dev]` = installs the package + development tools (pytest, black, mypy, ruff)
- `.[websocket]` = adds WebSocket server support
- `.[keyboard]` = adds keyboard automation support

### 3. Verify Installation

```bash
# Check CLI tools are available
tablet-config --help
tablet-events --help
tablet-websocket --help

# Test Python imports
python -c "from blankslate import Config, HIDReader; print('✅ Import successful!')"
```

## Daily Workflow

### Activating the Environment

**Every time** you open a new terminal to work on this project:

```bash
cd python
source venv/bin/activate  # macOS/Linux
# or
venv\Scripts\activate     # Windows
```

### Deactivating

When you're done working:

```bash
deactivate
```

## Running Tests

```bash
# Make sure venv is activated
source venv/bin/activate

# Run all tests
pytest

# Run with coverage
pytest --cov=blankslate --cov-report=html

# Run specific test file
pytest tests/unit/test_config.py

# Run with verbose output
pytest -v

# Use the test runner script
./run_tests.sh
```

View coverage report:
```bash
open htmlcov/index.html  # macOS
```

## Using the CLI Tools

### tablet-config

View and validate tablet configuration files:

```bash
# View a config file
tablet-config ../configs/wacom-intuos-s.json

# Validate a config
tablet-config ../configs/wacom-intuos-s.json --validate

# List all configs
tablet-config --list
```

### tablet-events

Monitor HID events from a tablet:

```bash
# List available devices
tablet-events --list

# Monitor a specific device
tablet-events --vendor-id 0x28bd --product-id 0x0914

# Use a config file
tablet-events --config ../configs/wacom-intuos-s.json

# Output as JSON
tablet-events --config ../configs/wacom-intuos-s.json --format json
```

**Note for WebStorm users:** If Ctrl+C doesn't work when running as a module (`python -m blankslate.cli.event_viewer`), use the direct script wrapper instead:

```bash
# Run as direct script (Ctrl+C works in WebStorm)
python view_events.py -c my-tablet-config.json

# With options
python view_events.py -c my-tablet-config.json --mock
python view_events.py -c my-tablet-config.json --live
python view_events.py -c my-tablet-config.json --compact
```

The `view_events.py` script is a thin wrapper that calls the same module code but runs as a direct script, which allows Ctrl+C to work properly in IDE terminals.

### tablet-websocket

Run a WebSocket server for tablet events:

```bash
# Start server on default port (8765)
tablet-websocket --config ../configs/wacom-intuos-s.json

# Custom port
tablet-websocket --config ../configs/wacom-intuos-s.json --port 9000

# With verbose logging
tablet-websocket --config ../configs/wacom-intuos-s.json --verbose
```

## Development Tools

### Code Formatting

```bash
# Format code with black
black blankslate tests

# Check formatting without changes
black --check blankslate tests
```

### Linting

```bash
# Run ruff linter
ruff check blankslate tests

# Auto-fix issues
ruff check --fix blankslate tests
```

### Type Checking

```bash
# Run mypy type checker
mypy blankslate
```

### Run All Checks

```bash
# Format, lint, type check, and test
black blankslate tests && \
ruff check blankslate tests && \
mypy blankslate && \
pytest
```

## Using as a Library

### In Python Scripts

```python
#!/usr/bin/env python3
from blankslate import Config, HIDReader, parse_multi_byte_range_data

# Load a tablet configuration
config = Config.load('../configs/wacom-intuos-s.json')
print(f"Loaded config for {config.name}")

# Create HID reader
reader = HIDReader(config)

# Process HID data
def on_event(event):
    print(f"X: {event.x}, Y: {event.y}, Pressure: {event.pressure}")

reader.on_event = on_event
reader.start()
```

### In Other Python Projects

If you want to use this package in another project:

```bash
# Install from local directory
pip install /path/to/blankslate/python

# Or install in editable mode
pip install -e /path/to/blankslate/python
```

## Troubleshooting

### "Command not found" errors

Make sure the virtual environment is activated:
```bash
source venv/bin/activate
```

### Import errors

Reinstall the package:
```bash
pip install -e ".[dev]"
```

### Permission errors on macOS

The HID tools need permission to access USB devices. Grant permission when prompted.

### Tests failing

Make sure dev dependencies are installed:
```bash
pip install -e ".[dev]"
```

### Ctrl+C doesn't work in WebStorm

Use the direct script wrapper instead of the module:
```bash
# Instead of: python -m blankslate.cli.event_viewer
# Use:
python view_events.py -c my-tablet-config.json
```

### Device won't open / "open failed" error

A stuck process or the tablet driver may be holding the device. Kill all tablet processes:
```bash
./kill_tablet_processes.sh
```

This script will:
- Find all Python tablet processes (including stopped/suspended ones)
- Find and kill the XTouch driver if running
- Verify processes are killed
- Free the device for use

If you accidentally suspended a process with Ctrl+Z, this script will clean it up.

## Project Structure

```
python/
├── venv/                    # Virtual environment (git-ignored)
├── blankslate/       # Source code
│   ├── __init__.py
│   ├── models/              # Data models
│   ├── core/                # Core functionality
│   └── cli/                 # CLI tools
├── tests/                   # Test suite
│   ├── conftest.py
│   ├── fixtures/
│   └── unit/
├── pyproject.toml           # Package configuration
├── pytest.ini               # Test configuration
├── run_tests.sh             # Test runner
└── TESTING.md               # Testing guide
```

## Quick Reference

```bash
# Setup (once)
cd python
python3 -m venv venv
source venv/bin/activate
pip install -e ".[dev,websocket,keyboard]"

# Daily workflow
cd python
source venv/bin/activate

# Run tests
pytest

# Run event viewer (WebStorm-friendly)
python view_events.py -c my-tablet-config.json

# Kill stuck processes
./kill_tablet_processes.sh

# Run CLI tool
tablet-config --help

# When done
deactivate
```

## IDE Setup

### VS Code

Install the Python extension, then VS Code will automatically detect the venv.

Create `.vscode/settings.json`:
```json
{
  "python.defaultInterpreterPath": "${workspaceFolder}/python/venv/bin/python",
  "python.testing.pytestEnabled": true,
  "python.testing.pytestArgs": ["tests"],
  "python.formatting.provider": "black",
  "python.linting.enabled": true,
  "python.linting.ruffEnabled": true
}
```

### PyCharm / WebStorm

1. Open Settings → Project → Python Interpreter
2. Click the gear icon → Add
3. Select "Existing environment"
4. Browse to `python/venv/bin/python`

## CI/CD Integration

Example GitHub Actions workflow:

```yaml
name: Python Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: |
          cd python
          pip install -e ".[dev]"
      - name: Run tests
        run: |
          cd python
          pytest --cov=blankslate --cov-report=xml
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Next Steps

1. ✅ Set up virtual environment
2. ✅ Install package in dev mode
3. ✅ Run tests to verify setup
4. 🔨 Start developing!

See also:
- [TESTING.md](TESTING.md) - Comprehensive testing guide
- [tests/README.md](tests/README.md) - Test structure
- [pyproject.toml](pyproject.toml) - Package configuration