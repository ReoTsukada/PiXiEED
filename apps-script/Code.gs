/*
 * PiXiEED Google Apps Script endpoint
 *
 * 1. このファイルをGoogleスプレッドシートの拡張機能 > Apps Scriptへ貼り付ける
 * 2. SPREADSHEET_IDを対象シートのIDに差し替える
 * 3. setupPiXiEEDSheets()を一度実行する
 * 4. ウェブアプリとしてデプロイし、公開URLをsite-config.jsへ設定する
 *
 * doPostは公開サイトの匿名イベント受付だけを担当します。
 * 管理操作はGoogle Sheets APIを、管理者のGoogle OAuthトークンで直接行います。
 */
const CONFIG = {
  SPREADSHEET_ID: 'PASTE_GOOGLE_SPREADSHEET_ID_HERE',
  RAW_EVENTS: 'AnalyticsRaw',
  DAILY_EVENTS: 'AnalyticsDaily',
  PUBLISHED_WORKS: 'PublishedWorks',
  PUBLISHED_STORES: 'PublishedStores',
  PUBLISHED_STORE_WORKS: 'PublishedStoreWorks',
  EVENTS: 'Events',
  PUBLISHED_EVENTS: 'PublishedEvents',
  EVENT_SOURCES: 'EventSources'
};

const EVENT_HEADERS = [
  'event_id', 'occurred_at', 'event_name', 'visitor_id', 'session_id', 'path', 'page',
  'work_id', 'store_id', 'qr_id', 'referrer_host', 'language', 'viewport', 'device', 'depth', 'duration_ms'
];

const DAILY_HEADERS = [
  'date', 'metric', 'dimension_type', 'dimension_id', 'count', 'unique_visitors', 'unique_sessions'
];

const DATA_HEADERS = {
  Works: ['id', 'title', 'subtitle', 'story', 'image', 'tags', 'palette', 'edition', 'price_label', 'availability', 'limited', 'published', 'sort_order'],
  Stores: ['id', 'name', 'area', 'description', 'limited_work_id', 'status', 'address', 'hours', 'route', 'lat', 'lng', 'place_id', 'google_maps_url', 'map_x', 'map_y', 'published', 'sort_order'],
  StoreWorks: ['store_id', 'work_id', 'sale_status', 'display_price', 'is_limited', 'published'],
  PublishedWorks: ['id', 'title', 'subtitle', 'story', 'image', 'tags', 'palette', 'edition', 'price_label', 'availability', 'limited', 'published', 'sort_order'],
  PublishedStores: ['id', 'name', 'area', 'description', 'limited_work_id', 'status', 'address', 'hours', 'route', 'lat', 'lng', 'place_id', 'google_maps_url', 'map_x', 'map_y', 'published', 'sort_order'],
  PublishedStoreWorks: ['store_id', 'work_id', 'sale_status', 'display_price', 'is_limited', 'published'],
  Events: ['id', 'name', 'short_name', 'prefecture', 'area', 'description', 'date_label', 'start_date', 'end_date', 'last_held_date', 'venue', 'status', 'source_label', 'source_url', 'map_x', 'map_y', 'kind', 'published', 'sort_order'],
  PublishedEvents: ['id', 'name', 'short_name', 'prefecture', 'area', 'description', 'date_label', 'start_date', 'end_date', 'last_held_date', 'venue', 'status', 'source_label', 'source_url', 'map_x', 'map_y', 'kind', 'published', 'sort_order']
};

const EVENT_SOURCE_HEADERS = [
  'id', 'name', 'source_url', 'source_type', 'prefecture', 'area', 'kind', 'keywords',
  'source_label', 'enabled', 'auto_publish', 'last_checked_at', 'last_success_at', 'last_error'
];

