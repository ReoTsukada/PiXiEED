# PiXiEED vNext Canonical Decision Packet

```yaml
document_id: PIXIEED-VNEXT-CANONICAL-001
status: DESIGN_GATE
version: 0.1.0
decided_at: 2026-09-05
owner: Astra
implementer: Luna
scope: PiXiEED web platform, iDRAW, iAUDIO, iGAME, Market, Social
```

## 0. Decision summary

PiXiEED vNext is a creator platform, not a general-purpose high-complexity game
engine. The product value is the shortest reliable path from making an asset to
using it in a shared project, publishing it, selling it, and creating a permitted
derivative.

```text
iDRAW / iAUDIO
      ↓ select a range, describe its role
Shared Asset Package
      ↓ drag, assign, preview
iGAME project
      ↓ local share / PiXYNC
collaborative work
      ↓ provenance + license
Market / Social / derivative work
```

The five-rail layout is not a product requirement. Each mode chooses its own
workspace composition from the user's current task. HTML owns semantic state,
CSS owns presentation and layout, and JavaScript owns domain state and complex
interaction.

## 1. User goal and first completion slice

The first product-complete slice is:

1. A creator selects a sprite region, frames, or layers in iDRAW.
2. Another creator selects a music or sound range in iAUDIO.
3. Both selections become reusable Asset Packages without destructive copying.
4. A game creator drags the assets into iGAME and assigns visible roles.
5. Two collaborators edit the same Project through local sharing and PiXYNC.
6. Save, reload, preview, and runtime playback preserve the same result.
7. The Project can be published or sold with author, license, and derivative data.

Genre choice is deliberately absent. Side-scrolling, four-direction movement,
eight-direction movement, RPG, action, racing, and other experiences are
compositions of behaviors, input actions, camera rules, and assets.

## 2. Invariants to preserve

These are the only existing-system contracts that block the new design:

- local-first Project editing and recovery;
- PiXYNC checkpoint, revision ordering, operation identity, reconnect, offline
  queue, and two-client convergence;
- existing public URLs, account continuity, Market purchases, entitlements,
  licenses, seller records, and published works;
- stable Project, Asset, Revision, and dependency identity;
- non-destructive range references for iDRAW and iAUDIO;
- explicit permission, attribution, and derivative-sale provenance;
- bounded memory and incremental persistence for long timelines and large worlds;
- undo/redo and a preview boundary that cannot silently overwrite authored data.

No new UI may bypass these contracts. No redesign is complete merely because a
new screen renders.

## 3. Deliberately out of scope for the design gate

The following are not part of the first implementation path:

- a fixed five-rail shell shared by every mode;
- a mandatory genre or platform selector;
- Unity-level scripting, arbitrary native plugins, or a general 3D engine;
- a full code editor before the no-code creation flow is reliable;
- duplicating the same inspector, asset browser, or timeline in every mode;
- a social feed or commerce surface that is not connected to real Project and
  license provenance;
- automatic destructive conversion of old project data;
- a large collection of new harnesses, work packages, or explanatory documents.

These items may be revisited only after the first vertical slice is proven.

## 4. Canonical data boundaries

### 4.1 Project

The Project is the cross-tool authority. It stores references and authored
decisions, not duplicated editor-specific copies.

```ts
interface CreatorProject {
  projectId: string;
  revision: string;
  scenes: Scene[];
  assets: AssetBinding[];
  behaviors: BehaviorBinding[];
  audioEvents: AudioEventBinding[];
  rights: RightsSnapshot[];
  collaboration: CollaborationState;
}
```

### 4.2 Shared Asset Package

`PiXiEED Asset Package` is the interchange boundary between iDRAW, iAUDIO,
iGAME, Market, and Social. A manifest is synchronized and cached separately
from potentially large binary content.

```ts
interface AssetPackageManifest {
  assetId: string;
  revision: string;
  kind: "sprite" | "tilemap" | "animation" | "audio" | "ui" | "bundle";
  source: { product: "iDRAW" | "iAUDIO" | "Market"; projectId: string };
  regions: Array<{
    id: string;
    bounds: { x: number; y: number; width: number; height: number };
    frames?: string[];
    layers?: string[];
    loop?: { start: number; end: number };
  }>;
  roles: string[];
  runtimeHints: Record<string, unknown>;
  rights: RightsSnapshot;
  dependencies: string[];
  contentHash: string;
}
```

