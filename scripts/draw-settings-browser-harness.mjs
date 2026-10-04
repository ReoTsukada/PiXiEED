import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const baseUrl = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
const playwrightPath = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const outDir = '/tmp/pixieed-draw-settings-symmetry-panel';
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const browser = await chromium.launch({ headless: true });
const viewports = [
  { name: '320x568', width: 320, height: 568 },
  { name: '390x844', width: 390, height: 844 },
  { name: '844x390', width: 844, height: 390 },
  { name: '1280x800', width: 1280, height: 800 },
];
const symmetryIds = ['draw-mirror', 'draw-mirror-vertical', 'draw-mirror-diagonal-down', 'draw-mirror-diagonal-up'];
const results = [];
let assertions = 0;
const check = (value, message) => { assertions += 1; assert.ok(value, message); };
const equal = (actual, expected, message) => { assertions += 1; assert.deepEqual(actual, expected, message); };

async function openPage(viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1, hasTouch: true, isMobile: viewport.width < 600 });
  const page = await context.newPage();
  const pageErrors = [];
  await page.route('**/*', route => {
    try { return new URL(route.request().url()).origin === baseUrl ? route.continue() : route.abort(); }
    catch { return route.abort(); }
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`${baseUrl}/draw/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#draw-canvas') && document.querySelector('#draw-settings-picker')
    && document.querySelector('#draw-onion-toggle') && document.querySelector('#draw-mirror-diagonal-up'), null, { timeout: 15000 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return { context, page, pageErrors };
}

async function openSettings(page) {
  if (!(await page.locator('#draw-settings-picker').evaluate(node => node.open))) {
    await page.locator('#draw-settings-summary').click();
  }
  await page.waitForFunction(() => document.querySelector('#draw-settings-picker')?.open === true);
  await page.locator('.draw-settings-panel').waitFor({ state: 'visible' });
}

async function viewportCheck(viewport) {
  const { context, page, pageErrors } = await openPage(viewport);
  await openSettings(page);
  const geometry = await page.evaluate(() => {
    const rect = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    const panel = document.querySelector('.draw-settings-panel');
    const buttons = [...panel.querySelectorAll(':scope > button')].map(button => ({
      id: button.id, rect: rect(button), ariaLabel: button.getAttribute('aria-label'), title: button.title,
      ariaPressed: button.getAttribute('aria-pressed'), disabled: button.disabled,
      text: button.innerText.trim(), ariaDescription: button.getAttribute('aria-description'),
    }));
    const summary = rect(document.querySelector('#draw-settings-summary'));
    const panelRect = rect(panel);
    const actions = document.querySelector('.draw-actions')?.getBoundingClientRect();
    const actionsRect = actions ? { x: actions.x, y: actions.y, width: actions.width, height: actions.height } : null;
    const overlap = (a, b) => a && b && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    const intersects = [];
    for (let i = 0; i < buttons.length; i += 1) for (let j = i + 1; j < buttons.length; j += 1) {
      if (overlap(buttons[i].rect, buttons[j].rect)) intersects.push([buttons[i].id, buttons[j].id]);
    }
    const visibleText = panel.innerText.trim();
    const headings = [...panel.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(node => {
      const s = getComputedStyle(node); return s.display !== 'none' && s.visibility !== 'hidden' && node.getBoundingClientRect().width > 0;
    }).map(node => node.textContent.trim());
    return { summary, panel: panelRect, actions: actionsRect, panelCoversActions: overlap(panelRect, actionsRect),
      buttons, intersects, visibleText, headings, countBadge: Boolean(document.querySelector('#draw-settings-count')),
      panelWidth: getComputedStyle(panel).width, gridColumns: getComputedStyle(panel).gridTemplateColumns,
      pageWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight };
  });
  check(geometry.summary.width >= 44 && geometry.summary.height >= 44, `${viewport.name}: settings summary target under 44px: ${JSON.stringify(geometry.summary)}`);
  check(geometry.panel.width >= 240 && geometry.panel.width <= 270 && geometry.panel.x >= 0 && geometry.panel.y >= 0
    && geometry.panel.x + geometry.panel.width <= viewport.width + 0.5 && geometry.panel.y + geometry.panel.height <= viewport.height + 0.5,
    `${viewport.name}: panel is outside its compact viewport bounds: ${JSON.stringify(geometry.panel)}`);
  check(!geometry.panelCoversActions, `${viewport.name}: panel overlaps the action row: ${JSON.stringify({ panel: geometry.panel, actions: geometry.actions })}`);
  equal(geometry.buttons.map(button => button.id), ['draw-mirror', 'draw-mirror-vertical', 'draw-mirror-diagonal-down', 'draw-mirror-diagonal-up', 'draw-grid-toggle', 'draw-onion-toggle'], `${viewport.name}: six expected setting buttons`);
  check(geometry.buttons.every(button => button.rect.width >= 48 && button.rect.height >= 48 && Math.abs(button.rect.width - button.rect.height) <= 1.5),
    `${viewport.name}: controls must be square and at least 48px: ${JSON.stringify(geometry.buttons)}`);
  check(geometry.intersects.length === 0, `${viewport.name}: setting buttons overlap: ${JSON.stringify(geometry.intersects)}`);
  check(geometry.buttons.every(button => button.ariaLabel?.trim() && button.title?.trim() && ['true', 'false'].includes(button.ariaPressed)),
    `${viewport.name}: controls need accessible names and boolean pressed state: ${JSON.stringify(geometry.buttons)}`);
  check(geometry.buttons.every(button => button.text === ''), `${viewport.name}: icon-only setting controls should not show label text`);
  check(geometry.visibleText === '' && geometry.headings.length === 0 && !geometry.countBadge,
    `${viewport.name}: settings panel should not show labels, group headings, or count badge: ${JSON.stringify({ text: geometry.visibleText, headings: geometry.headings, badge: geometry.countBadge })}`);
  check(geometry.pageWidth <= geometry.viewportWidth + 1, `${viewport.name}: page has horizontal overflow`);
  check(geometry.gridColumns.split(' ').length === 4, `${viewport.name}: panel should be a 4-column grid: ${geometry.gridColumns}`);

  // Independent symmetry states: toggling each axis changes only its own control.
  for (const id of symmetryIds) {
    const before = await page.evaluate(ids => Object.fromEntries(ids.map(key => [key, document.getElementById(key).getAttribute('aria-pressed')])), symmetryIds);
    await page.locator(`#${id}`).click();
    await page.waitForFunction(key => document.getElementById(key)?.getAttribute('aria-pressed') === 'true', id);
    const after = await page.evaluate(ids => Object.fromEntries(ids.map(key => [key, document.getElementById(key).getAttribute('aria-pressed')])), symmetryIds);
    check(after[id] === 'true' && symmetryIds.filter(key => key !== id).every(key => after[key] === before[key]), `${viewport.name}: ${id} did not toggle independently: ${JSON.stringify({ before, after })}`);
    await page.locator(`#${id}`).click();
    await page.waitForFunction(key => document.getElementById(key)?.getAttribute('aria-pressed') === 'false', id);
  }

  // Selection disables all symmetry controls with a truthful, accessible reason.
  await page.locator('#draw-tool-summary').click();
  await page.waitForFunction(() => document.querySelector('#draw-tool-picker')?.open === true);
  await page.locator('.draw-tool-menu button[data-draw-tool="select"]').click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-symmetry]')].every(button => button.disabled));
  await openSettings(page);
  const selectionDisabled = await page.evaluate(ids => ids.map(id => {
    const button = document.getElementById(id);
    return { id, disabled: button.disabled, title: button.title, description: button.getAttribute('aria-description') };
  }), symmetryIds);
  check(selectionDisabled.every(item => item.disabled && (item.description?.trim() || item.title?.trim())),
    `${viewport.name}: symmetry disable reason must be exposed through title/aria-description: ${JSON.stringify(selectionDisabled)}`);
  const onion = await page.locator('#draw-onion-toggle').evaluate(button => ({ disabled: button.disabled, title: button.title, description: button.getAttribute('aria-description') }));
  check(onion.disabled && (onion.description?.trim() || onion.title?.trim()), `${viewport.name}: onion disable reason missing: ${JSON.stringify(onion)}`);
  await page.locator('.draw-tools > button[data-draw-tool="pen"]').click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-symmetry]')].every(button => !button.disabled));
  await openSettings(page);

  // Grid remains a real visible toggle and responds to aria-pressed.
  const gridStart = await page.locator('#draw-grid-toggle').getAttribute('aria-pressed');
  await page.locator('#draw-grid-toggle').click();
  await page.waitForFunction(() => document.querySelector('#draw-grid-toggle')?.getAttribute('aria-pressed') === 'false');
  const gridOffClass = await page.locator('.draw-board').evaluate(node => node.classList.contains('has-grid'));
  await page.locator('#draw-grid-toggle').click();
  await page.waitForFunction(() => document.querySelector('#draw-grid-toggle')?.getAttribute('aria-pressed') === 'true');
  check(gridStart === 'true' && !gridOffClass, `${viewport.name}: grid toggle state did not match visible grid`);

  await page.screenshot({ path: `${outDir}/${viewport.name}.png`, fullPage: true });
  check(pageErrors.length === 0, `${viewport.name}: browser errors: ${JSON.stringify(pageErrors)}`);
  results.push({ viewport, geometry, selectionDisabled, onionDisabled: onion, pageErrors });
  await context.close();
}

await mkdir(outDir, { recursive: true });
try {
  for (const viewport of viewports) await viewportCheck(viewport);
  const output = { status: 'PASS', assertions, viewports: results };
  await writeFile(`${outDir}/result.json`, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`PASS draw settings acceptance: ${assertions} assertions / ${viewports.length} viewports`);
  console.log(`${outDir}/result.json`);
} catch (error) {
  const output = { status: 'FAIL', assertions, error: error.message, stack: error.stack, results };
  await writeFile(`${outDir}/failure.json`, `${JSON.stringify(output, null, 2)}\n`);
  throw error;
} finally {
  await browser.close();
}
