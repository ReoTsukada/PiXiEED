import test from 'node:test';
import assert from 'node:assert/strict';
import { addAnimationFrame, addAnimationLayer, composeAnimationFrame, createAnimationFromDraw, getAnimationCelDocument, setLayerProperties } from '../../js/creation/animation-core.mjs';
import { createDrawAnimationSession } from '../../js/creation/draw-animation-session.mjs';
import { mountAnimationControls } from '../../js/creation/animation-controls.mjs';

const blank = (width = 2, height = 1) => ({ schemaVersion: 1, width, height, palette: ['#101010', '#ff7777'], pixels: Array(width * height).fill(-1) });
const image = (pixels) => ({ ...blank(pixels.length), pixels });
const cel = (animation, frameId, layerId) => getAnimationCelDocument(animation, frameId, layerId).pixels;

test('music-mode sessions retain the shared editable cel and selection across frames and layers', () => {
  const session = createDrawAnimationSession(blank(), { musicLayer: true });
  const musicId = session.musicLayerId;
  assert.equal(session.layerId, musicId);
  assert.deepEqual(session.animation.layers[0], { ...session.animation.layers[0], role: 'music', visible: false, locked: false });
  let doc = session.document(); doc.pixels[0] = 0; session.commitDocument(doc);
  const first = session.frameId;
  const next = addAnimationFrame(session.animation, { sourceFrameId: first, copy: false });
  session.apply(next, { frameId: next.frames[1].id, layerId: musicId });
  assert.deepEqual(session.document().pixels, [0, -1]);
  doc = session.document(); doc.pixels[1] = 1; session.commitDocument(doc);
  assert.deepEqual(session.animation.frames.map((frame) => cel(session.animation, frame.id, musicId)), [[0, 1], [0, 1]]);
  assert.equal(session.frameId, next.frames[1].id);
  assert.equal(session.layerId, musicId);
});

test('music import replaces only its shared cel, keeps current frame/layer, and supports Undo/Redo and blanking', () => {
  const session = createDrawAnimationSession(blank(), { musicLayer: true });
  let animation = addAnimationFrame(session.animation, { copy: false });
  const secondFrame = animation.frames[1].id;
  animation = addAnimationLayer(animation, { name: 'Normal' });
  const normalId = animation.layers.at(-1).id;
  session.apply(animation, { frameId: secondFrame, layerId: normalId });
  const returned = session.replaceMusicDocument(image([0, 1]));
  assert.equal(session.frameId, secondFrame);
  assert.equal(session.layerId, normalId);
  assert.deepEqual(returned.pixels, [0, 1]);
  assert.deepEqual(session.animation.frames.map((frame) => cel(session.animation, frame.id, session.musicLayerId)), [[0, 1], [0, 1]]);
  session.replaceMusicDocument(blank());
  assert.deepEqual(cel(session.animation, secondFrame, session.musicLayerId), [-1, -1]);
  session.undo(); assert.deepEqual(cel(session.animation, secondFrame, session.musicLayerId), [0, 1]);
  session.redo(); assert.deepEqual(cel(session.animation, secondFrame, session.musicLayerId), [-1, -1]);
});

test('Music uses its own grid instead of compositing visible drawing layers; regenerated timelines keep Music in history', () => {
  const session = createDrawAnimationSession(blank(), { musicLayer: true });
  let animation = addAnimationLayer(session.animation, { name: 'Drawing', visible: true });
  const drawing = animation.layers.at(-1).id;
  session.apply(animation, { frameId: session.frameId, layerId: drawing });
  let doc = session.document(); doc.pixels[0] = 1; session.commitDocument(doc);
  animation = setLayerProperties(session.animation, session.musicLayerId, { visible: true });
  session.apply(animation, { frameId: session.frameId, layerId: session.musicLayerId });
  session.replaceMusicDocument(image([0, -1]));
  const mixed = session.composite(session.document());
  assert.deepEqual(Array.from(mixed.pixels), [0, -1]);
  assert.notEqual(mixed.pixels, session.document().pixels);

  session.undo();
  const regenerated = createAnimationFromDraw(blank());
  session.apply(regenerated);
  const music = session.animation.layers[0];
  assert.equal(music.role, 'music');
  assert.equal(session.layerId, music.id);
  const snapshot = session.snapshot();
  for (const item of [...snapshot.timeline.past, snapshot.timeline.current, ...snapshot.timeline.future]) {
    assert.equal(item.layers.filter((layer) => layer.role === 'music').length, 1);
    assert.equal(item.layers[0].role, 'music');
  }
});

