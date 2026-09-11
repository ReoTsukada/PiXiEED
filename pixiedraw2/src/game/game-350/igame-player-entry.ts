/// <reference lib="dom" />

/**
 * iGAME Player: a brand/start/runtime host with a verified public PXD adapter.
 *
 * Local injected runtimes remain supported for editor preview. A public
 * Market product is fetched through the server bootstrap, hash-checked, and
 * mounted by the bounded browser runtime after the fixed PiXiEED splash.
 */

import {
  createIGamePlayerSession,
  resolveIGamePlayerAccess,
  type IGamePlayerManifest,
} from "./igame-player-contract.ts";
import {
  completeIGameBrandSplash,
  createIGameRuntimeLaunchConfig,
  createIGameRuntimeLaunchState,
  isIGamePlayerRuntimeSource,
  PIXIEED_BRAND_SPLASH_DURATION_MS,
  startIGameRuntime,
  stopIGameRuntime,
  type IGamePlayerRuntimeHandle,
  type IGamePlayerRuntimeMountContext,
  type IGamePlayerRuntimeSource,
  type IGameRuntimeLaunchState,
} from "./runtime-launch.ts";
import {
  fetchIGamePublicPackage,
  parseIGamePublicBootstrap,
} from "./igame-public-bootstrap.ts";
import { createIGameBrowserRuntimeSource } from "./igame-browser-runtime.ts";

interface PlayerElements {
  readonly root: HTMLElement;
  readonly splash: HTMLElement;
  readonly startScreen: HTMLElement;
  readonly startLogo: HTMLImageElement;
  readonly startTitle: HTMLElement;
  readonly startSubtitle: HTMLElement;
  readonly accessStatus: HTMLElement;
  readonly startButton: HTMLButtonElement;
  readonly runtimeScreen: HTMLElement;
  readonly runtimeMount: HTMLElement;
  readonly runtimeStatus: HTMLElement;
  readonly error: HTMLElement;
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (element === null) throw new Error(`iGAME Player element is missing: ${selector}`);
  return element;
}

function elementsFor(root: ParentNode): PlayerElements {
  return {
    root: requiredElement<HTMLElement>(root, "#igamePlayerApp"),
    splash: requiredElement<HTMLElement>(root, "#igameBrandSplash"),
    startScreen: requiredElement<HTMLElement>(root, "#igameStartScreen"),
    startLogo: requiredElement<HTMLImageElement>(root, ".igame-player__start-logo"),
    startTitle: requiredElement<HTMLElement>(root, "#igameStartTitle"),
    startSubtitle: requiredElement<HTMLElement>(root, "#igameStartSubtitle"),
    accessStatus: requiredElement<HTMLElement>(root, "#igameAccessStatus"),
    startButton: requiredElement<HTMLButtonElement>(root, "#igameStartButton"),
    runtimeScreen: requiredElement<HTMLElement>(root, "#igameRuntimeScreen"),
    runtimeMount: requiredElement<HTMLElement>(root, "#igameRuntimeMount"),
    runtimeStatus: requiredElement<HTMLElement>(root, "#igameRuntimeStatus"),
    error: requiredElement<HTMLElement>(root, "#igamePlayerError"),
  };
}

function runtimeSourceFromWindow(): IGamePlayerRuntimeSource | undefined {
  const candidate = (window as Window & {
    readonly __PIXIEED_IGAME_RUNTIME__?: unknown;
  }).__PIXIEED_IGAME_RUNTIME__;
  if (!isIGamePlayerRuntimeSource(candidate)) return undefined;
  try {
    return {
      ...candidate,
      manifest: candidate.manifest as IGamePlayerManifest,
      launch: createIGameRuntimeLaunchConfig(candidate.launch),
    };
  } catch {
    return undefined;
  }
}

function defaultLaunchState(): IGameRuntimeLaunchState {
  return createIGameRuntimeLaunchState(
    createIGameRuntimeLaunchConfig({
      title: "Gameを準備中",
      subtitle: "ユーザーが作成したGame Runtimeを待っています。",
      startSceneId: "runtime-pending",
      startLabel: "START",
    }),
  );
}

