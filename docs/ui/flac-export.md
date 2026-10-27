# FLAC export

This incremental change retains the existing simple UI, SVG/TIFF/PCM improvements, private project handoffs, and advertisement settings. It integrates the FLAC output from the conversion update without replacing the newer converter.

FLAC output is always 16-bit, mono/stereo, 8000–48000 Hz, at most 120 seconds. It uses verbatim subframes, so file-size reduction is not promised. Samples are clamped and rounded to signed 16-bit PCM; precision above 16-bit and metadata are not retained. No silence is inserted and sample count and rate are retained. Encoding runs in the existing abortable worker. Invalid/non-finite input is rejected. Input FLAC decoding still depends on the browser. Other codecs and routes are unchanged.

The codec framing follows RFC 9639 sections 8.2 and 9: fixed-size blocks up to 4096 samples, an explicitly sized last frame, header CRC-8, frame CRC-16, and unknown MD5 represented by zero.

Verification must distinguish unit tests, independent decoder checks, browser worker/UI checks, full-site CI and production deployment. No new third-party dependencies or remote conversion services are introduced.
