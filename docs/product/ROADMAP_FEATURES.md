# PiXiEED Roadmap Features

調査スナップショット: 2026-08-20
この文書は既存Roadmap・Registry・作業パッケージをFeature inventoryへ翻訳したもの。新しいRoadmapを追加するものではない。

## 1. Authority と状態の読み分け

優先順位は `WORK_PACKAGE_REGISTRY.json` → package definition → `AGENT_EXECUTION_FRAMEWORK.md` → Queue mirror → active handoff → historical artifacts。

現在の記録には複数の時点・意味がある。

| Source | 記録 | 解釈 |
| --- | --- | --- |
| `00_START_HERE/WORK_PACKAGE_REGISTRY.json` | `authority.currentReadyPackage = SITE-460` | machine authority上の現在Ready候補。 |
| `00_START_HERE/IMPLEMENTATION_QUEUE.yaml` | `current_ready_package: SITE-460`, `COMPLETE_CANDIDATE` | human-readable mirror。Registryと整合。 |
| `.codex/PIXIEED_IMPLEMENTATION_STATE.yaml` | current `SITE-460`, `COMPLETE_CANDIDATE`; production semantic `PENDING_UNTESTED` | 現在のhandoff状態。 |
| `PIXIEED_LEARNING_CONTEXT.md` | `current_package: SOCIAL-430`, `IN_PROGRESS` | 学習Contextのスナップショット。上記より下位の文脈情報として保持。 |
| `docs/inventory/pixiedraw2-release-readiness-20260813.json` | `GAME_350_QUALIFICATION_BLOCKED` | 2026-08-13時点の履歴証拠。後続状態で上書きせず、未解決の資格化項目を示す。 |

従って、`COMPLETE` は「作業パッケージ内の実装／targeted evidenceが完了」の意味であり、
`PRODUCT_COMPLETE`、`RELEASE_QUALIFIED`、本番公開済みを意味しない。

## 2. Catalog

| Phase | Package | Registry status | Feature scope | Product status | Major evidence gap |
| --- | --- | --- | --- | --- | --- |
| Foundation | `FP-004`〜`FP-007` | 完了／履歴・一部統合 | durable event、storage/privacy、reproducible build | `PARTIAL` | production-equivalent DB／Storage／clean-repo qualification |
| Core | `CORE-100`〜`CORE-120` | `COMPLETE`／Gate | composition、adapter conformance、convergence | `PARTIAL` | isolated adapterからcurrent providerへの接続 |
| Draw2 | `FP-006`, `DRAW-110`〜`DRAW-170` | Registry `COMPLETE` | raster、selection、timeline、export、legacy、runtime、advanced workspace | `PARTIAL` | real PXD、production adapter、physical device、Safari/Firefox、long session |
| Audio | `AUDIO-200`〜`AUDIO-240` | `COMPLETE` | project、event、package/license、workspace、completion gate | `PARTIAL` | current route、AudioContext/native hardware、browser/device、production package |
| Game | `GAME-300`〜`GAME-340` | `COMPLETE` | project、input、runtime、build、cross-tool | `PARTIAL` | current Studio route、Registry/Storage、device/gamepad、runtime/build artifact |
| Game gate | `GAME-350` | `COMPLETE_CANDIDATE`／package file `IN_PROGRESS` | completion authority and product path | `PARTIAL` | qualification matrix remains `NOT_READY` until shared integration evidence |
| Site / cross-tool | `SITE-400` | `COMPLETE_CANDIDATE`／package file `IN_PROGRESS` | Core Shell route、provider、tool bridge | `PARTIAL` | current route replacement is not authorized; provider未資格 |
| Market | `MARKET-410` | `COMPLETE_CANDIDATE` | rights、commerce、legacy mapping | `IMPLEMENTED` current route + `PARTIAL` new Core | live checkout／webhook／entitlement/RLS |
| Direct Work | `WORK-420` | `COMPLETE_CANDIDATE` | billing、work order、events | `PARTIAL` | current route/provider/legal |
| Social | `SOCIAL-430` | `COMPLETE_CANDIDATE` | social content boundary、events、moderation | `PARTIAL` | current migrations/RLS/provider/route compatibility |
| Ops | `OPS-440` | `COMPLETE_CANDIDATE` | admin、analytics、ads、consent boundary | `PARTIAL` | legal consent、provider、production authorization |
| Platform | `PLATFORM-450` | `COMPLETE_CANDIDATE` | platform composition、rollback、browser/PWA boundary | `PARTIAL` | deployment identity、provider、native qualification |
| Site usability | `SITE-460` | `COMPLETE_CANDIDATE` | local browser site connection | `PARTIAL` | local browser only; production/native/device untested |
| Native | `NATIVE-500`〜`NATIVE-520` | `PLANNED` | host boundary、desktop distribution、mobile store | `PLANNED` | ADR、signing、archive、physical device、store policy、rollback |
| Qualification | `WP-900`〜`WP-990` | `PLANNED` | G0〜G9 release evidence | `PLANNED` | all missing external and real-device evidence |
| Cutover | `CUT-001` | `BLOCKED` | explicit production cutover | `BLOCKED` | explicit Owner authorization; deploy/publish/migrate forbidden |

