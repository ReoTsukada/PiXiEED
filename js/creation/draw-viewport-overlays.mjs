/** Paint pixel boundaries in viewport coordinates, without repeated fractional CSS tiles. */
export function shouldShowDrawOnion({ enabled = false, playing = false, readOnly = false } = {}) {
  return Boolean(enabled && !playing && !readOnly);
}

export function mountDrawViewportOverlays({ board, canvas, scope }) {
  const background = document.createElement('canvas'), lines = document.createElement('canvas');
  background.className = 'draw-pixel-background'; lines.className = 'draw-pixel-lines';
  for (const node of [background, lines]) { node.setAttribute('aria-hidden', 'true'); board.append(node); scope.add(() => node.remove()); }
  let previous = '', lastOptions = null, removeDprListener = null;
  function watchDpr() {
    removeDprListener?.();
    removeDprListener = scope.listen(window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`), 'change', () => {
      if (lastOptions) render(lastOptions); watchDpr();
    }, { once: true });
  }
  watchDpr(); scope.add(() => removeDprListener?.());
  function render({ width, height, grid, readOnly = false }) {
    lastOptions = { width, height, grid, readOnly };
    background.hidden = lines.hidden = readOnly;
    if (readOnly) return;
    const b = board.getBoundingClientRect(), r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1, vw = board.clientWidth, vh = board.clientHeight;
    const left = r.left - b.left - board.clientLeft, top = r.top - b.top - board.clientTop;
    const key = [left, top, r.width, r.height, width, height, grid, vw, vh, dpr].join(':');
    if (key === previous) return;
    previous = key;
    const x = i => Math.round((left + i * r.width / width) * dpr);
    const y = i => Math.round((top + i * r.height / height) * dpr);
    const backingWidth = Math.ceil(vw * dpr), backingHeight = Math.ceil(vh * dpr);
    for (const node of [background, lines]) {
      // Assigning either dimension clears a canvas and reallocates its backing
      // store. Pan/zoom changes often need a repaint, but not a new bitmap.
      if (node.width !== backingWidth) node.width = backingWidth;
      if (node.height !== backingHeight) node.height = backingHeight;
      if (node.style.width !== `${vw}px`) node.style.width = `${vw}px`;
      if (node.style.height !== `${vh}px`) node.style.height = `${vh}px`;
    }
    const bg = background.getContext('2d'), ctx = lines.getContext('2d');
    // A same-size canvas keeps its previous pixels, so clear before painting
    // the new viewport geometry (including when the grid is switched off).
    bg.clearRect(0, 0, backingWidth, backingHeight);
    ctx.clearRect(0, 0, backingWidth, backingHeight);
    const firstX = Math.max(0, Math.floor(-left * width / r.width));
    const lastX = Math.min(width, Math.ceil((vw - left) * width / r.width));
    const firstY = Math.max(0, Math.floor(-top * height / r.height));
    const lastY = Math.min(height, Math.ceil((vh - top) * height / r.height));
    bg.fillStyle = '#fbfbf8'; bg.fillRect(x(0), y(0), x(width) - x(0), y(height) - y(0));
    bg.fillStyle = '#e9ece5';
    for (let row = firstY; row < lastY; row++) for (let col = firstX; col < lastX; col++) {
      if ((row + col) % 2 === 0) bg.fillRect(x(col), y(row), x(col + 1) - x(col), y(row + 1) - y(row));
    }
    if (!grid) return;
    ctx.fillStyle = r.width / width < 6 ? 'rgba(23,35,45,.09)' : 'rgba(23,35,45,.16)';
    // One device pixel at each independently calculated boundary; errors cannot accumulate.
    for (let col = firstX; col <= lastX; col++) ctx.fillRect(x(col), y(0), 1, y(height) - y(0));
    for (let row = firstY; row <= lastY; row++) ctx.fillRect(x(0), y(row), x(width) - x(0), 1);
  }
  return { render };
}
