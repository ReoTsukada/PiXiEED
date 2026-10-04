import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const baseUrl = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const baseOutDir = '/tmp/pixieed-draw-tools-20261004';
const layoutOnly = process.env.PIXIEED_DRAW_TOOL_LAYOUT_ONLY === '1';
const outDir = layoutOnly ? `${baseOutDir}/grouped-menu-final` : baseOutDir;
const { chromium } = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({ headless: true });
const viewports = [
  { width: 320, height: 568, name: '320x568' },
  { width: 390, height: 844, name: '390x844' },
  { width: 1280, height: 900, name: '1280x900' },
  { width: 844, height: 390, name: '844x390' },
];
const menuTools = ['fill', 'spray', 'line', 'rectangle', 'rectangle-fill', 'ellipse', 'ellipse-fill', 'select', 'picker'];
const toolGroups = [
  { title: '塗る', tools: ['fill', 'spray'] },
  { title: '図形', tools: ['line', 'rectangle', 'rectangle-fill', 'ellipse', 'ellipse-fill'] },
  { title: '選ぶ', tools: ['select', 'picker'] },
];
const results = { baseUrl, viewports: [], scenarios: [], pageErrors: [], sharedIcons: [], sourceHashes: {} };
let assertions = 0;
let currentPage = null;

function check(condition, message) { assertions += 1; assert.ok(condition, message); }
function equal(actual, expected, message) { assertions += 1; assert.deepEqual(actual, expected, message); }
function bytesEqual(actual, expected, message) { assertions += 1; assert.deepEqual(actual, expected, message); }

async function preparePage(viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1, hasTouch: true, isMobile: viewport.width < 600 });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__drawHarnessPointerId = null;
    window.__drawHarnessLastPointerDown = null;
    document.addEventListener('pointerdown', (event) => {
      window.__drawHarnessPointerId = event.pointerId;
      const canvas = document.querySelector('#draw-canvas');
      const r = canvas?.getBoundingClientRect();
      window.__drawHarnessLastPointerDown = r ? { x: event.clientX, y: event.clientY, pointerId: event.pointerId,
        mappedX: Math.floor((event.clientX - r.left) * canvas.width / r.width), mappedY: Math.floor((event.clientY - r.top) * canvas.height / r.height),
        target: event.target?.id || event.target?.className?.baseVal || event.target?.className || event.target?.tagName } : null;
    }, true);
  });
  page.on('pageerror', (error) => results.pageErrors.push({ viewport: viewport.name, url: page.url(), message: error.message }));
  await page.route('**/*', (route) => {
    try { return new URL(route.request().url()).origin === baseUrl ? route.continue() : route.abort(); }
    catch { return route.abort(); }
  });
  await page.goto(`${baseUrl}/draw/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#draw-canvas');
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#draw-canvas');
    return canvas && canvas.width === 16 && canvas.height === 16 && canvas.dataset.tool === 'pen' && document.querySelector('#draw-palette .draw-color');
  }, null, { timeout: 10000 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  currentPage = page;
  return { context, page };
}

async function canvasState(page) {
  return page.locator('#draw-canvas').evaluate((canvas) => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const rect = canvas.getBoundingClientRect(); const style = getComputedStyle(canvas);
    const transform = new DOMMatrixReadOnly(style.transform);
    return {
      width: canvas.width, height: canvas.height, data: Array.from(image.data),
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height,
        sx: Math.hypot(transform.a, transform.b), sy: Math.hypot(transform.c, transform.d),
        borderLeft: parseFloat(style.borderLeftWidth) || 0, borderRight: parseFloat(style.borderRightWidth) || 0,
        borderTop: parseFloat(style.borderTopWidth) || 0, borderBottom: parseFloat(style.borderBottomWidth) || 0 },
    };
  });
}

function pixelPoint(state, x, y) {
  const r = state.rect;
  return {
    // This intentionally mirrors rawPixelCellAt: source coordinates use the complete client rect.
    x: r.left + (x + 0.5) * r.width / state.width,
    y: r.top + (y + 0.5) * r.height / state.height,
  };
}

function changedIndices(before, after) {
  const changed = [];
  for (let i = 0; i < before.data.length; i += 4) {
    if (before.data[i] !== after.data[i] || before.data[i + 1] !== after.data[i + 1] || before.data[i + 2] !== after.data[i + 2] || before.data[i + 3] !== after.data[i + 3]) changed.push(i / 4);
  }
  return changed;
}

async function dragPixels(page, from, to) {
  const before = await canvasState(page);
  const a = pixelPoint(before, from.x, from.y); const b = pixelPoint(before, to.x, to.y);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  if (from.x !== to.x || from.y !== to.y) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const steps = Math.max(3, Math.min(24, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 12)));
    for (let i = 1; i <= steps; i += 1) await page.mouse.move(a.x + dx * i / steps, a.y + dy * i / steps);
  }
  await page.mouse.up();
  return { before, after: await canvasState(page) };
}

async function selectTool(page, name) {
  if (name === 'pen' || name === 'eraser') {
    const current = await page.locator('#draw-canvas').getAttribute('data-tool');
    if (current !== name) {
      const penButton = page.locator('.draw-tools > button[data-draw-tool="pen"]');
      if (name === 'pen') await penButton.click();
      else {
        if (current !== 'pen') { await penButton.click(); await page.waitForFunction(() => document.querySelector('#draw-canvas')?.dataset.tool === 'pen'); }
        await penButton.click();
      }
      await page.waitForFunction((tool) => document.querySelector('#draw-canvas')?.dataset.tool === tool, name);
    }
    return;
  }
  await page.locator('#draw-tool-summary').click();
  await page.waitForFunction(() => document.querySelector('#draw-tool-picker')?.open === true);
  await page.waitForFunction(() => {
    const menu = document.querySelector('.draw-tool-menu'), summary = document.querySelector('#draw-tool-summary');
    const controls = document.querySelector('.draw-controls'), navigation = document.querySelector('.app-tabs');
    if (!menu || !summary || !controls || !navigation) return false;
    const r = summary.getBoundingClientRect(), c = controls.getBoundingClientRect(), width = Math.min(196, innerWidth - 24);
    const header = document.querySelector('body > .site-header')?.getBoundingClientRect().bottom || 64;
    const navigationTop = navigation.getBoundingClientRect().top;
    const above = Math.max(44, r.top - header - 20), below = Math.max(0, navigationTop - r.bottom - 20);
    const openBelow = below > above;
    const expectedLeft = Math.max(12, Math.min(innerWidth - width - 12, c.left + (c.width - width) / 2));
    const expectedTop = openBelow ? r.bottom + 8 : null;
    const expectedBottom = openBelow ? null : Math.max(12, innerHeight - r.top + 8);
    return Math.abs(parseFloat(menu.style.left) - expectedLeft) < 1
      && (expectedTop === null ? menu.style.top === 'auto' : Math.abs(parseFloat(menu.style.top) - expectedTop) < 1)
      && (expectedBottom === null ? menu.style.bottom === 'auto' : Math.abs(parseFloat(menu.style.bottom) - expectedBottom) < 1);
  }, null, { timeout: 2500 });
  const button = page.locator(`.draw-tool-menu button[data-draw-tool="${name}"]`);
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await page.waitForFunction((tool) => document.querySelector('#draw-canvas')?.dataset.tool === tool, name);
}

async function selectColor(page, index = 0) {
  const button = page.locator(`#draw-palette .draw-color[data-color-index="${index}"]`);
  // On the already selected pen color, a tap intentionally opens the color editor.
  if (await button.getAttribute('aria-pressed') !== 'true') await button.click();
  await page.waitForFunction((value) => document.querySelector(`#draw-palette .draw-color[data-color-index="${value}"]`)?.getAttribute('aria-pressed') === 'true', index);
}

