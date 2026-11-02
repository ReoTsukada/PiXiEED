/** Keep the real format control reachable while a mobile settings sheet is modal. */
export function formatControlDestination({ media, loaded, modal }) {
  return media && loaded && !modal ? 'preview' : 'panel';
}

/** Shorten only recognized boilerplate. Validation, failures and progress remain verbatim. */
export function conversionSaveMessage({ loaded, working, saved, nativeStatus = '' }) {
  const boilerplate = new Set([
    '形式と設定を確認して、変換できます。',
    '設定を変更しました。変換すると保存ファイルに反映されます。',
  ]);
  if (working) return nativeStatus || '変換しています…';
  if (saved) return 'ダウンロードを開始しました。';
  if (nativeStatus && !boilerplate.has(nativeStatus)) return nativeStatus;
  return loaded ? '選んだ形式・サイズで保存します。' : '素材を選んでください。';
}

/** Reserve the measured save bar instead of assuming a fixed text height. */
export function workspaceAvailableHeight({ viewportHeight, offsetTop = 0, headerBottom = 0, dockTop, navTop, minHeight = 180 }) {
  const bottom = viewportHeight + offsetTop;
  const boundaries = [bottom, dockTop, navTop].filter(value => Number.isFinite(value) && value > headerBottom);
  return Math.max(minHeight, Math.min(...boundaries) - headerBottom - 8);
}

export function materialKindLabel(kind) {
  return ({ image: '画像', 'rgba-frames': '画像', 'legacy-image': '画像', audio: '音声', 'audio-buffer': '音声', 'video-source': '動画', 'audio-song': '音楽', 'audio-video': '画像と音楽', 'legacy-file': 'ファイル' })[kind] || '素材';
}

/** Reserve a gap above the actual common navigation, including its safe/keyboard inset. */
export function conversionDockBottom({ layoutHeight, navTop, gap = 8, fallback = 72 }) {
  return Number.isFinite(layoutHeight) && Number.isFinite(navTop) && navTop > 0 && navTop < layoutHeight
    ? layoutHeight - navTop + gap : fallback;
}

/** Describe the selected generated files, independently of input count or current format. */
export function batchSaveActionLabel(formats, count) {
  const known=[...new Set(formats.filter(value=>/^[a-z0-9]{1,8}$/i.test(value)).map(value=>value.toUpperCase()))];
  const names=known.slice(0,2).join('・')+(known.length>2?'ほか':'');
  return `${names || '出力'} ${count}件を保存`;
}
