#!/usr/bin/env node
/** Local-only mock QA for the isolated Ad Manager rewarded test page. Never serves live ads. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_REWARDED_BASE_URL || 'http://127.0.0.1:4173/admanager-rewarded-test/';
const baseUrl = new URL(base);
assert.ok(['localhost', '127.0.0.1'].includes(baseUrl.hostname), 'browser QA is restricted to localhost');
const origin = baseUrl.origin;
const engine = process.env.PIXIEED_UI_ENGINE || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE
  || 'playwright';
const outputDir = process.env.PIXIEED_REWARDED_OUTPUT || '/tmp/pixieed-rewarded-test-browser';
const playwright = await import(modulePath === 'playwright' ? modulePath : pathToFileURL(modulePath).href);
const browser = await playwright[engine].launch({
  headless: true,
  ...(engine === 'webkit' && process.env.PIXIEED_WEBKIT_EXECUTABLE ? { executablePath: process.env.PIXIEED_WEBKIT_EXECUTABLE } : {})
});
const report = {
  phase: 'local-mock-only',
  startedAt: new Date().toISOString(),
  finishedAt: null,
  baseUrl,
  engine,
  browserVersion: browser.version(),
  head: '',
  sourceFingerprint: '',
  computedSourceFingerprint: '',
  actualLiveAdResponseVerified: false,
  liveTesting: 'not run: the harness blocks external origins and uses no live delivery',
  viewportResults: [],
  scenarios: [],
  blockedExternalRequests: [],
  failures: []
};
const localSources = [
  ['admanager-rewarded-test/gpt-adapter.mjs', new URL('../admanager-rewarded-test/gpt-adapter.mjs', import.meta.url)],
  ['admanager-rewarded-test/controller.mjs', new URL('../admanager-rewarded-test/controller.mjs', import.meta.url)],
  ['admanager-rewarded-test/mock-adapter.mjs', new URL('../admanager-rewarded-test/mock-adapter.mjs', import.meta.url)],
  ['admanager-rewarded-test/page.mjs', new URL('../admanager-rewarded-test/page.mjs', import.meta.url)],
  ['admanager-rewarded-test/index.html', new URL('../admanager-rewarded-test/index.html', import.meta.url)],
  ['admanager-rewarded-test/style.css', new URL('../admanager-rewarded-test/style.css', import.meta.url)]
];

async function sourceFingerprint() {
  const hash = createHash('sha256');
  for (const [relativePath, url] of localSources) {
    try { hash.update(relativePath); hash.update(await readFile(url)); }
    catch { hash.update(`${relativePath}:missing`); }
  }
  return hash.digest('hex');
}

function phasePattern(phase) {
  return {
    ready: /ready|準備完了|準備でき|視聴可能/i,
    'no-fill': /no.?fill|配信なし|広告なし|広告が見つから/i,
    unsupported: /unsupported|非対応|利用できません/i,
    error: /error|失敗|エラー|無効/i,
    showing: /showing|再生中|表示中/i,
    closed: /closed|閉じ|終了/i,
    granted: /granted|報酬|reward/i,
    cancelled: /cancel|キャンセル|中止/i,
    timeout: /timeout|タイムアウト/i
  }[phase];
}

async function stateOf(page) {
  return page.locator('#state').evaluate(node => ({
    phase: node.dataset.phase || node.dataset.state || '',
    text: node.textContent || ''
  }));
}

async function waitForPhase(page, phase, timeout = 3000) {
  const pattern = phasePattern(phase);
  await page.waitForFunction(({ phase, patternText }) => {
    const node = document.querySelector('#state');
    if (!node) return false;
    const value = node.dataset.phase || node.dataset.state || node.textContent || '';
    return value.toLowerCase().includes(phase.toLowerCase()) || new RegExp(patternText, 'i').test(value);
  }, { phase, patternText: pattern.source }, { timeout });
  return stateOf(page);
}

async function rewardCount(page) {
  return page.locator('#reward-total').evaluate(node => {
    const match = String(node.textContent || '').match(/-?\d+/);
    return match ? Number(match[0]) : Number(node.dataset.total || 0);
  });
}

async function snapshots(page) {
  return page.evaluate(() => ({
    storage: {
      local: Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]),
      session: Object.keys(sessionStorage).sort().map(key => [key, sessionStorage.getItem(key)])
    },
    sdkGlobal: Boolean(window.googletag),
    sdkScripts: [...document.scripts].filter(script => /securepubads\.g\.doubleclick\.net\/tag\/js\/gpt\.js/.test(script.src)).map(script => script.src),
    externalScripts: [...document.scripts].map(script => script.src).filter(src => src && new URL(src, location.href).origin !== location.origin),
    overflow: document.documentElement.scrollWidth > innerWidth + 1
  }));
}

async function newLocalContext(viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  context.on('request', request => {
    const url = new URL(request.url());
    if (url.origin !== origin) report.blockedExternalRequests.push({ url: request.url(), type: request.resourceType() });
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      report.blockedExternalRequests.push({ url: route.request().url(), type: route.request().resourceType(), action: 'aborted' });
      return route.abort();
    }
    return route.continue();
  });
  return context;
}

async function configureScenario(page, scenario) {
  const select = page.locator('#mock-scenario');
  await select.selectOption(scenario);
}

async function prepare(page) {
  await page.locator('#prepare').click();
  return waitForPhase(page, 'ready');
}

async function forceClickHandler(page, selector) {
  return page.locator(selector).evaluate(node => node.dispatchEvent(new Event('click', { bubbles: true })));
}

async function logEntries(page) {
  return page.locator('#event-log li').allTextContents();
}

async function optInAndWatch(page) {
  const optIn = page.locator('#opt-in');
  const tag = await optIn.evaluate(node => node.tagName.toLowerCase());
  const type = tag === 'input' ? await optIn.getAttribute('type') : null;
  if (type === 'checkbox' || type === 'radio') {
    if (!(await optIn.isChecked())) await optIn.check();
  } else if (await optIn.isEnabled()) {
    await optIn.click();
  }
  const watch = page.locator('#watch');
  if (await watch.isEnabled()) await watch.click();
  else assert.fail('The watch action stayed unavailable after explicit opt-in.');
  await page.locator('#mock-ad').waitFor({ state: 'visible', timeout: 2000 });
}

async function openPage(viewport, path = '') {
  const context = await newLocalContext(viewport);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', error => consoleErrors.push(error.message));
  await page.goto(`${origin}/admanager-rewarded-test/${path}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#delivery-mode').waitFor({ state: 'visible' });
  return { context, page, consoleErrors };
}

async function viewportSmoke(viewport) {
  const { context, page, consoleErrors } = await openPage(viewport, '?live=1');
  const before = await snapshots(page);
  assert.equal(await page.locator('#delivery-mode').inputValue(), 'mock', 'URL parameters cannot activate live mode');
  assert.equal(before.sdkGlobal, false);
  assert.deepEqual(before.sdkScripts, []);
  assert.deepEqual(before.externalScripts, []);
  assert.equal(before.overflow, false, `no horizontal overflow at ${viewport.width}px`);

  // Keyboard focus remains visible and can move through the controls without pointer input.
  await page.keyboard.press('Tab');
  const keyboardFocus = await page.evaluate(() => ({
    id: document.activeElement?.id || '',
    visible: Boolean(document.activeElement?.matches(':focus-visible'))
  }));
  assert.ok(keyboardFocus.visible, 'keyboard focus is visibly indicated');

  await page.locator('#delivery-mode').selectOption('live');
  await waitForPhase(page, 'cancelled');
  assert.equal(await page.locator('#prepare').isDisabled(), true, 'live preparation is disabled while opt-in is unchecked');
  await page.locator('#opt-in').check();
  assert.equal(await page.locator('#prepare').isDisabled(), true, 'live preparation stays disabled even when opt-in is checked');
  await forceClickHandler(page, '#prepare');
  assert.match(await page.locator('#mode-notice').textContent(), /無効|通信しません/);
  const liveGate = await snapshots(page);
  assert.equal(liveGate.sdkGlobal, false, 'selecting live still cannot create GPT globals while disabled');
  assert.deepEqual(liveGate.sdkScripts, []);
  assert.equal((await logEntries(page)).some(entry => /prepare/.test(entry)), false, 'bypassing the disabled control still cannot prepare live delivery');
  await page.locator('#delivery-mode').selectOption('mock');
  await configureScenario(page, 'normal');
  await page.locator('#prepare').click();
  await forceClickHandler(page, '#prepare');
  await waitForPhase(page, 'ready');
  assert.equal((await logEntries(page)).filter(entry => /prepare/.test(entry)).length, 1, 'duplicate prepare click during loading creates one attempt');
  assert.equal(await page.locator('#mock-ad').isVisible(), false, 'readiness never auto-displays a mock ad');
  assert.equal(await page.locator('#watch').isDisabled(), true, 'watch requires explicit opt-in');
  await forceClickHandler(page, '#watch');
  assert.equal(await page.locator('#mock-ad').isVisible(), false, 'bypassing the disabled watch control cannot show without opt-in');
  assert.equal(await rewardCount(page), 0);

  const readySnapshot = await snapshots(page);
  assert.equal(readySnapshot.sdkGlobal, false);
  assert.deepEqual(readySnapshot.sdkScripts, []);
  assert.deepEqual(readySnapshot.externalScripts, []);
  assert.deepEqual(readySnapshot.storage, before.storage, 'the demo does not change local or session storage');
  await page.screenshot({ path: `${outputDir}/rewarded-mock-ready-${viewport.width}x${viewport.height}.png`, fullPage: true });
  assert.deepEqual(consoleErrors, [], 'no page exceptions');
  report.viewportResults.push({ viewport, keyboardFocus, before, readySnapshot, consoleErrors });
  await context.close();
}

async function lifecycleAndLateReceipt(viewport) {
  const { context, page, consoleErrors } = await openPage(viewport);
  const storageBefore = (await snapshots(page)).storage;
  await configureScenario(page, 'normal');
  await prepare(page);
  assert.equal(await rewardCount(page), 0);
  await optInAndWatch(page);
  await page.screenshot({ path: `${outputDir}/rewarded-mock-visible-${viewport.width}x${viewport.height}.png`, fullPage: true });
  const dialogStart = await page.evaluate(() => {
    const dialog = document.querySelector('#mock-ad');
    return { open: dialog.open, modal: dialog.matches(':modal') };
  });
  assert.deepEqual(dialogStart, { open: true, modal: true }, 'mock ad is shown in a native modal dialog');
  assert.equal(await rewardCount(page), 0);

  // Native dialog keyboard behavior and opt-out do not grant a reward.
  await page.keyboard.press('Tab');
  const focusInside = await page.evaluate(() => document.querySelector('#mock-ad').contains(document.activeElement));
  assert.equal(focusInside, true, 'dialog focus stays within the open dialog');
  await page.keyboard.press('Escape');
  await page.locator('#mock-ad').waitFor({ state: 'hidden' });
  assert.equal(await rewardCount(page), 0, 'dismissal cannot award a reward');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'prepare', 'dialog dismissal restores focus');
  const afterEscape = await stateOf(page);
  report.scenarios.push({ name: 'native-dialog-escape', viewport, state: afterEscape, rewards: await rewardCount(page) });

  // Retry then exercise completion, close, a post-close grant, and duplicate receipt.
  await configureScenario(page, 'normal');
  await prepare(page);
  await optInAndWatch(page);
  await page.locator('#mock-completed').click();
  const completionState = await stateOf(page);
  assert.equal(await rewardCount(page), 0, 'video completion by itself is not a reward');
  assert.ok((await logEntries(page)).some(entry => /videoCompleted/.test(entry)), 'video completion is logged as diagnostic only');
  await page.locator('#mock-close').click();
  await page.locator('#mock-ad').waitFor({ state: 'hidden' });
  assert.equal(await rewardCount(page), 0, 'close alone cannot award a reward');
  const closedState = await stateOf(page);
  assert.match(`${closedState.phase} ${closedState.text}`, /closed|閉じ|終了/i);
  await page.locator('#mock-late-grant').click();
  await page.waitForFunction(() => {
    const node = document.querySelector('#reward-total');
    return Number((node?.textContent || '').match(/\d+/)?.[0] || node?.dataset.total || 0) === 1;
  });
  assert.equal(await rewardCount(page), 1, 'the current attempt may accept a delayed matching grant');
  assert.equal(await page.locator('#mock-late-grant').isDisabled(), true, 'duplicate-grant action is disabled after the first grant');
  await forceClickHandler(page, '#mock-late-grant');
  await page.waitForTimeout(50);
  assert.equal(await rewardCount(page), 1, 'duplicate receipts cannot duplicate the reward');
  assert.deepEqual((await snapshots(page)).storage, storageBefore, 'reward state is in-memory only');
  assert.equal((await snapshots(page)).sdkGlobal, false, 'mock mode never loads GPT');
  assert.deepEqual(consoleErrors, []);
  report.scenarios.push({
    name: 'video-close-late-grant-idempotency', viewport,
    beforeClose: completionState, afterClose: closedState,
    finalState: await stateOf(page), rewards: await rewardCount(page), storageBefore, storageAfter: (await snapshots(page)).storage
  });
  await page.screenshot({ path: `${outputDir}/rewarded-mock-late-grant-${viewport.width}x${viewport.height}.png`, fullPage: true });
  await context.close();
}

async function outcomesAndCleanup() {
  const { context, page, consoleErrors } = await openPage({ width: 390, height: 844 });
  for (const [scenario, phase] of [['no-fill', 'no-fill'], ['unsupported', 'unsupported'], ['sdk-error', 'error']]) {
    await configureScenario(page, scenario);
    await page.locator('#prepare').click();
    const state = await waitForPhase(page, phase);
    assert.equal(await rewardCount(page), 0, `${scenario} never grants`);
    assert.equal(await page.locator('#mock-ad').isVisible(), false);
    report.scenarios.push({ name: scenario, phase, state, rewards: await rewardCount(page) });
  }
  await configureScenario(page, 'timeout');
  await page.locator('#prepare').click();
  const timeoutState = await waitForPhase(page, 'error', 2500);
  assert.ok((await logEntries(page)).some(entry => /timeout/.test(entry)), 'timeout is recorded as an event while the phase remains error');
  assert.match(await page.locator('#error').textContent(), /時間内|タイムアウト|timeout/i);
  assert.equal(await rewardCount(page), 0);
  report.scenarios.push({ name: 'timeout', state: timeoutState, rewards: 0 });

  await configureScenario(page, 'normal');
  await prepare(page);
  await page.locator('#cancel').click();
  const cancelled = await waitForPhase(page, 'cancelled');
  assert.equal(await rewardCount(page), 0, 'manual cancel is terminal without a reward');
  assert.equal((await snapshots(page)).sdkGlobal, false);
  assert.deepEqual(consoleErrors, []);
  report.scenarios.push({ name: 'cancel-cleanup', state: cancelled, rewards: 0 });

  // A synchronous QA-only session marker survives navigation. The application
  // never stores this marker; normal scenarios above assert unchanged storage.
  // Read the rendered phase after the application's own pagehide listener.
  await page.evaluate(() => window.addEventListener('pagehide', () => {
    const phase = document.querySelector('#state')?.dataset.phase || '';
    sessionStorage.setItem('__qa_pagehide_phase', phase);
  }));
  await configureScenario(page, 'timeout');
  await page.locator('#prepare').click();
  await page.goto(`${origin}/admanager-rewarded-test/index.html?qa-navigation=1`, { waitUntil: 'load' });
  assert.equal(new URL(page.url()).origin, origin);
  assert.equal(new URL(page.url()).searchParams.get('qa-navigation'), '1');
  const pagehidePhase = await page.evaluate(() => {
    const phase = sessionStorage.getItem('__qa_pagehide_phase');
    sessionStorage.removeItem('__qa_pagehide_phase');
    return phase;
  });
  assert.equal(pagehidePhase, 'disposed', 'the previous document disposed during actual same-origin navigation');
  report.scenarios.push({ name: 'route-leave-pagehide', destination: new URL(page.url()).pathname, pagehidePhase, externalRequestsSeen: report.blockedExternalRequests.length });
  await context.close();
}

try {
  await mkdir(outputDir, { recursive: true });
  try { report.head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { report.head = 'unavailable'; }
  report.computedSourceFingerprint = await sourceFingerprint();
  report.sourceFingerprint = process.env.PIXIEED_SOURCE_FINGERPRINT || report.computedSourceFingerprint;
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1280, height: 800 }
  ]) await viewportSmoke(viewport);
  await lifecycleAndLateReceipt({ width: 320, height: 568 });
  await lifecycleAndLateReceipt({ width: 390, height: 844 });
  await outcomesAndCleanup();
  assert.deepEqual(report.blockedExternalRequests, [], 'the standalone page attempted no external requests');
  report.phase = 'passed';
} catch (error) {
  report.phase = 'failed';
  report.failures.push({ name: error.name, message: error.message, stack: error.stack });
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  report.externalRequestsBlocked = report.blockedExternalRequests.length;
  try { await writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2)); } catch { /* Report failure must not hide the browser assertion. */ }
  await browser.close();
  process.stdout.write(`${JSON.stringify({ phase: report.phase, outputDir, viewports: report.viewportResults.length, scenarios: report.scenarios.length, actualLiveAdResponseVerified: false, failures: report.failures }, null, 2)}\n`);
}
