import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sharedNav = await readFile(new URL('./shared-bottom-nav.js', import.meta.url), 'utf8');

assert.match(sharedNav, /key: 'tools', label: 'ツール'[\s\S]*?action: 'tools'/);
assert.match(sharedNav, /pixieed-tools-layer/);
assert.match(sharedNav, /pixieed-tools-grid/);
assert.match(sharedNav, /setToolsPanelOpen/);
assert.match(sharedNav, /aria-haspopup', 'dialog'/);
assert.match(sharedNav, /PiXiEEDstudio/);
assert.match(sharedNav, /PiXiEELENS/);
assert.match(sharedNav, /QRコードを作る/);
assert.match(sharedNav, /PiXFiND/);
assert.match(sharedNav, /まおいつ/);
assert.doesNotMatch(sharedNav, /key: 'camera', label: 'カメラ'/);

console.log('Shared tools panel guards passed.');
