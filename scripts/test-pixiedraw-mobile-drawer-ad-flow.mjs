import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const root of ['pixiedraw']) {
  const html = fs.readFileSync(`${root}/index.html`, 'utf8');
  const css = fs.readFileSync(`${root}/assets/css/style.css`, 'utf8');

  assert.match(html, /panelBody\.appendChild\(mount\)/,
    `${root}: mobile ads remain at the end of the panel body`);
  assert.match(html, /\['panelColor', 'panelTools', 'panelFrames'\]/,
    `${root}: shared mobile ads stay limited to editing panels`);
  assert.doesNotMatch(html, /\['panelColor', 'panelTools', 'panelFrames', 'panelFile', 'panelSettings'\]/,
    `${root}: File and Settings do not receive the movable shared ad`);
  assert.doesNotMatch(html, /mobileDrawerAdSlot|mobileDrawerAdMount/,
    `${root}: no fixed drawer-footer overlay is introduced`);
  assert.match(css, /mobile-panel \.panel-ad-mount\[data-panel-ad-mount='left'\] \{[\s\S]*?display: none !important;[\s\S]*?height: 0 !important;/,
    `${root}: inactive and duplicate mobile mounts reserve no space`);
  assert.match(css, /mobile-drawer\[data-mode='full'\][\s\S]*?#panelColor \.panel-ad-mount\[data-panel-ad-mount='left'\],[\s\S]*?#panelFrames \.panel-ad-mount\[data-panel-ad-mount='left'\]/,
    `${root}: supported editing panels share one bottom-flow rule`);
  assert.doesNotMatch(css, /mobile-drawer\[data-mode='full'\][^{]*(?:#panelFile|#panelSettings) \.panel-ad-mount\[data-panel-ad-mount='left'\]/,
    `${root}: File and Settings never show the movable shared ad`);
  assert.doesNotMatch(css, /mobile-drawer\[data-mode='full'\][^\{]*#panelTools \.panel-ad-mount/,
    `${root}: Tools does not create a gap before Color`);
  assert.match(css, /#panelFrames \.panel-section__body \{[\s\S]*?display: block;[\s\S]*?overflow-y: auto;/,
    `${root}: Frames\/Layers owns a normal scrolling content flow`);
  assert.match(css, /#panelFrames \.timeline-card,[\s\S]*?#panelFrames \.panel-ad-mount[\s\S]*?position: static !important;/,
    `${root}: the timeline and its final ad cannot overlap by positioning`);
  assert.doesNotMatch(css, /mobile-drawer\[data-mode='half'\][^{]*#panelFile #openTimelapse\s*\{[^}]*display:\s*none/,
    `${root}: the timelapse action remains reachable in the mobile half drawer`);
  assert.match(css, /mobile-drawer\[data-mode='full'\][^{]*\.mobile-panel\.is-active \.panel-ad-mount--owned\s*\{[\s\S]*?display:\s*block !important;/,
    `${root}: owned panel ads remain in normal flow only in the full drawer`);
  assert.match(css, /mobile-drawer\[data-mode='half'\] #panelFile \.field-group--file-actions\s*\{[\s\S]{0,180}grid-template-columns:\s*repeat\(3/,
    `${root}: five File actions fit into two half-drawer rows`);
  assert.match(css, /mobile-drawer\[data-mode='half'\] \.panel-ad-mount--owned,[\s\S]{0,260}display:\s*none !important;/,
    `${root}: half drawers suppress owned ads completely`);
  assert.match(css, /mobile-drawer\[data-mode='full'\][^\{]*\.panel-ad-mount--owned\.is-ad-unfilled,[\s\S]{0,1000}display:\s*none !important;[\s\S]{0,1000}height:\s*0 !important;/,
    `${root}: full drawers collapse owned ads after an explicit no-fill result`);
  assert.match(css, /mobile-drawer:not\(\[data-mode='full'\]\)[\s\S]{0,500}panel-ad-mount\[data-panel-ad-mount='left'\]/,
    `${root}: compact drawers continue suppressing editing-panel ads`);
}

console.log('PiXiEEDraw mobile drawer ad flow checks passed.');
