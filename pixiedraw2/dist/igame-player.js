// src/wp160-contracts.ts
var AUTHORIZATION_PROOF_SCHEMA_VERSION = 1;
var AUTHORIZATION_PROOF_TYPE = "AUTHORIZATION_PROOF";
var AUTHORIZATION_PROOF_SOURCE = "server";
var AUTHORIZATION_PROOF_ALLOWED_CLOCK_SKEW_MS = 5 * 60 * 1e3;
var AUTHORIZATION_PROOF_MAX_LIFETIME_MS = 24 * 60 * 60 * 1e3;
var AUTHORIZATION_PROOF_KEYS = /* @__PURE__ */ new Set([
  "schemaVersion",
  "proofType",
  "source",
  "decision",
  "authorityId",
  "proofId",
  "principalId",
  "resourceType",
  "resourceId",
  "action",
  "capability",
  "tenantId",
  "correlationId",
  "policyVersion",
  "grantId",
  "issuedAt",
  "expiresAt"
]);
function authorizationText(value) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 256;
}
function authorizationNullableText(value) {
  return value === null || authorizationText(value);
}
function isAuthorizationProofV1(value, expected = {}) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proof = value;
  if (Object.keys(proof).some((key) => !AUTHORIZATION_PROOF_KEYS.has(key))) return false;
  if (proof.schemaVersion !== AUTHORIZATION_PROOF_SCHEMA_VERSION || proof.proofType !== AUTHORIZATION_PROOF_TYPE || proof.source !== AUTHORIZATION_PROOF_SOURCE) return false;
  if (![
    "allow",
    "deny",
    "unknown"
  ].includes(proof.decision)) return false;
  if (![
    "authorityId",
    "proofId",
    "resourceType",
    "resourceId",
    "action",
    "capability",
    "policyVersion",
    "issuedAt",
    "expiresAt"
  ].every((key) => authorizationText(proof[key]))) return false;
  if (!authorizationNullableText(proof.principalId) || !authorizationNullableText(proof.tenantId) || !authorizationNullableText(proof.correlationId) || !authorizationNullableText(proof.grantId)) return false;
  const issuedAt = Date.parse(proof.issuedAt);
  const expiresAt = Date.parse(proof.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= issuedAt) return false;
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (expectedValue !== void 0 && proof[key] !== expectedValue) return false;
  }
  return true;
}
function requireAuthorizationProofV1(value, expected = {}) {
  if (!isAuthorizationProofV1(value, expected)) throw new Error("AuthorizationProofV1 is invalid or not bound to the requested scope.");
  const proof = value;
  if (proof.decision !== "allow") throw new Error("AuthorizationProofV1 did not grant the requested capability.");
  const now = Date.now();
  const issuedAt = Date.parse(proof.issuedAt);
  const expiresAt = Date.parse(proof.expiresAt);
  if (issuedAt > now + AUTHORIZATION_PROOF_ALLOWED_CLOCK_SKEW_MS) throw new Error("AuthorizationProofV1 was issued in the future.");
  if (expiresAt <= now) throw new Error("AuthorizationProofV1 has expired.");
  if (expiresAt - issuedAt > AUTHORIZATION_PROOF_MAX_LIFETIME_MS) throw new Error("AuthorizationProofV1 lifetime exceeds policy.");
  return proof;
}
var DEFAULT_WP160_FEATURE_FLAGS = Object.freeze({
  "game-core-read": false,
  "game-core-write": false,
  "runtime-preview": false,
  "runtime-execution": false,
  "game-build": false,
  "game-build-cache": false,
  "game-publish": false
});

