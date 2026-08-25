# DRAW-110 Performance and Evidence Contract

## Workload records

The required reference records are Desktop `512x512 / 20 layers / 120 frames`
and Mobile `256x256 / 12 layers / 60 frames`. DRAW-110 records the workload
shape, dirty tile count, interpolation count, canonical hash, and isolated
command timing. This is `REFERENCE_SYNTHETIC` evidence until a browser
input-to-visible trace observes the real compositor.

## Hot-path boundary

Per pointer sample, only a local stroke projection may update. Canonical
mutation occurs once at stroke commit. A renderer may consume dirty Regions or
Tiles; it must not regenerate the full raster for each sample. Full raster
hashing is a golden-fixture operation and is not a pointer hot-path operation.

## Qualification rule

The synthetic benchmark cannot promote the official 24ms Desktop or 32ms
Mobile p95 budget to PASS. Physical Mobile, Stylus, Safari, Firefox, full
compositor, and long-session memory remain `UNTESTED` until directly observed.

