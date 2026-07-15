import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

globalThis.window = { PiXiEEDrawModules: {} };
vm.runInThisContext(
  fs.readFileSync('PiXiEEDrawDEV/assets/js/modules/local-project-v2-migration-utils.js', 'utf8'),
  { filename: 'local-project-v2-migration-utils.js' }
);

const migration = window.PiXiEEDrawModules.localProjectV2MigrationUtils.createLocalProjectV2MigrationUtils();
const trueV2Entry = {
  id: 'true-v2',
  autosaveSchemaVersion: 2,
  manifestKey: 'local:true-v2:manifest:1',
};
const trueV2Project = {
  type: 'pixieedraw-project',
  packageVersion: 2,
  projectLayout: 'single-project',
  document: { documentName: 'true.pixieedraw', frames: [] },
};
assert.equal(migration.inspectEntry(trueV2Entry, trueV2Project).trueV2, true);

const legacyInlineEntry = {
  id: 'legacy-v1',
  project: { document: { frames: [] } },
};
assert.equal(migration.inspectEntry(legacyInlineEntry, legacyInlineEntry.project).requiresMigration, true);
assert.equal(migration.inspectEntry(legacyInlineEntry, legacyInlineEntry.project).reason, 'legacy-storage-record');

const legacyMatrix = {
  sheets: Array.from({ length: 3 }, (_, sheetIndex) => ({
    id: `sheet-${sheetIndex + 1}`,
    project: {
      document: {
        canvases: Array.from({ length: 2 }, (_, canvasIndex) => ({
          id: `sheet-${sheetIndex + 1}-canvas-${canvasIndex + 1}`,
          frames: [],
        })),
      },
    },
  })),
};
const matrixInspection = migration.inspectEntry({ id: 'matrix' }, legacyMatrix);
assert.equal(matrixInspection.needsSplit, true);
assert.equal(matrixInspection.sheets.length, 3);

const singleLegacySheet = {
  sheets: [{
    id: 'legacy-sheet',
    project: {
      type: 'pixieedraw-project',
      packageVersion: 1,
      sheets: [{ id: 'nested-legacy', project: {} }],
      activeSheetId: 'nested-legacy',
      document: {
        documentName: 'old.pixieedraw',
        canvases: [{ id: 'only-canvas', width: 8, height: 8, frames: [] }],
      },
      session: { timelapse: { enabled: true } },
    },
  }],
};
const normalized = migration.normalizeSingleProject(
  { id: 'single-old', fileName: 'converted.pixieedraw' },
  singleLegacySheet
);
assert.equal(normalized.packageVersion, 2);
assert.equal(normalized.projectLayout, 'single-project');
assert.equal(normalized.document.documentName, 'converted.pixieedraw');
assert.equal(normalized.document.canvases.length, 1);
assert.equal(normalized.document.activeCanvasId, 'only-canvas');
assert.equal('sheets' in normalized, false);
assert.equal('activeSheetId' in normalized, false);
assert.equal(normalized.session.timelapse.enabled, true);

assert.throws(
  () => migration.normalizeSingleProject({ id: 'multi' }, legacyMatrix),
  /multiple projects/
);

const app = fs.readFileSync('PiXiEEDrawDEV/assets/js/app.js', 'utf8');
const startup = fs.readFileSync('PiXiEEDrawDEV/assets/js/modules/startup-workflow-utils.js', 'utf8');
const html = fs.readFileSync('PiXiEEDrawDEV/index.html', 'utf8');

assert.match(app, /async function migrateLegacyLocalProjectsToTrueV2/);
assert.match(app, /cleanupSchemaV2Revisions\(projectId, \{/);
assert.match(app, /keepManifestRevisions: 1/);
assert.match(app, /delete normalizedProject\.sheets|normalizeSingleProject\(entry, packaged\)/);
assert.match(app, /removeAutosaveV2ProjectData\(normalizedSourceProjectId\)/);
assert.match(startup, /端末内にV1・旧V2プロジェクトが/);
assert.match(startup, /元のV1・旧V2データを削除します/);
assert.match(startup, /mergeFileBackedTimelapseIntoPackaged/);
assert.doesNotMatch(startup, /migrateFilelessLocalProjectsToWorkspace|writePackagedProjectToWorkspace/);
assert.match(html, /local-project-v2-migration-utils\.js\?v=20260715-local-true-v2-cleanup1/);

console.log('PiXiEEDrawDEV local true V2 migration checks passed.');
