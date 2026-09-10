import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const requireFromScreenshots = createRequire(
  new URL("../tools/screenshots/package.json", import.meta.url),
);
const { chromium } = requireFromScreenshots("playwright");

const PROJECT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_ROWS = 48;
const DEFAULT_PASSES = 2;
const DEFAULT_STEPS = 8;

function requiredEnv(name) {
  const value = String(process.env[name] ?? "").trim();
  assert.ok(value.length > 0, `${name} is required.`);
  return value;
}

function boundedInteger(name, fallback, min, max) {
  const raw = String(process.env[name] ?? "").trim();
  if (raw.length === 0) return fallback;
  assert.match(raw, /^[0-9]+$/u, `${name} must be an integer.`);
  const value = Number(raw);
  assert.ok(Number.isSafeInteger(value), `${name} is outside the safe integer range.`);
  assert.ok(value >= min && value <= max, `${name} must be between ${min} and ${max}.`);
  return value;
}

function stagingBaseUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("PIXIEED_STAGE8_BASE_URL must be a valid HTTP(S) URL.");
  }
  const localHttp = url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  assert.ok(
    url.protocol === "https:" || localHttp,
    "PIXIEED_STAGE8_BASE_URL must use HTTPS, except for localhost.",
  );
  assert.equal(url.username, "", "PIXIEED_STAGE8_BASE_URL must not contain credentials.");
  assert.equal(url.password, "", "PIXIEED_STAGE8_BASE_URL must not contain credentials.");
  assert.equal(url.search, "", "PIXIEED_STAGE8_BASE_URL must not contain a query.");
  assert.equal(url.hash, "", "PIXIEED_STAGE8_BASE_URL must not contain a hash.");
  assert.ok(
    !["pixieed.jp", "www.pixieed.jp"].includes(url.hostname.toLowerCase()),
    "The Stage 8 live harness refuses the PiXiEED production host.",
  );
  return url.href.replace(/\/+$/u, "");
}

function stagingSupabaseUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("PIXIEED_STAGE8_SUPABASE_URL must be a valid Supabase URL.");
  }
  const localHttp = url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  assert.ok(
    url.protocol === "https:" || localHttp,
    "PIXIEED_STAGE8_SUPABASE_URL must use HTTPS, except for localhost.",
  );
  assert.equal(url.username, "", "Supabase URL must not contain credentials.");
  assert.equal(url.password, "", "Supabase URL must not contain credentials.");
  assert.equal(url.search, "", "Supabase URL must not contain a query.");
  assert.equal(url.hash, "", "Supabase URL must not contain a hash.");
  assert.notEqual(
    url.hostname.toLowerCase(),
    "kyyiuakrqomzlikfaire.supabase.co",
    "The Stage 8 live harness refuses the current production Supabase project.",
  );
  return url.href.replace(/\/+$/u, "");
}

function publishableKey(raw) {
  assert.ok(raw.length >= 20 && raw.length <= 512, "Supabase key length is invalid.");
  assert.doesNotMatch(raw, /service_role|sb_secret/iu, "A secret Supabase key is not allowed.");
  assert.ok(
    raw.startsWith("sb_publishable_") || raw.split(".").length === 3,
    "PIXIEED_STAGE8_SUPABASE_PUBLISHABLE_KEY must be a publishable or anon key.",
  );
  return raw;
}

function safeStorageKey(raw, supabaseUrl) {
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0] || "staging";
  const value = raw.length === 0 ? `sb-${projectRef}-auth-token` : raw;
  assert.match(
    value,
    /^[A-Za-z0-9._:-]{1,160}$/u,
    "PIXIEED_STAGE8_SUPABASE_STORAGE_KEY contains unsupported characters.",
  );
  return value;
}

