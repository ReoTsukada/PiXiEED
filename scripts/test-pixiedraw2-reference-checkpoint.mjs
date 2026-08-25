import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const nodeResult = readJson("docs/inventory/wp110-reference-performance-checkpoint-node.json");
const browserResult = readJson("docs/inventory/wp110-reference-performance-checkpoint-browser.json");
const bundle = readJson("docs/inventory/wp110-reference-bundle-baseline.json");
const inventory = readJson("docs/inventory/wp110-reference-performance-checkpoint-boundary.json");

for (const result of [nodeResult, browserResult]) {
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.benchmarkId, "WP110_REFERENCE_PERFORMANCE_CHECKPOINT");
  assert.equal(result.samplePolicy.usedSamples, 40);
  assert.equal(result.samplePolicy.p95GateEvaluated, false);
  assert.equal(result.singlePixel.length, 2);
  for (const record of result.singlePixel) {
    assert.equal(record.iterations, 40);
    assert.equal(record.status, "UNTESTED");
    assert.equal(record.inputToVisibleMs.sampleCount, 40);
    assert.deepEqual(record.trace, {
      commandValidationCount: 1,
      commandCommitCount: 1,
      touchedTileCount: 1,
      cowSplitCount: 0,
      copiedBytes: 0,
      dirtyTileCount: 1,
      dirtyRegionArea: 1,
      affectedLayerCount: 1,
      affectedFrameCount: 1,
      rendererPreparationArea: 1,
      presentArea: 1,
      canonicalRasterAllocationDelta: 1024,
      fullRasterCloneCount: 0,
      fullTimelineRebuildCount: 0,
      wholeProjectSerializationCount: 0,
    });
    assert.equal(record.memory.componentCategories.workerTransferBytes, 0);
    assert.equal(record.memory.componentCategories.journalBytes, 0);
    assert.equal(record.memory.componentCategories.rendererCacheBytes, 0);
  }
  assert.equal(result.cow.length, 2);
  for (const record of result.cow) {
    assert.equal(record.sourceUnchanged, true);
    assert.equal(record.duplicateChanged, true);
    assert.equal(record.sharedBytesAfterEdit, 0);
    assert.equal(record.cowSplitCount, 1);
    assert.equal(record.copiedBytes, record.expectedCopiedBytes);
  }
  assert.equal(result.sparse.length, 2);
  for (const record of result.sparse) {
    assert.ok(record.sparse.allocatedTileBytes < record.logicalCanvasBytes, "sparse fixture allocated a full logical canvas");
    assert.equal(record.tileDense.allocatedTileBytes, record.logicalCanvasBytes);
  }
  assert.equal(result.determinism.matched, true);
  assert.ok(result.tileComparison.some((record) => record.workload === "fill" && record.status === "UNTESTED"));
  assert.ok(result.tileComparison.some((record) => record.workload === "composite" && record.status === "UNTESTED"));
  assert.equal(result.technology.tileSize, "DECISION_PENDING");
  assert.equal(result.technology.renderer, "DECISION_PENDING");
}

assert.equal(browserResult.environment.browser, "CHROMIUM");
assert.equal(browserResult.browserEvidence.longTasks.available, true);
assert.equal(browserResult.browserEvidence.longTasks.count, 0);
assert.ok(browserResult.browserEvidence.resourceRequests.some((entry) => entry.name.endsWith("draw2-reference-benchmark-entry.js")));
assert.equal(bundle.initialEditorEntry.sourceMapExcluded, undefined);
assert.equal(bundle.build.sourceMapExcluded, true);
assert.equal(bundle.build.sourceMapIncluded, false);
assert.ok(bundle.initialEditorEntry.rawBytes > bundle.initialEditorEntry.minifiedBytes);
assert.ok(bundle.initialEditorEntry.rawCompressed.gzipBytes > 0);
assert.ok(bundle.initialEditorEntry.rawCompressed.brotliBytes > 0);
assert.deepEqual(bundle.lazyChunks, []);
assert.equal(inventory.status, "MEASURED_REFERENCE_UNTESTED");
assert.equal(inventory.architecture_findings.active_dirty_region_is_bounded, true);
assert.equal(inventory.baseline_failure_identity.existing_match, "14/14");
assert.equal(inventory.baseline_failure_identity.new_failure_identities, 0);
assert.equal(inventory.production_changes.current_routes, false);
assert.equal(inventory.production_changes.current_pixiedraw, false);
assert.equal(inventory.production_changes.migration, false);
console.log("WP-110 Reference Performance Checkpoint contract passed: trace, COW, sparse, deterministic, browser, bundle, and preservation boundaries validated");
