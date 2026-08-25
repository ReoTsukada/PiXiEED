# PiXiEED Timeline Model

調査日: 2026-08-20
目的: DrawのTimelineを中心に、AudioのtimebaseとGameのruntime tickを混同せず、Cross-modeの時間・順序・Preview semanticsを整理する。

## 1. Canonical Draw model

PiXiEEDrawの特殊モデルは次である。

```text
Layer row × Frame column = Cel cell
                              ↓
                       Raster / empty / hold / linked reference
```

`Cel` は単なる表示カードではなく、`(layerId, frameId)` の構造上の編集単位。Canvasで編集するRaster、Timelineで選択するCell、Undo/Commandで保存する変更は同じProject／Revisionへ到達する。

### 1.1 Draw entities

| Entity | Meaning | State |
| --- | --- | --- |
| `LayerRow` | layer id、order、visibility、group、metadata | selected／hidden／locked／reordered |
| `FrameColumn` | frame id、order、duration、tag membership | selected／active／duplicated／removed |
| `CelCell` | layer×frameのintersection、Raster reference／empty／hold／linked | empty／editable／linked／cleared |
| `TimelineTag` | frame range／name／playback semantic | draft／saved |
| `TimelineMarker` | frame position、label、kind、cross-tool reference | created／moved／removed |
| `OnionNeighborhood` | previous／next frame relation、opacity/display settings | enabled／disabled／projected |
| `PlaybackProjection` | current frame、loop、speed、preview state | stopped／playing／paused |
| `TimelineWindow` | mounted frame/layer range、virtualization bounds | mounted／scrolled／lazy |

根拠: `pixiedraw2/src/draw2-timeline.ts`、`draw2-creator-features.ts`、
`docs/contracts/DRAW-130-TIMELINE.md`、`docs/contracts/WP-130-TIMELINE-STRUCTURE.md`。

## 2. Timeline commands

| command | Target | Canonical effect | Workspace-only effect |
| --- | --- | --- | --- |
| `timeline.frame.add` | Frame column | 新Frame／Cell構造を追加 | scroll／selection/focus |
| `timeline.frame.duplicate` | Frame column | frame/cel contentをcommandで複製 | selection移動 |
| `timeline.frame.remove` | Frame column | Frameと該当Cellを削除 | confirmation／focus restore |
| `timeline.layer.add` | Layer row | LayerとCell rowを追加 | row scroll |
| `timeline.layer.reorder` | Layer row | order mutation command | drag preview |
| `timeline.layer.toggle` | Layer row | visibility mutation | row visual state |
| `timeline.cel.select` | Cell | active layer/frameを解決 | highlight／Canvas focus |
| `timeline.cel.clear` | Cell | Raster／cel stateをclear | confirm／undo hint |
| `timeline.cel.link` | Cell | linked cel bindingを作る | link indicator |
| `timeline.tag.set` | Frame range | tag metadata | tag editor sheet |
| `timeline.onion.toggle` | Timeline | visual setting／preview state | opacity/neighbor UI |
| `timeline.playback.toggle` | Timeline | playback intent／current frame projection | transport UI |
| `timeline.marker.set` | Frame | marker metadata／cross-tool reference candidate | marker list |

## 3. Selection and context

Timeline selection is a `Context`, not only a highlight.

```text
No selection
  → Frame selected
  → Layer selected
  → Cell selected (Layer × Frame)
  → Range selected (Frame range / multiple Cells)
  → Edit session (Canvas or Timeline command)
```

Context actions must be deterministic:

- Cell selected: edit, clear, duplicate frame, link, split/hold if supported, show properties.
- Frame selected: add／duplicate／remove, tag range, playback start.
- Layer selected: add／reorder／visibility／opacity／group.
- Range selected: tag／export／asset definition candidate.
- No selection: only global project／timeline settings.

MobileではCellのtap、long-press、drag、range selectionの競合を明示する。Canvasの一指DrawとTimeline操作を同じpointer ownerにしない。

## 4. Mobile Timeline presentation constraints

| Constraint | Required behavior |
| --- | --- |
| Canvas-first | Timelineは初期表示でCanvasを奪わず、必要時のBottom Sheet／bounded panelにする。 |
| Cell target | 44px前後のtouch target基準、row/cell accessible name、selected stateを持つ。実機は未検証。 |
| Internal scroll | Frame columns／Layer rowsのscrollはTimeline owner内だけ。page scrollは禁止。 |
| Focus | Cell action後にCanvas／Cell／toolbarのどこへ戻るかを記録する。 |
| Keyboard | hardware keyboardではframe/layer navigation、software keyboard／IMEではshortcutを抑止する。 |
| Gesture | Canvasのtwo-finger pan/pinchとTimeline scrollを別ownerにする。 |
| Virtualization | 長いFrame×Layerを全mountしない。visible windowをboundedにする。 |
| Context menu | remove／clear／linkなどの破壊操作は理由・confirm・Undo導線を持つ。 |

## 5. Audio time model

AudioはFrame×LayerのCellではない。

```text
AudioProject
  → Timebase (sample/time/tempo/meter/snap)
  → Track lane × time range = Clip
  → Waveform bins / PianoRoll notes / Markers / Events
```

`AUDIO-200`のTimebase／Waveform、`AUDIO-210`のEvent binding、`AUDIO-230`のbounded projection、
`AUDIO-240`のcompletion gateを根拠とする。

Audio Timelineは次の意味を持つ。

- TrackはLayerの代替ではなく、Clip／Mixer／routingのowner。
- Clipはsource AudioRevisionのrange projection。trim／split／fadeはAudio command。
- MarkerはGame event／Draw tagとのbridge候補だが、直接同じCellを共有しない。
- LIVEはpreviewで最新revisionを追える。Package／Market／Game buildはPINNED lock。
- Waveform binsは表示projectionで、canonical audio bytesではない。

## 6. Game time model

Gameの時間はeditor TimelineのCellではなく、Runtimeのdeterministic tickである。

```text
GameProject revision
  → RuntimeProjectSnapshot (locked assets)
  → RuntimeSession (mode / tick / frame / input sequence / world)
```

`GAME-320`のtick／frame／RuntimeSaveState、`GAME-310`のordered ActionIdを使う。
Game previewのtickをDraw FrameやAudio sampleに直接同一視せず、Asset／Event／runtime adapterで接続する。

## 7. Cross-mode timeline bridge

| Bridge | Safe shared meaning | Do not share directly |
| --- | --- | --- |
| Draw tag ↔ Audio marker | named time region／event intent | raster cellとaudio sample bytes |
| Draw animation ↔ Game sprite animation | Asset Definition／frame range／pivot／revision lock | Canvas internal layer state |
| Audio event ↔ Game Audio Source | AudioRevision／event id／LIVE/PINNED | AudioContext object／raw blob |
| Draw playback ↔ Game preview | preview intent／asset revision／event sequence | Runtime worldをDraw Projectへ書き戻す |
| Timeline export ↔ Package | canonical manifest／dependency／license snapshot | panel scroll／selection／hover |

## 8. Timeline gaps

- Draw2 Timelineのisolated structureとcurrent Drawのactual persisted timelineの完全互換は未検証。
- Real projectの大規模Frame×Layer、scroll／virtualization、Screen Reader、physical mobileは未検証。
- Audio timebaseとDraw frame rate／Game tickの変換契約は候補であり、同じTimeline UIへ統合する仕様ではない。
- Marker／TagのCross-tool persistenceとPXD／package manifestへの保存責務が未確定。
