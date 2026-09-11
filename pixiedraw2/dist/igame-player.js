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
function createIGamePlayerManifest(input) {
  if (!stableId(input.productId) || !stableId(input.projectId) || !stableId(input.revisionId) || !stableId(input.ownerId) || !stableId(input.tenantId) || !nonEmptyText(input.title) || !stableId(input.runtimeProfileId) || !stableId(input.runtimeVersion)) {
    throw new Error("iGAME Player manifest contains an unstable identity.");
  }
  const sourceAuthority = input.sourceAuthority ?? "REGISTRY";
  return Object.freeze({
    schemaVersion: IGAME_PLAYER_SCHEMA_VERSION,
    productId: input.productId,
    projectId: input.projectId,
    revisionId: input.revisionId,
    ownerId: input.ownerId,
    tenantId: input.tenantId,
    title: input.title.trim(),
    runtimeProfileId: input.runtimeProfileId,
    runtimeVersion: input.runtimeVersion,
    sourceAuthority,
    editAuthority: "NONE",
    assetAuthority: "READ_ONLY"
  });
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

// src/game/game-350/igame-public-bootstrap.ts
var IGAME_PUBLIC_BOOTSTRAP_SCHEMA = "pixieed-igame-player-bootstrap/v1";
var SHA256 = /^[a-f0-9]{64}$/u;
var STABLE_ID2 = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function safeId(value) {
  return typeof value === "string" && STABLE_ID2.test(value);
}
function safeUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    const localHttp = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    return url.protocol === "https:" || localHttp;
  } catch {
    return false;
  }
}
function parseIGamePublicBootstrap(value, principalId) {
  const candidate = record(value);
  if (candidate.schema !== IGAME_PUBLIC_BOOTSTRAP_SCHEMA) {
    throw new Error("iGAME\u516C\u958BBootstrap\u306E\u30B9\u30AD\u30FC\u30DE\u304C\u5BFE\u5FDC\u3057\u3066\u3044\u307E\u305B\u3093\u3002");
  }
  if (!safeId(principalId)) throw new Error("iGAME\u516C\u958BBootstrap\u306E\u5229\u7528\u8005ID\u304C\u4E0D\u6B63\u3067\u3059\u3002");
  const product = record(candidate.product);
  const revision = record(candidate.revision);
  const packageInfo = record(candidate.package);
  const productId = product.id;
  const revisionId = revision.id;
  const packageHash = revision.package_hash;
  const packageBytesHash = packageInfo.sha256;
  const revisionNumber = typeof revision.number === "number" ? revision.number : NaN;
  const expiresIn = typeof packageInfo.expires_in === "number" ? packageInfo.expires_in : NaN;
  if (!safeId(productId) || typeof product.title !== "string" || product.title.trim().length === 0 || !safeId(revisionId) || !Number.isSafeInteger(revisionNumber) || revisionNumber < 1 || !SHA256.test(String(packageHash)) || !SHA256.test(String(packageBytesHash)) || !safeUrl(packageInfo.url) || typeof packageInfo.mime_type !== "string" || packageInfo.mime_type.length > 256 || !Number.isSafeInteger(expiresIn) || expiresIn < 1 || expiresIn > 300) {
    throw new Error("iGAME\u516C\u958BBootstrap\u306ERevision\u307E\u305F\u306FPackage\u60C5\u5831\u304C\u4E0D\u6B63\u3067\u3059\u3002");
  }
  const manifest = createIGamePlayerManifest(record(candidate.manifest));
  if (manifest.productId !== productId || manifest.revisionId !== revisionId) {
    throw new Error("iGAME\u516C\u958BBootstrap\u306E\u5546\u54C1\u3068Revision\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093\u3002");
  }
  const proof = requireAuthorizationProofV1(candidate.proof, {
    principalId,
    resourceType: "igame-product",
    resourceId: manifest.productId,
    action: "play",
    capability: "game.play",
    tenantId: manifest.tenantId
  });
  if (proof.expiresAt !== void 0 && Date.parse(proof.expiresAt) <= Date.now()) {
    throw new Error("iGAME\u516C\u958BBootstrap\u306E\u30D7\u30EC\u30A4\u6A29\u9650\u304C\u671F\u9650\u5207\u308C\u3067\u3059\u3002");
  }
  return Object.freeze({
    schema: IGAME_PUBLIC_BOOTSTRAP_SCHEMA,
    product: {
      id: productId,
      title: product.title.trim()
    },
    revision: {
      id: revisionId,
      number: revisionNumber,
      content_hash: typeof revision.content_hash === "string" ? revision.content_hash : null,
      package_hash: String(packageHash)
    },
    manifest,
    package: {
      url: packageInfo.url,
      sha256: String(packageBytesHash),
      mime_type: packageInfo.mime_type,
      expires_in: expiresIn
    },
    proof
  });
}
async function sha256BytesHex(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer));
  return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
}
async function fetchIGamePublicPackage(bootstrap, fetcher = fetch) {
  const response = await fetcher(bootstrap.package.url, {
    method: "GET",
    credentials: "omit",
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`iGAME Package\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F (${response.status})\u3002`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (await sha256BytesHex(bytes) !== bootstrap.package.sha256) {
    throw new Error("iGAME Package\u306EHash\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093\u3002");
  }
  return bytes;
}

// src/draw2-core.ts
var NullInstrumentation = class {
  record(_point) {
  }
};
var NOOP_INSTRUMENTATION = new NullInstrumentation();
function stableValue(value) {
  if (value instanceof Uint8Array) {
    return {
      __type: "Uint8Array",
      values: Array.from(value)
    };
  }
  if (value instanceof Map) {
    return Array.from(value.entries()).sort(([left], [right]) => String(left).localeCompare(String(right))).map(([key, entry]) => [
      key,
      stableValue(entry)
    ]);
  }
  if (Array.isArray(value)) return value.map((entry) => stableValue(entry));
  if (value !== null && typeof value === "object") {
    const object = value;
    return Object.fromEntries(Object.keys(object).filter((key) => object[key] !== void 0).sort().map((key) => [
      key,
      stableValue(object[key])
    ]));
  }
  return value;
}
function canonicalJson(value) {
  return JSON.stringify(stableValue(value)) ?? "null";
}
var IndexedTileRaster = class _IndexedTileRaster {
  width;
  height;
  tileSize;
  #tiles;
  #nonTransparentPixelCount;
  #cowSplitCount = 0;
  #copiedBytes = 0;
  constructor(width, height, tileSize, tiles, nonTransparentPixelCount = 0) {
    this.width = width;
    this.height = height;
    this.tileSize = tileSize;
    this.#tiles = tiles;
    this.#nonTransparentPixelCount = nonTransparentPixelCount;
  }
  static empty(width, height, tileSize) {
    if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) {
      throw new Error("Raster dimensions must be positive safe integers.");
    }
    return new _IndexedTileRaster(width, height, tileSize, /* @__PURE__ */ new Map());
  }
  /** Rehydrates a sparse raster from its canonical tile snapshots. */
  static fromTileSnapshots(width, height, tileSize, snapshots) {
    const raster = _IndexedTileRaster.empty(width, height, tileSize);
    const tiles = /* @__PURE__ */ new Map();
    const expectedByteLength = tileSize * tileSize;
    const tileColumns = Math.ceil(width / tileSize);
    const tileRows = Math.ceil(height / tileSize);
    let nonTransparentPixelCount = 0;
    for (const snapshot of snapshots) {
      if (!/^\d+:\d+$/.test(snapshot.tileKey)) {
        throw new Error("Raster tile key is invalid.");
      }
      const [tileXText, tileYText] = snapshot.tileKey.split(":");
      const tileX = Number(tileXText);
      const tileY = Number(tileYText);
      if (!Number.isSafeInteger(tileX) || !Number.isSafeInteger(tileY) || tileX < 0 || tileY < 0 || tileX >= tileColumns || tileY >= tileRows) {
        throw new Error("Raster tile key is outside the raster.");
      }
      if (!(snapshot.bytes instanceof Uint8Array) || snapshot.bytes.byteLength !== expectedByteLength) {
        throw new Error("Raster tile byte length is invalid.");
      }
      for (const value of snapshot.bytes) {
        if (value !== 0) nonTransparentPixelCount += 1;
      }
      if (tiles.has(snapshot.tileKey)) {
        throw new Error("Raster tile key is duplicated.");
      }
      tiles.set(snapshot.tileKey, {
        bytes: new Uint8Array(snapshot.bytes),
        references: 1
      });
    }
    return new _IndexedTileRaster(raster.width, raster.height, raster.tileSize, tiles, nonTransparentPixelCount);
  }
  /** Shares immutable Tile buffers; the next mutation splits only its affected Tile. */
  sharedClone() {
    const tiles = /* @__PURE__ */ new Map();
    for (const [key, cell] of this.#tiles) {
      cell.references += 1;
      tiles.set(key, cell);
    }
    return new _IndexedTileRaster(this.width, this.height, this.tileSize, tiles, this.#nonTransparentPixelCount);
  }
  #tileCoordinates(x, y) {
    const tileX = Math.floor(x / this.tileSize);
    const tileY = Math.floor(y / this.tileSize);
    const localX = x % this.tileSize;
    const localY = y % this.tileSize;
    return {
      tileX,
      tileY,
      localIndex: localY * this.tileSize + localX,
      tileKey: `${tileX}:${tileY}`
    };
  }
  getPixel(x, y) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= this.width || y >= this.height) {
      throw new Error("Pixel coordinate is outside the raster.");
    }
    const coordinates = this.#tileCoordinates(x, y);
    return this.#tiles.get(coordinates.tileKey)?.bytes[coordinates.localIndex] ?? 0;
  }
  /** Returns whether the raster contains any non-transparent indexed pixel. */
  hasNonTransparentPixel() {
    return this.#nonTransparentPixelCount > 0;
  }
  setPixel(assetId, x, y, colorIndex) {
    if (!Number.isInteger(colorIndex) || colorIndex < 0 || colorIndex > 255) {
      throw new Error("Canonical palette index must be an integer from 0 through 255.");
    }
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= this.width || y >= this.height) {
      throw new Error("Pixel coordinate is outside the raster.");
    }
    const coordinates = this.#tileCoordinates(x, y);
    let cell = this.#tiles.get(coordinates.tileKey);
    const previous = cell?.bytes[coordinates.localIndex] ?? 0;
    const tile = {
      assetId,
      tileX: coordinates.tileX,
      tileY: coordinates.tileY,
      tileKey: coordinates.tileKey
    };
    if (previous === colorIndex) {
      return {
        changed: false,
        tile,
        copiedBytes: 0,
        cowSplit: false
      };
    }
    let copiedBytes = 0;
    let cowSplit = false;
    if (cell === void 0) {
      cell = {
        bytes: new Uint8Array(this.tileSize * this.tileSize),
        references: 1
      };
      this.#tiles.set(coordinates.tileKey, cell);
    } else if (cell.references > 1) {
      cell.references -= 1;
      cell = {
        bytes: new Uint8Array(cell.bytes),
        references: 1
      };
      this.#tiles.set(coordinates.tileKey, cell);
      copiedBytes = cell.bytes.byteLength;
      cowSplit = true;
      this.#cowSplitCount += 1;
      this.#copiedBytes += copiedBytes;
    }
    cell.bytes[coordinates.localIndex] = colorIndex;
    if (previous === 0 && colorIndex !== 0) {
      this.#nonTransparentPixelCount += 1;
    } else if (previous !== 0 && colorIndex === 0) {
      this.#nonTransparentPixelCount -= 1;
    }
    return {
      changed: true,
      tile,
      copiedBytes,
      cowSplit
    };
  }
  snapshotTiles() {
    return Array.from(this.#tiles.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([tileKey, cell]) => ({
      tileKey,
      bytes: new Uint8Array(cell.bytes)
    }));
  }
  /** Full canonical read is reserved for Golden Fixture equivalence, not active dirty rendering. */
  toUint8Array() {
    const pixels = new Uint8Array(this.width * this.height);
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        pixels[y * this.width + x] = this.getPixel(x, y);
      }
    }
    return pixels;
  }
  /** Reads only the requested presentation region; active editing must not call toUint8Array(). */
  readRegion(x, y, width, height) {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || x < 0 || y < 0 || x + width > this.width || y + height > this.height) {
      throw new Error("Raster region is outside the raster.");
    }
    const pixels = new Uint8Array(width * height);
    let implicitTransparentPixelCount = 0;
    for (let regionY = 0; regionY < height; regionY += 1) {
      for (let regionX = 0; regionX < width; regionX += 1) {
        const sourceX = x + regionX;
        const sourceY = y + regionY;
        const coordinates = this.#tileCoordinates(sourceX, sourceY);
        const cell = this.#tiles.get(coordinates.tileKey);
        if (cell === void 0) implicitTransparentPixelCount += 1;
        pixels[regionY * width + regionX] = cell?.bytes[coordinates.localIndex] ?? 0;
      }
    }
    return {
      x,
      y,
      width,
      height,
      pixels,
      implicitTransparentPixelCount
    };
  }
  memoryMetrics() {
    let sharedTileBytes = 0;
    for (const cell of this.#tiles.values()) {
      if (cell.references > 1) sharedTileBytes += cell.bytes.byteLength;
    }
    const tileColumns = Math.ceil(this.width / this.tileSize);
    const tileRows = Math.ceil(this.height / this.tileSize);
    return {
      logicalRasterBytes: this.width * this.height,
      allocatedTileBytes: this.#tiles.size * this.tileSize * this.tileSize,
      sharedTileBytes,
      tileCount: this.#tiles.size,
      implicitTransparentTileCount: tileColumns * tileRows - this.#tiles.size,
      cowSplitCount: this.#cowSplitCount,
      copiedBytes: this.#copiedBytes
    };
  }
};
function validatePalette(palette) {
  if (palette.length < 1 || palette.length > 256) {
    throw new Error("Palette must contain 1 through 256 entries.");
  }
  if (palette[0] !== 0) throw new Error("Palette index 0 must be transparent.");
  for (const color of palette) {
    if (!Number.isSafeInteger(color) || color < 0 || color > 4294967295) {
      throw new Error("Palette colors must be uint32 values.");
    }
  }
  return [
    ...palette
  ];
}
function createProject(options) {
  if (!options.projectId) throw new Error("Project ID is required.");
  const width = options.width ?? 256;
  const height = options.height ?? 256;
  const palette = validatePalette(options.palette ?? [
    0,
    4294967295,
    4278190335,
    65535
  ]);
  const assetId = `${options.projectId}:draw:main`;
  const asset = {
    id: assetId,
    width,
    height,
    palette,
    raster: IndexedTileRaster.empty(width, height, options.tileSize ?? 32),
    revision: 0
  };
  const layerId = `${options.projectId}:layer:0`;
  const frameId = `${options.projectId}:frame:0`;
  const celId = `${options.projectId}:cel:0:0`;
  return {
    schemaVersion: 1,
    projectId: options.projectId,
    name: options.name ?? "Untitled Draw2 Project",
    structureEpoch: 1,
    activeAssetId: assetId,
    layers: [
      {
        id: layerId,
        layerTrackId: layerId,
        name: "Layer 1",
        order: 0,
        orderingKey: "00000000",
        visible: true,
        opacity: 1,
        blendMode: "NORMAL",
        locked: false,
        lifecycle: "ACTIVE",
        kind: "RASTER"
      }
    ],
    frames: [
      {
        id: frameId,
        frameId,
        index: 0,
        orderKey: "00000000",
        durationMs: 100,
        timingUnit: "MILLISECONDS",
        metadataVersion: 1
      }
    ],
    cels: [
      {
        id: celId,
        celId,
        layerId,
        layerTrackId: layerId,
        frameId,
        assetId,
        bindingMode: "RASTER",
        recordVersion: 1,
        lifecycle: "ACTIVE"
      }
    ],
    timeline: {
      id: `${options.projectId}:timeline:0`,
      timelineId: `${options.projectId}:timeline:0`,
      frameOrder: [
        frameId
      ],
      layerTrackOrder: [
        layerId
      ],
      metadataVersion: 1
    },
    activeLayerId: layerId,
    activeFrameId: frameId,
    activeCelId: celId,
    assets: {
      [assetId]: asset
    },
    tilemaps: {},
    appliedCommandIds: [],
    lastClientSequenceByClient: {}
  };
}

