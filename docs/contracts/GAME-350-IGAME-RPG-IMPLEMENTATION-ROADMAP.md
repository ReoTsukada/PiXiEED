# iGAME 自由制作コア + RPGテンプレート 実装ロードマップ

更新日: 2026-08-27
対象: `pixiedraw2/src/game/`、`pixiedraw2/src/workspace/`、
`pixiedraw2/src/pixync/`、`pixiedraw2/src/wp180-workspace-ui.ts`

## 目的

iGAMEのコアはUnityのようにジャンルを固定せず、2Dアクション、RPG、シューティング、
レーシング、リズム、オンラインなどを同じScene / Object / Component / Behaviorモデルで
作れるようにする。RPG向けのキャラクター、武器、防具、スキル、ステータス、タイル、
ダメージ、UIは、必要な時だけ複製する任意のテンプレートパックとして積み上げる。
実装は制作画面から保存、Canonical Project、Preview Runtimeまで通る縦切りで進める。

GameはScene、GameObject、Component、配置、挙動、Buildを編集する。iDRAWとiAUDIOは
素材の所有者であり、iGAMEは固定した`assetId / revisionId / contentHash`を参照するだけとする。
参照した素材のピクセル、波形、元プロジェクト、編集履歴はGameの書込み対象にしない。

## 完了済みの土台

GAME-350 Phase 1として、次を実装・検証済みとする。

- Project / Scene / Entity / parent / Active / ComponentのCanonical境界
- HierarchyとInspector、Scene専用SVG View、Objectの選択・配置
- Transform、Sprite参照、Collider、Rigidbody、Character Controller、Camera、Behavior
- Physics2Dの固定step、重力、Layer Mask、Material、Block / Triggerイベントの基礎
- RPGのPlayer / NPC / Map / CameraとPlay / Stop / Restart
- Editor状態とRuntime状態、描画編集履歴と再生状態の分離
- iDRAW / iAUDIOの参照専用境界

## 今回追加した自由制作コア

- Game Template Catalogをジャンル別に検索できる。`CORE`は全ジャンル共通、`RPG`は任意のRPGパック、
  `ACTION / SHOOTING / RACING / RHYTHM`は各ジャンルの制作部品として扱う。
- テンプレートはGame側のScene ObjectまたはGame Dataへ複製する。適用後は名前、数値、選択値をGame側で編集できる。
- テンプレートの適用・解除はGameの履歴、Persistence、Canonical editorTimelineへ保存する。
- iDRAW / iAUDIOの参照は引き続き`assetId / revisionId / contentHash`だけを保持し、原素材のbytes・編集履歴は保持しない。
- テンプレートを使わない空白Gameも同じコアで作成できる。RPGテンプレートは初期導線の一つに限定する。

## 実装段階

### Stage 1: RPGマップ編集（今回の縦切り）

目的: 画面上でマスを編集し、Playerが通れる場所と壁を作れるようにする。

実装内容:

1. Game所有のTilemap Documentを定義する。幅、高さ、タイルサイズ、セルの通過属性、
   Trigger属性、任意の素材参照メタデータを持つ。セルに素材bytesを持たせない。
2. `create / setCell / clearCell / toggleSolid / setTrigger`を不変操作として提供する。
   座標外、重複、壊れた参照、過大なマップを拒否する。
3. GameEditor Track、Canonical Scene、Persistence、Build manifestに同じDocumentを含める。
4. Scene Viewでマップセルを選択・編集し、Inspectorでも選択セルの属性を変更できるようにする。
5. Physics2D adapterがDocumentのsolidセルとTriggerセルをRuntimeへ投影する。

完了条件:

- Scene Viewで1セルを変更すると、その変更が一度だけProjectへ保存される。
- 再読込後もセル、壁、Triggerが一致する。
- Playerはsolidセルで停止し、Triggerセルは停止せずイベント対象になる。
- GameからiDRAW / iAUDIOの内容を編集する経路が増えていない。

不具合ゲート: 型エラー、stateHash不一致、重複保存、座標ずれ、Play中のEditor汚染、
素材境界違反のいずれかが出た場合は次のStageへ進まない。

### Stage 2: Object / Component制作

目的: RPGツクールのイベント配置の分かりやすさと、Unity 2DのComponent構成を両立する。

実装内容:

