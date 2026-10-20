import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../js/tool-entry-compat.js', import.meta.url), 'utf8');
const routes = ['draw', 'camera', 'audio'];

function run({ route = 'draw', search = '', hash = '', frame = null } = {}) {
  const location = {
    pathname: `/${route}/`, search, hash,
    href: `https://pixieed.jp/${route}/${search}${hash}`,
    origin: 'https://pixieed.jp', replaced: null,
    replace(value) { this.replaced = value; },
  };
  const window = { frameElement: frame };
  vm.runInNewContext(source, { location, window, URL, URLSearchParams });
  return location.replaced;
}

test('three public tool pages load one shared synchronous preflight before route content', () => {
  for (const route of routes) {
    const html = readFileSync(new URL(`../../${route}/index.html`, import.meta.url), 'utf8');
    assert.match(html, /<script src="\/js\/tool-entry-compat\.js\?rev=20261020-first-paint-1"><\/script>/);
    assert.ok(html.indexOf('tool-entry-compat.js') < html.indexOf('<title>'));
    assert.doesNotMatch(html, /const validBridge = value/);
  }
});

test('direct defaults and malformed or foreign frame state do not redirect', () => {
  for (const route of routes) assert.equal(run({ route, search: '?workspace=1&keep=x', hash: '#no' }), null);
  const foreign = { src: 'https://evil.invalid/draw/editor.html?embed=1&embedRole=draw&channel=secret', matches: () => true };
  assert.equal(run({ route: 'draw', frame: foreign }), null);
  const unowned = { src: 'https://pixieed.jp/draw/editor.html?embed=1&embedRole=draw&channel=secret', matches: () => false };
  assert.equal(run({ route: 'draw', frame: unowned }), null);
});

test('valid transport tuple redirects without losing opaque or duplicate query values and hash', () => {
  for (const route of routes) {
    const url = run({ route, search: '?embed=1&embedRole=audio&channel=abc&x=1&x=2&mode=audio&unknown=%2F', hash: '#timeline' });
    assert.ok(url.startsWith('/draw/editor.html?'));
    const parsed = new URL(url, 'https://pixieed.jp');
    assert.deepEqual(parsed.searchParams.getAll('x'), ['1', '2']);
    assert.equal(parsed.searchParams.get('unknown'), '/');
    assert.equal(parsed.searchParams.get('channel'), 'abc');
    assert.equal(parsed.searchParams.get('mode'), 'audio');
    assert.equal(parsed.hash, '#timeline');
  }
  const defaultMode = new URL(run({ route: 'draw', search: '?embed=1&embedRole=camera&channel=c&x=1&x=2', hash: '#camera' }), 'https://pixieed.jp');
  assert.equal(defaultMode.searchParams.get('mode'), 'camera');
  assert.deepEqual(defaultMode.searchParams.getAll('x'), ['1', '2']);
});

test('only a same-origin owned retained frame can restore a missing bridge tuple', () => {
  const frame = { src: 'https://pixieed.jp/draw/editor.html?embed=1&embedRole=audio&channel=owned', matches: selector => selector === '.tool-embed__frame' };
  const url = new URL(run({ route: 'camera', search: '?x=1&x=2&mode=camera', hash: '#back', frame }), 'https://pixieed.jp');
  assert.equal(url.pathname, '/draw/editor.html');
  assert.equal(url.searchParams.get('embedRole'), 'camera');
  assert.equal(url.searchParams.get('channel'), 'owned');
  assert.deepEqual(url.searchParams.getAll('x'), ['1', '2']);
  assert.equal(url.hash, '#back');
});

test('legacy standalone and handoff URLs are not mistaken for iframe channel recovery', () => {
  const frame = { src: 'https://pixieed.jp/draw/editor.html?embed=1&embedRole=audio&channel=owned', matches: () => true };
  for (const query of ['standalone=1', 'to=draw', 'to=audio', 'drawRequest=d', 'audioRequest=a', 'drawCamera=d', 'audioCamera=a']) {
    assert.equal(run({ route: 'camera', search: `?${query}`, frame }), null, query);
    assert.equal(run({ route: 'audio', search: `?${query}`, frame }), null, query);
  }
});
