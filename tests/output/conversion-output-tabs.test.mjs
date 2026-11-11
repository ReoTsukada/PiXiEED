import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeConversionAssetIdForFile,
  activeConversionSourceFile,
  associateCommittedMaterialFiles,
  classifyConversionOutput,
  createConversionOutputTabController,
  conversionOutputTabAria,
  conversionOutputTabControls,
  conversionOutputTabFocusTarget,
  conversionOutputTabKeyboardIndex,
  conversionOutputTabVisibility,
  conversionRecoveryStatusLabel,
  hideEmptyImageOutputFormat,
  planConversionOutputTabRoute,
  resolveConversionSourceFile,
  selectConversionNativeMaterialForFile,
  unifiedModeHasMaterial,
} from '../../js/creation/conversion-unified-input.mjs';
import { conversionOutputSaveLabel } from '../../js/creation/conversion-smart-ui.mjs';

test('classification follows the actual saved format, including text-to-image and PXT project output', () => {
  assert.deepEqual(classifyConversionOutput({ mode: 'input', source: 'text', action: 'text', renderFormat: 'png' }).category, 'image');
  assert.deepEqual(classifyConversionOutput({ mode: 'input', source: 'text', action: 'text', renderFormat: 'svg' }).category, 'image');
  assert.deepEqual(classifyConversionOutput({ mode: 'input', source: 'text', action: 'text', renderFormat: 'pxtxt' }), {
    category: 'text', tab: 'text', format: 'pxtxt', label: '文章と設定（PXT）', mimeType: 'text/plain',
  });
  assert.equal(classifyConversionOutput({ mode: 'media', format: 'pxtxt' }).category, 'text');
  assert.equal(classifyConversionOutput({ mode: 'output', format: 'ascii' }).category, 'text');
  assert.equal(classifyConversionOutput({ mode: 'output', format: 'pixels' }).label, '画素テキスト（TXT）');
  assert.equal(classifyConversionOutput({ mode: 'output', format: 'base64' }).label, 'Base64（TXT）');
  assert.equal(classifyConversionOutput({ mode: 'output', format: 'dataurl' }).label, 'Data URL（TXT）');
  assert.equal(classifyConversionOutput({ mode: 'output', format: 'encode' }).label, '復元コード（TXT）');
});

test('restore results use exact current output metadata, never the input engine or a stale preview', () => {
  const current = (kind, format, filename, mimeType) => ({
    kind, format, filename, mimeType, action: 'restore', generationMode: 'input', matchesInput: true, resultId: 3,
  });
  assert.equal(classifyConversionOutput({ mode: 'input', source: 'text', action: 'restore', outputReady: true, outputPreview: current('image', 'png', 'restored.png', 'image/png') }).category, 'image');
  assert.equal(classifyConversionOutput({ mode: 'input', source: 'text', action: 'restore', outputReady: true, outputPreview: current('file', 'wav', 'restored.txt', 'audio/wav') }).category, 'audio', 'actual MIME outranks a misleading filename extension');
  assert.equal(classifyConversionOutput({ mode: 'input', source: 'text', action: 'restore', outputReady: true, outputPreview: current('file', 'webm', 'restored.bin', 'video/webm') }).category, 'video');
  assert.equal(classifyConversionOutput({ mode: 'input', source: 'text', action: 'restore', outputReady: true, outputPreview: current('file', 'txt', 'restored.txt', 'text/plain') }).category, 'text');
  assert.equal(classifyConversionOutput({ mode: 'input', source: 'text', action: 'restore', outputReady: true, outputPreview: current('image', 'wav', 'restored.png', 'audio/wav') }).category, 'audio', 'a supported MIME also corrects inconsistent kind and extension metadata');

  const notReady = classifyConversionOutput({ mode: 'input', source: 'text', action: 'restore', outputPreview: current('image', 'png', 'restored.png', 'image/png') });
  assert.equal(notReady.category, 'unknown', 'generated metadata is not used until the existing save-ready flag is true');

  const mismatchedAction = { ...current('image', 'png', 'old.png', 'image/png'), action: 'base64' };
  const stale = { ...current('image', 'png', 'old.png', 'image/png'), matchesInput: false };
  for (const outputPreview of [mismatchedAction, stale, { ...current('image', 'png', 'old.png', 'image/png'), generationMode: 'output' }]) {
    const result = classifyConversionOutput({ mode: 'input', source: 'text', action: 'restore', outputReady: true, outputPreview });
    assert.equal(result.category, 'unknown');
    assert.equal(result.label, 'ファイル');
    assert.equal(result.mimeType, '');
  }

  const arbitrary = classifyConversionOutput({ mode: 'input', source: 'text', action: 'restore', outputReady: true, outputPreview: current('file', 'bin', 'payload.bin', 'application/octet-stream') });
  assert.equal(arbitrary.category, 'file');
  assert.equal(arbitrary.tab, 'image', 'the non-text tab is dynamically labelled ファイル, not 画像, for unknown files');
  assert.equal(arbitrary.label, 'ファイル');
});

