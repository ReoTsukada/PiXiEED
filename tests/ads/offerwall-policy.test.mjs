import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { TOOL_START_ROUTES, isFreshStartSearch } from '../../js/tool-start-routes.mjs';
import { maybeLoadOfferwallSDK } from '../../js/tool-offerwall-entry.mjs';
import { addOfferwallEntryPolicy, OFFERWALL_ENTRY_LOADER_SCRIPT, OFFERWALL_ENTRY_POLICY_SCRIPT, OFFERWALL_ENTRY_POLICY_VERSION, OFFERWALL_TOOL_PATHS, OFFERWALL_OUTPUT_PATHS } from '../../scripts/offerwall-entry-policy.mjs';

const source = await readFile(new URL('../../js/adsense-offerwall-policy.js', import.meta.url), 'utf8');
const STARTS = TOOL_START_ROUTES.map(route => route.startPath);
const OLD_PATHS = TOOL_START_ROUTES.map(route => route.legacyPath);
const freshHistory = { pixieedWorkspace: false, projectWorkspaceSelection: false, toolStartActive: false };

function setup({ url = `https://pixieed.jp${STARTS[0]}`, frame = false, enumValue = 3, historyState = freshHistory, referrer = '' } = {}) {
  const parsed = new URL(url);
  const listeners = new Map();
  const document = {
    referrer,
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
  vm.runInContext(source, vm.createContext({ window, document, URL, URLSearchParams }));
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
  assert.equal(OFFERWALL_ENTRY_POLICY_VERSION, '20261111-output-offerwall-1');
  assert.match(OFFERWALL_ENTRY_LOADER_SCRIPT, /20261111-output-offerwall-1/);
  for (const path of STARTS) {
    const state = setup({ url: `https://pixieed.jp${path}` });
    assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.isEligible(), false, path);
    assert.equal(state.invoke()[0], false, path);
    assert.deepEqual(Array.from(state.invoke()[1]), [3], path);
    assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), true, path);
    assert.equal(state.invoke()[0], true, path);
  }
});

test('only workspace=1 and social=1 fresh-search combinations are accepted; old routes and unknown search are denied', () => {
  for (const search of ['', '?workspace=1', '?social=1', '?workspace=1&social=1']) {
    assert.equal(isFreshStartSearch(new URLSearchParams(search)), true, search);
    for (const path of STARTS) {
      const state = setup({ url: `https://pixieed.jp${path}${search}` });
      assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), true, `${path}${search}`);
    }
  }
  for (const search of ['?id=1', '?pxd=abc', '?unknown=1', '?workspace=1&workspace=1', '?social=0', '?workspace=1&mode=draw']) {
    assert.equal(isFreshStartSearch(new URLSearchParams(search)), false, search);
    const state = setup({ url: `https://pixieed.jp${STARTS[0]}${search}` });
    assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), false, search);
  }
  for (const path of OLD_PATHS.filter(path => !OFFERWALL_OUTPUT_PATHS.includes(path))) {
    const state = setup({ url: `https://pixieed.jp${path}` });
    assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), false, path);
    assert.equal(state.invoke()[0], false, path);
  }
});

test('output entries accept Google’s exact Offerwall preview pair without broadening other tools', () => {
  const convert = STARTS.find(path => path.endsWith('/convert/'));
  const preview = setup({ url: `https://pixieed.jp${convert}?fc=alwaysshow&fctype=monetization` });
  assert.equal(preview.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), true);
  assert.equal(preview.invoke()[0], true);
  for (const search of [
    '?fc=alwaysshow', '?fctype=monetization', '?fc=alwaysshow&fctype=other',
    '?fc=alwaysshow&fctype=monetization&fctype=monetization',
    '?fc=alwaysshow&fctype=monetization&id=private',
    '?fc=alwaysshow&fctype=monetization&file=private',
    '?fc=alwaysshow&fctype=monetization&extra=private',
  ]) {
    assert.equal(setup({ url: `https://pixieed.jp${convert}${search}` }).window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), false, search);
  }
  const hash = setup({ url: `https://pixieed.jp${convert}?fc=alwaysshow&fctype=monetization#preview` });
  assert.equal(hash.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), false);
  const otherTool = setup({ url: `https://pixieed.jp${STARTS[0]}?fc=alwaysshow&fctype=monetization` });
  assert.equal(otherTool.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), false);
  assert.equal(isFreshStartSearch(new URLSearchParams('?fc=alwaysshow&fctype=monetization')), false, 'preview params do not broaden shared link normalization');
});

