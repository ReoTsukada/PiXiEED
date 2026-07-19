import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const modelSource = await readFile(new URL('pixiedraw/assets/js/modules/open-project-tab-model.js', root), 'utf8');
const lifecycleSource = await readFile(new URL('pixiedraw/assets/js/modules/open-project-tab-lifecycle.js', root), 'utf8');

const window = { PiXiEEDrawModules: {} };
vm.runInNewContext(modelSource, { window, console, Date });

const calls = {
  snapshot: 0,
  session: 0,
  package: 0,
};
const model = window.PiXiEEDrawModules.openProjectTabModel.createOpenProjectTabModel({
  SHARED_PROJECTS_ENABLED: false,
  state: { documentName: 'current.pixieedraw' },
  makeHistorySnapshot() {
    calls.snapshot += 1;
    return { documentName: 'current.pixieedraw' };
  },
  buildProjectSessionPayload() {
    calls.session += 1;
    return { history: [] };
  },
  buildPackagedProjectPayload() {
    calls.package += 1;
    return { type: 'pixieedraw-project', updatedAt: '2026-07-19T00:00:00.000Z' };
  },
  normalizeDocumentName: value => String(value || 'untitled.pixieedraw'),
  DEFAULT_DOCUMENT_NAME: 'untitled.pixieedraw',
  hasDocumentUnsavedChanges: () => false,
  normalizeAutosaveProjectId: value => String(value || ''),
  getAutosaveProjectId: () => 'local-active',
  createAutosaveProjectId: () => 'local-created',
  recentProjectsCache: new Map(),
  createOpenProjectTabId: () => 'project-tab-active',
  extractDocumentBaseName: value => String(value || '').replace(/\.pixieedraw$/i, ''),
  createLightweightLocalProjectTabState(tab) {
    return {
      ...tab,
      residentProjectLoaded: Boolean(tab?.deferredProjectPayload),
    };
  },
  createLocalProjectEntrySignature: () => ({}),
  normalizeProjectPersistenceState(value = {}) {
    return {
      sourceStorageAdapterId: value?.sourceStorageAdapterId || null,
      sourceKind: value?.sourceKind || 'unknown',
      sourceProjectToken: value?.sourceProjectToken || 'project-token',
      lastSavedStorageAdapterId: value?.lastSavedStorageAdapterId || null,
    };
  },
  normalizeQrEditPayload: () => null,
  createNativeProjectOriginalityMetadata: () => ({ kind: 'native' }),
  localizeText: japanese => japanese,
});

const metadataOnlyTab = model.createOpenProjectTabFromCurrentState({
  projectId: 'local-metadata',
  sourceKind: 'new',
  metadataOnly: true,
});

assert.deepEqual(calls, { snapshot: 0, session: 0, package: 0 });
assert.equal(metadataOnlyTab.projectId, 'local-metadata');
assert.equal(metadataOnlyTab.fileName, 'current.pixieedraw');
assert.equal(metadataOnlyTab.project, null);
assert.equal(metadataOnlyTab.deferredProjectPayload, null);
assert.equal(metadataOnlyTab.residentProjectLoaded, false);
assert.equal(metadataOnlyTab.canonicalPayloadFormat, 'v2');

const residentTab = model.createOpenProjectTabFromCurrentState({
  projectId: 'local-resident',
  sourceKind: 'new',
});

assert.deepEqual(calls, { snapshot: 1, session: 1, package: 1 });
assert.equal(residentTab.projectId, 'local-resident');
assert.ok(residentTab.project);
assert.equal(residentTab.project, residentTab.deferredProjectPayload);
assert.equal(residentTab.residentProjectLoaded, true);

assert.match(
  lifecycleSource,
  /const initialTab = createOpenProjectTabFromCurrentState\(\{[\s\S]{0,220}metadataOnly: true,/
);
assert.match(
  lifecycleSource,
  /function resetOpenProjectTabsToCurrentProject[\s\S]{0,420}metadataOnly: true,/
);

console.log('PiXiEEDraw active-tab metadata-only payload checks passed.');