test('media uses its currently selected native format and ignores retained text-output metadata', () => {
  const oldTextResult = { kind: 'image', format: 'png', filename: 'old.png', mimeType: 'image/png', action: 'restore', generationMode: 'input', matchesInput: true };
  const audio = classifyConversionOutput({ mode: 'media', format: 'mp3', filename: 'old.png', mimeType: 'image/png', outputPreview: oldTextResult });
  assert.equal(audio.category, 'audio');
  assert.equal(audio.mimeType, 'audio/*');
  assert.equal(classifyConversionOutput({ mode: 'media', format: 'webm', outputPreview: oldTextResult }).category, 'video');
  assert.equal(classifyConversionOutput({ mode: 'media', format: 'svg', outputPreview: oldTextResult }).category, 'image');
  assert.equal(classifyConversionOutput({ mode: 'media', format: 'original', outputPreview: oldTextResult }).category, 'file');
});

test('tab routes keep the active source and remember text image format while offering PXT as text output', () => {
  assert.deepEqual(planConversionOutputTabRoute({ tab: 'image', source: 'text', mode: 'input', action: 'text', currentTab: 'text', imageFormat: 'svg' }), {
    available: true, route: 'text-image', renderFormat: 'svg',
  });
  assert.deepEqual(planConversionOutputTabRoute({ tab: 'text', source: 'text', mode: 'input', action: 'text', currentTab: 'image' }), {
    available: true, route: 'text-project', renderFormat: 'pxtxt',
  });
  assert.deepEqual(planConversionOutputTabRoute({ tab: 'text', source: 'file', mode: 'media', action: 'text', currentTab: 'image', fileKind: 'image', hasSource: true, hasOriginalFile: true }), {
    available: true, route: 'file-art',
  });
  assert.deepEqual(planConversionOutputTabRoute({ tab: 'image', source: 'file', mode: 'output', action: 'text', currentTab: 'text', fileKind: 'image', hasSource: true, hasOriginalFile: true, hasNativeAsset: true, mediaLoaded: true }), {
    available: true, route: 'file-media',
  });
});

test('committed source files bind by asset ID and input order, never by a duplicate filename', () => {
  const first = { name: 'same.png', marker: 'first' }, second = { name: 'same.png', marker: 'second' };
  const exact = associateCommittedMaterialFiles({
    assets: [{ id: 'material-1-same.png' }, { id: 'material-2-same.png' }],
    files: [first, second], previousAssetIds: [],
  });
  assert.deepEqual(exact.associations, [['material-1-same.png', first], ['material-2-same.png', second]]);

  const freshGrouped = associateCommittedMaterialFiles({ assets: [{ id: 'local-images', kind: 'rgba-frames' }], files: [first], previousAssetIds: [] });
  assert.deepEqual(freshGrouped.associations, [['local-images', first]], 'a fresh, single-file grouped source has an exact commit boundary');
  const groupedAppend = associateCommittedMaterialFiles({ assets: [{ id: 'local-images', kind: 'rgba-frames' }], files: [second], previousAssetIds: ['local-images'] });
  assert.deepEqual(groupedAppend.associations, [], 'an append into a grouped source cannot be mapped to its combined frames');
  assert.deepEqual(groupedAppend.invalidatedIds, ['local-images']);
});

