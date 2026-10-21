#!/usr/bin/env node
/**
 * Synthetic HTTP integration runner for the isolated Supabase stack only.
 * Usage: node scripts/social-local-supabase-check.mjs --connection-file <0600-json> --draft-policy|--issued-policy
 * Never logs tokens, keys, response bodies, request bodies, or credential URLs.
 */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { postingPolicy } from '../data/posting-policy.mjs';

const EXPECTED_API = 'http://127.0.0.1:57431';
const args = process.argv.slice(2);
let selectedMode = null;
let connectionFile = null;
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--draft-policy' || arg === '--issued-policy') {
    if (selectedMode) throw new Error('Choose exactly one policy mode.');
    selectedMode = arg;
  } else if (arg === '--connection-file') {
    if (connectionFile !== null) throw new Error('Specify --connection-file only once.');
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error('--connection-file requires a path.');
    connectionFile = value;
    index += 1;
  } else {
    throw new Error('Unknown argument.');
  }
}
if (!selectedMode) throw new Error('Choose exactly one mode: --draft-policy or --issued-policy.');
if (!connectionFile) throw new Error('Provide --connection-file <path>.');
const policyMode = selectedMode === '--draft-policy' ? 'draft' : 'issued-local-copy';
const SOURCE_POLICY = Object.freeze({
  termsVersion: postingPolicy.terms.version,
  privacyVersion: postingPolicy.privacy.version,
});
const configStat = await stat(connectionFile).catch(() => null);
if (!configStat || (configStat.mode & 0o077) !== 0) {
  throw new Error('Local connection file missing or permissions are broader than 0600.');
}
let connection;
try { connection = JSON.parse(await readFile(connectionFile, 'utf8')); }
catch { throw new Error('Local connection file is unreadable or invalid JSON.'); }
if (!connection || connection.url !== EXPECTED_API || typeof connection.publishableKey !== 'string' || !connection.publishableKey ||
    typeof connection.secretKey !== 'string' || !connection.secretKey) {
  throw new Error('Local connection file must contain url, publishableKey and secretKey for the fixed loopback stack.');
}
const api = new URL(connection.url);
if (api.protocol !== 'http:' || api.hostname !== '127.0.0.1' || api.port !== '57431' || api.username || api.password || api.pathname !== '/' || api.search || api.hash) {
  throw new Error('Refusing non-loopback or unexpected API URL.');
}
const publishableKey = connection.publishableKey;
const secretKey = connection.secretKey;
const timeoutMs = 12_000;
const PASS = [];

function safeCheck(condition, label) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  PASS.push(label);
}
function safeEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`FAIL: ${label} (expected ${expected}, received ${actual})`);
  PASS.push(label);
}
function safeStatus(actual, allowed, label) {
  if (!allowed.includes(actual)) throw new Error(`FAIL: ${label} (HTTP ${actual}; expected ${allowed.join('/')})`);
  PASS.push(label);
}
async function safeStorageDenied(response, label, missingOnly = false) {
  if (response.status === 400) {
    const body = await response.json();
    safeCheck(String(body.statusCode) === '404' && body.error === 'not_found', `${label}: Storage wraps not-found in HTTP400`);
    return;
  }
  safeStatus(response.status, missingOnly ? [404] : [401, 403, 404], label);
}
function userHeaders(token) {
  return { apikey: publishableKey, ...(token ? { authorization: `Bearer ${token}` } : {}), accept: 'application/json' };
}
function adminHeaders() {
  return { apikey: secretKey, authorization: `Bearer ${secretKey}`, accept: 'application/json' };
}
function pathUrl(path) {
  const url = new URL(path, EXPECTED_API);
  if (url.origin !== EXPECTED_API || !url.pathname.startsWith('/')) throw new Error('Refusing non-loopback request target.');
  return url;
}
async function request(path, { method = 'GET', headers = {}, body, expectedRedirect = false } = {}) {
  const url = pathUrl(path);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method, headers, body, redirect: expectedRedirect ? 'manual' : 'error', cache: 'no-store', signal: controller.signal,
    });
  } catch {
    throw new Error(`Local HTTP request failed (${method} ${url.pathname}); no response details or credentials are logged.`);
  } finally { clearTimeout(timer); }
}
async function jsonCall(path, { method = 'POST', token, admin = false, body = {}, contentType = 'application/json' } = {}) {
  const headers = { ...(admin ? adminHeaders() : userHeaders(token)), ...(contentType === 'multipart/form-data' ? {} : { 'content-type': contentType }) };
  const response = await request(path, { method, headers, body: contentType === 'application/json' ? JSON.stringify(body) : body });
  let payload = null;
  try { payload = await response.json(); } catch { /* status is still useful */ }
  return { response, payload };
}
function randomEmail(label) { return `qa-${label}-${randomUUID()}@example.test`; }
function randomPassword() { return `Qx!${randomBytes(24).toString('base64url')}9`; }
function reqKey() { return randomUUID(); }
function userId(user) { return user?.id || user?.user?.id || ''; }
function userToken(session) { return session?.access_token || ''; }
function postId(payload) { return payload?.post?.id || payload?.post?.postId || payload?.postId || ''; }

