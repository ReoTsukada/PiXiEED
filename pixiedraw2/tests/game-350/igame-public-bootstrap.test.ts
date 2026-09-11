import {
  fetchIGamePublicPackage,
  parseIGamePublicBootstrap,
  sha256BytesHex,
} from "../../src/game/game-350/igame-public-bootstrap.ts";
import { createIGameBrowserRuntimeSource } from "../../src/game/game-350/igame-browser-runtime.ts";
import { createProject } from "../../src/draw2-core.ts";
import { exportPxdProject } from "../../src/draw2-export.ts";
import { createGame351RpgTemplate } from "../../src/game/game-350/playable-slice.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function proof(productId: string, revisionId: string, principalId: string) {
  const now = Date.now();
  return {
    schemaVersion: 1,
    proofType: "AUTHORIZATION_PROOF",
    source: "server",
    decision: "allow",
    authorityId: "pixieed-market-player",
    proofId: "proof-1",
    principalId,
    resourceType: "igame-product",
    resourceId: productId,
    action: "play",
    capability: "game.play",
    tenantId: "pixieed-market",
    correlationId: `${productId}:${revisionId}`,
    policyVersion: "authorization-policy-v1",
    grantId: "grant-1",
    issuedAt: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
  } as const;
}

async function fixture() {
  const bytes = new TextEncoder().encode("verified-pxd-fixture");
  const packageHash = await sha256BytesHex(bytes);
  return {
    schema: "pixieed-igame-player-bootstrap/v1",
    product: { id: "game-product-1", title: "公開Game" },
    revision: {
      id: "game-revision-1",
      number: 1,
      content_hash: packageHash,
      package_hash: "b".repeat(64),
    },
    manifest: {
      schemaVersion: 1,
      productId: "game-product-1",
      projectId: "game-project-1",
      revisionId: "game-revision-1",
      ownerId: "owner-1",
      tenantId: "pixieed-market",
      title: "公開Game",
      runtimeProfileId: "top-down-rpg",
      runtimeVersion: "game-runtime-1",
      sourceAuthority: "REGISTRY",
      editAuthority: "NONE",
      assetAuthority: "READ_ONLY",
    },
    package: {
      url: "https://storage.example.test/game.pxd",
      sha256: packageHash,
      mime_type: "application/vnd.pixieed.pxd",
      expires_in: 60,
    },
    proof: proof("game-product-1", "game-revision-1", "buyer-1"),
  } as const;
}

Deno.test("GAME350-PUBLIC-001 binds product, revision, package and play proof", async () => {
  const parsed = parseIGamePublicBootstrap(await fixture(), "buyer-1");
  assert(parsed.manifest.productId === "game-product-1", "product must be preserved");
  assert(parsed.manifest.revisionId === "game-revision-1", "revision must be preserved");
  assert(parsed.proof.grantId === "grant-1", "server grant must be preserved");
});

Deno.test("GAME350-PUBLIC-002 rejects identity drift and package tampering", async () => {
  const value = await fixture();
  const drifted = structuredClone(value) as Record<string, unknown>;
  (drifted.manifest as Record<string, unknown>).productId = "other-product";
  let rejected = false;
  try {
    parseIGamePublicBootstrap(drifted, "buyer-1");
  } catch {
    rejected = true;
  }
  assert(rejected, "manifest identity drift must be rejected");

  const tampered = await fixture();
  const bytes = new TextEncoder().encode("tampered");
  let fetchRejected = false;
  try {
    await fetchIGamePublicPackage(tampered, async () =>
      new Response(bytes, { status: 200 }));
  } catch {
    fetchRejected = true;
  }
  assert(fetchRejected, "package bytes that do not match the signed hash must stop");
});

Deno.test("GAME350-PUBLIC-003 imports an integrated PXD and prepares the browser runtime", async () => {
  const template = await createGame351RpgTemplate({
    projectId: "public-browser-project",
    ownerId: "public-browser-owner",
    revisionId: "public-browser-revision",
  });
  const project = {
    ...template.project,
    editorTimeline: {
      frameCount: 1,
      tracks: [
        { trackId: "hero", label: "主人公", kind: "SPRITE", activeFrames: [0], role: "PLAYER" as const },
        { trackId: "camera", label: "カメラ", kind: "CAMERA", activeFrames: [0], role: "CAMERA" as const },
      ],
    },
  };
  const draw = createProject({
    projectId: "public-browser-project",
    name: "Public Browser Game",
    width: 4,
    height: 4,
  });
  const exported = await exportPxdProject(draw, {
    game: {
      schemaVersion: "GAME_EDITOR_PERSISTENCE_V1",
      record: {
        schemaVersion: "GAME_EDITOR_PERSISTENCE_V1",
        projectId: "public-browser-project",
        tracks: project.editorTimeline.tracks.map((track) => ({
          id: track.trackId,
          label: track.label,
          kind: track.kind,
          filled: [...track.activeFrames],
          role: track.role,
        })),
        canonicalProject: project,
      },
    },
  });
  const packageHash = await sha256BytesHex(exported.bytes);
  const base = await fixture();
  const bootstrap = parseIGamePublicBootstrap({
    ...base,
    revision: { ...base.revision, package_hash: exported.manifest.canonicalManifestHash },
    manifest: { ...base.manifest, projectId: "public-browser-project" },
    package: { ...base.package, sha256: packageHash },
  }, "buyer-1");
  const source = await createIGameBrowserRuntimeSource(bootstrap, exported.bytes);
  assert(source.manifest.projectId === "public-browser-project", "runtime must preserve the PXD Game Project identity");
  assert(source.launch.title === "公開Game", "runtime launch must use the verified product title");
});