// 公式サイトがRSS/iCal/JSON-LDを公開している場合は、この一覧から定期取得できる。
// auto_publish=falseの情報はEventsに入るが、PublishedEventsには反映しない。
const DEFAULT_EVENT_SOURCES = [
  ['pixel-art-park', 'Pixel Art Park', 'https://pixelartpark.com/', 'jsonld', '神奈川県', '横浜・みなとみらい', 'pixel-art', 'ドット|pixel|ピクセル|chiptune', '公式サイト', 'TRUE', 'TRUE', '', '', ''],
  ['shibuya-pixel-art', 'SHIBUYA PIXEL ART', 'https://pixel-art.jp/', 'jsonld', '東京都', '東京・渋谷', 'pixel-art', 'ドット|pixel|ピクセル', '公式サイト', 'TRUE', 'FALSE', '', '', ''],
  ['dot-daisakusen', '冬休みドット大作戦', 'https://dot-daisakusen.com/', 'jsonld', '東京都', '東京・足立', 'pixel-art', 'ドット|pixel|ピクセル', '公式サイト', 'TRUE', 'TRUE', '', '', ''],
  ['kyushu-pixel-marche', '九州ピクセルマルシェ', 'https://pixel-marche.com/', 'jsonld', '福岡県', '福岡・天神', 'pixel-art', 'ドット|pixel|ピクセル', '公式サイト', 'TRUE', 'FALSE', '', '', ''],
  ['crosspico-nagoya', 'クロスピコナゴヤ', 'https://sites.google.com/view/crosspico', 'jsonld', '愛知県', '名古屋・錦', 'pixel-art', 'ドット|pixel|ピクセル|ゲーム', '公式ページ', 'TRUE', 'FALSE', '', '', ''],
  ['sapporo-game-odyssey', 'SAPPORO GAME ODYSSEY', 'https://www.sapporo-game-odyssey.jp/', 'jsonld', '北海道', '札幌・大通', 'indie-game', 'インディー|ゲーム|ドット|pixel', '公式サイト', 'TRUE', 'FALSE', '', '', ''],
  ['sapporo-game-camp', 'Sapporo Game Camp', 'https://sapporo-game-camp.com/2026/', 'jsonld', '北海道', '札幌・サッポロファクトリー', 'indie-game', 'ゲーム|ドット|pixel|デジタル', '公式サイト', 'TRUE', 'FALSE', '', '', ''],
  ['hokkaido-comitia', '北海道COMITIA', 'https://elysian.dojin.com/h-comitia/summary.html', 'jsonld', '北海道', '札幌・東札幌', 'creator-market', '創作|ゲーム|グッズ|ドット|pixel', '公式サイト', 'TRUE', 'FALSE', '', '', ''],
  ['gamepavilion-jp', 'ゲームパビリオンjp', 'https://gamepavilion.jp/', 'jsonld', '大阪府', '大阪・京セラドーム', 'indie-game', 'インディー|ゲーム|ドット|pixel', '公式サイト', 'TRUE', 'FALSE', '', '', ''],
  ['bitsummit', 'BitSummit', 'https://bitsummit.org/', 'jsonld', '京都府', '京都・みやこめっせ', 'indie-game', 'インディー|ゲーム|ドット|pixel', '公式サイト', 'TRUE', 'FALSE', '', '', ''],
  ['kansai-comitia', '関西COMITIA', 'https://www.k-comitia.com/', 'jsonld', '京都府', '京都・パルスプラザ', 'creator-market', '創作|ゲーム|グッズ|ドット|pixel', '公式サイト', 'TRUE', 'FALSE', '', '', ''],
  ['michinoku-comitia', 'みちのくCOMITIA', 'https://adv-kikaku.com/', 'jsonld', '福島県', '福島・郡山', 'creator-market', '創作|ゲーム|グッズ|ドット|pixel', '公式サイト', 'TRUE', 'FALSE', '', '', ''],
  ['kyushu-comitia', '九州コミティア', 'https://www.q-comitia.com/', 'jsonld', '福岡県', '北九州・小倉', 'creator-market', '創作|ゲーム|グッズ|ドット|pixel', '公式サイト', 'TRUE', 'FALSE', '', '', ''],
  ['niigata-comitia', '新潟コミティア', 'https://gataket.com/comitia/e/', 'jsonld', '新潟県', '新潟・産業振興センター', 'creator-market', '創作|ゲーム|グッズ|ドット|pixel', '公式サイト', 'TRUE', 'FALSE', '', '', '']
];

