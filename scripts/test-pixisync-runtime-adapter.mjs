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
const resolveRecentProjectTarget = window.PiXiEEDrawModules.pixisyncRuntimeAdapterUtils
  .resolvePiXiSyncRecentProjectTarget;
assert.equal(resolveRecentProjectTarget([
  { id: 'local-new', pixisync: null },
  { id: 'local-existing-room', pixisync: { roomId: ROOM_ID.toUpperCase() } },
], ROOM_ID, 'local-new'), 'local-existing-room');
assert.equal(resolveRecentProjectTarget([], ROOM_ID, 'local-new'), 'local-new');
const collectCleanupEntries = window.PiXiEEDrawModules.pixisyncRuntimeAdapterUtils
  .collectPiXiSyncRecentProjectCleanupEntries;
const activeV2Entry = { id: 'local-existing-room', autosaveSchemaVersion: 2 };
const duplicateV2Entry = { id: 'local-duplicate-room', autosaveSchemaVersion: 2 };
assert.deepEqual(
  collectCleanupEntries(
    [activeV2Entry, duplicateV2Entry, { id: 'legacy-duplicate', autosaveSchemaVersion: 1 }],
    [activeV2Entry],
    activeV2Entry.id
  ),
  [duplicateV2Entry],
  'duplicate V2 payloads are cleaned while the active canonical target is always retained'
);
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
    this.syncFromCalls = [];
    this.emitClosedOnStop = false;
    this.failOpen = false;
    this.inviteCreateCalls = 0;
    this.rasterUploads = new Map();
    this.committedRasterUploads = new Set();
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
            if (this.failOpen) throw new Error('temporary-network-failure');
            assert.equal(params.p_room_id, ROOM_ID);
            assert.equal(this.status, 'active');
            assert.ok(this.members.has(actor));
            return { data: this.manifest(actor === 'owner' ? 'owner' : 'editor'), error: null };
          }
          if (name === 'pixisync_create_invite') {
            assert.equal(actor, 'owner');
            this.inviteCreateCalls += 1;
            assert.equal(params.p_expires_at, null);
            assert.equal(params.p_max_uses, null);
            return { data: [{ invite_id: randomUUID(), invite_token: INVITE_TOKEN, role: 'editor', expires_at: 'infinity', max_uses: 16 }], error: null };
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
          if (name === 'pixisync_prepare_document_checkpoint_upload') {
            assert.equal(params.p_room_id, ROOM_ID);
            assert.equal(params.p_base_revision, String(this.head));
            const storagePath = `rooms/${ROOM_ID}/document-checkpoints/${params.p_upload_id}.pxd`;
            return { data: [{ upload_id: params.p_upload_id, storage_path: storagePath, base_revision: params.p_base_revision, structure_epoch: params.p_structure_epoch }], error: null };
          }
          if (name === 'pixisync_list_stale_document_checkpoint_uploads') {
            return { data: [], error: null };
          }
          if (name === 'pixisync_prepare_raster_region_upload') {
            const storagePath = `rooms/${ROOM_ID}/raster-assets/${params.p_upload_id}.pxra`;
            this.rasterUploads.set(params.p_upload_id, storagePath);
            return { data: [{
              upload_id: params.p_upload_id,
              storage_path: storagePath,
              base_revision: params.p_base_revision,
              structure_epoch: params.p_structure_epoch,
            }], error: null };
          }
          if (name === 'pixisync_abort_raster_region_upload') {
            const path = this.rasterUploads.get(params.p_upload_id) || '';
            return {
              data: path && !this.committedRasterUploads.has(params.p_upload_id)
                ? [{ storage_path: path }]
                : [],
              error: null,
            };
          }
          if (name === 'pixisync_finalize_raster_region_upload_cleanup') {
            this.rasterUploads.delete(params.p_upload_id);
            return { data: true, error: null };
          }
          if (name === 'pixisync_abort_document_checkpoint_upload') {
            return { data: true, error: null };
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
            remove: async paths => {
              paths.forEach(path => this.objects.delete(path));
              return { data: paths, error: null };
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
      stop: async () => {
        if (server.emitClosedOnStop) options.onChannelStatus?.('CLOSED');
      },
      trackPresence: async () => {},
      untrackPresence: async () => {},
      syncFrom: async after => {
        server.syncFromCalls.push({ clientId: options.clientId, after: String(after) });
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
  let inputLocked = false;
  return {
    configure: next => { runtime = next; },
    clear: () => { runtime = null; },
    refreshUi: () => {},
    applyConfirmed: () => {},
    receiveComment: comment => comments.push(comment),
    updateParticipants: next => { participants = next; },
    setInputLocked: next => { inputLocked = next === true; },
    snapshot: () => ({ configured: Boolean(runtime), collaboration: Boolean(runtime?.realtimeClient) }),
    comments,
    get participants() { return participants; },
    get inputLocked() { return inputLocked; },
    get runtime() { return runtime; },
  };
}

function createAdapter({
  server,
  actor,
  clientId,
  storage,
  bindings,
  checkpointText,
  realtimeFactory = createRealtimeHarness(server),
  operationTimeoutMs,
  acquireProjectLease,
  initialProjectKey = `project-${actor}`,
  resolveProjectBindingTarget,
  readProjectBinding,
  getSupabase,
  refreshSupabaseClient,
  onStatus,
  onError,
}) {
  const bridge = createBridge();
  let restored = '';
  let restoreContext = null;
  let captureContext = null;
  let currentProjectKey = initialProjectKey;
  const adapter = window.PiXiEEDrawModules.pixisyncRuntimeAdapterUtils.createPiXiSyncRuntimeAdapter({
    createSession: options => window.PiXiEEDrawModules.pixisyncSessionState.createPiXiSyncSessionState(options),
    createRealtimeClient: realtimeFactory,
    runtimeBridge: bridge,
    getSupabase: async () => typeof getSupabase === 'function'
      ? await getSupabase()
      : server.client(actor),
    refreshSupabaseClient,
    captureCheckpoint: async context => {
      captureContext = context;
      return new Blob([checkpointText]);
    },
    restoreCheckpoint: async (blob, context) => {
      restored = await blob.text();
      restoreContext = context;
    },
    getProjectKey: () => currentProjectKey,
    getProjectTitle: () => `Project ${actor}`,
    readProjectBinding: async projectKey => (
      typeof readProjectBinding === 'function'
        ? await readProjectBinding(projectKey)
        : bindings.get(projectKey) || null
    ),
    writeProjectBinding: async (projectKey, binding) => {
      bindings.set(projectKey, binding);
      return { projectKey };
    },
    clearProjectBinding: async projectKey => { bindings.delete(projectKey); },
    resolveProjectBindingTarget: async details => {
      const resolved = await resolveProjectBindingTarget?.(details);
      const projectKey = String(resolved?.projectKey || resolved || details.projectKey);
      currentProjectKey = projectKey;
      return projectKey;
    },
    acquireProjectLease,
    getClientId: () => clientId,
    localStorageRef: storage,
    operationTimeoutMs,
    onStatus,
    onError,
  });
  return {
    adapter,
    bridge,
    get restored() { return restored; },
    get restoreContext() { return restoreContext; },
    get captureContext() { return captureContext; },
  };
}

const server = new LifecycleServer();
const ownerStorage = createStorage();
const editorStorage = createStorage();
const ownerBindings = new Map();
const editorBindings = new Map();
let owner = createAdapter({ server, actor: 'owner', clientId: OWNER_CLIENT, storage: ownerStorage, bindings: ownerBindings, checkpointText: 'checkpoint-owner' });

// Disposing while initialize() is awaiting persistent metadata must never let
// that stale initialization reinstall its document bridge afterward.
let releaseInitializationBinding;
let markInitializationBindingStarted;
const initializationBindingStarted = new Promise(resolve => { markInitializationBindingStarted = resolve; });
const initializationBindingGate = new Promise(resolve => { releaseInitializationBinding = resolve; });
const initializationRace = createAdapter({
  server,
  actor: 'owner',
  clientId: OWNER_CLIENT,
  storage: createStorage(),
  bindings: new Map(),
  checkpointText: 'checkpoint-initialization-race',
  readProjectBinding: async () => {
    markInitializationBindingStarted();
    await initializationBindingGate;
    return null;
  },
});
const staleInitialization = initializationRace.adapter.initialize();
await initializationBindingStarted;
const disposalDuringInitialization = initializationRace.adapter.dispose();
releaseInitializationBinding();
await Promise.all([staleInitialization, disposalDuringInitialization]);
assert.equal(initializationRace.bridge.runtime, null);
assert.equal(initializationRace.adapter.snapshot().enabled, false);

await owner.adapter.initialize();
assert.equal(owner.adapter.snapshot().session.phase, 'local');
assert.equal(await owner.adapter.start(), ROOM_ID);
assert.equal(owner.adapter.snapshot().session.phase, 'active');
assert.equal(typeof owner.bridge.runtime.requestAuthoritativeRecovery, 'function');
assert.equal(server.syncFromCalls.length, 0, 'a new owner room must activate from its known revision without a redundant tail RPC');
assert.deepEqual(ownerBindings.get('project-owner'), {
  roomId: ROOM_ID,
  role: 'owner',
  projectKey: 'project-owner',
  inviteToken: '',
  inviteExpiresAt: '',
  invitePersistent: false,
  replacedProjectKey: '',
});
assert.equal(owner.restored, '');
const regionShape = {
  canvasId: 'canvas-1', frameId: 'frame-1', layerId: 'layer-1',
  canvasWidth: 4, canvasHeight: 4,
  rect: { x: 0, y: 0, width: 1, height: 1 },
  bytes: new Uint8Array([0x50, 0x58, 0x52, 0x41, 1, 0, 0, 1]),
  pixelFormat: 'indexed-mask-v1',
};
const committedRegionId = randomUUID();
const committedRegion = await owner.bridge.runtime.prepareRasterRegionAsset({
  operationId: committedRegionId,
  structureEpoch: 0,
  region: regionShape,
});
const committedRegionPath = committedRegion.documentOperation.asset.objectPath;
assert.ok(server.objects.has(committedRegionPath));
server.committedRasterUploads.add(committedRegionId);
await committedRegion.cleanup();
assert.ok(
  server.objects.has(committedRegionPath),
  'cleanup must never remove an asset once the abort RPC no longer claims it'
);
const stagedRegionId = randomUUID();
const stagedRegion = await owner.bridge.runtime.prepareRasterRegionAsset({
  operationId: stagedRegionId,
  structureEpoch: 0,
  region: regionShape,
});
const stagedRegionPath = stagedRegion.documentOperation.asset.objectPath;
assert.ok(server.objects.has(stagedRegionPath));
await stagedRegion.cleanup();
assert.equal(server.objects.has(stagedRegionPath), false, 'an uncommitted claimed upload remains safely removable');
const checkpointOperationId = randomUUID();
const preparedDocumentCheckpoint = await owner.adapter.commands.prepareCheckpointOperation({
  operationId: checkpointOperationId,
  structureEpoch: 0,
  captureContext: { snapshot: 'after-fill' },
});
assert.deepEqual(owner.captureContext, { snapshot: 'after-fill' });
assert.equal(preparedDocumentCheckpoint.documentOperation.type, 'checkpoint_restore');
assert.equal(preparedDocumentCheckpoint.documentOperation.byteLength, new Blob(['checkpoint-owner']).size);
assert.ok(server.objects.has(preparedDocumentCheckpoint.documentOperation.objectPath));
const confirmedCheckpointOperation = {
  operationId: checkpointOperationId,
  documentOperation: preparedDocumentCheckpoint.documentOperation,
};
await server.realtimeOptions.at(-1).prepareConfirmed(confirmedCheckpointOperation, { local: true });
assert.equal(confirmedCheckpointOperation.documentOperation.preparedCheckpoint.verified, true);
assert.equal(confirmedCheckpointOperation.documentOperation.preparedCheckpoint.alreadyLocal, true);
assert.equal(owner.restored, '');
const remoteCheckpointOperation = {
  operationId: randomUUID(),
  documentOperation: preparedDocumentCheckpoint.documentOperation,
};
await server.realtimeOptions.at(-1).prepareConfirmed(remoteCheckpointOperation, { local: false });
assert.equal(remoteCheckpointOperation.documentOperation.preparedCheckpoint.verified, true);
assert.equal(owner.restored, 'checkpoint-owner');
assert.equal(owner.restoreContext.documentCheckpoint, true);
assert.equal(server.checkpointHash, await sha256(server.objects.get(server.checkpointPath)));
await owner.adapter.dispose();
owner = createAdapter({ server, actor: 'owner', clientId: OWNER_CLIENT, storage: ownerStorage, bindings: ownerBindings, checkpointText: 'checkpoint-owner' });
await owner.adapter.initialize();
assert.equal(owner.adapter.snapshot().session.phase, 'invited');
assert.equal(owner.bridge.inputLocked, true, 'a persisted shared card must stay locked until resume is active');
assert.equal(await owner.adapter.resumeBoundProject(), ROOM_ID);
assert.equal(owner.adapter.snapshot().session.phase, 'active');
assert.equal(owner.bridge.inputLocked, false);
assert.equal(owner.restored, 'checkpoint-owner');
assert.deepEqual(owner.restoreContext, {
  projectKey: 'project-owner',
  role: 'owner',
  preserveProjectIdentity: true,
});
const sentComment = await owner.adapter.commands.sendComment(' owner message ');
assert.equal(sentComment.text, 'owner message');
assert.equal(server.broadcasts.at(-1).event, 'pixisync-comment');

const inviteUrl = await owner.adapter.createInviteLink();
assert.equal(new URL(inviteUrl).searchParams.get('pixisync_invite'), INVITE_TOKEN);
assert.equal(await owner.adapter.createInviteLink(), inviteUrl, 'an active room must reuse its persistent invite URL');
assert.equal(await owner.adapter.createInviteCode(), INVITE_TOKEN.toUpperCase().match(/.{1,4}/g).join('-'));
assert.equal(server.inviteCreateCalls, 1, 'copying an invite twice must not create a second server invite');
assert.deepEqual(ownerBindings.get('project-owner'), {
  roomId: ROOM_ID,
  role: 'owner',
  projectKey: 'project-owner',
  inviteToken: INVITE_TOKEN,
  inviteExpiresAt: 'infinity',
  invitePersistent: true,
  replacedProjectKey: '',
});

const editor = createAdapter({
  server,
  actor: 'editor',
  clientId: EDITOR_CLIENT,
  storage: editorStorage,
  bindings: editorBindings,
  checkpointText: 'checkpoint-editor',
  resolveProjectBindingTarget: ({ roomId }) => roomId === ROOM_ID ? 'project-editor-existing-room-card' : '',
});
await editor.adapter.initialize();
assert.equal(await editor.adapter.join(INVITE_TOKEN), ROOM_ID);
assert.equal(editor.adapter.snapshot().session.phase, 'active');
assert.deepEqual(editorBindings.get('project-editor-existing-room-card'), {
  roomId: ROOM_ID,
  role: 'participant',
  projectKey: 'project-editor-existing-room-card',
  inviteToken: '',
  inviteExpiresAt: '',
  invitePersistent: false,
  replacedProjectKey: '',
});
assert.equal(editor.restoreContext.projectKey, 'project-editor-existing-room-card');
await editor.adapter.dispose();
const resumedEditor = createAdapter({ server, actor: 'editor', clientId: EDITOR_CLIENT, storage: editorStorage, bindings: editorBindings, checkpointText: 'checkpoint-editor', initialProjectKey: 'project-editor-existing-room-card' });
await resumedEditor.adapter.initialize();
assert.equal(resumedEditor.adapter.snapshot().session.phase, 'invited');
assert.equal(resumedEditor.bridge.inputLocked, true, 'a participant card must not reopen as editable local data');
assert.equal(await resumedEditor.adapter.resumeBoundProject(), ROOM_ID);
assert.equal(resumedEditor.adapter.snapshot().session.phase, 'active');
assert.equal(resumedEditor.bridge.inputLocked, false);
const activeEditor = resumedEditor;
assert.equal(activeEditor.restored, 'checkpoint-owner');
assert.deepEqual(activeEditor.restoreContext, {
  projectKey: 'project-editor-existing-room-card',
  role: 'participant',
  preserveProjectIdentity: true,
});
const editorRestoreCount = activeEditor.restored;
await activeEditor.adapter.handleLifecycleSuspend('visibility-hidden');
await activeEditor.adapter.handleLifecycleResume('visibility-visible');
assert.equal(activeEditor.adapter.snapshot().session.phase, 'active');
assert.equal(activeEditor.restored, editorRestoreCount, 'reconnect must not replace the participant canvas with a checkpoint');
server.realtimeOptions.at(-1).onBroadcast('pixisync-comment', sentComment);
assert.equal(activeEditor.bridge.comments.length, 1);
assert.equal(activeEditor.bridge.comments[0].text, 'owner message');
server.realtimeOptions.at(-1).onPresenceChange([
  { clientId: OWNER_CLIENT, role: 'owner' },
  { clientId: EDITOR_CLIENT, role: 'editor' },
]);
assert.deepEqual(activeEditor.bridge.participants.map(item => item.name), ['Owner', '参加者（自分）']);
await activeEditor.adapter.leave();
assert.equal(activeEditor.adapter.snapshot().session.phase, 'left');
assert.equal(server.members.has('editor'), false);
assert.equal(editorBindings.has('project-editor-existing-room-card'), false);

await owner.adapter.archive();
assert.equal(owner.adapter.snapshot().session.phase, 'archived');
assert.equal(server.status, 'archived');
assert.equal(server.checkpointHash, await sha256(server.objects.get(server.checkpointPath)));
assert.equal(ownerBindings.has('project-owner'), false);

// A persisted shared card never degrades to editable local data when its
// first network reopen fails; it stays locked and queued for reconnect.
const reopenFailureServer = new LifecycleServer();
reopenFailureServer.status = 'active';
reopenFailureServer.checkpointId = randomUUID();
reopenFailureServer.checkpointPath = `rooms/${ROOM_ID}/checkpoints/0/${reopenFailureServer.checkpointId}.pxd`;
const reopenFailureCheckpoint = new Blob(['checkpoint-reopen-failure']);
reopenFailureServer.checkpointHash = await sha256(reopenFailureCheckpoint);
reopenFailureServer.checkpointBytes = reopenFailureCheckpoint.size;
reopenFailureServer.objects.set(reopenFailureServer.checkpointPath, reopenFailureCheckpoint);
reopenFailureServer.failOpen = true;
const reopenFailureBindings = new Map([['project-owner', {
  roomId: ROOM_ID,
  role: 'owner',
  projectKey: 'project-owner',
}]]);
const reopenFailureOwner = createAdapter({
  server: reopenFailureServer,
  actor: 'owner',
  clientId: OWNER_CLIENT,
  storage: createStorage(),
  bindings: reopenFailureBindings,
  checkpointText: 'checkpoint-reopen-failure',
});
await reopenFailureOwner.adapter.initialize();
await assert.rejects(reopenFailureOwner.adapter.resumeBoundProject(), /temporary-network-failure/);
assert.equal(reopenFailureOwner.adapter.snapshot().session.phase, 'local');
assert.equal(reopenFailureOwner.bridge.inputLocked, true);
assert.equal(reopenFailureBindings.has('project-owner'), true);
reopenFailureServer.failOpen = false;
assert.equal(await reopenFailureOwner.adapter.resumeBoundProject(), ROOM_ID);
assert.equal(reopenFailureOwner.adapter.snapshot().session.phase, 'active');
assert.equal(reopenFailureOwner.bridge.inputLocked, false);
await reopenFailureOwner.adapter.dispose();

// A failed Realtime subscription must return the owner to local mode instead
// of leaving the start button in the creating state forever.
const timeoutServer = new LifecycleServer();
const timeoutRealtimeBase = createRealtimeHarness(timeoutServer);
const timeoutOwner = createAdapter({
  server: timeoutServer,
  actor: 'owner',
  clientId: OWNER_CLIENT,
  storage: createStorage(),
  bindings: new Map(),
  checkpointText: 'checkpoint-timeout',
  operationTimeoutMs: 10,
  realtimeFactory: options => ({ ...timeoutRealtimeBase(options), start: () => new Promise(() => {}) }),
});
await timeoutOwner.adapter.initialize();
await assert.rejects(timeoutOwner.adapter.start(), /realtime-subscribe-timeout/);
assert.equal(timeoutOwner.adapter.snapshot().session.phase, 'local');

// Backgrounding must close the drawing gate without waiting for network I/O;
// the first visible lifecycle event performs one authoritative reconnect.
const lifecycleServer = new LifecycleServer();
const lifecycleStatuses = [];
const lifecycleOwner = createAdapter({
  server: lifecycleServer,
  actor: 'owner',
  clientId: OWNER_CLIENT,
  storage: createStorage(),
  bindings: new Map(),
  checkpointText: 'checkpoint-lifecycle',
  onStatus: details => lifecycleStatuses.push(details),
});
await lifecycleOwner.adapter.initialize();
await lifecycleOwner.adapter.start();
assert.equal(lifecycleOwner.adapter.snapshot().session.phase, 'active');
assert.equal(lifecycleOwner.bridge.inputLocked, false);
const initialRealtimeCount = lifecycleServer.realtimeOptions.length;
assert.equal(await lifecycleOwner.adapter.handleLifecycleResume('focus'), false);
assert.equal(lifecycleOwner.adapter.snapshot().session.phase, 'active');
assert.equal(lifecycleServer.realtimeOptions.length, initialRealtimeCount);
lifecycleServer.emitClosedOnStop = true;
assert.equal(await lifecycleOwner.adapter.handleLifecycleSuspend('visibility-hidden'), true);
assert.equal(lifecycleOwner.adapter.snapshot().session.phase, 'reconnecting');
assert.equal(lifecycleOwner.adapter.session.canDraw(), false);
assert.equal(lifecycleOwner.bridge.inputLocked, true);
assert.equal(await lifecycleOwner.adapter.handleLifecycleResume('pageshow-bfcache'), true);
assert.equal(lifecycleOwner.adapter.snapshot().session.phase, 'active');
assert.equal(lifecycleOwner.adapter.session.canDraw(), true);
assert.equal(lifecycleOwner.bridge.inputLocked, false);
assert.equal(lifecycleServer.realtimeOptions.length, initialRealtimeCount + 1);
assert.equal(
  lifecycleStatuses.at(-1)?.phase,
  'active-ready',
  'the final reconnect status must be emitted after the collaboration bridge is configured'
);
assert.equal(await lifecycleOwner.adapter.handleLifecycleResume('focus'), false);
assert.equal(lifecycleServer.realtimeOptions.length, initialRealtimeCount + 1);

// An open-session timeout must abort the stale PostgREST request. After two
// consecutive timeouts the runtime replaces the Supabase transport, retains
// its authoritative revision, and unlocks drawing only after convergence.
const transportRecoveryServer = new LifecycleServer();
const transportRecoveryClient = transportRecoveryServer.client('owner');
let hangOpenSession = false;
let abortedOpenSessions = 0;
let refreshedClientCount = 0;
const hangingTransportClient = {
  ...transportRecoveryClient,
  rpc(name, params) {
    if (!hangOpenSession || name !== 'pixisync_open_session') {
      return transportRecoveryClient.rpc(name, params);
    }
    let signal = null;
    const pending = new Promise(() => {});
    return {
      abortSignal(nextSignal) {
        signal = nextSignal;
        signal?.addEventListener?.('abort', () => { abortedOpenSessions += 1; }, { once: true });
        return this;
      },
      then(resolve, reject) {
        return pending.then(resolve, reject);
      },
    };
  },
};
const transportRecoveryStatuses = [];
const transportRecoveryErrors = [];
const transportRecoveryOwner = createAdapter({
  server: transportRecoveryServer,
  actor: 'owner',
  clientId: OWNER_CLIENT,
  storage: createStorage(),
  bindings: new Map(),
  checkpointText: 'checkpoint-transport-recovery',
  operationTimeoutMs: 10,
  getSupabase: () => hangingTransportClient,
  refreshSupabaseClient: async () => {
    refreshedClientCount += 1;
    return transportRecoveryServer.client('owner');
  },
  onStatus: details => transportRecoveryStatuses.push(details),
  onError: error => transportRecoveryErrors.push(error),
});
await transportRecoveryOwner.adapter.initialize();
await transportRecoveryOwner.adapter.start();
assert.equal(transportRecoveryOwner.adapter.snapshot().session.phase, 'active');
const revisionBeforeTransportFailure = transportRecoveryOwner.adapter.snapshot().session.appliedRevision;
hangOpenSession = true;
await transportRecoveryOwner.adapter.handleLifecycleSuspend('visibility-hidden');
await transportRecoveryOwner.adapter.handleLifecycleResume('visibility-visible');
assert.equal(transportRecoveryOwner.adapter.snapshot().session.phase, 'reconnecting');
assert.equal(transportRecoveryOwner.bridge.inputLocked, true);
await transportRecoveryOwner.adapter.handleLifecycleResume('manual-retry-1');
assert.equal(abortedOpenSessions, 2, 'each timed-out open-session request must be aborted');
assert.equal(refreshedClientCount, 1, 'two consecutive open-session timeouts must refresh the client once');
assert.equal(
  transportRecoveryStatuses.some(details => details?.phase === 'transport-client-refreshed'),
  true
);
assert.equal(transportRecoveryErrors.length, 1, 'repeated identical timeout errors are throttled');
await transportRecoveryOwner.adapter.handleLifecycleResume('manual-retry-2');
assert.equal(transportRecoveryOwner.adapter.snapshot().session.phase, 'active');
assert.equal(transportRecoveryOwner.adapter.snapshot().session.appliedRevision, revisionBeforeTransportFailure);
assert.equal(transportRecoveryOwner.bridge.inputLocked, false);

// A second view of the same local card still receives remote updates, but is
// explicitly configured as read-only and cannot write the shared autosave.
const readOnlyServer = new LifecycleServer();
const readOnlyOwner = createAdapter({
  server: readOnlyServer,
  actor: 'owner',
  clientId: OWNER_CLIENT,
  storage: createStorage(),
  bindings: new Map(),
  checkpointText: 'checkpoint-read-only',
  acquireProjectLease: async () => ({ acquired: false }),
});
await readOnlyOwner.adapter.initialize();
await readOnlyOwner.adapter.start();
assert.equal(readOnlyOwner.adapter.snapshot().session.phase, 'active');
assert.equal(readOnlyOwner.bridge.runtime.localReadOnly, true);

await Promise.all([
  owner.adapter.dispose(),
  activeEditor.adapter.dispose(),
  lifecycleOwner.adapter.dispose(),
  transportRecoveryOwner.adapter.dispose(),
  readOnlyOwner.adapter.dispose(),
]);
console.log('PiXiSYNC runtime adapter lifecycle integration tests passed');
