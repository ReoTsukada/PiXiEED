import { selectionAxes, selectionFrameCorners, selectionDefaultPivot, selectionWorldPoint, hitSelectionControls } from './draw-selection-geometry.mjs?rev=20261006-draw-startup-1';

/** DOM-only controls: screen-sized marks are never drawn into a pixel surface. */
export function mountDrawSelectionOverlay({ scope, board, canvas, getFrame }) {
  const doc = board.ownerDocument, frameNode = doc.createElement('div');
  frameNode.className = 'draw-selection'; frameNode.setAttribute('aria-hidden', 'true'); board.append(frameNode);
  const marks = {}, nodes = [frameNode];
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
  let visible = false, editable = false, active = '';
  function hover(name = '') {
    for (const [key, node] of Object.entries(marks)) {
      node.dataset.hover = String(name === key); node.dataset.active = String(active === key);
    }
    board.dataset.selectionHover = name;
  }
  function render(frame, canEdit, dragging = '') {
    visible = Boolean(frame); editable = canEdit; active = dragging;
    frameNode.hidden = !visible;
    for (const node of nodes.slice(1)) node.hidden = !visible || !editable;
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
