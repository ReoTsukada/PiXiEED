import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { createModeScope } from '../../js/creation/mode-scope.mjs';
import { createNormalMap } from '../../js/creation/draw-normal-map.mjs';
import { mountDrawNormalMapPanel } from '../../js/creation/draw-normal-map-panel.mjs';

class FakeElement {
  constructor(ownerDocument, tagName = 'div') {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.style = {};
    this.parentElement = null;
    this.value = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.open = false;
    this.width = 0;
    this.height = 0;
    this.canvasContext = null;
    this.selectors = new Map();
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, callback, options = {}) {
    const list = this.listeners.get(type) || [];
    list.push(callback);
    this.listeners.set(type, list);
    options?.signal?.addEventListener('abort', () => this.removeEventListener(type, callback), { once: true });
  }
  removeEventListener(type, callback) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== callback)); }
  fire(type) {
    const event = { type, target: this, preventDefault() {} };
    for (const callback of [...(this.listeners.get(type) || [])]) callback(event);
    return event;
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parentElement?.removeChild(node);
      node.parentElement = this;
      this.children.push(node);
    }
  }
  removeChild(node) { this.children = this.children.filter(item => item !== node); node.parentElement = null; }
  remove() { this.parentElement?.removeChild(this); }
  querySelector(selector) { return this.selectors.get(selector) || null; }
  get innerHTML() { return ''; }
  set innerHTML(_html) {
    const kinds = {
      '[data-note]': 'p', '[data-frame-size]': 'p', '[data-close]': 'button', '[data-refresh]': 'button',
      '[data-export-section]': 'details', '[data-apply]': 'button', '[data-cancel]': 'button', '[data-preview-lighting]': 'input', '[data-apply-note]': 'p',
      '[data-refresh-status]': 'span', '[data-source]': 'canvas', '[data-normal]': 'canvas', '[data-lit]': 'canvas',
      '[data-method]': 'select', '[data-strength-value]': 'output', '[data-strength]': 'input',
      '[data-radius-field]': 'div', '[data-radius-value]': 'output', '[data-radius]': 'input',
      '[data-azimuth-value]': 'output', '[data-azimuth]': 'input',
      '[data-elevation-value]': 'output', '[data-elevation]': 'input', '[data-invert]': 'input',
      '[data-format]': 'select', '[data-error]': 'p', '[data-save]': 'button', '[data-save-lit]': 'button', '[data-download]': 'a',
      '[data-light-preset]': 'select', '[data-initial-fill]': 'select', '[data-initial-fill-field]': 'label',
      '[data-shade-unpainted]': 'input', '[data-shade-unpainted-field]': 'label', '[data-light-color]': 'input',
      '[data-painted-option]': 'option', '[data-strength-field]': 'label', '[data-invert-field]': 'label', '[data-edit-section]': 'div', '[data-edit-normal]': 'button'
    };
    for (const name of ['specular', 'roughness', 'ambient', 'intensity', 'overlay-opacity']) {
      kinds[`[data-${name}]`] = 'input'; kinds[`[data-${name}-value]`] = 'output';
    }
    for (const [selector, tag] of Object.entries(kinds)) {
      const element = new FakeElement(this.ownerDocument, tag); this.selectors.set(selector, element); this.append(element);
    }
    this.selectors.get('[data-export-section]').append(this.selectors.get('[data-download]'));
    this.selectors.get('[data-method]').value = 'silhouette';
    this.selectors.get('[data-strength]').value = '2';
    this.selectors.get('[data-radius]').value = '3';
    this.selectors.get('[data-azimuth]').value = '315';
    this.selectors.get('[data-elevation]').value = '45';
    this.selectors.get('[data-format]').value = 'opengl';
    for (const selector of ['[data-source]', '[data-normal]', '[data-lit]']) {
      const canvas = this.selectors.get(selector);
      canvas.parentElement = { getBoundingClientRect: () => ({ width: 120 }) };
      canvas.getContext = () => canvas.context();
      canvas.context = () => {
        if (!canvas.canvasContext) canvas.canvasContext = {
          imageSmoothingEnabled: true,
          createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4) }; },
          putImageData(image) { canvas.lastImage = { data: new Uint8ClampedArray(image.data), width: canvas.width, height: canvas.height }; },
          clearRect() { canvas.lastImage = null; }
        };
        return canvas.canvasContext;
      };
    }
  }
  click() {
    if (this.tagName === 'a') {
      if (this.ownerDocument.failDownload) throw new Error('ダウンロードを開始できません。');
      this.ownerDocument.downloads.push({ href: this.href, filename: this.download, parent: this.parentElement });
    }
    this.fire('click');
  }
  showModal() { this.open = true; }
  close() { this.open = false; this.fire('close'); }
  getBoundingClientRect() { return { width: 120 }; }
}