function storageStatePath(name) {
  const filePath = path.resolve(requiredEnv(name));
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    throw new Error(`${name} must point to an existing storageState file.`);
  }
  assert.ok(stat?.isFile(), `${name} must point to an existing storageState file.`);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    throw new Error(`${name} is not valid JSON storageState.`);
  }
  assert.ok(
    parsed && typeof parsed === "object" && !Array.isArray(parsed),
    `${name} is not a JSON storageState object.`,
  );
  return filePath;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalValue(value) {
  if (
    value === null ||
    ["string", "boolean", "number"].includes(typeof value)
  ) return value;
  if (Array.isArray(value)) return value.map(canonicalValue);
  const result = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) result[key] = canonicalValue(value[key]);
  }
  return result;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function sanitizeMessage(value) {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._-]+/giu, "Bearer [redacted]")
    .replace(/(access|refresh)_token[=:][^\s&]+/giu, "$1_token=[redacted]")
    .replace(/sb_(?:publishable|secret)_[A-Za-z0-9_-]+/gu, "sb_[redacted]")
    .replace(/https?:\/\/[^\s)]+/gu, "[url]")
    .slice(0, 240);
}

function parseMetric(text, name) {
  const match = String(text ?? "").match(
    new RegExp(`${name}=([0-9]+)`, "u"),
  );
  return match === null ? null : Number(match[1]);
}

function readinessEvidence(config, values) {
  if (
    config.packageHash.length === 0 ||
    values.decision !== "PASS" ||
    values.reconnectRecovery?.passed !== true
  ) return undefined;
  const capturedAt = new Date().toISOString();
  const base = [
    {
      schemaVersion: 2,
      checkId: "COLLABORATION_2_TO_3",
      environment: "STAGING",
      status: "PASS",
      evidenceKind: "LIVE_OBSERVATION",
      packageHash: config.packageHash,
      sourceIdentity: "observed:staging:stage8-live-harness",
      capturedAt,
      summary: `Observed ${config.rows * config.passes} rapid broad Draw strokes across two authenticated staging clients.`,
      participants: 2,
    },
    {
      schemaVersion: 2,
      checkId: "RECONNECT_RECOVERY",
      environment: "STAGING",
      status: "PASS",
      evidenceKind: "LIVE_OBSERVATION",
      packageHash: config.packageHash,
      sourceIdentity: "observed:staging:stage8-live-harness",
      capturedAt,
      summary: `Observed ${values.reconnectRecovery.strokes} Draw strokes while client B was offline, followed by authoritative catch-up after reconnect.`,
    },
  ];
  return base.map((item) => ({
    ...item,
    evidenceHash: sha256(canonicalJson(item)),
  }));
}

async function pageState(page) {
  return await page.evaluate(() => {
    const body = document.body;
    const metrics = document.querySelector("#draw2Metrics")?.textContent ?? "";
    const members = document.querySelector("[data-draw2-sync-members]")?.textContent ?? "";
    return {
      composition: body.dataset.pixyncComposition ?? "",
      syncState: body.dataset.pixyncState ?? "",
      projectId: document.querySelector("#draw2ProjectId")?.value ?? "",
      persistenceState: body.dataset.drawPersistenceState ?? "",
      persistenceRevision: Number(body.dataset.drawPersistenceRevision ?? "0"),
      metrics,
      journal: metrics.match(/journal=([0-9]+)/u)?.[1] ?? null,
      checkpoints: metrics.match(/checkpoints=([0-9]+)/u)?.[1] ?? null,
      members,
      visibleAlerts: document.querySelectorAll('[role="alert"]').length,
      error: body.dataset.pixyncError ?? "",
    };
  });
}

async function pageIdentity(page) {
  return await page.evaluate(async () => {
    const client = globalThis.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__;
    const result = await client?.auth?.getUser?.();
    return typeof result?.data?.user?.id === "string" ? result.data.user.id : null;
  });
}

async function canvasSnapshot(page) {
  return await page.locator("#draw2Canvas").evaluate((canvas) => {
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("Canvas2D context is unavailable.");
    const sample = [];
    for (let y = 4; y < canvas.height - 4; y += 8) {
      for (let x = 4; x < canvas.width - 4; x += 8) {
        const pixel = context.getImageData(x, y, 1, 1).data;
        sample.push(pixel[0], pixel[1], pixel[2], pixel[3]);
      }
    }
    return {
      width: canvas.width,
      height: canvas.height,
      sample,
    };
  });
}

