import { presentMapEvent } from './map-event-presentation.mjs';
import { displayAdConfig } from '../../data/site-config.js?rev=20261008-map-detail-1';

const STRING_LIMITS = Object.freeze({
  id: 180, eventId: 180, name: 200, title: 200, startDate: 40, endDate: 40, startAt: 64, endAt: 64,
  startDateTime: 64, endDateTime: 64, start: 64, end: 64, date: 40,
  timeZone: 80, timezone: 80, tz: 80, dateLabel: 240, status: 64, sourceUrl: 2048, url: 2048,
  website: 2048, detailUrl: 2048, description: 3000, detail: 3000, venue: 300, location: 300, area: 200, prefecture: 120, country: 120,
  sourceLabel: 200, checkedAt: 80, time: 120, timeLabel: 120, fee: 300, conditions: 500,
  entryInfo: 500
});
const ARRAY_LIMITS = Object.freeze({ ticketUrls: 12, additionalUrls: 12, socialUrls: 12, organizer: 12, organizers: 12, tags: 24 });
const SIMPLE_ARRAYS = new Set(['organizer', 'organizers', 'tags']);
const URL_ARRAYS = new Set(['ticketUrls', 'additionalUrls', 'socialUrls']);
const todayTokyo = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

function safeHttps(value) {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === '' ? url.href : '';
  } catch { return ''; }
}

function boundedString(value, limit) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

/** Copy a bounded set of public-catalog fields; discard all unknown properties. */
export function validatePublicMapEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const event = {};
  for (const [key, limit] of Object.entries(STRING_LIMITS)) {
    const text = boundedString(value[key], limit);
    if (text) event[key] = key.endsWith('Url') || key === 'url' || key === 'website' ? safeHttps(text) : text;
  }
  if (typeof value.allDay === 'boolean') event.allDay = value.allDay;
  if (typeof value.watch === 'boolean') event.watch = value.watch;
  for (const [key, max] of Object.entries(ARRAY_LIMITS)) {
    if (!Array.isArray(value[key])) continue;
    const items = value[key].slice(0, max).map((item) => {
      if (SIMPLE_ARRAYS.has(key)) return boundedString(item, 160);
      const source = typeof item === 'string' ? { url: item } : item;
      if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
      const url = safeHttps(source.url);
      if (!url) return null;
      const label = boundedString(source.label || source.name, 120);
      return label ? { url, label } : url;
    }).filter((item) => item && (typeof item !== 'string' || item.length));
    if (items.length) event[key] = items;
  }
  if (!event.id && event.eventId) event.id = event.eventId;
  if (!event.sourceUrl) event.sourceUrl = event.detailUrl || event.url || event.website || '';
  if (!event.venue) event.venue = event.location || '';
  if (!event.description) event.description = event.detail || '';
  if (!event.id || !(event.name || event.title)) return null;
  return event;
}

export function isTrustedMapDetailMessage(event, iframe, win = globalThis.window) {
  return Boolean(event && iframe && win && event.source === iframe.contentWindow
    && typeof win.location?.origin === 'string' && event.origin === win.location.origin);
}