// src/draw2-creator-workspace.ts
function isAssetSourceKind(value) {
  return [
    "LAYER_GROUP",
    "SELECTED_LAYERS",
    "VISIBLE_COMPOSITE",
    "ANIMATION_RANGE"
  ].includes(value);
}
function isCreatorAssetKind(value) {
  return [
    "CHARACTER",
    "OBJECT",
    "TILE",
    "BACKGROUND",
    "EFFECT"
  ].includes(value);
}
function isAssetAnimationName(value) {
  return value.trim().length > 0 && value.length <= 128;
}
function isAssetPivot(value) {
  return [
    "CENTER",
    "FEET",
    "CUSTOM"
  ].includes(value);
}
function normalizeReferences(values) {
  return [
    ...new Set((values ?? []).map((value) => value.trim()).filter((value) => value.length > 0))
  ].sort();
}
function normalizeOrderedReferences(values) {
  const seen = /* @__PURE__ */ new Set();
  const normalized = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}
var LEGACY_DIRECTION_SUFFIXES = [
  "UP",
  "DOWN",
  "LEFT",
  "RIGHT",
  "UP_LEFT",
  "UP_RIGHT",
  "DOWN_LEFT",
  "DOWN_RIGHT"
];
function assetAnimationMotionName(clip) {
  const explicit = clip.motionName?.trim();
  if (explicit !== void 0 && explicit.length > 0) return explicit;
  const custom = clip.customName?.trim();
  if (clip.name === "CUSTOM" && custom !== void 0 && custom.length > 0) return custom;
  const separator = clip.name.lastIndexOf("_");
  const suffix = separator > 0 ? clip.name.slice(separator + 1) : "";
  return LEGACY_DIRECTION_SUFFIXES.includes(suffix) ? clip.name.slice(0, separator) : clip.name;
}
function assetAnimationDirectionName(clip) {
  const explicit = clip.direction?.trim();
  if (explicit !== void 0 && explicit.length > 0) return explicit;
  const separator = clip.name.lastIndexOf("_");
  const suffix = separator > 0 ? clip.name.slice(separator + 1) : "";
  return LEGACY_DIRECTION_SUFFIXES.includes(suffix) ? suffix : void 0;
}
function assetAnimationClipKey(clip) {
  return `${assetAnimationMotionName(clip)}::${assetAnimationDirectionName(clip) ?? "DEFAULT"}`;
}
function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}
function isFiniteInteger(value) {
  return Number.isSafeInteger(value);
}
function isValidLayerSelection(selection) {
  if (selection.kind === "CURRENT_LAYER") return selection.layerId.trim().length > 0;
  if (selection.kind === "LAYER_GROUP") return selection.groupId.trim().length > 0;
  if (selection.kind === "SELECTED_LAYERS") return normalizeReferences(selection.layerIds).length > 0;
  return selection.kind === "VISIBLE_LAYERS";
}
function isValidFrameSelection(selection) {
  if (selection.kind === "CURRENT_FRAME") return selection.frameId.trim().length > 0;
  if (selection.kind === "RANGE") return selection.startFrameId.trim().length > 0 && selection.endFrameId.trim().length > 0;
  if (selection.kind === "TAG") return selection.tagId.trim().length > 0;
  return selection.frameIds.length > 0 && normalizeReferences(selection.frameIds).length === selection.frameIds.length;
}
function isValidRegionSelection(region) {
  if (region.kind === "FULL_CANVAS") return true;
  if (![
    region.x,
    region.y
  ].every(isFiniteInteger) || region.x < 0 || region.y < 0) return false;
  if (region.kind === "MANUAL") return isPositiveInteger(region.width) && isPositiveInteger(region.height);
  if (region.kind === "GRID") return (region.cellSize === 16 || region.cellSize === 32) && isPositiveInteger(region.columns) && isPositiveInteger(region.rows);
  return isPositiveInteger(region.cellWidth) && isPositiveInteger(region.cellHeight) && isPositiveInteger(region.columns) && isPositiveInteger(region.rows);
}
function isValidRasterSnapshot(snapshot) {
  if (!isPositiveInteger(snapshot.width) || !isPositiveInteger(snapshot.height) || !Array.isArray(snapshot.data) || snapshot.data.length !== snapshot.width * snapshot.height * 4) return false;
  return snapshot.data.every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 255);
}
function isValidAnimationMapping(mapping) {
  const seenKeys = /* @__PURE__ */ new Set();
  return mapping.every((clip) => {
    const motionName = assetAnimationMotionName(clip).trim();
    const direction = assetAnimationDirectionName(clip);
    const key = assetAnimationClipKey(clip);
    const hasSourceFrames = clip.sourceFrames !== void 0;
    const normalizedFrameIds = clip.frameIds.map((frameId) => frameId.trim()).filter((frameId) => frameId.length > 0);
    if (!isAssetAnimationName(clip.name) || motionName.length === 0 || seenKeys.has(key) || clip.frameIds.length === 0 || normalizedFrameIds.length !== clip.frameIds.length || !hasSourceFrames && normalizeOrderedReferences(clip.frameIds).length !== clip.frameIds.length) return false;
    seenKeys.add(key);
    if (clip.name === "CUSTOM" && (clip.customName ?? "").trim().length === 0) return false;
    if (clip.motionName !== void 0 && clip.motionName.trim().length === 0) return false;
    if (direction !== void 0 && direction.trim().length === 0) return false;
    if (clip.sourceReference !== void 0 && clip.sourceReference.trim().length === 0) return false;
    if (clip.flipX !== void 0 && typeof clip.flipX !== "boolean") return false;
    if (clip.flipY !== void 0 && typeof clip.flipY !== "boolean") return false;
    if (clip.sourceFrames !== void 0 && (clip.sourceFrames.length !== clip.frameIds.length || clip.sourceFrames.some((frame) => frame.sourceFrameId.trim().length === 0 || normalizeReferences(frame.layerIds).length === 0 || !Number.isSafeInteger(frame.rect.x) || !Number.isSafeInteger(frame.rect.y) || frame.rect.x < 0 || frame.rect.y < 0 || !isPositiveInteger(frame.rect.width) || !isPositiveInteger(frame.rect.height) || frame.rasterSnapshot !== void 0 && !isValidRasterSnapshot(frame.rasterSnapshot) || frame.durationMs !== void 0 && (!Number.isFinite(frame.durationMs) || frame.durationMs <= 0) || frame.flipX !== void 0 && typeof frame.flipX !== "boolean" || frame.flipY !== void 0 && typeof frame.flipY !== "boolean"))) return false;
    if (clip.frameDurationsMs !== void 0 && (clip.frameDurationsMs.length !== clip.frameIds.length || clip.frameDurationsMs.some((duration) => !Number.isFinite(duration) || duration <= 0))) return false;
    return [
      "LOOP",
      "ONCE",
      "PING_PONG"
    ].includes(clip.loopMode) && (clip.fps === void 0 || Number.isFinite(clip.fps) && clip.fps > 0);
  });
}
function isValidPivotDefinition(pivot) {
  return pivot.kind !== "CUSTOM" || [
    pivot.x,
    pivot.y
  ].every(Number.isFinite);
}
function isValidProtection(protection) {
  return typeof protection.locked === "boolean" && protection.sourceReadOnly === true && [
    "LIVE",
    "PINNED",
    "REVIEW",
    "FORKED"
  ].includes(protection.referencePolicy);
}
function isValidDefinition(definition) {
  const validFrames = isPositiveInteger(definition.frameStart) && isPositiveInteger(definition.frameEnd) && definition.frameEnd >= definition.frameStart;
  return definition.sourceProjectId.length > 0 && definition.sourceProjectId === definition.sourceProjectId.trim() && definition.sourceCanvasId.length > 0 && definition.sourceCanvasId === definition.sourceCanvasId.trim() && validFrames && isAssetSourceKind(definition.sourceKind) && isCreatorAssetKind(definition.assetKind) && isAssetPivot(definition.pivot) && isValidLayerSelection(definition.layerSelection) && isValidFrameSelection(definition.frameSelection) && isValidRegionSelection(definition.region) && isValidAnimationMapping(definition.animationMapping) && isValidPivotDefinition(definition.pivotDefinition) && isValidProtection(definition.protection) && definition.metadata.name.length > 0;
}
function validateAssetDefinitionDraft(draft) {
  if (draft.persistence !== "LOCAL_DRAFT" || !isValidDefinition(draft)) {
    return {
      ok: false,
      code: "INVALID_ASSET_DEFINITION",
      message: "Asset\u5B9A\u7FA9\u306E\u53C2\u7167\u3001\u7BC4\u56F2\u3001\u30E1\u30BF\u30C7\u30FC\u30BF\u3001\u4FDD\u8B77\u8A2D\u5B9A\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
    };
  }
  return {
    ok: true,
    value: {
      ...draft,
      persistence: "VALIDATED_DEFINITION"
    }
  };
}

