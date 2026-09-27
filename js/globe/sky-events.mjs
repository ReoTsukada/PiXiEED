/**
 * What is coming up in the sky for one observer: the major meteor showers and
 * the solar eclipses, with when and how well each can be seen from that spot.
 *
 * Meteor shower peaks follow the International Meteor Organization's working
 * list (peak solar longitude, radiant, zenithal hourly rate). The peak date is
 * found from the Sun's ecliptic longitude, so it is right for any year. Local
 * visibility takes the best dark hour around the peak (Sun below -12°),
 * where the radiant stands highest, and dims the rate when the Moon is up.
 * Eclipses come from astronomy.mjs, refined to the moment of greatest
 * obscuration seen from the observer with the Sun above the horizon.
 */

import { celestialState, observe, sunMoonEquatorial, listEclipses, greenwichSiderealDegrees, moonPhase } from './astronomy.mjs?v=20260927-sky-events-v1';

const DEG = Math.PI / 180;
const DAY = 86400000;
const norm360 = (value) => ((value % 360) + 360) % 360;
const wrap180 = (value) => norm360(value + 180) - 180;

/** name, peak solar longitude (J2000, deg), radiant RA/Dec (deg), ZHR, entry speed (km/s), parent. */
export const METEOR_SHOWERS = Object.freeze([
  { id: 'quadrantids', name: 'しぶんぎ座流星群', solarLongitude: 283.15, ra: 230, dec: 49, zhr: 110, speed: 41, note: '新年の夜明け前。短く鋭いピーク' },
  { id: 'lyrids', name: '4月こと座流星群', solarLongitude: 32.32, ra: 271, dec: 34, zhr: 18, speed: 49, note: 'サッチャー彗星のちり' },
  { id: 'eta-aquariids', name: 'みずがめ座η流星群', solarLongitude: 45.5, ra: 338, dec: -1, zhr: 50, speed: 66, note: 'ハレー彗星のちり。夜明け前に' },
  { id: 'delta-aquariids', name: 'みずがめ座δ南流星群', solarLongitude: 127, ra: 340, dec: -16, zhr: 25, speed: 41, note: '夏の夜に長く続く' },
  { id: 'perseids', name: 'ペルセウス座流星群', solarLongitude: 140.0, ra: 48, dec: 58, zhr: 100, speed: 59, note: '夏の三大流星群。明るい流れ星が多い' },
  { id: 'draconids', name: '10月りゅう座流星群', solarLongitude: 195.4, ra: 262, dec: 54, zhr: 10, speed: 20, note: '年によって突然増えることがある' },
  { id: 'orionids', name: 'オリオン座流星群', solarLongitude: 208, ra: 95, dec: 16, zhr: 20, speed: 66, note: 'ハレー彗星のちり' },
  { id: 'leonids', name: 'しし座流星群', solarLongitude: 235.27, ra: 152, dec: 22, zhr: 15, speed: 71, note: 'いちばん速い流れ星' },
  { id: 'geminids', name: 'ふたご座流星群', solarLongitude: 262.2, ra: 112, dec: 33, zhr: 150, speed: 35, note: '一年でいちばん多い。宵から見られる' },
  { id: 'ursids', name: 'こぐま座流星群', solarLongitude: 270.7, ra: 217, dec: 76, zhr: 10, speed: 33, note: '冬至のころ' }
]);

/** The Sun's apparent ecliptic longitude at `date`, referred to J2000 (as the IMO list is). */
function solarLongitudeJ2000(date) {
  const T = (date.getTime() / DAY + 2440587.5 - 2451545.0) / 36525;
  return norm360(sunMoonEquatorial(date).sunEclipticLongitude - 1.396971 * T);
}

/** First moment after `from` when the Sun reaches solar longitude `lambda` (J2000). */
export function solarLongitudeDate(lambda, from) {
  let t = from.getTime() + (norm360(lambda - solarLongitudeJ2000(from)) / 0.98561) * DAY;
  for (let i = 0; i < 4; i += 1) t -= (wrap180(solarLongitudeJ2000(new Date(t)) - lambda) / 0.98561) * DAY;
  return new Date(t);
}

/** Altitude (deg) of a fixed RA/Dec for an observer at `date`. */
export function altitudeOf(raDeg, decDeg, latitude, longitude, date) {
  const hourAngle = (greenwichSiderealDegrees(date) + longitude - raDeg) * DEG;
  const lat = latitude * DEG; const dec = decDeg * DEG;
  return Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle)) / DEG;
}

