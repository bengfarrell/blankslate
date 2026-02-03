#!/usr/bin/env python3
"""
Standalone event viewer - structured like view_tablet_data.py
Run as a direct script (not with -m) so Ctrl+C works in WebStorm terminal

Usage:
    python view_events.py -c my-tablet-config.json
    python view_events.py -c my-tablet-config.json --mock
    python view_events.py -c my-tablet-config.json --live
    python view_events.py -c my-tablet-config.json --compact
"""
import sys
import os
import argparse
import signal

from blankslate.cli.event_viewer import EventViewer

# Global state for signal handler
_viewer = None
_cleanup_in_progress = False


def signal_handler(signum, frame):
    """Handle Ctrl+C gracefully"""
    global _viewer, _cleanup_in_progress

    # Prevent re-entry if cleanup is already in progress
    if _cleanup_in_progress:
        # Force exit on repeated Ctrl+C
        print("\n\n🛑 Force exit...")
        os._exit(1)

    _cleanup_in_progress = True
    print('\n\n🛑 Interrupted by user. Cleaning up...')

    if _viewer:
        try:
            _viewer.stop_sync()
        except Exception:
            pass

    print('Done!')
    os._exit(0)


def main():
    global _viewer

    # Set up signal handler for Ctrl+C
    signal.signal(signal.SIGINT, signal_handler)

    parser = argparse.ArgumentParser(description='View tablet events')
    parser.add_argument('-c', '--config', required=True, help='Path to tablet config JSON file')
    parser.add_argument('-m', '--mock', action='store_true', help='Use mock data instead of real device')
    parser.add_argument('-l', '--live', action='store_true', help='Live mode (clear screen between events)')
    parser.add_argument('--compact', action='store_true', help='Compact output format')
    parser.add_argument('-r', '--raw', action='store_true', help='Show raw byte data')

    args = parser.parse_args()

    _viewer = EventViewer(
        args.config,
        mock=args.mock,
        raw=args.raw,
        compact=args.compact,
        live=args.live
    )

    try:
        _viewer.start()
    except KeyboardInterrupt:
        # This may not be reached if signal handler runs first, but keep as fallback
        print('\n\n🛑 Interrupted by user. Cleaning up...')
        _viewer.stop_sync()
        print('Done!')

if __name__ == '__main__':
    main()