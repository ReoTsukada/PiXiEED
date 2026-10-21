import { testPostingPolicy, testPostingConsent } from '../../../tests/fixtures/posting-policy.mjs';
import assert from "node:assert/strict";
import { socialFeedHandler } from "./index.ts";
import { cursorDate } from "../_shared/social-contract.mjs";
import {
  inspectSocialWav,
  readSocialRequestBody,
  SocialWavError,
} from "../_shared/social-wav.mjs";

const PROJECT = "https://example.supabase.co";
const OWNER = "22222222-2222-4222-8222-222222222222";
const POST = "11111111-1111-4111-8111-111111111111";

function wav(
  {
    declared = 36,
    format = 1,
    channels = 1,
    rate = 8000,
    bits = 16,
    dataBytes = 1600,
    extra = new Uint8Array(),
  } = {},
) {
  const align = channels * bits / 8;
  const chunks = 36 + dataBytes + extra.byteLength;
  const bytes = new Uint8Array(44 + dataBytes + extra.byteLength);
  const view = new DataView(bytes.buffer);
  const put = (at: number, value: string) =>
    [...value].forEach((c, i) => bytes[at + i] = c.charCodeAt(0));
  put(0, "RIFF");
  view.setUint32(4, declared === 36 ? bytes.length - 8 : declared, true);
  put(8, "WAVE");
  put(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * align, true);
  view.setUint16(32, align, true);
  view.setUint16(34, bits, true);
  put(36, "data");
  view.setUint32(40, dataBytes, true);
  bytes.set(extra, 44 + dataBytes);
  return bytes;
}

function factoryFixture({
  userId = OWNER,
  post = null,
  reservationError = null,
}: {
  userId?: string;
  post?: Record<string, unknown> | null;
  reservationError?: string | null;
} = {}) {
  const calls: string[] = [];
  const updates: Array<Record<string, unknown>> = [];
  const row: Record<string, unknown> = post || {
    id: POST,
    owner_id: OWNER,
    kind: "text",
    title: "hello",
    body: "first line\nsecond line",
    author_name: "Owner",
    visibility: "private",
    state: "ready",
    version: 1,
    created_at: "2026-10-20T00:00:00.000Z",
    updated_at: "2026-10-20T00:00:00.000Z",
  };
  const factory = ((url: string, key: string) => {
    assert.equal(url, PROJECT);
    if (key === "public") {
      return {
        auth: {
          getUser: async (token: string) => {
            calls.push(`auth:${token}`);
            return {
              data: { user: { id: userId, is_anonymous: true } },
              error: null,
            };
          },
        },
      };
    }
    return {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push(`rpc:${name}`);
        if ("p_owner_id" in args) assert.equal(args.p_owner_id, OWNER);
        if (reservationError) {
          return { data: null, error: { message: reservationError } };
        }
        return {
          data: { postId: POST, state: "ready", replayed: false },
          error: null,
        };
      },
      from: (table: string) => {
        let filters: Array<[string, unknown]> = [];
        let update: Record<string, unknown> | null = null;
        const query = {
          select: () => query,
          update: (value: Record<string, unknown>) => {
            update = value;
            updates.push(value);
            return query;
          },
          eq: (key: string, value: unknown) => {
            filters.push([key, value]);
            return query;
          },
          maybeSingle: async () => {
            calls.push(`query:${table}`);
            const matches = filters.every(([key, value]) => row[key] === value);
            if (!matches) return { data: null, error: null };
            if (update) return { data: { ...row, ...update }, error: null };
            return { data: row, error: null };
          },
        };
        return query;
      },
    };
  }) as never;
  return { factory, calls, updates };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => resolve = done);
  return { promise, resolve };
}

