# Conversion formats and direct-task UI

## Decision

Compared three models: (1) a large format directory, (2) a guided wizard, (3) file-first conditional controls. Adopt (3): file → compatible format → convert/save. A wizard adds unnecessary decisions; a directory exposes irrelevant options. These are design judgments, not measured user-study results.

The public guide retains its ordinary advertisement and canonical URL. Detailed documentation is disclosed on demand. `/output/work/?mode=convert` uses the local simple converter; any `id` and the original no-query workspace retain the existing workflow. Existing video composition, batch outputs, project storage, handoff semantics and ad settings are unchanged.

## Supported extension

Raster input/output: BMP, TIFF, TGA, QOI, ICO, PBM/PGM/PPM/PAM. Static SVG input is rendered only after rejecting scripts, active/embedded content and external resources. Existing PNG/JPEG/WebP/GIF/APNG/SVG outputs are reused; SVG output represents pixels, not traced vectors.

Limits: 4096px edges, 8 million pixels including frames, 64MB file; SVG 2MB/5000 nodes; ICO output one size <=256px. TIFF: first page, unsigned 8bit chunky RGB/gray, uncompressed/PackBits/LZW. No CMYK, tiled, 16bit, Deflate/JPEG TIFF. BMP: uncompressed 24/32bit; reserved BMP channel is not interpreted as alpha. TGA: raw/RLE RGB24/32 or gray8. PNM16 input is normalized to 8bit RGBA. Images do not preserve layers, EXIF or ICC profiles.

Audio: AIFF/AIFC PCM input; AU PCM, float, mu-law/A-law input; WAV/AIFF/AU output at signed 16/24/32bit PCM. Native compressed outputs only when MediaRecorder supports them. PCM codecs use Float64 internally to preserve 32bit integer PCM values; browser-decoded or compressed audio remains subject to Web Audio precision/resampling. Limits: 120 seconds, 1–2 channels, 8–48kHz; 64MB file (some browser-dependent input paths retain the existing 4MB preflight bound). No MP3/FLAC encoding or HEIC/PSD/RAW input is claimed.

## Safety

Each rare-format operation runs in a bounded worker. Abort terminates it; errors preserve previous good input. Output changes invalidate stale download links. File data/names are not transmitted, put in URLs, analytics or persistent storage. No new dependencies, vendor binaries, third-party codec calls or executable media are introduced. Public advertising is separated from the local workspace.

## Verification

39 Node tests cover format roundtrips, signatures, truncation/dimension bounds, binary PNM whitespace, PAM CRLF, 16/24/32bit PCM, capabilities, filenames, private handoffs and guide separation. Run `node --test tests/output/conversion-formats.test.mjs`.

Local Chromium isolated UI fixture: 14 image save paths and 3 PCM audio saves; 32 additional cases cover 15 independent-format inputs, malicious/valid SVG, literal filenames, ratio lock, stale-result invalidation, 320/390/768/1280/1920px layouts and optional legacy help. Module imports are supplied from local source; the common entry notification is stubbed and external requests blocked. This does not establish full-site runtime behavior, Safari/Firefox/mobile-device behavior or live ad delivery.

Independent interoperability checks used Pillow-generated BMP, TIFF (raw/PackBits/LZW), TGA (raw/RLE), QOI, ICO and PNM files; output BMP/TIFF/TGA/QOI/ICO/PNM opened in Pillow. AIFF/AU/WAV outputs were opened with libsndfile, including exact 32bit integer samples. These checks use synthetic fixtures, not user files.

Full repository tests/build are evaluated by the PR workflow. Production verification and any remaining limitations must be reported separately. Rollback: revert this change; original stored projects and conversion engine are not migrated.
