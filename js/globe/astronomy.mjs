/**
 * Low-precision Sun / Moon ephemeris and eclipse geometry for the globe.
 *
 * Positions follow Meeus, "Astronomical Algorithms" (ch. 25 Sun, ch. 47 Moon,
 * truncated to the ~60 largest terms), good to roughly 0.01 degree. That is
 * enough to show where an eclipse shadow falls and how much of the Sun a
 * given observer sees covered, which is all the globe needs.
 *
 * Coordinate frame: "ECEF-like" unit vectors that match the renderer's world
 * space, x = cos(lat) sin(lon), y = sin(lat), z = cos(lat) cos(lon). Distances
 * are in Earth equatorial radii unless a name says otherwise.
 */

import { planetSky } from './planets.mjs?v=20260926-planets-v1';

const DEG = Math.PI / 180;
const EARTH_RADIUS_KM = 6378.137;
const AU_KM = 149597870.7;
const SUN_RADIUS_KM = 695700;
const MOON_RADIUS_KM = 1737.4;
export const MOON_RADIUS_EARTH = MOON_RADIUS_KM / EARTH_RADIUS_KM;
export const AU_EARTH_RADII = AU_KM / EARTH_RADIUS_KM;

const norm360 = (value) => ((value % 360) + 360) % 360;

export function julianDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

/** Terrestrial minus universal time in seconds (Espenak & Meeus polynomial, 2005-2050). */
export function deltaTSeconds(date) {
  const year = date.getUTCFullYear() + date.getUTCMonth() / 12;
  const t = year - 2000;
  return 62.92 + 0.32217 * t + 0.005589 * t * t;
}

export function greenwichSiderealDegrees(date) {
  const d = julianDate(date) - 2451545.0;
  const t = d / 36525;
  return norm360(280.46061837 + 360.98564736629 * d + 0.000387933 * t * t);
}

// Moon periodic terms: [D, M, M', F, sigmaL (1e-6 deg), sigmaR (1e-3 km)]
const MOON_LR = [
  [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111], [2, 0, 0, 0, 658314, -2955968],
  [0, 0, 2, 0, 213618, -569925], [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138], [2, 0, 1, 0, 53322, -170733],
  [2, -1, 0, 0, 45758, -204586], [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321], [0, 0, 1, 2, -12528, 0],
  [0, 0, 1, -2, 10980, 79661], [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208], [2, 1, 0, 0, -6766, 30824],
  [1, 0, -1, 0, -5163, -8379], [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650], [2, 0, -3, 0, 3665, 14403],
  [0, 1, -2, 0, -2689, -7003], [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884], [0, 1, 2, 0, -2120, 5751],
  [0, 2, 0, 0, -2069, 0], [2, -2, -1, 0, 2048, -4950], [2, 0, 1, -2, -1773, 4130],
  [2, 0, 0, 2, -1595, 0], [4, -1, -1, 0, 1215, -3958], [0, 0, 2, 2, -1110, 0],
  [3, 0, -1, 0, -892, 3258], [2, 1, 1, 0, -810, 2616], [4, -1, -2, 0, 759, -1897],
  [0, 2, -1, 0, -713, -2117], [2, 2, -1, 0, -700, 2354], [2, 1, -2, 0, 691, 0],
  [2, -1, 0, -2, 596, 0], [4, 0, 1, 0, 549, -1423], [0, 0, 4, 0, 537, -1117],
  [4, -1, 0, 0, 520, -1571], [1, 0, -2, 0, -487, -1739], [2, 1, 0, -2, -399, 0],
  [0, 0, 2, -2, -381, -4421], [1, 1, 1, 0, 351, 0], [3, 0, -2, 0, -340, 0],
  [4, 0, -3, 0, 330, 0], [2, -1, 2, 0, 327, 0], [0, 2, 1, 0, -323, 1165],
  [1, 1, -1, 0, 299, 0], [2, 0, 3, 0, 294, 0], [2, 0, -1, -2, 0, 8752]
];

