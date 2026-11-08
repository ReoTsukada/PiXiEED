import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { projectGalleryAdConfig } from '../../data/project-gallery-ad-config.mjs';
import {
  getProjectGalleryAdLayout, isProjectGalleryAdEligible, mountProjectGalleryAd,
  PROJECT_GALLERY_AD_MIN_GAP, resolveProjectGalleryAdUnit,
} from '../../js/ads/project-gallery-ad.mjs';
import { hasCompleteProjectArtwork } from '../../js/creation/project-start-picker.mjs?rev=20261108-gallery-first-ad-1';

const base = { config: projectGalleryAdConfig, origin: 'https://pixieed.jp', protocol: 'https:',
  pathname: '/tools/start/draw/', search: '?workspace=1', hash: '', topLevel: true,
  chooserVisible: true, settled: true, hasVisibleItems: true, hasValidArtwork: true, searching: false, hasErrors: false,
  busy: false, editor: false, fullscreen: false, privateContext: false, pageVisible: true };

class FakeElement extends EventTarget {
  constructor(tag, doc, rect = {}) {
    super(); this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.dataset = {}; this.style = {};
    this.children = []; this.attributes = {}; this.hidden = false; this.isConnected = true;
    this.parentElement = null; this.rect = { left: 8, top: 100, right: 308, bottom: 220, width: 300, height: 120, ...rect };
    this.clientWidth = this.rect.width; this.clientHeight = this.rect.height; this.offsetHeight = this.rect.height;
    this.scrollHeight = this.rect.height; this.open = true; this.disabled = false;
  }
  append(...nodes) { for (const node of nodes) this.insertBefore(node, null); }
  insertBefore(node, before) {
    if (node.parentElement) node.parentElement.children = node.parentElement.children.filter(item => item !== node);
    const index = before ? this.children.indexOf(before) : -1;
    if (index < 0) this.children.push(node); else this.children.splice(index, 0, node);
    node.parentElement = this; node.ownerDocument ||= this.ownerDocument; node.isConnected = this.isConnected; return node;
  }
  replaceChildren(...nodes) {
    for (const child of this.children) { child.parentElement = null; child.isConnected = false; }
    this.children = []; this.append(...nodes);
  }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(item => item !== this);
    this.parentElement = null;
    const markDisconnected = node => { node.isConnected = false; for (const child of node.children || []) markDisconnected(child); };
    markDisconnected(this);
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  contains(node) { return this === node || this.children.some(child => child.contains?.(node)); }
  querySelector(selector) {
    if (selector.includes('.project-gallery__tile')) return this.children.find(child => child.className?.includes('project-gallery__tile')) || null;
    return null;
  }
  querySelectorAll(selector) {
    if (selector.includes('.project-gallery__tile canvas')) return this.children.flatMap(tile =>
      tile.className?.includes('project-gallery__tile') ? tile.children.filter(child => child.tagName === 'CANVAS') : []);
    if (selector.includes('.project-gallery__tile')) return this.children.filter(child => child.className?.includes('project-gallery__tile'));
    if (selector.includes('button, input')) return this.ownerDocument?.controls || [];
    return [];
  }
  getClientRects() { return this.isConnected && !this.hidden && this.rect.width > 0 && this.rect.height > 0 ? [{}] : []; }
  getBoundingClientRect() { return { ...this.rect }; }
}