The package is a reference to the selected source range. Re-encoding or
flattening is an explicit export action, never an implicit import side effect.

### 4.3 Collaboration

Local sharing and PiXYNC exchange operation identity and canonical deltas, not
large mutable snapshots on every pointer move. Checkpoint plus ordered tail
recovery remains the authority. The new editor may have different panels, but it
must not create a second synchronization model.

### 4.4 Rights and derivative work

Every imported or purchased package carries its author, license, attribution,
derivative permission, and source relationship into the Project. Market and
Social read this graph; they do not invent a second ownership model.

## 5. Mode-specific workspace decisions

The modes share tokens, commands, selection semantics, and save feedback, but
not geometry.

### iDRAW

Primary task: draw, animate, select, and package a visual asset.

- The canvas is the dominant surface.
- Tools are compact and task grouped; rarely used tools live in a command
  palette or contextual popover.
- Layers, frames, color, and properties appear in the panel that matches the
  current selection; they are not all permanently open.
- A range selection can be tagged as a role without leaving the canvas.
- Sprite sheets, grids, free-form frames, layered characters, and background
  sequences are all first-class sources.
- Asset packaging is non-destructive and can return to the exact source range.

### iAUDIO

Primary task: compose, audition, and capture a musical or event range.

- Timeline and Piano Roll get the largest area when note editing is active.
- Track browser, instrument controls, clip details, and mixer are contextual
  surfaces, not mandatory permanent rails.
- The timeline is virtual and sparse so a long song does not require a larger
  DOM or a full in-memory render.
- Range selection creates BGM, SE, voice, loop, or event candidates with PPQ/
  Tick authority preserved.
- The same source can yield several named event ranges without duplicating the
  underlying composition.

### iGAME

Primary task: place an asset, give it a role, and test the result immediately.

- The world or preview is dominant and can expand to a distraction-free view.
- Asset shelf, scene list, and Inspector are detachable/contextual regions;
  there is no fixed rail count.
- An asset card exposes only high-value slots first: visual, motion, collision,
  gravity, audio events, UI role, and interaction.
- Behaviors are composable primitives: move, jump, collide, trigger, camera,
  inventory, item, skill, stat, timer, dialogue, race, and UI.
- A sprite/audio slot opens the source editor at the selection surface and
  returns to the same Project selection after capture.
- Infinite-feeling worlds use sparse chunks and viewport virtualization; the
  authored coordinate system is not limited by the visible canvas.
- Scene editing and Game preview have an explicit boundary so preview input
  never mutates authored layout by accident.

## 6. Shared interaction language

- One canonical selection per Project, with visible source and revision.
- Drag, click, keyboard shortcut, and command palette invoke the same command.
- Every command has a semantic label, shortcut hint, disabled reason, and undo
  behavior.
- High-frequency actions remain visible; low-frequency actions use progressive
  disclosure.
- No panel may force document-level scrolling. Long content scrolls inside its
  owning surface or uses virtualization.
- Empty states show the next action through structure and affordance, not a
  paragraph of explanation.
- Destructive, publish, payment, rights, and delete actions are never icon-only.

## 7. Implementation streams

Only disjoint responsibilities are parallelized. Shared contracts have one
integration owner.

| Stream | Luna responsibility | Boundary |
|---|---|---|
| A | Asset Package manifest and range references | `src/*asset*`, contract tests |
| B | iDRAW capture and source-return flow | iDRAW adapter and focused UI |
| C | iAUDIO range/clip capture and virtual timeline | audio adapter and focused UI |
| D | iGAME placement, behavior cards, sparse world | game authoring and runtime |
| E | Project/PiXYNC adapter, save/reload evidence | existing sync contracts only |
| F | mode-specific shell and visual QA | new workspace surface, no domain changes |

Sol reviews cross-stream interfaces and integration. Astra is recalled only for
an unresolved architecture or data-loss decision. No agent starts work that is
blocked by an undecided contract.

