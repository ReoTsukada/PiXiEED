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

const { parseInviteToken, runSafeProjectJoin } = window.PiXiEEDrawModules.pixisyncProjectSwitchUtils;
const token = 'a'.repeat(64);
assert.equal(parseInviteToken(token.toUpperCase()), token);
assert.equal(parseInviteToken(token.match(/.{1,8}/g).join('-')), token);
assert.equal(parseInviteToken(`https://pixieed.jp/pixiedraw/?pixisync_invite=${token}`), token);
assert.equal(parseInviteToken(`https://pixieed.jp/pixiedraw/#pixisync_invite=${token}`), token);
assert.equal(parseInviteToken('ordinary project search'), '');

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

console.log('PiXiSYNC safe project switch tests passed.');