function sourceFixture() {
  const rgba = new Uint8ClampedArray(5 * 5 * 4);
  for (let y = 1; y <= 3; y += 1) for (let x = 1; x <= 3; x += 1) {
    const offset = (y * 5 + x) * 4;
    rgba.set([200, 120, 60, 255], offset);
  }
  return { width: 5, height: 5, rgba };
}

function fixture({ beforeOpen = () => {}, getSource = sourceFixture, getPaintedNormal = () => null, onEditNormal = null, getSettings = () => null, onSettingsChange = () => {}, onApplyNormal = null, onSavePng = null } = {}) {
  let nextFrame = 1;
  const frames = new Map(), blobs = new Map(), revoked = [];
  let nextUrl = 1;
  const win = {
    innerHeight: 800,
    URL: {
      createObjectURL(blob) { const url = `blob:test-${nextUrl++}`; blobs.set(url, blob); return url; },
      revokeObjectURL(url) { revoked.push(url); blobs.delete(url); }
    },
    requestAnimationFrame(callback) { const id = nextFrame++; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout
  };
  const doc = {
    hidden: false, downloads: [], failDownload: false,
    defaultView: win,
    createElement(tag) { return new FakeElement(doc, tag); },
    body: null
  };
  doc.body = new FakeElement(doc, 'body');
  const host = new FakeElement(doc, 'main');
  const scope = createModeScope(win);
  let sourceReads = 0;
  const panel = mountDrawNormalMapPanel({ scope, host, getSource: () => { sourceReads += 1; return getSource(); }, beforeOpen, getPaintedNormal, onEditNormal, getSettings, onSettingsChange, onApplyNormal, onSavePng });
  host.append(panel.opener);
  const flushFrames = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach(callback => callback(16));
  };
  return { doc, host, scope, panel, frames, blobs, revoked, flushFrames, get sourceReads() { return sourceReads; } };
}

function pixel(image, x, y, channel = 0) { return image.data[(y * image.width + x) * 4 + channel]; }

test('same-frame strength and light changes keep the queued normal rebuild', () => {
  const ui = fixture();
  ui.panel.open();
  ui.flushFrames();
  const strength = ui.panel.panel.querySelector('[data-strength]');
  const azimuth = ui.panel.panel.querySelector('[data-azimuth]');
  strength.value = '0'; strength.fire('input');
  azimuth.value = '45'; azimuth.fire('input');
  assert.equal(ui.frames.size, 1, 'both inputs are coalesced into one animation frame');
  assert.equal(ui.panel.panel.querySelector('[data-save]').disabled, true, 'saving stays disabled while previews are pending');
  ui.flushFrames();

  const normalCanvas = ui.panel.panel.querySelector('[data-normal]');
  const expected = createNormalMap(sourceFixture(), { method: 'silhouette', strength: 0, radius: 3, invertHeight: false, format: 'opengl' });
  for (let y = 0; y < expected.height; y += 1) for (let x = 0; x < expected.width; x += 1) {
    for (let channel = 0; channel < 4; channel += 1) assert.equal(pixel(normalCanvas.lastImage, x, y, channel), expected.rgba[(y * expected.width + x) * 4 + channel]);
  }
  assert.equal(ui.panel.panel.querySelector('[data-save]').disabled, false);
  ui.scope.dispose();
});

test('beforeOpen false and errors show a clear empty-dialog message without reading or enabling save', () => {
  for (const [beforeOpen, expected] of [
    [() => false, /現在の操作を完了してから/],
    [() => { throw new Error('編集を確定してください。'); }, /編集を確定してください。/]
  ]) {
    const ui = fixture({ beforeOpen });
    assert.equal(ui.panel.open(), false);
    assert.equal(ui.sourceReads, 0);
    assert.equal(ui.panel.isOpen, true, 'the explanation is shown in a modal dialog');
    assert.match(ui.panel.panel.querySelector('[data-error]').textContent, expected);
    assert.equal(ui.panel.panel.querySelector('[data-save]').disabled, true);
    assert.equal(ui.panel.panel.querySelector('[data-apply]').disabled, true);
    assert.equal(ui.panel.panel.querySelector('[data-normal]').lastImage, null);
    ui.scope.dispose();
  }
});

