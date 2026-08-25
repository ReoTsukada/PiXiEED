import assert from "node:assert/strict";
import { createRequire } from "node:module";

const requireFromScreenshots = createRequire(new URL("../tools/screenshots/package.json", import.meta.url));
const { chromium } = requireFromScreenshots("playwright");
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error?.stack || error)));
  await page.goto("http://127.0.0.1:8000/pixiedraw2/?new_project=1&mode=GAME", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.waitForTimeout(2_500);
  const exportLauncher = page.locator('[data-workspace-command="panel-export"]');
  assert.ok(await exportLauncher.count() > 0, "export command exists");
  await exportLauncher.first().evaluate((element) => element.click());
  await page.waitForFunction(() => {
    const panel = document.querySelector("#draw2WorkspacePanelExport");
    return panel instanceof HTMLElement && !panel.hidden && panel.getBoundingClientRect().width > 0;
  });
  assert.equal(await page.locator("#draw2ExportToMarket").isVisible(), true, "Market handoff button is visible");
  await page.locator("#draw2ExportToMarket").click();
  await page.waitForURL(/\/market\/sell\.html\?project_transfer=[0-9a-f-]{36}/, { timeout: 30_000 });
  await page.waitForFunction(() => /PXDを受け取りました|PXD.*受け取/.test(document.body.textContent || ""), null, { timeout: 30_000 });
  const handoff = await page.evaluate(() => ({
    pathname: location.pathname,
    transferUrl: location.search,
    fileCount: document.querySelectorAll("#listingFilesList li").length,
    status: document.querySelector("#listingStatus")?.textContent || "",
    title: document.querySelector("#listingTitle")?.value || "",
  }));
  assert.match(handoff.pathname, /\/market\/sell\.html$/);
  assert.match(await page.locator("#listingFileSummary").textContent(), /1件追加・対応 1件を出品/);
  assert.match(handoff.status, /PXDを受け取りました/);
  assert.equal(pageErrors.length, 0, `browser page errors: ${pageErrors.join("\n")}`);
  console.log("PiXiEEDraw2 iGAME PXD-to-Market handoff browser: passed");
} finally {
  await browser.close();
}
