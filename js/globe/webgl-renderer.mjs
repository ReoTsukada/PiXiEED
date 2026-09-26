/**
 * WebGL2 globe backend.
 *
 * The renderer deliberately does not receive projected cell objects. A single
 * fullscreen quad reconstructs the front hemisphere in the fragment shader,
 * samples the deterministic land mask, and draws the authoritative half-degree
 * grid lines analytically. JavaScript only updates uniforms while the view is
 * rotating.
 */

import { ASTRO_COMMON } from './astro-glsl.mjs?v=20260921-astro-4';
import { WORLD_LAND_MASK } from '../../assets/maps/world-land-mask-v1.mjs?v=20260920-webgl2-1';

export const WEBGL_RENDERER_VERSION = 'webgl2-analytic-sphere-v9';

const VERTEX_SOURCE = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT_SOURCE = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uLandMask;
uniform vec2 uViewport;
uniform vec2 uCenter;
uniform float uScale;
uniform vec4 uOrientation;
uniform sampler2D uBandTex;
uniform float uLatStep;
uniform int uBandTotal;
uniform sampler2D uSky;
uniform float uSkyReady;
uniform vec3 uSunDir;      // unit vector to the Sun, Earth-fixed frame
uniform vec3 uMoonVec;     // geocentric Moon position in Earth radii, Earth-fixed frame
uniform vec4 uAstro;       // x: day/night + eclipse lighting, y: sky bodies, z: sun sprite scale, w: moon sprite scale
uniform vec2 uSunSky;      // x: Sun angular radius (rad), y: Greenwich sidereal angle (rad)
uniform ivec2 uSelectedCell;
uniform ivec2 uHoveredCell;

out vec4 outColor;

vec3 rotateByQuaternion(vec3 vector, vec4 quaternion) {
  return vector + 2.0 * cross(quaternion.xyz, cross(quaternion.xyz, vector) + quaternion.w * vector);
}


${ASTRO_COMMON}
// How much of the Sun a point on the Earth's surface sees covered by the Moon.
float eclipseObscuration(vec3 point) {
  vec3 toMoon = uMoonVec - point;
  float distanceToMoon = length(toMoon);
  vec3 moonDirection = toMoon / distanceToMoon;
  float cosine = dot(moonDirection, uSunDir);
  if (cosine <= 0.0) return 0.0;
  float separation = atan(length(cross(moonDirection, uSunDir)), cosine);
  float moonRadius = asin(min(1.0, 0.27239 / distanceToMoon));
  if (separation >= uSunSky.x + moonRadius) return 0.0;
  return discCoverage(separation, uSunSky.x, moonRadius);
}

float surfaceLight(vec3 normal) {
  if (uAstro.x < 0.5) return 1.0;
  float day = smoothstep(-0.08, 0.16, dot(normal, uSunDir));
  float obscured = day > 0.0 ? eclipseObscuration(normal) : 0.0;
  return mix(0.26, 1.0, day) * (1.0 - 0.72 * obscured);
}

vec3 sunSprite(vec3 direction, float radius) {
  float angle = atan(length(cross(direction, uSunDir)), dot(direction, uSunDir));
  float core = 1.0 - smoothstep(radius * 0.92, radius * 1.03, angle);
  float x = angle / radius;
  float glow = 0.9 / (1.0 + x * x * 0.9) * exp(-x * 0.045) + 0.35 * exp(-x * 0.35);
  return vec3(1.0, 0.94, 0.80) * (core * 5.0 + glow);
}

vec4 moonSprite(vec3 direction, vec3 cameraPosition) {
  vec3 toMoon = uMoonVec - cameraPosition;
  float distanceToMoon = length(toMoon);
  vec3 moonDirection = toMoon / distanceToMoon;
  float trueRadius = asin(min(1.0, 0.27239 / distanceToMoon));
  float radius = trueRadius * uAstro.w;
  float angle = atan(length(cross(direction, moonDirection)), dot(direction, moonDirection));
  if (angle > radius * 1.04) return vec4(0.0);
  vec3 tangent = direction - moonDirection * dot(direction, moonDirection);
  vec3 rho = tangent / max(sin(radius), 1e-7);
  float z = sqrt(max(0.0, 1.0 - dot(rho, rho)));
  vec3 normal = normalize(rho - moonDirection * z);
  vec3 nearSide = -normalize(uMoonVec);
  vec3 ex = normalize(cross(vec3(0.0, 1.0, 0.0), nearSide));
  vec3 ey = cross(nearSide, ex);
  vec3 local = vec3(dot(normal, ex), dot(normal, ey), dot(normal, nearSide));
  float albedo = moonAlbedo(local);
  float lit = smoothstep(-0.03, 0.10, dot(normal, uSunDir));
  vec3 color = vec3(0.88, 0.86, 0.82) * albedo * (0.035 + 1.05 * lit);
  float alpha = 1.0 - smoothstep(radius * 0.965, radius * 1.03, angle);
  return vec4(color, alpha);
}

