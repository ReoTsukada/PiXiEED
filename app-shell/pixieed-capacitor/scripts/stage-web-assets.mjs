import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rename,
  rmdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(appRoot, "../..");
const canonicalDistRoot = path.join(appRoot, "dist");
const webRoot = path.join(canonicalDistRoot, "web");
const shouldCheckOnly = process.argv.includes("--check");
const BUILD_MANIFEST_SCHEMA_VERSION = 1;
const REPOSITORY_RELATIVE_SOURCE_ROOT = ".";
const REPOSITORY_RELATIVE_OUTPUT_ROOT = "app-shell/pixieed-capacitor/dist/web";
const REFUSE_EXTERNAL_OUTPUT_DELETE = "REFUSE_EXTERNAL_OUTPUT_DELETE";
const EXTERNAL_OUTPUT_NOT_EMPTY = "EXTERNAL_OUTPUT_NOT_EMPTY";
const EXTERNAL_OUTPUT_BOUNDARY_REQUIRED = "EXTERNAL_OUTPUT_BOUNDARY_REQUIRED";
const OUTPUT_BOUNDARY_INVALID = "OUTPUT_BOUNDARY_INVALID";
const OUTPUT_PATH_SYMLINK = "OUTPUT_PATH_SYMLINK";
const OUTPUT_RACE_DETECTED = "OUTPUT_RACE_DETECTED";
const PRIVATE_OUTPUT_REQUIRED = "PRIVATE_OUTPUT_REQUIRED";

const includeEntries = Object.freeze([
  "account",
  "account-deletion",
  "assets",
  "character-dots",
  "contact",
  "data",
  "events",
  "glossary",
  "help",
  "icon",
  "images",
  "index.html",
  "maoitu",
  "market",
  "manifest.webmanifest",
  "notes",
  "notice",
  "pixiedraw",
  "pixiedraw2",
  "pixfind",
  "pixiee-lens",
  "PiXiEEDogp.png",
  "portfolio",
  "post",
  "privacy",
  "projects",
  "qr",
  "qr-maker",
  "robots.txt",
  "scripts",
  "scripts.js",
  "site",
  "sitemap.xml",
  "styles.css",
  "studio",
  "terms",
]);

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function createBuildManifest(entries = includeEntries) {
  return {
    schemaVersion: BUILD_MANIFEST_SCHEMA_VERSION,
    sourceRoot: REPOSITORY_RELATIVE_SOURCE_ROOT,
    outputRoot: REPOSITORY_RELATIVE_OUTPUT_ROOT,
    entries: [...entries],
  };
}

function canonicalBuildManifestJson(manifest) {
  return JSON.stringify({
    schemaVersion: manifest.schemaVersion,
    sourceRoot: manifest.sourceRoot,
    outputRoot: manifest.outputRoot,
    entries: [...manifest.entries],
  });
}

function createCopyPlan(
  entries = includeEntries,
  sourceRoot = repoRoot,
  outputRoot = webRoot,
) {
  return entries.map((entry) => ({
    entry,
    sourcePath: path.join(sourceRoot, entry),
    targetPath: path.join(outputRoot, entry),
  }));
}

