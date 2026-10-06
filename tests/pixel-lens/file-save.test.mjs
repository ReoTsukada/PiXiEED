import test from 'node:test';
import assert from 'node:assert/strict';
import { createCameraFileSave } from '../../js/pixel-lens/file-save.mjs';

class FakeElement {
  constructor() {
    this.listeners = new Map();
    this.attributes = new Map();
    this.hidden = false;
    this.disabled = false;
    this.textContent = '';
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'href') delete this.href;
    if (name === 'download') delete this.download;
  }

  async click() {
    let prevented = false;
    const event = { preventDefault() { prevented = true; } };
    for (const listener of this.listeners.get('click') ?? []) listener(event);
    return { prevented };
  }
}

function harness({ navigatorRef = {}, FileRef = class FakeFile {
  constructor(parts, name, options) { Object.assign(this, { parts, name, type: options.type }); }
} } = {}) {
  const elements = {
    '#cameraShareFile': new FakeElement(),
    '#cameraDownloadFile': new FakeElement(),
    '#cameraOpenFile': new FakeElement(),
    '#cameraSaveStatus': new FakeElement(),
    '#cameraSaveHelp': new FakeElement()
  };
  elements['#cameraSaveHelp'].textContent = 'iPhoneは「写真・アプリに保存」から「画像を保存」。Android・パソコンは「ファイルを保存」も使えます。';
  const dialog = {
    open: false,
    listeners: new Map(),
    querySelector(selector) { return elements[selector]; },
    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    },
    showModal() { this.open = true; },
    close() {
      this.open = false;
      for (const listener of this.listeners.get('close') ?? []) listener();
    }
  };
  const controller = createCameraFileSave({ dialog, navigatorRef, FileRef });
  return {
    controller,
    dialog,
    cameraShareFile: elements['#cameraShareFile'],
    cameraDownloadFile: elements['#cameraDownloadFile'],
    cameraOpenFile: elements['#cameraOpenFile'],
    cameraSaveStatus: elements['#cameraSaveStatus'],
    cameraSaveHelp: elements['#cameraSaveHelp']
  };
}

function show(h, overrides = {}) {
  const blob = { type: 'image/png', size: 3, payload: 'png' };
  const snapshot = { isCurrent: () => true };
  const args = { blob, url: 'blob:camera-image', filename: 'camera.png', ...snapshot, ...overrides };
  return { args, result: h.controller.show(args) };
}

test('shows native links and creates a named image File for supported share', () => {
  let canShareData;
  const h = harness({ navigatorRef: {
    share() { return Promise.resolve(); },
    canShare(data) { canShareData = data; return true; }
  } });
  const { args, result } = show(h);
  assert.equal(result, true);
  assert.equal(h.dialog.open, true);
  assert.equal(h.cameraDownloadFile.href, args.url);
  assert.equal(h.cameraDownloadFile.download, args.filename);
  assert.equal(h.cameraOpenFile.href, args.url);
  assert.equal(h.cameraShareFile.hidden, false);
  assert.equal(canShareData.files[0].name, 'camera.png');
  assert.equal(canShareData.files[0].type, 'image/png');
  assert.deepEqual(canShareData.files[0].parts, [args.blob]);
});

test('hides native share when canShare is false, throws, or File is unavailable', () => {
  for (const setup of [
    { navigatorRef: { share() {}, canShare: () => false } },
    { navigatorRef: { share() {}, canShare() { throw new Error('blocked'); } } },
    { navigatorRef: { share() {}, canShare: () => true }, FileRef: null }
  ]) {
    const h = harness(setup);
    assert.equal(show(h).result, true);
    assert.equal(h.cameraShareFile.hidden, true);
    assert.equal(h.cameraShareFile.disabled, true);
    assert.match(h.cameraSaveHelp.textContent, /ファイルを保存/);
    assert.doesNotMatch(h.cameraSaveHelp.textContent, /写真・アプリに保存/);
  }
});

test('share cancellation leaves the user in the dialog with a neutral status and no automatic fallback', async () => {
  let releaseShare;
  let downloadClicks = 0;
  const h = harness({ navigatorRef: {
    canShare: () => true,
    share: () => new Promise((_resolve, reject) => { releaseShare = reject; })
  } });
  show(h);
  h.cameraDownloadFile.addEventListener('click', () => { downloadClicks++; });
  h.cameraShareFile.click();
  releaseShare(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.dialog.open, true);
  assert.match(h.cameraSaveStatus.textContent, /共有をキャンセル/);
  assert.equal(downloadClicks, 0);
});

test('synchronous share cancellation is shown as a cancellation, not a failure', () => {
  const h = harness({ navigatorRef: {
    canShare: () => true,
    share() { throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); }
  } });
  show(h);
  h.cameraShareFile.click();
  assert.match(h.cameraSaveStatus.textContent, /共有をキャンセル/);
  assert.equal(h.cameraDownloadFile.href, 'blob:camera-image');
});

