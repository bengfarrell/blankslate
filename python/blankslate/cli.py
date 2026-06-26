"""Command-line entry point: ``blankslate-server``."""

from __future__ import annotations

import argparse
import asyncio
import logging
import signal
import sys
from typing import List, Optional

from .otd.config_loader import ConfigIndex
from .otd.parsers import known_parsers
from .server.hid_device import (
    DiscoveredDevice,
    discover,
    is_standard_digitizer,
    pick_aux_interfaces,
    pick_digitizer_interface,
)
from .server.websocket_server import TabletService


log = logging.getLogger("blankslate")


def _setup_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    # Third-party loggers are noisy at DEBUG; keep our own at the
    # requested level but cap library logs to INFO.
    for name in ("websockets", "websockets.server", "websockets.protocol", "asyncio"):
        logging.getLogger(name).setLevel(logging.INFO)


def _list_devices(devices: List[DiscoveredDevice]) -> None:
    if not devices:
        print("No matching tablets found.")
        return
    print(f"Found {len(devices)} matching HID interface(s):")
    for d in devices:
        cfg = d.match.config
        ident = d.match.identifier
        try:
            path_repr = d.path.decode("utf-8", errors="replace")
        except AttributeError:
            path_repr = str(d.path)
        print(
            f"  - {cfg.name}  vid={d.vendor_id:#06x} pid={d.product_id:#06x}  "
            f"interface={d.interface_number}  usage_page={d.usage_page:#06x}  "
            f"usage={d.usage:#06x}  parser={ident.report_parser.rsplit('.', 1)[-1]}  "
            f"path={path_repr}"
        )


def _select_device(devices: List[DiscoveredDevice],
                   prefer_vid: Optional[int],
                   prefer_pid: Optional[int]) -> Optional[DiscoveredDevice]:
    candidates = devices
    if prefer_vid is not None:
        candidates = [d for d in candidates if d.vendor_id == prefer_vid]
    if prefer_pid is not None:
        candidates = [d for d in candidates if d.product_id == prefer_pid]
    return pick_digitizer_interface(candidates)


async def _serve(device: DiscoveredDevice,
                 aux_devices: List[DiscoveredDevice],
                 port: int, host: str) -> None:
    service = TabletService(device, aux_devices=aux_devices, port=port, host=host)
    loop = asyncio.get_running_loop()

    def _on_signal(*_args):
        log.info("Shutdown requested")
        service.request_stop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _on_signal)
        except NotImplementedError:
            signal.signal(sig, _on_signal)

    await service.start()


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(prog="blankslate-server",
                                description="Stream tablet events over WebSocket using OpenTabletDriver configs.")
    p.add_argument("--port", type=int, default=8765, help="WebSocket port (default 8765)")
    p.add_argument("--host", default="0.0.0.0", help="WebSocket bind address (default 0.0.0.0)")
    p.add_argument("--vid", type=lambda x: int(x, 0), default=None,
                   help="Force a specific USB vendor ID (e.g. 0x256c)")
    p.add_argument("--pid", type=lambda x: int(x, 0), default=None,
                   help="Force a specific USB product ID")
    p.add_argument("--list", action="store_true",
                   help="List matching connected devices and exit")
    p.add_argument("--list-parsers", action="store_true",
                   help="List parser implementations and exit")
    p.add_argument("--no-aux", action="store_true",
                   help="Don't open auxiliary (express-key) HID interfaces")
    p.add_argument("-v", "--verbose", action="store_true", help="Enable debug logging")
    args = p.parse_args(argv)

    _setup_logging(args.verbose)

    if args.list_parsers:
        for name in known_parsers():
            print(name)
        return 0

    index = ConfigIndex.from_vendored()
    devices = discover(index)

    if args.list:
        _list_devices(devices)
        return 0

    device = _select_device(devices, args.vid, args.pid)
    if device is None:
        print("No supported tablet detected. Try --list to see matches, "
              "or --vid/--pid to force one.", file=sys.stderr)
        return 1

    parser_name = device.match.identifier.report_parser
    if parser_name not in known_parsers() and not is_standard_digitizer(device):
        print(f"Detected {device.match.config.name} but parser "
              f"{parser_name!r} is not yet ported.", file=sys.stderr)
        return 2

    same_device = [d for d in devices
                   if d.vendor_id == device.vendor_id and d.product_id == device.product_id]
    aux_devices = [] if args.no_aux else pick_aux_interfaces(same_device)
    if aux_devices:
        log.info("Found %d aux HID interface(s) for %s",
                 len(aux_devices), device.match.config.name)

    log.info("Serving %s on ws://%s:%d", device.match.config.name, args.host, args.port)
    try:
        asyncio.run(_serve(device, aux_devices, args.port, args.host))
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
