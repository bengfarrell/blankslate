# blankslate Node server

TypeScript port of the Python tablet-to-WebSocket daemon. Reads HID input
reports from a supported tablet, normalises them using the vendored
OpenTabletDriver configs under `configs/` at the repo root (shared with
the Python server), and broadcasts JSON events to any connected
WebSocket client.

## Install

From the repo root:

```bash
npm install
```

## Run

```
npm run server                          # tsx node/src/cli.ts
npm run server -- --list                # enumerate matched HID interfaces
npm run server -- --list-parsers        # show available report parsers
npm run udev                            # emit Linux udev rules to stdout
npm test                                # vitest
npm run typecheck:server                # tsc --noEmit
```

The `--` between `npm run server` and the flags is required so npm
forwards them to the underlying `tsx node/src/cli.ts` invocation.

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

`HidDevice.discover()` enumerates every HID interface, matches by
`{VendorID, ProductID}` against the OTD config index, and returns one
`DiscoveredDevice` per interface. `pickDigitizerInterface()` prefers the
standard HID Digitizer collection (`UsagePage = 0x0D`); `pickAuxInterfaces()`
returns the keyboard / consumer-control collections on other interfaces.

## Report descriptor fallback chain

For tablets where we read from the standard digitizer interface (the
common path on macOS, since the firmware vendor-mode handshake we'd
otherwise issue isn't reliable there), the OTD config's `MaxX` / `MaxY`
/ `MaxPressure` describe the *vendor-mode* coordinate space, not the
standard digitizer's. Reading those values straight from the config
gives you a cursor that only reaches the middle of the screen.

The fix is to read the device's actual HID report descriptor, decode
the `Logical Maximum` on the X, Y, and Tip Pressure usages, and feed
those into `EventAdapter.overrideRanges()`. `applyDescriptorRanges()`
in `websocketServer.ts` tries three sources in order; the first one
that returns bytes wins:

1. **`HidReader.getReportDescriptor()`** — calls into node-hid. As of
   node-hid 3.x there is no `hid_get_report_descriptor()` binding, so
   this always returns `null` today. Kept in the chain so we pick it up
   for free when node-hid eventually exposes it (upstream tracking issue
   exists; the hidapi C function has been available since 0.14).
2. **`getReportDescriptorViaUsb()`** — uses the `usb` (libusb) package
   to send a standard `GET_DESCRIPTOR(0x22)` control transfer. This is
   what hidapi itself does on Linux when you call
   `hid_get_report_descriptor()`. We try with `interface` recipient
   first and fall back to `device` recipient if libusb couldn't claim
   the interface. **On macOS this almost always fails** because
   `IOHIDFamily` claims every HID interface at enumeration time and
   libusb refuses to detach it. On Linux + udev rules (or root) it
   succeeds.
3. **`getReportDescriptorViaIoreg()`** — macOS-only. Shells out to
   `ioreg -l -w 0 -r -c IOHIDDevice`, finds the `IOHIDDevice` entry
   whose `VendorID` + `ProductID` + `PrimaryUsagePage` match the
   interface we're reading from, and parses the raw bytes out of its
   `ReportDescriptor = <hex…>` property. This works because the kernel
   already parsed the descriptor at enumeration time, so we just lift
   the cached copy instead of trying to re-fetch it over USB. No
   privileges required, no interface claim required.

If all three return `null`, we log a warning and fall through to the
OTD config's ranges (and the cursor stays in the half-screen-of-shame
case).

### Effective behaviour by platform

| Platform | Path that actually fires today |
|---|---|
| macOS | `ioreg` (step 3). libusb fails on kernel-claimed HID. |
| Linux (Raspberry Pi etc.) | `libusb` (step 2). `ioreg` doesn't exist; step 3 returns `null` immediately because `process.platform !== "darwin"`. |
| any | `node-hid` (step 1), the day node-hid ships the binding. |

### Why keep libusb on macOS at all?

It's a cheap defence-in-depth. The interface-claim attempt fails fast
(one open/close round-trip, no transfer issued), and if we ever
encounter a HID device that *isn't* claimed by `IOHIDFamily` (rare —
some pure vendor-class devices) we'd get the descriptor before
hitting the ioreg path.

### Why keep `ioreg` instead of replacing libusb entirely?

`ioreg` is macOS-only. On Linux there's no equivalent registry to
scrape, and the natural alternative — reading
`/sys/class/hidraw/hidrawN/device/report_descriptor` directly — isn't
implemented here yet. Libusb covers the Linux case until that lands.

## Other implementation notes

- **Config identification is by VID+PID, with a string-based tie-break.**
  Many vendors (Huion, Gaomon, Artisul, …) share UCLogic chipsets and
  ship the exact same `{VID, PID, InputReportLength}` triple, so
  `ConfigIndex.find()` returns multiple candidates for one tablet.
  `discover()` then calls `pickBestMatch()`, which scores each
  candidate against the device's own USB descriptor strings: +2 if
  `config.manufacturer` equals the device's `manufacturerString`
  (case-insensitive), +1 if `config.model` appears in the device's
  `productString`. Highest score wins; ties (and the all-zero case
  for unknown vendors) fall back to the first candidate in
  alphabetical config-load order. Parser selection and descriptor
  ranges are unaffected — this only changes which config's `name`,
  physical dimensions, and `auxButtonCount` are broadcast in the
  `connected` message.
- **OTD configs are vendored verbatim** from upstream
  OpenTabletDriver and live at `configs/` in the repo root, shared
  between the Python and Node servers. Do not edit
  `configs/**/*.json` — those files get re-synced from upstream
  periodically. blankslate-specific overrides, if ever needed, should
  live in a separate sidecar file.
- **Aux interfaces** (express keys) are forwarded as raw HID scan codes;
  clients build their own per-device mappings. The `auxButtonCount`
  field broadcast in the `connected` message comes from the OTD config
  and is a hint, not authoritative.
