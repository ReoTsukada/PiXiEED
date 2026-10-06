import { selectionAxes, selectionFrameCorners, selectionDefaultPivot, selectionWorldPoint, hitSelectionControls } from './draw-selection-geometry.mjs';

/** DOM-only controls: screen-sized marks are never drawn into a pixel surface. */
export function mountDrawSelectionOverlay({ scope, board, canvas, getFrame }) {
  const doc = board.ownerDocument, frameNode = doc.createElement('div');
  frameNode.className = 'draw-selection'; frameNode.setAttribute('aria-hidden', 'true'); board.append(frameNode);
  const marks = {}, nodes = [frameNode];
  for (const name of ['nw', 'ne', 'sw', 'se', 'pivot', 'rotate']) {
    const mark = doc.createElement('span');
    mark.className = name.length === 2 ? 'draw-selection__corner' : `draw-selection__${name}`;
    mark.dataset.selectionControl = name;
    if (name.length === 2) mark.dataset.selectionCorner = name;
    mark.setAttribute('aria-hidden', 'true');
    mark.title = name === 'pivot' ? '回転中心を移動（絵は動きません）' : name === 'rotate' ? 'ドラッグで回転。Shift：90度、Alt：吸着なし' : '四隅をドラッグして拡縮';
    board.append(mark); marks[name] = mark; nodes.push(mark);
  }
  const stem = doc.createElement('span'); stem.className = 'draw-selection__stem'; stem.setAttribute('aria-hidden', 'true'); board.append(stem); nodes.push(stem);
  function layout(frame) {
    const r = canvas.getBoundingClientRect(), b = board.getBoundingClientRect(), sx = r.width / canvas.width, sy = r.height / canvas.height;
    const screen = p => ({ x: r.left + p.x * sx, y: r.top + p.y * sy });
    const logical = p => ({ x: (p.x - r.left) / sx, y: (p.y - r.top) / sy });
    const controls = { ...selectionFrameCorners(frame), pivot: frame.pivot || selectionDefaultPivot(frame) };
    // Prefer the top edge; pick another edge when the viewport clips that control.
    const { c, s } = selectionAxes(frame.angle);
    const edges = [[frame.width / 2, 0, s, -c], [frame.width, frame.height / 2, c, s], [frame.width / 2, frame.height, -s, c], [0, frame.height / 2, -c, -s]];
    const candidates = edges.map(([x, y, nx, ny]) => {
      const anchor = screen(selectionWorldPoint(frame, x, y)), norm = Math.hypot(nx * sx, ny * sy);
      return { anchor, point: { x: anchor.x + nx * sx / norm * 34, y: anchor.y + ny * sy / norm * 34 } };
    });
    const inside = p => p.x >= b.left + 22 && p.x <= b.right - 22 && p.y >= b.top + 22 && p.y <= b.bottom - 22;
    const chosen = candidates.find(candidate => inside(candidate.point)) || candidates[0];
    const rotate = { x: Math.max(b.left + 22, Math.min(b.right - 22, chosen.point.x)), y: Math.max(b.top + 22, Math.min(b.bottom - 22, chosen.point.y)) };
    controls.rotate = logical(rotate);
    return { r, b, sx, sy, screen, controls, stem: { from: chosen.anchor, to: rotate } };
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
    const { r, b, sx, sy, screen, controls, stem: line } = layout(frame), { c, s } = selectionAxes(frame.angle);
    const offset = p => ({ x: p.x - b.left - board.clientLeft, y: p.y - b.top - board.clientTop });
    const origin = offset(screen(frame));
    Object.assign(frameNode.style, { left: `${origin.x}px`, top: `${origin.y}px`, width: `${frame.width * sx}px`, height: `${frame.height * sy}px`, transformOrigin: '0 0', transform: `matrix(${c},${s * sy / sx},${-s * sx / sy},${c},0,0)` });
    for (const key of ['x', 'y', 'width', 'height', 'angle']) frameNode.dataset[key] = String(frame[key] || 0);
    for (const [name, p] of Object.entries(controls)) {
      const location = offset(screen(p)); Object.assign(marks[name].style, { left: `${location.x}px`, top: `${location.y}px` });
      marks[name].dataset.canvasX = String(p.x); marks[name].dataset.canvasY = String(p.y);
    }
    const from = offset(line.from), dx = line.to.x - line.from.x, dy = line.to.y - line.from.y;
    Object.assign(stem.style, { left: `${from.x}px`, top: `${from.y}px`, width: `${Math.hypot(dx, dy)}px`, transform: `rotate(${Math.atan2(dy, dx)}rad)` });
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
