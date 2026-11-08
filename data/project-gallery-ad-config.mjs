/** Isolated toggle and fixed display unit for the initial saved-work chooser. */
export const projectGalleryAdConfig = Object.freeze({
  enabled: true,
  minimumArtwork: 1,
  unit: Object.freeze({
    client: 'ca-pub-9801602250480253',
    slot: '8825932060',
    verifiedActive: true,
    format: 'display',
    placement: 'inline',
    size: 'fixed',
  }),
});


/** Independent manager toggle. These content/spacing guards are not Google approval. */
export const projectManagerAdConfig = Object.freeze({
  enabled: true,
  minimumArtwork: 1,
  unit: projectGalleryAdConfig.unit,
});
