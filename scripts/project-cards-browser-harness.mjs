#!/usr/bin/env node
/** Synthetic-only localhost QA. No existing browser profiles, real works, or external requests.
 * Set PIXIEED_PLAYWRIGHT_MODULE and optional PIXIEED_CHROME_EXECUTABLE.
 * PIXIEED_BROWSER_ROOT chooses the checkout/build; PIXIEED_BROWSER_ARTIFACTS stays outside it.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
const root = resolve(process.env.PIXIEED_BROWSER_ROOT || fileURLToPath(new URL("..", import.meta.url)));
const output = process.env.PIXIEED_BROWSER_ARTIFACTS || "/tmp/pixieed-gallery-browser";
await mkdir(output, { recursive: true });
const { chromium, webkit } = await (process.env.PIXIEED_PLAYWRIGHT_MODULE ? import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href) : import("playwright"));
const engine = process.env.PIXIEED_BROWSER_ENGINE || "chromium";
const server = http.createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (path === "/__gallery") {
      res.setHeader("Content-Type", "text/html");
      return res.end('<!doctype html><html lang="ja"><meta name="viewport" content="width=device-width,initial-scale=1"><title>合成作品テスト</title><style>body{margin:0;background:#111c25}</style><main id="main"></main>');
    }
    let p = resolve(root, "." + path);
    if (!p.startsWith(root + "/")) throw Error();
    if ((await stat(p)).isDirectory()) p += "/index.html";
    res.setHeader("Content-Type", { ".mjs": "text/javascript", ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml" }[extname(p)] || "application/octet-stream");
    res.end(await readFile(p));
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const executablePath = engine === "webkit" ? process.env.PIXIEED_WEBKIT_EXECUTABLE : process.env.PIXIEED_CHROME_EXECUTABLE;
const browser = await { chromium, webkit }[engine].launch({ headless: true, timeout: 15e3, ...executablePath ? { executablePath } : {} });
const results = [];
async function seed(page, count = 120) {
  return page.evaluate(async (count2) => {
    const { createPxdProject, encodePxd } = await import("/js/creation/pxd-codec.mjs");
    const { putPxdSharedImage } = await import("/js/creation/pxd-project.mjs");
    const { summarizeProject } = await import("/js/creation/project-catalog.mjs");
    const rows = [];
    let totalBytes = 0;
    for (let i = 0; i < count2; i++) {
      const rgba = new Uint8Array(64 * 64 * 4);
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        let o = (y * 64 + x) * 4;
        rgba[o] = (Math.floor(x / 8) * 32 + i * 17) % 256;
        rgba[o + 1] = (Math.floor(y / 8) * 32 + i * 31) % 256;
        rgba[o + 2] = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? 180 : 40;
        rgba[o + 3] = 255;
      }
      let p = createPxdProject({ projectId: `synthetic-${i}`, revisionId: `synthetic-${i}-r0`, manifest: { title: `合成作品 ${String(i).padStart(3, "0")}`, createdAt: 17e11 + i, lastMode: "draw", toolProject: { tool: "draw", schemaVersion: 1 } } });
      p = await putPxdSharedImage(p, { width: 64, height: 64, rgba });
      const summary = await summarizeProject(p), history = [];
      for (let r = 0; r < 3; r++) {
        const revisionId = `synthetic-${i}-r${r}`;
        const bytes = await encodePxd({ ...p, revisionId });
        totalBytes += bytes.length;
        history.push({ projectId: p.projectId, revisionId, bytes, summary, updatedAt: 17e11 + i * 10 + r });
      }
      rows.push({ projectId: p.projectId, history });
    }
    const db = await new Promise((resolve2, reject) => {
      const r = indexedDB.open("pixieed-pxd-v1", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("projects", { keyPath: "projectId" });
      r.onsuccess = () => resolve2(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise((resolve2, reject) => {
      const tx = db.transaction("projects", "readwrite");
      for (const row of rows) tx.objectStore("projects").put(row);
      tx.oncomplete = resolve2;
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    return { projects: count2, revisionsPerProject: 3, image: "64x64 RGBA", payloadBytes: totalBytes };
  }, count);
}
async function mount(page) {
  await page.evaluate(async () => {
    const { mountProjectWorkspace } = await import("/js/creation/project-workspace.mjs");
    window.workspace = mountProjectWorkspace({ tool: "draw", getProject: (p) => p, openProject: async (p) => {
      window.__opened = p.projectId;
    }, routePointer: false });
    await workspace.ready;
  });
}
async function show(page) {
  await page.evaluate(() => workspace.showProjects());
  await page.waitForTimeout(40);
}
async function idle(page) {
  await page.waitForFunction(() => !workspace.busy);
  await page.waitForTimeout(40);
}
const cards = (page) => page.locator(".project-gallery .project-card");
async function selected(page, n) {
  await page.waitForFunction((n2) => document.querySelector("#project-delete-selected")?.textContent === (n2 ? `${n2}件を削除` : "削除する作品を選択"), n);
}
async function counts(page) {
  return page.evaluate(async () => {
    const r = await (await import("/js/creation/pxd-store.mjs")).createPxdStore().listProjects();
    return r.projects.map((p) => p.projectId);
  });
}
async function touch(page, cdp, kind) {
  const tile = cards(page).first();
  await tile.scrollIntoViewIfNeeded();
  const box = await tile.boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2, point = (id, dx = 0, dy = 0) => ({ id, x: x + dx, y: y + dy, radiusX: 2, radiusY: 2, force: 1 });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(1)] });
  if (kind === "move") await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point(1, 0, -40)] });
  if (kind === "multi") await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(1), point(2, 30)] });
  await page.waitForTimeout(kind === "hold" ? 1700 : 650);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(50);
}
async function fit(page) {
  const m = await page.locator("#pxd-panel").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth + 1, small: [...el.querySelectorAll("button,summary")].filter((n) => n.getClientRects().length && !n.hidden).map((n) => ({ id: n.id, w: n.getBoundingClientRect().width, h: n.getBoundingClientRect().height })).filter((r2) => r2.w < 43 || r2.h < 43) };
  });
  assert.ok(m.left >= 0 && m.top >= 0 && m.right <= m.width + 1 && m.bottom <= m.height + 1, JSON.stringify(m));
  assert.equal(m.overflow, false);
  assert.deepEqual(m.small, []);
}
try {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }].filter((v) => !process.env.PIXIEED_ACTUAL_ONLY && (!process.env.PIXIEED_TEST_WIDTH || v.width === Number(process.env.PIXIEED_TEST_WIDTH)))) {
    const context = await browser.newContext({ viewport, hasTouch: true });
    await context.route("**/*", (r) => new URL(r.request().url()).origin === base ? r.continue() : r.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(1e4);
    const checks = [], errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const label = `${engine}-${viewport.width}`;
    try {
      await page.goto(base + "/__gallery");
      await Promise.race([seed(page), new Promise((_, reject) => setTimeout(() => reject(Error("Synthetic fixture seeding timed out")), 3e4))]);
      await mount(page);
      await show(page);
      await cards(page).first().waitFor();
      await fit(page);
      assert.ok(await cards(page).count() < 120);
      checks.push("bounded viewport DOM; responsive sheet and 44px controls");
      const initialCards = await cards(page).count();
      await page.setViewportSize({ width: viewport.width, height: viewport.height + 400 });
      await page.waitForFunction(initial => document.querySelectorAll('.project-gallery .project-card').length > initial, initialCards);
      await fit(page);
      const coverage = await page.locator('.project-gallery').evaluate(list => {
        const dialog = document.querySelector('#pxd-panel').getBoundingClientRect();
        const bottom = Math.max(...[...list.querySelectorAll('.project-card')].map(card => card.getBoundingClientRect().bottom));
        return bottom >= Math.min(dialog.bottom, list.getBoundingClientRect().bottom) - 4;
      });
      assert.equal(coverage, true, 'height-only resize renders through the visible lower rows');
      await page.setViewportSize(viewport);
      await page.waitForTimeout(60);
      checks.push('height-only viewport growth refreshes virtual rows without blank lower space');
      await page.screenshot({ path: `${output}/${label}-grid.png` });
      await page.locator("#project-search").fill("no-such-work");
      await page.waitForTimeout(40);
      assert.equal(await cards(page).count(), 0);
      assert.equal(await page.locator(".project-list__empty:not([hidden])").count(), 1);
      await page.locator("#project-search").fill("");
      await cards(page).first().waitFor();
      checks.push("search no matches and clearing recovers gallery");
      await page.locator("#pxd-panel").evaluate((n) => n.scrollTop = n.scrollHeight);
      await page.waitForTimeout(60);
      assert.ok(await page.locator('[data-project-id="synthetic-0"]').count());
      assert.ok(await cards(page).count() < 120);
      await page.locator("#pxd-panel").evaluate((n) => n.scrollTop = 0);
      await page.waitForTimeout(60);
      checks.push("large gallery scroll mounts final work without growing DOM");
      if (engine === "chromium") {
        const cdp = await context.newCDPSession(page);
        for (const kind of ["move", "multi"]) {
          await touch(page, cdp, kind);
          assert.notEqual(await page.locator(".project-gallery").getAttribute("data-selecting"), "true");
          assert.equal(await page.locator("#pxd-panel").evaluate((n) => n.open), true);
        }
        await touch(page, cdp, "hold");
        await selected(page, 1);
        assert.equal(await page.locator(".project-delete-dialog").count(), 0);
        await page.waitForTimeout(1050);
        await cdp.detach();
        checks.push("real touch move/multitouch cancel long press; long press enters selection without opening/deleting");
      } else {
        await page.locator("#project-select").click();
        await cards(page).first().click();
        await selected(page, 1);
      }
      await cards(page).nth(1).click();
      await selected(page, 2);
      await cards(page).nth(1).click();
      await selected(page, 1);
      await page.locator("#project-select-all").click();
      await selected(page, 120);
      await page.locator("#project-select-all").click();
      await selected(page, 0);
      assert.equal(await page.locator("#project-delete-selected").isDisabled(), true);
      await page.locator("#project-select-cancel").click();
      checks.push("multi-select toggle, select all, clear all, zero selection disables delete");
      await cards(page).first().focus();
      await page.keyboard.press("Space");
      await selected(page, 1);
      await page.keyboard.press("Space");
      await selected(page, 0);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.projectId), "synthetic-119");
      await page.keyboard.press("Space");
      await selected(page, 1);
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(50);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.projectId), "synthetic-118");
      await page.keyboard.press("End");
      await page.waitForTimeout(50);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.projectId), "synthetic-0");
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#pxd-panel").evaluate((n) => n.open), true);
      assert.equal(await page.locator(".project-gallery").getAttribute("data-selecting"), "false");
      await page.locator("#pxd-panel").evaluate((n) => n.scrollTop = 0);
      await page.waitForTimeout(50);
      checks.push("Space selection; Arrow/End navigation across virtual rows; Escape cancels selection only");
      await page.locator("#project-select").click();
      await cards(page).nth(0).click();
      await cards(page).nth(1).click();
      await selected(page, 2);
      await page.screenshot({ path: `${output}/${label}-selection.png` });
      await page.locator("#project-delete-selected").click();
      await page.locator("#project-delete-confirm").waitFor();
      assert.match(await page.locator("#project-delete-description").textContent(), /元に戻せません/);
      assert.equal(await page.locator("#project-delete-cancel").evaluate((n) => n === document.activeElement), true);
      await page.screenshot({ path: `${output}/${label}-delete-confirm.png` });
      await page.locator("#project-delete-cancel").click();
      await idle(page);
      assert.equal((await counts(page)).length, 120);
      checks.push("explicit irreversible two-work confirmation defaults to Cancel; cancel preserves all works");
      await page.evaluate(async () => {
        const store = (await import("/js/creation/pxd-store.mjs")).createPxdStore();
        const p = await store.load("synthetic-119");
        p.manifest.title += " 別タブ更新";
        await store.save(p, { expectedRevisionId: p.revisionId });
      });
      await page.locator("#project-delete-selected").click();
      await page.locator("#project-delete-confirm").click();
      await idle(page);
      assert.equal((await counts(page)).length, 120);
      await selected(page, 2);
      await show(page);
      checks.push("stale selected revision from another tab preserves the entire multi-selection");
      await page.evaluate(() => {
        window.originalDelete = IDBObjectStore.prototype.delete;
        IDBObjectStore.prototype.delete = function() {
          throw new DOMException("synthetic failure", "UnknownError");
        };
      });
      await page.locator("#project-delete-selected").click();
      await page.locator("#project-delete-confirm").click();
      await idle(page);
      await page.evaluate(() => IDBObjectStore.prototype.delete = originalDelete);
      assert.equal((await counts(page)).length, 120);
      await selected(page, 2);
      checks.push("write failure preserves every work and selection for retry");
      await page.locator("#project-delete-selected").click();
      await page.locator("#project-delete-confirm").click();
      await idle(page);
      assert.equal((await counts(page)).length, 118);
      assert.equal(await page.locator(".project-trash").count(), 0);
      checks.push("explicit confirmation permanently removes only two selected works; no recovery UI");
      await cards(page).first().click();
      await page.waitForFunction(() => !document.querySelector("#pxd-panel").open);
      assert.equal(await page.evaluate(() => workspace.currentProject.projectId), "synthetic-117");
      await show(page);
      await page.locator("#project-select").click();
      await page.locator('[data-project-id="synthetic-117"]').click();
      await page.evaluate(() => {
        window.originalDelete = IDBObjectStore.prototype.delete;
        IDBObjectStore.prototype.delete = function() {
          throw new DOMException("synthetic failure", "UnknownError");
        };
      });
      await page.locator("#project-delete-selected").click();
      await page.locator("#project-delete-confirm").click();
      await idle(page);
      await page.evaluate(() => IDBObjectStore.prototype.delete = originalDelete);
      assert.equal(await page.evaluate(() => workspace.currentProject.projectId), "synthetic-117");
      assert.equal(await page.evaluate(() => __opened), "synthetic-117");
      assert.equal((await counts(page)).length, 118);
      checks.push("active-work delete write failure restores original canvas and saved identity");
      await page.locator("#project-delete-selected").click();
      await page.locator("#project-delete-confirm").click();
      await idle(page);
      assert.equal((await counts(page)).length, 117);
      assert.notEqual(await page.evaluate(() => workspace.currentProject.projectId), "synthetic-117");
      checks.push("normal tap opens work; deleting active work safely replaces current canvas");
      await page.locator("#project-close").click();
      await page.evaluate(() => {
        window.originalGetAll = IDBObjectStore.prototype.getAll;
        IDBObjectStore.prototype.getAll = function(...args) {
          if (this.name === "project-catalog") throw new DOMException("synthetic read error", "UnknownError");
          return originalGetAll.apply(this, args);
        };
      });
      await show(page);
      await page.locator("#project-list-retry").waitFor();
      await page.evaluate(() => IDBObjectStore.prototype.getAll = originalGetAll);
      await page.locator("#project-list-retry").click();
      await cards(page).first().waitFor();
      await fit(page);
      checks.push("read failure displays retry; retry restores gallery");
      assert.deepEqual(errors.filter((message) => message !== "synthetic failure"), []);
      results.push({ label, passed: true, checks });
      console.log(label, "PASS", checks.length);
    } catch (error) {
      await page.screenshot({ path: `${output}/${label}-failure.png` }).catch(() => {
      });
      results.push({ label, passed: false, checks, error: error.stack, errors });
      console.error(label, error.stack);
    } finally {
      await context.close();
    }
  }
  if (engine === "chromium" && (!process.env.PIXIEED_TEST_WIDTH || process.env.PIXIEED_ACTUAL_ONLY || process.env.PIXIEED_INCLUDE_ACTUAL)) {
    const emptyContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await emptyContext.route("**/*", (r) => new URL(r.request().url()).origin === base ? r.continue() : r.abort());
    const emptyPage = await emptyContext.newPage();
    emptyPage.setDefaultTimeout(15e3);
    try {
      await emptyPage.goto(base + "/draw/?workspace=1");
      await emptyPage.waitForFunction(() => document.documentElement.dataset.creationModesReady === "true" && !document.querySelector("#main").inert);
      await emptyPage.locator("#creation-file-open").click();
      await emptyPage.locator(".project-list__empty:not([hidden])").waitFor();
      assert.equal(await emptyPage.locator("#project-search").isVisible(), false);
      assert.equal(await emptyPage.locator("#creation-file-image-open").isVisible(), false);
      assert.equal(await emptyPage.locator("#creation-project-save-scope").isVisible(), false);
      await emptyPage.locator("#project-tab-current").click();
      assert.equal(await emptyPage.locator("#creation-file-image-open").isVisible(), true);
      assert.equal(await emptyPage.locator("#creation-project-save-scope").isVisible(), true);
      await emptyPage.locator("#project-close").click();
      await emptyPage.locator('#draw-palette [data-color-index="0"]').click();
      const rect = await emptyPage.locator("#draw-canvas").boundingBox();
      await emptyPage.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
      await emptyPage.locator("#creation-file-open").click();
      await emptyPage.locator(".project-gallery .project-card").first().waitFor();
      assert.equal(await emptyPage.locator(".project-list__empty:not([hidden])").count(), 0);
      assert.equal(await emptyPage.locator("#project-search").isVisible(), true);
      results.push({ label: "actual-empty-autosave", passed: true, checks: ["empty gallery remains usable; autosave adds first drawing while open; image import and explanatory notes only in current-work tab"] });
      console.log("actual-empty-autosave PASS");
    } catch (error) {
      await emptyPage.screenshot({ path: `${output}/actual-empty-failure.png` }).catch(() => {
      });
      results.push({ label: "actual-empty-autosave", passed: false, error: error.stack });
      console.error(error.stack);
    } finally {
      await emptyContext.close();
    }
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await context.route("**/*", (r) => new URL(r.request().url()).origin === base ? r.continue() : r.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(2e4);
    const checks = [], errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await page.goto(base + "/__gallery");
      await seed(page, 12);
      await page.goto(base + "/draw/?workspace=1");
      await page.waitForFunction(() => document.documentElement.dataset.creationModesReady === "true" && !document.querySelector("#main").inert);
      await page.locator("#creation-file-open").click();
      await cards(page).first().waitFor();
      await fit(page);
      await page.screenshot({ path: `${output}/actual-draw-390-grid.png` });
      await page.locator('[data-project-id="synthetic-11"]').click();
      await page.waitForFunction(() => !document.querySelector("#pxd-panel").open && !document.querySelector("#main").inert);
      assert.deepEqual(await page.locator("#draw-canvas").evaluate((n) => [n.width, n.height]), [64, 64]);
      checks.push("real /draw/ shell opens gallery and synthetic 64px work");
      const image = () => page.evaluate(async () => {
        const p = await (await import("/js/creation/pxd-store.mjs")).createPxdStore().load("synthetic-11");
        const im = await (await import("/js/creation/pxd-project.mjs")).readPxdImage(p);
        return Array.from(im.rgba);
      });
      const before = await image();
      await page.locator('#draw-palette [data-color-index="-1"]').click();
      const box = await page.locator("#draw-canvas").boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForFunction(() => document.querySelector("#project-open").dataset.state === "editing");
      await page.locator("#creation-file-open").click();
      await cards(page).first().waitFor();
      await page.locator("#project-select").click();
      await page.locator('[data-project-id="synthetic-10"]').click();
      await page.locator("#project-delete-selected").click();
      await page.locator("#project-delete-confirm").click();
      await page.waitForFunction(() => document.querySelector("#project-open").dataset.state === "saved");
      assert.notDeepEqual(await image(), before);
      assert.equal(await page.evaluate(async () => await (await import("/js/creation/pxd-store.mjs")).createPxdStore().load("synthetic-10")), null);
      checks.push("deleting another work during dirty-editor autosave preserves the edit and current identity");
      await fit(page);
      assert.deepEqual(errors, []);
      results.push({ label: "actual-draw-390", passed: true, checks });
      console.log("actual-draw-390 PASS");
    } catch (error) {
      await page.screenshot({ path: `${output}/actual-draw-390-failure.png` }).catch(() => {
      });
      results.push({ label: "actual-draw-390", passed: false, checks, error: error.stack, errors });
      console.error(error.stack);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.close();
  await writeFile(`${output}/results.json`, JSON.stringify({ browser: engine, physicalDevices: "UNTESTED; viewport/touch emulation only", results }, null, 2));
}
if (results.some((r) => !r.passed)) process.exitCode = 1;
