/** Local acceptance for compact creation-tool headers, with an immutable before comparison. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const phase = process.env.PIXIEED_HEADER_PHASE || 'after';
const base = process.env.PIXIEED_BROWSER_BASE_URL || (phase === 'before' ? 'http://127.0.0.1:4191' : 'http://127.0.0.1:4188');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Only isolated local fixtures are allowed');
const output = process.env.PIXIEED_HEADER_OUTPUT || '/tmp/pixieed-tool-header-20261006';
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const variants = [{ width: 320, height: 568, dpr: 2 }, { width: 390, height: 844, dpr: 3 }, { width: 844, height: 390, dpr: 2 }, { width: 1280, height: 800, dpr: 1 }];
const tools = [
  { name: 'draw', path: '/draw/', workspace: '.draw-viewport', control: '.draw-control-dock' },
  { name: 'audio', path: '/audio/', workspace: '#audio-grid-wrap', control: '.audio-controls' },
  { name: 'jigsaw', path: '/jigsaw/', workspace: '#jigsaw-setup', control: '#jigsaw-source-kind' },
  { name: 'spot-difference', path: '/spot-difference/', workspace: '#spot-setup', control: '#spot-status' },
  { name: 'hidden-object', path: '/hidden-object/', workspace: '#hidden-setup', control: '#hidden-status' },
  { name: 'game', path: '/game/', workspace: '#game-setup', control: '#game-status' },
  { name: 'pixel-camera', path: '/pixel-camera.html', workspace: '#stage', control: '#toolbar' }
];
const selectedTools = process.env.PIXIEED_HEADER_TOOLS?.split(',');
const selectedVariants = process.env.PIXIEED_HEADER_VARIANTS?.split(',');
const matchesFilter = row => (!selectedTools || selectedTools.includes(row.tool)) && (!selectedVariants || selectedVariants.includes(`${row.variant.width}x${row.variant.height}`));
const results = selectedTools || selectedVariants ? JSON.parse(await readFile(`${output}/${phase}.json`, 'utf8').catch(() => '[]')).filter(row => !matchesFilter(row)) : [];
await mkdir(output, { recursive: true });
const before = phase === 'after' ? JSON.parse(await readFile(`${output}/before.json`, 'utf8')) : [];
async function prepareWorkspace(page, tool, checks) {
  const image = async changed => ({ name: changed ? 'changed-fixture.png' : 'header-fixture.png', mimeType: 'image/png', buffer: Buffer.from(await page.evaluate(changed => {
    const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d');
    g.fillStyle = '#7eafbe'; g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#253d52'; g.fillRect(4, 3, 8, 10); g.fillRect(2, 7, 12, 5);
    g.fillStyle = '#edbe5c'; g.fillRect(5, 4, 6, 5); g.fillRect(5, 10, 2, 4); g.fillRect(9, 10, 2, 4);
    g.fillStyle = '#253d52'; g.fillRect(6, 5, 1, 2); g.fillRect(9, 5, 1, 2);
    g.fillStyle = '#dc7865'; g.fillRect(6, 8, 4, 1);
    if (changed) { g.fillStyle = '#ffffff'; g.fillRect(2, 2, 2, 2); }
    return c.toDataURL('image/png').split(',')[1];
  }, changed), 'base64') });
  const pixelTap = async (selector, x, y) => { const c = page.locator(selector), r = await c.boundingBox(), [w, h] = await c.evaluate(el => [el.width, el.height]); await page.mouse.click(r.x + (x + .5) * r.width / w, r.y + (y + .5) * r.height / h); };
  if (tool.name === 'draw') {
    await page.locator('#draw-import-file').setInputFiles(await image(false));
    await page.waitForFunction(() => !document.querySelector('#draw-import-local').disabled && document.querySelector('#draw-canvas').getContext('2d').getImageData(0, 0, 1, 1).data[0] === 126);
    checks.push('actual PNG decoder imports exact fixture pixels');
    return '.draw-viewport';
  }
  if (tool.name === 'audio') {
    await pixelTap('#audio-pixel-canvas', 2, 8); await pixelTap('#audio-pixel-canvas', 5, 6);
    await page.locator('#audio-play-toggle').click(); await page.waitForFunction(() => document.querySelector('#audio-play-toggle').getAttribute('aria-pressed') === 'true');
    await page.locator('#audio-play-toggle').click(); await page.waitForFunction(() => document.querySelector('#audio-play-toggle').getAttribute('aria-pressed') === 'false');
    checks.push('audio canvas accepts notes and playback toggles on/off');
    return '#audio-grid-wrap';
  }
  if (tool.name === 'jigsaw') {
    await page.locator('#jigsaw-source-kind').selectOption('file'); await page.locator('#jigsaw-file').setInputFiles(await image(false));
    await page.waitForFunction(() => !document.querySelector('#jigsaw-start').disabled); await page.locator('#jigsaw-start').click(); await page.locator('#jigsaw-play').waitFor({ state: 'visible' });
    await page.locator('#jigsaw-preview-toggle').click(); await page.locator('#jigsaw-preview').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape'); await page.locator('#jigsaw-preview').waitFor({ state: 'hidden' });
    checks.push('local picture starts puzzle; original preview opens and closes');
    return '#jigsaw-workspace';
  }
  if (tool.name === 'spot-difference') {
    await page.locator('#spot-before-file').setInputFiles(await image(false)); await page.locator('#spot-after-file').setInputFiles(await image(true));
    await page.waitForFunction(() => !document.querySelector('#spot-import-pair').disabled); await page.locator('#spot-import-pair').click(); await page.locator('#spot-editor').waitFor({ state: 'visible' });
    assert.ok(await page.locator('#spot-candidates li').count() > 0, 'Actual differing pixels produce candidates');
    checks.push('two actual PNGs import and create difference candidates');
    return '#spot-editor';
  }
  if (tool.name === 'hidden-object') {
    await page.locator('#hidden-image-file').setInputFiles(await image(false)); await page.waitForFunction(() => !document.querySelector('#hidden-start').disabled);
    await page.locator('#hidden-start').click(); await page.locator('#hidden-editor').waitFor({ state: 'visible' });
    await page.locator('#hidden-target-settings > summary').click();
    await page.locator('#hidden-name').fill('ロボット'); await page.locator('#hidden-add').click(); await pixelTap('#hidden-canvas', 6, 6);
    await page.waitForFunction(() => !document.querySelector('#hidden-confirm').disabled);
    checks.push('local PNG opens maker; named target and mask become confirmable');
    return '#hidden-canvas';
  }
  if (tool.name === 'game') {
    await page.locator('#game-character-file').setInputFiles(await image(true)); await page.locator('#game-background-file').setInputFiles(await image(false));
    await page.waitForFunction(() => !document.querySelector('#game-prepare').disabled); await page.locator('#game-prepare').click(); await page.locator('#game-play').waitFor({ state: 'visible' });
    await page.locator('#game-primary').click();
    await page.locator('[data-game-direction="right"]').click();
    checks.push('two local PNG assets start game; directional control receives input');
    return '#game-board';
  }
  await page.locator('[data-tool="dither"]').click(); await page.keyboard.press('Escape');
  checks.push('fake camera delivers preview frames; camera settings receive input');
  return '#stage';
}
async function headerReachability(page, variant) {
  const buttons = page.locator('.px-site-header button:visible, .px-site-header summary:visible, .px-site-header a:visible');
  const checked = [];
  for (let i = 0; i < await buttons.count(); i++) {
    const button = buttons.nth(i);
    if (await button.evaluate(el => el.tagName !== 'SUMMARY' && Boolean(el.parentElement?.closest('details')))) continue; // Drawer contents are separate from header launchers.
    await button.scrollIntoViewIfNeeded();
    const data = await button.evaluate(el => { const r = el.getBoundingClientRect(), scroller = el.closest('.px-tool-header-controls'), s = scroller?.getBoundingClientRect(); return {
      id: el.id, label: el.getAttribute('aria-label') || el.title || el.innerText, rect: r.toJSON(), scroller: s?.toJSON(),
      visibleWidth: Math.max(0, Math.min(r.right, s?.right ?? innerWidth) - Math.max(r.left, s?.left ?? 0)) };
    });
    assert.ok(data.rect.width >= 43.99 && data.rect.height >= 43.99, `${data.id || data.label} target >=44px: ${JSON.stringify(data)}`);
    assert.ok(data.visibleWidth >= 43.99, `${data.id || data.label} has a reachable full target: ${JSON.stringify(data)}`);
    assert.ok(data.rect.top >= -.1 && data.rect.bottom <= 64.1, `${data.id || data.label} stays in compact header`);
    checked.push(data);
  }
  await page.locator('.px-tool-header-controls').evaluateAll(nodes => nodes.forEach(el => { el.scrollLeft = 0; }));
  return checked;
}
async function headerPanels(page, editorSelector, checks) {
  const summaries = page.locator('.px-tool-header-slot > details > summary:visible');
  for (let i = 0; i < await summaries.count(); i++) {
    const summary = summaries.nth(i), details = summary.locator('..');
    const label = await summary.getAttribute('aria-label') || await summary.innerText();
    const original = await page.locator(editorSelector).evaluate(el => el.getBoundingClientRect().toJSON());
    await summary.click(); await page.waitForFunction(el => el.open, await details.elementHandle());
    const content = details.locator(':scope > :not(summary)').first();
    if (await content.count()) {
      const box = await content.boundingBox();
      assert.ok(box && box.width > 0 && box.height > 0, `${label} content opens`);
      const bounds = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, headerBottom: document.querySelector('.px-site-header').getBoundingClientRect().bottom }));
      assert.ok(box.x >= -.1 && box.x + box.width <= bounds.width + .1 && box.y >= bounds.headerBottom - .1 && box.y + box.height <= bounds.height + .1, `${label} panel fits screen without covering header: ${JSON.stringify(box)}`);
    }
    if (await details.locator('#jigsaw-fit').count()) { await details.locator('#jigsaw-fit').click(); checks.push('relocated jigsaw menu still runs fit action'); }
    if (await details.locator('#spot-split-mode').count()) {
      await details.locator('#spot-candidates input[type="checkbox"]').first().check();
      await details.locator('#spot-split-mode').click(); assert.equal(await details.locator('#spot-split-mode').getAttribute('aria-pressed'), 'true');
      await details.locator('#spot-split-mode').click(); assert.equal(await details.locator('#spot-split-mode').getAttribute('aria-pressed'), 'false');
      checks.push('relocated spot candidate menu still changes split mode');
    }
    await page.keyboard.press('Escape'); await page.waitForFunction(el => !el.open, await details.elementHandle());
    assert.equal(await summary.evaluate(el => document.activeElement === el), true, `${label} Escape returns summary focus`);
    await summary.click(); await page.waitForFunction(el => el.open, await details.elementHandle());
    await page.mouse.click(3, 2); await page.waitForFunction(el => !el.open, await details.elementHandle());
    await summary.click(); await page.waitForFunction(el => el.open, await details.elementHandle());
    const close = details.locator('button[aria-label*="閉じ"]:visible').first();
    assert.ok(await close.count(), `${label} has an explicit close button`);
    await close.click(); await page.waitForFunction(el => !el.open, await details.elementHandle());
    assert.equal(await summary.evaluate(el => document.activeElement === el), true, `${label} × returns summary focus`);
    assert.deepEqual(await page.locator(editorSelector).evaluate(el => el.getBoundingClientRect().toJSON()), original, `${label} open/close never moves workspace`);
    checks.push(`${label}: opens within screen; Escape/outside tap/× close; focus returns; workspace fixed`);
  }
  await page.locator('.px-tool-header-controls').evaluateAll(nodes => nodes.forEach(el => { el.scrollLeft = 0; }));
}
try {
  for (const variant of variants.filter(variant => !selectedVariants || selectedVariants.includes(`${variant.width}x${variant.height}`))) {
    for (const tool of tools.filter(tool => !selectedTools || selectedTools.includes(tool.name))) {
      const label = `${tool.name}-${variant.width}x${variant.height}-dpr${variant.dpr}`;
      const context = await browser.newContext({ viewport: variant, deviceScaleFactor: variant.dpr, hasTouch: true, permissions: ['camera'] });
      // External services are outside this deterministic local layout fixture. Production code stays untouched.
      await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.fulfill({ status: 200, body: '' }));
      const page = await context.newPage(), errors = [], failures = [], checks = [];
      page.setDefaultTimeout(12000);
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400) failures.push({ url: response.url(), status: response.status() }); });
      const measure = () => page.evaluate(({ workspace, control }) => {
        const rect = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON() || null;
        const header = document.querySelector('.px-site-header');
        const visible = element => { const r = element.getBoundingClientRect(), s = getComputedStyle(element); return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none'; };
        return { header: rect('.px-site-header'), main: rect('main'), workspace: rect(workspace), control: rect(control), title: document.title,
          bodyToolName: document.body.dataset.toolName, brandText: header?.querySelector('.px-header-brand')?.innerText,
          headings: [...document.querySelectorAll('main h1')].map(el => ({ text: el.textContent, visible: visible(el), rect: el.getBoundingClientRect().toJSON() })),
          buttons: [...header?.querySelectorAll('button,summary,a') || []].filter(visible).filter(el => el.tagName === 'SUMMARY' || !el.parentElement?.closest('details')).map(el => ({ id: el.id, label: el.getAttribute('aria-label') || el.title || el.innerText, rect: el.getBoundingClientRect().toJSON(), disabled: el.disabled || false })),
          overflow: document.documentElement.scrollWidth > innerWidth,
          nav: [...document.querySelectorAll('.app-tabs > *')].map(el => ({ id: el.id, label: el.getAttribute('aria-label') || el.textContent, rect: el.getBoundingClientRect().toJSON() })) };
      }, tool);
      try {
        await page.goto(base + tool.path, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.documentElement.classList.contains('px-header-ready'));
        if (tool.name === 'game') await page.waitForFunction(() => document.querySelector('#game-primary') && !document.querySelector('#main')?.inert);
        else if (tool.name !== 'pixel-camera') await page.waitForFunction(() => document.querySelector('#project-open') && !document.querySelector('#main')?.inert);
        else await page.waitForFunction(() => document.querySelector('#view')?.width > 1 && document.querySelector('#capture')?.disabled === false);
        await page.waitForTimeout(200);
        const initial = await measure();
        checks.push('header and isolated workspace initialized');
        assert.equal(initial.overflow, false, 'No document horizontal overflow');
        if (phase === 'after') {
          assert.ok(initial.title.length > 0, 'Document title remains available');
          assert.ok(initial.buttons.length >= 2, 'Header keeps home and site menu available during empty setup');
          assert.ok(!initial.brandText.includes(initial.bodyToolName), 'Tool name does not consume visible header space');
          assert.ok(initial.headings.every(heading => !heading.visible), 'Page title remains accessible without a visible title row');
          await headerReachability(page, variant);
          const prior = before.find(row => row.label === label)?.measurement;
          assert.ok(prior, 'Immutable before measurement exists');
          checks.push('all visible header targets fit and are 44px; document title preserved');
          const menu = page.locator('[data-menu-toggle]');
          await menu.click(); await page.locator('[data-site-menu]').waitFor({ state: 'visible' });
          await page.keyboard.press('Escape'); await page.locator('[data-site-menu]').waitFor({ state: 'hidden' });
          assert.equal(await menu.evaluate(el => document.activeElement === el), true, 'Escape restores menu trigger focus');
          const afterMenu = await measure();
          assert.deepEqual(afterMenu.workspace, initial.workspace, 'Header menu does not move workspace');
          checks.push('site menu opens, Escape closes and returns focus; workspace rect remains fixed');
        }
        const editorSelector = await prepareWorkspace(page, tool, checks);
        await page.waitForTimeout(150);
        const editor = await page.locator(editorSelector).evaluate(el => el.getBoundingClientRect().toJSON());
        let editorHeaderTargets = [];
        if (phase === 'after') {
          editorHeaderTargets = await headerReachability(page, variant);
          assert.ok(editorHeaderTargets.length >= 3, 'Active editor adds useful controls to the header');
          checks.push(`${editorHeaderTargets.length} editing header targets remain at least 44px and reachable by horizontal scroll`);
          await headerPanels(page, editorSelector, checks);
          if (tool.name === 'hidden-object') {
            await page.locator('[data-hidden-mode="erase"]').click(); assert.equal(await page.locator('[data-hidden-mode="erase"]').getAttribute('aria-pressed'), 'true');
            await page.locator('[data-hidden-mode="paint"]').click(); assert.equal(await page.locator('[data-hidden-mode="paint"]').getAttribute('aria-pressed'), 'true');
            checks.push('relocated hidden-object erase/paint controls preserve mode events');
          }
          if (await page.locator('#project-open').count()) {
            await page.locator('#project-open').click(); await page.locator('#pxd-panel').waitFor({ state: 'visible' });
            await page.locator('#project-tab-current').click();
            assert.equal(await page.locator('#pxd-save').count(), 1, 'Saving remains in file management');
            await page.locator('#project-close').click(); await page.locator('#pxd-panel').waitFor({ state: 'hidden' });
            assert.equal(await page.locator('#project-open').evaluate(el => document.activeElement === el), true, 'File close restores launcher focus');
            assert.deepEqual(await page.locator(editorSelector).evaluate(el => el.getBoundingClientRect().toJSON()), editor, 'File menu keeps workspace rect unchanged');
            checks.push('file management retains save; × closes and restores launcher focus with fixed workspace');
          }
        }
        const prior = before.find(row => row.label === label);
        const comparison = phase === 'after' ? { setupHeightDelta: initial.workspace.height - prior.measurement.workspace.height, setupTopDelta: initial.workspace.y - prior.measurement.workspace.y,
          editorHeightDelta: editor.height - prior.editor.height, editorWidthDelta: editor.width - prior.editor.width } : null;
        if (phase === 'after') assert.ok(editor.width * editor.height >= prior.editor.width * prior.editor.height - 1, `Editing area must stay as large as before: ${JSON.stringify({ editor, before: prior.editor, comparison })}`);
        await page.mouse.move(variant.width - 4, variant.height - 4);
        await page.screenshot({ path: `${output}/${phase}-${label}.png`, fullPage: false });
        if (phase === 'after' && tool.name === 'game') {
          await page.locator('#game-new').click(); await page.locator('#game-setup').waitFor({ state: 'visible' });
          await page.locator('#game-new').waitFor({ state: 'hidden' });
          checks.push('relocated game reset returns to setup and hides its editor-only header slot');
        }
        results.push({ label, tool: tool.name, variant, checks, measurement: initial, editor, editorHeaderTargets, comparison, errors, localHttpFailures: failures });
      } catch (error) {
        await page.screenshot({ path: `${output}/${phase}-${label}-failure.png`, fullPage: false }).catch(() => {});
        results.push({ label, tool: tool.name, variant, checks, failure: error.stack, measurement: await measure().catch(() => null), errors, localHttpFailures: failures });
      } finally { await context.close(); }
      console.log(`${phase}: ${label}: ${results.at(-1).failure ? 'FAIL' : 'PASS'}`);
      await writeFile(`${output}/${phase}.json`, JSON.stringify(results, null, 2));
    }
  }
} finally { await browser.close(); }
assert.equal(results.filter(row => row.failure || row.errors.length || row.localHttpFailures.length).length, 0, `${phase}: acceptance or application errors; inspect ${output}/${phase}.json`);
console.log(`${phase}: ${results.length} page/viewport fixtures PASS`);
