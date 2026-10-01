import { evaluateSharedCanvasPolicy } from './shared-canvas-policy.mjs?rev=20260930-shared-canvas-5';
import { hasPass, requestPass } from '../pixieed-pass.mjs?v=20260930-rewarded-gpt-1';
import { getPxdJson } from './pxd-codec.mjs';

let pending = false;
/** Check at the start of an edit; saving and already-started finite jobs never use this guard. */
export function requireSharedCanvasAccess(project, notify = () => {}, tool = '') {
  const role = { hidden_object: 'hidden', spot_difference: 'spot-after' }[tool];
  const path = role && `images/${role}/meta.json`;
  const meta = path && project?.entries?.some((entry) => entry.path === path) ? getPxdJson(project, path) : null;
  const canvas = meta ? { width: meta.width, height: meta.height, colorCount: meta.colorCount ?? meta.colors?.length } : project?.manifest?.sharedCanvas;
  if (!canvas) return true;
  const policy = evaluateSharedCanvasPolicy(canvas, { passActive: hasPass() });
  if (policy.supported && !policy.locked) return true;
  if (!policy.supported) { notify('原本は表示・保存できます。編集するには共通キャンバス設定で256px・32色以内に合わせてください。'); return false; }
  notify('編集を続けるには特典時間を追加してください。作品と正解はそのまま保存できます。');
  if (!pending) { pending = true; void requestPass({ perk: 'project.canvas-expanded' }).finally(() => { pending = false; }); }
  return false;
}
