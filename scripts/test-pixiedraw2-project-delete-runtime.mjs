import assert from "node:assert/strict";
import { createRequire } from "node:module";

const requireFromScreenshots = createRequire(
  new URL("../tools/screenshots/package.json", import.meta.url),
);
const { chromium } = requireFromScreenshots("playwright");

const BASE_URL = "http://127.0.0.1:8000/pixiedraw2/";
const RECENT_PROJECTS_KEY = "pixiedraw2:recent-projects:v1";
const TARGET_PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const SURVIVING_SHARED_PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const SURVIVING_LOCAL_PROJECT_ID = "draw2-delete-survivor";
const AUTHENTICATED_USER_ID = "33333333-3333-4333-8333-333333333333";
const TARGET_NAME = "Shared delete fixture";
const SURVIVING_SHARED_NAME = "Shared survivor fixture";
const SURVIVING_LOCAL_NAME = "Local survivor fixture";

function recentProjects() {
  const updatedAt = "2026-08-28T00:00:00.000Z";
  return [
    {
      projectId: TARGET_PROJECT_ID,
      name: TARGET_NAME,
      updatedAt,
    },
    {
      projectId: SURVIVING_SHARED_PROJECT_ID,
      name: SURVIVING_SHARED_NAME,
      updatedAt: "2026-08-27T00:00:00.000Z",
    },
    {
      projectId: SURVIVING_LOCAL_PROJECT_ID,
      name: SURVIVING_LOCAL_NAME,
      updatedAt: "2026-08-26T00:00:00.000Z",
    },
  ];
}

async function seedPixyncSnapshots(page) {
  await page.evaluate(
    ({ targetProjectId, survivingProjectId }) => new Promise((resolve, reject) => {
      const request = indexedDB.open("pixync-draw2", 2);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("snapshots")) {
          database.createObjectStore("snapshots", { keyPath: "projectId" });
        }
        if (!database.objectStoreNames.contains("deletedProjects")) {
          database.createObjectStore("deletedProjects", { keyPath: "projectId" });
        }
      };
      request.onerror = () => reject(request.error ?? new Error("seed open failed"));
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("snapshots", "readwrite");
        const store = transaction.objectStore("snapshots");
        const snapshot = {
          schemaVersion: "PIXYNC_DRAW2_DURABLE_SNAPSHOT_V1",
          projectId: targetProjectId,
          revision: 1,
          fixture: true,
        };
        store.put({ projectId: targetProjectId, snapshot });
        store.put({
          projectId: survivingProjectId,
          snapshot: { ...snapshot, projectId: survivingProjectId },
        });
        transaction.onerror = () => reject(transaction.error ?? new Error("seed transaction failed"));
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
      };
    }),
    {
      targetProjectId: TARGET_PROJECT_ID,
      survivingProjectId: SURVIVING_SHARED_PROJECT_ID,
    },
  );
}

async function readPixyncState(page) {
  return await page.evaluate(
    ({ targetProjectId, survivingProjectId }) => new Promise((resolve, reject) => {
      const request = indexedDB.open("pixync-draw2");
      request.onerror = () => reject(request.error ?? new Error("read open failed"));
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(
          ["snapshots", "deletedProjects"],
          "readonly",
        );
        const snapshots = transaction.objectStore("snapshots");
        const deletedProjects = transaction.objectStore("deletedProjects");
        const targetSnapshot = snapshots.get(targetProjectId);
        const survivingSnapshot = snapshots.get(survivingProjectId);
        const targetDeletion = deletedProjects.get(targetProjectId);
        transaction.onerror = () => reject(transaction.error ?? new Error("read transaction failed"));
        transaction.oncomplete = () => {
          database.close();
          resolve({
            targetSnapshot: targetSnapshot.result ?? null,
            survivingSnapshot: survivingSnapshot.result ?? null,
            targetDeletion: targetDeletion.result ?? null,
          });
        };
      };
    }),
    {
      targetProjectId: TARGET_PROJECT_ID,
      survivingProjectId: SURVIVING_SHARED_PROJECT_ID,
    },
  );
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

await context.addInitScript(
  ({ recentProjectsKey, recentProjectsJson, authenticatedUserId, targetProjectId }) => {
    if (window.localStorage.getItem(recentProjectsKey) === null) {
      window.localStorage.setItem(recentProjectsKey, recentProjectsJson);
    }
    window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__ = {
      auth: {
        getUser: async () => ({
          data: { user: { id: authenticatedUserId } },
          error: null,
        }),
      },
      rpc: async (name, args) => {
        window.__pixiedraw2DeleteFixtureRpcCalls ??= [];
        window.__pixiedraw2DeleteFixtureRpcCalls.push({ name, args });
        if (name !== "pixisync_detach_deleted_project" || args?.p_room_id !== targetProjectId) {
          return { data: null, error: new Error("unexpected fixture RPC") };
        }
        return {
          data: {
            room_id: targetProjectId,
            action: "participant_left",
            room_status: "active",
            session_generation: 1,
          },
          error: null,
        };
      },
    };
  },
  {
    recentProjectsKey: RECENT_PROJECTS_KEY,
    recentProjectsJson: JSON.stringify(recentProjects()),
    authenticatedUserId: AUTHENTICATED_USER_ID,
    targetProjectId: TARGET_PROJECT_ID,
  },
);

