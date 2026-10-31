/** Additional real-browser cases for approved CI; known local bind EPERM is not retried. */
import assert from 'node:assert/strict';

export async function checkConversionMaterialStage({ page, png, pass }) {
  const materialState = () => page.evaluate(() => document.querySelector('#main').conversionMaterials.getState());
  // Material events update their model synchronously; the shared surface renders on RAF.
  // Await both semantics without replacing the visibility assertions below.
  const count = n => page.waitForFunction(n => {
    const m = document.querySelector('#main'), surface = m.querySelector('.sc-material-surface'), strip = m.querySelector('.sc-material-strip');
    return m.getAttribute('aria-busy') !== 'true' && m.conversionMaterials.getState().assets.length === n
      && surface?.dataset.loaded === String(n > 0)
      && (n < 2 ? strip?.hidden : !strip?.hidden && strip?.childElementCount === n);
  }, n);
  const choose = async (selector, file) => {
    const chooser = page.waitForEvent('filechooser'); await page.locator(selector).click(); await (await chooser).setFiles(file);
  };
  const file = name => ({ name, mimeType: 'image/png', buffer: png });
  assert.equal((await materialState()).assets.length, 1);
  assert.equal(await page.locator('.sc-material-strip').isVisible(), false);
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
  const ids = (await materialState()).assets.map(a => a.id);
  await page.locator('[data-sc-material-file]').setInputFiles([]);
  assert.deepEqual((await materialState()).assets.map(a => a.id), ids, 'cancel is a no-op');
  await choose('[data-sc-material-add]', { name: 'broken.bmp', mimeType: 'image/bmp', buffer: Buffer.from('not a bitmap') });
  await page.waitForFunction(() => document.querySelector('#main').getAttribute('aria-busy') !== 'true');
  assert.deepEqual((await materialState()).assets.map(a => a.id), ids, 'invalid input preserves previous sources');
  assert.equal(await page.locator('[data-width]').inputValue(), '20');
  await choose('[data-sc-material-add]', file('retry.png')); await count(3);
  await page.locator('.sc-material-thumb [data-remove-material]').last().click(); await count(2);
  await page.locator('.sc-material-thumb [data-remove-material]').last().click(); await count(1);
  assert.equal(await page.locator('.sc-material-strip').isVisible(), false);
  await page.locator('[data-sc-material-remove]').click(); await count(0);
  assert.equal(await page.locator('[data-drop]').isVisible(), true);
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
  pass('shared surface: non-clickable preview, add/cancel/error/retry, 1→many→1→empty, single-import drop and explicit replacement; pending size and format retained on add/remove');
}