async function anonymousSession(label) {
  const { response, payload } = await jsonCall('/auth/v1/signup', {
    method: 'POST', body: { data: { app: 'pixieed', mode: 'synthetic-http-test', testCase: label } },
  });
  safeStatus(response.status, [200, 201], `${label}: anonymous Auth signup`);
  safeCheck(userId(payload) && userToken(payload) && payload.refresh_token, `${label}: anonymous Auth returns a session`);
  return { id: userId(payload), token: userToken(payload), refresh: payload.refresh_token };
}
async function registeredSession(label) {
  const email = randomEmail(label);
  const password = randomPassword();
  const created = await jsonCall('/auth/v1/admin/users', {
    method: 'POST', admin: true,
    body: { email, password, email_confirm: true, user_metadata: { app: 'pixieed', synthetic_http_test: true } },
  });
  safeStatus(created.response.status, [200, 201], `${label}: local admin provisions synthetic account`);
  const id = userId(created.payload);
  safeCheck(Boolean(id), `${label}: synthetic account has ID`);
  const signed = await jsonCall('/auth/v1/token?grant_type=password', {
    method: 'POST', body: { email, password },
  });
  safeStatus(signed.response.status, [200], `${label}: local account sign-in`);
  safeCheck(userId(signed.payload) === id && userToken(signed.payload), `${label}: sign-in identity matches provisioned account`);
  return { id, token: userToken(signed.payload), refresh: signed.payload.refresh_token };
}
async function socialJson(payload, token, path = '/functions/v1/social-feed') {
  return jsonCall(path, { method: 'POST', token, body: payload });
}
async function fetchPost(id, token) {
  return socialJson({ action: 'get', postId: id }, token);
}
function acceptedConsent() {
  return { accepted: true, termsVersion: SOURCE_POLICY.termsVersion, privacyVersion: SOURCE_POLICY.privacyVersion };
}
function textPayload({ key = reqKey(), visibility = 'private', body = `synthetic-${randomUUID()}`, title = 'Synthetic HTTP test' } = {}) {
  return { action: 'create', requestKey: key, kind: 'text', visibility, title, body, authorName: 'Local QA', ...(visibility === 'public' ? { postingConsent: acceptedConsent() } : {}) };
}
function syntheticWav() {
  // Valid PCM RIFF/WAVE: mono 8-bit, 8 kHz, 1600 samples (0.2 sec).
  const pcm = Buffer.alloc(1600, 128);
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28);
  wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write('data', 36);
  wav.writeUInt32LE(pcm.length, 40); pcm.copy(wav, 44);
  return wav;
}
async function createMusic({ owner, visibility = 'private', key = reqKey(), title = 'Synthetic WAV' }) {
  const form = new FormData();
  const payload = { action: 'create', requestKey: key, kind: 'music', visibility, musicTitle: title, title, body: '', authorName: 'Local QA', ...(visibility === 'public' ? { postingConsent: acceptedConsent() } : {}) };
  form.append('payload', JSON.stringify(payload));
  form.append('audio', new Blob([syntheticWav()], { type: 'audio/wav' }), 'synthetic-local.wav');
  const { response, payload: result } = await jsonCall('/functions/v1/social-feed', {
    method: 'POST', token: owner.token, body: form, contentType: 'multipart/form-data',
  });
  return { response, payload: result, key };
}
async function audioRange(id, token = '', range = 'bytes=8-11') {
  const headers = userHeaders(token);
  headers.range = range;
  return request(`/functions/v1/social-feed?action=audio&postId=${encodeURIComponent(id)}`, { headers });
}
async function unauthSocial(payload) {
  return jsonCall('/functions/v1/social-feed', { method: 'POST', body: payload });
}
async function storageObject(bucket, path, token = '', admin = false) {
  const headers = admin ? adminHeaders() : userHeaders(token);
  return request(`/storage/v1/object/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`, { headers });
}
async function getSnsRequestRows(owner, key) {
  const query = new URLSearchParams({ select: 'id,request_key', owner_id: `eq.${owner}`, request_key: `eq.${key}` });
  return request(`/rest/v1/sns_posts?${query}`, { headers: adminHeaders() });
}
async function getReceipt(owner, purpose, key) {
  const query = new URLSearchParams({
    select: 'owner_id,purpose,request_key,request_digest,terms_version,privacy_version,terms_sha256,privacy_sha256,accepted_at',
    owner_id: `eq.${owner}`, purpose: `eq.${purpose}`, request_key: `eq.${key}`,
  });
  const headers = adminHeaders();
  headers.accept = 'application/json';
  return request(`/rest/v1/posting_consents?${query}`, { headers });
}