const PREFECTURE_MAP_POINTS = {
  北海道: [74, 18], 青森県: [72, 29], 岩手県: [72, 38], 宮城県: [69, 44], 秋田県: [66, 35], 山形県: [66, 43], 福島県: [61, 55.5],
  茨城県: [63, 59], 栃木県: [61, 58], 群馬県: [59, 58], 埼玉県: [61, 62], 千葉県: [63, 62], 東京都: [58.5, 66.5], 神奈川県: [58.6, 68.6],
  新潟県: [58.1, 48.1], 富山県: [53, 54], 石川県: [51, 52], 福井県: [49, 55], 山梨県: [59, 61], 長野県: [55, 59], 岐阜県: [52, 60],
  静岡県: [55, 65], 愛知県: [45.8, 69.1], 三重県: [50, 66], 滋賀県: [48, 61], 京都府: [39.5, 69.5], 大阪府: [36.7, 70.8], 兵庫県: [43, 64],
  奈良県: [45, 67], 和歌山県: [42, 70], 鳥取県: [38, 58], 島根県: [36, 58], 岡山県: [38, 65], 広島県: [35, 67], 山口県: [32, 67],
  徳島県: [39, 74], 香川県: [36, 74], 愛媛県: [32, 74], 高知県: [32, 79], 福岡県: [12, 78], 佐賀県: [27, 72], 長崎県: [25, 75],
  熊本県: [24, 79], 大分県: [27, 77], 宮崎県: [25, 83], 鹿児島県: [21, 82], 沖縄県: [13, 88]
};

const ALLOWED_EVENTS = [
  'session_start', 'page_view', 'page_leave', 'engaged_view', 'scroll_depth',
  'qr_scan', 'qr_unique_session', 'work_open', 'work_like', 'work_unlike',
  'work_found', 'work_unfound', 'work_share', 'store_open', 'store_pin_open', 'map_open'
];

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function getSpreadsheet_() {
  if (!CONFIG.SPREADSHEET_ID || CONFIG.SPREADSHEET_ID.indexOf('PASTE_') === 0) throw new Error('SPREADSHEET_ID is not configured');
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function ensureSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sheet;
}

function setupPiXiEEDSheets() {
  const spreadsheet = getSpreadsheet_();
  ensureSheet_(spreadsheet, CONFIG.RAW_EVENTS, EVENT_HEADERS);
  ensureSheet_(spreadsheet, CONFIG.DAILY_EVENTS, DAILY_HEADERS);
  Object.keys(DATA_HEADERS).forEach((name) => ensureSheet_(spreadsheet, name, DATA_HEADERS[name]));
  const sourceSheet = ensureSheet_(spreadsheet, CONFIG.EVENT_SOURCES, EVENT_SOURCE_HEADERS);
  const existingSourceIds = new Set(table_(sourceSheet).map((row) => String(row.id || '').trim()).filter(Boolean));
  const missingSources = DEFAULT_EVENT_SOURCES.filter((row) => !existingSourceIds.has(String(row[0])));
  if (missingSources.length) sourceSheet.getRange(sourceSheet.getLastRow() + 1, 1, missingSources.length, EVENT_SOURCE_HEADERS.length).setValues(missingSources);
}

// 初回設定後に一度だけ実行すると、6時間ごとのイベント更新を登録する。
function installPiXiEEDTriggers() {
  ScriptApp.getProjectTriggers().filter((trigger) => trigger.getHandlerFunction() === 'syncEventsFromSources').forEach((trigger) => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger('syncEventsFromSources').timeBased().everyHours(6).create();
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!ALLOWED_EVENTS.includes(String(payload.event_name || ''))) return json_({ ok: false, error: 'event_not_allowed' });
    const spreadsheet = getSpreadsheet_();
    const sheet = ensureSheet_(spreadsheet, CONFIG.RAW_EVENTS, EVENT_HEADERS);
    const row = EVENT_HEADERS.map((header) => String(payload[header] || '').slice(0, 500));
    const lock = LockService.getScriptLock();
    lock.waitLock(5000);
    try { sheet.appendRow(row); } finally { lock.releaseLock(); }
    return json_({ ok: true });
  } catch (error) {
    return json_({ ok: false, error: String(error.message || error) });
  }
}

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'public-data';
  if (action === 'public-data') return json_(getPublicData_());
  return json_({ ok: false, error: 'action_not_allowed' });
}

function table_(sheet) {
  if (!sheet || sheet.getLastRow() < 1) return [];
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values.shift();
  return values.filter((row) => row.some((value) => value !== '')).map((row) => headers.reduce((object, header, index) => { object[header] = row[index] || ''; return object; }, {}));
}

function rows_(spreadsheet, name) {
  return table_(spreadsheet.getSheetByName(name));
}

function split_(value) {
  return String(value || '').split(/[|,、]/).map((item) => item.trim()).filter(Boolean);
}

