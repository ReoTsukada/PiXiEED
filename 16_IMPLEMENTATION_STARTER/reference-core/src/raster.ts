import type {
  CanonicalOperation,
  CommandEnvelope,
  CommandHandler,
  Diagnostic,
  MutationOutcome,
  ProjectState,
  RasterAsset,
} from "./types.js";

export interface SetPixelPayload {
  readonly x: number;
  readonly y: number;
  readonly colorIndex: number;
}

export interface SetPixelOperationPayload extends SetPixelPayload {
  readonly previousColorIndex: number;
}

function rasterError(code: string, message: string, path?: string): Diagnostic {
  return path === undefined
    ? { code, severity: "error", message }
    : { code, severity: "error", message, path };
}

function getRasterAsset(
  state: Readonly<ProjectState>,
  assetId: string
): RasterAsset | undefined {
  return state.assets[assetId];
}

export const setPixelHandler: CommandHandler<SetPixelPayload> = {
  commandType: "raster.setPixel",

  validate(
    state: Readonly<ProjectState>,
    command: CommandEnvelope<SetPixelPayload>
  ): Diagnostic[] {
    const asset = getRasterAsset(state, command.assetId);
    if (asset === undefined) {
      return [
        rasterError(
          "RASTER_ASSET_NOT_FOUND",
          `Raster asset not found: ${command.assetId}.`,
          "assetId"
        ),
      ];
    }

    const { x, y, colorIndex } = command.payload;
    const diagnostics: Diagnostic[] = [];

    if (!Number.isInteger(x) || x < 0 || x >= asset.width) {
      diagnostics.push(rasterError(
        "RASTER_X_OUT_OF_BOUNDS",
        `x must be between 0 and ${asset.width - 1}.`,
        "payload.x"
      ));
    }

    if (!Number.isInteger(y) || y < 0 || y >= asset.height) {
      diagnostics.push(rasterError(
        "RASTER_Y_OUT_OF_BOUNDS",
        `y must be between 0 and ${asset.height - 1}.`,
        "payload.y"
      ));
    }

    if (
      !Number.isInteger(colorIndex) ||
      colorIndex < 0 ||
      colorIndex >= asset.palette.length
    ) {
      diagnostics.push(rasterError(
        "RASTER_COLOR_INDEX_INVALID",
        `colorIndex must reference the current palette.`,
        "payload.colorIndex"
      ));
    }

    return diagnostics;
  },

  apply(
    draft: ProjectState,
    command: CommandEnvelope<SetPixelPayload>
  ): MutationOutcome {
    const asset = draft.assets[command.assetId];
    if (asset === undefined) {
      throw new Error(`Raster asset disappeared during apply: ${command.assetId}`);
    }

    const { x, y, colorIndex } = command.payload;
    const index = y * asset.width + x;
    const previousColorIndex = asset.pixels[index];

    if (previousColorIndex === undefined) {
      throw new Error(`Raster pixel index is missing: ${index}`);
    }

    asset.pixels[index] = colorIndex;
    asset.revision += 1;

    const operationPayload: SetPixelOperationPayload = {
      x,
      y,
      colorIndex,
      previousColorIndex,
    };

    const inversePayload: SetPixelOperationPayload = {
      x,
      y,
      colorIndex: previousColorIndex,
      previousColorIndex: colorIndex,
    };

    return {
      operationPayload,
      inversePayload,
      dirtyAssets: [asset.id],
      dirtyRegions: [{
        assetId: asset.id,
        x,
        y,
        width: 1,
        height: 1,
      }],
      buildInvalidations: [{
        kind: "preview",
        targetId: asset.id,
        reason: "Raster pixel changed.",
      }],
      memoryDeltaBytes: 0,
    };
  },
};

export function applySetPixelOperation(
  state: ProjectState,
  operation: CanonicalOperation<SetPixelOperationPayload>
): void {
  if (operation.operationType !== "raster.setPixel") {
    throw new Error(`Unsupported raster operation: ${operation.operationType}`);
  }

  const asset = state.assets[operation.assetId];
  if (asset === undefined) {
    throw new Error(`Raster asset not found during replay: ${operation.assetId}`);
  }

  const { x, y, colorIndex } = operation.payload;
  if (x < 0 || y < 0 || x >= asset.width || y >= asset.height) {
    throw new Error("Journal operation contains an out-of-bounds pixel.");
  }

  if (colorIndex < 0 || colorIndex >= asset.palette.length) {
    throw new Error("Journal operation contains an invalid palette index.");
  }

  asset.pixels[y * asset.width + x] = colorIndex;
  asset.revision += 1;
}
