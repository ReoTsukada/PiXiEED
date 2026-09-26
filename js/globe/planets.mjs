/**
 * Planets of the Solar System for the globe sky, the telescope and the
 * Solar System view.
 *
 * Heliocentric positions use the JPL "Approximate Positions of the Planets"
 * Keplerian elements (E. M. Standish, Table 1, valid 1800–2050, a few
 * arcminutes or better for the inner planets). Geocentric directions include
 * one light-time iteration and precession from J2000 to the date, so they sit
 * in the same "of date" frame as the Sun and Moon in astronomy.mjs.
 * Galilean moons follow Meeus, "Astronomical Algorithms" ch. 44 (low accuracy).
 *
 * Frames: ecliptic vectors are [x, y, z] in AU with z toward the ecliptic
 * north pole. Earth-fixed vectors use the renderer's convention
 * x = cos(lat) sin(lon), y = sin(lat), z = cos(lat) cos(lon).
 */

const DEG = Math.PI / 180;
const AU_KM = 149597870.7;
const EARTH_RADIUS_KM = 6378.137;
const LIGHT_DAYS_PER_AU = 0.0057755183;
const J2000_OBLIQUITY = 23.43928;

// a (AU), e, I (deg), L (deg), long. perihelion (deg), long. asc. node (deg); value and rate per Julian century.
const ELEMENTS = {
  mercury: [[0.38709927, 0.00000037], [0.20563593, 0.00001906], [7.00497902, -0.00594749], [252.25032350, 149472.67411175], [77.45779628, 0.16047689], [48.33076593, -0.12534081]],
  venus: [[0.72333566, 0.00000390], [0.00677672, -0.00004107], [3.39467605, -0.00078890], [181.97909950, 58517.81538729], [131.60246718, 0.00268329], [76.67984255, -0.27769418]],
  earth: [[1.00000261, 0.00000562], [0.01671123, -0.00004392], [-0.00001531, -0.01294668], [100.46457166, 35999.37244981], [102.93768193, 0.32327364], [0, 0]],
  mars: [[1.52371034, 0.00001847], [0.09339410, 0.00007882], [1.84969142, -0.00813131], [-4.55343205, 19140.30268499], [-23.94362959, 0.44441088], [49.55953891, -0.29257343]],
  jupiter: [[5.20288700, -0.00011607], [0.04838624, -0.00013253], [1.30439695, -0.00183714], [34.39644051, 3034.74612775], [14.72847983, 0.21252668], [100.47390909, 0.20469106]],
  saturn: [[9.53667594, -0.00125060], [0.05386179, -0.00050991], [2.48599187, 0.00193609], [49.95424423, 1222.49362201], [92.59887831, -0.41897216], [113.66242448, -0.28867794]],
  uranus: [[19.18916464, -0.00196176], [0.04725744, -0.00004397], [0.77263783, -0.00242939], [313.23810451, 428.48202785], [170.95427630, 0.40805281], [74.01692503, 0.04240589]],
  neptune: [[30.06992276, 0.00026291], [0.00859048, 0.00005105], [1.77004347, 0.00035372], [-55.12002969, 218.45945325], [44.96476227, -0.32241464], [131.78422574, -0.00508664]]
};

/**
 * Physical data. `pole` is the north pole (RA, Dec, J2000, IAU), `magnitude`
 * the [H, linear, quadratic, cubic] phase-angle polynomial for V magnitude.
 */
