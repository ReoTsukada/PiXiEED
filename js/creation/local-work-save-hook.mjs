import { recordLocalWorkSave } from './local-work-ownership.mjs';

const pending = new Set();

/** Raw work has already committed. Optional association must never delay or undo it. */
export function scheduleLocalWorkSave(input) {
  const promise = recordLocalWorkSave(input).then(result => {
    if (!result.ok && globalThis.document?.dispatchEvent && globalThis.CustomEvent) {
      document.dispatchEvent(new CustomEvent('pixieed:local-ownership-warning', {detail:{message:result.warning}}));
    }
    return result;
  }).catch(() => ({ok:false,warning:'作品本体は保存済みですが、関連付けを確認できません。'}));
  pending.add(promise);
  void promise.finally(() => pending.delete(promise));
  return promise;
}

/** Explicit login waits for metadata saves already queued by this tab. */
export async function flushLocalWorkSaves() {
  const results = await Promise.all([...pending]);
  if (results.some(result=>!result.ok)) throw new Error('作品本体は保存済みですが、関連付け情報を確認できません。端末の保存設定を確認してください。');
}
