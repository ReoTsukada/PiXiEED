/** Recognize only the historical editor roots, never arbitrary return URLs. */
export function editorEntry(pathname) {
  const path = String(pathname).replace(/\/index\.html$/i, '').replace(/\/$/, '').toLowerCase();
  if (path === '/pixieedraw') return { modern: true, path: '/draw/' };
  if (path === '/pixiedraw') return { modern: false, path: '/pixiedraw/' };
  if (path === '/pixiedraw2') return { modern: false, path: '/pixiedraw2/' };
  if (path === '/studio') return { modern: false, path: '/studio/' };
  return null;
}

if (typeof document !== 'undefined') {
  const entry = editorEntry(location.pathname);
  if (entry) {
    const suffix = location.search + location.hash;
    const link = document.querySelector('[data-current-editor]');
    if (link) link.href = '/draw/' + suffix;
    if (entry.modern) location.replace('/draw/' + suffix);
    else if (document.body.dataset.editorFallback === 'true') location.replace(entry.path + suffix);
  }
}