// src/draw2-creator-features.ts
var CREATOR_FEATURE_SCHEMA_VERSION = 1;
function boundedInteger(value, min, max, fallback) {
  return Number.isSafeInteger(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
function boundedNumber(value, min, max, fallback) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
function stableId3(value, kind) {
  if (!/^[A-Za-z0-9:_./-]{1,128}$/.test(value)) {
    throw new Error(`${kind} must be a bounded stable identifier.`);
  }
  return value;
}
var AnimationTagStore = class {
  #tags = /* @__PURE__ */ new Map();
  upsert(tag, frameCount) {
    const errors = validateAnimationTag(tag, frameCount);
    if (errors.length > 0) throw new Error(errors.join(","));
    const normalized = {
      ...tag,
      id: stableId3(tag.id, "Animation tag ID"),
      name: tag.name.trim().slice(0, 64)
    };
    this.#tags.set(normalized.id, normalized);
    return normalized;
  }
  remove(id) {
    return this.#tags.delete(id);
  }
  get(id) {
    return this.#tags.get(id);
  }
  list() {
    return [
      ...this.#tags.values()
    ].sort((a, b) => a.fromFrameIndex - b.fromFrameIndex || a.id.localeCompare(b.id));
  }
};
function validateAnimationTag(tag, frameCount) {
  const errors = [];
  if (!tag.id.trim() || !tag.name.trim()) {
    errors.push("TAG_ID_OR_NAME_REQUIRED");
  }
  if (!Number.isSafeInteger(tag.fromFrameIndex) || !Number.isSafeInteger(tag.toFrameIndex) || tag.fromFrameIndex < 0 || tag.toFrameIndex < tag.fromFrameIndex || tag.toFrameIndex >= frameCount) errors.push("TAG_FRAME_RANGE_INVALID");
  if (tag.color !== void 0 && (!Number.isSafeInteger(tag.color) || tag.color < 0 || tag.color > 4294967295)) errors.push("TAG_COLOR_INVALID");
  return errors;
}
var TimelineMarkerStore = class {
  #markers = /* @__PURE__ */ new Map();
  upsert(marker) {
    if (!marker.id.trim() || !marker.label.trim() || !Number.isSafeInteger(marker.frameIndex) || marker.frameIndex < 0 || ![
      "AUDIO",
      "GAME_EVENT",
      "NOTE"
    ].includes(marker.kind)) throw new Error("Timeline marker is invalid.");
    const normalized = {
      ...marker,
      id: stableId3(marker.id, "Timeline marker ID"),
      label: marker.label.trim().slice(0, 128),
      payload: marker.payload === void 0 ? void 0 : {
        ...marker.payload
      }
    };
    this.#markers.set(normalized.id, normalized);
    return normalized;
  }
  remove(id) {
    return this.#markers.delete(id);
  }
  list(frameIndex) {
    return [
      ...this.#markers.values()
    ].filter((marker) => frameIndex === void 0 || marker.frameIndex === frameIndex).sort((a, b) => a.frameIndex - b.frameIndex || a.id.localeCompare(b.id));
  }
};
var DrawAudioReferenceStore = class {
  #references = /* @__PURE__ */ new Map();
  upsert(reference, frameCount) {
    if (!Number.isSafeInteger(frameCount) || frameCount < 1) {
      throw new Error("Draw Audio reference requires a valid frame count.");
    }
    const normalized = {
      id: stableId3(reference.id, "Draw Audio reference ID"),
      audioAssetId: stableId3(reference.audioAssetId, "Audio Asset ID"),
      audioRevisionId: stableId3(reference.audioRevisionId, "Audio Revision ID"),
      kind: reference.kind === "SE" ? "SE" : "BGM",
      label: reference.label.trim().slice(0, 128) || reference.kind,
      startFrame: boundedInteger(reference.startFrame, 0, frameCount - 1, 0),
      durationFrames: boundedInteger(reference.durationFrames, 1, frameCount, reference.kind === "SE" ? 1 : frameCount),
      loop: reference.kind === "BGM" && reference.loop === true,
      gain: boundedNumber(reference.gain, 0, 2, 1)
    };
    this.#references.set(normalized.id, normalized);
    return normalized;
  }
  remove(id) {
    return this.#references.delete(id);
  }
  list() {
    return [
      ...this.#references.values()
    ].sort((left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id));
  }
};
var MAX_SELECTION_STAMP_DIMENSION = 4096;
var MAX_SELECTION_STAMP_AREA = 1048576;
function normalizeDraw2SelectionStamp(input) {
  if (typeof input.id !== "string" || typeof input.name !== "string" || !Array.isArray(input.pixels) || !Array.isArray(input.palette)) {
    throw new Error("Draw2 selection stamp shape is invalid.");
  }
  if (!Number.isSafeInteger(input.width) || !Number.isSafeInteger(input.height) || input.width < 1 || input.height < 1 || input.width > MAX_SELECTION_STAMP_DIMENSION || input.height > MAX_SELECTION_STAMP_DIMENSION || input.width * input.height > MAX_SELECTION_STAMP_AREA) {
    throw new Error("Draw2 selection stamp dimensions are invalid.");
  }
  if (input.palette.length < 1 || input.palette.length > 256) {
    throw new Error("Draw2 selection stamp palette is invalid.");
  }
  const palette = input.palette.map((color) => {
    if (!Number.isSafeInteger(color) || color < 0 || color > 4294967295) throw new Error("Draw2 selection stamp palette color is invalid.");
    return color >>> 0;
  });
  const pixels = /* @__PURE__ */ new Map();
  for (const candidate of input.pixels) {
    if (candidate === null || typeof candidate !== "object" || !Number.isSafeInteger(candidate.x) || !Number.isSafeInteger(candidate.y) || !Number.isSafeInteger(candidate.colorIndex) || candidate.x < 0 || candidate.y < 0 || candidate.x >= input.width || candidate.y >= input.height || candidate.colorIndex < 0 || candidate.colorIndex >= palette.length) {
      throw new Error("Draw2 selection stamp pixel is invalid.");
    }
    pixels.set(`${candidate.x}:${candidate.y}`, {
      x: candidate.x,
      y: candidate.y,
      colorIndex: candidate.colorIndex
    });
  }
  return {
    id: stableId3(input.id, "Draw2 selection stamp ID"),
    name: input.name.trim().slice(0, 64) || "Selection stamp",
    width: input.width,
    height: input.height,
    pixels: [
      ...pixels.values()
    ].sort((left, right) => left.y - right.y || left.x - right.x),
    palette,
    schemaVersion: CREATOR_FEATURE_SCHEMA_VERSION
  };
}
var Draw2SelectionStampStore = class {
  #stamps = /* @__PURE__ */ new Map();
  constructor(initial = []) {
    for (const stamp of initial) this.save(stamp);
  }
  save(input) {
    const stamp = normalizeDraw2SelectionStamp(input);
    this.#stamps.set(stamp.id, stamp);
    return stamp;
  }
  load(id) {
    return this.#stamps.get(id);
  }
  remove(id) {
    return this.#stamps.delete(id);
  }
  list() {
    return [
      ...this.#stamps.values()
    ].sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  }
};
var DRAW2_TIMELINE_METADATA_SCHEMA_VERSION = 2;
function isMetadataRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function cloneTimelineMarker(marker) {
  return marker.payload === void 0 ? {
    ...marker
  } : {
    ...marker,
    payload: {
      ...marker.payload
    }
  };
}
function normalizeDraw2TimelineMetadata(value, frameCount) {
  if (!Number.isSafeInteger(frameCount) || frameCount < 1) {
    throw new Error("Draw2 timeline metadata requires a valid frame count.");
  }
  if (value === void 0) {
    return {
      schemaVersion: DRAW2_TIMELINE_METADATA_SCHEMA_VERSION,
      animationTags: [],
      markers: [],
      audioReferences: []
    };
  }
  if (!isMetadataRecord(value) || value.schemaVersion !== DRAW2_TIMELINE_METADATA_SCHEMA_VERSION) {
    throw new Error("Draw2 timeline metadata schema is unsupported.");
  }
  if (!Array.isArray(value.animationTags) || !Array.isArray(value.markers) || !Array.isArray(value.audioReferences)) {
    throw new Error("Draw2 timeline metadata collections are invalid.");
  }
  const selectionStampCandidates = value.selectionStamps;
  if (selectionStampCandidates !== void 0 && !Array.isArray(selectionStampCandidates)) {
    throw new Error("Draw2 selection stamp collection is invalid.");
  }
  const tags = new AnimationTagStore();
  const tagIds = /* @__PURE__ */ new Set();
  for (const candidate of value.animationTags) {
    if (!isMetadataRecord(candidate) || typeof candidate.id !== "string") {
      throw new Error("Draw2 animation tag is invalid.");
    }
    if (tagIds.has(candidate.id)) {
      throw new Error("Draw2 animation tag identity is duplicated.");
    }
    tagIds.add(candidate.id);
    tags.upsert(candidate, frameCount);
  }
  const markers = new TimelineMarkerStore();
  const markerIds = /* @__PURE__ */ new Set();
  for (const candidate of value.markers) {
    if (!isMetadataRecord(candidate) || typeof candidate.id !== "string") {
      throw new Error("Draw2 timeline marker is invalid.");
    }
    if (!Number.isSafeInteger(candidate.frameIndex) || candidate.frameIndex < 0 || candidate.frameIndex >= frameCount) {
      throw new Error("Draw2 timeline marker frame is invalid.");
    }
    if (markerIds.has(candidate.id)) {
      throw new Error("Draw2 timeline marker identity is duplicated.");
    }
    markerIds.add(candidate.id);
    markers.upsert(candidate);
  }
  const audioReferences = new DrawAudioReferenceStore();
  const audioReferenceIds = /* @__PURE__ */ new Set();
  for (const candidate of value.audioReferences) {
    if (!isMetadataRecord(candidate) || typeof candidate.id !== "string") {
      throw new Error("Draw Audio reference is invalid.");
    }
    if (audioReferenceIds.has(candidate.id)) {
      throw new Error("Draw Audio reference identity is duplicated.");
    }
    audioReferenceIds.add(candidate.id);
    audioReferences.upsert(candidate, frameCount);
  }
  const selectionStamps = new Draw2SelectionStampStore();
  const selectionStampIds = /* @__PURE__ */ new Set();
  for (const candidate of selectionStampCandidates ?? []) {
    if (candidate === null || typeof candidate !== "object" || typeof candidate.id !== "string") {
      throw new Error("Draw2 selection stamp is invalid.");
    }
    const normalized = normalizeDraw2SelectionStamp(candidate);
    if (selectionStampIds.has(normalized.id)) {
      throw new Error("Draw2 selection stamp identity is duplicated.");
    }
    selectionStampIds.add(normalized.id);
    selectionStamps.save(normalized);
  }
  return {
    schemaVersion: DRAW2_TIMELINE_METADATA_SCHEMA_VERSION,
    animationTags: tags.list().map((tag) => ({
      ...tag
    })),
    markers: markers.list().map(cloneTimelineMarker),
    audioReferences: audioReferences.list().map((reference) => ({
      ...reference
    })),
    ...selectionStampCandidates === void 0 ? {} : {
      selectionStamps: selectionStamps.list().map((stamp) => ({
        ...stamp,
        pixels: stamp.pixels.map((pixel) => ({
          ...pixel
        })),
        palette: [
          ...stamp.palette
        ]
      }))
    }
  };
}

// src/game/game-350/assetization.ts
var ASSET_PACKAGE_SCHEMA_VERSION = 1;
var ASSETIZATION_CONTRACT_VERSION = "PIXIEED_ASSETIZATION_V1";
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function packageText(value, maxLength) {
  if (typeof value !== "string") return void 0;
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized : void 0;
}
function canonicalPackageValue(value) {
  if (Array.isArray(value)) return value.map(canonicalPackageValue);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [
      key,
      canonicalPackageValue(value[key])
    ]));
  }
  return value;
}
async function sha256PackageBody(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalPackageValue(packageBody(value))));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
function packageBody(manifest) {
  return {
    schemaVersion: manifest.schemaVersion,
    detectorVersion: manifest.detectorVersion,
    confirmationRevision: manifest.confirmationRevision,
    title: manifest.title,
    description: manifest.description,
    offerKind: manifest.offerKind,
    derivativePolicy: manifest.derivativePolicy,
    sellerId: manifest.sellerId ?? null,
    entries: manifest.entries
  };
}
function sourceReasons(source) {
  const reasons = [];
  if (!isRecord(source)) return [
    "source is required"
  ];
  const kind = source.kind;
  if (kind !== "DRAW" && kind !== "AUDIO") reasons.push("source kind is unsupported");
  if (packageText(typeof source.sourceId === "string" ? source.sourceId : void 0, 256) === void 0) reasons.push("sourceId is required");
  if (packageText(typeof source.projectId === "string" ? source.projectId : void 0, 256) === void 0) reasons.push("source projectId is required");
  if (packageText(typeof source.revisionId === "string" ? source.revisionId : void 0, 256) === void 0) reasons.push("source revisionId is required");
  if (packageText(typeof source.contentHash === "string" ? source.contentHash : void 0, 512) === void 0) reasons.push("source contentHash is required");
  if (kind === "DRAW" && packageText(typeof source.canvasId === "string" ? source.canvasId : void 0, 256) === void 0) reasons.push("Draw source canvasId is required");
  return reasons;
}
function proposalSourceMatches(source, proposal) {
  if (!isRecord(source) || !isRecord(proposal)) return false;
  if (source.kind === "DRAW" && (proposal.kind === "SPRITE" || proposal.kind === "ANIMATION")) {
    return typeof source.projectId === "string" && typeof source.revisionId === "string" && typeof source.contentHash === "string" && typeof source.canvasId === "string" && proposal.sourceProjectId === source.projectId.trim() && proposal.sourceRevisionId === source.revisionId.trim() && proposal.contentHash === source.contentHash.trim() && proposal.sourceCanvasId === source.canvasId.trim();
  }
  if (source.kind === "AUDIO" && proposal.kind === "AUDIO") {
    return typeof source.sourceId === "string" && typeof source.projectId === "string" && typeof source.revisionId === "string" && typeof source.contentHash === "string" && proposal.sourceProjectId === source.projectId.trim() && proposal.sourceRevisionId === source.revisionId.trim() && proposal.contentHash === source.contentHash.trim() && proposal.rangeId === source.sourceId.trim();
  }
  return false;
}
function packageStructureReasons(manifest) {
  const reasons = [];
  if (manifest.schemaVersion !== ASSET_PACKAGE_SCHEMA_VERSION) reasons.push("unsupported package schemaVersion");
  if (manifest.status !== "FINALIZED") reasons.push("package status must be FINALIZED");
  if (manifest.detectorVersion !== ASSETIZATION_CONTRACT_VERSION) reasons.push("unsupported detectorVersion");
  if (packageText(manifest.confirmationRevision, 256) === void 0 || manifest.confirmationRevision.trim().length === 0) reasons.push("confirmationRevision is required");
  if (packageText(manifest.packageId, 256) === void 0 || manifest.packageId.trim().length === 0) reasons.push("packageId is required");
  if (!/^sha256:[0-9a-f]{64}$/u.test(manifest.packageHash)) reasons.push("packageHash must be a SHA-256 hash");
  if (packageText(manifest.title, 128) === void 0 || manifest.title.trim().length === 0) reasons.push("title is required");
  if (packageText(manifest.description, 4096) === void 0) reasons.push("description is invalid");
  if (manifest.offerKind !== "ASSET" && manifest.offerKind !== "ASSET_PACK") reasons.push("offerKind is invalid");
  if (![
    "USE_ONLY",
    "DERIVATIVE_ALLOWED",
    "REDISTRIBUTION_ALLOWED"
  ].includes(manifest.derivativePolicy)) reasons.push("derivativePolicy is invalid");
  if (manifest.sellerId !== void 0 && (packageText(manifest.sellerId, 256) === void 0 || manifest.sellerId.trim().length === 0)) reasons.push("sellerId is invalid");
  const expectedReadiness = manifest.sellerId === void 0 ? "ACCOUNT_REQUIRED" : "READY";
  if (manifest.saleReadiness !== expectedReadiness) reasons.push("saleReadiness does not match sellerId");
  const rawEntries = manifest.entries;
  const entries = Array.isArray(rawEntries) ? rawEntries : [];
  if (!Array.isArray(rawEntries) || entries.length === 0) reasons.push("at least one package entry is required");
  if (manifest.offerKind === "ASSET" && entries.length !== 1) reasons.push("ASSET must contain exactly one entry");
  if (manifest.offerKind === "ASSET_PACK" && entries.length < 2) reasons.push("ASSET_PACK must contain at least two entries");
  const entryIds = /* @__PURE__ */ new Set();
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
function validateAssetPackageManifest(value) {
  if (!isRecord(value)) return {
    ok: false,
    reasons: [
      "package manifest must be an object"
    ]
  };
  const manifest = value;
  const reasons = packageStructureReasons(manifest);
  return reasons.length === 0 ? {
    ok: true,
    value: manifest
  } : {
    ok: false,
    reasons
  };
}
async function verifyAssetPackageManifest(manifest) {
  const structure = validateAssetPackageManifest(manifest);
  if (!structure.ok) return structure;
  const expectedHash = await sha256PackageBody(manifest);
  if (expectedHash !== manifest.packageHash) return {
    ok: false,
    reasons: [
      "packageHash does not match the finalized manifest"
    ]
  };
  const expectedPackageId = `asset-package:${expectedHash.slice("sha256:".length, "sha256:".length + 24)}`;
  if (expectedPackageId !== manifest.packageId) return {
    ok: false,
    reasons: [
      "packageId does not match the packageHash"
    ]
  };
  return structure;
}

// src/draw2-export-registry.ts
var PNG_EXPORT_MAX_PIXELS = 4096 * 4096;
var PNG_EXPORT_SCALE_PRESETS = Object.freeze([
  1,
  2,
  3,
  4,
  6,
  8,
  12,
  16,
  24,
  32,
  48,
  64,
  96,
  128,
  192,
  256
]);
var EXPORT_FORMATS = Object.freeze([
  {
    id: "png",
    category: "image",
    label: "PNG",
    description: "\u900F\u904E\u3092\u4FDD\u3063\u305F\u753B\u50CF",
    extension: "png",
    mimeType: "image/png",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "jpeg",
    category: "image",
    label: "JPEG",
    description: "\u8EFD\u91CF\u306A\u753B\u50CF",
    extension: "jpg",
    mimeType: "image/jpeg",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "webp",
    category: "image",
    label: "WebP",
    description: "\u8EFD\u91CF\u30FB\u900F\u904E\u5BFE\u5FDC\u306E\u753B\u50CF",
    extension: "webp",
    mimeType: "image/webp",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "avif",
    category: "image",
    label: "AVIF",
    description: "\u30D6\u30E9\u30A6\u30B6\u5BFE\u5FDC\u6642\u306E\u9AD8\u5727\u7E2E\u753B\u50CF",
    extension: "avif",
    mimeType: "image/avif",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "bmp",
    category: "image",
    label: "BMP",
    description: "\u4E92\u63DB\u6027\u91CD\u8996\u306E\u30D3\u30C3\u30C8\u30DE\u30C3\u30D7",
    extension: "bmp",
    mimeType: "image/bmp",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "tiff",
    category: "image",
    label: "TIFF",
    description: "\u5370\u5237\u30FB\u4FDD\u5B58\u5411\u3051\u306E\u9AD8\u54C1\u8CEA\u753B\u50CF",
    extension: "tiff",
    mimeType: "image/tiff",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "gif",
    category: "animation",
    label: "GIF",
    description: "\u30A2\u30CB\u30E1\u30FC\u30B7\u30E7\u30F3\u753B\u50CF",
    extension: "gif",
    mimeType: "image/gif",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "apng",
    category: "animation",
    label: "APNG",
    description: "\u900F\u904E\u5BFE\u5FDC\u30A2\u30CB\u30E1\u30FC\u30B7\u30E7\u30F3",
    extension: "apng",
    mimeType: "image/apng",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "webm",
    category: "animation",
    label: "WebM Draw + Audio",
    description: "Draw\u30A2\u30CB\u30E1\u30FC\u30B7\u30E7\u30F3\u3068\u9078\u629E\u3057\u305FAudio\u3092\u4E00\u4F53\u5316\u3057\u305F\u52D5\u753B",
    extension: "webm",
    mimeType: "video/webm",
    visible: true,
    supported: true,
    supportsScale: false
  },
  {
    id: "wav",
    category: "audio",
    label: "WAV Mix",
    description: "\u9078\u629E\u3057\u305FBGM\u30FBSE\u30FB\u697D\u5668\u3092\u542B\u3080\u975E\u5727\u7E2E\u30DF\u30C3\u30AF\u30B9",
    extension: "wav",
    mimeType: "audio/wav",
    visible: true,
    supported: true,
    supportsScale: false
  },
  {
    id: "audio-webm",
    category: "audio",
    label: "WebM Audio (Opus)",
    description: "\u9078\u629E\u3057\u305FBGM\u30FBSE\u30FB\u697D\u5668\u3092\u8EFD\u91CF\u306AOpus\u97F3\u58F0\u3067\u4FDD\u5B58",
    extension: "webm",
    mimeType: "audio/webm",
    visible: true,
    supported: true,
    supportsScale: false
  },
  {
    id: "audio-ogg",
    category: "audio",
    label: "Ogg Audio (Opus)",
    description: "\u5BFE\u5FDC\u30D6\u30E9\u30A6\u30B6\u3067\u9078\u629E\u3057\u305FAudio\u3092Ogg/Opus\u3067\u4FDD\u5B58",
    extension: "ogg",
    mimeType: "audio/ogg",
    visible: true,
    supported: true,
    supportsScale: false
  },
  {
    id: "svg",
    category: "image",
    label: "SVG",
    description: "\u30D9\u30AF\u30BF\u30FC\u753B\u50CF",
    extension: "svg",
    mimeType: "image/svg+xml",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "sprite-sheet",
    category: "animation",
    label: "Sprite Sheet",
    description: "\u5168\u30D5\u30EC\u30FC\u30E0\u3092\u4E26\u3079\u305F\u753B\u50CF",
    extension: "png",
    mimeType: "image/png",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "atlas-json",
    category: "animation",
    label: "Atlas metadata",
    description: "Sprite Sheet\u306E\u5EA7\u6A19\u30E1\u30BF\u30C7\u30FC\u30BF",
    extension: "json",
    mimeType: "application/json",
    visible: true,
    supported: true,
    supportsScale: false
  },
  {
    id: "tileset",
    category: "tiles",
    label: "Tileset",
    description: "\u30BF\u30A4\u30EB\u7D20\u6750\u3068\u914D\u7F6E\u60C5\u5831",
    extension: "png",
    mimeType: "image/png",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "pxd",
    category: "project",
    label: "PXD Project",
    description: "Draw / Audio / Game\u3092\u542B\u3080\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8",
    extension: "pxd",
    mimeType: "application/vnd.pixieed.pxd",
    visible: true,
    supported: true,
    supportsScale: false
  },
  {
    id: "glb",
    category: "game",
    label: "GLB",
    description: "3D\u30B2\u30FC\u30E0\u7D20\u6750\uFF08\u5C06\u6765\u5BFE\u5FDC\uFF09",
    extension: "glb",
    mimeType: "model/gltf-binary",
    visible: false,
    supported: false,
    supportsScale: false
  }
]);
var EXPORT_FORMAT_BY_ID = new Map(EXPORT_FORMATS.map((definition) => [
  definition.id,
  definition
]));

// src/draw2-export.ts
var PXD_FORMAT = "pxd";
var PXD_MAGIC = new Uint8Array([
  80,
  88,
  68,
  0
]);
var PXD_HEADER_BYTES = 9;
var PXD_CREATED_BY = Object.freeze({
  application: "PiXiEED",
  version: "2.0.0-reference"
});
var PXD_PROJECT_SCHEMA_VERSION = 2;
var PXD_PROJECT_ARCHIVE_VERSION = 2;
function assert(condition, code, message) {
  if (!condition) throw Object.assign(new Error(message), {
    code
  });
}
function readUint32(bytes, offset, label) {
  assert(offset >= 0 && offset + 4 <= bytes.length, "PXD_TRUNCATED", `${label} is truncated.`);
  return (bytes[offset] ?? 0) * 16777216 + ((bytes[offset + 1] ?? 0) << 16) + ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0);
}
async function sha256BytesHex2(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function isRecord2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function assertNoEmbeddedAssetPayload(value, path, allowRasterSnapshots = false) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoEmbeddedAssetPayload(entry, `${path}[${index}]`, allowRasterSnapshots));
    return;
  }
  if (!isRecord2(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (allowRasterSnapshots && key === "rasterSnapshot") {
      continue;
    }
    assert(![
      "pixels",
      "pixelData",
      "raster",
      "blob",
      "dataUrl",
      "rgba",
      "indexedBytes",
      "payload"
    ].includes(key), "PXD_ASSET_DEFINITION_EMBEDDED_DATA", `${path}.${key} must not contain embedded asset data.`);
    assertNoEmbeddedAssetPayload(entry, `${path}.${key}`, allowRasterSnapshots);
  }
}
function assertAssetDefinitionShape(value, path) {
  assert(isRecord2(value), "PXD_ASSET_DEFINITION_INVALID", `${path} must be an object.`);
  const definition = value;
  assert(definition.schemaVersion === 1, "PXD_ASSET_DEFINITION_VERSION_UNSUPPORTED", `${path}.schemaVersion is unsupported.`);
  assert(definition.persistence === "LOCAL_DRAFT" || definition.persistence === "VALIDATED_DEFINITION", "PXD_ASSET_DEFINITION_PERSISTENCE_INVALID", `${path}.persistence must be LOCAL_DRAFT or VALIDATED_DEFINITION.`);
  const candidate = {
    ...definition,
    persistence: "LOCAL_DRAFT"
  };
  const validation = validateAssetDefinitionDraft(candidate);
  assert(validation.ok, "PXD_ASSET_DEFINITION_INVALID", `${path} failed Asset Definition validation.`);
  const normalized = {
    ...validation.value,
    persistence: definition.persistence
  };
  assert(canonicalJson(normalized) === canonicalJson(definition), "PXD_ASSET_DEFINITION_NOT_NORMALIZED", `${path} is not normalized.`);
}
function validateAssetDefinitionEntry(value, index) {
  const path = `assetDefinitions[${index}]`;
  assert(isRecord2(value), "PXD_ASSET_DEFINITION_INVALID", `${path} must be an object.`);
  assertNoEmbeddedAssetPayload(value, path, true);
  assert(typeof value.definitionId === "string" && value.definitionId.trim() === value.definitionId && value.definitionId.length > 0, "PXD_ASSET_DEFINITION_ID_INVALID", `${path}.definitionId is invalid.`);
  assertAssetDefinitionShape(value.definition, `${path}.definition`);
  if (value.registryIdentity !== void 0) {
    assert(isRecord2(value.registryIdentity), "PXD_REGISTRY_IDENTITY_INVALID", `${path}.registryIdentity is invalid.`);
    assert(typeof value.registryIdentity.assetId === "string" && value.registryIdentity.assetId.trim() === value.registryIdentity.assetId && value.registryIdentity.assetId.length > 0, "PXD_REGISTRY_IDENTITY_INVALID", `${path}.registryIdentity.assetId is invalid.`);
    assert(typeof value.registryIdentity.revisionId === "string" && value.registryIdentity.revisionId.trim() === value.registryIdentity.revisionId && value.registryIdentity.revisionId.length > 0, "PXD_REGISTRY_IDENTITY_INVALID", `${path}.registryIdentity.revisionId is invalid.`);
  }
  return value;
}
var PXD_PRODUCT_MODULES = [
  "DRAW",
  "AUDIO",
  "GAME"
];
var PXD_PRODUCT_KINDS = [
  "GAME_PROJECT",
  "DRAW_IMAGE",
  "DRAW_ANIMATION",
  "DRAW_CHARACTER_ANIMATION",
  "AUDIO_ASSET",
  "PROJECT"
];
var PXD_PRODUCT_RIGHTS = [
  "PERSONAL_USE",
  "COMMERCIAL_USE",
  "DERIVATIVE",
  "EMBEDDING",
  "RESALE"
];
function normalizePxdProductReferences(value, path) {
  assert(Array.isArray(value), "PXD_PRODUCT_REFERENCE_INVALID", `${path} must be an array.`);
  const normalized = value.map((entry, index) => {
    assert(typeof entry === "string" && entry.trim() === entry && entry.length > 0, "PXD_PRODUCT_REFERENCE_INVALID", `${path}[${index}] is invalid.`);
    return entry;
  });
  assert(new Set(normalized).size === normalized.length, "PXD_PRODUCT_REFERENCE_DUPLICATE", `${path} contains a duplicate reference.`);
  return normalized.sort(compareStrings);
}
function normalizePxdProductDefinition(value, index, assetDefinitionIds, audioRevisionIds, availableModules) {
  const path = `productDefinitions[${index}]`;
  assert(isRecord2(value), "PXD_PRODUCT_DEFINITION_INVALID", `${path} must be an object.`);
  assertNoEmbeddedAssetPayload(value, path);
  const allowedKeys = /* @__PURE__ */ new Set([
    "schemaVersion",
    "persistence",
    "productId",
    "kind",
    "name",
    "description",
    "includedModules",
    "assetDefinitionIds",
    "audioRevisionIds",
    "rights",
    "edition"
  ]);
  assert(Object.keys(value).every((key) => allowedKeys.has(key)), "PXD_PRODUCT_DEFINITION_FIELD_INVALID", `${path} contains an unsupported field.`);
  assert(value.schemaVersion === 1, "PXD_PRODUCT_DEFINITION_VERSION_UNSUPPORTED", `${path}.schemaVersion is unsupported.`);
  assert(value.persistence === "LOCAL_DRAFT", "PXD_PRODUCT_DEFINITION_PERSISTENCE_INVALID", `${path}.persistence must be LOCAL_DRAFT.`);
  assert(typeof value.productId === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value.productId), "PXD_PRODUCT_ID_INVALID", `${path}.productId is invalid.`);
  assert(typeof value.kind === "string" && PXD_PRODUCT_KINDS.includes(value.kind), "PXD_PRODUCT_KIND_INVALID", `${path}.kind is invalid.`);
  assert(typeof value.name === "string" && value.name.trim() === value.name && value.name.length > 0 && value.name.length <= 128, "PXD_PRODUCT_NAME_INVALID", `${path}.name is invalid.`);
  assert(typeof value.description === "string" && value.description.trim() === value.description && value.description.length <= 4096, "PXD_PRODUCT_DESCRIPTION_INVALID", `${path}.description is invalid.`);
  const includedModules = normalizePxdProductReferences(value.includedModules, `${path}.includedModules`);
  assert(includedModules.every((module) => PXD_PRODUCT_MODULES.includes(module)), "PXD_PRODUCT_MODULE_INVALID", `${path}.includedModules contains an unsupported module.`);
  assert(includedModules.length > 0, "PXD_PRODUCT_MODULE_REQUIRED", `${path}.includedModules must not be empty.`);
  const assetIds = normalizePxdProductReferences(value.assetDefinitionIds, `${path}.assetDefinitionIds`);
  const audioIds = normalizePxdProductReferences(value.audioRevisionIds, `${path}.audioRevisionIds`);
  for (const assetId of assetIds) assert(assetDefinitionIds.has(assetId), "PXD_PRODUCT_ASSET_REFERENCE_MISSING", `${path} references missing Asset Definition ${assetId}.`);
  for (const audioId of audioIds) assert(audioRevisionIds.has(audioId), "PXD_PRODUCT_AUDIO_REFERENCE_MISSING", `${path} references missing Audio revision ${audioId}.`);
  assert(assetIds.length === 0 || includedModules.includes("DRAW"), "PXD_PRODUCT_DRAW_MODULE_REQUIRED", `${path} uses Draw Asset Definitions without including DRAW.`);
  assert(audioIds.length === 0 || includedModules.includes("AUDIO"), "PXD_PRODUCT_AUDIO_MODULE_REQUIRED", `${path} uses Audio revisions without including AUDIO.`);
  if (value.kind === "GAME_PROJECT") assert(includedModules.includes("GAME"), "PXD_PRODUCT_GAME_MODULE_REQUIRED", `${path} GAME_PROJECT must include GAME.`);
  if ([
    "DRAW_IMAGE",
    "DRAW_ANIMATION",
    "DRAW_CHARACTER_ANIMATION"
  ].includes(value.kind)) {
    assert(includedModules.includes("DRAW") && assetIds.length > 0, "PXD_PRODUCT_DRAW_SOURCE_REQUIRED", `${path} Draw products require DRAW and at least one Asset Definition.`);
  }
  if (value.kind === "AUDIO_ASSET") {
    assert(includedModules.includes("AUDIO") && audioIds.length > 0, "PXD_PRODUCT_AUDIO_SOURCE_REQUIRED", `${path} AUDIO_ASSET products require AUDIO and at least one Audio revision.`);
  }
  const rights = normalizePxdProductReferences(value.rights, `${path}.rights`);
  assert(rights.every((right) => PXD_PRODUCT_RIGHTS.includes(right)), "PXD_PRODUCT_RIGHT_INVALID", `${path}.rights contains an unsupported right.`);
  assert(rights.length > 0, "PXD_PRODUCT_RIGHT_REQUIRED", `${path}.rights must not be empty.`);
  assert(isRecord2(value.edition), "PXD_PRODUCT_EDITION_INVALID", `${path}.edition is invalid.`);
  const editionValue = value.edition;
  let edition;
  if (editionValue.kind === "UNLIMITED") {
    assert(Object.keys(editionValue).length === 1, "PXD_PRODUCT_EDITION_INVALID", `${path}.edition contains an unsupported field.`);
    edition = {
      kind: "UNLIMITED"
    };
  } else {
    assert(editionValue.kind === "LIMITED" && Object.keys(editionValue).length === 2, "PXD_PRODUCT_EDITION_INVALID", `${path}.edition kind is invalid.`);
    const maxUnits = editionValue.maxUnits;
    assert(typeof maxUnits === "number" && Number.isSafeInteger(maxUnits) && maxUnits > 0, "PXD_PRODUCT_EDITION_LIMIT_INVALID", `${path}.edition.maxUnits must be a positive safe integer.`);
    edition = {
      kind: "LIMITED",
      maxUnits
    };
  }
  for (const module of includedModules) assert(availableModules.has(module), "PXD_PRODUCT_MODULE_MISSING", `${path} requires unavailable module ${module}.`);
  return {
    schemaVersion: 1,
    persistence: "LOCAL_DRAFT",
    productId: value.productId,
    kind: value.kind,
    name: value.name,
    description: value.description,
    includedModules,
    assetDefinitionIds: assetIds,
    audioRevisionIds: audioIds,
    rights,
    edition
  };
}
function normalizePxdProductDefinitions(entries, assetDefinitions, audioRevisionIds, availableModules) {
  const assetDefinitionIds = new Set(assetDefinitions.map((entry) => entry.definitionId));
  const audioIds = new Set(audioRevisionIds);
  const normalized = [
    ...entries ?? []
  ].map((entry, index) => normalizePxdProductDefinition(entry, index, assetDefinitionIds, audioIds, availableModules));
  normalized.sort((left, right) => compareStrings(left.productId, right.productId));
  for (let index = 1; index < normalized.length; index += 1) {
    assert(normalized[index - 1]?.productId !== normalized[index]?.productId, "PXD_PRODUCT_DEFINITION_DUPLICATE", `Product Definition ${normalized[index]?.productId ?? ""} is duplicated.`);
  }
  return normalized;
}
function normalizePxdAssetPackages(entries) {
  const normalized = [
    ...entries ?? []
  ].map((entry, index) => {
    const checked = validateAssetPackageManifest(entry);
    if (!checked.ok) {
      assert(false, "PXD_ASSET_PACKAGE_INVALID", `assetPackages[${index}] is invalid: ${checked.reasons.join("; ")}`);
    }
    return entry;
  });
  normalized.sort((left, right) => compareStrings(left.packageId, right.packageId));
  for (let index = 1; index < normalized.length; index += 1) {
    assert(normalized[index - 1]?.packageId !== normalized[index]?.packageId, "PXD_ASSET_PACKAGE_DUPLICATE", `Asset Package ${normalized[index]?.packageId ?? ""} is duplicated.`);
  }
  return normalized;
}
function validateProjectMetadata(value) {
  assert(value !== null && typeof value === "object", "PXD_PROJECT_INVALID", "PXD project metadata is invalid.");
  const project = value;
  assert(typeof project.name === "string", "PXD_PROJECT_INVALID", "PXD project name is invalid.");
  assert(Number.isSafeInteger(project.structureEpoch) && project.structureEpoch >= 1, "PXD_PROJECT_INVALID", "PXD structure epoch is invalid.");
  assert(Array.isArray(project.layers) && Array.isArray(project.frames) && Array.isArray(project.cels), "PXD_PROJECT_INVALID", "PXD timeline collections are invalid.");
  assert(project.timeline !== null && typeof project.timeline === "object", "PXD_PROJECT_INVALID", "PXD timeline metadata is invalid.");
  return project;
}
function buildImportedAsset(entry, bytes) {
  assert(bytes.byteLength === entry.bytes && bytes.byteLength === entry.width * entry.height, "PXD_ASSET_SIZE_MISMATCH", `PXD asset ${entry.assetId} byte size does not match its dimensions.`);
  const raster = IndexedTileRaster.empty(entry.width, entry.height, entry.tileSize);
  for (let index = 0; index < bytes.length; index += 1) {
    const colorIndex = bytes[index] ?? 0;
    assert(colorIndex < entry.palette.length, "PXD_PIXEL_INDEX_INVALID", `PXD asset ${entry.assetId} contains an out-of-range palette index.`);
    if (colorIndex === 0) continue;
    const x = index % entry.width;
    const y = Math.floor(index / entry.width);
    raster.setPixel(entry.assetId, x, y, colorIndex);
  }
  return {
    id: entry.assetId,
    width: entry.width,
    height: entry.height,
    palette: [
      ...entry.palette
    ],
    raster,
    revision: entry.revision
  };
}
function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function projectPayloadPathIsSafe(path) {
  return path.length > 0 && path.length <= 512 && !path.startsWith("/") && !path.includes("\\") && !path.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..") && !/[\u0000\u0009\u000a\u000d]/u.test(path);
}
function validateProjectPayloadEntry(value, path) {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "PXD_ENTRY_INVALID", `${path} is invalid.`);
  const entry = value;
  assert(projectPayloadPathIsSafe(entry.path), "PXD_PATH_UNSAFE", `${path}.path is unsafe.`);
  assert(typeof entry.mediaType === "string" && entry.mediaType.length > 0, "PXD_MEDIA_TYPE_INVALID", `${path}.mediaType is invalid.`);
  assert(/^[a-f0-9]{64}$/u.test(entry.sha256), "PXD_ENTRY_HASH_INVALID", `${path}.sha256 is invalid.`);
  assert(Number.isSafeInteger(entry.bytes) && entry.bytes > 0, "PXD_ENTRY_SIZE_INVALID", `${path}.bytes is invalid.`);
  assert(Number.isSafeInteger(entry.offset) && entry.offset >= 0, "PXD_OFFSET_INVALID", `${path}.offset is invalid.`);
  return entry;
}
function validateProjectModuleManifest(value, path) {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "PXD_MODULE_INVALID", `${path} is invalid.`);
  const module = value;
  assert(module.schemaVersion === null || typeof module.schemaVersion === "string" && module.schemaVersion.length > 0, "PXD_MODULE_SCHEMA_INVALID", `${path}.schemaVersion is invalid.`);
  assert(module.status === "EMPTY" || module.status === "EMBEDDED", "PXD_MODULE_STATUS_INVALID", `${path}.status is invalid.`);
  assert(module.state === null || typeof module.state === "object", "PXD_MODULE_STATE_INVALID", `${path}.state is invalid.`);
  const state = module.state === null ? null : validateProjectPayloadEntry(module.state, `${path}.state`);
  assert(Array.isArray(module.assets), "PXD_MODULE_ASSETS_INVALID", `${path}.assets is invalid.`);
  const assets = module.assets.map((asset, index) => {
    const entry = validateProjectPayloadEntry(asset, `${path}.assets[${index}]`);
    const candidate = asset;
    assert(typeof candidate.revisionId === "string" && candidate.revisionId.length > 0, "PXD_AUDIO_REVISION_INVALID", `${path}.assets[${index}].revisionId is invalid.`);
    return {
      ...entry,
      revisionId: candidate.revisionId
    };
  });
  if (module.status === "EMPTY") {
    assert(module.schemaVersion === null && state === null && assets.length === 0, "PXD_MODULE_EMPTY_INVALID", `${path} empty module must not contain state or assets.`);
  } else {
    assert(module.schemaVersion !== null && state !== null, "PXD_MODULE_STATE_MISSING", `${path} embedded module state is missing.`);
  }
  return {
    schemaVersion: module.schemaVersion,
    status: module.status,
    state,
    assets
  };
}
function validateProjectManifestAsset(value, index) {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "PXD_ASSET_INVALID", `modules.draw.assets[${index}] is invalid.`);
  const asset = value;
  assert(typeof asset.assetId === "string" && typeof asset.revisionId === "string", "PXD_ASSET_INVALID", `modules.draw.assets[${index}] identity is invalid.`);
  assert(asset.mediaType === "application/vnd.pixieed.indexed-raster", "PXD_ASSET_TYPE_UNSUPPORTED", `modules.draw.assets[${index}] media type is unsupported.`);
  assert(/^objects\/asset-\d{4}\.raster$/u.test(asset.path), "PXD_PATH_UNSAFE", `modules.draw.assets[${index}].path is invalid.`);
  assert(/^[a-f0-9]{64}$/u.test(asset.sha256), "PXD_ASSET_HASH_INVALID", `modules.draw.assets[${index}].sha256 is invalid.`);
  assert(Number.isSafeInteger(asset.bytes) && asset.bytes > 0, "PXD_ASSET_SIZE_INVALID", `modules.draw.assets[${index}].bytes is invalid.`);
  assert(Number.isSafeInteger(asset.width) && asset.width > 0 && Number.isSafeInteger(asset.height) && asset.height > 0, "PXD_ASSET_DIMENSIONS_INVALID", `modules.draw.assets[${index}] dimensions are invalid.`);
  assert(asset.tileSize === 32 || asset.tileSize === 64, "PXD_TILE_SIZE_INVALID", `modules.draw.assets[${index}].tileSize is invalid.`);
  assert(Array.isArray(asset.palette) && asset.palette.length >= 1 && asset.palette.length <= 256 && asset.palette[0] === 0, "PXD_PALETTE_INVALID", `modules.draw.assets[${index}].palette is invalid.`);
  assert(Number.isSafeInteger(asset.revision) && asset.revision >= 0, "PXD_REVISION_INVALID", `modules.draw.assets[${index}].revision is invalid.`);
  assert(Number.isSafeInteger(asset.offset) && asset.offset >= 0, "PXD_OFFSET_INVALID", `modules.draw.assets[${index}].offset is invalid.`);
  return asset;
}
function validateProjectManifest(value) {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "PXD_MANIFEST_INVALID", "PXD v2 manifest must be an object.");
  const manifest = value;
  assert(manifest.format === PXD_FORMAT, "PXD_FORMAT_UNSUPPORTED", "Unsupported PXD format.");
  assert(manifest.schemaVersion === PXD_PROJECT_SCHEMA_VERSION && manifest.archiveVersion === PXD_PROJECT_ARCHIVE_VERSION, "PXD_VERSION_UNSUPPORTED", "Unsupported PXD project schema or archive version.");
  assert(manifest.packageKind === "PROJECT_PACKAGE", "PXD_PACKAGE_KIND_UNSUPPORTED", "Unsupported PXD package kind.");
  assert(typeof manifest.packageId === "string" && manifest.packageId.length > 0 && typeof manifest.projectId === "string" && manifest.projectId.length > 0, "PXD_MANIFEST_INVALID", "PXD project identity is invalid.");
  assert(Array.isArray(manifest.entries), "PXD_ENTRIES_INVALID", "PXD entries are invalid.");
  const entries = manifest.entries.map((entry, index) => validateProjectPayloadEntry(entry, `entries[${index}]`));
  for (let index = 1; index < entries.length; index += 1) {
    assert(entries[index - 1].path < entries[index].path, "PXD_ENTRY_ORDER_INVALID", "PXD entries must be in canonical path order.");
  }
  assert(typeof manifest.canonicalManifestHash === "string" && /^[a-f0-9]{64}$/u.test(manifest.canonicalManifestHash), "PXD_MANIFEST_HASH_INVALID", "PXD manifest hash is invalid.");
  assert(Array.isArray(manifest.dependencies) && manifest.dependencies.length === 0, "PXD_DEPENDENCIES_UNSUPPORTED", "PXD project dependencies must be empty.");
  validateProjectMetadata(manifest.project);
  if (manifest.drawTimelineMetadata !== void 0) {
    const normalized = normalizeDraw2TimelineMetadata(manifest.drawTimelineMetadata, manifest.project.frames.length);
    assert(canonicalJson(normalized) === canonicalJson(manifest.drawTimelineMetadata), "PXD_TIMELINE_METADATA_NOT_NORMALIZED", "PXD Draw timeline metadata must be canonically normalized.");
  }
  assert(manifest.modules !== null && typeof manifest.modules === "object", "PXD_MODULES_INVALID", "PXD modules are missing.");
  const draw = manifest.modules.draw;
  assert(draw !== null && typeof draw === "object" && draw.schemaVersion === "DRAW2_PROJECT_V1" && draw.status === "EMBEDDED" && draw.state === null && Array.isArray(draw.assets) && draw.assets.length > 0, "PXD_DRAW_MODULE_INVALID", "PXD Draw module is invalid.");
  const drawAssets = draw.assets.map((asset, index) => validateProjectManifestAsset(asset, index));
  const audio = validateProjectModuleManifest(manifest.modules.audio, "modules.audio");
  const game = validateProjectModuleManifest(manifest.modules.game, "modules.game");
  if (manifest.assetDefinitions !== void 0) {
    assert(Array.isArray(manifest.assetDefinitions), "PXD_ASSET_DEFINITION_INVALID", "PXD assetDefinitions must be an array.");
  }
  const assetDefinitions = manifest.assetDefinitions === void 0 ? [] : manifest.assetDefinitions.map((entry, index) => validateAssetDefinitionEntry(entry, index));
  for (let index = 1; index < assetDefinitions.length; index += 1) {
    assert(assetDefinitions[index - 1].definitionId < assetDefinitions[index].definitionId, "PXD_ASSET_DEFINITION_ORDER_INVALID", "PXD assetDefinitions must be in canonical definitionId order.");
  }
  const availableModules = /* @__PURE__ */ new Set([
    "DRAW"
  ]);
  if (audio.status === "EMBEDDED") availableModules.add("AUDIO");
  if (game.status === "EMBEDDED") availableModules.add("GAME");
  if (manifest.productDefinitions !== void 0) {
    assert(Array.isArray(manifest.productDefinitions), "PXD_PRODUCT_DEFINITION_INVALID", "PXD productDefinitions must be an array.");
  }
  const productDefinitions = normalizePxdProductDefinitions(manifest.productDefinitions, assetDefinitions, audio.assets.map((asset) => asset.revisionId), availableModules);
  if (manifest.productDefinitions !== void 0) {
    assert(canonicalJson(productDefinitions) === canonicalJson(manifest.productDefinitions), "PXD_PRODUCT_DEFINITION_NOT_NORMALIZED", "PXD productDefinitions must be canonically normalized.");
  }
  if (manifest.assetPackages !== void 0) {
    assert(Array.isArray(manifest.assetPackages), "PXD_ASSET_PACKAGE_INVALID", "PXD assetPackages must be an array.");
  }
  const assetPackages = normalizePxdAssetPackages(manifest.assetPackages);
  if (manifest.assetPackages !== void 0) {
    assert(canonicalJson(assetPackages) === canonicalJson(manifest.assetPackages), "PXD_ASSET_PACKAGE_NOT_NORMALIZED", "PXD assetPackages must be canonically normalized.");
  }
  const entryPaths = new Set(entries.map((entry) => entry.path));
  for (const asset of drawAssets) assert(entryPaths.has(asset.path), "PXD_ENTRY_MISSING", `PXD Draw entry ${asset.path} is missing.`);
  for (const module of [
    audio,
    game
  ]) {
    if (module.state !== null) assert(entryPaths.has(module.state.path), "PXD_ENTRY_MISSING", `PXD module entry ${module.state.path} is missing.`);
    for (const asset of module.assets) assert(entryPaths.has(asset.path), "PXD_ENTRY_MISSING", `PXD module entry ${asset.path} is missing.`);
  }
  return {
    ...manifest,
    modules: {
      draw: {
        ...draw,
        assets: drawAssets
      },
      audio,
      game
    },
    entries,
    ...manifest.assetPackages === void 0 ? {} : {
      assetPackages
    }
  };
}
function parseProjectJsonPayload(entry, payloads) {
  const bytes = payloads.get(entry.path);
  assert(bytes !== void 0, "PXD_ENTRY_MISSING", `PXD entry ${entry.path} is missing.`);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (cause) {
    if (cause instanceof SyntaxError) throw Object.assign(new Error(`PXD module JSON ${entry.path} is invalid.`), {
      code: "PXD_MODULE_JSON_INVALID"
    });
    throw cause;
  }
}
async function importPxdProject(bytes, options = {}) {
  assert(bytes.byteLength >= PXD_HEADER_BYTES, "PXD_TRUNCATED", "PXD project header is truncated.");
  for (let index = 0; index < PXD_MAGIC.length; index += 1) assert(bytes[index] === PXD_MAGIC[index], "PXD_MAGIC_INVALID", "PXD magic header is invalid.");
  assert(bytes[4] === PXD_PROJECT_ARCHIVE_VERSION, "PXD_VERSION_UNSUPPORTED", "Unsupported PXD project archive version.");
  const manifestLength = readUint32(bytes, 5, "PXD project manifest");
  const manifestStart = PXD_HEADER_BYTES;
  const payloadStart = manifestStart + manifestLength;
  assert(payloadStart <= bytes.byteLength, "PXD_TRUNCATED", "PXD project manifest is truncated.");
  let manifest;
  try {
    manifest = validateProjectManifest(JSON.parse(new TextDecoder().decode(bytes.subarray(manifestStart, payloadStart))));
  } catch (cause) {
    if (cause instanceof SyntaxError) throw Object.assign(new Error("PXD project manifest JSON is invalid."), {
      code: "PXD_MANIFEST_JSON_INVALID"
    });
    throw cause;
  }
  const manifestBase = {
    ...manifest
  };
  delete manifestBase.canonicalManifestHash;
  const actualManifestHash = await sha256BytesHex2(new TextEncoder().encode(canonicalJson(manifestBase)));
  assert(actualManifestHash === manifest.canonicalManifestHash, "PXD_MANIFEST_HASH_MISMATCH", "PXD project manifest hash does not match its contents.");
  for (const [index, packageManifest] of (manifest.assetPackages ?? []).entries()) {
    const verified = await verifyAssetPackageManifest(packageManifest);
    if (!verified.ok) {
      assert(false, "PXD_ASSET_PACKAGE_HASH_INVALID", `assetPackages[${index}] could not be verified: ${verified.reasons.join("; ")}`);
    }
  }
  const packageHash = await sha256BytesHex2(bytes);
  if (options.expectedPackageHash !== void 0) assert(packageHash === options.expectedPackageHash, "PXD_PACKAGE_HASH_MISMATCH", "PXD package hash does not match the expected hash.");
  const payloads = /* @__PURE__ */ new Map();
  let expectedOffset = 0;
  for (const entry of manifest.entries) {
    assert(entry.offset === expectedOffset, "PXD_ENTRY_OFFSET_INVALID", `PXD entry ${entry.path} is not in canonical payload order.`);
    const start = payloadStart + entry.offset;
    const end = start + entry.bytes;
    assert(end <= bytes.byteLength, "PXD_TRUNCATED", `PXD entry ${entry.path} is truncated.`);
    const entryBytes = bytes.slice(start, end);
    assert(await sha256BytesHex2(entryBytes) === entry.sha256, "PXD_ENTRY_HASH_MISMATCH", `PXD entry ${entry.path} hash does not match its contents.`);
    payloads.set(entry.path, entryBytes);
    expectedOffset += entry.bytes;
  }
  assert(payloadStart + expectedOffset === bytes.byteLength, "PXD_TRAILING_BYTES", "PXD project contains unexpected trailing bytes.");
  const assets = {};
  for (const entry of manifest.modules.draw.assets) {
    const rasterBytes = payloads.get(entry.path);
    assert(rasterBytes !== void 0, "PXD_ENTRY_MISSING", `PXD Draw entry ${entry.path} is missing.`);
    assert(await sha256BytesHex2(rasterBytes) === entry.sha256, "PXD_ASSET_HASH_MISMATCH", `PXD asset ${entry.assetId} hash does not match its contents.`);
    assert(assets[entry.assetId] === void 0, "PXD_ASSET_DUPLICATE", `PXD asset ${entry.assetId} is duplicated.`);
    assets[entry.assetId] = buildImportedAsset(entry, rasterBytes);
  }
  const primary = manifest.modules.draw.assets[0];
  assert(primary !== void 0, "PXD_ASSETS_EMPTY", "PXD project has no Draw asset.");
  const project = manifest.project;
  const created = createProject({
    projectId: manifest.projectId,
    name: project.name,
    width: primary.width,
    height: primary.height,
    tileSize: primary.tileSize,
    palette: primary.palette
  });
  const state = {
    ...created,
    structureEpoch: project.structureEpoch,
    activeAssetId: project.activeAssetId,
    activeLayerId: project.activeLayerId,
    activeFrameId: project.activeFrameId,
    activeCelId: project.activeCelId,
    layers: project.layers.map((layer) => ({
      ...layer
    })),
    frames: project.frames.map((frame) => ({
      ...frame
    })),
    cels: project.cels.map((cel) => ({
      ...cel
    })),
    timeline: {
      ...project.timeline,
      frameOrder: [
        ...project.timeline.frameOrder
      ],
      layerTrackOrder: [
        ...project.timeline.layerTrackOrder
      ]
    },
    tilemaps: project.tilemaps ?? {},
    assets,
    appliedCommandIds: [],
    lastClientSequenceByClient: {}
  };
  assert(state.assets[state.activeAssetId] !== void 0, "PXD_ACTIVE_ASSET_MISSING", "PXD active Draw asset is missing.");
  const audio = manifest.modules.audio.status === "EMPTY" || manifest.modules.audio.state === null ? null : {
    schemaVersion: manifest.modules.audio.schemaVersion,
    record: parseProjectJsonPayload(manifest.modules.audio.state, payloads),
    assets: manifest.modules.audio.assets.map((asset) => ({
      revisionId: asset.revisionId,
      mediaType: asset.mediaType,
      bytes: payloads.get(asset.path)
    }))
  };
  const game = manifest.modules.game.status === "EMPTY" || manifest.modules.game.state === null ? null : {
    schemaVersion: manifest.modules.game.schemaVersion,
    record: parseProjectJsonPayload(manifest.modules.game.state, payloads)
  };
  const assetDefinitions = manifest.assetDefinitions === void 0 ? [] : manifest.assetDefinitions;
  return {
    state,
    packageHash,
    manifestHash: manifest.canonicalManifestHash,
    manifest,
    assetDefinitions,
    drawTimelineMetadata: manifest.drawTimelineMetadata === void 0 ? normalizeDraw2TimelineMetadata(void 0, state.frames.length) : normalizeDraw2TimelineMetadata(manifest.drawTimelineMetadata, state.frames.length),
    productDefinitions: manifest.productDefinitions === void 0 ? [] : manifest.productDefinitions,
    assetPackages: manifest.assetPackages === void 0 ? [] : manifest.assetPackages,
    audio,
    game
  };
}