class FakeElement {
  constructor(tag, ownerDocument) { this.tagName = tag.toUpperCase(); this.ownerDocument = ownerDocument; this.children = []; this.parentElement = null; this.dataset = {}; this.attributes = new Map(); this.listeners = new Map(); this.style = { setProperty() {} }; this.classNames = new Set(); this.className = ''; this.classList = { toggle: (name, force) => { const on = force ?? !this.classNames.has(name); on ? this.classNames.add(name) : this.classNames.delete(name); return on; }, add: (name) => this.classNames.add(name), contains: (name) => this.classNames.has(name) || this.className.split(/\s+/).includes(name) }; }
  append(...items) { for (const item of items) { item.parentElement = this; this.children.push(item); } }
  insertBefore(item, before) { if (item === before) return item; if (item.parentElement) item.parentElement.children = item.parentElement.children.filter((child) => child !== item); const index = before ? this.children.indexOf(before) : -1; item.parentElement = this; this.children.splice(index < 0 ? this.children.length : index, 0, item); return item; }
  prepend(item) { item.parentElement = this; this.children.unshift(item); }
  removeChild(item) { this.children = this.children.filter((child) => child !== item); item.parentElement = null; return item; }
  replaceChildren(...items) { this.children = []; this.append(...items); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, fn) { const list = this.listeners.get(type) ?? []; list.push(fn); this.listeners.set(type, list); }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== fn)); }
  matches(selector) { if (selector.includes(',')) return selector.split(',').some((part) => this.matches(part.trim())); if (selector === 'button') return this.tagName === 'BUTTON'; if (selector === 'input') return this.tagName === 'INPUT'; if (selector.startsWith('.')) return this.classList.contains(selector.slice(1)); const match = selector.match(/^\[data-([a-z-]+)(?:="([^"]*)")?\]$/); if (!match) return false; const key = match[1].replace(/-([a-z])/g, (_, char) => char.toUpperCase()); return Object.hasOwn(this.dataset, key) && (match[2] === undefined || String(this.dataset[key]) === match[2]); }
  closest(selector) { for (let item = this; item; item = item.parentElement) if (item.matches(selector)) return item; return null; }
  contains(target) { return target === this || this.children.some((item) => item.contains(target)); }
  querySelectorAll(selector) { const items = []; for (const child of this.children) { if (child.matches(selector)) items.push(child); items.push(...child.querySelectorAll(selector)); } return items; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  getBoundingClientRect() { return { left: 10, right: 60, top: 10, bottom: 40, width: 50, height: 30 }; }
  fire(type) { const event = { target: this, preventDefault() {} }; for (let item = this; item; item = item.parentElement) for (const listener of item.listeners.get(type) ?? []) listener(event); }
}
class FakeDocument {
  constructor() { this.defaultView = { innerWidth: 390, innerHeight: 844 }; this.body = this.createElement('body'); }
  createElement(tag) { return new FakeElement(tag, this); }
  createElementNS(_ns, tag) { return this.createElement(tag); }
  querySelector() { return null; }
  addEventListener() {}
  removeEventListener() {}
}
const scope = () => ({ disposed: false, listen(target, type, fn) { target.addEventListener(type, fn); return () => target.removeEventListener(type, fn); }, timeout() { return 0; }, clearTimeout() {}, add(fn) { this.dispose = fn; } });

test('layer controls label Music and prevent reordering or deleting it and adding beyond eight normal layers', () => {
  let animation = createDrawAnimationSession(blank(), { musicLayer: true }).animation;
  for (let index = 1; index < 8; index += 1) animation = addAnimationLayer(animation);
  const music = animation.layers[0]; const doc = new FakeDocument(); const host = doc.createElement('div'); const life = scope();
  const ui = mountAnimationControls({ host, scope: life, getState: () => ({ ...animation, frameId: animation.frames[0].id, layerId: music.id, audioMode: false, readOnly: false }), onAction() {} });
  host.querySelector('[data-action="toggle-layers"]').fire('click');
  const musicSelect = doc.body.querySelectorAll('[data-action="select-layer"]').find((button) => button.dataset.layerId === music.id);
  assert.equal(musicSelect.textContent, '音楽（全コマ共通）');
  const rows = doc.body.querySelectorAll('.animation-controls__layer');
  const musicRow = rows.find((row) => row.querySelector('[data-action="select-layer"]')?.dataset.layerId === music.id);
  assert.equal(musicRow.querySelector('[data-action="move-layer-up"]').disabled, true);
  assert.equal(musicRow.querySelector('[data-action="move-layer-down"]').disabled, true);
  assert.equal(musicRow.querySelector('[data-action="delete-layer"]').disabled, true);
  assert.equal(doc.body.querySelector('[data-action="add-layer"]').disabled, true);
  ui.dispose();
});
