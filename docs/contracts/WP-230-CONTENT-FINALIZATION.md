# WP-230 Social Content Finalization Contract

## Canonical postable content

SNS Post is optional bounded plain text plus one or more approved Core Card references and social
metadata. Raw canvas/image/audio/video upload, Base64, Data URL, private body, JWT, secret, payment,
rights, entitlement, or Direct Work fields never cross this boundary.

Core Card v1 stores only:

- `cardId`, `cardType`, `resourceId`, `cardVersion`;
- a safe public presentation reference;
- explicit `price`, `availability`, `creator`, and `preview` policies, each `LIVE`, `SNAPSHOT`, or
  `OMITTED`;
- approval/public-at-share markers.

Supported card types are Market Product, Material, Completed Work, Public Game, Public Project,
Creator, Collection, and future public PiXiEED resource. Draw2 sharing is
`Draw2 → public work/package/Market/showcase → Core Card → explicit Share Command → Post`.

## Read-time privacy

The current server visibility, lifecycle, moderation, and permission projection is authoritative.
Private, deleted, trashed, quarantined, unpublished, or unauthorized resources resolve to the
typed `CONTENT_UNAVAILABLE` placeholder and return no old title, preview, or presentation path.
Search eligibility is limited to explicitly published, public, moderation-approved, server-allowed
resources. Search is not authorization.

Market Cards remain reference-only and navigate to an already authorized Market/Product route. They
never create or mutate Product, price, Purchase, Entitlement, License, Royalty, Payout, or Ledger.

Comments/replies are bounded plain text with typed User/Creator mentions. Raw HTML/script and unsafe
boundary keys are rejected. Share creation is explicit and duplicate Share Command identity is an
idempotent no-op; a conflicting reuse fails closed.

## Finalization evidence

The isolated fixture covers raw media/Base64/Data URL rejection, Core Card requirement, Market Card
acceptance and live/snapshot policy, private/deleted/quarantined/unpublished unavailability, explicit
and unauthorized share, duplicate/conflicting share, Direct Work/commerce mutation rejection, plain
comments, notification non-rollback, and public Search visibility.

