import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addInformationAutoAds, INFORMATION_AUTO_ADS_MODULE, INFORMATION_AUTO_ADS_POLICY_SCRIPT } from '../../scripts/information-auto-ads.mjs';
import { isEligibleInformationAutoAdsPage, mountInformationAutoAds } from '../../js/information-auto-ads.mjs';
import { buildPagesSite } from '../../scripts/build-pages-site.mjs';
import { eligibleEvents } from '../../scripts/generate-event-pages.mjs';

const sourceHtml = '<!doctype html><html><head><title>Keep this title</title><link rel="canonical" href="https://pixieed.jp/about/"></head><body class="app-page"><main>Keep this content.</main></body></html>';
const staticRoutes = [
  ['tools/index.html', '/tools/'], ['about/index.html', '/about/'],
  ['guide/index.html', '/guide/'], ['help/index.html', '/help/'], ['glossary/index.html', '/glossary/'],
  ['stores/index.html', '/stores/'], ['stores/ecowashcafe-nakanoshima.html', '/stores/ecowashcafe-nakanoshima.html'],
  ['events/index.html', '/events/'],
];

test('build-time opt-in covers exactly the static information routes and generated eligible event leaves', async () => {
  const catalog = JSON.parse(await readFile(new URL('../../data/pixel-art-events.json', import.meta.url), 'utf8'));
  const generatedEventRoutes = new Set(eligibleEvents(catalog).map(event => `events/${event.id}/index.html`));
  assert.ok(generatedEventRoutes.size > 0, 'exercise the current sourced event directory');
  assert.equal(generatedEventRoutes.size, eligibleEvents(catalog).length, 'each eligible edition has one route');
  for (const event of catalog.events.filter(event => !generatedEventRoutes.has(`events/${event.id}/index.html`))) {
    assert.equal(addInformationAutoAds(sourceHtml, `events/${event.id}/index.html`, { generatedEventRoutes }).skipped, true, 'hub-only records do not gain a leaf opt-in');
  }

  for (const [sourcePath, route] of staticRoutes) {
    const result = addInformationAutoAds(sourceHtml, sourcePath, { generatedEventRoutes });
    assert.equal(result.skipped, false, sourcePath);
    assert.match(result.html, new RegExp(`data-information-auto-ads="${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`), sourcePath);
  }
  for (const sourcePath of generatedEventRoutes) {
    const result = addInformationAutoAds(sourceHtml, sourcePath, { generatedEventRoutes });
    assert.equal(result.skipped, false, sourcePath);
    assert.match(result.html, /data-information-auto-ads="\/events\/[a-z0-9-]+\/"/);
  }
  for (const sourcePath of [
    'index.html', 'feed/index.html', 'explore/index.html', 'privacy/index.html', 'books/index.html', 'pass/index.html', 'camera/index.html', 'draw/index.html',
    'audio/index.html', 'output/index.html', 'output/work/index.html', 'play/spot-difference/index.html',
    'globe-prototype.html', 'profile/index.html', 'admin/index.html', 'events/unlisted/index.html',
    'events/../index.html',
  ]) assert.deepEqual(addInformationAutoAds(sourceHtml, sourcePath, { generatedEventRoutes }), { html: sourceHtml, added: false, skipped: true }, sourcePath);
});

test('generated event opt-in follows a supplied directory as new editions are added', () => {
  const initial = new Set(['events/first-edition/index.html']);
  const added = 'events/new-edition/index.html';
  assert.equal(addInformationAutoAds(sourceHtml, added, { generatedEventRoutes: initial }).skipped, true);
  const extended = new Set([...initial, added]);
  assert.equal(addInformationAutoAds(sourceHtml, added, { generatedEventRoutes: extended }).skipped, false);
  assert.equal(addInformationAutoAds(sourceHtml, 'events/not-generated/index.html', { generatedEventRoutes: extended }).skipped, true);
});

