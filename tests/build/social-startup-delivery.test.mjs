import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { optimizeSocialStartupDelivery, prepareSocialStartupDelivery } from '../../scripts/social-startup-delivery.mjs';
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const esbuildPath = process.env.PIXIEED_ESBUILD_PATH || path.join(repositoryRoot, 'node_modules/.bin/esbuild');

test('social startup preserves ESM identities and lazy boundaries, preloading only static dependencies', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pixieed-social-delivery-test-'));
  try {
    const sources = {
      'feed/index.html': '<head></head><script type="module" src="/js/social/app.mjs?rev=one"></script>',
      'profile/index.html': '<head></head><script type="module" src="/js/profile.mjs"></script>',
      'js/social/app.mjs': "import { value } from './api.mjs?rev=two';\nexport function readValue() { return value; }\nexport const lazy = () => import('./later.mjs?rev=three');\n",
      'js/social/api.mjs': "import { value as shared } from '../shared.mjs';\nexport const value = shared;\n",
      'js/shared.mjs': 'export const value = 42;\n',
    };
    for (const [file, source] of Object.entries(sources)) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), source);
    }
    const finish = await prepareSocialStartupDelivery({ root, files: Object.keys(sources), esbuildPath });
    assert.equal(await readFile(path.join(root, 'js/social/app.mjs'), 'utf8'), sources['js/social/app.mjs'], 'Preparation must not minify shared files before other build graph analyzers run.');
    await writeFile(path.join(root, 'feed/index.html'), sources['feed/index.html'].replace('<head>', '<head><meta name="other-build-pass" content="kept">'));
    const report = await finish();
    assert.equal(report.moduleRequestsBefore, 3);
    assert.equal(report.moduleRequestsAfter, 3);
    assert.equal(report.discoveryRoundsBefore, 3);
    assert.equal(report.discoveryRoundsAfter, 1);
    const html = await readFile(path.join(root, 'feed/index.html'), 'utf8');
    assert.match(html, /href="\/js\/social\/api.mjs\?rev=two"/);
    assert.match(html, /href="\/js\/shared.mjs"/);
    assert.doesNotMatch(html, /later.mjs/);
    assert.match(html, /other-build-pass/);
    assert.equal(await readFile(path.join(root, 'profile/index.html'), 'utf8'), sources['profile/index.html']);
    const entry = await readFile(path.join(root, 'js/social/app.mjs'), 'utf8');
    assert.match(entry, /import\("\.\/later.mjs\?rev=three"\)/);
    const built = await import(new URL('file://' + root + '/js/social/app.mjs'));
    assert.equal(built.readValue(), 42);
    assert.equal(typeof built.lazy, 'function');
    assert.doesNotMatch(entry, new RegExp(root));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('social startup refuses the source checkout', async () => {
  await assert.rejects(optimizeSocialStartupDelivery({ root: repositoryRoot, files: [], esbuildPath }), /outside the source checkout/);
});

test('current social graph compiles reproducibly without bundling state or optional features', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pixieed-social-real-test-'));
  try {
    for (const directory of ['js', 'data', 'feed', 'explore']) await cp(path.join(repositoryRoot, directory), path.join(root, directory), { recursive: true });
    const sourceEntry = await readFile(path.join(repositoryRoot, 'js/social/app.mjs'), 'utf8');
    const report = await optimizeSocialStartupDelivery({ root, files: ['feed/index.html', 'explore/index.html'], esbuildPath });
    assert.deepEqual(report.htmlRoutes, ['feed/index.html', 'explore/index.html']);
    assert(report.beforeRawBytes > report.afterRawBytes);
    assert(report.beforeGzipBytes > report.afterGzipBytes);
    assert(!report.minifiedPaths.includes('js/social/server-actions.mjs'));
    assert(!report.minifiedPaths.includes('js/social/guest-account-ui.mjs'));
    assert(!report.minifiedPaths.includes('js/ads/ordinary-ad-provider.mjs'));
    const entry = await readFile(path.join(root, 'js/social/app.mjs'), 'utf8');
    assert.match(entry, /\.\/tool-handoff.mjs\?rev=/);
    assert.match(entry, /\.\/guest-account-ui.mjs/);
    const second = path.join(root, 'second');
    for (const directory of ['js', 'data', 'feed', 'explore']) await cp(path.join(repositoryRoot, directory), path.join(second, directory), { recursive: true });
    const repeated = await optimizeSocialStartupDelivery({ root: second, files: ['feed/index.html', 'explore/index.html'], esbuildPath });
    assert.deepEqual(repeated, report);
    for (const file of [...report.minifiedPaths, ...report.htmlRoutes]) {
      assert.deepEqual(await readFile(path.join(root, file)), await readFile(path.join(second, file)), `Reproducible output for ${file}`);
    }
    assert.equal(await readFile(path.join(repositoryRoot, 'js/social/app.mjs'), 'utf8'), sourceEntry);
    console.log('Social delivery graph:', JSON.stringify(report));
  } finally { await rm(root, { recursive: true, force: true }); }
});
