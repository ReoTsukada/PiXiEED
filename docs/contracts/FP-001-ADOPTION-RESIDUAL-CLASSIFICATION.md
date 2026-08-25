---
spec_id: CONTRACT-FP001-ADOPTION-RESIDUAL-CLASSIFICATION-001
title: FP-001 residual trust classification
status: COMPLETE
updated: 2026-08-09
---

# FP-001 residual trust classification

This inventory classifies the remaining Boolean/Object trust signals before changing them. The
classification is about whether a value can decide a security boundary, not whether the source
contains the word `trusted`.

## SECURITY_AUTHORITY — AuthorizationProofV1 migration required

| Area | Boundary | Current signal | Required treatment |
|---|---|---|---|
| WP-098 Public URL | private resource route, private static route, redirect preparation | `serverAllow(permissionDecision)` | Resolve a Proof bound to route/resource, action, tenant, and correlation. |
| WP-095 Event | fact commit, producer registration, consumer registration | `serverAllow(permissionDecision)` and producer trust | Resolve a Proof at each write/registration boundary; producer trust may remain only as derived state. |
| WP-097 Notification | enqueue projection, delivery dispatch | `serverAllow(permissionDecision)` | Resolve an operation Proof; recipient Proof remains separately recipient-bound. |
| WP-230 SNS | post/card/comment/follow/reaction/mention/community/membership/page/market reference creation | `serverResolved*` / `serverResolved` | Replace caller Boolean with operation-bound Proof. |
| WP-230 SNS | read, Core Card availability, Search eligibility | `serverAllowed` | Replace caller Boolean with read/index Proof bound to the resource. |
| WP-240 | moderation reference | `serverResolvedActor` | Replace with moderation operation Proof. |
| WP-250 | admin audit, moderation case, moderation decision | `serverResolvedActor/Reporter/Moderator` | Replace with operation-bound Proof; keep this package shadow-only. |

## DERIVED_STATE — permitted after authority migration

| Area | Signal | Rule |
|---|---|---|
| WP-095 Event | internal `trusted` producer marker | Must be derived only from an already validated producer Proof and never accepted from a caller request. |
| SNS/WP-240/WP-250 | `ok`, `eligible`, `adsAllowed`, visibility/status results | These are output projections, not authority inputs. They must not be accepted as permission on a later boundary. |

## LEGACY_ADAPTER_ONLY — permitted only inside an explicit adapter

| Area | Signal | Rule |
|---|---|---|
| Asset Registry | `clientHashUntrusted` | A server-side blob-verifier hint; it is not an authorization decision and must not grant access. Keep it inside the verifier adapter. |

## NON_AUTHORITY — outside FP-001 AuthorizationProof

| Area | Signal | Rule |
|---|---|---|
| WP-240 Revenue shadow | `serverReadOnly` | Shadow-safety invariant. It cannot grant access and must remain paired with `ledgerMutation: false` and `payoutMutation: false`. |
| WP-240/WP-250 Ads and policy | `serverResolved` for consent/region/age/ad placement | Policy decision, not account/resource authorization. Keep fail-closed for now and define a separate typed PolicyProof/Decision contract in a later policy package; do not treat it as AuthorizationProof. |

## Closure rule

FP-001 closes only when every `SECURITY_AUTHORITY` row no longer trusts a caller-controlled Boolean
or permission Object. A non-zero source scan is acceptable only for the explicitly classified
derived, adapter-only, or non-authority signals above. The scan must report those classes
separately.

## Final result — 2026-08-09

`securityAuthorityLegacyTrust: 0`. The residual audit passed after the Public URL, Event,
Notification, SNS, WP-240 Moderation, and WP-250 Admin/Moderation migrations. FP-001 may now hand
off to FP-002, but FP-002 has not been started in this task.