function audioRaceFixture({
  state = "pending",
  cleanupPending = false,
  reserveState = "pending",
  delayUpload = false,
  finishError = false,
  finishThrows = false,
  finishValue = false,
  removeFails = false,
  audioExists = false,
}: {
  state?: string;
  cleanupPending?: boolean;
  reserveState?: string;
  delayUpload?: boolean;
  finishError?: boolean;
  finishThrows?: boolean;
  finishValue?: boolean;
  removeFails?: boolean;
  audioExists?: boolean;
} = {}) {
  const calls: string[] = [];
  const started = deferred();
  const gate = deferred();
  const objects = new Set<string>();
  const path = `${OWNER}/${POST}.wav`;
  if (audioExists) objects.add(path);
  const row: Record<string, unknown> = {
    id: POST,
    owner_id: OWNER,
    request_key: "33333333-3333-4333-8333-333333333333",
    request_hash: "a".repeat(64),
    kind: "music",
    title: "track",
    body: "",
    author_name: "Owner",
    visibility: "private",
    state,
    audio_bytes: 1644,
    audio_duration: 0.1,
    audio_sha256: "b".repeat(64),
    cleanup_pending: cleanupPending,
    version: 1,
    created_at: rowCreated(),
    updated_at: rowCreated(),
  };
  let shouldFailRemove = removeFails;
  const factory = ((url: string, key: string) => {
    assert.equal(url, PROJECT);
    if (key === "public") {
      return {
        auth: {
          getUser: async () => ({
            data: { user: { id: OWNER, is_anonymous: true } },
            error: null,
          }),
        },
      };
    }
    return {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push(`rpc:${name}`);
        if (name === "pixieed_sns_reserve_post") {
          return {
            data: { postId: POST, state: reserveState, replayed: true },
            error: null,
          };
        }
        assert.equal(name, "pixieed_sns_finish_audio");
        assert.equal(args.p_owner_id, OWNER);
        if (finishThrows) throw new Error("simulated network loss");
        return finishError
          ? { data: null, error: { message: "simulated timeout" } }
          : { data: finishValue, error: null };
      },
      from: (table: string) => {
        assert.equal(table, "sns_posts");
        const filters: Array<[string, unknown]> = [];
        let mutation: Record<string, unknown> | null = null;
        const query = {
          select: () => query,
          update: (value: Record<string, unknown>) => {
            mutation = value;
            return query;
          },
          eq: (column: string, value: unknown) => {
            filters.push([column, value]);
            return query;
          },
          maybeSingle: async () => {
            const matches = filters.every(([column, value]) =>
              row[column] === value
            );
            if (!matches) return { data: null, error: null };
            if (mutation) Object.assign(row, mutation);
            return { data: { ...row }, error: null };
          },
        };
        return query;
      },
      storage: {
        from: (bucket: string) => {
          assert.equal(bucket, "sns-audio");
          return {
            upload: async (objectPath: string) => {
              assert.equal(objectPath, path);
              started.resolve();
              if (delayUpload) await gate.promise;
              objects.add(objectPath);
              calls.push("upload");
              return { data: { path: objectPath }, error: null };
            },
            remove: async (paths: string[]) => {
              assert.deepEqual(paths, [path]);
              calls.push("remove");
              if (shouldFailRemove) {
                return {
                  data: null,
                  error: { message: "storage unavailable" },
                };
              }
              for (const item of paths) objects.delete(item);
              return { data: paths.map((name) => ({ name })), error: null };
            },
          };
        },
      },
    };
  }) as never;
  return {
    factory,
    row,
    calls,
    objects,
    path,
    uploadStarted: started.promise,
    releaseUpload: gate.resolve,
    setRemoveFails(value: boolean) {
      shouldFailRemove = value;
    },
  };
}

function musicCreateRequest() {
  const form = new FormData();
  form.set(
    "payload",
    JSON.stringify({
      action: "create",
      requestKey: "33333333-3333-4333-8333-333333333333",
      kind: "music",
      title: "track",
      body: "",
      visibility: "private",
      authorName: "Owner",
    }),
  );
  form.set("audio", new File([wav()], "original.wav", { type: "audio/wav" }));
  return new Request(`${PROJECT}/functions/v1/social-feed`, {
    method: "POST",
    headers: {
      authorization: "Bearer user-token",
      origin: "http://localhost:4242",
    },
    body: form,
  });
}

function musicDeleteRequest() {
  return jsonRequest({ action: "delete", postId: POST });
}

