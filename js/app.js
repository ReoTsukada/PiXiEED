import { isSampleWork, publicWorksOnly } from './public-work-policy.mjs';
import { events as fallbackEvents, stores as fallbackStores, works as fallbackWorks } from '../data/site-data.js?rev=20260924-no-samples-1';
import { mapConfig, supabaseConfig } from '../data/site-config.js?rev=20260918-post-v1';

const FOUND_KEY = 'PiXiEED:found-works:v1';
const LEGACY_FOUND_KEY = '絵のよりみち:found-works:v1';
const PUBLIC_DATA_CACHE_KEY = 'PiXiEED:public-data-cache:v2';
const PUBLIC_DATA_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
const PUBLIC_DATA_SESSION_CACHE_KEY = 'PiXiEED:public-data-session-cache:v2';
const PUBLIC_DATA_REFRESH_KEY = 'PiXiEED:public-data-last-refresh:v1';
const PUBLIC_DATA_REFRESH_WINDOW = 5 * 60 * 1000;
const USER_MAP_POST_CACHE_KEY = 'PiXiEED:user-map-post-cache:v1';
const USER_MAP_POST_CACHE_MAX_AGE = 5 * 60 * 1000;
const ANALYTICS_CONSENT_KEY = 'PiXiEED:analytics-consent:v1';
const MAP_ASSET_URL = '/assets/maps/world-countries-110m.geojson?rev=20260919-world-geojson-v1';
const JAPAN_PREFECTURE_ASSET_URL = '/assets/maps/japan-prefectures.geojson?rev=20260919-japan-prefectures-v1';
const MAP_ASSET_KIND = 'world-geojson';
const WORLD_MAP_VIEW_BOX = '0 0 1000 1000';
// 100%時に日本が従来の地図面いっぱいに見えるよう、日本を基準にした
// 経緯度スケールを採用する。世界の図形はSVGの表示領域の外側まで続き、
// ズームアウトするとそのまま世界全体が現れる。
const WORLD_MAP_FOCUS_CENTER = Object.freeze({ longitude: 137.2, latitude: 35.5 });
const WORLD_MAP_FOCUS_SPAN = 24;
const WORLD_GLOBE_OVERVIEW_CENTER = Object.freeze({ longitude: 0, latitude: 18 });
const GLOBE_RADIUS_PERCENT = 210;
const WORLD_MAP_CREDIT = '地図データ：Natural Earth / Geolonia GeoJSON';
// 日本100%時の固定セル。ズームで分割せず、同じセルをそのまま拡大する。
const MAP_CELL_GRID = 128;
// 世界表示用の固定セル。経度-180〜180度、緯度90〜-90度を均等に区切る。
// 日本セルとは表示倍率を分けるが、世界側でもズームによる分割は行わない。
const WORLD_CELL_GRID = 128;
// 日本の100%表示で使う1セルの経緯度幅。海外もこの幅を使うが、
// 全世界を一度に生成せず、現在見えている陸地だけをCanvasへ描く。
const WORLD_FINE_CELL_DEGREES = WORLD_MAP_FOCUS_SPAN / MAP_CELL_GRID;
// 世界の細胞グリッドは、日本100%表示の細胞境界と同じ基準線から始める。
// 以前は経度-180度・緯度90度を原点にしていたため、世界側Canvasと
// 日本側の掲載セルが0.05〜0.13度ほどずれて重なっていた。
const WORLD_FINE_GRID_ORIGIN_LONGITUDE = WORLD_MAP_FOCUS_CENTER.longitude - WORLD_MAP_FOCUS_SPAN / 2;
const WORLD_FINE_GRID_FOCUS_NORTH_INDEX = Math.round(
  (90 - (WORLD_MAP_FOCUS_CENTER.latitude + WORLD_MAP_FOCUS_SPAN / 2)) / WORLD_FINE_CELL_DEGREES
);
const WORLD_FINE_GRID_NORTH_LATITUDE = 90 + (
  (WORLD_MAP_FOCUS_CENTER.latitude + WORLD_MAP_FOCUS_SPAN / 2)
  - (90 - WORLD_FINE_GRID_FOCUS_NORTH_INDEX * WORLD_FINE_CELL_DEGREES)
);
const WORLD_FINE_CELL_GRID_X = Math.round(360 / WORLD_FINE_CELL_DEGREES);
const WORLD_FINE_CELL_GRID_Y = Math.ceil((WORLD_FINE_GRID_NORTH_LATITUDE + 90) / WORLD_FINE_CELL_DEGREES);
// 地図の再表示・レイヤー切り替えで同じJSONを読み直さない。
// 通常のHTTPキャッシュに加え、同一ページ内ではPromiseと解析済みデータを共有する。
const MAP_JSON_DATA_CACHE = new Map();
const MAP_JSON_PROMISE_CACHE = new Map();
const WORLD_LAND_CELL_COORDINATE_CACHE = new Map();
const WORLD_FOCUS_LAND_CELL_COORDINATE_CACHE = new Map();
const WORLD_FINE_LAND_CELL_CACHE = new Map();
const WORLD_CELL_COORDINATE_STORAGE_PREFIX = 'PiXiEED:world-cell-coordinates:v2:';
const WORLD_LAND_CELL_STATE_CACHE = new Map();

