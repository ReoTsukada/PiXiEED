import assert from 'node:assert/strict';
import { createHash, randomUUID, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const createStorage = () => {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
};

globalThis.window = {
  PiXiEEDrawModules: {},
  crypto: webcrypto,
  location: new URL('https://example.test/pixiedraw/'),
  localStorage: createStorage(),
  setTimeout,
  clearTimeout,
};

for (const relativePath of [
  '../pixiedraw/assets/js/modules/pixisync-session-state.js',
  '../pixiedraw/assets/js/modules/pixisync-runtime-adapter-utils.js',
]) {
  new Function(await readFile(new URL(relativePath, import.meta.url), 'utf8'))();
}

const ROOM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER_CLIENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EDITOR_CLIENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const INVITE_TOKEN = 'de'.repeat(32);
const sha256 = blob => blob.arrayBuffer()
  .then(bytes => createHash('sha256').update(Buffer.from(bytes)).digest('hex'));

class LifecycleServer {
  constructor() {
    this.status = 'none';
    this.generation = 1;
    this.head = 0;
    this.checkpointId = '';
    this.checkpointPath = '';
    this.checkpointHash = '';
    this.checkpointBytes = 0;
    this.objects = new Map();
    this.members = new Set(['owner']);
    this.broadcasts = [];
    this.realtimeOptions = [];
  }

  manifest(role) {
    return [{
      room_id: ROOM_ID,
      status: this.status,
      role,
      can_edit: true,
      head_revision: String(this.head),
      structure_epoch: '0',
      session_generation: String(this.generation),
      checkpoint_id: this.checkpointId,
      checkpoint_revision: '0',
      storage_path: this.checkpointPath,
      state_sha256_hex: this.checkpointHash,
      encoded_bytes: this.checkpointBytes,
      codec_version: 1,
    }];
  }

  client(actor) {
    return {
      rpc: async (name, params) => {
        try {
          if (name === 'pixisync_begin_session') {
            this.status = 'initializing';
            this.checkpointId = randomUUID();
            this.checkpointPath = `rooms/${ROOM_ID}/checkpoints/0/${this.checkpointId}.pxd`;
            this.checkpointHash = String(params.p_state_sha256).slice(2);
            this.checkpointBytes = params.p_encoded_bytes;
            return { data: [{ room_id: ROOM_ID, checkpoint_id: this.checkpointId, storage_path: this.checkpointPath, status: this.status, session_generation: '1' }], error: null };
          }
          if (name === 'pixisync_activate_initial_checkpoint') {
            assert.ok(this.objects.has(this.checkpointPath));
            this.status = 'active';
            return { data: [{ room_id: ROOM_ID, status: 'active', head_revision: '0', active_checkpoint_id: this.checkpointId, session_generation: '1' }], error: null };
          }
          if (name === 'pixisync_open_session') {
            assert.equal(params.p_room_id, ROOM_ID);
            assert.equal(this.status, 'active');
            assert.ok(this.members.has(actor));
            return { data: this.manifest(actor === 'owner' ? 'owner' : 'editor'), error: null };
          }
          if (name === 'pixisync_create_invite') {
            assert.equal(actor, 'owner');
            return { data: [{ invite_id: randomUUID(), invite_token: INVITE_TOKEN, role: 'editor', expires_at: params.p_expires_at, max_uses: 1 }], error: null };
          }
          if (name === 'pixisync_join_session') {
            assert.equal(params.p_invite_token, INVITE_TOKEN);
            this.members.add(actor);
            return { data: [{ room_id: ROOM_ID, role: 'editor', can_edit: true, status: 'active', head_revision: String(this.head), session_generation: '1' }], error: null };
          }
          if (name === 'pixisync_leave_session') {
            this.members.delete(actor);
            return { data: true, error: null };
          }
          if (name === 'pixisync_prepare_checkpoint') {
            this.checkpointId = params.p_checkpoint_id;
            this.checkpointPath = `rooms/${ROOM_ID}/checkpoints/${this.head}/${this.checkpointId}.pxd`;
            this.checkpointHash = String(params.p_state_sha256).slice(2);
            this.checkpointBytes = params.p_encoded_bytes;
            return { data: [{ checkpoint_id: this.checkpointId, revision: String(this.head), storage_path: this.checkpointPath }], error: null };
          }
          if (name === 'pixisync_register_checkpoint') {
            assert.ok(this.objects.has(this.checkpointPath));
            return { data: [{ checkpoint_id: this.checkpointId, revision: String(this.head), status: 'candidate' }], error: null };
          }
          if (name === 'pixisync_attest_checkpoint') {
            assert.equal(String(params.p_state_sha256).slice(2), this.checkpointHash);
            return { data: [{ checkpoint_id: this.checkpointId, status: 'verified', attested_user_count: 1, required_user_count: 1 }], error: null };
          }
          if (name === 'pixisync_archive_session') {
            this.status = 'archived';
            this.generation += 1;
            return { data: [{ status: 'archived', head_revision: String(this.head), active_checkpoint_id: this.checkpointId, session_generation: String(this.generation) }], error: null };
          }
          throw new Error(`unexpected RPC ${name}`);
        } catch (error) {
          return { data: null, error };
        }
      },
      storage: {
        from: bucket => {
          assert.equal(bucket, 'pixisync-checkpoints');
          return {
            upload: async (path, blob, options) => {
              assert.equal(options.upsert, false);
              if (this.objects.has(path)) return { data: null, error: new Error('duplicate-object') };
              this.objects.set(path, blob);
              return { data: { path }, error: null };
            },
            download: async path => {
              const blob = this.objects.get(path);
              return blob
                ? { data: blob, error: null }
                : { data: null, error: new Error('missing-object') };
            },
          };
        },
      },
      channel: () => ({}),
    };
  }
}

function createRealtimeHarness(server) {
  return options => {
    server.realtimeOptions.push(options);
    let revision = BigInt(options.initialRevision || 0);
    return {
      start: async () => {},
      stop: async () => {},
      trackPresence: async () => {},
      untrackPresence: async () => {},
      syncFrom: async after => {
        revision = BigInt(after);
        return revision;
      },
      replayPendingJournal: async () => 0,
      resetConfirmedRevision: value => { revision = BigInt(value); },
      sendBroadcast: async (event, payload) => {
        server.broadcasts.push({ event, payload });
        return { status: 'ok' };
      },
      commit: async () => {},
      get confirmedRevision() { return revision; },
      get pendingOperationCount() { return 0; },
      get confirmedOperationIds() { return []; },
    };
  };
}

function createBridge() {
  let runtime = null;
  const comments = [];
  let participants = [];
  return {
    configure: next => { runtime = next; },
    clear: () => { runtime = null; },
    refreshUi: () => {},
    applyConfirmed: () => {},
    receiveComment: comment => comments.push(comment),
    updateParticipants: next => { participants = next; },
    snapshot: () => ({ configured: Boolean(runtime), collaboration: Boolean(runtime?.realtimeClient) }),
    comments,
    get participants() { return participants; },
  };
}

function createAdapter({ server, actor, clientId, storage, bindings, checkpointText }) {
  const bridge = createBridge();
  let restored = '';
  const adapter = window.PiXiEEDrawModules.pixisyncRuntimeAdapterUtils.createPiXiSyncRuntimeAdapter({
    createSession: options => window.PiXiEEDrawModules.pixisyncSessionState.createPiXiSyncSessionState(options),
    createRealtimeClient: createRealtimeHarness(server),
    runtimeBridge: bridge,
    getSupabase: async () => server.client(actor),
    captureCheckpoint: async () => new Blob([checkpointText]),
    restoreCheckpoint: async blob => { restored = await blob.text(); },
    getProjectKey: () => `project-${actor}`,
    getProjectTitle: () => `Project ${actor}`,
    readProjectBinding: async projectKey => bindings.get(projectKey) || null,
    writeProjectBinding: async (projectKey, binding) => { bindings.set(projectKey, binding); },
    clearProjectBinding: async projectKey => { bindings.delete(projectKey); },
    getClientId: () => clientId,
    localStorageRef: storage,
  });
  return { adapter, bridge, get restored() { return restored; } };
}

const server = new LifecycleServer();
const ownerStorage = createStorage();
const editorStorage = createStorage();
const ownerBindings = new Map();
const editorBindings = new Map();
let owner = createAdapter({ server, actor: 'owner', clientId: OWNER_CLIENT, storage: ownerStorage, bindings: ownerBindings, checkpointText: 'checkpoint-owner' });
await owner.adapter.initialize();
assert.equal(owner.adapter.snapshot().session.phase, 'local');
assert.equal(await owner.adapter.start(), ROOM_ID);
assert.equal(owner.adapter.snapshot().session.phase, 'active');
assert.deepEqual(ownerBindings.get('project-owner'), {
  roomId: ROOM_ID,
  role: 'owner',
  projectKey: 'project-owner',
});
assert.equal(owner.restored, 'checkpoint-owner');
assert.equal(server.checkpointHash, await sha256(server.objects.get(server.checkpointPath)));
await owner.adapter.dispose();
owner = createAdapter({ server, actor: 'owner', clientId: OWNER_CLIENT, storage: ownerStorage, bindings: ownerBindings, checkpointText: 'checkpoint-owner' });
await owner.adapter.initialize();
assert.equal(owner.adapter.snapshot().session.phase, 'invited');
assert.equal(await owner.adapter.resumeBoundProject(), ROOM_ID);
assert.equal(owner.adapter.snapshot().session.phase, 'active');
const sentComment = await owner.adapter.commands.sendComment(' owner message ');
assert.equal(sentComment.text, 'owner message');
assert.equal(server.broadcasts.at(-1).event, 'pixisync-comment');

const inviteUrl = await owner.adapter.createInviteLink();
assert.equal(new URL(inviteUrl).searchParams.get('pixisync_invite'), INVITE_TOKEN);

const editor = createAdapter({ server, actor: 'editor', clientId: EDITOR_CLIENT, storage: editorStorage, bindings: editorBindings, checkpointText: 'checkpoint-editor' });
await editor.adapter.initialize();
assert.equal(await editor.adapter.join(INVITE_TOKEN), ROOM_ID);
assert.equal(editor.adapter.snapshot().session.phase, 'active');
assert.deepEqual(editorBindings.get('project-editor'), {
  roomId: ROOM_ID,
  role: 'participant',
  projectKey: 'project-editor',
});
assert.equal(editor.restored, 'checkpoint-owner');
server.realtimeOptions.at(-1).onBroadcast('pixisync-comment', sentComment);
assert.equal(editor.bridge.comments.length, 1);
assert.equal(editor.bridge.comments[0].text, 'owner message');
server.realtimeOptions.at(-1).onPresenceChange([
  { clientId: OWNER_CLIENT, role: 'owner' },
  { clientId: EDITOR_CLIENT, role: 'editor' },
]);
assert.deepEqual(editor.bridge.participants.map(item => item.name), ['Owner', '自分']);
await editor.adapter.leave();
assert.equal(editor.adapter.snapshot().session.phase, 'left');
assert.equal(server.members.has('editor'), false);
assert.equal(editorBindings.has('project-editor'), false);

await owner.adapter.archive();
assert.equal(owner.adapter.snapshot().session.phase, 'archived');
assert.equal(server.status, 'archived');
assert.equal(server.checkpointHash, await sha256(server.objects.get(server.checkpointPath)));
assert.equal(ownerBindings.has('project-owner'), false);

await Promise.all([owner.adapter.dispose(), editor.adapter.dispose()]);
console.log('PiXiSYNC runtime adapter lifecycle integration tests passed');
