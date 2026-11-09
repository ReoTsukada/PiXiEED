import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = file => readFile(new URL('../../' + file, import.meta.url), 'utf8');

test('imports reuse the bounded gallery with a separate accessible operation tab', async () => {
  const js = await source('js/creation/project-workspace.mjs');
  assert.match(js, /button\('取り込む', 'project-tab-import'/);
  assert.match(js, /\['import', importTab, importSection\]/);
  assert.match(js, /const importGallery = mountProjectGallery\(\{ list: importList, scroller: dialog, readOnly: true/);
  assert.match(js, /actionLabel: '取り込みプレビューを表示'/);
  assert.doesNotMatch(js, /importSection\.open|importSection\.addEventListener\('toggle'/);
  assert.match(js, /importGallery\.dispose\(\)/);
});

test('choosing a PXD only stages its preview, never saves or creates a project', async () => {
  const js = await source('js/creation/project-workspace.mjs');
  const fileHandler = js.split("input.addEventListener('change', () => {")[1].split('  ready =')[0];
  assert.match(fileHandler, /64 \* 1024 \* 1024/);
  assert.match(fileHandler, /await summarizeProject\(project\)/);
  assert.match(fileHandler, /version === importFileEpoch && dialog\.open && !importSection\.hidden/);
  assert.doesNotMatch(fileHandler, /await save\(|importCopy\(|session\.adopt|transact\(/);
  const copy = js.split("button('コピーして開く', 'project-import-copy'")[1].split('const clearImportButton')[0];
  assert.match(copy, /store\.loadImportSource\(item\.projectId, item\.revisionId\)/, 'copy is from the revision the user previewed');
  assert.match(copy, /await importCopy\(source\)/);
});

test('image-free fallback does not override hidden previews', async () => {
  const css = await source('css/project-workspace.css');
  assert.match(css, /\.project-import-preview \[hidden\]/);
  assert.match(css, /\.project-gallery \[hidden\] \{ display: none; \}/);
  const gallery = await source('js/creation/project-gallery.mjs');
  assert.match(gallery, /fallback\.hidden = Boolean\(item\.summary\.thumbnail\)/);
  assert.match(gallery, /actionLabel = '続きを開く'/, 'ordinary gallery keeps continuation behavior');
});
