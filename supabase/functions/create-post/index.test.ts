import assert from "node:assert/strict";
import { createDrawDocument, encodePng } from "../../../js/creation/draw-core.mjs";
import { inspectPixelPng } from "../_shared/pixel-png.mjs";
import { createPostHandler } from "./index.ts";

const POST_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_KEY = "33333333-3333-4333-8333-333333333333";
const PROJECT = "https://example.supabase.co";

type PuzzleMode = "hidden_object" | "spot_difference";
type FixtureOptions = {
  lookup?: { data?: unknown; error?: { message: string } | null } | Array<{ data?: unknown; error?: { message: string } | null }>;
  create?: { data?: unknown; error?: { message: string } | null };
  puzzleMode?: PuzzleMode;
  postKind?: "pixel_art" | "pixel_camera";
  initialPostId?: string;
  initialStatus?: string;
  ownerId?: string;
  publish?: "success" | "error_pending" | "race_published";
  publicUploadError?: boolean;
  pointMissing?: boolean;
};

async function body(requestKey?: string, puzzleMode?: PuzzleMode, postKind: "pixel_art" | "pixel_camera" = "pixel_art") {
  const bytes = encodePng(createDrawDocument(16));
  const payload: Record<string, unknown> = {
    title: "作品", caption: "説明", postKind,
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

function mockCreateClient(options: FixtureOptions) {
  const calls: string[] = [];
  let lookupIndex = 0;
  let postId = options.initialPostId || "";
  let status = options.initialStatus || "pending";
  let ownerId = options.ownerId || USER_ID;
  let pointPath = options.pointMissing ? "" : (status === "published" ? `${POST_ID}/existing.png` : "");
  let puzzleMode = options.puzzleMode || null;
  let postKind = options.postKind || "pixel_art";
  const factory = ((_url: string, key: string) => key === "public"
    ? { auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) } }
    : {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push(`rpc:${name}`);
        if (name === "pixieed_lookup_post_request") {
          const lookup = Array.isArray(options.lookup) ? options.lookup[lookupIndex++] : options.lookup;
          return lookup || { data: null, error: null };
        }
        if (name === "pixieed_create_post") {
          const record = args.p_post as Record<string, unknown>;
          assert.equal(record.author_id, USER_ID);
          postId = String(record.id);
          ownerId = options.initialPostId ? (options.ownerId || String(record.author_id)) : String(record.author_id);
          const createdKind = String(record.post_kind);
          assert.ok(createdKind === "pixel_art" || createdKind === "pixel_camera");
          postKind = createdKind;
          status = "pending";
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
          return options.create || { data: { postId, status: "pending", replayed: false }, error: null };
        }
        assert.equal(name, "pixieed_moderate_post");
        const point = args.p_point as Record<string, unknown>;
        calls.push(`moderate:${String(args.p_action)}`);
        if (options.publish === "error_pending") return { data: null, error: new Error("rpc_failed") };
        status = "published";
        pointPath = String(point.public_image_path);
        if (options.publish === "race_published") return { data: null, error: new Error("response_lost_after_commit") };
        return { data: { postId, status: "published" }, error: null };
      },
      storage: { from: (bucket: string) => ({
        upload: async (path: string) => {
          calls.push(`upload:${bucket}:${path}`);
          return { error: bucket === "post-public" && options.publicUploadError ? new Error("public_upload_failed") : null };
        },
        download: async () => ({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null }),
        remove: async (paths: string[]) => { calls.push(`remove:${bucket}:${paths.join(",")}`); return { error: null }; },
      }) },
      from: (table: string) => ({
        select: (_columns: string) => ({ eq: (_column: string, _value: unknown) => ({ maybeSingle: async () => {
          if (table === "user_posts") return { data: postId ? { id: postId, author_id: ownerId, status, post_kind: postKind,
            title: "作品", caption: "説明", image_path: `${USER_ID}/${postId}.png`, image_mime: "image/png" } : null, error: null };
          if (table === "user_post_puzzles") return { data: puzzleMode ? { mode: puzzleMode, changed_image_path: null } : null, error: null };
          if (table === "post_locations_private") return { data: { cell_grid: 64, cell_x: 3, cell_y: 4, prefecture_code: "13" }, error: null };
          if (table === "post_map_points") return { data: pointPath ? { post_id: postId, public_image_path: pointPath } : null, error: null };
          throw new Error(`Unexpected table ${table}`);
        } }) }),
      }),
    }) as never;
  return { factory, calls, get status() { return status; } };
}

function request(payload: unknown) {
  return new Request(`${PROJECT}/functions/v1/create-post`, {
    method: "POST", headers: { authorization: "Bearer user-token", "content-type": "application/json" }, body: JSON.stringify(payload),
  });
}

const deps = (factory: ReturnType<typeof mockCreateClient>["factory"]) => ({
  createClient: factory, projectUrl: PROJECT, publishableKey: "public", serviceKey: "secret",
});

Deno.test("ordinary pixel_art and pixel_camera posts publish through the existing moderation path", async () => {
  for (const postKind of ["pixel_art", "pixel_camera"] as const) {
    const fixture = mockCreateClient({ postKind });
    const response = await createPostHandler(request(await body(undefined, undefined, postKind)), deps(fixture.factory));
    const result = await response.json();
    assert.equal(response.status, 201);
    assert.equal(result.status, "published");
    assert.equal(result.post_kind, undefined);
    assert.ok(fixture.calls.includes("rpc:pixieed_create_post"));
    assert.ok(fixture.calls.includes("rpc:pixieed_moderate_post"));
    assert.ok(fixture.calls.some((call) => call.startsWith("upload:post-public:")));
    assert.ok(!fixture.calls.some((call) => call.startsWith("remove:post-public:")));
  }
});