function fixture({ url = 'https://pixieed.jp/tools/start/draw/?workspace=1', width = 320, height = 844,
  hiddenDialog = false, zeroSlot = false, frame = false, tileVisible = true, tileCount = 4, scrollHeight = 700,
  historyState = { pixieedWorkspace: true } } = {}) {
  let loaderCalls = 0;
  const observers = [];
  class FixtureMutationObserver {
    constructor(callback) { this.callback = callback; this.disconnected = false; }
    observe(target) { this.target = target; observers.push(this); }
    disconnect() { this.disconnected = true; }
  }
  const doc = new EventTarget();
  const dialog = new FakeElement('dialog', doc, { left: 2, top: 72, right: width - 2, bottom: 772, width: width - 4, height: 700 });
  dialog.clientWidth = width - 6; dialog.clientHeight = 700; dialog.scrollHeight = scrollHeight; dialog.hidden = hiddenDialog;
  const scroller = new FakeElement('div', doc, { left: 10, top: 240, right: width - 10, bottom: 490, width: width - 20, height: 250 });
  scroller.clientWidth = width - 20; scroller.clientHeight = 250; scroller.offsetHeight = 250; scroller.style.maxHeight = '';
  const list = new FakeElement('div', doc); scroller.append(list);
  const tiles = [];
  const tilePositions = [[12, 250], [110, 250], [208, 250], [12, 350], [110, 350], [208, 350]];
  for (let i = 0; i < tileCount; i++) {
    const [left, top] = tilePositions[i % tilePositions.length];
    const tile = new FakeElement('button', doc, { left, top: tileVisible ? top : 200, right: left + 90, bottom: tileVisible ? top + 90 : 290, width: 90, height: 90 });
    tile.className = 'project-gallery__tile';
    const canvas = new FakeElement('canvas', doc, { left, top: tileVisible ? top : 200, right: left + 90, bottom: tileVisible ? top + 90 : 290, width: 90, height: 90 });
    tile.append(canvas); list.append(tile); tiles.push(tile);
  }
  const tile = tiles[0];
  const fresh = new FakeElement('button', doc, { left: 110, top: 520, right: 210, bottom: 568, width: 100, height: 48 });
  const host = new FakeElement('section', doc, { left: 10, top: 616, right: width - 10, bottom: 736, width: width - 20, height: 120 });
  host.hidden = true;
  const label = new FakeElement('p', doc, { left: 10, top: 616, right: width - 10, bottom: 632, width: width - 20, height: 16 });
  const slot = new FakeElement('div', doc, { left: 10, top: 636, right: zeroSlot ? 10 : width - 10, bottom: 736, width: zeroSlot ? 0 : width - 20, height: 100 });
  host.append(label, slot); dialog.append(scroller, fresh, host);
  doc.controls = [...tiles, fresh];
  Object.assign(doc, { body: { classList: { contains: () => false } }, documentElement: { dataset: { toolDirect: 'chooser' }, hasAttribute: () => false },
    visibilityState: 'visible', fullscreenElement: null,
    createElement(tag) { return new FakeElement(tag, doc, { left: 10, top: 636, right: width - 10, bottom: 736, width: width - 20, height: 100 }); },
    querySelector() { return null; } });
  const win = Object.assign(new EventTarget(), { location: new URL(url), history: { state: historyState }, innerWidth: width, innerHeight: height,
    MutationObserver: FixtureMutationObserver, getComputedStyle(element) {
      if (element === dialog) return { paddingLeft: width <= 340 ? '4px' : '14px', paddingRight: width <= 340 ? '4px' : '14px', borderTopWidth: '1px', borderBottomWidth: '1px' };
      if (element === scroller) return { maxHeight: '295px' };
      return { visibility: 'visible' };
    }, adsbygoogle: [] });
  win.top = frame ? {} : win; win.self = win;
  const script = new EventTarget(); script.isConnected = true; script.readyState = undefined;
  const loader = { script, errors: new Set(), failed: false };
  return { doc, win, dialog, scroller, list, tile, tiles, fresh, host, slot, loader,
    get pushes() { return win.adsbygoogle?.length || 0; }, get loaderCalls() { return loaderCalls; },
    mount(config = projectGalleryAdConfig, flags = {}) {
      return mountProjectGalleryAd({ doc, win, dialog, scroller, list, primaryAction: fresh, host, slot, config,
        galleryState: { settled: true, hasVisibleItems: true, hasValidArtwork: true, searching: false, hasErrors: false, busy: false, ...flags },
        loadAdsense() { loaderCalls++; return loader; } });
    },
    loadSdk() { script.dispatchEvent(new Event('load')); },
    failSdk() { script.dispatchEvent(new Event('error')); },
    setStatus(status) {
      const ins = slot.children[0]; assert.ok(ins, 'a fixed unit exists while the SDK placement is active');
      ins.dataset.adStatus = status;
      // Test hook calls every connected mutation observer owned by this fixture.
      for (const observer of observers) if (observer.target === ins && !observer.disconnected) observer.callback();
      return ins;
    } };
}
const validUnit = projectGalleryAdConfig.unit;
const preview = (width = 2, height = 3, rgb = new Uint8Array(width * height * 3)) => ({ summary: { thumbnail: { width, height, rgb } } });
test('publisher-content gate requires valid RGB previews for every loaded project without reading pixel values', () => {
  assert.equal(hasCompleteProjectArtwork([]), false);
  assert.equal(hasCompleteProjectArtwork([{}]), false);
  assert.equal(hasCompleteProjectArtwork([preview()]), true);
  assert.equal(hasCompleteProjectArtwork([preview(), preview(1, 1)]), true);
  assert.equal(hasCompleteProjectArtwork([preview(), {}]), false);
  assert.equal(hasCompleteProjectArtwork([{}, preview()]), false);
  assert.equal(hasCompleteProjectArtwork([preview(2, 3, new Uint8Array(17))]), false);
  assert.equal(hasCompleteProjectArtwork([preview(0, 3)]), false);
  assert.equal(hasCompleteProjectArtwork([preview(2, Infinity, new Uint8Array(0))]), false);
  assert.equal(hasCompleteProjectArtwork([preview(1.5, 2, new Uint8Array(12))]), false);
});

