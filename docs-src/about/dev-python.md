---
layout: page.njk
title: Python Development
description: Setting up Python development environment
---

# Python Development Setup

Complete guide for setting up the Python development environment.

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
tablet-config-generator --help
tablet-events --help
tablet-websocket --help

# Test Python imports
python -c "from blankslate.models import Config; print('✅ Import successful!')"
```

---

## Project Structure

```
python/
├── venv/                    # Virtual environment (gitignored)
├── blankslate/              # Source code
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
└── run_tests.sh             # Test runner
```

---

## Daily Workflow

### Activating the Environment

**Every time** you open a new terminal:

```bash
cd python
source venv/bin/activate  # macOS/Linux
# or
venv\Scripts\activate     # Windows
```

### Deactivating

When you're done:

```bash
deactivate
```

---

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

---

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

---

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

```bash
# Install from local directory
pip install /path/to/blankslate/python

# Or install in editable mode
pip install -e /path/to/blankslate/python
```

---

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

---

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

### Ctrl+C doesn't work in IDE

Use the direct script wrapper instead of the module:
```bash
# Instead of: python -m blankslate.cli.event_viewer
# Use:
python view_events.py -c my-config.json
```

### Device won't open / "open failed" error

A stuck process or the tablet driver may be holding the device:
```bash
./kill_tablet_processes.sh
```

---

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

# Run event viewer
python view_events.py -c my-config.json

# When done
deactivate
```
