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
  constructor(name = '') { this.name = name; this.listeners = new Map(); this.children = []; this.attributes = {}; this.hidden = false; this.disabled = false; this.classList = { add() {} }; this.isConnected = false; }
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
passConfig.rewardedAdUnitPath = '';
passConfig.passHours = 1;
const pass = await import('../../js/pixieed-pass.mjs?pass-accumulation-tests');

test('rewards add one hour to the current expiry and allow an explicit extension while active', async () => {
  let now = 1_800_000_000_000; const originalNow = Date.now; Date.now = () => now;
  const focusReturn = new FakeElement('trigger'); focusReturn.isConnected = true; fakeDocument.activeElement = focusReturn;
  try {
    assert.equal(pass.PASS_HOURS, 1);
    const first = pass.requestPass({ extend: true });
    const firstModal = body.children.at(-1); const firstGo = firstModal.querySelector('.px-pass-go');
    assert.match(firstModal.querySelector('p').innerHTML, /1時間/);
    await firstGo.fire('click')[0]; assert.equal(await first, true);
    assert.equal(JSON.parse(values.get('pixieed:pass:v1')).until, now + 3_600_000);
    assert.equal(fakeDocument.activeElement, focusReturn, 'closing the sheet restores focus');
    assert.equal(await pass.requestPass(), true, 'existing perk requests stay immediate while active');

    const second = pass.requestPass({ extend: true });
    const secondModal = body.children.at(-1);
    assert.match(secondModal.querySelector('p').innerHTML, /サイト共通の拡張を使える時間に1時間追加/);
    assert.deepEqual(secondModal.querySelector('.px-pass-perks').children.map(({ textContent }) => textContent), [
      'ドット絵カメラ：GIFを10秒・なめらかに', 'ドットで音楽：広いキャンバスで作曲', 'ドットで音楽：追加の音色'
    ]);
    assert.match(secondModal.querySelector('.px-pass-note').textContent, /ページを閉じても進みます。制作中の内容は残ります。/);
    await secondModal.querySelector('.px-pass-go').fire('click')[0]; assert.equal(await second, true);
    assert.equal(JSON.parse(values.get('pixieed:pass:v1')).until, now + 7_200_000);

    const beforeCancel = values.get('pixieed:pass:v1');
    const canceled = pass.requestPass({ extend: true });
    body.children.at(-1).querySelector('.px-pass-no').fire('click');
    assert.equal(await canceled, false); assert.equal(values.get('pixieed:pass:v1'), beforeCancel);
  } finally { Date.now = originalNow; }
});

test('corrupt storage is safe and a storage event replaces stale in-memory fallback data', () => {
  values.set('pixieed:pass:v1', '{broken json');
  assert.doesNotThrow(() => pass.hasPass()); assert.equal(pass.hasPass(), false);
  storageReadable = true; storageWritable = false;
  const originalNow = Date.now; const now = 1_800_100_000_000; Date.now = () => now;
  try {
    const grant = pass.requestPass({ extend: true });
    body.children.at(-1).querySelector('.px-pass-go').fire('click')[0];
    return grant.then(() => {
      assert.equal(pass.passRemainingMs(now), 3_600_000);
      storageReadable = true; storageWritable = true;
      values.set('pixieed:pass:v1', JSON.stringify({ until: now + 120_000 }));
      windowEvents.get('storage')({ key: 'pixieed:pass:v1' });
      assert.equal(pass.passRemainingMs(now), 120_000, 'storage updates are not hidden by a longer in-memory value');
    }).finally(() => { Date.now = originalNow; storageReadable = true; storageWritable = true; });
  } finally { /* async cleanup runs in the returned promise */ }
});

test('expiry, pageshow and visibility restoration notify consumers with current time remaining', () => {
  let now = 1_800_200_000_000; const originalNow = Date.now; Date.now = () => now;
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

test('the extension sheet traps tab focus and formats the remaining time for shared headers', () => {
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

test('an ad script that never responds times out, is removed, and permits a retry', async () => {
  const first = pass.showRewardedAd('/test/rewarded');
  const script = head.children.at(-1);
  assert.equal(script.src, 'https://securepubads.g.doubleclick.net/tag/js/gpt.js');
  const timeout = [...timers.values()].find((timer) => timer.delay === 10000);
  assert.ok(timeout);
  timeout.callback();
  await assert.rejects(first, /ad script timeout/);
  assert.equal(script.isConnected, false);
  const retry = pass.showRewardedAd('/test/rewarded');
  const retryScript = head.children.at(-1);
  assert.notEqual(retryScript, script);
  retryScript.onerror();
  await assert.rejects(retry, /ad script/);
  assert.equal(retryScript.isConnected, false);
});
