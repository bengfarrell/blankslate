#!/usr/bin/env node
/**
 * Tablet WebSocket Server
 * 
 * Reads HID tablet data, interprets bytes using a config file,
 * and broadcasts high-level tablet events over WebSocket.
 * 
 * Usage:
 *   npx tsx src/cli/tablet-websocket-server.ts --config path/to/config.json
 *   npx tsx src/cli/tablet-websocket-server.ts --config path/to/config.json --port 8765
 *   npx tsx src/cli/tablet-websocket-server.ts --config path/to/config.json --mock
 */

import { program } from 'commander';
import chalk from 'chalk';
import { WebSocketServer, WebSocket } from 'ws';

import {
  TabletReaderBase,
  TabletEventData,
  normalizeTabletEvent,
} from './tablet-reader-base.js';

/**
 * Tablet event structure sent over WebSocket
 */
export interface TabletWebSocketEvent extends TabletEventData {
  type: 'tablet-data';
  timestamp: number;
}

interface ServerOptions {
  config: string;
  port?: number;
  mock?: boolean;
}

export class TabletWebSocketServer extends TabletReaderBase {
  private port: number;
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private keepAlive: boolean;

  constructor(configPath: string, options: { mock?: boolean; port?: number; keepAlive?: boolean; exitOnStop?: boolean }) {
    super(configPath, {
      mock: options.mock,
      exitOnStop: options.exitOnStop
    });
    this.port = options.port ?? 8765;
    this.keepAlive = options.keepAlive ?? true;
  }

  async start(): Promise<void> {
    this.printHeader('Tablet WebSocket Server');
    console.log(chalk.cyan('Port:'), chalk.white(this.port));
    console.log();

    // Start WebSocket server
    this.wss = new WebSocketServer({ port: this.port });

    this.wss.on('connection', (ws) => {
      console.log(chalk.green('✓ Client connected'));
      this.clients.add(ws);

      ws.on('close', () => {
        console.log(chalk.yellow('Client disconnected'));
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error(chalk.red('WebSocket error:'), error.message);
        this.clients.delete(ws);
      });

      // Send initial connection confirmation
      ws.send(JSON.stringify({
        type: 'connected',
        config: {
          name: this.configData.name,
          manufacturer: this.configData.manufacturer,
          model: this.configData.model,
        },
        mode: this.isMockMode ? 'mock' : 'device',
      }));
    });

    console.log(chalk.green(`✓ WebSocket server listening on ws://localhost:${this.port}`));

    // Initialize HID reader
    await this.initializeReader();

    if (!this.reader) {
      throw new Error('Reader not initialized');
    }

    // Start reading HID data
    console.log(chalk.gray('Setting up data callback...'));
    this.reader.startReading((data, _reportId) => {
      this.handlePacket(data);
    });

    console.log(chalk.green('✓ Started reading tablet data'));
    console.log(chalk.gray('Press Ctrl+C to stop\n'));

    if (this.isMockMode) {
      this.startMockGestureCycle();
    }

    // Set up graceful shutdown
    this.setupShutdownHandlers();

    // Keep process alive (unless in test mode)
    if (this.keepAlive) {
      await new Promise(() => {});
    }
  }

  protected handlePacket(data: Uint8Array): void {
    try {
      this.packetCount++;

      // Process raw bytes into tablet events
      const events = this.processPacket(data);
      const normalized = normalizeTabletEvent(events);

      // Build WebSocket event
      const tabletEvent: TabletWebSocketEvent = {
        type: 'tablet-data',
        timestamp: Date.now(),
        ...normalized,
      };

      // Broadcast to all connected clients
      this.broadcast(tabletEvent);

    } catch {
      // Silently ignore unexpected packet formats
    }
  }

  private broadcast(event: TabletWebSocketEvent): void {
    const message = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  async stop(): Promise<void> {
    // Close WebSocket server first
    if (this.wss) {
      for (const client of this.clients) {
        client.close();
      }
      this.wss.close();
      console.log(chalk.gray('WebSocket server stopped.'));
    }

    // Then call parent stop
    await super.stop();
  }
}

// CLI Setup - only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  program
    .name('tablet-websocket')
    .description('Start a WebSocket server that broadcasts tablet events')
    .version('1.0.0')
    .requiredOption('-c, --config <path>', 'Path to tablet config JSON file')
    .option('-p, --port <number>', 'WebSocket server port', '8765')
    .option('-m, --mock', 'Use mock data instead of real device')
    .action(async (options: ServerOptions) => {
      try {
        const server = new TabletWebSocketServer(options.config, {
          mock: options.mock,
          port: parseInt(String(options.port), 10),
        });

        await server.start();
      } catch (error) {
        console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  program.parse();
}