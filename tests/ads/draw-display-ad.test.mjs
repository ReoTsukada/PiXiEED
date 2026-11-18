import test from 'node:test';
import assert from 'node:assert/strict';
import { drawDisplayAdConfig } from '../../data/draw-display-ad-config.mjs';
import {
  getDrawDisplayAdLayout, isDrawDisplayAdEligible, mountDrawDisplayAd,
  mountDrawDisplayAdWhenReady, resolveDrawDisplayAdUnit
} from '../../js/ads/draw-display-ad.mjs';

// Synthetic DOM/geometry checks; actual CSS and ad delivery still need browser validation.
class FakeElement extends EventTarget {
  constructor(doc, bounds = null, tagName = 'DIV') {
    super(); this.ownerDocument = doc; this.bounds = bounds; this.tagName = tagName; this.dataset = {};
    this.children = []; this.attributes = {}; this.hidden = false; this.isConnected = true;
    this.classList = { values: new Set(), add: value => this.classList.values.add(value),
      contains: value => this.classList.values.has(value) };
    const props = new Map(); this.style = { right: '', setProperty: (key, value) => props.set(key, value),
      removeProperty: key => props.delete(key), getPropertyValue: key => props.get(key) || '' };
  }
  append(...items) { for (const item of items) { item.parentElement = this; this.children.push(item); } }
  remove() { this.removed = true; this.isConnected = false; if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this); }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; }
  getBoundingClientRect() { return typeof this.bounds === 'function' ? this.bounds() : this.bounds; }
  querySelector(selector) { return this.lookup?.[selector] || null; }
  matches() { return false; }
}

function fakeSurface(search = '?drawAdPreview=filled', locationPatch = {}) {
  const doc = new EventTarget(); doc.visibilityState = 'visible'; doc.fullscreenElement = null;
  doc.createElement = tag => new FakeElement(doc, null, tag.toUpperCase());
  const body = new FakeElement(doc); body.dataset.creationMode = 'draw'; body.classList.add('draw-desktop-active'); doc.body = body;
  const canvas = new FakeElement(doc, { left: 300, right: 700, top: 100, bottom: 500, width: 400, height: 400 });
  const stage = new FakeElement(doc, { left: 240, right: 1140, top: 56, bottom: 800, width: 900, height: 744 });
  const dock = new FakeElement(doc, { left: 1328, right: 1592, top: 56, bottom: 992, width: 264, height: 936 });
  const palette = new FakeElement(doc, { height: 260 });
  dock.inset = 9;
  const reserved = () => dock.attributes['data-draw-ad-lane'] === 'true' ? Number.parseFloat(dock.style.getPropertyValue('--draw-ad-lane-height')) || 0 : 0;
  const layers = new FakeElement(doc, () => {
    const bounds = dock.bounds, top = bounds.top + dock.inset + palette.bounds.height + 10;
    const bottom = bounds.bottom - dock.inset - reserved();
    return { left: bounds.left + dock.inset, right: bounds.right - dock.inset, top, bottom, width: bounds.width - dock.inset * 2, height: bottom - top };
  });
  dock.lookup = { '.draw-desktop-palette-panel': palette, '.draw-desktop-layers-panel': layers };
  dock.append = (...items) => { for (const item of items) {
    item.parentElement = dock; dock.children.push(item);
    item.bounds = () => ({ left: dock.bounds.left + dock.inset, right: dock.bounds.right - dock.inset, top: layers.getBoundingClientRect().bottom,
      bottom: dock.bounds.bottom - dock.inset, width: dock.bounds.width - dock.inset * 2, height: reserved() });
  } };
  const shell = new FakeElement(doc); shell.lookup = { '.draw-desktop-stage': stage, '.draw-desktop-dock': dock, '#draw-canvas': canvas };
  const root = new FakeElement(doc); root.lookup = { '.draw-desktop-shell': shell, '#draw-canvas': canvas };
  doc.querySelector = selector => selector === 'link[data-draw-desktop-ui]' ? doc.desktopUiStyle || null
    : selector === 'dialog[open]' ? doc.dialog || null : null;
  const timers = new Map(), idles = new Map(), frames = new Map(), resizeObservers = [], mutationObservers = []; let id = 0;
  const win = new EventTarget(); win.location = { protocol: 'http:', hostname: 'localhost', origin: 'http://localhost:4173',
    pathname: '/draw/editor.html', search, hash: '', ...locationPatch };
  win.top = win.self = win; win.history = { state: null }; win.innerWidth = 1600; win.innerHeight = 1000;
  win.visualViewport = { width: 1600, height: 1000, scale: 1, offsetLeft: 0, offsetTop: 0 };
  win.matchMedia = () => ({ matches: true });
  win.setTimeout = (callback, delay = 0) => { const key = ++id; timers.set(key, { callback, delay }); return key; };
  win.clearTimeout = key => timers.delete(key);
  win.requestAnimationFrame = callback => { const key = ++id; frames.set(key, callback); return key; };
  win.cancelAnimationFrame = key => frames.delete(key);
  win.requestIdleCallback = callback => { const key = ++id; idles.set(key, callback); return key; };
  win.cancelIdleCallback = key => idles.delete(key);
  win.ResizeObserver = class { constructor(callback) { this.callback = callback; this.targets = []; resizeObservers.push(this); } observe(target) { this.targets.push(target); } disconnect() { this.disconnected = true; } };
  win.MutationObserver = class { constructor(callback) { this.callback = callback; mutationObservers.push(this); } observe(target) { this.target = target; } disconnect() { this.disconnected = true; } };
  const desktopUiStyle = new FakeElement(doc); desktopUiStyle.sheet = null; doc.desktopUiStyle = desktopUiStyle;
  return { doc, win, root, shell, stage, canvas, body, dock, palette, layers, desktopUiStyle, timers, idles, frames,
    resizeObservers, mutationObservers,
    resize() { for (const observer of resizeObservers) if (!observer.disconnected) observer.callback([]); },
    runTimer() { const entry = [...timers.entries()].sort((a, b) => a[1].delay - b[1].delay)[0]; assert.ok(entry); timers.delete(entry[0]); entry[1].callback(); },
    runIdle() { const entry = idles.entries().next().value; assert.ok(entry); idles.delete(entry[0]); entry[1](); },
    runFrame() { const entry = frames.entries().next().value; assert.ok(entry); frames.delete(entry[0]); entry[1](0); } };
}
const production = { protocol: 'https:', hostname: 'pixieed.jp', origin: 'https://pixieed.jp', pathname: '/tools/start/draw/' };
const directQuery = '?workspace=1&runtime=direct&mode=draw';

