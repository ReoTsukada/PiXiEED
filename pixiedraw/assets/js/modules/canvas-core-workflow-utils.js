(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createCanvasCoreWorkflowUtils(rawScope = {}) {
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
  function blendChannelByMode(dst, src, blendMode) {
    switch (blendMode) {
      case 'multiply':
        return dst * src;
      case 'screen':
        return dst + src - (dst * src);
      case 'overlay':
        return dst <= 0.5 ? (2 * dst * src) : (1 - (2 * (1 - dst) * (1 - src)));
      case 'hard-light':
        return src <= 0.5 ? (2 * dst * src) : (1 - (2 * (1 - dst) * (1 - src)));
      case 'soft-light': {
        const d = dst <= 0.25
          ? (((16 * dst) - 12) * dst + 4) * dst
          : Math.sqrt(dst);
        return src <= 0.5
          ? dst - ((1 - (2 * src)) * dst * (1 - dst))
          : dst + (((2 * src) - 1) * (d - dst));
      }
      case 'darken':
        return Math.min(dst, src);
      case 'lighten':
        return Math.max(dst, src);
      case 'color-dodge':
        return src >= 1 ? 1 : Math.min(1, dst / (1 - src));
      case 'color-burn':
        return src <= 0 ? 0 : 1 - Math.min(1, (1 - dst) / src);
      case 'difference':
        return Math.abs(dst - src);
      case 'exclusion':
        return dst + src - (2 * dst * src);
      case 'normal':
      default:
        return src;
    }
  }

  function compositeLayerPixelNormalized(data, destBase, srcR, srcG, srcB, srcA, opacity, normalizedBlendMode) {
    if (opacity <= 0 || srcA <= 0) {
      return;
    }
    const srcAlpha = (srcA / 255) * opacity;
    if (srcAlpha <= 0) {
      return;
    }
    const dstAlpha = data[destBase + 3] / 255;
    const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);
    if (outAlpha <= 0) {
      data[destBase] = 0;
      data[destBase + 1] = 0;
      data[destBase + 2] = 0;
      data[destBase + 3] = 0;
      return;
    }

    if (dstAlpha <= 0 || normalizedBlendMode === DEFAULT_LAYER_BLEND_MODE) {
      const srcFactor = srcAlpha / outAlpha;
      const dstFactor = (dstAlpha * (1 - srcAlpha)) / outAlpha;
      data[destBase] = Math.round(srcR * srcFactor + data[destBase] * dstFactor);
      data[destBase + 1] = Math.round(srcG * srcFactor + data[destBase + 1] * dstFactor);
      data[destBase + 2] = Math.round(srcB * srcFactor + data[destBase + 2] * dstFactor);
      data[destBase + 3] = Math.round(outAlpha * 255);
      return;
    }

    const dstR = data[destBase] / 255;
    const dstG = data[destBase + 1] / 255;
    const dstB = data[destBase + 2] / 255;
    const srcRNorm = srcR / 255;
    const srcGNorm = srcG / 255;
    const srcBNorm = srcB / 255;
    const blendedR = blendChannelByMode(dstR, srcRNorm, normalizedBlendMode);
    const blendedG = blendChannelByMode(dstG, srcGNorm, normalizedBlendMode);
    const blendedB = blendChannelByMode(dstB, srcBNorm, normalizedBlendMode);
    const dstWeight = (1 - srcAlpha) * dstAlpha;
    const srcWeight = (1 - dstAlpha) * srcAlpha;
    const blendWeight = srcAlpha * dstAlpha;

    data[destBase] = Math.round((((dstWeight * dstR) + (srcWeight * srcRNorm) + (blendWeight * blendedR)) / outAlpha) * 255);
    data[destBase + 1] = Math.round((((dstWeight * dstG) + (srcWeight * srcGNorm) + (blendWeight * blendedG)) / outAlpha) * 255);
    data[destBase + 2] = Math.round((((dstWeight * dstB) + (srcWeight * srcBNorm) + (blendWeight * blendedB)) / outAlpha) * 255);
    data[destBase + 3] = Math.round(outAlpha * 255);
  }

  function blendColors(target, source, opacity) {
    const srcA = (source.a / 255) * opacity;
    const dstA = target.a / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA === 0) {
      return { r: 0, g: 0, b: 0, a: 0 };
    }
    const blendChannel = (dst, src) => Math.round(((src * srcA) + dst * dstA * (1 - srcA)) / outA);
    return {
      r: blendChannel(target.r, source.r),
      g: blendChannel(target.g, source.g),
      b: blendChannel(target.b, source.b),
      a: Math.round(outA * 255),
    };
  }

  function getActiveFrame() {
    if (getProjectCanvasCount() <= 1 && Array.isArray(state.frames) && state.frames.length) {
      const activeFrameIndex = clamp(Math.round(Number(state.activeFrame) || 0), 0, state.frames.length - 1);
      return state.frames[activeFrameIndex] || state.frames[0] || null;
    }
    const canvasDoc = getActiveProjectCanvasDocument();
    const canvasFrame = getProjectCanvasActiveFrame(canvasDoc);
    if (canvasFrame) {
      return canvasFrame;
    }
    return state.frames[state.activeFrame];
  }

  function getActiveLayer() {
    const frame = getActiveFrame();
    if (!frame || !Array.isArray(frame.layers) || !frame.layers.length) {
      return null;
    }
    if (getProjectCanvasCount() <= 1) {
      const preferredLayerId = state.activeLayer;
      return frame.layers.find(layer => layer.id === preferredLayerId) || frame.layers[frame.layers.length - 1];
    }
    const canvasDoc = getActiveProjectCanvasDocument();
    const isActiveCanvas = Boolean(canvasDoc?.id) && canvasDoc.id === (getActiveProjectCanvasDocument()?.id || '');
    const preferredLayerId = isActiveCanvas
      ? (state.activeLayer || canvasDoc?.activeLayer)
      : (canvasDoc?.activeLayer || state.activeLayer);
    return frame.layers.find(layer => layer.id === preferredLayerId) || frame.layers[frame.layers.length - 1];
  }

  function getActiveLayerIndex() {
    const frame = getActiveFrame();
    if (!frame || !Array.isArray(frame.layers) || !frame.layers.length) {
      return -1;
    }
    if (getProjectCanvasCount() <= 1) {
      return frame.layers.findIndex(layer => layer.id === state.activeLayer);
    }
    const canvasDoc = getActiveProjectCanvasDocument();
    const isActiveCanvas = Boolean(canvasDoc?.id) && canvasDoc.id === (getActiveProjectCanvasDocument()?.id || '');
    const preferredLayerId = isActiveCanvas
      ? (state.activeLayer || canvasDoc?.activeLayer)
      : (canvasDoc?.activeLayer || state.activeLayer);
    return frame.layers.findIndex(layer => layer.id === preferredLayerId);
  }

  return Object.freeze({
    blendChannelByMode,
    compositeLayerPixelNormalized,
    blendColors,
    getActiveFrame,
    getActiveLayer,
    getActiveLayerIndex,
  });
      }
    })(scope);
  }

  root.canvasCoreWorkflowUtils = Object.freeze({
    createCanvasCoreWorkflowUtils,
  });
})();