test('reports share failure and keeps file and open links available', async () => {
  const h = harness({ navigatorRef: { canShare: () => true, share: () => Promise.reject(new Error('failed')) } });
  show(h);
  await h.cameraShareFile.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(h.cameraSaveStatus.textContent, /ファイルを保存/);
  assert.equal(h.cameraDownloadFile.href, 'blob:camera-image');
  assert.equal(h.cameraOpenFile.href, 'blob:camera-image');
});

test('rejects stale snapshots before opening and blocks stale native anchor clicks', async () => {
  let current = true;
  const h = harness();
  const { args } = show(h, { isCurrent: () => current });
  assert.equal(h.cameraDownloadFile.href, args.url);
  current = false;
  const download = await h.cameraDownloadFile.click();
  const open = await h.cameraOpenFile.click();
  assert.equal(download.prevented, true);
  assert.equal(open.prevented, true);
  assert.equal(h.cameraSaveStatus.textContent, '');

  const stale = harness();
  assert.equal(stale.controller.show({ blob: {}, url: 'blob:stale', filename: 'stale.png', isCurrent: () => false }), false);
  assert.equal(stale.dialog.open, false);
  assert.equal(stale.cameraDownloadFile.href, undefined);
});

test('reset clears URLs, download metadata, status, and closes the dialog', () => {
  const h = harness();
  show(h);
  h.controller.reset();
  assert.equal(h.dialog.open, false);
  assert.equal(h.cameraDownloadFile.href, undefined);
  assert.equal(h.cameraDownloadFile.download, undefined);
  assert.equal(h.cameraOpenFile.href, undefined);
  assert.equal(h.cameraSaveStatus.textContent, '');
  assert.match(h.cameraSaveHelp.textContent, /写真・アプリに保存/);
});

test('queued close event from reset cannot clear a newly shown dialog', async () => {
  const h = harness();
  show(h);
  h.dialog.close = function closeAndQueueEvent() {
    this.open = false;
    setImmediate(() => {
      for (const listener of this.listeners.get('close') ?? []) listener();
    });
  };
  h.controller.reset();
  assert.equal(h.controller.show({
    blob: { type: 'image/png' },
    url: 'blob:new-after-close',
    filename: 'new.png',
    isCurrent: () => true
  }), true);
  h.cameraSaveStatus.textContent = '新しい保存ダイアログ';
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.dialog.open, true);
  assert.equal(h.cameraDownloadFile.href, 'blob:new-after-close');
  assert.equal(h.cameraSaveStatus.textContent, '新しい保存ダイアログ');
});

test('late share result from a reset snapshot cannot update a newly opened save dialog', async () => {
  let releaseShare;
  let revision = 1;
  const h = harness({ navigatorRef: {
    canShare: () => true,
    share: () => new Promise((resolve) => { releaseShare = resolve; })
  } });
  show(h, { isCurrent: () => revision === 1 });
  h.cameraShareFile.click();
  h.controller.reset();
  revision = 2;
  const next = { blob: { type: 'image/png' }, url: 'blob:new', filename: 'new.png', isCurrent: () => true };
  assert.equal(h.controller.show(next), true);
  h.cameraSaveStatus.textContent = '新しい保存ダイアログ';
  releaseShare();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.cameraSaveStatus.textContent, '新しい保存ダイアログ');
  assert.equal(h.cameraDownloadFile.href, 'blob:new');
});

test('duplicate share gestures are ignored while a share sheet is pending', () => {
  let calls = 0;
  const h = harness({ navigatorRef: { canShare: () => true, share: () => { calls++; return new Promise(() => {}); } } });
  show(h);
  h.cameraShareFile.click();
  h.cameraShareFile.click();
  assert.equal(calls, 1);
  assert.equal(h.cameraShareFile.disabled, true);
});

test('download and open actions keep native anchor behavior and give useful instructions', async () => {
  const h = harness();
  show(h);
  const download = await h.cameraDownloadFile.click();
  assert.equal(download.prevented, false);
  assert.match(h.cameraSaveStatus.textContent, /ダウンロードを開始/);
  const open = await h.cameraOpenFile.click();
  assert.equal(open.prevented, false);
  assert.match(h.cameraSaveStatus.textContent, /長押し/);
});

test('records existing file_export analytics only for dispatched download or completed share', async () => {
  const priorGtag = globalThis.gtag;
  const events = [];
  globalThis.gtag = (...args) => events.push(args);
  try {
    const downloaded = harness();
    show(downloaded);
    await downloaded.cameraDownloadFile.click();
    await downloaded.cameraOpenFile.click();
    assert.deepEqual(events, [['event', 'file_export', { file_type: 'png', method: 'downloaded' }]]);

    const shared = harness({ navigatorRef: { canShare: () => true, share: () => Promise.resolve() } });
    show(shared);
    shared.cameraShareFile.click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(events[1], ['event', 'file_export', { file_type: 'png', method: 'shared' }]);

    const cancelled = harness({ navigatorRef: {
      canShare: () => true,
      share: () => Promise.reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }))
    } });
    show(cancelled);
    cancelled.cameraShareFile.click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(events.length, 2);
  } finally {
    if (priorGtag === undefined) delete globalThis.gtag;
    else globalThis.gtag = priorGtag;
  }
});
