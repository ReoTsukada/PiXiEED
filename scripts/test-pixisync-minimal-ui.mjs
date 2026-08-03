import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

class FakeElement {
  constructor(ownerDocument = null) {
    this.ownerDocument = ownerDocument;
    this.hidden = false;
    this.disabled = false;
    this.textContent = '';
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.children = [];
    this.value = '';
    this.placeholder = '';
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.classList = {
      values: new Set(),
      add: (...names) => names.forEach(name => this.classList.values.add(name)),
      remove: (...names) => names.forEach(name => this.classList.values.delete(name)),
      toggle: (name, force) => {
        const enabled = force === undefined ? !this.classList.values.has(name) : Boolean(force);
        if (enabled) this.classList.values.add(name);
        else this.classList.values.delete(name);
        return enabled;
      },
      contains: name => this.classList.values.has(name),
    };
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type) {
    this.listeners.delete(type);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = children;
  }

  click() {
    return this.listeners.get('click')?.();
  }

  dispatch(type, event = {}) {
    return this.listeners.get(type)?.({ type, ...event });
  }
}

const fakeDocument = {
  body: new FakeElement(),
  createElement: () => new FakeElement(fakeDocument),
};
globalThis.window = {
  PiXiEEDrawModules: {},
  document: fakeDocument,
  navigator: {},
  location: { href: 'https://example.test/pixiedraw/' },
  history: {},
};

for (const relativePath of [
  '../pixiedraw/assets/js/modules/pixisync-session-state.js',
  '../pixiedraw/assets/js/modules/pixisync-project-switch-utils.js',
  '../pixiedraw/assets/js/modules/pixisync-minimal-ui-utils.js',
]) {
  new Function(await readFile(new URL(relativePath, import.meta.url), 'utf8'))();
}

const createSession = window.PiXiEEDrawModules.pixisyncSessionState.createPiXiSyncSessionState;
const createUi = window.PiXiEEDrawModules.pixisyncMinimalUiUtils.createPiXiSyncMinimalUi;
const createElements = () => {
  const elements = {
    panel: new FakeElement(),
    quickOpen: new FakeElement(),
    mobileTab: new FakeElement(),
    statusLabel: new FakeElement(),
    participantCount: new FakeElement(),
    participantList: new FakeElement(fakeDocument),
    connectionLabel: new FakeElement(),
    start: new FakeElement(),
    copyInvite: new FakeElement(),
    copyInviteCode: new FakeElement(),
    accessCodeField: new FakeElement(),
    accessCode: new FakeElement(),
    joinCode: new FakeElement(),
    participantsTab: new FakeElement(),
    commentsTab: new FakeElement(),
    participantsView: new FakeElement(),
    commentsView: new FakeElement(),
    commentList: new FakeElement(fakeDocument),
    notice: new FakeElement(),
    drawLock: new FakeElement(),
    drawLockLabel: new FakeElement(),
    canvasViewport: new FakeElement(),
  };
  return elements;
};

function activate(session, { role = 'owner', head = 0 } = {}) {
  let result = session.dispatch(role === 'owner'
    ? { type: 'OPEN_REQUEST', projectKey: 'project' }
    : { type: 'JOIN_REQUEST', projectKey: 'invite' });
  const epoch = result.state.epoch;
  session.dispatch(role === 'owner'
    ? { type: 'ROOM_READY', epoch, roomId: 'room-a', status: 'active', generation: '1' }
    : { type: 'MEMBERSHIP_OK', epoch, roomId: 'room-a', status: 'active', generation: '1', canEdit: true });
  session.dispatch({ type: 'CHANNEL_SUBSCRIBED', epoch, generation: '1', topic: 'pixisync:room:room-a', private: true });
  session.dispatch({ type: 'CHECKPOINT_LOADED', epoch, generation: '1', revision: 0 });
  session.dispatch({ type: 'INITIAL_TAIL_APPLIED', epoch, generation: '1', revision: head });
  session.dispatch({ type: 'AUTHORITATIVE_HEAD', epoch, generation: '1', revision: head });
  session.dispatch({ type: 'RETAIL_APPLIED', epoch, generation: '1', revision: head });
  assert.equal(session.getSnapshot().phase, 'active');
}

