# Draw / Audio / Game Mode Feature Matrix

調査日: 2026-08-20
目的: 同じMental Modelを共有しながら、Draw／Audio／Gameで異なるUIを許容するための現状棚卸し。
これはUI実装案ではなく、次の設計で再利用するRole／Context／Stateの台帳である。

## 1. Rules

- **同じMental Model**: `Project → source → edit → inspect → preview → package → share/recover`。
- **同じUIではない**: DrawはCanvas／Cel、AudioはTimebase／Clip、GameはScene／Entityを主語にする。
- **共通Command**: Undo、Redo、Open、Save、Preview、Export、Help、Command Paletteは同じ意味IDを持つ。ただし表示面・ショートカット・タッチ操作はModeごとに変わる。
- **Importance**: `A=主作業／常時発見可能`, `B=頻繁な文脈操作`, `C=専門・低頻度`, `D=将来候補または現在無効`。
- `Current UI` は現行入口または隔離Entryに実際に存在するもの、`Future UI` はcontract／state／Roadmapから要求されるが現行入口で未接続のもの。

## 2. Cross-mode role matrix

| Role / Mental model | DRAW | AUDIO | GAME | Shared semantic | Importance | Current / future |
| --- | --- | --- | --- | --- | --- | --- |
| Projectを開く・作る | Project dialog、Canvasへ | Audio Project／sessionへ | Game Project／Studioへ | `project.open`, `project.create`, `project.switch` | A | Draw current + Draw2 isolated; Audio/Game partial |
| 変更を戻す・保存する | Stroke／Selection／Timeline command、Undo/Redo | Clip／Track／Graph command、Undo/Redo | Scene／Entity／Behavior command、Undo/Redo | `history.undo`, `history.redo`, `project.save`, `recovery.restore` | A | Core contract + current Draw; Audio/Game isolated |
| 主作業面 | Pixel Canvas／viewport | Waveform／Piano Roll／Audio timeline | Scene／Runtime preview | `workspace.primarySurface` | A | Mode-specific; mobileはCanvas/Preview-first候補 |
| sourceを選ぶ | Layer／Frame／Cel／Region | Track／Clip／AudioRevision | Asset／Scene／Entity／Component | `selection.resolve` | A/B | Partial across modes |
| 素材を編集する | Pen、Fill、Transform、Palette | Trim、Split、Fade、Gain、Note | Transform、Component、Behavior | `edit.commit`, `edit.cancel` | A | Draw partial; Audio/Game contract/partial |
| 詳細を調べる | Inspector、Color、Layer properties | Clip／Track／Mixer Inspector | Entity／Component／Input Inspector | `inspector.open`, `inspector.apply` | B | Panel inventory; not one shared UI |
| 時間・順序を扱う | Frame／Cel／Tag／Onion／Playback | Timebase／Clip／Marker／Loop／Tempo | Tick／Runtime step／event sequence | `timeline.move`, `preview.play`, `preview.stop` | A/B | Draw/Audio timeline; Game runtime is separate |
| assetを定義する | selected layer/frame/region/pivot | audio source/revision/event | sprite/audio binding in entity | `asset.define`, `asset.validate`, `asset.pin` | B | Draw/Audio/Game isolated bridge |
| Previewする | animation／Draw→Play | audio playback／loop／meter | runtime playtest／debug | `preview.start`, `preview.pause`, `preview.stop` | A | local Browser evidence only for new paths |
| Package／Exportする | PNG／PXD／GIF／Sprite Sheet | audio package／WAV/OGG/MIDI candidate | Game package/build manifest | `package.validate`, `package.export` | B | current Draw + isolated Audio/Game |
| Rights／licenseを確認する | source/asset provenance | audio license snapshot | game asset locks / package | `rights.inspect`, `dependency.lock` | B/C | Contract-level; Market provider separate |
| Share／Publishする | project/public asset | audio/game package | product/public build | `publish.prepare`, `share.open` | C | Current Market/Social separate; new path future |
| Collaboration | Canvas command/session | Audio operation/session | Game project operation/session | `sync.join`, `sync.confirm`, `sync.recover` | C | PiXiSYNC V1 current source; legacy UI disabled |
| Help／discoverability | tool/shortcut/context help | transport/editor help | Studio guide/action help | `help.open`, `commands.search`, `guide.start` | A/B | Core UI contract; full cross-mode surface partial |

## 3. Mode-specific feature matrix

| Feature family | DRAW | AUDIO | GAME | Data boundary |
| --- | --- | --- | --- | --- |
| Primary unit | Pixel／WriteSet／Tile | Sample／Clip／Waveform bin | Entity／Component／Action | Mode-specific; all refer to Project Revision |
| Structural container | Layer × Frame → Cel | Track × Time → Clip | Scene → Entity → Component | Do not flatten into one generic panel |
| Selection | rectangle／ellipse／lasso／color／opaque | clip range／track／note／marker | scene／entity／component／asset | selection is WorkspaceState until command commit |
| Preview state | playback／onion／mini preview | transport／loop／meter | RuntimeSession／tick／Save State | Preview never mutates authoring state silently |
| Asset reference | definition draft、region、pivot、animation | revision、event、source locator | sprite/audio asset lock | canonical Asset Registry owns identity |
| Time model | integer Frame index＋duration/tag | sample/timebase＋tempo/marker | fixed integer tick＋input sequence | Draw/Audio timeline can align by adapter, not shared cell type |
| Package lock | PXD／export format | PINNED Audio graph/license | BuildPlan／manifest／asset locks | `LIVE` is preview only; package requires `PINNED` |
| Mobile primary surface | Canvas＋essential tool／Sheet | preview＋transport＋contextual track/clip sheet | preview/playtest＋contextual Studio sheet | no page scroll; bounded Panel scroll |

## 4. Status by mode

| Mode | Current product entry | Isolated implementation | Future connection | Overall |
| --- | --- | --- | --- | --- |
| DRAW | `/pixiedraw/` | `pixiedraw2/index.html`, Draw2 Core、Workspace | replace only after acceptance; current Project/PXD/PiXiSYNC compatibility | `PARTIAL` |
| AUDIO | no confirmed current production route | `audio-200`〜`240`、Draw2 Audio markup／projection | current Audio entry、AudioContext/native、package/Market/Game connection | `PARTIAL` |
| GAME | Core ShellのGame StudioはComing Later。公開Playerは`/igame/?product=...` | `game-300`〜`350`、Market Bootstrap、PXD Hash検証、Canvas browser runtime | Studio route、Supabase本番適用、native/runtime/build qualification | `PARTIAL` |

## 5. Design implication

共通化するのは `Command ID`、`Context State`、`Project/Asset/Revision`、`Preview/Recovery` の意味であり、
Tool palette、Timelineのセル、Inspectorの内容、mobile sheetの見せ方ではない。Draw／Audio／Gameを同じカードや同じbottom navigationに押し込まない。