function readStoredWorldCellCoordinates(cacheKey) {
  try {
    const raw = localStorage.getItem(`${WORLD_CELL_COORDINATE_STORAGE_PREFIX}${cacheKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some((cell) => !Number.isInteger(cell?.cellX) || !Number.isInteger(cell?.cellY))) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredWorldCellCoordinates(cacheKey, cells) {
  try {
    localStorage.setItem(`${WORLD_CELL_COORDINATE_STORAGE_PREFIX}${cacheKey}`, JSON.stringify(cells));
  } catch {
    // ストレージ容量やプライベートブラウズの制限があっても、メモリキャッシュは継続する。
  }
}

async function loadCachedMapJson(url) {
  if (MAP_JSON_DATA_CACHE.has(url)) return MAP_JSON_DATA_CACHE.get(url);
  if (MAP_JSON_PROMISE_CACHE.has(url)) return MAP_JSON_PROMISE_CACHE.get(url);
  const promise = fetch(url, {
    headers: { Accept: 'application/geo+json, application/json' },
    cache: 'force-cache'
  }).then((response) => {
    if (!response.ok) throw new Error(`Map asset request failed: ${response.status}`);
    return response.json();
  }).then((data) => {
    MAP_JSON_DATA_CACHE.set(url, data);
    return data;
  });
  MAP_JSON_PROMISE_CACHE.set(url, promise);
  try {
    return await promise;
  } catch (error) {
    MAP_JSON_PROMISE_CACHE.delete(url);
    throw error;
  }
}

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
let publicDataHydrationPromise = null;
const MOTION_PREFERENCE_KEY = 'PiXiEED:motion-preference:v1';

function isAnalyticsAllowed() {
  try { return localStorage.getItem(ANALYTICS_CONSENT_KEY) !== 'denied'; } catch { return true; }
}

function applyMotionPreference() {
  let reduced = false;
  try { reduced = localStorage.getItem(MOTION_PREFERENCE_KEY) === 'reduced'; } catch { /* storage may be blocked */ }
  document.documentElement.dataset.pixieedMotion = reduced ? 'reduced' : 'full';
  return reduced;
}

function trackEvent(eventName, properties = {}) {
  if (!isAnalyticsAllowed()) return;
  if (analyticsTrackEvent) {
    analyticsTrackEvent(eventName, properties);
    return;
  }
  if (analyticsQueue.length < 24) analyticsQueue.push({ eventName, properties });
}

function scheduleAnalytics() {
  if (!isAnalyticsAllowed()) return;
  const load = () => {
    if (analyticsPromise) return;
    analyticsPromise = import('./analytics.js?rev=20260918-privacy-v2').then(({ bindAnalytics, trackEvent: sendAnalyticsEvent }) => {
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
const JAPAN_PREFECTURE_CODE_SET = new Set(JAPAN_PREFECTURES.map(([code]) => code));
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
  '45': { x: 25, y: 83 }, '46': { x: 21, y: 82 }, '47': { x: 8, y: 96.5 }
});

// 既存の日本向けデータを世界GeoJSON上へ置くための代表経緯度。
// 店舗に緯度経度がある場合は、そちらを優先する。
const PREFECTURE_WORLD_COORDINATES = Object.freeze({
  '01': [142.5, 43.0], '02': [140.7, 40.8], '03': [141.3, 39.7], '04': [140.9, 38.3],
  '05': [140.1, 39.7], '06': [140.1, 38.4], '07': [140.5, 37.4], '08': [140.4, 36.3],
  '09': [139.9, 36.6], '10': [138.9, 36.5], '11': [139.5, 36.0], '12': [140.2, 35.5],
  '13': [139.7, 35.7], '14': [139.4, 35.4], '15': [138.9, 37.5], '16': [137.2, 36.7],
  '17': [136.8, 36.6], '18': [136.2, 36.0], '19': [138.6, 35.6], '20': [138.0, 36.2],
  '21': [137.1, 35.8], '22': [138.4, 35.0], '23': [136.9, 35.2], '24': [136.5, 34.7],
  '25': [136.1, 35.2], '26': [135.8, 35.2], '27': [135.5, 34.7], '28': [134.8, 35.0],
  '29': [135.8, 34.3], '30': [135.5, 33.9], '31': [134.2, 35.4], '32': [132.6, 35.1],
  '33': [133.9, 34.9], '34': [132.7, 34.4], '35': [131.5, 34.2], '36': [134.2, 33.9],
  '37': [134.0, 34.3], '38': [132.8, 33.8], '39': [133.5, 33.5], '40': [130.4, 33.5],
  '41': [130.3, 33.3], '42': [129.9, 32.8], '43': [130.7, 32.8], '44': [131.6, 33.2],
  '45': [131.4, 32.0], '46': [130.6, 31.6], '47': [127.7, 26.2]
});

const WORLD_REGION_NAME_BY_CODE = new Map();

function projectWorldCoordinate(longitude, latitude) {
  const safeLongitude = Math.min(180, Math.max(-180, Number(longitude) || 0));
  const safeLatitude = Math.min(90, Math.max(-90, Number(latitude) || 0));
  return {
    x: 50 + ((safeLongitude - WORLD_MAP_FOCUS_CENTER.longitude) / WORLD_MAP_FOCUS_SPAN) * 100,
    y: 50 - ((safeLatitude - WORLD_MAP_FOCUS_CENTER.latitude) / WORLD_MAP_FOCUS_SPAN) * 100
  };
}

function normalizeLongitude(value) {
  const number = Number(value) || 0;
  return ((number + 540) % 360) - 180;
}

function getShortestLongitudeDelta(start, end) {
  return normalizeLongitude(Number(end) - Number(start));
}

function getWorldCoordinateFromMapPoint(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  return {
    longitude: WORLD_MAP_FOCUS_CENTER.longitude + (((Number.isFinite(x) ? x : 50) - 50) / 100) * WORLD_MAP_FOCUS_SPAN,
    latitude: WORLD_MAP_FOCUS_CENTER.latitude - (((Number.isFinite(y) ? y : 50) - 50) / 100) * WORLD_MAP_FOCUS_SPAN
  };
}

function projectGlobeCoordinate(longitude, latitude, view = {}) {
  const centerLongitude = Number(view.centerLongitude ?? view.longitude ?? WORLD_MAP_FOCUS_CENTER.longitude);
  const centerLatitude = Number(view.centerLatitude ?? view.latitude ?? WORLD_MAP_FOCUS_CENTER.latitude);
  const lambda = getShortestLongitudeDelta(centerLongitude, longitude) * Math.PI / 180;
  const phi = Number(latitude) * Math.PI / 180;
  const lambda0 = centerLongitude * Math.PI / 180;
  const phi0 = centerLatitude * Math.PI / 180;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinPhi0 = Math.sin(phi0);
  const cosPhi0 = Math.cos(phi0);
  const cosLambda = Math.cos(lambda);
  const depth = sinPhi0 * sinPhi + cosPhi0 * cosPhi * cosLambda;
  return {
    x: 50 + GLOBE_RADIUS_PERCENT * cosPhi * Math.sin(lambda),
    y: 50 - GLOBE_RADIUS_PERCENT * (cosPhi0 * sinPhi - sinPhi0 * cosPhi * cosLambda),
    depth,
    visible: depth >= -0.015
  };
}

function inverseProjectGlobeCoordinate(x, y, view = {}) {
  const centerLongitude = Number(view.centerLongitude ?? view.longitude ?? WORLD_MAP_FOCUS_CENTER.longitude);
  const centerLatitude = Number(view.centerLatitude ?? view.latitude ?? WORLD_MAP_FOCUS_CENTER.latitude);
  const normalizedX = (Number(x) - 50) / GLOBE_RADIUS_PERCENT;
  const normalizedY = -(Number(y) - 50) / GLOBE_RADIUS_PERCENT;
  const rho = Math.hypot(normalizedX, normalizedY);
  if (!Number.isFinite(rho) || rho > 1.0001) return null;
  if (rho < .000001) return { longitude: normalizeLongitude(centerLongitude), latitude: centerLatitude };
  const phi0 = centerLatitude * Math.PI / 180;
  const lambda0 = centerLongitude * Math.PI / 180;
  const angularDistance = Math.asin(Math.min(1, rho));
  const sinDistance = Math.sin(angularDistance);
  const cosDistance = Math.cos(angularDistance);
  const latitude = Math.asin(
    cosDistance * Math.sin(phi0)
      + (normalizedY * sinDistance * Math.cos(phi0)) / rho
  );
  const longitude = lambda0 + Math.atan2(
    normalizedX * sinDistance,
    rho * Math.cos(phi0) * cosDistance - normalizedY * Math.sin(phi0) * sinDistance
  );
  return {
    longitude: normalizeLongitude(longitude * 180 / Math.PI),
    latitude: latitude * 180 / Math.PI
  };
}

function getWorldGridCellBounds(cellX, cellY, grid = WORLD_CELL_GRID) {
  const longitudeStep = 360 / grid;
  const latitudeStep = 180 / grid;
  return {
    west: -180 + cellX * longitudeStep,
    east: -180 + (cellX + 1) * longitudeStep,
    north: 90 - cellY * latitudeStep,
    south: 90 - (cellY + 1) * latitudeStep
  };
}

function getWorldFineCellBounds(cellX, cellY) {
  const normalizedX = ((Number(cellX) % WORLD_FINE_CELL_GRID_X) + WORLD_FINE_CELL_GRID_X) % WORLD_FINE_CELL_GRID_X;
  const safeY = Math.min(WORLD_FINE_CELL_GRID_Y - 1, Math.max(0, Number(cellY) || 0));
  return {
    // 経度は原点から一周分を連続値で保持する。投影時は最短経度差を
    // 使うため、180度をまたぐセルも分断されずに描画できる。
    west: WORLD_FINE_GRID_ORIGIN_LONGITUDE + normalizedX * WORLD_FINE_CELL_DEGREES,
    east: WORLD_FINE_GRID_ORIGIN_LONGITUDE + (normalizedX + 1) * WORLD_FINE_CELL_DEGREES,
    north: WORLD_FINE_GRID_NORTH_LATITUDE - safeY * WORLD_FINE_CELL_DEGREES,
    south: WORLD_FINE_GRID_NORTH_LATITUDE - (safeY + 1) * WORLD_FINE_CELL_DEGREES
  };
}

function getGlobeWorldCellPath(cellX, cellY, grid, view) {
  const bounds = getWorldGridCellBounds(cellX, cellY, grid);
  return orthographicRingToPath([
    [bounds.west, bounds.north],
    [bounds.east, bounds.north],
    [bounds.east, bounds.south],
    [bounds.west, bounds.south]
  ], view);
}

function isPointInGeoJsonRing(longitude, latitude, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    if (!Array.isArray(currentPoint) || !Array.isArray(previousPoint)) continue;
    const currentLongitude = Number(currentPoint[0]);
    const currentLatitude = Number(currentPoint[1]);
    const previousLongitude = Number(previousPoint[0]);
    const previousLatitude = Number(previousPoint[1]);
    if (!Number.isFinite(currentLongitude) || !Number.isFinite(currentLatitude)
      || !Number.isFinite(previousLongitude) || !Number.isFinite(previousLatitude)) continue;
    const crossesLatitude = (currentLatitude > latitude) !== (previousLatitude > latitude);
    if (!crossesLatitude) continue;
    const crossingLongitude = ((previousLongitude - currentLongitude) * (latitude - currentLatitude))
      / (previousLatitude - currentLatitude) + currentLongitude;
    if (longitude < crossingLongitude) inside = !inside;
  }
  return inside;
}

function isPointInGeoJsonGeometry(longitude, latitude, geometry) {
  if (!geometry?.coordinates) return false;
  const polygonContains = (polygon) => {
    if (!Array.isArray(polygon) || !isPointInGeoJsonRing(longitude, latitude, polygon[0])) return false;
    return !polygon.slice(1).some((hole) => isPointInGeoJsonRing(longitude, latitude, hole));
  };
  if (geometry.type === 'Polygon') return polygonContains(geometry.coordinates);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some(polygonContains);
  return false;
}

function interpolateWorldCoordinate(start, end, ratio) {
  const startLongitude = Number(start?.[0]) || 0;
  const endLongitude = startLongitude + getShortestLongitudeDelta(startLongitude, end?.[0]);
  return [
    startLongitude + ((endLongitude - startLongitude) * ratio),
    (Number(start?.[1]) || 0) + (((Number(end?.[1]) || 0) - (Number(start?.[1]) || 0)) * ratio)
  ];
}

function orthographicRingToPath(ring, view) {
  if (!Array.isArray(ring) || ring.length < 3) return '';
  const parts = [];
  let currentPart = [];
  const flush = () => {
    if (currentPart.length >= 3) parts.push(currentPart);
    currentPart = [];
  };
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index];
    const end = ring[(index + 1) % ring.length];
    const startPoint = projectGlobeCoordinate(start[0], start[1], view);
    const endPoint = projectGlobeCoordinate(end[0], end[1], view);
    if (startPoint.visible && endPoint.visible) {
      if (!currentPart.length) currentPart.push(startPoint);
      currentPart.push(endPoint);
      continue;
    }
    if (startPoint.visible !== endPoint.visible) {
      let low = 0;
      let high = 1;
      for (let step = 0; step < 14; step += 1) {
        const middle = (low + high) / 2;
        const middlePoint = projectGlobeCoordinate(...interpolateWorldCoordinate(start, end, middle), view);
        if (middlePoint.visible === startPoint.visible) low = middle;
        else high = middle;
      }
      const boundary = projectGlobeCoordinate(...interpolateWorldCoordinate(start, end, (low + high) / 2), view);
      if (startPoint.visible) {
        if (!currentPart.length) currentPart.push(startPoint);
        currentPart.push(boundary);
        flush();
      } else {
        currentPart = [boundary, endPoint];
      }
      continue;
    }
    flush();
  }
  flush();
  return parts.map((part) => `M${part.map(({ x, y }) => `${formatWorldCoordinate(x * 10)},${formatWorldCoordinate(y * 10)}`).join('L')}Z`).join(' ');
}

function orthographicGeometryToPath(geometry, view) {
  if (!geometry || !geometry.coordinates) return '';
  if (geometry.type === 'Polygon') return geometry.coordinates.map((ring) => orthographicRingToPath(ring, view)).filter(Boolean).join(' ');
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.flatMap((polygon) => polygon.map((ring) => orthographicRingToPath(ring, view))).filter(Boolean).join(' ');
  }
  return '';
}

function getGlobeCellProjection(cellX, cellY, grid, view) {
  const cellSize = 100 / grid;
  const toGlobePoint = ([x, y]) => {
    const coordinate = getWorldCoordinateFromMapPoint({ x, y });
    return projectGlobeCoordinate(coordinate.longitude, coordinate.latitude, view);
  };
  const corners = [
    [cellX * cellSize, cellY * cellSize],
    [(cellX + 1) * cellSize, cellY * cellSize],
    [(cellX + 1) * cellSize, (cellY + 1) * cellSize],
    [cellX * cellSize, (cellY + 1) * cellSize]
  ].map(toGlobePoint);
  const centerCoordinate = getWorldCoordinateFromMapPoint({
    x: (cellX + .5) * cellSize,
    y: (cellY + .5) * cellSize
  });
  const center = projectGlobeCoordinate(centerCoordinate.longitude, centerCoordinate.latitude, view);
  const visible = corners.some((point) => point.visible) || center.visible;
  if (!visible) return { visible: false, corners: [], center: null, bounds: null };
  const visiblePoints = [...corners.filter((point) => point.visible), ...(center.visible ? [center] : [])];
  const xs = visiblePoints.map((point) => point.x);
  const ys = visiblePoints.map((point) => point.y);
  return {
    visible: true,
    corners,
    center,
    bounds: {
      left: Math.min(...xs),
      top: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys)
    }
  };
}

function getGlobeCellPath(cellX, cellY, grid, view) {
  const projection = getGlobeCellProjection(cellX, cellY, grid, view);
  if (!projection.visible || projection.corners.length < 3) return '';
  const points = projection.corners.filter((point) => point.visible);
  if (points.length < 3 && projection.center) points.push(projection.center);
  if (points.length < 3) return '';
  return `M${points.map(({ x, y }) => `${formatWorldCoordinate(x * 10)},${formatWorldCoordinate(y * 10)}`).join('L')}Z`;
}

function getGlobeWorldCellProjection(cellX, cellY, grid, view) {
  const bounds = getWorldGridCellBounds(cellX, cellY, grid);
  const corners = [
    [bounds.west, bounds.north],
    [bounds.east, bounds.north],
    [bounds.east, bounds.south],
    [bounds.west, bounds.south]
  ].map(([longitude, latitude]) => projectGlobeCoordinate(longitude, latitude, view));
  const center = projectGlobeCoordinate(
    (bounds.west + bounds.east) / 2,
    (bounds.north + bounds.south) / 2,
    view
  );
  const visible = corners.some((point) => point.visible) || center.visible;
  if (!visible) return { visible: false, corners: [], center: null, bounds: null };
  const visiblePoints = [...corners.filter((point) => point.visible), ...(center.visible ? [center] : [])];
  const xs = visiblePoints.map((point) => point.x);
  const ys = visiblePoints.map((point) => point.y);
  return {
    visible: true,
    corners,
    center,
    bounds: {
      left: Math.min(...xs),
      top: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys)
    }
  };
}

function getGlobeWorldFineCellProjection(cellX, cellY, view) {
  const bounds = getWorldFineCellBounds(cellX, cellY);
  const corners = [
    [bounds.west, bounds.north],
    [bounds.east, bounds.north],
    [bounds.east, bounds.south],
    [bounds.west, bounds.south]
  ].map(([longitude, latitude]) => projectGlobeCoordinate(longitude, latitude, view));
  const center = projectGlobeCoordinate(
    (bounds.west + bounds.east) / 2,
    (bounds.north + bounds.south) / 2,
    view
  );
  const visible = corners.some((point) => point.visible) || center.visible;
  if (!visible) return { visible: false, corners: [], center: null, bounds: null };
  const visiblePoints = [...corners.filter((point) => point.visible), ...(center.visible ? [center] : [])];
  const xs = visiblePoints.map((point) => point.x);
  const ys = visiblePoints.map((point) => point.y);
  return {
    visible: true,
    corners,
    center,
    bounds: {
      left: Math.min(...xs),
      top: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys)
    }
  };
}

// Canvasとクリック可能セルが同じ形になるよう、表示用の投影補正を共有する。
// 枠だけを広げて中のpolygonを補正しないと、セルの背面グリッドと掲載セルが
// ずれて見えるため、点も同じ中心・倍率で移動させる。
// 経度・緯度をそのまま投影すると日本付近のセルは緯度方向に約1.2倍長く
// 見えるため、画面中央の選択対象だけ縦横差を抑える。周辺セルは地理投影を
// 保ち、セル同士の間隔や地図の輪郭を変えない。
function getCellDisplayGeometry(projection) {
  if (!projection?.visible || !projection.bounds || !projection.center?.visible) {
    return { bounds: projection?.bounds || null, isCenterCell: false, scaleX: 1, scaleY: 1 };
  }
  const { left, top, right, bottom } = projection.bounds;
  const width = Math.max(.01, right - left);
  const height = Math.max(.01, bottom - top);
  // 完全な正方形を強制せず、縦横差の50%だけを中央へ寄せる。
  // 以前の70%は横長へ少し行き過ぎ、CanvasとDOMの差を目立たせていた。
  const balance = .5;
  const widthAdjustment = (height - width) * balance;
  const balancedWidth = width + widthAdjustment;
  const balancedHeight = height - widthAdjustment;
  const aspect = Math.max(width / height, height / width);
  const distanceFromViewportCenter = Math.hypot(projection.center.x - 50, projection.center.y - 50);
  const centerThreshold = Math.max(.35, Math.max(width, height) * .72);
  // 球の縁に近い強い遠近セルや中央から離れたセルは無理に正方形へ変形しない。
  // 日本付近の中央セルだけ、背面Canvasと掲載セルの両方を同じバランスで表示する。
  if (distanceFromViewportCenter > centerThreshold || aspect > 1.3 || Math.abs(width - height) < .01) {
    return { bounds: projection.bounds, isCenterCell: false, scaleX: 1, scaleY: 1 };
  }
  return {
    bounds: {
      left: projection.center.x - balancedWidth / 2,
      top: projection.center.y - balancedHeight / 2,
      right: projection.center.x + balancedWidth / 2,
      bottom: projection.center.y + balancedHeight / 2
    },
    isCenterCell: true,
    scaleX: balancedWidth / width,
    scaleY: balancedHeight / height
  };
}

function getCellDisplayFrame(projection) {
  const geometry = getCellDisplayGeometry(projection);
  return { bounds: geometry.bounds, isCenterCell: geometry.isCenterCell };
}

function getWorldCoordinateFromStore(value) {
  const location = value?.location || value || {};
  const latitude = Number(location.latitude ?? location.lat);
  const longitude = Number(location.longitude ?? location.lng ?? location.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { longitude, latitude };
}

function getWorldPointForPrefectureCode(code) {
  const coordinates = PREFECTURE_WORLD_COORDINATES[String(code || '').padStart(2, '0')];
  if (!coordinates) return null;
  return projectWorldCoordinate(coordinates[0], coordinates[1]);
}

function getMapRegionCode(prefecture) {
  return getPrefectureCode(prefecture) ? 'JPN' : String(prefecture || '').trim().toUpperCase();
}

function getMapRegionName(code, fallback = 'この地域') {
  const normalized = String(code || '').trim().toUpperCase();
  return PREFECTURE_NAME_BY_CODE[normalized] || WORLD_REGION_NAME_BY_CODE.get(normalized) || fallback;
}

function getNearestJapanesePrefectureCode(point) {
  let nearest = '';
  let nearestDistance = Infinity;
  Object.entries(PREFECTURE_WORLD_COORDINATES).forEach(([code, coordinates]) => {
    const projected = projectWorldCoordinate(coordinates[0], coordinates[1]);
    const distance = Math.hypot(projected.x - Number(point?.x || 0), projected.y - Number(point?.y || 0));
    if (distance < nearestDistance) {
      nearest = code;
      nearestDistance = distance;
    }
  });
  return nearest;
}

function formatWorldCoordinate(value) {
  return Number(value).toFixed(3);
}

function projectWorldPoint([longitude, latitude]) {
  const point = projectWorldCoordinate(longitude, latitude);
  return [point.x * 10, point.y * 10];
}

function worldRingToPath(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return '';
  const parts = [[]];
  let previous = ring[0];
  parts[0].push(projectWorldPoint(previous));
  for (let index = 1; index <= ring.length; index += 1) {
    const current = ring[index % ring.length];
    if (!Array.isArray(current) || current.length < 2) continue;
    let adjustedLongitude = Number(current[0]);
    const previousLongitude = Number(previous[0]);
    while (adjustedLongitude - previousLongitude > 180) adjustedLongitude -= 360;
    while (adjustedLongitude - previousLongitude < -180) adjustedLongitude += 360;
    if (adjustedLongitude !== Number(current[0])) {
      const boundary = adjustedLongitude > 180 ? 180 : -180;
      const delta = adjustedLongitude - previousLongitude;
      const ratio = delta ? (boundary - previousLongitude) / delta : 0;
      const crossingLatitude = Number(previous[1]) + (Number(current[1]) - Number(previous[1])) * ratio;
      parts.at(-1).push(projectWorldPoint([boundary, crossingLatitude]));
      parts.push([
        projectWorldPoint([boundary === 180 ? -180 : 180, crossingLatitude]),
        projectWorldPoint([Number(current[0]), Number(current[1])])
      ]);
    } else {
      parts.at(-1).push(projectWorldPoint([Number(current[0]), Number(current[1])]));
    }
    previous = current;
  }
  return parts
    .filter((part) => part.length >= 3)
    .map((part) => `M${part.map(([x, y]) => `${formatWorldCoordinate(x)},${formatWorldCoordinate(y)}`).join('L')}Z`)
    .join(' ');
}

function worldGeometryToPath(geometry) {
  if (!geometry || !geometry.coordinates) return '';
  if (geometry.type === 'Polygon') return geometry.coordinates.map(worldRingToPath).filter(Boolean).join(' ');
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.flatMap((polygon) => polygon.map(worldRingToPath)).filter(Boolean).join(' ');
  }
  return '';
}

function getGeometryRepresentativeCoordinate(geometry) {
  const points = [];
  const collect = (value) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
      points.push([Number(value[0]), Number(value[1])]);
      return;
    }
    value.forEach(collect);
  };
  collect(geometry?.coordinates);
  if (!points.length) return null;
  const referenceLongitude = points[0][0];
  const longitudes = points.map(([longitude]) => {
    let adjusted = longitude;
    while (adjusted - referenceLongitude > 180) adjusted -= 360;
    while (adjusted - referenceLongitude < -180) adjusted += 360;
    return adjusted;
  });
  return {
    longitude: normalizeLongitude(longitudes.reduce((sum, value) => sum + value, 0) / longitudes.length),
    latitude: points.reduce((sum, [, latitude]) => sum + latitude, 0) / points.length
  };
}

function getWorldFeatureCode(properties, fallback) {
  const candidates = [properties?.ISO_A3, properties?.ADM0_A3, properties?.SOV_A3, fallback];
  const code = candidates.find((value) => {
    const normalized = String(value ?? '').trim().toUpperCase();
    return normalized && normalized !== '-99' && normalized !== '-1';
  });
  return String(code || fallback).trim().toUpperCase();
}

function createWorldMapSvg(data) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'geolonia-svg-map japan-map__asset japan-map__asset--world');
  svg.setAttribute('viewBox', WORLD_MAP_VIEW_BOX);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('aria-label', '世界地図');
  svg.dataset.mapProjection = 'orthographic-globe';
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
  clipPath.id = `pixieed-globe-clip-${Math.random().toString(36).slice(2)}`;
  const clipCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  clipCircle.setAttribute('cx', '500');
  clipCircle.setAttribute('cy', '500');
  clipCircle.setAttribute('r', String(GLOBE_RADIUS_PERCENT * 10));
  clipPath.appendChild(clipCircle);
  defs.appendChild(clipPath);
  svg.appendChild(defs);
  const ocean = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  ocean.setAttribute('class', 'japan-map__globe-ocean');
  ocean.setAttribute('cx', '500');
  ocean.setAttribute('cy', '500');
  ocean.setAttribute('r', String(GLOBE_RADIUS_PERCENT * 10));
  svg.appendChild(ocean);
  const atmosphere = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  atmosphere.setAttribute('class', 'japan-map__globe-atmosphere');
  atmosphere.setAttribute('cx', '500');
  atmosphere.setAttribute('cy', '500');
  atmosphere.setAttribute('r', String(GLOBE_RADIUS_PERCENT * 10));
  svg.appendChild(atmosphere);
  const countryLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  countryLayer.setAttribute('class', 'japan-map__globe-countries');
  countryLayer.setAttribute('clip-path', `url(#${clipPath.id})`);
  svg.appendChild(countryLayer);
  const features = Array.isArray(data?.features) ? data.features : [];
  features.forEach((feature, index) => {
    const properties = feature?.properties || {};
    const code = getWorldFeatureCode(properties, `WORLD-${index}`);
    const name = String(properties.NAME || properties.ADMIN || properties.SOVEREIGNT || code).trim();
    WORLD_REGION_NAME_BY_CODE.set(code, name);
    const region = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    region.setAttribute('class', 'prefecture world-region');
    region.dataset.code = code;
    region.dataset.prefecture = name;
    region.dataset.isoA2 = String(properties.ISO_A2 || '').trim().toUpperCase();
    region.dataset.mapLongitude = String(properties.LABEL_X || '');
    region.dataset.mapLatitude = String(properties.LABEL_Y || '');
    region.__pixieedGeometry = feature.geometry;
    const propertyLongitude = Number(properties.LABEL_X);
    const propertyLatitude = Number(properties.LABEL_Y);
    region.__pixieedCenter = Number.isFinite(propertyLongitude) && Number.isFinite(propertyLatitude)
      ? { longitude: propertyLongitude, latitude: propertyLatitude }
      : getGeometryRepresentativeCoordinate(feature.geometry);
    const pathData = worldGeometryToPath(feature.geometry);
    if (!pathData) return;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    path.setAttribute('fill-rule', 'evenodd');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    region.appendChild(path);
    countryLayer.appendChild(region);
  });
  return svg;
}

function updateGlobeMapProjection(svg, view = {}) {
  if (!svg) return;
  svg.dataset.mapCenterLongitude = String(view.centerLongitude ?? WORLD_GLOBE_OVERVIEW_CENTER.longitude);
  svg.dataset.mapCenterLatitude = String(view.centerLatitude ?? WORLD_GLOBE_OVERVIEW_CENTER.latitude);
  svg.querySelectorAll('g.world-region').forEach((region) => {
    const path = region.querySelector('path');
    const pathData = orthographicGeometryToPath(region.__pixieedGeometry, view);
    if (path) path.setAttribute('d', pathData);
    region.style.visibility = pathData ? 'visible' : 'hidden';
  });
}

function createJapanPrefectureSvg(data) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'geolonia-svg-map japan-map__asset japan-map__asset--japan-detail');
  svg.setAttribute('viewBox', WORLD_MAP_VIEW_BOX);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('aria-label', '経緯度に合わせた日本の都道府県地図');
  svg.dataset.mapProjection = 'equirectangular';
  svg.dataset.mapGeometry = 'japan-prefectures';
  const features = Array.isArray(data?.features) ? data.features : [];
  features.forEach((feature) => {
    const properties = feature?.properties || {};
    const code = String(properties.code || '').trim().padStart(2, '0');
    if (!JAPAN_PREFECTURE_CODE_SET.has(code)) return;
    const name = String(properties.name || properties['name:ja'] || PREFECTURE_NAME_BY_CODE[code] || code).trim();
    const pathData = worldGeometryToPath(feature.geometry);
    if (!pathData) return;
    const region = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    region.setAttribute('class', 'prefecture japan-prefecture');
    region.dataset.code = code;
    region.dataset.prefecture = name;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    path.setAttribute('fill-rule', 'evenodd');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    region.appendChild(path);
    svg.appendChild(region);
  });
  return svg;
}

// セル表示では元のGeoJSONレイヤーを非表示にする。
// 日本のセル判定だけは、別に読み込んだ都道府県GeoJSONを同じ投影へ変換して使う。
// 表示・判定の両方を同じviewBoxに揃えるため、ズームやパンでずれない。
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
  // 投稿はセルそのものを掲載場所にする。セル番号から中心を求めるため、
  // ランダムな見た目用ピンや投稿者の正確な位置情報を保存しない。
  const cellCenter = {
    x: ((cellX + .5) / grid) * 100,
    y: ((cellY + .5) / grid) * 100
  };
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
    mapPosition: cellCenter,
    mapPositionSpace: 'world',
    mapCell: { grid, x: cellX, y: cellY, prefectureCode }
  };
}

function readStorageRecord(storage, key, maxAge = Infinity) {
  try {
    const record = JSON.parse(storage.getItem(key) || 'null');
    const savedAt = Number(record?.savedAt || 0);
    if (!record || !savedAt || Date.now() - savedAt > maxAge) return null;
    return record;
  } catch {
    return null;
  }
}

function hasRecentPublicDataRefresh() {
  try {
    const refreshedAt = Number(sessionStorage.getItem(PUBLIC_DATA_REFRESH_KEY) || 0);
    return refreshedAt > 0 && Date.now() - refreshedAt < PUBLIC_DATA_REFRESH_WINDOW;
  } catch {
    return false;
  }
}

function markPublicDataRefreshed() {
  try { sessionStorage.setItem(PUBLIC_DATA_REFRESH_KEY, String(Date.now())); } catch { /* storage may be blocked */ }
}

function persistUserMapPostCache() {
  try {
    sessionStorage.setItem(USER_MAP_POST_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data: userMapPosts }));
  } catch { /* storage may be blocked */ }
}

