# Conversion format guides

## Scope

Maintain the simple converter and existing advertisement placement. Add two public, static manuals, not a page for every input/output permutation:

- `/output/image-formats/`: TGA, QOI, TIFF/TIF, BMP, ICO, Netpbm/PNM (PBM/PGM/PPM/PAM), static SVG.
- `/output/audio-formats/`: AIFF/AIF/AIFC, AU/SND, WAV, 16/24/32-bit integer PCM.

Each guide distinguishes decoding from encoding, provides real conversion examples, describes limits and unsupported variants, and links to the unchanged converter. A CTA opens the converter; it does not preselect a format. Output formats must be selected after loading. FLAC output from the separate pending change is not advertised by these guides.

## Search and UI

The existing `/output/` canonical, ad slot, private handoff guard, main action and disclosure UI remain. Two descriptive links lead to the manuals. The new manuals have self-referencing canonical URLs, unique titles/descriptions, readable HTML headings/content, anchor navigation and matching WebPage/BreadcrumbList JSON-LD. Do not add ratings, FAQ rich-result promises, keyword-stuffed pages, cloaking, bought links or auto-refreshed advertisements.

A small `sitemap-conversions.xml` is declared alongside the existing sitemap in `robots.txt`, leaving the event-generated sitemap unchanged. No workspace URLs, user inputs or query strings enter the sitemap. The workspace's existing noindex is unchanged. No fabricated lastmod dates or indexing ping requests are added.

## Maintenance

When codecs change, update input/output conditions and run `node --test tests/output/conversion-search.test.mjs`. The tests cover metadata, canonical/breadcrumb consistency, links, preserved ad/handoff structure, sitemap discovery, and the actual documented raster/PCM encoders.

Full-site CI, production deployment, Google indexing and search performance are separate checks. Search Console should be used to measure impressions/clicks on these exact pages and format-related queries. No ranking or traffic increase is established by code tests. Do not request repeated crawling or generate search/impression traffic for validation.

References consulted: Google Search Central title links, crawlable links, sitemap documentation and spam policies. Recheck actual capabilities rather than adding unsupported output claims for search traffic.
