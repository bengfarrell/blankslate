#!/bin/bash
# Setup script for Python virtual environment

set -e

echo "🐍 Python Virtual Environment Setup"
echo "===================================="
echo

# Check Python version
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Please install Python 3.8 or higher."
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
echo "✅ Found Python $PYTHON_VERSION"
echo

# Create virtual environment
if [ -d "venv" ]; then
    echo "⚠️  Virtual environment already exists."
    read -p "Do you want to recreate it? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🗑️  Removing old virtual environment..."
        rm -rf venv
    else
        echo "Using existing virtual environment."
        source venv/bin/activate
        pip install -e ".[dev,websocket,keyboard]"
        echo
        echo "✅ Setup complete!"
        exit 0
    fi
fi

echo "📦 Creating virtual environment..."
python3 -m venv venv

echo "🔌 Activating virtual environment..."
source venv/bin/activate

echo "⬆️  Upgrading pip..."
pip install --upgrade pip

echo "📥 Installing package with all dependencies..."
pip install -e ".[dev,websocket,keyboard]"

echo
echo "✅ Setup complete!"
echo
echo "📋 Next steps:"
echo "  1. Activate the environment:"
echo "     source venv/bin/activate"
echo
echo "  2. Run tests:"
echo "     pytest"
echo
echo "  3. Try CLI tools:"
echo "     tablet-config --help"
echo
echo "  4. When done, deactivate:"
echo "     deactivate"
echo