function numberOrNull_(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boolean_(value) {
  return ['true', '1', 'yes', '公開', 'published'].includes(String(value || '').trim().toLowerCase());
}

function todayString_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Tokyo', 'yyyy-MM-dd');
}

function prefecturePoint_(prefecture) {
  return PREFECTURE_MAP_POINTS[String(prefecture || '').trim()] || [50, 50];
}

function normalizeDate_(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return Utilities.formatDate(parsed, Session.getScriptTimeZone() || 'Asia/Tokyo', 'yyyy-MM-dd');
}

function dateLabel_(startDate, endDate) {
  const start = normalizeDate_(startDate);
  const end = normalizeDate_(endDate) || start;
  if (!start) return '日程未定';
  const format = (value) => {
    const parts = value.split('-');
    return `${Number(parts[0])}年${Number(parts[1])}月${Number(parts[2])}日`;
  };
  return start === end ? format(start) : `${format(start)}〜${format(end)}`;
}

function eventKeywordsMatch_(event, source) {
  const keywords = String(source.keywords || '').split(/[|,、]/).map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!keywords.length) return true;
  const haystack = [event.name, event.description, event.kind].join(' ').toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}

function eventId_(source, raw, startDate) {
  const identity = [raw.uid, raw.id, raw.url, raw.link, raw.name, raw.title, startDate].filter(Boolean).join('|');
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, `${source.id}|${identity}`);
  const hash = digest.map((byte) => ((byte + 256) % 256).toString(16).padStart(2, '0')).join('');
  return `auto-${source.id}-${hash.slice(0, 16)}`;
}

function locationParts_(location) {
  if (!location) return { name: '', address: '', prefecture: '' };
  if (Array.isArray(location)) return locationParts_(location[0]);
  if (typeof location === 'string') return { name: '', address: location, prefecture: '' };
  const address = location.address;
  const addressText = typeof address === 'string' ? address : String(address?.streetAddress || address?.addressLocality || address?.addressRegion || '');
  const prefecture = typeof address === 'object' ? String(address.addressRegion || '') : '';
  return { name: String(location.name || ''), address: addressText, prefecture };
}

function normalizeEventRecord_(raw, source) {
  const location = locationParts_(raw.location || raw.venue);
  const startDate = normalizeDate_(raw.startDate || raw.start_date || raw.dtstart || raw.date);
  const endDate = normalizeDate_(raw.endDate || raw.end_date || raw.dtend || startDate);
  const name = String(raw.name || raw.title || '').trim();
  if (!name || !startDate) return null;
  const prefecture = String(raw.prefecture || location.prefecture || source.prefecture || '').trim();
  const point = prefecturePoint_(prefecture);
  const event = {
    id: eventId_(source, raw, startDate),
    name,
    short_name: String(raw.shortName || raw.short_name || name).trim(),
    prefecture,
    area: String(raw.area || source.area || location.name || '').trim(),
    description: String(raw.description || raw.summary || '').replace(/\s+/g, ' ').trim(),
    date_label: dateLabel_(startDate, endDate),
    start_date: startDate,
    end_date: endDate || startDate,
    last_held_date: normalizeDate_(raw.lastHeldDate || raw.last_held_date),
    venue: String(raw.venue || location.name || location.address || source.area || '').trim(),
    status: endDate && endDate < todayString_() ? 'past' : 'upcoming',
    source_label: String(source.source_label || source.name || '公式情報').trim(),
    source_url: String(raw.url || raw.link || source.source_url || '').trim(),
    map_x: numberOrNull_(raw.map_x || raw.mapX) || point[0],
    map_y: numberOrNull_(raw.map_y || raw.mapY) || point[1],
    kind: String(raw.kind || source.kind || 'pixel-art').trim(),
    published: boolean_(source.auto_publish) ? 'TRUE' : 'FALSE',
    sort_order: startDate
  };
  return eventKeywordsMatch_(event, source) ? event : null;
}

function parseIcsDate_(value) {
  const raw = String(value || '').replace(/^TZID=[^:;]+:/, '').trim();
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  return compact ? `${compact[1]}-${compact[2]}-${compact[3]}` : normalizeDate_(raw);
}

