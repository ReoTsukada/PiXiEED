import { isSampleWork, publicWorksOnly } from './public-work-policy.mjs';
import { events as fallbackEvents, stores as fallbackStores, works as fallbackWorks } from '../data/site-data.js?rev=20260924-no-samples-1';
import { mapConfig, supabaseConfig } from '../data/site-config.js?rev=20260918-post-v1';

const FOUND_KEY = 'PiXiEED:found-works:v1';
const LEGACY_FOUND_KEY = '絵のよりみち:found-works:v1';
const PUBLIC_DATA_CACHE_KEY = 'PiXiEED:public-data-cache:v2';
const PUBLIC_DATA_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
const MAP_ASSET_URL = '/assets/maps/japan-prefectures.svg?rev=20260917-geographic-okinawa-v2';
const page = document.body.dataset.page || '';
let works = publicWorksOnly(fallbackWorks);
let stores = fallbackStores;
let events = fallbackEvents;
let userMapPosts = [];

function getPublicDataSignature(data) {
  return JSON.stringify({ works: data.works, stores: data.stores, events: data.events || [], userMapPosts });
}

let publicDataSignature = getPublicDataSignature({ works: fallbackWorks, stores: fallbackStores, events: fallbackEvents });
let analyticsTrackEvent = null;
let analyticsPromise = null;
const analyticsQueue = [];

function trackEvent(eventName, properties = {}) {
  if (analyticsTrackEvent) {
    analyticsTrackEvent(eventName, properties);
    return;
  }
  if (analyticsQueue.length < 24) analyticsQueue.push({ eventName, properties });
}

function scheduleAnalytics() {
  const load = () => {
    if (analyticsPromise) return;
    analyticsPromise = import('./analytics.js').then(({ bindAnalytics, trackEvent: sendAnalyticsEvent }) => {
      analyticsTrackEvent = sendAnalyticsEvent;
      bindAnalytics();
      analyticsQueue.splice(0).forEach(({ eventName, properties }) => sendAnalyticsEvent(eventName, properties));
    }).catch(() => {
      analyticsPromise = null;
    });
  };
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(load, { timeout: 1500 });
  else window.setTimeout(load, 400);
}

const JAPAN_PREFECTURES = Object.freeze([
  ['01', '北海道'], ['02', '青森県'], ['03', '岩手県'], ['04', '宮城県'], ['05', '秋田県'], ['06', '山形県'], ['07', '福島県'],
  ['08', '茨城県'], ['09', '栃木県'], ['10', '群馬県'], ['11', '埼玉県'], ['12', '千葉県'], ['13', '東京都'], ['14', '神奈川県'],
  ['15', '新潟県'], ['16', '富山県'], ['17', '石川県'], ['18', '福井県'], ['19', '山梨県'], ['20', '長野県'], ['21', '岐阜県'],
  ['22', '静岡県'], ['23', '愛知県'], ['24', '三重県'], ['25', '滋賀県'], ['26', '京都府'], ['27', '大阪府'], ['28', '兵庫県'],
  ['29', '奈良県'], ['30', '和歌山県'], ['31', '鳥取県'], ['32', '島根県'], ['33', '岡山県'], ['34', '広島県'], ['35', '山口県'],
  ['36', '徳島県'], ['37', '香川県'], ['38', '愛媛県'], ['39', '高知県'], ['40', '福岡県'], ['41', '佐賀県'], ['42', '長崎県'],
  ['43', '熊本県'], ['44', '大分県'], ['45', '宮崎県'], ['46', '鹿児島県'], ['47', '沖縄県']
]);
const PREFECTURE_NAME_BY_CODE = Object.fromEntries(JAPAN_PREFECTURES);
const PREFECTURE_CODE_BY_NAME = Object.fromEntries(JAPAN_PREFECTURES.map(([code, name]) => [name, code]));
const PREFECTURE_REGION_GROUPS = Object.freeze([
  { label: '北海道', codes: ['01'] },
  { label: '東北', codes: ['02', '03', '04', '05', '06', '07'] },
  { label: '関東', codes: ['08', '09', '10', '11', '12', '13', '14'] },
  { label: '北陸・甲信越', codes: ['15', '16', '17', '18', '19', '20'] },
  { label: '東海', codes: ['21', '22', '23', '24'] },
  { label: '近畿', codes: ['25', '26', '27', '28', '29', '30'] },
  { label: '中国', codes: ['31', '32', '33', '34', '35'] },
  { label: '四国', codes: ['36', '37', '38', '39'] },
  { label: '九州・沖縄', codes: ['40', '41', '42', '43', '44', '45', '46', '47'] }
]);
// 県内の座標がまだ入力されていないイベント用の近似点。
// 正確な会場位置がある場合は、イベントデータの mapPosition を優先する。
const PREFECTURE_MAP_POINTS = Object.freeze({
  '01': { x: 74, y: 18 }, '02': { x: 72, y: 29 }, '03': { x: 72, y: 38 }, '04': { x: 69, y: 44 },
  '05': { x: 66, y: 35 }, '06': { x: 66, y: 43 }, '07': { x: 61, y: 55.5 }, '08': { x: 63, y: 59 },
  '09': { x: 61, y: 58 }, '10': { x: 59, y: 58 }, '11': { x: 61, y: 62 }, '12': { x: 63, y: 62 },
  '13': { x: 58.5, y: 66.5 }, '14': { x: 58.6, y: 68.6 }, '15': { x: 58.1, y: 48.1 }, '16': { x: 53, y: 54 },
  '17': { x: 51, y: 52 }, '18': { x: 49, y: 55 }, '19': { x: 59, y: 61 }, '20': { x: 55, y: 59 },
  '21': { x: 52, y: 60 }, '22': { x: 55, y: 65 }, '23': { x: 45.8, y: 69.1 }, '24': { x: 50, y: 66 },
  '25': { x: 48, y: 61 }, '26': { x: 39.5, y: 69.5 }, '27': { x: 36.7, y: 70.8 }, '28': { x: 43, y: 64 },
  '29': { x: 45, y: 67 }, '30': { x: 42, y: 70 }, '31': { x: 38, y: 58 }, '32': { x: 36, y: 58 },
  '33': { x: 38, y: 65 }, '34': { x: 35, y: 67 }, '35': { x: 32, y: 67 }, '36': { x: 39, y: 74 },
  '37': { x: 36, y: 74 }, '38': { x: 32, y: 74 }, '39': { x: 32, y: 79 }, '40': { x: 12, y: 78 },
  '41': { x: 27, y: 72 }, '42': { x: 25, y: 75 }, '43': { x: 24, y: 79 }, '44': { x: 27, y: 77 },
  '45': { x: 25, y: 83 }, '46': { x: 21, y: 82 }, '47': { x: 10, y: 93 }
});

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
  }[character]));
}

function loadFound() {
  try {
    const current = localStorage.getItem(FOUND_KEY);
    const legacy = localStorage.getItem(LEGACY_FOUND_KEY);
    const parsed = JSON.parse(current || legacy || '[]');
    if (!current && legacy) localStorage.setItem(FOUND_KEY, JSON.stringify(parsed));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveFound(found) {
  try { localStorage.setItem(FOUND_KEY, JSON.stringify(found)); } catch { /* local storage may be blocked */ }
}

function isFound(id) { return loadFound().includes(id); }

function isLiked(id) {
  try {
    const liked = JSON.parse(localStorage.getItem('PiXiEED:liked-works:v1') || '[]');
    return Array.isArray(liked) && liked.includes(id);
  } catch {
    return false;
  }
}

function getWork(id) {
  return works.find((work) => !isSampleWork(work) && work.id === id) || null;
}

// 公式作品は「作品」タブで見せ、ユーザー投稿は地図の発見体験に限定する。
// 外部データ側の命名揺れを吸収できるよう、投稿フラグは複数の形を受け入れる。
function isMapOnlyWork(work) {
  return Boolean(work?.mapOnly || work?.userSubmitted || work?.ownerType === 'user' || work?.source === 'user' || work?.visibility === 'map-only');
}

function getOfficialWorks() {
  return works.filter((work) => !isSampleWork(work) && !isMapOnlyWork(work));
}

function getStore(id) {
  return stores.find((store) => store.id === id) || null;
}

function getEvent(id) {
  return events.find((event) => event.id === id) || null;
}

function parseEventDate(value, endOfDay = false) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00'}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getEventTimeline(event, now = new Date()) {
  if (event?.status === 'watch') return 'watch';
  if (event?.status === 'past') return 'past';
  const start = parseEventDate(event?.startDate);
  const end = parseEventDate(event?.endDate || event?.startDate, true);
  if (!start) return 'upcoming';
  if (now < start) return 'upcoming';
  if (end && now <= end) return 'live';
  return 'past';
}

function getEventHistoryDate(event) {
  return parseEventDate(event?.lastHeldDate || event?.previousDate);
}

function eventMatchesFilter(event, filter) {
  const timeline = getEventTimeline(event);
  if (filter === 'all') return true;
  if (filter === 'past') return timeline === 'past' || (timeline === 'watch' && Boolean(getEventHistoryDate(event)));
  if (filter === 'upcoming') return timeline === 'upcoming' || timeline === 'live';
  return timeline === filter;
}

function sortEventsForFilter(list, filter) {
  return [...list].sort((a, b) => {
    const aDate = getEventHistoryDate(a) || parseEventDate(a.startDate);
    const bDate = getEventHistoryDate(b) || parseEventDate(b.startDate);
    const aValue = aDate ? aDate.getTime() : Number.MAX_SAFE_INTEGER;
    const bValue = bDate ? bDate.getTime() : Number.MAX_SAFE_INTEGER;
    return filter === 'past' ? bValue - aValue : aValue - bValue;
  });
}

function getEventStatusLabel(event) {
  return {
    upcoming: '開催予定',
    live: '開催中',
    past: '開催済み',
    watch: '情報を待っています'
  }[getEventTimeline(event)] || 'イベント';
}

function formatEventDate(value) {
  const date = parseEventDate(value);
  return date ? `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日` : '';
}

function getEventFilterCount(filter) {
  return events.filter((event) => eventMatchesFilter(event, filter)).length;
}

function getStoresForWork(workId) {
  return stores.filter((store) => store.works.includes(workId));
}

function getUserPostImageUrl(path) {
  const base = String(supabaseConfig.url || '').trim().replace(/\/$/, '');
  const bucket = encodeURIComponent(String(supabaseConfig.publicStorageBucket || 'post-public').trim());
  const safePath = String(path || '').split('/').filter(Boolean).map((part) => encodeURIComponent(part)).join('/');
  return base && safePath ? `${base}/storage/v1/object/public/${bucket}/${safePath}` : '';
}

function normalizeUserMapPost(row) {
  const id = String(row?.post_id || '').trim();
  const grid = Number(row?.cell_grid);
  const cellX = Number(row?.cell_x);
  const cellY = Number(row?.cell_y);
  const prefectureCode = String(row?.prefecture_code || '').padStart(2, '0');
  const image = getUserPostImageUrl(row?.public_image_path);
  if (!id || !image || ![64, 128, 256, 512].includes(grid)
    || !Number.isInteger(cellX) || cellX < 0 || cellX >= grid
    || !Number.isInteger(cellY) || cellY < 0 || cellY >= grid
    || !/^([0][1-9]|[1-4][0-9])$/.test(prefectureCode)) return null;
  return {
    id: `user-post-${id}`,
    title: String(row.title || '地図の投稿'),
    subtitle: String(row.caption || '地図で見つけたドット絵'),
    story: String(row.caption || ''),
    image,
    tags: ['ユーザー投稿'],
    palette: 'pixel art',
    edition: '地図の投稿',
    priceLabel: '地図で見つけた絵',
    availability: '地図で見つけた絵',
    stores: [],
    limited: false,
    mapOnly: true,
    userSubmitted: true,
    ownerType: 'user',
    source: 'user',
    visibility: 'map-only',
    prefecture: PREFECTURE_NAME_BY_CODE[prefectureCode] || 'その他',
    mapPosition: { x: ((cellX + .5) / grid) * 100, y: ((cellY + .5) / grid) * 100 },
    mapCell: { grid, x: cellX, y: cellY, prefectureCode }
  };
}

async function hydrateUserMapPosts() {
  const base = String(supabaseConfig.url || '').trim().replace(/\/$/, '');
  const publishableKey = String(supabaseConfig.publishableKey || '').trim();
  if (!base || !publishableKey) return { loaded: false, changed: false };
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 3500);
  try {
    const url = new URL(`${base}/rest/v1/${supabaseConfig.publicMapTable || 'post_map_points'}`);
    url.searchParams.set('select', 'post_id,title,caption,public_image_path,cell_grid,cell_x,cell_y,prefecture_code,published_at');
    url.searchParams.set('published_at', 'not.is.null');
    url.searchParams.set('order', 'published_at.desc');
    url.searchParams.set('limit', String(Math.min(1000, Math.max(1, Number(supabaseConfig.publicMapLimit) || 500))));
    const response = await fetch(url, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) return { loaded: false, changed: false };
    const rows = await response.json();
    const nextPosts = Array.isArray(rows) ? rows.map(normalizeUserMapPost).filter(Boolean) : [];
    const changed = JSON.stringify(nextPosts) !== JSON.stringify(userMapPosts);
    userMapPosts = nextPosts;
    publicDataSignature = getPublicDataSignature({ works, stores, events });
    return { loaded: true, changed };
  } catch {
    return { loaded: false, changed: false };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function hydrateSiteData() {
  const endpoint = String(mapConfig.publicDataEndpoint || '').trim();
  const officialPromise = endpoint ? (async () => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 3500);
    try {
      const url = new URL(endpoint, window.location.href);
      url.searchParams.set('action', 'public-data');
      const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal });
      if (!response.ok) return { loaded: false, changed: false };
      const data = await response.json();
      return applyPublicData(data, true);
    } catch { /* an unavailable endpoint must never restore sample works */ return { loaded: false, changed: false }; }
    finally {
      window.clearTimeout(timeoutId);
    }
  })() : Promise.resolve({ loaded: false, changed: false });
  const [official, userPosts] = await Promise.all([officialPromise, hydrateUserMapPosts()]);
  return {
    loaded: official.loaded || userPosts.loaded,
    changed: official.changed || userPosts.changed
  };
}

function applyPublicData(data, persist = false) {
  if (!data || !Array.isArray(data.works) || !Array.isArray(data.stores)) return { loaded: false, changed: false };
  const normalizedData = { ...data, works: publicWorksOnly(data.works) };
  const nextSignature = getPublicDataSignature(normalizedData);
  const changed = nextSignature !== publicDataSignature;
  publicDataSignature = nextSignature;
  works = normalizedData.works;
  stores = data.stores.map((store, index) => {
    const fallbackStore = fallbackStores[index % Math.max(fallbackStores.length, 1)] || {};
    return {
      ...store,
      prefecture: store.prefecture || store.area || 'その他',
      works: Array.isArray(store.works) ? store.works : [],
      location: store.location || { lat: null, lng: null, placeId: '', googleMapsUrl: '' },
      mapPosition: store.mapPosition || fallbackStore.mapPosition
    };
  });
  events = Array.isArray(data.events) ? data.events.map((event) => ({
    ...event,
    mapPosition: event.mapPosition || PREFECTURE_MAP_POINTS[getPrefectureCode(event.prefecture)] || { x: 50, y: 50 }
  })) : fallbackEvents;
  if (persist) {
    try { localStorage.setItem(PUBLIC_DATA_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data: normalizedData })); } catch { /* storage may be blocked */ }
  }
  return { loaded: true, changed };
}

function loadCachedPublicData() {
  try {
    const record = JSON.parse(localStorage.getItem(PUBLIC_DATA_CACHE_KEY) || 'null');
    const savedAt = Number(record?.savedAt || 0);
    if (!record?.data || !savedAt || Date.now() - savedAt > PUBLIC_DATA_CACHE_MAX_AGE) return false;
    return applyPublicData(record.data).loaded;
  } catch {
    return false;
  }
}

function hasCoordinates(store) {
  const rawLat = store?.location?.lat;
  const rawLng = store?.location?.lng;
  if (rawLat === null || rawLat === undefined || rawLat === '' || rawLng === null || rawLng === undefined || rawLng === '') return false;
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function getStoreCoordinates(store) {
  return hasCoordinates(store) ? { lat: Number(store.location.lat), lng: Number(store.location.lng) } : null;
}

function getGoogleMapsUrl(store) {
  const location = store?.location || {};
  if (location.googleMapsUrl) return location.googleMapsUrl;
  const coordinates = getStoreCoordinates(store);
  if (coordinates) {
    const params = new URLSearchParams({ api: '1', query: `${coordinates.lat},${coordinates.lng}` });
    if (location.placeId) params.set('query_place_id', location.placeId);
    return `https://www.google.com/maps/search/?${params.toString()}`;
  }
  if (store?.address && !store.address.includes('設定してください')) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${store.name} ${store.address}`)}`;
  }
  return '';
}

