# Quick Start Guide

Get up and running with The Learning Tablet in 3 steps!

## Step 1: Install Dependencies

```bash
npm install
```

This will install all required packages including:
- Vite (dev server and bundler)
- LitElement (web components)
- Vitest (unit testing)
- Playwright (integration testing)

## Step 2: Start the Dev Server

```bash
npm run dev
```

This will:
- Start Vite dev server on port 3000
- Open your browser automatically
- Enable hot module replacement (HMR)

## Step 3: Explore the App

The application will open in your browser showing the **HID Data Reader**:

1. **Connect a Device** - Click "Connect Real Tablet" to pair with a graphics tablet
   - Or use the "Simulate" buttons to test without hardware
   
2. **Follow the Walkthrough** - The app guides you through 10 steps:
   - Horizontal/Vertical movement detection
   - Pressure and tilt detection
   - Button detection
   - Device metadata entry
   
3. **Generate Configuration** - At the end, you'll get a complete JSON config for your tablet

## Running Tests

### Unit Tests (Fast)

```bash
npm test
```

Watch mode will run tests as you edit files.

### Integration Tests (Full Browser)

First time setup:
```bash
npx playwright install
```

Then run tests:
```bash
npm run test:integration
```

## Project Layout

```
src/
├── components/              # UI components
│   ├── hid-data-reader/     # Main HID reader component
│   ├── bytes-display/       # Byte visualization
│   └── drawing-canvas/      # Drawing surface
├── utils/                   # Utility modules
│   ├── hid-reader.ts        # HID data reader
│   ├── finddevice.ts        # Device discovery
│   └── byte-detector.ts     # Byte analysis
├── models/                  # Data models
└── mockbytes/               # Mock tablet simulation

test/
├── unit/                    # Service unit tests
└── integration/             # UI integration tests
```

## Common Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm test` | Run unit tests |
| `npm run test:ui` | Open Vitest UI |
| `npm run test:coverage` | Generate coverage report |
| `npm run test:integration` | Run Playwright tests |
| `npm run build` | Build for production |
| `npm run lint` | Check TypeScript |
| `npm run format` | Format code |

## Next Steps

- Connect a real graphics tablet via WebHID
- Use the walkthrough to generate a configuration for your tablet
- Modify the components in `src/components/`
- Add new tests in `test/unit/` or `test/integration/`

## Need Help?

- Check out the [full README](./README.md)
- Review the [component examples](../src/components/)
- Look at the [test examples](../test/)

Happy coding! 🎨
