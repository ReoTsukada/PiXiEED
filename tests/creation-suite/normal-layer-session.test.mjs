import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawDocument } from '../../js/creation/draw-core.mjs';
import { createDrawAnimationSession, prepareDrawNormalLayer } from '../../js/creation/draw-animation-session.mjs';
import { mountAnimationControls } from '../../js/creation/animation-controls.mjs';
import {
  NORMAL_MAP_PALETTE,
  addAnimationFrame,
  addAnimationLayer,
  composeAnimationFrameRgba,
  writeAnimationCel,
  ensureAnimationNormalLayer,
  getAnimationCelDocument,
  resizeAnimation,
  setLayerProperties
} from '../../js/creation/animation-core.mjs';

const rgbaColor = color => [1, 3, 5].map(offset => Number.parseInt(color.slice(offset, offset + 2), 16)).concat(color.length === 9 ? Number.parseInt(color.slice(7), 16) : 255);
const pixel = (image, index) => [...image.rgba.slice(index * 4, index * 4 + 4)];

test('normal cel uses its fixed palette without changing art palette or ordinary composition', () => {
  const draw = createDrawDocument(16);
  const session = createDrawAnimationSession(draw);
  const artLayer = session.animation.layers[0].id;
  const art = session.document();
  art.pixels[0] = 2;
  session.commitDocument(art);
  const artPaletteBefore = [...session.animation.palette];

  const timeline = ensureAnimationNormalLayer(session.animation);
  const normalLayer = timeline.layers.find((layer) => layer.role === 'normal');
  session.apply(timeline, { frameId: session.frameId, layerId: normalLayer.id });

  const normal = session.document();
  assert.deepEqual(normal.palette, NORMAL_MAP_PALETTE);
  normal.pixels[1] = 5;
  normal.pixels[2] = 16;
  session.commitDocument(normal);

  assert.deepEqual(session.animation.palette, artPaletteBefore, 'normal drawing never replaces or reorders the shared art palette');
  assert.equal(getAnimationCelDocument(session.animation, session.frameId, artLayer).pixels[0], 2, 'existing art indices survive normal edits');
  assert.deepEqual(session.document().palette, NORMAL_MAP_PALETTE, 'normal selection restores its independent palette');
  assert.equal(session.document().pixels[1], 5);

  const normalComposite = session.composite(session.document());
  assert.deepEqual(pixel(normalComposite, 0), rgbaColor(artPaletteBefore[2]), 'transparent normal pixels reveal the underlying art');
  assert.deepEqual(pixel(normalComposite, 1), rgbaColor(NORMAL_MAP_PALETTE[5]));
  assert.deepEqual(pixel(normalComposite, 2), rgbaColor(NORMAL_MAP_PALETTE[16]));

  session.select(session.frameId, artLayer);
  const artComposite = session.composite(session.document());
  assert.deepEqual(artComposite.palette, artPaletteBefore);
  assert.equal(artComposite.pixels[0], 2);
  assert.equal(artComposite.pixels[1], -1, 'normal cel pixels are excluded from ordinary art composition');
});

test('normal visibility, undo, redo, frame duplication, and resize preserve the separate cel', () => {
  const session = createDrawAnimationSession(createDrawDocument(16));
  const artLayer = session.animation.layers[0].id;
  let timeline = ensureAnimationNormalLayer(session.animation);
  const normalLayerId = timeline.layers.find((layer) => layer.role === 'normal').id;
  session.apply(timeline, { frameId: session.frameId, layerId: normalLayerId });

  const normal = session.document();
  normal.pixels[0] = 3;
  session.commitDocument(normal);
  assert.equal(session.undo().pixels[0], -1, 'undo restores the empty normal cel');
  assert.equal(session.redo().pixels[0], 3, 'redo restores the normal cel independently');

  timeline = setLayerProperties(session.animation, normalLayerId, { visible: false });
  session.apply(timeline, { frameId: session.frameId, layerId: normalLayerId });
  const hidden = session.composite(session.document());
  assert.ok(hidden.rgba.every(value => value === 0), 'a hidden selected normal layer reveals the empty art');

  timeline = setLayerProperties(session.animation, normalLayerId, { visible: true });
  const addedFrame = addAnimationFrame(timeline, { sourceFrameId: session.frameId, copy: true });
  const frameId = addedFrame.frames.at(-1).id;
  session.apply(addedFrame, { frameId, layerId: normalLayerId });
  assert.equal(session.document().pixels[0], 3, 'frame duplication copies normal cels');

  const resized = resizeAnimation(session.animation, 10, 9);
  session.apply(resized, { frameId, layerId: normalLayerId });
  assert.equal(session.document().pixels[0], 3, 'resize preserves normal pixels');
  assert.deepEqual(session.document().palette, NORMAL_MAP_PALETTE);
  assert.ok(session.animation.layers.some(layer => layer.id === artLayer));
});

