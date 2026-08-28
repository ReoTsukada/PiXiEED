/**
 * WP-130 Timeline / Layer Track / Frame / Cel structural Core.
 *
 * This module is DOM-, Canvas-, storage-, and transport-independent. Timeline
 * scroll, hover, active-frame selection, playback, and Onion Skin are local
 * projections. Only typed structural commands mutate Canonical Project State.
 */

import {
  canonicalJson,
  cloneProjectStateShared,
  IndexedTileRaster,
  sha256Hex,
  type CanonicalOperation,
  type CommandResult,
  type Diagnostic,
  type Draw2Cel,
  type Draw2CelBindingMode,
  type Draw2Frame,
  type Draw2Layer,
  type Draw2MetricScope,
  type Draw2Timeline,
  type DirtyTile,
  type ProjectState,
  type RasterAsset,
  type StructuralDirtyDomain,
  type StructuralOperationType,
} from "./draw2-core.ts";

export type Draw2ProjectId = string & { readonly __draw2ProjectId: unique symbol };
export type Draw2TimelineId = string & { readonly __draw2TimelineId: unique symbol };
export type Draw2FrameId = string & { readonly __draw2FrameId: unique symbol };
export type Draw2LayerTrackId = string & { readonly __draw2LayerTrackId: unique symbol };
export type Draw2CelId = string & { readonly __draw2CelId: unique symbol };

export type TimelineIdKind = "PROJECT" | "TIMELINE" | "FRAME" | "LAYER_TRACK" | "CEL";

export function typedTimelineId(value: string, kind: TimelineIdKind): string {
  if (!value || value.length > 256 || /^\d+$/.test(value) || !/^[A-Za-z0-9:_./-]+$/.test(value)) throw new Error(`${kind} ID must be a stable non-index identifier.`);
  return value;
}

function diagnostic(code: string, message: string, path?: string): Diagnostic {
  return path === undefined ? { code, severity: "error", message } : { code, severity: "error", message, path };
}

function integer(value: number): boolean { return Number.isSafeInteger(value); }
function positiveDuration(value: number): boolean { return integer(value) && value >= 1 && value <= 3_600_000; }
function idsInOrder(state: ProjectState, kind: "frame" | "layer"): readonly string[] {
  return kind === "frame" ? state.timeline.frameOrder : state.timeline.layerTrackOrder;
}

function orderKey(index: number, id: string): string { return `${index.toString().padStart(8, "0")}:${id}`; }

function celWithBinding(celRecord: Draw2Cel, rasterAssetId: string | undefined, bindingMode: Draw2CelBindingMode, lifecycle: Draw2Cel["lifecycle"]): Draw2Cel {
  const identity = { ...celRecord, bindingMode, lifecycle, recordVersion: celRecord.recordVersion + 1 };
  if (rasterAssetId === undefined) {
    const { assetId: _assetId, ...withoutAsset } = identity;
    return withoutAsset;
  }
  return { ...identity, assetId: rasterAssetId };
}

export interface StructuralEnvelope<TPayload, TType extends StructuralOperationType = StructuralOperationType> {
  readonly commandId: string;
  readonly commandType: TType;
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly assetId: string;
  readonly actorId: string;
  readonly clientId: string;
  readonly clientSequence: number;
  readonly baseStructureEpoch: number;
  readonly createdAtMonotonicMs: number;
  readonly payload: TPayload;
}

export interface AddLayerTrackPayload { readonly layerTrackId: string; readonly name: string; readonly targetIndex?: number; readonly kind?: Draw2Layer["kind"]; }
export interface RemoveLayerTrackPayload { readonly layerTrackId: string; }
export interface DuplicateLayerTrackPayload { readonly sourceLayerTrackId: string; readonly layerTrackId: string; readonly name?: string; readonly targetIndex?: number; readonly kind?: Draw2Layer["kind"]; }
export interface ReorderLayerTrackPayload { readonly layerTrackId: string; readonly targetIndex: number; }
export interface RenameLayerTrackPayload { readonly layerTrackId: string; readonly name: string; }
export interface SetLayerVisibilityPayload { readonly layerTrackId: string; readonly visible: boolean; }
export interface SetLayerOpacityPayload { readonly layerTrackId: string; readonly opacity: number; }
export interface SetLayerBlendModePayload { readonly layerTrackId: string; readonly blendMode: "NORMAL" | "MULTIPLY"; }
export interface SetLayerLockPayload { readonly layerTrackId: string; readonly locked: boolean; }
export interface AddFramePayload { readonly frameId: string; readonly durationMs?: number; readonly targetIndex?: number; }
export interface RemoveFramePayload { readonly frameId: string; }
export interface DuplicateFramePayload { readonly sourceFrameId: string; readonly frameId: string; readonly targetIndex?: number; }
export interface ReorderFramePayload { readonly frameId: string; readonly targetIndex: number; }
export interface ChangeFrameDurationPayload { readonly frameId: string; readonly durationMs: number; }
export interface CreateCelPayload { readonly celId: string; readonly frameId: string; readonly layerTrackId: string; readonly rasterAssetId?: string; readonly bindingMode?: Draw2CelBindingMode; }
export interface ClearCelPayload { readonly celId: string; }
export interface ReplaceCelBindingPayload { readonly celId: string; readonly rasterAssetId?: string; readonly bindingMode?: Draw2CelBindingMode; }
export interface ActivateCelPayload { readonly celId: string; readonly frameId: string; readonly layerTrackId: string; }

export type TimelineCommand =
  | StructuralEnvelope<AddLayerTrackPayload, "timeline.addLayerTrack">
  | StructuralEnvelope<RemoveLayerTrackPayload, "timeline.removeLayerTrack">
  | StructuralEnvelope<DuplicateLayerTrackPayload, "timeline.duplicateLayerTrack">
  | StructuralEnvelope<ReorderLayerTrackPayload, "timeline.reorderLayerTrack">
  | StructuralEnvelope<RenameLayerTrackPayload, "timeline.renameLayerTrack">
  | StructuralEnvelope<SetLayerVisibilityPayload, "timeline.setLayerVisibility">
  | StructuralEnvelope<SetLayerOpacityPayload, "timeline.setLayerOpacity">
  | StructuralEnvelope<SetLayerBlendModePayload, "timeline.setLayerBlendMode">
  | StructuralEnvelope<SetLayerLockPayload, "timeline.setLayerLock">
  | StructuralEnvelope<AddFramePayload, "timeline.addFrame">
  | StructuralEnvelope<RemoveFramePayload, "timeline.removeFrame">
  | StructuralEnvelope<DuplicateFramePayload, "timeline.duplicateFrame">
  | StructuralEnvelope<ReorderFramePayload, "timeline.reorderFrame">
  | StructuralEnvelope<ChangeFrameDurationPayload, "timeline.changeFrameDuration">
  | StructuralEnvelope<CreateCelPayload, "timeline.createCel">
  | StructuralEnvelope<ClearCelPayload, "timeline.clearCel">
  | StructuralEnvelope<ReplaceCelBindingPayload, "timeline.replaceCelBinding">
  | StructuralEnvelope<ActivateCelPayload, "timeline.activateCel">;