async function geometry(page, selector) {
  return page.locator(selector).evaluate((node) => {
    const r = node.getBoundingClientRect(); const s = getComputedStyle(node);
    const icon = node.querySelector('svg.drawing-tool-icon');
    const srOnly = (element) => {
      if (!element) return null;
      const style = getComputedStyle(element), box = element.getBoundingClientRect();
      const visuallyHidden = style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0
        || box.width <= 1 || box.height <= 1
        || (style.position === 'absolute' && (style.clipPath !== 'none' || style.clip !== 'auto'));
      return { text: element.textContent.trim(), visuallyHidden, ariaHidden: element.getAttribute('aria-hidden') === 'true', display: style.display, visibility: style.visibility,
        position: style.position, clipPath: style.clipPath, clip: style.clip, width: box.width, height: box.height };
    };
    const iconRect = icon?.getBoundingClientRect(); const iconStyle = icon ? getComputedStyle(icon) : null;
    const hiddenText = [...node.querySelectorAll('[data-tool-label], [data-tool-description], [data-draw-tool-name]')].map(srOnly);
    const visibleTextNodes = [...node.childNodes].filter((child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim()).map((child) => child.textContent.trim());
    const nonIconChildren = [...node.children].filter((child) => child !== icon).map(srOnly);
    return { tag: node.tagName, text: (node.innerText || '').trim(), visibleTextNodes, nonIconChildren, ariaLabel: node.getAttribute('aria-label'), title: node.getAttribute('title'),
      x: r.x, y: r.y, width: r.width, height: r.height, display: s.display, gridTemplateColumns: s.gridTemplateColumns,
      scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight,
      srText: hiddenText,
      icon: icon && iconRect ? { width: iconRect.width, height: iconRect.height, stroke: iconStyle.stroke, color: iconStyle.color, fill: iconStyle.fill, childCount: icon.childElementCount } : null };
  });
}

async function layoutChecks(page, viewport) {
  const canvasBefore = await page.locator('#draw-canvas').boundingBox();
  const toolCount = await page.locator('.draw-tool-menu button[data-draw-tool]').count();
  equal(toolCount, menuTools.length, `${viewport.name}: menu should contain the nine secondary tools, not a second eraser control`);
  const actualTools = await page.locator('.draw-tool-menu button[data-draw-tool]').evaluateAll((nodes) => nodes.map((node) => node.dataset.drawTool));
  equal(actualTools, menuTools, `${viewport.name}: tool order and available tools`);
  const pen = await page.locator('.draw-tools > button[data-draw-tool="pen"]').boundingBox();
  const summary = await page.locator('#draw-tool-summary').boundingBox();
  check(pen && pen.width >= 44 && pen.height >= 44, `${viewport.name}: pen permanent target is under 44px: ${JSON.stringify(pen)}`);
  const summaryInfo = await geometry(page, '#draw-tool-summary');
  check(summaryInfo.width === 44 && summaryInfo.height === 44, `${viewport.name}: summary should be exactly a 44px icon-only square: ${JSON.stringify(summaryInfo)}`);
  check(Boolean(summaryInfo.ariaLabel?.trim()) && Boolean(summaryInfo.title?.trim()), `${viewport.name}: icon-only summary needs an accessible name and title: ${JSON.stringify(summaryInfo)}`);
  check(summaryInfo.visibleTextNodes.length === 0 && summaryInfo.nonIconChildren.every((node) => node.visuallyHidden || node.ariaHidden), `${viewport.name}: summary should show only its icon plus decorative affordances: ${JSON.stringify(summaryInfo)}`);
  check(summaryInfo.icon && summaryInfo.icon.width >= 24 && summaryInfo.icon.height >= 24, `${viewport.name}: summary glyph should be at least 24px: ${JSON.stringify(summaryInfo)}`);
  await page.locator('#draw-tool-summary').click();
  await page.waitForFunction(() => document.querySelector('#draw-tool-picker')?.open === true);
  const canvasOpen = await page.locator('#draw-canvas').boundingBox();
  check(Math.abs(canvasOpen.x - canvasBefore.x) < 0.5 && Math.abs(canvasOpen.y - canvasBefore.y) < 0.5 && Math.abs(canvasOpen.width - canvasBefore.width) < 0.5 && Math.abs(canvasOpen.height - canvasBefore.height) < 0.5,
    `${viewport.name}: opening the tool menu shifted the drawing canvas: ${JSON.stringify({ canvasBefore, canvasOpen })}`);
  const menuBox = await page.locator('.draw-tool-menu').boundingBox();
  check(menuBox && menuBox.x >= 0 && menuBox.y >= 0 && menuBox.x + menuBox.width <= viewport.width + 0.5 && menuBox.y + menuBox.height <= viewport.height + 0.5,
    `${viewport.name}: menu escaped the viewport: ${JSON.stringify(menuBox)}`);
  const scrollMetrics = await page.locator('.draw-tool-menu').evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight }));
  check(scrollMetrics.scrollWidth <= scrollMetrics.clientWidth + 1, `${viewport.name}: menu has horizontal overflow: ${JSON.stringify(scrollMetrics)}`);
  const menuMetrics = await page.locator('.draw-tool-menu').evaluate((node) => {
    const style = getComputedStyle(node), children = [...node.querySelectorAll('button[data-draw-tool]')];
    const sections = [...node.querySelectorAll(':scope > .draw-tool-group')].map((section) => {
      const heading = section.querySelector(':scope > .draw-tool-group__heading');
      const buttons = [...section.querySelectorAll(':scope > button[data-draw-tool]')];
      const gridStyle = getComputedStyle(section), headingStyle = heading ? getComputedStyle(heading) : null;
      const columns = gridStyle.gridTemplateColumns.split(' ').length;
      return { title: heading?.textContent.trim() || '', labelledBy: section.getAttribute('aria-labelledby'), headingId: heading?.id || '', role: section.getAttribute('role'),
        headingVisible: Boolean(heading && headingStyle.display !== 'none' && headingStyle.visibility !== 'hidden' && Number(headingStyle.opacity) !== 0),
        tools: buttons.map((button) => button.dataset.drawTool), columns,
        columnPositions: [...new Set(buttons.map((button) => Math.round(button.getBoundingClientRect().left)))],
        width: section.getBoundingClientRect().width };
    });
    return { width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height,
      gridTemplateColumns: style.gridTemplateColumns, columns: style.gridTemplateColumns.split(' ').length, sections,
      items: children.map((child) => { const r = child.getBoundingClientRect(); return { tool: child.dataset.drawTool, x: r.x, y: r.y, width: r.width, height: r.height }; }),
      viewportWidth: document.documentElement.scrollWidth, innerWidth };
  });
  check(Math.abs(menuMetrics.width - 196) <= 2, `${viewport.name}: menu should be a compact 196px panel: ${JSON.stringify(menuMetrics)}`);
  equal(menuMetrics.sections.map(({ title, tools }) => ({ title, tools })), toolGroups,
    `${viewport.name}: tool menu should keep the three titled tool groups and required order`);
  check(menuMetrics.sections.length === 3 && menuMetrics.sections.every((section) => section.columns === 3 && section.columnPositions.length === Math.min(3, section.tools.length) && section.role === 'group' && section.labelledBy === section.headingId && Boolean(section.headingId) && section.headingVisible),
    `${viewport.name}: each tool group should expose its heading and a three-column grid: ${JSON.stringify(menuMetrics.sections)}`);
  check(menuMetrics.viewportWidth <= menuMetrics.innerWidth + 1, `${viewport.name}: menu opening caused horizontal page overflow: ${JSON.stringify(menuMetrics)}`);
  if (viewport.name === '390x844' || viewport.name === '320x568' || viewport.name === '1280x900' || viewport.name === '844x390') {
    await page.screenshot({ path: `${outDir}/${viewport.name}-menu-open.png`, fullPage: true });
  }
  const entries = [];
  for (const tool of menuTools) {
    const button = page.locator(`.draw-tool-menu button[data-draw-tool="${tool}"]`);
    await button.scrollIntoViewIfNeeded();
    await page.waitForFunction((selector) => {
      const node = document.querySelector(selector); if (!node) return false;
      const port = node.closest('.draw-tool-menu'); if (!port) return false;
      const r = node.getBoundingClientRect(), p = port.getBoundingClientRect();
      return Math.abs(r.left - p.left) < 0.5 || Math.abs(r.right - p.right) < 0.5 || (r.left >= p.left && r.right <= p.right);
    }, `.draw-tool-menu button[data-draw-tool="${tool}"]`, { timeout: 1500 });
    const info = await geometry(page, `.draw-tool-menu button[data-draw-tool="${tool}"]`);
    check(Math.abs(info.width - 52) <= 1 && Math.abs(info.height - 52) <= 1, `${viewport.name}: ${tool} should be a 52px square target: ${JSON.stringify(info)}`);
    check(Boolean(info.ariaLabel?.trim()) && Boolean(info.title?.trim()), `${viewport.name}: ${tool} icon needs aria-label and title: ${JSON.stringify(info)}`);
    check(info.visibleTextNodes.length === 0 && info.nonIconChildren.every((node) => node.visuallyHidden) && info.srText.every((node) => node.visuallyHidden), `${viewport.name}: ${tool} should have icon-only visible content with hidden semantics: ${JSON.stringify(info)}`);
    check(info.icon && info.icon.width >= 24 && info.icon.height >= 24 && info.icon.childCount > 0, `${viewport.name}: ${tool} needs a visible glyph of at least 24px: ${JSON.stringify(info)}`);
    const hit = await button.evaluate((node) => {
      const r = node.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
      return { x, y, hit: document.elementFromPoint(x, y)?.closest('button[data-draw-tool]') === node, target: document.elementFromPoint(x, y)?.outerHTML.slice(0, 120) || null };
    });
    check(hit.hit, `${viewport.name}: ${tool} center is not reachable: ${JSON.stringify({ info, hit, scrollMetrics })}`);
    entries.push({ tool, ...info, centerReachable: hit.hit });
  }
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('#draw-tool-picker')?.open === false);
  results.viewports.push({ name: viewport.name, dimensions: viewport, toolCount, summaryInfo, canvasBefore, canvasOpen, menuBox, scrollMetrics, menuMetrics, entries });
  await page.screenshot({ path: `${outDir}/${viewport.name}-menu.png`, fullPage: true });
}

