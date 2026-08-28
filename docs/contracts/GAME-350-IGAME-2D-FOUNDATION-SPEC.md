# GAME-350 iGAME 2D制作基盤仕様書

更新日: 2026-08-27
対象: `pixiedraw2/src/game/game-300/`、`pixiedraw2/src/game/game-350/`、
`pixiedraw2/src/wp180-workspace-ui.ts`、`pixiedraw2/src/workspace/game-persistence.ts`

## 1. 目的

iGAMEを、RPGだけの試作画面ではなく、2Dゲームを販売可能な品質まで育てられる
Scene/Component型の制作環境へ拡張する。iDRAWとiAUDIOは素材の作成・編集を担当し、
iGAMEはGameObjectの配置、構造、挙動、参照、再生、Buildを担当する。5レール構成は
維持し、現在のTIMELINEレールは時間編集画面ではなく「ロジック・データ」の制作面として扱う。

## 2. Unity 2Dとの比較

Unity 2Dは、HierarchyでGameObjectを親子管理し、InspectorでComponentを編集し、
Transform、Sprite、Rigidbody 2D、Collider 2D、Trigger、Physics Material 2D、Prefab、
Input、Scene、Play Modeを組み合わせる構成である。Rigidbody 2DはTransformと物理シミュレーション
の間の正本となり、Collider 2Dは形状、Triggerは通過可能なイベント領域を表す。

| 領域 | iGAME現状 | 差分・今回の方針 |
| --- | --- | --- |
| Project/Scene | GAME-300のProject/Scene/Entityを保持 | 既存正本を継続利用し、Scene設定を追加 |
| Hierarchy | 4グループ表示、Object追加、選択は可能 | 親子関係、並び順、複製、削除、Active、循環拒否を追加 |
| Inspector | 名前・種類・役割、Transform/Sprite/Collider/Rigidbody等 | Componentごとの設定を正本化し、入力範囲・重複・不正値を拒否 |
| Sprite/Audio | Draw/Audioを参照専用で配置可能 | Gameは配置・表示・再生設定のみ編集。原素材は書込み不可 |
| Physics 2D | RPGの固定マス衝突と基本Collider/Rigidbody | gravity、fixed step、drag、constraints、material、layer mask、triggerを追加 |
| Runtime | GAME-351のRPG固定ステップ、Play/Stop/Restart | 汎用2Dの決定的stepとCollision/Triggerイベントを追加 |
| Logic/Input | Event Sheet、A/B Graph、bounded code | Collision/Trigger/Inputを同一イベント入口に接続 |
| Prefab | Canonical型にPrefab枠のみ存在 | Phase 1は不正参照を拒否。所有範囲を設計後に安全なInstantiateを追加 |
| Save/History | Game JournalとRuntime状態は分離 | Scene編集だけが履歴へ入り、Play中の物理状態は履歴へ入れない |
| Build/Export | Build境界・外部Player契約あり | 2D基盤を共通Runtimeへコンパイル。Native/Provider接続は別受入 |

## 3. 5レールの責務

| レール | iGAMEで行うこと | 行わないこと |
| --- | --- | --- |
| 作成・テスト | New/Open、保存、Undo/Redo、Play/Stop/Restart、Build | Draw/Audioの原素材編集 |
| シーン階層 | Scene、親子GameObject、Map、Characters、Objects、Systems、Prefab | ピクセル描画、波形編集 |
| シーン表示 | 2D配置、選択、移動、Gizmo、Collider/Trigger可視化、Camera preview | 原素材のピクセル・音波形の編集 |
| オブジェクト設定 | Transform、Sprite参照、Collider、Rigidbody、Material、Camera、Behavior | iDRAW/iAUDIOソースの上書き |
| ロジック・データ | Input、条件、A/B分岐、Collision/Trigger、Variables、Save、参照 | 時間軸を使ったDraw/Audio編集 |

## 4. 今回実装する2D Foundation（GAME-350 Phase 1）

### 4.1 Scene/Hierarchy

- Entityは安定した`entityId`、名前、`parentEntityId`、Active、表示順を持つ。
- SceneはRoot順とEntity一覧を正本とする。親子循環、存在しない親、重複ID、別Sceneの参照を拒否する。
- Rename、Add、Duplicate、Delete、Reparent、Set Activeを不変な編集Commandとして提供する。
- DuplicateはEntity/Component IDを新規発行し、元のPrefab・Asset参照のrevision/hashは複製する。
- Deleteは子を孤児にせず、明示された範囲を原子的に削除する。
- Scene ViewはGame専用のSVG投影面とし、マップ・オブジェクト・Collider/Triggerを表示する。オブジェクトのクリック選択とドラッグによるTransform変更はGame Projectへ一度だけ保存し、iDRAW Canvasを経由しない。

### 4.2 Inspector/Component

最低限のGame Componentは次の通りとする。

- Transform: position、rotation、scale。物理Bodyが有効な場合の実行時TransformはRuntimeが正本。
- Sprite Renderer: iDRAWの参照、visible、sorting layer/order。参照はAsset ID、revision、hashのみ。
- Collider 2D: Box/Circle/Capsule、size/radius、offset、isTrigger、layer、mask、enabled。
- Rigidbody 2D: Static/Kinematic/Dynamic、mass、gravityScale、linear/angular drag、
  freeze position/rotation、collision detection、interpolation、simulated。
