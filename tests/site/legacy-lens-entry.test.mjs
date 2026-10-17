import test from 'node:test';
import assert from 'node:assert/strict';
import { initLegacyLensEntry, resolveLegacyLensEntry } from '../../js/creation/legacy-lens-entry.mjs';

const outputId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('clean legacy LENS URLs enter the current camera mode and keep safe tracking and hash', () => {
  assert.deepEqual(resolveLegacyLensEntry({ search: '?utm_source=archive&ref=mail', hash: '#capture' }), {
    action: 'redirect', reason: 'compatible-camera-entry',
    url: '/draw/?utm_source=archive&ref=mail&modeProjectTool=camera&mode=camera#capture'
  });
  assert.equal(resolveLegacyLensEntry({ search: '', hash: '#legacy-anchor' }).url, '/draw/?modeProjectTool=camera&mode=camera#legacy-anchor');
});

test('current PXD pointers move into the camera-scoped namespace without dropping the fragment', () => {
  const result = resolveLegacyLensEntry({ search: '?pxd=project-7&pxdRevision=rev-2&pxdImage=camera&utm_campaign=old', hash: '#preview' });
  assert.deepEqual(result, {
    action: 'redirect', reason: 'compatible-camera-entry',
    url: '/draw/?utm_campaign=old&modePxd=project-7&modePxdRevision=rev-2&modePxdImage=camera&modeProjectTool=camera&mode=camera#preview'
  });
});

test('camera-scoped share pointers survive when the redundant tool hint is absent', () => {
  const result = resolveLegacyLensEntry({ search: '?modePxd=project-7&modePxdRevision=rev-2&modePxdImage=main', hash: '#preview' });
  assert.equal(result.action, 'redirect');
  const url = new URL(result.url, 'https://local.invalid');
  assert.equal(url.searchParams.get('modePxd'), 'project-7');
  assert.equal(url.searchParams.get('modePxdRevision'), 'rev-2');
  assert.equal(url.searchParams.get('modePxdImage'), 'main');
  assert.equal(url.hash, '#preview');
});

test('ambiguous pointer values, unrelated state and external legacy returns stay on the recovery bridge', () => {
  for (const search of [
    '?pxd=one&pxd=two&pxdRevision=rev',
    '?pxd=one',
    '?modePxd=project&modeProjectTool=camera',
    '?pxd=one&pxdRevision=rev&x=kept',
    '?draw_url=https%3A%2F%2Fevil.example%2F',
    '?draw_return=self',
    '?mode=audio',
    '?outputId=bad-id'
  ]) assert.equal(resolveLegacyLensEntry({ search }).action, 'stay', search);
  assert.equal(resolveLegacyLensEntry({ search: '?draw_url=https%3A%2F%2Fevil.example%2F' }).url, undefined);
  assert.equal(resolveLegacyLensEntry({ search: '?draw_return=self' }).url, undefined);
});

test('one valid old capture ID gets an explicit recovery URL without being forwarded to the camera', () => {
  assert.deepEqual(resolveLegacyLensEntry({ search: `?outputId=${outputId}` }), {
    action: 'stay', reason: 'output-recovery', outputUrl: `/output/work/?id=${outputId}`
  });
  assert.equal(resolveLegacyLensEntry({ search: `?outputId=${outputId}&outputId=${outputId}` }).reason, 'invalid-output-reference');
});

