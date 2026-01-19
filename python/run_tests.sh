#!/bin/bash
# Test runner script for Python package

set -e

echo "🧪 Running Python Tests"
echo "======================="
echo

# Check if pytest is installed
if ! python3 -m pytest --version > /dev/null 2>&1; then
    echo "❌ pytest not found. Installing dev dependencies..."
    pip install -e ".[dev]"
    echo
fi

# Run tests with coverage
echo "Running tests with coverage..."
python3 -m pytest -v --cov=blankslate --cov-report=term-missing --cov-report=html

echo
echo "✅ Tests complete!"
echo
echo "📊 Coverage report generated in htmlcov/index.html"
