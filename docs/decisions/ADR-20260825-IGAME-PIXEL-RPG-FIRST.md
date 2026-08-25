# ADR-20260825: iGAMEをPixel RPG制作に特化する

> 長期製品スコープは `ADR-20260825-IGAME-GENERAL-RUNTIME.md` で拡張された。本ADRの「初回リリースを
> RPGへ限定する」判断とPlayable Sliceの順序は有効だが、最終製品をRPG専用に固定する判断ではない。

## Decision

PiXiEEDstudioのiGAMEは、Unity / Unreal Engineの全機能を競う汎用エンジンにはしない。
`Draw → Audio → Game → Play` が一つのプロジェクトでつながる、ブラウザ中心の2DピクセルRPG制作環境として設計する。

勝ち筋は、3D・高度なレンダリング・自由なネイティブコードではなく、次の体験に限定する。

- インストールなしで開始できる
- 5分以内に動く小さなRPGを作れる
- iDRAWのキャラクター・マップ・アニメーションを直接配置できる
- iAUDIOのBGM・SEをタイムラインへ直接配置できる
- 会話、スイッチ、条件、アイテム、クエストをコードなしで組める
- Playを押すだけで現在の編集状態を即時プレビューできる
- 同じプロジェクトをPiXYNCで共同編集できる
- Web公開を標準にし、必要な場合だけUnity / Godot / Unreal向けに受け渡す

## Why this boundary

Unityは2D/3D、マルチプラットフォーム、性能計測、マルチプレイヤー、共同制作までを広く提供する。一方で、初回制作にはエンジン、プロジェクト、アセット、スクリプト、ビルド設定の理解が必要になる。

UnrealはLevel Editor、Blueprint、Sequencer、Details、Outlinerなど非常に強力な制作面を持つが、汎用性が高い分、2D RPGだけを作るには情報量と設定量が大きい。

RPG Makerはイベントを中心に会話・宝箱・バトルなどをコードなしで作れる点が強いが、描画・音楽・ゲーム制作の制作元がPiXiEEDstudio内で同一プロジェクトとして同期されるわけではない。

したがってiGAMEは、Unity / Unrealの広さではなく、RPG Makerの簡単さ、Godotの軽い2D思想、PiXiEEDのDraw・Audio・PiXYNCを一つの制作体験にまとめる。

## Product surface

### 1. プロジェクト開始

最初に選べるテンプレートは4つだけにする。

- RPG：マップ、プレイヤー、会話、アイテム、セーブの最小構成
- MV：背景、キャラクター、カメラ、BGM、イベントをタイムラインで編集
- Action：入力、移動、攻撃、敵、HPを最小構成
- Empty：空のGameProjectから開始

テンプレートはアセットやコードを隠すためのものではなく、最初から動く正規のGameProjectを生成する。

### 2. 5レール

既存のGAME-350契約を土台に、iGAMEの実UIを次の5レールに固定する。

1. Action：保存、Undo/Redo、Preview、Build、PiXYNC
2. Hierarchy：Scene、Entity、Prefab、イベント対象
3. Viewport：マップ編集とPlay Preview
4. Inspector：選択対象のプロパティ、Draw/Audioの参照
5. Timeline：アニメーション、イベント、BGM、SE、マーカー

パネルを増やすのではなく、選択対象に応じてInspectorとTimelineの内容を切り替える。

### 3. ノーコードBehavior

Behaviorは自由なノードグラフから始めず、次の3段カードで作る。

```text
いつ       条件              何をする
プレイヤーが触れた  スイッチがOFF  会話を開始する
アイテムを使った    HPが50未満      HPを20回復する
フレームが到達      常に            SEを再生する
```

内部では既存のBehaviorIRへ変換し、UIとランタイムが別のルールを持たないようにする。高度なグラフ表示は、基本カードが安定した後の上位機能とする。

### 4. Draw / Audio連携

- iDRAWの画像・アニメーションは、`LIVE`参照で制作中の変更をPreviewへ反映する
- Buildでは`PINNED`参照へ固定し、公開中に内容が変わらないようにする
- iAUDIOのBGM・SEは、音声バイトを複製せずasset revision参照としてGame Timelineへ配置する
- DrawとAudioの編集権限は分離し、iGAMEは参照と配置だけを行う
- Previewは不変のRuntime Snapshotを読む。Previewが編集用Journalを書き換えない

### 5. 軽量ランタイム

初期ランタイムは2D専用とする。

- 画面座標はピクセル基準
- タイルはatlasと疎なチャンクで保持
- 画面外チャンクはロードしない
- Canvas2Dを基準にし、演出だけを段階的にWebGL/WebGPUへ移す
- 固定タイムステップで入力・イベント・描画を分離する
- Preview開始時に全プロジェクトを再構築せず、差分スナップショットを適用する
- Audio、Draw、Gameの未使用モジュールは遅延ロードする

性能は「高スペック」という宣言ではなく、次の測定ゲートで判定する。

- 初回Playまでの時間
- 60fps維持率
- 256×256 / 512×512マップのメモリ使用量
- 10,000イベント処理時の長時間タスク
- PiXYNC接続時の編集反映遅延
- 30分Preview時のメモリ増加

## Export policy

Web公開はiGAMEの正規出力とする。Unity / Godot / Unrealは、最初から完全なネイティブプロジェクトを生成するのではなく、現在のENGINE_HANDOFF_V2を使った明示的な受け渡しにする。

受け渡しには、GameProject、BuildPlan、Timeline、asset revision、hash、license、制限事項を含める。ネイティブエンジンのコンパイルや実行をPiXiEED側が成功したとは扱わない。

## Roadmap

### Phase A：Playable Slice

- RPGテンプレート生成
- Scene / Entity / Sprite / Transform / Camera
- マップへのDraw asset配置
- Player移動と当たり判定
- Play / Stop / Restart
- JournalとUndo/Redo

### Phase B：RPG Core

- 会話カード
- Switch / Variable / Condition
- Item / Inventory
- Quest / Flag
- Save Point / Save State
- BGM / SE cue

### Phase C：Authoring Integration

- iDRAW LIVE/PINNED連携
- iAUDIO Track参照
- Timeline編集
- PiXYNCの順序保証、再接続、競合表示
- Draw・Audio・GameをまたぐPreview

### Phase D：Publish

- Web公開
- Preview URL
- asset provenance
- 作品・音源・ゲームのMarket composition
- Unity / Godot / Unreal handoffの実ブラウザ検証

## Non-goals for the first release

- 3Dワールド
- 自由なC++/C#実行
- Unreal相当のMaterial、Niagara、World Partition
- Unity相当の全プラットフォームBuild
- 任意コードをPiXYNCで実行する仕組み

これらを入れると「RPGツクールより簡単」「軽量」「共同制作」という中核価値が失われるため、後から拡張可能なadapter境界に隔離する。

## Acceptance boundary

現在のGAME-350には、純粋な契約と隔離Previewに加え、local 5レールbrowserとfake-authority
二browser E2Eの証拠がある。ただしreal Registry/Draw/Audio provider、real PiXYNC、recovery、
device、productionは`UNTESTED`であり、実iGAME完成ではない。次の実装はPhase AのPlayable Sliceから
開始し、実UI、実Draw/Audio adapter、Project reload、browser runtimeの順に検証する。