function deps(factory: never) {
  return {
    postingPolicy: testPostingPolicy, recordConsent: async (_admin: any, record: any) => record,
    createClient: factory,
    projectUrl: PROJECT,
    publishableKey: "public",
    serviceKey: "secret",
  };
}
function jsonRequest(
  body: unknown,
  authorization = "Bearer user-token",
  origin = "http://localhost:4242",
) {
  return new Request(`${PROJECT}/functions/v1/social-feed`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify({ ...(body as any), ...((body as any)?.visibility === "public" && ["create","edit"].includes((body as any)?.action) ? {postingConsent:testPostingConsent} : {}) }),
  });
}

Deno.test("accepts supported PCM WAV and derives duration and digest from bytes", async () => {
  const facts = await inspectSocialWav(wav());
  assert.equal(facts.duration, 0.1);
  assert.equal(facts.bytes, 1644);
  assert.match(facts.sha256, /^[0-9a-f]{64}$/);
});

Deno.test("rejects incorrect RIFF length, compressed WAV and overlong duration", async () => {
  await assert.rejects(
    () => inspectSocialWav(wav({ declared: 999 })),
    (error: unknown) =>
      error instanceof SocialWavError && error.code === "audio_wav_invalid",
  );
  await assert.rejects(
    () => inspectSocialWav(wav({ format: 6 })),
    (error: unknown) =>
      error instanceof SocialWavError &&
      error.code === "audio_format_unsupported",
  );
  await assert.rejects(
    () => inspectSocialWav(wav({ dataBytes: 9_600_016 })),
    (error: unknown) =>
      error instanceof SocialWavError &&
      error.code === "audio_duration_invalid",
  );
});

