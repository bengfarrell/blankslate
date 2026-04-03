# Git Dependency Setup Guide

This document explains how blankslate is configured to work as a git dependency.

## Changes Made

### 1. Added `prepare` Script

In `package.json`:
```json
"scripts": {
  "prepare": "npm run build"
}
```

**What it does:**
- Automatically runs after `npm install` 
- Builds TypeScript → JavaScript in `dist/`
- Runs when installed as a git dependency

### 2. Updated README.md

Added installation instructions for consuming as a git dependency:
- NPM installation examples
- Python pip installation examples
- Version tag examples

### 3. Verified `.gitignore`

Build artifacts (`dist/`, `python/dist/`, etc.) are correctly excluded from version control.

## How It Works

### NPM/Node.js

When someone installs via:
```bash
npm install git+https://github.com/bengfarrell/blankslate.git
```

NPM will:
1. Clone the repository
2. Run `npm install` (installs dependencies)
3. Run `prepare` script (builds the package)
4. Make `dist/` files available

### Python

When someone installs via:
```bash
pip install git+https://github.com/bengfarrell/blankslate.git
```

Pip will:
1. Clone the repository
2. Run setuptools build system
3. Build and install the package from `python/` directory

## Versioning with Git Tags

To create a version:

```bash
# Tag a version
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0

# Consumers can then install specific versions:
npm install git+https://github.com/bengfarrell/blankslate.git#v1.0.0
pip install git+https://github.com/bengfarrell/blankslate.git@v1.0.0
```

## Testing the Setup

### Test NPM Installation

In a test project:
```bash
# Create test package.json
echo '{"dependencies":{"blankslate":"git+https://github.com/bengfarrell/blankslate.git"}}' > package.json

# Install
npm install

# Verify dist exists
ls node_modules/blankslate/dist
```

### Test Python Installation

```bash
# Install
pip install git+https://github.com/bengfarrell/blankslate.git

# Verify import
python -c "from blankslate import Config; print('Success!')"
```

## Benefits

✅ No need to publish to npm/PyPI  
✅ Consumers always get the source code  
✅ Automatic building on install  
✅ Version control via git tags  
✅ Easy to maintain and update  
✅ Perfect for tightly-coupled projects  

## Notes

- Build artifacts are NOT checked into git
- The `prepare` script ensures they're built on demand
- Python uses setuptools which builds automatically
- Both approaches work with monorepos and workspace setups

