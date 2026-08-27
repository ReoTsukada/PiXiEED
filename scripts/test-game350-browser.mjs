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
        systems: rect("#draw2ModeDeckGame"),
        gameTimelineCells: document.querySelectorAll('[data-mode-deck-cell="game"]').length,
        systemCards: document.querySelectorAll("[data-game-system-card]").length,
        inputActions: document.querySelectorAll(".draw2-game-input-action").length,
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
      assert.equal(rails.systems, true, "desktop systems rail");
      assert.equal(rails.gameTimelineCells, 0, "Game has no frame timeline cells");
      assert.equal(rails.systemCards, 8, "Game systems cards");
      assert.equal(rails.inputActions, 6, "Game input actions");
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
    await page.locator('[data-workspace-command="game-panel-scene"]').evaluate((element) => {
      element.click();
    });
    const creationGuide = await page.evaluate(() => ({
      visible: document.querySelector("#draw2GameCreationGuide") !== null,
      steps: document.querySelectorAll("#draw2GameCreationGuideSteps [data-game-guide-step]").length,
      text: document.querySelector("#draw2GameCreationGuide")?.textContent || "",
    }));
    assert.equal(creationGuide.visible, true, `${width}: Game creation guide exists`);
    assert.equal(creationGuide.steps, 4, `${width}: Game creation guide has four steps`);
    assert.match(creationGuide.text, /スターター/);
    assert.match(creationGuide.text, /素材を参照/);

    await page.locator('#draw2GameSceneList [data-game-track-id="hero"]').click();
    await page.locator('[data-workspace-command="game-panel-inspector"]').evaluate((element) => {
      element.click();
    });
    await page.waitForTimeout(100);
    const componentPanel = await page.evaluate(() => ({
      cards: document.querySelectorAll("#draw2GameComponents [data-game-component-type]").length,
      text: document.querySelector("#draw2GameComponents")?.textContent || "",
    }));
    assert.ok(componentPanel.cards >= 5, `${width}: component inspector cards`);
    assert.match(componentPanel.text, /Transform/);
    assert.match(componentPanel.text, /Collider/);
    assert.match(componentPanel.text, /Rigidbody/);

    await page.locator('[data-workspace-command="game-panel-assets"]').evaluate((element) => {
      element.click();
    });
    const assetBoundary = await page.evaluate(() => ({
      badge: document.querySelector("#draw2WorkspacePanelGameAssets .draw2-panel-badge")?.textContent || "",
      note: document.querySelector("#draw2WorkspacePanelGameAssets .draw2-panel-note")?.textContent || "",
      drawButton: document.querySelector("#draw2GameBindDraw")?.textContent || "",
      audioButton: document.querySelector("#draw2GameBindAudio")?.textContent || "",
      sourceEditControls: document.querySelectorAll('[data-game-source-editable="true"], [data-game-source-edit]').length,
    }));
    assert.equal(assetBoundary.badge, "REFERENCE ONLY", `${width}: Game Assets are reference-only`);
    assert.match(assetBoundary.note, /原素材の(?:編集|Edit)・削除はできません/);
    assert.match(assetBoundary.drawButton, /参照を(?:追加|Add)/);
    assert.match(assetBoundary.audioButton, /参照を(?:追加|Add)/);
    assert.equal(assetBoundary.sourceEditControls, 0, `${width}: no source edit controls in Game`);
    await page.locator('[data-workspace-command="game-panel-build"]').evaluate((element) => {
      element.click();
    });
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
