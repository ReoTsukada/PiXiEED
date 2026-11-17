# Draw MCP fast operations — release record

## Integrated scope

Fast operations are integrated on top of published OAuth commit `2356f9ec` (reviewed source `3e82a8e0`); the fast-operation work is `f6c48863`. The combined release uses Worker `0.6.0`, plugin package `1.1.0`, and 43 Store tools: 37 live Draw tools (including 33 allowlisted operations) plus six optional reference tools.

The live tools add up to 32 related edits in one `batch_draw_edits` history step, operations such as `paint_draw_stroke` and `draw_shape`, metadata and bounded region reads, compact edit/save summaries, and request-status checks. The fast path checks `capabilities.fastEdits`; an older tab is not reloaded automatically. Pending or unknown operations are checked by the original request ID to prevent duplicate edits. Localized color edits target pixels; palette replacement affects every pixel using that palette entry.

OAuth still gates access to one selected project with the granted `draw:read` and `draw:write` scopes. The one-use code belongs only on the authorization page, the connection lasts at most 15 minutes, and save remains local to the connected browser. The release adds no paid service or dependency. It does not publish or cloud-sync artwork. The six optional reference tools remain separate from project access, and no fixed art style or drawing order is prescribed.

## Integrated verification

- Full combined suite: 3,754 passed, 0 failed.
- Core tests: 46 passed.
- Store tool tests: 13 passed.
- Actual Workerd OAuth scenarios: 15 passed.
- Build: 1,121 files, 161 events, 123 modules, 245 edges, 53 internalized and 70 external modules.
- Real Chrome editor: combined batch plus browser-local save measured 28.9 ms. The fixture also checked edits, save, undo/redo, rejected batch safety, stale revision refusal, and duplicate-request behavior.
- Local HTTP MCP trial: four separate commands took 2,043 ms; one batch with save took 511 ms. Replaying the same request ID did not duplicate the edit.

These timings do not include GPT thinking time or production network latency. The local HTTP interval includes local transport, relay/browser polling, and Draw application time; it is not a measurement of relay processing alone. The 28.9 ms Chrome result measures local editor execution, not GPT or production communication.

## Pending release checks

- Public publication and an actual ChatGPT connection through the public OAuth flow are pending.
- Production-network timing and physical mobile/Safari verification are pending.

Add the final full-suite result, release identifiers, deployment status, and public ChatGPT evidence when verified. This record does not itself prove publication or production behavior.
