# blankslate Python server

Reference Python implementation of the tablet-to-WebSocket daemon. Reads
HID input reports from a supported tablet, normalises them using the
vendored OpenTabletDriver configs under `configs/` at the repo root
(shared with the Node server), and broadcasts JSON events to any
connected WebSocket client.

## Install

From the repo root:

```bash
cd python
python3 -m venv venv
source venv/bin/activate
pip install -e '.[dev]'
```

`pip install -e .` exposes two console scripts: `blankslate-server` and
`blankslate-udev-rules`. The optional `[dev]` extra adds `pytest` and
`pytest-asyncio` for the test suite.

## Run

```
blankslate-server                       # start the WebSocket server
blankslate-server --list                # enumerate matched HID interfaces
blankslate-server --list-parsers        # show available report parsers
python -m pytest tests/                 # run unit tests
```

On macOS, capturing the auxiliary (express-key) interface requires root
because it surfaces as a keyboard-class HID device; run with `sudo` to
get those events. The pen interface itself does not need root.

### CLI options

| Flag | Default | Description |
|---|---|---|
| `--port <n>` | `8765` | WebSocket port. |
| `--host <addr>` | `0.0.0.0` | WebSocket bind address. |
| `--vid <id>` | — | Force a specific USB vendor ID (e.g. `0x256c`). |
| `--pid <id>` | — | Force a specific USB product ID. |
| `--list` | — | List matching connected devices and exit. |
| `--list-parsers` | — | List parser implementations and exit. |
| `--no-aux` | — | Don't open auxiliary (express-key) HID interfaces. |
| `-v`, `--verbose` | — | Enable debug logging (raw bytes, parser dispatch). |

## Architecture

```
HID interface ─▶ HidReader ─▶ ReportParser ─▶ EventAdapter ─▶ WebSocketServer
                                  │                │
                                  │                └── range overrides from
                                  │                    HID report descriptor
                                  │
                                  └── StandardDigitizerReportParser (UsagePage 0x0D)
                                      or a vendored OTD parser keyed off the
                                      DigitizerIdentifier's ReportParser field
```

`discover()` enumerates every HID interface, matches by `(VendorID,
ProductID)` against the OTD config index, and returns one
`DiscoveredDevice` per interface. `pick_digitizer_interface()` prefers
the standard HID Digitizer collection (`UsagePage = 0x0D`);
`pick_aux_interfaces()` returns the keyboard / consumer-control
collections on other interfaces.

## Report descriptor handling

Where the device exposes a standard HID Digitizer collection, the OTD
config's `MaxX` / `MaxY` / `MaxPressure` describe the *vendor-mode*
coordinate space and don't apply directly. `_apply_descriptor_ranges()`
in `websocket_server.py` calls `HidReader.get_report_descriptor()`
(which wraps `hid.device.get_report_descriptor()` from the `hidapi`
binding), parses out the `Logical Maximum` on the X, Y, and Tip
Pressure usages via `hid_descriptor.pick_pen_ranges()`, and overrides
the `EventAdapter`'s ranges so coordinates normalize correctly.

The Python port relies on hidapi's built-in descriptor support
(available since hidapi 0.14), so a single call suffices on every
platform. The Node port has to layer multiple fallbacks because
node-hid 3.x doesn't expose the binding — see `node/README.md` for
that discussion. The Python implementation is the simpler of the two.

## Other implementation notes

- **Config identification is by VID+PID, with a string-based
  tie-break.** Many vendors (Huion, Gaomon, Artisul, …) share UCLogic
  chipsets and ship the exact same `(VID, PID, InputReportLength)`
  triple, so `ConfigIndex.find()` returns multiple candidates for one
  tablet. `discover()` then calls `pick_best_match()`, which scores
  each candidate against the device's own USB descriptor strings: +2
  if `config.manufacturer` equals the device's `manufacturer_string`
  (case-insensitive), +1 if `config.model` appears in the device's
  `product_string`. Highest score wins; ties (and the all-zero case
  for unknown vendors) fall back to the first candidate in
  alphabetical config-load order. Parser selection and descriptor
  ranges are unaffected — this only changes which config's `name`,
  physical dimensions, and `auxButtonCount` are broadcast in the
  `connected` message.
- **OTD configs are vendored verbatim** from upstream OpenTabletDriver
  and live at `configs/` in the repo root, shared between the Python
  and Node servers. Do not edit `configs/**/*.json` — those files get
  re-synced from upstream periodically. blankslate-specific overrides,
  if ever needed, should live in a separate sidecar file.
- **Aux interfaces** (express keys) are forwarded as raw HID scan
  codes; clients build their own per-device mappings. The
  `auxButtonCount` field broadcast in the `connected` message comes
  from the OTD config and is a hint, not authoritative.