vec4 oceanColor(float radialSquared) {
  vec3 base = vec3(0.012, 0.022, 0.034);
  float rim = smoothstep(0.90, 1.0, radialSquared) * 0.32;
  return vec4(mix(base, vec3(0.40, 0.66, 0.76), rim), 1.0);
}

float bandCountAt(int band) { return texelFetch(uBandTex, ivec2(band, 0), 0).r; }

bool landAt(float longitude, float latitude) {
  if (latitude >= 90.0 || latitude <= -90.0) return false;
  float wrapped = longitude - 360.0 * floor((longitude + 180.0) / 360.0);
  int band = int(clamp(floor((90.0 - latitude) / uLatStep), 0.0, float(uBandTotal - 1)));
  float count = bandCountAt(band);
  float column = clamp(floor((wrapped + 180.0) / 360.0 * count), 0.0, count - 1.0);
  return texelFetch(uLandMask, ivec2(int(column), uBandTotal - 1 - band), 0).r > 0.5;
}

vec3 skyColor() {
  // The camera orbits the globe: every pixel is a view ray, rotated by the same
  // orientation that turns the globe, into a fixed equirectangular star sphere.
  vec2 p = gl_FragCoord.xy - 0.5 * uViewport;
  float focal = uViewport.y * 0.5 / tan(radians(34.0));
  vec3 d = normalize(rotateByQuaternion(normalize(vec3(p / focal, -1.0)), uOrientation));
  // Stars are fixed on the celestial sphere; the Earth-fixed frame turns under them.
  float g = uSunSky.y;
  vec3 celestial = vec3(d.x * cos(g) + d.z * sin(g), d.y, d.z * cos(g) - d.x * sin(g));
  vec2 uv = vec2(atan(celestial.x, celestial.z) / 6.28318530718 + 0.5, 0.5 - asin(clamp(celestial.y, -1.0, 1.0)) / 3.14159265359);
  vec2 ddx = dFdx(uv);
  vec2 ddy = dFdy(uv);
  ddx.x -= floor(ddx.x + 0.5);   // keep the derivative finite across the wrap seam
  ddy.x -= floor(ddy.x + 0.5);
  vec3 color = textureGrad(uSky, uv, ddx, ddy).rgb;
  vec3 base = mix(vec3(0.008, 0.014, 0.028), color * 0.9, uSkyReady);
  base += starField(celestial, 1.0 / focal);
  if (uAstro.y > 0.5) {
    vec3 cameraPosition = rotateByQuaternion(vec3(0.0, 0.0, 6.0), uOrientation);
    base += sunSprite(d, uSunSky.x * uAstro.z);
    vec4 moon = moonSprite(d, cameraPosition);
    base = mix(base, moon.rgb, moon.a);
  }
  return 1.0 - exp(-base * 1.35);
}