const parts = surface => {
  const host = surface.dock.children[0];
  const label = host?.children.find(node => node.className === 'draw-display-ad__label');
  const slot = host?.children.find(node => node.className === 'draw-display-ad__slot');
  const hint = host?.children.find(node => node.className === 'draw-display-ad__hint');
  return { host, label, slot, hint, ins: slot?.children[0] };
};
const layoutSnapshot = surface => ({
  reserve: surface.dock.style.getPropertyValue('--draw-ad-lane-height'),
  layers: surface.layers.getBoundingClientRect(), canvas: { ...surface.canvas.bounds },
  stage: { ...surface.stage.bounds }, shellRight: surface.shell.style.right
});
function assertHint(surface, state = 'fallback') {
  const { host, label, slot, hint } = parts(surface);
  assert.equal(host.dataset.adState, state);
  assert.equal(label.textContent, '操作のヒント');
  assert.equal(hint.textContent, '線や色はレイヤーを分けると、あとから直しやすくなります。');
  assert.equal(hint.hidden, false);
  assert.ok(!slot || slot.hidden, 'hint never overlaps a visible slot');
  assert.equal(hint.tagName, 'P'); assert.equal(hint.children.length, 0, 'hint has no interactive controls');
}

test('compact candidates fit only inside an existing dock with 112px left for layers', () => {
  assert.deepEqual(resolveDrawDisplayAdUnit(), { client: 'ca-pub-9801602250480253', slot: '8825932060' });
  const base = { viewportWidth: 1600, viewportHeight: 900, dockWidth: 264, layersHeight: 300 };
  assert.deepEqual(getDrawDisplayAdLayout(base), { width: 234, height: 60, reserve: 108, minLayersHeight: 112, inset: 18 });
  assert.deepEqual(getDrawDisplayAdLayout({ ...base, dockWidth: 318 }), { width: 300, height: 50, reserve: 98, minLayersHeight: 112, inset: 18 });
  assert.equal(getDrawDisplayAdLayout({ ...base, dockWidth: 251 }), null);
  assert.equal(getDrawDisplayAdLayout({ ...base, layersHeight: 219 }), null);
  assert.equal(getDrawDisplayAdLayout({ ...base, dockBottom: 901 }), null);
  assert.equal(getDrawDisplayAdLayout({ ...base, dockLeft: 1500 }), null);
});

