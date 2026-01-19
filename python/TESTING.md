# Python Testing Guide

This package includes comprehensive unit tests using `pytest`.

## Quick Start

```bash
# Install with dev dependencies
pip install -e ".[dev]"

# Run all tests
pytest

# Run with coverage
pytest --cov=thelearningtablet --cov-report=html

# Use the test runner script
./run_tests.sh
```

## Test Structure

```
tests/
├── conftest.py              # Shared fixtures
├── fixtures/                # Test data files
│   └── test-tablet-config.json
├── unit/                    # Unit tests
│   ├── test_config.py       # Config model tests
│   ├── test_data_helpers.py # Data parsing tests
│   └── test_byte_detector.py # Byte detection tests
└── README.md
```

## What's Tested

### ✅ test_data_helpers.py
- `parse_code()` - Status code parsing
- `parse_range_data()` - Single-byte range normalization
- `parse_multi_byte_range_data()` - Multi-byte coordinate parsing
- `parse_bipolar_range_data()` - Tilt data parsing
- `parse_bit_flags()` - Button state parsing

### ✅ test_config.py
- Config creation from dictionary
- Config serialization (JSON)
- Config deserialization (JSON)
- File loading and saving
- Nested property access

### ✅ test_byte_detector.py
- Byte analysis across packets
- Variance-based byte detection
- Multi-byte max calculation
- Bipolar range calculation
- Status byte detection

## Running Specific Tests

```bash
# Run a specific test file
pytest tests/unit/test_config.py

# Run a specific test class
pytest tests/unit/test_config.py::TestConfigCreation

# Run a specific test
pytest tests/unit/test_config.py::TestConfigCreation::test_create_from_dict

# Run tests matching a pattern
pytest -k "config"

# Run with verbose output
pytest -v

# Run with extra verbose output (show all test names)
pytest -vv
```

## Coverage

After running tests with coverage, open the HTML report:

```bash
pytest --cov=thelearningtablet --cov-report=html
open htmlcov/index.html  # macOS
xdg-open htmlcov/index.html  # Linux
```

**Current Coverage Target**: 80%+ for core modules

## Writing New Tests

### Basic Test Structure

```python
class TestFeatureName:
    """Tests for specific feature"""
    
    def test_specific_behavior(self):
        """Should do something specific"""
        # Arrange
        data = setup_test_data()
        
        # Act
        result = function_under_test(data)
        
        # Assert
        assert result == expected_value
```

### Using Fixtures

Fixtures are defined in `conftest.py` and automatically available:

```python
def test_with_fixture(sample_config_dict):
    """Fixtures are automatically injected by pytest"""
    config = Config.from_dict(sample_config_dict)
    assert config.name == 'Test Tablet'
```

### Parametrized Tests

Test multiple cases with one test function:

```python
@pytest.mark.parametrize("input,expected", [
    (0, 0.0),
    (128, 0.502),
    (255, 1.0),
])
def test_normalize_values(input, expected):
    result = parse_range_data(bytes([0, input, 0]), 1, 0, 255)
    assert abs(result - expected) < 0.01
```

### Testing Exceptions

```python
def test_raises_error():
    """Should raise ValueError for invalid input"""
    with pytest.raises(ValueError):
        Config.from_dict({})  # Missing required fields
```

## Continuous Integration

These tests are designed to run in CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run tests
  run: |
    cd python
    pip install -e ".[dev]"
    pytest --cov=thelearningtablet --cov-report=xml
```

## Comparison with TypeScript Tests

The Python tests mirror the TypeScript/Vitest tests:

| TypeScript (Vitest) | Python (pytest) |
|---------------------|-----------------|
| `describe()` | `class Test...` |
| `it()` | `def test_...()` |
| `expect().toBe()` | `assert ... ==` |
| `expect().toBeCloseTo()` | `assert abs(... - ...) < 0.01` |
| `beforeEach()` | `@pytest.fixture` |

## Tips

1. **Run tests frequently** - Use `pytest --watch` or `pytest-watch` for auto-running
2. **Write descriptive test names** - Use `test_should_do_something_when_condition`
3. **One assertion per test** - Makes failures easier to diagnose
4. **Use fixtures** - Share setup code across tests
5. **Test edge cases** - Empty inputs, boundary values, invalid data

## Troubleshooting

### Import Errors

If you get import errors, make sure the package is installed in development mode:

```bash
pip install -e .
```

### Missing Dependencies

Install dev dependencies:

```bash
pip install -e ".[dev]"
```

### Tests Not Found

Make sure test files start with `test_` and test functions start with `test_`:

```python
# ✅ Good
def test_something():
    pass

# ❌ Bad - won't be discovered
def check_something():
    pass
```
