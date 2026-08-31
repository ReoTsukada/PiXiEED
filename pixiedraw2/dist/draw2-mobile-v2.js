// src/draw2-mobile-v2.ts
var ICON_SPRITE = "./assets/icons/draw2-icons.svg#";
function query(selector) {
  return document.querySelector(selector) ?? void 0;
}
function queryAll(selector) {
  return Array.from(document.querySelectorAll(selector));
}
function clickFirst(selector) {
  query(selector)?.click();
}
function createIcon(iconId) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("draw2-ui-icon");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `${ICON_SPRITE}${iconId.startsWith("icon-") ? iconId : `icon-${iconId}`}`);
  svg.append(use);
  return svg;
}
function createButton(label, icon, attributes = {}, handler) {
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
  if (handler !== void 0) button.addEventListener("click", handler);
  return button;
}
var Draw2MobileV2 = class {
  root;
  app;
  header;
  productNav;
  transport;
  dock;
  sheet;
  sheetTitle;
  sheetBody;
  originalLocations = /* @__PURE__ */ new Map();
  active = false;
  timelineOpen = false;
  sheetKind = "none";
  lastMode;
  constructor(root) {
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
      "aria-label": "Close detail sheet"
    }, () => this.closeSheet());
    close.classList.add("draw2-mobile-v2-icon-button");
    sheetHeader.append(this.sheetTitle, close);
    this.sheetBody = document.createElement("div");
    this.sheetBody.id = "draw2MobileV2SheetBody";
    this.sheetBody.className = "draw2-mobile-v2-sheet-body";
    this.sheet.append(sheetHeader, this.sheetBody);
    this.buildHeader();
    this.buildProductNav();
    this.app.append(this.header, this.productNav, this.transport, this.dock, this.sheet);
    this.root.append(this.app);
    this.bindObservers();
  }
  sync() {
    const profile = this.root.dataset.workspaceProfile;
    const creatorMode = this.root.dataset.creatorMode;
    const isDrawOrAudio = creatorMode === "DRAW" || creatorMode === "AUDIO";
    const shouldActivate = isDrawOrAudio && (profile === "mobile" || profile === "split");
    if (shouldActivate && !this.active) this.activate();
    if (!shouldActivate && this.active) this.deactivate();
    if (this.active) this.syncMode();
  }
  buildHeader() {
    const identity = document.createElement("div");
    identity.className = "draw2-mobile-v2-identity";
    const logo = query(".draw2-brand-logo")?.cloneNode(true);
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
    status.textContent = query("#draw2WorkspaceStatus")?.textContent?.trim() || "Local";
    copy.append(eyebrow, title, status);
    identity.append(copy);
    const actions = document.createElement("div");
    actions.className = "draw2-mobile-v2-header-actions";
    actions.append(createButton("Undo", "undo", {
      "data-mobile-v2-command": "undo",
      "aria-label": "Undo"
    }), createButton("Redo", "redo", {
      "data-mobile-v2-command": "redo",
      "aria-label": "Redo"
    }), createButton("More", "commands", {
      "data-mobile-v2-action": "open-more",
      "aria-label": "Open workspace menu"
    }, () => this.openSheet("more")));
    this.header.append(identity, actions);
    this.header.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("[data-mobile-v2-command]") : null;
      const command = target?.dataset.mobileV2Command;
      if (command !== void 0) {
        clickFirst(`[data-workspace-command="${command}"]`);
      }
    });
    const sourceStatus = query("#draw2WorkspaceStatus");
    if (sourceStatus !== void 0) {
      new MutationObserver(() => {
        const current = sourceStatus.textContent?.trim();
        if (current !== void 0 && current.length > 0) {
          status.textContent = current;
        }
      }).observe(sourceStatus, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }
  }
  buildProductNav() {
    const draw = createButton("Draw", "pen", {
      "data-mobile-v2-mode": "DRAW",
      role: "tab",
      "aria-selected": "true"
    }, () => this.setMode("DRAW"));
    const audio = createButton("Audio", "wave", {
      "data-mobile-v2-mode": "AUDIO",
      role: "tab",
      "aria-selected": "false"
    }, () => this.setMode("AUDIO"));
    audio.disabled = this.root.dataset.audioFeatureFlag !== "on";
    audio.title = audio.disabled ? "Audio is available from ?audio=on" : "Open Audio workspace";
    this.productNav.append(draw, audio);
  }
  bindObservers() {
    new MutationObserver(() => this.sync()).observe(this.root, {
      attributes: true,
      attributeFilter: [
        "data-workspace-profile",
        "data-creator-mode",
        "data-audio-feature-flag"
      ]
    });
    window.addEventListener("resize", () => this.sync(), {
      passive: true
    });
  }
  activate() {
    this.active = true;
    this.root.dataset.mobileV2 = "on";
    const audioControls = query("#draw2AudioGlobalControls");
    if (audioControls !== void 0) {
      this.rememberNode("audio-controls", audioControls);
      this.transport.append(audioControls);
    }
    this.syncMode();
  }
  deactivate() {
    this.closeSheet();
    this.restoreAllMovedNodes();
    this.active = false;
    this.root.dataset.mobileV2 = "off";
    this.root.removeAttribute("data-mobile-v2-mode");
  }
  currentMode() {
    return this.root.dataset.creatorMode === "AUDIO" && this.root.dataset.audioFeatureFlag === "on" ? "AUDIO" : "DRAW";
  }
  syncMode() {
    const mode = this.currentMode();
    const audio = mode === "AUDIO";
    const audioButton = query('[data-mobile-v2-mode="AUDIO"]');
    const audioAvailable = this.root.dataset.audioFeatureFlag === "on";
    if (audioButton !== void 0) {
      audioButton.disabled = !audioAvailable;
      audioButton.title = audioAvailable ? "Open Audio workspace" : "Audio is available from ?audio=on";
    }
    this.root.dataset.mobileV2Mode = mode;
    const modeButtons = queryAll("[data-mobile-v2-mode]");
    for (const button of modeButtons) {
      const selected = button.dataset.mobileV2Mode === mode;
      button.setAttribute("aria-selected", String(selected));
      button.classList.toggle("is-active", selected);
    }
    const audioControls = query("#draw2AudioGlobalControls");
    if (audioControls !== void 0) audioControls.hidden = !audio;
    const canvasSlot = query("#draw2WorkspaceCanvasSlot");
    if (canvasSlot !== void 0) canvasSlot.hidden = audio;
    const audioWorkspace = query("#draw2AudioWorkspace");
    if (audioWorkspace !== void 0) audioWorkspace.hidden = !audio;
    const timeline = query("#draw2WorkspaceTimelineRegion");
    const modeDeck = query("#draw2ModeTimelineDeck");
    if (timeline !== void 0) {
      const showTimeline = audio || this.timelineOpen;
      timeline.hidden = !showTimeline;
      timeline.setAttribute("aria-hidden", String(!showTimeline));
      this.root.dataset.mobileV2Timeline = showTimeline ? "on" : "off";
      if (audio && modeDeck !== void 0) modeDeck.hidden = false;
    }
    if (this.lastMode !== mode) {
      this.lastMode = mode;
      this.renderDock(mode);
    }
    if (!audio && this.sheetKind === "audio-right") this.closeSheet();
    if (audio && this.sheetKind !== "none" && this.sheetKind !== "audio-right") {
      this.closeSheet();
    }
  }
  setMode(mode) {
    if (mode === "AUDIO" && this.root.dataset.audioFeatureFlag !== "on") return;
    clickFirst(`.draw2-creator-mode[data-creator-mode="${mode}"]`);
    window.requestAnimationFrame(() => this.syncMode());
  }
  renderDock(mode) {
    this.dock.replaceChildren();
    if (mode === "DRAW") {
      this.dock.append(this.dockButton("Tools", "pen", "tools"), this.dockButton("Color", "color", "color"), this.dockButton("Layers", "layers", "layers"), this.dockButton("Frames", "timeline", "timeline"), this.dockButton("More", "commands", "more"));
      return;
    }
    this.dock.append(this.dockButton("Piano", "note", "audio-piano"), this.dockButton("Timeline", "timeline", "audio-timeline"), this.dockButton("Mixer", "sliders", "audio-mixer"), this.dockButton("Browser", "folder", "audio-browser"), this.dockButton("More", "commands", "audio-more"));
  }
  dockButton(label, icon, action) {
    return createButton(label, icon, {
      "data-mobile-v2-dock-action": action,
      "aria-label": label
    }, () => this.handleDockAction(action));
  }
  handleDockAction(action) {
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
  openTimeline() {
    this.closeSheet();
    this.timelineOpen = true;
    clickFirst("[data-workspace-timeline-toggle]");
    this.syncMode();
  }
  openAudioDeck(tab) {
    this.closeSheet();
    this.timelineOpen = true;
    clickFirst(`[data-mode-deck-tab="${tab}"]`);
    this.syncMode();
  }
  openSheet(kind) {
    if (kind === "timeline") {
      this.openTimeline();
      return;
    }
    this.clearSheetBody();
    this.sheetKind = kind;
    this.sheet.hidden = false;
    this.root.dataset.mobileV2Sheet = this.sheetKind;
    const titles = {
      tools: "Tools",
      color: "Color",
      layers: "Layers",
      options: "Options",
      more: "More actions",
      "audio-right": "Audio panel"
    };
    this.sheetTitle.textContent = titles[kind] ?? "Details";
    if (kind === "tools") this.buildToolsSheet();
    else if (kind === "color") this.buildColorSheet();
    else if (kind === "layers") this.buildLayersSheet();
    else if (kind === "more") this.buildMoreSheet();
    else if (kind === "audio-right") this.buildAudioRightSheet();
  }
  closeSheet() {
    this.sheet.hidden = true;
    this.sheetKind = "none";
    this.root.removeAttribute("data-mobile-v2-sheet");
    this.clearSheetBody();
  }
  clearSheetBody() {
    this.restoreMovedNodes(/* @__PURE__ */ new Set([
      "audio-controls"
    ]));
    this.sheetBody.replaceChildren();
  }
  buildToolsSheet() {
    const note = document.createElement("p");
    note.className = "draw2-mobile-v2-sheet-note";
    note.textContent = "Choose a tool. One finger draws; two fingers navigate the canvas.";
    const grid = document.createElement("div");
    grid.className = "draw2-mobile-v2-action-grid";
    const tools = [
      [
        "pen",
        "Pen",
        "pen"
      ],
      [
        "eraser",
        "Eraser",
        "eraser"
      ],
      [
        "fill",
        "Fill",
        "fill"
      ],
      [
        "eyedropper",
        "Pick",
        "eyedropper"
      ],
      [
        "line",
        "Line",
        "line"
      ],
      [
        "rect",
        "Rect",
        "rect"
      ],
      [
        "rect-fill",
        "Rect fill",
        "rect-fill"
      ],
      [
        "ellipse",
        "Ellipse",
        "ellipse"
      ],
      [
        "select",
        "Select",
        "select"
      ],
      [
        "move",
        "Move",
        "expand"
      ],
      [
        "pan",
        "Pan",
        "pan"
      ]
    ];
    for (const [tool, label, icon] of tools) {
      const source = query(`[data-workspace-tool="${tool}"]`);
      const button = createButton(label, icon, {
        "data-mobile-v2-tool": tool,
        "aria-pressed": String(source?.getAttribute("aria-pressed") === "true")
      }, () => {
        source?.click();
        this.closeSheet();
      });
      grid.append(button);
    }
    this.sheetBody.append(note, grid);
  }
  buildColorSheet() {
    const note = document.createElement("p");
    note.className = "draw2-mobile-v2-sheet-note";
    note.textContent = "Choose a palette color or open the full color editor.";
    this.sheetBody.append(note);
    const palette = query("#draw2MobilePaletteGrid");
    if (palette !== void 0) {
      this.rememberNode("mobile-palette", palette);
      this.sheetBody.append(palette);
    }
    const editor = query("#draw2WorkspaceColorEditor");
    if (editor !== void 0) this.showNode("color-editor", editor);
  }
  buildLayersSheet() {
    const panel = query("#draw2WorkspacePanelLayers");
    if (panel !== void 0) this.showNode("layers-panel", panel);
    const add = createButton("Add layer", "add", {
      "data-mobile-v2-command": "add-layer"
    }, () => clickFirst('[data-workspace-command="add-layer"]'));
    add.classList.add("draw2-mobile-v2-sheet-primary");
    this.sheetBody.prepend(add);
  }
  buildMoreSheet() {
    const note = document.createElement("p");
    note.className = "draw2-mobile-v2-sheet-note";
    note.textContent = "Less frequent workspace actions stay here so the canvas remains clear.";
    const grid = document.createElement("div");
    grid.className = "draw2-mobile-v2-action-grid";
    const commands = [
      [
        "Export",
        "export",
        "panel-export"
      ],
      [
        "Canvas",
        "rect",
        "canvas-settings"
      ],
      [
        "Preview",
        "play",
        "preview"
      ],
      [
        "Commands",
        "commands",
        "command-palette"
      ],
      [
        "Help",
        "help",
        "help-guide"
      ]
    ];
    for (const [label, icon, command] of commands) {
      grid.append(createButton(label, icon, {
        "data-mobile-v2-command": command
      }, () => {
        clickFirst(`[data-workspace-command="${command}"]`);
        if (command !== "command-palette") this.closeSheet();
      }));
    }
    if (this.currentMode() === "AUDIO") {
      for (const [label, icon, tab] of [
        [
          "Inspector",
          "inspector",
          "inspector"
        ],
        [
          "Browser",
          "folder",
          "browser"
        ],
        [
          "Master",
          "sliders",
          "master"
        ]
      ]) {
        grid.append(createButton(label, icon, {
          "data-mobile-v2-audio-right": tab
        }, () => this.openAudioRight(tab)));
      }
    }
    this.sheetBody.append(note, grid);
  }
  buildAudioRightSheet() {
    const dock = query("#draw2AudioRightDock");
    if (dock !== void 0) {
      this.showNode("audio-right-dock", dock);
      dock.hidden = false;
    }
  }
  openAudioRight(tab) {
    this.openSheet("audio-right");
    clickFirst(`[data-audio-right-tab="${tab}"]`);
  }
  showNode(key, node) {
    this.rememberNode(key, node);
    node.hidden = false;
    this.sheetBody.append(node);
  }
  rememberNode(key, node) {
    if (this.originalLocations.has(key)) return;
    const parent = node.parentNode;
    if (parent === null) return;
    this.originalLocations.set(key, {
      node,
      parent,
      nextSibling: node.nextSibling,
      hidden: node.hidden === true
    });
  }
  restoreAllMovedNodes() {
    this.restoreMovedNodes();
  }
  restoreMovedNodes(skipKeys = /* @__PURE__ */ new Set()) {
    const entries = Array.from(this.originalLocations.entries()).reverse();
    for (const [key, entry] of entries) {
      if (skipKeys.has(key)) continue;
      entry.node.hidden = entry.hidden;
      if (entry.node.parentNode === entry.parent) continue;
      if (entry.nextSibling !== null && entry.nextSibling.parentNode === entry.parent) {
        entry.parent.insertBefore(entry.node, entry.nextSibling);
      } else {
        entry.parent.appendChild(entry.node);
      }
    }
  }
};
function bootstrapDraw2MobileV2() {
  const root = query("#draw2WorkspaceFrame");
  if (root === void 0 || query("#draw2MobileV2App") !== void 0) return;
  const controller = new Draw2MobileV2(root);
  let attempts = 0;
  const waitForWorkspace = () => {
    attempts += 1;
    if (root.dataset.workspaceProfile !== void 0 || attempts >= 120) {
      controller.sync();
      return;
    }
    window.setTimeout(waitForWorkspace, 50);
  };
  waitForWorkspace();
}
if (typeof document !== "undefined") bootstrapDraw2MobileV2();
