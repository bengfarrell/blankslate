"""
HID Reader Factory
Creates HID readers for real devices and mock devices
"""

from typing import Optional, List, Callable
from pathlib import Path
from ..mockbytes import create_mock_hid_reader, MockHIDReader, create_config_based_generator
from ..core.walkthrough_types import DeviceInfo


class MultiInterfaceHIDReader:
    """
    Wrapper that reads from multiple HID interfaces simultaneously.
    This is needed for tablets that split pen and button data across different interfaces.
    """

    def __init__(self, devices: List, device_infos: List = None):
        """
        Initialize multi-interface reader

        Args:
            devices: List of opened HID device objects
            device_infos: List of device info dicts (one per device)
        """
        self.devices = devices
        self.device_infos = device_infos or []
        self.callbacks = []
        self.is_reading = False
        self.read_threads = []
        self.active_interfaces = set()  # Track which interfaces send data
        self.detected_report_ids = set()  # Track report IDs seen
        import threading
        self.threading = threading

    def start_reading(self, callback: Callable):
        """Start reading from all devices"""
        # If already reading, just swap the callback without stopping threads
        if self.is_reading:
            self.callbacks = [callback]
            return

        # Clear old callbacks and set new one
        self.callbacks = [callback]
        self.is_reading = True

        # Start a thread for each device
        for i, device in enumerate(self.devices):
            device.set_nonblocking(1)
            thread = self.threading.Thread(
                target=self._read_loop,
                args=(device, i),
                daemon=True
            )
            thread.start()
            self.read_threads.append(thread)

    def _get_interface_type(self, device_index: int) -> str:
        """
        Determine the interface type based on usage page and usage.

        Returns:
            'keyboard' for keyboard HID interface (Usage Page 1, Usage 6)
            'digitizer' for digitizer interface (Usage Page 13)
            'other' for other interfaces
        """
        if device_index >= len(self.device_infos):
            return 'other'

        info = self.device_infos[device_index]
        usage_page = info.get('usage_page', 0)
        usage = info.get('usage', 0)

        if usage_page == 1 and usage == 6:
            return 'keyboard'
        elif usage_page == 13:
            return 'digitizer'
        else:
            return 'other'

    def _read_loop(self, device, device_index):
        """Background thread that continuously reads from a single device"""
        import time

        interface_type = self._get_interface_type(device_index)

        while self.is_reading:
            try:
                data = device.read(64, timeout_ms=10)
                if data:
                    # Extract report ID (first byte) for tracking
                    report_id = data[0] if len(data) > 0 else None

                    # Track which interface sent data
                    if device_index < len(self.device_infos):
                        usage_page = self.device_infos[device_index].get('usage_page')
                        if usage_page and usage_page not in self.active_interfaces:
                            self.active_interfaces.add(usage_page)

                    # Track report IDs
                    if report_id is not None:
                        self.detected_report_ids.add(report_id)

                    # Pass FULL data (including report ID at byte 0) to match stable config byte indices
                    # The stable config has: status at [1], x at [2,3], y at [4,5], etc.
                    # This requires report ID at byte 0
                    # Also pass interface_type so button detection knows how to parse the packet
                    for callback in self.callbacks:
                        try:
                            callback(bytes(data), report_id, interface_type)
                        except TypeError:
                            # Fall back to old signatures for backwards compatibility
                            try:
                                callback(bytes(data), report_id)
                            except TypeError:
                                callback(bytes(data))
            except Exception:
                # Device might have been disconnected
                break
            time.sleep(0.001)

    def stop_reading(self):
        """Stop reading from all devices"""
        self.is_reading = False
        # Wait for threads to finish
        for thread in self.read_threads:
            thread.join(timeout=1.0)
        self.read_threads.clear()

    def close(self):
        """Close all devices"""
        self.stop_reading()
        for device in self.devices:
            try:
                device.close()
            except Exception:
                pass  # Ignore close errors

    @property
    def device_info(self):
        """Return device info (for compatibility)"""
        # Return info from first device if available
        if self.device_infos:
            return self.device_infos[0]
        return {
            'vendor_id': 0,
            'product_id': 0,
            'product_name': f'Multi-interface device ({len(self.devices)} interfaces)'
        }

    def get_active_interfaces(self):
        """Get list of interface usage pages that have sent data"""
        return sorted(list(self.active_interfaces))

    def get_detected_report_ids(self):
        """Get set of report IDs that have been seen"""
        return self.detected_report_ids


