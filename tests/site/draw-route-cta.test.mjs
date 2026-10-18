import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPagesSite } from '../../scripts/build-pages-site.mjs';
import { addSiteDrawCta, DRAW_CTA_EXCLUDED_ROUTES } from '../../scripts/site-draw-cta.mjs';

const page = (content = '') => `<!doctype html><html lang="ja"><head><title>fixture</title></head><body><header><a href="/">PiXiEED</a></header><main>${content}</main></body></html>`;

test('build-time CTA is a static anchor after the header with page-specific context', () => {
  const cases = [
    ['events/index.html', 'event', 'イベントのひらめきを描く'],
    ['events/some-event/index.html', 'event', 'イベントのひらめきを描く'],
    ['works/night-lantern.html', 'creation', '自分のドット絵を描く'],
    ['stores/cafe-hoshi.html', 'creation', '自分のドット絵を描く'],
    ['stores/index.html', 'creation', '自分のドット絵を描く'],
    ['globe/index.html', 'creation', '自分のドット絵を描く'],
    ['about/index.html', 'general', 'ドット絵を描いてみる']
  ];
  for (const [file, context, label] of cases) {
    const original = page();
    const result = addSiteDrawCta(original, file);
    assert.equal(result.added, true, file);
    assert.equal(result.context, context, file);
    assert.match(result.html, new RegExp(`<nav class="site-draw-cta" data-draw-cta data-draw-context="${context}"`), file);
    assert.match(result.html, /class="site-draw-cta__description">ブラウザで使えるドット絵エディター<\/span>/, file);
    assert.match(result.html, new RegExp(`<a class="site-draw-cta__link" href="/draw/\\?workspace=1">\\s*<span>${label}</span><small class="site-draw-cta__brand">PiXiEEDraw<\\/small>`), file);
    assert.ok(result.html.indexOf('</header>') < result.html.indexOf('data-draw-cta'), `${file}: CTA follows the header`);
    assert.match(result.html, /href="\/css\/site-draw-cta\.css\?rev=20261014-route-cta-1"/);
    assert.equal(original, page(), 'the transform does not mutate its source string');
  }
});

test('CTA transform is idempotent and respects an authored books CTA', () => {
  const once = addSiteDrawCta(page(), 'guide/index.html');
  const twice = addSiteDrawCta(once.html, 'guide/index.html');
  assert.equal(once.added, true);
  assert.equal(twice.added, false);
  assert.equal(twice.html, once.html);
  assert.match(twice.reason, /authored CTA/);

  const books = page('<a data-draw-cta data-draw-context="books" href="/draw/?workspace=1">本で見つけたドット絵を試す</a>');
  const result = addSiteDrawCta(books, 'books/index.html');
  assert.equal(result.added, false);
  assert.equal(result.html, books);
});

test('home and tools reuse their authored primary Draw links without adding a strip', async () => {
  for (const file of ['index.html', 'tools/index.html']) {
    const html = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
    const result = addSiteDrawCta(html, file);
    assert.equal(result.added, false, file);
    assert.equal(result.html, html);
    assert.equal((html.match(/data-draw-cta/g) || []).length, 1, file);
    assert.match(html, /href="\/draw\/\?workspace=1"[^>]*data-draw-cta[^>]*data-draw-context="(?:general|creation)"/);
  }
});

