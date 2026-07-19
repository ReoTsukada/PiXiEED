import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [index, css, app, startup, lifecycle, workflow, devIndex, devWorkflow] = await Promise.all([
  read('pixiedraw/index.html'),
  read('pixiedraw/assets/css/style.css'),
  read('pixiedraw/assets/js/app.js'),
  read('pixiedraw/assets/js/modules/startup-workflow-utils.js'),
  read('pixiedraw/assets/js/modules/open-project-tab-lifecycle.js'),
  read('pixiedraw/assets/js/modules/open-project-tab-workflow-utils.js'),
  read('PiXiEEDrawDEV/index.html'),
  read('PiXiEEDrawDEV/assets/js/modules/open-project-tab-workflow-utils.js'),
]);

assert.match(index, /id="startupScreen"[\s\S]*id="startupScreenTitle">プロジェクト</);
assert.match(index, /id="startupWorkspaceSearch"/);
assert.match(index, /id="startupWorkspaceProjectList"/);
assert.match(index, /id="startupActionNew"[\s\S]*id="startupActionOpen"[\s\S]*id="startupActionSkip"/);
assert.doesNotMatch(index, /id="projectHomeScreen"|id="projectHomeRecentList"/);
assert.match(app, /showLocalProjects[\s\S]{0,900}showStartupScreen\(\{ refreshWorkspace: true \}\)/);
assert.match(startup, /startupWorkspaceSearchQuery/);
assert.match(startup, /\(visibleIndex \+ 1\) % 8 === 0/);
assert.doesNotMatch(startup, /visibleIndex === 3/);
assert.match(startup, /closest\('\.startup-screen__recent, \.startup-workspace,/);
assert.match(lifecycle, /showStartupScreen\?\.\(\{ refreshWorkspace: refresh \}\)/);
for (const source of [workflow, devWorkflow]) {
  assert.match(source, /if \(targetId === previousActiveId\) \{[\s\S]{0,260}hideProjectHomeScreen\(\);/);
  assert.match(source, /\[sheet-switch-debug:success\][\s\S]{0,650}hideProjectHomeScreen\(\);/);
}
assert.match(devIndex, /open-project-tab-workflow-utils\.js\?v=20260719-project-home-reveal1/);
assert.match(css, /\.startup-screen__content\s*\{[\s\S]*?width: min\(1440px, 100%\)/);
assert.match(css, /\.startup-workspace__project-thumbnail\s*\{[\s\S]*?aspect-ratio: 1 \/ 1/);
assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.startup-workspace__list\s*\{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(css, /@media \(orientation: landscape\)[\s\S]*?\.startup-screen\s*\{[\s\S]*?--pixieed-shared-side-nav-width/);
assert.match(css, /--pixieed-shared-side-nav-gap/);

console.log('PiXiEEDraw startup project screen guards passed.');
