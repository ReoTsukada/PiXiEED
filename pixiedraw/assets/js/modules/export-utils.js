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

  root.exportUtils = Object.freeze({
    sanitizeNativeFilename,
  });
})();
