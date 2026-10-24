import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { displayAdConfig } from '../../data/site-config.js?rev=20261008-map-detail-1';
import { addOfferwallEntryPolicy, OFFERWALL_ENTRY_LOADER_SCRIPT, OFFERWALL_ENTRY_POLICY_SCRIPT, OFFERWALL_ENTRY_POLICY_VERSION, OFFERWALL_TOOL_PATHS } from '../../scripts/offerwall-entry-policy.mjs';
import { maybeLoadOfferwallSDK, notifyToolEntryReady, subscribeToolEntry } from '../../js/tool-offerwall-entry.mjs';

const source = await readFile(new URL('../../js/adsense-offerwall-policy.js', import.meta.url), 'utf8');
const INTRO = ['/draw/', '/camera/', '/audio/'];
const SETUP = ['/spot-difference/', '/hidden-object/', '/jigsaw/', '/output/work/'];
const ALL = [...INTRO, ...SETUP];

function setup({ url = 'https://pixieed.jp/draw/', frame = false, enumValue = 3, historyState = null } = {}) {
  const parsed = new URL(url);
  const listeners = new Map();
  const document = {
    addEventListener(type, callback, capture) { listeners.set(type, { callback, capture }); },
    head: { append(node) { this.appended = [...(this.appended || []), node]; } },
    querySelector() { return null; },
    createElement() {
      const node = { dataset: {}, attributes: {}, addEventListener(type, callback) { (this.listeners ||= {})[type] = callback; }, set src(v) { this._src = v; }, get src() { return this._src; } };
      return node;
    },
  };
  const top = {};
  const googlefc = enumValue == null ? {} : { MessageTypeEnum: { OFFERWALL: enumValue } };
  const window = {
    top: frame ? top : null, self: {}, history: { state: historyState }, googlefc,
    location: { protocol: parsed.protocol, origin: parsed.origin, pathname: parsed.pathname, search: parsed.search, hash: parsed.hash },
    addEventListener(type, callback) { listeners.set(`window:${type}`, { callback }); },
  };
  if (!frame) window.top = window.self;
  const context = vm.createContext({ window, document });
  vm.runInContext(source, context);
  const invoke = () => {
    let args;
    window.googlefc.controlledMessagingFunction({ proceed: (...value) => { args = value; } });
    return args;
  };
  const event = (type, target, extra = {}) => listeners.get(type)?.callback({ type, target, ...extra });
  return { window, document, listeners, invoke, event };
}

function eligibleSetup(path = SETUP[0]) {
  const state = setup({ url: `https://pixieed.jp${path}` });
  assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.isEligible(), false);
  assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true }), true);
  return state;
}

test('the seven canonical tool entries are exact; intro pages begin eligible and setup pages require a fresh runtime signal', () => {
  assert.deepEqual(ALL, ['/draw/', '/camera/', '/audio/', '/spot-difference/', '/hidden-object/', '/jigsaw/', '/output/work/']);
  assert.deepEqual(OFFERWALL_TOOL_PATHS, ALL);
  for (const path of INTRO) assert.equal(setup({ url: `https://pixieed.jp${path}` }).invoke()[0], true);
  for (const path of SETUP) {
    const state = setup({ url: `https://pixieed.jp${path}` });
    assert.equal(state.invoke()[0], false, path);
    assert.deepEqual(Array.from(state.invoke()[1]), [3], path);
    assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true }), true, path);
    assert.equal(state.invoke()[0], true, path);
  }
});

