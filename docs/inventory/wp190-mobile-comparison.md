# WP-190 Mobile Current-vs-Draw2 Comparison Fixture

Current production PiXiEEDraw is read-only. The comparison fixture is deterministic and is
available through the isolated Draw2 Entry with `?fixture=populated`.

| Flow | Current PiXiEEDraw | Draw2 Mobile | Compared metrics |
| --- | --- | --- | --- |
| Create/Open | REFERENCE_READ_ONLY | ISOLATED_FIXTURE | taps, discoverability, canvas area |
| Pen / Draw | REFERENCE_READ_ONLY | ISOLATED_FIXTURE | touch target, interruption, accidental scroll |
| Eraser / Fill | REFERENCE_READ_ONLY | ISOLATED_FIXTURE | tool reachability, panel transitions |
| Palette / Color | REFERENCE_READ_ONLY | ISOLATED_FIXTURE | panel access, canvas area |
| Layer add/select/visibility | REFERENCE_READ_ONLY | Bottom Sheet fixture | panel transitions, reachability |
| Frame add/select | REFERENCE_READ_ONLY | Timeline fixture | panel transitions, discoverability |
| Undo / Redo | REFERENCE_READ_ONLY | Workspace command boundary | taps, focus, state preservation |
| Zoom / Pan | REFERENCE_READ_ONLY | Canvas-first boundary | gesture ownership, page scroll |
| Selection / Transform | REFERENCE_READ_ONLY | Inspector/Sheet fixture | tool options, cancel path |
| Save / Export | REFERENCE_READ_ONLY | Isolated local controls | taps, unavailable production path |

`interactionCount` for both sides is intentionally `UNTESTED` until a reliable physical-device or
full browser pointer harness is available. The comparison fixture does not change current
`pixiedraw/` files, routes, projects, or data.
