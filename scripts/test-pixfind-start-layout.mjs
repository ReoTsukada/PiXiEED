import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'pixfind/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'pixfind/styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'pixfind/app.js'), 'utf8');

assert.match(html, /<body data-pixfind-screen="start">/);
assert.match(html, /styles\.css\?v=2026\.07\.19-market-grid3/);
assert.match(html, /app\.js\?v=2026\.07\.19-market-grid3/);
assert.doesNotMatch(html, />他のゲーム・ツール<\/a>/);
assert.doesNotMatch(html, /class="(?:start-ad|difficulty-ad|game-ad)"/);

assert.match(app, /document\.body\.dataset\.pixfindScreen = target/);
assert.match(app, /idx === 7 && official\.length >= 8/);
assert.match(app, /function createPuzzleListAd\(\)/);
assert.match(app, /data-ad-format="auto"/);
assert.match(app, /data-full-width-responsive="true"/);
assert.doesNotMatch(app, /createPuzzleAdCard/);
assert.match(css, /body\[data-pixfind-screen\] \{\s*display: block;/);
assert.match(css, /body\[data-pixfind-screen="start"\] \.screen--start \{[^}]*overflow: hidden;/s);
assert.match(css, /\.screen--difficulty \{[^}]*overflow-y: auto;/s);
assert.match(css, /body\[data-pixfind-screen="start"\] > \.pixieed-shared-footer \{[^}]*position: fixed;/s);
assert.match(css, /body\[data-pixfind-screen\]:not\(\[data-pixfind-screen="start"\]\) > \.pixieed-shared-footer \{\s*display: none;/);
assert.match(css, /\.puzzle-list \{[^}]*repeat\(auto-fill, minmax\(220px, 1fr\)\)/s);
assert.match(css, /\.puzzle-card,\s*\.puzzle-card--official \{[^}]*overflow: hidden;/s);
assert.match(css, /\.puzzle-card__actions \{[^}]*repeat\(2, minmax\(0, 1fr\)\)/s);
assert.match(css, /\.puzzle-list-ad \{[^}]*grid-column: 1 \/ -1;/s);
assert.match(css, /body\[data-pixieed-page="pixfind"\] \.pixieed-common-tabbar \{[^}]*left: 0 !important;[^}]*right: 0 !important;/s);

console.log('PiXFiND start layout checks passed.');
