import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(
  new URL('../pixiedraw/assets/js/modules/local-layer-preferences-utils.js', import.meta.url),
  'utf8'
);
const context = { window: {}, Map, Object, Number, Math };
vm.runInNewContext(source, context, { filename: 'local-layer-preferences-utils.js' });

const state = {
  frames: [{ layers: [
    { id: 'visible-base', visible: true, opacity: 0.75 },
    { id: 'hidden-base', visible: false, opacity: 0.5 },
  ] }],
};
let shared = true;
let visibility = new Map();
let previewOpacity = new Map([['visible-base', 0.25]]);
const utils = context.window.PiXiEEDrawModules.localLayerPreferencesUtils.createLocalLayerPreferencesUtils({
  state,
  getLocalLayerVisibilityById: () => visibility,
  setLocalLayerVisibilityById: value => { visibility = value; },
  getLocalLayerPreviewOpacityById: () => previewOpacity,
  setLocalLayerPreviewOpacityById: value => { previewOpacity = value; },
  normalizeLayerOpacity: value => Math.max(0, Math.min(1, Number(value) || 0)),
  isSharedProjectCollaborativeMode: () => shared,
});

utils.rememberLocalLayerVisibility('visible-base', false);
utils.rememberLocalLayerVisibility('hidden-base', true);
assert.equal(utils.getDisplayedLayerVisibility(state.frames[0].layers[0]), false);
assert.equal(utils.getDisplayedLayerVisibility(state.frames[0].layers[1]), true);
assert.equal(state.frames[0].layers[0].visible, true, 'shared visibility must not mutate canonical state');
assert.equal(state.frames[0].layers[1].visible, false, 'a true override must work over a hidden canonical layer');
assert.deepEqual(
  { ...utils.serializeLocalLayerVisibilityMap() },
  { 'visible-base': false, 'hidden-base': true },
  'both visibility override values must persist'
);

assert.equal(
  utils.getDisplayedLayerPreviewOpacity(state.frames[0].layers[0]),
  0.75,
  'shared rendering must use canonical opacity'
);
utils.rememberLocalLayerPreviewOpacity('visible-base', 0.1);
assert.equal(previewOpacity.get('visible-base'), 0.25, 'shared edits must not update legacy local opacity preferences');
assert.deepEqual({ ...utils.serializeLocalLayerPreviewOpacityMap() }, {});

utils.applyLocalLayerVisibilityToState();
utils.applyLocalLayerPreviewOpacityToState();
assert.equal(state.frames[0].layers[0].visible, true);
assert.equal(state.frames[0].layers[0].opacity, 0.75);

utils.forgetLocalLayerPreferences('visible-base');
assert.equal(visibility.has('visible-base'), false);
assert.equal(previewOpacity.has('visible-base'), false);

visibility = new Map();
state.frames[0].layers[0].visible = false;
state.frames[0].layers[1].visible = true;
const displayedBeforeFailure = state.frames[0].layers.map(layer => utils.getDisplayedLayerVisibility(layer));
const failedCheckpoint = utils.beginCanonicalLayerVisibilityTransaction(state.frames[0].layers);
assert.deepEqual(state.frames[0].layers.map(layer => layer.visible), [true, true]);
assert.deepEqual(
  state.frames[0].layers.map(layer => utils.getDisplayedLayerVisibility(layer)),
  displayedBeforeFailure,
  'canonical checkpoint normalization must not alter the owner display'
);
failedCheckpoint.rollback();
assert.deepEqual(state.frames[0].layers.map(layer => layer.visible), [false, true]);
assert.deepEqual(
  state.frames[0].layers.map(layer => utils.getDisplayedLayerVisibility(layer)),
  displayedBeforeFailure,
  'a failed checkpoint must restore canonical visibility without changing display'
);
const successfulCheckpoint = utils.beginCanonicalLayerVisibilityTransaction(state.frames[0].layers);
successfulCheckpoint.commit();
assert.deepEqual(state.frames[0].layers.map(layer => layer.visible), [true, true]);
assert.deepEqual(state.frames[0].layers.map(layer => utils.getDisplayedLayerVisibility(layer)), displayedBeforeFailure);

shared = false;
utils.rememberLocalLayerPreviewOpacity('hidden-base', 0.2);
assert.equal(utils.getDisplayedLayerPreviewOpacity(state.frames[0].layers[1]), 0.2);
utils.applyLocalLayerPreviewOpacityToState();
assert.equal(state.frames[0].layers[1].opacity, 0.2, 'ordinary local projects must retain preview opacity behavior');
utils.rememberLocalLayerVisibility('hidden-base', true);
utils.applyLocalLayerVisibilityToState();
assert.equal(state.frames[0].layers[1].visible, true, 'ordinary local projects must retain visibility state behavior');

console.log('PiXiEEDraw local layer preference boundaries passed.');
