import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  createSiteStartupRevisions,
  optimizeSiteStartupDelivery,
} from '../../scripts/site-startup-delivery.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const esbuildPath = path.join(repositoryRoot, 'node_modules/.bin/esbuild');
const sourcePaths = ['js/app.js', 'js/home-startup.mjs'];

test('site startup revisions include source, helper and pinned compiler content', () => {
  const base = { appSource: 'const app = 1;', homeStartupSource: 'import("./app.js?rev=one");', helperSource: 'helper-v1', esbuildVersion: '0.25.5' };
  const first = createSiteStartupRevisions(base);
  assert.notEqual(createSiteStartupRevisions({ ...base, appSource: 'const app = 2;' }).appRevision, first.appRevision);
  assert.notEqual(createSiteStartupRevisions({ ...base, helperSource: 'helper-v2' }).appRevision, first.appRevision);
  assert.notEqual(createSiteStartupRevisions({ ...base, homeStartupSource: 'import("./app.js?rev=two");' }).homeStartupRevision, first.homeStartupRevision);
  assert.throws(() => createSiteStartupRevisions({ ...base, esbuildVersion: '0.25.4' }), /Expected pinned esbuild/);
});

async function makeFixture(root) {
  const files = ['index.html', 'stores/index.html', 'guide/index.html', 'js/app.js', 'js/home-startup.mjs', 'js/site-header.mjs'];
  const sources = {
    'index.html': '<html><head><link rel="modulepreload" href="/js/home-startup.mjs?rev=old"></head><body><script type="module" src="/js/home-startup.mjs?rev=old"></script></body></html>',
    'stores/index.html': '<html><body><script type="module" src="/js/app.js?rev=old"></script><script type="module" src="/js/site-header.mjs?rev=keep"></script></body></html>',
    'guide/index.html': '<html><!-- app.js is mentioned in this comment --><body><script type="module" src="/js/app.js?rev=old"></script></body></html>',
    'js/app.js': "// app.js appears here as documentation, not an import.\nimport { mount } from './site-header.mjs?rev=keep';\nconst header = mount();\nfunction legacyMapRenderer() { return 'large legacy path'; }\nvoid header;\n",
    'js/home-startup.mjs': "// app.js comment should not look like a caller.\nimport './home-play.mjs?rev=preserve';\nexport function start(loadApp = () => import('./app.js?rev=old')) { return loadApp(); }\n",
    'js/site-header.mjs': 'export function mount() { return true; }\n',
  };
  for (const [relative, content] of Object.entries(sources)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return { files, sources };
}

test('owned build minifies app and home startup, revises all callers, and preserves canonical imports reproducibly', async () => {
  const before = Object.fromEntries(await Promise.all(sourcePaths.map(async relative => [relative, await readFile(path.join(repositoryRoot, relative), 'utf8')])));
  const tempBase = await mkdtemp(path.join(os.tmpdir(), 'pixieed-site-startup-test-'));
  const roots = [path.join(tempBase, 'one'), path.join(tempBase, 'two')];
  try {
    const reports = [];
    for (const root of roots) {
      const { files } = await makeFixture(root);
      reports.push(await optimizeSiteStartupDelivery({ root, files, esbuildPath }));
    }
    assert.deepEqual(reports[0], reports[1]);
    assert.equal(reports[0].htmlAppEntryCount, 2);
    assert.equal(reports[0].appModuleCallerCount, 1);
    assert.deepEqual(reports[0].minifiedPaths, ['js/app.js', 'js/home-startup.mjs']);
    assert.match(reports[0].revision, /^20261020-site-startup-1-app-[a-f0-9]{12}$/);
    assert.match(reports[0].homeStartupRevision, /^20261020-site-startup-1-home-[a-f0-9]{12}$/);
    assert(reports[0].app.outputBytes < reports[0].app.inputBytes);

    for (const relative of ['js/app.js', 'js/home-startup.mjs', 'index.html', 'stores/index.html', 'guide/index.html']) {
      const one = await readFile(path.join(roots[0], relative));
      const two = await readFile(path.join(roots[1], relative));
      assert.deepEqual(one, two, `Output bytes must be reproducible for ${relative}`);
      assert(!one.toString().includes(repositoryRoot), `${relative} must not disclose the source checkout path`);
      assert(!one.toString().includes(tempBase), `${relative} must not disclose the private build path`);
    }
    const app = await readFile(path.join(roots[0], 'js/app.js'), 'utf8');
    assert(app.includes('./site-header.mjs?rev=keep'), 'Standalone ESM import identity must be preserved.');
    assert(!app.includes('large legacy path'), 'Unreferenced legacy map code should be removed from the built app.');
    const startup = await readFile(path.join(roots[0], 'js/home-startup.mjs'), 'utf8');
    assert(startup.includes('./home-play.mjs?rev=preserve'), 'Unrelated canonical startup imports must remain unchanged.');
    assert(startup.includes(`./app.js?rev=${reports[0].revision}`), 'The dynamic app import must target the content revision.');
    const home = await readFile(path.join(roots[0], 'index.html'), 'utf8');
    assert.equal((home.match(new RegExp(`/js/home-startup\\.mjs\\?rev=${reports[0].homeStartupRevision}`, 'g')) || []).length, 2);
    for (const route of ['stores/index.html', 'guide/index.html']) {
      const html = await readFile(path.join(roots[0], route), 'utf8');
      assert(html.includes(`/js/app.js?rev=${reports[0].revision}`), `Missing app revision in ${route}`);
    }
  } finally {
    await rm(tempBase, { recursive: true, force: true });
  }
  const after = Object.fromEntries(await Promise.all(sourcePaths.map(async relative => [relative, await readFile(path.join(repositoryRoot, relative), 'utf8')])));
  assert.deepEqual(after, before, 'Build-only optimization must not change repository source.');
});

test('unexpected app.js module callers fail closed before output mutation', async () => {
  const tempBase = await mkdtemp(path.join(os.tmpdir(), 'pixieed-site-startup-contract-'));
  try {
    const { files } = await makeFixture(tempBase);
    const appPath = path.join(tempBase, 'js/other.mjs');
    await writeFile(appPath, "export const load = () => import('./app.js?rev=old');\n");
    files.push('js/other.mjs');
    const original = await readFile(path.join(tempBase, 'js/app.js'), 'utf8');
    await assert.rejects(optimizeSiteStartupDelivery({ root: tempBase, files, esbuildPath }), /Unexpected app\.js module caller set/);
    assert.equal(await readFile(path.join(tempBase, 'js/app.js'), 'utf8'), original);
    assert((await readFile(path.join(tempBase, 'index.html'), 'utf8')).includes('rev=old'));
  } finally {
    await rm(tempBase, { recursive: true, force: true });
  }
});

test('source checkout is rejected by the output guard while outside temporary builds are accepted', async () => {
  await assert.rejects(
    optimizeSiteStartupDelivery({ root: repositoryRoot, files: [], esbuildPath }),
    /only mutate an owned build output outside the source checkout/,
  );
});

test('current published app callers compile from an owned copy without changing source files', async () => {
  const trackedHtml = execFileSync('git', ['ls-files', '*.html'], { cwd: repositoryRoot, encoding: 'utf8' }).split('\n').filter(Boolean);
  const htmlCallers = [];
  for (const relative of trackedHtml) {
    const source = await readFile(path.join(repositoryRoot, relative), 'utf8');
    if (source.includes('/js/app.js?rev=')) htmlCallers.push(relative);
  }
  const files = [...htmlCallers, 'index.html', 'welcome/index.html', ...sourcePaths].filter((relative, index, all) => all.indexOf(relative) === index);
  const before = Object.fromEntries(await Promise.all([...sourcePaths, ...htmlCallers].map(async relative => [relative, await readFile(path.join(repositoryRoot, relative), 'utf8')])));
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'pixieed-site-startup-real-'));
  try {
    for (const relative of files) {
      const output = path.join(tempRoot, relative);
      await mkdir(path.dirname(output), { recursive: true });
      await copyFile(path.join(repositoryRoot, relative), output);
    }
    const report = await optimizeSiteStartupDelivery({ root: tempRoot, files, esbuildPath });
    assert.equal(report.htmlAppEntryCount, htmlCallers.length);
    assert.equal(report.appModuleCallerCount, 1);
    const app = await readFile(path.join(tempRoot, 'js/app.js'), 'utf8');
    assert(app.includes('./site-header.mjs?rev=20261024-common-tool-start-1'), 'Keep the current header identity while optimizing the app.');
    assert(!app.includes('function renderDiscoveryMap('), 'Unreferenced legacy map renderer should not ship in the optimized app copy.');
    const home = await readFile(path.join(tempRoot, 'welcome/index.html'), 'utf8');
    const portalHome = await readFile(path.join(tempRoot, 'index.html'), 'utf8');
    assert.match(portalHome, /<body class="home-portal">/);
    assert.match(portalHome, /src="\/js\/home-portal\.mjs\?rev=/);
    assert.doesNotMatch(portalHome, /\/js\/social\/app\.mjs|\/js\/home-startup\.mjs/);
    assert.equal((home.match(new RegExp(`/js/home-startup\\.mjs\\?rev=${report.homeStartupRevision}`, 'g')) || []).length, 2);
    for (const relative of htmlCallers) {
      const html = await readFile(path.join(tempRoot, relative), 'utf8');
      assert(html.includes(`/js/app.js?rev=${report.revision}`), `Missing app revision in ${relative}`);
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
  const after = Object.fromEntries(await Promise.all([...sourcePaths, ...htmlCallers].map(async relative => [relative, await readFile(path.join(repositoryRoot, relative), 'utf8')])));
  assert.deepEqual(after, before);
});
