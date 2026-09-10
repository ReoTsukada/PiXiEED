(function () {
  "use strict";

  var stateKey = "pixieed:creator-app-shell:v1";
  var defaultState = {
    projectId: "local-project",
    projectName: "無題のProject",
    projectKind: "blank",
    localState: "LOCAL_ONLY",
    saveState: "未保存",
    syncState: "未接続",
    rightsState: "既存Market／権利システムを利用"
  };

  function readState() {
    try {
      var raw = window.localStorage.getItem(stateKey);
      return raw ? Object.assign({}, defaultState, JSON.parse(raw)) : Object.assign({}, defaultState);
    } catch (error) {
      return Object.assign({}, defaultState);
    }
  }

  function writeState(next) {
    var state = Object.assign({}, readState(), next);
    try { window.localStorage.setItem(stateKey, JSON.stringify(state)); } catch (error) { /* local-only fallback */ }
    return state;
  }

  var studioModes = { DRAW: true, AUDIO: true, GAME: true };
  var projectStore = window.PiXiEEDCreatorProjectStore;
  var projectListRenderToken = 0;

  function safeProjectId(value) {
    var id = String(value || "").trim();
    return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(id) ? id : defaultState.projectId;
  }

  function safeProjectName(value) {
    var name = String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
    return name ? name.slice(0, 80) : defaultState.projectName;
  }

  function routeContext() {
    var state = readState();
    var params = new URLSearchParams(window.location.search);
    var linked = projectStore && typeof projectStore.context === "function" ? projectStore.context() : null;
    var projectId = safeProjectId(params.get("projectId") || linked && linked.projectId || state.projectId);
    var projectName = safeProjectName(params.get("projectName") || linked && linked.projectName || state.projectName);
    var linkedProject = projectStore && typeof projectStore.get === "function" ? projectStore.get(projectId) : null;
    if (linkedProject && typeof linkedProject === "object") {
      projectName = safeProjectName(projectName || linkedProject.name);
      state = Object.assign({}, state, {
        projectId: projectId,
        projectName: projectName,
        projectKind: String(linkedProject.kind || state.projectKind || "blank")
      });
    }
    var hasHandoff = params.has("projectId") || params.has("projectName");
    if (hasHandoff && (projectId !== state.projectId || projectName !== state.projectName)) {
      state = writeState({ projectId: projectId, projectName: projectName });
    }
    return {
      projectId: safeProjectId(state.projectId),
      projectName: safeProjectName(state.projectName),
      projectKind: String(state.projectKind || "blank"),
      projectExists: linked ? linked.projectExists !== false : true
    };
  }

  function projectKindLabel(value) {
    return ({ draw: "iDRAW", audio: "iAUDIO", game: "iGAME", writing: "文章・世界観", visual: "画像・動画", blank: "Blank" })[String(value || "").toLowerCase()] || "Project";
  }

  function formatProjectDate(value) {
    var date = new Date(value || "");
    return Number.isNaN(date.getTime()) ? "更新日不明" : new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(date);
  }

  function projectLink(path, project, mode) {
    if (!projectStore || typeof projectStore.link !== "function") return path;
    return projectStore.link(path, project.projectId, mode);
  }

  function renderProjectList() {
    var host = document.querySelector("[data-project-list]");
    if (!host || !projectStore || typeof projectStore.list !== "function") return;
    var renderToken = ++projectListRenderToken;
    var renderProjects = function (projects) {
      if (renderToken !== projectListRenderToken) return;
      host.removeAttribute("aria-busy");
      if (!projects.length) {
        var empty = document.createElement("p");
        empty.className = "app-notice";
        empty.textContent = "まだProjectがありません。新規Projectを作成してください。";
        host.replaceChildren(empty);
        return;
      }
      var active = routeContext().projectId;
      host.replaceChildren.apply(host, projects.map(function (project) {
        var row = document.createElement("article");
        row.className = "app-project-row";
        var copy = document.createElement("div");
        var title = document.createElement("strong");
        title.textContent = String(project.name || "無題のProject");
        var modules = project.modules && typeof project.modules === "object" ? Object.keys(project.modules) : [];
        var detail = document.createElement("small");
        detail.textContent = `${projectKindLabel(project.kind)} · ${modules.length}モジュール · ${formatProjectDate(project.updatedAt)}`;
        if (String(project.projectId) === active) {
          var activeLabel = document.createElement("span");
          activeLabel.className = "app-status app-status--info";
          activeLabel.textContent = "現在のProject";
          copy.append(title, activeLabel, detail);
        } else {
          copy.append(title, detail);
        }
        var actions = document.createElement("div");
        actions.className = "app-actions";
        actions.style.marginTop = "0";
        var overview = document.createElement("a");
        overview.className = "app-button app-button--subtle";
        overview.href = projectLink("../project/", project);
        overview.textContent = "Project Home";
        var draw = document.createElement("a");
        draw.className = "app-button";
        draw.href = projectLink("../../pixiedraw2/", project, "DRAW");
        draw.textContent = "iDRAW";
        var audio = document.createElement("a");
        audio.className = "app-button";
        audio.href = projectLink("../../pixiedraw2/", project, "AUDIO");
        audio.textContent = "iAUDIO";
        var game = document.createElement("a");
        game.className = "app-button";
        game.href = projectLink("../../pixiedraw2/", project, "GAME");
        game.textContent = "iGAME";
        var writing = document.createElement("a");
        writing.className = "app-button";
        writing.href = projectLink("../writing/", project);
        writing.textContent = "文章";
        var visual = document.createElement("a");
        visual.className = "app-button";
        visual.href = projectLink("../visual/", project);
        visual.textContent = "画像・動画";
        actions.append(overview, draw, audio, game, writing, visual);
        row.append(copy, actions);
        return row;
      }));
    };
    var projects = projectStore.list();
    host.setAttribute("aria-busy", "true");
    if (typeof projectStore.listWithWorkspaceManifests === "function") {
      projectStore.listWithWorkspaceManifests().then(renderProjects).catch(function () { renderProjects(projects); });
      return;
    }
    renderProjects(projects);
  }

  function projectQuery(context, mode) {
    var params = new URLSearchParams();
    if (mode && studioModes[mode]) params.set("mode", mode);
    params.set("projectId", context.projectId);
    params.set("projectName", context.projectName);
    return params.toString();
  }

  function updateProjectLinks() {
    var context = routeContext();
    document.querySelectorAll("[data-studio-mode]").forEach(function (anchor) {
      var mode = String(anchor.getAttribute("data-studio-mode") || "").toUpperCase();
      if (!studioModes[mode]) return;
      var base = anchor.getAttribute("href") || "../pixiedraw2/";
      var url;
      try { url = new URL(base, document.baseURI); } catch (error) { return; }
      if (url.origin !== window.location.origin || !/\/pixiedraw2\/?$/i.test(url.pathname)) return;
      url.search = projectQuery(context, mode);
      anchor.setAttribute("href", url.pathname + url.search + url.hash);
    });
    document.querySelectorAll("[data-project-route]").forEach(function (anchor) {
      var base = anchor.getAttribute("href");
      if (!base) return;
      var url;
      try { url = new URL(base, document.baseURI); } catch (error) { return; }
      if (url.origin !== window.location.origin) return;
      url.search = projectQuery(context, "");
      anchor.setAttribute("href", url.pathname + url.search + url.hash);
    });
  }

  function render() {
    var context = routeContext();
    document.body.dataset.projectState = context.projectExists ? "CURRENT" : "NOT_FOUND";
    document.querySelectorAll("[data-project-not-found]").forEach(function (element) {
      element.hidden = context.projectExists;
    });
    document.querySelectorAll("[data-project-name]").forEach(function (element) { element.textContent = context.projectName; });
    var state = readState();
    document.querySelectorAll("[data-project-kind]").forEach(function (element) { element.textContent = context.projectKind || state.projectKind; });
    document.querySelectorAll("[data-local-state]").forEach(function (element) { element.textContent = state.localState; });
    document.querySelectorAll("[data-save-state]").forEach(function (element) { element.textContent = state.saveState; });
    document.querySelectorAll("[data-sync-state]").forEach(function (element) { element.textContent = state.syncState; });
    document.querySelectorAll("[data-rights-state]").forEach(function (element) { element.textContent = state.rightsState; });
    document.querySelectorAll("[data-project-id]").forEach(function (element) { element.textContent = context.projectId; });
    var input = document.querySelector("[data-project-name-input]");
    if (input && !input.value) input.value = state.projectName;
    renderProjectList();
  }

  document.addEventListener("submit", function (event) {
    var form = event.target.closest("[data-project-form]");
    if (!form) return;
    event.preventDefault();
    var input = form.querySelector("[data-project-name-input]");
    var name = input && input.value.trim() ? input.value.trim() : defaultState.projectName;
    var projectId = "project-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    var projectKind = form.querySelector("[name=project-kind]:checked")?.value || "blank";
    projectId = safeProjectId(projectId);
    name = safeProjectName(name);
    if (projectStore && typeof projectStore.create === "function") {
      projectStore.create({ projectId: projectId, name: name, kind: projectKind });
    }
    writeState({ projectId: projectId, projectName: name, projectKind: projectKind, saveState: "ローカル保存済み", localState: "LOCAL_ONLY" });
    render();
    var notice = form.querySelector("[data-form-notice]");
    if (notice) notice.textContent = "Projectのローカル状態を更新しました。Project Homeから制作モードを選べます。サーバー保存・同期は未接続です。";
    var context = routeContext();
    var destination = projectKind === "writing" ? "../writing/" : projectKind === "visual" ? "../visual/" : "../project/";
    var mode = projectKind === "audio" ? "AUDIO" : projectKind === "game" ? "GAME" : projectKind === "draw" ? "DRAW" : "";
    var next = new URL(destination, document.baseURI);
    next.search = projectQuery(context, mode);
    window.location.assign(next.pathname + next.search);
  });

  document.addEventListener("click", function (event) {
    var save = event.target.closest("[data-save-local]");
    if (!save) return;
    writeState({ saveState: "ローカル保存済み", localState: "LOCAL_ONLY" });
    render();
  });

  document.addEventListener("DOMContentLoaded", function () {
    routeContext();
    render();
    updateProjectLinks();
  });
  window.addEventListener("pixieed:creator-project-changed", function () {
    render();
    updateProjectLinks();
  });
}());
