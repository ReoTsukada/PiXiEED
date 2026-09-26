/**
 * Ground-based telescope view of the Sun and Moon.
 *
 * A second, self-contained WebGL2 canvas that shows the sky as seen from one
 * spot on the Earth: sky colour, stars, the Sun (optionally through a solar
 * filter), the Moon with phase and craters, and, at totality, the corona and
 * chromosphere. Everything is drawn from the same ephemeris (astronomy.mjs)
 * that drives the orbit view, so partial, annular and total eclipses match the
 * shadow drawn on the globe.
 */

import { ASTRO_COMMON } from './astro-glsl.mjs?v=20260921-astro-4';
import { observe } from './astronomy.mjs?v=20260921-astro-4';

const DEG = Math.PI / 180;
const MIN_FOV = 0.15;
const MAX_FOV = 100;

const VERTEX_SOURCE = `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

const FRAGMENT_SOURCE = `#version 300 es
precision highp float;
precision highp int;

uniform vec2 uViewport;
uniform float uTanHalf;
uniform vec2 uAim;          // azimuth (0 = north, +east), altitude, radians
uniform vec3 uSunL;         // apparent (refracted) local east / north / up unit vectors
uniform vec3 uMoonL;
uniform vec2 uRadii;        // Sun and Moon angular radii (rad)
uniform float uCoverage;    // fraction of the Sun's disc hidden
uniform float uFilter;      // 1 = solar filter in front of the optics
uniform float uMask;        // 1 = circular field stop
uniform float uSquash;      // vertical squash of a low Sun caused by refraction
uniform mat3 uEnuToCelestial;

out vec4 outColor;

${ASTRO_COMMON}

float bell(float x, float center, float width) {
  float t = (x - center) / width;
  return exp(-t * t);
}

float airmass(float sinAlt) {
  float altitudeDeg = degrees(asin(clamp(sinAlt, -1.0, 1.0)));
  return 1.0 / (max(sinAlt, 0.0) + 0.15 * pow(max(altitudeDeg + 3.885, 0.4), -1.253));
}

