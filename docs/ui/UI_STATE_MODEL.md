# PiXiEED UI State Model

調査日: 2026-08-20
目的: Projectのcanonical stateとWorkspace／UIのlocal stateを分離し、Draw／Audio／Gameで共通利用できるContext Stateを定義する。

## 1. State layers

```text
Canonical Project State
  Identity → Project → Revision → Asset/Audio/Game content → Command/Journal
        ↑                                      ↓
  Permission / Entitlement                 Preview / Package / Sync

Workspace State (local presentation)
  Device Profile → Mode → Surface → Panel/Sheet → Selection → Focus → Zoom/Scroll
        ↓
  Command availability / contextual actions / accessibility / keyboard alternatives
```

`WorkspaceState` は `Project`、`PXD`、PiXiSYNC canonical operation、Market authorityへ書き込まない。
`RuntimeSession` はGame authoring stateへ書き込まない。Audio preview／Draw playbackも同じ分離を守る。

## 2. Context State Inventory

| State dimension | Values / fields | Owner | Affects | Current / future | Evidence |
| --- | --- | --- | --- | --- | --- |
| Product lifecycle | current／isolated／future／disabled／deprecated | audit/governance | visibility、copy、entry | `Current + Future` | this audit、Registry、flags |
| Project lifecycle | new／loading／ready／dirty／saving／saved／offline／conflict／recovering／error | Core／Project adapter | save、undo、export、switch | `PARTIAL` | current Draw autosave、WP-030、Draw2 persistence |
| Active mode | DRAW／ANIMATE／ASSET／AUDIO／GAME／EXPORT | Workspace | primary surface、panel set、command scope | Draw2 DOMに存在、Audio/Game flags off | `pixiedraw2/index.html` |
| Device profile | desktop／tablet／mobile／unknown | device adapter | geometry、touch target、panel presentation | `PARTIAL` | `FP-006`, `AUDIO-230` |
| Viewport geometry | width、height、safe-area、text scale、IME inset、orientation | host adapter | Canvas／Sheet／timeline size | `PARTIAL`, physical untested | `fp-006/device-profile.ts`, `audio-230/geometry.ts` |
| Surface | Canvas／Timeline／Inspector／Library／Preview／Runtime／Package | Workspace | active context | `PARTIAL` | Draw2 slots、AUDIO/GAME studio models |
| Panel visibility | mounted／open／closed／lazy／blocked／error | Panel owner | work/decode/network permission | `PARTIAL` | `wp180-workspace-contracts.md`, `AUDIO-230` |
| Panel scroll | internal scroll offset、virtual range、owner panel | Panel owner | only owning panel scrolls | contract | `WP-180`, `FP-006` |
| Selection | none／single／multi／range／invalid／stale | Mode Core + Workspace projection | contextual actions、Inspector | `PARTIAL` | Draw2 selection、Game studio select、Audio clip state |
| Edit session | idle／preview／committable／committed／cancelled／interrupted | Mode Core | Undo boundary、recovery | `PARTIAL` | Draw2 selection、FP-006 stroke recovery |
| Playback / preview | stopped／ready／playing／paused／looping／pending／failed | Preview owner | transport、editing lock、safe hot swap | `PARTIAL` | Draw2 timeline、AUDIO-210、GAME-320 |
| Audio transport | stop／record-armed／recording／loop、BPM、meter、snap | Audio workspace | Audio controls／keyboard | disabled in Draw2 by audio flag | `pixiedraw2/index.html`, AUDIO-240 |
| Runtime session | preview／playing／paused／stopped、tick、frame、scene、input sequence | Game Runtime | playtest controls、Save State | isolated | GAME-320 |
| Asset binding | LOCAL_DRAFT／VALIDATED／REGISTERED／LIVE／PINNED／REVIEW／FORKED／STALE | Asset／bridge | Game/Audio preview/package | `PARTIAL` | DRAW-170、AUDIO-210/220、GAME-340 |
| Permission | unknown／allowed／denied／revoked／quarantined | server authority | command availability、publish、download | `PARTIAL`; caller UI not authority | FP-001、FP-003AA、Market contracts |
| Sync / connectivity | local／offline／pending／connected／suspended／conflict／confirmed | PiXiSYNC / provider | Saved label、retry、join/leave | current V1 + new isolated | `pixisync-current-baseline.md` |
| Focus / modality | canvas／panel／sheet／dialog／menu／command palette／IME／restoring | Workspace interaction | shortcuts、pointer ownership | `PARTIAL` | FP-006、WP-090、WP-180 |
| Input ownership | Draw／Pan／Pinch／PanelScroll／Timeline／RuntimeControl | interaction arbiter | pointer routing, stroke cancellation | contract | `FP-006-RECOVERY.md` |
| Keyboard / IME | none／hardware keyboard／software keyboard／composition／input focused | host + UI | shortcut suppression、geometry | `PARTIAL`, manually unmeasured | `wp190-responsive-safety.json` |
| Safety / risk | normal／destructive confirm／publish confirm／billing confirm／rollback | command registry | icon-only prohibition、confirmation | contract | WP-080、FP-006 |
| Error | validation／stale／hash mismatch／permission／offline／provider／unsupported | Core + projection | recovery action、non-destructive fallback | `PARTIAL` | Core contracts, AUDIO/GAME gates |
| Save / export state | not-started／validating／in-progress／complete／cancelled／failed | Project/package owner | progress、download、retry | current Draw + isolated package | DRAW-140、AUDIO-220、GAME-330 |

