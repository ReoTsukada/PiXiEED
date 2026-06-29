# PiXiEED file map

This document summarizes the current repository layout and separates production-facing files from development-only work areas.

## Current PiXiEEDDraw split policy

| Path | Role | Notes |
| --- | --- | --- |
| `pixiedraw/` | Production PiXiEEDDraw | Uses the true pre-split single `assets/js/app.js`. `index.html` does not load `assets/js/modules/...`. |
| `PiXiEEDDraw.dev/` | PiXiEEDDraw file-split work area | Development-only copy that keeps the in-progress split modules and split `app.js`. Ignored by Git. |
| `pixiedraw/_backup/` | Safety backup | Local backup of the split work snapshot. Ignored by Git. |

## Main site areas

| Path | Role |
| --- | --- |
| `index.html` | Top-level PiXiEED landing page. |
| `styles.css` | Top-level shared site styles. |
| `scripts.js` | Top-level shared site script. |
| `assets/` | Shared images and site assets. |
| `data/` | Shared JSON/data files. |
| `scripts/` | Shared helper scripts used across pages. |
| `docs/` | Repository notes and structure documentation. |
| `site/` | Site-specific support files. |

## Products and feature pages

| Path | Role |
| --- | --- |
| `pixiedraw/` | PiXiEEDraw drawing app. |
| `pixiee-lens/` | PiXiEELENS related pages/assets. |
| `qr-maker/` | QR maker feature area. |
| `contest/` | Contest pages and related assets. |
| `projects/` | Project showcase and product routing pages. |
| `portfolio/` | Portfolio pages/assets. |
| `character-dots/` | Character dot assets/pages. |
| `maoitu/` | Maoitu feature/project area. |

## Account, legal, and support pages

| Path | Role |
| --- | --- |
| `account/` | Account page/flow. |
| `account-deletion/` | Account deletion page. |
| `contact/` | Contact page. |
| `privacy/` | Privacy policy page. |
| `terms/` | Terms page. |
| `notice/` | Notice/news page. |
| `events/` | Events page/area. |
| `downloads/` | Download-related files/pages. |
| `glossary/` | Glossary content. |

## App and backend support

| Path | Role |
| --- | --- |
| `app-shell/` | Capacitor/native app shell. |
| `supabase/` | Supabase migrations, functions, and local Supabase files. |
| `.githooks/` | Repository Git hooks. |
| `.vscode/` | Workspace/editor settings. |

## Root metadata and public files

| Path | Role |
| --- | --- |
| `CNAME` | GitHub Pages custom domain. |
| `manifest.webmanifest` | Web app manifest. |
| `robots.txt` | Search crawler rules. |
| `sitemap.xml` | Sitemap. |
| `ads.txt` | Ad network authorization file. |
| `google*.html` | Google site verification files. |
| `PiXiEED.code-workspace` | VS Code workspace file. |

## Commit guidance

- Commit production PiXiEEDDraw rollback changes from `pixiedraw/assets/js/app.js` and `pixiedraw/index.html` when ready.
- Do not commit `PiXiEEDDraw.dev/`; it is a local development workspace for continuing the split.
- Do not commit `pixiedraw/_backup/`; it is a local safety backup.
