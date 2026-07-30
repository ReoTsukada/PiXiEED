import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

const baseUrl = String(process.env.PIXISYNC_TEST_URL || '').replace(/\/+$/, '');
const apiKey = String(process.env.PIXISYNC_TEST_KEY || '');
const fixtureNames = ['OWNER', 'EDITOR', 'LEAVER'];
const fixtures = Object.fromEntries(fixtureNames.map(name => [name.toLowerCase(), {
  email: String(process.env[`PIXISYNC_TEST_${name}_EMAIL`] || ''),
  password: String(process.env[`PIXISYNC_TEST_${name}_PASSWORD`] || ''),
}]));

assert.match(baseUrl, /^https:\/\/[a-z]+\.supabase\.co$/);
assert.ok(apiKey.startsWith('sb_publishable_') || apiKey.split('.').length === 3);
Object.values(fixtures).forEach(({ email, password }) => {
  assert.match(email, /^[^@\s]+@[^@\s]+$/);
  assert.ok(password.length >= 12);
});

const sha256Hex = value => createHash('sha256').update(value).digest('hex');
const storageObjectUrl = path => `${baseUrl}/storage/v1/object/pixisync-checkpoints/${
  path.split('/').map(encodeURIComponent).join('/')
}`;

async function readResponse(response) {
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { response, data };
}

async function api(path, {
  token = '',
  method = 'GET',
  body,
  headers = {},
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      apikey: apiKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined && !(body instanceof Uint8Array) ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined
      ? undefined
      : body instanceof Uint8Array
        ? body
        : JSON.stringify(body),
  });
  return readResponse(response);
}

async function expectFailure(promise, pattern) {
  const { response, data } = await promise;
  assert.ok(response.status >= 400, `expected failure, received ${response.status}`);
  assert.match(JSON.stringify(data), pattern);
  return { response, data };
}

async function signUp(fixture) {
  return api('/auth/v1/signup', {
    method: 'POST',
    body: { email: fixture.email, password: fixture.password },
  });
}

async function signIn(fixture) {
  const { response, data } = await api('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: fixture.email, password: fixture.password },
  });
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.ok(data?.access_token);
  assert.ok(data?.user?.id);
  return { token: data.access_token, userId: data.user.id };
}

async function rpc(name, token, body = {}) {
  return api(`/rest/v1/rpc/${name}`, { token, method: 'POST', body });
}

async function rpcOk(name, token, body = {}) {
  const { response, data } = await rpc(name, token, body);
  assert.equal(response.status, 200, `${name}: ${JSON.stringify(data)}`);
  return data;
}

async function upload(path, token, bytes, { upsert = false } = {}) {
  return api(`/storage/v1/object/pixisync-checkpoints/${
    path.split('/').map(encodeURIComponent).join('/')
  }`, {
    token,
    method: 'POST',
    body: bytes,
    headers: {
      'Content-Type': 'application/octet-stream',
      ...(upsert ? { 'x-upsert': 'true' } : {}),
    },
  });
}

async function download(path, token) {
  const response = await fetch(storageObjectUrl(path), {
    headers: { apikey: apiKey, Authorization: `Bearer ${token}` },
  });
  return { response, bytes: new Uint8Array(await response.arrayBuffer()) };
}

function makePixelPatch(index, paletteValue) {
  assert.ok(index >= 0 && index < 128);
  assert.ok(paletteValue >= 0 && paletteValue <= 254);
  return Uint8Array.from([0x50, 0x69, 0x58, 0x53, 1, 0, 1, index, paletteValue]);
}

function waitForMessage(socket, predicate, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeEventListener('message', onMessage);
      reject(new Error('realtime-message-timeout'));
    }, timeoutMs);
    function onMessage(event) {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.removeEventListener('message', onMessage);
      resolve(message);
    }
    socket.addEventListener('message', onMessage);
  });
}

