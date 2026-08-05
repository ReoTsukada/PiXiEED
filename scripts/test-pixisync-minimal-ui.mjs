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

class FakeDialog extends FakeElement {
  constructor(ownerDocument = null) {
    super(ownerDocument);
    this.open = false;
    this.returnValue = '';
    this.dataset.pixisyncResumeNoticeVersion = '20260803-v2';
  }

  show() {
    this.open = true;
  }

  showModal() {
    this.open = true;
  }

  close(returnValue = '') {
    this.returnValue = String(returnValue || '');
    this.open = false;
    this.dispatch('close');
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
  requestAnimationFrame: callback => callback(),
  confirm: () => true,
  alert: () => {},
};

const createSessionStorage = () => {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
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
    startConfirmDialog: new FakeDialog(),
    startConfirmCancel: new FakeElement(),
    startConfirmConfirm: new FakeElement(),
    resumeNoticeDialog: new FakeDialog(),
    resumeNoticeClose: new FakeElement(),
    copyInviteCode: new FakeElement(),
    localize: new FakeElement(),
    slotCard: new FakeElement(),
    slotSummary: new FakeElement(),
    buySlot: new FakeElement(),
    slotPurchaseDialog: new FakeDialog(),
    slotQuantity: new FakeElement(),
    slotTotal: new FakeElement(),
    slotPurchaseStatus: new FakeElement(),
    slotResolution: new FakeElement(),
    slotRetainGuide: new FakeElement(),
    slotRoomList: new FakeElement(fakeDocument),
    localizeUnselected: new FakeElement(),
    slotPurchaseNotice: new FakeElement(),
    slotPurchaseRefresh: new FakeElement(),
    slotPurchaseClose: new FakeElement(),
    slotPurchaseConfirm: new FakeElement(),
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

// The revival notice opens after startup only once for the current release.
const resumeNoticeElements = createElements();
const resumeNoticeStorage = createSessionStorage();
const resumeNoticeUi = createUi({
  elements: resumeNoticeElements,
  body: fakeDocument.body,
  localStorageRef: resumeNoticeStorage,
});
assert.equal(resumeNoticeUi.showResumeNoticeOnce(), true);
assert.equal(resumeNoticeElements.resumeNoticeDialog.open, true);
resumeNoticeElements.resumeNoticeClose.click();
assert.equal(resumeNoticeElements.resumeNoticeDialog.open, false);
assert.equal(resumeNoticeUi.showResumeNoticeOnce(), false);
resumeNoticeUi.dispose();

// Browsers without native <dialog>.show() still receive the notice via
// the alert fallback instead of silently losing the startup message.
let fallbackAlertMessage = '';
window.alert = message => { fallbackAlertMessage = String(message || ''); };
const fallbackNoticeElements = createElements();
fallbackNoticeElements.resumeNoticeDialog = new FakeElement();
const fallbackNoticeUi = createUi({
  elements: fallbackNoticeElements,
  body: fakeDocument.body,
  localStorageRef: createSessionStorage(),
});
assert.equal(fallbackNoticeUi.showResumeNoticeOnce(), true);
assert.match(fallbackAlertMessage, /シェアプロジェクト.*PiXiSYNC/);
fallbackNoticeUi.dispose();

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
await Promise.resolve();
assert.equal(elements.startConfirmDialog.open, false);
const secondStart = elements.start.click();
assert.equal(startCount, 1);
assert.equal(await secondStart, false);
assert.equal(elements.start.disabled, true);
resolveStart();
assert.equal(await firstStart, true);
assert.equal(elements.start.disabled, false);

// The database quota error is explained without exposing an internal RPC name.
const limitedElements = createElements();
const limitedUi = createUi({ elements: limitedElements, body: fakeDocument.body });
let localizedRoomIds = [];
limitedUi.configure({
  enabled: true,
  session: createSession({ role: 'owner' }),
  commands: {
    start: async () => {
      throw new Error('pixisync_owner_room_limit_reached');
    },
    getProjectSlotStatus: async () => ({
      includedSlots: 1,
      purchasedSlots: 0,
      allowedSlots: 1,
      openOwnedProjects: 18,
      availableSlots: 0,
      overLimitProjects: 17,
    }),
    listOwnedOpenRooms: async () => ([{
      roomId: '11111111-1111-4111-8111-111111111111',
      title: '共同制作A',
      memberCount: 3,
      localAvailable: true,
    }, {
      roomId: '22222222-2222-4222-8222-222222222222',
      title: '共同制作B',
      memberCount: 1,
      localAvailable: false,
    }]),
    localizeOwnedRooms: async roomIds => { localizedRoomIds = roomIds; },
  },
});
const limitedStart = limitedElements.start.click();
assert.equal(limitedElements.startConfirmDialog.open, false);
assert.equal(await limitedStart, false);
assert.equal(
  limitedElements.notice.textContent,
  'シェアプロジェクトの作成枠が上限に達しています。'
);
assert.equal(limitedElements.slotPurchaseDialog.open, true);
assert.equal(
  limitedElements.slotPurchaseNotice.textContent,
  '作成枠を追加すると、このプロジェクトをシェアできます。'
);
await Promise.resolve();
await Promise.resolve();
assert.equal(limitedElements.slotSummary.textContent, '利用中18件・17件整理が必要');
assert.equal(limitedElements.slotResolution.hidden, false);
assert.equal(limitedElements.slotRoomList.children.length, 2);
const retainedRoomCheckbox = limitedElements.slotRoomList.children[0].children[0];
retainedRoomCheckbox.checked = true;
retainedRoomCheckbox.dispatch('change');
assert.equal(limitedElements.localizeUnselected.disabled, false);
await limitedElements.localizeUnselected.click();
assert.deepEqual(localizedRoomIds, ['22222222-2222-4222-8222-222222222222']);
limitedUi.dispose();

// The slot purchase UI shows server-owned quota and redirects only to the returned Stripe URL.
const slotElements = createElements();
let assignedCheckoutUrl = '';
const slotUi = createUi({
  elements: slotElements,
  body: fakeDocument.body,
  locationRef: {
    href: 'https://example.test/pixiedraw/',
    assign: value => { assignedCheckoutUrl = value; },
  },
});
slotUi.configure({
  enabled: true,
  session: createSession({ role: 'owner' }),
  commands: {
    getProjectSlotStatus: async () => ({
      includedSlots: 1,
      purchasedSlots: 1,
      allowedSlots: 2,
      openOwnedProjects: 1,
      availableSlots: 1,
      overLimitProjects: 0,
    }),
    createProjectSlotCheckout: async quantity => {
      assert.equal(quantity, 3);
      return 'https://checkout.stripe.com/c/pay/test';
    },
  },
});
assert.equal(slotElements.buySlot.click(), true);
assert.equal(slotElements.slotPurchaseDialog.open, true);
await Promise.resolve();
await Promise.resolve();
assert.equal(slotElements.slotSummary.textContent, '利用中 1 / 2枠');
assert.match(slotElements.slotPurchaseStatus.textContent, /上限2枠/);
slotElements.slotQuantity.value = '3';
slotElements.slotQuantity.dispatch('change', { target: slotElements.slotQuantity });
assert.equal(slotElements.slotTotal.textContent, '合計300円');
assert.equal(slotElements.slotPurchaseConfirm.textContent, 'Stripeで300円を支払う');
assert.equal(await slotElements.slotPurchaseConfirm.click(), true);
assert.equal(assignedCheckoutUrl, 'https://checkout.stripe.com/c/pay/test');
slotUi.dispose();

// Returning from Stripe reconciles the authenticated purchase and removes checkout parameters.
const returnElements = createElements();
const returnLocation = { href: 'https://example.test/pixiedraw/' };
let returnUrl = '';
let reconciledSessionId = '';
const returnUi = createUi({
  elements: returnElements,
  body: fakeDocument.body,
  locationRef: returnLocation,
  historyRef: { state: null, replaceState: (_state, _title, value) => { returnUrl = value; } },
});
returnUi.configure({
  enabled: true,
  session: createSession({ role: 'owner' }),
  commands: {
    getProjectSlotStatus: async () => ({
      includedSlots: 1, purchasedSlots: 0, allowedSlots: 1, openOwnedProjects: 1, availableSlots: 0, overLimitProjects: 0,
    }),
    reconcileProjectSlotPurchase: async sessionId => {
      reconciledSessionId = sessionId;
      return { includedSlots: 1, purchasedSlots: 1, allowedSlots: 2, openOwnedProjects: 1, availableSlots: 1, overLimitProjects: 0 };
    },
  },
});
returnLocation.href = 'https://example.test/pixiedraw/?pixisync_slot_purchase=success&session_id=cs_test_slot_123&keep=1';
assert.equal(await returnUi.consumeSlotPurchaseReturn(), true);
assert.equal(reconciledSessionId, 'cs_test_slot_123');
assert.equal(returnUrl, '/pixiedraw/?keep=1');
assert.equal(returnElements.slotSummary.textContent, '利用中 1 / 2枠');
assert.match(returnElements.slotPurchaseNotice.textContent, /1枠追加しました/);
returnUi.dispose();

// Active owner copies a participant code, but permanent sharing has no end action.
const ownerSession = createSession({ role: 'owner' });
activate(ownerSession);
let copied = '';
let localized = false;
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
    createInviteCode: async () => 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA',
    localize: async () => { localized = true; },
  },
  participants: [
    { id: 'owner', name: 'Owner', role: 'owner', connection: 'online' },
    { id: 'editor', name: 'Editor', role: 'editor', connection: 'online' },
  ],
});
assert.equal(ownerElements.copyInviteCode.hidden, false);
assert.equal(ownerElements.localize.hidden, false);
assert.equal(ownerElements.participantCount.textContent, '2');
ownerUi.setExternalDrawLock(true, '別のタブで編集中です。閲覧専用です。');
assert.equal(ownerElements.drawLock.hidden, false);
assert.equal(ownerElements.drawLockLabel.textContent, '別のタブで編集中です。閲覧専用です。');
ownerUi.setExternalDrawLock(false);
assert.equal(ownerElements.drawLock.hidden, true);
await ownerElements.copyInviteCode.click();
assert.match(copied, /^AAAA-/);
assert.equal(await ownerElements.localize.click(), true);
assert.equal(localized, true);
assert.equal(ownerElements.accessCode.value, '');
assert.equal(ownerElements.accessCode.placeholder, '参加者コード');

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
participantElements.accessCode.value = inviteToken.toUpperCase().match(/.{1,4}/g).join('-');
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
manualElements.accessCode.value = inviteToken.toUpperCase().match(/.{1,4}/g).join('-');
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

