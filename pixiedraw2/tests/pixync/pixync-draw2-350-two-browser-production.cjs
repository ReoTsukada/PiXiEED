const { createHash } = require("node:crypto");
const { createRequire } = require("node:module");
const assert = require("node:assert/strict");
const requireFromTools = createRequire(`${process.cwd()}/package.json`);
const { chromium } = requireFromTools("playwright");

const ROOM = "11111111-1111-4111-8111-111111111111";
const ACTOR_A = "22222222-2222-4222-8222-222222222222";
const ACTOR_B = "33333333-3333-4333-8333-333333333333";

function canonicalValue(value) {
  if (
    value === null || ["string", "boolean", "number"].includes(typeof value)
  ) return value;
  if (Array.isArray(value)) return value.map(canonicalValue);
  const result = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) result[key] = canonicalValue(value[key]);
  }
  return result;
}
const canonicalJson = (value) => JSON.stringify(canonicalValue(value));
const sha256 = (value) =>
  createHash("sha256").update(
    typeof value === "string" ? value : canonicalJson(value),
  ).digest("hex");
const submissionFingerprint = (operation) =>
  sha256({
    schemaVersion: operation.schemaVersion,
    operationId: operation.operationId,
    projectId: operation.projectId,
    aggregate: operation.aggregate,
    actorId: operation.actorId,
    clientId: operation.clientId,
    clientSequence: operation.clientSequence,
    baseProjectRevision: operation.baseProjectRevision,
    payloadHash: operation.payloadHash,
    payload: operation.payload,
    compensation: operation.compensation,
  });
const committedFingerprint = (operation) =>
  sha256({
    submissionFingerprint: submissionFingerprint(operation),
    projectRevision: operation.projectRevision,
    aggregateRevision: operation.aggregateRevision,
  });

function fakeAuthority() {
  const operations = [];
  const gameRevisions = new Map();
  return {
    operations,
    head: () => operations.length,
    async rpc(actor, name, args) {
      if (name === "pixync_draw2_open_session_v1") {
        return {
          data: {
            principal_id: actor,
            project_id: args.p_project_id,
            room_id: args.p_project_id,
            actor_id: actor,
            membership_id: actor,
            membership_revision: "test-membership-1",
            client_id: args.p_client_id,
            session_generation: args.p_session_generation,
            role: "editor",
          },
          error: null,
        };
      }
      if (name === "pixync_draw2_get_operations_since_v1") {
        return {
          data: operations.filter((operation) =>
            operation.projectRevision > args.p_after_project_revision
          ),
          error: null,
        };
      }
      if (name === "pixync_draw2_commit_operation_v1") {
        const draft = args.p_operation;
        let operation = operations.find((item) =>
          item.operationId === draft.operationId
        );
        const duplicate = operation !== undefined;
        if (!operation) {
          operation = {
            ...draft,
            projectRevision: operations.length + 1,
            aggregateRevision: operations.filter((item) =>
              item.aggregate === draft.aggregate
            ).length + 1,
            committedAt: new Date().toISOString(),
          };
          operations.push(operation);
        }
        return {
          data: {
            kind: duplicate ? "DUPLICATE" : "COMMITTED",
            operation_id: operation.operationId,
            project_id: operation.projectId,
            project_revision: operation.projectRevision,
            aggregate_revision: operation.aggregateRevision,
            submission_fingerprint: submissionFingerprint(operation),
            committed_fingerprint: committedFingerprint(operation),
            operation,
          },
          error: null,
        };
      }
      if (name === "pixync_draw2_put_game_revision_v1") {
        gameRevisions.set(
          `${args.p_snapshot_hash}:${args.p_revision_id}`,
          structuredClone(args.p_game_project),
        );
        return { data: {}, error: null };
      }
      if (name === "pixync_draw2_get_game_revision_v1") {
        return {
          data: gameRevisions.get(
            `${args.p_snapshot_hash}:${args.p_revision_id}`,
          ) ?? null,
          error: null,
        };
      }
      return { data: null, error: { message: `Unexpected RPC ${name}` } };
    },
  };
}