function storeMapLink(store, label = '行き方を調べる') {
  const url = getGoogleMapsUrl(store);
  return url ? `<a class="text-link" href="${escapeHtml(url)}" target="_blank" rel="noopener" data-analytics-event="map_open" data-store-id="${escapeHtml(store.id)}">${label} ↗</a>` : '';
}

function toggleFound(id) {
  const found = loadFound();
  const next = found.includes(id) ? found.filter((item) => item !== id) : [...found, id];
  saveFound(next);
  return next;
}

function tagMarkup(work) {
  return work.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
}

function workCard(work) {
  if (!work || isSampleWork(work)) return '';
  const found = isFound(work.id);
  const firstStore = getStoresForWork(work.id)[0];
  const hasSalesLocation = Array.isArray(work.stores) && work.stores.length > 0;
  return `
    <article class="market-card">
      <a class="market-card__image" href="/works/${work.id}.html" aria-label="${escapeHtml(work.title)}の詳細を見る" data-analytics-event="work_open" data-work-id="${escapeHtml(work.id)}">
        <img src="${work.image}" alt="${escapeHtml(work.title)}の作品画像" loading="lazy" decoding="async" width="1254" height="1254">
        <span class="market-card__badge">${hasSalesLocation ? (work.limited ? '店舗限定' : '販売中') : '販売準備中'}</span>
        ${found ? '<span class="market-card__found">FOUND</span>' : ''}
      </a>
      <div class="market-card__body">
        <div class="market-card__seller"><span class="market-card__avatar">P</span><span>PiXiEED</span><span class="market-card__verified">✓</span></div>
        <h3><a href="/works/${work.id}.html" data-analytics-event="work_open" data-work-id="${escapeHtml(work.id)}">${escapeHtml(work.title)}</a></h3>
        <p class="market-card__subtitle">${escapeHtml(work.subtitle)}</p>
        <div class="market-card__meta"><span>${escapeHtml(work.availability)}</span><strong>${escapeHtml(work.priceLabel)}</strong></div>
        <div class="market-card__footer">
          <span class="market-card__place">${firstStore ? escapeHtml(firstStore.name) : '店舗情報準備中'}</span>
          <a class="button button--quiet" href="/works/${work.id}.html" data-analytics-event="work_open" data-work-id="${escapeHtml(work.id)}">この絵を見る</a>
        </div>
      </div>
    </article>`;
}

function storeCard(store) {
  const limited = Boolean(store.limitedWork && getWork(store.limitedWork));
  return `
    <article class="store-card">
      <div class="store-card__image" aria-hidden="true"><span>${escapeHtml(store.route)}</span></div>
      <div class="store-card__body">
        <div class="store-card__meta"><span class="tag tag--sample">${store.sample ? 'サンプル店舗' : '絵がやってくる予定'}</span>${limited ? '<span class="tag tag--limited">限定作品あり</span>' : ''}</div>
        <h3><a href="/stores/${store.id}.html">${escapeHtml(store.name)}</a></h3>
        <p>${escapeHtml(store.area)}<br>${escapeHtml(store.description)}</p>
        <span class="store-card__route">${escapeHtml(store.status)}</span>
        <div class="store-card__links"><a class="text-link" href="/stores/${store.id}.html" data-analytics-event="store_open" data-store-id="${escapeHtml(store.id)}">お店をのぞく</a>${storeMapLink(store, '行き方を調べる')}</div>
      </div>
    </article>`;
}

function relatedWorks(workId) {
  return getOfficialWorks().filter((work) => work.id !== workId).slice(0, 3).map(workCard).join('');
}

function mapWorkMarkup(work, options = {}) {
  const mapOnly = isMapOnlyWork(work);
  const action = mapOnly
    ? `<button class="map-work" type="button" data-map-work-preview="${escapeHtml(work.id)}"${options.clusterId ? ` data-map-cluster-return="${escapeHtml(options.clusterId)}"` : ''}><img src="${work.image}" alt="" loading="lazy" decoding="async" width="1254" height="1254"><span><strong>${escapeHtml(work.title)}</strong><small>地図で見つけた作品</small></span></button>`
    : `<a class="map-work" href="/works/${work.id}.html" data-analytics-event="work_open" data-work-id="${escapeHtml(work.id)}"><img src="${work.image}" alt="" loading="lazy" decoding="async" width="1254" height="1254"><span><strong>${escapeHtml(work.title)}</strong><small>${escapeHtml(work.priceLabel)}</small></span></a>`;
  return action;
}

function getMapWorkStore(work) {
  const linkedStoreIds = [
    ...(Array.isArray(work?.stores) ? work.stores : []),
    work?.storeId
  ].filter(Boolean);
  const linkedStore = linkedStoreIds.map((id) => getStore(id)).find(Boolean);
  return linkedStore || getStoresForWork(work?.id)[0] || null;
}

function getMapWorkPrefecture(work) {
  return String(work?.prefecture || getMapWorkStore(work)?.prefecture || '').trim();
}

function getMapWorkPoint(work) {
  const linkedStore = getMapWorkStore(work);
  if (work?.mapPosition) return getMapPoint(work);
  if (linkedStore) return getMapPoint(linkedStore);
  return getMapPoint(work);
}

function getMapWorks() {
  const officialMapWorks = works.filter((work) => !isSampleWork(work) && (isMapOnlyWork(work)
    ? Boolean(work?.mapPosition && getMapWorkPrefecture(work))
    : Boolean(work?.mapPosition || getMapWorkPrefecture(work))));
  return [...officialMapWorks, ...userMapPosts];
}

function getMapPoint(store) {
  const x = Number(store?.mapPosition?.x);
  const y = Number(store?.mapPosition?.y);
  const fallback = PREFECTURE_MAP_POINTS[getPrefectureCode(store?.prefecture)] || { x: 50, y: 50 };
  return {
    x: Number.isFinite(x) ? x : fallback.x,
    y: Number.isFinite(y) ? y : fallback.y
  };
}

function getPrefectureCode(prefecture) {
  const name = String(prefecture || '').trim();
  return PREFECTURE_CODE_BY_NAME[name] || PREFECTURE_CODE_BY_NAME[`${name}県`] || '';
}

function getMapPrefectureGroups() {
  const groups = new Map();
  const ensureGroup = (item, fallback = 'その他') => {
    const prefecture = String(item?.prefecture || item?.area || fallback).trim() || fallback;
    if (!groups.has(prefecture)) groups.set(prefecture, { prefecture, stores: [], events: [], works: [] });
    return groups.get(prefecture);
  };
  stores.forEach((store) => {
    ensureGroup(store).stores.push(store);
  });
  events.forEach((event) => {
    ensureGroup(event).events.push(event);
  });
  getMapWorks().forEach((work) => {
    const group = ensureGroup({ prefecture: getMapWorkPrefecture(work), area: 'その他' });
    group.works.push(work);
  });
  return [...groups.values()].map((group, index) => {
    const points = [
      ...group.stores.map(getMapPoint),
      ...group.events.map(getMapPoint),
      ...group.works.map(getMapWorkPoint)
    ];
    return {
      ...group,
      id: `map-region-${index}`,
      code: getPrefectureCode(group.prefecture),
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length
    };
  });
}

function mapRegionShortcutMarkup(group) {
  const contentCount = group.stores.length + group.events.length + group.works.length;
  const detail = [group.stores.length ? `店舗${group.stores.length}件` : '', group.events.length ? `イベント${group.events.length}件` : '', group.works.length ? `作品${group.works.length}点` : ''].filter(Boolean).join('・');
  return `<button class="japan-map__region" type="button" data-map-region="${escapeHtml(group.id)}" data-prefecture-code="${escapeHtml(group.code)}" data-prefecture-name="${escapeHtml(group.prefecture)}" data-region-x="${group.x}" data-region-y="${group.y}" aria-label="${escapeHtml(group.prefecture)}の${escapeHtml(detail || '情報')}を拡大して見る">${escapeHtml(group.prefecture)}<small>${contentCount}</small></button>`;
}

function regionPickerMarkup(mapGroups) {
  const groupedCodes = new Set(PREFECTURE_REGION_GROUPS.flatMap((region) => region.codes));
  const sections = PREFECTURE_REGION_GROUPS.map((region) => {
    const groups = mapGroups.filter((group) => region.codes.includes(group.code));
    if (!groups.length) return '';
    return `<section class="japan-map__region-group"><h3>${escapeHtml(region.label)}</h3><div class="japan-map__region-list">${groups.map(mapRegionShortcutMarkup).join('')}</div></section>`;
  }).join('');
  const otherGroups = mapGroups.filter((group) => !groupedCodes.has(group.code));
  const otherMarkup = otherGroups.length ? `<section class="japan-map__region-group"><h3>その他</h3><div class="japan-map__region-list">${otherGroups.map(mapRegionShortcutMarkup).join('')}</div></section>` : '';
  return `<details class="japan-map__region-picker"><summary><span data-region-picker-label>県を選ぶ</span><small>${mapGroups.length}エリア</small></summary><div class="japan-map__region-panel">${sections}${otherMarkup}</div></details>`;
}

function getMapSplitOffset(item, collection, scale = 1) {
  const point = getMapPoint(item);
  const nearby = collection.filter((other) => {
    const otherPoint = getMapPoint(other);
    return Math.hypot(otherPoint.x - point.x, otherPoint.y - point.y) <= 2.4;
  });
  if (nearby.length < 2) return { x: 0, y: 0 };
  const order = nearby.findIndex((other) => other.id === item.id);
  const angle = (order / nearby.length) * Math.PI * 2 - Math.PI / 2;
  // 全国表示では重なりを避け、県内を拡大したら登録地点そのものへ戻す。
  // 県内表示で分離すると、県境の外へ見えるため3倍以上では分離しない。
  const spread = scale >= 3 ? 0 : 42 / Math.max(scale, 1);
  return { x: Math.cos(angle) * spread, y: Math.sin(angle) * spread };
}

function getEventDateLabel(event, filter = '') {
  if (filter === 'past' && event?.status === 'watch') {
    const history = formatEventDate(event.lastHeldDate || event.previousDate);
    if (history) return `前回開催：${history}`;
  }
  return event.dateLabel || (event.status === 'watch' ? '次回開催情報待ち' : '日程未定');
}

function getEventKindLabel(event) {
  return {
    'pixel-art': 'ドット絵中心',
    'indie-game': 'インディーゲーム',
    'creator-market': '創作・即売会'
  }[event?.kind] || 'イベント';
}

function eventRadarCard(event, filter = '') {
  const timeline = getEventTimeline(event);
  const hasHistory = Boolean(getEventHistoryDate(event));
  const tag = filter === 'past' && timeline === 'watch' && hasHistory ? '前回開催' : getEventStatusLabel(event);
  const cardTimeline = filter === 'past' && timeline === 'watch' && hasHistory ? 'past' : timeline;
  const sourceMarkup = event.sourceUrl ? `<a class="text-link" href="${escapeHtml(event.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(event.sourceLabel || '公式情報')}を見る</a>` : '<span class="event-radar-card__source-note">公式情報待ち</span>';
  return `<article class="event-radar-card event-radar-card--${cardTimeline}">
    <div class="event-radar-card__mark" aria-hidden="true">✦</div>
    <div class="event-radar-card__body">
      <div class="event-radar-card__meta"><span class="tag tag--event">${tag}</span><span class="tag tag--event-kind">${escapeHtml(getEventKindLabel(event))}</span><span>${escapeHtml(event.area)}</span></div>
      <h3>${escapeHtml(event.name)}</h3>
      <p>${escapeHtml(getEventDateLabel(event, filter))} · ${escapeHtml(event.venue)}</p>
      ${sourceMarkup}
    </div>
  </article>`;
}

