// Landmark topology follows MediaPipe's Face Landmarker connection indices.
// Source: https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/face_landmarker/face_landmarks_connections.ts
// The MediaPipe repository source is Apache-2.0 licensed.

const FEATURE_EDGES = [
  // Left and right eye contours.
  [263, 249], [249, 390], [390, 373], [373, 374], [374, 380], [380, 381],
  [381, 382], [382, 362], [263, 466], [466, 388], [388, 387], [387, 386],
  [386, 385], [385, 384], [384, 398], [398, 362],
  [33, 7], [7, 163], [163, 144], [144, 145], [145, 153], [153, 154],
  [154, 155], [155, 133], [33, 246], [246, 161], [161, 160], [160, 159],
  [159, 158], [158, 157], [157, 173], [173, 133],
  // Brows.
  [276, 283], [283, 282], [282, 295], [295, 285], [285, 300], [300, 293],
  [293, 334], [334, 296], [296, 336],
  [46, 53], [53, 52], [52, 65], [65, 55], [55, 70], [70, 63],
  [63, 105], [105, 66], [66, 107],
  // Outer and inner lip contours.
  [61, 146], [146, 91], [91, 181], [181, 84], [84, 17], [17, 314],
  [314, 405], [405, 321], [321, 375], [375, 291], [61, 185], [185, 40],
  [40, 39], [39, 37], [37, 0], [0, 267], [267, 269], [269, 270],
  [270, 409], [409, 291], [78, 95], [95, 88], [88, 178], [178, 87],
  [87, 14], [14, 317], [317, 402], [402, 318], [318, 324], [324, 308],
  [78, 191], [191, 80], [80, 81], [81, 82], [82, 13], [13, 312],
  [312, 311], [311, 310], [310, 415], [415, 308],
];

const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const NOSE_EDGES = [[168, 6], [6, 197], [197, 195], [195, 5], [5, 4], [4, 1], [1, 19], [19, 94], [94, 2], [98, 97], [97, 2], [2, 326], [326, 327]];
const REQUIRED_GUIDE_POINTS = [234, 454, 10, 33, 133, 263, 362, 61, 291, 13, 14, 168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 98, 97, 326, 327, 123, 352];

function isPoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function paintDisk(mask, width, height, x, y, radius) {
  const minX = Math.max(0, Math.ceil(x - radius));
  const maxX = Math.min(width - 1, Math.floor(x + radius));
  const minY = Math.max(0, Math.ceil(y - radius));
  const maxY = Math.min(height - 1, Math.floor(y + radius));
  const radiusSquared = radius * radius;
  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const dx = px - x;
      const dy = py - y;
      if ((dx * dx) + (dy * dy) <= radiusSquared + 0.25) mask[(py * width) + px] = 1;
    }
  }
}

function paintEdge(mask, width, height, a, b, radius) {
  if (!isPoint(a) || !isPoint(b)) return;
  // Ignore corrupted/outlier coordinates rather than letting them trigger a huge loop.
  if ([a.x, a.y, b.x, b.y].some((v) => v < -1 || v > 2)) return;
  const ax = a.x * width;
  const ay = a.y * height;
  const bx = b.x * width;
  const by = b.y * height;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    paintDisk(mask, width, height, ax + ((bx - ax) * t), ay + ((by - ay) * t), radius);
  }
}

function inUnitSquare(point) {
  return isPoint(point) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

function gridPoint(point, width, height) {
  return {
    x: Math.max(0, Math.min(width - 1, Math.floor(point.x * width))),
    y: Math.max(0, Math.min(height - 1, Math.floor(point.y * height))),
  };
}

function addLine(cells, width, height, a, b) {
  if (!inUnitSquare(a) || !inUnitSquare(b)) return;
  const p = gridPoint(a, width, height);
  const q = gridPoint(b, width, height);
  const steps = Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y));
  for (let i = 0; i <= steps; i += 1) {
    const t = steps ? i / steps : 0;
    cells.add((Math.round(p.y + ((q.y - p.y) * t)) * width) + Math.round(p.x + ((q.x - p.x) * t)));
  }
}

function makeMark(kind, edges, face, width, height, points = []) {
  const cells = new Set();
  for (const [a, b] of edges) addLine(cells, width, height, face[a], face[b]);
  for (const index of points) {
    if (!inUnitSquare(face[index])) continue;
    const p = gridPoint(face[index], width, height);
    cells.add((p.y * width) + p.x);
  }
  return { kind, cells: [...cells], points: [...new Set([...edges.flat(), ...points])].filter((i) => inUnitSquare(face[i])).map((i) => ({ x: face[i].x, y: face[i].y })) };
}

function pointMark(kind, points, width, height) {
  const cells = new Set();
  for (const point of points) {
    const p = gridPoint(point, width, height);
    cells.add((p.y * width) + p.x);
  }
  return { kind, cells: [...cells], points: points.map(({ x, y }) => ({ x, y })) };
}

function nearCells(cell, cells, width, height) {
  const x = cell % width;
  const y = Math.floor(cell / width);
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && cells.has((ny * width) + nx)) return true;
    }
  }
  return false;
}

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (((a.y > y) !== (b.y > y)) && x < (((b.x - a.x) * (y - a.y)) / (b.y - a.y)) + a.x) inside = !inside;
  }
  return inside;
}

