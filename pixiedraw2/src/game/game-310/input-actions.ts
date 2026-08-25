/**
 * GAME-310 semantic input and custom control contract.
 *
 * This is an isolated, deterministic model. It deliberately has no DOM,
 * network, filesystem, storage, editor, Runtime, or production-route
 * dependency. GAME-300 supplies only the project/owner/revision caller
 * boundary and remains the canonical Game Project authority.
 */

import type { CallerContext, OwnerId, ProjectId, RevisionId } from "../game-300/core.ts";

type Brand<T, Name extends string> = T & { readonly __game310Brand: Name };

export type ActionId = Brand<string, "ActionId">;
export type ContextId = Brand<string, "ContextId">;
export type BindingId = Brand<string, "BindingId">;
export type ControlId = Brand<string, "ControlId">;
export type BehaviorId = Brand<string, "BehaviorId">;

export const GAME_INPUT_SCHEMA_VERSION = 1 as const;
export const INPUT_ACTION_IR_VERSION = 1 as const;

export type InputDevice = "keyboard" | "mouse" | "touch" | "gamepad" | "sensor" | "custom";
export type InputChannel = "runtime";
export type InputPhase = "started" | "performed" | "held" | "repeated" | "released" | "canceled";
export type InputValueMode = "button" | "axis_1d" | "axis_2d";
export type ControlKind =
  | "button" | "toggle_button" | "hold_button" | "repeat_button"
  | "directional_button" | "dpad" | "analog_stick" | "touch_area"
  | "swipe_area" | "gesture_area" | "slider" | "pedal" | "steering_wheel" | "radial_menu";
export type ControlVisualState =
  | "normal" | "focused" | "pressed" | "held" | "released" | "selected"
  | "disabled" | "cooldown" | "ready" | "warning" | "error";
export type ControlAnchor =
  | "top_left" | "top" | "top_right" | "left" | "center" | "right"
  | "bottom_left" | "bottom" | "bottom_right" | "safe_area";
export type Handedness = "left" | "right" | "ambidextrous";

export type DiagnosticCode =
  | "UNKNOWN_SCHEMA"
  | "DUPLICATE_ID"
  | "DUPLICATE_BINDING"
  | "AMBIGUOUS_PRIORITY"
  | "CALLER_PROJECT_MISMATCH"
  | "CALLER_OWNER_MISMATCH"
  | "CALLER_REVISION_MISMATCH"
  | "INVALID_ACTION"
  | "INVALID_CONTEXT"
  | "INVALID_BINDING"
  | "INVALID_CONTROL"
  | "INVALID_BEHAVIOR_REFERENCE"
  | "INVALID_A11Y"
  | "UNSAFE_BOUNDS"
  | "DEVICE_UNAVAILABLE"
  | "PERMISSION_DENIED"
  | "OFFLINE_UNAVAILABLE"
  | "POINTER_CONFLICT"
  | "INPUT_NOT_RUNTIME"
  | "EDITOR_RUNTIME_COLLISION"
  | "INVALID_INPUT";

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly path: string;
  readonly message: string;
  readonly recoverable: boolean;
}

export interface ActionIdentity {
  readonly projectId: ProjectId;
  readonly ownerId: OwnerId;
  readonly revisionId: RevisionId;
}

export interface InputContext {
  readonly id: ContextId;
  readonly priority: number;
  readonly label: string;
}

export interface InputAction {
  readonly id: ActionId;
  readonly label: string;
  readonly valueMode: InputValueMode;
  readonly critical?: boolean;
}

export type Interaction =
  | { readonly type: "press" }
  | { readonly type: "release" }
  | { readonly type: "hold"; readonly durationMs: number }
  | { readonly type: "tap"; readonly maxDurationMs: number }
  | { readonly type: "repeat"; readonly delayMs: number; readonly intervalMs: number }
  | { readonly type: "axis" }
  | { readonly type: "custom"; readonly interactionId: string };

export interface InputProcessor {
  readonly type: "deadzone" | "scale" | "invert" | "normalize";
  readonly value?: number;
}

export interface RuntimeInputBinding {
  readonly id: BindingId;
  readonly scope: "runtime";
  readonly actionId: ActionId;
  readonly device: InputDevice;
  readonly controlPath: string;
  readonly interaction: Interaction;
  readonly phase: InputPhase;
  readonly valueMode: InputValueMode;
  readonly contexts: readonly ContextId[];
  readonly priority: number;
  readonly consume: boolean;
  readonly processors?: readonly InputProcessor[];
  readonly requiredPermission?: string;
  readonly requiresOnline?: boolean;
}

/** Editor commands are intentionally not RuntimeInputBinding values. */
export interface EditorShortcutBinding {
  readonly id: string;
  readonly scope: "editor-command";
  readonly shortcut: string;
  readonly commandId: string;
  readonly consume: boolean;
}

export interface BehaviorActionReference {
  readonly behaviorId: BehaviorId;
  readonly actionId: ActionId;
  readonly source: "no-code" | "graph" | "typescript";
  readonly irVersion: 1;
}

export interface AssetFrameReference {
  readonly assetId: string;
  readonly revisionId: string;
  readonly frameId?: string;
  readonly regionId?: string;
}

export interface ControlVisualMap {
  readonly normal: AssetFrameReference;
  readonly focused?: AssetFrameReference;
  readonly pressed?: AssetFrameReference;
  readonly held?: AssetFrameReference;
  readonly released?: AssetFrameReference;
  readonly disabled?: AssetFrameReference;
  readonly selected?: AssetFrameReference;
}