vec4 globe() {
  vec2 cameraPoint = (gl_FragCoord.xy - vec2(uCenter.x, uViewport.y - uCenter.y)) / uScale;
  float radialSquared = dot(cameraPoint, cameraPoint);
  if (radialSquared > 1.0) return vec4(0.0);

  float edgeAlpha = clamp((1.0 - sqrt(radialSquared)) * uScale, 0.0, 1.0);
  float depth = sqrt(max(0.0, 1.0 - radialSquared));
  // getViewQuaternion maps the camera's forward vector to the geographic
  // centre. This is the inverse of the projection's world-to-camera step.
  vec3 world = rotateByQuaternion(vec3(cameraPoint, depth), uOrientation);
  float sunlight = surfaceLight(world);
  float longitude = degrees(atan(world.x, world.z));
  float latitude = degrees(asin(clamp(world.y, -1.0, 1.0)));
  float bandFloat = clamp(floor((90.0 - latitude) / uLatStep), 0.0, float(uBandTotal - 1));
  int band = int(bandFloat);
  float longitudeCount = bandCountAt(band);
  float columnFloat = clamp(floor((longitude + 180.0) / 360.0 * longitudeCount), 0.0, longitudeCount - 1.0);
  // The mask stores one texel per authoritative cell (x = column, y = band),
  // so a cell is always wholly land or wholly water. Sampling by longitude
  // instead cut cells in half wherever texel and cell edges did not align.
  float land = texelFetch(uLandMask, ivec2(int(columnFloat), uBandTotal - 1 - band), 0).r;

  float baseLongitudeGrid = (longitude + 180.0) / 360.0 * longitudeCount;
  float baseLatitudeGrid = (90.0 - latitude) / uLatStep;
  // Pixel size in degrees, from quantities that stay continuous across latitude
  // band edges (where the column count changes) and across the antimeridian.
  // Differentiating the per-band column coordinate spiked at every band edge and
  // drew stray streaks in the sea.
  vec2 heading = normalize(world.xz + vec2(1e-6));
  float lonDegPerPixel = degrees(length(fwidth(heading)));
  float latDegPerPixel = fwidth(latitude);
  float cellWidthEarly = 360.0 / longitudeCount;
  float baseFootprint = max(lonDegPerPixel / cellWidthEarly, latDegPerPixel / uLatStep);
  float basePixelsPerCell = 1.0 / max(baseFootprint, 0.0001);
  // Rounded, interlocking tiles only appear once a cell is big enough to read.
  float detail = smoothstep(5.0, 14.0, basePixelsPerCell);

  // Cell-local coordinates: u east, v south, both 0..1 inside the cell.
  float cellWidth = 360.0 / longitudeCount;
  float cellWest = -180.0 + columnFloat * cellWidth;
  float cellNorth = 90.0 - bandFloat * uLatStep;
  float centerLon = cellWest + cellWidth * 0.5;
  float centerLat = cellNorth - uLatStep * 0.5;
  float u = (longitude - cellWest) / cellWidth;
  float v = (cellNorth - latitude) / uLatStep;

  bool selected = band == uSelectedCell.x && int(columnFloat) == uSelectedCell.y;
  bool hovered = band == uHoveredCell.x && int(columnFloat) == uHoveredCell.y;

  // Zoomed out, single-cell coastline steps alias into a noisy edge. Estimate how
  // much of this pixel is land from a few taps around it and blend it in, so the
  // coast reads as a soft, continuous outline that sharpens into tiles on zoom-in.
  float landCoverage = land;
  if (detail < 1.0) {
    float tapLon = lonDegPerPixel * 0.4;
    float tapLat = latDegPerPixel * 0.4;
    float taps = 2.0 * land;
    taps += landAt(longitude + tapLon, latitude + tapLat) ? 1.0 : 0.0;
    taps += landAt(longitude - tapLon, latitude + tapLat) ? 1.0 : 0.0;
    taps += landAt(longitude + tapLon, latitude - tapLat) ? 1.0 : 0.0;
    taps += landAt(longitude - tapLon, latitude - tapLat) ? 1.0 : 0.0;
    landCoverage = mix(taps / 6.0, land, detail);
  }

  if (landCoverage < 0.04) {
    return vec4(oceanColor(radialSquared).rgb * sunlight, edgeAlpha);
  }

  // Every land cell is drawn as its own softly rounded, slightly raised button.
  // No grid lines are drawn: the small gap between buttons is the only separator,
  // and both the gap and the rounding fade away (detail -> 0) as the globe zooms
  // out, so the far view is a clean solid planet that breaks into buttons on zoom-in.
  float coverage = 1.0;
  float rim = 1.0;
  float lift = 0.0;
  if (detail > 0.0 && land >= 0.5) {
    float inset = 0.055 * detail;
    float radius = 0.19 * detail;
    vec2 p = vec2(u - 0.5, 0.5 - v);
    vec2 q = abs(p) - vec2(0.5 - inset) + radius;
    float distanceToShape = min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radius;
    float edgeWidth = max(baseFootprint, 0.0001) * 0.75;
    coverage = 1.0 - smoothstep(-edgeWidth, edgeWidth, distanceToShape);
    if (coverage <= 0.003) return vec4(oceanColor(radialSquared).rgb * sunlight, edgeAlpha);
    rim = smoothstep(0.0, 0.18, -distanceToShape);           // 0 at the button edge, 1 inside
    lift = ((0.5 - v) * 0.12 - (1.0 - rim) * 0.10) * detail;   // lighter top, darker bevel
  }
  vec3 fill = selected ? vec3(1.0, 0.82, 0.34) : hovered ? vec3(0.48, 0.92, 0.90) : vec3(0.35, 0.68, 0.72);
  vec3 color = fill * (1.0 + lift);
  if (selected || hovered) color = mix(color, vec3(1.0, 0.96, 0.70), (1.0 - rim) * 0.7 * detail);
  float landAlpha = (selected || hovered ? 0.98 : 0.92) * coverage * smoothstep(0.04, 0.6, landCoverage);
  return vec4(mix(oceanColor(radialSquared).rgb, color, landAlpha) * sunlight, edgeAlpha);
}

