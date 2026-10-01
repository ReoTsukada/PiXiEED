import test from 'node:test';
import assert from 'node:assert/strict';
import { bindContextAction, installSiteInteractions } from '../../js/site-interactions.mjs';

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback, options = false) {
    const list = this.listeners.get(type) || []; list.push({ callback, capture: options === true || options?.capture === true }); this.listeners.set(type, list);
  }
  removeEventListener(type, callback) { this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item.callback !== callback)); }
  dispatch(type, values = {}) {
    const event = { type, defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...values };
    for (const item of [...(this.listeners.get(type) || [])].sort((a, b) => Number(b.capture) - Number(a.capture))) item.callback(event);
    return event;
  }
}

class FakeWindow extends Target {
  constructor() { super(); this.time = 0; this.nextTimer = 1; this.timers = new Map(); this.performance = { now: () => this.time }; }
  setTimeout(callback, delay) { const id = this.nextTimer++; this.timers.set(id, { callback, at: this.time + delay }); return id; }
  clearTimeout(id) { this.timers.delete(id); }
  advance(ms) {
    this.time += ms;
    for (const [id, timer] of [...this.timers]) if (timer.at <= this.time) { this.timers.delete(id); timer.callback(); }
  }
}

function event(type, values = {}) { return { type, defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...values }; }

test('site installation is idempotent, leaves editable context menus available, and does not stop propagation', () => {
  const doc = new Target(); const win = new FakeWindow(); let stylesheetCount = 0; let removed = 0;
  doc.head = { append() { stylesheetCount += 1; } };
  doc.getElementById = () => null;
  doc.createElement = () => ({ remove() { removed += 1; } });
  const teardown = installSiteInteractions({ document: doc, window: win });
  assert.equal(installSiteInteractions({ document: doc, window: win }), teardown);
  assert.equal(stylesheetCount, 1);

  const pageEvent = doc.dispatch('contextmenu', { target: { closest: () => null } });
  assert.equal(pageEvent.defaultPrevented, true); assert.equal(pageEvent.stopped, false);
  const editorEvent = doc.dispatch('contextmenu', { target: { closest: (selector) => selector.includes('input') ? {} : null } });
  assert.equal(editorEvent.defaultPrevented, false);
  const drag = doc.dispatch('dragstart', { target: { closest: (selector) => selector === 'img' ? {} : null } });
  assert.equal(drag.defaultPrevented, true);
  teardown(); assert.equal(removed, 1);
});

test('touch long press opens once and consumes only its following click', () => {
  const win = new FakeWindow(); const card = new Target(); card.contains = (target) => target === card;
  const calls = []; const off = bindContextAction(card, (detail) => calls.push(detail), { holdMs: 500, movement: 10, window: win });
  win.dispatch('pointerdown', { target: card, pointerId: 3, pointerType: 'touch', isPrimary: true, button: 0, clientX: 20, clientY: 30 });
  win.advance(499); assert.equal(calls.length, 0);
  win.advance(1); assert.equal(calls.length, 1); assert.equal(calls[0].source, 'hold');
  win.dispatch('pointerup', { pointerId: 3, pointerType: 'touch' });
  const click = card.dispatch('click'); assert.equal(click.defaultPrevented, true); assert.equal(click.stopped, true);
  const nextClick = card.dispatch('click'); assert.equal(nextClick.defaultPrevented, false);
  const nativeMenu = card.dispatch('contextmenu', { button: 2, clientX: 20, clientY: 30 });
  assert.equal(nativeMenu.defaultPrevented, true); assert.equal(calls.length, 1);
  off();
});

test('a long press that does not open a menu leaves the following tap available', () => {
  const win = new FakeWindow(); const card = new Target(); card.contains = (target) => target === card;
  const off = bindContextAction(card, () => false, { holdMs: 100, window: win });
  win.dispatch('pointerdown', { target: card, pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: 1, clientY: 1 });
  win.advance(100);
  const click = card.dispatch('click'); assert.equal(click.defaultPrevented, false);
  off();
});

test('movement, cancellation, and a second touch cancel the hold without suppressing a tap', () => {
  const win = new FakeWindow(); const card = new Target(); card.contains = (target) => target === card;
  const calls = []; const off = bindContextAction(card, (detail) => calls.push(detail), { holdMs: 500, movement: 10, window: win });
  const down = (id, primary = true) => win.dispatch('pointerdown', { target: card, pointerId: id, pointerType: 'touch', isPrimary: primary, button: 0, clientX: 10, clientY: 10 });
  down(1); win.dispatch('pointermove', { pointerId: 1, pointerType: 'touch', clientX: 21, clientY: 10 }); win.advance(600);
  down(2); win.dispatch('pointercancel', { pointerId: 2, pointerType: 'touch' }); win.advance(600);
  down(3); down(4, false); win.advance(600);
  assert.equal(calls.length, 0);
  const click = card.dispatch('click'); assert.equal(click.defaultPrevented, false);
  off();
});

test('desktop and keyboard context actions provide stable menu coordinates', () => {
  const win = new FakeWindow(); const card = new Target(); card.getBoundingClientRect = () => ({ left: 10, top: 20, width: 100, height: 40 });
  const calls = []; const off = bindContextAction(card, (detail) => calls.push(detail), { window: win });
  const right = card.dispatch('contextmenu', { button: 2, clientX: 45, clientY: 60 });
  assert.equal(right.defaultPrevented, true); assert.deepEqual([calls[0].source, calls[0].x, calls[0].y], ['contextmenu', 45, 60]);
  const keyboard = card.dispatch('contextmenu', { button: 0, clientX: 0, clientY: 0 });
  assert.equal(keyboard.defaultPrevented, true); assert.deepEqual([calls[1].source, calls[1].x, calls[1].y], ['keyboard', 60, 40]);
  off();
});