function describeRate(rate, dark) {
  if (!dark) return { rating: 'dark-none', label: '暗くならない' };
  if (rate >= 40) return { rating: 'great', label: 'よく見える' };
  if (rate >= 12) return { rating: 'good', label: '見える' };
  if (rate >= 3) return { rating: 'some', label: '少しだけ' };
  return { rating: 'poor', label: '見えにくい' };
}

/**
 * How a shower looks from one place around one peak: the best dark moment within
 * 20 hours of the peak, the radiant's altitude then, the Moon, and the expected
 * number of meteors per hour under a dark sky.
 */
export function meteorOutlook(shower, peak, latitude, longitude) {
  let best = null;
  for (let minutes = -20 * 60; minutes <= 20 * 60; minutes += 30) {
    const time = new Date(peak.getTime() + minutes * 60000);
    const radiant = altitudeOf(shower.ra, shower.dec, latitude, longitude, time);
    if (radiant <= 0) continue;
    const state = celestialState(time);
    const o = observe(state, latitude, longitude);
    if (o.sunAltitude > -12) continue;
    const moonIllumination = moonPhase(state).illuminatedFraction;
    const moonUp = o.moonAltitude > 0;
    const moonFactor = moonUp ? 1 - 0.75 * moonIllumination : 1;
    const nearPeak = Math.exp(-((minutes / 60 / 16) ** 2));
    const rate = shower.zhr * Math.sin(radiant * DEG) * moonFactor * nearPeak;
    if (!best || rate > best.rate) best = { time, radiantAltitude: radiant, moonIllumination, moonUp, rate };
  }
  if (!best) return { shower, peak, best: null, rate: 0, ...describeRate(0, false) };
  return { shower, peak, best: best.time, radiantAltitude: best.radiantAltitude, moonIllumination: best.moonIllumination, moonUp: best.moonUp, rate: Math.round(best.rate), ...describeRate(best.rate, true) };
}

/** The next `count` shower peaks after `from`, each with its outlook for the observer, soonest first. */
export function upcomingMeteorShowers(from, latitude, longitude, count = METEOR_SHOWERS.length) {
  // A shower still counts as "now" for a day after its peak.
  const since = new Date(from.getTime() - DAY);
  return METEOR_SHOWERS
    .map((shower) => ({ shower, peak: solarLongitudeDate(shower.solarLongitude, since) }))
    .sort((a, b) => a.peak - b.peak)
    .slice(0, count)
    .map(({ shower, peak }) => meteorOutlook(shower, peak, latitude, longitude));
}

/**
 * An eclipse as seen from one place: the moment of greatest obscuration with the
 * Sun up, or null when none of it is visible there.
 */
export function localEclipse(entry, latitude, longitude) {
  const center = entry.time.getTime();
  let best = null;
  const sample = (ms) => {
    const o = observe(celestialState(new Date(ms)), latitude, longitude);
    if (o.sunAltitude > -0.3 && o.obscuration > (best?.obscuration || 0)) best = { time: ms, obscuration: o.obscuration, magnitude: o.magnitude, kind: o.kind, sunAltitude: o.sunAltitude };
  };
  for (let m = -240; m <= 240; m += 10) sample(center + m * 60000);
  if (!best) return null;
  const coarse = best.time;
  for (let m = -10; m <= 10; m += 1) sample(coarse + m * 60000);
  if (best.obscuration < 0.005) return null;
  return { ...entry, local: { ...best, time: new Date(best.time) } };
}

let eclipseCache = null;
/** Solar eclipses visible from the observer between `from` and 2036, soonest first. */
export function upcomingEclipses(from, latitude, longitude, count = 6) {
  if (!eclipseCache) eclipseCache = listEclipses(new Date(Date.UTC(2024, 0, 1)), new Date(Date.UTC(2036, 11, 31)));
  const out = [];
  for (const entry of eclipseCache) {
    if (entry.time.getTime() < from.getTime() - DAY) continue;
    const local = localEclipse(entry, latitude, longitude);
    if (local) out.push(local);
    if (out.length >= count) break;
  }
  return out;
}

/** Days (rounded down) until `date`; 0 on the day itself. */
export function daysUntil(date, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((target - start) / DAY);
}