Deno.test("pending request-key replay auto-publishes without a second quarantine upload or insert", async () => {
  const fixture = mockCreateClient({ initialPostId: POST_ID, initialStatus: "pending",
    lookup: { data: { postId: POST_ID, status: "pending", replayed: true }, error: null } });
  const response = await createPostHandler(request(await body(REQUEST_KEY)), deps(fixture.factory));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "published");
  assert.deepEqual(fixture.calls.filter((call) => call.startsWith("upload:post-quarantine:") || call === "rpc:pixieed_create_post"), []);
  assert.ok(fixture.calls.includes("rpc:pixieed_moderate_post"));
});

Deno.test("ambiguous concurrent create resolves by request key and publishes the winning post", async () => {
  const fixture = mockCreateClient({
    lookup: [
      { data: null, error: null },
      { data: { postId: POST_ID, status: "pending", replayed: true }, error: null },
    ],
    create: { data: null, error: { message: "transport_failed_after_commit" } },
  });
  const response = await createPostHandler(request(await body(REQUEST_KEY)), deps(fixture.factory));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).postId, POST_ID);
  assert.equal((await Promise.resolve(fixture.status)), "published");
  assert.equal(fixture.calls.filter((call) => call.startsWith("upload:post-quarantine:")).length, 1);
  assert.equal(fixture.calls.filter((call) => call.startsWith("remove:post-quarantine:")).length, 1);
  assert.ok(fixture.calls.includes("rpc:pixieed_moderate_post"));
});

Deno.test("a request-key digest mismatch remains a conflict and fails before side effects", async () => {
  const fixture = mockCreateClient({ lookup: { data: null, error: { message: "request_digest_mismatch" } } });
  const response = await createPostHandler(request(await body(REQUEST_KEY)), deps(fixture.factory));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "request_key_digest_mismatch");
  assert.deepEqual(fixture.calls, ["rpc:pixieed_lookup_post_request"]);
});

Deno.test("puzzle posts remain pending for moderation", async () => {
  for (const puzzleMode of ["hidden_object", "spot_difference"] as const) {
    const fixture = mockCreateClient({ puzzleMode });
    const response = await createPostHandler(request(await body(undefined, puzzleMode)), deps(fixture.factory));
    assert.equal(response.status, 201);
    assert.equal((await response.json()).status, "pending");
    assert.equal(fixture.status, "pending");
    assert.ok(!fixture.calls.includes("rpc:pixieed_moderate_post"));
    assert.equal(fixture.calls.filter((call) => call.startsWith("upload:post-quarantine:")).length, puzzleMode === "spot_difference" ? 2 : 1);
  }
});

Deno.test("hidden and rejected replays are not republished", async () => {
  for (const status of ["hidden", "rejected"]) {
    const fixture = mockCreateClient({ initialPostId: POST_ID, initialStatus: status,
      lookup: { data: { postId: POST_ID, status, replayed: true }, error: null } });
    const response = await createPostHandler(request(await body(REQUEST_KEY)), deps(fixture.factory));
    assert.equal(response.status, 409);
    assert.equal(fixture.status, status);
    assert.ok(!fixture.calls.includes("rpc:pixieed_moderate_post"));
    assert.ok(!fixture.calls.some((call) => call.startsWith("upload:")));
  }
});

Deno.test("publication refuses a post owned by another author and retains the saved upload for retry", async () => {
  const fixture = mockCreateClient({ initialPostId: POST_ID, initialStatus: "pending",
    ownerId: "44444444-4444-4444-8444-444444444444",
    lookup: { data: { postId: POST_ID, status: "pending", replayed: true }, error: null } });
  const response = await createPostHandler(request(await body(REQUEST_KEY)), deps(fixture.factory));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "post_publication_failed");
  assert.equal(fixture.status, "pending");
  assert.ok(!fixture.calls.includes("rpc:pixieed_moderate_post"));
  assert.ok(!fixture.calls.some((call) => call.startsWith("upload:")));
});

Deno.test("failed public upload leaves quarantine post retryable", async () => {
  const fixture = mockCreateClient({ publicUploadError: true });
  const response = await createPostHandler(request(await body()), deps(fixture.factory));
  assert.equal(response.status, 503);
  assert.equal(fixture.status, "pending");
  assert.ok(fixture.calls.some((call) => call.startsWith("upload:post-public:")));
  assert.ok(!fixture.calls.some((call) => call.startsWith("remove:post-quarantine:")));
});

Deno.test("a publication race is successful only when the committed map point is verified", async () => {
  const fixture = mockCreateClient({ publish: "race_published" });
  const response = await createPostHandler(request(await body()), deps(fixture.factory));
  assert.equal(response.status, 201);
  assert.equal((await response.json()).status, "published");
  assert.ok(!fixture.calls.some((call) => call.startsWith("remove:post-public:")));

  const missingPoint = mockCreateClient({ initialPostId: POST_ID, initialStatus: "published", pointMissing: true,
    lookup: { data: { postId: POST_ID, status: "published", replayed: true }, error: null } });
  const failed = await createPostHandler(request(await body(REQUEST_KEY)), deps(missingPoint.factory));
  assert.equal(failed.status, 503);
});
