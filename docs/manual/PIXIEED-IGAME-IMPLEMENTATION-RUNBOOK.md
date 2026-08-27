---
runbook_id: PIXIEED-IGAME-001
status: ACTIVE_INTERNAL_SLICES
updated: 2026-08-25
coordinator: SOL_MAX_READ_ONLY
implementer: LUNA_MAX
reviewer: TERRA_READ_ONLY
state_writer: OWNER_AUTHORIZED_INTEGRATOR
implementation_started: true
registry_activation: EXISTING_PACKAGE_SCOPE
authority:
  - docs/decisions/ADR-20260825-IGAME-PIXEL-RPG-FIRST.md
  - docs/decisions/ADR-20260825-IGAME-GENERAL-RUNTIME.md
  - 03_PRODUCTS/PIXIGAME_SPEC.md
  - 09_ROADMAP/WORK_PACKAGES/GAME-300.md
  - 09_ROADMAP/WORK_PACKAGES/GAME-310.md
  - 09_ROADMAP/WORK_PACKAGES/GAME-320.md
  - 09_ROADMAP/WORK_PACKAGES/GAME-330.md
  - 09_ROADMAP/WORK_PACKAGES/GAME-340.md
  - 09_ROADMAP/WORK_PACKAGES/GAME-350.md
---

# PiXiEEDstudio iGAME Luna Implementation Runbook

## Purpose and current truth

このRunbookは、SOLが構築したiGAME実装ContextをLunaへ渡すための指示書である。今回はOwnerの実装許可を受け、
既存のGAME-350/SITE-400の書き込み境界内で、最初の内部スライスを実装する。新しいRegistry package IDの追加、
commit、push、deployは行わない。

SOLはread-only coordinatorとして提案、依存関係、契約、review判定を返す。文書、Registry、Queue、
Stateへ実際に書くのはOwnerが許可したIntegratorだけであり、SOL自身は書き込まない。

公開名と新しい契約名は `PiXYNC` に統一する。既存コード、保存データ、URL、migration、旧Evidence内の
`PiXiSYNC` / `PiXSYNC` は互換識別子としてのみ読み、専用migrationとrollbackなしにrenameしない。

現状は次の通りである。

| 領域 | 再利用する現状 | 未成立の製品証拠 |
|---|---|---|
| GAME-300 | Project / Scene / Entity / Component / Behavior IR / Journal | 実Studioからの一貫した編集経路 |
| GAME-310 | Semantic Input Action | 実keyboard/touch/gamepad、focus所有権 |
| GAME-320 | Runtime SnapshotとSave State分離 | 実Browser Runtime Host、resource cleanup |
| GAME-330 | BuildPlan、provenance、lock | 実Web artifactと公開経路 |
| GAME-340 | iDRAW/iAUDIO LIVE・PINNED参照 | 実Registry provider経路 |
| GAME-350 | 5レール、local persistence、local fake PiXYNC | real provider、recovery、device、production資格 |

`COMPLETE_CANDIDATE` は製品完成ではない。iGAME完成は、RPG Golden Projectを実Studioで作成し、
保存・再読込・Preview・PiXYNC・Web公開まで各Gateの証拠がそろった時だけ判定する。

これは初期リリースの完成判定であり、最終製品のジャンル範囲をRPGへ固定するものではない。長期的には
GAME-350 Runtime Module境界へAction、Shooter、Racing、Rhythm、3D、Open World、Onlineなどを追加し、
各Moduleの未実装範囲を`FOUNDATION`/`PLANNED`として明示する。

## Product outcome

最初に完成させるのは「UnityやUnrealの全機能」ではなく、次の一続きの体験である。

```text
RPG template
  → map / player / NPCを配置
  → 移動と衝突
  → 会話とswitch
  → BGM / SEを配置
  → Play / Stop / Restart
  → Save / Reload
  → PiXYNC共同編集
  → Web preview / publish
```