function parseIcs_(body, source) {
  const lines = String(body || '').replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const records = [];
  let current = null;
  lines.forEach((line) => {
    if (line === 'BEGIN:VEVENT') { current = {}; return; }
    if (line === 'END:VEVENT') {
      if (current) records.push(current);
      current = null;
      return;
    }
    if (!current) return;
    const separator = line.indexOf(':');
    if (separator < 0) return;
    const key = line.slice(0, separator).split(';')[0].toLowerCase();
    const value = line.slice(separator + 1).replace(/\\n/g, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';');
    if (key === 'uid') current.uid = value;
    if (key === 'summary') current.name = value;
    if (key === 'description') current.description = value;
    if (key === 'dtstart') current.startDate = parseIcsDate_(value);
    if (key === 'dtend') current.endDate = parseIcsDate_(value);
    if (key === 'location') current.venue = value;
    if (key === 'url') current.url = value;
  });
  return records.map((record) => normalizeEventRecord_(record, source)).filter(Boolean);
}

function xmlChildren_(element, names, output) {
  const wanted = names.map((name) => String(name).toLowerCase());
  element.getChildren().forEach((child) => {
    const localName = child.getName().getLocalName().toLowerCase();
    if (wanted.includes(localName)) output.push(child);
    xmlChildren_(child, names, output);
  });
}

function xmlValue_(element, names) {
  const matches = [];
  xmlChildren_(element, names, matches);
  return matches.length ? matches[0].getText() : '';
}

function xmlLink_(element) {
  const links = [];
  xmlChildren_(element, ['link'], links);
  for (const link of links) {
    const href = link.getAttribute('href');
    if (href) return href.getValue();
    if (link.getText()) return link.getText();
  }
  return '';
}

function parseXmlFeed_(body, source) {
  const document = XmlService.parse(body);
  const entries = [];
  xmlChildren_(document.getRootElement(), ['item', 'entry'], entries);
  return entries.map((entry) => normalizeEventRecord_({
    uid: xmlValue_(entry, ['guid', 'id']),
    name: xmlValue_(entry, ['title']),
    description: xmlValue_(entry, ['description', 'summary', 'content']),
    startDate: xmlValue_(entry, ['startDate', 'start_date', 'eventDate', 'event_date', 'date']),
    endDate: xmlValue_(entry, ['endDate', 'end_date']),
    venue: xmlValue_(entry, ['venue', 'location']),
    url: xmlLink_(entry)
  }, source)).filter(Boolean);
}

function collectJsonLdEvents_(value, output) {
  if (Array.isArray(value)) { value.forEach((item) => collectJsonLdEvents_(item, output)); return; }
  if (!value || typeof value !== 'object') return;
  const type = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
  if (type.some((item) => String(item || '').toLowerCase() === 'event')) output.push(value);
  if (value['@graph']) collectJsonLdEvents_(value['@graph'], output);
  ['events', 'items', 'results'].forEach((key) => { if (value[key]) collectJsonLdEvents_(value[key], output); });
}

function parseJsonLd_(body, source) {
  const matches = [];
  const pattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(body))) matches.push(match[1].trim());
  if (!matches.length) throw new Error('JSON-LDが見つかりません');
  const rawEvents = [];
  matches.forEach((json) => { try { collectJsonLdEvents_(JSON.parse(json), rawEvents); } catch (_) { /* invalid JSON-LD block */ } });
  return rawEvents.map((raw) => normalizeEventRecord_(raw, source)).filter(Boolean);
}

function parseJsonFeed_(body, source) {
  const parsed = JSON.parse(body);
  const items = Array.isArray(parsed) ? parsed : (parsed.events || parsed.items || parsed.results || []);
  return items.map((item) => normalizeEventRecord_(item, source)).filter(Boolean);
}

function fetchEventSource_(source) {
  const response = UrlFetchApp.fetch(String(source.source_url || '').trim(), {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: { 'User-Agent': 'PiXiEED Event Index/1.0' }
  });
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) throw new Error(`HTTP ${code}`);
  const body = response.getContentText();
  const type = String(source.source_type || 'jsonld').toLowerCase();
  if (type === 'ics' || type === 'ical' || type === 'icalendar') return parseIcs_(body, source);
  if (type === 'rss' || type === 'atom' || type === 'xml') return parseXmlFeed_(body, source);
  if (type === 'json') return parseJsonFeed_(body, source);
  return parseJsonLd_(body, source);
}

function writeObjectTable_(sheet, headers, rows) {
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (!rows.length) return;
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows.map((row) => headers.map((header) => row[header] || '')));
}

