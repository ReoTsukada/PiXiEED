// src/wp170-advanced-editor-adapter.ts
function buildAdvancedWriteSetCommand(operation, context) {
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
      sourceOperationType: operation.operationType
    }
  };
}
async function commitAdvancedOperation(core, operation, context) {
  if (operation.previewOnly) return {
    ok: false,
    state: core.state,
    diagnostics: [
      {
        code: "ADVANCED_PREVIEW_COMMIT_FORBIDDEN",
        severity: "error",
        message: "Preview operations cannot be committed."
      }
    ]
  };
  const command = buildAdvancedWriteSetCommand(operation, context);
  return core.execute(command);
}
function readEditorTarget(state, assetId) {
  const asset = state.assets[assetId];
  if (asset === void 0) return void 0;
  return {
    assetId: asset.id,
    width: asset.width,
    height: asset.height,
    tileSize: asset.raster.tileSize,
    palette: asset.palette,
    readPixel: (x, y) => asset.raster.getPixel(x, y)
  };
}
export {
  buildAdvancedWriteSetCommand,
  commitAdvancedOperation,
  readEditorTarget
};