test('production gate rejects private URLs, embeds, fullscreen, non-Draw and non-desktop contexts', () => {
  const base = { config: drawDisplayAdConfig, origin: 'https://pixieed.jp', protocol: 'https:',
    pathname: '/draw/editor.html', topLevel: true, mode: 'draw', desktop: true,
    fullscreen: false, visualScale: 1, pointerFine: true, privateContext: false, pageVisible: true, viewportWidth: 1100 };
  assert.equal(isDrawDisplayAdEligible(base), true);
  for (const pathname of ['/tools/start/draw/', '/draw/']) assert.equal(isDrawDisplayAdEligible({ ...base, pathname, search: directQuery }), true);
  for (const patch of [{ origin: 'https://preview.pixieed.jp' }, { search: '?pxd=x' }, { hash: '#private' },
    { topLevel: false }, { mode: 'audio' }, { desktop: false }, { fullscreen: true },
    { search: directQuery + '&code=secret' }, { search: directQuery + '&workspace=1' },
    { visualScale: 1.2 }, { pointerFine: false }, { privateContext: true }, { pageVisible: false }, { viewportWidth: 1099 }]) {
    assert.equal(isDrawDisplayAdEligible({ ...base, ...patch }), false);
  }
});

test('local preview keeps the canvas and shell width, fills only the dock, and has no close button', () => {
  const surface = fakeSurface(); let requests = 0;
  const canvasBefore = { ...surface.canvas.bounds }, stageBefore = { ...surface.stage.bounds };
  const cleanup = mountDrawDisplayAd({ ...surface, loadAdsense() { requests++; throw Error('preview must not load'); } });
  assert.equal(surface.dock.style.getPropertyValue('--draw-ad-lane-height'), '108px');
  assert.equal(surface.shell.style.right, '');
  assert.equal(surface.dock.children.length, 1, 'the hint fills the stable row before any SDK work');
  assertHint(surface, 'loading');
  assert.equal(parts(surface).slot.children.length, 0, 'no hidden ins is created before it can be requested visibly');
  surface.runTimer(); surface.runIdle();
  const host = surface.dock.children[0];
  assert.equal(host.dataset.preview, 'true'); assert.equal(host.dataset.adState, 'filled');
  assert.equal(host.children[0].textContent, '広告・確認用');
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  assert.equal(descendants(host).filter(node => node.tagName === 'BUTTON').length, 0);
  assert.deepEqual(surface.canvas.bounds, canvasBefore); assert.deepEqual(surface.stage.bounds, stageBefore);
  assert.equal(surface.body.children.length, 0); assert.equal(requests, 0);
  assert.deepEqual(surface.resizeObservers[0].targets, [surface.dock, surface.palette, surface.layers]);
  cleanup();
  assert.equal(host.removed, true); assert.equal(surface.dock.children.length, 0);
  assert.equal(surface.dock.style.getPropertyValue('--draw-ad-lane-height'), '');
  assert.equal(surface.shell.style.right, '');
});

test('small dock width or height and preview off do not reserve or request an ad', () => {
  for (const [query, change] of [
    ['?drawAdPreview=filled', s => { s.dock.bounds.width = 240; }],
    ['?drawAdPreview=filled', s => { s.palette.bounds.height = 800; }],
    ['?drawAdPreview=off', () => {}]
  ]) {
    const surface = fakeSurface(query);
    change(surface); let requests = 0;
    mountDrawDisplayAd({ ...surface, loadAdsense() { requests++; } });
    assert.equal(surface.dock.style.getPropertyValue('--draw-ad-lane-height'), '');
    assert.equal(surface.dock.children.length, 0); assert.equal(requests, 0);
  }
});

test('localhost direct preview accepts the fixed query and never contacts AdSense', () => {
  const surface = fakeSurface(directQuery + '&drawAdPreview=filled', { pathname: '/tools/start/draw/' }); let requests = 0;
  mountDrawDisplayAd({ ...surface, loadAdsense() { requests++; throw Error('preview must not request'); } });
  surface.runTimer(); surface.runIdle();
  assert.equal(surface.dock.children[0].dataset.preview, 'true'); assert.equal(requests, 0);
});

