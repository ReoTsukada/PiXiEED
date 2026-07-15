import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexSource = await readFile('PiXiEEDrawDEV/index.html', 'utf8');
const styleSource = await readFile('PiXiEEDrawDEV/assets/css/style.css', 'utf8');
const appSource = await readFile('PiXiEEDrawDEV/assets/js/app.js', 'utf8');
const startupSource = await readFile(
  'PiXiEEDrawDEV/assets/js/modules/startup-workflow-utils.js',
  'utf8'
);
const localizationSource = await readFile(
  'PiXiEEDrawDEV/assets/js/modules/ui-localization-utils.js',
  'utf8'
);

assert.doesNotMatch(indexSource, /id="openPixieedMyPage"/);
assert.match(indexSource, /<button class="button" id="showLocalProjects" type="button">プロジェクト一覧<\/button>/);
assert.match(appSource, /bindClickHandlerOnce\(dom\.controls\.showLocalProjects[\s\S]*?showStartupScreen\(\)/);
assert.match(appSource, /command === 'recent'[\s\S]*?showStartupScreen\(\)/);
assert.match(localizationSource, /#showLocalProjects', 'プロジェクト一覧', 'Projects'/);
assert.match(startupSource, /refreshStartupWorkspaceProjects\(\{ requestPermission: false \}\)/);
assert.match(styleSource, /\.startup-boot-loading \{[\s\S]*?z-index: 19990/);
assert.match(styleSource, /\.startup-screen \{[\s\S]*?z-index: 15000/);
assert.match(styleSource, /\.startup-screen__backdrop \{[\s\S]*?transparent 62%\)[\s\S]*?rgb\(4, 8, 14\)/);
assert.match(styleSource, /body\.is-startup-active \.bottom-nav,[\s\S]*?z-index: 15020 !important/);
assert.match(styleSource, /@media \(max-width: 430px\) \{[\s\S]*?\.startup-screen \{[\s\S]*?calc\(12px \+ var\(--safe-area-left\)\)/);
assert.match(styleSource, /@media \(max-width: 430px\) \{[\s\S]*?\.startup-screen__actions \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
assert.match(indexSource, /build-info\.js\?v=20260715-092/);
assert.match(indexSource, /app\.js\?v=20260715-092/);

console.log('PiXiEEDrawDEV start-screen chrome checks passed');
