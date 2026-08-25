export type DiagnosticSeverity = "info" | "warning" | "error";

export interface Diagnostic {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface DirtyRegion {
  readonly assetId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface BuildInvalidation {
  readonly kind: "preview" | "thumbnail" | "export" | "runtime_binding";
  readonly targetId: string;
  readonly reason: string;
}

export interface RasterAsset {
  readonly id: string;
  revision: number;
  readonly width: number;
  readonly height: number;
  palette: number[];
  pixels: Uint8Array;
}

export interface ProjectState {
  readonly schemaVersion: 1;
  readonly projectId: string;
  structureEpoch: number;
  assets: Record<string, RasterAsset>;
  appliedCommandIds: string[];
  lastClientSequenceByClient: Record<string, number>;
}

export interface CommandEnvelope<TPayload = unknown> {
  readonly commandId: string;
  readonly commandType: string;
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

export interface CanonicalOperation<TPayload = unknown> {
  readonly operationId: string;
  readonly operationType: string;
  readonly schemaVersion: 1;
  readonly commandId: string;
  readonly projectId: string;
  readonly assetId: string;
  readonly actorId: string;
  readonly clientId: string;
  readonly clientSequence: number;
  readonly structureEpoch: number;
  readonly payload: TPayload;
  readonly inverseOf?: string;
}

export interface CommandResult {
  readonly operation: CanonicalOperation;
  readonly inverse?: CanonicalOperation;
  readonly dirtyAssets: string[];
  readonly dirtyRegions: DirtyRegion[];
  readonly buildInvalidations: BuildInvalidation[];
  readonly memoryDeltaBytes: number;
  readonly warnings: Diagnostic[];
}

export type ExecuteResult =
  | {
      readonly ok: true;
      readonly state: ProjectState;
      readonly result: CommandResult;
    }
  | {
      readonly ok: false;
      readonly state: ProjectState;
      readonly diagnostics: Diagnostic[];
    };

export interface MutationOutcome {
  readonly operationPayload: unknown;
  readonly inversePayload?: unknown;
  readonly dirtyAssets?: string[];
  readonly dirtyRegions?: DirtyRegion[];
  readonly buildInvalidations?: BuildInvalidation[];
  readonly memoryDeltaBytes?: number;
  readonly warnings?: Diagnostic[];
}

export interface CommandHandler<TPayload> {
  readonly commandType: string;
  validate(
    state: Readonly<ProjectState>,
    command: CommandEnvelope<TPayload>
  ): Diagnostic[];
  apply(
    draft: ProjectState,
    command: CommandEnvelope<TPayload>
  ): MutationOutcome;
}
