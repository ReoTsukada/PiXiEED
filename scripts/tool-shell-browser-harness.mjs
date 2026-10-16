/** Local-only acceptance for dedicated tool pages. No existing browser profile or remote requests. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4197';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const output = process.env.PIXIEED_TOOL_SHELL_OUTPUT || '/tmp/pixieed-tool-shell-evidence';
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { engine: browser.version(), base, externalRequestsSent: 0, cases: [], failures: [], limitations: ['Synthetic desktop/mobile viewports; physical mobile and Safari untested', 'Real camera and remote storage/publication intentionally not used'] };
const check = (row, name) => row.checks.push(name);
const state = frame => frame.evaluate(() => window.__PIXIEED_TOOL_EMBED_BRIDGE__.getState());
const isExpanded = page => page.locator('[data-tool-embed]').evaluate(n => n.classList.contains('tool-embed--expanded'));
const point = async (frame, x, y) => {
  const r = await frame.locator('#draw-canvas').boundingBox();
  const size = await frame.locator('#draw-canvas').evaluate(n => [n.width, n.height]);
  return { x: r.x + (x + .5) * r.width / size[0], y: r.y + (y + .5) * r.height / size[1] };
};
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    for (const mode of ['draw', 'camera', 'audio']) {
      const label = `${mode}-${viewport.width}`;
      const row = { label, checks: [], errors: [], blocked: [] };
      report.cases.push(row);
      const context = await browser.newContext({ viewport, hasTouch: viewport.width < 600, serviceWorkers: 'block', acceptDownloads: true });
      await context.route('**/*', route => {
        const req = route.request();
        if (new URL(req.url()).origin !== new URL(base).origin || !['GET', 'HEAD'].includes(req.method())) {
          row.blocked.push({ url: req.url(), method: req.method() }); return route.abort();
        }
        return route.continue();
      });
      await context.addInitScript(() => {
        window.__mediaRequests = 0;
        if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { window.__mediaRequests++; throw new DOMException('Local QA denies hardware', 'NotAllowedError'); };
      });
      const page = await context.newPage(); page.setDefaultTimeout(15000);
      page.on('pageerror', e => row.errors.push(e.message));
      try {
        const path = mode === 'audio' ? '/audio/' : `/draw/?mode=${mode}`;
        await page.goto(`${base}${path}${path.includes('?') ? '&' : '?'}keep=one&keep=two#qa-fragment`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelector('[data-embed-status]')?.textContent.includes('編集を保持'));
        const frame = page.frames().find(f => f.url().includes('/draw/editor.html'));
        assert.ok(frame); assert.equal(page.frames().length, 2, 'single runtime iframe, no recursion');
        await frame.waitForFunction(m => document.body.dataset.creationMode === m && !document.querySelector('#main').inert, mode);
        assert.deepEqual(new URL(frame.url()).searchParams.getAll('keep'), ['one', 'two']);
        assert.equal(new URL(frame.url()).hash, '#qa-fragment');
        assert.equal(await frame.evaluate(() => window.__mediaRequests), 0);
        assert.ok(await page.locator('.site-header [data-menu-toggle]').isVisible());
        assert.equal(await page.evaluate(() => getComputedStyle(document.body).position === 'fixed'), false);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        await page.evaluate(() => window.scrollTo({ top: 90, behavior: 'instant' }));
        assert.ok(await page.evaluate(() => scrollY) > 0);
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        check(row, 'description nav, page scrolling, query/hash, one runtime, no camera auto-start');
        await page.screenshot({ path: `${output}/${label}-page.png`, fullPage: true, animations: 'disabled' });
        await frame.evaluate(() => { window.__retainedContext = crypto.randomUUID(); });
        const token = await frame.evaluate(() => window.__retainedContext);
        await page.locator('[data-embed-expand]').scrollIntoViewIfNeeded();
        await page.locator('[data-embed-expand]').focus();
        const scrollBefore = await page.evaluate(() => scrollY);
        const before = await state(frame);
        await page.keyboard.press('Enter');
        await frame.waitForFunction(() => document.documentElement.hasAttribute('data-tool-embed-expanded'));
        assert.equal(await isExpanded(page), true);
        assert.equal(await page.locator('[data-embed-expand]').innerText(), '拡大表示を終了');
        assert.equal(await page.locator('[data-embed-close]').isVisible(), false);
        const exit = await page.locator('[data-embed-expand]').boundingBox();
        assert.ok(exit.x >= 0 && exit.y >= 0 && exit.x + exit.width <= viewport.width + 1 && exit.y + exit.height <= viewport.height && exit.height >= 44);
        assert.equal(await frame.locator('.site-header .brand').isVisible(), false);
        if (await frame.locator('[data-menu-toggle]').count()) assert.equal(await frame.locator('[data-menu-toggle]').isVisible(), false);
        for (const sel of ['#creation-mode-menu > summary', '#creation-file-open', '#creation-settings-open', '#creation-output-open', mode === 'camera' ? '#capture' : mode === 'audio' ? '#draw-music-play' : '#draw-animation-play']) assert.equal(await frame.locator(sel).isVisible(), true, sel);
        assert.equal(await page.evaluate(() => getComputedStyle(document.body).position), 'fixed');
        const frameBounds = await page.locator('iframe').boundingBox();
        assert.ok(frameBounds.width >= viewport.width - 2, `full available width: ${frameBounds.width}`);
        assert.deepEqual(await state(frame), before, 'expansion preserves full timeline/history/mode');
        await page.screenshot({ path: `${output}/${label}-expanded.png`, animations: 'disabled' });
        await page.locator('.tool-embed__controls').screenshot({ path: `${output}/${label}-header.png` });
        check(row, 'keyboard expand, reachable 44px exit, hidden page links, preserved production controls and mode');
        // Keep a real selection, pixels and redo history through expansion cycles.
        if (mode === 'draw') {
          const a = await point(frame, 3, 4); await page.mouse.click(a.x, a.y);
          await frame.waitForFunction(() => !document.querySelector('#draw-undo').disabled);
          const painted = await state(frame); assert.notEqual(painted.image.hash, before.image.hash);
          await frame.locator('#draw-undo').click();
          const undone = await state(frame); assert.equal(undone.image.hash, before.image.hash); assert.equal(undone.controls.redoDisabled, false);
          await page.locator('[data-embed-expand]').click();
          assert.ok(Math.abs((await page.evaluate(() => scrollY)) - scrollBefore) <= 1);
          assert.equal(await page.locator('[data-embed-expand]').evaluate(n => document.activeElement === n), true);
          await page.locator('[data-embed-expand]').click();
          assert.deepEqual(await state(frame), undone);
          await frame.locator('#draw-redo').click(); assert.equal((await state(frame)).image.hash, painted.image.hash);
          await frame.locator('#draw-canvas').focus(); await page.keyboard.press('v');
          const q = await point(frame, 2, 3), r = await point(frame, 5, 6);
          await page.mouse.move(q.x, q.y); await page.mouse.down(); await page.mouse.move(r.x, r.y, { steps: 4 }); await page.mouse.up();
          assert.equal(await frame.locator('.draw-selection').isVisible(), true);
          const selection = await frame.locator('.draw-selection').evaluate(n => ({ style: n.getAttribute('style'), hidden: n.hidden }));
          await page.locator('[data-embed-expand]').click(); await page.locator('[data-embed-expand]').click();
          assert.equal(await frame.locator('.draw-selection').isVisible(), true);
          assert.equal(await frame.locator('.draw-selection').evaluate(n => n.hidden), selection.hidden);
          check(row, 'real drawing, Undo/Redo and active selection survive expansion cycles');
          // Close a real tool layer first, then Escape exits only expansion.
          await frame.locator('#creation-mode-menu > summary').click();
          await page.keyboard.press('Escape'); assert.equal(await isExpanded(page), true);
          await page.locator('[data-embed-expand]').focus(); await page.keyboard.press('Escape');
          assert.equal(await isExpanded(page), false);
          assert.ok(await page.locator('iframe').isVisible());
          await page.locator('[data-embed-expand]').click();
        }
        if (mode === 'camera') {
          await frame.locator('#cameraImageInput').setInputFiles(resolve(output, 'safe-fixture.png'));
          await frame.waitForFunction(() => document.querySelector('#cameraStatus')?.textContent === 'プレビュー');
          await frame.locator('#toolbarHome [data-tool="look"]').click();
          if (await frame.locator('#looks [data-look="c8"]').isHidden()) await frame.locator('#toolbarContextMore').click();
          await frame.locator('#looks [data-look="c8"]').click();
          assert.equal(await frame.locator('#looks [data-look="c8"]').getAttribute('aria-checked'), 'true');
          assert.equal(await frame.evaluate(() => window.__mediaRequests), 0);
          await page.locator('[data-embed-expand]').click(); await page.locator('[data-embed-expand]').click();
          assert.equal(await frame.locator('#looks [data-look="c8"]').getAttribute('aria-checked'), 'true');
          check(row, 'synthetic image import + reduction retained without hardware access');
        }
        if (mode === 'audio') {
          await frame.locator('#draw-music-settings').evaluate(n => { n.open = true; });
          await frame.locator('#draw-music-instrument').selectOption('triangle');
          await frame.locator('#draw-music-settings').evaluate(n => { n.open = false; });
          const note = await point(frame, 3, 3); await page.mouse.click(note.x, note.y);
          await frame.locator('#draw-music-play').click();
          await frame.waitForFunction(() => document.querySelector('#draw-music-play').getAttribute('aria-pressed') === 'true');
          assert.equal(await frame.locator('#draw-music-play').getAttribute('aria-pressed'), 'true');
          await page.locator('[data-embed-expand]').click(); await page.locator('[data-embed-expand]').click();
          assert.equal(await frame.locator('#draw-music-play').getAttribute('aria-pressed'), 'true');
          await frame.locator('#draw-music-play').click();
          check(row, 'music playback control works and survives expansion');
        }
        if (mode === 'draw' && viewport.width !== 320) {
          const smaller = viewport.width > 600 ? { width: 1024, height: 768 } : { width: 390, height: 420 };
          await page.setViewportSize(smaller); await page.waitForTimeout(120);
          const reachable = await page.locator('[data-embed-expand]').boundingBox();
          assert.ok(reachable.y >= 0 && reachable.y + reachable.height <= smaller.height);
          assert.equal(await frame.evaluate(() => window.__retainedContext), token);
          await page.setViewportSize(viewport); await page.waitForTimeout(120);
          check(row, 'resizing PC or keyboard-sized mobile viewport retains iframe and reachable exit');
        }
        await page.locator('[data-embed-expand]').click();
        assert.equal(await isExpanded(page), false);
        assert.equal(await frame.evaluate(() => window.__retainedContext), token);
        assert.equal(await page.locator('iframe').count(), 1);
        check(row, 'collapse keeps iframe identity, restores focus and background scrolling');
        assert.deepEqual(row.errors, []);
      } catch (error) {
        row.failure = error.stack; report.failures.push(label);
        await page.screenshot({ path: `${output}/${label}-failure.png`, fullPage: true }).catch(() => {});
        console.error('FAIL', label, error.message);
      } finally { await context.close(); await writeFile(`${output}/browser-results.json`, JSON.stringify(report, null, 2)); }
    }
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ cases: report.cases.length, checks: report.cases.reduce((s, r) => s + r.checks.length, 0), failures: report.failures }));
if (report.failures.length) process.exitCode = 1;