// src/game/game-300/core.ts
var GAME_CAMERA_2D_SETTINGS_SCHEMA_VERSION = 1;
function stableCameraReference(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value);
}
function isValidGameCamera2DSettings(value) {
  if (!isRecord3(value)) return false;
  const follow = value.follow;
  const shake = value.shake;
  if (!isRecord3(follow) || !isRecord3(shake)) return false;
  return value.schemaVersion === GAME_CAMERA_2D_SETTINGS_SCHEMA_VERSION && typeof value.pixelPerfect === "boolean" && Number.isSafeInteger(value.referenceWidth) && Number(value.referenceWidth) >= 1 && Number(value.referenceWidth) <= 8192 && Number.isSafeInteger(value.referenceHeight) && Number(value.referenceHeight) >= 1 && Number(value.referenceHeight) <= 8192 && Number.isSafeInteger(value.pixelsPerUnit) && Number(value.pixelsPerUnit) >= 1 && Number(value.pixelsPerUnit) <= 1024 && typeof follow.enabled === "boolean" && (follow.targetId === void 0 || stableCameraReference(follow.targetId)) && typeof follow.smoothing === "number" && Number.isFinite(follow.smoothing) && follow.smoothing >= 0 && follow.smoothing <= 2 && [
    "deadZoneX",
    "deadZoneY"
  ].every((key) => typeof follow[key] === "number" && Number.isFinite(follow[key]) && follow[key] >= 0 && follow[key] <= 64) && [
    "lookAheadX",
    "lookAheadY"
  ].every((key) => typeof follow[key] === "number" && Number.isFinite(follow[key]) && follow[key] >= -64 && follow[key] <= 64) && typeof shake.onDamage === "boolean" && typeof shake.strength === "number" && Number.isFinite(shake.strength) && shake.strength >= 0 && shake.strength <= 64 && typeof shake.durationMs === "number" && Number.isSafeInteger(shake.durationMs) && shake.durationMs >= 0 && shake.durationMs <= 1e4 && typeof shake.frequency === "number" && Number.isFinite(shake.frequency) && shake.frequency >= 1 && shake.frequency <= 120;
}
function isRecord3(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// src/game/game-350/camera-2d.ts
var DEFAULT_CAMERA_2D_SETTINGS = Object.freeze({
  schemaVersion: GAME_CAMERA_2D_SETTINGS_SCHEMA_VERSION,
  pixelPerfect: true,
  referenceWidth: 160,
  referenceHeight: 96,
  pixelsPerUnit: 16,
  follow: Object.freeze({
    enabled: true,
    targetId: "hero",
    smoothing: 0.12,
    deadZoneX: 1,
    deadZoneY: 0.75,
    lookAheadX: 0.5,
    lookAheadY: 0
  }),
  shake: Object.freeze({
    onDamage: true,
    strength: 0.5,
    durationMs: 160,
    frequency: 18
  })
});
function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function bounded(value, minimum, maximum, fallback) {
  return finite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}
function integerBounded(value, minimum, maximum, fallback) {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum ? Number(value) : fallback;
}
function record2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function stableId4(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value);
}
function normalizeCamera2DSettings(value, fallback = DEFAULT_CAMERA_2D_SETTINGS) {
  if (isValidGameCamera2DSettings(value)) {
    return {
      ...value,
      follow: {
        ...value.follow
      },
      shake: {
        ...value.shake
      }
    };
  }
  const source = record2(value);
  const sourceFollow = record2(source?.follow);
  const sourceShake = record2(source?.shake);
  const fallbackFollow = fallback.follow;
  const fallbackShake = fallback.shake;
  return {
    schemaVersion: GAME_CAMERA_2D_SETTINGS_SCHEMA_VERSION,
    pixelPerfect: typeof source?.pixelPerfect === "boolean" ? source.pixelPerfect : fallback.pixelPerfect,
    referenceWidth: integerBounded(source?.referenceWidth, 1, 8192, fallback.referenceWidth),
    referenceHeight: integerBounded(source?.referenceHeight, 1, 8192, fallback.referenceHeight),
    pixelsPerUnit: integerBounded(source?.pixelsPerUnit, 1, 1024, fallback.pixelsPerUnit),
    follow: {
      enabled: typeof sourceFollow?.enabled === "boolean" ? sourceFollow.enabled : fallbackFollow.enabled,
      ...stableId4(sourceFollow?.targetId) ? {
        targetId: sourceFollow.targetId
      } : fallbackFollow.targetId === void 0 ? {} : {
        targetId: fallbackFollow.targetId
      },
      smoothing: bounded(sourceFollow?.smoothing, 0, 2, fallbackFollow.smoothing),
      deadZoneX: bounded(sourceFollow?.deadZoneX, 0, 64, fallbackFollow.deadZoneX),
      deadZoneY: bounded(sourceFollow?.deadZoneY, 0, 64, fallbackFollow.deadZoneY),
      lookAheadX: bounded(sourceFollow?.lookAheadX, -64, 64, fallbackFollow.lookAheadX),
      lookAheadY: bounded(sourceFollow?.lookAheadY, -64, 64, fallbackFollow.lookAheadY)
    },
    shake: {
      onDamage: typeof sourceShake?.onDamage === "boolean" ? sourceShake.onDamage : fallbackShake.onDamage,
      strength: bounded(sourceShake?.strength, 0, 64, fallbackShake.strength),
      durationMs: integerBounded(sourceShake?.durationMs, 0, 1e4, fallbackShake.durationMs),
      frequency: bounded(sourceShake?.frequency, 1, 120, fallbackShake.frequency)
    }
  };
}