// The UI stays hidden unless a runtime explicitly enables the V1 gate.
const elements = createElements();
let resolveStart;
let startCount = 0;
const startPromise = new Promise(resolve => { resolveStart = resolve; });
const localSession = createSession({ role: 'owner' });
const ui = createUi({ elements, body: fakeDocument.body });
ui.configure({
  enabled: true,
  session: localSession,
  commands: {
    start: async () => {
      startCount += 1;
      await startPromise;
    },
  },
});
assert.equal(elements.panel.hidden, false);
assert.equal(elements.start.hidden, false);
assert.equal(elements.drawLock.hidden, true);
const firstStart = elements.start.click();
const secondStart = elements.start.click();
assert.equal(startCount, 1);
assert.equal(await secondStart, false);
assert.equal(elements.start.disabled, true);
resolveStart();
assert.equal(await firstStart, true);
assert.equal(elements.start.disabled, false);

// Active owner can issue invites, but permanent sharing has no end action.
const ownerSession = createSession({ role: 'owner' });
activate(ownerSession);
let copied = '';
const ownerElements = createElements();
const ownerUi = createUi({
  elements: ownerElements,
  body: fakeDocument.body,
  navigatorRef: { clipboard: { writeText: async value => { copied = value; } } },
});
ownerUi.configure({
  enabled: true,
  session: ownerSession,
  commands: {
    createInviteLink: async () => `https://example.test/pixiedraw/?pixisync_invite=${'a'.repeat(64)}`,
    createInviteCode: async () => 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA',
  },
  participants: [
    { id: 'owner', name: 'Owner', role: 'owner', connection: 'online' },
    { id: 'editor', name: 'Editor', role: 'editor', connection: 'online' },
  ],
});
assert.equal(ownerElements.copyInvite.hidden, false);
assert.equal(ownerElements.copyInviteCode.hidden, false);
assert.equal(ownerElements.participantCount.textContent, '2');
ownerUi.setExternalDrawLock(true, '別のタブで編集中です。閲覧専用です。');
assert.equal(ownerElements.drawLock.hidden, false);
assert.equal(ownerElements.drawLockLabel.textContent, '別のタブで編集中です。閲覧専用です。');
ownerUi.setExternalDrawLock(false);
assert.equal(ownerElements.drawLock.hidden, true);
await ownerElements.copyInvite.click();
assert.match(copied, /pixisync_invite=/);
await ownerElements.copyInviteCode.click();
assert.match(copied, /^AAAA-/);
assert.equal(ownerElements.accessCode.value, '');
assert.equal(ownerElements.accessCode.placeholder, '招待リンク / コード');

// Reconnecting is rendered from session state and immediately locks drawing.
ownerSession.dispatch({ type: 'SOCKET_OFFLINE', epoch: ownerSession.getSnapshot().epoch });
assert.equal(ownerElements.statusLabel.textContent, '再接続中');
assert.equal(ownerElements.drawLock.hidden, false);
assert.equal(ownerElements.canvasViewport.attributes.get('aria-disabled'), 'true');

// Participant sharing is permanent and exposes no leave action.
const participantSession = createSession({ role: 'participant' });
activate(participantSession, { role: 'participant' });
const participantElements = createElements();
const participantUi = createUi({ elements: participantElements, body: fakeDocument.body });
participantUi.configure({
  enabled: true,
  session: participantSession,
  commands: {},
});
assert.equal(participantElements.drawLock.hidden, true);

