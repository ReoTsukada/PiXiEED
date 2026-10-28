# Conversion discovery and measurement

## Scope

Eight authored guides (QOI, TGA, TIFF, ICO, Netpbm, AIFF, AU, BMP), one directory and 37 conversion examples. These are finite format references, not one thin page per keyword. The existing `npm run build -- --output <directory>` pipeline now generates static HTML from the versioned catalog after the normal publisher finishes. Templates and source sitemaps are not rewritten; the resulting public HTML is available without JavaScript. Generation determinism is checked in an isolated temporary directory by unit tests. `output/sitemap.xml` is already listed in robots.txt; the new references are added without modifying unrelated sitemap entries. No ranking or revenue is guaranteed.

Each conversion link passes one allowlisted `to` value to `/output/work/?mode=convert`. The converter selects it only when its real capability list supports it. Manual choice overrides the suggestion. `id`, `file`, duplicate `to`, and text mode are never overridden. No automatic file processing, input upload, forced waiting, or saved preference is introduced.

## Public-page measurement

The existing GA4 consent/host gate is retained. Fixed guide paths are no longer collapsed into `/other/`. A public conversion link sends `conversion_entry` with only `tool`, `guide_slug`, and an allowlisted `target_format`. Existing `select_content` is retained for compatibility; do not sum both events as independent starts. Entry means clicking a navigation link, NOT a completed conversion, successful download, ad view or revenue.

No filename, file bytes, project ID, restoration code, pasted text, filter input, raw query string, or raw error message is sent. Private output-workspace success/error/copy events are not added. Existing analytics opt-out remains effective; unknown dimensions are discarded. Tests exercise the real shared event gate with a stub data layer, not live GA collection.

## Revenue and search validation

Search Console: inspect `/output/formats/`, then a representative guide such as `/output/formats/qoi/`. Confirm canonical selection and eligibility; review impressions, clicks and query relevance per guide. `https://pixieed.jp/output/sitemap.xml` can be submitted in the verified property. This change does not assert account access, submission, indexing, rankings or existing traffic.

GA4: inspect `conversion_entry` and, if needed, register event-scoped custom dimensions `guide_slug` and `target_format`. Compare page views and entry clicks without calling the ratio a conversion-success rate. Account-side report settings and receipt in the live property require separately verified access; code deployment alone is not that verification.

AdSense: use URL-level/channel reporting for the public guide routes when available in the account. Keep ad revenue and impressions distinct from entry clicks. Goal tracking: estimated monthly revenue = monetized page views / 1,000 × observed page RPM. A 3,000 JPY goal is a target, not a guaranteed outcome. Use actual finalized reporting; do not estimate revenue from DOM ad state or clicks.

## Advertising boundaries

Reuse the existing verified display unit. One ordinary ad per substantive public guide, 300×600 rail at wide widths and a separated rectangle on narrower screens. Query URLs, editor/private pages, iframes, invalid configuration and local previews remain ineligible. Ads are never refreshed, clicked by tests, placed in a fake wait panel, or used to gate navigation/downloads. Guide tests verify eligibility, not actual ad fill or advertiser revenue.

## Release checks

Run unit tests, deterministic generation check, production build, and both real-browser harnesses in Check site. The discovery harness tests eight guide-to-download paths, capability mismatch, manual override, original-file preservation through real IndexedDB, text-mode coexistence, static links without JS, and viewport widths. It does not claim all devices, all codec variants, actual ad delivery, live analytics ingestion, or every editor's UI button.

Operational review can compare meaningful traffic and conversion-entry data before expanding formats. No recurring automation is created by this change.
