/** Versioned, DOM-free shortcut registry for Draw2 authoring and navigation. */

export type Draw2ShortcutCategory =
  | "Edit"
  | "Tools"
  | "Selection"
  | "View"
  | "Timeline"
  | "Workspace";

export type Draw2ShortcutMode = "COMMON" | "DRAW" | "AUDIO" | "GAME";

export interface Draw2Shortcut {
  readonly id: string;
  readonly version: 1;
  readonly category: Draw2ShortcutCategory;
  readonly label: string;
  readonly keys: string;
  readonly command: string;
  /** Undefined keeps the historical iDRAW registry behavior. */
  readonly mode?: Draw2ShortcutMode;
}

export const DRAW2_SHORTCUTS: readonly Draw2Shortcut[] = [
  {
    id: "undo",
    version: 1,
    mode: "COMMON",
    category: "Edit",
    label: "Undo",
    keys: "Mod+Z",
    command: "undo",
  },
  {
    id: "redo",
    version: 1,
    mode: "COMMON",
    category: "Edit",
    label: "Redo",
    keys: "Mod+Shift+Z",
    command: "redo",
  },
  {
    id: "copy",
    version: 1,
    category: "Edit",
    label: "Copy selection",
    keys: "Mod+C",
    command: "copy",
  },
  {
    id: "cut",
    version: 1,
    category: "Edit",
    label: "Cut selection",
    keys: "Mod+X",
    command: "cut",
  },
  {
    id: "paste",
    version: 1,
    category: "Edit",
    label: "Paste placement",
    keys: "Mod+V",
    command: "paste",
  },
  {
    id: "tool-pen",
    version: 1,
    category: "Tools",
    label: "Pen",
    keys: "P",
    command: "tool-pen",
  },
  {
    id: "tool-text",
    version: 1,
    category: "Tools",
    label: "Text",
    keys: "T",
    command: "tool-text",
  },
  {
    id: "tool-eraser",
    version: 1,
    category: "Tools",
    label: "Eraser",
    keys: "E",
    command: "tool-eraser",
  },
  {
    id: "tool-fill",
    version: 1,
    category: "Tools",
    label: "Fill",
    keys: "G",
    command: "tool-fill",
  },
  {
    id: "tool-eyedropper",
    version: 1,
    category: "Tools",
    label: "Eyedropper",
    keys: "I",
    command: "tool-eyedropper",
  },
  {
    id: "tool-line",
    version: 1,
    category: "Tools",
    label: "Line",
    keys: "L",
    command: "tool-line",
  },
  {
    id: "tool-rect",
    version: 1,
    category: "Tools",
    label: "Rectangle",
    keys: "R",
    command: "tool-rect",
  },
  {
    id: "tool-ellipse",
    version: 1,
    category: "Tools",
    label: "Ellipse",
    keys: "O",
    command: "tool-ellipse",
  },
  {
    id: "tool-circle",
    version: 1,
    category: "Tools",
    label: "Circle",
    keys: "Shift+O",
    command: "tool-circle",
  },
  {
    id: "tool-select",
    version: 1,
    category: "Tools",
    label: "Rectangle selection",
    keys: "M",
    command: "tool-select",
  },
  {
    id: "tool-select-lasso",
    version: 1,
    category: "Tools",
    label: "Freehand selection",
    keys: "Q",
    command: "tool-select-lasso",
  },
  {
    id: "tool-move",
    version: 1,
    category: "Tools",
    label: "Move active cel content / duplicate",
    keys: "V",
    command: "tool-move",
  },
  {
    id: "tool-pan",
    version: 1,
    category: "Tools",
    label: "Pan viewport",
    keys: "H",
    command: "tool-pan",
  },
  {
    id: "selection-confirm",
    version: 1,
    category: "Selection",
    label: "Confirm selection",
    keys: "Enter",
    command: "selection-confirm",
  },
  {
    id: "selection-cancel",
    version: 1,
    category: "Selection",
    label: "Cancel draft / preview",
    keys: "Esc",
    command: "selection-cancel",
  },
  {
    id: "selection-deselect",
    version: 1,
    category: "Selection",
    label: "Deselect",
    keys: "Mod+Shift+A",
    command: "selection-deselect",
  },
  {
    id: "selection-select-all",
    version: 1,
    category: "Selection",
    label: "Select all",
    keys: "Mod+A",
    command: "selection-select-all",
  },
  {
    id: "selection-add",
    version: 1,
    category: "Selection",
    label: "Temporarily add",
    keys: "Shift",
    command: "selection-add",
  },
  {
    id: "selection-subtract",
    version: 1,
    category: "Selection",
    label: "Temporarily subtract",
    keys: "Alt",
    command: "selection-subtract",
  },
  {
    id: "mirror-cycle",
    version: 1,
    category: "View",
    label: "Toggle mirror on/off",
    keys: "Shift+M",
    command: "mirror-cycle",
  },
  {
    id: "zoom-in",
    version: 1,
    category: "View",
    label: "Zoom in at pointer",
    keys: "+",
    command: "zoom-in",
  },
  {
    id: "zoom-out",
    version: 1,
    category: "View",
    label: "Zoom out",
    keys: "-",
    command: "zoom-out",
  },
  {
    id: "zoom-reset",
    version: 1,
    category: "View",
    label: "Zoom to 100%",
    keys: "0",
    command: "zoom-reset",
  },
  {
    id: "add-frame",
    version: 1,
    category: "Timeline",
    label: "Add frame",
    keys: ",",
    command: "add-frame",
  },
  {
    id: "duplicate-frame",
    version: 1,
    category: "Timeline",
    label: "Duplicate frame",
    keys: ".",
    command: "duplicate-frame",
  },
  {
    id: "toggle-playback",
    version: 1,
    mode: "COMMON",
    category: "Timeline",
    label: "Play / stop timeline",
    keys: "Space",
    command: "toggle-playback",
  },
  {
    id: "previous-frame",
    version: 1,
    category: "Timeline",
    label: "Previous frame",
    keys: "[",
    command: "previous-frame",
  },
  {
    id: "next-frame",
    version: 1,
    category: "Timeline",
    label: "Next frame",
    keys: "]",
    command: "next-frame",
  },
  {
    id: "previous-frame-arrow",
    version: 1,
    category: "Timeline",
    label: "Previous frame (canvas arrows)",
    keys: "ArrowLeft",
    command: "previous-frame",
  },
  {
    id: "next-frame-arrow",
    version: 1,
    category: "Timeline",
    label: "Next frame (canvas arrows)",
    keys: "ArrowRight",
    command: "next-frame",
  },
  {
    id: "previous-layer-arrow",
    version: 1,
    category: "Timeline",
    label: "Previous layer (canvas arrows)",
    keys: "ArrowUp",
    command: "previous-layer",
  },
  {
    id: "next-layer-arrow",
    version: 1,
    category: "Timeline",
    label: "Next layer (canvas arrows)",
    keys: "ArrowDown",
    command: "next-layer",
  },
  {
    id: "toggle-loop",
    version: 1,
    category: "Timeline",
    label: "Cycle playback mode",
    keys: "Shift+L",
    command: "toggle-loop",
  },
  {
    id: "toggle-onion",
    version: 1,
    category: "Timeline",
    label: "Toggle onion skin",
    keys: "Alt+O",
    command: "toggle-onion",
  },
  {
    id: "clear-cel",
    version: 1,
    category: "Timeline",
    label: "Clear active cel",
    keys: "Delete / Backspace",
    command: "clear-cel",
  },
  {
    id: "delete-selection",
    version: 1,
    category: "Selection",
    label: "Delete selected pixels",
    keys: "Mod+Delete / Mod+Backspace",
    command: "delete-selection",
  },
  {
    id: "command-palette",
    version: 1,
    mode: "COMMON",
    category: "Workspace",
    label: "Command Palette",
    keys: "Mod+K",
    command: "command-palette",
  },
  {
    id: "shortcuts",
    version: 1,
    mode: "COMMON",
    category: "Workspace",
    label: "Keyboard shortcuts",
    keys: "?",
    command: "shortcuts",
  },
  {
    id: "audio-save",
    version: 1,
    mode: "AUDIO",
    category: "Edit",
    label: "Save Audio Project",
    keys: "Mod+S",
    command: "audio-save",
  },
  {
    id: "audio-copy",
    version: 1,
    mode: "AUDIO",
    category: "Edit",
    label: "Copy selected notes or clips",
    keys: "Mod+C",
    command: "audio-copy",
  },
  {
    id: "audio-cut",
    version: 1,
    mode: "AUDIO",
    category: "Edit",
    label: "Cut selected notes or clips",
    keys: "Mod+X",
    command: "audio-cut",
  },
  {
    id: "audio-paste",
    version: 1,
    mode: "AUDIO",
    category: "Edit",
    label: "Paste notes or clips",
    keys: "Mod+V",
    command: "audio-paste",
  },
  {
    id: "audio-duplicate",
    version: 1,
    mode: "AUDIO",
    category: "Edit",
    label: "Duplicate selected notes or clips",
    keys: "Mod+D",
    command: "audio-duplicate",
  },
  {
    id: "audio-delete",
    version: 1,
    mode: "AUDIO",
    category: "Edit",
    label: "Delete selected notes or clips",
    keys: "Delete / Backspace",
    command: "audio-delete",
  },
  {
    id: "audio-split",
    version: 1,
    mode: "AUDIO",
    category: "Edit",
    label: "Split at playhead",
    keys: "S",
    command: "audio-split",
  },
  {
    id: "audio-nudge",
    version: 1,
    mode: "AUDIO",
    category: "Timeline",
    label: "Nudge selected notes",
    keys: "ArrowLeft / ArrowRight / ArrowUp / ArrowDown",
    command: "audio-nudge",
  },
  {
    id: "audio-nudge-bar",
    version: 1,
    mode: "AUDIO",
    category: "Timeline",
    label: "Nudge by one bar",
    keys: "Shift+ArrowLeft / Shift+ArrowRight",
    command: "audio-nudge-bar",
  },
  {
    id: "audio-selection-preview",
    version: 1,
    mode: "AUDIO",
    category: "Timeline",
    label: "Preview selection",
    keys: "Shift+Space",
    command: "audio-selection-preview",
  },
  {
    id: "audio-quantize",
    version: 1,
    mode: "AUDIO",
    category: "Timeline",
    label: "Preview quantize",
    keys: "Q",
    command: "audio-quantize",
  },
  {
    id: "audio-apply-quantize",
    version: 1,
    mode: "AUDIO",
    category: "Timeline",
    label: "Apply pending quantize",
    keys: "Enter",
    command: "audio-apply-quantize",
  },
  {
    id: "audio-step-input",
    version: 1,
    mode: "AUDIO",
    category: "Tools",
    label: "Toggle step input",
    keys: "I",
    command: "audio-step-input",
  },
  {
    id: "audio-swing",
    version: 1,
    mode: "AUDIO",
    category: "Timeline",
    label: "Apply swing",
    keys: "G",
    command: "audio-swing",
  },
  {
    id: "audio-humanize",
    version: 1,
    mode: "AUDIO",
    category: "Timeline",
    label: "Humanize selected notes",
    keys: "H",
    command: "audio-humanize",
  },
  {
    id: "audio-zoom-out",
    version: 1,
    mode: "AUDIO",
    category: "View",
    label: "Zoom Piano Roll out",
    keys: "- / [",
    command: "audio-zoom-out",
  },
  {
    id: "audio-zoom-in",
    version: 1,
    mode: "AUDIO",
    category: "View",
    label: "Zoom Piano Roll in",
    keys: "= / ]",
    command: "audio-zoom-in",
  },
  {
    id: "audio-loop",
    version: 1,
    mode: "AUDIO",
    category: "Workspace",
    label: "Toggle audio loop",
    keys: "L",
    command: "audio-loop",
  },
  {
    id: "audio-record",
    version: 1,
    mode: "AUDIO",
    category: "Workspace",
    label: "Toggle audio recording",
    keys: "R",
    command: "audio-record",
  },
  {
    id: "audio-test-tone",
    version: 1,
    mode: "AUDIO",
    category: "Workspace",
    label: "Play test tone",
    keys: "T",
    command: "audio-test-tone",
  },
  {
    id: "audio-timeline-add-bar",
    version: 1,
    mode: "AUDIO",
    category: "Timeline",
    label: "Add timeline bar",
    keys: "B",
    command: "audio-timeline-add-bar",
  },
  {
    id: "audio-timeline-move",
    version: 1,
    mode: "AUDIO",
    category: "Timeline",
    label: "Move selected timeline item",
    keys: "M",
    command: "audio-timeline-move",
  },
  {
    id: "game-move",
    version: 1,
    mode: "GAME",
    category: "Tools",
    label: "Move player in preview",
    keys: "ArrowLeft / ArrowRight / ArrowUp / ArrowDown / W / A / S / D",
    command: "game-move",
  },
  {
    id: "game-attack",
    version: 1,
    mode: "GAME",
    category: "Tools",
    label: "Attack in preview",
    keys: "J / K",
    command: "game-attack",
  },
  {
    id: "game-cancel-preview",
    version: 1,
    mode: "GAME",
    category: "Workspace",
    label: "Stop game preview",
    keys: "Esc",
    command: "game-cancel-preview",
  },
];