// 1. Verify local-only policy gate before any public side effects.
const gateOwner = await registeredSession('gate');
const publicGatePayload = textPayload({ visibility: 'public', body: 'synthetic-policy-gate' });
const gate = await socialJson(publicGatePayload, gateOwner.token);
if (policyMode === 'draft') {
  safeEqual(gate.response.status, 503, 'draft policy blocks public SNS post');
  safeEqual(gate.payload?.error, 'posting_policy_unavailable', 'draft policy failure is explicit');
} else {
  safeStatus(gate.response.status, [201], 'issued local fixture accepts synthetic public SNS post');
}
const imageGate = await jsonCall('/functions/v1/create-post', {
  method: 'POST', token: gateOwner.token,
  body: { visibility: 'public', requestKey: reqKey(), postingConsent: acceptedConsent() },
});
if (policyMode === 'draft') {
  safeEqual(imageGate.response.status, 503, 'draft policy blocks image/puzzle route before media validation');
  safeEqual(imageGate.payload?.error, 'posting_policy_unavailable', 'draft image gate failure is explicit');
} else {
  // No image upload is attempted in this harness.
  safeCheck(imageGate.response.status !== 201, 'image route is not mistaken for a completed image upload test');
}

// 2. Create synthetic anonymous and registered subjects; never print their credentials.
const guest = await anonymousSession('source');
const guestRace = await anonymousSession('race-source');
const ownerA = await registeredSession('owner-a');
const ownerB = await registeredSession('owner-b');
const other = await registeredSession('other');

// 3. Invalid JWT, private text access controls, replay and key collision.
const invalid = await socialJson(textPayload(), 'not-a-valid-local-jwt');
safeStatus(invalid.response.status, [401], 'invalid JWT rejected');
const privateText = textPayload();
const privateCreate = await socialJson(privateText, guest.token);
safeStatus(privateCreate.response.status, [201], 'anonymous guest can create private text');
const privateId = postId(privateCreate.payload);
safeCheck(Boolean(privateId), 'private text response has post ID');
const ownRead = await fetchPost(privateId, guest.token);
safeEqual(ownRead.response.status, 200, 'private text owner read status');
safeEqual(ownRead.payload?.post?.body, privateText.body, 'private text visible to owner');
const foreignRead = await fetchPost(privateId, ownerA.token);
safeEqual(foreignRead.response.status, 200, 'private text foreign read status');
safeEqual(foreignRead.payload?.post, null, 'private text hidden from another identity');
const replayText = await socialJson(privateText, guest.token);
safeEqual(replayText.response.status, 200, 'same text request key replays');
safeEqual(postId(replayText.payload), privateId, 'text replay returns original post');
const collisionText = await socialJson({ ...privateText, body: `${privateText.body}-changed` }, guest.token);
safeEqual(collisionText.response.status, 409, 'same key with changed text conflicts');