function renderPhase(
  elements: PlayerElements,
  state: IGameRuntimeLaunchState,
): void {
  elements.root.dataset.igamePhase = state.phase;
  elements.splash.hidden = state.phase !== "BRAND_SPLASH";
  elements.startScreen.hidden = state.phase !== "START_SCREEN";
  elements.runtimeScreen.hidden = state.phase !== "GAMEPLAY";
}

function showError(elements: PlayerElements, message: string): void {
  elements.error.textContent = message;
  elements.error.hidden = false;
  elements.root.dataset.igameAccessState = "ERROR";
}

function setStartContent(
  elements: PlayerElements,
  source: IGamePlayerRuntimeSource | undefined,
): void {
  if (source === undefined) {
    elements.startTitle.textContent = "Gameを準備中";
    elements.startSubtitle.textContent =
      "ユーザーが作成したGame Runtimeを待っています。";
    elements.accessStatus.textContent =
      "Game Runtime package未接続のため、安全に停止しています。";
    elements.startButton.textContent = "START";
    elements.startButton.disabled = true;
    return;
  }
  elements.startTitle.textContent = source.launch.title;
  elements.startSubtitle.textContent = source.launch.subtitle;
  elements.startButton.textContent = source.launch.startLabel;
}

interface SupabaseSessionClient {
  readonly auth: {
    getSession: () => Promise<{ data?: { session?: { access_token?: string; user?: { id?: string } } | null } }>;
  };
}

function publicSupabaseConfig(): { readonly url: string; readonly publishableKey: string } {
  const supplied = (window as Window & {
    readonly __PIXIEED_SUPABASE_CONFIG__?: { readonly url?: unknown; readonly publishableKey?: unknown };
  }).__PIXIEED_SUPABASE_CONFIG__;
  return {
    url: typeof supplied?.url === "string" && supplied.url.trim()
      ? supplied.url.trim()
      : "https://kyyiuakrqomzlikfaire.supabase.co",
    publishableKey: typeof supplied?.publishableKey === "string" && supplied.publishableKey.trim()
      ? supplied.publishableKey.trim()
      : "sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4",
  };
}

