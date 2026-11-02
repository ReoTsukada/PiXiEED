/** Additional real-browser cases for approved CI; known local bind EPERM is not retried. */
import assert from 'node:assert/strict';

export async function checkConversionMaterialStage({ page, png, pass }) {
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
  const choose = async (selector, file) => {
    const chooser = page.waitForEvent('filechooser'); await page.locator(selector).first().click(); await (await chooser).setFiles(file);
  };
  const file = name => ({ name, mimeType: 'image/png', buffer: png });
  assert.equal((await materialState()).assets.length, 1);
  const previewSpace = await page.evaluate(() => ({
    workbench: document.querySelector('.convert-workbench').getBoundingClientRect().height,
    stage: document.querySelector('.convert-stage').getBoundingClientRect().height,
  }));
  assert.ok(previewSpace.stage >= previewSpace.workbench - 2, `preview fills its workbench: ${JSON.stringify(previewSpace)}`);
  assert.equal(await page.locator('.sc-material-strip').isVisible(), true);
  const idleMutations = await page.evaluate(async () => {
    let count = 0; const observer = new MutationObserver(records => { count += records.length; });
    observer.observe(document.querySelector('#main'), { subtree: true, attributes: true, attributeFilter: ['hidden','disabled'] });
    for (let i = 0; i < 8; i++) await new Promise(done => requestAnimationFrame(done));
    observer.disconnect(); return count;
  });
  assert.ok(idleMutations < 6, `idle rendering must settle: ${idleMutations} visibility/disabled mutations`);
  assert.equal(await page.locator('#output-nav-export').innerText(), 'JPEGで保存');
  await page.evaluate(() => { window.__stageSurface = document.querySelector('.sc-material-surface'); });
  let opened = 0; const watchChooser = () => opened++;
  page.on('filechooser', watchChooser);
  await page.locator('[data-canvas]').click();
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  page.off('filechooser', watchChooser); assert.equal(opened, 0, 'loaded preview must not open a chooser');
  await choose('[data-sc-material-add]', file('second.png')); await count(2);
  assert.equal(await page.locator('.sc-material-strip').isVisible(), true);
  assert.equal(await page.locator('[data-sc-format]').inputValue(), 'jpeg');
  assert.equal(await page.locator('[data-width]').inputValue(), '20');
  assert.equal(await page.locator('#output-nav-export').innerText(), 'JPEGで保存', 'two inputs still mean one current output');
  const layout=await page.evaluate(()=>({preview:document.querySelector('[data-editor]').getBoundingClientRect().bottom,strip:document.querySelector('.sc-material-strip').getBoundingClientRect().top}));
  assert.ok(layout.strip>=layout.preview-1,'materials follow the central preview');
  const activeBeforeHover=(await materialState()).activeId;
  const other=page.locator('.sc-material-card').last();await page.mouse.move(0,0);await page.locator('[data-sc-settings-open]').focus();
  assert.equal(await other.locator('[data-remove-material]').isVisible(),false,'unselected actions stay quiet without hover/focus');
  await other.hover();assert.equal(await other.locator('[data-remove-material]').isVisible(),true);assert.equal(await other.locator('[data-sc-material-replace]').isVisible(),true);
  assert.equal((await materialState()).activeId,activeBeforeHover,'hover does not select another material');
  await page.mouse.move(0,0);await other.locator('[data-select-material]').focus();assert.equal(await other.locator('[data-remove-material]').isVisible(),true,'keyboard focus reveals the same actions');
  const ids = (await materialState()).assets.map(a => a.id);
  await page.locator('[data-select-material]').last().click();
  assert.equal((await materialState()).activeId, ids[1]);
  assert.equal(await page.locator('[data-frame]').inputValue(), '2', 'selected thumbnail is the static export target');
  await page.locator('[data-select-material]').last().focus(); await page.keyboard.press('Home');
  assert.equal((await materialState()).activeId, ids[0]);
  assert.equal(await page.locator('[data-select-material]').first().evaluate(node => node === document.activeElement), true);
  await page.locator('[data-sc-material-file]').setInputFiles([]);
  assert.deepEqual((await materialState()).assets.map(a => a.id), ids, 'cancel is a no-op');
  await choose('[data-sc-material-add]', { name: 'broken.bmp', mimeType: 'image/bmp', buffer: Buffer.from('not a bitmap') });
  await page.waitForFunction(() => document.querySelector('#main').getAttribute('aria-busy') !== 'true');
  assert.deepEqual((await materialState()).assets.map(a => a.id), ids, 'invalid input preserves previous sources');
  assert.equal(await page.locator('[data-width]').inputValue(), '20');
  await choose('[data-sc-material-add]', file('retry.png')); await count(3);
  const beforeUnselectedRemoval = await materialState();
  assert.notEqual(beforeUnselectedRemoval.assets.at(-1).id, beforeUnselectedRemoval.activeId, 'remove a material other than the active preview');
  const unselectedLast = page.locator('.sc-material-card').last();
  await unselectedLast.hover();
  assert.equal(await unselectedLast.locator('[data-remove-material]').isVisible(), true);
  await unselectedLast.locator('[data-remove-material]').click(); await count(2);
  assert.equal((await materialState()).activeId, beforeUnselectedRemoval.activeId, 'deleting the unselected last material preserves the active selection');
  const nextLast = page.locator('.sc-material-card').last();
  await nextLast.hover();
  await nextLast.locator('[data-remove-material]').click(); await count(1);
  assert.equal(await page.locator('.sc-material-strip').isVisible(), true);
  await page.locator('.sc-material-card [data-remove-material]').click(); await count(0);
  await page.locator('[data-sc-material-undo]').click(); await count(1);
  assert.equal(await page.locator('[data-width]').inputValue(), '20');
  assert.equal(await page.locator('[data-sc-format]').inputValue(), 'jpeg');
  await page.locator('[data-select-material]').focus(); await page.keyboard.press('Delete'); await count(0);
  assert.equal(await page.locator('[data-drop]').isVisible(), true);
  assert.equal(await page.locator('.sc-empty-chooser').isVisible(), true, 'last deletion restores the original expanded native chooser');
  assert.equal(await page.evaluate(() => window.__stageSurface === document.querySelector('.sc-material-surface')), true);
  // Dispatch at the original empty child: the shared capture handler must import only once.
  await page.evaluate(bytes => {
    const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(bytes)], 'drop.png', { type: 'image/png' }));
    const target = document.querySelector('[data-drop]');
    for (const type of ['dragenter','dragover','drop']) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, [...png]);
  await count(1);
  assert.equal(await page.locator('.sc-material-drop-overlay').isVisible(), false);
  await page.locator('[data-sc-format]').selectOption('jpeg');
  await page.locator('[data-width]').fill('20');
  await choose('[data-sc-material-replace]', file('replacement.png')); await count(1);
  assert.notEqual((await materialState()).assets[0].id, ids[0], 'replace uses a fresh input');
  await page.locator('[data-sc-format]').selectOption('jpeg');
  await page.locator('[data-width]').fill('20');
  pass('shared surface: non-clickable preview, add/cancel/error/retry, 1→many→1→empty, item selection, keyboard navigation/deletion, Undo, single-import drop and explicit replacement; pending size and format retained on add/remove');
}
