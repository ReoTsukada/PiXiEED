import assert from 'node:assert/strict';
import fs from 'node:fs';

const roots = ['PiXiEEDrawDEV', 'pixiedraw'];

for (const root of roots) {
  const html = fs.readFileSync(`${root}/index.html`, 'utf8');
  const css = fs.readFileSync(`${root}/assets/css/style.css`, 'utf8');
  const startup = fs.readFileSync(`${root}/assets/js/modules/startup-workflow-utils.js`, 'utf8');
  const deleteDialogFunction = startup.match(/async function openRecentProjectDeleteConfirmDialog[\s\S]*?\n  function setupRecentProjectDeleteConfirmDialog/);

  assert.match(html, /<dialog[^>]+id="recentProjectDeleteConfirmDialog"/);
  assert.match(html, /startup-workflow-utils\.js\?v=20260715-startup-grid-no-oval1/);
  assert.ok(deleteDialogFunction, `${root}: delete confirmation function must exist`);
  assert.match(deleteDialogFunction[0], /dialog\.hidden = false;[\s\S]*?dialog\.showModal\(\)/);
  assert.match(deleteDialogFunction[0], /Failed to open recent project delete confirmation dialog/);
  assert.match(css, /\.modal\[open\]\s*\{[\s\S]{0,300}z-index:\s*20000/s);
  assert.match(css, /body\.is-project-home-active \.modal\[open\]\s*\{[\s\S]{0,100}z-index:\s*20010/s);
}

console.log('Project delete dialog visibility checks passed for DEV and production');