async function openRealtime(topic, token, expectedStatus = 'ok') {
  const wsUrl = baseUrl.replace(/^http/, 'ws')
    + `/realtime/v1/websocket?apikey=${encodeURIComponent(apiKey)}&vsn=1.0.0`;
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('realtime-open-timeout')), 10000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('realtime-open-error')); }, { once: true });
  });
  const wireTopic = `realtime:${topic}`;
  const reply = waitForMessage(socket, message => message.event === 'phx_reply' && message.ref === '1');
  socket.send(JSON.stringify({
    topic: wireTopic,
    event: 'phx_join',
    payload: {
      config: {
        private: true,
        broadcast: { ack: true, self: false },
        presence: { key: '' },
        postgres_changes: [],
      },
      access_token: token,
    },
    ref: '1',
    join_ref: '1',
  }));
  const joined = await reply;
  assert.equal(joined.payload?.status, expectedStatus, JSON.stringify(joined));
  if (expectedStatus !== 'ok') socket.close();
  return { socket, wireTopic };
}

async function sendRealtime(channel, event, payload, ref) {
  const reply = waitForMessage(
    channel.socket,
    message => message.event === 'phx_reply' && message.ref === String(ref),
  );
  channel.socket.send(JSON.stringify({
    topic: channel.wireTopic,
    event,
    payload,
    ref: String(ref),
    join_ref: '1',
  }));
  return reply;
}

if (process.argv.includes('--signup')) {
  const results = [];
  for (const [name, fixture] of Object.entries(fixtures)) {
    const { response, data } = await signUp(fixture);
    assert.ok([200, 201].includes(response.status), `${name}: ${JSON.stringify(data)}`);
    results.push({ name, email: fixture.email, userId: data?.user?.id || '' });
  }
  console.log(JSON.stringify({ signup: 'ok', users: results }));
  process.exit(0);
}

const owner = await signIn(fixtures.owner);
const editor = await signIn(fixtures.editor);
const leaver = await signIn(fixtures.leaver);
const initialBytes = new TextEncoder().encode('PiXiSYNC lifecycle checkpoint revision 0');
const initialHash = sha256Hex(initialBytes);

const begin = await rpcOk('pixisync_begin_session', owner.token, {
  p_title: 'PiXiSYNC lifecycle isolated test',
  p_state_sha256: `\\x${initialHash}`,
  p_encoded_bytes: initialBytes.byteLength,
  p_codec_version: 1,
});
assert.equal(begin.length, 1);
assert.equal(begin[0].status, 'initializing');
assert.equal(begin[0].session_generation, 1);
const roomId = begin[0].room_id;
const initialCheckpointId = begin[0].checkpoint_id;
const initialPath = begin[0].storage_path;
assert.equal(initialPath, `rooms/${roomId}/checkpoints/0/${initialCheckpointId}.pxd`);

await expectFailure(
  rpc('pixisync_activate_initial_checkpoint', owner.token, { p_room_id: roomId }),
  /initial_checkpoint_blob_missing/,
);
await expectFailure(
  upload(`rooms/${randomUUID()}/checkpoints/0/${randomUUID()}.pxd`, owner.token, initialBytes),
  /row-level security|Unauthorized|not authorized/i,
);
const preJoinDownload = await download(initialPath, editor.token);
assert.ok(preJoinDownload.response.status >= 400);

const uploaded = await upload(initialPath, owner.token, initialBytes);
assert.equal(uploaded.response.status, 200, JSON.stringify(uploaded.data));
await expectFailure(
  upload(initialPath, owner.token, new TextEncoder().encode('tampered'), { upsert: true }),
  /row-level security|Unauthorized|not authorized/i,
);

const activated = await rpcOk('pixisync_activate_initial_checkpoint', owner.token, { p_room_id: roomId });
assert.equal(activated[0].status, 'active');
assert.equal(activated[0].head_revision, 0);
assert.equal(activated[0].active_checkpoint_id, initialCheckpointId);

const ownerManifest = await rpcOk('pixisync_open_session', owner.token, { p_room_id: roomId });
assert.equal(ownerManifest[0].state_sha256_hex, initialHash);
assert.equal(ownerManifest[0].storage_path, initialPath);
const ownerInitialDownload = await download(initialPath, owner.token);
assert.equal(ownerInitialDownload.response.status, 200);
assert.equal(sha256Hex(ownerInitialDownload.bytes), ownerManifest[0].state_sha256_hex);

const editorInvite = await rpcOk('pixisync_create_invite', owner.token, {
  p_room_id: roomId,
  p_role: 'editor',
  p_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  p_max_uses: 1,
});
const editorJoin = await rpcOk('pixisync_join_session', editor.token, {
  p_invite_token: editorInvite[0].invite_token,
});
assert.equal(editorJoin[0].room_id, roomId);
assert.equal(editorJoin[0].can_edit, true);