test('normal preview stays above later art, restores art alpha when erased, and follows playback frames', () => {
  const draw = createDrawDocument(16);
  draw.palette = ['#f0402080', '#12ab34'];
  draw.pixels[0] = 0;
  draw.pixels[1] = 0;
  const session = createDrawAnimationSession(draw);
  let timeline = ensureAnimationNormalLayer(session.animation);
  const normalId = timeline.layers.find(layer => layer.role === 'normal').id;
  timeline = addAnimationLayer(timeline, { name: 'Above normal in the layer list' });
  const upperArtId = timeline.layers.at(-1).id;
  const upperPixels = new Uint8Array(16 * 16); upperPixels[0] = 2;
  timeline = writeAnimationCel(timeline, session.frameId, upperArtId, { width: 16, height: 16, pixels: upperPixels });
  session.apply(timeline, { frameId: session.frameId, layerId: normalId });
  const normal = session.document(); normal.pixels[0] = 3; normal.pixels[1] = 16;
  session.commitDocument(normal);
  let preview = session.composite(normal);
  assert.deepEqual(pixel(preview, 0), rgbaColor(NORMAL_MAP_PALETTE[3]), 'normal remains frontmost even with a later art layer');
  assert.deepEqual(pixel(preview, 1), rgbaColor(NORMAL_MAP_PALETTE[16]));
  assert.deepEqual(pixel(composeAnimationFrameRgba(session.animation, session.frameId), 0), rgbaColor('#12ab34'), 'normal is still excluded from ordinary exports');

  normal.pixels[1] = -1;
  preview = session.composite(normal, [1]);
  assert.deepEqual(pixel(preview, 1), [240, 64, 32, 128], 'erasing restores straight RGBA and the original partial alpha');
  assert.deepEqual(pixel(preview, 0), rgbaColor(NORMAL_MAP_PALETTE[3]), 'a sparse edit keeps untouched normal pixels');
  session.commitDocument(normal);
  normal.pixels[1] = 5;
  assert.deepEqual(pixel(session.composite(normal, [1]), 1), rgbaColor(NORMAL_MAP_PALETTE[5]), 'an uncommitted brush stroke is visible');
  normal.pixels[1] = -1;
  assert.deepEqual(pixel(session.composite(normal, [1]), 1), [240, 64, 32, 128], 'cancelling that stroke restores the underlay');

  const originalFrame = session.frameId;
  timeline = addAnimationFrame(session.animation, { sourceFrameId: originalFrame, copy: true });
  const secondFrame = timeline.frames.at(-1).id;
  const secondNormal = new Uint8Array(16 * 16); secondNormal[1] = 2;
  timeline = writeAnimationCel(timeline, secondFrame, normalId, { width: 16, height: 16, pixels: secondNormal });
  session.apply(timeline, { frameId: originalFrame, layerId: normalId });
  const playback = session.previewFrame(secondFrame);
  assert.deepEqual(pixel(playback, 0), rgbaColor('#12ab34'), 'playback reads the destination normal cel, including its transparent pixels');
  assert.deepEqual(pixel(playback, 1), rgbaColor(NORMAL_MAP_PALETTE[1]));
  assert.equal(session.frameId, originalFrame, 'playback does not change editing selection');
  assert.deepEqual(pixel(session.composite(session.document()), 0), rgbaColor(NORMAL_MAP_PALETTE[3]), 'playback does not corrupt the editing cache');

  timeline = setLayerProperties(session.animation, normalId, { visible: false });
  session.apply(timeline, { frameId: originalFrame, layerId: normalId });
  assert.deepEqual(pixel(session.composite(session.document()), 0), rgbaColor('#12ab34'), 'hidden normal reveals art');
  assert.deepEqual(pixel(session.previewFrame(secondFrame), 1), [240, 64, 32, 128], 'hidden normal also reveals art during playback');
});

