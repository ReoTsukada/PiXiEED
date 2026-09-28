#!/usr/bin/env node
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const BASE = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4173';
const origin = new URL(BASE).origin;
if (!['localhost', '127.0.0.1'].includes(new URL(BASE).hostname)) throw new Error('A localhost-only test server is required');
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set PIXIEED_PLAYWRIGHT_MODULE to an existing Playwright installation');
const { chromium, webkit } = await import(pathToFileURL(modulePath).href);

const hour = 60 * 60 * 1000;
let checks = 0;
function pass(label) { checks += 1; console.log(`PASS ${label}`); }

async function localOnly(page) {
  await page.route('**/*', (route) => new URL(route.request().url()).origin === origin
    ? route.continue()
    : route.abort());
}

async function setRemaining(page, remainingMs) {
  await page.evaluate((ms) => {
    localStorage.setItem('pixieed:pass:v1', JSON.stringify({ until: Date.now() + ms }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'pixieed:pass:v1' }));
  }, remainingMs);
}

async function gaugeState(page) {
  return page.evaluate(() => {
    const button = document.querySelector('[data-header-pass]');
    const label = button?.querySelector('[data-header-pass-label]');
    const rows = [...(button?.querySelectorAll('.px-pass-gauge-row') || [])];
    const controls = [...(document.querySelector('.px-site-header')?.querySelectorAll('a,button,input,select,[role="button"]') || [])]
      .filter((node) => {
        for (let parent = node; parent; parent = parent.parentElement) {
          if (parent.hidden || getComputedStyle(parent).display === 'none' || getComputedStyle(parent).visibility === 'hidden') return false;
          if (parent.tagName === 'DETAILS' && !parent.open) return false;
        }
        return Boolean(node.getClientRects().length);
      })
      .map((node) => { const r = node.getBoundingClientRect(); return { node, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; });
    const rect = (node) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
    const buttonRect = rect(button);
    const intersections = [];
    for (let i = 0; i < controls.length; i += 1) for (let j = i + 1; j < controls.length; j += 1) {
      const a = controls[i], b = controls[j];
      if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) intersections.push([a.node.id || a.node.className || a.node.tagName, b.node.id || b.node.className || b.node.tagName]);
    }
    const externalOverlaps = [...document.querySelectorAll('body a,body button,body input,body select,[role="button"]')]
      .filter((node) => {
        if (document.querySelector('.px-site-header')?.contains(node)) return false;
        for (let parent = node; parent; parent = parent.parentElement) {
          if (parent.hidden || getComputedStyle(parent).display === 'none' || getComputedStyle(parent).visibility === 'hidden') return false;
          if (parent.tagName === 'DETAILS' && !parent.open) return false;
        }
        return Boolean(node.getClientRects().length);
      })
      .map((node) => ({ node, ...rect(node) }))
      .filter((r) => buttonRect.left < r.right && buttonRect.right > r.left && buttonRect.top < r.bottom && buttonRect.bottom > r.top)
      .map((r) => r.node.id || r.node.className || r.node.tagName);
    const hit = document.elementFromPoint((buttonRect.left + buttonRect.right) / 2, (buttonRect.top + buttonRect.bottom) / 2);
    const cells = rows.map((row) => [...row.querySelectorAll('.px-pass-cell')].map((cell) => cell.dataset.filled === 'true'));
    const motion = [...button.querySelectorAll('*')].flatMap((node) => node.getAnimations?.() || []);
    const labelRect = label ? rect(label) : null;
    return {
      button: buttonRect,
      label: label?.textContent || '',
      add: button?.querySelector('.px-pass-add')?.textContent || '',
      labelTitle: button?.title || '',
      labelAria: button?.getAttribute('aria-label') || '',
      labelOverflow: label ? label.scrollWidth > label.clientWidth : true,
      labelRect,
      dataActive: button?.dataset.active,
      dataBank: button?.dataset.bank,
      dataLong: button?.dataset.long === 'true',
      dataRecharged: button?.dataset.recharged === 'true',
      rows: cells,
      rowBoxes: rows.map(rect),
      cellsWithExplicitState: [...(button?.querySelectorAll('.px-pass-cell') || [])].every((cell) => ['true', 'false'].includes(cell.dataset.filled)),
      childCount: button?.querySelectorAll('*').length || 0,
      runningAnimations: motion.filter((animation) => animation.playState === 'running').length,
      pointerTargetIsButton: hit === button || button?.contains(hit),
      intersections,
      externalOverlaps,
      headerRect: rect(document.querySelector('.px-site-header')),
      audioSelect: rect(document.querySelector('#audio-canvas-size')),
      audioMain: rect(document.querySelector('#main'))
    };
  });
}