// src/game/game-350/igame-player-contract.ts
var IGAME_PLAYER_SCHEMA_VERSION = 1;
var STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
function stableId(value) {
  return typeof value === "string" && STABLE_ID.test(value);
}
function nonEmptyText(value, maxLength = 256) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}
function manifestShape(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const manifest = value;
  return manifest.schemaVersion === IGAME_PLAYER_SCHEMA_VERSION && stableId(manifest.productId) && stableId(manifest.projectId) && stableId(manifest.revisionId) && stableId(manifest.ownerId) && stableId(manifest.tenantId) && nonEmptyText(manifest.title) && stableId(manifest.runtimeProfileId) && stableId(manifest.runtimeVersion) && (manifest.sourceAuthority === "REGISTRY" || manifest.sourceAuthority === "LOCAL_PREVIEW") && manifest.editAuthority === "NONE" && manifest.assetAuthority === "READ_ONLY";
}
function accessResult(decision, code, message, manifest, proof) {
  return proof === void 0 ? {
    decision,
    code,
    message,
    manifest
  } : {
    decision,
    code,
    message,
    manifest,
    proof
  };
}
function resolveIGamePlayerAccess(input) {
  if (!manifestShape(input.manifest)) {
    return accessResult("UNAVAILABLE", "INVALID_MANIFEST", "iGAME Player\u306E\u60C5\u5831\u304C\u4E0D\u6B63\u306A\u305F\u3081\u3001\u5B89\u5168\u306B\u505C\u6B62\u3057\u307E\u3057\u305F\u3002", input.manifest);
  }
  if (input.source === "LOCAL_PREVIEW") {
    if (input.manifest.sourceAuthority !== "LOCAL_PREVIEW") {
      return accessResult("DENIED", "LOCAL_PREVIEW_ONLY", "Registry\u5546\u54C1\u306F\u3001Registry\u8A8D\u8A3C\u3092\u78BA\u8A8D\u3057\u3066\u304B\u3089\u518D\u751F\u3057\u307E\u3059\u3002", input.manifest);
    }
    return accessResult("AUTHORIZED", "PLAYER_AUTHORIZED", "\u30ED\u30FC\u30AB\u30EBiGAME Player\u306E\u518D\u751F\u3092\u8A31\u53EF\u3057\u307E\u3057\u305F\u3002\u7DE8\u96C6\u6A29\u9650\u306F\u3042\u308A\u307E\u305B\u3093\u3002", input.manifest);
  }
  if (input.manifest.sourceAuthority !== "REGISTRY") {
    return accessResult("DENIED", "SERVER_AUTH_REQUIRED", "\u3053\u306E\u5546\u54C1\u306F\u30ED\u30FC\u30AB\u30EB\u30D7\u30EC\u30D3\u30E5\u30FC\u306E\u305F\u3081\u3001Registry\u5546\u54C1\u3068\u3057\u3066\u958B\u3051\u307E\u305B\u3093\u3002", input.manifest);
  }
  if (!stableId(input.principalId) || input.proof === void 0) {
    return accessResult("DENIED", "SERVER_AUTH_REQUIRED", "Registry\u8A8D\u8A3C\u3068\u30D7\u30EC\u30A4\u6A29\u9650\u304C\u5FC5\u8981\u3067\u3059\u3002", input.manifest);
  }
  try {
    const proof = requireAuthorizationProofV1(input.proof, {
      principalId: input.principalId,
      resourceType: "igame-product",
      resourceId: input.manifest.productId,
      action: "play",
      capability: "game.play",
      tenantId: input.manifest.tenantId
    });
    return accessResult("AUTHORIZED", "PLAYER_AUTHORIZED", "Registry\u8A8D\u8A3C\u3092\u78BA\u8A8D\u3057\u307E\u3057\u305F\u3002\u7DE8\u96C6\u6A29\u9650\u306F\u3042\u308A\u307E\u305B\u3093\u3002", input.manifest, proof);
  } catch {
    return accessResult("DENIED", "AUTHORIZATION_INVALID", "Registry\u8A8D\u8A3C\u304C\u4E0D\u6B63\u3001\u671F\u9650\u5207\u308C\u3001\u307E\u305F\u306F\u5BFE\u8C61\u5916\u3067\u3059\u3002", input.manifest);
  }
}
function createIGamePlayerSession(access) {
  if (access.decision !== "AUTHORIZED") {
    throw new Error("An authorized iGAME Player access result is required.");
  }
  return {
    mode: "PLAYER",
    productId: access.manifest.productId,
    projectId: access.manifest.projectId,
    revisionId: access.manifest.revisionId,
    ownerId: access.manifest.ownerId,
    tenantId: access.manifest.tenantId,
    editAuthority: "NONE",
    assetAuthority: "READ_ONLY",
    canWriteProject: false,
    canEditGame: false,
    canEditDraw: false,
    canEditAudio: false
  };
}
var IGAME_EXTERNAL_BUILD_TARGETS = Object.freeze([
  "ANDROID_APK",
  "ANDROID_AAB",
  "IOS_IPA",
  "DESKTOP_PACKAGE",
  "WEB_PACKAGE"
]);

