import { shouldShowEventArchiveAd } from './event-archive-ad-policy.mjs?rev=20261030-event-inline-ads-1';

const form = document.querySelector('[data-event-filters]');
if (form) {
  const cards = [...document.querySelectorAll('[data-event-card]')];
  const sections = [...document.querySelectorAll('[data-event-year-section]')];
  const adSlots = [...document.querySelectorAll('[data-event-ad-slot]')];
  const result = document.querySelector('[data-event-result]');
  const yearNav = document.querySelector('.event-year-nav');
  const yearLinks = [...(yearNav?.querySelectorAll('a') || [])];
  const queryInput = form.querySelector('[data-event-query]');
  const statusInput = form.querySelector('[data-event-status-filter]');
  const formatInput = form.querySelector('[data-event-format-filter]');
  const regionInput = form.querySelector('[data-event-region-filter]');
  const normalize = (value) => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ja').trim();
  const matchesState = (state, status) => status === 'all'
    || (status === 'near' && ['active', 'upcoming'].includes(state))
    || (status === 'other' && !['active', 'upcoming', 'watch', 'ended'].includes(state))
    || state === status;

  // Enhance the crawler-readable archive without removing any original facts or links.
  for (const card of cards) {
    const content = card.querySelector('[data-event-introduction], .event-card--hub-only');
    const facts = [...(content?.children || [])].filter(node => node.tagName === 'SPAN' && !node.className);
    facts[0]?.classList.add('event-card-date');
    facts[1]?.classList.add('event-card-location');
    if (content?.matches('a[data-event-introduction]')) {
      const detail = document.createElement('span');
      detail.className = 'event-card-detail';
      detail.textContent = '日程・会場・詳細を見る →';
      content.append(detail);
    }
  }

  const statusNav = document.createElement('div');
  statusNav.className = 'event-status-nav';
  statusNav.setAttribute('role', 'group');
  statusNav.setAttribute('aria-label', '開催状態で絞り込む');
  for (const [value, label] of [['near', '開催中・予定'], ['ended', '開催終了'], ['watch', '次回情報待ち'], ['all', 'すべて'], ['other', 'その他']]) {
    const count = cards.filter(card => matchesState(card.dataset.status, value)).length;
    if (value === 'other' && !count) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.eventStatus = value;
    button.textContent = `${label} ${count}件`;
    button.addEventListener('click', () => { statusInput.value = value; applyFilters(); });
    statusNav.append(button);
  }
  form.before(statusNav);
  if (statusInput) statusInput.closest('label').hidden = true;

  // Keep the first view short; the existing region/format facets remain one click away.
  const extraFilters = document.createElement('details');
  extraFilters.className = 'event-extra-filters';
  const extraSummary = document.createElement('summary');
  extraSummary.textContent = '地域・形式で絞り込む';
  extraFilters.append(extraSummary);
  for (const input of [regionInput, formatInput]) {
    const label = input?.closest('label');
    if (label) extraFilters.append(label);
  }
  form.insertBefore(extraFilters, form.querySelector('button[type="reset"]'));
  if (yearNav) {
    const years = document.createElement('details');
    years.className = 'event-year-picker';
    const summary = document.createElement('summary');
    summary.textContent = '開催年から探す';
    years.append(summary, yearNav);
    (result || form).after(years);
  }
  const introduction = document.querySelector('.event-index > .event-summary');
  const recordCount = document.querySelector('.event-index-count');
  if (introduction) {
    const about = document.createElement('details');
    about.className = 'event-index-about';
    const summary = document.createElement('summary');
    summary.textContent = '掲載情報・件数について';
    about.append(summary);
    introduction.before(about);
    about.append(introduction);
    if (recordCount) about.append(recordCount);
    // Keep the full editorial explanation available without delaying the event list.
    const compact = document.createElement('p');
    compact.className = 'event-index-intro';
    compact.textContent = '開催日・地域から、国内外のドット絵イベントを探せます。';
    about.before(compact);
    (document.querySelector('.event-year-picker') || result || form).after(about);
  }
  const empty = document.createElement('div');
  empty.className = 'event-empty';
  empty.hidden = true;
  const emptyText = document.createElement('p');
  emptyText.textContent = '条件に合うイベントはありません。キーワードや開催状態を変えてお探しください。';
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.textContent = 'すべての条件をクリア';
  clear.addEventListener('click', () => { form.reset(); queryInput?.focus(); });
  empty.append(emptyText, clear);
  (document.querySelector('.event-year-picker') || result || form).after(empty);

  function applyFilters() {
    const query = normalize(queryInput?.value);
    const status = statusInput?.value || 'all';
    const format = formatInput?.value || 'all';
    const region = regionInput?.value || 'all';
    let visibleCount = 0;
    for (const card of cards) {
      card.hidden = !(matchesState(card.dataset.status, status)
        && (!query || normalize(card.textContent).includes(query))
        && (format === 'all' || card.dataset.format === format)
        && (region === 'all' || card.dataset.region === region));
      if (!card.hidden) visibleCount += 1;
    }
    for (const section of sections) {
      const visibleInYear = section.querySelectorAll('[data-event-card]:not([hidden])').length;
      section.hidden = visibleInYear === 0;
      const link = yearLinks.find(item => item.hash === `#${section.id}`);
      if (link) {
        link.hidden = section.hidden;
        const count = link.querySelector('[data-year-count]');
        if (count) count.textContent = String(visibleInYear);
      }
    }
    for (const slot of adSlots) {
      const section = slot.closest('[data-event-year-section]');
      const visibleInYear = section?.querySelectorAll('[data-event-card]:not([hidden])').length || 0;
      slot.hidden = !shouldShowEventArchiveAd({
        status, query, format, region, visibleEventCount: visibleInYear,
        minimumVisibleEvents: Number(slot.dataset.eventAdMinVisible),
      });
    }
    const archiveEnd = document.querySelector('.event-index > .event-globe-link');
    const orderedSections = status === 'near'
      ? [...sections].sort((a, b) => a.dataset.eventYearSection.localeCompare(b.dataset.eventYearSection))
      : sections;
    if (archiveEnd) for (const section of orderedSections) archiveEnd.before(section);
    for (const button of statusNav.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.eventStatus === status));
    }
    extraSummary.textContent = `地域・形式で絞り込む${region !== 'all' || format !== 'all' ? '（条件あり）' : ''}`;
    empty.hidden = visibleCount !== 0;
    if (result) {
      result.hidden = false;
      result.textContent = `${cards.length}件中 ${visibleCount}件を表示`;
    }
  }

  function revealHashTarget() {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const target = id ? document.getElementById(id) : null;
    if (!target?.matches('[data-event-card], [data-event-year-section]')) return;
    form.reset();
    // reset dispatches before the browser restores form values.
    statusInput.value = 'all';
    queryInput.value = '';
    regionInput.value = 'all';
    formatInput.value = 'all';
    applyFilters();
    requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  }
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', applyFilters);
  form.addEventListener('change', applyFilters);
  form.addEventListener('reset', () => setTimeout(applyFilters, 0));
  window.addEventListener('hashchange', revealHashTarget);
  form.hidden = false;
  if (statusInput) statusInput.value = location.hash ? 'all' : 'near';
  applyFilters();
  revealHashTarget();
}
