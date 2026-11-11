/** Additional real-browser cases for approved CI; known local bind EPERM is not retried. */
import assert from 'node:assert/strict';

async function withVisibleControl(page, locator, operation) {
  assert.ok(await locator.count(), 'expected control exists before interacting with it');
  const target = locator.first();
  const panel = page.locator('#sc-settings-panel');
  const inPanel = await target.evaluate(node => Boolean(node.closest('#sc-settings-panel')));
  let openedPanel = false;
  if (inPanel && !(await panel.evaluate(node => node.open))) {
    await page.locator('[data-sc-settings-open]').click();
    await page.waitForFunction(() => document.querySelector('#sc-settings-panel')?.open === true);
    openedPanel = true;
    if (await page.locator('#main').getAttribute('data-unified-result') === 'true') {
      assert.equal(await panel.evaluate(node => node.matches(':modal')), true, 'unified settings open as a modal');
    }
  }
  try {
    const details = target.locator('xpath=ancestor::details');
    const order = await details.evaluateAll(nodes => nodes.map((node, index) => {
      let depth = 0;
      for (let current = node; current; current = current.parentElement) depth++;
      return { index, depth };
    }).sort((a, b) => a.depth - b.depth).map(item => item.index));
    for (const index of order) {
      const disclosure = details.nth(index);
      if (!(await disclosure.evaluate(node => node.open))) await disclosure.locator('summary').first().click();
    }
    await target.waitFor({ state: 'visible' });
    assert.equal(await target.isVisible(), true, 'control is visible after opening its real UI ancestors');
    return await operation(target);
  } finally {
    if (openedPanel && await panel.evaluate(node => node.open)) {
      await panel.locator('[data-sc-settings-close]').click();
      await page.waitForFunction(() => !document.querySelector('#sc-settings-panel')?.open);
    }
  }
}

