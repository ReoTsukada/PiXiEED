import test from 'node:test';
import assert from 'node:assert/strict';
import { desktopToolIcon, dispatchDesktopToggle, findDesktopToggleSource, syncDesktopToggleProxy } from '../../js/creation/draw-desktop-ui.mjs';

test('desktop selection modes have distinct rail glyphs', () => {
  const icons = ['rectangle', 'lasso', 'color'].map(mode => desktopToolIcon('select', mode));
  assert.deepEqual(icons, ['rectangle', '∿', '◉']);
  assert.equal(new Set(icons).size, 3);
});

function fixture({ outsideRoot = false, disabled = false, pressed = 'true' } = {}) {
  const root = { containsSource: false };
  const makeSource = (name, state) => ({
    disabled: state.disabled,
    clickCount: 0,
    attrs: { 'aria-pressed': state.pressed, 'aria-label': name },
    getAttribute(attribute) { return this.attrs[attribute] ?? null; },
    setAttribute(attribute, value) { this.attrs[attribute] = String(value); },
    click() { this.clickCount += 1; }
  });
  const source = makeSource('マス目を表示', { disabled, pressed });
  const onion = makeSource('オニオン表示', { disabled: false, pressed: 'false' });
  const sources = { '#draw-grid-toggle': source, '#draw-onion-toggle': onion };
  const doc = {
    querySelector(selector) { return sources[selector] || null; }
  };
  if (!outsideRoot) root.containsSource = true;
  return { root, source, onion, doc };
}

test('desktop grid toggle resolves its source from the document when the toolbar moved it outside the editor root', () => {
  const { root, source, doc } = fixture({ outsideRoot: true });
  assert.equal(root.containsSource, false);
  assert.equal(findDesktopToggleSource(doc, 'toggle.grid'), source);
  assert.equal(dispatchDesktopToggle(doc, 'toggle.grid'), true);
  assert.equal(source.clickCount, 1);
  assert.equal(source.getAttribute('aria-pressed'), 'true');
  const proxy = { disabled: false, attrs: { 'aria-label': 'マス目' }, title: '', getAttribute(name) { return this.attrs[name] ?? null; }, setAttribute(name, value) { this.attrs[name] = String(value); } };
  assert.equal(syncDesktopToggleProxy(proxy, source, { label: 'マス目', shortcut: 'G' }), true);
  assert.equal(proxy.attrs['aria-pressed'], 'true');
  assert.equal(proxy.attrs['aria-label'], 'マス目を表示');
  assert.equal(proxy.title, 'マス目を表示 · G');
  assert.equal(proxy.disabled, false);
});

test('desktop toggle dispatch ignores missing and disabled sources', () => {
  const disabled = fixture({ outsideRoot: true, disabled: true });
  assert.equal(dispatchDesktopToggle(disabled.doc, 'toggle.grid'), false);
  assert.equal(disabled.source.clickCount, 0);
  disabled.doc.querySelector = selector => selector === '#draw-grid-toggle' ? disabled.source : null;
  assert.equal(dispatchDesktopToggle(disabled.doc, 'toggle.onion'), false);
  assert.equal(dispatchDesktopToggle(disabled.doc, 'unknown'), false);
});

test('desktop onion proxy resolves and dispatches its document-level source', () => {
  const { root, onion, doc } = fixture({ outsideRoot: true });
  assert.equal(root.containsSource, false);
  assert.equal(findDesktopToggleSource(doc, 'toggle.onion'), onion);
  assert.equal(dispatchDesktopToggle(doc, 'toggle.onion'), true);
  assert.equal(onion.clickCount, 1);
});

test('desktop toggle synchronization copies disabled and pressed state without losing its accessible name', () => {
  const { source } = fixture({ disabled: true, pressed: 'false' });
  source.title = '2コマ以上あると使用できます';
  const proxy = { disabled: false, attrs: { 'aria-label': 'マス目' }, title: '', getAttribute(name) { return this.attrs[name] ?? null; }, setAttribute(name, value) { this.attrs[name] = String(value); } };
  assert.equal(syncDesktopToggleProxy(proxy, source, { label: 'マス目' }), true);
  assert.equal(proxy.disabled, true);
  assert.equal(proxy.attrs['aria-pressed'], 'false');
  assert.equal(proxy.attrs['aria-label'], 'マス目を表示');
  assert.equal(proxy.title, '2コマ以上あると使用できます');
});