function renderDiscoveryMap(root) {
  if (!root) return;
  const fieldMode = root.dataset.mapMode === 'field';
  const mapGroups = getMapPrefectureGroups();
  const defaultEventFilter = 'upcoming';
  const radarEvents = sortEventsForFilter(events.filter((event) => eventMatchesFilter(event, defaultEventFilter)), defaultEventFilter).slice(0, 6);
  const eventFilterOptions = [
    ['upcoming', 'これから・開催中'],
    ['past', '過去の開催'],
    ['watch', '情報を待っています'],
    ['all', 'すべて']
  ];
  const eventFilterMarkup = eventFilterOptions.map(([value, label]) => `<option value="${value}">${label}（${getEventFilterCount(value)}）</option>`).join('');
  const explorerClass = fieldMode ? 'map-explorer map-explorer--field' : 'map-explorer';
  const introMarkup = fieldMode ? '' : `<div class="map-explorer__top map-explorer__top--visual" role="group" aria-label="掲載情報"><span class="map-explorer__visual-stack" aria-hidden="true"><i></i><i></i><i></i></span><div class="map-explorer__visual-counts"><span aria-label="店舗 ${stores.length}件"><strong>${stores.length}</strong><small>店舗</small></span><span aria-label="イベント ${events.length}件"><strong>${events.length}</strong><small>イベント</small></span><span aria-label="作品 ${works.length}点"><strong>${works.length}</strong><small>作品</small></span></div></div>`;
  root.innerHTML = `
    <div class="${explorerClass}">
      ${introMarkup}
      <div class="map-surface map-surface--japan${fieldMode ? ' map-surface--field' : ''}" data-map-surface>
        <div class="japan-map__layers" data-map-layers role="group" aria-label="地図レイヤー">
          <button class="japan-map__layer is-active" type="button" data-map-layer="all" aria-pressed="true">全て表示</button>
          <button class="japan-map__layer" type="button" data-map-layer="works" aria-pressed="false">投稿マップ</button>
          <button class="japan-map__layer" type="button" data-map-layer="events" aria-pressed="false">イベントマップ</button>
          <button class="japan-map__layer" type="button" data-map-layer="stores" aria-pressed="false">店舗マップ</button>
          <button class="japan-map__layer japan-map__layer--post" type="button" data-map-post><span aria-hidden="true">＋</span>絵を置く</button>
        </div>
        <div class="map-illustration map-illustration--japan" data-map-illustration>
          <div class="japan-map__viewport" data-japan-map-viewport tabindex="0" aria-label="セルでできた日本地図。掲載情報のセルを選ぶか、ドラッグや拡大縮小ボタンで操作できます。">
            <div class="japan-map__canvas" data-japan-map-canvas>
              <div class="japan-map__cells" data-japan-map-cells aria-label="セルでできた地図"></div>
              <div class="japan-map__content-cells" data-japan-map-content-cells aria-label="掲載情報のセル"></div>
              <div class="japan-map__asset-wrap" data-japan-map-asset aria-busy="true"></div>
            </div>
            <div class="japan-map__geometry-probe" data-japan-map-geometry-probe aria-hidden="true"></div>
          </div>
          <div class="japan-map__controls" aria-label="地図の拡大縮小">
            <button class="japan-map__control" type="button" data-map-zoom="in" aria-label="地図を拡大">＋</button>
            <button class="japan-map__control" type="button" data-map-zoom="out" aria-label="地図を縮小">−</button>
            <button class="japan-map__control japan-map__control--reset" type="button" data-map-zoom="reset" aria-label="日本全体に戻す">全体</button>
          </div>
          <div class="japan-map__zoom-status" data-map-zoom-status aria-live="polite">日本全体 100%</div>
          <p class="japan-map__credit">地図データ：Geolonia / Wikipedia</p>
        </div>
        <aside class="map-popover" data-map-popover hidden></aside>
        <div class="map-surface__stamp" aria-hidden="true">PiXiEED<br><small>ART MAP</small></div>
      </div>
      <div class="map-explorer__legend"><span class="map-density-legend" title="空セル・水色・緑・黄色・赤の順に件数が増えます"><i aria-hidden="true"></i><small>なし</small><small>多い</small></span><span class="map-explorer__source" data-map-source>セルで見つけるPiXiEED独自マップ</span><a class="text-link" href="/stores/">すべて見る</a></div>
      <section class="map-event-radar" aria-labelledby="map-event-radar-title"><div class="map-event-radar__heading"><span class="eyebrow">event radar</span><h3 id="map-event-radar-title">ドット絵イベント</h3></div><div class="map-event-radar__body"><div class="map-event-radar__toolbar"><label for="map-event-filter">イベントの表示</label><select id="map-event-filter" data-event-filter>${eventFilterMarkup}</select><span data-event-filter-count aria-live="polite">${getEventFilterCount(defaultEventFilter)}件</span></div><div class="map-event-radar__list" data-event-radar-list>${radarEvents.map((event) => eventRadarCard(event, defaultEventFilter)).join('')}</div><button class="map-event-radar__more" type="button" data-event-more hidden aria-expanded="false">すべて表示</button></div></section>
    </div>`;
  const cellRoot = root.querySelector('[data-japan-map-cells]');
  const mapCanvas = root.querySelector('[data-japan-map-canvas]');
  const mapViewport = root.querySelector('[data-japan-map-viewport]');
  const assetHost = root.querySelector('[data-japan-map-asset]');
  const geometryProbeHost = root.querySelector('[data-japan-map-geometry-probe]');
  const popover = root.querySelector('[data-map-popover]');
  let postComposer = null;
  let postComposerPromise = null;
  let isSelectingPostCell = false;
  const openPostComposer = (context = {}) => {
    if (!postComposerPromise) {
      postComposerPromise = import('./post-composer.js?rev=20260918-post-v1').then(({ bindUserPostComposer }) => {
        postComposer = bindUserPostComposer(root, {
          onRequestMapCell: () => {
            isSelectingPostCell = true;
            showToast('地図上のセルを選んでください。');
          },
          onSubmitted: () => showToast('投稿を受け付けました。')
        });
        return postComposer;
      });
    }
    return postComposerPromise.then((composer) => {
      if (!composer) return;
      closePopover();
      isSelectingPostCell = false;
      composer.open(context);
    }).catch(() => showToast('投稿画面を開けませんでした。'));
  };
  const radarList = root.querySelector('[data-event-radar-list]');
  const radarFilter = root.querySelector('[data-event-filter]');
  const radarCount = root.querySelector('[data-event-filter-count]');
  const radarMore = root.querySelector('[data-event-more]');
  let activeEventFilter = defaultEventFilter;
  let showAllRadarEvents = false;
  const renderEventRadar = () => {
    if (!radarList) return;
    const matchingEvents = sortEventsForFilter(events.filter((event) => eventMatchesFilter(event, activeEventFilter)), activeEventFilter);
    const visibleEvents = showAllRadarEvents ? matchingEvents : matchingEvents.slice(0, 6);
    radarList.innerHTML = visibleEvents.length ? visibleEvents.map((event) => eventRadarCard(event, activeEventFilter)).join('') : '<p class="map-event-radar__empty">この分類のイベントはまだありません。</p>';
    if (radarCount) radarCount.textContent = `${matchingEvents.length}件`;
    if (radarMore) {
      radarMore.hidden = matchingEvents.length <= 6;
      radarMore.textContent = showAllRadarEvents ? '折りたたむ' : `すべて表示（${matchingEvents.length}件）`;
      radarMore.setAttribute('aria-expanded', String(showAllRadarEvents));
    }
  };
  radarFilter?.addEventListener('change', () => {
    activeEventFilter = radarFilter.value;
    showAllRadarEvents = false;
    renderEventRadar();
  });
  radarMore?.addEventListener('click', () => {
    showAllRadarEvents = !showAllRadarEvents;
    renderEventRadar();
  });
  renderEventRadar();
  let activeMapLayer = 'all';
  let currentMapScale = 1;
  const mapLayerButtons = [...root.querySelectorAll('[data-map-layer]')];
  const selectMapLayer = (layer) => {
    const nextLayer = ['all', 'works', 'events', 'stores'].includes(layer) ? layer : 'all';
    activeMapLayer = nextLayer;
    root.dataset.mapLayer = nextLayer;
    mapLayerButtons.forEach((button) => {
      const isActive = button.dataset.mapLayer === nextLayer;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
    closePopover();
    renderCells(currentMapScale, { immediate: true });
  };
  mapLayerButtons.forEach((button) => {
    button.addEventListener('click', () => selectMapLayer(button.dataset.mapLayer || 'all'));
  });
  root.querySelector('[data-map-post]')?.addEventListener('click', (event) => {
    event.preventDefault();
    openPostComposer({ returnFocus: event.currentTarget });
  });
  let mapController = null;
  let activePrefectureCode = '';
  let suppressFocusActivation = false;
  let popoverLocked = false;
  let activeContentItemKeys = new Set();
  const mapItems = [
    ...stores.map((store) => ({
      id: store.id,
      key: `store:${store.id}`,
      kind: 'store',
      source: store,
      prefecture: String(store.prefecture || store.area || 'その他'),
      prefectureCode: getPrefectureCode(store.prefecture),
      point: getMapPoint(store),
      precise: Boolean(store.mapPosition)
    })),
    ...events.map((event) => ({
      id: event.id,
      key: `event:${event.id}`,
      kind: 'event',
      source: event,
      prefecture: String(event.prefecture || event.area || 'その他'),
      prefectureCode: getPrefectureCode(event.prefecture),
      point: getMapPoint(event),
      precise: Boolean(event.mapPosition)
    })),
    // 公式ポストカードは「店舗」レイヤーで店舗として見せ、
    // 「投稿マップ」にはユーザー投稿だけを載せる。
    ...getMapWorks().filter((work) => isMapOnlyWork(work)).map((work) => ({
      id: work.id,
      key: `work:${work.id}`,
      kind: 'work',
      source: work,
      prefecture: getMapWorkPrefecture(work) || 'その他',
      prefectureCode: getPrefectureCode(getMapWorkPrefecture(work)),
      point: getMapWorkPoint(work),
      precise: Boolean(work.mapPosition || getMapWorkStore(work))
    }))
  ];
  const clusterRegistry = new Map();
  let prefectureGeometry = new Map();
  const prefectureBoundaryCache = new Map();
  const cellGeometryCache = new Map();
  const cellAddressCache = new Map();
  const cellContentRegistry = new Map();
  let cellGeometrySnapshotCache = null;
  let lastCellRenderSignature = '';

  const getCellCoordinate = (grid, point, prefectureCode = '') => {
    const safeX = Math.min(99.999999, Math.max(0, Number(point?.x) || 0));
    const safeY = Math.min(99.999999, Math.max(0, Number(point?.y) || 0));
    const cellX = Math.min(grid - 1, Math.max(0, Math.floor((safeX / 100) * grid)));
    const cellY = Math.min(grid - 1, Math.max(0, Math.floor((safeY / 100) * grid)));
    const code = String(prefectureCode || '').padStart(2, '0');
    return { cellX, cellY, code, key: `${grid}:${cellX}:${cellY}:${code}` };
  };

  const getCellAddressForItem = (grid, item, snapshot) => {
    const cacheKey = `${grid}:${item.key}:${item.prefectureCode}`;
    if (cellAddressCache.has(cacheKey)) return cellAddressCache.get(cacheKey);
    const address = getCellCoordinate(grid, item.point, item.prefectureCode);
    const targetCode = address.code;
    if (!targetCode || findCellPrefecture(grid, address.cellX, address.cellY, snapshot) === targetCode) {
      cellAddressCache.set(cacheKey, address);
      return address;
    }
    // 座標が県境上に少しだけ食い込んでいても、所属県の最寄りセルへ寄せる。
    // これにより「店舗は神奈川なのに隣県のセルが光る」状態を防ぐ。
    let closest = null;
    for (let radius = 1; radius <= 4 && !closest; radius += 1) {
      for (let y = address.cellY - radius; y <= address.cellY + radius; y += 1) {
        for (let x = address.cellX - radius; x <= address.cellX + radius; x += 1) {
          if (x < 0 || y < 0 || x >= grid || y >= grid) continue;
          if (findCellPrefecture(grid, x, y, snapshot) !== targetCode) continue;
          const cellSize = 100 / grid;
          const center = { x: (x + .5) * cellSize, y: (y + .5) * cellSize };
          const distance = Math.hypot(center.x - item.point.x, center.y - item.point.y);
          if (!closest || distance < closest.distance) closest = { x, y, distance };
        }
      }
    }
    if (!closest) {
      cellAddressCache.set(cacheKey, address);
      return address;
    }
    const correctedAddress = { cellX: closest.x, cellY: closest.y, code: targetCode, key: `${grid}:${closest.x}:${closest.y}:${targetCode}` };
    cellAddressCache.set(cacheKey, correctedAddress);
    return correctedAddress;
  };

  const getCellContentItems = (scale) => {
    const isPrefectureFocused = Boolean(activePrefectureCode && scale >= 2.35);
    const candidates = isPrefectureFocused
      ? mapItems.filter((item) => item.prefectureCode === activePrefectureCode && isPointWithinPrefecture(item))
      : mapItems;
    return candidates.filter((item) => {
      if (!item.prefectureCode) return false;
      if (activeMapLayer === 'works') return item.kind === 'work';
      if (activeMapLayer === 'events') return item.kind === 'event';
      if (activeMapLayer === 'stores') return item.kind === 'store';
      return true;
    });
  };

  // 色の基準はズーム中も変えない。現在の細分化グリッドの最大値を使うと、
  // 1件ずつに分かれた瞬間に全セルが赤へ戻ってしまうため、全国表示と同じ
  // 64分割の基準セルで最大件数を一度決め、細分化後もその値を使い続ける。
  const getDensityReferenceMaximum = (items) => {
    const referenceCounts = new Map();
    items.forEach((item) => {
      const address = getCellCoordinate(64, item.point, item.prefectureCode);
      const key = `${address.cellX}:${address.cellY}:${address.code}`;
      referenceCounts.set(key, (referenceCounts.get(key) || 0) + 1);
    });
    return Math.max(1, ...referenceCounts.values());
  };

  const getCellContentCounts = (items) => items.reduce((counts, item) => {
    counts[`${item.kind}s`] += 1;
    return counts;
  }, { stores: 0, events: 0, works: 0 });

  const getCellContentKind = (items) => {
    const counts = getCellContentCounts(items);
    if (counts.events && !counts.stores && !counts.works) return 'event';
    if (counts.stores && !counts.events && !counts.works) return 'store';
    if (counts.works && !counts.events && !counts.stores) return 'work';
    return 'mixed';
  };

  // 空セルを含めて、水色 → 緑 → 黄色 → 赤へ滑らかに補間する。
  // カテゴリではなく、選択中レイヤー内の件数割合だけを色へ変換する。
  const CELL_DENSITY_COLOR_STOPS = Object.freeze([
    { position: 0, hue: 198, saturation: 55, lightness: 80 },
    { position: .25, hue: 190, saturation: 58, lightness: 74 },
    { position: .5, hue: 125, saturation: 58, lightness: 60 },
    { position: .75, hue: 54, saturation: 72, lightness: 58 },
    { position: 1, hue: 0, saturation: 62, lightness: 46 }
  ]);
  const getCellDensityColor = (density) => {
    const value = Math.min(1, Math.max(0, Number(density) || 0));
    let start = CELL_DENSITY_COLOR_STOPS[0];
    let end = CELL_DENSITY_COLOR_STOPS[CELL_DENSITY_COLOR_STOPS.length - 1];
    for (let index = 1; index < CELL_DENSITY_COLOR_STOPS.length; index += 1) {
      if (value <= CELL_DENSITY_COLOR_STOPS[index].position) {
        end = CELL_DENSITY_COLOR_STOPS[index];
        start = CELL_DENSITY_COLOR_STOPS[index - 1];
        break;
      }
    }
    const span = Math.max(.0001, end.position - start.position);
    const ratio = (value - start.position) / span;
    return {
      hue: start.hue + ((end.hue - start.hue) * ratio),
      saturation: start.saturation + ((end.saturation - start.saturation) * ratio),
      lightness: start.lightness + ((end.lightness - start.lightness) * ratio)
    };
  };

  const getCellContentSummary = (items) => {
    const counts = getCellContentCounts(items);
    return [
      counts.works ? `作品${counts.works}` : '',
      counts.stores ? `店舗${counts.stores}` : '',
      counts.events ? `イベント${counts.events}` : ''
    ].filter(Boolean).join('・');
  };
  // 同じ正方形セルの数だけをズームに応じて増やす。全国表示では軽く、
  // 県内へ入るほど細かくする。将来の世界地図でも同じLODをタイル単位で再利用する。
  // 全国表示でも関東のような近接県を同じセルへ押し込まない。
  // 64分割を初期解像度にし、さらに拡大した時だけ細分化する。
  const CELL_GRID_LEVELS = [64, 64, 128, 256, 512];
  const getCellGridSize = (scale) => {
    if (scale < 2.5) return CELL_GRID_LEVELS[0];
    if (scale < 5) return CELL_GRID_LEVELS[1];
    if (scale < 10) return CELL_GRID_LEVELS[2];
    if (scale < 24) return CELL_GRID_LEVELS[3];
    return CELL_GRID_LEVELS[4];
  };

  const getCellGeometrySnapshot = () => {
    const svg = geometryProbeHost?.querySelector('svg') || assetHost?.querySelector('svg.japan-map__asset');
    const svgRect = svg?.getBoundingClientRect();
    if (!svg || !svgRect?.width || !svgRect.height || !prefectureGeometry.size) return null;
    // 判定用SVGは固定サイズだが、フォント読み込みやリサイズ、ページスクロールで
    // 画面上の矩形は変わる。矩形が同じ間は、県の外接矩形と逆行列を再利用する。
    const rectKey = [svgRect.left, svgRect.top, svgRect.width, svgRect.height]
      .map((value) => Math.round(value * 100) / 100)
      .join(':');
    if (cellGeometrySnapshotCache?.svg === svg && cellGeometrySnapshotCache.key === rectKey) {
      return cellGeometrySnapshotCache.snapshot;
    }
    const viewBox = svg.viewBox?.baseVal;
    const screenMatrix = typeof svg.getScreenCTM === 'function' ? svg.getScreenCTM() : null;
    // 表示用SVGはズーム・パンで移動するため、固定サイズの判定用SVGと
    // 混ぜない。ここでは必ず判定用SVG自身の県図形を使う。
    const geometryRegions = [...svg.querySelectorAll('g.prefecture[data-code]')];
    const regions = geometryRegions.map((region) => {
      const code = String(region.dataset.code || '').padStart(2, '0');
      const rect = region.getBoundingClientRect();
      return {
        code,
        region,
        bounds: {
          left: ((rect.left - svgRect.left) / svgRect.width) * 100,
          top: ((rect.top - svgRect.top) / svgRect.height) * 100,
          right: ((rect.right - svgRect.left) / svgRect.width) * 100,
          bottom: ((rect.bottom - svgRect.top) / svgRect.height) * 100
        },
        // 分割中に毎回 getScreenCTM().inverse() を呼ばないように、
        // 図形ごとの逆行列を一度だけ求めておく。
        shapes: [...region.querySelectorAll('path, polygon, rect, circle, ellipse')].map((shape) => {
          let inverse = null;
          if (typeof shape.getScreenCTM === 'function') {
            try {
              inverse = shape.getScreenCTM()?.inverse() || null;
            } catch {
              inverse = null;
            }
          }
          return { shape, inverse };
        })
      };
    });
    const snapshot = {
      svg,
      svgRect,
      viewBox: viewBox ? { x: viewBox.x, y: viewBox.y, width: viewBox.width, height: viewBox.height } : null,
      screenMatrix,
      regions
    };
    cellGeometrySnapshotCache = { svg, key: rectKey, snapshot };
    return snapshot;
  };

  const findCellPrefecture = (grid, cellX, cellY, snapshot) => {
    const cacheKey = `${grid}:${cellX}:${cellY}`;
    if (cellGeometryCache.has(cacheKey)) return cellGeometryCache.get(cacheKey);
    const cellSize = 100 / grid;
    const samples = [
      [.5, .5], [.2, .2], [.8, .2], [.2, .8], [.8, .8]
    ];
    const hits = new Map();
    const findShapeHit = (x, y) => {
      if (!snapshot.viewBox || !snapshot.screenMatrix || typeof DOMPoint !== 'function') return '';
      const screenPoint = new DOMPoint(
        snapshot.viewBox.x + (x / 100) * snapshot.viewBox.width,
        snapshot.viewBox.y + (y / 100) * snapshot.viewBox.height
      ).matrixTransform(snapshot.screenMatrix);
      const epsilon = Math.max(.25, cellSize * 1.25);
      const region = snapshot.regions.find((entry) => {
        // まず県の外接矩形で候補を絞り、北海道や沖縄など遠い県の
        // 図形判定を毎セル・毎サンプルで実行しない。
        if (x < entry.bounds.left - epsilon || x > entry.bounds.right + epsilon
          || y < entry.bounds.top - epsilon || y > entry.bounds.bottom + epsilon) return false;
        return entry.shapes.some(({ shape, inverse }) => {
          if (!inverse || typeof shape.isPointInFill !== 'function') return false;
        try {
            return shape.isPointInFill(screenPoint.matrixTransform(inverse));
        } catch {
          return false;
        }
        });
      });
      return region?.code || '';
    };
    for (const [sampleX, sampleY] of samples) {
      const x = (cellX + sampleX) * cellSize;
      const y = (cellY + sampleY) * cellSize;
      const shapeCode = findShapeHit(x, y);
      if (shapeCode) {
        hits.set(shapeCode, (hits.get(shapeCode) || 0) + 1);
        // 通常のセルは中心だけで県が一意に決まる。ここで終了すると、
        // 県内の大半のセルでは残り4回のSVG判定を行わずに済む。
        if (sampleX === .5 && sampleY === .5) break;
        continue;
      }
      const screenX = snapshot.svgRect.left + (x / 100) * snapshot.svgRect.width;
      const screenY = snapshot.svgRect.top + (y / 100) * snapshot.svgRect.height;
      const element = document.elementFromPoint(screenX, screenY);
      const region = element?.closest?.('[data-japan-map-geometry-probe] .prefecture, [data-japan-map-asset] .prefecture');
      const code = region?.dataset.code ? String(region.dataset.code).padStart(2, '0') : '';
      if (code) hits.set(code, (hits.get(code) || 0) + 1);
    }
    const code = [...hits.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || '';
    cellGeometryCache.set(cacheKey, code);
    return code;
  };

  const getVisibleCellRange = (tile) => {
    const tileRect = tile.getBoundingClientRect();
    const viewportRect = mapViewport?.getBoundingClientRect();
    const grid = Number(tile.dataset.cellGrid || 0);
    if (!grid || !viewportRect || !tileRect.width || !tileRect.height || tileRect.right <= viewportRect.left || tileRect.left >= viewportRect.right || tileRect.bottom <= viewportRect.top || tileRect.top >= viewportRect.bottom) return null;
    return {
      startX: Math.max(0, Math.floor(((viewportRect.left - tileRect.left) / tileRect.width) * grid) - 1),
      endX: Math.min(grid - 1, Math.ceil(((viewportRect.right - tileRect.left) / tileRect.width) * grid) + 1),
      startY: Math.max(0, Math.floor(((viewportRect.top - tileRect.top) / tileRect.height) * grid) - 1),
      endY: Math.min(grid - 1, Math.ceil(((viewportRect.bottom - tileRect.top) / tileRect.height) * grid) + 1)
    };
  };

  const getCellLayoutSnapshot = (grid) => {
    const tiles = [mapCanvas, ...root.querySelectorAll('.japan-map__canvas--wrap-tile')];
    const ranges = tiles.map((tile) => {
      tile.dataset.cellGrid = String(grid);
      return getVisibleCellRange(tile);
    });
    return {
      tiles,
      ranges,
      signature: `${grid}:${activeMapLayer}:${activePrefectureCode}:${ranges.map((range) => range ? `${range.startX}:${range.endX}:${range.startY}:${range.endY}` : 'off').join('|')}`
    };
  };

  const getVisibleContentItems = (items, grid, ranges, preservedItemKeys = new Set()) => {
    const visibleRanges = ranges.filter(Boolean);
    if (!visibleRanges.length) return [];
    // 県境補正で最大4セル移動するため、その分だけ先読みする。
    // それ以上離れた投稿は、現在の表示には影響しない。
    const overscan = 4;
    return items.filter((item) => {
      if (preservedItemKeys.has(item.key)) return true;
      const address = getCellCoordinate(grid, item.point, item.prefectureCode);
      return visibleRanges.some((range) => (
        address.cellX >= range.startX - overscan && address.cellX <= range.endX + overscan
        && address.cellY >= range.startY - overscan && address.cellY <= range.endY + overscan
      ));
    });
  };

  const renderCellsNow = (scale) => {
    if (!cellRoot || !mapCanvas || !prefectureGeometry.size || !assetHost?.querySelector('svg.japan-map__asset')) return;
    const grid = getCellGridSize(scale);
    const cellLayout = getCellLayoutSnapshot(grid);
    // パン・ホイール・ピンチ中もrender()は滑らかさのために続けるが、
    // 表示範囲とLODが変わらない間はセルDOMを作り直さない。
    if (cellLayout.signature === lastCellRenderSignature) return;
    const snapshot = getCellGeometrySnapshot();
    if (!snapshot) return;
    const contentItems = getCellContentItems(scale);
    const densityReferenceMaximum = getDensityReferenceMaximum(contentItems);
    const visibleContentItems = getVisibleContentItems(contentItems, grid, cellLayout.ranges, activeContentItemKeys);
    const contentIndex = new Map();
    cellContentRegistry.clear();
    clusterRegistry.clear();
    visibleContentItems.forEach((item) => {
      const address = getCellAddressForItem(grid, item, snapshot);
      if (!contentIndex.has(address.key)) {
        contentIndex.set(address.key, {
          key: address.key,
          cellKey: address.key,
          cellX: address.cellX,
          cellY: address.cellY,
          code: address.code,
          items: []
        });
      }
      contentIndex.get(address.key).items.push(item);
    });
    const contentGroups = [...contentIndex.values()];
    contentIndex.forEach((group) => {
      const cellSize = 100 / grid;
      group.point = { x: (group.cellX + .5) * cellSize, y: (group.cellY + .5) * cellSize };
      group.prefecture = PREFECTURE_NAME_BY_CODE[group.code] || 'この県';
      group.label = group.prefecture;
      group.kind = getCellContentKind(group.items);
      // 基準セルの最大件数に対して色を決める。ズームでセルが分かれても、
      // その場所の「混み具合」が突然赤へ戻らないようにする。
      group.density = Math.min(1, group.items.length / densityReferenceMaximum);
      group.clusterId = `cell:${group.key}`;
      clusterRegistry.set(group.clusterId, group);
      cellContentRegistry.set(group.key, group);
    });
    // 画面表示用SVGとは別に、固定サイズの透明な判定用SVGを使う。
    // ズーム中の巨大なSVGやセル自身にヒットテストが奪われないための分離層。
    const geometryProbe = geometryProbeHost?.querySelector('svg');
    const cellLayers = [...root.querySelectorAll('[data-japan-map-cells]')];
    const contentCellLayers = [...root.querySelectorAll('[data-japan-map-content-cells]')];
    const interactiveCellLayers = [...cellLayers, ...contentCellLayers];
    const cellButtons = interactiveCellLayers.flatMap((layer) => [...layer.querySelectorAll('[data-map-cell]')]);
    const activeContentKeys = new Set(activeContentItemKeys);
    const previousPointerEvents = interactiveCellLayers.map((layer) => layer.style.pointerEvents);
    const previousCellButtonPointerEvents = cellButtons.map((button) => button.style.pointerEvents);
    const previousProbePointerEvents = geometryProbeHost?.style.pointerEvents || '';
    interactiveCellLayers.forEach((layer) => { layer.style.pointerEvents = 'none'; });
    // 親レイヤーだけを無効にしても、セル側の pointer-events:auto が
    // 優先されるため、形状判定中はボタン自身もヒットテストから外す。
    cellButtons.forEach((button) => { button.style.pointerEvents = 'none'; });
    if (geometryProbeHost) geometryProbeHost.style.pointerEvents = 'auto';
    if (geometryProbe) geometryProbe.style.pointerEvents = 'auto';
    const { tiles, ranges } = cellLayout;
    let renderedCellCount = 0;
    try {
      tiles.forEach((tile, tileIndex) => {
        const layer = tile.querySelector('[data-japan-map-cells]');
        if (!layer) return;
        const contentLayer = tile.querySelector('[data-japan-map-content-cells]');
        tile.dataset.cellGrid = String(grid);
        const range = ranges[tileIndex];
        if (!range) {
          layer.replaceChildren();
          layer.dataset.cellLayoutKey = '';
          contentLayer?.replaceChildren();
          if (contentLayer) contentLayer.dataset.cellLayoutKey = '';
          return;
        }
        const layoutKey = `${grid}:${activeMapLayer}:${activePrefectureCode}:${range.startX}:${range.endX}:${range.startY}:${range.endY}`;
        if (layer.dataset.cellLayoutKey === layoutKey && contentLayer?.dataset.cellLayoutKey === layoutKey) {
          renderedCellCount += layer.childElementCount;
          renderedCellCount += contentLayer?.childElementCount || 0;
          return;
        }
          const cellSize = 100 / grid;
          const markup = [];
          for (let cellY = range.startY; cellY <= range.endY; cellY += 1) {
            for (let cellX = range.startX; cellX <= range.endX; cellX += 1) {
            const code = findCellPrefecture(grid, cellX, cellY, snapshot);
            if (!code) continue;
            const cellKey = `${grid}:${cellX}:${cellY}:${code}`;
            const prefecture = PREFECTURE_NAME_BY_CODE[code] || 'この県';
            markup.push(`<button class="japan-map__cell" type="button" data-map-cell data-prefecture-code="${code}" data-cell-key="${escapeHtml(cellKey)}" data-cell-x="${cellX}" data-cell-y="${cellY}" data-cell-kind="" data-cell-count="0" aria-expanded="false" tabindex="-1" aria-label="${escapeHtml(`${prefecture}。セルを選んで拡大`)}" style="left:${cellX * cellSize}%;top:${cellY * cellSize}%;width:${cellSize}%;height:${cellSize}%;"></button>`);
          }
        }
        layer.innerHTML = markup.join('');
        layer.dataset.cellLayoutKey = layoutKey;
        // 掲載セルも空セルと同じく表示範囲だけをDOM化する。投稿数が増えても、
        // 画面外のセルがズームやパンのたびに生成されないようにする。
        const visibleContentGroups = contentGroups.filter((group) => {
          const isActive = group.items.some((item) => activeContentKeys.has(item.key));
          return isActive || (
            group.cellX >= range.startX && group.cellX <= range.endX
            && group.cellY >= range.startY && group.cellY <= range.endY
          );
        });
        const contentMarkup = visibleContentGroups.map((group) => {
          const contentCount = group.items.length;
          const densityColor = getCellDensityColor(group.density);
          const contentSummary = getCellContentSummary(group.items);
          // ズームでセルが細分化された場合も、元の選択セルに含まれていた
          // 情報を持つ新セルへ選択状態を引き継ぐ。
          const isActive = group.items.some((item) => activeContentKeys.has(item.key));
          const stateClass = [
            'japan-map__cell',
            'has-content',
            `has-${group.kind}`,
            isActive ? 'is-active' : ''
          ].filter(Boolean).join(' ');
          const densityStyle = `--cell-density:${group.density.toFixed(3)};--cell-hue:${densityColor.hue.toFixed(2)};--cell-saturation:${densityColor.saturation.toFixed(2)}%;--cell-lightness:${densityColor.lightness.toFixed(2)}%;left:${group.cellX * cellSize}%;top:${group.cellY * cellSize}%;width:${cellSize}%;height:${cellSize}%;`;
          return `<button class="${stateClass}" type="button" data-map-cell data-prefecture-code="${group.code}" data-cell-key="${escapeHtml(group.cellKey)}" data-cell-x="${group.cellX}" data-cell-y="${group.cellY}" data-cell-kind="${escapeHtml(group.kind)}" data-cell-count="${contentCount}" aria-expanded="${isActive}" tabindex="-1" aria-label="${escapeHtml(`${group.prefecture}。${contentSummary}。セルを選んで一覧を見る`)}" style="${densityStyle}"></button>`;
        }).join('');
        if (contentLayer) {
          contentLayer.innerHTML = contentMarkup;
          contentLayer.dataset.cellLayoutKey = layoutKey;
        }
        renderedCellCount += markup.length + visibleContentGroups.length;
        if (tile !== mapCanvas) {
          tile.querySelectorAll('[data-japan-map-cells] button, [data-japan-map-content-cells] button').forEach((button) => {
            button.tabIndex = -1;
            button.setAttribute('aria-hidden', 'true');
          });
        }
      });
    } finally {
      interactiveCellLayers.forEach((layer, index) => { layer.style.pointerEvents = previousPointerEvents[index]; });
      cellButtons.forEach((button, index) => { button.style.pointerEvents = previousCellButtonPointerEvents[index]; });
      if (geometryProbe) geometryProbe.style.pointerEvents = 'none';
      if (geometryProbeHost) geometryProbeHost.style.pointerEvents = previousProbePointerEvents;
    }
    if (renderedCellCount) mapCanvas.classList.add('is-cell-map');
    mapCanvas.dataset.cellGrid = String(grid);
    lastCellRenderSignature = cellLayout.signature;
  };

  // 地図の拡大・パン中は親キャンバスだけを先に動かし、セルの再構築は
  // 操作が落ち着いた後の1回へまとめる。古いセルはそのまま拡大縮小されるため、
  // 待ち時間に地図が空白にならず、分割境界で同期処理が画面を止めない。
  let cellRenderTimer = 0;
  let pendingCellRenderScale = 1;
  const isMapTransforming = () => ['is-zooming', 'is-dragging', 'is-pinching', 'is-focusing']
    .some((className) => mapViewport?.classList.contains(className));
  const cancelScheduledCellRender = () => {
    if (!cellRenderTimer) return;
    window.clearTimeout(cellRenderTimer);
    cellRenderTimer = 0;
  };
  const renderCells = (scale, options = {}) => {
    pendingCellRenderScale = scale;
    if (options.immediate) {
      cancelScheduledCellRender();
      renderCellsNow(scale);
      return;
    }
    if (cellRenderTimer) return;
    const flush = () => {
      cellRenderTimer = 0;
      if (isMapTransforming()) {
        cellRenderTimer = window.setTimeout(flush, 72);
        return;
      }
      renderCellsNow(pendingCellRenderScale);
    };
    cellRenderTimer = window.setTimeout(flush, 96);
  };

  const isPointWithinPrefecture = (item) => {
    if (!item.precise) return true;
    const cacheKey = `${item.key}:${item.prefectureCode}`;
    if (prefectureBoundaryCache.has(cacheKey)) return prefectureBoundaryCache.get(cacheKey);
    const region = prefectureGeometry.get(item.prefectureCode);
    const svg = region?.ownerSVGElement;
    if (!region || !svg) return true;
    try {
      const viewBox = svg.viewBox.baseVal;
      const screenMatrix = svg.getScreenCTM();
      if (!screenMatrix || !viewBox?.width || !viewBox?.height) return true;
      const viewPoint = new DOMPoint(
        viewBox.x + (item.point.x / 100) * viewBox.width,
        viewBox.y + (item.point.y / 100) * viewBox.height
      ).matrixTransform(screenMatrix);
      const shapes = [...region.querySelectorAll('path, polygon, rect, circle, ellipse')];
      const inside = shapes.some((shape) => {
        if (typeof shape.isPointInFill !== 'function') return false;
        const shapeMatrix = shape.getScreenCTM();
        if (!shapeMatrix) return false;
        const localPoint = viewPoint.matrixTransform(shapeMatrix.inverse());
        return shape.isPointInFill(localPoint);
      });
      prefectureBoundaryCache.set(cacheKey, inside);
      return inside;
    } catch {
      // 古いブラウザではSVGの当たり判定APIがないため、登録情報を失わない。
      return true;
    }
  };

  const getContentCounts = (items) => items.reduce((counts, item) => {
    counts[`${item.kind}s`] += 1;
    return counts;
  }, { stores: 0, events: 0, works: 0 });

  const getContentSummary = (items) => {
    const counts = getContentCounts(items);
    return [
      counts.works ? `作品${counts.works}` : '',
      counts.stores ? `店舗${counts.stores}` : '',
      counts.events ? `イベント${counts.events}` : ''
    ].filter(Boolean).join('・');
  };

  const closePopover = (focusTarget = null) => {
    if (!popover) return;
    const hadActiveContent = activeContentItemKeys.size > 0;
    popoverLocked = false;
    activeContentItemKeys.clear();
    popover.hidden = true;
    popover.innerHTML = '';
    root.querySelectorAll('[data-store-pin], [data-event-pin], [data-map-work-pin], [data-event-cluster], [data-map-cluster], [data-map-cell]').forEach((item) => {
      item.classList.remove('is-active');
      item.setAttribute('aria-expanded', 'false');
    });
    // 選択中セルを状態保持用に残していた場合だけ、閉じた直後に
    // 表示範囲を再同期して画面外のセルをDOMから解放する。
    if (hadActiveContent) {
      root.querySelectorAll('[data-japan-map-cells], [data-japan-map-content-cells]').forEach((layer) => {
        layer.dataset.cellLayoutKey = '';
      });
      lastCellRenderSignature = '';
      renderCells(currentMapScale);
    }
    if (focusTarget instanceof HTMLElement) {
      suppressFocusActivation = true;
      focusTarget.focus({ preventScroll: true });
      queueMicrotask(() => { suppressFocusActivation = false; });
    }
  };

  popover?.addEventListener('click', (event) => {
    const workPreview = event.target instanceof Element ? event.target.closest('[data-map-work-preview]') : null;
    if (workPreview && popover.contains(workPreview)) {
      event.preventDefault();
      event.stopPropagation();
      activateWork(workPreview.dataset.mapWorkPreview, { clusterId: workPreview.dataset.mapClusterReturn || '' });
      return;
    }
    const clusterReturn = event.target instanceof Element ? event.target.closest('[data-map-cluster-return]') : null;
    if (clusterReturn && popover.contains(clusterReturn)) {
      event.preventDefault();
      event.stopPropagation();
      activateMapCluster(clusterReturn.dataset.mapClusterReturn);
      return;
    }
    const postLocationButton = event.target instanceof Element ? event.target.closest('[data-map-post-location]') : null;
    if (postLocationButton && popover.contains(postLocationButton)) {
      event.preventDefault();
      event.stopPropagation();
      const code = String(postLocationButton.dataset.postPrefectureCode || '').padStart(2, '0');
      openPostComposer({
        returnFocus: postLocationButton,
        mapCell: {
          grid: Number(postLocationButton.dataset.postGrid),
          x: Number(postLocationButton.dataset.postX),
          y: Number(postLocationButton.dataset.postY),
          prefectureCode: code,
          label: `${PREFECTURE_NAME_BY_CODE[code] || 'この県'}のセル`
        }
      });
      return;
    }
    const generalPostButton = event.target instanceof Element ? event.target.closest('[data-map-post]') : null;
    if (generalPostButton && popover.contains(generalPostButton)) {
      event.preventDefault();
      event.stopPropagation();
      openPostComposer({ returnFocus: generalPostButton });
      return;
    }
    const closeButton = event.target instanceof Element ? event.target.closest('[data-map-close]') : null;
    if (!closeButton || !popover.contains(closeButton)) return;
    event.preventDefault();
    event.stopPropagation();
    closePopover();
    mapViewport?.focus({ preventScroll: true });
  });

  const markActivePin = (pin) => {
    if (pin?.dataset.cellKey) {
      const group = cellContentRegistry.get(pin.dataset.cellKey);
      activeContentItemKeys = new Set(group?.items.map((item) => item.key) || []);
    } else {
      activeContentItemKeys.clear();
    }
    root.querySelectorAll('[data-store-pin], [data-event-pin], [data-map-work-pin], [data-event-cluster], [data-map-cluster], [data-map-cell]').forEach((item) => {
      item.classList.toggle('is-active', item === pin);
      item.setAttribute('aria-expanded', String(item === pin));
    });
  };

  const mapPostActionMarkup = (context = {}) => {
    const keyParts = String(context.cellKey || '').split(':');
    const grid = Number(context.grid || keyParts[0] || getCellGridSize(currentMapScale));
    const x = Number(context.x ?? keyParts[1]);
    const y = Number(context.y ?? keyParts[2]);
    const code = String(context.prefectureCode || keyParts[3] || '').padStart(2, '0');
    if (![64, 128, 256, 512].includes(grid) || !Number.isInteger(x) || !Number.isInteger(y) || !code) return '';
    return `<button class="button button--quiet map-popover__post-action" type="button" data-map-post-location data-post-grid="${grid}" data-post-x="${x}" data-post-y="${y}" data-post-prefecture-code="${escapeHtml(code)}">このセルに絵を置く</button>`;
  };

  const activateWork = (workId, options = {}) => {
    const work = works.find((item) => item.id === workId);
    const pin = options.pin || null;
    if (!work || !popover) return;
    if (pin) markActivePin(pin);
    const point = getMapWorkPoint(work);
    popover.style.setProperty('--popover-x', `${Math.min(Math.max(point.x, 4), 68)}%`);
    popover.style.setProperty('--popover-y', `${Math.min(Math.max(point.y, 8), 52)}%`);
    const detailImage = `<div class="map-work map-work--detail"><img src="${work.image}" alt="${escapeHtml(work.title)}の作品画像" loading="lazy" decoding="async" width="1254" height="1254"><span><strong>${escapeHtml(work.title)}</strong><small>${escapeHtml(isMapOnlyWork(work) ? '地図で見つけた作品' : work.priceLabel)}</small></span></div>`;
    const returnMarkup = options.clusterId ? `<button class="button button--quiet" type="button" data-map-cluster-return="${escapeHtml(options.clusterId)}">一覧に戻る</button>` : '';
    const actionMarkup = isMapOnlyWork(work)
      ? `<p class="map-popover__empty">この作品は地図の中で見つかる投稿作品です。</p>${returnMarkup}`
      : `${returnMarkup}<a class="button button--primary" href="/works/${work.id}.html" data-analytics-event="work_open" data-work-id="${escapeHtml(work.id)}">作品ページを見る</a>`;
    popover.innerHTML = `<div class="map-popover__top"><span class="tag tag--sample">作品</span><button type="button" class="map-popover__close" data-map-close aria-label="作品情報を閉じる">×</button></div><h3>${escapeHtml(work.title)}</h3><p>${escapeHtml(work.subtitle || work.story || '')}</p><div class="map-popover__works map-popover__works--single">${detailImage}</div>${actionMarkup}`;
    popover.hidden = false;
  };

  const activateMapCluster = (clusterId, options = {}) => {
    const group = options.group || clusterRegistry.get(clusterId);
    const pin = options.pin || (group ? [...root.querySelectorAll('[data-map-cell]')].find((item) => item.dataset.cellKey === group.cellKey) : null);
    if (!group || !popover) return;
    if (pin) markActivePin(pin);
    const point = options.point || group.point;
    const workItems = group.items.filter((item) => item.kind === 'work');
    const storeItems = group.items.filter((item) => item.kind === 'store');
    const eventItems = group.items.filter((item) => item.kind === 'event');
    const worksMarkup = workItems.length
      ? `<section class="map-popover__collection"><div class="map-popover__collection-heading"><strong>作品</strong><span>${workItems.length}点</span></div><div class="map-popover__works map-popover__works--collection">${workItems.map((item) => mapWorkMarkup(item.source, { clusterId })).join('')}</div></section>`
      : '';
    const storesMarkup = storeItems.length
      ? `<section class="map-popover__collection"><div class="map-popover__collection-heading"><strong>お店</strong><span>${storeItems.length}件</span></div><div class="map-popover__cluster-list">${storeItems.map((item) => `<a class="map-popover__cluster-item map-popover__cluster-item--link" href="/stores/${item.source.id}.html"><strong>${escapeHtml(item.source.name)}</strong><p>${escapeHtml(item.source.area || item.source.prefecture || '')}</p></a>`).join('')}</div></section>`
      : '';
    const eventsMarkup = eventItems.length
      ? `<section class="map-popover__collection"><div class="map-popover__collection-heading"><strong>イベント</strong><span>${eventItems.length}件</span></div><div class="map-popover__cluster-list">${eventItems.map((item) => {
        const event = item.source;
        const sourceMarkup = event.sourceUrl ? `<a class="text-link" href="${escapeHtml(event.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(event.sourceLabel || '公式情報')}を見る</a>` : '';
        return `<article class="map-popover__cluster-item"><div><span class="tag tag--event">${escapeHtml(getEventStatusLabel(event))}</span><strong>${escapeHtml(event.name)}</strong></div><p>${escapeHtml(getEventDateLabel(event))} · ${escapeHtml(event.venue)}</p>${sourceMarkup}</article>`;
      }).join('')}</div></section>`
      : '';
    popover.style.setProperty('--popover-x', `${Math.min(Math.max(point.x, 4), 68)}%`);
    popover.style.setProperty('--popover-y', `${Math.min(Math.max(point.y, 8), 52)}%`);
    const postActionMarkup = mapPostActionMarkup({ cellKey: group.cellKey, grid: Number(String(group.cellKey).split(':')[0]), x: group.cellX, y: group.cellY, prefectureCode: group.code });
    popover.innerHTML = `<div class="map-popover__top"><span class="tag tag--sample">${escapeHtml(getContentSummary(group.items))}</span><button type="button" class="map-popover__close" data-map-close aria-label="${escapeHtml(group.label)}の一覧を閉じる">×</button></div><h3>${escapeHtml(group.label)}</h3><p>${escapeHtml(group.items.length > 1 ? '地図上では近い場所をまとめています。中身はすべてここから見られます。' : 'この場所にある掲載情報です。')}</p>${worksMarkup}${storesMarkup}${eventsMarkup}${postActionMarkup}`;
    popover.hidden = false;
  };

  const getRegionPoint = (region, svg) => {
    const code = String(region.dataset.code || '').padStart(2, '0');
    const knownPoint = PREFECTURE_MAP_POINTS[code];
    // 離島を含む県グループの外接矩形は代表点として使わない。
    // 県の案内・フォーカスは、主要部に合わせた既知の代表点を優先する。
    if (knownPoint) return { ...knownPoint };
    try {
      // getBBox() is unavailable in some browsers and test environments.
      // 複数の離島を含むグループでは、最大の形状を代表点にする。
      const shapes = [...region.querySelectorAll('path, polygon, rect, circle, ellipse')]
        .map((shape) => ({ rect: shape.getBoundingClientRect() }))
        .filter(({ rect }) => rect.width > 0 && rect.height > 0)
        .sort((left, right) => (right.rect.width * right.rect.height) - (left.rect.width * left.rect.height));
      const regionRect = shapes[0]?.rect || region.getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();
      if (!regionRect.width || !regionRect.height || !svgRect.width || !svgRect.height) throw new Error('Map region has no measurable bounds');
      return {
        x: ((regionRect.left + regionRect.width / 2 - svgRect.left) / svgRect.width) * 100,
        y: ((regionRect.top + regionRect.height / 2 - svgRect.top) / svgRect.height) * 100
      };
    } catch {
      return knownPoint ? { ...knownPoint } : { x: 50, y: 50 };
    }
  };

  const showEmptyPrefecture = (prefecture, point, region, storeCount = 0, eventCount = 0, workCount = 0, mapCell = null) => {
    if (!popover) return;
    popover.style.setProperty('--popover-x', `${Math.min(Math.max(point.x, 4), 68)}%`);
    popover.style.setProperty('--popover-y', `${Math.min(Math.max(point.y, 8), 52)}%`);
    const postActionMarkup = mapCell
      ? mapPostActionMarkup(mapCell)
      : '<button class="button button--quiet" type="button" data-map-post>この地図に絵を置く</button>';
    popover.innerHTML = `<div class="map-popover__top"><span class="tag tag--sample">${escapeHtml(prefecture)}</span><button type="button" class="map-popover__close" data-map-close aria-label="県の案内を閉じる">×</button></div><h3>この県にも、いつか。</h3><p>いまはまだPiXiEEDの絵が会えるお店やイベントを準備中です。次に絵が見つかる街を、ゆっくり増やしていきます。</p><p class="map-popover__empty">掲載店舗 ${storeCount}件 · イベント ${eventCount}件 · 作品${workCount}点</p>${postActionMarkup}`;
    popover.hidden = false;
    popover.querySelector('[data-map-close]')?.addEventListener('click', () => closePopover(region));
  };

  const syncRegionShortcut = (code, closePicker = false) => {
    root.querySelectorAll('[data-map-region]').forEach((button) => {
      button.classList.toggle('is-active', String(button.dataset.prefectureCode || '') === String(code || ''));
    });
    const label = root.querySelector('[data-region-picker-label]');
    if (label) label.textContent = PREFECTURE_NAME_BY_CODE[String(code || '').padStart(2, '0')] || '県を選ぶ';
    if (closePicker) {
      const picker = root.querySelector('.japan-map__region-picker');
      if (picker) picker.open = false;
    }
  };

  const selectPrefectureRegion = (region, svg = region?.ownerSVGElement) => {
    svg?.querySelectorAll('g[data-code]').forEach((item) => item.classList.remove('is-selected'));
    if (!region) return;
    // 選択状態はピン・ポップオーバー・ズームで示し、県の周囲に枠を描かない。
    region.classList.remove('is-selected');
  };

  const getPrefectureFocusScale = (region, svg) => {
    const viewport = root.querySelector('[data-japan-map-viewport]');
    const regionRect = region?.getBoundingClientRect();
    const svgRect = svg?.getBoundingClientRect();
    if (!viewport || !regionRect || !svgRect || !regionRect.width || !regionRect.height || !svgRect.width || !svgRect.height) return 5.2;
    const regionRatio = Math.max(regionRect.width / svgRect.width, regionRect.height / svgRect.height);
    if (!regionRatio) return 5.2;
    const viewportSize = Math.min(viewport.clientWidth || 520, viewport.clientHeight || 520);
    const baseMapSize = Math.max(1, Math.min(viewport.clientWidth || 520, viewport.clientHeight || 520, 520));
    // 県の長辺が表示領域の約92%になる倍率にする。操作ボタンや境界を
    // 残しつつ、小さな県も「県内を見ている」と分かる大きさに収める。
    const targetPixelSize = viewportSize * .92;
    return Math.min(50, Math.max(2.6, targetPixelSize / (regionRatio * baseMapSize)));
  };

  const activatePrefecture = (region, svg, mapCell = null) => {
    const code = String(region.dataset.code || '').padStart(2, '0');
    const prefecture = PREFECTURE_NAME_BY_CODE[code] || region.dataset.prefecture || 'この県';
    const group = mapGroups.find((item) => item.code === code || item.prefecture === prefecture);
    const point = getRegionPoint(region, svg);
    const storeCount = group?.stores.length || 0;
    const eventCount = group?.events.length || 0;
    const workCount = group?.works.length || 0;
    activePrefectureCode = code;
    syncRegionShortcut(code, true);
    selectPrefectureRegion(region, svg);
    closePopover();
    const focusScale = getPrefectureFocusScale(region, svg);
    // 県クリック時は掲載情報の平均地点ではなく、県の輪郭中心へ移動する。
    // 店舗やイベントが県の一部に集中していても、県全体が画面の主役になるようにする。
    mapController?.focusTo(point.x, point.y, focusScale, { label: prefecture });
    if (!storeCount && !eventCount && !workCount) {
      showEmptyPrefecture(prefecture, point, region, storeCount, eventCount, workCount, mapCell);
    }
  };

  const bindPrefectureButtons = (svg) => {
    const regions = [...svg.querySelectorAll('g.prefecture[data-code]')];
    prefectureGeometry = new Map(regions.map((region) => [String(region.dataset.code || '').padStart(2, '0'), region]));
    prefectureBoundaryCache.clear();
    regions.forEach((region) => {
      const code = String(region.dataset.code || '').padStart(2, '0');
      const prefecture = PREFECTURE_NAME_BY_CODE[code] || 'この県';
      const group = mapGroups.find((item) => item.code === code || item.prefecture === prefecture);
      const point = getRegionPoint(region, svg);
      const storeCount = group?.stores.length || 0;
      const eventCount = group?.events.length || 0;
      const workCount = group?.works.length || 0;
      const contentCount = storeCount + eventCount + workCount;
      region.dataset.prefecture = prefecture;
      region.dataset.regionX = String(point.x);
      region.dataset.regionY = String(point.y);
      // 情報の有無は県全体では塗らず、実際の座標が入るセルだけで示す。
      region.classList.remove('is-open');
      region.classList.remove('is-selected');
      const shortcut = root.querySelector(`[data-map-region][data-prefecture-code="${code}"]`);
      shortcut?.setAttribute('data-region-svg-x', String(point.x));
      shortcut?.setAttribute('data-region-svg-y', String(point.y));
      region.setAttribute('role', 'button');
      region.setAttribute('tabindex', '0');
      region.setAttribute('aria-label', `${prefecture}。${contentCount ? `店舗${storeCount}件、イベント${eventCount}件、作品${workCount}点。選んで拡大` : '店舗もイベントもまだありません。選んで見る'}`);
      region.addEventListener('click', () => activatePrefecture(region, svg));
      region.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        activatePrefecture(region, svg);
      });
    });
    assetHost?.setAttribute('aria-busy', 'false');
  };

  const createMapWrapTiles = () => {
    if (!mapCanvas || !mapViewport || root.querySelector('.japan-map__canvas--wrap-tile')) return;
    mapCanvas.dataset.mapTileOffset = '0';
    [-1, 1].forEach((tileOffset) => {
      const tile = mapCanvas.cloneNode(true);
      tile.removeAttribute('data-japan-map-canvas');
      tile.dataset.mapTileOffset = String(tileOffset);
      tile.classList.add('japan-map__canvas--wrap-tile');
      tile.setAttribute('aria-hidden', 'true');
      tile.style.pointerEvents = 'auto';
      const tileAsset = tile.querySelector('[data-japan-map-asset]');
      tileAsset?.removeAttribute('data-japan-map-asset');
      if (tileAsset) tileAsset.style.pointerEvents = 'none';
      tile.querySelectorAll('[tabindex], [role]').forEach((item) => {
        item.removeAttribute('tabindex');
        item.removeAttribute('role');
      });
      tile.querySelectorAll('button').forEach((button) => {
        button.tabIndex = -1;
        button.setAttribute('aria-hidden', 'true');
      });
      mapViewport.insertBefore(tile, mapCanvas);
    });
  };

  const loadMapAsset = async () => {
    if (!assetHost) return;
    try {
      const response = await fetch(MAP_ASSET_URL, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Map asset request failed: ${response.status}`);
      const source = await response.text();
      const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
      if (parsed.querySelector('parsererror') || parsed.documentElement.nodeName.toLowerCase() !== 'svg') throw new Error('Map asset is not SVG');
      const svg = document.importNode(parsed.documentElement, true);
      svg.classList.add('japan-map__asset');
      svg.setAttribute('role', 'group');
      svg.setAttribute('aria-label', '47都道府県の地図');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      assetHost.replaceChildren(svg);
      const geometryProbe = svg.cloneNode(true);
      geometryProbe.classList.remove('japan-map__asset');
      geometryProbe.removeAttribute('role');
      geometryProbe.setAttribute('aria-hidden', 'true');
      geometryProbeHost?.replaceChildren(geometryProbe);
      bindPrefectureButtons(svg);
      createMapWrapTiles();
      window.dispatchEvent(new Event('resize'));
      const renderInitialCells = (attempt = 0) => {
        const currentRect = svg.getBoundingClientRect();
        if (currentRect.width && currentRect.height) {
          renderCells(1, { immediate: true });
          return;
        }
        if (attempt < 8) window.requestAnimationFrame(() => renderInitialCells(attempt + 1));
      };
      renderInitialCells();
    } catch {
      mapCanvas?.classList.remove('is-cell-map');
      const image = document.createElement('img');
      image.className = 'japan-map__asset japan-map__asset--fallback';
      image.src = MAP_ASSET_URL;
      image.alt = '';
      image.width = 1000;
      image.height = 1000;
      image.draggable = false;
      assetHost.replaceChildren(image);
      assetHost.setAttribute('aria-busy', 'false');
    }
  };

  mapViewport?.addEventListener('click', (event) => {
    const element = event.target instanceof Element ? event.target : null;
    const cell = element?.closest('[data-map-cell]');
    if (!cell || !mapViewport.contains(cell)) return;
    if (isSelectingPostCell) {
      event.preventDefault();
      event.stopPropagation();
      isSelectingPostCell = false;
      openPostComposer({ cell, returnFocus: cell });
      return;
    }
    const contentGroup = cellContentRegistry.get(cell.dataset.cellKey || '');
    if (contentGroup?.items.length) {
      event.preventDefault();
      event.stopPropagation();
      popoverLocked = true;
      activateMapCluster(contentGroup.clusterId, { group: contentGroup, pin: cell });
      return;
    }
    const region = prefectureGeometry.get(String(cell.dataset.prefectureCode || '').padStart(2, '0'));
    if (!region) return;
    event.preventDefault();
    event.stopPropagation();
    activatePrefecture(region, region.ownerSVGElement, cell);
  });

  mapController = setupJapanMap(root, (scale) => {
    currentMapScale = scale;
    renderCells(scale);
  }, () => {
    activePrefectureCode = '';
    syncRegionShortcut('');
    closePopover();
    root.querySelectorAll('.prefecture.is-selected').forEach((region) => region.classList.remove('is-selected'));
  }, (code) => {
    activePrefectureCode = code;
    syncRegionShortcut(code, true);
    closePopover();
    const region = root.querySelector(`[data-japan-map-canvas] .prefecture[data-code="${code}"]`);
    selectPrefectureRegion(region);
    return getPrefectureFocusScale(region, region?.ownerSVGElement);
  }, () => {
    // 地図をつかみ始めた時は、クリックで固定されていないプレビューだけ閉じる。
    if (!popoverLocked) closePopover();
  });
  void loadMapAsset();
  if (new URLSearchParams(window.location.search).get('post') === '1') {
    window.setTimeout(() => openPostComposer(), 0);
  }
}

