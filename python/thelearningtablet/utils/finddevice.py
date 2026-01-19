import sys
import time
import threading
from typing import Dict, Optional, Any, List, Tuple, Callable

import hid

DEBUG = False


def _normalize_filter_key(filter_key: str) -> str:
    """Convert filter key to HID device info key."""
    key_mapping = {
        'vendorId': 'vendor_id',
        'productId': 'product_id',
        'product': 'product_string',
        'usage': 'usage',
        'interface': 'interface_number'
    }
    return key_mapping.get(filter_key, filter_key)


def _device_matches_filter(device_info: Dict[str, Any], filter_values: Dict[str, Any]) -> bool:
    """
    Check if a device matches the given filter criteria.
    
    Args:
        device_info: HID device information
        filter_values: Filter criteria to match against
        
    Returns:
        True if device matches all filter criteria
    """
    for filter_key, filter_value in filter_values.items():
        device_key = _normalize_filter_key(filter_key)
        
        if device_key not in device_info:
            return False
        
        device_value = device_info[device_key]
        
        # Handle hex string values (e.g., "0x28bd")
        if isinstance(filter_value, str) and filter_value.startswith('0x'):
            try:
                filter_int = int(filter_value, 16)
                if device_value != filter_int:
                    return False
            except ValueError:
                return False
        # Handle integer comparisons
        elif isinstance(device_value, int) and isinstance(filter_value, str) and filter_value.isdigit():
            if device_value != int(filter_value):
                return False
        elif isinstance(device_value, int) and isinstance(filter_value, int):
            if device_value != filter_value:
                return False
        # Handle string comparisons
        elif str(device_value) != str(filter_value):
            return False
    
    return True


def find_and_open_device(tablet_config: Dict[str, Any]) -> Optional[Any]:
    """
    Find and open a tablet device based on config.
    Handles filtering out byteCodeMappings and metadata automatically.
    
    Args:
        tablet_config: Drawing tablet configuration (from startupConfiguration.drawingTablet)
        
    Returns:
        Opened HID device, or None if not found
    """
    if not tablet_config:
        print("[FindDevice] No tablet configuration provided")
        return None
    
    # Extract only device identification keys, not byte code mappings or metadata
    device_filter = {k: v for k, v in tablet_config.items() 
                    if k not in ['byteCodeMappings', '_driverName', '_driverInfo', 'reportId']}
    
    if not device_filter:
        print("[FindDevice] No device filter criteria found in config")
        return None
    
    return get_tablet_device(device_filter)


def find_and_open_all_interfaces(tablet_config: Dict[str, Any]) -> list:
    """
    Find and open specified tablet device interfaces.
    Some tablets (like XP-Pen on Linux) split stylus and buttons across different interfaces.
    
    Uses 'interfaces' array from config if specified, otherwise opens all matching interfaces.
    
    Args:
        tablet_config: Drawing tablet configuration (from startupConfiguration.drawingTablet)
        
    Returns:
        List of tuples: [(interface_num, device), ...]
    """
    if not tablet_config:
        print("[FindDevice] No tablet configuration provided")
        return []
    
    # Check if specific interfaces are requested
    requested_interfaces = tablet_config.get('interfaces')
    
    # Extract device identification but remove interface-related filters
    device_filter = {k: v for k, v in tablet_config.items() 
                    if k not in ['byteCodeMappings', '_driverName', '_driverInfo', 'reportId', 'interfaces']}
    
    if not device_filter:
        print("[FindDevice] No device filter criteria found in config")
        return []
    
    # Get all devices matching filter (without interface requirement)
    try:
        devices = hid.enumerate()
        matching_devices = []
        
        for device_info in devices:
            if _device_matches_filter(device_info, device_filter):
                interface_num = device_info.get('interface_number', -1)
                # If specific interfaces requested, filter by them
                if requested_interfaces is not None:
                    if interface_num in requested_interfaces:
                        matching_devices.append(device_info)
                else:
                    # No specific interfaces requested, use all matches
                    matching_devices.append(device_info)
        
        if not matching_devices:
            print('[FindDevice] Could not find any matching HID devices')
            if requested_interfaces:
                print(f'[FindDevice] Looking for interfaces: {requested_interfaces}')
            return []
        
        if requested_interfaces:
            print(f"[FindDevice] Found {len(matching_devices)} matching interface(s): {[d.get('interface_number', -1) for d in matching_devices]}")
        else:
            print(f"[FindDevice] Found {len(matching_devices)} matching interface(s)")
        
        # Open all matching interfaces
        opened_devices = []
        for device_info in matching_devices:
            interface_num = device_info.get('interface_number', -1)
            try:
                device = hid.device()
                if 'path' in device_info and device_info['path']:
                    device.open_path(device_info['path'])
                    print(f'[FindDevice] Opened interface {interface_num} by path')
                else:
                    device.open(device_info['vendor_id'], device_info['product_id'])
                    print(f'[FindDevice] Opened interface {interface_num} by ID')
                opened_devices.append((interface_num, device))
            except Exception as e:
                print(f'[FindDevice] Error opening interface {interface_num}: {e}')
        
        return opened_devices
        
    except Exception as e:
        print(f'[FindDevice] Error enumerating devices: {e}')
        return []


