// Dedicated Draw captures never load the independent camera's palette/editor logic.
import { creationModeEntryUrl } from '../creation/mode-entry.mjs?rev=20261016-tool-shell-1';
const params = new URLSearchParams(location.search);
const sharedEntry = creationModeEntryUrl('camera', location.search);
if (sharedEntry) {
  document.querySelector('#pixelStudio')?.setAttribute('inert', '');
  location.replace(sharedEntry);
} else {
if (params.get('to') === 'draw' || params.has('drawRequest')) {
  await import('./draw-camera-page.mjs?rev=20261016-color-capability-1');
} else {
  await import('./app.mjs?rev=20261016-tool-shell-1').then(({ mountPixelLensMode }) => mountPixelLensMode());
}
}
