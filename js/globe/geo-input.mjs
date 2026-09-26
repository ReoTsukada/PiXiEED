/**
 * Turns whatever the user pastes into a pin coordinate — completely offline.
 *
 * Reading the coordinates that are already inside a Google Maps URL is free
 * (no Maps Platform API call, no key, no billing). What this deliberately does
 * NOT do is resolve short links (maps.app.goo.gl/...) or place names: that needs
 * a network round trip and, for names, the paid Places / Geocoding API.
 */

const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)';
const PAIR = `${NUM}\\s*[,\\s]\\s*${NUM}`;

const URL_PATTERNS = [
  // Exact place pin inside Google's data blob: ...!3d35.6586!4d139.7454
  new RegExp(`!3d${NUM}!4d${NUM}`),
  // Map viewport centre: /@35.6586,139.7454,17z  (less exact than the pin, but always there)
  new RegExp(`@${NUM},${NUM}`),
  // ?q=35.6586,139.7454  ?ll=  ?query=  ?destination=  ?center=  ?daddr=
  new RegExp(`[?&](?:q|ll|query|center|destination|daddr|sll)=${NUM}(?:,|%2C|\\+)\\s*${NUM}`, 'i'),
  // OpenStreetMap: mlat=..&mlon=.. and #map=17/35.6586/139.7454
  new RegExp(`mlat=${NUM}&(?:amp;)?mlon=${NUM}`, 'i'),
  new RegExp(`#map=\\d+/${NUM}/${NUM}`),
  // geo:35.6586,139.7454
  new RegExp(`^geo:${NUM},${NUM}`, 'i')
];

const SHORT_LINK = /(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|share\.google)/i;
const DMS = /(\d{1,3}(?:\.\d+)?)\s*°\s*(?:(\d{1,2}(?:\.\d+)?)\s*['′]\s*)?(?:(\d{1,2}(?:\.\d+)?)\s*(?:"|″|''|′′)\s*)?([NSEW])/gi;

function inRange(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

function success(latitude, longitude, source) {
  return { ok: true, latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)), source };
}

function fail(reason, message) {
  return { ok: false, reason, message };
}

function parseDms(text) {
  const found = [];
  for (const match of text.matchAll(DMS)) {
    const degrees = Number(match[1]);
    const minutes = Number(match[2] || 0);
    const seconds = Number(match[3] || 0);
    let value = degrees + minutes / 60 + seconds / 3600;
    if (/[SW]/i.test(match[4])) value = -value;
    found.push({ axis: /[NS]/i.test(match[4]) ? 'lat' : 'lon', value });
  }
  const lat = found.find((item) => item.axis === 'lat');
  const lon = found.find((item) => item.axis === 'lon');
  return lat && lon ? { latitude: lat.value, longitude: lon.value } : null;
}

/** Decimal pair with optional hemisphere letters: "35.68N 139.69E", "35.68, 139.69". */
function parsePlainPair(text) {
  const lettered = /(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([NS])[\s,]+(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([EW])/i.exec(text);
  if (lettered) {
    const latitude = Number(lettered[1]) * (/S/i.test(lettered[2]) ? -1 : 1);
    const longitude = Number(lettered[3]) * (/W/i.test(lettered[4]) ? -1 : 1);
    return { latitude, longitude };
  }
  const plain = new RegExp(`^\\(?\\s*${PAIR}\\s*\\)?$`).exec(text);
  if (plain) return { latitude: Number(plain[1]), longitude: Number(plain[2]) };
  return null;
}

export function parseLocationInput(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return fail('empty', '');
  let text = raw;
  try { text = decodeURIComponent(raw); } catch { /* keep the raw text */ }
  text = text.replace(/\u3000/g, ' ').replace(/[，、]/g, ',').replace(/[０-９．－]/g, (char) => (char === '．' ? '.' : char === '－' ? '-' : String.fromCharCode(char.charCodeAt(0) - 0xFEE0)));

  const isUrl = /^(?:https?:\/\/|geo:|www\.)/i.test(text) || /(?:google\.[a-z.]+\/maps|maps\.apple\.com|openstreetmap\.org)/i.test(text);
  if (isUrl) {
    for (const pattern of URL_PATTERNS) {
      const match = pattern.exec(text);
      if (!match) continue;
      const latitude = Number(match[1]);
      const longitude = Number(match[2]);
      if (inRange(latitude, longitude)) return success(latitude, longitude, 'map-link');
    }
    if (SHORT_LINK.test(text)) {
      return fail('short-link', '短縮リンクは座標を読み取れません。リンクを開いてアドレスバーのURLを貼るか、地図を長押しして出る座標をコピーしてください。');
    }
    return fail('no-coords', 'このリンクには座標が含まれていません。地図上で場所を長押し（右クリック）して出る座標を貼り付けてください。');
  }

  const dms = parseDms(text);
  if (dms) return inRange(dms.latitude, dms.longitude) ? success(dms.latitude, dms.longitude, 'coordinates') : fail('range', '緯度は±90、経度は±180の範囲で入力してください。');
  const pair = parsePlainPair(text);
  if (pair) return inRange(pair.latitude, pair.longitude) ? success(pair.latitude, pair.longitude, 'coordinates') : fail('range', '緯度は±90、経度は±180の範囲で入力してください。（緯度,経度 の順です）');
  return fail('unrecognized', 'Googleマップのリンク、または「35.6895, 139.6917」のような座標を貼り付けてください。');
}

export function formatCoordinates(latitude, longitude, digits = 4) {
  const lat = `${Math.abs(latitude).toFixed(digits)}°${latitude >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(longitude).toFixed(digits)}°${longitude >= 0 ? 'E' : 'W'}`;
  return `${lat} ${lon}`;
}

export function googleMapsUrl(latitude, longitude) {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}