// 4. Private music exact byte-range, replay, and owner-only access.
const privateMusic = await createMusic({ owner: guest });
safeStatus(privateMusic.response.status, [201], 'anonymous guest creates private synthetic music');
const musicId = postId(privateMusic.payload);
safeCheck(Boolean(musicId), 'private music response has post ID');
const musicPath = `${guest.id}/${musicId}.wav`;
const storageNoAuth = await storageObject('sns-audio', musicPath);
await safeStorageDenied(storageNoAuth, 'private Storage object denied without a session');
const storageForeign = await storageObject('sns-audio', musicPath, ownerA.token);
await safeStorageDenied(storageForeign, 'private Storage object denied to a foreign user');
const musicReplay = await createMusic({ owner: guest, key: privateMusic.key });
safeEqual(musicReplay.response.status, 200, 'same music request key and WAV replays');
safeEqual(postId(musicReplay.payload), musicId, 'music replay returns original post');
const musicOwnerRange = await audioRange(musicId, guest.token);
safeEqual(musicOwnerRange.status, 206, 'private owner audio range returns 206');
safeEqual(musicOwnerRange.headers.get('content-range'), `bytes 8-11/${syntheticWav().length}`, 'private audio Content-Range exact');
safeEqual(musicOwnerRange.headers.get('content-length'), '4', 'private audio range length exact');
assert.deepEqual(Buffer.from(await musicOwnerRange.arrayBuffer()), syntheticWav().subarray(8, 12));
PASS.push('private audio range bytes match synthetic WAV');
const foreignMusicRange = await audioRange(musicId, ownerA.token);
safeEqual(foreignMusicRange.status, 404, 'private audio denied to another identity');

// 5. Claim verifies target and source tokens independently and keeps private media reachable only by new owner.
const claimKey = reqKey();
const claim = await socialJson({ action: 'claim-guest', requestKey: claimKey, guestAccessToken: guest.token, guestId: other.id, ownerId: guest.id }, ownerA.token);
safeEqual(claim.response.status, 200, 'claim accepted for independently verified identities');
safeEqual(claim.payload?.claim?.guestId, guest.id, 'claim source UUID comes from source getUser');
safeEqual(claim.payload?.claim?.ownerId, ownerA.id, 'claim target UUID comes from target getUser');
safeEqual(claim.payload?.claim?.requestKey, claimKey, 'claim acknowledgment binds request key');
const claimedTextOwner = await fetchPost(privateId, ownerA.token);
safeEqual(claimedTextOwner.payload?.post?.body, privateText.body, 'target can read claimed private text');
const oldGuestText = await fetchPost(privateId, guest.token);
safeEqual(oldGuestText.payload?.post, null, 'source cannot read claimed private text');
const claimedMusicRange = await audioRange(musicId, ownerA.token);
safeEqual(claimedMusicRange.status, 206, 'target can read claimed music range');
safeEqual(claimedMusicRange.headers.get('content-range'), `bytes 8-11/${syntheticWav().length}`, 'claimed music retains original byte range');
assert.deepEqual(Buffer.from(await claimedMusicRange.arrayBuffer()), syntheticWav().subarray(8, 12));
PASS.push('claimed audio bytes preserved under original media owner path');
const claimReplay = await socialJson({ action: 'claim-guest', requestKey: claimKey, guestAccessToken: guest.token }, ownerA.token);
safeEqual(claimReplay.response.status, 200, 'same claim key replays');
safeEqual(claimReplay.payload?.claim?.replayed, true, 'claim replay explicitly acknowledged');
const claimCollision = await socialJson({ action: 'claim-guest', requestKey: reqKey(), guestAccessToken: guest.token }, ownerB.token);
safeEqual(claimCollision.response.status, 409, 'claimed guest cannot transfer to a second target');
const claimedStorageDirect = await storageObject('sns-audio', musicPath, ownerA.token);
await safeStorageDenied(claimedStorageDirect, 'claimed audio remains unavailable through direct private Storage URL');
const formerOwnerDelete = await socialJson({ action: 'delete', postId: musicId }, guest.token);
safeEqual(formerOwnerDelete.response.status, 404, 'former guest cannot delete after ownership claim');
const ownerDelete = await socialJson({ action: 'delete', postId: musicId }, ownerA.token);
safeEqual(ownerDelete.response.status, 200, 'current owner can delete claimed music');
safeEqual(ownerDelete.payload?.cleanupPending, false, 'successful delete confirms Storage cleanup');
const deletedRead = await fetchPost(musicId, ownerA.token);
safeEqual(deletedRead.payload?.post, null, 'deleted post is tombstoned from post reader');
const deletedAudio = await audioRange(musicId, ownerA.token);
safeEqual(deletedAudio.status, 404, 'deleted music audio endpoint returns not found');
const deletedStorageObject = await storageObject('sns-audio', musicPath, '', true);
await safeStorageDenied(deletedStorageObject, 'service Storage object is absent after delete cleanup', true);
const deleteReplay = await socialJson({ action: 'delete', postId: musicId }, ownerA.token);
safeEqual(deleteReplay.response.status, 200, 'owner delete cleanup retry is idempotent');
safeEqual(deleteReplay.payload?.cleanupPending, false, 'delete retry confirms cleanup complete');
const anonTarget = await socialJson({ action: 'claim-guest', requestKey: reqKey(), guestAccessToken: guestRace.token }, guest.token);
safeEqual(anonTarget.response.status, 403, 'anonymous target cannot claim another guest');
const wrongSource = await socialJson({ action: 'claim-guest', requestKey: reqKey(), guestAccessToken: ownerB.token }, ownerB.token);
safeEqual(wrongSource.response.status, 403, 'registered source token rejected as guest source');

