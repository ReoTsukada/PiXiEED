(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createCanvasGridWorkflowUtils(rawScope = {}) {
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
  function getGridOpacityForScale(scale, { major = false } = {}) {
    const normalizedScale = Math.max(Number(scale) || MIN_ZOOM_SCALE, MIN_ZOOM_SCALE);
    const progress = clamp((normalizedScale - 3) / 13, 0, 1);
    const eased = progress * progress * (3 - 2 * progress);
    const minimum = major ? 0.12 : 0.04;
    return minimum + (1 - minimum) * eased;
  }

  function updateStackGridOpacity(stack, scale) {
    if (!(stack instanceof HTMLElement)) {
      return;
    }
    stack.style.setProperty('--grid-opacity', getGridOpacityForScale(scale).toFixed(3));
    stack.style.setProperty('--grid-major-opacity', getGridOpacityForScale(scale, { major: true }).toFixed(3));
  }

  function formatGridSvgCoord(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return '0';
    }
    return Number(numeric.toFixed(3)).toString();
  }

  function buildCanvasGridSvgPath(width, height, displayWidth, displayHeight, step = 1) {
    const safeWidth = Math.max(1, Math.round(Number(width) || 1));
    const safeHeight = Math.max(1, Math.round(Number(height) || 1));
    const safeDisplayWidth = Math.max(1, Number(displayWidth) || safeWidth);
    const safeDisplayHeight = Math.max(1, Number(displayHeight) || safeHeight);
    const safeStep = Math.max(1, Math.round(Number(step) || 1));
    const cellWidth = safeDisplayWidth / safeWidth;
    const cellHeight = safeDisplayHeight / safeHeight;
    const lineOffset = 0.5;
    const commands = [];
    for (let x = 0; x <= safeWidth; x += safeStep) {
      const screenX = (x * cellWidth) + lineOffset;
      commands.push(
        `M${formatGridSvgCoord(screenX)} 0`,
        `V${formatGridSvgCoord(safeDisplayHeight)}`
      );
    }
    for (let y = 0; y <= safeHeight; y += safeStep) {
      const screenY = (y * cellHeight) + lineOffset;
      commands.push(
        `M0 ${formatGridSvgCoord(screenY)}`,
        `H${formatGridSvgCoord(safeDisplayWidth)}`
      );
    }
    return commands.join(' ');
  }

  function getCanvasSurfaceDisplayMetrics(surface, canvasDoc, fallbackScale = state.scale) {
    const width = Math.max(1, Math.round(Number(canvasDoc?.width) || Number(state.width) || 1));
    const height = Math.max(1, Math.round(Number(canvasDoc?.height) || Number(state.height) || 1));
    const scale = Math.max(
      Number(fallbackScale) || getProjectCanvasDisplayScale(canvasDoc) || MIN_ZOOM_SCALE,
      MIN_ZOOM_SCALE
    );
    const drawingRect = surface?.drawing instanceof HTMLCanvasElement
      ? surface.drawing.getBoundingClientRect?.()
      : null;
    const displayWidth = drawingRect && drawingRect.width > 0 ? drawingRect.width : (width * scale);
    const displayHeight = drawingRect && drawingRect.height > 0 ? drawingRect.height : (height * scale);
    return {
      width,
      height,
      displayWidth,
      displayHeight,
      scaleX: displayWidth / width,
      scaleY: displayHeight / height,
      scale,
    };
  }

  function ensureCanvasGridSvg(stack) {
    if (!(stack instanceof HTMLElement)) {
      return null;
    }
    let svg = Array.from(stack.children).find(child => child instanceof SVGSVGElement && child.classList.contains('canvas-grid-svg'));
    if (!(svg instanceof SVGSVGElement)) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('canvas-grid-svg');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      const minorPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      minorPath.classList.add('canvas-grid-svg__path', 'canvas-grid-svg__path--minor');
      minorPath.dataset.gridPath = 'minor';
      const majorPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      majorPath.classList.add('canvas-grid-svg__path', 'canvas-grid-svg__path--major');
      majorPath.dataset.gridPath = 'major';
      svg.append(minorPath, majorPath);
      stack.appendChild(svg);
    }
    return svg;
  }

  function updateCanvasSurfaceGridSvg(surface, canvasDoc, displayScale) {
    const stack = surface?.stack instanceof HTMLElement ? surface.stack : null;
    if (!stack) {
      return;
    }
    const {
      width,
      height,
      displayWidth,
      displayHeight,
    } = getCanvasSurfaceDisplayMetrics(surface, canvasDoc, displayScale);
    const svg = ensureCanvasGridSvg(stack);
    if (!svg) {
      return;
    }
    stack.dataset.gridRenderer = 'svg';
    svg.hidden = !(state.showGrid || state.showMajorGrid);
    svg.setAttribute('viewBox', `0 0 ${formatGridSvgCoord(displayWidth)} ${formatGridSvgCoord(displayHeight)}`);
    svg.style.width = `${displayWidth}px`;
    svg.style.height = `${displayHeight}px`;
    const minorPath = svg.querySelector('[data-grid-path="minor"]');
    const majorPath = svg.querySelector('[data-grid-path="major"]');
    if (minorPath instanceof SVGPathElement) {
      minorPath.setAttribute('d', state.showGrid
        ? buildCanvasGridSvgPath(width, height, displayWidth, displayHeight, 1)
        : '');
    }
    if (majorPath instanceof SVGPathElement) {
      const majorStep = Math.max(1, Math.round(Number(state.majorGridSpacing) || 16));
      majorPath.setAttribute('d', state.showMajorGrid
        ? buildCanvasGridSvgPath(width, height, displayWidth, displayHeight, majorStep)
        : '');
    }
  }

  function getPixelAlignedCanvasDisplayScale(scale = state.scale) {
    const normalizedScale = Math.max(Number(scale) || MIN_ZOOM_SCALE, MIN_ZOOM_SCALE);
    return normalizedScale;
  }

  function updateGridDecorations() {
    const stack = dom.canvases.stack;
    if (!stack) return;
    const scale = getPixelAlignedCanvasDisplayScale(state.scale);
    const width = Math.max(1, Math.round(Number(state.width) || 1));
    const height = Math.max(1, Math.round(Number(state.height) || 1));
    const tileScreenSize = 16 * scale;
    const minorStep = scale;
    const majorMultiplier = Math.max(Number(state.majorGridSpacing) || 16, 1);
    const majorStep = Math.max(minorStep, majorMultiplier * minorStep);
    state.gridScreenStep = minorStep;
    stack.style.width = `${width * scale}px`;
    stack.style.height = `${height * scale}px`;
    stack.dataset.grid = state.showGrid ? 'true' : 'false';
    stack.dataset.majorGrid = state.showMajorGrid ? 'true' : 'false';
    stack.classList.toggle('is-flat', !state.showChecker);
    stack.style.setProperty('--grid-screen-step', `${minorStep}px`);
    stack.style.setProperty('--grid-major-step', `${majorStep}px`);
    stack.style.setProperty('--grid-offset-x', '0px');
    stack.style.setProperty('--grid-offset-y', '0px');
    stack.style.setProperty('--grid-major-offset-x', '0px');
    stack.style.setProperty('--grid-major-offset-y', '0px');
    stack.style.setProperty('--tile-screen-size', `${tileScreenSize}px`);
    stack.style.setProperty('--tile-offset-x', '0px');
    stack.style.setProperty('--tile-offset-y', '0px');
    updateStackGridOpacity(stack, minorStep);
    updateCanvasSurfaceGridSvg(activeCanvasSurface || mainViewportCanvasSurface, getActiveProjectCanvasDocument(), scale);
    stack.dataset.background = state.backgroundMode;
  }



  return Object.freeze({
    getGridOpacityForScale,
    updateStackGridOpacity,
    formatGridSvgCoord,
    buildCanvasGridSvgPath,
    getCanvasSurfaceDisplayMetrics,
    ensureCanvasGridSvg,
    updateCanvasSurfaceGridSvg,
    getPixelAlignedCanvasDisplayScale,
    updateGridDecorations,
  });
      }
    })(scope);
  }

  root.canvasGridWorkflowUtils = Object.freeze({
    createCanvasGridWorkflowUtils,
  });
})();