test('active material resolution refuses stale snapshot files and round-trips the same original asset', async () => {
  const oldImage = { name: 'same.png', type: 'image/png', marker: 'old' };
  const activeImage = { name: 'same.png', type: 'image/png', marker: 'active' };
  const activeAudio = { name: 'sound.mp3', type: 'audio/mpeg' };
  const assets = [{ id: 'img-old', name: 'same.png', kind: 'image' }, { id: 'img-active', name: 'same.png', kind: 'image' }, { id: 'audio-active', name: 'sound.mp3', kind: 'audio' }];
  const materialState = { loaded: true, activeId: 'img-active', assets };
  const originalForAsset = id => ({ 'img-old': oldImage, 'img-active': activeImage, 'audio-active': activeAudio })[id] || null;
  const source = activeConversionSourceFile({ stateFile: oldImage, materialState, getOriginalFileForAsset: originalForAsset });
  assert.equal(source, activeImage, 'selected asset ID wins over a retained stale file, even for same-name files');
  assert.equal(activeConversionAssetIdForFile(activeImage, materialState, file => assets.find(asset => originalForAsset(asset.id) === file)?.id), 'img-active');

  const toText = planConversionOutputTabRoute({ tab: 'text', source: 'file', mode: 'media', currentTab: 'image', fileKind: 'image', hasSource: true, hasOriginalFile: true });
  assert.deepEqual(toText, { available: true, route: 'file-art' });
  const toImage = planConversionOutputTabRoute({ tab: 'image', source: 'file', mode: 'output', currentTab: 'text', fileKind: 'image', hasSource: true, hasOriginalFile: true, hasNativeAsset: true, mediaLoaded: true });
  assert.deepEqual(toImage, { available: true, route: 'file-media' });

  const selected = [];
  assert.equal(await selectConversionNativeMaterialForFile({ file: activeImage, materialState: { ...materialState, activeId: 'img-old' },
    getAssetIdForOriginalFile: file => assets.find(asset => originalForAsset(asset.id) === file)?.id,
    selectAsset: async id => { selected.push(id); return true; } }), true);
  assert.deepEqual(selected, ['img-active']);
  assert.equal(await selectConversionNativeMaterialForFile({ file: activeImage, materialState: { ...materialState, activeId: 'img-old' },
    getAssetIdForOriginalFile: file => assets.find(asset => originalForAsset(asset.id) === file)?.id, selectAsset: async () => false }), false,
  'an asynchronous native selection failure blocks the return route');

  const audioSelected = { ...materialState, activeId: 'audio-active' };
  assert.equal(activeConversionSourceFile({ stateFile: oldImage, materialState: audioSelected, getOriginalFileForAsset: originalForAsset }), activeAudio);
  const audioTextRoute = planConversionOutputTabRoute({ tab: 'text', source: 'file', mode: 'media', currentTab: 'image', fileKind: 'audio', hasSource: true, hasOriginalFile: true });
  assert.equal(audioTextRoute.available, false, 'a retained image cannot lend its original File to the active audio source');
  assert.equal(activeConversionSourceFile({ stateFile: oldImage, materialState: { loaded: true, activeId: 'missing', assets }, getOriginalFileForAsset: () => null }), null,
    'unknown active material IDs do not fall back to a different retained File');
});

test('output mode keeps an explicitly selected binary File authoritative over retained media', () => {
  const retainedImage = { name: 'old.png', type: 'image/png' };
  const binaryFile = { name: 'payload.bin', type: 'application/octet-stream' };
  const materialState = { loaded: true, activeId: 'old-image', assets: [{ id: 'old-image', kind: 'image' }] };
  const getOriginalFileForAsset = () => retainedImage;
  assert.equal(resolveConversionSourceFile({ sourceKind: 'file', mode: 'output', stateFile: binaryFile, materialState, getOriginalFileForAsset }), binaryFile,
    'shared binary import and retained binary activation must not borrow a previously active image');
  assert.equal(resolveConversionSourceFile({ sourceKind: 'file', mode: 'media', stateFile: binaryFile, materialState, getOriginalFileForAsset }), retainedImage,
    'media mode follows the exact active native source instead');
  const selectedOriginal = { name: 'explicit.dat' };
  assert.equal(resolveConversionSourceFile({ sourceKind: 'file', mode: 'output', stateFile: selectedOriginal, explicitOriginalFile: selectedOriginal, materialState, getOriginalFileForAsset }), selectedOriginal);
});

test('image-to-text routes require the exact original file and returning to media requires its matching asset', () => {
  const noOriginal = planConversionOutputTabRoute({ tab: 'text', source: 'file', mode: 'media', currentTab: 'image', fileKind: 'image', hasSource: true, hasOriginalFile: false });
  assert.equal(noOriginal.available, false);
  assert.match(noOriginal.reason, /元ファイルを特定できない/);
  const noNativeAsset = planConversionOutputTabRoute({ tab: 'image', source: 'file', mode: 'output', currentTab: 'text', fileKind: 'image', hasSource: true, hasOriginalFile: true, hasNativeAsset: false, mediaLoaded: true });
  assert.equal(noNativeAsset.available, false);
  assert.match(noNativeAsset.reason, /照合できない/);
});