test('close clears its snapshot and scheduled draw; reopen reads the changed source', () => {
  let source = sourceFixture();
  const ui = fixture({ getSource: () => source });
  ui.panel.open(); ui.flushFrames();
  ui.panel.panel.querySelector('[data-strength]').value = '0';
  ui.panel.panel.querySelector('[data-strength]').fire('input');
  assert.equal(ui.frames.size, 1);
  ui.panel.close();
  assert.equal(ui.frames.size, 0, 'close cancels the queued render');
  assert.equal(ui.panel.isOpen, false);
  assert.equal(ui.panel.panel.querySelector('[data-normal]').lastImage, null, 'close releases rendered preview pixels');
  assert.equal(ui.panel.panel.querySelector('[data-lit]').lastImage, null, 'close releases lighting preview pixels');

  source = { width: 5, height: 5, rgba: new Uint8ClampedArray(5 * 5 * 4).fill(0) };
  ui.panel.open(); ui.flushFrames();
  assert.equal(ui.sourceReads, 2, 'reopen takes a fresh current-frame snapshot');
  const normalCanvas = ui.panel.panel.querySelector('[data-normal]');
  assert.equal(pixel(normalCanvas.lastImage, 2, 2, 3), 0, 'the reopened preview uses the updated transparent source');
  ui.scope.dispose();
});

test('dispose cancels a pending render and removes the panel controls', () => {
  const ui = fixture();
  ui.panel.open(); ui.flushFrames();
  ui.panel.panel.querySelector('[data-strength]').value = '0';
  ui.panel.panel.querySelector('[data-strength]').fire('input');
  assert.equal(ui.frames.size, 1);
  ui.scope.dispose();
  assert.equal(ui.frames.size, 0, 'dispose must release the scheduled animation frame');
  assert.equal(ui.panel.isOpen, false);
  assert.equal(ui.panel.panel.querySelector('[data-normal]').lastImage, null, 'dispose releases the rendered normal pixels');
  assert.equal(ui.panel.panel.querySelector('[data-lit]').lastImage, null, 'dispose releases the rendered lighting pixels');
  assert.equal(ui.host.children.includes(ui.panel.opener), false);
  assert.equal(ui.doc.body.children.includes(ui.panel.panel), false);
});


test('hand-painted layer previews exact directions and opens editing without overwriting it', () => {
  const painted = sourceFixture();
  for (let offset = 0; offset < painted.rgba.length; offset += 4) {
    painted.rgba[offset] = 218; painted.rgba[offset + 1] = 128; painted.rgba[offset + 2] = 218;
  }
  const original = new Uint8ClampedArray(painted.rgba);
  let edits = 0;
  const ui = fixture({ getPaintedNormal: () => painted, onEditNormal: () => { edits++; return true; } });
  ui.panel.open(); ui.flushFrames();
  const panel = ui.panel.panel;
  assert.equal(panel.querySelector('[data-method]').value, 'painted');
  assert.equal(panel.querySelector('[data-strength-field]').hidden, true);
  assert.equal(panel.querySelector('[data-radius-field]').hidden, true);
  assert.equal(panel.querySelector('[data-normal]').lastImage.data[(2 * 5 + 2) * 4], 218);
  assert.equal(panel.querySelector('[data-save]').disabled, false);
  panel.querySelector('[data-edit-normal]').fire('click');
  assert.equal(edits, 1); assert.equal(ui.panel.isOpen, false);
  assert.deepEqual(painted.rgba, original);
  ui.scope.dispose();
});


