/// <reference lib="dom" />

export type Draw2MobileDrawerMode = "half" | "full";
export type Draw2MobileRailContext = "primary" | "timeline" | "more";

const DRAWER_ORDER: readonly Draw2MobileDrawerMode[] = ["half", "full"];

export function nextDraw2MobileDrawerMode(
  mode: Draw2MobileDrawerMode,
): Draw2MobileDrawerMode {
  return DRAWER_ORDER[(DRAWER_ORDER.indexOf(mode) + 1) % DRAWER_ORDER.length] ??
    "half";
}

export function snapDraw2MobileDrawerMode(
  drawerHeight: number,
  workspaceHeight: number,
): Draw2MobileDrawerMode {
  const ratio = drawerHeight / Math.max(1, workspaceHeight);
  if (ratio < 0.44) return "half";
  return "full";
}

function isMobileProfile(root: HTMLElement): boolean {
  return root.dataset.workspaceProfile === "mobile";
}

function toolLabel(button: HTMLElement | null): string {
  return button?.querySelector("span")?.textContent?.trim() ||
    button?.getAttribute("title")?.split(" (")[0] ||
    "Pen";
}

type Draw2MobileViewportSnapshot = {
  readonly zoom: number;
  readonly zoomPercent: number;
  readonly fit?: boolean;
};

type Draw2MobileViewportBridge = {
  readonly snapshot: () => Draw2MobileViewportSnapshot;
  readonly setZoom: (nextZoom: number) => void;
  readonly center: () => void;
};

type Draw2MobileWindow = Window & {
  __pixiedraw2DrawViewport?: Draw2MobileViewportBridge;
};

function viewportBridge(
  documentRef: Document,
): Draw2MobileViewportBridge | undefined {
  const view = documentRef.defaultView;
  if (view === null) return undefined;
  return (view as Draw2MobileWindow).__pixiedraw2DrawViewport;
}

