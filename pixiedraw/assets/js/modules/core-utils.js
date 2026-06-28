(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
    const KB = 1024;
    const MB = KB * 1024;
    const GB = MB * 1024;
    if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
    if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
    if (bytes >= KB) return `${(bytes / KB).toFixed(1)} KB`;
    return `${bytes} B`;
  }

  function rgbaToHex({ r, g, b, a }) {
    const toHex = value => value.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function rgbaToCss({ r, g, b, a }) {
    return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
  }

  function toCssColor(value) {
    if (typeof value === 'string') {
      return value;
    }
    if (value && typeof value === 'object') {
      const { r = 0, g = 0, b = 0, a = 255 } = value;
      return rgbaToCss({ r, g, b, a });
    }
    return 'rgba(0, 0, 0, 0)';
  }

  function createPixelFrameImage(color, { borderColor = '#C8C8C8' } = {}) {
    const colorCss = toCssColor(color);
    const borderCss = toCssColor(borderColor);
    const checkerA = '#111827';
    const checkerB = '#334155';
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='21' height='21' shape-rendering='crispEdges'>` +
      `<rect x='1' y='0' width='19' height='1' fill='${borderCss}' />` +
      `<rect x='0' y='1' width='2' height='1' fill='${borderCss}' />` +
      // checker base (so fully transparent colors remain visible)
      `<rect x='2' y='1' width='17' height='19' fill='${checkerA}' />` +
      `<rect x='2' y='1' width='9' height='10' fill='${checkerB}' />` +
      `<rect x='11' y='10' width='8' height='10' fill='${checkerB}' />` +
      // selected color overlay (may include alpha)
      `<rect x='2' y='1' width='17' height='19' fill='${colorCss}' />` +
      `<rect x='19' y='1' width='2' height='1' fill='${borderCss}' />` +
      `<rect x='0' y='2' width='1' height='18' fill='${borderCss}' />` +
      `<rect x='1' y='2' width='1' height='17' fill='${checkerB}' />` +
      `<rect x='19' y='2' width='1' height='17' fill='${checkerB}' />` +
      `<rect x='1' y='2' width='1' height='17' fill='${colorCss}' />` +
      `<rect x='19' y='2' width='1' height='17' fill='${colorCss}' />` +
      `<rect x='20' y='2' width='1' height='18' fill='${borderCss}' />` +
      `<rect x='1' y='19' width='1' height='2' fill='${borderCss}' />` +
      `<rect x='19' y='19' width='1' height='2' fill='${borderCss}' />` +
      `<rect x='2' y='20' width='17' height='1' fill='${borderCss}' />` +
      `</svg>`;
    const encoded = encodeURIComponent(svg)
      .replace(/%0A/g, '')
      .replace(/%09/g, '');
    return `url("data:image/svg+xml,${encoded}")`;
  }

  function applyPixelFrameBackground(element, color, options = {}) {
    if (!element) return;
    element.classList.add('pixel-frame');
    element.style.setProperty('--pixel-frame-image', createPixelFrameImage(color, options));
  }

  function rgbaToHsv({ r, g, b }) {
    const rn = clamp(r, 0, 255) / 255;
    const gn = clamp(g, 0, 255) / 255;
    const bn = clamp(b, 0, 255) / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;
    let h = 0;
    if (delta !== 0) {
      if (max === rn) {
        h = ((gn - bn) / delta) % 6;
      } else if (max === gn) {
        h = (bn - rn) / delta + 2;
      } else {
        h = (rn - gn) / delta + 4;
      }
      h *= 60;
      if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : delta / max;
    const v = max;
    return { h, s, v };
  }

  function hsvToRgba(h, s, v) {
    const hue = ((h % 360) + 360) % 360;
    const saturation = clamp(s, 0, 1);
    const value = clamp(v, 0, 1);
    const c = value * saturation;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = value - c;
    let rp = 0;
    let gp = 0;
    let bp = 0;
    if (hue < 60) {
      rp = c;
      gp = x;
    } else if (hue < 120) {
      rp = x;
      gp = c;
    } else if (hue < 180) {
      gp = c;
      bp = x;
    } else if (hue < 240) {
      gp = x;
      bp = c;
    } else if (hue < 300) {
      rp = x;
      bp = c;
    } else {
      rp = c;
      bp = x;
    }
    const r = Math.round((rp + m) * 255);
    const g = Math.round((gp + m) * 255);
    const b = Math.round((bp + m) * 255);
    return { r, g, b, a: 255 };
  }

  function hexToRgba(value) {
    if (!value || value[0] !== '#') return null;
    const hex = value.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return { r, g, b, a: 255 };
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return { r, g, b, a: 255 };
    }
    return null;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function debounce(fn, wait) {
    let handle;
    return (...args) => {
      clearTimeout(handle);
      handle = setTimeout(() => fn(...args), wait);
    };
  }

  root.coreUtils = Object.freeze({
    formatBytes,
    rgbaToHex,
    rgbaToCss,
    toCssColor,
    createPixelFrameImage,
    applyPixelFrameBackground,
    rgbaToHsv,
    hsvToRgba,
    hexToRgba,
    clamp,
    debounce,
  });
})();