export const PLANETS = Object.freeze([
  { id: 'mercury', name: '水星', kind: '岩石惑星', radiusKm: 2439.7, flattening: 0, periodDays: 87.969, rotationHours: 1407.6, pole: [281.01, 61.41], magnitude: [-0.42, 0.038, -0.000273, 0.000002], color: '#a79e94', moons: 0 },
  { id: 'venus', name: '金星', kind: '岩石惑星', radiusKm: 6051.8, flattening: 0, periodDays: 224.701, rotationHours: -5832.5, pole: [272.76, 67.16], magnitude: [-4.40, 0.0009, 0.000239, -0.00000065], color: '#f1e3bd', moons: 0 },
  { id: 'earth', name: '地球', kind: '岩石惑星', radiusKm: 6371.0, flattening: 0.0034, periodDays: 365.256, rotationHours: 23.934, pole: [0, 90], magnitude: [-3.86, 0, 0, 0], color: '#5aa9c4', moons: 1 },
  { id: 'mars', name: '火星', kind: '岩石惑星', radiusKm: 3389.5, flattening: 0.0059, periodDays: 686.980, rotationHours: 24.623, pole: [317.68, 52.89], magnitude: [-1.52, 0.016, 0, 0], color: '#d4693f', moons: 2 },
  { id: 'jupiter', name: '木星', kind: 'ガス惑星', radiusKm: 69911, flattening: 0.0649, periodDays: 4332.59, rotationHours: 9.925, pole: [268.06, 64.50], magnitude: [-9.40, 0.005, 0, 0], color: '#d8b48c', moons: 95 },
  { id: 'saturn', name: '土星', kind: 'ガス惑星', radiusKm: 58232, flattening: 0.0980, periodDays: 10759.22, rotationHours: 10.656, pole: [40.59, 83.54], magnitude: [-8.88, 0.044, 0, 0], color: '#e4cf97', moons: 146 },
  { id: 'uranus', name: '天王星', kind: '氷惑星', radiusKm: 25362, flattening: 0.0229, periodDays: 30688.5, rotationHours: -17.24, pole: [257.31, -15.18], magnitude: [-7.19, 0.002, 0, 0], color: '#a3dbe0', moons: 28 },
  { id: 'neptune', name: '海王星', kind: '氷惑星', radiusKm: 24622, flattening: 0.0171, periodDays: 60195, rotationHours: 16.11, pole: [299.36, 43.46], magnitude: [-6.87, 0, 0, 0], color: '#5f82e2', moons: 16 }
]);
export const PLANET_BY_ID = Object.freeze(Object.fromEntries(PLANETS.map((planet) => [planet.id, planet])));
/** Planets seen from the Earth (everything but the Earth itself), in order from the Sun. */
export const SKY_PLANETS = Object.freeze(PLANETS.filter((planet) => planet.id !== 'earth'));

export const GALILEAN_MOONS = Object.freeze([
  { id: 'io', name: 'イオ', radiusKm: 1821.6 },
  { id: 'europa', name: 'エウロパ', radiusKm: 1560.8 },
  { id: 'ganymede', name: 'ガニメデ', radiusKm: 2634.1 },
  { id: 'callisto', name: 'カリスト', radiusKm: 2410.3 }
]);

const norm360 = (value) => ((value % 360) + 360) % 360;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const length = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => scale(a, 1 / (length(a) || 1));

/** Julian centuries (TT, close enough) since J2000.0. */
export function centuriesSinceJ2000(date) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  return (jd + 69.2 / 86400 - 2451545.0) / 36525;
}

/** Orbital elements of a planet at `T` centuries: { a, e, I, L, perihelion, node } (degrees, AU). */
export function orbitalElements(id, T) {
  const table = ELEMENTS[id];
  if (!table) throw new RangeError(`Unknown planet: ${id}`);
  const [a, e, I, L, perihelion, node] = table.map(([value, rate]) => value + rate * T);
  return { a, e, I, L, perihelion, node };
}

function solveKepler(meanAnomalyDeg, e) {
  const M = ((norm360(meanAnomalyDeg + 180) - 180) * DEG);
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 8; i += 1) {
    const delta = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= delta;
    if (Math.abs(delta) < 1e-12) break;
  }
  return E;
}