function loadCachedUserMapPosts() {
  const record = readStorageRecord(sessionStorage, USER_MAP_POST_CACHE_KEY, USER_MAP_POST_CACHE_MAX_AGE);
  if (!record || !Array.isArray(record.data)) return false;
  const nextPosts = record.data.filter((post) => post?.id && post?.mapCell && post?.image);
  const changed = JSON.stringify(nextPosts) !== JSON.stringify(userMapPosts);
  userMapPosts = nextPosts;
  if (changed) publicDataSignature = getPublicDataSignature({ works, stores, events });
  return true;
}

async function hydrateUserMapPosts({ force = false } = {}) {
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
    persistUserMapPostCache();
    publicDataSignature = getPublicDataSignature({ works, stores, events });
    return { loaded: true, changed, force };
  } catch {
    return { loaded: false, changed: false };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function hydrateSiteData({ force = false } = {}) {
  if (publicDataHydrationPromise) return publicDataHydrationPromise;
  if (!force && hasRecentPublicDataRefresh()) return { loaded: false, changed: false, cached: true };
  const endpoint = String(mapConfig.publicDataEndpoint || '').trim();
  const refresh = (async () => {
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
    const [official, userPosts] = await Promise.all([officialPromise, hydrateUserMapPosts({ force })]);
    const result = {
      loaded: official.loaded || userPosts.loaded,
      changed: official.changed || userPosts.changed
    };
    if (result.loaded) markPublicDataRefreshed();
    return result;
  })();
  publicDataHydrationPromise = refresh;
  try {
    return await refresh;
  } finally {
    publicDataHydrationPromise = null;
  }
}

function applyPublicData(data, persist = false) {
  if (!data || !Array.isArray(data.works) || !Array.isArray(data.stores)) return { loaded: false, changed: false };
  const publicWorks = publicWorksOnly(data.works);
  const normalizedData = { ...data, works: publicWorks };
  const nextSignature = getPublicDataSignature(normalizedData);
  const changed = nextSignature !== publicDataSignature;
  publicDataSignature = nextSignature;
  works = publicWorks;
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
    const record = JSON.stringify({ savedAt: Date.now(), data: normalizedData });
    try { localStorage.setItem(PUBLIC_DATA_CACHE_KEY, record); } catch { /* storage may be blocked */ }
    try { sessionStorage.setItem(PUBLIC_DATA_SESSION_CACHE_KEY, record); } catch { /* storage may be blocked */ }
  }
  return { loaded: true, changed };
}