def auto_detect_device(driver_profiles: List[Tuple[str, Dict[str, Any]]]) -> Optional[str]:
    """
    Auto-detect which driver profile matches a connected HID device.
    
    Args:
        driver_profiles: List of (driver_name, driver_config) tuples
        
    Returns:
        Driver name if a match is found, None otherwise
    """
    if not driver_profiles:
        print("[FindDevice] No driver profiles provided for auto-detection")
        return None
    
    print(f"[FindDevice] Auto-detecting device...")
    
    # Get all connected HID devices
    try:
        devices = hid.enumerate()
        print(f"[FindDevice] Found {len(devices)} HID devices")
    except Exception as e:
        print(f"[FindDevice] Error enumerating HID devices: {e}")
        return None
    
    print(f"[FindDevice] Checking against {len(driver_profiles)} driver profiles...")
    
    # Try to match each device against each driver
    for device_info in devices:
        for driver_name, driver_config in driver_profiles:
            # Get deviceInfo filter from driver config
            if 'deviceInfo' not in driver_config:
                continue
            
            # Remove 'interfaces' from filter since enumeration only has 'interface_number'
            device_filter = {k: v for k, v in driver_config['deviceInfo'].items() 
                           if k != 'interfaces'}
            
            if _device_matches_filter(device_info, device_filter):
                device_name = driver_config.get('name', driver_name)
                print(f"[FindDevice] ✓ Auto-detected: {device_name} (driver: {driver_name})")
                return driver_name
    
    print("[FindDevice] No matching driver profile found for connected devices")
    return None

def get_tablet_device(filter_values: Dict[str, str]) -> Optional[Any]:
    try:
        devices = hid.enumerate()

        if DEBUG:
            print(f"Found {len(devices)} HID devices")
        
            # Debug: Show all available devices
            print("Available HID devices:")
            for i, device_info in enumerate(devices):
                print(f"  Device {i}:")
                for key, value in device_info.items():
                    if isinstance(value, int):
                        print(f"    {key}: {value} (0x{value:04x})")
                    else:
                        print(f"    {key}: {value}")
            
    except Exception as e:
        print(f'Error enumerating HID devices: {e}')
        return None
    
    # Filter devices based on the provided criteria
    matching_devices = []
    for i, device_info in enumerate(devices):
        if DEBUG:
            print(f"\nChecking device {i}: {device_info.get('product_string', 'Unknown')}")
        
        if _device_matches_filter(device_info, filter_values):
            matching_devices.append(device_info)

    if not matching_devices:
        print('Could not find matching HID device')
        return None
    
    # Try to open the first matching device
    if matching_devices:
        device_info = matching_devices[0]
        print(f"Attempting to open device: {device_info}")

        try:
            device = hid.device()

            # Try opening by path first (preferred for exclusive access)
            if 'path' in device_info and device_info['path']:
                print(f"Opening device by path: {device_info['path']}")
                device.open_path(device_info['path'])
                print('Device opened successfully by path')
            else:
                # Fallback to vendor/product ID
                print(f"Opening device by vendor/product ID: 0x{device_info['vendor_id']:04x}/0x{device_info['product_id']:04x}")
                device.open(device_info['vendor_id'], device_info['product_id'])
                print('Device opened successfully by vendor/product ID')

            # Test if device is working by trying to get manufacturer string
            try:
                manufacturer = device.get_manufacturer_string()
                product = device.get_product_string()
                print(f"Device info - Manufacturer: {manufacturer}, Product: {product}")
            except:
                print("Could not get device strings (this might be normal)")

            # Set device to non-blocking mode for better performance
            try:
                device.set_nonblocking(1)
                print("Set device to non-blocking mode")
            except Exception as e:
                print(f"Could not set non-blocking mode: {e}")

            # Note about exclusive access:
            # On Linux with hidraw backend, open_path() provides exclusive access by default
            # On macOS, hidapi opens in non-exclusive mode by default (allows OS to process input)
            # The Python hid library doesn't expose the macOS-specific exclusive mode API
            #
            # Workaround for macOS users:
            # - Disable "Use tablet as mouse" in your tablet driver settings, OR
            # - Use a tool like Karabiner-Elements to grab the device, OR
            # - Close/disable the tablet driver while using this tool
            import platform
            if platform.system() == 'Darwin':  # macOS
                print("\n⚠️  macOS Note: The tablet may still control the mouse cursor.")
                print("   To prevent this, disable 'Use as mouse' in your tablet driver settings.")
                print("   Or temporarily close/disable your tablet driver.\n")

            return device

        except Exception as e:
            print(f'Error opening device: {e}')
            print(f'Device info was: {device_info}')
            return None
    
    return None


