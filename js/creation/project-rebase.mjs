import { canonicalPxdJson } from './pxd-codec.mjs';

const CONFLICT_CODE = 'PXD_STORE_CONFLICT';
const CONFLICT_MESSAGE = '別のタブで同じ箇所が更新されています。今の編集内容は残っています。最新の作品を確認してから、もう一度保存してください。';

function conflict() { throw Object.assign(new Error(CONFLICT_MESSAGE), { code: CONFLICT_CODE }); }
function clone(value) { return value === undefined ? undefined : structuredClone(value); }
function equalBytes(a, b) {
  return a instanceof Uint8Array && b instanceof Uint8Array && a.length === b.length && a.every((byte, index) => byte === b[index]);
}
function equalOpaque(a = [], b = []) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length
    && a.every((chunk, index) => equalBytes(chunk?.bytes, b[index]?.bytes));
}
function equal(a, b) {
  if (a === undefined || b === undefined) return a === b;
  if (a instanceof Uint8Array || b instanceof Uint8Array) return equalBytes(a, b);
  try { return canonicalPxdJson(a) === canonicalPxdJson(b); } catch { return false; }
}
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Uint8Array)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function mergeValue(base, local, latest) {
  if (equal(local, base)) return clone(latest);
  if (equal(latest, base)) return clone(local);
  if (equal(local, latest)) return clone(latest);
  if (isPlainObject(base) && isPlainObject(local) && isPlainObject(latest)) {
    const out = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(latest)])) {
      const value = mergeValue(base[key], local[key], latest[key]);
      if (value !== undefined) out[key] = value;
    }
    return out;
  }
  conflict();
}

function entryEqual(a, b) {
  if (a === undefined || b === undefined) return a === b;
  const { bytes: aBytes, ...aMetadata } = a;
  const { bytes: bBytes, ...bMetadata } = b;
  for (const metadata of [aMetadata, bMetadata]) {
    delete metadata.offset;
    delete metadata.length;
    delete metadata.sha256;
  }
  return equalBytes(aBytes, bBytes) && equal(aMetadata, bMetadata);
}

function mergeEntries(baseEntries, localEntries, latestEntries) {
  const maps = [baseEntries, localEntries, latestEntries].map((entries) => new Map((entries ?? []).map((entry) => [entry.path, entry])));
  const [base, local, latest] = maps;
  const order = [...new Set([...(latestEntries ?? []).map(({ path }) => path), ...(localEntries ?? []).map(({ path }) => path), ...(baseEntries ?? []).map(({ path }) => path)])];
  const out = [];
  for (const path of order) {
    const b = base.get(path); const l = local.get(path); const r = latest.get(path);
    if (entryEqual(l, b)) { if (r !== undefined) out.push(clone(r)); continue; }
    if (entryEqual(r, b)) { if (l !== undefined) out.push(clone(l)); continue; }
    if (entryEqual(l, r)) { if (r !== undefined) out.push(clone(r)); continue; }
    conflict();
  }
  return out;
}

function mergeManifest(baseManifest, localManifest, latestManifest) {
  const base = clone(baseManifest ?? {}); const local = clone(localManifest ?? {}); const latest = clone(latestManifest ?? {});
  const bState = base.editorState ?? {}; const lState = local.editorState ?? {}; const rState = latest.editorState ?? {};
  const hadEditorState = ['editorState'].some((key) => Object.hasOwn(base, key) || Object.hasOwn(local, key) || Object.hasOwn(latest, key));
  const hadUpdatedAt = Object.hasOwn(latest, 'updatedAt'); const updatedAt = clone(latest.updatedAt);
  const hadLastMode = Object.hasOwn(local, 'lastMode'); const lastMode = clone(local.lastMode);
  for (const manifest of [base, local, latest]) { delete manifest.updatedAt; delete manifest.lastMode; delete manifest.editorState; }
  const merged = mergeValue(base, local, latest);
  // Save timestamps are generated at commit time. The editor's selected mode is useful local UI state.
  if (hadUpdatedAt) merged.updatedAt = updatedAt;
  else delete merged.updatedAt;
  if (hadLastMode) merged.lastMode = lastMode;
  else delete merged.lastMode;

  const editorState = {};
  for (const tool of new Set([...Object.keys(bState), ...Object.keys(lState), ...Object.keys(rState)])) {
    const state = mergeValue(bState[tool], lState[tool], rState[tool]);
    if (state !== undefined) editorState[tool] = state;
  }
  if (Object.keys(editorState).length || hadEditorState) merged.editorState = editorState;
  return merged;
}

/** Rebase local project edits made from base on top of a newer saved revision. */
export function rebaseProjectEdits(base, local, latest) {
  if (!base || !local || !latest || base.projectId !== local.projectId || base.projectId !== latest.projectId) conflict();
  const baseOpaque = base.opaquePayloads ?? []; const localOpaque = local.opaquePayloads ?? []; const latestOpaque = latest.opaquePayloads ?? [];
  const opaquePayloads = equalOpaque(localOpaque, baseOpaque) ? latestOpaque
    : equalOpaque(latestOpaque, baseOpaque) || equalOpaque(localOpaque, latestOpaque) ? localOpaque : (conflict(), []);
  const fields = {};
  for (const key of new Set([...Object.keys(local), ...Object.keys(latest)])) {
    if (['projectId', 'revisionId', 'manifest', 'entries', 'opaquePayloads'].includes(key)) continue;
    // The latest revision owns unrecognized project-level fields.
    if (Object.hasOwn(latest, key)) fields[key] = clone(latest[key]);
  }
  return {
    ...fields,
    format: latest.format,
    version: latest.version,
    projectId: latest.projectId,
    revisionId: latest.revisionId,
    manifest: mergeManifest(base.manifest, local.manifest, latest.manifest),
    entries: mergeEntries(base.entries, local.entries, latest.entries),
    opaquePayloads: opaquePayloads.map(({ bytes }) => ({ bytes: new Uint8Array(bytes) }))
  };
}
