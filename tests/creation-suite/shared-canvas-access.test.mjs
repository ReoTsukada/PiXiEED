import test from 'node:test';
import assert from 'node:assert/strict';
import { createPxdProject } from '../../js/creation/pxd-codec.mjs';
import { putPxdImage, putPxdSharedImage } from '../../js/creation/pxd-project.mjs';
import { getSharedCanvasDetails, requireSharedCanvasAccess } from '../../js/creation/shared-canvas-access.mjs';

function rgbaImage(colorCount, { transparent = false } = {}) {
  const width = colorCount + Number(transparent); const rgba = new Uint8Array(width * 4);
  for (let index = 0; index < colorCount; index += 1) rgba.set([index, (index * 3) & 255, (index * 7) & 255, 255], index * 4);
  if (transparent) rgba.set([0, 0, 0, 0], colorCount * 4);
  return { width, height: 1, rgba };
}

test('puzzle tools count actual non-transparent RGBA colors instead of legacy metadata tuples', async () => {
  const image = rgbaImage(32, { transparent: true });
  const project = await putPxdImage(createPxdProject(), image, 'hidden');
  const meta = project.entries.find((entry) => entry.path === 'images/hidden/meta.json');
  assert.ok(meta, 'schema-1 image metadata exists');
  assert.equal(getSharedCanvasDetails(project, 'hidden_object').colorCount, 32);
  assert.equal(requireSharedCanvasAccess(project, () => assert.fail('puzzle editing should not prompt for a reward'), 'hidden_object'), true);
});

test('shared-color edits use the 32 free / 64 reward policy while puzzle creation remains free', async () => {
  const image = rgbaImage(40, { transparent: true });
  const project = await putPxdSharedImage(createPxdProject(), image);
  assert.equal(getSharedCanvasDetails(project).colorCount, 40);
  let requested = null; const messages = [];
  const deny = requireSharedCanvasAccess(project, (message) => messages.push(message), '', {
    operation: 'color-edit', requestReward: (feature) => { requested = feature; return false; }
  });
  assert.equal(deny, false); assert.equal(requested, 'shared-canvas-colors'); assert.equal(messages.length, 1);
  assert.equal(requireSharedCanvasAccess(project, () => {}, '', {
    operation: 'color-edit', requestReward: () => true
  }), true);
  assert.equal(requireSharedCanvasAccess(project, () => assert.fail('ordinary puzzle edits stay free'), 'spot_difference'), true);
});

test('64 colors are reward-supported, 65 colors remain outside editing support, and metadata-only projects still resolve', async () => {
  const sixtyFour = await putPxdSharedImage(createPxdProject(), rgbaImage(64));
  assert.equal(requireSharedCanvasAccess(sixtyFour, () => {}, '', { operation: 'color-edit', requestReward: () => true }), true);
  let rewardRequested = false;
  const sixtyFive = await putPxdSharedImage(createPxdProject(), rgbaImage(65));
  assert.equal(requireSharedCanvasAccess(sixtyFive, () => {}, '', { operation: 'color-edit', requestReward: () => { rewardRequested = true; return true; } }), false);
  assert.equal(rewardRequested, false, 'reward does not override the supported 64-color ceiling');
  const metadataOnly = { entries: [], manifest: { sharedCanvas: { width: 32, height: 24, colorCount: 32 } } };
  assert.deepEqual(getSharedCanvasDetails(metadataOnly), { width: 32, height: 24, colorCount: undefined });
  assert.equal(requireSharedCanvasAccess(metadataOnly, () => {}, '', { operation: 'color-edit' }), false,
    'a stale transparent-inclusive marker cannot authorize palette edits when exact pixels are unavailable');
});
