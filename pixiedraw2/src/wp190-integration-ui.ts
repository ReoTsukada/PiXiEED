/// <reference lib="dom" />

/**
 * Deterministic, local-only populated Workspace fixture for WP-190 audit.
 * It decorates the isolated Draw2 Entry only when `fixture=populated` is
 * explicitly requested. It is not Project persistence or production data.
 */

export type PopulatedPanel = "layers" | "color" | "inspector" | "timeline" | "tool-options";

export interface PopulatedFixtureResult {
  readonly ok: boolean;
  readonly fixture: "populated";
  readonly panel?: PopulatedPanel;
  readonly deterministic: true;
  readonly currentRouteUntouched: true;
}

function element<T extends HTMLElement>(documentRef: Document, tag: string, text: string, className?: string): T {
  const node = documentRef.createElement(tag) as T;
  node.textContent = text;
  if (className !== undefined) node.className = className;
  return node;
}

function populateLayers(documentRef: Document): void {
  const panel = documentRef.querySelector<HTMLElement>("#draw2WorkspacePanelLayers");
  if (panel === null) return;
  const summary = panel.querySelector<HTMLElement>(".draw2-panel-summary");
  if (summary === null) return;
  summary.replaceChildren(
    element(documentRef, "span", "LAYER / CEL", "draw2-eyebrow"),
    element(documentRef, "strong", "Character · 3 visible layers"),
    element(documentRef, "p", "Active Cel: Character / Frame 03 · Onion Skin ON"),
  );
  const list = element<HTMLUListElement>(documentRef, "ul", "", "wp190-layer-fixture-list");
  for (const [name, state] of [["Highlights", "visible · unlocked"], ["Character", "visible · active cel"], ["Background", "visible · locked"]] as const) {
    const row = element<HTMLLIElement>(documentRef, "li", "");
    row.append(element(documentRef, "strong", name), element(documentRef, "span", state));
    list.append(row);
  }
  summary.append(list);
}

function populateCanvas(documentRef: Document): void {
  const canvas = documentRef.querySelector<HTMLCanvasElement>("#draw2Canvas");
  const overlay = documentRef.querySelector<HTMLCanvasElement>("#draw2Overlay");
  if (canvas === null || overlay === null) return;
  const context = canvas.getContext("2d");
  const overlayContext = overlay.getContext("2d");
  if (context === null || overlayContext === null) return;
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const palette = ["#10151f", "#f5f7ff", "#ff5d73", "#5b8cff", "#ffd166", "#52d6a3"];
  context.fillStyle = palette[0] ?? "#10151f";
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const index = (x * 3 + y * 2 + (x > 6 && x < 10 && y > 3 && y < 13 ? 2 : 0)) % (palette.length - 1) + 1;
      context.fillStyle = palette[index] ?? palette[1] ?? "#f5f7ff";
      context.fillRect(48 + x * 10, 32 + y * 10, 10, 10);
    }
  }
  context.fillStyle = palette[2] ?? "#ff5d73";
  context.fillRect(98, 82, 60, 60);
  context.fillStyle = palette[3] ?? "#5b8cff";
  context.fillRect(108, 92, 40, 40);
  overlayContext.clearRect(0, 0, overlay.width, overlay.height);
  overlayContext.save();
  overlayContext.strokeStyle = "#ffd166";
  overlayContext.lineWidth = 2;
  overlayContext.setLineDash([6, 4]);
  overlayContext.strokeRect(88, 72, 80, 80);
  overlayContext.restore();
  canvas.dataset.wp190Artwork = "deterministic";
  overlay.dataset.wp190Selection = "active";
}

function populateTimeline(documentRef: Document): void {
  const status = documentRef.querySelector<HTMLElement>("#draw2TimelineStatus");
  if (status !== null) status.textContent = "frame=03/12 · layer=Character · onion=on";
  const toggle = documentRef.querySelector<HTMLButtonElement>("#draw2ToggleOnion");
  if (toggle !== null) {
    toggle.setAttribute("aria-pressed", "true");
    toggle.textContent = "Onion Skin On";
  }
  const windowElement = documentRef.querySelector<HTMLElement>("#draw2TimelineWindow");
  if (windowElement !== null) windowElement.dataset.wp190Fixture = "populated";
}

function populateInspector(documentRef: Document): void {
  const status = documentRef.querySelector<HTMLElement>("#draw2SelectionStatus");
  if (status !== null) status.textContent = "scope=Character / Frame 03 · selection=active 8×8";
  const values: Record<string, string> = {
    draw2SelectionX: "88",
    draw2SelectionY: "72",
    draw2SelectionWidth: "80",
    draw2SelectionHeight: "80",
    draw2TransformDx: "8",
    draw2TransformDy: "4",
  };
  for (const [id, value] of Object.entries(values)) {
    const input = documentRef.querySelector<HTMLInputElement>(`#${id}`);
    if (input !== null) input.value = value;
  }
}

function selectPanel(documentRef: Document, panel: PopulatedPanel): void {
  if (panel === "timeline") {
    documentRef.querySelector<HTMLElement>("#draw2WorkspaceTimelineRegion")?.scrollIntoView({ block: "nearest" });
    return;
  }
  const panelButton = documentRef.querySelector<HTMLElement>(`[data-workspace-panel="${panel}"]`);
  panelButton?.click();
}

export function bootstrapPopulatedWorkspaceFixture(documentRef: Document = document): PopulatedFixtureResult {
  const root = documentRef.querySelector<HTMLElement>("#draw2WorkspaceFrame");
  if (root === null) return { ok: false, fixture: "populated", deterministic: true, currentRouteUntouched: true };
  const params = new URLSearchParams(documentRef.defaultView?.location.search ?? "");
  if (params.get("fixture") !== "populated") return { ok: false, fixture: "populated", deterministic: true, currentRouteUntouched: true };
  root.dataset.integrationFixture = "populated";
  root.dataset.currentSystem = "untouched";
  documentRef.documentElement.dataset.wp190Fixture = "populated";
  const projectInput = documentRef.querySelector<HTMLInputElement>("#draw2ProjectId");
  if (projectInput !== null) projectInput.value = "wp190-populated-fixture";
  const projectStatus = documentRef.querySelector<HTMLElement>("#draw2Status");
  if (projectStatus !== null) projectStatus.textContent = "Populated fixture · local only · deterministic";
  populateLayers(documentRef);
  populateCanvas(documentRef);
  populateTimeline(documentRef);
  populateInspector(documentRef);
  const panel = (params.get("panel") ?? "layers") as PopulatedPanel;
  const supported: readonly PopulatedPanel[] = ["layers", "color", "inspector", "timeline", "tool-options"];
  if (supported.includes(panel)) {
    const mapped = panel === "tool-options" ? "inspector" : panel;
    documentRef.defaultView?.setTimeout(() => selectPanel(documentRef, mapped), 0);
  }
  return { ok: true, fixture: "populated", panel: supported.includes(panel) ? panel : "layers", deterministic: true, currentRouteUntouched: true };
}
