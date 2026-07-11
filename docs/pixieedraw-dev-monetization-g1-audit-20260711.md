# PiXiEEDrawDEV Monetization Gate Audit (Phase G1)

## Scope

- Audited tree: `PiXiEEDrawDEV/` only.
- No project payload, autosave, recent project, external save, or IndexedDB
  migration was changed.
- One sheet may contain one to four canvases. This is a technical validation
  limit, not a plan entitlement.

## Editor Gates

| Area | Runtime result | Classification |
| --- | --- | --- |
| Sheet count | No plan-based sheet limit found | No active gate |
| Sheet add / import | Candidate and transaction validation only | Technical safety |
| Multi-canvas | `hasPixieedrawMultiCanvasSupport()` returns `true` | Legacy no-op gate |
| Canvas count | Three local canvases plus the main canvas, total four | Technical safety |
| Fifth canvas | `ERR_CANVAS_LIMIT_EXCEEDED` | Technical safety |
| V1/V2 save, export, history, timelapse, recovery | No entitlement condition found | Available to all users |

`LOCAL_VIEWPORT_CANVAS_SIGNED_IN_MAX_COUNT = 1` remains in
`state-normalizers.js`, but there is no runtime reference that selects it for
the editor. `getLocalViewportCanvasAccountLimit()` always returns the standard
three-local-canvas value, yielding the technical maximum of four total
canvases.

## Remaining Monetization Code

| Area | Files | Classification | Phase G action |
| --- | --- | --- | --- |
| Ad-free entitlement | `../scripts/pixieed-adfree.js`, `pixieed-support-benefit-utils.js` | Active ad-display branch, not editor gate | G3/G4 |
| Ad-free UI | `index.html`, `ui-localization-utils.js`, `style.css` | UI-only legacy purchase/support surfaces | G3 |
| Ad rendering suppression | `index.html`, `startup-workflow-utils.js`, `export-dialog-workflow-utils.js`, `recent-project-workflow-utils.js` | Advertising behavior | Separate ad decision |
| Shared-project limits | `pixieed-support-benefit-utils.js`, `shared-*-utils.js`, `pixieed-account-workflow-utils.js` | Legacy shared feature quota; shared sync is disabled | G4 or shared-feature removal |
| Stripe tooling | `scripts/stripe-create-products.mjs` outside PiXiEEDrawDEV runtime | Marketplace/checkout infrastructure | Keep separate |

The ad-free branch may hide ads for an entitlement. It does not disable
editing, saving, sheet operations, or recovery. Advertising itself is not
removed by this audit.

## Storage and Compatibility

- No PiXiEEDrawDEV editor code reads or writes a premium, plan, tier,
  subscription, entitlement, or ad-free LocalStorage/IndexedDB key directly.
- The external `pixieed-adfree.js` owns any legacy entitlement state. It must
  be removed or ignored selectively in G4; no database-wide clear is allowed.
- V1/V2 project parsers and Autosave V2 schema do not require plan, tier,
  premium, subscription, entitlement, `maxSheets`, or `maxCanvases` fields.
  Unknown legacy metadata therefore remains ignorable.

## Required Future Work

### Phase G2

No code change is required for editor availability today: the remaining
multi-canvas helper is already unconditional and the canvas-four validator
must remain. Add regression coverage so a future entitlement change cannot
reintroduce an editor gate.

### Phase G3

Remove ad-free purchase/support UI and all editor-local ad-free status labels.
Keep advertisement rendering unchanged until its product decision is explicit.

### Phase G4

Remove the editor's ad-free entitlement subscriptions and related obsolete
shared-project quota wiring. Do not remove checkout infrastructure used by
marketplace or product sales without a separate audit.

## Separate Technical Phase

Removing the four-canvas limit requires changes to the validator, save and
restore codecs, Autosave V2 schema validation, layout placement, memory
diagnostics, and large-project performance tests. It is intentionally out of
scope for G1-G4.
