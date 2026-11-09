/** Follow the visible project panel controls instead of bypassing the UI. */
export async function saveCurrentProject(page) {
  if (!await page.locator('#pxd-panel').evaluate(panel => panel.open)) await page.locator('#project-open').click();
  const current = page.locator('#project-tab-current');
  if (await current.count()) await current.click();
  const more = page.locator('#pxd-panel .project-more');
  if (await more.count() && !await more.evaluate(details => details.open)) await more.locator(':scope > summary').click();
  await page.locator('#pxd-save').click();
}

/** Keep legacy PXD imports direct; modern galleries require preview then explicit copy. */
export async function importProjectFile(page, file) {
  await page.locator('#pxd-file-input').waitFor({ state: 'attached' });
  if (!await page.locator('#project-tab-import').count()) {
    await page.locator('#pxd-file-input').setInputFiles(file);
    return;
  }
  if (!await page.locator('#pxd-panel').evaluate(panel => panel.open)) {
    const creationOpen = page.locator('#creation-file-open');
    await (await creationOpen.isVisible() ? creationOpen : page.locator('#project-open')).click();
  }
  await page.locator('#project-tab-import').click();
  await page.locator('#pxd-file-input').setInputFiles(file);
  await page.waitForFunction(() => document.querySelector('#project-import-copy')?.disabled === false);
  await page.locator('#project-import-copy').click();
}
