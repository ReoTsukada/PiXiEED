const { createHash } = require("node:crypto");
const { createRequire } = require("node:module");
const assert = require("node:assert/strict");
const requireFromTools = createRequire(`${process.cwd()}/package.json`);
const { chromium } = requireFromTools("playwright");

const ROOM = "11111111-1111-4111-8111-111111111111";
const ACTOR_A = "22222222-2222-4222-8222-222222222222";
const ACTOR_B = "33333333-3333-4333-8333-333333333333";
const CHECKPOINT = "44444444-4444-4444-8444-444444444444";

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
const sha256Bytes = (value) => createHash("sha256").update(value).digest("hex");

function makeDrawOnlyCheckpointV2(bytes) {
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x58);
  assert.equal(bytes[2], 0x44);
  assert.equal(bytes[3], 0x00);
  assert.equal(bytes[4], 2);
  const manifestLength =
    (bytes[5] * 0x1000000) + (bytes[6] << 16) + (bytes[7] << 8) + bytes[8];
  const manifestStart = 9;
  const payloadStart = manifestStart + manifestLength;
  const manifest = JSON.parse(
    Buffer.from(bytes.subarray(manifestStart, payloadStart)).toString("utf8"),
  );
  const removablePaths = new Set();
  for (const moduleName of ["audio", "game"]) {
    const module = manifest.modules?.[moduleName];
    if (module?.state?.path) removablePaths.add(module.state.path);
    for (const entry of module?.assets ?? []) {
      if (entry?.path) removablePaths.add(entry.path);
    }
  }
  const sourceEntries = manifest.entries.map((entry) => ({
    entry,
    bytes: bytes.subarray(payloadStart + entry.offset, payloadStart + entry.offset + entry.bytes),
  }));
  const retained = sourceEntries.filter(({ entry }) => !removablePaths.has(entry.path));
  let offset = 0;
  const entries = retained.map(({ entry, bytes: entryBytes }) => {
    const next = {
      ...entry,
      sha256: sha256Bytes(entryBytes),
      bytes: entryBytes.byteLength,
      offset,
    };
    offset += entryBytes.byteLength;
    return { entry: next, bytes: entryBytes };
  });
  const byPath = new Map(entries.map(({ entry, bytes: entryBytes }) => [
    entry.path,
    { entry, bytes: entryBytes },
  ]));
  const content = {
    ...manifest,
    modules: {
      ...manifest.modules,
      draw: {
        ...manifest.modules.draw,
        assets: manifest.modules.draw.assets.map((entry) => ({
          ...entry,
          ...byPath.get(entry.path).entry,
        })),
      },
      audio: { schemaVersion: null, status: "EMPTY", state: null, assets: [] },
      game: { schemaVersion: null, status: "EMPTY", state: null, assets: [] },
    },
    entries: entries.map(({ entry }) => entry),
  };
  delete content.packageId;
  delete content.createdBy;
  delete content.canonicalManifestHash;
  const packageId = `pxd_${sha256(canonicalJson(content)).slice(0, 32)}`;
  const manifestBase = { ...content, packageId, createdBy: manifest.createdBy };
  const finalManifest = {
    ...manifestBase,
    canonicalManifestHash: sha256(canonicalJson(manifestBase)),
  };
  const manifestBytes = Buffer.from(canonicalJson(finalManifest), "utf8");
  const header = Buffer.from([
    0x50,
    0x58,
    0x44,
    0x00,
    0x02,
    (manifestBytes.length >>> 24) & 0xff,
    (manifestBytes.length >>> 16) & 0xff,
    (manifestBytes.length >>> 8) & 0xff,
    manifestBytes.length & 0xff,
  ]);
  return Buffer.concat([
    header,
    manifestBytes,
    ...entries.map(({ bytes: entryBytes }) => Buffer.from(entryBytes)),
  ]);
}
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