export type TimelineExecutionResult =
  | { readonly ok: true; readonly state: ProjectState; readonly result: CommandResult }
  | { readonly ok: false; readonly state: ProjectState; readonly diagnostics: readonly Diagnostic[] };

function layer(state: ProjectState, id: string): Draw2Layer | undefined { return state.layers.find((item) => item.layerTrackId === id || item.id === id); }
function frame(state: ProjectState, id: string): Draw2Frame | undefined { return state.frames.find((item) => item.frameId === id || item.id === id); }
function cel(state: ProjectState, id: string): Draw2Cel | undefined { return state.cels.find((item) => item.celId === id || item.id === id); }

function validateEnvelope(state: ProjectState, command: TimelineCommand): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (command.schemaVersion !== 1) diagnostics.push(diagnostic("STRUCTURE_SCHEMA_UNSUPPORTED", "Unsupported structural command schema.", "schemaVersion"));
  if (command.projectId !== state.projectId) diagnostics.push(diagnostic("STRUCTURE_PROJECT_MISMATCH", "Structural command project does not match state.", "projectId"));
  if (command.assetId !== state.activeAssetId) diagnostics.push(diagnostic("STRUCTURE_ASSET_SCOPE_INVALID", "Structural command must use the active Project asset scope.", "assetId"));
  if (command.baseStructureEpoch !== state.structureEpoch) diagnostics.push(diagnostic("STALE_STRUCTURE_COMMAND", "Structural command is based on a stale structure epoch.", "baseStructureEpoch"));
  if (state.appliedCommandIds.includes(command.commandId)) diagnostics.push(diagnostic("DUPLICATE_STRUCTURE_COMMAND", "Structural command was already applied.", "commandId"));
  const expectedSequence = (state.lastClientSequenceByClient[command.clientId] ?? 0) + 1;
  if (command.clientSequence !== expectedSequence) diagnostics.push(diagnostic("STRUCTURE_CLIENT_SEQUENCE_GAP", `Expected structural client sequence ${expectedSequence}.`, "clientSequence"));
  if (!command.commandId || !command.actorId || !command.clientId) diagnostics.push(diagnostic("STRUCTURE_REQUIRED_FIELD", "Structural command identity fields are required."));
  if (!integer(command.clientSequence) || command.clientSequence < 1) diagnostics.push(diagnostic("STRUCTURE_CLIENT_SEQUENCE_INVALID", "clientSequence must be a positive safe integer.", "clientSequence"));
  if (!Number.isFinite(command.createdAtMonotonicMs) || command.createdAtMonotonicMs < 0) diagnostics.push(diagnostic("STRUCTURE_MONOTONIC_TIME_INVALID", "createdAtMonotonicMs must be finite and non-negative.", "createdAtMonotonicMs"));
  return diagnostics;
}

function validateStableField(value: string, kind: TimelineIdKind, path: string): Diagnostic[] {
  try { typedTimelineId(value, kind); return []; } catch (cause) { return [diagnostic("STABLE_ID_INVALID", cause instanceof Error ? cause.message : "Stable ID is invalid.", path)]; }
}

function validateIndex(value: number, length: number, path: string): Diagnostic[] {
  return integer(value) && value >= 0 && value < length ? [] : [diagnostic("STRUCTURE_ORDER_INVALID", `Order index must be between 0 and ${Math.max(0, length - 1)}.`, path)];
}

