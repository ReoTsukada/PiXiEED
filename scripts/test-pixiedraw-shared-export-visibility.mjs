import assert from 'node:assert/strict';
import fs from 'node:fs';

const rendering = fs.readFileSync(
  new URL('../pixiedraw/assets/js/modules/export-rendering.js', import.meta.url),
  'utf8'
);
const app = fs.readFileSync(new URL('../pixiedraw/assets/js/app.js', import.meta.url), 'utf8');
const timeline = fs.readFileSync(
  new URL('../pixiedraw/assets/js/modules/timeline-layers.js', import.meta.url),
  'utf8'
);

assert.match(
  rendering,
  /function compositeDocumentFrames[\s\S]{0,320}useLocalLayerPreviewVisibility: true,[\s\S]{0,140}useLocalLayerPreviewOpacity: false/,
  'animation exports must use personal visibility and canonical opacity'
);

const fingerprintStart = app.indexOf('function createSharedProjectDocumentFingerprint()');
const fingerprintEnd = app.indexOf('\n  function createSharedProjectExactLayerHashForPayload', fingerprintStart);
const exactHashEnd = app.indexOf('\n  function createSharedProjectExactHashForOp', fingerprintEnd);
assert.ok(fingerprintStart >= 0 && fingerprintEnd > fingerprintStart && exactHashEnd > fingerprintEnd);
assert.doesNotMatch(
  app.slice(fingerprintStart, exactHashEnd),
  /mixUint32Hash\(hash, layer\.visible/,
  'personal visibility must not participate in canonical convergence hashes'
);

const visibilitySetterStart = timeline.indexOf('function setLayerVisibilityForRow');
const visibilitySetterEnd = timeline.indexOf('\n  function toggleLayerVisibilityForRow', visibilitySetterStart);
const visibilitySetter = timeline.slice(visibilitySetterStart, visibilitySetterEnd);
assert.match(visibilitySetter, /if \(isCanonicalCollaborationMode\(\)\)/);
const sharedBranchStart = visibilitySetter.indexOf('if (isCanonicalCollaborationMode())');
const canonicalHistoryStart = visibilitySetter.indexOf("beginHistory('setLayerVisibility'");
assert.ok(
  sharedBranchStart >= 0
    && visibilitySetter.indexOf('return;', sharedBranchStart) < canonicalHistoryStart,
  'shared visibility must return before creating canonical history'
);

const checkpointStart = app.indexOf('captureCheckpoint: async (captureContext = {}) =>');
const checkpointEnd = app.indexOf('\n      restoreCheckpoint: async', checkpointStart);
const checkpointCapture = app.slice(checkpointStart, checkpointEnd);
assert.match(checkpointCapture, /beginCanonicalLayerVisibilityTransaction\(checkpointLayers\)/);
assert.ok(
  checkpointCapture.indexOf('beginCanonicalLayerVisibilityTransaction(checkpointLayers)')
    < checkpointCapture.indexOf('makeHistorySnapshot({ clonePixelData: true })'),
  'owner visibility must be canonicalized before checkpoint snapshot capture'
);
assert.match(checkpointCapture, /visibilityTransaction\?\.commit\?\.\(\)[\s\S]{0,80}return serialized\.blob/);
assert.match(checkpointCapture, /catch \(error\)[\s\S]{0,100}visibilityTransaction\?\.rollback\?\.\(\)/);
assert.match(
  rendering,
  /function buildStillExportFrameSet[\s\S]{0,1900}useLocalLayerPreviewVisibility: true,[\s\S]{0,140}useLocalLayerPreviewOpacity: false/,
  'still exports must use the same personal visibility and canonical opacity boundary'
);
assert.match(
  rendering,
  /function compositeFramePixelsForExportPreview[\s\S]{0,1500}getDisplayedLayerVisibility\(layer, true\)/,
  'export previews must reflect personal layer visibility'
);

console.log('PiXiEEDraw shared export visibility boundary passed.');
