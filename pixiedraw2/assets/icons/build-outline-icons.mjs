import fs from "node:fs";

const filePath = new URL("./draw2-icons.svg", import.meta.url);
// Keep the normalized source separate from the generated output so repeated
// builds never apply the optical correction twice.
const sourcePath = new URL("./draw2-icons-source.svg", import.meta.url);
const source = fs.readFileSync(sourcePath, "utf8");

// Keep all PiXYNC signal states on one geometry. State changes are expressed
// by color/selection outside the glyph; the error state only adds a slash.
const syncSignal = `<path d="M4 9c4-4 12-4 16 0M7 13c2.8-2.8 7.2-2.8 10 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="18" r="1.5" fill="currentColor"/>`;
const syncSignalError = `${syncSignal}<path d="M5 5l14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`;
const anchorArrow = (rotation) => `<g transform="rotate(${rotation} 12 12)"><path d="M12 3l4 4h-2v7h-4V7H8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>`;
const mirrorAxisGlyph = (rotation) => `<g transform="translate(0.8 0.8) scale(1.12) rotate(${rotation} 10 10)"><rect x="3" y="9" width="14" height="2" rx="1" fill="none" stroke="currentColor" stroke-width="1.785714" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 3l4 5 4-5zM6 17l4-5 4 5z" fill="none" stroke="currentColor" stroke-width="1.785714" stroke-linecap="round" stroke-linejoin="round"/></g>`;

