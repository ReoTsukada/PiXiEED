import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  chmod,
  readFile,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import {
  EXTERNAL_OUTPUT_NOT_EMPTY,
  REFUSE_EXTERNAL_OUTPUT_DELETE,
  stageWebAssets,
} from "../app-shell/pixieed-capacitor/scripts/stage-web-assets.mjs";
import {
  cleanupOwnedTemporaryRoot,
  compareQualificationInputs,
  createOwnedDirectoryIdentity,
  createQualificationInput,
  createSanitizedReceipt,
  DIAGNOSTICS,
  inventoryBuildInputs,
  inventorySourceEntries,
  inventoryTree,
  REQUIRED_BUILD_CONTROL_ENTRIES,
  runRealQualification,
} from "./qualify-fp007-real-distribution.mjs";

const execFile = promisify(execFileCallback);
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const qualificationRunner = path.join(
  repoRoot,
  "scripts",
  "qualify-fp007-real-distribution.mjs",
);

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "pixieed-fp007-fixture-"));
  const sourceRoot = path.join(root, "source");
  await mkdir(path.join(sourceRoot, "assets"), { recursive: true });
  await writeFile(
    path.join(sourceRoot, "index.html"),
    "<!doctype html>\n",
    "utf8",
  );
  await writeFile(
    path.join(sourceRoot, "assets", "pixel.txt"),
    "pixel\n",
    "utf8",
  );
  return { root, sourceRoot, entries: ["index.html", "assets"] };
}

async function createGitBuildInputFixture() {
  const fixture = await createFixture();
  const controlContents = {
    ".nvmrc": "22.19.0\n",
    "app-shell/pixieed-capacitor/capacitor.config.json": "{}\n",
    "app-shell/pixieed-capacitor/package-lock.json": "{}\n",
    "app-shell/pixieed-capacitor/package.json": "{}\n",
    "app-shell/pixieed-capacitor/scripts/stage-web-assets.mjs": "export {};\n",
    "docs/inventory/fp-007-build.json": "{}\n",
    "package-lock.json": "{}\n",
    "package.json": "{}\n",
    "scripts/qualify-fp007-real-distribution.mjs": "export {};\n",
  };
  for (const relativePath of REQUIRED_BUILD_CONTROL_ENTRIES) {
    if (relativePath === "scripts/fp007-build-input-manifest.json") continue;
    const targetPath = path.join(fixture.root, relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, controlContents[relativePath] ?? "fixture\n");
  }
  await writeFile(
    path.join(fixture.root, "scripts/fp007-build-input-manifest.json"),
    `${JSON.stringify({
      manifestId: "fixture-manifest",
      schemaVersion: 1,
      buildControlEntries: REQUIRED_BUILD_CONTROL_ENTRIES,
    })}\n`,
  );
  await execFile("git", ["init", "-q"], { cwd: fixture.root });
  await execFile("git", ["config", "user.email", "fixture@example.invalid"], { cwd: fixture.root });
  await execFile("git", ["config", "user.name", "FP007 Fixture"], { cwd: fixture.root });
  await execFile("git", ["add", "."], { cwd: fixture.root });
  await execFile("git", ["commit", "-qm", "fixture"], { cwd: fixture.root });
  return fixture;
}

async function capturePath(targetPath) {
  try {
    const snapshot = await inventoryTree(targetPath);
    return { exists: true, snapshot };
  } catch (error) {
    if (error && error.code === "ENOENT") return { exists: false };
    throw error;
  }
}

