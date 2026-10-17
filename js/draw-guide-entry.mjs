/** Keep old guide bookmarks, query values, and history semantics on static hosting. */
export function drawGuideDestination(search = '', hash = '') {
  const sections = {
    '#draw-save': '#draw-save', '#tool-save-title': '#draw-save',
    '#draw-formats-title': '#draw-save',
    '#draw-faq': '#draw-faq', '#tool-faq-title': '#draw-faq',
    '#draw-faq-title': '#draw-faq', '#draw-title': '#tool-title',
    '#draw-try': '#draw-tool', '#draw-embed-title': '#draw-tool',
    '#draw-how-title': '#draw-how-to', '#tool-how-title': '#draw-how-to',
  };
  return `/draw/${search}${sections[hash] || hash || '#draw-how-to'}`;
}

if (typeof document !== 'undefined') {
  const destination = drawGuideDestination(location.search, location.hash);
  const link = document.querySelector('[data-draw-guide-link]');
  if (link) link.href = destination;
  location.replace(destination);
}