// These forms are authored directly on the 24px grid because their optical
// center or joins cannot be improved by a uniform scale alone.
const manual = {
  "icon-commands": `<path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  "icon-undo": `<path d="M12 4A8 8 0 1 1 6.3 17.7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="m6.3 17.7 3.5.7-2.8 2.8z" fill="currentColor"/>`,
  "icon-redo": `<path d="M12 4A8 8 0 1 0 17.7 17.7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="m17.7 17.7-3.5.7 2.8 2.8z" fill="currentColor"/>`,
  "icon-rollback": `<path d="M18 18H9a5 5 0 0 1-5-5V8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="m4 5-3.5 3.5h7z" fill="currentColor"/>`,
  "icon-export": `<path d="M5 13v5h14v-5M12 4v10M8 8l4-4 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  "icon-import": `<path d="M5 11v7h14v-7M12 4v10M8 10l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  "icon-edit": `<path d="m4 17 1-4L15 3l4 4L9 17H4zM13 5l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  "icon-pen": `<path d="m4 17 1-4L15 3l4 4L9 17H4zM13 5l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  "icon-eraser": `<path d="m5 15 9-9 5 5-7 7H8l-3-3zM8 18h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  "icon-fill": `<path d="M6 5h10l2 3-2 11H6L4 8l2-3zM4 8h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  "icon-select": `<rect x="4" y="4" width="16" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2" stroke-linecap="round"/>`,
  "icon-eyedropper": `<path d="m14 4 6 6-3 3-6-6z" fill="currentColor"/><path d="m11 7 6 6-7 7H4v-6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 20c0-1.1.8-2 1.5-3 .7 1 1.5 1.9 1.5 3a1.5 1.5 0 0 1-3 0z" fill="currentColor"/>`,
  "icon-pan": `<path d="M12 3v5m0 0 3-3m-3 3-3-3M21 12h-5m0 0 3-3m-3 3 3 3M12 21v-5m0 0 3 3m-3-3-3 3M3 12h5m0 0-3-3m3 3-3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  "icon-rect": `<rect x="4" y="4" width="16" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`,
  "icon-ellipse": `<ellipse cx="12" cy="12" rx="8" ry="6" fill="none" stroke="currentColor" stroke-width="2"/>`,
  "icon-circle": `<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/>`,
  "icon-tools": `<path d="M5 8h14v10H5zM8 8V6h8v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  "icon-warning": `<path d="m12 4 8 16H4L12 4zM12 10v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="17" r="1" fill="currentColor"/>`,
  "icon-layers": `<path d="m4 7 8-4 8 4-8 4-8-4zm0 5 8 4 8-4M4 17l8 4 8-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  "icon-timeline": `<rect x="4" y="5" width="16" height="14" rx="1" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 8v8M12 8v8M16 8v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  "icon-note": `<path d="M15 4h5v4h-3v7a4 4 0 1 1-4-4h2V4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  "icon-eye": `<path d="M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/>`,
  "icon-eye-off": `<path d="M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6zM5 5l14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  "icon-link": `<path d="M10 8H8a4 4 0 1 0 0 8h2M14 8h2a4 4 0 1 1 0 8h-2M8 12h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  "icon-search": `<circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="m15 15 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  "icon-rotate-ccw": `<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 3v5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  "icon-rotate-cw": `<path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 3v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  "icon-rotate-180": `<path d="M6 8a6 6 0 0 1 12 0v1.5M18 16a6 6 0 0 1-12 0v-1.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="m18 13.5-3.5-3.5h7zM6 10.5 2.5 14h7z" fill="currentColor"/>`,
  "icon-opacity": `<path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor"/><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/>`,
  "icon-anchor-nw": anchorArrow(315),
  "icon-anchor-n": anchorArrow(0),
  "icon-anchor-ne": anchorArrow(45),
  "icon-anchor-w": anchorArrow(270),
  "icon-anchor-e": anchorArrow(90),
  "icon-anchor-sw": anchorArrow(225),
  "icon-anchor-s": anchorArrow(180),
  "icon-anchor-se": anchorArrow(135),
  "icon-border": `<rect x="4" y="4" width="16" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`,
  "icon-mirror-diagonal-down": mirrorAxisGlyph(45),
  "icon-mirror-diagonal-up": mirrorAxisGlyph(315),
  "icon-zoom-out": `<circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="m15 15 5 5M7 10h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  "icon-zoom-in": `<circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="m15 15 5 5M7 10h6M10 7v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  "icon-fit-canvas": `<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="9" y="9" width="6" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="2"/>`,
  "icon-sync-local": `<rect x="4" y="5" width="16" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 20h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  "icon-sync-connecting": syncSignal,
  "icon-sync-online": syncSignal,
  "icon-sync-error": syncSignalError,
};

// Solid shapes remain only where fill is part of the operation or is the
// smallest recognizable mark at 16px (transport controls, palette, brush,
// hand, and the explicitly filled shape tools).
const semanticFills = new Set([
  "icon-play", "icon-pause", "icon-stop", "icon-record", "icon-more",
  "icon-rect-fill", "icon-ellipse-fill", "icon-circle-fill", "icon-brush",
  "icon-color", "icon-select-color", "icon-manual", "icon-opacity",
]);

const symbols = source.split("<symbol").slice(1).map((part) => {
  const end = part.indexOf(">");
  const attrs = part.slice(0, end);
  const bodyEnd = part.indexOf("</symbol>");
  const body = part.slice(end + 1, bodyEnd);
  const id = attrs.split(`id="`)[1].split(`"`)[0];
  return { id, body };
});

const result = symbols.map(({ id, body }) => {
  if (manual[id]) {
    return `  <symbol id="${id}" viewBox="0 0 24 24">${manual[id]}</symbol>`;
  }

  // Non-manual symbols in the source are already normalized. Keep their
  // geometry and effective 2px stroke intact instead of wrapping again.
  return `  <symbol id="${id}" viewBox="0 0 24 24">${body.trim()}</symbol>`;
}).join("\n");

const output = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" shape-rendering="geometricPrecision">\n${result}\n</svg>\n`;
fs.writeFileSync(filePath, output);
console.log(JSON.stringify({
  version: "0.4.0",
  symbols: symbols.length,
  direct24px: Object.keys(manual).length,
  semanticFillExceptions: semanticFills.size,
  bytes: output.length,
}));
