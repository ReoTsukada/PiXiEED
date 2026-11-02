import test from 'node:test';
import assert from 'node:assert/strict';
import { formatControlDestination, conversionSaveMessage, workspaceAvailableHeight, conversionDockBottom, batchSaveActionLabel } from '../../js/creation/conversion-clarity.mjs';

test('format control remains inside a modal and returns to loaded preview afterward', () => {
  assert.equal(formatControlDestination({ media: true, loaded: true, modal: true }), 'panel');
  assert.equal(formatControlDestination({ media: true, loaded: true, modal: false }), 'preview');
  assert.equal(formatControlDestination({ media: true, loaded: false, modal: false }), 'panel');
  assert.equal(formatControlDestination({ media: false, loaded: true, modal: false }), 'panel');
});
test('save message preserves errors, cancellation and actual progress', () => {
  for (const nativeStatus of ['容量を超えています。素材を減らしてください。', '変換を中止しました。', '読み込みに失敗しました。'])
    assert.equal(conversionSaveMessage({ loaded: true, nativeStatus }), nativeStatus);
  assert.equal(conversionSaveMessage({ working: true, nativeStatus: '12 / 30 コマ' }), '12 / 30 コマ');
  assert.equal(conversionSaveMessage({ loaded: true, nativeStatus: '形式と設定を確認して、変換できます。' }), '選んだ形式・サイズで保存します。');
  assert.equal(conversionSaveMessage({ saved: true }), 'ダウンロードを開始しました。');
});
test('workspace reserves enlarged save controls and keeps tiny screens scrollable', () => {
  assert.equal(workspaceAvailableHeight({ viewportHeight: 844, headerBottom: 56, dockTop: 690, navTop: 778 }), 626);
  assert.equal(workspaceAvailableHeight({ viewportHeight: 844, headerBottom: 56, dockTop: 610 }), 546);
  assert.equal(workspaceAvailableHeight({ viewportHeight: 300, headerBottom: 100, dockTop: 120 }), 180);
  assert.equal(workspaceAvailableHeight({ viewportHeight: 844, headerBottom: 56, dockTop: 0 }), 780);
});


test('save bar stays eight pixels above shared navigation across viewport, safe area and keyboard offsets', () => {
  for (const height of [640,844,900,390]) {
    for (const inset of [0,34,240]) {
      const navTop=height-8-56-inset;
      assert.equal(conversionDockBottom({layoutHeight:height,navTop}),72+inset);
      assert.equal(height-conversionDockBottom({layoutHeight:height,navTop}),navTop-8);
    }
  }
  assert.equal(conversionDockBottom({layoutHeight:844,navTop:0}),72);
  assert.equal(conversionDockBottom({layoutHeight:844,navTop:NaN}),72);
});


test('batch save names selected output formats and output count, independently of input assets', () => {
  assert.equal(batchSaveActionLabel(['png','PNG','jpeg'],3),'PNG・JPEG 3件を保存');
  assert.equal(batchSaveActionLabel(['gif','apng','wav'],3),'GIF・APNGほか 3件を保存');
  assert.equal(batchSaveActionLabel(['PNG','PNG'],2),'PNG 2件を保存');
});
test('batch label does not invent a format when the output metadata is missing', () => {
  assert.equal(batchSaveActionLabel(['','not a format'],2),'出力 2件を保存');
});
