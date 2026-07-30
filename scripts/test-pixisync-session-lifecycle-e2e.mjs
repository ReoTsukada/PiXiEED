import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

globalThis.window = { PiXiEEDrawModules: {} };
new Function(await readFile(
  new URL('../pixiedraw/assets/js/modules/pixisync-session-state.js', import.meta.url),
  'utf8'
))();

const createSession = window.PiXiEEDrawModules.pixisyncSessionState.createPiXiSyncSessionState;
const ROOM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TOPIC = `pixisync:room:${ROOM_ID}`;
const OWNER = 'owner-user';
const PARTICIPANT = 'participant-user';
const CELL_COUNT = 64;
const hashState = (pixels, writers) => {
  const writerBytes = Buffer.alloc(writers.length * 8);
  writers.forEach((writer, index) => writerBytes.writeBigUInt64LE(BigInt(writer), index * 8));
  return createHash('sha256')
    .update(Buffer.from(pixels))
    .update(writerBytes)
    .digest('hex');
};

class LifecycleAuthority {
  constructor() {
    this.room = null;
    this.members = new Map();
    this.invites = new Map();
    this.operations = [];
    this.pixels = new Uint8Array(CELL_COUNT);
    this.writers = Array(CELL_COUNT).fill(0n);
    this.checkpoint = null;
    this.subscriptions = new Set();
    this.rpcAttempts = [];
  }

  beginSession(userId) {
    assert.equal(userId, OWNER);
    assert.equal(this.room, null);
    this.room = {
      id: ROOM_ID,
      status: 'initializing',
      headRevision: 0n,
      sessionGeneration: 1n,
      activeCheckpointId: null,
    };
    this.members.set(userId, { role: 'owner', status: 'active' });
    return { ...this.room };
  }

  activateInitialCheckpoint(userId) {
    assert.equal(userId, OWNER);
    assert.equal(this.room.status, 'initializing');
    this.checkpoint = {
      id: 'checkpoint-0',
      revision: 0n,
      pixels: this.pixels.slice(),
      writers: [...this.writers],
    };
    this.checkpoint.hash = hashState(this.checkpoint.pixels, this.checkpoint.writers);
    this.room.activeCheckpointId = this.checkpoint.id;
    this.room.status = 'active';
    return this.manifest(userId);
  }

  createInvite(userId, role = 'editor') {
    this.assertOwnerActive(userId);
    const token = `invite-${this.invites.size + 1}`;
    this.invites.set(token, { role, status: 'active', uses: 0, maxUses: 1 });
    return token;
  }

  join(userId, token) {
    const invite = this.invites.get(token);
    if (
      this.room?.status !== 'active'
      || !invite
      || invite.status !== 'active'
      || invite.uses >= invite.maxUses
      || this.members.get(userId)?.status === 'left'
    ) throw new Error('join-rejected');
    if (!this.members.has(userId)) {
      this.members.set(userId, { role: invite.role, status: 'active' });
      invite.uses += 1;
    }
    return this.manifest(userId);
  }

  manifest(userId) {
    const member = this.members.get(userId);
    if (
      this.room?.status !== 'active'
      || !member
      || member.status !== 'active'
      || !this.checkpoint
    ) throw new Error('open-rejected');
    return {
      roomId: this.room.id,
      status: this.room.status,
      role: member.role,
      canEdit: member.role === 'owner' || member.role === 'editor',
      headRevision: this.room.headRevision,
      generation: this.room.sessionGeneration,
      checkpoint: {
        ...this.checkpoint,
        pixels: this.checkpoint.pixels.slice(),
        writers: [...this.checkpoint.writers],
      },
    };
  }

  subscribe(userId, { topic, private: isPrivate }) {
    const member = this.members.get(userId);
    const allowed = Boolean(
      isPrivate === true
      && topic === TOPIC
      && this.room?.status === 'active'
      && member?.status === 'active'
    );
    if (allowed) this.subscriptions.add(userId);
    return allowed;
  }