function setupJapanMap(root, onScaleChange, onReset = () => {}, onRegionSelect = () => {}, onInteractionStart = () => {}, onInteractionEnd = () => {}) {
  const viewport = root.querySelector('[data-japan-map-viewport]');
  const canvas = root.querySelector('[data-japan-map-canvas]');
  const status = root.querySelector('[data-map-zoom-status]');
  if (!viewport || !canvas) return null;

  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let focusPoint = null;
  let pointerId = null;
  let lastX = 0;
  let lastY = 0;
  let dragMoved = false;
  let pointerCaptured = false;
  let suppressClick = false;
  const touchPointers = new Map();
  let pinchState = null;
  let interactionActive = false;
  let zoomEndTimer = 0;
  let focusAnimationFrame = 0;
  let focusLabel = '';
  let lastBaseMapSize = 0;
  const minScale = 1;
  const maxScale = 50;

  const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
  const getBaseMapSize = () => Math.max(1, Math.min(viewport.clientWidth || 520, viewport.clientHeight || 520, 520));
  const getContentSize = () => getBaseMapSize() * scale;
  const getOffsetLimit = (contentSize, viewportSize) => {
    const edgeTolerance = scale <= minScale + .0001
      ? 0
      : Math.min(24, Math.max(12, viewportSize * .04));
    if (contentSize >= viewportSize) {
      return (contentSize - viewportSize) / 2 + edgeTolerance;
    }
    return edgeTolerance;
  };
  const releaseFocusPoint = () => {
    focusPoint = null;
    focusLabel = '';
  };
  const wrapOffset = (value, limit) => {
    const span = limit * 2;
    if (span <= 0) return value;
    return ((value + limit) % span + span) % span - limit;
  };
  const clampOffsets = () => {
    if (scale <= minScale + .0001) {
      offsetX = 0;
      offsetY = 0;
      return;
    }
    const contentSize = getContentSize();
    const baseMaxX = getOffsetLimit(contentSize, viewport.clientWidth);
    const maxY = getOffsetLimit(contentSize, viewport.clientHeight);
    const focusMaxX = focusPoint ? Math.abs((focusPoint.x / 100 - .5) * contentSize) : 0;
    const focusMaxY = focusPoint ? Math.abs((focusPoint.y / 100 - .5) * contentSize) : 0;
    const maxX = Math.max(baseMaxX, focusMaxX);
    // 拡大中だけ左右を循環させる。全国表示の100%では日本を1枚だけ
    // 中央に置き、縦方向は有限範囲にする。
    if (!focusPoint && contentSize > viewport.clientWidth + 1) offsetX = wrapOffset(offsetX, contentSize / 2);
    else offsetX = clamp(offsetX, -maxX, maxX);
    offsetY = clamp(offsetY, -Math.max(maxY, focusMaxY), Math.max(maxY, focusMaxY));
  };
  const getContentBounds = () => {
    const contentSize = getContentSize();
    return {
      left: viewport.clientWidth / 2 + offsetX - contentSize / 2,
      top: viewport.clientHeight / 2 + offsetY - contentSize / 2,
      right: viewport.clientWidth / 2 + offsetX + contentSize / 2,
      bottom: viewport.clientHeight / 2 + offsetY + contentSize / 2
    };
  };
  const resolveZoomAnchor = (anchorX, anchorY) => {
    const bounds = getContentBounds();
    const centerX = viewport.clientWidth / 2;
    const centerY = viewport.clientHeight / 2;
    const pointerX = Number.isFinite(anchorX) ? anchorX : centerX;
    const pointerY = Number.isFinite(anchorY) ? anchorY : centerY;
    const mapIsWideEnough = getContentSize() >= viewport.clientWidth;
    const mapIsTallEnough = getContentSize() >= viewport.clientHeight;
    return {
      x: pointerX >= bounds.left && pointerX <= bounds.right
        ? pointerX
        : mapIsWideEnough ? clamp(pointerX, bounds.left, bounds.right) : centerX,
      y: pointerY >= bounds.top && pointerY <= bounds.bottom
        ? pointerY
        : mapIsTallEnough ? clamp(pointerY, bounds.top, bounds.bottom) : centerY
    };
  };
  const cancelFocusAnimation = () => {
    if (focusAnimationFrame) {
      window.cancelAnimationFrame(focusAnimationFrame);
      focusAnimationFrame = 0;
    }
    viewport.classList.remove('is-focusing');
  };
  const render = () => {
    clampOffsets();
    const mapSize = getBaseMapSize();
    const contentSize = mapSize * scale;
    // CSSのscale()で小さなSVGレイヤーを引き伸ばすと、ブラウザによっては
    // GPUテクスチャとして一度ラスタライズされ、ズーム時にぼやける。
    // SVGそのものを倍率に合わせた大きさでレイアウトし、常にベクター描画させる。
    root.querySelectorAll('[data-japan-map-canvas], .japan-map__canvas--wrap-tile').forEach((tile) => {
      const tileOffset = Number(tile.dataset.mapTileOffset || 0);
      tile.style.display = tileOffset === 0 || contentSize > viewport.clientWidth + 1 ? '' : 'none';
      tile.style.width = `${contentSize}px`;
      tile.style.height = `${contentSize}px`;
      tile.style.left = `${viewport.clientWidth / 2 + offsetX - contentSize / 2 + tileOffset * contentSize}px`;
      tile.style.top = `${viewport.clientHeight / 2 + offsetY - contentSize / 2}px`;
      tile.style.transform = 'none';
    });
    // SVG側は non-scaling-stroke なので、拡大時だけ少し細くして県境を軽く保つ。
    const boundaryWidth = Math.max(0.78, 1.25 - Math.max(0, scale - 1) * 0.12);
    root.style.setProperty('--map-boundary-width', `${boundaryWidth}px`);
    viewport.classList.toggle('is-map-zoomed', scale > minScale + .0001);
    if (status) status.textContent = focusLabel ? `${focusLabel} ${Math.round(scale * 100)}%` : (scale === 1 ? '日本全体 100%' : `拡大 ${Math.round(scale * 100)}%`);
    lastBaseMapSize = mapSize;
    onScaleChange?.(scale);
  };
  let renderFrame = 0;
  const cancelScheduledRender = () => {
    if (!renderFrame) return;
    window.cancelAnimationFrame(renderFrame);
    renderFrame = 0;
  };
  const renderNow = () => {
    cancelScheduledRender();
    render();
  };
  const scheduleRender = () => {
    if (renderFrame) return;
    renderFrame = window.requestAnimationFrame(() => {
      renderFrame = 0;
      render();
    });
  };
  const notifyInteractionStart = () => {
    if (interactionActive) return;
    interactionActive = true;
    onInteractionStart?.();
  };
  const notifyInteractionEnd = () => {
    if (!interactionActive) return;
    interactionActive = false;
    onInteractionEnd?.();
  };
  const beginZoomInteraction = () => {
    notifyInteractionStart();
    viewport.classList.add('is-zooming');
    window.clearTimeout(zoomEndTimer);
    zoomEndTimer = window.setTimeout(() => {
      viewport.classList.remove('is-zooming');
      notifyInteractionEnd();
    }, 220);
  };
  const zoomTo = (nextScale, anchorX = viewport.clientWidth / 2, anchorY = viewport.clientHeight / 2) => {
    beginZoomInteraction();
    cancelFocusAnimation();
    releaseFocusPoint();
    const anchor = resolveZoomAnchor(anchorX, anchorY);
    const centerX = viewport.clientWidth / 2;
    const centerY = viewport.clientHeight / 2;
    const contentX = (anchor.x - centerX - offsetX) / scale;
    const contentY = (anchor.y - centerY - offsetY) / scale;
    scale = clamp(nextScale, minScale, maxScale);
    if (scale === minScale) focusPoint = null;
    offsetX = anchor.x - centerX - contentX * scale;
    offsetY = anchor.y - centerY - contentY * scale;
    renderNow();
  };
  const getZoomStep = () => {
    if (scale < 2) return 0.125;
    if (scale < 5) return 0.25;
    if (scale < 10) return 0.5;
    if (scale < 20) return 1.25;
    return 2.5;
  };
  const zoomBy = (direction, anchorX, anchorY) => {
    zoomTo(scale + direction * getZoomStep(), anchorX, anchorY);
  };
  const isFineWheelInput = (event) => {
    if (event.deltaMode !== 0) return false;
    const deltaX = Math.abs(event.deltaX || 0);
    const deltaY = Math.abs(event.deltaY || 0);
    // Macのトラックパッドの2本指スクロールは、通常のホイールより
    // 小さく連続したdeltaとして届く。横方向の微小deltaもトラックパッドの手掛かりにする。
    return (deltaY > 0 && deltaY < 96) || deltaX > 0;
  };
  const getWheelZoomFactor = (deltaY, deltaMode, fineInput = false) => {
    const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? Math.max(viewport.clientHeight, 320) : 1;
    const normalizedDelta = clamp(deltaY * unit, -180, 180);
    const sensitivity = fineInput ? 0.00058 : 0.00075;
    return Math.exp(-normalizedDelta * sensitivity);
  };
  const zoomByFactor = (factor, anchorX, anchorY) => {
    zoomTo(scale * factor, anchorX, anchorY);
  };
  const reset = () => {
    cancelFocusAnimation();
    window.clearTimeout(zoomEndTimer);
    viewport.classList.remove('is-zooming');
    scale = 1;
    offsetX = 0;
    offsetY = 0;
    releaseFocusPoint();
    onReset();
    renderNow();
    notifyInteractionEnd();
  };
  const focusTo = (xPercent, yPercent, nextScale = 2.25, options = {}) => {
    const x = clamp(Number(xPercent), 0, 100);
    const y = clamp(Number(yPercent), 0, 100);
    focusPoint = { x, y };
    focusLabel = String(options.label || '');
    cancelFocusAnimation();
    window.clearTimeout(zoomEndTimer);
    viewport.classList.remove('is-zooming');
    notifyInteractionStart();
    const targetScale = clamp(nextScale, minScale, maxScale);
    const targetContentSize = getBaseMapSize() * targetScale;
    const targetOffsetX = -((x / 100) - .5) * targetContentSize;
    const targetOffsetY = -((y / 100) - .5) * targetContentSize;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const start = { scale, offsetX, offsetY };
    const distance = Math.abs(targetScale - start.scale) + Math.abs(targetOffsetX - start.offsetX) + Math.abs(targetOffsetY - start.offsetY);
    if (reduceMotion || distance < .01) {
      scale = targetScale;
      offsetX = targetOffsetX;
      offsetY = targetOffsetY;
      renderNow();
      notifyInteractionEnd();
      return;
    }
    viewport.classList.add('is-focusing');
    const startedAt = performance.now();
    const duration = 520;
    const animate = (now) => {
      const progress = clamp((now - startedAt) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      scale = start.scale + (targetScale - start.scale) * eased;
      offsetX = start.offsetX + (targetOffsetX - start.offsetX) * eased;
      offsetY = start.offsetY + (targetOffsetY - start.offsetY) * eased;
      renderNow();
      if (progress < 1) {
        focusAnimationFrame = window.requestAnimationFrame(animate);
        return;
      }
      focusAnimationFrame = 0;
      scale = targetScale;
      offsetX = targetOffsetX;
      offsetY = targetOffsetY;
      viewport.classList.remove('is-focusing');
      renderNow();
      notifyInteractionEnd();
    };
    focusAnimationFrame = window.requestAnimationFrame(animate);
  };

  root.querySelectorAll('[data-map-zoom]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.mapZoom === 'reset') reset();
      else zoomBy(button.dataset.mapZoom === 'in' ? 1 : -1);
      viewport.focus({ preventScroll: true });
    });
  });
  root.querySelectorAll('[data-map-region]').forEach((button) => {
    button.addEventListener('click', () => {
      const code = button.dataset.prefectureCode || '';
      const svgRegion = root.querySelector(`[data-japan-map-canvas] .prefecture[data-code="${code}"], [data-japan-map-canvas] .prefecture[data-code="${Number(code)}"]`);
      const focusScale = Number(onRegionSelect(code)) || 5.2;
      focusTo(button.dataset.regionX || svgRegion?.dataset.regionX, button.dataset.regionY || svgRegion?.dataset.regionY, focusScale, { label: button.dataset.prefectureName || '' });
      viewport.focus({ preventScroll: true });
    });
  });
  // パンの指離し位置が県の図形上でも、県選択のクリックへ昇格させない。
  viewport.addEventListener('click', (event) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  viewport.addEventListener('wheel', (event) => {
    const eventTarget = event.target instanceof Element ? event.target : null;
    if (eventTarget?.closest('.map-popover, .japan-map__region-picker')) return;
    const isZoomed = scale > minScale + .0001;
    const fineInput = isFineWheelInput(event);
    // Macのトラックパッド2本指スクロールは、全国表示でも地図のズームに使う。
    // 大きなマウスホイールdeltaは従来通り、100%時にはページスクロールを優先する。
    if (!isZoomed && !event.ctrlKey && !event.metaKey && !fineInput) return;
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? Math.max(viewport.clientHeight, 320) : 1;
    const horizontalIntent = event.shiftKey || Math.abs(event.deltaX || 0) > Math.abs(event.deltaY || 0) * 1.15;
    const horizontalDelta = horizontalIntent ? (Math.abs(event.deltaX || 0) > .5 ? event.deltaX : event.deltaY) : 0;
    if (horizontalDelta) {
      if (!isZoomed) return;
      beginZoomInteraction();
      cancelFocusAnimation();
      releaseFocusPoint();
      offsetX -= clamp(horizontalDelta * unit, -240, 240);
      renderNow();
      return;
    }
    const factor = getWheelZoomFactor(event.deltaY, event.deltaMode, fineInput);
    zoomByFactor(factor, event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });
  viewport.addEventListener('dblclick', (event) => {
    const rect = viewport.getBoundingClientRect();
    zoomBy(1, event.clientX - rect.left, event.clientY - rect.top);
  });
  const updateTouchPointer = (event) => {
    if (event.pointerType !== 'touch') return;
    touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };
  const getTouchPair = () => [...touchPointers.values()].slice(0, 2);
  const startPinch = () => {
    const pair = getTouchPair();
    if (pair.length < 2) return;
    const [first, second] = pair;
    const midpointX = (first.x + second.x) / 2;
    const midpointY = (first.y + second.y) / 2;
    const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
    cancelFocusAnimation();
    releaseFocusPoint();
    const centerX = viewport.clientWidth / 2;
    const centerY = viewport.clientHeight / 2;
    pinchState = {
      distance,
      scale,
      midpointX,
      midpointY,
      contentX: (midpointX - centerX - offsetX) / scale,
      contentY: (midpointY - centerY - offsetY) / scale
    };
    pointerId = null;
    pointerCaptured = false;
    dragMoved = true;
    viewport.classList.remove('is-dragging');
    viewport.classList.add('is-pinching');
    beginZoomInteraction();
  };
  viewport.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const eventTarget = event.target instanceof Element ? event.target : null;
    const interactiveTarget = eventTarget?.closest('button, a, input, select, textarea, [role="button"]');
    if (interactiveTarget && !eventTarget?.closest('.prefecture, [data-map-cell]')) return;
    if (event.pointerType === 'touch') {
      updateTouchPointer(event);
      if (touchPointers.size >= 2) {
        startPinch();
        return;
      }
    }
    notifyInteractionStart();
    cancelFocusAnimation();
    releaseFocusPoint();
    pointerId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    dragMoved = false;
    pointerCaptured = false;
    viewport.classList.add('is-dragging');
  });
  viewport.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') updateTouchPointer(event);
    if (pinchState && touchPointers.size >= 2) {
      const pair = getTouchPair();
      const [first, second] = pair;
      const midpointX = (first.x + second.x) / 2;
      const midpointY = (first.y + second.y) / 2;
      const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      const centerX = viewport.clientWidth / 2;
      const centerY = viewport.clientHeight / 2;
      scale = clamp(pinchState.scale * distance / pinchState.distance, minScale, maxScale);
      offsetX = midpointX - centerX - pinchState.contentX * scale;
      offsetY = midpointY - centerY - pinchState.contentY * scale;
      beginZoomInteraction();
      scheduleRender();
      return;
    }
    if (event.pointerId !== pointerId) return;
    const deltaX = event.clientX - lastX;
    const deltaY = event.clientY - lastY;
    if (event.pointerType === 'touch' && scale <= minScale + .0001 && Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) >= 3) {
      touchPointers.delete(event.pointerId);
      pointerId = null;
      viewport.classList.remove('is-dragging');
      notifyInteractionEnd();
      return;
    }
    if (!dragMoved && Math.hypot(deltaX, deltaY) < 3) return;
    if (!pointerCaptured) {
      viewport.setPointerCapture(pointerId);
      pointerCaptured = true;
    }
    dragMoved = true;
    offsetX += deltaX;
    offsetY += deltaY;
    lastX = event.clientX;
    lastY = event.clientY;
    scheduleRender();
  });
  const scheduleClickSuppression = () => {
    suppressClick = true;
    window.setTimeout(() => { suppressClick = false; }, 360);
  };
  const endDrag = (event) => {
    if (event.pointerType === 'touch') {
      touchPointers.delete(event.pointerId);
      if (pinchState) {
        pinchState = null;
        viewport.classList.remove('is-pinching');
        pointerId = null;
        pointerCaptured = false;
        scheduleClickSuppression();
        renderNow();
        notifyInteractionEnd();
        return;
      }
    }
    if (event.pointerId !== pointerId) return;
    if (dragMoved) scheduleClickSuppression();
    pointerId = null;
    if (pointerCaptured && viewport.hasPointerCapture?.(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    pointerCaptured = false;
    viewport.classList.remove('is-dragging');
    renderNow();
    notifyInteractionEnd();
  };
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);
  viewport.addEventListener('lostpointercapture', endDrag);
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  window.addEventListener('blur', () => {
    touchPointers.clear();
    pinchState = null;
    pointerId = null;
    pointerCaptured = false;
    viewport.classList.remove('is-dragging', 'is-pinching');
    cancelScheduledRender();
    notifyInteractionEnd();
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    touchPointers.clear();
    pinchState = null;
    pointerId = null;
    pointerCaptured = false;
    viewport.classList.remove('is-dragging', 'is-pinching');
    cancelScheduledRender();
    notifyInteractionEnd();
  }, { passive: true });
  viewport.addEventListener('keydown', (event) => {
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomBy(1); }
    if (event.key === '-') { event.preventDefault(); zoomBy(-1); }
    if (event.key === '0') { event.preventDefault(); reset(); }
    const pan = 28;
    if (event.key === 'ArrowLeft') { event.preventDefault(); cancelFocusAnimation(); releaseFocusPoint(); offsetX += pan; render(); }
    if (event.key === 'ArrowRight') { event.preventDefault(); cancelFocusAnimation(); releaseFocusPoint(); offsetX -= pan; render(); }
    if (event.key === 'ArrowUp') { event.preventDefault(); cancelFocusAnimation(); releaseFocusPoint(); offsetY += pan; render(); }
    if (event.key === 'ArrowDown') { event.preventDefault(); cancelFocusAnimation(); releaseFocusPoint(); offsetY -= pan; render(); }
  });
  let resizeFrame = 0;
  const handleResize = () => {
    if (resizeFrame) return;
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = 0;
      const previousMapSize = lastBaseMapSize || getBaseMapSize();
      const nextMapSize = getBaseMapSize();
      if (previousMapSize > 0 && nextMapSize > 0 && Math.abs(previousMapSize - nextMapSize) > .01) {
        const projectionRatio = nextMapSize / previousMapSize;
        offsetX *= projectionRatio;
        offsetY *= projectionRatio;
      }
      render();
    });
  };
  window.addEventListener('resize', handleResize, { passive: true });
  render();
  return { focusTo, reset, zoomTo };
}