test('draft settings write exactly once on Apply, survive remount, and restore without a write', () => {
  let stored = { azimuth: 225, elevation: 68, format: 'directx', ambient: 0.4, specular: 0.6, initialFill: 'flat', overlayOpacity: 0.4 };
  let writes = 0;
  const options = { getSettings: () => stored, onSettingsChange: value => { stored = value; writes++; } };
  let ui = fixture(options);
  ui.panel.open(); ui.flushFrames();
  assert.equal(ui.panel.panel.querySelector('[data-azimuth]').value, '225');
  assert.equal(ui.panel.panel.querySelector('[data-elevation]').value, '68');
  assert.equal(ui.panel.panel.querySelector('[data-format]').value, 'directx');
  assert.equal(ui.panel.panel.querySelector('[data-overlay-opacity]').value, '0.4');
  assert.equal(writes, 0, 'reading a project never dirties its settings');
  const elevation = ui.panel.panel.querySelector('[data-elevation]'); elevation.value = '60'; elevation.fire('input');
  assert.equal(stored.elevation, 68); assert.equal(writes, 0, 'input only changes the local draft');
  assert.equal(ui.panel.panel.querySelector('[data-apply]').disabled, true);
  ui.flushFrames(); ui.panel.panel.querySelector('[data-apply]').fire('click');
  assert.equal(stored.elevation, 60); assert.equal(stored.azimuth, 225); assert.equal(writes, 1);
  assert.equal(ui.panel.isOpen, false);
  ui.panel.panel.querySelector('[data-apply]').fire('click'); assert.equal(writes, 1, 'closed panels cannot apply twice');
  ui.panel.open(); ui.flushFrames();
  assert.equal(ui.panel.panel.querySelector('[data-elevation]').value, '60');
  ui.scope.dispose();
  ui = fixture(options); ui.panel.open(); ui.flushFrames();
  assert.equal(ui.panel.panel.querySelector('[data-elevation]').value, '60', 'a remounted output→editor panel restores the project settings');
  stored = { azimuth: 10, elevation: 20 };
  ui.panel.close(); ui.panel.open(); ui.flushFrames();
  assert.equal(ui.panel.panel.querySelector('[data-azimuth]').value, '10', 'opening another project does not reuse the previous project light');
  assert.equal(writes, 1);
  ui.scope.dispose();
});

test('light preset and view-only opacity stay in the draft without rebuilding normal bytes', () => {
  let stored;
  const ui = fixture({ onSettingsChange: value => { stored = value; } });
  ui.panel.open(); ui.flushFrames();
  const originalNormal = new Uint8ClampedArray(ui.panel.panel.querySelector('[data-normal]').lastImage.data);
  const preset = ui.panel.panel.querySelector('[data-light-preset]'); preset.value = 'upper-left'; preset.fire('change');
  assert.equal(stored, undefined);
  assert.equal(ui.panel.panel.querySelector('[data-azimuth]').value, '225');
  assert.equal(ui.panel.panel.querySelector('[data-elevation]').value, '45');
  ui.flushFrames();
  assert.deepEqual(ui.panel.panel.querySelector('[data-normal]').lastImage.data, originalNormal);
  const opacity = ui.panel.panel.querySelector('[data-overlay-opacity]'); opacity.value = '0.2'; opacity.fire('input');
  assert.equal(stored, undefined); assert.equal(ui.frames.size, 0, 'edit overlay opacity does not affect either exported image');
  assert.deepEqual(ui.panel.panel.querySelector('[data-normal]').lastImage.data, originalNormal);
  ui.panel.panel.querySelector('[data-apply]').fire('click');
  assert.equal(stored.overlayOpacity, 0.2); assert.equal(stored.azimuth, 225);
  ui.scope.dispose();
});

test('new normal layer can start transparent or flat; existing layer hides initialization choices', () => {
  for (const initialFill of ['transparent', 'flat']) {
    let requested;
    const ui = fixture({ onEditNormal: options => { requested = options; return true; } });
    ui.panel.open(); ui.flushFrames();
    assert.equal(ui.panel.panel.querySelector('[data-initial-fill-field]').hidden, false);
    const initial = ui.panel.panel.querySelector('[data-initial-fill]');
    assert.equal(initial.value, 'transparent', 'new layers default to seeing the underlay');
    initial.value = initialFill; initial.fire('change');
    ui.panel.panel.querySelector('[data-edit-normal]').fire('click');
    assert.equal(requested.initialFill, initialFill);
    assert.equal(requested.settings.initialFill, initialFill);
    assert.equal(requested.settings.azimuth, 315); ui.scope.dispose();
  }
  const ui = fixture({ getPaintedNormal: sourceFixture, onEditNormal() {} });
  ui.panel.open(); ui.flushFrames();
  assert.equal(ui.panel.panel.querySelector('[data-initial-fill-field]').hidden, true);
  assert.equal(ui.panel.panel.querySelector('[data-invert-field]').hidden, true);
  assert.equal(ui.panel.panel.querySelector('[data-shade-unpainted-field]').hidden, false);
  ui.scope.dispose();
});

