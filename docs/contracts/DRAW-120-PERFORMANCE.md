# DRAW-120 Performance Contract

Transform preview is a bounded local projection. It must not regenerate the
full canonical raster on each pointer sample and must not rebuild the whole
Workspace. Only commit may enter the Core write-set path.

The synthetic reference workload records selection size, transform write count,
commit count, Undo depth, raster hash, and elapsed time. It is not a browser,
device, compositor, or production performance claim.

Required future qualification evidence remains explicit:

- browser screenshot and DOM geometry;
- 1280x900, 390x844, tablet split view;
- physical touch/stylus and safe-area behavior;
- Safari and Firefox;
- full input-to-visible compositor;
- long-session memory and long-task trace.