const editorManifest = await rpcOk('pixisync_open_session', editor.token, { p_room_id: roomId });
assert.deepEqual(
  editorManifest[0],
  { ...ownerManifest[0], role: 'editor', can_edit: true },
);
const editorInitialDownload = await download(initialPath, editor.token);
assert.equal(editorInitialDownload.response.status, 200);
assert.equal(sha256Hex(editorInitialDownload.bytes), initialHash);
const nonmemberDownload = await download(initialPath, leaver.token);
assert.ok(nonmemberDownload.response.status >= 400);

const topic = `pixisync:room:${roomId}`;
const ownerChannel = await openRealtime(topic, owner.token);
const editorChannel = await openRealtime(topic, editor.token);
await openRealtime(topic, leaver.token, 'error');
await openRealtime(`pixisync:room:${randomUUID()}`, owner.token, 'error');

const broadcastReceived = waitForMessage(
  editorChannel.socket,
  message => message.event === 'broadcast'
    && message.payload?.event === 'lifecycle-smoke',
);
const broadcastReply = await sendRealtime(ownerChannel, 'broadcast', {
  type: 'broadcast',
  event: 'lifecycle-smoke',
  payload: { roomId },
}, 2);
assert.equal(broadcastReply.payload?.status, 'ok');
await broadcastReceived;
const presenceReply = await sendRealtime(editorChannel, 'presence', {
  type: 'presence',
  event: 'track',
  payload: { state: 'active' },
}, 2);
assert.equal(presenceReply.payload?.status, 'ok');

const clientId = randomUUID();
async function commit(index, paletteValue) {
  const payload = makePixelPatch(index, paletteValue);
  const operationId = randomUUID();
  const rows = await rpcOk('pixisync_commit_operation', owner.token, {
    p_room_id: roomId,
    p_operation_id: operationId,
    p_client_id: clientId,
    p_kind: 'pixel_patch',
    p_structure_epoch: 0,
    p_codec_version: 1,
    p_canvas_id: 'canvas-1',
    p_frame_id: 'frame-1',
    p_layer_id: 'layer-1',
    p_canvas_width: 16,
    p_canvas_height: 16,
    p_payload: `\\x${Buffer.from(payload).toString('hex')}`,
    p_payload_sha256: `\\x${sha256Hex(payload)}`,
    p_pixel_count: 1,
    p_undo_of_operation_id: null,
  });
  return { ...rows[0], operationId };
}

const firstCommit = await commit(0, 7);
assert.equal(firstCommit.revision, 1);
const openAtOne = await rpcOk('pixisync_open_session', editor.token, { p_room_id: roomId });
assert.equal(openAtOne[0].checkpoint_revision, 0);
assert.equal(openAtOne[0].head_revision, 1);
const firstTail = await rpcOk('pixisync_get_ops_since', editor.token, {
  p_room_id: roomId,
  p_after_revision: 0,
  p_limit: 250,
});
assert.deepEqual(firstTail.map(row => row.revision), [1]);
const secondCommit = await commit(1, 8);
assert.equal(secondCommit.revision, 2);
const reTail = await rpcOk('pixisync_get_ops_since', editor.token, {
  p_room_id: roomId,
  p_after_revision: 1,
  p_limit: 250,
});
assert.deepEqual(reTail.map(row => row.revision), [2]);
const openAtTwo = await rpcOk('pixisync_open_session', editor.token, { p_room_id: roomId });
assert.equal(openAtTwo[0].head_revision, 2);

const leaverInvite = await rpcOk('pixisync_create_invite', owner.token, {
  p_room_id: roomId,
  p_role: 'editor',
  p_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  p_max_uses: 1,
});
await rpcOk('pixisync_join_session', leaver.token, {
  p_invite_token: leaverInvite[0].invite_token,
});
const leaverChannel = await openRealtime(topic, leaver.token);
const left = await rpcOk('pixisync_leave_session', leaver.token, { p_room_id: roomId });
assert.equal(left, true);
leaverChannel.socket.close();
await expectFailure(
  rpc('pixisync_get_ops_since', leaver.token, {
    p_room_id: roomId,
    p_after_revision: 0,
    p_limit: 1,
  }),
  /not_active_member/,
);
await openRealtime(topic, leaver.token, 'error');
const leftDownload = await download(initialPath, leaver.token);
assert.ok(leftDownload.response.status >= 400);

