# Blankslate

A universal HID tablet configuration toolkit focused on reading raw HID packets from drawing tablets. Supports Node.js, Python, and WebHID.

**Scope:** Blankslate reads HID (Human Interface Device) data directly—not OS-level keyboard events.

📖 **[View Full Documentation](https://bengfarrell.github.io/blankslate/)**

---

## Installation

### As a Git Dependency

Blankslate is designed to be consumed as a git dependency, not published to npm/PyPI.

**NPM/Node.js:**
```json
{
  "dependencies": {
    "blankslate": "git+https://github.com/bengfarrell/blankslate.git"
  }
}
```

Or with a specific version tag:
```json
{
  "dependencies": {
    "blankslate": "git+https://github.com/bengfarrell/blankslate.git#v1.0.0"
  }
}
```

**Python (requirements.txt):**
```txt
git+https://github.com/bengfarrell/blankslate.git
```

Or with a specific version tag:
```txt
git+https://github.com/bengfarrell/blankslate.git@v1.0.0
```

**Python (pyproject.toml):**
```toml
[project]
dependencies = [
    "blankslate @ git+https://github.com/bengfarrell/blankslate.git"
]
```

The package will automatically build when installed via git.

---

## Documentation Index

### Getting Started
- [Getting Started](docs-src/about/getting-started.md) - Installation and first steps

### Configuration
- [Configuration Modes](docs-src/about/config-modes.md) - Driver vs driverless modes
- [Configuration Schema](docs-src/about/config-schema.md) - JSON config file format

### CLI Tools
- [CLI Overview](docs-src/about/cli-overview.md) - Available command-line tools
- [Node.js CLI](docs-src/about/cli-node.md) - Node.js CLI usage
- [Python CLI](docs-src/about/cli-python.md) - Python CLI usage

### Web Application
- [Web App](docs-src/about/web-app.md) - Browser-based tablet viewer

### Development
- [Node.js Setup](docs-src/about/dev-node.md) - Node.js development environment
- [Python Setup](docs-src/about/dev-python.md) - Python development environment
- [Web Development](docs-src/about/dev-web.md) - Web app development
- [Using as a Library](docs-src/about/sharing-code.md) - Import Blankslate in your projects
- [Testing](docs-src/about/testing.md) - Test suites and coverage

### Technical Reference
- [HID Reading](docs-src/about/hid-reading.md) - How HID data is read and processed
- [Implementation Differences](docs-src/about/implementation-differences.md) - Platform-specific details
- [Keyboard HID Interface](docs-src/about/keyboard-input.md) - Tablets that use keyboard HID for buttons
- [Limitations](docs-src/about/limitations.md) - Known limitations and workarounds
