/** Focused browser audit for native and virtual left/right drawing cancellation and ownership. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'browser base must be local');
const output = process.env.PIXIEED_DRAW_BUTTON_CANCEL_OUTPUT || '/tmp/pixieed-draw-button-cancel-20261006';
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch({ headless: true });
const results = [];
await mkdir(output, { recursive: true });

try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    const context = await browser.newContext({ viewport, hasTouch: true });
    const page = await context.newPage(), errors = [], checks = [], virtualCaptureLossEvidence = [];
    page.setDefaultTimeout(10000);
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    page.on('pageerror', error => errors.push(error.message));
    const pixels = () => page.locator('#draw-canvas').evaluate(canvas => {
      const rgba = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data, result = [];
      for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3]) result.push({ x: (i / 4) % canvas.width, y: Math.floor(i / 4 / canvas.width), rgba: [...rgba.slice(i, i + 4)] });
      return result;
    });
    const pixelPoint = async (x, y) => {
      const rect = await page.locator('#draw-canvas').boundingBox();
      return { x: rect.x + (x + .5) * rect.width / 16, y: rect.y + (y + .5) * rect.height / 16 };
    };
    const painted = async () => pixels();
    const undo = async () => { await page.locator('#draw-undo').click(); };
    const assertClean = async label => {
      assert.deepEqual(await pixels(), [], label);
      assert.equal(await page.locator('#draw-canvas').getAttribute('data-virtual-pressed'), 'false', `${label}: no pressed cursor state`);
      assert.equal(await page.locator('#draw-canvas').getAttribute('data-virtual-button'), '', `${label}: no active side`);
      assert.equal(await page.locator('[data-virtual-left]').getAttribute('aria-pressed'), 'false');
      assert.equal(await page.locator('[data-virtual-right]').getAttribute('aria-pressed'), 'false');
    };
    const assign = async (side, tool, color) => {
      const clickForSide = target => target.click({ button: side === 'right' ? 'right' : 'left' });
      if (tool === 'pen' || tool === 'eraser') {
        await page.locator('#draw-canvas').focus(); await page.keyboard.press(tool === 'pen' ? 'b' : 'e');
      }
      if (side === 'right' && ['pen', 'eraser'].includes(tool)) {
        const target = page.locator('[data-draw-tool="pen"]'); await target.focus(); await target.press('Shift+Enter');
      } else if (side === 'right' || !['pen', 'eraser'].includes(tool)) {
        if (!(await page.locator('#draw-tool-picker').evaluate(node => node.open)) && !['pen', 'eraser'].includes(tool)) await page.locator('#draw-tool-summary').click();
        await clickForSide(page.locator(`[data-draw-tool="${tool === 'eraser' ? 'pen' : tool}"]`));
      }
      await clickForSide(page.locator(`.draw-color[data-color-index="${color}"]`));
      await page.keyboard.press('Escape');
    };
    const setVirtual = async enabled => {
      if ((await page.locator('#draw-virtual-toggle').getAttribute('aria-pressed')) === String(enabled)) return;
      await page.locator('#draw-settings-summary').click();
      await page.locator('#draw-virtual-toggle').click();
      await page.keyboard.press('Escape');
    };
    const readPointerIds = async () => page.evaluate(() => ({ ...window.__drawAuditPointerIds }));
    const startNative = async (side, path = [[2, 3], [2, 8], [10, 8]]) => {
      const start = await pixelPoint(...path[0]); await page.mouse.move(start.x, start.y); await page.mouse.down({ button: side });
      for (const xy of path.slice(1)) { const p = await pixelPoint(...xy); await page.mouse.move(p.x, p.y); }
      return readPointerIds();
    };
    const nativeUp = async side => page.mouse.up({ button: side });
    const contextSession = await context.newCDPSession(page);
    const touch = async (type, touchPoints) => { await contextSession.send('Input.dispatchTouchEvent', { type, touchPoints }); await page.waitForTimeout(30); };
    const center = async (selector, id) => {
      const r = await page.locator(selector).boundingBox(); return { id, x: r.x + r.width / 2, y: r.y + r.height / 2 };
    };
    const virtualPlace = async (x, y) => {
      const mark = await page.locator('.draw-virtual-marker').boundingBox(), target = await pixelPoint(x, y), board = await page.locator('.draw-board').boundingBox();
      const dx = target.x - (mark.x + mark.width / 2), dy = target.y - (mark.y + mark.height / 2);
      const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
      const left = board.x + 5, right = board.x + board.width - 5, top = board.y + 5, bottom = board.y + board.height - 5;
      const finger = { id: 31, x: clamp((left + right) / 2, left - Math.min(0, dx), right - Math.max(0, dx)),
        y: clamp((top + bottom) / 2, top - Math.min(0, dy), bottom - Math.max(0, dy)) };
      await touch('touchStart', [finger]);
      await touch('touchMove', [{ ...finger, x: finger.x + dx, y: finger.y + dy }]);
      await touch('touchEnd', [finger]);
    };
    const startVirtual = async (side, path = [[2, 3], [2, 8], [10, 8]]) => {
      await virtualPlace(...path[0]);
      const button = await center(`[data-virtual-${side}]`, 11), pad = await center('.draw-board', 22);
      await touch('touchStart', [button]); await touch('touchStart', [button, pad]);
      let previous = await pixelPoint(...path[0]), currentPad = { ...pad };
      for (const xy of path.slice(1)) {
        const next = await pixelPoint(...xy);
        currentPad = { ...currentPad, x: currentPad.x + next.x - previous.x, y: currentPad.y + next.y - previous.y };
        await touch('touchMove', [button, currentPad]); previous = next;
      }
      return { button, pad: currentPad, ids: await readPointerIds() };
    };
    const assertOnlyColor = async color => assert.ok((await pixels()).length && (await pixels()).every(p => p.rgba.join(',') === color));

    try {
      await page.goto(`${base}/draw/`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#draw-canvas')?.dataset.tool && !document.querySelector('#main').inert);
      await page.evaluate(() => {
        window.__drawAuditPointerIds = {};
        window.__drawAuditLostCaptures = [];
        window.__drawAuditGotCaptures = [];
        window.__drawAuditPointerMoves = [];
        window.__drawAuditPointerEvents = [];
        for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'lostpointercapture']) document.addEventListener(type, event => {
          window.__drawAuditPointerEvents.push({ type, id: event.pointerId, pointerType: event.pointerType, button: event.button,
            buttons: event.buttons, x: event.clientX, y: event.clientY, target: event.target.className?.baseVal || event.target.className || event.target.tagName,
            hasCapture: event.target.hasPointerCapture?.(event.pointerId) || false });
        }, true);
        document.addEventListener('gotpointercapture', event => window.__drawAuditGotCaptures.push({ id: event.pointerId, target: event.target.className?.baseVal || event.target.className || event.target.tagName }), true);
        document.addEventListener('lostpointercapture', event => window.__drawAuditLostCaptures.push({ id: event.pointerId, target: event.target.className?.baseVal || event.target.className || event.target.tagName }), true);
        document.addEventListener('pointermove', event => window.__drawAuditPointerMoves.push({ id: event.pointerId, type: event.pointerType }), true);
        document.addEventListener('pointerdown', event => {
          if (!event.target.closest('.draw-board, [data-virtual-left], [data-virtual-right]')) return;
          const virtualSide = event.target.closest('[data-virtual-left]') ? 'buttonLeft' : event.target.closest('[data-virtual-right]') ? 'buttonRight' : '';
          if (virtualSide) window.__drawAuditPointerIds[virtualSide] = event.pointerId;
          else if (event.pointerType === 'touch') window.__drawAuditPointerIds.pad = event.pointerId;
          else if (event.pointerType === 'mouse') window.__drawAuditPointerIds.mouse = event.pointerId;
        }, true);
      });
      await assign('right', 'pen', 4); await assign('left', 'line', 2);

      // Native left line and right pen keep independent color/tool bindings and commit once.
      await startNative('left'); await nativeUp('left');
      assert.equal((await pixels()).some(p => p.x === 2 && p.y === 8), false, 'left line is a preview from its original anchor');
      await assertOnlyColor('231,84,69,255'); await undo(); await assertClean('left native undo');
      await startNative('right'); await nativeUp('right');
      assert.ok((await pixels()).some(p => p.x === 2 && p.y === 8), 'right pen retains the moved corner');
      await assertOnlyColor('76,130,195,255'); await undo(); await assertClean('right native undo');
      checks.push('native left line and right pen use separate color/tool assignments and one Undo');

      // A binding edit made mid-stroke applies to the next gesture only.
      await startNative('left');
      await page.locator('.draw-color[data-color-index="3"]').evaluate(node => node.click());
      await page.locator('[data-draw-tool="pen"]').evaluate(node => node.click());
      await nativeUp('left');
      assert.equal((await pixels()).some(p => p.x === 2 && p.y === 8), false, 'active line binding did not change to pen');
      await assertOnlyColor('231,84,69,255'); await undo(); await assign('right', 'pen', 4); await assign('left', 'line', 2);
      checks.push('tool and color changes during a native stroke leave the active binding frozen');

      // Native cancel paths roll back for both sides and both preview/pen paths.
      for (const side of ['left', 'right']) for (const tool of ['pen', 'line']) for (const cancel of ['pointercancel', 'escape', 'blur']) {
        await assign(side, tool, side === 'left' ? 2 : 4);
        await startNative(side);
        const ids = await readPointerIds();
        if (cancel === 'pointercancel') await page.locator('#draw-canvas').evaluate((canvas, state) => canvas.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: state.id, pointerType: 'mouse', button: state.side === 'right' ? 2 : 0, buttons: 0, clientX: 900, clientY: 700 })), { id: ids.mouse, side });
        else if (cancel === 'escape') await page.keyboard.press('Escape');
        else await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        await nativeUp(side); await assertClean(`native ${side} ${tool} ${cancel} rollback`);
        await startNative(side, [[1, 1], [3, 1]]); await nativeUp(side); assert.ok((await pixels()).length, `native ${side} ${tool} works after ${cancel}`); await undo(); await assertClean('native recovery Undo');
      }
      await assign('right', 'pen', 4); await assign('left', 'line', 2);
      checks.push('pointercancel, Escape, and blur roll back both native sides for pen and line; fresh strokes work');

      // Capture loss commits accepted samples at the last in-canvas point; one Undo restores blank.
      for (const side of ['left', 'right']) {
        const p = await pixelPoint(3, 4); await page.mouse.move(p.x, p.y); await page.mouse.down({ button: side });
        const end = await pixelPoint(8, 4); await page.mouse.move(end.x, end.y);
        const id = (await readPointerIds()).mouse;
        const lostBefore = await page.evaluate(() => window.__drawAuditLostCaptures.length);
        await page.locator('#draw-canvas').evaluate((canvas, pointerId) => canvas.releasePointerCapture(pointerId), id);
        await page.waitForTimeout(50); await nativeUp(side);
        assert.ok(await page.evaluate(state => window.__drawAuditLostCaptures.slice(state.before).some(event => event.id === state.id), { before: lostBefore, id }), `native ${side} generated lostpointercapture`);
        assert.ok((await pixels()).some(pixel => pixel.x === 8 && pixel.y === 4), `${side} capture loss keeps last accepted sample`);
        await undo(); await assertClean(`${side} lost capture has one undo`);
      }
      checks.push('native lostpointercapture commits only accepted samples and one Undo restores blank');

      // Releasing the non-owner chord bit preserves the gesture; releasing its owner commits.
      for (const owner of ['left', 'right']) {
        const secondary = owner === 'left' ? 'right' : 'left', a = await pixelPoint(2, 3), b = await pixelPoint(7, 3), c = await pixelPoint(11, 3);
        await page.mouse.move(a.x, a.y); await page.mouse.down({ button: owner }); await page.mouse.down({ button: secondary });
        await page.mouse.move(b.x, b.y); const beforeSecondaryUp = await pixels(); await page.mouse.up({ button: secondary });
        assert.deepEqual(await pixels(), beforeSecondaryUp, `${owner} owner survives secondary release`);
        await page.mouse.move(c.x, c.y); await page.mouse.up({ button: owner }); const committed = await pixels();
        await page.mouse.move((await pixelPoint(14, 3)).x, (await pixelPoint(14, 3)).y);
        assert.deepEqual(await pixels(), committed, `${owner} owner release ends drawing while secondary remains held`);
        await page.mouse.up({ button: secondary }); await assertOnlyColor(owner === 'left' ? '231,84,69,255' : '76,130,195,255'); await undo(); await assertClean('native chord Undo');
      }
      checks.push('native left/right chords keep first side as owner through secondary release; remaining side cannot continue');

      // A captured native drag released outside the canvas commits the clipped last segment.
      const start = await pixelPoint(2, 10); await page.mouse.move(start.x, start.y); await page.mouse.down({ button: 'left' });
      const board = await page.locator('.draw-board').boundingBox(); await page.mouse.move(board.x + board.width + 45, board.y + board.height + 35); await page.mouse.up({ button: 'left' });
      assert.ok((await pixels()).length, 'native outside release keeps clipped stroke'); await undo(); await assertClean('outside release is undoable');
      checks.push('native release outside the canvas commits a clipped stroke that Undo restores');

      // Enabling virtual mode commits the native owner and consumes the remaining physical release.
      const nativeStart = await pixelPoint(1, 12); await page.mouse.move(nativeStart.x, nativeStart.y); await page.mouse.down({ button: 'right' });
      const nativeEnd = await pixelPoint(5, 12); await page.mouse.move(nativeEnd.x, nativeEnd.y);
      await page.locator('#draw-virtual-toggle').evaluate(node => node.click()); const transitioned = await pixels();
      assert.ok(transitioned.length, 'native stroke commits on virtual-mode enable'); await page.mouse.move((await pixelPoint(10, 12)).x, (await pixelPoint(10, 12)).y); await page.mouse.up({ button: 'right' });
      assert.deepEqual(await pixels(), transitioned, 'late native movement does not continue after virtual transition'); await undo(); await setVirtual(false); await assertClean('native-to-virtual transition Undo');
      checks.push('native-to-virtual transition commits and releases its owner');

      // Virtual left/right pen/line strokes commit on either finger lift and remain undoable.
      await setVirtual(true);
      for (const side of ['left', 'right']) for (const tool of ['line', 'pen']) {
        await assign(side, tool, side === 'left' ? 2 : 4);
        for (const lift of ['button', 'pad']) {
          const gesture = await startVirtual(side), activeSide = side;
          assert.equal(await page.locator('#draw-canvas').getAttribute('data-virtual-button'), activeSide);
          await assertOnlyColor(side === 'left' ? '231,84,69,255' : '76,130,195,255');
          if (lift === 'button') await touch('touchEnd', [gesture.button]); else await touch('touchEnd', [gesture.pad]);
          assert.equal(await page.locator('#draw-canvas').getAttribute('data-virtual-pressed'), 'false', `${side} ${tool} ${lift} lift`);
          const committed = await pixels(); assert.ok(committed.length, `${side} ${tool} ${lift} lift commits`);
          const leftover = lift === 'button' ? [{ ...gesture.pad, x: gesture.pad.x + 18 }] : [{ ...gesture.button, x: gesture.button.x + 18 }];
          await touch('touchMove', leftover); assert.deepEqual(await pixels(), committed, 'remaining finger cannot continue after gesture owner lifted');
          await touch('touchEnd', leftover); await undo(); await assertClean('virtual lift has one Undo');
        }
      }
      checks.push('virtual left/right pen and line commit on either owner/button or pad lift, with one Undo');

      // Cancel paths roll back; browser capture loss currently follows virtual cancellation behavior.
      for (const side of ['left', 'right']) for (const tool of ['pen', 'line']) for (const cancel of ['touchCancel', 'blur', 'escape', 'lostpointercapture']) {
        await assign(side, tool, side === 'left' ? 2 : 4);
        const gesture = await startVirtual(side), ids = gesture.ids;
        if (cancel === 'touchCancel') await touch('touchCancel', []);
        else if (cancel === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        else if (cancel === 'escape') await page.keyboard.press('Escape');
        else {
          const capture = await page.locator('.draw-board').evaluate((node, id) => ({ id, active: node.hasPointerCapture(id) }), ids.pad);
          const lostBefore = await page.evaluate(() => window.__drawAuditLostCaptures.length);
          const movesBefore = await page.evaluate(() => window.__drawAuditPointerMoves.length);
          await page.locator('.draw-board').evaluate((node, id) => node.releasePointerCapture(id), ids.pad);
          // Touch pointer capture changes are delivered at the next pointer event.
          await touch('touchMove', [gesture.button, { ...gesture.pad, x: gesture.pad.x + 1 }]);
          await page.waitForTimeout(30);
          const observed = await page.evaluate(state => window.__drawAuditLostCaptures.slice(state.before).some(event => event.id === state.id), { before: lostBefore, id: capture.id });
          const captureAfter = await page.locator('.draw-board').evaluate((node, id) => node.hasPointerCapture(id), capture.id);
          const pointerMoves = await page.evaluate(state => window.__drawAuditPointerMoves.slice(state.before).filter(event => event.id === state.id).length, { before: movesBefore, id: capture.id });
          virtualCaptureLossEvidence.push({ side, tool, pointerId: capture.id, captureWasActive: capture.active, captureAfterReleaseAndMove: captureAfter, pointerMoveEventsAfterRelease: pointerMoves, browserGeneratedEvent: observed });
          if (!observed) {
            // Preserve event-path coverage with the real pointer ID; report separately that
            // Playwright's CDP touch stream did not produce the browser event after release.
            await page.locator('.draw-board').evaluate((node, id) => node.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: id, pointerType: 'touch' })), capture.id);
          }
        }
        await page.waitForTimeout(50);
        assert.equal(await page.locator('#draw-canvas').getAttribute('data-virtual-pressed'), 'false', `${side} ${tool} ${cancel} clears pressed state`);
        assert.deepEqual(await pixels(), [], `virtual ${side} ${cancel} rolls back`);
        if (cancel !== 'touchCancel') await touch('touchMove', [gesture.button, { ...gesture.pad, x: gesture.pad.x + 20 }]);
        assert.deepEqual(await pixels(), [], `cancelled ${side} finger cannot continue`);
        if (cancel === 'touchCancel') await page.waitForTimeout(30);
        else await touch('touchEnd', [gesture.button, gesture.pad]);
        await assertClean(`virtual ${side} ${tool} ${cancel} cleanup`);
        const recovery = await startVirtual(side, [[1, 1], [3, 1]]); await touch('touchEnd', [recovery.button, recovery.pad]);
        assert.ok((await pixels()).length, `virtual ${side} ${tool} works after ${cancel}`); await undo(); await assertClean('virtual recovery Undo');
      }
      checks.push('virtual touchCancel, blur, Escape, and lostpointercapture event path roll back both sides for pen and line; recovery works');

      // Native mouse capture loss while virtual mode is enabled produces a browser-generated event.
      for (const side of ['left', 'right']) {
        const anchor = await center('.draw-board', 71);
        await page.mouse.move(anchor.x, anchor.y); await page.mouse.down({ button: side });
        await page.mouse.move(anchor.x + 12, anchor.y + 6);
        const id = (await readPointerIds()).mouse;
        const lostBefore = await page.evaluate(() => window.__drawAuditLostCaptures.length);
        await page.locator('.draw-board').evaluate((node, pointerId) => node.releasePointerCapture(pointerId), id);
        await page.mouse.move(anchor.x + 15, anchor.y + 8); await page.waitForTimeout(40);
        const observed = await page.evaluate(state => window.__drawAuditLostCaptures.slice(state.before).some(event => event.id === state.id), { before: lostBefore, id });
        assert.equal(observed, true, `virtual-mode native ${side} mouse receives browser lostpointercapture for id ${id}`);
        await assertClean(`virtual-mode native ${side} capture loss rolls back`);
        await page.mouse.up({ button: side });
      }
      checks.push('virtual-mode native left/right mouse capture loss generates browser lostpointercapture and rolls back');

      // Captured pad movement outside the board pauses; first re-entry anchors, subsequent movement applies.
      await virtualPlace(7, 7); // Keep enough viewport headroom for the measured 7px re-entry move.
      const pad = await center('.draw-board', 51); await touch('touchStart', [pad]); const before = await page.locator('.draw-virtual-marker').boundingBox();
      const boardRect = await page.locator('.draw-board').boundingBox();
      await touch('touchMove', [{ ...pad, y: boardRect.y + boardRect.height + 20 }]);
      assert.deepEqual(await page.locator('.draw-virtual-marker').boundingBox(), before, 'outside-board sample cannot move marker');
      await touch('touchMove', [{ ...pad, y: pad.y + 10 }]); assert.deepEqual(await page.locator('.draw-virtual-marker').boundingBox(), before, 'first re-entry sample only anchors');
      await touch('touchMove', [{ ...pad, x: pad.x + 7, y: pad.y + 10 }]);
      const after = await page.locator('.draw-virtual-marker').boundingBox(); assert.ok(Math.abs(after.x - before.x - 7) < 1, JSON.stringify({ before, after, pad, boardRect, pointerIds: await readPointerIds(), moves: await page.evaluate(() => window.__drawAuditPointerMoves.slice(-8)), lost: await page.evaluate(() => window.__drawAuditLostCaptures.slice(-8)) }));
      await touch('touchEnd', [pad]); checks.push('virtual pad pauses outside board and re-entry does not jump');

      // Layout changes cancel; switching virtual mode off commits a held virtual gesture.
      const layoutGesture = await startVirtual('left');
      await page.locator('#draw-settings-summary').click(); await page.locator('#draw-controls-side-toggle').evaluate(node => { if (node.dataset.side !== 'left') node.click(); });
      await assertClean('layout placement cancels virtual gesture'); await touch('touchEnd', [layoutGesture.button, layoutGesture.pad]);
      await page.keyboard.press('Escape'); await page.waitForTimeout(60);
      const offGesture = await startVirtual('right'); assert.ok((await pixels()).length, 'virtual-mode off precondition has an active preview/stroke');
      await page.locator('#draw-virtual-toggle').evaluate(node => node.click());
      const virtualOffPixels = await pixels(); assert.ok(virtualOffPixels.length, 'virtual mode off commits active gesture');
      await touch('touchEnd', [offGesture.button, offGesture.pad]); assert.deepEqual(await pixels(), virtualOffPixels); assert.equal(await page.locator('#draw-canvas').getAttribute('data-virtual-pressed'), 'false');
      await undo(); await assertClean('virtual off commit has one Undo'); await setVirtual(false);
      checks.push('layout placement cancels; virtual mode off commits then releases');

      await page.screenshot({ path: `${output}/${viewport.width}x${viewport.height}-audit.png` });
      assert.deepEqual(errors, [], 'browser console page errors');
      results.push({ viewport, checks, virtualCaptureLossEvidence, errors });
      console.log(`PASS ${viewport.width}x${viewport.height}: ${checks.length} cancellation audit groups`);
    } catch (error) {
      await page.screenshot({ path: `${output}/${viewport.width}x${viewport.height}-failure.png` }).catch(() => {});
      results.push({ viewport, checks, virtualCaptureLossEvidence, failure: error.stack || String(error), errors,
        pointerIds: await readPointerIds().catch(() => null), pointerEvents: await page.evaluate(() => window.__drawAuditPointerEvents).catch(() => []),
        state: await page.locator('#draw-canvas').evaluate(node => ({ pressed: node.dataset.virtualPressed, side: node.dataset.virtualButton, left: document.querySelector('[data-virtual-left]').getAttribute('aria-pressed'), right: document.querySelector('[data-virtual-right]').getAttribute('aria-pressed') })).catch(() => null) });
      await writeFile(`${output}/results.json`, JSON.stringify({ results }, null, 2));
      throw error;
    } finally { await context.close(); }
  }
  await writeFile(`${output}/results.json`, JSON.stringify({ results }, null, 2));
} finally { await browser.close(); }
