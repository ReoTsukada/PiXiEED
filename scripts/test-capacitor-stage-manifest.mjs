import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  BUILD_MANIFEST_SCHEMA_VERSION,
  REPOSITORY_RELATIVE_OUTPUT_ROOT,
  REPOSITORY_RELATIVE_SOURCE_ROOT,
  canonicalBuildManifestJson,
  createBuildManifest,
  createCopyPlan,
  includeEntries
} from '../app-shell/pixieed-capacitor/scripts/stage-web-assets.mjs';

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

console.log(`Capacitor staging manifest fixture PASS (${expectedEntries.length} entries, sha256=${sha256(firstBytes)})`);