export function bootstrapDraw2MobileWorkspace(
  documentRef: Document = document,
): void {
  const root = documentRef.querySelector<HTMLElement>("#draw2WorkspaceFrame");
  const handle = documentRef.querySelector<HTMLButtonElement>(
    "#draw2MobileDrawerHandle",
  );
  const toolOutput = documentRef.querySelector<HTMLOutputElement>(
    "#draw2MobileToolSummary",
  );
  const frameOutput = documentRef.querySelector<HTMLOutputElement>(
    "#draw2MobileFrameSummary",
  );
  const canvasToolOutput = documentRef.querySelector<HTMLOutputElement>(
    "#draw2MobileCanvasTool",
  );
  const canvasFrameOutput = documentRef.querySelector<HTMLOutputElement>(
    "#draw2MobileCanvasFrame",
  );
  const canvasZoomOutput = documentRef.querySelector<HTMLOutputElement>(
    "#draw2MobileCanvasZoom",
  );
  const canvasColorOutput = documentRef.querySelector<HTMLOutputElement>(
    "#draw2MobileCanvasColor",
  );
  const canvasColorSwatch = documentRef.querySelector<HTMLElement>(
    "[data-draw2-mobile-canvas-color-swatch]",
  );
  const canvasZoomLevel = documentRef.querySelector<HTMLOutputElement>(
    "#draw2ZoomLevel",
  );
  const colorEditor = documentRef.querySelector<HTMLElement>(
    "#draw2WorkspaceColorEditor",
  );
  const mobilePalette = documentRef.querySelector<HTMLElement>(
    "#draw2MobilePaletteGrid",
  );
  const timelineToggle = documentRef.querySelector<HTMLElement>(
    "[data-workspace-timeline-toggle]",
  );
  const timelineRegion = documentRef.querySelector<HTMLElement>(
    "#draw2WorkspaceTimelineRegion",
  );
  const metrics = documentRef.querySelector<HTMLElement>(
    "#draw2WorkspaceStatusbarMetrics",
  );
  const railBack = documentRef.querySelector<HTMLButtonElement>(
    '[data-mobile-rail-action="back"]',
  );
  const railMore = documentRef.querySelector<HTMLButtonElement>(
    '[data-mobile-rail-action="more"]',
  );
  const closePanelCommand = documentRef.querySelector<HTMLButtonElement>(
    '[data-workspace-command="close-panel"]',
  );
  if (root === null || handle === null || timelineRegion === null) return;

  let mode: Draw2MobileDrawerMode = "half";
  let railContext: Draw2MobileRailContext = "primary";
  let pointerId: number | undefined;
  let startY = 0;
  let startHeight = 0;
  let dragged = false;

  const syncCanvasHud = (): void => {
    const activeTool = Array.from(
      documentRef.querySelectorAll<HTMLElement>(
        '[data-workspace-tool][aria-pressed="true"]',
      ),
    ).find((candidate) => candidate.getClientRects().length > 0) ?? null;
    const activeToolLabel = toolLabel(activeTool);
    if (toolOutput !== null) toolOutput.value = activeToolLabel;
    if (canvasToolOutput !== null) canvasToolOutput.value = activeToolLabel;
    const frame = metrics?.textContent?.match(/Frame\s+\d+/i)?.[0];
    const frameLabel = frame ?? "Frame 1";
    if (frameOutput !== null) frameOutput.value = frameLabel;
    if (canvasFrameOutput !== null) canvasFrameOutput.value = frameLabel;

    const colorSource = documentRef.querySelector<HTMLOutputElement>(
      "[data-draw2-color-output]",
    );
    const color = colorSource?.value || colorSource?.textContent?.trim() ||
      "#FFFFFF";
    if (canvasColorOutput !== null) canvasColorOutput.value = color;
    if (canvasColorSwatch !== null) {
      canvasColorSwatch.style.backgroundColor = color;
      canvasColorSwatch.setAttribute("aria-label", `Color ${color}`);
    }

    const snapshot = viewportBridge(documentRef)?.snapshot();
    const zoom = snapshot === undefined
      ? canvasZoomLevel?.value || "Fit · 100%"
      : snapshot.fit === true
      ? `Fit · ${snapshot.zoomPercent}%`
      : `${snapshot.zoomPercent}%`;
    if (canvasZoomOutput !== null) canvasZoomOutput.value = zoom;
  };

  const syncSummary = (): void => syncCanvasHud();

  const setMode = (
    next: Draw2MobileDrawerMode,
    keepDragHeight = false,
  ): void => {
    mode = next;
    root.dataset.mobileDrawerMode = next;
    timelineRegion.dataset.mobileDrawerMode = next;
    if (!keepDragHeight) {
      root.style.removeProperty("--draw2-mobile-detail-height");
    }
    syncDrawerPresentation();
  };

  const setRailContext = (next: Draw2MobileRailContext): void => {
    railContext = next;
    root.dataset.mobileRailContext = next;
  };

  const syncLauncherSelection = (
    panel: string | undefined,
    timelineActive: boolean,
  ): void => {
    for (
      const candidate of documentRef.querySelectorAll<HTMLElement>(
        ".draw2-workspace-panel-launcher .draw2-panel-launcher",
      )
    ) {
      const selected = timelineActive
        ? candidate === timelineToggle
        : panel !== undefined && candidate.dataset.workspacePanel === panel;
      candidate.classList.toggle("is-active", selected);
      candidate.setAttribute("aria-pressed", String(selected));
    }
  };

  const closeDetailPanel = (): void => {
    closePanelCommand?.click();
    timelineToggle?.classList.remove("is-active");
    timelineToggle?.setAttribute("aria-pressed", "false");
    root.classList.add("is-mobile-panel-menu-open");
    syncDrawerPresentation();
  };

  const isDetailOpen = (): boolean =>
    root.classList.contains("is-mobile-sheet-open") ||
    root.classList.contains("is-mobile-timeline-open");

  const syncDrawerPresentation = (): void => {
    const open = isDetailOpen() ||
      root.classList.contains("is-mobile-panel-menu-open");
    handle.setAttribute("aria-expanded", String(open));
    handle.setAttribute("aria-label", "モバイルパネルを開閉");
  };

  const setPanelMenuOpen = (open: boolean): void => {
    if (open) root.classList.add("is-mobile-panel-menu-open");
    else if (!isDetailOpen()) root.classList.remove("is-mobile-panel-menu-open");
    syncDrawerPresentation();
  };

  const currentDetailHeight = (): number => {
    if (root.classList.contains("is-mobile-timeline-open")) {
      return timelineRegion.getBoundingClientRect().height;
    }
    const panel = documentRef.querySelector<HTMLElement>(
      ".draw2-workspace-panel:not([hidden])",
    );
    return panel?.getBoundingClientRect().height ?? 0;
  };

  const openTimeline = (nextMode: Draw2MobileDrawerMode = "half"): void => {
    closeDetailPanel();
    root.classList.add("is-mobile-timeline-open");
    setPanelMenuOpen(true);
    timelineToggle?.classList.add("is-active");
    timelineToggle?.setAttribute("aria-pressed", "true");
    setMode(nextMode);
    setRailContext("timeline");
    syncLauncherSelection(undefined, true);
    documentRef.querySelector<HTMLButtonElement>(
      '[data-draw2-timeline-tab="timeline"]',
    )?.click();
  };

  const openPanelMenu = (): void => {
    setMode("half");
    setRailContext("primary");
    syncLauncherSelection(undefined, false);
    setPanelMenuOpen(true);
  };

  const openPrimaryDetail = (): void => {
    const timelineWasActive = timelineToggle?.getAttribute("aria-pressed") ===
      "true";
    if (timelineWasActive) {
      openTimeline("half");
      return;
    }

    const activePanel = Array.from(
      documentRef.querySelectorAll<HTMLElement>(
        '#draw2WorkspaceLeftDock .draw2-workspace-panel-launcher > [data-workspace-panel]',
      ),
    ).find((candidate) => candidate.classList.contains("is-active"));
    const panel = activePanel?.dataset.workspacePanel ?? "color";

    // The first grip tap should enter the current panel directly.  The rail
    // remains available after that for switching to Layers or Timeline.
    openPanelMenu();
    documentRef.querySelector<HTMLElement>(
      `#draw2WorkspaceLeftDock .draw2-workspace-panel-launcher > [data-workspace-panel="${panel}"]`,
    )?.click();
    if (!isDetailOpen()) {
      syncDrawerPresentation();
    }
  };

  const ensureMobileDetail = (): void => {
    if (!isMobileProfile(root) || isDetailOpen()) return;
    syncLauncherSelection(undefined, false);
    syncDrawerPresentation();
  };

  setMode("half");
  setRailContext("primary");
  root.classList.remove("is-mobile-panel-menu-open");
  syncLauncherSelection(undefined, false);
  syncDrawerPresentation();
  syncSummary();

  documentRef.defaultView?.addEventListener(
    "draw2:viewport-changed",
    syncCanvasHud,
  );
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
    let nextMode: Draw2MobileDrawerMode | undefined;
    if (event.key === "Home" || event.key === "ArrowDown") {
      nextMode = "half";
    } else if (event.key === "End" || event.key === "ArrowUp") {
      nextMode = "full";
    }
    if (nextMode === undefined) return;
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
      // A drag from the closed grip should reveal the current detail surface
      // immediately, just like a tap, before height adjustment starts.
      openPrimaryDetail();
      startHeight = currentDetailHeight();
    }
    const workspaceHeight = root.getBoundingClientRect().height;
    const height = Math.max(
      0,
      Math.min(workspaceHeight * 0.66, startHeight + delta),
    );
    root.style.setProperty(
      "--draw2-mobile-detail-height",
      `${Math.round(height)}px`,
    );
    setMode("half", true);
  });
  const finishDrag = (event: PointerEvent): void => {
    if (pointerId !== event.pointerId) return;
    pointerId = undefined;
    const height = Number.parseFloat(
      root.style.getPropertyValue("--draw2-mobile-detail-height"),
    ) || 0;
    if (handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
    if (dragged) {
      const next = snapDraw2MobileDrawerMode(
        height,
        root.getBoundingClientRect().height,
      );
      setMode(next);
    }
  };
  handle.addEventListener("pointerup", finishDrag);
  handle.addEventListener("pointercancel", finishDrag);
  handle.addEventListener("lostpointercapture", () => {
    pointerId = undefined;
  });

  timelineToggle?.addEventListener("click", (event) => {
    if (!isMobileProfile(root)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (root.classList.contains("is-mobile-timeline-open")) {
      return;
    }
    openTimeline(mode);
  }, { capture: true });

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
    const panelButton = event.target.closest<HTMLElement>(
      ".draw2-workspace-panel-launcher [data-workspace-panel]",
    );
    if (panelButton !== null) {
      setPanelMenuOpen(true);
      if (!isDetailOpen()) setMode("half");
      requestAnimationFrame(() => {
        syncLauncherSelection(panelButton.dataset.workspacePanel, false);
        syncDrawerPresentation();
      });
    }
    const timelineTabButton = event.target.closest<HTMLElement>(
      "[data-draw2-mobile-timeline-tab]",
    );
    if (timelineTabButton !== null) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openTimeline(mode);
      const tab = timelineTabButton.dataset.draw2MobileTimelineTab;
      if (tab !== undefined) {
        documentRef.querySelector<HTMLButtonElement>(
          `[data-draw2-timeline-tab="${tab}"]`,
        )?.click();
        for (
          const candidate of documentRef.querySelectorAll<HTMLElement>(
            "[data-draw2-mobile-timeline-tab]",
          )
        ) {
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
  }, { capture: true });

  if (metrics !== null) {
    new MutationObserver(syncSummary).observe(metrics, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
  const colorOutputs = documentRef.querySelectorAll<HTMLOutputElement>(
    "[data-draw2-color-output]",
  );
  for (const output of colorOutputs) {
    new MutationObserver(syncCanvasHud).observe(output, {
      attributes: true,
      childList: true,
      characterData: true,
      attributeFilter: ["value"],
    });
  }

  new MutationObserver(ensureMobileDetail).observe(root, {
    attributes: true,
    attributeFilter: ["class", "data-workspace-profile"],
  });
  requestAnimationFrame(ensureMobileDetail);
  requestAnimationFrame(syncCanvasHud);
}

if (typeof document !== "undefined") bootstrapDraw2MobileWorkspace();
