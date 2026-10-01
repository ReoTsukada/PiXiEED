import { decodePxd } from './pxd-codec.mjs';
import { createPxdStore, PxdStoreError } from './pxd-store.mjs?rev=20261001-free-tools-1';
import { forkProject } from './project-catalog.mjs?rev=20261001-free-tools-1';

const TOOLS = new Set(['draw', 'audio', 'camera', 'jigsaw', 'spot_difference', 'hidden_object']);
const ownStamp = (tool) => ({ tool, schemaVersion: 1 });
const randomId = (prefix) => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`}`;
const toolError = (code, message) => new PxdStoreError(code, message);

function assertTool(tool) {
  if (!TOOLS.has(tool)) throw toolError('PXD_TOOL_INVALID', '制作ツールを確認できません。');
}
function owns(project, tool) {
  const stamp = project?.manifest?.toolProject;
  return stamp?.tool === tool && stamp?.schemaVersion === 1;
}
function summaryStamp(item) { return item?.summary?.toolProject; }
function assertOwned(project, tool) {
  if (!project) return null;
  const stamp = project.manifest?.toolProject;
  if (stamp === undefined) throw toolError('PXD_TOOL_PROJECT_UNTAGGED', '未分類の旧作品は自動で取り込みません。コピーしてから使ってください。');
  if (!owns(project, tool)) throw toolError('PXD_TOOL_PROJECT_FOREIGN', 'この作品は別の制作ツールに属しています。');
  return project;
}
function editorStateForTool(source, tool) {
  const value = source?.manifest?.editorState?.[tool];
  return value === undefined ? {} : { [tool]: structuredClone(value) };
}

/** Explicitly fork an imported PXD into a new, independently owned tool project. */
export function cloneAsToolProject(source, tool, { projectId = randomId('tool-project'), revisionId = randomId('tool-revision'), title, now = Date.now() } = {}) {
  assertTool(tool);
  if (projectId === source?.projectId || revisionId === source?.revisionId) throw toolError('PXD_TOOL_PROJECT_CLONE_ID', 'コピー先には新しい作品IDと保存版IDが必要です。');
  const clone = forkProject(source, { projectId, revisionId, title, now });
  clone.manifest = {
    ...clone.manifest,
    toolProject: ownStamp(tool),
    lastMode: tool,
    editorState: editorStateForTool(source, tool)
  };
  return clone;
}

