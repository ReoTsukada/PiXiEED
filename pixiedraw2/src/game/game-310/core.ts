/**
 * GAME-310 semantic input core.
 *
 * Pure values only: no DOM, network, filesystem, runtime, or editor imports.
 * A resolved event is intentionally small enough to feed GAME-300 Behavior IR.
 */

export type Device = "KEYBOARD" | "TOUCH" | "GAMEPAD" | "CUSTOM";
export type ActionId = string & { readonly __game310ActionId: unique symbol };
export type ContextId = string & { readonly __game310ContextId: unique symbol };
export type ControlId = string & { readonly __game310ControlId: unique symbol };

export type InputBinding =
  | { readonly device: "KEYBOARD"; readonly code: string; readonly modifiers?: readonly string[] }
  | { readonly device: "TOUCH"; readonly controlId: ControlId; readonly gesture?: "TAP" | "PRESS" | "SWIPE" }
  | { readonly device: "GAMEPAD"; readonly control: string; readonly axis?: "POSITIVE" | "NEGATIVE" }
  | { readonly device: "CUSTOM"; readonly controlId: ControlId; readonly signal: string };

export interface ActionDefinition {
  readonly actionId: ActionId;
  readonly label: string;
  readonly bindings: readonly InputBinding[];
}

export interface ActionContext {
  readonly contextId: ContextId;
  readonly priority: number;
  readonly enabled: boolean;
  readonly actions: readonly ActionDefinition[];
}

export interface ActionMap {
  readonly mapId: string;
  readonly ownerId: string;
  readonly projectId: string;
  readonly contexts: readonly ActionContext[];
}

export type SafeAreaAnchor = "TOP_START" | "TOP_END" | "BOTTOM_START" | "BOTTOM_END" | "CENTER";
export type Handedness = "LEFT" | "RIGHT" | "EITHER";

export interface ControlMetadata {
  readonly controlId: ControlId;
  readonly actionId: ActionId;
  readonly anchor: SafeAreaAnchor;
  /** Normalized [0, 1] position within the safe area. */
  readonly position: readonly [number, number];
  /** Normalized [0, 1] width/height; hit areas may not escape the safe area. */
  readonly size: readonly [number, number];
  readonly handedness: Handedness;
  readonly visible: boolean;
  readonly accessibleName: string;
  readonly focusOrder: number;
  readonly feedback: "NONE" | "VISUAL" | "HAPTIC" | "BOTH";
}

export interface ControlLayout {
  readonly ownerId: string;
  readonly projectId: string;
  readonly safeArea: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
  readonly controls: readonly ControlMetadata[];
}

export type InputEvent =
  | { readonly device: "KEYBOARD"; readonly code: string; readonly modifiers?: readonly string[]; readonly value?: number }
  | { readonly device: "TOUCH"; readonly controlId: ControlId; readonly gesture?: "TAP" | "PRESS" | "SWIPE"; readonly value?: number }
  | { readonly device: "GAMEPAD"; readonly control: string; readonly axis?: "POSITIVE" | "NEGATIVE"; readonly value?: number }
  | { readonly device: "CUSTOM"; readonly controlId: ControlId; readonly signal: string; readonly value?: number };

export interface ResolvedAction {
  readonly actionId: ActionId;
  readonly contextId: ContextId;
  readonly device: Device;
  readonly value: number;
  readonly consumed: boolean;
}

export type DiagnosticCode = "DUPLICATE_BINDING" | "AMBIGUOUS_PRIORITY" | "UNSAFE_BOUNDS" | "CALLER_MISMATCH" | "INVALID_MAP";
export interface Diagnostic { readonly code: DiagnosticCode; readonly path: string; readonly message: string; }
export interface ValidationResult { readonly valid: boolean; readonly diagnostics: readonly Diagnostic[]; }

export const asActionId = (value: string): ActionId => asIdentifier(value, "actionId") as ActionId;
export const asContextId = (value: string): ContextId => asIdentifier(value, "contextId") as ContextId;
export const asControlId = (value: string): ControlId => asIdentifier(value, "controlId") as ControlId;

function asIdentifier(value: string, label: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value)) throw new Error(`${label} must be a stable identifier.`);
  return value;
}

function bindingKey(binding: InputBinding): string {
  return JSON.stringify(binding);
}