## 8. Cleanup policy for the reset

The reset is semantic before it is physical.

1. Mark current pages, old UI, harnesses, and documents as `CURRENT`, `HISTORY`,
   `EVIDENCE`, `GENERATED`, `PROTECTED`, or `REMOVE_CANDIDATE`.
2. Create no replacement for a document whose only purpose is duplicate status
   prose or a superseded prompt.
3. Keep the minimal protected contracts and existing sync/rights evidence.
4. Build the new surface in isolated namespaces and run focused browser and
   contract validation.
5. Remove only files with no active import, route, test, recovery, legal, or
   protected-contract role, after the replacement passes acceptance.

The following are never removed as part of a UI reset without a separate
approved migration: `.git`, repository instructions, protected invariants,
PiXYNC/Project compatibility code, Market/rights data, and external Bridge
artifacts.

## 9. Acceptance criteria

### Product

- A first-time creator can make and preview a usable asset without selecting a
  genre or learning a fixed rail layout.
- iDRAW range, frame, layer, and tag data arrives in iGAME without destructive
  flattening.
- iAUDIO range data can be used as BGM, SE, loop, or an event sound without
  copying the entire song.
- iGAME can place and configure a character, map, UI node, item, and audio event
  through compact cards and immediate preview.
- A 256×256 or larger world remains editable through sparse chunks and bounded
  viewport work.

### Platform

- Local share, save/reload, PiXYNC reconnect, offline queue, and two-client
  convergence remain valid.
- Existing routes and purchased entitlements remain readable.
- Rights and derivative provenance survive import, collaboration, publishing,
  and Market listing.

### Quality

- Each stream has targeted tests before integration.
- Browser evidence covers the real user path, not only isolated contracts.
- Desktop reference viewports have zero page overflow; scrolling is confined to
  intended panels or virtualized surfaces.
- Performance checks cover long audio, large sparse worlds, and repeated preview
  switching.
- Results are reported separately as `IMPLEMENTED`, `UNIMPLEMENTED`, and
  `UNTESTED`.

## 10. Immediate next decision

The next implementation gate is the Asset Package and canonical selection
contract. Once that contract is accepted, iDRAW, iAUDIO, and iGAME can be
implemented in parallel without inventing incompatible import panels or mode
specific copies.

## 11. Site and app information architecture

PiXiEED has two presentation layers with one identity and one Project model:

```text
Public site: discover → understand → try → share → buy
                         ↓
Creator app: create → collaborate → preview → publish
```

The top page is a product entry point, not an advertising wall. It must offer a
usable first action without login, explain the three creative surfaces through
examples, and make the next step obvious.

### 11.1 Public site routes

| Route | Purpose | Primary action |
|---|---|---|
| `/` | Start page: product promise, live examples, recent work, install/launch | `制作をはじめる` |
| `/discover` | Social discovery and creator activity | `作品を見る` |
| `/market` | Asset and project marketplace | `素材を探す` |
| `/market/:packageId` | Package detail, license, provenance, derivative rights | `使って制作する` |
| `/u/:handle` | Creator profile and published work | `フォロー` / `作品を見る` |
| `/p/:projectId` | Public project or playable preview | `プレイ` / `派生して制作` |
| `/learn` | Short task-based guides and templates | `この手順で作る` |
| `/help`, `/legal`, `/privacy`, `/terms` | Support and policy | `戻る` / contextual action |

Public pages remain crawlable and shareable. They do not load the editor bundle
or open a full Workspace merely to display a post, package, or policy page.

### 11.2 Creator app routes

The app is a single authenticated/local-first shell with deep links into a
Project. It is installable as a PWA first; a future native shell reuses the
same route and Project boundary.