test('normal initialization offers transparent or flat art coverage without changing existing pixels', () => {
  const draw = createDrawDocument(16); draw.pixels[0] = 2;
  const session = createDrawAnimationSession(draw);
  const original = session.animation, frame = session.frameId, artId = session.layerId;
  const transparent = prepareDrawNormalLayer(original, frame);
  const transparentId = transparent.layers.find(layer => layer.role === 'normal').id;
  assert.ok(getAnimationCelDocument(transparent, frame, transparentId).pixels.every(value => value === -1));
  assert.deepEqual(getAnimationCelDocument(transparent, frame, artId), draw);
  const flat = prepareDrawNormalLayer(original, frame, { initialFill: 'flat' });
  const flatId = flat.layers.find(layer => layer.role === 'normal').id;
  const flatDoc = getAnimationCelDocument(flat, frame, flatId);
  assert.equal(flatDoc.pixels[0], 0); assert.equal(flatDoc.pixels[1], -1);
  assert.equal(prepareDrawNormalLayer(flat, frame, { initialFill: 'transparent' }), flat, 'opening an existing layer never clears it');
  assert.equal(prepareDrawNormalLayer(transparent, frame, { initialFill: 'flat' }), transparent, 'opening an existing transparent layer never fills it');
  assert.throws(() => prepareDrawNormalLayer(original, frame, { initialFill: 'unknown' }), /作成方法/);
  assert.equal(original.layers.some(layer => layer.role === 'normal'), false, 'original immutable snapshot is preserved');
});

