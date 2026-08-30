# PiXiEED Codex Instructions

## Working Defaults

- Respond to the user in Japanese unless they ask for another language.
- Start by locating relevant files with `rg` or `rg --files`.
- Use `apply_patch` for hand edits.
- Never revert user changes or unrelated working-tree changes unless the user explicitly asks.
- Keep changes scoped to the requested product area and avoid broad refactors during release or store-submission work.
- Before changing behavior, read the nearest relevant notes in `docs/codex-workflow-notes.md`.

## Project Map

- The former web tool roots (`pixiedraw/`, `pixiedraw2/`, `pixfind/`, `pixiee-lens/`, `qr/`, `qr-maker/`, `maoitu/`, and `studio/`) were removed during the Bridge cutover.
- The former corporate/portfolio surface (`portfolio/`) and its portfolio-only gallery builders/admin guide were removed; `/contact/` remains only as a PiXiEED Bridge support page.
- The retired top-level `scripts.js` and tests that directly required removed tools or Capacitor pages were removed with the cutover.
- The external PiXiEED Bridge MVP is intentionally outside this repository at `Documents/Codex/2026-08-30/referenced-chatgpt-conversation-this-is-an/outputs/pixieed-bridge/`; preserve it and treat its own `AGENTS.md` as authoritative for Bridge implementation.
- `docs/bridge-migration/pixisync-reuse-notes.md` is the handoff note for PiXYNC/PiXiSYNC concepts that may be reused by the Bridge protocol.
- `pixiedraw/_backup/` and ignored `PiXiEEDrawDEV/` content are protected safety remnants; do not remove or commit them without a separate, exact approval.
- Tracked Capacitor source under `app-shell/pixieed-capacitor/` was removed as part of the cutover. Any remaining ignored native/build/signing files are not Bridge source and require separate cleanup approval.
- `supabase/` contains migrations, functions, and local Supabase configuration.
- `docs/project-file-map.md` is a historical map; verify each path before using it.

## Local Server

- Use `node scripts/static-server.mjs` from the repo root for local viewing.
- The usual URL is `http://localhost:8000/`.
- Remaining public pages include the site shell, community, Market, account, help, notes, and other content pages; removed tool URLs must not be reintroduced as active routes.
- If sandboxed localhost checks fail, do not assume the server is down. See `docs/codex-workflow-notes.md`.

## Verification

- For JavaScript edits, run the most specific `node --check` command available for the edited file.
- Before finishing code edits, run `git diff --check`.
- For Bridge implementation, use the external Bridge output directory and follow its own `AGENTS.md`, protocol checks, and MVP test instructions.
- For this repository's cutover work, syntax-check only the remaining changed scripts, run `git diff --check`, and distinguish static route/reference checks from a full Bridge runtime acceptance test.

## App Shell Notes

- The former Capacitor build shell is outside the active Bridge repository scope. Do not recreate or stage it from ignored output during cleanup.
- Do not commit local signing files, keystores, Apple account data, or generated secrets.

## Git Hooks

- The repo uses `.githooks/pre-commit` to regenerate `data/project-updates.json`.
- If hook setup is needed, use `git config core.hooksPath .githooks`.

## Repository cleanup

- Repository cleanup applies only to files in the PiXiEED Git repository.
- Read `11_CLEANUP/REPOSITORY_CLEANUP_POLICY.md`.
- Audit and classify before deletion.
- Never infer safe deletion from a single text search.
- Do not delete `UNKNOWN` candidates.
- Use a dedicated branch/worktree and small deletion batches.
- Preserve the external Bridge output and the PiXYNC/PiXiSYNC reuse note while deleting old tool implementation.
- For this cutover, record build/test checks that are no longer runnable because their source was intentionally removed as `UNTESTED`; run remaining static/syntax checks and Market compatibility checks where applicable.
- Production Storage, database rows, purchased files, and PiXiSYNC data are outside this cleanup scope.