void main() {
  vec4 planet = globe();
  outColor = vec4(mix(skyColor(), planet.rgb, planet.a), 1.0);
}
`;

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${name} must be finite.`);
  return number;
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'unknown shader error';
    gl.deleteShader(shader);
    throw new Error(`WebGL shader compilation failed: ${message}`);
  }
  return shader;
}

function createProgram(gl) {
  const vertex = createShader(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'unknown program link error';
    gl.deleteProgram(program);
    throw new Error(`WebGL program link failed: ${message}`);
  }
  return program;
}

function quaternionToFloat32(quaternion) {
  return new Float32Array([quaternion.x, quaternion.y, quaternion.z, quaternion.w]);
}

function bandCounts(grid) {
  if (!grid?.bands || !grid.bands.length) throw new RangeError('WebGL2 globe requires a grid with latitude bands.');
  return new Float32Array(grid.bands.map((band) => band.longitudeCount));
}

function createBandTexture(gl, counts) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, counts.length, 1, 0, gl.RED, gl.FLOAT, counts);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

function selectedCoordinates(cell) {
  return cell ? new Int32Array([cell.band, cell.column]) : new Int32Array([-1, -1]);
}

function unpackStaticMask(maskData) {
  const source = new Uint8Array(maskData.width * maskData.height);
  let offset = 0;
  for (const [value, length] of maskData.runs) {
    source.fill(value, offset, offset + length);
    offset += length;
  }
  if (offset !== source.length) throw new RangeError('Static globe land mask is incomplete.');
  // The generated rows are north-to-south, while WebGL texture row 0 is the
  // bottom row. Keep the shader's adaptive-raster UV convention unchanged.
  const values = new Uint8Array(source.length);
  for (let row = 0; row < maskData.height; row += 1) {
    const from = row * maskData.width;
    const to = (maskData.height - 1 - row) * maskData.width;
    values.set(source.subarray(from, from + maskData.width), to);
  }
  return { width: maskData.width, height: maskData.height, values };
}

function createMaskTexture(gl, rasterData, grid) {
  if (!rasterData?.countryIndices) {
    // No generated raster: derive one value per cell from the static 0.5 degree
    // mask, sampled at each cell's centre.
    const staticMask = unpackStaticMask(WORLD_LAND_MASK);
    const perCell = new Uint8Array(staticMask.width * grid.bandCount);
    for (let band = 0; band < grid.bandCount; band += 1) {
      const count = grid.bands[band].longitudeCount;
      const staticBand = Math.min(staticMask.height - 1, Math.floor(((band + 0.5) / grid.bandCount) * staticMask.height));
      const sourceRow = (staticMask.height - 1 - staticBand) * staticMask.width;
      const targetRow = (grid.bandCount - 1 - band) * staticMask.width;
      for (let column = 0; column < count; column += 1) {
        const texel = Math.min(staticMask.width - 1, Math.floor(((column + 0.5) / count) * staticMask.width));
        perCell[targetRow + column] = staticMask.values[sourceRow + texel];
      }
    }
    return uploadMaskTexture(gl, perCell, staticMask.width, grid.bandCount);
  }
  const width = rasterData.textureWidth;
  const height = rasterData.textureHeight;
  const mask = new Uint8Array(width * height);
  let offset = 0;
  for (let band = 0; band < grid.bandCount; band += 1) {
    const count = grid.bands[band].longitudeCount;
    const row = (height - 1 - band) * width;
    for (let column = 0; column < count; column += 1) mask[row + column] = rasterData.countryIndices[offset + column] ? 255 : 0;
    offset += count;
  }
  return uploadMaskTexture(gl, mask, width, height);
}

function uploadMaskTexture(gl, values, width, height) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, values);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

function loadSkyTexture(gl, url, onReady) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([2, 4, 8, 255]));
  gl.bindTexture(gl.TEXTURE_2D, null);
  if (url && typeof Image !== 'undefined') {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
        onReady(true);
      } catch { /* keep the flat dark sky */ }
    };
    image.src = url;
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

