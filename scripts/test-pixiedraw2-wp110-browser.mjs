import assert from "node:assert/strict";
import { createRequire } from "node:module";

const requireFromScreenshots = createRequire(new URL("../tools/screenshots/package.json", import.meta.url));
const { chromium } = requireFromScreenshots("playwright");
const browser = await chromium.launch({ headless: true });
const url = process.env.PIXIEEDRAW2_TEST_URL || "http://127.0.0.1:8000/pixiedraw2/";
const results = [];

try {
  for (const [width, height] of [[390, 844], [1280, 900]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error?.stack || error)));
    await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
    await page.waitForSelector("#draw2Canvas");

    const initial = await page.evaluate(() => ({
      entry: document.documentElement.dataset.pixieedEntry,
      flag: document.documentElement.dataset.featureFlag,
      robots: document.querySelector('meta[name="robots"]')?.content,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    assert.equal(initial.entry, "draw2-isolated");
    assert.equal(initial.flag, "off");
    assert.equal(initial.robots, "noindex,nofollow");
    assert.equal(initial.overflowX, false, `${width}x${height} overflow`);

    await page.locator("#draw2Canvas").scrollIntoViewIfNeeded();
    const initialBox = await page.locator("#draw2Canvas").boundingBox();
    assert.ok(initialBox && initialBox.width > 0 && initialBox.height > 0);
    const canvasPoint = async (fractionX = 0.5, fractionY = 0.5) => {
      const box = await page.locator("#draw2Canvas").boundingBox();
      assert.ok(box && box.width > 0 && box.height > 0);
      return { x: box.x + box.width * fractionX, y: box.y + box.height * fractionY };
    };

    let point = await canvasPoint();
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => document.querySelector("#draw2Status")?.textContent?.startsWith("pen committed locally"));
    assert.match(await page.locator("#draw2Metrics").textContent(), /journal=1/);
    const penPixel = await page.evaluate(() => Array.from(document.querySelector("#draw2Canvas").getContext("2d").getImageData(128, 128, 1, 1).data));
    assert.deepEqual(penPixel, [255, 255, 255, 255]);

    await page.selectOption("#draw2Tool", "eraser");
    point = await canvasPoint();
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => document.querySelector("#draw2Status")?.textContent?.startsWith("eraser committed locally"));
    assert.match(await page.locator("#draw2Metrics").textContent(), /journal=2/);
    const erasedPixel = await page.evaluate(() => Array.from(document.querySelector("#draw2Canvas").getContext("2d").getImageData(128, 128, 1, 1).data));
    assert.deepEqual(erasedPixel, [0, 0, 0, 0], "canonical transparent index 0 must project to alpha 0");

    await page.getByRole("button", { name: "Red index 2" }).click();
    await page.selectOption("#draw2Tool", "pen");
    point = await canvasPoint(0.625, 0.5);
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => document.querySelector("#draw2Status")?.textContent?.startsWith("pen committed locally"));
    assert.match(await page.locator("#draw2Metrics").textContent(), /journal=3/);
    const palettePixel = await page.evaluate(() => Array.from(document.querySelector("#draw2Canvas").getContext("2d").getImageData(160, 128, 1, 1).data));
    assert.deepEqual(palettePixel, [255, 0, 0, 255]);

    await page.getByRole("button", { name: "White index 1" }).click();
    await page.selectOption("#draw2Tool", "fill");
    point = await canvasPoint(0.5, 0.625);
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => document.querySelector("#draw2Status")?.textContent?.startsWith("fill committed locally"));
    assert.match(await page.locator("#draw2Metrics").textContent(), /journal=4/);
    const filledPixel = await page.evaluate(() => Array.from(document.querySelector("#draw2Canvas").getContext("2d").getImageData(128, 160, 1, 1).data));
    assert.deepEqual(filledPixel, [255, 255, 255, 255]);
    const retainedPalettePixel = await page.evaluate(() => Array.from(document.querySelector("#draw2Canvas").getContext("2d").getImageData(160, 128, 1, 1).data));
    assert.deepEqual(retainedPalettePixel, [255, 0, 0, 255]);
    assert.deepEqual(pageErrors, []);
    results.push(`${width}x${height}: isolated pen/eraser/palette/bounded-fill and transparency regression UI passed`);
    await page.close();
  }
} finally {
  await browser.close();
}

for (const result of results) console.log(`WP-110 browser ${result}`);