function getPublicShellMarkup() {
  return `
    <div class="site-menu-backdrop" data-menu-backdrop hidden></div>
    <aside class="site-menu" id="site-menu" data-site-menu hidden aria-labelledby="site-menu-title">
      <div class="site-menu__head"><div><span class="eyebrow">your space</span><h2 id="site-menu-title">メニュー</h2></div><button class="site-menu__close" type="button" data-menu-close aria-label="メニューを閉じる">×</button></div>
      <a class="site-menu__profile" href="/profile/" data-menu-link><span class="site-menu__avatar" aria-hidden="true">P</span><span><strong>自分のページ</strong><small>投稿・いいね・記録</small></span><span aria-hidden="true">›</span></a>
      <nav class="site-menu__nav" aria-label="補助メニュー">
        <div class="site-menu__group"><span class="site-menu__label">活動</span><a href="/profile/?view=posts" data-menu-link>投稿した絵</a><a href="/profile/?view=likes" data-menu-link>いいねした作品</a><a href="/profile/?view=history" data-menu-link>QRを読んだ履歴</a></div>
        <div class="site-menu__group"><span class="site-menu__label">参加する</span><a href="/?post=1" data-menu-link>ドット絵を投稿する</a><a href="/shops/" data-menu-link>お店の方へ</a></div>
        <div class="site-menu__group"><span class="site-menu__label">PiXiEED</span><a href="/about/" data-menu-link>PiXiEEDについて</a><a href="/about/#contact" data-menu-link>使い方・お問い合わせ</a></div>
        <div class="site-menu__group"><span class="site-menu__label">設定</span><button type="button" data-menu-coming-soon="表示設定">表示設定</button><button type="button" data-menu-coming-soon="プライバシー設定">プライバシー設定</button></div>
      </nav>
    </aside>`;
}

