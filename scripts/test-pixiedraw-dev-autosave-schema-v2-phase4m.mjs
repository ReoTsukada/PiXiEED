import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const originalConsole = globalThis.console;

function loadBrowserModule(relativePath) {
  const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
  vm.runInThisContext(source, { filename: relativePath });
}

function setupSchemaUtils() {
  globalThis.window = { PiXiEEDrawModules: {} };
  globalThis.console = { log() {}, info() {}, warn() {}, error() {} };
  loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/autosave-schema-v2-utils.js');
  return window.PiXiEEDrawModules.autosaveSchemaV2Utils.createAutosaveSchemaV2Utils();
}

function rgba(...values) {
  return values;
}

function createLayer(kind, id) {
  if (kind === 'direct') {
    return {
      id,
      name: 'Direct only',
      directOnly: true,
      indices: [-1, -1, -1, -1],
      direct: [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255],
      importSourceDirect: null,
    };
  }
  if (kind === 'mixed') {
    return {
      id,
      name: 'Mixed',
      directOnly: false,
      indices: [0, -1, 1, -1],
      direct: [0, 0, 0, 0, 20, 30, 40, 255, 0, 0, 0, 0, 60, 70, 80, 255],
      importSourceDirect: [0, 0, 0, 0, 1, 2, 3, 255, 0, 0, 0, 0, 4, 5, 6, 255],
    };
  }
  return {
    id,
    name: 'Indexed',
    directOnly: false,
    indices: [0, 1, 0, 1],
    direct: null,
    importSourceDirect: null,
  };
}

function createCanvas(id, { mixed = false } = {}) {
  return {
    id,
    name: id,
    width: 2,
    height: 2,
    activeFrame: 0,
    activeLayer: `${id}-mixed`,
    frames: [{
      id: `${id}-frame-1`,
      name: 'Frame 1',
      duration: 100,
      layers: [
        createLayer('indexed', `${id}-indexed`),
        createLayer(mixed ? 'mixed' : 'direct', `${id}-${mixed ? 'mixed' : 'direct'}`),
      ],
    }],
  };
}

function createSheet(id, index, { multiCanvas = false, sourceKind = 'file' } = {}) {
  const mainCanvas = createCanvas(`${id}-main`, { mixed: true });
  const canvases = multiCanvas ? [mainCanvas, createCanvas(`${id}-alt`)] : [mainCanvas];
  const project = {
    type: 'pixieedraw-project',
    packageVersion: 2,
    updatedAt: `2026-07-11T00:00:0${index}Z`,
    // Runtime-only fields must not survive schema serialization.
    projectSaveHandle: { name: 'must-not-persist.pixieedraw' },
    projectSaveHandleMeta: { fileName: 'must-not-persist.pixieedraw' },
    document: {
      version: 1,
      documentName: `${id}.pixieedraw`,
      width: 2,
      height: 2,
      palette: [rgba(0, 0, 0, 0), rgba(255, 0, 0, 255), rgba(0, 255, 0, 255)],
      activeCanvasId: multiCanvas ? `${id}-alt` : `${id}-main`,
      activeFrame: 0,
      activeLayer: mainCanvas.frames[0].layers[1].id,
      canvases,
    },
    session: {
      historyLimit: 30,
      historyPast: [{ label: `history-${id}-1` }, { label: `history-${id}-2` }],
      historyFuture: [{ label: `future-${id}-1` }],
      localViewportCanvases: {
        count: multiCanvas ? 1 : 0,
        selectedKind: multiCanvas ? 'local' : 'main',
        selectedIndex: multiCanvas ? 0 : -1,
        layoutScale: 1,
        positionsRelative: true,
        anchorLeft: 48 + index,
        anchorTop: 32 + index,
        positions: multiCanvas ? [{ left: 160 + index, top: 96 + index }] : [],
      },
      timelapse: {
        enabled: true,
        fps: 12,
        byCanvas: { [`${id}-main`]: { snapshots: [] } },
        operationLogsByCanvas: { [`${id}-main`]: { version: 1, baseSnapshot: null, entries: [] } },
      },
    },
  };
  return {
    id,
    fileName: `${id}.pixieedraw`,
    label: `Sheet ${index}`,
    sourceKind,
    sourceStorageAdapterId: index % 2 ? 'pixieedraw-v1-json' : 'pixieedraw-v2-zip-experimental',
    sourceProjectToken: `source-token-${id}`,
    project,
    // More runtime-only values to prove they are excluded.
    autosaveHandle: { name: 'autosave-handle' },
    pendingAutosaveHandle: { name: 'pending-autosave-handle' },
  };
}