// src/game/game-350/runtime-launch.ts
var IGAME_RUNTIME_LAUNCH_SCHEMA_VERSION = 1;
var PIXIEED_BRAND_SPLASH_DURATION_MS = 1200;
function nonEmptyText2(value, maxLength = 256) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}
function stableId2(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(value);
}
function createIGameRuntimeLaunchConfig(input) {
  if (!nonEmptyText2(input.title) || !stableId2(input.startSceneId)) {
    throw new Error("iGAME Runtime launch config contains an unstable identity.");
  }
  const subtitle = input.subtitle ?? "\u3053\u306EGame\u306E\u30B9\u30BF\u30FC\u30C8\u753B\u9762";
  const startLabel = input.startLabel ?? "START";
  if (!nonEmptyText2(subtitle) || !nonEmptyText2(startLabel)) {
    throw new Error("iGAME Runtime launch config contains empty display text.");
  }
  return Object.freeze({
    schemaVersion: IGAME_RUNTIME_LAUNCH_SCHEMA_VERSION,
    title: input.title.trim(),
    subtitle: subtitle.trim(),
    startSceneId: input.startSceneId,
    startLabel: startLabel.trim()
  });
}
function createIGameRuntimeLaunchState(config) {
  return Object.freeze({
    schemaVersion: IGAME_RUNTIME_LAUNCH_SCHEMA_VERSION,
    phase: "BRAND_SPLASH",
    config,
    transitionCount: 0
  });
}
function transition(state, phase) {
  return Object.freeze({
    ...state,
    phase,
    transitionCount: state.transitionCount + 1
  });
}
function completeIGameBrandSplash(state) {
  if (state.phase !== "BRAND_SPLASH") {
    throw new Error("iGAME brand splash can only complete once at launch.");
  }
  return transition(state, "START_SCREEN");
}
function startIGameRuntime(state) {
  if (state.phase !== "START_SCREEN") {
    throw new Error("iGAME Runtime can start only from the start screen.");
  }
  return transition(state, "GAMEPLAY");
}
function stopIGameRuntime(state) {
  if (state.phase === "STOPPED") return state;
  return transition(state, "STOPPED");
}
function isIGamePlayerRuntimeSource(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const source = value;
  return source.manifest !== null && typeof source.manifest === "object" && source.launch !== null && typeof source.launch === "object" && typeof source.mount === "function";
}