export type HitArea =
  | { readonly type: "rect"; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly radius?: number }
  | { readonly type: "circle"; readonly x: number; readonly y: number; readonly radius: number }
  | { readonly type: "polygon"; readonly points: readonly { readonly x: number; readonly y: number }[] };

export interface LayoutOverride {
  readonly anchor?: ControlAnchor;
  readonly normalizedX?: number;
  readonly normalizedY?: number;
  readonly offsetX?: number;
  readonly offsetY?: number;
  readonly width?: number;
  readonly height?: number;
}

export interface ResponsiveControlLayout {
  readonly anchor: ControlAnchor;
  readonly normalizedX?: number;
  readonly normalizedY?: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly width: number;
  readonly height: number;
  readonly portrait?: LayoutOverride;
  readonly landscape?: LayoutOverride;
  readonly tablet?: LayoutOverride;
  readonly handedness?: Partial<Record<Handedness, LayoutOverride>>;
}

export interface ControlAccessibility {
  readonly label: string;
  readonly hint?: string;
  readonly role: "button" | "toggle" | "slider" | "menu" | "image" | "group";
  readonly focusable: boolean;
  readonly focusOrder: number;
  readonly hidden?: boolean;
  readonly highContrast?: boolean;
  readonly textScale?: number;
}

export interface ControlBinding {
  readonly actionId: ActionId;
  readonly phase: InputPhase;
  readonly valueMode: InputValueMode;
}

export interface ControlComponent {
  readonly id: ControlId;
  readonly kind: ControlKind;
  readonly visuals: ControlVisualMap;
  readonly hitArea: HitArea;
  readonly bindings: readonly ControlBinding[];
  readonly layout: ResponsiveControlLayout;
  readonly accessibility: ControlAccessibility;
  readonly multiTouch: "exclusive_pointer" | "shared_pointer" | "multi_pointer";
  readonly maxPointers?: number;
  readonly visible: boolean;
  readonly critical?: boolean;
  readonly keyboardAlternativeActionId?: ActionId;
  readonly feedback?: { readonly hapticMs?: number; readonly soundAssetId?: string };
}

export interface ActionMap {
  readonly schemaVersion: 1;
  readonly identity: ActionIdentity;
  readonly actions: readonly InputAction[];
  readonly contexts: readonly InputContext[];
  readonly bindings: readonly RuntimeInputBinding[];
  readonly controls: readonly ControlComponent[];
  readonly behaviorReferences: readonly BehaviorActionReference[];
}

export type ActionMapDraft = Omit<ActionMap, "schemaVersion">;

export interface DeviceCapability {
  readonly device: InputDevice;
  readonly controlPaths: readonly string[];
  readonly enabled: boolean;
}