/** A capability-limited facade over the shared PXD store. */
export function createToolProjectStore(tool, options = {}) {
  assertTool(tool);
  const rawStore = options.rawStore ?? options.store ?? createPxdStore(options);
  const adapter = options.adapter;
  const ownershipCache = new Map();
  const remember = (project) => { if (owns(project, tool)) ownershipCache.set(project.projectId, structuredClone(project)); };

  async function readDeleted(projectId, revisionId) {
    if (typeof rawStore.inspectProject === 'function') {
      const inspected = await rawStore.inspectProject(projectId, { revisionId, includeDeleted: true });
      if (inspected && Number.isFinite(inspected.deletedAt)) return inspected.project;
    }
    if (typeof adapter?.listLatest === 'function') {
      const record = (await adapter.listLatest()).find((item) => item?.projectId === projectId && item?.revisionId === revisionId && Number.isFinite(item.deletedAt));
      if (record) {
        const project = await decodePxd(record.bytes);
        if (project.projectId !== projectId || project.revisionId !== revisionId) throw toolError('PXD_STORE_RECORD_INVALID');
        return project;
      }
    }
    const cached = ownershipCache.get(projectId);
    return cached?.revisionId === revisionId ? structuredClone(cached) : null;
  }

  async function inspectRecord(item) {
    let project;
    if (Number.isFinite(item.deletedAt)) project = await readDeleted(item.projectId, item.revisionId);
    else project = await rawStore.load(item.projectId, item.revisionId);
    if (!project) return null;
    if (owns(project, tool)) remember(project);
    return owns(project, tool) ? project : null;
  }

  async function onlyOwned({ includeDeleted = false } = {}) {
    const result = await rawStore.listProjects({ includeDeleted });
    const projects = []; const errors = [...(result.errors ?? [])];
    for (const item of result.projects ?? []) {
      const stamp = summaryStamp(item);
      if (stamp && stamp.schemaVersion === 1 && stamp.tool !== tool) continue;
      if (stamp && stamp.schemaVersion !== 1) continue;
      try { if (await inspectRecord(item)) projects.push(item); }
      catch (error) { errors.push({ projectId: item.projectId, revisionId: item.revisionId, code: error?.code || 'PXD_STORE_RECORD_INVALID' }); }
    }
    return { projects, errors };
  }

  return {
    async load(projectId, revisionId) {
      const project = await rawStore.load(projectId, revisionId);
      if (!project) return null;
      assertOwned(project, tool); remember(project); return project;
    },
    async save(project, { expectedRevisionId = null } = {}) {
      if (!project || project.format !== 'PXD' || !project.projectId) throw toolError('PXD_PROJECT_INVALID');
      const stamp = project.manifest?.toolProject;
      let prepared = project;
      if (stamp === undefined) {
        if (expectedRevisionId !== null) assertOwned(project, tool);
        const existing = await rawStore.load(project.projectId);
        if (existing) assertOwned(existing, tool);
        prepared = { ...project, manifest: { ...project.manifest, toolProject: ownStamp(tool) } };
      } else assertOwned(project, tool);
      if (expectedRevisionId !== null) {
        const current = await rawStore.load(project.projectId);
        assertOwned(current, tool);
        const expected = await rawStore.load(project.projectId, expectedRevisionId);
        assertOwned(expected, tool);
      }
      const saved = await rawStore.save(prepared, { expectedRevisionId }); remember(saved); return saved;
    },
    async listProjects(options = {}) { return onlyOwned(options); },
    async deleteProject(projectId, { expectedRevisionId } = {}) {
      const project = await rawStore.load(projectId, expectedRevisionId);
      if (!project) throw toolError('PXD_PROJECT_NOT_FOUND', '作品が見つかりません。');
      assertOwned(project, tool); remember(project);
      return rawStore.deleteProject(projectId, { expectedRevisionId });
    },
    async restoreProject(projectId, { expectedRevisionId } = {}) {
      const project = await readDeleted(projectId, expectedRevisionId);
      if (!project) throw toolError('PXD_TOOL_PROJECT_FOREIGN', 'この削除済み作品がこの制作ツールのものだと確認できません。');
      assertOwned(project, tool);
      const restored = await rawStore.restoreProject(projectId, { expectedRevisionId });
      ownershipCache.set(projectId, { ...project, revisionId: restored.revisionId }); return restored;
    },
    async listImportSources() {
      const result = await rawStore.listProjects(); const projects = []; const errors = [...(result.errors ?? [])];
      for (const item of result.projects ?? []) {
        const stamp = summaryStamp(item);
        if (stamp && stamp.schemaVersion === 1 && stamp.tool !== tool) { projects.push(item); continue; }
        if (stamp && stamp.schemaVersion !== 1) { projects.push(item); continue; }
        try { if (!(await inspectRecord(item))) projects.push(item); }
        catch (error) { errors.push({ projectId: item.projectId, revisionId: item.revisionId, code: error?.code || 'PXD_STORE_RECORD_INVALID' }); }
      }
      return { projects, errors };
    },
    async loadImportSource(projectId, revisionId) {
      return rawStore.load(projectId, revisionId);
    },
    cloneAsToolProject(source, copyOptions = {}) {
      const configuredNow = typeof options.now === 'function' ? options.now() : options.now;
      const now = copyOptions.now ?? configuredNow ?? Date.now();
      return cloneAsToolProject(source, tool, {
        ...copyOptions,
        projectId: copyOptions.projectId ?? options.projectIdFactory?.(tool, source) ?? randomId('tool-project'),
        revisionId: copyOptions.revisionId ?? options.revisionIdFactory?.(tool, source) ?? randomId('tool-revision'),
        now
      });
    }
  };
}
