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

assert.match(startup, /hydrateStartupWorkspaceProjectCards/);
assert.match(startup, /inspectStartupWorkspaceProject/);
assert.match(startup, /resolveWorkspaceProjectCertification/);
assert.match(startup, /adapterId === 'pixieedraw-v2-zip'/);
assert.match(startup, /summary\.nativeCreated === true/);
assert.match(startup, /summary\.externalInputDetected !== true/);
assert.match(startup, /summary\.completeProjectSave === true/);
assert.match(startup, /summary\.timelapseSynchronized === true/);
assert.match(startup, /summary\.saleCandidateDataComplete === true/);
assert.match(startup, /✓ PiXiEED公認/);
assert.match(startup, /PiXiEEDEndorsed\.png/);
assert.match(startup, /外部入力あり/);
assert.match(startup, /未認証/);
assert.match(startup, /generateSnapshotThumbnail/);

assert.match(css, /startup-workspace__project-thumbnail/);
assert.match(css, /startup-workspace__project-certification\.is-official/);
assert.match(css, /image-rendering:\s*pixelated/);

assert.match(adapterUtils, /readManifestFromBlob/);
assert.match(app, /readProjectStorageManifestFromBlob/);
assert.match(v2Adapter, /projectState\?\.thumbnail/);
assert.match(codec, /previewThumbnail/);
assert.match(codec, /certification:\s*\{/);
assert.match(codec, /nativeCreated:/);
assert.match(codec, /saleCandidateDataComplete:/);
assert.match(autosave, /projectExportIntegrity\s*=\s*\{/);
assert.match(autosave, /thumbnail:\s*previewThumbnail/);
assert.match(exportRendering, /thumbnail:\s*previewThumbnail/);
assert.match(html, /startup-workflow-utils\.js\?v=20260715-workspace-location-guide1/);
assert.match(html, /app\.js\?v=20260715-077/);

console.log('PiXiEEDrawDEV P13 startup certified card checks passed.');