class HIDReaderFactory:
    """
    Factory for creating HID readers
    Supports both real HID devices and mock devices
    """
    
    async def create_device_reader(self, device_info: DeviceInfo):
        """
        Create a reader for a real HID device
        
        Args:
            device_info: Device information
        
        Returns:
            HID reader instance or None if failed
        """
        try:
            import hid

            # Open the device
            device = hid.device()

            # Use path if available (opens specific interface), otherwise use vendor/product ID
            try:
                if device_info.path:
                    device.open_path(device_info.path)
                else:
                    device.open(device_info.vendor_id, device_info.product_id)
            except OSError as e:
                # Provide more helpful error messages for common issues
                error_msg = str(e)
                if "open failed" in error_msg.lower():
                    raise OSError(
                        f"Failed to open device (vendor: 0x{device_info.vendor_id:04x}, "
                        f"product: 0x{device_info.product_id:04x}). "
                        f"This may be due to:\n"
                        f"  1. Insufficient permissions (try running with sudo)\n"
                        f"  2. Device already in use by another process\n"
                        f"  3. Device driver conflict\n"
                        f"Original error: {error_msg}"
                    ) from e
                raise
            
            # Create a simple wrapper that implements the reader interface
            class RealHIDReader:
                def __init__(self, hid_device):
                    self.device = hid_device
                    self.callback = None
                    self.is_reading = False
                    self.read_thread = None
                    import threading
                    self.threading = threading

                def start_reading(self, callback):
                    """Start reading from device in a background thread"""
                    self.callback = callback
                    self.is_reading = True

                    # Set device to non-blocking mode
                    # This is CRITICAL on macOS - actively reading from the device
                    # causes the OS to suppress mouse input automatically
                    self.device.set_nonblocking(1)

                    # Start background thread for continuous reading
                    self.read_thread = self.threading.Thread(target=self._read_loop, daemon=True)
                    self.read_thread.start()

                def _read_loop(self):
                    """Background thread that continuously reads from device"""
                    import time
                    while self.is_reading:
                        try:
                            data = self.device.read(64)
                            if data:
                                if self.callback:
                                    # Extract report ID (first byte) for tracking
                                    report_id = data[0] if len(data) > 0 else None

                                    try:
                                        # Pass FULL data (including report ID at byte 0)
                                        # to match stable config byte indices
                                        self.callback(bytes(data), report_id)
                                    except TypeError:
                                        # Fall back to old signature for backwards compatibility
                                        self.callback(bytes(data))
                            else:
                                # Small sleep when no data to prevent CPU spinning
                                time.sleep(0.001)
                        except Exception as e:
                            # Handle errors silently unless it's a disconnect
                            if "read error" in str(e).lower():
                                self.is_reading = False
                                break
                            time.sleep(0.01)

                def stop_reading(self):
                    """Stop reading from device"""
                    self.is_reading = False
                    if self.read_thread:
                        self.read_thread.join(timeout=1.0)
                        self.read_thread = None

                async def close(self):
                    """Close the device"""
                    self.stop_reading()
                    if self.device:
                        self.device.close()

                def read_packet(self):
                    """Read a single packet (for polling) - deprecated, use start_reading instead"""
                    if self.device and self.is_reading:
                        data = self.device.read(64, timeout_ms=10)
                        if data and self.callback:
                            self.callback(bytes(data))
            
            return RealHIDReader(device)
        
        except Exception as e:
            print(f"Error creating device reader: {e}")
            return None
    
    async def create_multi_interface_reader(self, vendor_id: int, product_id: int):
        """
        Create a reader that opens ALL interfaces for a device - async version.
        This is needed for tablets that split pen and button data across interfaces.

        Args:
            vendor_id: USB vendor ID
            product_id: USB product ID

        Returns:
            MultiInterfaceHIDReader instance or None if failed
        """
        return self.create_multi_interface_reader_sync(vendor_id, product_id)

    def create_multi_interface_reader_sync(self, vendor_id: int, product_id: int):
        """
        Create a reader that opens ALL interfaces for a device - synchronous version.
        This is needed for tablets that split pen and button data across interfaces.

        Args:
            vendor_id: USB vendor ID
            product_id: USB product ID

        Returns:
            MultiInterfaceHIDReader instance or None if failed
        """
        try:
            import hid

            # Enumerate all devices
            all_devices = hid.enumerate(vendor_id, product_id)

            if not all_devices:
                print(f"[HIDReaderFactory] No devices found for vendor:0x{vendor_id:04x} product:0x{product_id:04x}")
                return None

            # Group by unique paths
            unique_paths = {}
            for device_info in all_devices:
                path = device_info.get('path')
                if path and path not in unique_paths:
                    unique_paths[path] = device_info

            # Try to open all interfaces
            opened_devices = []
            device_infos = []

            for path, device_info in unique_paths.items():
                try:
                    device = hid.device()
                    device.open_path(path)
                    opened_devices.append(device)
                    device_infos.append(device_info)
                except Exception:
                    pass  # Skip interfaces that can't be opened

            if not opened_devices:
                return None

            # Wrap in multi-interface reader
            return MultiInterfaceHIDReader(opened_devices, device_infos)

        except Exception:
            return None

    async def create_mock_reader(self) -> MockHIDReader:
        """
        Create a mock HID reader with config-based generator
        Uses the XP-Pen config for realistic mock data

        Returns:
            MockHIDReader instance
        """
        # Find the XP-Pen config file
        # Look in public/configs relative to the project root
        config_path = Path(__file__).parent.parent.parent.parent / 'public' / 'configs' / 'xp-pen-deco640-osx-python-nodriver.json'

        if not config_path.exists():
            # Fallback to default mock reader if config not found
            return create_mock_hid_reader()

        # Create config-based generator
        generator = create_config_based_generator(str(config_path))

        # Create mock reader with the config-based generator
        return MockHIDReader(custom_generator=generator)
    
    async def list_devices(self) -> List[DeviceInfo]:
        """
        List available HID devices

        Returns:
            List of device information (one entry per unique vendor/product ID with all interfaces)
        """
        try:
            import hid

            devices = hid.enumerate()

            # Group devices by vendor_id + product_id to collect all interfaces
            device_map = {}

            for device in devices:
                # Filter for potential tablet devices (digitizer usage page)
                usage_page = device.get('usage_page', 0)
                product_string = device.get('product_string', '').lower()

                if usage_page == 13 or 'tablet' in product_string or 'pen' in product_string:
                    vendor_id = device.get('vendor_id', 0)
                    product_id = device.get('product_id', 0)
                    key = (vendor_id, product_id)

                    if key not in device_map:
                        device_map[key] = {
                            'vendor_id': vendor_id,
                            'product_id': product_id,
                            'product_string': device.get('product_string', 'Unknown'),
                            'usage_page': usage_page,
                            'usage': device.get('usage', 0),
                            'interfaces': [],
                            'path': device.get('path', b'')  # Store first path
                        }

                    # Add interface number if not already in list
                    interface_num = device.get('interface_number', 0)
                    if interface_num not in device_map[key]['interfaces']:
                        device_map[key]['interfaces'].append(interface_num)

            # Convert to DeviceInfo list
            device_list = []
            for device_data in device_map.values():
                device_info = DeviceInfo(
                    vendor_id=device_data['vendor_id'],
                    product_id=device_data['product_id'],
                    product_string=device_data['product_string'],
                    usage_page=device_data['usage_page'],
                    usage=device_data['usage'],
                    interfaces=sorted(device_data['interfaces']),  # Sort for consistency
                    path=device_data['path']
                )
                device_list.append(device_info)

            return device_list
        
        except ImportError:
            print("hidapi not installed. Install with: pip install hidapi")
            return []
        except Exception as e:
            print(f"Error listing devices: {e}")
            return []