class HotplugMonitor:
    """
    Monitors for USB device hotplug events and notifies when a matching device is connected.
    """
    
    def __init__(self, driver_profiles: List[Tuple[str, Dict[str, Any]]], 
                 on_device_connected: Callable[[str, Dict[str, Any], Any], None],
                 on_device_disconnected: Optional[Callable[[], None]] = None,
                 check_interval: float = 2.0):
        """
        Initialize hotplug monitor.
        
        Args:
            driver_profiles: List of (driver_name, driver_config) tuples to match against
            on_device_connected: Callback(driver_name, driver_config, device) when device is found
            on_device_disconnected: Callback when a known device is disconnected
            check_interval: How often to check for new devices (seconds)
        """
        self.driver_profiles = driver_profiles
        self.on_device_connected = on_device_connected
        self.on_device_disconnected = on_device_disconnected
        self.check_interval = check_interval
        self._running = False
        self._thread = None
        self._known_devices = set()
        self._connected_device_id = None  # Track the device we're currently using
        
        print(f"[Hotplug] Monitor initialized, checking every {check_interval}s")
    
    def start(self):
        """Start monitoring for device connections."""
        if self._running:
            print("[Hotplug] Monitor already running")
            return
        
        self._running = True
        self._thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self._thread.start()
        print("[Hotplug] Monitor started")
    
    def stop(self):
        """Stop monitoring for device connections."""
        if not self._running:
            return
        
        print("[Hotplug] Stopping monitor...")
        self._running = False
        if self._thread:
            self._thread.join(timeout=self.check_interval + 1.0)
        print("[Hotplug] Monitor stopped")
    
    def register_connected_device(self, tablet_config: Dict[str, Any]):
        """
        Register a device that was opened at startup so the monitor knows to watch for its disconnection.
        
        Args:
            tablet_config: The tablet configuration with device info
        """
        try:
            devices = hid.enumerate()
            device_filter = {k: v for k, v in tablet_config.items() 
                           if k not in ['byteCodeMappings', '_driverName', '_driverInfo', 'reportId', 'interfaces']}
            
            for device_info in devices:
                if _device_matches_filter(device_info, device_filter):
                    device_id = self._get_device_id(device_info)
                    self._connected_device_id = device_id
                    print(f"[Hotplug] Registered initial device with ID: {device_id}")
                    return
            
            print(f"[Hotplug] Warning: Could not find device to register")
        except Exception as e:
            print(f"[Hotplug] Error registering initial device: {e}")
    
    def _get_device_id(self, device_info: Dict[str, Any]) -> str:
        """Generate a unique ID for a device."""
        # Use path if available, otherwise use vendor/product/interface
        if 'path' in device_info and device_info['path']:
            return device_info['path'].decode('utf-8') if isinstance(device_info['path'], bytes) else str(device_info['path'])
        
        return f"{device_info.get('vendor_id', 0)}:{device_info.get('product_id', 0)}:{device_info.get('interface_number', -1)}"
    
    def _monitor_loop(self):
        """Main monitoring loop running in background thread."""
        # Initial scan to populate known devices
        try:
            devices = hid.enumerate()
            for device_info in devices:
                device_id = self._get_device_id(device_info)
                self._known_devices.add(device_id)
        except Exception as e:
            print(f"[Hotplug] Error during initial scan: {e}")
        
        while self._running:
            try:
                # Check for new devices
                current_devices = hid.enumerate()
                current_device_ids = set()
                
                for device_info in current_devices:
                    device_id = self._get_device_id(device_info)
                    current_device_ids.add(device_id)
                    
                    # Check if this is a newly connected device
                    if device_id not in self._known_devices:
                        # Check if it matches any driver profile
                        for driver_name, driver_config in self.driver_profiles:
                            if 'deviceInfo' not in driver_config:
                                continue
                            
                            # Remove 'interfaces' from filter since enumeration only has 'interface_number'
                            device_filter = {k: v for k, v in driver_config['deviceInfo'].items() 
                                           if k != 'interfaces'}
                            
                            if _device_matches_filter(device_info, device_filter):
                                device_name = driver_config.get('name', driver_name)
                                print(f"[Hotplug] New device detected: {device_name}")
                                
                                # Try to open the device
                                try:
                                    device = hid.device()
                                    if 'path' in device_info and device_info['path']:
                                        device.open_path(device_info['path'])
                                    else:
                                        device.open(device_info['vendor_id'], device_info['product_id'])
                                    
                                    # Notify callback
                                    self.on_device_connected(driver_name, driver_config, device)
                                    # Track this device as the connected one
                                    self._connected_device_id = device_id
                                    break  # Stop checking other profiles for this device
                                    
                                except Exception as e:
                                    print(f"[Hotplug] Error opening device: {e}")
                
                # Check if the connected device was disconnected
                if self._connected_device_id and self._connected_device_id not in current_device_ids:
                    if self.on_device_disconnected:
                        self.on_device_disconnected()
                    self._connected_device_id = None
                
                # Update known devices
                self._known_devices = current_device_ids
                
            except Exception as e:
                print(f"[Hotplug] Error during monitoring: {e}")
            
            # Wait before next check
            time.sleep(self.check_interval)