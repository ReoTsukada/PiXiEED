# Repository Cleanup Report — Bridge cutover addendum (2026-08-30)

> この追補が今回のBridge切替の現行記録です。以下の旧記録は、過去のWP-005監査証跡として削除せず保持しています。

## Current cleanup run

- Baseline commit: `d8cde9d143ca7227b8164f82d99074e44dd1872f`.
- Branch/worktree: `main`; cleanup changes are staged but uncommitted.
- Rollback reference: `cleanup/bridge-cutover-20260830` points to the baseline commit.
- The user explicitly authorized removal of the former tool groups and current correction work, while requiring the linked Bridge work and reusable PiXYNC/PiXiSYNC points to be preserved.
- The external Bridge MVP at `/Users/tsukadareine/Documents/Codex/2026-08-30/referenced-chatgpt-conversation-this-is-an/outputs/pixieed-bridge/` was excluded and not modified.
- Current approved deletion batches contain **1,501 staged direct deletions; with two required source relocations, 1,503 former tracked paths are gone from their old locations**. No commit, push, deploy, database, Storage, Realtime, Stripe, or publication action was performed.

Deleted groups:

- Former applications: `pixiedraw/`, `pixiedraw2/`, `pixfind/`, `pixiee-lens/`, `qr/`, `qr-maker/`, `maoitu/`, and `studio/`.
- Former corporate/portfolio surface: `portfolio/`, its portfolio-only gallery builders, and the old downloadable gallery administration note.
- Former tool project pages: `projects/index.html` and old `projects/` tool subdirectories.
- Retired top-level legacy site script and tests that directly required removed tools, removed Capacitor pages, or obsolete old-tool UI contracts.
- Tracked Capacitor source under `app-shell/pixieed-capacitor/`.
- Retired PiXiSYNC room/slot/payment Supabase functions and migrations.
- Old tool measurement, browser-smoke, release-integrity, PiXiSYNC audit, and PiXiSYNC test scripts.
- Retired PiXiSYNC v1 deployment, purchase, browser-smoke, concurrency, final-design, and lifecycle reports.
- Unreferenced former-tool/home/portfolio screenshots, former-tool icons/hero images, and obsolete old-tool test guards.

Preserved boundaries:

- `docs/bridge-migration/pixisync-reuse-notes.md` records revision authority, idempotent operation IDs, canonical deltas, checkpoint/journal recovery, conflicts, lifecycle, transport/provider/connector separation, and capability negotiation.
- Detailed PiXiSYNC contracts/inventories and the journal-recovery reference test remain as migration evidence.
- `core-shell/`, `16_IMPLEMENTATION_STARTER/`, Market `pixiedraw-project` compatibility and purchased-file handling, public PiXFiND/OGP production paths, `pixiedraw/_backup/`, and legal/terms pages were not removed or rewritten.
- `/contact/` was retained only as a Bridge support endpoint; its corporate commission, portfolio, press, and production-request copy was replaced with Bridge setup/Protocol/Connector support copy.
- The Market color codec was moved to `market/color-codec-utils.js` so purchased GIF/file compatibility remains without restoring the editor tree.
- The generic feature-flag rollback utility was moved into `core-shell/assets/` so the protected Core Shell remains self-contained without restoring the editor tree.
- Physical ignored/generated remnants (`PiXiEEDrawDEV/` and native/build/signing material under `app-shell/pixieed-capacitor/`) remain pending separate exact path approval.

Current verification boundary:

- `git diff --cached --check` and `git diff --check` pass; changed JavaScript syntax checks pass.
- Active HTML route/script scans contain no links to the removed tool, project, portfolio, or studio routes; the old cache-buster labels were also removed.
- Core Shell WP-070/WP-080/WP-090 contract tests and Market listing/GIF compatibility tests pass after the two generic utility relocations.
- The external Bridge MVP path exists with its own harness; it was inspected only for existence and not modified.
- Former-tool builds/tests, Capacitor builds, and Bridge end-to-end acceptance are `UNTESTED` in this repository because the former sources were intentionally removed and Bridge lives in the protected external output.
- PiXiSYNC PASS results retained from the old repository are migration evidence only, not Bridge production qualification.

Remaining separate decisions:

- Whether to remove the PiXiSYNC payment/return wording in `legal/index.html` and `terms/index.html` (exact legal-text approval required).
- Whether to physically remove ignored/generated native remnants after path-level review.

# Historical Repository Cleanup Report

## Baseline

- Repository commit: `76e01b24c7f4f4ae3b75c0727f1e3612a133d970`
- Branch/worktree: `main`; existing dirty worktree preserved. No deletion branch was created because Phase B had zero authorized deletion candidates.
- Scan scope: Git-tracked repository assets plus non-ignored working-tree files; reference scans excluded `.git`, `node_modules`, build/dist/cache output, and `pixiedraw/_backup`.
- Commands used:
  - `python3 scripts/inventory_repository_assets.py --root .`
  - generated repository file/reference inventory and duplicate classification
  - `rg`/static basename reference checks across HTML, CSS, JS, JSON, manifests, workflows, tests, and docs
  - `node --check` for PiXiEEDraw, Market, PiXFiND, and shared scripts
  - `(cd app-shell/pixieed-capacitor && npm run doctor)`
  - 77-script pure baseline suite
  - selected Market SEO and PiXiSYNC compatibility tests
  - localhost route smoke checks and case-sensitive path collision check
  - `git diff --check`
