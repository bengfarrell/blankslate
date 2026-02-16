---
layout: page.njk
title: Testing
---

# Testing

Blankslate has comprehensive test suites for both Node.js/TypeScript and Python implementations, ensuring feature parity and reliability across platforms.

## Test Summary

| Platform | Tests | Test Files | Framework |
|----------|-------|------------|-----------|
| **Node.js/TypeScript** | 613+ | 24 | Vitest |
| **Python** | 295 | 10 | pytest |
| **Total** | **900+** | **34** | - |

---

## Running Tests

### Node.js/TypeScript

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- test/unit/config.test.ts

# Run tests matching a pattern
npm test -- --grep "walkthrough"

# Watch mode for development
npm run test:watch
```

### Python

```bash
# Activate virtual environment first
cd python
source venv/bin/activate

# Run all tests
pytest

# Run with coverage
pytest --cov=blankslate --cov-report=html

# Run specific test file
pytest tests/unit/test_config.py

# Run specific test class or method
pytest tests/unit/test_config.py::TestConfigCreation::test_create_from_dict

# Run with verbose output
pytest -v

# Run only unit tests
pytest tests/unit/

# Run only integration tests
pytest tests/integration/
```

---

## Test Categories

### Unit Tests

Unit tests verify individual functions and classes in isolation.

#### Node.js (`test/unit/`)

| Test File | Tests | Description |
|-----------|-------|-------------|
| `data-helpers.test.ts` | 40 | Data processing utilities, byte parsing, normalization |
| `finddevice.test.ts` | 28 | Device discovery, WebHID integration, connection handling |
| `config.test.ts` | 13 | Configuration loading, validation, serialization |
| `config-based-mock.test.ts` | 18 | Mock tablet data generation from configs |
| `byte-detector.test.ts` | 14 | Byte analysis, status byte detection, variance calculation |
| `metadata-generator.test.ts` | 10 | Device metadata generation, capability inference |
| `walkthrough-detection.test.ts` | 9 | Core byte detection for walkthrough steps |
| `walkthrough-button-status.test.ts` | 12 | Status byte tracking for XP-Pen and Huion tablets |
| `device-switching.test.ts` | 8 | Multi-device handling, active device tracking |
| `translation-*.test.ts` | 20 | Data translation and edge cases |

#### Python (`python/tests/unit/`)

| Test File | Tests | Description |
|-----------|-------|-------------|
| `test_data_helpers.py` | 40+ | Data processing, byte parsing (mirrors Node.js) |
| `test_config.py` | 15+ | Configuration loading and validation |
| `test_config_based_mock.py` | 18 | Mock tablet data generation |
| `test_byte_detector.py` | 14 | Byte analysis algorithms |
| `test_walkthrough_engine.py` | 20+ | Walkthrough engine logic |
| `test_config_auto_detection.py` | 5 | Auto-detection of tablet configs |

### Integration Tests

Integration tests verify complete workflows using recorded HID data.

#### Recording Replay Tests

These tests replay recorded HID packets through the walkthrough engine to verify correct configuration generation.

| Test File | Tests | Description |
|-----------|-------|-------------|
| `recording-replay.test.ts` | 92 | XP-Pen Deco 640 driverless mode recordings |
| `recording-replay-driver.test.ts` | 94 | XP-Pen Deco 640 driver mode recordings |
| `recording-replay-huion.test.ts` | 60 | Huion Inspiroy 2M recordings |
| `test_recording_replay.py` | 57 | Python equivalents of above |

#### Recording Reader Tests

These tests verify that `processDeviceData` correctly interprets recorded HID packets using existing configurations.

| Test File | Tests | Description |
|-----------|-------|-------------|
| `recording-reader-huion.test.ts` | 80 | Huion packet interpretation (40 tests × 2 recordings) |
| `test_recording_reader.py` | 80 | Python equivalent |

**Test categories include:**
- Status byte interpretation (hover, contact, button states)
- Coordinate parsing (X, Y, little-endian verification)
- Pressure parsing and normalization
- Tilt parsing (bipolar encoding)
- State transitions (hover→contact, button press/release)
- Raw byte verification

#### Config Validation Tests

| Test File | Tests | Description |
|-----------|-------|-------------|
| `stable-config-validation.test.ts` | 5 | Validates existing config files load correctly |
| `driver-mode-config-validation.test.ts` | 6 | Validates driver-mode specific configs |
| `test_stable_config_validation.py` | 5 | Python equivalents |
| `test_driver_mode_config_validation.py` | 6 | Python equivalents |

---

## Test Fixtures

### Common Test Fixtures (`common-test-fixtures/`)

Shared test data used by both Node.js and Python tests:

| File | Description |
|------|-------------|
| `xp-pen-deco640-driver.json` | XP-Pen Deco 640 config (driver mode) |
| `xp-pen-deco640-driverless.json` | XP-Pen Deco 640 config (driverless mode) |
| `huion-inspiroy2m.json` | Huion Inspiroy 2M config |
| `xp-pen-deco640-nodriver-recording.json` | Recorded HID packets (XP-Pen, no driver) |
| `xp-pen-deco640-nodriver-recording2.json` | Second recording session |
| `xp-pen-deco640-driver-recording.json` | Recorded HID packets (XP-Pen, with driver) |
| `xp-pen-deco640-driver-recording2.json` | Second recording session |
| `huion-inspiroy2m-nodriver-recording.json` | Recorded HID packets (Huion) |
| `huion-inspiroy2m-nodriver-recording2.json` | Second recording session |

### Recording Format

Recording files contain captured HID packets organized by walkthrough step:

```json
{
  "metadata": {
    "deviceName": "XP-Pen Deco 640",
    "recordedAt": "2024-01-15T10:30:00Z",
    "driverMode": false
  },
  "steps": {
    "step1-horizontal": {
      "packets": [[2, 160, 100, 50, ...], [2, 160, 110, 50, ...], ...]
    },
    "step2-vertical": {
      "packets": [...]
    },
    ...
  }
}
```

---

## Writing Tests

### Test Structure (Node.js)

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('FeatureName', () => {
  let instance: MyClass;

  beforeEach(() => {
    instance = new MyClass();
  });

  describe('methodName', () => {
    it('should do something specific', () => {
      // Arrange
      const input = setupTestData();

      // Act
      const result = instance.methodName(input);

      // Assert
      expect(result).toBe(expectedValue);
    });
  });
});
```

