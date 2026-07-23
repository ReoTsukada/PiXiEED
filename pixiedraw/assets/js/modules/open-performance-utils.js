(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawOpenPerformance = window.PiXiEEDrawOpenPerformance || {};
  const traces = new Map();
  let activeTraceId = '';
  let sequence = 0;
  let longTaskObserver = null;

  function now() {
    return typeof performance?.now === 'function' ? performance.now() : Date.now();
  }

  function readHeapBytes() {
    const value = Number(performance?.memory?.usedJSHeapSize);
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  }

  function getActiveTrace() {
    return activeTraceId ? traces.get(activeTraceId) || null : null;
  }

  function ensureLongTaskObserver() {
    if (longTaskObserver || typeof PerformanceObserver !== 'function') {
      return;
    }
    try {
      longTaskObserver = new PerformanceObserver(list => {
        const trace = getActiveTrace();
        if (!trace || trace.finishing) {
          return;
        }
        list.getEntries().forEach(entry => {
          const duration = Math.max(0, Number(entry.duration) || 0);
          trace.longTasks.count += 1;
          trace.longTasks.totalMs += duration;
          trace.longTasks.maxMs = Math.max(trace.longTasks.maxMs, duration);
        });
      });
      longTaskObserver.observe({ type: 'longtask', buffered: false });
    } catch (_error) {
      longTaskObserver = null;
    }
  }

  function start(details = {}) {
    const id = `open-${Date.now().toString(36)}-${++sequence}`;
    const trace = {
      id,
      startedAt: now(),
      heapStartBytes: readHeapBytes(),
      details: { source: 'unknown', ...details },
      stages: Object.create(null),
      longTasks: { count: 0, totalMs: 0, maxMs: 0 },
      finishing: false,
      finished: false,
    };
    traces.set(id, trace);
    activeTraceId = id;
    ensureLongTaskObserver();
    return id;
  }

  function beginStage(name, details = {}) {
    const trace = getActiveTrace();
    if (!trace || trace.finished || typeof name !== 'string' || !name) {
      return null;
    }
    return {
      traceId: trace.id,
      name,
      startedAt: now(),
      details,
    };
  }

  function endStage(token, details = {}) {
    if (!token?.traceId || !token?.name) {
      return 0;
    }
    const trace = traces.get(token.traceId);
    if (!trace || trace.finished) {
      return 0;
    }
    const elapsedMs = Math.max(0, now() - token.startedAt);
    const existing = trace.stages[token.name] || {
      elapsedMs: 0,
      count: 0,
      details: {},
    };
    existing.elapsedMs += elapsedMs;
    existing.count += 1;
    existing.details = { ...existing.details, ...token.details, ...details };
    trace.stages[token.name] = existing;
    return elapsedMs;
  }

  function annotate(details = {}) {
    const trace = getActiveTrace();
    if (!trace || trace.finished || !details || typeof details !== 'object') {
      return false;
    }
    trace.details = { ...trace.details, ...details };
    return true;
  }

  function summarizeDocument(snapshot = null) {
    if (!snapshot || typeof snapshot !== 'object') {
      return {};
    }
    const canvases = Array.isArray(snapshot.canvases) && snapshot.canvases.length
      ? snapshot.canvases
      : [{
          width: snapshot.width,
          height: snapshot.height,
          frames: snapshot.frames,
        }];
    let frameCount = 0;
    let totalLayerCount = 0;
    let maxLayerCount = 0;
    let totalLayerPixels = 0;
    let pixelBufferBytes = 0;
    let directColorLayerCount = 0;
    canvases.forEach(canvas => {
      const width = Math.max(1, Math.round(Number(canvas?.width) || 1));
      const height = Math.max(1, Math.round(Number(canvas?.height) || 1));
      const frames = Array.isArray(canvas?.frames) ? canvas.frames : [];
      frameCount += frames.length;
      frames.forEach(frame => {
        const layers = Array.isArray(frame?.layers) ? frame.layers : [];
        totalLayerCount += layers.length;
        maxLayerCount = Math.max(maxLayerCount, layers.length);
        totalLayerPixels += width * height * layers.length;
        layers.forEach(layer => {
          ['indices', 'direct', 'importSourceDirect'].forEach(key => {
            const value = layer?.[key];
            if (ArrayBuffer.isView(value)) {
              pixelBufferBytes += value.byteLength;
            }
          });
          if (
            layer?.direct instanceof Uint8ClampedArray
            || layer?.importSourceDirect instanceof Uint8ClampedArray
          ) {
            directColorLayerCount += 1;
          }
        });
      });
    });
    return {
      canvasCount: canvases.length,
      width: Math.max(1, Math.round(Number(canvases[0]?.width) || 1)),
      height: Math.max(1, Math.round(Number(canvases[0]?.height) || 1)),
      frameCount,
      totalLayerCount,
      maxLayerCount,
      totalLayerPixels,
      pixelBufferBytes,
      directColorLayerCount,
    };
  }

  function annotateDocument(snapshot = null) {
    return annotate(summarizeDocument(snapshot));
  }

  function buildResult(trace, status, details = {}) {
    const endedAt = now();
    const heapEndBytes = readHeapBytes();
    const stagesMs = {};
    const stageDetails = {};
    Object.entries(trace.stages).forEach(([name, stage]) => {
      stagesMs[name] = Math.round(stage.elapsedMs);
      if (stage.count > 1 || Object.keys(stage.details).length) {
        stageDetails[name] = {
          count: stage.count,
          ...stage.details,
        };
      }
    });
    const slowestStages = Object.entries(stagesMs)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([name, elapsedMs]) => ({ name, elapsedMs }));
    return {
      openId: trace.id,
      status,
      totalMs: Math.max(0, Math.round(endedAt - trace.startedAt)),
      stagesMs,
      slowestStages,
      stageDetails,
      document: {
        canvasCount: trace.details.canvasCount ?? null,
        width: trace.details.width ?? null,
        height: trace.details.height ?? null,
        frameCount: trace.details.frameCount ?? null,
        totalLayerCount: trace.details.totalLayerCount ?? null,
        maxLayerCount: trace.details.maxLayerCount ?? null,
        totalLayerPixels: trace.details.totalLayerPixels ?? null,
        pixelBufferBytes: trace.details.pixelBufferBytes ?? null,
        directColorLayerCount: trace.details.directColorLayerCount ?? null,
      },
      storage: {
        source: trace.details.source || 'unknown',
        inputBytes: Number(trace.details.inputBytes) || 0,
        autosaveSchemaVersion: Number(trace.details.autosaveSchemaVersion) || 0,
        fastPathUsed: trace.details.fastPathUsed ?? null,
        fallbackUsed: trace.details.fallbackUsed ?? null,
        revision: Number(trace.details.revision) || 0,
        journalOperationCount: Number(trace.details.journalOperationCount) || 0,
      },
      longTasks: {
        count: trace.longTasks.count,
        totalMs: Math.round(trace.longTasks.totalMs),
        maxMs: Math.round(trace.longTasks.maxMs),
      },
      memory: {
        heapStartBytes: trace.heapStartBytes,
        heapEndBytes,
        heapDeltaBytes: trace.heapStartBytes !== null && heapEndBytes !== null
          ? heapEndBytes - trace.heapStartBytes
          : null,
      },
      ...details,
    };
  }

  function finish(id, { status = 'success', ...details } = {}) {
    const trace = traces.get(id);
    if (!trace || trace.finished) {
      return null;
    }
    trace.finished = true;
    const result = buildResult(trace, status, details);
    console.info('[pixiedraw:open-performance]', result);
    traces.delete(id);
    if (activeTraceId === id) {
      activeTraceId = '';
    }
    return result;
  }

  function finishAfterPaint(id, options = {}) {
    const trace = traces.get(id);
    if (!trace || trace.finished || trace.finishing) {
      return false;
    }
    trace.finishing = true;
    const paintStage = {
      traceId: id,
      name: 'first-paint-wait',
      startedAt: now(),
      details: {},
    };
    const complete = () => {
      endStage(paintStage);
      finish(id, options);
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(complete));
    } else {
      setTimeout(complete, 0);
    }
    return true;
  }

  function abort(id, details = {}) {
    return finish(id, { status: 'failed', ...details });
  }

  function isPending(id) {
    const trace = traces.get(id);
    return Boolean(trace && !trace.finished);
  }

  function getActiveId() {
    return getActiveTrace()?.id || '';
  }

  Object.assign(root, {
    start,
    beginStage,
    endStage,
    annotate,
    annotateDocument,
    finish,
    finishAfterPaint,
    abort,
    isPending,
    getActiveId,
  });
})();
