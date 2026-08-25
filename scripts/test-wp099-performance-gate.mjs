import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(repoRoot, relativePath));
const parseJson = (relativePath) => JSON.parse(read(relativePath));

const requiredPerformanceFiles = [
  '08_IMPLEMENTATION/TECH_STACK.md',
  '05_PERFORMANCE/PERFORMANCE_BUDGETS.md',
  '05_PERFORMANCE/RENDERING_PIPELINE.md',
  '05_PERFORMANCE/MEMORY_AND_RASTER_MODEL.md',
  '05_PERFORMANCE/BENCHMARK_AND_PROFILING_PLAN.md',
  '05_PERFORMANCE/DRAW2_HIGH_PERFORMANCE_IMPLEMENTATION_CONTRACT.md',
  '05_PERFORMANCE/DRAW2_TECHNOLOGY_SELECTION_GATE.md',
  '05_PERFORMANCE/DRAW2_DEVICE_AND_WORKLOAD_MATRIX.md',
  '05_PERFORMANCE/DRAW2_BUNDLE_MEMORY_AND_WORKER_BUDGETS.md',
  '02_ARCHITECTURE/STORAGE_PLACEMENT_AND_SYNC.md',
  '02_ARCHITECTURE/COST_AWARE_REALTIME_POLICY.md',
  'docs/decisions/ADR-20260807-WP099-draw2-performance-gate.md',
  'docs/inventory/wp099-performance-gate-boundary.json',
  'docs/inventory/wp098-routing-security-coverage.json',
  '05_PERFORMANCE/fixtures/draw2-benchmark-result-v1.schema.json',
  '05_PERFORMANCE/fixtures/draw2-benchmark-fixture-catalog-v1.json',
];

for (const relativePath of requiredPerformanceFiles) {
  assert.ok(exists(relativePath), `required WP-099 artifact missing: ${relativePath}`);
  assert.ok(read(relativePath).trim().length > 0, `required WP-099 artifact is empty: ${relativePath}`);
}

const highPerformanceContract = read('05_PERFORMANCE/DRAW2_HIGH_PERFORMANCE_IMPLEMENTATION_CONTRACT.md');
for (const phrase of [
  'strict TypeScript',
  'DOM-, Canvas-, UI-framework-,',
  'Uint8Array',
  'Copy-on-Write',
  '512×512',
  '<=24ms',
  '<=32ms',
  '50ms',
  'LOCAL_ONLY',
  'ACTIVE_SYNC',
  'PLATFORM_EVENT',
  '1000-frame',
  'UNTESTED',
]) {
  assert.ok(highPerformanceContract.includes(phrase), `high-performance contract missing: ${phrase}`);
}

const technologyGate = read('05_PERFORMANCE/DRAW2_TECHNOLOGY_SELECTION_GATE.md');
for (const phrase of ['Feature Detect', 'Benchmark Win', 'Safe Fallback', 'SharedArrayBuffer', 'UNTESTED']) {
  assert.ok(technologyGate.includes(phrase), `technology gate missing: ${phrase}`);
}

const deviceMatrix = read('05_PERFORMANCE/DRAW2_DEVICE_AND_WORKLOAD_MATRIX.md');
for (const phrase of ['256×256', '512×512', '1000', 'COMPOSITE_100', 'Chromium', 'Safari', 'Firefox', 'actual browser/version', 'warm/cold']) {
  assert.ok(deviceMatrix.includes(phrase), `device/workload matrix missing: ${phrase}`);
}

const bundleBudget = read('05_PERFORMANCE/DRAW2_BUNDLE_MEMORY_AND_WORKER_BUDGETS.md');
for (const phrase of ['Lazy-load', 'arbitrary number', 'Worker', 'Worker crash', 'UNTESTED']) {
  assert.ok(bundleBudget.includes(phrase), `bundle/memory/worker budget missing: ${phrase}`);
}