| Route | Purpose |
|---|---|
| `/app` | Project home, recent work, shared rooms, drafts |
| `/app/new` | Create from blank, template, imported Asset Package, or shared Project |
| `/app/project/:projectId` | Project overview, collaborators, assets, versions, publish |
| `/app/project/:projectId/draw` | iDRAW task workspace |
| `/app/project/:projectId/audio` | iAUDIO task workspace |
| `/app/project/:projectId/game` | iGAME task workspace |
| `/app/project/:projectId/play` | Isolated playable preview |
| `/app/share/:roomId` | Collaboration entry and presence handoff |
| `/app/market/sell/:projectId` | Package/Project sale preparation and rights review |
| `/app/account` | Profile, permissions, storage, devices, billing |

`/app/project/:projectId` is the handoff point between modes. Opening a mode
does not clone the Project; it selects a task surface over the same canonical
state. A deep link includes Project and revision context, and invalid or
private access fails closed without exposing content.

### 11.3 Shell rules

The public shell and creator shell share brand tokens, account state, command
names, notifications, and accessibility conventions, but they do not share
layout geometry.

Public shell:

- shallow header, clear product CTA, search/discovery, account entry;
- content can use normal page scrolling for posts, marketplace, and guides;
- media and editor bundles load lazily;
- install prompt is contextual and never blocks reading or creation.

Creator shell:

- full-viewport app frame with no document scroll;
- project switcher and save/share/presence status always discoverable;
- mode workspace fills the primary area and chooses its own panel composition;
- command palette, shortcut help, and undo remain cross-mode;
- preview is a separate route/state boundary and cannot silently mutate the
  authored Project;
- local cache is available before login where policy permits, then reconciles
  through the existing Project/PiXYNC boundary.

### 11.4 Landing-to-app flow

The top page offers three low-friction paths:

1. `試してみる` opens a disposable local Project with sample assets.
2. `制作をはじめる` opens `/app/new` and asks only for the first task, not a
   genre or mode configuration matrix.
3. `作品・素材を見る` opens public discovery or Market without forcing an
   account.

After the first useful result, the user is asked to save, sign in, share, or
install. This keeps acquisition, creation, and account conversion in one
continuous journey while keeping the editor free from promotional UI.

### 11.5 Delivery and performance boundary

- Public HTML is small and independent from editor bundles.
- `/app` loads the common shell and lazy-loads only the active mode.
- iDRAW, iAUDIO, and iGAME share contracts but do not mount three workspaces at
  once.
- Large sprites, audio timelines, worlds, and previews use streaming, sparse
  data, and viewport virtualization.
- Route transitions preserve Project selection and unsaved local state; a
  failed lazy module returns to the Project overview with recovery options.

### 11.6 Site/app acceptance

- A visitor can understand PiXiEED and reach a working first action from `/`
  without reading a long explanation.
- Public work, Market package, and creator profile URLs are directly shareable.
- A Project can move from public preview or Market to the correct app surface
  without losing Project, Asset, license, or revision identity.
- Reloading a deep-linked app route restores the same Project and active task.
- The active mode is the only heavy editor surface mounted.
- Public pages may scroll; creator workspaces contain scroll within their own
  panels and never introduce document-level overflow.

## 12. One Creator App, extensible by task

The Creator App is one product and one Project environment. iDRAW, iAUDIO, and
iGAME are the first task surfaces, not permanent product boundaries. Future
surfaces may include illustration, image editing, compositing, motion graphics,
3D, layout, writing, and publishing workflows.

The app must not become a giant screen containing every tool. New capabilities
are added as lazy, task-oriented surfaces over the same Project model:

```text
Creator App
├─ Project Home
├─ Visual workspace       (iDRAW and future image/compositing tasks)
├─ Audio workspace        (iAUDIO and future sound tasks)
├─ Game workspace         (iGAME and future interactive tasks)
├─ Motion / video tasks
├─ 3D / scene tasks
└─ Publish / collaborate / sell
```

Each surface can choose its own geometry, density, shortcuts, and contextual
panels. The common layer provides only identity, Project selection, Asset
Package exchange, command registration, undo/save feedback, presence, and
navigation. Inactive heavy surfaces are not mounted.

The long-term quality target is breadth of creative work with a low learning
cost, not reproducing every advanced feature of a specialist tool at once.
Capability is added only when its primary workflow can be made discoverable,
reversible, performant, and compatible with the common Project model.

## 13. Market derivative permissions