目標は、初めての利用者が5分以内に「移動でき、NPCと話し、音が鳴る」RPGを再生できること。
高度な機能はこの経路を速くする場合だけ追加する。

## Architecture invariants

### 最初に固定する4 public contracts

1. `GameProjectState`
   - Project、Scene、Entity、Component、Behavior、revision、dependency lockの唯一の編集正本。
2. `RuntimeSnapshot`
   - `GameProjectState`から生成する不変Preview入力。Runtime Save StateとProject Stateを分離する。
3. `AssetBinding`
   - iDRAW/iAUDIOのAsset ID、Revision ID、Hash、license、provenance、`LIVE`/`PINNED`。
4. `PiXYNCGameJournal`
   - operation ID、base/after revision、ordering、authority、ACK、reconnect、rollback、mode isolation。

これらをC0で固定するまで並列実装を始めない。UI、Renderer、Audio Host、PiXYNCはこのContractを
直接書き換えず、CommandまたはProjectionとして接続する。

### 責務分離

```text
GameProjectState + Journal             canonical authoring truth
              ↓ snapshot compiler
Immutable RuntimeSnapshot              preview input
       ┌──────────┼──────────┐
Update/Input    Renderer     Audio Host
fixed step      Canvas2D     iAUDIO playback owner
       └──────────┼──────────┘
             Runtime events

PiXYNC Transport ← committed Game Journal metadata / revision / hash only
Asset Registry   ← iDRAW / iAUDIO AssetBinding resolution outside game tick
```

- Runtime coreはDOM、Canvas、AudioContext、Storage、Networkを直接所有しない。
- PreviewはProject Journalを書き換えない。RestartはRuntimeだけ、Undo/RedoはAuthoringだけへ作用する。
- iGAMEはiDRAWのpixel、iAUDIOの音源設定を編集しない。参照、配置、再生Cueだけを所有する。
- UIの選択、zoom、panel幅、折りたたみ、beginner/advanced表示はlocal workspace stateであり同期しない。
- Build、公開、再現Testは必ず`PINNED`。`LIVE`はAuthoring Preview専用。

## UX operating model

### 初回5分フロー

| 時間 | 操作 | 表示するもの |
|---|---|---|
| 0:00–0:30 | RPG templateを選択 | template 4種と短い説明だけ |
| 0:30–1:30 | mapとplayerを置く | Viewport、必要Asset、次の操作1件 |
| 1:30–2:30 | NPCと会話を追加 | NPC Inspectorと3段カード |
| 2:30–3:30 | 宝箱またはswitchを追加 | 条件と結果だけ |
| 3:30–4:00 | BGMまたはSEを置く | 関係するAudio trackだけ |
| 4:00–5:00 | Play→Stop→Save→Reload | Runtime状態と編集状態を明確に分離 |

空のInspector、空のTimeline、未使用Panelを初回から並べない。「次にやること」は常に1件だけ表示し、
操作完了時に自動で次へ進む。Guideはdismissでき、dismiss状態はlocalに保持する。

### 5レールの固定責務

| Rail | 常時置く要素 | Contextで切り替える要素 | 禁止 |
|---|---|---|---|
| R1 Action | Save、Undo/Redo、Play/Stop、PiXYNC | Build validation、error count | 同じ画面の再生Button重複 |
| R2 Hierarchy | Scene/Entity tree | 検索、Prefab、event target | 第二のHierarchy state |
| R3 Viewport | Edit/Play surface | grid、collision guide、camera guide | Preview pixelを原本化 |
| R4 Inspector | 選択対象の主要3項目 | Component詳細、Asset revision | iDRAW/iAUDIO原本編集 |
| R5 Timeline | Event/Animation/Audio | 選択対象に関係するtrack | Draw/Audio editorの複製 |

R2またはR3で対象を選ぶと、R4とR5は同じcanonical selectionを投影する。NPCならR4へ会話条件、
R5へ会話EventとSEだけを出す。InspectorとTimelineは別のデータを保存しない。