test('config is isolated and resolves only the known fixed display unit', () => {
  assert.equal(projectGalleryAdConfig.enabled, true);
  assert.deepEqual(resolveProjectGalleryAdUnit(projectGalleryAdConfig), { client: 'ca-pub-9801602250480253', slot: '8825932060' });
  for (const patch of [{ enabled: false }, { unit: { ...validUnit, verifiedActive: false } },
    { unit: { ...validUnit, format: 'rewarded' } }, { unit: { ...validUnit, placement: 'gutter' } },
    { unit: { ...validUnit, size: 'responsive' } }, { unit: { ...validUnit, client: 'bad' } },
    { unit: { ...validUnit, slot: 'project-id' } }]) {
    assert.equal(resolveProjectGalleryAdUnit({ ...projectGalleryAdConfig, ...patch }), null);
  }
});

test('production chooser eligibility allows only exact known routes and non-sensitive singleton flags', () => {
  assert.equal(isProjectGalleryAdEligible(base), true);
  assert.equal(isProjectGalleryAdEligible({ ...base, origin: 'https://www.pixieed.jp' }), true);
  assert.equal(isProjectGalleryAdEligible({ ...base, search: '?social=1&workspace=1' }), true);
  for (const patch of [
    { origin: 'http://pixieed.jp' }, { origin: 'http://localhost:4173' },
    { origin: 'https://preview.pixieed.jp' }, { origin: 'https://pixieed.jp:444' },
    { pathname: '/tools/start/draw' }, { pathname: '/tools/start/not-a-tool/' },
    { pathname: '/output/work/' }, { search: '?pxd=private-id' }, { search: '?unknown=1' },
    { search: '?social=1&social=1' }, { search: '?workspace=2' }, { hash: '#project' },
    { topLevel: false }, { chooserVisible: false }, { settled: false }, { hasVisibleItems: false },
    { searching: true }, { hasErrors: true }, { busy: true }, { editor: true }, { hasValidArtwork: false },
    { fullscreen: true }, { privateContext: true }, { pageVisible: false },
  ]) assert.equal(isProjectGalleryAdEligible({ ...base, ...patch }), false, JSON.stringify(patch));
  assert.equal(isProjectGalleryAdEligible(), false);
});

test('fixed banner selection never shrinks below accepted standard sizes', () => {
  assert.equal(PROJECT_GALLERY_AD_MIN_GAP, 48);
  assert.deepEqual(getProjectGalleryAdLayout(728), { width: 728, height: 90 });
  assert.deepEqual(getProjectGalleryAdLayout(468), { width: 468, height: 60 });
  assert.deepEqual(getProjectGalleryAdLayout(320), { width: 320, height: 100 });
  assert.deepEqual(getProjectGalleryAdLayout(300), { width: 300, height: 100 });
  assert.equal(getProjectGalleryAdLayout(299), null);
  assert.equal(getProjectGalleryAdLayout(NaN), null);
});

