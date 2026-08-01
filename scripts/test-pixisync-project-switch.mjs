import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

globalThis.window = {
  PiXiEEDrawModules: {},
  location: { href: 'https://pixieed.jp/pixiedraw/' },
};

const source = await readFile(
  new URL('../pixiedraw/assets/js/modules/pixisync-project-switch-utils.js', import.meta.url),
  'utf8'
);
new Function(source)();

const {
  parseInviteToken,
  inspectRuntimeProject,
  runtimeMatchesProjectBinding,
  prepareProjectRuntimeSwitch,
  runSafeProjectJoin,
} = window.PiXiEEDrawModules.pixisyncProjectSwitchUtils;
const token = 'a'.repeat(64);
assert.equal(parseInviteToken(token.toUpperCase()), token);
assert.equal(parseInviteToken(token.match(/.{1,8}/g).join('-')), token);
assert.equal(parseInviteToken(`https://pixieed.jp/pixiedraw/?pixisync_invite=${token}`), token);
assert.equal(parseInviteToken(`https://pixieed.jp/pixiedraw/#pixisync_invite=${token}`), token);
assert.equal(parseInviteToken('ordinary project search'), '');

{
  const runtime = {
    snapshot: () => ({
      enabled: true,
      roomId: 'ROOM-A',
      role: 'owner',
      session: { projectKey: 'project-a', phase: 'active' },
    }),
  };
  assert.deepEqual(inspectRuntimeProject(runtime), {
    enabled: true,
    projectKey: 'project-a',
    roomId: 'room-a',
    role: 'owner',
    phase: 'active',
  });
  assert.equal(runtimeMatchesProjectBinding(runtime, 'project-a', { roomId: 'room-a', role: 'owner' }), true);
  assert.equal(runtimeMatchesProjectBinding(runtime, 'project-b', { roomId: 'room-a', role: 'owner' }), false);
  assert.equal(runtimeMatchesProjectBinding(runtime, 'project-a', { roomId: 'room-b', role: 'owner' }), false);
  assert.equal(runtimeMatchesProjectBinding(runtime, 'project-a', { roomId: 'room-a', role: 'participant' }), false);
  assert.equal(runtimeMatchesProjectBinding({
    snapshot: () => ({
      enabled: false,
      roomId: 'room-a',
      role: 'owner',
      session: { projectKey: 'project-a', phase: 'active' },
    }),
  }, 'project-a', { roomId: 'room-a', role: 'owner' }), false);
  assert.equal(runtimeMatchesProjectBinding({
    snapshot: () => ({
      roomId: 'room-a',
      role: 'owner',
      session: { projectKey: 'project-a', phase: 'archived' },
    }),
  }, 'project-a', { roomId: 'room-a', role: 'owner' }), false);
}

{
  const events = [];
  const runtime = {
    snapshot: () => ({ roomId: 'room-a', session: { projectKey: 'project-a', phase: 'active' } }),
  };
  const result = await prepareProjectRuntimeSwitch({
    targetProjectKey: 'project-b',
    runtime,
    clearRuntimeBridge: () => events.push('clear'),
    disposeRuntime: async target => { assert.equal(target, runtime); events.push('dispose'); },
  });
  assert.equal(result.disposed, true);
  assert.equal(result.kept, false);
  assert.deepEqual(events, ['clear', 'dispose', 'clear']);
}

{
  const disposeFailure = new Error('dispose-failed');
  const result = await prepareProjectRuntimeSwitch({
    targetProjectKey: 'project-b',
    runtime: {
      snapshot: () => ({ roomId: 'room-a', session: { projectKey: 'project-a', phase: 'active' } }),
    },
    disposeRuntime: async () => { throw disposeFailure; },
  });
  assert.equal(result.disposed, true);
  assert.equal(result.disposeError, disposeFailure);
}

{
  const events = [];
  const runtime = {
    snapshot: () => ({ roomId: 'room-a', session: { projectKey: 'project-a', phase: 'active' } }),
  };
  const result = await prepareProjectRuntimeSwitch({
    targetProjectKey: 'project-a',
    targetBinding: { roomId: 'room-a' },
    preserveMatchingRuntime: true,
    runtime,
    clearRuntimeBridge: () => events.push('clear'),
    disposeRuntime: async () => events.push('dispose'),
  });
  assert.equal(result.disposed, false);
  assert.equal(result.kept, true);
  assert.deepEqual(events, []);
}

