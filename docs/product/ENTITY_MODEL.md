# PiXiEED Entity Model

調査日: 2026-08-20
目的: Draw / Audio / Game / Asset / Market / Social / Collaboration が共有するEntityと、各Modeだけが所有するEntityを分ける。

## 1. Ownership rule

| Boundary | Owns | Does not own |
| --- | --- | --- |
| Identity / Account | Account、Tenant、Membership、Permission、Owner | Pixel、Audio bytes、Game runtime state、payment authority |
| Project Registry | Project identity、lifecycle、owner、members、visibility、head/root refs、legacy bindings | Raster bytes、Audio blob、journal本体、決済 |
| Asset Registry | Asset ID、Revision、hash、size、MIME、locator metadata、dependency、provenance | Blob bytes、License authority、Purchase、Entitlement |
| Draw | Canvas、Raster、Palette、Layer、Frame、Cel、Selection、Timeline、Draw command/history | Game runtime world、Market sale、Audio raw bytes |
| Audio | Audio Project、Track、Clip、Waveform、AudioRevision、Event、Marker、MIDI、Mixer graph | Draw pixels、Game authoring scene、payment authority |
| Game | GameProject、Scene、Entity、Component、Prefab、BehaviorIR、ActionMap、Runtime snapshot | Source Draw/Audio bytes、Market license authority |
| Collaboration | Session、Operation、Order、Checkpoint reference、binding、participant projection | Canonical ownership/permission、raw public file |
| Package | PXD／manifest／dependency lock／hash／license snapshot | New mutable Project state、payment settlement |
| Market / Commerce | Product、Listing、Purchase、Entitlement、License、Royalty、Ledger | Editor-local state、caller-supplied authority |
| Workspace | panel、dock、tab、zoom、scroll、active tool、device profile、focus、sheet | Project content、canonical command、PiXiSYNC operation |

この境界は `00_START_HERE/PIXIEED_LEARNING_CONTEXT.md`、
`02_ARCHITECTURE/PROJECT_REGISTRY_CORE.md`、`ASSET_REGISTRY_CORE.md`、
`STORAGE_PLACEMENT_AND_SYNC.md` の整理に基づく。実装が隔離されている境界は、Entityが定義されていても本番所有権を持つとは扱わない。

## 2. Identity and Core entities

| Entity | 主なFields / 関係 | Lifecycle | Status / Evidence |
| --- | --- | --- | --- |
| `Account` | `accountId`, status、profile、auth identity | invited → active → suspended → deleted | `IMPLEMENTED` current account/Auth source; live Auth/RLSは `UNTESTED` |
| `Tenant` | `tenantId`, owner／membership scope | created → active → archived | `PARTIAL`; FP-003AA／server authority contract |
| `Permission` | principal、resource、scope、decision、proof | requested → granted/denied → revoked | `PARTIAL`; caller claimsはauthorityではない |
| `Project` | `projectId`, owner、kind、name、visibility、lifecycle、head revision、root asset、legacy bindings | draft → active → archived/trashed/quarantined | current Draw Project + isolated Project Registry |
| `ProjectRevision` | `revisionId`, project、parent、revision number、content／snapshot hash、createdBy | draft → committed → superseded/reverted | `PARTIAL`; Draw2／Game Core hash contracts |
| `Command` | command id/type、project、before／after identity、payload、correlation、idempotency | intent → accepted → committed/rejected | current Draw history + Core command adapter |
| `JournalEntry` | sequence、command、pending/confirmed、checkpoint reference | open → committed/failed → compacted | current local journal; durable event foundation remains separate |
| `Checkpoint` | project/revision/hash、journal sequence、storage locator | created → verified → restored/expired | Draw2 and PiXiSYNC contracts; real Storage untested |
| `WorkspaceState` | mode、panel、dock、tab、zoom、scroll、active tool、sheet、focus、device profile | local transient → restored/reset | `PARTIAL`; must never enter Project/PXD/PiXiSYNC canonical state |

## 3. Asset and Draw entities

