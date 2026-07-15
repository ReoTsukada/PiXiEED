import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const workspaceSource = read('scripts/pixieed-workspace.js');
const context = vm.createContext({
  window: {},
  console,
  CustomEvent: class CustomEvent {},
});
context.window.window = context.window;
vm.runInContext(workspaceSource, context, { filename: 'pixieed-workspace.js' });

const workspace = context.window.PiXiEEDWorkspace;
assert.ok(workspace, 'shared workspace API should be registered');
assert.equal(workspace.WORKSPACE_NAME, 'PiXiEED');
assert.equal(workspace.PROJECTS_DIRECTORY, 'Projects');
assert.equal(workspace.EXPORTS_DIRECTORY, 'Exports');
assert.equal(workspace.getStatus().directoryPickerSupported, false);
assert.equal(workspace.getStatus().lastErrorCode, '');
assert.deepEqual(
  Array.from(workspace.collectProjectFiles([
    { name: 'image.png', lastModified: 3 },
    { name: 'older.pixieedraw', lastModified: 1 },
    { name: 'newer.PIXIEEDRAW', lastModified: 2 },
  ]), entry => entry.name),
  ['newer.PIXIEEDRAW', 'older.pixieedraw'],
  'folder-read fallback should retain only project files and sort newest first'
);
assert.match(workspaceSource, /pixieed-workspace-v1/);
assert.match(workspaceSource, /LEGACY_DB_NAME = 'pixieedraw-autosave'/);
assert.match(workspaceSource, /createProjectFileHandle/);
assert.equal(typeof workspace.removeProjectFile, 'function');
assert.equal(workspace.resolveDerivedExportCategory('work.png'), 'PNG');
assert.equal(workspace.resolveDerivedExportCategory('work-animation.gif'), 'GIF');
assert.equal(workspace.resolveDerivedExportCategory('work-timelapse.gif'), 'Timelapse');
assert.equal(workspace.resolveDerivedExportCategory('work.svg'), 'SVG');
assert.equal(workspace.resolveDerivedExportCategory('work.glb'), 'GLB');
assert.equal(workspace.resolveDerivedExportCategory('work.zip'), 'ZIP');

class MockFileHandle {
  constructor(name) {
    this.kind = 'file';
    this.name = name;
  }
  async queryPermission() { return 'granted'; }
}

class MockDirectoryHandle {
  constructor(name) {
    this.kind = 'directory';
    this.name = name;
    this.directories = new Map();
    this.files = new Map();
  }
  async queryPermission() { return 'granted'; }
  async getDirectoryHandle(name, { create = false } = {}) {
    if (this.directories.has(name)) return this.directories.get(name);
    if (!create) throw Object.assign(new Error('missing directory'), { name: 'NotFoundError' });
    const directory = new MockDirectoryHandle(name);
    this.directories.set(name, directory);
    return directory;
  }
  async getFileHandle(name, { create = false } = {}) {
    if (this.files.has(name)) return this.files.get(name);
    if (!create) throw Object.assign(new Error('missing file'), { name: 'NotFoundError' });
    const file = new MockFileHandle(name);
    this.files.set(name, file);
    return file;
  }
  async removeEntry(name) {
    if (!this.files.delete(name)) throw Object.assign(new Error('missing file'), { name: 'NotFoundError' });
  }
}

const pickedRoot = new MockDirectoryHandle('Selected');
const filesystemContext = vm.createContext({
  window: { showDirectoryPicker: async () => pickedRoot },
  console,
  CustomEvent: class CustomEvent {},
});
filesystemContext.window.window = filesystemContext.window;
filesystemContext.window.dispatchEvent = () => {};
vm.runInContext(workspaceSource, filesystemContext, { filename: 'pixieed-workspace.js' });
const filesystemWorkspace = filesystemContext.window.PiXiEEDWorkspace;
const firstPng = await filesystemWorkspace.createDerivedExportFileEntry('art.png');
const secondPng = await filesystemWorkspace.createDerivedExportFileEntry('art.png');
const timelapse = await filesystemWorkspace.createDerivedExportFileEntry('art-timelapse.gif');
const project = await filesystemWorkspace.createProjectFileHandle('art');
assert.equal(firstPng.filename, 'art.png');
assert.equal(secondPng.filename, 'art-1.png');
assert.equal(timelapse.filename, 'art-timelapse.gif');
assert.equal(project.name, 'art.pixieedraw');
const pixieedDirectory = pickedRoot.directories.get('PiXiEED');
assert.ok(pixieedDirectory.directories.get('Projects').files.has('art.pixieedraw'));
assert.equal(await filesystemWorkspace.removeProjectFile('art.pixieedraw'), true);
assert.equal(pixieedDirectory.directories.get('Projects').files.has('art.pixieedraw'), false);
assert.ok(pixieedDirectory.directories.get('Exports').directories.get('PNG').files.has('art-1.png'));
assert.ok(pixieedDirectory.directories.get('Exports').directories.get('Timelapse').files.has('art-timelapse.gif'));

