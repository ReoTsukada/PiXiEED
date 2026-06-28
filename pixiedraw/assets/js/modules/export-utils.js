(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function sanitizeNativeFilename(filename, fallback = 'export.bin') {
    const raw = typeof filename === 'string' ? filename : '';
    const basename = raw.split(/[\\/]/).pop() || '';
    const cleaned = basename
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned || fallback;
  }

  function normalizeNativeSubdirectory(path) {
    const raw = typeof path === 'string' ? path : '';
    return raw
      .split('/')
      .map(segment => segment.trim())
      .filter(Boolean)
      .map(segment => segment.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_'))
      .join('/');
  }

  function isLikelyFileAlreadyExistsError(error) {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || error || '').toLowerCase();
    return (
      code.includes('exist')
      || code.includes('already')
      || message.includes('eexist')
      || message.includes('already exists')
      || message.includes('file exists')
      || message.includes('exists')
    );
  }

  function isNativePhotoLibraryExportMimeType(mimeType) {
    const normalized = String(mimeType || '').trim().toLowerCase();
    return normalized.startsWith('image/') && normalized !== 'image/svg+xml';
  }

  function splitFilenameStemAndExtension(filename, fallback = 'export.bin') {
    const safeFilename = sanitizeNativeFilename(filename, fallback);
    const match = safeFilename.match(/^(.*?)(\.[^.]*)?$/);
    const stem = match?.[1] || safeFilename;
    const extension = match?.[2] || '';
    return {
      stem: stem || 'export',
      extension,
    };
  }

  function buildNumberedFilename(filename, sequence = 0) {
    const normalizedSequence = Math.max(0, Math.floor(Number(sequence) || 0));
    const { stem, extension } = splitFilenameStemAndExtension(filename);
    if (normalizedSequence <= 0) {
      return `${stem}${extension}`;
    }
    return `${stem}.${normalizedSequence}${extension}`;
  }

  root.exportUtils = Object.freeze({
    sanitizeNativeFilename,
    normalizeNativeSubdirectory,
    isLikelyFileAlreadyExistsError,
    isNativePhotoLibraryExportMimeType,
    splitFilenameStemAndExtension,
    buildNumberedFilename,
  });
})();
