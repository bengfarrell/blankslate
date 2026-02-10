/**
 * WebSocket Server Integration Tests
 * 
 * These tests verify the TabletWebSocketServer by:
 * - Starting a real server instance with mock HID data
 * - Connecting real WebSocket clients
 * - Verifying message flow and data format
 * 
 * Run with: npm run test:server
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import WebSocket from 'ws';
import { TabletWebSocketServer } from '../../src/cli/tablet-websocket-server.js';
import type { TabletWebSocketEvent } from '../../src/cli/tablet-websocket-server.js';
import * as path from 'path';

const TEST_PORT = 8766; // Different from default 8765 to avoid conflicts
const TEST_CONFIG = path.join(process.cwd(), 'common-test-fixtures/test-tablet-config.json');
const CONNECT_TIMEOUT = 5000;
const MESSAGE_TIMEOUT = 3000;

describe('TabletWebSocketServer Integration', () => {
  let server: TabletWebSocketServer;
  let client: WebSocket;

  beforeEach(async () => {
    // Create server instance with mock mode and keepAlive disabled for tests
    server = new TabletWebSocketServer(TEST_CONFIG, {
      mock: true,
      port: TEST_PORT,
      keepAlive: false, // Don't block in tests
      exitOnStop: false, // Don't call process.exit() in tests
    });
  });

  afterEach(async () => {
    // Clean up client
    if (client && client.readyState === WebSocket.OPEN) {
      client.close();
    }

    // Clean up server
    if (server) {
      await server.stop();
    }

    // Wait a bit for cleanup
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  it('should start server and accept WebSocket connections', async () => {
    // Start server (non-blocking for tests)
    const serverPromise = server.start();

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 500));

    // Connect client
    await new Promise<void>((resolve, reject) => {
      client = new WebSocket(`ws://localhost:${TEST_PORT}`);
      
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, CONNECT_TIMEOUT);

      client.on('open', () => {
        clearTimeout(timeout);
        expect(client.readyState).toBe(WebSocket.OPEN);
        resolve();
      });

      client.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  });

  it('should send connection confirmation message on connect', async () => {
    const serverPromise = server.start();
    await new Promise(resolve => setTimeout(resolve, 500));

    const message = await new Promise<any>((resolve, reject) => {
      client = new WebSocket(`ws://localhost:${TEST_PORT}`);
      
      const timeout = setTimeout(() => {
        reject(new Error('Message timeout'));
      }, MESSAGE_TIMEOUT);

      client.on('message', (data) => {
        clearTimeout(timeout);
        const parsed = JSON.parse(data.toString());
        resolve(parsed);
      });

      client.on('error', reject);
    });

    expect(message.type).toBe('connected');
    expect(message.config).toBeDefined();
    expect(message.config.name).toBeDefined();
    expect(message.mode).toBe('mock');
  });

  it('should broadcast tablet events to connected clients', async () => {
    const serverPromise = server.start();
    await new Promise(resolve => setTimeout(resolve, 500));

    const tabletEvent = await new Promise<TabletWebSocketEvent>((resolve, reject) => {
      client = new WebSocket(`ws://localhost:${TEST_PORT}`);
      let receivedConnection = false;

      const timeout = setTimeout(() => {
        reject(new Error('Tablet event timeout'));
      }, MESSAGE_TIMEOUT);

      client.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        
        // Skip the initial connection message
        if (parsed.type === 'connected') {
          receivedConnection = true;
          return;
        }

        // Wait for tablet-data message
        if (parsed.type === 'tablet-data') {
          clearTimeout(timeout);
          resolve(parsed as TabletWebSocketEvent);
        }
      });

      client.on('error', reject);
    });

    // Verify tablet event structure
    expect(tabletEvent.type).toBe('tablet-data');
    expect(tabletEvent.timestamp).toBeDefined();
    expect(typeof tabletEvent.timestamp).toBe('number');
    expect(tabletEvent.state).toBeDefined();
    expect(tabletEvent.x).toBeDefined();
    expect(tabletEvent.y).toBeDefined();
    expect(tabletEvent.pressure).toBeDefined();
  });

  it('should handle multiple clients simultaneously', async () => {
    // TODO: Implement multi-client test
    // This would verify that multiple clients can connect
    // and all receive the same broadcast messages
  });

  it('should handle client disconnection gracefully', async () => {
    // TODO: Implement disconnection test
    // This would verify that the server continues working
    // after a client disconnects
  });
});