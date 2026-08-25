# DRAW-150 Legacy PXD Contract

DRAW-150 accepts only the current Legacy archive-v2 identity: a stored ZIP
with `manifest.json` whose format is `pxd` or `pixieedraw` and version is `2`.
Draw2 PXD v1 (`PXD\0`) is a different identity and is rejected by this
adapter, so a version cannot be silently best-effort decoded.

The adapter hashes and retains the source bytes, performs bounded ZIP/JSON/
palette/raster/decompression validation, and creates a new local Draw2 working
copy. It never rewrites, migrates, uploads, syncs, deletes, or publishes the
source. Unknown fields remain review-visible in the original-only source.

Unsafe paths, duplicate entries, active content, unsupported compression,
invalid hashes/indices, malformed or trailing bytes, future versions, and
resource-limit violations fail closed. The Legacy implementation is kept
separate from the new exporter and is loaded only on demand by the existing
isolated Draw2 import boundary.

Real user PXD files, physical devices, Safari/Firefox, native file pickers,
and production compatibility remain `UNTESTED`.
