"""WebSocket server that broadcasts normalized tablet events."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import List, Optional, Set

import websockets
from websockets.server import WebSocketServerProtocol

from ..otd.config_loader import TabletConfiguration
from ..otd.parsers import StandardDigitizerReportParser, get_parser
from .aux_report import parse_aux_report
from .event_adapter import EventAdapter, TabletEvent
from .hid_descriptor import pick_pen_ranges
from .hid_device import DiscoveredDevice, HidReader, is_standard_digitizer


log = logging.getLogger(__name__)


class TabletService:
    """Wires HID reader -> parser -> adapter -> websocket broadcast."""

    def __init__(self,
                 device: DiscoveredDevice,
                 aux_devices: Optional[List[DiscoveredDevice]] = None,
                 port: int = 8765,
                 host: str = "0.0.0.0"):
        self.device = device
        self.aux_devices: List[DiscoveredDevice] = list(aux_devices or [])
        self.port = port
        self.host = host
        self.config: TabletConfiguration = device.match.config
        # The vendored OTD parsers expect bytes from the tablet's vendor
        # interface, which usually requires a firmware-specific init that
        # we can't reliably trigger on macOS. When we're attached to the
        # standard digitizer interface instead, swap in a generic parser
        # that understands OS-compatibility reports.
        self._use_standard_digitizer = is_standard_digitizer(device)
        if self._use_standard_digitizer:
            log.info("Using standard HID digitizer parser for %s", self.config.name)
            self.parser = StandardDigitizerReportParser()
        else:
            self.parser = get_parser(device.match.identifier.report_parser)
        self.adapter = EventAdapter(self.config)
        self.reader = HidReader(device)
        self.aux_readers: List[HidReader] = []

        self._clients: Set[WebSocketServerProtocol] = set()
        self._ws_server: Optional[websockets.WebSocketServer] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._stopping = asyncio.Event()

    async def start(self) -> None:
        self._loop = asyncio.get_running_loop()
        self._ws_server = await websockets.serve(self._handle_client, self.host, self.port)
        log.info("WebSocket listening on ws://%s:%d", self.host, self.port)

        self.reader.open(run_init=not self._use_standard_digitizer)
        if self._use_standard_digitizer:
            self._apply_descriptor_ranges()
        self.reader.start(on_report=self._on_report, on_disconnect=self._on_disconnect)
        log.info("Reading from %s", self.config.name)

        self._start_aux_readers()

        try:
            await self._stopping.wait()
        finally:
            await self._shutdown()

    def request_stop(self) -> None:
        if self._loop is not None and not self._stopping.is_set():
            self._loop.call_soon_threadsafe(self._stopping.set)

    def _apply_descriptor_ranges(self) -> None:
        """Override the adapter's normalization ranges using the device's
        HID report descriptor. The OTD config's MaxX/MaxY are calibrated
        for the vendor interface and don't apply to the standard
        digitizer interface we're reading here."""
        descriptor = self.reader.get_report_descriptor()
        if not descriptor:
            log.debug("No HID report descriptor available; using config ranges")
            return
        ranges = pick_pen_ranges(descriptor)
        if ranges is None:
            log.debug("No pen X/Y usages found in descriptor; using config ranges")
            return
        log.info("Descriptor pen ranges: x_max=%s y_max=%s pressure_max=%s",
                 ranges.x_max, ranges.y_max, ranges.pressure_max)
        self.adapter.override_ranges(
            max_x=ranges.x_max,
            max_y=ranges.y_max,
            max_pressure=ranges.pressure_max,
        )

    def _start_aux_readers(self) -> None:
        """Open every aux interface in parallel with the pen reader.

        Express keys arrive on a separate Keyboard / Consumer Control
        interface; we forward the raw scan codes so downstream projects
        can build their own per-device mappings. On macOS opening these
        keyboard-class interfaces requires root, so the daemon must be
        launched with ``sudo`` to capture them.
        """
        for aux in self.aux_devices:
            reader = HidReader(aux)
            try:
                reader.open(run_init=False)
            except (OSError, IOError) as exc:
                log.warning("Could not open aux interface %s (usage_page=%#06x): %s. "
                            "On macOS the keyboard-class aux interface requires root; "
                            "rerun with sudo to capture express keys.",
                            aux.path, aux.usage_page, exc)
                continue
            reader.start(
                on_report=lambda data, a=aux: self._on_aux_report(a, data),
                on_disconnect=None,
            )
            self.aux_readers.append(reader)
            log.info("Reading aux interface %d (usage_page=%#06x) for %s",
                     aux.interface_number, aux.usage_page, self.config.name)

    def _on_aux_report(self, aux: DiscoveredDevice, data: bytes) -> None:
        if log.isEnabledFor(logging.DEBUG):
            log.debug("aux report (iface=%d up=%#06x): %s",
                      aux.interface_number, aux.usage_page, bytes(data).hex())
        report_id, codes = parse_aux_report(data)
        if not self.adapter.update_aux_codes(aux.path, report_id, codes):
            return
        event = self.adapter._empty_event()
        if self._loop is not None:
            asyncio.run_coroutine_threadsafe(self._broadcast(event), self._loop)

    async def _shutdown(self) -> None:
        self.reader.stop()
        for reader in self.aux_readers:
            reader.stop()
        self.aux_readers.clear()
        if self._ws_server is not None:
            for client in list(self._clients):
                try:
                    await client.close()
                except Exception:
                    pass
            self._ws_server.close()
            await self._ws_server.wait_closed()

    async def _handle_client(self, ws: WebSocketServerProtocol):
        self._clients.add(ws)
        log.info("Client connected (%d total)", len(self._clients))
        try:
            # auxButtonCount comes from the community-maintained OTD
            # config and is not authoritative for any given unit (it can
            # miss mode-switched layouts or just be wrong). Clients
            # should treat it as a hint and discover the real button
            # set from observed `auxCodes` over time.
            await ws.send(json.dumps({
                "type": "connected",
                "config": {
                    "name": self.config.name,
                    "manufacturer": self.config.manufacturer,
                    "model": self.config.model,
                    "maxX": self.config.specifications.digitizer_max_x,
                    "maxY": self.config.specifications.digitizer_max_y,
                    "maxPressure": self.config.specifications.pen_max_pressure,
                    "auxButtonCount": self.config.specifications.aux_button_count,
                },
                "mode": "device",
                "dataFormat": "translated",
            }))
            async for _ in ws:
                pass
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self._clients.discard(ws)
            log.info("Client disconnected (%d remaining)", len(self._clients))

    def _on_report(self, data: bytes) -> None:
        try:
            report = self.parser.parse(data)
        except (IndexError, ValueError):
            return
        if report is None:
            return
        event = self.adapter.adapt(report)
        if event is None:
            return
        if self._loop is not None:
            asyncio.run_coroutine_threadsafe(self._broadcast(event), self._loop)

    def _on_disconnect(self) -> None:
        if self._loop is None:
            return
        asyncio.run_coroutine_threadsafe(
            self._broadcast_status("disconnected", "Tablet disconnected"), self._loop
        )
        self._loop.call_soon_threadsafe(self._stopping.set)

    async def _broadcast(self, event: TabletEvent) -> None:
        if not self._clients:
            return
        message = json.dumps(event.to_dict())
        await self._send_all(message)

    async def _broadcast_status(self, status: str, message: str) -> None:
        if not self._clients:
            return
        payload = json.dumps({
            "type": "status",
            "status": status,
            "message": message,
            "timestamp": asyncio.get_event_loop().time() * 1000.0,
        })
        await self._send_all(payload)

    async def _send_all(self, message: str) -> None:
        dead: Set[WebSocketServerProtocol] = set()
        for client in self._clients:
            try:
                await client.send(message)
            except Exception:
                dead.add(client)
        self._clients -= dead