// src/game/game-350/authoring-model.ts
var GAME_SCENE_RULE_PRESETS = Object.freeze({
  NONE: 0,
  WEAK: 4.9,
  STANDARD: 9.8,
  STRONG: 19.6
});
var GAME_SCENE_RULE_LABELS = Object.freeze({
  NONE: "\u306A\u3057",
  WEAK: "\u5F31\u3044",
  STANDARD: "\u6A19\u6E96",
  STRONG: "\u5F37\u3044"
});
var GAME_RUNTIME_FAMILY_LABELS = Object.freeze({
  RPG_GRID: "RPG\u30FB\u30DE\u30B9\u79FB\u52D5",
  ACTION_PLATFORM: "2D\u30A2\u30AF\u30B7\u30E7\u30F3\u30FB\u7C21\u6613\u7269\u7406",
  SCROLL_SIDE: "2D\u30B9\u30AF\u30ED\u30FC\u30EB\u30FB\u6A2A\u79FB\u52D5",
  DODGE_ARENA: "\u6575\u3088\u3051\u30FB\u30A2\u30EA\u30FC\u30CA",
  FREE: "\u81EA\u7531\u5236\u4F5C\u30FB\u6700\u5C0F\u30EB\u30FC\u30EB"
});
var DEFAULT_RULE_FLAGS = {
  schemaVersion: 1,
  horizontalMove: true,
  verticalMove: true,
  jump: false,
  floorCollision: false,
  cameraFollow: true,
  mobileControls: true
};
function sceneRulesForRuntimeFamily(runtimeFamily) {
  switch (runtimeFamily) {
    case "RPG_GRID":
      return {
        ...DEFAULT_RULE_FLAGS,
        runtimeFamily,
        gravity: "NONE",
        horizontalMove: true,
        verticalMove: true
      };
    case "ACTION_PLATFORM":
      return {
        ...DEFAULT_RULE_FLAGS,
        runtimeFamily,
        gravity: "STANDARD",
        horizontalMove: true,
        verticalMove: false,
        jump: true,
        floorCollision: true
      };
    case "SCROLL_SIDE":
      return {
        ...DEFAULT_RULE_FLAGS,
        runtimeFamily,
        gravity: "STANDARD",
        horizontalMove: true,
        verticalMove: false,
        jump: true,
        floorCollision: true
      };
    case "DODGE_ARENA":
      return {
        ...DEFAULT_RULE_FLAGS,
        runtimeFamily,
        gravity: "NONE",
        horizontalMove: true,
        verticalMove: true,
        jump: false,
        floorCollision: false
      };
    case "FREE":
      return {
        ...DEFAULT_RULE_FLAGS,
        runtimeFamily,
        gravity: "NONE"
      };
  }
}