{
  const events = [];
  const runtime = {
    snapshot: () => ({ roomId: 'room-a', session: { projectKey: 'project-a', phase: 'active' } }),
  };
  const result = await prepareProjectRuntimeSwitch({
    targetProjectKey: 'project-a',
    targetBinding: { roomId: 'room-a' },
    runtime,
    clearRuntimeBridge: () => events.push('clear'),
    disposeRuntime: async () => events.push('dispose'),
  });
  assert.equal(result.disposed, true);
  assert.equal(result.kept, false);
  assert.deepEqual(events, ['clear', 'dispose', 'clear']);
}

{
  const events = [];
  const runtime = {
    snapshot: () => ({ roomId: 'room-a', session: { projectKey: 'project-a', phase: 'active' } }),
  };
  const result = await prepareProjectRuntimeSwitch({
    targetProjectKey: 'project-a',
    targetBinding: null,
    runtime,
    clearRuntimeBridge: () => events.push('clear'),
    disposeRuntime: async () => events.push('dispose'),
  });
  assert.equal(result.disposed, true);
  assert.equal(result.kept, false);
  assert.deepEqual(events, ['clear', 'dispose', 'clear']);
}

{
  const events = [];
  const runtime = {
    snapshot: () => ({ roomId: '', session: { projectKey: '', phase: 'local' } }),
  };
  const result = await prepareProjectRuntimeSwitch({
    targetProjectKey: 'project-b',
    runtime,
    clearRuntimeBridge: () => events.push('clear'),
    disposeRuntime: async () => events.push('dispose'),
  });
  assert.equal(result.disposed, true);
  assert.deepEqual(events, ['clear', 'dispose', 'clear']);
}

{
  const events = [];
  const runtime = {
    async join(receivedToken) {
      events.push(`join:${receivedToken}`);
      return 'room-1';
    },
  };
  const result = await runSafeProjectJoin({
    inviteValue: token,
    ensureAuthenticated: async () => { events.push('auth'); return true; },
    captureCurrentProject: async () => { events.push('capture'); return { id: 'local-original' }; },
    disconnectCurrentRuntime: async () => { events.push('disconnect'); },
    createSharedWorkingProject: async () => { events.push('create'); return { ok: true, projectId: 'local-shared' }; },
    initializeRuntime: async () => { events.push('runtime'); return runtime; },
    disposeRuntime: async () => { events.push('dispose'); },
    removeProject: async () => { events.push('remove'); return true; },
    restoreProject: async () => { events.push('restore'); return true; },
  });
  assert.equal(result.ok, true);
  assert.equal(result.previousProjectId, 'local-original');
  assert.equal(result.projectId, 'local-shared');
  assert.deepEqual(events, ['auth', 'capture', 'disconnect', 'create', 'runtime', `join:${token}`]);
}