test('explicit code restore is not silently reinterpreted, and audio cannot borrow a retained image for text art', () => {
  const textToRestore = planConversionOutputTabRoute({ tab: 'image', source: 'text', mode: 'input', action: 'restore', currentTab: 'text', hasSource: true });
  assert.equal(textToRestore.available, false);
  assert.match(textToRestore.reason, /復元方法と入力は保持/);
  const activeAudio = planConversionOutputTabRoute({ tab: 'text', source: 'file', mode: 'media', action: 'text', currentTab: 'image', fileKind: 'audio', hasSource: true });
  assert.equal(activeAudio.available, false);
  assert.match(activeAudio.reason, /画像素材/);
  const activeVideo = planConversionOutputTabRoute({ tab: 'text', source: 'file', mode: 'media', currentTab: 'image', fileKind: 'video', hasSource: true });
  assert.equal(activeVideo.available, false);
  assert.equal(planConversionOutputTabRoute({ tab: 'text', source: 'file', mode: 'output', currentTab: 'text', fileKind: 'audio', hasSource: true }).route, 'keep');
});

test('tab selection is view state only and busy, IME, or unavailable transitions do not change it', () => {
  let source = 'typed draft', mode = 'input', busy = false, composing = false;
  const tabs = createConversionOutputTabController({ getTab: () => 'image', isBusy: () => busy, isComposing: () => composing });
  assert.deepEqual(tabs.snapshot(), { tab: 'image' });
  assert.equal(tabs.select('text'), true);
  assert.equal(mode, 'input'); assert.equal(source, 'typed draft', 'selecting a category does not choose another source or discard its draft');
  assert.deepEqual(tabs.snapshot(), { tab: 'text' });
  tabs.observe('image'); assert.deepEqual(tabs.snapshot(), { tab: 'image' });
  busy = true; assert.equal(tabs.select('text'), false);
  busy = false; composing = true; assert.equal(tabs.select('text'), false);
  composing = false; assert.equal(tabs.select('text', { available: false }), false);
  assert.deepEqual(tabs.snapshot(), { tab: 'image' });
});

test('tab keyboard targets and ARIA remain predictable when a route is blocked', () => {
  assert.equal(conversionOutputTabKeyboardIndex('ArrowRight', 0), 1);
  assert.equal(conversionOutputTabKeyboardIndex('ArrowRight', 1), 0);
  assert.equal(conversionOutputTabKeyboardIndex('ArrowLeft', 0), 1);
  assert.equal(conversionOutputTabKeyboardIndex('Home', 1), 0);
  assert.equal(conversionOutputTabKeyboardIndex('End', 0), 1);
  assert.equal(conversionOutputTabKeyboardIndex('Enter', 1), 1);
  assert.equal(conversionOutputTabKeyboardIndex(' ', 0), 0);
  assert.equal(conversionOutputTabKeyboardIndex('Spacebar', 0), 0);
  assert.equal(conversionOutputTabKeyboardIndex('Escape', 0), null);
  assert.deepEqual(conversionOutputTabAria('image', 'image'), { ariaSelected: 'true', tabIndex: 0 });
  assert.deepEqual(conversionOutputTabAria('text', 'image'), { ariaSelected: 'false', tabIndex: -1 });
  assert.equal(conversionOutputTabFocusTarget('text', 'image', true), 'text');
  assert.equal(conversionOutputTabFocusTarget('text', 'image', false), 'image');
  assert.equal(conversionOutputTabControls({ tab: 'image', imagePanelIds: ['sc-output-engine-panel'] }), 'sc-output-engine-panel');
  assert.equal(conversionOutputTabControls({ tab: 'text', textPanelId: 'sc-output-engine-panel' }), 'sc-output-engine-panel');
});

