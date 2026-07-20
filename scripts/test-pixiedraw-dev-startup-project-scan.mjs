import assert from 'node:assert/strict';
import fs from 'node:fs';

const startup = fs.readFileSync('PiXiEEDrawDEV/assets/js/modules/startup-workflow-utils.js', 'utf8');
const app = fs.readFileSync('PiXiEEDrawDEV/assets/js/app.js', 'utf8');
const index = fs.readFileSync('PiXiEEDrawDEV/index.html', 'utf8');

const workspaceSetup = startup.slice(
  startup.indexOf('  function setupStartupWorkspace()'),
  startup.indexOf('\n  function setupStartupScreen()', startup.indexOf('  function setupStartupWorkspace()'))
);
const workspaceRefresh = startup.slice(
  startup.indexOf('  async function refreshStartupWorkspaceProjects()'),
  startup.indexOf('\n  function setupStartupWorkspace()', startup.indexOf('  async function refreshStartupWorkspaceProjects()'))
);

assert.doesNotMatch(
  workspaceSetup,
  /migrateLegacyLocalProjectsToTrueV2|readAutosaveV2PrimaryProject/,
  'DEV bootstrap may read project-card metadata but must not decode or migrate projects'
);
assert.doesNotMatch(
  workspaceRefresh,
  /migrateLegacyLocalProjectsToTrueV2|readAutosaveV2PrimaryProject/,
  'opening the project list must read metadata only; legacy migration is not a startup task'
);
assert.match(app, /showStartupScreen\(\{ refreshWorkspace: false \}\)/);
assert.match(index, /id="startupActionProjects"/);
assert.match(index, /<section[^>]*class="startup-workspace"[^>]*id="startupWorkspace"/);
assert.match(workspaceSetup, /void refreshStartupWorkspaceProjects\(\)/);

console.log('PiXiEEDraw DEV startup project scan guard passed.');
