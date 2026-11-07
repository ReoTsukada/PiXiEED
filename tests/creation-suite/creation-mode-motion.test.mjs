import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mountCreationModeMotion } from '../../js/creation/creation-mode-motion.mjs';

function fixture({ reduced = false, supported = true } = {}) {
  const timers = new Map(), calls = [], listeners = [], disposers = [];
  let timerId = 0;
  const media = { matches: reduced };
  const view = {
    matchMedia: () => media,
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  const doc = { defaultView: view, hidden: false };
  function element(tag) {
    const node = {
      tag, ownerDocument: doc, children: [], dataset: {}, style: {}, attributes: {}, hidden: false,
      append(...nodes) { this.children.push(...nodes); nodes.forEach(child => { child.parent = this; }); },
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) {
        delete this.attributes[name];
        if (name.startsWith('data-')) delete this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())];
      },
      remove() { this.parent.children = this.parent.children.filter(child => child !== this); },
      getBoundingClientRect() { return { ...this.rect }; }
    };
    if (supported) node.animate = (frames, options) => {
      let resolve, reject;
      const finished = new Promise((yes, no) => { resolve = yes; reject = no; });
      const animation = { node, frames, options, finished, cancelled: false,
        finish: resolve, cancel() { this.cancelled = true; reject(new Error('cancelled')); } };
      calls.push(animation);
      return animation;
    };
    return node;
  }
  doc.createElement = element;
  doc.body = element('body'); doc.body.dataset.creationMode = 'draw';
  const board = element('board'); board.rect = { left: 100, top: 80, width: 400, height: 300 };
  const canvas = element('canvas'); board.append(canvas);
  const controls = element('controls'), main = element('main');
  main.querySelector = selector => selector === '.draw-control-dock' ? controls : null;
  const scope = {
    disposed: false,
    listen(target, type, fn) { listeners.push({ target, type, fn }); },
    add(fn) { disposers.push(fn); }
  };
  const motion = mountCreationModeMotion({ board, main, scope });
  const cue = doc.body.children[0];
  return { motion, doc, view, board, canvas, main, controls, media, scope, cue, calls, timers,
    emit(target, type) { for (const item of listeners) if (item.target === target && item.type === type) item.fn(); },
    finish() { calls.forEach(item => item.finish()); },
    timeout() { for (const [id, timer] of [...timers]) { timers.delete(id); timer.fn(); } },
    dispose() { scope.disposed = true; disposers.forEach(fn => fn()); }
  };
}

const tick = () => Promise.resolve();

test('leave is synchronous and retains the current mode and live canvas while loading', async () => {
  const f = fixture();
  assert.equal(f.motion.leave('draw', 'audio'), undefined);
  assert.equal(f.timers.size, 0);
  assert.equal(f.cue.hidden, false);
  assert.equal(f.cue.dataset.phase, 'loading');
  assert.equal(f.cue.children[1].textContent, '音楽へ切替中');
  await tick();
  assert.equal(f.doc.body.dataset.creationMode, 'draw');
  assert.equal(f.board.children[0], f.canvas);
  assert.deepEqual(f.cue.style, {});
  assert.ok(f.calls.every(call => call.frames.every(frame => !('backgroundColor' in frame))));
  assert.deepEqual(f.calls.map(call => call.node), [f.cue]);
  f.motion.cancel();
});

test('FLIP measures the final desktop board and animates no canvas or main shell', async () => {
  const f = fixture();
  f.motion.leave('draw', 'audio');
  const entering = f.motion.enter('audio');
  // Synchronous desktop refresh can run before enter resumes its microtask.
  f.board.rect = { left: 40, top: 100, width: 800, height: 600 };
  await tick();
  const flip = f.calls.find(call => call.node === f.board);
  assert.ok(flip);
  assert.equal(f.board.dataset.creationModeMotion, 'true');
  assert.deepEqual(flip.frames[0], { transformOrigin: '0 0', transform: 'translate(60px,-20px) scale(0.5,0.5)' });
  assert.equal(flip.options.duration, 280);
  assert.ok(!f.calls.some(call => call.node === f.canvas || call.node === f.main || call.node === f.doc.body));
  f.finish(); await entering;
  assert.equal(f.cue.hidden, true);
    assert.equal(f.board.dataset.creationModeMotion, undefined);
  assert.deepEqual(f.cue.dataset, {});
  assert.equal(f.timers.size, 0);
  assert.ok(f.calls.every(call => call.cancelled));
  assert.deepEqual(f.board.style, {});
  assert.equal(f.board.children[0], f.canvas);
});

