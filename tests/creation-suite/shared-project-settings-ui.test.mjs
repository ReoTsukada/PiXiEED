import test from 'node:test';
import assert from 'node:assert/strict';
import { mountSharedProjectSettings } from '../../js/creation/shared-project-settings.mjs';
import { createDrawDocument } from '../../js/creation/draw-core.mjs';
import { createDrawAnimationSession } from '../../js/creation/draw-animation-session.mjs';
import { planSharedProjectSettings } from '../../js/creation/shared-project-core.mjs';
import { planSpriteScale, scaleSpriteAnimation } from '../../js/creation/draw-sprite-scale.mjs';
import { addAnimationFrame, addAnimationLayer, writeAnimationCel, composeAnimationFrameRgba, serializeAnimationPool } from '../../js/creation/animation-core.mjs';

// Controller tests use actual immutable animation plans and history. The small
// DOM adapter is not browser/layout, pointer, OS keyboard or device evidence.
class Element {
  constructor(tag, doc) {
    this.tagName = tag; this.doc = doc; this.children = []; this.dataset = {};
    this.attributes = new Map(); this.listeners = new Map(); this.style = { setProperty() {} };
    this.value = ''; this.textContent = ''; this.hidden = false; this.disabled = false;
    this.scrollTop = 0; this.scrollHeight = 400; this.clientHeight = 400;
  }
  setAttribute(key, value) {
    this.attributes.set(key, String(value));
    if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
    if (['id', 'value', 'type'].includes(key)) this[key] = String(value);
    if (['hidden', 'disabled', 'required'].includes(key)) this[key] = true;
  }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  removeAttribute(key) { this.attributes.delete(key); if (['hidden', 'disabled'].includes(key)) this[key] = false; }
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  get isConnected() { return this === this.doc.body || Boolean(this.parentElement?.isConnected); }
  focus() { this.doc.activeElement = this; }
  matches(selector) {
    if (selector.includes(',')) return selector.split(',').some(s => this.matches(s.trim()));
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.className?.split(' ').includes(selector.slice(1));
    const attr = selector.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
    if (attr) return this.attributes.has(attr[1]) && (attr[2] == null || this.attributes.get(attr[1]) === attr[2]);
    return this.tagName === selector;
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector); }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  querySelectorAll(selector) { return this.children.flatMap(node => [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]); }
  getBoundingClientRect() { return { top: 20, bottom: 152, left: 8, right: 288, width: 280, height: 132 }; }
  getClientRects() { return this.hidden ? [] : [this.getBoundingClientRect()]; }
  getContext() { return { putImageData: image => { this.image = image; } }; }
  async fire(type, data = {}) {
    const event = { target: this, preventDefault() {}, stopImmediatePropagation() {}, ...data };
    for (let n = this; n; n = n.parentElement) for (const fn of n.listeners.get(type) || []) await fn(event);
  }
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function fixture({ delayPreview = () => 0, delayApply = 0, failPreview = false, getMode = () => 'draw' } = {}) {
  const doc = { activeElement: null, listeners: new Map() };
  doc.body = new Element('body', doc); doc.createElement = tag => new Element(tag, doc);
  doc.querySelector = selector => doc.body.querySelectorAll(selector)[0] || null;
  const saved = Object.fromEntries(['document', 'window', 'localStorage', 'requestAnimationFrame', 'ImageData'].map(key => [key, globalThis[key]]));
  Object.assign(globalThis, {
    document: doc, window: { innerWidth: 390, innerHeight: 844, listeners: new Map() },
    localStorage: { getItem() { return null; } },
    requestAnimationFrame(fn) { fn(); return 1; },
    ImageData: class { constructor(data, width, height) { Object.assign(this, { data, width, height }); } }
  });
  const cleanups = [], scope = {
    add(fn) { cleanups.push(fn); },
    listen(node, type, fn) { const list = node.listeners.get(type) || []; list.push(fn); node.listeners.set(type, list); }
  };
  const session = createDrawAnimationSession(createDrawDocument(16));
  let a = addAnimationFrame(session.animation);
  a = addAnimationLayer(a, { visible: false, locked: true });
  for (const frame of a.frames) for (const layer of a.layers) {
    const pixels = new Uint8Array(256); pixels[0] = 1; pixels[119] = 2; pixels[255] = 3;
    a = writeAnimationCel(a, frame.id, layer.id, { width: 16, height: 16, pixels });
  }
  session.load(a);
  const original = session.animation, originalPool = serializeAnimationPool(original), listeners = new Set();
  let applies = 0;
  const emit = () => { for (const fn of listeners) fn(); };
  const preview = async (plan, settings) => {
    const delay = delayPreview(settings);
    if (delay) await wait(delay);
    if (failPreview) throw new Error('Synthetic preview failure');
    return { ...plan, image: composeAnimationFrameRgba(plan.animation, plan.animation.frames[0].id) };
  };
  const draw = {
    getTimeline: () => session.animation,
    getEditorState: () => ({ frameId: session.animation.frames[0].id }),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    previewProjectSettings(settings) { return preview(planSharedProjectSettings(session.animation, settings), settings); },
    previewSpriteScaleSettings(percent) {
      const owner = session.animation, plan = planSpriteScale(owner, percent);
      if (!plan.allowed) throw new RangeError(plan.reason);
      return preview({ owner, changed: plan.changed, animation: scaleSpriteAnimation(owner, percent), summary: {} }, { percent });
    },
    async setProjectSettings(settings, { expectedOwner }) {
      if (delayApply) await wait(delayApply);
      assert.equal(expectedOwner, session.animation);
      const plan = planSharedProjectSettings(session.animation, settings);
      if (!plan.changed) return false;
      session.apply(plan.animation); applies++; emit(); return true;
    },
    async setSpriteScaleSettings(percent, { expectedOwner }) {
      assert.equal(expectedOwner, session.animation);
      session.apply(scaleSpriteAnimation(session.animation, percent)); applies++; emit(); return true;
    }
  };
  const settings = mountSharedProjectSettings({ draw, scope, getMode }); doc.body.append(settings.root);
  const q = selector => doc.body.querySelectorAll(selector)[0];
  settings.open();
  return { settings, session, original, originalPool, doc, q, emit,
    get applies() { return applies; },
    input: async (id, value) => { const n = q('#' + id); n.value = String(value); await n.fire('input'); },
    apply: () => q('[data-project-action=apply]').fire('click'),
    dispose() { for (const fn of cleanups.reverse()) fn(); Object.assign(globalThis, saved); }
  };
}
test('shared canvas live preview controller', async t => {
  await t.test('one preview and two actions; crop preview is immutable and Apply/Undo restores every cel', async () => {
    const f = fixture();
    try {
      assert.equal(f.settings.panel.querySelectorAll('canvas').length, 1);
      assert.equal(f.settings.panel.querySelectorAll('[data-project-action]').length, 2);
      await f.input('creation-project-width', 8); await f.input('creation-project-height', 8);
      assert.equal(f.q('[data-project-action=apply]').disabled, true);
      await wait(175);
      assert.equal(f.q('[data-project-action=apply]').disabled, false);
      assert.equal(f.q('canvas').width, 8);
      assert.match(f.q('.creation-project-settings__status').textContent, /切り取られる画素 [1-9]/);
      assert.equal(f.session.animation, f.original);
      assert.deepEqual(serializeAnimationPool(f.original), f.originalPool);
      await f.apply(); assert.equal(f.session.animation.width, 8); assert.equal(f.applies, 1);
      assert.equal(f.session.animation.frames.length, f.original.frames.length);
      assert.deepEqual(f.session.animation.layers, f.original.layers);
      f.session.undo(); assert.equal(f.session.animation, f.original);
      assert.deepEqual(serializeAnimationPool(f.session.animation), f.originalPool);
    } finally { f.dispose(); }
  });
  await t.test('dimension controls are explicit and keep the draft preview when the panel is repositioned', async () => {
    const f = fixture();
    try {
      assert.equal(f.q('.creation-project-settings__dimensions').querySelectorAll('.creation-project-settings__dimension-card').length, 2);
      assert.equal(f.q('.creation-project-settings__shapes').querySelectorAll('[data-shape]').length, 8);
      const minus = f.q('.creation-project-settings__dimensions').querySelectorAll('[data-dimension]').find(node => node.dataset.dimension === 'width' && node.dataset.delta === '-1');
      await minus.fire('click'); await wait(175);
      assert.equal(f.q('#creation-project-width').value, '15');
      assert.equal(f.q('canvas').width, 15);
      f.settings.position();
      assert.equal(f.q('canvas').width, 15);
      assert.equal(f.session.animation, f.original);
      await f.q('[data-shape="3:2"]').fire('click'); await wait(175);
      assert.equal(f.q('#creation-project-width').value, '24');
      assert.equal(f.q('#creation-project-height').value, '16');
      assert.equal(f.q('#creation-project-ratio').checked, true);
    } finally { f.dispose(); }
  });
  await t.test('cancel discards a pending preview and reopens unchanged', async () => {
    const f = fixture({ delayPreview: () => 100 });
    try {
      await f.input('creation-project-width', 8); await wait(160);
      await f.q('[data-project-action=cancel]').fire('click'); await wait(130);
      assert.equal(f.settings.isOpen(), false); assert.equal(f.q('[data-project-action=apply]').disabled, true);
      assert.equal(f.session.animation, f.original); assert.equal(f.applies, 0);
      f.settings.open(); assert.equal(f.q('#creation-project-width').value, '16');
    } finally { f.dispose(); }
  });
  await t.test('newer input supersedes an older asynchronous result and invalid input blocks apply', async () => {
    const f = fixture({ delayPreview: s => s.width === 8 ? 250 : 0 });
    try {
      await f.input('creation-project-width', 8); await wait(155);
      await f.input('creation-project-width', 12); await wait(175);
      assert.equal(f.q('canvas').width, 12);
      await wait(140); assert.equal(f.q('canvas').width, 12);
      await f.input('creation-project-width', ''); await wait(160);
      assert.equal(f.q('[data-project-action=apply]').disabled, true);
      await f.apply(); assert.equal(f.applies, 0); assert.equal(f.session.animation, f.original);
    } finally { f.dispose(); }
  });
  await t.test('changed owner cannot apply an old preview', async () => {
    const f = fixture();
    try {
      await f.input('creation-project-width', 8); await wait(175);
      f.session.apply(planSharedProjectSettings(f.session.animation, { width: 20, height: 20 }).animation);
      const changedOwner = f.session.animation;
      await f.apply(); assert.equal(f.applies, 0); assert.equal(f.session.animation, changedOwner);
      f.emit(); assert.equal(f.q('[data-project-action=apply]').disabled, true);
    } finally { f.dispose(); }
  });
  await t.test('repeated Apply serializes to one mutation and resets no-change state', async () => {
    const f = fixture({ delayApply: 80 });
    try {
      await f.input('creation-project-width', 24); await wait(175);
      const first = f.apply(), second = f.apply(); await Promise.all([first, second]);
      assert.equal(f.applies, 1); assert.equal(f.session.animation.width, 24);
      assert.equal(f.q('[data-project-action=apply]').disabled, true);
      assert.equal(f.q('#creation-project-width').value, '24');
    } finally { f.dispose(); }
  });
  await t.test('scale and palette also enable Apply directly, without a Try action', async () => {
    const f = fixture();
    try {
      await f.q('#creation-project-tab-scale').fire('click');
      await f.input('creation-project-scale-percent', 200); await wait(175);
      assert.equal(f.q('[data-project-action=apply]').disabled, false);
      assert.equal(f.session.animation, f.original);
      await f.apply(); assert.equal(f.session.animation.width, 32);
      assert.equal(f.q('#creation-project-scale-percent').value, '100');
      await f.q('#creation-project-tab-palette').fire('click');
      const preset = f.q('#creation-project-palette-preset'); preset.value = 'mono'; await preset.fire('change'); await wait(175);
      assert.equal(f.q('[data-project-action=apply]').disabled, false);
      await f.apply(); assert.deepEqual(f.session.animation.palette, ['#000000', '#ffffff']);
    } finally { f.dispose(); }
  });
  await t.test('open with dimensions previews automatically; error and no-op never enable apply', async () => {
    const f = fixture();
    try {
      await wait(175); assert.equal(f.q('[data-project-action=apply]').disabled, true);
      f.settings.open({ width: 24, height: 20 }); await wait(175);
      assert.equal(f.q('canvas').width, 24); assert.equal(f.q('canvas').height, 20);
      assert.equal(f.q('[data-project-action=apply]').disabled, false);
    } finally { f.dispose(); }
    const broken = fixture({ failPreview: true });
    try {
      await broken.input('creation-project-width', 8); await wait(175);
      assert.equal(broken.q('[data-project-action=apply]').disabled, true);
      assert.match(broken.q('.creation-project-settings__status').textContent, /Synthetic preview failure/);
      assert.equal(broken.session.animation, broken.original);
    } finally { broken.dispose(); }
  });
  await t.test('Draw and camera accept 1028 draft; music retains its independent 256 limit', async () => {
    for (const mode of ['draw', 'camera', 'audio']) {
      const f = fixture({ getMode: () => mode });
      try {
        await f.input('creation-project-width', 1028); await wait(175);
        assert.equal(f.q('[data-project-action=apply]').disabled, mode === 'audio');
        if (mode === 'audio') assert.match(f.q('#creation-project-width-error').textContent, /256/);
        else assert.equal(f.q('canvas').width, 1028);
        assert.equal(f.session.animation, f.original, 'preview does not mutate any domain');
      } finally { f.dispose(); }
    }
  });

  await t.test('Music exposes only view area and a mode change invalidates the old preview', async()=>{
    let mode='audio';const f=fixture({getMode:()=>mode});
    try {
      assert.equal(f.q('#creation-project-tab-scale').hidden,true);
      assert.equal(f.q('#creation-project-tab-palette').hidden,true);
      assert.equal(f.q('#creation-project-tab-area').textContent,'表示範囲');
      assert.match(f.q('.creation-project-settings__help').textContent,/音程・開始時刻は変わりません/);
      await f.q('#creation-project-tab-scale').fire('click');
      assert.equal(f.q('#creation-project-panel-scale').hidden,true);
      await f.input('creation-project-width',8);await wait(175);
      assert.equal(f.q('[data-project-action=apply]').disabled,false);
      mode='draw';await f.apply();assert.equal(f.applies,0);
      f.emit();assert.equal(f.q('#creation-project-tab-scale').hidden,false);
    } finally {f.dispose();}
  });

});