test('query, fragment, noncanonical origin, iframe, and restored workspace are denied', () => {
  const cases = [
    { url: 'https://pixieed.jp/draw/?workspace=1' }, { url: 'https://pixieed.jp/jigsaw/?social=1' },
    { url: 'https://pixieed.jp/output/work/?id=local' }, { url: 'https://pixieed.jp/draw/#section' },
    { url: 'https://example.org/draw/' }, { url: 'http://pixieed.jp/draw/' },
    { url: 'https://www.pixieed.jp/draw/' }, { url: 'https://pixieed.jp/tools/' },
    { url: 'https://pixieed.jp/jigsaw/', historyState: { pixieedWorkspace: true } },
  ];
  for (const config of cases) {
    const state = setup(config);
    assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.isEligible(), false, JSON.stringify(config));
    assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true }), false, JSON.stringify(config));
    assert.equal(state.invoke()[0], false, JSON.stringify(config));
  }
  const sentinel = () => {};
  const frameWindow = { top: {}, self: {}, googlefc: { controlledMessagingFunction: sentinel }, location: {} };
  vm.runInContext(source, vm.createContext({ window: frameWindow, document: { addEventListener() { throw Error('iframe listener'); } } }));
  assert.equal(frameWindow.googlefc.controlledMessagingFunction, sentinel);
});

test('first work interaction retires before handlers, and later fresh signals cannot rearm', () => {
  const intro = setup();
  const start = intro.listeners.get('click');
  assert.equal(start.capture, true);
  start.callback({ type: 'click', target: { closest(selector) { assert.equal(selector, '[data-embed-start]'); return {}; } } });
  assert.equal(intro.window.__PIXIEED_OFFERWALL_ENTRY__.isEligible(), false);
  assert.equal(intro.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true }), false);

  const setupPage = eligibleSetup('/jigsaw/');
  for (const type of ['pointerdown', 'click', 'keydown', 'beforeinput', 'input', 'change', 'paste', 'drop']) {
    assert.equal(setupPage.listeners.get(type).capture, true);
  }
  setupPage.event('keydown', { closest(selector) { return selector.includes('button') ? {} : null; } }, { key: 'Tab' });
  assert.equal(setupPage.window.__PIXIEED_OFFERWALL_ENTRY__.isEligible(), true, 'plain Tab is not work');
  setupPage.event('pointerdown', { closest(selector) { return selector === 'main' ? null : {}; } });
  assert.equal(setupPage.window.__PIXIEED_OFFERWALL_ENTRY__.isEligible(), false);
  assert.equal(setupPage.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true }), false);
});

test('setup readiness is fail-closed for absent, false, thrown, resumed, or retired state', () => {
  for (const options of [undefined, null, {}, { fresh: false }, { fresh: 0 }, { fresh: 'true' }]) {
    const state = setup({ url: `https://pixieed.jp${SETUP[1]}` });
    assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready(options), false);
    assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true }), false, 'failed readiness is one-way');
  }
  const state = setup({ url: `https://pixieed.jp${SETUP[2]}` });
  assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true }), true);
  state.window.history.state = { pixieedWorkspace: true };
  assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.isEligible(), false);
  state.window.__PIXIEED_OFFERWALL_ENTRY__.retire();
  state.window.history.state = null;
  assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true }), false);
});

test('unknown provider enum proceeds without holding CMP, while known ineligible state suppresses only Offerwall', () => {
  assert.deepEqual(setup({ enumValue: null }).invoke(), [true]);
  const state = setup({ url: `https://pixieed.jp${SETUP[3]}` });
  const result = state.invoke();
  assert.equal(result[0], false);
  assert.deepEqual(Array.from(result[1]), [3]);
  assert.deepEqual(Array.from(state.invoke()[1]), [3]);
});

test('subscribers receive state and can unsubscribe without controlling policy', () => {
  const state = setup({ url: `https://pixieed.jp${SETUP[0]}` });
  const seen = [];
  const unsubscribe = state.window.__PIXIEED_OFFERWALL_ENTRY__.subscribe((value) => seen.push(value));
  assert.equal(seen.at(-1).state, 'pending');
  const priorWindow = globalThis.window;
  globalThis.window = state.window;
  assert.equal(notifyToolEntryReady(true), true);
  const loaderEvents = [];
  const stopLoaderSubscription = subscribeToolEntry((value) => loaderEvents.push(value));
  assert.equal(loaderEvents.at(-1).eligible, true);
  stopLoaderSubscription();
  if (priorWindow === undefined) delete globalThis.window; else globalThis.window = priorWindow;
  assert.equal(seen.at(-1).eligible, true);
  unsubscribe();
  state.window.__PIXIEED_OFFERWALL_ENTRY__.retire();
  assert.equal(seen.at(-1).eligible, true);
});

