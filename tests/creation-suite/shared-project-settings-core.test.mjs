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
  assert.match(errors.width, /1〜256/);
  assert.match(errors.height, /1〜256/);
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
  assert.deepEqual(bounds, { top: 8, left: 8, width: 304, height: 194, compact: true });
  assert.ok(bounds.top + bounds.height <= 280 - 8);
});

test('desktop settings bounds stay compact while honoring the visible header and navigation', () => {
  const bounds = getCanvasSettingsBounds({ viewportTop: 0, viewportLeft: 0, viewportWidth: 1440, viewportHeight: 900, headerBottom: 64, navTop: 850 });
  assert.deepEqual(bounds, { top: 72, left: 410, width: 620, height: 500, compact: false });
  assert.ok(bounds.top + bounds.height < 850);
});
