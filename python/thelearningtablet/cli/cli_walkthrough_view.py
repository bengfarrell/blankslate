"""
CLI Walkthrough View
Terminal-based UI for the walkthrough process
"""

import json
import asyncio
import inquirer
from colorama import Fore, Style, init as colorama_init
from typing import Optional, Tuple

from ..core.walkthrough_types import (
    StepInfo, CaptureStatus, DetectedButton, DataSource,
    NavigationAction, UserMetadata, DeviceInfo, ByteAnalysis
)

# Initialize colorama
colorama_init(autoreset=True)


class CLIWalkthroughView:
    """
    CLI implementation of the walkthrough view
    Provides terminal-based UI for the configuration walkthrough
    """
    
    def __init__(self):
        self.capture_spinner = None
    
    def show_header(self) -> None:
        """Show walkthrough header"""
        print()
        print(f"{Fore.CYAN}{'=' * 70}")
        print(f"{Fore.CYAN}🎨  TABLET CONFIGURATION WALKTHROUGH")
        print(f"{Fore.CYAN}{'=' * 70}")
        print()
        print("This interactive wizard will help you generate a tablet configuration.")
        print("Follow the on-screen instructions for each step.")
        print()
    
    async def prompt_data_source(self) -> DataSource:
        """Prompt user to select data source"""
        questions = [
            inquirer.List(
                'source',
                message="Select data source",
                choices=[
                    ('Real HID Device', 'device'),
                    ('Mock Device (for testing)', 'mock'),
                    ('Exit', 'exit')
                ]
            )
        ]
        
        answers = inquirer.prompt(questions)
        if not answers:
            return 'exit'
        return answers['source']
    
    async def prompt_device_selection(self, devices: list) -> Optional[DeviceInfo]:
        """Prompt user to select a device"""
        if not devices:
            print(f"{Fore.RED}No HID devices found.")
            return None
        
        print(f"\n{Fore.GREEN}Found {len(devices)} potential tablet device(s):")
        print()
        
        choices = []
        for i, device in enumerate(devices):
            label = f"{device.product_string} (VID: 0x{device.vendor_id:04x}, PID: 0x{device.product_id:04x})"
            choices.append((label, device))
        
        choices.append(('Cancel', None))
        
        questions = [
            inquirer.List(
                'device',
                message="Select your tablet device",
                choices=choices
            )
        ]
        
        answers = inquirer.prompt(questions)
        if not answers:
            return None
        return answers['device']
    
    def show_step_info(self, step_info: StepInfo) -> None:
        """Show information about current step"""
        print()
        print(f"{Fore.CYAN}{'=' * 70}")
        print(f"{Fore.CYAN}Step {step_info.number}: {step_info.title}")
        print(f"{Fore.CYAN}{'=' * 70}")
        print()
        print(f"{Fore.YELLOW}{step_info.description}")
        print()
        print(f"{Fore.WHITE}{step_info.instructions}")
        print()
    
    def on_capture_start(self) -> None:
        """Called when capture starts"""
        print(f"{Fore.GREEN}📡 Capturing data...")
        print(f"{Fore.YELLOW}Perform the gesture now. Press Enter when done.")
        print()

    def on_capture_progress(self, status: CaptureStatus) -> None:
        """Called during capture with progress updates"""
        import sys
        # Show real-time packet count on same line
        sys.stdout.write(f"\r{Fore.CYAN}  Packets: {status.packet_count}  "
                        f"Duplicates filtered: {status.duplicates_filtered}  "
                        f"Idle filtered: {status.idle_filtered}  ")
        sys.stdout.flush()

    def on_capture_complete(self, status: CaptureStatus) -> None:
        """Called when capture completes"""
        print()
        print(f"{Fore.GREEN}✓ Capture complete!")
        print(f"  Packets captured: {status.packet_count}")
        print(f"  Duplicates filtered: {status.duplicates_filtered}")
        print(f"  Idle packets filtered: {status.idle_filtered}")
        print()

    def on_bytes_detected(self, bytes_info: list) -> None:
        """Called when bytes are detected after capture"""
        if not bytes_info:
            print(f"{Fore.YELLOW}  No significant bytes detected")
            return

        print(f"{Fore.GREEN}✓ Bytes detected:")
        for byte_info in bytes_info:
            if isinstance(byte_info, ByteAnalysis):
                print(f"  Byte {byte_info.byte_index}: "
                      f"min={byte_info.min}, max={byte_info.max}, "
                      f"variance={byte_info.variance}")
            else:
                print(f"  {byte_info}")
        print()

    async def wait_for_gesture_complete(self) -> None:
        """Wait for user to complete gesture"""
        # In CLI, we just wait for Enter key
        await asyncio.get_event_loop().run_in_executor(None, input)
    
    async def prompt_navigation(self) -> NavigationAction:
        """Prompt for navigation action"""
        questions = [
            inquirer.List(
                'action',
                message="What would you like to do?",
                choices=[
                    ('→ Next step', 'next'),
                    ('↻ Retry this step', 'retry'),
                    ('← Previous step', 'previous'),
                    ('✕ Cancel walkthrough', 'cancel')
                ]
            )
        ]
        
        answers = inquirer.prompt(questions)
        if not answers:
            return 'cancel'
        return answers['action']
    
    async def prompt_button_count(self) -> int:
        """Prompt for number of tablet buttons"""
        questions = [
            inquirer.Text(
                'count',
                message="How many express keys/buttons does your tablet have? (0-8)",
                validate=lambda _, x: x.isdigit() and 0 <= int(x) <= 8
            )
        ]
        
        answers = inquirer.prompt(questions)
        if not answers:
            return 0
        return int(answers['count'])

    def show_button_detection_start(self, total_buttons: int) -> None:
        """Show button detection start message"""
        print()
        print(f"{Fore.CYAN}{'=' * 70}")
        print(f"{Fore.CYAN}🔘 Button Detection")
        print(f"{Fore.CYAN}{'=' * 70}")
        print()
        print(f"We'll now detect {total_buttons} button(s).")
        print(f"For each button, press it {Fore.YELLOW}3 times{Fore.RESET} when prompted.")
        print()

    def show_button_detection_prompt(self, button_number: int) -> None:
        """Show prompt for detecting a specific button"""
        print(f"{Fore.YELLOW}Press button #{button_number} three times (or press Enter to skip)...")

    def show_button_detected(self, button: DetectedButton) -> None:
        """Show that a button was detected"""
        # CLI only supports HID detection (keyboard detection is web-only)
        print(f"{Fore.GREEN}✓ Button #{button.button_number} detected: "
              f"status=0x{button.byte_index:02x}, scanCode={button.bit_position}")
        print()

    def show_button_skipped(self, button_number: int) -> None:
        """Show that a button was skipped"""
        print(f"{Fore.YELLOW}⊘ Button #{button_number} skipped")
        print()

    def show_button_detection_summary(self, buttons: list, total_expected: int) -> None:
        """Show summary of button detection"""
        print()
        print(f"{Fore.CYAN}{'=' * 70}")
        print(f"{Fore.CYAN}Button Detection Summary")
        print(f"{Fore.CYAN}{'=' * 70}")
        print()
        print(f"Detected {len(buttons)} of {total_expected} button(s)")
        if buttons:
            for button in buttons:
                print(f"  Button #{button.button_number}: "
                      f"status=0x{button.byte_index:02x}, scanCode={button.bit_position}")
        print()

    async def prompt_metadata(self) -> UserMetadata:
        """Prompt for device metadata"""
        print()
        print(f"{Fore.CYAN}{'=' * 70}")
        print(f"{Fore.CYAN}Device Information")
        print(f"{Fore.CYAN}{'=' * 70}")
        print()
        print("Please provide information about your tablet device.")
        print()
        
        questions = [
            inquirer.Text(
                'name',
                message="Device name (e.g., 'My Tablet')",
                default="My Tablet"
            ),
            inquirer.Text(
                'manufacturer',
                message="Manufacturer (e.g., 'Wacom', 'XP-Pen', 'Huion')",
                default="Unknown"
            ),
            inquirer.Text(
                'model',
                message="Model (e.g., 'Intuos S', 'Deco 640')",
                default="Unknown"
            ),
            inquirer.Text(
                'description',
                message="Description (optional)",
                default=""
            )
        ]
        
        answers = inquirer.prompt(questions)
        if not answers:
            return UserMetadata(
                name="My Tablet",
                manufacturer="Unknown",
                model="Unknown",
                description="",
                button_count=0
            )
        
        description = answers['description'] or f"{answers['manufacturer']} {answers['model']}"
        
        return UserMetadata(
            name=answers['name'],
            manufacturer=answers['manufacturer'],
            model=answers['model'],
            description=description,
            button_count=0
        )
    
    def show_completion(self, config: dict) -> None:
        """Show completion message"""
        print()
        print(f"{Fore.GREEN}{'=' * 70}")
        print(f"{Fore.GREEN}✓ CONFIGURATION COMPLETE!")
        print(f"{Fore.GREEN}{'=' * 70}")
        print()
        print("Your tablet configuration has been generated successfully.")
        print()
        
        if config:
            print(f"{Fore.CYAN}Configuration Summary:")
            print(f"  Device: {config.get('name', 'Unknown')}")
            print(f"  Manufacturer: {config.get('manufacturer', 'Unknown')}")
            print(f"  Model: {config.get('model', 'Unknown')}")
            
            capabilities = config.get('capabilities', {})
            print(f"\n{Fore.CYAN}Detected Capabilities:")
            print(f"  Pressure: {capabilities.get('hasPressure', False)}")
            print(f"  Pressure Levels: {capabilities.get('pressureLevels', 0)}")
            print(f"  Tilt: {capabilities.get('hasTilt', False)}")
            print(f"  Buttons: {capabilities.get('buttonCount', 0)}")
            
            resolution = capabilities.get('resolution', {})
            print(f"  Resolution: {resolution.get('x', 0)} x {resolution.get('y', 0)}")
            print()
    
    async def prompt_save_config(self, config: dict) -> Tuple[bool, Optional[str]]:
        """Prompt to save configuration"""
        questions = [
            inquirer.Confirm(
                'save',
                message="Would you like to save this configuration?",
                default=True
            )
        ]
        
        answers = inquirer.prompt(questions)
        if not answers or not answers['save']:
            return False, None
        
        # Prompt for filename
        default_name = config.get('name', 'my-tablet').lower().replace(' ', '-')
        default_filename = f"{default_name}-config.json"
        
        questions = [
            inquirer.Text(
                'filename',
                message="Enter filename",
                default=default_filename
            )
        ]
        
        answers = inquirer.prompt(questions)
        if not answers:
            return False, None
        
        filename = answers['filename']
        if not filename.endswith('.json'):
            filename += '.json'
        
        # Save the file
        try:
            with open(filename, 'w') as f:
                json.dump(config, f, indent=2)
            return True, filename
        except Exception as e:
            self.show_error(f"Failed to save configuration: {e}")
            return False, None
    
    def show_error(self, message: str) -> None:
        """Show error message"""
        print(f"{Fore.RED}✗ Error: {message}")
        print()
    
    def show_info(self, message: str) -> None:
        """Show info message"""
        print(f"{Fore.CYAN}ℹ {message}")
        print()
    
    def show_success(self, message: str) -> None:
        """Show success message"""
        print(f"{Fore.GREEN}✓ {message}")
        print()
    
    def show_detected_bytes(self, bytes_info: list) -> None:
        """Show detected bytes information"""
        if not bytes_info:
            print(f"{Fore.YELLOW}  No significant bytes detected")
            return
        
        print(f"{Fore.GREEN}  Detected bytes:")
        for byte_info in bytes_info:
            if isinstance(byte_info, ByteAnalysis):
                print(f"    Byte {byte_info.byte_index}: "
                      f"min={byte_info.min}, max={byte_info.max}, "
                      f"variance={byte_info.variance}")
            else:
                print(f"    {byte_info}")
        print()