const clientScript = (actor) =>
  `(() => {
  const actor = ${JSON.stringify(actor)};
  globalThis.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__ = {
    auth: { getUser: async () => ({ data: { user: { id: actor } }, error: null }) },
    rpc: (name, args) => globalThis.__pixyncTestRpc(name, args),
    channel: () => {
      let callback = () => {};
      let timer;
      let head = 0;
      const channel = {
        on: (_type, _filter, next) => { callback = next; return channel; },
        subscribe: (status) => {
          timer = setInterval(async () => {
            const next = await globalThis.__pixyncTestHead();
            if (next > head) {
              head = next;
              callback({});
              callback({});
            }
          }, 30);
          status("SUBSCRIBED");
        },
        unsubscribe: () => clearInterval(timer),
      };
      return channel;
    },
  };
})();`;

async function configurePage(context, authority, actor, errors) {
  const page = await context.newPage();
  await page.exposeFunction(
    "__pixyncTestRpc",
    (name, args) => authority.rpc(actor, name, args),
  );
  await page.exposeFunction("__pixyncTestHead", () => authority.head());
  await page.addInitScript({ content: clientScript(actor) });
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("http://127.0.0.1:8000/pixiedraw2/?new_project=1", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.waitForFunction(() =>
    Boolean(globalThis.__pixiedraw2WorkspaceDebug)
  );
  return page;
}

async function openRoom(page) {
  await page.evaluate((room) => {
    const input = document.querySelector("#draw2ProjectId");
    input.value = room;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#draw2CreateProject").click();
    const dialogInput = document.querySelector("#draw2ProjectDialogId");
    dialogInput.value = room;
    dialogInput.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#draw2ProjectOpen").click();
  }, ROOM);
  try {
    await page.waitForFunction(
      () => document.body.dataset.pixyncComposition === "production",
      null,
      { timeout: 20_000 },
    );
  } catch (error) {
    console.error(
      "openRoom state",
      await page.evaluate(() => ({
        project: document.querySelector("#draw2ProjectId")?.value,
        composition: document.body.dataset.pixyncComposition,
        state: document.body.dataset.pixyncState,
        error: document.body.dataset.pixyncError,
        status: document.querySelector("#draw2Status")?.textContent,
      })),
    );
    throw error;
  }
  await page.waitForFunction(
    () => document.body.dataset.pixyncState === "subscribed",
    null,
    { timeout: 20_000 },
  );
}

async function canvasPixel(page, x, y) {
  return page.locator("#draw2Canvas").evaluate(
    (
      canvas,
      point,
    ) => [...canvas.getContext("2d").getImageData(point.x, point.y, 1, 1).data],
    { x, y },
  );
}

async function waitFor(predicate, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for fake authority state.");
}

(async () => {
  const authority = fakeAuthority();
  const browser = await chromium.launch({ headless: true });
  const contextA = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const contextB = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const errorsA = [];
  const errorsB = [];
  const pageA = await configurePage(contextA, authority, ACTOR_A, errorsA);
  let pageB = await configurePage(contextB, authority, ACTOR_B, errorsB);
  await Promise.all([openRoom(pageA), openRoom(pageB)]);

  const before = await canvasPixel(pageB, 128, 128);
  const canvas = await pageA.locator("#draw2Canvas").boundingBox();
  assert.ok(canvas);
  await pageA.mouse.click(
    canvas.x + canvas.width / 2,
    canvas.y + canvas.height / 2,
  );
  await pageA.waitForFunction(() =>
    document.body.dataset.pixyncState === "subscribed"
  );
  await pageB.waitForFunction(
    (expected) => {
      const canvas = document.querySelector("#draw2Canvas");
      const pixel = [
        ...canvas.getContext("2d").getImageData(128, 128, 1, 1).data,
      ];
      return pixel.some((value, index) => value !== expected[index]);
    },
    before,
    { timeout: 15_000 },
  );
  assert.equal(
    authority.operations.filter((operation) => operation.aggregate === "draw")
      .length,
    1,
  );
  assert.equal(
    await pageB.locator("#draw2Undo").isDisabled(),
    true,
    "remote Draw must not enter local Undo",
  );

  await pageB.locator('[data-creator-mode="AUDIO"]').click();
  await pageB.locator("#draw2AudioGlobalBpm").evaluate((input) => {
    input.value = "132";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await pageA.waitForFunction(
    () =>
      globalThis.__pixiedraw2WorkspaceDebug?.pixyncAudioCurrent?.().project
        .tempo.milliBpm === 132000,
    null,
    { timeout: 15_000 },
  );
  assert.equal(
    authority.operations.filter((operation) => operation.aggregate === "audio")
      .length,
    1,
  );

  const gameBefore = await pageA.evaluate(() =>
    globalThis.__pixiedraw2WorkspaceDebug.pixyncGameCurrent()
  );
  await pageB.locator('[data-creator-mode="GAME"]').click();
  const gameCell = pageB.locator('button[data-mode-deck-cell="game"]').first();
  await gameCell.waitFor({ state: "visible" });
  await gameCell.click();
  await pageA.waitForFunction(
    (previousHash) => {
      const current = globalThis.__pixiedraw2WorkspaceDebug
        ?.pixyncGameCurrent?.();
      return current?.stateHash !== previousHash;
    },
    gameBefore.stateHash,
    { timeout: 15_000 },
  );
  const gameAfter = await pageA.evaluate(() =>
    globalThis.__pixiedraw2WorkspaceDebug.pixyncGameCurrent()
  );
  assert.equal(
    authority.operations.filter((operation) => operation.aggregate === "game")
      .length,
    1,
  );
  assert.equal(
    gameAfter.undoDepth,
    gameBefore.undoDepth,
    "remote Game must not enter local Undo",
  );

  const operationCountBeforeHistory = authority.operations.length;
  await pageA.evaluate(() => document.querySelector("#draw2Undo").click());
  await pageA.evaluate(() => document.querySelector("#draw2Redo").click());
  await pageA.waitForTimeout(150);
  assert.equal(
    authority.operations.length,
    operationCountBeforeHistory,
    "local Undo/Redo must not echo remote operations",
  );

  await pageB.close();
  const secondPoint = {
    x: canvas.x + canvas.width * 0.25,
    y: canvas.y + canvas.height * 0.25,
  };
  await pageA.mouse.click(secondPoint.x, secondPoint.y);
  await waitFor(() =>
    authority.operations.filter((operation) => operation.aggregate === "draw")
      .length === 2
  );
  assert.equal(
    authority.operations.filter((operation) => operation.aggregate === "draw")
      .length,
    2,
  );
  pageB = await configurePage(contextB, authority, ACTOR_B, errorsB);
  await openRoom(pageB);
  await pageB.waitForFunction(
    () => {
      const canvas = document.querySelector("#draw2Canvas");
      const pixel = [
        ...canvas.getContext("2d").getImageData(64, 64, 1, 1).data,
      ];
      return pixel[3] > 0 &&
        !(pixel[0] === 238 && pixel[1] === 238 && pixel[2] === 238);
    },
    null,
    { timeout: 15_000 },
  );
  try {
    await pageB.waitForFunction(
      (expectedHash) =>
        globalThis.__pixiedraw2WorkspaceDebug?.pixyncGameCurrent?.()
          .stateHash === expectedHash,
      gameAfter.stateHash,
      { timeout: 15_000 },
    );
  } catch (error) {
    console.error(
      "reconnect Game state",
      await pageB.evaluate(() => ({
        game: globalThis.__pixiedraw2WorkspaceDebug?.pixyncGameCurrent?.(),
        composition: document.body.dataset.pixyncComposition,
        state: document.body.dataset.pixyncState,
        error: document.body.dataset.pixyncError,
      })),
      { expected: gameAfter },
    );
    throw error;
  }

  assert.deepEqual(errorsA, []);
  assert.deepEqual(errorsB, []);
  console.log(JSON.stringify(
    {
      pass: true,
      operations: authority.operations.map((operation) => ({
        revision: operation.projectRevision,
        aggregate: operation.aggregate,
        aggregateRevision: operation.aggregateRevision,
      })),
      duplicateHintsPerRevision: 2,
      reconnectCaughtUp: true,
      remoteUndoDepthPreserved: true,
      gameCaughtUp: true,
    },
    null,
    2,
  ));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