// The same input accepts an invite before joining and sends comments while active.
const inviteToken = 'b'.repeat(64);
let manualJoinToken = '';
let sentComment = '';
participantElements.accessCode.value = `https://example.test/pixiedraw/?pixisync_invite=${inviteToken}`;
participantUi.configure({
  enabled: true,
  session: participantSession,
  commands: {
    join: async token => { manualJoinToken = token; },
    sendComment: async text => {
      sentComment = text;
      return {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        senderClientId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        senderRole: 'editor',
        text,
        sentAt: '2026-07-30T15:00:00.000Z',
      };
    },
  },
});
// Active sessions cannot re-join, but the parser is exercised by the local UI below.
const manualSession = createSession({ role: 'participant' });
const manualElements = createElements();
const manualUi = createUi({ elements: manualElements, body: fakeDocument.body });
manualUi.configure({
  enabled: true,
  session: manualSession,
  commands: { join: async token => { manualJoinToken = token; } },
});
assert.equal(manualElements.joinCode.textContent, '参加');
manualElements.accessCode.value = `https://example.test/pixiedraw/?pixisync_invite=${inviteToken}`;
assert.equal(await manualElements.joinCode.click(), true);
assert.equal(manualJoinToken, inviteToken);
manualElements.accessCode.value = inviteToken.toUpperCase().match(/.{1,4}/g).join('-');
assert.equal(await manualElements.joinCode.click(), true);
assert.equal(manualJoinToken, inviteToken);

assert.equal(participantElements.joinCode.textContent, '送信');
assert.equal(participantElements.accessCode.placeholder, 'コメントを入力');
assert.equal(participantElements.accessCodeField.hidden, false);
participantElements.commentsTab.click();
assert.equal(participantElements.accessCodeField.hidden, false);
participantElements.accessCode.value = 'hello';
participantElements.accessCode.dispatch('input');
assert.equal(await participantElements.joinCode.click(), true);
assert.equal(sentComment, 'hello');
assert.equal(participantElements.accessCode.value, '');
assert.equal(participantElements.commentList.children.length, 1);
participantElements.participantsTab.click();
assert.equal(participantElements.accessCodeField.hidden, false);
participantUi.receiveComment({
  id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  senderClientId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  senderRole: 'owner',
  text: 'received',
  sentAt: '2026-07-30T15:01:00.000Z',
});
assert.equal(participantElements.commentList.children.length, 2);
assert.equal(participantElements.commentsTab.classList.contains('has-notification'), true);
manualUi.dispose();

// Raw invite tokens are removed from the URL before the join command executes.
const invitedSession = createSession({ role: 'participant' });
const inviteElements = createElements();
let replacedUrl = '';
let joinSawSanitizedUrl = false;
const inviteUi = createUi({
  elements: inviteElements,
  body: fakeDocument.body,
  locationRef: { href: `https://example.test/pixiedraw/?pixisync_invite=${inviteToken}&keep=1` },
  historyRef: {
    state: { preserved: true },
    replaceState: (_state, _title, url) => { replacedUrl = url; },
  },
});
inviteUi.configure({
  enabled: true,
  session: invitedSession,
  commands: {
    join: async token => {
      joinSawSanitizedUrl = !replacedUrl.includes('pixisync_invite');
      assert.equal(token, inviteToken);
    },
  },
});
assert.equal(await inviteUi.consumeInviteFromUrl(), true);
assert.equal(joinSawSanitizedUrl, true);
assert.equal(replacedUrl, '/pixiedraw/?keep=1');

ui.clear();
assert.equal(elements.panel.hidden, false);
assert.equal(elements.quickOpen.hidden, false);
assert.equal(elements.mobileTab.hidden, false);
assert.equal(elements.start.hidden, true);
assert.equal(elements.start.disabled, true);
assert.equal(elements.accessCodeField.hidden, false);
assert.equal(elements.accessCode.disabled, true);
assert.equal(elements.joinCode.hidden, false);
assert.equal(elements.joinCode.disabled, true);
assert.equal(elements.statusLabel.textContent, '未接続');
assert.equal(fakeDocument.body.dataset.pixisyncPhase, 'disabled');