{
  const events = [];
  const result = await runSafeProjectJoin({
    inviteValue: token,
    ensureAuthenticated: async () => false,
    captureCurrentProject: async () => { events.push('capture'); return { id: 'local-original' }; },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'authentication-required');
  assert.deepEqual(events, []);
}

{
  const events = [];
  const runtime = {
    async join() {
      events.push('join');
      throw new Error('network-failed');
    },
  };
  const result = await runSafeProjectJoin({
    inviteValue: token,
    ensureAuthenticated: async () => true,
    captureCurrentProject: async () => ({ id: 'local-original' }),
    disconnectCurrentRuntime: async () => { events.push('disconnect'); },
    createSharedWorkingProject: async () => { events.push('create'); return { ok: true, projectId: 'local-shared' }; },
    initializeRuntime: async () => runtime,
    disposeRuntime: async target => { assert.equal(target, runtime); events.push('dispose'); },
    removeProject: async projectId => { events.push(`remove:${projectId}`); return true; },
    restoreProject: async project => { events.push(`restore:${project.id}`); return true; },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'join-failed');
  assert.equal(result.removedWorkingProject, true);
  assert.equal(result.restoredPreviousProject, true);
  assert.deepEqual(events, [
    'disconnect',
    'create',
    'join',
    'dispose',
    'remove:local-shared',
    'restore:local-original',
  ]);
}

{
  const events = [];
  const result = await runSafeProjectJoin({
    inviteValue: token,
    ensureAuthenticated: async () => true,
    captureCurrentProject: async () => ({ id: 'local-original' }),
    disconnectCurrentRuntime: async () => { events.push('disconnect'); },
    createSharedWorkingProject: async () => ({ ok: false, projectId: '' }),
    restoreProject: async project => { events.push(`restore:${project.id}`); return true; },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'local-project-save-failed');
  assert.equal(result.restoredPreviousProject, true);
  assert.deepEqual(events, ['disconnect', 'restore:local-original']);
}

{
  const saveError = new Error('save-failed');
  saveError.reason = 'local-project-save-failed';
  const result = await runSafeProjectJoin({
    inviteValue: token,
    ensureAuthenticated: async () => true,
    captureCurrentProject: async () => ({ id: 'local-original' }),
    disconnectCurrentRuntime: async () => { throw saveError; },
    restoreProject: async () => true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'local-project-save-failed');
  assert.equal(result.stage, 'disconnect-runtime');
  assert.equal(result.restoredPreviousProject, true);
}

{
  const [appSource, documentSessionSource, tabWorkflowSource, startupWorkflowSource, importWorkflowSource] = await Promise.all([
    readFile(new URL('../pixiedraw/assets/js/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../pixiedraw/assets/js/modules/document-session-workflow-utils.js', import.meta.url), 'utf8'),
    readFile(new URL('../pixiedraw/assets/js/modules/open-project-tab-workflow-utils.js', import.meta.url), 'utf8'),
    readFile(new URL('../pixiedraw/assets/js/modules/startup-workflow-utils.js', import.meta.url), 'utf8'),
    readFile(new URL('../pixiedraw/assets/js/modules/open-import-workflow-utils.js', import.meta.url), 'utf8'),
  ]);
  assert.match(appSource, /async function preparePiXiSyncProjectSwitch\(targetProjectId = '', \{/);
  assert.match(appSource, /if \(result\?\.disposeError\) throw result\.disposeError/);
  assert.match(appSource, /if \(!isTargetActive\(\)\) return buildStaleResult\(\)/);
  assert.match(appSource, /pixisyncRuntimeDisposalPromise/);
  assert.match(appSource, /pixisyncRuntimeInitializationPromise/);
  assert.match(appSource, /pixisyncRuntimeLifecycleEpoch/);
  assert.match(appSource, /const pixisyncRuntimeDisposals = new WeakMap\(\)/);
  assert.match(appSource, /pixisyncRuntimeDisposalPromise = currentDisposal\.catch\(\(\) => false\)/);
  assert.match(appSource, /preserveMatchingRuntime === true[\s\S]{0,500}if \(!runtime\) throw buildSupersededError\(\)/);
  assert.match(appSource, /await pixisyncRuntimeDisposalPromise;[\s\S]{0,120}runtime = window\.__PIXISYNC_V1_RUNTIME__/);
  assert.match(appSource, /ERR_PIXISYNC_PROJECT_SWITCH_SUPERSEDED/);
  assert.match(appSource, /if \(pixisyncProjectState\?\.stale === true\) return false/);
  assert.match(appSource, /finishRecentProjectOpen[\s\S]{0,500}reconcilePiXiSyncProjectForActivatedProject\(latestEntry\)/);
  assert.match(documentSessionSource, /await preparePiXiSyncProjectSwitch\?\.\(requestedProjectId,[\s\S]{0,200}preserveMatchingRuntime:[\s\S]{0,300}applyHistorySnapshot\(snapshot/);
  assert.match(tabWorkflowSource, /await reconcilePiXiSyncProjectForActivatedProject\?\.\(targetProjectId\);[\s\S]{0,200}queueProjectTabViewportReset/);
  assert.match(startupWorkflowSource, /await preparePiXiSyncProjectSwitch\?\.\(newProjectId\);[\s\S]{0,200}applyHistorySnapshot\(snapshot\)/);
  assert.match(importWorkflowSource, /await preparePiXiSyncProjectSwitch\?\.\(importedProjectId\);[\s\S]{0,300}applyHistorySnapshot\(snapshot/);
}

console.log('PiXiSYNC safe project switch tests passed.');