function filledCount(rows) { return rows.flat().filter(Boolean).length; }
function assertFilled(state, total, perRow) {
  assert.equal(state.rows.length, 3, 'the gauge has exactly three rows');
  assert.ok(state.rows.every((row) => row.length === 12), 'each hour row has twelve cells');
  assert.equal(state.cellsWithExplicitState, true, 'every cell has an explicit data-filled state');
  assert.equal(filledCount(state.rows), total, `expected ${total} filled cells`);
  assert.deepEqual(state.rows.map((row) => row.filter(Boolean).length), perRow, 'top row is hour three; bottom row is hour one');
}

for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 320, height: 568 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await localOnly(page);
    await page.addInitScript(() => {
      localStorage.removeItem('pixieed:pass:v1');
      window.__headerTimeouts = new Map();
      const originalSetTimeout = window.setTimeout.bind(window);
      const originalClearTimeout = window.clearTimeout.bind(window);
      window.setTimeout = (callback, delay, ...args) => {
        const headerTimer = new Error().stack?.includes('site-header.mjs');
        let id;
        id = originalSetTimeout(() => { window.__headerTimeouts.delete(id); callback(...args); }, delay);
        if (headerTimer) window.__headerTimeouts.set(id, Number(delay));
        return id;
      };
      window.clearTimeout = (id) => { window.__headerTimeouts.delete(id); return originalClearTimeout(id); };
    });
    await page.goto(new URL('/audio/', BASE).href, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-header-pass] .px-pass-gauge-row');
    await page.waitForTimeout(80);
    await page.mouse.move(318, 566);

    let state = await gaugeState(page);
    assert.equal(state.rows.length, 3);
    assertFilled(state, 0, [0, 0, 0]);
    assert.equal(state.dataActive, 'false');
    assert.equal(state.dataRecharged, false, 'initial load does not animate as a recharge');
    assert.equal(state.runningAnimations, 0, 'idle gauge has no animation');
    assert.equal(state.labelOverflow, false, 'the initial action label fits in the fixed button');
    assert.ok(state.button.height >= 44 && state.button.height <= 46 && state.button.width >= 92 && state.button.width <= 104, JSON.stringify(state.button));
    assert.ok(state.pointerTargetIsButton, 'the gauge button receives input at its center');
    assert.deepEqual(state.intersections, [], 'header controls do not overlap');
    assert.deepEqual(state.externalOverlaps, [], 'header pass action does not overlap page controls');
    assert.ok(state.headerRect.top >= 0 && state.headerRect.bottom <= 568);
    pass(`${engineName}: initial empty state, three rows, 36 explicit cells, no recharge or idle animation`);

    await setRemaining(page, hour);
    await page.waitForFunction(() => document.querySelector('[data-header-pass]')?.dataset.bank === '1');
    state = await gaugeState(page);
    assertFilled(state, 12, [0, 0, 12]);
    assert.equal(state.labelOverflow, false);
    assert.equal(state.dataRecharged, true, 'newly granted cells receive the short recharge state');
    const animation = await page.locator('[data-header-pass]').evaluate((button) => getComputedStyle(button, '::after').animationName);
    assert.equal(animation, 'px-pass-recharge');
    if (engineName === 'chromium') await page.screenshot({ path: '/tmp/pass-gauge-audio-320-1h.png' });
    await page.waitForFunction(() => document.querySelector('[data-header-pass]')?.dataset.recharged !== 'true', null, { timeout: 1500 });
    assert.equal((await gaugeState(page)).runningAnimations, 0);
    pass(`${engineName}: one hour lights only the bottom row and the 450ms recharge ends`);

    await setRemaining(page, 90 * 60 * 1000);
    await page.waitForFunction(() => document.querySelector('[data-header-pass]')?.dataset.bank === '2');
    state = await gaugeState(page);
    assertFilled(state, 18, [0, 6, 12]);
    assert.equal(state.label, '1:30');
    assert.equal(state.dataRecharged, true);
    assert.equal(state.labelOverflow, false);
    await page.waitForFunction(() => document.querySelector('[data-header-pass]')?.dataset.recharged !== 'true', null, { timeout: 1500 });
    if (engineName === 'chromium') await page.screenshot({ path: '/tmp/pass-gauge-audio-320-90m.png' });

    await setRemaining(page, 2 * hour);
    await page.waitForFunction(() => document.querySelector('[data-header-pass]')?.dataset.bank === '2');
    state = await gaugeState(page);
    assertFilled(state, 24, [0, 12, 12]);
    assert.equal(state.labelOverflow, false);
    assert.equal(state.dataRecharged, true);
    await page.waitForFunction(() => document.querySelector('[data-header-pass]')?.dataset.recharged !== 'true', null, { timeout: 1500 });

    await setRemaining(page, 4 * hour);
    await page.waitForFunction(() => document.querySelector('[data-header-pass]')?.dataset.bank === '3');
    state = await gaugeState(page);
    assertFilled(state, 36, [12, 12, 12]);
    assert.equal(state.label, '4:00'); assert.equal(state.add, '+');
    assert.equal(state.dataRecharged, true);
    assert.equal(state.labelOverflow, false);
    await page.waitForFunction(() => document.querySelector('[data-header-pass]')?.dataset.recharged !== 'true', null, { timeout: 1500 });

    await setRemaining(page, 24 * hour);
    state = await gaugeState(page);
    assertFilled(state, 36, [12, 12, 12]);
    assert.equal(state.label, '24:00'); assert.equal(state.add, '+');
    assert.equal(state.dataBank, '3', 'visual bank is capped at three hours');
    assert.equal(state.labelOverflow, false);

    await setRemaining(page, 1000 * hour);
    state = await gaugeState(page);
    assertFilled(state, 36, [12, 12, 12]);
    assert.equal(state.dataLong, true, 'the extended bank uses the compact label treatment');
    assert.equal(state.label, '1000h'); assert.equal(state.add, '+');
    assert.match(state.labelAria, /1000:00/);
    assert.match(state.labelTitle, /1000:00/);
    assert.equal(state.labelOverflow, false, `large-hour text is clipped: ${JSON.stringify(state)}`);
    assert.ok(state.button.width >= 88 && state.button.height >= 44);
    assert.deepEqual(state.intersections, []);
    assert.deepEqual(state.externalOverlaps, []);
    pass(`${engineName}: 90m/2h/4h/24h/1000h render correctly; three-row visual cap does not cap stored time or clip labels`);

    const childCount = state.childCount;
    for (const value of [hour, 2 * hour, 4 * hour, 24 * hour, 1000 * hour, hour]) {
      await setRemaining(page, value);
      await page.waitForTimeout(15);
    }
    state = await gaugeState(page);
    assert.equal(state.childCount, childCount, 'refreshing states must update fixed gauge nodes, not append elements');
    assert.deepEqual(errors, []);
    pass(`${engineName}: repeated updates keep DOM node count stable without runtime errors`);

    // Hide the document while its pass is about to expire. The shared header's own
    // refresh timeout should be canceled; the canonical pass timer remains absolute.
    await setRemaining(page, 350);
    await page.waitForFunction(() => window.__headerTimeouts.size > 0);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__testVisibility || 'visible' });
      window.__testVisibility = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await page.evaluate(() => window.__headerTimeouts.size), 0, 'hidden document cancels header-owned refresh timers');
    await page.waitForTimeout(500); // Core expiry notification is not suspended by page visibility.
    await page.evaluate(() => { window.__testVisibility = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => document.querySelector('[data-header-pass]')?.dataset.active === 'false');
    assert.equal((await gaugeState(page)).label, '+1時間', 'resume reads the absolute expired timestamp');
    assert.deepEqual(errors, []);
    pass(`${engineName}: hidden refresh timer is stopped; resume reflects the absolute expiry`);
    await context.close();

    const reducedContext = await browser.newContext({ viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' });
    const reduced = await reducedContext.newPage();
    await localOnly(reduced);
    await reduced.addInitScript(() => localStorage.removeItem('pixieed:pass:v1'));
    await reduced.goto(new URL('/audio/', BASE).href, { waitUntil: 'domcontentloaded' });
    await reduced.waitForSelector('[data-header-pass] .px-pass-gauge-row');
    await setRemaining(reduced, hour);
    await reduced.waitForFunction(() => document.querySelector('[data-header-pass]')?.dataset.recharged === 'true');
    await reduced.waitForTimeout(80);
    const reducedAnimation = await reduced.locator('[data-header-pass]').evaluate((button) => getComputedStyle(button, '::after').animationName);
    assert.equal(reducedAnimation, 'none', 'reduced motion disables the recharge sweep');
    assert.equal(await reduced.locator('[data-header-pass]').evaluate((button) => button.getAnimations({ subtree: true }).filter((item) => item.playState === 'running').length), 0,
      'reduced motion stops every animation and transition in the gauge');
    pass(`${engineName}: reduced-motion setting keeps recharge feedback static`);
    await reducedContext.close();
  } finally {
    await browser.close();
  }
}
console.log(`Gauge browser checks: ${checks} PASS. Synthetic storage only; real ads and physical devices are UNTESTED.`);
