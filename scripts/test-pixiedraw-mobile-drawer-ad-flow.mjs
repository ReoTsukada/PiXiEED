import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const root of ['PiXiEEDrawDEV', 'pixiedraw']) {
  const html = fs.readFileSync(`${root}/index.html`, 'utf8');
  const css = fs.readFileSync(`${root}/assets/css/style.css`, 'utf8');

  assert.match(html, /panelBody\.appendChild\(mount\)/,
    `${root}: mobile ads remain at the end of the panel body`);
  assert.match(html, /\['panelColor', 'panelTools', 'panelFrames', 'panelFile', 'panelSettings', 'panelDetails'\]/,
    `${root}: the unified Tools\/Color panel resolves its final Color mount first`);
  assert.doesNotMatch(html, /mobileDrawerAdSlot|mobileDrawerAdMount/,
    `${root}: no fixed drawer-footer overlay is introduced`);
  assert.match(css, /mobile-panel \.panel-ad-mount\[data-panel-ad-mount='left'\] \{[\s\S]*?display: none !important;[\s\S]*?height: 0 !important;/,
    `${root}: inactive and duplicate mobile mounts reserve no space`);
  assert.match(css, /mobile-drawer\[data-mode='full'\][\s\S]*?#panelColor \.panel-ad-mount\[data-panel-ad-mount='left'\],[\s\S]*?#panelFrames \.panel-ad-mount\[data-panel-ad-mount='left'\],[\s\S]*?#panelFile \.panel-ad-mount\[data-panel-ad-mount='left'\],[\s\S]*?#panelSettings \.panel-ad-mount\[data-panel-ad-mount='left'\]/,
    `${root}: supported full-height panels share one bottom-flow rule`);
  assert.doesNotMatch(css, /mobile-drawer\[data-mode='full'\][^\{]*#panelTools \.panel-ad-mount/,
    `${root}: Tools does not create a gap before Color`);
  assert.match(css, /#panelFrames \.panel-section__body \{[\s\S]*?display: block;[\s\S]*?overflow-y: auto;/,
    `${root}: Frames\/Layers owns a normal scrolling content flow`);
  assert.match(css, /#panelFrames \.timeline-card,[\s\S]*?#panelFrames \.panel-ad-mount[\s\S]*?position: static !important;/,
    `${root}: the timeline and its final ad cannot overlap by positioning`);
}

console.log('PiXiEEDraw mobile drawer ad flow checks passed.');
