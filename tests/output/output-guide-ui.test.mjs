import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { purposeFromHash, nextPurpose, mountOutputGuideUI } from '../../js/output-guide-ui.mjs';

function fixture(hash = '') {
  const doc = {};
  const element = (id, dataset = {}) => ({ id, dataset, hidden: false, tabIndex: -1,
    attributes: {}, listeners: {},
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(key, handler) { this.listeners[key] = handler; },
    focus() { doc.activeElement = this; },
    closest(selector) { return selector === '[data-guide-purpose]' && this.dataset.guidePurpose ? this : null; },
  });
  const keys = ['image', 'audio', 'video'];
  const tabs = keys.map(key => element(`guide-purpose-${key}`, { guidePurpose: key }));
  const panels = keys.map(key => element(`output-purpose-${key}`, { guidePanel: key }));
  const list = element('list'), status = element('status'), root = element('main');
  const details = { tagName: 'DETAILS', open: false };
  root.querySelector = selector => selector === '[data-guide-purposes]' ? list
    : selector === '[data-guide-current]' ? status
    : tabs.find(tab => selector === `[data-guide-purpose="${tab.dataset.guidePurpose}"]`)
      || panels.find(panel => selector === `[data-guide-panel="${panel.dataset.guidePanel}"]`) || null;
  root.contains = () => true;
  doc.querySelector = () => root;
  doc.getElementById = id => id === 'guide-format-details' ? details : null;
  const win = { location: { hash }, listeners: {}, addEventListener(key, handler) { this.listeners[key] = handler; } };
  const send = (name, target, extra = {}) => {
    const event = { target, key: '', button: 0, defaultPrevented: false, ...extra,
      preventDefault() { this.defaultPrevented = true; } };
    root.listeners[name](event); return event;
  };
  return { doc, win, root, list, status, tabs, panels, details, send };
}

test('only three public purpose hashes are recognized', () => {
  for (const key of ['image', 'audio', 'video']) assert.equal(purposeFromHash(`#output-purpose-${key}`), key);
  for (const hash of ['', '#other', '#output-purpose-image<script>', '#output-purpose-IMAGE', null]) assert.equal(purposeFromHash(hash), null);
});
test('keyboard navigation wraps and handles boundaries', () => {
  assert.equal(nextPurpose('image', 'ArrowLeft'), 'video');
  assert.equal(nextPurpose('video', 'ArrowRight'), 'image');
  assert.equal(nextPurpose('audio', 'Home'), 'image');
  assert.equal(nextPurpose('image', 'End'), 'video');
  assert.equal(nextPurpose('audio', 'Tab'), null);
});
test('missing document is a safe no-op', () => assert.equal(mountOutputGuideUI({ doc: null, win: null }), null));
test('initial state is accessible and has exactly one panel', () => {
  const f = fixture(); const result = mountOutputGuideUI(f);
  assert.equal(result.selected, 'image');
  assert.equal(f.list.attributes.role, 'tablist');
  assert.deepEqual(f.tabs.map(t => t.tabIndex), [0, -1, -1]);
  assert.deepEqual(f.panels.map(p => p.hidden), [false, true, true]);
  assert.equal(f.panels[0].attributes['aria-labelledby'], f.tabs[0].id);
  assert.equal(f.status.textContent, '使い方：画像の変換');
  assert.equal(f.root.dataset.guidePurpose, undefined, 'root must not masquerade as a purpose control');
});
test('mount is idempotent', () => {
  const f = fixture(); assert.equal(mountOutputGuideUI(f), mountOutputGuideUI(f));
});
test('deep links select the corresponding guide', () => {
  const f = fixture('#output-purpose-audio'); const result = mountOutputGuideUI(f);
  assert.equal(result.selected, 'audio');
  f.win.location.hash = '#output-purpose-video'; f.win.listeners.hashchange();
  assert.equal(result.selected, 'video');
});
test('ordinary click changes guide without moving location', () => {
  const f = fixture(); const result = mountOutputGuideUI(f);
  assert.equal(f.send('click', f.tabs[1]).defaultPrevented, true);
  assert.equal(result.selected, 'audio'); assert.equal(f.win.location.hash, '');
});
test('modified click preserves native link behavior', () => {
  const f = fixture(); const result = mountOutputGuideUI(f);
  assert.equal(f.send('click', f.tabs[1], { ctrlKey: true }).defaultPrevented, false);
  assert.equal(result.selected, 'image');
});
test('keyboard changes selection and focus together', () => {
  const f = fixture(); const result = mountOutputGuideUI(f);
  f.send('keydown', f.tabs[0], { key: 'ArrowRight' });
  assert.equal(result.selected, 'audio'); assert.equal(f.doc.activeElement, f.tabs[1]);
  f.send('keydown', f.tabs[1], { key: 'End' }); assert.equal(result.selected, 'video');
});
test('space activates the focused link as a tab', () => {
  const f = fixture(); const result = mountOutputGuideUI(f);
  assert.equal(f.send('keydown', f.tabs[2], { key: ' ' }).defaultPrevented, true);
  assert.equal(result.selected, 'video');
});
test('unknown selection cannot overwrite the selected guide', () => {
  const f = fixture(); const result = mountOutputGuideUI(f); result.select('<img onerror=alert(1)>');
  assert.equal(result.selected, 'image');
});
test('format deep link opens native disclosure', () => {
  const f = fixture('#guide-format-details'); mountOutputGuideUI(f); assert.equal(f.details.open, true);
});
test('HTML retains fallback links, privacy boundary and important limitations', async () => {
  const html = await readFile(new URL('../../output/index.html', import.meta.url), 'utf8');
  assert.equal((html.match(/data-guide-panel="/g) || []).length, 3);
  assert.equal((html.match(/data-output-start/g) || []).length, 2);
  assert.match(html, /data-output-guide-ad aria-label="広告" hidden/);
  assert.doesNotMatch(html, /<input[^>]*type="file"/);
  for (const text of ['120秒以内', '800万画素', 'MP3・FLAC出力は未対応', '元動画の音声は含みません']) assert.ok(html.includes(text));
  assert.match(html, /<details id="guide-format-details"/);
});
test('guidance adds no network, storage or advertising API', async () => {
  const source = await readFile(new URL('../../js/output-guide-ui.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(fetch|XMLHttpRequest|localStorage|sessionStorage|adsbygoogle)\b/);
});
