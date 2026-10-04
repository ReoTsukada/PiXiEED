import test from 'node:test';
import assert from 'node:assert/strict';
import { attachZoomGestures } from '../../js/pixel-lens/zoom.mjs';

class FakeClock {
  time = 0;
  nextId = 1;
  timers = new Map();
  now = () => this.time;
  setTimer = (fn, delay) => { const id = this.nextId++; this.timers.set(id, { at: this.time + delay, fn }); return id; };
  clearTimer = (id) => this.timers.delete(id);
  advance(ms) {
    const end = this.time + ms;
    while (true) {
      const next = [...this.timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      this.time = next[1].at;
      this.timers.delete(next[0]);
      next[1].fn();
    }
    this.time = end;
  }
}

function setup(options = {}) {
  const target = new EventTarget();
  target.setPointerCapture = () => {};
  const clock = new FakeClock();
  const calls = { taps: 0, doubles: [], holds: [], zoom: [], drag: [], gestures: [] };
  const gesture = attachZoomGestures(target, {
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    get: () => 1, set: (...args) => calls.zoom.push(args),
    onTap: () => calls.taps++, onDoubleTap: (event) => calls.doubles.push([event.clientX, event.clientY]),
    onLongPress: (event) => { calls.holds.push([event.clientX, event.clientY]); return true; },
    onDrag: (...args) => calls.drag.push(args), onGesture: (name) => calls.gestures.push(name),
    ...options
  });
  const send = (type, { id = 1, x = 20, y = 30, button = 0 } = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerId: id, clientX: x, clientY: y, button, deltaY: 10, ctrlKey: false });
    target.dispatchEvent(event);
    return event;
  };
  return { target, clock, calls, gesture, send };
}

function tap(ctx, id, x, y) {
  ctx.send('pointerdown', { id, x, y });
  ctx.clock.advance(80);
  ctx.send('pointerup', { id, x, y });
}

test('single tap is delayed so a double tap never triggers colour picking first', () => {
  const ctx = setup();
  tap(ctx, 1, 20, 30);
  assert.equal(ctx.calls.taps, 0);
  ctx.clock.advance(300);
  assert.equal(ctx.calls.taps, 1);
});

test('nearby double tap calls the point callback and suppresses both single taps', () => {
  const ctx = setup();
  tap(ctx, 1, 20, 30);
  ctx.clock.advance(80);
  tap(ctx, 2, 42, 35);
  assert.deepEqual(ctx.calls.doubles, [[42, 35]]);
  ctx.clock.advance(400);
  assert.equal(ctx.calls.taps, 0);
  assert.deepEqual(ctx.calls.zoom, []);
});

test('distant taps are not interpreted as a double tap', () => {
  const ctx = setup();
  tap(ctx, 1, 20, 30);
  ctx.clock.advance(60);
  tap(ctx, 2, 100, 30);
  assert.equal(ctx.calls.doubles.length, 0);
  assert.equal(ctx.calls.taps, 1);
  ctx.clock.advance(300);
  assert.equal(ctx.calls.taps, 2);
});

test('long press is consumed and reports the held point, even if callback has no useful result', () => {
  const ctx = setup({ onLongPress: (event) => { ctx?.calls?.holds?.push([event.clientX, event.clientY]); } });
  ctx.send('pointerdown', { x: 80, y: 90 });
  ctx.clock.advance(550);
  ctx.send('pointerup', { x: 80, y: 90 });
  ctx.clock.advance(400);
  assert.deepEqual(ctx.calls.holds, [[80, 90]]);
  assert.equal(ctx.calls.taps, 0);
});

test('movement beyond threshold cancels hold and pending tap', () => {
  const ctx = setup();
  ctx.send('pointerdown', { x: 10, y: 10 });
  ctx.clock.advance(100);
  ctx.send('pointermove', { x: 22, y: 10 });
  ctx.clock.advance(500);
  ctx.send('pointerup', { x: 22, y: 10 });
  ctx.clock.advance(400);
  assert.equal(ctx.calls.holds.length, 0);
  assert.equal(ctx.calls.taps, 0);
});

test('a second pointer cancels the hold and pinch sends only one gesture end', () => {
  const ctx = setup();
  ctx.send('pointerdown', { id: 1, x: 10, y: 10 });
  ctx.clock.advance(100);
  ctx.send('pointerdown', { id: 2, x: 50, y: 10 });
  ctx.send('pointerup', { id: 2, x: 50, y: 10 });
  ctx.send('pointerup', { id: 1, x: 10, y: 10 });
  ctx.clock.advance(600);
  assert.equal(ctx.calls.holds.length, 0);
  assert.deepEqual(ctx.calls.gestures, ['start', 'end']);
  assert.equal(ctx.calls.taps, 0);
});

test('pointer cancellation and wheel cancel hold and pending taps', () => {
  const canceled = setup();
  tap(canceled, 1, 10, 10);
  canceled.send('pointerdown', { id: 2, x: 10, y: 10 });
  canceled.send('pointercancel', { id: 2, x: 10, y: 10 });
  canceled.clock.advance(400);
  assert.equal(canceled.calls.taps, 0);

  const wheeled = setup();
  wheeled.send('pointerdown', { x: 10, y: 10 });
  const wheel = new Event('wheel', { cancelable: true });
  Object.assign(wheel, { deltaY: 20, ctrlKey: false });
  wheeled.target.dispatchEvent(wheel);
  wheeled.send('pointerup', { x: 10, y: 10 });
  wheeled.clock.advance(700);
  assert.equal(wheeled.calls.holds.length, 0);
  assert.equal(wheeled.calls.taps, 0);
  assert.equal(wheeled.calls.zoom.length, 1);
});