test('loader never appends without explicit eligibility and shares one existing-provider SDK append', async () => {
  const disabled = setup({ url: `https://pixieed.jp${SETUP[0]}` });
  const denied = await maybeLoadOfferwallSDK({ window: disabled.window, document: disabled.document });
  assert.equal(denied, false);
  assert.equal(disabled.document.head.appended, undefined);

  const page = eligibleSetup(SETUP[1]);
  const first = maybeLoadOfferwallSDK({ window: page.window, document: page.document });
  const second = maybeLoadOfferwallSDK({ window: page.window, document: page.document });
  assert.equal(page.document.head.appended.length, 1);
  const node = page.document.head.appended[0];
  assert.equal(node.src, 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9801602250480253');
  assert.equal(node.src, `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${displayAdConfig.client}`);
  assert.equal(node.crossOrigin, 'anonymous');
  node.listeners.load();
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.equal(page.window.adsbygoogle, undefined, 'provider loading does not push ad units');
});

test('build helper upgrades policy version once and preserves unrelated CMP scripts', () => {
  assert.equal(OFFERWALL_ENTRY_POLICY_VERSION, '20261024-all-tools-offerwall-1');
  assert.match(OFFERWALL_ENTRY_LOADER_SCRIPT, /type="module" src="\/js\/tool-offerwall-entry\.mjs\?rev=20261024-all-tools-offerwall-1/);
  const page = '<html><head><script src="/other-cmp.js"></script><script src="/js/adsense-offerwall-policy.js?rev=old"></script></head><body></body></html>';
  const first = addOfferwallEntryPolicy(page);
  assert.equal(first.skipped, false);
  assert.equal((first.html.match(/adsense-offerwall-policy\.js/g) || []).length, 1);
  assert.ok(first.html.includes(OFFERWALL_ENTRY_POLICY_SCRIPT));
  assert.ok(first.html.indexOf(OFFERWALL_ENTRY_POLICY_SCRIPT) < first.html.indexOf('/other-cmp.js'));
  assert.ok(first.html.includes('/other-cmp.js'));
  assert.equal((addOfferwallEntryPolicy(first.html).html.match(/adsense-offerwall-policy\.js/g) || []).length, 1);
});

test('top-level module bootstrap subscribes automatically and loads SDK only on eligible updates', async () => {
  const priorWindow = globalThis.window;
  const priorDocument = globalThis.document;
  try {
    const intro = setup({ url: 'https://pixieed.jp/draw/' });
    globalThis.window = intro.window;
    globalThis.document = intro.document;
    await import(`../../js/tool-offerwall-entry.mjs?intro-bootstrap=${Date.now()}`);
    assert.equal(intro.document.head.appended.length, 1, 'intro subscription immediately loads SDK once');

    const pending = setup({ url: `https://pixieed.jp${SETUP[0]}` });
    globalThis.window = pending.window;
    globalThis.document = pending.document;
    await import(`../../js/tool-offerwall-entry.mjs?setup-bootstrap=${Date.now()}`);
    assert.equal(pending.document.head.appended, undefined, 'pending setup does not load SDK');
    pending.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true });
    assert.equal(pending.document.head.appended.length, 1, 'ready notification invokes subscriber loader');
    assert.equal(pending.document.head.appended[0].crossOrigin, 'anonymous');
  } finally {
    if (priorWindow === undefined) delete globalThis.window;
    else globalThis.window = priorWindow;
    if (priorDocument === undefined) delete globalThis.document;
    else globalThis.document = priorDocument;
  }
});