function renderPublicShell() {
  if (document.body.hasAttribute('data-admin-page')) return;
  const header = document.querySelector('.site-header');
  if (!header) return;
  const headerInner = header.querySelector('.header-inner') || header;
  const brand = headerInner.querySelector('.brand')?.outerHTML || '<a class="brand" href="/" aria-label="PiXiEED ホーム"><span class="brand-mark" aria-hidden="true">P</span><span>PiXiEED</span></a>';
  headerInner.innerHTML = `${brand}<button class="menu-toggle" type="button" data-menu-toggle aria-expanded="false" aria-controls="site-menu" aria-label="メニューを開く"><span class="menu-toggle__lines" aria-hidden="true"><i></i><i></i><i></i></span></button>`;

  let tabs = document.querySelector('.mobile-nav');
  if (!tabs) {
    tabs = document.createElement('nav');
    header.insertAdjacentElement('afterend', tabs);
  }
  tabs.className = 'app-tabs';
  tabs.setAttribute('aria-label', 'アプリナビゲーション');
  const page = ['/', '/index.html'].includes(window.location.pathname) ? 'map' : document.body.dataset.page || 'home';
  const actions = {
    map: '<a href="/?post=1" aria-label="ドット絵を投稿する"><img src="/assets/icons/pixieed/add.svg" alt=""></a>',
    home: '<a href="/works/" aria-label="作品を見る"><img src="/assets/icons/pixieed/artwork.svg" alt=""></a>',
    works: '<a href="/collection/" aria-label="集めた作品を見る"><img src="/assets/icons/pixieed/artwork.svg" alt=""></a>',
    collection: '<a href="/works/" aria-label="作品を探す"><img src="/assets/icons/pixieed/artwork.svg" alt=""></a>',
    tools: '<a href="/pixel-camera.html" aria-label="ドット絵カメラを開く"><img src="/assets/icons/pixieed/camera.svg" alt=""></a>',
    stores: '<a href="/shops/" aria-label="お店として参加する"><img src="/assets/icons/pixieed/add.svg" alt=""></a>',
    shops: '<a href="#flow" aria-label="参加の流れを見る"><img src="/assets/icons/pixieed/forward.svg" alt=""></a>',
    profile: '<a href="/profile/?view=posts" aria-label="投稿した絵を見る"><img src="/assets/icons/pixieed/artwork.svg" alt=""></a>'
  };
  const contextAction = actions[page] || '<a href="/?post=1" aria-label="ドット絵を投稿する"><img src="/assets/icons/pixieed/add.svg" alt=""></a>';
  tabs.innerHTML = `<a data-nav="home" href="/home/" aria-label="ホーム"><img src="/assets/icons/pixieed/home.svg" alt=""></a><a data-nav="map" href="/" aria-label="地図"><img src="/assets/icons/pixieed/globe.svg" alt=""></a>${contextAction}<a data-nav="tools" href="/tools/" aria-label="ツール"><img src="/assets/icons/pixieed/celestial.svg" alt=""></a><a data-nav="profile" href="/profile/" aria-label="マイページ"><img src="/assets/icons/pixieed/profile.svg" alt=""></a>`;

  const footerLinks = document.querySelector('.footer-links');
  if (footerLinks) footerLinks.innerHTML = '<a href="/shops/">お店の方へ</a><a href="/about/">PiXiEEDについて</a><a href="/about/#contact">お問い合わせ</a>';
  if (!document.querySelector('[data-site-menu]')) document.body.insertAdjacentHTML('beforeend', getPublicShellMarkup());

  const menu = document.querySelector('[data-site-menu]');
  const backdrop = document.querySelector('[data-menu-backdrop]');
  const toggle = document.querySelector('[data-menu-toggle]');
  const close = document.querySelector('[data-menu-close]');
  let lastTrigger = null;
  let menuPointerId = null;
  let menuPointerStartX = 0;
  let menuPointerStartY = 0;
  let menuSwipeActive = false;
  let suppressMenuClick = false;
  const setMenuOpen = (open, returnFocus = false) => {
    if (!menu || !backdrop || !toggle) return;
    menu.hidden = !open;
    backdrop.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
    document.body.classList.toggle('is-menu-open', open);
    if (open) {
      lastTrigger = toggle;
      window.requestAnimationFrame(() => close?.focus({ preventScroll: true }));
    } else if (returnFocus) {
      lastTrigger?.focus({ preventScroll: true });
    }
  };
  toggle?.addEventListener('click', () => setMenuOpen(menu.hidden));
  close?.addEventListener('click', () => setMenuOpen(false, true));
  backdrop?.addEventListener('click', () => setMenuOpen(false, true));
  menu?.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    menuPointerId = event.pointerId;
    menuPointerStartX = event.clientX;
    menuPointerStartY = event.clientY;
    menuSwipeActive = false;
  });
  menu?.addEventListener('pointermove', (event) => {
    if (event.pointerId !== menuPointerId) return;
    const deltaX = event.clientX - menuPointerStartX;
    const deltaY = event.clientY - menuPointerStartY;
    if (Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY)) menuSwipeActive = true;
  });
  const endMenuPointer = (event) => {
    if (event.pointerId !== menuPointerId) return;
    const deltaX = event.clientX - menuPointerStartX;
    const deltaY = event.clientY - menuPointerStartY;
    const shouldClose = menuSwipeActive && deltaX > 72 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2;
    menuPointerId = null;
    menuSwipeActive = false;
    if (!shouldClose) return;
    suppressMenuClick = true;
    window.setTimeout(() => { suppressMenuClick = false; }, 350);
    setMenuOpen(false, true);
  };
  menu?.addEventListener('pointerup', endMenuPointer);
  menu?.addEventListener('pointercancel', endMenuPointer);
  menu?.addEventListener('click', (event) => {
    if (!suppressMenuClick) return;
    event.preventDefault();
    event.stopPropagation();
    suppressMenuClick = false;
  }, true);
  menu?.querySelectorAll('[data-menu-link]').forEach((link) => link.addEventListener('click', () => setMenuOpen(false)));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu && !menu.hidden) {
      event.preventDefault();
      setMenuOpen(false, true);
    }
  });
  menu?.querySelectorAll('[data-menu-coming-soon]').forEach((button) => button.addEventListener('click', () => showToast(`${button.dataset.menuComingSoon}は準備中です。`)));
}

