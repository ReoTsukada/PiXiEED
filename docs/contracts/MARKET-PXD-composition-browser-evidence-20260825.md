# Market/PXD composition browser evidence — 2026-08-25

## Local browser result

The seller page was opened locally with the authentication boundary replaced
by a test-only in-memory access stub. No real account, checkout, Storage, or
payment call was made. The same stub captured the seller submission boundary
so the selected composition could be compared with the outgoing provenance
manifest and format list.

Test inputs:

- `hero.png`
- `theme.mp3`
- `project.pxd`

All five package compositions became selectable and changed the format
switches as follows:

| Composition | Selected format count |
|---|---:|
| `image-only` | 1 |
| `audio-only` | 1 |
| `image-audio` | 2 |
| `pixiedraw-project` | 1 |
| `all-files` | 3 |

For each row, the browser test also verified that the outgoing
`market_create_root_asset_v8` payload contained the same
`input_provenance_manifest.product_composition` and the expected number of
`input_asset_formats`. The test result was:

```text
market composition browser: 5 package compositions and submission payloads passed
```

The audio status also reported that audio is delivered in the purchase ZIP
and can be used as an iAUDIO asset.

The iGAME/iDRAW2 shared Export panel was also checked separately. It creates
the current v2 PXD with Draw/Audio/Game workspace data, stores it in the
existing short-lived IndexedDB transfer, and opens `market/sell.html` with the
transfer token. Market consumes the token, removes it after reading, and
shows one received PXD file. No automatic listing creation or remote write is
performed by this handoff.

Browser result:

```text
PiXiEEDraw2 iGAME PXD-to-Market handoff browser: passed
```

## Fix applied during this audit

`detectMediaKind()` previously classified every detected format as an image
before checking audio extensions. As a result, valid audio files could not
enable `audio-only` or `image-audio`. Audio detection now runs before the
generic image fallback, with regression coverage for MP3, WAV, and PNG.

## Boundary

This proves the local seller composition UI and format-selection contract. It
does not prove remote Supabase migrations, the deployed verification Edge
Function, Stripe checkout, Storage delivery, RLS, or a real purchase.
