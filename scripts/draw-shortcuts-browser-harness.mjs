/** Browser checks for draw keyboard shortcuts, settings, focus guards, and virtual cursor input. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'browser base must be local');
const output = process.env.PIXIEED_DRAW_SHORTCUTS_OUTPUT || '/tmp/pixieed-draw-shortcuts-20261006';
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch({ headless: true });
const results = [];
await mkdir(output, { recursive: true });

try {
  for (const variant of [
    { platform: 'MacIntel', name: 'mac', width: 1280, height: 800, simulated: false },
    { platform: 'Win32', name: 'windows-simulated', width: 1280, height: 800, simulated: true },
    { platform: 'MacIntel', name: 'mobile-mac', width: 390, height: 844, simulated: false },
    { platform: 'MacIntel', name: 'small-mobile-mac', width: 320, height: 568, simulated: false },
  ]) {
    const context = await browser.newContext({ viewport: { width: variant.width, height: variant.height }, hasTouch: variant.width < 500 });
    await context.addInitScript(platform => {
      Object.defineProperty(Navigator.prototype, 'platform', { configurable: true, get: () => platform });
      Object.defineProperty(Navigator.prototype, 'userAgentData', { configurable: true, get: () => ({ platform }) });
    }, variant.platform);
    const page = await context.newPage(), errors = [], checks = [];
    page.setDefaultTimeout(10000);
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    page.on('pageerror', error => errors.push(error.message));
    const canvas = page.locator('#draw-canvas');
    const pixelCount = () => canvas.evaluate(node => {
      const rgba = node.getContext('2d').getImageData(0, 0, node.width, node.height).data;
      let count = 0; for (let i = 3; i < rgba.length; i += 4) if (rgba[i]) count++;
      return count;
    });
    const clear = async () => {
      await page.locator('#draw-clear').click();
      const confirm = page.getByRole('button', { name: /消す|削除/ });
      if (await confirm.count()) await confirm.first().click();
      await page.waitForTimeout(40);
    };
    const drawPixel = async (x = 2, y = 2) => {
      const rect = await canvas.boundingBox();
      await page.mouse.click(rect.x + (x + .5) * rect.width / 16, rect.y + (y + .5) * rect.height / 16);
    };
    const openSettings = async () => {
      const details = page.locator('#draw-settings-picker');
      if (!(await details.evaluate(node => node.open))) await page.locator('#draw-settings-summary').click();
    };
    const closeSettings = async () => { if (await page.locator('#draw-settings-picker').evaluate(node => node.open)) await page.keyboard.press('Escape'); };
    const openDialog = async () => { await openSettings(); await page.locator('#draw-shortcuts-open').click(); await page.locator('#draw-shortcuts-dialog').waitFor({ state: 'visible' }); };
    const command = id => page.locator(`[data-command-run="${id}"]`);
    const tool = id => page.locator(`[data-draw-tool="${id}"]`);
    try {
      await page.goto(`${base}/draw/`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#draw-canvas')?.dataset.tool && !document.querySelector('#main').inert);
      await openDialog();
      assert.equal(await page.locator('#draw-shortcuts-platform').inputValue(), variant.platform === 'Win32' ? 'windows' : 'mac', 'dialog selects active OS shortcut set');
      assert.ok(await page.locator('#draw-shortcuts-dialog [data-command-id]').count() > 0, 'dialog renders command rows');
      await page.screenshot({ path: `${output}/${variant.name}.png`, fullPage: true });
      if (variant.width < 500) {
        const overflow = await page.locator('#draw-shortcuts-dialog').evaluate(node => ({ scroll: node.scrollWidth, client: node.clientWidth, viewport: innerWidth }));
        assert.ok(overflow.scroll <= overflow.client + 1, `mobile shortcut dialog has no horizontal overflow (${JSON.stringify(overflow)})`);
        checks.push(`${variant.width}px shortcut dialog fits without horizontal overflow`);
      }
      await page.keyboard.press('Escape');
      await page.locator('#draw-shortcuts-dialog').waitFor({ state: 'hidden' });
      checks.push('launcher opens an accessible dialog and Escape closes it');

      // A physical pointer edit gives Undo and Redo a real operation to act on.
      await drawPixel(2, 2); assert.ok(await pixelCount() > 0, 'canvas pointer creates pixels');
      await canvas.focus();
      const undoShortcut = variant.platform === 'Win32' ? 'Control+z' : 'Meta+z';
      const redoShortcut = variant.platform === 'Win32' ? 'Control+y' : 'Meta+Shift+z';
      const oppositeUndo = variant.platform === 'Win32' ? 'Meta+z' : 'Control+z';
      await page.keyboard.press(oppositeUndo); assert.ok(await pixelCount() > 0, 'opposite OS primary modifier does not invoke Undo');
      await page.evaluate(() => { window.__lastShortcutEvent = null; document.addEventListener('keydown', event => { if (event.code === 'KeyZ') window.__lastShortcutEvent = { key: event.key, code: event.code, meta: event.metaKey, ctrl: event.ctrlKey, target: event.target?.id, prevented: event.defaultPrevented, platform: navigator.platform, userAgentPlatform: navigator.userAgentData?.platform, openDetails: [...document.querySelectorAll('details[open]')].map(n => n.id), openDialogs: document.querySelectorAll('dialog[open]').length }; }, true); });
      await page.keyboard.press(undoShortcut);
      const undoDiagnostic = await page.evaluate(() => ({ active: document.activeElement?.id, platform: navigator.platform, event: window.__lastShortcutEvent, undoDisabled: document.querySelector('#draw-undo').disabled, tool: document.querySelector('#draw-canvas').dataset.tool }));
      assert.equal(await pixelCount(), 0, `OS primary Undo clears the drawn pixel (${JSON.stringify(undoDiagnostic)})`);
      await page.keyboard.press(redoShortcut); assert.ok(await pixelCount() > 0, 'OS primary Redo restores pixels');
      checks.push(`Undo/Redo use ${variant.platform === 'Win32' ? 'Ctrl+Z / Ctrl+Y' : 'Meta+Z / Meta+Shift+Z'}; opposite primary modifier is ignored`);

      // Editor-like targets and IME composition must not steal editing shortcuts.
      for (const selector of ['input:not([type="file"])', 'textarea', 'select', '[contenteditable="true"]']) {
        await page.evaluate(selector => { const node = document.createElement(selector.startsWith('input') ? 'input' : selector === '[contenteditable="true"]' ? 'div' : selector); if (selector === '[contenteditable="true"]') node.contentEditable = 'true'; node.id = 'shortcut-focus-fixture'; node.type = 'text'; node.setAttribute('aria-label', 'shortcut focus test'); document.querySelector('#main').append(node); }, selector);
        const field = page.locator('#shortcut-focus-fixture'); await field.focus();
        assert.equal(await field.evaluate(node => node === document.activeElement), true, `focus fixture accepts focus: ${selector}`);
        await page.keyboard.press(undoShortcut);
        assert.ok(await pixelCount() > 0, `Undo is guarded while focus is in ${selector}`);
        await page.locator('#shortcut-focus-fixture').evaluate(node => node.remove()).catch(() => {});
      }
      const beforeIme = await pixelCount();
      await page.evaluate(() => document.querySelector('#draw-canvas').dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', bubbles: true, ctrlKey: true, isComposing: true, keyCode: 229 })));
      assert.equal(await pixelCount(), beforeIme, 'IME composing/keyCode 229 does not invoke an editing command');
      await page.locator('.brand').focus();
      await page.keyboard.press(undoShortcut);
      assert.ok(await pixelCount() > 0, 'unrelated header focus does not receive editing shortcuts');
      checks.push('input, textarea, contenteditable, IME composition, and unrelated focus are guarded');

      // Dialog and native details menus suppress global shortcuts; Escape restores the launcher focus.
      await openDialog(); await page.keyboard.press(undoShortcut);
      assert.ok(await pixelCount() > 0, 'shortcut dialog blocks editor commands');
      const launcher = page.locator('#draw-shortcuts-open');
      await page.keyboard.press('Escape');
      assert.equal(await canvas.evaluate(node => node === document.activeElement), true, 'closing dialog restores focus to the canvas');
      await openSettings(); await page.locator('#draw-tool-summary').click().catch(() => {});
      if (await page.locator('#draw-tool-picker').evaluate(node => node.open)) {
        await page.keyboard.press(undoShortcut); assert.ok(await pixelCount() > 0, 'open tool picker blocks editor commands');
      }
      await page.keyboard.press('Escape'); await closeSettings();
      checks.push('dialog and open picker suppress editing shortcuts; Escape returns focus');

      // Search, command activation, rebinding, collision rejection, reservation, and persistence.
      await openDialog();
      const search = page.locator('#draw-shortcuts-dialog input[type="search"]');
      if (await search.count()) {
        await search.fill('undo'); assert.ok(await page.locator('#draw-shortcuts-dialog [data-command-id]').count() < 40, 'search narrows command list');
        await search.fill('');
      }
      assert.ok(await command('edit.undo').count(), 'Undo row has a direct activation control');
      await command('edit.undo').click(); assert.equal(await pixelCount(), 0, 'dialog Undo activation runs the command');
      await openDialog();
      assert.ok(await command('edit.redo').count(), 'Redo row has a direct activation control');
      await command('edit.redo').click(); assert.ok(await pixelCount() > 0, 'dialog Redo activation runs the command');
      await openDialog();
      const bindingEditor = page.locator('[data-capture="toggle.grid"]');
      const capture = async (id, chord) => { await page.locator(`[data-capture="${id}"]`).click(); await page.keyboard.press(chord); };
      const profile = page.locator('#draw-shortcuts-platform');
      if (await bindingEditor.count()) {
        await capture('toggle.grid', 'Alt+g');
        await page.waitForTimeout(50);
        const row = page.locator('[data-command-id="toggle.grid"]');
        const bindingText = await row.innerText();
        assert.match(bindingText, /Alt|⌥/i, 'custom grid shortcut appears in its row');
        await page.locator('[data-capture="toggle.grid"]').click();
        await page.keyboard.press(variant.platform === 'Win32' ? 'Control+l' : 'Meta+l');
        assert.match(await page.locator('[data-capture-status]').innerText(), /使うキー|ブラウザー|OS/i, 'reserved primary shortcut is rejected');
        await page.locator('[data-capture="tool.left.pen"]').click();
        await page.keyboard.press('Alt+g');
        assert.match(await page.locator('[data-capture-status]').innerText(), /使用中|使われ|使用/i, 'conflicting key reports a clear rejection');
        await profile.selectOption(variant.platform === 'Win32' ? 'mac' : 'windows');
        await capture('toggle.grid', 'Alt+g');
        const otherProfile = variant.platform === 'Win32' ? 'mac' : 'windows';
        assert.match(await page.locator('[data-command-id="toggle.grid"]').innerText(), /Alt|⌥/i, `${otherProfile} profile accepts its own custom binding`);
        await profile.selectOption(variant.platform === 'Win32' ? 'windows' : 'mac');
        await page.locator('[data-shortcuts-reset]').click();
        await profile.selectOption(otherProfile);
        assert.match(await page.locator('[data-command-id="toggle.grid"]').innerText(), /Alt|⌥/i, 'reset affects only the selected OS profile');
        await profile.selectOption(variant.platform === 'Win32' ? 'windows' : 'mac');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelector('#draw-canvas')?.dataset.tool);
        await openDialog();
        assert.doesNotMatch(await page.locator('[data-command-id="toggle.grid"]').innerText(), /Alt|⌥/i, 'reset selected profile keeps its default after reload');
        const storage = await page.evaluate(() => Object.keys(localStorage).filter(key => /shortcut/i.test(key)));
        assert.ok(storage.length, 'shortcut preferences have a localStorage entry');
        await profile.selectOption(otherProfile);
        assert.match(await page.locator('[data-command-id="toggle.grid"]').innerText(), /Alt|⌥/i, 'other OS profile custom binding persists after reload');
        checks.push('custom binding capture, collision and reserved-key rejection, per-OS persistence and reset isolation');
      }
      await page.keyboard.press('Escape'); await closeSettings();

      // Corrupt preference data falls back to usable defaults without an uncaught page error.
      await page.evaluate(() => { for (const key of Object.keys(localStorage)) if (/shortcut/i.test(key)) localStorage.setItem(key, '{broken'); });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#draw-canvas')?.dataset.tool);
      await openDialog(); assert.ok(await page.locator('#draw-shortcuts-dialog [data-command-id]').count() > 0, 'invalid preference storage falls back to defaults');
      checks.push('malformed persisted settings recover to defaults');

      if (variant.name === 'mac') {
        await page.keyboard.press('Escape');
        const runListed = async id => { await openDialog(); await command(id).click(); await page.waitForTimeout(35); };
        for (const id of ['tool.left.line', 'tool.left.pen', 'tool.right.eraser', 'tool.right.fill']) await runListed(id);
        assert.equal(await canvas.getAttribute('data-tool'), 'pen', 'left tool command changes the active draw tool');
        await runListed('mirror.horizontal'); assert.equal(await page.locator('#draw-mirror').getAttribute('aria-pressed'), 'true', 'mirror command toggles the drawing setting');
        await runListed('toggle.grid'); assert.equal(await page.locator('#draw-grid-toggle').getAttribute('aria-pressed'), 'false', 'grid command toggles the view setting');
        await runListed('open.colorEditor'); assert.equal(await page.locator('#draw-color-editor').isVisible(), true, 'color editor command opens the editor');
        await page.keyboard.press('Escape'); assert.equal(await page.locator('#draw-color-editor').isVisible(), false, 'color editor closes with Escape');
        await runListed('open.canvasSettings'); assert.equal(await page.locator('.draw-import').evaluate(node => node.open), true, 'canvas settings command opens its panel');
        await page.locator('#draw-import-summary').evaluate(node => node.click());
        await runListed('animation.workspace');
        await runListed('animation.addBlankFrame');
        assert.match(await page.locator('#draw-animation-controls [data-action="toggle-frames"]').getAttribute('aria-label'), /コマ 2/, 'blank-frame command creates and selects the second frame');
        await runListed('animation.duration'); assert.equal(await page.locator('[data-duration-input]').evaluate(node => node === document.activeElement), true, 'duration command opens and focuses the duration input');
        await page.keyboard.press('Escape');
        await runListed('animation.renameLayer'); assert.ok(await page.locator('[data-rename-layer]').count(), 'layer command opens the layer rename control');
        await page.keyboard.press('Escape');
        await runListed('open.project'); assert.equal(await page.locator('#pxd-panel').evaluate(node => node.open), true, 'project command opens the project dialog');
        await page.keyboard.press('Escape');
        await runListed('project.save');
        assert.deepEqual(errors, [], `command groups complete without browser errors: ${errors.join('; ')}`);
        checks.push('listed left/right tool commands, mirror/grid, color editor, canvas settings, blank frame/duration/layer, project dialog/save');
      } else {
        await page.keyboard.press('Escape');
      }

      // Keyboard cursor holds perform real drawing and are released on keyup, blur, or dialog open.
      await page.locator('#draw-shortcuts-dialog').waitFor({ state: 'hidden' });
      await closeSettings();
      await clear();
      if ((await page.locator('#draw-virtual-toggle').getAttribute('aria-pressed')) !== 'true') {
        await openSettings(); await page.locator('#draw-virtual-toggle').click(); await closeSettings();
      }
      await openDialog(); await command('cursor.left').click();
      assert.equal(await page.locator('[data-virtual-left]').getAttribute('aria-pressed'), 'false', 'one-shot command activation releases a held command immediately');
      await canvas.focus();
      await page.keyboard.down('Enter');
      assert.equal(await page.locator('[data-virtual-left]').getAttribute('aria-pressed'), 'true', 'Enter holds virtual left button');
      await page.keyboard.down('ArrowRight'); await page.keyboard.up('ArrowRight'); await page.keyboard.up('Enter');
      assert.equal(await page.locator('[data-virtual-left]').getAttribute('aria-pressed'), 'false', 'Enter keyup releases virtual left button');
      assert.ok(await pixelCount() > 0, 'held virtual cursor arrow movement paints pixels');
      await clear(); await canvas.focus(); await page.keyboard.down('Shift'); await page.keyboard.down('Enter');
      assert.equal(await page.locator('[data-virtual-right]').getAttribute('aria-pressed'), 'true', 'Shift+Enter holds virtual right button');
      await page.keyboard.down('ArrowLeft'); await page.keyboard.up('ArrowLeft'); await page.keyboard.up('Enter'); await page.keyboard.up('Shift');
      assert.equal(await page.locator('[data-virtual-right]').getAttribute('aria-pressed'), 'false', 'Shift+Enter keyup releases virtual right button');
      await clear(); await canvas.focus(); await page.keyboard.down('Enter'); await page.keyboard.down('ArrowRight');
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      assert.equal(await page.locator('[data-virtual-left]').getAttribute('aria-pressed'), 'false', 'window blur cancels a held virtual button');
      await page.keyboard.up('ArrowRight'); await page.keyboard.up('Enter');
      const afterBlur = await pixelCount(); await page.keyboard.down('ArrowRight'); await page.keyboard.up('ArrowRight');
      assert.equal(await pixelCount(), afterBlur, 'post-blur movement cannot continue the cancelled stroke');
      await clear(); await canvas.focus(); await page.keyboard.down('Enter'); await page.keyboard.down('ArrowRight');
      await openDialog();
      assert.equal(await page.locator('[data-virtual-left]').getAttribute('aria-pressed'), 'false', 'opening shortcut dialog cancels held virtual input');
      await page.keyboard.up('ArrowRight'); await page.keyboard.up('Enter');
      await page.keyboard.press('Escape'); assert.equal(await canvas.evaluate(node => node === document.activeElement), true, 'closing canceled dialog restores canvas focus');
      checks.push('virtual cursor Enter plus arrow paints; keyup, blur, and dialog opening release/cancel held input');

      // Space plus arrows pans even when modifier state changes, then releases cleanly.
      await page.keyboard.press('Control+0').catch(() => {});
      await canvas.focus();
      const beforeTransform = await canvas.getAttribute('style');
      await page.keyboard.down('Space'); assert.ok((await canvas.getAttribute('class')).includes('is-grab'), 'Space enters pan-hold state');
      await page.keyboard.down('ArrowRight'); await page.keyboard.up('ArrowRight');
      await page.keyboard.down('Shift'); await page.keyboard.down('ArrowDown'); await page.keyboard.up('ArrowDown'); await page.keyboard.up('Shift');
      await page.keyboard.up('Space');
      assert.ok(!(await canvas.getAttribute('class')).includes('is-grab'), 'Space keyup releases pan-hold state');
      const afterTransform = await canvas.getAttribute('style');
      assert.notEqual(afterTransform, beforeTransform, 'Space plus arrow changed canvas viewport transform');
      checks.push('Space plus arrow pans and keyup clears grab state despite changed modifier state');

      assert.deepEqual(errors, [], `no browser errors: ${errors.join('; ')}`);
      results.push({ variant: variant.name, platform: variant.platform, simulatedOs: variant.simulated, checks, pageErrors: errors });
    } catch (error) {
      results.push({ variant: variant.name, platform: variant.platform, simulatedOs: variant.simulated, checks, pageErrors: errors, failure: error.stack || String(error) });
      throw error;
    } finally { await context.close(); }
  }
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ base, results }, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ output, results }, null, 2));