  unsubscribe(userId) {
    this.subscriptions.delete(userId);
  }

  tail(userId, afterRevision) {
    this.assertReadable(userId);
    return this.operations.filter(operation => operation.revision > BigInt(afterRevision));
  }

  commit(userId, index, value) {
    this.rpcAttempts.push({ userId, index, value });
    const member = this.members.get(userId);
    if (
      this.room?.status !== 'active'
      || member?.status !== 'active'
      || !['owner', 'editor'].includes(member.role)
    ) throw new Error('commit-rejected');
    const revision = this.room.headRevision + 1n;
    const operation = { revision, operationId: `operation-${revision}`, index, value };
    this.operations.push(operation);
    this.pixels[index] = value;
    this.writers[index] = revision;
    this.room.headRevision = revision;
    return operation;
  }

  createVerifiedHeadCheckpoint(userId) {
    this.assertOwnerActive(userId);
    this.checkpoint = {
      id: `checkpoint-${this.room.headRevision}`,
      revision: this.room.headRevision,
      pixels: this.pixels.slice(),
      writers: [...this.writers],
    };
    this.checkpoint.hash = hashState(this.checkpoint.pixels, this.checkpoint.writers);
    this.room.activeCheckpointId = this.checkpoint.id;
    return this.checkpoint;
  }

  leave(userId) {
    const member = this.members.get(userId);
    if (this.room?.status !== 'active' || member?.role === 'owner' || member?.status !== 'active') {
      throw new Error('leave-rejected');
    }
    member.status = 'left';
    this.unsubscribe(userId);
  }

  archive(userId, checkpointId) {
    this.assertOwnerActive(userId);
    assert.equal(this.checkpoint.id, checkpointId);
    assert.equal(this.checkpoint.revision, this.room.headRevision);
    this.room.status = 'archived';
    this.room.sessionGeneration += 1n;
    for (const invite of this.invites.values()) invite.status = 'revoked';
    this.subscriptions.clear();
    return { ...this.room };
  }

  assertReadable(userId) {
    const member = this.members.get(userId);
    if (this.room?.status !== 'active' || member?.status !== 'active') throw new Error('read-rejected');
  }

  assertOwnerActive(userId) {
    const member = this.members.get(userId);
    if (this.room?.status !== 'active' || member?.role !== 'owner' || member.status !== 'active') {
      throw new Error('active-owner-required');
    }
  }
}

class LifecycleClient {
  constructor(authority, userId, role) {
    this.authority = authority;
    this.userId = userId;
    this.session = createSession({ role });
    this.pixels = new Uint8Array(CELL_COUNT);
    this.writers = Array(CELL_COUNT).fill(0n);
    this.channelOpen = false;
    this.effectLog = [];
  }

  startOwner() {
    const opened = this.session.dispatch({ type: 'OPEN_REQUEST', projectKey: 'project-local' });
    this.effectLog.push(...opened.effects);
    assert.equal(opened.state.phase, 'creating');
    assert.equal(this.session.canDraw(), false);
    return opened.state.epoch;
  }

  startJoin() {
    const joining = this.session.dispatch({ type: 'JOIN_REQUEST', projectKey: 'invite' });
    this.effectLog.push(...joining.effects);
    assert.equal(joining.state.phase, 'joining');
    assert.equal(this.session.canDraw(), false);
    return joining.state.epoch;
  }

