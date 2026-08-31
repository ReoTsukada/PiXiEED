/** Lazy EditorCore bridge for WP-170 write sets. This is not part of the initial advanced tool chunk. */

import {
  type EditorCommand,
  EditorCore,
  type ExecuteResult,
  type ProjectState,
} from "./draw2-core.ts";
import type { AdvancedOperation } from "./wp170-advanced-tools-core.ts";

export interface AdvancedEditorCommandContext {
  readonly commandId: string;
  readonly projectId: string;
  readonly assetId: string;
  readonly actorId: string;
  readonly clientId: string;
  readonly clientSequence: number;
  readonly baseStructureEpoch: number;
  readonly createdAtMonotonicMs: number;
}

export function buildAdvancedWriteSetCommand(
  operation: AdvancedOperation,
  context: AdvancedEditorCommandContext,
): EditorCommand {
  return {
    commandId: context.commandId,
    commandType: "raster.writeSet",
    schemaVersion: 1,
    projectId: context.projectId,
    assetId: context.assetId,
    actorId: context.actorId,
    clientId: context.clientId,
    clientSequence: context.clientSequence,
    baseStructureEpoch: context.baseStructureEpoch,
    createdAtMonotonicMs: context.createdAtMonotonicMs,
    payload: {
      writes: operation.writes,
      toolSessionId: operation.inputFingerprint,
      sourceOperationType: operation.operationType,
    },
  };
}

export async function commitAdvancedOperation(
  core: EditorCore,
  operation: AdvancedOperation,
  context: AdvancedEditorCommandContext,
): Promise<ExecuteResult> {
  if (operation.previewOnly) {
    return {
      ok: false,
      state: core.state,
      diagnostics: [{
        code: "ADVANCED_PREVIEW_COMMIT_FORBIDDEN",
        severity: "error",
        message: "Preview operations cannot be committed.",
      }],
    };
  }
  const command = buildAdvancedWriteSetCommand(operation, context);
  return core.execute(command);
}

export function readEditorTarget(state: ProjectState, assetId: string): {
  readonly assetId: string;
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  readonly palette: readonly number[];
  readonly readPixel: (x: number, y: number) => number;
} | undefined {
  const asset = state.assets[assetId];
  if (asset === undefined) return undefined;
  return {
    assetId: asset.id,
    width: asset.width,
    height: asset.height,
    tileSize: asset.raster.tileSize,
    palette: asset.palette,
    readPixel: (x, y) => asset.raster.getPixel(x, y),
  };
}