test('converter referrer query/hash and malformed values deny; empty/origin/path referrers pass and other tools are unchanged', () => {
  const convert = STARTS.find(path => path.endsWith('/convert/'));
  for (const referrer of ['https://pixieed.jp/output/work/?id=private', 'https://example.test/path?filename=secret', 'https://example.test/path#private', 'not a URL']) {
    const state = setup({ url: `https://pixieed.jp${convert}`, referrer });
    assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), false, referrer);
  }
  for (const referrer of ['', 'https://pixieed.jp', 'https://pixieed.jp/tools/', 'https://example.test/plain/path']) {
    const state = setup({ url: `https://pixieed.jp${convert}`, referrer });
    assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), true, referrer);
  }
  const draw = setup({ url: `https://pixieed.jp${STARTS[0]}`, referrer: 'https://pixieed.jp/draw/?id=ignored' });
  assert.equal(draw.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), true, 'new referrer guard is converter-only');
});

test('internal direct-host mode parameters are accepted only after a captured fresh start; pointers and hashes retire', () => {
  const state = setup({ url: `https://pixieed.jp${STARTS[0]}?social=1` });
  state.window.location.search = '?workspace=1&runtime=direct&mode=draw&modeProjectTool=draw';
  assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), true);
  assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.isEligible(), true);
  state.window.location.search += '&modePxd=project-id';
  assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.isEligible(), false);
  state.window.location.search = '?workspace=1&runtime=direct&mode=draw';
  assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), false, 'cannot rearm after a pointer is observed');

  const badMode = setup({ url: `https://pixieed.jp${STARTS[1]}` });
  badMode.window.location.search = '?runtime=direct&mode=draw';
  assert.equal(badMode.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), false);
  const hash = setup({ url: `https://pixieed.jp${STARTS[5]}` });
  hash.window.location.hash = '#resume';
  assert.equal(hash.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), false);
});

test('initial history flags, iframe, origins, and malformed readiness fail closed', () => {
  for (const flag of ['pixieedWorkspace', 'projectWorkspaceSelection', 'toolStartActive']) {
    const state = setup({ historyState: { [flag]: true } });
    assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), false, flag);
  }
  const convert = STARTS.find(path => path.endsWith('/convert/'));
  for (const flag of ['pixieedConversionRecovery', 'pixieedConversionRecoveryPrevious', 'pixieedConversionRecoveryPaused']) {
    const state = setup({ url: `https://pixieed.jp${convert}`, historyState: { [flag]: flag === 'pixieedConversionRecoveryPaused' ? false : 'saved' } });
    assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), true, flag);
  }
  const drawWithRecovery = setup({ url: `https://pixieed.jp${STARTS[0]}`, historyState: { pixieedConversionRecovery: 'saved' } });
  assert.equal(drawWithRecovery.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), true, 'converter-specific history guard does not change other tools');
  for (const url of [
    `http://pixieed.jp${STARTS[0]}`, `https://www.pixieed.jp${STARTS[0]}`,
    `https://example.org${STARTS[0]}`, `https://pixieed.jp${STARTS[0]}#intro`,
  ]) assert.equal(setup({ url }).window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), false, url);
  for (const options of [undefined, null, {}, { fresh: false }, { fresh: 0 }]) {
    const state = setup();
    assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready(options), false);
    assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), false, 'failed signal is one-way');
  }
  const sentinel = () => {};
  const frameWindow = { top: {}, self: {}, googlefc: { controlledMessagingFunction: sentinel }, location: {} };
  vm.runInContext(source, vm.createContext({ window: frameWindow, document: { addEventListener() { throw Error('iframe listener'); } }, URLSearchParams }));
  assert.equal(frameWindow.googlefc.controlledMessagingFunction, sentinel);
});

