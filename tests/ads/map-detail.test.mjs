import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { displayAdConfig } from '../../data/site-config.js';
import { resolveDisplayAd } from '../../js/display-ads.mjs';
import { createMapEventDetailHost, isTrustedMapDetailMessage, validatePublicMapEvent } from '../../js/globe/event-detail-host.mjs';

const ORIGIN = 'https://pixieed.jp';

class FakeNode {
  constructor(doc, tag = 'div') {
    this.ownerDocument = doc; this.tagName = tag.toUpperCase(); this.children = []; this.childNodes = this.children;
    this.dataset = {}; this.attributes = {}; this.listeners = new Map(); this.hidden = false; this.textContent = '';
  }
  append(...nodes) { for (const node of nodes) { this.children.push(node); node.parentNode = this; } }
  replaceChildren(...nodes) { this.children = []; this.childNodes = this.children; this.append(...nodes); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  removeEventListener(type) { this.listeners.delete(type); }
  get isConnected() { return Boolean(this.parentNode?.isConnected || this.ownerDocument?.root === this); }
}

function fixture() {
  const doc = { createElement(tag) { return new FakeNode(doc, tag); } };
  const host = new FakeNode(doc, 'aside'); const detail = new FakeNode(doc, 'article'); const ad = new FakeNode(doc, 'aside');
  host.hidden = true; detail.hidden = true; ad.hidden = true;
  const posted = [];
  const frameWindow = { postMessage(message, origin) { posted.push({ message, origin }); } };
  const iframe = new FakeNode(doc, 'iframe'); iframe.contentWindow = frameWindow;
  const winListeners = new Map();
  const win = { location: { origin: ORIGIN, protocol: 'https:', pathname: '/globe/' }, addEventListener(type, fn) { winListeners.set(type, fn); }, removeEventListener(type) { winListeners.delete(type); } };
  win.top = win.self = win;
  return { doc, host, detail, ad, iframe, win, winListeners, posted, frameWindow };
}

const event = {
  id: 'event-1', name: 'ピクセルアート展', startDate: '2030-03-05', endDate: '2030-03-06',
  status: 'upcoming', venue: '市民ギャラリー', area: '大阪', description: '公開カタログのイベント情報です。',
  sourceUrl: 'https://example.org/event', tags: ['展示'], image: 'https://example.org/private.png',
  ticketUrls: [{ url: 'https://tickets.example.org/e/1', label: 'チケット' }]
};

test('the existing public slot is allowed only for the explicit top-level map detail route', () => {
  assert.deepEqual(resolveDisplayAd(displayAdConfig, 'map-detail', '/globe/'), {
    client: displayAdConfig.client, slot: '8825932060'
  });
  for (const path of ['/globe-prototype.html', '/profile/', '/privacy/', '/draw/']) {
    assert.equal(resolveDisplayAd(displayAdConfig, 'map-detail', path), null);
  }
  assert.equal(resolveDisplayAd({ ...displayAdConfig, slots: { 'map-detail': '' } }, 'map-detail', '/globe/'), null);
});

test('bridge rejects a different iframe source or origin', () => {
  const { iframe, win, frameWindow } = fixture();
  assert.equal(isTrustedMapDetailMessage({ source: frameWindow, origin: ORIGIN }, iframe, win), true);
  assert.equal(isTrustedMapDetailMessage({ source: {}, origin: ORIGIN }, iframe, win), false);
  assert.equal(isTrustedMapDetailMessage({ source: frameWindow, origin: 'https://attacker.example' }, iframe, win), false);
});

test('event payload is a bounded public-field copy with only HTTPS links', () => {
  const safe = validatePublicMapEvent({ ...event, unknown: 'discard me', website: 'javascript:alert(1)', description: 'x'.repeat(3500) });
  assert.equal(safe.id, 'event-1');
  assert.equal(safe.unknown, undefined);
  assert.equal(safe.website, '');
  assert.equal(safe.description.length, 3000);
  assert.deepEqual(safe.ticketUrls, [{ url: 'https://tickets.example.org/e/1', label: 'チケット' }]);
  assert.equal(validatePublicMapEvent({ id: 'x' }), null);
  assert.equal(validatePublicMapEvent({ id: 'x', title: 'Bad', sourceUrl: 'http://example.org' }).sourceUrl, '');
});

test('host requires the handshake, ignores forged messages, retains one ad node, and hides on clear', async () => {
  const f = fixture(); let adLoads = 0, adMounts = 0;
  const controller = createMapEventDetailHost({ ...f,
    createCalendarSection: () => f.doc.createElement('section'),
    loadAds: async () => { adLoads++; return { mountDisplayAds() { adMounts++; } }; }
  });
  const send = (source, origin, data) => f.winListeners.get('message')({ source, origin, data });
  send(f.frameWindow, ORIGIN, { type: 'pixieed:map-event-detail', event });
  assert.equal(f.host.hidden, true, 'details are ignored until the child handshake');
  const beforeUntrusted = f.posted.length;
  send({}, ORIGIN, { type: 'pixieed:map-event-detail-ready' });
  assert.equal(f.posted.length, beforeUntrusted, 'untrusted frame receives no handshake response');
  send(f.frameWindow, ORIGIN, { type: 'pixieed:map-event-detail-ready' });
  assert.equal(f.posted.at(-1).message.type, 'pixieed:map-event-detail-host-ready');
  send(f.frameWindow, ORIGIN, { type: 'pixieed:map-event-detail', event });
  assert.equal(f.host.hidden, false);
  assert.equal(f.detail.hidden, false);
  assert.equal(f.ad.hidden, false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(f.ad.dataset.displayAd, 'map-detail');
  assert.equal(adLoads, 1); assert.equal(adMounts, 1);
  const adNode = f.ad;
  send(f.frameWindow, ORIGIN, { type: 'pixieed:map-event-detail', event: null });
  assert.equal(f.host.hidden, true); assert.equal(f.detail.hidden, true); assert.equal(f.ad.hidden, true);
  send(f.frameWindow, ORIGIN, { type: 'pixieed:map-event-detail', event: { ...event, id: 'event-2' } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(f.ad, adNode); assert.equal(adLoads, 1); assert.equal(adMounts, 1);
  controller.dispose();
});

test('the map host has no static request that can create a blank ad slot', async () => {
  const html = await readFile(new URL('../../globe/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="mapDetailAd"[^>]*hidden/);
  assert.doesNotMatch(html, /data-display-ad="map-detail"/);
  assert.match(html, /event-detail-host\.mjs/);
});