function fakeAuthority(checkpointBytes) {
  const operations = [];
  const rpcCalls = [];
  const gameRevisions = new Map();
  const presence = new Map();
  const checkpointHash = createHash("sha256").update(checkpointBytes).digest("hex");
  const checkpointPath = `rooms/${ROOM}/checkpoints/0/${CHECKPOINT}.pxd`;
  return {
    operations,
    rpcCalls,
    head: () => operations.length,
    trackPresence: (value) => {
      presence.set(value.clientId, value);
    },
    untrackPresence: (clientId) => {
      presence.delete(clientId);
    },
    presenceSnapshot: () => [...presence.values()],
    async rpc(actor, name, args) {
      rpcCalls.push({
        actor,
        name,
        operationId: args?.p_operation?.operationId ?? null,
      });
      if (name === "pixisync_open_session") {
        return {
          data: [{
            room_id: ROOM,
            status: "active",
            role: "editor",
            can_edit: true,
            head_revision: operations.length,
            structure_epoch: 1,
            session_generation: 1,
            checkpoint_id: CHECKPOINT,
            checkpoint_revision: 0,
            storage_path: checkpointPath,
            state_sha256_hex: checkpointHash,
            encoded_bytes: checkpointBytes.byteLength,
            codec_version: 1,
          }],
          error: null,
        };
      }
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
  let trackedPresence;
  let presenceState = { members: [] };
  let previousPresence = new Map();
  const presenceCallbacks = new Map();
  let presenceTimer;
  const presencePoll = async () => {
    const entries = await globalThis.__pixyncTestPresenceSnapshot();
    const next = new Map(entries.map((entry) => [entry.clientId, entry]));
    presenceState = { members: entries };
    if (next.size === previousPresence.size &&
      [...next].every(([clientId, value]) =>
        JSON.stringify(value) === JSON.stringify(previousPresence.get(clientId)))) return;
    if (previousPresence.size === 0) {
      presenceCallbacks.get("sync")?.({});
    } else {
      const joined = [...next].filter(([clientId]) => !previousPresence.has(clientId)).map(([, value]) => value);
      const left = [...previousPresence].filter(([clientId]) => !next.has(clientId)).map(([, value]) => value);
      if (joined.length > 0) presenceCallbacks.get("join")?.({ newPresences: joined });
      if (left.length > 0) presenceCallbacks.get("leave")?.({ leftPresences: left });
      const changed = [...next].filter(([clientId, value]) =>
        previousPresence.has(clientId) &&
        JSON.stringify(value) !== JSON.stringify(previousPresence.get(clientId))).map(([, value]) => value);
      if (changed.length > 0) presenceCallbacks.get("join")?.({ newPresences: changed });
    }
    previousPresence = next;
  };
  globalThis.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__ = {
    auth: { getUser: async () => ({ data: { user: { id: actor } }, error: null }) },
    rpc: (name, args) => globalThis.__pixyncTestRpc(name, args),
    storage: {
      from: () => ({
        download: async (path) => ({
          data: new Uint8Array(await globalThis.__pixyncTestCheckpointBytes(path)),
          error: null,
        }),
        upload: async () => ({ data: {}, error: null }),
        remove: async () => ({ data: [], error: null }),
      }),
    },
    channel: () => {
      let callback = () => {};
      let timer;
      let head = 0;
      const channel = {
        on: (_type, _filter, next) => { callback = next; return channel; },
        onPresence: (event, next) => {
          presenceCallbacks.set(event, next);
          return channel;
        },
        presenceState: () => presenceState,
        track: async (next) => {
          trackedPresence = next;
          await globalThis.__pixyncTestPresenceTrack(next);
          return { data: null, error: null };
        },
        untrack: async () => {
          if (trackedPresence?.clientId) {
            await globalThis.__pixyncTestPresenceUntrack(trackedPresence.clientId);
          }
          trackedPresence = undefined;
          return { data: null, error: null };
        },
        subscribe: (status) => {
          presenceTimer = setInterval(() => { void presencePoll(); }, 30);
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
        unsubscribe: () => {
          clearInterval(timer);
          clearInterval(presenceTimer);
          presenceTimer = undefined;
        },
      };
      return channel;
    },
  };
})();`;

async function configurePage(context, authority, actor, errors, checkpointBytes) {
  const page = await context.newPage();
  await page.exposeFunction(
    "__pixyncTestRpc",
    (name, args) => authority.rpc(actor, name, args),
  );
  await page.exposeFunction("__pixyncTestHead", () => authority.head());
  await page.exposeFunction(
    "__pixyncTestCheckpointBytes",
    () => Array.from(checkpointBytes),
  );
  await page.exposeFunction(
    "__pixyncTestPresenceTrack",
    (presence) => authority.trackPresence(presence),
  );
  await page.exposeFunction(
    "__pixyncTestPresenceUntrack",
    (clientId) => authority.untrackPresence(clientId),
  );
  await page.exposeFunction(
    "__pixyncTestPresenceSnapshot",
    () => authority.presenceSnapshot(),
  );
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

async function createCheckpointBytes(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.addInitScript({
    content: `globalThis.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__ = {
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    };`,
  });
  await page.goto(
    `http://127.0.0.1:8000/pixiedraw2/?project=${ROOM}&mode=DRAW`,
    { waitUntil: "domcontentloaded", timeout: 30_000 },
  );
  await page.waitForFunction(
    () => Boolean(globalThis.__pixiedraw2WorkspaceDebug?.exportProjectPxdArtifact),
    null,
    { timeout: 30_000 },
  );
  const result = await page.evaluate(async () => {
    const artifact = await globalThis.__pixiedraw2WorkspaceDebug
      .exportProjectPxdArtifact();
    return {
      bytes: Array.from(artifact.bytes),
      packageHash: artifact.packageHash,
    };
  });
  assert.ok(result.bytes.length > 0, "The checkpoint fixture must not be empty.");
  assert.equal(result.bytes[4], 2, "The checkpoint fixture must be an integrated PXD v2 project.");
  assert.match(result.packageHash, /^[a-f0-9]{64}$/u);
  await page.close();
  await context.close();
  return Uint8Array.from(makeDrawOnlyCheckpointV2(Uint8Array.from(result.bytes)));
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

async function canvasSnapshot(page) {
  return page.locator("#draw2Canvas").evaluate((canvas) => {
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("Canvas2D context is unavailable.");
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let opaquePixels = 0;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] !== 0) opaquePixels += 1;
    }
    return {
      width: canvas.width,
      height: canvas.height,
      opaquePixels,
      dataUrl: canvas.toDataURL("image/png"),
    };
  });
}

async function selectPenAndColor(page, colorIndex = "2", tool = "pen") {
  const shapeTools = new Set([
    "line",
    "rect",
    "rect-fill",
    "ellipse",
    "ellipse-fill",
    "circle",
    "circle-fill",
  ]);
  const isTileTool = tool === "tile-stamp";
  const isShapeTool = shapeTools.has(tool);
  const isFillTool = tool === "fill" || tool === "eyedropper";
  const groupName = isTileTool
    ? "tile"
    : isShapeTool
    ? "shapes"
    : isFillTool
    ? "fill"
    : "draw";
  const group = page.locator(
    `details[data-workspace-tool-group="${groupName}"]`,
  );
  const summaryTool = isTileTool
    ? "tile-stamp"
    : isShapeTool
    ? "line"
    : isFillTool
    ? "fill"
    : "pen";
  const summary = group.locator(`summary[data-workspace-tool="${summaryTool}"]`);
  if ((await group.getAttribute("open")) === null) await summary.click();
  await group.locator(`button[data-workspace-tool="${tool}"]`).click();
  const color = page.locator(
    `#draw2WorkspacePaletteGrid button[data-color-index="${colorIndex}"]`,
  );
  await color.waitFor({ state: "visible" });
  await color.click();
}

