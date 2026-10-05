import assert from "node:assert/strict";
import { publishOrdinaryPost } from "./auto-publish-post.ts";

const POST_ID = "123e4567-e89b-42d3-a456-426614174000";
const USER_ID = "22222222-2222-4222-8222-222222222222";

function makeAdmin(options: {
  status?: string;
  ownerId?: string;
  postKind?: string;
  puzzle?: boolean;
  publish?: "success" | "error_pending" | "race_published";
  mapPoint?: boolean;
} = {}) {
  let status = options.status || "pending";
  let pointPath = options.mapPoint ? `${POST_ID}/existing.png` : "";
  let uploadedPath = "";
  const calls: string[] = [];
  const post = {
    id: POST_ID, author_id: options.ownerId || USER_ID, status,
    post_kind: options.postKind || "pixel_art", title: "作品", caption: "",
    image_path: `${USER_ID}/source.png`, image_mime: "image/png",
  };
  const admin = {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq: () => ({ maybeSingle: async () => {
              calls.push(`read:${table}:${columns}`);
              if (table === "user_posts") {
                if (columns === "status") return { data: { status }, error: null };
                return { data: { ...post, status }, error: null };
              }
              if (table === "user_post_puzzles") return { data: options.puzzle ? { mode: "hidden_object", changed_image_path: null } : null, error: null };
              if (table === "post_locations_private") return { data: { cell_grid: 64, cell_x: 3, cell_y: 4, prefecture_code: "13" }, error: null };
              if (table === "post_map_points") return { data: pointPath ? { post_id: POST_ID, public_image_path: pointPath } : null, error: null };
              throw new Error(`Unexpected table ${table}`);
            } }),
          };
        },
      };
    },
    storage: {
      from(bucket: string) {
        return bucket === "post-quarantine"
          ? { download: async () => ({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null }) }
          : {
            upload: async (path: string) => { uploadedPath = path; calls.push(`upload:${path}`); return { error: null }; },
            remove: async (paths: string[]) => { calls.push(`remove:${paths.join(",")}`); return { error: null }; },
          };
      },
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      assert.equal(name, "pixieed_moderate_post");
      assert.equal(args.p_post_id, POST_ID);
      assert.equal(args.p_action, "approve");
      calls.push("rpc:approve");
      if (options.publish === "error_pending") return { data: null, error: new Error("write_failed") };
      status = "published";
      pointPath = String((args.p_point as Record<string, unknown>).public_image_path);
      if (options.publish === "race_published") return { data: null, error: new Error("response_lost") };
      return { data: { postId: POST_ID, status: "published" }, error: null };
    },
  };
  return { admin, calls, get status() { return status; }, get uploadedPath() { return uploadedPath; } };
}

Deno.test("pending ordinary post uses atomic moderation publication", async () => {
  const fixture = makeAdmin();
  const result = await publishOrdinaryPost(fixture.admin, POST_ID, USER_ID);
  assert.equal(result.postId, POST_ID);
  assert.equal(result.status, "published");
  assert.deepEqual(result.mapCell, { grid: 64, x: 3, y: 4, prefectureCode: "13" });
  assert.ok(fixture.calls.includes("rpc:approve"));
  assert.ok(fixture.uploadedPath.endsWith(".png"));
});

Deno.test("already published post succeeds only when its public map point exists", async () => {
  const fixture = makeAdmin({ status: "published", mapPoint: true });
  assert.deepEqual(await publishOrdinaryPost(fixture.admin, POST_ID, USER_ID), { postId: POST_ID, status: "published" });
  assert.ok(!fixture.calls.includes("rpc:approve"));
  await assert.rejects(() => publishOrdinaryPost(makeAdmin({ status: "published" }).admin, POST_ID, USER_ID), /post_publish_outcome_unknown/);
});

Deno.test("hidden and rejected records remain unchanged and are returned for conflict handling", async () => {
  for (const status of ["hidden", "rejected"]) {
    const fixture = makeAdmin({ status });
    assert.deepEqual(await publishOrdinaryPost(fixture.admin, POST_ID, USER_ID), { postId: POST_ID, status });
    assert.ok(!fixture.calls.some((call) => call.startsWith("read:user_post_puzzles:")));
    assert.ok(!fixture.calls.includes("rpc:approve"));
  }
});

Deno.test("ownership, post kind, and puzzle checks prevent automatic approval", async () => {
  await assert.rejects(() => publishOrdinaryPost(makeAdmin({ ownerId: "44444444-4444-4444-8444-444444444444" }).admin, POST_ID, USER_ID), /post_publication_not_allowed/);
  await assert.rejects(() => publishOrdinaryPost(makeAdmin({ postKind: "puzzle" }).admin, POST_ID, USER_ID), /post_publication_not_allowed/);
  await assert.rejects(() => publishOrdinaryPost(makeAdmin({ puzzle: true }).admin, POST_ID, USER_ID), /puzzle_review_required/);
  await assert.rejects(() => publishOrdinaryPost(makeAdmin().admin, "bad-id", USER_ID), /post_id_invalid/);
});

Deno.test("a failed publish keeps the post pending and removes only the attempted public image", async () => {
  const fixture = makeAdmin({ publish: "error_pending" });
  await assert.rejects(() => publishOrdinaryPost(fixture.admin, POST_ID, USER_ID), /post_publish_failed/);
  assert.equal(fixture.status, "pending");
  assert.ok(fixture.calls.includes(`remove:${fixture.uploadedPath}`));
});

Deno.test("a publication race is accepted after status and map point confirmation", async () => {
  const fixture = makeAdmin({ publish: "race_published" });
  const result = await publishOrdinaryPost(fixture.admin, POST_ID, USER_ID);
  assert.equal(result.postId, POST_ID);
  assert.equal(result.status, "published");
  assert.equal(fixture.status, "published");
  assert.ok(fixture.calls.includes("rpc:approve"));
  assert.ok(!fixture.calls.some((call) => call.startsWith("remove:")));
});
