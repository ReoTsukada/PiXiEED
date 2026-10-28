/** Public handoff API. Storage and backward-compatible record validation remain unchanged. */
export * from './output-handoff-core.mjs?rev=20261028-unified-output-1';
import { sendToolOutput as storedOutput } from './output-handoff-core.mjs?rev=20261028-unified-output-1';
import { navigationContext, flushOutputWorkspace, reportOutputError, outputReturnUrl } from './output-router.mjs?rev=20261028-unified-output-1';

// The storage implementation predates unified output and exempted direct/embedded editors.
// Resolve and validate the host here, then use its ordinary top-level storage/navigation path.
const storageWindow = Object.freeze({ parent: null });
async function performSharedOutput(options, dependencies = {}) {
  try {
    const context = navigationContext(dependencies.windowRef, dependencies.locationRef);
    await flushOutputWorkspace(context.win);
    if (dependencies.isCurrent && !dependencies.isCurrent()) return { ok: false, reason: 'source_changed' };
    const direct = context.win?.__PIXIEED_CREATION_HOST__?.active;
    const request = { ...options, returnUrl: direct
      ? outputReturnUrl(context.location.pathname + context.location.search + context.location.hash, context.location.origin)
      : typeof options?.returnUrl === 'function' ? options.returnUrl() : options?.returnUrl };
    const result = await storedOutput(request, { ...dependencies, windowRef: storageWindow,
      locationRef: context.location, historyRef: dependencies.historyRef || context.win?.history });
    if (!result.ok) reportOutputError(result.error, context.win?.document);
    return result;
  } catch (error) {
    reportOutputError(error, dependencies.windowRef?.document);
    return { ok: false, reason: 'permission_blocked', error };
  }
}
const outgoing = new WeakMap();
export function sendToolOutput(options, dependencies = {}) {
  const location = dependencies.locationRef || globalThis.location;
  if (!location || typeof location !== 'object') return performSharedOutput(options, dependencies);
  if (outgoing.has(location)) return outgoing.get(location);
  const promise = performSharedOutput(options, dependencies);
  outgoing.set(location, promise);
  void promise.finally(() => { if (outgoing.get(location) === promise) outgoing.delete(location); }).catch(() => {});
  return promise;
}

/** Local project saving is not a file export: finish it before leaving the editor. */
export async function sendToolOutputAfterSaving(options, workspace, isCurrent = () => true, dependencies) {
  try {
    try { await workspace?.assertCanSave?.(); }
    catch (error) { return { ok: false, reason: 'permission_blocked', error }; }
    if (workspace?.dirty) {
      if (typeof workspace.save !== 'function') throw new Error('編集中の作品を保存できません。');
      await workspace.save();
      if (workspace.dirty) throw new Error('編集中の作品の保存が終わっていません。');
    }
    if (!isCurrent()) return { ok: false, reason: 'source_changed' };
    return await sendToolOutput(options, { ...dependencies, isCurrent });
  } catch (error) {
    reportOutputError(error, dependencies?.windowRef?.document);
    return { ok: false, reason: 'project_save_failed', error };
  }
}
