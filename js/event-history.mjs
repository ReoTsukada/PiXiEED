const form = document.querySelector('[data-event-filters]');
if (form) {
  const cards = [...document.querySelectorAll('[data-event-card]')];
  const sections = [...document.querySelectorAll('[data-event-year-section]')];
  const result = document.querySelector('[data-event-result]');
  const yearLinks = [...document.querySelectorAll('.event-year-nav a[href^="#event-year-"]')];
  const queryInput = form.querySelector('[data-event-query]');
  const statusInput = form.querySelector('[data-event-status-filter]');
  const formatInput = form.querySelector('[data-event-format-filter]');
  const regionInput = form.querySelector('[data-event-region-filter]');

  const normalize = (value) => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ja').trim();
  const applyFilters = () => {
    const query = normalize(queryInput?.value);
    const status = statusInput?.value || 'all';
    const format = formatInput?.value || 'all';
    const region = regionInput?.value || 'all';
    let visibleCount = 0;

    for (const card of cards) {
      const state = card.dataset.status;
      const matchesStatus = status === 'all'
        || (status === 'near' && ['active', 'upcoming'].includes(state))
        || (status === 'other' && !['active', 'upcoming', 'watch', 'ended'].includes(state))
        || state === status;
      const matchesQuery = !query || normalize(card.textContent).includes(query);
      const matchesFormat = format === 'all' || card.dataset.format === format;
      const matchesRegion = region === 'all' || card.dataset.region === region;
      card.hidden = !(matchesStatus && matchesQuery && matchesFormat && matchesRegion);
      if (!card.hidden) visibleCount += 1;
    }

    for (const section of sections) {
      const visibleInYear = section.querySelectorAll('[data-event-card]:not([hidden])').length;
      section.hidden = visibleInYear === 0;
      const link = yearLinks.find((item) => item.hash === `#${section.id}`);
      if (link) {
        link.hidden = section.hidden;
        const count = link.querySelector('[data-year-count]');
        if (count) count.textContent = String(visibleInYear);
      }
    }
    if (result) {
      result.hidden = false;
      result.textContent = `${cards.length}件中 ${visibleCount}件を表示`;
    }
  };

  form.addEventListener('submit', (event) => event.preventDefault());
  form.addEventListener('input', applyFilters);
  form.addEventListener('change', applyFilters);
  form.addEventListener('reset', () => setTimeout(applyFilters, 0));
  form.hidden = false;
  applyFilters();
}
