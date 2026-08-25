# PiXiEED Feature Dependencies

調査日: 2026-08-20
目的: Featureの実装依存、Entity依存、外部資格化依存を分離する。

## 1. Dependency types

| Type | 意味 |
| --- | --- |
| `CANONICAL` | Project／Asset／Revision／Permissionなど、依存先のidentity・hash・lifecycleが意味を決める。 |
| `RUNTIME` | 依存先の現行入口・DOM・Storage・providerがないと、ユーザーFlowとして成立しない。 |
| `UI` | Context、Panel、Focus、safe-area、keyboard、scroll ownershipが必要。 |
| `QUALIFICATION` | 実機、Browser matrix、Provider、RLS、Storage、long-sessionなど、実装後の証拠依存。 |
| `PRESERVATION` | 既存URL・データ・Market・PiXiSYNC・Authを壊さないことが前提。 |

## 2. Critical graph

```text
Identity / Permission
        ↓
Project Registry ── Project Revision ── Command / Journal / Checkpoint
        ↓                    ↓
Asset Registry ← Asset Definition / Bridge ← Draw Canvas / Layer / Frame / Cel
        ↓                    ↓
  AudioRevision / AudioEvent             GameProject / Scene / Entity / Component
        ↓                    ↓                       ↓
Audio Package / License              Game Runtime Snapshot ← ActionMap / BehaviorIR
        └─────────────── Game-340 LIVE/PINNED / lock / provenance ───────────────┘
                                      ↓
                              BuildPlan / Package Manifest
                                      ↓
                         Site / Market / Direct Work / Social
                                      ↓
                         Browser / PWA / Native distribution
```

## 3. Dependency matrix

| Consumer feature | Canonical dependencies | UI dependencies | External / qualification dependencies | Current classification |
| --- | --- | --- | --- | --- |
| Draw raster edit | Project、Canvas、Palette、Layer、Frame、Command、Undo、Journal | Canvas owner、tool context、touch capture、keyboard alternatives | compositor／memory／real touch／stylus | `PARTIAL` |
| Draw selection/transform | Raster、Selection、Clipboard、Command、before/after state | selection handles／Inspector／Sheet／cancel／focus restore | pointer/touch/browser matrix | `PARTIAL` |
| Draw Timeline | Layer、Frame、Cel、Tag、Marker、Playback | bounded timeline panel、cell focus、row/cell actions、mobile Sheet | long timeline／virtualization／screen reader | `PARTIAL` |
| Draw export | Project Revision、Raster、Asset Definition、PXD／manifest／hash | Export panel、preview、progress、cancel/error | real legacy PXD／filesystem／artifact provenance | `PARTIAL` |
| Audio authoring | AudioProject、Track、Clip、AudioRevision、Waveform、Timebase | Canvas/timeline、Clip inspector、transport、keyboard/IME | AudioContext、recording permission、hardware、long audio | `PARTIAL` |
| Audio package | Audio graph、PINNED revisions、license/provenance snapshot | Package lock/error explanation | storage bytes、license authority、provider | `PARTIAL` |
| Game authoring | GameProject、Scene、Entity、Component、Prefab、BehaviorIR | Scene tree、Inspector、Graph/Code、Input panel | current Studio route、Registry provider、device/gamepad | `PARTIAL` |
| Game runtime | locked Project/Asset revisions、Runtime snapshot、ActionMap | Preview/Play/Stop/Debug surface | browser/native runtime, performance, profiler | `PARTIAL` |
| Game build | BuildPlan、dependency/asset/license locks、manifest hash | Build/diagnostic panel | compiler／artifact storage／provenance | `PARTIAL` |
| Draw→Game asset | Asset Definition、Asset Registry、Revision、hash、license | asset selection／pivot／region panel | server-authorized registry and live reference | `PARTIAL` |
| Audio→Game sound | AudioRevision、AudioEvent、PINNED/LIVE lock | event/marker/track assignment | runtime audio output, package lock | `PARTIAL` |
| Market listing | Product、Package、License、Entitlement、rights、provenance | listing／review／price／purchase UI | Stripe webhook、RLS、Storage、download | current `IMPLEMENTED` + new `PARTIAL` |
| Social share | Post、public URL、OGP、moderation、Notification | feed/post/comment/share surface | DB/RLS, OGP deployment, moderation | current `IMPLEMENTED` + new `PARTIAL` |
| Collaboration | Project binding、Operation、revision/order、checkpoint | session/participant/presence UI | realtime/RPC/RLS/Storage | V1 `IMPLEMENTED` source; legacy UI `DISABLED` |
| Mobile workspace | same Core Project/Command; WorkspaceState separate | safe area、Canvas-first、Sheet、focus、IME | physical touch／stylus／keyboard／Safari | `PARTIAL` |
| Native distribution | Browser Core/project state, host adapter, artifact | native file/device permission surfaces | signing、archive、store、rollback | `PLANNED` |

