# PiXiEED Codex Instructions

## Working Defaults

- Respond to the user in Japanese unless they ask for another language.
- Start by locating relevant files with `rg` or `rg --files`.
- Use `apply_patch` for hand edits.
- Never revert user changes or unrelated working-tree changes unless the user explicitly asks.
- Keep changes scoped to the requested product area and avoid broad refactors during release or store-submission work.
- Before changing behavior, read the nearest relevant notes in `docs/codex-workflow-notes.md`.

## Project Map

- `pixiedraw/` is the production PiXiEEDraw app. It uses the single-file `pixiedraw/assets/js/app.js` flow.
- `PiXiEEDDraw.dev/` is the ignored local split-work area for PiXiEEDraw. Do not treat it as production output.
- `pixiedraw/_backup/` is an ignored safety backup. Do not commit it.
- `app-shell/pixieed-capacitor/` is the Capacitor shell for Google Play and App Store builds.
- `supabase/` contains migrations, functions, and local Supabase configuration.
- `docs/project-file-map.md` has the broader file map when the target area is unclear.

## Local Server

- Use `node scripts/static-server.mjs` from the repo root for local viewing.
- The usual URL is `http://localhost:8000/`.
- PiXiEEDraw is usually checked at `http://localhost:8000/pixiedraw/`.
- PiXiEEDDraw split work is usually checked at `http://localhost:8000/PiXiEEDDraw.dev/`.
- If sandboxed localhost checks fail, do not assume the server is down. See `docs/codex-workflow-notes.md`.

## Verification

- For JavaScript edits, run the most specific `node --check` command available for the edited file.
- Before finishing code edits, run `git diff --check`.
- For PiXiEEDraw production changes, normally run:
  - `node --check pixiedraw/assets/js/app.js`
  - `git diff --check -- pixiedraw/index.html pixiedraw/assets/css/style.css pixiedraw/assets/js/app.js`
- For PiXiEEDDraw.dev split-work changes, normally run:
  - `node --check PiXiEEDDraw.dev/assets/js/app.js`
  - `node scripts/check-pixiedraw-dev-tdz.mjs`
- For Capacitor work, use `app-shell/pixieed-capacitor` as the working directory and prefer the scripts in its `package.json`.

## App Shell Notes

- Stage web assets with `npm run build:web` from `app-shell/pixieed-capacitor`.
- Use `npm run cap:sync` after web changes that need to be reflected in native projects.
- Android release output is under `app-shell/pixieed-capacitor/android/app/build/outputs/`.
- iOS archive/export output is under `app-shell/pixieed-capacitor/ios/build/`.
- Do not commit local signing files, keystores, Apple account data, or generated secrets.

## Git Hooks

- The repo uses `.githooks/pre-commit` to regenerate `data/project-updates.json`.
- If hook setup is needed, use `git config core.hooksPath .githooks`.
