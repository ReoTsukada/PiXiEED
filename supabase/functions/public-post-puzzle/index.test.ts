import assert from "node:assert/strict";
import { createDrawDocument, encodePng } from "../../../js/creation/draw-core.mjs";
import { inspectPixelPng } from "../_shared/pixel-png.mjs";
import { admitPuzzleUpload } from "../_shared/puzzle-admission.mjs";
import { publicPostPuzzleHandler } from "./index.ts";

const POST_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT = "https://example.supabase.co";
const NOW = "2026-09-28T12:00:00.000Z";

async function fixture() {
  const bytes = encodePng(createDrawDocument(16));
  const claim = { mimeType: "image/png", size: bytes.length, ...await inspectPixelPng(bytes) };
  const source = { schemaVersion: 1, original: { draftId: "draw", assetId: "asset", revisionId: "rev", contentHash: "a".repeat(64), hashScheme: "sha256-canonical-v1" } };
  const targets = [{ id: "flower", name: "花", pixels: [] as number[] }];
  for (let y = 5; y < 10; y += 1) for (let x = 5; x < 10; x += 1) targets[0].pixels.push(y * 16 + x);
  const admitted = await admitPuzzleUpload({ mode: "hidden_object", source, definition: {
    schemaVersion: 1, width: 16, height: 16, confirmed: true, targets,
  } }, bytes, claim);
  return {
    bytes,
    snapshot: {
      requestedPostId: POST_ID,
      parent: { id: POST_ID, status: "published", publishedAt: NOW, title: "公開作品", authorLabel: "作者", imageClaim: claim, authorId: "private" },
      point: { postId: POST_ID, publishedAt: NOW, imagePath: `${POST_ID}/original.png`, privateCell: "secret" },
      puzzle: { postId: POST_ID, reviewState: "approved", mode: "hidden_object", schemaVersion: 1, definition: admitted.definition, source_metadata: source, moderation_note: "private" },
    },
  };
}

function request(url: string, method = "GET") { return new Request(url, { method, headers: { origin: "https://pixieed.jp" } }); }

Deno.test("invalid/duplicate query rejects before privileged database access", async () => {
  let called = false;
  const handler = (req: Request) => publicPostPuzzleHandler(req, { projectUrl: PROJECT, serviceKey: "test", createClient: (() => { called = true; throw new Error("unexpected"); }) as never });
  assert.equal((await handler(request(`${PROJECT}/functions/v1/public-post-puzzle?postId=bad`))).status, 400);
  assert.equal((await handler(request(`${PROJECT}/functions/v1/public-post-puzzle?postId=${POST_ID}&postId=${POST_ID}`))).status, 400);
  assert.equal(called, false);
});

Deno.test("OPTIONS returns an empty 204 and does not initialize Supabase", async () => {
  const response = await publicPostPuzzleHandler(request(`${PROJECT}/functions/v1/public-post-puzzle`, "OPTIONS"), {
    createClient: (() => { throw new Error("unexpected"); }) as never,
  });
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
});

Deno.test("public reader returns only validated allowlist response from RPC snapshot and real PNG bytes", async () => {
  const { bytes, snapshot } = await fixture();
  const calls: string[] = [];
  const fakeClient = (() => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(`rpc:${name}:${args.p_post_id}`);
      return { data: snapshot, error: null };
    },
    storage: { from: (bucket: string) => ({ download: async (path: string) => {
      calls.push(`download:${bucket}:${path}`);
      return { data: new Blob([bytes], { type: "image/png" }), error: null };
    } }) },
  })) as never;
  const result = await publicPostPuzzleHandler(request(`${PROJECT}/functions/v1/public-post-puzzle?postId=${POST_ID}`), {
    createClient: fakeClient, projectUrl: PROJECT, serviceKey: "test",
  });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "no-store, max-age=0");
  const body = await result.json();
  assert.deepEqual(Object.keys(body), ["ok", "puzzle"]);
  assert.equal(body.puzzle.mode, "hidden_object");
  assert.equal(body.puzzle.title, "公開作品");
  assert.equal(JSON.stringify(body).includes("private"), false);
  assert.equal(JSON.stringify(body).includes("secret"), false);
  assert.deepEqual(calls, [
    `rpc:pixieed_read_public_puzzle:${POST_ID}`,
    `download:post-public:${POST_ID}/original.png`,
  ]);
});

Deno.test("missing, unpublished, RPC failure, and oversized storage data fail closed", async () => {
  const base = await fixture();
  const client = (data: unknown, error: unknown = null, size?: number) => (() => ({
    rpc: async () => ({ data, error }),
    storage: { from: () => ({ download: async () => ({ data: new Blob([new Uint8Array(size ?? base.bytes.length)]), error: null }) }) },
  })) as never;
  const call = (createClient: never) => publicPostPuzzleHandler(request(`${PROJECT}/?postId=${POST_ID}`), { createClient, projectUrl: PROJECT, serviceKey: "test" });
  assert.equal((await call(client(null))).status, 404);
  assert.equal((await call(client(null, new Error("database unavailable")))).status, 503);
  const hidden = structuredClone(base.snapshot); hidden.parent.status = "hidden";
  assert.equal((await call(client(hidden))).status, 404);
  assert.equal((await call(client(base.snapshot, null, 512 * 1024 + 1))).status, 503);
});