function validatePayload(state: ProjectState, command: TimelineCommand): Diagnostic[] {
  // The command union is discriminated at the public boundary. This local runtime validator
  // intentionally reads its bounded payload through one narrow validation view because the
  // generic envelope loses payload correlation when TypeScript aliases it.
  const payload = command.payload as any;
  const diagnostics: Diagnostic[] = [];
  if (command.commandType === "timeline.addLayerTrack") {
    diagnostics.push(...validateStableField(payload.layerTrackId, "LAYER_TRACK", "payload.layerTrackId"));
    if (layer(state, payload.layerTrackId) !== undefined) diagnostics.push(diagnostic("DUPLICATE_LAYER_TRACK_ID", "Layer Track ID already exists.", "payload.layerTrackId"));
    if (!payload.name.trim() || payload.name.length > 128) diagnostics.push(diagnostic("LAYER_TRACK_NAME_INVALID", "Layer Track name must be 1..128 characters.", "payload.name"));
    if (payload.kind !== undefined && payload.kind !== "RASTER" && payload.kind !== "TILEMAP") diagnostics.push(diagnostic("LAYER_KIND_INVALID", "Layer Track kind is unsupported.", "payload.kind"));
    if (payload.targetIndex !== undefined) diagnostics.push(...validateIndex(payload.targetIndex, state.layers.length + 1, "payload.targetIndex"));
  } else if (command.commandType === "timeline.removeLayerTrack" || command.commandType === "timeline.renameLayerTrack" || command.commandType === "timeline.setLayerVisibility" || command.commandType === "timeline.setLayerOpacity" || command.commandType === "timeline.setLayerBlendMode" || command.commandType === "timeline.setLayerLock") {
    diagnostics.push(...validateStableField(payload.layerTrackId, "LAYER_TRACK", "payload.layerTrackId"));
    if (layer(state, payload.layerTrackId) === undefined) diagnostics.push(diagnostic("UNKNOWN_LAYER_TRACK", "Layer Track does not exist.", "payload.layerTrackId"));
    if (command.commandType === "timeline.removeLayerTrack" && state.layers.length <= 1) diagnostics.push(diagnostic("REMOVE_LAST_LAYER_FORBIDDEN", "The last required Layer Track cannot be removed.", "payload.layerTrackId"));
    if (command.commandType === "timeline.renameLayerTrack" && (!payload.name.trim() || payload.name.length > 128)) diagnostics.push(diagnostic("LAYER_TRACK_NAME_INVALID", "Layer Track name must be 1..128 characters.", "payload.name"));
    if (command.commandType === "timeline.setLayerOpacity" && (!Number.isFinite(payload.opacity) || payload.opacity < 0 || payload.opacity > 1)) diagnostics.push(diagnostic("LAYER_OPACITY_INVALID", "Layer opacity must be between 0 and 1.", "payload.opacity"));
    if (command.commandType === "timeline.setLayerBlendMode" && payload.blendMode !== "NORMAL" && payload.blendMode !== "MULTIPLY") diagnostics.push(diagnostic("LAYER_BLEND_MODE_INVALID", "Layer blend mode is unsupported.", "payload.blendMode"));
  } else if (command.commandType === "timeline.duplicateLayerTrack") {
    diagnostics.push(...validateStableField(payload.sourceLayerTrackId, "LAYER_TRACK", "payload.sourceLayerTrackId"), ...validateStableField(payload.layerTrackId, "LAYER_TRACK", "payload.layerTrackId"));
    if (layer(state, payload.sourceLayerTrackId) === undefined) diagnostics.push(diagnostic("UNKNOWN_LAYER_TRACK", "Source Layer Track does not exist.", "payload.sourceLayerTrackId"));
    if (layer(state, payload.layerTrackId) !== undefined) diagnostics.push(diagnostic("DUPLICATE_LAYER_TRACK_ID", "Layer Track ID already exists.", "payload.layerTrackId"));
    if (payload.kind !== undefined && payload.kind !== "RASTER" && payload.kind !== "TILEMAP") diagnostics.push(diagnostic("LAYER_KIND_INVALID", "Layer Track kind is unsupported.", "payload.kind"));
    if (payload.targetIndex !== undefined) diagnostics.push(...validateIndex(payload.targetIndex, state.layers.length + 1, "payload.targetIndex"));
  } else if (command.commandType === "timeline.reorderLayerTrack") {
    diagnostics.push(...validateStableField(payload.layerTrackId, "LAYER_TRACK", "payload.layerTrackId"));
    if (layer(state, payload.layerTrackId) === undefined) diagnostics.push(diagnostic("UNKNOWN_LAYER_TRACK", "Layer Track does not exist.", "payload.layerTrackId"));
    diagnostics.push(...validateIndex(payload.targetIndex, state.layers.length, "payload.targetIndex"));
  } else if (command.commandType === "timeline.addFrame") {
    diagnostics.push(...validateStableField(payload.frameId, "FRAME", "payload.frameId"));
    if (frame(state, payload.frameId) !== undefined) diagnostics.push(diagnostic("DUPLICATE_FRAME_ID", "Frame ID already exists.", "payload.frameId"));
    if (payload.durationMs !== undefined && !positiveDuration(payload.durationMs)) diagnostics.push(diagnostic("FRAME_DURATION_INVALID", "Frame duration must be a positive integer in milliseconds.", "payload.durationMs"));
    if (payload.targetIndex !== undefined) diagnostics.push(...validateIndex(payload.targetIndex, state.frames.length + 1, "payload.targetIndex"));
  } else if (command.commandType === "timeline.removeFrame" || command.commandType === "timeline.reorderFrame" || command.commandType === "timeline.changeFrameDuration") {
    diagnostics.push(...validateStableField(payload.frameId, "FRAME", "payload.frameId"));
    if (frame(state, payload.frameId) === undefined) diagnostics.push(diagnostic("UNKNOWN_FRAME", "Frame does not exist.", "payload.frameId"));
    if (command.commandType === "timeline.removeFrame" && state.frames.length <= 1) diagnostics.push(diagnostic("REMOVE_LAST_FRAME_FORBIDDEN", "The last required Frame cannot be removed.", "payload.frameId"));
    if (command.commandType === "timeline.reorderFrame") diagnostics.push(...validateIndex(payload.targetIndex, state.frames.length, "payload.targetIndex"));
    if (command.commandType === "timeline.changeFrameDuration" && !positiveDuration(payload.durationMs)) diagnostics.push(diagnostic("FRAME_DURATION_INVALID", "Frame duration must be a positive integer in milliseconds.", "payload.durationMs"));
  } else if (command.commandType === "timeline.duplicateFrame") {
    diagnostics.push(...validateStableField(payload.sourceFrameId, "FRAME", "payload.sourceFrameId"), ...validateStableField(payload.frameId, "FRAME", "payload.frameId"));
    if (frame(state, payload.sourceFrameId) === undefined) diagnostics.push(diagnostic("UNKNOWN_FRAME", "Source Frame does not exist.", "payload.sourceFrameId"));
    if (frame(state, payload.frameId) !== undefined) diagnostics.push(diagnostic("DUPLICATE_FRAME_ID", "Frame ID already exists.", "payload.frameId"));
    if (payload.targetIndex !== undefined) diagnostics.push(...validateIndex(payload.targetIndex, state.frames.length + 1, "payload.targetIndex"));
  } else if (command.commandType === "timeline.createCel") {
    diagnostics.push(...validateStableField(payload.celId, "CEL", "payload.celId"), ...validateStableField(payload.frameId, "FRAME", "payload.frameId"), ...validateStableField(payload.layerTrackId, "LAYER_TRACK", "payload.layerTrackId"));
    if (cel(state, payload.celId) !== undefined) diagnostics.push(diagnostic("DUPLICATE_CEL_ID", "Cel ID already exists.", "payload.celId"));
    if (frame(state, payload.frameId) === undefined) diagnostics.push(diagnostic("UNKNOWN_FRAME", "Cel Frame does not exist.", "payload.frameId"));
    if (layer(state, payload.layerTrackId) === undefined) diagnostics.push(diagnostic("UNKNOWN_LAYER_TRACK", "Cel Layer Track does not exist.", "payload.layerTrackId"));
    if (payload.rasterAssetId !== undefined && state.assets[payload.rasterAssetId] === undefined) diagnostics.push(diagnostic("UNKNOWN_RASTER_ASSET", "Cel raster backing does not exist.", "payload.rasterAssetId"));
    if (payload.bindingMode === "EMPTY" && payload.rasterAssetId !== undefined) diagnostics.push(diagnostic("EMPTY_CEL_HAS_RASTER", "Empty Cel must not materialize a Raster backing.", "payload.rasterAssetId"));
  } else if (command.commandType === "timeline.clearCel" || command.commandType === "timeline.replaceCelBinding") {
    diagnostics.push(...validateStableField(payload.celId, "CEL", "payload.celId"));
    const targetCel = cel(state, payload.celId);
    if (targetCel === undefined) diagnostics.push(diagnostic("UNKNOWN_CEL", "Cel does not exist.", "payload.celId"));
    if (command.commandType === "timeline.replaceCelBinding") {
      if (payload.rasterAssetId !== undefined && state.assets[payload.rasterAssetId] === undefined) diagnostics.push(diagnostic("UNKNOWN_RASTER_ASSET", "Cel raster backing does not exist.", "payload.rasterAssetId"));
      if (payload.bindingMode === "EMPTY" && payload.rasterAssetId !== undefined) diagnostics.push(diagnostic("EMPTY_CEL_HAS_RASTER", "Empty Cel must not materialize a Raster backing.", "payload.rasterAssetId"));
    }
  } else if (command.commandType === "timeline.activateCel") {
    diagnostics.push(
      ...validateStableField(payload.celId, "CEL", "payload.celId"),
      ...validateStableField(payload.frameId, "FRAME", "payload.frameId"),
      ...validateStableField(payload.layerTrackId, "LAYER_TRACK", "payload.layerTrackId"),
    );
    if (frame(state, payload.frameId) === undefined) diagnostics.push(diagnostic("UNKNOWN_FRAME", "Activation Frame does not exist.", "payload.frameId"));
    if (layer(state, payload.layerTrackId) === undefined) diagnostics.push(diagnostic("UNKNOWN_LAYER_TRACK", "Activation Layer Track does not exist.", "payload.layerTrackId"));
    const targetCel = cel(state, payload.celId);
    if (targetCel !== undefined && (targetCel.frameId !== payload.frameId || targetCel.layerTrackId !== payload.layerTrackId)) {
      diagnostics.push(diagnostic("CEL_SCOPE_MISMATCH", "Activation Cel does not belong to the requested Frame and Layer Track.", "payload.celId"));
    }
    const occupiedCel = state.cels.find((item) => item.lifecycle !== "ARCHIVED" && item.frameId === payload.frameId && item.layerTrackId === payload.layerTrackId && item.celId !== payload.celId);
    if (occupiedCel !== undefined) diagnostics.push(diagnostic("TIMELINE_CELL_OCCUPIED", "The requested Frame and Layer Track already has another Cel identity.", "payload.celId"));
    if (targetCel?.assetId !== undefined && state.assets[targetCel.assetId] === undefined) diagnostics.push(diagnostic("MISSING_CEL_RASTER", "Activation Cel references a missing Raster backing.", "payload.celId"));
  }
  return diagnostics;
}

