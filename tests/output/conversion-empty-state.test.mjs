import test from 'node:test';
import assert from 'node:assert/strict';
import { enhanceEmptyChooserButton } from '../../js/creation/conversion-stage.mjs';

class FixtureElement extends EventTarget {
  constructor(tagName, ownerDocument) {
    super();
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.classNames = new Set();
    this.classList = { add: name => this.classNames.add(name) };
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  querySelector(selector) {
    if (selector !== '[aria-hidden="true"]') return null;
    return this.children.find(child => child.attributes?.get('aria-hidden') === 'true') || null;
  }
  click() { this.dispatchEvent(new Event('click')); }
}

test('empty chooser enhancement is idempotent and preserves its native trigger and sibling actions', () => {
  const doc = { createElement(tagName) { return new FixtureElement(tagName, doc); } };
  const area = new FixtureElement('section', doc);
  const chooser = new FixtureElement('button', doc); chooser.type = 'button';
  const decoration = new FixtureElement('span', doc); decoration.setAttribute('aria-hidden', 'true');
  chooser.append(decoration);
  const demo = new FixtureElement('button', doc), cancel = new FixtureElement('button', doc);
  area.append(chooser, demo, cancel);
  let chooserClicks = 0, demoClicks = 0, cancelClicks = 0;
  chooser.addEventListener('click', () => chooserClicks++);
  demo.addEventListener('click', () => demoClicks++);
  cancel.addEventListener('click', () => cancelClicks++);
  const originalSiblings = [...area.children];

  assert.equal(enhanceEmptyChooserButton(chooser, { title: 'ファイルを追加', hint: '64MBまで' }), chooser);
  const enhancedContent = [...chooser.children];
  assert.equal(enhanceEmptyChooserButton(chooser, { title: '別のタイトル' }), chooser);
  assert.deepEqual(chooser.children, enhancedContent);
  assert.equal(area.children[0], chooser);
  assert.deepEqual(area.children, originalSiblings);
  assert.equal(chooser.children[0], decoration);
  assert.equal(chooser.type, 'button');
  assert.equal(chooser.children.find(child => child.className === 'sc-empty-chooser__title').textContent, 'ファイルを追加');
  assert.equal(chooser.children.find(child => child.className === 'sc-empty-chooser__hint').textContent, '64MBまで');

  chooser.click(); demo.click(); cancel.click();
  assert.deepEqual([chooserClicks, demoClicks, cancelClicks], [1, 1, 1]);
});
