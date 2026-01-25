---
layout: page.njk
title: Node.js Development
description: Setting up Node.js development environment
---

# Node.js Development Setup

Complete guide for setting up the Node.js development environment.

## Prerequisites

- Node.js 18+ and npm
- Git

Check your Node.js version:
```bash
node --version  # Should be 18.x or higher
```

## Initial Setup

### 1. Clone the Repository

```bash
git clone https://github.com/bengfarrell/blankslate.git
cd blankslate
```

### 2. Install Dependencies

```bash
npm install
```

This installs:
- **Vite** - Dev server and bundler
- **LitElement** - Web components
- **Vitest** - Unit testing
- **Playwright** - Integration testing
- **node-hid** - HID device access
- **TypeScript** - Type safety

### 3. Verify Installation

```bash
# Run unit tests
npm test

# Start dev server
npm run dev
```

---

## Project Structure

```
blankslate/
├── src/
│   ├── cli/                 # CLI tools (Node.js)
│   ├── components/          # Web components (LitElement)
│   ├── core/                # Shared walkthrough engine
│   │   ├── hid/             # HID interfaces
│   │   └── walkthrough/     # Walkthrough state machine
│   ├── utils/               # Utility modules
│   ├── models/              # Data models
│   ├── mockbytes/           # Mock tablet simulation
│   └── index.ts             # Public API exports
├── test/
│   ├── unit/                # Vitest unit tests
│   └── integration/         # Playwright tests
├── public/
│   └── configs/             # Sample tablet configs
├── dist/                    # Build output (gitignored)
└── docs/                    # Documentation output
```

---

## Development Workflow

### Running the Dev Server

```bash
npm run dev
```

This starts Vite on port 3000 with:
- Hot module replacement (HMR)
- Fast refresh
- Source maps
- Auto-open browser

### Running CLI Tools

```bash
# Config generator
npm run config

# Event viewer
npm run events -- -c public/configs/xp-pen-deco640.json --live

# WebSocket server
npm run websocket -- -c public/configs/xp-pen-deco640.json

# Interface diagnostic
npm run diagnose
```

### Building

```bash
# Build everything
npm run build

# Build CLI only
npm run build:cli

# Clean build artifacts
npm run clean
```

---

## Testing

### Unit Tests (Vitest)

```bash
# Run once
npm test

# Watch mode
npm run test:watch

# With UI
npm run test:ui

# With coverage
npm run test:coverage
```

### Integration Tests (Playwright)

First-time setup:
```bash
npx playwright install
```

Run tests:
```bash
npm run test:integration

# With UI
npm run test:integration:ui
```

---

## Code Quality

### Linting

```bash
npm run lint
```

### Formatting

```bash
npm run format
```

---

## TypeScript Configuration

The project uses multiple TypeScript configs:

| Config | Purpose |
|--------|---------|
| `tsconfig.json` | Development (includes tests) |
| `tsconfig.build.json` | Production build (src only) |
| `tsconfig.cli.json` | CLI tools (Node.js target) |

---

## Common Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm test` | Run unit tests |
| `npm run test:ui` | Open Vitest UI |
| `npm run test:coverage` | Generate coverage report |
| `npm run test:integration` | Run Playwright tests |
| `npm run build` | Build for production |
| `npm run build:cli` | Build CLI tools |
| `npm run lint` | Check TypeScript |
| `npm run format` | Format code |
| `npm run config` | Run config generator |
| `npm run events` | Run event viewer |
| `npm run websocket` | Run WebSocket server |

---

## IDE Setup

### VS Code

Recommended extensions:
- ESLint
- Prettier
- Lit Plugin

Create `.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

### WebStorm

1. Enable ESLint: Settings → Languages & Frameworks → JavaScript → Code Quality Tools → ESLint
2. Enable Prettier: Settings → Languages & Frameworks → JavaScript → Prettier
3. Set TypeScript version: Settings → Languages & Frameworks → TypeScript → Use TypeScript from node_modules

---

## Troubleshooting

### "Cannot find module" errors

```bash
npm install
```

### HID device not found

- Ensure the tablet is connected
- Check that no other application has exclusive access
- On macOS, grant terminal permission to access USB devices

### Tests failing

```bash
# Clear test cache
npm run test -- --clearCache

# Reinstall dependencies
rm -rf node_modules
npm install
```
