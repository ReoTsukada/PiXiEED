import assert from "node:assert/strict";
import { createRequire } from "node:module";

const requireFromScreenshots = createRequire(new URL("../tools/screenshots/package.json", import.meta.url));
const { chromium } = requireFromScreenshots("playwright");
const browser = await chromium.launch({ headless: true });
const url = process.env.PIXIEEDRAW2_TEST_URL || "http://127.0.0.1:8000/pixiedraw2/";
const results = [];

try {
  for (const [width, height] of [[390, 844], [1280, 900]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error?.stack || error)));
    await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
    await page.waitForSelector("#draw2Canvas");
    await page.evaluate(() => {
      window.__wp120LongTasks = [];
      if ("PerformanceObserver" in window) {
        const observer = new PerformanceObserver((list) => {
          window.__wp120LongTasks.push(...list.getEntries().map((entry) => ({ name: entry.name, duration: entry.duration })));
        });
        try { observer.observe({ type: "longtask", buffered: true }); } catch { /* unsupported browser */ }
      }
    });

    const initial = await page.evaluate(() => ({
      entry: document.documentElement.dataset.pixieedEntry,
      flag: document.documentElement.dataset.featureFlag,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    assert.equal(initial.entry, "draw2-isolated");
    assert.equal(initial.flag, "off");
    assert.equal(initial.overflowX, false, `${width}x${height} overflow`);
    assert.equal(await page.getByRole("button", { name: "Select" }).getAttribute("type"), "button");
    await page.getByRole("button", { name: "Select" }).focus();
    assert.equal(await page.evaluate(() => document.activeElement?.id), "draw2Select");
    await page.locator("#draw2Canvas").scrollIntoViewIfNeeded();

    const canvasPointForPixel = async (pixelX, pixelY) => {
      const box = await page.locator("#draw2Canvas").boundingBox();
      assert.ok(box && box.width > 0 && box.height > 0);
      return {
        x: box.x + (pixelX + 0.5) * box.width / 256,
        y: box.y + (pixelY + 0.5) * box.height / 256,
      };
    };
    const pixel = async (x, y) => page.evaluate(([pixelX, pixelY]) => Array.from(document.querySelector("#draw2Canvas").getContext("2d").getImageData(pixelX, pixelY, 1, 1).data), [x, y]);

    const drawPoint = await canvasPointForPixel(128, 128);
    await page.mouse.click(drawPoint.x, drawPoint.y);
    await page.waitForFunction(() => document.querySelector("#draw2Status")?.textContent?.startsWith("pen committed locally"));
    assert.match(await page.locator("#draw2Metrics").textContent(), /journal=1/);
    assert.deepEqual(await pixel(128, 128), [255, 255, 255, 255]);

    await page.locator("#draw2SelectionX").fill("120");
    await page.locator("#draw2SelectionY").fill("120");
    await page.locator("#draw2SelectionWidth").fill("16");
    await page.locator("#draw2SelectionHeight").fill("16");
    await page.getByRole("button", { name: "Select" }).press("Enter");
    await page.waitForFunction(() => document.querySelector("#draw2Status")?.textContent?.includes("Selection created locally"));
    assert.match(await page.locator("#draw2SelectionStatus").textContent(), /256px/);

    const beforePreview = await pixel(128, 128);
    await page.getByRole("button", { name: "Preview" }).click();
    await page.waitForFunction(() => document.querySelector("#draw2Status")?.textContent?.includes("Transform Preview only"));
    assert.match(await page.locator("#draw2Metrics").textContent(), /journal=1/);
    assert.match(await page.locator("#draw2Metrics").textContent(), /scope=PREVIEW_ONLY canonicalDirtyTiles=0/);
    assert.deepEqual(await pixel(128, 128), beforePreview, "Preview must not mutate canonical pixels");
    const previewLongTasks = await page.evaluate(() => window.__wp120LongTasks);
    assert.ok(previewLongTasks.every((entry) => entry.duration <= 50), `Transform Preview produced a Long Task over 50ms: ${JSON.stringify(previewLongTasks)}`);

    await page.getByRole("button", { name: "Cancel" }).click();
    await page.waitForFunction(() => document.querySelector("#draw2Status")?.textContent?.includes("cancelled"));
    assert.match(await page.locator("#draw2Metrics").textContent(), /journal=1/);
    assert.deepEqual(await pixel(128, 128), beforePreview, "Cancel must leave canonical pixels unchanged");

    await page.getByRole("button", { name: "Preview" }).click();
    await page.getByRole("button", { name: "Commit" }).click();
    await page.waitForFunction(() => document.querySelector("#draw2Status")?.textContent?.includes("selection.transformCommit committed"));
    assert.match(await page.locator("#draw2Metrics").textContent(), /journal=2/);
    assert.deepEqual(await pixel(128, 128), [0, 0, 0, 0]);
    assert.deepEqual(await pixel(144, 128), [255, 255, 255, 255]);

    await page.getByRole("button", { name: "Undo" }).click();
    await page.waitForFunction(() => document.querySelector("#draw2Status")?.textContent?.startsWith("Undo restored"));
    assert.deepEqual(await pixel(128, 128), [255, 255, 255, 255]);
    assert.deepEqual(await pixel(144, 128), [0, 0, 0, 0]);
    await page.getByRole("button", { name: "Redo" }).click();
    await page.waitForFunction(() => document.querySelector("#draw2Status")?.textContent?.startsWith("Redo restored"));
    assert.deepEqual(await pixel(128, 128), [0, 0, 0, 0]);
    assert.deepEqual(await pixel(144, 128), [255, 255, 255, 255]);

    await page.locator("#draw2SelectionX").fill("144");
    await page.locator("#draw2SelectionY").fill("120");
    await page.getByRole("button", { name: "Select" }).click();
    await page.getByRole("button", { name: "Copy" }).click();
    await page.waitForFunction(() => document.querySelector("#draw2Status")?.textContent?.includes("Internal Clipboard copied"));
    assert.match(await page.locator("#draw2SelectionStatus").textContent(), /clipboard=256px/);
    await page.getByRole("button", { name: "Cut" }).click();
    await page.waitForFunction(() => document.querySelector("#draw2Status")?.textContent?.includes("clipboard.cut committed"));
    assert.match(await page.locator("#draw2Metrics").textContent(), /journal=3/);
    assert.deepEqual(await pixel(144, 128), [0, 0, 0, 0]);

    await page.getByRole("button", { name: "Paste placement" }).click();
    await page.waitForFunction(() => document.querySelector("#draw2Status")?.textContent?.includes("Paste placement Preview only"));
    assert.match(await page.locator("#draw2Metrics").textContent(), /journal=3/);
    await page.getByRole("button", { name: "Commit" }).click();
    await page.waitForFunction(() => document.querySelector("#draw2Status")?.textContent?.includes("clipboard.paste committed"));
    assert.match(await page.locator("#draw2Metrics").textContent(), /journal=4/);
    assert.deepEqual(await pixel(160, 128), [255, 255, 255, 255]);
    assert.deepEqual(pageErrors, []);
    results.push(`${width}x${height}: Selection Preview/Cancel/Commit, COW-local transform, atomic Undo/Redo, typed Copy/Cut/Paste passed`);
    await page.close();
  }
} finally {
  await browser.close();
}

for (const result of results) console.log(`WP-120 browser ${result}`);
