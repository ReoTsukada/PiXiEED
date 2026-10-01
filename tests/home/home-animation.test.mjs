import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisibleAnimationScheduler } from '../../js/home-animation.mjs';

function fakeBrowser({ observer = true } = {}) {
  let time = 0; let nextId = 1;
  const rafs = new Map(); const timers = new Map(); const listeners = new Map(); const docListeners = new Map();
  const observed = new Set();
  const doc = {
    visibilityState: 'visible', documentElement: { clientWidth: 100, clientHeight: 100 },
    addEventListener(name, fn) { docListeners.set(name, fn); },
    removeEventListener(name) { docListeners.delete(name); },
  };
  class FakeIntersectionObserver {
    constructor(callback, options) { this.callback = callback; this.options = options; }
    observe(element) { observed.add(element); }
    unobserve(element) { observed.delete(element); }
    disconnect() { observed.clear(); }
    trigger(entries = []) { this.callback(entries); }
  }
  const env = {
    document: doc, innerWidth: 100, innerHeight: 100, performance: { now: () => time },
    ...(observer ? { IntersectionObserver: FakeIntersectionObserver } : {}),
    requestAnimationFrame(callback) { const id = nextId++; rafs.set(id, callback); return id; },
    cancelAnimationFrame(id) { rafs.delete(id); },
    setTimeout(callback, delay) { const id = nextId++; timers.set(id, { callback, due: time + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener(name) { listeners.delete(name); },
  };
  const element = (rect = { left: 1, top: 1, right: 20, bottom: 20, width: 19, height: 19 }) => ({ getBoundingClientRect: () => rect });
  const tick = (at = time + 1000 / 60) => {
    time = at; const pending = [...rafs.values()]; rafs.clear(); pending.forEach((callback) => callback(time));
  };
  const elapseTimers = (ms) => {
    time += ms;
    const due = [...timers.entries()].filter(([, timer]) => timer.due <= time);
    due.forEach(([id, timer]) => timers.delete(id)); due.forEach(([, timer]) => timer.callback());
  };
  return {
    env, doc, element, observed, rafs, timers, time: () => time, tick, elapseTimers,
    scroll() { listeners.get('scroll')?.(); }, resize() { listeners.get('resize')?.(); },
    visibility(state) { doc.visibilityState = state; docListeners.get('visibilitychange')?.(); },
    page(name) { listeners.get(name)?.(); },
  };
}

test('reduced motion keeps gentle updates and only draws strictly visible entries', () => {
  const browser = fakeBrowser(); const scheduler = createVisibleAnimationScheduler(browser.env); scheduler.setReducedMotion(true);
  let visibleDraws = 0; let outsideDraws = 0;
  scheduler.add(browser.element(), () => visibleDraws++);
  scheduler.add(browser.element({ left: 101, top: 1, right: 120, bottom: 20, width: 19, height: 19 }), () => outsideDraws++);
  browser.tick(84); browser.tick(168); browser.tick(252);
  assert.ok(visibleDraws >= 2, 'reduced mode continues at up to 30 FPS');
  assert.equal(outsideDraws, 0);
  const observer = [...browser.observed]; assert.equal(observer.length, 2);
  scheduler.dispose();
});

test('hidden documents stop all scheduled work and visibility restoration restarts it', () => {
  const browser = fakeBrowser(); const scheduler = createVisibleAnimationScheduler(browser.env); let draws = 0;
  scheduler.add(browser.element(), () => draws++); browser.tick(40);
  browser.visibility('hidden');
  assert.equal(browser.rafs.size, 0); assert.equal(browser.timers.size, 0);
  const stoppedAt = draws; browser.tick(500); assert.equal(draws, stoppedAt);
  browser.visibility('visible'); browser.tick(540); assert.ok(draws > stoppedAt);
  scheduler.dispose();
});

test('a single pump caps paint rates and responds to a live motion preference change', () => {
  const browser = fakeBrowser(); const scheduler = createVisibleAnimationScheduler(browser.env); let draws = 0;
  scheduler.add(browser.element(), () => draws++, { fps: 60 });
  for (let frame = 1; frame <= 120; frame++) browser.tick(frame * 1000 / 120);
  assert.ok(draws >= 59 && draws <= 61, `normal paint rate: ${draws}`);
  const before = draws; scheduler.setReducedMotion(true);
  for (let frame = 121; frame <= 240; frame++) browser.tick(frame * 1000 / 120);
  assert.ok(draws - before >= 29 && draws - before <= 31, `reduced paint rate: ${draws - before}`);
  assert.equal(browser.rafs.size, 1); assert.equal(browser.timers.size, 1);
  scheduler.dispose();
});

test('one 120 Hz pump supports independent rates, with a 30 FPS reduced cap', () => {
  const browser = fakeBrowser(); const scheduler = createVisibleAnimationScheduler(browser.env);
  let heroDraws = 0; let cardDraws = 0;
  scheduler.add(browser.element(), () => heroDraws++, { fps: 60 });
  scheduler.add(browser.element(), () => cardDraws++);
  for (let frame = 1; frame <= 120; frame++) browser.tick(frame * 1000 / 120);
  assert.ok(heroDraws >= 59 && heroDraws <= 61, `hero at 120 Hz: ${heroDraws}`);
  assert.ok(cardDraws >= 29 && cardDraws <= 31, `cards at 120 Hz: ${cardDraws}`);

  scheduler.setReducedMotion(true);
  const beforeHero = heroDraws; const beforeCard = cardDraws;
  for (let frame = 121; frame <= 240; frame++) browser.tick(frame * 1000 / 120);
  assert.ok(heroDraws - beforeHero >= 29 && heroDraws - beforeHero <= 31, `reduced hero cap: ${heroDraws - beforeHero}`);
  assert.ok(cardDraws - beforeCard >= 29 && cardDraws - beforeCard <= 31, `reduced card cap: ${cardDraws - beforeCard}`);
  assert.equal(browser.rafs.size, 1); assert.equal(browser.timers.size, 1);
  scheduler.dispose();
});

test('observer and fallback viewport checks honor partial intersection and scroll', () => {
  const rect = { left: 110, top: 10, right: 130, bottom: 30, width: 20, height: 20 };
  const observedBrowser = fakeBrowser(); const observedScheduler = createVisibleAnimationScheduler(observedBrowser.env); let draws = 0;
  const observedElement = observedBrowser.element(rect); observedScheduler.add(observedElement, () => draws++);
  assert.equal(observedBrowser.rafs.size, 0);
  rect.left = 99; rect.right = 119; observedBrowser.scroll(); observedBrowser.tick(40);
  assert.equal(draws, 1, 'the scheduler rechecks exact bounds when notified');
  observedScheduler.dispose();

  const fallback = fakeBrowser({ observer: false }); const fallbackScheduler = createVisibleAnimationScheduler(fallback.env); let fallbackDraws = 0;
  const fallbackElement = fallback.element(rect); fallbackScheduler.add(fallbackElement, () => fallbackDraws++);
  rect.left = 110; rect.right = 130; fallback.scroll(); assert.equal(fallback.rafs.size, 0);
  rect.left = 1; rect.right = 21; fallback.scroll(); fallback.tick(80);
  assert.equal(fallbackDraws, 1);
  fallbackScheduler.dispose();
});

test('pagehide pauses, pageshow restores one shared pump without duplicate frames', () => {
  const browser = fakeBrowser(); const scheduler = createVisibleAnimationScheduler(browser.env); let draws = 0;
  scheduler.add(browser.element(), () => draws++); scheduler.add(browser.element(), () => draws++);
  assert.equal(browser.rafs.size, 1); assert.equal(browser.timers.size, 1);
  browser.page('pagehide'); assert.equal(browser.rafs.size, 0); assert.equal(browser.timers.size, 0);
  browser.page('pageshow'); assert.equal(browser.rafs.size, 1); assert.equal(browser.timers.size, 1);
  browser.tick(40); assert.equal(draws, 2);
  scheduler.dispose();
});

test('watchdog recovers visible drawing when requestAnimationFrame stalls', () => {
  const browser = fakeBrowser(); const scheduler = createVisibleAnimationScheduler(browser.env); let draws = 0;
  scheduler.add(browser.element(), () => draws++, { fps: 60 });
  for (let frame = 0; frame < 6; frame++) browser.elapseTimers(34);
  assert.equal(draws, 6, 'visible hero keeps updating while rAF is stalled');
  assert.equal(browser.rafs.size, 1); assert.equal(browser.timers.size, 1);
  scheduler.dispose(); assert.equal(browser.timers.size, 0);
});

test('a slow animation frame does not cancel the pending frame or halve automatic playback', () => {
  const browser = fakeBrowser(); const scheduler = createVisibleAnimationScheduler(browser.env); let draws = 0;
  scheduler.add(browser.element(), () => draws++, { fps: 60 });
  for (let frame = 0; frame < 10; frame++) browser.elapseTimers(18);
  assert.ok(draws >= 9, `timer fills missing 60 FPS frames: ${draws}`);
  assert.equal(browser.rafs.size, 1, 'the browser frame stays pending while fallback frames run');
  const beforeRecovery = draws;
  browser.tick(200);
  assert.equal(draws, beforeRecovery + 1, 'the recovered browser frame is drawn once');
  assert.equal(browser.rafs.size, 1);
  assert.equal(browser.timers.size, 1);
  scheduler.dispose();
});

test('a drawing exception removes only that entry and leaves other animations running', () => {
  const browser = fakeBrowser(); const scheduler = createVisibleAnimationScheduler(browser.env); let goodDraws = 0;
  const badElement = browser.element(); const goodElement = browser.element();
  scheduler.add(badElement, () => { throw new Error('isolated'); });
  scheduler.add(goodElement, () => goodDraws++);
  browser.tick(40); browser.tick(80);
  assert.equal(goodDraws, 2); assert.equal(browser.observed.size, 1);
  assert.equal(browser.observed.has(badElement), false);
  assert.equal(browser.observed.has(goodElement), true);
  scheduler.dispose();
});

test('redraw draws once and reuses the pending shared frame; disposal disconnects everything', () => {
  const browser = fakeBrowser(); const scheduler = createVisibleAnimationScheduler(browser.env); let draws = 0;
  const el = browser.element(); scheduler.add(el, () => draws++);
  const before = draws; scheduler.redraw(el);
  assert.equal(draws, before + 1); assert.equal(browser.rafs.size, 1);
  scheduler.dispose();
  assert.equal(browser.rafs.size, 0); assert.equal(browser.timers.size, 0); assert.equal(browser.observed.size, 0);
});

test('throttled redraw never exceeds its rate during rapid input and paints the latest state later', () => {
  for (const reduced of [false, true]) {
    const browser = fakeBrowser(); const scheduler = createVisibleAnimationScheduler(browser.env);
    scheduler.setReducedMotion(reduced);
    let state = 0; const painted = [];
    const el = browser.element(); scheduler.add(el, () => painted.push(state), { fps: 60, throttleRedraw: true });
    scheduler.redraw(el); assert.deepEqual(painted, [0], 'first frame appears immediately');
    for (let frame = 1; frame <= 120; frame++) { state = frame; browser.tick(frame * 1000 / 120); scheduler.redraw(el); }
    const expected = reduced ? 30 : 60;
    assert.ok(painted.length >= expected && painted.length <= expected + 1, `${expected} FPS cap during rapid input: ${painted.length}`);
    state = 121; scheduler.redraw(el);
    browser.tick(1040);
    assert.equal(painted.at(-1), 121, 'next permitted frame paints the latest input');
    scheduler.dispose();
  }
});
