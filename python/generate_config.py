#!/usr/bin/env python3
"""
Standalone config generator - structured like view_events.py
Run as a direct script (not with -m) so Ctrl+C works in WebStorm terminal

Usage:
    python generate_config.py
    python generate_config.py --mock
    python generate_config.py --output my-config.json
    python generate_config.py --record captured-data.json
"""
import sys
import os
import argparse
import asyncio
import signal
import json
from datetime import datetime
from typing import Optional

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


def save_recorded_data(controller: WalkthroughController, output_path: str) -> None:
    """
    Save all captured step data to a JSON file.

    Args:
        controller: The walkthrough controller with captured data
        output_path: Path to write the JSON file
    """
    engine = controller.engine
    state = engine.get_state()
    device_info = engine.get_device_info()

    # Build the recorded data structure
    recorded_data = {
        'timestamp': datetime.now().isoformat(),
        'device': {
            'vendorId': f"0x{device_info.vendor_id:04x}" if device_info else None,
            'productId': f"0x{device_info.product_id:04x}" if device_info else None,
            'productName': device_info.product_string if device_info else None,
        } if device_info else None,
        'steps': {}
    }

    # Add data for each step
    for step_name, step_data in state.step_data.items():
        # Convert packets (bytes) to hex strings for JSON serialization
        packets_hex = [packet.hex() for packet in step_data.packets]

        # Convert detected bytes to serializable format
        detected_bytes = []
        for byte_analysis in step_data.detected_bytes:
            detected_bytes.append({
                'byteIndex': byte_analysis.byte_index,
                'variance': byte_analysis.variance,
                'min': byte_analysis.min,
                'max': byte_analysis.max,
            })

        recorded_data['steps'][step_name] = {
            'packetCount': len(step_data.packets),
            'packets': packets_hex,
            'detectedBytes': detected_bytes,
        }

    # Write to file
    with open(output_path, 'w') as f:
        json.dump(recorded_data, f, indent=2)

    print(f"\n📝 Recorded data saved to: {output_path}")


async def run_walkthrough(use_mock: bool = False, record_path: Optional[str] = None) -> int:
    """
    Run the interactive walkthrough

    Args:
        use_mock: Whether to use mock data
        record_path: Optional path to save recorded step data

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

        # Save recorded data if requested
        if record_path:
            save_recorded_data(controller, record_path)

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
  python generate_config.py --record captured-data.json  # Save all captured packets

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
    parser.add_argument(
        '-r', '--record',
        metavar='FILE',
        help='Save all captured packet data to a JSON file (organized by step)'
    )

    args = parser.parse_args()

    # Run the async walkthrough
    try:
        exit_code = asyncio.run(run_walkthrough(use_mock=args.mock, record_path=args.record))
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\n\n🛑 Exiting...")
        sys.exit(1)


if __name__ == '__main__':
    main()