import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const publicPages = [
  'index.html',
  'studio/index.html',
  'community/index.html',
  'market/index.html',
  'market/about.html',
  'market/help.html',
  'market/item.html',
  'market/seller.html',
  'market/sell.html',
  'market/review.html',
  'account/index.html',
  'portfolio/index.html',
  'contact/index.html',
  'help/index.html',
  'glossary/index.html',
  'terms/index.html',
  'privacy/index.html',
  'legal/index.html',
  'notice/index.html',
  'notes/index.html',
  'events/index.html',
  'qr/index.html'
];

const localeSource = fs.readFileSync(path.join(root, 'scripts/shared-locale.js'), 'utf8');
const localeKeys = new Set(
  [...localeSource.matchAll(/^\s{6}([A-Za-z][A-Za-z0-9_]*):/gm)].map((match) => match[1])
);
const i18nAttributePattern = /data-i18n(?:-key|-aria-label|-placeholder|-title)="([^"]+)"/g;
const publicFiles = [
  ...publicPages,
  'scripts/shared-profile-header.js',
  'scripts/shared-locale.js',
  'site/public-design-system.css',
  'site/shared-app-shell.css'
];

let i18nReferenceCount = 0;
for (const relativePath of publicPages) {
  const absolutePath = path.join(root, relativePath);
  assert.equal(fs.existsSync(absolutePath), true, `Missing public page: ${relativePath}`);
  const html = fs.readFileSync(absolutePath, 'utf8');
  for (const match of html.matchAll(i18nAttributePattern)) {
    i18nReferenceCount += 1;
    assert.equal(localeKeys.has(match[1]), true, `${relativePath} references unknown locale key: ${match[1]}`);
  }
}

const forbiddenPublicNames = /PiXiEED\s+Core|PiXiEEDCore/i;
for (const relativePath of publicFiles) {
  const content = fs.readFileSync(path.join(root, relativePath), 'utf8');
  assert.doesNotMatch(content, forbiddenPublicNames, `Forbidden public brand name in ${relativePath}`);
}

const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const studio = fs.readFileSync(path.join(root, 'studio/index.html'), 'utf8');
const studioScript = fs.readFileSync(path.join(root, 'studio/studio.js'), 'utf8');
assert.match(home, /PiXiEEDstudio/);
assert.match(home, /iDRAW/);
assert.match(home, /iAUDIO/);
assert.match(home, /iGAME/);
assert.match(studio, /id="studioProjectList"/);
assert.match(studio, /iDRAW/);
assert.match(studio, /iAUDIO/);
assert.match(studio, /iGAME/);
assert.match(studio, /new_project=1&amp;mode=DRAW/);
assert.match(studio, /new_project=1&amp;mode=AUDIO&amp;audio=on/);
assert.match(studio, /new_project=1&amp;mode=GAME/);
assert.match(studio, /data-studio-mode="game"/);
assert.doesNotMatch(studio, /data-studio-mode="game"[^>]*aria-disabled="true"/);
assert.match(studioScript, /iGAME is available in the local editor|iGAMEはローカルエディターで利用できます/);
assert.match(studioScript, /pixiedraw2-workspace-manifest/);
assert.match(studioScript, /projectHref\(projectId, mode = 'draw'\)/);
assert.match(studioScript, /normalizedMode\.toUpperCase\(\)/);
assert.match(studioScript, /normalizedMode === 'audio'/);
assert.match(studioScript, /pixiedraw2:project-changed/);

console.log(`Public shell audit passed (${publicPages.length} pages, ${i18nReferenceCount} locale references).`);