async function publicRegistryRuntimeSource(productId: string): Promise<{
  readonly source: IGamePlayerRuntimeSource;
  readonly principalId: string;
}> {
  const host = window as Window & {
    readonly __PIXIEED_ACCOUNT_SUPABASE_CLIENT__?: SupabaseSessionClient;
    readonly __PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__?: Promise<SupabaseSessionClient>;
  };
  const client = host.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__ ??
    await host.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__;
  if (!client) throw new Error("公開Gameを再生するにはPiXiEEDへのログインが必要です。");
  const sessionResult = await client.auth.getSession();
  const session = sessionResult.data?.session;
  const accessToken = session?.access_token;
  const principalId = session?.user?.id;
  if (!accessToken || !principalId) throw new Error("公開Gameを再生するにはPiXiEEDへのログインが必要です。");
  const config = publicSupabaseConfig();
  const response = await fetch(`${config.url.replace(/\/+$/u, "")}/functions/v1/igame-player-bootstrap`, {
    method: "POST",
    headers: {
      apikey: config.publishableKey,
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ product_id: productId }),
    credentials: "omit",
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as unknown;
  if (!response.ok) {
    const message = payload && typeof payload === "object" && !Array.isArray(payload) &&
        typeof (payload as Record<string, unknown>).error === "string"
      ? String((payload as Record<string, unknown>).error)
      : "公開Gameを準備できませんでした。";
    throw new Error(message);
  }
  const bootstrap = parseIGamePublicBootstrap(payload, principalId);
  const packageBytes = await fetchIGamePublicPackage(bootstrap);
  return {
    source: await createIGameBrowserRuntimeSource(bootstrap, packageBytes),
    principalId,
  };
}

export async function mountIGamePlayer(root: ParentNode = document): Promise<void> {
  const elements = elementsFor(root);
  const productId = new URLSearchParams(window.location.search).get("product")?.trim() || "";
  let source = runtimeSourceFromWindow();
  let launchState = source === undefined
    ? defaultLaunchState()
    : createIGameRuntimeLaunchState(source.launch);
  let runtimeHandle: IGamePlayerRuntimeHandle | undefined;
  let session: ReturnType<typeof createIGamePlayerSession> | undefined;
  let access: ReturnType<typeof resolveIGamePlayerAccess> | undefined;

  elements.root.dataset.igameSurface = "runtime-shell-only";
  elements.root.dataset.igameEditAuthority = "none";
  elements.root.dataset.igameAssetAuthority = "read-only";
  elements.root.dataset.igameRuntimeOwned = "user-game";
  elements.startLogo.alt = "PiXiEED";
  renderPhase(elements, launchState);
  if (productId) {
    elements.startTitle.textContent = "公開Gameを準備中";
    elements.startSubtitle.textContent = "Marketの権利と公開Revisionを確認しています。";
    elements.accessStatus.textContent = "公開Gameを確認しています。";
    elements.startButton.disabled = true;
  } else {
    setStartContent(elements, source);
  }

  const requestStop = async (): Promise<void> => {
    await runtimeHandle?.dispose?.();
    runtimeHandle = undefined;
    launchState = stopIGameRuntime(launchState);
    renderPhase(elements, launchState);
    elements.runtimeStatus.textContent = "Game Runtimeを停止しました。";
  };

  const finishBrandSplash = async (): Promise<void> => {
    if (launchState.phase !== "BRAND_SPLASH") return;
    launchState = completeIGameBrandSplash(launchState);
    renderPhase(elements, launchState);
    let principalId: string | undefined;
    try {
      if (productId) {
        const loaded = await publicRegistryRuntimeSource(productId);
        source = loaded.source;
        principalId = loaded.principalId;
        setStartContent(elements, source);
      }
      if (source === undefined) return;
      access = resolveIGamePlayerAccess({
        manifest: source.manifest,
        source: productId || new URLSearchParams(window.location.search).get("source") === "registry"
          ? "SERVER_AUTHORITY"
          : "LOCAL_PREVIEW",
        ...(principalId === undefined ? {} : { principalId }),
        proof: source.proof,
      });
      elements.accessStatus.textContent = access.message;
      elements.accessStatus.dataset.accessDecision = access.decision;
      if (access.decision !== "AUTHORIZED") {
        elements.startButton.disabled = true;
        showError(elements, access.message);
        return;
      }
      session = createIGamePlayerSession(access);
      elements.root.dataset.igameSessionMode = session.mode;
      elements.root.dataset.igameProjectId = session.projectId;
      elements.root.dataset.igameRevisionId = session.revisionId;
      elements.root.dataset.igameAccessState = "AUTHORIZED";
      elements.startButton.disabled = false;
    } catch (error) {
      elements.startButton.disabled = true;
      showError(elements, error instanceof Error ? error.message : "公開Gameを準備できませんでした。");
    }
  };

  window.setTimeout(() => void finishBrandSplash(), PIXIEED_BRAND_SPLASH_DURATION_MS);

  elements.startButton.addEventListener("click", async () => {
    if (source === undefined || session === undefined || access === undefined) return;
    if (launchState.phase !== "START_SCREEN") return;
    elements.startButton.disabled = true;
    launchState = startIGameRuntime(launchState);
    renderPhase(elements, launchState);
    try {
      const context: IGamePlayerRuntimeMountContext = {
        root: elements.runtimeMount,
        manifest: access.manifest,
        session,
        launch: launchState.config,
        requestStop,
      };
      runtimeHandle = await source.mount(context) ?? undefined;
      elements.runtimeStatus.textContent = "ユーザーGame Runtimeを開始しました。";
    } catch (error) {
      await requestStop();
      showError(
        elements,
        error instanceof Error
          ? error.message
          : "ユーザーGame Runtimeを開始できませんでした。",
      );
    }
  });
}

if (typeof document !== "undefined") {
  void mountIGamePlayer();
}