Deno.test("bounds request streams even without a declared content length", async () => {
  const request = new Request(`${PROJECT}/functions/v1/social-feed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "x".repeat(32769),
  });
  await assert.rejects(
    () => readSocialRequestBody(request),
    (error: unknown) =>
      error instanceof SocialWavError && error.code === "request_too_large",
  );
});

Deno.test("accepts and canonicalizes database ISO cursors with timezone offsets", () => {
  assert.equal(
    cursorDate("2026-10-21T08:32:18.278285+09:00"),
    "2026-10-21T08:32:18.278285+09:00",
  );
});

Deno.test("text create authenticates with getUser and reserves under that verified owner", async () => {
  const fixture = factoryFixture();
  const response = await socialFeedHandler(
    jsonRequest({
      action: "create",
      requestKey: "33333333-3333-4333-8333-333333333333",
      kind: "text",
      title: "hello",
      body: "first line\nsecond line",
      visibility: "private",
      authorName: "Owner",
    }),
    deps(fixture.factory),
  );
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    ok: true,
    post: {
      id: POST,
      kind: "text",
      title: "hello",
      body: "first line\nsecond line",
      authorName: "Owner",
      createdAt: rowCreated(),
      updatedAt: rowCreated(),
      visibility: "private",
      version: 1,
      owned: true,
    },
  });
  assert.deepEqual(fixture.calls, [
    "auth:user-token",
    "rpc:pixieed_sns_reserve_post",
    "query:sns_posts",
  ]);
});

Deno.test("rejects a foreign browser origin before any database or auth client is created", async () => {
  let invoked = false;
  const response = await socialFeedHandler(
    jsonRequest({ action: "list" }, "", "https://attacker.invalid"),
    {
      createClient: (() => {
        invoked = true;
        throw new Error("unexpected");
      }) as never,
      projectUrl: PROJECT,
      publishableKey: "public",
      serviceKey: "secret",
    },
  );
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "origin_not_allowed",
  });
  assert.equal(invoked, false);
});

Deno.test("requires verified identity before a create reservation", async () => {
  const fixture = factoryFixture();
  const response = await socialFeedHandler(
    jsonRequest({
      action: "create",
      requestKey: "33333333-3333-4333-8333-333333333333",
      kind: "text",
      title: "hello",
      body: "body",
      visibility: "public",
    }, ""),
    deps(fixture.factory),
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "authentication_required",
  });
  assert.equal(fixture.calls.includes("rpc:pixieed_sns_reserve_post"), false);
});

Deno.test("does not return another user's private post", async () => {
  const otherOwner = "44444444-4444-4444-8444-444444444444";
  const fixture = factoryFixture({ userId: otherOwner });
  const response = await socialFeedHandler(
    jsonRequest({ action: "get", postId: POST }),
    deps(fixture.factory),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, post: null });
});

Deno.test("does not download private audio without the verified owner token", async () => {
  const fixture = factoryFixture({
    post: {
      id: POST,
      owner_id: OWNER,
      kind: "music",
      title: "track",
      body: "",
      author_name: "Owner",
      visibility: "private",
      state: "ready",
      version: 1,
      audio_bytes: 1644,
      audio_duration: 0.1,
      audio_sha256: "a".repeat(64),
      created_at: rowCreated(),
      updated_at: rowCreated(),
    },
  });
  const response = await socialFeedHandler(
    new Request(
      `${PROJECT}/functions/v1/social-feed?action=audio&postId=${POST}`,
      {
        headers: { origin: "http://localhost:4242" },
      },
    ),
    deps(fixture.factory),
  );
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "post_not_found",
  });
  assert.equal(fixture.calls.includes("storage:download"), false);
});

Deno.test("returns a safe conflict when an idempotency key has a different payload", async () => {
  const fixture = factoryFixture({
    reservationError: "sns_idempotency_conflict",
  });
  const response = await socialFeedHandler(
    jsonRequest({
      action: "create",
      requestKey: "33333333-3333-4333-8333-333333333333",
      kind: "text",
      title: "changed",
      body: "body",
      visibility: "public",
    }),
    deps(fixture.factory),
  );
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "idempotency_conflict",
  });
});

Deno.test("metadata edit never accepts an audio replacement", async () => {
  const fixture = factoryFixture({
    post: {
      id: POST,
      owner_id: OWNER,
      kind: "music",
      title: "track",
      body: "caption",
      author_name: "Owner",
      visibility: "private",
      state: "ready",
      version: 2,
      audio_bytes: 1644,
      audio_duration: "0.1",
      audio_sha256: "a".repeat(64),
      created_at: rowCreated(),
      updated_at: rowCreated(),
    },
  });
  const response = await socialFeedHandler(
    jsonRequest({
      action: "edit",
      postId: POST,
      title: "track title",
      body: "new caption",
      visibility: "public",
      version: 2,
      audio: { mime: "audio/wav", sha256: "b".repeat(64) },
    }),
    deps(fixture.factory),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(fixture.updates[0]).sort(), [
    "body",
    "title",
    "updated_at",
    "version",
    "visibility",
  ]);
  const result = await response.json();
  assert.equal(result.post.audio.sha256, "a".repeat(64));
  assert.equal(result.post.audio.duration, 0.1);
});

Deno.test("rejects missing WAV and image MIME spoofing, accepts known WAV aliases", async () => {
  const fixture = factoryFixture();
  const missing = await socialFeedHandler(
    jsonRequest({
      action: "create",
      requestKey: "33333333-3333-4333-8333-333333333333",
      kind: "music",
      title: "track",
      body: "",
      visibility: "private",
    }),
    deps(fixture.factory),
  );
  assert.equal(missing.status, 400);
  assert.deepEqual(await missing.json(), {
    ok: false,
    error: "audio_required",
  });

  const form = new FormData();
  form.set("payload", JSON.stringify({ action: "create" }));
  form.set(
    "audio",
    new File([wav()], "audio.wav", { type: "image/png" }),
  );
  await assert.rejects(
    () =>
      readSocialRequestBody(
        new Request(`${PROJECT}/functions/v1/social-feed`, {
          method: "POST",
          body: form,
        }),
      ),
    (error: unknown) =>
      error instanceof SocialWavError &&
      error.code === "request_multipart_invalid",
  );

  const aliasForm = new FormData();
  aliasForm.set("payload", JSON.stringify({ action: "create" }));
  aliasForm.set(
    "audio",
    new File([wav()], "audio.wav", { type: "audio/x-wav" }),
  );
  const parsed = await readSocialRequestBody(
    new Request(`${PROJECT}/functions/v1/social-feed`, {
      method: "POST",
      body: aliasForm,
    }),
  );
  assert.equal(parsed.audio?.byteLength, wav().byteLength);
  assert.deepEqual(parsed.audio, wav());
});

Deno.test("late upload after delete is tombstoned, re-marked pending, and removed", async () => {
  const fixture = audioRaceFixture({ delayUpload: true, finishError: true });
  const creating = socialFeedHandler(
    musicCreateRequest(),
    deps(fixture.factory),
  );
  await fixture.uploadStarted;

  const deleted = await socialFeedHandler(
    musicDeleteRequest(),
    deps(fixture.factory),
  );
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), {
    ok: true,
    deleted: true,
    cleanupPending: false,
  });
  assert.equal(fixture.row.state, "deleted");
  assert.equal(fixture.row.cleanup_pending, false);

  fixture.releaseUpload();
  const created = await creating;
  assert.equal(created.status, 409);
  assert.deepEqual(await created.json(), {
    ok: false,
    error: "post_deleted",
    deleted: true,
    cleanupPending: false,
  });
  assert.equal(fixture.objects.has(fixture.path), false);
  assert.deepEqual(fixture.calls.filter((call) => call === "remove"), [
    "remove",
    "remove",
  ]);
});

Deno.test("finish error on a still-pending post preserves audio for the same-key retry", async () => {
  const fixture = audioRaceFixture({ finishError: true });
  const response = await socialFeedHandler(
    musicCreateRequest(),
    deps(fixture.factory),
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "post_finalize_failed",
  });
  assert.equal(fixture.row.state, "pending");
  assert.equal(fixture.objects.has(fixture.path), true);
  assert.equal(fixture.calls.includes("remove"), false);
});

Deno.test("deleted music retries cleanup even when cleanup_pending was false", async () => {
  const fixture = audioRaceFixture({
    state: "deleted",
    cleanupPending: false,
    removeFails: true,
    audioExists: true,
  });
  const first = await socialFeedHandler(
    musicDeleteRequest(),
    deps(fixture.factory),
  );
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), {
    ok: true,
    deleted: true,
    cleanupPending: true,
  });
  assert.equal(fixture.row.cleanup_pending, true);
  assert.equal(fixture.objects.has(fixture.path), true);

  fixture.setRemoveFails(false);
  const retry = await socialFeedHandler(
    musicDeleteRequest(),
    deps(fixture.factory),
  );
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), {
    ok: true,
    deleted: true,
    cleanupPending: false,
  });
  assert.equal(fixture.row.cleanup_pending, false);
  assert.equal(fixture.objects.has(fixture.path), false);
});

function rowCreated() {
  return "2026-10-20T00:00:00.000Z";
}

Deno.test("all comment routes are disabled before any client/DB work", async () => {
  for (const action of ["comments", "comment-create", "comment-edit", "comment-delete"]) {
    const response = await socialFeedHandler(new Request(`${PROJECT}/functions/v1/social-feed`, {
      method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({action}),
    }), {createClient: () => { throw new Error("disabled route must be inert"); }});
    assert.equal(response.status, 410);
    assert.equal((await response.json()).error, "comments_disabled");
  }
});

Deno.test("guest claim authenticates both tokens, ignores supplied IDs, and binds acknowledgment", async () => {
  const source = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", target = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const key = "10000000-0000-4000-8000-000000000001";
  const verified: string[] = [], rpcCalls: unknown[] = [];
  const deps = {projectUrl:PROJECT,publishableKey:"public",serviceKey:"service",createClient: (_url:string,role:string) => role === "public" ? {
    auth:{getUser: async(token:string) => {verified.push(token);return {data:{user: token === "guest-proof" ? {id:source,is_anonymous:true} : {id:target,is_anonymous:false}},error:null};}},
  } : {rpc: async(name:string,args:any) => {
    rpcCalls.push({name,args});
    assert.equal(name,"pixieed_sns_claim_guest");assert.equal(args.p_guest_id,source);assert.equal(args.p_owner_id,target);
    return {data:{guestId:source,ownerId:target,requestKey:key,replayed:rpcCalls.length>1,userPostCount:1,snsPostCount:2},error:null};
  }}};
  for(let i=0;i<2;i++) {
    const response=await socialFeedHandler(new Request(`${PROJECT}/functions/v1/social-feed`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer target-proof"},body:JSON.stringify({action:"claim-guest",requestKey:key,guestAccessToken:"guest-proof",guestId:target,ownerId:source})}),deps);
    assert.equal(response.status,200);const body=await response.json();assert.equal(body.claim.guestId,source);assert.equal(body.claim.ownerId,target);assert.equal(body.claim.replayed,i===1);
    assert.ok(!JSON.stringify(body).includes("proof"));
  }
  assert.deepEqual(verified,["target-proof","guest-proof","target-proof","guest-proof"]);
});

Deno.test("guest claim rejects unknown/anonymous target, wrong source, missing and same identity", async () => {
  for(const mode of ["anonymous-target","unknown-target","registered-source","invalid-source","same-id"]) {
    let writes=0;
    const response=await socialFeedHandler(new Request(`${PROJECT}/functions/v1/social-feed`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer target"},body:JSON.stringify({action:"claim-guest",requestKey:"10000000-0000-4000-8000-000000000001",guestAccessToken:"source"})}),{
      projectUrl:PROJECT,publishableKey:"public",serviceKey:"service",createClient: (_url:string,key:string) => key === "public" ? {auth:{getUser:async(token:string)=>({data:{user: mode === "invalid-source" && token === "source" ? null : {id:token === "target" || mode === "same-id" ? OWNER:POST,is_anonymous:token === "target" ? mode === "unknown-target" ? undefined:mode === "anonymous-target" : mode !== "registered-source"}},error:null})}} : {rpc:()=>{writes++;throw new Error("not authorized");}},
    });
    assert.ok([401,403].includes(response.status),mode);assert.equal(writes,0);
  }
});

Deno.test("claimed music reads original path with bounded Range, never downloads entire SDK blob", async () => {
  const mediaOwner="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const fixture=factoryFixture({post:{id:POST,owner_id:OWNER,media_owner_id:mediaOwner,kind:"music",state:"ready",visibility:"public",audio_bytes:100}});
  let storageCalls=0;
  const response=await socialFeedHandler(new Request(`${PROJECT}/functions/v1/social-feed?action=audio&postId=${POST}`,{headers:{Range:"bytes=8-11"}}),{
    projectUrl:PROJECT,publishableKey:"public",serviceKey:"service",createClient:fixture.factory,
    fetch: async(input,options)=>{storageCalls++;assert.equal(String(input),`${PROJECT}/storage/v1/object/sns-audio/${mediaOwner}/${POST}.wav`);assert.equal(new Headers((options as RequestInit)?.headers).get("range"),"bytes=8-11");return new Response(new Uint8Array([8,9,10,11]),{status:206,headers:{"Content-Range":"bytes 8-11/100","Content-Length":"4"}});},
  });
  assert.equal(response.status,206);assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[8,9,10,11]);assert.equal(storageCalls,1);assert.equal(response.headers.get("cache-control"),"no-store");
});

Deno.test("own deletion redacts source text while retaining tombstone identity", async () => {
  const fixture=factoryFixture();
  const response=await socialFeedHandler(new Request(`${PROJECT}/functions/v1/social-feed`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer owner"},body:JSON.stringify({action:"delete",postId:POST})}),{projectUrl:PROJECT,publishableKey:"public",serviceKey:"service",createClient:fixture.factory});
  assert.equal(response.status,200);
  const update=fixture.updates.find(v=>v.state==="deleted")!;
  assert.equal(update.visibility,"private");assert.equal(update.body,"削除済み");assert.equal(update.title,"削除した投稿");assert.equal(update.request_key,undefined);assert.equal(update.owner_id,undefined);
});