test('books generator emits the authored static Draw CTA without changing product source logic', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pixieed-books-cta-'));
  try {
    for (const name of ['scripts/generate-books-catalog.mjs', 'js/books-room-catalog.mjs', 'assets/books/room-products.json']) {
      const target = join(root, name);
      await mkdir(join(target, '..'), { recursive: true });
      await copyFile(new URL(`../../${name}`, import.meta.url), target);
    }
    await mkdir(join(root, 'books'), { recursive: true });
    execFileSync(process.execPath, ['scripts/generate-books-catalog.mjs'], { cwd: root });
    const generated = await readFile(join(root, 'books/index.html'), 'utf8');
    assert.equal((generated.match(/data-draw-cta/g) || []).length, 1);
    assert.match(generated, /site-draw-cta\.css/);
    assert.match(generated, /<aside class="books-editor-invite"[^>]*>[\s\S]*?href="\/draw\/\?workspace=1" data-draw-cta data-draw-context="books"/);
    assert.match(generated, /data-shop-thumbnail|data-image-src/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('conversion guide explains the editor and keeps its existing action link without a duplicate strip', async () => {
  const output = page('<article><h3>ブラウザで使えるドット絵エディター</h3><p>絵やアニメーションを作って書き出せます。</p><a class="output-draw-cta" href="/draw/?workspace=1" data-draw-cta data-draw-context="creation"><span>ドット絵を描いてみる</span><small>PiXiEEDraw</small><span aria-hidden="true">→</span></a></article>');
  const result = addSiteDrawCta(output, 'output/index.html');
  assert.equal(result.added, false);
  assert.match(result.reason, /existing conversion guide link/);
  assert.equal(result.html, output);
  assert.match(output, /ブラウザで使えるドット絵エディター[\s\S]*?href="\/draw\/\?workspace=1"[^>]*data-draw-cta[^>]*>[\s\S]*?ドット絵を描いてみる/);
  const sourceOutput = await readFile(new URL('../../output/index.html', import.meta.url), 'utf8');
  assert.match(sourceOutput, /<a href="\/draw\/\?workspace=1" data-draw-cta data-draw-context="creation">ドット絵を描いてみる/);
  assert.equal((sourceOutput.match(/data-draw-cta/g) || []).length, 1);
});

test('editor, personal, legal, error, prototype, test and embedded routes stay free of CTAs', () => {
  const excluded = [
    ...Object.keys(DRAW_CTA_EXCLUDED_ROUTES),
    'audio/index.html', 'play/other/index.html', 'output/work/index.html',
    'admin/index.html', 'privacy/index.html', 'profile/index.html',
    'camera-media-test.html', 'globe-prototype.html'
  ];
  for (const file of new Set(excluded)) {
    const original = page();
    const result = addSiteDrawCta(original, file);
    assert.equal(result.added, false, file);
    assert.equal(result.html, original, file);
  }
  for (const [file, html] of [
    ['guide/index.html', page('<iframe src="/embed/" title="fixture"></iframe>')],
    ['guide/index.html', page('<div data-admin-page></div>')],
    ['guide/index.html', '<!doctype html><html><head><meta name="robots" content="noindex,follow"></head><body><header></header><main></main></body></html>']
  ]) {
    const result = addSiteDrawCta(html, file);
    assert.equal(result.added, false, file);
    assert.equal(result.html, html);
  }
  const storesMap = addSiteDrawCta(page('<iframe src="/globe-prototype.html?embed=1" title="store map"></iframe>'), 'stores/index.html');
  assert.equal(storesMap.added, true, 'the ordinary store directory remains eligible despite its embedded map');
});

test('standalone pages without a header still place the CTA before their main content', () => {
  const result = addSiteDrawCta('<html><head></head><body><main>content</main></body></html>', 'guide/index.html');
  assert.equal(result.added, true);
  assert.ok(result.html.indexOf('data-draw-cta') < result.html.indexOf('<main'));
});

test('retired PiXiEELENS compatibility bridge is not promoted as a creation page', async () => {
  const lens = await readFile(new URL('../../pixiee-lens/index.html', import.meta.url), 'utf8');
  const result = addSiteDrawCta(lens, 'pixiee-lens/index.html');
  assert.equal(result.added, false);
  assert.match(lens, /legacy-lens-entry\.mjs/);
  assert.match(lens, /新しいカメラモード/);
  assert.doesNotMatch(lens, /<canvas\b|hud-top__actions|GIF撮影/);
  assert.equal(addSiteDrawCta(result.html, 'pixiee-lens/index.html').added, false, 'the compatibility bridge stays unpromoted');
});

test('fresh build output contains static CTAs while route exclusions and existing links remain intact', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pixieed-draw-site-'));
  const output = join(root, 'published');
  try {
    const files = {
      'scripts/build-pages-site.mjs': await readFile(new URL('../../scripts/build-pages-site.mjs', import.meta.url), 'utf8'),
      'scripts/site-draw-cta.mjs': await readFile(new URL('../../scripts/site-draw-cta.mjs', import.meta.url), 'utf8'),
      'scripts/generate-event-pages.mjs': await readFile(new URL('../../scripts/generate-event-pages.mjs', import.meta.url), 'utf8'),
      'js/creation/puzzle-share-identity.mjs': await readFile(new URL('../../js/creation/puzzle-share-identity.mjs', import.meta.url), 'utf8'),
      'js/globe/event-density.mjs': await readFile(new URL('../../js/globe/event-density.mjs', import.meta.url), 'utf8'),
      'js/creation/legacy-lens-entry.mjs': await readFile(new URL('../../js/creation/legacy-lens-entry.mjs', import.meta.url), 'utf8'),
      'js/creation/mode-entry.mjs': await readFile(new URL('../../js/creation/mode-entry.mjs', import.meta.url), 'utf8'),
      'js/creation/shared-project-settings.mjs': await readFile(new URL('../../js/creation/shared-project-settings.mjs', import.meta.url), 'utf8'),
      'js/creation/shared-project-settings-core.mjs': await readFile(new URL('../../js/creation/shared-project-settings-core.mjs', import.meta.url), 'utf8'),
      'css/creation-camera-idle.css': await readFile(new URL('../../css/creation-camera-idle.css', import.meta.url), 'utf8'),
      'css/draw-palette-instruments.css': await readFile(new URL('../../css/draw-palette-instruments.css', import.meta.url), 'utf8'),
      'css/site-draw-cta.css': await readFile(new URL('../../css/site-draw-cta.css', import.meta.url), 'utf8'),
      'data/pixel-art-events.json': JSON.stringify({ version: 1, events: [{
        id: 'fixture-event', name: 'Fixture Pixel Event', status: 'upcoming', startDate: '2099-01-01', endDate: '2099-01-01',
        sourceUrl: 'https://example.test/event', sourceLabel: '公式案内', checkedAt: '2026-10-14', description: 'A fixture event for generated route coverage.'
      }] }),
      'index.html': page('<a href="/draw/?workspace=1" data-draw-cta data-draw-context="general">PiXiEEDraw</a>'),
      'tools/index.html': page('<a href="/draw/?workspace=1" data-draw-cta data-draw-context="general">PiXiEEDraw</a>'),
      'books/index.html': page('<aside class="books-editor-invite"><a href="/draw/?workspace=1" data-draw-cta data-draw-context="books">本で見つけたドット絵を描く</a></aside>'),
      'output/index.html': page('<article><h3>ブラウザで使えるドット絵エディター</h3><a class="output-draw-cta" href="/draw/?workspace=1" data-draw-cta data-draw-context="creation"><span>ドット絵を描いてみる</span><small>PiXiEEDraw</small><span aria-hidden="true">→</span></a></article>'),
      'privacy/index.html': page('privacy'),
      'draw/index.html': page('editor'),
      'globe/index.html': page('<iframe src="/globe-prototype.html" title="map"></iframe>'),
      'pixiee-lens/index.html': '<html><head></head><body><main><h1>PiXiEELENS compatibility bridge</h1><a href="/draw/?mode=camera">camera</a></main></body></html>',
      'admin/index.html': page('admin')
    };
    for (const [name, contents] of Object.entries(files)) {
      const path = join(root, name);
      await mkdir(join(path, '..'), { recursive: true });
      await writeFile(path, contents);
    }
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['add', '-A'], { cwd: root });
    execFileSync('git', ['rm', '--cached', '-q', '--', 'js/creation/legacy-lens-entry.mjs', 'js/creation/shared-project-settings-core.mjs', 'css/creation-camera-idle.css', 'css/draw-palette-instruments.css'], { cwd: root });

    const built = await buildPagesSite({ root, output });
    assert.equal(built.eventPages, 1);
    const builtHtml = async name => readFile(join(output, name), 'utf8');
    const home = await builtHtml('index.html');
    const eventIndex = await builtHtml('events/index.html');
    const eventLeaf = await builtHtml('events/fixture-event/index.html');
    const books = await builtHtml('books/index.html');
    const outputGuide = await builtHtml('output/index.html');
    const privacy = await builtHtml('privacy/index.html');
    const editor = await builtHtml('draw/index.html');
    const globe = await builtHtml('globe/index.html');
    const lens = await builtHtml('pixiee-lens/index.html');
    const admin = await builtHtml('admin/index.html');
    for (const asset of ['js/creation/legacy-lens-entry.mjs', 'js/creation/shared-project-settings-core.mjs', 'css/creation-camera-idle.css', 'css/draw-palette-instruments.css']) {
      assert.equal(await builtHtml(asset), files[asset], `${asset}: untracked runtime source is copied for clean local builds`);
    }

    assert.equal((home.match(/data-draw-cta/g) || []).length, 1, 'home keeps its authored primary action');
    assert.equal((await builtHtml('tools/index.html')).match(/data-draw-cta/g)?.length, 1, 'tools keeps its authored primary action');
    assert.match(eventIndex, /data-draw-context="event"[\s\S]*?href="\/draw\/\?workspace=1"/);
    assert.match(eventLeaf, /data-draw-context="event"[\s\S]*?href="\/draw\/\?workspace=1"/);
    assert.equal((books.match(/data-draw-cta/g) || []).length, 1, 'books keeps its authored CTA without a duplicate strip');
    assert.match(books, /books-editor-invite[\s\S]*?data-draw-context="books"/);
    assert.equal((outputGuide.match(/href="\/draw\/\?workspace=1"/g) || []).length, 1, 'conversion guide keeps its existing link');
    assert.match(outputGuide, /ブラウザで使えるドット絵エディター[\s\S]*?ドット絵を描いてみる/);
    for (const html of [privacy, editor, admin]) assert.doesNotMatch(html, /data-draw-cta/);
    assert.match(globe, /data-draw-context="creation"[\s\S]*?href="\/draw\/\?workspace=1"/, 'the normal globe page remains eligible despite its embedded map');
    assert.doesNotMatch(lens, /data-draw-cta/, 'the retired route does not receive a promoted CTA');
    assert.match(await builtHtml('css/site-draw-cta.css'), /\.site-draw-cta__link/);
    const beforeSecondBuild = await Promise.all(['index.html', 'events/index.html', 'events/fixture-event/index.html', 'pixiee-lens/index.html'].map(builtHtml));
    const secondOutput = join(root, 'published-again');
    await buildPagesSite({ root, output: secondOutput });
    const afterSecondBuild = await Promise.all(['index.html', 'events/index.html', 'events/fixture-event/index.html', 'pixiee-lens/index.html'].map(name => readFile(join(secondOutput, name), 'utf8')));
    assert.deepEqual(afterSecondBuild, beforeSecondBuild, 'repeated builds produce identical CTA markup');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
