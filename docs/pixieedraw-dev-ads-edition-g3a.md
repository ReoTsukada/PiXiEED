# PiXiEEDrawDEV Ads Edition Boundary (Phase G3-A)

## Advertising Rule

`assets/js/modules/edition-capabilities-utils.js` is the sole source of the
advertising capability:

| Edition | `ads` | Result |
| --- | --- | --- |
| `dev` | `true` | Show ads |
| `web-free` | `true` | Show ads |
| `product` | `false` | Do not initialize ads |

The edition is a build input through `window.__PIXIEEDRAW_BUILD_EDITION__`.
It does not read account, purchase, entitlement, LocalStorage, IndexedDB, or
remote API state. Embed mode remains a non-commercial display-context
exception and does not show ads.

## Detached Entitlement

`window.pixieedAdFree.state.isActive` no longer controls advertising in DEV.
It remains readable for compatibility until G3-B/G4, but cannot hide ads or
change any editor capability.

## Support and Purchase UI Classification

| UI / code | Classification | Action |
| --- | --- | --- |
| `pixieedAdFreeField`, claim/purchase links | Advertising-off purchase UI | G3-B removal |
| `supportTipLink` | Needs product-purpose review | Keep until classified |
| Stripe product script | Marketplace/checkout infrastructure | Out of scope |
| Shared-project support quota | Legacy disabled shared feature | G4 review |

## Product Edition

This phase prevents advertising script and slot initialization for `product`.
The static ad DOM and AdSense source are still present in the DEV web build.
A product-build asset exclusion is a separate build phase.