export interface Draw2ShortcutEvent {
  readonly key: string;
  readonly metaKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
}

export interface Draw2ShortcutContext {
  readonly modalOpen?: boolean;
  readonly sheetOpen?: boolean;
  readonly inputEditing?: boolean;
  readonly imeComposing?: boolean;
  /** The active workspace owner; omitted for the historical iDRAW path. */
  readonly mode?: Exclude<Draw2ShortcutMode, "COMMON">;
}

function normalizeKey(key: string): string {
  if (key === " ") return "space";
  if (key === "Escape") return "esc";
  return key.toLowerCase();
}

function normalizedEventKey(event: Draw2ShortcutEvent): string {
  const modifier = event.metaKey || event.ctrlKey ? "mod+" : "";
  // `?` and `+` are already the produced key value in KeyboardEvent.key;
  // do not encode the physical Shift used to produce the printable symbol.
  const printableSymbol = event.key === "?" || event.key === "+" ||
    event.key === "_";
  const shift = event.shiftKey && !printableSymbol ? "shift+" : "";
  const alt = event.altKey ? "alt+" : "";
  return `${modifier}${shift}${alt}${normalizeKey(event.key)}`;
}

function normalizedRegistryKeys(keys: string): readonly string[] {
  return keys.split(/\s*\/\s*/).map((entry) =>
    entry.toLowerCase().replace("escape", "esc").replace("space", "space")
  );
}

/** Returns the first active command, or undefined in protected editing contexts. */
export function resolveDraw2Shortcut(
  event: Draw2ShortcutEvent,
  context: Draw2ShortcutContext = {},
): Draw2Shortcut | undefined {
  if (
    context.modalOpen || context.sheetOpen || context.inputEditing ||
    context.imeComposing
  ) return undefined;
  const key = normalizedEventKey(event);
  const mode = context.mode ?? "DRAW";
  return DRAW2_SHORTCUTS.find((shortcut) =>
    (shortcut.mode === "COMMON" || shortcut.mode === mode ||
      (shortcut.mode === undefined && mode === "DRAW")) &&
    normalizedRegistryKeys(shortcut.keys).includes(key)
  );
}
