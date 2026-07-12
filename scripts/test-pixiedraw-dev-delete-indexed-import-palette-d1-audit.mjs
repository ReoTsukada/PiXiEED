import assert from 'node:assert/strict';
import fs from 'node:fs';

const devRoot = 'PiXiEEDrawDEV';
const app = fs.readFileSync(`${devRoot}/assets/js/app.js`, 'utf8');
const startup = fs.readFileSync(`${devRoot}/assets/js/modules/startup-workflow-utils.js`, 'utf8');
const recent = fs.readFileSync(`${devRoot}/assets/js/modules/recent-project-workflow-utils.js`, 'utf8');
const panel = fs.readFileSync(`${devRoot}/assets/js/modules/palette-panel-utils.js`, 'utf8');
const decoder = fs.readFileSync(`${devRoot}/assets/js/modules/image-import-decode-utils.js`, 'utf8');
const importer = fs.readFileSync(`${devRoot}/assets/js/modules/open-import-workflow-utils.js`, 'utf8');
const canonical = fs.readFileSync(`${devRoot}/assets/js/modules/canonical-v2-project-utils.js`, 'utf8');
const html = fs.readFileSync(`${devRoot}/index.html`, 'utf8');
const css = fs.readFileSync(`${devRoot}/assets/css/style.css`, 'utf8');

assert.match(recent, /dataset\.startupRecentDeleteId = entry\.id/);
assert.match(startup, /target\.closest\('button\[data-startup-recent-delete-id\]'\)/);
assert.match(startup, /openRecentProjectDeleteConfirmDialog\(entry/);
assert.match(html, /id="recentProjectDeleteConfirmDialog"/);
assert.match(startup, /dialog\.showModal\(\)/);
assert.match(css, /\.modal::backdrop/);

assert.match(decoder, /function buildIndexedPaletteFromFrameDataList/);
assert.match(decoder, /buildIndexedPaletteFromFrameDataList,/);
assert.match(panel, /const extraction = buildIndexedPaletteFromFrameDataList\(/);
assert.match(app, /buildIndexedPaletteFromFrameDataList: \(\.\.\.args\) => imageImportPaletteUtils\.buildIndexedPaletteFromFrameDataList\?\.\(\.\.\.args\)/);
assert.match(app, /function buildIndexedPaletteFromFrameDataList\(\.\.\.args\) \{[\s\S]{0,300}imageImportPaletteUtils\?\.buildIndexedPaletteFromFrameDataList/);
assert.doesNotMatch(app, /const\s*\{[\s\S]{0,400}buildIndexedPaletteFromFrameDataList[\s\S]{0,400}\}\s*=\s*imageImportDecodeUtils/);
assert.match(panel, /beginHistory\('colorModeConvert'\);[\s\S]{0,300}convertCurrentDocumentRgbPixelsToIndexedPalette\(\)/);
assert.match(panel, /state\.colorMode = nextMode;/);

assert.match(importer, /const palette = createRgbModeDefaultPalette\(\)/);
assert.match(importer, /colorMode: COLOR_MODE_RGB/);
assert.doesNotMatch(importer, /applyImportedPalettePlanToCanonicalCandidate/);
assert.match(importer, /activeRgb = palette\[activePaletteIndex\]/);
assert.match(canonical, /const project = cloneSafe\(decodedPayload/);

console.log('D1 delete dialog, Indexed dependency, and RGB import palette audit checks passed');