async function assertCanvasBlank(page, label) {
  const state = await canvasState(page);
  check(state.data.every((_, i) => i % 4 !== 3 || state.data[i] === 0), `${label}: alpha should be empty at baseline`);
  return state;
}

async function drawOnePixel(page, x, y) {
  return dragPixels(page, { x, y }, { x, y });
}

async function touchDragPixels(page, from, to, id = 7) {
  const state = await canvasState(page); const start = pixelPoint(state, from.x, from.y), end = pixelPoint(state, to.x, to.y);
  const session = await page.context().newCDPSession(page);
  const touch = (point) => ({ x: point.x, y: point.y, id, radiusX: 1, radiusY: 1, force: 1 });
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(start)] });
  const steps = Math.max(3, Math.min(16, Math.ceil(Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y)) / 16)));
  for (let step = 1; step <= steps; step += 1) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch({ x: start.x + (end.x - start.x) * step / steps, y: start.y + (end.y - start.y) * step / steps })] });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
  return { before: state, after: await canvasState(page), start, end };
}

async function functionalChecks(page, viewport) {
  const baseline = await assertCanvasBlank(page, `${viewport.name} baseline`);
  const initialBoard = await page.locator('.draw-board').boundingBox();
  await selectColor(page, 0);
  const pen = await drawOnePixel(page, 1, 1);
  const index = 1 * pen.before.width + 1;
  equal(changedIndices(baseline, pen.after), [index], `${viewport.name}: pen should change precisely the selected pixel`);
  equal(pen.after.data.slice(index * 4, index * 4 + 4), [38, 50, 56, 255], `${viewport.name}: chosen palette color should reach canvas RGBA`);
  const penControl = page.locator('.draw-tools > button[data-draw-tool="pen"]');
  await penControl.click();
  await page.waitForFunction(() => document.querySelector('#draw-canvas')?.dataset.tool === 'eraser');
  check((await penControl.getAttribute('aria-label')).includes('消しゴム'), `${viewport.name}: pen button should show eraser state label`);
  const erased = await drawOnePixel(page, 1, 1);
  equal(changedIndices(pen.after, erased.after), [index], `${viewport.name}: eraser should clear the target pixel`);
  equal(erased.after.data.slice(index * 4 + 3, index * 4 + 4), [0], `${viewport.name}: eraser should clear alpha`);
  await penControl.click();
  await page.waitForFunction(() => document.querySelector('#draw-canvas')?.dataset.tool === 'pen');
  await selectColor(page, 0);
  const zoomStart = await canvasState(page);
  await page.locator('#draw-canvas').focus(); await page.keyboard.press('+');
  await page.waitForFunction(() => document.querySelector('#draw-zoom-label')?.textContent.trim() !== '100%');
  const zoomRect = await page.locator('#draw-canvas').boundingBox();
  check(zoomRect && zoomRect.width > (await page.locator('#draw-canvas').evaluate((node) => node.width * 2)), `${viewport.name}: keyboard zoom did not enlarge the canvas`);
  const zoomTarget = { x: 8, y: 8 };
  const zoomBefore = await canvasState(page), zoomClient = pixelPoint(zoomBefore, zoomTarget.x, zoomTarget.y);
  const zoomHit = await page.evaluate(({ x, y }) => {
    const canvas = document.querySelector('#draw-canvas'); const target = document.elementFromPoint(x, y);
    return { hit: target === canvas, target: target?.id || target?.className?.baseVal || target?.className || target?.tagName };
  }, zoomClient);
  check(zoomHit.hit, `${viewport.name}: zoom test point must be on canvas, got ${JSON.stringify({ zoomTarget, zoomClient, zoomHit, canvas: zoomBefore.rect })}`);
  const zoomed = await drawOnePixel(page, zoomTarget.x, zoomTarget.y);
  const zoomIndex = zoomTarget.y * zoomed.before.width + zoomTarget.x;
  const zoomPointer = await page.evaluate(() => window.__drawHarnessLastPointerDown);
  equal(changedIndices(zoomStart, zoomed.after), [zoomIndex], `${viewport.name}: zoomed fitted canvas should map input to the intended source pixel; rect=${JSON.stringify(zoomed.before.rect)} pointer=${JSON.stringify(zoomPointer)} changes=${JSON.stringify(changedIndices(zoomStart, zoomed.after))}`);
  await page.locator('#draw-canvas').focus(); await page.keyboard.press('0');
  await page.waitForFunction(() => document.querySelector('#draw-zoom-label')?.textContent.trim() === '100%');
  const boardAfter = await page.locator('.draw-board').boundingBox();
  check(Math.abs(boardAfter.x - initialBoard.x) < 1 && Math.abs(boardAfter.y - initialBoard.y) < 1, `${viewport.name}: canvas board moved while using controls`);
  results.scenarios.push({ viewport: viewport.name, case: 'pen-eraser-zoom-coordinate', changedPixels: [index, zoomIndex], zoomRect, boardRect: boardAfter });
}

