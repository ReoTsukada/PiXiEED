import { mapConfig } from '../../data/site-config.js?rev=20261004-puzzle-share-1';
import { events as fallbackEvents } from '../../data/site-data.js?rev=20260924-no-samples-1';
import { JAPAN_PREFECTURES } from './hierarchy.mjs?v=20260920-g4-precision-1';
import { lookupCell } from './geometry.mjs?v=20261005-map-layers-1';

import { readEventCatalog, mergeEventCatalog, safeEventSource } from './event-catalog.mjs?v=20261005-event-research-1';
import { classifyEvent, DEFAULT_EVENT_PERIOD_FILTER, EVENT_PERIOD_OPTIONS, eventPeriodCounts, matchesEventPeriod, nextTokyoMidnightDelay, sortEventsByDisplayPriority, tokyoDate, uniqueEventEditions } from './event-density.mjs';

const CATALOG_URL = new URL('../../data/pixel-art-events.json', import.meta.url);
const CATALOG_REFRESH_MS = 15 * 60 * 1000;
const CACHE_KEY = 'PiXiEED:public-data-cache:v2';
const SESSION_KEY = 'PiXiEED:public-data-session-cache:v2';
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
const PREFECTURE_BY_NAME = new Map(JAPAN_PREFECTURES.flatMap(([code, name]) => [[name, code], [name.replace(/[都道府県]$/, ''), code]]));
const COUNTRY_ID_BY_NAME = new Map([
  ['オーストラリア', 'AUS'], ['オーストリア', 'AUT'], ['コロンビア', 'COL'], ['シンガポール', 'SGP'],
  ['スペイン', 'ESP'], ['チェコ', 'CZE'], ['ドイツ', 'DEU'], ['フランス', 'FRA'], ['ブラジル', 'BRA'],
  ['ポルトガル', 'PRT'], ['ポーランド', 'POL'], ['台湾', 'TWN'], ['日本', 'JPN']
]);

function prefectureCode(value) {
  const name = String(value || '').trim();
  return PREFECTURE_BY_NAME.get(name) || PREFECTURE_BY_NAME.get(name.replace(/[都道府県]$/, '')) || null;
}

function numericCoordinate(value, limit) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > limit) return null;
  return value;
}

function coordinatesOf(record) {
  const source = record?.location && typeof record.location === 'object'
    ? record.location
    : record?.mapAreaLocation && typeof record.mapAreaLocation === 'object'
      ? record.mapAreaLocation
      : record;
  const latitude = numericCoordinate(source?.latitude ?? source?.lat, 90);
  const longitude = numericCoordinate(source?.longitude ?? source?.lng ?? source?.lon, 180);
  return latitude === null || longitude === null ? null : { latitude, longitude };
}

function canonicalCellId(longitude, latitude) {
  try { return lookupCell(longitude, latitude)?.id || null; } catch { return null; }
}

function eventRegionName(event) {
  if (event?.countryLevel || event?.placement === 'country-unmapped') return [...new Set([event.countryLabel || event.country, event.city || event.area].filter(Boolean))].join(' · ');
  if (event?.mapRegionKind === 'country') return event.countryLabel || event.mapRegionLabel || event.country || '';
  if (event?.mapRegionKind === 'admin1') return [...new Set([event.countryLabel || event.country, event.mapRegionLabel].filter(Boolean))].join(' · ');
  return event?.prefectureLabel || event?.prefecture || event?.mapRegionLabel || event?.countryLabel || event?.country || '';
}

