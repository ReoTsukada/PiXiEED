const MEDIA_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'apng', 'bmp', 'tif', 'tiff', 'tga', 'targa', 'qoi', 'ico',
  'ppm', 'pgm', 'pbm', 'pnm', 'pam', 'svg', 'mp4', 'webm', 'wav', 'mp3', 'aif', 'aiff', 'aifc',
  'au', 'snd', 'flac', 'ogg', 'opus', 'm4a',
]);
const TEXT_EXTENSIONS = new Set(['txt', 'md', 'pxtxt', 'json', 'csv', 'tsv', 'log', 'xml', 'yaml', 'yml', 'ini', 'toml']);

const extensionOf = name => {
  const leaf = String(name || '').split(/[\\/]/).pop();
  const index = leaf.lastIndexOf('.');
  return index > 0 ? leaf.slice(index + 1).toLowerCase() : '';
};

/** Classify from file metadata only; actual parsing and engine capability stay native. */
export function classifyConversionFile(file) {
  const type = String(file?.type || '').split(';', 1)[0].trim().toLowerCase();
  if (type.startsWith('image/') || type.startsWith('audio/') || type.startsWith('video/')) return 'media';

  const extension = extensionOf(file?.name);
  if (MEDIA_EXTENSIONS.has(extension)) return 'media';
  if (TEXT_EXTENSIONS.has(extension)) return 'text';
  if (type.startsWith('text/') || type === 'application/json' || type === 'application/ld+json' || type.endsWith('+json')) return 'text';
  return 'binary';
}

/** Plan routing without consulting or changing the currently selected conversion mode. */
export function planConversionImport(input) {
  const files = Array.from(input || []);
  if (!files.length) return Object.freeze({ kind: 'empty', files });
  const kinds = files.map(classifyConversionFile);
  if (kinds.every(kind => kind === 'media')) return Object.freeze({ kind: 'media', files });
  if (files.length > 1) return Object.freeze({ kind: 'mixed', files, kinds });
  return Object.freeze({ kind: kinds[0], files, kinds });
}
