const HEX_COLOR = /^#[\da-f]{6}(?:[\da-f]{2})?$/i;

function dimensionError(value) {
  const raw = String(value ?? '').trim();
  const number = Number(raw);
  return raw !== '' && Number.isInteger(number) && number >= 1 && number <= 256
    ? ''
    : '1〜256の整数を入力してください。';
}

/** Field-local validation for the shared canvas dimensions and palette draft. */
export function validateCanvasSettingsFields({ width, height, palette } = {}) {
  const colors = Array.isArray(palette) ? palette : [];
  const validPalette = colors.length >= 1 && colors.length <= 128 && colors.every(color => HEX_COLOR.test(String(color)));
  return {
    width: dimensionError(width),
    height: dimensionError(height),
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
  const width = Math.max(80, Math.min(620, viewportWidth - gutter * 2));
  const top = viewportHeight <= 600
    ? viewportTop + gutter
    : Math.max(viewportTop + gutter, Math.min(headerBottom + gutter, viewportTop + viewportHeight - minHeight));
  const bottom = Math.max(top + minHeight, Math.min(viewportTop + viewportHeight - gutter, navTop - gutter));
  return {
    top: Math.round(top),
    left: Math.max(gutter, Math.round(viewportLeft + (viewportWidth - width) / 2)),
    width: Math.round(width),
    height: Math.min(500, Math.max(minHeight, Math.round(bottom - top))),
    compact: bottom - top < 500
  };
}
