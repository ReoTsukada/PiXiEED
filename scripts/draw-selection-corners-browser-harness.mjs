/** Verify selection corner overlays, hit testing, and the real PNG export. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile, readFile } from 'node:fs/promises';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const output = '/tmp/pixieed-draw-selection-corners-20261006';
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true }), results = [];
try {
  for (const variant of [{ width: 1280, height: 800, dpr: 1 }, { width: 390, height: 844, dpr: 3 }]) {
    const context = await browser.newContext({ viewport: { width: variant.width, height: variant.height }, deviceScaleFactor: variant.dpr, acceptDownloads: true });
    await context.route('**/*', r => new URL(r.request().url()).origin === new URL(base).origin ? r.continue() : r.abort());
    const page = await context.newPage(), errors = [], checks = [];
    page.on('pageerror', e => errors.push(e.message));
    const prefix = `${variant.width}x${variant.height}-dpr${variant.dpr}`;
    const rgba = () => page.locator('#draw-canvas').evaluate(c => [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data]);
    const point = async (x, y) => { const r = await page.locator('#draw-canvas').boundingBox(); return { x: r.x + (x + .5) * r.width / 16, y: r.y + (y + .5) * r.height / 16 }; };
    const stroke = async (a, b) => { const p = await point(...a), q = await point(...b); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(q.x, q.y); await page.mouse.up(); };
    const assertMarks = async () => {
      assert.equal(await page.locator('.draw-selection').isVisible(), true);
      const marks = await page.locator('.draw-selection__corner').evaluateAll(nodes => nodes.map(n => {
        const r = n.getBoundingClientRect(), s = getComputedStyle(n), p = document.querySelector('.draw-selection').getBoundingClientRect();
        return { corner: n.dataset.selectionCorner, width: r.width, height: r.height, color: s.borderColor, borders: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth], pointerEvents: s.pointerEvents, hidden: n.getAttribute('aria-hidden'), anchorDistance: Math.min(Math.hypot(r.x + r.width / 2 - p.left, r.y + r.height / 2 - p.top), Math.hypot(r.x + r.width / 2 - p.right, r.y + r.height / 2 - p.top), Math.hypot(r.x + r.width / 2 - p.right, r.y + r.height / 2 - p.bottom), Math.hypot(r.x + r.width / 2 - p.left, r.y + r.height / 2 - p.bottom)), intercepted: document.elementFromPoint(r.x + 4, r.y + 4)?.closest('.draw-selection') !== null };
      }));
      assert.equal(marks.length, 4); assert.deepEqual(marks.map(m => m.corner).sort(), ['ne', 'nw', 'se', 'sw']);
      for (const m of marks) { assert.equal(m.width, 12); assert.equal(m.height, 12); assert.equal(m.color, 'rgb(23, 35, 45)'); assert.equal(m.borders.filter(v => v === '2px').length, 4, 'each handle has a dark 2px outline'); assert.equal(m.pointerEvents, 'none'); assert.equal(m.hidden, 'true'); assert.ok(m.anchorDistance <= 2); assert.equal(m.intercepted, false); }
      return marks;
    };
    try {
      await page.goto(`${base}/draw/`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#draw-canvas')?.dataset.tool && !document.querySelector('#main').inert);
      for (const [name, color] of [['dark', 0], ['light', 1]]) {
        await page.locator('.draw-color[data-color-index="' + color + '"]').click(); await page.keyboard.press('Escape');
        await page.locator('#draw-canvas').focus(); await page.keyboard.press('Shift+R'); await stroke([2, 2], [10, 10]);
        const before = await rgba(); await page.keyboard.press('v'); await stroke([6, 6], [9, 9]);
        await assertMarks(); assert.deepEqual(await rgba(), before, 'selection decoration leaves canvas RGBA untouched');
        await page.screenshot({ path: `${output}/${prefix}-${name}.png` });
        const downloadPending = page.waitForEvent('download'); await page.locator('#draw-export').evaluate(n => n.click());
        const download = await downloadPending, pngPath = `${output}/${prefix}-${name}-export.png`; await download.saveAs(pngPath);
        const data = (await readFile(pngPath)).toString('base64');
        const exported = await page.evaluate(async ({ data, before }) => {
          const blob = await (await fetch('data:image/png;base64,' + data)).blob(), bitmap = await createImageBitmap(blob), c = document.createElement('canvas');
          c.width = bitmap.width; c.height = bitmap.height; c.getContext('2d').drawImage(bitmap, 0, 0);
          const pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, scale = c.width / 16;
          let equal = c.width === c.height && Number.isInteger(scale);
          for (let y = 0; equal && y < c.height; y++) for (let x = 0; equal && x < c.width; x++) {
            const i = (y * c.width + x) * 4, source = (Math.floor(y / scale) * 16 + Math.floor(x / scale)) * 4;
            for (let k = 0; k < 4; k++) if (pixels[i + k] !== before[source + k]) { equal = false; break; }
          }
          bitmap.close(); return { equal, width: c.width, height: c.height };
        }, { data, before });
        assert.equal(exported.equal, true, 'real PNG export contains artwork only, with no corner marks');
        checks.push(`${name} artwork: four non-intercepting corner marks and exact artwork-only ${exported.width}×${exported.height} PNG`);
        await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.locator('#draw-canvas').focus();
        // Result panel may hide the editor after export; its close action is keyboard Escape.
        await page.keyboard.press('v'); await stroke([6, 6], [9, 9]); await assertMarks();
        await page.keyboard.press('+'); await page.keyboard.press('+'); await assertMarks();
        assert.deepEqual(await rgba(), before); await page.screenshot({ path: `${output}/${prefix}-${name}-zoom.png` });
        const frameBeforePan = await page.locator('.draw-selection').boundingBox();
        await page.keyboard.down('Space'); await stroke([7, 7], [8, 7]); await page.keyboard.up('Space'); await assertMarks();
        const frameAfterPan = await page.locator('.draw-selection').boundingBox();
        assert.ok(frameAfterPan.x > frameBeforePan.x, 'corner frame follows viewport pan'); assert.deepEqual(await rgba(), before);
        await page.keyboard.press('0');
        await page.locator('#draw-canvas').focus(); await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(40); // Selection previews are coalesced into the next animation frame.
        assert.notDeepEqual(await rgba(), before, 'keyboard arrow moves selected artwork');
        await page.keyboard.press('Enter');
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
        assert.deepEqual(await rgba(), before, 'keyboard selection movement is one Undo');
        checks.push(`${name} artwork: keyboard selection movement and platform Undo preserve pixels`);
        await page.keyboard.press('Escape'); await page.keyboard.press('v'); await stroke([6, 6], [9, 9]); await assertMarks();
        await stroke([7, 7], [8, 7]);
        await page.waitForTimeout(40);
        assert.notDeepEqual(await rgba(), before, 'selection still moves through the unchanged canvas hit area');
        await page.locator('#draw-canvas').focus(); await page.keyboard.press('Enter');
        await page.locator('#draw-undo').click(); assert.deepEqual(await rgba(), before, 'selection movement remains one Undo');
        await page.keyboard.press('Escape'); await page.locator('#draw-undo').click();
        checks.push(`${name} artwork: 12px corners remain anchored at 225% zoom and pan; ordinary selection move and Undo`);
      }
      await page.locator('#draw-canvas').focus(); await page.keyboard.press('v'); await stroke([7, 7], [7, 7]);
      await assertMarks(); await page.screenshot({ path: `${output}/${prefix}-single-pixel.png` });
      checks.push('one-pixel selection retains four corner handles');
      assert.deepEqual(errors, []); results.push({ variant, checks, errors }); console.log(`PASS ${prefix}: ${checks.length} selection cases`);
    } catch (error) { await page.screenshot({ path: `${output}/${prefix}-failure.png` }).catch(() => {}); throw error; }
    finally { await context.close(); }
  }
  await writeFile(`${output}/results.json`, JSON.stringify({ results }, null, 2));
} finally { await browser.close(); }
