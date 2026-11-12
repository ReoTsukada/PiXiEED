import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOME_RECENT_PROJECTS_GALLERY_HREF,
  homeRecentProjectHref,
  initHomeRecentProjects,
  isSafeHomeProjectId,
  normalizeHomeRecentCatalogRow,
  readHomeRecentProjects,
  sanitizeHomeProjectTitle,
  validateHomeProjectThumbnail
} from '../../js/home-recent-projects.mjs';

const rgb = new Uint8Array([255, 0, 1, 2, 3, 4]);
function catalogRow(projectId, overrides = {}) {
  return {
    projectId,
    revisionId: `revision_${projectId}`,
    galleryOwner: 'tool:draw',
    summary: {
      name: `作品 ${projectId}`,
      toolProject: { tool: 'draw', schemaVersion: 1 },
      thumbnail: { width: 2, height: 1, rgb: new Uint8Array(rgb) }
    },
    ...overrides
  };
}

function asyncRequest(result, onComplete) {
  const request = { result: undefined, error: null };
  queueMicrotask(() => {
    request.result = typeof result === 'function' ? result() : result;
    request.onsuccess?.({ target: request });
    onComplete?.();
  });
  return request;
}

function fakeIndexedDB({ rows = [], exists = true, version = 3, blocked = false } = {}) {
  const calls = { open: [], transactions: [], gets: [], cursors: [], writes: 0, closes: 0, upgrades: 0 };
  const db = {
    version,
    objectStoreNames: { contains: name => name === 'project-catalog' },
    close() { calls.closes++; },
    transaction(storeName, mode) {
      calls.transactions.push({ storeName, mode });
      let pendingGets = 0;
      let cursorComplete = true;
      let completionScheduled = false;
      const transaction = {
        error: null,
        objectStore(name) {
          assert.equal(name, 'project-catalog');
          const store = {
            indexNames: { contains: name => name === 'gallery-owner' },
            get(key) {
              calls.gets.push(key);
              pendingGets++;
              return asyncRequest(rows.find(row => row.projectId === key) || undefined, () => {
                pendingGets--;
                transaction.maybeComplete();
              });
            },
            getAll() { calls.writes++; throw new Error('Unbounded getAll is forbidden.'); },
            put() { calls.writes++; throw new Error('Read-only writes are forbidden.'); },
            index(name) {
              assert.equal(name, 'gallery-owner');
              return {
                openKeyCursor(owner) {
                  calls.cursors.push(owner);
                  const matches = rows.filter(row => row.galleryOwner === owner);
                  const request = { result: null };
                  let index = 0;
                  cursorComplete = false;
                  const deliver = () => queueMicrotask(() => {
                    let advanced = false;
                    request.result = index < matches.length ? {
                      key: owner,
                      primaryKey: matches[index].projectId,
                      continue() { advanced = true; index++; deliver(); }
                    } : null;
                    request.onsuccess?.({ target: request });
                    if (!request.result || !advanced) { cursorComplete = true; transaction.maybeComplete(); }
                  });
                  deliver();
                  return request;
                },
                openCursor() { throw new Error('Value cursors are forbidden.'); },
                getAllKeys() { throw new Error('Unbounded keys are forbidden.'); }
              };
            }
          };
          return store;
        },
        abort() { queueMicrotask(() => transaction.onabort?.()); },
        maybeComplete() {
          if (!cursorComplete || pendingGets || completionScheduled) return;
          completionScheduled = true;
          queueMicrotask(() => {
            completionScheduled = false;
            if (cursorComplete && !pendingGets) transaction.oncomplete?.();
          });
        }
      };
      return transaction;
    }
  };
  return {
    calls,
    open(name, requestedVersion) {
      calls.open.push({ name, requestedVersion, argumentCount: arguments.length });
      const request = { result: null, error: null, transaction: { abort() { calls.upgrades++; queueMicrotask(() => request.onerror?.()); } } };
      queueMicrotask(() => {
        if (blocked) { request.onblocked?.(); return; }
        if (!exists) { request.onupgradeneeded?.({ target: request }); return; }
        request.result = db;
        request.onsuccess?.({ target: request });
      });
      return request;
    }
  };
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.childNodes = this.children;
    this.attributes = new Map();
    this.listeners = new Map();
    this.hidden = false;
    this.className = '';
    this.textContent = '';
    this.href = '';
    this.width = 0;
    this.height = 0;
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children.splice(0, this.children.length, ...nodes); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
  querySelector(selector) { return selector === 'canvas' ? this.children.find(child => child.tagName === 'CANVAS') ?? null : null; }
  getBoundingClientRect() { return { width: 120, height: 80, top: 0, bottom: 80, left: 0, right: 120 }; }
  getContext() {
    return {
      createImageData(width, height) { return { width, height, data: new Uint8ClampedArray(width * height * 4) }; },
      putImageData(image) { this.lastImage = image; },
      imageSmoothingEnabled: true
    };
  }
}

