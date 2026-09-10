(function () {
  "use strict";

  var STORAGE_KEY = "pixieed:creator-projects:v1";
  var ACTIVE_KEY = "pixieed:creator-project-active:v1";
  var WORKSPACE_MANIFEST_DB = "pixiedraw2-workspace-manifest";
  var WORKSPACE_MANIFEST_STORE = "manifests";
  var SCHEMA_VERSION = 1;
  // Keep Creator App identity compatible with Draw2's workspace contract.
  // The central store must not silently truncate a Project ID and join it to
  // another local Project.
  var PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
  var MAX_PROJECTS = 64;

  function text(value, fallback, max) {
    var result = String(value == null ? "" : value)
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim();
    if (!result) return fallback;
    return result.slice(0, max);
  }

  function projectId(value) {
    var result = text(value, "local-project", 256);
    return PROJECT_ID_PATTERN.test(result) ? result : "local-project";
  }

  function explicitProjectId(value) {
    var result = String(value == null ? "" : value).trim();
    return result && PROJECT_ID_PATTERN.test(result) ? result : null;
  }

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch (_error) { return null; }
  }

  function now() { return new Date().toISOString(); }

  function defaultProject(id, name, kind) {
    return {
      schemaVersion: SCHEMA_VERSION,
      projectId: projectId(id),
      name: text(name, "無題のProject", 80),
      kind: text(kind, "blank", 24),
      revision: 0,
      updatedAt: now(),
      modules: {},
      bindings: [],
      rights: []
    };
  }

  function readStore() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION || !parsed.projects || typeof parsed.projects !== "object") {
        return { schemaVersion: SCHEMA_VERSION, activeProjectId: projectId(localStorage.getItem(ACTIVE_KEY)), projects: {} };
      }
      return { schemaVersion: SCHEMA_VERSION, activeProjectId: projectId(parsed.activeProjectId), projects: parsed.projects };
    } catch (_error) {
      return { schemaVersion: SCHEMA_VERSION, activeProjectId: "local-project", projects: {} };
    }
  }

  function writeStore(store) {
    var entries = Object.entries(store.projects || {}).slice(-MAX_PROJECTS);
    store.projects = Object.fromEntries(entries);
    store.activeProjectId = projectId(store.activeProjectId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    localStorage.setItem(ACTIVE_KEY, store.activeProjectId);
  }

  function context() {
    var store = readStore();
    var params = new URLSearchParams(window.location.search);
    var hasExplicitProjectId = params.has("projectId") || params.has("project");
    var requestedProjectId = params.get("projectId") || params.get("project") || "";
    var invalidExplicitProjectId = hasExplicitProjectId && !PROJECT_ID_PATTERN.test(String(requestedProjectId).trim());
    var id = invalidExplicitProjectId
      ? "invalid-project-id"
      : projectId(requestedProjectId || store.activeProjectId);
    var project = store.projects[id];
    var name = text(params.get("projectName") || project && project.name, "無題のProject", 80);
    if (!project && !hasExplicitProjectId) {
      project = defaultProject(id, name, "blank");
      store.projects[id] = project;
    }
    if (project && project.name !== name) project.name = name;
    if (project || !hasExplicitProjectId) store.activeProjectId = id;
    try { writeStore(store); } catch (_error) { /* local-only fallback */ }
    return {
      projectId: id,
      projectName: name,
      projectExists: Boolean(project) && !invalidExplicitProjectId,
      projectIdValid: !invalidExplicitProjectId,
      projectKind: project ? text(project.kind, "blank", 24) : null
    };
  }

  function get(id) {
    var store = readStore();
    var rawId = id == null ? "" : String(id).trim();
    var key = rawId
      ? explicitProjectId(rawId)
      : explicitProjectId(store.activeProjectId) || "local-project";
    if (!key) return null;
    var current = store.projects[key];
    return current && typeof current === "object" ? clone(current) : null;
  }

  function list() {
    var store = readStore();
    return Object.values(store.projects || {})
      .filter(function (project) { return project && typeof project === "object"; })
      .sort(function (left, right) {
        return String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
      })
      .slice(0, MAX_PROJECTS)
      .map(clone)
      .filter(Boolean);
  }

  function workspaceProject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    var rawId = String(value.projectId || "").trim();
    if (!PROJECT_ID_PATTERN.test(rawId)) return null;
    var modules = {};
    ["draw", "audio", "game"].forEach(function (surface) {
      var module = value.modules && value.modules[surface];
      if (!module || typeof module !== "object" || Array.isArray(module)) return;
      var revision = Number(module.revision);
      modules[surface] = {
        status: text(module.status, "UNAVAILABLE", 24),
        revision: Number.isSafeInteger(revision) && revision >= 0 ? revision : 0,
        stateHash: typeof module.stateHash === "string" ? module.stateHash : null,
        savedAt: typeof module.savedAt === "string" ? module.savedAt : null
      };
    });
    if (!Object.keys(modules).length) return null;
    var activeMode = text(value.activeMode, "draw", 16).toLowerCase();
    var kind = ["draw", "audio", "game"].includes(activeMode) ? activeMode : "draw";
    var revision = Number(value.revision);
    return {
      schemaVersion: SCHEMA_VERSION,
      projectId: rawId,
      name: text(value.name, "無題のProject", 80),
      kind: kind,
      revision: Number.isSafeInteger(revision) && revision >= 0 ? revision : 0,
      updatedAt: text(value.updatedAt, "", 64) || now(),
      modules: modules,
      bindings: [],
      rights: []
    };
  }

  function listWorkspaceManifests() {
    if (!window.indexedDB) return Promise.resolve([]);
    return new Promise(function (resolve) {
      var request;
      try {
        request = window.indexedDB.open(WORKSPACE_MANIFEST_DB, 1);
      } catch (_error) {
        resolve([]);
        return;
      }
      request.onerror = function () { resolve([]); };
      request.onblocked = function () { resolve([]); };
      request.onsuccess = function () {
        var database = request.result;
        if (!database.objectStoreNames.contains(WORKSPACE_MANIFEST_STORE)) {
          database.close();
          resolve([]);
          return;
        }
        var transaction;
        try {
          transaction = database.transaction(WORKSPACE_MANIFEST_STORE, "readonly");
        } catch (_error) {
          database.close();
          resolve([]);
          return;
        }
        var read = transaction.objectStore(WORKSPACE_MANIFEST_STORE).getAll();
        read.onsuccess = function () {
          var values = Array.isArray(read.result) ? read.result.map(workspaceProject).filter(Boolean) : [];
          database.close();
          resolve(values);
        };
        read.onerror = function () {
          database.close();
          resolve([]);
        };
      };
    });
  }

  function loadWorkspaceManifest(id) {
    var rawId = String(id || "").trim();
    if (!window.indexedDB || !PROJECT_ID_PATTERN.test(rawId)) return Promise.resolve(null);
    return new Promise(function (resolve) {
      var request;
      try {
        request = window.indexedDB.open(WORKSPACE_MANIFEST_DB, 1);
      } catch (_error) {
        resolve(null);
        return;
      }
      request.onerror = function () { resolve(null); };
      request.onblocked = function () { resolve(null); };
      request.onsuccess = function () {
        var database = request.result;
        if (!database.objectStoreNames.contains(WORKSPACE_MANIFEST_STORE)) {
          database.close();
          resolve(null);
          return;
        }
        var transaction;
        try {
          transaction = database.transaction(WORKSPACE_MANIFEST_STORE, "readonly");
        } catch (_error) {
          database.close();
          resolve(null);
          return;
        }
        var read = transaction.objectStore(WORKSPACE_MANIFEST_STORE).get(rawId);
        read.onsuccess = function () {
          var value = workspaceProject(read.result);
          database.close();
          resolve(value);
        };
        read.onerror = function () {
          database.close();
          resolve(null);
        };
      };
    });
  }

  function mergeWorkspaceProject(value, activate) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    var id = projectId(value.projectId);
    var store = readStore();
    var current = store.projects[id] || defaultProject(id, value.name, value.kind || "blank");
    var modules = Object.assign({}, current.modules || {});
    if (value.modules && typeof value.modules === "object") {
      modules = Object.assign({}, modules, value.modules);
    }
    var next = Object.assign({}, current, {
      schemaVersion: SCHEMA_VERSION,
      projectId: id,
      name: text(value.name, current.name, 80),
      kind: current.kind && current.kind !== "blank"
        ? current.kind
        : text(value.kind, current.kind || "blank", 24),
      modules: modules,
      updatedAt: text(value.updatedAt, current.updatedAt, 64),
      revision: Math.max(Number(current.revision) || 0, Number(value.revision) || 0)
    });
    store.projects[id] = next;
    if (activate) store.activeProjectId = id;
    try { writeStore(store); } catch (_error) { return clone(current); }
    return clone(next);
  }

  function listWithWorkspaceManifests() {
    var localProjects = list();
    return listWorkspaceManifests().then(function (workspaceProjects) {
      var byId = new Map(localProjects.map(function (project) { return [String(project.projectId), project]; }));
      workspaceProjects.forEach(function (workspaceProjectValue) {
        var merged = mergeWorkspaceProject(workspaceProjectValue, false) || workspaceProjectValue;
        var current = byId.get(workspaceProjectValue.projectId);
        if (!current) {
          byId.set(workspaceProjectValue.projectId, merged);
          return;
        }
        var currentModules = current.modules && typeof current.modules === "object" ? current.modules : {};
        current.modules = Object.assign({}, currentModules, merged.modules);
        current.revision = Math.max(Number(current.revision) || 0, Number(merged.revision) || 0);
        if (String(merged.updatedAt) > String(current.updatedAt || "")) current.updatedAt = merged.updatedAt;
        if (!current.kind || current.kind === "blank") current.kind = merged.kind;
      });
      return Array.from(byId.values()).sort(function (left, right) {
        return String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
      }).slice(0, MAX_PROJECTS).map(clone).filter(Boolean);
    });
  }

  function create(input) {
    var store = readStore();
    var requestedId = input && input.projectId;
    var id = requestedId == null || String(requestedId).trim() === ""
      ? projectId(requestedId)
      : explicitProjectId(requestedId);
    if (!id) return null;
    var project = defaultProject(id, input && input.name, input && input.kind);
    store.projects[id] = project;
    store.activeProjectId = id;
    try { writeStore(store); } catch (_error) { return clone(project); }
    window.dispatchEvent(new CustomEvent("pixieed:creator-project-changed", { detail: clone(project) }));
    return clone(project);
  }

  function ensure(input) {
    var value = typeof input === "string" ? { projectId: input } : (input || {});
    var store = readStore();
    var requestedId = value.projectId;
    var id = requestedId == null || String(requestedId).trim() === ""
      ? explicitProjectId(store.activeProjectId) || "local-project"
      : explicitProjectId(requestedId);
    if (!id) return null;
    var current = store.projects[id];
    var name = text(value.name || current && current.name, "無題のProject", 80);
    var kind = text(value.kind || current && current.kind, "blank", 24);
    var project = current && typeof current === "object"
      ? Object.assign({}, current, { projectId: id, name: name, kind: kind })
      : defaultProject(id, name, kind);
    store.projects[id] = project;
    store.activeProjectId = id;
    try { writeStore(store); } catch (_error) { return clone(project); }
    return clone(project);
  }

  function update(id, updater) {
    var store = readStore();
    var rawId = id == null ? "" : String(id).trim();
    var key = rawId
      ? explicitProjectId(rawId)
      : explicitProjectId(store.activeProjectId) || "local-project";
    if (!key) return null;
    if (!store.projects[key] || typeof store.projects[key] !== "object") return null;
    var current = clone(store.projects[key]);
    var next = typeof updater === "function" ? updater(current) : current;
    if (!next || typeof next !== "object") next = current;
    next.projectId = key;
    next.schemaVersion = SCHEMA_VERSION;
    next.name = text(next.name, current.name, 80);
    next.revision = Math.max(0, Number(current.revision) || 0) + 1;
    next.updatedAt = now();
    store.projects[key] = next;
    store.activeProjectId = key;
    try { writeStore(store); } catch (_error) { return clone(current); }
    var result = clone(next);
    window.dispatchEvent(new CustomEvent("pixieed:creator-project-changed", { detail: result }));
    return result;
  }

  function syncWorkspaceManifest(manifest) {
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return null;
    var value = workspaceProject(manifest);
    return value ? mergeWorkspaceProject(value, true) : null;
  }

  function hydrateWorkspaceProject(id) {
    return loadWorkspaceManifest(id).then(function (manifest) {
      if (!manifest) return null;
      var project = mergeWorkspaceProject(manifest, false);
      if (project) {
        window.dispatchEvent(new CustomEvent("pixieed:creator-project-changed", { detail: project }));
      }
      return project;
    });
  }

  function link(path, id, mode) {
    var value = context();
    var requestedId = id == null || String(id).trim() === ""
      ? value.projectId
      : id;
    var targetProjectId = explicitProjectId(requestedId);
    if (!targetProjectId) return "";
    var target = get(targetProjectId) || {};
    var url = new URL(path, document.baseURI);
    if (mode) url.searchParams.set("mode", mode);
    url.searchParams.set("projectId", targetProjectId);
    url.searchParams.set("projectName", text(target.name, value.projectName, 80));
    return url.pathname + url.search + url.hash;
  }

  window.PiXiEEDCreatorProjectStore = Object.freeze({
    context: context,
    get: get,
    list: list,
    create: create,
    ensure: ensure,
    update: update,
    syncWorkspaceManifest: syncWorkspaceManifest,
    hydrateWorkspaceProject: hydrateWorkspaceProject,
    listWithWorkspaceManifests: listWithWorkspaceManifests,
    link: link,
    projectId: projectId,
    projectName: function (value) { return text(value, "無題のProject", 80); }
  });
}());
