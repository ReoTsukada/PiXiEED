import assert from "node:assert/strict";
import { createRequire } from "node:module";

const requireFromScreenshots = createRequire(new URL("../tools/screenshots/package.json", import.meta.url));
const { chromium } = requireFromScreenshots("playwright");
const browser = await chromium.launch({ headless: true });

async function readDownload(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function storedZipEntryNames(bytes) {
  const names = [];
  let offset = 0;
  while (offset + 30 <= bytes.length && bytes.readUInt32LE(offset) === 0x04034b50) {
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const size = bytes.readUInt32LE(offset + 18);
    names.push(bytes.subarray(offset + 30, offset + 30 + nameLength).toString("utf8"));
    offset += 30 + nameLength + extraLength + size;
  }
  return names;
}

try {
  for (const [width, height] of [[1440, 900], [1024, 768]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error?.stack || error)));
    await page.goto("http://127.0.0.1:8000/pixiedraw2/?new_project=1&mode=GAME", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForTimeout(2_600);

    const rails = await page.evaluate(() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        const box = element?.getBoundingClientRect();
        return box && box.width > 0 && box.height > 0;
      };
      return {
        action: [...document.querySelectorAll("button.draw2-creator-mode")]
          .some((button) => button.textContent?.includes("iGAME")),
        hierarchy: rect("#draw2GameLeftDock"),
        viewport: rect("#draw2GamePreviewCard"),
        timeline: rect("#draw2ModeDeckGame"),
        overflow: [
          document.documentElement.scrollWidth,
          document.documentElement.clientWidth,
          document.documentElement.scrollHeight,
          document.documentElement.clientHeight,
        ],
      };
    });
    assert.equal(rails.action, true, `${width}: action rail`);
    assert.deepEqual(rails.overflow, [width, width, height, height], `${width}: page overflow`);
    assert.equal(rails.viewport, true, `${width}: viewport rail`);
    if (width >= 1280) {
      assert.equal(rails.hierarchy, true, "desktop hierarchy rail");
      assert.equal(rails.timeline, true, "desktop timeline rail");
    }

    if (width >= 1280) {
      await page.locator("#draw2GameHierarchyAdd").click();
      await page.waitForFunction(() => /4 scene objects/.test(
        document.querySelector("#draw2GameHierarchyStatus")?.textContent || "",
      ));
    }
    await page.locator("#draw2GamePreviewStart").click();
    await page.waitForFunction(() => /Runtime READY/.test(
      document.querySelector("#draw2GamePreviewStatus")?.textContent || "",
    ));

    for (const command of ["scene", "inspector", "assets", "build"]) {
      // Workspace commands are menu items and are intentionally hidden until
      // the parent tool menu opens; invoke the same DOM click handler here so
      // this smoke test does not depend on menu animation timing.
      await page.locator(`[data-workspace-command="game-panel-${command}"]`).evaluate((element) => {
        element.click();
      });
      await page.waitForTimeout(100);
      assert.equal(
        await page.locator(`#draw2WorkspacePanelGame${command[0].toUpperCase()}${command.slice(1)}`).count(),
        1,
        `${command} panel exists`,
      );
    }
    const target = page.locator("#draw2GameBuildTarget");
    for (const engine of ["UNITY", "GODOT", "UNREAL"]) {
      await target.selectOption(engine);
      await page.locator("#draw2GameBuildValidate").click();
      await page.waitForFunction((expected) =>
        (document.querySelector("#draw2GameBuildStatus")?.textContent || "").includes(expected), engine);
    assert.match(await page.locator("#draw2GameBuildStatus").textContent(), new RegExp(`${engine}.*パッケージ`));
      const downloadPromise = page.waitForEvent("download");
      await page.locator("#draw2GameBuildDownload").click();
      const download = await downloadPromise;
      const packageBytes = await readDownload(download);
      const entryNames = storedZipEntryNames(packageBytes);
      assert.match(download.suggestedFilename(), new RegExp(`^pixieed-${engine.toLowerCase()}-[a-f0-9]{12}\\.zip$`));
      assert.ok(entryNames.includes("pixieed/build-plan.json"), `${engine}: ZIP build plan`);
      assert.ok(entryNames.includes("pixieed/timeline.json"), `${engine}: ZIP timeline`);
      assert.ok(entryNames.includes("pixieed/asset-references.json"), `${engine}: ZIP locked asset references`);
      if (engine === "UNITY") assert.ok(entryNames.includes("Packages/manifest.json"), "UNITY: ZIP package manifest");
      if (engine === "GODOT") assert.ok(entryNames.includes("project.godot"), "GODOT: ZIP project file");
      if (engine === "UNREAL") assert.ok(entryNames.includes("PiXiEED.uproject"), "UNREAL: ZIP project file");
    }
    assert.deepEqual(pageErrors, [], `${width}: console page errors`);
    console.log(`GAME-350 browser ${width}x${height}: rails/preview/build passed`);
    await page.close();
  }
} finally {
  await browser.close();
}