function createProjectState(sheetCount = 2) {
  const sheets = Array.from({ length: sheetCount }, (_, index) => createSheet(
    `sheet-${String.fromCharCode(97 + index)}`,
    index + 1,
    { multiCanvas: index === 0, sourceKind: index === 2 ? 'import-image' : 'file' }
  ));
  return {
    projectId: 'local-phase4m',
    name: 'Phase 4-M fixture',
    updatedAt: '2026-07-11T00:00:09Z',
    activeSheetId: sheets[1]?.id || sheets[0].id,
    sheets,
    thumbnail: 'data:image/png;base64,fixture',
    dotStats: { totalDots: 123, colors: 3 },
    journalsBySheet: {
      'sheet-a': [{
        sequence: 1,
        kind: 'pixel-patch',
        canvasId: 'sheet-a-main',
        frameId: 'sheet-a-main-frame-1',
        layerId: 'sheet-a-main-mixed',
        changes: [{
          index: 1,
          after: {
            paletteIndex: -1,
            direct: [90, 91, 92, 255],
            importSourceDirect: [93, 94, 95, 255],
          },
        }],
      }],
    },
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function refreshChecksum(utils, value) {
  delete value.checksum;
  value.checksum = utils.checksum(value);
  return value;
}

function assertSheetShape(restored, expectedState) {
  assert.equal(restored.sheets.length, expectedState.sheets.length);
  assert.deepEqual(restored.sheets.map(sheet => sheet.id), expectedState.sheets.map(sheet => sheet.id));
  assert.equal(restored.activeSheetId, expectedState.activeSheetId);
  restored.sheets.forEach((sheet, index) => {
    const expected = expectedState.sheets[index];
    assert.equal(sheet.label, expected.label);
    assert.equal(sheet.fileName, expected.fileName);
    assert.equal(sheet.sourceKind, expected.sourceKind);
    assert.equal(sheet.sourceStorageAdapterId, expected.sourceStorageAdapterId);
    assert.equal(sheet.sourceProjectToken, expected.sourceProjectToken);
    assert.equal(sheet.project.document.activeCanvasId, expected.project.document.activeCanvasId);
    assert.equal(sheet.project.document.canvases.length, expected.project.document.canvases.length);
    assert.deepEqual(sheet.project.document.palette, expected.project.document.palette);
    assert.deepEqual(sheet.project.session.localViewportCanvases, expected.project.session.localViewportCanvases);
  });
}

const utils = setupSchemaUtils();
const state2 = createProjectState(2);
const revision1 = utils.createSchemaV2Revision(state2, { revision: 1 });
const store = utils.createInMemoryAutosaveSchemaV2Store();
const commit1 = utils.commitSchemaV2Revision(store, revision1);
assert.equal(commit1.committed, true);
assert.deepEqual(commit1.writeOrder, ['checkpoint', 'checkpoint', 'journal', 'journal', 'thumbnail', 'manifest', 'recent-ref']);

const restored1 = utils.restoreSchemaV2WithFallback(store, revision1.recentEntry);
assert.equal(restored1.fallbackUsed, false);
assertSheetShape(restored1.packaged, state2);
const patchedLayer = restored1.packaged.sheets[0].project.document.canvases[0].frames[0].layers.find(layer => layer.id === 'sheet-a-main-mixed');
assert.deepEqual(patchedLayer.direct.slice(4, 8), [90, 91, 92, 255]);
assert.deepEqual(patchedLayer.importSourceDirect.slice(4, 8), [93, 94, 95, 255]);
assert.equal(patchedLayer.indices[1], -1);
assert.equal(restored1.packaged.sheets[1].journalRecovered, false);
assert.equal(restored1.packaged.sheets[0].journalRecovered, true);

const serializedBundle = JSON.stringify(revision1);
for (const forbidden of ['projectSaveHandle', 'projectSaveHandleMeta', 'autosaveHandle', 'pendingAutosaveHandle', 'must-not-persist']) {
  assert.equal(serializedBundle.includes(forbidden), false, `${forbidden} must not enter schema V2 records`);
}

const legacyProject = { type: 'pixieedraw-project', packageVersion: 1, document: { version: 1 } };
const legacyResult = utils.restoreRecentEntry(store, { id: 'legacy', project: legacyProject });
assert.equal(legacyResult.legacy, true);
assert.deepEqual(legacyResult.packaged, legacyProject);

const sizeWithHistory = utils.measureCheckpointSize(revision1.checkpoints[0], { includeHistory: true });
const sizeWithoutHistory = utils.measureCheckpointSize(revision1.checkpoints[0], { includeHistory: false });
assert.ok(sizeWithHistory > sizeWithoutHistory, 'history contributes to checkpoint size');
assert.equal(revision1.checkpoints[0].project.session.historyPast.length, 2);
assert.equal(revision1.checkpoints[0].project.session.historyFuture.length, 1);
assert.ok(utils.estimatePixelDataBytes(revision1.checkpoints[0].project) > 0, 'pixel byte estimate is available');

const state3 = createProjectState(3);
state3.updatedAt = '2026-07-11T00:00:10Z';
const revision2 = utils.createSchemaV2Revision(state3, { revision: 2, parentRevision: 1 });
const commit2 = utils.commitSchemaV2Revision(store, revision2);
assert.equal(commit2.committed, true);
assert.equal(utils.restoreSchemaV2WithFallback(store, revision2.recentEntry).packaged.sheets.length, 3);

for (const failAt of ['checkpoint', 'journal', 'manifest', 'recent-ref']) {
  const transactionStore = utils.createInMemoryAutosaveSchemaV2Store();
  assert.equal(utils.commitSchemaV2Revision(transactionStore, revision1).committed, true);
  const failed = utils.commitSchemaV2Revision(transactionStore, revision2, { failAt });
  assert.equal(failed.committed, false, `${failAt} abort does not commit`);
  assert.equal(transactionStore.recentProjects.get(state2.projectId).manifestKey, revision1.manifest.key, `${failAt} keeps old current revision`);
  assert.equal(transactionStore.manifests.has(revision2.manifest.key), false, `${failAt} leaves no partial manifest`);
}

const cleanupStore = utils.createInMemoryAutosaveSchemaV2Store();
assert.equal(utils.commitSchemaV2Revision(cleanupStore, revision1).committed, true);
const cleanupResult = utils.commitSchemaV2Revision(cleanupStore, revision2, { failCleanup: true });
assert.equal(cleanupResult.committed, true);
assert.equal(cleanupResult.cleanupFailed, true);
assert.equal(cleanupStore.recentProjects.get(state2.projectId).manifestKey, revision2.manifest.key);
assert.equal(cleanupStore.manifests.has(revision1.manifest.key), true, 'cleanup failure leaves recoverable orphan revisions');

function seedFallbackStore() {
  const next = utils.createInMemoryAutosaveSchemaV2Store();
  utils.commitSchemaV2Revision(next, revision1);
  utils.commitSchemaV2Revision(next, revision2);
  return next;
}

const corruptManifestStore = seedFallbackStore();
corruptManifestStore.manifests.get(revision2.manifest.key).checksum = 'invalid';
const corruptManifestResult = utils.restoreSchemaV2WithFallback(corruptManifestStore, revision2.recentEntry);
assert.equal(corruptManifestResult.fallbackUsed, true);
assert.equal(corruptManifestResult.manifest.key, revision1.manifest.key);

const corruptCheckpointStore = seedFallbackStore();
corruptCheckpointStore.checkpoints.get(revision2.checkpoints[0].key).checksum = 'invalid';
const corruptCheckpointResult = utils.restoreSchemaV2WithFallback(corruptCheckpointStore, revision2.recentEntry);
assert.equal(corruptCheckpointResult.fallbackUsed, true);
assert.equal(corruptCheckpointResult.manifest.key, revision1.manifest.key);

const sheetMismatchStore = seedFallbackStore();
const mismatchedManifest = sheetMismatchStore.manifests.get(revision2.manifest.key);
mismatchedManifest.sheetOrder.pop();
refreshChecksum(utils, mismatchedManifest);
const sheetMismatchResult = utils.restoreSchemaV2WithFallback(sheetMismatchStore, revision2.recentEntry);
assert.equal(sheetMismatchResult.fallbackUsed, true);
assert.equal(sheetMismatchResult.manifest.key, revision1.manifest.key);

const activeSheetFallbackStore = seedFallbackStore();
const invalidActiveManifest = activeSheetFallbackStore.manifests.get(revision2.manifest.key);
invalidActiveManifest.activeSheetId = 'missing-sheet';
refreshChecksum(utils, invalidActiveManifest);
const invalidActiveResult = utils.restoreSchemaV2WithFallback(activeSheetFallbackStore, revision2.recentEntry);
assert.equal(invalidActiveResult.fallbackUsed, false);
assert.equal(invalidActiveResult.packaged.activeSheetId, invalidActiveManifest.sheetOrder[0]);

const corruptJournalStore = seedFallbackStore();
const corruptJournal = corruptJournalStore.journals.get(revision2.journals.find(journal => journal.sheetId === 'sheet-a').key);
corruptJournal.checksum = 'invalid';
const corruptJournalResult = utils.restoreSchemaV2WithFallback(corruptJournalStore, revision2.recentEntry);
assert.equal(corruptJournalResult.fallbackUsed, false);
assert.ok(corruptJournalResult.packaged.recovery.journalWarnings.includes('sheet-a'));

const sequenceStore = seedFallbackStore();
const sequenceJournal = sequenceStore.journals.get(revision2.journals.find(journal => journal.sheetId === 'sheet-a').key);
sequenceJournal.ops[0].sequence = 2;
refreshChecksum(utils, sequenceJournal);
const sequenceResult = utils.restoreSchemaV2WithFallback(sequenceStore, revision2.recentEntry);
assert.ok(sequenceResult.packaged.recovery.journalWarnings.includes('sheet-a'));

const baseMismatchStore = seedFallbackStore();
const baseMismatchJournal = baseMismatchStore.journals.get(revision2.journals.find(journal => journal.sheetId === 'sheet-a').key);
baseMismatchJournal.baseCheckpointKey = 'wrong-checkpoint';
refreshChecksum(utils, baseMismatchJournal);
const baseMismatchResult = utils.restoreSchemaV2WithFallback(baseMismatchStore, revision2.recentEntry);
assert.ok(baseMismatchResult.packaged.recovery.journalWarnings.includes('sheet-a'));

const optionalMetadataStore = seedFallbackStore();
const optionalMetadataManifest = optionalMetadataStore.manifests.get(revision2.manifest.key);
optionalMetadataManifest.thumbnailRef = null;
optionalMetadataManifest.dotStats = null;
refreshChecksum(utils, optionalMetadataManifest);
const optionalMetadataResult = utils.restoreSchemaV2WithFallback(optionalMetadataStore, revision2.recentEntry);
assert.equal(optionalMetadataResult.fallbackUsed, false);
assert.equal(optionalMetadataResult.packaged.dotStats, null);

const pageHideStore = utils.createInMemoryAutosaveSchemaV2Store();
utils.commitSchemaV2Revision(pageHideStore, revision1);
const pageHideFlush = utils.commitSchemaV2Revision(pageHideStore, revision2, { failAt: 'recent-ref' });
assert.equal(pageHideFlush.committed, false);
const pageHideRecovery = utils.restoreSchemaV2WithFallback(pageHideStore, revision1.recentEntry);
assert.equal(pageHideRecovery.manifest.key, revision1.manifest.key, 'failed best-effort page hide flush keeps prior commit recoverable');

globalThis.console = originalConsole;
originalConsole.log(
  `Phase 4-M autosave schema V2 checks passed. history=${sizeWithHistory}/${sizeWithoutHistory} bytes, pixelEstimate=${utils.estimatePixelDataBytes(revision1.checkpoints[0].project)} bytes`
);