test('unfilled and blocked previews keep the same hint row without contacting AdSense', () => {
  for (const preview of ['unfilled', 'blocked']) {
    const surface = fakeSurface(`?drawAdPreview=${preview}`); let requests = 0;
    mountDrawDisplayAd({ ...surface, loadAdsense() { requests++; } });
    const before = layoutSnapshot(surface);
    if (preview !== 'blocked') { assertHint(surface, 'loading'); surface.runTimer(); surface.runIdle(); }
    assertHint(surface); assert.equal(parts(surface).host.dataset.adReason, preview);
    assert.deepEqual(layoutSnapshot(surface), before); assert.equal(requests, 0);
  }
});

test('a new SDK finishes loading and receives exactly one request without automatic refresh', () => {
  const surface = fakeSurface(directQuery, production); let requests = 0, loads = 0;
  const script = new EventTarget(); script.readyState = 'loading';
  const loader = { script, failed: false, errors: new Set() };
  const cleanup = mountDrawDisplayAd({ ...surface, loadAdsense() { loads++; return loader; } });
  surface.runTimer(); surface.runIdle(); assert.equal(loads, 1); assert.equal(requests, 0);
  surface.win.adsbygoogle = { push() { requests++; } };
  script.dispatchEvent(new Event('load')); script.dispatchEvent(new Event('load'));
  assert.equal(requests, 1);
  assert.equal(mountDrawDisplayAd({ ...surface }), cleanup);
  const ins = surface.dock.children[0].children[1].children[0]; ins.dataset.adStatus = 'filled';
  surface.mutationObservers.find(observer => observer.target === ins).callback([]);
  assert.equal(surface.timers.size, 0, 'filled creative has no refresh timer');
  surface.win.dispatchEvent(new Event('resize')); surface.resize();
  assert.equal(requests, 1); assert.equal(surface.dock.children.length, 1);
  cleanup(); mountDrawDisplayAd({ ...surface });
  assert.equal(surface.dock.children.length, 0, 'a retired document does not mount a replacement');
});

test('all provider failures preserve the same hint host, reserve, layers and canvas', () => {
  for (const failure of ['sdk-error', 'sdk-timeout', 'response-timeout', 'unfilled', 'request-error']) {
    const surface = fakeSurface(directQuery, production); let requests = 0;
    const script = new EventTarget(); script.readyState = failure === 'sdk-timeout' ? 'loading' : 'complete';
    if (failure !== 'sdk-timeout') surface.win.adsbygoogle = { push() { requests++; if (failure === 'request-error') throw Error('request failed'); } };
    const cleanup = mountDrawDisplayAd({ ...surface, loadAdsense() { return { script, failed: failure === 'sdk-error', errors: new Set() }; } });
    const before = layoutSnapshot(surface), host = parts(surface).host;
    assertHint(surface, 'loading');
    surface.runTimer(); surface.runIdle();
    if (failure === 'sdk-timeout' || failure === 'response-timeout') surface.runTimer();
    else if (failure === 'unfilled') {
      const { ins } = parts(surface); ins.dataset.adStatus = 'unfilled';
      surface.mutationObservers.find(observer => observer.target === ins).callback([]);
    }
    assertHint(surface); assert.equal(parts(surface).host, host); assert.equal(host.dataset.adReason, failure);
    assert.deepEqual(layoutSnapshot(surface), before);
    assert.equal(requests, ['sdk-error', 'sdk-timeout'].includes(failure) ? 0 : 1);
    assert.equal(parts(surface).slot, undefined, 'failed unit is detached before hint is restored');
    cleanup(); assert.equal(surface.dock.children.length, 0); assert.equal(surface.dock.style.getPropertyValue('--draw-ad-lane-height'), '');
  }
});

test('narrowing the dock, growing palette, or moving outside the viewport retires without resizing the creative', () => {
  for (const resize of [s => { s.dock.bounds.width = 240; }, s => { s.palette.bounds.height = 800; }, s => { s.dock.bounds.bottom = 1001; }]) {
    const surface = fakeSurface(); mountDrawDisplayAd({ ...surface }); surface.runTimer(); surface.runIdle();
    const host = surface.dock.children[0], ins = host.children[1].children[0];
    resize(surface); surface.resize();
    assert.equal(host.removed, true); assert.equal(ins.style.width, '234px'); assert.equal(ins.style.height, '60px');
    assert.equal(surface.dock.style.getPropertyValue('--draw-ad-lane-height'), ''); assert.equal(surface.shell.style.right, '');
  }
});

