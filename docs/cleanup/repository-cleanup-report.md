# Repository Cleanup Report

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
