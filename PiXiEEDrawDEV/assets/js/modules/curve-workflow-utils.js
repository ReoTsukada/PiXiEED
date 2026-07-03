(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createCurveWorkflowUtils(rawScope = {}) {
    const scope = new Proxy(rawScope, {
      has() {
        return true;
      },
      get(target, key) {
        if (key === Symbol.unscopables) {
          return undefined;
        }
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          return target[key];
        }
        return globalThis[key];
      },
      set(target, key, value) {
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          target[key] = value;
          return true;
        }
        globalThis[key] = value;
        return true;
      },
    });

    return ((scope) => {
      with (scope) {
  function handleCurvePointerDown(event, position, layer) {
    if (!position || !layer) {
      pointerState.active = false;
      return;
    }
    hoverPixel = null;
    requestOverlayRender();

    if (!curveBuilder) {
      beginHistory('curve');
      curveBuilder = {
        stage: 'line',
        start: position,
        end: position,
        control1: null,
        control2: null,
        awaitingEndPoint: true,
      };
    }

    if (curveBuilder.stage === 'line') {
      pointerState.active = true;
      pointerState.pointerId = event.pointerId;
      pointerState.tool = 'curve';
      pointerState.start = curveBuilder.start || position;
      pointerState.current = position;
      pointerState.last = position;
      pointerState.path = [position];
      pointerState.curveHandle = null;
      curveBuilder.end = position;
      pointerState.preview = { start: pointerState.start, end: position };
      (pointerState.surface?.drawing || dom.canvases.drawing)?.setPointerCapture(event.pointerId);
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      requestOverlayRender();
      return;
    }

    if (curveBuilder.stage === 'control1' || curveBuilder.stage === 'control2') {
      pointerState.active = true;
      pointerState.pointerId = event.pointerId;
      pointerState.tool = 'curve';
      pointerState.curveHandle = curveBuilder.stage;
      pointerState.start = position;
      pointerState.current = position;
      pointerState.last = position;
      pointerState.path = [position];
      pointerState.preview = null;
      (pointerState.surface?.drawing || dom.canvases.drawing)?.setPointerCapture(event.pointerId);
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      if (curveBuilder.stage === 'control1') {
        curveBuilder.control1 = position;
      } else {
        curveBuilder.control2 = position;
      }
      requestOverlayRender();
      return;
    }

    resetCurveBuilder();
  }

  function handleCurvePointerMove(event) {
    const position = getPointerPosition(event, { clampToCanvas: true });
    if (!position || !curveBuilder) return;
    pointerState.current = position;
    if (curveBuilder.stage === 'line') {
      curveBuilder.end = position;
      pointerState.path.push(position);
      const lineStart = curveBuilder.start || pointerState.start || position;
      pointerState.preview = { start: lineStart, end: position };
    } else if (pointerState.curveHandle === 'control1') {
      curveBuilder.control1 = position;
    } else if (pointerState.curveHandle === 'control2') {
      curveBuilder.control2 = position;
    }
    requestOverlayRender();
  }

  function handleCurvePointerUp(event) {
    if (!curveBuilder) {
      (pointerState.surface?.drawing || dom.canvases.drawing)?.releasePointerCapture(event.pointerId);
      return;
    }
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    const position = getPointerPosition(event, { clampToCanvas: true }) || pointerState.current || curveBuilder.end;
    if (curveBuilder.stage === 'line') {
      const start = curveBuilder.start;
      curveBuilder.end = position;
      const moved = start && position && (start.x !== position.x || start.y !== position.y);
      pointerState.active = false;
      pointerState.pointerId = null;
      pointerState.path = [];
      pointerState.curveHandle = null;
      (pointerState.surface?.drawing || dom.canvases.drawing)?.releasePointerCapture(event.pointerId);
      if (!moved) {
        curveBuilder.awaitingEndPoint = true;
        pointerState.preview = null;
        pointerState.tool = null;
        requestOverlayRender();
        return;
      }

      curveBuilder.awaitingEndPoint = false;
      if (!curveBuilder.control1) curveBuilder.control1 = { ...curveBuilder.start };
      if (!curveBuilder.control2) curveBuilder.control2 = { ...curveBuilder.end };
      curveBuilder.stage = 'control1';
      pointerState.preview = null;
      pointerState.tool = null;
      requestOverlayRender();
      return;
    }

    if (pointerState.curveHandle === 'control1') {
      curveBuilder.control1 = position;
      curveBuilder.stage = 'control2';
      pointerState.curveHandle = null;
      pointerState.active = false;
      pointerState.pointerId = null;
      pointerState.path = [];
      (pointerState.surface?.drawing || dom.canvases.drawing)?.releasePointerCapture(event.pointerId);
      requestOverlayRender();
      scheduleSessionPersist();
      return;
    }

    if (pointerState.curveHandle === 'control2') {
      curveBuilder.control2 = position;
      pointerState.curveHandle = null;
      pointerState.active = false;
      pointerState.pointerId = null;
      pointerState.path = [];
      (pointerState.surface?.drawing || dom.canvases.drawing)?.releasePointerCapture(event.pointerId);
      finalizeCurve();
      return;
    }
  }

  function finalizeCurve() {
    if (!curveBuilder) return;
    const layer = getActiveLayer();
    if (!layer) {
      resetCurveBuilder();
      return;
    }
    const { start, end } = curveBuilder;
    let { control1, control2 } = curveBuilder;
    control1 = control1 || { ...start };
    control2 = control2 || { ...end };
    captureSharedProjectCurveCommand(start, control1, control2, end, pointerState.surface || null);
    const points = sampleCubicBezierPoints(start, control1, control2, end);
    forEachCurveStrokePixel(points, (x, y) => stampBrush(layer, x, y));
    requestRender();
    commitHistory();
    scheduleSessionPersist();
    resetCurveBuilder();
  }

  function drawCurveGuides(builder) {
    if (!builder || !builder.start || !builder.end) return;
    const { start, end, control1, control2 } = builder;
    ctx.overlay.save();
    ctx.overlay.lineWidth = 0.5;
    ctx.overlay.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.overlay.setLineDash([1, 1]);
    ctx.overlay.beginPath();
    ctx.overlay.moveTo(start.x + 0.5, start.y + 0.5);
    ctx.overlay.lineTo(end.x + 0.5, end.y + 0.5);
    ctx.overlay.stroke();

    if (control1) {
      ctx.overlay.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.overlay.beginPath();
      ctx.overlay.moveTo(start.x + 0.5, start.y + 0.5);
      ctx.overlay.lineTo(control1.x + 0.5, control1.y + 0.5);
      ctx.overlay.stroke();
      drawHandle(control1);
    }
    if (control2) {
      ctx.overlay.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.overlay.beginPath();
      ctx.overlay.moveTo(end.x + 0.5, end.y + 0.5);
      ctx.overlay.lineTo(control2.x + 0.5, control2.y + 0.5);
      ctx.overlay.stroke();
      drawHandle(control2);
    }

    if (builder.stage !== 'line') {
      const previewControl1 = control1 || { ...start };
      const previewControl2 = control2 || { ...end };
      const curvePoints = sampleCubicBezierPoints(start, previewControl1, previewControl2, end);
      const color = rgbaToCss(getActiveDrawColor());
      const width = state.width;
      const height = state.height;
      const selectionMask = state.selectionMask;
      ctx.overlay.fillStyle = color;
      const stamp = (x, y) => {
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        if (selectionMask && selectionMask[y * width + x] !== 1) return;
        forEachBrushOffset((dx, dy) => {
          const px = x + dx;
          const py = y + dy;
          if (px < 0 || py < 0 || px >= width || py >= height) return;
          if (selectionMask && selectionMask[py * width + px] !== 1) return;
          ctx.overlay.fillRect(px, py, 1, 1);
        });
      };
      forEachCurveStrokePixel(curvePoints, stamp);
    }
    ctx.overlay.restore();
  }

  function drawHandle(point) {
    if (!ctx.overlay || !point) {
      return;
    }
    const px = clamp(Math.round(point.x), 0, Math.max(0, state.width - 1));
    const py = clamp(Math.round(point.y), 0, Math.max(0, state.height - 1));
    const sample = sampleCompositeColor(px, py);
    let sampledColor = resolveSampledColor(sample);
    if (!sampledColor) {
      sampledColor = getBackgroundTileColor(px, py);
    }
    const markerColor = invertPreviewColor(sampledColor);
    ctx.overlay.save();
    ctx.overlay.fillStyle = rgbaToCss(markerColor);
    ctx.overlay.fillRect(px, py, 1, 1);
    ctx.overlay.restore();
  }

  function sampleCubicBezierPoints(p0, p1, p2, p3) {
    const tolerance = Math.max(0.1, Math.min(0.5, (state.brushSize || 1) * 0.2));
    const stack = [{ p0, p1, p2, p3, depth: 0 }];
    const seen = new Set();
    const points = [];

    const pushPoint = point => {
      const px = Math.round(point.x);
      const py = Math.round(point.y);
      const key = `${px},${py}`;
      if (seen.has(key)) return;
      seen.add(key);
      points.push({ x: px, y: py });
    };

    pushPoint(p0);

    while (stack.length) {
      const segment = stack.pop();
      const { p0: s0, p1: s1, p2: s2, p3: s3, depth } = segment;
      if (depth > 18 || cubicBezierFlatEnough(s0, s1, s2, s3, tolerance)) {
        pushPoint(s3);
        continue;
      }
      const [left, right] = subdivideCubicBezier(s0, s1, s2, s3);
      stack.push({ ...right, depth: depth + 1 });
      stack.push({ ...left, depth: depth + 1 });
    }

    return points;
  }

  function cubicBezierComponent(a, b, c, d, t) {
    const mt = 1 - t;
    return (mt ** 3) * a + 3 * (mt ** 2) * t * b + 3 * mt * (t ** 2) * c + (t ** 3) * d;
  }

  function cubicBezierFlatEnough(p0, p1, p2, p3, tolerance) {
    const d1 = distancePointToSegment(p1, p0, p3);
    const d2 = distancePointToSegment(p2, p0, p3);
    return d1 <= tolerance && d2 <= tolerance;
  }

  function subdivideCubicBezier(p0, p1, p2, p3) {
    const p01 = midpoint(p0, p1);
    const p12 = midpoint(p1, p2);
    const p23 = midpoint(p2, p3);
    const p012 = midpoint(p01, p12);
    const p123 = midpoint(p12, p23);
    const p0123 = midpoint(p012, p123);
    return [
      { p0, p1: p01, p2: p012, p3: p0123 },
      { p0: p0123, p1: p123, p2: p23, p3 },
    ];
  }

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function distancePointToSegment(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0 && dy === 0) {
      return Math.hypot(point.x - a.x, point.y - a.y);
    }
    const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy);
    const clamped = Math.max(0, Math.min(1, t));
    const px = a.x + clamped * dx;
    const py = a.y + clamped * dy;
    return Math.hypot(point.x - px, point.y - py);
  }

  function forEachCurveStrokePixel(points, callback) {
    if (!points || points.length === 0) return;
    let previous = points[0];
    callback(previous.x, previous.y);
    for (let i = 1; i < points.length; i += 1) {
      const current = points[i];
      if (current.x === previous.x && current.y === previous.y) {
        continue;
      }
      const segment = bresenhamLine(previous.x, previous.y, current.x, current.y);
      for (let j = 1; j < segment.length; j += 1) {
        callback(segment[j].x, segment[j].y);
      }
      previous = current;
    }
  }



  return Object.freeze({
    handleCurvePointerDown,
    handleCurvePointerMove,
    handleCurvePointerUp,
    finalizeCurve,
    drawCurveGuides,
    drawHandle,
    sampleCubicBezierPoints,
    cubicBezierComponent,
    cubicBezierFlatEnough,
    subdivideCubicBezier,
    midpoint,
    distancePointToSegment,
    forEachCurveStrokePixel,
  });
      }
    })(scope);
  }

  root.curveWorkflowUtils = Object.freeze({
    createCurveWorkflowUtils,
  });
})();