test('retirement waits until an active canvas stroke ends before releasing dock space', () => {
  const surface = fakeSurface(); mountDrawDisplayAd({ ...surface }); surface.runTimer(); surface.runIdle();
  const host = surface.dock.children[0]; surface.canvas.dispatchEvent(new Event('pointerdown'));
  surface.dock.bounds.width = 240; surface.resize();
  assert.equal(host.hidden, true); assert.equal(surface.dock.style.getPropertyValue('--draw-ad-lane-height'), '108px');
  surface.canvas.dispatchEvent(new Event('pointerup'));
  assert.equal(surface.dock.children.length, 0); assert.equal(surface.dock.style.getPropertyValue('--draw-ad-lane-height'), '');
});

test('dialog visibility hides the same creative without a replacement request or canvas change', () => {
  const surface = fakeSurface(); mountDrawDisplayAd({ ...surface }); surface.runTimer(); surface.runIdle();
  const host = surface.dock.children[0]; surface.doc.dialog = {}; surface.doc.dispatchEvent(new Event('toggle'));
  assert.equal(host.hidden, true); assert.equal(surface.dock.style.getPropertyValue('--draw-ad-lane-height'), '108px');
  surface.doc.dialog = null; surface.doc.dispatchEvent(new Event('close'));
  assert.equal(host.hidden, false); assert.equal(surface.dock.children[0], host); assert.equal(surface.shell.style.right, '');
});

test('ready wrapper reserves only after desktop CSS loads and two paint frames settle', () => {
  const surface = fakeSurface(); mountDrawDisplayAdWhenReady({ ...surface });
  assert.equal(surface.dock.style.getPropertyValue('--draw-ad-lane-height'), '');
  surface.desktopUiStyle.sheet = {}; surface.desktopUiStyle.dispatchEvent(new Event('load'));
  surface.runFrame(); assert.equal(surface.dock.style.getPropertyValue('--draw-ad-lane-height'), '');
  surface.runFrame(); assert.equal(surface.dock.style.getPropertyValue('--draw-ad-lane-height'), '108px');
  surface.runTimer(); surface.runIdle(); assert.equal(surface.dock.children[0].dataset.preview, 'true');
});

test('work input and disposal while startup is pending cancel without changing layout', () => {
  for (const abort of [s => s.root.dispatchEvent(new Event('pointerdown')), (_s, cleanup) => cleanup()]) {
    const surface = fakeSurface(); const cleanup = mountDrawDisplayAdWhenReady({ ...surface }); abort(surface, cleanup);
    surface.desktopUiStyle.sheet = {}; surface.desktopUiStyle.dispatchEvent(new Event('load'));
    assert.equal(surface.frames.size, 0); assert.equal(surface.timers.size, 0);
    assert.equal(surface.dock.style.getPropertyValue('--draw-ad-lane-height'), ''); assert.equal(surface.shell.style.right, '');
  }
});

test('the permanent dock banner has no storage dependency', () => {
  const surface = fakeSurface(); Object.defineProperty(surface.win, 'localStorage', { get() { throw Error('storage must not be read'); } });
  mountDrawDisplayAd({ ...surface }); surface.runTimer(); surface.runIdle();
  assert.equal(surface.dock.children[0].dataset.adState, 'filled');
});


test('the smaller desktop dock padding keeps a fully contained creative visible', () => {
  const surface = fakeSurface(); surface.dock.inset = 7;
  mountDrawDisplayAd({ ...surface }); surface.runTimer(); surface.runIdle(); surface.resize();
  assert.equal(surface.dock.children.length, 1);
  assert.equal(surface.dock.children[0].dataset.adState, 'filled');
  assert.equal(surface.dock.style.getPropertyValue('--draw-ad-lane-height'), '108px');
});