function commitState(state: ProjectState, patch: Partial<ProjectState>, command: TimelineCommand): ProjectState {
  const shared = cloneProjectStateShared(state);
  const patchAssets = patch.assets === undefined ? shared.assets : { ...shared.assets, ...patch.assets };
  return {
    ...shared,
    ...patch,
    assets: patchAssets,
    structureEpoch: state.structureEpoch + 1,
    appliedCommandIds: [...state.appliedCommandIds, command.commandId],
    lastClientSequenceByClient: { ...state.lastClientSequenceByClient, [command.clientId]: command.clientSequence },
  };
}

function updateFrameOrder(frames: readonly Draw2Frame[], order: readonly string[]): readonly Draw2Frame[] {
  return order.map((id, index) => {
    const item = frames.find((frameItem) => frameItem.frameId === id);
    if (item === undefined) throw new Error("Frame order references an unknown Frame.");
    return { ...item, index, orderKey: orderKey(index, item.frameId), metadataVersion: item.metadataVersion + (item.index === index ? 0 : 1) };
  });
}

function updateLayerOrder(layers: readonly Draw2Layer[], order: readonly string[]): readonly Draw2Layer[] {
  return order.map((id, index) => {
    const item = layers.find((layerItem) => layerItem.layerTrackId === id);
    if (item === undefined) throw new Error("Layer Track order references an unknown Layer Track.");
    return { ...item, order: index, orderingKey: orderKey(index, item.layerTrackId) };
  });
}

function insertAt(order: readonly string[], id: string, targetIndex: number | undefined): readonly string[] {
  const next = [...order];
  const index = targetIndex === undefined ? next.length : Math.min(Math.max(targetIndex, 0), next.length);
  next.splice(index, 0, id);
  return next;
}

function moveTo(order: readonly string[], id: string, targetIndex: number): readonly string[] {
  const next = order.filter((item) => item !== id);
  next.splice(Math.min(Math.max(targetIndex, 0), next.length), 0, id);
  return next;
}

function operationPayload(command: TimelineCommand): unknown {
  return command.payload;
}

async function resultFor(
  state: ProjectState,
  command: TimelineCommand,
  operationType: StructuralOperationType,
  domains: readonly StructuralDirtyDomain[],
): Promise<CommandResult> {
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) throw new Error("Structural result active asset is missing.");
  const operationBody = {
    operationType,
    schemaVersion: 1 as const,
    commandId: command.commandId,
    projectId: state.projectId,
    assetId: asset.id,
    actorId: command.actorId,
    clientId: command.clientId,
    clientSequence: command.clientSequence,
    structureEpoch: state.structureEpoch,
    payload: operationPayload(command),
  };
  const operation: CanonicalOperation = { operationId: `op_${await sha256Hex(operationBody)}`, ...operationBody };
  const metricScope: Draw2MetricScope = "COMMAND_TO_DIRTY";
  return {
    operation,
    noOp: false,
    metricScope,
    structuralDirtyDomains: domains,
    dirtyTiles: [] as readonly DirtyTile[],
    dirtyRegions: [],
    memory: asset.raster.memoryMetrics(),
    copiedBytes: 0,
    cowSplitCount: 0,
    trace: { commandValidationCount: 1, commandCommitCount: 1, affectedLayerCount: 1, affectedFrameCount: 1, fullRasterCloneCount: 0, fullTimelineRebuildCount: 0, wholeProjectSerializationCount: 0 },
    instrumentation: [{ name: "dirty.tileCalculation", durationMs: 0, detail: { domainCount: domains.length, metricScope } }],
  };
}