test('overlay opacity blends only the editor preview, including alpha, sparse updates and playback', () => {
  const draw = createDrawDocument(16); draw.palette = ['#f0402080']; draw.pixels[0] = 0;
  const session = createDrawAnimationSession(draw);
  const timeline = prepareDrawNormalLayer(session.animation, session.frameId);
  const normalId = timeline.layers.find(layer => layer.role === 'normal').id;
  session.apply(timeline, { frameId: session.frameId, layerId: normalId });
  const doc = session.document(); doc.pixels[0] = 0; doc.pixels[1] = 0; session.commitDocument(doc);
  const saved = session.animation;
  session.composite(doc);
  session.setNormalOverlayOpacity(0.5);
  const mixed = session.composite(doc, [1]);
  assert.deepEqual(pixel(mixed, 0), [165, 107, 180, 192], 'opacity change invalidates all cached pixels, preserving straight alpha');
  assert.deepEqual(pixel(mixed, 1), [128, 128, 255, 128], 'opacity affects preview over transparent art');
  assert.deepEqual(pixel(session.previewFrame(session.frameId), 0), pixel(mixed, 0));
  assert.equal(session.animation, saved, 'view settings do not change history or normal layer data');
  assert.equal(session.document().pixels[0], 0);
  assert.equal(saved.layers.find(layer => layer.id === normalId).opacity ?? 1, 1);
  assert.deepEqual(pixel(composeAnimationFrameRgba(saved, session.frameId), 0), [240, 64, 32, 128]);
  session.setNormalOverlayOpacity(0);
  assert.deepEqual(pixel(session.composite(doc, []), 0), [240, 64, 32, 128]);
  assert.deepEqual(pixel(session.composite(doc), 1), [0, 0, 0, 0]);
  session.setNormalOverlayOpacity(1);
  assert.deepEqual(pixel(session.composite(doc), 0), [128, 128, 255, 255]);
  assert.throws(() => session.setNormalOverlayOpacity(NaN), /濃度/);
  assert.throws(() => session.setNormalOverlayOpacity(1.1), /濃度/);
});

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase(); this.ownerDocument = ownerDocument; this.children = []; this.parentElement = null;
    this.dataset = {}; this.attributes = new Map(); this.listeners = new Map(); this.style = { setProperty(name, value) { this[name] = String(value); } };
    this.className = ''; this.classNames = new Set(); this.hidden = false; this.disabled = false; this.value = '';
    this.classList = {
      add: (...names) => names.forEach(name => this.classNames.add(name)),
      toggle: (name, force) => { const on = force === undefined ? !this.classNames.has(name) : Boolean(force); if (on) this.classNames.add(name); else this.classNames.delete(name); return on; },
      contains: name => this.classNames.has(name) || String(this.className).split(/\s+/).includes(name)
    };
  }
  append(...nodes) { for (const node of nodes) { node.parentElement?.removeChild(node); node.parentElement = this; this.children.push(node); } }
  insertBefore(node, before) { if (node.parentElement) node.parentElement.removeChild(node); const index = before ? this.children.indexOf(before) : -1; node.parentElement = this; this.children.splice(index < 0 ? this.children.length : index, 0, node); return node; }
  prepend(node) { node.parentElement = this; this.children.unshift(node); }
  removeChild(node) { this.children = this.children.filter(child => child !== node); node.parentElement = null; return node; }
  replaceChildren(...nodes) { for (const child of this.children) child.parentElement = null; this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, listener) { const list = this.listeners.get(type) || []; list.push(listener); this.listeners.set(type, list); }
  removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== listener)); }
  matches(selector) {
    if (selector.includes(',')) return selector.split(',').some(part => this.matches(part.trim()));
    if (selector === 'button') return this.tagName === 'BUTTON';
    if (selector === 'input') return this.tagName === 'INPUT';
    const match = selector.match(/^\[data-([a-z-]+)(?:="([^"]*)")?\]$/);
    if (!match) return false;
    const key = match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return Object.hasOwn(this.dataset, key) && (match[2] === undefined || String(this.dataset[key]) === match[2]);
  }
  closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
  contains(target) { return target === this || this.children.some(child => child.contains(target)); }
  querySelectorAll(selector) { const found = []; for (const child of this.children) { if (child.matches(selector)) found.push(child); found.push(...child.querySelectorAll(selector)); } return found; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  focus() { this.focused = true; }
  getBoundingClientRect() { return { left: 12, top: 90, right: 68, bottom: 146, width: 56, height: 56 }; }
  fire(type, event = {}) { const payload = { target: this, preventDefault() {}, ...event }; for (let node = this; node; node = node.parentElement) for (const listener of node.listeners.get(type) || []) listener(payload); }
  cloneNode() { return new FakeElement(this.tagName, this.ownerDocument); }
}

class FakeDocument {
  constructor() { this.defaultView = { innerWidth: 390, innerHeight: 844 }; this.body = this.createElement('body'); this.listeners = new Map(); }
  createElement(tagName) { return new FakeElement(tagName, this); }
  createElementNS(_namespace, tagName) { return new FakeElement(tagName, this); }
  querySelector() { return null; }
  addEventListener(type, listener) { const list = this.listeners.get(type) || []; list.push(listener); this.listeners.set(type, list); }
  removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== listener)); }
}