// Moon latitude terms: [D, M, M', F, sigmaB (1e-6 deg)]
const MOON_B = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463], [2, -1, 0, 1, 2211],
  [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870], [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794],
  [0, 0, 0, 3, -1749], [0, 1, -1, 1, -1565], [1, 0, 0, 1, -1491], [0, 1, 1, 1, -1475],
  [0, 1, 1, -1, -1410], [0, 1, 0, -1, -1344], [1, 0, 0, -1, -1335], [0, 0, 3, 1, 1107],
  [4, 0, 0, -1, 1021], [4, 0, -1, 1, 833], [0, 0, 1, -3, 777], [4, 0, -2, 1, 671],
  [2, 0, 0, -3, 607], [2, 0, 2, -1, 596], [2, -1, 1, -1, 491], [2, 0, -2, 1, -451],
  [0, 0, 3, -1, 439], [2, 0, 2, 1, 422], [2, 0, -3, -1, 421], [2, 1, -1, 1, -366],
  [2, 1, 0, 1, -351], [4, 0, 0, 1, 331], [2, -1, 1, 1, 315], [2, -2, 0, -1, 302],
  [0, 0, 1, 3, -283], [2, 1, 1, -1, -229], [1, 1, 0, -1, 223], [1, 1, 0, 1, 223],
  [0, 1, -2, -1, -220], [2, 1, -1, -1, -220], [1, 0, 1, 1, -185], [2, -1, -2, -1, 181],
  [0, 1, 2, 1, -177], [4, 0, -2, -1, 176], [4, -1, -1, -1, 166], [1, 0, 1, -1, -164],
  [4, 0, 1, -1, 132], [1, 0, -1, -1, -119], [4, -1, 0, -1, 115], [2, -2, 0, 1, 107]
];

function eclipticToEquatorial(lambdaDeg, betaDeg, epsilonDeg) {
  const l = lambdaDeg * DEG;
  const b = betaDeg * DEG;
  const e = epsilonDeg * DEG;
  const ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
  const dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
  return { ra: norm360(ra / DEG), dec: dec / DEG };
}

/** Apparent geocentric Sun and Moon in ecliptic and equatorial coordinates. */
export function sunMoonEquatorial(date) {
  const jde = julianDate(date) + deltaTSeconds(date) / 86400;
  const T = (jde - 2451545.0) / 36525;
  const omega = 125.04452 - 1934.136261 * T;
  const epsilon = 23.4392911 - 0.0130042 * T + 0.00256 * Math.cos(omega * DEG);

  // Sun
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const Ms = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const e = 0.016708634 - 0.000042037 * T;
  const C = (1.914602 - 0.004817 * T) * Math.sin(Ms * DEG) + (0.019993 - 0.000101 * T) * Math.sin(2 * Ms * DEG) + 0.000289 * Math.sin(3 * Ms * DEG);
  const trueLon = L0 + C;
  const nu = Ms + C;
  const sunDistanceAU = (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(nu * DEG));
  const sunLon = trueLon - 0.00569 - 0.00478 * Math.sin(omega * DEG);
  const sun = { ...eclipticToEquatorial(sunLon, 0, epsilon), distanceAU: sunDistanceAU };

  // Moon
  const Lp = norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T * T);
  const D = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T);
  const M = norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T);
  const Mp = norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T);
  const F = norm360(93.2720950 + 483202.0175233 * T - 0.0036539 * T * T);
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const A1 = norm360(119.75 + 131.849 * T);
  const A2 = norm360(53.09 + 479264.290 * T);
  const A3 = norm360(313.45 + 481266.484 * T);
  let sigmaL = 0;
  let sigmaR = 0;
  for (const [d, m, mp, f, l, r] of MOON_LR) {
    const arg = (d * D + m * M + mp * Mp + f * F) * DEG;
    const factor = Math.abs(m) === 1 ? E : Math.abs(m) === 2 ? E * E : 1;
    sigmaL += l * factor * Math.sin(arg);
    sigmaR += r * factor * Math.cos(arg);
  }
  let sigmaB = 0;
  for (const [d, m, mp, f, b] of MOON_B) {
    const arg = (d * D + m * M + mp * Mp + f * F) * DEG;
    const factor = Math.abs(m) === 1 ? E : Math.abs(m) === 2 ? E * E : 1;
    sigmaB += b * factor * Math.sin(arg);
  }
  sigmaL += 3958 * Math.sin(A1 * DEG) + 1962 * Math.sin((Lp - F) * DEG) + 318 * Math.sin(A2 * DEG);
  sigmaB += -2235 * Math.sin(Lp * DEG) + 382 * Math.sin(A3 * DEG) + 175 * Math.sin((A1 - F) * DEG) + 175 * Math.sin((A1 + F) * DEG) + 127 * Math.sin((Lp - Mp) * DEG) - 115 * Math.sin((Lp + Mp) * DEG);
  const nutationLon = -0.004778 * Math.sin(omega * DEG) - 0.0003667 * Math.sin(2 * L0 * DEG);
  const moonLon = Lp + sigmaL / 1e6 + nutationLon;
  const moonLat = sigmaB / 1e6;
  const moonDistanceKm = 385000.56 + sigmaR / 1000;
  const moon = { ...eclipticToEquatorial(moonLon, moonLat, epsilon), distanceKm: moonDistanceKm, eclipticLongitude: norm360(moonLon), eclipticLatitude: moonLat };
  return { sun, moon, epsilon, sunEclipticLongitude: norm360(sunLon) };
}

