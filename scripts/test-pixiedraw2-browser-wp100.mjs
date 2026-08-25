import assert from "node:assert/strict";
import { createRequire } from "node:module";

const requireFromScreenshots = createRequire(new URL("../tools/screenshots/package.json", import.meta.url));
const { chromium } = requireFromScreenshots("playwright");
const browser = await chromium.launch({ headless: true });
const url = process.env.PIXIEEDRAW2_TEST_URL || "http://127.0.0.1:8000/pixiedraw2/?new_project=1&mode=DRAW";
const results = [];

try {
  for (const [width, height] of [[390, 844], [1280, 900]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error?.stack || error)));
    await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
    await page.waitForSelector("#draw2Canvas");

    const initial = await page.evaluate(() => ({
      title: document.title,
      robots: document.querySelector('meta[name="robots"]')?.content,
      entry: document.documentElement.dataset.pixieedEntry,
      flag: document.documentElement.dataset.featureFlag,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      canvasWidth: document.querySelector("#draw2Canvas")?.clientWidth,
      bundleRequested: performance.getEntriesByType("resource").some((entry) => {
        try { return new URL(entry.name).pathname.endsWith("/pixiedraw2/dist/draw2-entry.js"); }
        catch { return false; }
      }),
    }));
    assert.equal(initial.robots, "noindex,nofollow");
    assert.equal(initial.entry, "draw2-isolated");
    assert.equal(initial.flag, "off");
    assert.equal(initial.overflowX, false, `${width}x${height} overflow`);
    assert.ok(initial.canvasWidth > 0);
    assert.equal(initial.bundleRequested, true);

    // `new_project=1` is the current canonical start route; it resolves the
    // project before the workspace mounts, so the old hidden toolbar action is
    // not part of this smoke path.
    await page.waitForFunction(() => /created|opened|isolated local mode/i.test(
      document.querySelector("#draw2Status")?.textContent || "",
    ));
    await page.locator("#draw2Canvas").scrollIntoViewIfNeeded();
    const box = await page.locator("#draw2Canvas").boundingBox();
    assert.ok(box && box.width > 0 && box.height > 0);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(() => /committed locally|committed/i.test(
      document.querySelector("#draw2Status")?.textContent || "",
    ));
    const pixel = await page.evaluate(() => Array.from(document.querySelector("#draw2Canvas").getContext("2d").getImageData(128, 128, 1, 1).data));
    assert.deepEqual(pixel, [255, 255, 255, 255]);
    assert.match(await page.locator("#draw2Metrics").textContent(), /journal=1/);
    assert.deepEqual(pageErrors, []);
    results.push(`${width}x${height}: noindex/flag/bundle/responsive/open-create/command/projection passed`);
    await page.close();
  }
} finally {
  await browser.close();
}

for (const result of results) console.log(`WP-100 browser ${result}`);