async function richDrawingChecks(page, viewport) {
  const blank = async (label) => assertCanvasBlank(page, label);
  const restoreBlank = async () => {
    const state = await canvasState(page);
    if (state.data.some((_, i) => i % 4 === 3 && state.data[i] !== 0)) await page.locator('#draw-clear').click();
    await page.waitForFunction(() => [...document.querySelector('#draw-canvas').getContext('2d').getImageData(0, 0, 16, 16).data].every((value, i) => i % 4 !== 3 || value === 0));
  };
  await restoreBlank(page);
  await selectColor(page, 0);
  const shapeStart = { x: 3, y: 3 }, shapeEnd = { x: 10, y: 10 };

  // A preview is a provisional edit: Escape and pointercancel both restore the exact RGBA baseline.
  await selectTool(page, 'rectangle-fill');
  const cancelBase = await canvasState(page), p1 = pixelPoint(cancelBase, shapeStart.x, shapeStart.y), p2 = pixelPoint(cancelBase, shapeEnd.x, shapeEnd.y);
  await page.mouse.move(p1.x, p1.y); await page.mouse.down(); await page.mouse.move(p2.x, p2.y, { steps: 5 });
  const preview = await canvasState(page); check(changedIndices(cancelBase, preview).length > 1, `${viewport.name}: filled rectangle preview should update before pointerup`);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  const canceled = await canvasState(page); bytesEqual(canceled.data, cancelBase.data, `${viewport.name}: Escape should restore full shape baseline`);
  const cancelBase2 = await canvasState(page); const a2 = pixelPoint(cancelBase2, shapeStart.x, shapeStart.y), b2 = pixelPoint(cancelBase2, shapeEnd.x, shapeEnd.y);
  await page.mouse.move(a2.x, a2.y); await page.mouse.down(); await page.mouse.move(b2.x, b2.y, { steps: 5 });
  const activePointer = await page.evaluate(() => window.__drawHarnessPointerId);
  check(Number.isInteger(activePointer), `${viewport.name}: pointer fixture did not observe the active pointer ID`);
  await page.locator('#draw-canvas').evaluate((canvas, pointerId) => canvas.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId, pointerType: 'mouse', isPrimary: true, clientX: 0, clientY: 0 })), activePointer);
  await page.mouse.up();
  const pointerCanceled = await canvasState(page); bytesEqual(pointerCanceled.data, cancelBase.data, `${viewport.name}: pointercancel should restore full shape baseline`);

  if (viewport.name === '390x844') {
    const touchShape = await touchDragPixels(page, shapeStart, shapeEnd);
    check(changedIndices(touchShape.before, touchShape.after).length >= 20 && touchShape.after.data[(6 * 16 + 6) * 4 + 3] === 255,
      '390x844: real CDP touch pointer should draw a filled rectangle on the canvas');
    await restoreBlank(page);
    await selectTool(page, 'pen'); await selectColor(page, 0); await dragPixels(page, { x: 2, y: 2 }, { x: 4, y: 2 });
    await selectTool(page, 'select'); await dragPixels(page, { x: 2, y: 2 }, { x: 4, y: 2 });
    const touchMove = await touchDragPixels(page, { x: 3, y: 2 }, { x: 6, y: 5 });
    check([5, 6, 7].every((x) => touchMove.after.data[(5 * 16 + x) * 4 + 3] === 255), '390x844: CDP touch should move the selected active-cel pixels');
    check([2, 3, 4].every((x) => touchMove.after.data[(2 * 16 + x) * 4 + 3] === 0), '390x844: CDP touch selection move should clear its source pixels');
    await page.keyboard.press('Escape'); await page.mouse.up(); await restoreBlank(page);
  }

  await selectTool(page, 'line');
  let operation = await dragPixels(page, shapeStart, shapeEnd);
  let pixels = changedIndices(operation.before, operation.after);
  check(pixels.length >= 8, `${viewport.name}: line should change pixels along the drag, got ${pixels.length}`);
  check(pixels.includes(shapeStart.y * 16 + shapeStart.x) && pixels.includes(shapeEnd.y * 16 + shapeEnd.x), `${viewport.name}: line should include both endpoints`);
  const lineImage = operation.after;
  await page.locator('#draw-undo').click();
  await page.waitForFunction((expected) => {
    const canvas = document.querySelector('#draw-canvas');
    return JSON.stringify([...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data]) === JSON.stringify(expected);
  }, cancelBase.data);
  bytesEqual((await canvasState(page)).data, cancelBase.data, `${viewport.name}: undo must exactly restore prior RGBA after line`);
  await page.locator('#draw-redo').click();
  await page.waitForFunction((expected) => {
    const canvas = document.querySelector('#draw-canvas');
    return JSON.stringify([...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data]) === JSON.stringify(expected);
  }, lineImage.data);
  bytesEqual((await canvasState(page)).data, lineImage.data, `${viewport.name}: redo must exactly restore line RGBA`);

  await restoreBlank(page);
  await selectTool(page, 'rectangle'); operation = await dragPixels(page, shapeStart, shapeEnd);
  pixels = changedIndices(operation.before, operation.after);
  check(pixels.length >= 20 && operation.after.data[(6 * 16 + 6) * 4 + 3] === 0, `${viewport.name}: outline rectangle should preserve transparent interior`);
  await restoreBlank(page);
  await selectTool(page, 'rectangle-fill'); operation = await dragPixels(page, shapeStart, shapeEnd);
  check(changedIndices(operation.before, operation.after).length >= 64 && operation.after.data[(6 * 16 + 6) * 4 + 3] === 255, `${viewport.name}: filled rectangle should color its interior`);
  await restoreBlank(page);
  await selectTool(page, 'ellipse'); operation = await dragPixels(page, shapeStart, shapeEnd);
  check(changedIndices(operation.before, operation.after).length >= 8 && operation.after.data[(6 * 16 + 6) * 4 + 3] === 0, `${viewport.name}: outline ellipse should leave inner pixels empty`);
  await restoreBlank(page);
  await selectTool(page, 'ellipse-fill'); operation = await dragPixels(page, shapeStart, shapeEnd);
  check(changedIndices(operation.before, operation.after).length >= 20 && operation.after.data[(6 * 16 + 6) * 4 + 3] === 255, `${viewport.name}: filled ellipse should color its center`);
  await restoreBlank(page);
  await selectTool(page, 'spray'); operation = await dragPixels(page, { x: 7, y: 7 }, { x: 9, y: 8 });
  check(changedIndices(operation.before, operation.after).length > 0, `${viewport.name}: spray should place visible pixels`);
  await restoreBlank(page);
  await selectTool(page, 'fill'); operation = await drawOnePixel(page, 8, 8);
  check(changedIndices(operation.before, operation.after).length === 256, `${viewport.name}: fill should cover a connected blank canvas`);
  await page.locator('#draw-undo').click(); await page.waitForFunction((expected) => {
    const canvas = document.querySelector('#draw-canvas');
    return JSON.stringify([...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data]) === JSON.stringify(expected);
  }, operation.before.data);
  bytesEqual((await canvasState(page)).data, operation.before.data, `${viewport.name}: fill undo should restore exact blank canvas`);

  // The picker selects a real pixel colour and returns to pen.
  await selectColor(page, 0); await drawOnePixel(page, 2, 2);
  await selectTool(page, 'picker'); await drawOnePixel(page, 2, 2);
  await page.waitForFunction(() => document.querySelector('#draw-canvas')?.dataset.tool === 'pen');
  check(await page.locator('#draw-palette .draw-color[data-color-index="0"]').getAttribute('aria-pressed') === 'true', `${viewport.name}: picker should select the sampled palette color`);
  await restoreBlank(page);

  // Selection movement should clear source, move the pixels, clamp at the canvas edge, and be a single history entry.
  await selectTool(page, 'pen'); await selectColor(page, 0);
  await dragPixels(page, { x: 2, y: 2 }, { x: 4, y: 2 });
  const beforeSelectMove = await canvasState(page);
  await selectTool(page, 'select'); await dragPixels(page, { x: 2, y: 2 }, { x: 4, y: 2 });
  check(!(await page.locator('.draw-selection').isHidden()), `${viewport.name}: selection rectangle should be visible`);
  const sourcePoint = pixelPoint(await canvasState(page), 3, 2), destPoint = pixelPoint(await canvasState(page), 5, 4);
  await page.mouse.move(sourcePoint.x, sourcePoint.y); await page.mouse.down(); await page.mouse.move(destPoint.x, destPoint.y, { steps: 5 }); await page.mouse.up();
  const moved = await canvasState(page);
  for (const x of [2, 3, 4]) check(moved.data[(2 * 16 + x) * 4 + 3] === 0, `${viewport.name}: selection move should clear source pixel ${x},2`);
  for (const x of [4, 5, 6]) check(moved.data[(4 * 16 + x) * 4 + 3] === 255, `${viewport.name}: selection move should preserve pixels at destination ${x},4`);
  await page.locator('#draw-undo').click();
  bytesEqual((await canvasState(page)).data, beforeSelectMove.data, `${viewport.name}: selection move should be one exact history step`);
  await page.locator('#draw-redo').click();
  bytesEqual((await canvasState(page)).data, moved.data, `${viewport.name}: selection move redo should restore exact RGBA`);
  await selectTool(page, 'select'); await dragPixels(page, { x: 4, y: 4 }, { x: 6, y: 4 });
  const current = await canvasState(page); const leftPoint = pixelPoint(current, 5, 4), outsidePoint = pixelPoint(current, -8, 4);
  await page.mouse.move(leftPoint.x, leftPoint.y); await page.mouse.down(); await page.mouse.move(outsidePoint.x, outsidePoint.y, { steps: 8 }); await page.mouse.up();
  const clamped = await canvasState(page);
  check([0, 1, 2].every((x) => clamped.data[(4 * 16 + x) * 4 + 3] === 255), `${viewport.name}: selection movement past the left edge should clamp to x=0`);
  check(clamped.data[(4 * 16 + 3) * 4 + 3] === 0, `${viewport.name}: clamped move should clear previous destination edge`);
  await page.keyboard.press('Escape'); await page.mouse.up(); check(await page.locator('.draw-selection').isHidden(), `${viewport.name}: Escape should clear selection overlay`);

  // A selection moves only the active cel; lower-layer pixels remain intact. A locked cel rejects drawing and selection edits.
  await restoreBlank(page);
  await selectTool(page, 'pen'); await selectColor(page, 0); await drawOnePixel(page, 8, 8);
  await page.locator('#draw-animation-controls [data-action="toggle-frames"]').click();
  await page.waitForFunction(() => document.querySelector('#draw-animation-controls-panel')?.hidden === false);
  await page.locator('#draw-animation-controls-panel .animation-controls__frames [data-action="add-layer"]').click();
  await page.waitForFunction(() => document.querySelector('#draw-animation-controls-panel .animation-controls__workspace-selection')?.textContent.includes('レイヤー 2'));
  await selectColor(page, 1); await drawOnePixel(page, 2, 2); await drawOnePixel(page, 3, 2); await drawOnePixel(page, 4, 2);
  const lowerLayerPixel = (await canvasState(page)).data.slice((8 * 16 + 8) * 4, (8 * 16 + 8) * 4 + 4);
  const baseColor = lowerLayerPixel;
  await selectTool(page, 'select'); await dragPixels(page, { x: 2, y: 2 }, { x: 4, y: 2 }); await dragPixels(page, { x: 2, y: 2 }, { x: 5, y: 5 });
  const afterTopMove = await canvasState(page);
  bytesEqual(afterTopMove.data.slice((8 * 16 + 8) * 4, (8 * 16 + 8) * 4 + 4), baseColor, `${viewport.name}: moving an upper cel must preserve the lower cel pixel`);
  // Drawing outside the workspace closes its floating panel by design, so reopen it before opening the layer context menu.
  await page.locator('#draw-animation-controls [data-action="toggle-frames"]').click();
  await page.waitForFunction(() => document.querySelector('#draw-animation-controls-panel')?.hidden === false);
  const activeLayer = page.locator('#draw-animation-controls-panel .animation-controls__frames [data-action="select-layer"][aria-pressed="true"]');
  await activeLayer.click({ button: 'right' });
  await page.waitForFunction(() => document.querySelector('.animation-controls__frame-menu')?.hidden === false);
  const lock = page.locator('.animation-controls__frame-menu [data-frame-menu-action="lock"]');
  await lock.click();
  await page.waitForFunction(() => document.querySelector('.animation-controls__frame-menu')?.hidden === true);
  await activeLayer.click({ button: 'right' });
  await page.waitForFunction(() => document.querySelector('.animation-controls__frame-menu [data-frame-menu-action="lock"]')?.textContent.includes('ロック解除'));
  await page.keyboard.press('Escape');
  const lockedBaseline = await canvasState(page);
  await selectTool(page, 'pen'); await dragPixels(page, { x: 12, y: 12 }, { x: 13, y: 12 });
  bytesEqual((await canvasState(page)).data, lockedBaseline.data, `${viewport.name}: pen drawing must not edit a locked layer`);
  await selectTool(page, 'select'); await dragPixels(page, { x: 2, y: 2 }, { x: 5, y: 5 });
  check(await page.locator('.draw-selection').isHidden(), `${viewport.name}: a locked layer should reject selection edits`);
  bytesEqual((await canvasState(page)).data, lockedBaseline.data, `${viewport.name}: selection must not edit a locked layer`);
  results.scenarios.push({ viewport: viewport.name, case: 'drawing-tools-shapes-selection-undo-cancel', lineChangedPixels: pixels.length, selectionClamp: true, upperCelMovePreservedLower: true, lockedCelProtected: true });
}