function fakeDocument() {
  const list = new FakeElement('div');
  const status = new FakeElement('p');
  const doc = {
    getElementById(id) { return id === 'portal-recent-list' ? list : id === 'portal-recent-status' ? status : null; },
    createElement(tag) { return new FakeElement(tag); }
  };
  return { doc, list, status };
}

function fakeWindow(innerWidth = 1280) {
  const listeners = new Map();
  const observers = [];
  class FakeIntersectionObserver {
    constructor(callback, options) { this.callback = callback; this.options = options; this.targets = new Set(); observers.push(this); }
    observe(target) { this.targets.add(target); }
    unobserve(target) { this.targets.delete(target); }
    disconnect() { this.targets.clear(); this.disconnected = true; }
    reveal(target) { this.callback([{ target, isIntersecting: true, intersectionRatio: 1 }]); }
  }
  return {
    win: {
      innerWidth,
      innerHeight: 900,
      indexedDB: null,
      localStorage: null,
      IntersectionObserver: FakeIntersectionObserver,
      addEventListener(type, fn) { listeners.set(type, fn); },
      removeEventListener(type) { listeners.delete(type); }
    },
    listeners,
    observers
  };
}

test('safe IDs, gallery routing and preview validation are strict and bounded', () => {
  assert.equal(isSafeHomeProjectId('work-1_2'), true);
  assert.equal(isSafeHomeProjectId('../work'), false);
  assert.equal(isSafeHomeProjectId('x'.repeat(129)), false);
  assert.equal(homeRecentProjectHref('work-1', 'revision_2'), '/draw/?workspace=1&pxd=work-1&pxdRevision=revision_2');
  assert.equal(homeRecentProjectHref('../work', 'rev'), null);
  assert.equal(HOME_RECENT_PROJECTS_GALLERY_HREF, '/draw/?workspace=1');
  assert.deepEqual(validateHomeProjectThumbnail({ width: 2, height: 1, rgb }), { width: 2, height: 1, rgb });
  assert.equal(validateHomeProjectThumbnail({ width: 29, height: 1, rgb }), null);
  assert.equal(validateHomeProjectThumbnail({ width: 2, height: 1, rgb: new Uint8Array(7) }), null);
  assert.equal(validateHomeProjectThumbnail({ width: 28, height: 28, rgb: new Uint8Array(28 * 28 * 3 + 1) }), null);
});

test('catalog rows require current, confirmed draw ownership and discard deleted or malformed previews', () => {
  const clean = normalizeHomeRecentCatalogRow(catalogRow('a', { summary: { ...catalogRow('a').summary, name: '<img onerror=alert(1)>', thumbnail: { width: 29, height: 1, rgb: new Uint8Array(3) } } }));
  assert.equal(clean.name, '<img onerror=alert(1)>');
  assert.equal(sanitizeHomeProjectTitle('safe\u202eevil'), 'safeevil');
  assert.equal(clean.thumbnail, null);
  assert.equal(normalizeHomeRecentCatalogRow({ ...catalogRow('b'), galleryOwner: 'tool:camera' }), null);
  assert.equal(normalizeHomeRecentCatalogRow({ ...catalogRow('b'), summary: { ...catalogRow('b').summary, toolProject: { tool: 'camera', schemaVersion: 1 } } }), null);
  assert.equal(normalizeHomeRecentCatalogRow({ ...catalogRow('b'), deletedAt: 1 }), null);
  assert.equal(normalizeHomeRecentCatalogRow({ ...catalogRow('b'), purgedAt: 1 }), null);
  assert.equal(sanitizeHomeProjectTitle('  a\n <b>  '), 'a <b>');
  assert.equal([...sanitizeHomeProjectTitle('絵'.repeat(80))].length, 60);
});