| Entity | 主なFields / 関係 | Lifecycle | Status / Evidence |
| --- | --- | --- | --- |
| `Asset` | `assetId`, project／owner、kind、root revision、visibility、lifecycle | draft → registered → active → archived/quarantined | `PARTIAL`; Asset Registry contract／current Draw assets |
| `AssetRevision` | revision、parent、content hash、size、MIME、locator、license/provenance snapshot | local draft → validated → registered → superseded | `PARTIAL`; immutable revision boundary |
| `AssetDefinition` | source project、Layer selection、Frame selection、Region、Animation、Pivot、lock mode | LOCAL_DRAFT → VALIDATED → REGISTERED → FORKED | `PARTIAL`; `draw2-creator-workspace.ts`／bridge |
| `Canvas` | canvas id、width／height、indexed palette、tile size、resize plan | created → edited → saved/exported | Draw2 Core and current Draw; two paths are not yet unified |
| `RasterAsset` | sparse tiles、dirty tiles／regions、palette indices、blend/display metadata | memory edit → command commit → checkpoint/export | `PARTIAL`; Draw2 `IndexedTileRaster` |
| `Layer` | layer id、order、visibility、opacity、group metadata | created → reordered/hidden → deleted/archived | current Draw + Draw2 timeline structure |
| `Frame` | frame id、order、duration／timing、tag membership | created → active/duplicated → removed | Draw2 timeline state |
| `Cel` | `(layerId, frameId)` cell、raster reference、empty／hold／linked metadata | empty → created → edited → linked/cleared | canonical special model: Frame × Layer = Cell |
| `Selection` | mask／bounds／regions、mode、transform session | idle → active → preview → committed/cancelled | Draw2 selection/transform contracts |
| `Timeline` | frame order、layer rows、cell matrix、tags、markers、onion neighborhood、playback state | hidden → mounted → edited → collapsed | Draw2 Timeline; UI projection only |
| `ExportArtifact` | format、scale、manifest、preview、output locators、hash | planned → rendering → complete/failed/cancelled | current Draw export + Draw2 lazy export; production new path unqualified |

## 4. Audio entities

| Entity | 主なFields / 関係 | Lifecycle | Status / Evidence |
| --- | --- | --- | --- |
| `AudioProject` | project/revision、sample rate、channels、duration、tracks、events | draft → edited → committed → packaged | `PARTIAL`; AUDIO-200 isolated |
| `AudioRevision` | asset/revision id、format、MIME、duration、sample rate、channels、hash、locator | draft → validated → canonical/pinned | `PARTIAL`; raw bytes remain outside metadata authority |
| `Track` | track id、kind、order、clips、mixer route、mute/solo/armed | created → edited → rendered/frozen | `PARTIAL`; AUDIO-200/240 |
| `Clip` | source revision、start/end、offset、fade、gain、loop、event binding | draft → placed → trimmed/split/faded → committed | `PARTIAL`; UI markup exists in isolated Draw2 entry |
| `WaveformProjection` | source bins、bounded display bins、zoom/timebase | computed → mounted → invalidated | `PARTIAL`; projection has limits, not device proof |
| `AudioEvent` | event id、project/asset/revision、time／marker、binding mode LIVE/PINNED | preview → committed/cancelled → package-locked | `PARTIAL`; AUDIO-210 |
| `Marker` | marker id、time、label、kind、linked event | created → moved/renamed → removed | `PARTIAL`; source module / UI candidate |
| `PianoRollNote` | pitch、start、duration、velocity、track／instrument | draft → edited → rendered/MIDI output | `CANDIDATE`/partial source under AUDIO-240; full editor qualification absent |
| `MixerGraph` | channel、bus、gain、pan、mute/solo、FX chain、master | draft → previewed → frozen/rendered | `CANDIDATE` source; no production AudioContext |

## 5. Game and runtime entities