export function createWebGLRenderer(canvas, { grid, rasterData = null, skyUrl = '', onSkyReady = () => {} } = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') return null;
  let gl;
  try {
    gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: true });
  } catch {
    return null;
  }
  if (!gl) return null;

  try {
    const program = createProgram(gl);
    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const locations = Object.freeze({
      landMask: gl.getUniformLocation(program, 'uLandMask'),
      viewport: gl.getUniformLocation(program, 'uViewport'),
      center: gl.getUniformLocation(program, 'uCenter'),
      scale: gl.getUniformLocation(program, 'uScale'),
      orientation: gl.getUniformLocation(program, 'uOrientation'),
      bandTex: gl.getUniformLocation(program, 'uBandTex'),
      latStep: gl.getUniformLocation(program, 'uLatStep'),
      bandTotal: gl.getUniformLocation(program, 'uBandTotal'),
      sky: gl.getUniformLocation(program, 'uSky'),
      skyReady: gl.getUniformLocation(program, 'uSkyReady'),
      sunDir: gl.getUniformLocation(program, 'uSunDir'),
      moonVec: gl.getUniformLocation(program, 'uMoonVec'),
      astro: gl.getUniformLocation(program, 'uAstro'),
      sunSky: gl.getUniformLocation(program, 'uSunSky'),
      selectedCell: gl.getUniformLocation(program, 'uSelectedCell'),
      hoveredCell: gl.getUniformLocation(program, 'uHoveredCell')
    });
    const counts = bandCounts(grid);
    const bandTexture = createBandTexture(gl, counts);
    let skyReady = 0;
    let astronomy = { sunDirection: [1, 0, 0], moonVector: [0, 0, -60], sunRadius: 0.00465, gmstRadians: 0, lighting: false, bodies: false, sunScale: 1, moonScale: 1 };
    const skyTexture = loadSkyTexture(gl, skyUrl, () => { skyReady = 1; onSkyReady(); });
    let texture = null;
    let currentRaster = rasterData;
    let lastFrame = Object.freeze({ backend: 'webgl2', drawCalls: 0, instanceCount: 0, frameMs: 0 });

    function setRasterData(nextRaster) {
      currentRaster = nextRaster;
      if (texture) gl.deleteTexture(texture);
      texture = createMaskTexture(gl, currentRaster, grid);
    }
    setRasterData(currentRaster);

    function draw({ camera, selected = null, hovered = null } = {}) {
      const started = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      if (!camera?.viewport || !texture) {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        lastFrame = Object.freeze({ backend: 'webgl2', drawCalls: 0, instanceCount: 0, frameMs: 0 });
        return lastFrame;
      }
      const viewportWidth = camera.viewport.physicalWidth;
      const viewportHeight = camera.viewport.physicalHeight;
      gl.viewport(0, 0, viewportWidth, viewportHeight);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(locations.landMask, 0);
      gl.uniform2f(locations.viewport, viewportWidth, viewportHeight);
      gl.uniform2f(locations.center, camera.viewport.physicalCenterX, camera.viewport.physicalCenterY);
      gl.uniform1f(locations.scale, camera.scale * camera.viewport.dpr);
      gl.uniform4fv(locations.orientation, quaternionToFloat32(camera.orientation));
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, bandTexture);
      gl.uniform1i(locations.bandTex, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, skyTexture);
      gl.uniform1i(locations.sky, 2);
      gl.uniform1f(locations.skyReady, skyReady);
      gl.uniform3fv(locations.sunDir, astronomy.sunDirection);
      gl.uniform3fv(locations.moonVec, astronomy.moonVector);
      gl.uniform4f(locations.astro, astronomy.lighting ? 1 : 0, astronomy.bodies ? 1 : 0, astronomy.sunScale, astronomy.moonScale);
      gl.uniform2f(locations.sunSky, astronomy.sunRadius, astronomy.gmstRadians);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1f(locations.latStep, grid.latitudeStepDegrees);
      gl.uniform1i(locations.bandTotal, grid.bandCount);
      gl.uniform2iv(locations.selectedCell, selectedCoordinates(selected?.cell));
      gl.uniform2iv(locations.hoveredCell, selectedCoordinates(hovered?.cell));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      const ended = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      lastFrame = Object.freeze({ backend: 'webgl2', drawCalls: 1, instanceCount: 1, frameMs: ended - started });
      return lastFrame;
    }

    return Object.freeze({
      version: WEBGL_RENDERER_VERSION,
      backend: 'webgl2',
      draw,
      setRasterData,
      setAstronomy(next) { astronomy = { ...astronomy, ...next, lighting: false }; }, // the globe carries no day/night or eclipse shading
      getMetrics: () => lastFrame,
      destroy() {
        if (texture) gl.deleteTexture(texture);
        gl.deleteTexture(bandTexture);
        gl.deleteTexture(skyTexture);
        gl.deleteBuffer(buffer);
        gl.deleteVertexArray(vao);
        gl.deleteProgram(program);
      }
    });
  } catch {
    return null;
  }
}
