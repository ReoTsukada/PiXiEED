import { readEventCatalog, safeEventSource } from './globe/event-catalog.mjs?v=20261005-event-research-1';
import { classifyEvent, eventDates, matchesEventPeriod, sortEventsByDisplayPriority, uniqueEventEditions } from './globe/event-density.mjs';

const controls = document.querySelector('#exploreModes');
const posts = document.querySelector('#explorePosts');
const events = document.querySelector('#exploreEvents');
const map = document.querySelector('#exploreMap');
const frame = document.querySelector('#exploreMapFrame');
const periods = document.querySelector('#exploreEventPeriod');
const cards = document.querySelector('#exploreEventCards');
const status = document.querySelector('#exploreEventStatus');
const retry = document.querySelector('#exploreEventRetry');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const labels = { active: '開催中', upcoming: '開催予定', past: '終了', watch: '次回情報待ち', unknown: '日程未定', postponed: '延期', cancelled: '中止' };
let current;
let activePanel;
let animation;
let period = 'all';
let catalogPromise;

function showStatus(message) {
  status.textContent = message;
  status.hidden = !message;
}

async function directoryJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error('Event directory unavailable');
  return response.json();
}

function loadCatalog() {
  catalogPromise ||= Promise.all([
    directoryJson('/data/pixel-art-events.json'),
    directoryJson('/events/catalog.json').catch(() => null)
  ]).then(([catalog, directory]) => ({
    records: sortEventsByDisplayPriority(uniqueEventEditions(readEventCatalog(catalog))),
    ids: new Set(directory?.version === 1 && Array.isArray(directory.ids) ? directory.ids : [])
  })).catch(error => { catalogPromise = null; throw error; });
  return catalogPromise;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

function eventCard(event, ids) {
  const card = element('article', 'post-card explore-event-card');
  const starts = eventDates(event)?.start;
  const date = event.dateLabel || starts || '日程未定';
  const place = [event.prefecture, event.venue || event.area].filter(Boolean).join(' · ');
  const head = element('header', 'post-header');
  const icon = element('img', 'post-avatar explore-event-icon');
  icon.src = '/assets/icons/pixieed/now.svg';
  icon.alt = '';
  const meta = element('div', 'post-author');
  meta.append(element('strong', '', event.prefecture || event.country || 'イベント'), element('small', '', date));
  head.append(icon, meta);

  const preview = element('div', 'post-media explore-event-preview');
  preview.append(element('span', 'post-type-badge', labels[classifyEvent(event)]));
  if (starts) {
    const [year, month, day] = starts.split('-');
    const stamp = element('time', 'explore-event-date');
    stamp.dateTime = starts;
    stamp.append(element('small', '', year), element('strong', '', `${Number(month)}.${Number(day)}`));
    preview.append(stamp);
  } else {
    const calendar = icon.cloneNode();
    calendar.className = 'explore-event-calendar';
    preview.append(calendar);
  }

  const title = element('h2', 'post-compact-title', event.name);
  title.title = event.name;
  const caption = element('p', 'post-compact-caption', place || event.description);
  const footer = element('footer', 'explore-event-actions');
  const href = ids.has(event.id) ? `/events/${encodeURIComponent(event.id)}/` : safeEventSource(event.sourceUrl);
  if (href) {
    const detail = element('a', 'explore-search-toggle');
    detail.href = href;
    detail.setAttribute('aria-label', `${event.name}の詳細`);
    detail.title = '詳細';
    detail.textContent = 'ⓘ';
    footer.append(detail);
  }
  card.append(head, preview, title, caption, footer);
  return card;
}

let renderRequest = 0;
async function renderEvents() {
  const request = ++renderRequest;
  retry.hidden = true;
  if (!cards.childElementCount) showStatus('イベントを読み込んでいます…');
  try {
    const { records, ids } = await loadCatalog();
    if (request !== renderRequest) return;
    const matches = records.filter(event => matchesEventPeriod(event, period));
    cards.replaceChildren(...matches.map(event => eventCard(event, ids)));
    showStatus(matches.length ? '' : 'この開催時期のイベントはありません。');
  } catch {
    if (request !== renderRequest) return;
    showStatus('イベント一覧を読み込めませんでした。');
    retry.hidden = false;
  }
}

function readMode() {
  const params = new URLSearchParams(location.search);
  return { content: params.get('content') === 'events' ? 'events' : 'posts', layout: params.get('layout') === 'map' ? 'map' : 'list' };
}

function syncMap() {
  frame.contentWindow?.postMessage({ type: 'pixieed:explore-map-layer', layer: current.content }, location.origin);
}

function showMode(mode, { push = false, animate = false } = {}) {
  if (current?.content === mode.content && current.layout === mode.layout) return;
  current = mode;
  if (push) {
    const url = new URL(location.href);
    if (mode.content === 'events') url.searchParams.set('content', 'events');
    else url.searchParams.delete('content');
    if (mode.layout === 'map') url.searchParams.set('layout', 'map');
    else url.searchParams.delete('layout');
    history.pushState(history.state, '', url);
  }
  const nextPanel = mode.layout === 'map' ? map : mode.content === 'events' ? events : posts;
  const switchedPanel = activePanel !== nextPanel;
  animation?.cancel();
  document.body.dataset.exploreLayout = mode.layout;
  document.body.dataset.exploreContent = mode.content;
  controls.querySelectorAll('button').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.exploreContent === mode.content || button.dataset.exploreLayout === mode.layout));
  });
  [posts, events, map].forEach(panel => { panel.hidden = panel !== nextPanel; });
  if (nextPanel === events && !cards.childElementCount) void renderEvents();
  if (nextPanel === map) {
    if (!frame.hasAttribute('src')) frame.src = `/globe-prototype.html?embed=1&explore=1&layer=${mode.content}&rev=20261128-explore-modes-1`;
    else syncMap();
  }
  if (animate && !reducedMotion.matches && typeof nextPanel.animate === 'function') {
    const start = switchedPanel ? { opacity: .65, transform: 'translateY(4px)' } : { opacity: .84 };
    animation = nextPanel.animate([start, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'ease-out' });
  }
  activePanel = nextPanel;
}

controls.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  showMode({ content: button.dataset.exploreContent || current.content, layout: button.dataset.exploreLayout || current.layout }, { push: true, animate: true });
});
periods.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.value === period) return;
  period = button.value;
  for (const item of periods.querySelectorAll('button')) item.setAttribute('aria-pressed', String(item === button));
  void renderEvents();
});
retry.addEventListener('click', renderEvents);
frame.addEventListener('load', syncMap);
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.type !== 'pixieed:explore-map-layer-changed') return;
  if (current.layout === 'map' && ['posts', 'events'].includes(event.data.layer)) {
    showMode({ ...current, content: event.data.layer }, { push: true });
  }
});
window.addEventListener('popstate', () => showMode(readMode(), { animate: true }));
showMode(readMode());