test('first tool operation, pagehide, and popstate retire permanently before normal handlers', () => {
  const state = setup();
  state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true });
  for (const type of ['pointerdown', 'click', 'keydown', 'beforeinput', 'input', 'change', 'paste', 'drop']) {
    assert.equal(state.listeners.get(type).capture, true, type);
  }
  state.event('keydown', { closest(selector) { return selector.startsWith('main,') || selector.startsWith('[data-tool-operation]') ? {} : null; } }, { key: 'Tab' });
  assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.isEligible(), true, 'plain tab focus is not work');
  state.event('pointerdown', { closest(selector) { return selector.startsWith('main,') || selector.startsWith('[data-tool-operation]') ? {} : null; } });
  assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.isEligible(), false);
  assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), false);
  const fresh = setup();
  fresh.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true });
  fresh.listeners.get('window:popstate').callback();
  assert.equal(fresh.window.__PIXIEED_OFFERWALL_ENTRY__.isEligible(), false);
  const leaving = setup();
  leaving.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true });
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

test('ineligible policy and synthetic SDK failure never block or retry the output tool', async () => {
  const documentFor = () => {
    const doc = { script: null, querySelector() { return null; }, createElement() {
      return { listeners: {}, addEventListener(type, callback) { this.listeners[type] = callback; } };
    }, head: { append(script) { doc.script = script; } } };
    return doc;
  };
  const windowFor = eligible => { const win = { location: { origin: 'https://pixieed.jp' }, __PIXIEED_OFFERWALL_ENTRY__: { isEligible: () => eligible } }; win.top = win.self = win; return win; };
  const deniedDoc = documentFor();
  assert.equal(await maybeLoadOfferwallSDK({ window: windowFor(false), document: deniedDoc }), false);
  assert.equal(deniedDoc.script, null, 'ineligible entry makes no provider request');

  const failedDoc = documentFor();
  const pending = maybeLoadOfferwallSDK({ window: windowFor(true), document: failedDoc });
  assert.match(failedDoc.script.src, /^https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-/);
  failedDoc.script.listeners.error();
  assert.equal(await pending, false, 'synthetic network failure is terminal and nonblocking');
  assert.equal(await maybeLoadOfferwallSDK({ window: windowFor(true), document: documentFor() }), false, 'failed SDK does not auto-retry');
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

const OUTPUTS = ['/tools/start/convert/', ...OFFERWALL_OUTPUT_PATHS];

test('output registry is separate from the seven starts and requires explicit workspace readiness', () => {
  assert.deepEqual(OFFERWALL_OUTPUT_PATHS, ['/output/work/', '/output/work/index.html']);
  for (const path of OUTPUTS) {
    const state = setup({ url: `https://pixieed.jp${path}` });
    assert.equal(state.invoke()[0], false, path);
    assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true }), false, path);
    assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), false, 'failed readiness cannot rearm');
    const ready = setup({ url: `https://pixieed.jp${path}` });
    assert.equal(ready.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), true, path);
    assert.equal(ready.invoke()[0], true, path);
  }
});

test('output clean URLs allow restored history and exact public parameters but never private URL data', () => {
  const historyState = { pixieedWorkspace: true, projectWorkspaceSelection: true, toolStartActive: true,
    pixieedConversionRecovery: 'saved', pixieedConversionRecoveryPrevious: 'saved', pixieedConversionRecoveryPaused: false,
    pixieedOutputRequest: { id: 'private-pointer' } };
  for (const path of OUTPUTS) {
    for (const search of ['', '?workspace=1', '?social=1', '?entry=1', '?mode=convert', '?text=input', '?text=output',
      '?workspace=1&social=1&entry=1&mode=convert&text=output', '?fc=alwaysshow&fctype=monetization']) {
      const state = setup({ url: `https://pixieed.jp${path}${search}`, historyState });
      assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), true, path + search);
    }
    for (const search of ['?id=secret', '?file=secret', '?entry=0', '?entry=1&entry=1', '?mode=draw', '?text=secret',
      '?text=input&text=output', '?view=advanced', '?unknown=1', '?workspace=0', '?fc=alwaysshow',
      '?fc=alwaysshow&fctype=monetization&entry=1', '?fc=alwaysshow&fctype=monetization&id=secret', '#secret']) {
      const state = setup({ url: `https://pixieed.jp${path}${search}`, historyState });
      assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), false, path + search);
    }
    for (const referrer of ['https://pixieed.jp/draw/?id=secret', 'https://example.test/#secret', 'invalid']) {
      assert.equal(setup({ url: `https://pixieed.jp${path}`, referrer }).window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), false, path + referrer);
    }
  }
});

