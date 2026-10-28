# Text input, output and reversible interchange

The common output destination gains additive text panels. Existing image, GIF, audio and detailed workspace code is retained. This change is independent from the unmerged shared-output routing PR #19 and does not claim that all editor save routes are unified.

## Implemented

- Paste/type text or read TXT/MD/JSON/PXTXT as inert text. UTF-8 by default, BOM UTF-16 detection, explicit Shift_JIS/UTF-16 selection, strict decoding errors.
- Render text to PNG/SVG with contextual width, font size, line height, margin, foreground/background, wrapping and mono/sans controls. Preserve the unnormalized original text and validated layout settings in a versioned PXTXT file for editing later. This is not OCR.
- Five static image representations: ASCII, block, Braille-pattern, emoji and custom characters. Animated sources use the first frame, not an animated text export. Preview/copy full text, TXT download and conversion of the art back to a PNG.
- Versioned RESTORE envelope: exact original bytes encoded as Base64, with size and SHA-256 verification. Accept one envelope surrounded by memo text; reject duplicated, truncated, unsupported and corrupt records. PXD files are preserved as bytes and reopened in a supported editor, not interpreted by the text module.
- PIXIEED-PIXELS/1 stores RGBA palettes and base-36 grid cells as readable/editable JSON text. Raw pixel round trips retain hidden RGB and alpha. Canvas PNG rendering is explicitly not a guarantee of byte-exact or hidden-RGB restoration.
- Base64 and Base64 Data URL encode/decode; plain Base64 requires explicit selection to avoid treating ordinary words as files. No automatic navigation or HTML execution of restored bytes.
- A copyable result panel, selected-text fallback when clipboard permission fails, full TXT download, last-successful-result retention, true processing states, cancellation, limits and warnings about original-file disclosure.
- Static search guide at /output/text/, linked from the output UI and the output sitemap. Metadata, canonical URL, breadcrumb structured data and distinct instructions/limitations are included. Search indexing or traffic is not promised.

## Limits and safety

Original-file text encoding: 16 MiB. Code/input text: 24 MiB. Text rendering: 20,000 UTF-16 code units, 4,096px maximum height and 8 million output pixels. Editable pixel grid: 65,536 pixels. Existing image decoder bounds also apply. Clipboard or operating-system text-size limits can be lower; TXT is the fallback.

Restoration is not encryption. The envelope includes the entire original file, potentially including EXIF/location data, private source media or edit metadata. SHA-256 is a corruption check, not proof of authorship or a digital signature. Browser file-name sanitization changes unsafe names but not payload bytes. Sharing only the visible text art does not restore the original image. Explicitly attaching the restoration envelope includes the source.

Conversion uses an abortable module worker; there is no minimum-duration timer, artificial progress, ad refresh or ad-gated result. The existing display ad is allowed on the content-bearing public text guide only. It is not enabled on the private output workspace, pasted-text panel, progress notification or URLs containing private query strings. The existing publisher/slot configuration and 300x600 desktop versus rectangle mobile sizing are reused.

## Validation record

- 35 local Node tests passed, including byte-exact round trips through 1 MiB, whitespace/canonical Base64, corrupt or ambiguous envelopes, invalid versions, bounds, UTF encodings, hidden RGBA, five art representations, text documents and public/private ad eligibility.
- 38 offline Chromium UI-fixture checks passed at 320/390/768/1440px. Actual codec/render/UI code was exercised for text input, PNG/SVG export, copy fallback, round trips, error retention and overflow. The fixture substitutes Worker communication, WebCrypto availability, image loading and the legacy media input. It is not a live-route or real module-worker integration pass.
- Local URL navigation was blocked by the browser environment (ERR_BLOCKED_BY_ADMINISTRATOR). Site-wide CI/build, production route loading, real-worker integration, Safari/mobile devices and actual ad delivery are separate checks and must not be inferred from the offline fixture.

Run local pure tests with `node --test tests/output/text-conversion.test.mjs`. Run normal repository tests/build before release. Preserve private output noindex policy. PR #19 still needs its own save-routing regression fixes and end-to-end checks.
