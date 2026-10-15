const validDimension = (value) => Number.isSafeInteger(value) && value > 0;

function logicalDimensions(metadata = {}) {
  metadata ||= {};
  const width = Number(metadata.width);
  const height = Number(metadata.height);
  return validDimension(width) && validDimension(height) ? { width, height } : null;
}

function outputDimensions(metadata = {}) {
  metadata ||= {};
  const logical = logicalDimensions(metadata);
  if (!logical) return null;
  const width = Number(metadata.outputWidth) || logical.width * (Number(metadata.defaultScale) || 1);
  const height = Number(metadata.outputHeight) || logical.height * (Number(metadata.defaultScale) || 1);
  return validDimension(width) && validDimension(height) ? { width, height } : null;
}

/** Return a canonical name only for the known generated PiXiEEDraw filename shape. */
export function isAutoDrawingFilename({ source, filename, metadata, extension } = {}) {
  if (source !== 'PiXiEEDraw') return false;
  if (metadata?.userFilename === true) return false;
  const logical = logicalDimensions(metadata);
  const output = outputDimensions(metadata);
  const ext = String(extension || '').toLowerCase();
  if (!logical || !output || !/^[a-z0-9]{1,8}$/.test(ext)) return false;
  return filename === `pixieed-drawing-${logical.width}x${logical.height}@${output.width}x${output.height}.${ext}`;
}

/** Keep auto-generated Draw names in sync with the encoded output dimensions. */
export function autoDrawingFilename(metadata, width, height, extension) {
  const logical = logicalDimensions(metadata);
  const ext = String(extension || '').toLowerCase();
  if (!logical || !validDimension(width) || !validDimension(height) || !/^[a-z0-9]{1,8}$/.test(ext)) return null;
  return `pixieed-drawing-${logical.width}x${logical.height}@${width}x${height}.${ext}`;
}

export function resolveOutputFilename({ autoName, metadata, width, height, extension, baseName, autoPixelOrigin = false } = {}) {
  const generated = autoName ? autoDrawingFilename(metadata, width, height, extension) : null;
  return generated || `${autoPixelOrigin ? `${baseName}-pixel` : baseName}.${String(extension || '').toLowerCase()}`;
}