const invalidRootContext = vm.createContext({
  window: { showDirectoryPicker: async () => new MockDirectoryHandle('Projects') },
  console,
  CustomEvent: class CustomEvent {},
});
invalidRootContext.window.window = invalidRootContext.window;
invalidRootContext.window.dispatchEvent = () => {};
vm.runInContext(workspaceSource, invalidRootContext, { filename: 'pixieed-workspace.js' });
assert.equal(await invalidRootContext.window.PiXiEEDWorkspace.connect({ requestPermission: true }), null);
assert.equal(invalidRootContext.window.PiXiEEDWorkspace.getStatus().lastErrorCode, 'projects-folder-selected');

const app = read('PiXiEEDrawDEV/assets/js/app.js');
const startup = read('PiXiEEDrawDEV/assets/js/modules/startup-workflow-utils.js');
const openImport = read('PiXiEEDrawDEV/assets/js/modules/open-import-workflow-utils.js');
const session = read('PiXiEEDrawDEV/assets/js/modules/document-session-workflow-utils.js');
const delivery = read('PiXiEEDrawDEV/assets/js/modules/export-delivery-utils.js');
const rendering = read('PiXiEEDrawDEV/assets/js/modules/export-rendering.js');
const drawHtml = read('PiXiEEDrawDEV/index.html');
const lensHtml = read('pixiee-lens/index.html');

assert.match(drawHtml, /id="startupWorkspaceProjectList"/);
assert.match(drawHtml, /id="startupWorkspaceTitle">プロジェクト一覧</);
assert.doesNotMatch(drawHtml, /id="startupWorkspaceRefresh"/);
assert.doesNotMatch(drawHtml, /id="startupWorkspaceReadFolder"/);
assert.doesNotMatch(drawHtml, /id="startupWorkspaceFolderInput"/);
const startupActionsMarkup = drawHtml.match(/<div[^>]*class="startup-screen__actions"[^>]*>[\s\S]*?<\/div>/)?.[0] || '';
assert.doesNotMatch(startupActionsMarkup, /account\/index\.html/);
assert.doesNotMatch(drawHtml, /id="startupScreenHint"|id="startupLensHint"/);
assert.doesNotMatch(drawHtml, /scripts\/pixieed-workspace\.js/);
assert.doesNotMatch(drawHtml, /id="startupActionSkip"/);
assert.match(app, /const shouldAutoRestoreReloadSnapshot = false;/);
assert.match(app, /phase: 'startup-session-restore-skipped'/);
assert.match(app, /hideProjectHomeScreen\(\);\s*showStartupScreen\(\{ refreshWorkspace: false \}\);/);
assert.match(startup, /setupStartupWorkspace\(\);/);
assert.match(startup, /migrateLegacyLocalProjectsToTrueV2/);
assert.match(startup, /loadDeviceLocalWorkspaceEntries/);
assert.match(startup, /migrationRecovery/);
assert.match(startup, /端末内・V2移行待ち/);
assert.match(startup, /await openRecentProject\(entry/);
assert.match(startup, /buildDeviceLocalWorkspaceEntries/);
assert.match(startup, /deviceLocalProject: true/);
assert.match(startup, /端末内V2/);
assert.match(startup, /端末内の真V2プロジェクトを表示しています/);
assert.doesNotMatch(startup, /createProjectFileHandle|migrateFilelessLocalProjectsToWorkspace|filterFilelessLocalProjects|classifyWorkspaceMigrationError/);
assert.doesNotMatch(drawHtml, /保存場所を選んで接続|id="startupWorkspaceConnect"/);
assert.doesNotMatch(read('PiXiEEDrawDEV/assets/js/modules/autosave-workflow-utils.js'), /destinationSyncRequested|showSaveFilePicker|createWritable/);
assert.match(read('PiXiEEDrawDEV/assets/js/modules/autosave-workflow-utils.js'), /端末内V2へ保存済み/);
assert.match(app, /get openDocumentAsNewProject\(\) \{ return openDocumentAsNewProject; \}/);
assert.doesNotMatch(startup, /hydrateStartupWorkspaceProjectCards|resolveWorkspaceProjectCertification/);
assert.match(drawHtml, /startupWorkspaceProjectList/);
assert.match(read('PiXiEEDrawDEV/assets/css/style.css'), /startup-workspace__project-thumbnail/);
assert.match(read('PiXiEEDrawDEV/assets/css/style.css'), /startup-workspace__project-certification\.is-local/);
assert.doesNotMatch(openImport, /bindOpenedFile/);
assert.doesNotMatch(session, /canBindOpenedProjectFile|opened-project-file-bound/);
assert.doesNotMatch(delivery, /createDerivedExportFileEntry|showSaveFilePicker|createWritable/);
assert.match(rendering, /reason: 'download-only'/);
assert.doesNotMatch(rendering, /allowFilePicker/);
assert.match(rendering, /projectCompanionResult/);
assert.doesNotMatch(rendering, /normalizedTasks\.push\(\{[\s\S]{0,300}PROJECT_FILE_MIME_TYPE/);
assert.match(lensHtml, /scripts\/pixieed-workspace\.js/);
assert.match(lensHtml, /getDirectoryHandle\('LENS'/);
assert.match(lensHtml, /categoryName = String\(filename \|\| ''\).*'GIF' : 'Photos'/);

console.log('PiXiEEDrawDEV shared workspace v1 checks passed.');