async function crossSurfaceIcons() {
  for (const [name, path] of [['audio', '/audio/'], ['spot-difference', '/spot-difference/'], ['hidden-object', '/hidden-object/']]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) => {
      try { return new URL(route.request().url()).origin === baseUrl ? route.continue() : route.abort(); }
      catch { return route.abort(); }
    });
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded' });
    if (name === 'spot-difference') {
      await page.locator('#spot-after-file').waitFor({ state: 'attached' });
      const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 4;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#547b93'; ctx.fillRect(0, 0, 4, 4);
        return canvas.toDataURL('image/png').split(',')[1];
      });
      await page.locator('#spot-after-file').setInputFiles({ name: 'draw-icon-fixture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
      await page.waitForFunction(() => document.querySelector('#spot-after-slot')?.dataset.filled === 'true');
      await page.locator('#spot-import-pair').click();
      await page.waitForFunction(() => !document.querySelector('#spot-inline-draw')?.hidden);
    }
    if (name === 'hidden-object') {
      await page.locator('#hidden-image-file').waitFor({ state: 'attached' });
      const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 4;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#5b7b49'; ctx.fillRect(0, 0, 4, 4);
        return canvas.toDataURL('image/png').split(',')[1];
      });
      await page.locator('#hidden-image-file').setInputFiles({ name: 'draw-icon-fixture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
      await page.waitForFunction(() => document.querySelector('#hidden-start')?.disabled === false);
      await page.locator('#hidden-start').click();
      await page.waitForFunction(() => document.querySelector('#hidden-editor')?.hidden === false);
      await page.locator('#hidden-name').fill('確認用の丸');
      await page.locator('#hidden-add').click();
      await page.waitForFunction(() => [...document.querySelectorAll('.hidden-tools svg.drawing-tool-icon')].length === 2);
    }
    await page.locator('[data-drawing-icon]').first().waitFor({ state: 'attached' });
    await page.waitForFunction(() => [...document.querySelectorAll('[data-drawing-icon]')].every((button) => button.querySelector('svg.drawing-tool-icon')),
      null, { timeout: 8000 });
    const icons = await page.locator('[data-drawing-icon]').evaluateAll((nodes) => nodes.map((node) => {
      const svg = node.querySelector('svg.drawing-tool-icon'), cs = getComputedStyle(svg);
      return { tool: node.dataset.drawingIcon, ariaHidden: svg.getAttribute('aria-hidden'), viewBox: svg.getAttribute('viewBox'), width: svg.getBoundingClientRect().width, height: svg.getBoundingClientRect().height, stroke: cs.stroke, color: cs.color, fill: cs.fill, childCount: svg.childElementCount, paths: [...svg.querySelectorAll('path')].map((path) => path.getAttribute('d')) };
    }));
    check(icons.length >= (name === 'audio' ? 1 : 2), `${name}: expected shared pen/eraser controls`);
    for (const icon of icons) {
      check(icon.ariaHidden === 'true' && icon.viewBox === '0 0 24 24', `${name}: shared icon must be decorative 24px SVG: ${JSON.stringify(icon)}`);
      check(icon.width > 0 && icon.height > 0 && icon.childCount > 0, `${name}: shared SVG must render visible paths: ${JSON.stringify(icon)}`);
      check(icon.stroke !== 'none' && icon.color !== 'rgba(0, 0, 0, 0)' && icon.stroke === icon.color, `${name}: shared icon must use a visible currentColor stroke: ${JSON.stringify(icon)}`);
    }
    if (name === 'audio') {
      const pen = page.locator('#audio-tool-pen');
      check((await pen.locator('svg.drawing-tool-icon').getAttribute('data-icon-name')) === null, 'audio: icon SVG should be replaced without depending on private labels');
      const penPath = await pen.locator('svg.drawing-tool-icon path').first().getAttribute('d');
      check(penPath.includes('M4 20l1.2-4.1'), `audio: initial shared icon is not the pen glyph: ${penPath}`);
      await pen.click();
      await page.waitForFunction(() => document.querySelector('#audio-tool-pen svg.drawing-tool-icon path')?.getAttribute('d').includes('M9 20h11'));
      const eraserPath = await pen.locator('svg.drawing-tool-icon path').first().getAttribute('d');
      check(eraserPath.includes('M9 20h11'), `audio: the permanent pen button should switch to eraser icon: ${eraserPath}`);
    } else {
      check(icons.some((icon) => icon.tool === 'pen') && icons.some((icon) => icon.tool === 'eraser'), `${name}: expected separate shared pen and eraser SVGs`);
    }
    check(errors.length === 0, `${name}: pageerror while loading shared icons: ${errors.join('; ')}`);
    results.sharedIcons.push({ name, path, icons, errors });
    await page.screenshot({ path: `${outDir}/${name}-shared-icons.png`, fullPage: true });
    await context.close(); assertions += 1;
  }
}