async function canvasDigest(page) {
  const dataUrl = await page.locator("#draw2Canvas").evaluate((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width < 1 || canvas.height < 1) {
      throw new Error("Draw2 canvas has no drawable backing surface.");
    }
    return canvas.toDataURL("image/png");
  });
  return sha256(dataUrl);
}

async function captureDrawPerformance(page) {
  try {
    return await page.evaluate(async () => {
      const observation = globalThis.__PIXIEED_STAGE8_DRAW_PERFORMANCE__;
      if (observation === undefined || observation === null) {
        return {
          profile: "2D_BROWSER_DRAW",
          status: "UNAVAILABLE",
          readinessEligible: false,
          missingMetrics: [
            "canvasReadyMs",
            "firstCanvasFrameMs",
            "productionReadyMs",
            "steadyFrameMs",
            "memoryBytes",
            "longTaskCount",
            "assetBytes",
            "decodedBytes",
          ],
        };
      }
      const frameDurations = [];
      let previousFrameAt = performance.now();
      await new Promise((resolve) => {
        let remaining = 30;
        const captureFrame = (timestamp) => {
          const duration = timestamp - previousFrameAt;
          if (Number.isFinite(duration) && duration >= 0) frameDurations.push(duration);
          previousFrameAt = timestamp;
          remaining -= 1;
          if (remaining <= 0) {
            resolve();
            return;
          }
          requestAnimationFrame(captureFrame);
        };
        requestAnimationFrame(captureFrame);
      });
      const finiteNonNegative = (value) =>
        typeof value === "number" && Number.isFinite(value) && value >= 0;
      const relativeMs = (value) =>
        finiteNonNegative(value) && finiteNonNegative(observation.startedAt) && value >= observation.startedAt
          ? value - observation.startedAt
          : null;
      const memoryBytes = finiteNonNegative(performance.memory?.usedJSHeapSize)
        ? performance.memory.usedJSHeapSize
        : null;
      const resources = performance.getEntriesByType("resource");
      let resourceTransferBytes = 0;
      let measuredResourceCount = 0;
      for (const entry of resources) {
        if (!finiteNonNegative(entry.transferSize)) continue;
        resourceTransferBytes += entry.transferSize;
        measuredResourceCount += 1;
      }
      const maxSteadyFrameMs = frameDurations.length === 0
        ? null
        : Math.max(...frameDurations);
      const missingMetrics = ["assetBytes", "decodedBytes"];
      if (memoryBytes === null) missingMetrics.push("memoryBytes");
      if (observation.longTaskSupported !== true) missingMetrics.push("longTaskCount");
      if (relativeMs(observation.canvasReadyAt) === null) missingMetrics.push("canvasReadyMs");
      if (relativeMs(observation.firstCanvasFrameAt) === null) missingMetrics.push("firstCanvasFrameMs");
      if (relativeMs(observation.productionReadyAt) === null) missingMetrics.push("productionReadyMs");
      if (maxSteadyFrameMs === null) missingMetrics.push("steadyFrameMs");
      return {
        profile: "2D_BROWSER_DRAW",
        status: "INCOMPLETE",
        readinessEligible: false,
        canvasReadyMs: relativeMs(observation.canvasReadyAt),
        firstCanvasFrameMs: relativeMs(observation.firstCanvasFrameAt),
        productionReadyMs: relativeMs(observation.productionReadyAt),
        steadyFrameMs: maxSteadyFrameMs,
        steadyFrameSamples: frameDurations.length,
        memoryBytes,
        longTaskCount: observation.longTaskSupported === true
          ? observation.longTaskCount
          : null,
        resourceTransferBytes,
        resourceCount: resources.length,
        measuredResourceCount,
        missingMetrics,
        note: "Observation only; asset and decoded byte ownership is not inferred from browser resource timing.",
      };
    });
  } catch (error) {
    return {
      profile: "2D_BROWSER_DRAW",
      status: "UNAVAILABLE",
      readinessEligible: false,
      missingMetrics: [
        "canvasReadyMs",
        "firstCanvasFrameMs",
        "productionReadyMs",
        "steadyFrameMs",
        "memoryBytes",
        "longTaskCount",
        "assetBytes",
        "decodedBytes",
      ],
      failure: sanitizeMessage(error),
    };
  }
}

