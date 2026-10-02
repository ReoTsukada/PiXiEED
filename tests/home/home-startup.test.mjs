import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

function getScheduler() {
  const source = read('js/home-startup.mjs');
  const declaration = source.match(/export function scheduleAppStartup\([\s\S]*?\n\}\n\nscheduleAppStartup\(\);/)?.[0].replace(/\n\nscheduleAppStartup\(\);$/, '');
  assert.ok(declaration, 'startup scheduler is exported for focused testing');
  return vm.runInNewContext(`${declaration.replace(/^export /, '')}\nscheduleAppStartup`, { console });
}

function fakeBrowser({ hidden = false, idle = true } = {}) {
  let nextId = 1;
  const timers = new Map(); const frames = new Map(); const idles = new Map(); const listeners = new Map();
  const doc = {
    hidden,
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
  };
  const win = {
    requestAnimationFrame(fn) { const id = nextId++; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout(fn, delay) { const id = nextId++; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    requestIdleCallback: idle ? (fn, options) => { const id = nextId++; idles.set(id, { fn, options }); return id; } : undefined,
    cancelIdleCallback(id) { idles.delete(id); },
  };
  return { doc, win, timers, frames, idles, listeners, runFrame() { const [id, fn] = frames.entries().next().value || []; if (fn) { frames.delete(id); fn(16); } }, runTimer(id) { const timer = timers.get(id); if (timer) { timers.delete(id); timer.fn(); } },
    runIdle(id) { const task = idles.get(id); if (task) { idles.delete(id); task.fn(); } },
    setHidden(value) { doc.hidden = value; listeners.get('visibilitychange')?.(); } };
}

test('home startup waits for two frames and idle, then loads app once', async () => {
  const scheduleAppStartup = getScheduler(); const browser = fakeBrowser(); let calls = 0;
  scheduleAppStartup({ ...browser, loadApp: () => { calls++; } });
  assert.equal(calls, 0);
  browser.runFrame(); browser.runFrame();
  const [[idleId, task]] = browser.idles;
  assert.equal(task.options.timeout, 500);
  browser.runIdle(idleId); await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(browser.timers.size, 0);
});

test('home startup fallback loads once when requestAnimationFrame stalls', async () => {
  const scheduleAppStartup = getScheduler(); const browser = fakeBrowser(); let calls = 0;
  scheduleAppStartup({ ...browser, loadApp: () => { calls++; } });
  const [[timerId, timer]] = browser.timers;
  assert.equal(timer.delay, 500);
  browser.runTimer(timerId); await Promise.resolve();
  assert.equal(calls, 1);
  for (const fn of browser.frames.values()) fn(16);
  assert.equal(browser.idles.size, 0);
  assert.equal(calls, 1);
});

test('home startup waits while hidden and handles app import failures', async () => {
  const scheduleAppStartup = getScheduler(); const browser = fakeBrowser({ hidden: true }); let calls = 0; const errors = [];
  scheduleAppStartup({ ...browser, loadApp: () => { calls++; return Promise.reject(new Error('load failed')); }, onError: (error) => errors.push(error.message) });
  assert.equal(browser.timers.size, 0);
  browser.setHidden(false);
  browser.runFrame(); browser.runFrame();
  const [[idleId]] = browser.idles;
  browser.runIdle(idleId); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.deepEqual(errors, ['load failed']);
});

test('home index keeps motion preference available before the eagerly loaded hero module', () => {
  const html = read('index.html');
  assert.ok(html.indexOf("localStorage.getItem('PiXiEED:motion-preference:v1')") < html.indexOf('home-startup.mjs'));
  assert.match(html, /document\.documentElement\.dataset\.pixieedMotion = 'reduced'/);
  assert.match(html, /modulepreload" href="\/js\/home-play\.mjs\?rev=[\w-]+/);
  assert.match(html, /src="\/js\/home-startup\.mjs\?rev=[\w-]+/);
  assert.doesNotMatch(html, /src="\/js\/app\.js\?rev=/);
});
