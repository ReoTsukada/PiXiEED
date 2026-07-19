import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'qr/index.html'), 'utf8');

assert.match(html, /<iframe[^>]+src="\.\.\/qr-maker\/index\.html\?embed=1"/);
assert.match(html, /<h1 class="sr-only">QRコードメーカー<\/h1>/);
assert.match(html, /shared-bottom-nav\.js\?v=2026\.07\.19-ad-lifecycle1/);
assert.doesNotMatch(html, /販売所|shopSearch|shopStatusFilter|shopResetBtn|data-tab="market"|data-view="market"/);
assert.doesNotMatch(html, /QRコードメーカーと販売所/);

console.log('QR maker-only page checks passed.');
