import test from 'node:test';
import assert from 'node:assert/strict';
import { trackSiteEvent, createEmbeddedAnalyticsReceiver, EMBED_ANALYTICS_EVENT, isEmbeddedAnalyticsEvent, pageSlug } from '../../js/site-analytics.mjs';
import { installToolEmbedBridge } from '../../js/creation/tool-embed-bridge.mjs';

// Entirely in-memory windows and collectors: no browser, real storage or network.
class Hub {
  listeners = new Map();
  addEventListener(name, fn) { const set = this.listeners.get(name) || new Set(); set.add(fn); this.listeners.set(name, set); }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  dispatchEvent(event) { for (const fn of this.listeners.get(event.type) || []) fn(event); return true; }
}
const exportParams = { tool: 'draw', file_type: 'png', method: 'downloaded', export_status: 'download_started' };
function setup() {
  const preference = { parent: null, child: null, childThrows: false, parentThrows: false };
  const storage = key => ({ getItem() { if (preference[key + 'Throws']) throw Error('storage unavailable'); return preference[key]; } });
  const parent = new Hub();
  parent.location = { protocol: 'https:', hostname: 'pixieed.jp', origin: 'https://pixieed.jp', pathname: '/draw/' };
  parent.top = parent.self = parent; parent.localStorage = storage('parent'); parent.dataLayer = [];
  const child = new Hub();
  child.location = { ...parent.location, pathname: '/draw/editor.html', search: '', hash: '' };
  child.top = child.parent = parent; child.self = child; child.localStorage = storage('child');
  child.__PIXIEED_TOOL_EMBED__ = { role: 'draw', channel: 'fixture-channel' };
  child.history = { replaceState() {} };
  const doc = new Hub(); doc.body = { dataset: { creationMode: 'draw' } }; doc.readyState = 'complete';
  doc.documentElement = { toggleAttribute() {} };
  const parentDoc = { body: { dataset: {} } };
  const previous = Object.fromEntries(['window', 'document', 'localStorage', 'CustomEvent'].map(k => [k, globalThis[k]]));
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init.detail; } };
  function at(windowRef, documentRef, work) {
    const before = [globalThis.window, globalThis.document, globalThis.localStorage];
    [globalThis.window, globalThis.document, globalThis.localStorage] = [windowRef, documentRef, windowRef.localStorage];
    try { return work(); } finally { [globalThis.window, globalThis.document, globalThis.localStorage] = before; }
  }
  const receiver = createEmbeddedAnalyticsReceiver({ channel: 'fixture-channel', source: child, origin: parent.location.origin });
  const posted = [];
  parent.postMessage = (data, origin) => {
    posted.push(data);
    at(parent, parentDoc, () => receiver.receive({ data, origin, source: child }));
  };
  const bridge = installToolEmbedBridge({ draw: { getTimeline: () => ({ frames: [], layers: [] }) }, modes: { mode: 'draw', switchMode() {} }, windowRef: child, documentRef: doc });
  const emit = (name = 'file_export', params = exportParams) => at(child, doc, () => trackSiteEvent(name, params));
  const rows = () => parent.dataLayer.map(x => [...x]).filter(x => x[0] === 'event');
  const receive = (data, extra = {}) => at(parent, parentDoc, () => receiver.receive({ data, origin: parent.location.origin, source: child, ...extra }));
  const message = (sequence = 1) => ({ kind: 'pixieed-tool-embed', version: 1, channel: 'fixture-channel', type: 'analytics-event', sequence, name: 'file_export', params: { ...exportParams } });
  return { preference, parent, child, doc, receiver, posted, emit, rows, receive, message, at, parentDoc, cleanup() { bridge.dispose(); for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } } };
}

test('retained child relays only anonymous outcomes, repeated real actions count, replays do not', () => {
  const s = setup();
  try {
    assert.equal(s.emit('file_export', { ...exportParams, filename: 'private.png', projectId: 'private', image: 'secret' }), false);
    assert.deepEqual(s.rows(), [['event', 'file_export', exportParams]]);
    const first = s.posted.find(x => x.type === 'analytics-event');
    assert.equal(s.receive(first), false);
    s.emit();
    assert.equal(s.rows().length, 2, 'a new save click is a new action');
    s.doc.body.dataset.creationMode = 'audio';
    s.emit('file_export', { file_type: 'wav', method: 'shared', export_status: 'share_handoff' });
    assert.deepEqual(s.rows().at(-1), ['event', 'file_export', { tool: 'audio', file_type: 'wav', method: 'shared', export_status: 'share_handoff' }]);
    s.doc.body.dataset.creationMode = 'camera'; s.emit('camera_capture', { filename: 'private.png' });
    assert.deepEqual(s.rows().at(-1), ['event', 'camera_capture', { tool: 'pixel-camera' }]);
    assert.equal(s.emit('page_view'), false); assert.equal(s.rows().length, 4);
    assert.ok(!JSON.stringify(s.posted.filter(x => x.type === 'analytics-event')).includes('private'));
  } finally { s.cleanup(); }
});

