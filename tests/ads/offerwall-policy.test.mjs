import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { TOOL_START_ROUTES, isFreshStartSearch } from '../../js/tool-start-routes.mjs';
import { addOfferwallEntryPolicy, OFFERWALL_ENTRY_LOADER_SCRIPT, OFFERWALL_ENTRY_POLICY_SCRIPT, OFFERWALL_ENTRY_POLICY_VERSION, OFFERWALL_TOOL_PATHS } from '../../scripts/offerwall-entry-policy.mjs';

const source = await readFile(new URL('../../js/adsense-offerwall-policy.js', import.meta.url), 'utf8');
const STARTS = TOOL_START_ROUTES.map(route => route.startPath);
const OLD_PATHS = TOOL_START_ROUTES.map(route => route.legacyPath);
const freshHistory = { pixieedWorkspace: false, projectWorkspaceSelection: false, toolStartActive: false };

function setup({ url = `https://pixieed.jp${STARTS[0]}`, frame = false, enumValue = 3, historyState = freshHistory } = {}) {
  const parsed = new URL(url);
  const listeners = new Map();
  const document = {
    addEventListener(type, callback, capture) { listeners.set(type, { callback, capture }); },
  };
  const top = {};
  const googlefc = enumValue == null ? {} : { MessageTypeEnum: { OFFERWALL: enumValue } };
  const window = {
    top: frame ? top : null, self: {}, history: { state: historyState }, googlefc,
    location: { protocol: parsed.protocol, origin: parsed.origin, pathname: parsed.pathname, search: parsed.search, hash: parsed.hash },
    addEventListener(type, callback) { listeners.set(`window:${type}`, { callback }); },
  };
  if (!frame) window.top = window.self;
  vm.runInContext(source, vm.createContext({ window, document, URLSearchParams }));
  const invoke = () => {
    let args;
    window.googlefc.controlledMessagingFunction({ proceed: (...value) => { args = value; } });
    return args;
  };
  const event = (type, target, extra = {}) => listeners.get(type)?.callback({ type, target, ...extra });
  return { window, document, listeners, invoke, event };
}

test('Offerwall registry exactly matches the seven common start routes, all pending until fresh runtime readiness', () => {
  assert.deepEqual(OFFERWALL_TOOL_PATHS, STARTS);
  assert.equal(OFFERWALL_ENTRY_POLICY_VERSION, '20261024-common-tool-start-1');
  assert.match(OFFERWALL_ENTRY_LOADER_SCRIPT, /20261024-common-tool-start-1/);
  for (const path of STARTS) {
    const state = setup({ url: `https://pixieed.jp${path}` });
    assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.isEligible(), false, path);
    assert.equal(state.invoke()[0], false, path);
    assert.deepEqual(Array.from(state.invoke()[1]), [3], path);
    assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true }), true, path);
    assert.equal(state.invoke()[0], true, path);
  }
});

test('only workspace=1 and social=1 fresh-search combinations are accepted; old routes and unknown search are denied', () => {
  for (const search of ['', '?workspace=1', '?social=1', '?workspace=1&social=1']) {
    assert.equal(isFreshStartSearch(new URLSearchParams(search)), true, search);
    for (const path of STARTS) {
      const state = setup({ url: `https://pixieed.jp${path}${search}` });
      assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true }), true, `${path}${search}`);
    }
  }
  for (const search of ['?id=1', '?pxd=abc', '?unknown=1', '?workspace=1&workspace=1', '?social=0', '?workspace=1&mode=draw']) {
    assert.equal(isFreshStartSearch(new URLSearchParams(search)), false, search);
    const state = setup({ url: `https://pixieed.jp${STARTS[0]}${search}` });
    assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true }), false, search);
  }
  for (const path of OLD_PATHS) {
    const state = setup({ url: `https://pixieed.jp${path}` });
    assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true }), false, path);
    assert.equal(state.invoke()[0], false, path);
  }
});