Derivative use is a first-class license choice during listing. A seller selects
whether a package is:

- `USE_ONLY`: may be used in an allowed Project, but a resulting work cannot be
  sold as a permitted derivative;
- `DERIVATIVE_ALLOWED`: may be edited, combined, and included in a derivative
  work or sale according to the listed terms;
- `REDISTRIBUTION_ALLOWED`: an explicitly broader license, never implied by
  purchase.

The Market listing shows this choice before purchase. When a package is
`DERIVATIVE_ALLOWED`, it appears in the Creator App's `派生可能アセット`
collection and can be discovered by iDRAW, iAUDIO, or iGAME according to its
kind. A purchased `USE_ONLY` package remains available where its license allows
use, but is visibly excluded from derivative-sale workflows.

Every derived Project and listed package automatically retains:

- original Asset and Revision IDs;
- author and attribution requirements;
- complete derivation chain;
- inherited restrictions and expiry, if any;
- revenue-share or royalty rules;
- a fail-closed decision when the license is missing, revoked, or incompatible.

The UI must explain the effective permission at the moment of import, use,
publish, and sale. A visual badge alone is insufficient for a high-risk sale or
rights decision.

## 14. PiXYNC is the online real-time authority

PiXYNC is not a later collaboration add-on. It is the online real-time sync
path for the same canonical Project used locally.

```text
local command
  → optimistic local projection
  → canonical operation / revision
  → PiXYNC transport
  → remote projections + presence
  → checkpoint / ordered tail recovery
```

The first completed vertical slice therefore includes:

- two users in one Project at the same time;
- operation identity, ordering, duplicate suppression, and conflict handling;
- presence and selection visibility without leaking private content;
- offline queue, reconnect, sleep/wake recovery, and checkpoint restoration;
- no loss of confirmed edits when a client or connection fails;
- explicit permission boundaries for editing, viewing, publishing, and selling.

Local-first editing is a performance and resilience strategy, not a substitute
for online collaboration. The editor may render optimistically, but PiXYNC
remains the revision authority. A new UI or future native shell must reuse this
path rather than create a second collaboration protocol.

## 15. Asset sales and automatic assetization

The Market supports both atomic Asset sales and grouped Asset Package sales.
The source may be authored as one canvas, one song, or one project, but the
resulting library is addressable at the smallest useful unit.

```text
one source project
├─ Asset: hero.walk.down
├─ Asset: hero.walk.left
├─ Asset: hero.attack
├─ Asset: coin
└─ Asset Pack: hero complete set
```

An Asset Pack is a manifest of Asset IDs and dependencies, not a second copy of
the source data. A buyer can purchase or use one Asset, a selected subset, or a
complete Pack according to the seller's license. Each atomic Asset keeps its
own preview, tags, revision, rights, and derivation link while the Pack keeps
the collection relationship.

### 15.1 One-step assetization

iDRAW and iAUDIO expose one contextual `アセット化` command after a selection.
The command proposes a result and shows a compact correction surface before it
commits anything:

1. detect selected regions, frames, layers, tracks, and timing;
2. propose Asset units and names from tags, layer names, frame labels, or
   source layout;
3. show a visual strip/timeline preview with the proposed boundaries;
4. let the creator merge, split, reorder, rename, or retag;
5. save only the manifest and source references, then make the units available
   in the Asset Library.

No raster or audio payload is silently flattened. `アセット化` is reversible:
the creator can reopen the exact source selection and revise the manifest.

### 15.2 Supported iDRAW source patterns

The detector must support, with a manual correction fallback:

- fixed grids such as 16×16 or 32×32;
- a sprite sheet containing several rows or columns;
- free-form rectangles with gutters or transparent padding;
- one animation frame per canvas frame;
- an animation range that crosses multiple canvas frames;
- several layers that form one composite character;
- independent body, weapon, shadow, or effect layers;
- background and tilemap regions that should remain a collection;
- named frames, layers, tags, and explicit selection ranges.

Animation is represented as an ordered sequence of source references, not as a
single flattened image:

