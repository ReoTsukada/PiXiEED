import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
const core = read("pixiedraw2/src/draw2-core.ts");
const selection = read("pixiedraw2/src/draw2-selection.ts");
const entry = read("pixiedraw2/src/draw2-entry.ts");
const html = read("pixiedraw2/index.html");
const contract = read("docs/contracts/WP-120-SELECTION-TRANSFORMS.md");

for (const forbidden of ["document.", "window.", "navigator.", "fetch(", "supabase", "BroadcastChannel", "WebSocket"]) {
  assert.equal(core.includes(forbidden), false, `Core must not depend on ${forbidden}`);
  assert.equal(selection.includes(forbidden), false, `Selection Core must not depend on ${forbidden}`);
}
for (const required of [
  "SelectionSnapshot", "SelectionMask", "sourceRasterRevision", "sourceStructureEpoch", "activeCelId",
  "selection.transformCommit", "clipboard.copy", "clipboard.cut", "clipboard.paste", "NEAREST_NEIGHBOR",
  "EXPAND_CANVAS_CANDIDATE", "CLIPBOARD_PIXEL_DUPLICATE", "CLIPBOARD_PROVENANCE_UNTRUSTED",
  "TRANSFORM_DUPLICATE_COMMAND", "STALE_PASTE_RASTER", "metricScope", "LocalUndoRedoHistory",
]) assert.match(selection, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing Selection contract ${required}`);
for (const required of ["draw2Overlay", "draw2PreviewTransform", "draw2CommitTransform", "draw2CancelTransform", "draw2Copy", "draw2Cut", "draw2Paste", "draw2Undo", "draw2Redo"]) assert.match(entry, new RegExp(required), `missing isolated UI control ${required}`);
assert.match(html, /data-pixieed-entry="draw2-isolated"/);
assert.match(html, /data-feature-flag="off"/);
assert.match(html, /noindex,nofollow/);
assert.match(contract, /system Clipboard API is not a Core dependency/);
assert.match(contract, /real-device input-to-visible/);
console.log("WP-120 static Core/UI/non-intrusion contract: PASS");
