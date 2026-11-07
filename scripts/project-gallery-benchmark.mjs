#!/usr/bin/env node
/** Synthetic-only localhost QA. No existing browser profiles, real works, or external requests.
 * Set PIXIEED_PLAYWRIGHT_MODULE and optional PIXIEED_CHROME_EXECUTABLE.
 * PIXIEED_BROWSER_ROOT chooses the checkout/build; PIXIEED_BROWSER_ARTIFACTS stays outside it.
 */
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await (process.env.PIXIEED_PLAYWRIGHT_MODULE ? import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href) : import("playwright"));
const root = resolve(process.argv[2] || "."), label = process.argv[3] || "gallery", out = process.env.PIXIEED_BROWSER_ARTIFACTS || "/tmp/pixieed-gallery-benchmark";
await mkdir(out, { recursive: true });
const server = http.createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (path === "/__gallery") {
      res.setHeader("Content-Type", "text/html");
      return res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>合成作品テスト</title><style>body{margin:0;background:#111c25}</style><main id="main"></main>');
    }
    const p = resolve(root, "." + path);
    if (!p.startsWith(root + "/")) throw Error();
    res.setHeader("Content-Type", { ".mjs": "text/javascript", ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml" }[extname(p)] || "application/octet-stream");
    res.end(await readFile(p));
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ ...process.env.PIXIEED_CHROME_EXECUTABLE ? { executablePath: process.env.PIXIEED_CHROME_EXECUTABLE } : {}, headless: true, args: ["--enable-precise-memory-info"] });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await context.route("**/*", (r) => new URL(r.request().url()).origin === base ? r.continue() : r.abort());
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await page.goto(base + "/__gallery");
  const fixture = await page.evaluate(async () => {
    const { createPxdProject, encodePxd } = await import("/js/creation/pxd-codec.mjs");
    const { putPxdSharedImage } = await import("/js/creation/pxd-project.mjs");
    const { summarizeProject } = await import("/js/creation/project-catalog.mjs");
    const rows = [];
    let totalBytes = 0;
    for (let i = 0; i < 200; i++) {
      const rgba = new Uint8Array(64 * 64 * 4);
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        let o = (y * 64 + x) * 4;
        rgba[o] = (x * 4 + i * 17) % 256;
        rgba[o + 1] = (y * 4 + i * 31) % 256;
        rgba[o + 2] = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? 180 : 40;
        rgba[o + 3] = 255;
      }
      let p = createPxdProject({ projectId: `synthetic-${i}`, revisionId: `synthetic-${i}-r0`, manifest: { title: `合成作品 ${String(i).padStart(3, "0")}`, createdAt: 17e11 + i, lastMode: "draw", toolProject: { tool: "draw", schemaVersion: 1 } } });
      p = await putPxdSharedImage(p, { width: 64, height: 64, rgba });
      const summary = await summarizeProject(p), history = [];
      for (let r = 0; r < 10; r++) {
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
    return { projects: 200, revisionsPerProject: 10, image: "64x64 RGBA", payloadBytes: totalBytes };
  });
  console.log("seed", fixture);
  await page.evaluate(() => {
    window.__metrics = { requests: {}, returnedBinaryBytes: 0, rows: 0 };
    function bytes(v) {
      if (v instanceof ArrayBuffer) return v.byteLength;
      if (ArrayBuffer.isView(v)) return v.byteLength;
      if (Array.isArray(v)) return v.reduce((s, x) => s + bytes(x), 0);
      if (v && typeof v === "object") return Object.values(v).reduce((s, x) => s + bytes(x), 0);
      return 0;
    }
    for (const method of ["get", "getAll", "openCursor"]) {
      const orig = IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method] = function(...args) {
        const q = window.__metrics, key = this.name + "." + method;
        q.requests[key] = (q.requests[key] || 0) + 1;
        const r = orig.apply(this, args);
        r.addEventListener("success", () => {
          const v = method === "openCursor" ? r.result?.value : r.result;
          q.returnedBinaryBytes += bytes(v);
          q.rows += Array.isArray(v) ? v.length : v ? 1 : 0;
        });
        return r;
      };
    }
  });
  await page.evaluate(async () => {
    const { mountProjectWorkspace } = await import("/js/creation/project-workspace.mjs");
    window.workspace = mountProjectWorkspace({ tool: "draw", getProject: (p) => p, openProject: async (p) => {
      window.__opened = p.projectId;
    }, routePointer: false });
    await workspace.ready;
  });
  await page.waitForFunction(() => [...document.querySelectorAll('link[rel="stylesheet"]')].every((link) => Boolean(link.sheet)));
  const runs = [];
  for (let run = 0; run < 3; run++) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("HeapProfiler.collectGarbage");
    await cdp.detach();
    const measurement = await page.evaluate(async () => {
      __metrics = { requests: {}, returnedBinaryBytes: 0, rows: 0 };
      const heapBefore = performance.memory?.usedJSHeapSize, t = performance.now();
      const pending = workspace.showProjects();
      const dialogMs = performance.now() - t;
      let firstCardsMs = null;
      const probe = () => {
        if (document.querySelector(".project-list .project-card")) firstCardsMs = performance.now() - t;
        else requestAnimationFrame(probe);
      };
      requestAnimationFrame(probe);
      await pending;
      const listReadyMs = performance.now() - t;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { dialogMs, listReadyMs, firstCardsMs, heapBefore, heapAfter: performance.memory?.usedJSHeapSize, dom: document.querySelectorAll("#pxd-panel *").length, cards: document.querySelectorAll("#project-library-pane > .project-list .project-card").length, idb: structuredClone(__metrics) };
    });
    // Separate post-layout counts from the first-card and list timing samples.
    await page.waitForTimeout(80);
    measurement.settled = await page.evaluate(() => ({
      dom: document.querySelectorAll('#pxd-panel *').length,
      cards: document.querySelectorAll('#project-library-pane > .project-list .project-card').length
    }));
    runs.push(measurement);
    console.log(label, run, measurement);
    await page.screenshot({ path: `${out}/${label}-${run}.png` });
    await page.locator("#project-close").click();
  }
  await writeFile(`${out}/${label}.json`, JSON.stringify({ label, fixture, runs, browser: browser.version(), note: "Isolated project-workspace module, real Chrome desktop engine, touch emulation 390x844. First run includes legacy DB migration if implemented. Binary bytes counted from IDB read results, not total structured clone strings." }, null, 2));
  await context.close();
} finally {
  await browser.close();
  server.close();
}
