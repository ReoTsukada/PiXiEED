import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCanvasSettingsBounds,
  isProjectSettingsPreviewCurrent,
  validateCanvasSettingsFields
} from '../../js/creation/shared-project-settings-core.mjs';

test('canvas field validation keeps dimension and palette errors local', () => {
  assert.deepEqual(validateCanvasSettingsFields({ width: '1', height: '256', palette: ['#000000', '#ffffff80'] }), {
    width: '', height: '', palette: ''
  });
  const errors = validateCanvasSettingsFields({ width: '0', height: '2.5', palette: ['red', '#12ab'] });
  assert.match(errors.width, /1〜1028/);
  assert.match(errors.height, /1〜1028/);
  assert.match(errors.palette, /HEXカラー/);
});

test('palette candidate validation enforces the 128-entry ceiling', () => {
  const colors = Array.from({ length: 128 }, (_, index) => `#${index.toString(16).padStart(6, '0')}`);
  assert.equal(validateCanvasSettingsFields({ width: 16, height: 16, palette: colors }).palette, '');
  assert.match(validateCanvasSettingsFields({ width: 16, height: 16, palette: [...colors, '#ffffff'] }).palette, /1〜128/);
});

test('preview freshness requires the same owner, revision, and complete draft', () => {
  const owner = {};
  const settings = { width: 16, height: 16, palette: ['#000000'] };
  const preview = { owner, revision: 3, settings: { ...settings, palette: [...settings.palette] } };
  assert.equal(isProjectSettingsPreviewCurrent(preview, { owner, revision: 3, settings }), true);
  assert.equal(isProjectSettingsPreviewCurrent(preview, { owner: {}, revision: 3, settings }), false);
  assert.equal(isProjectSettingsPreviewCurrent(preview, { owner, revision: 4, settings }), false);
  assert.equal(isProjectSettingsPreviewCurrent(preview, { owner, revision: 3, settings: { ...settings, width: 17 } }), false);
});

test('visualViewport bounds keep 320px keyboard layouts inside the visible area', () => {
  const bounds = getCanvasSettingsBounds({ viewportTop: 0, viewportLeft: 0, viewportWidth: 320, viewportHeight: 280, headerBottom: 64, navTop: 210 });
  assert.deepEqual(bounds, { top: 8, left: 8, width: 304, height: 264, compact: true });
  assert.ok(bounds.top + bounds.height <= 280 - 8);
});

test('desktop settings bounds provide a spacious modal while honoring the visible header and navigation', () => {
  const bounds = getCanvasSettingsBounds({ viewportTop: 0, viewportLeft: 0, viewportWidth: 1440, viewportHeight: 900, headerBottom: 64, navTop: 850 });
  assert.deepEqual(bounds, { top: 70, left: 290, width: 860, height: 760, compact: false });
  assert.ok(bounds.top + bounds.height < 850);
});

test('compact viewport uses visible offsets and keeps dialog within the visual viewport', () => {
  const bounds = getCanvasSettingsBounds({ viewportTop: 48, viewportLeft: 12, viewportWidth: 390, viewportHeight: 620, headerBottom: 90, navTop: 640 });
  assert.deepEqual(bounds, { top: 56, left: 20, width: 374, height: 604, compact: true });
  assert.ok(bounds.left >= 12 && bounds.top + bounds.height <= 48 + 620 - 8);
});

test('aspect choices fit outside artwork and draft without cropping', async () => {
  const { fitCanvasAspect } = await import('../../js/creation/shared-project-settings-core.mjs');
  const fit = (width, height, aspect, originalWidth = 32, originalHeight = 32) => fitCanvasAspect({ width, height, aspect, originalWidth, originalHeight });
  assert.deepEqual(fit(32,32,'3:2'), {width:48,height:32});
  assert.deepEqual(fit(32,32,'2:3'), {width:32,height:48});
  assert.deepEqual(fit(48,32,'1:1'), {width:48,height:48});
  assert.deepEqual(fit(8,8,'3:2'), {width:48,height:32});
  assert.deepEqual(fit(8,12,'free'), {width:8,height:12});
  assert.deepEqual(fit(256,256,'3:2'), {width:384,height:256});
  assert.equal(fit(1028,1028,'3:2',1028,1028), null);
  assert.deepEqual(fit(256,256,'1:2'), {width:256,height:512});
  assert.deepEqual(fit(33,32,'3:2'), {width:48,height:32});
});

test('independent music dimension policy is explicit and never expands on ratio choice', async () => {
 const { fitCanvasAspect } = await import('../../js/creation/shared-project-settings-core.mjs');
 assert.equal(validateCanvasSettingsFields({width:1028,height:1028,palette:['#000000']}).width,'');
 assert.match(validateCanvasSettingsFields({width:257,height:256,palette:['#000000'],maxDimension:256}).width,/1〜256/);
 assert.equal(fitCanvasAspect({width:256,height:256,originalWidth:256,originalHeight:256,aspect:'3:2',maxDimension:256}),null);
 assert.deepEqual(fitCanvasAspect({width:128,height:128,originalWidth:128,originalHeight:128,aspect:'3:2',maxDimension:256}),{width:192,height:128});
});
