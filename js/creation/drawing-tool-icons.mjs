const SVG_NS = 'http://www.w3.org/2000/svg';

const shapes = {
  pen: [['path', { d: 'M4 20l1.2-4.1L16.1 5a2.7 2.7 0 0 1 3.8 3.8L9 19.7 4 20z' }], ['path', { d: 'm13.9 7.2 3.8 3.8M5.2 15.9l3 3' }]],
  eraser: [['path', { d: 'M9 20h11' }], ['path', { d: 'M4 15l9-9 6 6-7 7H8z' }], ['path', { d: 'M9 10l6 6' }]],
  fill: [['path', { d: 'm3.5 11.5 6-6 8 8-6 6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8Z' }], ['path', { d: 'M9.5 5.5v-2a2 2 0 0 1 3.4-1.4l3.8 3.8a2 2 0 0 1 0 2.8L14 12M3.5 11.5h12M17.5 13.5h2' }], ['path', { d: 'M20 15c1.2 1.6 1.8 2.7 1.8 3.5a1.8 1.8 0 0 1-3.6 0c0-.8.6-1.9 1.8-3.5Z', fill: 'currentColor' }], ['path', { d: 'M3 22h12', opacity: '.55' }]],
  picker: [['path', { d: 'M16 3a3 3 0 0 1 4.2 4.2l-3 3-4.2-4.2L16 3Z', fill: 'currentColor', opacity: '.35' }], ['path', { d: 'm11.5 6.5 6 6M13 9l-7.5 7.5L5 19l2.5-.5L15 11' }], ['path', { d: 'M19 15.5c1.2 1.6 1.8 2.5 1.8 3.4a1.8 1.8 0 0 1-3.6 0c0-.9.6-1.8 1.8-3.4Z' }]],
  line: [['path', { d: 'M5 19L19 5' }], ['rect', { x: '3', y: '17', width: '4', height: '4', rx: '1' }], ['rect', { x: '17', y: '3', width: '4', height: '4', rx: '1' }]],
  rectangle: [['rect', { x: '4', y: '5', width: '16', height: '14', rx: '1' }]],
  'rectangle-fill': [['rect', { x: '4', y: '5', width: '16', height: '14', rx: '1', fill: 'currentColor' }], ['path', { d: 'M8 5v14M12 5v14M16 5v14', opacity: '.35' }]],
  ellipse: [['ellipse', { cx: '12', cy: '12', rx: '8', ry: '6' }]],
  'ellipse-fill': [['ellipse', { cx: '12', cy: '12', rx: '8', ry: '6', fill: 'currentColor' }], ['path', { d: 'M6 12h12', opacity: '.35' }]],
  spray: [['rect', { x: '4', y: '10', width: '8', height: '11', rx: '2' }], ['path', { d: 'M6 10V6h4v4M9 6h4M4 13h8M6 16h4' }], ['circle', { cx: '16', cy: '5', r: '1', fill: 'currentColor', stroke: 'none' }], ['circle', { cx: '20', cy: '3', r: '1', fill: 'currentColor', stroke: 'none' }], ['circle', { cx: '21', cy: '8', r: '1', fill: 'currentColor', stroke: 'none' }], ['circle', { cx: '16', cy: '10', r: '1', fill: 'currentColor', stroke: 'none' }]],
  select: [['rect', { x: '4', y: '4', width: '16', height: '16', 'stroke-dasharray': '2.5 2' }], ['path', { d: 'M8 12h8M12 8v8' }]],
  mirror: [['path', { d: 'M12 3v18', 'stroke-dasharray': '2 2.5' }], ['path', { d: 'M9 7L4 12l5 5z' }], ['path', { d: 'M15 7l5 5-5 5z' }]],
  'mirror-vertical': [['path', { d: 'M12 3v18', 'stroke-dasharray': '2 2.5', transform: 'rotate(90 12 12)' }], ['path', { d: 'M9 7L4 12l5 5z', transform: 'rotate(90 12 12)' }], ['path', { d: 'M15 7l5 5-5 5z', transform: 'rotate(90 12 12)' }]],
  'mirror-diagonal-down': [['path', { d: 'M12 3v18', 'stroke-dasharray': '2 2.5', transform: 'rotate(-45 12 12)' }], ['path', { d: 'M9 7L4 12l5 5z', transform: 'rotate(-45 12 12)' }], ['path', { d: 'M15 7l5 5-5 5z', transform: 'rotate(-45 12 12)' }]],
  'mirror-diagonal-up': [['path', { d: 'M12 3v18', 'stroke-dasharray': '2 2.5', transform: 'rotate(45 12 12)' }], ['path', { d: 'M9 7L4 12l5 5z', transform: 'rotate(45 12 12)' }], ['path', { d: 'M15 7l5 5-5 5z', transform: 'rotate(45 12 12)' }]],
  grid: [['rect', { x: '4', y: '4', width: '16', height: '16', rx: '2' }], ['path', { d: 'M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16' }]],
  settings: [['path', { d: 'M4 6h16M4 12h16M4 18h16' }], ['circle', { cx: '9', cy: '6', r: '2', fill: 'currentColor' }], ['circle', { cx: '15', cy: '12', r: '2', fill: 'currentColor' }], ['circle', { cx: '8', cy: '18', r: '2', fill: 'currentColor' }]],
  onion: [['rect', { x: '5', y: '6', width: '14', height: '14', rx: '2', opacity: '.5' }], ['rect', { x: '3', y: '4', width: '14', height: '14', rx: '2' }], ['path', { d: 'M7 8h6M7 11h6M7 14h3', opacity: '.65' }]]
};

export const DRAWING_TOOL_ICON_NAMES = Object.freeze(Object.keys(shapes));

/** Create a decorative 24px SVG glyph for a drawing tool name. */
export function createDrawingToolIcon(name, doc = globalThis.document) {
  if (!Object.hasOwn(shapes, name)) throw new RangeError(`Unknown drawing tool icon: ${name}`);
  if (!doc?.createElementNS) throw new TypeError('A document with createElementNS is required');
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'drawing-tool-icon');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const [tag, attributes] of shapes[name]) {
    const shape = doc.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attributes)) {
      if (key === 'fill' && shape.style) shape.style.fill = value;
      shape.setAttribute(key, value);
    }
    svg.append(shape);
  }
  return svg;
}

/** Replace decorative glyphs on controls explicitly marked for shared drawing icons. */
export function applyDrawingToolIcons(root) {
  if (!root?.querySelectorAll) return 0;
  let applied = 0;
  for (const control of root.querySelectorAll('[data-drawing-icon]')) {
    const name = control.dataset?.drawingIcon ?? control.getAttribute('data-drawing-icon');
    if (!Object.hasOwn(shapes, name) || !control.ownerDocument?.createElementNS) continue;
    const icon = createDrawingToolIcon(name, control.ownerDocument);
    const existing = control.querySelector?.('svg');
    if (existing?.replaceWith) existing.replaceWith(icon);
    else if (control.prepend) control.prepend(icon);
    else continue;
    applied += 1;
  }
  return applied;
}
