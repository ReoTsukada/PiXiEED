import assert from "node:assert/strict";
import { createRequire } from "node:module";

const requireFromScreenshots = createRequire(new URL("../tools/screenshots/package.json", import.meta.url));
const { chromium } = requireFromScreenshots("playwright");
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error?.stack || error)));
  await page.addInitScript(() => {
    // This test exercises the local seller UI and request boundary only; it
    // never creates a real session or calls Supabase, Storage, Stripe, or a
    // purchase endpoint.
    const calls = [];
    const user = {
      id: "market-composition-browser-test",
      email: "market-composition@example.invalid",
      email_confirmed_at: "2026-01-01T00:00:00Z",
    };
    const client = {
      rpc: async (name, input) => {
        calls.push({ name, input });
        if (name === "market_current_user_can_sell") return { data: true, error: null };
        if (name === "market_create_root_asset_v8") return { data: `asset-${calls.length}`, error: null };
        return { data: null, error: null };
      },
      from: () => {
        const query = {};
        for (const method of ["select", "eq", "gt", "gte", "lt", "lte", "order", "limit", "range"]) {
          query[method] = () => query;
        }
        query.then = (resolve, reject) => Promise.resolve({ data: null, error: null }).then(resolve, reject);
        return query;
      },
      storage: {
        from: () => ({
          upload: async () => ({ data: {}, error: null }),
          remove: async () => ({ data: {}, error: null }),
        }),
      },
      functions: {
        invoke: async (name, options) => {
          calls.push({ name, input: options?.body ?? null });
          const body = options?.body ?? {};
          return {
            data: {
              ok: true,
              manifest_object_path: body.manifest_object_path,
              file_object_paths: body.file_object_paths,
              preview_object_path: body.preview_object_path,
              sample_preview_paths: body.sample_preview_paths ?? [],
            },
            error: null,
          };
        },
      },
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        getSession: async () => ({ data: { session: { user } }, error: null }),
        getUser: async () => ({ data: { user }, error: null }),
      },
      channel: () => {
        const channel = {
          on: () => channel,
          subscribe: () => channel,
          unsubscribe: async () => "ok",
        };
        return channel;
      },
    };
    window.__marketCompositionCalls = calls;
    window.PiXiEEDMarketAccess = {
      check: async () => ({ allowed: true, authenticated: true, user, client }),
      getClient: async () => client,
    };
  });
  await page.goto("http://127.0.0.1:8000/market/sell.html", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.waitForTimeout(700);

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const audio = Buffer.from([0, 1, 2, 3]);
  const pxd = Buffer.from([80, 75, 3, 4, 1, 2, 3, 4]);
  await page.locator("#listingFiles").setInputFiles([
    { name: "hero.png", mimeType: "image/png", buffer: png },
    { name: "theme.mp3", mimeType: "audio/mpeg", buffer: audio },
    { name: "project.pxd", mimeType: "application/zip", buffer: pxd },
  ]);
  await page.waitForTimeout(900);

  const compositions = [
    ["image-only", 1],
    ["audio-only", 1],
    ["image-audio", 2],
    ["pixiedraw-project", 1],
    ["all-files", 3],
  ];
  assert.match(
    await page.locator("#listingCompositionStatus").textContent(),
    /音声形式も購入後にZIP/,
  );
  for (const [id, expectedFormatCount] of compositions) {
    await page.locator("#listingFiles").setInputFiles([
      { name: "hero.png", mimeType: "image/png", buffer: png },
      { name: "theme.mp3", mimeType: "audio/mpeg", buffer: audio },
      { name: "project.pxd", mimeType: "application/zip", buffer: pxd },
    ]);
    await page.waitForTimeout(450);
    const radio = page.locator(`#listingPackageComposition input[value="${id}"]`);
    assert.equal(await radio.isDisabled(), false, `${id} must be available`);
    await radio.evaluate((element) => element.click());
    assert.equal(await radio.isChecked(), true, `${id} must be selected`);
    assert.equal(
      await page.locator("#listingFormatSwitches input:checked").count(),
      expectedFormatCount,
      `${id} selected-format count`,
    );
    await page.locator("#listingTitle").fill(`Composition ${id}`);
    await page.locator("#listingDescription").fill("Browser composition boundary test");
    await page.locator("#listingPrice").fill("500");
    await page.locator('input[name="listingAiUsage"][value="not-used"]').check({ force: true });
    await page.locator("#listingTermsConfirmed").check();
    await page.locator("#listingPrivacyConfirmed").check();
    await page.locator("#listingRights").check();
    await page.locator("#listingSubmit").click();
    await page.waitForFunction(() => /出品を公開しました/.test(
      document.querySelector("#listingStatus")?.textContent || "",
    ), { timeout: 15_000 });
    const submitted = await page.evaluate((composition) => {
      const calls = window.__marketCompositionCalls || [];
      const draft = [...calls].reverse().find((call) => call.name === "market_create_root_asset_v8");
      return {
        composition: draft?.input?.input_provenance_manifest?.product_composition,
        formats: draft?.input?.input_asset_formats,
      };
    }, id);
    assert.equal(submitted.composition, id, `${id} submission composition`);
    assert.equal(submitted.formats.length, expectedFormatCount, `${id} submitted format count`);
  }
  assert.deepEqual(pageErrors, []);
  console.log("market composition browser: 5 package compositions and submission payloads passed");
} finally {
  await browser.close();
}
