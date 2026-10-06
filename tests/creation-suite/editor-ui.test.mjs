import test from 'node:test';
import assert from 'node:assert/strict';
import { closeEditorPanels, editorViewportInsets } from '../../js/creation/editor-ui.mjs';

test('export closes nested menus and body-mounted PXD sheets without changing artwork', () => {
  const image = new Uint8Array([255, 0, 0, 255]);
  const sheet = { hidden: false };
  function panel(id) {
    const attrs = new Map();
    return { open: true, attrs, querySelector: () => ({
      getAttribute: () => id,
      setAttribute: (key, value) => attrs.set(key, value)
    }) };
  }
  const workspacePanel = panel(null), headerPanel = panel('pxd-panel'), unrelatedPanel = panel(null);
  workspacePanel.closest = unrelatedPanel.closest = () => null;
  headerPanel.closest = () => ({});
  const panels = [workspacePanel, headerPanel];
  const root = { contains: entry => entry === workspacePanel, ownerDocument: {
    querySelectorAll: () => [...panels, unrelatedPanel], getElementById: () => sheet
  } };
  closeEditorPanels(root);
  assert.ok(panels.every((entry) => !entry.open));
  assert.ok(panels.every((entry) => entry.attrs.get('aria-expanded') === 'false'));
  assert.equal(sheet.hidden, true);
  assert.equal(unrelatedPanel.open, true, 'unrelated site panels stay open');
  assert.deepEqual([...image], [255, 0, 0, 255]);
  closeEditorPanels(root); // Repeated save/preview transitions do not reopen anything.
  assert.equal(sheet.hidden, true);
});

test('editor space tracks real header and nav edges, including short screens and safe areas', () => {
  assert.deepEqual(editorViewportInsets({ height: 844, headerBottom: 64, navTop: 763 }), { header: 64, bottom: 93 });
  assert.deepEqual(editorViewportInsets({ height: 320, headerBottom: 64, navTop: 261 }), { header: 64, bottom: 71 });
  assert.deepEqual(editorViewportInsets({ height: 900, headerBottom: 88.2, navTop: 792.5 }), { header: 89, bottom: 120 });
  assert.deepEqual(editorViewportInsets({ height: 800 }), { header: 64, bottom: 96 });
});
