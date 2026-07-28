import assert from 'node:assert/strict';
import fs from 'node:fs';

const generator = fs.readFileSync('scripts/generate-pixfind-ogp-pages.mjs', 'utf8');
const workflow = fs.readFileSync('.github/workflows/generate-pixfind-ogp-pages.yml', 'utf8');
const dispatchFunction = fs.readFileSync('supabase/functions/pixfind-ogp-dispatch/index.ts', 'utf8');
const pixfindApp = fs.readFileSync('pixfind/app.js', 'utf8');

assert.match(generator, /pixfind_puzzles/);
assert.match(generator, /ogp\.png/);
assert.doesNotMatch(generator, /ogp-square\.png/);
assert.match(generator, /og:type/);
assert.match(generator, /pixfind\/puzzles/);
assert.match(generator, /window\.location\.replace/);
assert.match(workflow, /cron: '\*\/5 \* \* \* \*'/);
assert.match(workflow, /repository_dispatch:[\s\S]*types: \[pixfind-ogp-published\]/);
assert.match(workflow, /node scripts\/generate-pixfind-ogp-pages\.mjs/);
assert.match(workflow, /git status --porcelain --untracked-files=all -- pixfind\/puzzles/);
assert.match(workflow, /git add pixfind\/puzzles/);
assert.match(dispatchFunction, /GITHUB_PIXFIND_OGP_DISPATCH_TOKEN/);
assert.match(dispatchFunction, /api\.github\.com\/repos\/\$\{REPOSITORY\}\/dispatches/);
assert.match(dispatchFunction, /event_type: EVENT_TYPE/);
assert.match(dispatchFunction, /client_id/);
assert.match(dispatchFunction, /creator_user_id/);
assert.match(pixfindApp, /function requestPixfindOgpPageGeneration\(puzzleId\)/);
assert.match(pixfindApp, /await uploadPuzzleFile\(ogpPath, ogpBlob, 'image\/png', \{ upsert: true \}\);[\s\S]*await requestPixfindOgpPageGeneration\(puzzleId\);/);
assert.doesNotMatch(pixfindApp, /PIXFIND_SHARE_OGP_SQUARE_SIZE|ogp-square\.png/);

for (const entry of fs.readdirSync('pixfind/puzzles', { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const page = fs.readFileSync(`pixfind/puzzles/${entry.name}/index.html`, 'utf8');
  assert.equal((page.match(/<meta property="og:image"/g) || []).length, 1, `${entry.name} must publish one OGP image`);
  assert.match(page, /<meta property="og:image" content="[^"]+\/ogp\.png"\/>/);
  assert.doesNotMatch(page, /ogp-square\.png/);
}
console.log('PiXFiND OGP page checks passed.');
