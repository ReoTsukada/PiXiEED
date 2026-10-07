// Dedicated Draw captures never load the independent camera's palette/editor logic.
const params = new URLSearchParams(location.search);
if (params.get('to') === 'draw' || params.has('drawRequest')) {
  await import('./draw-camera-page.mjs?rev=20261007-draw-handoff-1');
} else {
  await import('./app.mjs?rev=20261006-camera-upload-1');
}