function publishEventsOnly_(spreadsheet) {
  const sourceSheet = ensureSheet_(spreadsheet, CONFIG.EVENTS, DATA_HEADERS.Events);
  const targetSheet = ensureSheet_(spreadsheet, CONFIG.PUBLISHED_EVENTS, DATA_HEADERS.PublishedEvents);
  const rows = table_(sourceSheet).filter((row) => boolean_(row.published));
  writeObjectTable_(targetSheet, DATA_HEADERS.PublishedEvents, rows);
}

function syncEventsFromSources() {
  const spreadsheet = getSpreadsheet_();
  const sourceSheet = ensureSheet_(spreadsheet, CONFIG.EVENT_SOURCES, EVENT_SOURCE_HEADERS);
  const eventSheet = ensureSheet_(spreadsheet, CONFIG.EVENTS, DATA_HEADERS.Events);
  const sourceRows = table_(sourceSheet);
  const eventRows = table_(eventSheet);
  const eventById = new Map(eventRows.filter((row) => row.id).map((row) => [row.id, row]));
  const eventOrder = eventRows.map((row) => row.id).filter(Boolean);

  sourceRows.forEach((source) => {
    if (!boolean_(source.enabled)) return;
    const checkedAt = new Date().toISOString();
    source.last_checked_at = checkedAt;
    source.last_error = '';
    try {
      const records = fetchEventSource_(source);
      const sourcePrefix = `auto-${source.id}-`;
      const seen = new Set(records.map((record) => record.id));
      records.forEach((record) => {
        const previous = eventById.get(record.id) || {};
        const next = { ...previous, ...record };
        if (!boolean_(source.auto_publish) && previous.published) next.published = previous.published;
        eventById.set(record.id, next);
        if (!eventOrder.includes(record.id)) eventOrder.push(record.id);
      });
      if (records.length) {
        for (let index = eventOrder.length - 1; index >= 0; index -= 1) {
          const id = eventOrder[index];
          if (id.startsWith(sourcePrefix) && !seen.has(id)) {
            const previous = eventById.get(id);
            const previousEnd = normalizeDate_(previous?.end_date || previous?.start_date);
            if (previous && previousEnd && previousEnd < todayString_()) {
              previous.status = previous.status === 'watch' ? 'watch' : 'past';
              eventById.set(id, previous);
              continue;
            }
            eventOrder.splice(index, 1);
            eventById.delete(id);
          }
        }
      }
      source.last_success_at = checkedAt;
    } catch (error) {
      source.last_error = String(error.message || error).slice(0, 500);
    }
  });

  const nextRows = eventOrder.map((id) => eventById.get(id)).filter(Boolean);
  writeObjectTable_(eventSheet, DATA_HEADERS.Events, nextRows);
  writeObjectTable_(sourceSheet, EVENT_SOURCE_HEADERS, sourceRows);
  publishEventsOnly_(spreadsheet);
}

function getPublicData_() {
  const spreadsheet = getSpreadsheet_();
  const workRows = rows_(spreadsheet, CONFIG.PUBLISHED_WORKS);
  const storeRows = rows_(spreadsheet, CONFIG.PUBLISHED_STORES);
  const relationRows = rows_(spreadsheet, CONFIG.PUBLISHED_STORE_WORKS);
  // 過去開催もPiXiEEDの記録として公開する。公開/非公開はシートのpublished列で管理する。
  const eventRows = rows_(spreadsheet, CONFIG.PUBLISHED_EVENTS).filter((row) => boolean_(row.published));
  const works = workRows.map((row) => ({
    id: row.id, title: row.title, subtitle: row.subtitle, story: row.story, image: row.image,
    tags: split_(row.tags), palette: row.palette, edition: row.edition, priceLabel: row.price_label,
    availability: row.availability, stores: relationRows.filter((relation) => relation.store_id && relation.work_id === row.id && boolean_(relation.published)).map((relation) => relation.store_id),
    limited: boolean_(row.limited), sample: false
  }));
  const stores = storeRows.map((row) => ({
    id: row.id, name: row.name, area: row.area, description: row.description, limitedWork: row.limited_work_id || null,
    status: row.status, address: row.address, hours: row.hours, route: row.route,
    location: { lat: numberOrNull_(row.lat), lng: numberOrNull_(row.lng), placeId: row.place_id, googleMapsUrl: row.google_maps_url },
    mapPosition: { x: numberOrNull_(row.map_x) || 50, y: numberOrNull_(row.map_y) || 50 },
    works: relationRows.filter((relation) => relation.store_id === row.id && boolean_(relation.published)).map((relation) => relation.work_id),
    sample: false
  }));
  const events = eventRows.map((row) => ({
    id: row.id, name: row.name, shortName: row.short_name, prefecture: row.prefecture, area: row.area,
    description: row.description, dateLabel: row.date_label, startDate: row.start_date, endDate: row.end_date, lastHeldDate: row.last_held_date,
    venue: row.venue, status: row.status || 'upcoming', sourceLabel: row.source_label, sourceUrl: row.source_url,
    mapPosition: { x: numberOrNull_(row.map_x) || prefecturePoint_(row.prefecture)[0], y: numberOrNull_(row.map_y) || prefecturePoint_(row.prefecture)[1] }, kind: row.kind
  }));
  return { version: new Date().toISOString(), works, stores, events };
}

