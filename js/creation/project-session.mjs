import { canonicalPxdJson, createPxdProject } from './pxd-codec.mjs';
import { sanitizeProjectTitle } from './project-catalog.mjs?rev=20261001-free-tools-1';

function copyProject(project) {
  return {
    ...structuredClone(Object.fromEntries(Object.entries(project).filter(([key]) => key !== 'entries' && key !== 'opaquePayloads'))),
    entries: (project.entries ?? []).map((entry) => ({ ...structuredClone(Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'bytes'))), bytes: new Uint8Array(entry.bytes) })),
    opaquePayloads: (project.opaquePayloads ?? []).map(({ bytes }) => ({ bytes: new Uint8Array(bytes) }))
  };
}

function comparable(project) {
  const manifest = structuredClone(project.manifest ?? {});
  delete manifest.updatedAt;
  return { manifest, entries: project.entries.map(({ bytes, ...entry }) => ({ entry, bytes })), opaquePayloads: project.opaquePayloads ?? [] };
}

function sameContent(a, b) {
  if (!a || !b) return false;
  const left = comparable(a); const right = comparable(b);
  if (canonicalPxdJson(left.manifest) !== canonicalPxdJson(right.manifest) || left.entries.length !== right.entries.length || left.opaquePayloads.length !== right.opaquePayloads.length) return false;
  const equalBytes = (x, y) => x.length === y.length && x.every((byte, index) => byte === y[index]);
  return left.entries.every((item, index) => canonicalPxdJson(item.entry) === canonicalPxdJson(right.entries[index].entry) && equalBytes(item.bytes, right.entries[index].bytes))
    && left.opaquePayloads.every((item, index) => equalBytes(item.bytes, right.opaquePayloads[index].bytes));
}

const SESSION_MESSAGES = {
  PROJECT_SESSION_ID_MISMATCH: '保存対象の作品IDが現在の作品と一致しません。',
  PROJECT_SESSION_STALE: '作品が切り替わったため、この保存は中断しました。',
  PROJECT_SESSION_EMPTY: '保存する作品がありません。'
};
function sessionError(code) { return Object.assign(new Error(SESSION_MESSAGES[code] ?? '作品の保存状態を確認できません。'), { code }); }