  async openFromManifest(manifest, { owner = false, beforeHeadRead = null } = {}) {
    const epoch = this.session.getSnapshot().epoch;
    const ready = this.session.dispatch(owner
      ? {
          type: 'ROOM_READY',
          epoch,
          roomId: manifest.roomId,
          status: manifest.status,
          generation: manifest.generation,
        }
      : {
          type: 'MEMBERSHIP_OK',
          epoch,
          roomId: manifest.roomId,
          status: manifest.status,
          generation: manifest.generation,
          canEdit: manifest.canEdit,
        });
    this.effectLog.push(...ready.effects);
    assert.equal(this.session.canDraw(), false);
    const allowed = this.authority.subscribe(this.userId, { topic: TOPIC, private: true });
    assert.equal(allowed, true);
    this.channelOpen = true;
    let result = this.session.dispatch({
      type: 'CHANNEL_SUBSCRIBED',
      epoch,
      generation: manifest.generation,
      topic: TOPIC,
      private: true,
    });
    this.effectLog.push(...result.effects);
    assert.equal(result.state.phase, 'syncing');
    assert.equal(this.session.canDraw(), false);
    this.loadCheckpoint(manifest.checkpoint);
    result = this.session.dispatch({
      type: 'CHECKPOINT_LOADED',
      epoch,
      generation: manifest.generation,
      revision: manifest.checkpoint.revision,
    });
    this.effectLog.push(...result.effects);
    assert.equal(this.session.canDraw(), false);
    const initialTail = this.authority.tail(this.userId, manifest.checkpoint.revision);
    this.applyTail(initialTail);
    result = this.session.dispatch({
      type: 'INITIAL_TAIL_APPLIED',
      epoch,
      generation: manifest.generation,
      revision: this.lastRevision(manifest.checkpoint.revision),
    });
    this.effectLog.push(...result.effects);
    assert.equal(this.session.canDraw(), false);
    await beforeHeadRead?.();
    const head = this.authority.room.headRevision;
    result = this.session.dispatch({
      type: 'AUTHORITATIVE_HEAD',
      epoch,
      generation: manifest.generation,
      revision: head,
    });
    this.effectLog.push(...result.effects);
    assert.equal(result.effects.at(-1)?.type, 'FETCH_RETAIL');
    assert.equal(this.session.canDraw(), false);
    const retail = this.authority.tail(this.userId, this.lastRevision(manifest.checkpoint.revision));
    this.applyTail(retail);
    result = this.session.dispatch({
      type: 'RETAIL_APPLIED',
      epoch,
      generation: manifest.generation,
      revision: this.lastRevision(manifest.checkpoint.revision),
    });
    this.effectLog.push(...result.effects);
    assert.equal(result.state.phase, 'active');
    return result;
  }

  async reconnect() {
    const manifest = this.authority.manifest(this.userId);
    const epoch = this.session.getSnapshot().epoch;
    assert.equal(this.session.getSnapshot().phase, 'reconnecting');
    const allowed = this.authority.subscribe(this.userId, { topic: TOPIC, private: true });
    assert.equal(allowed, true);
    this.channelOpen = true;
    this.session.dispatch({
      type: 'CHANNEL_SUBSCRIBED',
      epoch,
      generation: manifest.generation,
      topic: TOPIC,
      private: true,
    });
    this.loadCheckpoint(manifest.checkpoint);
    this.session.dispatch({
      type: 'CHECKPOINT_LOADED',
      epoch,
      generation: manifest.generation,
      revision: manifest.checkpoint.revision,
    });
    this.applyTail(this.authority.tail(this.userId, manifest.checkpoint.revision));
    this.session.dispatch({
      type: 'INITIAL_TAIL_APPLIED',
      epoch,
      generation: manifest.generation,
      revision: this.lastRevision(manifest.checkpoint.revision),
    });
    const head = this.authority.room.headRevision;
    this.session.dispatch({
      type: 'AUTHORITATIVE_HEAD',
      epoch,
      generation: manifest.generation,
      revision: head,
    });
    this.applyTail(this.authority.tail(this.userId, this.lastRevision(manifest.checkpoint.revision)));
    this.session.dispatch({
      type: 'RETAIL_APPLIED',
      epoch,
      generation: manifest.generation,
      revision: this.lastRevision(manifest.checkpoint.revision),
    });
  }

