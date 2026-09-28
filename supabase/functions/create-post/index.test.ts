import assert from "node:assert/strict";
import { createDrawDocument, encodePng } from "../../../js/creation/draw-core.mjs";
import { inspectPixelPng } from "../_shared/pixel-png.mjs";
import { createPostHandler } from "./index.ts";

const POST_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_KEY = "33333333-3333-4333-8333-333333333333";
const PROJECT = "https://example.supabase.co";

async function body(requestKey?: string, puzzleMode?: "hidden_object" | "spot_difference") {
  const bytes = encodePng(createDrawDocument(16));
  const payload: Record<string, unknown> = {
    title: "作品",
    caption: "説明",
    postKind: "pixel_art",
    image: { mimeType: "image/png", size: bytes.length, ...await inspectPixelPng(bytes), base64: btoa(String.fromCharCode(...bytes)) },
    location: { mapCell: { grid: 64, x: 3, y: 4, prefectureCode: "13" } },
    ...(requestKey ? { requestKey } : {}),
  };
  if (puzzleMode) {
    const pixels: number[] = [];
    for (let y = 5; y < 10; y += 1) for (let x = 5; x < 10; x += 1) pixels.push(y * 16 + x);
    const sourceRef = { draftId: "draw", assetId: "asset", revisionId: "rev", contentHash: "a".repeat(64), hashScheme: "sha256-canonical-v1" };
    const puzzle: Record<string, unknown> = {
      mode: puzzleMode,
      source: { schemaVersion: 1, original: sourceRef, ...(puzzleMode === "spot_difference" ? { changed: { ...sourceRef, revisionId: "rev2", contentHash: "b".repeat(64) } } : {}) },
      definition: puzzleMode === "hidden_object"
        ? { schemaVersion: 1, width: 16, height: 16, confirmed: true, targets: [{ id: "flower", name: "花", pixels }] }
        : { schemaVersion: 1, width: 16, height: 16, confirmed: true, candidates: [{ id: "spot1", pixels: [4] }] },
    };
    if (puzzleMode === "spot_difference") {
      const changedDocument = structuredClone(createDrawDocument(16));
      changedDocument.pixels[4] = 2;
      const changedBytes = encodePng(changedDocument);
      puzzle.changedImage = { mimeType: "image/png", size: changedBytes.length, ...await inspectPixelPng(changedBytes), base64: btoa(String.fromCharCode(...changedBytes)) };
    }
    payload.puzzle = puzzle;
  }
  return payload;
}

function mockCreateClient(options: {
  lookup?: { data?: unknown; error?: { message: string } | null } | Array<{ data?: unknown; error?: { message: string } | null }>;
  create?: { data?: unknown; error?: { message: string } | null };
  puzzleMode?: "hidden_object" | "spot_difference";
}) {
  const calls: string[] = [];
  let lookupIndex = 0;
  const factory = ((_url: string, key: string) => key === "public"
    ? { auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) } }
    : {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push(`rpc:${name}`);
        if (name === "pixieed_lookup_post_request") {
          const lookup = Array.isArray(options.lookup) ? options.lookup[lookupIndex++] : options.lookup;
          return lookup || { data: null, error: null };
        }
        assert.equal(name, "pixieed_create_post");
        assert.equal((args.p_post as Record<string, unknown>).author_id, USER_ID);
        if (options.puzzleMode) {
          const puzzle = args.p_puzzle as Record<string, unknown>;
          assert.equal(puzzle.mode, options.puzzleMode);
          if (options.puzzleMode === "hidden_object") {
            assert.equal(Object.hasOwn(puzzle, "changed_image_path"), false);
            assert.equal(Object.hasOwn(puzzle, "changed_image_claim"), false);
          } else {
            assert.equal((puzzle.changed_image_claim as Record<string, unknown>).mimeType, "image/png");
            assert.match(String(puzzle.changed_image_path), new RegExp(`^${USER_ID}/`));
          }
        } else assert.equal(args.p_puzzle, null);
        return options.create || { data: { postId: (args.p_post as Record<string, unknown>).id, status: "pending", replayed: false }, error: null };
      },
      storage: { from: (bucket: string) => ({
        upload: async (path: string) => { calls.push(`upload:${bucket}:${path}`); return { error: null }; },
        remove: async (paths: string[]) => { calls.push(`remove:${paths.join(",")}`); return { error: null }; },
      }) },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    }) as never;
  return { factory, calls };
}