/** Coordinate one active editor project and its compare-and-swap saves. */
export function createProjectSession({ store, capture, apply = async () => {}, blank = () => createPxdProject(), onChange = () => {}, authorize = async () => {}, now = Date.now } = {}) {
  if (!store || typeof store.save !== 'function' || typeof capture !== 'function' || typeof apply !== 'function') throw new TypeError('PROJECT_SESSION_DEPENDENCY_INVALID');
  let current = null; let saved = null; let isPersisted = false; let isDirty = false; let busyCount = 0;
  let epoch = 0; let mutation = 0; let queue = Promise.resolve();
  const notify = (error) => onChange({ project: current, persisted: isPersisted, dirty: isDirty, busy: busyCount > 0, ...(error ? { error } : {}) });
  const assertIdentity = (project, id) => { if (!project || project.projectId !== id) throw sessionError('PROJECT_SESSION_ID_MISMATCH'); };

  async function initialize(project, { persisted = false, apply: shouldApply = false } = {}) {
    await queue;
    if (shouldApply) await apply(copyProject(project));
    current = copyProject(project); saved = persisted ? copyProject(project) : null; isPersisted = persisted; isDirty = !persisted; epoch += 1; mutation += 1; notify();
    return current;
  }

  function save() {
    if (!current) return Promise.reject(sessionError('PROJECT_SESSION_EMPTY'));
    const boundId = current.projectId; const boundEpoch = epoch; const boundMutation = mutation;
    let captured;
    try { captured = Promise.resolve(capture(copyProject(current))).then((value) => ({ value }), (error) => ({ error })); }
    catch (error) { return Promise.reject(error); }
    busyCount += 1; notify();
    const task = queue.then(async () => {
      const captureResult = await captured;
      if (captureResult.error) throw captureResult.error;
      const candidate = copyProject(captureResult.value);
      if (epoch !== boundEpoch || current?.projectId !== boundId) throw sessionError('PROJECT_SESSION_STALE');
      assertIdentity(candidate, boundId);
      await authorize(copyProject(candidate));
      if (epoch !== boundEpoch || current?.projectId !== boundId) throw sessionError('PROJECT_SESSION_STALE');
      if (isPersisted && saved?.projectId === boundId && sameContent(saved, candidate)) {
        if (typeof store.load === 'function') {
          const latest = await store.load(boundId);
          if (epoch !== boundEpoch || current?.projectId !== boundId) throw sessionError('PROJECT_SESSION_STALE');
          if (!latest) throw Object.assign(new Error('このプロジェクトは削除されたか、保存先に見つかりません。編集内容は残っています。プロジェクト一覧から確認してください。'), { code: 'PXD_PROJECT_UNAVAILABLE' });
          if (latest.revisionId !== saved.revisionId) {
            throw Object.assign(new Error('別のタブで更新されています。編集中の内容は残っています。複製して保存するか最新の作品を開いてください。'), { code: 'PXD_STORE_CONFLICT' });
          }
        }
        if (mutation === boundMutation) isDirty = false;
        return copyProject(saved);
      }
      const timestamp = now();
      candidate.manifest = { ...candidate.manifest, updatedAt: timestamp instanceof Date ? timestamp.getTime() : timestamp };
      const result = await store.save(candidate, { expectedRevisionId: saved?.projectId === boundId ? saved.revisionId : null });
      if (result.projectId !== boundId) throw sessionError('PROJECT_SESSION_ID_MISMATCH');
      if (epoch === boundEpoch && current?.projectId === boundId) {
        saved = copyProject(result); isPersisted = true;
        if (mutation === boundMutation) { current = copyProject(result); isDirty = false; }
      }
      return copyProject(result);
    });
    queue = task.catch(() => {});
    return task.catch((error) => { notify(error); throw error; }).finally(() => { busyCount -= 1; notify(); });
  }

  async function adopt(project, { persisted = true, apply: shouldApply = true } = {}) {
    await queue;
    const candidate = copyProject(project);
    if (shouldApply) await apply(copyProject(candidate));
    current = candidate; saved = persisted ? copyProject(candidate) : null; isPersisted = persisted; isDirty = !persisted; epoch += 1; mutation += 1; notify();
    return current;
  }

  /** Replace content within the same project, retaining the saved head for compare-and-swap. */
  async function replace(project, { apply: shouldApply = true } = {}) {
    await queue;
    if (!current) throw sessionError('PROJECT_SESSION_EMPTY');
    assertIdentity(project, current.projectId);
    const candidate = copyProject(project);
    if (shouldApply) await apply(copyProject(candidate));
    current = candidate; isDirty = true; epoch += 1; mutation += 1; notify(); return current;
  }

  function reset() {
    const project = copyProject(blank());
    current = project; saved = null; isPersisted = false; isDirty = true; epoch += 1; mutation += 1; notify();
    return current;
  }

  function rename(title) {
    if (!current) throw sessionError('PROJECT_SESSION_EMPTY');
    current.manifest.title = sanitizeProjectTitle(title); markDirty(); return current;
  }

  function markDirty() { mutation += 1; isDirty = true; notify(); }
  /** Explicitly refresh a source from the latest project while retaining non-conflicting local edits. */
  function refreshLatest(merge) {
    if (typeof merge !== 'function' || !current) return Promise.reject(sessionError('PROJECT_SESSION_EMPTY'));
    const boundId = current.projectId; const boundEpoch = epoch;
    busyCount += 1; notify();
    const task = queue.then(async () => {
      const boundMutation = mutation;
      if (epoch !== boundEpoch || current?.projectId !== boundId) throw sessionError('PROJECT_SESSION_STALE');
      if (!isPersisted || !saved) return copyProject(current);
      const local = await capture(copyProject(current));
      assertIdentity(local, boundId);
      const latest = await store.load(boundId);
      if (!latest) throw Object.assign(new Error('このプロジェクトは削除されたか、保存先に見つかりません。編集内容は残っています。'), { code: 'PXD_PROJECT_UNAVAILABLE' });
      assertIdentity(latest, boundId);
      const candidate = copyProject(await merge(copyProject(saved), copyProject(local), copyProject(latest)));
      assertIdentity(candidate, boundId);
      await authorize(copyProject(candidate));
      if (epoch !== boundEpoch || mutation !== boundMutation || current?.projectId !== boundId) throw sessionError('PROJECT_SESSION_STALE');
      await apply(copyProject(candidate));
      current = candidate; saved = copyProject(latest); isPersisted = true;
      isDirty = !sameContent(saved, candidate); epoch += 1; mutation += 1; notify();
      return copyProject(current);
    });
    queue = task.catch(() => {});
    return task.catch((error) => { notify(error); throw error; }).finally(() => { busyCount -= 1; notify(); });
  }
  async function wait() { await queue; }
  return {
    get currentProject() { return current; }, get persistedProject() { return saved; }, get persisted() { return isPersisted; }, get dirty() { return isDirty; }, get busy() { return busyCount > 0; },
    initialize, save, adopt, replace, reset, rename, markDirty, refreshLatest, wait
  };
}