async function decodePng(blob) {
  const bytes = Buffer.from(await blob.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20), idat = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(idat)), pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const offset = y * (width * 4 + 1); assert.equal(raw[offset], 0);
    pixels.set(raw.subarray(offset + 1, offset + 1 + width * 4), y * width * 4);
  }
  return { width, height, pixels };
}

test('normal and lit PNG use exact current snapshots and a persistent download link inside the modal', async () => {
  const ui = fixture(); ui.panel.open(); ui.flushFrames();
  const panel = ui.panel.panel;
  const expectedNormal = new Uint8ClampedArray(panel.querySelector('[data-normal]').lastImage.data);
  const expectedLit = new Uint8ClampedArray(panel.querySelector('[data-lit]').lastImage.data);
  panel.querySelector('[data-save]').fire('click');
  assert.equal(ui.doc.downloads.length, 1);
  const first = ui.doc.downloads[0];
  assert.equal(first.parent, panel.querySelector('[data-export-section]'));
  assert.equal(first.parent.parentElement, panel, 'download activation stays inside the active modal instead of the inert page body');
  assert.match(first.filename, /normal-map-5x5-opengl/);
  const decodedNormal = await decodePng(ui.blobs.get(first.href));
  assert.equal(decodedNormal.width, 5); assert.equal(decodedNormal.height, 5); assert.deepEqual(decodedNormal.pixels, expectedNormal);
  assert.equal(panel.querySelector('[data-download]').hidden, false, 'the real download link remains available for retry');
  assert.equal(ui.revoked.length, 0, 'the URL is not immediately revoked while the browser is receiving it');
  assert.match(panel.querySelector('[data-refresh-status]').textContent, /ダウンロードを開始/);
  assert.doesNotMatch(panel.querySelector('[data-refresh-status]').textContent, /保存しました/);
  panel.querySelector('[data-save-lit]').fire('click');
  const second = ui.doc.downloads[1];
  assert.match(second.filename, /pixieed-lit-5x5/);
  const decodedLit = await decodePng(ui.blobs.get(second.href));
  assert.deepEqual(decodedLit.pixels, expectedLit); assert.notDeepEqual(decodedLit.pixels, expectedNormal);
  for (let offset = 3; offset < expectedLit.length; offset += 4) assert.equal(decodedLit.pixels[offset], sourceFixture().rgba[offset]);
  assert.deepEqual(ui.revoked, [first.href], 'replacing the download releases only the previous URL');
  ui.panel.close(); assert.equal(ui.blobs.has(second.href), true, 'closing the panel does not interrupt an in-flight download');
  ui.scope.dispose(); assert.deepEqual(ui.revoked, [first.href, second.href]);
});

test('saving waits for fresh render and errors never report success or retain a stale retry', () => {
  const ui = fixture(); ui.panel.open(); ui.flushFrames();
  const panel = ui.panel.panel;
  panel.querySelector('[data-save-lit]').fire('click'); assert.equal(ui.doc.downloads.length, 1);
  const elevation = panel.querySelector('[data-elevation]'); elevation.value = '0'; elevation.fire('input');
  assert.equal(panel.querySelector('[data-save]').disabled, true);
  assert.equal(panel.querySelector('[data-save-lit]').disabled, true);
  assert.equal(panel.querySelector('[data-download]').hidden, true);
  panel.querySelector('[data-save-lit]').fire('click'); assert.equal(ui.doc.downloads.length, 1, 'even a direct event cannot export a stale lighting snapshot');
  ui.flushFrames(); ui.doc.failDownload = true;
  panel.querySelector('[data-save-lit]').fire('click');
  assert.match(panel.querySelector('[data-error]').textContent, /ダウンロードを開始できません/);
  assert.equal(panel.querySelector('[data-refresh-status]').textContent, '');
  assert.equal(panel.querySelector('[data-download]').hidden, true);
  ui.panel.close(); panel.querySelector('[data-save]').fire('click'); assert.equal(ui.doc.downloads.length, 1);
  ui.scope.dispose();
});