test('transform is idempotent, preserves page metadata/content, and places policy before the module', () => {
  const first = addInformationAutoAds(sourceHtml, 'about/index.html');
  assert.equal(first.added, true);
  const second = addInformationAutoAds(first.html, 'about/index.html');
  assert.deepEqual(second, { html: first.html, added: false, skipped: false });
  assert.equal((first.html.match(/adsense-offerwall-policy\.js/g) || []).length, 1);
  assert.equal((first.html.match(/information-auto-ads\.mjs/g) || []).length, 1);
  assert.ok(first.html.indexOf(INFORMATION_AUTO_ADS_POLICY_SCRIPT) < first.html.indexOf(INFORMATION_AUTO_ADS_MODULE));
  assert.match(first.html, /<title>Keep this title<\/title>/);
  assert.match(first.html, /href="https:\/\/pixieed\.jp\/about\/"/);
  assert.match(first.html, /Keep this content\./);
  assert.match(first.html, /rev=20261024-all-tools-offerwall-1/);

  const sourceWithOldPolicy = sourceHtml.replace('</head>', '<script src="/js/adsense-offerwall-policy.js?rev=old"></script></head>');
  const updatedPolicy = addInformationAutoAds(sourceWithOldPolicy, 'about/index.html').html;
  assert.equal((updatedPolicy.match(/adsense-offerwall-policy\.js/g) || []).length, 1);
  assert.match(updatedPolicy, /adsense-offerwall-policy\.js\?rev=20261024-all-tools-offerwall-1/);

  const sourceWithEarlyAds = sourceHtml
    .replace('<head>', '<head><script src="https://example.test/ads.js"></script>')
    .replace('</body>', '<script src="/js/adsense-offerwall-policy.js?rev=old"></script></body>');
  const reorderedPolicy = addInformationAutoAds(sourceWithEarlyAds, 'about/index.html').html;
  assert.ok(reorderedPolicy.indexOf(INFORMATION_AUTO_ADS_POLICY_SCRIPT) < reorderedPolicy.indexOf('https://example.test/ads.js'));
  assert.equal((reorderedPolicy.match(/adsense-offerwall-policy\.js/g) || []).length, 1);
  assert.equal(addInformationAutoAds(reorderedPolicy, 'about/index.html').html, reorderedPolicy);

  const noDocument = addInformationAutoAds('<h1>plain fragment</h1>', 'about/index.html');
  assert.deepEqual(noDocument, { html: '<h1>plain fragment</h1>', added: false, skipped: true });
});

test('runtime requires exact production origin, top-level state, matching route marker, and a non-work page', () => {
  const eligible = { pathname: '/about/', marker: '/about/', protocol: 'https:', host: 'pixieed.jp', hostname: 'pixieed.jp', isTopLevel: true };
  assert.equal(isEligibleInformationAutoAdsPage(eligible), true);
  assert.equal(isEligibleInformationAutoAdsPage({ ...eligible, host: 'www.pixieed.jp', hostname: 'www.pixieed.jp' }), true);
  assert.equal(isEligibleInformationAutoAdsPage({ ...eligible, host: 'pixieed.jp:8443' }), false);
  assert.equal(isEligibleInformationAutoAdsPage({ ...eligible, hostname: 'pixieed.jp.evil.test' }), false);
  assert.equal(isEligibleInformationAutoAdsPage({ ...eligible, protocol: 'http:' }), false);
  assert.equal(isEligibleInformationAutoAdsPage({ ...eligible, isTopLevel: false }), false);
  assert.equal(isEligibleInformationAutoAdsPage({ ...eligible, pathname: '/privacy/', marker: '/privacy/' }), false);
  assert.equal(isEligibleInformationAutoAdsPage({ ...eligible, marker: '/guide/' }), false);
  assert.equal(isEligibleInformationAutoAdsPage({ ...eligible, pathname: '/', marker: '/' }), false, 'SNS home never receives provider-controlled Auto Ads');
  assert.equal(isEligibleInformationAutoAdsPage({ ...eligible, pathname: '/feed/', marker: '/feed/' }), false, 'interactive SNS feed never receives provider-controlled Auto Ads');
  assert.equal(isEligibleInformationAutoAdsPage({ ...eligible, pathname: '/explore/', marker: '/explore/' }), false, 'interactive search/filter view never receives provider-controlled Auto Ads');
  assert.equal(isEligibleInformationAutoAdsPage({ ...eligible, pathname: '/events/fake/', marker: '/events/fake/' }), true, 'a syntactically valid event route is trusted only with the build marker');
  assert.equal(isEligibleInformationAutoAdsPage({ ...eligible, pathname: '/events/../about/', marker: '/events/../about/' }), false);
  for (const blocked of [
    { toolDirect: 'work' }, { directLoading: true }, { workspaceOpen: true },
    { embeddedExpanded: true }, { bodyClasses: ['creation-editor'] }, { bodyClasses: ['tool-shell--workspace-open'] },
  ]) assert.equal(isEligibleInformationAutoAdsPage({ ...eligible, ...blocked }), false);
});

