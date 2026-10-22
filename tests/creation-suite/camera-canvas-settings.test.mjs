import test from 'node:test';
import assert from 'node:assert/strict';
import { mountCameraCanvasSettings } from '../../js/creation/camera-canvas-settings.mjs';
import { createDrawDocument } from '../../js/creation/draw-core.mjs';
import { createDrawAnimationSession } from '../../js/creation/draw-animation-session.mjs';
import { planSharedProjectSettings } from '../../js/creation/shared-project-core.mjs';

// An event/DOM adapter for controller tests. It does not claim browser layout,
// pointer, native range, focus-ring, keyboard or permission coverage.
class Element {
  constructor(tag, doc) { this.tagName = tag; this.doc = doc; this.children = []; this.dataset = {}; this.attributes = new Map(); this.style = {}; this.listeners = new Map(); this.value = ''; this.hidden = false; }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  removeAttribute(key) { this.attributes.delete(key); }
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(n => n !== this); this.parentElement = null; }
  get isConnected() { return this === this.doc.body || Boolean(this.parentElement?.isConnected); }
  focus() { this.doc.activeElement = this; }
  matches(selector) {
    if (selector === 'button') return this.tagName === 'button';
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.className?.split(' ').includes(selector.slice(1));
    const match = selector.match(/^button\[data-(px|ratio)\]$/);
    return Boolean(match && this.tagName === 'button' && this.dataset[match[1]] !== undefined);
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector); }
  querySelectorAll(selector) { return this.children.flatMap(node => [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]); }
  getBoundingClientRect() { return { top: 20, bottom: 64 }; }
  fire(type, data = {}) { const event = { target: this, preventDefault() {}, ...data }; for (let n = this; n; n = n.parentElement) for (const fn of n.listeners.get(type) || []) fn(event); }
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function setup({ delayed = 0, priorHistory = false, shellEscape = false } = {}) {
  const doc = { activeElement: null };
  doc.body = new Element('body', doc); doc.createElement = tag => new Element(tag, doc);
  doc.listeners = new Map(); doc.captureListeners = new Map();
  doc.querySelector = selector => selector === 'dialog[open]' && doc.modalOpen ? {} : doc.body.querySelectorAll(selector)[0] || null;
  doc.fire = (type, event) => { const e = { defaultPrevented:false, preventDefault() { this.defaultPrevented=true; }, ...event }; for (const map of [doc.captureListeners,doc.listeners]) for (const fn of map.get(type) || []) fn(e); return e; };
  let shellExits=0;
  if(shellEscape)doc.listeners.set('keydown',[event=>{if(event.key==='Escape'&&!event.defaultPrevented&&!doc.modalOpen)shellExits++;}]);
  const saved = { document: globalThis.document, window: globalThis.window, matchMedia: globalThis.matchMedia };
  globalThis.document = doc; globalThis.window = { innerHeight: 844 }; globalThis.matchMedia = () => ({ matches: false });
  const cleanups = [], scope = {
    disposed: false, add(fn) { cleanups.push(fn); }, frame(fn) { fn(); },
    listen(node, type, fn, options={}) { const map=node===doc&&options.capture?doc.captureListeners:node.listeners; if (!map.has(type)) map.set(type, []); map.get(type).push(fn); }
  };
  const source = createDrawDocument(16); source.pixels[0] = 1; source.pixels[255] = 2;
  const original = Array.from(source.pixels), session = createDrawAnimationSession(source), listeners = new Set();
  let commits = 0, busy = 0, maximumBusy = 0, active = true, dirtyMarks = 0;
  const emit = () => { for (const fn of listeners) fn(); };
  const draw = {
    workspace: { markDirty() { dirtyMarks++; } },
    getTimeline: () => session.animation,
    get canUndo() { return session.canUndo; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    snapshotTimeline: () => ({ session: session.snapshot() }),
    restoreTimelineSnapshot(value) { session.restore(value.session); emit(); },
    undo() { const value = session.undo(); emit(); return value; },
    async setProjectSettings(settings, { expectedOwner }) {
      busy++; maximumBusy = Math.max(maximumBusy, busy);
      try {
        if (delayed) await wait(delayed);
        assert.equal(expectedOwner, session.animation, 'apply checks its immutable owner');
        const plan = planSharedProjectSettings(session.animation, settings);
        if (!plan.changed) return false;
        session.apply(plan.animation); commits++; emit(); return true;
      } finally { busy--; }
    }
  };
  if (priorHistory) session.apply(planSharedProjectSettings(session.animation, { width: 32, height: 32, palette: session.animation.palette }).animation);
  const settings = mountCameraCanvasSettings({ draw, scope, isActive: () => active });
  const trigger = doc.createElement('button'); trigger.setAttribute('aria-controls', 'creation-settings-panel'); doc.body.append(trigger);
  settings.open({ trigger });
  const nodes = () => doc.body.querySelectorAll('button');
  const button = text => nodes().find(n => n.textContent === text);
  const input = (id, value) => { const node = doc.body.querySelectorAll(`#${id}`)[0]; node.value = String(value); node.fire('input'); return node; };
  return { doc, draw, settings, trigger, source, original, session, button, input,
    preset(px) { nodes().find(n => n.dataset.px === String(px)).fire('click'); },
    aspect(value) { nodes().find(n => n.dataset.ratio === value).fire('click'); },
    range(value) { const node = settings.panel.children.find(n => n.className === 'camera-canvas-settings__range-label').children[0]; node.value = String(value); node.fire('input'); },
    get commits() { return commits; }, get maximumBusy() { return maximumBusy; }, get dirtyMarks() { return dirtyMarks; }, get shellExits() { return shellExits; },
    deactivate() { active = false; settings.close({ restoreFocus: false }); },
    dispose() { scope.disposed = true; for (const fn of cleanups.reverse()) fn?.(); Object.assign(globalThis, saved); }
  };
}

test('camera settings controller', async t => {
  await t.test('panel Escape runs before an earlier workspace listener, while native dialogs keep priority', () => {
    const q=setup({shellEscape:true});
    try {
      const event=q.doc.fire('keydown',{key:'Escape'});
      assert.equal(event.defaultPrevented,true);assert.equal(q.settings.panel.hidden,true);
      assert.equal(q.doc.activeElement,q.trigger);assert.equal(q.shellExits,0);
      q.settings.open({trigger:q.trigger});q.doc.modalOpen=true;
      assert.equal(q.doc.fire('keydown',{key:'Escape'}).defaultPrevented,false);
      assert.equal(q.settings.panel.hidden,false);assert.equal(q.shellExits,0);
      q.doc.modalOpen=false;q.settings.close();q.doc.fire('keydown',{key:'Escape'});
      assert.equal(q.shellExits,1,'workspace Escape remains available after the panel closes');
    } finally { q.dispose(); }
  });
  await t.test('presets and fixed ratios apply immediately, preserve source/palette, and do not drift after rounding', async () => {
    const q = setup();
    try {
      q.aspect('9:16'); q.preset(128); await wait(180);
      assert.deepEqual([q.session.animation.width, q.session.animation.height], [72, 128]);
      q.range(129); await wait(180); q.preset(256); await wait(180);
      assert.deepEqual([q.session.animation.width, q.session.animation.height], [144, 256]);
      assert.deepEqual(q.source.pixels, q.original);
      assert.deepEqual(q.session.animation.palette, q.source.palette);
    } finally { q.dispose(); }
  });
  await t.test('unchanged values do not leave the apply queue locked', async () => {
    const q = setup();
    try { q.preset(16); await wait(180); q.preset(32); await wait(180); assert.equal(q.session.animation.width, 32); assert.equal(q.commits, 1); }
    finally { q.dispose(); }
  });
  await t.test('invalid numeric input cancels the previous valid debounce', async () => {
    const q = setup();
    try {
      q.input('camera-canvas-settings-width', 80); const field = q.input('camera-canvas-settings-width', '');
      await wait(200); assert.equal(q.commits, 0); assert.equal(field.getAttribute('aria-invalid'), 'true');
      q.input('camera-canvas-settings-width', 48); await wait(180); assert.equal(q.session.animation.width, 48); assert.equal(field.getAttribute('aria-invalid'), null);
    } finally { q.dispose(); }
  });
  await t.test('slow updates serialize and retain the last requested value', async () => {
    const q = setup({ delayed: 240 });
    try {
      q.input('camera-canvas-settings-width', 65); await wait(180);
      q.input('camera-canvas-settings-width', 80); await wait(180);
      q.input('camera-canvas-settings-width', 96); await wait(700);
      assert.equal(q.session.animation.width, 96); assert.equal(q.maximumBusy, 1);
    } finally { q.dispose(); }
  });
  await t.test('Undo recovers cropped cells, reset restores pixels and preexisting history', async () => {
    const q = setup({ priorHistory: true });
    try {
      const initial = q.session.animation, before = q.session.snapshot();
      q.preset(16); await wait(180); q.button('戻す').fire('click'); await wait(10);
      assert.equal(q.session.animation, initial);
      q.preset(16); await wait(180); q.preset(64); await wait(180);
      assert.equal(q.button('この画面の変更をリセット').disabled, false);
      q.button('この画面の変更をリセット').fire('click'); await wait(10);
      assert.deepEqual(q.session.snapshot(), before); assert.equal(q.session.canUndo, true);
      assert.equal(q.dirtyMarks, 1, 'reset schedules persistence of the restored timeline');
    } finally { q.dispose(); }
  });
  await t.test('external edits cancel queued changes and cannot be undone by panel reset', async () => {
    const q = setup();
    try {
      q.preset(32); await wait(180); q.preset(64); q.draw.undo(); await wait(200);
      assert.equal(q.session.animation.width, 16); assert.equal(q.button('この画面の変更をリセット').disabled, true);
    } finally { q.dispose(); }
  });
  await t.test('Escape restores its trigger; close, inactive mode and disposal cancel queued work', async () => {
    const q = setup();
    try {
      q.preset(64); q.doc.fire('keydown', { key: 'Escape' }); await wait(180);
      assert.equal(q.commits, 0); assert.equal(q.settings.panel.hidden, true); assert.equal(q.doc.activeElement, q.trigger);
      q.settings.open({ trigger: q.trigger }); q.preset(64); q.deactivate(); await wait(180); assert.equal(q.commits, 0);
    } finally { q.dispose(); }
    const disposed = setup(); disposed.preset(128); disposed.dispose(); await wait(180); assert.equal(disposed.commits, 0);
  });
});