function setActiveNav() {
  const path = window.location.pathname;
  document.querySelectorAll('[data-nav]').forEach((link) => {
    const target = link.dataset.nav;
    const active = target === 'home'
      ? path.startsWith('/home/')
      : target === 'map'
        ? path === '/' || path === '/index.html'
        : target === 'tools'
          ? path.includes('/tools/')
          : target === 'profile' && path.includes('/profile/');
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function renderHome() {
  const storeRoot = document.querySelector('[data-home-stores]');
  const worksRoot = document.querySelector('[data-home-works]');
  const officialWorks = getOfficialWorks();
  if (storeRoot) storeRoot.innerHTML = stores.map(storeCard).join('');
  if (worksRoot) worksRoot.innerHTML = officialWorks.length
    ? officialWorks.map(workCard).join('')
    : '<div class="empty-state">公開中の作品はありません。</div>';
  updateCollectionCounters();
}

function renderWorks() {
  const root = document.querySelector('[data-works-root]');
  if (!root) return;
  const officialWorks = getOfficialWorks();
  if (!officialWorks.length) {
    root.innerHTML = '<div class="empty-state"><h2>公開中の作品はありません。</h2><p>作品の公開までお待ちください。</p></div>';
    return;
  }
  root.innerHTML = `
    <form class="filter-bar" data-work-filter>
      <div class="field"><label for="work-search">絵を探す</label><input id="work-search" name="search" type="search" placeholder="作品名・キーワード"></div>
      <div class="field"><label for="work-tag">テーマ</label><select id="work-tag" name="tag"><option value="">すべて</option><option>海</option><option>猫</option><option>雨</option><option>夜</option><option>灯り</option></select></div>
      <div class="field"><label for="work-sort">並び順</label><select id="work-sort" name="sort"><option value="new">新しい順</option><option value="name">作品名順</option><option value="found">見つけた順</option></select></div>
    </form>
    <p class="filter-result" data-work-result></p>
    <div class="art-grid" data-work-grid></div>`;
  const form = root.querySelector('[data-work-filter]');
  const initialTag = new URLSearchParams(window.location.search).get('tag');
  if (initialTag && [...root.querySelector('#work-tag').options].some((option) => option.value === initialTag)) root.querySelector('#work-tag').value = initialTag;
  const render = () => {
    const params = new FormData(form);
    const search = String(params.get('search') || '').trim().toLowerCase();
    const tag = String(params.get('tag') || '');
    const sort = String(params.get('sort') || 'new');
    let filtered = officialWorks.filter((work) => {
      const haystack = `${work.title} ${work.subtitle} ${work.story} ${work.tags.join(' ')}`.toLowerCase();
      return (!search || haystack.includes(search)) && (!tag || work.tags.includes(tag));
    });
    if (sort === 'name') filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title, 'ja'));
    if (sort === 'found') filtered = [...filtered].sort((a, b) => Number(isFound(b.id)) - Number(isFound(a.id)));
    root.querySelector('[data-work-result]').textContent = `${filtered.length}作品を表示中`;
    root.querySelector('[data-work-grid]').innerHTML = filtered.length
      ? filtered.map(workCard).join('')
      : '<div class="empty-state">条件に合う作品はありません。</div>';
  };
  form.addEventListener('input', render);
  form.addEventListener('change', render);
  render();
}

function renderStores() {
  const root = document.querySelector('[data-stores-root]');
  if (!root) return;
  root.innerHTML = `
    <form class="filter-bar" data-store-filter>
      <div class="field"><label for="store-search">お店を探す</label><input id="store-search" name="search" type="search" placeholder="お店の名前・エリア"></div>
      <div class="field"><label for="store-limited">限定作品</label><select id="store-limited" name="limited"><option value="">すべて</option><option value="yes">限定作品あり</option></select></div>
    </form>
    <p class="filter-result" data-store-result></p>
    <div class="store-grid" data-store-grid></div>`;
  const form = root.querySelector('[data-store-filter]');
  const render = () => {
    const params = new FormData(form);
    const search = String(params.get('search') || '').trim().toLowerCase();
    const limited = String(params.get('limited') || '');
    const filtered = stores.filter((store) => {
      const haystack = `${store.name} ${store.area} ${store.description}`.toLowerCase();
      return (!search || haystack.includes(search)) && (!limited || (store.limitedWork && getWork(store.limitedWork)));
    });
    root.querySelector('[data-store-result]').textContent = `${filtered.length}店舗を表示中`;
    root.querySelector('[data-store-grid]').innerHTML = filtered.length ? filtered.map(storeCard).join('') : '<div class="empty-state">条件に合う店舗はまだありません。</div>';
  };
  form.addEventListener('input', render);
  form.addEventListener('change', render);
  render();
}

function renderWorkDetail() {
  const root = document.querySelector('[data-work-detail-root]');
  if (!root) return;
  const work = works.find((item) => !isSampleWork(item) && item.id === document.body.dataset.workId) || null;
  if (!work) {
    document.title = '作品が見つかりません｜PiXiEED';
    root.innerHTML = '<div class="empty-state"><h1>この作品は見つかりません。</h1><p>作品一覧から、いま見られる絵を探せます。</p><a class="button button--quiet" href="/works/">作品を見る</a></div>';
    return;
  }
  const from = new URLSearchParams(window.location.search).get('from');
  const fromStore = from ? getStore(from) : null;
  const found = isFound(work.id);
  const relatedStores = getStoresForWork(work.id);
  const relatedStoreMarkup = relatedStores.length ? relatedStores.map((store) => `<article class="store-mini"><h3>${escapeHtml(store.name)}</h3><p>${escapeHtml(store.area)}<br>${escapeHtml(store.status)}</p><a class="text-link" href="/stores/${store.id}.html" data-analytics-event="store_open" data-store-id="${escapeHtml(store.id)}">お店をのぞく</a></article>`).join('') : '<div class="empty-state">会えるお店が決まったら、ここにお知らせします。</div>';
  root.innerHTML = `
    <div class="breadcrumbs"><a href="/works/">絵を探す</a><span>/</span><span>${escapeHtml(work.title)}</span></div>
    ${fromStore ? `<div class="context-banner">${escapeHtml(fromStore.name)}で見つけた作品として表示しています。</div>` : ''}
    <div class="detail-hero">
      <div class="detail-art"><img src="${work.image}" alt="${escapeHtml(work.title)}の作品画像" fetchpriority="high" decoding="async" width="1254" height="1254"><button class="detail-art__zoom" type="button" data-open-image>画像を大きく見る</button></div>
      <article class="detail-copy">
        <span class="eyebrow">${work.limited ? 'limited work' : 'artwork'} / ${escapeHtml(work.id)}</span>
        <h1>${escapeHtml(work.title)}</h1>
        <p class="detail-copy__lead">${escapeHtml(work.story)}</p>
        <div class="tag-list">${tagMarkup(work)}${work.limited ? '<span class="tag tag--limited">店舗限定</span>' : ''}</div>
        <div class="detail-copy__actions"><button class="button button--stamp ${found ? 'is-found' : ''}" type="button" data-collect-work="${work.id}" aria-pressed="${found}">${found ? '見つけた作品に追加済み' : 'この作品を見つけた'}</button><button class="button button--like ${isLiked(work.id) ? 'is-liked' : ''}" type="button" data-like-work="${work.id}" aria-pressed="${isLiked(work.id)}">${isLiked(work.id) ? '♥' : '♡'} <span>${isLiked(work.id) ? 'いいね済み' : 'いいね'}</span></button><button class="button button--quiet" type="button" data-share>作品ページを共有</button></div>
        <dl class="detail-facts"><div class="detail-fact"><dt>edition</dt><dd>${escapeHtml(work.edition)}</dd></div><div class="detail-fact"><dt>palette</dt><dd>${escapeHtml(work.palette)}</dd></div></dl>
      </article>
    </div>
    <section class="subsection"><div class="section-heading"><div><span class="eyebrow">find it here</span><h2>店舗</h2></div></div><div class="store-list-mini">${relatedStoreMarkup}</div></section>
    <section class="subsection"><div class="section-heading"><div><span class="eyebrow">next find</span><h2>関連作品</h2></div></div><div class="related-grid">${relatedWorks(work.id)}</div></section>
    <dialog class="dialog" data-image-dialog><button class="dialog__close" type="button" data-close-image>閉じる</button><img src="${work.image}" alt="${escapeHtml(work.title)}の作品画像 拡大" loading="lazy" decoding="async" width="1254" height="1254"></dialog>`;
}

function renderStoreDetail() {
  const root = document.querySelector('[data-store-detail-root]');
  if (!root) return;
  const store = getStore(document.body.dataset.storeId);
  if (!store) {
    root.innerHTML = '<div class="breadcrumbs"><a href="/stores/">お店を探す</a><span>/</span><span>掲載情報の更新</span></div><div class="empty-state"><h1>お店の情報が更新されました。</h1><p>このページは、いまの掲載一覧にはありません。最新のお店の情報をご確認ください。</p><a class="button button--primary" href="/stores/">いま会えるお店を見る</a></div>';
    return;
  }
  const storeWorks = store.works.map(getWork).filter(Boolean);
  const limitedWork = store.limitedWork ? getWork(store.limitedWork) : null;
  root.innerHTML = `
    <div class="breadcrumbs"><a href="/stores/">お店を探す</a><span>/</span><span>${escapeHtml(store.name)}</span></div>
    <div class="store-hero"><div class="store-hero__visual"><span>${escapeHtml(store.route)}</span></div><article class="store-hero__copy"><div class="tag-list"><span class="tag tag--sample">${storeWorks.length ? '作品に会えるお店' : '絵が届く予定'}</span>${limitedWork ? '<span class="tag tag--limited">限定作品あり</span>' : ''}</div><h1>${escapeHtml(store.name)}</h1><p>${escapeHtml(store.description)}</p><dl class="store-facts"><div class="store-fact"><strong>エリア</strong><span>${escapeHtml(store.area)}</span></div><div class="store-fact"><strong>掲載状態</strong><span>${escapeHtml(store.status)}</span></div><div class="store-fact"><strong>住所</strong><span>${escapeHtml(store.address)}</span></div><div class="store-fact"><strong>営業時間</strong><span>${escapeHtml(store.hours)}</span></div></dl><a class="button button--primary" href="/works/">${storeWorks.length ? 'このお店で会える絵を見る' : '作品を見る'}</a></article></div>
    <section class="subsection"><div class="store-location"><div class="store-location__map" data-store-map-root="${store.id}"><div class="store-map-fallback" data-store-map-fallback><span class="store-location__route">${escapeHtml(store.route)}</span><span class="store-location__pin">✦</span><span class="store-location__line store-location__line--one"></span><span class="store-location__line store-location__line--two"></span><span class="store-location__label">${escapeHtml(store.area)}</span></div></div><div class="store-location__copy"><span class="eyebrow">store map</span><h2>このお店はここ。</h2><p>PiXiEEDの地図で、このお店の場所を見られます。実際の道順を調べるときは、外部の地図も開けます。</p>${storeMapLink(store, '行き方を調べる')}<a class="text-link" href="/stores/">地図に戻って、別のお店を見る</a></div></div></section>
    <section class="subsection"><div class="section-heading"><div><span class="eyebrow">at this store</span><h2>このお店で会える絵</h2></div><p>${storeWorks.length ? 'いま置いている絵を紹介しています。' : '絵が届くと、ここに並びます。'}</p></div><div class="related-grid">${storeWorks.length ? storeWorks.map(workCard).join('') : ''}</div></section>
    ${limitedWork ? `<section class="subsection"><div class="shop-panel shop-panel--dark"><span class="eyebrow">store limited</span><h2>${escapeHtml(limitedWork.title)}</h2><p class="lead">この店舗のためにおろす限定作品です。継続購入店舗だけが扱える作品として紹介します。</p><a class="button button--light" href="/works/${limitedWork.id}.html">限定作品を見る</a></div></section>` : ''}`;
}

function renderCollection() {
  const root = document.querySelector('[data-collection-root]');
  if (!root) return;
  const officialWorks = getOfficialWorks();
  const found = loadFound();
  const foundOfficial = found.filter((id) => officialWorks.some((work) => work.id === id));
  const percentage = officialWorks.length ? Math.round((foundOfficial.length / officialWorks.length) * 100) : 0;
  const collectionMessage = officialWorks.length === 0
    ? '作品に出会うと、ここに記録できます。'
    : percentage === 100
      ? 'すべての作品に出会いました。'
      : `あと${officialWorks.length - foundOfficial.length}作品でコンプリート`;
  const collectionGrid = officialWorks.length
    ? officialWorks.map((work) => `<article class="collection-item ${found.includes(work.id) ? 'is-found' : ''}"><a class="collection-item__image" href="/works/${work.id}.html"><img src="${work.image}" alt="${escapeHtml(work.title)}の作品画像" loading="lazy" decoding="async" width="1254" height="1254"></a><span class="collection-item__mark" aria-label="見つけた作品">✓</span><div class="collection-item__body"><h3>${escapeHtml(work.title)}</h3><p>${found.includes(work.id) ? '見つけた作品' : 'まだ出会っていない作品'}</p></div></article>`).join('')
    : '<div class="empty-state">最初の作品との出会いをお待ちください。</div>';
  root.innerHTML = `
    <div class="collection-head"><div><span class="eyebrow">your finds</span><h1>見つけた絵を、<br>ここに残す。</h1><p class="lead">QRコードから作品ページを開いて「見つけた」を押すと、この端末に記録されます。</p></div><div class="progress-card"><div class="progress-card__top"><strong>${foundOfficial.length}<small> / ${officialWorks.length}</small></strong><span>作品</span></div><div class="progress-bar" aria-label="コレクションの進捗"><span style="width:${percentage}%"></span></div><p>${collectionMessage}</p></div></div>
    <div class="collection-grid">${collectionGrid}</div>
    <div class="collection-empty" style="margin-top:1.5rem">このコレクションはログインなしで、この端末にだけ保存されます。機種変更やブラウザのデータ削除で消える場合があります。</div>`;
}

function updateCollectionCounters() {
  const officialWorks = getOfficialWorks();
  const found = loadFound().filter((id) => officialWorks.some((work) => work.id === id));
  document.querySelectorAll('[data-found-count]').forEach((element) => { element.textContent = found.length; });
  document.querySelectorAll('[data-total-count]').forEach((element) => { element.textContent = officialWorks.length; });
}

function renderProfile() {
  const root = document.querySelector('[data-profile-root]');
  if (!root) return;
  const officialWorks = getOfficialWorks();
  const found = loadFound().filter((id) => officialWorks.some((work) => work.id === id));
  const liked = officialWorks.filter((work) => isLiked(work.id));
  const view = new URLSearchParams(window.location.search).get('view') || 'home';
  const viewTitle = view === 'likes' ? 'いいねした作品' : view === 'history' ? 'QRを読んだ履歴' : view === 'posts' ? '投稿した絵' : '自分のページ';
  const viewBody = view === 'likes'
      ? (liked.length ? `<div class="art-grid">${liked.map(workCard).join('')}</div>` : '<div class="empty-state">いいねした作品はまだありません。</div>')
      : view === 'history'
        ? `<div class="profile-record"><strong>${found.length}作品</strong><p>QRコードから見つけた作品が、この端末に記録されています。</p><a class="button button--quiet" href="/collection/">見つけた記録を見る</a></div>`
      : view === 'posts'
        ? '<div class="profile-record"><strong>投稿した絵</strong><p>投稿したドット絵は、確認後に日本地図のセルから確認できます。</p><a class="button button--primary" href="/?post=1">地図に投稿する</a></div>'
        : `<div class="profile-grid"><a class="profile-card" href="/works/"><span class="eyebrow">official works</span><strong>${officialWorks.length}作品</strong><span>PiXiEEDの作品を見る</span></a><a class="profile-card" href="/collection/"><span class="eyebrow">your finds</span><strong>${found.length}作品</strong><span>見つけた記録を見る</span></a><a class="profile-card" href="/?post=1"><span class="eyebrow">participate</span><strong>投稿する</strong><span>街の地図に作品を置く</span></a></div>`;
  root.innerHTML = `<div class="profile-head"><div><span class="eyebrow">your space</span><h1>自分のページ</h1><p class="lead">見つけた作品や、これから参加する方法をここにまとめます。</p></div><div class="profile-avatar" aria-hidden="true">P</div></div><nav class="profile-tabs" aria-label="自分のページ内メニュー"><a href="/profile/"${view === 'home' ? ' aria-current="page"' : ''}>概要</a><a href="/profile/?view=posts"${view === 'posts' ? ' aria-current="page"' : ''}>投稿した絵</a><a href="/profile/?view=likes"${view === 'likes' ? ' aria-current="page"' : ''}>いいね</a><a href="/profile/?view=history"${view === 'history' ? ' aria-current="page"' : ''}>履歴</a></nav><section class="profile-content"><h2>${viewTitle}</h2>${viewBody}</section><p class="profile-note">現在はゲストモードです。作品の保存はこの端末に行われます。</p>`;
}

function showToast(message) {
  let toast = document.querySelector('[data-toast]');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    toast.dataset.toast = '';
    toast.setAttribute('role', 'status');
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function bindInteractive() {
  document.querySelectorAll('[data-tool-coming-soon]').forEach((button) => {
    button.addEventListener('click', () => {
      showToast(`${button.dataset.toolComingSoon}は、もう少しだけお待ちください。`);
    });
  });
  document.querySelectorAll('[data-collect-work]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.collectWork;
      const found = toggleFound(id);
      const active = found.includes(id);
      button.classList.toggle('is-found', active);
      button.setAttribute('aria-pressed', String(active));
      button.textContent = active ? '見つけた作品に追加済み' : 'この作品を見つけた';
      trackEvent(active ? 'work_found' : 'work_unfound', { work_id: id });
      showToast(active ? 'コレクションに追加しました。' : 'コレクションから外しました。');
      updateCollectionCounters();
    });
  });
  document.querySelectorAll('[data-like-work]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.likeWork;
      const key = 'PiXiEED:liked-works:v1';
      let liked = [];
      try { liked = JSON.parse(localStorage.getItem(key) || '[]'); } catch { liked = []; }
      const active = liked.includes(id);
      const next = active ? liked.filter((item) => item !== id) : [...liked, id];
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* local storage may be blocked */ }
      button.classList.toggle('is-liked', !active);
      button.setAttribute('aria-pressed', String(!active));
      button.innerHTML = `${!active ? '♥' : '♡'} <span>${!active ? 'いいね済み' : 'いいね'}</span>`;
      trackEvent(!active ? 'work_like' : 'work_unlike', { work_id: id });
      showToast(!active ? 'いいねを記録しました。' : 'いいねを取り消しました。');
    });
  });
  const dialog = document.querySelector('[data-image-dialog]');
  document.querySelector('[data-open-image]')?.addEventListener('click', () => dialog?.showModal());
  document.querySelector('[data-close-image]')?.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  document.querySelector('[data-share]')?.addEventListener('click', async () => {
    const shareData = { title: document.title, text: 'この絵を見つけました。', url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else { await navigator.clipboard.writeText(window.location.href); showToast('作品ページのリンクをコピーしました。'); }
      trackEvent('work_share', { work_id: document.body.dataset.workId || '' });
    } catch { /* share was cancelled */ }
  });
}

