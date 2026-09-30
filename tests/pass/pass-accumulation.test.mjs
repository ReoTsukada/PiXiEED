import test from 'node:test';
import assert from 'node:assert/strict';
import { passConfig } from '../../data/site-config.js?rev=20260928-pass-1h-1';

const values = new Map(); let storageReadable = true; let storageWritable = true;
globalThis.localStorage = {
  getItem(key) { if (!storageReadable) throw new Error('blocked'); return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { if (!storageWritable) throw new Error('blocked'); values.set(key, String(value)); },
  removeItem(key) { if (!storageWritable) throw new Error('blocked'); values.delete(key); }
};

class FakeElement {
  constructor(name = '') { this.name = name; this.listeners = new Map(); this.children = []; this.attributes = {}; this.style = {}; this.hidden = false; this.disabled = false; this.classList = { add() {} }; this.isConnected = false; }
  addEventListener(name, callback) { const list = this.listeners.get(name) || []; list.push(callback); this.listeners.set(name, list); }
  fire(name, event = {}) { return (this.listeners.get(name) || []).map((callback) => callback({ target: this, preventDefault() {}, ...event })); }
  focus() { fakeDocument.activeElement = this; this.focusCount = (this.focusCount || 0) + 1; }
  setAttribute(name, value) { this.attributes[name] = value; }
  appendChild(child) { this.children.push(child); child.isConnected = true; return child; }
  remove() { this.isConnected = false; }
  contains(element) { return this.children.includes(element) || element === this; }
  querySelector(selector) { return this.selectors?.get(selector) || null; }
  querySelectorAll() { return this.focusables || []; }
}

const windowEvents = new Map(); const documentEvents = new Map(); const timers = new Map(); let timerId = 0;
const fakeWindow = {
  addEventListener(name, callback) { windowEvents.set(name, callback); },
  clearTimeout(id) { timers.delete(id); },
  setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
};
const styleElement = new FakeElement('style');
const head = new FakeElement('head');
const body = new FakeElement('body');
const fakeDocument = {
  readyState: 'complete', visibilityState: 'visible', activeElement: null, head, body,
  addEventListener(name, callback) { documentEvents.set(name, callback); },
  removeEventListener(name) { documentEvents.delete(name); },
  getElementById(id) { return id === 'px-pass-style' && styleElement.isConnected ? styleElement : null; },
  querySelector() { return null; },
  createElement(name) {
    const element = new FakeElement(name);
    if (name === 'div') {
      const text = new FakeElement('p');
      const perks = new FakeElement('ul'); const note = new FakeElement('small');
      const testBox = new FakeElement('test');
      const go = new FakeElement('go'); const no = new FakeElement('no');
      element.selectors = new Map([['p', text], ['.px-pass-perks', perks], ['.px-pass-note', note], ['.px-pass-test', testBox], ['.px-pass-go', go], ['.px-pass-no', no]]);
      element.focusables = [go, no];
      element.children = [text, testBox, go, no];
    }
    return element;
  },
  querySelectorAll() { return []; }
};
body.appendChild = (element) => { body.children.push(element); element.isConnected = true; return element; };
globalThis.window = fakeWindow;
globalThis.document = fakeDocument;
passConfig.passHours = 1;
const pass = await import('../../js/pixieed-pass.mjs?pass-accumulation-tests');
const opened = [];
fakeWindow.open = (url, target) => { opened.push([url, target]); return {}; };
globalThis.location = { hostname: 'pixieed.jp', pathname: '/draw/', search: '?x=1', hash: '' };
function configureRewardedGpt() {
  const events = new Map(); const slot = { addService() {} };
  const pubads = {
    addEventListener(name, callback) { events.set(name, callback); },
    removeEventListener(name, callback) { if (events.get(name) === callback) events.delete(name); }
  };
  globalThis.googletag = {
    apiReady: true, enums: { OutOfPageFormat: { REWARDED: 'REWARDED' } },
    pubads: () => pubads, defineOutOfPageSlot: () => slot,
    enableServices() {}, display() {}, destroySlots(slots) { assert.deepEqual(slots, [slot]); }
  };
  return { events, slot };
}

test('the daily free hour is offered first; while it runs the header shows the time left and nothing stacks', async () => {
  values.clear(); opened.length = 0;
  let now = 1_800_000_000_000; const originalNow = Date.now; Date.now = () => now;
  try {
    const free = pass.requestPass();
    const freeModal = body.children.at(-1);
    assert.match(freeModal.querySelector('p').textContent, /本日の無料分として/);
    assert.equal(freeModal.querySelector('.px-pass-go').textContent, '無料で1時間使う');
    await freeModal.querySelector('.px-pass-go').fire('click')[0];
    assert.equal(await free, true);
    assert.equal(opened.length, 0, 'claiming the daily pass does not open the ad page');
    assert.equal(JSON.parse(values.get('pixieed:pass:v1')).until, now + 3_600_000);
    assert.equal(values.get('pixieed:pass:no-ad-day:v1'), pass.localDay(now));
    assert.equal(await pass.requestPass(), true, 'perk requests stay immediate while active');

    now += 60_000;
    const header = pass.requestPass({ extend: true });
    const modal = body.children.at(-1);
    assert.match(modal.querySelector('p').textContent, /あと0:59使えます/);
    assert.equal(modal.querySelector('.px-pass-go').textContent, 'OK');
    assert.equal(modal.querySelector('.px-pass-no').hidden, true);
    await modal.querySelector('.px-pass-go').fire('click')[0];
    assert.equal(await header, true);
    assert.equal(opened.length, 0);
    assert.equal(await pass.grantFromAd(), false, 'an ad while the pass runs adds nothing');
    assert.equal(JSON.parse(values.get('pixieed:pass:v1')).until, now - 60_000 + 3_600_000);
  } finally { Date.now = originalNow; }
});

test('after the free hour, the rewarded grant event gives the pass in the same sheet', async () => {
  values.clear(); opened.length = 0;
  let now = 1_800_100_000_000; const originalNow = Date.now; Date.now = () => now;
  try {
    const request = pass.requestPass();
    const modal = body.children.at(-1); const go = modal.querySelector('.px-pass-go');
    assert.equal(go.textContent, '無料で1時間使う');
    values.set('pixieed:pass:no-ad-at:v1', String(now));
    values.set('pixieed:pass:no-ad-day:v1', pass.localDay(now));
    await go.fire('click')[0];
    assert.equal(opened.length, 0, 'a lost free claim never opens the ad page on that click');
    assert.match(modal.querySelector('p').textContent, /今日の無料分は受け取り済み/);
    assert.equal(go.textContent, '広告を見る');
    const { events, slot } = configureRewardedGpt();
    const click = go.fire('click')[0];
    await Promise.resolve();
    events.get('rewardedSlotReady')({ slot, makeRewardedVisible() {} });
    assert.equal(pass.hasPass(), false, 'slot readiness alone never grants the pass');
    events.get('rewardedSlotGranted')({ slot });
    assert.equal(pass.hasPass(), false, 'grant is recorded before slot close, then applied once the ad is cleaned up');
    events.get('rewardedSlotClosed')({ slot });
    await click;
    assert.equal(await request, true);
    assert.equal(pass.hasPass(), true);
    assert.equal(opened.length, 0, 'the page stays in place');
    assert.equal(modal.style.visibility, '', 'the sheet is restored after the ad closes');
    assert.equal(events.size, 0, 'slot event listeners are removed after grant');
  } finally { Date.now = originalNow; }
});

test('no-fill restores the sheet for retry and does not grant access', async () => {
  values.clear(); opened.length = 0;
  const now = 1_800_150_000_000;
  values.set('pixieed:pass:no-ad-at:v1', String(now));
  values.set('pixieed:pass:no-ad-day:v1', pass.localDay(now));
  const originalNow = Date.now; Date.now = () => now;
  try {
    const request = pass.requestPass(); const modal = body.children.at(-1); const go = modal.querySelector('.px-pass-go');
    const { events, slot } = configureRewardedGpt();
    const click = go.fire('click')[0];
    await Promise.resolve();
    events.get('slotRenderEnded')({ slot, isEmpty: true });
    await click;
    assert.equal(pass.hasPass(), false);
    assert.equal(go.disabled, false); assert.equal(modal.querySelector('.px-pass-no').disabled, false);
    assert.match(modal.querySelector('p').textContent, /広告が見つかりませんでした/);
    assert.equal(go.textContent, 'もう一度試す');
    assert.equal(opened.length, 0);
    modal.querySelector('.px-pass-no').fire('click');
    assert.equal(await request, false);
  } finally { Date.now = originalNow; delete globalThis.googletag; }
});

test('closing the rewarded slot without a grant restores the sheet and grants nothing', async () => {
  values.clear();
  const now = 1_800_175_000_000;
  values.set('pixieed:pass:no-ad-at:v1', String(now));
  values.set('pixieed:pass:no-ad-day:v1', pass.localDay(now));
  const originalNow = Date.now; Date.now = () => now;
  try {
    const request = pass.requestPass(); const modal = body.children.at(-1); const go = modal.querySelector('.px-pass-go');
    const { events, slot } = configureRewardedGpt();
    const click = go.fire('click')[0]; await Promise.resolve();
    events.get('rewardedSlotReady')({ slot, makeRewardedVisible() {} });
    assert.equal(modal.style.visibility, 'hidden');
    events.get('rewardedSlotClosed')({ slot });
    await click;
    assert.equal(pass.hasPass(), false);
    assert.equal(modal.style.visibility, '');
    assert.match(modal.querySelector('p').textContent, /最後まで再生されませんでした/);
    modal.querySelector('.px-pass-no').fire('click');
    assert.equal(await request, false);
  } finally { Date.now = originalNow; delete globalThis.googletag; }
});

test('the ad hour starts from the moment it is granted and never stacks', async () => {
  values.clear();
  let now = 1_800_200_000_000; const originalNow = Date.now; Date.now = () => now;
  try {
    assert.equal(pass.PASS_HOURS, 1);
    assert.equal(await pass.grantFromAd(), true);
    assert.equal(JSON.parse(values.get('pixieed:pass:v1')).until, now + 3_600_000);
    assert.equal(await pass.grantFromAd(), false);
    now += 3_600_001;
    assert.equal(await pass.grantFromAd(), true);
    assert.equal(JSON.parse(values.get('pixieed:pass:v1')).until, now + 3_600_000);
    now += 3_600_001;
    const canceled = pass.requestPass({ extend: true });
    const sheet = body.children.at(-1);
    assert.match(sheet.querySelector('.px-pass-note').textContent, /ページを閉じても進みます。制作中の内容は残ります。/);
    assert.equal(new Set(sheet.querySelector('.px-pass-perks').children.map(({ textContent }) => textContent)).size, sheet.querySelector('.px-pass-perks').children.length);
    sheet.querySelector('.px-pass-no').fire('click');
    assert.equal(await canceled, false);
  } finally { Date.now = originalNow; }
});

test('public requests use rewarded ads and localhost uses the stand-in', () => {
  assert.equal(pass.adMode({ hostname: 'pixieed.jp', search: '?ads=test' }), 'rewarded');
  assert.equal(pass.adMode({ hostname: 'localhost', search: '' }), 'test');
});

test('corrupt storage is safe and a storage event replaces stale in-memory fallback data', async () => {
  values.clear();
  values.set('pixieed:pass:v1', '{broken json');
  assert.doesNotThrow(() => pass.hasPass()); assert.equal(pass.hasPass(), false);
  storageReadable = true; storageWritable = false;
  const originalNow = Date.now; const now = 1_800_300_000_000; Date.now = () => now;
  try {
    const grant = pass.requestPass({ extend: true });
    await body.children.at(-1).querySelector('.px-pass-go').fire('click')[0];
    await grant;
    assert.equal(pass.passRemainingMs(now), 3_600_000);
    storageReadable = true; storageWritable = true;
    values.set('pixieed:pass:v1', JSON.stringify({ until: now + 120_000 }));
    windowEvents.get('storage')({ key: 'pixieed:pass:v1' });
    assert.equal(pass.passRemainingMs(now), 120_000, 'storage updates are not hidden by a longer in-memory value');
  } finally { Date.now = originalNow; storageReadable = true; storageWritable = true; }
});

test('expiry, pageshow and visibility restoration notify consumers with current time remaining', () => {
  let now = 1_800_400_000_000; const originalNow = Date.now; Date.now = () => now;
  const changes = []; const unsubscribe = pass.onPassChange((state) => changes.push(state));
  try {
    values.set('pixieed:pass:v1', JSON.stringify({ until: now + 1000 }));
    windowEvents.get('storage')({ key: 'pixieed:pass:v1' });
    assert.equal(changes.at(-1).active, true);
    const expiry = [...timers.entries()].find(([, value]) => value.delay <= 1050);
    now += 1050; expiry?.[1].callback();
    assert.equal(changes.at(-1).active, false);
    windowEvents.get('pageshow')();
    fakeDocument.visibilityState = 'visible'; documentEvents.get('visibilitychange')();
    assert.equal(changes.at(-1).active, false);
  } finally { unsubscribe(); Date.now = originalNow; }
});

test('the sheet traps tab focus and formats the remaining time for shared headers', () => {
  values.clear(); windowEvents.get('storage')({ key: 'pixieed:pass:v1' });
  const trigger = new FakeElement('header-button'); trigger.isConnected = true; fakeDocument.activeElement = trigger;
  const dialog = pass.requestPass({ extend: true }); const backdrop = body.children.at(-1);
  const keydown = documentEvents.get('keydown');
  let prevented = false; keydown({ key: 'Tab', shiftKey: true, preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(fakeDocument.activeElement, backdrop.querySelector('.px-pass-no'));
  backdrop.querySelector('.px-pass-no').fire('click');
  return dialog.then(() => {
    assert.equal(fakeDocument.activeElement, trigger);
    assert.equal(pass.formatPassRemaining(61_000), '0:02');
    assert.equal(pass.formatPassRemaining(Infinity), 'Pro');
  });
});