- Transform、Sprite、Collider、Rigidbody、Character Controller、Cameraの編集導線を整理
- Colliderのoffset、mask、material、Rigidbodyのdrag、freeze、collision detectionを正本化
- Objectテンプレート、複製、削除、親子化、Prefab設計ゲートを安全に追加
- Sprite / Audioは参照選択、表示・再生設定のみGame側で変更可能にする

完了条件: Inspectorの値がCanonical Scene、保存、Preview、Build manifestで一致する。

### Stage 2A: ジャンル非依存テンプレートカタログ（追加済み）

目的: 初心者は既定部品を選ぶだけで始められ、上級者はGame側の値とComponentを拡張できるようにする。

実装内容:

- 汎用2D Character、Projectile、Damage / Trigger Zone、HUDを用意する。
- RPGのプレイアブルキャラクター、武器、防具、スキル、状態効果、キャラクターステータス、
  タイル定義、ダメージ定義、HUDをGame Dataテンプレートとして用意する。
- Action、Shooting、Racing、Rhythmの最小制作部品も同じカタログへ登録する。
- Scene ObjectテンプレートはHierarchyへ新しいGame Objectを追加し、Game Dataテンプレートは選択Objectへ任意に関連付ける。
- 全テンプレートはスカラー値とComponent Blueprintに限定し、iDRAW / iAUDIOのソースデータを入力できないようにする。

完了条件:

- カタログから必要なテンプレートだけを適用し、空白GameにもRPG Gameにも同じ操作で追加できる。
- 適用した値が再読込後も保持され、Canonical Projectとテンプレート一覧が一致する。
- テンプレートを外してもScene Objectを暗黙に削除せず、破壊的操作を避ける。
- 不正なテンプレートID、型、値、対象Trackを保存前に拒否する。

### Stage 3: ノーコードイベント / A-B分岐 / Save

目的: イベントを選び、条件を組み合わせ、A/B分岐を視覚的に組めるようにする。

実装内容:

- Input Action、Interact、Collision、Trigger、Scene Startを共通Triggerにする
- Switch、Variable、条件、A/B分岐、Dialogue、Move、Sound、Scene Change、Saveを提供
- Event Sheet / Node Graph / bounded codeを同じBehavior IRへコンパイルする
- RuntimeのSave StateとEditor履歴を分離する

完了条件: 「NPCに話しかける → 条件でA/B → 会話・フラグ・セーブ」がPreviewで再現できる。

### Stage 4: RPGコンテンツ

順序はDialogue / Variables → Inventory / Items → Quest → Battle → UI / Menu → Audio /
Animationとする。各機能は個別のCanonicalデータ、Preview、Save migration、回帰テストを持つ。

### Stage 5: Runtime / Build / 販売

- iGAME内のPlayerでプロジェクトを起動する
- Web Previewと外部出力の契約を分ける
- Android等の外部BuildはRegistry認証、固定revision / owner / tenant、課金済み権限を確認してから生成する
- 外部EngineのImport / Compile、実機、Store公開、Provider / DB接続は接続環境で別受入とする

### Stage 6: 拡張ジャンルと品質保証

RPG基盤を壊さず、2Dアクション、シューティング、レーシング、リズム、オンライン同期へ
runtime profileと機能パッケージを追加する。3Dや高度な物理を先に混ぜず、既存RPGの回帰、
性能、保存互換性、権限境界を毎Stage確認する。

## 1 Stageの進め方

各Stageは次の順序を固定する。

1. 契約と不変操作を先に実装する。
2. Persistence / Canonical / Runtimeの順に接続する。
3. UIを接続する。
4. 型チェック、単体テスト、永続化・境界テストを実行する。
5. 1440×900、1024×768でブラウザ操作を行い、保存後の再読込まで確認する。
6. そのStageで発生した不具合を修正し、同じ検証を再実行する。
7. 全条件が通るまで次Stageへ進まない。

## 今回の実行範囲

このターンではStage 2Aを実装し、Stage 1のマップ編集と同じ保存・Canonical・ブラウザ受入へ接続する。
次はStage 3のノーコードイベントとRPGコンテンツの実データ接続を進める。外部Registry、DB、
PiXYNCの実サービス、Native実機、正式公開環境は接続されていないため、それらを完了扱いにしない。