// Production wiring regression: explicit markup and module must remain present.
const [html, app, style, sharedTabBar, startupWorkflow] = await Promise.all([
  readFile(new URL('../pixiedraw/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../pixiedraw/assets/js/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../pixiedraw/assets/css/style.css', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/shared-tab-bar.js', import.meta.url), 'utf8'),
  readFile(new URL('../pixiedraw/assets/js/modules/startup-workflow-utils.js', import.meta.url), 'utf8'),
]);
for (const id of [
  'pixisyncPanel',
  'pixisyncStart',
  'pixisyncCopyInvite',
  'pixisyncCopyInviteCode',
  'pixisyncAccessCode',
  'pixisyncJoinCode',
  'panelMulti',
  'mobilePanelMulti',
  'pixisyncQuickOpen',
  'pixisyncDrawLock',
]) assert.match(html, new RegExp(`id="${id}"`));
assert.doesNotMatch(html, /id="pixisyncLeave"|id="pixisyncArchive"/);
assert.match(html, /pixisync-minimal-ui-utils\.js/);
assert.doesNotMatch(html, /pixisyncStatusDetail|pixisyncCommentInput|pixisyncCommentSend/);
assert.doesNotMatch(html, /受け取ったリンクまたはコード|コメントは共同編集中/);
assert.ok(
  html.indexOf('id="pixisyncParticipantsTab"') < html.indexOf('id="pixisyncPanelTitle"'),
  'participant/comment tabs must be the first panel control',
);
assert.ok(
  html.indexOf('id="pixisyncCommentList"') < html.indexOf('id="pixisyncAccessCodeField"'),
  'the shared invite/comment input must stay below the viewport',
);
assert.match(app, /runtime\?\.uiEnabled === true/);
assert.match(app, /function setupPiXiSyncShareMode\(\)/);
assert.doesNotMatch(app, /PIXISYNC_INITIAL_GATE_TAP_COUNT|PIXISYNC_SHARE_START_UNLOCKED|pixisyncInitialGate/);
assert.match(app, /pixisyncMinimalUi\?\.consumeInviteFromUrl/);
assert.match(app, /resolveProjectBindingTarget:[\s\S]*?resolvePiXiSyncRecentProjectTarget/);
assert.match(app, /candidate\?\.id !== replacedProjectKey/);
assert.match(app, /String\(candidate\?\.pixisync\?\.roomId \|\| ''\)[\s\S]*?!== normalizedRoomId/);
assert.match(app, /collectPiXiSyncRecentProjectCleanupEntries[\s\S]*?removeAutosaveV2ProjectData\(removed\.id\)/);
assert.match(startupWorkflow, /const isPiXiSyncCard = Boolean\([\s\S]*?entry\.pixisync\.roomId/);
assert.match(startupWorkflow, /className = 'startup-workspace__project-share-badge'/);
assert.match(sharedTabBar, /id: 'pixisync', label: 'PiXiSYNC', selector: '#pixisyncQuickOpen'/);
assert.match(html, /aria-disabled="false"[^>]*id="pixisyncQuickOpen"/);
assert.match(html, /src="\.\.\/pixisync\.png\?v=20260731-pixisync-icon2"/);
assert.match(html, /aria-disabled="false"[^>]*id="mobileTabMulti"/);
assert.match(html, /id="mobileTabMulti"[\s\S]*?src="\.\.\/pixisync\.png\?v=20260731-pixisync-icon2"/);
assert.match(sharedTabBar, /id: 'pixisync',[\s\S]*?cloneIcon: true,[\s\S]*?iconSourceSelector: '#mobileTabMulti'/);
assert.doesNotMatch(style, /body:not\(\[data-pixisync-initial-gate='unlocked'\]\) #panelMulti/);

console.log('PiXiSYNC minimal UI tests passed');