async function drawWideShape(page, tool = "rect-fill", colorIndex = "3") {
  await selectPenAndColor(page, colorIndex, tool);
  const canvas = page.locator("#draw2Canvas");
  const box = await canvas.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0);
  const dimensions = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
  }));
  const toClientPoint = (pixelX, pixelY) => ({
    x: box.x + ((pixelX + 0.5) / dimensions.width) * box.width,
    y: box.y + ((pixelY + 0.5) / dimensions.height) * box.height,
  });
  const start = toClientPoint(0, 0);
  const end = toClientPoint(dimensions.width - 1, dimensions.height - 1);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y);
  await page.mouse.up();
}

async function drawRapidTileStamps(page, columns = 8, rows = 8) {
  await selectPenAndColor(page, "2", "tile-stamp");
  await page.locator("#draw2SpecialTileScale").selectOption("8");
  const canvas = page.locator("#draw2Canvas");
  const box = await canvas.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0);
  const dimensions = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
  }));
  const toClientPoint = (pixelX, pixelY) => ({
    x: box.x + ((pixelX + 0.5) / dimensions.width) * box.width,
    y: box.y + ((pixelY + 0.5) / dimensions.height) * box.height,
  });
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const point = toClientPoint(8 + column * 32, 8 + row * 32);
      await page.mouse.click(point.x, point.y);
    }
  }
  return columns * rows;
}

async function drawRapidBroadStrokes(
  page,
  rows = 32,
  passes = 2,
  steps = 8,
  passOffset = 0,
  verticalRange,
) {
  const canvas = page.locator("#draw2Canvas");
  const box = await canvas.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0);
  const dimensions = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
  }));
  const toClientPoint = (pixelX, pixelY) => ({
    x: box.x + ((pixelX + 0.5) / dimensions.width) * box.width,
    y: box.y + ((pixelY + 0.5) / dimensions.height) * box.height,
  });
  const left = toClientPoint(2, 0).x;
  const right = toClientPoint(dimensions.width - 3, 0).x;
  const top = verticalRange?.top ?? 2;
  const bottom = verticalRange?.bottom ?? dimensions.height - 3;
  for (let pass = 0; pass < passes; pass += 1) {
    const reverse = (pass + passOffset) % 2 === 1;
    for (let row = 0; row < rows; row += 1) {
      const pixelY = Math.round(top + ((row + 0.5) / rows) * (bottom - top));
      const startX = reverse ? right : left;
      const endX = reverse ? left : right;
      const start = toClientPoint(
        reverse ? dimensions.width - 3 : 2,
        pixelY,
      );
      await page.mouse.move(startX, start.y);
      await page.mouse.down();
      for (let step = 1; step <= steps; step += 1) {
        await page.mouse.move(
          startX + ((endX - startX) * step) / steps,
          start.y,
        );
      }
      await page.mouse.up();
    }
  }
  return rows * passes;
}

async function drawRapidMirroredStrokes(page, rows = 16, passes = 2, steps = 8) {
  await page.locator("#draw2MirrorModeToggle").click();
  await page.waitForFunction(() =>
    document.querySelector("#draw2MirrorModeToggle")?.dataset.mode === "on"
  );
  const canvas = page.locator("#draw2Canvas");
  const box = await canvas.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0);
  const dimensions = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
  }));
  const toClientPoint = (pixelX, pixelY) => ({
    x: box.x + ((pixelX + 0.5) / dimensions.width) * box.width,
    y: box.y + ((pixelY + 0.5) / dimensions.height) * box.height,
  });
  const leftStart = 24;
  const leftEnd = 88;
  for (let pass = 0; pass < passes; pass += 1) {
    await selectPenAndColor(page, pass % 2 === 0 ? "2" : "3", "pen");
    const reverse = pass % 2 === 1;
    for (let row = 0; row < rows; row += 1) {
      const pixelY = 16 + row * 14;
      const startPixel = reverse ? leftEnd : leftStart;
      const endPixel = reverse ? leftStart : leftEnd;
      const start = toClientPoint(startPixel, pixelY);
      const end = toClientPoint(endPixel, pixelY);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      for (let step = 1; step <= steps; step += 1) {
        const ratio = step / steps;
        await page.mouse.move(
          start.x + ((end.x - start.x) * ratio),
          start.y,
        );
      }
      await page.mouse.up();
    }
  }
  return rows * passes;
}

async function selectRectangle(page, fromX, fromY, toX, toY) {
  const group = page.locator(
    'details[data-workspace-tool-group="selection"]',
  );
  const summary = group.locator('summary[data-workspace-tool="select"]');
  if ((await group.getAttribute("open")) === null) await summary.click();
  await group.locator(
    '.draw2-tool-popover button[data-workspace-tool="select"]',
  ).click();
  const canvas = page.locator("#draw2Canvas");
  const box = await canvas.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0);
  const dimensions = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
  }));
  const toClientPoint = (pixelX, pixelY) => ({
    x: box.x + ((pixelX + 0.5) / dimensions.width) * box.width,
    y: box.y + ((pixelY + 0.5) / dimensions.height) * box.height,
  });
  const start = toClientPoint(fromX, fromY);
  const end = toClientPoint(toX, toY);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y);
  await page.mouse.up();
  await page.waitForFunction(
    () => document.querySelector("#draw2SelectionStatus")?.textContent
      ?.includes("rectangle") === true,
    null,
    { timeout: 10_000 },
  );
}

