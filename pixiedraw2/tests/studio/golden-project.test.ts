import {
  createGoldenProject,
  type GoldenAssetInput,
} from "../../src/studio/golden-project.ts";

const DRAW_HASH = "a".repeat(64);
const AUDIO_HASH = "b".repeat(64);

function asset(
  kind: GoldenAssetInput["kind"],
  overrides: Partial<GoldenAssetInput> = {},
): GoldenAssetInput {
  return {
    projectId: "studio:golden",
    ownerId: "owner:local",
    kind,
    assetId: kind === "DRAW" ? "draw:hero" : "audio:theme",
    revisionId: kind === "DRAW" ? "draw:hero:r1" : "audio:theme:r1",
    contentHash: kind === "DRAW" ? DRAW_HASH : AUDIO_HASH,
    licenseId: kind === "DRAW" ? "license:draw" : "license:audio",
    permission: "READ",
    reviewStatus: "APPROVED",
    label: kind === "DRAW" ? "Hero" : "Theme",
    ...overrides,
  };
}

function input(
  overrides: Partial<Parameters<typeof createGoldenProject>[0]> = {},
) {
  return {
    projectId: "studio:golden",
    ownerId: "owner:local",
    name: "Golden Project",
    draw: asset("DRAW"),
    audio: asset("AUDIO"),
    ...overrides,
  };
}

Deno.test("Golden Project composes Draw Sprite and Audio Source", async () => {
  const result = await createGoldenProject(input(), "LIVE");
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));

  const project = result.value.project;
  const components = project.scenes.flatMap((scene) =>
    scene.entities.flatMap((entity) => entity.components)
  );
  if (
    components.filter((component) => component.type === "SPRITE").length !== 1
  ) {
    throw new Error("Expected one Sprite component.");
  }
  if (
    components.filter((component) => component.type === "AUDIO_SOURCE")
      .length !== 1
  ) {
    throw new Error("Expected one Audio Source component.");
  }
  if (project.dependencies.length !== 2) {
    throw new Error("Expected two dependencies.");
  }
  if (result.value.manifest.assetLocks.length !== 2) {
    throw new Error("Expected Draw and Audio asset locks.");
  }
  if (result.value.packageReady) {
    throw new Error("LIVE must not be package-ready.");
  }
  if (
    result.value.steps.find((step) => step.id === "PINNED_PACKAGE")?.status !==
      "NEXT"
  ) {
    throw new Error("LIVE must leave pinned package as the next step.");
  }
});

Deno.test("PINNED Golden Project locks revision, hash, and package licenses", async () => {
  const result = await createGoldenProject(input(), "PINNED");
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));

  if (!result.value.packageReady) {
    throw new Error("PINNED should be package-ready.");
  }
  if (
    result.value.manifest.assetLocks.some((lock) =>
      !lock.revisionId || !lock.contentHash
    )
  ) {
    throw new Error("Pinned asset locks must contain revision and hash.");
  }
  if (result.value.manifest.dependencyLocks.length !== 2) {
    throw new Error("Expected two dependency locks.");
  }
  if (result.value.manifest.licenses.length !== 2) {
    throw new Error("Expected two licenses.");
  }
  const serialized = JSON.stringify(result.value.project);
  if (serialized.includes("bytes") || serialized.includes("pixels")) {
    throw new Error(
      "Canonical Golden Project must not contain raw media payloads.",
    );
  }
});

Deno.test("Golden Project fails closed on cross-owner or wrong-kind assets", async () => {
  const wrongOwner = await createGoldenProject(
    input({ draw: asset("DRAW", { ownerId: "owner:other" }) }),
    "LIVE",
  );
  if (
    wrongOwner.ok ||
    !wrongOwner.diagnostics.some((item) => item.code === "WRONG_OWNER")
  ) {
    throw new Error("Cross-owner Draw asset should be rejected.");
  }

  const wrongKind = await createGoldenProject(
    input({ audio: asset("DRAW", { assetId: "draw:wrong-kind" }) }),
    "LIVE",
  );
  if (
    wrongKind.ok ||
    !wrongKind.diagnostics.some((item) => item.path === "audio.kind")
  ) {
    throw new Error("Wrong-kind Audio asset should be rejected.");
  }
});
