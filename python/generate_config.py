#!/usr/bin/env python3
"""
Standalone config generator - structured like view_events.py
Run as a direct script (not with -m) so Ctrl+C works in WebStorm terminal

Usage:
    python generate_config.py
    python generate_config.py --mock
    python generate_config.py --output my-config.json
"""
import sys
import os
import argparse
import asyncio
import signal

from blankslate.core.walkthrough_controller import WalkthroughController, WalkthroughControllerOptions
from blankslate.core.hid_reader_factory import HIDReaderFactory
from blankslate.cli.cli_walkthrough_view import CLIWalkthroughView

# Global controller reference for signal handler
_controller = None
_cleanup_in_progress = False


def signal_handler(signum, frame):
    """Handle Ctrl+C gracefully"""
    global _controller, _cleanup_in_progress

    # Prevent re-entry if cleanup is already in progress
    if _cleanup_in_progress:
        # Force exit on repeated Ctrl+C
        print("\n\n🛑 Force exit...")
        os._exit(1)

    _cleanup_in_progress = True
    print("\n\n🛑 Interrupted by user. Cleaning up...")

    # Stop the reader if it exists
    if _controller and _controller.reader:
        try:
            _controller.reader.stop_reading()
            _controller.reader.close()
        except Exception:
            pass

    # Use os._exit to avoid atexit handlers that can hang on thread joins
    os._exit(1)


async def run_walkthrough(use_mock: bool = False) -> int:
    """
    Run the interactive walkthrough

    Args:
        use_mock: Whether to use mock data

    Returns:
        Exit code (0 for success)
    """
    global _controller

    try:
        # Create view and reader factory
        view = CLIWalkthroughView()
        reader_factory = HIDReaderFactory()

        # Create controller with options
        controller = WalkthroughController(
            view,
            reader_factory,
            WalkthroughControllerOptions(
                auto_play_mock_gestures=True,
                gesture_play_duration=2000
            )
        )

        # Store controller globally for signal handler
        _controller = controller

        # Run the walkthrough
        await controller.run(force_mock=use_mock)

        return 0

    except KeyboardInterrupt:
        print("\n\n🛑 Walkthrough cancelled by user.")
        return 1
    except Exception as e:
        print(f"\n\n❌ Error during walkthrough: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        # Clean up reader
        if _controller and _controller.reader:
            try:
                _controller.reader.stop_reading()
                _controller.reader.close()
            except Exception:
                pass


def main():
    # Set up signal handler for Ctrl+C
    signal.signal(signal.SIGINT, signal_handler)

    parser = argparse.ArgumentParser(
        description='Interactive Tablet Configuration Generator',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python generate_config.py              # Interactive mode with device selection
  python generate_config.py --mock       # Use mock device for testing

This tool will guide you through detecting your tablet's HID byte mappings
by performing various gestures (horizontal movement, vertical movement,
pressure variation, tilt, buttons, etc.).
        """
    )
    parser.add_argument(
        '-m', '--mock',
        action='store_true',
        help='Use mock device data (for testing without a real tablet)'
    )

    args = parser.parse_args()

    # Run the async walkthrough
    try:
        exit_code = asyncio.run(run_walkthrough(use_mock=args.mock))
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\n\n🛑 Exiting...")
        sys.exit(1)


if __name__ == '__main__':
    main()