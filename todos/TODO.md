# TODO

## Unify `digitizerUsagePage` selection between Python and Node generators

The two config generators currently disagree on what value to record for `digitizerUsagePage` for devices that expose both a standard digitizer collection and a vendor-specific collection (e.g. Huion Inspiroy H640P).

### Current behavior

- **Node** (`src/utils/metadata-generator.ts:72-87`, `detectDigitizerUsagePage`): explicitly prefers the standard digitizer collection (`usagePage === 13 && usage === 2`), falls back to the first collection otherwise. For the H640P → `13`.
- **Python** (`python/blankslate/core/walkthrough_engine.py:727`): records the `usage_page` of whichever HID interface was selected during enumeration. Enumeration in `python/blankslate/core/hid_reader_factory.py:429` accepts any interface whose `usage_page == 13` *or* whose product string contains "tablet"/"pen", so the vendor-specific entry frequently wins (first-enumerated). For the H640P → `65280`.

The Python behavior is currently enshrined in `python/tests/integration/test_recording_replay.py:1201-1205` (`test_huion_digitizer_usage_page` asserts `65280`).

### Why it (mostly) doesn't matter at runtime

The WebHID device-selection logic in `src/core/managers/webhid-manager.ts:125-140` checks vendor-specific (`usagePage >= 0xFF00`) *before* the configured `digitizerUsagePage`, so for devices that send pen data on the vendor page either value routes to the same interface. The field is more meaningful as device metadata than as runtime routing.

### Proposed direction

Align Python with Node:

1. Change `_build_byte_code_mappings` (or wherever `digitizerUsagePage` is set) to prefer the standard digitizer collection when present, matching `detectDigitizerUsagePage`.
2. Update `test_huion_digitizer_usage_page` to expect `13`.
3. Audit any consumers that treat `digitizerUsagePage` as "the page the device actually transmits on" — that semantics should move to a separate field (e.g. `dataSourceUsagePage`, which already exists in `src/utils/metadata-generator.ts:23` but isn't populated end-to-end).

Rationale: `digitizerUsagePage` is more useful as a stable property of the device (what does it advertise as the digitizer?) than as a record of enumeration order on a particular host.

### Alternative

Align Node with Python — but this is more invasive: the WebHID priority order in `webhid-manager.ts` assumes `digitizerUsagePage` is the *standard* page, so changing its meaning would require corresponding changes there.
