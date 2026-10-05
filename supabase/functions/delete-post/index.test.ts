import assert from "node:assert/strict";
import { deletePostHandler } from "./index.ts";

const POST_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT = "https://example.supabase.co";
const PUBLIC_PATH = `${POST_ID}/33333333-3333-4333-8333-333333333333.png`;
const PRIVATE_PATH = `${OWNER_ID}/${POST_ID}.png`;

function setup(
  {
    rpcError = null,
    removeError = false,
    isAnonymous = true,
    completionError = false,
  }: {
    rpcError?: Error | null;
    removeError?: boolean;
    isAnonymous?: boolean;
    completionError?: boolean;
  } = {},
) {
  const calls: string[] = [];
  let cleanupFails = removeError;
  const createClient = ((url: string, key: string) => {
    assert.equal(url, PROJECT);
    if (key === "public") {
      return {
        auth: {
          getUser: async (token: string) => {
            calls.push(`auth:${token}`);
            return {
              data: { user: { id: OWNER_ID, is_anonymous: isAnonymous } },
              error: null,
            };
          },
        },
      };
    }
    assert.equal(key, "secret");
    return {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push(`rpc:${name}`);
        assert.equal(args.p_post_id, POST_ID);
        assert.equal(args.p_verified_author_id, OWNER_ID);
        if (name === "pixieed_complete_own_post_delete") {
          return completionError
            ? { data: null, error: new Error("completion response lost") }
            : {
              data: { postId: POST_ID, deleted: true, cleanupCompleted: true },
              error: null,
            };
        }
        assert.equal(name, "pixieed_delete_own_post");
        if (rpcError) return { data: null, error: rpcError };
        return {
          data: {
            postId: POST_ID,
            deleted: true,
            storage: [
              { bucket: "post-quarantine", path: PRIVATE_PATH },
              { bucket: "post-public", path: PUBLIC_PATH },
              { bucket: "post-public", path: PUBLIC_PATH },
            ],
          },
          error: null,
        };
      },
      storage: {
        from: (bucket: string) => ({
          remove: async (paths: string[]) => {
            calls.push(`remove:${bucket}:${paths.join(",")}`);
            return {
              error: cleanupFails ? new Error("storage unavailable") : null,
            };
          },
        }),
      },
    };
  }) as never;
  return {
    calls,
    createClient,
    setCleanupFails(value: boolean) {
      cleanupFails = value;
    },
  };
}

function request(
  body: unknown = { postId: POST_ID },
  authorization = "Bearer user-token",
) {
  return new Request(`${PROJECT}/functions/v1/delete-post`, {
    method: "POST",
    headers: {
      ...(authorization ? { authorization } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

const deps = (createClient: never) => ({
  createClient,
  projectUrl: PROJECT,
  publishableKey: "public",
  serviceKey: "secret",
});

Deno.test("verified anonymous owner deletes atomically, cleans exact assets, and receives no paths", async () => {
  const fixture = setup();
  const response = await deletePostHandler(
    request(),
    deps(fixture.createClient),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, deleted: true });
  assert.deepEqual(fixture.calls, [
    "auth:user-token",
    "rpc:pixieed_delete_own_post",
    `remove:post-quarantine:${PRIVATE_PATH}`,
    `remove:post-public:${PUBLIC_PATH}`,
    "rpc:pixieed_complete_own_post_delete",
  ]);
});

Deno.test("missing and invalid bearer identity reject before the delete RPC", async () => {
  const fixture = setup();
  const missing = await deletePostHandler(
    request({ postId: POST_ID }, ""),
    deps(fixture.createClient),
  );
  assert.equal(missing.status, 401);
  assert.deepEqual(fixture.calls, []);
  const invalidFactory = ((url: string, key: string) =>
    key === "public"
      ? {
        auth: {
          getUser: async () => ({
            data: { user: null },
            error: new Error("invalid token"),
          }),
        },
      }
      : (() => {
        throw new Error("must not make service client");
      })()) as never;
  const invalid = await deletePostHandler(request(), deps(invalidFactory));
  assert.equal(invalid.status, 401);
});

Deno.test("body cannot select an author, and invalid shapes reject before client creation", async () => {
  let created = false;
  const factory = (() => {
    created = true;
    throw new Error("unexpected client");
  }) as never;
  const response = await deletePostHandler(
    request({ postId: POST_ID, authorId: OWNER_ID }),
    deps(factory),
  );
  assert.equal(response.status, 400);
  assert.equal(created, false);
});

Deno.test("another owner's post is indistinguishable from a missing ID and has no storage side effect", async () => {
  const fixture = setup({ rpcError: new Error("post_not_found") });
  const response = await deletePostHandler(
    request(),
    deps(fixture.createClient),
  );
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "post_not_found",
  });
  assert.deepEqual(fixture.calls, [
    "auth:user-token",
    "rpc:pixieed_delete_own_post",
  ]);
});

Deno.test("failed storage cleanup reports tombstoned state and a retry can finish", async () => {
  const fixture = setup({ removeError: true });
  const first = await deletePostHandler(request(), deps(fixture.createClient));
  assert.equal(first.status, 503);
  const firstBody = await first.text();
  assert.deepEqual(JSON.parse(firstBody), {
    ok: false,
    error: "storage_cleanup_failed",
    deleted: true,
  });
  assert.equal(firstBody.includes(PRIVATE_PATH), false);
  fixture.setCleanupFails(false);
  const retry = await deletePostHandler(request(), deps(fixture.createClient));
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), { ok: true, deleted: true });
  assert.deepEqual(fixture.calls.filter((call) => call.startsWith("rpc:")), [
    "rpc:pixieed_delete_own_post",
    "rpc:pixieed_delete_own_post",
    "rpc:pixieed_complete_own_post_delete",
  ]);
});

Deno.test("completion RPC failure stays visible to the owner for retry", async () => {
  const fixture = setup({ completionError: true });
  const response = await deletePostHandler(
    request(),
    deps(fixture.createClient),
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "storage_cleanup_failed",
    deleted: true,
  });
  assert.ok(fixture.calls.includes("rpc:pixieed_complete_own_post_delete"));
});

Deno.test("unexpected storage paths fail closed and never reach Storage", async () => {
  const factory = ((url: string, key: string) =>
    key === "public"
      ? {
        auth: {
          getUser: async () => ({
            data: { user: { id: OWNER_ID } },
            error: null,
          }),
        },
      }
      : {
        rpc: async () => ({
          data: {
            postId: POST_ID,
            deleted: true,
            storage: [{ bucket: "post-public", path: "../other/image.png" }],
          },
          error: null,
        }),
        storage: {
          from: () => ({
            remove: async () => {
              throw new Error("unexpected remove");
            },
          }),
        },
      }) as never;
  const response = await deletePostHandler(request(), deps(factory));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "post_delete_outcome_unknown",
  });
});