function rasterizeOval(face, width, height) {
  const polygon = FACE_OVAL.map((index) => face[index]);
  const skin = new Uint8Array(width * height);
  const minX = Math.max(0, Math.floor(Math.min(...polygon.map((point) => point.x)) * width));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(...polygon.map((point) => point.x)) * width) - 1);
  const minY = Math.max(0, Math.floor(Math.min(...polygon.map((point) => point.y)) * height));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(...polygon.map((point) => point.y)) * height) - 1);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (pointInPolygon((x + 0.5) / width, (y + 0.5) / height, polygon)) skin[(y * width) + x] = 1;
    }
  }
  return skin;
}

function polygonArea(polygon) {
  let area = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    area += (a.x * b.y) - (b.x * a.y);
  }
  return Math.abs(area) / 2;
}

/** Build semantic guides for a face. Returns null when the landmarks cannot support them. */
export function rasterizeFaceGuides(landmarks, width, height) {
  if (!Number.isInteger(width) || width <= 0 || width > 512
      || !Number.isInteger(height) || height <= 0 || height > 512) {
    throw new RangeError('width and height must be positive integers up to 512');
  }
  if (!Array.isArray(landmarks)) return null;
  const face = landmarks.find((candidate) => Array.isArray(candidate));
  if (!face || REQUIRED_GUIDE_POINTS.some((index) => !inUnitSquare(face[index]))
      || FACE_OVAL.some((index) => !inUnitSquare(face[index]))) return null;
  if (polygonArea(FACE_OVAL.map((index) => face[index])) < 0.001) return null;

  const faceWidth = Math.abs(face[454].x - face[234].x) * width;
  if (!Number.isFinite(faceWidth) || faceWidth < 6) return null;
  const compact = faceWidth <= 32;
  const eyeEdges = [[33, 133], [263, 362]];
  const noseEdges = compact ? [] : NOSE_EDGES;
  const mouthEdges = compact ? [[61, 291]] : [[61, 13], [13, 291], [291, 14], [14, 61]];
  const marks = [
    makeMark('eye', eyeEdges, face, width, height),
    makeMark('nose', noseEdges, face, width, height, compact ? [2] : []),
    makeMark('mouth', mouthEdges, face, width, height),
  ];
  if (faceWidth <= 16) {
    const eyeCenters = [[33, 133], [263, 362]].map(([outer, inner]) => ({
      x: (face[outer].x + face[inner].x) / 2,
      y: (face[outer].y + face[inner].y) / 2,
    }));
    marks[0] = pointMark('eye', eyeCenters, width, height);
    const left = face[61];
    const right = face[291];
    const center = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
    const trim = (point) => ({ x: center.x + ((point.x - center.x) * 0.65), y: center.y + ((point.y - center.y) * 0.65) });
    const mouthCells = new Set();
    addLine(mouthCells, width, height, trim(left), center);
    addLine(mouthCells, width, height, center, trim(right));
    marks[2] = { kind: 'mouth', cells: [...mouthCells], points: [trim(left), center, trim(right)] };
  }
  const eyeCells = new Set(marks[0].cells);
  const brow = makeMark('brow', [[46, 107], [276, 336]], face, width, height);
  if (faceWidth <= 16) {
    if (!brow.cells.some((cell) => nearCells(cell, eyeCells, width, height))) marks.splice(1, 0, brow);
  } else {
    brow.cells = brow.cells.filter((cell) => !eyeCells.has(cell));
    if (brow.cells.length) marks.splice(1, 0, brow);
  }

  const protectedCells = compact ? new Uint8Array(width * height) : rasterizeFaceFeatures([face], width, height);
  for (const mark of marks) for (const cell of mark.cells) protectedCells[cell] = 1;
  const skin = rasterizeOval(face, width, height);
  const forehead = { x: (face[10].x + face[168].x) / 2, y: (face[10].y + face[168].y) / 2 };
  const samples = [forehead, face[123], face[352]];
  if (compact) marks.find((mark) => mark.kind === 'nose').points = [98, 2, 327].map((index) => ({ x: face[index].x, y: face[index].y }));
  return { width, height, faceWidth, compact, skin, protectedCells, marks, samples };
}

/**
 * Rasterize the eyes, eyebrows and lips from normalized Face Landmarker points.
 * Returns one byte per output pixel (0 = unprotected, 1 = protected).
 */
export function rasterizeFaceFeatures(landmarks, width, height) {
  if (!Number.isInteger(width) || width <= 0 || width > 512
      || !Number.isInteger(height) || height <= 0 || height > 512) {
    throw new RangeError('width and height must be positive integers up to 512');
  }
  const mask = new Uint8Array(width * height);
  if (!Array.isArray(landmarks)) return mask;

  // Protect at most the first detected face, matching the single-face detector policy.
  const face = landmarks.find((candidate) => Array.isArray(candidate));
  if (!face) return mask;
  // Keep detail protection thin: about 0.6% of face width, with a one-pixel minimum.
  const faceWidth = isPoint(face[234]) && isPoint(face[454])
    ? Math.abs(face[454].x - face[234].x) * width
    : width * 0.35;
  const radius = Math.min(4, Math.max(1, faceWidth * 0.006));
  for (const [start, end] of FEATURE_EDGES) paintEdge(mask, width, height, face[start], face[end], radius);
  return mask;
}
