import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const storage = new Map([['PiXiEED:analytics-consent:v1', 'granted']]);
const documentEvents = new Map();
const windowEvents = new Map();
const dispatched = [];
const appended = [];
globalThis.localStorage = { getItem(key) { return storage.get(key) ?? null; } };
globalThis.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
globalThis.location = { hostname: 'pixieed.jp', protocol: 'https:', origin: 'https://pixieed.jp', pathname: '/draw/', search: '', hash: '' };
globalThis.history = {
  pushState(_state, _title, url) { updateLocation(url); },
  replaceState(_state, _title, url) { updateLocation(url); }
};
function updateLocation(value) {
  const next = new URL(value, location.origin);
  Object.assign(location, { pathname: next.pathname, search: next.search, hash: next.hash });
}
globalThis.window = {
  location: globalThis.location,
  addEventListener(name, listener) { windowEvents.set(name, listener); },
  dataLayer: []
};
window.top = window.self = window;
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
};
globalThis.document = {
  body: { dataset: {} },
  head: { append(node) { appended.push(node); } },
  addEventListener(name, listener) { documentEvents.set(name, listener); },
  dispatchEvent(event) { dispatched.push(event); documentEvents.get(event.type)?.(event); return true; },
  createElement() { return {}; }
};

const analytics = await import('../../js/site-analytics.mjs?embed-boundary-test');
const events = () => window.dataLayer.filter((entry) => entry?.[0] === 'event');

test('embedded trackers relay one fixed tool enum without sending analytics from the iframe', async () => {
  const parent = window;
  window.top = parent;
  window.self = {};
  window.__PIXIEED_TOOL_EMBED__ = { role: 'draw', channel: 'test-channel' };
  const beforeEvents = events().length;
  const beforeScripts = appended.length;
  const embedded = await import('../../js/site-analytics.mjs?embedded-boundary-test');
  const start = embedded.createToolStartTracker('draw');
  assert.equal(embedded.startAnalytics(), false);
  assert.equal(start(), false);
  assert.equal(start(), false, 'the same mutation boundary is reported once');
  assert.deepEqual(dispatched.map(({ type, detail }) => ({ type, detail })), [
    { type: 'pixieed:embed-tool-start', detail: { tool: 'draw' } }
  ]);
  assert.equal(embedded.createToolStartTracker('private-name')(), false);
  assert.equal(dispatched.length, 1, 'unsafe tool names are not relayed');
  assert.equal(events().length, beforeEvents);
  assert.equal(appended.length, beforeScripts);
  delete window.__PIXIEED_TOOL_EMBED__;
  window.self = parent;
});

test('query and fragment updates used by expansion do not create another page view', () => {
  const before = events().filter((entry) => entry[1] === 'page_view').length;
  history.replaceState(history.state, '', '/draw/?mode=draw&keep=one#expanded');
  history.replaceState(history.state, '', '/draw/?mode=draw&keep=one');
  const after = events().filter((entry) => entry[1] === 'page_view').length;
  assert.equal(after, before);
});

test('the parent analytics boundary drops relayed starts while consent is denied', () => {
  storage.set('PiXiEED:analytics-consent:v1', 'denied');
  documentEvents.get('pixieed:analytics-consent-change')();
  const before = events().length;
  assert.equal(analytics.trackSiteEvent('tool_start', { tool: 'draw' }), false);
  assert.equal(events().length, before);
});

test('the frame bridge relays only a fixed tool enum and the parent validates and deduplicates it', async () => {
  const { installToolEmbedBridge } = await import('../../js/creation/tool-embed-bridge.mjs?analytics-embed-test');
  const posted = [];
  const listeners = new Map();
  const parentRef = { postMessage(message, origin) { posted.push({ message, origin }); } };
  const windowRef = {
    __PIXIEED_TOOL_EMBED__: { role: 'draw', channel: 'private-channel' },
    location: { origin: 'https://pixieed.jp', pathname: '/draw/', search: '', hash: '' },
    parent: parentRef,
    history: { replaceState() {} },
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name) { listeners.delete(name); }
  };
  const documentListeners = new Map();
  const documentRef = {
    readyState: 'complete', body: null, fullscreenElement: null,
    documentElement: { toggleAttribute() {} },
    addEventListener(name, listener) { documentListeners.set(name, listener); },
    removeEventListener(name) { documentListeners.delete(name); }
  };
  const bridge = installToolEmbedBridge({
    draw: { getTimeline: () => ({ frames: [], layers: [] }) },
    modes: { mode: 'draw', switchMode() {} }, windowRef, documentRef
  });
  const relay = documentListeners.get('pixieed:embed-tool-start');
  relay({ detail: { tool: 'draw', filename: 'private.png', projectId: 'secret' } });
  relay({ detail: { tool: 'private-name' } });
  assert.deepEqual(posted.filter(({ message }) => message.type === 'tool-start'), [{
    message: { kind: 'pixieed-tool-embed', version: 1, channel: 'private-channel', type: 'tool-start', tool: 'draw' },
    origin: 'https://pixieed.jp'
  }]);
  bridge.dispose();

  const shell = readFileSync(new URL('../../js/tool-embed.mjs', import.meta.url), 'utf8');
  assert.match(shell, /event\.origin !== location\.origin/);
  assert.match(shell, /message\.channel !== instance\.channel/);
  assert.match(shell, /message\.type === 'tool-start'[\s\S]*?instance\.toolStarts\.has\(message\.tool\)[\s\S]*?trackSiteEvent\('tool_start', \{ tool: message\.tool \}\)/);
});


test('audio shell query and hash synchronization keeps its one page view', () => {
  history.replaceState(history.state, '', '/audio/');
  const before = events().filter(entry => entry[1] === 'page_view').length;
  history.replaceState(history.state, '', '/audio/?mode=audio&pxd=qa&pxdRevision=safe#saved');
  history.replaceState(history.state, '', '/audio/?mode=audio&pxd=qa&pxdRevision=new#saved');
  assert.equal(events().filter(entry => entry[1] === 'page_view').length, before);
});