  receive(operation) {
    this.pixels[operation.index] = operation.value;
    this.writers[operation.index] = operation.revision;
    const snapshot = this.session.getSnapshot();
    this.session.dispatch({
      type: 'CONFIRMED_OPERATION_APPLIED',
      epoch: snapshot.epoch,
      generation: snapshot.sessionGeneration,
      revision: operation.revision,
    });
  }

  draw(index, value) {
    if (!this.session.canDraw()) throw new Error('client-draw-blocked');
    const operation = this.authority.commit(this.userId, index, value);
    this.receive(operation);
    return operation;
  }

  loadCheckpoint(checkpoint) {
    assert.equal(hashState(checkpoint.pixels, checkpoint.writers), checkpoint.hash);
    this.pixels.set(checkpoint.pixels);
    this.writers = [...checkpoint.writers];
  }

  applyTail(operations) {
    operations
      .slice()
      .sort((left, right) => Number(left.revision - right.revision))
      .forEach(operation => {
        this.pixels[operation.index] = operation.value;
        this.writers[operation.index] = operation.revision;
      });
  }

  lastRevision(fallback = 0n) {
    return this.writers.reduce((maximum, value) => value > maximum ? value : maximum, BigInt(fallback));
  }

  stateHash() {
    return hashState(this.pixels, this.writers);
  }
}

const authority = new LifecycleAuthority();
const owner = new LifecycleClient(authority, OWNER, 'owner');
const participant = new LifecycleClient(authority, PARTICIPANT, 'participant');

// 1-3: begin from a local project, create revision-0 checkpoint, then activate owner.
owner.startOwner();
authority.beginSession(OWNER);
assert.equal(authority.room.status, 'initializing');
assert.equal(authority.room.headRevision, 0n);
assert.equal(owner.session.canDraw(), false);
assert.throws(() => authority.createInvite(OWNER), /active-owner-required/);
const ownerManifest = authority.activateInitialCheckpoint(OWNER);
assert.equal(ownerManifest.checkpoint.revision, 0n);
await owner.openFromManifest(ownerManifest, { owner: true });
assert.equal(owner.session.getSnapshot().phase, 'active');
assert.equal(owner.session.canDraw(), true);

// Invalid public or mismatched-topic subscriptions never pass authorization.
assert.equal(authority.subscribe(OWNER, { topic: TOPIC, private: false }), false);
assert.equal(authority.subscribe(OWNER, { topic: `${TOPIC}:wrong`, private: true }), false);
const invalidChannelSession = createSession({ role: 'participant' });
let invalidChannelResult = invalidChannelSession.dispatch({ type: 'JOIN_REQUEST', projectKey: 'invite' });
const invalidChannelEpoch = invalidChannelResult.state.epoch;
invalidChannelSession.dispatch({
  type: 'MEMBERSHIP_OK',
  epoch: invalidChannelEpoch,
  roomId: ROOM_ID,
  status: 'active',
  generation: '1',
  canEdit: true,
});
invalidChannelResult = invalidChannelSession.dispatch({
  type: 'CHANNEL_SUBSCRIBED',
  epoch: invalidChannelEpoch,
  generation: '1',
  topic: TOPIC,
  private: false,
});
assert.equal(invalidChannelResult.state.phase, 'reconnecting');
assert.equal(invalidChannelSession.canDraw(), false);
assert.deepEqual(
  invalidChannelResult.effects.map(effect => effect.type),
  ['REMOVE_CHANNEL', 'RECONNECT_CHANNEL']
);

// 4-6: invite, join, checkpoint + initial tail + mandatory re-tail, then active.
const invite = authority.createInvite(OWNER, 'editor');
participant.startJoin();
const participantManifest = authority.join(PARTICIPANT, invite);
await participant.openFromManifest(participantManifest, {
  beforeHeadRead: async () => {
    const raced = owner.draw(3, 7);
    participantManifest.headRevision = raced.revision;
  },
});
assert.equal(participant.session.getSnapshot().phase, 'active');
assert.equal(participant.session.canDraw(), true);
assert.equal(participant.session.getSnapshot().appliedRevision, '1');
assert.equal(participant.session.getSnapshot().authoritativeRevision, '1');

