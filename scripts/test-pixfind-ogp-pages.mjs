import assert from 'node:assert/strict';
import fs from 'node:fs';

const generator = fs.readFileSync('scripts/generate-pixfind-ogp-pages.mjs', 'utf8');
const workflow = fs.readFileSync('.github/workflows/generate-pixfind-ogp-pages.yml', 'utf8');

assert.match(generator, /pixfind_puzzles/);
assert.match(generator, /ogp-square\.png/);
assert.match(generator, /og:type/);
assert.match(generator, /pixfind\/puzzles/);
assert.match(generator, /window\.location\.replace/);
assert.match(workflow, /cron: '\*\/5 \* \* \* \*'/);
assert.match(workflow, /node scripts\/generate-pixfind-ogp-pages\.mjs/);
assert.match(workflow, /git status --porcelain --untracked-files=all -- pixfind\/puzzles/);
assert.match(workflow, /git add pixfind\/puzzles/);
console.log('PiXFiND OGP page checks passed.');