```ts
interface AnimationAssetManifest {
  assetId: string;
  motion: string;
  direction?: string;
  frames: Array<{
    sourceFrameId: string;
    layerIds: string[];
    region: { x: number; y: number; width: number; height: number };
    durationMs?: number;
  }>;
  loop: "LOOP" | "ONCE" | "PING_PONG";
}
```

If a creator draws `walk` over frames 1–4 and `attack` over frames 5–8, the
detector creates two Animation Assets. If the same frame contains multiple
layers, the default result is one composite animation with optional layer
variants, not four confusing duplicate assets. The creator can split the
layers when a game needs independent parts.

### 15.3 Supported iAUDIO source patterns

iAUDIO uses the same concept for time ranges:

- full composition as a BGM source;
- a selected range as BGM, loop, SE, voice, or event sound;
- multiple tracks in one selected range;
- repeated ranges that share one source project;
- PPQ/Tick range, loop points, offsets, and render mode;
- named markers and event tags such as `jump`, `step`, or `attack`.

The range becomes an independent Asset ID while the source composition remains
the authority. Long compositions are not copied into every event Asset.

### 15.4 Library and iGAME presentation

The Asset Library has two levels:

- `アセット`: individual Sprite, Animation, Audio, Tile, UI, or Effect units;
- `パック`: a selectable group with dependencies and a shared preview.

iGAME receives atomic cards first. A Pack can be expanded only when the creator
needs more units. Cards show the role candidates that were inferred, such as
`歩行 / 下`, `攻撃`, `ジャンプ音`, or `タイル`. Dragging a card into a matching
slot attaches the reference; it never imports an opaque package that hides its
contents.

### 15.5 Market listing model

A seller chooses the listing unit:

- single Asset;
- selected Asset subset;
- complete Asset Pack;
- source Project or editable collection, if allowed.

Each listing records its dependency closure, preview, version, license, and
derivative permission. A Pack cannot make a restricted child Asset derivative
eligible by aggregation. The effective permission is calculated per Asset and
shown before purchase, import, publish, and sale.

### 15.6 Automatic detection quality gate

Automatic assetization is accepted only when the creator can see and correct
the proposed boundaries before commit. The detector must report confidence and
the reason for each proposal. Ambiguous sheets fall back to a neutral region
list; they must never be silently misclassified as a character animation.

The implementation must keep detection off the interaction hot path, virtualize
large previews, and persist source references plus compact metadata. A large
sprite sheet or long audio project must not cause proportional duplication of
DOM nodes, raster buffers, or audio buffers.

### 15.7 AI-free deterministic detection contract

PiXiEED does not use AI to infer asset intent. Therefore the detector must not
pretend that pixel similarity, transparency, or visual resemblance proves an
animation boundary. Automatic conversion is allowed only when the source
contains an explicit, deterministic signal.

The precedence order is:

1. explicit user range, grid, frame, layer, marker, or tag;
2. iDRAW/iAUDIO structural metadata already owned by the source editor;
3. a declared import preset whose parameters are fully specified;
4. otherwise no automatic split.

Examples:

- a 32×32 sheet is split only when the creator declares the cell size or the
  source canvas has a persisted grid contract;
- an animation is grouped only by an explicit frame range, animation tag,
  marker, or source animation mapping;
- layers are combined only when the creator selects composite mode or the
  source declares a composite group;
- an audio event is created only from an explicit Tick/time range or marker;
- a visually similar but untagged row remains one source region and is never
  silently labelled `walk` or `attack`.

The detector returns a typed result:

```ts
type AssetizationResult =
  | { status: "DETERMINISTIC"; proposals: AssetProposal[]; inputHash: string }
  | { status: "REVIEW_REQUIRED"; candidates: AssetProposal[]; reasons: string[] }
  | { status: "NO_SPLIT"; source: SourceReference; reason: string };
```

`REVIEW_REQUIRED` is not a soft warning. It blocks the commit button until the
creator explicitly fixes the boundary and confirms the result. Every proposal
displays its source evidence (grid, frame range, tag, layer group, or Tick
range), and the committed manifest records the detector version, input hash,
parameters, and confirmation revision.

