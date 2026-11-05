import { captureConversionImports, restoreConversionImports, validateConversionImports } from './conversion-import-recovery.mjs?rev=20261105-video-size-1';
import { planConversionImport } from './conversion-input-router.mjs?rev=20261105-video-size-1';

const MAX_RESTORE_CODE_BYTES = 16 * 1024 * 1024;
let nextEntryId = 1;

/** Coordinate ordered file intake while leaving decoding and media policy in native owners. */
export function createUnifiedImportController({
  snapshot, isBusy, isCurrent = () => true, appendTextFiles, importMedia, selectFile,
  activateMedia, activateText, activateCode, report, onInvalidate, onSettled, onEntriesChange,
}) {
  let pending = false, epoch = 0;
  const entries = [];
  const batchStates = new Map();
  const current = ticket => ticket === epoch && isCurrent();
  const publish = () => onEntriesChange?.(snapshotEntries());
  const snapshotEntries = () => entries.map(entry => Object.freeze({ ...entry,
    retryable: !entry.needsReview && !(entry.kind === 'binary' && Number(entry.file?.size) > MAX_RESTORE_CODE_BYTES) && ['error', 'cancelled'].includes(entry.status),
  }));
  const updateEntry = (entry, patch) => { Object.assign(entry, patch); publish(); };
  const observeText = (latest, textState) => {
    if (Number.isFinite(latest?.editRevision) && Number.isFinite(textState.originalEditRevision)) {
      if (latest.editRevision !== textState.originalEditRevision) textState.edited = true;
    } else if (latest?.text !== textState.originalText) textState.edited = true;
  };

  async function activateAppliedEntry(entry, ticket, textState) {
    if (!current(ticket)) return false;
    if (entry.kind === 'text') {
      if (!snapshot()?.composing) await activateText();
      return current(ticket);
    }
    let latest = snapshot();
    observeText(latest, textState);
    if (entry.kind === 'media') {
      const selected = await selectFile(entry.mediaBatchSize === 1 ? entry.file : null);
      if (!current(ticket) || !selected) throw new Error('読み込みは完了しましたが、素材の選択状態を確認できませんでした。');
      const after = snapshot(); observeText(after, textState);
      if (after?.composing) return true;
      if (textState.edited) await activateText(); else await activateMedia();
      return current(ticket);
    }
    if (entry.kind === 'binary') {
      const selected = await selectFile(entry.file);
      if (!current(ticket) || !selected) throw new Error('復元コードの元ファイルを選べませんでした。');
      latest = snapshot(); observeText(latest, textState);
      if (latest?.composing) return true;
      if (textState.edited) { await activateText(); return current(ticket); }
      return Boolean(await activateCode(entry.file)) && current(ticket);
    }
    return false;
  }

  async function processEntry(entry, ticket, { textState } = {}) {
    if (!current(ticket)) return false;
    if (entry.applied) {
      try {
        const activated = await activateAppliedEntry(entry, ticket, textState);
        if (!current(ticket) || !activated) return false;
        updateEntry(entry, { status: 'ready', error: '' }); return true;
      } catch (error) {
        if (current(ticket)) updateEntry(entry, { status: 'error', error: error?.message || '入力先を選べませんでした。' });
        return false;
      }
    }
    const before = snapshot();
    observeText(before, textState);
    updateEntry(entry, { status: 'reading', error: '' });
    try {
      let accepted = false;
      if (entry.kind === 'text') {
        accepted = await appendTextFiles([entry.file]);
        if (accepted) {
          updateEntry(entry, { applied: true, needsReview: false });
          const after = snapshot();
          if (Number.isFinite(after?.editRevision) && Number.isFinite(before?.editRevision)) observeText(after, textState);
          textState.originalText = after?.text; textState.originalEditRevision = after?.editRevision;
        }
      } else if (entry.kind === 'binary') {
        if (Number(entry.file?.size) > MAX_RESTORE_CODE_BYTES) throw new RangeError('復元コードは16MB以下のファイルを選んでください。');
        const selected = await selectFile(entry.file);
        if (selected) updateEntry(entry, { applied: true, needsReview: false });
        if (!current(ticket)) return false;
        if (selected) {
          const latest = snapshot();
        observeText(latest, textState);
          if (latest?.composing) accepted = true;
          else if (textState.edited) { await activateText(); accepted = true; }
          else accepted = Boolean(await activateCode(entry.file));
        }
      } else if (entry.kind === 'media') {
        try { accepted = Boolean(await importMedia([entry.file])); }
        catch (error) { updateEntry(entry, { status: 'error', needsReview: true, error: '素材群で追加状態を確認してください。' }); throw error; }
        if (accepted) updateEntry(entry, { applied: true, needsReview: false });
        else { updateEntry(entry, { status: 'error', needsReview: true, error: '素材群で追加状態を確認してください。' }); throw new Error('素材群で追加状態を確認してください。'); }
        if (!current(ticket)) return false;
        accepted = await activateAppliedEntry(entry, ticket, textState);
      }
      if (!current(ticket)) return false;
      if (!accepted) throw new Error('処理結果を確認できませんでした。素材欄または入力欄のメッセージを確認してください。');
      updateEntry(entry, { status: 'ready', error: '', applied: true });
      return true;
    } catch (error) {
      if (!current(ticket)) return false;
      const message = error?.message || 'ファイルを読み込めませんでした。入力内容は保持されています。';
      if (!entry.needsReview) updateEntry(entry, { status: 'error', error: message });
      return false;
    }
  }

  async function runBatch(batch, kind) {
    if (pending || isBusy() || !isCurrent() || snapshot()?.composing) return false;
    pending = true;
    const ticket = ++epoch;
    onInvalidate?.();
    const acceptedEntries = [];
    const failures = [];
    const textState = batchStates.get(batch[0]?.batchId) || { originalText: snapshot()?.text, originalEditRevision: snapshot()?.editRevision, edited: false };
    try {
      if (kind === 'media') {
        for (const entry of batch) updateEntry(entry, { status: 'reading', error: '' });
        let imported;
        try { imported = await importMedia(batch.map(entry => entry.file)); }
        catch (error) {
          const reason = '素材群で追加状態を確認してください。';
          for (const entry of batch) updateEntry(entry, { status: 'error', needsReview: true, error: reason });
          failures.push(reason); throw error;
        }
        if (!imported) {
          const reason = '素材の追加結果を確認できませんでした。素材欄のメッセージを確認してください。';
          for (const entry of batch) updateEntry(entry, { status: 'error', needsReview: true, error: reason });
          failures.push(reason); report?.(reason); return false;
        }
        for (const entry of batch) updateEntry(entry, { applied: true, needsReview: false });
        if (!current(ticket)) { markQueuedCancelled(); return false; }
        const selected = await selectFile(batch.length === 1 ? batch[0].file : null);
        if (!current(ticket)) { markQueuedCancelled(); return false; }
        if (!selected) {
          const reason = '読み込みは完了しましたが、素材の選択状態を確認できませんでした。';
          for (const entry of batch) updateEntry(entry, { status: 'error', error: reason });
          failures.push(reason); report?.(reason); return false;
        }
        const latest = snapshot();
        observeText(latest, textState);
        if (!latest?.composing) {
          if (textState.edited) await activateText(); else await activateMedia();
        }
        if (!current(ticket)) { markQueuedCancelled(); return false; }
        for (const entry of batch) { updateEntry(entry, { status: 'ready', error: '', applied: true }); acceptedEntries.push(entry); }
      } else {
        const blockedKinds = new Set(['text','media'].filter(kind => entries.some(entry => entry.kind === kind && !batch.includes(entry)
          && entries.indexOf(entry) < entries.indexOf(batch[0]) && !entry.applied && ['error','cancelled','queued','reading'].includes(entry.status))));
        for (const entry of batch) {
          if (!current(ticket)) { markQueuedCancelled(); break; }
          if (['text','media'].includes(entry.kind) && blockedKinds.has(entry.kind)) {
            updateEntry(entry, { status: 'queued', error: `前の${entry.kind === 'text' ? '文字' : '素材'}ファイルを再試行または保留すると、元の順番で続けて処理されます。` });
            continue;
          }
          const succeeded = await processEntry(entry, ticket, { textState });
          if (succeeded) acceptedEntries.push(entry);
          else if (['text','media'].includes(entry.kind) && !entry.applied) blockedKinds.add(entry.kind);
          if (entry.status === 'error' && entry.error) failures.push(`${entry.name}: ${entry.error}`);
        }
      }
      if (failures.length) report?.(failures.join('\n'));
      return acceptedEntries.length > 0;
    } catch (error) {
      if (current(ticket)) {
        const reason = error?.message || 'ファイルを読み込めませんでした。入力内容は保持されています。';
        for (const entry of batch) if (entry.status === 'reading') updateEntry(entry, { status: 'error', error: reason });
        report?.(failures.length ? failures.join('\n') : reason);
      }
      return acceptedEntries.length > 0;
    } finally {
      pending = false;
      if (isCurrent()) onSettled?.();
    }
  }

  function markQueuedCancelled() {
    for (const entry of entries) if (entry.status === 'queued' || entry.status === 'reading') {
      updateEntry(entry, { status: 'cancelled', needsReview: entry.needsReview || (entry.status === 'reading' && !entry.applied && ['media','text'].includes(entry.kind)), error: entry.status === 'reading' ? '画面での処理は中止しました。端末側で追加済みの場合があります。' : '未処理のため中止しました。' });
    }
  }

  async function request(input) {
    const plan = planConversionImport(input);
    if (plan.kind === 'empty' || !isCurrent()) return false;
    const before = snapshot();
    if (pending || isBusy() || before?.composing) return false;
    if (plan.kind === 'rejected') { report?.(plan.reason); return false; }
    const batchId = `batch-${nextEntryId++}`;
    const batchTextState = { originalText: before?.text, originalEditRevision: before?.editRevision, edited: false };
    batchStates.set(batchId, batchTextState);
    const mediaBatchSize = plan.kind === 'media' ? plan.files.length : 1;
    const batch = plan.files.map((file, index) => ({ id: `import-${nextEntryId++}`, batchId, batchSize: plan.files.length, mediaBatchSize, originalText: batchTextState.originalText, originalEditRevision: batchTextState.originalEditRevision, file, name: file?.name || `file-${index + 1}`, kind: plan.kinds?.[index] || plan.kind, status: 'queued', error: '', applied: false, needsReview: false }));
    entries.push(...batch); publish();
    if (batch.length === 1 && batch.some(entry => entry.kind === 'binary' && Number(entry.file?.size) > MAX_RESTORE_CODE_BYTES)) {
      const oversized = batch.find(entry => entry.kind === 'binary' && Number(entry.file?.size) > MAX_RESTORE_CODE_BYTES);
      updateEntry(oversized, { status: 'error', error: '復元コードは16MB以下のファイルを選んでください。' });
      report?.(oversized.error);
      if (batch.length === 1) return false;
    }
    if (plan.kind === 'media') {
      const blocked = entries.some(entry => !batch.includes(entry) && entry.kind === 'media' && !entry.applied
        && ['error','cancelled','queued','reading'].includes(entry.status));
      if (blocked) {
        const reason = '前の素材ファイルを再試行または「元ファイルを保持して次へ」を選ぶと、元の順番で続けて処理されます。';
        for (const entry of batch) updateEntry(entry, { error: reason });
        report?.(reason);
        return false;
      }
    }
    return runBatch(batch, plan.kind === 'media' ? 'media' : 'ordered');
  }

  async function resumeDeferred(entry, ticket, textState) {
    let succeeded = true;
    for (const next of entries.slice(entries.indexOf(entry) + 1)) {
      if (next.kind !== entry.kind) continue;
      if (['error','cancelled','reading'].includes(next.status) && !next.applied) { succeeded = false; break; }
      if (next.status !== 'queued') continue;
      if (!current(ticket)) return false;
      const resumed = await processEntry(next, ticket, { textState });
      if (!resumed) { succeeded = false; break; }
    }
    return succeeded;
  }

  async function retryEntry(id) {
    const entry = entries.find(item => item.id === id);
    if (!entry || !['error', 'cancelled'].includes(entry.status) || entry.needsReview || pending || isBusy() || !isCurrent() || snapshot()?.composing) return false;
    if (entry.kind === 'binary' && Number(entry.file?.size) > MAX_RESTORE_CODE_BYTES) return false;
    if (['text','media'].includes(entry.kind)) {
      const earlier = entries.find(candidate => candidate.kind === entry.kind
        && entries.indexOf(candidate) < entries.indexOf(entry) && !candidate.applied
        && ['error','cancelled','queued','reading'].includes(candidate.status));
      if (earlier) { report?.(`先に前の${entry.kind === 'text' ? '文字' : '素材'}ファイルを再試行または保留してください。`); return false; }
    }
    pending = true;
    const ticket = ++epoch;
    onInvalidate?.();
    try {
      const textState = batchStates.get(entry.batchId) || { originalText: entry.originalText, originalEditRevision: entry.originalEditRevision, edited: false };
      let succeeded = await processEntry(entry, ticket, { textState });
      if (succeeded && ['text','media'].includes(entry.kind)) succeeded = await resumeDeferred(entry, ticket, textState) && succeeded;
      const failures = entries.filter(item => item.batchId === entry.batchId && item.status === 'error' && item.error);
      if (failures.length) report?.(failures.map(item => `${item.name}: ${item.error}`).join('\n'));
      return succeeded;
    }
    finally { pending = false; if (isCurrent()) onSettled?.(); }
  }

  async function holdEntry(id) {
    const entry = entries.find(item => item.id === id);
    if (!entry || !['text','media'].includes(entry.kind) || !['error','cancelled'].includes(entry.status)
      || pending || isBusy() || !isCurrent() || snapshot()?.composing) return false;
    const earlier = entries.find(candidate => candidate.kind === entry.kind && entries.indexOf(candidate) < entries.indexOf(entry)
      && !candidate.applied && ['error','cancelled','queued','reading'].includes(candidate.status));
    if (earlier) return false;
    updateEntry(entry, { status: 'held', error: entry.needsReview ? '元ファイルを保持しました。素材群で追加状態を確認してください。' : '元ファイルを保持し、この種類の次のファイルへ進みます。' });
    pending = true;
    const ticket = ++epoch;
    onInvalidate?.();
    try {
      const textState = batchStates.get(entry.batchId) || { originalText: entry.originalText, originalEditRevision: entry.originalEditRevision, edited: false };
      await resumeDeferred(entry, ticket, textState);
      return true;
    } finally { pending = false; if (isCurrent()) onSettled?.(); }
  }

  function cancel() {
    if (!pending) return false;
    epoch++;
    markQueuedCancelled();
    publish();
    return true;
  }

  function restoreRecovery(saved, { beforeCommit } = {}) {
    if (pending || entries.length) throw new Error('作業中の素材一覧には保存版を上書きできません。');
    const restored = restoreConversionImports(saved);
    beforeCommit?.(restored);
    const currentText = snapshot();
    for (const entry of restored) {
      nextEntryId = Math.max(nextEntryId, Number(entry.id.slice(7)) + 1, Number(entry.batchId.slice(6)) + 1);
      batchStates.set(entry.batchId, { originalText: currentText.text, originalEditRevision: currentText.editRevision, edited: false });
    }
    entries.push(...restored); publish(); return true;
  }
  return { request, retryEntry, holdEntry, cancel, snapshotEntries,
    captureRecovery: () => captureConversionImports(entries), validateRecovery: validateConversionImports, restoreRecovery,
    get pending() { return pending; } };

}

/** Preserve the native initial-load versus additive-import contract of each engine. */
export async function importUnifiedMediaFiles(api, files) {
  if (!api) throw new Error('ファイル変換の入口を確認できません。現在の入力は保持しています。');
  if (typeof api.getState === 'function') return api.getState().loaded ? api.addFiles?.(files) : api.replaceFiles?.(files);
  return api.addFiles?.(files);
}
