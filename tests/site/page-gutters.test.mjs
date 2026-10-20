import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addPageGutters, PAGE_GUTTERS_STYLESHEET } from '../../scripts/page-gutters.mjs';
import { buildPagesSite } from '../../scripts/build-pages-site.mjs';

const html = '<!doctype html><html lang="ja"><head><title>Original title</title><link rel="canonical" href="https://pixieed.jp/example/"></head><body class="app-page"><main><p>Original page content.</p></main></body></html>';

test('only explicitly listed public and tool-landing routes receive a static gutter opt-in', () => {
  const routes = [
    ['index.html', 'home'], ['tools/index.html', 'listing'], ['about/index.html', 'content'],
    ['guide/index.html', 'content'], ['privacy/index.html', 'content'], ['help/index.html', 'legacy'],
    ['glossary/index.html', 'glossary'], ['stores/index.html', 'content'],
    ['stores/ecowashcafe-nakanoshima.html', 'content'], ['books/index.html', 'catalog'],
    ['pass/index.html', 'content'], ['events/index.html', 'events'],
    ['draw/index.html', 'tool-landing'], ['camera/index.html', 'tool-landing'],
    ['audio/index.html', 'tool-landing'], ['output/index.html', 'tool-landing'],
  ];
  for (const [path, kind] of routes) {
    const result = addPageGutters(html, path);
    assert.equal(result.skipped, false, path);
    assert.match(result.html, new RegExp(`data-page-gutters="${kind}"`), path);
    assert.ok(result.html.includes(PAGE_GUTTERS_STYLESHEET), path);
  }

  const generatedEventRoutes = new Set(['events/verified-event/index.html']);
  assert.match(addPageGutters(html, 'events/verified-event/index.html', { generatedEventRoutes }).html, /data-page-gutters="events"/);
  for (const path of [
    'draw/editor.html', 'audio/editor.html', 'camera/work/index.html', 'output/work/index.html',
    'play/spot-difference/index.html', 'globe/index.html', 'profile/index.html', 'collection/index.html',
    '404.html', 'events/unknown-event/index.html', 'events/../index.html',
  ]) {
    assert.deepEqual(addPageGutters(html, path), { html, added: false, skipped: true }, path);
  }
  assert.deepEqual(addPageGutters('<h1>not a document</h1>', 'index.html'), {
    html: '<h1>not a document</h1>', added: false, skipped: true,
  });
});

test('route transform is idempotent and changes only body opt-in plus one late stylesheet link', () => {
  const once = addPageGutters(html, 'about/index.html');
  assert.equal(once.added, true);
  const twice = addPageGutters(once.html, 'about/index.html');
  assert.deepEqual(twice, { html: once.html, added: false, skipped: false });
  assert.equal((once.html.match(/data-page-gutters-style/g) || []).length, 1);
  assert.ok(once.html.indexOf(PAGE_GUTTERS_STYLESHEET) < once.html.indexOf('</head>'));
  assert.equal(once.html.replace(/ data-page-gutters="content"/, '').replace(PAGE_GUTTERS_STYLESHEET + '\n', ''), html);

  const wrongKind = html.replace('<body class="app-page">', '<body class="app-page" data-page-gutters="home">');
  const normalized = addPageGutters(wrongKind, 'about/index.html');
  assert.equal((normalized.html.match(/data-page-gutters=/g) || []).length, 1);
  assert.match(normalized.html, /data-page-gutters="content"/);
});

test('stylesheet reserves desktop-only centered space and excludes active work surfaces', async () => {
  const css = await readFile(new URL('../../css/page-gutters.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(min-width: 1440px\)/);
  assert.match(css, /width: min\(1200px, calc\(100% - 320px\)\)/);
  assert.match(css, /body\[data-page-gutters="content"\][\s\S]*?\.pass-page\s*\{\s*width: min\(1200px, calc\(100% - 320px\)\);\s*max-width: 1200px;\s*margin-inline: auto;/);
  assert.match(css, /:is\(\.px-site-header \.px-header-inner, \.px-site-header\.px-header-inner,[\s\S]*?\)\s*\{\s*width: min\(1200px, calc\(100% - 320px\)\);\s*max-width: 1200px;\s*margin-inline: auto;/);
  assert.match(css, /\.container:not\(\.narrow\)/);
  assert.doesNotMatch(css, /\.narrow\s*\{/);
  assert.match(css, /max\(160px, calc\(\(100vw - 1200px\) \/ 2\)\)/);
  assert.match(css, /html:not\(\[data-tool-direct="work"\]\):not\(\[data-direct-loading\]\)/);
  assert.match(css, /:not\(\.tool-shell--workspace-open\):not\(:has\(\.tool-embed--expanded\)\)/);
  assert.match(css, /body\[data-page-gutters="content"\][\s\S]*?\.stores-globe/);
  assert.match(css, /\.event-site-header:not\(\.px-site-header\)/);
  assert.match(css, /\.site-menu[\s\S]*?right: var\(--page-gutters-edge\)/);
  assert.match(css, /:is\(\.pixieed-site-reward, \.toast, \.skip-link\)\s*\{\s*right: var\(--page-gutters-edge\)/);
  assert.match(css, /\.site-draw-cta\s*\{\s*padding-inline: var\(--page-gutters-edge\);/);
  assert.doesNotMatch(css, /#hpStage|\.hp-stage/);
  assert.doesNotMatch(css, /body\s*\{[^}]*\b(?:padding|transform|contain)\s*:/);
});

test('Pages review build copies the new untracked stylesheet and transforms generated routes', async t => {
  const scratch = await mkdtemp(join(tmpdir(), 'pixieed-page-gutters-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const root = join(scratch, 'source');
  await mkdir(root, { recursive: true });
  execFileSync('git', ['init', '-q', root]);
  const sourcePage = '<!doctype html><html><head><title>Source Home</title><link rel="canonical" href="https://pixieed.jp/"></head><body data-page="home"><main>Keep this text.</main></body></html>';
  await writeFile(join(root, 'index.html'), sourcePage);
  await mkdir(join(root, 'data'), { recursive: true });
  await writeFile(join(root, 'data/pixel-art-events.json'), '{"version":1,"events":[]}');
  execFileSync('git', ['add', 'index.html', 'data/pixel-art-events.json'], { cwd: root });

  const css = await readFile(new URL('../../css/page-gutters.css', import.meta.url), 'utf8');
  await mkdir(join(root, 'css'), { recursive: true });
  await writeFile(join(root, 'css/page-gutters.css'), css); // deliberately untracked review-build input
  const result = await buildPagesSite({ root, output: join(scratch, 'site') });

  const builtHome = await readFile(join(result.output, 'index.html'), 'utf8');
  assert.match(builtHome, /data-page="home" data-page-gutters="home"/);
  assert.match(builtHome, /<title>Source Home<\/title>/);
  assert.match(builtHome, /Keep this text\./);
  assert.equal((builtHome.match(/data-page-gutters-style/g) || []).length, 1);
  assert.equal(await readFile(join(result.output, 'css/page-gutters.css'), 'utf8'), css);

  const builtEventsIndex = await readFile(join(result.output, 'events/index.html'), 'utf8');
  assert.match(builtEventsIndex, /data-page-gutters="events"/);
  assert.match(builtEventsIndex, /page-gutters\.css\?rev=20261020-page-gutters-1/);
});
