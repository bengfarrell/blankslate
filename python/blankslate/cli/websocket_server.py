#!/usr/bin/env python3
"""
Tablet WebSocket Server

Reads HID tablet data, interprets bytes using a config file,
and broadcasts high-level tablet events over WebSocket.

Usage:
    tablet-websocket -c config.json
    tablet-websocket -c config.json --port 8765
    tablet-websocket -c config.json --mock
"""

import sys
import argparse
import asyncio
import json
from typing import Dict, Any, Set, Optional
from dataclasses import dataclass, asdict

try:
    import websockets
    from websockets.server import WebSocketServerProtocol
except ImportError:
    print("Error: websockets package not installed. Run: pip install websockets")
    sys.exit(1)

try:
    from .tablet_reader_base import TabletReaderBase, Colors, colored, normalize_tablet_event, TabletEventData
except ImportError:
    import os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))
    from blankslate.cli.tablet_reader_base import TabletReaderBase, Colors, colored, normalize_tablet_event, TabletEventData


@dataclass
class TabletWebSocketEvent:
    """Tablet event structure sent over WebSocket"""
    type: str  # 'tablet-data'
    timestamp: float
    state: str
    x: float
    y: float
    pressure: float
    tiltX: float
    tiltY: float
    tiltXY: float
    primaryButtonPressed: bool
    secondaryButtonPressed: bool
    tabletButtons: int
    button1: bool
    button2: bool
    button3: bool
    button4: bool
    button5: bool
    button6: bool
    button7: bool
    button8: bool