## 3. Draw roadmap detail

| Package | Feature | Classification |
| --- | --- | --- |
| `DRAW-110` | Palette、Pen／Eraser／Fill、sparse raster、dirty tile、local journal seam | `PARTIAL` product / isolated implementation |
| `DRAW-120` | rectangle／ellipse／lasso／color selection、clipboard、transform、cancel | `PARTIAL` product / isolated implementation |
| `DRAW-130` | Layer／Frame／Cel、Timeline、Onion、Tag、Playback | `PARTIAL` product / isolated implementation |
| `DRAW-140` | PNG／PXD export、preview、format registry | `PARTIAL` product / lazy isolated path |
| `DRAW-150` | Legacy PXD v1/v2 read-only adapter、unknown/preserve/warning | `DEPRECATED` compatibility boundary, not new UX core |
| `DRAW-160` | Draw→Play preview、asset bridge、runtime reference | `PARTIAL` isolated cross-tool |
| `DRAW-170` | pattern/stamp/mirror/dither/grid/reference/slice/tilemap、advanced workspace | `PARTIAL` isolated; market preparation only |
| Future candidate | export worker／full compositor／real device／stylus／long session | `CANDIDATE` qualification work, not a UI feature |

## 4. Audio roadmap detail

| Package | Feature | Classification |
| --- | --- | --- |
| `AUDIO-200` | Project／Track／Clip／AudioRevision／Waveform／Timebase、IndexedDB／OPFS boundary | `PARTIAL` isolated Core |
| `AUDIO-210` | Draw／Game event binding、LIVE／PINNED、safe hot swap、preview/commit/cancel | `PARTIAL` isolated Core |
| `AUDIO-220` | package、license/provenance snapshot、THIN／PORTABLE、PINNED lock | `PARTIAL` isolated Core |
| `AUDIO-230` | Desktop／Tablet／Mobile projection、safe-area、sheet、bounded waveform/timeline | `PARTIAL` host-neutral UX contract |
| `AUDIO-240` | completion gate、cross-tool rollback、browser/device/production evidence gate | `PARTIAL` gate implementation; not release qualification |
| `audio-250`〜`audio-270` | browser recording、render、freeze | `CANDIDATE`; source exists but no approved completion package in registry |
| `audio-300`〜`audio-330` | automation、routing、effects、mastering | `CANDIDATE`; future expansion, no current entry |

## 5. Game roadmap detail

| Package | Feature | Classification |
| --- | --- | --- |
| `GAME-300` | GameProject／Scene／Entity／Component／Prefab／BehaviorIR／Revision | `PARTIAL` isolated Core |
| `GAME-310` | semantic ActionMap、keyboard／touch／gamepad／custom control | `PARTIAL` isolated Core |
| `GAME-320` | Runtime snapshot、preview／play／pause／stop／step、Save State、checkpoint | `PARTIAL` isolated Runtime |
| `GAME-330` | BuildPlan、dependency／asset／license locks、provenance、artifact identity | `PARTIAL` isolated build boundary |
| `GAME-340` | Draw／Audio canonical revision binding、LIVE／PINNED／REVIEW／FORKED、preview events | `PARTIAL` isolated cross-tool |
| `GAME-350` | completion gate、Game Studio state、product path | `CANDIDATE` / qualification not ready |
| Future | current Core Shell Studio route、Registry provider、Storage materializer、native playtest、profiler | `PLANNED` under `SITE-400`／`WP-920`〜`WP-970` |

## 6. Disabled and future boundaries that must remain separate

| Boundary | Classification | Reason |
| --- | --- | --- |
| Current PiXiEEDraw replacement by Draw2 | `PLANNED` | Canonical decisions explicitly keep current Draw until Draw2 acceptance. |
| Legacy shared-project feature | `DISABLED` | `SHARED_PROJECTS_ENABLED=false`; old source and data/URL dependencies remain possible. |
| Multi-canvas path | `DISABLED` / `CANDIDATE` | `MULTI_CANVAS_FEATURE_ENABLED=false`; no removal decision. |
| New Core Shell Draw／Audio／Game route | `CANDIDATE` | route chunk and local projection exist, but current shell is noindex/default-off/Coming Later. |
| Market / Social / Direct Work new Core path | `CANDIDATE` | typed composition exists; current route/data/provider is separate. |
| Native / Store | `PLANNED` | Browser/PWA first; signing and store submission are out of scope. |

## 7. Roadmap completion rule for UI work

Draw／Audioの新モバイルUIは、Roadmapの `AUDIO-230`／`DRAW-170` を「見た目がある」だけで完了扱いにしない。
Project・Entity・Command・Context State・Panel ownership・mobile keyboard gap・device evidence・cross-mode
roleがこの棚卸しと整合してから、UI設計へ進む。