function uiScope() {
  const timers = new Map(); let next = 1;
  return {
    disposed: false,
    listen(target, type, listener) { target.addEventListener(type, listener); return () => target.removeEventListener(type, listener); },
    timeout(callback, delay) { const id = next++; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    add(cleanup) { this.cleanup = cleanup; },
    dispose() { this.disposed = true; this.cleanup?.(); }
  };
}

test('normal role is identified in layer controls and its opacity controls are disabled', () => {
  const doc = new FakeDocument(), host = doc.createElement('div'); host.id = 'draw-animation-controls';
  const scope = uiScope();
  const state = {
    frames: [{ id: 'f1', durationMs: 100 }],
    layers: [
      { id: 'art', name: '線画', visible: true, locked: false },
      { id: 'normal', name: 'ノーマルマップ', role: 'normal', visible: true, locked: false }
    ],
    frameId: 'f1', layerId: 'normal', playing: false, readOnly: false, audioMode: false
  };
  const ui = mountAnimationControls({ host, scope, getState: () => state, onAction() {} });
  host.querySelector('[data-action="toggle-layers"]').fire('click');
  const list = doc.body.querySelector('[data-layer-list]');
  const normal = list.querySelectorAll('[data-action="select-layer"]').find(item => item.dataset.layerId === 'normal');
  assert.match(normal.textContent, /法線/, 'the visible layer name identifies its role');
  assert.match(normal.getAttribute('aria-label'), /ノーマルマップ/);
  assert.equal(normal.dataset.layerRole, 'normal');
  const opacity = list.querySelectorAll('[data-layer-opacity]').find(item => item.dataset.layerOpacity === 'normal');
  const compactTrigger = list.querySelectorAll('[data-opacity-popover-trigger]').find(item => item.dataset.layerId === 'normal');
  assert.equal(opacity.disabled, true);
  assert.equal(compactTrigger.disabled, true);
  ui.dispose();
});

test('normal-map entry is hidden until available and dispatches only when enabled', () => {
  const doc = new FakeDocument(), host = doc.createElement('div'); host.id = 'draw-animation-controls';
  const scope = uiScope(), actions = [];
  const state = {
    frames: [{ id: 'f1', durationMs: 100 }],
    layers: [{ id: 'art', name: '線画', visible: true, locked: false }],
    frameId: 'f1', layerId: 'art', playing: false, readOnly: false, audioMode: false,
    normalMapAvailable: false
  };
  const ui = mountAnimationControls({ host, scope, getState: () => state, onAction: action => actions.push(action) });
  host.querySelector('[data-action="toggle-layers"]').fire('click');
  const normalTools = doc.body.querySelector('[data-action="normal-map"]');
  assert.ok(normalTools, 'the normal-map entry is mounted with layer controls');
  const layers = normalTools.parentElement;
  assert.equal(layers.children.indexOf(normalTools), layers.children.findIndex(child => child.classList.contains('animation-controls__panel-heading')) + 1,
    'the normal-map entry follows the layer heading');
  assert.equal(normalTools.hidden, true, 'the entry is hidden when normal-map use is unavailable');
  normalTools.fire('click');
  assert.deepEqual(actions, [], 'an unavailable action is not dispatched');

  state.normalMapAvailable = true;
  ui.refresh();
  assert.equal(normalTools.hidden, false, 'the entry becomes visible when normal-map use is available');
  assert.equal(normalTools.disabled, false);
  normalTools.fire('click');
  assert.deepEqual(actions, [{ type: 'normal-map' }], 'the available entry dispatches the normal-map action');
  ui.dispose();
});

test('mobile workspace exposes the normal-map action when cel-workspace controls are enabled', () => {
  const doc = new FakeDocument(), host = doc.createElement('div'); host.id = 'draw-animation-controls';
  const scope = uiScope(), actions = [];
  const state = {
    frames: [{ id: 'f1', durationMs: 100 }],
    layers: [{ id: 'art', name: '線画', visible: true, locked: false }],
    frameId: 'f1', layerId: 'art', playing: false, readOnly: false, audioMode: false,
    normalMapAvailable: false
  };
  const ui = mountAnimationControls({
    host, scope, getState: () => state, getCelHasContent: () => false,
    onAction: action => actions.push(action)
  });
  host.querySelector('[data-action="toggle-frames"]').fire('click');
  const normalTools = doc.body.querySelectorAll('[data-action="normal-map"]')
    .find(item => item.parentElement.classList.contains('animation-controls__workspace-panel'));
  assert.ok(normalTools, 'the cel workspace owns a normal-map entry for the compact Draw layout');
  const workspacePanel = normalTools.parentElement;
  assert.equal(workspacePanel.children.indexOf(normalTools), 1, 'the workspace normal-map entry follows its heading');
  assert.equal(normalTools.hidden, true, 'the workspace entry is hidden while unavailable');
  normalTools.fire('click');
  assert.deepEqual(actions, [], 'the hidden workspace entry cannot dispatch while unavailable');

  state.normalMapAvailable = true;
  ui.refresh();
  assert.equal(normalTools.hidden, false, 'workspace refresh reveals the entry when available');
  normalTools.fire('click');
  assert.deepEqual(actions, [{ type: 'normal-map' }]);
  ui.dispose();
});