void main() {
  vec2 ndc = (gl_FragCoord.xy - 0.5 * uViewport) / (0.5 * uViewport.y);
  float az = uAim.x;
  float alt = uAim.y;
  vec3 forward = vec3(cos(alt) * sin(az), cos(alt) * cos(az), sin(alt));
  vec3 right = vec3(cos(az), -sin(az), 0.0);
  vec3 up = cross(right, forward);
  vec3 ray = normalize(forward + right * (ndc.x * uTanHalf) + up * (ndc.y * uTanHalf));
  float pixelAngle = uTanHalf / (0.5 * uViewport.y);
  float rs = uRadii.x;
  float rm = uRadii.y;

  float sunAltDeg = degrees(asin(clamp(uSunL.z, -1.0, 1.0)));
  float airSun = airmass(uSunL.z);
  vec3 sunTrans = exp(-vec3(0.008, 0.035, 0.085) * airSun);
  vec2 sunFlat = normalize(uSunL.xy + vec2(1e-5));
  vec2 rayFlat = normalize(ray.xy + vec2(1e-5));
  float towardSun = max(dot(rayFlat, sunFlat), 0.0);
  float antiSun = max(-dot(rayFlat, sunFlat), 0.0);
  float elevDeg = degrees(asin(clamp(ray.z, -1.0, 1.0)));
  float aboveHorizon = max(elevDeg, 0.0);

  // ---- Sky: day, twilight and night blend continuously with the Sun's altitude.
  float dayAmt = smoothstep(-8.0, 8.0, sunAltDeg);
  float dim = max(0.02, pow(1.0 - uCoverage, 0.55));
  vec3 nightSky = mix(vec3(0.004, 0.008, 0.022), vec3(0.006, 0.011, 0.030), exp(-aboveHorizon / 18.0));
  vec3 daySky = mix(vec3(0.10, 0.27, 0.62), vec3(0.58, 0.74, 0.92), exp(-aboveHorizon / 22.0)) * 2.1;
  vec3 twilightSky = mix(vec3(0.03, 0.06, 0.20), vec3(0.10, 0.16, 0.40), exp(-aboveHorizon / 25.0)) * 1.6;
  float twilightAmt = bell(sunAltDeg, -5.0, 4.5);
  vec3 color = mix(nightSky, twilightSky, twilightAmt);
  color = mix(color, daySky * dim, dayAmt);

  // Dawn / dusk glow on the horizon toward the Sun, the pink Belt of Venus and
  // the Earth's blue shadow band on the opposite side.
  float warm = bell(sunAltDeg, -0.8, 5.5);
  vec3 warmColor = mix(vec3(1.0, 0.66, 0.30), vec3(1.0, 0.30, 0.12), smoothstep(3.0, -2.0, sunAltDeg));
  float side = 0.22 + 0.78 * pow(towardSun, 2.0);
  color += warmColor * warm * side * (0.95 * exp(-aboveHorizon / 4.0) + 0.35 * exp(-aboveHorizon / 16.0)) * mix(1.0, dim, dayAmt);
  float belt = bell(sunAltDeg, -3.0, 3.5);
  color += vec3(0.85, 0.45, 0.50) * 0.30 * pow(antiSun, 1.5) * belt * bell(elevDeg, 9.0, 7.0);
  color *= 1.0 - 0.35 * pow(antiSun, 1.2) * belt * exp(-aboveHorizon / 3.0);

  // Totality: the whole horizon glows like a 360 degree sunset.
  float totality = smoothstep(0.985, 0.9995, uCoverage) * dayAmt;
  color += vec3(0.95, 0.45, 0.16) * totality * exp(-aboveHorizon / 6.0) * 0.55;

  vec3 celestial = uEnuToCelestial * ray;
  float starFade = 1.0 - clamp(dayAmt * dim * 2.2 + warm * 0.25 + twilightAmt * 0.6, 0.0, 1.0);
  color += starField(celestial, pixelAngle) * starFade * 1.6;
  color = mix(color, vec3(0.012), uFilter);

  // ---- Sun.
  vec3 sxRaw = cross(vec3(0.0, 0.0, 1.0), uSunL);
  vec3 sx = length(sxRaw) > 1e-4 ? normalize(sxRaw) : vec3(1.0, 0.0, 0.0);
  vec3 sy = cross(uSunL, sx);
  float facing = step(0.0, dot(ray, uSunL));
  vec2 q = vec2(dot(ray, sx), dot(ray, sy)) / rs;
  vec2 qs = vec2(q.x, q.y / uSquash);          // a low Sun is flattened by refraction
  float sunR = length(qs);
  float sunAngle = atan(length(cross(ray, uSunL)), dot(ray, uSunL));
  float edge = pixelAngle / rs;
  float sunDisc = (1.0 - smoothstep(1.0 - edge, 1.0 + edge, sunR)) * facing;
  float mu = sqrt(max(0.0, 1.0 - sunR * sunR));
  float limb = 1.0 - 0.62 * (1.0 - mu);
  float granulation = 0.94 + 0.10 * noise3(vec3(qs * 26.0, 1.7));
  float spots = smoothstep(0.66, 0.76, noise3(vec3(qs * 2.4, 4.2))) * smoothstep(0.92, 0.55, sunR);
  float uncovered = 1.0 - uCoverage;
  float nakedLevel = 7.0 * exp(-0.02 * (airSun - 1.0));
  vec3 nakedSun = vec3(1.0, 0.97, 0.90) * limb * nakedLevel * sunTrans * (1.0 - 0.5 * spots);
  vec3 filteredSun = vec3(1.0, 0.60, 0.20) * limb * granulation * (1.0 - 0.55 * spots) * 1.05;
  vec3 sunColor = mix(nakedSun, filteredSun, uFilter);
  float halo = (0.55 / (1.0 + sunR * sunR * 0.7) + 0.05 * exp(-sunR * 0.06)) * pow(uncovered, 1.3) * (1.0 - uFilter) * facing;
  color += vec3(1.0, 0.95, 0.85) * sunTrans * halo;

  // Atmospheric aureole and crepuscular rays around a low Sun.
  float lowSun = smoothstep(16.0, 0.0, sunAltDeg) * smoothstep(-5.0, -0.5, sunAltDeg) * (1.0 - uFilter) * pow(uncovered, 1.3);
  float aureole = (exp(-sunAngle * 2.2) * 0.85 + exp(-sunAngle * 0.5) * 0.16) * lowSun;
  float phiSun = atan(q.y, q.x);
  float rays = 0.45 + 0.9 * pow(fbm3(vec3(cos(phiSun) * 3.6, sin(phiSun) * 3.6, 0.3)), 1.4);
  color += vec3(1.0, 0.70, 0.38) * sqrt(sunTrans) * 0.85 * (aureole + rays * exp(-sunAngle * 5.0) * 0.14 * lowSun);
  color = mix(color, sunColor, sunDisc);

  // Green flash: the last sliver of the upper limb at sunrise / sunset.
  float flash = bell(sunAltDeg, -0.12, 0.28) * (1.0 - uFilter);
  float rim = smoothstep(0.90, 1.0, sunR) * (1.0 - smoothstep(1.0, 1.07, sunR)) * smoothstep(0.25, 0.9, qs.y / max(sunR, 1e-3));
  color += vec3(0.25, 1.0, 0.45) * flash * rim * facing * 1.8;

  // ---- Corona, prominences and chromosphere (visible only while the photosphere is covered).
  float coronaVisible = smoothstep(0.985, 0.9995, uCoverage) * (1.0 - uFilter) * facing;
  if (coronaVisible > 0.0) {
    float r = max(sunR, 1.0);
    float phi = atan(qs.y, qs.x);
    float streamers = 0.42 + 1.15 * pow(fbm3(vec3(cos(phi) * 2.0, sin(phi) * 2.0, r * 0.5)), 1.5);
    float equatorial = 1.0 + 0.6 * cos(2.0 * (phi - 0.25));
    float fine = 0.84 + 0.32 * noise3(vec3(cos(phi) * 30.0, sin(phi) * 30.0, r * 3.0));
    float corona = (0.55 * pow(1.0 / r, 3.6) + 0.13 * pow(1.0 / r, 1.6) + 0.5 * exp(-(r - 1.0) * 9.0)) * streamers * equatorial * fine;
    float prominence = smoothstep(0.58, 0.72, fbm3(vec3(cos(phi) * 2.5 + 7.0, sin(phi) * 2.5, 3.1))) * exp(-(r - 1.0) * 26.0) * step(1.0, sunR);
    float chromosphere = smoothstep(0.992, 1.004, sunR) * (1.0 - smoothstep(1.004, 1.03, sunR));
    color += vec3(1.0, 0.95, 0.85) * corona * coronaVisible * 1.7;
    color += vec3(1.0, 0.22, 0.32) * (prominence * 1.3 + chromosphere * 0.9) * coronaVisible;
  }

  // ---- Baily's beads and the diamond ring just before / after totality.
  float diamond = smoothstep(0.985, 0.997, uCoverage) * (1.0 - smoothstep(0.9992, 0.99995, uCoverage)) * (1.0 - uFilter) * facing;
  if (diamond > 0.0) {
    vec2 moonQ = vec2(dot(uMoonL, sx), dot(uMoonL, sy)) / rs;
    vec2 away = -normalize(moonQ + vec2(1e-6));
    vec2 g = qs - away;
    float glow = exp(-length(g) * 2.6);
    float spikes = 0.0;
    for (int k = 0; k < 3; k++) {
      float a = float(k) * 1.0471976 + 0.42;
      vec2 d = vec2(cos(a), sin(a));
      spikes += exp(-pow(dot(g, vec2(-d.y, d.x)), 2.0) * 240.0) * exp(-abs(dot(g, d)) * 0.5);
    }
    color += vec3(1.0, 0.96, 0.88) * diamond * (glow * 3.5 + spikes * 2.4);
  }

  // ---- Moon: rugged limb, phase, earthshine; a dark disc in front of the Sun.
  vec3 exAxis = normalize(cross(vec3(0.0, 0.0, 1.0), uMoonL) + vec3(1e-6, 0.0, 0.0));
  vec3 eyAxis = cross(-uMoonL, exAxis);
  float phiMoon = atan(dot(ray, eyAxis), dot(ray, exAxis));
  float limbRelief = (fbm3(vec3(cos(phiMoon), sin(phiMoon), 0.3) * 7.0) - 0.5) * 0.012;
  float rmEff = rm * (1.0 + limbRelief);
  float moonAngle = atan(length(cross(ray, uMoonL)), dot(ray, uMoonL));
  float moonDisc = 1.0 - smoothstep(rmEff - pixelAngle, rmEff + pixelAngle, moonAngle);
  if (moonDisc > 0.0) {
    vec3 rho = (ray - uMoonL * dot(ray, uMoonL)) / max(sin(rm), 1e-7);
    float z = sqrt(max(0.0, 1.0 - dot(rho, rho)));
    vec3 normal = normalize(rho - uMoonL * z);
    vec3 local = vec3(dot(normal, exAxis), dot(normal, eyAxis), dot(normal, -uMoonL));
    float lit = smoothstep(-0.03, 0.10, dot(normal, uSunL));
    float albedo = moonAlbedo(local);
    float dayLight = dayAmt * dim;
    vec3 moonColor = vec3(0.88, 0.86, 0.82) * albedo * (0.03 + 1.0 * lit) * mix(1.2, 1.0, dayLight);
    // In totality the dark side is lit faintly by earthshine and the corona: a
    // textured, slightly warm disc rather than a flat black hole.
    moonColor += vec3(1.0, 0.92, 0.85) * albedo * (0.010 + 0.030 * coronaVisible) * (1.0 - lit);
    moonColor *= pow(exp(-vec3(0.008, 0.035, 0.085) * airmass(uMoonL.z)), vec3(0.6));
    moonColor = mix(moonColor, vec3(0.02, 0.019, 0.018) + moonColor * 0.10, uFilter);
    color = mix(color, moonColor, moonDisc);
  }

  // ---- Horizon: low hills, silhouetted against the glow.
  float ridge = 0.004 + 0.010 * fbm3(vec3(cos(atan(ray.x, ray.y)), sin(atan(ray.x, ray.y)), 0.0) * 2.4 + 5.0);
  float below = ray.z - ridge;
  if (below < 0.0) {
    vec3 groundColor = mix(vec3(0.005, 0.007, 0.007), vec3(0.06, 0.065, 0.050), dayAmt * dim);
    groundColor += warmColor * warm * side * 0.012;
    groundColor *= (1.0 - uFilter);
    color = mix(groundColor, color * 0.85, exp(below * 220.0) * 0.5);
  }

  color = 1.0 - exp(-color);
  float field = 1.0 - smoothstep(0.94, 1.0, length(ndc));
  color *= mix(1.0, field, uMask);
  outColor = vec4(color, 1.0);
}
`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'unknown shader error';
    gl.deleteShader(shader);
    throw new Error(`Telescope shader failed: ${message}`);
  }
  return shader;
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Lift a local (east, north, up) direction by atmospheric refraction (Saemundsson). */
function refracted(local) {
  const altitudeDeg = Math.asin(clamp(local[2], -1, 1)) / DEG;
  if (altitudeDeg < -2) return local;
  const arcminutes = 1.02 / Math.tan((altitudeDeg + 10.3 / (altitudeDeg + 5.11)) * DEG);
  const lifted = clamp(altitudeDeg + arcminutes / 60, -90, 90) * DEG;
  const flat = Math.hypot(local[0], local[1]);
  if (flat < 1e-9) return local;
  const scale = Math.cos(lifted) / flat;
  return [local[0] * scale, local[1] * scale, Math.sin(lifted)];
}

export function createScope({ canvas, onChange = () => {} } = {}) {
  let gl = null;
  let program = null;
  let locations = null;
  let buffer = null;
  let vao = null;
  let opened = false;
  let state = null;
  let observer = { latitude: 35, longitude: 139 };
  let observation = null;
  let azimuth = 180 * DEG;
  let altitude = 30 * DEG;
  let fov = 3;
  let filterOn = true;
  let tracking = 'sun';
  let observer_ = null;
  let frame = null;

  function ensureContext() {
    if (gl) return true;
    try { gl = canvas.getContext('webgl2', { alpha: false, antialias: false }); } catch { gl = null; }
    if (!gl) return false;
    program = gl.createProgram();
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Telescope program failed: ${gl.getProgramInfoLog(program)}`);
    vao = gl.createVertexArray();
    buffer = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    const names = ['uViewport', 'uTanHalf', 'uAim', 'uSunL', 'uMoonL', 'uRadii', 'uCoverage', 'uFilter', 'uMask', 'uSquash', 'uEnuToCelestial'];
    locations = Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)]));
    return true;
  }

  function resizeBacking() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, 1.5);
    const width = Math.max(2, Math.round((rect.width || canvas.clientWidth || 640) * dpr));
    const height = Math.max(2, Math.round((rect.height || canvas.clientHeight || 480) * dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  }

  function enuToCelestialMatrix() {
    const g = state.gmstDegrees * DEG;
    const rotate = (v) => [v[0] * Math.cos(g) + v[2] * Math.sin(g), v[1], v[2] * Math.cos(g) - v[0] * Math.sin(g)];
    return new Float32Array([...rotate(observation.east), ...rotate(observation.north), ...rotate(observation.up)]);
  }

  function aimAt(local) {
    azimuth = Math.atan2(local[0], local[1]);
    altitude = Math.asin(clamp(local[2], -1, 1));
  }

  function applyTracking() {
    if (!observation) return;
    if (tracking === 'sun') aimAt(refracted(observation.sunLocal));
    else if (tracking === 'moon') aimAt(refracted(observation.moonLocal));
    // Keep a low Sun in the lower part of the frame with the sky above it.
    if (tracking === 'sun') altitude = Math.max(altitude, (fov * 0.22) * DEG);
  }

  function draw() {
    frame = null;
    if (!opened || !state || !observation || !ensureContext()) return;
    resizeBacking();
    // The filter fades out over the last moments before totality (and back in
    // afterwards) instead of snapping, so the sky never flips abruptly.
    const t = clamp((observation.obscuration - 0.990) / (0.9995 - 0.990), 0, 1);
    const sunApparent = refracted(observation.sunLocal);
    const moonApparent = refracted(observation.moonLocal);
    const sunAltitudeApparent = Math.asin(clamp(sunApparent[2], -1, 1)) / DEG;
    // A low Sun is dim enough to look at, so the filter also fades out toward the horizon.
    const lowSun = clamp((sunAltitudeApparent - 1) / 7, 0, 1);
    const filter = filterOn ? (1 - t * t * (3 - 2 * t)) * (lowSun * lowSun * (3 - 2 * lowSun)) : 0;
    const squash = 1 - 0.16 * Math.exp(-Math.max(sunAltitudeApparent, 0) / 2.0);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.uniform2f(locations.uViewport, canvas.width, canvas.height);
    gl.uniform1f(locations.uTanHalf, Math.tan((fov * DEG) / 2));
    gl.uniform2f(locations.uAim, azimuth, altitude);
    gl.uniform3fv(locations.uSunL, sunApparent);
    gl.uniform3fv(locations.uMoonL, moonApparent);
    gl.uniform2f(locations.uRadii, observation.sunRadius, observation.moonRadius);
    gl.uniform1f(locations.uCoverage, observation.obscuration);
    gl.uniform1f(locations.uFilter, filter);
    gl.uniform1f(locations.uSquash, squash);
    gl.uniform1f(locations.uMask, 1 - clamp((fov - 12) / 8, 0, 1));
    gl.uniformMatrix3fv(locations.uEnuToCelestial, false, enuToCelestialMatrix());
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  function requestDraw() {
    if (frame !== null || typeof requestAnimationFrame !== 'function') { if (frame === null) draw(); return; }
    frame = requestAnimationFrame(draw);
  }

  function recompute() {
    if (!state) return;
    observation = observe(state, observer.latitude, observer.longitude);
    applyTracking();
    onChange(snapshot());
    requestDraw();
  }

  function snapshot() {
    return Object.freeze({
      open: opened, observer: { ...observer }, observation, azimuth: azimuth / DEG, altitude: altitude / DEG, fov, filter: filterOn, tracking,
      filterActive: filterOn && !(observation && observation.obscuration >= 0.9995),
      aim: { azimuth, altitude }
    });
  }

  // One finger aims the telescope, two fingers pinch the field of view.
  let drag = null; const touches = new Map(); let pinchDistance = 0;
  function spread() { const [first, second] = [...touches.values()]; return Math.max(1, Math.hypot(first.x - second.x, first.y - second.y)); }
  function onPointerDown(event) {
    if (!opened) return;
    canvas.setPointerCapture?.(event.pointerId);
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.size >= 2) { drag = null; pinchDistance = spread(); return; }
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }
  function onPointerMove(event) {
    if (!opened || !touches.has(event.pointerId)) return;
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.size >= 2) { const next = spread(); setFov(fov * (pinchDistance / next)); pinchDistance = next; return; }
    if (!drag || drag.id !== event.pointerId) return;
    const rect = canvas.getBoundingClientRect();
    const perPixel = (fov * DEG) / (rect.height || 600);
    azimuth -= (event.clientX - drag.x) * perPixel / Math.max(Math.cos(altitude), 0.15);
    altitude = clamp(altitude + (event.clientY - drag.y) * perPixel, -10 * DEG, 90 * DEG);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    tracking = null;
    onChange(snapshot());
    requestDraw();
  }
  function onPointerUp(event) {
    touches.delete(event.pointerId); canvas.releasePointerCapture?.(event.pointerId);
    if (touches.size === 1) { const [[id, point]] = [...touches.entries()]; drag = { id, x: point.x, y: point.y }; pinchDistance = 0; return; }
    if (touches.size === 0) drag = null;
  }
  function onWheel(event) {
    if (!opened) return;
    event.preventDefault();
    setFov(fov * Math.exp(clamp(event.deltaY, -120, 120) * 0.0016));
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  if (typeof ResizeObserver !== 'undefined') { observer_ = new ResizeObserver(() => requestDraw()); observer_.observe(canvas); }

  function setFov(next) {
    fov = clamp(next, MIN_FOV, MAX_FOV);
    onChange(snapshot());
    requestDraw();
  }

  return Object.freeze({
    open(nextObserver, celestial) {
      observer = { latitude: clamp(nextObserver.latitude, -90, 90), longitude: nextObserver.longitude };
      opened = true;
      if (celestial) state = celestial;
      tracking = 'sun';
      recompute();
      if (observation && observation.sunAltitude < -2) {
        tracking = observation.moonAltitude > 0 ? 'moon' : null;
        if (!tracking) { azimuth = 180 * DEG; altitude = 25 * DEG; }
        applyTracking();
        onChange(snapshot());
        requestDraw();
      }
    },
    close() { opened = false; onChange(snapshot()); },
    isOpen: () => opened,
    setState(celestial) { state = celestial; recompute(); },
    setObserver(next) { observer = { latitude: clamp(next.latitude, -90, 90), longitude: next.longitude }; recompute(); },
    setFov,
    setFilter(value) { filterOn = Boolean(value); onChange(snapshot()); requestDraw(); },
    track(target) { tracking = target; applyTracking(); onChange(snapshot()); requestDraw(); },
    getSnapshot: snapshot,
    redraw: requestDraw,
    destroy() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      observer_?.disconnect();
    }
  });
}