test('pending localStorage or window.name transfer is detected but never consumed or imported', () => {
  let gets = 0;
  const storage = { getItem(key) { gets++; assert.equal(key, 'pixiee-lens:pending-draw-import'); return '{"version":1,"filename":"old-capture.png","dataUrl":"data:image/png;base64,AA=="}'; } };
  const local = resolveLegacyLensEntry({ search: '', hasPendingTransfer: true });
  assert.deepEqual(local, { action: 'stay', reason: 'pending-transfer' });
  const opened = resolveLegacyLensEntry({ search: '', hasPendingTransfer: true });
  assert.deepEqual(opened, local);
  assert.equal(gets, 0, 'the pure resolver has no storage access');

  const windowName = JSON.stringify({ type: 'pixiee-lens:draw-import-window-name', version: 1, payload: { dataUrl: 'data:image/png;base64,AA==' } });
  const status = { textContent: '' }, transferNote = { hidden: true }, outputLink = { hidden: true }, transferDownload = { hidden: true };
  const nodes = new Map([
    ['[data-legacy-camera-link]', { href: '' }], ['[data-legacy-output-link]', outputLink],
    ['[data-legacy-entry-status]', status], ['[data-legacy-output-note]', { hidden: true }],
    ['[data-legacy-transfer-note]', transferNote], ['[data-legacy-transfer-download]', transferDownload],
    ['[data-legacy-state-note]', { hidden: true }]
  ]);
  const location = { search: '', hash: '', replace() { assert.fail('pending transfer must not auto-redirect'); } };
  const result = initLegacyLensEntry({ locationLike: location, documentLike: { querySelector: (selector) => nodes.get(selector) }, storage, windowName });
  assert.equal(result.reason, 'pending-transfer');
  assert.equal(transferNote.hidden, false);
  assert.equal(nodes.get('[data-legacy-camera-link]').href, '/draw/?mode=camera');
  assert.match(status.textContent, /消費・変更せずに保持/);
  assert.equal(transferDownload.download, 'old-capture.png');
  assert.equal(transferDownload.hidden, false);
  assert.match(transferDownload.href, /^data:image\/png;base64,/);
  assert.equal(gets, 1);
  assert.equal(typeof storage.removeItem, 'undefined', 'the bridge never removes legacy storage');
});

test('output recovery and pending-transfer UI keep the old record link explicit', () => {
  const nodes = new Map([
    ['[data-legacy-camera-link]', { href: '' }], ['[data-legacy-output-link]', { href: '', hidden: true }],
    ['[data-legacy-entry-status]', { textContent: '' }], ['[data-legacy-output-note]', { hidden: true }],
    ['[data-legacy-transfer-note]', { hidden: true }], ['[data-legacy-transfer-download]', { hidden: true }],
    ['[data-legacy-state-note]', { hidden: true }]
  ]);
  const location = { search: `?outputId=${outputId}`, hash: '', replace() { assert.fail('an old output ID must not enter current camera restore'); } };
  const result = initLegacyLensEntry({ locationLike: location, documentLike: { querySelector: (selector) => nodes.get(selector) }, storage: { getItem: () => null }, windowName: '' });
  assert.equal(result.reason, 'output-recovery');
  assert.equal(nodes.get('[data-legacy-output-link]').href, `/output/work/?id=${outputId}`);
  assert.equal(nodes.get('[data-legacy-output-link]').hidden, false);
  assert.equal(nodes.get('[data-legacy-output-note]').hidden, false);
});

test('storage-denied environments still route safely and leave window.name untouched', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('denied'); } });
  try {
    let destination = '';
    const result = initLegacyLensEntry({
      locationLike: { search: '', hash: '', replace(value) { destination = value; } },
      documentLike: { querySelector: () => null },
      windowName: '{"host":"must stay untouched"}'
    });
    assert.equal(result.action, 'redirect');
    assert.equal(destination, '/draw/?modeProjectTool=camera&mode=camera');
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});

test('a window.name-only transfer remains in place and offers an image download when supported', () => {
  const name = JSON.stringify({ type: 'pixiee-lens:draw-import-window-name', version: 1,
    payload: { filename: '../unsafe:name.png', dataUrl: 'data:image/png;base64,AA==' } });
  const nodes = new Map([
    ['[data-legacy-camera-link]', { href: '' }], ['[data-legacy-output-link]', { hidden: true }],
    ['[data-legacy-entry-status]', { textContent: '' }], ['[data-legacy-output-note]', { hidden: true }],
    ['[data-legacy-transfer-note]', { hidden: true }], ['[data-legacy-transfer-download]', { hidden: true }],
    ['[data-legacy-state-note]', { hidden: true }]
  ]);
  const location = { search: '', hash: '', replace() { assert.fail('window.name transfer must be preserved'); } };
  const result = initLegacyLensEntry({ locationLike: location,
    documentLike: { querySelector: (selector) => nodes.get(selector) }, storage: { getItem: () => null }, windowName: name });
  assert.equal(result.reason, 'pending-transfer');
  assert.equal(nodes.get('[data-legacy-transfer-note]').hidden, false);
  assert.equal(nodes.get('[data-legacy-transfer-download]').download, 'unsafe-name.png');
  assert.equal(nodes.get('[data-legacy-transfer-download]').hidden, false);
  assert.equal(name.includes('data:image/png;base64,AA=='), true, 'the caller-supplied window.name value is not modified');
});
