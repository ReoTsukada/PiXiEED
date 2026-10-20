const form = document.querySelector('#catalog-filters');
const grid = document.querySelector('[data-product-grid]');
document.documentElement.classList.add('books-catalog-js');
if (form && grid) {
  document.body.classList.add('catalog-enhanced');
  const cards = [...grid.querySelectorAll('[data-product-id]')];
  const query = form.querySelector('[name="q"]');
  const format = form.querySelector('[name="format"]');
  const sort = form.querySelector('[name="sort"]');
  const moreFilters = document.querySelector('#catalog-more-filters');
  const extraFilterSummary = document.querySelector('[data-extra-filter-summary]');
  const filterStatus = document.querySelector('.catalog-filter-status');
  const categoryButtons = [...form.querySelectorAll('[data-category-filter]')];
  const validCategories = new Set(categoryButtons.map(button => button.dataset.categoryFilter));
  const count = document.querySelector('[data-product-count]');
  const empty = document.querySelector('[data-empty-state]');
  const normalize = text => String(text ?? '').normalize('NFKC').toLocaleLowerCase('ja');
  let selectedCategory = 'all';
  let syncingLocation = false;
  const originalOrder = new Map(cards.map((card, index) => [card, index]));

  function updateCategoryCounts() {
    const enabled = cards.filter(card => card.dataset.catalogDisabled !== 'true');
    categoryButtons.forEach(button => {
      const category = button.dataset.categoryFilter;
      const total = category === 'all' ? enabled.length : enabled.filter(card => card.dataset.category === category).length;
      const countLabel = button.querySelector('[data-category-count]');
      if (countLabel) countLabel.textContent = String(total);
      button.setAttribute('aria-label', `${button.dataset.categoryLabel} ${total}件`);
      button.disabled = total === 0;
      if (button.disabled && category === selectedCategory) selectedCategory = 'all';
    });
    categoryButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.categoryFilter === selectedCategory)));
  }

  function updateFormats(preserve = true) {
    const selected = preserve ? format.value : 'all';
    const available = new Set(cards.filter(card => !card.dataset.catalogDisabled && (selectedCategory === 'all' || card.dataset.category === selectedCategory)).map(card => card.dataset.format).filter(Boolean));
    format.replaceChildren(new Option('すべて', 'all'));
    [...available].sort((a, b) => a.localeCompare(b, 'ja')).forEach(value => format.add(new Option(value, value)));
    format.value = available.has(selected) ? selected : 'all';
  }

  function readLocation() {
    const params = new URLSearchParams(location.search);
    const category = params.get('category');
    syncingLocation = true;
    query.value = params.get('q') || '';
    selectedCategory = validCategories.has(category) && !categoryButtons.find(button => button.dataset.categoryFilter === category)?.disabled ? category : 'all';
    categoryButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.categoryFilter === selectedCategory)));
    sort.value = params.get('sort') === 'name' ? 'name' : 'listed';
    updateFormats(false);
    const requestedFormat = params.get('format');
    if ([...format.options].some(option => option.value === requestedFormat)) format.value = requestedFormat;
    if (moreFilters) moreFilters.open = false;
    syncingLocation = false;
  }

  function writeLocation() {
    if (syncingLocation) return;
    const params = new URLSearchParams(location.search);
    for (const key of ['q', 'category', 'format', 'sort']) params.delete(key);
    if (query.value.trim()) params.set('q', query.value.trim());
    if (selectedCategory !== 'all') params.set('category', selectedCategory);
    if (format.value !== 'all') params.set('format', format.value);
    if (sort.value !== 'listed') params.set('sort', sort.value);
    const search = params.toString();
    const nextUrl = `${location.pathname}${search ? `?${search}` : ''}${location.hash}`;
    history.replaceState(history.state, '', nextUrl);
  }

  function applyFilters({ updateUrl = true } = {}) {
    const terms = normalize(query.value.trim()).split(/\s+/u).filter(Boolean);
    const selectedFormat = format.value;
    const visible = cards.filter(card => {
      const text = normalize([card.dataset.title, card.dataset.description, card.dataset.author, card.dataset.publisher, card.dataset.format, card.dataset.relatedSearch].join(' '));
      return !card.dataset.catalogDisabled
        && (selectedCategory === 'all' || card.dataset.category === selectedCategory)
        && (selectedFormat === 'all' || card.dataset.format === selectedFormat)
        && terms.every(term => text.includes(term));
    });
    cards.forEach(card => { card.hidden = !visible.includes(card); });
    const ordered = [...cards].sort((a, b) => sort.value === 'name'
      ? a.dataset.title.localeCompare(b.dataset.title, 'ja')
      : originalOrder.get(a) - originalOrder.get(b));
    const currentOrder = [...grid.querySelectorAll('[data-product-id]')];
    if (ordered.some((card, index) => card !== currentOrder[index])) {
      ordered.forEach(card => grid.append(card));
    }
    count.textContent = `${visible.length}件`;
    empty.hidden = visible.length > 0;
    const active = Boolean(query.value.trim() || selectedCategory !== 'all' || format.value !== 'all' || sort.value !== 'listed');
    const summary = document.querySelector('[data-filter-summary]');
    const reset = document.querySelector('[data-reset-filters]');
    const extraParts = [];
    if (selectedCategory !== 'all') extraParts.push(categoryButtons.find(button => button.dataset.categoryFilter === selectedCategory)?.dataset.categoryLabel || selectedCategory);
    if (format.value !== 'all') extraParts.push(format.value);
    if (sort.value !== 'listed') extraParts.push('名前順');
    if (!extraParts.length && query.value.trim()) extraParts.push('検索中');
    if (extraFilterSummary) extraFilterSummary.textContent = extraParts.join(' · ') || '指定なし';
    if (filterStatus) filterStatus.hidden = !active;
    if (summary) {
      const labels = [];
      if (query.value.trim()) labels.push(`検索: ${query.value.trim()}`);
      if (selectedCategory !== 'all') labels.push(categoryButtons.find(button => button.dataset.categoryFilter === selectedCategory)?.dataset.categoryLabel || selectedCategory);
      if (format.value !== 'all') labels.push(format.value);
      if (sort.value !== 'listed') labels.push('名前順');
      summary.textContent = active ? `絞り込み中：${labels.join(' · ')}` : '';
    }
    if (reset) reset.hidden = !active;
    if (updateUrl) writeLocation();
  }

  const detailDialog = document.querySelector('#product-detail');
  const detailBody = detailDialog?.querySelector('[data-detail-body]');
  const detailClose = detailDialog?.querySelector('[data-detail-close]');
  const detailCards = new Map(cards.map(card => [card.dataset.productId, card]));
  const detailToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let manifestReady = false;
  let activeDetailId = '';
  let activeTrigger = null;
  let pendingTrigger = null;
  let savedScrollY = 0;
  let savedBodyStyle = null;

  function currentProductId() {
    if (!location.hash.startsWith('#product=')) return '';
    try { return decodeURIComponent(location.hash.slice('#product='.length)); } catch { return ''; }
  }

  function renderDetail(card) {
    if (!detailBody || !card) return;
    const image = card.querySelector('.product-card__image');
    const body = card.querySelector('.product-card__body');
    const fragment = document.createDocumentFragment();
    [image, body].filter(Boolean).forEach(source => {
      const clone = source.cloneNode(true);
      clone.querySelectorAll('[data-product-details]').forEach(button => button.remove());
      clone.removeAttribute('id');
      clone.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
      fragment.append(clone);
    });
    detailBody.replaceChildren(fragment);
    detailDialog.classList.toggle('product-detail--no-image', !card.dataset.imageSrc);
    const relatedOffers = detailBody.querySelector('[data-related-offers]');
    if (relatedOffers?.querySelector('[data-yahoo-commerce-link]:not([hidden])')) relatedOffers.hidden = false;
    const title = detailBody.querySelector('h3');
    if (title) {
      const heading = document.createElement('h2');
      heading.id = 'product-detail-title';
      heading.textContent = title.textContent;
      title.replaceWith(heading);
    }
    const readyLink = detailBody.querySelector('[data-commerce-link]:not([hidden]), [data-yahoo-commerce-link]:not([hidden])');
    const gate = detailDialog.querySelector('.product-detail__gate');
    const notice = detailDialog.querySelector('.product-detail__notice');
    if (gate) gate.hidden = Boolean(readyLink);
    if (notice) notice.hidden = !readyLink;
  }

  function freezePage() {
    if (savedBodyStyle) return;
    savedScrollY = window.scrollY;
    savedBodyStyle = new Map(['position', 'top', 'left', 'right', 'width', 'overflow'].map(property => [property, {
      value: document.body.style.getPropertyValue(property), priority: document.body.style.getPropertyPriority(property),
    }]));
    document.body.style.setProperty('position', 'fixed');
    document.body.style.setProperty('top', `${-savedScrollY}px`);
    document.body.style.setProperty('left', '0');
    document.body.style.setProperty('right', '0');
    document.body.style.setProperty('width', '100%');
    document.body.style.setProperty('overflow', 'hidden');
  }

  function restorePage() {
    if (!savedBodyStyle) return;
    for (const [property, previous] of savedBodyStyle) {
      if (previous.value) document.body.style.setProperty(property, previous.value, previous.priority);
      else document.body.style.removeProperty(property);
    }
    savedBodyStyle = null;
    window.scrollTo(0, savedScrollY);
  }

  function closeDetailNow() {
    if (detailDialog?.open) detailDialog.close();
    detailBody?.replaceChildren();
    activeDetailId = '';
    restorePage();
    const trigger = activeTrigger;
    activeTrigger = null;
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  }

  function syncDetailFromLocation() {
    readLocation();
    updateFormats();
    applyFilters({ updateUrl: false });
    if (!manifestReady || !detailDialog || !detailBody) return;
    const id = currentProductId();
    if (!id) {
      if (detailDialog.open || activeDetailId) closeDetailNow();
      return;
    }
    const card = detailCards.get(id);
    if (!card || card.dataset.catalogDisabled === 'true') {
      if (detailDialog.open || activeDetailId) closeDetailNow();
      return;
    }
    if (activeDetailId === id && detailDialog.open) { renderDetail(card); return; }
    if (detailDialog.open) detailDialog.close();
    activeDetailId = id;
    activeTrigger = pendingTrigger?.dataset.productDetails === id ? pendingTrigger : document.querySelector(`[data-product-details="${CSS.escape(id)}"]`);
    pendingTrigger = null;
    freezePage();
    renderDetail(card);
    if (!detailDialog.open) detailDialog.showModal();
    detailClose?.focus({ preventScroll: true });
  }

  function closeDetailByUser() {
    const routeIsDetail = Boolean(currentProductId());
    const entry = history.state?.__booksCatalogDetail;
    if (routeIsDetail && entry?.id === activeDetailId && entry.token === detailToken) { history.back(); return; }
    if (routeIsDetail) history.replaceState(history.state, '', `${location.pathname}${location.search}`);
    closeDetailNow();
  }

  readLocation();
  updateFormats();
  applyFilters({ updateUrl: false });
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-product-details]');
    if (!trigger || !detailDialog || !detailBody || !manifestReady) return;
    const id = trigger.dataset.productDetails;
    const card = detailCards.get(id);
    if (!card || card.dataset.catalogDisabled === 'true') return;
    event.preventDefault();
    pendingTrigger = trigger;
    const state = history.state && typeof history.state === 'object' && !Array.isArray(history.state) ? { ...history.state } : {};
    state.__booksCatalogDetail = { id, token: detailToken };
    history.pushState(state, '', `${location.pathname}${location.search}#product=${encodeURIComponent(id)}`);
    syncDetailFromLocation();
  });
  window.addEventListener('popstate', syncDetailFromLocation);
  window.addEventListener('hashchange', syncDetailFromLocation);
  detailClose?.addEventListener('click', closeDetailByUser);
  detailDialog?.addEventListener('cancel', event => { event.preventDefault(); closeDetailByUser(); });
  detailDialog?.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...detailDialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]')].filter(element => element.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    if (first && ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last))) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus({ preventScroll: true });
    }
  });
  document.addEventListener('books:commerce-ready', () => { if (activeDetailId && detailDialog?.open) renderDetail(detailCards.get(activeDetailId)); });
  document.addEventListener('books:manifest-updated', () => {
    manifestReady = true;
    cards.forEach(card => { const button = card.querySelector('[data-product-details]'); if (button) button.hidden = card.dataset.catalogDisabled === 'true'; });
    updateCategoryCounts();
    updateFormats();
    if (activeDetailId && detailCards.get(activeDetailId)?.dataset.catalogDisabled === 'true') closeDetailNow();
    else syncDetailFromLocation();
  });
  moreFilters?.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !moreFilters.open) return;
    event.preventDefault();
    moreFilters.open = false;
    moreFilters.querySelector('summary')?.focus({ preventScroll: true });
  });
  moreFilters?.addEventListener('focusout', event => {
    if (moreFilters.open && !moreFilters.contains(event.relatedTarget)) moreFilters.open = false;
  });
  document.addEventListener('pointerdown', event => {
    if (moreFilters?.open && !moreFilters.contains(event.target)) moreFilters.open = false;
  });
  categoryButtons.forEach(button => button.addEventListener('click', () => {
    selectedCategory = button.dataset.categoryFilter;
    categoryButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    updateFormats();
    applyFilters();
  }));
  query.addEventListener('input', () => applyFilters());
  format.addEventListener('change', () => applyFilters());
  sort.addEventListener('change', () => applyFilters());
  form.addEventListener('submit', event => { event.preventDefault(); applyFilters(); });
  document.querySelector('[data-clear-search]')?.addEventListener('click', () => { query.value = ''; applyFilters(); query.focus(); });
  document.querySelectorAll('[data-reset-filters]').forEach(button => button.addEventListener('click', () => {
    query.value = '';
    selectedCategory = 'all';
    categoryButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.categoryFilter === 'all')));
    updateFormats(false);
    sort.value = 'listed';
    applyFilters();
    if (moreFilters) moreFilters.open = false;
    query.focus();
  }));
  updateCategoryCounts();
  syncDetailFromLocation();
  form.hidden = false;
}