function rollupAnalytics() {
  const spreadsheet = getSpreadsheet_();
  const rawRows = rows_(spreadsheet, CONFIG.RAW_EVENTS);
  const timezone = Session.getScriptTimeZone() || 'Asia/Tokyo';
  const global = {};
  const dimensions = {};
  const dailyPeople = {};
  const ensure = (container, key, date, metric, dimensionType, dimensionId) => {
    if (!container[key]) container[key] = { date, metric, dimension_type: dimensionType || '', dimension_id: dimensionId || '', count: 0, visitors: {}, sessions: {} };
    return container[key];
  };
  rawRows.forEach((row) => {
    const date = Utilities.formatDate(new Date(row.occurred_at || new Date()), timezone, 'yyyy-MM-dd');
    const visitor = row.visitor_id || 'unknown';
    const session = row.session_id || 'unknown';
    if (!dailyPeople[date]) dailyPeople[date] = { visitors: {}, sessions: {} };
    dailyPeople[date].visitors[visitor] = true;
    dailyPeople[date].sessions[session] = true;
    const globalKey = `${date}|${row.event_name}`;
    const globalMetric = ensure(global, globalKey, date, row.event_name, '', '');
    globalMetric.count += 1; globalMetric.visitors[visitor] = true; globalMetric.sessions[session] = true;
    const mapped = {
      qr_scan: ['qr_scans', 'qr', row.qr_id], qr_unique_session: ['qr_unique_sessions', 'qr', row.qr_id],
      work_like: ['likes', 'work', row.work_id], work_found: ['found_works', 'work', row.work_id],
      work_open: ['work_opens', 'work', row.work_id], store_open: ['store_opens', 'store', row.store_id],
      map_open: ['map_opens', 'store', row.store_id]
    }[row.event_name];
    if (mapped && mapped[2]) {
      const key = `${date}|${mapped[0]}|${mapped[1]}|${mapped[2]}`;
      const metric = ensure(dimensions, key, date, mapped[0], mapped[1], mapped[2]);
      metric.count += 1; metric.visitors[visitor] = true; metric.sessions[session] = true;
    }
  });
  const output = [['date', 'metric', 'dimension_type', 'dimension_id', 'count', 'unique_visitors', 'unique_sessions']];
  Object.entries(dailyPeople).forEach(([date, people]) => {
    output.push([date, 'visitors', '', '', Object.keys(people.visitors).length, Object.keys(people.visitors).length, Object.keys(people.sessions).length]);
  });
  const globalMetricNames = {
    page_view: 'page_views', qr_scan: 'qr_scans', qr_unique_session: 'qr_unique_sessions',
    work_like: 'likes', work_found: 'found_works', map_open: 'map_opens',
    work_open: 'work_opens', store_open: 'store_opens', engaged_view: 'engaged_views'
  };
  Object.values(global).forEach((metric) => output.push([metric.date, globalMetricNames[metric.metric] || metric.metric, metric.dimension_type, metric.dimension_id, metric.count, Object.keys(metric.visitors).length, Object.keys(metric.sessions).length]));
  Object.values(dimensions).forEach((metric) => output.push([metric.date, metric.metric, metric.dimension_type, metric.dimension_id, metric.count, Object.keys(metric.visitors).length, Object.keys(metric.sessions).length]));
  const sheet = ensureSheet_(spreadsheet, CONFIG.DAILY_EVENTS, DAILY_HEADERS);
  sheet.clearContents();
  sheet.getRange(1, 1, output.length, output[0].length).setValues(output);
}