export async function executeTimelineCommand(state: ProjectState, command: TimelineCommand): Promise<TimelineExecutionResult> {
  const diagnostics = [...validateEnvelope(state, command), ...validatePayload(state, command)];
  if (diagnostics.length > 0) return { ok: false, state, diagnostics };
  let patch: Partial<ProjectState> = {};
  let domains: readonly StructuralDirtyDomain[] = ["TIMELINE_STRUCTURE_DIRTY"];

  if (command.commandType === "timeline.addLayerTrack") {
    const item: Draw2Layer = { id: command.payload.layerTrackId, layerTrackId: command.payload.layerTrackId, name: command.payload.name.trim(), order: 0, orderingKey: "", visible: true, opacity: 1, blendMode: "NORMAL", locked: false, lifecycle: "ACTIVE", kind: command.payload.kind ?? "RASTER" };
    const order = insertAt(state.timeline.layerTrackOrder, item.layerTrackId, command.payload.targetIndex);
    patch = { layers: updateLayerOrder([...state.layers, item], order), timeline: { ...state.timeline, layerTrackOrder: order, metadataVersion: state.timeline.metadataVersion + 1 } };
  } else if (command.commandType === "timeline.removeLayerTrack") {
    const order = state.timeline.layerTrackOrder.filter((id) => id !== command.payload.layerTrackId);
    const tilemaps = Object.fromEntries(Object.entries(state.tilemaps ?? {}).filter(([, map]) => map.layerTrackId !== command.payload.layerTrackId));
    patch = { layers: updateLayerOrder(state.layers.filter((item) => item.layerTrackId !== command.payload.layerTrackId), order), cels: state.cels.filter((item) => item.layerTrackId !== command.payload.layerTrackId), tilemaps, timeline: { ...state.timeline, layerTrackOrder: order, metadataVersion: state.timeline.metadataVersion + 1 } };
    domains = ["TIMELINE_STRUCTURE_DIRTY", "COMPOSITE_DIRTY", "TIMELINE_CELL_DIRTY"];
  } else if (command.commandType === "timeline.duplicateLayerTrack") {
    const source = layer(state, command.payload.sourceLayerTrackId);
    if (source === undefined) throw new Error("Validated source Layer Track disappeared.");
    const item: Draw2Layer = { ...source, id: command.payload.layerTrackId, layerTrackId: command.payload.layerTrackId, name: command.payload.name?.trim() || `${source.name} Copy`, order: 0, orderingKey: "", kind: command.payload.kind ?? source.kind ?? "RASTER" };
    const order = insertAt(state.timeline.layerTrackOrder, item.layerTrackId, command.payload.targetIndex);
    patch = { layers: updateLayerOrder([...state.layers, item], order), timeline: { ...state.timeline, layerTrackOrder: order, metadataVersion: state.timeline.metadataVersion + 1 } };
  } else if (command.commandType === "timeline.reorderLayerTrack") {
    const order = moveTo(state.timeline.layerTrackOrder, command.payload.layerTrackId, command.payload.targetIndex);
    patch = { layers: updateLayerOrder(state.layers, order), timeline: { ...state.timeline, layerTrackOrder: order, metadataVersion: state.timeline.metadataVersion + 1 } };
  } else if (command.commandType === "timeline.renameLayerTrack" || command.commandType === "timeline.setLayerVisibility" || command.commandType === "timeline.setLayerOpacity" || command.commandType === "timeline.setLayerBlendMode" || command.commandType === "timeline.setLayerLock") {
    const target = layer(state, command.payload.layerTrackId);
    if (target === undefined) throw new Error("Validated Layer Track disappeared.");
    const updated = command.commandType === "timeline.renameLayerTrack" ? { ...target, name: command.payload.name.trim() }
      : command.commandType === "timeline.setLayerVisibility" ? { ...target, visible: command.payload.visible }
        : command.commandType === "timeline.setLayerOpacity" ? { ...target, opacity: command.payload.opacity }
          : command.commandType === "timeline.setLayerBlendMode" ? { ...target, blendMode: command.payload.blendMode }
          : { ...target, locked: command.payload.locked };
    patch = { layers: state.layers.map((item) => item.layerTrackId === target.layerTrackId ? updated : item) };
    domains = command.commandType === "timeline.setLayerLock" ? ["LAYER_METADATA_DIRTY"] : ["LAYER_METADATA_DIRTY", "COMPOSITE_DIRTY"];
  } else if (command.commandType === "timeline.addFrame") {
    const item: Draw2Frame = { id: command.payload.frameId, frameId: command.payload.frameId, index: 0, orderKey: "", durationMs: command.payload.durationMs ?? 100, timingUnit: "MILLISECONDS", metadataVersion: 1 };
    const order = insertAt(state.timeline.frameOrder, item.frameId, command.payload.targetIndex);
    patch = { frames: updateFrameOrder([...state.frames, item], order), timeline: { ...state.timeline, frameOrder: order, metadataVersion: state.timeline.metadataVersion + 1 } };
  } else if (command.commandType === "timeline.removeFrame") {
    const order = state.timeline.frameOrder.filter((id) => id !== command.payload.frameId);
    const tilemaps = Object.fromEntries(Object.entries(state.tilemaps ?? {}).filter(([, map]) => map.frameId !== command.payload.frameId));
    patch = { frames: updateFrameOrder(state.frames.filter((item) => item.frameId !== command.payload.frameId), order), cels: state.cels.filter((item) => item.frameId !== command.payload.frameId), tilemaps, timeline: { ...state.timeline, frameOrder: order, metadataVersion: state.timeline.metadataVersion + 1 } };
    domains = ["TIMELINE_STRUCTURE_DIRTY", "COMPOSITE_DIRTY", "TIMELINE_CELL_DIRTY"];
  } else if (command.commandType === "timeline.duplicateFrame") {
    const source = frame(state, command.payload.sourceFrameId);
    if (source === undefined) throw new Error("Validated source Frame disappeared.");
    const item: Draw2Frame = { ...source, id: command.payload.frameId, frameId: command.payload.frameId, index: 0, orderKey: "", metadataVersion: 1 };
    const order = insertAt(state.timeline.frameOrder, item.frameId, command.payload.targetIndex);
    const duplicatedCels = state.cels.filter((itemCel) => itemCel.frameId === source.frameId).map((itemCel) => ({ ...itemCel, id: `${itemCel.celId}:duplicate:${item.frameId}`, celId: `${itemCel.celId}:duplicate:${item.frameId}`, frameId: item.frameId, bindingMode: itemCel.bindingMode === "TILEMAP" ? "TILEMAP" as const : itemCel.assetId === undefined ? "EMPTY" as const : "DUPLICATE_INDEPENDENT" as const, recordVersion: 1 }));
    patch = { frames: updateFrameOrder([...state.frames, item], order), cels: [...state.cels, ...duplicatedCels], timeline: { ...state.timeline, frameOrder: order, metadataVersion: state.timeline.metadataVersion + 1 } };
  } else if (command.commandType === "timeline.reorderFrame") {
    const order = moveTo(state.timeline.frameOrder, command.payload.frameId, command.payload.targetIndex);
    patch = { frames: updateFrameOrder(state.frames, order), timeline: { ...state.timeline, frameOrder: order, metadataVersion: state.timeline.metadataVersion + 1 } };
  } else if (command.commandType === "timeline.changeFrameDuration") {
    patch = { frames: state.frames.map((item) => item.frameId === command.payload.frameId ? { ...item, durationMs: command.payload.durationMs, metadataVersion: item.metadataVersion + 1 } : item) };
    domains = ["TIMELINE_STRUCTURE_DIRTY"];
  } else if (command.commandType === "timeline.createCel") {
    const bindingMode = command.payload.bindingMode ?? (command.payload.rasterAssetId === undefined ? "EMPTY" : "RASTER");
    const celIdentity = { id: command.payload.celId, celId: command.payload.celId, frameId: command.payload.frameId, layerId: command.payload.layerTrackId, layerTrackId: command.payload.layerTrackId, bindingMode, recordVersion: 1, lifecycle: bindingMode === "EMPTY" ? "CLEARED" as const : "ACTIVE" as const };
    const newCel: Draw2Cel = command.payload.rasterAssetId === undefined ? celIdentity : { ...celIdentity, assetId: command.payload.rasterAssetId };
    patch = { cels: [...state.cels, newCel] };
    domains = ["TIMELINE_CELL_DIRTY", "COMPOSITE_DIRTY"];
  } else if (command.commandType === "timeline.clearCel") {
    patch = { cels: state.cels.map((item) => item.celId === command.payload.celId ? celWithBinding(item, undefined, "EMPTY", "CLEARED") : item) };
    domains = ["TIMELINE_CELL_DIRTY", "COMPOSITE_DIRTY"];
  } else if (command.commandType === "timeline.replaceCelBinding") {
    const target = cel(state, command.payload.celId);
    if (target === undefined) throw new Error("Validated Cel disappeared.");
    const bindingMode = command.payload.bindingMode ?? (command.payload.rasterAssetId === undefined ? "EMPTY" : "RASTER");
    patch = { cels: state.cels.map((item) => item.celId === target.celId ? celWithBinding(item, command.payload.rasterAssetId, bindingMode, bindingMode === "EMPTY" ? "CLEARED" : "ACTIVE") : item) };
    domains = ["TIMELINE_CELL_DIRTY", "COMPOSITE_DIRTY"];
  } else {
    const target = cel(state, command.payload.celId);
    const targetLayer = layer(state, command.payload.layerTrackId);
    const sourceAsset = state.assets[state.activeAssetId];
    if (sourceAsset === undefined) throw new Error("Activation source Raster backing is missing.");
    let activeAssetId = target?.assetId;
    const assetPatch: Record<string, RasterAsset> = {};
    let activatedCel: Draw2Cel;
    if (targetLayer?.kind === "TILEMAP") {
      activeAssetId = state.activeAssetId;
      activatedCel = target === undefined
        ? { id: command.payload.celId, celId: command.payload.celId, layerId: command.payload.layerTrackId, layerTrackId: command.payload.layerTrackId, frameId: command.payload.frameId, bindingMode: "TILEMAP", recordVersion: 1, lifecycle: "ACTIVE" }
        : celWithBinding(target, undefined, "TILEMAP", "ACTIVE");
    } else if (target === undefined || target.assetId === undefined) {
      activeAssetId = `${state.projectId}:raster:cel:${command.payload.celId}`;
      assetPatch[activeAssetId] = {
        id: activeAssetId,
        width: sourceAsset.width,
        height: sourceAsset.height,
        palette: [...sourceAsset.palette],
        raster: IndexedTileRaster.empty(sourceAsset.width, sourceAsset.height, sourceAsset.raster.tileSize),
        revision: 0,
      };
      activatedCel = target === undefined
        ? { id: command.payload.celId, celId: command.payload.celId, layerId: command.payload.layerTrackId, layerTrackId: command.payload.layerTrackId, frameId: command.payload.frameId, assetId: activeAssetId, bindingMode: "RASTER", recordVersion: 1, lifecycle: "ACTIVE" }
        : celWithBinding(target, activeAssetId, "RASTER", "ACTIVE");
    } else if (target.bindingMode === "DUPLICATE_INDEPENDENT") {
      activeAssetId = `${state.projectId}:raster:cel:${command.payload.celId}:independent`;
      const independentSource = state.assets[target.assetId];
      if (independentSource === undefined) throw new Error("Duplicate Cel Raster backing is missing.");
      assetPatch[activeAssetId] = { ...independentSource, id: activeAssetId, palette: [...independentSource.palette], raster: independentSource.raster.sharedClone() };
      activatedCel = celWithBinding(target, activeAssetId, "RASTER", "ACTIVE");
    } else {
      activeAssetId = target.assetId;
      activatedCel = target;
    }
    const nextCels = target === undefined
      ? [...state.cels, activatedCel]
      : state.cels.map((item) => item.celId === activatedCel.celId ? activatedCel : item);
    patch = {
      ...(Object.keys(assetPatch).length === 0 ? {} : { assets: assetPatch }),
      cels: nextCels,
      activeAssetId,
      activeLayerId: command.payload.layerTrackId,
      activeFrameId: command.payload.frameId,
      activeCelId: activatedCel.celId,
    };
    domains = ["TIMELINE_CELL_DIRTY", "COMPOSITE_DIRTY"];
  }
  const nextState = commitState(state, patch, command);
  return { ok: true, state: nextState, result: await resultFor(nextState, command, command.commandType, domains) };
}

