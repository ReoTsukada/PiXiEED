/** Optional client-side filter. No query strings, storage or analytics for search text. */
export function normalizeGuideQuery(value) { return String(value || '').normalize('NFKC').trim().toLowerCase().replace(/^\./, ''); }
export function bindGuideFilter(doc = document) {
  const box = doc.querySelector('[data-format-search]'), input = doc.querySelector('[data-format-filter]');
  if (!box || !input) return;
  const cards = [...doc.querySelectorAll('[data-format-card]')];
  const index = cards.map(card => ({ card, text: normalizeGuideQuery(card.textContent) }));
  const count = doc.querySelector('[data-format-count]'), empty = doc.querySelector('[data-format-empty]');
  const update = () => {
    const terms = normalizeGuideQuery(input.value).split(/\s+/).filter(Boolean); let visible = 0;
    for (const item of index) { item.card.hidden = !terms.every(term => item.text.includes(term)); if (!item.card.hidden) visible++; }
    if (count) count.textContent = `${cards.length}形式中 ${visible}形式を表示`;
    if (empty) empty.hidden = visible > 0;
  };
  box.hidden = false; input.addEventListener('input', update); update();
}
if (typeof document !== 'undefined') bindGuideFilter();