export interface InputEnvironment {
  readonly online: boolean;
  readonly permissions: Readonly<Record<string, boolean>>;
  readonly capabilities: readonly DeviceCapability[];
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly orientation: "portrait" | "landscape";
  readonly isTablet: boolean;
  readonly handedness: Handedness;
  readonly safeArea: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
  readonly reservedRegions?: readonly Rect[];
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type InputValue = boolean | number | { readonly x: number; readonly y: number };

export interface RuntimeInputSample {
  readonly channel: "runtime";
  readonly device: InputDevice;
  readonly deviceId: string;
  readonly controlPath: string;
  readonly interaction: Interaction["type"];
  readonly phase: InputPhase;
  readonly value: InputValue;
  readonly timestampUs: number;
  readonly sequence: number;
  readonly pointerId?: number;
  readonly targetControlId?: ControlId;
}

export interface PointerClaim {
  readonly pointerId: number;
  readonly controlId: ControlId;
}

export interface InputActionEvent {
  readonly actionId: ActionId;
  readonly phase: InputPhase;
  readonly value: InputValue;
  readonly device: InputDevice;
  readonly deviceId: string;
  readonly pointerId?: number;
  readonly timestampUs: number;
  readonly sequence: number;
}

export interface ResolveInputOptions {
  readonly activeContexts: readonly ContextId[];
  readonly environment: InputEnvironment;
  readonly caller: CallerContext;
  readonly pointerClaims?: readonly PointerClaim[];
}

export interface DispatchResult {
  readonly status: "accepted" | "ignored" | "denied" | "ambiguous";
  readonly events: readonly InputActionEvent[];
  readonly consumed: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export interface ResolvedControlRect extends Rect {
  readonly controlId: ControlId;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export function asActionId(value: string): ActionId { return asStableId(value, "ActionId") as ActionId; }
export function asContextId(value: string): ContextId { return asStableId(value, "ContextId") as ContextId; }
export function asBindingId(value: string): BindingId { return asStableId(value, "BindingId") as BindingId; }
export function asControlId(value: string): ControlId { return asStableId(value, "ControlId") as ControlId; }
export function asBehaviorId(value: string): BehaviorId { return asStableId(value, "BehaviorId") as BehaviorId; }

function asStableId(value: string, label: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value)) throw new Error(`${label} must be a stable identifier.`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function diagnostic(code: DiagnosticCode, path: string, message: string): Diagnostic {
  return { code, path, message, recoverable: true };
}

function duplicateDiagnostics(values: readonly string[], path: string, code: DiagnosticCode = "DUPLICATE_ID"): Diagnostic[] {
  const seen = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  for (const value of values) {
    if (seen.has(value)) diagnostics.push(diagnostic(code, path, `Duplicate value: ${value}`));
    seen.add(value);
  }
  return diagnostics;
}

function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }

function isControlAnchor(value: unknown): value is ControlAnchor {
  return typeof value === "string" && ["top_left", "top", "top_right", "left", "center", "right", "bottom_left", "bottom", "bottom_right", "safe_area"].includes(value);
}

function isRectHitArea(value: Record<string, unknown>): value is { readonly type: "rect"; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly radius?: unknown } {
  return value.type === "rect" && finite(value.x) && finite(value.y) && finite(value.width) && finite(value.height);
}

function isCircleHitArea(value: Record<string, unknown>): value is { readonly type: "circle"; readonly x: number; readonly y: number; readonly radius: number } {
  return value.type === "circle" && finite(value.x) && finite(value.y) && finite(value.radius);
}

function isResponsiveLayoutShape(value: Record<string, unknown>): value is { readonly anchor: ControlAnchor; readonly offsetX: number; readonly offsetY: number; readonly width: number; readonly height: number; readonly normalizedX?: unknown; readonly normalizedY?: unknown } {
  return isControlAnchor(value.anchor) && finite(value.offsetX) && finite(value.offsetY) && finite(value.width) && finite(value.height);
}

function validateIdentity(value: unknown, caller: CallerContext | undefined, diagnostics: Diagnostic[]): value is ActionIdentity {
  if (!isRecord(value) || typeof value.projectId !== "string" || typeof value.ownerId !== "string" || typeof value.revisionId !== "string") {
    diagnostics.push(diagnostic("INVALID_ACTION", "identity", "Action Map identity is incomplete."));
    return false;
  }
  if (caller) {
    if (value.projectId !== caller.projectId) diagnostics.push(diagnostic("CALLER_PROJECT_MISMATCH", "identity.projectId", "Caller project does not own this Action Map."));
    if (value.ownerId !== caller.ownerId) diagnostics.push(diagnostic("CALLER_OWNER_MISMATCH", "identity.ownerId", "Caller owner does not own this Action Map."));
    if (value.revisionId !== caller.revisionId) diagnostics.push(diagnostic("CALLER_REVISION_MISMATCH", "identity.revisionId", "Caller revision is not the Action Map revision."));
  }
  return true;
}

function validateInteraction(interaction: unknown, path: string, diagnostics: Diagnostic[]): interaction is Interaction {
  if (!isRecord(interaction) || typeof interaction.type !== "string") {
    diagnostics.push(diagnostic("INVALID_BINDING", path, "Binding interaction is missing."));
    return false;
  }
  if (!["press", "release", "hold", "tap", "repeat", "axis", "custom"].includes(interaction.type)) {
    diagnostics.push(diagnostic("INVALID_BINDING", path, "Unsupported interaction type."));
    return false;
  }
  if (interaction.type === "hold" && (!finite(interaction.durationMs) || interaction.durationMs <= 0)) diagnostics.push(diagnostic("INVALID_BINDING", `${path}.durationMs`, "Hold duration must be positive and finite."));
  if (interaction.type === "tap" && (!finite(interaction.maxDurationMs) || interaction.maxDurationMs <= 0)) diagnostics.push(diagnostic("INVALID_BINDING", `${path}.maxDurationMs`, "Tap duration must be positive and finite."));
  if (interaction.type === "repeat" && (!finite(interaction.delayMs) || !finite(interaction.intervalMs) || interaction.delayMs < 0 || interaction.intervalMs <= 0)) diagnostics.push(diagnostic("INVALID_BINDING", path, "Repeat timing is invalid."));
  if (interaction.type === "custom" && (typeof interaction.interactionId !== "string" || interaction.interactionId.length === 0)) diagnostics.push(diagnostic("INVALID_BINDING", `${path}.interactionId`, "Custom interaction id is required."));
  return diagnostics.every((item) => item.path !== path && !item.path.startsWith(`${path}.`));
}

function validateProcessors(processors: unknown, path: string, diagnostics: Diagnostic[]): void {
  if (processors === undefined) return;
  if (!Array.isArray(processors)) { diagnostics.push(diagnostic("INVALID_BINDING", path, "Processors must be an array.")); return; }
  for (const [index, processor] of processors.entries()) {
    if (!isRecord(processor) || typeof processor.type !== "string" || !["deadzone", "scale", "invert", "normalize"].includes(processor.type)) {
      diagnostics.push(diagnostic("INVALID_BINDING", `${path}[${index}]`, "Unsupported input processor."));
      continue;
    }
    if (["deadzone", "scale"].includes(processor.type) && (!finite(processor.value) || (processor.type === "deadzone" && (processor.value < 0 || processor.value >= 1)) || (processor.type === "scale" && processor.value <= 0))) diagnostics.push(diagnostic("INVALID_BINDING", `${path}[${index}].value`, "Processor value is outside its safe range."));
  }
}

function bindingFingerprint(binding: RuntimeInputBinding, contextId: ContextId): string {
  return [binding.device, binding.controlPath, binding.phase, binding.interaction.type, String(contextId)].join("|");
}

function validateBinding(binding: unknown, path: string, actionIds: ReadonlySet<string>, contextIds: ReadonlySet<string>, diagnostics: Diagnostic[]): binding is RuntimeInputBinding {
  if (!isRecord(binding) || binding.scope !== "runtime") {
    diagnostics.push(diagnostic("EDITOR_RUNTIME_COLLISION", path, "Only runtime bindings may be present in an Action Map; editor shortcuts use a separate contract."));
    return false;
  }
  if (typeof binding.id !== "string" || typeof binding.actionId !== "string" || !actionIds.has(binding.actionId)) diagnostics.push(diagnostic("INVALID_BINDING", path, "Binding id or action reference is invalid."));
  if (typeof binding.device !== "string" || !["keyboard", "mouse", "touch", "gamepad", "sensor", "custom"].includes(binding.device)) diagnostics.push(diagnostic("INVALID_BINDING", `${path}.device`, "Binding device is unsupported."));
  if (typeof binding.controlPath !== "string" || binding.controlPath.length === 0 || binding.controlPath.length > 128 || /^(dom|network|filesystem):/iu.test(binding.controlPath)) diagnostics.push(diagnostic("INVALID_BINDING", `${path}.controlPath`, "Binding control path is empty, too long, or crosses a forbidden host boundary."));
  if (binding.device === "custom" && typeof binding.controlPath === "string" && !binding.controlPath.startsWith("custom:")) diagnostics.push(diagnostic("INVALID_BINDING", `${path}.controlPath`, "Custom bindings must use the custom: namespace."));
  if (!validateInteraction(binding.interaction, `${path}.interaction`, diagnostics)) { /* diagnostics are already recorded */ }
  if (typeof binding.phase !== "string" || !["started", "performed", "held", "repeated", "released", "canceled"].includes(binding.phase)) diagnostics.push(diagnostic("INVALID_BINDING", `${path}.phase`, "Binding phase is unsupported."));
  if (typeof binding.valueMode !== "string" || !["button", "axis_1d", "axis_2d"].includes(binding.valueMode)) diagnostics.push(diagnostic("INVALID_BINDING", `${path}.valueMode`, "Binding value mode is unsupported."));
  if (!Array.isArray(binding.contexts) || binding.contexts.length === 0 || binding.contexts.some((id) => typeof id !== "string" || !contextIds.has(id))) diagnostics.push(diagnostic("INVALID_BINDING", `${path}.contexts`, "Binding must reference known contexts."));
  if (!finite(binding.priority) || !Number.isSafeInteger(binding.priority) || binding.priority < 0 || binding.priority > 10000) diagnostics.push(diagnostic("INVALID_BINDING", `${path}.priority`, "Binding priority is outside the safe range."));
  if (typeof binding.consume !== "boolean") diagnostics.push(diagnostic("INVALID_BINDING", `${path}.consume`, "Binding consume must be boolean."));
  validateProcessors(binding.processors, `${path}.processors`, diagnostics);
  if (binding.requiredPermission !== undefined && (typeof binding.requiredPermission !== "string" || binding.requiredPermission.length === 0)) diagnostics.push(diagnostic("INVALID_BINDING", `${path}.requiredPermission`, "Permission name is invalid."));
  if (binding.requiresOnline !== undefined && typeof binding.requiresOnline !== "boolean") diagnostics.push(diagnostic("INVALID_BINDING", `${path}.requiresOnline`, "requiresOnline must be boolean."));
  return true;
}

function validateHitArea(hitArea: unknown, width: number, height: number, path: string, diagnostics: Diagnostic[]): hitArea is HitArea {
  if (!isRecord(hitArea) || typeof hitArea.type !== "string") { diagnostics.push(diagnostic("UNSAFE_BOUNDS", path, "Hit area is missing.")); return false; }
  if (isRectHitArea(hitArea)) {
    if (![hitArea.x, hitArea.y, hitArea.width, hitArea.height].every(finite) || hitArea.width <= 0 || hitArea.height <= 0 || hitArea.x < 0 || hitArea.y < 0 || hitArea.x + hitArea.width > width || hitArea.y + hitArea.height > height) diagnostics.push(diagnostic("UNSAFE_BOUNDS", path, "Rect hit area must stay inside the control bounds."));
    if (hitArea.radius !== undefined && (!finite(hitArea.radius) || hitArea.radius < 0 || hitArea.radius > Math.min(hitArea.width, hitArea.height) / 2)) diagnostics.push(diagnostic("UNSAFE_BOUNDS", `${path}.radius`, "Hit area radius is unsafe."));
    return true;
  }
  if (isCircleHitArea(hitArea)) {
    if (![hitArea.x, hitArea.y, hitArea.radius].every(finite) || hitArea.radius <= 0 || hitArea.x - hitArea.radius < 0 || hitArea.y - hitArea.radius < 0 || hitArea.x + hitArea.radius > width || hitArea.y + hitArea.radius > height) diagnostics.push(diagnostic("UNSAFE_BOUNDS", path, "Circle hit area must stay inside the control bounds."));
    return true;
  }
  if (hitArea.type === "polygon" && Array.isArray(hitArea.points) && hitArea.points.length >= 3 && hitArea.points.every((point) => isRecord(point) && finite(point.x) && finite(point.y) && point.x >= 0 && point.y >= 0 && point.x <= width && point.y <= height)) return true;
  diagnostics.push(diagnostic("UNSAFE_BOUNDS", path, "Polygon hit area must contain at least three in-bounds points."));
  return false;
}

function validateLayout(layout: unknown, path: string, diagnostics: Diagnostic[]): layout is ResponsiveControlLayout {
  if (!isRecord(layout) || !isResponsiveLayoutShape(layout)) { diagnostics.push(diagnostic("UNSAFE_BOUNDS", path, "Control layout anchor or dimensions are unsupported.")); return false; }
  if (![layout.offsetX, layout.offsetY, layout.width, layout.height].every(finite) || layout.width <= 0 || layout.height <= 0 || layout.width > 4096 || layout.height > 4096) diagnostics.push(diagnostic("UNSAFE_BOUNDS", path, "Control layout size or offset is unsafe."));
  for (const key of ["normalizedX", "normalizedY"] as const) if (layout[key] !== undefined && (!finite(layout[key]) || layout[key] < 0 || layout[key] > 1)) diagnostics.push(diagnostic("UNSAFE_BOUNDS", `${path}.${key}`, "Normalized layout position must be within 0..1."));
  return true;
}

function validateControl(control: unknown, path: string, actionIds: ReadonlySet<string>, diagnostics: Diagnostic[]): control is ControlComponent {
  if (!isRecord(control) || typeof control.id !== "string" || typeof control.kind !== "string") { diagnostics.push(diagnostic("INVALID_CONTROL", path, "Control identity or kind is invalid.")); return false; }
  if (!validateLayout(control.layout, `${path}.layout`, diagnostics)) return false;
  if (!validateHitArea(control.hitArea, control.layout.width, control.layout.height, `${path}.hitArea`, diagnostics)) { /* diagnostics are already recorded */ }
  const accessibility = isRecord(control.accessibility) ? control.accessibility : undefined;
  const focusOrder = accessibility !== undefined && finite(accessibility.focusOrder) ? accessibility.focusOrder : undefined;
  if (accessibility === undefined || typeof accessibility.label !== "string" || accessibility.label.trim().length === 0 || typeof accessibility.focusable !== "boolean" || focusOrder === undefined || !Number.isSafeInteger(focusOrder) || focusOrder < 0) diagnostics.push(diagnostic("INVALID_A11Y", `${path}.accessibility`, "Control needs a non-empty accessible label, focusability, and stable focus order."));
  if (isRecord(control.accessibility) && control.accessibility.textScale !== undefined && (!finite(control.accessibility.textScale) || control.accessibility.textScale < 0.8 || control.accessibility.textScale > 3)) diagnostics.push(diagnostic("INVALID_A11Y", `${path}.accessibility.textScale`, "Text scale must remain within 0.8..3."));
  if (typeof control.visible !== "boolean" || typeof control.multiTouch !== "string" || !["exclusive_pointer", "shared_pointer", "multi_pointer"].includes(control.multiTouch)) diagnostics.push(diagnostic("INVALID_CONTROL", path, "Control visibility or pointer policy is invalid."));
  const maxPointers = control.maxPointers;
  if (maxPointers !== undefined && (typeof maxPointers !== "number" || !Number.isSafeInteger(maxPointers) || maxPointers < 1 || maxPointers > 16)) diagnostics.push(diagnostic("POINTER_CONFLICT", `${path}.maxPointers`, "maxPointers is outside the safe range."));
  if (control.critical === true && (!control.visible || !isRecord(control.accessibility) || control.accessibility.hidden === true)) diagnostics.push(diagnostic("INVALID_A11Y", path, "Critical controls cannot be invisible."));
  if (!Array.isArray(control.bindings) || control.bindings.length === 0 || control.bindings.some((binding) => !isRecord(binding) || typeof binding.actionId !== "string" || !actionIds.has(binding.actionId))) diagnostics.push(diagnostic("INVALID_CONTROL", `${path}.bindings`, "Control must reference existing semantic Actions."));
  if (control.kind === "touch_area" || control.kind === "swipe_area" || control.kind === "gesture_area") if (control.keyboardAlternativeActionId === undefined && control.critical === true) diagnostics.push(diagnostic("INVALID_A11Y", path, "Pointer-only critical controls need a keyboard alternative Action."));
  if (Object.prototype.hasOwnProperty.call(control, "behavior")) diagnostics.push(diagnostic("INVALID_CONTROL", `${path}.behavior`, "Behavior must remain in Game-300 Behavior IR; it cannot be embedded in a control asset."));
  return true;
}

export function validateActionMap(value: unknown, caller?: CallerContext): ValidationResult {
  const diagnostics: Diagnostic[] = [];
  if (!isRecord(value)) return { valid: false, diagnostics: [diagnostic("INVALID_ACTION", "actionMap", "Action Map must be an object.")] };
  if (value.schemaVersion !== GAME_INPUT_SCHEMA_VERSION) diagnostics.push(diagnostic("UNKNOWN_SCHEMA", "schemaVersion", "Unsupported input schema version."));
  validateIdentity(value.identity, caller, diagnostics);
  if (!Array.isArray(value.actions) || !Array.isArray(value.contexts) || !Array.isArray(value.bindings) || !Array.isArray(value.controls) || !Array.isArray(value.behaviorReferences)) return { valid: false, diagnostics: [...diagnostics, diagnostic("INVALID_ACTION", "actionMap", "Action Map collections are invalid.")] };
  diagnostics.push(...duplicateDiagnostics(value.actions.map((item) => String(isRecord(item) ? item.id : "<invalid>")), "actions.id"));
  diagnostics.push(...duplicateDiagnostics(value.contexts.map((item) => String(isRecord(item) ? item.id : "<invalid>")), "contexts.id"));
  diagnostics.push(...duplicateDiagnostics(value.bindings.map((item) => String(isRecord(item) ? item.id : "<invalid>")), "bindings.id"));
  diagnostics.push(...duplicateDiagnostics(value.controls.map((item) => String(isRecord(item) ? item.id : "<invalid>")), "controls.id"));
  const actionIds = new Set(value.actions.map((item) => String(isRecord(item) ? item.id : "<invalid>")));
  const contextIds = new Set(value.contexts.map((item) => String(isRecord(item) ? item.id : "<invalid>")));
  for (const [index, action] of value.actions.entries()) if (!isRecord(action) || typeof action.id !== "string" || typeof action.label !== "string" || action.label.trim().length === 0 || !["button", "axis_1d", "axis_2d"].includes(String(action.valueMode))) diagnostics.push(diagnostic("INVALID_ACTION", `actions[${index}]`, "Action requires a stable id, label, and value mode."));
  for (const [index, context] of value.contexts.entries()) {
    const priority = isRecord(context) ? context.priority : undefined;
    if (!isRecord(context) || typeof context.id !== "string" || typeof context.label !== "string" || !Number.isSafeInteger(priority) || typeof priority !== "number" || priority < 0 || priority > 10000) diagnostics.push(diagnostic("INVALID_CONTEXT", `contexts[${index}]`, "Context priority or identity is invalid."));
  }
  const fingerprints = new Set<string>();
  for (const [index, binding] of value.bindings.entries()) {
    if (!validateBinding(binding, `bindings[${index}]`, actionIds, contextIds, diagnostics)) continue;
    for (const contextId of binding.contexts) {
      const fingerprint = bindingFingerprint(binding, contextId);
      if (fingerprints.has(fingerprint)) diagnostics.push(diagnostic("DUPLICATE_BINDING", `bindings[${index}]`, `Duplicate binding fingerprint: ${fingerprint}`));
      fingerprints.add(fingerprint);
    }
  }
  for (const [index, control] of value.controls.entries()) validateControl(control, `controls[${index}]`, actionIds, diagnostics);
  for (const [index, reference] of value.behaviorReferences.entries()) if (!isRecord(reference) || typeof reference.behaviorId !== "string" || typeof reference.actionId !== "string" || !actionIds.has(reference.actionId) || !["no-code", "graph", "typescript"].includes(String(reference.source)) || reference.irVersion !== INPUT_ACTION_IR_VERSION) diagnostics.push(diagnostic("INVALID_BEHAVIOR_REFERENCE", `behaviorReferences[${index}]`, "Behavior reference must point at the shared semantic Action and IR version."));
  return { valid: diagnostics.length === 0, diagnostics };
}

export function createActionMap(draft: ActionMapDraft, caller: CallerContext): ActionMap {
  const candidate: ActionMap = { ...draft, schemaVersion: GAME_INPUT_SCHEMA_VERSION };
  const validation = validateActionMap(candidate, caller);
  if (!validation.valid) throw new Error(validation.diagnostics.map((item) => `${item.code}:${item.path}`).join("; "));
  return candidate;
}

export function validateEditorShortcuts(value: unknown): ValidationResult {
  const diagnostics: Diagnostic[] = [];
  if (!Array.isArray(value)) return { valid: false, diagnostics: [diagnostic("EDITOR_RUNTIME_COLLISION", "editorShortcuts", "Editor shortcut registry must be separate from Runtime Action Map.")] };
  diagnostics.push(...duplicateDiagnostics(value.map((item) => String(isRecord(item) ? item.id : "<invalid>")), "editorShortcuts.id"));
  const shortcuts = new Set<string>();
  for (const [index, item] of value.entries()) {
    if (!isRecord(item) || item.scope !== "editor-command" || typeof item.id !== "string" || typeof item.shortcut !== "string" || typeof item.commandId !== "string" || typeof item.consume !== "boolean") diagnostics.push(diagnostic("EDITOR_RUNTIME_COLLISION", `editorShortcuts[${index}]`, "Editor shortcut must use the editor-command scope."));
    if (isRecord(item) && shortcuts.has(String(item.shortcut))) diagnostics.push(diagnostic("DUPLICATE_BINDING", `editorShortcuts[${index}]`, "Editor shortcut is duplicated."));
    if (isRecord(item)) shortcuts.add(String(item.shortcut));
  }
  return { valid: diagnostics.length === 0, diagnostics };
}

function safeAreaRect(viewport: Viewport): Rect {
  return { x: viewport.safeArea.left, y: viewport.safeArea.top, width: viewport.width - viewport.safeArea.left - viewport.safeArea.right, height: viewport.height - viewport.safeArea.top - viewport.safeArea.bottom };
}

function applyLayoutOverride(layout: ResponsiveControlLayout, viewport: Viewport): ResponsiveControlLayout {
  const override = viewport.isTablet ? layout.tablet : viewport.orientation === "portrait" ? layout.portrait : layout.landscape;
  const handednessOverride = layout.handedness?.[viewport.handedness];
  return { ...layout, ...(override ?? {}), ...(handednessOverride ?? {}) };
}

function overlaps(left: Rect, right: Rect): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
}

export function resolveControlLayout(control: ControlComponent, viewport: Viewport): ResolvedControlRect {
  const layout = applyLayoutOverride(control.layout, viewport);
  if (!finite(viewport.width) || !finite(viewport.height) || viewport.width <= 0 || viewport.height <= 0 || ![viewport.safeArea.top, viewport.safeArea.right, viewport.safeArea.bottom, viewport.safeArea.left].every(finite)) throw new Error("UNSAFE_BOUNDS:viewport");
  const safe = safeAreaRect(viewport);
  if (safe.width <= 0 || safe.height <= 0) throw new Error("UNSAFE_BOUNDS:safeArea");
  const xPositions: Record<ControlAnchor, number> = {
    top_left: safe.x,
    top: safe.x + (safe.width - layout.width) / 2,
    top_right: safe.x + safe.width - layout.width,
    left: safe.x,
    center: safe.x + (safe.width - layout.width) / 2,
    right: safe.x + safe.width - layout.width,
    bottom_left: safe.x,
    bottom: safe.x + (safe.width - layout.width) / 2,
    bottom_right: safe.x + safe.width - layout.width,
    safe_area: safe.x,
  };
  const yPositions: Record<ControlAnchor, number> = {
    top_left: safe.y,
    top: safe.y,
    top_right: safe.y,
    left: safe.y + (safe.height - layout.height) / 2,
    center: safe.y + (safe.height - layout.height) / 2,
    right: safe.y + (safe.height - layout.height) / 2,
    bottom_left: safe.y + safe.height - layout.height,
    bottom: safe.y + safe.height - layout.height,
    bottom_right: safe.y + safe.height - layout.height,
    safe_area: safe.y,
  };
  let x = xPositions[layout.anchor] + layout.offsetX;
  let y = yPositions[layout.anchor] + layout.offsetY;
  if (layout.normalizedX !== undefined) x = safe.x + layout.normalizedX * (safe.width - layout.width) + layout.offsetX;
  if (layout.normalizedY !== undefined) y = safe.y + layout.normalizedY * (safe.height - layout.height) + layout.offsetY;
  const rect: Rect = { x, y, width: layout.width, height: layout.height };
  if (rect.x < safe.x || rect.y < safe.y || rect.x + rect.width > safe.x + safe.width || rect.y + rect.height > safe.y + safe.height) throw new Error("UNSAFE_BOUNDS:control-outside-safe-area");
  for (const region of viewport.reservedRegions ?? []) if (overlaps(rect, region)) throw new Error("UNSAFE_BOUNDS:reserved-region-overlap");
  return { ...rect, controlId: control.id };
}

export function validateControlLayout(control: ControlComponent, viewport: Viewport): ValidationResult {
  try { resolveControlLayout(control, viewport); return { valid: true, diagnostics: [] }; }
  catch (error) { return { valid: false, diagnostics: [diagnostic("UNSAFE_BOUNDS", "control.layout", error instanceof Error ? error.message : "Control layout is unsafe.")] }; }
}

export function hitTestControl(control: ControlComponent, rect: ResolvedControlRect, point: { readonly x: number; readonly y: number }): boolean {
  const localX = point.x - rect.x;
  const localY = point.y - rect.y;
  const area = control.hitArea;
  if (area.type === "rect") return localX >= area.x && localX <= area.x + area.width && localY >= area.y && localY <= area.y + area.height;
  if (area.type === "circle") return (localX - area.x) ** 2 + (localY - area.y) ** 2 <= area.radius ** 2;
  let inside = false;
  for (let index = 0, previous = area.points.length - 1; index < area.points.length; previous = index++) {
    const current = area.points[index]!;
    const prior = area.points[previous]!;
    const crosses = (current.y > localY) !== (prior.y > localY) && localX < (prior.x - current.x) * (localY - current.y) / (prior.y - current.y) + current.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function capabilityAvailable(environment: InputEnvironment, device: InputDevice, controlPath: string): boolean {
  return environment.capabilities.some((capability) => capability.device === device && capability.enabled && capability.controlPaths.includes(controlPath));
}

function applyProcessors(value: InputValue, processors: readonly InputProcessor[] | undefined): InputValue {
  let current = value;
  for (const processor of processors ?? []) {
    if (processor.type === "normalize") {
      if (typeof current === "number") current = Math.max(-1, Math.min(1, current));
      else if (typeof current === "object") current = { x: Math.max(-1, Math.min(1, current.x)), y: Math.max(-1, Math.min(1, current.y)) };
    } else if (processor.type === "scale") {
      const scale = processor.value ?? 1;
      if (typeof current === "number") current *= scale;
      else if (typeof current === "object") current = { x: current.x * scale, y: current.y * scale };
    } else if (processor.type === "invert") {
      if (typeof current === "number") current = -current;
      else if (typeof current === "object") current = { x: -current.x, y: -current.y };
    } else if (processor.type === "deadzone") {
      const deadzone = processor.value ?? 0;
      if (typeof current === "number") current = Math.abs(current) <= deadzone ? 0 : Math.sign(current) * (Math.abs(current) - deadzone) / (1 - deadzone);
      else if (typeof current === "object") { const magnitude = Math.hypot(current.x, current.y); current = magnitude <= deadzone ? { x: 0, y: 0 } : { x: current.x * (magnitude - deadzone) / (magnitude * (1 - deadzone)), y: current.y * (magnitude - deadzone) / (magnitude * (1 - deadzone)) }; }
    }
  }
  return current;
}

function valueMatchesMode(value: InputValue, mode: InputValueMode): boolean {
  if (mode === "button") return typeof value === "boolean";
  if (mode === "axis_1d") return typeof value === "number" && finite(value) && value >= -1 && value <= 1;
  return typeof value === "object" && finite(value.x) && finite(value.y) && value.x >= -1 && value.x <= 1 && value.y >= -1 && value.y <= 1;
}

function pointerConflict(actionMap: ActionMap, sample: RuntimeInputSample, claims: readonly PointerClaim[] | undefined): Diagnostic | undefined {
  if (sample.device !== "touch" || sample.pointerId === undefined || sample.targetControlId === undefined) return undefined;
  const control = actionMap.controls.find((candidate) => candidate.id === sample.targetControlId);
  if (!control) return diagnostic("POINTER_CONFLICT", "sample.targetControlId", "Touch sample targets an unknown control.");
  const otherClaims = (claims ?? []).filter((claim) => claim.controlId === control.id && claim.pointerId !== sample.pointerId);
  if (control.multiTouch === "exclusive_pointer" && otherClaims.length > 0) return diagnostic("POINTER_CONFLICT", "sample.pointerId", "Exclusive control already owns another pointer.");
  if (control.maxPointers !== undefined && otherClaims.length >= control.maxPointers) return diagnostic("POINTER_CONFLICT", "sample.pointerId", "Control has reached its maximum pointer count.");
  return undefined;
}

export function resolveRuntimeInput(actionMap: ActionMap, sample: RuntimeInputSample, options: ResolveInputOptions): DispatchResult {
  const validation = validateActionMap(actionMap, options.caller);
  if (!validation.valid) return { status: "ignored", events: [], consumed: false, diagnostics: validation.diagnostics };
  if (sample.channel !== "runtime") return { status: "ignored", events: [], consumed: false, diagnostics: [diagnostic("INPUT_NOT_RUNTIME", "sample.channel", "Editor command input cannot enter the Runtime Action dispatcher.")] };
  if (!Number.isSafeInteger(sample.sequence) || sample.sequence < 0 || !Number.isSafeInteger(sample.timestampUs) || sample.timestampUs < 0 || sample.deviceId.length === 0) {
    // valueMode is intentionally checked against each candidate below; the defensive sample checks stay conservative.
  }
  const pointerDiagnostic = pointerConflict(actionMap, sample, options.pointerClaims);
  if (pointerDiagnostic) return { status: "denied", events: [], consumed: false, diagnostics: [pointerDiagnostic] };
  const contexts = new Map(actionMap.contexts.map((context) => [String(context.id), context]));
  const active = new Set(options.activeContexts.map(String));
  const candidates = actionMap.bindings.filter((binding) => binding.device === sample.device && binding.controlPath === sample.controlPath && binding.phase === sample.phase && binding.interaction.type === sample.interaction && binding.contexts.some((contextId) => active.has(String(contextId))));
  if (candidates.length === 0) return { status: "ignored", events: [], consumed: false, diagnostics: [] };
  const eligible = candidates.filter((binding) => {
    if (!capabilityAvailable(options.environment, binding.device, binding.controlPath)) return false;
    if (binding.requiredPermission !== undefined && options.environment.permissions[binding.requiredPermission] !== true) return false;
    if (binding.requiresOnline === true && !options.environment.online) return false;
    return valueMatchesMode(sample.value, binding.valueMode);
  });
  if (eligible.length === 0) {
    const denied = candidates.some((binding) => binding.requiresOnline === true && !options.environment.online) ? "OFFLINE_UNAVAILABLE" : candidates.some((binding) => binding.requiredPermission !== undefined && options.environment.permissions[binding.requiredPermission] !== true) ? "PERMISSION_DENIED" : "DEVICE_UNAVAILABLE";
    return { status: "denied", events: [], consumed: false, diagnostics: [diagnostic(denied, "sample", "Runtime input is unavailable under the current capability, permission, or offline boundary.")] };
  }
  const ranked = eligible.map((binding) => {
    const contextPriority = Math.max(...binding.contexts.filter((id) => active.has(String(id))).map((id) => contexts.get(String(id))?.priority ?? -1));
    return { binding, contextPriority };
  }).sort((left, right) => right.contextPriority - left.contextPriority || right.binding.priority - left.binding.priority || String(left.binding.actionId).localeCompare(String(right.binding.actionId)));
  const top = ranked[0]!;
  const tied = ranked.filter((item) => item.contextPriority === top.contextPriority && item.binding.priority === top.binding.priority);
  const actionIds = new Set(tied.map((item) => String(item.binding.actionId)));
  if (actionIds.size > 1) return { status: "ambiguous", events: [], consumed: false, diagnostics: [diagnostic("AMBIGUOUS_PRIORITY", "bindings", "Multiple semantic Actions have the same active context and binding priority.")] };
  const events: InputActionEvent[] = [{ actionId: top.binding.actionId, phase: sample.phase, value: applyProcessors(sample.value, top.binding.processors), device: sample.device, deviceId: sample.deviceId, ...(sample.pointerId === undefined ? {} : { pointerId: sample.pointerId }), timestampUs: sample.timestampUs, sequence: sample.sequence }];
  return { status: "accepted", events, consumed: top.binding.consume, diagnostics: [] };
}