test('internal direct-host mode parameters are accepted only after a captured fresh start; pointers and hashes retire', () => {
  const state = setup({ url: `https://pixieed.jp${STARTS[0]}?social=1` });
  state.window.location.search = '?workspace=1&runtime=direct&mode=draw&modeProjectTool=draw';
  assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true }), true);
  assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.isEligible(), true);
  state.window.location.search += '&modePxd=project-id';
  assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.isEligible(), false);
  state.window.location.search = '?workspace=1&runtime=direct&mode=draw';
  assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true }), false, 'cannot rearm after a pointer is observed');

  const badMode = setup({ url: `https://pixieed.jp${STARTS[1]}` });
  badMode.window.location.search = '?runtime=direct&mode=draw';
  assert.equal(badMode.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true }), false);
  const hash = setup({ url: `https://pixieed.jp${STARTS[5]}` });
  hash.window.location.hash = '#resume';
  assert.equal(hash.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true }), false);
});

test('initial history flags, iframe, origins, and malformed readiness fail closed', () => {
  for (const flag of ['pixieedWorkspace', 'projectWorkspaceSelection', 'toolStartActive']) {
    const state = setup({ historyState: { [flag]: true } });
    assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true }), false, flag);
  }
  for (const url of [
    `http://pixieed.jp${STARTS[0]}`, `https://www.pixieed.jp${STARTS[0]}`,
    `https://example.org${STARTS[0]}`, `https://pixieed.jp${STARTS[0]}#intro`,
  ]) assert.equal(setup({ url }).window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true }), false, url);
  for (const options of [undefined, null, {}, { fresh: false }, { fresh: 0 }]) {
    const state = setup();
    assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready(options), false);
    assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true }), false, 'failed signal is one-way');
  }
  const sentinel = () => {};
  const frameWindow = { top: {}, self: {}, googlefc: { controlledMessagingFunction: sentinel }, location: {} };
  vm.runInContext(source, vm.createContext({ window: frameWindow, document: { addEventListener() { throw Error('iframe listener'); } }, URLSearchParams }));
  assert.equal(frameWindow.googlefc.controlledMessagingFunction, sentinel);
});

test('first tool operation, pagehide, and popstate retire permanently before normal handlers', () => {
  const state = setup();
  state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true });
  for (const type of ['pointerdown', 'click', 'keydown', 'beforeinput', 'input', 'change', 'paste', 'drop']) {
    assert.equal(state.listeners.get(type).capture, true, type);
  }
  state.event('keydown', { closest(selector) { return selector.startsWith('main,') || selector.startsWith('[data-tool-operation]') ? {} : null; } }, { key: 'Tab' });
  assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.isEligible(), true, 'plain tab focus is not work');
  state.event('pointerdown', { closest(selector) { return selector.startsWith('main,') || selector.startsWith('[data-tool-operation]') ? {} : null; } });
  assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.isEligible(), false);
  assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true }), false);
  const fresh = setup();
  fresh.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true });
  fresh.listeners.get('window:popstate').callback();
  assert.equal(fresh.window.__PIXIEED_OFFERWALL_ENTRY__.isEligible(), false);
  const leaving = setup();
  leaving.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true });
  leaving.listeners.get('window:pagehide').callback();
  assert.equal(leaving.window.__PIXIEED_OFFERWALL_ENTRY__.isEligible(), false);
});

test('unknown Offerwall enum proceeds to avoid blocking CMP; known ineligible callback suppresses only Offerwall', () => {
  assert.deepEqual(setup({ enumValue: null }).invoke(), [true]);
  const state = setup({ url: `https://pixieed.jp${OLD_PATHS[0]}` });
  const result = state.invoke();
  assert.equal(result[0], false);
  assert.deepEqual(Array.from(result[1]), [3]);
});

test('build helper versions one synchronous policy before unrelated CMP and preserves the seven entry registry', () => {
  const page = '<html><head><script src="/other-cmp.js"></script><script src="/js/adsense-offerwall-policy.js?rev=old"></script></head><body></body></html>';
  const first = addOfferwallEntryPolicy(page);
  assert.equal(first.skipped, false);
  assert.equal((first.html.match(/adsense-offerwall-policy\.js/g) || []).length, 1);
  assert.ok(first.html.includes(OFFERWALL_ENTRY_POLICY_SCRIPT));
  assert.ok(first.html.indexOf(OFFERWALL_ENTRY_POLICY_SCRIPT) < first.html.indexOf('/other-cmp.js'));
  assert.ok(first.html.includes('/other-cmp.js'));
  assert.equal((addOfferwallEntryPolicy(first.html).html.match(/adsense-offerwall-policy\.js/g) || []).length, 1);
  assert.deepEqual(OFFERWALL_TOOL_PATHS, TOOL_START_ROUTES.map(route => route.startPath));
});