test('editor PNG delivery passes the Blob directly and distinguishes staged, cancelled, and shared outcomes', async () => {
  for (const [result, expected] of [['staged', /出力画面へ渡しました/], ['cancelled', /取り消しました/], ['shared', /共有画面に渡しました/], ['downloaded', /ダウンロードを開始/]]) {
    let delivered, finish;
    const ui = fixture({ onSavePng: (blob, filename) => { delivered = { blob, filename }; return new Promise(resolve => { finish = resolve; }); } });
    ui.panel.open(); ui.flushFrames(); const panel = ui.panel.panel;
    const expectedPixels = new Uint8ClampedArray(panel.querySelector('[data-lit]').lastImage.data);
    panel.querySelector('[data-save-lit]').fire('click');
    assert.equal(panel.querySelector('[data-save]').disabled, true); assert.equal(panel.querySelector('[data-save-lit]').disabled, true);
    assert.equal(panel.querySelector('[data-elevation]').disabled, true, 'mutable settings are disabled while the output handoff is pending');
    assert.equal(ui.doc.downloads.length, 0); assert.equal(ui.blobs.size, 0, 'the editor route needs no fetchable object URL');
    assert.match(delivered.filename, /pixieed-lit-5x5/);
    assert.deepEqual((await decodePng(delivered.blob)).pixels, expectedPixels);
    finish(result); await Promise.resolve();
    assert.match(panel.querySelector('[data-refresh-status]').textContent, expected);
    if (result !== 'downloaded') assert.doesNotMatch(panel.querySelector('[data-refresh-status]').textContent, /ダウンロードを開始|保存しました/);
    assert.equal(panel.querySelector('[data-elevation]').disabled, false);
    ui.scope.dispose();
  }
});

test('editor PNG handoff failure is visible but a closed or disposed panel receives no stale completion', async () => {
  const ui = fixture({ onSavePng: async () => { throw new Error('出力保存に失敗しました。'); } });
  ui.panel.open(); ui.flushFrames(); ui.panel.panel.querySelector('[data-save]').fire('click'); await Promise.resolve();
  assert.match(ui.panel.panel.querySelector('[data-error]').textContent, /出力保存に失敗/);
  assert.equal(ui.panel.panel.querySelector('[data-refresh-status]').textContent, '');
  assert.equal(ui.panel.panel.querySelector('[data-save]').disabled, false); ui.scope.dispose();
  for (const finishWithError of [false, true]) {
    for (const end of ['close', 'dispose', 'reopen']) {
      let finish, fail;
      const next = fixture({ onSavePng: () => new Promise((resolve, reject) => { finish = resolve; fail = reject; }) });
      next.panel.open(); next.flushFrames(); const panel = next.panel.panel;
      panel.querySelector('[data-save]').fire('click');
      if (end === 'dispose') next.scope.dispose();
      else { next.panel.close(); if (end === 'reopen') { next.panel.open(); next.flushFrames(); } }
      if (finishWithError) fail(new Error('古い保存のエラー')); else finish('staged');
      await Promise.resolve();
      assert.equal(panel.querySelector('[data-refresh-status]').textContent, '', `${end}: old completion does not describe the new view`);
      assert.doesNotMatch(panel.querySelector('[data-error]').textContent, /古い保存/);
      if (end !== 'dispose') next.scope.dispose();
    }
  }
});


test('cancel, header close, Escape, close and dispose discard changes without saving settings', () => {
  for (const exit of ['cancel', 'header', 'escape', 'close', 'dispose']) {
    let writes = 0;
    const ui = fixture({ getSettings: () => ({ azimuth: 90, overlayOpacity: 0.7 }), onSettingsChange: () => { writes++; } });
    ui.panel.open(); ui.flushFrames(); const panel = ui.panel.panel;
    panel.querySelector('[data-azimuth]').value = '180'; panel.querySelector('[data-azimuth]').fire('input');
    panel.querySelector('[data-overlay-opacity]').value = '0.2'; panel.querySelector('[data-overlay-opacity]').fire('change');
    if (exit === 'cancel') panel.querySelector('[data-cancel]').fire('click');
    else if (exit === 'header') panel.querySelector('[data-close]').fire('click');
    else if (exit === 'escape') { panel.fire('cancel'); panel.close(); }
    else if (exit === 'dispose') ui.scope.dispose();
    else ui.panel.close();
    assert.equal(writes, 0, `${exit} does not commit the draft`);
    assert.equal(ui.frames.size, 0);
    if (exit !== 'dispose') {
      ui.panel.open(); ui.flushFrames();
      assert.equal(panel.querySelector('[data-azimuth]').value, '90');
      assert.equal(panel.querySelector('[data-overlay-opacity]').value, '0.7'); ui.scope.dispose();
    }
  }
  const standalone = fixture(); standalone.panel.open(); standalone.flushFrames();
  const field = standalone.panel.panel.querySelector('[data-elevation]'); field.value = '10'; field.fire('input');
  standalone.panel.close(); standalone.panel.open(); standalone.flushFrames();
  assert.equal(field.value, '45', 'even a standalone panel discards unsaved drafts'); standalone.scope.dispose();
});

