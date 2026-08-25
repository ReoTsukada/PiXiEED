# ADR-20260808: Draw2 Aseprite UX reference baseline

- Status: Accepted
- Scope: isolated `pixiedraw2/` and future Draw2 Work Packages
- Date: 2026-08-08

## Decision

PiXiEEDraw2 uses Aseprite as the minimum reference for pixel-art editing ergonomics and
basic feature completeness. The reference covers the interaction model and expected
editing outcomes: Layer × Frame × Cel structure, layer visibility/lock, Cel/Frame/Layer
copy and movement, Onion Skin, Selection Add/Subtract/Intersect, Move/Transform,
continuous strokes, temporary tool switching, shortcuts, nearest-neighbor rendering, and
indexed palette handling.

PiXiEED does not copy Aseprite source, UI assets, branding, product identity, file format,
or license assumptions. Aseprite is not added as a runtime or build dependency. Draw2
keeps PiXiEED Core, Asset Revision, Journal, PiXiSYNC, Game/Audio bridge, and package
contracts authoritative.

## Product adaptation

Desktop uses a dense pixel-art workspace and may add dockable Workspace, Inspector, and
Asset Browser surfaces. Mobile preserves the Canvas-centered PiXiEEDraw strength and
provides equivalent intent through adaptive Bottom Sheets and switchable Panels. No
mandatory operation may require hover or right-click.

## Audit rule

Each relevant WP records a matrix with: Aseprite baseline operation, Draw2 implementation
state, operation steps, keyboard/context path, desktop path, mobile equivalent,
accessibility state, performance evidence, and `UNTESTED` gaps. Aseprite parity is a
floor, not a ceiling: Core integration, realtime-safe revisions, offline recovery,
Game/Audio/Asset integration, and mobile adaptability are PiXiEED-specific extensions.

## Consequences

This prevents feature drift toward a generic canvas while avoiding incompatible parallel
type systems or a clone implementation. It adds an audit obligation to future Timeline,
Selection, Tool, Export, and responsive UI work. Performance and bundle budgets remain
authoritative; a reference feature cannot justify an unmeasured Main Thread or initial
Bundle regression.

## Compatibility and safety

The decision changes documentation and future acceptance criteria only. It does not alter
the current `pixiedraw/` route, current PXD, PiXiSYNC, Market, existing URLs, or any
production data.
