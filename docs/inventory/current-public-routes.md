# Current public routes — Bridge cutover update (2026-08-30)

今回のPiXiEED Bridge切替で、旧制作ツール、旧プロジェクト一覧、Portfolio、企業向けギャラリー導線は公開対象から除外しました。現在の公開入口はホーム、Bridgeサポート、コミュニティ、Market、アカウント、情報・規約ページです。以下の旧WP-000表は監査証跡として保持しています。

## Current Bridge-era routes

| Area | Routes |
| --- | --- |
| Bridge/site | `/`, `/help/`, `/contact/`, `/community/`, `/notes/`, `/glossary/`, `/events/`, `/notice/` |
| Account | `/account/`, `/account/admin.html`, `/account-deletion/` |
| Market | `/market/`, `/market/about.html`, `/market/help.html`, `/market/item.html`, `/market/review.html`, `/market/sell.html`, `/market/seller.html`, four `/market/items/<uuid>/` pages |
| Policy | `/privacy/`, `/terms/`, `/legal/` |
| Public verification files | `/google10107469bdcc60fa.html`, `/google92ae386aca6917c9.html`, `/googlee776c49d223e1a38.html` |

旧ツールURL（`/pixiedraw/`、`/pixiedraw2/`、`/pixfind/`、`/pixiee-lens/`、`/qr/`、`/qr-maker/`、`/maoitu/`、`/studio/`）、旧Projects/Portfolio URLは、今回の変更でアクティブな公開ルートではありません。

# Historical WP-000 inventory

調査日: 2026-08-06

Source HTML inventory contains 50 HTML files after excluding Capacitor generated output, `node_modules`, `pixiedraw/_backup`, and `PiXiEEDDrawDEV`. Of these, 47 are product/content pages and 3 are Google verification files. The exhaustive route-to-source mapping and page titles are in [`route-inventory.json`](route-inventory.json); the sitemap contains 31 `<loc>` entries.

## Product and site routes

| Area | Routes |
| --- | --- |
| Site/support | `/`, `/notes/`, `/contact/`, `/help/`, `/privacy/`, `/terms/`, `/legal/`, `/glossary/`, `/events/`, `/notice/` |
| Account | `/account/`, `/account/admin.html`, `/account-deletion/` |
| Market | `/market/`, `/market/about.html`, `/market/help.html`, `/market/item.html`, `/market/review.html`, `/market/sell.html`, `/market/seller.html`, four `/market/items/<uuid>/` pages |
| PiXiEEDraw | `/pixiedraw/` |
| PiXFiND | `/pixfind/`, `/pixfind/marker-editor.html`, puzzle pages under `/pixfind/<uuid>/` |
| PiXiEELENS | `/pixiee-lens/` |
| Projects/portfolio | `/projects/`, `/projects/maoitu/`, `/projects/pixfind/`, `/projects/pixiedraw/`, `/projects/pixiee-lens/`, `/projects/qr-maker/`, `/portfolio/` |
| Other tools/games | `/qr/`, `/qr/1/`, `/qr-maker/`, `/maoitu/`, `/maoitu/game.html` |
| Public verification files | `/google10107469bdcc60fa.html`, `/google92ae386aca6917c9.html`, `/googlee776c49d223e1a38.html` |

## Public boundary notes

- `CNAME`, `robots.txt`, `sitemap.xml`, manifests, and `ads.txt` are public metadata files, not application routes.
- Market UUID pages and puzzle pages are source files currently present in the repository; route reachability is a file inventory result, not a claim that every page is listed in the sitemap.
- `app-shell/pixieed-capacitor` output is a native staging boundary and is intentionally excluded from this public web route list.
- The repository also contains development-only or ignored areas. The exact observed split-work directory is `PiXiEEDrawDEV`; the older `docs/project-file-map.md`/AGENTS wording uses a different spelling. This is recorded as a mismatch and not renamed by WP-000.
