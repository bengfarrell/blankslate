# WebSocket Server Integration Tests

This directory contains integration tests for the `TabletWebSocketServer` that verify end-to-end server behavior.

## Overview

These tests are separate from unit tests because they:
- Start real server instances
- Use real WebSocket connections
- Test the full data flow: HID → processing → WebSocket broadcast
- May take longer to run

## Running Tests

```bash
# Run server integration tests
npm run test:server

# Run in watch mode
npm run test:server:watch
```

## Test Structure

### Configuration

Tests use a separate Vitest config (`vitest.server.config.ts`) with:
- **Node environment** (not jsdom)
- **Sequential execution** to avoid port conflicts
- **Longer timeouts** for server startup/shutdown
- **Isolated test directory** (`test/server/`)

### Test Approach

1. **Server Setup**: Create `TabletWebSocketServer` with:
   - `mock: true` - Use mock HID data (no real hardware needed)
   - `port: 8766` - Different from default to avoid conflicts
   - `keepAlive: false` - Don't block the process (test mode)

2. **Client Connection**: Use `ws` package to create real WebSocket clients

3. **Verification**: Test message flow and data structure

4. **Cleanup**: Properly close clients and stop server

## Example Test

```typescript
it('should broadcast tablet events to connected clients', async () => {
  // Start server (non-blocking)
  await server.start();
  
  // Connect client
  client = new WebSocket(`ws://localhost:${TEST_PORT}`);
  
  // Wait for tablet event
  const event = await new Promise((resolve) => {
    client.on('message', (data) => {
      const parsed = JSON.parse(data.toString());
      if (parsed.type === 'tablet-data') {
        resolve(parsed);
      }
    });
  });
  
  // Verify structure
  expect(event.type).toBe('tablet-data');
  expect(event.x).toBeDefined();
});
```

## Key Features

### Mock Data
Tests use the existing `MockHIDReader` and `TabletDataGenerator` infrastructure, so:
- No real tablet hardware required
- Predictable, repeatable test data
- Automatic gesture cycling in mock mode

### Port Management
- Tests use port `8766` (not the default `8765`)
- Avoids conflicts with running development servers
- Each test properly cleans up to free the port

### Async Handling
- WebSocket connections are inherently async
- Tests use Promises with timeouts to handle async events
- Proper cleanup in `afterEach` to prevent test pollution

## Adding New Tests

When adding new server tests:

1. Follow the existing pattern in `websocket-server.test.ts`
2. Use the shared `TEST_PORT` constant
3. Always clean up clients and server in `afterEach`
4. Use appropriate timeouts for async operations
5. Test both success and error cases

## Troubleshooting

### Port Already in Use
- Make sure previous tests cleaned up properly
- Check if a development server is running on the test port
- Increase the cleanup delay in `afterEach`

### Timeout Errors
- Increase `MESSAGE_TIMEOUT` or `CONNECT_TIMEOUT` constants
- Check that mock data is being generated
- Verify server started successfully

### Connection Refused
- Ensure server has time to start before connecting
- Check that the port is correct
- Verify no firewall is blocking localhost connections

