import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../js/tool-entry-compat.js', import.meta.url), 'utf8');
class TestMutationObserver {
  static instances = [];
  constructor(callback) { this.callback = callback; this.disconnected = false; TestMutationObserver.instances.push(this); }
  observe(target, options) { this.target = target; this.options = options; }
  disconnect() { this.disconnected = true; }
  notify(...addedNodes) { this.callback([{ addedNodes }]); }
}
function run({ search = '', historyState = null, route = 'draw', bodyReady = true } = {}) {
  const start = { attrs: {}, setAttribute(name, value) { this.attrs[name] = value; } };
  const status = { attrs: {}, textContent: '', setAttribute(name, value) { this.attrs[name] = value; } };
  const back = { hidden: true, href: '' };
  const bootstrapRetry = { hidden: true, listeners: {}, addEventListener(type, callback) { this.listeners[type] = callback; } };
  const links = [];
  let bodyIsReady = bodyReady;
  const document = {
    documentElement: { dataset: {} }, head: {},
    querySelectorAll(selector) { return selector === 'link[data-direct-shell-required]' ? links : []; },
    querySelector(selector) {
      if (!bodyIsReady) return null;
      return selector === '[data-embed-start]' ? start
        : selector === '[data-embed-status]' ? status
          : selector === '[data-direct-bootstrap-back]' ? back
            : selector === '[data-direct-bootstrap-retry]' ? bootstrapRetry : null;
    }
  };
  const location = {
    pathname: `/${route}/`, search, hash: '#work',
    href: `https://pixieed.jp/${route}/${search}#work`, origin: 'https://pixieed.jp',
    replaced: null, reloaded: false, replace(value) { this.replaced = value; }, reload() { this.reloaded = true; }
  };
  const window = { frameElement: null };
  vm.runInNewContext(source, {
    location, document, window, history: { state: historyState }, URL, URLSearchParams, MutationObserver: TestMutationObserver
  });
  return { location, document, window, start, status, back, bootstrapRetry, links, setBodyReady() { bodyIsReady = true; TestMutationObserver.instances.find(observer => observer.target === document.documentElement)?.notify({ nodeType: 1 }); } };
}

test('direct workspace requests paint an accessible parser-time status and reversible explanation link', () => {
  const result = run({ search: '?workspace=1&x=1&x=2' });
  assert.equal(result.document.documentElement.dataset.directBootstrap, '');
  assert.equal(result.start.attrs['aria-busy'], 'true');
  assert.equal(result.status.attrs.role, 'status');
  assert.equal(result.status.textContent, '制作画面を準備しています…');
  assert.equal(result.back.hidden, false);
  const back = new URL(result.back.href, result.location.origin);
  assert.equal(back.searchParams.get('workspace'), '0');
  assert.deepEqual(back.searchParams.getAll('x'), ['1', '2']);
  assert.equal(back.hash, '#work');
  assert.equal(result.location.replaced, null);
});

test('query workspace state overrides history and iframe or legacy entries do not show direct-work bootstrap', () => {
  assert.equal(run({ search: '?workspace=0', historyState: { pixieedWorkspace: true } }).document.documentElement.dataset.directBootstrap, undefined);
  assert.equal(run({ historyState: { pixieedWorkspace: true } }).document.documentElement.dataset.directBootstrap, '');
  assert.equal(run({ search: '?workspace=1&runtime=iframe' }).document.documentElement.dataset.directBootstrap, undefined);
  assert.equal(run({ route: 'camera', search: '?workspace=1&standalone=1' }).document.documentElement.dataset.directBootstrap, undefined);
  assert.equal(run({ search: '?workspace=1&embed=1&embedRole=draw&channel=abc' }).document.documentElement.dataset.directBootstrap, undefined);
});

test('direct bootstrap defers parser stylesheets until coordinated release and leaves ordinary routes alone', () => {
  TestMutationObserver.instances.length = 0;
  const direct = run({ search: '?workspace=1', bodyReady: false });
  const headObserver = TestMutationObserver.instances.find(observer => observer.target === direct.document.head);
  assert.ok(headObserver, 'direct requests observe parser-added stylesheets');
  const events = {};
  const link = {
    nodeType: 1, tagName: 'LINK', media: 'screen', dataset: {}, sheet: null,
    matches(selector) { return selector === 'link[rel="stylesheet"]'; }, querySelectorAll() { return []; },
    hasAttribute(name) { return name === 'media'; }, getAttribute(name) { return name === 'media' ? this.media : null; },
    setAttribute(name, value) { if (name === 'media') this.media = value; }, removeAttribute(name) { if (name === 'media') this.media = ''; },
    addEventListener(type, listener) { (events[type] ||= []).push(listener); }
  };
  headObserver.notify(link);
  direct.links.push(link);
  assert.equal(link.media, 'not all');
  assert.equal(link.dataset.directShellState, 'pending');
  direct.setBodyReady();
  assert.equal(headObserver.disconnected, true, 'the parser preflight observer stops once body controls exist');
  link.sheet = {};
  for (const listener of events.load || []) listener();
  assert.equal(link.dataset.directShellState, 'loaded');
  assert.equal(link.media, 'not all', 'loaded CSS remains staged until the complete shell is ready');
  direct.window.__PIXIEED_DIRECT_SHELL_CSS__.release();
  assert.equal(link.media, 'screen');
  assert.equal(link.dataset.directShellRequired, undefined);

  TestMutationObserver.instances.length = 0;
  run();
  assert.equal(TestMutationObserver.instances.length, 0, 'ordinary intro routes do not defer stylesheet paint');
});

test('a shell stylesheet failure remains a truthful parser-time error with an explicit reload action', () => {
  TestMutationObserver.instances.length = 0;
  const direct = run({ search: '?workspace=1', bodyReady: false });
  const headObserver = TestMutationObserver.instances.find(observer => observer.target === direct.document.head);
  const events = {};
  const link = {
    nodeType: 1, dataset: {}, media: '',
    matches(selector) { return selector === 'link[rel="stylesheet"]'; }, querySelectorAll() { return []; },
    hasAttribute() { return false; }, getAttribute() { return null; },
    addEventListener(type, listener) { (events[type] ||= []).push(listener); }
  };
  headObserver.notify(link);
  for (const listener of events.error || []) listener();
  direct.setBodyReady();
  assert.equal(direct.document.documentElement.dataset.directShellStylesFailed, '');
  assert.match(direct.status.textContent, /表示を読み込めませんでした/);
  assert.equal(direct.bootstrapRetry.hidden, false);
  direct.bootstrapRetry.listeners.click();
  assert.equal(direct.location.reloaded, true);
});

test('all public tool routes keep the same tiny direct-only critical shell and preserve their static SEO copy', () => {
  let critical = null;
  for (const route of ['draw', 'camera', 'audio']) {
    const html = readFileSync(new URL(`../../${route}/index.html`, import.meta.url), 'utf8');
    const block = html.match(/<style data-direct-shell-style>([\s\S]*?)<\/style>/)?.[1];
    assert.ok(block, `${route} has parser-time critical shell CSS`);
    if (critical === null) critical = block;
    else assert.equal(block, critical, 'the three routes share byte-identical critical CSS');
    assert.match(block, /\.tool-intro__embed-copy/);
    assert.match(block, /background:#151d24/);
    assert.match(html, /data-direct-bootstrap-retry/);
    assert.match(html, /<meta name="description"/);
    assert.match(html, /<section class="tool-intro__how-to/);
  }
});