function mockDocument({ existingSdk = null } = {}) {
  const scripts = [];
  const doc = {
    body: { dataset: { informationAutoAds: '/about/' }, classList: { contains: () => false, [Symbol.iterator]: function* () {} } },
    documentElement: { dataset: {}, hasAttribute: () => false },
    head: { append(script) { scripts.push(script); } },
    querySelector(selector) {
      if (selector === '.tool-embed--expanded') return null;
      assert.match(selector, /adsbygoogle\.js/);
      return existingSdk || scripts.find(script => script.src?.includes('adsbygoogle.js')) || null;
    },
    createElement(tag) {
      assert.equal(tag, 'script');
      return { dataset: {}, addEventListener(type, callback) { this.errorListener = type === 'error' ? callback : this.errorListener; } };
    },
  };
  return { doc, scripts };
}

function mockWindow(overrides = {}) {
  const win = { location: { protocol: 'https:', host: 'pixieed.jp', hostname: 'pixieed.jp', pathname: '/about/' }, googlefc: { controlledMessagingFunction() {} }, ...overrides };
  win.top = win;
  win.self = win;
  return win;
}

test('Auto Ads fallback appends the existing SDK once when the manual gutter is disabled', () => {
  const { doc, scripts } = mockDocument();
  const win = mockWindow();
  const messaging = win.googlefc.controlledMessagingFunction;
  const manualConfig = { enabled: false };
  const first = mountInformationAutoAds({ doc, win, manualConfig });
  assert.equal(first.loaded, true);
  assert.equal(first.appended, true);
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].async, true);
  assert.equal(scripts[0].crossOrigin, 'anonymous');
  assert.match(scripts[0].src, /^https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-9801602250480253$/);
  assert.equal(mountInformationAutoAds({ doc, win, manualConfig }).appended, false);
  assert.equal(scripts.length, 1);
  scripts[0].errorListener();
  assert.equal(scripts.length, 1, 'an SDK load error does not start a retry loop');
  assert.equal(scripts[0].dataset.loadState, 'error');
  assert.equal(win.googlefc.controlledMessagingFunction, messaging);
  assert.equal('adsbygoogle' in win, false);
});