/** Heliocentric ecliptic (J2000) position in AU for a set of elements, at eccentric anomaly E. */
function positionFromAnomaly({ a, e, I, perihelion, node }, E) {
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const w = (perihelion - node) * DEG; const O = node * DEG; const i = I * DEG;
  const cw = Math.cos(w); const sw = Math.sin(w); const cO = Math.cos(O); const sO = Math.sin(O); const ci = Math.cos(i); const si = Math.sin(i);
  return [
    (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp,
    (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp,
    (sw * si) * xp + (cw * si) * yp
  ];
}

/** Heliocentric ecliptic J2000 position of a planet (AU) at `T` centuries. */
export function heliocentricAt(id, T) {
  const elements = orbitalElements(id, T);
  return positionFromAnomaly(elements, solveKepler(elements.L - elements.perihelion, elements.e));
}

export function heliocentric(id, date) { return heliocentricAt(id, centuriesSinceJ2000(date)); }

/** `samples` points around the orbit at `date` (heliocentric ecliptic AU), for drawing. */
export function orbitPath(id, date, samples = 256) {
  const elements = orbitalElements(id, centuriesSinceJ2000(date));
  const points = [];
  for (let k = 0; k < samples; k += 1) points.push(positionFromAnomaly(elements, (k / samples) * Math.PI * 2));
  return points;
}

// Precession in ecliptic longitude from J2000 to the date (general precession, ~50.3"/yr).
function precess(vector, T) {
  const angle = (1.396971 * T + 0.0003086 * T * T) * DEG;
  const c = Math.cos(angle); const s = Math.sin(angle);
  return [vector[0] * c - vector[1] * s, vector[0] * s + vector[1] * c, vector[2]];
}

function eclipticToEquatorial(vector, obliquityDeg) {
  const e = obliquityDeg * DEG; const c = Math.cos(e); const s = Math.sin(e);
  return [vector[0], vector[1] * c - vector[2] * s, vector[1] * s + vector[2] * c];
}

function equatorialToRaDec(vector) {
  const r = length(vector);
  return { ra: norm360(Math.atan2(vector[1], vector[0]) / DEG), dec: Math.asin(Math.max(-1, Math.min(1, vector[2] / r))) / DEG };
}

function raDecToEquatorial(raDeg, decDeg) {
  const ra = raDeg * DEG; const dec = decDeg * DEG;
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
}

/** Equatorial (of date) unit vector → Earth-fixed unit vector, given Greenwich sidereal time. */
function equatorialToEarthFixed(vector, gmstDeg) {
  const { ra, dec } = equatorialToRaDec(vector);
  const lon = ((norm360(ra - gmstDeg + 180) - 180)) * DEG; const lat = dec * DEG;
  return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
}

/** Apparent V magnitude from distances (AU) and phase angle (deg). */
export function planetMagnitude(planet, r, delta, phaseDeg) {
  const [H, b, c, d] = planet.magnitude;
  return H + 5 * Math.log10(r * delta) + b * phaseDeg + c * phaseDeg ** 2 + d * phaseDeg ** 3;
}

/**
 * Galilean moons around Jupiter (Meeus ch. 44): angle u from superior conjunction
 * (behind Jupiter as seen from the Earth) and radius in Jupiter radii.
 */
export function galileanPhases(date) {
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const V = 172.74 + 0.00111588 * d;
  const M = 357.529 + 0.9856003 * d;
  const N = 20.020 + 0.0830853 * d + 0.329 * Math.sin(V * DEG);
  const J = 66.115 + 0.9025179 * d - 0.329 * Math.sin(V * DEG);
  const A = 1.915 * Math.sin(M * DEG) + 0.020 * Math.sin(2 * M * DEG);
  const B = 5.555 * Math.sin(N * DEG) + 0.168 * Math.sin(2 * N * DEG);
  const K = J + A - B;
  const R = 1.00014 - 0.01671 * Math.cos(M * DEG) - 0.00014 * Math.cos(2 * M * DEG);
  const r = 5.20872 - 0.25208 * Math.cos(N * DEG) - 0.00611 * Math.cos(2 * N * DEG);
  const delta = Math.sqrt(r * r + R * R - 2 * r * R * Math.cos(K * DEG));
  const psi = Math.asin((R / delta) * Math.sin(K * DEG)) / DEG;
  const t = d - delta / 173;
  let u1 = 163.8069 + 203.4058646 * t + psi - B;
  let u2 = 358.4140 + 101.2916335 * t + psi - B;
  let u3 = 5.7176 + 50.2345180 * t + psi - B;
  let u4 = 224.8092 + 21.4879800 * t + psi - B;
  const G = 331.18 + 50.310482 * t; const H = 87.45 + 21.569231 * t;
  const c1 = 0.473 * Math.sin(2 * (u1 - u2) * DEG); const c2 = 1.065 * Math.sin(2 * (u2 - u3) * DEG);
  const c3 = 0.165 * Math.sin(G * DEG); const c4 = 0.843 * Math.sin(H * DEG);
  const r1 = 5.9057 - 0.0244 * Math.cos(2 * (u1 - u2) * DEG); const r2 = 9.3966 - 0.0882 * Math.cos(2 * (u2 - u3) * DEG);
  const r3 = 14.9883 - 0.0216 * Math.cos(G * DEG); const r4 = 26.3627 - 0.1939 * Math.cos(H * DEG);
  u1 += c1; u2 += c2; u3 += c3; u4 += c4;
  return [{ u: norm360(u1), r: r1 }, { u: norm360(u2), r: r2 }, { u: norm360(u3), r: r3 }, { u: norm360(u4), r: r4 }];
}

/** Moon positions around Jupiter: offsets in Jupiter radii along `back` (away from the viewer) and prograde. */
export function galileanOffsets(date, pole, towardViewer) {
  const back = unit(sub(scale(pole, dot(towardViewer, pole)), towardViewer));
  const prograde = cross(pole, back);
  return galileanPhases(date).map(({ u, r }) => add(scale(back, r * Math.cos(u * DEG)), scale(prograde, r * Math.sin(u * DEG))));
}

/**
 * Everything the sky and the telescope need about the planets at `date`.
 * `gmstDeg` and `obliquityDeg` come from astronomy.mjs so that planets share
 * the Sun and Moon's frame. Vectors are Earth-fixed.
 */
export function planetSky(date, { gmstDeg, obliquityDeg = J2000_OBLIQUITY } = {}) {
  const T = centuriesSinceJ2000(date);
  const earth = heliocentricAt('earth', T);
  const toEarthFixed = (ecliptic) => equatorialToEarthFixed(eclipticToEquatorial(precess(ecliptic, T), obliquityDeg), gmstDeg);
  const poleToEarthFixed = ([ra, dec]) => equatorialToEarthFixed(raDecToEquatorial(ra, dec), gmstDeg);
  return SKY_PLANETS.map((planet) => {
    let helio = heliocentricAt(planet.id, T);
    let geo = sub(helio, earth);
    // One light-time iteration: we see the planet where it was when the light left.
    const lightDays = length(geo) * LIGHT_DAYS_PER_AU;
    helio = heliocentricAt(planet.id, T - lightDays / 36525);
    geo = sub(helio, earth);
    const delta = length(geo); const r = length(helio);
    const phaseAngle = Math.acos(Math.max(-1, Math.min(1, dot(helio, geo) / (r * delta)))) / DEG;
    const elongation = Math.acos(Math.max(-1, Math.min(1, dot(scale(earth, -1), geo) / (length(earth) * delta)))) / DEG;
    const direction = toEarthFixed(geo);
    const toSun = toEarthFixed(scale(helio, -1));
    const pole = poleToEarthFixed(planet.pole);
    const radius = Math.asin(planet.radiusKm / (delta * AU_KM));
    const entry = {
      id: planet.id, name: planet.name, planet,
      helio, geo, distanceAU: delta, sunDistanceAU: r,
      direction, vector: scale(direction, (delta * AU_KM) / EARTH_RADIUS_KM),
      toSun, pole, angularRadius: radius,
      phaseAngle, elongation,
      illuminated: (1 + Math.cos(phaseAngle * DEG)) / 2,
      magnitude: planetMagnitude(planet, r, delta, phaseAngle),
      moons: null
    };
    if (planet.id === 'jupiter') {
      // Moons as Earth-fixed directions: Jupiter direction plus the offset, scaled to its distance.
      const jupiterRadiiInEarthRadii = planet.radiusKm / EARTH_RADIUS_KM;
      const offsets = galileanOffsets(date, pole, scale(direction, -1));
      entry.moons = GALILEAN_MOONS.map((moon, index) => {
        const vector = add(entry.vector, scale(offsets[index], jupiterRadiiInEarthRadii));
        const behind = dot(offsets[index], direction) > 0 && length(sub(offsets[index], scale(direction, dot(offsets[index], direction)))) < 1;
        return { ...moon, direction: unit(vector), vector, angularRadius: Math.asin(moon.radiusKm / (length(vector) * EARTH_RADIUS_KM)), hidden: behind };
      });
    }
    return entry;
  });
}

/** Heliocentric ecliptic positions (AU) of all eight planets for the Solar System view. */
export function solarSystemAt(date) {
  const T = centuriesSinceJ2000(date);
  return PLANETS.map((planet) => ({ ...planet, position: heliocentricAt(planet.id, T) }));
}

/** Days for light to travel `au`. */
export function lightMinutes(au) { return au * LIGHT_DAYS_PER_AU * 1440; }
