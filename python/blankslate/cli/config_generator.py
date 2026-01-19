#!/usr/bin/env python3
"""
Tablet Configuration Generator

Interactive wizard to generate tablet configurations using the full walkthrough.

Usage:
    tablet-config-generator
    tablet-config-generator --mock
"""

import sys
import argparse
import asyncio
from typing import Optional

try:
    from ..core.walkthrough_controller import WalkthroughController, WalkthroughControllerOptions
    from ..core.hid_reader_factory import HIDReaderFactory
    from .cli_walkthrough_view import CLIWalkthroughView
except ImportError:
    import os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))
    from blankslate.core.walkthrough_controller import WalkthroughController, WalkthroughControllerOptions
    from blankslate.core.hid_reader_factory import HIDReaderFactory
    from blankslate.cli.cli_walkthrough_view import CLIWalkthroughView


async def run_walkthrough(use_mock: bool = False) -> int:
    """
    Run the interactive walkthrough

    Args:
        use_mock: Whether to use mock data

    Returns:
        Exit code (0 for success)
    """
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

        # Run the walkthrough
        await controller.run(force_mock=use_mock)

        return 0

    except KeyboardInterrupt:
        print("\n\nWalkthrough cancelled by user.")
        return 1
    except Exception as e:
        print(f"\n\nError during walkthrough: {e}")
        import traceback
        traceback.print_exc()
        return 1


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description='Interactive Tablet Configuration Generator',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  tablet-config-generator              # Interactive mode with device selection
  tablet-config-generator --mock       # Use mock device for testing

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
        print("\n\nExiting...")
        sys.exit(1)


if __name__ == '__main__':
    main()