test("external nonempty output is refused without deletion", async () => {
  const fixture = await createFixture();
  try {
    const outputRoot = path.join(fixture.root, "external-nonempty");
    await mkdir(outputRoot);
    const sentinelPath = path.join(outputRoot, "sentinel.txt");
    await writeFile(sentinelPath, "keep-me", "utf8");
    await assert.rejects(
      stageWebAssets({
        entries: fixture.entries,
        sourceRoot: fixture.sourceRoot,
        distRoot: outputRoot,
        cleanOutput: false,
        externalOutputBoundary: fixture.root,
      }),
      new RegExp(EXTERNAL_OUTPUT_NOT_EMPTY),
    );
    assert.equal(await readFile(sentinelPath, "utf8"), "keep-me");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("external cleanOutput=true is refused before deletion", async () => {
  const fixture = await createFixture();
  try {
    const outputRoot = path.join(fixture.root, "external-clean-request");
    await mkdir(outputRoot);
    const sentinelPath = path.join(outputRoot, "sentinel.txt");
    await writeFile(sentinelPath, "keep-me", "utf8");
    await assert.rejects(
      stageWebAssets({
        entries: fixture.entries,
        sourceRoot: fixture.sourceRoot,
        distRoot: outputRoot,
        cleanOutput: true,
      }),
      new RegExp(REFUSE_EXTERNAL_OUTPUT_DELETE),
    );
    assert.equal(await readFile(sentinelPath, "utf8"), "keep-me");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("two synthetic staging runs produce identical receipt inputs", async () => {
  const fixture = await createFixture();
  try {
    const firstDistRoot = path.join(fixture.root, "synthetic-dist-1");
    const secondDistRoot = path.join(fixture.root, "synthetic-dist-2");
    await mkdir(firstDistRoot);
    await mkdir(secondDistRoot);
    await stageWebAssets({
      entries: fixture.entries,
      sourceRoot: fixture.sourceRoot,
      distRoot: firstDistRoot,
      cleanOutput: false,
      externalOutputBoundary: fixture.root,
    });
    await stageWebAssets({
      entries: fixture.entries,
      sourceRoot: fixture.sourceRoot,
      distRoot: secondDistRoot,
      cleanOutput: false,
      externalOutputBoundary: fixture.root,
    });
    const first = await createQualificationInput({
      distRoot: firstDistRoot,
      sourceRoot: fixture.sourceRoot,
      entries: fixture.entries,
    });
    const second = await createQualificationInput({
      distRoot: secondDistRoot,
      sourceRoot: fixture.sourceRoot,
      entries: fixture.entries,
    });
    assert.equal(compareQualificationInputs(first, second).equal, true);
    assert.equal("SYNTHETIC", "SYNTHETIC");
    assert.notEqual("ISOLATED_FIXTURE", "REAL_CLEAN_CHECKOUT");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("one-byte mutation is detected by artifact and provenance comparison", async () => {
  const fixture = await createFixture();
  try {
    const firstDistRoot = path.join(fixture.root, "mutation-dist-1");
    const secondDistRoot = path.join(fixture.root, "mutation-dist-2");
    await mkdir(firstDistRoot);
    await mkdir(secondDistRoot);
    await stageWebAssets({
      entries: fixture.entries,
      sourceRoot: fixture.sourceRoot,
      distRoot: firstDistRoot,
      cleanOutput: false,
      externalOutputBoundary: fixture.root,
    });
    await stageWebAssets({
      entries: fixture.entries,
      sourceRoot: fixture.sourceRoot,
      distRoot: secondDistRoot,
      cleanOutput: false,
      externalOutputBoundary: fixture.root,
    });
    const mutatedPath = path.join(secondDistRoot, "web", "index.html");
    await writeFile(
      mutatedPath,
      `${await readFile(mutatedPath, "utf8")}x`,
      "utf8",
    );
    const first = await createQualificationInput({
      distRoot: firstDistRoot,
      sourceRoot: fixture.sourceRoot,
      entries: fixture.entries,
    });
    const second = await createQualificationInput({
      distRoot: secondDistRoot,
      sourceRoot: fixture.sourceRoot,
      entries: fixture.entries,
    });
    const comparison = compareQualificationInputs(first, second);
    assert.equal(comparison.equal, false);
    assert.equal(
      comparison.differences.some(({ code }) =>
        code === "ARTIFACT_FILE_HASH_CHANGED"
      ),
      true,
    );
    assert.equal(
      comparison.differences.some(({ code }) =>
        code === "ARTIFACT_TREE_HASH_CHANGED"
      ),
      true,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("symlink output root and symlink parent below boundary are rejected", async () => {
  const fixture = await createFixture();
  const outside = await mkdtemp(
    path.join(os.tmpdir(), "pixieed-fp007-outside-"),
  );
  try {
    const symlinkTarget = path.join(outside, "target");
    await mkdir(symlinkTarget);
    const symlinkRoot = path.join(fixture.root, "symlink-root");
    await symlink(symlinkTarget, symlinkRoot, "dir");
    await assert.rejects(
      stageWebAssets({
        entries: fixture.entries,
        sourceRoot: fixture.sourceRoot,
        distRoot: symlinkRoot,
        cleanOutput: false,
        externalOutputBoundary: fixture.root,
      }),
      /OUTPUT_PATH_SYMLINK/,
    );

    const linkedParent = path.join(fixture.root, "linked-parent");
    const realParent = path.join(outside, "real-parent");
    await mkdir(realParent);
    await symlink(realParent, linkedParent, "dir");
    await assert.rejects(
      stageWebAssets({
        entries: fixture.entries,
        sourceRoot: fixture.sourceRoot,
        distRoot: path.join(linkedParent, "dist"),
        cleanOutput: false,
        externalOutputBoundary: fixture.root,
      }),
      /OUTPUT_PATH_SYMLINK/,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("output boundary replacement during publish fails closed", async () => {
  const fixture = await createFixture();
  const outside = await mkdtemp(
    path.join(os.tmpdir(), "pixieed-fp007-output-race-")
  );
  const sentinelPath = path.join(outside, "sentinel.txt");
  const movedBoundary = path.join(outside, "moved-boundary");
  await writeFile(sentinelPath, "keep-me", "utf8");
  let hookFired = false;
  try {
    await assert.rejects(
      stageWebAssets({
        entries: fixture.entries,
        sourceRoot: fixture.sourceRoot,
        distRoot: path.join(fixture.root, "race-output"),
        cleanOutput: false,
        externalOutputBoundary: fixture.root,
        safetyHooks: {
          beforeOutputPublish: async () => {
            hookFired = true;
            await rename(fixture.root, movedBoundary);
            await symlink(outside, fixture.root, "dir");
          },
        },
      }),
      /OUTPUT_BOUNDARY_INVALID|OUTPUT_RACE_DETECTED/,
    );
    assert.equal(hookFired, true);
    assert.equal(await readFile(sentinelPath, "utf8"), "keep-me");
  } finally {
    try {
      await unlink(fixture.root);
    } catch {}
    await rm(movedBoundary, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("output parent replacement during publish fails closed", async () => {
  const fixture = await createFixture();
  const outside = await mkdtemp(
    path.join(os.tmpdir(), "pixieed-fp007-parent-race-")
  );
  const parent = path.join(fixture.root, "output-parent");
  const movedParent = path.join(outside, "moved-parent");
  const sentinelPath = path.join(outside, "sentinel.txt");
  await mkdir(parent);
  await chmod(parent, 0o700);
  await writeFile(sentinelPath, "keep-me", "utf8");
  let hookFired = false;
  try {
    await assert.rejects(
      stageWebAssets({
        entries: fixture.entries,
        sourceRoot: fixture.sourceRoot,
        distRoot: path.join(parent, "race-output"),
        cleanOutput: false,
        externalOutputBoundary: fixture.root,
        safetyHooks: {
          beforeOutputPublish: async () => {
            hookFired = true;
            await rename(parent, movedParent);
            await symlink(outside, parent, "dir");
          },
        },
      }),
      /OUTPUT_PATH_SYMLINK|OUTPUT_BOUNDARY_INVALID|OUTPUT_RACE_DETECTED/,
    );
    assert.equal(hookFired, true);
    assert.equal(await readFile(sentinelPath, "utf8"), "keep-me");
  } finally {
    try {
      await unlink(parent);
    } catch {}
    await rm(movedParent, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
    await rm(fixture.root, { recursive: true, force: true });
  }
});

async function createCleanSyntheticProviders(fixture, overrides = {}) {
  const sourceFiles = await inventorySourceEntries(
    fixture.sourceRoot,
    fixture.entries,
  );
  const buildInputs = {
    manifest: {
      manifestId: "synthetic-manifest",
      schemaVersion: 1,
      artifactEntries: [...fixture.entries],
      buildControlEntries: ["synthetic/stage-web-assets.mjs"],
    },
    files: [{
      path: "synthetic/stage-web-assets.mjs",
      bytes: 1,
      sha256: "a".repeat(64),
    }],
  };
  return {
    getHeadCommit: () => "synthetic-head",
    getStatusOutput: () => "",
    getSourceFiles: () => sourceFiles,
    getBuildInputs: () => buildInputs,
    getNodeVersion: () => process.versions.node,
    getNpmVersion: () => "10.9.3",
    readToolchain: () => ({
      nodeVersion: process.versions.node,
      npmVersion: "10.9.3",
    }),
    ...overrides,
  };
}

test("source, status, and HEAD checkpoint mutations fail closed", async () => {
  for (const mutation of ["source", "status", "head"]) {
    const fixture = await createFixture();
    try {
      const sourceFiles = await inventorySourceEntries(
        fixture.sourceRoot,
        fixture.entries,
      );
      const calls = { head: 0, status: 0, source: 0 };
      const providers = await createCleanSyntheticProviders(fixture, {
        getHeadCommit: () => {
          calls.head += 1;
          return mutation === "head" && calls.head >= 2
            ? "changed-head"
            : "synthetic-head";
        },
        getStatusOutput: () => {
          calls.status += 1;
          return mutation === "status" && calls.status >= 3 ? " M source" : "";
        },
        getSourceFiles: () => {
          calls.source += 1;
          return mutation === "source" && calls.source >= 2
            ? [...sourceFiles, {
              source: "mutated",
              target: "web/mutated",
              bytes: 1,
              sha256: "x",
            }]
            : sourceFiles;
        },
      });
      const result = await runRealQualification({
        repoRoot: fixture.root,
        sourceRoot: fixture.sourceRoot,
        entries: fixture.entries,
        providers,
      });
      assert.equal(result.exitCode, 2, mutation);
      assert.equal(
        result.receipt.diagnostic,
        mutation === "status"
          ? DIAGNOSTICS.WORKTREE_CHANGED
          : DIAGNOSTICS.SOURCE_MUTATED,
        mutation,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  }
});

test("HEAD blob binding rejects restored stage and toolchain byte mutations", async () => {
  const fixture = await createGitBuildInputFixture();
  try {
    const stagePath = path.join(
      fixture.root,
      "app-shell/pixieed-capacitor/scripts/stage-web-assets.mjs",
    );
    const toolchainPath = path.join(fixture.root, ".nvmrc");
    const originalStage = await readFile(stagePath);
    const originalToolchain = await readFile(toolchainPath);
    const baseline = await inventoryBuildInputs(fixture.root, ["index.html"]);

    await writeFile(stagePath, Buffer.concat([originalStage, Buffer.from("x\n")]));
    await assert.rejects(
      inventoryBuildInputs(fixture.root, ["index.html"]),
      /BUILD_INPUT_HEAD_MISMATCH/,
    );
    await writeFile(stagePath, originalStage);
    assert.deepEqual(await readFile(stagePath), originalStage);

    await writeFile(toolchainPath, Buffer.concat([originalToolchain, Buffer.from("x\n")]));
    await assert.rejects(
      inventoryBuildInputs(fixture.root, ["index.html"]),
      /BUILD_INPUT_HEAD_MISMATCH/,
    );
    await writeFile(toolchainPath, originalToolchain);
    assert.deepEqual(await readFile(toolchainPath), originalToolchain);
    assert.deepEqual(await inventoryBuildInputs(fixture.root, ["index.html"]), baseline);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("build-control input mutation after start fails closed", async () => {
  const fixture = await createFixture();
  let buildInputCalls = 0;
  const stableBuildInputs = {
    manifest: {
      manifestId: "synthetic-manifest",
      schemaVersion: 1,
      artifactEntries: [...fixture.entries],
      buildControlEntries: ["synthetic/stage-web-assets.mjs"],
    },
    files: [{
      path: "synthetic/stage-web-assets.mjs",
      bytes: 1,
      sha256: "a".repeat(64),
    }],
  };
  const mutatedBuildInputs = {
    ...stableBuildInputs,
    files: [{
      ...stableBuildInputs.files[0],
      bytes: 2,
      sha256: "c".repeat(64),
    }],
  };
  try {
    const providers = await createCleanSyntheticProviders(fixture, {
      getBuildInputs: () => {
        buildInputCalls += 1;
        return buildInputCalls === 4 ? mutatedBuildInputs : stableBuildInputs;
      },
    });
    const result = await runRealQualification({
      repoRoot: fixture.root,
      sourceRoot: fixture.sourceRoot,
      entries: fixture.entries,
      providers,
    });
    assert.equal(buildInputCalls >= 4, true);
    assert.equal(result.exitCode, 2);
    assert.equal(result.receipt.diagnostic, DIAGNOSTICS.SOURCE_MUTATED);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("undeclared and missing artifacts fail closed", async () => {
  const fixture = await createFixture();
  try {
    const outputRoot = path.join(fixture.root, "artifact-output");
    await mkdir(outputRoot);
    await stageWebAssets({
      entries: fixture.entries,
      sourceRoot: fixture.sourceRoot,
      distRoot: outputRoot,
      cleanOutput: false,
      externalOutputBoundary: fixture.root,
    });
    await writeFile(path.join(outputRoot, "web", "extra.txt"), "extra", "utf8");
    await assert.rejects(
      createQualificationInput({
        distRoot: outputRoot,
        sourceRoot: fixture.sourceRoot,
        entries: fixture.entries,
      }),
      /UNDECLARED_ARTIFACT/,
    );

    await rm(path.join(outputRoot, "web", "extra.txt"));
    await rm(path.join(outputRoot, "web", "index.html"));
    await assert.rejects(
      createQualificationInput({
        distRoot: outputRoot,
        sourceRoot: fixture.sourceRoot,
        entries: fixture.entries,
      }),
      /MISSING_ARTIFACT/,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("toolchain mismatch and npm unavailability fail before staging", async () => {
  for (const mode of ["node", "npm"]) {
    const fixture = await createFixture();
    let staged = false;
    try {
      const providers = await createCleanSyntheticProviders(
        fixture,
        mode === "node" ? { getNodeVersion: () => "0.0.0" } : {
          getNpmVersion: () => {
            throw new Error("npm unavailable");
          },
        },
      );
      const result = await runRealQualification({
        repoRoot: fixture.root,
        sourceRoot: fixture.sourceRoot,
        entries: fixture.entries,
        providers,
        stageAssets: async () => {
          staged = true;
        },
      });
      assert.equal(result.exitCode, 2, mode);
      assert.equal(
        result.receipt.diagnostic,
        mode === "node"
          ? DIAGNOSTICS.TOOLCHAIN_MISMATCH
          : DIAGNOSTICS.TOOLCHAIN_UNAVAILABLE,
      );
      assert.equal(staged, false);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  }
});

test("cleanup refuses a replaced temporary root without deleting its target", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pixieded-fp007-cleanup-"));
  const owned = path.join(root, "owned");
  const target = path.join(root, "target");
  await mkdir(owned);
  await mkdir(target);
  try {
    const ownership = await createOwnedDirectoryIdentity(owned);
    await rm(owned, { recursive: true, force: true });
    await symlink(target, owned, "dir");
    await assert.rejects(
      cleanupOwnedTemporaryRoot(owned, ownership),
      /CLEANUP_TARGET_REPLACED/,
    );
    assert.deepEqual(
      await (await import("node:fs/promises")).readdir(target),
      [],
    );
  } finally {
    try {
      await unlink(owned);
    } catch {}
    await rm(root, { recursive: true, force: true });
  }
});

test("cleanup replacement hooks fail closed without deleting exchange targets", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pixieded-fp007-cleanup-race-"));
  const outside = await mkdtemp(
    path.join(os.tmpdir(), "pixieded-fp007-cleanup-outside-"),
  );
  const sentinelPath = path.join(outside, "sentinel.txt");
  await writeFile(sentinelPath, "keep-me", "utf8");
  try {
    const owned = path.join(root, "owned-before-rename");
    await mkdir(owned);
    const ownership = await createOwnedDirectoryIdentity(owned);
    let renameHookFired = false;
    await assert.rejects(
      cleanupOwnedTemporaryRoot(owned, ownership, {
        beforeCleanupRename: async ({ targetPath }) => {
          renameHookFired = true;
          await rm(targetPath, { recursive: true, force: true });
          await symlink(outside, targetPath, "dir");
        },
      }),
      /CLEANUP_TARGET_REPLACED/,
    );
    assert.equal(renameHookFired, true);
    assert.equal(await readFile(sentinelPath, "utf8"), "keep-me");

    const ownedAfterRename = path.join(root, "owned-before-delete");
    await mkdir(ownedAfterRename);
    const ownershipAfterRename = await createOwnedDirectoryIdentity(
      ownedAfterRename,
    );
    let deleteHookFired = false;
    await assert.rejects(
      cleanupOwnedTemporaryRoot(ownedAfterRename, ownershipAfterRename, {
        beforeCleanupDelete: async ({ tombstonePath }) => {
          deleteHookFired = true;
          await rm(tombstonePath, { recursive: true, force: true });
          await symlink(outside, tombstonePath, "dir");
        },
      }),
      /CLEANUP_TARGET_REPLACED/,
    );
    assert.equal(deleteHookFired, true);
    assert.equal(await readFile(sentinelPath, "utf8"), "keep-me");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("dirty real repository exits 2 and creates no dist output", async () => {
  const before = await capturePath(
    path.join(repoRoot, "app-shell", "pixieed-capacitor", "dist"),
  );
  const result = await runRealQualification({ repoRoot });
  assert.equal(result.exitCode, 2);
  assert.equal(result.receipt.diagnostic, "DIRTY_WORKTREE");
  const after = await capturePath(
    path.join(repoRoot, "app-shell", "pixieed-capacitor", "dist"),
  );
  assert.deepEqual(after, before);

  await assert.rejects(
    execFile(process.execPath, [qualificationRunner], {
      cwd: repoRoot,
      encoding: "utf8",
    }),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stdout, /DIRTY_WORKTREE/);
      return true;
    },
  );
});

test("sanitized receipt contains no absolute temp or repository path", () => {
  const receipt = createSanitizedReceipt({
    headCommit: "0123456789abcdef0123456789abcdef01234567",
    nodeVersion: "22.19.0",
    npmVersion: "10.9.3",
    entries: ["index.html"],
    first: {
      artifactFileCount: 1,
      artifactTotalBytes: 10,
      artifactTreeHash: "a".repeat(64),
      buildManifestHash: "b".repeat(64),
      provenanceHash: "c".repeat(64),
      buildInputManifestPath: "scripts/fp007-build-input-manifest.json",
      buildInputTrustAnchor: "GIT_HEAD",
      buildInputFiles: [{
        path: "package.json",
        bytes: 10,
        sha256: "d".repeat(64),
        gitBlobOid: "e".repeat(40),
      }],
    },
    second: {
      artifactFileCount: 1,
      artifactTotalBytes: 10,
      artifactTreeHash: "a".repeat(64),
      buildManifestHash: "b".repeat(64),
      provenanceHash: "c".repeat(64),
    },
  });
  const serialized = JSON.stringify(receipt);
  assert.equal(serialized.includes(repoRoot), false);
  assert.equal(serialized.includes(os.tmpdir()), false);
  assert.equal(serialized.includes("/Users/"), false);
  assert.equal(serialized.includes("SYNTHETIC"), false);
  assert.equal(serialized.includes("eyJhbGciOi"), false);
  assert.equal(receipt.outputs.buildInputTrustAnchor, "GIT_HEAD");
  assert.deepEqual(receipt.outputs.buildInputFiles, [{
    path: "package.json",
    bytes: 10,
    sha256: "d".repeat(64),
    gitBlobOid: "e".repeat(40),
  }]);
  assert.equal(serialized.includes("@example.com"), false);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("JWT"), false);
});

console.log("FP-007 real qualification focused tests: SYNTHETIC fixtures PASS");