export function geoToUnit(lonDeg, latDeg) {
  const lon = lonDeg * DEG;
  const lat = latDeg * DEG;
  return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
}

export function unitToGeo(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return { longitude: Math.atan2(vector[0], vector[2]) / DEG, latitude: Math.asin(Math.max(-1, Math.min(1, vector[1] / length))) / DEG };
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const length = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => scale(a, 1 / (length(a) || 1));

/**
 * Sun and Moon expressed in the Earth-fixed frame at `date`.
 * `sunVector`/`moonVector` are geocentric positions in Earth radii.
 * With `planets: true` the planets (planets.mjs) are added in the same frame;
 * eclipse searches leave them out to stay fast.
 */
export function celestialState(date, { planets = false } = {}) {
  const gmst = greenwichSiderealDegrees(date);
  const { sun, moon, epsilon } = sunMoonEquatorial(date);
  const sunDirection = geoToUnit(norm360(sun.ra - gmst + 180) - 180, sun.dec);
  const moonDirection = geoToUnit(norm360(moon.ra - gmst + 180) - 180, moon.dec);
  const sunDistance = sun.distanceAU * AU_EARTH_RADII;
  const moonDistance = moon.distanceKm / EARTH_RADIUS_KM;
  const sunAngularRadius = Math.asin(SUN_RADIUS_KM / (sun.distanceAU * AU_KM));
  return Object.freeze({
    date,
    gmstDegrees: gmst,
    epsilonDegrees: epsilon,
    sunDirection,
    sunVector: scale(sunDirection, sunDistance),
    sunDistance,
    sunAngularRadius,
    moonDirection,
    moonVector: scale(moonDirection, moonDistance),
    moonDistance,
    moonEquatorial: moon,
    sunEquatorial: sun,
    subSolar: unitToGeo(sunDirection),
    subLunar: unitToGeo(moonDirection),
    planets: planets ? planetSky(date, { gmstDeg: gmst, obliquityDeg: epsilon }) : null
  });
}

/** Fraction of the Sun's disc covered by the Moon for two discs. */
export function discOverlap(separation, sunRadius, moonRadius) {
  if (separation >= sunRadius + moonRadius) return 0;
  if (separation <= Math.abs(moonRadius - sunRadius)) return moonRadius >= sunRadius ? 1 : (moonRadius * moonRadius) / (sunRadius * sunRadius);
  const a = sunRadius * sunRadius * Math.acos((separation * separation + sunRadius * sunRadius - moonRadius * moonRadius) / (2 * separation * sunRadius));
  const b = moonRadius * moonRadius * Math.acos((separation * separation + moonRadius * moonRadius - sunRadius * sunRadius) / (2 * separation * moonRadius));
  const c = 0.5 * Math.sqrt(Math.max(0, (-separation + sunRadius + moonRadius) * (separation + sunRadius - moonRadius) * (separation - sunRadius + moonRadius) * (separation + sunRadius + moonRadius)));
  return Math.min(1, Math.max(0, (a + b - c) / (Math.PI * sunRadius * sunRadius)));
}

/** What an observer on the surface (spherical Earth) sees of the Sun and Moon. */
export function observe(state, latitudeDegrees, longitudeDegrees) {
  const up = geoToUnit(longitudeDegrees, latitudeDegrees);
  const lon = longitudeDegrees * DEG;
  const east = [Math.cos(lon), 0, -Math.sin(lon)];
  const north = cross(up, east);
  const sunTopo = sub(state.sunVector, up);
  const moonTopo = sub(state.moonVector, up);
  const sunUnit = unit(sunTopo);
  const moonUnit = unit(moonTopo);
  const sunRadius = Math.asin(SUN_RADIUS_KM / EARTH_RADIUS_KM / length(sunTopo));
  const moonRadius = Math.asin(MOON_RADIUS_EARTH / length(moonTopo));
  const separation = Math.atan2(length(cross(sunUnit, moonUnit)), dot(sunUnit, moonUnit));
  const toLocal = (v) => [dot(v, east), dot(v, north), dot(v, up)];
  const sunLocal = toLocal(sunUnit);
  const moonLocal = toLocal(moonUnit);
  // Planets are far enough that the observer's offset from the Earth's centre does not matter.
  const planets = state.planets ? state.planets.map((planet) => Object.freeze({
    id: planet.id, name: planet.name, planet: planet.planet,
    local: toLocal(unit(sub(planet.vector, up))),
    toSun: toLocal(planet.toSun), pole: toLocal(planet.pole),
    angularRadius: planet.angularRadius, magnitude: planet.magnitude, illuminated: planet.illuminated,
    altitude: Math.asin(Math.max(-1, Math.min(1, dot(unit(sub(planet.vector, up)), up)))) / DEG,
    moons: planet.moons ? planet.moons.map((moon) => ({ id: moon.id, name: moon.name, local: toLocal(unit(sub(moon.vector, up))), angularRadius: moon.angularRadius, hidden: moon.hidden })) : null
  })) : null;
  const overlap = discOverlap(separation, sunRadius, moonRadius);
  // Fraction of the solar *diameter* covered ("magnitude"), 1 = total.
  const magnitude = separation >= sunRadius + moonRadius ? 0 : (sunRadius + moonRadius - separation) / (2 * sunRadius);
  return Object.freeze({
    latitude: latitudeDegrees, longitude: longitudeDegrees,
    east, north, up,
    sunLocal, moonLocal, sunRadius, moonRadius, separation, planets,
    sunAltitude: Math.asin(sunLocal[2]) / DEG,
    moonAltitude: Math.asin(moonLocal[2]) / DEG,
    obscuration: overlap,
    magnitude,
    kind: overlap <= 0 ? 'none' : overlap >= 0.9999 ? 'total' : moonRadius < sunRadius && separation <= sunRadius - moonRadius ? 'annular' : 'partial'
  });
}

/** Moon phase: elongation from the Sun (0 = new, 180 = full) and illuminated fraction. */
export function moonPhase(state) {
  const cosElong = Math.max(-1, Math.min(1, dot(state.sunDirection, state.moonDirection)));
  const elongation = Math.acos(cosElong) / DEG;
  const sunLon = norm360(state.sunEquatorial.ra);
  const moonLon = norm360(state.moonEquatorial.ra);
  const waxing = norm360(moonLon - sunLon) < 180;
  return { elongation, illuminatedFraction: (1 - cosElong) / 2, waxing };
}

/** Shadow axis (Sun -> Moon) intersected with the Earth: where the shadow centre lies. */
export function shadowAxis(state) {
  const direction = unit(sub(state.moonVector, state.sunVector));
  const origin = state.moonVector;
  // Closest approach of the axis line to Earth's centre.
  const t = -dot(origin, direction);
  const closest = [origin[0] + direction[0] * t, origin[1] + direction[1] * t, origin[2] + direction[2] * t];
  const miss = length(closest);
  let hit = null;
  if (miss < 1) {
    const back = Math.sqrt(1 - miss * miss);
    hit = [closest[0] - direction[0] * back, closest[1] - direction[1] * back, closest[2] - direction[2] * back];
  }
  return { direction, missDistance: miss, hit, hitGeo: hit ? unitToGeo(hit) : null };
}

/** Refine the instant of greatest eclipse near `approx` (golden section on the axis miss distance). */
export function findGreatestEclipse(approx, spanMinutes = 90) {
  const missAt = (ms) => shadowAxis(celestialState(new Date(ms))).missDistance;
  let a = approx.getTime() - spanMinutes * 60000;
  let b = approx.getTime() + spanMinutes * 60000;
  const phi = (Math.sqrt(5) - 1) / 2;
  let c = b - phi * (b - a);
  let d = a + phi * (b - a);
  let fc = missAt(c);
  let fd = missAt(d);
  for (let i = 0; i < 60 && b - a > 200; i += 1) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - phi * (b - a); fc = missAt(c); }
    else { a = c; c = d; fc = fd; d = a + phi * (b - a); fd = missAt(d); }
  }
  const time = new Date((a + b) / 2);
  const state = celestialState(time);
  const axis = shadowAxis(state);
  // If the axis misses Earth (partial eclipse) report the sub-axis point of closest approach.
  const closest = axis.hit ? axis.hit : (() => {
    const t = -dot(state.moonVector, axis.direction);
    return unit([state.moonVector[0] + axis.direction[0] * t, state.moonVector[1] + axis.direction[1] * t, state.moonVector[2] + axis.direction[2] * t]);
  })();
  const where = axis.hitGeo || unitToGeo(closest);
  const at = observe(state, where.latitude, where.longitude);
  return Object.freeze({ time, state, axis, latitude: where.latitude, longitude: where.longitude, missDistance: axis.missDistance, observation: at, kind: axis.hit ? at.kind : 'partial' });
}