test('output handoff cleanup is eligible, but initial private URL cleanup cannot bypass denial', () => {
  for (const path of OUTPUTS) {
    const state = setup({ url: `https://pixieed.jp${path}?entry=1` });
    state.window.location.search = '';
    assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), true);
    for (const search of ['?id=secret', '?file=secret']) {
      const denied = setup({ url: `https://pixieed.jp${path}${search}` });
      denied.window.location.search = '';
      assert.equal(denied.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), false);
    }
  }
});

test('output operations do not retire or rearm entry; route changes and navigation retire permanently', () => {
  const target = { closest() { return {}; } };
  for (const path of OUTPUTS) {
    const state = setup({ url: `https://pixieed.jp${path}` });
    for (const phase of ['before', 'after']) {
      for (const type of ['pointerdown', 'click', 'keydown', 'beforeinput', 'input', 'change', 'paste', 'drop']) {
        state.event(type, target, { key: 'Enter' });
      }
      if (phase === 'before') assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), true);
      assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.isEligible(), true);
    }
    assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), false, 'one readiness opportunity');
    assert.equal(state.window.__PIXIEED_OFFERWALL_ENTRY__.isEligible(), true, 'second signal does not retire an eligible entry');
    for (const retire of [s => s.listeners.get('window:pagehide').callback(), s => s.listeners.get('window:popstate').callback(),
      s => { s.window.location.search = '?id=private'; }, s => { s.window.location.hash = '#private'; },
      s => { s.window.location.pathname = '/output/work/other/'; }]) {
      const current = setup({ url: `https://pixieed.jp${path}` });
      current.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true });
      retire(current);
      assert.equal(current.window.__PIXIEED_OFFERWALL_ENTRY__.isEligible(), false);
      current.window.location.search = ''; current.window.location.hash = ''; current.window.location.pathname = path;
      assert.equal(current.window.__PIXIEED_OFFERWALL_ENTRY__.ready({ fresh: true, output: true }), false);
    }
  }
});

test('successful output SDK loading is shared once across repeated eligible updates', async () => {
  const { maybeLoadOfferwallSDK: load } = await import('../../js/tool-offerwall-entry.mjs?test=output-sdk-once');
  let requests = 0;
  let script;
  let eligible = true;
  const win = { location: { origin: 'https://pixieed.jp' }, __PIXIEED_OFFERWALL_ENTRY__: { isEligible: () => eligible } };
  win.top = win.self = win;
  const doc = {
    querySelector() { return null; },
    createElement() { return { listeners: {}, addEventListener(type, callback) { this.listeners[type] = callback; } }; },
    head: { append(value) { requests++; script = value; } },
  };
  const first = load({ window: win, document: doc });
  assert.equal(requests, 1);
  assert.equal(script.referrerPolicy, 'no-referrer');
  assert.equal(load({ window: win, document: doc }), first, 'concurrent calls share the same load');
  script.listeners.load();
  assert.equal(await first, true);
  for (let i = 0; i < 5; i++) assert.equal(await load({ window: win, document: doc }), true);
  assert.equal(requests, 1, 'settings changes and saves cannot issue another SDK request');
  eligible = false;
  assert.equal(await load({ window: win, document: doc }), false, 'retirement blocks further eligibility even after successful loading');
  assert.equal(requests, 1);
});
