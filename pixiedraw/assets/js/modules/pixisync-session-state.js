(() => {
  'use strict';

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  const toRevision = value => {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
    if (Number.isSafeInteger(value) && value >= 0) return BigInt(value);
    throw new Error('invalid-revision');
  };

  const cloneContext = context => ({
    ...context,
    checkpointRevision: context.checkpointRevision.toString(),
    appliedRevision: context.appliedRevision.toString(),
    authoritativeRevision: context.authoritativeRevision.toString(),
    reTailAfterRevision: context.reTailAfterRevision.toString(),
    sessionGeneration: context.sessionGeneration.toString(),
  });

  root.pixisyncSessionState = Object.freeze({
    createPiXiSyncSessionState(options = {}) {
      const role = options.role === 'owner' ? 'owner' : 'participant';
      const resumeAvailable = options.resumeAvailable === true;
      let context = {
        phase: resumeAvailable ? 'invited' : (role === 'owner' ? 'local' : 'invited'),
        role,
        canEdit: options.canEdit !== false,
        epoch: 0,
        projectKey: '',
        roomId: '',
        topic: '',
        roomStatus: resumeAvailable ? 'invited' : (role === 'owner' ? 'local' : 'invited'),
        memberStatus: resumeAvailable ? 'invited' : (role === 'owner' ? 'local' : 'invited'),
        sessionGeneration: 0n,
        channelSubscribed: false,
        privateSubscribed: false,
        checkpointLoaded: false,
        initialTailApplied: false,
        headRead: false,
        reTailRequested: false,
        reTailApplied: false,
        pendingGap: false,
        pendingOperationCount: 0,
        pendingOperationLimit: Math.max(1, Number(options.pendingOperationLimit) || 32),
        checkpointRevision: 0n,
        appliedRevision: 0n,
        authoritativeRevision: 0n,
        reTailAfterRevision: 0n,
        lastError: '',
      };
      const listeners = new Set();

      const snapshot = () => cloneContext(context);
      const notify = () => {
        const nextSnapshot = snapshot();
        listeners.forEach(listener => {
          try { listener(nextSnapshot); } catch (_) {}
        });
      };
      const isAsync = event => !['OPEN_REQUEST', 'JOIN_REQUEST', 'RESUME_REQUEST', 'CLOSE_REQUEST', 'LEAVE_REQUEST'].includes(event.type);
      const effectsForClose = () => [
        { type: 'FLUSH_PENDING' },
        { type: 'STOP_PRESENCE' },
        { type: 'REMOVE_CHANNEL' },
      ];
      const isOpenPhase = () => ['creating', 'joining', 'syncing', 'active', 'reconnecting'].includes(context.phase);
      const canDraw = () => (
        context.phase === 'active'
        && context.canEdit
        && context.roomStatus === 'active'
        && context.memberStatus === 'active'
        && context.channelSubscribed
        && context.privateSubscribed
        && !context.pendingGap
        && context.appliedRevision === context.authoritativeRevision
        && context.pendingOperationCount < context.pendingOperationLimit
      );
      const resetSyncGates = () => {
        context.channelSubscribed = false;
        context.privateSubscribed = false;
        context.checkpointLoaded = false;
        context.initialTailApplied = false;
        context.headRead = false;
        context.reTailRequested = false;
        context.reTailApplied = false;
        context.pendingGap = false;
        context.checkpointRevision = 0n;
        context.appliedRevision = 0n;
        context.authoritativeRevision = 0n;
        context.reTailAfterRevision = 0n;
      };
      const beginSync = effects => {
        context.phase = 'syncing';
        resetSyncGates();
        effects.push({ type: 'LOAD_CHECKPOINT' });
      };
      const transitionToReconnect = (effects, reason = '') => {
        if (!isOpenPhase()) return;
        context.epoch += 1;
        context.phase = 'reconnecting';
        context.lastError = reason;
        resetSyncGates();
        effects.push({ type: 'RECONNECT_CHANNEL' });
      };
      const maybeConverge = effects => {
        if (context.phase !== 'syncing' && context.phase !== 'reconnecting') return;
        if (!context.channelSubscribed || !context.checkpointLoaded || !context.initialTailApplied || !context.headRead) return;
        if (!context.reTailRequested) {
          context.reTailRequested = true;
          context.reTailAfterRevision = context.appliedRevision;
          effects.push({ type: 'FETCH_RETAIL', afterRevision: context.appliedRevision.toString() });
          return;
        }
        if (
          !context.reTailApplied
          || context.pendingGap
          || context.appliedRevision !== context.authoritativeRevision
        ) return;
        context.phase = 'active';
        context.lastError = '';
        effects.push({ type: 'SYNC_ACTIVE', revision: context.appliedRevision.toString() });
      };

      const dispatch = rawEvent => {
        const event = rawEvent && typeof rawEvent === 'object' ? rawEvent : { type: '' };
        const effects = [];
        if (!event.type) return { state: snapshot(), effects, ignored: true };
        if (isAsync(event) && event.epoch !== context.epoch) return { state: snapshot(), effects, ignored: true };
        const generationBoundEvents = new Set([
          'ROOM_READY',
          'MEMBERSHIP_OK',
          'CHANNEL_SUBSCRIBED',
          'CHECKPOINT_LOADED',
          'INITIAL_TAIL_APPLIED',
          'AUTHORITATIVE_HEAD',
          'RETAIL_APPLIED',
          'CONFIRMED_OPERATION_APPLIED',
        ]);
        if (
          generationBoundEvents.has(event.type)
          && context.sessionGeneration > 0n
          && toRevision(event.generation) !== context.sessionGeneration
        ) {
          return { state: snapshot(), effects, ignored: true };
        }

        switch (event.type) {
          case 'OPEN_REQUEST':
            if (context.role !== 'owner' || context.phase !== 'local') break;
            context.epoch += 1;
            context.phase = 'creating';
            context.projectKey = String(event.projectKey || '');
            context.roomStatus = 'initializing';
            context.memberStatus = 'active';
            context.lastError = '';
            effects.push({ type: 'ENSURE_ROOM', projectKey: context.projectKey, epoch: context.epoch });
            break;
          case 'JOIN_REQUEST':
            if (context.role !== 'participant' || !['invited', 'left'].includes(context.phase)) break;
            context.epoch += 1;
            context.phase = 'joining';
            context.projectKey = String(event.projectKey || '');
            context.roomStatus = 'joining';
            context.memberStatus = 'joining';
            context.lastError = '';
            effects.push({ type: 'VERIFY_MEMBERSHIP', projectKey: context.projectKey, epoch: context.epoch });
            break;
          case 'RESUME_REQUEST':
            if (!['local', 'invited', 'left'].includes(context.phase)) break;
            context.epoch += 1;
            context.phase = context.role === 'owner' ? 'creating' : 'joining';
            context.projectKey = String(event.projectKey || '');
            context.roomStatus = 'joining';
            context.memberStatus = 'joining';
            context.lastError = '';
            effects.push({
              type: 'VERIFY_EXISTING_SESSION',
              roomId: String(event.roomId || ''),
              epoch: context.epoch,
            });
            break;
          case 'ROOM_READY':
            if (context.phase !== 'creating') break;
            context.roomId = String(event.roomId || '');
            context.topic = `pixisync:room:${context.roomId}`;
            context.roomStatus = event.status === 'active' ? 'active' : 'initializing';
            context.memberStatus = 'active';
            context.sessionGeneration = toRevision(event.generation);
            if (!context.roomId || context.roomStatus !== 'active' || context.sessionGeneration < 1n) {
              context.lastError = 'room-not-active';
              break;
            }
            effects.push({ type: 'OPEN_PRIVATE_CHANNEL', topic: context.topic, private: true, epoch: context.epoch });
            break;
          case 'MEMBERSHIP_OK':
            if (context.phase !== 'joining') break;
            context.canEdit = event.canEdit !== false;
            context.roomId = String(event.roomId || '');
            context.topic = `pixisync:room:${context.roomId}`;
            context.roomStatus = event.status === 'active' ? 'active' : 'joining';
            context.memberStatus = 'active';
            context.sessionGeneration = toRevision(event.generation);
            if (!context.roomId || context.roomStatus !== 'active' || context.sessionGeneration < 1n) {
              context.lastError = 'membership-room-not-active';
              break;
            }
            effects.push({ type: 'OPEN_PRIVATE_CHANNEL', topic: context.topic, private: true, epoch: context.epoch });
            break;
          case 'CHANNEL_SUBSCRIBED':
            if (!['creating', 'joining', 'syncing', 'reconnecting'].includes(context.phase)) break;
            if (event.private !== true || String(event.topic || '') !== context.topic) {
              transitionToReconnect(effects, 'invalid-private-channel');
              effects.unshift({ type: 'REMOVE_CHANNEL' });
              break;
            }
            if (context.phase === 'creating' || context.phase === 'joining') beginSync(effects);
            else effects.push({ type: 'LOAD_CHECKPOINT' });
            context.channelSubscribed = true;
            context.privateSubscribed = true;
            break;
          case 'CHECKPOINT_LOADED': {
            if (!['syncing', 'reconnecting'].includes(context.phase)) break;
            const revision = toRevision(event.revision);
            context.checkpointLoaded = true;
            context.checkpointRevision = revision;
            context.appliedRevision = revision;
            effects.push({ type: 'FETCH_INITIAL_TAIL', afterRevision: revision.toString() });
            break;
          }
          case 'INITIAL_TAIL_APPLIED':
            if (!['syncing', 'reconnecting'].includes(context.phase)) break;
            {
              const revision = toRevision(event.revision);
              if (revision < context.checkpointRevision) {
                transitionToReconnect(effects, 'initial-tail-revision-regressed');
                effects.push({ type: 'FULL_RESYNC' });
                break;
              }
              context.appliedRevision = revision;
            }
            context.initialTailApplied = true;
            effects.push({ type: 'READ_AUTHORITATIVE_HEAD' });
            break;
          case 'AUTHORITATIVE_HEAD':
            if (!['syncing', 'reconnecting'].includes(context.phase)) break;
            context.authoritativeRevision = toRevision(event.revision);
            if (context.authoritativeRevision < context.appliedRevision) {
              transitionToReconnect(effects, 'authoritative-head-regressed');
              effects.push({ type: 'FULL_RESYNC' });
              break;
            }
            context.headRead = true;
            maybeConverge(effects);
            break;
          case 'RETAIL_APPLIED':
            if (!['syncing', 'reconnecting'].includes(context.phase)) break;
            context.appliedRevision = toRevision(event.revision);
            if (
              context.appliedRevision < context.reTailAfterRevision
              || context.appliedRevision !== context.authoritativeRevision
            ) {
              transitionToReconnect(effects, 'retail-revision-mismatch');
              effects.push({ type: 'FULL_RESYNC' });
              break;
            }
            context.reTailApplied = true;
            maybeConverge(effects);
            break;
          case 'GAP_DETECTED':
          case 'SOCKET_OFFLINE':
          case 'CHANNEL_CLOSED':
          case 'HASH_MISMATCH':
            transitionToReconnect(effects, event.type.toLowerCase());
            break;
          case 'PENDING_OPERATION_COUNT':
            context.pendingOperationCount = Math.max(0, Number(event.count) || 0);
            break;
          case 'CONFIRMED_OPERATION_APPLIED': {
            if (context.phase !== 'active') break;
            const revision = toRevision(event.revision);
            if (revision !== context.appliedRevision + 1n) {
              transitionToReconnect(effects, 'confirmed-revision-gap');
              break;
            }
            context.appliedRevision = revision;
            context.authoritativeRevision = revision;
            break;
          }
          case 'CLOSE_REQUEST':
            if (context.role !== 'owner' || !isOpenPhase()) break;
            context.epoch += 1;
            context.phase = 'closing';
            effects.push(...effectsForClose().map(effect => ({ ...effect, epoch: context.epoch })));
            break;
          case 'LEAVE_REQUEST':
            if (context.role !== 'participant' || !isOpenPhase()) break;
            context.epoch += 1;
            context.phase = 'leaving';
            effects.push(...effectsForClose().map(effect => ({ ...effect, epoch: context.epoch })));
            break;
          case 'CLOSED':
            if (context.phase !== 'closing') break;
            context.phase = 'archived';
            context.roomStatus = 'archived';
            context.channelSubscribed = false;
            context.privateSubscribed = false;
            break;
          case 'LEFT':
            if (context.phase !== 'leaving') break;
            context.phase = 'left';
            context.memberStatus = 'left';
            context.channelSubscribed = false;
            context.privateSubscribed = false;
            break;
          case 'ROOM_ARCHIVED':
            if (!isOpenPhase() && context.phase !== 'closing') break;
            context.epoch += 1;
            context.phase = 'archived';
            context.roomStatus = 'archived';
            context.channelSubscribed = false;
            context.privateSubscribed = false;
            context.lastError = 'room-archived';
            effects.push(
              { type: 'QUARANTINE_PENDING', epoch: context.epoch },
              { type: 'STOP_PRESENCE', epoch: context.epoch },
              { type: 'REMOVE_CHANNEL', epoch: context.epoch }
            );
            break;
          case 'ROOM_ACCESS_REVOKED':
            if (context.role !== 'participant' || (!isOpenPhase() && context.phase !== 'leaving')) break;
            context.epoch += 1;
            context.phase = 'permission_lost';
            context.memberStatus = 'permission_lost';
            context.channelSubscribed = false;
            context.privateSubscribed = false;
            context.lastError = 'room-access-revoked';
            effects.push(
              { type: 'QUARANTINE_PENDING', epoch: context.epoch },
              { type: 'STOP_PRESENCE', epoch: context.epoch },
              { type: 'REMOVE_CHANNEL', epoch: context.epoch }
            );
            break;
          case 'DENIED':
            if (context.phase !== 'joining') break;
            context.phase = 'invited';
            context.lastError = String(event.reason || 'denied');
            break;
          case 'FAIL':
            if (context.phase === 'creating' || context.phase === 'joining') {
              const failedCreating = context.phase === 'creating';
              context.epoch += 1;
              context.phase = failedCreating ? 'local' : 'invited';
              context.roomStatus = failedCreating ? 'local' : 'invited';
              context.memberStatus = failedCreating ? 'local' : 'invited';
              effects.push(
                { type: 'STOP_PRESENCE', epoch: context.epoch },
                { type: 'REMOVE_CHANNEL', epoch: context.epoch }
              );
            }
            else transitionToReconnect(effects, String(event.reason || 'failed'));
            context.lastError = String(event.reason || 'failed');
            break;
          default:
            return { state: snapshot(), effects, ignored: true };
        }
        const state = snapshot();
        notify();
        return { state, effects, ignored: false };
      };

      const subscribe = listener => {
        if (typeof listener !== 'function') return () => {};
        listeners.add(listener);
        return () => listeners.delete(listener);
      };

      return Object.freeze({ dispatch, getSnapshot: snapshot, canDraw, subscribe });
    },
  });
})();
