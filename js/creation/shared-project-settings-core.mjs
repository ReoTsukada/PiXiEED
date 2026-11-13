import { ANIMATION_MAX_DIMENSION } from './animation-core.mjs?rev=20261113-canvas1028-shared-2';
const HEX_COLOR = /^#[\da-f]{6}(?:[\da-f]{2})?$/i;

function dimensionError(value, maxDimension) {
  const raw = String(value ?? '').trim();
  const number = Number(raw);
  return raw !== '' && Number.isInteger(number) && number >= 1 && number <= maxDimension
    ? ''
    : `1〜${maxDimension}の整数を入力してください。`;
}

/** Field-local validation for the shared canvas dimensions and palette draft. */
export function validateCanvasSettingsFields({ width, height, palette, maxDimension = ANIMATION_MAX_DIMENSION } = {}) {
  const colors = Array.isArray(palette) ? palette : [];
  const validPalette = colors.length >= 1 && colors.length <= 128 && colors.every(color => HEX_COLOR.test(String(color)));
  return {
    width: dimensionError(width, maxDimension),
    height: dimensionError(height, maxDimension),
    palette: validPalette ? '' : '有効なHEXカラーを1〜128候補入力してください。'
  };
}

/** A preview is usable only for its exact owner, draft revision, and settings. */
export function isProjectSettingsPreviewCurrent(preview, { owner, revision, settings } = {}) {
  return Boolean(preview
    && preview.owner === owner
    && preview.revision === revision
    && JSON.stringify(preview.settings) === JSON.stringify(settings));
}

/** Place the shared panel inside the currently visible visual viewport. */
export function getCanvasSettingsBounds({
  viewportTop = 0,
  viewportLeft = 0,
  viewportWidth = 0,
  viewportHeight = 0,
  headerBottom = viewportTop + 8,
  navTop = viewportTop + viewportHeight - 8,
  minHeight = 120,
  gutter = 8
} = {}) {
  // The modal covers the navigation, so use the visible viewport rather than
  // reserving the underlying bars. This also follows an open phone keyboard.
  const width = Math.max(1, Math.min(860, viewportWidth - gutter * 2));
  const height = Math.max(1, Math.min(760, viewportHeight - gutter * 2));
  const top = viewportTop + Math.max(gutter, (viewportHeight - height) / 2);
  return {
    top: Math.round(top),
    left: Math.round(viewportLeft + (viewportWidth - width) / 2),
    width: Math.round(width),
    height: Math.round(height),
    compact: width < 720 || height < 520
  };
}

/** Fit outside both the original artwork and the draft, never crop on ratio choice. */
export function fitCanvasAspect({ width, height, originalWidth, originalHeight, aspect, maxDimension = ANIMATION_MAX_DIMENSION }) {
  if (aspect === 'free') return { width, height };
  const [a, b] = String(aspect).split(':').map(Number);
  if (![a,b].every(value => Number.isInteger(value) && value > 0)) return null;
  const gcd = (x,y) => y ? gcd(y,x % y) : x;
  const divisor = gcd(a,b), x = a/divisor, y = b/divisor;
  const w = Math.max(originalWidth, Number.isFinite(width) ? width : originalWidth);
  const h = Math.max(originalHeight, Number.isFinite(height) ? height : originalHeight);
  const scale = Math.ceil(Math.max(w/x,h/y));
  if (x*scale > maxDimension || y*scale > maxDimension) return null;
  return { width:x*scale, height:y*scale };
}
