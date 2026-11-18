import test from 'node:test';
import assert from 'node:assert/strict';
import { isDrawMobileAnchorEligible, mountDrawMobileAnchor,
  mountDrawMobileAnchorWhenReady } from '../../js/ads/draw-mobile-anchor.mjs';

// Synthetic lifecycle tests; real browser display and Google ad demand remain separate checks.
class Element extends EventTarget {
  constructor(tag = 'DIV') {
    super(); this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = new Map(); this.className = '';
    this.classList = { contains: value => this.className.split(' ').includes(value) };
    this.style = { setProperty() { throw Error('must not reserve app space'); }, removeProperty() { throw Error('must not change layout'); } };
  }
  append(...nodes) { for (const node of nodes) { this.children.push(node); node.parentElement = this; } }
  remove() { this.removed = true; if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this); }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  getBoundingClientRect() { throw Error('must not measure provider or app geometry'); }
}
const production = { protocol: 'https:', hostname: 'pixieed.jp', origin: 'https://pixieed.jp',
  pathname: '/tools/start/draw/', search: '?workspace=1&runtime=direct&mode=draw', hash: '' };
const local = preview => ({ ...production, protocol: 'http:', hostname: 'localhost', origin: 'http://localhost:4173',
  search: `?workspace=1&runtime=direct&mode=draw&drawAdPreview=${preview}` });
function fixture(location = production) {
  const doc = new EventTarget(), win = new EventTarget(); doc.visibilityState = 'visible'; doc.fullscreenElement = null;
  doc.body = new Element('BODY'); doc.body.dataset.creationMode = 'draw'; doc.head = new Element('HEAD');
  doc.createElement = tag => new Element(tag.toUpperCase());
  const root = new Element(), link = new Element('LINK'); link.sheet = null;
  const timers = new Map(), idles = new Map(), frames = new Map(); let serial = 0;
  doc.querySelector = selector => {
    if (selector.startsWith('script[src*=')) return doc.head.children.find(node => node.tagName === 'SCRIPT') || null;
    if (selector.startsWith('link[rel=')) return link;
    if (selector === 'dialog[open]') return doc.dialog || null;
    if (selector.startsWith('[data-private-view]')) return doc.privateView || null;
    throw Error(`unexpected query ${selector}`);
  };
  doc.querySelectorAll = () => { throw Error('must not inspect Google units'); };
  win.top = win.self = win; win.location = { ...location }; win.history = { state: null };
  win.innerWidth = 390; win.innerHeight = 844;
  win.visualViewport = { width: 390, height: 844, scale: 1, offsetTop: 0, offsetLeft: 0 };
  win.setTimeout = (callback, delay) => { const id = ++serial; timers.set(id, { callback, delay }); return id; };
  win.clearTimeout = id => timers.delete(id);
  win.requestIdleCallback = callback => { const id = ++serial; idles.set(id, callback); return id; };
  win.cancelIdleCallback = id => idles.delete(id);
  win.requestAnimationFrame = callback => { const id = ++serial; frames.set(id, callback); return id; };
  win.cancelAnimationFrame = id => frames.delete(id);
  win.getComputedStyle = () => { throw Error('must not inspect Google units'); };
  win.MutationObserver = win.ResizeObserver = class { constructor() { throw Error('no ad geometry observers'); } };
  return { doc, win, root, link, timers, idles, frames,
    idle() { const entry = idles.entries().next().value; assert.ok(entry); idles.delete(entry[0]); entry[1](); },
    timer(delay) { const entry = [...timers].find(([, value]) => value.delay === delay); assert.ok(entry, `timer ${delay}`); timers.delete(entry[0]); entry[1].callback(); },
    frame() { const [id, callback] = frames.entries().next().value; frames.delete(id); callback(); } };
}
const script = s => s.doc.head.children.find(node => node.tagName === 'SCRIPT');