/** Normalize public event records without interpreting legacy SVG percentages as coordinates. */
export function normalizeMapEvents(records, representatives = [], resolveLocation = null, resolveCountry = null) {
  const representativeByPrefecture = new Map();
  for (const representative of representatives || []) {
    const code = String(representative?.prefectureId || '').padStart(2, '0');
    if (code && !representativeByPrefecture.has(code)) representativeByPrefecture.set(code, representative);
  }
  return (Array.isArray(records) ? records : []).flatMap(source => {
    if (!source || typeof source !== 'object') return [];
    const record = source;
    if (!String(record.name || record.title || '').trim()) return [];
    const venueCoordinates = coordinatesOf(record.location) || coordinatesOf(record.mapAreaLocation) || coordinatesOf({ latitude: record.latitude, longitude: record.longitude, lat: record.lat, lng: record.lng, lon: record.lon });
    const countryName = String(record.country || '').trim();
    const countryIdFromName = COUNTRY_ID_BY_NAME.get(countryName) || (/^[A-Z]{3}$/.test(countryName) ? countryName : null);
    const precise = venueCoordinates;
    let resolved = null;
    if (precise && typeof resolveLocation === 'function') {
      try { resolved = resolveLocation(precise.longitude, precise.latitude) || null; } catch { resolved = null; }
    }
    let countryOnly = null;
    if (!precise && countryIdFromName && typeof resolveCountry === 'function') {
      try { countryOnly = resolveCountry(countryIdFromName) || null; } catch { countryOnly = null; }
    }
    const explicitPrefectureId = prefectureCode(record.prefecture || record.area);
    const prefectureId = explicitPrefectureId || (resolved?.prefectureId && (!countryIdFromName || countryName === '日本') ? String(resolved.prefectureId).padStart(2, '0') : null);
    const prefectureLabel = prefectureId ? (JAPAN_PREFECTURES.find(([code]) => code === prefectureId)?.[1] || resolved?.prefectureLabel || record.prefecture || record.area || null) : null;
    const resolvedCountryId = resolved?.countryId || null;
    const resolvedMatchesCountry = !countryIdFromName || !resolvedCountryId || resolvedCountryId === countryIdFromName;
    const resolvedAdmin1 = countryName !== '日本' && resolvedMatchesCountry && resolved?.mapRegionKind === 'admin1';
    const countryAdmin1 = Boolean(countryIdFromName && countryName !== '日本' && resolvedAdmin1);
    if (countryIdFromName && countryName !== '日本' && precise && !resolvedAdmin1 && typeof resolveCountry === 'function') {
      try { countryOnly = resolveCountry(countryIdFromName) || null; } catch { countryOnly = null; }
    }
    const countryLevel = Boolean(countryIdFromName && countryName !== '日本' && !prefectureId && !resolvedAdmin1);
    const mapRegionId = prefectureId
      ? `prefecture:${prefectureId}`
      : countryLevel ? countryOnly?.mapRegionId || (countryOnly ? `country:${countryIdFromName}` : null) : resolvedMatchesCountry ? resolved?.mapRegionId || (resolvedCountryId ? `country:${resolvedCountryId}` : null) : null;
    const mapRegionKind = prefectureId ? 'prefecture' : countryLevel ? (countryOnly ? 'country' : null) : resolvedMatchesCountry ? resolved?.mapRegionKind || (resolvedCountryId ? 'country' : null) : null;
    const mapRegionLabel = prefectureId ? prefectureLabel : resolvedAdmin1 ? resolved?.mapRegionLabel : countryOnly?.countryLabel || resolved?.mapRegionLabel || resolved?.countryLabel || null;
    const countryId = prefectureId ? 'JPN' : countryIdFromName || resolvedCountryId || countryOnly?.countryId || null;
    const countryLabel = prefectureId ? '日本' : countryOnly?.countryLabel || resolved?.countryLabel || countryName || null;
    const representative = prefectureId ? representativeByPrefecture.get(prefectureId) : null;
    const countryKnownWithoutMap = countryLevel && !countryOnly;
    const placement = prefectureId ? 'prefecture' : countryLevel ? (countryOnly || typeof resolveCountry !== 'function' || countryIdFromName === 'TWN' ? 'country' : 'country-unmapped') : resolvedAdmin1 ? 'region' : mapRegionId ? 'region' : precise ? 'coordinate' : representative ? 'prefecture' : null;
    const position = precise || (representative?.center ? {
      longitude: Number(representative.center.longitude), latitude: Number(representative.center.latitude)
    } : null);
    let positionOk = position && Number.isFinite(position.longitude) && Number.isFinite(position.latitude);
    if (countryLevel || countryAdmin1) positionOk = false;
    if (prefectureId && precise && resolved?.prefectureId !== prefectureId) positionOk = false;
    if (prefectureId && !precise && representative?.center) positionOk = true;
    const cellId = precise && positionOk ? (resolved?.id || canonicalCellId(position.longitude, position.latitude)) : representative?.cell?.id || null;
    return [Object.freeze({
      ...record,
      id: String(record.id || record.eventId || record.name),
      name: String(record.name || record.title).trim(),
      prefectureId,
      prefectureLabel,
      mapRegionId,
      mapRegionIndex: prefectureId ? Number(prefectureId) : countryLevel ? countryOnly?.mapRegionIndex ?? null : resolvedMatchesCountry ? resolved?.mapRegionIndex ?? null : null,
      mapRegionLabel,
      mapRegionKind,
      countryId,
      countryLabel,
      position: countryLevel || countryAdmin1 || (prefectureId && precise) ? null : positionOk ? Object.freeze(position) : null,
      placement: positionOk || countryOnly || countryKnownWithoutMap || resolvedAdmin1 ? placement : null,
      countryLevel,
      cellId: countryLevel || countryAdmin1 || (prefectureId && precise) ? null : cellId,
      representativeCell: placement === 'prefecture' && !precise ? representative : null
    })];
  });
}