test('SDK load displays the hint until a visible unit is requested, then filled changes no dimensions', () => {
  const surface = fakeSurface(directQuery, production); const script = new EventTarget(); script.readyState = 'loading';
  let requests = 0;
  mountDrawDisplayAd({ ...surface, loadAdsense() { return { script, failed: false, errors: new Set() }; } });
  const before = layoutSnapshot(surface); assertHint(surface, 'loading');
  surface.runTimer(); surface.runIdle(); assertHint(surface, 'loading');
  surface.win.adsbygoogle = { push() {
    requests++;
    const { slot, hint, ins, label } = parts(surface);
    assert.equal(slot.hidden, false); assert.equal(hint.hidden, true); assert.equal(label.textContent, '広告');
    assert.ok(ins); assert.equal(ins.style.display, 'block');
  } };
  script.dispatchEvent(new Event('load'));
  assert.deepEqual(layoutSnapshot(surface), before);
  const { ins } = parts(surface); ins.dataset.adStatus = 'filled';
  surface.mutationObservers.find(observer => observer.target === ins).callback([]);
  assert.equal(parts(surface).host.dataset.adState, 'filled');
  assert.equal(parts(surface).hint.hidden, true); assert.equal(parts(surface).slot.hidden, false);
  assert.deepEqual(layoutSnapshot(surface), before); assert.equal(requests, 1);
});

test('late SDK load and late fill callbacks cannot replace fallback or make a second request', () => {
  for (const phase of ['sdk', 'response']) {
    const surface = fakeSurface(directQuery, production); const script = new EventTarget(); script.readyState = phase === 'sdk' ? 'loading' : 'complete';
    let requests = 0;
    if (phase === 'response') surface.win.adsbygoogle = { push() { requests++; } };
    mountDrawDisplayAd({ ...surface, loadAdsense() { return { script, failed: false, errors: new Set() }; } });
    const before = layoutSnapshot(surface); surface.runTimer(); surface.runIdle();
    const oldIns = parts(surface).ins, oldObserver = surface.mutationObservers.find(observer => observer.target === oldIns);
    surface.runTimer(); assertHint(surface);
    surface.win.adsbygoogle = { push() { requests++; } }; script.dispatchEvent(new Event('load'));
    if (oldIns) { oldIns.dataset.adStatus = 'filled'; oldObserver.callback([]); }
    surface.win.dispatchEvent(new Event('resize')); surface.resize(); mountDrawDisplayAd({ ...surface });
    assertHint(surface); assert.deepEqual(layoutSnapshot(surface), before); assert.equal(requests, phase === 'sdk' ? 0 : 1);
  }
});

test('initialization status cannot masquerade as a filled ad; optimized content remains a visible ad slot', () => {
  for (const status of ['done', 'unfill-optimized']) {
    const surface = fakeSurface(directQuery, production); const script = new EventTarget(); script.readyState = 'complete';
    surface.win.adsbygoogle = { push() {} };
    mountDrawDisplayAd({ ...surface, loadAdsense() { return { script, failed: false, errors: new Set() }; } });
    const before = layoutSnapshot(surface); surface.runTimer(); surface.runIdle();
    const { ins } = parts(surface);
    if (status === 'done') ins.dataset.adsbygoogleStatus = status; else ins.dataset.adStatus = status;
    surface.mutationObservers.find(observer => observer.target === ins).callback([]);
    if (status === 'done') { assert.equal(parts(surface).host.dataset.adState, 'loading'); surface.runTimer(); assertHint(surface); }
    else { assert.equal(parts(surface).host.dataset.adState, 'filled'); assert.equal(parts(surface).hint.hidden, true); assert.equal(parts(surface).slot.hidden, false); }
    assert.deepEqual(layoutSnapshot(surface), before);
  }
});

test('delayed preview changes the hint to an ad within the same reserved row', () => {
  const surface = fakeSurface('?drawAdPreview=delayed'); mountDrawDisplayAd({ ...surface });
  const before = layoutSnapshot(surface); assertHint(surface, 'loading'); surface.runTimer(); surface.runIdle();
  assertHint(surface, 'loading'); surface.runTimer(); assert.equal(parts(surface).host.dataset.adState, 'filled');
  assert.deepEqual(layoutSnapshot(surface), before);
});

