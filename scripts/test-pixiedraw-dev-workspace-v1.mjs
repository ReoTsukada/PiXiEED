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

const app = read('PiXiEEDrawDEV/assets/js/app.js');
const startup = read('PiXiEEDrawDEV/assets/js/modules/startup-workflow-utils.js');
const openImport = read('PiXiEEDrawDEV/assets/js/modules/open-import-workflow-utils.js');
const session = read('PiXiEEDrawDEV/assets/js/modules/document-session-workflow-utils.js');
const delivery = read('PiXiEEDrawDEV/assets/js/modules/export-delivery-utils.js');
const rendering = read('PiXiEEDrawDEV/assets/js/modules/export-rendering.js');
const drawHtml = read('PiXiEEDrawDEV/index.html');
const lensHtml = read('pixiee-lens/index.html');

assert.match(drawHtml, /id="startupWorkspaceProjectList"/);
assert.doesNotMatch(drawHtml, /id="startupWorkspaceRefresh"/);
assert.doesNotMatch(drawHtml, /id="startupWorkspaceReadFolder"/);
assert.doesNotMatch(drawHtml, /id="startupWorkspaceFolderInput"/);
const startupActionsMarkup = drawHtml.match(/<div[^>]*class="startup-screen__actions"[^>]*>[\s\S]*?<\/div>/)?.[0] || '';
assert.doesNotMatch(startupActionsMarkup, /account\/index\.html/);
assert.doesNotMatch(drawHtml, /id="startupScreenHint"|id="startupLensHint"/);
assert.match(drawHtml, /scripts\/pixieed-workspace\.js/);
assert.doesNotMatch(drawHtml, /id="startupActionSkip"/);
assert.match(app, /const shouldAutoRestoreReloadSnapshot = false;/);
assert.match(app, /phase: 'startup-session-restore-skipped'/);
assert.match(app, /hideProjectHomeScreen\(\);\s*showStartupScreen\(\);/);
assert.match(startup, /setupStartupWorkspace\(\);/);
assert.match(startup, /createProjectFileHandle/);
assert.match(startup, /migrateFilelessLocalProjectsToWorkspace/);
assert.match(startup, /filterFilelessLocalProjects/);
assert.match(startup, /serializeProjectStorageSnapshot/);
assert.match(startup, /mergeFileBackedTimelapseIntoPackaged/);
assert.match(startup, /removeRecentProjectEntry/);
assert.match(app, /workspaceFileName: autosaveHandle\?\.name/);
assert.match(openImport, /bindOpenedFile: Boolean\(handle\)/);
assert.match(session, /canBindOpenedProjectFile/);
assert.match(session, /adapterId === 'pixieedraw-v2-zip'/);
assert.match(session, /opened-project-file-bound/);
assert.match(delivery, /createDerivedExportFileEntry/);
assert.match(rendering, /saveMethod = 'workspace-project'/);
assert.match(rendering, /projectCompanionResult/);
assert.doesNotMatch(rendering, /normalizedTasks\.push\(\{[\s\S]{0,300}PROJECT_FILE_MIME_TYPE/);
assert.match(lensHtml, /scripts\/pixieed-workspace\.js/);
assert.match(lensHtml, /getDirectoryHandle\('LENS'/);
assert.match(lensHtml, /categoryName = String\(filename \|\| ''\).*'GIF' : 'Photos'/);

console.log('PiXiEEDrawDEV shared workspace v1 checks passed.');
