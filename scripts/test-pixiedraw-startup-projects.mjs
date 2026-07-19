import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [index, css, app, startup, lifecycle, workflow, devIndex, devStartup, devWorkflow, lensIndex] = await Promise.all([
  read('pixiedraw/index.html'),
  read('pixiedraw/assets/css/style.css'),
  read('pixiedraw/assets/js/app.js'),
  read('pixiedraw/assets/js/modules/startup-workflow-utils.js'),
  read('pixiedraw/assets/js/modules/open-project-tab-lifecycle.js'),
  read('pixiedraw/assets/js/modules/open-project-tab-workflow-utils.js'),
  read('PiXiEEDrawDEV/index.html'),
  read('PiXiEEDrawDEV/assets/js/modules/startup-workflow-utils.js'),
  read('PiXiEEDrawDEV/assets/js/modules/open-project-tab-workflow-utils.js'),
  read('pixiee-lens/index.html'),
]);

assert.match(index, /id="startupScreen"[\s\S]*id="startupScreenTitle">プロジェクト</);
assert.match(index, /id="startupWorkspaceSearch"/);
assert.match(index, /id="startupWorkspaceProjectList"/);
assert.match(index, /id="startupActionNew"[\s\S]*id="startupActionOpen"[\s\S]*id="startupActionSkip"/);
assert.doesNotMatch(index, /id="projectHomeScreen"|id="projectHomeRecentList"/);
assert.doesNotMatch(index, /id="updateToast"|id="updateToastCloseBtn"|class="update-toast"/);
assert.doesNotMatch(devIndex, /id="updateToast"|id="updateToastCloseBtn"|class="update-toast"/);
assert.doesNotMatch(lensIndex, /id="updateToast"|id="updateToastCloseBtn"|class="update-toast"|pixiee-lens:update-toast-hidden/);
for (const html of [index, devIndex]) {
  assert.match(html, /id="stage" tabindex="-1"/);
}
assert.match(index, /startup-workflow-utils\.js\?v=20260719-project-session-handoff1/);
assert.match(devIndex, /startup-workflow-utils\.js\?v=20260719-startup-focus1/);
for (const source of [startup, devStartup]) {
  assert.match(source, /container\.inert = false;[\s\S]{0,100}container\.hidden = false;[\s\S]{0,100}container\.removeAttribute\('aria-hidden'\);/);
  assert.match(source, /container\.contains\(activeElement\)[\s\S]{0,280}dom\.stage\.focus\(\{ preventScroll: true \}\);[\s\S]{0,280}container\.inert = true;[\s\S]{0,100}container\.hidden = true;/);
  assert.doesNotMatch(source, /container\.setAttribute\('aria-hidden', '(?:true|false)'\)/);
}

function verifyStartupDismissFocus(source) {
  const events = [];
  let activeElement = null;
  class FakeHTMLElement {
    constructor(name) {
      this.name = name;
      this.dataset = {};
      this._hidden = false;
      this._inert = false;
    }
    contains(element) { return this.name === 'startup' && element?.name === 'open-button'; }
    focus() { events.push(`${this.name}:focus`); activeElement = this; }
    blur() { events.push(`${this.name}:blur`); if (activeElement === this) activeElement = null; }
    removeAttribute(name) { events.push(`${this.name}:remove-${name}`); }
    set hidden(value) { events.push(`${this.name}:hidden=${value}`); this._hidden = value; }
    get hidden() { return this._hidden; }
    set inert(value) { events.push(`${this.name}:inert=${value}`); this._inert = value; }
    get inert() { return this._inert; }
  }
  const startupScreen = new FakeHTMLElement('startup');
  const openButton = new FakeHTMLElement('open-button');
  const stage = new FakeHTMLElement('stage');
  activeElement = openButton;
  const document = {
    get activeElement() { return activeElement; },
    body: { classList: { remove() {} } },
    title: 'PiXiEEDraw',
  };
  const window = { PiXiEEDrawModules: {}, localStorage: { setItem() {} }, history: { replaceState() {} } };
  vm.runInNewContext(source, { window, document, HTMLElement: FakeHTMLElement, console });
  const scope = {
    dom: { startup: { screen: startupScreen }, stage },
    startupVisible: true,
    startupVirtualCursorState: null,
    startupScreenMode: 'default',
    lensImportRequested: false,
    canUseSessionStorage: false,
    STARTUP_SCREEN_MODE_DEFAULT: 'default',
    setVirtualCursorEnabled() {},
  };
  window.PiXiEEDrawModules.startupWorkflowUtils.createStartupWorkflowUtils(scope).hideStartupScreen();
  assert.equal(activeElement, stage);
  assert.equal(startupScreen.inert, true);
  assert.equal(startupScreen.hidden, true);
  assert.deepEqual(events.slice(0, 3), ['stage:focus', 'startup:inert=true', 'startup:hidden=true']);
}

verifyStartupDismissFocus(startup);
verifyStartupDismissFocus(devStartup);
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