### Test Structure (Python)

```python
import pytest
from blankslate.core import MyClass

class TestFeatureName:
    """Tests for specific feature"""

    @pytest.fixture
    def instance(self):
        return MyClass()

    def test_specific_behavior(self, instance):
        """Should do something specific"""
        # Arrange
        input_data = setup_test_data()

        # Act
        result = instance.method_name(input_data)

        # Assert
        assert result == expected_value
```

### Parametrized Tests

For testing multiple inputs with the same logic:

**Node.js:**
```typescript
describe.each([
  ['recording1.json'],
  ['recording2.json'],
])('with %s', (filename) => {
  it('should process correctly', () => {
    const data = loadRecording(filename);
    expect(process(data)).toBeDefined();
  });
});
```

**Python:**
```python
@pytest.mark.parametrize("filename", [
    "recording1.json",
    "recording2.json",
])
def test_process_correctly(self, filename):
    data = load_recording(filename)
    assert process(data) is not None
```

---

## Coverage

### Viewing Coverage Reports

**Node.js:**
```bash
npm run test:coverage
# Open coverage/index.html in browser
```

**Python:**
```bash
pytest --cov=blankslate --cov-report=html
# Open htmlcov/index.html in browser
```

### Coverage Targets

| Module | Target | Current |
|--------|--------|---------|
| Core data processing | 90%+ | ✅ |
| Byte detection | 90%+ | ✅ |
| Configuration loading | 85%+ | ✅ |
| Walkthrough engine | 80%+ | ✅ |
| CLI tools | 50%+ | ⚠️ |
| UI components | 30%+ | ⚠️ |

---

## Continuous Integration

Tests run automatically on:
- Pull requests
- Pushes to main branch
- Release tags

Both Node.js and Python test suites must pass before merging.