async function readHashes() {
  const files = ['draw/index.html', 'js/creation/draw-entry.mjs', 'js/creation/draw-page.mjs', 'js/creation/draw-tool-operations.mjs', 'js/creation/drawing-tool-icons.mjs', 'css/draw-tool-picker.css', 'audio/index.html', 'js/creation/audio-page.mjs', 'spot-difference/index.html', 'js/creation/spot-inline-draw.mjs', 'hidden-object/index.html', 'js/creation/hidden-object-page.mjs'];
  const { readFile } = await import('node:fs/promises');
  for (const file of files) {
    try { results.sourceHashes[file] = createHash('sha256').update(await readFile(new URL(`../${file}`, import.meta.url))).digest('hex'); }
    catch (error) { results.sourceHashes[file] = `unavailable: ${error.message}`; }
  }
}

await mkdir(outDir, { recursive: true });
await readHashes();
try {
  for (const viewport of viewports) {
    const { context, page } = await preparePage(viewport);
    await layoutChecks(page, viewport);
    if (!layoutOnly) await functionalChecks(page, viewport);
    if (results.pageErrors.length) assert.fail(`browser page errors: ${JSON.stringify(results.pageErrors)}`);
    if (!layoutOnly) await page.screenshot({ path: `${outDir}/${viewport.name}-draw.png`, fullPage: true });
    await context.close();
    currentPage = null;
  }
  if (!layoutOnly) {
    const richViewport = viewports.find((viewport) => viewport.name === '390x844');
    const richContext = await preparePage(richViewport);
    await richDrawingChecks(richContext.page, richViewport);
    await richContext.page.screenshot({ path: `${outDir}/390x844-rich-drawing.png`, fullPage: true });
    await richContext.context.close(); currentPage = null;
    await crossSurfaceIcons();
  } else {
    const { readFile } = await import('node:fs/promises');
    try {
      const baseline = JSON.parse(await readFile(`${baseOutDir}/results.json`, 'utf8'));
      results.baselineDrawingSuite = { status: baseline.status, assertions: baseline.assertions,
        sharedIcons: baseline.sharedIcons?.map(({ name, path, icons, errors }) => ({ name, path, iconCount: icons.length, errors })) || [],
        sourceHashes: baseline.sourceHashes };
      results.baselineDrawingIconModuleUnchanged = baseline.sourceHashes?.['js/creation/drawing-tool-icons.mjs'] === results.sourceHashes['js/creation/drawing-tool-icons.mjs'];
    } catch (error) {
      results.baselineDrawingSuite = { status: 'unavailable', error: error.message };
      results.baselineDrawingIconModuleUnchanged = false;
    }
  }
  if (results.pageErrors.length) assert.fail(`browser page errors: ${JSON.stringify(results.pageErrors)}`);
  results.assertions = assertions;
  results.status = 'PASS';
  const resultPath = `${outDir}/${layoutOnly ? 'result' : 'results'}.json`;
  await writeFile(resultPath, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`PASS draw-tool ${layoutOnly ? 'icon-only menu layout' : 'browser acceptance'} (${assertions} assertions, ${viewports.length} viewports, ${results.sharedIcons.length} shared-icon surfaces)`);
  console.log(resultPath);
} catch (error) {
  results.assertions = assertions;
  results.status = 'FAIL';
  results.failure = { message: error.message, stack: error.stack, url: currentPage?.url() || null };
  if (currentPage) {
    try { await currentPage.screenshot({ path: `${outDir}/failure.png`, fullPage: true }); } catch { /* preserve primary failure */ }
  }
  await writeFile(`${outDir}/failure.json`, `${JSON.stringify(results, null, 2)}\n`);
  throw error;
} finally {
  await browser.close();
}
