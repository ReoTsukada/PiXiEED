import assert from "node:assert/strict";
import { moderatePost, moderatePostHandler } from "./index.ts";

const POST_ID = "123e4567-e89b-42d3-a456-426614174000";

function makeAdmin({
  initialStatus = "pending",
  publish = "success",
  puzzleMode = null,
  pointReadError = false,
}: {
  initialStatus?: string;
  publish?: "success" | "error_pending" | "error_published" | "throw_pending" | "error_rejected" | "error_hidden" | "error_hidden_committed" | "point_read_error";
  puzzleMode?: "spot_difference" | "hidden_object" | null;
  pointReadError?: boolean;
} = {}) {
  let status = initialStatus;
  let uploadedPath = "";
  let committedPointPath = "";
  const calls: string[] = [];
  const post = {
    id: POST_ID,
    title: "テスト作品",
    caption: "",
    post_kind: "pixel_art",
    image_path: `${POST_ID}/source.png`,
    image_mime: "image/png",
    status: initialStatus,
  };
  const admin = {
    storage: {
      from(bucket: string) {
        if (bucket === "post-quarantine") return {
          download: async () => ({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null }),
        };
        assert.equal(bucket, "post-public");
        return {
          upload: async (path: string, _body: Blob, options: { upsert: boolean }) => {
            uploadedPath = path;
            calls.push(`upload:${path}`);
            assert.equal(options.upsert, false);
            return { error: null };
          },
          remove: async (paths: string[]) => {
            calls.push(`remove-image:${paths[0]}`);
            return { error: null };
          },
        };
      },
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      assert.equal(name, "pixieed_moderate_post");
      calls.push(`rpc:${String(args.p_action)}`);
      if (args.p_action === "reject") return { data: { postId: POST_ID, status: "rejected" }, error: null };
      if (publish === "throw_pending") throw new Error("simulated transport failure");
      if (publish === "success") {
        status = "published";
        committedPointPath = String((args.p_point as Record<string, unknown>).public_image_path);
        return { data: { postId: POST_ID, status: "published" }, error: null };
      }
      if (publish === "error_published") {
        status = "published";
        committedPointPath = String((args.p_point as Record<string, unknown>).public_image_path);
      }
      if (publish === "error_rejected") status = "rejected";
      if (publish === "error_hidden") status = "hidden";
      if (publish === "error_hidden_committed") {
        status = "hidden";
        committedPointPath = String((args.p_point as Record<string, unknown>).public_image_path);
      }
      if (publish === "point_read_error") status = "hidden";
      return { data: null, error: new Error("simulated write failure") };
    },
    from(table: string) {
      if (table === "user_posts") return {
        select(columns: string) {
          return {
            eq: () => ({ maybeSingle: async () => ({
              data: columns === "status" ? { status } : post,
              error: null,
            }) }),
          };
        },
      };
      if (table === "user_post_puzzles") return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: puzzleMode ? {
          mode: puzzleMode, changed_image_path: puzzleMode === "spot_difference" ? `${POST_ID}/changed-source.png` : null,
          review_state: status === "published" ? "approved" : "pending",
        } : null, error: null }) }) }),
      };
      if (table === "post_locations_private") return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: { cell_grid: 64, cell_x: 3, cell_y: 5, prefecture_code: "13" },
          error: null,
        }) }) }),
      };
      if (table === "post_map_points") return {
        select: () => ({ eq: () => ({ maybeSingle: async () => pointReadError
          ? ({ data: null, error: new Error("point read failed") })
          : ({ data: committedPointPath ? { post_id: POST_ID, public_image_path: committedPointPath } : null, error: null }) }) }),
      };
      throw new Error(`Unexpected table ${table}`);
    },
  };
  return { admin, calls, get uploadedPath() { return uploadedPath; } };
}

Deno.test("a failed atomic approval removes only this approval's new public image", async () => {
  const fixture = makeAdmin({ publish: "error_pending" });
  await assert.rejects(
    () => moderatePost(fixture.admin, { postId: POST_ID, action: "approve" }),
    /post_publish_failed/,
  );
  assert.ok(fixture.uploadedPath.includes(`${POST_ID}/`));
  assert.ok(fixture.uploadedPath.endsWith(".png"));
  assert.equal(fixture.calls.at(-1), `remove-image:${fixture.uploadedPath}`);
});