### No-code behavior

標準UIは自由Node Graphではなく、次の3段カードにする。

```text
いつ       プレイヤーが触れた
条件       スイッチ「door」がOFF
何をする   会話「最初の案内」を開始
```

カードはCanonical Behavior IRへ決定論的にcompileする。未入力、型不一致、参照切れはPlay前に
該当RailへfocusできるErrorとして示す。自由Graphや任意Scriptは上級者向け将来拡張であり、
初回Packageへ入れない。

### 操作感

- `Space`: Play / Stop。ただしInput、Select、Dialog、IME編集中は文字入力を優先する。
- `Cmd/Ctrl+S`: Save。
- `Cmd/Ctrl+Z`: Authoring Undo、`Shift+Cmd/Ctrl+Z`: Redo。
- `Esc`: Preview停止、Flyoutを閉じる、または選択解除をContext順に1件だけ処理する。
- `Enter`: 現在のFieldまたはCardを確定する。
- Play開始後はViewportへfocus、Stop後は直前の編集focusへ戻す。
- Buttonは最初のClickで反応し、focus取得だけでClickを消費しない。
- Errorは「何が、どこで、どう直すか」と対象RailへのActionを表示する。
- Beginner/Advancedは同じProjectの表示密度だけを変え、データ形式を分岐させない。

### Accessibility acceptance

- R1→R2→R3→R4→R5の予測可能なkeyboard focus順。
- Play、Save、Error、PiXYNC状態を文字、Icon、live regionで通知し、色だけへ依存しない。
- text scaling、reduced motion、light/darkで意味と配置を維持する。
- desktop/tablet/mobileでdocument overflow 0。scrollは所有Panel内だけ。
- icon-only controlはaccessible name、tooltip、shortcut、disabled reasonを持つ。

## Lightweight and creation-efficiency strategy

### P0: correctness before optimization

- Canonical identity、revision、authority、LIVE/PINNED、Journal、ACK/order、cleanupを先に固定する。
- PiXYNCはoperation metadata、revision、hash、ACKだけを送り、raw snapshot、blob、pointer、previewを送らない。
- Asset Registry解決、PiXYNC受信、snapshot compileはgame tick外で行う。

### P1: measured optimizations

- Fixed timestepでSimulationとRenderを分離する。
- 32×32と64×64 sparse chunkを同じFixtureで測定し、良い方だけ採用する。
- Viewportと隣接ringだけを常駐させ、空chunkと画面外chunkを保持しない。
- Atlasはasset revision/hash単位で共有し、Entityはatlas regionを参照する。
- Base Snapshot + entity/component/chunk deltaを使い、全Project JSON cloneを減らす。
- RenderItem、InputEvent、AudioCueだけをpool化し、Canonical objectと履歴はpool化しない。
- Runtime、Input、Canvas2D、最小manifestを先にloadし、Editor、Build、durable PiXYNCを必要時にloadする。

### P2: measurement-gated options

WebGL2、WebGPU、Worker、OffscreenCanvas、Wasm、SharedArrayBufferは、同じFixtureでCanvas2Dの
主要budgetを満たせない証拠が出た時だけ候補にする。技術導入自体を進捗として数えない。

### 新しい制作効率案

1. **Intent Recipe**
   - 「話せるNPC」「鍵付き宝箱」「Scene移動」のRecipeを選ぶと、必要Entity、Component、3段Card、
     default collisionを1 Command Groupとして生成する。Undoは1回。
2. **Play from Selection**
   - 選択中Scene/Entity近傍からPreviewを始め、全Projectを毎回起動しない。正規Buildは全体で検証する。
3. **Live Revision Impact Preview**
   - iDRAW/iAUDIOのLIVE更新を即採用する前に、寸法、frame、anchor、duration、hashの影響を表示し、
     CompatibleならPreviewだけ更新、破壊的ならReview待ちにする。