const SYNODIC_DAYS = 29.530588861;

/** Solar eclipses (any kind) between two dates, found lunation by lunation. */
export function listEclipses(from, to) {
  const reference = 2451550.09766; // mean new moon of 2000-01-06
  const first = Math.floor((julianDate(from) - reference) / SYNODIC_DAYS);
  const last = Math.ceil((julianDate(to) - reference) / SYNODIC_DAYS);
  const found = [];
  for (let k = first; k <= last; k += 1) {
    const mean = new Date((reference + SYNODIC_DAYS * k - 2440587.5) * 86400000);
    const coarse = findGreatestEclipse(mean, 16 * 60);
    if (coarse.missDistance > 1.6) continue;
    const fine = findGreatestEclipse(coarse.time, 60);
    if (fine.missDistance >= 1.55) continue;
    if (fine.time < from || fine.time > to) continue;
    const kind = fine.axis.hit ? fine.observation.kind : 'partial';
    found.push(Object.freeze({ time: fine.time, kind, latitude: fine.latitude, longitude: fine.longitude, missDistance: fine.missDistance, magnitude: fine.observation.magnitude }));
  }
  return found;
}

/** Peak obscuration a fixed observer sees within +-3 h of `time` (Sun above the horizon only). */
export function peakObscurationAt(time, latitude, longitude, halfWindowMinutes = 240, stepMinutes = 10) {
  let best = 0;
  for (let m = -halfWindowMinutes; m <= halfWindowMinutes; m += stepMinutes) {
    const o = observe(celestialState(new Date(time.getTime() + m * 60000)), latitude, longitude);
    if (o.sunAltitude > -0.3 && o.obscuration > best) best = o.obscuration;
  }
  return best;
}

/** Next sunrise or sunset (Sun's centre at -0.833 degrees) after `from`, or null in polar day / night. */
export function findSunEvent(from, latitude, longitude, kind = 'rise') {
  const target = -0.833;
  const altitudeAt = (ms) => observe(celestialState(new Date(ms)), latitude, longitude).sunAltitude;
  const step = 10 * 60000;
  let previousTime = from.getTime();
  let previous = altitudeAt(previousTime);
  for (let i = 0; i < 24 * 6 + 3; i += 1) {
    const time = previousTime + step;
    const current = altitudeAt(time);
    const crossed = kind === 'rise' ? previous < target && current >= target : previous > target && current <= target;
    if (crossed) {
      let lo = previousTime;
      let hi = time;
      for (let n = 0; n < 24; n += 1) {
        const mid = (lo + hi) / 2;
        const above = altitudeAt(mid) >= target;
        if ((kind === 'rise') === above) hi = mid; else lo = mid;
      }
      return new Date((lo + hi) / 2);
    }
    previousTime = time;
    previous = current;
  }
  return null;
}
