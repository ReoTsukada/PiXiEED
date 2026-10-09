import test from 'node:test';
import assert from 'node:assert/strict';
import { mountDrawSpriteScalePanel, DRAW_SPRITE_SCALE_PRESETS } from '../../js/creation/draw-sprite-scale-panel.mjs';

class Element {
  constructor(dataset = {}) { this.dataset = dataset; this.listeners = new Map(); this.attributes = new Map(); this.value = ''; this.textContent = ''; this.disabled = false; this.hidden = false; this.validity = { valid: true }; }
  addEventListener(type, handler) { const list = this.listeners.get(type) || []; list.push(handler); this.listeners.set(type, list); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  fire(type) { const event = { type, target: this, prevented: false, preventDefault() { this.prevented = true; } }; for (const handler of this.listeners.get(type) || []) handler(event); return event; }
}

function fixture({ animation = { width: 16, height: 12 }, blockedReason = '' } = {}) {
  const nodes = new Map();
  for (const selector of ['#draw-sprite-scale-form', '#draw-sprite-scale-percent', '#draw-sprite-scale-preview', '#draw-sprite-scale-reason', '#draw-sprite-scale-apply', '#draw-sprite-scale-note']) nodes.set(selector, new Element());
  nodes.get('#draw-sprite-scale-percent').value = '100';
  const buttons = DRAW_SPRITE_SCALE_PRESETS.map(value => new Element({ drawSpriteScale: String(value) }));
  const root = { querySelector: selector => nodes.get(selector), querySelectorAll: () => buttons };
  const scope = { disposed: false, listen: (node, type, handler) => node.addEventListener(type, handler) };
  const state = { animation, blockedReason };
  let plans = 0; const applied = []; let layouts = 0;
  const plan = (current, percent) => {
    plans += 1;
    const width = Math.max(1, Math.round(current.width * percent / 100));
    const height = Math.max(1, Math.round(current.height * percent / 100));
    const allowed = width <= 256 && height <= 256;
    return { width, height, changed: width !== current.width || height !== current.height, allowed, reason: allowed ? '' : '上限を超えています。' };
  };
  const panel = mountDrawSpriteScalePanel({ scope, root, getState: () => state, plan, onApply: (...args) => applied.push(args), onLayout: () => { layouts += 1; } });
  return { nodes, buttons, scope, state, panel, applied, get plans() { return plans; }, get layouts() { return layouts; } };
}

test('preset selection previews without applying; submit applies a permitted changed scale', () => {
  const ui = fixture(); const input = ui.nodes.get('#draw-sprite-scale-percent'), preview = ui.nodes.get('#draw-sprite-scale-preview'), apply = ui.nodes.get('#draw-sprite-scale-apply');
  assert.equal(DRAW_SPRITE_SCALE_PRESETS.join(','), '25,50,100,200,300,1000');
  assert.match(preview.textContent, /16 × 12 px → 16 × 12 px/); assert.equal(apply.disabled, true);
  const preset = ui.buttons.find(button => button.dataset.drawSpriteScale === '200');
  preset.fire('click');
  assert.equal(input.value, '200'); assert.match(preview.textContent, /32 × 24 px/); assert.equal(apply.disabled, false); assert.deepEqual(ui.applied, []);
  const submit = ui.nodes.get('#draw-sprite-scale-form').fire('submit');
  assert.equal(submit.prevented, true); assert.equal(ui.applied.length, 1); assert.equal(ui.applied[0][0], 200);
});

test('100%, rounded no-change, invalid input, and blocked state disable apply with a visible reason', () => {
  const ui = fixture(); const input = ui.nodes.get('#draw-sprite-scale-percent'), reason = ui.nodes.get('#draw-sprite-scale-reason'), apply = ui.nodes.get('#draw-sprite-scale-apply');
  assert.equal(apply.disabled, true); assert.match(reason.textContent, /100%/);
  input.value = '101'; ui.panel.sync(); assert.equal(apply.disabled, true); assert.match(reason.textContent, /丸め後/);
  input.value = '0'; input.validity.valid = true; ui.panel.sync(); assert.equal(input.getAttribute('aria-invalid'), 'true'); assert.equal(apply.disabled, true); assert.match(reason.textContent, /0より大きい/);
  input.value = '200'; ui.state.blockedReason = '再生中は変更できません。'; ui.panel.sync();
  assert.equal(apply.disabled, true); assert.equal(reason.textContent, '再生中は変更できません。');
});

test('dimension plan is memoized by animation identity, block reason, and percent', () => {
  const ui = fixture(); const input = ui.nodes.get('#draw-sprite-scale-percent');
  const initialPlans = ui.plans; ui.panel.sync(); ui.panel.sync(); assert.equal(ui.plans, initialPlans);
  ui.state.blockedReason = '保留中'; ui.panel.sync(); assert.equal(ui.plans, initialPlans + 1);
  ui.state.animation = { width: 16, height: 12 }; ui.panel.sync(); assert.equal(ui.plans, initialPlans + 2);
  input.value = '200'; ui.panel.sync(); assert.equal(ui.plans, initialPlans + 3);
});

test('resize-loss note is shown for shrink and fractional scales', () => {
  const ui = fixture(); const input = ui.nodes.get('#draw-sprite-scale-percent'), note = ui.nodes.get('#draw-sprite-scale-note');
  input.value = '50'; ui.panel.sync(); assert.equal(note.hidden, false);
  input.value = '150'; ui.panel.sync(); assert.equal(note.hidden, false, '150% means a non-integer 1.5× sampling ratio');
  input.value = '200'; ui.panel.sync(); assert.equal(note.hidden, true);
});

test('an actual apply failure stays visible for its animation and scale, then a changed scale can proceed', () => {
  const ui = fixture(), input = ui.nodes.get('#draw-sprite-scale-percent'), reason = ui.nodes.get('#draw-sprite-scale-reason'), apply = ui.nodes.get('#draw-sprite-scale-apply');
  input.value = '200'; ui.panel.sync();
  ui.panel.reportFailure('メモリ上限を超えたため適用できませんでした。', ui.state.animation, 200);
  assert.equal(reason.textContent, 'メモリ上限を超えたため適用できませんでした。'); assert.equal(apply.disabled, true);
  input.value = '300'; ui.panel.sync();
  assert.equal(apply.disabled, false); assert.doesNotMatch(reason.textContent, /メモリ上限/);
  ui.panel.reportFailure('この倍率は失敗しました。', ui.state.animation, 300);
  ui.state.animation = { width: 20, height: 20 }; ui.panel.sync();
  assert.equal(apply.disabled, false); assert.doesNotMatch(reason.textContent, /この倍率は失敗しました/);
});

test('read-only original dimensions are shown instead of the unrelated working animation', () => {
  const ui = fixture(), input = ui.nodes.get('#draw-sprite-scale-percent');
  input.value = '200'; ui.state.readOnlyDimensions = { width: 512, height: 300 }; ui.state.blockedReason = '原本を表示しています。'; ui.panel.sync();
  assert.equal(ui.nodes.get('#draw-sprite-scale-preview').textContent, '現在 512 × 300 px → —');
  assert.equal(ui.nodes.get('#draw-sprite-scale-apply').disabled, true);
});