test('engine visibility follows the retained mode, independently from output category', () => {
  assert.deepEqual(conversionOutputTabVisibility('image', 'input'), {
    tab: 'image', showMediaEngine: false, showTextEngine: true, showSharedRecovery: true, showImportReceipts: true, showLocalPersistence: true,
  });
  assert.deepEqual(conversionOutputTabVisibility('text', 'media'), {
    tab: 'text', showMediaEngine: true, showTextEngine: false, showSharedRecovery: true, showImportReceipts: true, showLocalPersistence: true,
  });
  assert.equal(hideEmptyImageOutputFormat({ tab: 'image', mode: 'media', loaded: false, hasFile: false, hasImageFormat: false }), true);
  assert.equal(hideEmptyImageOutputFormat({ tab: 'image', mode: 'media', loaded: true, hasFile: false, hasImageFormat: false }), false);
  assert.equal(hideEmptyImageOutputFormat({ tab: 'text', mode: 'media', loaded: false, hasFile: false, hasImageFormat: false }), false);
});

test('save labels name the exact format for fresh, stale, and restored outputs', () => {
  assert.equal(conversionOutputSaveLabel({ mode: 'input', action: 'text', renderFormat: 'png', loaded: true }), 'PNGを保存');
  assert.equal(conversionOutputSaveLabel({ mode: 'input', action: 'text', renderFormat: 'svg', loaded: true }), 'SVGを保存');
  assert.equal(conversionOutputSaveLabel({ mode: 'input', action: 'text', renderFormat: 'pxtxt', loaded: true }), 'PXT（文章と設定）を保存');
  assert.equal(conversionOutputSaveLabel({ mode: 'output', format: 'ascii', loaded: true }), 'TXTを保存');
  assert.equal(conversionOutputSaveLabel({ mode: 'media', format: 'webm', loaded: true }), 'WEBMを保存');
  assert.equal(conversionOutputSaveLabel({ mode: 'input', action: 'restore', loaded: true, outputPreview: { generationMode: 'input', action: 'restore', matchesInput: true, format: 'png' } }), 'PNGを保存');
  assert.equal(conversionOutputSaveLabel({ mode: 'input', action: 'restore', loaded: true, filename: 'stale.png', outputPreview: { generationMode: 'input', action: 'restore', matchesInput: false, format: 'png' } }), 'ファイルを保存');
  assert.equal(conversionOutputSaveLabel({ mode: 'input', loaded: true, working: true, renderFormat: 'svg' }), '作成中…');
});

test('recovery status stays short without hiding dirty, stopped, or warning states', () => {
  assert.equal(conversionRecoveryStatusLabel({ phase: 'loading', dirty: true }), '保存内容を確認中');
  assert.equal(conversionRecoveryStatusLabel({ phase: 'saving', saving: true, dirty: true }), '保存中');
  assert.equal(conversionRecoveryStatusLabel({ phase: 'error', dirty: true }), '保存エラーを確認');
  assert.equal(conversionRecoveryStatusLabel({ phase: 'saving', saving: true, dirty: true, message: '保存停止の設定を再読込後へ引き継げません。' }), '保存中・設定注意');
  assert.equal(conversionRecoveryStatusLabel({ phase: 'pending', dirty: true }), '保存待ち');
  assert.equal(conversionRecoveryStatusLabel({ phase: 'paused', paused: true, dirty: true }), '未保存・保存停止中');
  assert.equal(conversionRecoveryStatusLabel({ phase: 'paused', paused: true, dirty: false }), '自動保存停止中');
  assert.equal(conversionRecoveryStatusLabel({ phase: 'saved', message: '端末内に保存済みです。共有端末ではデータが残ります。' }), '端末に保存済み');
  assert.equal(conversionRecoveryStatusLabel({ phase: 'saved', message: '端末内の保存版を復元しました。生成結果は必要に応じて作り直します。' }), '端末に保存済み');
  assert.equal(conversionRecoveryStatusLabel({ phase: 'saved', message: '復元時に注意が必要です。' }), '保存済み・注意あり');
  assert.equal(conversionRecoveryStatusLabel({ phase: 'saved', message: '端末内に保存済みです。保存停止の設定を再読込後へ引き継げません。' }), '保存済み・注意あり');
});

test('a retained text draft does not hide the empty image import action', () => {
  assert.equal(unifiedModeHasMaterial({ mode: 'media', text: 'retained draft', loaded: false }), false);
  assert.equal(unifiedModeHasMaterial({ mode: 'media', text: '', loaded: true }), true);
  assert.equal(unifiedModeHasMaterial({ mode: 'input', text: 'draft', loaded: false }), true);
  assert.equal(unifiedModeHasMaterial({ mode: 'output', text: '', loaded: false, file: { name: 'image.png' } }), true);
});
