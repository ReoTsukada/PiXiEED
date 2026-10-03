/** Follow the visible project panel controls instead of bypassing the UI. */
export async function saveCurrentProject(page) {
  if (!await page.locator('#pxd-panel').evaluate(panel => panel.open)) await page.locator('#project-open').click();
  const current = page.locator('#project-tab-current');
  if (await current.count()) await current.click();
  const more = page.locator('#pxd-panel .project-more');
  if (await more.count() && !await more.evaluate(details => details.open)) await more.locator(':scope > summary').click();
  await page.locator('#pxd-save').click();
}