## 3. State transition rules

### 3.1 Project

```text
NEW → LOADING → READY → DIRTY → SAVING → SAVED
                         ├→ OFFLINE/PENDING → SAVED or CONFLICT
                         ├→ RECOVERING → READY
                         └→ ERROR → retry / preserve draft
```

`Saved` はlocal／remote／confirmedのどれかを明示する。Offlineやpendingを単にSavedと表示しない。

### 3.2 Edit session

```text
IDLE → PREVIEW → COMMITTABLE → COMMITTED
  └──────────────→ CANCELLED / INTERRUPTED
```

一つのStrokeは一つのUndo/Command境界。二つ目のtouch pointerが入った時は未commitのDrawをcancelしてPan／Pinchへ移る。Panel／TimelineのpointerはCanvas strokeを作らない。

### 3.3 Asset binding

```text
LOCAL_DRAFT → VALIDATED → REGISTERED → LIVE or PINNED
                                    ├→ REVIEW
                                    └→ FORKED
```

Game／Audio／Marketへ渡す前に必要なstateを満たさない場合はfail-closed。`LIVE`はpreview/bridgeでのみ追従し、Packageは`PINNED`を要求する。

### 3.4 Modal / focus

```text
Canvas → Panel/Sheet → Dialog/Menu/CommandPalette → IME
   ↑          ↓                    ↓                  ↓
 focus restore to valid origin; no page scroll; shortcut suppression
```

Unavailable／disabled targetへfocusを推測で移さない。高リスク操作は名前・理由・確認を持つ。

## 4. Common UI state grammar candidate

| State | Required visible meaning | Forbidden ambiguity |
| --- | --- | --- |
| `READY` | 編集可能、現在Project／Mode、保存状態 | 空のLoading表示をReady扱いしない |
| `DIRTY` | unsaved local change、保存先／retry | remote confirmedと混同しない |
| `OFFLINE` | local保存／pending、未同期 | Saved without qualifier |
| `BLOCKED` | action unavailable、理由、次の確認箇所 | disabled iconだけ |
| `PREVIEW` | sourceを変更しない preview state | edit commitと混同しない |
| `STALE` | revision／hash／bindingが古い | caller claimで黙って上書き |
| `ERROR` | safe fallback、recover／cancel／retry | data lossやsilent reset |
| `COMING_LATER` | future／disabled surfaceであること | Current完成機能のように表示 |

## 5. Current vs Future UI State

| State family | Current source | Future constraint |
| --- | --- | --- |
| Draw current save／PiXiSYNC | `/pixiedraw/` source and V1 flags | Draw2へ統合するまで別State contractを壊さない |
| Draw2 Workspace | local-only / flag off | acceptance後もProject canonical stateとWorkspaceStateを分離 |
| Audio | markup／isolated projection only | Audio routeを追加する前に AudioContext／permission／device Stateを定義 |
| Game | runtime reference only、route Coming Later | Studio editing stateとRuntime stateを別storeにする |
| Market / Social | current route/data | new Core projection is adapter, not automatic replacement |