class TabletWebSocketServer(TabletReaderBase):
    """WebSocket server that broadcasts tablet events"""
    
    def __init__(self, config_path: str, port: int = 8765, mock: bool = False, 
                 raw: bool = False, keep_alive: bool = True, exit_on_stop: bool = True):
        super().__init__(config_path, mock=mock, exit_on_stop=exit_on_stop)
        self.port = port
        self.send_raw = raw
        self.keep_alive = keep_alive
        
        # WebSocket state
        self.wss: Optional[websockets.WebSocketServer] = None
        self.clients: Set[WebSocketServerProtocol] = set()
        self._loop = None  # Event loop for thread-safe task scheduling

    async def start(self):
        """Start the WebSocket server and HID reader"""
        self.print_header('Tablet WebSocket Server')
        print(colored('Port: ', Colors.CYAN) + colored(str(self.port), Colors.WHITE))
        print()

        # Store the event loop for thread-safe task scheduling
        self._loop = asyncio.get_running_loop()

        # Start WebSocket server
        self.wss = await websockets.serve(
            self._handle_client,
            '0.0.0.0',
            self.port
        )
        
        print(colored(f'✓ WebSocket server listening on ws://localhost:{self.port}', Colors.GREEN))
        
        # Initialize HID reader
        await self.initialize_reader()
        
        if not self.reader:
            raise RuntimeError('Reader not initialized')
        
        # Start reading HID data
        print(colored('Setting up data callback...', Colors.GRAY))
        if hasattr(self.reader, 'start_reading'):
            self.reader.start_reading(lambda data, report_id=None: self.handle_packet(data, report_id))
        
        print(colored('✓ Started reading tablet data', Colors.GREEN))
        print(colored('Press Ctrl+C to stop\n', Colors.GRAY))
        
        self.is_running = True
        
        if self.is_mock_mode:
            await self.start_mock_gesture_cycle()
        
        # Set up graceful shutdown
        self.setup_shutdown_handlers()
        
        # Keep process alive
        if self.keep_alive:
            try:
                while self.is_running:
                    await asyncio.sleep(0.1)
            except KeyboardInterrupt:
                await self.stop()
    
    async def _handle_client(self, websocket: WebSocketServerProtocol):
        """Handle a new WebSocket client connection"""
        print(colored('✓ Client connected', Colors.GREEN))
        self.clients.add(websocket)
        
        try:
            # Send initial connection confirmation
            connection_message = {
                'type': 'connected',
                'config': {
                    'name': self.config_data.name,
                    'manufacturer': self.config_data.manufacturer,
                    'model': self.config_data.model,
                },
                'mode': 'mock' if self.is_mock_mode else 'device',
                'dataFormat': 'raw' if self.send_raw else 'translated',
            }
            
            # If sending raw bytes, include the full config
            if self.send_raw:
                connection_message['fullConfig'] = {
                    'name': self.config_data.name,
                    'manufacturer': self.config_data.manufacturer,
                    'model': self.config_data.model,
                    'description': self.config_data.description,
                    'vendorId': self.config_data.vendorId,
                    'productId': self.config_data.productId,
                    'deviceInfo': self.config_data.deviceInfo,
                    'reportId': self.config_data.reportId,
                    'digitizerUsagePage': self.config_data.digitizerUsagePage,
                    'buttonInterfaceReportId': getattr(self.config_data, 'buttonInterfaceReportId', None),
                    'stylusModeStatusByte': getattr(self.config_data, 'stylusModeStatusByte', None),
                    'excludedUsagePages': getattr(self.config_data, 'excludedUsagePages', None),
                    'capabilities': self.config_data.capabilities,
                    'byteCodeMappings': self.config_data.byteCodeMappings,
                }
            
            await websocket.send(json.dumps(connection_message))
            
            # Keep connection alive
            async for message in websocket:
                # Handle any incoming messages from client if needed
                pass
                
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            print(colored('Client disconnected', Colors.YELLOW))
            self.clients.discard(websocket)
    
    def handle_packet(self, data: bytes, report_id: Optional[int] = None):
        """Handle incoming HID packet"""
        try:
            self.packet_count += 1
            
            if self.send_raw:
                # Send raw bytes directly
                asyncio.create_task(self._broadcast_raw(data))
            else:
                # Process raw bytes into tablet events
                events = self.process_packet(data)
                normalized = normalize_tablet_event(events)
                
                # Build WebSocket event
                import time
                tablet_event = TabletWebSocketEvent(
                    type='tablet-data',
                    timestamp=time.time() * 1000,  # milliseconds
                    state=normalized.state,
                    x=normalized.x,
                    y=normalized.y,
                    pressure=normalized.pressure,
                    tiltX=normalized.tiltX,
                    tiltY=normalized.tiltY,
                    tiltXY=normalized.tiltXY,
                    primaryButtonPressed=normalized.primaryButtonPressed,
                    secondaryButtonPressed=normalized.secondaryButtonPressed,
                    tabletButtons=normalized.tabletButtons,
                    button1=normalized.button1,
                    button2=normalized.button2,
                    button3=normalized.button3,
                    button4=normalized.button4,
                    button5=normalized.button5,
                    button6=normalized.button6,
                    button7=normalized.button7,
                    button8=normalized.button8,
                )

                # Broadcast to all connected clients
                # Schedule on the event loop (handle_packet is called from a background thread)
                if self._loop:
                    asyncio.run_coroutine_threadsafe(self._broadcast(tablet_event), self._loop)

        except:
            # Silently ignore unexpected packet formats
            pass
    
    async def _broadcast(self, event: TabletWebSocketEvent):
        """Broadcast event to all connected clients"""
        if not self.clients:
            return
        
        message = json.dumps(asdict(event))
        
        # Send to all clients
        disconnected = set()
        for client in self.clients:
            try:
                await client.send(message)
            except:
                disconnected.add(client)
        
        # Remove disconnected clients
        self.clients -= disconnected
    
    async def _broadcast_raw(self, data: bytes):
        """Broadcast raw bytes to all connected clients"""
        if not self.clients:
            return
        
        # Send to all clients
        disconnected = set()
        for client in self.clients:
            try:
                await client.send(data)
            except:
                disconnected.add(client)
        
        # Remove disconnected clients
        self.clients -= disconnected
    
    async def _broadcast_status(self, status: str, message: str):
        """Broadcast status message to all connected clients"""
        if not self.clients:
            return
        
        import time
        status_message = {
            'type': 'status',
            'status': status,
            'message': message,
            'timestamp': time.time() * 1000,
        }
        
        message_str = json.dumps(status_message)
        
        # Send to all clients
        disconnected = set()
        for client in self.clients:
            try:
                await client.send(message_str)
            except:
                disconnected.add(client)
        
        # Remove disconnected clients
        self.clients -= disconnected
    
    def handle_device_disconnect(self):
        """Override to notify WebSocket clients"""
        # Notify all connected clients
        asyncio.create_task(self._broadcast_status(
            'disconnected',
            'Device disconnected, attempting to reconnect...'
        ))
        
        # Call parent implementation
        super().handle_device_disconnect()
    
    async def _attempt_reconnect(self):
        """Override to notify clients on success"""
        previous_attempts = self.reconnect_attempts
        
        await super()._attempt_reconnect()
        
        # If reconnection succeeded (attempts reset to 0)
        if self.reconnect_attempts == 0 and previous_attempts > 0:
            await self._broadcast_status('connected', 'Device reconnected successfully')
    
    async def stop(self):
        """Stop the server and clean up"""
        # Close WebSocket server first
        if self.wss:
            for client in list(self.clients):
                await client.close()
            self.wss.close()
            await self.wss.wait_closed()
            print(colored('WebSocket server stopped.', Colors.GRAY))
        
        # Then call parent stop
        await super().stop()


def main():
    parser = argparse.ArgumentParser(
        description='Start a WebSocket server that broadcasts tablet events'
    )
    parser.add_argument('-c', '--config', required=True, help='Path to tablet config JSON file')
    parser.add_argument('-p', '--port', type=int, default=8765, help='WebSocket server port (default: 8765)')
    parser.add_argument('-m', '--mock', action='store_true', help='Use mock data instead of real device')
    parser.add_argument('-r', '--raw', action='store_true', help='Send raw bytes instead of translated events')
    
    args = parser.parse_args()
    
    try:
        server = TabletWebSocketServer(
            args.config,
            port=args.port,
            mock=args.mock,
            raw=args.raw
        )
        
        asyncio.run(server.start())
    except KeyboardInterrupt:
        print("\n\nExiting...")
        sys.exit(0)
    except Exception as error:
        print(colored('Error: ', Colors.RED) + str(error))
        sys.exit(1)


if __name__ == '__main__':
    main()