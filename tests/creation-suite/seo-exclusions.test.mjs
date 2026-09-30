import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const excluded = [
  'profile/index.html', 'admin/index.html', 'shops/index.html',
  'game/index.html', 'collection/index.html', 'telescope/index.html',
  'works/index.html', 'works/sea-cat.html', 'works/rainy-window.html', 'works/night-lantern.html', '404.html',
  'globe-prototype.html', 'pixel-camera-studio.html', 'camera-media-test.html',
  'tests/pixel-studio/four-tone-preview.browser.html', 'tests/pixel-studio/png-export.browser.html',
  'tests/globe/post-image.browser.html', 'tests/creation-suite/local-drafts.browser.html',
  'stores/cafe-hoshi.html', 'stores/kaze-machi.html', 'stores/yoru-akari.html',
];
const read = (file) => readFileSync(fileURLToPath(new URL(`../../${file}`, import.meta.url)), 'utf8');
const headOf = (html) => html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1]
  ?? html.split(/<(?:body|main|h1|canvas)\b/i)[0];

test('internal, private and retired sample pages request search exclusion', () => {
  for (const file of excluded) {
    const html = headOf(read(file));
    const robotTags = [...html.matchAll(/<meta\b(?=[^>]*\bname=["']robots["'])[^>]*>/gi)];
    assert.equal(robotTags.length, 1, `${file}: one robots policy`);
    assert.match(robotTags[0][0], /\bcontent=["'][^"']*\bnoindex\b[^"']*["']/i, file);
  }
  const sitemap = read('sitemap.xml');
  for (const file of excluded) {
    const path = file.endsWith('/index.html') ? file.slice(0, -10) : file;
    assert.ok(!sitemap.includes(`<loc>https://pixieed.jp/${path}</loc>`), `${file}: excluded from sitemap`);
  }
});

test('internal pages and the retained PiXiEELENS entry use the same PiXiEED favicon', () => {
  for (const file of [...excluded, 'pixiee-lens/index.html']) {
    const html = headOf(read(file));
    const icons = [...html.matchAll(/<link\b(?=[^>]*\brel=["']icon["'])[^>]*>/gi)].map(([tag]) => tag);
    assert.equal(icons.length, 2, `${file}: PNG and ICO only`);
    assert.ok(icons.some((tag) => tag.includes('href="/favicon-96.png"') && tag.includes('sizes="96x96"')), file);
    assert.ok(icons.some((tag) => tag.includes('href="/favicon.ico"')), file);
    assert.match(html, /rel="apple-touch-icon" href="\/apple-touch-icon\.png" sizes="180x180"/);
  }
  assert.doesNotMatch(read('pixiee-lens/index.html'), /<meta\b(?=[^>]*\bname=["']robots["'])[^>]*\bnoindex\b/i);
});
