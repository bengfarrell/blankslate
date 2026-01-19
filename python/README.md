# The Learning Tablet - Python Tools

Python CLI tools for configuring and testing HID graphics tablets.

## Quick Start (No Installation)

### Generate Tablet Configuration

```bash
# Interactive mode
python generate_config.py

# Mock mode (no physical tablet needed)
python generate_config.py --mock

# Or use shell script
./run_config_gen.sh --mock
```

### View Tablet Events

```bash
# Live dashboard mode
python view_events.py -c ../public/configs/xp-pen-deco640-osx-python-nodriver.json --live

# Mock mode with live dashboard
python view_events.py -c my-tablet-config.json --mock --live

# Or use shell script
./run_viewer.sh
```

## Available Scripts

| Script | Purpose | Example |
|--------|---------|---------|
| `generate_config.py` | Generate tablet config | `python generate_config.py --mock` |
| `view_events.py` | View tablet events | `python view_events.py -c config.json --live` |
| `run_config_gen.sh` | Shell wrapper for config gen | `./run_config_gen.sh --mock` |
| `run_viewer.sh` | Shell wrapper for event viewer | `./run_viewer.sh` |

**Why standalone scripts?**
- Work without installing the package
- Ctrl+C works properly in IDEs like WebStorm
- Easy to run and debug during development

## Setup

### Create Virtual Environment

```bash
./setup_venv.sh
```

Or manually:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -e .
```

### Install Package (Optional)

After installation, you can use the CLI commands:

```bash
pip install -e .

# Then use:
tablet-config --mock
tablet-events -c config.json --live
tablet-websocket -c config.json
```

## Testing

```bash
# Run all tests
./run_tests.sh

# Run specific test file
source venv/bin/activate
pytest tests/unit/test_config_based_mock.py -v
```

## Documentation

- [CLI-Python.md](../projectdocs/CLI-Python.md) - Full CLI documentation
- [WALKTHROUGH.md](WALKTHROUGH.md) - Config generator walkthrough details
- [TESTING.md](TESTING.md) - Testing documentation
- [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) - Implementation status

## Common Tasks

### Generate Config for Your Tablet

```bash
python generate_config.py
# Follow the interactive prompts
# Config will be saved to my-tablet-config.json
```

### Test With Mock Data

```bash
# Generate config with mock device
python generate_config.py --mock

# View events with mock data
python view_events.py -c my-tablet-config.json --mock --live
```

### Debug Byte Mappings

```bash
# View raw bytes alongside events
python view_events.py -c config.json --live --raw
```

## Troubleshooting

### Ctrl+C Not Working

Use the standalone scripts (`generate_config.py`, `view_events.py`) instead of the `-m` module syntax.

### Process Won't Stop

```bash
./kill_tablet_processes.sh
```

### Permission Denied on Scripts

```bash
chmod +x *.sh *.py
```

## Project Structure

```
python/
├── generate_config.py          # Standalone config generator
├── view_events.py              # Standalone event viewer
├── run_config_gen.sh           # Shell wrapper for config gen
├── run_viewer.sh               # Shell wrapper for event viewer
├── thelearningtablet/          # Main package
│   ├── cli/                    # CLI modules
│   ├── core/                   # Core functionality
│   ├── mockbytes/              # Mock data generation
│   ├── models/                 # Data models
│   └── utils/                  # Utilities
└── tests/                      # Test suite
```

