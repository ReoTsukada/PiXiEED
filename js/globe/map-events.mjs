import { mapConfig } from '../../data/site-config.js?rev=20261004-puzzle-share-1';
import { events as fallbackEvents } from '../../data/site-data.js?rev=20260924-no-samples-1';
import { JAPAN_PREFECTURES } from './hierarchy.mjs?v=20260920-g4-precision-1';
import { lookupCell } from './geometry.mjs?v=20261005-map-layers-1';

import { readEventCatalog, mergeEventCatalog } from './event-catalog.mjs?v=20261005-event-research-1';
import { classifyEvent, DEFAULT_EVENT_PERIOD_FILTER, eventPeriodCounts, matchesEventPeriod, nextTokyoMidnightDelay, sortEventsByDisplayPriority, tokyoDate, uniqueEventEditions } from './event-density.mjs';
import { presentMapEvent } from './map-event-presentation.mjs?v=20261007-event-discovery-1';
import { trackGlobeEvent } from './analytics-bridge.mjs';
import { appendEventPageLink } from './event-page-links.mjs';

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
export function normalizeMapEvents(records, representatives = [], resolveLocation = null, resolveCountry = null, { locationReady = true } = {}) {
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
      locationPending: Boolean(precise && !locationReady),
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
  let view = 'list', detailEventId = null, detailReturnScroll = 0;
  let catalogStatus = 'loading', listLimit = 20;

  const dock = doc.createElement('div');
  dock.className = 'map-events-dock'; dock.hidden = true;
  const allButton = doc.createElement('button'); allButton.type = 'button'; allButton.className = 'map-events-dock__all'; allButton.textContent = 'イベント一覧';
  const dockPeriodToggle = createPeriodToggle('map-events-dock__period-toggle');
  const dockLegend = createLegend('map-events-dock__legend');
  const dockTop = doc.createElement('div'); dockTop.className = 'map-events-dock__top'; dockTop.append(dockPeriodToggle, allButton);
  dock.append(dockTop, dockLegend);
  const panel = doc.createElement('section');
  panel.className = 'map-events-panel'; panel.hidden = true; panel.setAttribute('aria-label', 'イベント一覧');
  const head = doc.createElement('header'); head.className = 'map-events-panel__head';
  const heading = doc.createElement('h2'); heading.className = 'map-events-panel__heading'; heading.textContent = 'イベント一覧';
  const headControls = doc.createElement('div'); headControls.className = 'map-events-panel__head-controls';
  const backButton = doc.createElement('button'); backButton.type = 'button'; backButton.className = 'map-events-panel__back'; backButton.textContent = '一覧に戻る'; backButton.hidden = true;
  const closeButton = doc.createElement('button'); closeButton.type = 'button'; closeButton.className = 'map-events-panel__close'; closeButton.textContent = '閉じる'; closeButton.setAttribute('aria-label', 'イベント一覧を閉じる');
  headControls.append(backButton, closeButton);
  head.append(heading, headControls);
  const compactControls = doc.createElement('div'); compactControls.className = 'map-events-panel__controls';
  const about = doc.createElement('details'); about.className = 'map-events-panel__about';
  const aboutSummary = doc.createElement('summary'); aboutSummary.textContent = '地図とイベント件数について';
  const explanation = doc.createElement('p'); explanation.className = 'map-events-panel__note'; explanation.textContent = '地図の色は都道府県・州など地域内のイベント件数を示します。会場の位置ではありません。';
  const panelPeriodToggle = createPeriodToggle('map-events-panel__period-toggle');
  const panelLegend = createLegend('map-events-panel__legend');
  const periodSummary = doc.createElement('p'); periodSummary.className = 'map-events-panel__summary'; periodSummary.setAttribute('aria-live', 'polite');
  const aboutContent = doc.createElement('div'); aboutContent.className = 'map-events-panel__about-content'; aboutContent.append(explanation, panelLegend, periodSummary);
  about.append(aboutSummary, aboutContent);
  compactControls.append(panelPeriodToggle, about);
  const body = doc.createElement('div'); body.className = 'map-events-panel__body';
  const list = doc.createElement('div'); list.className = 'map-events-panel__list'; list.setAttribute('role', 'list');
  const detail = doc.createElement('article'); detail.className = 'map-events-panel__detail'; detail.hidden = true;
  body.append(list, detail);
  panel.append(head, compactControls, body);
  panel.dataset.view = view;
  stage.append(dock, panel);

  let pendingCanvasTouch = null, pendingCanvasTouchTimer = null;
  function clearPendingCanvasTouch() {
    pendingCanvasTouch = null;
    clearTimeout(pendingCanvasTouchTimer);
    pendingCanvasTouchTimer = null;
  }
  function rememberCanvasTouch(event) {
    if (!event.isTrusted) return;
    if (event.pointerType === 'touch' && event.target === stage.querySelector('#globeCanvas')) {
      clearPendingCanvasTouch();
      pendingCanvasTouch = { x: event.clientX, y: event.clientY, at: Date.now() };
      pendingCanvasTouchTimer = setTimeout(clearPendingCanvasTouch, 800);
    } else clearPendingCanvasTouch();
  }
  function preventCanvasTouchRetarget(event) {
    const origin = pendingCanvasTouch;
    if (!event.isTrusted || !origin || event.detail === 0 || Date.now() - origin.at > 800) return;
    if (!event.target?.closest?.('.map-events-panel, .map-events-dock')) return;
    if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 32) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    clearPendingCanvasTouch();
  }
  stage.addEventListener('pointerdown', rememberCanvasTouch, true);
  stage.addEventListener('click', preventCanvasTouchRetarget, true);

  function periodLabel(value) { return value === 'future' ? '今後・開催中' : value === 'past' ? '過去' : 'すべて'; }

  function syncPeriodToggle(group) {
    group.dataset.eventPeriod = periodFilter;
    for (const button of group.querySelectorAll('[data-period-option]')) {
      button.setAttribute('aria-pressed', String(button.dataset.periodOption === periodFilter));
    }
  }

  function createPeriodToggle(className) {
    const group = doc.createElement('div'); group.className = `${className} map-events-period`;
    group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'イベントの開催時期');
    for (const value of ['future', 'past', 'all']) {
      const button = doc.createElement('button'); button.type = 'button'; button.className = 'map-events-period__option';
      button.dataset.periodOption = value; button.textContent = periodLabel(value);
      button.addEventListener('click', () => setPeriodFilter(value));
      group.append(button);
    }
    group.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const buttons = [...group.querySelectorAll('button')];
      const index = buttons.indexOf(doc.activeElement);
      if (index < 0) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus({ preventScroll: true });
    });
    syncPeriodToggle(group);
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
    if (!['all', 'future', 'past'].includes(value)) return;
    const changed = periodFilter !== value;
    periodFilter = value;
    syncPeriodToggle(dockPeriodToggle); syncPeriodToggle(panelPeriodToggle);
    if (!changed) return;
    refreshPeriodSummary();
    if (!panel.hidden) {
      if (view === 'detail') setView('list', { restoreScroll: 0 });
      else { const scroll = body.scrollTop; renderList(); body.scrollTop = scroll; }
    }
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

  function scopeIdentity(selection) {
    if (!selection) return 'all';
    const cell = selection.displayCell || selection;
    const mapRegionId = cell?.mapRegionId || selection.mapRegionId;
    if (mapRegionId) return `region:${mapRegionId}`;
    const prefectureId = String(cell?.prefectureId || selection.prefectureId || '').padStart(2, '0');
    if (prefectureId && prefectureId !== '00') return `prefecture:${prefectureId}`;
    const cellId = selection.cellId || selection.cell?.id || cell?.cell?.id || selection.id;
    return cellId ? `cell:${cellId}` : 'empty';
  }

  function renderList() {
    const previousScroll = body.scrollTop;
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
    heading.textContent = `${scope ? (isRegionScope ? (regionHeading || 'この地域') : isPrefectureScope ? (mapRegionLabel || 'この県') : 'この付近') : 'イベント一覧'} · ${visibleItems.length}件`;
    refreshPeriodSummary();
    const focusedId = doc.activeElement?.closest?.('[data-event-id]')?.dataset.eventId;
    const hadListFocus = list.contains(doc.activeElement);
    list.replaceChildren(); detail.hidden = true;
    if (!visibleItems.length) { renderEmpty(list, items); return; }
    const count = Math.min(listLimit, visibleItems.length);
    for (const event of visibleItems.slice(0, count)) list.append(createEventCard(event));
    if (visibleItems.length > count) {
      const more = doc.createElement('button'); more.type = 'button'; more.className = 'map-events-panel__more'; more.textContent = `さらに${Math.min(20, visibleItems.length - count)}件を表示`;
      more.addEventListener('click', () => { const next = Math.min(visibleItems.length, listLimit + 20); for (const event of visibleItems.slice(listLimit, next)) list.insertBefore(createEventCard(event), more); listLimit = next; more.textContent = listLimit < visibleItems.length ? `さらに${Math.min(20, visibleItems.length - listLimit)}件を表示` : ''; more.hidden = listLimit >= visibleItems.length; });
      list.append(more);
    }
    if (hadListFocus) [...list.querySelectorAll('[data-event-id]')].find(card => card.dataset.eventId === focusedId)?.querySelector('button')?.focus({ preventScroll: true });
    body.scrollTop = previousScroll;
    if (view === 'detail') renderDetail();
  }

  function placementText(event) {
    const regionName = eventRegionName(event);
    return event.locationPending ? '地図上の場所を確認中…' : event.online ? 'オンライン開催' : event.placement === 'country' ? `${regionName || '国'}単位で表示（開催地の詳細位置は未確認）` : event.placement === 'country-unmapped' ? `${regionName || '国'}は確認済み（地図上に表示可能な範囲がありません）` : event.placement === 'coordinate' ? (event.locationPrecision === 'venue' ? '確認済み会場の位置（建物内の開催場所は未確認）' : event.locationPrecision === 'area' ? `${regionName || '地域'}周辺に表示（開催地の詳細位置は未確認）` : '公開された位置情報') : event.placement === 'prefecture' ? (event.representativeCell ? `${regionName || '都道府県'}単位でまとめて表示（会場位置ではありません）` : event.locationPrecision === 'venue' ? `${regionName || '都道府県'}内の確認済み会場` : event.locationPrecision === 'area' ? `${regionName || '都道府県'}内の地域代表位置（会場位置は未確認）` : `${regionName || '都道府県'}内のイベント`) : event.placement === 'region' ? `${regionName || '地域'}単位でまとめて表示（会場位置ではありません）` : '地図上の位置情報なし';
  }

  function createEventCard(event) {
    const presentation = presentMapEvent(event, today);
    const card = doc.createElement('article'); card.className = 'map-event-card'; card.setAttribute('role', 'listitem'); card.dataset.eventPeriod = presentation.period; card.dataset.eventId = event.id;
    const date = doc.createElement('time'); date.className = 'map-event-card__date';
    if (event.startDate && /^\d{4}-\d\d-\d\d$/.test(event.startDate)) {
      const [year, month, day] = event.startDate.split('-').map(Number);
      const end = /^\d{4}-\d\d-\d\d$/.test(event.endDate || '') ? event.endDate.split('-').map(Number) : null;
      const primary = doc.createElement('strong'); primary.textContent = `${month}/${day}`;
      if (end && event.endDate !== event.startDate) { date.classList.add('is-range'); primary.textContent += `\n–${end[1]}/${end[2]}`; }
      const yearText = doc.createElement('small'); yearText.textContent = end && end[0] !== year ? `${year}–${end[0]}年` : `${year}年`;
      date.append(primary, yearText); date.dateTime = event.startDate;
    } else date.textContent = presentation.date || '日程未確認';
    const content = doc.createElement('div'); content.className = 'map-event-card__content';
    const status = doc.createElement('p'); status.className = 'map-event-card__status'; status.textContent = presentation.status; content.append(status);
    const title = doc.createElement('h3'); title.className = 'map-event-card__title'; title.textContent = presentation.title; content.append(title);
    if (presentation.time) { const clock = doc.createElement('p'); clock.className = 'map-event-card__meta'; clock.textContent = presentation.time; content.append(clock); }
    const placement = placementText(event);
    const metaText = [presentation.area, presentation.venue].filter(Boolean).join(' · ');
    if (metaText) { const meta = doc.createElement('p'); meta.className = 'map-event-card__meta'; meta.textContent = metaText; content.append(meta); }
    if (presentation.fee) { const fee = doc.createElement('p'); fee.className = 'map-event-card__fee'; fee.textContent = presentation.fee; content.append(fee); }
    if (presentation.tags.length) { const tags = doc.createElement('p'); tags.className = 'map-event-card__tags'; for (const value of presentation.tags) { const tag = doc.createElement('span'); tag.textContent = value; tags.append(tag); } content.append(tags); }
    const button = doc.createElement('button'); button.type = 'button'; button.className = 'map-event-card__detail'; button.textContent = '詳細を見る'; button.setAttribute('aria-label', `${presentation.title}の詳細を見る`); button.setAttribute('aria-expanded', String(event.id === detailEventId && view === 'detail')); button.addEventListener('click', activation => openDetail(event, activation)); content.append(button);
    if (event.locationPending) { const pending = doc.createElement('p'); pending.className = 'map-event-card__meta'; pending.textContent = placement; content.insertBefore(pending, button); }
    card.dataset.selected = String(event.id === detailEventId);
    if (event.id === detailEventId) card.setAttribute('aria-current', 'true');
    card.append(date, content); return card;
  }

  function appendFact(listNode, label, value) {
    if (!value) return;
    const term = doc.createElement('dt'); term.textContent = label;
    const definition = doc.createElement('dd'); definition.textContent = value;
    listNode.append(term, definition);
  }

  function renderDetail() {
    const event = events.find(item => item.id === detailEventId);
    detail.replaceChildren();
    if (!event) { detail.hidden = true; return; }
    detail.dataset.eventPageId = event.id;
    const presentation = presentMapEvent(event, today);
    const title = doc.createElement('h3'); title.className = 'map-events-panel__detail-title'; title.textContent = presentation.title;
    const summary = doc.createElement('p'); summary.className = 'map-events-panel__detail-summary'; summary.textContent = `${presentation.status}${presentation.dateLabel ? ` · ${presentation.dateLabel}` : presentation.date ? ` · ${presentation.date}` : ''}`;
    const facts = doc.createElement('dl'); facts.className = 'map-events-panel__facts';
    appendFact(facts, '会場', presentation.venue);
    appendFact(facts, '地域', presentation.area);
    appendFact(facts, '地図表示', placementText(event));
    appendFact(facts, '料金', presentation.fee);
    appendFact(facts, '参加条件', presentation.conditions);
    appendFact(facts, '主催', presentation.organizer.join('・'));
    appendFact(facts, 'タグ', presentation.tags.join('・'));
    const links = doc.createElement('div'); links.className = 'map-events-panel__links'; links.setAttribute('aria-label', 'イベント情報のリンク');
    for (const item of presentation.links) {
      const anchor = doc.createElement('a'); anchor.href = item.href; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.textContent = item.label;
      anchor.addEventListener('click', activation => {
        if (!activation.isTrusted || activation.defaultPrevented || activation.button !== 0 || !['official', 'ticket', 'related', 'social'].includes(item.linkKind)) return;
        trackGlobeEvent('event_outbound', { link_kind: item.linkKind });
      });
      links.append(anchor);
    }
    const source = doc.createElement('p'); source.className = 'map-events-panel__source'; source.textContent = [presentation.sourceLabel, presentation.checkedAt ? `確認日：${presentation.checkedAt}` : ''].filter(Boolean).join(' · ');
    detail.append(title, summary, facts);
    if (presentation.description) { const description = doc.createElement('p'); description.className = 'map-events-panel__description'; description.textContent = presentation.description; detail.append(description); }
    detail.append(links); if (source.textContent) detail.append(source); detail.hidden = false;
    void appendEventPageLink(detail, event.id, doc);
  }

  function renderEmpty(listNode, allItems) {
    const statuses = uniqueEventEditions(allItems).map(event => classifyEvent(event, today));
    const pastCount = statuses.filter(status => status === 'past').length;
    const undatedCount = statuses.filter(status => ['watch', 'unknown', 'postponed', 'cancelled'].includes(status)).length;
    let message;
    if (catalogStatus === 'loading' && (scope ? allItems.length === 0 : !events.length)) message = 'イベント情報を確認中…';
    else if (catalogStatus === 'error' && (scope ? allItems.length === 0 : !events.length)) message = scope ? 'この地域のイベント情報を確認できませんでした。通信を確認して再試行してください。' : 'イベント情報を読み込めませんでした。通信を確認して再試行してください。';
    else if (scope && allItems.length === 0) message = 'この地域の公開イベントはまだ掲載されていません。';
    else if (periodFilter === 'future' && pastCount) message = `今後・開催中のイベントはありません。過去の開催実績が${pastCount}件あります。`;
    else if (periodFilter === 'future' && undatedCount) message = `今後・開催中の日程はありません。日程未確認・次回待ちが${undatedCount}件あります。`;
    else if (periodFilter === 'past') message = '過去の開催実績はありません。';
    else message = '該当する公開イベントはありません。';
    const empty = doc.createElement('p'); empty.className = `map-events-panel__empty is-${catalogStatus}`; empty.textContent = message; listNode.append(empty);
    if (catalogStatus === 'error' && (scope ? allItems.length === 0 : !events.length)) { const retry = doc.createElement('button'); retry.type = 'button'; retry.className = 'map-events-panel__retry'; retry.textContent = '再試行'; retry.addEventListener('click', () => { void refreshCatalog(true); }); listNode.append(retry); }
    if (periodFilter === 'future' && pastCount) { const past = doc.createElement('button'); past.type = 'button'; past.className = 'map-events-panel__past'; past.textContent = `過去の開催実績を見る（${pastCount}件）`; past.addEventListener('click', () => setPeriodFilter('past')); listNode.append(past); }
  }

  function setView(next, { restoreScroll = null } = {}) {
    view = next === 'detail' ? 'detail' : 'list'; panel.dataset.view = view;
    for (const card of list.querySelectorAll('[data-event-id]')) {
      const selected = card.dataset.eventId === String(detailEventId);
      card.dataset.selected = String(selected);
      if (selected) card.setAttribute('aria-current', 'true'); else card.removeAttribute('aria-current');
      card.querySelector('button')?.setAttribute('aria-expanded', String(selected && view === 'detail'));
    }
    list.hidden = view === 'detail'; detail.hidden = view !== 'detail';
    backButton.hidden = view !== 'detail';
    if (view === 'detail') renderDetail(); else renderList();
    if (restoreScroll !== null) body.scrollTop = restoreScroll;
  }

  function openDetail(event, activation) {
    detailReturnScroll = body.scrollTop;
    detailEventId = event.id;
    if (activation?.isTrusted) trackGlobeEvent('select_content', { content_type: 'event' });
    setView('detail');
    backButton.focus({ preventScroll: true });
  }

  function backFromDetail() {
    if (view !== 'detail') return;
    const id = detailEventId;
    setView('list', { restoreScroll: detailReturnScroll });
    const target = [...list.querySelectorAll('[data-event-id]')].find(card => card.dataset.eventId === id)?.querySelector('.map-event-card__detail');
    target?.focus({ preventScroll: true });
  }

  function selectRegion(selection) {
    if (destroyed) return false;
    if (!selection) { if (!panel.hidden) close({ restoreFocus: false }); return true; }
    const changed = scopeIdentity(scope) !== scopeIdentity(selection);
    if (panel.hidden) { returnFocus = doc.activeElement; scope = selection; onOpen(scope); panel.hidden = false; panel.classList.add('is-open'); stage.classList.add('has-map-events'); setView('list'); return true; }
    if (!changed) return true;
    scope = selection; detailEventId = null; listLimit = 20; body.scrollTop = 0; onOpen(scope); setView('list');
    return true;
  }

  function openCellEvents(selection) { if (panel.hidden) returnFocus = doc.activeElement; scope = selection || null; onOpen(scope); panel.hidden = false; panel.classList.add('is-open'); stage.classList.add('has-map-events'); detailEventId = null; listLimit = 20; body.scrollTop = 0; setView('list'); closeButton.focus({ preventScroll: true }); }
  function openAll() { if (panel.hidden) returnFocus = doc.activeElement; scope = null; onOpen(null); panel.hidden = false; panel.classList.add('is-open'); stage.classList.add('has-map-events'); detailEventId = null; listLimit = 20; body.scrollTop = 0; setView('list'); closeButton.focus({ preventScroll: true }); }
  function canReceiveFocus(element) {
    return Boolean(element?.isConnected && !element.hidden && element.getClientRects().length && doc.defaultView?.getComputedStyle(element).visibility !== 'hidden');
  }
  function close({ restoreFocus = true } = {}) {
    panel.hidden = true; panel.classList.remove('is-open'); stage.classList.remove('has-map-events'); scope = null;
    body.scrollTop = 0; detailEventId = null; view = 'list'; panel.dataset.view = view;
    if (restoreFocus) {
      const currentSelectionAction = doc.querySelector('#viewCellPosts');
      const canvas = stage.querySelector('#globeCanvas');
      const target = canReceiveFocus(returnFocus) ? returnFocus : canReceiveFocus(currentSelectionAction) ? currentSelectionAction : canReceiveFocus(canvas) ? canvas : null;
      target?.focus({ preventScroll: true });
    }
    returnFocus = null;
  }
  function updateSelection(selection) {
    if (panel.hidden) return false;
    if (!selection) { close({ restoreFocus: false }); return true; }
    const changed = scopeIdentity(scope) !== scopeIdentity(selection);
    if (!changed) return true;
    scope = selection; detailEventId = null; listLimit = 20; body.scrollTop = 0; setView('list');
    return true;
  }
  allButton.addEventListener('click', openAll);
  backButton.addEventListener('click', backFromDetail);
  closeButton.addEventListener('click', close);
  function onKeydown(event) { if (event.key === 'Escape' && !panel.hidden) { if (view === 'detail') backFromDetail(); else close(); event.stopPropagation(); } }
  doc.addEventListener('keydown', onKeydown);

  function refresh() {
    const hidden = !active || renderer.getSnapshot?.()?.camera?.projection !== 'mercator';
    if (dock.hidden !== hidden) dock.hidden = hidden;
  }
  function update(nextRecords = publicRecords) {
    if (destroyed) return;
    publicRecords = nextRecords;
    today = tokyoDate();
    const next = uniqueEventEditions(normalizeMapEvents(mergeEventCatalog(publicRecords, researchRecords), representatives, renderer.getMapLocation?.bind(renderer), renderer.getMapCountry?.bind(renderer), { locationReady: renderer.isMapLocationReady?.() !== false })).map(event => Object.freeze({ ...event, mapPeriod: classifyEvent(event, today) }));
    const signature = JSON.stringify(next);
    if (signature === eventSignature) return;
    eventSignature = signature; events = next;
    refresh(); refreshPeriodSummary(); if (!panel.hidden) { if (view === 'detail') renderDetail(); else { const scroll = body.scrollTop; renderList(); body.scrollTop = scroll; } } onChange(events);
  }
  function loadCached() {
    let cached = null;
    try { cached = readCache(globalThis.sessionStorage, SESSION_KEY) || readCache(globalThis.localStorage, CACHE_KEY); } catch { /* storage access itself can throw */ }
    if (cached) update(cached);
  }
  function refreshLocations() {
    if (destroyed) return;
    try { representatives = renderer.getMapCellRepresentatives?.() || representatives; } catch { /* keep the last available regional metadata */ }
    update();
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
    catalogStatus = 'loading';
    if (!panel.hidden) { if (view === 'detail') renderDetail(); else renderList(); }
    catalogPending = (async () => {
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timeout = setTimeout(() => controller?.abort(), 3500);
      try {
        const response = await fetch(CATALOG_URL.href, { cache: 'no-cache', signal: controller?.signal });
        if (!response.ok) catalogStatus = 'error';
        else if (!destroyed) { const next = readEventCatalog(await response.json()); catalogStatus = 'ready'; researchRecords = next; update(); }
      } catch { if (!destroyed) catalogStatus = researchRecords.length ? 'ready' : 'error'; }
      finally { clearTimeout(timeout); catalogPending = null; }
      if (!destroyed && !panel.hidden) { refreshPeriodSummary(); if (view === 'detail') renderDetail(); else { const scroll = body.scrollTop; renderList(); body.scrollTop = scroll; } }
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
    getDensityEvents: () => events.filter(event => !event.locationPending && (event.mapPeriod === 'upcoming' || event.mapPeriod === 'active' || event.mapPeriod === 'past')),
    getPeriodFilter: () => periodFilter,
    openCellEvents, openAll, selectRegion, updateSelection, refresh, setActive(value) { active = Boolean(value); if (!active) close(); refresh(); }, close,
    ready, refreshLocations, refreshData: () => refreshCatalog(true),
    destroy() { destroyed = true; clearInterval(catalogTimer); clearTimeout(midnightTimer); clearPendingCanvasTouch(); stage.removeEventListener('pointerdown', rememberCanvasTouch, true); stage.removeEventListener('click', preventCanvasTouchRetarget, true); doc.removeEventListener('visibilitychange', onVisibilityChange); close(); doc.removeEventListener('keydown', onKeydown); dock.remove(); panel.remove(); }
  };
}
