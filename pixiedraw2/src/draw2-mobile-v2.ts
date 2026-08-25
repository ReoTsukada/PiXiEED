/// <reference lib="dom" />

type MobileV2Mode = "DRAW" | "AUDIO";
type MobileV2Sheet =
  | "none"
  | "tools"
  | "color"
  | "layers"
  | "options"
  | "more"
  | "audio-right";

const ICON_SPRITE = "./assets/icons/draw2-icons.svg#";

function query<T extends Element>(selector: string): T | undefined {
  return document.querySelector<T>(selector) ?? undefined;
}

function queryAll<T extends Element>(selector: string): T[] {
  return Array.from(document.querySelectorAll<T>(selector));
}

function clickFirst(selector: string): void {
  query<HTMLElement>(selector)?.click();
}

function createIcon(iconId: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("draw2-ui-icon");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute(
    "href",
    `${ICON_SPRITE}${iconId.startsWith("icon-") ? iconId : `icon-${iconId}`}`,
  );
  svg.append(use);
  return svg;
}

function createButton(
  label: string,
  icon: string,
  attributes: Record<string, string> = {},
  handler?: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "draw2-mobile-v2-button";
  button.append(createIcon(icon));
  const text = document.createElement("span");
  text.className = "draw2-mobile-v2-button-label";
  text.textContent = label;
  button.append(text);
  for (const [key, value] of Object.entries(attributes)) {
    button.setAttribute(key, value);
  }
  if (handler !== undefined) button.addEventListener("click", handler);
  return button;
}

function titleFromTool(
  button: HTMLElement | undefined,
  fallback: string,
): string {
  const aria = button?.getAttribute("aria-label")?.trim();
  if (aria !== undefined && aria.length > 0) return aria;
  const title = button?.getAttribute("title")?.split(" (")[0]?.trim();
  return title !== undefined && title.length > 0 ? title : fallback;
}

type MovedNode = {
  readonly node: HTMLElement;
  readonly parent: Node;
  readonly nextSibling: ChildNode | null;
  readonly hidden: boolean;
};

class Draw2MobileV2 {
  private readonly root: HTMLElement;
  private readonly app: HTMLDivElement;
  private readonly header: HTMLElement;
  private readonly productNav: HTMLElement;
  private readonly transport: HTMLElement;
  private readonly dock: HTMLElement;
  private readonly sheet: HTMLElement;
  private readonly sheetTitle: HTMLElement;
  private readonly sheetBody: HTMLElement;
  private readonly originalLocations = new Map<string, MovedNode>();
  private active = false;
  private timelineOpen = false;
  private sheetKind: MobileV2Sheet = "none";
  private lastMode: MobileV2Mode | undefined;

  public constructor(root: HTMLElement) {
    this.root = root;
    this.app = document.createElement("div");
    this.app.id = "draw2MobileV2App";
    this.app.className = "draw2-mobile-v2-app";

    this.header = document.createElement("header");
    this.header.id = "draw2MobileV2Header";
    this.header.className = "draw2-mobile-v2-header";
    this.productNav = document.createElement("nav");
    this.productNav.id = "draw2MobileV2ProductNav";
    this.productNav.className = "draw2-mobile-v2-product-nav";
    this.productNav.setAttribute("aria-label", "Product workspace");
    this.transport = document.createElement("div");
    this.transport.id = "draw2MobileV2Transport";
    this.transport.className = "draw2-mobile-v2-transport";
    this.dock = document.createElement("nav");
    this.dock.id = "draw2MobileV2Dock";
    this.dock.className = "draw2-mobile-v2-dock";
    this.dock.setAttribute("aria-label", "Workspace actions");
    this.sheet = document.createElement("aside");
    this.sheet.id = "draw2MobileV2Sheet";
    this.sheet.className = "draw2-mobile-v2-sheet";
    this.sheet.hidden = true;
    this.sheet.setAttribute("aria-label", "Workspace detail sheet");
    const sheetHeader = document.createElement("header");
    sheetHeader.className = "draw2-mobile-v2-sheet-header";
    this.sheetTitle = document.createElement("strong");
    this.sheetTitle.id = "draw2MobileV2SheetTitle";
    const close = createButton("Close", "close", {
      "data-mobile-v2-action": "close-sheet",
      "aria-label": "Close detail sheet",
    }, () => this.closeSheet());
    close.classList.add("draw2-mobile-v2-icon-button");
    sheetHeader.append(this.sheetTitle, close);
    this.sheetBody = document.createElement("div");
    this.sheetBody.id = "draw2MobileV2SheetBody";
    this.sheetBody.className = "draw2-mobile-v2-sheet-body";
    this.sheet.append(sheetHeader, this.sheetBody);

    this.buildHeader();
    this.buildProductNav();
    this.app.append(
      this.header,
      this.productNav,
      this.transport,
      this.dock,
      this.sheet,
    );
    this.root.append(this.app);
    this.bindObservers();
  }

