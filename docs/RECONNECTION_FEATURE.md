# Device Reconnection Feature

## Overview

Automatic device disconnection detection and reconnection for **Node.js CLI tools** (`event-viewer` and `tablet-websocket-server`). When a tablet is unplugged, the application will:

1. Detect the disconnection
2. Close the device connection gracefully
3. Poll for device presence every 200ms
4. Automatically reconnect when the device is plugged back in (within ~200ms)
5. Resume normal operation once reconnected

**Note:** This feature is **only for Node.js CLI tools**. WebHID (browser) already has native `connect`/`disconnect` events and doesn't need polling.

## Implementation Details

### 1. NodeHIDReader (`src/cli/node-hid-reader.ts`)

**Added:**
- `onDisconnect` callback option in `NodeHIDReaderOptions`
- Error detection for disconnection events (checks for "could not read", "device disconnected", "LIBUSB_ERROR")
- `isDeviceConnected()` method to check if device is still physically present
- `_handleDisconnect()` private method to handle cleanup and invoke callback

**How it works:**
- The `error` event handler on the HID device detects disconnection errors
- When detected, it marks the device as closed and invokes the `onDisconnect` callback
- The callback is propagated through `MultiInterfaceReader` (only fires once for all interfaces)

### 2. TabletReaderBase (`src/cli/tablet-reader-base.ts`)

**Added:**
- Reconnection state tracking (`isReconnecting`, `reconnectAttempts`, `reconnectCheckInterval`)
- Configuration options (`maxReconnectAttempts = 30`, `deviceCheckInterval = 200ms`)
- `handleDeviceDisconnect()` method to handle disconnection events
- `startDevicePolling()` method to actively check for device presence
- `isDevicePresent()` method to query the system for the device
- `attemptReconnect()` method with exponential backoff

**How it works:**
- When `onDisconnect` callback is invoked, it triggers `handleDeviceDisconnect()`
- Instead of blind retries, it polls `HID.devices()` every 200ms to detect when device is plugged back in
- Once device is detected, it immediately attempts to reconnect
- Uses exponential backoff (500ms → 750ms → 1125ms → ... up to 5s) if connection fails
- After 30 polling attempts (~6 seconds), it stops and displays a message
- On successful reconnection, it resumes reading data automatically

### 3. TabletWebSocketServer (`src/cli/tablet-websocket-server.ts`)

**Added:**
- Override of `handleDeviceDisconnect()` to notify WebSocket clients
- Override of `attemptReconnect()` to notify clients on successful reconnection
- `broadcastStatus()` method to send status messages to all connected clients

**Status message format:**
```json
{
  "type": "status",
  "status": "connected" | "disconnected",
  "message": "Device disconnected, attempting to reconnect...",
  "timestamp": 1234567890
}
```

## Usage

### Event Viewer

```bash
# Start the event viewer
npm run events -- --config path/to/config.json

# When device is unplugged:
# ⚠ Device disconnected!
# Waiting for device to be reconnected...
# (Checking every 200ms)

# When device is plugged back in:
# ✓ Device detected!
# Attempting to reconnect...
# ✓ Device reconnected successfully!
```

### WebSocket Server

```bash
# Start the WebSocket server
npm run websocket -- --config path/to/config.json

# Clients will receive status messages:
# - On disconnect: {"type": "status", "status": "disconnected", ...}
# - On reconnect: {"type": "status", "status": "connected", ...}
```

## Configuration

You can customize reconnection behavior by modifying the `TabletReaderBase` class:

```typescript
protected maxReconnectAttempts = 30;     // Maximum number of polling attempts
protected deviceCheckInterval = 200;     // Milliseconds between device presence checks
protected reconnectBaseInterval = 500;   // Base interval for exponential backoff
protected reconnectMaxInterval = 5000;   // Maximum backoff interval
```

## Testing

The reconnection logic only applies to real devices (not mock mode). To test:

1. Start the event viewer or WebSocket server with a real tablet
2. Unplug the tablet
3. Observe the reconnection attempts in the console
4. Plug the tablet back in
5. Verify that data reading resumes automatically

## How It Works: Device Polling Approach

Instead of blindly retrying connection attempts on a timer, this implementation uses **smart device polling**:

### The Flow

```
Device unplugged
  ↓
Poll HID.devices() every 200ms
  ↓
Device not found... (200ms)
  ↓
Device not found... (200ms)
  ↓
[User plugs device back in]
  ↓
Device detected! (within 200ms)
  ↓
Attempt connection → Success!
```

### Why This is Better

**Device Polling (Current):**
- ✅ Responds within 200ms of device being plugged back in
- ✅ No wasted connection attempts
- ✅ Feels instant and responsive
- ✅ Only connects when device is actually present
- ✅ Exponential backoff if device needs time to initialize

**Timer-Based (Alternative):**
- ❌ Blindly retries every 2 seconds
- ❌ Many failed connection attempts
- ❌ User waits up to 2 seconds after plugging device back in
- ❌ Feels sluggish and unresponsive

### Real-World Example

**Scenario:** User unplugs tablet for 5 seconds, then plugs it back in

**Device Polling (200ms checks):**
```
0.0s: Device unplugged
0.2s: Check #1 (not found)
0.4s: Check #2 (not found)
... (continues checking)
5.0s: [User plugs device back in]
5.2s: Check #26 (found!) → Connection attempt (succeeds)
```
**Total reconnection time: ~200ms after plug-in** ⚡

**Timer-Based (2s intervals):**
```
0.0s: Device unplugged
2.0s: Connection attempt #1 (fails)
4.0s: Connection attempt #2 (fails)
5.0s: [User plugs device back in]
6.0s: Connection attempt #3 (succeeds)
```
**Total reconnection time: 1 second after plug-in** 🐌

### Performance Impact

- **CPU usage:** Minimal (`HID.devices()` is a fast native call)
- **Responsiveness:** Excellent (~200ms detection)
- **Failed attempts:** None (only connects when device is present)

The slight increase in CPU usage (checking device list every 200ms) is negligible compared to the massive improvement in user experience.

## Why Not WebHID?

**WebHID (browser)** already has native USB hotplug events:

```typescript
navigator.hid.addEventListener('connect', (event) => {
  // Device plugged in - instant notification!
});

navigator.hid.addEventListener('disconnect', (event) => {
  // Device unplugged - instant notification!
});
```

**node-hid (Node.js)** doesn't expose these events, so we must poll. This is a limitation of the node-hid library, not the underlying USB system.

## Notes

- Mock mode is not affected by this feature (mock devices don't disconnect)
- The reconnection logic is inherited by both `EventStreamer` and `TabletWebSocketServer`
- WebSocket clients remain connected during device reconnection
- The config-generator tool does not use this feature (it's an interactive tool)
- This feature is **only for Node.js CLI tools** - WebHID uses native events