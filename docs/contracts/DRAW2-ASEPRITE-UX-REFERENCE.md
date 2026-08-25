# Draw2 Aseprite UX reference contract

This contract is an audit checklist for the isolated PiXiEEDraw2 workstream. Aseprite is
the external UX reference; it is not a dependency or source to copy.

| Baseline area | Required Draw2 intent | Evidence field |
| --- | --- | --- |
| Pen | Fast input remains continuous; one completed Stroke is one Undo boundary | input samples, interpolated pixels, touched Tiles, Undo count |
| Temporary tools | Eyedropper/Hand or equivalent is reachable without losing the active tool | keyboard, pointer, touch path |
| Selection | Add/Subtract/Intersect, Move, Transform, and active-Cel scope are explicit | operation, scope, dirty domains, failure tests |
| Timeline | Layer × Frame intersection is a Cel; Layer/Frame/Cel copy and movement are clear | structural command, visual state, keyboard/context path |
| Layer | Visibility and Lock are separate, discoverable states | state transition and permission/error result |
| Onion Skin | Previous/next frame projection is non-destructive | canonical raster hash before/after |
| Pixel semantics | Nearest-neighbor and indexed palette are preserved | raster/palette hash, export fixture |
| Responsive UX | Desktop density and mobile Canvas-centered equivalent both exist | wide/medium/narrow/touch evidence |

## Reporting rules

For every row, audits report `PASS`, `FAIL`, or `UNTESTED`, with the exact Test name,
target file, user operation, and performance measurement where applicable. `UNTESTED`
must not be presented as parity. Additional PiXiEED behavior—Core identity, Asset
Revision, offline Journal, realtime-safe events, Game/Audio bridges, and package
provenance—is assessed separately and must not be reduced to Aseprite parity.