const benchmarkSchema = parseJson('05_PERFORMANCE/fixtures/draw2-benchmark-result-v1.schema.json');
const requiredResultFields = [
  'schemaVersion', 'benchmarkId', 'projectFixture', 'deviceClass', 'actualDevice', 'browser',
  'browserVersion', 'os', 'buildVersion', 'condition', 'iterations', 'metrics', 'memory',
  'longTasks', 'rawResultReference', 'measuredAt', 'status',
];
assert.deepEqual(benchmarkSchema.required, requiredResultFields, 'benchmark result required fields changed unexpectedly');
assert.deepEqual(benchmarkSchema.properties.status.enum, ['PASS', 'FAIL', 'UNTESTED']);
assert.deepEqual(benchmarkSchema.properties.browser.enum, ['CHROMIUM', 'SAFARI', 'FIREFOX', 'OTHER']);
assert.deepEqual(benchmarkSchema.properties.condition.enum, ['COLD', 'WARM']);

const fixtureCatalog = parseJson('05_PERFORMANCE/fixtures/draw2-benchmark-fixture-catalog-v1.json');
assert.equal(fixtureCatalog.schemaVersion, 1);
assert.deepEqual(
  fixtureCatalog.projects.map((project) => project.id),
  ['PROJECT_A', 'PROJECT_B', 'PROJECT_C', 'TIMELINE_1000', 'COMPOSITE_100', 'SPARSE_LARGE', 'DENSE_LARGE'],
);
for (const workload of ['single-pixel', 'frame-duplicate', 'cel-duplicate', 'continuous-30-minute', 'crash-recovery']) {
  assert.ok(fixtureCatalog.workloads.includes(workload), `fixture workload missing: ${workload}`);
}
assert.ok(fixtureCatalog.deviceClasses.includes('modern-desktop'));
assert.ok(fixtureCatalog.deviceClasses.includes('modern-phone'));
assert.equal(fixtureCatalog.statusPolicy.missingActualDevice, 'UNTESTED');

const syntheticUntestedResult = {
  schemaVersion: 1,
  benchmarkId: 'WP099-CONTRACT-UNTESTED',
  projectFixture: 'PROJECT_A_DESKTOP',
  deviceClass: 'DESKTOP_REFERENCE',
  actualDevice: 'not measured by contract-only test',
  browser: 'OTHER',
  browserVersion: 'not measured',
  os: 'not measured',
  buildVersion: 'contract-only',
  condition: 'COLD',
  iterations: 1,
  metrics: { metricId: 'input_visible', unit: 'ms', p50: 0, p95: 0, max: 0 },
  memory: {
    canonicalRasterBytes: 0,
    decodedTileBytes: 0,
    compositeCacheBytes: 0,
    previewCacheBytes: 0,
    undoBytes: 0,
    workerTransferBytes: 0,
    cowSharedBytes: 0,
    cowSplitCount: 0,
    activeFrameBytes: 0,
    inactiveColdTileBytes: 0,
    opfsCacheBytes: 0,
  },
  longTasks: { count: 0, totalMs: 0, maxMs: 0 },
  rawResultReference: 'none:contract-only',
  measuredAt: '2026-08-07T00:00:00.000Z',
  status: 'UNTESTED',
};
assert.equal(syntheticUntestedResult.status, 'UNTESTED');
for (const field of benchmarkSchema.required) assert.ok(field in syntheticUntestedResult, `synthetic result missing ${field}`);

const coverage = parseJson('docs/inventory/wp098-routing-security-coverage.json');
assert.equal(coverage.status, 'PASS');
assert.equal(coverage.newFailureIdentities, 0);
assert.ok(coverage.coverage.every((entry) => entry.status === 'PASS'));
const coverageFixtures = new Set(coverage.coverage.flatMap((entry) => entry.fixtures));
for (const fixture of ['redirect-loop-canonical-path', 'secret-query-not-propagated', 'unicode-nfc-nfd-equivalence']) {
  assert.ok(coverageFixtures.has(fixture), `routing security fixture missing from Coverage Matrix: ${fixture}`);
}

const performanceBoundary = parseJson('docs/inventory/wp099-performance-gate-boundary.json');
assert.equal(performanceBoundary.status, 'EXTERNAL_AUDIT_REQUIRED');
assert.equal(performanceBoundary.external_audit_required, true);
assert.deepEqual(performanceBoundary.baseline_failure_identity, { existing_match: '14/14', new_failure_identities: 0 });
assert.equal(performanceBoundary.device_evidence_status, 'UNTESTED');
assert.equal(performanceBoundary.technology_selection_status, 'UNTESTED');