page.once("dialog", async (dialog) => {
  assert.equal(dialog.type(), "confirm");
  await dialog.accept();
});

await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.locator(".draw2-project-recent-delete").first().waitFor({ state: "visible", timeout: 15_000 });
await seedPixyncSnapshots(page);

const targetDeleteButton = page.getByRole("button", { name: `${TARGET_NAME}を削除` });
assert.equal(await targetDeleteButton.count(), 1, "The target Project delete action was not rendered.");
await targetDeleteButton.click();

await page.waitForFunction(
  ({ targetName, survivingSharedName, survivingLocalName }) => {
    const labels = [...document.querySelectorAll(".draw2-project-recent-delete")]
      .map((button) => button.getAttribute("aria-label") ?? "");
    return !labels.includes(`${targetName}を削除`) &&
      labels.includes(`${survivingSharedName}を削除`) &&
      labels.includes(`${survivingLocalName}を削除`);
  },
  {
    targetName: TARGET_NAME,
    survivingSharedName: SURVIVING_SHARED_NAME,
    survivingLocalName: SURVIVING_LOCAL_NAME,
  },
  { timeout: 15_000 },
);

const result = await page.evaluate(
  ({ recentProjectsKey }) => ({
    recentProjects: JSON.parse(window.localStorage.getItem(recentProjectsKey) ?? "[]"),
    rpcCalls: window.__pixiedraw2DeleteFixtureRpcCalls ?? [],
    status: document.querySelector("#draw2ProjectStartStatus")?.textContent ?? "",
  }),
  { recentProjectsKey: RECENT_PROJECTS_KEY },
);
const pixync = await readPixyncState(page);

assert.deepEqual(
  result.recentProjects.map((project) => project.projectId),
  [SURVIVING_SHARED_PROJECT_ID, SURVIVING_LOCAL_PROJECT_ID],
  "Deleting one Project changed unrelated Recent entries.",
);
assert.equal(result.rpcCalls.length, 1, "Shared Project detach was not called exactly once.");
assert.equal(result.rpcCalls[0].name, "pixisync_detach_deleted_project");
assert.equal(result.rpcCalls[0].args.p_room_id, TARGET_PROJECT_ID);
assert.equal(pixync.targetSnapshot, null, "The deleted PiXYNC Snapshot still exists.");
assert.ok(pixync.targetDeletion?.projectId === TARGET_PROJECT_ID, "The PiXYNC deletion barrier is missing.");
assert.ok(pixync.survivingSnapshot?.projectId === SURVIVING_SHARED_PROJECT_ID, "The surviving PiXYNC Snapshot was changed.");
assert.match(result.status, /削除しました/u);

await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
await page.waitForFunction(
  ({ targetName, survivingSharedName, survivingLocalName }) => {
    const labels = [...document.querySelectorAll(".draw2-project-recent-delete")]
      .map((button) => button.getAttribute("aria-label") ?? "");
    return !labels.includes(`${targetName}を削除`) &&
      labels.includes(`${survivingSharedName}を削除`) &&
      labels.includes(`${survivingLocalName}を削除`);
  },
  {
    targetName: TARGET_NAME,
    survivingSharedName: SURVIVING_SHARED_NAME,
    survivingLocalName: SURVIVING_LOCAL_NAME,
  },
  { timeout: 15_000 },
);
const reloadedResult = await page.evaluate(
  ({ recentProjectsKey }) => ({
    recentProjects: JSON.parse(window.localStorage.getItem(recentProjectsKey) ?? "[]"),
  }),
  { recentProjectsKey: RECENT_PROJECTS_KEY },
);
const pixyncAfterReload = await readPixyncState(page);
assert.deepEqual(
  reloadedResult.recentProjects.map((project) => project.projectId),
  [SURVIVING_SHARED_PROJECT_ID, SURVIVING_LOCAL_PROJECT_ID],
  "The deleted Project reappeared after reload.",
);
assert.equal(pixyncAfterReload.targetSnapshot, null, "The deleted Snapshot reappeared after reload.");
assert.ok(pixyncAfterReload.targetDeletion?.projectId === TARGET_PROJECT_ID, "The deletion barrier disappeared after reload.");
assert.ok(pixyncAfterReload.survivingSnapshot?.projectId === SURVIVING_SHARED_PROJECT_ID, "The surviving Snapshot changed after reload.");
assert.deepEqual(pageErrors, []);
assert.deepEqual(consoleErrors, []);

console.log(JSON.stringify({
  pass: true,
  recentProjectCount: result.recentProjects.length,
  reloadedRecentProjectCount: reloadedResult.recentProjects.length,
  deletedProjectId: TARGET_PROJECT_ID,
  survivingProjectIds: reloadedResult.recentProjects.map((project) => project.projectId),
  remoteDetachCalls: result.rpcCalls.length,
  targetSnapshotRemaining: pixyncAfterReload.targetSnapshot !== null,
  targetDeletionBarrier: pixyncAfterReload.targetDeletion !== null,
  survivingSnapshotRemaining: pixyncAfterReload.survivingSnapshot !== null,
  reloadedTargetAbsent: !reloadedResult.recentProjects.some((project) => project.projectId === TARGET_PROJECT_ID),
  pageErrors: pageErrors.length,
  consoleErrors: consoleErrors.length,
}));

await context.close();
await browser.close();