// Race two distinct confirmed targets for a second source guest; exactly one may own it.
const raceText = textPayload();
const raceCreated = await socialJson(raceText, guestRace.token);
safeStatus(raceCreated.response.status, [201], 'second guest creates race fixture');
const racePostId = postId(raceCreated.payload);
const raceKeys = [reqKey(), reqKey()];
const raceResults = await Promise.all([
  socialJson({ action: 'claim-guest', requestKey: raceKeys[0], guestAccessToken: guestRace.token }, ownerA.token),
  socialJson({ action: 'claim-guest', requestKey: raceKeys[1], guestAccessToken: guestRace.token }, ownerB.token),
]);
safeEqual(raceResults.filter((item) => item.response.status === 200).length, 1, 'concurrent guest claim has exactly one winner');
safeEqual(raceResults.filter((item) => item.response.status === 409).length, 1, 'concurrent guest claim has exactly one conflict');
const raceWinnerIndex = raceResults[0].response.status === 200 ? 0 : 1;
const raceWinner = raceWinnerIndex === 0 ? ownerA : ownerB;
const raceLoser = raceWinnerIndex === 0 ? ownerB : ownerA;
const raceReplay = await socialJson({ action: 'claim-guest', requestKey: raceKeys[raceWinnerIndex], guestAccessToken: guestRace.token }, raceWinner.token);
safeEqual(raceReplay.response.status, 200, 'concurrent claim winner can retry');
safeEqual(raceReplay.payload?.claim?.replayed, true, 'concurrent winner retry is idempotent');
const raceLoserRetry = await socialJson({ action: 'claim-guest', requestKey: reqKey(), guestAccessToken: guestRace.token }, raceLoser.token);
safeEqual(raceLoserRetry.response.status, 409, 'losing target remains excluded after retry');
const raceWinnerRead = await fetchPost(racePostId, raceWinner.token);
safeEqual(raceWinnerRead.payload?.post?.body, raceText.body, 'only claim winner owns private source row');
const raceLoserRead = await fetchPost(racePostId, raceLoser.token);
safeEqual(raceLoserRead.payload?.post, null, 'losing target cannot read source private row');

