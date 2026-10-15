import { evaluateSharedCanvasPolicy, SHARED_CANVAS_FREE_MAX_COLORS } from './shared-canvas-policy.mjs?rev=20261016-color-capability-1';
import { countSharedImageColors } from './shared-image.mjs?rev=20261016-color-capability-1';
import { getPxdJson } from './pxd-codec.mjs';
import { requireSiteReward } from '../ads/site-reward.mjs?rev=20261016-color-capability-1';

const ROLE_BY_TOOL = { hidden_object: 'hidden', spot_difference: 'spot-after' };

/** Read exact image pixels when available; schema-1 metadata counted transparent tuples. */
export function getSharedCanvasDetails(project, tool = '') {
  const preferredRole = ROLE_BY_TOOL[tool];
  const paths = [preferredRole && `images/${preferredRole}`, 'images/main'].filter(Boolean);
  for (const prefix of paths) {
    const metaPath = `${prefix}/meta.json`;
    const metaEntry = project?.entries?.find((entry) => entry.path === metaPath);
    if (!metaEntry) continue;
    const meta = getPxdJson(project, metaPath);
    const imageEntry = project.entries.find((entry) => entry.path === `${prefix}/pixels.rgba`);
    if (imageEntry && Number.isSafeInteger(meta.width) && Number.isSafeInteger(meta.height)
      && imageEntry.bytes?.length === meta.width * meta.height * 4) {
      const rgba = imageEntry.bytes;
      return { width: meta.width, height: meta.height, colorCount: countSharedImageColors({ width: meta.width, height: meta.height, rgba }) };
    }
    if (Number.isSafeInteger(meta.width) && Number.isSafeInteger(meta.height)) {
      const colorCount = Array.isArray(meta.colors)
        ? new Set(meta.colors.filter((color) => Array.isArray(color.rgba) && color.rgba[3] !== 0).map((color) => color.rgba.join(','))).size
        : undefined;
      return { width: meta.width, height: meta.height, colorCount };
    }
  }
  const marker = project?.manifest?.sharedCanvas;
  // Shared-canvas markers and schema-2 colorCount fields retain a legacy transparent-inclusive count.
  // If pixels are missing, fail closed for palette edits instead of trusting that stale count.
  return marker ? { width: marker.width, height: marker.height, colorCount: undefined } : null;
}

/**
 * Puzzle authoring changes masks and metadata, not the shared image palette, so it stays free.
 * Call with operation:'color-edit' only for an operation that changes shared image colors.
 */
export function requireSharedCanvasAccess(project, notify = () => {}, tool = '', {
  operation = 'puzzle-edit', requestReward = requireSiteReward
} = {}) {
  if (operation !== 'color-edit') return true;
  const canvas = getSharedCanvasDetails(project, tool);
  if (!canvas) return true;
  const policy = evaluateSharedCanvasPolicy(canvas, { passActive: true });
  if (!policy.supported) {
    notify('この共通画像は編集上限を超えています。原本の表示・保存とパズルの作成・試遊は続けられます。');
    return false;
  }
  if (canvas.colorCount <= SHARED_CANVAS_FREE_MAX_COLORS) return true;
  if (!requestReward('shared-canvas-colors')) {
    notify('33色以上の共通画像の色を変更するには、サイト共通リワードが有効な間に操作してください。原本は保持されています。');
    return false;
  }
  return true;
}
