# Draw live MCP release verification — 2026-11-17

## Scope

The release is isolated from the shared development tree, based on main `93e6d0998f780113a3dc05f55a9e67ce407684f9`. It adds an explicit GPT connection button and temporary, single-artwork MCP editing. Optional guides and comparison records do not prescribe a workflow. The current normal-map/output implementation is retained.

Supported live operations: read state, set pixels, add palette colors, color correction, layer/frame editing, undo/redo, save locally, and disconnect. It does not expose all Draw features, publishing, cloud sync, or chat embedded in Draw.

## Verified before publication

- `npm test`: 3,706 passed, 0 failed/skipped.
- Public-site build: passed; 1,116 files and 161 event pages. Runtime graph: 121 modules / 235 edges. Optional reference modules are excluded from Draw startup.
- `wrangler deploy --dry-run`: passed with both exported SQLite Durable Object classes and bindings; no production deployment implied.
- Chrome, built release site + local MCP HTTP: 29-operation acceptance workflow passed. This exercised pixels, palette, color correction, layers, frames, undo/redo and local save. Duplicate requests did not apply twice; stale edit revisions were rejected.
- Reopened the saved work, reconnected, and compared all cell pixels, palette, frame and layer metadata: identical normalized fingerprint before and after reload.
- Disconnect invalidated the old credential and the Draw UI displayed the ended connection.
- Chrome viewport 390×844: Draw connection button/dialog and the 24-case reference page fit without horizontal overflow. All 96 comparison images loaded; no page console errors observed.
- Cloudflare account UI showed Workers Free. No paid-plan upgrade was performed.

## Live-service limits

- Pairing code: one use, 2 minutes. Session: 15 minutes.
- Global creation limit: 20 sessions per UTC day. Same-IP admission: 3 per rolling 10 minutes; failed reservations consume quota.
- Raw IP addresses are not passed to admission storage; a server-secret HMAC is used.
- Missing secret or bindings disables live admission while leaving stateless previews available.
- Project changes, reopen and navigation invalidate the client binding. Editing is rejected while local interaction, incompatible previews or playback are in progress.
- Project/operation data is temporarily relayed through Cloudflare. The dialog discloses this before connection. Disconnect revokes access; expiry/alarm removes session data.

## Publication gates still pending

- Initial official Wrangler OAuth authorization on the deployment machine.
- Set `DRAW_ADMISSION_SECRET`, deploy both DO migrations and the Worker, and verify production admission and MCP behavior.
- Refresh/test the real ChatGPT connector; local MCP HTTP verification is not a ChatGPT-client test.
- GitHub PR checks and Pages deployment, then inspect the publicly served Draw build.
- Physical iOS/Android/Safari tests are not complete. Viewport emulation is not a physical-device result.

Do not describe this record alone as proof of production publication. The deployed commit, Worker version, Pages run and production findings must be recorded separately when those steps complete.

## Additional release checks

- Local Wrangler Durable Objects execution passed 11 checks: admission, pairing, one-use code rejection, pending state delivery, bound command polling, revocation and rejection of old credentials, and same-IP quota. Temporary local credentials were removed and the test server was stopped. This is not production verification.
- GitHub's first run stopped in an unchanged pixel-lens wall-clock timing test. The isolated 13-test file passed; rerunning without changing its threshold passed the full 3,706-test suite, build, output checks, and Draw/creation browser checks.
- The next gate exposed an existing home-shelf lifecycle race: initialization before the first pageshow could read the catalog twice. Initial pageshow now leaves the initial request alone; pagehide followed by pageshow still refreshes. A deterministic regression test covers both paths. The browser read-count assertion and its display cap remain unchanged. A fresh complete CI run is required for this follow-up.