async function waitForCanvasStable(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let previous = await canvasDigest(page);
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 120));
    const current = await canvasDigest(page);
    if (current === previous) return current;
    previous = current;
  }
  throw new Error("Draw2 canvas did not become stable before the timeout.");
}

function snapshotChanged(before, after) {
  if (before.width !== after.width || before.height !== after.height) return true;
  if (before.sample.length !== after.sample.length) return true;
  return before.sample.some((value, index) => value !== after.sample[index]);
}

async function waitForProduction(page, label, timeoutMs) {
  await page.waitForSelector("#draw2Canvas", { timeout: timeoutMs });
  try {
    await page.waitForFunction(
      () => document.body.dataset.pixyncComposition === "production" &&
        document.body.dataset.pixyncState === "subscribed",
      undefined,
      { timeout: timeoutMs },
    );
  } catch (error) {
    const state = await pageState(page).catch(() => ({}));
    throw new Error(
      `${label} did not reach production/subscribed: ${JSON.stringify({
        composition: state.composition,
        syncState: state.syncState,
        projectId: state.projectId,
        error: sanitizeMessage(state.error ?? ""),
      })}; ${sanitizeMessage(error)}`,
    );
  }
  await page.evaluate(() => {
    const observation = globalThis.__PIXIEED_STAGE8_DRAW_PERFORMANCE__;
    if (observation !== undefined && observation.productionReadyAt === null) {
      observation.productionReadyAt = performance.now();
    }
  });
}

async function configurePage(context, config, label, diagnostics) {
  const page = await context.newPage();
  await page.addInitScript({
    content: `(() => {
      globalThis.__PIXIEED_SUPABASE_CONFIG__ = ${JSON.stringify(config)};
      const observation = globalThis.__PIXIEED_STAGE8_DRAW_PERFORMANCE__ = {
        startedAt: performance.now(),
        canvasReadyAt: null,
        firstCanvasFrameAt: null,
        productionReadyAt: null,
        longTaskCount: 0,
        longTaskSupported: false,
      };
      const observeCanvas = () => {
        const canvas = document.querySelector("#draw2Canvas");
        if (canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0) {
          if (observation.canvasReadyAt === null) observation.canvasReadyAt = performance.now();
          requestAnimationFrame(() => {
            if (observation.firstCanvasFrameAt === null) observation.firstCanvasFrameAt = performance.now();
          });
          return;
        }
        requestAnimationFrame(observeCanvas);
      };
      requestAnimationFrame(observeCanvas);
      try {
        if (globalThis.PerformanceObserver?.supportedEntryTypes?.includes("longtask")) {
          const observer = new PerformanceObserver((list) => {
            observation.longTaskCount += list.getEntries().length;
          });
          observer.observe({ type: "longtask", buffered: true });
          observation.longTaskSupported = true;
          globalThis.__PIXIEED_STAGE8_DRAW_LONG_TASK_OBSERVER__ = observer;
        }
      } catch {
        observation.longTaskSupported = false;
      }
    })();`,
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(sanitizeMessage(error)));
  page.on("console", (message) => {
    if (message.type() === "warning") diagnostics.warnings += 1;
    if (message.type() === "error") diagnostics.consoleErrors += 1;
  });
  const url = new URL("pixiedraw2/", `${config.baseUrl}/`);
  url.searchParams.set("project", config.projectId);
  url.searchParams.set("mode", "DRAW");
  await page.goto(url.href, {
    waitUntil: "domcontentloaded",
    timeout: config.timeoutMs,
  });
  await waitForProduction(page, label, config.timeoutMs);
  return page;
}

async function waitForPresence(page, timeoutMs) {
  await page.waitForFunction(
    () => Number(
      document.querySelector("[data-draw2-sync-members]")?.textContent ?? "0",
    ) >= 2,
    undefined,
    { timeout: timeoutMs },
  );
}

async function selectPenAndColor(page, colorIndex = "2") {
  const group = page.locator('details[data-workspace-tool-group="draw"]');
  const summary = group.locator('summary[data-workspace-tool="pen"]');
  if ((await group.getAttribute("open")) === null) await summary.click();
  await group.locator('button[data-workspace-tool="pen"]').click();
  const color = page.locator(
    `#draw2WorkspacePaletteGrid button[data-color-index="${colorIndex}"]`,
  );
  await color.waitFor({ state: "visible" });
  await color.click();
}

async function drawRapidBroadStrokes(page, rows, passes, steps) {
  const canvas = page.locator("#draw2Canvas");
  const box = await canvas.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, "Draw2 canvas is not visible.");
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
  const top = 2;
  const bottom = dimensions.height - 3;
  const strokeCount = rows * passes;
  for (let pass = 0; pass < passes; pass += 1) {
    const reverse = pass % 2 === 1;
    for (let row = 0; row < rows; row += 1) {
      const pixelY = Math.round(
        top + ((row + 0.5) / rows) * (bottom - top),
      );
      const startX = reverse ? right : left;
      const endX = reverse ? left : right;
      const start = toClientPoint(reverse ? dimensions.width - 3 : 2, pixelY);
      await page.mouse.move(startX, start.y);
      await page.mouse.down();
      for (let step = 1; step <= steps; step += 1) {
        const ratio = step / steps;
        await page.mouse.move(
          startX + (endX - startX) * ratio,
          start.y,
        );
      }
      await page.mouse.up();
    }
  }
  return strokeCount;
}

