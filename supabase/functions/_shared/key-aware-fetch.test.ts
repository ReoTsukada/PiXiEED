import assert from "node:assert/strict";
import { createClient } from "npm:@supabase/supabase-js@2.106.2";
import { keyAwareFetch } from "./key-aware-fetch.ts";

Deno.test("admin Data API requests send a new secret key only as apikey", async () => {
  const key = "sb_secret_fixture";
  const sent: Headers[] = [];
  const capture = ((_input: RequestInfo | URL, init?: RequestInit) => {
    sent.push(new Headers(init?.headers));
    return Promise.resolve(new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }));
  }) as typeof fetch;
  const client = createClient("https://fixture.supabase.co", key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: keyAwareFetch(key, capture) },
  });
  await client.from("user_posts").select("id");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].get("apikey"), key);
  assert.equal(sent[0].has("authorization"), false);
});

Deno.test("authenticated user JWT survives publishable-key filtering", async () => {
  const key = "sb_publishable_fixture";
  const sent: Headers[] = [];
  const capture = ((_input: RequestInfo | URL, init?: RequestInit) => {
    sent.push(new Headers(init?.headers));
    return Promise.resolve(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }));
  }) as typeof fetch;
  await keyAwareFetch(key, capture)("https://fixture.supabase.co/auth/v1/user", {
    headers: { apikey: key, Authorization: "Bearer user.jwt.value" },
  });
  assert.equal(sent[0].get("apikey"), key);
  assert.equal(sent[0].get("authorization"), "Bearer user.jwt.value");
  await keyAwareFetch(key, capture)("https://fixture.supabase.co/auth/v1/otp", {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  assert.equal(sent[1].get("apikey"), key);
  assert.equal(sent[1].has("authorization"), false);
});

Deno.test("supabase-js auth.getUser sends the real user JWT with a publishable key", async () => {
  const key = "sb_publishable_fixture";
  const sent: Headers[] = [];
  const capture = ((_input: RequestInfo | URL, init?: RequestInit) => {
    sent.push(new Headers(init?.headers));
    return Promise.resolve(new Response(JSON.stringify({ user: null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
  }) as typeof fetch;
  const client = createClient("https://fixture.supabase.co", key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: keyAwareFetch(key, capture) },
  });
  await client.auth.getUser("header.payload.signature");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].get("apikey"), key);
  assert.equal(sent[0].get("authorization"), "Bearer header.payload.signature");
});

Deno.test("legacy JWT-based keys retain their existing Authorization behavior", async () => {
  const key = "legacy-jwt-key";
  const sent: Headers[] = [];
  const capture = ((_input: RequestInfo | URL, init?: RequestInit) => {
    sent.push(new Headers(init?.headers));
    return Promise.resolve(new Response("{}"));
  }) as typeof fetch;
  await keyAwareFetch(key, capture)("https://fixture.supabase.co/rest/v1/user_posts", {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  assert.equal(sent[0].get("authorization"), `Bearer ${key}`);
});
