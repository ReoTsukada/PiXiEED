import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUILD_MANIFEST_SCHEMA_VERSION,
  REPOSITORY_RELATIVE_OUTPUT_ROOT,
  REPOSITORY_RELATIVE_SOURCE_ROOT,
  canonicalBuildManifestJson,
  createBuildManifest,
  createCopyPlan,
  getRuntimeEntryFiles,
  includeEntries,
  stageWebAssets,
} from '../app-shell/pixieed-capacitor/scripts/stage-web-assets.mjs';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const expectedEntries = [
  'account',
  'account-deletion',
  'assets',
  'character-dots',
  'contact',
  'data',
  'events',
  'glossary',
  'help',
  'icon',
  'images',
  'index.html',
  'maoitu',
  'market',
  'manifest.webmanifest',
  'notes',
  'notice',
  'pixiedraw',
  'pixiedraw2',
  'pixfind',
  'pixiee-lens',
  'PiXiEEDogp.png',
  'portfolio',
  'post',
  'privacy',
  'projects',
  'qr',
  'qr-maker',
  'robots.txt',
  'scripts',
  'scripts.js',
  'site',
  'sitemap.xml',
  'styles.css',
  'studio',
  'terms'
];

assert.deepEqual(includeEntries, expectedEntries, 'staging entry list must remain unchanged');

const firstManifest = createBuildManifest(includeEntries);
const secondManifest = createBuildManifest([...includeEntries]);
assert.equal(firstManifest.schemaVersion, BUILD_MANIFEST_SCHEMA_VERSION);
assert.equal(firstManifest.sourceRoot, REPOSITORY_RELATIVE_SOURCE_ROOT);
assert.equal(firstManifest.outputRoot, REPOSITORY_RELATIVE_OUTPUT_ROOT);
assert.deepEqual(firstManifest.entries, expectedEntries);

const firstBytes = Buffer.from(canonicalBuildManifestJson(firstManifest), 'utf8');
const secondBytes = Buffer.from(canonicalBuildManifestJson(secondManifest), 'utf8');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.deepEqual(firstBytes, secondBytes, 'same fixture input must produce identical canonical bytes');
assert.equal(sha256(firstBytes), sha256(secondBytes), 'same fixture input must produce identical hash');

const serialized = firstBytes.toString('utf8');
for (const forbidden of [
  'generatedAt',
  'appRoot',
  'repoRoot',
  'webRoot',
  '/Users/',
  '/Users/',
  'hostname',
  'username'
]) {
  assert.equal(serialized.includes(forbidden), false, `manifest must not include ${forbidden}`);
}
assert.equal(firstManifest.sourceRoot.startsWith('/'), false);
assert.equal(firstManifest.outputRoot.startsWith('/'), false);
assert.equal(firstManifest.outputRoot.includes('..'), false);

const sourceFixture = '/tmp/fp007-stage-source';
const outputFixture = '/tmp/fp007-stage-output';
const plan = createCopyPlan(expectedEntries, sourceFixture, outputFixture);
assert.equal(plan.length, expectedEntries.length);
assert.deepEqual(plan.map(({ entry }) => entry), expectedEntries);
assert.equal(plan[0].sourcePath, `${sourceFixture}/account`);
assert.equal(plan[0].targetPath, `${outputFixture}/account`);
assert.equal(plan.at(-1).sourcePath, `${sourceFixture}/terms`);
assert.equal(plan.at(-1).targetPath, `${outputFixture}/terms`);

const pixiedraw2RuntimeFiles = getRuntimeEntryFiles('pixiedraw2');
assert.ok(Array.isArray(pixiedraw2RuntimeFiles));
assert.ok(pixiedraw2RuntimeFiles.length > 0);
assert.equal(getRuntimeEntryFiles('pixiedraw'), null);
assert.equal(
  pixiedraw2RuntimeFiles.some((file) =>
    /^(?:src|tests|benchmarks|docs|fixtures)(?:\/|$)/u.test(file) ||
    /(?:^|\/)(?:deno\.json|deno\.lock)$/u.test(file)
  ),
  false,
  'runtime allowlist must not include development-only files',
);

async function listFiles(rootPath, prefix = '') {
  const files = [];
  const entries = await readdir(rootPath, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(absolutePath, relativePath));
    } else {
      files.push(relativePath);
    }
  }
  return files;
}

const stagingParent = await mkdtemp(path.join(os.tmpdir(), 'pixieed-stage-manifest-'));
try {
  const stagedRoot = path.join(stagingParent, 'dist');
  await stageWebAssets({
    entries: ['pixiedraw2'],
    sourceRoot: repoRoot,
    distRoot: stagedRoot,
    cleanOutput: false,
    externalOutputBoundary: stagingParent,
  });
  const stagedFiles = await listFiles(stagedRoot);
  const expectedRuntimeFiles = [
    'build-manifest.json',
    ...pixiedraw2RuntimeFiles.map((file) => `web/pixiedraw2/${file}`),
  ].sort((left, right) => left.localeCompare(right));
  assert.deepEqual(
    stagedFiles,
    expectedRuntimeFiles,
    'pixiedraw2 staging must contain only the runtime allowlist',
  );
  await stat(path.join(stagedRoot, 'web/pixiedraw2/dist/draw2-entry.js'));
  await stat(path.join(stagedRoot, 'web/pixiedraw2/dist/wp180-workspace.js'));
  await assert.rejects(
    stat(path.join(stagedRoot, 'web/pixiedraw2/src')),
    /ENOENT/u,
  );
  await assert.rejects(
    stat(path.join(stagedRoot, 'web/pixiedraw2/tests')),
    /ENOENT/u,
  );
} finally {
  await rm(stagingParent, { recursive: true, force: true });
}

console.log(`Capacitor staging manifest fixture PASS (${expectedEntries.length} entries, sha256=${sha256(firstBytes)})`);