function buildLauncherHtml() {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <title>PiXiEEDstudio</title>
  <meta name="theme-color" content="#020816"/>
  <style>
    :root {
      color-scheme: dark;
      --bg: #020816;
      --panel: rgba(15, 23, 42, 0.96);
      --line: rgba(148, 163, 184, 0.28);
      --text: #f8fafc;
      --sub: #cbd5e1;
      --accent: #7dd3fc;
      --accent-strong: #38bdf8;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      min-height: 100%;
      background:
        radial-gradient(circle at top left, rgba(56, 189, 248, 0.18), transparent 35%),
        radial-gradient(circle at top right, rgba(34, 197, 94, 0.12), transparent 28%),
        var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body {
      display: grid;
      place-items: center;
      padding: 20px;
    }
    .app-home {
      width: min(720px, 100%);
      border: 1px solid var(--line);
      border-radius: 24px;
      background: var(--panel);
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
      padding: 24px;
      display: grid;
      gap: 18px;
    }
    .brand {
      display: flex;
      gap: 14px;
      align-items: center;
    }
    .brand img {
      width: 64px;
      height: 64px;
      border-radius: 18px;
      image-rendering: pixelated;
    }
    .brand h1 {
      margin: 0;
      font-size: clamp(28px, 5vw, 40px);
      line-height: 1.1;
    }
    .brand p,
    .lead,
    .meta {
      margin: 0;
      color: var(--sub);
      line-height: 1.6;
    }
    .actions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }
    .action {
      border: 1px solid rgba(125, 211, 252, 0.22);
      border-radius: 18px;
      padding: 16px;
      color: inherit;
      text-decoration: none;
      background: rgba(15, 23, 42, 0.85);
      display: grid;
      gap: 8px;
    }
    .action strong {
      font-size: 17px;
      line-height: 1.3;
    }
    .action span {
      color: var(--sub);
      line-height: 1.5;
      font-size: 14px;
    }
    .action--primary {
      background: linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(14, 165, 233, 0.08));
      border-color: rgba(56, 189, 248, 0.42);
    }
    .meta {
      font-size: 13px;
    }
  </style>
</head>
<body>
  <main class="app-home">
    <section class="brand">
      <img src="./icon/icon-512-4.png" alt="PiXiEED icon"/>
      <div>
        <p class="meta">PiXiEEDstudio</p>
        <h1>PiXiEED</h1>
      </div>
    </section>
    <p class="lead">打って、奏でて、作品にする。PiXiEED の主要機能へこのホームから移動できます。</p>
    <section class="actions">
      <a class="action action--primary" href="./studio/index.html">
        <strong>PiXiEEDstudio を開く</strong>
        <span>iDRAW・iAUDIO・iGAMEから制作を始めます。</span>
      </a>
      <a class="action" href="./pixiee-lens/index.html">
        <strong>PiXiEELENS</strong>
        <span>カメラ撮影からドット化して Draw へ持ち込めます。</span>
      </a>
      <a class="action" href="./pixfind/index.html">
        <strong>PiXFiND</strong>
        <span>ドット絵の間違い探し・もの探しを遊んだり作ったりできます。</span>
      </a>
      <a class="action" href="./tools.html">
        <strong>ツール一覧</strong>
        <span>PiXiEED の各ツールを確認できます。</span>
      </a>
      <a class="action" href="./public-room.html">
        <strong>公開中の部屋</strong>
        <span>みんなで一緒に描いている部屋へ参加できます。</span>
      </a>
    </section>
    <p class="meta">PiXiEED の各機能を 1 つのアプリから行き来できるホームです。</p>
  </main>
