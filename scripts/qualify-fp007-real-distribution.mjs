import { execFile as execFileCallback } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  assertExternalOutputBoundary,
  canonicalBuildManifestJson,
  createBuildManifest,
  includeEntries,
  stageWebAssets,
} from "../app-shell/pixieed-capacitor/scripts/stage-web-assets.mjs";

const execFile = promisify(execFileCallback);
const scriptPath = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(scriptPath), "..");
const QUALIFICATION_SCHEMA_VERSION = 1;
const QUALIFICATION = "FP007_REAL_DISTRIBUTION_QUALIFICATION";
const BUILD_INPUT_MANIFEST_PATH = "scripts/fp007-build-input-manifest.json";
const BUILD_INPUT_MANIFEST_SCHEMA_VERSION = 1;
const REQUIRED_BUILD_CONTROL_ENTRIES = Object.freeze([
  ".nvmrc",
  "app-shell/pixieed-capacitor/capacitor.config.json",
  "app-shell/pixieed-capacitor/package-lock.json",
  "app-shell/pixieed-capacitor/package.json",
  "app-shell/pixieed-capacitor/scripts/stage-web-assets.mjs",
  "docs/inventory/fp-007-build.json",
  "package-lock.json",
  "package.json",
  BUILD_INPUT_MANIFEST_PATH,
  "scripts/qualify-fp007-real-distribution.mjs",
]);

const DIAGNOSTICS = Object.freeze({
  DIRTY_WORKTREE: "DIRTY_WORKTREE",
  GIT_STATUS_UNAVAILABLE: "GIT_STATUS_UNAVAILABLE",
  SOURCE_MUTATED: "SOURCE_MUTATED",
  WORKTREE_CHANGED: "WORKTREE_CHANGED",
  BUILD_INPUT_UNAVAILABLE: "BUILD_INPUT_UNAVAILABLE",
  BUILD_INPUT_INVALID: "BUILD_INPUT_INVALID",
  BUILD_INPUT_HEAD_UNAVAILABLE: "BUILD_INPUT_HEAD_UNAVAILABLE",
  BUILD_INPUT_HEAD_MISMATCH: "BUILD_INPUT_HEAD_MISMATCH",
  TOOLCHAIN_MISMATCH: "TOOLCHAIN_MISMATCH",
  TOOLCHAIN_UNAVAILABLE: "TOOLCHAIN_UNAVAILABLE",
  MISSING_ARTIFACT: "MISSING_ARTIFACT",
  UNDECLARED_ARTIFACT: "UNDECLARED_ARTIFACT",
  CLEANUP_TARGET_REPLACED: "CLEANUP_TARGET_REPLACED",
  CLEANUP_FAILED: "CLEANUP_FAILED",
  OUTPUT_RACE_DETECTED: "OUTPUT_RACE_DETECTED",
  PRIVATE_OUTPUT_REQUIRED: "PRIVATE_OUTPUT_REQUIRED",
  OUTPUT_BOUNDARY_INVALID: "OUTPUT_BOUNDARY_INVALID",
  QUALIFICATION_FAILED: "QUALIFICATION_FAILED",
});

