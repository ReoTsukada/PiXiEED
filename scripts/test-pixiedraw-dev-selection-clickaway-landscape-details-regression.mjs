import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = relativePath => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const pointer = read('PiXiEEDrawDEV/assets/js/modules/canvas-pointer-workflow-utils.js');
const style = read('PiXiEEDrawDEV/assets/css/style.css');
const html = read('PiXiEEDrawDEV/index.html');

assert.match(
  pointer,
  /if \(pendingMoveState\) \{[\s\S]*?const finalized = confirmPendingSelectionMove\(\{ allowOutOfBoundsClip: true \}\);[\s\S]*?return;\s*}/,
  'clicking outside a floating selection must confirm it before ending the pointer action'
);
assert.match(
  pointer,
  /function clearSelection\(\) \{[\s\S]*?finalizeSelectionMove\(\{ allowOutOfBoundsClip: true \}\)/,
  'clearing the selection must commit pending moved pixels first'
);
assert.match(
  pointer,
  /function cancelPendingSelectionMove\(\) \{[\s\S]*?rollbackPendingHistory\(\{ reRender: true \}\)/,
  'explicit cancellation must restore the pre-move history state'
);
assert.match(
  style,
  /body:not\(\.is-mobile-layout\) \.editor-command-lane__actions \{[\s\S]*?margin-left: auto;/,
  'landscape command buttons must occupy the right side of the top lane'
);
assert.match(
  style,
  /body:not\(\.is-mobile-layout\) \.editor-command-lane__actions > \.right-utility-menu \{\s*order: 99;/,
  'the details menu must be the rightmost landscape command'
);
assert.match(html, /style\.css\?v=20260715-startup-grid-no-oval1/);

console.log('PiXiEEDraw DEV selection click-away and landscape details regression checks passed.');