test('child and parent denial or storage failure suppress delivery without delayed replay', () => {
  const s = setup();
  try {
    for (const key of ['child', 'parent']) {
      s.preference[key] = 'denied'; s.emit(); assert.equal(s.rows().length, 0);
      s.preference[key] = null;
      s.preference[key + 'Throws'] = true; s.emit(); assert.equal(s.rows().length, 0);
      s.preference[key + 'Throws'] = false;
    }
    const denied = s.message(99); s.preference.parent = 'denied'; s.receive(denied);
    s.preference.parent = null; assert.equal(s.receive(denied), false);
    s.preference.child = 'denied'; const childDenied = s.message(100); s.receive(childDenied);
    s.preference.child = null; assert.equal(s.receive(childDenied), false);
    s.receive(s.message(101)); assert.equal(s.rows().length, 1);
  } finally { s.cleanup(); }
});

test('origin/source/channel/schema and frame eligibility are strict', () => {
  const s = setup();
  try {
    s.receive(s.message(), { origin: 'https://attacker.example' });
    s.receive(s.message(), { source: {} });
    for (const data of [
      { ...s.message(), channel: 'other' }, { ...s.message(), version: 2 }, { ...s.message(), sequence: 0 },
      { ...s.message(), sequence: NaN }, { ...s.message(), name: 'page_view' },
      { ...s.message(), params: { ...exportParams, filename: 'private' } },
      { ...s.message(), params: { ...exportParams, tool: 'books' } },
      { ...s.message(), params: { ...exportParams, method: 'shared' } }, { ...s.message(), extra: true }
    ]) s.receive(data);
    assert.equal(s.rows().length, 0);
    s.child.location.hostname = 'localhost'; s.emit(); assert.equal(s.rows().length, 0);
    s.child.location.hostname = 'pixieed.jp'; s.child.location.protocol = 'http:'; s.emit(); assert.equal(s.rows().length, 0);
    s.child.location.protocol = 'https:';
    s.child.parent = { location: { origin: 'https://attacker.example' } }; s.emit(); assert.equal(s.rows().length, 0);
    s.child.parent = s.parent; delete s.child.__PIXIEED_TOOL_EMBED__; s.emit(); assert.equal(s.rows().length, 0);
  } finally { s.cleanup(); }
});

test('failed measurement cannot throw into completed file/capture code, and reload permits a new sequence', () => {
  const s = setup();
  try {
    s.parent.postMessage = () => { throw Error('collector unavailable'); };
    assert.doesNotThrow(() => s.emit()); assert.doesNotThrow(() => s.emit('camera_capture'));
    const receiver = createEmbeddedAnalyticsReceiver({ channel: 'fixture-channel', source: s.child, origin: s.parent.location.origin, send() { throw Error('send failed'); } });
    assert.doesNotThrow(() => receiver.receive({ data: s.message(), origin: s.parent.location.origin, source: s.child }));
    s.receive(s.message(3)); assert.equal(s.rows().length, 1);
    s.receiver.reset(); s.receive(s.message(1)); assert.equal(s.rows().length, 2);
  } finally { s.cleanup(); }
});

test('top-level exports keep the normal boundary; corrected route classifications are fixed enums', () => {
  const s = setup();
  try {
    s.at(s.parent, s.parentDoc, () => trackSiteEvent('file_export', exportParams));
    assert.deepEqual(s.rows(), [['event', 'file_export', exportParams]]);
    assert.deepEqual(['/camera/', '/books/', '/events/'].map(pageSlug), ['camera', 'books', 'events']);
    assert.equal(isEmbeddedAnalyticsEvent('camera_capture', { tool: 'pixel-camera', id: 'private' }), false);
  } finally { s.cleanup(); }
});