test('autosave permission changes retain the hint row while mode exit still cleans it up', () => {
  for (const stage of ['before-request', 'filled']) {
    const surface = fakeSurface(directQuery, production); const script = new EventTarget(); script.readyState = 'complete';
    let requests = 0; surface.win.adsbygoogle = { push() { requests++; } };
    mountDrawDisplayAd({ ...surface, loadAdsense() { return { script, failed: false, errors: new Set() }; } });
    const before = layoutSnapshot(surface);
    if (stage === 'filled') {
      surface.runTimer(); surface.runIdle(); const { ins } = parts(surface); ins.dataset.adStatus = 'filled';
      surface.mutationObservers.find(observer => observer.target === ins).callback([]);
    }
    surface.win.location.search = directQuery + '&pxd=saved'; surface.win.history.state = { projectWorkspaceSelection: true };
    const bodyObserver = surface.mutationObservers.find(observer => observer.target === surface.body); bodyObserver.callback([]);
    assertHint(surface); assert.equal(parts(surface).host.dataset.adReason, 'private-context');
    assert.deepEqual(layoutSnapshot(surface), before); assert.equal(requests, stage === 'filled' ? 1 : 0);
    surface.body.dataset.creationMode = 'audio'; bodyObserver.callback([]);
    assert.equal(surface.dock.children.length, 0); assert.equal(surface.dock.style.getPropertyValue('--draw-ad-lane-height'), '');
  }
});

test('background-tab visibility alone never removes or changes the reserved row', () => {
  const surface = fakeSurface(directQuery, production);
  mountDrawDisplayAd({ ...surface }); const before = layoutSnapshot(surface);
  surface.doc.visibilityState = 'hidden'; surface.doc.dispatchEvent(new Event('visibilitychange')); surface.resize();
  assert.deepEqual(layoutSnapshot(surface), before); assertHint(surface, 'loading');
});


test('a late SDK load behind a dialog or hidden tab preserves the row without requesting an invisible ad', () => {
  for (const hide of [s => { s.doc.visibilityState = 'hidden'; }, s => { s.doc.dialog = {}; }, s => { parts(s).host.hidden = true; }]) {
    const surface = fakeSurface(directQuery, production); const script = new EventTarget(); script.readyState = 'loading'; let requests = 0;
    mountDrawDisplayAd({ ...surface, loadAdsense() { return { script, failed: false, errors: new Set() }; } });
    const before = layoutSnapshot(surface); surface.runTimer(); surface.runIdle(); hide(surface);
    surface.win.adsbygoogle = { push() { requests++; } }; script.dispatchEvent(new Event('load'));
    assertHint(surface); assert.equal(parts(surface).host.dataset.adReason, 'not-visible');
    assert.deepEqual(layoutSnapshot(surface), before); assert.equal(requests, 0);
  }
});


test('dispose during a stroke immediately releases the host, reservation, observers and listeners once', () => {
  for (const geometryFirst of [false, true]) {
    const surface = fakeSurface(); const outcomes = []; let layoutCalls = 0;
    const cleanup = mountDrawDisplayAd({ ...surface, onOutcome: value => outcomes.push(value), onLayout: () => { layoutCalls++; } });
    surface.runTimer(); surface.runIdle();
    const host = parts(surface).host; surface.canvas.dispatchEvent(new Event('pointerdown'));
    if (geometryFirst) {
      surface.dock.bounds.width = 240; surface.resize();
      assert.equal(host.hidden, true);
      assert.equal(surface.dock.style.getPropertyValue('--draw-ad-lane-height'), '108px', 'geometry alone still waits for the stroke end');
    }
    cleanup();
    assert.equal(host.removed, true); assert.equal(surface.dock.children.length, 0);
    assert.equal(surface.dock.style.getPropertyValue('--draw-ad-lane-height'), '');
    assert.ok(surface.resizeObservers.every(observer => observer.disconnected));
    assert.ok(surface.mutationObservers.every(observer => observer.disconnected));
    assert.equal(surface.timers.size, 0); assert.equal(surface.idles.size, 0);
    assert.deepEqual(outcomes, ['filled', 'disposed']);
    const afterCleanupCalls = layoutCalls;
    cleanup(); surface.canvas.dispatchEvent(new Event('pointerup')); surface.canvas.dispatchEvent(new Event('lostpointercapture'));
    surface.win.dispatchEvent(new Event('resize')); surface.resize();
    assert.equal(layoutCalls, afterCleanupCalls, 'released listeners cannot trigger another layout cleanup');
    assert.deepEqual(outcomes, ['filled', 'disposed']);
  }
});