test('SDK load produces one request only after geometry is visible and leaves filled creatives intact', () => {
  const f = fixture();
  const result = f.mount();
  assert.equal(result.mounted, true); assert.equal(result.requested, false);
  assert.equal(f.loaderCalls, 1); assert.equal(f.pushes, 0);
  assert.equal(f.host.hidden, false); assert.equal(f.host.dataset.adWidth, '300');
  assert.equal(f.slot.dataset.adLayout, '300x100');
  assert.equal(f.scroller.style.maxHeight, '248px');
  f.loadSdk(); f.loadSdk();
  assert.equal(result.requested, true); assert.equal(f.pushes, 1, 'repeated SDK load signals never duplicate a unit');
  const ins = f.slot.children[0]; assert.equal(ins.dataset.adClient, validUnit.client); assert.equal(ins.dataset.adSlot, validUnit.slot);
  f.setStatus('filled'); assert.equal(f.host.dataset.adState, 'filled'); assert.equal(ins.isConnected, true);
  result.retire('selection'); assert.equal(result.retired, true); assert.equal(ins.isConnected, false);
  assert.equal(f.host.hidden, false, 'retirement preserves measured space while the dialog remains open');
  f.loadSdk(); assert.equal(f.pushes, 1);
});

test('unfilled unit remains reserved; an SDK error is terminal and cannot push after late load', () => {
  const unfilled = fixture(); const visible = unfilled.mount(); unfilled.loadSdk();
  unfilled.setStatus('unfilled'); assert.equal(unfilled.host.dataset.adState, 'unfilled');
  assert.equal(unfilled.host.hidden, false); visible.retire('search');

  const failed = fixture(); const failedResult = failed.mount(); failed.failSdk();
  assert.equal(failed.host.dataset.adState, 'error'); assert.equal(failed.host.hidden, false);
  assert.equal(failed.slot.children.length, 0);
  failed.loadSdk(); assert.equal(failed.pushes, 0); assert.equal(failedResult.retired, false);
});

test('retiring while the SDK is still loading removes the pending callback before any push', () => {
  const f = fixture(); const result = f.mount();
  result.retire('cancel'); f.loadSdk();
  assert.equal(result.retired, true); assert.equal(result.requested, false); assert.equal(f.pushes, 0);
  assert.equal(f.host.hidden, false, 'open dialog keeps its reserved geometry during cancellation');
});

test('retired open dialog restores its original scroller height after close', () => {
  const f = fixture(); f.scroller.style.maxHeight = '500px';
  const result = f.mount(); assert.equal(result.mounted, true);
  result.retire('cancel');
  assert.equal(f.scroller.style.maxHeight, '248px');
  assert.equal(f.host.hidden, false);
  f.dialog.open = false; f.dialog.dispatchEvent(new Event('close'));
  assert.equal(f.host.hidden, true);
  assert.equal(f.scroller.style.maxHeight, '500px');
});

for (const options of [
  { url: 'http://pixieed.jp/tools/start/draw/?workspace=1' },
  { url: 'https://preview.pixieed.jp/tools/start/draw/?workspace=1' },
  { url: 'https://pixieed.jp/tools/start/draw/?pxd=private-id' },
  { url: 'https://pixieed.jp/tools/start/draw/?workspace=1#project' },
  { url: 'https://pixieed.jp/tools/start/draw/?workspace=1', frame: true },
]) {
  test(`ineligible production context creates neither SDK loader nor request: ${options.url}`, () => {
    const f = fixture(options); const result = f.mount();
    assert.equal(result.mounted, false); assert.equal(f.loaderCalls, 0); assert.equal(f.pushes, 0);
  });
}

test('publisher artwork area must meet the fixed ad area before loading and again before push', () => {
  const oneSmallTile = fixture({ tileCount: 1 });
  const omitted = oneSmallTile.mount();
  assert.equal(omitted.mounted, false); assert.equal(oneSmallTile.loaderCalls, 0); assert.equal(oneSmallTile.pushes, 0);
  assert.equal(oneSmallTile.host.hidden, true); assert.equal(oneSmallTile.scroller.style.maxHeight, '');

  const enoughArtwork = fixture({ tileCount: 4 });
  const eligible = enoughArtwork.mount();
  assert.equal(eligible.mounted, true); assert.equal(enoughArtwork.loaderCalls, 1);
  // If visible artwork drops below the threshold before the SDK resolves, no unit is requested.
  for (const tile of enoughArtwork.tiles.slice(1)) tile.remove();
  enoughArtwork.loadSdk();
  assert.equal(eligible.retired, true); assert.equal(eligible.requested, false); assert.equal(enoughArtwork.pushes, 0);
});

