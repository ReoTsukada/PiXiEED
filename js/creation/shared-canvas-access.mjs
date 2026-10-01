import { evaluateSharedCanvasPolicy } from './shared-canvas-policy.mjs?rev=20261001-free-tools-1';
import { getPxdJson } from './pxd-codec.mjs';

/** Preserve the technical canvas limit; editing never requires watching an ad. */
export function requireSharedCanvasAccess(project, notify = () => {}, tool = '') {
  const role = { hidden_object: 'hidden', spot_difference: 'spot-after' }[tool];
  const path = role && `images/${role}/meta.json`;
  const meta = path && project?.entries?.some((entry) => entry.path === path) ? getPxdJson(project, path) : null;
  const canvas = meta ? { width: meta.width, height: meta.height, colorCount: meta.colorCount ?? meta.colors?.length } : project?.manifest?.sharedCanvas;
  if (!canvas) return true;
  const policy = evaluateSharedCanvasPolicy(canvas);
  if (policy.supported) return true;
  if (!policy.supported) { notify('原本は表示・保存できます。編集するには共通キャンバス設定で256px・32色以内に合わせてください。'); return false; }
  return false;
}
