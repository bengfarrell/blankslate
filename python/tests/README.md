# Tests

This directory contains tests for the Python package.

## Structure

```
tests/
├── conftest.py           # Shared pytest fixtures
├── fixtures/             # Test data files
├── unit/                 # Unit tests
│   ├── test_config.py
│   ├── test_data_helpers.py
│   └── test_byte_detector.py
└── integration/          # Integration tests (future)
```

## Running Tests

### Run all tests
```bash
cd python
pytest
```

### Run with coverage
```bash
pytest --cov=thelearningtablet --cov-report=html
```

### Run specific test file
```bash
pytest tests/unit/test_config.py
```

### Run specific test
```bash
pytest tests/unit/test_config.py::TestConfigCreation::test_create_from_dict
```

### Run with verbose output
```bash
pytest -v
```

### Run only unit tests
```bash
pytest -m unit
```

## Writing Tests

Tests use `pytest` framework. Key concepts:

### Test Structure
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
```python
def test_with_fixture(sample_config_dict):
    """Fixtures are automatically injected"""
    config = Config.from_dict(sample_config_dict)
    assert config.name == 'Test Tablet'
```

### Parametrized Tests
```python
@pytest.mark.parametrize("input,expected", [
    (0, 0),
    (128, 0.5),
    (255, 1.0),
])
def test_multiple_cases(input, expected):
    result = normalize(input)
    assert abs(result - expected) < 0.01
```

## Test Coverage

After running tests with coverage, open `htmlcov/index.html` to see detailed coverage report.

Target: 80%+ coverage for core modules.