export interface CelRasterEditResult {
  readonly ok: true;
  readonly state: ProjectState;
  readonly cel: Draw2Cel;
  readonly rasterAssetId: string;
  readonly dirtyTiles: readonly DirtyTile[];
  readonly copiedBytes: number;
  readonly cowSplitCount: number;
}

export function editCelPixel(state: ProjectState, celId: string, x: number, y: number, colorIndex: number): CelRasterEditResult {
  const sourceCel = cel(state, celId);
  if (sourceCel === undefined || sourceCel.assetId === undefined) throw new Error("Cel has no Raster backing to edit.");
  const sourceAsset = state.assets[sourceCel.assetId];
  if (sourceAsset === undefined) throw new Error("Cel Raster backing is missing.");
  const shared = cloneProjectStateShared(state);
  const newAssetId = sourceCel.bindingMode === "DUPLICATE_INDEPENDENT" ? `${state.projectId}:raster:${sourceCel.celId}:fork:${sourceCel.recordVersion}` : sourceCel.assetId;
  const rasterAsset = newAssetId === sourceCel.assetId ? shared.assets[sourceCel.assetId] : { ...sourceAsset, id: newAssetId, raster: sourceAsset.raster.sharedClone() };
  if (rasterAsset === undefined) throw new Error("Cel edit Raster backing is missing.");
  const mutation = rasterAsset.raster.setPixel(rasterAsset.id, x, y, colorIndex);
  const updatedCel: Draw2Cel = { ...sourceCel, assetId: newAssetId, bindingMode: "RASTER", lifecycle: "ACTIVE", recordVersion: sourceCel.recordVersion + (newAssetId === sourceCel.assetId ? 0 : 1) };
  const nextState: ProjectState = {
    ...shared,
    cels: shared.cels.map((item) => item.celId === sourceCel.celId ? updatedCel : item),
    assets: { ...shared.assets, [newAssetId]: { ...rasterAsset, revision: rasterAsset.revision + (mutation.changed ? 1 : 0) } },
  };
  return { ok: true, state: nextState, cel: updatedCel, rasterAssetId: newAssetId, dirtyTiles: mutation.changed ? [mutation.tile] : [], copiedBytes: mutation.copiedBytes, cowSplitCount: mutation.cowSplit ? 1 : 0 };
}