// src/game/game-350/genre-runtime.ts
var GAME_GENRE_RUNTIME_SCHEMA_VERSION = 1;
var POINT_ZERO = {
  x: 0,
  y: 0
};
var PLAYER_HALF_WIDTH = 0.35;
var PLAYER_HALF_HEIGHT = 0.35;
var JUMP_SPEED = 6;
var DEFAULT_MOVE_SPEED = 5;
var TOUCH_DISTANCE = 0.9;
var DODGE_SURVIVAL_SECONDS = 15;
var DODGE_SURVIVAL_TICKS = DODGE_SURVIVAL_SECONDS * 60;
var DODGE_MOVE_SPEED = 4.5;
var DODGE_ENEMY_SPEED = 0.045;
var DEFAULT_NPC_STATUS = {
  hp: 10,
  maxHp: 10,
  stamina: 10,
  maxStamina: 10,
  mp: 0,
  maxMp: 0,
  attack: 2,
  defense: 0,
  level: 1
};
var DEFAULT_PLAYER_STATUS = {
  hp: 10,
  maxHp: 10,
  stamina: 10,
  maxStamina: 10,
  mp: 0,
  maxMp: 0,
  attack: 2,
  defense: 1,
  level: 1
};
var COMBAT_TICK_INTERVAL = 30;
var BLOCK_REACH_DISTANCE = 1.4;
function point(x, y) {
  return {
    x,
    y
  };
}
function cellKey(x, y) {
  return `${x},${y}`;
}
function nearbyCellCandidates(playerPosition, world) {
  const cx = Math.floor(playerPosition.x);
  const cy = Math.floor(playerPosition.y);
  const candidates = [
    point(cx, cy),
    point(cx - 1, cy),
    point(cx + 1, cy),
    point(cx, cy - 1),
    point(cx, cy + 1)
  ].filter((cell) => cell.x >= 0 && cell.x < world.width && cell.y >= 0 && cell.y < world.height);
  return candidates.map((cell) => ({
    cell,
    // Compare against the cell's center, not its corner, for a fair
    // "which cell is actually closest to me" ordering.
    d: distance(playerPosition, point(cell.x + 0.5, cell.y + 0.5))
  })).filter(({ d }) => d <= BLOCK_REACH_DISTANCE).sort((a, b) => a.d - b.d).map(({ cell }) => cell);
}
function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}
function isDodgeEnemy(object) {
  const text = `${object.id} ${object.label}`.toLowerCase();
  return object.role === "NPC" || text.includes("enemy") || text.includes("\u6575");
}
function trackRole(track) {
  return track.role;
}
function trackStatus(track, fallback) {
  const status = track?.components?.find((component) => component.type === "STATUS");
  if (status?.type !== "STATUS" || !status.enabled) return fallback;
  const maxHp = Math.max(1, status.maxHp);
  const maxStamina = Math.max(0, status.maxStamina);
  const maxMp = Math.max(0, status.maxMp);
  return {
    hp: Math.max(0, Math.min(status.hp, maxHp)),
    maxHp,
    stamina: Math.max(0, Math.min(status.stamina, maxStamina)),
    maxStamina,
    mp: Math.max(0, Math.min(status.mp, maxMp)),
    maxMp,
    attack: Math.max(0, status.attack),
    defense: Math.max(0, status.defense),
    level: Math.max(1, Math.round(status.level))
  };
}
function trackBrainMode(track) {
  const brain = track?.components?.find((component) => component.type === "BRAIN");
  if (brain?.type !== "BRAIN" || !brain.enabled) return void 0;
  return {
    mode: brain.mode,
    speed: brain.speed,
    range: brain.range
  };
}
function stepBrain(object, playerPosition, world) {
  const brain = object.brain;
  if (brain === void 0) return object;
  if (brain.mode !== "PURSUE" && brain.mode !== "AVOID") return object;
  const dx = playerPosition.x - object.position.x;
  const dy = playerPosition.y - object.position.y;
  const length = Math.hypot(dx, dy);
  if (length <= 1e-3 || length > brain.range) return object;
  const speed = Math.max(0, brain.speed) * 0.01;
  const move = Math.min(speed, length);
  const direction = brain.mode === "PURSUE" ? 1 : -1;
  return {
    ...object,
    position: point(Math.min(world.width - PLAYER_HALF_WIDTH, Math.max(PLAYER_HALF_WIDTH, object.position.x + dx / length * move * direction)), Math.min(world.height - PLAYER_HALF_HEIGHT, Math.max(PLAYER_HALF_HEIGHT, object.position.y + dy / length * move * direction)))
  };
}
function applyContactCombat(playerStatus, playerPosition, objects) {
  let nextPlayerStatus = playerStatus;
  const nextObjects = [];
  for (const object of objects) {
    if (object.role !== "NPC" || object.status === void 0 || nextPlayerStatus.hp <= 0) {
      nextObjects.push(object);
      continue;
    }
    if (distance(playerPosition, object.position) > TOUCH_DISTANCE) {
      nextObjects.push(object);
      continue;
    }
    const damageToObject = Math.max(1, nextPlayerStatus.attack - object.status.defense);
    const damageToPlayer = Math.max(1, object.status.attack - nextPlayerStatus.defense);
    const objectHp = Math.max(0, object.status.hp - damageToObject);
    nextPlayerStatus = {
      ...nextPlayerStatus,
      hp: Math.max(0, nextPlayerStatus.hp - damageToPlayer)
    };
    if (objectHp <= 0) continue;
    nextObjects.push({
      ...object,
      status: {
        ...object.status,
        hp: objectHp
      }
    });
  }
  return {
    objects: nextObjects,
    playerStatus: nextPlayerStatus
  };
}
function trackPosition(track) {
  const transform = track.components?.find((component) => component.type === "TRANSFORM");
  return transform?.type === "TRANSFORM" ? point(transform.x, transform.y) : point(0, 0);
}
function trackCamera(track) {
  const camera = track?.components?.find((component) => component.type === "CAMERA");
  return camera?.type === "CAMERA" ? normalizeCamera2DSettings(camera.camera2D) : DEFAULT_CAMERA_2D_SETTINGS;
}
function mapFromTracks(tracks) {
  const mapTrack = tracks.find((track) => track.role === "TILEMAP" || track.kind === "TILEMAP");
  const tilemapComponent = mapTrack?.components?.find((component) => component.type === "TILEMAP");
  const document2 = mapTrack?.tilemap ?? (tilemapComponent?.type === "TILEMAP" ? tilemapComponent.document : void 0);
  const width = Math.max(8, document2?.width ?? 24);
  const height = Math.max(6, document2?.height ?? 10);
  const solidCells = document2?.cells.filter((cell) => cell.collision === "SOLID").map((cell) => point(cell.x, cell.y)) ?? Array.from({
    length: width
  }, (_, x) => point(x, height - 1));
  const blockTypeIds = {};
  for (const cell of document2?.cells ?? []) {
    if (cell.blockTypeId !== void 0) {
      blockTypeIds[`${cell.x},${cell.y}`] = cell.blockTypeId;
    }
  }
  return {
    width,
    height,
    solidCells,
    blockTypeIds
  };
}
function objectById(state, id) {
  if (id === void 0 || id === state.playerId) {
    return id === state.playerId ? {
      id: state.playerId,
      label: "\u4E3B\u4EBA\u516C",
      role: "PLAYER",
      position: state.playerPosition
    } : void 0;
  }
  return state.objects.find((object) => object.id === id);
}
function targetPosition(state, card) {
  if (card.targetTrackId !== void 0) {
    return objectById(state, card.targetTrackId)?.position;
  }
  if (card.condition === "REACH_GOAL") {
    return state.objects.find((object) => object.role === "TRIGGER" && object.id.toLowerCase().includes("goal"))?.position;
  }
  return void 0;
}
function cardIsNearTarget(state, card) {
  if (card.condition === "HAS_ITEM") {
    const have = state.inventory[card.itemId ?? ""] ?? 0;
    return have >= Math.max(1, card.amount ?? 1);
  }
  const target = targetPosition(state, card);
  if (target !== void 0 && card.condition === "REACH_GOAL" && state.runtimeFamily === "SCROLL_SIDE") {
    return state.playerPosition.x >= target.x - TOUCH_DISTANCE;
  }
  return target === void 0 || distance(state.playerPosition, target) <= TOUCH_DISTANCE;
}
function addToInventory(inventory, itemId, amount) {
  const next = Math.max(0, (inventory[itemId] ?? 0) + amount);
  return {
    ...inventory,
    [itemId]: next
  };
}
function craftRecipe(inventory, recipes, recipeId) {
  const recipe = recipes.find((candidate) => candidate.recipeId === recipeId);
  if (recipe === void 0) return inventory;
  const canCraft = recipe.ingredients.every((ingredient) => (inventory[ingredient.itemId] ?? 0) >= ingredient.amount);
  if (!canCraft) return inventory;
  let next = inventory;
  for (const ingredient of recipe.ingredients) {
    next = addToInventory(next, ingredient.itemId, -ingredient.amount);
  }
  return addToInventory(next, recipe.result.itemId, recipe.result.amount);
}
function applyEventCard(state, card) {
  if (!card.enabled) return state;
  switch (card.action) {
    case "DAMAGE": {
      const damaged = state.health - Math.max(0, card.amount ?? 1);
      return {
        ...state,
        health: Math.max(0, damaged),
        gameOver: damaged <= 0,
        cameraShakeFrames: Math.max(state.cameraShakeFrames, state.camera2D.shake.onDamage ? 8 : 0)
      };
    }
    case "SHAKE_CAMERA":
      return {
        ...state,
        cameraShakeFrames: Math.max(state.cameraShakeFrames, 8)
      };
    case "SHOW_DIALOGUE":
      return {
        ...state,
        dialogue: card.message?.trim() || "\u30A4\u30D9\u30F3\u30C8\u304C\u8D77\u3053\u308A\u307E\u3057\u305F\u3002"
      };
    case "PLAY_AUDIO":
      return {
        ...state,
        lastAudioTrackId: card.audioTrackId ?? card.targetTrackId ?? null
      };
    case "COMPLETE_SCENE":
      return {
        ...state,
        sceneComplete: true
      };
    case "SET_VARIABLE":
      return {
        ...state,
        variables: {
          ...state.variables,
          state: card.message?.trim() || true
        }
      };
    case "GIVE_ITEM":
      if (card.itemId === void 0) return state;
      return {
        ...state,
        inventory: addToInventory(state.inventory, card.itemId, Math.max(1, card.amount ?? 1))
      };
    case "TAKE_ITEM":
      if (card.itemId === void 0) return state;
      return {
        ...state,
        inventory: addToInventory(state.inventory, card.itemId, -Math.max(1, card.amount ?? 1))
      };
    case "CRAFT_ITEM":
      return {
        ...state,
        inventory: craftRecipe(state.inventory, state.recipes, card.recipeId)
      };
    case "BREAK_BLOCK": {
      for (const cell of nearbyCellCandidates(state.playerPosition, state.world)) {
        const key = cellKey(cell.x, cell.y);
        const blockTypeId = state.world.blockTypeIds[key];
        if (blockTypeId === void 0) continue;
        const blockType = state.blockTypes.find((candidate) => candidate.blockTypeId === blockTypeId);
        if (blockType === void 0 || !blockType.breakable) continue;
        const nextBlockTypeIds = {
          ...state.world.blockTypeIds
        };
        delete nextBlockTypeIds[key];
        return {
          ...state,
          world: {
            ...state.world,
            blockTypeIds: nextBlockTypeIds,
            solidCells: state.world.solidCells.filter((solid) => !(solid.x === cell.x && solid.y === cell.y))
          },
          inventory: blockType.dropItemId === void 0 ? state.inventory : addToInventory(state.inventory, blockType.dropItemId, 1)
        };
      }
      return state;
    }
    case "PLACE_BLOCK": {
      if (card.blockTypeId === void 0 || card.itemId === void 0) {
        return state;
      }
      const blockType = state.blockTypes.find((candidate) => candidate.blockTypeId === card.blockTypeId);
      if (blockType === void 0 || !blockType.placeable || (state.inventory[card.itemId] ?? 0) < 1) {
        return state;
      }
      const playerCellX = Math.floor(state.playerPosition.x);
      const playerCellY = Math.floor(state.playerPosition.y);
      for (const cell of nearbyCellCandidates(state.playerPosition, state.world)) {
        if (cell.x === playerCellX && cell.y === playerCellY) continue;
        const key = cellKey(cell.x, cell.y);
        if (state.world.blockTypeIds[key] !== void 0) continue;
        return {
          ...state,
          world: {
            ...state.world,
            blockTypeIds: {
              ...state.world.blockTypeIds,
              [key]: card.blockTypeId
            },
            solidCells: [
              ...state.world.solidCells,
              cell
            ]
          },
          inventory: addToInventory(state.inventory, card.itemId, -1)
        };
      }
      return state;
    }
  }
}
function cameraOriginFor(playerPosition, camera2D, world) {
  const pixelsPerUnit = Math.max(1, camera2D.pixelsPerUnit);
  const viewportWidth = Math.max(1, camera2D.referenceWidth / pixelsPerUnit);
  const viewportHeight = Math.max(1, camera2D.referenceHeight / pixelsPerUnit);
  const x = camera2D.follow.enabled ? playerPosition.x - viewportWidth / 2 + camera2D.follow.lookAheadX : 0;
  const y = camera2D.follow.enabled ? playerPosition.y - viewportHeight / 2 + camera2D.follow.lookAheadY : 0;
  const clampedX = Math.min(Math.max(0, world.width - viewportWidth), Math.max(0, x));
  const clampedY = Math.min(Math.max(0, world.height - viewportHeight), Math.max(0, y));
  const quantum = 1 / pixelsPerUnit;
  return point(camera2D.pixelPerfect ? Math.round(clampedX / quantum) * quantum : clampedX, camera2D.pixelPerfect ? Math.round(clampedY / quantum) * quantum : clampedY);
}
function initialEventState(state) {
  let next = state;
  const firedEventIds = [];
  for (const card of state.eventCards) {
    if (card.enabled && card.condition === "START") {
      next = applyEventCard(next, card);
      firedEventIds.push(card.eventId);
    }
  }
  return {
    ...next,
    firedEventIds
  };
}
function processEventCards(state, input) {
  let next = state;
  const activeEventIds = [];
  const firedEventIds = [
    ...state.firedEventIds
  ];
  for (const card of state.eventCards) {
    if (!card.enabled || card.condition === "START") continue;
    const near = cardIsNearTarget(next, card);
    const inputTriggered = card.condition === "TAP" ? input.tap === true : card.condition === "INTERACT" ? input.interact === true : false;
    const rangeTriggered = card.condition === "TOUCH" || card.condition === "ENTER_RANGE" || card.condition === "REACH_GOAL" || card.condition === "HAS_ITEM";
    const triggered = rangeTriggered ? near : inputTriggered && near;
    if (!triggered) continue;
    if (rangeTriggered) activeEventIds.push(card.eventId);
    const edgeTriggered = rangeTriggered ? !state.activeEventIds.includes(card.eventId) : true;
    const oneShot = card.condition === "REACH_GOAL";
    if (edgeTriggered && (!oneShot || !firedEventIds.includes(card.eventId))) {
      next = applyEventCard(next, card);
      if (oneShot) firedEventIds.push(card.eventId);
    }
  }
  return {
    ...next,
    activeEventIds,
    firedEventIds
  };
}
function landingY(state, x, previousY, nextY) {
  if (!state.rules.floorCollision || nextY < previousY) return void 0;
  let best;
  for (const cell of state.world.solidCells) {
    if (Math.abs(cell.x - x) > 0.8) continue;
    const surface = cell.y - PLAYER_HALF_HEIGHT;
    if (surface < previousY - 0.05 || nextY < surface) continue;
    if (best === void 0 || surface < best) best = surface;
  }
  return best;
}
function stepMovement(state, input) {
  if (state.runtimeFamily === "DODGE_ARENA") {
    const directionX = (input.right === true ? 1 : 0) - (input.left === true ? 1 : 0);
    const directionY = (input.down === true ? 1 : 0) - (input.up === true || input.jump === true ? 1 : 0);
    const magnitude = Math.hypot(directionX, directionY) || 1;
    const velocityX2 = directionX / magnitude * DODGE_MOVE_SPEED;
    const velocityY2 = directionY / magnitude * DODGE_MOVE_SPEED;
    return {
      playerPosition: point(Math.min(state.world.width - PLAYER_HALF_WIDTH, Math.max(PLAYER_HALF_WIDTH, state.playerPosition.x + velocityX2 / 60)), Math.min(state.world.height - PLAYER_HALF_HEIGHT, Math.max(PLAYER_HALF_HEIGHT, state.playerPosition.y + velocityY2 / 60))),
      velocity: point(velocityX2, velocityY2),
      grounded: true
    };
  }
  const direction = (input.right === true ? 1 : 0) - (input.left === true ? 1 : 0);
  const speed = DEFAULT_MOVE_SPEED;
  const velocityX = state.rules.horizontalMove ? direction * speed : 0;
  const jump = input.jump === true && state.grounded && state.rules.jump;
  const gravity = GAME_SCENE_RULE_PRESETS[state.rules.gravity];
  const velocityY = state.rules.gravity === "NONE" ? 0 : jump ? -JUMP_SPEED : state.velocity.y + gravity / 60;
  const previous = state.playerPosition;
  let x = previous.x + velocityX / 60;
  let y = previous.y + velocityY / 60;
  x = Math.min(state.world.width - PLAYER_HALF_WIDTH, Math.max(PLAYER_HALF_WIDTH, x));
  const floor = landingY(state, x, previous.y, y);
  const grounded = floor !== void 0;
  if (floor !== void 0) y = floor;
  y = Math.min(state.world.height + 2, Math.max(-2, y));
  return {
    playerPosition: point(x, y),
    velocity: point(velocityX, floor === void 0 ? velocityY : 0),
    grounded
  };
}
function familyForProject(project) {
  const family = project.editorTimeline?.sceneRules?.runtimeFamily;
  if (family === "ACTION_PLATFORM" || family === "DODGE_ARENA" || family === "SCROLL_SIDE") return family;
  if (project.editorTimeline?.creationMode === "DODGE_2D") {
    return "DODGE_ARENA";
  }
  if (project.editorTimeline?.creationMode === "SCROLL_2D") {
    return "SCROLL_SIDE";
  }
  return "ACTION_PLATFORM";
}
function createGameGenreRuntime(project) {
  const family = familyForProject(project);
  const fallbackRules = sceneRulesForRuntimeFamily(family);
  const rules = project.editorTimeline?.sceneRules ?? fallbackRules;
  const tracks = project.editorTimeline?.tracks ?? [];
  const player = tracks.find((track) => track.role === "PLAYER") ?? tracks.find((track) => track.trackId === "hero");
  const playerId = player?.trackId ?? "hero";
  const world = mapFromTracks(tracks);
  const cameraTrack = tracks.find((track) => track.role === "CAMERA");
  const camera2D = trackCamera(cameraTrack);
  const objects = tracks.filter((track) => track.trackId !== playerId).filter((track) => track.active !== false).map((track) => {
    const role = trackRole(track);
    const brain = trackBrainMode(track);
    return {
      id: track.trackId,
      label: track.label,
      role,
      position: trackPosition(track),
      ...role === "NPC" ? {
        status: trackStatus(track, DEFAULT_NPC_STATUS)
      } : {},
      ...brain === void 0 ? {} : {
        brain
      }
    };
  });
  const state = {
    schemaVersion: GAME_GENRE_RUNTIME_SCHEMA_VERSION,
    projectId: project.projectId,
    runtimeFamily: family,
    rules,
    mode: "STOPPED",
    tick: 0,
    playerId,
    playerPosition: trackPosition(player ?? {
      trackId: playerId,
      label: "\u4E3B\u4EBA\u516C",
      kind: "SPRITE",
      activeFrames: []
    }),
    velocity: POINT_ZERO,
    grounded: false,
    health: 3,
    playerStatus: trackStatus(player, DEFAULT_PLAYER_STATUS),
    survivalSeconds: 0,
    gameOver: false,
    camera2D,
    cameraOrigin: cameraOriginFor(point(1, 1), camera2D, world),
    cameraShakeFrames: 0,
    world,
    objects,
    eventCards: project.editorTimeline?.eventCards ?? [],
    activeEventIds: [],
    firedEventIds: [],
    dialogue: null,
    lastAudioTrackId: null,
    sceneComplete: false,
    variables: {},
    inventory: {},
    recipes: project.editorTimeline?.recipes ?? [],
    blockTypes: project.editorTimeline?.blockTypes ?? []
  };
  return initialEventState(state);
}
function playGameGenre(state) {
  return {
    ...state,
    mode: "PLAYING",
    dialogue: null
  };
}
function stepGameGenre(state, input = {}) {
  if (state.mode !== "PLAYING" || state.gameOver || state.sceneComplete) return state;
  const chasedObjects = state.runtimeFamily === "DODGE_ARENA" ? state.objects.map((object) => {
    if (object.brain !== void 0 || !isDodgeEnemy(object)) return object;
    const dx = state.playerPosition.x - object.position.x;
    const dy = state.playerPosition.y - object.position.y;
    const length = Math.hypot(dx, dy);
    if (length <= 1e-3) return object;
    const move = Math.min(DODGE_ENEMY_SPEED, length);
    return {
      ...object,
      position: point(Math.min(state.world.width - PLAYER_HALF_WIDTH, Math.max(PLAYER_HALF_WIDTH, object.position.x + dx / length * move)), Math.min(state.world.height - PLAYER_HALF_HEIGHT, Math.max(PLAYER_HALF_HEIGHT, object.position.y + dy / length * move)))
    };
  }) : state.objects;
  const brainObjects = chasedObjects.map((object) => stepBrain(object, state.playerPosition, state.world));
  const movement = stepMovement(state, input);
  const combat = (state.tick + 1) % COMBAT_TICK_INTERVAL === 0 ? applyContactCombat(state.playerStatus, movement.playerPosition, brainObjects) : {
    objects: brainObjects,
    playerStatus: state.playerStatus
  };
  const nextBase = {
    ...state,
    tick: state.tick + 1,
    objects: combat.objects,
    playerStatus: combat.playerStatus,
    playerPosition: movement.playerPosition,
    velocity: movement.velocity,
    grounded: movement.grounded,
    survivalSeconds: state.runtimeFamily === "DODGE_ARENA" ? Math.floor((state.tick + 1) / 60) : state.survivalSeconds,
    cameraOrigin: cameraOriginFor(movement.playerPosition, state.camera2D, state.world),
    cameraShakeFrames: Math.max(0, state.cameraShakeFrames - 1),
    dialogue: input.interact === true || input.tap === true ? null : state.dialogue,
    gameOver: state.gameOver || combat.playerStatus.hp <= 0
  };
  const eventState = processEventCards(nextBase, input);
  if (eventState.runtimeFamily === "DODGE_ARENA" && eventState.tick >= DODGE_SURVIVAL_TICKS && !eventState.gameOver) {
    return {
      ...eventState,
      sceneComplete: true
    };
  }
  return eventState;
}

