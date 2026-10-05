import assert from "node:assert/strict";
import { setAuthorNameHandler } from "./index.ts";

const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT = "https://example.supabase.co";

function fixture({ rpcError = null, userId = USER_ID, savedName }: {
  rpcError?: Error | null;
  userId?: string;
  savedName?: string;
} = {}) {
  const calls: string[] = [];
  const createClient = ((url: string, key: string) => {
    assert.equal(url, PROJECT);
    if (key === "public") {
      return {
        auth: {
          getUser: async (token: string) => {
            calls.push(`auth:${token}`);
            return {
              data: {
                user: {
                  id: userId,
                  is_anonymous: true,
                  user_metadata: { display_name: "Private existing metadata" },
                },
              },
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
        assert.equal(name, "pixieed_set_post_author_name");
        assert.equal(args.p_author_id, USER_ID);
        assert.equal(args.p_name, savedName);
        if (rpcError) return { data: null, error: rpcError };
        return { data: { ok: true, name: savedName }, error: null };
      },
    };
  }) as never;
  return { calls, createClient };
}

function request(
  body: unknown = { name: "新しい作者名" },
  authorization = "Bearer user-token",
) {
  return new Request(`${PROJECT}/functions/v1/set-author-name`, {
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

Deno.test("verified anonymous user sets a trimmed Unicode display name through the service-only RPC", async () => {
  const fixtureData = fixture({ savedName: "佐藤玲奈" });
  const response = await setAuthorNameHandler(
    request({ name: " 佐藤玲奈　" }),
    deps(fixtureData.createClient),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, name: "佐藤玲奈" });
  assert.deepEqual(fixtureData.calls, [
    "auth:user-token",
    "rpc:pixieed_set_post_author_name",
  ]);
});

Deno.test("normalizes the name to NFC before trimming and counting Unicode code points", async () => {
  const fixtureData = fixture({ savedName: "é" });
  const response = await setAuthorNameHandler(
    request({ name: " e\u0301　" }),
    deps(fixtureData.createClient),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, name: "é" });
});

Deno.test("body cannot choose an author and malformed or whitespace-only names reject before auth", async () => {
  let created = false;
  const factory = (() => {
    created = true;
    throw new Error("unexpected client");
  }) as never;
  for (
    const body of [
      { name: "Name", authorId: USER_ID },
      { name: "　　" },
      { name: "" },
      { name: "line\nbreak" },
      { name: "name\u0085control" },
      { name: "x".repeat(41) },
      { name: 42 },
    ]
  ) {
    const response = await setAuthorNameHandler(request(body), deps(factory));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "author_name_invalid",
    });
  }
  assert.equal(created, false);
});

Deno.test("forty Unicode code points are allowed, including supplementary characters", async () => {
  const name = "😀".repeat(40);
  const fixtureData = fixture({ savedName: name });
  const response = await setAuthorNameHandler(
    request({ name }),
    deps(fixtureData.createClient),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, name });
});

Deno.test("missing or invalid bearer sessions never reach the privileged RPC", async () => {
  const fixtureData = fixture({ savedName: "Name" });
  const missing = await setAuthorNameHandler(
    request({ name: "Name" }, ""),
    deps(fixtureData.createClient),
  );
  assert.equal(missing.status, 401);
  assert.deepEqual(fixtureData.calls, []);
  const invalid = ((url: string, key: string) =>
    key === "public"
      ? {
        auth: {
          getUser: async () => ({
            data: { user: null },
            error: new Error("invalid"),
          }),
        },
      }
      : (() => {
        throw new Error("unexpected service client");
      })()) as never;
  const response = await setAuthorNameHandler(
    request({ name: "Name" }),
    deps(invalid),
  );
  assert.equal(response.status, 401);
});

Deno.test("verified identity, not a caller-supplied ID or user metadata, is the only RPC owner input", async () => {
  const fixtureData = fixture({ savedName: "Name" });
  const response = await setAuthorNameHandler(
    request({
      name: "Name",
      author_id: "33333333-3333-4333-8333-333333333333",
    }),
    deps(fixtureData.createClient),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(fixtureData.calls, []);
});

Deno.test("database failure is reported as retryable without returning private identity", async () => {
  const fixtureData = fixture({
    rpcError: new Error("database unavailable"),
    savedName: "Name",
  });
  const response = await setAuthorNameHandler(
    request({ name: "Name" }),
    deps(fixtureData.createClient),
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "author_name_update_failed",
  });
  assert.equal(fixtureData.calls.some((call) => call.includes(USER_ID)), false);
});
