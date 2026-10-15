import test from 'node:test';
import assert from 'node:assert/strict';
import { bindHomeGalleryLifecycle, createHomeGalleryController, placedOfficialWorks, requestOfficialWorks } from '../../js/home-gallery.mjs';

test('home gallery applies official public-work policy and requires public map placement', () => {
  const eligible = { id: 'official-1', title: '公開作品', image: '/assets/artworks/official-1.png', location: { lat: 35, lng: 139 } };
  const data = {
    works: [
      eligible,
      { id: 'unplaced', title: '未配置', image: '/art.png' },
      { id: 'store-placed', title: 'お店と出会う作品', image: '/store.png', stores: ['listed-store'] },
      { id: 'paid', image: '/paid.png', location: { lat: 35, lng: 139 }, sale_price_yen: 500 },
      { id: 'sea-cat', image: '/assets/artworks/sea-cat.jpg', location: { lat: 35, lng: 139 } },
      { id: 'community-copy', image: '/community.png', location: { lat: 35, lng: 139 }, userSubmitted: true }
    ],
    stores: [{ id: 'listed-store', location: { lat: 35, lng: 139 } }]
  };
  assert.deepEqual(placedOfficialWorks(data).map((item) => item.id), ['official-1', 'store-placed']);
  assert.equal(placedOfficialWorks(data)[0].href, '/globe/?art=official-1');
});

test('home gallery has no submitted items when the official public catalog is empty', () => {
  assert.deepEqual(placedOfficialWorks({ works: [], stores: [] }), []);
});

function publicResponse(works = []) {
  return { ok: true, async json() { return { works, stores: [] }; } };
}

function officialWork(id = 'public-1') {
  return { id, title: `作品 ${id}`, image: `/assets/${id}.png`, location: { lat: 35, lng: 139 } };
}

function makeClock() {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  return {
    setTimer(callback, delay) {
      const id = ++nextId;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimer(id) { timers.delete(id); },
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
    get pending() { return timers.size; },
  };
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.focusCalls = [];
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  focus(options) { this.focusCalls.push(options); }
  click() { this.listeners.click?.(); }
}

const fakeDocument = { createElement: (tagName) => new FakeElement(tagName) };

test('a 14 second public-data response succeeds before the 24 second timeout', async () => {
  const clock = makeClock();
  let finishRequest;
  const controller = new AbortController();
  const pendingResponse = new Promise((resolve) => { finishRequest = resolve; });
  const request = requestOfficialWorks({
    endpoint: 'https://example.test/api', signal: controller.signal, timeoutMs: 24_000,
    setTimer: clock.setTimer, clearTimer: clock.clearTimer, fetchImpl: () => pendingResponse,
  });
  clock.advance(14_000);
  finishRequest(publicResponse([officialWork()]));
  const result = await request;
  assert.equal(result.status, 'success');
  assert.equal(result.items[0].id, 'public-1');
  assert.equal(clock.pending, 0);
});

test('a request timeout becomes a compact error result', async () => {
  const clock = makeClock();
  const resultPromise = requestOfficialWorks({
    endpoint: 'https://example.test/api', timeoutMs: 24_000,
    setTimer: clock.setTimer, clearTimer: clock.clearTimer, fetchImpl: () => new Promise(() => {}),
  });
  clock.advance(24_000);
  const result = await resultPromise;
  assert.equal(result.status, 'error');
  assert.equal(result.reason, 'timeout');
});

test('successful empty response has its own empty state', async () => {
  const host = new FakeElement('div');
  const gallery = createHomeGalleryController({ host, documentRef: fakeDocument, endpoint: 'https://example.test/api', fetchImpl: async () => publicResponse() });
  await gallery.load();
  assert.equal(host.dataset.state, 'empty');
  assert.equal(host.attributes['aria-busy'], 'false');
  gallery.dispose();
});

test('malformed public data is an error, never a false empty catalog', async () => {
  const result = await requestOfficialWorks({
    endpoint: 'https://example.test/api', fetchImpl: async () => ({ ok: true, async json() { return { works: [] }; } }),
  });
  assert.equal(result.status, 'error');
  assert.equal(result.reason, 'request');
});

test('a failed request exposes an explicit retry button and retry can recover', async () => {
  const host = new FakeElement('div');
  let attempts = 0;
  const gallery = createHomeGalleryController({
    host, documentRef: fakeDocument, endpoint: 'https://example.test/api',
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('offline');
      return publicResponse([officialWork()]);
    },
  });
  await gallery.load();
  assert.equal(host.dataset.state, 'error');
  assert.equal(host.focusCalls.length, 0);
  const retry = host.children[0].children.find((child) => child.dataset.homeGalleryRetry === '');
  assert.ok(retry);
  retry.click();
  assert.deepEqual(host.focusCalls[0], { preventScroll: true });
  for (let i = 0; i < 8 && host.dataset.state !== 'ready'; i += 1) await Promise.resolve();
  assert.equal(host.dataset.state, 'ready');
  assert.equal(attempts, 2);
  gallery.dispose();
});