- Physics Material 2D: friction、bounciness。値は0以上1以下に正規化する。
- Character Controller: fixed-step移動、speed、step height。RPGテンプレートはこれを利用する。
- Camera 2D: active、zoom、追従対象、world bounds。
- Behavior: Event/Condition/Action/Saveの参照。ユーザーコードはbounded API以外を実行しない。

Componentは同一Entityに同一種別を1つまでとし、Transformは必須とする。Sprite/Audioの
参照先bytes、編集メタデータ、原プロジェクトはGameの保存データに入れない。

### 4.3 Physics 2D

- SceneにPhysics 2D設定を持たせる。初期値はgravity `(0, 9.8)`、fixedDeltaTime `1/60`、
  maxSubSteps `4`、既定material `(friction 0.4, bounciness 0)`。
- 固定stepごとに入力受付 → 力/重力 → 衝突解決 → Trigger/Collision event → 描画用snapshotの順で処理する。
- Dynamicは重力・drag・衝突解決の対象、KinematicはGame/Controller移動の対象、Staticは不動の壁とする。
- Collider同士はlayer/maskが許可した場合のみ判定する。同一Bodyの複合Colliderは自己衝突させない。
- 初期実装はAABBを共通判定にし、Box/Circle/Capsuleは安全なboundへ投影する。判定結果は
  entity IDをソートした決定的な順序で返す。
- Blockは押し戻し、Triggerは位置を止めずイベントだけ発火する。Collision/TriggerのEnter/Stay/Exit
  は将来拡張できるイベント識別子として保持する。
- Runtimeは固定stepの遅延をclampし、1フレームで無制限にstepしない。

### 4.4 Prefab/再利用（Phase 1では設計境界のみ）

- 現行のPrefab型は存在するが、Root Entity、閉包するEntity/Component集合、instance identity、
  override、削除伝播の正本が未確定である。
- そのためPhase 1ではPrefabの作成・Instantiate・一括反映を公開せず、不正なPrefab参照を拒否する。
- Prefabはテンプレート所有範囲とinstance overrideを別途設計ゲートで固定した後、Phase 2で実装する。

### 4.5 Editor/Runtime分離

- EditorのProject/Journalは編集状態の正本、Runtime snapshotは実行時の正本とする。
- Play、Stop、Restart、物理step、Trigger発火、Runtime variable変更はEditor履歴に追加しない。
- Editor commandは`projectId`、`ownerId`、`revisionId`、`baseRevisionId`を検証し、古い・別Project・重複commandを拒否する。

## 5. 実装順序

1. GAME-300のComponent/Scene設定型と検証を拡張する。
2. GAME-350にHierarchy commandとInspector schemaを追加する。
3. GAME-350に決定的Physics 2D step、Collider/Trigger event、Physics Materialを追加する。
4. GAME-351 RPG previewを新しいPhysics 2D adapterへ接続する。
5. Game persistence、canonical store、UI Inspector/Hierarchyへ接続する。
6. Scene/Component/Physics/Runtime/Permissionの順にテストを追加する。
7. Type check、targeted tests、build、1440x900/1024x768のブラウザ確認を行う。

## 6. 受入条件

- 親子追加、移動、複製、削除、Active切替、循環拒否が同じCanonical Projectに保存される。
- Phase 1では不正なPrefab閉包・親子外参照・重複instance IDを拒否し、Prefab操作を未確定仕様のまま実行しない。
- Transform/Sprite/Collider/Rigidbody/Materialの値がInspectorから編集でき、範囲外・重複・参照不一致を拒否する。
- Dynamic bodyがgravityとfixed stepで再現可能に移動し、Static wallで停止する。
- Block接触とTrigger通過が別イベントとして一度ずつ通知され、同じ入力を重複適用しない。
- Play/Stop/RestartとRuntime物理状態がUndo/Redoや保存履歴を汚染しない。
- GameからiDRAW/iAUDIOの原素材を編集・削除できず、参照metadataだけが保存される。
- 既存GAME-350のRPG 42件相当、SITE-400、Draw2の既存テストに新規失敗を増やさない。
- Browser/Native/Registry/DB/Provider/実機は、実測していない限り`UNTESTED`として報告する。

## 7. Phase 1の対象外

Prefabテンプレートの一括反映・override・削除伝播、Polygon/Composite Collider、Joint、Effector、Tilemap編集UI、Animation State Machine、
NavMesh、Particle、オンライン権威サーバー、3D、実機Native Build、外部Provider/DB接続は、
2D Foundationの正本が安定した後の別Phaseとする。これらを未実装のまま「Unity完全互換」や
「あらゆるゲームに対応済み」とは表現しない。

## 8. 参照したUnity公式仕様

- [2D game creation workflow](https://docs.unity3d.com/6000.1/Documentation/Manual/2d-game-creation-wokflow.html)
- [Rigidbody 2D](https://docs.unity3d.com/kr/2018.3/Manual/class-Rigidbody2D.html)
- [Collider 2D](https://docs.unity3d.com/cn/2023.2/Manual/Collider2D.html)
- [Physics Material 2D](https://docs.unity3d.com/cn/2022.3/Manual/class-PhysicsMaterial2D.html)