function eventStatus(event, today = tokyoDate()) {
  if (event.status === 'cancelled') return '中止';
  if (event.status === 'postponed') return '延期・日程調整中';
  if (event.watch || event.status === 'watch') return '次回開催情報待ち';
  const period = classifyEvent(event, today);
  return period === 'upcoming' ? '開催予定' : period === 'active' ? '開催中' : period === 'past' ? '終了' : '';
}

function safeUrl(value) {
  try { const url = new URL(String(value || '').trim()); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}

function readCache(storage, key) {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Number.isFinite(parsed.savedAt) || Date.now() - parsed.savedAt > CACHE_MAX_AGE || !Array.isArray(parsed.data?.events)) return null;
    return parsed.data.events;
  } catch { return null; }
}

function writeCache(data) {
  const value = JSON.stringify({ savedAt: Date.now(), data });
  try { localStorage.setItem(CACHE_KEY, value); } catch { /* browser storage can be disabled */ }
  try { sessionStorage.setItem(SESSION_KEY, value); } catch { /* browser storage can be disabled */ }
}

export function initMapEvents({ renderer, stage, onChange = () => {}, onOpen = () => {} } = {}) {
  if (!renderer || !stage) throw new TypeError('Map event UI needs a renderer and stage element.');
  const doc = stage.ownerDocument || document;
  let representatives = [];
  try { representatives = renderer.getMapCellRepresentatives?.() || []; } catch { /* renderer may still be initializing */ }
  let publicRecords = fallbackEvents, researchRecords = [], destroyed = false, catalogPending = null, lastCatalogAttempt = 0;
  let today = tokyoDate();
  let events = [];
  let eventSignature = JSON.stringify(events);
  let periodFilter = DEFAULT_EVENT_PERIOD_FILTER;
  let active = false;
  let scope = null;
  let returnFocus = null;

  const dock = doc.createElement('div');
  dock.className = 'map-events-dock'; dock.hidden = true;
  const allButton = doc.createElement('button'); allButton.type = 'button'; allButton.className = 'map-events-dock__all'; allButton.textContent = 'イベント一覧';
  const dockFilters = createPeriodControls('map-events-dock__filters');
  const dockLegend = createLegend('map-events-dock__legend');
  const dockTop = doc.createElement('div'); dockTop.className = 'map-events-dock__top'; dockTop.append(dockFilters, allButton);
  dock.append(dockTop, dockLegend);
  const panel = doc.createElement('section');
  panel.className = 'map-events-panel'; panel.hidden = true; panel.setAttribute('aria-label', 'イベント一覧');
  const head = doc.createElement('header'); head.className = 'map-events-panel__head';
  const heading = doc.createElement('h2'); heading.textContent = 'イベント一覧';
  const closeButton = doc.createElement('button'); closeButton.type = 'button'; closeButton.className = 'map-events-panel__close'; closeButton.textContent = '閉じる'; closeButton.setAttribute('aria-label', 'イベント一覧を閉じる');
  head.append(heading, closeButton);
  const explanation = doc.createElement('p'); explanation.className = 'map-events-panel__note'; explanation.textContent = '地図の色は都道府県・州など地域内のイベント件数を示します。会場の位置ではありません。';
  const panelFilters = createPeriodControls('map-events-panel__filters');
  const panelLegend = createLegend('map-events-panel__legend');
  const periodSummary = doc.createElement('p'); periodSummary.className = 'map-events-panel__summary'; periodSummary.setAttribute('aria-live', 'polite');
  const list = doc.createElement('div'); list.className = 'map-events-panel__list'; list.setAttribute('role', 'list');
  const panelAllButton = doc.createElement('button'); panelAllButton.type = 'button'; panelAllButton.className = 'map-events-panel__all'; panelAllButton.textContent = '全イベントを表示'; panelAllButton.hidden = true;
  panel.append(head, explanation, panelFilters, panelLegend, periodSummary, panelAllButton, list);
  stage.append(dock, panel);

  function createPeriodControls(className) {
    const group = doc.createElement('div'); group.className = className; group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'イベント期間');
    for (const [value, label] of EVENT_PERIOD_OPTIONS) {
      const button = doc.createElement('button'); button.type = 'button'; button.dataset.eventPeriod = value; button.textContent = label;
      button.setAttribute('aria-pressed', String(periodFilter === value)); button.addEventListener('click', () => setPeriodFilter(value)); group.append(button);
    }
    return group;
  }

  function createLegend(className) {
    const legend = doc.createElement('div'); legend.className = className; legend.setAttribute('aria-label', '件数の色：橙は今後・開催中、灰は過去。色の濃さは件数');
    const meaning = doc.createElement('span'); meaning.className = 'map-events-legend__meaning'; meaning.textContent = '橙：今後・開催中　灰：過去'; legend.append(meaning);
    const bins = doc.createElement('span'); bins.className = 'map-events-legend__bins';
    for (const [label, level] of [['1件', '1'], ['2〜4件', '2'], ['5件以上', '3']]) {
      const item = doc.createElement('span'); item.className = 'map-events-legend__bin';
      for (const tone of ['future', 'past']) { const swatch = doc.createElement('i'); swatch.className = `map-events-legend__swatch is-${tone} is-bin-${level}`; swatch.setAttribute('aria-hidden', 'true'); item.append(swatch); }
      const text = doc.createElement('span'); text.textContent = label; item.append(text); bins.append(item);
    }
    legend.append(bins); return legend;
  }

  function setPeriodFilter(value) {
    if (!['all', 'future', 'past'].includes(value) || periodFilter === value) return;
    periodFilter = value;
    for (const group of [dockFilters, panelFilters]) for (const button of group.querySelectorAll('[data-event-period]')) button.setAttribute('aria-pressed', String(button.dataset.eventPeriod === value));
    refreshPeriodSummary();
    if (!panel.hidden) renderList();
    onChange(events);
  }

  function refreshPeriodSummary() {
    const items = scope ? scopedEvents() : events;
    const counts = eventPeriodCounts(items, today);
    const statuses = { watch: 0, unknown: 0, cancelled: 0, postponed: 0 };
    for (const event of uniqueEventEditions(items)) {
      const status = classifyEvent(event, today);
      if (status in statuses) statuses[status] += 1;
    }
    const place = scope ? 'この地域' : '全体';
    periodSummary.textContent = `${place}：今後・開催中 ${counts.future}件／過去 ${counts.past}件／次回待ち ${statuses.watch}件／日程未定 ${statuses.unknown}件`;
  }

  function summarize(selection) {
    const cell = selection?.displayCell || selection;
    const prefectureId = String(cell?.prefectureId || selection?.prefectureId || '').padStart(2, '0');
    const mapRegionId = cell?.mapRegionId || selection?.mapRegionId;
    const cellId = selection?.cellId || selection?.cell?.id || cell?.cell?.id || selection?.id;
    const countryId = cell?.countryId || selection?.countryId;
    const isCountryScope = cell?.mapRegionKind === 'country' || selection?.mapRegionKind === 'country';
    const items = mapRegionId ? events.filter(event => event.mapRegionId === mapRegionId || ((event.countryLevel || isCountryScope) && event.countryId === countryId)) : prefectureId && prefectureId !== '00' ? events.filter(event => event.prefectureId === prefectureId || (event.countryLevel && event.countryId === countryId)) : cellId ? events.filter(event => event.cellId === cellId) : [];
    return summarizeItems(items);
  }

  function summarizeItems(items) {
    const counts = eventPeriodCounts(items, today);
    return Object.freeze({ ...counts, count: periodFilter === 'future' ? counts.future : periodFilter === 'past' ? counts.past : counts.total, period: periodFilter });
  }

  function scopedEvents() {
    if (!scope) return events;
    const cell = scope.displayCell || scope;
    const cellId = scope.cellId || scope.cell?.id || cell?.cell?.id || scope.id;
    const mapRegionId = cell?.mapRegionId || scope.mapRegionId;
    const countryId = cell?.countryId || scope.countryId;
    const isCountryScope = cell?.mapRegionKind === 'country' || scope.mapRegionKind === 'country';
    if (mapRegionId) return events.filter(event => event.mapRegionId === mapRegionId || ((event.countryLevel || isCountryScope) && event.countryId === countryId));
    const prefectureId = String(cell?.prefectureId || scope.prefectureId || '').padStart(2, '0');
    if (prefectureId && prefectureId !== '00') return events.filter(event => event.prefectureId === prefectureId || (event.countryLevel && event.countryId === countryId));
    return cellId ? events.filter(event => event.cellId === cellId) : [];
  }

  function renderList() {
    const record = scope?.displayCell || scope;
    const scopedPrefecture = String(record?.prefectureId || scope?.prefectureId || '').padStart(2, '0');
    const isPrefectureScope = Boolean(scopedPrefecture && scopedPrefecture !== '00');
    const mapRegionId = record?.mapRegionId || scope?.mapRegionId;
    const mapRegionKind = record?.mapRegionKind || scope?.mapRegionKind || (isPrefectureScope ? 'prefecture' : null);
    const mapRegionLabel = record?.mapRegionLabel || scope?.mapRegionLabel || (isPrefectureScope ? JAPAN_PREFECTURES.find(([code]) => code === scopedPrefecture)?.[1] : null);
    const countryLabel = record?.countryLabel || scope?.countryLabel || null;
    const isRegionScope = Boolean(mapRegionId);
    const regionHeading = mapRegionKind === 'country' ? (countryLabel || mapRegionLabel) : mapRegionKind === 'admin1' && countryLabel ? [countryLabel, mapRegionLabel].filter(Boolean).join(' · ') : mapRegionLabel;
    const items = scopedEvents();
    const visibleItems = sortEventsByDisplayPriority(uniqueEventEditions(items), today).filter(event => matchesEventPeriod(event, periodFilter, today));
    heading.textContent = `${scope ? (isRegionScope ? `${regionHeading || 'この地域'}のイベント` : isPrefectureScope ? `${mapRegionLabel || 'この県'}のイベント` : 'この付近のイベント') : 'イベント一覧'} · ${visibleItems.length}件`;
    refreshPeriodSummary();
    panelAllButton.hidden = !scope;
    list.replaceChildren();
    if (!visibleItems.length) {
      const empty = doc.createElement('p'); empty.className = 'map-events-panel__empty'; empty.textContent = periodFilter === 'future' ? '今後・開催中のイベントはありません。' : periodFilter === 'past' ? '過去の開催実績はありません。' : scope ? 'この地域の公開イベントはありません。' : '公開イベントはありません。'; list.append(empty); return;
    }
    for (const event of visibleItems) {
      const card = doc.createElement('article'); card.className = 'map-event-card'; card.setAttribute('role', 'listitem');
      card.dataset.eventPeriod = classifyEvent(event, today);
      const title = doc.createElement('h3'); title.textContent = event.name; card.append(title);
      const eventLocation = eventRegionName(event);
      const details = [event.dateLabel || event.dates || event.date || [event.startDate, event.endDate].filter(Boolean).join('–'), event.venue, eventLocation].filter(value => typeof value === 'string' && value.trim());
      if (details.length) { const meta = doc.createElement('p'); meta.className = 'map-event-card__meta'; meta.textContent = details.join(' · '); card.append(meta); }
      const regionName = eventRegionName(event);
      const placement = doc.createElement('p'); placement.className = 'map-event-card__placement'; placement.textContent = event.online ? 'オンライン開催' : event.placement === 'country' ? `${regionName || '国'}単位で表示（開催地の詳細位置は未確認）` : event.placement === 'country-unmapped' ? `${regionName || '国'}は確認済み（地図上に表示可能な範囲がありません）` : event.placement === 'coordinate' ? (event.locationPrecision === 'venue' ? '確認済み会場の位置（建物内の開催場所は未確認）' : event.locationPrecision === 'area' ? `${regionName || '地域'}周辺に表示（開催地の詳細位置は未確認）` : '公開された位置情報') : event.placement === 'prefecture' ? (event.representativeCell ? `${regionName || '都道府県'}単位でまとめて表示（会場位置ではありません）` : event.locationPrecision === 'venue' ? `${regionName || '都道府県'}内の確認済み会場` : event.locationPrecision === 'area' ? `${regionName || '都道府県'}内の地域代表位置（会場位置は未確認）` : `${regionName || '都道府県'}内のイベント`) : event.placement === 'region' ? `${regionName || '地域'}単位でまとめて表示（会場位置ではありません）` : '地図上の位置情報なし'; card.append(placement);
      const statusText = eventStatus(event, today);
      if (statusText) { const status = doc.createElement('p'); status.className = 'map-event-card__status'; status.textContent = statusText; card.append(status); }
      const href = safeUrl(event.url || event.sourceUrl || event.website);
      if (href) { const link = doc.createElement('a'); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = '公式情報'; card.append(link); }
      if (event.checkedAt && Number.isFinite(Date.parse(event.checkedAt))) { const checked = doc.createElement('p'); checked.className = 'map-event-card__placement'; checked.textContent = `情報確認日：${new Date(event.checkedAt).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })}`; card.append(checked); }
      for (const source of Array.isArray(event.socialUrls) ? event.socialUrls : []) { const url = safeEventSource(source); if (!url) continue; const link = doc.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = '主催者SNS'; card.append(link); }
      list.append(card);
    }
  }

  function openCellEvents(selection) { if (panel.hidden) returnFocus = doc.activeElement; scope = selection || null; onOpen(scope); renderList(); panel.hidden = false; panel.classList.add('is-open'); stage.classList.add('has-map-events'); closeButton.focus({ preventScroll: true }); }
  function openAll() { if (panel.hidden) returnFocus = doc.activeElement; scope = null; onOpen(null); renderList(); panel.hidden = false; panel.classList.add('is-open'); stage.classList.add('has-map-events'); closeButton.focus({ preventScroll: true }); }
  function close() { panel.hidden = true; panel.classList.remove('is-open'); stage.classList.remove('has-map-events'); scope = null; if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); returnFocus = null; }
  allButton.addEventListener('click', openAll);
  panelAllButton.addEventListener('click', openAll);
  closeButton.addEventListener('click', close);
  function onKeydown(event) { if (event.key === 'Escape' && !panel.hidden) { close(); event.stopPropagation(); } }
  doc.addEventListener('keydown', onKeydown);

  function refresh() {
    const hidden = !active || renderer.getSnapshot?.()?.camera?.projection !== 'mercator';
    if (dock.hidden !== hidden) dock.hidden = hidden;
  }
  function update(nextRecords = publicRecords) {
    if (destroyed) return;
    publicRecords = nextRecords;
    today = tokyoDate();
    const next = uniqueEventEditions(normalizeMapEvents(mergeEventCatalog(publicRecords, researchRecords), representatives, renderer.getMapLocation?.bind(renderer), renderer.getMapCountry?.bind(renderer))).map(event => Object.freeze({ ...event, mapPeriod: classifyEvent(event, today) }));
    const signature = JSON.stringify(next);
    if (signature === eventSignature) return;
    eventSignature = signature; events = next;
    refresh(); refreshPeriodSummary(); if (!panel.hidden) renderList(); onChange(events);
  }
  function loadCached() {
    let cached = null;
    try { cached = readCache(globalThis.sessionStorage, SESSION_KEY) || readCache(globalThis.localStorage, CACHE_KEY); } catch { /* storage access itself can throw */ }
    if (cached) update(cached);
  }
  loadCached();
  const endpoint = String(mapConfig.publicDataEndpoint || '').trim();
  const publicReady = (async () => {
    if (!endpoint || typeof fetch !== 'function') return events;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = setTimeout(() => controller?.abort(), 3500);
    try {
      const url = new URL(endpoint, location.href); url.searchParams.set('action', 'public-data');
      const response = await fetch(url.href, { signal: controller?.signal, cache: 'no-store' });
      if (!response.ok) return events;
      const data = await response.json(); if (!Array.isArray(data?.events)) return events;
      writeCache(data); update(data.events); return events;
    } catch { return events; }
    finally { clearTimeout(timeout); }
  })();

  function refreshCatalog(force = false) {
    if (destroyed || doc.visibilityState === 'hidden' || (!force && Date.now() - lastCatalogAttempt < CATALOG_REFRESH_MS)) return Promise.resolve(events);
    if (catalogPending) return catalogPending;
    lastCatalogAttempt = Date.now();
    catalogPending = (async () => {
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timeout = setTimeout(() => controller?.abort(), 3500);
      try {
        const response = await fetch(CATALOG_URL.href, { cache: 'no-cache', signal: controller?.signal });
        if (!response.ok || destroyed) return events;
        const next = readEventCatalog(await response.json());
        if (!destroyed) { researchRecords = next; update(); }
      } catch { /* Keep the last verified catalog when a source is offline or invalid. */ }
      finally { clearTimeout(timeout); catalogPending = null; }
      return events;
    })();
    return catalogPending;
  }
  const ready = Promise.all([publicReady, refreshCatalog(true)]).then(() => events);
  const catalogTimer = setInterval(() => { void refreshCatalog(); }, CATALOG_REFRESH_MS);
  let midnightTimer = null;
  function scheduleMidnight() {
    clearTimeout(midnightTimer);
    midnightTimer = setTimeout(() => { update(); scheduleMidnight(); }, nextTokyoMidnightDelay());
  }
  scheduleMidnight();
  function onVisibilityChange() { if (doc.visibilityState !== 'hidden') { update(); void refreshCatalog(); } }
  doc.addEventListener('visibilitychange', onVisibilityChange);
  onChange(events);
  return {
    getEvents: () => events,
    getCellSummary: selection => summarize(selection),
    getDensityEvents: () => events.filter(event => event.mapPeriod === 'upcoming' || event.mapPeriod === 'active' || event.mapPeriod === 'past'),
    getPeriodFilter: () => periodFilter,
    openCellEvents, openAll, refresh, setActive(value) { active = Boolean(value); if (!active) close(); refresh(); }, close,
    ready, refreshData: () => refreshCatalog(true),
    destroy() { destroyed = true; clearInterval(catalogTimer); clearTimeout(midnightTimer); doc.removeEventListener('visibilitychange', onVisibilityChange); close(); doc.removeEventListener('keydown', onKeydown); dock.remove(); panel.remove(); }
  };
}
