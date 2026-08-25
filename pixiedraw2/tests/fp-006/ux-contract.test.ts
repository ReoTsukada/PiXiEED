import {
  resolveShortcutAction,
  validateCreationGuide,
  validateIconAction,
} from "../../src/fp-006/ux-contract.ts";
import type { IconAction } from "../../src/fp-006/contracts.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const validAction: IconAction = {
  id: "undo",
  icon: "arrow-left",
  accessibleName: "Undo",
  tooltip: "Undo last stroke",
  helpId: "editing.undo",
  shortcut: "mod+z",
  highRisk: false,
  disabled: false,
};

Deno.test("FP-006 icon-first actions retain accessible name, tooltip, help, and disabled reason", () => {
  assert(
    validateIconAction(validAction).length === 0,
    "valid icon action must pass",
  );
  const missing = validateIconAction({
    ...validAction,
    accessibleName: "",
    tooltip: "",
    helpId: "",
    disabled: true,
  });
  assert(
    missing.includes("ACCESSIBLE_NAME_MISSING"),
    "accessible name is mandatory",
  );
  assert(missing.includes("TOOLTIP_MISSING"), "tooltip is mandatory");
  assert(missing.includes("HELP_ID_MISSING"), "help id is mandatory");
  assert(
    missing.includes("DISABLED_REASON_MISSING"),
    "disabled reason is mandatory",
  );
  const dangerous = validateIconAction({
    ...validAction,
    highRisk: true,
  });
  assert(
    dangerous.includes("HIGH_RISK_ICON_ONLY"),
    "high-risk icon-only action must be rejected",
  );
});

Deno.test("FP-006 creation guide and shortcut boundary are explicit", () => {
  const actions = new Map([[validAction.id, validAction]]);
  assert(
    validateCreationGuide([{
      id: "step-1",
      title: "Draw",
      actionId: "undo",
      hint: "Make one stroke",
    }], actions).length === 0,
    "guide may reference validated actions",
  );
  assert(
    validateCreationGuide([{
      id: "step-2",
      title: "Missing",
      actionId: "nope",
      hint: "Explain",
    }], actions).includes("GUIDE_ACTION_MISSING:nope"),
    "guide cannot hide missing action",
  );
  assert(
    resolveShortcutAction(validAction, {
      inputEditing: false,
      modalOpen: false,
      sheetOpen: false,
      imeComposing: false,
      disabled: false,
    })?.commandId === "undo",
    "shortcut must resolve outside protected contexts",
  );
  assert(
    resolveShortcutAction(validAction, {
      inputEditing: true,
      modalOpen: false,
      sheetOpen: false,
      imeComposing: false,
      disabled: false,
    }) === undefined,
    "input editing must suppress global shortcuts",
  );
  assert(
    resolveShortcutAction(validAction, {
      inputEditing: false,
      modalOpen: true,
      sheetOpen: false,
      imeComposing: false,
      disabled: false,
    }) === undefined,
    "modal must suppress global shortcuts",
  );
});