test('mobile gate allows only fresh, sufficiently tall, visible top-level Draw', () => {
  const base = { ...production, topLevel: true, mode: 'draw', viewportWidth: 390, viewportHeight: 844 };
  assert.equal(isDrawMobileAnchorEligible(base), true);
  for (const patch of [{ viewportWidth: 319 }, { viewportWidth: 1001 }, { viewportHeight: 619 },
    { search: '?pxd=private' }, { search: '?workspace=1&runtime=direct' }, { hash: '#private' },
    { search: production.search + '&workspace=1' }, { origin: 'https://elsewhere.test' },
    { protocol: 'http:' }, { pathname: '/audio/' }, { topLevel: false }, { mode: 'audio' },
    { desktop: true }, { fullscreen: true }, { privateView: true }, { pageVisible: false },
    { visualViewport: { width: 390, height: 400, offsetTop: 0, offsetLeft: 0, scale: 1 } },
    { visualViewport: { width: 390, height: 844, offsetTop: 0, offsetLeft: 0, scale: 1.2 } }]) {
    assert.equal(isDrawMobileAnchorEligible({ ...base, ...patch }), false, JSON.stringify(patch));
  }
});

test('loads the official regular-bottom script without app space, hints, ins or layout callbacks', () => {
  const s = fixture(); let layouts = 0; mountDrawMobileAnchor({ ...s, onLayout: () => layouts++ });
  assert.equal(script(s), undefined); assert.equal(s.doc.body.children.length, 0);
  assert.equal(s.doc.body.getAttribute('data-draw-mobile-ad'), null);
  const append = s.doc.head.append.bind(s.doc.head);
  s.doc.head.append = sdk => {
    assert.equal(sdk.getAttribute('data-overlays'), 'collapsed-bottom');
    assert.equal(s.doc.body.getAttribute('data-draw-mobile-ad'), 'true', 'display permission exists before SDK insertion'); append(sdk);
  };
  s.idle(); const sdk = script(s);
  assert.equal(sdk.async, true); assert.equal(sdk.crossOrigin, 'anonymous');
  assert.match(sdk.src, /adsbygoogle\.js\?client=ca-pub-\d{16}$/);
  sdk.dispatchEvent(new Event('load')); s.win.dispatchEvent(new Event('resize'));
  assert.equal(layouts, 0); assert.equal(s.doc.body.children.length, 0); assert.equal(s.win.adsbygoogle, undefined);
  assert.equal(s.timers.size, 0);
});

test('existing SDKs and queues are never reconfigured or duplicated', () => {
  for (const kind of ['script', 'queue']) {
    const s = fixture(); const existing = new Element('SCRIPT'); existing.src = 'existing'; existing.setAttribute('data-overlays', 'bottom');
    if (kind === 'script') s.doc.head.append(existing); else s.win.adsbygoogle = [];
    const outcomes = []; mountDrawMobileAnchor({ ...s, onOutcome: value => outcomes.push(value) }); s.idle();
    assert.deepEqual(outcomes, ['existing-sdk']); assert.equal(s.doc.head.children.length, kind === 'script' ? 1 : 0);
    assert.equal(existing.getAttribute('data-overlays'), 'bottom'); assert.equal(s.doc.body.getAttribute('data-draw-mobile-ad'), null);
  }
});

test('SDK error and timeout produce no retry, hint, layout change or late success', () => {
  for (const reason of ['sdk-error', 'sdk-timeout']) {
    const s = fixture(), outcomes = []; const cleanup = mountDrawMobileAnchor({ ...s, onOutcome: value => outcomes.push(value) }); s.idle();
    const sdk = script(s);
    if (reason === 'sdk-error') sdk.dispatchEvent(new Event('error')); else s.timer(10000);
    sdk.dispatchEvent(new Event('load')); mountDrawMobileAnchor(s);
    assert.deepEqual(outcomes, [reason]); assert.equal(s.doc.head.children.length, 1);
    assert.equal(s.doc.body.children.length, 0); assert.equal(s.idles.size, 0); assert.equal(s.timers.size, 0);
    cleanup(); assert.equal(sdk.removed, undefined); assert.equal(s.doc.body.getAttribute('data-draw-mobile-ad'), 'true');
  }
});

