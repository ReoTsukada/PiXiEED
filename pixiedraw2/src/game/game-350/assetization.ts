/**
 * Deterministic, AI-free assetization for iDRAW selections.
 *
 * This module never inspects pixels and never guesses semantic intent from
 * visual similarity. A split is automatic only when the source provides an
 * explicit grid, frame range, layer plan, or tag. Ambiguous input is returned
 * as REVIEW_REQUIRED and must not be committed by a caller.
 */

export interface AssetizationRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface AssetizationGrid {
  readonly cellWidth: number;
  readonly cellHeight: number;
}

export interface AssetizationSourceFrame {
  readonly frameId: string;
  readonly index: number;
  readonly durationMs?: number;
  /** Optional per-frame selection metadata for free-form sheets. */
  readonly region?: AssetizationRect;
  /** Optional per-frame layer subset for layered character parts. */
  readonly layerIds?: readonly string[];
  /** Preserve an explicit source-editor mirror instead of silently dropping it. */
  readonly flipX?: boolean;
  readonly flipY?: boolean;
}

export interface AssetizationLayerGroup {
  readonly groupId: string;
  readonly label: string;
  readonly layerIds: readonly string[];
}

export interface AssetizationAnimationRange {
  readonly animationId: string;
  readonly label: string;
  readonly frameIds: readonly string[];
  readonly loop: "LOOP" | "ONCE" | "PING_PONG";
  readonly roles?: readonly string[];
}

export interface DrawAssetizationInput {
  readonly sourceProjectId: string;
  readonly sourceRevisionId: string;
  readonly sourceCanvasId: string;
  readonly contentHash: string;
  readonly selection: AssetizationRect;
  readonly sourceFrames: readonly AssetizationSourceFrame[];
  /** Explicitly selected source layers. No implicit hidden-layer discovery. */
  readonly selectedLayerIds: readonly string[];
  /** Optional persisted grid declaration from the source editor. */
  readonly grid?: AssetizationGrid;
  /** Optional explicit animation ranges, including ranges across frames. */
  readonly animationRanges?: readonly AssetizationAnimationRange[];
  readonly layerMode?: "COMPOSITE" | "SEPARATE";
  readonly layerGroups?: readonly AssetizationLayerGroup[];
  /** Only copied; never inferred from pixels or labels. */
  readonly roles?: readonly string[];
}

export interface AssetizationFrameReference {
  readonly sourceFrameId: string;
  readonly layerIds: readonly string[];
  readonly region: AssetizationRect;
  readonly durationMs?: number;
  readonly flipX?: boolean;
  readonly flipY?: boolean;
}

export interface AssetProposal {
  readonly proposalId: string;
  readonly kind: "SPRITE" | "ANIMATION";
  readonly name: string;
  readonly sourceProjectId: string;
  readonly sourceRevisionId: string;
  readonly sourceCanvasId: string;
  readonly contentHash: string;
  readonly roles: readonly string[];
  readonly frames: readonly AssetizationFrameReference[];
  readonly loop?: "LOOP" | "ONCE" | "PING_PONG";
  readonly evidence: readonly AssetizationEvidence[];
}

export interface AssetizationEvidence {
  readonly code:
    | "EXPLICIT_SELECTION"
    | "EXPLICIT_GRID"
    | "EXPLICIT_FRAME_RANGE"
    | "EXPLICIT_LAYER_PLAN"
    | "EXPLICIT_TAG";
  readonly detail: string;
}

export type AssetizationResult =
  | {
    readonly status: "DETERMINISTIC";
    readonly proposals: readonly AssetProposal[];
    readonly inputHash: string;
  }
  | {
    readonly status: "REVIEW_REQUIRED";
    readonly candidates: readonly AssetProposal[];
    readonly inputHash: string;
    readonly reasons: readonly string[];
  }
  | {
    readonly status: "NO_SPLIT";
    readonly proposal: AssetProposal;
    readonly inputHash: string;
    readonly reason: string;
  };

const MAX_PROPOSALS = 4096;

function trimId(value: string): string {
  return value.trim();
}

function uniqueIds(values: readonly string[]): string[] {
  return [...new Set(values.map(trimId).filter((value) => value.length > 0))];
}

function uniqueLabels(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter((value) => value.length > 0))];
}

function rectValid(rect: AssetizationRect): boolean {
  return Number.isFinite(rect.x) && Number.isFinite(rect.y) &&
    Number.isSafeInteger(rect.width) && rect.width > 0 &&
    Number.isSafeInteger(rect.height) && rect.height > 0;
}

function gridValid(grid: AssetizationGrid | undefined): boolean {
  return grid === undefined || (
    Number.isSafeInteger(grid.cellWidth) && grid.cellWidth > 0 &&
    Number.isSafeInteger(grid.cellHeight) && grid.cellHeight > 0
  );
}

function stableInputKey(input: DrawAssetizationInput): string {
  return JSON.stringify({
    sourceProjectId: input.sourceProjectId,
    sourceRevisionId: input.sourceRevisionId,
    sourceCanvasId: input.sourceCanvasId,
    contentHash: input.contentHash,
    selection: input.selection,
    sourceFrames: input.sourceFrames,
    selectedLayerIds: input.selectedLayerIds,
    grid: input.grid ?? null,
    animationRanges: input.animationRanges ?? null,
    layerMode: input.layerMode ?? "COMPOSITE",
    layerGroups: input.layerGroups ?? null,
    roles: input.roles ?? null,
  });
}