// 7: both editors can draw and converge.
const participantOperation = participant.draw(4, 9);
owner.receive(participantOperation);
assert.equal(owner.stateHash(), participant.stateHash());
assert.equal(owner.stateHash(), hashState(authority.pixels, authority.writers));

// Revision regression cannot produce a false active state.
const regression = createSession({ role: 'participant' });
let regressionResult = regression.dispatch({ type: 'JOIN_REQUEST', projectKey: 'invite' });
const regressionEpoch = regressionResult.state.epoch;
regression.dispatch({
  type: 'MEMBERSHIP_OK',
  epoch: regressionEpoch,
  roomId: ROOM_ID,
  status: 'active',
  generation: '1',
  canEdit: true,
});
regression.dispatch({
  type: 'CHANNEL_SUBSCRIBED',
  epoch: regressionEpoch,
  generation: '1',
  topic: TOPIC,
  private: true,
});
regression.dispatch({ type: 'CHECKPOINT_LOADED', epoch: regressionEpoch, generation: '1', revision: '10' });
regressionResult = regression.dispatch({
  type: 'INITIAL_TAIL_APPLIED',
  epoch: regressionEpoch,
  generation: '1',
  revision: '9',
});
assert.equal(regressionResult.state.phase, 'reconnecting');
assert.equal(regression.canDraw(), false);
assert.ok(regressionResult.effects.some(effect => effect.type === 'FULL_RESYNC'));

const revokedState = createSession({ role: 'participant' });
let revokedResult = revokedState.dispatch({ type: 'JOIN_REQUEST', projectKey: 'invite' });
const revokedEpoch = revokedResult.state.epoch;
revokedState.dispatch({
  type: 'MEMBERSHIP_OK',
  epoch: revokedEpoch,
  roomId: ROOM_ID,
  status: 'active',
  generation: '1',
  canEdit: true,
});
revokedResult = revokedState.dispatch({ type: 'ROOM_ACCESS_REVOKED', epoch: revokedEpoch });
assert.equal(revokedResult.state.phase, 'permission_lost');
assert.equal(revokedState.canDraw(), false);
assert.deepEqual(
  revokedResult.effects.map(effect => effect.type),
  ['QUARANTINE_PENDING', 'STOP_PRESENCE', 'REMOVE_CHANNEL']
);

// 8-9: disconnect stops drawing immediately; stale epoch/generation callbacks are ignored.
const oldParticipantState = participant.session.getSnapshot();
participant.session.dispatch({
  type: 'SOCKET_OFFLINE',
  epoch: oldParticipantState.epoch,
});
authority.unsubscribe(PARTICIPANT);
participant.channelOpen = false;
assert.equal(participant.session.getSnapshot().phase, 'reconnecting');
assert.equal(participant.session.canDraw(), false);
assert.throws(() => participant.draw(5, 11), /client-draw-blocked/);
const reconnectEpoch = participant.session.getSnapshot().epoch;
assert.equal(participant.session.dispatch({
  type: 'CHANNEL_SUBSCRIBED',
  epoch: oldParticipantState.epoch,
  generation: oldParticipantState.sessionGeneration,
  topic: TOPIC,
  private: true,
}).ignored, true);
assert.equal(participant.session.dispatch({
  type: 'CHECKPOINT_LOADED',
  epoch: reconnectEpoch,
  generation: '999',
  revision: '0',
}).ignored, true);
const offlineOperation = owner.draw(5, 11);
assert.equal(offlineOperation.revision, 3n);
await participant.reconnect();
assert.equal(participant.session.getSnapshot().phase, 'active');
assert.equal(participant.session.canDraw(), true);
assert.equal(participant.stateHash(), owner.stateHash());
assert.equal(participant.stateHash(), hashState(authority.pixels, authority.writers));

