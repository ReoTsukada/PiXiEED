import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const html = read('PiXiEEDrawDEV/index.html');
const css = read('PiXiEEDrawDEV/assets/css/style.css');
const startup = read('PiXiEEDrawDEV/assets/js/modules/startup-workflow-utils.js');
const config = read('PiXiEEDrawDEV/assets/js/modules/ui-static-config.js');
const pointer = read('PiXiEEDrawDEV/assets/js/modules/canvas-pointer-workflow-utils.js');
const drawing = read('PiXiEEDrawDEV/assets/js/modules/canvas-drawing-workflow-utils.js');

assert.match(startup, /String\(entry\?\.name \|\| DEFAULT_DOCUMENT_NAME\)\.replace\(\/\\\.pixieedraw\$\/i, ''\)/);
assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.startup-workspace__list\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(html, /style\.css\?v=20260715-export-preview-ad-layout1/);
assert.match(html, /startup-workflow-utils\.js\?v=20260715-startup-grid-no-oval1/);
assert.match(html, /data-tool="ellipse"[\s\S]*?<span>丸<\/span>/);
assert.match(html, /data-tool="ellipseFill"[\s\S]*?<span>塗り丸<\/span>/);
assert.doesNotMatch(html, /data-tool="oval(?:Fill)?"/);
assert.doesNotMatch(html, />(?:塗り)?楕円</);
assert.doesNotMatch(config, /tools:\s*\[[^\]]*'oval(?:Fill)?'/);
assert.doesNotMatch(pointer, /(?:activeTool|pointerState\.tool|tool) === 'oval(?:Fill)?'/);
assert.doesNotMatch(drawing, /function drawOval\b|\bdrawOval,/);
assert.match(config, /oval:\s*'ellipse'/, 'saved legacy oval state must migrate to the circle tool');
assert.match(config, /ovalFill:\s*'ellipseFill'/, 'saved legacy filled-oval state must migrate to the filled-circle tool');

console.log('PiXiEEDrawDEV startup two-column grid and oval removal checks passed.');
