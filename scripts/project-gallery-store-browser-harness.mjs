#!/usr/bin/env node
/** Synthetic-only localhost QA. No existing browser profiles, real works, or external requests.
 * Set PIXIEED_PLAYWRIGHT_MODULE and optional PIXIEED_CHROME_EXECUTABLE.
 * PIXIEED_BROWSER_ROOT chooses the checkout/build; PIXIEED_BROWSER_ARTIFACTS stays outside it.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
const { chromium } = await (process.env.PIXIEED_PLAYWRIGHT_MODULE ? import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href) : import("playwright"));
const root = resolve(process.env.PIXIEED_BROWSER_ROOT || fileURLToPath(new URL("..", import.meta.url))), out = process.env.PIXIEED_BROWSER_ARTIFACTS || "/tmp/pixieed-gallery-store-browser";
await (await import("node:fs/promises")).mkdir(out, { recursive: true });
const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/__qa") {
      res.setHeader("Content-Type", "text/html");
      return res.end("<main>合成データだけの保存テスト</main>");
    }
    const p = resolve(root, "." + path);
    if (!p.startsWith(root + "/")) throw Error();
    res.setHeader("Content-Type", extname(p) === ".mjs" ? "text/javascript" : "text/plain");
    res.end(await readFile(p));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ ...process.env.PIXIEED_CHROME_EXECUTABLE ? { executablePath: process.env.PIXIEED_CHROME_EXECUTABLE } : {}, headless: true });
const results = [];
try {
  const context = await browser.newContext();
  await context.route("**/*", (r) => new URL(r.request().url()).origin === base ? r.continue() : r.abort());
  const page = await context.newPage();
  await page.goto(base + "/__qa");
  const result = await page.evaluate(async () => {
    const { createPxdProject, encodePxd } = await import("/js/creation/pxd-codec.mjs"), { summarizeProject } = await import("/js/creation/project-catalog.mjs");
    const rows = [];
    for (let i = 0; i < 4; i++) {
      const history = [];
      for (let r = 0; r < 3; r++) {
        const p = createPxdProject({ projectId: `qa-${i}`, revisionId: `qa-${i}-r${r}`, manifest: { title: `保存テスト${i}`, toolProject: { tool: "draw", schemaVersion: 1 }, lastMode: "draw", createdAt: 17e11 } });
        history.push({ projectId: p.projectId, revisionId: p.revisionId, bytes: await encodePxd(p), updatedAt: 17e11 + r, ...i === 3 ? {} : { summary: await summarizeProject(p) } });
      }
      rows.push({ projectId: `qa-${i}`, history, ...i === 2 ? { deletedAt: 1700000001e3 } : {} });
    }
    window.oldDb = await new Promise((resolve2, reject) => {
      const r = indexedDB.open("pixieed-pxd-v1", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("projects", { keyPath: "projectId" });
      r.onsuccess = () => resolve2(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise((resolve2, reject) => {
      const tx = oldDb.transaction("projects", "readwrite");
      for (const row of rows) tx.objectStore("projects").put(row);
      tx.oncomplete = resolve2;
      tx.onabort = () => reject(tx.error);
    });
    window.before = rows.map((row) => ({ projectId: row.projectId, deletedAt: row.deletedAt ?? null, revisions: row.history.map((r) => ({ revisionId: r.revisionId, bytes: Array.from(r.bytes) })) }));
    const { createPxdStore } = await import("/js/creation/pxd-store.mjs");
    window.store = createPxdStore();
    let blocked;
    try {
      await store.listProjects();
      blocked = "unexpected success";
    } catch (e) {
      blocked = e.code;
    }
    oldDb.close();
    await new Promise((r) => setTimeout(r, 30));
    const list = await store.listProjects({ includeDeleted: true });
    window.db = await new Promise((resolve2, reject) => {
      const r = indexedDB.open("pixieed-pxd-v1");
      r.onsuccess = () => resolve2(r.result);
      r.onerror = () => reject(r.error);
    });
    async function all() {
      return new Promise((resolve2, reject) => {
        const tx = db.transaction("projects", "readonly");
        const r = tx.objectStore("projects").getAll();
        r.onsuccess = () => resolve2(r.result.map((row) => ({ projectId: row.projectId, deletedAt: row.deletedAt ?? null, revisions: row.history.map((r2) => ({ revisionId: r2.revisionId, bytes: Array.from(r2.bytes) })) })));
        r.onerror = () => reject(r.error);
      });
    }
    window.readAll = all;
    const afterMigration = await all();
    const catalog = await new Promise((resolve2, reject) => {
      const r = db.transaction("project-catalog", "readonly").objectStore("project-catalog").getAll();
      r.onsuccess = () => resolve2(r.result);
      r.onerror = () => reject(r.error);
    });
    return { blocked, version: db.version, listed: list.projects.length, errors: list.errors, before, afterMigration, catalogHasBytes: catalog.some((r) => "bytes" in r || "history" in r), missingSummaryRepaired: catalog.find((r) => r.projectId === "qa-3")?.summary?.name };
  });
  assert.equal(result.blocked, "PXD_IDB_BLOCKED");
  assert.equal(result.version, 3);
  assert.equal(result.listed, 4);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.before, result.afterMigration);
  assert.equal(result.catalogHasBytes, false);
  assert.equal(result.missingSummaryRepaired, "保存テスト3");
  results.push("v1 blocked upgrade reports error, same store retry after old connection close succeeds; 4 works × 3 revisions + preexisting trash bytes preserved; absent summary rebuilt; catalog contains no bytes/history");
  const stale = await page.evaluate(async () => {
    const { createToolProjectStore } = await import("/js/creation/tool-project-store.mjs");
    window.toolStore = createToolProjectStore("draw");
    try {
      await toolStore.purgeProjects([{ projectId: "qa-0", expectedRevisionId: "qa-0-r2" }, { projectId: "qa-1", expectedRevisionId: "qa-1-r1" }]);
      return { code: "unexpected success" };
    } catch (e) {
      return { code: e.code, rows: await readAll() };
    }
  });
  assert.equal(stale.code, "PXD_STORE_CONFLICT");
  assert.deepEqual(stale.rows, result.before);
  results.push("stale revision in multi-purge leaves all selected and unrelated rows/revisions intact");
  const failed = await page.evaluate(async () => {
    const original = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function() {
      throw new DOMException("Synthetic write failure", "UnknownError");
    };
    let code;
    try {
      await toolStore.purgeProjects([{ projectId: "qa-0", expectedRevisionId: "qa-0-r2" }, { projectId: "qa-1", expectedRevisionId: "qa-1-r2" }]);
      code = "unexpected success";
    } catch (e) {
      code = e.code;
    } finally {
      IDBObjectStore.prototype.delete = original;
    }
    return { code, rows: await readAll() };
  });
  assert.notEqual(failed.code, "unexpected success");
  assert.deepEqual(failed.rows, result.before);
  results.push("synthetic write failure rolls back every selected row");
  const purge = await page.evaluate(async () => {
    await toolStore.purgeProjects([{ projectId: "qa-0", expectedRevisionId: "qa-0-r2" }, { projectId: "qa-1", expectedRevisionId: "qa-1-r2" }]);
    return { rows: await readAll(), catalog: (await store.listProjects({ includeDeleted: true })).projects.map((r) => r.projectId) };
  });
  assert.deepEqual(purge.rows, result.before.filter((r) => ["qa-2", "qa-3"].includes(r.projectId)));
  assert.deepEqual(purge.catalog.sort(), ["qa-2", "qa-3"]);
  results.push("confirmed synthetic multi-purge removes all histories and catalog entries of only selected works, retains old trash and unrelated project");
  const resurrection = await page.evaluate(async () => {
    const { createPxdProject } = await import("/js/creation/pxd-codec.mjs");
    const p = createPxdProject({ projectId: "qa-0", manifest: { title: "古いタブ", toolProject: { tool: "draw", schemaVersion: 1 } } });
    try {
      await toolStore.save(p, { expectedRevisionId: null });
      return "unexpected success";
    } catch (e) {
      return e.code;
    }
  });
  assert.equal(resurrection, "PXD_PROJECT_DELETED");
  results.push("minimal purge tombstone rejects stale unsaved tab recreation with expectedRevisionId null");
  await context.close();
  const migrationContext = await browser.newContext();
  const migrationPage = await migrationContext.newPage();
  await migrationPage.goto(base + "/__qa");
  const rollback = await migrationPage.evaluate(async (before2) => {
    const rows = before2.map((r) => ({ projectId: r.projectId, ...r.deletedAt ? { deletedAt: r.deletedAt } : {}, history: r.revisions.map((h) => ({ projectId: r.projectId, revisionId: h.revisionId, bytes: new Uint8Array(h.bytes), updatedAt: 17e11 })) }));
    let db2 = await new Promise((resolve2, reject) => {
      const r = indexedDB.open("pixieed-pxd-v1", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("projects", { keyPath: "projectId" });
      r.onsuccess = () => resolve2(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise((resolve2, reject) => {
      const t = db2.transaction("projects", "readwrite");
      rows.forEach((row) => t.objectStore("projects").put(row));
      t.oncomplete = resolve2;
      t.onabort = () => reject(t.error);
    });
    db2.close();
    const store2 = (await import("/js/creation/pxd-store.mjs")).createPxdStore();
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) {
      if (this.name === "project-catalog") throw new DOMException("synthetic migration failure", "UnknownError");
      return original.apply(this, args);
    };
    let error;
    try {
      await store2.listProjects();
    } catch (e) {
      error = e.code;
    } finally {
      IDBObjectStore.prototype.put = original;
    }
    db2 = await new Promise((resolve2, reject) => {
      const r = indexedDB.open("pixieed-pxd-v1", 1);
      r.onsuccess = () => resolve2(r.result);
      r.onerror = () => reject(r.error);
    });
    const version = db2.version, hasCatalog = db2.objectStoreNames.contains("project-catalog");
    const after = await new Promise((resolve2) => {
      const r = db2.transaction("projects", "readonly").objectStore("projects").getAll();
      r.onsuccess = () => resolve2(r.result.map((row) => ({ projectId: row.projectId, deletedAt: row.deletedAt ?? null, revisions: row.history.map((h) => ({ revisionId: h.revisionId, bytes: Array.from(h.bytes) })) })));
    });
    db2.close();
    const list = await store2.listProjects({ includeDeleted: true });
    return { error, version, hasCatalog, after, listed: list.projects.length };
  }, result.before);
  assert.equal(rollback.error, "PXD_IDB_OPEN_FAILED");
  assert.equal(rollback.version, 1);
  assert.equal(rollback.hasCatalog, false);
  assert.deepEqual(rollback.after, result.before);
  assert.equal(rollback.listed, 4);
  results.push("synthetic catalog migration write failure rolls back schema to v1 and preserves exact history bytes; same-store retry succeeds");
  await migrationContext.close();
  const scopeContext = await browser.newContext();
  const scopePage = await scopeContext.newPage();
  await scopePage.goto(base + '/__qa');
  const scoped = await scopePage.evaluate(async () => {
    const { createPxdProject, encodePxd } = await import('/js/creation/pxd-codec.mjs');
    const { summarizeProject } = await import('/js/creation/project-catalog.mjs');
    const seed = [];
    for (const [id, tool, legacy] of [['own', 'draw', false], ['foreign', 'audio', false], ['untagged', null, false], ['legacy', 'audio', true], ['deleted', 'draw', false]]) {
      const project = createPxdProject({ projectId: id, revisionId: `${id}-r1`, manifest: tool ? { toolProject: { tool, schemaVersion: 1 } } : {} });
      seed.push({ projectId: id, history: [{ projectId: id, revisionId: project.revisionId, bytes: await encodePxd(project), ...legacy ? {} : { summary: await summarizeProject(project) } }], ...id === 'deleted' ? { deletedAt: 10 } : {} });
    }
    let db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('pixieed-pxd-v1', 2);
      r.onupgradeneeded = () => { r.result.createObjectStore('projects', { keyPath: 'projectId' }); r.result.createObjectStore('project-catalog', { keyPath: 'projectId' }); };
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['projects', 'project-catalog'], 'readwrite');
      for (const row of seed) {
        tx.objectStore('projects').put(row);
        tx.objectStore('project-catalog').put({ projectId: row.projectId, revisionId: row.history[0].revisionId, summary: row.history[0].summary ?? null, ...row.deletedAt ? { deletedAt: row.deletedAt } : {} });
      }
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
    });
    db.close();
    const { createPxdStore } = await import('/js/creation/pxd-store.mjs');
    const store = createPxdStore();
    const calls = [];
    const get = IDBObjectStore.prototype.get, getAll = IDBObjectStore.prototype.getAll;
    const keyCursor = IDBIndex.prototype.openKeyCursor;
    const indexKeys = IDBIndex.prototype.getAllKeys;
    IDBIndex.prototype.openKeyCursor = function() { throw Error('Scoped queries must batch keys, not walk hidden works'); };
    IDBIndex.prototype.getAllKeys = function(...args) { calls.push(['gallery-owner', 'getAllKeys', args[0] ?? null]); return indexKeys.apply(this, args); };
    IDBObjectStore.prototype.get = function(id) { calls.push([this.name, 'get', id]); return get.call(this, id); };
    IDBObjectStore.prototype.getAll = function(...args) { calls.push([this.name, 'getAll']); return getAll.apply(this, args); };
    let initial, again, imports, failure, retry;
    try {
      initial = await store.listProjects({ tool: 'draw', source: 'owned' });
      const initialReads = calls.splice(0);
      again = await store.listProjects({ tool: 'draw', source: 'owned' });
      const againReads = calls.splice(0);
      imports = await store.listProjects({ tool: 'draw', source: 'imports' });
      const importReads = calls.splice(0);
      const originalKeys = IDBIndex.prototype.getAllKeys;
      IDBIndex.prototype.getAllKeys = function() { throw new DOMException('synthetic read failure', 'UnknownError'); };
      try { await store.listProjects({ tool: 'draw', source: 'owned' }); } catch (e) { failure = e.name; }
      finally { IDBIndex.prototype.getAllKeys = originalKeys; }
      retry = await store.listProjects({ tool: 'draw', source: 'owned', includeDeleted: true });
      db = await new Promise((resolve) => { const r = indexedDB.open('pixieed-pxd-v1'); r.onsuccess = () => resolve(r.result); });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('project-catalog', 'readwrite');
        const catalog = tx.objectStore('project-catalog'); const r = catalog.get('own');
        r.onsuccess = () => { const row = r.result; delete row.galleryOwner; catalog.put(row); };
        tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
      });
      const missingOwner = await store.listProjects({ tool: 'draw', source: 'owned' });
      const after = await new Promise(resolve => { const r = db.transaction('projects').objectStore('projects').getAll(); r.onsuccess = () => resolve(r.result); });
      const catalog = await new Promise(resolve => { const r = db.transaction('project-catalog').objectStore('project-catalog').getAll(); r.onsuccess = () => resolve(r.result); });
      db.close();
      return { missingOwner: missingOwner.projects.map(x => x.projectId), initial: initial.projects.map(x => x.projectId), again: again.projects.map(x => x.projectId), imports: imports.projects.map(x => x.projectId).sort(), retry: retry.projects.map(x => x.projectId).sort(), initialReads, againReads, importReads, failure, preserved: JSON.stringify(after.sort((a,b) => a.projectId.localeCompare(b.projectId))) === JSON.stringify(seed.sort((a,b) => a.projectId.localeCompare(b.projectId))), owners: catalog.map(x => [x.projectId, x.galleryOwner]) };
    } finally { IDBObjectStore.prototype.get = get; IDBObjectStore.prototype.getAll = getAll; IDBIndex.prototype.openKeyCursor = keyCursor; IDBIndex.prototype.getAllKeys = indexKeys; }
  });
  assert.deepEqual(scoped.initial, ['own']);
  assert.deepEqual(scoped.missingOwner, ['own']);
  assert.deepEqual(scoped.again, ['own']);
  assert.equal(scoped.againReads.filter(x => x[0] === 'gallery-owner' && x[1] === 'getAllKeys').length, 3);
  assert.deepEqual(scoped.imports, ['foreign', 'legacy', 'untagged']);
  assert.deepEqual(scoped.retry, ['deleted', 'own']);
  assert.equal(scoped.failure, 'UnknownError');
  assert.equal(scoped.preserved, true);
  assert.equal(scoped.initialReads.some(x => x[2] === 'foreign' || x[2] === 'untagged' || x[1] === 'getAll'), false);
  assert.deepEqual(scoped.initialReads.filter(x => x[0] === 'projects').map(x => x[2]), ['legacy']);
  assert.equal(scoped.againReads.some(x => x[0] === 'projects' || x[2] === 'legacy' || x[2] === 'foreign' || x[2] === 'untagged'), false);
  assert.equal(scoped.importReads.some(x => x[2] === 'own' || x[2] === 'deleted' || x[1] === 'getAll'), false);
  results.push('v2 ownership migration preserves all bytes/history; owned/import queries read only selected catalog thumbnails; unknown legacy classified once without hidden summary generation; deleted scope and failed-query retry succeed');
  await scopeContext.close();
  console.log(results);
  await writeFile(out + "/store-qa.json", JSON.stringify({ passed: true, browser: browser.version(), results }, null, 2));
} finally {
  await browser.close();
  server.close();
}