## 4. Blocking dependencies for Draw / Audio completion

### Draw

- `DRAW-110`〜`170`のCoreがあっても、現行 `/pixiedraw/` Project／PXD／PiXiSYNCと同じcanonical Projectを使うproduction adapterが必要。
- mobile UIの確定には、`FP-006`のinput ownership（Draw / Pan / Pinch / Panel / Timeline）と `DRAW-130`のFrame×Layer×Celモデルを先に固定する。
- physical device／stylus／Safari／Firefox／30-minute memoryが未検証なら、完成UIとは呼ばない。

### Audio

- Audio UIはAUDIO-200のcanonical state、AUDIO-210のevent graph、AUDIO-220のPINNED lock、AUDIO-230のprofile projectionに依存する。
- Audio flagがOFFのDOM markupをCurrent Audio製品入口とみなさない。
- 録音・AudioContext・native outputを追加する場合は `audio-250`以降の候補として、AUDIO-240 gateと別に資格化する。

## 5. Blocking dependencies for Game completion

`GAME-350`はGame-nativeのcompletion gateで、Core Shell route、server-authorized Registry provider、Storage materializer、real device/provider qualificationを内部に再実装しない。これらは `SITE-400` と `WP-900`以降の責務である。

現状は次のため `NOT READY`。

- Game Studio routeはCore ShellでComing Later。
- GAME-340はtyped revision／lock境界であり、実Asset blob・Registry providerの証明ではない。
- Browser preview evidenceはisolatedであり、native runtime／gamepad／profilerではない。

## 6. Cross-product readiness table

| Flow | 実装依存 | UI依存 | 現在 |
| --- | --- | --- | --- |
| Draw → Asset | Draw Project、Definition draft、Registry validation | Asset panel、region／pivot／animation editor | `PARTIAL` |
| Asset → Game | registered Asset Revision、owner/project/hash/license | Game Asset browser、scene placement、Inspector | `PARTIAL` |
| Audio → Game | AudioRevision、event graph、lock | Audio assignment／marker／preview | `PARTIAL` |
| Draw + Audio → Game Package | Game project、both locks、manifest、license snapshots | package diagnostics、build progress | `PARTIAL` |
| Package → Market | Product、rights、entitlement、private object、download | listing/review/purchase | current Market path `IMPLEMENTED`; new bridge `PARTIAL` |
| Project → Social | public URL、Post、OGP、moderation、notification | feed/detail/comment | current source `IMPLEMENTED`; DB state `UNTESTED` |
| Project ↔ PiXiSYNC | operation、revision/order、checkpoint、session | collaboration surface | current V1 source `IMPLEMENTED`; legacy shared UI `DISABLED` |

## 7. Unresolved dependency decisions

1. Current DrawとDraw2のProject/PXD adapterをどの時点で統合するか。
2. Audio production routeを作る前に、AUDIO-240 gateをどのBrowser/device/provider evidenceで満たすか。
3. Game StudioをSITE-400のShellへ接続する時のRegistry／Storage owner。
4. Current Market／Social／PiXiSYNCを新Core compositionへ接続するか、既存経路を維持しadapterだけ設けるか。
5. `audio-250`〜`audio-330`を正式Roadmapへ昇格する条件。
