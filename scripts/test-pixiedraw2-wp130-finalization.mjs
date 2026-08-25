import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
const core = read("pixiedraw2/src/draw2-core.ts");
const entry = read("pixiedraw2/src/draw2-entry.ts");
const tests = read("pixiedraw2/tests/core.test.ts");
const benchmark = read("pixiedraw2/benchmarks/run-stroke-continuity-benchmark.ts");
const contract = read("docs/contracts/WP-130-TIMELINE-STRUCTURE.md");
const inventory = JSON.parse(read("docs/inventory/wp130-timeline-structure.json"));

for (const required of ["interpolatePixelLine", "interpolatePixelPath", "MAX_INTERPOLATED_STROKE_PIXELS", "raster.strokeCommit", "strokeMetrics", "touchedTileCount", "unrelatedFrameCount", "unrelatedLayerCount"]) assert.match(core, new RegExp(required.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")), `missing Stroke Core contract ${required}`);
for (const required of ["pointerdown", "pointermove", "pointerup", "pointercancel", "setPointerCapture", "lostpointercapture", "getCoalescedEvents", "activeStrokePoints", "interpolatePixelPath"]) assert.match(entry, new RegExp(required.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")), `missing Pointer boundary ${required}`);
for (const required of ["fast Pointer Stroke", "eraser Stroke", "Stroke Undo", "Stroke locality metrics", "interpolation left a pixel gap"]) assert.match(tests, new RegExp(required.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")), `missing Stroke fixture ${required}`);
for (const required of ["horizontalFast", "verticalFast", "diagonalFast", "steepDiagonal", "reverseDirection", "canvasEdge", "repeatedCoordinate", "eraserContinuous", "result.result.strokeMetrics", "fixtureUnrelatedFrames"]) assert.match(benchmark, new RegExp(required.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")), `missing Stroke benchmark ${required}`);
for (const required of ["continuous Pen Stroke", "Stroke Dirty Locality", "1000-Frame", "Bundle Baseline", "UNTESTED"]) assert.match(contract, new RegExp(required.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")), `missing Finalization contract ${required}`);

assert.equal(inventory.scope.featureFlagDefault, "off");
assert.equal(inventory.bundle.initialRequests?.length ?? 2, 2);
assert.equal(inventory.bundle.lazyChunks.length, 0);
assert.equal(inventory.verification.baselineFailureIdentity, "14/14 existing identities match; new identities 0");
assert.equal(inventory.verification.wp140Started, false);
console.log("WP-130 Finalization static Stroke/Timeline/Bundle/non-intrusion contract: PASS");
