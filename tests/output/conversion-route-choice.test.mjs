import test from 'node:test';
import assert from 'node:assert/strict';
import { mountConversionRouteChoices } from '../../js/creation/conversion-route-choice.mjs';

class FixtureElement extends EventTarget {
  constructor(tagName, ownerDocument) {
    super();
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.classList = { add() {} };
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.value = '';
    this.textContent = '';
  }
  append(...nodes) {
    for (const node of nodes) { node.parentNode = this; this.children.push(node); }
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }
}

const FixtureEvent = Event;

function fixture() {
  const doc = { createElement(tagName) { return new FixtureElement(tagName, doc); } };
  const win = { Event: FixtureEvent };
  const container = new FixtureElement('section', doc);
  const native = new FixtureElement('div', doc);
  const makeSelect = (values, selected) => {
    const select = new FixtureElement('select', doc);
    select.options = values.map(([value, textContent, disabled = false]) => ({ value, textContent, disabled }));
    select.value = selected;
    native.append(select);
    return select;
  };
  const source = makeSelect([['file', 'ファイル'], ['text', '文字']], 'file');
  const target = makeSelect([['file', 'ファイル'], ['text', '文字']], 'text');
  const groups = [
    { select: source, label: '元のデータ', name: 'sc-source-choice' },
    { select: target, label: '作るもの', name: 'sc-target-choice' },
  ];
  return { doc, win, container, native, source, target, groups };
}

const controlsFor = fieldset => fieldset.children[1].children.map(label => label.children[0]);

test('route radios preserve native selects and forward one checked change to the original select', () => {
  const f = fixture();
  let changes = 0, bubbles = false;
  f.source.addEventListener('change', event => { changes++; bubbles = event.bubbles; });
  const originalOptions = [...f.source.options];
  const mounted = mountConversionRouteChoices(f);
  assert.ok(mounted);
  assert.equal(f.native.hidden, true);
  assert.equal(f.source.options[0], originalOptions[0]);
  const groups = f.container.children[0].children;
  assert.equal(f.container.children[0].dataset.scRouteChoice, '');
  assert.deepEqual(groups.map(group => group.dataset.scRouteName), ['sc-source-choice', 'sc-target-choice']);
  const sourceRadios = controlsFor(groups[0]);
  const targetRadios = controlsFor(groups[1]);
  assert.deepEqual(sourceRadios.map(radio => [radio.value, radio.checked]), [['file', true], ['text', false]]);
  assert.deepEqual(targetRadios.map(radio => [radio.value, radio.checked]), [['file', false], ['text', true]]);

  sourceRadios[1].checked = true;
  sourceRadios[1].dispatchEvent(new FixtureEvent('change'));
  assert.equal(f.source.value, 'text');
  assert.equal(changes, 1);
  assert.equal(bubbles, true);
});

test('update mirrors select values, labels and disabled options without rebuilding or firing native events', () => {
  const f = fixture();
  let changes = 0;
  f.source.addEventListener('change', () => changes++);
  const mounted = mountConversionRouteChoices(f);
  const fieldsets = f.container.children[0].children;
  const radios = controlsFor(fieldsets[0]);
  const labels = fieldsets[0].children[1].children.map(label => label.children[1]);
  f.source.value = 'text';
  f.source.options[1].textContent = '文章';
  f.source.options[0].disabled = true;
  f.source.disabled = false;
  mounted.update();
  assert.equal(f.container.children[0].children[0].children[1].children[0].children[0], radios[0]);
  assert.deepEqual(radios.map(radio => [radio.checked, radio.disabled]), [[false, true], [true, false]]);
  assert.equal(labels[1].textContent, '文章');
  assert.equal(changes, 0);

  f.source.disabled = true;
  mounted.update();
  assert.ok(radios.every(radio => radio.disabled));
  assert.equal(changes, 0);
});

test('unchecked, disabled and stale radio changes cannot route a native select', () => {
  const f = fixture();
  let changes = 0;
  f.source.addEventListener('change', () => changes++);
  const mounted = mountConversionRouteChoices(f);
  const radios = controlsFor(f.container.children[0].children[0]);
  radios[1].checked = false;
  radios[1].dispatchEvent(new FixtureEvent('change'));
  assert.equal(changes, 0);

  f.source.options[1].disabled = true;
  mounted.update();
  radios[1].disabled = false;
  radios[1].checked = true;
  radios[1].dispatchEvent(new FixtureEvent('change'));
  assert.equal(changes, 0);

  f.source.options = [f.source.options[0]];
  mounted.update();
  radios[1].disabled = false;
  radios[1].dispatchEvent(new FixtureEvent('change'));
  assert.equal(changes, 0);
});

test('destroy removes only enhanced groups and restores original native controls and listeners', () => {
  const f = fixture();
  let changes = 0;
  f.source.addEventListener('change', () => changes++);
  const sourceNode = f.source, optionNode = f.source.options[0];
  const mounted = mountConversionRouteChoices(f);
  const enhanced = f.container.children[0];
  mounted.destroy();
  mounted.destroy();
  assert.equal(f.container.children.length, 0);
  assert.equal(f.native.hidden, false);
  assert.equal(f.source, sourceNode);
  assert.equal(f.source.options[0], optionNode);
  f.source.dispatchEvent(new FixtureEvent('change'));
  assert.equal(changes, 1);
  const detachedRadio = controlsFor(enhanced.children[0])[0];
  detachedRadio.checked = true;
  detachedRadio.dispatchEvent(new FixtureEvent('change'));
  assert.equal(changes, 1);
});

test('unsupported controls leave the native route visible as fallback', () => {
  const f = fixture();
  const invalid = { ...f.groups[1], select: {} };
  const mounted = mountConversionRouteChoices({ ...f, groups: [f.groups[0], invalid] });
  assert.equal(mounted, null);
  assert.equal(f.native.hidden, false);
  assert.equal(f.container.children.length, 0);
  assert.equal(f.source.value, 'file');
});


test('repeated disabled-state synchronization settles without observer-triggering property writes', () => {
  const f=fixture(),mounted=mountConversionRouteChoices(f),radios=controlsFor(f.container.children[0].children[0]);
  f.source.disabled=true;mounted.update();
  let writes=0;
  for(const radio of radios){let value=radio.disabled;Object.defineProperty(radio,'disabled',{get(){return value;},set(next){writes++;value=next;}});}
  for(let frame=0;frame<8;frame++)mounted.update();
  assert.equal(writes,0,'stable disabled state must not keep scheduling UI observer updates');
  f.source.disabled=false;mounted.update();assert.equal(writes,2);assert.ok(radios.every(radio=>!radio.disabled));
});
