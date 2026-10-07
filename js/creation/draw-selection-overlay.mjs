import { selectionAxes, selectionFrameCorners, selectionDefaultPivot, selectionWorldPoint, hitSelectionControls } from './draw-selection-geometry.mjs?rev=20261006-selection-fix-1';

/** DOM-only controls: screen-sized marks are never drawn into a pixel surface. */
export function mountDrawSelectionOverlay({ scope, board, canvas, getFrame }) {
  const doc = board.ownerDocument, frameNode = doc.createElement('div');
  frameNode.className = 'draw-selection'; frameNode.setAttribute('aria-hidden', 'true'); board.append(frameNode);
  const maskNode = doc.createElement('canvas'); maskNode.className = 'draw-selection-mask'; maskNode.setAttribute('aria-hidden', 'true'); maskNode.width = canvas.width * 4; maskNode.height = canvas.height * 4; board.append(maskNode);
  const maskContext = maskNode.getContext('2d');
  const marks = {}, nodes = [frameNode, maskNode];
  for (const name of ['nw', 'ne', 'sw', 'se', 'pivot', 'flip-x', 'flip-y']) {
    const mark = doc.createElement('span');
    mark.className = name.length === 2 ? 'draw-selection__corner' : `draw-selection__${name}`;
    mark.dataset.selectionControl = name;
    if (name.length === 2) mark.dataset.selectionCorner = name;
    mark.setAttribute('aria-hidden', 'true');
    if (name.startsWith('flip')) mark.textContent = name === 'flip-x' ? '↔' : '↕';
    mark.title = name === 'pivot' ? '回転中心を移動（絵は動きません）' : name.startsWith('flip') ? (name === 'flip-x' ? '枠の左右を反転' : '枠の上下を反転') : '中心を基準に拡縮＋回転。Shift：90度、Alt：吸着なし';
    board.append(mark); marks[name] = mark; nodes.push(mark);
  }
  function layout(frame) {
    const r = canvas.getBoundingClientRect(), b = board.getBoundingClientRect(), sx = r.width / canvas.width, sy = r.height / canvas.height;
    const screen = p => ({ x: r.left + p.x * sx, y: r.top + p.y * sy });
    const logical = p => ({ x: (p.x - r.left) / sx, y: (p.y - r.top) / sy });
    const controls = { ...selectionFrameCorners(frame), pivot: frame.pivot || selectionDefaultPivot(frame) };
    const { c, s } = selectionAxes(frame.angle);
    const edges = [[frame.width / 2, 0, s, -c], [frame.width, frame.height / 2, c, s]];
    const clamp = p => ({ x: Math.max(b.left + 23, Math.min(b.right - 23, p.x)), y: Math.max(b.top + 23, Math.min(b.bottom - 23, p.y)) });
    let flips = edges.map(([x, y, nx, ny]) => { const a = screen(selectionWorldPoint(frame, x, y)), norm = Math.hypot(nx * sx, ny * sy); return clamp({ x: a.x + nx * sx / norm * 28, y: a.y + ny * sy / norm * 28 }); });
    const corners = Object.values(controls).map(screen);
    if (flips.some(f => corners.some(p => Math.hypot(f.x - p.x, f.y - p.y) < 42)) || Math.hypot(flips[0].x - flips[1].x, flips[0].y - flips[1].y) < 44) {
      // A small or clipped selection keeps both tap controls apart at a viewport edge.
      const rows = [b.top + 24, b.bottom - 24];
      const y = rows.find(y => corners.every(p => Math.hypot(b.left + 25 - p.x, y - p.y) >= 44 && Math.hypot(b.left + 73 - p.x, y - p.y) >= 44)) ?? rows[0];
      flips = [{ x: b.left + 25, y }, { x: b.left + 73, y }];
    }
    controls['flip-x'] = logical(flips[0]); controls['flip-y'] = logical(flips[1]);
    return { r, b, sx, sy, screen, controls };
  }
  let visible = false, editable = false, active = '', maskVisible = false, previousMask = null, previousWidth = 0, previousHeight = 0;
  function hover(name = '') {
    for (const [key, node] of Object.entries(marks)) {
      node.dataset.hover = String(name === key); node.dataset.active = String(active === key);
    }
    board.dataset.selectionHover = name;
  }
  function render(frame, canEdit, dragging = '', mask = null) {
    visible = Boolean(frame); editable = canEdit; active = dragging; maskVisible = mask instanceof Uint8Array && mask.length === canvas.width * canvas.height;
    frameNode.hidden = !visible;
    frameNode.dataset.mask = String(maskVisible);
    for (const node of nodes.slice(2)) node.hidden = !visible || !editable;
    maskNode.hidden = !maskVisible;
    if (maskVisible) {
      if (previousMask !== mask || previousWidth !== canvas.width || previousHeight !== canvas.height) {
        const width = canvas.width, height = canvas.height, bitmapWidth = width * 4, bitmapHeight = height * 4;
        if (maskNode.width !== bitmapWidth) maskNode.width = bitmapWidth;
        if (maskNode.height !== bitmapHeight) maskNode.height = bitmapHeight;
        const image = maskContext.createImageData(bitmapWidth, bitmapHeight);
        const write = (x, y, alpha) => { if (x < 0 || y < 0 || x >= bitmapWidth || y >= bitmapHeight) return; const p = (y * bitmapWidth + x) * 4; image.data[p] = 255; image.data[p + 1] = 211; image.data[p + 2] = 90; image.data[p + 3] = alpha; };
        for (let i = 0; i < mask.length; i++) if (mask[i]) {
          const x = i % width, y = Math.floor(i / width), boundary = (xx, yy) => xx < 0 || yy < 0 || xx >= width || yy >= height || !mask[yy * width + xx];
          for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) {
            const edge = boundary(x - 1, y) && px === 0 || boundary(x + 1, y) && px === 3 || boundary(x, y - 1) && py === 0 || boundary(x, y + 1) && py === 3;
            write(x * 4 + px, y * 4 + py, edge ? 230 : 42);
          }
        }
        maskContext.putImageData(image, 0, 0); previousMask = mask; previousWidth = width; previousHeight = height;
      }
      const r = canvas.getBoundingClientRect(), b = board.getBoundingClientRect();
      Object.assign(maskNode.style, { left: `${r.left - b.left - board.clientLeft}px`, top: `${r.top - b.top - board.clientTop}px`, width: `${r.width}px`, height: `${r.height}px` });
    }
    if (!visible) { hover(); return; }
    const { r, b, sx, sy, screen, controls } = layout(frame), { c, s } = selectionAxes(frame.angle);
    const offset = p => ({ x: p.x - b.left - board.clientLeft, y: p.y - b.top - board.clientTop });
    const origin = offset(screen(frame));
    Object.assign(frameNode.style, { left: `${origin.x}px`, top: `${origin.y}px`, width: `${frame.width * sx}px`, height: `${frame.height * sy}px`, transformOrigin: '0 0', transform: `matrix(${c},${s * sy / sx},${-s * sx / sy},${c},0,0)` });
    for (const key of ['x', 'y', 'width', 'height', 'angle']) frameNode.dataset[key] = String(frame[key] || 0);
    for (const [name, p] of Object.entries(controls)) {
      const location = offset(screen(p)); Object.assign(marks[name].style, { left: `${location.x}px`, top: `${location.y}px` });
      marks[name].dataset.canvasX = String(p.x); marks[name].dataset.canvasY = String(p.y);
    }
    hover(board.dataset.selectionHover || '');
  }
  function hit(point, pointerType = 'mouse') {
    if (!visible || !editable) return null;
    const frame = getFrame(); if (!frame) return null;
    const { controls, sx, sy } = layout(frame), radius = pointerType === 'touch' ? 22 : 12;
    return hitSelectionControls(point, controls, radius / sx, radius / sy);
  }
  scope.add(() => { nodes.forEach(n => n.remove()); delete board.dataset.selectionHover; });
  render(null, false);
  return { render, hit, hover, get element() { return frameNode; } };
}