4. **Context Asset Shelf**
   - 選択対象で使えるiDRAW/iAUDIO AssetだけをR4/R5近傍に表示し、巨大なAsset Browserを常設しない。
5. **Error-to-Fix Navigation**
   - Build/Play Errorから該当Entity、Card、Trackへ移動し、修正後に同じSnapshot条件で再試行する。
6. **Ephemeral Presence Lane**
   - PiXYNCのcursor/presenceはJournalと分離した破棄可能な低頻度laneにし、作品データと履歴を汚さない。

## Proposed execution DAG

候補IDは既存Packageの内部Acceptance IDとして扱う。RegistryのFuture Sequenceを無断で拡張せず、
GAME-351相当の最初のPlayable SliceはGAME-350の既存書き込み境界内で実装する。

| Node | Depends | Luna deliverable | Exit evidence |
|---|---|---|---|
| C0 Contract freeze | GAME-350 | 4 public contracts、ID coverage、Context SHA | SOL review、diff 0またはdocs-only |
| GAME-351 Playable Slice | C0 | RPG template、map/player/NPC、movement/collision、Play/Stop/Restart、Journal | isolated Test + local browser vertical slice |
| SITE-400 iGAME extension | C0 | feature-flagged route、create/open/reload、real Registry provider | route browser Test + flag rollback |
| GAME-352 RPG Core | GAME-351 | 3段Card、Dialogue、Switch/Variable、Item/Quest、Save Point | deterministic BehaviorIR + save/reload |
| GAME-353 Cross-tool | GAME-352 + SITE extension + GAME-340 | Timeline、BGM/SE、LIVE/PINNED、PiXYNC recovery | two-client + reconnect + source non-mutation |
| GAME-354 Publish | GAME-353 + Market boundary | Web manifest、preview URL、provenance、explicit composition | artifact/hash/license + browser playback |
| Qualification | GAME-354 | browser/device/performance/security/recovery | Terra review; missing evidence remains UNTESTED |

最短local playable経路は `C0 → (GAME-351 ∥ SITE extension) → GAME-352 → GAME-353`。
GAME-354、Native、Market remote purchase、production migrationは別の資格Gateとする。

## Parallel execution protocol

### Wave 0: SOL proposal + Owner-authorized Integrator

- SOLはread-onlyでContract名、schema version、Acceptance ID、DAG、exclusive write setを監査する。
- Owner-authorized Integratorだけが承認済みproposalを文書、Registry、Queue、Stateへ反映し、Context SHAを生成する。
- Registry/Queue/Stateのwrite scopeはLunaへ渡さない。

### Wave 1: two disjoint Luna tracks

- Track A: `GAME-351`純粋Core、Fixture、targeted Test。
- Track B: `SITE-400 iGAME extension` feature-flagged composition/route。
- `pixiedraw2/index.html`、`pixiedraw2/src/draw2-entry.ts`、`pixiedraw2/deno.json`、`dist/**`は
  Integrator専有とし、両Lunaは書かない。

### Wave 2: RPG Core

- Behavior IR schema/compilerを直列で固定する。
- その後、Dialogue/ConditionとItem/Questをdisjoint pathで並列化する。
- Save State integrationとpublic exportはIntegratorが直列でまとめる。

### Wave 3: cross-tool

- Track A: iDRAW/iAUDIO bindingとTimeline。
- Track B: PiXYNC ordering/reconnect/rollback。
- 共通AssetBindingとPiXYNCGameJournalを変更する必要が出た場合は両方を停止し、SOLへ戻す。

### Review

- Lunaは自分のPackageを完成承認しない。
- Integratorがtargeted Testとbrowser vertical sliceを1回まとめて実行する。
- Terraが実diff、negative case、Evidence境界をread-onlyで1回監査する。
- 同一categoryの重大不具合が2回出たら、小修正を続けず`STOP_DESIGN_GATE`とする。

## Candidate package contexts

### GAME-351 internal sub-slice (within GAME-350)

