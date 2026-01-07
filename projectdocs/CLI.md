# The Learning Tablet - CLI Tools

Command-line tools for configuring and testing HID graphics tablets.

## Development

Run directly with tsx:

```bash
# Interactive configuration generator
npm run config
# or
npx tsx src/cli/config-generator.ts

# View tablet events
npm run events -- -c path/to/config.json --live
# or
npx tsx src/cli/event-viewer.ts -c path/to/config.json --live
```

## Building for npm

Build the CLI for distribution:

```bash
npm run build:cli
```

This compiles to `dist/cli/` and the package.json bin entries point there:

- `tablet-config` → Interactive configuration generator
- `tablet-events` → Real-time event viewer

## Tools

### Config Generator (`config-generator.ts`)

Interactive step-by-step wizard to generate tablet configurations:

```bash
npx tsx src/cli/config-generator.ts
npx tsx src/cli/config-generator.ts --output my-config.json
npx tsx src/cli/config-generator.ts --mock  # Use mock data for testing
```

### Event Viewer (`event-viewer.ts`)

View and visualize tablet events in real-time:

```bash
# Live dashboard mode (recommended)
npx tsx src/cli/event-viewer.ts -c config.json --live

# Compact single-line mode
npx tsx src/cli/event-viewer.ts -c config.json --compact

# Show raw bytes
npx tsx src/cli/event-viewer.ts -c config.json --live --raw

# Use mock data
npx tsx src/cli/event-viewer.ts -c config.json --mock --live
```
