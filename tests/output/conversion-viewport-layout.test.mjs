import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { unifiedOutputLocation } from '../../js/creation/conversion-unified-input.mjs';
import { conversionWorkspaceMinimumHeight } from '../../js/creation/conversion-workspace.mjs';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const unifiedCss = read('css/conversion-unified-input.css');
const smartCss = read('css/conversion-smart-ui.css');
const input = read('js/creation/conversion-unified-input.mjs');
const smartUi = read('js/creation/conversion-smart-ui.mjs');
const workspace = read('js/creation/conversion-workspace.mjs');

test('image and text outputs share responsive settings/preview rows with a safe scroll fallback', () => {
  for (const tab of ['image', 'text']) {
    assert.match(unifiedCss, /data-unified-result="true"/);
    assert.match(unifiedCss, /grid-template-rows: auto minmax\(200px,\.45fr\) minmax\(240px,1fr\) auto/);
    assert.match(unifiedCss, /\.sc-result-surface \{[^}]*overflow: visible/);
    assert.match(unifiedCss, /\.sc-result-body \{[^}]*min-height: 120px; overflow: auto; overscroll-behavior: contain; overflow-anchor: none/);
    assert.match(unifiedCss, /\.sc-unified-composer \.sc-result-aux\[open\] \{ overflow: visible/);
  }
  assert.match(unifiedCss, /grid-template-columns: minmax\(280px,360px\) minmax\(0,1fr\) !important/);
  assert.match(unifiedCss, /\.sc-unified-composer \{\s*grid-row: 2; grid-column: 1; width: 100%; height: 100%/);
  assert.match(unifiedCss, /\.sc-result-surface \{\s*grid-row: 2; grid-column: 2/);
  assert.match(unifiedCss, /\.tx-footer \{ grid-row: 3; grid-column: 1 \/ -1/);
  assert.match(unifiedCss, /\.sc-unified-composer \{\s*grid-row: 2; grid-column: 1; height: 100%; min-height: 0; max-height: none/);
  assert.doesNotMatch(unifiedCss, /\.sc-preview-toolbar \{ position: sticky/);
  assert.match(unifiedCss, /height: var\(--sc-space,calc\(100dvh - 180px\)\)/);
  assert.match(unifiedCss, /body\.has-smart-conversion:not\(\.sc-scroll-fallback\):has\(/);
  assert.doesNotMatch(unifiedCss, /\[data-output-tab="text"\][^}]*height: auto/);
  assert.match(workspace, /const toolbarHeight = main\.querySelector\('\.sc-toolbar'\)\?\.getBoundingClientRect\(\)\.height \|\| 0/);
  assert.match(workspace, /const minWorkspaceHeight = conversionWorkspaceMinimumHeight\(\{ unified: main\.dataset\.unifiedResult === 'true', toolbarHeight, footerHeight, footerMargin, viewportWidth: win\.innerWidth \}\)/);
  assert.match(workspace, /classList\.toggle\('sc-scroll-fallback', available < minWorkspaceHeight\)/);
  assert.match(unifiedCss, /width: min\(1180px,calc\(100% - 32px\)\) !important; max-width: 1180px !important/);
  assert.match(unifiedCss, /@media \(min-width: 960px\)[\s\S]*?\.sc-settings-panel \{[^}]*position: fixed;[^}]*grid-column: auto; grid-row: auto/);
  assert.match(unifiedCss, /\[data-smart-conversion\]\[data-unified-input="true"\]\[data-unified-result="true"\] :is\(\[data-sc-settings-open\],\[data-sc-settings-close\]\) \{ display: inline-flex; \}/);
  assert.match(unifiedCss, /\[data-smart-conversion\]\[data-unified-input="true"\]\[data-unified-result="true"\] \.sc-panel-footer \{ display: block; \}/);
  assert.match(smartCss, /env\(safe-area-inset-bottom\)/);
  assert.match(smartCss, /body\.has-smart-conversion[^\n]*--sc-bottom-reserve/);
});

test('all output engines share the settings pane and preserve node ownership when the result is removed', () => {
  for (const mode of ['media', 'input', 'output']) {
    for (const loaded of [false, true]) assert.equal(unifiedOutputLocation({ mode, loaded, modal: false }), 'settings');
  }
  assert.equal(unifiedOutputLocation({ mode: 'media', loaded: true, modal: true }), 'settings');
  const resultSurface = read('js/creation/conversion-result-surface.mjs');
  assert.doesNotMatch(resultSurface, /data-sc-result-control-band|unifiedControls|controlsPosition/);
  assert.match(resultSurface, /sourceAndSettings = composer\.querySelector\('\.sc-unified-head'\)[\s\S]*settingsButton && sourceAndSettings\) sourceAndSettings\.append\(settingsButton\)/);
  assert.match(resultSurface, /positions = \[card, legacy, summary, settingsButton\]/);
  assert.match(resultSurface, /if \(summary\) auxiliaryContent\.append\(summary\);\s*auxiliaryContent\.append\(card, legacy\);[\s\S]*composer\.append\(auxiliary\)/);
  assert.match(resultSurface, /data-result-refresh[^]*?data-result-cancel/);
  assert.match(resultSurface, /identityChanged[\s\S]*body\.scrollTop = 0/);
  assert.match(resultSurface, /previousLoaded === false && loaded\) auxiliary\.open = false/);
  assert.match(resultSurface, /positions\.slice\(\)\.reverse\(\)[\s\S]*auxiliary\.remove\(\);host\.remove\(\)/);
  assert.doesNotMatch(resultSurface, /oldNativePreviewState|data-tx-text-result[^;]*hidden/);
  assert.match(input, /listen\(main, 'click',[\s\S]*?settingsButton = event\.target\.closest\('\[data-sc-settings-open\]'\)/);
  assert.match(input, /const controlsTarget = location === 'settings' \? composer/);
  assert.match(unifiedCss, /\.sc-unified-controls > \.sc-unified-text-size:not\(\[hidden\]\) \{\s*grid-column: 2;/);
  assert.match(unifiedCss, /data-state="empty"\] \.sc-preview-toolbar > header > strong/);
  assert.doesNotMatch(unifiedCss, /data-state="empty"\] > :is\(\.sc-preview-toolbar,/);
  assert.match(input, /const nativeSizeControl = main\.querySelector\('\.sc-preview-summary > \.sc-size-control'\)/);
  assert.match(input, /controls\.append\(nativeSizeControl\)/);
  assert.match(input, /textFilePick, nativeSizeControl\]/);
  assert.match(input, /restoreUnifiedNodePositions\(originalPositions\);[\s\S]*nativeSizeControl\.hidden = oldNativeSizeControlHidden/);
  assert.match(input, /settings\.append\(inputCard\); composer\.append\(settings\)/);
  assert.match(unifiedCss, /\.sc-unified-controls\[data-source="file"\]:has\(> \.sc-size-control:not\(\[hidden\]\)\) > \[data-sc-unified-format-row\] \{ grid-column: 1; \}/);
  assert.match(unifiedCss, /\.sc-unified-controls\[data-source="file"\]:has\(> \.sc-unified-text-size:not\(\[hidden\]\)\) > \[data-sc-unified-format-row\] \{ grid-column: 1; \}/);
  assert.match(unifiedCss, /\.sc-unified-controls > \.sc-size-control:not\(\[hidden\]\) \{[^}]*grid-column: 2/);
});

test('text editing scrolls inside its composer while output controls and a flexible preview remain reachable', () => {
  assert.match(unifiedCss, /\.sc-unified-composer \{\s*grid-row: 2; grid-column: 1; height: 100%; min-height: 0; max-height: none; margin-top: 0;\s*overflow: auto/);
  assert.match(unifiedCss, /\.sc-unified-head \{ display: grid; grid-template-columns: repeat\(2,minmax\(0,1fr\)\); align-items: stretch/);
  assert.match(unifiedCss, /\.sc-unified-head > \.sc-unified-sources \{ grid-column: 1 \/ -1; width: 100%; min-width: 0; flex-wrap: nowrap; overflow-x: auto/);
  const composerMarkup = input.match(/composer\.innerHTML = `([\s\S]*?)`;/)?.[1] || '';
  assert.ok(composerMarkup.indexOf('class="sc-unified-controls"') < composerMarkup.indexOf('class="sc-unified-head"'));
  assert.ok(composerMarkup.indexOf('class="sc-unified-head"') < composerMarkup.indexOf('class="sc-unified-text"'));
  assert.match(input, /controls\.before\(controlsHome\)/, 'the return marker precedes controls in the composer DOM');
  assert.match(input, /composer\.insertBefore\(controls, controlsHome\.nextSibling\)/, 'controls return before the source row after a modal/panel visit');
  assert.match(input, /function revealTextEditor\(\) \{[\s\S]*sourceRect\.bottom > composerRect\.bottom[\s\S]*composer\.scrollTop \+= sourceRect\.bottom - composerRect\.bottom/);
  assert.match(input, /source\.focus\(\{ preventScroll: true \}\); revealTextEditor\(\)/, 'opening the editor reveals its focused textarea through composer-local scrolling');
  assert.match(unifiedCss, /\.sc-result-content:has\(> \[data-result-text\]:not\(\[hidden\]\)\) \{\s*display: flex/);
  assert.match(unifiedCss, /\.sc-result-content > \[data-result-text\] \{[^}]*min-height: 120px; max-height: none; resize: none; overflow: auto/);
  assert.match(unifiedCss, /\.sc-result-content \{[^}]*flex: 1 1 160px; min-height: 160px; min-width: 0; max-height: none; overflow: auto/);
  assert.match(unifiedCss, /\.sc-result-content > img \{[^}]*width: 100%; height: 100%;[^}]*object-fit: contain/);
  assert.match(unifiedCss, /\.sc-result-content canvas \{[^}]*width:100%;height:100%;[^}]*object-fit:contain/);
  assert.match(unifiedCss, /\.sc-result-content:has\(> canvas:not\(\[hidden\]\)\) \{ grid-template-rows: minmax\(0,1fr\) auto; \}/);
  assert.doesNotMatch(unifiedCss, /sc-result-content \{[^}]*max-height: min\(60dvh,600px\)/);
  assert.doesNotMatch(unifiedCss, /sc-result-content \{[^}]*max-height: 220px/);
  assert.match(unifiedCss, /\.sc-result-content:has\(> \[data-result-text\]:not\(\[hidden\]\)\) \{[^}]*min-height: 190px/);
  const sourceCss = read('css/conversion-source-preview.css');
  assert.match(sourceCss, /\[data-result-text-label\] \{[^}]*margin: 0; padding: 2px 4px/);
  assert.match(sourceCss, /\.sc-result-content \[data-result-text\] \{[^}]*min-height: 140px; max-height: none/);
  assert.match(sourceCss, /\[data-unified-result="true"\] \.sc-result-content p\[data-result-text-note\] \{[^}]*margin: 0; padding: 0/);

});

test('long save errors are keyboard reachable and scrollable instead of line-clamped', () => {
  assert.match(smartUi, /class="sc-export-message" role="status" aria-live="polite" tabindex="0" aria-label="出力の状態" aria-description="長い状態メッセージはここでスクロールできます。"/);
  assert.match(unifiedCss, /\.sc-save-bar \.sc-export-message \{ display: block; max-height: 48px; overflow: auto;[^}]*-webkit-line-clamp: unset/);
  assert.match(unifiedCss, /\.sc-save-bar \.sc-export-message:focus-visible \{ outline: 3px/);
});

// Exercise the actual handler, including reopening after a user scrolls to details.
test('the source edit toggle reveals the input and returns to primary controls on close', () => {
  const start = input.indexOf("  listen(sourceEdit, 'click'");
  const end = input.indexOf('  const selectOutputTab', start);
  assert.ok(start >= 0 && end > start);
  let click, focusCount = 0, revealCount = 0;
  const composer = { scrollTop: 120 };
  const context = {
    sourceEdit: {}, listen: (_node, _event, fn) => { click = fn; },
    isBusy: () => false, api: { snapshot: () => ({ composing: false }) },
    sourceKind: 'text', sourceEditorOpen: false, update() {}, schedule() {},
    source: { focus(options) { assert.equal(options.preventScroll, true); focusCount++; } },
    revealTextEditor() { revealCount++; }, composer,
  };
  runInNewContext(input.slice(start, end), context);
  click();
  assert.equal(context.sourceEditorOpen, true);
  assert.equal(focusCount, 1);
  assert.equal(revealCount, 1);
  click();
  assert.equal(context.sourceEditorOpen, false);
  assert.equal(composer.scrollTop, 0);
});

test('mode, output tab, and source changes reset the composer to its primary controls', () => {
  assert.match(input, /if \(priorMode !== null && \(mode !== priorMode \|\| visibility\.tab !== priorOutputTab \|\| sourceKind !== priorSource\)\) composer\.scrollTop = 0/);
  assert.match(input, /priorMode = mode; priorOutputTab = visibility\.tab; priorSource = sourceKind/);
});

test('tiny-view fallback includes the visible guide footer and its margins, without changing legacy geometry', () => {
  assert.equal(conversionWorkspaceMinimumHeight({ unified: false, toolbarHeight: 112, footerHeight: 14, footerMargin: 44 }), 180);
  assert.equal(conversionWorkspaceMinimumHeight({ unified: true, toolbarHeight: 112, footerHeight: 14, footerMargin: 44, viewportWidth: 390 }), 642);
  assert.equal(conversionWorkspaceMinimumHeight({ unified: true, toolbarHeight: 112, footerHeight: 14, footerMargin: 44, viewportWidth: 1280 }), 514);
  assert.equal(conversionWorkspaceMinimumHeight({ unified: true, toolbarHeight: 112, footerHeight: 0, footerMargin: 44, viewportWidth: 390 }), 584);
  assert.equal(conversionWorkspaceMinimumHeight({ unified: true, toolbarHeight: 160, footerHeight: 28, footerMargin: 44, viewportWidth: 390 }), 704);
  assert.equal(conversionWorkspaceMinimumHeight({ unified: true, toolbarHeight: NaN, footerHeight: -1 }), 472);
});