The contract is considered complete only after fixtures prove that ambiguous
sprite sheets, missing frame names, overlapping selections, empty cells,
non-uniform frame durations, multi-layer characters, and long audio ranges are
either represented correctly or stopped without creating an incorrect Asset.

## 16. Artwork and deliverable Asset are different sale products

Creators may draw freely. A free-form illustration, a sprite sheet, an editable
source, and a game-ready Asset are different deliverables even when they came
from the same source Project. PiXiEED must not classify them from pixels or
silently turn one into another.

The canonical model is one `Work` with one or more explicit `Offers`:

```text
Work: forest character
├─ Offer: Artwork          (view/download final media)
├─ Offer: Asset            (use in iDRAW/iAUDIO/iGAME)
├─ Offer: Editable Source  (reopen and edit)
└─ Offer: Asset Pack       (several addressable Assets)
```

The Work retains the author and provenance graph. Each Offer declares its own
delivery profile, price, license, preview, dependencies, and permitted use.
The same source may have an Artwork offer and an Asset offer without duplicating
the source or confusing the buyer.

### 16.1 Seller-selected delivery profiles

When publishing, the creator explicitly selects one or more profiles:

- `ARTWORK`: finished visual, audio, video, or writing work; no runtime
  structure is promised;
- `ASSET`: an addressable tool-ready unit with a valid Asset Package manifest;
- `EDITABLE_SOURCE`: a reopenable source Project or source collection;
- `ASSET_PACK`: a collection of addressable Assets and declared dependencies;
- `PLAYABLE_PROJECT`: a playable or previewable Project with its own rights.

The profile is part of the listing contract and is visible before purchase. A
seller can start from a free-form drawing and publish it as `ARTWORK` without
adding grid or animation metadata. To publish it as `ASSET`, the seller must
explicitly select the regions, frames, layers, timing, and intended roles that
the buyer will receive.

### 16.2 Deterministic listing validation

The system validates the selected profile, rather than guessing it:

```text
seller chooses profile
  → required manifest fields are checked
  → source references and content hashes are checked
  → preview and dependency closure are checked
  → license and derivative terms are checked
  → seller confirms the exact delivery
```

For `ARTWORK`, validation covers readable media, preview, ownership, and
license. For `ASSET`, validation additionally requires:

- stable Asset ID and source Revision;
- at least one explicit region or time/frame range;
- valid frame order, dimensions, layers, and durations;
- declared runtime roles and optional pivot/loop information;
- no unresolved dependencies;
- a preview that matches the manifest;
- a license compatible with the selected derivative permission.

For `ASSET_PACK`, every child Asset is validated independently. A Pack cannot
hide a malformed child or grant it rights that the child does not have.

Validation errors block publication and identify the exact missing field. A
valid `ARTWORK` is not downgraded because it lacks Asset metadata, and an
`ASSET` is not accepted merely because its preview looks like a sprite.

### 16.3 Buyer experience

Market cards show the delivery profile first:

```text
[Artwork]  [Asset]  [Editable]  [Pack]  [Playable]
```

The buyer can filter for `iGAMEで使える`, `アニメーション付き`, `編集可能`,
`派生OK`, or `単品`. Selecting an `Asset` opens a manifest preview showing
regions, frames, layers, roles, dependencies, and rights before purchase.
Selecting an `ARTWORK` opens a presentation preview without pretending that it
is game-ready.

After purchase:

- `ARTWORK` goes to the personal collection;
- `ASSET` goes to the appropriate Asset Library and its allowed source slots;
- `EDITABLE_SOURCE` goes to Project sources;
- `ASSET_PACK` appears as an expandable collection of child Assets;
- `PLAYABLE_PROJECT` opens the isolated preview or a permitted editable fork.

The user can still create an Asset from an Artwork they own when the license
allows it, but that is a new explicit derivative operation with a new Asset
manifest and provenance link. It is never an implicit conversion at import.

## 17. Mixed music Projects and audio delivery Assets

iAUDIO must allow one composition to contain BGM, sound effects, voice,
ambience, and UI sounds at the same time. The source Project is a composition;
the delivery units are explicit ranges, track groups, or markers inside it.

