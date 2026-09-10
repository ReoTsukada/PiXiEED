(() => {
  "use strict";

  const KEY = "pixieed:writing-studio:v1";
  const CONTENT_SCHEMA_VERSION = 1;
  const NODE_TYPES = [
    "CHARACTER",
    "LOCATION",
    "FACTION",
    "ITEM",
    "EVENT",
    "CONCEPT",
  ];
  const EDGE_RELATIONS = [
    "KNOWS",
    "LOCATED_IN",
    "PART_OF",
    "CAUSES",
    "CUSTOM",
  ];
  const projectStore = window.PiXiEEDCreatorProjectStore;
  const projectContext = projectStore && typeof projectStore.context === "function"
    ? projectStore.context()
    : { projectId: "local-project", projectName: "無題のProject" };
  let projectMissing = projectContext.projectExists === false;
  const projectId = projectContext.projectId;
  const projectKey = `${KEY}:${projectId}`;
  const now = () => new Date().toISOString();
  const id = (prefix) =>
    `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const isRecord = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const text = (value, fallback = "", max = 2_000_000) => {
    const result = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "");
    return result.trim().length > 0 ? result.slice(0, max) : fallback;
  };
  const clone = (value) => {
    try { return JSON.parse(JSON.stringify(value)); } catch (_error) { return null; }
  };

  const starter = () => ({
    schemaVersion: 1,
    id: id("novel"),
    title: "星渡りの記録",
    contentKind: "NOVEL",
    project: { projectId: "writing-local", role: "PRIMARY" },
    revision: { revisionId: id("rev"), revisionNumber: 1, contentHash: "" },
    provenance: {
      createdBy: "local-user",
      createdAt: now(),
      updatedAt: now(),
    },
    rights: {
      licenseId: "local-unconnected",
      ownerId: "local-user",
      permissions: ["PERSONAL_USE"],
      attributionRequired: false,
      allowCommercialUse: false,
      allowDerivativeWorks: false,
    },
    references: [],
    synopsis: "海辺の灯台から始まる、星と記憶の物語。",
    chapters: [{
      id: id("chapter"),
      title: "第一章　海辺の灯台",
      order: 1,
      text: {
        format: "MARKDOWN",
        language: "ja",
        body: "灯台の光が、まだ誰も知らない海の向こうを照らしていた。\n\nここから物語を書き始めます。",
      },
      references: [],
    }],
    nodes: [{
      id: id("node"),
      title: "海辺の灯台",
      nodeType: "LOCATION",
      summary: "星を観測する古い灯台",
      description: "岬の先に建つ、物語の起点。",
      references: [],
    }],
    edges: [],
  });

  const normalizeReference = (reference) => {
    if (!isRecord(reference)) return null;
    const canonicalKind = text(reference.mediaKind, "", 32).toUpperCase();
    const sourceAssetId = text(
      reference.sourceAssetId || reference.assetPackageId || reference.contentId,
      "",
      256,
    );
    const sourceProjectId = text(reference.sourceProjectId, projectId, 256);
    const kind = canonicalKind || text(reference.kind, "ASSET", 32).toUpperCase();
    if (!sourceAssetId) return null;
    return {
      refId: text(reference.refId, `ref:${sourceAssetId}`, 256),
      kind,
      label: text(reference.label, "参照素材", 160),
      sourceProjectId,
      sourceAssetId,
      ...(text(reference.revisionId, "", 256)
        ? { revisionId: text(reference.revisionId, "", 256) }
        : {}),
      ...(text(reference.contentHash, "", 128)
        ? { contentHash: text(reference.contentHash, "", 128) }
        : {}),
    };
  };
  const normalizeReferences = (value) =>
    Array.isArray(value)
      ? value.map(normalizeReference).filter(Boolean)
      : [];

  const aggregateNodes = (value) => {
    const aggregate = isRecord(value?.contentAggregate)
      ? value.contentAggregate
      : null;
    const records = Array.isArray(value?.nodes)
      ? value.nodes
      : Array.isArray(aggregate?.worldNodes)
      ? aggregate.worldNodes
      : [];
    return records.map((node) => ({
      id: text(node?.id, id("node"), 128),
      title: text(node?.title, "無題", 160),
      nodeType: NODE_TYPES.includes(node?.nodeType) ? node.nodeType : "CONCEPT",
      summary: text(node?.summary, "", 2_000_000),
      description: text(
        isRecord(node?.description) ? node.description.body : node?.description,
        "",
        2_000_000,
      ),
      references: normalizeReferences(node?.references),
    }));
  };
  const aggregateEdges = (value) => {
    const aggregate = isRecord(value?.contentAggregate)
      ? value.contentAggregate
      : null;
    const records = Array.isArray(value?.edges)
      ? value.edges
      : Array.isArray(aggregate?.worldEdges)
      ? aggregate.worldEdges
      : [];
    return records.map((edge) => ({
      id: text(edge?.id, id("edge"), 128),
      title: text(edge?.title, "新しい関係", 160),
      fromNodeId: text(edge?.fromNodeId, "", 128),
      toNodeId: text(edge?.toNodeId, "", 128),
      relation: EDGE_RELATIONS.includes(edge?.relation) ? edge.relation : "CUSTOM",
      ...(text(edge?.customRelation, "", 128)
        ? { customRelation: text(edge.customRelation, "", 128) }
        : {}),
      description: text(edge?.description, "", 2_000_000),
    }));
  };
  const normalizeWork = (candidate) => {
    const base = starter();
    const value = isRecord(candidate) ? candidate : {};
    const chapters = Array.isArray(value.chapters)
      ? value.chapters.map((chapter, index) => ({
        id: text(chapter?.id, id("chapter"), 128),
        title: text(chapter?.title, `第${index + 1}章`, 160),
        order: Number.isSafeInteger(chapter?.order) ? chapter.order : index + 1,
        text: {
          format: chapter?.text?.format === "PLAIN_TEXT" ? "PLAIN_TEXT" : "MARKDOWN",
          language: /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})?$/.test(chapter?.text?.language || "")
            ? chapter.text.language
            : "ja",
          body: text(chapter?.text?.body, "", 2_000_000),
        },
        references: normalizeReferences(chapter?.references),
      }))
      : base.chapters;
    const nodes = aggregateNodes(value);
    const hasExplicitNodes = Array.isArray(value.nodes) ||
      (isRecord(value.contentAggregate) && Array.isArray(value.contentAggregate.worldNodes));
    const edges = aggregateEdges(value);
    const revision = isRecord(value.revision) ? value.revision : base.revision;
    const provenance = isRecord(value.provenance) ? value.provenance : base.provenance;
    return {
      ...base,
      ...value,
      schemaVersion: 1,
      contentKind: "NOVEL",
      id: text(value.id, base.id, 128),
      title: text(value.title, base.title, 160),
      revision: {
        ...base.revision,
        ...revision,
        revisionId: text(revision.revisionId, base.revision.revisionId, 128),
        revisionNumber: Math.max(1, Number(revision.revisionNumber) || 1),
      },
      provenance: {
        ...base.provenance,
        ...provenance,
        createdBy: text(provenance.createdBy, base.provenance.createdBy, 128),
        createdAt: text(provenance.createdAt, base.provenance.createdAt, 64),
        updatedAt: text(provenance.updatedAt, base.provenance.updatedAt, 64),
      },
      references: normalizeReferences(value.references),
      synopsis: text(value.synopsis, base.synopsis, 2_000_000),
      chapters,
      nodes: hasExplicitNodes ? nodes : base.nodes,
      edges: edges.filter((edge) => edge.fromNodeId && edge.toNodeId),
    };
  };

  const canonicalize = (value, omitHash = false) => {
    if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(",")}]`;
    if (isRecord(value)) {
      return `{${Object.keys(value)
        .filter((key) => !(omitHash && key === "contentHash"))
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], omitHash && key === "revision")}`)
        .join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
  };
  const fnv1a64 = (value) => {
    let hash = 0xcbf29ce484222325n;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= BigInt(value.charCodeAt(index));
      hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }
    return hash.toString(16).padStart(16, "0");
  };
  const contentHash = (document) =>
    `fnv1a64:${fnv1a64(canonicalize(document, true))}`;
  const canonicalId = (value, fallback) => {
    const normalized = text(value, fallback, 128).replace(/[^A-Za-z0-9._:-]/g, "-");
    return /^[A-Za-z0-9]/.test(normalized) ? normalized : fallback;
  };
  const canonicalRights = (value) => {
    const rights = isRecord(value) ? value : {};
    const permissions = Array.isArray(rights.permissions)
      ? [...new Set(rights.permissions.filter((item) =>
        ["PERSONAL_USE", "COMMERCIAL_USE", "DERIVATIVE_WORKS", "REDISTRIBUTION", "RESALE"].includes(item)
      ))]
      : ["PERSONAL_USE"];
    return {
      licenseId: canonicalId(rights.licenseId, "local-unconnected"),
      ownerId: canonicalId(rights.ownerId, "local-user"),
      permissions: permissions.length > 0 ? permissions.sort() : ["PERSONAL_USE"],
      attributionRequired: rights.attributionRequired === true,
      allowCommercialUse: permissions.includes("COMMERCIAL_USE"),
      allowDerivativeWorks: permissions.includes("DERIVATIVE_WORKS"),
    };
  };
  const canonicalReference = (reference) => {
    const normalized = normalizeReference(reference);
    if (!normalized) return null;
    const kind = normalized.kind === "AUDIO"
      ? "AUDIO"
      : normalized.kind === "GAME"
      ? "GAME"
      : normalized.kind === "VIDEO"
      ? "VIDEO"
      : "IMAGE";
    const sourceKey = canonicalId(
      `${normalized.sourceProjectId}:${normalized.sourceAssetId}`,
      "local-media",
    );
    const revisionId = canonicalId(normalized.revisionId, "");
    const hash = /^fnv1a64:[0-9a-f]{16}$/.test(normalized.contentHash || "")
      ? normalized.contentHash
      : "";
    if (!revisionId || !hash) return null;
    return {
      kind: "MEDIA",
      mediaKind: kind,
      contentId: canonicalId(`media:${sourceKey}`, "media-local"),
      revisionId,
      contentHash: hash,
      relation: kind === "AUDIO" ? "SOUNDSCAPES"
        : kind === "GAME" ? "EMBEDDED_GAMEPLAY" : "ILLUSTRATES",
    };
  };
  const verifiedReferences = (references) => {
    const seen = new Set();
    return normalizeReferences(references).map((reference) => {
      const revisionId = canonicalId(reference.revisionId, "");
      const contentHash = /^fnv1a64:[0-9a-f]{16}$/.test(reference.contentHash || "")
        ? reference.contentHash
        : "";
      if (!revisionId || !contentHash) return null;
      return { ...reference, revisionId, contentHash };
    }).filter((reference) => {
      if (!reference) return false;
      const key = `${reference.kind}:${reference.sourceProjectId}:${reference.sourceAssetId}:${reference.revisionId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const sanitizeSnapshotReferences = (snapshot) => {
    snapshot.references = verifiedReferences(snapshot.references);
    snapshot.chapters = (snapshot.chapters || []).map((chapter) => ({
      ...chapter,
      references: verifiedReferences(chapter.references),
    }));
    snapshot.nodes = (snapshot.nodes || []).map((node) => ({
      ...node,
      references: verifiedReferences(node.references),
    }));
    return snapshot;
  };
  const canonicalReferences = (references) => {
    const seen = new Set();
    return normalizeReferences(references).map(canonicalReference).filter((reference) => {
      if (!reference) return false;
      const key = `${reference.mediaKind}:${reference.contentId}:${reference.revisionId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const documentBase = (snapshot, documentId, title, contentKind, role) => ({
    schemaVersion: CONTENT_SCHEMA_VERSION,
    id: canonicalId(documentId, id("content")),
    title: text(title, "無題", 160),
    contentKind,
    project: { projectId: canonicalId(projectId, "local-project"), role },
    revision: {
      revisionId: canonicalId(snapshot.revision?.revisionId, id("revision")),
      revisionNumber: Math.max(1, Number(snapshot.revision?.revisionNumber) || 1),
      contentHash: "",
    },
    provenance: {
      createdBy: canonicalId(snapshot.provenance?.createdBy, "local-user"),
      createdAt: text(snapshot.provenance?.createdAt, now(), 64),
      updatedAt: text(snapshot.provenance?.updatedAt, now(), 64),
    },
    rights: canonicalRights(snapshot.rights),
  });
  const withDocumentHash = (document) => ({
    ...document,
    revision: { ...document.revision, contentHash: contentHash(document) },
  });
  const buildContentAggregate = (snapshot) => {
    const novel = documentBase(snapshot, snapshot.id, snapshot.title, "NOVEL", "PRIMARY");
    const novelDocument = withDocumentHash({
      ...novel,
      references: canonicalReferences(snapshot.references),
      synopsis: text(snapshot.synopsis, "未設定", 2_000_000),
      chapters: (snapshot.chapters || []).map((chapter, index) => ({
        id: canonicalId(chapter.id, `chapter-${index + 1}`),
        title: text(chapter.title, `第${index + 1}章`, 160),
        order: Number.isSafeInteger(chapter.order) ? chapter.order : index + 1,
        text: {
          format: chapter.text?.format === "PLAIN_TEXT" ? "PLAIN_TEXT" : "MARKDOWN",
          body: text(chapter.text?.body, " ", 2_000_000),
          language: /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})?$/.test(chapter.text?.language || "ja")
            ? chapter.text.language || "ja"
            : "ja",
        },
        references: canonicalReferences(chapter.references),
      })),
    });
    const nodes = (snapshot.nodes || []).map((node, index) => withDocumentHash({
      ...documentBase(snapshot, node.id || `node-${index + 1}`, node.title, "WORLD_NODE", "WORLD_CONTEXT"),
      references: canonicalReferences(node.references),
      nodeType: NODE_TYPES.includes(node.nodeType) ? node.nodeType : "CONCEPT",
      summary: text(node.summary, "未設定", 2_000_000),
      description: {
        format: "MARKDOWN",
        language: "ja",
        body: text(node.description, "未設定", 2_000_000),
      },
    }));
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = (snapshot.edges || [])
      .filter((edge) => nodeIds.has(canonicalId(edge.fromNodeId, "")) && nodeIds.has(canonicalId(edge.toNodeId, "")))
      .filter((edge) => canonicalId(edge.fromNodeId, "") !== canonicalId(edge.toNodeId, ""))
      .map((edge, index) => withDocumentHash({
        ...documentBase(snapshot, edge.id || `edge-${index + 1}`, edge.title, "WORLD_EDGE", "WORLD_CONTEXT"),
        references: [],
        fromNodeId: canonicalId(edge.fromNodeId, "node-missing"),
        toNodeId: canonicalId(edge.toNodeId, "node-missing"),
        relation: EDGE_RELATIONS.includes(edge.relation) ? edge.relation : "CUSTOM",
        ...(edge.relation === "CUSTOM" && text(edge.customRelation, "", 128)
          ? { customRelation: text(edge.customRelation, "", 128) }
          : {}),
        ...(text(edge.description, "", 2_000_000)
          ? { description: text(edge.description, "", 2_000_000) }
          : {}),
      }));
    return {
      schemaVersion: CONTENT_SCHEMA_VERSION,
      novel: novelDocument,
      worldNodes: nodes,
      worldEdges: edges,
    };
  };

  let data;
  try {
    const linked = projectStore && typeof projectStore.get === "function"
      ? projectStore.get(projectId)
      : null;
    const linkedWriting = linked?.modules?.writing;
    const legacy = JSON.parse(
      localStorage.getItem(projectKey) || localStorage.getItem(KEY) || "null",
    );
    data = linkedWriting?.contentKind === "NOVEL"
      ? normalizeWork(linkedWriting)
      : legacy?.contentKind === "NOVEL"
      ? normalizeWork(legacy)
      : starter();
  } catch (_error) {
    data = starter();
  }
  data.project = { ...(data.project || {}), projectId, role: "PRIMARY" };
  let selectedChapter = 0;
  let selectedNode = 0;
  let activePanel = "manuscript";
  let toastTimer;
  let autoSaveTimer;
  const $ = (selector) => document.querySelector(selector);
  const toast = (message) => {
    const element = $("#toast");
    if (!element) return;
    element.textContent = message;
    element.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => element.classList.remove("is-visible"), 1800);
  };
  const touch = () => {
    if (projectMissing) return;
    data.provenance.updatedAt = now();
    data.revision.revisionNumber = Math.max(1, data.revision.revisionNumber + 1);
    data.revision.revisionId = id("rev");
    const saveState = $("#saveState");
    if (saveState) saveState.textContent = "変更を自動保存します…";
    window.clearTimeout(autoSaveTimer);
    autoSaveTimer = window.setTimeout(() => save(), 900);
  };
  const referenceTarget = () => {
    if (activePanel === "world" && data.nodes?.[selectedNode]) {
      data.nodes[selectedNode].references = Array.isArray(data.nodes[selectedNode].references)
        ? data.nodes[selectedNode].references
        : [];
      return data.nodes[selectedNode].references;
    }
    if (!data.chapters?.[selectedChapter]) return [];
    data.chapters[selectedChapter].references = Array.isArray(data.chapters[selectedChapter].references)
      ? data.chapters[selectedChapter].references
      : [];
    return data.chapters[selectedChapter].references;
  };
  const referenceKey = (reference) =>
    [reference.kind, reference.sourceProjectId, reference.sourceAssetId]
      .map((value) => String(value || "")).join("|");
  const availableReferences = () => {
    const project = projectStore && typeof projectStore.get === "function"
      ? projectStore.get(projectId)
      : null;
    const visualAssets = project?.modules?.visual?.assets;
    const visual = Array.isArray(visualAssets)
      ? visualAssets.map((asset) => ({
        refId: `visual:${asset.id}`,
        kind: String(asset.kind || "image").toUpperCase() === "VIDEO" ? "VIDEO" : "IMAGE",
        label: text(asset.name, "Visual Asset", 160),
        sourceProjectId: projectId,
        sourceAssetId: text(asset.id, "", 256),
        ...(text(asset.revisionId, "", 256) ? { revisionId: text(asset.revisionId, "", 256) } : {}),
        ...(text(asset.contentHash, "", 128) ? { contentHash: text(asset.contentHash, "", 128) } : {}),
      })).filter((asset) => asset.sourceAssetId
        && Boolean(canonicalId(asset.revisionId, ""))
        && /^fnv1a64:[0-9a-f]{16}$/.test(asset.contentHash || ""))
      : [];
    const bindings = Array.isArray(project?.bindings)
      ? project.bindings.map((binding) => ({
        refId: `binding:${binding.assetId || binding.trackId}`,
        kind: String(binding.kind || "ASSET"),
        label: text(binding.label || binding.assetId, "Project Asset", 160),
        sourceProjectId: projectId,
        sourceAssetId: text(binding.assetId, "", 256),
        ...(text(binding.revisionId, "", 256) ? { revisionId: text(binding.revisionId, "", 256) } : {}),
        ...(text(binding.contentHash, "", 128) ? { contentHash: text(binding.contentHash, "", 128) } : {}),
      })).filter((asset) => asset.sourceAssetId
        && Boolean(canonicalId(asset.revisionId, ""))
        && /^fnv1a64:[0-9a-f]{16}$/.test(asset.contentHash || ""))
      : [];
    return [...visual, ...bindings].filter((asset, index, all) =>
      all.findIndex((candidate) => referenceKey(candidate) === referenceKey(asset)) === index
    );
  };
  const renderReferences = () => {
    const host = $("#referenceList");
    if (!host) return;
    const target = referenceTarget();
    const attached = new Set(target.map(referenceKey));
    const heading = document.createElement("p");
    heading.className = "reference-empty";
    heading.textContent = activePanel === "world"
      ? "現在の世界観ノードへの参照"
      : "現在の章への参照";
    host.replaceChildren(heading);
    target.forEach((reference, index) => {
      const row = document.createElement("div");
      row.className = "reference-row";
      const copy = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = reference.label || "参照素材";
      const detail = document.createElement("small");
      detail.textContent = `${reference.kind || "ASSET"} · ${reference.sourceAssetId || "IDなし"}`;
      copy.append(title, detail);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "button";
      remove.textContent = "外す";
      remove.addEventListener("click", () => {
        target.splice(index, 1);
        touch();
        render();
      });
      row.append(copy, remove);
      host.append(row);
    });
    const candidates = availableReferences();
    if (!candidates.length) {
      const empty = document.createElement("p");
      empty.className = "reference-empty";
      empty.textContent = "保存済みのVisual素材またはProject Assetがありません。先に別の制作モードで保存してください。";
      host.append(empty);
      return;
    }
    candidates.forEach((candidate) => {
      if (attached.has(referenceKey(candidate))) return;
      const row = document.createElement("div");
      row.className = "reference-row";
      const copy = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = candidate.label;
      const detail = document.createElement("small");
      detail.textContent = `${candidate.kind} · 参照可能`;
      copy.append(title, detail);
      const add = document.createElement("button");
      add.type = "button";
      add.className = "button";
      add.textContent = "追加";
      add.addEventListener("click", () => {
        target.push({ ...candidate });
        touch();
        render();
      });
      row.append(copy, add);
      host.append(row);
    });
  };
  const renderChapters = () => {
    const host = $("#chapterPanel");
    if (!host) return;
    host.replaceChildren(...data.chapters.map((chapter, index) => {
      const button = document.createElement("button");
      button.className = `chapter${index === selectedChapter ? " is-active" : ""}`;
      button.type = "button";
      const number = document.createElement("span");
      number.className = "chapter-number";
      number.textContent = String(index + 1).padStart(2, "0");
      const title = document.createElement("span");
      title.textContent = chapter.title || "無題";
      button.append(number, title);
      button.addEventListener("click", () => {
        selectedChapter = index;
        render();
      });
      return button;
    }));
  };
  const renderNodes = () => {
    const host = $("#nodePanel");
    if (!host) return;
    if (!data.nodes.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "ノードはまだありません。";
      host.replaceChildren(empty);
      return;
    }
    host.replaceChildren(...data.nodes.map((node, index) => {
      const button = document.createElement("button");
      button.className = `node${index === selectedNode ? " is-active" : ""}`;
      button.type = "button";
      const title = document.createElement("span");
      title.textContent = node.title || "無題";
      const kind = document.createElement("small");
      kind.textContent = node.nodeType;
      button.append(title, kind);
      button.addEventListener("click", () => {
        selectedNode = index;
        render();
      });
      return button;
    }));
  };
  const field = (labelText, element) => {
    const label = document.createElement("label");
    label.textContent = labelText;
    label.append(element);
    return label;
  };
  const editorInput = (value, className = "text-input") => {
    const input = document.createElement("input");
    input.className = className;
    input.value = value || "";
    return input;
  };
  const editorTextarea = (value) => {
    const textarea = document.createElement("textarea");
    textarea.className = "small-textarea";
    textarea.value = value || "";
    return textarea;
  };
  const renderNodeEditor = () => {
    const host = $("#nodeEditor");
    const node = data.nodes[selectedNode];
    if (!host) return;
    const heading = document.createElement("h3");
    heading.textContent = "ノード編集";
    host.replaceChildren(heading);
    if (!node) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "左の「ノードを追加」から作成してください。";
      host.append(empty);
      return;
    }
    const title = editorInput(node.title);
    const type = document.createElement("select");
    type.className = "text-input";
    NODE_TYPES.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      option.selected = value === node.nodeType;
      type.append(option);
    });
    const summary = editorTextarea(node.summary);
    const description = editorTextarea(node.description);
    title.addEventListener("input", () => { node.title = title.value; touch(); renderNodes(); });
    type.addEventListener("change", () => { node.nodeType = type.value; touch(); renderNodes(); });
    summary.addEventListener("input", () => { node.summary = summary.value; touch(); });
    description.addEventListener("input", () => { node.description = description.value; touch(); });
    host.append(
      field("名称", title),
      field("種類", type),
      field("概要", summary),
      field("説明", description),
    );
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button";
    remove.textContent = "このノードを削除";
    remove.addEventListener("click", () => {
      data.nodes.splice(selectedNode, 1);
      selectedNode = Math.max(0, selectedNode - 1);
      touch();
      render();
    });
    host.append(remove);
  };
  const renderEdges = () => {
    const host = $("#edgeEditor");
    if (!host) return;
    const heading = document.createElement("h3");
    heading.textContent = "関係";
    host.replaceChildren(heading);
    if (!data.edges.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "関係はまだありません。";
      host.append(empty);
      return;
    }
    data.edges.forEach((edge, index) => {
      const row = document.createElement("div");
      row.className = "edge-row";
      const select = (values, selected) => {
        const element = document.createElement("select");
        element.className = "text-input";
        values.forEach((value) => {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = value;
          option.selected = value === selected;
          element.append(option);
        });
        return element;
      };
      const from = select(data.nodes.map((node) => node.id), edge.fromNodeId);
      const relation = select(EDGE_RELATIONS, edge.relation);
      const to = select(data.nodes.map((node) => node.id), edge.toNodeId);
      from.addEventListener("change", () => { edge.fromNodeId = from.value; touch(); });
      relation.addEventListener("change", () => { edge.relation = relation.value; touch(); });
      to.addEventListener("change", () => { edge.toNodeId = to.value; touch(); });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "button";
      remove.textContent = "削除";
      remove.addEventListener("click", () => {
        data.edges.splice(index, 1);
        touch();
        renderEdges();
      });
      row.append(from, relation, to, remove);
      host.append(row);
    });
  };
  const renderRights = () => {
    const rights = canonicalRights(data.rights);
    $("#rightCommercial").checked = rights.permissions.includes("COMMERCIAL_USE");
    $("#rightDerivative").checked = rights.permissions.includes("DERIVATIVE_WORKS");
    $("#rightResale").checked = rights.permissions.includes("RESALE");
    $("#rightAttribution").checked = rights.attributionRequired;
  };
  const render = () => {
    selectedChapter = Math.max(0, Math.min(selectedChapter, data.chapters.length - 1));
    selectedNode = Math.max(0, Math.min(selectedNode, Math.max(0, data.nodes.length - 1)));
    const chapter = data.chapters[selectedChapter] || data.chapters[0];
    $("#workTitle").textContent = data.title;
    $("#workTitleInput").value = data.title;
    $("#synopsisInput").value = data.synopsis || "";
    $("#chapterTitle").textContent = chapter?.title || "章なし";
    $("#titleInput").value = chapter?.title || "";
    $("#bodyInput").value = chapter?.text?.body || "";
    $("#wordCount").textContent = `${(chapter?.text?.body || "").length}文字`;
    $("#chapterUpdated").textContent = `更新 ${new Date(data.provenance.updatedAt).toLocaleString("ja-JP")}`;
    renderChapters();
    renderNodes();
    renderNodeEditor();
    renderEdges();
    renderReferences();
    renderRights();
    $("#manuscriptPanel").classList.toggle("is-hidden", activePanel !== "manuscript");
    $("#worldPanel").classList.toggle("is-hidden", activePanel !== "world");
    $("#chapterPanel").classList.toggle("is-hidden", activePanel !== "manuscript");
    $("#nodePanel").classList.toggle("is-hidden", activePanel !== "world");
    $("#rightsPanel").classList.toggle("is-hidden", activePanel !== "rights");
    $("#addChapterButton").classList.toggle("is-hidden", activePanel !== "manuscript");
    $("#addNodeButton").classList.toggle("is-hidden", activePanel !== "world");
    document.querySelectorAll("[data-project-not-found]").forEach((element) => {
      element.hidden = !projectMissing;
    });
    document.querySelectorAll("input, textarea, button, select").forEach((element) => {
      element.disabled = projectMissing;
    });
  };
  const save = () => {
    window.clearTimeout(autoSaveTimer);
    if (projectMissing) {
      toast("Projectが見つからないため保存できません");
      return;
    }
    data.project = { ...(data.project || {}), projectId, role: "PRIMARY" };
    const snapshot = clone(data) || starter();
    snapshot.rights = canonicalRights(snapshot.rights);
    sanitizeSnapshotReferences(snapshot);
    const aggregate = buildContentAggregate(snapshot);
    snapshot.contentAggregate = aggregate;
    snapshot.revision = {
      ...(snapshot.revision || {}),
      contentHash: aggregate.novel.revision.contentHash,
    };
    data.rights = snapshot.rights;
    data.references = snapshot.references;
    data.chapters = snapshot.chapters;
    data.nodes = snapshot.nodes;
    data.revision = { ...(data.revision || {}), contentHash: snapshot.revision.contentHash };
    data.contentAggregate = aggregate;
    localStorage.setItem(projectKey, JSON.stringify(snapshot));
    localStorage.setItem(KEY, JSON.stringify(snapshot));
    if (projectStore && typeof projectStore.update === "function") {
      projectStore.update(projectId, (project) => ({
        ...project,
        name: data.title || project.name,
        modules: { ...(project.modules || {}), writing: snapshot },
      }));
    }
    $("#saveState").textContent = "保存済み";
    toast("Novel・世界観ドキュメントをProjectへ保存しました");
  };
  const download = (name, type, content) => {
    const anchor = document.createElement("a");
    const url = URL.createObjectURL(new Blob([content], { type }));
    anchor.href = url;
    anchor.download = text(name, "work", 160).replace(/[\\/:*?"<>|]/g, "_");
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  };
  const handoffToMarket = async () => {
    if (projectMissing) {
      toast("Projectが見つからないためMarketへ渡せません");
      return;
    }
    const transfer = window.PiXiEEDCreatorMarketTransfer;
    if (!transfer || typeof transfer.putFile !== "function") {
      toast("Marketへの引き渡し機能を読み込めませんでした");
      return;
    }
    save();
    const snapshot = clone(data) || starter();
    snapshot.contentAggregate = buildContentAggregate(snapshot);
    const filename = text(snapshot.title, "novel", 120)
      .replace(/[\\/:*?"<>|]/g, "_")
      .trim() || "novel";
    const file = new File(
      [JSON.stringify(snapshot, null, 2)],
      `${filename}.json`,
      { type: "application/json" },
    );
    const deliveryManifest = {
      schemaVersion: 1,
      manifestId: `writing:${projectId}:${snapshot.revision?.revisionId || snapshot.id}`,
      selectionKind: "TOOL_SET",
      project: {
        projectId,
        name: projectContext.projectName || snapshot.title,
        ...(snapshot.revision?.revisionId ? { revisionId: snapshot.revision.revisionId } : {}),
      },
      entries: [{
        entryId: `writing-content:${snapshot.id}`,
        sourceKind: "WRITING",
        source: {
          projectId,
          assetId: snapshot.id,
          revisionId: snapshot.revision?.revisionId,
          fileName: file.name,
          mimeType: file.type,
          byteLength: file.size,
          path: file.name,
        },
        selection: { kind: "CONTENT", label: "文章・世界観", locator: file.name },
        provenance: { originKind: "LOCAL_PROJECT", rightsStatus: "CREATOR_DECLARATION_REQUIRED" },
        capabilities: { editable: true, animation: false, targets: ["WRITING", "MARKET"] },
        dependencyIds: [],
      }],
      dependencies: [],
      summary: { entryCount: 1, sourceKinds: ["WRITING"], labels: ["文章・世界観"] },
      createdAt: snapshot.provenance?.updatedAt || now(),
    };
    const button = $("marketButton");
    if (button) button.disabled = true;
    try {
      const transferId = await transfer.putFile(file, {
        kind: "writing",
        projectId,
        path: file.name,
        deliveryManifest,
      });
      const url = new URL("../../market/sell.html", window.location.href);
      url.searchParams.set("project_transfer", transferId);
      window.location.assign(url.href);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Marketへの引き渡しに失敗しました");
      if (button) button.disabled = false;
    }
  };
  const markdown = () => `# ${data.title}\n\n${data.synopsis || ""}\n\n${data.chapters
    .map((chapter) => `## ${chapter.title}\n\n${chapter.text.body}`)
    .join("\n\n")}`;

  $("#saveButton").addEventListener("click", save);
  $("#marketButton").addEventListener("click", () => { void handoffToMarket(); });
  $("#bodyInput").addEventListener("input", (event) => {
    if (!data.chapters[selectedChapter]) return;
    data.chapters[selectedChapter].text.body = event.target.value;
    touch();
    $("#wordCount").textContent = `${event.target.value.length}文字`;
  });
  $("#titleInput").addEventListener("input", (event) => {
    if (!data.chapters[selectedChapter]) return;
    data.chapters[selectedChapter].title = event.target.value;
    touch();
    $("#chapterTitle").textContent = event.target.value;
    renderChapters();
  });
  $("#workTitleInput").addEventListener("input", (event) => {
    data.title = event.target.value.slice(0, 160);
    touch();
    $("#workTitle").textContent = data.title;
  });
  $("#synopsisInput").addEventListener("input", (event) => {
    data.synopsis = event.target.value;
    touch();
  });
  $("#addChapterButton").addEventListener("click", () => {
    data.chapters.push({
      id: id("chapter"),
      title: `第${data.chapters.length + 1}章`,
      order: data.chapters.length + 1,
      text: { format: "MARKDOWN", language: "ja", body: "" },
      references: [],
    });
    selectedChapter = data.chapters.length - 1;
    touch();
    render();
  });
  $("#addNodeButton").addEventListener("click", () => {
    data.nodes.push({
      id: id("node"),
      title: "新しいノード",
      nodeType: "CONCEPT",
      summary: "",
      description: "",
      references: [],
    });
    selectedNode = data.nodes.length - 1;
    touch();
    render();
  });
  $("#addEdgeButton").addEventListener("click", () => {
    if (data.nodes.length < 2) {
      toast("関係には2つ以上のノードが必要です");
      return;
    }
    data.edges.push({
      id: id("edge"),
      title: "新しい関係",
      fromNodeId: data.nodes[0].id,
      toNodeId: data.nodes[1].id,
      relation: "KNOWS",
      description: "",
    });
    touch();
    renderEdges();
  });
  [
    ["rightCommercial", "COMMERCIAL_USE", "allowCommercialUse"],
    ["rightDerivative", "DERIVATIVE_WORKS", "allowDerivativeWorks"],
    ["rightResale", "RESALE", null],
  ].forEach(([controlId, permission, flag]) => {
    $("#" + controlId).addEventListener("change", (event) => {
      const rights = canonicalRights(data.rights);
      const permissions = new Set(rights.permissions);
      if (event.target.checked) permissions.add(permission);
      else permissions.delete(permission);
      data.rights = {
        ...rights,
        permissions: [...permissions],
        ...(flag ? { [flag]: event.target.checked } : {}),
      };
      touch();
    });
  });
  $("#rightAttribution").addEventListener("change", (event) => {
    const rights = canonicalRights(data.rights);
    data.rights = { ...rights, attributionRequired: event.target.checked };
    touch();
  });
  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
    activePanel = tab.dataset.panel || "manuscript";
    document.querySelectorAll(".tab").forEach((candidate) =>
      candidate.classList.toggle("is-active", candidate === tab)
    );
    render();
  }));
  $("#exportButton").addEventListener("click", () => {
    const format = $("#exportFormat").value;
    if (format === "json") download(`${data.title || "work"}.json`, "application/json", JSON.stringify({ ...data, contentAggregate: buildContentAggregate(data) }, null, 2));
    if (format === "md") download(`${data.title || "work"}.md`, "text/markdown", markdown());
    if (format === "txt") download(`${data.title || "work"}.txt`, "text/plain", markdown().replace(/^#+ /gm, ""));
    toast("書き出しました");
  });
  $("#importButton").addEventListener("click", () => $("#fileInput").click());
  $("#fileInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const raw = await file.text();
      if (/\.json$/i.test(file.name)) {
        const imported = JSON.parse(raw);
        if (!imported || imported.contentKind !== "NOVEL") throw new Error("unsupported");
        data = normalizeWork(imported);
      } else {
        data = normalizeWork({
          ...starter(),
          title: file.name.replace(/\.(md|markdown|txt)$/i, ""),
          chapters: [{
            id: id("chapter"),
            title: "本文",
            order: 1,
            text: {
              format: /\.txt$/i.test(file.name) ? "PLAIN_TEXT" : "MARKDOWN",
              language: "ja",
              body: raw,
            },
            references: [],
          }],
        });
      }
      selectedChapter = 0;
      selectedNode = 0;
      touch();
      render();
      toast("Novelを読み込みました");
    } catch (_error) {
      toast("対応していない作品データです");
    }
    event.target.value = "";
  });
  $("#newWorkButton").addEventListener("click", () => {
    if (!window.confirm("現在のローカル作品を新規作品に置き換えますか？")) return;
    data = starter();
    data.project = { projectId, role: "PRIMARY" };
    selectedChapter = 0;
    selectedNode = 0;
    render();
    save();
  });
  render();
  if (projectMissing && projectStore && typeof projectStore.hydrateWorkspaceProject === "function") {
    projectStore.hydrateWorkspaceProject(projectId).then((project) => {
      if (!project) return;
      projectMissing = false;
      render();
      toast("Draw2のProjectを読み込みました");
    }).catch(() => {});
  }
})();
