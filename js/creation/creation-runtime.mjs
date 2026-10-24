import { createModeScope } from './mode-scope.mjs?rev=20261001-independent-editors-1';
import { readCreationModePointer } from './mode-entry.mjs?rev=20261016-tool-shell-1';
import { mountDrawMode } from './draw-page.mjs?rev=20261024-all-tools-offerwall-1';
import { mountProjectWorkspace } from './project-workspace.mjs?rev=20261024-all-tools-offerwall-1';
import { mountCreationModes } from './creation-modes.mjs?rev=20261024-all-tools-offerwall-1';
import { getCreationSnapshot } from './creation-snapshot.mjs?rev=20261018-direct-runtime-1';

function lastWorkspacePointer(search, requestedMode, restoreLast) {
  const params = new URLSearchParams(search);
  if (['audio', 'camera'].includes(requestedMode) && params.has('modePxd')) {
    return readCreationModePointer(requestedMode, params);
  }
  if (!restoreLast || params.has('pxd')) return null;
  try {
    const pointer = JSON.parse(localStorage.getItem('pixieed:pxd:last:creation')
      || localStorage.getItem('pixieed:pxd:last:draw') || 'null');
    return pointer?.projectId && pointer?.revisionId ? pointer : null;
  } catch {
    return null;
  }
}

/** Mount the real shared editor once into the current document. */
export async function mountCreationRuntime({
  isActive = () => true,
  requestedMode = null,
  role = 'draw',
  search = location.search,
  restoreLast = true,
  initialPointer,
  workspaceOptions = {},
  deferInitialMode = false,
  onBootPhase = () => {},
  signal
} = {}) {
  const scope = createModeScope();
  let mountedModes = null;
  let draw = null;
  let active = true;
  let disposed = false;
  const abort = () => { active = false; disposed = true; scope.dispose(); };
  if (signal?.aborted) { abort(); throw new DOMException('制作画面が閉じられました。', 'AbortError'); }
  signal?.addEventListener('abort', abort, { once: true });
  scope.add(() => signal?.removeEventListener('abort', abort));
  const hostActive = () => !disposed && active && isActive();
  const gatedScope = Object.create(scope);
  gatedScope.listen = (target, type, callback, options) => scope.listen(target, type, event => {
    if (hostActive()) callback(event);
  }, options);
  gatedScope.timeout = (callback, delay, ...args) => scope.timeout(() => {
    if (hostActive()) callback(...args);
  }, delay);
  gatedScope.frame = callback => scope.frame(time => {
    if (hostActive()) callback(time);
  });
  scope.listen(window, 'pagehide', event => {
    if (event.persisted) return;
    active = false;
    disposed = true;
    scope.dispose();
  });

  const retainedPointer = initialPointer === undefined
    ? lastWorkspacePointer(search, requestedMode || new URLSearchParams(search).get('mode'), restoreLast)
    : initialPointer;
  const reportBootPhase = phase => { try { onBootPhase(phase); } catch { /* Progress reporting must never affect editor startup. */ } };
  try {
  reportBootPhase('draw');
  draw = await mountDrawMode({
    scope: gatedScope,
    musicLayer: true,
    isActive: () => hostActive() && (!mountedModes || mountedModes.mode !== 'camera'),
    mountWorkspace: options => {
      reportBootPhase('workspace');
      return mountProjectWorkspace({
      ...options,
      ...workspaceOptions,
      initialPointer: retainedPointer,
      isActive: () => hostActive(),
      onNavigate: request => mountedModes ? mountedModes.navigate(request) : location.assign(request.url)
      });
    }
  });
  if (disposed) throw new Error('制作画面が閉じられました。');
  reportBootPhase('mode');
  mountedModes = await mountCreationModes({
    draw,
    scope: gatedScope,
    isActive: hostActive,
    requestedMode,
    deferInitialMode
  });
  } catch (error) {
    active = false;
    disposed = true;
    scope.dispose();
    throw error;
  }

  const runtime = {
    draw,
    modes: mountedModes,
    get state() {
      return { ready: !disposed, active: hostActive(), disposed, mode: mountedModes.mode, switching: mountedModes.switching };
    },
    async getState() {
      return getCreationSnapshot({ draw, modes: mountedModes, role });
    },
    async activate(mode = requestedMode) {
      if (disposed) throw new Error('制作画面は閉じられています。');
      active = true;
      if (mode) {
        await mountedModes.switchMode(mode);
        if (mountedModes.mode !== mode) throw new Error('制作モードを準備できませんでした。');
      }
      mountedModes.resumeForEmbed?.();
      return runtime.state;
    },
    suspend() {
      if (disposed) return;
      const wasActive = active;
      active = false;
      try { mountedModes.suspendForEmbed?.(); }
      catch (error) { active = wasActive; throw error; }
      return runtime.state;
    },
    dispose() {
      if (disposed) return;
      active = false;
      disposed = true;
      scope.dispose();
    }
  };
  return runtime;
}
