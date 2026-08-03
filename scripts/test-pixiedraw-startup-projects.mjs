import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [index, css, app, startup, lifecycle, workflow, lensIndex, documentSession, dialogSetup] = await Promise.all([
  read('pixiedraw/index.html'),
  read('pixiedraw/assets/css/style.css'),
  read('pixiedraw/assets/js/app.js'),
  read('pixiedraw/assets/js/modules/startup-workflow-utils.js'),
  read('pixiedraw/assets/js/modules/open-project-tab-lifecycle.js'),
  read('pixiedraw/assets/js/modules/open-project-tab-workflow-utils.js'),
  read('pixiee-lens/index.html'),
  read('pixiedraw/assets/js/modules/document-session-workflow-utils.js'),
  read('pixiedraw/assets/js/modules/dialog-setup-utils.js'),
]);

assert.match(index, /id="startupScreen"[\s\S]*id="startupScreenTitle">プロジェクト</);
assert.match(index, /id="startupWorkspaceSearch"/);
assert.match(index, /id="startupWorkspaceJoinCode"/);
assert.match(index, /id="startupWorkspaceCodeStatus"/);
assert.match(index, /id="startupWorkspaceProjectList"/);
assert.match(index, /id="startupActionNew"[\s\S]*id="startupActionOpen"[\s\S]*id="startupActionSkip"/);
assert.doesNotMatch(index, /id="projectHomeScreen"|id="projectHomeRecentList"/);
assert.doesNotMatch(index, /id="updateToast"|id="updateToastCloseBtn"|class="update-toast"/);
assert.doesNotMatch(lensIndex, /id="updateToast"|id="updateToastCloseBtn"|class="update-toast"|pixiee-lens:update-toast-hidden/);
for (const html of [index]) {
  assert.match(html, /id="stage" tabindex="-1"/);
}
assert.match(index, /startup-workflow-utils\.js\?v=[^"\s]+/);
assert.match(index, /document-model\.js\?v=20260724-legacy-cow-migration1/);
assert.match(index, /app\.js\?v=[^"\s]+/);
assert.match(index, /dialog-setup-utils\.js\?v=20260803-dialog-auto-dismiss10s1/);
assert.match(index, /timeline-layers\.js\?v=[^"\s]+/);
assert.match(index, /retired-collaboration-compat\.js\?v=[^"\s]+/);
for (const source of [startup]) {
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
assert.match(app, /showLocalProjects[\s\S]{0,900}showStartupScreen\(\{ refreshWorkspace: true \}\)/);
assert.match(app, /function closeEditorPanelsForProjectList\(\)[\s\S]{0,700}setCompactRightFlyoutOpen\(false\)[\s\S]{0,700}setRightTab\('frames'\)/);
assert.match(startup, /closeEditorPanelsForProjectList\?\.\(\);/);
assert.match(app, /upgradeLegacyRasterDocumentsToCopyOnWrite[\s\S]{0,900}legacyRasterMigrationResult/);
assert.match(app, /LEGACY_PROJECT_REOPEN_NOTICE_SEEN_KEY[\s\S]{0,1200}window\.alert\([\s\S]{0,900}プロジェクトを一度開き直してください[\s\S]{0,450}色の調整をもう一度行っていただく場合がございます/);
assert.match(app, /startupReady = true;[\s\S]{0,350}scheduleLegacyProjectReopenNotice\(\)/);
assert.match(app, /timelineMatrixViewportPan = \{[\s\S]{0,120}startedOnControl: false/);
assert.match(await read('pixiedraw\/assets\/js\/modules\/timeline-layers.js'), /activationThreshold[\s\S]{0,220}startedOnControl/);
assert.match(startup, /startupWorkspaceSearchQuery/);
assert.match(startup, /joinPiXiSyncFromStartupWorkspace\(inviteToken\)/);
assert.match(app, /runSafeProjectJoin\([\s\S]{0,2200}createNewProject\([\s\S]{0,900}initializePiXiSyncRuntime\(\)/);
assert.match(app, /restoreProject:[\s\S]{0,500}openRecentProject\(entry,[\s\S]{0,300}replaceOpenProjectTabs: true/);
assert.match(app, /getRuntime = \(\) => window\.__PIXISYNC_V1_RUNTIME__/);
assert.match(startup, /PiXiEEDCardFeedAds\?\.renderProgressively/);
assert.match(startup, /closest\('\.startup-screen__recent, \.startup-workspace,/);
assert.match(lifecycle, /showStartupScreen\?\.\(\{ refreshWorkspace: refresh \}\)/);
for (const source of [workflow]) {
  assert.match(source, /if \(targetId === previousActiveId\) \{[\s\S]{0,260}hideProjectHomeScreen\(\);/);
  assert.match(source, /\[sheet-switch-debug:success\][\s\S]{0,650}hideProjectHomeScreen\(\);/);
}
assert.match(css, /\.startup-screen__content\s*\{[\s\S]*?width: min\(1440px, 100%\)/);
assert.match(css, /\.startup-workspace__project-thumbnail\s*\{[\s\S]*?aspect-ratio: 1 \/ 1/);
assert.match(startup, /isPiXiSyncCard = Boolean\([\s\S]{0,220}entry\?\.pixisync/);
assert.match(startup, /プロジェクトを選ぶと、そのプロジェクトだけを必要に応じて自動変換します/);
assert.doesNotMatch(startup, /V1・旧V2プロジェクトが\$\{count\}件あります/);
assert.doesNotMatch(startup, /migrateLegacyLocalProjectsToTrueV2/);
assert.doesNotMatch(index, /legacyProjectMigrationDialog/);
assert.doesNotMatch(app, /legacyProjectMigration|requestLegacyV2MigrationConsent/);
assert.match(documentSession, /選択したプロジェクトをV2へ自動変換しています/);
assert.match(dialogSetup, /setupDialogAutoDismiss\(\{ delayMs = 10_000 \} = \{\}\)/);
assert.match(dialogSetup, /dialog\.close\('timeout'\)/);
assert.match(app, /setupDialogAutoDismiss\?\.\(\)/);
assert.match(startup, /startup-workspace__project-share-badge/);
assert.match(startup, /シェア中/);
assert.match(css, /\.startup-workspace__project-share-badge\s*\{[\s\S]*?position: absolute;[\s\S]*?top: 14px;[\s\S]*?left: 14px;/);
assert.match(css, /\.startup-workspace__search-row\s*\{[\s\S]*?display: flex;/);
assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.startup-workspace__list\s*\{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(css, /@media \(orientation: landscape\)[\s\S]*?\.startup-screen\s*\{[\s\S]*?--pixieed-shared-side-nav-width/);
assert.match(css, /--pixieed-shared-side-nav-gap/);

console.log('PiXiEEDraw startup project screen guards passed.');
