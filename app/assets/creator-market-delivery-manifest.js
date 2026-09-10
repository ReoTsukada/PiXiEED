(() => {
  "use strict";

  const SCHEMA_VERSION = 1;
  const MAX_MANIFEST_BYTES = 32 * 1024;
  const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
  const MAX_ENTRIES = 100;
  const MAX_DEPENDENCIES = 200;
  const MAX_ENTRY_DEPENDENCIES = 32;
  const MAX_LABELS = 12;
  const MAX_STRING = 240;
  const MAX_LABEL = 160;
  const SOURCE_KINDS = new Set(["DRAW", "AUDIO", "GAME", "WRITING", "VISUAL", "EXTERNAL"]);
  const SELECTION_KINDS = new Set(["PROJECT", "DOCUMENT", "LAYER", "ANIMATION", "FRAME_RANGE", "TRACK", "CLIP", "TICK_RANGE", "SCENE", "OBJECT", "CONTENT", "FILE"]);
  const MANIFEST_KINDS = new Set(["WHOLE_PROJECT", "TOOL_SET", "SELECTED_SET", "EXTERNAL_BUNDLE", "MIXED_BUNDLE"]);
  const ORIGIN_KINDS = new Set(["LOCAL_PROJECT", "MARKET_ASSET", "EXTERNAL_FILE"]);
  const RIGHTS_STATUSES = new Set(["CREATOR_DECLARATION_REQUIRED", "SERVER_VERIFICATION_REQUIRED"]);
  const FORBIDDEN_KEYS = new Set(["raw", "rawbytes", "bytes", "blob", "data", "dataurl", "token", "payment", "license", "licensebody"]);

  const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const boundedString = (value, maximum = MAX_STRING) => {
    if (typeof value !== "string" && typeof value !== "number") return null;
    const normalized = String(value).normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    return normalized ? normalized.slice(0, maximum) : null;
  };
  const boundedId = (value, fallback = "") => {
    const normalized = boundedString(value, 120) || boundedString(fallback, 120);
    return normalized ? normalized.replace(/[^a-zA-Z0-9._:-]/g, "_") : null;
  };
  const uniqueStrings = (values, limit, maximum = MAX_STRING) => [...new Set(
    (Array.isArray(values) ? values : []).map((value) => boundedString(value, maximum)).filter(Boolean),
  )].slice(0, limit);

  const containsForbiddenValue = (value, depth = 0, visited = new Set()) => {
    if (depth > 6) return true;
    if (!value || typeof value !== "object") return false;
    if (typeof Blob === "function" && value instanceof Blob) return true;
    if (typeof ArrayBuffer === "function" && (value instanceof ArrayBuffer || ArrayBuffer.isView(value))) return true;
    if (visited.has(value)) return true;
    visited.add(value);
    if (Array.isArray(value)) return value.some((item) => containsForbiddenValue(item, depth + 1, visited));
    return Object.entries(value).some(([key, item]) => (
      FORBIDDEN_KEYS.has(key.replace(/[_-]/g, "").toLowerCase())
      || containsForbiddenValue(item, depth + 1, visited)
    ));
  };

  const normalizeSource = (source) => {
    if (!isRecord(source)) return null;
    const normalized = {};
    for (const key of ["projectId", "assetId", "revisionId", "contentHash", "packageHash", "path", "fileName", "mimeType"]) {
      const value = boundedString(source[key], key === "path" ? 180 : 160);
      if (value && !/^(?:data:|blob:)/i.test(value)) normalized[key] = value;
    }
    if (source.byteLength !== undefined) {
      const byteLength = Number(source.byteLength);
      if (!Number.isSafeInteger(byteLength) || byteLength < 0 || byteLength > MAX_TOTAL_BYTES) return null;
      normalized.byteLength = byteLength;
    }
    return normalized;
  };

  const normalizeLocator = (value) => {
    if (typeof value === "string") return boundedString(value, 180);
    if (!isRecord(value)) return null;
    const normalized = {};
    for (const [key, item] of Object.entries(value).slice(0, 8)) {
      const safeKey = boundedString(key, 48);
      const safeValue = typeof item === "number" && Number.isFinite(item)
        ? item
        : boundedString(item, 120);
      if (safeKey && safeValue !== null) normalized[safeKey] = safeValue;
    }
    return Object.keys(normalized).length ? normalized : null;
  };

  const normalizeProvenance = (provenance, sourceKind, source) => {
    const value = isRecord(provenance) ? provenance : {};
    const inferredOrigin = source.projectId
      ? "LOCAL_PROJECT"
      : source.assetId
        ? "MARKET_ASSET"
        : sourceKind === "EXTERNAL"
          ? "EXTERNAL_FILE"
          : null;
    const originKind = boundedString(value.originKind, 40) || inferredOrigin;
    const rightsStatus = boundedString(value.rightsStatus, 48)
      || (originKind === "MARKET_ASSET" ? "SERVER_VERIFICATION_REQUIRED" : "CREATOR_DECLARATION_REQUIRED");
    if (!ORIGIN_KINDS.has(originKind) || !RIGHTS_STATUSES.has(rightsStatus)) return null;
    if (originKind === "LOCAL_PROJECT" && !source.projectId) return null;
    if (originKind === "MARKET_ASSET" && (!source.assetId || rightsStatus !== "SERVER_VERIFICATION_REQUIRED")) return null;
    if (originKind === "EXTERNAL_FILE" && !source.path && !source.fileName) return null;
    const note = boundedString(value.note, MAX_LABEL);
    return { originKind, rightsStatus, ...(note ? { note } : {}) };
  };

  const normalizeEntry = (entry, index) => {
    if (!isRecord(entry) || !isRecord(entry.selection)) return null;
    const entryId = boundedId(entry.entryId, `entry-${index + 1}`);
    const sourceKind = boundedString(entry.sourceKind, 24)?.toUpperCase();
    const selectionKind = boundedString(entry.selection.kind, 24)?.toUpperCase();
    const source = normalizeSource(entry.source);
    if (!entryId || !SOURCE_KINDS.has(sourceKind) || !SELECTION_KINDS.has(selectionKind) || !source) return null;
    const provenance = normalizeProvenance(entry.provenance, sourceKind, source);
    if (!provenance) return null;
    const capabilities = {};
    if (isRecord(entry.capabilities)) {
      for (const key of ["editable", "animation"]) {
        if (typeof entry.capabilities[key] === "boolean") capabilities[key] = entry.capabilities[key];
      }
      const targets = uniqueStrings(entry.capabilities.targets, 16, 64);
      if (targets.length) capabilities.targets = targets;
    }
    const label = boundedString(entry.selection.label, MAX_LABEL);
    const locator = normalizeLocator(entry.selection.locator);
    return {
      entryId,
      sourceKind,
      source,
      selection: { kind: selectionKind, ...(label ? { label } : {}), ...(locator !== null ? { locator } : {}) },
      provenance,
      capabilities,
      dependencyIds: uniqueStrings(entry.dependencyIds, MAX_ENTRY_DEPENDENCIES, 120).map((value) => boundedId(value)).filter(Boolean),
    };
  };

  const normalize = (manifest) => {
    let input = manifest;
    if (typeof input === "string") {
      if (input.length > MAX_MANIFEST_BYTES) return null;
      try { input = JSON.parse(input); } catch (_error) { return null; }
    }
    if (!isRecord(input) || containsForbiddenValue(input)) return null;
    if (Number(input.schemaVersion) !== SCHEMA_VERSION || !MANIFEST_KINDS.has(input.selectionKind)) return null;
    const manifestId = boundedId(input.manifestId);
    const createdAt = boundedString(input.createdAt, 64);
    if (!manifestId || !createdAt || Number.isNaN(Date.parse(createdAt))) return null;
    if (!Array.isArray(input.entries) || input.entries.length < 1 || input.entries.length > MAX_ENTRIES) return null;
    const entries = input.entries.map(normalizeEntry);
    if (entries.some((entry) => !entry)) return null;
    const entryIds = new Set(entries.map((entry) => entry.entryId));
    if (entryIds.size !== entries.length) return null;
    const statedBytes = entries.reduce((total, entry) => total + (entry.source.byteLength || 0), 0);
    if (statedBytes > MAX_TOTAL_BYTES) return null;

    let project = null;
    if (input.project !== null && input.project !== undefined) {
      if (!isRecord(input.project)) return null;
      const projectId = boundedId(input.project.projectId);
      if (!projectId) return null;
      const revisionId = boundedString(input.project.revisionId, 120);
      const name = boundedString(input.project.name, MAX_LABEL);
      project = { projectId, ...(revisionId ? { revisionId } : {}), ...(name ? { name } : {}) };
    }

    if (!Array.isArray(input.dependencies) || input.dependencies.length > MAX_DEPENDENCIES) return null;
    const dependencies = input.dependencies.map((dependency, index) => {
      if (!isRecord(dependency)) return null;
      const dependencyId = boundedId(dependency.dependencyId, `dependency-${index + 1}`);
      const entryId = boundedId(dependency.entryId);
      const reason = boundedString(dependency.reason, MAX_LABEL);
      if (!dependencyId || !entryId || !entryIds.has(entryId) || typeof dependency.required !== "boolean") return null;
      return { dependencyId, entryId, required: dependency.required, ...(reason ? { reason } : {}) };
    });
    if (dependencies.some((dependency) => !dependency)) return null;
    const dependencyIds = new Set(dependencies.map((dependency) => dependency.dependencyId));
    if (dependencyIds.size !== dependencies.length) return null;
    if (entries.some((entry) => entry.dependencyIds.some((dependencyId) => !dependencyIds.has(dependencyId)))) return null;
    if (dependencies.some((dependency) => !entries.some((entry) => entry.entryId === dependency.entryId && entry.dependencyIds.includes(dependency.dependencyId)))) return null;

    const requestedLabels = isRecord(input.summary) ? input.summary.labels : [];
    const labels = uniqueStrings([
      ...(Array.isArray(requestedLabels) ? requestedLabels : []),
      ...entries.map((entry) => entry.selection.label).filter(Boolean),
    ], MAX_LABELS, 100);
    const normalized = {
      schemaVersion: SCHEMA_VERSION,
      manifestId,
      selectionKind: input.selectionKind,
      project,
      entries,
      dependencies,
      summary: {
        entryCount: entries.length,
        sourceKinds: [...new Set(entries.map((entry) => entry.sourceKind))],
        labels,
      },
      createdAt,
    };
    return new TextEncoder().encode(JSON.stringify(normalized)).byteLength <= MAX_MANIFEST_BYTES ? normalized : null;
  };

  const createManifest = (input = {}) => {
    const value = isRecord(input) ? input : {};
    const entries = Array.isArray(value.entries) ? value.entries : [];
    const sourceKinds = new Set(entries.map((entry) => boundedString(entry?.sourceKind, 24)?.toUpperCase()).filter(Boolean));
    const inferredSelectionKind = sourceKinds.has("EXTERNAL") && sourceKinds.size > 1
      ? "MIXED_BUNDLE"
      : sourceKinds.size === 1 && sourceKinds.has("EXTERNAL")
        ? "EXTERNAL_BUNDLE"
        : value.project
          ? "TOOL_SET"
          : "SELECTED_SET";
    const normalized = normalize({
      ...value,
      schemaVersion: SCHEMA_VERSION,
      manifestId: value.manifestId || `manifest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
      selectionKind: MANIFEST_KINDS.has(value.selectionKind) ? value.selectionKind : inferredSelectionKind,
      project: value.project || null,
      dependencies: Array.isArray(value.dependencies) ? value.dependencies : [],
      createdAt: value.createdAt || new Date().toISOString(),
    });
    if (!normalized) throw new Error("販売内容manifestが固定契約または上限を満たしていません");
    return normalized;
  };

  const summarize = (manifest) => {
    const value = normalize(manifest);
    if (!value) return "";
    const projectLabel = value.project?.name || value.project?.projectId || "外部ファイル";
    const itemLabels = value.entries.map((entry) => entry.selection.label).filter(Boolean).slice(0, 3);
    const sourceKinds = value.summary.sourceKinds.join("＋");
    return `${projectLabel} · ${value.entries.length}件${itemLabels.length ? ` · ${itemLabels.join("、")}${value.entries.length > itemLabels.length ? " ほか" : ""}` : ""}${sourceKinds ? ` · ${sourceKinds}` : ""}`;
  };

  window.PiXiEEDCreatorMarketDeliveryManifest = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    limits: Object.freeze({
      manifestBytes: MAX_MANIFEST_BYTES,
      totalBytes: MAX_TOTAL_BYTES,
      entries: MAX_ENTRIES,
      dependencies: MAX_DEPENDENCIES,
      string: MAX_STRING,
    }),
    normalize,
    createManifest,
    summarize,
  });
})();