async function waitForCanvasChange(page, before, timeoutMs) {
  await page.waitForFunction(
    (expected) => {
      const canvas = document.querySelector("#draw2Canvas");
      const context = canvas?.getContext("2d");
      if (canvas === null || context === null) return false;
      const sample = [];
      for (let y = 4; y < canvas.height - 4; y += 8) {
        for (let x = 4; x < canvas.width - 4; x += 8) {
          const pixel = context.getImageData(x, y, 1, 1).data;
          sample.push(pixel[0], pixel[1], pixel[2], pixel[3]);
        }
      }
      return sample.length !== expected.sample.length ||
        sample.some((value, index) => value !== expected.sample[index]);
    },
    before,
    { timeout: timeoutMs },
  );
}

async function waitForUnavailable(page, timeoutMs) {
  await page.waitForFunction(
    () => {
      const state = document.body.dataset.pixyncState ?? "";
      return state === "offline" || state === "reconnecting";
    },
    undefined,
    { timeout: timeoutMs },
  );
}

async function waitForSavedRevision(page, beforeRevision, timeoutMs) {
  await page.waitForFunction(
    (previous) => document.body.dataset.drawPersistenceState === "saved" &&
      Number(document.body.dataset.drawPersistenceRevision ?? "0") > previous,
    beforeRevision,
    { timeout: timeoutMs },
  );
}

function resultFor(config, diagnostics, values) {
  const evidence = readinessEvidence(config, values);
  return {
    schemaVersion: "PIXEEDSTUDIO-LIVE-OBSERVATION-V2",
    evidenceKind: "LIVE_OBSERVATION",
    environment: "STAGING",
    checkId: "STAGE8_LIVE_DRAW_BROAD_RAPID",
    decision: values.decision,
    projectIdSha256: sha256(config.projectId),
    clients: 2,
    drawing: {
      rows: config.rows,
      passes: config.passes,
      stepsPerStroke: config.steps,
      strokes: values.strokes ?? 0,
      durationMs: values.durationMs ?? null,
      performanceObservation: values.performanceObservation ?? null,
    },
    presenceMembers: values.presenceMembers ?? null,
    remoteRasterChanged: values.remoteRasterChanged ?? false,
    rasterDigest: values.rasterDigest ?? null,
    reconnectRecovery: values.reconnectRecovery ?? null,
    clientsState: values.clientsState ?? null,
    ...(evidence === undefined ? {} : { readinessEvidence: evidence }),
    diagnostics: {
      pageErrors: diagnostics.pageErrors.length,
      consoleWarnings: diagnostics.warnings,
      consoleErrors: diagnostics.consoleErrors,
    },
    untested: [
      "production",
      "physical devices",
      "Safari and Firefox",
      "server-side monitoring and rollback",
      "network interruption beyond browser offline emulation",
      "performance budget acceptance requiring asset and decoded byte measurements",
    ],
    ...(values.failure === undefined ? {} : { failure: sanitizeMessage(values.failure) }),
  };
}