function element(doc, tag, className, text = '') {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function appendFact(doc, list, label, value) {
  if (!value) return;
  const term = element(doc, 'dt', '', label);
  const definition = element(doc, 'dd', '', value);
  list.append(term, definition);
}

function appendLinks(doc, root, links) {
  const safeLinks = links.map((item) => ({ href: safeHttps(item.href), label: boundedString(item.label, 160) }))
    .filter((item) => item.href && item.label);
  if (!safeLinks.length) return;
  const section = element(doc, 'section', 'map-event-detail__links');
  section.setAttribute('aria-label', 'イベント情報のリンク');
  for (const { href, label } of safeLinks) {
    const anchor = element(doc, 'a', '', label);
    anchor.href = href; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
    section.append(anchor);
  }
  root.append(section);
}

function renderEventDetail(doc, root, event, onClose) {
  root.replaceChildren();
  const presentation = presentMapEvent({ ...event, venue: event.venue || event.location, description: event.description || event.detail }, todayTokyo());
  root.dataset.eventId = event.id;
  root.dataset.eventPeriod = presentation.period;
  const header = element(doc, 'header', 'map-event-detail__header');
  const status = element(doc, 'p', 'map-event-detail__status', presentation.status);
  const title = element(doc, 'h2', 'map-event-detail__title', presentation.title);
  title.tabIndex = -1; title.id = 'map-event-detail-title';
  root.setAttribute('aria-labelledby', title.id);
  const close = element(doc, 'button', 'map-event-detail__close', '一覧に戻る');
  close.type = 'button';
  close.addEventListener('click', onClose);
  header.append(status, title);
  root.append(close, header);
  if (presentation.date) root.append(element(doc, 'p', 'map-event-detail__date', presentation.date));
  const facts = element(doc, 'dl', 'map-event-detail__facts');
  appendFact(doc, facts, '会場', presentation.venue);
  appendFact(doc, facts, '地域', presentation.area);
  appendFact(doc, facts, '料金', presentation.fee);
  appendFact(doc, facts, '参加条件', presentation.conditions);
  appendFact(doc, facts, '主催', presentation.organizer.join('・'));
  appendFact(doc, facts, 'タグ', presentation.tags.join('・'));
  if (facts.childNodes.length) root.append(facts);
  if (presentation.description) root.append(element(doc, 'p', 'map-event-detail__description', presentation.description));
  appendLinks(doc, root, presentation.links);
  const source = [presentation.sourceLabel, presentation.checkedAt ? `確認日：${presentation.checkedAt}` : ''].filter(Boolean).join(' · ');
  if (source) root.append(element(doc, 'p', 'map-event-detail__source', source));
  const calendar = element(doc, 'div', 'map-event-detail__calendar-slot');
  calendar.setAttribute('aria-busy', 'true');
  const calendarPending = element(doc, 'p', 'map-event-detail__calendar-status', 'カレンダー操作を準備しています…');
  calendarPending.setAttribute('role', 'status');
  calendar.append(calendarPending);
  root.append(calendar);
  return calendar;
}

/** Host the selected public event in the top-level document, never in the map iframe. */
export function createMapEventDetailHost({ doc = globalThis.document, win = globalThis.window,
  iframe = doc?.querySelector?.('#globeFrame'), host = doc?.querySelector?.('#mapEventDetailHost'),
  detail = doc?.querySelector?.('#mapEventDetail'), ad = doc?.querySelector?.('#mapDetailAd'),
  createCalendarSection, loadAds = () => import('../display-ads.mjs?rev=20261008-map-detail-1') } = {}) {
  if (!doc || !win || !iframe || !host || !detail || !ad) return { dispose() {} };
  let ready = false, currentEventId = '', disposed = false, adMounted = false, adFailed = false, adCleanup = null, adsModulePromise, calendarModule;
  let calendarPromise, returnScroll = null;
  const main = doc.querySelector?.('#main');
  function backToList() {
    if (ready) iframe.contentWindow?.postMessage({ type: 'pixieed:map-event-detail-command', command: 'back' }, win.location.origin);
  }
  function onKeydown(event) {
    if (event.key === 'Escape' && !host.hidden) { event.preventDefault(); backToList(); }
  }

  function sendHostReady() {
    if (!disposed && iframe.contentWindow) {
      try { iframe.contentWindow.postMessage({ type: 'pixieed:map-event-detail-host-ready', layout: win.matchMedia?.('(min-width: 901px)').matches ? 'wide' : 'compact' }, win.location.origin); } catch { /* frame may be navigating */ }
    }
  }

  function hideDetail() {
    const hadDetailFocus = host.contains?.(doc.activeElement);
    currentEventId = '';
    host.hidden = true;
    detail.hidden = true;
    detail.replaceChildren();
    ad.hidden = true;
    if (hadDetailFocus) iframe.focus?.({ preventScroll: true });
    if (returnScroll) {
      if (main) main.scrollTop = returnScroll.main;
      if (doc.scrollingElement) doc.scrollingElement.scrollTop = returnScroll.page;
      returnScroll = null;
    }
  }

  function canUseMapAd() {
    return win.top === win.self && ['http:', 'https:'].includes(win.location?.protocol)
      && /^ca-pub-\d{16}$/.test(displayAdConfig?.client || '')
      && typeof displayAdConfig?.slots?.['map-detail'] === 'string'
      && /^\d{6,20}$/.test(displayAdConfig.slots['map-detail'].trim())
      && String(win.location?.pathname || '').replace(/\/index\.html$/, '/') === '/globe/';
  }

  function mountAd() {
    if (adMounted || !canUseMapAd()) return;
    adsModulePromise ||= Promise.resolve().then(loadAds);
    adsModulePromise.then((module) => {
      if (disposed || !currentEventId || host.hidden || adMounted || !canUseMapAd()) return;
      // Set the marker only after the lazy module is available and a real detail is visible,
      // so the module's document initializer cannot create an idle/blank unit at startup.
      ad.dataset.displayAd = 'map-detail';
      adCleanup = module?.mountDisplayAds?.({ root: doc, win }) || null;
      adMounted = true;
    }).catch(() => {
      // Event details remain usable when optional ad setup is unavailable.
      adFailed = true;
      delete ad.dataset.displayAd;
      ad.hidden = true;
    });
  }

  function render(event) {
    const safeEvent = validatePublicMapEvent(event);
    if (!safeEvent) { hideDetail(); return; }
    const changedEvent = currentEventId !== safeEvent.id;
    if (!currentEventId) returnScroll = { main: main?.scrollTop || 0, page: doc.scrollingElement?.scrollTop || 0 };
    currentEventId = safeEvent.id;
    host.hidden = false;
    detail.hidden = false;
    try {
      const calendarSlot = renderEventDetail(doc, detail, safeEvent, backToList);
      if (changedEvent && win.matchMedia?.('(max-width: 900px)').matches) host.scrollIntoView?.({ block: 'start', behavior: 'instant' });
      if (changedEvent) { host.scrollTop = 0; detail.querySelector?.('.map-event-detail__title')?.focus?.({ preventScroll: true }); }
      ad.hidden = !canUseMapAd() || adFailed || ad.dataset.adState === 'empty';
      mountAd();
      const makeCalendar = createCalendarSection || ((args) => {
        if (!calendarModule) return null;
        return calendarModule.createEventCalendarSection(args);
      });
      calendarPromise ||= import('./event-calendar-ui.mjs').then((module) => { calendarModule = module; return module; }).catch(() => null);
      calendarPromise.then(() => {
        if (!disposed && currentEventId === safeEvent.id && calendarSlot.isConnected) {
          try {
            const section = makeCalendar({ event: safeEvent, doc });
            if (section) {
              calendarSlot.replaceChildren(section);
              calendarSlot.setAttribute('aria-busy', 'false');
            } else {
              showCalendarError(calendarSlot);
            }
          } catch { showCalendarError(calendarSlot); }
        }
      });
    } catch {
      const error = element(doc, 'p', 'map-event-detail__error', 'イベント詳細を表示できませんでした。地図からもう一度選んでください。');
      error.setAttribute('role', 'alert');
      detail.replaceChildren(error);
      ad.hidden = true;
    }
  }

  function showCalendarError(calendarSlot) {
    const status = element(doc, 'p', 'map-event-detail__calendar-status', 'カレンダー操作を読み込めませんでした。イベント情報は引き続き確認できます。');
    status.setAttribute('role', 'status');
    calendarSlot.replaceChildren(status);
    calendarSlot.setAttribute('aria-busy', 'false');
  }

  function onMessage(message) {
    if (!isTrustedMapDetailMessage(message, iframe, win) || !message.data || typeof message.data !== 'object') return;
    if (message.data.type === 'pixieed:map-event-detail-ready') {
      ready = true; sendHostReady(); return;
    }
    if (!ready || message.data.type !== 'pixieed:map-event-detail') return;
    if (message.data.event === null) { hideDetail(); return; }
    render(message.data.event);
  }
  function onFrameLoad() { ready = true; hideDetail(); sendHostReady(); }
  doc.addEventListener?.('keydown', onKeydown);
  win.addEventListener('message', onMessage);
  win.addEventListener('resize', sendHostReady);
  iframe.addEventListener('load', onFrameLoad);
  sendHostReady();
  return { dispose() { disposed = true; adCleanup?.(); doc.removeEventListener?.('keydown', onKeydown); win.removeEventListener('resize', sendHostReady); win.removeEventListener('message', onMessage); iframe.removeEventListener('load', onFrameLoad); } };
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') createMapEventDetailHost();