function renderPublicDataSurfaces() {
  if (page === 'home') renderHome();
  if (page === 'works') renderWorks();
  if (page === 'stores') renderStores();
  if (page === 'work-detail') renderWorkDetail();
  if (page === 'store-detail') renderStoreDetail();
  if (page === 'collection') renderCollection();
  if (page === 'profile') renderProfile();
  document.querySelectorAll('[data-discovery-map-root]').forEach(renderDiscoveryMap);
  bindInteractive();
  updateCollectionCounters();
}

function startPublicDataRefresh() {
  const endpoint = String(mapConfig.publicDataEndpoint || '').trim();
  const hasUserPostSource = Boolean(String(supabaseConfig.url || '').trim() && String(supabaseConfig.publishableKey || '').trim());
  const interval = Number(mapConfig.publicDataRefreshMs || 0);
  if ((!endpoint && !hasUserPostSource) || !Number.isFinite(interval) || interval < 60_000) return;
  window.setInterval(async () => {
    if (document.visibilityState !== 'visible') return;
    const result = await hydrateSiteData();
    if (result.changed) renderPublicDataSurfaces();
  }, interval);
}

async function boot() {
  renderPublicShell();
  setActiveNav();
  loadCachedPublicData();
  renderPublicDataSurfaces();
  scheduleAnalytics();
  startPublicDataRefresh();
  const result = await hydrateSiteData();
  if (result.changed) renderPublicDataSurfaces();
}

void boot();