test('runtime reuses the manual display-ad SDK and fails closed outside eligible pages/configuration', () => {
  const existingSdk = { src: 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9801602250480253', async: false };
  const reused = mockDocument({ existingSdk });
  assert.deepEqual(mountInformationAutoAds({ doc: reused.doc, win: mockWindow(), manualConfig: { enabled: false } }), { loaded: true, appended: false, script: existingSdk });
  assert.equal(reused.scripts.length, 0);
  assert.equal(existingSdk.async, false, 'the existing provider element is not mutated');

  const blocked = mockDocument();
  const blockedWindow = mockWindow({ location: { protocol: 'http:', host: 'pixieed.jp', hostname: 'pixieed.jp', pathname: '/' } });
  assert.equal(mountInformationAutoAds({ doc: blocked.doc, win: blockedWindow }).loaded, false);
  assert.equal(blocked.scripts.length, 0);

  const badConfig = mockDocument();
  assert.equal(mountInformationAutoAds({ doc: badConfig.doc, win: mockWindow(), manualConfig: { enabled: false }, config: { client: 'invalid' } }).reason, 'configuration-unavailable');
  assert.equal(badConfig.scripts.length, 0);
});

test('loader source does not create ad units, push requests, or change consent messaging', async () => {
  const source = await readFile(new URL('../../js/information-auto-ads.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /adsbygoogle\s*\|\||adsbygoogle\s*\[|\.push\s*\(/);
  assert.doesNotMatch(source, /googlefc|controlledMessagingFunction|analyticsConsent/);
  assert.doesNotMatch(source, /<ins\b|createElement\(['"]ins/);
});

test('Pages review build copies the runtime and injects only eligible generated event leaves', async t => {
  const scratch = await mkdtemp(join(tmpdir(), 'pixieed-information-ads-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const root = join(scratch, 'source');
  const output = join(scratch, 'site');
  await mkdir(join(root, 'data'), { recursive: true });
  await mkdir(join(root, 'privacy'), { recursive: true });
  await mkdir(join(root, 'js'), { recursive: true });
  execFileSync('git', ['init', '-q', root]);
  await writeFile(join(root, 'index.html'), sourceHtml);
  await writeFile(join(root, 'privacy/index.html'), sourceHtml.replace('/about/', '/privacy/'));
  await writeFile(join(root, 'sitemap.xml'), '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://pixieed.jp/</loc></url></urlset>');
  const event = { id: 'eligible-pixel-event', name: 'Eligible Pixel Event', startDate: '2027-05-01', endDate: '2027-05-01', status: 'upcoming', sourceUrl: 'https://example.test/event', checkedAt: '2026-10-20', description: 'Confirmed event summary.' };
  const watch = { id: 'watch-pixel-event', name: 'Watch Pixel Event', status: 'watch', lastHeldDate: '2026-04-01', dateLabel: '次回開催情報待ち（前回は2026年4月1日）', sourceUrl: 'https://example.test/watch', checkedAt: '2026-10-20' };
  await writeFile(join(root, 'data/pixel-art-events.json'), JSON.stringify({ version: 1, events: [event, watch] }));
  const runtime = await readFile(new URL('../../js/information-auto-ads.mjs', import.meta.url), 'utf8');
  await writeFile(join(root, 'js/information-auto-ads.mjs'), runtime); // untracked, explicit build allowlist input
  await writeFile(join(root, 'data/site-config.js'), "export const displayAdConfig = { client: 'ca-pub-9801602250480253' };\n");
  execFileSync('git', ['add', 'index.html', 'privacy/index.html', 'sitemap.xml', 'data/pixel-art-events.json', 'data/site-config.js'], { cwd: root });

  const result = await buildPagesSite({ root, output });
  const builtHome = await readFile(join(result.output, 'index.html'), 'utf8');
  assert.doesNotMatch(builtHome, /data-information-auto-ads|information-auto-ads\.mjs|adsense-offerwall-policy/);
  assert.match(await readFile(join(result.output, 'events/index.html'), 'utf8'), /data-information-auto-ads="\/events\/"/);
  assert.match(await readFile(join(result.output, 'events/eligible-pixel-event/index.html'), 'utf8'), /data-information-auto-ads="\/events\/eligible-pixel-event\/"/);
  await assert.rejects(readFile(join(result.output, 'events/watch-pixel-event/index.html')));
  const builtPrivacy = await readFile(join(result.output, 'privacy/index.html'), 'utf8');
  assert.doesNotMatch(builtPrivacy, /information-auto-ads|data-information-auto-ads/);
  assert.equal(await readFile(join(result.output, 'js/information-auto-ads.mjs'), 'utf8'), runtime);
});