// src/game/game-350/igame-player-entry.ts
function requiredElement(root, selector) {
  const element = root.querySelector(selector);
  if (element === null) throw new Error(`iGAME Player element is missing: ${selector}`);
  return element;
}
function elementsFor(root) {
  return {
    root: requiredElement(root, "#igamePlayerApp"),
    splash: requiredElement(root, "#igameBrandSplash"),
    startScreen: requiredElement(root, "#igameStartScreen"),
    startLogo: requiredElement(root, ".igame-player__start-logo"),
    startTitle: requiredElement(root, "#igameStartTitle"),
    startSubtitle: requiredElement(root, "#igameStartSubtitle"),
    accessStatus: requiredElement(root, "#igameAccessStatus"),
    startButton: requiredElement(root, "#igameStartButton"),
    runtimeScreen: requiredElement(root, "#igameRuntimeScreen"),
    runtimeMount: requiredElement(root, "#igameRuntimeMount"),
    runtimeStatus: requiredElement(root, "#igameRuntimeStatus"),
    error: requiredElement(root, "#igamePlayerError")
  };
}
function runtimeSourceFromWindow() {
  const candidate = window.__PIXIEED_IGAME_RUNTIME__;
  if (!isIGamePlayerRuntimeSource(candidate)) return void 0;
  try {
    return {
      ...candidate,
      manifest: candidate.manifest,
      launch: createIGameRuntimeLaunchConfig(candidate.launch)
    };
  } catch {
    return void 0;
  }
}
function defaultLaunchState() {
  return createIGameRuntimeLaunchState(createIGameRuntimeLaunchConfig({
    title: "Game\u3092\u6E96\u5099\u4E2D",
    subtitle: "\u30E6\u30FC\u30B6\u30FC\u304C\u4F5C\u6210\u3057\u305FGame Runtime\u3092\u5F85\u3063\u3066\u3044\u307E\u3059\u3002",
    startSceneId: "runtime-pending",
    startLabel: "START"
  }));
}
function renderPhase(elements, state) {
  elements.root.dataset.igamePhase = state.phase;
  elements.splash.hidden = state.phase !== "BRAND_SPLASH";
  elements.startScreen.hidden = state.phase !== "START_SCREEN";
  elements.runtimeScreen.hidden = state.phase !== "GAMEPLAY";
}
function showError(elements, message) {
  elements.error.textContent = message;
  elements.error.hidden = false;
  elements.root.dataset.igameAccessState = "ERROR";
}
function setStartContent(elements, source) {
  if (source === void 0) {
    elements.startTitle.textContent = "Game\u3092\u6E96\u5099\u4E2D";
    elements.startSubtitle.textContent = "\u30E6\u30FC\u30B6\u30FC\u304C\u4F5C\u6210\u3057\u305FGame Runtime\u3092\u5F85\u3063\u3066\u3044\u307E\u3059\u3002";
    elements.accessStatus.textContent = "Game Runtime package\u672A\u63A5\u7D9A\u306E\u305F\u3081\u3001\u5B89\u5168\u306B\u505C\u6B62\u3057\u3066\u3044\u307E\u3059\u3002";
    elements.startButton.textContent = "START";
    elements.startButton.disabled = true;
    return;
  }
  elements.startTitle.textContent = source.launch.title;
  elements.startSubtitle.textContent = source.launch.subtitle;
  elements.startButton.textContent = source.launch.startLabel;
}
async function mountIGamePlayer(root = document) {
  const elements = elementsFor(root);
  const source = runtimeSourceFromWindow();
  let launchState = source === void 0 ? defaultLaunchState() : createIGameRuntimeLaunchState(source.launch);
  let runtimeHandle;
  let session;
  let access;
  elements.root.dataset.igameSurface = "runtime-shell-only";
  elements.root.dataset.igameEditAuthority = "none";
  elements.root.dataset.igameAssetAuthority = "read-only";
  elements.root.dataset.igameRuntimeOwned = "user-game";
  elements.startLogo.alt = "PiXiEED";
  renderPhase(elements, launchState);
  setStartContent(elements, source);
  const requestStop = async () => {
    await runtimeHandle?.dispose?.();
    runtimeHandle = void 0;
    launchState = stopIGameRuntime(launchState);
    renderPhase(elements, launchState);
    elements.runtimeStatus.textContent = "Game Runtime\u3092\u505C\u6B62\u3057\u307E\u3057\u305F\u3002";
  };
  const finishBrandSplash = () => {
    if (launchState.phase !== "BRAND_SPLASH") return;
    launchState = completeIGameBrandSplash(launchState);
    renderPhase(elements, launchState);
    if (source === void 0) return;
    access = resolveIGamePlayerAccess({
      manifest: source.manifest,
      source: new URLSearchParams(window.location.search).get("source") === "registry" ? "SERVER_AUTHORITY" : "LOCAL_PREVIEW",
      proof: source.proof
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
  };
  window.setTimeout(finishBrandSplash, PIXIEED_BRAND_SPLASH_DURATION_MS);
  elements.startButton.addEventListener("click", async () => {
    if (source === void 0 || session === void 0 || access === void 0) return;
    if (launchState.phase !== "START_SCREEN") return;
    elements.startButton.disabled = true;
    launchState = startIGameRuntime(launchState);
    renderPhase(elements, launchState);
    try {
      const context = {
        root: elements.runtimeMount,
        manifest: access.manifest,
        session,
        launch: launchState.config,
        requestStop
      };
      runtimeHandle = await source.mount(context) ?? void 0;
      elements.runtimeStatus.textContent = "\u30E6\u30FC\u30B6\u30FCGame Runtime\u3092\u958B\u59CB\u3057\u307E\u3057\u305F\u3002";
    } catch (error) {
      await requestStop();
      showError(elements, error instanceof Error ? error.message : "\u30E6\u30FC\u30B6\u30FCGame Runtime\u3092\u958B\u59CB\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
    }
  });
}
if (typeof document !== "undefined") {
  void mountIGamePlayer();
}
export {
  mountIGamePlayer
};