export interface TimelineSessionState {
  readonly activeFrameId: string;
  readonly activeLayerTrackId: string;
  readonly activeCelId?: string;
  readonly selectedFrameId?: string;
  readonly scrollTop: number;
  readonly scrollLeft: number;
  readonly zoom: number;
}

export function createTimelineSession(state: ProjectState): TimelineSessionState {
  return { activeFrameId: state.activeFrameId, activeLayerTrackId: state.activeLayerId, activeCelId: state.activeCelId, selectedFrameId: state.activeFrameId, scrollTop: 0, scrollLeft: 0, zoom: 1 };
}

export function setTimelineSessionActiveFrame(state: ProjectState, session: TimelineSessionState, frameId: string): TimelineSessionState {
  if (frame(state, frameId) === undefined) throw new Error("Session Frame does not exist.");
  return { ...session, activeFrameId: frameId, selectedFrameId: frameId };
}

export function setTimelineSessionScroll(session: TimelineSessionState, scrollTop: number, scrollLeft: number): TimelineSessionState {
  if (!Number.isFinite(scrollTop) || scrollTop < 0 || !Number.isFinite(scrollLeft) || scrollLeft < 0) throw new Error("Timeline scroll must be finite and non-negative.");
  return { ...session, scrollTop, scrollLeft };
}

export interface TimelineVirtualWindow {
  readonly frameIds: readonly string[];
  readonly layerTrackIds: readonly string[];
  readonly firstFrameIndex: number;
  readonly lastFrameIndex: number;
  readonly firstLayerIndex: number;
  readonly lastLayerIndex: number;
  readonly totalWidth: number;
  readonly totalHeight: number;
  readonly overscan: number;
}

export function calculateTimelineWindow(state: ProjectState, options: { readonly scrollTop: number; readonly scrollLeft: number; readonly viewportWidth: number; readonly viewportHeight: number; readonly frameCellWidth?: number; readonly layerRowHeight?: number; readonly overscan?: number }): TimelineVirtualWindow {
  const frameCellWidth = options.frameCellWidth ?? 48;
  const layerRowHeight = options.layerRowHeight ?? 38;
  const overscan = options.overscan ?? 2;
  if (![options.scrollTop, options.scrollLeft, options.viewportWidth, options.viewportHeight, frameCellWidth, layerRowHeight, overscan].every(Number.isFinite) || options.viewportWidth < 1 || options.viewportHeight < 1 || frameCellWidth < 1 || layerRowHeight < 1 || overscan < 0) throw new Error("Timeline virtual window values are invalid.");
  const firstFrameIndex = Math.max(0, Math.floor(options.scrollLeft / frameCellWidth) - overscan);
  const lastFrameIndex = Math.min(state.timeline.frameOrder.length - 1, Math.ceil((options.scrollLeft + options.viewportWidth) / frameCellWidth) + overscan);
  const firstLayerIndex = Math.max(0, Math.floor(options.scrollTop / layerRowHeight) - overscan);
  const lastLayerIndex = Math.min(state.timeline.layerTrackOrder.length - 1, Math.ceil((options.scrollTop + options.viewportHeight) / layerRowHeight) + overscan);
  return {
    frameIds: firstFrameIndex > lastFrameIndex ? [] : state.timeline.frameOrder.slice(firstFrameIndex, lastFrameIndex + 1),
    layerTrackIds: firstLayerIndex > lastLayerIndex ? [] : state.timeline.layerTrackOrder.slice(firstLayerIndex, lastLayerIndex + 1),
    firstFrameIndex,
    lastFrameIndex,
    firstLayerIndex,
    lastLayerIndex,
    totalWidth: state.timeline.frameOrder.length * frameCellWidth,
    totalHeight: state.timeline.layerTrackOrder.length * layerRowHeight,
    overscan,
  };
}

export interface OnionSkinSettings {
  readonly enabled: boolean;
  readonly previousFrameCount: number;
  readonly nextFrameCount: number;
  readonly opacity: number;
}

export interface OnionSkinReference {
  readonly frameId: string;
  readonly role: "PREVIOUS" | "NEXT";
  readonly distance: number;
  readonly opacity: number;
  readonly celIds: readonly string[];
}

export interface OnionSkinProjection {
  readonly currentFrameId: string;
  readonly references: readonly OnionSkinReference[];
  readonly dirtyDomain: "ONION_SKIN_DIRTY";
  readonly canonicalMutation: false;
}

