/**
 * GLSL shared by the orbit view (webgl-renderer.mjs) and the telescope view
 * (scope.mjs): procedural noise, a star field that stays sharp at any zoom,
 * the Sun/Moon disc-overlap fraction, and the Moon's surface albedo.
 */
export const ASTRO_COMMON = `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

vec3 hash33(vec3 p) {
  vec3 q = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(q) * 43758.5453123);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}

float fbm3(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * noise3(p);
    p = p * 2.03 + 11.7;
    amp *= 0.5;
  }
  return sum;
}

// Fraction of the Sun's disc hidden by the Moon, all radii relative to the Sun's.
float discCoverage(float separation, float sunRadius, float moonRadius) {
  float s = separation / sunRadius;
  float r = moonRadius / sunRadius;
  if (s >= 1.0 + r) return 0.0;
  if (s <= abs(r - 1.0)) return r >= 1.0 ? 1.0 : r * r;
  float a = acos(clamp((s * s + 1.0 - r * r) / (2.0 * s), -1.0, 1.0));
  float b = r * r * acos(clamp((s * s + r * r - 1.0) / (2.0 * s * r), -1.0, 1.0));
  float c = 0.5 * sqrt(max(0.0, (-s + 1.0 + r) * (s + 1.0 - r) * (s - 1.0 + r) * (s + 1.0 + r)));
  return clamp((a + b - c) / 3.14159265359, 0.0, 1.0);
}

float starLayer(vec3 direction, float frequency, float density, float pixelAngle) {
  vec3 p = direction * frequency;
  vec3 cell = floor(p);
  if (hash13(cell) > density) return 0.0;
  vec3 offset = 0.22 + 0.56 * hash33(cell + 7.7);
  float angular = length(p - cell - offset) / frequency;
  // Few bright stars, many faint ones: brightness falls off steeply with rank.
  float rank = hash13(cell + 3.1);
  float brightness = pow(rank, 5.0);
  float radius = pixelAngle * (0.5 + 0.9 * brightness);
  float core = exp(-angular * angular / (radius * radius));
  float halo = exp(-angular * angular / (radius * radius * 22.0)) * 0.10 * brightness;
  return (core * (0.10 + 1.5 * brightness)) + halo;
}

vec3 starField(vec3 direction, float pixelAngle) {
  float s = starLayer(direction, 34.0, 0.030, pixelAngle) + starLayer(direction, 80.0, 0.010, pixelAngle) + starLayer(direction, 190.0, 0.0028, pixelAngle) + starLayer(direction, 440.0, 0.0007, pixelAngle);
  // Stellar colour: mostly white, some blue-white and some amber.
  float t = hash13(floor(direction * 61.0) + 5.0);
  vec3 tint = t < 0.25 ? vec3(0.70, 0.82, 1.0) : t > 0.80 ? vec3(1.0, 0.80, 0.60) : vec3(1.0, 0.97, 0.92);
  return s * tint;
}

// Moon surface brightness from a normal in the Moon's own (near-side-facing) frame.
float moonAlbedo(vec3 local) {
  float maria = smoothstep(0.46, 0.60, fbm3(local * 2.4 + 3.0));
  float craters = fbm3(local * 15.0);
  float fine = noise3(local * 55.0);
  return mix(0.86, 0.40, maria) * (0.74 + 0.30 * craters + 0.12 * fine);
}
`;