  public sync(): void {
    const profile = this.root.dataset.workspaceProfile;
    const creatorMode = this.root.dataset.creatorMode;
    const isDrawOrAudio = creatorMode === "DRAW" || creatorMode === "AUDIO";
    const shouldActivate = isDrawOrAudio &&
      (profile === "mobile" || profile === "split");
    if (shouldActivate && !this.active) this.activate();
    if (!shouldActivate && this.active) this.deactivate();
    if (this.active) this.syncMode();
  }

  private buildHeader(): void {
    const identity = document.createElement("div");
    identity.className = "draw2-mobile-v2-identity";
    const logo = query<HTMLImageElement>(".draw2-brand-logo")?.cloneNode(true);
    if (logo instanceof HTMLImageElement) identity.append(logo);
    const copy = document.createElement("div");
    copy.className = "draw2-mobile-v2-identity-copy";
    const eyebrow = document.createElement("span");
    eyebrow.className = "draw2-mobile-v2-eyebrow";
    eyebrow.textContent = "PIXEL WORKSPACE";
    const title = document.createElement("strong");
    title.textContent = "Draw2";
    const status = document.createElement("span");
    status.id = "draw2MobileV2Status";
    status.className = "draw2-mobile-v2-status";
    status.textContent =
      query<HTMLElement>("#draw2WorkspaceStatus")?.textContent?.trim() ||
      "Local";
    copy.append(eyebrow, title, status);
    identity.append(copy);

    const actions = document.createElement("div");
    actions.className = "draw2-mobile-v2-header-actions";
    actions.append(
      createButton("Undo", "undo", {
        "data-mobile-v2-command": "undo",
        "aria-label": "Undo",
      }),
      createButton("Redo", "redo", {
        "data-mobile-v2-command": "redo",
        "aria-label": "Redo",
      }),
      createButton("More", "commands", {
        "data-mobile-v2-action": "open-more",
        "aria-label": "Open workspace menu",
      }, () => this.openSheet("more")),
    );
    this.header.append(identity, actions);
    this.header.addEventListener("click", (event) => {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-mobile-v2-command]")
        : null;
      const command = target?.dataset.mobileV2Command;
      if (command !== undefined) {
        clickFirst(`[data-workspace-command="${command}"]`);
      }
    });
    const sourceStatus = query<HTMLElement>("#draw2WorkspaceStatus");
    if (sourceStatus !== undefined) {
      new MutationObserver(() => {
        const current = sourceStatus.textContent?.trim();
        if (current !== undefined && current.length > 0) {
          status.textContent = current;
        }
      }).observe(sourceStatus, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
  }

  private buildProductNav(): void {
    const draw = createButton("Draw", "pen", {
      "data-mobile-v2-mode": "DRAW",
      role: "tab",
      "aria-selected": "true",
    }, () => this.setMode("DRAW"));
    const audio = createButton("Audio", "wave", {
      "data-mobile-v2-mode": "AUDIO",
      role: "tab",
      "aria-selected": "false",
    }, () => this.setMode("AUDIO"));
    audio.disabled = this.root.dataset.audioFeatureFlag !== "on";
    audio.title = audio.disabled
      ? "Audio is available from ?audio=on"
      : "Open Audio workspace";
    this.productNav.append(draw, audio);
  }

  private bindObservers(): void {
    new MutationObserver(() => this.sync()).observe(this.root, {
      attributes: true,
      attributeFilter: [
        "data-workspace-profile",
        "data-creator-mode",
        "data-audio-feature-flag",
      ],
    });
    window.addEventListener("resize", () => this.sync(), { passive: true });
  }

  private activate(): void {
    this.active = true;
    this.root.dataset.mobileV2 = "on";
    const audioControls = query<HTMLElement>("#draw2AudioGlobalControls");
    if (audioControls !== undefined) {
      this.rememberNode("audio-controls", audioControls);
      this.transport.append(audioControls);
    }
    this.syncMode();
  }

  private deactivate(): void {
    this.closeSheet();
    this.restoreAllMovedNodes();
    this.active = false;
    this.root.dataset.mobileV2 = "off";
    this.root.removeAttribute("data-mobile-v2-mode");
  }

  private currentMode(): MobileV2Mode {
    return this.root.dataset.creatorMode === "AUDIO" &&
        this.root.dataset.audioFeatureFlag === "on"
      ? "AUDIO"
      : "DRAW";
  }

  private syncMode(): void {
    const mode = this.currentMode();
    const audio = mode === "AUDIO";
    const audioButton = query<HTMLButtonElement>(
      '[data-mobile-v2-mode="AUDIO"]',
    );
    const audioAvailable = this.root.dataset.audioFeatureFlag === "on";
    if (audioButton !== undefined) {
      audioButton.disabled = !audioAvailable;
      audioButton.title = audioAvailable
        ? "Open Audio workspace"
        : "Audio is available from ?audio=on";
    }
    this.root.dataset.mobileV2Mode = mode;
    const modeButtons = queryAll<HTMLButtonElement>("[data-mobile-v2-mode]");
    for (const button of modeButtons) {
      const selected = button.dataset.mobileV2Mode === mode;
      button.setAttribute("aria-selected", String(selected));
      button.classList.toggle("is-active", selected);
    }
    const audioControls = query<HTMLElement>("#draw2AudioGlobalControls");
    if (audioControls !== undefined) audioControls.hidden = !audio;
    const canvasSlot = query<HTMLElement>("#draw2WorkspaceCanvasSlot");
    if (canvasSlot !== undefined) canvasSlot.hidden = audio;
    const audioWorkspace = query<HTMLElement>("#draw2AudioWorkspace");
    if (audioWorkspace !== undefined) audioWorkspace.hidden = !audio;
    const timeline = query<HTMLElement>("#draw2WorkspaceTimelineRegion");
    const modeDeck = query<HTMLElement>("#draw2ModeTimelineDeck");
    if (timeline !== undefined) {
      const showTimeline = audio || this.timelineOpen;
      timeline.hidden = !showTimeline;
      timeline.setAttribute("aria-hidden", String(!showTimeline));
      this.root.dataset.mobileV2Timeline = showTimeline ? "on" : "off";
      if (audio && modeDeck !== undefined) modeDeck.hidden = false;
    }
    if (this.lastMode !== mode) {
      this.lastMode = mode;
      this.renderDock(mode);
    }
    if (!audio && this.sheetKind === "audio-right") this.closeSheet();
    if (
      audio && this.sheetKind !== "none" && this.sheetKind !== "audio-right"
    ) {
      this.closeSheet();
    }
  }

  private setMode(mode: MobileV2Mode): void {
    if (mode === "AUDIO" && this.root.dataset.audioFeatureFlag !== "on") return;
    clickFirst(`.draw2-creator-mode[data-creator-mode="${mode}"]`);
    window.requestAnimationFrame(() => this.syncMode());
  }

  private renderDock(mode: MobileV2Mode): void {
    this.dock.replaceChildren();
    if (mode === "DRAW") {
      this.dock.append(
        this.dockButton("Tools", "pen", "tools"),
        this.dockButton("Color", "color", "color"),
        this.dockButton("Layers", "layers", "layers"),
        this.dockButton("Frames", "timeline", "timeline"),
        this.dockButton("More", "commands", "more"),
      );
      return;
    }
    this.dock.append(
      this.dockButton("Piano", "note", "audio-piano"),
      this.dockButton("Timeline", "timeline", "audio-timeline"),
      this.dockButton("Mixer", "sliders", "audio-mixer"),
      this.dockButton("Browser", "folder", "audio-browser"),
      this.dockButton("More", "commands", "audio-more"),
    );
  }

  private dockButton(
    label: string,
    icon: string,
    action: string,
  ): HTMLButtonElement {
    return createButton(label, icon, {
      "data-mobile-v2-dock-action": action,
      "aria-label": label,
    }, () => this.handleDockAction(action));
  }

  private handleDockAction(action: string): void {
    switch (action) {
      case "tools":
      case "color":
      case "layers":
      case "more":
        this.openSheet(action);
        return;
      case "timeline":
        this.openTimeline();
        return;
      case "audio-piano":
        clickFirst('[data-audio-editor-tab="PIANO"]');
        return;
      case "audio-timeline":
        this.openAudioDeck("audio-timeline");
        return;
      case "audio-mixer":
        this.openAudioDeck("audio-mixer");
        return;
      case "audio-browser":
        this.openAudioRight("browser");
        return;
      case "audio-more":
        this.openSheet("more");
        return;
    }
  }

  private openTimeline(): void {
    this.closeSheet();
    this.timelineOpen = true;
    clickFirst("[data-workspace-timeline-toggle]");
    this.syncMode();
  }

  private openAudioDeck(tab: string): void {
    this.closeSheet();
    this.timelineOpen = true;
    clickFirst(`[data-mode-deck-tab="${tab}"]`);
    this.syncMode();
  }

  private openSheet(kind: string): void {
    if (kind === "timeline") {
      this.openTimeline();
      return;
    }
    this.clearSheetBody();
    this.sheetKind = kind as MobileV2Sheet;
    this.sheet.hidden = false;
    this.root.dataset.mobileV2Sheet = this.sheetKind;
    const titles: Record<string, string> = {
      tools: "Tools",
      color: "Color",
      layers: "Layers",
      options: "Options",
      more: "More actions",
      "audio-right": "Audio panel",
    };
    this.sheetTitle.textContent = titles[kind] ?? "Details";
    if (kind === "tools") this.buildToolsSheet();
    else if (kind === "color") this.buildColorSheet();
    else if (kind === "layers") this.buildLayersSheet();
    else if (kind === "more") this.buildMoreSheet();
    else if (kind === "audio-right") this.buildAudioRightSheet();
  }

  private closeSheet(): void {
    this.sheet.hidden = true;
    this.sheetKind = "none";
    this.root.removeAttribute("data-mobile-v2-sheet");
    this.clearSheetBody();
  }

  private clearSheetBody(): void {
    this.restoreMovedNodes(new Set(["audio-controls"]));
    this.sheetBody.replaceChildren();
  }

  private buildToolsSheet(): void {
    const note = document.createElement("p");
    note.className = "draw2-mobile-v2-sheet-note";
    note.textContent =
      "Choose a tool. One finger draws; two fingers navigate the canvas.";
    const grid = document.createElement("div");
    grid.className = "draw2-mobile-v2-action-grid";
    const tools = [
      ["pen", "Pen", "pen"],
      ["eraser", "Eraser", "eraser"],
      ["fill", "Fill", "fill"],
      ["eyedropper", "Pick", "eyedropper"],
      ["line", "Line", "line"],
      ["rect", "Rect", "rect"],
      ["rect-fill", "Rect fill", "rect-fill"],
      ["ellipse", "Ellipse", "ellipse"],
      ["select", "Select", "select"],
      ["move", "Move", "expand"],
      ["pan", "Pan", "pan"],
    ] as const;
    for (const [tool, label, icon] of tools) {
      const source = query<HTMLElement>(`[data-workspace-tool="${tool}"]`);
      const button = createButton(label, icon, {
        "data-mobile-v2-tool": tool,
        "aria-pressed": String(source?.getAttribute("aria-pressed") === "true"),
      }, () => {
        source?.click();
        this.closeSheet();
      });
      grid.append(button);
    }
    this.sheetBody.append(note, grid);
  }

  private buildColorSheet(): void {
    const note = document.createElement("p");
    note.className = "draw2-mobile-v2-sheet-note";
    note.textContent = "Choose a palette color or open the full color editor.";
    this.sheetBody.append(note);
    const palette = query<HTMLElement>("#draw2MobilePaletteGrid");
    if (palette !== undefined) {
      this.rememberNode("mobile-palette", palette);
      this.sheetBody.append(palette);
    }
    const editor = query<HTMLElement>("#draw2WorkspaceColorEditor");
    if (editor !== undefined) this.showNode("color-editor", editor);
  }

  private buildLayersSheet(): void {
    const panel = query<HTMLElement>("#draw2WorkspacePanelLayers");
    if (panel !== undefined) this.showNode("layers-panel", panel);
    const add = createButton("Add layer", "add", {
      "data-mobile-v2-command": "add-layer",
    }, () => clickFirst('[data-workspace-command="add-layer"]'));
    add.classList.add("draw2-mobile-v2-sheet-primary");
    this.sheetBody.prepend(add);
  }

  private buildMoreSheet(): void {
    const note = document.createElement("p");
    note.className = "draw2-mobile-v2-sheet-note";
    note.textContent =
      "Less frequent workspace actions stay here so the canvas remains clear.";
    const grid = document.createElement("div");
    grid.className = "draw2-mobile-v2-action-grid";
    const commands = [
      ["Export", "export", "panel-export"],
      ["Canvas", "rect", "canvas-settings"],
      ["Preview", "play", "preview"],
      ["Commands", "commands", "command-palette"],
      ["Help", "help", "help-guide"],
    ] as const;
    for (const [label, icon, command] of commands) {
      grid.append(
        createButton(label, icon, { "data-mobile-v2-command": command }, () => {
          clickFirst(`[data-workspace-command="${command}"]`);
          if (command !== "command-palette") this.closeSheet();
        }),
      );
    }
    if (this.currentMode() === "AUDIO") {
      for (
        const [label, icon, tab] of [
          ["Inspector", "inspector", "inspector"],
          ["Browser", "folder", "browser"],
          ["Master", "sliders", "master"],
        ] as const
      ) {
        grid.append(createButton(label, icon, {
          "data-mobile-v2-audio-right": tab,
        }, () => this.openAudioRight(tab)));
      }
    }
    this.sheetBody.append(note, grid);
  }

  private buildAudioRightSheet(): void {
    const dock = query<HTMLElement>("#draw2AudioRightDock");
    if (dock !== undefined) {
      this.showNode("audio-right-dock", dock);
      dock.hidden = false;
    }
  }

  private openAudioRight(tab: string): void {
    this.openSheet("audio-right");
    clickFirst(`[data-audio-right-tab="${tab}"]`);
  }

  private showNode(key: string, node: HTMLElement): void {
    this.rememberNode(key, node);
    node.hidden = false;
    this.sheetBody.append(node);
  }

  private rememberNode(key: string, node: HTMLElement): void {
    if (this.originalLocations.has(key)) return;
    const parent = node.parentNode;
    if (parent === null) return;
    this.originalLocations.set(key, {
      node,
      parent,
      nextSibling: node.nextSibling,
      hidden: node.hidden === true,
    });
  }

  private restoreAllMovedNodes(): void {
    this.restoreMovedNodes();
  }

  private restoreMovedNodes(skipKeys: ReadonlySet<string> = new Set()): void {
    const entries = Array.from(this.originalLocations.entries()).reverse();
    for (const [key, entry] of entries) {
      if (skipKeys.has(key)) continue;
      entry.node.hidden = entry.hidden;
      if (entry.node.parentNode === entry.parent) continue;
      if (
        entry.nextSibling !== null &&
        entry.nextSibling.parentNode === entry.parent
      ) {
        entry.parent.insertBefore(entry.node, entry.nextSibling);
      } else {
        entry.parent.appendChild(entry.node);
      }
    }
  }
}

function bootstrapDraw2MobileV2(): void {
  const root = query<HTMLElement>("#draw2WorkspaceFrame");
  if (
    root === undefined || query<HTMLElement>("#draw2MobileV2App") !== undefined
  ) return;
  const controller = new Draw2MobileV2(root);
  let attempts = 0;
  const waitForWorkspace = (): void => {
    attempts += 1;
    if (root.dataset.workspaceProfile !== undefined || attempts >= 120) {
      controller.sync();
      return;
    }
    window.setTimeout(waitForWorkspace, 50);
  };
  waitForWorkspace();
}

if (typeof document !== "undefined") bootstrapDraw2MobileV2();