export async function checkConversionMaterialStage({ page, png, pass }) {
  const unified = await page.locator('[data-sc-unified-purpose]').count() > 0;
  const addSelector = '[data-sc-material-add]';
  const formatSelector = unified ? '[data-sc-unified-format]' : '[data-sc-format]';
  const selectFormat = async value => {
    if (unified && ['ascii','block','braille','emoji','custom'].includes(value)) {
      await withVisibleControl(page, page.locator(formatSelector), select => select.selectOption('text-art'));
      await withVisibleControl(page, page.locator('[data-sc-unified-art-style]'), select => select.selectOption(value));
    } else if (unified && ['encode','pixels','base64','dataurl'].includes(value)) {
      const tools = page.locator('.sc-unified-code-tools');
      if (!(await tools.evaluate(node => node.open))) await tools.locator('summary').click();
      const open = page.locator('[data-sc-unified-code-open]');
      if (await open.isVisible()) await open.click();
      await withVisibleControl(page, page.locator('[data-sc-unified-code-format]'), select => select.selectOption(value));
    } else await withVisibleControl(page, page.locator(formatSelector), select => select.selectOption(value));
  };
  const materialState = () => page.evaluate(() => document.querySelector('#main').conversionMaterials.getState());
  // Material events update their model synchronously; the shared surface renders on RAF.
  // Await both semantics without replacing the visibility assertions below.
  const count = n => page.waitForFunction(n => {
    const m = document.querySelector('#main'), surface = m.querySelector('.sc-material-surface'), strip = m.querySelector('.sc-material-strip');
    const state = m.conversionMaterials.getState();
    return m.getAttribute('aria-busy') !== 'true' && state.assets.length === n
      && surface?.dataset.loaded === String(n > 0)
      && (n === 0 ? strip?.hidden : !strip?.hidden && strip?.querySelectorAll('.sc-material-card').length === n);
  }, n);
  const choose = async (selector, file) => withVisibleControl(page, page.locator(selector).first(), async control => {
    const chooser = page.waitForEvent('filechooser'); await control.click(); await (await chooser).setFiles(file);
  });
  const file = name => ({ name, mimeType: 'image/png', buffer: png });
  assert.equal((await materialState()).assets.length, 1);
  const previewSpace=await page.locator('.sc-result-surface').boundingBox();
  assert.ok(previewSpace&&previewSpace.height>=180,'the unified result area is visible and usable');
  assert.equal(await withVisibleControl(page, page.locator('.sc-material-strip'), control => control.isVisible()), true);
  // Returning from source comparison can still encode the newly edited size.
  // Measure idle rendering only after that real asynchronous work has finished.
  await page.waitForFunction(() => {
    const main=document.querySelector('#main'),surface=main.querySelector('.sc-result-surface'),img=surface?.querySelector('.sc-result-content img'),recovery=main.querySelector('.sc-local-recovery');
    return main.getAttribute('aria-busy')!=='true' && surface?.dataset.state==='ready' && surface.dataset.current==='true'
      && !document.querySelector('#output-nav-export').disabled && img?.complete && img.naturalWidth>0
      && recovery?.dataset.phase==='saved' && recovery.dataset.dirty==='false' && recovery.getAttribute('aria-busy')==='false';
  });
  const idleMutations = await page.evaluate(async () => {
    const changes = []; const observer = new MutationObserver(records => {
      for(const record of records)changes.push({attribute:record.attributeName,tag:record.target.tagName,id:record.target.id,classes:record.target.className,data:{...record.target.dataset},hidden:record.target.hidden,disabled:record.target.disabled});
    });
    observer.observe(document.querySelector('#main'), { subtree: true, attributes: true, attributeFilter: ['hidden','disabled'] });
    for (let i = 0; i < 8; i++) await new Promise(done => requestAnimationFrame(done));
    observer.disconnect(); return changes;
  });
  assert.ok(idleMutations.length < 6, `idle rendering must settle: ${idleMutations.length} visibility/disabled mutations ${JSON.stringify(idleMutations)}`);
  assert.equal(await page.locator('#output-nav-export').innerText(), 'JPEGを保存');
  await page.evaluate(() => { window.__stageSurface = document.querySelector('.sc-material-surface'); });
  let opened = 0; const watchChooser = () => opened++;
  page.on('filechooser', watchChooser);
  await page.locator('.sc-result-content img').waitFor({state:'visible'});await page.locator('.sc-result-content img').click();
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  page.off('filechooser', watchChooser); assert.equal(opened, 0, 'loaded preview must not open a chooser');
  await choose(addSelector, file('second.png')); await count(2);
  assert.equal(await withVisibleControl(page, page.locator('.sc-material-strip'), control => control.isVisible()), true);
  assert.equal(await withVisibleControl(page, page.locator(formatSelector), control => control.inputValue()), 'jpeg');
  assert.equal(await withVisibleControl(page, page.locator('[data-width]'), control => control.inputValue()), '20');
  assert.equal(await page.locator('#output-nav-export').innerText(), 'JPEGを保存', 'two inputs still mean one current output');
  await withVisibleControl(page, page.locator('.sc-material-strip'), control => control.scrollIntoViewIfNeeded());
  const layout=await page.evaluate(()=>{const rect=node=>{const r=node.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};const main=document.querySelector('#main'),composer=document.querySelector('.sc-unified-composer'),strip=document.querySelector('.sc-material-strip'),preview=document.querySelector('.sc-result-surface');return {viewportWidth:innerWidth,main:rect(main),composer:rect(composer),strip:rect(strip),preview:rect(preview),stripInComposer:composer.contains(strip)};});
  assert.equal(layout.stripInComposer,true,'materials remain inside their settings/composer pane');
  assert.ok(layout.strip.left>=layout.composer.left-1&&layout.strip.right<=layout.composer.right+1&&layout.strip.top<layout.composer.bottom&&layout.strip.bottom>layout.composer.top,`materials remain reachable within the composer scroll region ${JSON.stringify(layout)}`);
  assert.ok(layout.preview.width>0&&layout.preview.top>=layout.main.top-1&&layout.preview.bottom<=layout.main.bottom+1,`the output region remains within the workspace ${JSON.stringify(layout)}`);
  if(layout.viewportWidth>=960)assert.ok(layout.preview.left>=layout.composer.right-1,`desktop settings and result remain in separate columns ${JSON.stringify(layout)}`);
  else assert.ok(layout.preview.top>=layout.composer.bottom-1,`mobile settings and result remain vertically stacked ${JSON.stringify(layout)}`);
  const activeBeforeHover=(await materialState()).activeId;
  const other=page.locator('.sc-material-card').last();await page.mouse.move(0,0);await page.locator('[data-sc-settings-open]').focus();
  await withVisibleControl(page, other, async card => {
    assert.equal(await card.locator('[data-remove-material]').isVisible(), false, 'unselected actions stay quiet without hover/focus');
    await card.hover();
    assert.equal(await card.locator('[data-remove-material]').isVisible(), true);
    assert.equal(await card.locator('[data-sc-material-replace]').isVisible(), true);
    assert.equal((await materialState()).activeId, activeBeforeHover, 'hover does not select another material');
    await page.mouse.move(0, 0); await card.locator('[data-select-material]').focus();
    assert.equal(await card.locator('[data-remove-material]').isVisible(), true, 'keyboard focus reveals the same actions');
  });
  const ids = (await materialState()).assets.map(a => a.id);
  await withVisibleControl(page, page.locator('[data-select-material]').last(), control => control.click());
  assert.equal((await materialState()).activeId, ids[1]);
  assert.equal(await withVisibleControl(page, page.locator('[data-frame]'), control => control.inputValue()), '2', 'selected thumbnail is the static export target');
  await withVisibleControl(page, page.locator('[data-select-material]').last(), async control => { await control.focus(); await page.keyboard.press('Home'); });
  assert.equal((await materialState()).activeId, ids[0]);
  await page.waitForFunction(() => document.querySelector('[data-select-material]') === document.activeElement);
  assert.equal(await page.locator('[data-select-material]').first().evaluate(node => node === document.activeElement), true);
  await withVisibleControl(page, page.locator(addSelector), async control => {
    const chooser = page.waitForEvent('filechooser'); await control.click(); await (await chooser).setFiles([]);
  });
  assert.deepEqual((await materialState()).assets.map(a => a.id), ids, 'cancel is a no-op');
  await choose(addSelector, { name: 'broken.bmp', mimeType: 'image/bmp', buffer: Buffer.from('not a bitmap') });
  await page.waitForFunction(() => document.querySelector('#main').getAttribute('aria-busy') !== 'true');
  assert.deepEqual((await materialState()).assets.map(a => a.id), ids, 'invalid input preserves previous sources');
  assert.equal(await withVisibleControl(page, page.locator('[data-width]'), control => control.inputValue()), '20');
  if (unified) {
    // Failed originals remain in the ordered input ledger until the user explicitly holds them.
    const receipt=page.locator('.sc-input-receipts li').filter({has:page.locator('[data-receipt-name]',{hasText:'broken.bmp'})});
    await withVisibleControl(page, receipt.locator('[data-receipt-original]'), async original => {
      await receipt.locator('[data-receipt-hold]').waitFor({state:'visible'});
      const originalHref=await original.getAttribute('href');assert.ok(originalHref?.startsWith('blob:'));
      await receipt.locator('[data-receipt-hold]').click();await receipt.locator('[data-receipt-hold]').waitFor({state:'hidden'});
      assert.equal(await original.getAttribute('href'),originalHref,'holding an invalid file retains its original bytes');
      assert.deepEqual((await materialState()).assets.map(a=>a.id),ids,'holding a failed input leaves native materials untouched');
    });
    const receipts=page.locator('.sc-input-receipts');if(await receipts.evaluate(node=>node.open))await withVisibleControl(page, receipts.locator('summary'), summary=>summary.click());
  }
  await choose(addSelector, file('retry.png')); await count(3);
  const beforeUnselectedRemoval = await materialState();
  assert.notEqual(beforeUnselectedRemoval.assets.at(-1).id, beforeUnselectedRemoval.activeId, 'remove a material other than the active preview');
  const unselectedLast = page.locator('.sc-material-card').last();
  await withVisibleControl(page, unselectedLast, async card => {
    await card.hover();
    assert.equal(await card.locator('[data-remove-material]').isVisible(), true);
    await card.locator('[data-remove-material]').click();
  });
  await count(2);
  assert.equal((await materialState()).activeId, beforeUnselectedRemoval.activeId, 'deleting the unselected last material preserves the active selection');
  const nextLast = page.locator('.sc-material-card').last();
  await withVisibleControl(page, nextLast, async card => { await card.hover(); await card.locator('[data-remove-material]').click(); });
  await count(1);
  assert.equal(await withVisibleControl(page, page.locator('.sc-material-strip'), control => control.isVisible()), true);
  await withVisibleControl(page, page.locator('.sc-material-card').last(), async card => { await card.hover(); await card.locator('[data-remove-material]').click(); }); await count(0);
  await withVisibleControl(page, page.locator('[data-sc-material-undo]'), control => control.click()); await count(1);
  assert.equal(await withVisibleControl(page, page.locator('[data-width]'), control => control.inputValue()), '20');
  assert.equal(await withVisibleControl(page, page.locator(formatSelector), control => control.inputValue()), 'jpeg');
  await withVisibleControl(page, page.locator('[data-select-material]').first(), async control => { await control.focus(); await page.keyboard.press('Delete'); }); await count(0);
  assert.equal(await withVisibleControl(page, page.locator('[data-drop]'), control => control.isVisible()), true);
  if (unified) {
    assert.equal(await withVisibleControl(page, page.locator('[data-sc-unified-add]'), control => control.isVisible()), true, 'last deletion keeps the unified add action available');
    assert.equal(await withVisibleControl(page, page.locator('#sc-output-tab-image'), control => control.isVisible()), true, 'the image output tab remains available when no material is loaded');
    assert.equal(await withVisibleControl(page, page.locator('#sc-output-tab-text'), control => control.isVisible()), true, 'the text output tab remains available when no material is loaded');
  } else assert.equal(await page.locator('.sc-empty-chooser').isVisible(), true, 'last deletion restores the original expanded native chooser');
  assert.equal(await page.evaluate(() => window.__stageSurface === document.querySelector('.sc-material-surface')), true);
  // Dispatch at the original empty child: the shared capture handler must import only once.
  await withVisibleControl(page, page.locator('[data-drop]'), async () => page.evaluate(bytes => {
    const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(bytes)], 'drop.png', { type: 'image/png' }));
    const target = document.querySelector('[data-drop]');
    for (const type of ['dragenter','dragover','drop']) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, [...png]));
  await count(1);
  assert.equal(await page.locator('.sc-material-drop-overlay').isVisible(), false);
  await selectFormat('jpeg');
  await withVisibleControl(page, page.locator('[data-width]'), control => control.fill('20'));
  await choose('[data-sc-material-replace]', file('replacement.png')); await count(1);
  assert.notEqual((await materialState()).assets[0].id, ids[0], 'replace uses a fresh input');
  await selectFormat('jpeg');
  await withVisibleControl(page, page.locator('[data-width]'), control => control.fill('20'));
  pass('shared surface: non-clickable preview, add/cancel/error/retry, 1→many→1→empty, item selection, keyboard navigation/deletion, Undo, single-import drop and explicit replacement; pending size and format retained on add/remove');
}
