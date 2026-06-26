# blankslate

Stream drawing-tablet HID events over WebSocket and visualize them in the browser.
Device support comes from vendored [OpenTabletDriver](https://github.com/OpenTabletDriver/OpenTabletDriver)
configurations (340+ tablets), so any tablet OTD recognises should work.

Three pieces:

- **Python server** (`blankslate-server`) — opens the tablet's HID interface
  exclusively, parses reports with OTD-derived parsers, and broadcasts a JSON
  event stream over WebSocket. See `python/README.md`.
- **Node server** (`npm run server`) — a TypeScript port of the same daemon
  with the same protocol, behaviour, and CLI surface. See `node/README.md`.
- **Viewer** (`npm run dev`) — minimal Vite/Lit web app that connects to
  either server and renders pen position, pressure, tilt, and button state.

The two servers are functionally equivalent and share the same vendored OTD
configurations at `configs/`. Pick whichever runtime you already have on the
host. Tested on macOS and Linux (Raspberry Pi); Windows is not a target.

## Install

### Python server

```bash
cd python
python3 -m venv venv
source venv/bin/activate
pip install -e .
```

Exposes the `blankslate-server` and `blankslate-udev-rules` commands; pulls in
`hidapi` and `websockets`.

### Node server + web viewer

```bash
npm install
```

The same `npm install` covers both the Node server dependencies and the Lit
viewer — they live in one workspace.

## Run the server

Both servers default to port `8765`, bind `0.0.0.0`, and accept the same
flags. Pick one:

```bash
blankslate-server                       # Python
npm run server                          # Node (forward flags with `--`,
                                        #   e.g. `npm run server -- --list`)
```

Common invocations:

```bash
blankslate-server --list                # enumerate matched HID interfaces
blankslate-server --list-parsers        # show available report parsers
blankslate-server --vid 0x256c --pid 0x006d --port 9000
sudo blankslate-server                  # macOS: required for aux interfaces
```

### CLI options (both backends)

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

## Run the viewer

In another terminal:

```bash
npm run dev
```

Open the printed URL (usually `http://localhost:5173`). It auto-connects to
`ws://<host>:8765`; override with `?ws=ws://other-host:8765`.

## Linux: granting access without sudo

By default `/dev/hidraw*` is root-only. Either server can emit udev rules
covering every OTD-supported tablet:

```bash
blankslate-udev-rules > /tmp/70-blankslate.rules     # Python
npm run udev > /tmp/70-blankslate.rules              # Node (equivalent output)

sudo install -m 644 /tmp/70-blankslate.rules /etc/udev/rules.d/70-blankslate.rules
sudo udevadm control --reload-rules
sudo udevadm trigger
```

Replug the tablet. The rules add `TAG+="uaccess"` so the logged-in user gets
read/write access and tell `libinput` to ignore the device, freeing it for
exclusive use by the server.

## WebSocket protocol

On connect the server sends a hello frame:

```json
{ "type": "connected",
  "config": { "name": "...", "manufacturer": "...", "maxX": 50800, "maxY": 31750,
              "maxPressure": 8192, "auxButtonCount": 6 },
  "mode": "device", "dataFormat": "translated" }
```

Then a stream of tablet frames (one per HID report):

```json
{ "type": "tablet-data", "timestamp": 1719360000.123,
  "state": "contact", "x": 0.5, "y": 0.5, "pressure": 0.42,
  "tiltX": 0.0, "tiltY": 0.0, "tiltXY": 0.0,
  "primaryButtonPressed": false, "secondaryButtonPressed": false,
  "tabletButtons": 0, "button1": false, "button2": true }
```

`x`, `y`, `pressure`, `tilt*` are normalized to `[0, 1]` / `[-1, 1]`.

## Layout

- `configs/` — vendored OTD JSON configurations, shared by both server ports.
- `python/blankslate/otd/parsers/` — Python ports of OTD's report parsers.
- `python/blankslate/server/` — HID lifecycle + WebSocket broadcaster.
- `node/src/` — TypeScript port of the same server (see `node/README.md`).
- `src/viewer-app/` + `src/components/` — the Lit-based viewer.