// 6. Policy-gated public paths. Issued mode must be served from root's explicitly marked temporary local copy.
if (policyMode === 'issued-local-copy') {
  for (const [label, consent] of [['missing', undefined], ['old-version', { accepted: true, termsVersion: 'old-terms', privacyVersion: SOURCE_POLICY.privacyVersion }]]) {
    const gated = textPayload({ visibility: 'public', body: `synthetic-consent-${label}-${randomUUID()}` });
    if (consent) gated.postingConsent = consent; else delete gated.postingConsent;
    const denied = await socialJson(gated, ownerA.token);
    safeEqual(denied.response.status, 428, `issued policy rejects ${label} public consent before write`);
    const expectedError = label === 'missing' ? 'posting_consent_required' : 'posting_consent_version_mismatch';
    safeEqual(denied.payload?.error, expectedError, `issued policy reports ${label} consent error`);
    const noReceipt = await getReceipt(ownerA.id, 'sns-create', gated.requestKey);
    safeEqual(noReceipt.status, 200, `${label} consent receipt query is available to local service role`);
    safeEqual((await noReceipt.json()).length, 0, `${label} consent refusal wrote no receipt`);
    const noPost = await getSnsRequestRows(ownerA.id, gated.requestKey);
    safeEqual(noPost.status, 200, `${label} SNS request lookup is available to local service role`);
    safeEqual((await noPost.json()).length, 0, `${label} consent refusal wrote no SNS row`);
  }
  const publicText = textPayload({ visibility: 'public', body: `synthetic-public-${randomUUID()}` });
  const publicCreate = await socialJson(publicText, ownerA.token);
  safeStatus(publicCreate.response.status, [201], 'issued local fixture creates public text');
  const publicId = postId(publicCreate.payload);
  const publicForeignRead = await fetchPost(publicId, other.token);
  safeEqual(publicForeignRead.payload?.post?.body, publicText.body, 'public text visible to another local user');
  const publicUnauthRead = await unauthSocial({ action: 'get', postId: publicId });
  safeEqual(publicUnauthRead.response.status, 200, 'unauthenticated public text read status');
  safeEqual(publicUnauthRead.payload?.post?.body, publicText.body, 'public text readable without a user session');
  const publicList = await unauthSocial({ action: 'list', limit: 50 });
  safeEqual(publicList.response.status, 200, 'unauthenticated public feed list status');
  safeCheck(Array.isArray(publicList.payload?.posts) && publicList.payload.posts.some((post) => post.id === publicId), 'unauthenticated public list includes public text');
  const publicReplay = await socialJson(publicText, ownerA.token);
  safeEqual(publicReplay.response.status, 200, 'public text replay is idempotent');
  const receipt = await getReceipt(ownerA.id, 'sns-create', publicText.requestKey);
  safeEqual(receipt.status, 200, 'service-role local receipt select succeeds');
  const receiptRows = await receipt.json();
  safeEqual(receiptRows.length, 1, 'one append-only receipt per request key');
  safeEqual(receiptRows[0]?.owner_id, ownerA.id, 'receipt owner is server-verified identity');
  const originalAcceptedAt = receiptRows[0]?.accepted_at;
  const secondReceiptRead = await getReceipt(ownerA.id, 'sns-create', publicText.requestKey);
  const secondReceiptRows = await secondReceiptRead.json();
  safeEqual(secondReceiptRows[0]?.accepted_at, originalAcceptedAt, 'receipt retry preserves original accepted_at');
  const changedConsentRequest = await socialJson({ ...publicText, body: `${publicText.body}-changed` }, ownerA.token);
  safeEqual(changedConsentRequest.response.status, 503, 'same public receipt key with changed digest fails closed');
  const serviceHeaders = adminHeaders();
  serviceHeaders['content-type'] = 'application/json';
  const updateAttempt = await request(`/rest/v1/posting_consents?owner_id=eq.${encodeURIComponent(ownerA.id)}&purpose=eq.sns-create&request_key=eq.${encodeURIComponent(publicText.requestKey)}`, {
    method: 'PATCH', headers: serviceHeaders, body: JSON.stringify({ accepted_at: new Date(0).toISOString() }),
  });
  safeStatus(updateAttempt.status, [401, 403], 'service role cannot update append-only receipt');
  const deleteAttempt = await request(`/rest/v1/posting_consents?owner_id=eq.${encodeURIComponent(ownerA.id)}&purpose=eq.sns-create&request_key=eq.${encodeURIComponent(publicText.requestKey)}`, {
    method: 'DELETE', headers: adminHeaders(),
  });
  safeStatus(deleteAttempt.status, [401, 403], 'service role cannot delete append-only receipt');
  const publicMusic = await createMusic({ owner: ownerA, visibility: 'public' });
  safeStatus(publicMusic.response.status, [201], 'issued local fixture creates public synthetic music');
  const publicMusicId = postId(publicMusic.payload);
  const publicAudio = await audioRange(publicMusicId, other.token);
  safeEqual(publicAudio.status, 206, 'public music audio byte range available to other user');
  assert.deepEqual(Buffer.from(await publicAudio.arrayBuffer()), syntheticWav().subarray(8, 12));
  PASS.push('public music range bytes match synthetic WAV');
  const publicUnauthAudio = await audioRange(publicMusicId);
  safeEqual(publicUnauthAudio.status, 206, 'public music audio range available without user session');
  assert.deepEqual(Buffer.from(await publicUnauthAudio.arrayBuffer()), syntheticWav().subarray(8, 12));
  PASS.push('unauthenticated public music range bytes match synthetic WAV');
  const publicMusicReceipt = await getReceipt(ownerA.id, 'sns-create', publicMusic.key);
  safeEqual(publicMusicReceipt.status, 200, 'public music consent receipt is persisted');
}