test('bounded reader opens existing v3 catalog read-only and prioritizes the last matching creation', async () => {
  const rows = [
    catalogRow('a'), catalogRow('b'),
    { ...catalogRow('camera'), galleryOwner: 'tool:camera', summary: { ...catalogRow('camera').summary, toolProject: { tool: 'camera', schemaVersion: 1 } } },
    catalogRow('c'), catalogRow('d'), catalogRow('e')
  ];
  const indexedDB = fakeIndexedDB({ rows });
  const projects = await readHomeRecentProjects({
    indexedDB,
    storage: { getItem: () => JSON.stringify({ projectId: 'd', revisionId: 'revision_d' }) },
    limit: 4
  });
  assert.deepEqual(projects.map(project => project.projectId), ['d', 'a', 'b', 'c']);
  assert.equal(indexedDB.calls.open.length, 1);
  assert.deepEqual(indexedDB.calls.open[0], { name: 'pixieed-pxd-v1', requestedVersion: undefined, argumentCount: 1 });
  assert.deepEqual(indexedDB.calls.transactions, [{ storeName: 'project-catalog', mode: 'readonly' }]);
  assert.deepEqual(indexedDB.calls.cursors, ['tool:draw']);
  assert.ok(indexedDB.calls.gets.length <= 4, `only selected rows are read: ${indexedDB.calls.gets.length}`);
  assert.equal(indexedDB.calls.writes, 0);
  assert.ok(indexedDB.calls.closes >= 1);
});

test('missing local DB aborts creation and old DB versions are left untouched', async () => {
  const missing = fakeIndexedDB({ exists: false });
  assert.deepEqual(await readHomeRecentProjects({ indexedDB: missing, storage: null, limit: 2 }), []);
  assert.equal(missing.calls.upgrades, 1, 'onupgradeneeded is aborted immediately');
  assert.equal(missing.calls.transactions.length, 0);
  const old = fakeIndexedDB({ version: 2 });
  assert.deepEqual(await readHomeRecentProjects({ indexedDB: old, storage: null, limit: 2 }), []);
  assert.equal(old.calls.transactions.length, 0);
  assert.equal(old.calls.closes, 1);
});

test('initializer renders safe text anchors, caps mobile cards, and paints thumbnails only on intersection', async () => {
  const { doc, list, status } = fakeDocument();
  const { win, observers, listeners } = fakeWindow(390);
  let requestedLimit = null;
  const project = {
    projectId: 'a', revisionId: 'revision_a', name: '<img src=x onerror=alert(1)>',
    thumbnail: { width: 2, height: 1, rgb: new Uint8Array([250, 2, 1, 10, 20, 30]) }
  };
  const mounted = initHomeRecentProjects({ doc, win, readProjects: async ({ limit }) => { requestedLimit = limit; return [project]; } });
  await mounted.refresh();
  assert.equal(requestedLimit, 2);
  assert.equal(status.textContent, '');
  assert.equal(status.hidden, true);
  assert.equal(list.hidden, false);
  const card = list.children[0];
  assert.equal(card.className, 'portal-recent-card');
  assert.equal(card.href, '/draw/?workspace=1&pxd=a&pxdRevision=revision_a');
  assert.equal(card.getAttribute('aria-label'), '<img src=x onerror=alert(1)> の続きを開く');
  const preview = card.children[0];
  assert.equal(preview.className, 'portal-recent-preview');
  assert.equal(preview.querySelector('canvas'), null, 'offscreen card has no canvas before intersection');
  const title = card.children[1];
  assert.equal(title.className, 'portal-recent-title');
  assert.equal(title.textContent, '<img src=x onerror=alert(1)>');
  observers.at(-1).reveal(card);
  const canvas = preview.querySelector('canvas');
  assert.ok(canvas);
  assert.equal(canvas.width, 2);
  assert.equal(canvas.height, 1);
  assert.equal(card.children[2].className, 'portal-recent-meta');
  assert.equal(card.children[2].textContent, '続きを開く');
  listeners.get('pagehide')();
  assert.equal(observers.at(-1).disconnected, true);
  listeners.get('pageshow')();
  mounted.dispose();
});

test('initializer gives empty and unavailable states without fabricating a work', async () => {
  const emptyFixture = fakeDocument();
  const emptyWin = fakeWindow(1280);
  const emptyMount = initHomeRecentProjects({ ...emptyFixture, win: emptyWin.win, readProjects: async ({ limit }) => { assert.equal(limit, 4); return []; } });
  await emptyMount.refresh();
  assert.equal(emptyFixture.list.hidden, true);
  assert.equal(emptyFixture.status.textContent, '続きから表示できる絵はありません。＋で新しくつくるか、作品一覧で確認できます。');
  emptyMount.dispose();

  const errorFixture = fakeDocument();
  const errorWin = fakeWindow(1280);
  const errorMount = initHomeRecentProjects({ ...errorFixture, win: errorWin.win, readProjects: async () => { throw new Error('blocked'); } });
  await errorMount.refresh();
  assert.equal(errorFixture.list.hidden, true);
  assert.match(errorFixture.status.textContent, /作品を表示できません/);
  errorMount.dispose();
});