// Logged-out code recipients keep the code across account navigation and retry it after login.
const pendingSessionStorage = createSessionStorage();
const loggedOutInviteElements = createElements();
const loggedOutInviteUi = createUi({
  elements: loggedOutInviteElements,
  body: fakeDocument.body,
  sessionStorageRef: pendingSessionStorage,
});
loggedOutInviteElements.accessCode.value = inviteToken.toUpperCase().match(/.{1,4}/g).join('-');
loggedOutInviteUi.configure({
  enabled: true,
  session: createSession({ role: 'participant' }),
  commands: {
    join: async () => { throw new Error('PiXiSYNC runtime: authentication-required'); },
  },
});
assert.equal(await loggedOutInviteElements.joinCode.click(), false);
assert.equal(pendingSessionStorage.getItem('pixiedraw:pixisync:v1:pending-invite'), inviteToken);
assert.equal(loggedOutInviteUi.hasPendingInvite(), true);

let resumedToken = '';
const resumedInviteUi = createUi({
  elements: createElements(),
  body: fakeDocument.body,
  sessionStorageRef: pendingSessionStorage,
});
resumedInviteUi.configure({
  enabled: true,
  session: createSession({ role: 'participant' }),
  commands: { join: async token => { resumedToken = token; } },
});
assert.equal(resumedInviteUi.hasPendingInvite(), true);
assert.equal(await resumedInviteUi.consumePendingInvite(), true);
assert.equal(resumedToken, inviteToken);
assert.equal(resumedInviteUi.hasPendingInvite(), false);

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
const [html, app, style, sharedTabBar, startupWorkflow, staticContent] = await Promise.all([
  readFile(new URL('../pixiedraw/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../pixiedraw/assets/js/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../pixiedraw/assets/css/style.css', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/shared-tab-bar.js', import.meta.url), 'utf8'),
  readFile(new URL('../pixiedraw/assets/js/modules/startup-workflow-utils.js', import.meta.url), 'utf8'),
  readFile(new URL('../pixiedraw/assets/js/modules/static-content.js', import.meta.url), 'utf8'),
]);
for (const id of [
  'pixisyncPanel',
  'pixisyncStart',
  'pixisyncStartConfirmDialog',
  'pixisyncStartConfirmCancel',
  'pixisyncStartConfirmConfirm',
  'pixisyncResumeNoticeDialog',
  'pixisyncResumeNoticeClose',
  'pixisyncCopyInviteCode',
  'pixisyncSlotCard',
  'pixisyncSlotSummary',
  'pixisyncBuySlot',
  'pixisyncSlotPurchaseDialog',
  'pixisyncSlotPurchaseStatus',
  'pixisyncSlotRetainGuide',
  'pixisyncLocalizeUnselected',
  'pixisyncSlotPurchaseNotice',
  'pixisyncSlotPurchaseRefresh',
  'pixisyncSlotPurchaseClose',
  'pixisyncSlotPurchaseConfirm',
  'pixisyncLocalize',
  'pixisyncSlotResolution',
  'pixisyncSlotRoomList',
  'pixisyncAccessCode',
  'pixisyncJoinCode',
  'panelMulti',
  'mobilePanelMulti',
  'pixisyncQuickOpen',
  'pixisyncDrawLock',
]) assert.match(html, new RegExp(`id="${id}"`));
assert.doesNotMatch(html, /id="pixisyncLeave"|id="pixisyncArchive"|id="pixisyncCopyInvite"/);
assert.match(html, /class="multi-project-key-row pixisync-input-row"[\s\S]*id="pixisyncCopyInviteCode"[\s\S]*id="pixisyncAccessCode"[\s\S]*id="pixisyncJoinCode"/);
assert.doesNotMatch(html, /pixisync-header-actions[\s\S]*id="pixisyncCopyInviteCode"/);
assert.match(html, /pixisync-minimal-ui-utils\.js\?v=20260803-pixisync-bulk-localize1/);
assert.match(html, /<dialog[^>]*id="pixisyncResumeNoticeDialog"[^>]*data-pixisync-resume-notice-version="20260803-v2"|<dialog[^>]*data-pixisync-resume-notice-version="20260803-v2"[^>]*id="pixisyncResumeNoticeDialog"/);
assert.match(html, /pixisync-runtime-adapter-utils\.js\?v=20260805-pixisync-localize-layout2/);
assert.match(html, /style\.css\?v=20260805-pixisync-localize-layout2/);
assert.match(style, /\.pixisync-input-row \{[\s\S]*?grid-template-columns: 34px minmax\(0, 1fr\) 64px !important;/);
assert.match(style, /\.pixisync-input-row:has\(#pixisyncCopyInviteCode\[hidden\]\) \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 64px !important;/);
assert.match(html, /static-content\.js\?v=20260803-pixisync-code-only1/);
assert.match(html, /app\.js\?v=20260805-pixisync-delete-localize-fix1/);
assert.match(html, /PiXiSYNCが復活しました/);
assert.match(html, /シェアプロジェクトが復活しました/);
assert.match(html, /シェアプロジェクトを楽しんでください/);
assert.match(app, /startConfirmDialog: dom\.controls\.pixisyncStartConfirmDialog/);
assert.match(app, /localizeUnselected: dom\.controls\.pixisyncLocalizeUnselected/);
assert.match(app, /pixisyncMinimalUi\?\.showResumeNoticeOnce/);
assert.match(staticContent, /id: 'pixisync-share-project'/);
assert.match(staticContent, /id: '2026-08-03-pixisync-return'/);
assert.match(staticContent, /シェアプロジェクト（PiXiSYNC）が復活しました/);
new Function(staticContent)();
const staticContentApi = window.PiXiEEDrawModules.staticContent.createStaticContent();
const pixisyncHelp = staticContentApi.HELP_GUIDE_ITEMS.find(entry => entry.id === 'pixisync-share-project');
const pixisyncUpdate = staticContentApi.BUILTIN_UPDATE_HISTORY_ENTRIES.find(entry => entry.id === '2026-08-03-pixisync-return');
assert.ok(pixisyncHelp?.points?.ja?.some(point => point.includes('1枠100円')));
assert.ok(pixisyncHelp?.points?.ja?.some(point => point.includes('参加コード')));
assert.ok(pixisyncHelp?.points?.ja?.some(point => point.includes('ローカル専用')));
assert.ok(pixisyncHelp?.points?.ja?.some(point => point.includes('参加者全員のローカル保存')));
assert.ok(pixisyncUpdate?.details?.some(point => point.includes('シェアプロジェクトを楽しんでください')));
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
assert.match(app, /pixisyncMinimalUi\.consumePendingInvite/);
assert.match(app, /pixisyncMinimalUi\?\.hasPendingInvite\?\.\(\)/);
assert.match(app, /pixieed:account-authenticated/);
assert.match(app, /function ensurePiXiSyncPendingInviteProject/);
assert.match(app, /pendingInviteToken: inviteToken/);
assert.doesNotMatch(app, /pixisync_invite/);
assert.match(app, /resolveProjectBindingTarget:[\s\S]*?resolvePiXiSyncRecentProjectTarget/);
assert.match(app, /candidate\?\.id !== replacedProjectKey/);
assert.match(app, /String\(candidate\?\.pixisync\?\.roomId \|\| ''\)[\s\S]*?!== normalizedRoomId/);
assert.match(app, /collectPiXiSyncRecentProjectCleanupEntries[\s\S]*?removeAutosaveV2ProjectData\(removed\.id\)/);
assert.match(startupWorkflow, /const isPiXiSyncCard = Boolean\([\s\S]*?entry\.pixisync\.roomId/);
assert.match(startupWorkflow, /const isPendingPiXiSyncCard = Boolean\([\s\S]*?pendingInviteToken/);
assert.match(startupWorkflow, /className = 'startup-workspace__project-share-badge'/);
assert.match(sharedTabBar, /id: 'pixisync', label: 'PiXiSYNC', selector: '#pixisyncQuickOpen'/);
assert.match(html, /aria-disabled="false"[^>]*id="pixisyncQuickOpen"/);
assert.match(html, /src="\.\.\/pixisync\.png\?v=20260731-pixisync-icon2"/);
assert.match(html, /aria-disabled="false"[^>]*id="mobileTabMulti"/);
assert.match(html, /id="mobileTabMulti"[\s\S]*?src="\.\.\/pixisync\.png\?v=20260731-pixisync-icon2"/);
assert.match(sharedTabBar, /id: 'pixisync',[\s\S]*?cloneIcon: true,[\s\S]*?iconSourceSelector: '#mobileTabMulti'/);
assert.doesNotMatch(style, /body:not\(\[data-pixisync-initial-gate='unlocked'\]\) #panelMulti/);

console.log('PiXiSYNC minimal UI tests passed');