</body>
</html>
`;
}

function directoryIdentityFromStat(targetPath, targetStat, resolvedPath) {
  return {
    path: path.resolve(targetPath),
    resolvedPath,
    device: targetStat.dev,
    inode: targetStat.ino,
    uid: targetStat.uid ?? null,
    mode: targetStat.mode & 0o777,
  };
}

function sameDirectoryIdentity(left, right) {
  return left && right && left.path === right.path &&
    left.resolvedPath === right.resolvedPath &&
    left.device === right.device && left.inode === right.inode &&
    left.uid === right.uid;
}

async function assertPrivateDirectory(targetPath, code = PRIVATE_OUTPUT_REQUIRED) {
  let targetStat;
  try {
    targetStat = await lstat(targetPath);
  } catch (error) {
    throw new Error(`${code}: directory unavailable`, { cause: error });
  }
  if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) {
    throw new Error(`${code}: directory must be a real directory`);
  }
  if ((targetStat.mode & 0o077) !== 0) {
    throw new Error(`${code}: directory permissions are not private`);
  }
  if (typeof process.getuid === "function" && targetStat.uid !== process.getuid()) {
    throw new Error(`${code}: directory owner mismatch`);
  }
  const resolvedPath = await realpath(targetPath);
  return directoryIdentityFromStat(targetPath, targetStat, resolvedPath);
}

async function assertExternalOutputBoundary({
  distRoot,
  externalOutputBoundary,
}) {
  if (typeof externalOutputBoundary !== "string") {
    throw new Error(EXTERNAL_OUTPUT_BOUNDARY_REQUIRED);
  }
  const resolvedBoundary = path.resolve(externalOutputBoundary);
  const resolvedDistRoot = path.resolve(distRoot);
  const boundaryIdentity = await assertPrivateDirectory(
    resolvedBoundary,
    OUTPUT_BOUNDARY_INVALID,
  );
  const boundaryRealPath = boundaryIdentity.resolvedPath;
  const relativeDist = path.relative(resolvedBoundary, resolvedDistRoot);
  if (
    relativeDist.length === 0 || relativeDist.startsWith(`..${path.sep}`) ||
    relativeDist === ".." || path.isAbsolute(relativeDist)
  ) {
    throw new Error(
      `${OUTPUT_BOUNDARY_INVALID}: output must be a strict descendant`,
    );
  }

  let currentPath = resolvedBoundary;
  for (const segment of relativeDist.split(path.sep)) {
    currentPath = path.join(currentPath, segment);
    try {
      const currentStat = await lstat(currentPath);
      if (currentStat.isSymbolicLink()) {
        throw new Error(`${OUTPUT_PATH_SYMLINK}: ${currentPath}`);
      }
      if (!currentStat.isDirectory()) {
        throw new Error(`${OUTPUT_BOUNDARY_INVALID}: non-directory component`);
      }
      const currentRealPath = await realpath(currentPath);
      const relativeReal = path.relative(boundaryRealPath, currentRealPath);
      if (
        relativeReal.length === 0 || relativeReal.startsWith(`..${path.sep}`) ||
        relativeReal === ".." || path.isAbsolute(relativeReal)
      ) {
        throw new Error(`${OUTPUT_BOUNDARY_INVALID}: canonical path escaped`);
      }
    } catch (error) {
      if (error && error.code === "ENOENT") break;
      throw error;
    }
  }
  return boundaryIdentity;
}

async function copyEntry(
  entry,
  sourceRoot = repoRoot,
  outputRoot = webRoot,
  externalOutputBoundary,
) {
  if (externalOutputBoundary !== undefined) {
    await assertExternalOutputBoundary({
      distRoot: path.dirname(outputRoot),
      externalOutputBoundary,
    });
  }
  const sourcePath = path.join(sourceRoot, entry);
  const targetPath = path.join(outputRoot, entry);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await cp(sourcePath, targetPath, {
    recursive: true,
    force: true,
    filter: (source) => !source.endsWith(".DS_Store"),
  });
}

async function copyEntries(
  entries = includeEntries,
  sourceRoot = repoRoot,
  outputRoot = webRoot,
  externalOutputBoundary,
) {
  for (const entry of entries) {
    await copyEntry(
      entry,
      sourceRoot,
      outputRoot,
      externalOutputBoundary,
    );
  }
}

function validateEntryName(entry) {
  if (
    typeof entry !== "string" || entry.length === 0 || path.isAbsolute(entry)
  ) {
    throw new Error(`INVALID_SOURCE_ENTRY: ${String(entry)}`);
  }
  const segments = entry.split(/[\\/]+/);
  if (
    segments.includes("..") || segments.some((segment) => segment.length === 0)
  ) {
    throw new Error(`INVALID_SOURCE_ENTRY: ${entry}`);
  }
}

async function validateEntries(
  entries = includeEntries,
  sourceRoot = repoRoot,
) {
  const missing = [];
  for (const entry of entries) {
    validateEntryName(entry);
    const sourcePath = path.join(sourceRoot, entry);
    if (!(await pathExists(sourcePath))) {
      missing.push(entry);
    }
  }
  if (missing.length) {
    throw new Error(`Missing source entries: ${missing.join(", ")}`);
  }
}

async function assertExternalOutputIsEmpty(distRoot) {
  try {
    const outputStat = await lstat(distRoot);
    if (outputStat.isSymbolicLink()) {
      throw new Error(`${OUTPUT_PATH_SYMLINK}: ${distRoot}`);
    }
    if (!outputStat.isDirectory()) {
      throw new Error(`${EXTERNAL_OUTPUT_NOT_EMPTY}: ${distRoot}`);
    }
    const children = await readdir(distRoot);
    if (children.length > 0) {
      throw new Error(`${EXTERNAL_OUTPUT_NOT_EMPTY}: ${distRoot}`);
    }
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function removeEmptyOutputDirectory(distRoot) {
  try {
    const outputStat = await lstat(distRoot);
    if (outputStat.isSymbolicLink() || !outputStat.isDirectory()) {
      throw new Error(`${OUTPUT_PATH_SYMLINK}: output target changed`);
    }
    const children = await readdir(distRoot);
    if (children.length > 0) {
      throw new Error(`${EXTERNAL_OUTPUT_NOT_EMPTY}: ${distRoot}`);
    }
    await rmdir(distRoot);
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    throw error;
  }
}

async function writeStagedAssets({ entries, sourceRoot, outputRoot }) {
  const outputWebRoot = path.join(outputRoot, "web");
  const manifestPath = path.join(outputRoot, "build-manifest.json");
  await mkdir(outputWebRoot, { recursive: true });
  await copyEntries(entries, sourceRoot, outputWebRoot);
  const manifest = createBuildManifest(entries);
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return { distRoot: outputRoot, manifest, manifestPath, outputWebRoot };
}

async function stageExternalWebAssets({
  entries,
  sourceRoot,
  distRoot,
  externalOutputBoundary,
  safetyHooks,
}) {
  const resolvedDistRoot = path.resolve(distRoot);
  const initialBoundary = await assertExternalOutputBoundary({
    distRoot: resolvedDistRoot,
    externalOutputBoundary,
  });
  const parentPath = path.dirname(resolvedDistRoot);
  const parentIdentity = await assertPrivateDirectory(parentPath);
  const parentRealPath = parentIdentity.resolvedPath;
  const relativeParent = path.relative(
    initialBoundary.resolvedPath,
    parentRealPath,
  );
  if (
    relativeParent.startsWith(`..${path.sep}`) || relativeParent === ".." ||
    path.isAbsolute(relativeParent)
  ) {
    throw new Error(`${OUTPUT_BOUNDARY_INVALID}: output parent escaped`);
  }
  await assertExternalOutputIsEmpty(resolvedDistRoot);

  let workingRoot;
  let workingRootRealPath;
  try {
    // The working child is created inside the verified private parent. The
    // final publish is a same-parent rename; Node does not expose openat(2)
    // for directory handles, so the parent is revalidated at each boundary.
    workingRoot = await mkdtemp(path.join(parentPath, ".pixiedeed-stage-"));
    workingRootRealPath = await realpath(workingRoot);
    const createdParent = await assertPrivateDirectory(parentPath);
    if (!sameDirectoryIdentity(parentIdentity, createdParent)) {
      throw new Error(`${OUTPUT_RACE_DETECTED}: output parent changed`);
    }

    await writeStagedAssets({ entries, sourceRoot, outputRoot: workingRoot });
    await assertExternalOutputBoundary({
      distRoot: workingRoot,
      externalOutputBoundary,
    });
    await assertPrivateDirectory(workingRoot);

    const currentBoundary = await assertExternalOutputBoundary({
      distRoot: resolvedDistRoot,
      externalOutputBoundary,
    });
    if (!sameDirectoryIdentity(initialBoundary, currentBoundary)) {
      throw new Error(`${OUTPUT_RACE_DETECTED}: output boundary changed`);
    }
    const currentParent = await assertPrivateDirectory(parentPath);
    if (!sameDirectoryIdentity(parentIdentity, currentParent)) {
      throw new Error(`${OUTPUT_RACE_DETECTED}: output parent changed`);
    }
    await removeEmptyOutputDirectory(resolvedDistRoot);
    const publishParent = await assertPrivateDirectory(parentPath);
    if (!sameDirectoryIdentity(parentIdentity, publishParent)) {
      throw new Error(`${OUTPUT_RACE_DETECTED}: output parent changed`);
    }

    // This hook is intentionally an exported-function test seam only. It is
    // placed after the last ordinary boundary check and immediately before a
    // final recheck plus the publish syscall. The production CLI never reads
    // or accepts it from argv/env/browser input.
    if (typeof safetyHooks?.beforeOutputPublish === "function") {
      await safetyHooks.beforeOutputPublish({
        boundary: externalOutputBoundary,
        distRoot: resolvedDistRoot,
        workingRoot,
      });
    }
    const finalBoundary = await assertExternalOutputBoundary({
      distRoot: resolvedDistRoot,
      externalOutputBoundary,
    });
    if (!sameDirectoryIdentity(initialBoundary, finalBoundary)) {
      throw new Error(`${OUTPUT_RACE_DETECTED}: output boundary changed`);
    }
    const finalParent = await assertPrivateDirectory(parentPath);
    if (!sameDirectoryIdentity(parentIdentity, finalParent)) {
      throw new Error(`${OUTPUT_RACE_DETECTED}: output parent changed`);
    }
    const finalWorkingRoot = await assertPrivateDirectory(workingRoot);
    if (finalWorkingRoot.resolvedPath !== workingRootRealPath) {
      throw new Error(`${OUTPUT_RACE_DETECTED}: working output changed`);
    }
    await rename(workingRoot, resolvedDistRoot);
    workingRoot = undefined;
    await assertExternalOutputBoundary({
      distRoot: resolvedDistRoot,
      externalOutputBoundary,
    });
    return {
      distRoot: resolvedDistRoot,
      manifest: createBuildManifest(entries),
      manifestPath: path.join(resolvedDistRoot, "build-manifest.json"),
      outputWebRoot: path.join(resolvedDistRoot, "web"),
    };
  } finally {
    if (workingRoot) {
      // Use the pre-publish real path. If a test replacement changed the
      // boundary to a symlink, cleaning the original path string could touch
      // the replacement target. Leaving a private temp behind is safer than
      // following an untrusted path.
      await rm(workingRootRealPath ?? workingRoot, {
        recursive: true,
        force: true,
      }).catch(() => {});
    }
  }
}

async function stageWebAssets({
  entries = includeEntries,
  sourceRoot = repoRoot,
  distRoot = canonicalDistRoot,
  cleanOutput = true,
  externalOutputBoundary,
  safetyHooks,
} = {}) {
  const resolvedDistRoot = path.resolve(distRoot);
  const resolvedCanonicalDistRoot = path.resolve(canonicalDistRoot);

  await validateEntries(entries, sourceRoot);

  if (!cleanOutput) {
    return stageExternalWebAssets({
      entries,
      sourceRoot,
      distRoot: resolvedDistRoot,
      externalOutputBoundary,
      safetyHooks,
    });
  }

  if (resolvedDistRoot !== resolvedCanonicalDistRoot) {
    throw new Error(REFUSE_EXTERNAL_OUTPUT_DELETE);
  }
  await rm(resolvedCanonicalDistRoot, { recursive: true, force: true });
  return writeStagedAssets({
    entries,
    sourceRoot,
    outputRoot: resolvedDistRoot,
  });
}

async function main() {
  await validateEntries(includeEntries, repoRoot);
  if (shouldCheckOnly) {
    console.log(
      `OK: ${includeEntries.length} entries are available for staging.`,
    );
    return;
  }

  await stageWebAssets({
    entries: includeEntries,
    sourceRoot: repoRoot,
    distRoot: canonicalDistRoot,
    cleanOutput: true,
  });

  console.log(`Staged ${includeEntries.length} entries into ${webRoot}`);
}

export {
  assertExternalOutputBoundary,
  BUILD_MANIFEST_SCHEMA_VERSION,
  canonicalBuildManifestJson,
  copyEntries,
  createBuildManifest,
  createCopyPlan,
  EXTERNAL_OUTPUT_BOUNDARY_REQUIRED,
  EXTERNAL_OUTPUT_NOT_EMPTY,
  includeEntries,
  OUTPUT_BOUNDARY_INVALID,
  OUTPUT_PATH_SYMLINK,
  OUTPUT_RACE_DETECTED,
  PRIVATE_OUTPUT_REQUIRED,
  REFUSE_EXTERNAL_OUTPUT_DELETE,
  REPOSITORY_RELATIVE_OUTPUT_ROOT,
  REPOSITORY_RELATIVE_SOURCE_ROOT,
  stageWebAssets,
  validateEntries,
};

const isMainModule = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