function inputHash(input: DrawAssetizationInput): string {
  let hash = 2166136261;
  for (const char of stableInputKey(input)) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `assetization:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function frameMap(input: DrawAssetizationInput): Map<string, AssetizationSourceFrame> {
  return new Map(input.sourceFrames.map((frame) => [trimId(frame.frameId), frame]));
}

function layerPlan(input: DrawAssetizationInput): {
  readonly layers: readonly string[];
  readonly label: string;
  readonly evidence: AssetizationEvidence;
}[] | undefined {
  const selectedLayerIds = uniqueIds(input.selectedLayerIds);
  const mode = input.layerMode ?? "COMPOSITE";
  if (mode === "COMPOSITE") {
    return selectedLayerIds.length === 0
      ? undefined
      : [{
        layers: selectedLayerIds,
        label: "Composite",
        evidence: {
          code: "EXPLICIT_LAYER_PLAN",
          detail: "selectedLayerIds + COMPOSITE",
        },
      }];
  }
  const groups = input.layerGroups ?? [];
  if (groups.length === 0) return undefined;
  const selected = new Set(selectedLayerIds);
  const result = groups.map((group) => ({
    layers: uniqueIds(group.layerIds).filter((id) => selected.has(id)),
    label: group.label.trim(),
    evidence: {
      code: "EXPLICIT_LAYER_PLAN" as const,
      detail: `layer group ${group.groupId.trim()}`,
    },
  })).filter((group) => group.layers.length > 0 && group.label.length > 0);
  return result.length === groups.length ? result : undefined;
}

function frameReference(
  frame: AssetizationSourceFrame,
  region: AssetizationRect,
  layers: readonly string[],
): AssetizationFrameReference {
  return {
    sourceFrameId: trimId(frame.frameId),
    layerIds: [...(frame.layerIds === undefined ? layers : uniqueIds(frame.layerIds))],
    region: { ...(frame.region ?? region) },
    ...(frame.durationMs === undefined ? {} : { durationMs: frame.durationMs }),
    ...(frame.flipX === undefined ? {} : { flipX: frame.flipX }),
    ...(frame.flipY === undefined ? {} : { flipY: frame.flipY }),
  };
}

function proposal(
  input: DrawAssetizationInput,
  kind: AssetProposal["kind"],
  name: string,
  frames: readonly AssetizationFrameReference[],
  roles: readonly string[],
  evidence: readonly AssetizationEvidence[],
  loop?: AssetProposal["loop"],
): AssetProposal {
  const proposalKey = JSON.stringify({ kind, name, frames, roles, loop });
  let hash = 2166136261;
  for (const char of proposalKey) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return {
    proposalId: `proposal:${(hash >>> 0).toString(16).padStart(8, "0")}`,
    kind,
    name,
    sourceProjectId: input.sourceProjectId.trim(),
    sourceRevisionId: input.sourceRevisionId.trim(),
    sourceCanvasId: input.sourceCanvasId.trim(),
    contentHash: input.contentHash.trim(),
    roles: [...roles],
    frames: frames.map((frame) => ({
      ...frame,
      layerIds: [...frame.layerIds],
      region: { ...frame.region },
    })),
    ...(loop === undefined ? {} : { loop }),
    evidence: [...evidence],
  };
}

function review(
  input: DrawAssetizationInput,
  reasons: readonly string[],
  candidates: readonly AssetProposal[] = [],
): AssetizationResult {
  return {
    status: "REVIEW_REQUIRED",
    candidates,
    inputHash: inputHash(input),
    reasons,
  };
}

/**
 * Detect asset units using only explicit source metadata.
 *
 * A NO_SPLIT result still contains one usable proposal. It means that the
 * selected source is safe to package as one Asset, but no automatic subdivision
 * was justified.
 */
export function detectDrawAssetization(
  input: DrawAssetizationInput,
): AssetizationResult {
  const reasons: string[] = [];
  if (
    input.sourceProjectId.trim().length === 0 ||
    input.sourceRevisionId.trim().length === 0 ||
    input.sourceCanvasId.trim().length === 0 ||
    input.contentHash.trim().length === 0
  ) reasons.push("source identity and contentHash are required");
  if (!rectValid(input.selection)) reasons.push("selection must contain positive safe integer dimensions");
  if (!gridValid(input.grid)) reasons.push("grid cell dimensions must be positive safe integers");
  if (input.sourceFrames.length === 0) reasons.push("at least one source frame is required");
  const frames = frameMap(input);
  if (frames.size !== input.sourceFrames.length) reasons.push("source frame IDs must be unique and non-empty");
  if (input.sourceFrames.some((frame) => !Number.isSafeInteger(frame.index) || frame.index < 0 || (frame.durationMs !== undefined && (!Number.isFinite(frame.durationMs) || frame.durationMs <= 0)))) {
    reasons.push("frame indexes and durations must be valid");
  }
  if (input.sourceFrames.some((frame) => frame.region !== undefined && !rectValid(frame.region))) {
    reasons.push("per-frame regions must contain positive safe integer dimensions");
  }
  if (input.sourceFrames.some((frame) => frame.layerIds !== undefined && uniqueIds(frame.layerIds).length === 0)) {
    reasons.push("per-frame layer IDs must be non-empty when supplied");
  }
  if (input.sourceFrames.some((frame) =>
    (frame.flipX !== undefined && typeof frame.flipX !== "boolean") ||
    (frame.flipY !== undefined && typeof frame.flipY !== "boolean")
  )) reasons.push("per-frame flip flags must be boolean when supplied");
  const layers = layerPlan(input);
  if (layers === undefined) reasons.push("an explicit non-empty layer plan is required");
  if (reasons.length > 0) return review(input, reasons);

  const selectedRoles = uniqueLabels(input.roles);
  const roleEvidence: readonly AssetizationEvidence[] = selectedRoles.length === 0
    ? []
    : [{ code: "EXPLICIT_TAG", detail: selectedRoles.join(", ") }];
  const selectionEvidence: AssetizationEvidence = {
    code: "EXPLICIT_SELECTION",
    detail: `${input.selection.width}×${input.selection.height} at ${input.selection.x},${input.selection.y}`,
  };
  const layerPlans = layers!;
  const frameList = [...input.sourceFrames].sort((left, right) => left.index - right.index);
  const ranges = input.animationRanges ?? [];
  const rangeIds = new Set<string>();
  const rangeReasons: string[] = [];
  for (const range of ranges) {
    const rangeId = trimId(range.animationId);
    const label = range.label.trim();
    if (rangeId.length === 0 || label.length === 0 || rangeIds.has(rangeId)) {
      rangeReasons.push("animation ranges require unique IDs and non-empty labels");
      continue;
    }
    rangeIds.add(rangeId);
    if (range.frameIds.length === 0) {
      rangeReasons.push(`animation range ${rangeId} has no frames`);
      continue;
    }
    for (const frameId of range.frameIds) {
      if (!frames.has(trimId(frameId))) rangeReasons.push(`animation range ${rangeId} references an unknown frame`);
    }
  }
  if (rangeReasons.length > 0) return review(input, rangeReasons);

  const proposals: AssetProposal[] = [];
  if (ranges.length > 0) {
    for (const range of ranges) {
      const rangeFrames = range.frameIds.map((frameId) => frames.get(trimId(frameId))!);
      const rangeEvidence: AssetizationEvidence[] = [
        selectionEvidence,
        { code: "EXPLICIT_FRAME_RANGE", detail: `${range.animationId}: ${range.frameIds.join(", ")}` },
        ...roleEvidence,
      ];
      for (const plan of layerPlans) {
        proposals.push(proposal(
          input,
          "ANIMATION",
          layerPlans.length === 1 ? range.label.trim() : `${range.label.trim()} · ${plan.label}`,
          rangeFrames.map((frame) => frameReference(frame, input.selection, plan.layers)),
          uniqueLabels([...(input.roles ?? []), ...(range.roles ?? [])]),
          [...rangeEvidence, plan.evidence],
          range.loop,
        ));
      }
    }
    if (proposals.length > MAX_PROPOSALS) return review(input, [`proposal count exceeds ${MAX_PROPOSALS}`], proposals.slice(0, MAX_PROPOSALS));
    return { status: "DETERMINISTIC", proposals, inputHash: inputHash(input) };
  }

  if (input.grid !== undefined) {
    if (frameList.length !== 1) return review(input, ["a grid split across multiple source frames requires explicit animation ranges"]);
    if (input.selection.width % input.grid.cellWidth !== 0 || input.selection.height % input.grid.cellHeight !== 0) {
      return review(input, ["selection bounds are not divisible by the declared grid cell"]);
    }
    const columns = input.selection.width / input.grid.cellWidth;
    const rows = input.selection.height / input.grid.cellHeight;
    const count = columns * rows * layerPlans.length;
    if (!Number.isSafeInteger(count) || count <= 0 || count > MAX_PROPOSALS) return review(input, [`grid proposal count must be between 1 and ${MAX_PROPOSALS}`]);
    const sourceFrame = frameList[0]!;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const region: AssetizationRect = {
          x: input.selection.x + column * input.grid.cellWidth,
          y: input.selection.y + row * input.grid.cellHeight,
          width: input.grid.cellWidth,
          height: input.grid.cellHeight,
        };
        for (const plan of layerPlans) {
          proposals.push(proposal(
            input,
            "SPRITE",
            layerPlans.length === 1
              ? `Sprite ${String(row * columns + column + 1).padStart(3, "0")}`
              : `Sprite ${String(row * columns + column + 1).padStart(3, "0")} · ${plan.label}`,
            [frameReference(sourceFrame, region, plan.layers)],
            selectedRoles,
            [selectionEvidence, { code: "EXPLICIT_GRID", detail: `${input.grid.cellWidth}×${input.grid.cellHeight}` }, ...roleEvidence, plan.evidence],
          ));
        }
      }
    }
    return { status: "DETERMINISTIC", proposals, inputHash: inputHash(input) };
  }

  if (frameList.length > 1) {
    return review(input, ["multiple source frames require an explicit animation range; no visual inference is allowed"]);
  }
  const sourceFrame = frameList[0]!;
  const plan = layerPlans[0]!;
  const single = proposal(
    input,
    "SPRITE",
    "Selected Asset",
    [frameReference(sourceFrame, input.selection, plan.layers)],
    selectedRoles,
    [selectionEvidence, ...roleEvidence, plan.evidence],
  );
  return {
    status: "NO_SPLIT",
    proposal: single,
    inputHash: inputHash(input),
    reason: "no explicit grid or animation range was supplied; the selected region remains one Asset",
  };
}

export type AudioDeliveryRole =
  | "BGM"
  | "SE"
  | "VOICE"
  | "AMBIENCE"
  | "UI"
  | "LOOP";

export interface AudioAssetizationRange {
  /** Stable range or marker identity from the source editor. */
  readonly rangeId: string;
  readonly label: string;
  readonly trackIds: readonly string[];
  readonly startTick: number;
  readonly durationTick: number;
  readonly role?: AudioDeliveryRole;
  readonly markerId?: string;
  readonly loop?: boolean;
}

export interface AudioAssetizationInput {
  readonly sourceProjectId: string;
  readonly sourceRevisionId: string;
  readonly contentHash: string;
  readonly ranges: readonly AudioAssetizationRange[];
}

export interface AudioAssetProposal {
  readonly proposalId: string;
  readonly kind: "AUDIO";
  readonly sourceProjectId: string;
  readonly sourceRevisionId: string;
  readonly contentHash: string;
  readonly rangeId: string;
  readonly label: string;
  readonly trackIds: readonly string[];
  readonly startTick: number;
  readonly durationTick: number;
  readonly role: AudioDeliveryRole | "UNCLASSIFIED_AUDIO";
  readonly markerId?: string;
  readonly loop: boolean;
  readonly evidence: readonly AssetizationEvidence[];
}

/** The canonical asset-delivery contract shared by Draw, Audio, Game, and Market. */
export const ASSET_PACKAGE_SCHEMA_VERSION = 1 as const;
export const ASSETIZATION_CONTRACT_VERSION = "PIXIEED_ASSETIZATION_V1" as const;

export type AssetPackageOfferKind = "ASSET" | "ASSET_PACK";
export type AssetDerivativePolicy =
  | "USE_ONLY"
  | "DERIVATIVE_ALLOWED"
  | "REDISTRIBUTION_ALLOWED";
export type AssetPackageSourceKind = "DRAW" | "AUDIO";

/**
 * A package source is an identity pointer, never a copied raster or audio
 * buffer. `sourceId` is an Asset Definition ID for Draw and a range ID for
 * Audio. Keeping that distinction explicit prevents a Track from becoming an
 * accidental Audio Asset boundary.
 */
export interface AssetPackageSource {
  readonly kind: AssetPackageSourceKind;
  readonly sourceId: string;
  readonly projectId: string;
  readonly revisionId: string;
  readonly contentHash: string;
  readonly canvasId?: string;
}

export interface DrawAssetPackageItemInput {
  readonly kind: "DRAW";
  readonly source: AssetPackageSource;
  readonly result: AssetizationResult;
  readonly label?: string;
}

export interface AudioAssetPackageItemInput {
  readonly kind: "AUDIO";
  readonly source: AssetPackageSource;
  readonly result: AudioAssetizationResult;
  readonly label?: string;
}

export type AssetPackageItemInput =
  | DrawAssetPackageItemInput
  | AudioAssetPackageItemInput;

export interface DrawAssetPackageEntry {
  readonly entryId: string;
  readonly kind: "DRAW";
  readonly label: string;
  readonly source: AssetPackageSource;
  readonly proposal: AssetProposal;
}

export interface AudioAssetPackageEntry {
  readonly entryId: string;
  readonly kind: "AUDIO";
  readonly label: string;
  readonly source: AssetPackageSource;
  readonly proposal: AudioAssetProposal;
}

export type AssetPackageEntry = DrawAssetPackageEntry | AudioAssetPackageEntry;

export interface AssetPackageManifest {
  readonly schemaVersion: typeof ASSET_PACKAGE_SCHEMA_VERSION;
  readonly status: "FINALIZED";
  readonly detectorVersion: typeof ASSETIZATION_CONTRACT_VERSION;
  /** Source revision observed when the creator confirmed this package. */
  readonly confirmationRevision: string;
  readonly packageId: string;
  readonly packageHash: string;
  readonly title: string;
  readonly description: string;
  readonly offerKind: AssetPackageOfferKind;
  readonly derivativePolicy: AssetDerivativePolicy;
  /** Omitted for a local draft until the account authority is available. */
  readonly sellerId?: string;
  readonly saleReadiness: "READY" | "ACCOUNT_REQUIRED";
  readonly entries: readonly AssetPackageEntry[];
}

export interface AssetPackageFinalizeInput {
  readonly title: string;
  readonly description?: string;
  readonly offerKind: AssetPackageOfferKind;
  readonly derivativePolicy: AssetDerivativePolicy;
  readonly confirmationRevision: string;
  readonly sellerId?: string;
  readonly items: readonly AssetPackageItemInput[];
}

export type AssetPackageFinalizationResult =
  | { readonly ok: true; readonly manifest: AssetPackageManifest }
  | {
    readonly ok: false;
    readonly code:
      | "ASSET_PACKAGE_INVALID"
      | "ASSET_PACKAGE_REVIEW_REQUIRED"
      | "ASSET_PACKAGE_EMPTY"
      | "ASSET_PACKAGE_CARDINALITY"
      | "ASSET_PACKAGE_SOURCE_MISMATCH"
      | "ASSET_PACKAGE_DUPLICATE_ENTRY";
    readonly reasons: readonly string[];
  };

export type AssetPackageValidationResult =
  | { readonly ok: true; readonly value: AssetPackageManifest }
  | { readonly ok: false; readonly reasons: readonly string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function packageText(value: string | undefined, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized : undefined;
}

function packageStableHash(value: unknown): string {
  let hash = 2166136261;
  const serialized = JSON.stringify(value);
  for (const char of serialized) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function canonicalPackageValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalPackageValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalPackageValue(value[key])]),
    );
  }
  return value;
}

async function sha256PackageBody(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalPackageValue(packageBody(value as Pick<AssetPackageManifest, "schemaVersion" | "detectorVersion" | "confirmationRevision" | "title" | "description" | "offerKind" | "derivativePolicy" | "sellerId" | "entries">))));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** Clone only the compact metadata; source raster/audio buffers stay external. */
export function cloneAssetPackageManifest(
  manifest: AssetPackageManifest,
): AssetPackageManifest {
  return {
    ...manifest,
    ...(manifest.sellerId === undefined ? {} : { sellerId: manifest.sellerId }),
    entries: manifest.entries.map((entry) => entry.kind === "DRAW"
      ? {
        ...entry,
        source: { ...entry.source },
        proposal: {
          ...entry.proposal,
          roles: [...entry.proposal.roles],
          frames: entry.proposal.frames.map((frame) => ({
            ...frame,
            layerIds: [...frame.layerIds],
            region: { ...frame.region },
          })),
          evidence: [...entry.proposal.evidence],
        },
      }
      : {
        ...entry,
        source: { ...entry.source },
        proposal: {
          ...entry.proposal,
          trackIds: [...entry.proposal.trackIds],
          evidence: [...entry.proposal.evidence],
        },
      }),
  };
}

function packageBody(manifest: Pick<AssetPackageManifest, "schemaVersion" | "detectorVersion" | "confirmationRevision" | "title" | "description" | "offerKind" | "derivativePolicy" | "sellerId" | "entries">): unknown {
  return {
    schemaVersion: manifest.schemaVersion,
    detectorVersion: manifest.detectorVersion,
    confirmationRevision: manifest.confirmationRevision,
    title: manifest.title,
    description: manifest.description,
    offerKind: manifest.offerKind,
    derivativePolicy: manifest.derivativePolicy,
    sellerId: manifest.sellerId ?? null,
    entries: manifest.entries,
  };
}

function packageEntryId(
  kind: AssetPackageSourceKind,
  source: AssetPackageSource,
  proposalId: string,
): string {
  return `entry:${kind.toLowerCase()}:${packageStableHash({
    kind,
    source,
    proposalId,
  })}`;
}

function sourceReasons(source: unknown): string[] {
  const reasons: string[] = [];
  if (!isRecord(source)) return ["source is required"];
  const kind = source.kind;
  if (kind !== "DRAW" && kind !== "AUDIO") reasons.push("source kind is unsupported");
  if (packageText(typeof source.sourceId === "string" ? source.sourceId : undefined, 256) === undefined) reasons.push("sourceId is required");
  if (packageText(typeof source.projectId === "string" ? source.projectId : undefined, 256) === undefined) reasons.push("source projectId is required");
  if (packageText(typeof source.revisionId === "string" ? source.revisionId : undefined, 256) === undefined) reasons.push("source revisionId is required");
  if (packageText(typeof source.contentHash === "string" ? source.contentHash : undefined, 512) === undefined) reasons.push("source contentHash is required");
  if (kind === "DRAW" && packageText(typeof source.canvasId === "string" ? source.canvasId : undefined, 256) === undefined) reasons.push("Draw source canvasId is required");
  return reasons;
}

function proposalSourceMatches(
  source: unknown,
  proposal: unknown,
): boolean {
  if (!isRecord(source) || !isRecord(proposal)) return false;
  if (source.kind === "DRAW" && (proposal.kind === "SPRITE" || proposal.kind === "ANIMATION")) {
    return typeof source.projectId === "string" &&
      typeof source.revisionId === "string" &&
      typeof source.contentHash === "string" &&
      typeof source.canvasId === "string" &&
      proposal.sourceProjectId === source.projectId.trim() &&
      proposal.sourceRevisionId === source.revisionId.trim() &&
      proposal.contentHash === source.contentHash.trim() &&
      proposal.sourceCanvasId === source.canvasId.trim();
  }
  if (source.kind === "AUDIO" && proposal.kind === "AUDIO") {
    return typeof source.sourceId === "string" &&
      typeof source.projectId === "string" &&
      typeof source.revisionId === "string" &&
      typeof source.contentHash === "string" &&
      proposal.sourceProjectId === source.projectId.trim() &&
      proposal.sourceRevisionId === source.revisionId.trim() &&
      proposal.contentHash === source.contentHash.trim() &&
      proposal.rangeId === source.sourceId.trim();
  }
  return false;
}

function proposalEntries(input: AssetPackageItemInput): {
  readonly entries: readonly AssetPackageEntry[];
  readonly reasons: readonly string[];
  readonly blockedByReview: boolean;
} {
  const reasons = sourceReasons(input.source);
  if (input.result.status === "REVIEW_REQUIRED") {
    return {
      entries: [],
      reasons: [...reasons, ...input.result.reasons.map((reason) => `${input.kind}: ${reason}`)],
      blockedByReview: true,
    };
  }
  const allProposals = input.result.status === "NO_SPLIT"
    ? [input.result.proposal]
    : input.result.proposals;
  // Audio items are range-addressed. A single detector result may contain
  // many ranges from one Track, but each package item selects exactly one
  // range by sourceId. Draw items intentionally keep every proposal from the
  // selected sheet/animation declaration so ASSET_PACK can preserve it.
  const proposals = input.kind === "AUDIO"
    ? allProposals.filter((proposal): proposal is AudioAssetProposal =>
      proposal.kind === "AUDIO" && proposal.rangeId === input.source.sourceId.trim())
    : allProposals;
  if (proposals.length === 0) {
    return { entries: [], reasons: [...reasons, `${input.kind}: no deterministic proposals`], blockedByReview: false };
  }
  const entries: AssetPackageEntry[] = [];
  for (const proposal of proposals) {
    if (!proposalSourceMatches(input.source, proposal)) {
      reasons.push(`${input.kind}: proposal ${proposal.proposalId} does not match its source revision or range`);
      continue;
    }
    const label = packageText(input.label, 128) ?? (proposal.kind === "AUDIO"
      ? (proposal as AudioAssetProposal).label
      : (proposal as AssetProposal).name);
    if (input.kind === "DRAW" && proposal.kind !== "AUDIO") {
      entries.push({
        entryId: packageEntryId("DRAW", input.source, proposal.proposalId),
        kind: "DRAW",
        label,
        source: { ...input.source },
        proposal: { ...proposal, frames: proposal.frames.map((frame) => ({ ...frame, layerIds: [...frame.layerIds], region: { ...frame.region } })), roles: [...proposal.roles], evidence: [...proposal.evidence] },
      });
    } else if (input.kind === "AUDIO" && proposal.kind === "AUDIO") {
      entries.push({
        entryId: packageEntryId("AUDIO", input.source, proposal.proposalId),
        kind: "AUDIO",
        label,
        source: { ...input.source },
        proposal: { ...proposal, trackIds: [...proposal.trackIds], evidence: [...proposal.evidence] },
      });
    } else {
      reasons.push(`${input.kind}: proposal kind is incompatible with the selected source`);
    }
  }
  return { entries, reasons, blockedByReview: false };
}

function packageStructureReasons(manifest: AssetPackageManifest): string[] {
  const reasons: string[] = [];
  if (manifest.schemaVersion !== ASSET_PACKAGE_SCHEMA_VERSION) reasons.push("unsupported package schemaVersion");
  if (manifest.status !== "FINALIZED") reasons.push("package status must be FINALIZED");
  if (manifest.detectorVersion !== ASSETIZATION_CONTRACT_VERSION) reasons.push("unsupported detectorVersion");
  if (packageText(manifest.confirmationRevision, 256) === undefined || manifest.confirmationRevision.trim().length === 0) reasons.push("confirmationRevision is required");
  if (packageText(manifest.packageId, 256) === undefined || manifest.packageId.trim().length === 0) reasons.push("packageId is required");
  if (!/^sha256:[0-9a-f]{64}$/u.test(manifest.packageHash)) reasons.push("packageHash must be a SHA-256 hash");
  if (packageText(manifest.title, 128) === undefined || manifest.title.trim().length === 0) reasons.push("title is required");
  if (packageText(manifest.description, 4096) === undefined) reasons.push("description is invalid");
  if (manifest.offerKind !== "ASSET" && manifest.offerKind !== "ASSET_PACK") reasons.push("offerKind is invalid");
  if (!(["USE_ONLY", "DERIVATIVE_ALLOWED", "REDISTRIBUTION_ALLOWED"] as readonly string[]).includes(manifest.derivativePolicy)) reasons.push("derivativePolicy is invalid");
  if (manifest.sellerId !== undefined && (packageText(manifest.sellerId, 256) === undefined || manifest.sellerId.trim().length === 0)) reasons.push("sellerId is invalid");
  const expectedReadiness = manifest.sellerId === undefined ? "ACCOUNT_REQUIRED" : "READY";
  if (manifest.saleReadiness !== expectedReadiness) reasons.push("saleReadiness does not match sellerId");
  const rawEntries: unknown = manifest.entries;
  const entries = Array.isArray(rawEntries) ? rawEntries : [];
  if (!Array.isArray(rawEntries) || entries.length === 0) reasons.push("at least one package entry is required");
  if (manifest.offerKind === "ASSET" && entries.length !== 1) reasons.push("ASSET must contain exactly one entry");
  if (manifest.offerKind === "ASSET_PACK" && entries.length < 2) reasons.push("ASSET_PACK must contain at least two entries");
  const entryIds = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    if (!isRecord(entry)) {
      reasons.push(`entry ${index} is invalid`);
      continue;
    }
    const entryId = typeof entry.entryId === "string" ? entry.entryId : "";
    if (entryId.trim().length === 0 || entryIds.has(entryId)) reasons.push(`entry ${index} has a duplicate or empty entryId`);
    entryIds.add(entryId);
    if (entry.kind !== "DRAW" && entry.kind !== "AUDIO") reasons.push(`entry ${index} kind is invalid`);
    if (typeof entry.label !== "string" || entry.label.trim().length === 0 || entry.label.length > 128) reasons.push(`entry ${index} label is invalid`);
    reasons.push(...sourceReasons(entry.source).map((reason) => `entry ${index}: ${reason}`));
    if (!isRecord(entry.proposal)) {
      reasons.push(`entry ${index} proposal is invalid`);
      continue;
    }
    if (entry.kind === "DRAW") {
      if (entry.proposal.kind !== "SPRITE" && entry.proposal.kind !== "ANIMATION") reasons.push(`entry ${index} Draw proposal is invalid`);
      else if (!proposalSourceMatches(entry.source, entry.proposal)) reasons.push(`entry ${index} Draw proposal source mismatch`);
    } else if (entry.proposal.kind !== "AUDIO" || !proposalSourceMatches(entry.source, entry.proposal)) {
      reasons.push(`entry ${index} Audio proposal source mismatch`);
    }
  }
  return reasons;
}

/** Validate structure without re-reading source pixels or audio buffers. */
export function validateAssetPackageManifest(
  value: unknown,
): AssetPackageValidationResult {
  if (!isRecord(value)) return { ok: false, reasons: ["package manifest must be an object"] };
  const manifest = value as unknown as AssetPackageManifest;
  const reasons = packageStructureReasons(manifest);
  return reasons.length === 0 ? { ok: true, value: manifest } : { ok: false, reasons };
}

/** Verify both the strict shape and the content-addressed package identity. */
export async function verifyAssetPackageManifest(
  manifest: AssetPackageManifest,
): Promise<AssetPackageValidationResult> {
  const structure = validateAssetPackageManifest(manifest);
  if (!structure.ok) return structure;
  const expectedHash = await sha256PackageBody(manifest);
  if (expectedHash !== manifest.packageHash) return { ok: false, reasons: ["packageHash does not match the finalized manifest"] };
  const expectedPackageId = `asset-package:${expectedHash.slice("sha256:".length, "sha256:".length + 24)}`;
  if (expectedPackageId !== manifest.packageId) return { ok: false, reasons: ["packageId does not match the packageHash"] };
  return structure;
}

/**
 * Finalize only deterministic proposals. This is the single local gate before
 * an Asset or Asset Pack can be handed to Market listing.
 */
export async function finalizeAssetPackage(
  input: AssetPackageFinalizeInput,
): Promise<AssetPackageFinalizationResult> {
  const title = packageText(input.title, 128);
  const description = packageText(input.description ?? "", 4096);
  const confirmationRevision = packageText(input.confirmationRevision, 256);
  const sellerId = input.sellerId === undefined ? undefined : packageText(input.sellerId, 256);
  const baseReasons: string[] = [];
  if (title === undefined || title.length === 0) baseReasons.push("title is required and must be at most 128 characters");
  if (description === undefined) baseReasons.push("description must be at most 4096 characters");
  if (confirmationRevision === undefined || confirmationRevision.length === 0) baseReasons.push("confirmationRevision is required");
  if (input.sellerId !== undefined && (sellerId === undefined || sellerId.length === 0)) baseReasons.push("sellerId is invalid");
  if (input.offerKind !== "ASSET" && input.offerKind !== "ASSET_PACK") baseReasons.push("offerKind is invalid");
  if (!(["USE_ONLY", "DERIVATIVE_ALLOWED", "REDISTRIBUTION_ALLOWED"] as readonly string[]).includes(input.derivativePolicy)) baseReasons.push("derivativePolicy is invalid");
  if (input.items.length === 0) return { ok: false, code: "ASSET_PACKAGE_EMPTY", reasons: ["at least one deterministic item is required"] };
  if (baseReasons.length > 0) return { ok: false, code: "ASSET_PACKAGE_INVALID", reasons: baseReasons };
  const entries: AssetPackageEntry[] = [];
  const reasons: string[] = [];
  let blockedByReview = false;
  for (const item of input.items) {
    const result = proposalEntries(item);
    entries.push(...result.entries);
    reasons.push(...result.reasons);
    blockedByReview ||= result.blockedByReview;
  }
  if (blockedByReview) return { ok: false, code: "ASSET_PACKAGE_REVIEW_REQUIRED", reasons };
  if (reasons.length > 0) return { ok: false, code: "ASSET_PACKAGE_SOURCE_MISMATCH", reasons };
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.entryId)) reasons.push(`duplicate package entry ${entry.entryId}`);
    ids.add(entry.entryId);
  }
  if (reasons.length > 0) return { ok: false, code: "ASSET_PACKAGE_DUPLICATE_ENTRY", reasons };
  if (input.offerKind === "ASSET" && entries.length !== 1) return { ok: false, code: "ASSET_PACKAGE_CARDINALITY", reasons: ["ASSET requires exactly one deterministic Asset entry; choose ASSET_PACK for a sheet or multi-range selection"] };
  if (input.offerKind === "ASSET_PACK" && entries.length < 2) return { ok: false, code: "ASSET_PACKAGE_CARDINALITY", reasons: ["ASSET_PACK requires at least two independently addressable Asset entries"] };
  const sortedEntries = [...entries];
  const manifestBase = {
    schemaVersion: ASSET_PACKAGE_SCHEMA_VERSION,
    status: "FINALIZED" as const,
    detectorVersion: ASSETIZATION_CONTRACT_VERSION,
    confirmationRevision: confirmationRevision!,
    title: title!,
    description: description!,
    offerKind: input.offerKind,
    derivativePolicy: input.derivativePolicy,
    ...(sellerId === undefined ? {} : { sellerId }),
    saleReadiness: sellerId === undefined ? "ACCOUNT_REQUIRED" as const : "READY" as const,
    entries: sortedEntries,
  };
  const packageHash = await sha256PackageBody(manifestBase);
  const manifest: AssetPackageManifest = {
    ...manifestBase,
    packageId: `asset-package:${packageHash.slice("sha256:".length, "sha256:".length + 24)}`,
    packageHash,
  };
  const verified = await verifyAssetPackageManifest(manifest);
  return verified.ok
    ? { ok: true, manifest }
    : { ok: false, code: "ASSET_PACKAGE_INVALID", reasons: verified.reasons };
}

export type AudioAssetizationResult =
  | {
    readonly status: "DETERMINISTIC";
    readonly proposals: readonly AudioAssetProposal[];
    readonly inputHash: string;
  }
  | {
    readonly status: "REVIEW_REQUIRED";
    readonly candidates: readonly AudioAssetProposal[];
    readonly inputHash: string;
    readonly reasons: readonly string[];
  };

function audioInputHash(input: AudioAssetizationInput): string {
  let hash = 2166136261;
  for (const char of JSON.stringify({
    sourceProjectId: input.sourceProjectId,
    sourceRevisionId: input.sourceRevisionId,
    contentHash: input.contentHash,
    ranges: input.ranges,
  })) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `audio-assetization:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function audioProposal(
  input: AudioAssetizationInput,
  range: AudioAssetizationRange,
): AudioAssetProposal {
  const trackIds = uniqueIds(range.trackIds);
  const rangeId = range.rangeId.trim();
  const label = range.label.trim();
  const key = JSON.stringify({
    sourceProjectId: input.sourceProjectId.trim(),
    sourceRevisionId: input.sourceRevisionId.trim(),
    contentHash: input.contentHash.trim(),
    rangeId,
    trackIds,
    startTick: range.startTick,
    durationTick: range.durationTick,
    role: range.role ?? "UNCLASSIFIED_AUDIO",
    markerId: range.markerId?.trim() || undefined,
    loop: range.loop === true,
  });
  let hash = 2166136261;
  for (const char of key) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  const evidence: AssetizationEvidence[] = [
    {
      code: "EXPLICIT_SELECTION",
      detail: `Tick ${range.startTick}–${range.startTick + range.durationTick}; tracks ${trackIds.join(", ")}`,
    },
    ...(range.markerId?.trim()
      ? [{ code: "EXPLICIT_FRAME_RANGE" as const, detail: `marker ${range.markerId.trim()}` }]
      : []),
    ...(range.role === undefined
      ? []
      : [{ code: "EXPLICIT_TAG" as const, detail: range.role }]),
  ];
  return {
    proposalId: `audio-proposal:${(hash >>> 0).toString(16).padStart(8, "0")}`,
    kind: "AUDIO",
    sourceProjectId: input.sourceProjectId.trim(),
    sourceRevisionId: input.sourceRevisionId.trim(),
    contentHash: input.contentHash.trim(),
    rangeId,
    label,
    trackIds,
    startTick: range.startTick,
    durationTick: range.durationTick,
    role: range.role ?? "UNCLASSIFIED_AUDIO",
    ...(range.markerId?.trim() ? { markerId: range.markerId.trim() } : {}),
    loop: range.loop === true,
    evidence,
  };
}

/**
 * Convert explicit iAUDIO ranges into independent delivery Assets.
 *
 * Track identity is intentionally not unique per proposal: several ranges on
 * one Track are expected and remain separate. Role is never inferred from
 * duration, waveform, tempo, or track name.
 */
export function detectAudioAssetization(
  input: AudioAssetizationInput,
): AudioAssetizationResult {
  const reasons: string[] = [];
  if (
    input.sourceProjectId.trim().length === 0 ||
    input.sourceRevisionId.trim().length === 0 ||
    input.contentHash.trim().length === 0
  ) reasons.push("source identity and contentHash are required");
  if (input.ranges.length === 0) reasons.push("at least one explicit audio range is required");
  const idsSeen = new Set<string>();
  for (const range of input.ranges) {
    const rangeId = range.rangeId.trim();
    const trackIds = uniqueIds(range.trackIds);
    if (rangeId.length === 0 || idsSeen.has(rangeId)) reasons.push("audio range IDs must be unique and non-empty");
    idsSeen.add(rangeId);
    if (range.label.trim().length === 0) reasons.push(`audio range ${rangeId || "(unnamed)"} requires a label`);
    if (trackIds.length === 0 || trackIds.length > 32) reasons.push(`audio range ${rangeId || "(unnamed)"} requires 1–32 tracks`);
    if (!Number.isSafeInteger(range.startTick) || range.startTick < 0 || !Number.isSafeInteger(range.durationTick) || range.durationTick <= 0) {
      reasons.push(`audio range ${rangeId || "(unnamed)"} has an invalid Tick range`);
    }
    if (range.role !== undefined && !["BGM", "SE", "VOICE", "AMBIENCE", "UI", "LOOP"].includes(range.role)) {
      reasons.push(`audio range ${rangeId || "(unnamed)"} has an unsupported role`);
    }
    if (range.markerId !== undefined && range.markerId.trim().length === 0) reasons.push(`audio range ${rangeId || "(unnamed)"} has an empty marker ID`);
  }
  const candidates = input.ranges.map((range) => audioProposal(input, range));
  if (reasons.length > 0) return { status: "REVIEW_REQUIRED", candidates: [], inputHash: audioInputHash(input), reasons };
  const unclassified = candidates.filter((candidate) => candidate.role === "UNCLASSIFIED_AUDIO");
  if (unclassified.length > 0) {
    return {
      status: "REVIEW_REQUIRED",
      candidates,
      inputHash: audioInputHash(input),
      reasons: unclassified.map((candidate) => `${candidate.rangeId} requires an explicit delivery role`),
    };
  }
  return { status: "DETERMINISTIC", proposals: candidates, inputHash: audioInputHash(input) };
}
