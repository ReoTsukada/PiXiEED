import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const stage = read('js/creation/conversion-stage.mjs');
const css = read('css/conversion-smart-ui.css');

test('loaded materials have one persistent add action at the scrolling strip tail', () => {
  assert.equal((stage.match(/addButton\.dataset\.scMaterialAdd = ''/g) || []).length, 1);
  assert.match(stage, /addSlot\.setAttribute\('role', 'listitem'\)/);
  assert.match(stage, /renderMaterialList\(list, cards, addSlot\)/);
  assert.match(stage, /addButton\.addEventListener\('click'/);
  assert.match(stage, /disabled\(addButton, isMaterialAddDisabled/);
  assert.match(stage, /list\.setAttribute\('role', 'list'\)/);
  assert.match(stage, /select\.setAttribute\('aria-pressed', String\(selected\)\)/);
  assert.match(stage, /remove\.setAttribute\('aria-label'/);
});

test('mobile toolbar allows an intrinsic-width action group and keeps touch target height', () => {
  const mobile = css.slice(css.indexOf('@media (max-width: 600px)'));
  assert.match(mobile, /\.sc-input-actions \{ flex: none; flex-wrap: nowrap; width: auto; \}/);
  assert.doesNotMatch(css, /\[data-workspace-media="true"\] \.sc-input-actions \{[^}]*width: 100%/);
  assert.match(mobile, /\.sc-input-actions button \{ min-height: 44px;/);
  assert.match(css, /\.sc-back \{[^}]*min-height: 44px;/);
  assert.match(css, /\.sc-material-add-slot button \{[^}]*min-height: 44px;/);
  assert.match(css, /\.sc-toolbar \{[^}]*flex-wrap: wrap/);
  assert.match(css, /\.sc-heading \{ min-width: 0; \}/);
  assert.match(css, /\.sc-material-heading > div:first-child \{ display: flex;[^}]*flex-wrap: wrap;/);
});

test('the output entry refreshes the complete changed module and CSS chain', () => {
  for (const [file, dependencies, revision] of [
    ['output/work/index.html', ['conversion-entry.mjs'], '20261105-video-size-1'],
    ['js/creation/conversion-entry.mjs', ['conversion-smart-ui.mjs'], '20261105-video-size-1'],
    ['js/creation/conversion-smart-ui.mjs', ['conversion-smart-ui.css'], '20261105-video-size-1'],
    ['js/creation/conversion-smart-ui.mjs', ['conversion-stage.mjs'], '20261105-video-size-1'],
    ['js/creation/conversion-smart-ui.mjs', ['conversion-workspace.mjs'], '20261105-video-size-1'],
    ['js/creation/conversion-workspace.mjs', ['conversion-stage.mjs'], '20261105-video-size-1'],
  ]) for (const dependency of dependencies) assert.ok(read(file).includes(`${dependency}?rev=${revision}`), `${file}: ${dependency}`);
});

test('narrow cards give replacement the remaining width without shrinking touch height', () => {
  assert.match(css, /\.sc-material-card-actions \[data-remove-material\] \{ flex: 0 0 44px; \}/);
  assert.match(css, /\.sc-material-card-actions \[data-sc-material-replace\] \{ flex: 1 1 calc\(100% - 50px\); padding-inline: 6px; font-size: 13px; \}/);
  assert.match(css, /\.sc-material-card-actions button \{[^}]*min-height: 44px;/);
  assert.match(stage, /\? '全素材を差し替え' : '差し替え'/);
  assert.match(stage, /\? '入力素材すべてを差し替え' : `\$\{asset.name\}を差し替え`/);
  assert.match(stage, /replace.title = asset.replaceReason \|\| replace.getAttribute\('aria-label'\)/);
});

test('long counts can wrap, and shortened filenames retain a full accessible name and tooltip', () => {
  assert.match(css, /\.sc-material-heading > div:first-child \{ display: flex; flex: 1 1 0;/);
  assert.match(css, /\[data-sc-material-count\] \{ min-width: 0;[^}]*overflow-wrap: anywhere;/);
  assert.match(stage, /select.title = name.textContent/);
  assert.match(stage, /select.setAttribute\('aria-label', `\$\{asset.name\},/);
  assert.match(stage, /state.frameCount > 1 \? ` · \$\{state.frameCount\}コマ`/);
});

test('compact actions retain keyboard selection, reorder, deletion, Undo, and disabled-state guards', () => {
  for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Delete']) assert.ok(stage.includes(`'${key}'`));
  assert.match(stage, /materialController\.undo\(\)/);
  assert.match(stage, /restoreMaterialFocus\(ticket,/);
  assert.match(stage, /next.working \|\| asset\?\.canReplace === false/);
  assert.match(stage, /next.working \|\| asset\?\.canRemove === false/);
  assert.match(stage, /materialController\.move\(id, Number\(button.dataset.moveMaterial\)\)/);
});