function request(payload: unknown) {
  return new Request(`${PROJECT}/functions/v1/create-post`, {
    method: "POST", headers: { authorization: "Bearer user-token", "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

Deno.test("ordinary post remains compatible and commits through one RPC", async () => {
  const fixture = mockCreateClient({});
  const response = await createPostHandler(request(await body()), {
    createClient: fixture.factory, projectUrl: PROJECT, publishableKey: "public", serviceKey: "secret",
  });
  assert.equal(response.status, 201);
  assert.match((await response.json()).postId, /^[0-9a-f-]{36}$/i);
  assert.ok(fixture.calls.some((call) => call.startsWith("upload:post-quarantine:")));
  assert.ok(fixture.calls.includes("rpc:pixieed_create_post"));
});

Deno.test("request-key replay resolves before any upload or new DB insert", async () => {
  const fixture = mockCreateClient({ lookup: { data: { postId: POST_ID, status: "pending", replayed: true }, error: null } });
  const response = await createPostHandler(request(await body(REQUEST_KEY)), {
    createClient: fixture.factory, projectUrl: PROJECT, publishableKey: "public", serviceKey: "secret",
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).postId, POST_ID);
  assert.deepEqual(fixture.calls, ["rpc:pixieed_lookup_post_request"]);
});

Deno.test("an ambiguous concurrent create converges by key and removes only the losing attempt files", async () => {
  const fixture = mockCreateClient({
    lookup: [
      { data: null, error: null },
      { data: { postId: POST_ID, status: "pending", replayed: true }, error: null },
    ],
    create: { data: null, error: { message: "transport_failed_after_commit" } },
  });
  const response = await createPostHandler(request(await body(REQUEST_KEY)), {
    createClient: fixture.factory, projectUrl: PROJECT, publishableKey: "public", serviceKey: "secret",
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).postId, POST_ID);
  assert.equal(fixture.calls.filter((call) => call.startsWith("upload:")).length, 1);
  assert.equal(fixture.calls.filter((call) => call.startsWith("remove:")).length, 1);
});

Deno.test("hidden definition uses the fixed RPC contract without changed-image keys", async () => {
  const fixture = mockCreateClient({ puzzleMode: "hidden_object" });
  const response = await createPostHandler(request(await body(undefined, "hidden_object")), {
    createClient: fixture.factory, projectUrl: PROJECT, publishableKey: "public", serviceKey: "secret",
  });
  assert.equal(response.status, 201);
  assert.ok(fixture.calls.includes("rpc:pixieed_create_post"));
});

Deno.test("Spot definition uploads the admitted changed PNG and sends its measured claim", async () => {
  const fixture = mockCreateClient({ puzzleMode: "spot_difference" });
  const response = await createPostHandler(request(await body(undefined, "spot_difference")), {
    createClient: fixture.factory, projectUrl: PROJECT, publishableKey: "public", serviceKey: "secret",
  });
  assert.equal(response.status, 201);
  assert.equal(fixture.calls.filter((call) => call.startsWith("upload:post-quarantine:")).length, 2);
});

Deno.test("digest mismatch is a conflict and lookup failures fail closed", async () => {
  for (const result of [
    { lookup: { data: null, error: { message: "request_digest_mismatch" } }, expected: 409 },
    { lookup: { data: null, error: { message: "database timeout" } }, expected: 500 },
  ]) {
    const fixture = mockCreateClient(result);
    const response = await createPostHandler(request(await body(REQUEST_KEY)), {
      createClient: fixture.factory, projectUrl: PROJECT, publishableKey: "public", serviceKey: "secret",
    });
    assert.equal(response.status, result.expected);
    assert.deepEqual(fixture.calls, ["rpc:pixieed_lookup_post_request"]);
  }
});