// 7. Non-mutation/API boundaries and safe comments behavior.
for (const action of ['comments', 'comment-create', 'comment-edit', 'comment-delete']) {
  const disabled = await socialJson({ action }, ownerA.token);
  safeEqual(disabled.response.status, 410, `comment route ${action} disabled`);
}
for (const table of ['posting_consents', 'sns_guest_claims', 'user_post_puzzles', 'post_locations_private']) {
  const direct = await request(`/rest/v1/${table}?select=*`, { headers: userHeaders(ownerA.token) });
  safeStatus(direct.status, [401, 403], `direct Data API read denied: ${table}`);
}
const claimRpcDirect = await jsonCall('/rest/v1/rpc/pixieed_sns_claim_guest', {
  method: 'POST', token: ownerA.token,
  body: { p_guest_id: guest.id, p_owner_id: ownerA.id, p_request_key: reqKey() },
});
safeStatus(claimRpcDirect.response.status, [401, 403, 404], 'claim RPC is not an authenticated Data API route');
const puzzleId = randomUUID();
const anonymousPuzzle = await request(`/functions/v1/public-post-puzzle?postId=${puzzleId}`, { headers: userHeaders('') });
safeEqual(anonymousPuzzle.status, 404, 'anonymous puzzle reader returns safe not-found for absent synthetic ID');
const puzzleJson = await anonymousPuzzle.json();
safeEqual(puzzleJson?.error, 'puzzle_not_found', 'puzzle reader does not disclose internal state');

console.log(JSON.stringify({
  status: 'passed',
  mode: policyMode,
  casesPassed: PASS.length,
  caseLabels: PASS,
  apiHost: '127.0.0.1:57431',
  syntheticSubjects: 'ephemeral local only',
  sourcePolicyState: 'draft',
  issuedPolicyBoundary: policyMode === 'issued-local-copy' ? 'temporary local fixture; not candidate source or production activation' : 'not exercised',
  sameIdEmailPromotion: 'NOT TESTED: this harness uses admin-provisioned confirmed accounts; it does not read Mailpit/Inbucket OTP messages or exercise PUT /auth/v1/user followed by POST /auth/v1/verify type=email_change.',
  externalNetwork: 'not requested by this script; all targets are fixed loopback',
  cleanup: 'Use only the disposable local stack reset after preserving the result; no Auth users or rows are removed by this script.'
}, null, 2));