async function selectEllipse(page, fromX, fromY, toX, toY) {
  const group = page.locator(
    'details[data-workspace-tool-group="selection"]',
  );
  const summary = group.locator('summary[data-workspace-tool="select"]');
  if ((await group.getAttribute("open")) === null) await summary.click();
  await group.locator(
    '.draw2-tool-popover button[data-workspace-tool="select-ellipse"]',
  ).click();
  const canvas = page.locator("#draw2Canvas");
  const box = await canvas.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0);
  const dimensions = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
  }));
  const toClientPoint = (pixelX, pixelY) => ({
    x: box.x + ((pixelX + 0.5) / dimensions.width) * box.width,
    y: box.y + ((pixelY + 0.5) / dimensions.height) * box.height,
  });
  const start = toClientPoint(fromX, fromY);
  const end = toClientPoint(toX, toY);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y);
  await page.mouse.up();
  await page.waitForFunction(
    () => document.querySelector("#draw2SelectionStatus")?.textContent
      ?.includes("ellipse") === true,
    null,
    { timeout: 10_000 },
  );
}

async function clearSelectionOutsideCanvas(page, pixelX, pixelY) {
  const group = page.locator(
    'details[data-workspace-tool-group="selection"]',
  );
  const summary = group.locator('summary[data-workspace-tool="select"]');
  if ((await group.getAttribute("open")) === null) await summary.click();
  await group.locator(
    '.draw2-tool-popover button[data-workspace-tool="select"]',
  ).click();
  const canvas = page.locator("#draw2Canvas");
  const box = await canvas.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0);
  const dimensions = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
  }));
  await page.mouse.click(
    box.x + ((pixelX + 0.5) / dimensions.width) * box.width,
    box.y + ((pixelY + 0.5) / dimensions.height) * box.height,
  );
  await page.waitForFunction(
    () => document.querySelector("#draw2SelectionStatus")?.textContent
      ?.includes("selection=none") === true,
    null,
    { timeout: 10_000 },
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
  const browser = await chromium.launch({ headless: true });
  const checkpointBytes = await createCheckpointBytes(browser);
  const authority = fakeAuthority(checkpointBytes);
  const contextA = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const contextB = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const errorsA = [];
  const errorsB = [];
  const pageA = await configurePage(
    contextA,
    authority,
    ACTOR_A,
    errorsA,
    checkpointBytes,
  );
  let pageB = await configurePage(
    contextB,
    authority,
    ACTOR_B,
    errorsB,
    checkpointBytes,
  );
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

  await selectPenAndColor(pageA, "2", "line");
  const rapidBefore = await canvasSnapshot(pageB);
  const rapidBeforeRevision = await pageA.evaluate(() =>
    Number(document.body.dataset.drawPersistenceRevision ?? "0")
  );
  const rapidFirstPass = await drawRapidBroadStrokes(pageA, 32, 1, 8, 0);
  await selectPenAndColor(pageA, "1", "pixel-pen");
  const rapidSecondPass = await drawRapidBroadStrokes(pageA, 32, 1, 8, 1);
  const rapidBroadDraws = rapidFirstPass + rapidSecondPass;
  const rapidExpectedDrawOperations = 1 + rapidBroadDraws;
  try {
    await waitFor(() =>
      authority.operations.filter((operation) => operation.aggregate === "draw")
        .length === rapidExpectedDrawOperations
    );
  } catch (error) {
    console.error("rapid Draw operation count", {
      expected: rapidExpectedDrawOperations,
      actual: authority.operations.filter((operation) => operation.aggregate === "draw").length,
      rpcCalls: authority.rpcCalls.slice(-12),
      status: await pageA.evaluate(() => ({
        persistence: document.body.dataset.drawPersistenceState,
        revision: document.body.dataset.drawPersistenceRevision,
        composition: document.body.dataset.pixyncComposition,
        syncState: document.body.dataset.pixyncState,
        error: document.body.dataset.pixyncError ?? "",
        status: document.querySelector("#draw2Status")?.textContent ?? "",
        metrics: document.querySelector("#draw2Metrics")?.textContent ?? "",
      })),
    });
    throw error;
  }
  await pageA.waitForFunction(
    (previous) => document.body.dataset.drawPersistenceState === "saved" &&
      Number(document.body.dataset.drawPersistenceRevision ?? "0") > previous,
    rapidBeforeRevision,
    { timeout: 20_000 },
  );
  await pageB.waitForFunction(
    (previousDataUrl) => document.querySelector("#draw2Canvas")
        .toDataURL("image/png") !== previousDataUrl,
    rapidBefore.dataUrl,
    { timeout: 20_000 },
  );
  const rapidExpected = await canvasSnapshot(pageA);
  await pageB.waitForFunction(
    (expectedDataUrl) => document.querySelector("#draw2Canvas")
        .toDataURL("image/png") === expectedDataUrl,
    rapidExpected.dataUrl,
    { timeout: 20_000 },
  );
  const rapidAfterA = rapidExpected;
  const rapidAfterB = await canvasSnapshot(pageB);
  assert.notEqual(rapidAfterB.dataUrl, rapidBefore.dataUrl);
  assert.equal(
    rapidAfterA.dataUrl,
    rapidAfterB.dataUrl,
    "rapid broad Draw must converge to the same Canvas on both clients",
  );
  assert.ok(
    rapidAfterB.opaquePixels >= rapidBefore.opaquePixels,
    "rapid broad Draw must not reduce the rendered Canvas coverage",
  );
  assert.equal(
    await pageB.locator("#draw2Undo").isDisabled(),
    true,
    "rapid remote Draw must remain outside client B Undo",
  );

  const shapeBefore = await canvasSnapshot(pageB);
  const shapeBeforeRevision = await pageA.evaluate(() =>
    Number(document.body.dataset.drawPersistenceRevision ?? "0")
  );
  await drawWideShape(pageA);
  const shapeExpectedDrawOperations = 1 + rapidBroadDraws + 1;
  await waitFor(() =>
    authority.operations.filter((operation) => operation.aggregate === "draw")
      .length === shapeExpectedDrawOperations
  );
  await pageA.waitForFunction(
    (previous) => document.body.dataset.drawPersistenceState === "saved" &&
      Number(document.body.dataset.drawPersistenceRevision ?? "0") > previous,
    shapeBeforeRevision,
    { timeout: 20_000 },
  );
  await pageB.waitForFunction(
    (previousDataUrl) => document.querySelector("#draw2Canvas")
        .toDataURL("image/png") !== previousDataUrl,
    shapeBefore.dataUrl,
    { timeout: 20_000 },
  );
  const shapeExpected = await canvasSnapshot(pageA);
  await pageB.waitForFunction(
    (expectedDataUrl) => document.querySelector("#draw2Canvas")
        .toDataURL("image/png") === expectedDataUrl,
    shapeExpected.dataUrl,
    { timeout: 20_000 },
  );
  const shapeAfterA = shapeExpected;
  const shapeAfterB = await canvasSnapshot(pageB);
  assert.equal(
    shapeAfterA.dataUrl,
    shapeAfterB.dataUrl,
    "wide filled shape must converge to the same Canvas on both clients",
  );
  assert.notEqual(shapeAfterB.dataUrl, shapeBefore.dataUrl);

  const tileBefore = await canvasSnapshot(pageB);
  const tileBeforeRevision = await pageA.evaluate(() =>
    Number(document.body.dataset.drawPersistenceRevision ?? "0")
  );
  const rapidTileStamps = await drawRapidTileStamps(pageA);
  const tileExpectedDrawOperations = shapeExpectedDrawOperations + rapidTileStamps;
  try {
    await waitFor(() =>
      authority.operations.filter((operation) => operation.aggregate === "draw")
        .length === tileExpectedDrawOperations
    );
  } catch (error) {
    console.error("rapid Tile Stamp operation count", {
      expected: tileExpectedDrawOperations,
      actual: authority.operations.filter((operation) => operation.aggregate === "draw").length,
      rpcCalls: authority.rpcCalls.slice(-12),
      status: await pageA.evaluate(() => ({
        persistence: document.body.dataset.drawPersistenceState,
        revision: document.body.dataset.drawPersistenceRevision,
        composition: document.body.dataset.pixyncComposition,
        syncState: document.body.dataset.pixyncState,
        error: document.body.dataset.pixyncError ?? "",
        status: document.querySelector("#draw2Status")?.textContent ?? "",
        metrics: document.querySelector("#draw2Metrics")?.textContent ?? "",
      })),
      pageErrors: errorsA,
    });
    throw error;
  }
  await pageA.waitForFunction(
    (previous) => document.body.dataset.drawPersistenceState === "saved" &&
      Number(document.body.dataset.drawPersistenceRevision ?? "0") > previous,
    tileBeforeRevision,
    { timeout: 20_000 },
  );
  await pageB.waitForFunction(
    (previousDataUrl) => document.querySelector("#draw2Canvas")
        .toDataURL("image/png") !== previousDataUrl,
    tileBefore.dataUrl,
    { timeout: 20_000 },
  );
  const tileExpected = await canvasSnapshot(pageA);
  await pageB.waitForFunction(
    (expectedDataUrl) => document.querySelector("#draw2Canvas")
        .toDataURL("image/png") === expectedDataUrl,
    tileExpected.dataUrl,
    { timeout: 20_000 },
  );
  const tileAfterB = await canvasSnapshot(pageB);
  assert.equal(
    tileExpected.dataUrl,
    tileAfterB.dataUrl,
    "rapid tile stamps must converge to the same Canvas on both clients",
  );
  assert.notEqual(tileAfterB.dataUrl, tileBefore.dataUrl);

  const mirrorBefore = await canvasSnapshot(pageB);
  const mirrorBeforeRevision = await pageA.evaluate(() =>
    Number(document.body.dataset.drawPersistenceRevision ?? "0")
  );
  const rapidMirroredDraws = await drawRapidMirroredStrokes(pageA);
  const mirrorExpectedDrawOperations = tileExpectedDrawOperations +
    rapidMirroredDraws;
  try {
    await waitFor(() =>
      authority.operations.filter((operation) => operation.aggregate === "draw")
        .length === mirrorExpectedDrawOperations
    );
  } catch (error) {
    console.error("rapid mirrored Draw operation count", {
      expected: mirrorExpectedDrawOperations,
      actual: authority.operations.filter((operation) => operation.aggregate === "draw").length,
      status: await pageA.evaluate(() => ({
        persistence: document.body.dataset.drawPersistenceState,
        composition: document.body.dataset.pixyncComposition,
        syncState: document.body.dataset.pixyncState,
        error: document.body.dataset.pixyncError ?? "",
        status: document.querySelector("#draw2Status")?.textContent ?? "",
      })),
      pageErrors: errorsA,
    });
    throw error;
  }
  await pageA.waitForFunction(
    (previous) => document.body.dataset.drawPersistenceState === "saved" &&
      Number(document.body.dataset.drawPersistenceRevision ?? "0") > previous,
    mirrorBeforeRevision,
    { timeout: 20_000 },
  );
  await pageB.waitForFunction(
    (previousDataUrl) => document.querySelector("#draw2Canvas")
        .toDataURL("image/png") !== previousDataUrl,
    mirrorBefore.dataUrl,
    { timeout: 20_000 },
  );
  const mirrorExpected = await canvasSnapshot(pageA);
  await pageB.waitForFunction(
    (expectedDataUrl) => document.querySelector("#draw2Canvas")
        .toDataURL("image/png") === expectedDataUrl,
    mirrorExpected.dataUrl,
    { timeout: 20_000 },
  );
  const mirrorAfterB = await canvasSnapshot(pageB);
  assert.equal(
    mirrorExpected.dataUrl,
    mirrorAfterB.dataUrl,
    "rapid mirrored Draw must converge to the same Canvas on both clients",
  );
  assert.notEqual(mirrorAfterB.dataUrl, mirrorBefore.dataUrl);
  await pageA.locator("#draw2MirrorModeToggle").click();

  const selectionBefore = await canvasSnapshot(pageB);
  const selectionBeforeRevision = await pageA.evaluate(() =>
    Number(document.body.dataset.drawPersistenceRevision ?? "0")
  );
  await selectRectangle(pageA, 48, 48, 207, 207);
  await selectPenAndColor(pageA, "2", "fill");
  const fillCanvas = await pageA.locator("#draw2Canvas").boundingBox();
  assert.ok(fillCanvas);
  const fillDimensions = await pageA.locator("#draw2Canvas").evaluate(
    (element) => ({ width: element.width, height: element.height }),
  );
  await pageA.mouse.click(
    fillCanvas.x + ((64.5 / fillDimensions.width) * fillCanvas.width),
    fillCanvas.y + ((64.5 / fillDimensions.height) * fillCanvas.height),
  );
  const selectionFillExpectedDrawOperations = mirrorExpectedDrawOperations + 1;
  try {
    await waitFor(() =>
      authority.operations.filter((operation) => operation.aggregate === "draw")
        .length === selectionFillExpectedDrawOperations
    );
  } catch (error) {
    console.error("rectangle selection Fill operation count", {
      expected: selectionFillExpectedDrawOperations,
      actual: authority.operations.filter((operation) => operation.aggregate === "draw").length,
      status: await pageA.evaluate(() => ({
        persistence: document.body.dataset.drawPersistenceState,
        composition: document.body.dataset.pixyncComposition,
        syncState: document.body.dataset.pixyncState,
        error: document.body.dataset.pixyncError ?? "",
        selection: document.querySelector("#draw2SelectionStatus")?.textContent ?? "",
        status: document.querySelector("#draw2Status")?.textContent ?? "",
      })),
      pageErrors: errorsA,
    });
    throw error;
  }
  await pageA.waitForFunction(
    (previous) => document.body.dataset.drawPersistenceState === "saved" &&
      Number(document.body.dataset.drawPersistenceRevision ?? "0") > previous,
    selectionBeforeRevision,
    { timeout: 20_000 },
  );
  await pageB.waitForFunction(
    (previousDataUrl) => document.querySelector("#draw2Canvas")
        .toDataURL("image/png") !== previousDataUrl,
    selectionBefore.dataUrl,
    { timeout: 20_000 },
  );
  const selectionFillOperation = authority.operations.at(-1);
  const selectionFillCommand = selectionFillOperation?.payload?.command;
  assert.equal(selectionFillCommand?.operationType, "raster.fill");
  assert.deepEqual(selectionFillCommand?.payload?.clip, {
    x: 48,
    y: 48,
    width: 160,
    height: 160,
  });
  assert.equal(selectionFillCommand?.payload?.writes, undefined);
  assert.ok(
    JSON.stringify(selectionFillCommand).length < 1_000,
    "rectangle selection Fill must remain a compact canonical command",
  );
  const selectionFillExpected = await canvasSnapshot(pageA);
  await pageB.waitForFunction(
    (expectedDataUrl) => document.querySelector("#draw2Canvas")
        .toDataURL("image/png") === expectedDataUrl,
    selectionFillExpected.dataUrl,
    { timeout: 20_000 },
  );
  assert.equal(
    selectionFillExpected.dataUrl,
    (await canvasSnapshot(pageB)).dataUrl,
    "rectangle selection Fill must converge to the same Canvas on both clients",
  );
  await selectPenAndColor(pageA, "1", "line");
  await drawRapidBroadStrokes(pageA, 1, 1, 8);
  const selectionStrokeExpectedDrawOperations =
    selectionFillExpectedDrawOperations + 1;
  await waitFor(() =>
    authority.operations.filter((operation) => operation.aggregate === "draw")
      .length === selectionStrokeExpectedDrawOperations
  );
  const selectionStrokeOperation = authority.operations.at(-1);
  const selectionStrokeCommand = selectionStrokeOperation?.payload?.command;
  assert.equal(selectionStrokeCommand?.operationType, "raster.strokeCommit");
  assert.deepEqual(selectionStrokeCommand?.payload?.clip, {
    x: 48,
    y: 48,
    width: 160,
    height: 160,
  });
  assert.equal(selectionStrokeCommand?.payload?.writes, undefined);
  assert.ok(
    JSON.stringify(selectionStrokeCommand).length < 1_000,
    "rectangle selection Stroke must remain a compact canonical command",
  );
  const selectionStrokeExpected = await canvasSnapshot(pageA);
  await pageB.waitForFunction(
    (expectedDataUrl) => document.querySelector("#draw2Canvas")
        .toDataURL("image/png") === expectedDataUrl,
    selectionStrokeExpected.dataUrl,
    { timeout: 20_000 },
  );
  await drawWideShape(pageA, "rect-fill", "1");
  const selectionShapeExpectedDrawOperations =
    selectionStrokeExpectedDrawOperations + 1;
  await waitFor(() =>
    authority.operations.filter((operation) => operation.aggregate === "draw")
      .length === selectionShapeExpectedDrawOperations
  );
  const selectionShapeOperation = authority.operations.at(-1);
  const selectionShapeCommand = selectionShapeOperation?.payload?.command;
  assert.equal(selectionShapeCommand?.operationType, "raster.shapeCommit");
  assert.deepEqual(selectionShapeCommand?.payload?.clip, {
    x: 48,
    y: 48,
    width: 160,
    height: 160,
  });
  assert.equal(selectionShapeCommand?.payload?.writes, undefined);
  assert.ok(
    JSON.stringify(selectionShapeCommand).length < 1_000,
    "rectangle selection Shape must remain a compact canonical command",
  );
  const selectionShapeExpected = await canvasSnapshot(pageA);
  await pageB.waitForFunction(
    (expectedDataUrl) => document.querySelector("#draw2Canvas")
        .toDataURL("image/png") === expectedDataUrl,
    selectionShapeExpected.dataUrl,
    { timeout: 20_000 },
  );
  await clearSelectionOutsideCanvas(pageA, 224, 224);

  const ellipseSelectionBefore = await canvasSnapshot(pageB);
  const ellipseSelectionBeforeRevision = await pageA.evaluate(() =>
    Number(document.body.dataset.drawPersistenceRevision ?? "0")
  );
  await selectEllipse(pageA, 32, 32, 223, 223);
  await selectPenAndColor(pageA, "0", "eraser");
  const rapidEllipseSelectionStrokes = await drawRapidBroadStrokes(
    pageA,
    16,
    1,
    8,
    0,
    { top: 48, bottom: 208 },
  );
  const ellipseSelectionExpectedDrawOperations =
    selectionShapeExpectedDrawOperations + rapidEllipseSelectionStrokes;
  await waitFor(() =>
    authority.operations.filter((operation) => operation.aggregate === "draw")
      .length === ellipseSelectionExpectedDrawOperations
  );
  await pageA.waitForFunction(
    (previous) => document.body.dataset.drawPersistenceState === "saved" &&
      Number(document.body.dataset.drawPersistenceRevision ?? "0") > previous,
    ellipseSelectionBeforeRevision,
    { timeout: 20_000 },
  );
  await pageB.waitForFunction(
    (previousDataUrl) => document.querySelector("#draw2Canvas")
        .toDataURL("image/png") !== previousDataUrl,
    ellipseSelectionBefore.dataUrl,
    { timeout: 20_000 },
  );
  const ellipseSelectionOperation = authority.operations.at(-1);
  const ellipseSelectionCommand = ellipseSelectionOperation?.payload?.command;
  assert.equal(ellipseSelectionCommand?.operationType, "raster.strokeCommit");
  assert.equal(ellipseSelectionCommand?.payload?.writes, undefined);
  assert.equal(ellipseSelectionCommand?.payload?.selectionMask?.kind, "runs");
  assert.equal(
    ellipseSelectionCommand?.payload?.selectionMask?.encoding,
    "rle-u16-base64-v1",
  );
  assert.ok(
    typeof ellipseSelectionCommand?.payload?.selectionMask?.data === "string" &&
      JSON.stringify(ellipseSelectionCommand).length < 8_000,
    "ellipse selection Stroke must remain a compact canonical command",
  );
  const ellipseSelectionExpected = await canvasSnapshot(pageA);
  await pageB.waitForFunction(
    (expectedDataUrl) => document.querySelector("#draw2Canvas")
        .toDataURL("image/png") === expectedDataUrl,
    ellipseSelectionExpected.dataUrl,
    { timeout: 20_000 },
  );
  assert.equal(
    ellipseSelectionExpected.dataUrl,
    (await canvasSnapshot(pageB)).dataUrl,
    "ellipse selection Stroke must converge to the same Canvas on both clients",
  );

  const transformBefore = await canvasSnapshot(pageB);
  const transformBeforeRevision = await pageA.evaluate(() =>
    Number(document.body.dataset.drawPersistenceRevision ?? "0")
  );
  await pageA.evaluate(() => {
    const setValue = (selector, value) => {
      const element = document.querySelector(selector);
      if (element) element.value = value;
    };
    setValue("#draw2TransformOperation", "MOVE");
    setValue("#draw2TransformDx", "8");
    setValue("#draw2TransformDy", "0");
    setValue("#draw2TransformFactor", "1");
    document.querySelector("#draw2PreviewTransform")?.click();
  });
  await pageA.waitForFunction(
    () => document.querySelector("#draw2SelectionStatus")?.textContent
      ?.includes("preview=MOVE") === true,
    null,
    { timeout: 10_000 },
  );
  await pageA.evaluate(() => document.querySelector("#draw2CommitTransform")?.click());
  const selectionTransformExpectedDrawOperations =
    ellipseSelectionExpectedDrawOperations + 1;
  await waitFor(() =>
    authority.operations.filter((operation) => operation.aggregate === "draw")
      .length === selectionTransformExpectedDrawOperations
  );
  await pageA.waitForFunction(
    (previous) => document.body.dataset.drawPersistenceState === "saved" &&
      Number(document.body.dataset.drawPersistenceRevision ?? "0") > previous,
    transformBeforeRevision,
    { timeout: 20_000 },
  );
  await pageB.waitForFunction(
    (previousDataUrl) => document.querySelector("#draw2Canvas")
        .toDataURL("image/png") !== previousDataUrl,
    transformBefore.dataUrl,
    { timeout: 20_000 },
  );
  const selectionTransformOperation = authority.operations.at(-1);
  const selectionTransformCommand = selectionTransformOperation?.payload?.command;
  assert.equal(
    selectionTransformCommand?.operationType,
    "selection.transformCommit",
  );
  assert.equal(selectionTransformCommand?.payload?.writes, undefined);
  assert.equal(selectionTransformCommand?.payload?.pixels, undefined);
  assert.equal(selectionTransformCommand?.payload?.selectionMask?.kind, "runs");
  assert.equal(
    selectionTransformCommand?.payload?.selectionMask?.encoding,
    "rle-u16-base64-v1",
  );
  assert.ok(
    typeof selectionTransformCommand?.payload?.selectionMask?.data === "string" &&
      JSON.stringify(selectionTransformCommand).length < 8_000,
    "selection transform must remain a compact canonical command",
  );
  const selectionTransformExpected = await canvasSnapshot(pageA);
  await pageB.waitForFunction(
    (expectedDataUrl) => document.querySelector("#draw2Canvas")
        .toDataURL("image/png") === expectedDataUrl,
    selectionTransformExpected.dataUrl,
    { timeout: 20_000 },
  );
  assert.equal(
    selectionTransformExpected.dataUrl,
    (await canvasSnapshot(pageB)).dataUrl,
    "selection transform must converge to the same Canvas on both clients",
  );
  await clearSelectionOutsideCanvas(pageA, 240, 240);

  await pageB.locator('[data-creator-mode="AUDIO"]').click();
  await pageB.locator("#draw2AudioGlobalBpm").evaluate((input) => {
    input.value = "132";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  try {
    await pageA.waitForFunction(
      () =>
        globalThis.__pixiedraw2WorkspaceDebug?.pixyncAudioCurrent?.().project
          .tempo.milliBpm === 132000,
      null,
      { timeout: 15_000 },
    );
  } catch (error) {
    console.error("rapid audio propagation", {
      operationCount: authority.operations.length,
      lastOperations: authority.operations.slice(-16).map((operation) => ({
        aggregate: operation.aggregate,
        projectRevision: operation.projectRevision,
        aggregateRevision: operation.aggregateRevision,
        operationId: operation.operationId,
        payloadCommand: operation.payload?.command,
      })),
      rpcCalls: authority.rpcCalls.slice(-12),
      pageA: await pageA.evaluate(() => ({
        persistence: document.body.dataset.drawPersistenceState,
        revision: document.body.dataset.drawPersistenceRevision,
        composition: document.body.dataset.pixyncComposition,
        syncState: document.body.dataset.pixyncState,
        error: document.body.dataset.pixyncError ?? "",
        audio: globalThis.__pixiedraw2WorkspaceDebug?.pixyncAudioCurrent?.(),
      })),
      pageB: await pageB.evaluate(() => ({
        persistence: document.body.dataset.drawPersistenceState,
        revision: document.body.dataset.drawPersistenceRevision,
        composition: document.body.dataset.pixyncComposition,
        syncState: document.body.dataset.pixyncState,
        error: document.body.dataset.pixyncError ?? "",
        audio: globalThis.__pixiedraw2WorkspaceDebug?.pixyncAudioCurrent?.(),
      })),
      pageErrors: errorsA,
    });
    throw error;
  }
  assert.equal(
    authority.operations.filter((operation) => operation.aggregate === "audio")
      .length,
    1,
  );

  const gameBefore = await pageA.evaluate(() =>
    globalThis.__pixiedraw2WorkspaceDebug.pixyncGameCurrent()
  );
  await pageB.locator('[data-creator-mode="GAME"]').click();
  const addGameObject = pageB.locator("#draw2GameDeckAddAsset");
  await addGameObject.waitFor({ state: "visible" });
  await addGameObject.click();
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

  const drawOperationsBeforeReconnect = authority.operations.filter((operation) =>
    operation.aggregate === "draw"
  ).length;
  await pageB.close();
  await selectPenAndColor(pageA, "2", "pen");
  const secondPoint = {
    x: canvas.x + canvas.width * 0.25,
    y: canvas.y + canvas.height * 0.25,
  };
  await pageA.mouse.click(secondPoint.x, secondPoint.y);
  await waitFor(() =>
    authority.operations.filter((operation) => operation.aggregate === "draw")
      .length === drawOperationsBeforeReconnect + 1
  );
  assert.equal(
    authority.operations.filter((operation) => operation.aggregate === "draw")
      .length,
    drawOperationsBeforeReconnect + 1,
  );
  pageB = await configurePage(
    contextB,
    authority,
    ACTOR_B,
    errorsB,
    checkpointBytes,
  );
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
  const aggregateOperationCounts = Object.fromEntries(
    ["draw", "audio", "game"].map((aggregate) => [
      aggregate,
      authority.operations.filter((operation) => operation.aggregate === aggregate).length,
    ]),
  );
  console.log(JSON.stringify(
    {
      pass: true,
      operations: authority.operations.length,
      aggregateOperationCounts,
      rapidBroadDraws,
      rapidTileStamps,
      rapidMirroredDraws,
      rapidSelectionFills: 1,
      rapidSelectionStrokes: 1,
      rapidSelectionShapes: 1,
      rapidEllipseSelectionStrokes,
      rapidSelectionTransforms: 1,
      rapidCanvasConverged: true,
      rapidDrawSaved: true,
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
