import test from "node:test";
import assert from "node:assert/strict";
import { fetchSocialAudioRange } from "../../supabase/functions/_shared/social-audio-range.mjs";

const path = "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.wav";
const base = { projectUrl: "https://example.supabase.co", serviceKey: "service-secret", path, expectedBytes: 10 };

function fakeFetch({ status = 206, contentRange = "bytes 2-5/10", bytes = [2, 3, 4, 5], contentLength = bytes.length, url = "https://example.supabase.co/storage/object" } = {}) {
  const impl = async (requestUrl, init) => {
    impl.last = { requestUrl, init };
    return new Response(new Uint8Array(bytes), {
      status,
      headers: { "content-length": String(contentLength), ...(status === 206 ? { "content-range": contentRange } : {}) },
    });
  };
  return impl;
}

test("forwards a validated byte range and returns exact streamed range headers", async () => {
  const fetchImpl = fakeFetch();
  const response = await fetchSocialAudioRange({ ...base, rangeHeader: "bytes=2-5", fetchImpl });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(response.headers.get("content-length"), "4");
  assert.deepEqual([...new Uint8Array(await new Response(response.body).arrayBuffer())], [2, 3, 4, 5]);
  assert.equal(fetchImpl.last.init.headers.get("range"), "bytes=2-5");
  assert.equal(fetchImpl.last.init.redirect, "manual");
  assert.equal(fetchImpl.last.requestUrl, `https://example.supabase.co/storage/v1/object/sns-audio/${path}`);
  assert.equal(fetchImpl.last.init.headers.get("authorization"), "Bearer service-secret");
});

test("supports suffix and open-ended ranges", async () => {
  for (const [header, contentRange, bytes, forwarded] of [
    ["bytes=-3", "bytes 7-9/10", [7, 8, 9], "bytes=7-9"],
    ["bytes=8-", "bytes 8-9/10", [8, 9], "bytes=8-9"],
  ]) {
    const fetchImpl = fakeFetch({ contentRange, bytes });
    const response = await fetchSocialAudioRange({ ...base, rangeHeader: header, fetchImpl });
    assert.equal(response.status, 206);
    assert.equal(fetchImpl.last.init.headers.get("range"), forwarded);
  }
});

test("rejects malformed, multiple, zero-suffix, and unsatisfiable ranges locally", async () => {
  for (const rangeHeader of ["bytes=", "bytes=1-2,4-5", "bytes=-0", "bytes=10-", "bytes=9-2"]) {
    const response = await fetchSocialAudioRange({ ...base, rangeHeader, fetchImpl: () => assert.fail("should not fetch") });
    assert.equal(response.status, 416, rangeHeader);
    assert.equal(response.headers.get("content-range"), "bytes */10");
  }
});

test("fails closed when upstream ignores or misstates a range", async () => {
  for (const opts of [
    { status: 200, contentRange: undefined, bytes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], contentLength: 10 },
    { contentRange: "bytes 1-4/10" },
    { contentRange: "bytes 2-5/11" },
    { contentLength: 3 },
    { status: 302, contentRange: undefined },
  ]) {
    const response = await fetchSocialAudioRange({ ...base, rangeHeader: "bytes=2-5", fetchImpl: fakeFetch(opts) });
    assert.equal(response.status, 503);
    assert.equal(response.body, null);
  }
});

test("rejects redirects and invalid fixed endpoint inputs without fetching", async () => {
  for (const overrides of [
    { projectUrl: "https://user:pass@example.supabase.co" },
    { path: "../other/file.wav" },
    { serviceKey: "" },
    { expectedBytes: 16 * 1024 * 1024 + 1 },
  ]) {
    const response = await fetchSocialAudioRange({ ...base, ...overrides, fetchImpl: () => assert.fail("should not fetch") });
    assert.equal(response.status, 503);
  }
  const response = await fetchSocialAudioRange({ ...base, rangeHeader: "bytes=2-5", fetchImpl: async () => new Response(null, { status: 302, headers: { location: "https://attacker.invalid" } }) });
  assert.equal(response.status, 503);
});

test("streams exact whole-object responses and rejects a dishonest stream length", async () => {
  const okFetch = fakeFetch({ status: 200, contentRange: undefined, bytes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], contentLength: 10 });
  const ok = await fetchSocialAudioRange({ ...base, fetchImpl: okFetch });
  assert.equal(ok.status, 200);
  assert.equal(new Uint8Array(await new Response(ok.body).arrayBuffer()).length, 10);
  const shortFetch = fakeFetch({ status: 200, contentRange: undefined, bytes: [0, 1, 2], contentLength: 10 });
  const short = await fetchSocialAudioRange({ ...base, fetchImpl: shortFetch });
  await assert.rejects(() => new Response(short.body).arrayBuffer(), /audio_length_mismatch/);
});

test("cancels upstream when the downstream consumer cancels", async () => {
  let cancelled = false;
  const fetchImpl = async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array([2, 3, 4, 5])); },
    cancel() { cancelled = true; },
  }), { status: 206, headers: { "content-length": "4", "content-range": "bytes 2-5/10" } });
  const response = await fetchSocialAudioRange({ ...base, rangeHeader: "bytes=2-5", fetchImpl });
  const reader = response.body.getReader();
  await reader.read();
  await reader.cancel();
  assert.equal(cancelled, true);
});

test('new secret key remains only on apikey header and is never returned or used as a JWT',async()=>{
 const response=await fetchSocialAudioRange({...base,serviceKey:'sb_secret_synthetic',rangeHeader:'bytes=0-3',fetchImpl:async(_url,options)=>{
  const h=new Headers(options.headers);assert.equal(h.get('apikey'),'sb_secret_synthetic');assert.equal(h.has('authorization'),false);
  return new Response(new Uint8Array(4),{status:206,headers:{'Content-Length':'4','Content-Range':'bytes 0-3/10'}});
 }});
 assert.equal(response.status,206);assert.equal(response.headers.has('apikey'),false);assert.equal(response.headers.has('authorization'),false);
});