```text
Audio Work: stage prototype
├─ BGM: field theme       (full arrangement, loop points)
├─ SE: jump               (track 4, Tick 3840–3960)
├─ SE: coin               (marker coin, track 5)
├─ VOICE: intro           (voice track, time range)
└─ Audio Pack: stage set  (references the child units)
```

The same source may therefore be mixed during creation and separated only when
the creator packages, uses, or sells it. BGM and SE are not separate authoring
modes and do not require separate Projects.

### 17.1 Explicit audio capture

The iAUDIO timeline provides a contextual `範囲をアセット化` action. The
creator selects:

- one or more tracks;
- a start and end in PPQ/Tick or time;
- optional marker or loop points;
- a delivery role: `BGM`, `SE`, `VOICE`, `AMBIENCE`, `UI`, or `LOOP`;
- live reference or pinned render policy.

Named markers such as `jump`, `step`, and `attack` are reusable capture points.
Several ranges in one composition may become separate Assets, and the same
range may intentionally be offered in more than one compatible form. The
source composition is never copied for each range.

### 17.2 No-AI classification rule

The system must not infer BGM or SE from duration, loudness, waveform shape,
tempo, or musical content. Those signals can be shown as editing aids, but they
do not determine delivery intent.

- explicit role and range → deterministic Audio Asset;
- explicit marker and track group → deterministic Audio Asset;
- no role but one selected range → `UNCLASSIFIED_AUDIO` proposal requiring the
  creator to choose a role;
- mixed or ambiguous selection → review required; never silently routed to a
  BGM or SE slot.

This prevents a short BGM motif from being mislabelled as an SE and a long
ambience or voice range from being hidden because it does not fit a duration
heuristic.

### 17.3 Role-aware validation and iGAME routing

The Audio Asset manifest keeps the source Project, selected track IDs, exact
range, Tick/time conversion, loop points, offsets, render mode, and role.

- `BGM` can be attached to a Scene, playlist, or crossfade slot;
- `SE`, `VOICE`, `AMBIENCE`, and `UI` can be attached to event or interaction
  slots;
- `LOOP` can be attached wherever the creator explicitly permits looping;
- an incompatible role/target combination is rejected before save or publish.

The iGAME Asset Library shows individual audio cards first, with an expandable
Audio Pack for grouped delivery. Card labels come from explicit roles and
markers, not from audio analysis.

### 17.4 Audio sale forms

An Audio Work may be sold as:

- a finished listening work (`ARTWORK`);
- one BGM, SE, voice, or ambience Asset (`ASSET`);
- an editable iAUDIO source (`EDITABLE_SOURCE`);
- a collection of event-ready sounds (`ASSET_PACK`);
- a playable Project containing the audio (`PLAYABLE_PROJECT`).

Each child range retains its own Asset ID, preview, rights, and derivation link.
A Pack cannot change a child's role or grant broader derivative rights. Long
compositions use virtual ranges and source references so packaging many effects
does not duplicate the full audio buffer.

### 17.5 One track may contain many delivery Assets

An iAUDIO Track is a source container, not an Asset boundary. One Track may
contain a complete BGM, several SE clips, voice fragments, or intentionally
mixed material. The delivery unit is an explicit range or marker on that Track.

```text
Track: SE workbench
├─ Tick 0000–0120  marker: jump
├─ Tick 0240–0300  marker: step
├─ Tick 0480–0600  marker: attack
└─ Tick 0720–0840  marker: coin
```

Each range becomes its own Asset ID with the same source Track ID and different
start/duration values. A creator may select several non-contiguous ranges and
create a Pack in one operation, while the individual child Assets remain
addressable for iGAME and Market.

The iAUDIO UI therefore treats these as separate concepts:

- Track: where the source is authored;
- Clip: an editable region in the composition;
- Marker/Range: the exact delivery boundary;
- Asset: the reusable unit with a role and rights;
- Pack: a group of Assets.

Track names and waveform shape never decide whether a range is BGM or SE. A
marker, explicit role, selected range, or multi-range confirmation is required.
Silence-gap detection may offer neutral boundary suggestions such as `Range 01`
and `Range 02`, but it cannot classify or publish them without confirmation.