test('empty, loading, error, search, editor, and zero-size states fail before SDK setup', () => {
  for (const flags of [
    { settled: false }, { hasVisibleItems: false }, { hasErrors: true }, { searching: true },
    { busy: true },
  ]) {
    const f = fixture(); assert.equal(f.mount(projectGalleryAdConfig, flags).mounted, false);
    assert.equal(f.loaderCalls, 0); assert.equal(f.pushes, 0);
  }
  const hidden = fixture({ hiddenDialog: true });
  assert.equal(hidden.mount().mounted, false); assert.equal(hidden.loaderCalls, 0);
  const noTile = fixture({ tileVisible: false });
  assert.equal(noTile.mount().mounted, false); assert.equal(noTile.loaderCalls, 0);
  const zero = fixture({ zeroSlot: true });
  assert.equal(zero.mount().mounted, false); assert.equal(zero.loaderCalls, 0);
});


test('known preloaded SDK pushes immediately only from a proven loaded state', () => {
  const f = fixture(); const loadedScript = new EventTarget(); loadedScript.isConnected = true; loadedScript.readyState = 'complete';
  f.doc.querySelector = selector => selector.startsWith('script[src') ? loadedScript : null;
  f.loader.script = loadedScript;
  const result = f.mount();
  assert.equal(result.requested, true); assert.equal(f.pushes, 1);
  loadedScript.dispatchEvent(new Event('load')); assert.equal(f.pushes, 1);
});

test('a route/history change retires the pending SDK callback even when the next route is also allowlisted', () => {
  const f = fixture(); const result = f.mount();
  f.win.location = new URL('https://pixieed.jp/audio/?workspace=1');
  f.win.dispatchEvent(new Event('popstate'));
  f.loadSdk();
  assert.equal(result.retired, true); assert.equal(result.requested, false); assert.equal(f.pushes, 0);
});

test('reopening a picker document cannot mount or request a second unit', () => {
  const f = fixture(); const first = f.mount(); f.loadSdk();
  const second = f.mount();
  assert.equal(second, first); assert.equal(f.loaderCalls, 1); assert.equal(f.pushes, 1);
});

test('picker integration mounts only after settled nonempty success and retires before every control interaction', async () => {
  const source = await readFile(new URL('../../js/creation/project-start-picker.mjs', import.meta.url), 'utf8');
  const prepareStart = source.indexOf('  function prepareGalleryAd(artworkCount)');
  const prepareEnd = source.indexOf('  async function show()', prepareStart);
  const prepare = source.slice(prepareStart, prepareEnd);
  const chooseStart = source.indexOf('  async function choose(value)');
  const chooseEnd = source.indexOf('  gallery = mountProjectGallery', chooseStart);
  const choose = source.slice(chooseStart, chooseEnd);
  assert.match(source, /if \(!errors\?\.length && projects\.length > 0 && hasValidArtwork\) prepareGalleryAd\(projects\.length\)/);
  assert.match(source, /dialog\.append\(header, intro, search, status, count, retry, scroller, actions\)/);
  assert.match(prepare, /galleryState: \{ settled: true, libraryVisible: true, enoughArtwork: true, searching: false, hasErrors: false, busy: false \}/);
  assert.doesNotMatch(prepare, /projectId|revisionId|thumbnail|summary|search\.value/);
  assert.ok(choose.indexOf("retireGalleryAd('selection')") < choose.indexOf('setBusy(true)'));
  assert.ok(choose.indexOf("retireGalleryAd('selection')") < choose.indexOf('await onChoose(value)'));
  for (const marker of ["retireGalleryAd('search')", "retireGalleryAd('cancel')", "retireGalleryAd('interaction')", "retireGalleryAd('dispose')"]) assert.ok(source.includes(marker), marker);
});

test('an ineligible first mount permanently locks this document against later navigation-based remounts', () => {
  const f = fixture({ url: 'https://pixieed.jp/tools/start/draw/?pxd=private-id' });
  const first = f.mount();
  f.win.location = new URL('https://pixieed.jp/tools/start/audio/?workspace=1');
  const later = f.mount();
  assert.equal(first, later); assert.equal(f.loaderCalls, 0); assert.equal(f.pushes, 0);
});
