import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const app = read('PiXiEEDrawDEV/assets/js/app.js');
const startup = read('PiXiEEDrawDEV/assets/js/modules/startup-workflow-utils.js');
const css = read('PiXiEEDrawDEV/assets/css/style.css');
const adapterUtils = read('PiXiEEDrawDEV/assets/js/modules/project-storage-adapter-utils.js');
const v2Adapter = read('PiXiEEDrawDEV/assets/js/modules/project-storage-v2-zip-adapter.js');
const codec = read('PiXiEEDrawDEV/assets/js/modules/project-storage-v2-archive-codec.js');
const autosave = read('PiXiEEDrawDEV/assets/js/modules/autosave-workflow-utils.js');
const exportRendering = read('PiXiEEDrawDEV/assets/js/modules/export-rendering.js');
const html = read('PiXiEEDrawDEV/index.html');

assert.match(startup, /loadDeviceLocalWorkspaceEntries/);
assert.match(startup, /renderStartupWorkspaceProjects\(localEntries\)/);
assert.match(startup, /端末内プロジェクトのサムネイル/);
assert.match(startup, /端末内V2/);
assert.match(startup, /完全ファイルは手動保存できます/);
assert.doesNotMatch(startup, /hydrateStartupWorkspaceProjectCards|inspectStartupWorkspaceProject|resolveWorkspaceProjectCertification/);

assert.match(css, /startup-workspace__project-thumbnail/);
assert.match(css, /startup-workspace__project-certification\.is-local/);
assert.match(css, /image-rendering:\s*pixelated/);

assert.match(adapterUtils, /readManifestFromBlob/);
assert.match(app, /readProjectStorageManifestFromBlob/);
assert.match(v2Adapter, /projectState\?\.thumbnail/);
assert.match(codec, /previewThumbnail/);
assert.match(codec, /certification:\s*\{/);
assert.match(codec, /approvalStatus: 'unsubmitted'/);
assert.match(codec, /approvalScope: 'sales-submission-only'/);
assert.match(codec, /serverAttested: false/);
assert.match(codec, /nativeCreated:/);
assert.match(codec, /saleCandidateDataComplete:/);
assert.doesNotMatch(autosave, /projectExportIntegrity\s*=\s*\{/);
assert.match(autosave, /writeAutosaveV2Primary/);
assert.match(exportRendering, /thumbnail:\s*previewThumbnail/);
assert.match(html, /startup-workflow-utils\.js\?v=20260715-local-true-v2-cleanup1/);
assert.match(html, /app\.js\?v=20260715-089/);

console.log('PiXiEEDrawDEV P13 startup certified card checks passed.');
