import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDrawingToolIcons, createDrawingToolIcon, DRAWING_TOOL_ICON_NAMES } from '../../js/creation/drawing-tool-icons.mjs';

class FakeElement {
  constructor(tag, ownerDocument) { this.tagName = tag; this.ownerDocument = ownerDocument; this.attributes = new Map(); this.children = []; this.dataset = {}; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  append(node) { node.parentElement = this; this.children.push(node); }
  prepend(node) { node.parentElement = this; this.children.unshift(node); }
  replaceChildren(...children) { this.children = children; for (const child of children) child.parentElement = this; }
  querySelector(selector) { return selector === 'svg' ? this.children.find((child) => child.tagName === 'svg') ?? null : null; }
  replaceWith(node) { const index = this.parentElement?.children.indexOf(this) ?? -1; if (index >= 0) { node.parentElement = this.parentElement; this.parentElement.children.splice(index, 1, node); } }
}
const fakeDocument = { createElementNS(_namespace, tag) { return new FakeElement(tag, fakeDocument); } };

test('shared drawing icon factory covers the agreed tool vocabulary', () => {
  assert.deepEqual(DRAWING_TOOL_ICON_NAMES, [
    'pen', 'eraser', 'fill', 'picker', 'line', 'rectangle', 'rectangle-fill',
    'ellipse', 'ellipse-fill', 'spray', 'select', 'mirror', 'mirror-vertical',
    'mirror-diagonal-down', 'mirror-diagonal-up', 'grid', 'settings', 'onion'
  ]);
  for (const name of DRAWING_TOOL_ICON_NAMES) {
    const icon = createDrawingToolIcon(name, fakeDocument);
    assert.equal(icon.tagName, 'svg');
    assert.equal(icon.getAttribute('viewBox'), '0 0 24 24');
    assert.equal(icon.getAttribute('aria-hidden'), 'true');
    assert.equal(icon.getAttribute('width'), '24');
    assert.equal(icon.getAttribute('fill'), 'none');
    assert.equal(icon.getAttribute('stroke'), 'currentColor');
    assert.ok(icon.children.length > 0, name);
  }
});

test('symmetry axis icons share the dashed-axis and paired-triangle construction', () => {
  const variants = [
    ['mirror-vertical', 'rotate(90 12 12)'],
    ['mirror-diagonal-down', 'rotate(-45 12 12)'],
    ['mirror-diagonal-up', 'rotate(45 12 12)'],
  ];
  const base = createDrawingToolIcon('mirror', fakeDocument);
  const basePaths = base.children.map((child) => child.getAttribute('d'));
  assert.equal(base.children.length, 3);
  assert.equal(base.children[0].getAttribute('stroke-dasharray'), '2 2.5');
  for (const [name, rotation] of variants) {
    const icon = createDrawingToolIcon(name, fakeDocument);
    assert.equal(icon.children.length, 3, `${name} has a center axis and two triangle marks`);
    assert.deepEqual(icon.children.map((child) => child.getAttribute('d')), basePaths, `${name} reuses the mirror geometry`);
    assert.deepEqual(icon.children.map((child) => child.getAttribute('transform')), [rotation, rotation, rotation]);
    assert.equal(icon.children[0].getAttribute('stroke-dasharray'), '2 2.5');
  }
});

test('factory rejects unsupported names and missing SVG documents', () => {
  assert.throws(() => createDrawingToolIcon('bucket', fakeDocument), RangeError);
  assert.throws(() => createDrawingToolIcon('pen', null), TypeError);
});

test('applyDrawingToolIcons replaces only known marked controls', () => {
  const pen = new FakeElement('button', fakeDocument); pen.dataset.drawingIcon = 'pen';
  const penLabel = new FakeElement('span', fakeDocument); pen.append(penLabel);
  const erase = new FakeElement('button', fakeDocument); erase.dataset.drawingIcon = 'eraser';
  const oldIcon = new FakeElement('svg', fakeDocument); erase.append(oldIcon);
  const eraseLabel = new FakeElement('span', fakeDocument); erase.append(eraseLabel);
  const unknown = new FakeElement('button', fakeDocument); unknown.dataset.drawingIcon = 'unknown';
  let queried = '';
  const root = { querySelectorAll(selector) { queried = selector; return [pen, erase, unknown]; } };
  assert.equal(applyDrawingToolIcons(root), 2);
  assert.equal(queried, '[data-drawing-icon]');
  assert.equal(pen.children[0].tagName, 'svg');
  assert.equal(pen.children[1], penLabel, 'text children are preserved');
  assert.equal(erase.children[0].tagName, 'svg');
  assert.equal(erase.children[1], eraseLabel, 'text children are preserved when replacing an SVG');
  assert.equal(unknown.children.length, 0);
  assert.equal(applyDrawingToolIcons(null), 0);
});
