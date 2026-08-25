/**
 * GAME-350's smallest real product path.
 *
 * The host supplies the canonical project, GAME-340 authority, licenses, and
 * payload resolver. This module owns neither a Registry client nor a UI.
 */
import {
  createGameRuntimePreview,
  loadGameRuntimeAssets,
  stepGameRuntime,
  stopGameRuntime,
  type GameProjectRevision,
  type GameRuntimeSession,
} from "../../wp200-game-runtime-core.ts";
import type { InputEvent, RuntimeAssetResolver } from "../../wp160-game-runtime-core.ts";
import type { RuntimeCapabilityProfile, RuntimeVersionContract } from "../../wp160-contracts.ts";
import type { CanonicalAssetRevision } from "../game-340/core.ts";
import {
  createGame350AssetRegistryAdapter,
  createGame350RuntimeSnapshot,
  createRuntimeLifecycleController,
  prepareGame350Composition,
  type Game350RuntimeSnapshot,
  type RuntimeBoundaryDiagnostic,
  type RuntimeLifecycleController,
  type RuntimeLifecycleSnapshot,
  type PreparedGame350Composition,
} from "./runtime-qualification.ts";

export interface Game350ProductPathOptions {
  readonly project: GameProjectRevision;
  readonly authority: readonly CanonicalAssetRevision[];
  readonly ownerId: string;
  readonly licenseByAsset: Readonly<Record<string, string>>;
  readonly sceneId: string;
  readonly entityId?: string;
  readonly payloadResolver: RuntimeAssetResolver;
  readonly previewId: string;
  readonly runtime: RuntimeVersionContract;
  readonly supportedRuntimeVersion: string;
  readonly capabilities: RuntimeCapabilityProfile;
  readonly renderer?: "CANVAS2D" | "WEBGPU" | "NONE";
}

export interface Game350ResolutionInstrumentation {
  readonly resolveCountBeforeStart: number;
  readonly resolveCountAfterStart: number;
  readonly resolveCountAfterSteps: number;
  readonly steps: number;
}

export interface Game350ProductSession {
  readonly session: GameRuntimeSession;
  readonly composition: PreparedGame350Composition;
  readonly snapshot: Game350RuntimeSnapshot;
  readonly lifecycle: RuntimeLifecycleController;
  readonly lifecycleSnapshot: RuntimeLifecycleSnapshot;
  readonly resolution: Game350ResolutionInstrumentation;
  step(deltaMs: number, input?: readonly InputEvent[]): GameRuntimeSession;
  stop(): RuntimeLifecycleSnapshot;
  reload(): RuntimeLifecycleSnapshot;
}

export interface Game350ProductPathResult {
  readonly ok: boolean;
  readonly value?: Game350ProductSession;
  readonly diagnostics: readonly RuntimeBoundaryDiagnostic[];
}

function failure(...diagnostics: RuntimeBoundaryDiagnostic[]): Game350ProductPathResult {
  return { ok: false, diagnostics };
}

function errorDiagnostic(message: string, path = "runtime"): RuntimeBoundaryDiagnostic {
  return { code: "INVALID_MANIFEST", path, message };
}

/** Start once: identity/composition resolution happens only at this boundary. */
export async function startGame350ProductPreview(options: Game350ProductPathOptions): Promise<Game350ProductPathResult> {
  let resolveCount = 0;
  const adapterBase = createGame350AssetRegistryAdapter(options.authority);
  const adapter = {
    ...adapterBase,
    resolve(reference: Parameters<typeof adapterBase.resolve>[0], context: Parameters<typeof adapterBase.resolve>[1]) {
      resolveCount += 1;
      return adapterBase.resolve(reference, context);
    },
  };
  const beforeStart = resolveCount;
  const prepared = prepareGame350Composition({
    project: options.project,
    ownerId: options.ownerId,
    sceneId: options.sceneId,
    ...(options.entityId === undefined ? {} : { entityId: options.entityId }),
    adapter,
    licenseByAsset: options.licenseByAsset,
  });
  if (!prepared.ok || prepared.value === undefined) return failure(...prepared.diagnostics);

  try {
    let session = await createGameRuntimePreview({
      project: options.project,
      previewId: options.previewId,
      runtime: options.runtime,
      supportedRuntimeVersion: options.supportedRuntimeVersion,
      capabilities: options.capabilities,
      flags: { "game-core-read": true, "runtime-preview": true, "runtime-execution": true },
      killSwitch: false,
      ...(options.renderer === undefined ? {} : { renderer: options.renderer }),
    });
    const preparedByAsset = new Map(prepared.value.assets.map((item) => [item.resolved.assetId, item]));
    const resolver: RuntimeAssetResolver = {
      resolve: async (request) => {
        const preparedAsset = preparedByAsset.get(String(request.assetId));
        if (preparedAsset === undefined) return undefined;
        return options.payloadResolver.resolve(request);
      },
    };
    session = await loadGameRuntimeAssets(session, resolver);
    const lifecycle = createRuntimeLifecycleController();
    const started = lifecycle.start(session);
    if (!started.ok || started.value === undefined) return failure(...started.diagnostics);
    const loadedSession = session;
    let current = session;
    let steps = 0;
    const product: Game350ProductSession = {
      get session() { return current; },
      composition: prepared.value,
      get snapshot() { return createGame350RuntimeSnapshot(prepared.value!, current.runtime.world.tick); },
      lifecycle,
      get lifecycleSnapshot() { return lifecycle.snapshot(); },
      get resolution() { return { resolveCountBeforeStart: beforeStart, resolveCountAfterStart: resolveCount, resolveCountAfterSteps: resolveCount, steps }; },
      step(deltaMs, input = []) {
        const result = stepGameRuntime(current, deltaMs, input);
        current = result.session;
        steps += 1;
        return current;
      },
      stop() {
        current = stopGameRuntime(current);
        return lifecycle.stop();
      },
      reload() {
        current = loadedSession;
        const result = lifecycle.reload(current);
        return result;
      },
    };
    return { ok: true, value: product, diagnostics: [] };
  } catch (error) {
    return failure(errorDiagnostic(error instanceof Error ? error.message : "GAME-350 Runtime preview could not start."));
  }
}