```yaml
objective: RPG templateから移動と衝突が動くPlayable Sliceを作る
reads:
  - pixiedraw2/src/game/game-300/**
  - pixiedraw2/src/game/game-310/**
  - pixiedraw2/src/game/game-320/**
  - pixiedraw2/src/game/game-350/**
owns:
  - pixiedraw2/src/game/game-350/**
  - pixiedraw2/tests/game-350/**
  - pixiedraw2/benchmarks/game-350/**
  - docs/contracts/GAME-350-*.md
  - docs/inventory/game-350-*.json
note:
  - GAME351-* acceptance IDs identify this internal slice; no new Registry package is created in this wave.
forbidden:
  - 00_START_HERE/**
  - pixiedraw2/index.html
  - pixiedraw2/src/draw2-entry.ts
  - pixiedraw2/deno.json
  - pixiedraw2/dist/**
acceptance:
  - GAME351-TEMPLATE-001
  - GAME351-PLAYABLE-001
  - GAME351-JOURNAL-001
  - GAME351-NONINTRUSION-001
budget: <=500 changed lines, <=4 implementation files, <=2 retries
```

### SITE-400 iGAME extension

```yaml
objective: feature flag内でiGAME route、create/open/reload、real Registry providerを接続する
reads:
  - pixiedraw2/src/game/game-350/**
  - pixiedraw2/src/platform/site-400/**
  - docs/contracts/SITE-400-SERVER-AUTHORIZED-REGISTRY-PROVIDER.md
owns:
  - pixiedraw2/src/platform/site-400/**
  - pixiedraw2/tests/site-400/**
  - docs/contracts/SITE-400-IGAME-*.md
  - docs/inventory/site-400-igame-*.json
forbidden:
  - 00_START_HERE/**
  - pixiedraw2/index.html
  - pixiedraw2/src/draw2-entry.ts
  - pixiedraw2/deno.json
  - pixiedraw2/dist/**
acceptance:
  - SITE400-IGAME-ROUTE-001
  - SITE400-IGAME-REGISTRY-001
  - SITE400-IGAME-CROSSFLOW-001
  - SITE400-IGAME-FLAG-ROLLBACK-001
budget: <=500 changed lines, <=4 implementation files, <=2 retries
stop_if:
  - feature flag OFFで現行routeが変わる
  - permission不一致をclient fallbackで通す
  - provider unavailable時にlocal stateを正本化する
rollback: feature flag OFFと直前のaccepted provider revision
```

### GAME-352

```yaml
objective: 3段CardをBehaviorIRへcompileし、RPG stateを保存・復元する
owns:
  - pixiedraw2/src/game/game-352/**
  - pixiedraw2/tests/game-352/**
  - pixiedraw2/benchmarks/game-352/**
  - docs/contracts/GAME-352-*.md
  - docs/inventory/game-352-*.json
acceptance:
  - GAME352-BEHAVIOR-001
  - GAME352-RPG-STATE-001
  - GAME352-SAVE-001
  - GAME352-NONINTRUSION-001
stop_if:
  - Project StateとRuntime Save Stateが混ざる
  - compile結果が非決定的
  - 任意code実行が必要になる
```

### GAME-353

```yaml
objective: iDRAW/iAUDIO TimelineとPiXYNC recoveryをsource非破壊で統合する
owns:
  - pixiedraw2/src/game/game-353/**
  - pixiedraw2/tests/game-353/**
  - pixiedraw2/benchmarks/game-353/**
  - docs/contracts/GAME-353-*.md
  - docs/inventory/game-353-*.json
acceptance:
  - GAME353-TIMELINE-001
  - GAME353-CROSS-TOOL-001
  - GAME353-PIXYNC-001
  - GAME353-RECOVERY-001
stop_if:
  - raw asset bytesまたは全snapshotを同期する
  - iDRAW/iAUDIO原本を変更する
  - duplicate/out-of-order/replayを受理する
```

### GAME-354