test('private markers, hidden tabs, dialogs or short screens before idle prevent the SDK', () => {
  for (const mutate of [s => { s.win.history.state = { pxd: 'private' }; },
    s => { s.win.location.search += '&token=private'; }, s => { s.doc.visibilityState = 'hidden'; },
    s => { s.doc.dialog = {}; }, s => { s.win.innerHeight = 500; }]) {
    const s = fixture(); mountDrawMobileAnchor(s); mutate(s); s.idle();
    assert.equal(script(s), undefined); assert.equal(s.doc.body.children.length, 0);
    assert.equal(s.doc.body.getAttribute('data-draw-mobile-ad'), null);
  }
});

test('first work input cancels an SDK that has not started', () => {
  for (const type of ['pointerdown', 'keydown', 'beforeinput', 'paste']) {
    const s = fixture(); mountDrawMobileAnchor(s); s.root.dispatchEvent(new Event(type));
    assert.equal(s.idles.size, 0); assert.equal(script(s), undefined);
    mountDrawMobileAnchor(s); assert.equal(s.idles.size, 0);
  }
});

test('dispose cancels only owned work; an inserted SDK and its display permission survive', () => {
  const before = fixture(); const cancel = mountDrawMobileAnchor(before); cancel(); cancel();
  assert.equal(before.idles.size, 0); assert.equal(script(before), undefined);
  const s = fixture(); const cleanup = mountDrawMobileAnchor(s); s.idle(); const sdk = script(s);
  cleanup(); cleanup(); assert.equal(sdk.removed, undefined); assert.equal(s.doc.body.getAttribute('data-draw-mobile-ad'), 'true');
  assert.equal(s.timers.size, 0); mountDrawMobileAnchor(s); assert.equal(s.doc.head.children.length, 1);
  assert.equal(s.idles.size, 0);
});

test('local filled and delayed previews create only a closeable fixture without changing layout', () => {
  for (const mode of ['filled', 'delayed']) {
    const s = fixture(local(mode)); let layouts = 0; const cleanup = mountDrawMobileAnchor({ ...s, onLayout: () => layouts++ }); s.idle();
    if (mode === 'delayed') { assert.equal(s.doc.body.children.length, 0); s.timer(1800); }
    const stub = s.doc.body.children[0]; assert.equal(stub.className, 'draw-mobile-ad-preview');
    assert.equal(stub.children[0].className, 'draw-mobile-ad-preview__label');
    assert.equal(stub.children[1].className, 'draw-mobile-ad-preview__close');
    stub.children[1].dispatchEvent(new Event('click'));
    assert.equal(s.doc.body.children.length, 0); assert.equal(layouts, 0); assert.equal(script(s), undefined);
    assert.equal(s.doc.body.getAttribute('data-draw-mobile-ad'), null); cleanup();
  }
});

test('unfilled and blocked previews render nothing and never access the network', () => {
  for (const mode of ['unfilled', 'blocked']) {
    const s = fixture(local(mode)); mountDrawMobileAnchor(s); s.idle();
    assert.equal(s.doc.body.children.length, 0); assert.equal(script(s), undefined); assert.equal(s.timers.size, 0);
  }
});

test('preview is explicit and localhost-only; off and short initial views are inactive', () => {
  for (const location of [local('off'), { ...production, search: '?drawAdPreview=filled' },
    { ...local('filled'), search: '?drawAdPreview=filled&drawAdPreview=filled' }]) {
    const s = fixture(location); mountDrawMobileAnchor(s); assert.equal(s.idles.size, 0); assert.equal(s.doc.body.children.length, 0);
  }
  const s = fixture(); s.win.innerHeight = 500; mountDrawMobileAnchor(s); assert.equal(s.idles.size, 0);
});

test('startup waits for CSS and two frames, and input cancels pending startup', () => {
  const s = fixture(); const cleanup = mountDrawMobileAnchorWhenReady(s);
  assert.equal(s.idles.size, 0); s.link.sheet = {}; s.link.dispatchEvent(new Event('load'));
  s.frame(); assert.equal(s.idles.size, 0); s.frame(); assert.equal(s.idles.size, 1); cleanup(); assert.equal(s.idles.size, 0);
  const early = fixture(); mountDrawMobileAnchorWhenReady(early); early.root.dispatchEvent(new Event('pointerdown'));
  early.link.sheet = {}; early.link.dispatchEvent(new Event('load'));
  assert.equal(early.frames.size, 0); assert.equal(early.idles.size, 0);
});