const finalBytes = new TextEncoder().encode('PiXiSYNC lifecycle checkpoint revision 2');
const finalHash = sha256Hex(finalBytes);
const finalCheckpointId = randomUUID();
const prepared = await rpcOk('pixisync_prepare_checkpoint', owner.token, {
  p_room_id: roomId,
  p_checkpoint_id: finalCheckpointId,
  p_state_sha256: `\\x${finalHash}`,
  p_encoded_bytes: finalBytes.byteLength,
  p_codec_version: 1,
});
assert.equal(prepared[0].revision, 2);
const finalPath = prepared[0].storage_path;
const finalUpload = await upload(finalPath, owner.token, finalBytes);
assert.equal(finalUpload.response.status, 200, JSON.stringify(finalUpload.data));
const registered = await rpcOk('pixisync_register_checkpoint', owner.token, {
  p_room_id: roomId,
  p_checkpoint_id: finalCheckpointId,
});
assert.equal(registered[0].status, 'candidate');
const ownerAttestation = await rpcOk('pixisync_attest_checkpoint', owner.token, {
  p_checkpoint_id: finalCheckpointId,
  p_client_id: randomUUID(),
  p_state_sha256: `\\x${finalHash}`,
});
assert.equal(ownerAttestation[0].status, 'candidate');
await expectFailure(
  rpc('pixisync_attest_checkpoint', editor.token, {
    p_checkpoint_id: finalCheckpointId,
    p_client_id: randomUUID(),
    p_state_sha256: `\\x${'00'.repeat(32)}`,
  }),
  /checkpoint_hash_mismatch/,
);
const editorAttestation = await rpcOk('pixisync_attest_checkpoint', editor.token, {
  p_checkpoint_id: finalCheckpointId,
  p_client_id: randomUUID(),
  p_state_sha256: `\\x${finalHash}`,
});
assert.equal(editorAttestation[0].status, 'verified');

const archived = await rpcOk('pixisync_archive_session', owner.token, {
  p_room_id: roomId,
  p_final_checkpoint_id: finalCheckpointId,
});
assert.equal(archived[0].status, 'archived');
assert.equal(archived[0].head_revision, 2);
assert.equal(archived[0].session_generation, 2);
ownerChannel.socket.close();
editorChannel.socket.close();

await expectFailure(
  rpc('pixisync_commit_operation', owner.token, {
    p_room_id: roomId,
    p_operation_id: randomUUID(),
    p_client_id: clientId,
    p_kind: 'pixel_patch',
    p_structure_epoch: 0,
    p_codec_version: 1,
    p_canvas_id: 'canvas-1',
    p_frame_id: 'frame-1',
    p_layer_id: 'layer-1',
    p_canvas_width: 16,
    p_canvas_height: 16,
    p_payload: '\\x506958530100010109',
    p_payload_sha256: `\\x${sha256Hex(Buffer.from('506958530100010109', 'hex'))}`,
    p_pixel_count: 1,
    p_undo_of_operation_id: null,
  }),
  /room_not_active/,
);
await openRealtime(topic, owner.token, 'error');
await openRealtime(topic, editor.token, 'error');

const ownerArchivedDownload = await download(finalPath, owner.token);
const editorArchivedDownload = await download(finalPath, editor.token);
assert.equal(ownerArchivedDownload.response.status, 200);
assert.equal(editorArchivedDownload.response.status, 200);
assert.equal(sha256Hex(ownerArchivedDownload.bytes), finalHash);
assert.equal(sha256Hex(editorArchivedDownload.bytes), finalHash);
const leaverArchivedDownload = await download(finalPath, leaver.token);
assert.ok(leaverArchivedDownload.response.status >= 400);

console.log(JSON.stringify({
  result: 'PASS',
  roomId,
  headRevision: archived[0].head_revision,
  sessionGeneration: archived[0].session_generation,
  checkpointHash: finalHash,
  checks: [
    'begin-and-revision-zero',
    'private-storage-rls-and-immutability',
    'invite-join-open',
    'checkpoint-download-hash',
    'private-broadcast-presence',
    'head-tail-retail',
    'leave-rpc-realtime-storage-deny',
    'checkpoint-attestation-mismatch-deny',
    'archive-write-realtime-deny',
    'archive-active-member-read',
  ],
}));
