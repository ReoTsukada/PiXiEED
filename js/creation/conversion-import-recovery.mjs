const statuses = new Set(['queued','reading','ready','error','cancelled','held']);
export function captureConversionImports(entries) {
  return { schemaVersion: 1, entries: entries.map(entry => ({
    id: entry.id, batchId: entry.batchId, batchSize: entry.batchSize, mediaBatchSize: entry.mediaBatchSize,
    kind: entry.kind, status: entry.status, error: entry.error || '', applied: Boolean(entry.applied), needsReview: Boolean(entry.needsReview),
    file: { blob: entry.file.slice(0, entry.file.size, entry.file.type), name: entry.file.name, type: entry.file.type, lastModified: entry.file.lastModified },
  })) };
}
export function validateConversionImports(snapshot) {
  if (snapshot?.schemaVersion !== 1 || !Array.isArray(snapshot.entries) || snapshot.entries.length > 1024) throw new Error('素材一覧の保存形式を確認できません。');
  const ids = new Set();
  for (const entry of snapshot.entries) {
    if (!/^import-\d+$/.test(entry?.id) || ids.has(entry.id) || !/^batch-\d+$/.test(entry.batchId)
      || !['media','text','binary'].includes(entry.kind) || !statuses.has(entry.status)
      || typeof entry.applied !== 'boolean' || typeof entry.needsReview !== 'boolean'
      || typeof entry.error !== 'string' || entry.error.length > 20_000
      || !Number.isSafeInteger(entry.batchSize) || entry.batchSize < 1 || entry.batchSize > 1024
      || !Number.isSafeInteger(entry.mediaBatchSize) || entry.mediaBatchSize < 1 || entry.mediaBatchSize > 1024
      || !(entry.file?.blob instanceof Blob) || typeof entry.file.name !== 'string' || entry.file.name.length > 2048
      || typeof entry.file.type !== 'string' || !Number.isFinite(entry.file.lastModified)) throw new Error('素材一覧の保存データが壊れています。');
    ids.add(entry.id);
  }
  return snapshot;
}
export function restoreConversionImports(snapshot, FileRef = globalThis.File) {
  validateConversionImports(snapshot);
  return snapshot.entries.map(entry => {
    const saved = entry.file;
    const file = new FileRef([saved.blob], saved.name, { type: saved.type, lastModified: saved.lastModified });
    const inFlight = entry.status === 'reading';
    const unstarted = entry.status === 'queued';
    return { ...entry, file, name: saved.name,
      status: inFlight || unstarted ? 'cancelled' : entry.status,
      needsReview: entry.needsReview || (inFlight && !entry.applied && ['text','media'].includes(entry.kind)),
      error: inFlight ? (entry.applied ? '読込済みの素材です。表示だけ再開できます。' : '再読込前の処理結果を確認できません。追加状態を確認してから続けてください。') : unstarted ? '再読込前の未処理ファイルです。元の順番で再開できます。' : entry.error,
    };
  });
}
