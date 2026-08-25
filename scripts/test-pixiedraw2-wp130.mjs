import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
const core = read("pixiedraw2/src/draw2-core.ts");
const timeline = read("pixiedraw2/src/draw2-timeline.ts");
const entry = read("pixiedraw2/src/draw2-entry.ts");
const html = read("pixiedraw2/index.html");
const css = read("pixiedraw2/assets/draw2-shell.css");
const contract = read("docs/contracts/WP-130-TIMELINE-STRUCTURE.md");

for (const forbidden of ["document.", "window.", "navigator.", "fetch(", "supabase", "BroadcastChannel", "WebSocket", "indexedDB", "localStorage", "CanvasRenderingContext2D"]) {
  assert.equal(timeline.includes(forbidden), false, `Timeline Core must not depend on ${forbidden}`);
}

for (const required of [
  "layerTrackId", "frameId", "celId", "orderingKey", "orderKey", "recordVersion", "lifecycle",
  "DUPLICATE_INDEPENDENT",
  "timeline.addLayerTrack", "timeline.removeLayerTrack", "timeline.duplicateLayerTrack", "timeline.reorderLayerTrack",
  "timeline.renameLayerTrack", "timeline.setLayerVisibility", "timeline.addFrame", "timeline.removeFrame",
  "timeline.duplicateFrame", "timeline.reorderFrame", "timeline.changeFrameDuration", "timeline.createCel",
  "timeline.clearCel", "timeline.replaceCelBinding", "TIMELINE_STRUCTURE_DIRTY", "TIMELINE_CELL_DIRTY",
  "LAYER_METADATA_DIRTY", "ONION_SKIN_DIRTY", "calculateTimelineWindow", "resolveOnionSkinNeighborhood",
  "canonicalMutation: false", "snapshotIncluded: false", "editCelPixel", "measureTimelineMemory", "overscan",
]) assert.match(timeline, new RegExp(required.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")), `missing Timeline contract ${required}`);

for (const required of ["ProjectState", "timeline:", "structureEpoch", "appliedCommandIds", "lastClientSequenceByClient"]) {
  assert.match(core, new RegExp(required.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")), `missing Core state field ${required}`);
}
for (const required of ["SHARED_REFERENCE", "DUPLICATE_INDEPENDENT", "EMPTY"]) {
  assert.match(core, new RegExp(required), `missing Cel binding mode ${required}`);
}
for (const required of ["draw2TimelineViewport", "draw2TimelineWindow", "draw2AddFrame", "draw2DuplicateFrame", "draw2RemoveFrame", "draw2AddLayer", "draw2ReorderLayer", "draw2ToggleLayer", "draw2ToggleOnion", "aria-pressed", "aria-selected"]) {
  assert.match(entry + html, new RegExp(required.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")), `missing isolated Timeline UI ${required}`);
}
for (const required of ["overflow: auto", "prefers-reduced-motion", "safe-area-inset-bottom", "font-size: clamp"]) {
  assert.match(css, new RegExp(required.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")), `missing responsive/accessibility CSS ${required}`);
}

assert.match(html, /data-pixieed-entry="draw2-isolated"/);
assert.match(html, /data-feature-flag="off"/);
assert.match(html, /noindex,nofollow/);
assert.match(contract, /current production route, PXD, PiXiSYNC, Market, and data are\s+unchanged/);
assert.match(contract, /formal device\/compositor\/long-session performance gate\s+remains `UNTESTED`/);
console.log("WP-130 static Timeline/Core/UI/non-intrusion contract: PASS");
