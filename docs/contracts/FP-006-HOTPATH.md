# FP-006 Hot Path Contract

## Authority

`pixiedraw2/src/fp-006/hot-path.ts` is the framework/host-neutral trace
boundary. The Draw2 Core remains the authority for Project, Raster, Command,
Undo, and PXD semantics. A browser or native adapter may report a pointer
sample and a Canvas projection update, but may not replace the Core state with
workspace state.

## Per-sample rule

For every accepted pointer sample, only the local Canvas projection may update
on the hot path. Timeline, Layer, Palette, Inspector, global Workspace state,
full Workspace rendering, serialization, and network synchronization are
deferred to stroke commit or an explicit structural command.

`HotPathTraceRecorder.finish()` reports every forbidden boundary and
`assertHotPathIsolated()` fails closed when one is observed. The trace is
diagnostic evidence, not a claim that a browser compositor or physical device
has been measured.

## Measurement classes

- `REFERENCE_SYNTHETIC`: deterministic in-memory workload used by FP-006.
- `BROWSER_REFERENCE`: requires a browser interaction trace and measured DOM.
- `DEVICE_UNTESTED`: physical mobile, stylus, Safari/Firefox, and long-session
  observations not available in this isolated package.

The 512x512 / 20-layer / 120-frame Desktop and 256x256 / 12-layer / 60-frame
Mobile workloads remain qualification fixtures. They do not become a formal
24ms/32ms PASS without full input-to-visible compositor measurement.

