#!/usr/bin/env node
/** Local-only usage-help browser checks. Uses isolated storage and a synthetic camera. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'The browser harness must use a local server.');
const runtime = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const { TOOL_GUIDES, getToolGuide } = await import(pathToFileURL(join(process.cwd(), 'js/tool-help-data.mjs')).href);
const outDir = process.env.PIXIEEED_TOOL_HELP_OUT || '/tmp/pixieed-tool-help-polish-20261003';
await mkdir(outDir, { recursive: true });

const viewports = [
  { name: 'desktop1280', width: 1280, height: 800 },
  { name: 'mobile390', width: 390, height: 844 },
  { name: 'landscape844', width: 844, height: 390 },
  { name: 'mobile320', width: 320, height: 568 }
];
const routes = [
  { id: 'draw', path: '/draw/' },
  { id: 'camera', path: '/pixel-camera.html' },
  { id: 'telescope', path: '/telescope/', redirected: true },
  { id: 'audio', path: '/audio/' },
  { id: 'jigsaw', path: '/jigsaw/' },
  { id: 'spot-play', path: '/play/spot-difference/' },
  { id: 'hidden-play', path: '/play/hidden-object/' },
  { id: 'spot-create', path: '/spot-difference/' },
  { id: 'hidden-create', path: '/hidden-object/' },
  { id: 'game', path: '/game/' }
];
const guideById = new Map(TOOL_GUIDES.map(guide => [guide.id, guide]));
const expectedPickerCategories = [
  { title: 'つくる・見る', ids: ['draw', 'camera', 'telescope', 'audio'] },
  { title: '遊ぶ', ids: ['jigsaw', 'spot-play', 'hidden-play'] },
  { title: '問題を作る', ids: ['spot-create', 'hidden-create'] }
];
const guideSections = ['steps', 'controls', 'notes'];
for (const route of routes) assert.ok(guideById.has(route.id), `guide data contains ${route.id}`);
assert.equal(TOOL_GUIDES.filter(guide => guide.listed !== false).length, 9, 'the direct-only game guide is excluded from the picker');
assert.equal(TOOL_GUIDES.find(guide => guide.id === 'game')?.listed, false);
assert.equal(getToolGuide({ pathname: '/globe-prototype.html', search: '?embed=1&tool=telescope' })?.id, 'telescope');
assert.equal(getToolGuide({ pathname: '/globe-prototype.html', search: '?embed=1&tool=telescope&tool=telescope' }), null, 'duplicate telescope query is not treated as the tool route');
assert.equal(getToolGuide({ pathname: '/globe-prototype.html', search: '?embed=1' }), null);
assert.equal(getToolGuide({ pathname: '/globe/' }), null);
assert.equal(getToolGuide({ pathname: '/tools/' }), null);

const sourceFiles = [
  'js/tool-help-data.mjs', 'js/tool-help.mjs', 'js/tool-help-bootstrap.mjs', 'js/site-header.mjs', 'css/tool-help.css',
  'tools/index.html', 'globe-prototype.html', ...routes.map(route => route.path.replace(/^\//, '').replace(/\/$/, '') + (route.path.endsWith('/') ? '/index.html' : ''))
];
const sourceHashes = {};
for (const file of sourceFiles) {
  try { sourceHashes[file] = createHash('sha256').update(await readFile(join(process.cwd(), file))).digest('hex'); }
  catch { sourceHashes[file] = 'unavailable'; }
}

const browser = await chromium.launch({ headless: true });
const records = [];
const failureContext = [];
let activePage = null;
let activeCase = 'startup';
let checks = 0;
let blockedExternal = 0;

async function inspectGeometry(page, viewportLabel) {
  const result = await page.locator('dialog.px-tool-help').evaluate(dialog => {
    const rect = dialog.getBoundingClientRect();
    const content = dialog.querySelector('.px-tool-help__content');
    const contentRect = content.getBoundingClientRect();
    const buttons = [...dialog.querySelectorAll('button:not([hidden])')].map(button => {
      const r = button.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const range = document.createRange();
      range.selectNodeContents(button);
      const textRects = [...range.getClientRects()].map(textRect => ({ left: textRect.left, right: textRect.right, top: textRect.top, bottom: textRect.bottom }));
      return {
        text: button.innerText.trim(), width: r.width, height: r.height,
        centerHit: hit === button || button.contains(hit),
        textContained: textRects.every(textRect => textRect.left >= r.left - 1 && textRect.right <= r.right + 1 && textRect.top >= r.top - 1 && textRect.bottom <= r.bottom + 1)
      };
    });
    return {
      dialog: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      content: { left: contentRect.left, top: contentRect.top, right: contentRect.right, bottom: contentRect.bottom, clientWidth: content.clientWidth, scrollWidth: content.scrollWidth, clientHeight: content.clientHeight, scrollHeight: content.scrollHeight, scrollTop: content.scrollTop },
      page: { innerWidth, innerHeight, documentWidth: document.documentElement.scrollWidth },
      buttons
    };
  });
  const label = `${viewportLabel} ${page.url()}`;
  assert.ok(result.dialog.width > 0 && result.dialog.height > 0, `${label}: help dialog is visible`);
  assert.ok(result.dialog.left >= -1 && result.dialog.top >= -1 && result.dialog.right <= result.page.innerWidth + 1 && result.dialog.bottom <= result.page.innerHeight + 1, `${label}: dialog stays within viewport ${JSON.stringify(result.dialog)}`);
  assert.ok(result.content.left >= result.dialog.left && result.content.right <= result.dialog.right + 1 && result.content.top >= result.dialog.top && result.content.bottom <= result.dialog.bottom + 1, `${label}: content stays inside dialog`);
  assert.ok(result.content.scrollWidth <= result.content.clientWidth + 1, `${label}: no horizontal help-content overflow ${JSON.stringify(result.content)}`);
  assert.ok(result.page.documentWidth <= result.page.innerWidth + 1, `${label}: no page-level horizontal overflow ${JSON.stringify(result.page)}`);
  for (const button of result.buttons) {
    assert.ok(button.width >= 44 && button.height >= 44, `${label}: 44px help target ${JSON.stringify(button)}`);
    assert.ok(button.centerHit, `${label}: help button center is reachable ${JSON.stringify(button)}`);
    assert.ok(button.textContained, `${label}: button text stays inside its bounds ${JSON.stringify(button)}`);
  }
  return result;
}

async function openMenuHelp(page) {
  const toggle = page.locator('[data-menu-toggle]');
  await toggle.waitFor({ state: 'visible', timeout: 10000 });
  await toggle.click();
  await page.locator('[data-site-menu]:not([hidden])').waitFor({ state: 'visible' });
  const trigger = page.locator('[data-tool-help-open]');
  await trigger.waitFor({ state: 'visible', timeout: 5000 });
  await trigger.click();
  const dialog = page.locator('dialog.px-tool-help[open]');
  await dialog.waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.activeElement?.matches('.px-tool-help__close'));
  await page.waitForFunction(() => [...document.styleSheets].some(sheet => sheet.href?.includes('/css/tool-help.css') && sheet.cssRules?.length));
  assert.equal(await page.locator('[data-site-menu]').evaluate(node => node.hidden), true, 'opening help closes the hamburger menu');
  return { dialog, toggle, trigger };
}

async function verifyGuide(page, route, viewport, screenshot = false) {
  activePage = page;
  activeCase = `${viewport.name}-${route.id}`;
  const expected = guideById.get(route.id);
  const { dialog, toggle, trigger } = await openMenuHelp(page);
  assert.equal(await dialog.locator('#px-tool-help-title').textContent(), expected.title, `${route.id}: correct route-specific title`);
  const renderedText = await dialog.locator('.px-tool-help__content').innerText();
  const requiredCopy = [expected.intro, ...(expected.steps || []), ...(expected.controls || []).flatMap(({ action, detail }) => [action, detail]), ...(expected.notes || [])];
  for (const copy of requiredCopy) assert.ok(renderedText.includes(copy), `${route.id}: help includes its complete guide copy: ${copy}`);

  const icon = dialog.locator('.px-tool-help__hero-icon');
  assert.equal(await icon.count(), 1, `${route.id}: guide has its purpose icon`);
  await page.waitForFunction(() => { const image = document.querySelector('dialog.px-tool-help .px-tool-help__hero-icon'); return image?.complete && image.naturalWidth > 0; }, null, { timeout: 3000 });
  const iconInfo = await icon.evaluate(node => ({
    src: node.getAttribute('src'), alt: node.getAttribute('alt'), ariaHidden: node.getAttribute('aria-hidden'),
    visible: node.getClientRects().length > 0, loaded: node.complete && node.naturalWidth > 0
  }));
  assert.ok(iconInfo.src?.startsWith('/assets/icons/pixieed/') && iconInfo.alt === '' && iconInfo.ariaHidden === 'true' && iconInfo.visible && iconInfo.loaded, `${route.id}: purpose icon is visible and decorative ${JSON.stringify(iconInfo)}`);
  const headingTypography = await dialog.evaluate(node => {
    const title = node.querySelector('#px-tool-help-title');
    const sections = [...node.querySelectorAll('[data-tool-help-target] h3')];
    return { title: getComputedStyle(title).fontFamily, sections: sections.map(heading => ({ text: heading.textContent.trim(), fontFamily: getComputedStyle(heading).fontFamily })) };
  });
  if (['draw', 'camera'].includes(route.id)) {
    assert.ok(headingTypography.sections.every(heading => heading.fontFamily === headingTypography.title), `${route.id}: title and section headings use a consistent family ${JSON.stringify(headingTypography)}`);
    checks++;
  }
  if (screenshot) await page.screenshot({ path: join(outDir, `${viewport.name}-${route.id}.png`), animations: 'disabled' });

  const stepsList = dialog.locator('[data-tool-help-target="steps"] ol.px-tool-help__steps');
  assert.equal(await stepsList.evaluate(node => node.tagName), 'OL', `${route.id}: how-to cards keep ordered-list semantics`);
  assert.equal(await stepsList.locator(':scope > li').count(), expected.steps.length, `${route.id}: numbered steps match the guide data`);
  const jumpResults = [];
  assert.equal(await dialog.locator('.px-tool-help__section-nav [data-tool-help-section]').count(), guideSections.length, `${route.id}: all three guide jumps are present`);
  const originalUrl = page.url();
  for (const sectionName of guideSections) {
    const jump = dialog.locator(`[data-tool-help-section="${sectionName}"]`);
    const targetId = `px-tool-help-${sectionName}`;
    assert.equal(await jump.getAttribute('aria-controls'), targetId, `${route.id}/${sectionName}: jump names its controlled section`);
    if (sectionName === 'notes') {
      const notesLabel = await jump.evaluate(node => {
        const segment = node.querySelector('span');
        const style = segment ? getComputedStyle(segment) : null;
        const rect = segment?.getBoundingClientRect();
        const lineHeight = style ? parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2 : 0;
        return { ariaLabel: node.getAttribute('aria-label'), text: node.textContent.trim(), segmentText: segment?.textContent.trim() || '', whiteSpace: style?.whiteSpace || '', segmentHeight: rect?.height || 0, lineHeight };
      });
      assert.deepEqual({ ariaLabel: notesLabel.ariaLabel, text: notesLabel.text, segmentText: notesLabel.segmentText, whiteSpace: notesLabel.whiteSpace }, { ariaLabel: '保存・ヒント', text: '保存・ヒント', segmentText: 'ヒント', whiteSpace: 'nowrap' }, `${route.id}: notes jump preserves its full accessible label and unbroken word ${JSON.stringify(notesLabel)}`);
      assert.ok(notesLabel.segmentHeight <= notesLabel.lineHeight + 1, `${route.id}: notes label word stays on one line ${JSON.stringify(notesLabel)}`);
      checks++;
    }
    const target = dialog.locator(`[data-tool-help-target="${sectionName}"]`);
    assert.equal(await target.count(), 1, `${route.id}/${sectionName}: section target exists`);
    const targetSemantics = await target.evaluate(node => ({
      tag: node.tagName, id: node.id, tabIndex: node.tabIndex, labelledBy: node.getAttribute('aria-labelledby'),
      headingId: node.querySelector('h3')?.id || '', headingText: node.querySelector('h3')?.textContent?.trim() || ''
    }));
    assert.deepEqual({ tag: targetSemantics.tag, id: targetSemantics.id, tabIndex: targetSemantics.tabIndex }, { tag: 'SECTION', id: targetId, tabIndex: -1 }, `${route.id}/${sectionName}: target is a programmatically focusable section`);
    assert.equal(targetSemantics.labelledBy, targetSemantics.headingId, `${route.id}/${sectionName}: target is labelled by its heading`);
    await jump.click();
    await page.waitForFunction(name => {
      const section = document.querySelector(`[data-tool-help-target="${name}"]`);
      const content = document.querySelector('dialog.px-tool-help .px-tool-help__content');
      const heading = section?.querySelector('h3');
      if (!section || !content || !heading || document.activeElement !== section) return false;
      const clip = content.getBoundingClientRect(); const rect = heading.getBoundingClientRect();
      return rect.top >= clip.top - 1 && rect.bottom <= clip.bottom + 1;
    }, sectionName, { timeout: 2000 });
    const jumpMeasurement = await target.evaluate(node => {
      const heading = node.querySelector('h3').getBoundingClientRect(); const clip = node.closest('.px-tool-help__content').getBoundingClientRect();
      return { active: document.activeElement === node, heading: { top: heading.top, bottom: heading.bottom }, content: { top: clip.top, bottom: clip.bottom }, scrollTop: node.closest('.px-tool-help__content').scrollTop };
    });
    assert.equal(page.url(), originalUrl, `${route.id}/${sectionName}: jump does not change the route`);
    jumpResults.push({ section: sectionName, targetSemantics, ...jumpMeasurement });
    checks++;
  }
  const initialGeometry = await inspectGeometry(page, `${route.id} ${viewport.name}`);
  const scrollMetrics = await dialog.locator('.px-tool-help__content').evaluate(node => {
    node.scrollTop = node.scrollHeight;
    const bottom = node.scrollHeight - node.clientHeight;
    return { scrollHeight: node.scrollHeight, clientHeight: node.clientHeight, bottom, scrollTop: node.scrollTop };
  });
  assert.ok(scrollMetrics.scrollTop >= scrollMetrics.bottom - 1, `${route.id}: guide can scroll to its end ${JSON.stringify(scrollMetrics)}`);
  await dialog.locator('.px-tool-help__content').evaluate(node => { node.scrollTop = 0; });

  // A real bubbling key listener installed after the shared header must not see
  // keys while the modal is open; after close, an otherwise inert F1 reaches it.
  await page.evaluate(() => {
    window.__toolHelpKeyProbe = 0;
    document.addEventListener('keydown', () => { window.__toolHelpKeyProbe += 1; });
  });
  // Clicking guide content is an inside-dialog click and must not close it.
  await dialog.locator('.px-tool-help__intro').click();
  assert.equal(await dialog.evaluate(node => node.open), true, `${route.id}: an inside-dialog click keeps help open`);
  await dialog.locator('.px-tool-help__close').focus();
  const tabSequence = [];
  for (let index = 0; index < guideSections.length + 1; index++) {
    await page.keyboard.press('Tab');
    const active = await page.evaluate(() => ({
      section: document.activeElement?.getAttribute('data-tool-help-section') || '',
      isContent: document.activeElement?.matches('.px-tool-help__content') || false,
      insideDialog: Boolean(document.activeElement && document.querySelector('dialog.px-tool-help')?.contains(document.activeElement))
    }));
    assert.equal(active.insideDialog, true, `${route.id}: Tab remains inside the guide dialog ${JSON.stringify(active)}`);
    tabSequence.push(active.section || (active.isContent ? 'content' : 'other'));
    if (active.isContent) break;
  }
  assert.deepEqual(tabSequence, [...guideSections, 'content'], `${route.id}: Tab reaches the named content region after all three jump buttons`);
  const keyboardScrollBefore = await dialog.locator('.px-tool-help__content').evaluate(node => ({
    top: node.scrollTop,
    overflows: node.scrollHeight > node.clientHeight + 1
  }));
  await page.keyboard.press('PageDown');
  if (keyboardScrollBefore.overflows) {
    await page.waitForFunction(before => {
      const content = document.querySelector('dialog.px-tool-help .px-tool-help__content');
      return content && content.scrollTop > before;
    }, keyboardScrollBefore.top, { timeout: 1500 });
  }
  const keyboardScroll = await dialog.locator('.px-tool-help__content').evaluate(node => node.scrollTop);
  assert.ok(!keyboardScrollBefore.overflows || keyboardScroll > keyboardScrollBefore.top, `${route.id}: the focused overflowing guide region responds to PageDown (${keyboardScrollBefore.top} -> ${keyboardScroll})`);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true, `${route.id}: Shift+Tab stays inside the route-help dialog`);

  const beforeKeyboard = await page.evaluate(() => ({
    url: location.pathname + location.search,
    page: document.body.dataset.page || '',
    controls: [...document.querySelectorAll('input,select,textarea')].map(node => ({ id: node.id, value: node.value, checked: node.checked, disabled: node.disabled })),
    states: [...document.querySelectorAll('[aria-pressed],[aria-selected],[data-mode],[data-ready],[data-settings-context],[data-region-merge]')].map(node => ({ id: node.id, pressed: node.getAttribute('aria-pressed'), selected: node.getAttribute('aria-selected'), mode: node.dataset.mode, ready: node.dataset.ready, context: node.dataset.settingsContext, merge: node.dataset.regionMerge }))
  }));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => window.__toolHelpKeyProbe), 0, `${route.id}: dialog keyboard is stopped before the document bubble phase`);
  const afterKeyboard = await page.evaluate(() => ({
    url: location.pathname + location.search,
    page: document.body.dataset.page || '',
    controls: [...document.querySelectorAll('input,select,textarea')].map(node => ({ id: node.id, value: node.value, checked: node.checked, disabled: node.disabled })),
    states: [...document.querySelectorAll('[aria-pressed],[aria-selected],[data-mode],[data-ready],[data-settings-context],[data-region-merge]')].map(node => ({ id: node.id, pressed: node.getAttribute('aria-pressed'), selected: node.getAttribute('aria-selected'), mode: node.dataset.mode, ready: node.dataset.ready, context: node.dataset.settingsContext, merge: node.dataset.regionMerge }))
  }));
  assert.deepEqual(afterKeyboard, beforeKeyboard, `${route.id}: dialog keyboard does not change underlying tool state`);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog.px-tool-help')?.open);
  await page.waitForFunction(() => document.querySelector('[data-site-menu]')?.hidden === true);
  await page.keyboard.press('F1');
  assert.equal(await page.evaluate(() => window.__toolHelpKeyProbe), 1, `${route.id}: document keyboard probe resumes after the dialog closes`);
  await page.waitForFunction(() => document.activeElement?.matches('[data-menu-toggle],[data-tool-help-open]'), null, { timeout: 2000 }).catch(() => {});
  const focusReturn = await page.evaluate(() => {
    const active = document.activeElement;
    return { tag: active?.tagName || '', id: active?.id || '', className: typeof active?.className === 'string' ? active.className : '', ariaLabel: active?.getAttribute?.('aria-label') || '', text: active?.textContent?.trim().slice(0, 60) || '', isMenuToggle: active?.matches('[data-menu-toggle]') || false, isMenuHelp: active?.matches('[data-tool-help-open]') || false, isConnected: Boolean(active?.isConnected), hiddenAncestor: Boolean(active?.closest('[hidden]')) };
  });
  assert.ok(focusReturn.isMenuToggle || focusReturn.isMenuHelp, `${route.id}: Escape returns focus to hamburger/menu help, got ${JSON.stringify(focusReturn)}`);
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false', `${route.id}: menu is closed after help closes`);
  checks++;
  records.push({ kind: 'route', id: route.id, inputPath: route.path, finalUrl: page.url(), viewport, geometry: initialGeometry, guideIcon: iconInfo, headingTypography, orderedStepCount: expected.steps.length, jumpNavigation: jumpResults, tabSequence, contentScroll: scrollMetrics, focusReturn });
  return dialog;
}

async function visit(page, path, viewport, pageErrors, cssResponses, screenshot = false) {
  activePage = page;
  activeCase = `${viewport.name}-${path}`;
  pageErrors.length = 0;
  cssResponses.length = 0;
  await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
  if (path === '/pixel-camera.html') {
    await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.ready === 'true', null, { timeout: 15000 });
  }
  await page.waitForFunction(() => document.querySelector('[data-menu-toggle]') && document.querySelector('[data-tool-help-open]'), null, { timeout: 15000 });
  const loadedGuide = await page.evaluate(async () => {
    const { getToolGuide: getGuide } = await import('/js/tool-help-data.mjs');
    return getGuide({ pathname: location.pathname, search: location.search });
  });
  assert.ok(loadedGuide, `${viewport.name} ${path}: target route resolves a guide`);
  const route = routes.find(item => item.id === loadedGuide.id);
  assert.ok(route, `${viewport.name} ${path}: target maps to a known guide`);
  if (route.redirected) {
    assert.equal(new URL(page.url()).pathname, '/globe-prototype.html', 'the telescope link performs the real redirect');
    assert.equal(new URL(page.url()).searchParams.get('tool'), 'telescope', 'the redirected telescope page retains its tool query');
  }
  await verifyGuide(page, route, viewport, screenshot);
  const actualCss = cssResponses.at(-1) || null;
  return { route, actualCss, errors: [...pageErrors] };
}

async function verifyToolsPicker(page, viewport, pageErrors, cssResponses) {
  activePage = page;
  activeCase = `${viewport.name}-tools-picker`;
  pageErrors.length = 0;
  cssResponses.length = 0;
  await page.goto(`${base}/tools/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-tool-help-hub]', { state: 'visible', timeout: 15000 });
  const hubButton = page.locator('[data-tool-help-hub]');
  await hubButton.click();
  const dialog = page.locator('dialog.px-tool-help[open]');
  await dialog.waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.activeElement?.matches('.px-tool-help__close'));
  await page.waitForFunction(() => [...document.querySelectorAll('dialog.px-tool-help .px-tool-help__choice-icon')].every(image => image.complete && image.naturalWidth > 0), null, { timeout: 3000 });
  await page.screenshot({ path: join(outDir, `${viewport.name}-tools-picker.png`), animations: 'disabled' });
  const choices = dialog.locator('.px-tool-help__guide-choice');
  const expectedGuides = TOOL_GUIDES.filter(guide => guide.listed !== false);
  assert.equal(await choices.count(), expectedGuides.length, 'picker contains all listed guides and omits direct-only game');
  const renderedTitles = await choices.locator('strong').allTextContents();
  assert.deepEqual(renderedTitles, expectedGuides.map(guide => guide.title), 'picker order and titles match the guide catalog');
  assert.equal(renderedTitles.includes(guideById.get('game').title), false, 'direct-only game is not listed in the picker');
  const pickerCategories = dialog.locator('.px-tool-help__picker-category');
  assert.equal(await pickerCategories.count(), expectedPickerCategories.length, 'picker preserves the three purpose categories');
  const categoryRecords = [];
  for (let index = 0; index < expectedPickerCategories.length; index++) {
    const category = pickerCategories.nth(index);
    const expectedCategory = expectedPickerCategories[index];
    const categoryTitle = await category.locator('.px-tool-help__category-title').textContent();
    assert.equal(categoryTitle?.trim(), expectedCategory.title, `picker category ${index} title/order`);
    const categoryIds = expectedCategory.ids;
    const categoryTitles = categoryIds.map(id => guideById.get(id).title);
    const actualCategoryTitles = await category.locator('.px-tool-help__guide-choice strong').allTextContents();
    assert.deepEqual(actualCategoryTitles, categoryTitles, `${expectedCategory.title}: guide grouping/order`);
    categoryRecords.push({ title: expectedCategory.title, guideIds: categoryIds, titles: actualCategoryTitles });
  }

  for (let index = 0; index < expectedGuides.length; index++) {
    const choice = choices.nth(index);
    await choice.evaluate(node => node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
    await page.waitForTimeout(120);
    const metrics = await choice.evaluate(node => {
      const r = node.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const range = document.createRange(); range.selectNodeContents(node);
      const textRects = [...range.getClientRects()].map(textRect => ({ left: textRect.left, right: textRect.right, top: textRect.top, bottom: textRect.bottom }));
      const icon = node.querySelector('.px-tool-help__choice-icon');
      return { title: node.querySelector('strong')?.textContent, width: r.width, height: r.height, centerHit: hit === node || node.contains(hit), textContained: textRects.every(x => x.left >= r.left - 1 && x.right <= r.right + 1 && x.top >= r.top - 1 && x.bottom <= r.bottom + 1), icon: icon ? { src: icon.getAttribute('src'), alt: icon.getAttribute('alt'), ariaHidden: icon.getAttribute('aria-hidden'), visible: icon.getClientRects().length > 0, loaded: icon.complete && icon.naturalWidth > 0 } : null };
    });
    assert.ok(metrics.width >= 44 && metrics.height >= 44 && metrics.centerHit && metrics.textContained, `picker choice ${index} reachable/content-fit ${JSON.stringify(metrics)}`);
    assert.ok(metrics.icon?.src?.startsWith('/assets/icons/pixieed/') && metrics.icon.alt === '' && metrics.icon.ariaHidden === 'true' && metrics.icon.visible && metrics.icon.loaded, `picker choice ${index} has a visible decorative purpose icon ${JSON.stringify(metrics.icon)}`);
  }

  const firstChoice = choices.first();
  await firstChoice.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(title => document.querySelector('#px-tool-help-title')?.textContent === title, expectedGuides[0].title);
  assert.equal(await dialog.locator('.px-tool-help__intro').textContent(), expectedGuides[0].intro, 'Enter opens the focused guide');
  const geometry = await inspectGeometry(page, `tools-picker ${viewport.name}`);
  await dialog.locator('.px-tool-help__back').click();
  await page.waitForFunction(() => document.querySelectorAll('.px-tool-help__guide-choice').length > 0);
  assert.equal(await choices.count(), expectedGuides.length, 'back returns to the picker');
  const lastChoice = choices.last();
  await lastChoice.evaluate(node => node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
  await page.waitForTimeout(120);
  await lastChoice.focus();
  const lastChoiceVisibility = await lastChoice.evaluate(node => {
    const r = node.getBoundingClientRect(); const content = node.closest('.px-tool-help__content').getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { focused: document.activeElement === node, top: r.top, bottom: r.bottom, contentTop: content.top, contentBottom: content.bottom, centerHit: hit === node || node.contains(hit) };
  });
  assert.ok(lastChoiceVisibility.focused && lastChoiceVisibility.top >= lastChoiceVisibility.contentTop && lastChoiceVisibility.bottom <= lastChoiceVisibility.contentBottom && lastChoiceVisibility.centerHit, `last picker target is visibly focused before edge-wrap: ${JSON.stringify(lastChoiceVisibility)}`);
  await page.keyboard.press('Tab');
  assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true, 'Tab from the final picker item stays inside the dialog');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true, 'Shift+Tab from the wrapped picker item stays inside the dialog');
  await dialog.locator('.px-tool-help__content').evaluate(node => { node.scrollTop = 0; });
  // Backdrop click closes, but a click within the dialog content should not.
  await dialog.locator('.px-tool-help__intro').click();
  assert.equal(await dialog.evaluate(node => node.open), true, 'clicking picker copy does not close the dialog');
  await page.mouse.click(2, 2);
  await page.waitForFunction(() => !document.querySelector('dialog.px-tool-help')?.open);
  assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-tool-help-hub]') || false), true, 'backdrop close restores focus to the Tools help trigger');

  await hubButton.click();
  await page.locator('dialog.px-tool-help[open]').waitFor({ state: 'visible' });
  await page.locator('.px-tool-help__close').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('dialog.px-tool-help')?.open);
  const returned = await page.evaluate(() => document.activeElement?.matches('[data-tool-help-hub]') || false);
  assert.equal(returned, true, 'Enter on close returns focus to the Tools page help trigger');
  assert.deepEqual(pageErrors, [], `Tools picker has no page errors: ${pageErrors.join(' | ')}`);
  records.push({ kind: 'tools-picker', viewport, guideCount: expectedGuides.length, categories: categoryRecords, titles: renderedTitles, geometry, focusReturn: returned, cssResponse: cssResponses.at(-1) || null });
  checks++;
}

async function verifyUnknownGlobe(page, path, viewport) {
  activePage = page;
  activeCase = `${viewport.name}-unknown-${path.replace(/[^a-z0-9]+/gi, '-')}`;
  await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-menu-toggle]', { state: 'visible', timeout: 15000 });
  await page.waitForTimeout(250);
  assert.equal(await page.locator('[data-tool-help-open]').count(), 0, `${path} is not incorrectly given the telescope guide`);
  records.push({ kind: 'no-guide-route', path, viewport, helpEntryCount: 0 });
  checks++;
}

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(() => {
      // Camera route gets only a synthetic stream; no permission prompt or physical device is used.
      navigator.mediaDevices.getSupportedConstraints = () => ({});
      navigator.mediaDevices.enumerateDevices = async () => [{ kind: 'videoinput', deviceId: 'synthetic-camera', label: 'Synthetic camera', groupId: 'synthetic' }];
      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#344e79'; ctx.fillRect(0, 0, 320, 240);
        ctx.fillStyle = '#d36c58'; ctx.fillRect(110, 70, 100, 110);
        return canvas.captureStream(15);
      };
    });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'pagead2.googlesyndication.com') return route.fulfill({ contentType: 'application/javascript', body: '' });
      if (url.origin !== origin) { blockedExternal++; return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    const pageErrors = [];
    const cssResponses = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('response', async response => {
      if (new URL(response.url()).pathname !== '/css/tool-help.css') return;
      try { cssResponses.push(createHash('sha256').update(await response.body()).digest('hex')); } catch { /* response may already be disposed */ }
    });

    await verifyToolsPicker(page, viewport, pageErrors, cssResponses);
    for (const route of routes) {
      const result = await visit(page, route.path, viewport, pageErrors, cssResponses, ['draw', 'camera'].includes(route.id));
      assert.deepEqual(result.errors, [], `${route.id} has no uncaught page errors: ${result.errors.join(' | ')}`);
      records.at(-1).cssResponse = result.actualCss;
      if (result.actualCss) assert.equal(result.actualCss, sourceHashes['css/tool-help.css'], 'loaded help CSS matches the frozen source');
    }

    // The explicit embed route is equivalent to the real /telescope/ redirect target.
    if (viewport.name === 'mobile390') {
      const explicit = await visit(page, '/globe-prototype.html?embed=1&tool=telescope&v=20260928-solar-navigation-1', viewport, pageErrors, cssResponses);
      assert.equal(explicit.route.id, 'telescope');
      await verifyUnknownGlobe(page, '/globe/', viewport);
      await verifyUnknownGlobe(page, '/globe-prototype.html?embed=1', viewport);
    }
    await context.close();
  }

  const summary = {
    status: 'PASS', checks, viewports, routeCount: routes.length, guideIds: TOOL_GUIDES.map(guide => guide.id),
    listedGuideCount: TOOL_GUIDES.filter(guide => guide.listed !== false).length,
    blockedExternalRequests: blockedExternal, sourceHashes, records,
    boundaries: ['Synthetic camera only; physical camera and device permissions were not used.', 'External requests were blocked; public backend fixtures were not written.', 'Chromium local browser only; Safari, production and physical devices are untested.']
  };
  await writeFile(join(outDir, 'results.json'), JSON.stringify(summary, null, 2));
  console.log(`Tool help: ${checks}/${checks} PASS; 10 routes across ${viewports.length} viewports, telescope redirect/query and route exclusions; external requests blocked; ${outDir}`);
} catch (error) {
  let failureScreenshot = null;
  if (activePage) {
    failureScreenshot = join(outDir, `failure-${activeCase.replace(/[^a-z0-9-]+/gi, '-')}.png`);
    await activePage.screenshot({ path: failureScreenshot, animations: 'disabled' }).catch(() => { failureScreenshot = null; });
  }
  failureContext.push({ message: error.message, stack: error.stack, checks, activeCase, failureScreenshot, records });
  await writeFile(join(outDir, 'failure.json'), JSON.stringify({ sourceHashes, failureContext, records }, null, 2));
  throw error;
} finally {
  await browser.close();
}
