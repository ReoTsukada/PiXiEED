import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const stage = read('js/creation/conversion-stage.mjs');
const css = read('css/conversion-smart-ui.css');
const unifiedCss = read('css/conversion-unified-input.css');

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
    ['output/work/index.html', ['conversion-entry.mjs'], '20261111-output-offerwall-1'],
    ['output/work/index.html', ['conversion-unified-input.css'], '20261110-output-layout-7'],
    ['js/creation/conversion-entry.mjs', ['output-page.mjs'], '20261111-output-offerwall-1'],
    ['js/creation/conversion-entry.mjs', ['output-receive.mjs'], '20261111-output-offerwall-1'],
    ['js/creation/output-receive.mjs', ['output-page.mjs'], '20261111-output-offerwall-1'],
    ['js/creation/conversion-entry.mjs', ['conversion-smart-ui.mjs'], '20261111-output-offerwall-1'],
    ['js/creation/conversion-smart-ui.mjs', ['conversion-unified-input.mjs'], '20261110-output-layout-7'],
    ['js/creation/conversion-smart-ui.mjs', ['conversion-result-surface.mjs'], '20261110-output-layout-7'],
    ['js/creation/conversion-result-surface.mjs', ['conversion-source-preview.css'], '20261110-output-layout-7'],
    ['js/creation/conversion-unified-input.mjs', ['conversion-unified-input.css'], '20261110-output-layout-7'],
    ['js/creation/conversion-smart-ui.mjs', ['conversion-smart-ui.css'], '20261105-video-size-1'],
    ['js/creation/conversion-smart-ui.mjs', ['conversion-stage.mjs'], '20261105-video-size-1'],
    ['js/creation/conversion-smart-ui.mjs', ['conversion-workspace.mjs'], '20261110-output-layout-7'],
    ['js/creation/conversion-workspace.mjs', ['conversion-stage.mjs'], '20261105-video-size-1'],
  ]) for (const dependency of dependencies) assert.ok(read(file).includes(`${dependency}?rev=${revision}`), `${file}: ${dependency}`);
});

test('output guidance is progressive, warnings stay inline, and add actions retain accessible names', () => {
  const input = read('js/creation/conversion-unified-input.mjs');
  const recovery = read('js/creation/conversion-smart-ui.mjs');
  const result = read('js/creation/conversion-result-surface.mjs');
  assert.match(input, /data-sc-unified-help hidden><summary>使い方/);
  assert.match(input, /data-sc-unified-error role="alert" hidden/);
  assert.match(input, /aria-label="ファイルを追加"/);
  assert.match(input, /writeUnifiedProperty\(guide, 'hidden', !localError && !contextualNotice\)/);
  assert.match(input, /writeUnifiedProperty\(error, 'hidden', !localError\)/);
  assert.match(input, /暗号化ではありません/);
  assert.match(input, /編集後のコマ順は反映しません/);
  assert.match(recovery, /conversionRecoveryStatusLabel\(\{ \.\.\.state, message: stateMessage \}\)/);
  assert.match(recovery, /data-sc-local-recovery-message role="status"/);
  assert.match(result, /現在の設定でまだ出力が生成されていません。/);
  assert.match(result, /更新中です。前回の出力があれば、その内容と形式を表示します。/);
  assert.match(result, /入力すると、ここで仕上がりを確認できます。/);
  assert.match(result, /data-result-refresh aria-label="プレビューを更新"[^>]*>更新/);
  assert.match(unifiedCss, /\.sc-unified-text \.tx-input-meta > \.sc-unified-text-add/);
});

test('output tabs keep engine and source controls decoupled from category', () => {
  const input = read('js/creation/conversion-unified-input.mjs');
  const smartUi = read('js/creation/conversion-smart-ui.mjs');
  const clickHandler = input.slice(input.indexOf("listen(sourceEdit, 'click'"), input.indexOf('const selectOutputTab'));
  const sourceActivation = input.slice(input.indexOf('function activateText()'), input.indexOf('function activateFile()'));
  assert.match(input, /conversionOutputTabVisibility\(tabState\.tab, mode\)/);
  assert.match(input, /showTextEngine: mode === 'input' \|\| mode === 'output'/);
  assert.match(input, /sourceKind === 'text' \? '文字の扱い' : '作るもの'/);
  assert.match(input, /sourceKind === 'text' \? \(sourceEditorOpen \? '編集を閉じる' : '文章を編集'\)/);
  assert.match(input, /writeUnifiedProperty\(textButton, 'hidden', sourceKind === 'text'\)/, 'hide the duplicate source-strip edit control while its edit affordance is active');
  assert.match(sourceActivation, /sourceEditorOpen = true;[\s\S]*source\.focus\(\{ preventScroll: true \}\)/, 'the source-switch edit entry opens and focuses the editor in one click');
  assert.match(smartUi, /choose\(\) \{ if \(mode\(\) === 'input'\) \{ if \(unified\?\.openTextEditor\) unified\.openTextEditor\(\); else \$\('\[data-tx-source\]'\)\?\.focus\(\); \} else choose\(\); \}/, 'the empty-output CTA opens the collapsed text editor before focusing it');
  assert.match(input, /sourceFileKind === 'image' \? '画像を追加・変更'/);
  assert.match(clickHandler, /if \(choose\) choose\(\); else emptyAdd\.click\(\)/);
  assert.doesNotMatch(clickHandler, /data-sc-material-replace/);
  assert.match(input, /文字認識（OCR）ではありません/);
  assert.match(unifiedCss, /data-text-editor-open="false"\] \.sc-unified-text \{ display: none/);
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
