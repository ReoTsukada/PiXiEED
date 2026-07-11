# PiXiEEDrawDEV G3-B: Advertising-off UI Removal

## Removed From DEV

- `../scripts/pixieed-adfree.js` is no longer loaded by `PiXiEEDrawDEV`.
- The former advertising-off entitlement no longer reads cached purchases,
  restores claims, changes advertising CSS, or subscribes during account
  initialization.
- The DEV localization and support-status bridge no longer render or update
  advertising-off UI.

Existing `adFree`, `removeAds`, and entitlement storage values are left
untouched and ignored. No project, autosave, recent, or recovery storage is
migrated or cleared.

## Retained

- Advertising DOM, AdSense initialization, and the edition capability rule.
- `support-checkout-panel.js` as generic support and marketplace
  infrastructure. It has no visible DEV trigger after the advertising-off
  entitlement route is removed; G4 will remove remaining dead purchase option
  code or move retained support options to a product-specific entry point.
- Stripe and marketplace code outside `PiXiEEDrawDEV`.
- Disabled shared-project quota plumbing, pending its dedicated G4 cleanup.

## Advertising Rule

`edition-capabilities-utils.js` remains the only advertising decision point:

- `dev` and `web-free`: ads shown for every user.
- `product`: ads are not initialized.

No account, purchase, entitlement, LocalStorage, IndexedDB, or remote API
state participates in that decision.