test('PNG export uses draft lighting without applying settings or a layer', async () => {
  let writes = 0, applies = 0, delivered;
  const ui = fixture({ getSettings: () => ({ elevation: 45 }), onSettingsChange: () => { writes++; },
    onApplyNormal: () => { applies++; }, onSavePng: (blob) => { delivered = blob; return 'staged'; } });
  ui.panel.open(); ui.flushFrames(); const panel = ui.panel.panel;
  panel.querySelector('[data-elevation]').value = '5'; panel.querySelector('[data-elevation]').fire('input'); ui.flushFrames();
  const expected = new Uint8ClampedArray(panel.querySelector('[data-lit]').lastImage.data);
  panel.querySelector('[data-save-lit]').fire('click'); await Promise.resolve();
  assert.deepEqual((await decodePng(delivered)).pixels, expected);
  assert.equal(writes, 0); assert.equal(applies, 0); assert.equal(ui.panel.isOpen, true);
  panel.querySelector('[data-cancel]').fire('click'); ui.panel.open(); ui.flushFrames();
  assert.equal(panel.querySelector('[data-elevation]').value, '45'); ui.scope.dispose();
});

test('Apply hands off an exact detached snapshot with format and never invokes a separate settings write', () => {
  let applied, writes = 0;
  const ui = fixture({ onApplyNormal: value => { applied = value; return true; }, onSettingsChange: () => { writes++; } });
  ui.panel.open(); const panel = ui.panel.panel;
  panel.querySelector('[data-apply]').fire('click'); assert.equal(applied, undefined, 'a pending first render cannot apply');
  ui.flushFrames(); panel.querySelector('[data-format]').value = 'directx'; panel.querySelector('[data-format]').fire('change');
  assert.equal(panel.querySelector('[data-apply]').disabled, true); ui.flushFrames();
  const expected = new Uint8ClampedArray(panel.querySelector('[data-normal]').lastImage.data);
  panel.querySelector('[data-apply]').fire('click');
  assert.equal(ui.panel.isOpen, false); assert.equal(writes, 0);
  assert.equal(applied.normal.format, 'directx'); assert.equal(applied.settings.format, 'directx');
  assert.equal(applied.normal.width, 5); assert.equal(applied.normal.height, 5); assert.deepEqual(applied.normal.rgba, expected);
  assert.equal(applied.settings.previewLighting, true, 'a newly generated layer previews lighting by default');
  applied.normal.rgba.fill(0);
  ui.panel.open(); ui.flushFrames(); assert.deepEqual(panel.querySelector('[data-normal]').lastImage.data, expected);
  ui.scope.dispose();
});

test('failed Apply retains the local draft and allows a successful retry without partial settings callbacks', () => {
  for (const failure of ['false', 'throw']) {
    let fail = true, attempts = 0, writes = 0;
    const ui = fixture({ getSettings: () => ({ elevation: 45 }), onSettingsChange: () => { writes++; },
      onApplyNormal: () => { attempts++; if (fail) { if (failure === 'throw') throw new Error('レイヤーを適用できません'); return false; } return true; } });
    ui.panel.open(); ui.flushFrames(); const panel = ui.panel.panel;
    panel.querySelector('[data-elevation]').value = '60'; panel.querySelector('[data-elevation]').fire('input'); ui.flushFrames();
    panel.querySelector('[data-apply]').fire('click');
    assert.equal(ui.panel.isOpen, true); assert.equal(panel.querySelector('[data-elevation]').value, '60');
    assert.equal(panel.querySelector('[data-error]').hidden, false); assert.equal(panel.querySelector('[data-apply]').disabled, false);
    assert.equal(writes, 0); fail = false; panel.querySelector('[data-apply]').fire('click');
    assert.equal(attempts, 2); assert.equal(ui.panel.isOpen, false); ui.scope.dispose();
  }
});

