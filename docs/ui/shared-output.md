# Shared output destination

Media exports from draw, camera, audio and the creation-suite download controls now stage local data before opening `/output/work/`. Internal project saving and public posting are not file exports and remain unchanged.

- Existing IndexedDB output records, IDs, original Blobs, editable frame sources and restore tokens are retained by the unchanged storage core.
- The public handoff wrapper validates the host, flushes a direct editor's workspace, rejects stale or read-only sources and removes the former native-save exemption for embedded/direct tools.
- Simple image/audio handoffs open the existing conversion UI with the source already loaded. The initial save delivers the existing Blob byte-for-byte. Explicit conversions may remove editable metadata; the original remains available separately.
- Songs, mixed sources, videos, multiple outputs and oversized preview-only inputs retain the detailed output workspace at the same destination. This avoids silently dropping tracks or settings while the simple UI has no equivalent controls.
- Editor `saveFile` calls, camera fallback save dialogs, and unhandled same-origin Blob download anchors (including project backups) route to output instead of initiating a device download. Shared header installation covers puzzle editors too. External links, publishing and downloads within the output workspace are not intercepted.
- Generic files are held locally with an opaque ID and seven-day expiry. They can be saved without re-encoding. Source names and bytes are not sent to analytics or URLs.
- Unsupported, missing, expired and duplicate IDs fail closed. Staging failures retain the editor; there is no forced native-download fallback.

## Verification

33 new Node tests exercise route scope, return URLs, byte-preserving storage, expiry, failure paths, direct-host navigation, pending project saves, permission/stale-source guards, coalescing, original-file recovery and complex-source preservation. The local fixture uses an in-memory IndexedDB substitute; it is not a real browser integration test. Site-wide CI, build and browser/real-device checks are separate release gates. No revenue, ad delivery or all-device compatibility claim is made by this change.