export function resolveOnionSkinNeighborhood(state: ProjectState, currentFrameId: string, settings: OnionSkinSettings): OnionSkinProjection {
  if (frame(state, currentFrameId) === undefined) throw new Error("Onion Skin current Frame does not exist.");
  if (!settings.enabled) return { currentFrameId, references: [], dirtyDomain: "ONION_SKIN_DIRTY", canonicalMutation: false };
  const currentIndex = state.timeline.frameOrder.indexOf(currentFrameId);
  if (currentIndex < 0 || !integer(settings.previousFrameCount) || !integer(settings.nextFrameCount) || settings.previousFrameCount < 0 || settings.nextFrameCount < 0 || !Number.isFinite(settings.opacity) || settings.opacity < 0 || settings.opacity > 1) throw new Error("Onion Skin settings are invalid.");
  const references: OnionSkinReference[] = [];
  for (let distance = 1; distance <= settings.previousFrameCount; distance += 1) {
    const id = state.timeline.frameOrder[currentIndex - distance];
    if (id !== undefined) references.push({ frameId: id, role: "PREVIOUS", distance, opacity: settings.opacity / distance, celIds: state.cels.filter((item) => item.frameId === id && item.lifecycle === "ACTIVE").map((item) => item.celId) });
  }
  for (let distance = 1; distance <= settings.nextFrameCount; distance += 1) {
    const id = state.timeline.frameOrder[currentIndex + distance];
    if (id !== undefined) references.push({ frameId: id, role: "NEXT", distance, opacity: settings.opacity / distance, celIds: state.cels.filter((item) => item.frameId === id && item.lifecycle === "ACTIVE").map((item) => item.celId) });
  }
  return { currentFrameId, references, dirtyDomain: "ONION_SKIN_DIRTY", canonicalMutation: false };
}

export interface PlaybackProjection {
  readonly frameId: string;
  readonly elapsedMs: number;
  readonly requestFrameIds: readonly string[];
  readonly canonicalMutation: false;
}

export function resolvePlaybackProjection(state: ProjectState, currentFrameId: string, elapsedMs: number): PlaybackProjection {
  if (frame(state, currentFrameId) === undefined || !Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error("Playback request is invalid.");
  const totalDuration = state.frames.reduce((total, item) => total + item.durationMs, 0);
  if (totalDuration < 1) throw new Error("Timeline has no playable duration.");
  const startIndex = state.timeline.frameOrder.indexOf(currentFrameId);
  if (startIndex < 0) throw new Error("Playback current Frame is not in Timeline order.");
  let remaining = elapsedMs % totalDuration;
  for (let offset = 0; offset < state.timeline.frameOrder.length; offset += 1) {
    const id = state.timeline.frameOrder[(startIndex + offset) % state.timeline.frameOrder.length];
    if (id === undefined) continue;
    const item = frame(state, id);
    if (item === undefined) continue;
    if (remaining < item.durationMs) return { frameId: id, elapsedMs, requestFrameIds: [id], canonicalMutation: false };
    remaining -= item.durationMs;
  }
  return { frameId: currentFrameId, elapsedMs, requestFrameIds: [currentFrameId], canonicalMutation: false };
}

export interface TimelineMemoryMetrics {
  readonly frameMetadataBytes: number;
  readonly layerTrackMetadataBytes: number;
  readonly celMetadataBytes: number;
  readonly allocatedRasterTileBytes: number;
  readonly emptyCelCount: number;
  readonly sharedCOWBytes: number;
  readonly cowSplitBytes: number;
  readonly timelineProjectionWindowCount: number;
  readonly onionSkinCacheBytes: number;
}

export function measureTimelineMemory(state: ProjectState, windowCount = 0, onionSkinCacheBytes = 0): TimelineMemoryMetrics {
  const uniqueAssets = new Set(state.cels.map((item) => item.assetId).filter((id): id is string => id !== undefined));
  let allocatedRasterTileBytes = 0;
  let sharedCOWBytes = 0;
  let cowSplitBytes = 0;
  for (const assetId of uniqueAssets) {
    const asset = state.assets[assetId];
    if (asset === undefined) continue;
    const memory = asset.raster.memoryMetrics();
    allocatedRasterTileBytes += memory.allocatedTileBytes;
    sharedCOWBytes += memory.sharedTileBytes;
    cowSplitBytes += memory.copiedBytes;
  }
  return {
    frameMetadataBytes: new TextEncoder().encode(canonicalJson(state.frames)).byteLength,
    layerTrackMetadataBytes: new TextEncoder().encode(canonicalJson(state.layers)).byteLength,
    celMetadataBytes: new TextEncoder().encode(canonicalJson(state.cels)).byteLength,
    allocatedRasterTileBytes,
    emptyCelCount: state.cels.filter((item) => item.assetId === undefined || item.bindingMode === "EMPTY").length,
    sharedCOWBytes,
    cowSplitBytes,
    timelineProjectionWindowCount: windowCount,
    onionSkinCacheBytes,
  };
}

export interface StructuralJournalSink {
  append(operation: CanonicalOperation): Promise<void>;
  writeCheckpoint(state: ProjectState): Promise<void>;
}

export class InMemoryStructuralJournal implements StructuralJournalSink {
  readonly operations: CanonicalOperation[] = [];
  readonly checkpoints: ProjectState[] = [];
  async append(operation: CanonicalOperation): Promise<void> { this.operations.push(structuredClone(operation)); }
  async writeCheckpoint(state: ProjectState): Promise<void> { this.checkpoints.push(cloneProjectStateShared(state)); }
}

export interface StructuralSyncEnvelope {
  readonly transport: "ACTIVE_SYNC";
  readonly operation: CanonicalOperation;
  readonly snapshotIncluded: false;
}

export interface StructuralSyncAdapter {
  send(envelope: StructuralSyncEnvelope): Promise<void>;
}

export class InMemoryStructuralSync implements StructuralSyncAdapter {
  readonly envelopes: StructuralSyncEnvelope[] = [];
  async send(envelope: StructuralSyncEnvelope): Promise<void> { this.envelopes.push(structuredClone(envelope)); }
}

export function toStructuralSyncEnvelope(operation: CanonicalOperation): StructuralSyncEnvelope {
  return { transport: "ACTIVE_SYNC", operation, snapshotIncluded: false };
}

export function isPersonalTimelineStateKey(key: string): boolean {
  return ["scrollTop", "scrollLeft", "zoom", "hoverFrameId", "activeTool", "onionSkinPreference"].includes(key);
}