test('dedicated editing carries the whole draft in one transaction; a rejection never writes settings first', () => {
  for (const failure of ['false', 'throw']) {
    let requested, writes = 0;
    const ui = fixture({ onSettingsChange: () => { writes++; }, onEditNormal: value => {
      requested = value; if (failure === 'throw') throw new Error('編集を開始できません'); return false;
    } });
    ui.panel.open(); ui.flushFrames(); const panel = ui.panel.panel;
    panel.querySelector('[data-overlay-opacity]').value = '0.35'; panel.querySelector('[data-overlay-opacity]').fire('input');
    panel.querySelector('[data-edit-normal]').fire('click');
    assert.equal(writes, 0); assert.equal(requested.settings.overlayOpacity, 0.35);
    assert.equal(ui.panel.isOpen, true); assert.equal(panel.querySelector('[data-error]').hidden, false);
    assert.equal(panel.querySelector('[data-overlay-opacity]').value, '0.35'); ui.scope.dispose();
  }
});

test('pending Apply disables duplicate actions and ignores stale completion after closing or disposal', async () => {
  for (const ending of ['close', 'dispose', 'reopen']) {
    let finish, calls = 0;
    const ui = fixture({ onApplyNormal: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
    ui.panel.open(); ui.flushFrames(); const panel = ui.panel.panel;
    panel.querySelector('[data-apply]').fire('click'); panel.querySelector('[data-apply]').fire('click');
    assert.equal(calls, 1); assert.equal(panel.querySelector('[data-save]').disabled, true);
    if (ending === 'dispose') ui.scope.dispose();
    else { ui.panel.close(); if (ending === 'reopen') { ui.panel.open(); ui.flushFrames(); } }
    finish(false); await Promise.resolve();
    assert.equal(panel.querySelector('[data-error]').hidden, true, 'stale completion cannot add an error to another view');
    if (ending === 'reopen') {
      assert.equal(ui.panel.isOpen, true, 'old Apply does not close the new view');
      assert.equal(panel.querySelector('[data-apply]').disabled, false, 'the new valid preview recovers after the old operation settles');
      assert.equal(panel.querySelector('[data-elevation]').disabled, false);
    }
    if (ending !== 'dispose') ui.scope.dispose();
  }
});

test('existing painted layers restore the saved lighting visibility and explain an explicit replacement', () => {
  const ui = fixture({ getPaintedNormal: sourceFixture, getSettings: () => ({ method: 'painted', previewLighting: false }) });
  ui.panel.open(); ui.flushFrames(); const panel = ui.panel.panel;
  assert.equal(panel.querySelector('[data-preview-lighting]').checked, false);
  assert.doesNotMatch(panel.querySelector('[data-note]').textContent, /置き換え/);
  panel.querySelector('[data-method]').value = 'silhouette'; panel.querySelector('[data-method]').fire('change');
  assert.match(panel.querySelector('[data-note]').textContent, /既存の凹凸を生成結果に置き換え/);
  assert.match(panel.querySelector('[data-note]').textContent, /元に戻す/); ui.scope.dispose();
});


test('a rejected compatibility settings callback keeps the draft open for retry', () => {
  let reject = true, writes = 0;
  const ui = fixture({ onSettingsChange: () => { writes++; if (reject) throw new Error('設定を保存できません'); } });
  ui.panel.open(); ui.flushFrames(); const panel = ui.panel.panel;
  panel.querySelector('[data-elevation]').value = '55'; panel.querySelector('[data-elevation]').fire('input'); ui.flushFrames();
  panel.querySelector('[data-apply]').fire('click');
  assert.equal(writes, 1); assert.equal(ui.panel.isOpen, true); assert.equal(panel.querySelector('[data-elevation]').value, '55');
  assert.match(panel.querySelector('[data-error]').textContent, /設定を保存できません/);
  reject = false; panel.querySelector('[data-apply]').fire('click');
  assert.equal(writes, 2); assert.equal(ui.panel.isOpen, false); ui.scope.dispose();
});
