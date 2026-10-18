import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PAGE_DESTINATIONS } from '../../js/page-navigation.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const fixture = JSON.parse(readFileSync(new URL('./baseline.fixture.json', import.meta.url), 'utf8'));
const attributes = (tag) => Object.fromEntries(
  [...tag.matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)]
    .map(([, name, doubleQuoted, singleQuoted, unquoted]) => [name, doubleQuoted ?? singleQuoted ?? unquoted ?? '']),
);
const elements = (html, tagName) => [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}\\s*>`, 'gi'))]
  .map(([whole, content]) => ({ attributes: attributes(whole.match(new RegExp(`^<${tagName}\\b[^>]*>`, 'i'))[0]), content }));
const hasClass = (element, className) => (element.attributes.class || '').split(/\s+/).includes(className);
const visibleText = (html) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

test('the old works route goes to the globe and the tools route remains reachable', () => {
  const home = read('globe/index.html');
  const tools = read('tools/index.html');
  const oldWorks = read('works/index.html');
  assert.match(home, new RegExp(`href="${fixture.routes.tools}"`));
  assert.match(tools, /src="\/js\/site-header\.mjs\?/);
  assert.ok(PAGE_DESTINATIONS.flatMap(group => group.links).some(([href]) => href === fixture.routes.tools));
  assert.match(oldWorks, /name="robots" content="noindex,follow"/);
  assert.match(oldWorks, /http-equiv="refresh" content="0;url=\/globe\/"/);
  assert.ok(PAGE_DESTINATIONS.flatMap(group => group.links).some(([href, label]) => href === '/globe/' && label.includes('世界地図')));
  assert.match(read('js/site-header.mjs'), /PAGE_DESTINATIONS/);
  assert.match(read('css/site.css'), /\.mobile-nav a\[href="\/works\/"\]/);
});

test('the paused selling route is excluded from public discovery', () => {
  const oldShop = read('shops/index.html');
  const sitemap = read('sitemap.xml');
  const shell = read('js/app.js');
  assert.match(oldShop, /name="robots" content="noindex, nofollow"/);
  assert.doesNotMatch(oldShop, /4,500|購入|販売作品/);
  assert.doesNotMatch(sitemap, /\/(?:shops|works)\//);
  assert.doesNotMatch(shell, /href="\/shops\/"/);
});

test('map keeps a live globe entry and five-control camera navigation', () => {
  const home = read('globe/index.html');
  assert.match(home, /map-hero__globe-frame/);
  const camera = read('pixel-camera.html');
  const nav = camera.match(/<nav\b[^>]*class="app-tabs pc-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(nav, 'camera page has its bottom navigation');
  const keys = [...nav.matchAll(/data-nav="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(keys, fixture.bottomNavigation.filter((key) => key !== 'capture'));
  assert.match(nav, /data-action="capture"/);
  assert.match(nav, /href="\/tools\/"/);
});

test('the public telescope route forwards into the globe tool', () => {
  const html = read('telescope/index.html');
  assert.match(html, /globe-prototype\.html\?embed=1&amp;tool=telescope/);
  assert.match(read('tools/index.html'), /href="\/telescope\/"/);
});

test('each puzzle card opens its public list without a duplicate creator card', () => {
  const tools = read('tools/index.html');
  for (const [name, kind] of [
    ['ドット絵間違い探し', 'spot-difference'],
    ['ドット絵もの探し', 'hidden-object'],
  ]) {
    const card = tools.match(new RegExp(`<a\\b[^>]*class="hp-toy"[^>]*href="/play/${kind}/"[^>]*>[\\s\\S]*?<h2[^>]*>${name}</h2>[\\s\\S]*?</a>`))?.[0];
    assert.ok(card, `${name} opens the public puzzle list`);
    assert.doesNotMatch(tools, new RegExp(`href="/${kind}/"`));
    assert.equal((tools.match(new RegExp(`<h2[^>]*>${name}</h2>`, 'g')) || []).length, 1);
  }
  assert.match(tools, /href="\/draw\/\?workspace=1"[^>]*data-static-tool="editor"/);
  assert.match(tools, /href="\/audio\/\?workspace=1"[^>]*data-static-tool="sound"/);
  assert.match(tools, /href="\/jigsaw\/"/);
  assert.doesNotMatch(tools, /href="\/game\/"/);
  assert.doesNotMatch(read('index.html'), /href="\/game\/"/);
  assert.match(tools, /tool-card--soon[\s\S]*?<h2\b[^>]*>かんたんゲーム<\/h2>[\s\S]*?もうすぐ/);
});

test('public puzzle lists open by default with one create action', () => {
  for (const kind of ['spot-difference', 'hidden-object']) {
    const play = read(`play/${kind}/index.html`);
    const create = read(`${kind}/index.html`);
    const list = elements(play, 'section').find((element) => element.attributes.id === 'pixfind-list');
    assert.ok(list, `${kind} public list exists`);
    assert.equal(list.attributes.hidden, undefined, `${kind} public list is visible by default`);
    const createLinks = elements(play, 'a').filter((element) => hasClass(element, 'puzzle-create-link'));
    assert.equal(createLinks.length, 1, `${kind} list has exactly one create link`);
    assert.equal(createLinks[0].attributes.href, `/${kind}/`);
    assert.equal(visibleText(createLinks[0].content), '＋ 作る');
    assert.doesNotMatch(play, /puzzle-mode-switch/);
    const backLinks = elements(create, 'a').filter((element) => hasClass(element, 'puzzle-list-back'));
    const editorPlayLinks = elements(create, 'a').filter((element) => hasClass(element, 'puzzle-editor-play'));
    assert.ok(backLinks.some((element) => element.attributes.href === `/play/${kind}/`), `${kind} creator back link returns to its public list`);
    assert.ok(editorPlayLinks.some((element) => element.attributes.href === `/play/${kind}/`), `${kind} creator play link opens its public list`);
  }
});