const contextMap = parseJson('00_START_HERE/WORK_PACKAGE_CONTEXT_MAP.json');
const mandatoryContextRefs = [
  '08_IMPLEMENTATION/TECH_STACK.md',
  '05_PERFORMANCE/PERFORMANCE_BUDGETS.md',
  '05_PERFORMANCE/RENDERING_PIPELINE.md',
  '05_PERFORMANCE/MEMORY_AND_RASTER_MODEL.md',
  '05_PERFORMANCE/BENCHMARK_AND_PROFILING_PLAN.md',
  '02_ARCHITECTURE/STORAGE_PLACEMENT_AND_SYNC.md',
  '02_ARCHITECTURE/COST_AWARE_REALTIME_POLICY.md',
  '05_PERFORMANCE/DRAW2_HIGH_PERFORMANCE_IMPLEMENTATION_CONTRACT.md',
  '05_PERFORMANCE/DRAW2_TECHNOLOGY_SELECTION_GATE.md',
  '05_PERFORMANCE/DRAW2_DEVICE_AND_WORKLOAD_MATRIX.md',
  '05_PERFORMANCE/DRAW2_BUNDLE_MEMORY_AND_WORKER_BUDGETS.md',
];
for (const reference of mandatoryContextRefs) assert.ok(contextMap.global.includes(reference), `global Context reference missing: ${reference}`);
for (const workPackage of ['WP-100', 'WP-110', 'WP-120', 'WP-130', 'WP-140', 'WP-150', 'WP-160', 'WP-170', 'WP-180', 'WP-190']) {
  assert.ok(contextMap.work_packages[workPackage], `Context map missing ${workPackage}`);
  for (const reference of mandatoryContextRefs) {
    assert.ok(contextMap.work_packages[workPackage].includes(reference), `${workPackage} Context reference missing: ${reference}`);
  }
}
for (const contextName of ['WP-099', 'WP-100']) {
  const contextPath = `.codex/context/${contextName}.md`;
  assert.ok(exists(contextPath), `generated Context missing: ${contextPath}`);
  assert.match(read(contextPath), new RegExp(`^# PiXiEED targeted context — ${contextName}`, 'm'));
  assert.ok(read(contextPath).includes('DRAW2_HIGH_PERFORMANCE_IMPLEMENTATION_CONTRACT.md'));
}

const queue = read('00_START_HERE/IMPLEMENTATION_QUEUE.yaml');
const wp110Section = queue.slice(queue.indexOf('  - id: WP-110'), queue.indexOf('  - id: WP-120'));
const wp180Section = queue.slice(queue.indexOf('  - id: WP-180'), queue.indexOf('  - id: WP-190'));
for (const phrase of ['benchmark', 'latency', 'memory', 'Long Task', 'UNTESTED']) assert.ok(wp110Section.toLowerCase().includes(phrase.toLowerCase()), `WP-110 gate missing: ${phrase}`);
for (const phrase of ['provenance', 'permission', 'accessibility', 'performance', 'UNTESTED']) assert.ok(wp180Section.toLowerCase().includes(phrase.toLowerCase()), `WP-180 gate missing: ${phrase}`);

const state = read('.codex/PIXIEED_IMPLEMENTATION_STATE.yaml');
assert.match(state, /current_work_package:\s*WP-099/);
assert.match(state, /status:\s*EXTERNAL_AUDIT_REQUIRED/);
assert.match(state, /WP-100.*implementation/i);
assert.match(state, /WP-000.*WP-098/);

console.log('WP-099 performance gate contract passed:');
console.log(`  artifacts=${requiredPerformanceFiles.length}`);
console.log(`  fixtureProjects=${fixtureCatalog.projects.length}`);
console.log(`  mandatoryContextRefs=${mandatoryContextRefs.length}`);
console.log(`  WP-098 routing security coverage=${coverage.coverage.length} PASS`);
console.log('  measured device results=UNTESTED (external audit required; no false PASS)');