async function writeEvidence(result) {
  const output = String(process.env.PIXIEED_STAGE8_EVIDENCE_OUT ?? "").trim();
  if (output.length === 0) return;
  const outputPath = path.resolve(output);
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

const config = {
  baseUrl: stagingBaseUrl(requiredEnv("PIXIEED_STAGE8_BASE_URL")),
  projectId: requiredEnv("PIXIEED_STAGE8_PROJECT_ID"),
  supabaseUrl: stagingSupabaseUrl(requiredEnv("PIXIEED_STAGE8_SUPABASE_URL")),
  publishableKey: publishableKey(
    requiredEnv("PIXIEED_STAGE8_SUPABASE_PUBLISHABLE_KEY"),
  ),
  storageKey: "",
  timeoutMs: boundedInteger(
    "PIXIEED_STAGE8_TIMEOUT_MS",
    DEFAULT_TIMEOUT_MS,
    5_000,
    120_000,
  ),
  rows: boundedInteger("PIXIEED_STAGE8_ROWS", DEFAULT_ROWS, 1, 96),
  passes: boundedInteger("PIXIEED_STAGE8_PASSES", DEFAULT_PASSES, 1, 2),
  steps: boundedInteger("PIXIEED_STAGE8_STEPS", DEFAULT_STEPS, 2, 16),
  packageHash: String(process.env.PIXIEED_STAGE8_PACKAGE_HASH ?? "").trim(),
};
assert.match(config.projectId, PROJECT_ID_PATTERN, "PIXIEED_STAGE8_PROJECT_ID must be a UUID.");
if (config.packageHash.length > 0) {
  assert.match(config.packageHash, /^[a-f0-9]{64}$/u, "PIXIEED_STAGE8_PACKAGE_HASH must be a SHA-256 hash.");
}
config.storageKey = safeStorageKey(
  String(process.env.PIXIEED_STAGE8_SUPABASE_STORAGE_KEY ?? "").trim(),
  config.supabaseUrl,
);
const storageStateA = storageStatePath("PIXIEED_STAGE8_STORAGE_STATE_A");
const storageStateB = storageStatePath("PIXIEED_STAGE8_STORAGE_STATE_B");
assert.notEqual(
  storageStateA,
  storageStateB,
  "The two Stage 8 storageState files must be different authenticated users.",
);

const diagnosticsA = { pageErrors: [], warnings: 0, consoleErrors: 0 };
const diagnosticsB = { pageErrors: [], warnings: 0, consoleErrors: 0 };
const diagnostics = {
  pageErrors: [],
  warnings: 0,
  consoleErrors: 0,
};
let browser;
let contextA;
let contextB;
let pageA;
let pageB;
let result;

try {
  browser = await chromium.launch({
    headless: String(process.env.PIXIEED_STAGE8_HEADLESS ?? "true") !== "false",
  });
  const contextOptions = {
    viewport: { width: 1440, height: 900 },
  };
  contextA = await browser.newContext({ ...contextOptions, storageState: storageStateA });
  contextB = await browser.newContext({ ...contextOptions, storageState: storageStateB });
  const pageConfig = {
    ...config,
    baseUrl: config.baseUrl,
    projectId: config.projectId,
    supabase: {
      url: config.supabaseUrl,
      publishableKey: config.publishableKey,
      storageKey: config.storageKey,
    },
  };
  pageA = await configurePage(contextA, {
    baseUrl: pageConfig.baseUrl,
    projectId: pageConfig.projectId,
    url: pageConfig.supabase.url,
    publishableKey: pageConfig.supabase.publishableKey,
    storageKey: pageConfig.supabase.storageKey,
    timeoutMs: pageConfig.timeoutMs,
  }, "client A", diagnosticsA);
  pageB = await configurePage(contextB, {
    baseUrl: pageConfig.baseUrl,
    projectId: pageConfig.projectId,
    url: pageConfig.supabase.url,
    publishableKey: pageConfig.supabase.publishableKey,
    storageKey: pageConfig.supabase.storageKey,
    timeoutMs: pageConfig.timeoutMs,
  }, "client B", diagnosticsB);

  const [identityA, identityB] = await Promise.all([
    pageIdentity(pageA),
    pageIdentity(pageB),
  ]);
  assert.ok(identityA && identityB, "Both staging clients must have an authenticated user.");
  assert.notEqual(identityA, identityB, "The two staging clients must be different users.");
  assert.equal((await pageState(pageA)).projectId, config.projectId);
  assert.equal((await pageState(pageB)).projectId, config.projectId);

  await Promise.all([
    waitForPresence(pageA, config.timeoutMs),
    waitForPresence(pageB, config.timeoutMs),
  ]);
  const presenceMembers = {
    a: Number((await pageState(pageA)).members),
    b: Number((await pageState(pageB)).members),
  };
  assert.ok(presenceMembers.a >= 2 && presenceMembers.b >= 2);

  await selectPenAndColor(pageA);
  const before = await canvasSnapshot(pageB);
  const beforeRevision = (await pageState(pageA)).persistenceRevision;
  const startedAt = performance.now();
  const strokes = await drawRapidBroadStrokes(
    pageA,
    config.rows,
    config.passes,
    config.steps,
  );
  const durationMs = Math.round(performance.now() - startedAt);
  await Promise.all([
    waitForSavedRevision(pageA, beforeRevision, config.timeoutMs),
    waitForCanvasChange(pageB, before, config.timeoutMs),
  ]);
  await Promise.all([
    waitForCanvasStable(pageA, config.timeoutMs),
    waitForCanvasStable(pageB, config.timeoutMs),
  ]);
  const [stateA, stateB] = await Promise.all([
    pageState(pageA),
    pageState(pageB),
  ]);
  const after = await canvasSnapshot(pageB);
  const [rasterDigestA, rasterDigestB] = await Promise.all([
    canvasDigest(pageA),
    canvasDigest(pageB),
  ]);
  assert.equal(
    rasterDigestA,
    rasterDigestB,
    "Authenticated staging clients must converge to the same full Canvas raster.",
  );
  assert.equal(snapshotChanged(before, after), true);
  assert.equal(stateA.projectId, config.projectId);
  assert.equal(stateB.projectId, config.projectId);
  assert.equal(stateA.composition, "production");
  assert.equal(stateB.composition, "production");
  assert.equal(stateA.syncState, "subscribed");
  assert.equal(stateB.syncState, "subscribed");
  assert.equal(stateA.visibleAlerts, 0);
  assert.equal(stateB.visibleAlerts, 0);
  assert.equal(stateA.error, "");
  assert.equal(stateB.error, "");
  const reconnectBefore = await canvasSnapshot(pageB);
  await contextB.setOffline(true);
  let reconnectRecovery;
  try {
    await waitForUnavailable(pageB, config.timeoutMs);
    const offlineState = await pageState(pageB);
    await selectPenAndColor(pageA, "1");
    const reconnectStrokes = await drawRapidBroadStrokes(
      pageA,
      Math.max(4, Math.min(8, config.rows)),
      1,
      config.steps,
    );
    const reconnectRevision = stateA.persistenceRevision;
    await waitForSavedRevision(pageA, reconnectRevision, config.timeoutMs);
    await contextB.setOffline(false);
    await waitForProduction(pageB, "client B after reconnect", config.timeoutMs);
    await waitForCanvasChange(pageB, reconnectBefore, config.timeoutMs);
    await Promise.all([
      waitForCanvasStable(pageA, config.timeoutMs),
      waitForCanvasStable(pageB, config.timeoutMs),
    ]);
    const reconnectedState = await pageState(pageB);
    const reconnectAfter = await canvasSnapshot(pageB);
    const [reconnectedDigestA, reconnectedDigestB] = await Promise.all([
      canvasDigest(pageA),
      canvasDigest(pageB),
    ]);
    assert.equal(
      reconnectedDigestA,
      reconnectedDigestB,
      "Canvas raster must still converge after staging reconnect catch-up.",
    );
    assert.equal(snapshotChanged(reconnectBefore, reconnectAfter), true);
    assert.equal(reconnectedState.projectId, config.projectId);
    assert.equal(reconnectedState.composition, "production");
    assert.equal(reconnectedState.syncState, "subscribed");
    assert.equal(reconnectedState.visibleAlerts, 0);
    assert.equal(reconnectedState.error, "");
    reconnectRecovery = {
      passed: true,
      offlineState: offlineState.syncState,
      reconnectedState: reconnectedState.syncState,
      strokes: reconnectStrokes,
      remoteRasterChanged: true,
    };
  } finally {
    await contextB.setOffline(false).catch(() => undefined);
  }
  const allPageErrors = [...diagnosticsA.pageErrors, ...diagnosticsB.pageErrors];
  const allConsoleErrors = diagnosticsA.consoleErrors + diagnosticsB.consoleErrors;
  assert.equal(allPageErrors.length, 0, "Staging clients must not emit page errors.");
  assert.equal(allConsoleErrors, 0, "Staging clients must not emit console errors.");
  const finalStateA = await pageState(pageA);
  const finalStateB = await pageState(pageB);
  const performanceObservation = {
    clientA: await captureDrawPerformance(pageA),
    clientB: await captureDrawPerformance(pageB),
  };
  result = resultFor(
    config,
    {
      pageErrors: [...diagnosticsA.pageErrors, ...diagnosticsB.pageErrors],
      warnings: diagnosticsA.warnings + diagnosticsB.warnings,
      consoleErrors: diagnosticsA.consoleErrors + diagnosticsB.consoleErrors,
    },
    {
      decision: "PASS",
      strokes,
      durationMs,
      presenceMembers,
      remoteRasterChanged: true,
      rasterDigest: rasterDigestA,
      reconnectRecovery,
      performanceObservation,
      clientsState: {
        a: {
          composition: finalStateA.composition,
          syncState: finalStateA.syncState,
          persistenceState: finalStateA.persistenceState,
          persistenceRevision: finalStateA.persistenceRevision,
          journal: parseMetric(finalStateA.metrics, "journal"),
          checkpoints: parseMetric(finalStateA.metrics, "checkpoints"),
        },
        b: {
          composition: finalStateB.composition,
          syncState: finalStateB.syncState,
          persistenceState: finalStateB.persistenceState,
          persistenceRevision: finalStateB.persistenceRevision,
          journal: parseMetric(finalStateB.metrics, "journal"),
          checkpoints: parseMetric(finalStateB.metrics, "checkpoints"),
        },
      },
    },
  );
} catch (error) {
  diagnostics.pageErrors.push(...diagnosticsA.pageErrors, ...diagnosticsB.pageErrors);
  diagnostics.warnings += diagnosticsA.warnings + diagnosticsB.warnings;
  diagnostics.consoleErrors += diagnosticsA.consoleErrors + diagnosticsB.consoleErrors;
  result = resultFor(config, diagnostics, {
    decision: "FAIL",
    failure: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
} finally {
  await pageB?.close().catch(() => undefined);
  await pageA?.close().catch(() => undefined);
  await contextB?.close().catch(() => undefined);
  await contextA?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
}

await writeEvidence(result);
console.log(JSON.stringify(result, null, 2));