| Entity | 主なFields / 関係 | Lifecycle | Status / Evidence |
| --- | --- | --- | --- |
| `GameProject` | project/owner、scenes、dependencies、behavior IR、revision/hash | draft → validated → revisioned → buildable | `PARTIAL`; GAME-300 |
| `Scene` | scene id、entities、initial scene relation | created → edited → active in runtime | `PARTIAL` isolated Core |
| `Entity` | entity id、parent／children、components、prefab relation | created → configured → instantiated | `PARTIAL` isolated Core |
| `Component` | typed component id/type/properties: Transform, Sprite, Audio Source, Behavior, Camera | draft → validated → runtime projected | `PARTIAL`; unknown/malformed components fail closed |
| `Prefab` | reusable entity/component definition、version/revision | draft → validated → instantiated/forked | `PARTIAL` contract-level |
| `BehaviorIR` | version、triggers、actions、conditions、canonical ownership | source edit → compiled → validated → runtime | `PARTIAL`; no arbitrary host script execution |
| `ActionMap` | semantic ActionId、contexts、keyboard/touch/gamepad/custom bindings | draft → validated → runtime bound | `PARTIAL`; GAME-310 |
| `RuntimeProjectSnapshot` | locked project revision/hash、scene ids、component snapshots、Draw/Audio asset locks | prepared → running → expired/rejected | `PARTIAL`; GAME-320 |
| `RuntimeSession` | mode、tick、frame、world、variables、input sequence、checkpoints | preview → playing → paused/stopped/reset | `PARTIAL`; authoring Projectを変更しない |
| `RuntimeSaveState` | snapshot locks、world、state hash | created → validated → restored/rejected | `PARTIAL`; persistence is Runtime-local in contract |
| `BuildPlan` | project revision、IR hash、target/profile、capabilities、dependency／asset／license locks | planned → validated → cancelled/ready | `PARTIAL`; GAME-330 |
| `GamePackage` | manifest、artifact entries、provenance／license、hash | planned → materialized → quarantined/published candidate | `PLANNED` beyond isolated manifest |

## 6. Collaboration, package, commerce, social entities

| Entity | 主なFields / 関係 | Lifecycle | Status / Evidence |
| --- | --- | --- | --- |
| `PiXiSYNCOperation` | session/project、client sequence、command payload、base／confirmed revision | local pending → sent → confirmed/rejected | `IMPLEMENTED` current source; production live state unverified |
| `PiXiSYNCSession` | session／room、project binding、participant projection、transport status | authenticate → join → active/suspended → leave/archive | `PARTIAL`; V1 current, legacy shared flow disabled |
| `SharedProjectBinding` | local project ↔ shared project/room binding | resolved → confirmed → left/archived | `DISABLED` legacy UI path; keep compatibility evidence |
| `PackageManifest` | project/revision、asset locks、dependency locks、license/provenance snapshots | draft → validated → pinned → exported | `PARTIAL`; PXD／Audio／Game contracts |
| `Product` | product id、owner、kind、source revision/package、visibility | draft → review → listed → withdrawn | `IMPLEMENTED` current Market source |
| `Purchase` | buyer、product、checkout/payment identity、status | initiated → paid/failed/refunded | `IMPLEMENTED` source; live provider/webhook untested |
| `Entitlement` | principal、product/package、scope、expires/revoked | pending → active → revoked/expired | `IMPLEMENTED` current contract/source; RLS/provider untested |
| `License` | owner、scope、revision、grant、snapshot/hash | drafted → granted → locked/revoked | `PARTIAL`; package contracts plus current Market |
| `Royalty` / `LedgerEntry` | product/purchase、share、amount、settlement/refund links | calculated → posted → reconciled | `PARTIAL`; FP-003/server authority required |
| `SocialPost` | post id、author、content metadata、public URL、OGP、moderation | draft → published → hidden/removed | `IMPLEMENTED` current source; migration applied state unknown |
| `Comment` / `Like` / `Follow` | post／user relations、moderation／visibility | created → visible/hidden → removed | `PARTIAL`; current source/migrations + new Core contract |
| `Notification` | event relation、recipient、read state、delivery status | emitted → unread/read → expired | `PARTIAL`; Core projection/provider unverified |

## 7. State separation rules

1. `WorkspaceState` は Panel、Sheet、Dock、Zoom、Focus、Device Profileだけを持つ。Canvas／Layer／Frame／Audio／Gameのcanonical contentを持たない。
2. `RuntimeSession` は authoring `GameProject` を変更しない。Save StateはRuntime worldを保存するだけで、Project Journal／PiXiSYNC eventではない。
3. `Asset Registry` は bytesを持たず、ID／Revision／hash／locator／dependencyを持つ。BlobはOPFS／Object Storage boundaryに置く。
4. `LIVE` はpreview／bridgeで許可されても、package exportは `PINNED` でなければならない。
5. Caller claim、UI visibility、feature flag、role表示はIdentity／Permission／Entitlementのauthorityではない。
