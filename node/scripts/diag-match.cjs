// Diagnostic: list every connected HID device, then for any present VID:PID
// pair, dump every OTD config that claims that pair so we can see which one
// discover() is preferring.
const HID = require('node-hid');
const fs = require('fs');
const path = require('path');

const ds = HID.devices();
const present = new Set();
for (const d of ds) {
  if (d.vendorId != null && d.productId != null) {
    present.add(`${d.vendorId}:${d.productId}`);
  }
}

const tabletVids = new Set([0x056a, 0x28bd, 0x256c, 0x2179, 0x5543, 0x231C, 0x172F]);
console.log('Connected HID devices (tablet vendors):');
for (const d of ds) {
  if (!tabletVids.has(d.vendorId)) continue;
  console.log(' ', {
    product: d.product, manufacturer: d.manufacturer,
    vid: '0x' + d.vendorId.toString(16),
    pid: '0x' + d.productId.toString(16),
    interface: d.interface,
    usagePage: '0x' + (d.usagePage || 0).toString(16),
    usage: '0x' + (d.usage || 0).toString(16),
  });
}

console.log('\nOTD configs matching any present VID:PID:');
function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.json')) yield p;
  }
}

const root = path.resolve(__dirname, '..', '..', 'configs');
for (const f of walk(root)) {
  try {
    const cfg = JSON.parse(fs.readFileSync(f, 'utf-8'));
    for (const id of cfg.DigitizerIdentifiers || []) {
      const key = `${id.VendorID}:${id.ProductID}`;
      if (present.has(key)) {
        console.log(' ', {
          name: cfg.Name,
          vid: '0x' + id.VendorID.toString(16),
          pid: '0x' + id.ProductID.toString(16),
          inputLen: id.InputReportLength,
          parser: id.ReportParser.split('.').pop(),
        });
      }
    }
  } catch { /* skip */ }
}