function matches(binding: InputBinding, event: InputEvent): boolean {
  if (binding.device !== event.device) return false;
  if (binding.device === "KEYBOARD" && event.device === "KEYBOARD") {
    return binding.code === event.code && JSON.stringify(binding.modifiers ?? []) === JSON.stringify(event.modifiers ?? []);
  }
  if (binding.device === "TOUCH" && event.device === "TOUCH") return binding.controlId === event.controlId && (binding.gesture ?? "TAP") === (event.gesture ?? "TAP");
  if (binding.device === "GAMEPAD" && event.device === "GAMEPAD") return binding.control === event.control && binding.axis === event.axis;
  return binding.device === "CUSTOM" && event.device === "CUSTOM" && binding.controlId === event.controlId && binding.signal === event.signal;
}

export function validateActionMap(map: ActionMap, caller: Pick<ActionMap, "ownerId" | "projectId">, layout?: ControlLayout): ValidationResult {
  const diagnostics: Diagnostic[] = [];
  if (map.ownerId !== caller.ownerId || map.projectId !== caller.projectId) diagnostics.push({ code: "CALLER_MISMATCH", path: "map", message: "Action map caller does not own the project." });
  const seenContexts = new Set<string>();
  for (const [contextIndex, context] of map.contexts.entries()) {
    if (seenContexts.has(context.contextId)) diagnostics.push({ code: "INVALID_MAP", path: `contexts[${contextIndex}]`, message: "Duplicate context id." });
    seenContexts.add(context.contextId);
    const seenBindings = new Map<string, { priority: number; actionId: string }>();
    const actionIds = new Set<string>();
    for (const [actionIndex, action] of context.actions.entries()) {
      if (actionIds.has(action.actionId)) diagnostics.push({ code: "INVALID_MAP", path: `contexts[${contextIndex}].actions[${actionIndex}]`, message: "Duplicate action id." });
      actionIds.add(action.actionId);
      for (const [bindingIndex, binding] of action.bindings.entries()) {
        const key = bindingKey(binding);
        const prior = seenBindings.get(key);
        if (prior) {
          diagnostics.push({ code: "DUPLICATE_BINDING", path: `contexts[${contextIndex}].actions[${actionIndex}].bindings[${bindingIndex}]`, message: `Binding duplicates action ${prior.actionId}.` });
          if (prior.priority === context.priority && prior.actionId !== action.actionId) diagnostics.push({ code: "AMBIGUOUS_PRIORITY", path: `contexts[${contextIndex}]`, message: "Equal-priority bindings resolve to different actions." });
        } else seenBindings.set(key, { priority: context.priority, actionId: action.actionId });
      }
    }
  }
  if (layout) diagnostics.push(...validateControlLayout(layout, caller).diagnostics);
  return { valid: diagnostics.length === 0, diagnostics };
}

export function validateControlLayout(layout: ControlLayout, caller: Pick<ControlLayout, "ownerId" | "projectId">): ValidationResult {
  const diagnostics: Diagnostic[] = [];
  if (layout.ownerId !== caller.ownerId || layout.projectId !== caller.projectId) diagnostics.push({ code: "CALLER_MISMATCH", path: "layout", message: "Control layout caller does not own the project." });
  const inUnit = (value: number): boolean => Number.isFinite(value) && value >= 0 && value <= 1;
  for (const [index, control] of layout.controls.entries()) {
    const values = [...control.position, ...control.size];
    if (!values.every(inUnit) || control.size[0] <= 0 || control.size[1] <= 0 || control.position[0] + control.size[0] > 1 || control.position[1] + control.size[1] > 1 || !control.accessibleName.trim() || !Number.isInteger(control.focusOrder) || control.focusOrder < 0) {
      diagnostics.push({ code: "UNSAFE_BOUNDS", path: `controls[${index}]`, message: "Control bounds, accessibility metadata, or focus order is unsafe." });
    }
    if (!control.visible && control.actionId) diagnostics.push({ code: "UNSAFE_BOUNDS", path: `controls[${index}].visible`, message: "Critical controls may not be invisible." });
  }
  return { valid: diagnostics.length === 0, diagnostics };
}

export function resolveInput(map: ActionMap, event: InputEvent, caller: Pick<ActionMap, "ownerId" | "projectId">): ResolvedAction | undefined {
  if (!validateActionMap(map, caller).valid) return undefined;
  const candidates = map.contexts.filter((context) => context.enabled).flatMap((context) => context.actions.flatMap((action) => action.bindings.filter((binding) => matches(binding, event)).map(() => ({ context, action }))));
  candidates.sort((a, b) => b.context.priority - a.context.priority || String(a.action.actionId).localeCompare(String(b.action.actionId)));
  const winner = candidates[0];
  return winner ? { actionId: winner.action.actionId, contextId: winner.context.contextId, device: event.device, value: event.value ?? 1, consumed: true } : undefined;
}