test('a failed explicit retry returns keyboard focus to the new retry button', async () => {
  const host = new FakeElement('div');
  const gallery = createHomeGalleryController({
    host, documentRef: fakeDocument, endpoint: 'https://example.test/api',
    fetchImpl: async () => { throw new Error('offline'); },
  });
  await gallery.load();
  host.children[0].children.find((child) => child.dataset.homeGalleryRetry === '').click();
  await new Promise((resolve) => setImmediate(resolve));
  const retry = host.children[0].children.find((child) => child.dataset.homeGalleryRetry === '');
  assert.equal(host.focusCalls.length, 1);
  assert.deepEqual(retry.focusCalls[0], { preventScroll: true });
  gallery.dispose();
});

test('a newer request wins and cancellation prevents stale rendering', async () => {
  const host = new FakeElement('div');
  let finishFirst;
  let calls = 0;
  const gallery = createHomeGalleryController({
    host, documentRef: fakeDocument, endpoint: 'https://example.test/api',
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return new Promise((resolve) => { finishFirst = resolve; });
      return publicResponse([officialWork('newer')]);
    },
  });
  const first = gallery.load();
  const second = gallery.load();
  await second;
  assert.equal(host.dataset.state, 'ready');
  assert.equal(host.children[0].children[1].textContent, '作品 newer');
  finishFirst(publicResponse([officialWork('stale')]));
  await first;
  assert.equal(host.dataset.state, 'ready');
  assert.equal(host.children[0].children[1].textContent, '作品 newer');
  gallery.cancel();
  gallery.dispose();
});

test('external cancellation ends a pending request without showing an error', async () => {
  const signal = new AbortController();
  const pending = requestOfficialWorks({
    endpoint: 'https://example.test/api', signal: signal.signal,
    fetchImpl: () => new Promise(() => {}),
  });
  signal.abort();
  assert.equal((await pending).status, 'cancelled');
});

test('pagehide cancels the request and a persisted pageshow resumes it', async () => {
  const host = new FakeElement('div');
  const listeners = {};
  const eventTarget = {
    addEventListener(name, callback) { listeners[name] = callback; },
    removeEventListener(name) { delete listeners[name]; },
  };
  let calls = 0;
  const gallery = createHomeGalleryController({
    host, documentRef: fakeDocument, endpoint: 'https://example.test/api',
    fetchImpl: async () => {
      calls += 1;
      return calls === 1 ? new Promise(() => {}) : publicResponse([officialWork('restored')]);
    },
  });
  bindHomeGalleryLifecycle(gallery, host, eventTarget);
  void gallery.load();
  listeners.pagehide();
  listeners.pageshow({ persisted: true });
  for (let i = 0; i < 8 && host.dataset.state !== 'ready'; i += 1) await Promise.resolve();
  assert.equal(calls, 2);
  assert.equal(host.dataset.state, 'ready');
  gallery.dispose();
});
