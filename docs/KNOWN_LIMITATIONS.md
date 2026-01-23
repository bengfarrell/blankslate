# Known Limitations

This document outlines known limitations of the Blankslate project, particularly around WebHID and driver interactions.

## WebHID Limitations

### Device Ownership

WebHID cannot "own" or exclusively claim a drawing tablet device. By default, the tablet continues to control the system mouse cursor even when connected via WebHID. This means:

- Stylus movements will move your mouse pointer
- Stylus clicks will trigger mouse clicks
- This can make the tablet unusable for drawing applications since input is duplicated

#### Workaround: Driver Mode Toggle

To prevent the tablet from controlling the mouse:

1. **Start the manufacturer's driver application** - This redirects tablet input to go through the driver instead of the system mouse
2. **Stop/quit the driver application** - The tablet remains in "driver mode" but with no active driver to receive the input
3. **The tablet now sends data via WebHID without controlling the mouse** - Input goes nowhere at the system level, but WebHID can still read the raw HID reports

This workaround is necessary for practical use of WebHID with drawing tablets.

### Tablet Button Capture

**Without a driver (driverless mode):**
- WebHID **cannot** capture the raw byte codes for tablet buttons
- The tablet sends default keyboard events (scan codes) for button presses
- These keyboard scan codes are what get recorded in the configuration
- This is specific to WebHID and is used only in that context

**With a driver (driver mode):**
- Button mappings are controlled by the driver software
- Users can customize buttons to perform any action
- Capturing key codes in driver mode doesn't make sense for a global configuration because:
  - The mappings are user-specific and customizable
  - They don't represent the tablet's inherent button behavior
  - Different users will have different driver configurations

### Implications for Configuration Files

The `modes` array in configuration files reflects these differences:

- **Mode 1 (Driver)**: Uses bit-flag button values, doesn't include keyboard scan codes
- **Mode 2 (Driverless)**: Includes `statusOverrides` with keyboard scan codes for button detection

See [CONFIG_SCHEMA.md](./CONFIG_SCHEMA.md) for details on how modes are structured.
