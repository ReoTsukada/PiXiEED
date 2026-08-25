import {
  asActionId, asContextId, asControlId, resolveInput, validateActionMap, validateControlLayout,
  type ActionMap, type ControlLayout,
} from "../../src/game/game-310/core.ts";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function has(result: { diagnostics: readonly { code: string }[] }, code: string): void { assert(result.diagnostics.some((item) => item.code === code), `expected ${code}`); }

const ownerId = "owner-game-310";
const projectId = "project-game-310";
const jump = asActionId("jump");
const gameplay = asContextId("gameplay");
const jumpControl = asControlId("jump-control");
const map: ActionMap = { mapId: "map", ownerId, projectId, contexts: [{ contextId: gameplay, priority: 10, enabled: true, actions: [
  { actionId: jump, label: "Jump", bindings: [
    { device: "KEYBOARD", code: "Space" }, { device: "TOUCH", controlId: jumpControl, gesture: "TAP" },
    { device: "GAMEPAD", control: "A" }, { device: "CUSTOM", controlId: jumpControl, signal: "jump" },
  ] },
] }] };

Deno.test("GAME310-SCOPE-001 semantic keyboard/touch/gamepad/custom actions resolve with context priority and consume", () => {
  for (const event of [
    { device: "KEYBOARD", code: "Space" } as const,
    { device: "TOUCH", controlId: jumpControl, gesture: "TAP" } as const,
    { device: "GAMEPAD", control: "A" } as const,
    { device: "CUSTOM", controlId: jumpControl, signal: "jump" } as const,
  ]) assert(resolveInput(map, event, { ownerId, projectId })?.actionId === jump, "all devices must resolve the same action");
  assert(resolveInput(map, { device: "KEYBOARD", code: "Escape" }, { ownerId, projectId }) === undefined, "unknown input must not resolve");
});

Deno.test("GAME310-SCOPE-001 context priority wins deterministically", () => {
  const menu = { contextId: asContextId("menu"), priority: 20, enabled: true, actions: [{ actionId: asActionId("confirm"), label: "Confirm", bindings: [{ device: "KEYBOARD" as const, code: "Space" }] }] };
  const result = resolveInput({ ...map, contexts: [map.contexts[0]!, menu] }, { device: "KEYBOARD", code: "Space" }, { ownerId, projectId });
  assert(result?.actionId === asActionId("confirm") && result.consumed, "higher context must consume the event");
});

Deno.test("GAME310-SCOPE-001 duplicate, ambiguous, unsafe bounds, and caller mismatch fail closed", () => {
  const duplicate = validateActionMap({ ...map, contexts: [{ ...map.contexts[0]!, actions: [{ ...map.contexts[0]!.actions[0]!, bindings: [{ device: "KEYBOARD", code: "Space" }, { device: "KEYBOARD", code: "Space" }] }] }] }, { ownerId, projectId });
  has(duplicate, "DUPLICATE_BINDING");
  const ambiguous = validateActionMap({ ...map, contexts: [{ ...map.contexts[0]!, actions: [...map.contexts[0]!.actions, { actionId: asActionId("other-action"), label: "Other", bindings: [{ device: "KEYBOARD" as const, code: "Space" }] }] }] }, { ownerId, projectId });
  has(ambiguous, "AMBIGUOUS_PRIORITY");
  const mismatch = validateActionMap(map, { ownerId: "other", projectId });
  has(mismatch, "CALLER_MISMATCH");
  const badLayout: ControlLayout = { ownerId, projectId, safeArea: { top: 0, right: 0, bottom: 0, left: 0 }, controls: [{ controlId: jumpControl, actionId: jump, anchor: "BOTTOM_END", position: [0.9, 0.9], size: [0.2, 0.2], handedness: "RIGHT", visible: false, accessibleName: "", focusOrder: -1, feedback: "NONE" }] };
  has(validateControlLayout(badLayout, { ownerId, projectId }), "UNSAFE_BOUNDS");
  assert(resolveInput(map, { device: "KEYBOARD", code: "Space" }, { ownerId: "other", projectId }) === undefined, "caller mismatch must resolve to no action");
});

Deno.test("GAME310-EVIDENCE-001 control metadata stays safe-area bounded and accessible", () => {
  const layout: ControlLayout = { ownerId, projectId, safeArea: { top: 0.05, right: 0.03, bottom: 0.08, left: 0.03 }, controls: [{ controlId: jumpControl, actionId: jump, anchor: "BOTTOM_END", position: [0.78, 0.78], size: [0.18, 0.18], handedness: "RIGHT", visible: true, accessibleName: "Jump", focusOrder: 1, feedback: "BOTH" }] };
  assert(validateControlLayout(layout, { ownerId, projectId }).valid, "bounded accessible control should pass");
});