test('BFCache preserves provider ownership without a geometry observer or restoration callback', () => {
  const s = fixture(); mountDrawMobileAnchor(s); s.idle(); const sdk = script(s);
  s.win.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: true }));
  s.win.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
  assert.equal(s.doc.body.getAttribute('data-draw-mobile-ad'), 'true'); assert.equal(sdk.removed, undefined);
  assert.equal(s.doc.head.children.length, 1); assert.equal(s.doc.body.children.length, 0);
});


function approvedSdk() {
  const sdk = new Element('SCRIPT');
  sdk.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9801602250480253';
  sdk.setAttribute('data-overlays', 'collapsed-bottom'); sdk.setAttribute('data-draw-mobile-anchor', 'true');
  return sdk;
}

test('an approved chooser SDK is reused synchronously with only body display permission', () => {
  for (const readyState of ['loading', 'complete']) {
    const s = fixture(), sdk = approvedSdk(), outcomes = []; sdk.readyState = readyState; s.doc.head.append(sdk);
    const before = [...sdk.attributes]; sdk.setAttribute = () => { throw Error('existing SDK must not be changed'); };
    s.win.adsbygoogle = { push() { throw Error('no new ad request'); } };
    const cleanup = mountDrawMobileAnchor({ ...s, onOutcome: value => outcomes.push(value) });
    assert.deepEqual(outcomes, ['existing-anchor']); assert.equal(s.doc.body.getAttribute('data-draw-mobile-ad'), 'true');
    assert.equal(s.idles.size, 0); assert.equal(s.timers.size, 0); assert.equal(s.doc.head.children.length, 1);
    assert.deepEqual([...sdk.attributes], before); assert.equal(s.doc.body.children.length, 0);
    cleanup(); assert.equal(sdk.removed, undefined); assert.equal(s.doc.body.getAttribute('data-draw-mobile-ad'), 'true');
  }
});

test('a chooser SDK inserted during idle is reused without a duplicate SDK or request', () => {
  const s = fixture(), outcomes = []; mountDrawMobileAnchor({ ...s, onOutcome: value => outcomes.push(value) });
  s.doc.head.append(approvedSdk()); s.idle();
  assert.deepEqual(outcomes, ['existing-anchor']); assert.equal(s.doc.head.children.length, 1);
  assert.equal(s.doc.body.getAttribute('data-draw-mobile-ad'), 'true'); assert.equal(s.win.adsbygoogle, undefined);
});

test('adoption requires both approvals, the exact publisher and the official SDK origin', () => {
  for (const mutate of [sdk => sdk.attributes.delete('data-overlays'), sdk => sdk.attributes.delete('data-draw-mobile-anchor'),
    sdk => sdk.setAttribute('data-overlays', 'bottom'), sdk => { sdk.src = sdk.src.replace('9801602250480253', '1111111111111111'); },
    sdk => { sdk.src = sdk.src.replace('pagead2.googlesyndication.com', 'untrusted.test'); },
    sdk => { sdk.src = sdk.src.replace('pagead2.googlesyndication.com', 'pagead2.googlesyndication.com:8443'); },
    sdk => { sdk.src += '&client=ca-pub-9801602250480253'; }]) {
    const s = fixture(), sdk = approvedSdk(); mutate(sdk); s.doc.head.append(sdk);
    mountDrawMobileAnchor(s); s.idle();
    assert.equal(s.doc.body.getAttribute('data-draw-mobile-ad'), null); assert.equal(s.doc.head.children.length, 1);
  }
  const privatePage = fixture(); privatePage.doc.head.append(approvedSdk()); privatePage.win.history.state = { pxd: 'private' };
  mountDrawMobileAnchor(privatePage); assert.equal(privatePage.doc.body.getAttribute('data-draw-mobile-ad'), null);
  assert.equal(privatePage.idles.size, 0);
});
