import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const [html, css] = await Promise.all([
  readFile(new URL('pixiedraw/index.html', root), 'utf8'),
  readFile(new URL('pixiedraw/assets/css/style.css', root), 'utf8'),
]);

assert.match(html, /id="timelapseCanvas"/);
assert.doesNotMatch(html, /id="timelapseCanvas"[^>]*style=/);
assert.match(html, /class="field-group timelapse-actions"/);
assert.match(css, /#timelapseDialog\.modal\s*\{[\s\S]{0,500}width:\s*min\(760px,[\s\S]{0,500}height:\s*min\(86vh, 760px\)/);
assert.match(css, /#timelapseCanvas\s*\{[\s\S]{0,320}width:\s*min\(100%, 680px\)/);
assert.match(css, /#timelapseDialog \.timelapse-actions\s*\{[\s\S]{0,240}grid-template-columns:\s*repeat\(4/);
assert.match(css, /@media \(max-width: 767px\)[\s\S]{0,300}#timelapseDialog \.timelapse-actions[\s\S]{0,180}repeat\(2/);
assert.match(css, /data-pixieed-mobile-chrome='true'\]\.is-mobile-layout #timelapseDialog\.modal\[open\][\s\S]{0,420}- 8px/);
assert.match(css, /@media \(orientation: landscape\)[\s\S]{0,500}#timelapseDialog\.modal[\s\S]{0,300}width:\s*clamp\(640px, 64vw, 820px\)/);
assert.match(css, /@media \(orientation: landscape\) and \(max-height: 620px\)/);

console.log('PiXiEEDraw timelapse panel layout checks passed.');