Deno.test("a failed atomic status write removes its pending trial image", async () => {
  const fixture = makeAdmin({ publish: "error_pending" });
  await assert.rejects(
    () => moderatePost(fixture.admin, { postId: POST_ID, action: "approve" }),
    /post_publish_failed/,
  );
  assert.deepEqual(fixture.calls.slice(-1), [`remove-image:${fixture.uploadedPath}`]);
});

Deno.test("a thrown status response is checked and cleaned up while still pending", async () => {
  const fixture = makeAdmin({ publish: "throw_pending" });
  await assert.rejects(
    () => moderatePost(fixture.admin, { postId: POST_ID, action: "approve" }),
    /post_publish_failed/,
  );
  assert.deepEqual(fixture.calls.slice(-1), [`remove-image:${fixture.uploadedPath}`]);
});

Deno.test("successful approval keeps a unique image and its map point", async () => {
  const fixture = makeAdmin();
  const result = await moderatePost(fixture.admin, { postId: POST_ID, action: "approve" });
  assert.equal(result.status, "published");
  assert.match(fixture.uploadedPath, new RegExp(`^${POST_ID}/[0-9a-f-]{36}\\.png$`));
  assert.ok(fixture.calls.includes("rpc:approve"));
  assert.ok(!fixture.calls.some((call) => call.startsWith("remove-")));
});

Deno.test("Spot approval copies two isolated PNGs and binds puzzle mode in the atomic point", async () => {
  const fixture = makeAdmin({ puzzleMode: "spot_difference" });
  const result = await moderatePost(fixture.admin, { postId: POST_ID, action: "approve" });
  assert.equal(result.status, "published");
  assert.equal(fixture.calls.filter((call) => call.startsWith("upload:")).length, 2);
  assert.ok(fixture.calls.includes("rpc:approve"));
  assert.ok(!fixture.calls.some((call) => call.startsWith("remove-")));
});

Deno.test("an ambiguous response is confirmed from the final point without deleting its image", async () => {
  const fixture = makeAdmin({ publish: "error_published" });
  const result = await moderatePost(fixture.admin, { postId: POST_ID, action: "approve" });
  assert.equal(result.status, "published");
  assert.ok(!fixture.calls.some((call) => call.startsWith("remove-")));
});

Deno.test("a reject or hide race removes an unreferenced trial image", async () => {
  for (const publish of ["error_rejected", "error_hidden"] as const) {
    const fixture = makeAdmin({ publish });
    await assert.rejects(
      () => moderatePost(fixture.admin, { postId: POST_ID, action: "approve" }),
      /post_publish_failed/,
    );
    assert.equal(fixture.calls.at(-1), `remove-image:${fixture.uploadedPath}`);
  }
});

Deno.test("a hidden post keeps the trial image when its map point already references it", async () => {
  const fixture = makeAdmin({ publish: "error_hidden_committed" });
  await assert.rejects(
    () => moderatePost(fixture.admin, { postId: POST_ID, action: "approve" }),
    /post_publish_failed/,
  );
  assert.equal(fixture.calls.some((call) => call.startsWith("remove-image:")), false);
});

Deno.test("an unreadable map point never triggers deletion of a possibly committed image", async () => {
  const fixture = makeAdmin({ publish: "point_read_error", pointReadError: true });
  await assert.rejects(
    () => moderatePost(fixture.admin, { postId: POST_ID, action: "approve" }),
    /post_publish_outcome_unknown/,
  );
  assert.equal(fixture.calls.some((call) => call.startsWith("remove-image:")), false);
});

Deno.test("a stale approval does not upload or overwrite another publication", async () => {
  const fixture = makeAdmin({ initialStatus: "published" });
  await assert.rejects(
    () => moderatePost(fixture.admin, { postId: POST_ID, action: "approve" }),
    /post_not_pending/,
  );
  assert.deepEqual(fixture.calls, []);
});

Deno.test("moderation handler rejects requests without a bearer token before creating clients", async () => {
  let created = false;
  const response = await moderatePostHandler(new Request("https://example.test/functions/v1/moderate-post", {
    method: "POST", body: JSON.stringify({ action: "list" }),
  }), { createClient: (() => { created = true; throw new Error("unexpected"); }) as never,
    projectUrl: "https://example.supabase.co", publishableKey: "public", serviceKey: "secret" });
  assert.equal(response.status, 401);
  assert.equal(created, false);
});