for (const options of [{ reduced: true }, { supported: false }]) {
  test(`reduced motion or missing WAAPI switches without blackout or wait: ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    f.motion.leave('draw', 'audio');
    assert.equal(f.cue.hidden, false);
    await f.motion.enter('audio');
    assert.equal(f.cue.hidden, true);
    assert.equal(f.board.dataset.creationModeMotion, undefined);
    assert.equal(f.calls.length, 0);
    assert.equal(f.timers.size, 0);
    assert.deepEqual(f.cue.style, {});
  });
}

test('watchdog completes stalled animation promises and clears all effects', async () => {
  const f = fixture(); f.motion.leave('draw', 'audio');
  const entering = f.motion.enter('audio'); await tick();
  assert.deepEqual([...f.timers.values()].map(timer => timer.delay), [480]);
  f.timeout(); await entering;
  assert.equal(f.cue.hidden, true);
    assert.equal(f.board.dataset.creationModeMotion, undefined);
  assert.equal(f.timers.size, 0);
  assert.ok(f.calls.every(call => call.cancelled));
});

test('cancelling an old enter cannot hide a newer loading cue', async () => {
  const f = fixture(); f.motion.leave('draw', 'audio');
  const oldEnter = f.motion.enter('audio'); await tick();
  f.motion.cancel(); f.motion.leave('audio', 'draw');
  await oldEnter;
  assert.equal(f.board.dataset.creationModeMotion, undefined);
  assert.equal(f.cue.hidden, false);
  assert.equal(f.cue.dataset.phase, 'loading');
  assert.equal(f.cue.dataset.effect, 'draw');
  assert.equal(f.timers.size, 0);
  f.motion.cancel();
});

test('cancellation before enter microtask cannot install stale effects', async () => {
  const f = fixture(); f.motion.leave('draw', 'audio');
  const oldEnter = f.motion.enter('audio');
  f.motion.leave('draw', 'camera');
  await oldEnter;
  assert.equal(f.board.dataset.creationModeMotion, undefined);
  assert.equal(f.cue.dataset.effect, 'camera');
  assert.equal(f.cue.dataset.phase, 'loading');
  assert.ok(!f.calls.some(call => call.node === f.board));
  f.motion.cancel();
});

for (const [previous, next] of [['camera', 'draw'], ['audio', 'camera']]) {
  test(`camera transition does not scale board: ${previous} to ${next}`, async () => {
    const f = fixture(); f.motion.leave(previous, next);
    const entering = f.motion.enter(next); await tick();
    assert.ok(!f.calls.some(call => call.node === f.board));
    assert.equal(f.board.dataset.creationModeMotion, undefined);
    f.finish(); await entering;
    assert.equal(f.board.dataset.creationModeMotion, undefined);
  });
}

test('reduced-motion changes terminate an active reveal, while loading stays visible', async () => {
  const f = fixture(); f.motion.leave('draw', 'audio');
  f.media.matches = true; f.emit(f.media, 'change');
  assert.equal(f.cue.hidden, false);
  assert.equal(f.cue.dataset.phase, 'loading');
  f.media.matches = false;
  const entering = f.motion.enter('audio'); await tick();
  f.media.matches = true; f.emit(f.media, 'change'); await entering;
  assert.equal(f.cue.hidden, true);
    assert.equal(f.board.dataset.creationModeMotion, undefined);
  assert.equal(f.timers.size, 0);
  assert.ok(f.calls.every(call => call.cancelled));
});

for (const event of ['resize', 'pagehide', 'visibilitychange', 'dispose']) {
  test(`${event} cancels active reveal and releases its waiter`, async () => {
    const f = fixture(); f.motion.leave('draw', 'audio');
    const entering = f.motion.enter('audio'); await tick();
    if (event === 'dispose') f.dispose();
    else if (event === 'visibilitychange') { f.doc.hidden = true; f.emit(f.doc, event); }
    else f.emit(f.view, event);
    await entering;
    assert.equal(f.cue.hidden, true);
    assert.equal(f.board.dataset.creationModeMotion, undefined);
    assert.equal(f.timers.size, 0);
    assert.ok(f.calls.every(call => call.cancelled));
    if (event === 'dispose') assert.equal(f.doc.body.children.length, 0);
  });
}


test('cancellation clears geometry guard before a replacement board animation', async () => {
  const f = fixture(); f.motion.leave('draw', 'audio');
  const oldEnter = f.motion.enter('audio'); await tick();
  assert.equal(f.board.dataset.creationModeMotion, 'true');
  f.motion.cancel();
  assert.equal(f.board.dataset.creationModeMotion, undefined);
  f.motion.leave('audio', 'draw');
  const newEnter = f.motion.enter('draw'); await tick();
  assert.equal(f.board.dataset.creationModeMotion, 'true');
  await oldEnter;
  assert.equal(f.board.dataset.creationModeMotion, 'true');
  assert.equal(f.cue.hidden, false);
  f.finish(); await newEnter;
  assert.equal(f.board.dataset.creationModeMotion, undefined);
});

test('source contract guards viewport measurement and refreshes layout before motion', async () => {
  // This complements the fake DOM: it checks integration wiring, not rendered pixels.
  const page = await readFile(new URL('../../js/creation/draw-page.mjs', import.meta.url), 'utf8');
  const modes = await readFile(new URL('../../js/creation/creation-modes.mjs', import.meta.url), 'utf8');
  const update = page.slice(page.indexOf('function updateCanvasView()'), page.indexOf('function placeOverlays()'));
  assert.match(update, /if \(\$\('\.draw-board'\)\.dataset\.creationModeMotion === 'true'\) return;/);
  assert.ok(update.indexOf('creationModeMotion') < update.indexOf('clampPan()'));
  const overlays = page.slice(page.indexOf('function placeOverlays()'), page.indexOf('function selectionFrame()'));
  assert.match(overlays, /board\.dataset\.creationModeMotion === 'true'\) return;/);
  assert.ok(overlays.indexOf('creationModeMotion') < overlays.indexOf('getBoundingClientRect()'));
  assert.match(page, /refreshModeLayout\(\) \{ desktopUi\.layout\(\); updateCanvasView\(\); \}/);
  const transition = modes.slice(modes.indexOf('mode = next; startupSwitchPending = false;'), modes.indexOf('} catch (error)', modes.indexOf('mode = next; startupSwitchPending = false;')));
  assert.ok(transition.indexOf('show(mode)') >= 0);
  assert.ok(transition.indexOf('show(mode)') < transition.indexOf('draw.refreshModeLayout?.()'));
  assert.ok(transition.indexOf('draw.refreshModeLayout?.()') < transition.indexOf('await motion.enter(mode)'));
  assert.match(modes, /finally \{\s*motion\.cancel\(\);[\s\S]*?resumeCurrent\(\)/);
});