// Pending limit remains part of the active draw gate.
const participantEpoch = participant.session.getSnapshot().epoch;
participant.session.dispatch({ type: 'PENDING_OPERATION_COUNT', epoch: participantEpoch, count: 32 });
assert.equal(participant.session.canDraw(), false);
participant.session.dispatch({ type: 'PENDING_OPERATION_COUNT', epoch: participantEpoch, count: 0 });
assert.equal(participant.session.canDraw(), true);

// 10: leaving revokes membership and both RPC and Realtime access.
let leave = participant.session.dispatch({ type: 'LEAVE_REQUEST' });
assert.equal(leave.state.phase, 'leaving');
assert.deepEqual(leave.effects.map(effect => effect.type), ['FLUSH_PENDING', 'STOP_PRESENCE', 'REMOVE_CHANNEL']);
authority.leave(PARTICIPANT);
participant.channelOpen = false;
participant.session.dispatch({ type: 'LEFT', epoch: leave.state.epoch });
assert.equal(participant.session.getSnapshot().phase, 'left');
assert.equal(participant.session.canDraw(), false);
assert.equal(authority.subscribe(PARTICIPANT, { topic: TOPIC, private: true }), false);
assert.throws(() => authority.commit(PARTICIPANT, 6, 12), /commit-rejected/);
assert.throws(() => authority.manifest(PARTICIPANT), /open-rejected/);

// 11-12: owner archives at a verified head checkpoint; every new path is rejected.
const finalCheckpoint = authority.createVerifiedHeadCheckpoint(OWNER);
const close = owner.session.dispatch({ type: 'CLOSE_REQUEST' });
assert.equal(close.state.phase, 'closing');
const archived = authority.archive(OWNER, finalCheckpoint.id);
assert.equal(archived.status, 'archived');
assert.equal(archived.sessionGeneration, 2n);
owner.channelOpen = false;
owner.session.dispatch({ type: 'CLOSED', epoch: close.state.epoch });
assert.equal(owner.session.getSnapshot().phase, 'archived');
assert.equal(owner.session.canDraw(), false);
assert.equal(authority.subscribe(OWNER, { topic: TOPIC, private: true }), false);
assert.throws(() => authority.commit(OWNER, 7, 13), /commit-rejected/);
assert.throws(() => authority.createInvite(OWNER), /active-owner-required/);
assert.throws(() => authority.join('late-user', invite), /join-rejected/);

assert.equal(authority.room.status, 'archived');
assert.equal(authority.members.get(OWNER).status, 'active');
assert.equal(authority.members.get(PARTICIPANT).status, 'left');
assert.equal(authority.subscriptions.size, 0);
assert.equal(owner.stateHash(), hashState(authority.pixels, authority.writers));
assert.equal(participant.stateHash(), hashState(authority.pixels, authority.writers));
assert.equal(authority.rpcAttempts.length, 5);
assert.equal(authority.operations.length, 3);

// Migration contract regression: lifecycle remains isolated, authenticated-only and generation-aware.
const lifecycleMigration = await readFile(
  new URL('../supabase/migrations/20260730033021_pixisync_session_lifecycle.sql', import.meta.url),
  'utf8'
);
for (const contract of [
  /status in \('initializing', 'active', 'archived'\)/,
  /create table collab_v1\.room_invites/,
  /create function public\.pixisync_begin_session/,
  /create function public\.pixisync_activate_initial_checkpoint/,
  /create function public\.pixisync_create_invite/,
  /create function public\.pixisync_join_session/,
  /create function public\.pixisync_open_session/,
  /create function public\.pixisync_leave_session/,
  /create function public\.pixisync_archive_session/,
  /revoke all on function public\.pixisync_join_session\(text\) from public, anon/,
  /grant execute on function public\.pixisync_join_session\(text\) to authenticated/,
]) assert.match(lifecycleMigration, contract);

console.log('PiXiSYNC session lifecycle E2E passed');