function loadCachedPublicData() {
  const sessionRecord = readStorageRecord(sessionStorage, PUBLIC_DATA_SESSION_CACHE_KEY, PUBLIC_DATA_CACHE_MAX_AGE);
  const localRecord = readStorageRecord(localStorage, PUBLIC_DATA_CACHE_KEY, PUBLIC_DATA_CACHE_MAX_AGE);
  const record = sessionRecord || localRecord;
  if (!record?.data) return false;
  return applyPublicData(record.data).loaded;
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
  const mapX = Number(store?.mapPosition?.x);
  const mapY = Number(store?.mapPosition?.y);
  if (store?.mapPositionSpace === 'world' && Number.isFinite(mapX) && Number.isFinite(mapY)) {
    return { x: mapX, y: mapY };
  }
  const coordinates = getWorldCoordinateFromStore(store);
  if (coordinates) return projectWorldCoordinate(coordinates.longitude, coordinates.latitude);
  const prefectureCode = getPrefectureCode(store?.prefecture);
  return getWorldPointForPrefectureCode(prefectureCode) || { x: 50, y: 50 };
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
  const worldMapMode = MAP_ASSET_KIND === 'world-geojson';
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
      <div class="map-surface map-surface--japan map-surface--world${fieldMode ? ' map-surface--field' : ''}" data-map-surface data-map-scope="world">
        <div class="japan-map__layers" data-map-layers role="group" aria-label="地図レイヤー">
          <button class="japan-map__layer is-active" type="button" data-map-layer="all" aria-pressed="true">全て表示</button>
          <button class="japan-map__layer" type="button" data-map-layer="works" aria-pressed="false">投稿マップ</button>
          <button class="japan-map__layer" type="button" data-map-layer="events" aria-pressed="false">イベントマップ</button>
          <button class="japan-map__layer" type="button" data-map-layer="stores" aria-pressed="false">店舗マップ</button>
          <button class="japan-map__layer japan-map__layer--post" type="button" data-map-post><span aria-hidden="true">＋</span>絵を置く</button>
        </div>
        <div class="map-illustration map-illustration--japan map-illustration--world" data-map-illustration>
          <div class="japan-map__viewport" data-japan-map-viewport tabindex="0" aria-label="球体の地球。ドラッグで回転し、拡大縮小は画面中央を基準に操作できます。">
            <div class="japan-map__space" data-japan-map-space aria-hidden="true">
              <span class="japan-map__space-starfield"></span>
              <i class="japan-map__space-object japan-map__space-object--sun"></i>
              <i class="japan-map__space-object japan-map__space-object--mars"></i>
              <i class="japan-map__space-galaxy japan-map__space-galaxy--one"></i>
              <i class="japan-map__space-galaxy japan-map__space-galaxy--two"></i>
            </div>
            <canvas class="japan-map__cell-canvas" data-japan-map-cell-canvas role="grid" aria-label="セルでできた地図。セルを選択できます。" tabindex="-1"></canvas>
            <div class="japan-map__canvas" data-japan-map-canvas>
              <div class="japan-map__globe-surface" data-japan-map-globe aria-hidden="true"></div>
              <div class="japan-map__cells" data-japan-map-cells aria-label="セルでできた地図"></div>
              <div class="japan-map__content-cells" data-japan-map-content-cells aria-label="掲載情報のセル"></div>
              <div class="japan-map__asset-wrap" data-japan-map-asset aria-busy="true"></div>
            </div>
            <button class="japan-map__cell-action" data-map-cell-action type="button" hidden tabindex="0" aria-label="セルを選択"></button>
            <div class="japan-map__geometry-probe" data-japan-map-geometry-probe aria-hidden="true"></div>
          </div>
          <div class="japan-map__controls" aria-label="地図の拡大縮小">
            <button class="japan-map__control" type="button" data-map-zoom="in" aria-label="地図を拡大">＋</button>
            <button class="japan-map__control" type="button" data-map-zoom="out" aria-label="地図を縮小">−</button>
            <button class="japan-map__control japan-map__control--reset" type="button" data-map-zoom="reset" aria-label="日本の初期表示へ戻す">日本へ</button>
          </div>
          <div class="japan-map__zoom-status" data-map-zoom-status aria-live="polite">日本 100%</div>
          <p class="japan-map__credit">${WORLD_MAP_CREDIT}</p>
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
  const cellCanvas = root.querySelector('[data-japan-map-cell-canvas]');
  const cellAction = root.querySelector('[data-map-cell-action]');
  const assetHost = root.querySelector('[data-japan-map-asset]');
  const geometryProbeHost = root.querySelector('[data-japan-map-geometry-probe]');
  const popover = root.querySelector('[data-map-popover]');
  let virtualCell = null;
  let virtualCellFrame = 0;
  let pendingVirtualCellEvent = null;
  let postComposer = null;
  let postComposerPromise = null;
  let isSelectingPostCell = false;
  const openPostComposer = (context = {}) => {
    if (!postComposerPromise) {
      postComposerPromise = import('./post-composer.js?rev=20260920-cell-pin-v3').then(({ bindUserPostComposer }) => {
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
  let currentGlobeView = {
    scale: 1,
    centerLongitude: WORLD_MAP_FOCUS_CENTER.longitude,
    centerLatitude: WORLD_MAP_FOCUS_CENTER.latitude
  };
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
      regionCode: getMapRegionCode(store.prefecture),
      point: getMapPoint(store),
      precise: Boolean(getWorldCoordinateFromStore(store))
    })),
    ...events.map((event) => ({
      id: event.id,
      key: `event:${event.id}`,
      kind: 'event',
      source: event,
      prefecture: String(event.prefecture || event.area || 'その他'),
      prefectureCode: getPrefectureCode(event.prefecture),
      regionCode: getMapRegionCode(event.prefecture),
      point: getMapPoint(event),
      precise: Boolean(getWorldCoordinateFromStore(event))
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
      regionCode: getMapRegionCode(getMapWorkPrefecture(work)),
      point: getMapWorkPoint(work),
      precise: Boolean(getWorldCoordinateFromStore(work) || getWorldCoordinateFromStore(getMapWorkStore(work)))
    }))
  ];
  const clusterRegistry = new Map();
  let prefectureGeometry = new Map();
  const prefectureBoundaryCache = new Map();
  const cellGeometryCache = new Map();
  const cellAddressCache = new Map();
  const cellContentRegistry = new Map();
  const renderedCellRanges = new Map();
  let cellGeometrySnapshotCache = null;
  let lastCellRenderSignature = '';
  // 世界セルは一度だけ国土マスクを作り、回転・ズーム中は同じDOMを再利用する。
  // 画面のたびにGeoJSONを走査しないことで、22%表示でも操作を止めない。
  let worldLandCellState = { svg: null, grid: 0, cells: [], regions: [] };
  let worldBackgroundCellState = { svg: null, grid: 0, cells: [] };
  let worldCellHydrationState = null;
  let worldCellHydrationTimer = 0;
  let worldCellHydrationTimerKind = '';
  let worldCellHydrationSerial = 0;

  const getGlobeViewSignature = (view = currentGlobeView) => [
    Number(view?.scale || 1),
    Number(view?.centerLongitude || 0),
    Number(view?.centerLatitude || 0)
  ].map((value) => Math.round(value * 1000) / 1000).join(':');

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
    // 世界GeoJSONでは、表示上の国境コード（JPNなど）と、既存の
    // 日本向け投稿が持つ県コード（13、14など）を分けて扱う。
    // これにより世界地図へ移行しても、既存投稿のセル番号を壊さない。
    if (MAP_ASSET_KIND === 'world-geojson') {
      cellAddressCache.set(cacheKey, address);
      return address;
    }
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
  // 固定セルの基準で最大件数を一度決め、ズーム後もその値を使い続ける。
  const getDensityReferenceMaximum = (items) => {
    const referenceCounts = new Map();
    items.forEach((item) => {
      const address = getCellCoordinate(MAP_CELL_GRID, item.point, item.prefectureCode);
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
  // セルは全国表示の128×128を地図全体で固定する。
  // ズームはセルを細分化せず、同じセルボタンをベクターのまま拡大する。
  const getCellGridSize = () => MAP_CELL_GRID;

  const getGeoJsonBounds = (geometry) => {
    const bounds = { west: Infinity, east: -Infinity, south: Infinity, north: -Infinity };
    const visit = (value) => {
      if (!Array.isArray(value)) return;
      if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
        bounds.west = Math.min(bounds.west, Number(value[0]));
        bounds.east = Math.max(bounds.east, Number(value[0]));
        bounds.south = Math.min(bounds.south, Number(value[1]));
        bounds.north = Math.max(bounds.north, Number(value[1]));
        return;
      }
      value.forEach(visit);
    };
    visit(geometry?.coordinates);
    return Number.isFinite(bounds.west) ? bounds : null;
  };

  const getWorldLandCellState = (grid = WORLD_CELL_GRID) => {
    const svg = assetHost?.querySelector('svg.japan-map__asset--world');
    if (!svg) return worldLandCellState;
    if (worldLandCellState.svg === svg && worldLandCellState.grid === grid) {
      return worldLandCellState;
    }
    const cellCacheKey = `${MAP_ASSET_URL}:${grid}`;
    const cachedState = WORLD_LAND_CELL_STATE_CACHE.get(cellCacheKey);
    if (cachedState?.svg === svg) {
      worldLandCellState = cachedState;
      return cachedState;
    }
    const regions = [...svg.querySelectorAll('g.world-region')]
      .map((region) => ({
        region,
        geometry: region.__pixieedGeometry,
        bounds: getGeoJsonBounds(region.__pixieedGeometry)
      }))
      .filter((entry) => entry.geometry && entry.bounds);
    const cellIsLand = (cellX, cellY) => {
      const bounds = getWorldGridCellBounds(cellX, cellY, grid);
      const longitudeStep = bounds.east - bounds.west;
      const latitudeStep = bounds.north - bounds.south;
      // 中心と4隅の内側を調べる。海岸線のセルを落としすぎず、
      // 128×128でも国土の輪郭が読み取れる密度を保つ。
      const samples = [
        [(bounds.west + bounds.east) / 2, (bounds.north + bounds.south) / 2],
        [bounds.west + longitudeStep * .18, bounds.north - latitudeStep * .18],
        [bounds.east - longitudeStep * .18, bounds.north - latitudeStep * .18],
        [bounds.west + longitudeStep * .18, bounds.south + latitudeStep * .18],
        [bounds.east - longitudeStep * .18, bounds.south + latitudeStep * .18]
      ];
      return samples.some(([longitude, latitude]) => regions.some((entry) => {
        const { west, east, south, north } = entry.bounds;
        if (longitude < west || longitude > east || latitude < south || latitude > north) return false;
        return isPointInGeoJsonGeometry(longitude, latitude, entry.geometry);
      }));
    };
    let cells = WORLD_LAND_CELL_COORDINATE_CACHE.get(cellCacheKey);
    if (!cells) {
      cells = readStoredWorldCellCoordinates(cellCacheKey);
      if (!cells) {
        cells = [];
        for (let cellY = 0; cellY < grid; cellY += 1) {
          for (let cellX = 0; cellX < grid; cellX += 1) {
            if (cellIsLand(cellX, cellY)) cells.push({ cellX, cellY });
          }
        }
        writeStoredWorldCellCoordinates(cellCacheKey, cells);
      }
      WORLD_LAND_CELL_COORDINATE_CACHE.set(cellCacheKey, cells);
    }
    worldLandCellState = { svg, grid, cells, regions };
    WORLD_LAND_CELL_STATE_CACHE.set(cellCacheKey, worldLandCellState);
    return worldLandCellState;
  };

  const getWorldFocusLandCells = () => {
    const { regions } = getWorldLandCellState();
    const cellCacheKey = `${MAP_ASSET_URL}:focus:${MAP_CELL_GRID}:${WORLD_MAP_FOCUS_CENTER.longitude}:${WORLD_MAP_FOCUS_CENTER.latitude}:${WORLD_MAP_FOCUS_SPAN}`;
    const cached = WORLD_FOCUS_LAND_CELL_COORDINATE_CACHE.get(cellCacheKey);
    if (cached) return cached;
    const cellSize = 100 / MAP_CELL_GRID;
    const coordinateAt = (x, y) => getWorldCoordinateFromMapPoint({ x, y });
    const cellIsLand = (cellX, cellY) => {
      const northWest = coordinateAt(cellX * cellSize, cellY * cellSize);
      const southEast = coordinateAt((cellX + 1) * cellSize, (cellY + 1) * cellSize);
      const west = Math.min(northWest.longitude, southEast.longitude);
      const east = Math.max(northWest.longitude, southEast.longitude);
      const south = Math.min(northWest.latitude, southEast.latitude);
      const north = Math.max(northWest.latitude, southEast.latitude);
      const longitudeStep = east - west;
      const latitudeStep = north - south;
      const samples = [
        [(west + east) / 2, (north + south) / 2],
        [west + longitudeStep * .18, north - latitudeStep * .18],
        [east - longitudeStep * .18, north - latitudeStep * .18],
        [west + longitudeStep * .18, south + latitudeStep * .18],
        [east - longitudeStep * .18, south + latitudeStep * .18]
      ];
      return samples.some(([longitude, latitude]) => regions.some((entry) => {
        const entryBounds = entry.bounds;
        if (longitude < entryBounds.west || longitude > entryBounds.east
          || latitude < entryBounds.south || latitude > entryBounds.north) return false;
        return isPointInGeoJsonGeometry(longitude, latitude, entry.geometry);
      }));
    };
    let cells = readStoredWorldCellCoordinates(cellCacheKey);
    if (!cells) {
      cells = [];
      for (let cellY = 0; cellY < MAP_CELL_GRID; cellY += 1) {
        for (let cellX = 0; cellX < MAP_CELL_GRID; cellX += 1) {
          if (cellIsLand(cellX, cellY)) cells.push({ cellX, cellY });
        }
      }
      writeStoredWorldCellCoordinates(cellCacheKey, cells);
    }
    WORLD_FOCUS_LAND_CELL_COORDINATE_CACHE.set(cellCacheKey, cells);
    return cells;
  };

  const getWorldBackgroundLandCells = (grid = WORLD_CELL_GRID) => {
    const state = getWorldLandCellState(grid);
    if (worldBackgroundCellState.svg === state.svg && worldBackgroundCellState.grid === grid) return worldBackgroundCellState.cells;
    const west = WORLD_MAP_FOCUS_CENTER.longitude - WORLD_MAP_FOCUS_SPAN / 2;
    const east = WORLD_MAP_FOCUS_CENTER.longitude + WORLD_MAP_FOCUS_SPAN / 2;
    const south = WORLD_MAP_FOCUS_CENTER.latitude - WORLD_MAP_FOCUS_SPAN / 2;
    const north = WORLD_MAP_FOCUS_CENTER.latitude + WORLD_MAP_FOCUS_SPAN / 2;
    const cells = state.cells.filter(({ cellX, cellY }) => {
      const bounds = getWorldGridCellBounds(cellX, cellY, grid);
      // 日本周辺の詳細セルと少しでも重なる粗い世界セルを残すと、
      // 同じ場所に大きな四角形が被さり、海外セルだけサイズが違って見える。
      // 中心点ではなく矩形の非交差で判定し、詳細セルの領域を完全に空ける。
      return bounds.east <= west || bounds.west >= east
        || bounds.north <= south || bounds.south >= north;
    });
    worldBackgroundCellState = { svg: state.svg, grid, cells };
    return cells;
  };

  const isWorldFineCellLand = (cellX, cellY, regions) => {
    const normalizedX = ((Number(cellX) % WORLD_FINE_CELL_GRID_X) + WORLD_FINE_CELL_GRID_X) % WORLD_FINE_CELL_GRID_X;
    const safeY = Math.min(WORLD_FINE_CELL_GRID_Y - 1, Math.max(0, Number(cellY) || 0));
    const cacheKey = `${MAP_ASSET_URL}:fine:${normalizedX}:${safeY}`;
    if (WORLD_FINE_LAND_CELL_CACHE.has(cacheKey)) return WORLD_FINE_LAND_CELL_CACHE.get(cacheKey);
    const bounds = getWorldFineCellBounds(normalizedX, safeY);
    const longitudeStep = bounds.east - bounds.west;
    const latitudeStep = bounds.north - bounds.south;
    const samples = [
      [(bounds.west + bounds.east) / 2, (bounds.north + bounds.south) / 2],
      [bounds.west + longitudeStep * .18, bounds.north - latitudeStep * .18],
      [bounds.east - longitudeStep * .18, bounds.north - latitudeStep * .18],
      [bounds.west + longitudeStep * .18, bounds.south + latitudeStep * .18],
      [bounds.east - longitudeStep * .18, bounds.south + latitudeStep * .18]
    ].map(([longitude, latitude]) => [normalizeLongitude(longitude), latitude]);
    const land = samples.some(([longitude, latitude]) => regions.some((entry) => {
      const { west, east, south, north } = entry.bounds;
      if (longitude < west || longitude > east || latitude < south || latitude > north) return false;
      return isPointInGeoJsonGeometry(longitude, latitude, entry.geometry);
    }));
    WORLD_FINE_LAND_CELL_CACHE.set(cacheKey, land);
    return land;
  };

  const getWorldFineVisibleLandCells = (view, mapRect, viewportRect) => {
    const state = getWorldLandCellState(WORLD_CELL_GRID);
    if (!state.regions.length || !mapRect?.width || !viewportRect?.width) return [];
    // まず128分割の陸地セルで候補を絞り、その中だけを日本と同じ
    // 0.1875度セルへ展開する。全世界の約185万セルを作らないため、
    // パン・ズーム中の負荷とメモリ使用量を表示範囲に限定できる。
    const visibleCoarseCells = state.cells.filter(({ cellX, cellY }) => {
      const projection = getGlobeWorldCellProjection(cellX, cellY, WORLD_CELL_GRID, view);
      return isProjectionInViewport(projection);
    });
    const cells = [];
    const seen = new Set();
    visibleCoarseCells.forEach(({ cellX, cellY }) => {
      const coarseBounds = getWorldGridCellBounds(cellX, cellY, WORLD_CELL_GRID);
      const startX = Math.floor((coarseBounds.west - WORLD_FINE_GRID_ORIGIN_LONGITUDE) / WORLD_FINE_CELL_DEGREES) - 1;
      const endX = Math.ceil((coarseBounds.east - WORLD_FINE_GRID_ORIGIN_LONGITUDE) / WORLD_FINE_CELL_DEGREES) + 1;
      const startY = Math.floor((WORLD_FINE_GRID_NORTH_LATITUDE - coarseBounds.north) / WORLD_FINE_CELL_DEGREES) - 1;
      const endY = Math.ceil((WORLD_FINE_GRID_NORTH_LATITUDE - coarseBounds.south) / WORLD_FINE_CELL_DEGREES) + 1;
      for (let cellYIndex = Math.max(0, startY); cellYIndex <= Math.min(WORLD_FINE_CELL_GRID_Y - 1, endY); cellYIndex += 1) {
        for (let rawCellX = startX; rawCellX <= endX; rawCellX += 1) {
          const fineCellX = ((rawCellX % WORLD_FINE_CELL_GRID_X) + WORLD_FINE_CELL_GRID_X) % WORLD_FINE_CELL_GRID_X;
          const key = `${fineCellX}:${cellYIndex}`;
          if (seen.has(key) || !isWorldFineCellLand(fineCellX, cellYIndex, state.regions)) continue;
          seen.add(key);
          cells.push({ cellX: fineCellX, cellY: cellYIndex });
        }
      }
    });
    return cells;
  };

  const getWorldRegionAtCoordinate = (longitude, latitude) => {
    const { regions } = getWorldLandCellState();
    return regions.find((entry) => {
      const { west, east, south, north } = entry.bounds;
      if (longitude < west || longitude > east || latitude < south || latitude > north) return false;
      return isPointInGeoJsonGeometry(longitude, latitude, entry.geometry);
    })?.region || null;
  };

  const getCellGeometrySvg = () => geometryProbeHost?.querySelector('svg[data-map-geometry="japan-prefectures"]')
    || geometryProbeHost?.querySelector('svg')
    || assetHost?.querySelector('svg.japan-map__asset');

  const getCellGeometrySnapshot = () => {
    const svg = getCellGeometrySvg();
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
    // 世界GeoJSONの日本表示ではJPN以外の国セルを描画しない。
    // 128×128へ増やしても、毎セル177か国を総当たりしないよう候補を絞る。
    const candidateRegions = worldMapMode
      ? snapshot.svg.dataset.mapGeometry === 'japan-prefectures'
        ? snapshot.regions.filter((entry) => JAPAN_PREFECTURE_CODE_SET.has(entry.code))
        : snapshot.regions.filter((entry) => entry.code === 'JPN')
      : snapshot.regions;
    const findShapeHit = (x, y) => {
      if (!snapshot.viewBox || !snapshot.screenMatrix || typeof DOMPoint !== 'function') return '';
      const screenPoint = new DOMPoint(
        snapshot.viewBox.x + (x / 100) * snapshot.viewBox.width,
        snapshot.viewBox.y + (y / 100) * snapshot.viewBox.height
      ).matrixTransform(snapshot.screenMatrix);
      const epsilon = Math.max(.25, cellSize * 1.25);
      const region = candidateRegions.find((entry) => {
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
      // 球体表示では平面のタイル矩形を可視判定に使わない。
      // 回転すると同じセルが画面の別位置へ移るため、固定セルは一度だけ
      // 全範囲を構築し、以後は投影座標だけを更新する。
      if (worldMapMode && grid === MAP_CELL_GRID) {
        const fullRange = { startX: 0, endX: grid - 1, startY: 0, endY: grid - 1 };
        renderedCellRanges.set(tile, fullRange);
        tile.dataset.renderedCellGrid = String(grid);
        return fullRange;
      }
      const visibleRange = getVisibleCellRange(tile);
      if (!visibleRange) {
        renderedCellRanges.delete(tile);
        return null;
      }
      const previousRange = renderedCellRanges.get(tile);
      const previousGrid = Number(tile.dataset.renderedCellGrid || 0);
      const isCovered = previousRange && previousGrid === grid
        && previousRange.startX <= visibleRange.startX
        && previousRange.endX >= visibleRange.endX
        && previousRange.startY <= visibleRange.startY
        && previousRange.endY >= visibleRange.endY;
      if (isCovered) return previousRange;
      const overscan = 8;
      const nextRange = {
        startX: Math.max(0, visibleRange.startX - overscan),
        endX: Math.min(grid - 1, visibleRange.endX + overscan),
        startY: Math.max(0, visibleRange.startY - overscan),
        endY: Math.min(grid - 1, visibleRange.endY + overscan)
      };
      renderedCellRanges.set(tile, nextRange);
      tile.dataset.renderedCellGrid = String(grid);
      return nextRange;
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

  const getProjectedCellStyle = (cellX, cellY, grid, view = currentGlobeView) => {
    const projection = getGlobeCellProjection(cellX, cellY, grid, view);
    if (!projection.visible || !projection.bounds) return null;
    const points = projection.corners.filter((point) => point.visible);
    if (points.length < 3 && projection.center) points.push(projection.center);
    if (points.length < 3) return null;
    const displayGeometry = getCellDisplayGeometry(projection);
    const displayFrame = { bounds: displayGeometry.bounds, isCenterCell: displayGeometry.isCenterCell };
    const { left, top, right, bottom } = displayFrame.bounds;
    const width = Math.max(.01, right - left);
    const height = Math.max(.01, bottom - top);
    const displayPoints = points.map((point) => ({
      x: projection.center.x + ((point.x - projection.center.x) * displayGeometry.scaleX),
      y: projection.center.y + ((point.y - projection.center.y) * displayGeometry.scaleY)
    }));
    const polygon = displayPoints.map((point) => `${(((point.x - left) / width) * 100).toFixed(2)}% ${(((point.y - top) / height) * 100).toFixed(2)}%`).join(',');
    return {
      projection,
      left,
      top,
      width,
      height,
      isCenterCell: displayFrame.isCenterCell,
      clipPath: `polygon(${polygon})`,
      style: `left:${left.toFixed(4)}%;top:${top.toFixed(4)}%;width:${width.toFixed(4)}%;height:${height.toFixed(4)}%;clip-path:polygon(${polygon});`
    };
  };

  // 空セルの背景はDOM/SVGの1ノードずつではなく、表示領域サイズのCanvasへまとめて描く。
  // Canvas自体は画面サイズで固定し、ズーム後に巨大なビットマップを作らない。
  let worldCanvasDescriptorCache = { key: '', descriptors: [] };
  let lastWorldCanvasRenderSignature = '';
  let lastWorldCanvasPaint = null;
  const getWorldCanvasTransientState = (view = currentGlobeView) => {
    if (!mapViewport?.classList.contains('is-dragging') && !mapViewport?.classList.contains('is-rotating')) return null;
    if (!lastWorldCanvasPaint || !cellCanvas || !mapCanvas) return null;
    const scale = Number(view.scale ?? currentMapScale) || 1;
    if (worldCanvasDescriptorCache.key !== lastWorldCanvasPaint.descriptorKey) return null;
    const canvasRect = cellCanvas.getBoundingClientRect();
    if (Math.abs(canvasRect.width - lastWorldCanvasPaint.canvasWidth) >= .5
      || Math.abs(canvasRect.height - lastWorldCanvasPaint.canvasHeight) >= .5) return null;
    const mapRect = mapCanvas.getBoundingClientRect();
    if (!mapRect.width) return null;
    const sphereRadius = Math.max(40, mapRect.width * GLOBE_RADIUS_PERCENT / 100);
    const longitudeDelta = getShortestLongitudeDelta(
      lastWorldCanvasPaint.centerLongitude,
      Number(view.centerLongitude || 0)
    );
    const latitudeDelta = Number(view.centerLatitude || 0) - lastWorldCanvasPaint.centerLatitude;
    // 正距方位図では、同じ緯度の横移動量が緯度の余弦に比例する。
    // ここを省くと、日本付近ではパン量の約2割が過大になり、
    // ズーム後に掲載セルだけが一瞬先行して見える。
    const latitudeScale = Math.max(.2, Math.cos(Number(lastWorldCanvasPaint.centerLatitude || 0) * Math.PI / 180));
    return {
      referenceView: {
        scale: lastWorldCanvasPaint.scale,
        centerLongitude: lastWorldCanvasPaint.centerLongitude,
        centerLatitude: lastWorldCanvasPaint.centerLatitude
      },
      scale: scale / Math.max(.0001, lastWorldCanvasPaint.scale),
      translateX: -longitudeDelta * Math.PI / 180 * sphereRadius * latitudeScale,
      translateY: latitudeDelta * Math.PI / 180 * sphereRadius
    };
  };
  // ズーム倍率で別のセルへ置き換えず、世界表示も常に同じ地理グリッドを使う。
  // 画面外のセルはCanvasへ描かれないため、固定128分割でもDOMは増えない。
  const getWorldCanvasGrid = () => WORLD_CELL_GRID;
  const canvasCoordinatePoint = (longitude, latitude) => {
    const latitudeRadians = Number(latitude) * Math.PI / 180;
    return [
      Number(longitude) * Math.PI / 180,
      Math.sin(latitudeRadians),
      Math.cos(latitudeRadians)
    ];
  };
  const createCanvasCellDescriptor = (scope, cellX, cellY, gridOverride = 0) => {
    const grid = gridOverride || (scope === 'focus' ? MAP_CELL_GRID : WORLD_CELL_GRID);
    const cellSize = 100 / grid;
    const bounds = scope === 'focus'
      ? (() => {
        const northWest = getWorldCoordinateFromMapPoint({ x: cellX * cellSize, y: cellY * cellSize });
        const southEast = getWorldCoordinateFromMapPoint({ x: (cellX + 1) * cellSize, y: (cellY + 1) * cellSize });
        return {
          west: northWest.longitude,
          east: southEast.longitude,
          north: northWest.latitude,
          south: southEast.latitude
        };
      })()
      : scope === 'fine'
        ? getWorldFineCellBounds(cellX, cellY)
      : getWorldGridCellBounds(cellX, cellY, grid);
    return {
      scope,
      cellX,
      cellY,
      corners: [
        canvasCoordinatePoint(bounds.west, bounds.north),
        canvasCoordinatePoint(bounds.east, bounds.north),
        canvasCoordinatePoint(bounds.east, bounds.south),
        canvasCoordinatePoint(bounds.west, bounds.south)
      ],
      center: canvasCoordinatePoint(
        (bounds.west + bounds.east) / 2,
        (bounds.north + bounds.south) / 2
      )
    };
  };
  const getWorldCanvasDescriptors = (scale, view, mapRect, viewportRect) => {
    const scope = scale < .75 ? 'global' : 'fine';
    const globalGrid = getWorldCanvasGrid(scale);
    const worldAsset = assetHost?.querySelector('svg.japan-map__asset--world');
    // 起動直後はGeoJSONがまだ到着していない。空配列をキャッシュすると、
    // 読み込み完了後もCanvasが永遠に再利用してしまうため、アセットをキーに含める。
    if (!worldAsset) return [];
    const centerKey = scope === 'fine'
      ? `${Number(view.centerLongitude || 0).toFixed(3)}:${Number(view.centerLatitude || 0).toFixed(3)}:${Number(scale || 1).toFixed(3)}:${Math.round(mapRect?.width || 0)}:${Math.round(viewportRect?.width || 0)}:${Math.round(viewportRect?.height || 0)}`
      : '';
    const key = `${scope}:${globalGrid}:${MAP_CELL_GRID}:${centerKey}:${worldAsset.dataset.mapAssetRevision || 'ready'}`;
    if (worldCanvasDescriptorCache.key === key) return worldCanvasDescriptorCache.descriptors;
    const descriptors = scope === 'global'
      ? getWorldLandCellState(globalGrid).cells.map(({ cellX, cellY }) => createCanvasCellDescriptor('global', cellX, cellY, globalGrid))
      : getWorldFineVisibleLandCells(view, mapRect, viewportRect)
        .map(({ cellX, cellY }) => createCanvasCellDescriptor('fine', cellX, cellY));
    // 空データは一時状態なのでキャッシュしない。再投影時にGeoJSONを再確認する。
    worldCanvasDescriptorCache = descriptors.length ? { key, descriptors } : { key: '', descriptors: [] };
    return descriptors;
  };

  const drawWorldCellCanvas = (scale = currentMapScale, view = currentGlobeView) => {
    if (!cellCanvas || !mapCanvas || !mapViewport) return;
    const canvasRect = cellCanvas.getBoundingClientRect();
    const viewportRect = mapViewport.getBoundingClientRect();
    const mapRect = mapCanvas.getBoundingClientRect();
    if (!canvasRect.width || !canvasRect.height || !viewportRect.width || !viewportRect.height || !mapRect.width || !mapRect.height) return;
    const centerUnchanged = lastWorldCanvasPaint
      && Math.abs(Number(view.centerLongitude || 0) - lastWorldCanvasPaint.centerLongitude) < .0001
      && Math.abs(Number(view.centerLatitude || 0) - lastWorldCanvasPaint.centerLatitude) < .0001;
    const canvasSizeUnchanged = lastWorldCanvasPaint
      && Math.abs(canvasRect.width - lastWorldCanvasPaint.canvasWidth) < .5
      && Math.abs(canvasRect.height - lastWorldCanvasPaint.canvasHeight) < .5;
    // 中央基準のズーム中は、直前の高精細CanvasをCSSで即時拡大する。
    // セルの候補生成より先に判定し、ズーム中にGeoJSONの細分化を繰り返さない。
    if (mapViewport.classList.contains('is-zooming')
      && centerUnchanged
      && canvasSizeUnchanged
      && worldCanvasDescriptorCache.key === lastWorldCanvasPaint.descriptorKey) {
      cellCanvas.style.transformOrigin = '50% 50%';
      cellCanvas.style.transform = `scale(${(Number(scale) / lastWorldCanvasPaint.scale).toFixed(5)})`;
      cellCanvas.dataset.renderedScale = String(Number(scale.toFixed(3)));
      return;
    }
    const transientState = getWorldCanvasTransientState(view);
    if (transientState) {
      // 回転中は直前のラスタを局所移動して先に追従させる。
      // 指を離したフレームでだけ表示範囲を再計算し、正確な投影へ戻す。
      cellCanvas.style.transformOrigin = '50% 50%';
      const transientScale = Math.abs(transientState.scale - 1) > .0001
        ? ` scale(${transientState.scale.toFixed(5)})`
        : '';
      cellCanvas.style.transform = `translate(${transientState.translateX.toFixed(2)}px,${transientState.translateY.toFixed(2)}px)${transientScale}`;
      // Canvasを移動した同じフレームで、掲載セルにも同じ移動を
      // 適用する。セル再生成の直後など、投影更新よりCanvasが先に進む
      // 順番でも同期が外れないようにする。
      const layerTransform = `translate(${transientState.translateX.toFixed(2)}px,${transientState.translateY.toFixed(2)}px)`;
      root.querySelectorAll('[data-japan-map-content-cells]').forEach((layer) => {
        layer.style.transformOrigin = '0 0';
        layer.style.transform = layerTransform;
      });
      return;
    }
    const descriptors = getWorldCanvasDescriptors(scale, view, mapRect, viewportRect);
    const renderSignature = [
      Number(scale).toFixed(4),
      Number(view.centerLongitude || 0).toFixed(4),
      Number(view.centerLatitude || 0).toFixed(4),
      Math.round(mapRect.left), Math.round(mapRect.top),
      Math.round(mapRect.width), Math.round(mapRect.height),
      Math.round(viewportRect.left), Math.round(viewportRect.top),
      Math.round(viewportRect.width), Math.round(viewportRect.height),
      descriptors.length,
      worldCanvasDescriptorCache.key
    ].join(':');
    if (lastWorldCanvasRenderSignature === renderSignature) return;
    cellCanvas.style.transform = 'none';
    const devicePixelRatio = Math.min(2, Math.max(1, Number(window.devicePixelRatio) || 1));
    const backingWidth = Math.max(1, Math.round(canvasRect.width * devicePixelRatio));
    const backingHeight = Math.max(1, Math.round(canvasRect.height * devicePixelRatio));
    if (cellCanvas.width !== backingWidth || cellCanvas.height !== backingHeight) {
      cellCanvas.width = backingWidth;
      cellCanvas.height = backingHeight;
    }
    const context = cellCanvas.getContext('2d');
    if (!context) return;
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, canvasRect.width, canvasRect.height);
    context.save();
    context.beginPath();
    context.rect(
      viewportRect.left - canvasRect.left,
      viewportRect.top - canvasRect.top,
      viewportRect.width,
      viewportRect.height
    );
    context.clip();
    context.beginPath();
    const mapOffsetX = mapRect.left - canvasRect.left;
    const mapOffsetY = mapRect.top - canvasRect.top;
    const viewportLeft = viewportRect.left - canvasRect.left - 24;
    const viewportTop = viewportRect.top - canvasRect.top - 24;
    const viewportRight = viewportRect.right - canvasRect.left + 24;
    const viewportBottom = viewportRect.bottom - canvasRect.top + 24;
    let drawn = 0;
    let drawnGlobal = 0;
    let drawnFocus = 0;
    let drawnFine = 0;
    const centerLongitudeRadians = Number(view.centerLongitude || 0) * Math.PI / 180;
    const centerLatitudeRadians = Number(view.centerLatitude || 0) * Math.PI / 180;
    const sinCenterLatitude = Math.sin(centerLatitudeRadians);
    const cosCenterLatitude = Math.cos(centerLatitudeRadians);
    const projectCanvasPoint = (point) => {
      let deltaLongitude = point[0] - centerLongitudeRadians;
      if (deltaLongitude > Math.PI) deltaLongitude -= Math.PI * 2;
      else if (deltaLongitude < -Math.PI) deltaLongitude += Math.PI * 2;
      const sinLongitude = Math.sin(deltaLongitude);
      const cosLongitude = Math.cos(deltaLongitude);
      const depth = sinCenterLatitude * point[1]
        + cosCenterLatitude * point[2] * cosLongitude;
      return {
        x: 50 + GLOBE_RADIUS_PERCENT * point[2] * sinLongitude,
        y: 50 - GLOBE_RADIUS_PERCENT * (cosCenterLatitude * point[1] - sinCenterLatitude * point[2] * cosLongitude),
        visible: depth >= -0.015
      };
    };
    descriptors.forEach((descriptor) => {
      const points = descriptor.corners.map(projectCanvasPoint);
      const visiblePoints = points.filter((point) => point.visible);
      if (visiblePoints.length < 3) {
        const center = projectCanvasPoint(descriptor.center);
        if (center.visible) visiblePoints.push(center);
      }
      if (visiblePoints.length < 3) return;
      const projectedCenter = projectCanvasPoint(descriptor.center);
      const rawBounds = visiblePoints.reduce((result, point) => ({
        left: Math.min(result.left, point.x),
        top: Math.min(result.top, point.y),
        right: Math.max(result.right, point.x),
        bottom: Math.max(result.bottom, point.y)
      }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
      const displayGeometry = getCellDisplayGeometry({
        visible: true,
        center: projectedCenter,
        bounds: rawBounds
      });
      const balancedPercentPoints = visiblePoints.map((point) => ({
        x: projectedCenter.x + ((point.x - projectedCenter.x) * displayGeometry.scaleX),
        y: projectedCenter.y + ((point.y - projectedCenter.y) * displayGeometry.scaleY)
      }));
      const balancedScreenPoints = balancedPercentPoints.map((point) => ({
        x: mapOffsetX + (point.x / 100) * mapRect.width,
        y: mapOffsetY + (point.y / 100) * mapRect.height
      }));
      const bounds = balancedScreenPoints.reduce((result, point) => ({
        left: Math.min(result.left, point.x),
        top: Math.min(result.top, point.y),
        right: Math.max(result.right, point.x),
        bottom: Math.max(result.bottom, point.y)
      }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
      if (bounds.right < viewportLeft || bounds.left > viewportRight || bounds.bottom < viewportTop || bounds.top > viewportBottom) return;
      context.moveTo(balancedScreenPoints[0].x, balancedScreenPoints[0].y);
      balancedScreenPoints.slice(1).forEach((point) => context.lineTo(point.x, point.y));
      context.closePath();
      drawn += 1;
      if (descriptor.scope === 'focus') drawnFocus += 1;
      else if (descriptor.scope === 'fine') drawnFine += 1;
      else drawnGlobal += 1;
    });
    context.fillStyle = 'rgba(173,194,205,.82)';
    context.strokeStyle = 'rgba(16,59,80,.26)';
    context.lineWidth = Math.max(.45, Math.min(1.15, .72 / Math.max(.8, Math.sqrt(Number(scale) || 1))));
    context.fill();
    context.stroke();
    context.restore();
    cellCanvas.dataset.renderedCells = String(drawn);
    cellCanvas.dataset.renderedGlobalCells = String(drawnGlobal);
    cellCanvas.dataset.renderedFocusCells = String(drawnFocus);
    cellCanvas.dataset.renderedFineCells = String(drawnFine);
    cellCanvas.dataset.renderedScale = String(Number(scale.toFixed(3)));
    lastWorldCanvasPaint = {
      scale: Number(scale) || 1,
      centerLongitude: Number(view.centerLongitude || 0),
      centerLatitude: Number(view.centerLatitude || 0),
      canvasWidth: canvasRect.width,
      canvasHeight: canvasRect.height,
      descriptorKey: worldCanvasDescriptorCache.key
    };
    lastWorldCanvasRenderSignature = renderSignature;
  };

  const renderWorldCellsNow = () => {
    if (!cellRoot || !mapCanvas || !assetHost?.querySelector('svg.japan-map__asset--world')) return;
    const cellOverlay = mapCanvas.querySelector('[data-japan-map-cell-overlay]');
    const layoutKey = `canvas-world-land:${getWorldCanvasGrid(currentMapScale)}`;
    cancelWorldCellHydration();
    cellContentRegistry.clear();
    clusterRegistry.clear();
    root.querySelectorAll('[data-japan-map-cells], [data-japan-map-content-cells]').forEach((layer) => {
      layer.replaceChildren();
      layer.dataset.cellLayoutKey = '';
    });
    cellOverlay?.replaceChildren();
    if (cellOverlay) cellOverlay.dataset.cellLayoutKey = layoutKey;
    drawWorldCellCanvas(currentMapScale, currentGlobeView);
    mapCanvas.classList.add('is-cell-map', 'is-world-cell-map');
    mapCanvas.dataset.cellGrid = String(getWorldCanvasGrid(currentMapScale));
    lastCellRenderSignature = layoutKey;
  };

  const renderCellsNow = (scale) => {
    if (!cellRoot || !mapCanvas || !prefectureGeometry.size || !assetHost?.querySelector('svg.japan-map__asset')) return;
    const grid = getCellGridSize(scale);
    if (worldMapMode && cellCanvas) drawWorldCellCanvas(scale, currentGlobeView);
    // 世界全体では固定128×128グリッドの国土セルへ切り替える。
    // ズームアウト時もセルを消さず、回転中は同じパスを再投影する。
    if (worldMapMode && scale < .75) {
      renderWorldCellsNow();
      return;
    }
    mapCanvas.classList.remove('is-world-cell-map');
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
      const projected = getGlobeCellProjection(group.cellX, group.cellY, grid, currentGlobeView);
      group.point = projected.center?.visible
        ? { x: projected.center.x, y: projected.center.y }
        : { x: (group.cellX + .5) * cellSize, y: (group.cellY + .5) * cellSize };
      group.prefecture = getMapRegionName(group.code);
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
    const geometryProbe = getCellGeometrySvg();
    const geometryProbeSvgs = geometryProbeHost ? [...geometryProbeHost.querySelectorAll('svg')] : [];
    const cellLayers = [...root.querySelectorAll('[data-japan-map-cells]')];
    const contentCellLayers = [...root.querySelectorAll('[data-japan-map-content-cells]')];
    const interactiveCellLayers = [...cellLayers, ...contentCellLayers];
    const cellButtons = interactiveCellLayers.flatMap((layer) => [...layer.querySelectorAll('[data-map-cell]')]);
    const activeContentKeys = new Set(activeContentItemKeys);
    const previousPointerEvents = interactiveCellLayers.map((layer) => layer.style.pointerEvents);
    const previousCellButtonPointerEvents = cellButtons.map((button) => button.style.pointerEvents);
    const previousProbePointerEvents = geometryProbeHost?.style.pointerEvents || '';
    const previousGeometryProbePointerEvents = geometryProbeSvgs.map((svg) => svg.style.pointerEvents);
    interactiveCellLayers.forEach((layer) => { layer.style.pointerEvents = 'none'; });
    // 親レイヤーだけを無効にしても、セル側の pointer-events:auto が
    // 優先されるため、形状判定中はボタン自身もヒットテストから外す。
    cellButtons.forEach((button) => { button.style.pointerEvents = 'none'; });
    if (geometryProbeHost) geometryProbeHost.style.pointerEvents = 'auto';
    geometryProbeSvgs.forEach((svg) => { svg.style.pointerEvents = 'none'; });
    if (geometryProbe) geometryProbe.style.pointerEvents = 'auto';
    const { tiles, ranges } = cellLayout;
    // 日本へ寄った時も、同じ球面上にある周辺国のセルを消さない。
    // 日本の細かい固定セルを後ろから覆わないよう、周辺国セルを先に置く。
    if (!worldMapMode) cancelWorldCellHydration();
    const worldCellDescriptors = worldMapMode && !cellCanvas
      ? [
        ...getWorldBackgroundLandCells().map(({ cellX, cellY }) => ({
          scope: 'global',
          cellX,
          cellY,
          grid: WORLD_CELL_GRID
        })),
        ...getWorldFocusLandCells().map(({ cellX, cellY }) => ({
          scope: 'focus',
          cellX,
          cellY,
          grid: MAP_CELL_GRID
        }))
      ]
      : [];
    let renderedCellCount = 0;
    try {
      tiles.forEach((tile, tileIndex) => {
        const layer = tile.querySelector('[data-japan-map-cells]');
        if (!layer) return;
        const contentLayer = tile.querySelector('[data-japan-map-content-cells]');
        tile.dataset.cellGrid = String(grid);
        const range = ranges[tileIndex];
        if (!range) {
          if (tile === mapCanvas) cancelWorldCellHydration();
          tile.querySelector('[data-japan-map-cell-overlay]')?.replaceChildren();
          layer.replaceChildren();
          layer.dataset.cellLayoutKey = '';
          contentLayer?.replaceChildren();
          if (contentLayer) contentLayer.dataset.cellLayoutKey = '';
          return;
        }
        const layoutKey = `${grid}:${activeMapLayer}:${activePrefectureCode}:${range.startX}:${range.endX}:${range.startY}:${range.endY}`;
        const cellOverlay = tile.querySelector('[data-japan-map-cell-overlay]');
        if (layer.dataset.cellLayoutKey === layoutKey
          && cellOverlay?.dataset.cellLayoutKey === layoutKey
          && contentLayer?.dataset.cellLayoutKey === layoutKey) {
          renderedCellCount += cellOverlay?.childElementCount || 0;
          renderedCellCount += contentLayer?.childElementCount || 0;
          return;
        }
        const cellSize = 100 / grid;
        const cellMarkup = [];
          if (!worldMapMode) {
            for (let cellY = range.startY; cellY <= range.endY; cellY += 1) {
              for (let cellX = range.startX; cellX <= range.endX; cellX += 1) {
                const code = findCellPrefecture(grid, cellX, cellY, snapshot);
                if (!code) continue;
                // 空セルは操作要素にせず、ベクターの矩形として描画する。
                // 作品・店舗・イベントのあるセルだけを後段でbutton化する。
                const pathData = getGlobeCellPath(cellX, cellY, grid, currentGlobeView);
                if (!pathData) continue;
                cellMarkup.push(`<path d="${pathData}" fill="rgba(173,194,205,.82)" stroke="rgba(16,59,80,.26)" stroke-width="0.1" vector-effect="non-scaling-stroke" data-cell-x="${cellX}" data-cell-y="${cellY}" data-cell-prefecture="${code}"></path>`);
              }
            }
          }
        cellOverlay?.replaceChildren();
        if (cellOverlay) {
          cellOverlay.innerHTML = `${tile === mapCanvas ? '<g data-world-cell-layer></g>' : ''}<g data-japan-cell-layer>${cellMarkup.join('')}</g>`;
          cellOverlay.dataset.cellLayoutKey = layoutKey;
        }
        layer.replaceChildren();
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
          const stateClasses = [
            'japan-map__cell',
            'has-content',
            `has-${group.kind}`,
            isActive ? 'is-active' : ''
          ];
          const projectedStyle = getProjectedCellStyle(group.cellX, group.cellY, grid, currentGlobeView);
          if (!projectedStyle) return '';
          if (projectedStyle.isCenterCell) stateClasses.push('is-center-cell');
          const stateClass = stateClasses.filter(Boolean).join(' ');
          const densityStyle = `--cell-density:${group.density.toFixed(3)};--cell-hue:${densityColor.hue.toFixed(2)};--cell-saturation:${densityColor.saturation.toFixed(2)}%;--cell-lightness:${densityColor.lightness.toFixed(2)}%;${projectedStyle.style}`;
          return `<button class="${stateClass}" type="button" data-map-cell data-prefecture-code="${group.code}" data-prefecture-name="${escapeHtml(group.prefecture)}" data-cell-key="${escapeHtml(group.cellKey)}" data-cell-x="${group.cellX}" data-cell-y="${group.cellY}" data-cell-kind="${escapeHtml(group.kind)}" data-cell-count="${contentCount}" aria-expanded="${isActive}" tabindex="-1" aria-label="${escapeHtml(`${group.prefecture}。${contentSummary}。セルを選んで一覧を見る`)}" style="${densityStyle}"></button>`;
        }).join('');
        if (contentLayer) {
          contentLayer.innerHTML = contentMarkup;
          contentLayer.dataset.cellLayoutKey = layoutKey;
        }
        renderedCellCount += cellMarkup.length + visibleContentGroups.length;
        if (tile !== mapCanvas) {
          tile.querySelectorAll('[data-japan-map-cells] button, [data-japan-map-content-cells] button').forEach((button) => {
            button.tabIndex = -1;
            button.setAttribute('aria-hidden', 'true');
          });
        }
      });
      if (worldCellDescriptors.length) {
        const worldCellLayer = mapCanvas.querySelector('[data-world-cell-layer]');
        startWorldCellHydration(worldCellLayer, worldCellDescriptors, cellLayout.signature);
      }
      // 空セルを大量のtab stopにせず、掲載情報のあるセルだけをroving tabindexで
      // キーボードから選べるようにする。空の地図全体はviewportの矢印操作で扱う。
      const accessibleContentCells = [...mapCanvas.querySelectorAll('[data-japan-map-content-cells] [data-map-cell]')];
      const preferredCell = accessibleContentCells.find((button) => button.classList.contains('is-active')) || accessibleContentCells[0];
      accessibleContentCells.forEach((button) => { button.tabIndex = button === preferredCell ? 0 : -1; });
    } finally {
      interactiveCellLayers.forEach((layer, index) => { layer.style.pointerEvents = previousPointerEvents[index]; });
      cellButtons.forEach((button, index) => { button.style.pointerEvents = previousCellButtonPointerEvents[index]; });
      geometryProbeSvgs.forEach((svg, index) => { svg.style.pointerEvents = previousGeometryProbePointerEvents[index]; });
      if (geometryProbeHost) geometryProbeHost.style.pointerEvents = previousProbePointerEvents;
    }
    if (renderedCellCount) mapCanvas.classList.add('is-cell-map');
    if (worldCellDescriptors.length) mapCanvas.classList.add('is-world-cell-map');
    mapCanvas.dataset.cellGrid = String(grid);
    lastCellRenderSignature = cellLayout.signature;
  };

  const isProjectionInViewport = (projection) => {
    if (!projection?.visible || !projection.bounds || !mapCanvas || !mapViewport) return false;
    const canvasRect = mapCanvas.getBoundingClientRect();
    const viewportRect = mapViewport.getBoundingClientRect();
    if (!canvasRect.width || !canvasRect.height || !viewportRect.width || !viewportRect.height) return true;
    const overscan = Math.max(18, Math.min(viewportRect.width, viewportRect.height) * .08);
    const left = canvasRect.left + (projection.bounds.left / 100) * canvasRect.width;
    const top = canvasRect.top + (projection.bounds.top / 100) * canvasRect.height;
    const right = canvasRect.left + (projection.bounds.right / 100) * canvasRect.width;
    const bottom = canvasRect.top + (projection.bounds.bottom / 100) * canvasRect.height;
    return right >= viewportRect.left - overscan && left <= viewportRect.right + overscan
      && bottom >= viewportRect.top - overscan && top <= viewportRect.bottom + overscan;
  };

  const getWorldCellProjectionForDescriptor = (descriptor, view = currentGlobeView) => {
    const grid = Number(descriptor.grid) || (descriptor.scope === 'focus' ? MAP_CELL_GRID : WORLD_CELL_GRID);
    if (descriptor.scope === 'focus') return getGlobeCellProjection(descriptor.cellX, descriptor.cellY, grid, view);
    if (descriptor.scope === 'fine') return getGlobeWorldFineCellProjection(descriptor.cellX, descriptor.cellY, view);
    return getGlobeWorldCellProjection(descriptor.cellX, descriptor.cellY, grid, view);
  };

  const getWorldCellDescriptorKey = (descriptor) => `${descriptor.scope}:${descriptor.grid || 0}:${descriptor.cellX}:${descriptor.cellY}`;

  const getPathFromGlobeProjection = (projection) => {
    if (!projection?.visible || projection.corners.length < 3) return '';
    const points = projection.corners.filter((point) => point.visible);
    if (points.length < 3 && projection.center) points.push(projection.center);
    if (points.length < 3) return '';
    return `M${points.map(({ x, y }) => `${formatWorldCoordinate(x * 10)},${formatWorldCoordinate(y * 10)}`).join('L')}Z`;
  };

  const createWorldCellPathElement = (descriptor, view = currentGlobeView, projection = null) => {
    const resolvedProjection = projection || getWorldCellProjectionForDescriptor(descriptor, view);
    const pathData = getPathFromGlobeProjection(resolvedProjection);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('data-world-cell-scope', descriptor.scope);
    path.setAttribute('data-world-cell-grid', String(descriptor.grid || 0));
    path.setAttribute('data-world-cell-x', String(descriptor.cellX));
    path.setAttribute('data-world-cell-y', String(descriptor.cellY));
    path.dataset.worldCellKey = getWorldCellDescriptorKey(descriptor);
    path.setAttribute('d', pathData);
    path.setAttribute('fill', 'rgba(173,194,205,.82)');
    path.setAttribute('stroke', 'rgba(16,59,80,.26)');
    path.setAttribute('stroke-width', '0.1');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    const isVisible = Boolean(pathData) && isProjectionInViewport(resolvedProjection);
    path.style.display = isVisible ? '' : 'none';
    path.dataset.cellVisible = String(isVisible);
    return path;
  };

  const cancelWorldCellHydration = () => {
    if (worldCellHydrationTimer) {
      if (worldCellHydrationTimerKind === 'idle' && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(worldCellHydrationTimer);
      } else {
        window.clearTimeout(worldCellHydrationTimer);
      }
    }
    worldCellHydrationTimer = 0;
    worldCellHydrationTimerKind = '';
    worldCellHydrationState = null;
    worldCellHydrationSerial += 1;
  };

  const scheduleWorldCellHydration = (state) => {
    if (!state || state.serial !== worldCellHydrationSerial || !state.pending.length || !state.layer?.isConnected) return;
    const run = () => {
      worldCellHydrationTimer = 0;
      worldCellHydrationTimerKind = '';
      if (worldCellHydrationState !== state || state.serial !== worldCellHydrationSerial || !state.layer?.isConnected) return;
      // 全セルの座標とGeoJSON判定はstartWorldCellHydration時点で揃っている。
      // ここでは非表示セルをDOMへ追加せず、ブラウザが空いた時点で
      // 「裏側のデータ準備が済んだ」状態だけを確定する。
      // 表示範囲へ入ったセルはensureWorldCellCoverageが必要な分だけ生成する。
      state.backgroundReady = true;
    };
    if (typeof window.requestIdleCallback === 'function') {
      worldCellHydrationTimerKind = 'idle';
      worldCellHydrationTimer = window.requestIdleCallback(run, { timeout: 240 });
    } else {
      worldCellHydrationTimerKind = 'timeout';
      worldCellHydrationTimer = window.setTimeout(() => run({ didTimeout: true }), 0);
    }
  };

  const startWorldCellHydration = (layer, descriptors, layoutKey) => {
    if (!layer) {
      cancelWorldCellHydration();
      return;
    }
    if (worldCellHydrationState?.layer === layer && worldCellHydrationState.layoutKey === layoutKey) return;
    cancelWorldCellHydration();
    const serial = worldCellHydrationSerial;
    const initialDescriptors = [];
    const pending = [];
    const pendingKeys = new Set();
    const activeKeys = new Set();
    const descriptorByKey = new Map(descriptors.map((descriptor) => [getWorldCellDescriptorKey(descriptor), descriptor]));
    descriptors.forEach((descriptor) => {
      const projection = getWorldCellProjectionForDescriptor(descriptor, currentGlobeView);
      if (projection.visible && isProjectionInViewport(projection)) initialDescriptors.push({ descriptor, projection });
      else {
        pending.push(descriptor);
        pendingKeys.add(getWorldCellDescriptorKey(descriptor));
      }
    });
    const initialFragment = document.createDocumentFragment();
    initialDescriptors.forEach(({ descriptor, projection }) => {
      const path = createWorldCellPathElement(descriptor, currentGlobeView, projection);
      if (!path) {
        pending.push(descriptor);
        pendingKeys.add(getWorldCellDescriptorKey(descriptor));
        return;
      }
      activeKeys.add(getWorldCellDescriptorKey(descriptor));
      initialFragment.append(path);
    });
    if (initialFragment.childNodes.length) layer.append(initialFragment);
    const state = {
      layer,
      layoutKey,
      pending,
      pendingKeys,
      activeKeys,
      descriptorByKey,
      serial,
      backgroundReady: pending.length === 0,
      lastCoverageSignature: '',
      lastCoverageAt: 0
    };
    worldCellHydrationState = state;
    scheduleWorldCellHydration(state);
  };

  const ensureWorldCellCoverage = (view = currentGlobeView) => {
    const state = worldCellHydrationState;
    if (!state || !state.pending.length || !state.layer?.isConnected) return;
    const now = performance.now();
    const signature = [
      Math.round(Number(view.scale || 1) * 20) / 20,
      Math.round(Number(view.centerLongitude || 0) * 2) / 2,
      Math.round(Number(view.centerLatitude || 0) * 2) / 2
    ].join(':');
    if (state.lastCoverageSignature === signature && now - state.lastCoverageAt < 80) return;
    state.lastCoverageSignature = signature;
    state.lastCoverageAt = now;
    let promoted = 0;
    const fragment = document.createDocumentFragment();
    for (let index = state.pending.length - 1; index >= 0 && promoted < 96; index -= 1) {
      const descriptor = state.pending[index];
      const projection = getWorldCellProjectionForDescriptor(descriptor, view);
      if (!projection.visible || !isProjectionInViewport(projection)) continue;
      const path = createWorldCellPathElement(descriptor, view, projection);
      if (!path) continue;
      state.pending.splice(index, 1);
      state.pendingKeys.delete(getWorldCellDescriptorKey(descriptor));
      state.activeKeys.add(getWorldCellDescriptorKey(descriptor));
      fragment.append(path);
      promoted += 1;
    }
    if (promoted) state.layer.append(fragment);
  };

  const updateGlobeCellProjection = (view = currentGlobeView) => {
    currentGlobeView = view;
    ensureWorldCellCoverage(view);
    const grid = MAP_CELL_GRID;
    // Canvasを一時的に移動しているパン・回転中は、掲載セルも
    // 同じラスタ基準へ一時退避させる。停止したフレームでは現在の経緯度を
    // 再投影し、transformを解除するため、ズーム後のパンでもズレが残らない。
    const transientState = getWorldCanvasTransientState(view);
    const projectionView = transientState?.referenceView || view;
    const isInteractionFrame = mapViewport.classList.contains('is-dragging')
      || mapViewport.classList.contains('is-rotating');
    const preserveCanvasFrame = isInteractionFrame
      && cellCanvas?.style.transform
      && cellCanvas.style.transform !== 'none';
    if (!transientState && !preserveCanvasFrame && cellCanvas) {
      // pointerup直後に残った一時変換を次の正確な投影へ確実に戻す。
      // これをしないとCanvasだけが前フレームの移動量を保持し、
      // 掲載セル層との相対位置がずれる。
      cellCanvas.style.transform = 'none';
    }
    root.querySelectorAll('[data-japan-map-content-cells]').forEach((layer) => {
      layer.style.transformOrigin = '0 0';
      layer.style.transform = transientState
        ? `translate(${transientState.translateX.toFixed(2)}px,${transientState.translateY.toFixed(2)}px)`
        : preserveCanvasFrame ? layer.style.transform : 'none';
    });
    root.querySelectorAll('[data-japan-map-cell-overlay] path[data-cell-x][data-cell-y]').forEach((path) => {
      const projection = getGlobeCellProjection(Number(path.dataset.cellX), Number(path.dataset.cellY), grid, view);
      const cellPath = projection.visible ? getPathFromGlobeProjection(projection) : '';
      path.setAttribute('d', cellPath);
      const isVisible = Boolean(cellPath) && isProjectionInViewport(projection);
      path.style.display = isVisible ? '' : 'none';
      path.dataset.cellVisible = String(isVisible);
    });
    root.querySelectorAll('[data-japan-map-cell-overlay] path[data-world-cell-x][data-world-cell-y]').forEach((path) => {
      const isFocusCell = path.dataset.worldCellScope === 'focus';
      const cellX = Number(path.dataset.worldCellX);
      const cellY = Number(path.dataset.worldCellY);
      const grid = isFocusCell ? MAP_CELL_GRID : Number(path.dataset.worldCellGrid || WORLD_CELL_GRID);
      const projection = isFocusCell
        ? getGlobeCellProjection(cellX, cellY, grid, view)
        : getGlobeWorldCellProjection(cellX, cellY, grid, view);
      const cellPath = getPathFromGlobeProjection(projection);
      const isVisible = Boolean(cellPath) && isProjectionInViewport(projection);
      const hydrationState = worldCellHydrationState;
      const worldCellKey = path.dataset.worldCellKey || `${path.dataset.worldCellScope}:${grid}:${cellX}:${cellY}`;
      if (!isVisible && hydrationState?.layer?.contains(path)) {
        const descriptor = hydrationState.descriptorByKey.get(worldCellKey);
        if (descriptor && !hydrationState.pendingKeys.has(worldCellKey)) {
          hydrationState.pending.push(descriptor);
          hydrationState.pendingKeys.add(worldCellKey);
          hydrationState.activeKeys.delete(worldCellKey);
        }
        path.remove();
        return;
      }
      path.setAttribute('d', cellPath);
      path.style.display = isVisible ? '' : 'none';
      path.dataset.cellVisible = String(isVisible);
    });
    root.querySelectorAll('[data-map-cell][data-cell-x][data-cell-y]').forEach((button) => {
      const projectedStyle = getProjectedCellStyle(Number(button.dataset.cellX), Number(button.dataset.cellY), grid, projectionView);
      button.style.display = projectedStyle ? '' : 'none';
      if (projectedStyle) {
        button.style.left = `${projectedStyle.left.toFixed(4)}%`;
        button.style.top = `${projectedStyle.top.toFixed(4)}%`;
        button.style.width = `${projectedStyle.width.toFixed(4)}%`;
        button.style.height = `${projectedStyle.height.toFixed(4)}%`;
        button.style.clipPath = projectedStyle.clipPath;
      }
    });
    cellContentRegistry.forEach((group) => {
      const projection = getGlobeCellProjection(group.cellX, group.cellY, grid, projectionView);
      if (projection.center?.visible) group.point = { x: projection.center.x, y: projection.center.y };
    });
  };

  // 地図の移動はsetupJapanMap側のrequestAnimationFrameで即時に進める。
  // セルは同じ表示窓を再利用し、表示窓が変わった時だけ次のフレームに
  // 1回描画する。ユーザー投稿も掲載セルへ集約するため、別ピンの再生成は行わない。
  let cellRenderFrame = 0;
  let pendingCellRenderScale = 1;
  const cancelScheduledCellRender = () => {
    if (!cellRenderFrame) return;
    window.cancelAnimationFrame(cellRenderFrame);
    cellRenderFrame = 0;
  };
  const renderCells = (scale, options = {}) => {
    pendingCellRenderScale = scale;
    // パン・回転中はCanvasの軽い一時移動をこの呼び出しで先に適用する。
    // その直後に同じ変換を掲載セルへ渡すため、更新順序による一瞬のズレを防ぐ。
    const isMoving = mapViewport?.classList.contains('is-dragging')
      || mapViewport?.classList.contains('is-rotating');
    if (worldMapMode && cellCanvas && isMoving) drawWorldCellCanvas(scale, currentGlobeView);
    if (options.immediate) {
      cancelScheduledCellRender();
      renderCellsNow(scale);
      return;
    }
    if (cellRenderFrame) return;
    cellRenderFrame = window.requestAnimationFrame(() => {
      cellRenderFrame = 0;
      renderCellsNow(pendingCellRenderScale);
    });
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
          label: `${getMapRegionName(code)}のセル`
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
    // 投稿DBは現在、日本の県コードを保存する仕様。世界の国セルは
    // GeoJSON表示には対応するが、投稿保存スキーマを拡張するまで投稿導線を出さない。
    if (grid !== MAP_CELL_GRID || !Number.isInteger(x) || !Number.isInteger(y) || !/^([0][1-9]|[1-4][0-9])$/.test(code)) return '';
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
    if (svg?.dataset.mapProjection === 'orthographic-globe' && region.__pixieedCenter) {
      return projectWorldCoordinate(region.__pixieedCenter.longitude, region.__pixieedCenter.latitude);
    }
    const knownPoint = PREFECTURE_MAP_POINTS[code];
    // 離島を含む県グループの外接矩形は代表点として使わない。
    // 県の案内・フォーカスは、主要部に合わせた既知の代表点を優先する。
    // ただし、実際の都道府県GeoJSONを使う詳細レイヤーでは、元形状から計算する。
    const usesDetailedJapanGeometry = svg?.dataset.mapGeometry === 'japan-prefectures';
    if (knownPoint && !usesDetailedJapanGeometry) return { ...knownPoint };
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
    popover.innerHTML = `<div class="map-popover__top"><span class="tag tag--sample">${escapeHtml(prefecture)}</span><button type="button" class="map-popover__close" data-map-close aria-label="地域の案内を閉じる">×</button></div><h3>この地域にも、いつか。</h3><p>いまはまだPiXiEEDの絵が会えるお店やイベントを準備中です。次に絵が見つかる街を、ゆっくり増やしていきます。</p><p class="map-popover__empty">掲載店舗 ${storeCount}件 · イベント ${eventCount}件 · 作品${workCount}点</p>${postActionMarkup}`;
    popover.hidden = false;
    popover.querySelector('[data-map-close]')?.addEventListener('click', () => closePopover(region));
  };

  const showCellPostPopover = (prefecture, point, mapCell, storeCount = 0, eventCount = 0, workCount = 0) => {
    if (!popover || !mapCell) return;
    popover.style.setProperty('--popover-x', `${Math.min(Math.max(point.x, 4), 68)}%`);
    popover.style.setProperty('--popover-y', `${Math.min(Math.max(point.y, 8), 52)}%`);
    const postActionMarkup = mapPostActionMarkup(mapCell);
    popover.innerHTML = `<div class="map-popover__top"><span class="tag tag--sample">${escapeHtml(prefecture)}のセル</span><button type="button" class="map-popover__close" data-map-close aria-label="セルの案内を閉じる">×</button></div><h3>このセルに絵を置く</h3><p>細かい住所は入力しなくて大丈夫です。セルそのものが掲載場所になるので、地図を動かしても表示位置はずれません。</p><p class="map-popover__empty">この県：店舗 ${storeCount}件 · イベント ${eventCount}件 · 作品 ${workCount}点</p>${postActionMarkup}`;
    popover.hidden = false;
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
    const prefecture = getMapRegionName(code, region.dataset.prefecture || 'この地域');
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
    if (mapCell) {
      const selectedMapCell = mapCell.dataset
        ? {
          grid: Number(mapCell.dataset.cellGrid || String(mapCell.dataset.cellKey || '').split(':')[0]),
          x: Number(mapCell.dataset.cellX),
          y: Number(mapCell.dataset.cellY),
          prefectureCode: String(mapCell.dataset.prefectureCode || '').padStart(2, '0'),
          label: `${prefecture}のセル`
        }
        : mapCell;
      const grid = Number(selectedMapCell.grid);
      const cellPoint = {
        x: ((Number(selectedMapCell.x) + .5) / grid) * 100,
        y: ((Number(selectedMapCell.y) + .5) / grid) * 100
      };
      showCellPostPopover(prefecture, cellPoint, selectedMapCell, storeCount, eventCount, workCount);
    } else if (!storeCount && !eventCount && !workCount) {
      showEmptyPrefecture(prefecture, point, region, storeCount, eventCount, workCount, mapCell);
    }
  };

  const bindPrefectureButtons = (svg) => {
    const regions = [...svg.querySelectorAll('g.prefecture[data-code]')];
    prefectureGeometry = new Map(regions.map((region) => [String(region.dataset.code || '').padStart(2, '0'), region]));
    prefectureBoundaryCache.clear();
    regions.forEach((region) => {
      const code = String(region.dataset.code || '').padStart(2, '0');
      const prefecture = getMapRegionName(code, region.dataset.prefecture || 'この地域');
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
    if (!mapCanvas || !mapViewport) return;
    // 平面地図の左右タイルは、球体の裏側を複製してしまうため使わない。
    root.querySelectorAll('.japan-map__canvas--wrap-tile').forEach((tile) => tile.remove());
    mapCanvas.dataset.mapTileOffset = '0';
  };

  const loadMapAsset = async () => {
    if (!assetHost) return;
    try {
      const [data, japanData] = await Promise.all([
        loadCachedMapJson(MAP_ASSET_URL),
        loadCachedMapJson(JAPAN_PREFECTURE_ASSET_URL).catch(() => null)
      ]);
      // 日本の詳細形状は独立して読み込む。取得できない場合も世界地図は使えるようにする。
      const svg = MAP_ASSET_KIND === 'world-geojson' ? createWorldMapSvg(data) : null;
      if (!svg) throw new Error('Map asset is not GeoJSON');
      svg.setAttribute('role', 'group');
      svg.setAttribute('aria-label', 'GeoJSONで描画された世界地図');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      assetHost.replaceChildren(svg);
      // 画面の地図はCanvasだけで描画する。GeoJSON SVGは座標判定・地域データ用に
      // レイアウトだけ保持し、視覚・アクセシビリティ・ポインターの対象から外す。
      svg.setAttribute('aria-hidden', 'true');
      svg.style.visibility = 'hidden';
      svg.style.pointerEvents = 'none';
      assetHost.setAttribute('aria-hidden', 'true');
      // 新しいGeoJSONを受け取ったらCanvas用セル記述子も作り直す。
      worldCanvasDescriptorCache = { key: '', descriptors: [] };
      lastWorldCanvasRenderSignature = '';
      lastWorldCanvasPaint = null;
      updateGlobeMapProjection(svg, currentGlobeView);
      const geometryProbe = svg.cloneNode(true);
      geometryProbe.classList.remove('japan-map__asset');
      geometryProbe.removeAttribute('role');
      geometryProbe.setAttribute('aria-hidden', 'true');
      geometryProbe.dataset.mapGeometry = 'world';
      const japanGeometryProbe = japanData ? createJapanPrefectureSvg(japanData) : null;
      if (japanGeometryProbe) {
        japanGeometryProbe.classList.remove('japan-map__asset');
        japanGeometryProbe.removeAttribute('role');
        japanGeometryProbe.setAttribute('aria-hidden', 'true');
        japanGeometryProbe.style.pointerEvents = 'none';
      }
      geometryProbeHost?.replaceChildren(geometryProbe, ...(japanGeometryProbe ? [japanGeometryProbe] : []));
      bindPrefectureButtons(svg);
      if (japanGeometryProbe) {
        [...japanGeometryProbe.querySelectorAll('g.prefecture[data-code]')].forEach((region) => {
          const code = String(region.dataset.code || '').padStart(2, '0');
          prefectureGeometry.set(code, region);
        });
      }
      prefectureBoundaryCache.clear();
      cellGeometrySnapshotCache = null;
      cellGeometryCache.clear();
      createMapWrapTiles();
      window.dispatchEvent(new Event('resize'));
      const renderInitialCells = (attempt = 0) => {
        const currentRect = svg.getBoundingClientRect();
        if (currentRect.width && currentRect.height) {
          updateGlobeMapProjection(svg, currentGlobeView);
          renderCells(1, { immediate: true });
          updateGlobeCellProjection(currentGlobeView);
          return;
        }
        if (attempt < 8) window.requestAnimationFrame(() => renderInitialCells(attempt + 1));
      };
      renderInitialCells();
    } catch {
      mapCanvas?.classList.remove('is-cell-map');
      assetHost.replaceChildren();
      assetHost.setAttribute('aria-busy', 'false');
    }
  };

  const getMapCellFromPoint = (event) => {
    const element = event.target instanceof Element ? event.target : null;
    const tile = element?.closest('[data-japan-map-canvas], .japan-map__canvas--wrap-tile')
      || (mapViewport?.contains(element) ? mapCanvas : null);
    if (!tile || !mapViewport?.contains(tile)) return null;
    const rect = tile.getBoundingClientRect();
    const grid = Number(tile.dataset.cellGrid || mapCanvas.dataset.cellGrid || 0);
    const isWorldOverview = worldMapMode && currentMapScale < .75;
    // 世界セルはmapCanvasを基準に投影しつつ、球面がmapCanvasの外側まで
    // 広がる。viewportを受け皿にしてから逆投影で球面外を除外すると、
    // 世界全体・日本寄りのどちらでも見えているセルを選択できる。
    const hitRect = worldMapMode ? mapViewport.getBoundingClientRect() : rect;
    if (!grid || !rect.width || !rect.height || !hitRect.width || !hitRect.height
      || event.clientX < hitRect.left || event.clientX >= hitRect.right
      || event.clientY < hitRect.top || event.clientY >= hitRect.bottom) return null;
    const projectedPoint = {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100
    };
    const globeCoordinate = inverseProjectGlobeCoordinate(projectedPoint.x, projectedPoint.y, currentGlobeView);
    if (!globeCoordinate) return null;
    const worldRegion = worldMapMode ? getWorldRegionAtCoordinate(globeCoordinate.longitude, globeCoordinate.latitude) : null;
    const worldRegionCode = String(worldRegion?.dataset.code || '').trim();
    // 世界表示ではもちろん、日本に寄った状態でも日本以外の国セルを
    // 同じ世界グリッドとして選べるようにする。日本だけは従来の細かい
    // 県セル判定へ渡すため、両方のセル密度を混在させない。
    if (worldMapMode && worldRegion
      && (isWorldOverview || worldRegionCode !== 'JPN')) {
      const useFineWorldCell = !isWorldOverview && worldRegionCode !== 'JPN';
      const cellX = useFineWorldCell
        ? ((Math.floor((globeCoordinate.longitude - WORLD_FINE_GRID_ORIGIN_LONGITUDE) / WORLD_FINE_CELL_DEGREES) % WORLD_FINE_CELL_GRID_X) + WORLD_FINE_CELL_GRID_X) % WORLD_FINE_CELL_GRID_X
        : Math.min(grid - 1, Math.max(0, Math.floor(((globeCoordinate.longitude + 180) / 360) * grid)));
      const cellY = useFineWorldCell
        ? Math.min(WORLD_FINE_CELL_GRID_Y - 1, Math.max(0, Math.floor((WORLD_FINE_GRID_NORTH_LATITUDE - globeCoordinate.latitude) / WORLD_FINE_CELL_DEGREES)))
        : Math.min(grid - 1, Math.max(0, Math.floor(((90 - globeCoordinate.latitude) / 180) * grid)));
      const cellGrid = useFineWorldCell ? WORLD_FINE_CELL_GRID_X : grid;
      return {
        grid: cellGrid,
        x: cellX,
        y: cellY,
        ...(useFineWorldCell ? { worldCellStep: WORLD_FINE_CELL_DEGREES } : {}),
        prefectureCode: worldRegionCode,
        label: `${getMapRegionName(worldRegionCode, worldRegion.dataset.prefecture || 'この地域')}のセル`,
        regionCode: worldRegionCode,
        key: `${useFineWorldCell ? 'fine' : grid}:${cellX}:${cellY}:${worldRegionCode}`
      };
    }
    const flatPoint = projectWorldCoordinate(globeCoordinate.longitude, globeCoordinate.latitude);
    const cellX = Math.min(grid - 1, Math.max(0, Math.floor((flatPoint.x / 100) * grid)));
    const cellY = Math.min(grid - 1, Math.max(0, Math.floor((flatPoint.y / 100) * grid)));
    const snapshot = getCellGeometrySnapshot();
    const regionCode = snapshot ? findCellPrefecture(grid, cellX, cellY, snapshot) : '';
    if (!regionCode) return null;
    const cellPoint = { x: flatPoint.x, y: flatPoint.y };
    const prefectureCode = regionCode === 'JPN' ? getNearestJapanesePrefectureCode(cellPoint) : regionCode;
    const prefecture = getMapRegionName(prefectureCode || regionCode);
    return {
      grid,
      x: cellX,
      y: cellY,
      prefectureCode,
      label: `${prefecture}のセル`,
      regionCode,
      key: `${grid}:${cellX}:${cellY}:${prefectureCode || regionCode}`
    };
  };

  const isJapanesePrefectureCell = (mapCell) => JAPAN_PREFECTURE_CODE_SET.has(
    String(mapCell?.prefectureCode || '').padStart(2, '0')
  ) && String(mapCell?.regionCode || 'JPN').toUpperCase() === 'JPN';

  const getVirtualCellProjection = (mapCell) => {
    if (!mapCell || !Number.isInteger(Number(mapCell.x)) || !Number.isInteger(Number(mapCell.y))) return null;
    const grid = Number(mapCell.grid) || WORLD_CELL_GRID;
    const projection = mapCell.worldCellStep
      ? getGlobeWorldFineCellProjection(Number(mapCell.x), Number(mapCell.y), currentGlobeView)
      : currentMapScale >= .75 && isJapanesePrefectureCell(mapCell)
        ? getGlobeCellProjection(Number(mapCell.x), Number(mapCell.y), grid, currentGlobeView)
        : getGlobeWorldCellProjection(Number(mapCell.x), Number(mapCell.y), grid, currentGlobeView);
    if (!projection?.visible || !projection.bounds) return null;
    const points = projection.corners.filter((point) => point.visible);
    if (points.length < 3 && projection.center?.visible) points.push(projection.center);
    if (points.length < 3) return null;
    const displayGeometry = getCellDisplayGeometry(projection);
    const displayFrame = { bounds: displayGeometry.bounds, isCenterCell: displayGeometry.isCenterCell };
    const { left, top, right, bottom } = displayFrame.bounds;
    const width = Math.max(.01, right - left);
    const height = Math.max(.01, bottom - top);
    const displayPoints = points.map((point) => ({
      x: projection.center.x + ((point.x - projection.center.x) * displayGeometry.scaleX),
      y: projection.center.y + ((point.y - projection.center.y) * displayGeometry.scaleY)
    }));
    const polygon = displayPoints
      .map((point) => `${(((point.x - left) / width) * 100).toFixed(2)}% ${(((point.y - top) / height) * 100).toFixed(2)}%`)
      .join(',');
    return { projection, left, top, width, height, polygon, isCenterCell: displayFrame.isCenterCell };
  };

  const hideVirtualCellButton = (force = false) => {
    if (!cellAction || (!force && (document.activeElement === cellAction || cellAction.classList.contains('is-active')))) return;
    cellAction.hidden = true;
    cellAction.classList.remove('is-active');
    virtualCell = null;
  };

  const setVirtualCellButton = (mapCell, active = false) => {
    if (!cellAction || !mapCell || !mapCanvas || !mapViewport) return;
    const projected = getVirtualCellProjection(mapCell);
    const mapRect = mapCanvas.getBoundingClientRect();
    const viewportRect = mapViewport.getBoundingClientRect();
    if (!projected || !mapRect.width || !mapRect.height || !viewportRect.width || !viewportRect.height) {
      hideVirtualCellButton(true);
      return;
    }
    const left = mapRect.left - viewportRect.left + (projected.left / 100) * mapRect.width;
    const top = mapRect.top - viewportRect.top + (projected.top / 100) * mapRect.height;
    const width = (projected.width / 100) * mapRect.width;
    const height = (projected.height / 100) * mapRect.height;
    if (left + width < -4 || top + height < -4 || left > viewportRect.width + 4 || top > viewportRect.height + 4) {
      hideVirtualCellButton(true);
      return;
    }
    const code = String(mapCell.prefectureCode || mapCell.regionCode || '').padStart(2, '0');
    const regionName = getMapRegionName(code, mapCell.regionCode === 'JPN' ? '日本' : 'この地域');
    virtualCell = { ...mapCell };
    cellAction.hidden = false;
    cellAction.classList.toggle('is-active', Boolean(active));
    cellAction.style.left = `${left.toFixed(2)}px`;
    cellAction.style.top = `${top.toFixed(2)}px`;
    cellAction.style.width = `${Math.max(.5, width).toFixed(2)}px`;
    cellAction.style.height = `${Math.max(.5, height).toFixed(2)}px`;
    cellAction.style.clipPath = `polygon(${projected.polygon})`;
    cellAction.dataset.cellGrid = String(mapCell.grid || WORLD_CELL_GRID);
    cellAction.dataset.cellX = String(mapCell.x);
    cellAction.dataset.cellY = String(mapCell.y);
    cellAction.dataset.cellKey = String(mapCell.key || `${mapCell.grid}:${mapCell.x}:${mapCell.y}:${mapCell.prefectureCode || mapCell.regionCode || ''}`);
    cellAction.dataset.prefectureCode = String(mapCell.prefectureCode || mapCell.regionCode || '');
    cellAction.dataset.prefectureName = regionName;
    cellAction.setAttribute('aria-label', `${regionName}。セルボタン。クリックして内容を表示`);
  };

  const refreshVirtualCellButton = () => {
    if (!virtualCell || !cellAction || cellAction.hidden) return;
    setVirtualCellButton(virtualCell, cellAction.classList.contains('is-active'));
  };

  const selectMapCell = (event, mapCell, cell = null) => {
    if (!mapCell) return;
    if (isSelectingPostCell) {
      event?.preventDefault();
      event?.stopPropagation();
      if (!isJapanesePrefectureCell(mapCell)) {
        showToast('投稿は日本のセルを選んでください。');
        return;
      }
      isSelectingPostCell = false;
      openPostComposer({
        ...(cell ? { cell } : { mapCell }),
        returnFocus: cell || mapViewport
      });
      return;
    }
    const contentGroup = cellContentRegistry.get(mapCell.key || '');
    if (contentGroup?.items.length) {
      event?.preventDefault();
      event?.stopPropagation();
      popoverLocked = true;
      activateMapCluster(contentGroup.clusterId, { group: contentGroup, pin: cell || null });
      setVirtualCellButton(mapCell, true);
      return;
    }
    // 世界GeoJSONの国も内部的にはregionとして保持されるが、国セルを
    // 日本の県フォーカス処理へ流すと、海外セルを押しただけで倍率が変わる。
    // 県フォーカスは日本の固定セルだけに限定する。
    const region = isJapanesePrefectureCell(mapCell)
      ? prefectureGeometry.get(mapCell.prefectureCode)
      : null;
    if (region) {
      event?.preventDefault();
      event?.stopPropagation();
      activatePrefecture(region, region.ownerSVGElement, mapCell);
      setVirtualCellButton(mapCell, true);
      return;
    }
    if (!worldMapMode) return;
    event?.preventDefault();
    event?.stopPropagation();
    const projected = getVirtualCellProjection(mapCell);
    const point = projected?.projection?.center?.visible
      ? { x: projected.projection.center.x, y: projected.projection.center.y }
      : { x: 50, y: 50 };
    const regionName = getMapRegionName(mapCell.prefectureCode || mapCell.regionCode, 'この地域');
    showEmptyPrefecture(regionName, point, null, 0, 0, 0, mapCell);
    setVirtualCellButton(mapCell, true);
  };

  const scheduleVirtualCell = (event) => {
    if (!cellAction || event.pointerType === 'touch') return;
    const eventTarget = event.target instanceof Element ? event.target : null;
    const isVirtualActionTarget = eventTarget?.closest('[data-map-cell-action]');
    if (!isVirtualActionTarget
      && eventTarget?.closest('.map-popover, .japan-map__layers, .japan-map__controls, button, a, input, select, textarea')) return;
    if (mapViewport?.classList.contains('is-dragging')
      || mapViewport.classList.contains('is-rotating')
      || mapViewport.classList.contains('is-pinching')
      || mapViewport.classList.contains('is-zooming')) {
      hideVirtualCellButton(true);
      return;
    }
    pendingVirtualCellEvent = event;
    if (virtualCellFrame) return;
    virtualCellFrame = window.requestAnimationFrame(() => {
      virtualCellFrame = 0;
      const nextEvent = pendingVirtualCellEvent;
      pendingVirtualCellEvent = null;
      const mapCell = nextEvent ? getMapCellFromPoint(nextEvent) : null;
      if (mapCell) setVirtualCellButton(mapCell);
      else hideVirtualCellButton();
    });
  };

  mapViewport?.addEventListener('pointermove', scheduleVirtualCell, { passive: true });
  mapViewport?.addEventListener('pointerdown', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('[data-map-cell-action]')) hideVirtualCellButton(true);
  }, { passive: true });
  mapViewport?.addEventListener('pointerleave', () => hideVirtualCellButton(), { passive: true });
  cellAction?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    selectMapCell(event, virtualCell, cellAction);
  });

  mapViewport?.addEventListener('click', (event) => {
    const element = event.target instanceof Element ? event.target : null;
    const cell = element?.closest('[data-map-cell]');
    const mapCell = cell && mapViewport.contains(cell)
      ? {
        grid: Number(cell.dataset.cellGrid || String(cell.dataset.cellKey || '').split(':')[0]),
        x: Number(cell.dataset.cellX),
        y: Number(cell.dataset.cellY),
        prefectureCode: String(cell.dataset.prefectureCode || '').padStart(2, '0'),
        label: `${cell.dataset.prefectureName || 'この県'}のセル`,
        regionCode: 'JPN',
        key: cell.dataset.cellKey || ''
      }
      : getMapCellFromPoint(event);
    selectMapCell(event, mapCell, cell);
  });

  mapController = setupJapanMap(root, (view) => {
    currentGlobeView = view;
    currentMapScale = view.scale;
    if (!mapCanvas?.classList.contains('is-cell-map')) {
      updateGlobeMapProjection(assetHost?.querySelector('svg.japan-map__asset--world'), view);
    }
    updateGlobeCellProjection(view);
    renderCells(view.scale);
    refreshVirtualCellButton();
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

  const isWorldMap = root.dataset.mapScope === 'world' || root.querySelector('[data-map-scope="world"]');
  const worldOverviewScale = isWorldMap ? .22 : 1;
  const minScale = worldOverviewScale;
  const maxScale = 50;
  let scale = 1;
  let centerLongitude = WORLD_MAP_FOCUS_CENTER.longitude;
  let centerLatitude = WORLD_MAP_FOCUS_CENTER.latitude;
  let pointerId = null;
  let lastX = 0;
  let lastY = 0;
  let dragMoved = false;
  let pointerCaptured = false;
  let suppressClick = false;
  let interactionActive = false;
  let zoomEndTimer = 0;
  let focusAnimationFrame = 0;
  let focusLabel = '';
  let lastBaseMapSize = 0;
  const touchPointers = new Map();
  let pinchState = null;
  let renderFrame = 0;
  let resizeFrame = 0;
  let rotationFrame = 0;
  let rotationVelocityX = 0;
  let rotationVelocityY = 0;
  let lastPointerMoveAt = 0;

  const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
  const getBaseMapSize = () => Math.max(1, Math.min(viewport.clientWidth || 520, viewport.clientHeight || 520, 520));
  const getContentSize = () => getBaseMapSize() * scale;
  const getView = () => ({ scale, centerLongitude, centerLatitude });
  const cancelScheduledRender = () => {
    if (!renderFrame) return;
    window.cancelAnimationFrame(renderFrame);
    renderFrame = 0;
  };
  const cancelFocusAnimation = () => {
    if (focusAnimationFrame) {
      window.cancelAnimationFrame(focusAnimationFrame);
      focusAnimationFrame = 0;
    }
    viewport.classList.remove('is-focusing');
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
  const cancelRotationAnimation = () => {
    if (rotationFrame) {
      window.cancelAnimationFrame(rotationFrame);
      rotationFrame = 0;
    }
    rotationVelocityX = 0;
    rotationVelocityY = 0;
    viewport.classList.remove('is-rotating');
  };
  const startRotationAnimation = () => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      || document.documentElement.dataset.pixieedMotion === 'reduced') return false;
    const initialSpeed = Math.hypot(rotationVelocityX, rotationVelocityY);
    if (initialSpeed < .35) return false;
    cancelScheduledRender();
    viewport.classList.add('is-rotating');
    notifyInteractionStart();
    const startedAt = performance.now();
    let previousAt = startedAt;
    const animate = (now) => {
      const elapsed = Math.min(40, Math.max(8, now - previousAt));
      previousAt = now;
      const frameScale = elapsed / 16.667;
      rotateByPixels(rotationVelocityX * frameScale, rotationVelocityY * frameScale);
      const damping = Math.pow(.88, frameScale);
      rotationVelocityX *= damping;
      rotationVelocityY *= damping;
      scheduleRender();
      const speed = Math.hypot(rotationVelocityX, rotationVelocityY);
      if (speed < .08 || now - startedAt >= 960) {
        rotationFrame = 0;
        viewport.classList.remove('is-rotating');
        renderNow();
        notifyInteractionEnd();
        return;
      }
      rotationFrame = window.requestAnimationFrame(animate);
    };
    rotationFrame = window.requestAnimationFrame(animate);
    return true;
  };
  const beginZoomInteraction = () => {
    cancelRotationAnimation();
    notifyInteractionStart();
    viewport.classList.add('is-zooming');
    window.clearTimeout(zoomEndTimer);
    zoomEndTimer = window.setTimeout(() => {
      viewport.classList.remove('is-zooming');
      // ズーム中は既存Canvasを拡大して追従し、停止時に一度だけ高精細に描き直す。
      renderNow();
      notifyInteractionEnd();
    }, 180);
  };
  const rotateByPixels = (deltaX, deltaY) => {
    const sphereRadius = Math.max(40, getContentSize() * GLOBE_RADIUS_PERCENT / 100);
    // 横方向は緯度が高いほど同じ経度差の画面移動が小さくなる。
    // 地図の中心を指でつかんだ位置に保つため、球面の接線方向を補正する。
    const longitudeScale = Math.max(.2, Math.cos(centerLatitude * Math.PI / 180));
    centerLongitude = normalizeLongitude(centerLongitude - (Number(deltaX) / (sphereRadius * longitudeScale)) * (180 / Math.PI));
    centerLatitude = clamp(centerLatitude + (Number(deltaY) / sphereRadius) * (180 / Math.PI), -86, 86);
  };
  const render = () => {
    const mapSize = getBaseMapSize();
    const contentSize = mapSize * scale;
    root.querySelectorAll('[data-japan-map-canvas], .japan-map__canvas--wrap-tile').forEach((tile) => {
      tile.style.display = tile === canvas ? '' : 'none';
      tile.style.width = `${contentSize}px`;
      tile.style.height = `${contentSize}px`;
      tile.style.left = `${viewport.clientWidth / 2 - contentSize / 2}px`;
      tile.style.top = `${viewport.clientHeight / 2 - contentSize / 2}px`;
      tile.style.transform = 'none';
    });
    // 線はズーム値に反比例して細くする。球体の輪郭が太く見えないよう、
    // 最小値を設けて高倍率でも消えないようにする。
    const boundaryWidth = Math.max(.72, 1.25 / Math.max(.8, Math.sqrt(scale)));
    root.style.setProperty('--map-boundary-width', `${boundaryWidth}px`);
    viewport.classList.toggle('is-map-zoomed', scale > minScale + .0001);
    if (status) {
      const percent = Math.round(scale * 100);
      const label = focusLabel || (scale <= worldOverviewScale + .012 ? '世界全体' : Math.abs(scale - 1) < .0001 ? '日本' : scale < 1 ? '縮小' : '拡大');
      status.textContent = `${label} ${percent}%`;
    }
    lastBaseMapSize = mapSize;
    onScaleChange?.(getView());
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
  const zoomTo = (nextScale) => {
    beginZoomInteraction();
    cancelFocusAnimation();
    cancelRotationAnimation();
    focusLabel = '';
    scale = clamp(Number(nextScale) || scale, minScale, maxScale);
    renderNow();
  };
  const getZoomStep = () => {
    if (scale < .75) return .035;
    if (scale < 2) return .125;
    if (scale < 5) return .25;
    if (scale < 10) return .5;
    if (scale < 20) return 1.25;
    return 2.5;
  };
  const zoomBy = (direction) => zoomTo(scale + direction * getZoomStep());
  const isFineWheelInput = (event) => {
    if (event.deltaMode !== 0) return false;
    const deltaX = Math.abs(event.deltaX || 0);
    const deltaY = Math.abs(event.deltaY || 0);
    return (deltaY > 0 && deltaY < 96) || deltaX > 0;
  };
  const getWheelZoomFactor = (deltaY, deltaMode, fineInput = false) => {
    const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? Math.max(viewport.clientHeight, 320) : 1;
    const normalizedDelta = clamp(deltaY * unit, -180, 180);
    const sensitivity = fineInput ? 0.00058 : 0.00075;
    return Math.exp(-normalizedDelta * sensitivity);
  };
  const reset = () => {
    cancelFocusAnimation();
    cancelRotationAnimation();
    window.clearTimeout(zoomEndTimer);
    viewport.classList.remove('is-zooming');
    scale = 1;
    centerLongitude = WORLD_MAP_FOCUS_CENTER.longitude;
    centerLatitude = WORLD_MAP_FOCUS_CENTER.latitude;
    focusLabel = '';
    onReset();
    renderNow();
    notifyInteractionEnd();
  };
  const focusTo = (xPercent, yPercent, nextScale = 2.25, options = {}) => {
    const x = Number(xPercent);
    const y = Number(yPercent);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const targetCoordinate = getWorldCoordinateFromMapPoint({ x, y });
    const targetScale = clamp(Number(nextScale) || 2.25, minScale, maxScale);
    const targetLongitude = normalizeLongitude(targetCoordinate.longitude);
    const targetLatitude = clamp(targetCoordinate.latitude, -86, 86);
    focusLabel = String(options.label || '');
    cancelFocusAnimation();
    cancelRotationAnimation();
    window.clearTimeout(zoomEndTimer);
    viewport.classList.remove('is-zooming');
    notifyInteractionStart();
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const start = { scale, longitude: centerLongitude, latitude: centerLatitude };
    const longitudeDelta = getShortestLongitudeDelta(start.longitude, targetLongitude);
    if (reduceMotion || (Math.abs(targetScale - start.scale) < .001 && Math.abs(longitudeDelta) < .001 && Math.abs(targetLatitude - start.latitude) < .001)) {
      scale = targetScale;
      centerLongitude = targetLongitude;
      centerLatitude = targetLatitude;
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
      centerLongitude = normalizeLongitude(start.longitude + longitudeDelta * eased);
      centerLatitude = start.latitude + (targetLatitude - start.latitude) * eased;
      renderNow();
      if (progress < 1) {
        focusAnimationFrame = window.requestAnimationFrame(animate);
        return;
      }
      focusAnimationFrame = 0;
      scale = targetScale;
      centerLongitude = targetLongitude;
      centerLatitude = targetLatitude;
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
  viewport.addEventListener('click', (event) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  viewport.addEventListener('wheel', (event) => {
    const eventTarget = event.target instanceof Element ? event.target : null;
    if (eventTarget?.closest('.map-popover, .japan-map__region-picker')) return;
    const fineInput = isFineWheelInput(event);
    const horizontalIntent = event.shiftKey || Math.abs(event.deltaX || 0) > Math.abs(event.deltaY || 0) * 1.15;
    const horizontalDelta = horizontalIntent ? (Math.abs(event.deltaX || 0) > .5 ? event.deltaX : event.deltaY) : 0;
    const isAtOverview = scale <= minScale + .0001;
    if (isAtOverview && !fineInput && !horizontalDelta && !event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    if (horizontalDelta) {
      notifyInteractionStart();
      cancelFocusAnimation();
      beginZoomInteraction();
      rotateByPixels(clamp(horizontalDelta * (event.deltaMode === 1 ? 16 : 1), -160, 160), 0);
      renderNow();
      return;
    }
    zoomTo(scale * getWheelZoomFactor(event.deltaY, event.deltaMode, fineInput));
  }, { passive: false });
  viewport.addEventListener('dblclick', () => zoomBy(1));
  const updateTouchPointer = (event) => {
    if (event.pointerType === 'touch') touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };
  const getTouchPair = () => [...touchPointers.values()].slice(0, 2);
  const startPinch = () => {
    const pair = getTouchPair();
    if (pair.length < 2) return;
    const [first, second] = pair;
    pinchState = { distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)), scale };
    pointerId = null;
    pointerCaptured = false;
    dragMoved = true;
    cancelRotationAnimation();
    viewport.classList.remove('is-dragging');
    viewport.classList.add('is-pinching');
    beginZoomInteraction();
    cancelFocusAnimation();
  };
  viewport.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const eventTarget = event.target instanceof Element ? event.target : null;
    const interactiveTarget = eventTarget?.closest('button, a, input, select, textarea, [role="button"]');
    const virtualCellTarget = eventTarget?.closest('[data-map-cell-action]');
    if (interactiveTarget && !virtualCellTarget) {
      // セルと国・地域の図形は、クリック対象として優先する。
      // ここでドラッグ状態まで開始すると、小さなセル上のポインター移動が
      // パン扱いになり、クリックが抑制されることがある。
      if (!eventTarget?.closest('.prefecture, [data-map-cell]')) return;
      return;
    }
    updateTouchPointer(event);
    if (touchPointers.size >= 2) {
      startPinch();
      return;
    }
    notifyInteractionStart();
    cancelRotationAnimation();
    cancelFocusAnimation();
    pointerId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    dragMoved = false;
    pointerCaptured = false;
    rotationVelocityX = 0;
    rotationVelocityY = 0;
    lastPointerMoveAt = performance.now();
    viewport.classList.add('is-dragging');
  });
  viewport.addEventListener('pointermove', (event) => {
    updateTouchPointer(event);
    if (pinchState && touchPointers.size >= 2) {
      const pair = getTouchPair();
      const [first, second] = pair;
      const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      scale = clamp(pinchState.scale * distance / pinchState.distance, minScale, maxScale);
      beginZoomInteraction();
      scheduleRender();
      return;
    }
    if (event.pointerId !== pointerId) return;
    const deltaX = event.clientX - lastX;
    const deltaY = event.clientY - lastY;
    if (!dragMoved && Math.hypot(deltaX, deltaY) < 3) return;
    if (!pointerCaptured) {
      viewport.setPointerCapture(pointerId);
      pointerCaptured = true;
    }
    dragMoved = true;
    rotateByPixels(deltaX, deltaY);
    const now = performance.now();
    const elapsed = Math.max(8, now - lastPointerMoveAt || 16.667);
    const velocityScale = Math.min(2.2, 16.667 / elapsed);
    rotationVelocityX = clamp(rotationVelocityX * .65 + deltaX * velocityScale * .35, -12, 12);
    rotationVelocityY = clamp(rotationVelocityY * .65 + deltaY * velocityScale * .35, -12, 12);
    lastPointerMoveAt = now;
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
    const continued = dragMoved && event.type === 'pointerup' ? startRotationAnimation() : false;
    if (!continued) notifyInteractionEnd();
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
    cancelRotationAnimation();
    viewport.classList.remove('is-dragging', 'is-pinching');
    cancelScheduledRender();
    renderNow();
    notifyInteractionEnd();
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    touchPointers.clear();
    pinchState = null;
    pointerId = null;
    pointerCaptured = false;
    cancelRotationAnimation();
    viewport.classList.remove('is-dragging', 'is-pinching');
    cancelScheduledRender();
    renderNow();
    notifyInteractionEnd();
  }, { passive: true });
  viewport.addEventListener('keydown', (event) => {
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomBy(1); }
    if (event.key === '-') { event.preventDefault(); zoomBy(-1); }
    if (event.key === '0') { event.preventDefault(); reset(); }
    const pan = 28;
    if (event.key === 'ArrowLeft') { event.preventDefault(); cancelRotationAnimation(); cancelFocusAnimation(); rotateByPixels(-pan, 0); renderNow(); }
    if (event.key === 'ArrowRight') { event.preventDefault(); cancelRotationAnimation(); cancelFocusAnimation(); rotateByPixels(pan, 0); renderNow(); }
    if (event.key === 'ArrowUp') { event.preventDefault(); cancelRotationAnimation(); cancelFocusAnimation(); rotateByPixels(0, -pan); renderNow(); }
    if (event.key === 'ArrowDown') { event.preventDefault(); cancelRotationAnimation(); cancelFocusAnimation(); rotateByPixels(0, pan); renderNow(); }
  });
  const handleResize = () => {
    if (resizeFrame) return;
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = 0;
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
      <div class="site-menu__head"><div><span class="eyebrow">PiXiEED</span><h2 id="site-menu-title">メニュー</h2></div><button class="site-menu__close" type="button" data-menu-close aria-label="メニューを閉じる">×</button></div>
      <a class="site-menu__profile" href="/profile/" data-menu-link><span class="site-menu__avatar" aria-hidden="true">P</span><span><strong>自分のページ</strong><small>投稿・いいね・記録</small></span><span aria-hidden="true">›</span></a>
      <nav class="site-menu__nav" aria-label="補助メニュー">
        <div class="site-menu__group"><span class="site-menu__label">自分の記録</span><a href="/profile/?view=posts" data-menu-link>投稿した絵</a><a href="/profile/?view=likes" data-menu-link>いいねした作品</a><a href="/profile/?view=history" data-menu-link>読み取ったQR</a></div>
        <div class="site-menu__group"><span class="site-menu__label">探す</span><a href="/works/" data-menu-link>PiXiEEDの作品</a><a href="/stores/" data-menu-link>絵に会えるお店</a></div>
        <div class="site-menu__group"><span class="site-menu__label">参加する</span><a href="/?post=1" data-menu-link>ドット絵を投稿する</a><a href="/shops/" data-menu-link>お店として参加する</a></div>
        <div class="site-menu__group"><span class="site-menu__label">案内</span><a href="/about/" data-menu-link>PiXiEEDについて</a><a href="/guide/" data-menu-link>利用ガイド</a><a href="/privacy/" data-menu-link>プライバシー</a></div>
        <div class="site-menu__group"><span class="site-menu__label">設定</span><button type="button" data-menu-setting="display">表示設定</button><button type="button" data-menu-setting="privacy">プライバシー設定</button></div>
      </nav>
    </aside>
    <dialog class="site-settings" data-site-settings aria-labelledby="site-settings-title">
      <div class="site-settings__head"><div><span class="eyebrow">preferences</span><h2 id="site-settings-title">設定</h2></div><button class="site-settings__close" type="button" data-settings-close aria-label="設定を閉じる">×</button></div>
      <section data-settings-panel="display">
        <h3>表示設定</h3>
        <label class="site-settings__switch"><input type="checkbox" data-setting-motion><span><strong>動きを控えめにする</strong><small>地図の移動や画面切り替えを短くします。</small></span></label>
      </section>
      <section data-settings-panel="privacy" hidden>
        <h3>プライバシー設定</h3>
        <p>PiXiEEDでは、個人を特定しない形で訪問・ページ閲覧・QR読み取り・いいねなどの集計を行い、作品や地図を改善します。</p>
        <label class="site-settings__switch"><input type="checkbox" data-setting-analytics><span><strong>利用状況の集計を許可する</strong><small>オフにすると、この端末から新しい集計を送信しません。</small></span></label>
        <button class="button button--quiet" type="button" data-settings-clear>この端末の解析記録を削除</button>
        <p class="site-settings__status" data-settings-status role="status"></p>
      </section>
      <div class="site-settings__actions"><button class="button button--primary" type="button" data-settings-close>閉じる</button></div>
    </dialog>`;
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
  const page = document.body.dataset.page || 'home';
  const actions = {
    map: '<button type="button" data-page-action="post" aria-label="ドット絵を投稿する"><img src="/assets/icons/pixieed/add.svg" alt=""></button>',
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
  const openGlobeComposer = () => {
    const globe = document.querySelector('.map-hero__globe-frame');
    if (!globe) return;
    const open = () => globe.contentWindow?.__PIXIEED_POSTS__?.openComposer?.();
    if (globe.contentWindow?.__PIXIEED_POSTS__) open();
    else globe.addEventListener('load', open, { once: true });
  };
  tabs.querySelector('[data-page-action="post"]')?.addEventListener('click', openGlobeComposer);
  if (page === 'map' && new URLSearchParams(window.location.search).get('post') === '1') {
    window.requestAnimationFrame(openGlobeComposer);
  }
  const toolAction = tabs.querySelector('[data-page-action="tools"]');
  const firstPublishedTool = document.querySelector('.tool-grid a[href], .tool-grid button:not([disabled])');
  if (toolAction && firstPublishedTool) {
    toolAction.disabled = false;
    toolAction.removeAttribute('aria-disabled');
    toolAction.addEventListener('click', () => firstPublishedTool.click());
  }

  const footerLinks = document.querySelector('.footer-links');
  if (footerLinks) footerLinks.innerHTML = '<a href="/shops/">お店として参加</a><a href="/about/">PiXiEEDについて</a><a href="/guide/">利用ガイド</a><a href="/privacy/">プライバシー</a>';
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
  const settings = document.querySelector('[data-site-settings]');
  const motionSetting = settings?.querySelector('[data-setting-motion]');
  const analyticsSetting = settings?.querySelector('[data-setting-analytics]');
  const settingsStatus = settings?.querySelector('[data-settings-status]');
  const openSettings = (mode = 'display') => {
    if (!settings) return;
    setMenuOpen(false);
    settings.querySelectorAll('[data-settings-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.settingsPanel !== mode;
    });
    motionSetting.checked = applyMotionPreference();
    analyticsSetting.checked = isAnalyticsAllowed();
    if (settingsStatus) settingsStatus.textContent = '';
    if (!settings.open) settings.showModal();
  };
  menu?.querySelectorAll('[data-menu-setting]').forEach((button) => button.addEventListener('click', () => openSettings(button.dataset.menuSetting || 'display')));
  settings?.querySelectorAll('[data-settings-close]').forEach((button) => button.addEventListener('click', () => settings.close()));
  settings?.addEventListener('click', (event) => { if (event.target === settings) settings.close(); });
  motionSetting?.addEventListener('change', () => {
    try { localStorage.setItem(MOTION_PREFERENCE_KEY, motionSetting.checked ? 'reduced' : 'full'); } catch { /* storage may be blocked */ }
    applyMotionPreference();
  });
  analyticsSetting?.addEventListener('change', () => {
    const allowed = analyticsSetting.checked;
    try { localStorage.setItem(ANALYTICS_CONSENT_KEY, allowed ? 'granted' : 'denied'); } catch { /* storage may be blocked */ }
    if (!allowed) {
      analyticsQueue.splice(0);
      analyticsTrackEvent = null;
      analyticsPromise = null;
      void import('./analytics.js?rev=20260918-privacy-v2').then(({ clearAnalyticsData }) => clearAnalyticsData()).catch(() => {});
      if (settingsStatus) settingsStatus.textContent = 'この端末から新しい解析データを送らない設定にしました。';
    } else {
      if (settingsStatus) settingsStatus.textContent = '利用状況の集計を再び許可しました。';
      scheduleAnalytics();
    }
  });
  settings?.querySelector('[data-settings-clear]')?.addEventListener('click', () => {
    analyticsSetting.checked = false;
    try { localStorage.setItem(ANALYTICS_CONSENT_KEY, 'denied'); } catch { /* storage may be blocked */ }
    analyticsQueue.splice(0);
    analyticsTrackEvent = null;
    analyticsPromise = null;
    void import('./analytics.js?rev=20260918-privacy-v2').then(({ clearAnalyticsData }) => clearAnalyticsData()).catch(() => {});
    if (settingsStatus) settingsStatus.textContent = 'この端末に保存していた解析用の識別子を削除しました。';
  });
  applyMotionPreference();
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
        ? '<div class="profile-record"><strong>投稿した絵</strong><p>投稿したドット絵は、確認後に地球儀のセルへ現れます。</p><a class="button button--primary" href="/?post=1">地球儀に置く</a></div>'
        : `<div class="profile-grid"><a class="profile-card" href="/works/"><span class="eyebrow">official works</span><strong>${officialWorks.length}作品</strong><span>PiXiEEDの作品を見る</span></a><a class="profile-card" href="/collection/"><span class="eyebrow">your finds</span><strong>${found.length}作品</strong><span>見つけた記録を見る</span></a><a class="profile-card" href="/?post=1"><span class="eyebrow">participate</span><strong>投稿する</strong><span>街の地図に作品を置く</span></a></div>`;
  root.innerHTML = `<div class="profile-head"><div><span class="eyebrow">your space</span><h1>自分のページ</h1><p class="lead">見つけた作品や、これから参加する方法をここにまとめます。</p></div><div class="profile-avatar" aria-hidden="true">P</div></div><nav class="profile-tabs" aria-label="自分のページ内メニュー"><a href="/profile/"${view === 'home' ? ' aria-current="page"' : ''}>概要</a><a href="/profile/?view=posts"${view === 'posts' ? ' aria-current="page"' : ''}>投稿した絵</a><a href="/profile/?view=likes"${view === 'likes' ? ' aria-current="page"' : ''}>いいね</a><a href="/profile/?view=history"${view === 'history' ? ' aria-current="page"' : ''}>履歴</a></nav><section class="profile-content"><h2>${viewTitle}</h2>${viewBody}</section><p class="profile-note">見つけた作品と表示設定は、この端末に保存されます。投稿は確認後に地球儀へ表示されます。</p>`;
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
  loadCachedUserMapPosts();
  renderPublicDataSurfaces();
  scheduleAnalytics();
  startPublicDataRefresh();
  const result = await hydrateSiteData();
  if (result.changed) renderPublicDataSurfaces();
}

void boot();
