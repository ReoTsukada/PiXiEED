import assert from "node:assert/strict";
import { createRequire } from "node:module";

const requireFromScreenshots = createRequire(
  new URL("../tools/screenshots/package.json", import.meta.url),
);
const { chromium } = requireFromScreenshots("playwright");
const browser = await chromium.launch({ headless: true });

async function waitForGameInspector(page) {
  await page.locator('[data-workspace-command="game-panel-inspector"]').evaluate(
    (element) => element.click(),
  );
  await page.waitForSelector("#draw2GameEventMessage");
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error?.stack || error)));
  const firstUrl =
    "http://127.0.0.1:8000/pixiedraw2/?new_project=1&mode=GAME&igame=on";
  await page.goto(firstUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() =>
    document.querySelector("#draw2WorkspaceFrame")?.dataset.site400IgameRoute ===
      "ready"
  );
  const projectId = await page.evaluate(() =>
    String(window.__pixiedraw2WorkspaceDebug?.gameCurrentProject?.().projectId)
  );
  assert.match(projectId, /^draw2-project-/);
  assert.equal(
    await page.evaluate(() =>
      String(window.__pixiedraw2WorkspaceDebug?.gameCurrentProject?.().runtimeProfile?.profileId)
    ),
    "top-down-rpg",
    "Studio Project must bind the initial runtime profile",
  );

  await waitForGameInspector(page);
  assert.equal(
    await page.evaluate(() =>
      String(window.__pixiedraw2WorkspaceDebug?.gameCurrentProject?.().runtimeProfile?.profileId)
    ),
    "top-down-rpg",
    "reloaded Studio Project must retain the runtime profile",
  );
  await page.locator('button[data-game-track-id="enemy"]').first().click();
  await page.locator("#draw2GameEventMessage").fill("HELLO FROM GAME-351");
  await page.locator("#draw2GameEventApply").click();
  await page.waitForFunction(() =>
    (document.querySelector("#draw2GameEventStatus")?.textContent || "").includes(
      "Projectへ保存しました",
    )
  );
  await page.waitForFunction(() =>
    document.querySelector("#draw2WorkspaceFrame")?.dataset.gamePersistenceState ===
      "saved"
  );

  await page.locator('[data-workspace-command="game-panel-preview"]').evaluate(
    (element) => element.click(),
  );
  await page.locator("#draw2GamePreviewStart").click();
  await page.waitForFunction(() =>
    (document.querySelector("#draw2GamePreviewStatus")?.textContent || "").includes(
      "GAME-351 RPG",
    )
  );
  const canvas = page.locator("#draw2GamePreviewCanvas");
  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await page.waitForFunction(() =>
    document.querySelector("#draw2GamePreviewCanvas")?.dataset.game351Player ===
      "5,2"
  );
  await page.keyboard.press("Enter");
  await page.waitForFunction(() =>
    document.querySelector("#draw2GamePreviewCanvas")?.dataset.game351Dialogue ===
      "HELLO FROM GAME-351"
  );
  await page.locator("#draw2GamePreviewStop").click();
  await page.waitForFunction(() =>
    (document.querySelector("#draw2GamePreviewStatus")?.textContent || "").includes(
      "Runtime STOPPED",
    )
  );
  await page.locator("#draw2GamePreviewRestart").click();
  await page.waitForFunction(() =>
    document.querySelector("#draw2GamePreviewCanvas")?.dataset.game351Player ===
      "1,1"
  );

  const reloadUrl =
    `http://127.0.0.1:8000/pixiedraw2/?project=${encodeURIComponent(projectId)}&mode=GAME&igame=on`;
  await page.goto(reloadUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() =>
    document.querySelector("#draw2WorkspaceFrame")?.dataset.site400IgameRoute ===
      "ready"
  );
  await waitForGameInspector(page);
  await page.locator('button[data-game-track-id="enemy"]').first().click();
  assert.equal(
    await page.locator("#draw2GameEventMessage").inputValue(),
    "HELLO FROM GAME-351",
  );
  assert.deepEqual(pageErrors, [], "GAME-351 page errors");
  console.log("GAME-351 browser: event edit/play/stop/restart/reload and SITE-400 route passed");
  await page.close();

  const offPage = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await offPage.goto(
    `http://127.0.0.1:8000/pixiedraw2/?project=${encodeURIComponent(projectId)}&mode=GAME&igame=off`,
    { waitUntil: "domcontentloaded", timeout: 30_000 },
  );
  await offPage.waitForFunction(() =>
    document.querySelector("#draw2WorkspaceFrame")?.dataset.site400IgameRoute ===
      "off"
  );
  console.log("SITE-400 iGAME feature-off browser: safe stop passed");
  await offPage.close();
} finally {
  await browser.close();
}
