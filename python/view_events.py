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
import argparse

from blankslate.cli.event_viewer import EventViewer

def main():
    parser = argparse.ArgumentParser(description='View tablet events')
    parser.add_argument('-c', '--config', required=True, help='Path to tablet config JSON file')
    parser.add_argument('-m', '--mock', action='store_true', help='Use mock data instead of real device')
    parser.add_argument('-l', '--live', action='store_true', help='Live mode (clear screen between events)')
    parser.add_argument('--compact', action='store_true', help='Compact output format')
    parser.add_argument('-r', '--raw', action='store_true', help='Show raw byte data')

    args = parser.parse_args()

    viewer = EventViewer(
        args.config,
        mock=args.mock,
        raw=args.raw,
        compact=args.compact,
        live=args.live
    )

    try:
        viewer.start()
    except KeyboardInterrupt:
        print('\n\nCtrl+C received!')
        viewer.stop_sync()
        print('Done!')

if __name__ == '__main__':
    main()