```yaml
objective: reproducible Web preview/publishと明示的Market compositionを作る
owns:
  - pixiedraw2/src/game/game-354/**
  - pixiedraw2/tests/game-354/**
  - pixiedraw2/benchmarks/game-354/**
  - docs/contracts/GAME-354-*.md
  - docs/inventory/game-354-*.json
acceptance:
  - GAME354-WEB-MANIFEST-001
  - GAME354-HANDOFF-001
  - GAME354-PROVENANCE-001
  - GAME354-MARKET-BOUNDARY-001
stop_if:
  - hash/license/lock不一致
  - unlisted assetをpackageへ含める
  - native engine compileを未検証でPASS扱いする
```

## Performance budgets

次は開始時baseline測定後に確定する候補値であり、現時点のPASS主張ではない。

| Metric | Desktop candidate | Mobile candidate |
|---|---:|---:|
| initial Play interactive p95 | <= 1000 ms | <= 1500 ms |
| runtime step p95 | <= 4 ms | <= 6 ms |
| input-to-visible p95 | <= 24 ms | <= 32 ms |
| normal Long Task | 50 ms超を発生させない | 50 ms超を発生させない |
| Stop後のresource cleanup | 1秒以内にbaselineへ戻る | 1秒以内にbaselineへ戻る |

Fixtureは256×256、512×512、1024×1024のsparse/dense map、1000 timeline item、100 composite、
10,000 eventを含む。Cold/Warm、Chromium/Safari/Firefox、PiXYNC reconnect、asset revision更新、
30分Previewを分けて記録する。未実測は`UNTESTED`。

## Required negative and recovery tests

- stale revision、hash/license/lock不一致、missing asset、dependency cycleをfail closedする。
- Play中のincoming LIVE revisionを安全境界まで保留し、失敗時は直前のvalid revisionへ戻す。
- Stop/project switchでRAF、timer、listener、worker、AudioNode、transport、AbortControllerを解放する。
- PiXYNC duplicate/out-of-order/replay、disconnect、late ACK、authority lossで履歴を壊さない。
- Save→ReloadでProjectを復元し、Runtime state、selection、panel stateを混入させない。
- iGAME操作でiDRAW pixel、iAUDIO track setting、Market/Commerce stateを変更しない。
- disabled iGAME flagで現行iDRAW/iAUDIO routeと既存Projectを変えない。

## Luna prompt contract

各依頼には次を省略せず含める。

```text
Objective
Canonical contract and schema version
Exact read set
Exclusive write set
Forbidden paths and behaviors
Required positive, negative, and recovery behavior
Acceptance IDs
Commands: T0 syntax/schema, T1 targeted, T2 integration owner, T3 browser, T4 qualification
Performance budget and fixture
Non-intrusion boundaries
Stop conditions and rollback point
Evidence level: ISOLATED / LOCAL_BROWSER / REAL_PROVIDER / DEVICE / PRODUCTION
Return format: changed files, commands+exit codes, evidence, unresolved UNTESTED
```

曖昧な「Unity級にする」「高性能にする」「RPG Maker風にする」は実装Promptに使わない。操作時間、
Contract、state ownership、failure、budget、viewport、evidenceを具体化する。

## Activation gate

次のすべてを満たすまでLuna実装を開始しない。

1. Ownerがこの方向と候補DAGを承認する。
2. SOLが4 public contracts、Acceptance ID coverage、exclusive scopeをread-onlyで承認する。
3. Owner-authorized Integratorが文書とContext SHAを固定する。
4. Registry/Queueへ開始するPackageを1件だけ登録する。並列Waveの場合は、1つの明示的parallel groupと
   そのdisjoint leafを同じ承認で登録する。group表現をRegistry schemaが扱えない場合は直列実行する。
5. exclusive write setが既存dirty worktreeと衝突しないことを確認する。
6. baseline failure identityと最初のrollback pointを記録する。

最初の実装候補は`C0 → GAME-351`である。自動開始しない。