class QualificationError extends Error {
  constructor(code, message = code, details = []) {
    super(message === code ? code : `${code}: ${message}`);
    this.name = "QualificationError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message = code, details = []) {
  throw new QualificationError(code, message, details);
}

function compareCodeUnitStrings(left, right) {
  const leftLength = left.length;
  const rightLength = right.length;
  const length = Math.min(leftLength, rightLength);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return leftLength - rightLength;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareCodeUnitStrings(left, right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function gitBlobSha1(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
}

function toPosixPath(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function isIgnoredSourcePath(targetPath) {
  return targetPath.endsWith(".DS_Store");
}

async function inventoryTree(rootPath) {
  const rootStat = await lstat(rootPath);
  if (rootStat.isSymbolicLink()) fail("SOURCE_SYMLINK", "symlink tree root");
  if (!rootStat.isDirectory()) {
    fail("UNSUPPORTED_ARTIFACT_ENTRY", "tree root is not a directory");
  }
  const files = [];

  async function visit(currentPath) {
    const entries = await readdir(currentPath, { withFileTypes: true });
    entries.sort((left, right) =>
      compareCodeUnitStrings(left.name, right.name)
    );
    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      const entryStat = await lstat(absolutePath);
      if (entryStat.isSymbolicLink()) {
        fail("SOURCE_SYMLINK", `symlink entry: ${entry.name}`);
      }
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        fail("UNSUPPORTED_ARTIFACT_ENTRY", `unsupported entry: ${entry.name}`);
      }
      const relativePath = toPosixPath(path.relative(rootPath, absolutePath));
      const bytes = await readFile(absolutePath);
      files.push({
        path: relativePath,
        bytes: bytes.length,
        sha256: sha256Hex(bytes),
      });
    }
  }

  await visit(rootPath);
  files.sort((left, right) => compareCodeUnitStrings(left.path, right.path));
  return {
    files,
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
    treeHash: sha256Hex(canonicalJson(files)),
  };
}

async function inventorySourceEntries(sourceRoot, entries) {
  const files = [];
  for (const entry of entries) {
    const sourcePath = path.join(sourceRoot, entry);
    const sourceStat = await lstat(sourcePath);
    if (sourceStat.isSymbolicLink()) {
      fail("SOURCE_SYMLINK", `source entry: ${entry}`);
    }
    if (sourceStat.isFile()) {
      if (!isIgnoredSourcePath(entry)) {
        const bytes = await readFile(sourcePath);
        files.push({
          source: toPosixPath(entry),
          target: `web/${toPosixPath(entry)}`,
          bytes: bytes.length,
          sha256: sha256Hex(bytes),
        });
      }
      continue;
    }
    const inventory = await inventoryTree(sourcePath);
    for (const file of inventory.files) {
      if (isIgnoredSourcePath(file.path)) continue;
      const source = toPosixPath(path.join(entry, file.path));
      files.push({
        source,
        target: `web/${source}`,
        bytes: file.bytes,
        sha256: file.sha256,
      });
    }
  }
  files.sort((left, right) =>
    compareCodeUnitStrings(left.target, right.target)
  );
  return files;
}

function canonicalManifestPathList(entries) {
  return [...entries].sort(compareCodeUnitStrings);
}

function canonicalBuildInputManifestJson(manifest) {
  return JSON.stringify({
    manifestId: manifest.manifestId,
    schemaVersion: manifest.schemaVersion,
    artifactEntries: canonicalManifestPathList(manifest.artifactEntries),
    buildControlEntries: canonicalManifestPathList(manifest.buildControlEntries),
  });
}

function validateBuildInputPath(relativePath) {
  if (
    typeof relativePath !== "string" || relativePath.length === 0 ||
    path.isAbsolute(relativePath)
  ) {
    fail(DIAGNOSTICS.BUILD_INPUT_INVALID, "build input path is not relative");
  }
  const segments = relativePath.split(/[\\/]+/);
  if (
    segments.includes("..") || segments.some((segment) => segment.length === 0)
  ) {
    fail(DIAGNOSTICS.BUILD_INPUT_INVALID, "build input path escapes repository");
  }
}

function createBuildInputManifest(entries, manifestDocument) {
  return {
    manifestId: manifestDocument.manifestId,
    schemaVersion: manifestDocument.schemaVersion,
    artifactEntries: canonicalManifestPathList(entries),
    buildControlEntries: canonicalManifestPathList(
      manifestDocument.buildControlEntries,
    ),
  };
}

async function readBuildInputManifest(
  repoRoot,
  manifestPath = BUILD_INPUT_MANIFEST_PATH,
) {
  validateBuildInputPath(manifestPath);
  let parsed;
  try {
    parsed = JSON.parse(
      await readFile(path.join(repoRoot, manifestPath), "utf8"),
    );
  } catch (error) {
    fail(
      DIAGNOSTICS.BUILD_INPUT_UNAVAILABLE,
      `build input manifest unavailable: ${manifestPath}`,
      [manifestPath],
    );
  }
  if (
    !parsed || parsed.schemaVersion !== BUILD_INPUT_MANIFEST_SCHEMA_VERSION ||
    typeof parsed.manifestId !== "string" || parsed.manifestId.length === 0 ||
    !Array.isArray(parsed.buildControlEntries)
  ) {
    fail(
      DIAGNOSTICS.BUILD_INPUT_INVALID,
      "build input manifest schema is invalid",
      [manifestPath],
    );
  }
  const entries = canonicalManifestPathList(parsed.buildControlEntries);
  if (new Set(entries).size !== entries.length) {
    fail(DIAGNOSTICS.BUILD_INPUT_INVALID, "build input manifest has duplicates");
  }
  for (const relativePath of entries) validateBuildInputPath(relativePath);
  const missing = REQUIRED_BUILD_CONTROL_ENTRIES.filter(
    (entry) => !entries.includes(entry),
  );
  if (missing.length > 0) {
    fail(
      DIAGNOSTICS.BUILD_INPUT_INVALID,
      "build input manifest removed a mandatory control input",
      missing,
    );
  }
  return {
    manifestId: parsed.manifestId,
    schemaVersion: parsed.schemaVersion,
    buildControlEntries: entries,
  };
}

async function readBuildInputFile(repoRoot, relativePath) {
  validateBuildInputPath(relativePath);
  let currentPath = path.resolve(repoRoot);
  for (const segment of relativePath.split("/")) {
    currentPath = path.join(currentPath, segment);
    let entryStat;
    try {
      entryStat = await lstat(currentPath);
    } catch (error) {
      fail(
        DIAGNOSTICS.BUILD_INPUT_UNAVAILABLE,
        `build input unavailable: ${relativePath}`,
        [relativePath],
      );
    }
    if (entryStat.isSymbolicLink()) {
      fail(
        DIAGNOSTICS.BUILD_INPUT_INVALID,
        `build input symlink: ${relativePath}`,
        [relativePath],
      );
    }
  }
  const finalStat = await lstat(currentPath);
  if (!finalStat.isFile()) {
    fail(
      DIAGNOSTICS.BUILD_INPUT_INVALID,
      `build input is not a file: ${relativePath}`,
      [relativePath],
    );
  }
  const bytes = await readFile(currentPath);
  let gitBlobOid;
  try {
    gitBlobOid = await gitOutput(repoRoot, [
      "rev-parse",
      `HEAD:${relativePath}`,
    ]);
  } catch (error) {
    fail(
      DIAGNOSTICS.BUILD_INPUT_HEAD_UNAVAILABLE,
      `HEAD blob unavailable: ${relativePath}`,
      [relativePath],
    );
  }
  if (gitBlobOid !== gitBlobSha1(bytes)) {
    fail(
      DIAGNOSTICS.BUILD_INPUT_HEAD_MISMATCH,
      `working bytes differ from HEAD: ${relativePath}`,
      [relativePath],
    );
  }
  return {
    path: relativePath,
    bytes: bytes.length,
    sha256: sha256Hex(bytes),
    gitBlobOid,
  };
}

async function inventoryBuildInputs(
  repoRoot,
  entries = includeEntries,
  { manifestPath = BUILD_INPUT_MANIFEST_PATH } = {},
) {
  const manifestDocument = await readBuildInputManifest(repoRoot, manifestPath);
  const headCommit = await gitOutput(repoRoot, ["rev-parse", "HEAD"]);
  const manifest = createBuildInputManifest(entries, manifestDocument);
  const files = [];
  for (const relativePath of manifest.buildControlEntries) {
    files.push(await readBuildInputFile(repoRoot, relativePath));
  }
  files.sort((left, right) => compareCodeUnitStrings(left.path, right.path));
  return {
    trustAnchor: "GIT_HEAD",
    headCommit,
    manifestPath,
    manifest,
    manifestHash: sha256Hex(canonicalBuildInputManifestJson(manifest)),
    files,
  };
}

function expectedArtifactPaths(sourceFiles) {
  return [
    ...sourceFiles.map((sourceFile) => sourceFile.target),
    "build-manifest.json",
  ].sort(compareCodeUnitStrings);
}

async function createQualificationInput({
  distRoot,
  sourceRoot,
  entries,
  inputHash,
  buildInputManifestHash,
  buildInputManifestPath,
  buildInputTrustAnchor,
  buildInputFiles,
}) {
  const artifactInventory = await inventoryTree(distRoot);
  const manifestPath = path.join(distRoot, "build-manifest.json");
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const expectedManifest = createBuildManifest(entries);
  if (
    canonicalBuildManifestJson(manifest) !==
      canonicalBuildManifestJson(expectedManifest)
  ) {
    fail("BUILD_MANIFEST_CONTENT_MISMATCH");
  }

  const sourceFiles = await inventorySourceEntries(sourceRoot, entries);
  const expectedPaths = expectedArtifactPaths(sourceFiles);
  const actualPaths = artifactInventory.files.map((file) => file.path);
  const expectedSet = new Set(expectedPaths);
  const actualSet = new Set(actualPaths);
  const missing = expectedPaths.filter((filePath) => !actualSet.has(filePath));
  const extra = actualPaths.filter((filePath) => !expectedSet.has(filePath));
  if (missing.length > 0) {
    fail(DIAGNOSTICS.MISSING_ARTIFACT, "missing declared artifact", missing);
  }
  if (extra.length > 0) {
    fail(DIAGNOSTICS.UNDECLARED_ARTIFACT, "undeclared artifact", extra);
  }

  const copiedFileMap = new Map(
    artifactInventory.files
      .filter((file) => file.path.startsWith("web/"))
      .map((file) => [file.path, file]),
  );
  const sourceToDistMismatches = [];
  for (const sourceFile of sourceFiles) {
    const outputFile = copiedFileMap.get(sourceFile.target);
    if (
      !outputFile || outputFile.sha256 !== sourceFile.sha256 ||
      outputFile.bytes !== sourceFile.bytes
    ) {
      sourceToDistMismatches.push(sourceFile.target);
    }
  }
  sourceToDistMismatches.sort(compareCodeUnitStrings);
  const manifestHash = sha256Hex(manifestBytes);
  const provenance = {
    artifactTreeHash: artifactInventory.treeHash,
    generatedManifestHash: manifestHash,
    sourceFiles,
    sourceToDistMismatches,
  };
  return {
    artifactFileCount: artifactInventory.files.length,
    artifactTotalBytes: artifactInventory.totalBytes,
    artifactTreeHash: artifactInventory.treeHash,
    buildManifestHash: manifestHash,
    provenanceHash: sha256Hex(canonicalJson(provenance)),
    sourceToDistMismatches,
    filePaths: actualPaths,
    inputHash,
    buildInputManifestHash,
    buildInputManifestPath,
    buildInputTrustAnchor,
    buildInputFiles,
    fileHashes: artifactInventory.files.map((file) => ({
      path: file.path,
      sha256: file.sha256,
    })),
  };
}

function compareQualificationInputs(first, second) {
  const differences = [];
  const mismatches = [
    ...new Set([
      ...(first.sourceToDistMismatches ?? []),
      ...(second.sourceToDistMismatches ?? []),
    ]),
  ].sort(compareCodeUnitStrings);
  for (const target of mismatches) {
    differences.push({ code: "SOURCE_TO_DIST_MISMATCH", path: target });
  }
  if (canonicalJson(first.filePaths) !== canonicalJson(second.filePaths)) {
    differences.push({ code: "ARTIFACT_PATH_SET_CHANGED" });
  }
  if (canonicalJson(first.fileHashes) !== canonicalJson(second.fileHashes)) {
    differences.push({ code: "ARTIFACT_FILE_HASH_CHANGED" });
  }
  for (
    const [field, code] of [
      ["artifactTreeHash", "ARTIFACT_TREE_HASH_CHANGED"],
      ["buildManifestHash", "BUILD_MANIFEST_HASH_CHANGED"],
      ["provenanceHash", "SOURCE_TO_DIST_PROVENANCE_CHANGED"],
    ]
  ) {
    if (first[field] !== second[field]) differences.push({ code });
  }
  for (
    const [field, code] of [
      ["inputHash", "BUILD_INPUT_HASH_CHANGED"],
      ["buildInputManifestHash", "BUILD_INPUT_MANIFEST_CHANGED"],
    ]
  ) {
    if (first[field] !== second[field]) differences.push({ code });
  }
  return { equal: differences.length === 0, differences };
}

async function gitOutput(repoRoot, args) {
  const result = await execFile("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return result.stdout.trim();
}

function createQualificationProviders({
  repoRoot = defaultRepoRoot,
  sourceRoot = repoRoot,
  entries = includeEntries,
} = {}) {
  return {
    getHeadCommit: () => gitOutput(repoRoot, ["rev-parse", "HEAD"]),
    getStatusOutput: () =>
      gitOutput(repoRoot, [
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      ]),
    getSourceFiles: () => inventorySourceEntries(sourceRoot, entries),
    getBuildInputs: () => inventoryBuildInputs(repoRoot, entries),
    getNodeVersion: () => process.versions.node,
    getNpmVersion: async () =>
      (await execFile("npm", ["--version"], {
        cwd: repoRoot,
        encoding: "utf8",
      })).stdout.trim(),
    readToolchain: async () => {
      const packageJson = JSON.parse(
        await readFile(path.join(repoRoot, "package.json"), "utf8"),
      );
      return packageJson.pixieedToolchain;
    },
  };
}

async function captureCheckpoint({ providers }) {
  const [headCommit, statusOutput, sourceFiles, buildInputs] = await Promise.all([
    providers.getHeadCommit(),
    providers.getStatusOutput(),
    providers.getSourceFiles(),
    providers.getBuildInputs(),
  ]);
  if (
    !buildInputs || !buildInputs.manifest || !Array.isArray(buildInputs.files)
  ) {
    fail(DIAGNOSTICS.BUILD_INPUT_INVALID, "build input inventory is invalid");
  }
  if (
    buildInputs.manifest.schemaVersion !== BUILD_INPUT_MANIFEST_SCHEMA_VERSION ||
    typeof buildInputs.manifest.manifestId !== "string" ||
    !Array.isArray(buildInputs.manifest.artifactEntries) ||
    !Array.isArray(buildInputs.manifest.buildControlEntries)
  ) {
    fail(DIAGNOSTICS.BUILD_INPUT_INVALID, "build input manifest is invalid");
  }
  if (buildInputs.trustAnchor === "GIT_HEAD") {
    if (buildInputs.headCommit !== headCommit) {
      fail(
        DIAGNOSTICS.BUILD_INPUT_HEAD_MISMATCH,
        "build input HEAD differs from checkpoint HEAD",
      );
    }
    if (
      buildInputs.files.some((file) =>
        typeof file.gitBlobOid !== "string" || file.gitBlobOid.length !== 40
      )
    ) {
      fail(
        DIAGNOSTICS.BUILD_INPUT_HEAD_UNAVAILABLE,
        "Git HEAD blob identity is missing",
      );
    }
  }
  let normalizedBuildInputManifest;
  try {
    normalizedBuildInputManifest = JSON.parse(
      canonicalBuildInputManifestJson(buildInputs.manifest),
    );
  } catch {
    fail(DIAGNOSTICS.BUILD_INPUT_INVALID, "build input manifest is invalid");
  }
  const buildInputManifestHash = sha256Hex(
    canonicalBuildInputManifestJson(normalizedBuildInputManifest),
  );
  if (
    buildInputs.manifestHash !== undefined &&
    buildInputs.manifestHash !== buildInputManifestHash
  ) {
    fail(
      DIAGNOSTICS.BUILD_INPUT_INVALID,
      "build input manifest hash does not match its canonical bytes",
    );
  }
  const inputHash = sha256Hex(canonicalJson({
    artifactInputs: sourceFiles,
    buildControlInputs: {
      manifest: normalizedBuildInputManifest,
      manifestHash: buildInputManifestHash,
      files: buildInputs.files,
    },
  }));
  return {
    headCommit: String(headCommit),
    statusOutput: String(statusOutput),
    sourceHash: sha256Hex(canonicalJson(sourceFiles)),
    sourceFileCount: sourceFiles.length,
    buildInputManifestHash,
    buildInputFileCount: buildInputs.files.length,
    buildInputManifestPath: buildInputs.manifestPath ?? BUILD_INPUT_MANIFEST_PATH,
    buildInputTrustAnchor: buildInputs.trustAnchor ?? "SYNTHETIC",
    buildInputFiles: buildInputs.files,
    inputHash,
  };
}

function assertCheckpointStable(reference, current) {
  if (reference.headCommit !== current.headCommit) {
    fail(DIAGNOSTICS.SOURCE_MUTATED, "HEAD changed during qualification");
  }
  if (reference.statusOutput !== current.statusOutput) {
    fail(
      DIAGNOSTICS.WORKTREE_CHANGED,
      "worktree status changed during qualification",
    );
  }
  if (reference.sourceHash !== current.sourceHash) {
    fail(
      DIAGNOSTICS.SOURCE_MUTATED,
      "source inventory changed during qualification",
    );
  }
  if (reference.inputHash !== current.inputHash) {
    fail(
      DIAGNOSTICS.SOURCE_MUTATED,
      "build input or artifact input changed during qualification",
    );
  }
}

async function validateToolchain({ providers }) {
  let expected;
  let actualNode;
  let actualNpm;
  try {
    expected = await providers.readToolchain();
    actualNode = await providers.getNodeVersion();
    actualNpm = await providers.getNpmVersion();
  } catch {
    fail(DIAGNOSTICS.TOOLCHAIN_UNAVAILABLE);
  }
  if (
    !expected || typeof expected.nodeVersion !== "string" ||
    typeof expected.npmVersion !== "string" || typeof actualNode !== "string" ||
    typeof actualNpm !== "string"
  ) {
    fail(DIAGNOSTICS.TOOLCHAIN_UNAVAILABLE);
  }
  if (
    actualNode !== expected.nodeVersion || actualNpm !== expected.npmVersion
  ) {
    fail(DIAGNOSTICS.TOOLCHAIN_MISMATCH);
  }
  return {
    nodeVersion: actualNode,
    npmVersion: actualNpm,
  };
}

async function createOwnedDirectoryIdentity(targetPath) {
  const resolvedTargetPath = path.resolve(targetPath);
  const targetStat = await lstat(resolvedTargetPath);
  if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) {
    fail(DIAGNOSTICS.CLEANUP_TARGET_REPLACED, "temporary root is not an owned directory");
  }
  const parentPath = path.dirname(resolvedTargetPath);
  const parentStat = await lstat(parentPath);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
    fail(DIAGNOSTICS.CLEANUP_TARGET_REPLACED, "temporary parent is not a directory");
  }
  const resolvedPath = await realpath(resolvedTargetPath);
  const parentResolvedPath = await realpath(parentPath);
  return {
    path: resolvedTargetPath,
    resolvedPath,
    type: "directory",
    device: targetStat.dev,
    inode: targetStat.ino,
    parent: {
      path: parentPath,
      resolvedPath: parentResolvedPath,
      type: "directory",
      device: parentStat.dev,
      inode: parentStat.ino,
    },
  };
}

function sameOwnedObjectIdentity(left, right) {
  return left && right && left.type === right.type &&
    left.device === right.device && left.inode === right.inode;
}

function sameOwnedParentIdentity(left, right) {
  return left && right && left.path === right.path &&
    left.resolvedPath === right.resolvedPath && left.type === right.type &&
    left.device === right.device && left.inode === right.inode;
}

async function cleanupOwnedTemporaryRoot(
  targetPath,
  ownership,
  safetyHooks = undefined,
) {
  let current;
  try {
    current = await createOwnedDirectoryIdentity(targetPath);
  } catch (error) {
    if (error instanceof QualificationError) throw error;
    fail(DIAGNOSTICS.CLEANUP_TARGET_REPLACED);
  }
  if (
    current.path !== ownership.path ||
    !sameOwnedObjectIdentity(current, ownership) ||
    !sameOwnedParentIdentity(current.parent, ownership.parent)
  ) {
    fail(
      DIAGNOSTICS.CLEANUP_TARGET_REPLACED,
      "temporary root identity changed",
    );
  }
  const parentPath = ownership.parent.path;
  const tombstonePath = path.join(
    parentPath,
    `.pixiedeed-fp007-cleanup-${randomUUID()}`,
  );
  try {
    const parentBeforeRename = await createOwnedDirectoryIdentity(parentPath);
    if (!sameOwnedObjectIdentity(parentBeforeRename, ownership.parent)) {
      fail(DIAGNOSTICS.CLEANUP_TARGET_REPLACED, "temporary parent changed");
    }
    // Test-only seam: it runs after the ordinary ownership check and before
    // the rename syscall. A final no-follow identity check follows it.
    if (typeof safetyHooks?.beforeCleanupRename === "function") {
      await safetyHooks.beforeCleanupRename({ targetPath, tombstonePath });
    }
    const targetBeforeRename = await createOwnedDirectoryIdentity(targetPath);
    if (
      targetBeforeRename.path !== ownership.path ||
      !sameOwnedObjectIdentity(targetBeforeRename, ownership) ||
      !sameOwnedParentIdentity(targetBeforeRename.parent, ownership.parent)
    ) {
      fail(DIAGNOSTICS.CLEANUP_TARGET_REPLACED, "cleanup target changed");
    }
    const parentAfterRenameHook = await createOwnedDirectoryIdentity(parentPath);
    if (!sameOwnedObjectIdentity(parentAfterRenameHook, ownership.parent)) {
      fail(DIAGNOSTICS.CLEANUP_TARGET_REPLACED, "temporary parent changed");
    }
    // Rename the checked object to a private-parent tombstone first. A
    // replacement symlink is moved as a symlink and is then rejected before
    // any recursive delete, so an external target is never followed.
    await rename(targetPath, tombstonePath);
    let tombstoneIdentity;
    try {
      tombstoneIdentity = await createOwnedDirectoryIdentity(tombstonePath);
    } catch {
      fail(
        DIAGNOSTICS.CLEANUP_TARGET_REPLACED,
        "cleanup target was replaced before tombstone validation",
      );
    }
    if (!sameOwnedObjectIdentity(tombstoneIdentity, ownership)) {
      fail(DIAGNOSTICS.CLEANUP_TARGET_REPLACED, "cleanup tombstone identity changed");
    }
    if (typeof safetyHooks?.beforeCleanupDelete === "function") {
      await safetyHooks.beforeCleanupDelete({ tombstonePath });
    }
    const parentBeforeDelete = await createOwnedDirectoryIdentity(parentPath);
    if (!sameOwnedObjectIdentity(parentBeforeDelete, ownership.parent)) {
      fail(DIAGNOSTICS.CLEANUP_TARGET_REPLACED, "temporary parent changed");
    }
    const tombstoneBeforeDelete = await createOwnedDirectoryIdentity(
      tombstonePath,
    );
    if (!sameOwnedObjectIdentity(tombstoneBeforeDelete, ownership)) {
      fail(DIAGNOSTICS.CLEANUP_TARGET_REPLACED, "cleanup tombstone changed");
    }
    await rm(tombstonePath, { recursive: true, force: false });
  } catch (error) {
    if (error instanceof QualificationError) throw error;
    throw new QualificationError(
      DIAGNOSTICS.CLEANUP_FAILED,
      "temporary cleanup failed",
      [],
      { cause: error },
    );
  }
}

function createSanitizedReceipt({
  headCommit,
  nodeVersion,
  npmVersion,
  entries,
  first,
  second,
}) {
  return {
    schemaVersion: QUALIFICATION_SCHEMA_VERSION,
    qualification: QUALIFICATION,
    status: "PASS",
    scope: "REAL_CLEAN_CHECKOUT",
    headCommit,
    nodeVersion,
    npmVersion,
    staging: {
      entryCount: entries.length,
      runCount: 2,
      cleanOutput: false,
    },
    outputs: {
      inputHash: first.inputHash,
      buildInputManifestHash: first.buildInputManifestHash,
      buildInputManifestPath: first.buildInputManifestPath ?? BUILD_INPUT_MANIFEST_PATH,
      buildInputTrustAnchor: first.buildInputTrustAnchor ?? "UNKNOWN",
      buildInputFiles: (first.buildInputFiles ?? []).map((file) => ({
        path: file.path,
        bytes: file.bytes,
        sha256: file.sha256,
        ...(file.gitBlobOid ? { gitBlobOid: file.gitBlobOid } : {}),
      })),
      artifactFileCount: first.artifactFileCount,
      artifactTotalBytes: first.artifactTotalBytes,
      artifactTreeHash: first.artifactTreeHash,
      buildManifestHash: first.buildManifestHash,
      sourceToDistProvenanceHash: first.provenanceHash,
      identicalSecondRun: first.artifactTreeHash === second.artifactTreeHash,
    },
  };
}

function createDiagnosticReceipt(diagnostic, exitCode, differences = []) {
  return {
    schemaVersion: QUALIFICATION_SCHEMA_VERSION,
    qualification: QUALIFICATION,
    status: exitCode === 1 ? "FAIL" : "BLOCKED",
    diagnostic,
    exitCode,
    differences,
  };
}

function diagnosticFromError(error) {
  if (error instanceof QualificationError) return error.code;
  const message = error instanceof Error ? error.message : String(error);
  return Object.values(DIAGNOSTICS).find((code) =>
    message === code || message.startsWith(`${code}:`)
  ) ?? DIAGNOSTICS.QUALIFICATION_FAILED;
}

function diagnosticExitCode(code) {
  if (
    code === DIAGNOSTICS.SOURCE_MUTATED ||
    code === DIAGNOSTICS.WORKTREE_CHANGED ||
    code === DIAGNOSTICS.BUILD_INPUT_UNAVAILABLE ||
    code === DIAGNOSTICS.BUILD_INPUT_INVALID ||
    code === DIAGNOSTICS.BUILD_INPUT_HEAD_UNAVAILABLE ||
    code === DIAGNOSTICS.BUILD_INPUT_HEAD_MISMATCH ||
    code === DIAGNOSTICS.TOOLCHAIN_MISMATCH ||
    code === DIAGNOSTICS.TOOLCHAIN_UNAVAILABLE ||
    code === DIAGNOSTICS.CLEANUP_TARGET_REPLACED ||
    code === DIAGNOSTICS.CLEANUP_FAILED ||
    code === DIAGNOSTICS.OUTPUT_RACE_DETECTED ||
    code === DIAGNOSTICS.PRIVATE_OUTPUT_REQUIRED ||
    code === DIAGNOSTICS.OUTPUT_BOUNDARY_INVALID ||
    code === DIAGNOSTICS.DIRTY_WORKTREE ||
    code === DIAGNOSTICS.GIT_STATUS_UNAVAILABLE
  ) return 2;
  return 1;
}

async function runRealQualification({
  repoRoot = defaultRepoRoot,
  sourceRoot = repoRoot,
  entries = includeEntries,
  providers: suppliedProviders,
  stageAssets = stageWebAssets,
  tempRootFactory = (prefix) => mkdtemp(prefix),
} = {}) {
  let temporaryParent;
  let temporaryRoot;
  let temporaryParentOwnership;
  let ownership;
  let temporaryRootCleaned = false;
  let result;
  let validatedToolchain;
  const providers = {
    ...createQualificationProviders({ repoRoot, sourceRoot, entries }),
    ...(suppliedProviders ?? {}),
  };
  try {
    let initialCheckpoint;
    let initialStatusOutput;
    try {
      initialStatusOutput = String(await providers.getStatusOutput());
    } catch (error) {
      result = {
        exitCode: 2,
        receipt: createDiagnosticReceipt(DIAGNOSTICS.GIT_STATUS_UNAVAILABLE, 2),
      };
    }
    if (!result && initialStatusOutput.length > 0) {
      result = {
        exitCode: 2,
        receipt: createDiagnosticReceipt(DIAGNOSTICS.DIRTY_WORKTREE, 2),
      };
    }
    if (!result) {
      try {
        initialCheckpoint = await captureCheckpoint({ providers });
      } catch (error) {
        const diagnostic = diagnosticFromError(error);
        result = {
          exitCode: 2,
          receipt: createDiagnosticReceipt(diagnostic, 2),
        };
      }
    }
    if (!result) {
      try {
        validatedToolchain = await validateToolchain({ providers });
        const beforeTemp = await captureCheckpoint({ providers });
        assertCheckpointStable(initialCheckpoint, beforeTemp);

        temporaryParent = await tempRootFactory(
          path.join(os.tmpdir(), "pixieed-fp007-"),
        );
        temporaryParentOwnership = await createOwnedDirectoryIdentity(
          temporaryParent,
        );
        temporaryRoot = await mkdtemp(path.join(temporaryParent, "run-"));
        ownership = await createOwnedDirectoryIdentity(temporaryRoot);
        const firstDistRoot = path.join(temporaryRoot, "dist-1");
        const secondDistRoot = path.join(temporaryRoot, "dist-2");
        await mkdir(firstDistRoot);
        await mkdir(secondDistRoot);

        const checkpointBeforeA = await captureCheckpoint({ providers });
        assertCheckpointStable(initialCheckpoint, checkpointBeforeA);
        await stageAssets({
          entries,
          sourceRoot,
          distRoot: firstDistRoot,
          cleanOutput: false,
          externalOutputBoundary: temporaryRoot,
        });
        const checkpointAfterA = await captureCheckpoint({ providers });
        assertCheckpointStable(initialCheckpoint, checkpointAfterA);

        const checkpointBeforeB = await captureCheckpoint({ providers });
        assertCheckpointStable(initialCheckpoint, checkpointBeforeB);
        await stageAssets({
          entries,
          sourceRoot,
          distRoot: secondDistRoot,
          cleanOutput: false,
          externalOutputBoundary: temporaryRoot,
        });
        const checkpointAfterB = await captureCheckpoint({ providers });
        assertCheckpointStable(initialCheckpoint, checkpointAfterB);

        const first = await createQualificationInput({
          distRoot: firstDistRoot,
          sourceRoot,
          entries,
          inputHash: checkpointAfterA.inputHash,
          buildInputManifestHash: checkpointAfterA.buildInputManifestHash,
          buildInputManifestPath: checkpointAfterA.buildInputManifestPath,
          buildInputTrustAnchor: checkpointAfterA.buildInputTrustAnchor,
          buildInputFiles: checkpointAfterA.buildInputFiles,
        });
        const second = await createQualificationInput({
          distRoot: secondDistRoot,
          sourceRoot,
          entries,
          inputHash: checkpointAfterB.inputHash,
          buildInputManifestHash: checkpointAfterB.buildInputManifestHash,
          buildInputManifestPath: checkpointAfterB.buildInputManifestPath,
          buildInputTrustAnchor: checkpointAfterB.buildInputTrustAnchor,
          buildInputFiles: checkpointAfterB.buildInputFiles,
        });
        const beforeReceipt = await captureCheckpoint({ providers });
        assertCheckpointStable(initialCheckpoint, beforeReceipt);
        const comparison = compareQualificationInputs(first, second);
        if (!comparison.equal) {
          result = {
            exitCode: 1,
            receipt: createDiagnosticReceipt(
              DIAGNOSTICS.QUALIFICATION_FAILED,
              1,
              comparison.differences,
            ),
          };
        } else {
          result = {
            exitCode: 0,
            receipt: createSanitizedReceipt({
              headCommit: initialCheckpoint.headCommit,
              nodeVersion: validatedToolchain.nodeVersion,
              npmVersion: validatedToolchain.npmVersion,
              entries,
              first,
              second,
            }),
          };
        }
      } catch (error) {
        const diagnostic = diagnosticFromError(error);
        const exitCode = diagnosticExitCode(diagnostic);
        result = {
          exitCode,
          receipt: createDiagnosticReceipt(
            diagnostic,
            exitCode,
            error instanceof QualificationError ? error.details : [],
          ),
        };
      }
    }
  } finally {
    if (temporaryRoot && ownership) {
      try {
        await cleanupOwnedTemporaryRoot(temporaryRoot, ownership);
        temporaryRootCleaned = true;
      } catch (error) {
        const diagnostic = diagnosticFromError(error);
        result = {
          exitCode: 2,
          receipt: createDiagnosticReceipt(diagnostic, 2),
        };
      }
    }
    if (temporaryParent && temporaryParentOwnership && temporaryRootCleaned) {
      try {
        await cleanupOwnedTemporaryRoot(
          temporaryParent,
          temporaryParentOwnership,
        );
      } catch {
        result = {
          exitCode: 2,
          receipt: createDiagnosticReceipt(DIAGNOSTICS.CLEANUP_FAILED, 2),
        };
      }
    }
  }
  return result;
}

async function main() {
  const result = await runRealQualification();
  process.stdout.write(`${JSON.stringify(result.receipt)}\n`);
  process.exitCode = result.exitCode;
}

export {
  assertCheckpointStable,
  canonicalJson,
  captureCheckpoint,
  cleanupOwnedTemporaryRoot,
  compareCodeUnitStrings,
  compareQualificationInputs,
  createDiagnosticReceipt,
  createOwnedDirectoryIdentity,
  createQualificationInput,
  createQualificationProviders,
  createSanitizedReceipt,
  BUILD_INPUT_MANIFEST_PATH,
  BUILD_INPUT_MANIFEST_SCHEMA_VERSION,
  DIAGNOSTICS,
  expectedArtifactPaths,
  inventoryBuildInputs,
  inventorySourceEntries,
  inventoryTree,
  QUALIFICATION,
  runRealQualification,
  REQUIRED_BUILD_CONTROL_ENTRIES,
  sha256Hex,
  validateToolchain,
};

const isMainModule = process.argv[1] &&
  path.resolve(process.argv[1]) === scriptPath;
if (isMainModule) {
  main().catch(() => {
    process.stdout.write(
      `${
        JSON.stringify(
          createDiagnosticReceipt(DIAGNOSTICS.QUALIFICATION_FAILED, 1),
        )
      }\n`,
    );
    process.exitCode = 1;
  });
}