- Evidence limitations: no-reference is not proof of unused; dynamic URLs, database-stored paths, external public links, old clients/projects, and native resource conventions cannot be fully disproven by repository text alone.

## Summary

Candidate unit is an exact duplicate group from `repository-asset-inventory.json`, not an individual asset. The scan found 384 binary asset records and 37 exact duplicate groups. All duplicate groups remain preserved because no canonical replacement path was proven.

| Classification | Count | Bytes |
|---|---:|---:|
| KEEP_ACTIVE | 0 candidate groups | 0 |
| KEEP_COMPATIBILITY | 0 candidate groups | 0 |
| KEEP_GENERATED_SOURCE | 0 candidate groups | 0 |
| REGENERATE_NOT_COMMIT | 0 candidate groups | 0 |
| DUPLICATE_REPLACE | 0 candidate groups | 0 |
| UNUSED_SAFE_DELETE | 0 candidate groups | 0 |
| UNKNOWN | 37 candidate groups | 0 removed |

Static basename reference status for individual assets is recorded in [`repository-cleanup-classification.json`](repository-cleanup-classification.json). It is evidence for retention, not deletion authorization.

## Deleted files

None. No file satisfied all policy conditions for `UNUSED_SAFE_DELETE` or `REGENERATE_NOT_COMMIT`.

## Duplicate consolidation

None. Exact hashes identify byte identity only. The groups include public OGP images, editor/tool icons, dynamically selected character sprites, PiXFiND/sample assets, screenshots, and native splash resources. Removing one path could break a public URL, runtime ID, generated/native convention, or old compatibility path.

The complete 37-group list, SHA-256 values, sizes, and static reference evidence is in [`repository-cleanup-classification.json`](repository-cleanup-classification.json).

## Generated files and ignored output

Observed but not removed:

- `app-shell/pixieed-capacitor/android/app/build/`
- `app-shell/pixieed-capacitor/android/build/`
- `app-shell/pixieed-capacitor/dist/`
- `app-shell/pixieed-capacitor/ios/build/`
- `pixiedraw/_backup/`

These are build/backup areas with ownership or regeneration implications. No clean-checkout regeneration proof was established, so they remain untouched.

## Kept for compatibility and safety

- `PiXiEEDogp.png` and `assets/og/*` remain because OGP/public URL usage is present or cannot be ruled out.
- `character-dots/*`, `maoitu/assets/sprites/*`, `pixfind/assets/puzzles/*`, and `pixiee-lens/stamps/*` remain because runtime IDs, manifests, or public/sample paths can select them dynamically.
- `pixiedraw/assets/icons/*` remains because editor controls, shared navigation, service-worker precache, and runtime module paths use icon names.
- Native `splash.png` and app icon resources remain because Capacitor resource naming and scale conventions are part of the native build boundary.
- `pixiee-lens/index.html.20240605.bak` remains because backups are explicitly outside automatic cleanup authorization.

## Unknown candidates

All 37 exact duplicate groups are `UNKNOWN`. Required evidence before any deletion would be: canonical path approval, static/dynamic/reference graph closure, public URL compatibility check, old-project/client check, native/build generation check where applicable, and post-change build/route/Market/PiXiSYNC verification in a dedicated cleanup branch.

## Verification

- Build: Capacitor staging doctor passed: `OK: 34 entries are available for staging.`
- Type check: no repository-wide TypeScript project is configured; JavaScript syntax checks passed for the affected baseline entry points.
- Lint: no root lint command is configured; no lint failure was invented.
- Unit tests: pure baseline `63/77` passed; the same 14 pre-existing failures from WP-000 remain.
- Integration tests: selected Market SEO and PiXiSYNC codec/document/project/checkpoint/raster tests passed.
- Browser smoke tests: `/`, `/market/`, `/pixiedraw/`, `/pixfind/`, `/pixiee-lens/`, and `/account/` loaded locally with visible main content and no captured console error. Empty preview `<img>` elements on initial forms were hidden/placeholder state, not missing asset files.
- Market baseline: Market syntax, SEO test, and existing 77-script baseline unchanged.
- PiXiSYNC baseline: codec, document operation, project delete/switch, checkpoint reference, raster asset/region asset tests passed.
- Case-sensitive path check: 0 case-fold collisions among tracked paths.
- Production data/deploy: no database, Storage, Stripe, Realtime, deploy, publish, commit, or push action performed.

## Rollback

- Git commit: none created.
- Revert command: no deletion rollback is required because `deleted_count = 0`. If a later approved batch deletes files, restore only its recorded paths with `git restore -- <path>` from the pre-deletion commit/worktree snapshot.

## Remaining candidates

Keep all 37 duplicate groups as `UNKNOWN`; do not delete them in WP-005. Future cleanup requires owner-approved canonical mapping or stronger runtime/public compatibility evidence.

Machine-readable supporting files:

- [`repository-asset-inventory.json`](repository-asset-inventory.json)
- [`repository-file-inventory.json`](repository-file-inventory.json)
- [`repository-cleanup-classification.json`](repository-cleanup-classification.json)
