// src/draw2-mobile-workspace.ts
var DRAWER_ORDER = [
  "half",
  "full"
];
function nextDraw2MobileDrawerMode(mode) {
  return DRAWER_ORDER[(DRAWER_ORDER.indexOf(mode) + 1) % DRAWER_ORDER.length] ?? "half";
}
function snapDraw2MobileDrawerMode(drawerHeight, workspaceHeight) {
  const ratio = drawerHeight / Math.max(1, workspaceHeight);
  if (ratio < 0.44) return "half";
  return "full";
}
function isMobileProfile(root) {
  return root.dataset.workspaceProfile === "mobile";
}
function toolLabel(button) {
  return button?.querySelector("span")?.textContent?.trim() || button?.getAttribute("title")?.split(" (")[0] || "Pen";
}
function viewportBridge(documentRef) {
  const view = documentRef.defaultView;
  if (view === null) return void 0;
  return view.__pixiedraw2DrawViewport;
}
function bootstrapDraw2MobileWorkspace(documentRef = document) {
  const root = documentRef.querySelector("#draw2WorkspaceFrame");
  const handle = documentRef.querySelector("#draw2MobileDrawerHandle");
  const toolOutput = documentRef.querySelector("#draw2MobileToolSummary");
  const frameOutput = documentRef.querySelector("#draw2MobileFrameSummary");
  const canvasToolOutput = documentRef.querySelector("#draw2MobileCanvasTool");
  const canvasFrameOutput = documentRef.querySelector("#draw2MobileCanvasFrame");
  const canvasZoomOutput = documentRef.querySelector("#draw2MobileCanvasZoom");
  const canvasColorOutput = documentRef.querySelector("#draw2MobileCanvasColor");
  const canvasColorSwatch = documentRef.querySelector("[data-draw2-mobile-canvas-color-swatch]");
  const canvasZoomLevel = documentRef.querySelector("#draw2ZoomLevel");
  const colorEditor = documentRef.querySelector("#draw2WorkspaceColorEditor");
  const mobilePalette = documentRef.querySelector("#draw2MobilePaletteGrid");
  const timelineToggle = documentRef.querySelector("[data-workspace-timeline-toggle]");
  const timelineRegion = documentRef.querySelector("#draw2WorkspaceTimelineRegion");
  const metrics = documentRef.querySelector("#draw2WorkspaceStatusbarMetrics");
  const railBack = documentRef.querySelector('[data-mobile-rail-action="back"]');
  const railMore = documentRef.querySelector('[data-mobile-rail-action="more"]');
  const closePanelCommand = documentRef.querySelector('[data-workspace-command="close-panel"]');
  if (root === null || handle === null || timelineRegion === null) return;
  let mode = "half";
  let railContext = "primary";
  let pointerId;
  let startY = 0;
  let startHeight = 0;
  let dragged = false;
  const syncCanvasHud = () => {
    const activeTool = Array.from(documentRef.querySelectorAll('[data-workspace-tool][aria-pressed="true"]')).find((candidate) => candidate.getClientRects().length > 0) ?? null;
    const activeToolLabel = toolLabel(activeTool);
    if (toolOutput !== null) toolOutput.value = activeToolLabel;
    if (canvasToolOutput !== null) canvasToolOutput.value = activeToolLabel;
    const frame = metrics?.textContent?.match(/Frame\s+\d+/i)?.[0];
    const frameLabel = frame ?? "Frame 1";
    if (frameOutput !== null) frameOutput.value = frameLabel;
    if (canvasFrameOutput !== null) canvasFrameOutput.value = frameLabel;
    const colorSource = documentRef.querySelector("[data-draw2-color-output]");
    const color = colorSource?.value || colorSource?.textContent?.trim() || "#FFFFFF";
    if (canvasColorOutput !== null) canvasColorOutput.value = color;
    if (canvasColorSwatch !== null) {
      canvasColorSwatch.style.backgroundColor = color;
      canvasColorSwatch.setAttribute("aria-label", `Color ${color}`);
    }
    const snapshot = viewportBridge(documentRef)?.snapshot();
    const zoom = snapshot === void 0 ? canvasZoomLevel?.value || "Fit \xB7 100%" : snapshot.fit === true ? `Fit \xB7 ${snapshot.zoomPercent}%` : `${snapshot.zoomPercent}%`;
    if (canvasZoomOutput !== null) canvasZoomOutput.value = zoom;
  };
  const syncSummary = () => syncCanvasHud();
  const setMode = (next, keepDragHeight = false) => {
    mode = next;
    root.dataset.mobileDrawerMode = next;
    timelineRegion.dataset.mobileDrawerMode = next;
    if (!keepDragHeight) {
      root.style.removeProperty("--draw2-mobile-detail-height");
    }
    syncDrawerPresentation();
  };
  const setRailContext = (next) => {
    railContext = next;
    root.dataset.mobileRailContext = next;
  };
  const syncLauncherSelection = (panel, timelineActive) => {
    for (const candidate of documentRef.querySelectorAll(".draw2-workspace-panel-launcher .draw2-panel-launcher")) {
      const selected = timelineActive ? candidate === timelineToggle : panel !== void 0 && candidate.dataset.workspacePanel === panel;
      candidate.classList.toggle("is-active", selected);
      candidate.setAttribute("aria-pressed", String(selected));
    }
  };
  const closeDetailPanel = () => {
    closePanelCommand?.click();
    timelineToggle?.classList.remove("is-active");
    timelineToggle?.setAttribute("aria-pressed", "false");
    root.classList.add("is-mobile-panel-menu-open");
    syncDrawerPresentation();
  };
  const isDetailOpen = () => root.classList.contains("is-mobile-sheet-open") || root.classList.contains("is-mobile-timeline-open");
  const syncDrawerPresentation = () => {
    const open = isDetailOpen() || root.classList.contains("is-mobile-panel-menu-open");
    handle.setAttribute("aria-expanded", String(open));
    handle.setAttribute("aria-label", "\u30E2\u30D0\u30A4\u30EB\u30D1\u30CD\u30EB\u3092\u958B\u9589");
  };
  const setPanelMenuOpen = (open) => {
    if (open) root.classList.add("is-mobile-panel-menu-open");
    else if (!isDetailOpen()) root.classList.remove("is-mobile-panel-menu-open");
    syncDrawerPresentation();
  };
  const currentDetailHeight = () => {
    if (root.classList.contains("is-mobile-timeline-open")) {
      return timelineRegion.getBoundingClientRect().height;
    }
    const panel = documentRef.querySelector(".draw2-workspace-panel:not([hidden])");
    return panel?.getBoundingClientRect().height ?? 0;
  };
  const openTimeline = (nextMode = "half") => {
    closeDetailPanel();
    root.classList.add("is-mobile-timeline-open");
    setPanelMenuOpen(true);
    timelineToggle?.classList.add("is-active");
    timelineToggle?.setAttribute("aria-pressed", "true");
    setMode(nextMode);
    setRailContext("timeline");
    syncLauncherSelection(void 0, true);
    documentRef.querySelector('[data-draw2-timeline-tab="timeline"]')?.click();
  };
  const openPanelMenu = () => {
    setMode("half");
    setRailContext("primary");
    syncLauncherSelection(void 0, false);
    setPanelMenuOpen(true);
  };
  const openPrimaryDetail = () => {
    const timelineWasActive = timelineToggle?.getAttribute("aria-pressed") === "true";
    if (timelineWasActive) {
      openTimeline("half");
      return;
    }
    const activePanel = Array.from(documentRef.querySelectorAll("#draw2WorkspaceLeftDock .draw2-workspace-panel-launcher > [data-workspace-panel]")).find((candidate) => candidate.classList.contains("is-active"));
    const panel = activePanel?.dataset.workspacePanel ?? "color";
    openPanelMenu();
    documentRef.querySelector(`#draw2WorkspaceLeftDock .draw2-workspace-panel-launcher > [data-workspace-panel="${panel}"]`)?.click();
    if (!isDetailOpen()) {
      syncDrawerPresentation();
    }
  };
  const ensureMobileDetail = () => {
    if (!isMobileProfile(root) || isDetailOpen()) return;
    syncLauncherSelection(void 0, false);
    syncDrawerPresentation();
  };
  setMode("half");
  setRailContext("primary");
  root.classList.remove("is-mobile-panel-menu-open");
  syncLauncherSelection(void 0, false);
  syncDrawerPresentation();
  syncSummary();
  documentRef.defaultView?.addEventListener("draw2:viewport-changed", syncCanvasHud);
  colorEditor?.addEventListener("input", syncCanvasHud);
  colorEditor?.addEventListener("change", syncCanvasHud);
  mobilePalette?.addEventListener("click", () => {
    requestAnimationFrame(syncCanvasHud);
  });
  handle.addEventListener("click", () => {
    if (!isMobileProfile(root)) return;
    if (dragged) {
      dragged = false;
      return;
    }
    if (!isDetailOpen()) {
      openPrimaryDetail();
      return;
    }
    setMode(nextDraw2MobileDrawerMode(mode));
  });
  handle.addEventListener("keydown", (event) => {
    if (!isMobileProfile(root)) return;
    let nextMode;
    if (event.key === "Home" || event.key === "ArrowDown") {
      nextMode = "half";
    } else if (event.key === "End" || event.key === "ArrowUp") {
      nextMode = "full";
    }
    if (nextMode === void 0) return;
    event.preventDefault();
    if (!isDetailOpen()) openPanelMenu();
    setMode(nextMode);
  });
  handle.addEventListener("pointerdown", (event) => {
    if (!isMobileProfile(root)) return;
    pointerId = event.pointerId;
    startY = event.clientY;
    startHeight = isDetailOpen() ? currentDetailHeight() : 0;
    dragged = false;
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener("pointermove", (event) => {
    if (pointerId !== event.pointerId) return;
    const delta = startY - event.clientY;
    if (Math.abs(delta) < 4) return;
    dragged = true;
    if (!isDetailOpen()) {
      openPrimaryDetail();
      startHeight = currentDetailHeight();
    }
    const workspaceHeight = root.getBoundingClientRect().height;
    const height = Math.max(0, Math.min(workspaceHeight * 0.66, startHeight + delta));
    root.style.setProperty("--draw2-mobile-detail-height", `${Math.round(height)}px`);
    setMode("half", true);
  });
  const finishDrag = (event) => {
    if (pointerId !== event.pointerId) return;
    pointerId = void 0;
    const height = Number.parseFloat(root.style.getPropertyValue("--draw2-mobile-detail-height")) || 0;
    if (handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
    if (dragged) {
      const next = snapDraw2MobileDrawerMode(height, root.getBoundingClientRect().height);
      setMode(next);
    }
  };
  handle.addEventListener("pointerup", finishDrag);
  handle.addEventListener("pointercancel", finishDrag);
  handle.addEventListener("lostpointercapture", () => {
    pointerId = void 0;
  });
  timelineToggle?.addEventListener("click", (event) => {
    if (!isMobileProfile(root)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (root.classList.contains("is-mobile-timeline-open")) {
      return;
    }
    openTimeline(mode);
  }, {
    capture: true
  });
  railMore?.addEventListener("click", () => {
    if (!isMobileProfile(root)) return;
    setRailContext("more");
  });
  railBack?.addEventListener("click", () => {
    if (!isMobileProfile(root)) return;
    setRailContext("primary");
  });
  root.addEventListener("click", (event) => {
    if (!isMobileProfile(root) || !(event.target instanceof Element)) return;
    const panelButton = event.target.closest(".draw2-workspace-panel-launcher [data-workspace-panel]");
    if (panelButton !== null) {
      setPanelMenuOpen(true);
      if (!isDetailOpen()) setMode("half");
      requestAnimationFrame(() => {
        syncLauncherSelection(panelButton.dataset.workspacePanel, false);
        syncDrawerPresentation();
      });
    }
    const timelineTabButton = event.target.closest("[data-draw2-mobile-timeline-tab]");
    if (timelineTabButton !== null) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openTimeline(mode);
      const tab = timelineTabButton.dataset.draw2MobileTimelineTab;
      if (tab !== void 0) {
        documentRef.querySelector(`[data-draw2-timeline-tab="${tab}"]`)?.click();
        for (const candidate of documentRef.querySelectorAll("[data-draw2-mobile-timeline-tab]")) {
          const selected = candidate.dataset.draw2MobileTimelineTab === tab;
          candidate.classList.toggle("is-active", selected);
          candidate.setAttribute("aria-pressed", String(selected));
        }
        timelineToggle?.classList.remove("is-active");
        timelineToggle?.setAttribute("aria-pressed", "true");
      }
      return;
    }
    if (event.target.closest("[data-workspace-tool]") !== null) {
      requestAnimationFrame(syncSummary);
    }
  }, {
    capture: true
  });
  if (metrics !== null) {
    new MutationObserver(syncSummary).observe(metrics, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
  const colorOutputs = documentRef.querySelectorAll("[data-draw2-color-output]");
  for (const output of colorOutputs) {
    new MutationObserver(syncCanvasHud).observe(output, {
      attributes: true,
      childList: true,
      characterData: true,
      attributeFilter: [
        "value"
      ]
    });
  }
  new MutationObserver(ensureMobileDetail).observe(root, {
    attributes: true,
    attributeFilter: [
      "class",
      "data-workspace-profile"
    ]
  });
  requestAnimationFrame(ensureMobileDetail);
  requestAnimationFrame(syncCanvasHud);
}
if (typeof document !== "undefined") bootstrapDraw2MobileWorkspace();
export {
  bootstrapDraw2MobileWorkspace,
  nextDraw2MobileDrawerMode,
  snapDraw2MobileDrawerMode
};
