import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, cp, rm } from 'node:fs/promises';
import { CONVERSION_TARGETS, FORMAT_GUIDES, conversionHref, requestedConversion, resolveConversionTarget } from '../../js/creation/conversion-intent.mjs';
import { guideEntryParameters, publicGuideSlug, guideLinkTarget } from '../../js/output-guide-metrics.mjs';
import { isOutputGuideAdEligible } from '../../js/ads/output-guide-ad.mjs';
import { normalizeGuideQuery } from '../../js/conversion-guide-filter.mjs';
import { pageSlug, trackSiteEvent } from '../../js/site-analytics.mjs';
import { validateCatalog, renderGuide, renderIndex, generateConversionGuides } from '../../scripts/generate-conversion-guides.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const catalog = validateCatalog(JSON.parse(await read('data/conversion-format-guides.json')));
for (const target of Object.keys(CONVERSION_TARGETS)) test(`intent round trip: ${target}`, () => {
  const url = new URL(conversionHref(target), 'https://pixieed.jp');
  assert.equal(requestedConversion(url), target);
  assert.deepEqual(resolveConversionTarget(target, [{ value: target }]), { available: true, label: CONVERSION_TARGETS[target] });
  assert.equal(resolveConversionTarget(target, [{ value: target, disabled: true }]).available, false);
});
test('unknown, duplicated, private and text-mode intents never override a source', () => {
  const search = ['?mode=convert&to=__proto__', '?mode=convert&to=QOI', '?mode=convert&to=mp3',
    '?mode=convert&to=qoi&to=png', '?mode=convert&mode=other&to=qoi', '?mode=convert&to=qoi&id=',
    '?mode=convert&to=qoi&file=private', '?mode=convert&to=qoi&text=input', '?to=qoi'];
  for (const value of search) assert.equal(requestedConversion({ pathname: '/output/work/', search: value }), null);
  assert.equal(requestedConversion({ pathname: '/draw/', search: '?mode=convert&to=qoi' }), null);
  assert.throws(() => conversionHref('javascript:alert(1)'));
});
test('an unavailable target does not become a supported format', () => {
  assert.equal(resolveConversionTarget('qoi', [{ value: 'wav' }]).available, false);
  assert.equal(resolveConversionTarget('flac', [{ value: 'flac' }]).available, false);
});
for (const guide of catalog.guides) test(`${guide.slug}: specific, indexable guide and all conversion targets`, () => {
  const html = renderGuide(guide, catalog), url = `https://pixieed.jp/output/formats/${guide.slug}/`;
  assert.match(html, /<meta name="robots" content="index,follow">/);
  assert.ok(html.includes(`<link rel="canonical" href="${url}">`));
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.equal((html.match(/data-output-guide-ad aria/g) || []).length, 1);
  assert.doesNotMatch(html, /<input[^>]+type="file"|data-tx-source|adsbygoogle\.push|meta http-equiv="refresh"/);
  for (const route of guide.routes) assert.ok(html.includes(conversionHref(route.to.toLowerCase()).replaceAll('&','&amp;')));
  assert.ok(html.includes(guide.input)); assert.ok(html.includes(guide.loss));
  const schema = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(schema['@graph'][1]['@type'], 'BreadcrumbList');
});
test('build generates deterministic guides and extends only the output sitemap', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pixieed-discovery-test-'));
  try {
    await mkdir(join(root,'data')); await mkdir(join(root,'output'));
    await writeFile(join(root,'data/conversion-format-guides.json'), JSON.stringify(catalog));
    const original = await read('output/index.html');
    await writeFile(join(root,'output/index.html'),original);
    await writeFile(join(root,'output/sitemap.xml'),'<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://pixieed.jp/output/</loc></url><url><loc>https://pixieed.jp/output/text/</loc></url><url><loc>https://pixieed.jp/output/gif-speed/</loc></url></urlset>');
    const result = await generateConversionGuides({root,write:true});
    assert.equal(result.pages,9); assert.equal(result.routes,37);
    assert.deepEqual((await generateConversionGuides({root})).changed,[]);
    const xml = await readFile(join(root,'output/sitemap.xml'),'utf8');
    for(const slug of ['',...FORMAT_GUIDES]) assert.equal(xml.split(`<loc>https://pixieed.jp/output/formats/${slug?slug+'/':''}</loc>`).length-1,1);
    assert.ok(xml.includes('https://pixieed.jp/output/text/')); assert.ok(xml.includes('https://pixieed.jp/output/gif-speed/'));
    assert.doesNotMatch(xml,/\/work\/|\?to=|\?id=/);
    const modified = await readFile(join(root,'output/index.html'),'utf8');
    assert.ok(modified.includes('conversion-references:start')); assert.ok(modified.includes('/output/gif-speed/'));
    assert.equal(await read('output/index.html'),original,'source guide remains unchanged');
  } finally { await rm(root,{recursive:true,force:true}); }
});
test('directory stays useful without JavaScript and filtering is local', async () => {
  const html = renderIndex(catalog); for (const slug of FORMAT_GUIDES) assert.ok(html.includes(`/output/formats/${slug}/`));
  assert.equal(normalizeGuideQuery('  .ＱＯＩ '), 'qoi');
  assert.doesNotMatch(await read('js/conversion-guide-filter.mjs'), /\bfetch\s*\(|localStorage|sessionStorage|trackSiteEvent/);
});
test('ads accept only explicit public guide routes and exclude every private context', () => {
  const base = { origin: 'https://pixieed.jp', pathname: '/output/formats/qoi/', topLevel: true, marker: 'guide-v1', privateContext: false };
  for (const slug of FORMAT_GUIDES) assert.ok(isOutputGuideAdEligible({ ...base, pathname: `/output/formats/${slug}/` }));
  for (const extra of [{ pathname: '/output/work/' }, { pathname: '/output/formats/unknown/' }, { search: '?id=x' }, { search: '?to=qoi' }, { topLevel: false }, { privateContext: true }, { origin: 'http://localhost' }]) assert.equal(isOutputGuideAdEligible({ ...base, ...extra }), false);
});
test('analytics distinguishes finite guide pages, never arbitrary user routes', () => {
  assert.equal(pageSlug('/output/formats/qoi/?id=private'), 'output-formats-qoi');
  assert.equal(pageSlug('/output/formats/private-name/'), 'other');
  assert.equal(publicGuideSlug('/output/work/'), null);
  assert.equal(publicGuideSlug('/output/formats/qoi/extra/'), null);
  assert.deepEqual(guideEntryParameters('/output/formats/qoi/', { target_format: 'qoi', filename: 'secret.png', text: 'private' }), { guide_slug: 'output-formats-qoi', target_format: 'qoi' });
  assert.equal(guideEntryParameters('/output/work/', {}), null);
  assert.equal(guideEntryParameters('/output/', { target_format: '<script>' }).target_format, 'choose');
  assert.equal(guideLinkTarget('/output/work/?mode=convert&to=qoi'), 'qoi');
  assert.equal(guideLinkTarget('/output/work/?id=private'), null);
  assert.equal(guideLinkTarget('https://evil.test/output/work/?to=qoi'), null);
});
test('new entry event uses the existing production/consent gate and strips payloads', () => {
  const previousWindow = globalThis.window, previousDocument = globalThis.document, previousStorage = globalThis.localStorage;
  let denied = false;
  const win = { location: new URL('https://pixieed.jp/output/formats/qoi/?source=secret'), dataLayer: [] }; win.self = win.top = win;
  globalThis.window = win; globalThis.document = {}; globalThis.localStorage = { getItem: () => denied ? 'denied' : null };
  try {
    assert.equal(trackSiteEvent('conversion_entry', { target_format: 'qoi', filename: 'secret.png', text: 'hidden', url: 'private', error: 'secret' }), true);
    const [, name, data] = win.dataLayer.at(-1); assert.equal(name, 'conversion_entry');
    assert.deepEqual(data, { tool: 'output-formats-qoi', guide_slug: 'output-formats-qoi', target_format: 'qoi' });
    denied = true; assert.equal(trackSiteEvent('conversion_entry', {}), false);
    denied = false; win.location = new URL('https://pixieed.jp/output/work/?id=secret'); assert.equal(trackSiteEvent('conversion_entry', {}), false);
    win.location = new URL('https://pixieed.jp/output/formats/qoi/?file=secret'); assert.equal(trackSiteEvent('conversion_entry', {}), false);
    win.location = new URL('http://localhost/output/formats/qoi/'); assert.equal(trackSiteEvent('conversion_entry', {}), false);
    assert.equal(win.dataLayer.length, 1);
  } finally { for (const [key,value] of Object.entries({ window: previousWindow, document: previousDocument, localStorage: previousStorage })) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } }
});
