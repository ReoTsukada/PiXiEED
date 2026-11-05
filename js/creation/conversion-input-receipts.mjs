/** Imported-file receipts are distinct from animation frames and output items. */
export function conversionInputReceipt(entry = {}) {
  const kind = entry.kind;
  const ready = entry.status === 'ready';
  const states = {
    queued: entry.error || '順番を待っています', reading: '読み込み中',
    cancelled: entry.error || '読み込みを中止しました。元ファイルは保持しています',
    error: entry.error || '読み込めませんでした。元ファイルは保持しています',
    held: entry.error || '変換対象から外し、元ファイルを保持しています',
    ready: kind === 'text' ? '文章に追記済み' : kind === 'media' ? '変換素材に追加済み' : '復元コード用の元ファイルとして保持',
  };
  return {
    id: entry.id,
    name: entry.file?.name || '名前のないファイル',
    state: states[entry.status] || '読み込み状態を確認してください',
    action: entry.needsReview && kind === 'media' ? '素材群で追加状態を確認' : entry.needsReview && kind === 'text' ? '文章で追加状態を確認' : ready ? kind === 'text' ? '追記した文章を見る' : kind === 'media' ? '素材群を見る' : 'このファイルをコードにする' : '',
    retry: !entry.needsReview && entry.retryable !== false && (entry.status === 'error' || entry.status === 'cancelled'),
    retryLabel: entry.applied ? '表示を再開' : '再試行',
    hold: Boolean(['text','media'].includes(kind) && ['error','cancelled'].includes(entry.status) && (!entry.applied || entry.needsReview)),
    note: kind === 'binary' ? '画像・音声・文章として判定できない形式です。内容を変えずに復元コードへ保存できます。' : '',
  };
}

/** Activate the owning material without re-importing or replacing a draft. */
export function activateRetainedConversionInput(entry, { api, formatController, busy = false } = {}) {
  if (!entry || (entry.status !== 'ready' && !(entry.needsReview && ['text','media'].includes(entry.kind))) || !api || busy || api.snapshot?.().composing) return false;
  if (entry.kind === 'text') return api.setMode('input');
  // A media receipt identifies the native input group, never an individual decoded frame.
  if (entry.kind === 'media') return api.setMode('media');
  if (entry.kind !== 'binary' || !api.selectFile(entry.file) || !api.setMode('output')) return false;
  return formatController?.choose('encode', { busy: false }) || formatController?.snapshot().value === 'encode';
}
