# Home artwork display

This homepage change is local and unpublished. The implementation now uses the account-consent API, not a hard-coded list of posts.

## Display contract

- The homepage reads `GET /functions/v1/home-artworks`, anonymously with the existing publishable key. It accepts only `{ok:true, artworks:[...]}` with at most 24 candidates.
- The reader applies owner opt-in, separate operator review, current public/deleted state and exact reviewed metadata/hash/path matching. See `home-artwork-consent.md` for database, permissions and release order.
- The browser validates local detail links, title and public author name lengths, a safe post-public storage path, positive byte count at most 262144 and a 64-digit SHA-256 digest.
- Valid candidates are shuffled once on fetch using Fisher-Yates. Desktop displays at most 3, mobile 2, Save-Data 1. Duplicate IDs and identical image hashes do not occupy multiple slots. No slideshow, timer, sound or tracking history.
- Each selected image is fetched once with credentials omitted and no-store. The stream is bounded to the expected byte count, then SHA-256 is checked before Blob decoding. Images whose bytes were replaced at the same URL do not appear.
- Object URLs are revoked on hide, revalidation or disposal. There is no persistent artwork cache or use of original PXD files.
- Back/bfcache, returning to a tab and same-browser consent-change notifications remove old cards and recheck the public reader. A continuously visible third-party page is not a real-time deletion subscription; a later fetch/reload reflects changes.
- Missing consent, withdrawn consent, no reviewed work, missing endpoint, rejected/changed data or image failures keep the original illustration and community link. No fixed artwork fallback can override a withdrawal.

## Owner-authorized QA

The owner confirmed authorship and homepage permission for three existing public works: エコウォッシュカフェ, 不意な美しさ, 京都の思い出 (public display name アルタ). Their public records and static PNG bytes were checked on 2026-11-12. Their combined PNG size is 29356 bytes. These files have been used in isolated screenshots and QA only.

The IDs and reviewed values in `tests/home/home-artwork-approved-fixtures.mjs` are a test fixture, not runtime configuration. This explicit permission for three works does not set the whole account's consent checkbox, authorize other users' works, create historic receipts, seed operator reviews or deploy anything.

## Verification

`node --test tests/home/home-artworks.test.mjs` covers response/schema rejection, empty/withdrawn results, no fallback, duplicate prevention, all six permutations of three items, random choice after filtering, safe storage URLs, byte/hash mismatch and abort/timeout behavior.

`scripts/home-artworks-browser-harness.mjs` runs local synthetic public responses only. `scripts/home-consent-browser-harness.mjs` tests the actual profile settings component with a synthetic settings backend. Neither signs into real accounts nor changes live preferences. Use an explicit `PIXIEED_BROWSER_ROOT` to verify built output.

## Release gate

No production migration, Edge deployment, preference save or publication has been performed. Staging integration with the complete existing migration chain, real auth flow and operator review procedure remain release checks. The initial database state is all preferences OFF and zero operator reviews. See the consent document and `home-artwork-operations.md` before deployment. The admin review UI is now implemented, with authenticated per-work approval/hold and snapshot/image verification. Real admin login remains a release check.