// src/game/game-350/igame-browser-runtime.ts
function record3(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function gameProjectFrom(imported) {
  const candidate = record3(record3(imported.game?.record).canonicalProject);
  const timeline = record3(candidate.editorTimeline);
  if (candidate.schemaVersion !== 1 || typeof candidate.projectId !== "string" || !Array.isArray(candidate.scenes) || !Array.isArray(candidate.prefabs) || !Array.isArray(candidate.dependencies) || !Array.isArray(candidate.behaviors) || !Array.isArray(timeline.tracks)) {
    throw new Error("PXD\u306B\u518D\u751F\u53EF\u80FD\u306AGame Project\u304C\u542B\u307E\u308C\u3066\u3044\u307E\u305B\u3093\u3002");
  }
  return candidate;
}
function assetIdByDefinition(imported, definitionId) {
  if (!definitionId) return void 0;
  const definition = imported.assetDefinitions.find((entry) => entry.definitionId === definitionId);
  const identity = record3(definition?.registryIdentity);
  return typeof identity.assetId === "string" ? identity.assetId : definitionId;
}
function assetIdForTrack(project, imported, trackId) {
  const animation = project.editorTimeline?.animationBindings?.find((binding2) => binding2.trackId === trackId);
  const animationAsset = assetIdByDefinition(imported, animation?.assetDefinitionId);
  if (animationAsset) return animationAsset;
  const binding = project.editorTimeline?.assetBindings?.find((candidate) => candidate.trackId === trackId && candidate.kind === "DRAW");
  return binding?.assetId;
}
function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const width = Math.max(320, Math.floor(rect.width * ratio));
  const height = Math.max(180, Math.floor(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return {
    width,
    height
  };
}
function drawRaster(context, asset, x, y, width, height) {
  const pixels = asset.raster.toUint8Array();
  const image = new ImageData(asset.width, asset.height);
  for (let index = 0; index < pixels.length; index += 1) {
    const paletteIndex = pixels[index] ?? 0;
    const color = asset.palette[paletteIndex] ?? 0;
    const offset = index * 4;
    image.data[offset] = color >>> 16 & 255;
    image.data[offset + 1] = color >>> 8 & 255;
    image.data[offset + 2] = color & 255;
    image.data[offset + 3] = paletteIndex === 0 ? 0 : color >>> 24 & 255;
  }
  const offscreen = document.createElement("canvas");
  offscreen.width = asset.width;
  offscreen.height = asset.height;
  offscreen.getContext("2d")?.putImageData(image, 0, 0);
  context.imageSmoothingEnabled = false;
  context.drawImage(offscreen, x, y, width, height);
}
function renderBrowserGame(canvas, state, source, assetByTrack) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D Runtime\u3092\u521D\u671F\u5316\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
  const { width, height } = resizeCanvas(canvas);
  const game = state.game;
  const worldWidth = Math.max(8, game.world.width);
  const worldHeight = Math.max(6, game.world.height);
  const viewWidth = Math.max(8, Math.min(worldWidth, game.camera2D.referenceWidth / Math.max(1, game.camera2D.pixelsPerUnit)));
  const viewHeight = Math.max(6, Math.min(worldHeight, game.camera2D.referenceHeight / Math.max(1, game.camera2D.pixelsPerUnit)));
  const left = Math.max(0, Math.min(worldWidth - viewWidth, game.playerPosition.x - viewWidth / 2));
  const top = Math.max(0, Math.min(worldHeight - viewHeight, game.playerPosition.y - viewHeight / 2));
  const sx = width / viewWidth;
  const sy = height / viewHeight;
  const toCanvasX = (value) => (value - left) * sx;
  const toCanvasY = (value) => (value - top) * sy;
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#142642");
  gradient.addColorStop(1, "#07101c");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(142, 190, 229, 0.12)";
  context.lineWidth = 1;
  for (let x = Math.floor(left); x <= left + viewWidth; x += 1) {
    context.beginPath();
    context.moveTo(toCanvasX(x), 0);
    context.lineTo(toCanvasX(x), height);
    context.stroke();
  }
  for (let y = Math.floor(top); y <= top + viewHeight; y += 1) {
    context.beginPath();
    context.moveTo(0, toCanvasY(y));
    context.lineTo(width, toCanvasY(y));
    context.stroke();
  }
  const drawEntity = (trackId, x, y, isPlayer) => {
    const assetId = assetByTrack.get(trackId);
    const asset = assetId ? source.draw.assets[assetId] : void 0;
    const entitySize = Math.max(0.6, Math.min(1.8, isPlayer ? 1 : 0.9));
    const canvasX = toCanvasX(x - entitySize / 2);
    const canvasY = toCanvasY(y - entitySize / 2);
    const canvasSize = Math.max(8, entitySize * Math.min(sx, sy));
    if (asset) {
      const ratio = asset.width / Math.max(1, asset.height);
      const drawHeight = canvasSize;
      const drawWidth = drawHeight * ratio;
      drawRaster(context, asset, canvasX - (drawWidth - canvasSize) / 2, canvasY, drawWidth, drawHeight);
      return;
    }
    context.fillStyle = isPlayer ? "#7fe6d4" : "#ff7997";
    context.fillRect(canvasX, canvasY, canvasSize, canvasSize);
    context.fillStyle = "rgba(255,255,255,0.7)";
    context.fillRect(canvasX + canvasSize * 0.25, canvasY + canvasSize * 0.2, canvasSize * 0.16, canvasSize * 0.16);
    context.fillRect(canvasX + canvasSize * 0.6, canvasY + canvasSize * 0.2, canvasSize * 0.16, canvasSize * 0.16);
  };
  for (const cell of game.world.solidCells) {
    const canvasX = toCanvasX(cell.x);
    const canvasY = toCanvasY(cell.y);
    const cellWidth = Math.max(1, sx);
    const cellHeight = Math.max(1, sy);
    context.fillStyle = "rgba(102, 149, 193, 0.42)";
    context.fillRect(canvasX, canvasY, cellWidth, cellHeight);
  }
  for (const object of game.objects) drawEntity(object.id, object.position.x, object.position.y, false);
  drawEntity(game.playerId, game.playerPosition.x, game.playerPosition.y, true);
  context.fillStyle = "rgba(4, 9, 17, 0.72)";
  context.fillRect(12, 12, Math.min(330, width - 24), 52);
  context.fillStyle = "#eef4ff";
  context.font = `${Math.max(12, Math.floor(Math.min(width, height) / 48))}px system-ui, sans-serif`;
  context.fillText(source.project.name, 24, 34);
  context.fillStyle = "#a8b6ca";
  context.fillText(`HP ${game.health}  \u2022  ${game.runtimeFamily}  \u2022  ${Math.floor(state.animationTick / 60)}s`, 24, 52);
}
function inputFromKeys(keys) {
  return {
    left: keys.has("ArrowLeft") || keys.has("a") || keys.has("A"),
    right: keys.has("ArrowRight") || keys.has("d") || keys.has("D"),
    up: keys.has("ArrowUp") || keys.has("w") || keys.has("W"),
    down: keys.has("ArrowDown") || keys.has("s") || keys.has("S"),
    jump: keys.has(" ") || keys.has("z") || keys.has("Z"),
    attack: keys.has("x") || keys.has("X")
  };
}
function sourceAssetMap(project, imported) {
  const map = /* @__PURE__ */ new Map();
  for (const track of project.editorTimeline?.tracks ?? []) {
    const assetId = assetIdForTrack(project, imported, track.trackId);
    if (assetId) map.set(track.trackId, assetId);
  }
  return map;
}
function mountBrowserGame(context, source) {
  const shell = document.createElement("div");
  shell.className = "igame-browser-runtime";
  const canvas = document.createElement("canvas");
  canvas.className = "igame-browser-runtime__canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "iGAME\u30D7\u30EC\u30A4\u753B\u9762");
  const hint = document.createElement("p");
  hint.className = "igame-browser-runtime__hint";
  hint.textContent = "\u77E2\u5370\u30AD\u30FC / WASD\u3067\u79FB\u52D5\u3000Z\u3067\u30B8\u30E3\u30F3\u30D7\u3000X\u3067\u653B\u6483\u3000Esc\u3067\u505C\u6B62";
  shell.append(canvas, hint);
  context.root.replaceChildren(shell);
  const keys = /* @__PURE__ */ new Set();
  const assetMap = sourceAssetMap(source.project, source.imported);
  let state = {
    game: playGameGenre(createGameGenreRuntime(source.project)),
    animationTick: 0
  };
  let frameHandle = 0;
  let stopped = false;
  const onKeyDown = (event) => {
    if ([
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      " ",
      "z",
      "Z",
      "x",
      "X",
      "Escape"
    ].includes(event.key)) {
      event.preventDefault();
    }
    if (event.key === "Escape") {
      void context.requestStop();
      return;
    }
    keys.add(event.key);
  };
  const onKeyUp = (event) => {
    keys.delete(event.key);
  };
  const onResize = () => renderBrowserGame(canvas, state, source, assetMap);
  const tick = () => {
    if (stopped) return;
    state = {
      game: stepGameGenre(state.game, inputFromKeys(keys)),
      animationTick: state.animationTick + 1
    };
    renderBrowserGame(canvas, state, source, assetMap);
    frameHandle = window.requestAnimationFrame(tick);
  };
  window.addEventListener("keydown", onKeyDown, {
    passive: false
  });
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("resize", onResize);
  canvas.focus({
    preventScroll: true
  });
  tick();
  return {
    dispose: () => {
      stopped = true;
      window.cancelAnimationFrame(frameHandle);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      context.root.replaceChildren();
    }
  };
}
async function createIGameBrowserRuntimeSource(bootstrap, packageBytes) {
  const imported = await importPxdProject(packageBytes, {
    expectedPackageHash: bootstrap.package.sha256
  });
  const project = gameProjectFrom(imported);
  if (project.projectId !== bootstrap.manifest.projectId) {
    throw new Error("\u516C\u958BGame\u306EProject ID\u304CManifest\u3068\u4E00\u81F4\u3057\u307E\u305B\u3093\u3002");
  }
  const data = {
    project,
    draw: imported.state,
    imported
  };
  const launch = createIGameRuntimeLaunchConfig({
    title: bootstrap.manifest.title,
    subtitle: "\u516C\u958BRevision\u3092\u78BA\u8A8D\u3057\u307E\u3057\u305F\u3002START\u3067Game\u3092\u958B\u59CB\u3057\u307E\u3059\u3002",
    startSceneId: project.editorTimeline?.tracks[0]?.trackId || "scene-start",
    startLabel: "START"
  });
  return {
    manifest: bootstrap.manifest,
    proof: bootstrap.proof,
    launch,
    mount: async (context) => mountBrowserGame(context, data)
  };
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
function publicSupabaseConfig() {
  const supplied = window.__PIXIEED_SUPABASE_CONFIG__;
  return {
    url: typeof supplied?.url === "string" && supplied.url.trim() ? supplied.url.trim() : "https://kyyiuakrqomzlikfaire.supabase.co",
    publishableKey: typeof supplied?.publishableKey === "string" && supplied.publishableKey.trim() ? supplied.publishableKey.trim() : "sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4"
  };
}
async function publicRegistryRuntimeSource(productId) {
  const host = window;
  const client = host.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__ ?? await host.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__;
  if (!client) throw new Error("\u516C\u958BGame\u3092\u518D\u751F\u3059\u308B\u306B\u306FPiXiEED\u3078\u306E\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059\u3002");
  const sessionResult = await client.auth.getSession();
  const session = sessionResult.data?.session;
  const accessToken = session?.access_token;
  const principalId = session?.user?.id;
  if (!accessToken || !principalId) throw new Error("\u516C\u958BGame\u3092\u518D\u751F\u3059\u308B\u306B\u306FPiXiEED\u3078\u306E\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059\u3002");
  const config = publicSupabaseConfig();
  const response = await fetch(`${config.url.replace(/\/+$/u, "")}/functions/v1/igame-player-bootstrap`, {
    method: "POST",
    headers: {
      apikey: config.publishableKey,
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      product_id: productId
    }),
    credentials: "omit",
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload && typeof payload === "object" && !Array.isArray(payload) && typeof payload.error === "string" ? String(payload.error) : "\u516C\u958BGame\u3092\u6E96\u5099\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002";
    throw new Error(message);
  }
  const bootstrap = parseIGamePublicBootstrap(payload, principalId);
  const packageBytes = await fetchIGamePublicPackage(bootstrap);
  return {
    source: await createIGameBrowserRuntimeSource(bootstrap, packageBytes),
    principalId
  };
}
async function mountIGamePlayer(root = document) {
  const elements = elementsFor(root);
  const productId = new URLSearchParams(window.location.search).get("product")?.trim() || "";
  let source = runtimeSourceFromWindow();
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
  if (productId) {
    elements.startTitle.textContent = "\u516C\u958BGame\u3092\u6E96\u5099\u4E2D";
    elements.startSubtitle.textContent = "Market\u306E\u6A29\u5229\u3068\u516C\u958BRevision\u3092\u78BA\u8A8D\u3057\u3066\u3044\u307E\u3059\u3002";
    elements.accessStatus.textContent = "\u516C\u958BGame\u3092\u78BA\u8A8D\u3057\u3066\u3044\u307E\u3059\u3002";
    elements.startButton.disabled = true;
  } else {
    setStartContent(elements, source);
  }
  const requestStop = async () => {
    await runtimeHandle?.dispose?.();
    runtimeHandle = void 0;
    launchState = stopIGameRuntime(launchState);
    renderPhase(elements, launchState);
    elements.runtimeStatus.textContent = "Game Runtime\u3092\u505C\u6B62\u3057\u307E\u3057\u305F\u3002";
  };
  const finishBrandSplash = async () => {
    if (launchState.phase !== "BRAND_SPLASH") return;
    launchState = completeIGameBrandSplash(launchState);
    renderPhase(elements, launchState);
    let principalId;
    try {
      if (productId) {
        const loaded = await publicRegistryRuntimeSource(productId);
        source = loaded.source;
        principalId = loaded.principalId;
        setStartContent(elements, source);
      }
      if (source === void 0) return;
      access = resolveIGamePlayerAccess({
        manifest: source.manifest,
        source: productId || new URLSearchParams(window.location.search).get("source") === "registry" ? "SERVER_AUTHORITY" : "LOCAL_PREVIEW",
        ...principalId === void 0 ? {} : {
          principalId
        },
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
    } catch (error) {
      elements.startButton.disabled = true;
      showError(elements, error instanceof Error ? error.message : "\u516C\u958BGame\u3092\u6E96\u5099\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
    }
  };
  window.setTimeout(() => void finishBrandSplash(), PIXIEED_BRAND_SPLASH_DURATION_MS);
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
