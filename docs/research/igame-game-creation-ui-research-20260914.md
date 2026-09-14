# iGAME ゲーム制作画面・制作方法の比較調査と改善案

**調査日:** 2026-09-14  
**対象:** PICO-8 / GB Studio / RPG Maker / Construct 3 / GDevelop / GameMaker / Flowlab / Scratch / Godot / Unity  
**目的:** PiXiEEDの「難しい操作や設定なしで、描いたものを置いて遊べる」iGAMEの画面構成と制作手順を定める  
**対象デバイス:** 今回はPC版。タブレット・モバイルの画面構成は別工程とする。

---

## 1. 結論

PiXiEEDの初心者向けiGAMEは、汎用ゲームエンジンの画面を小さくしたものではなく、**一つのステージを直接触ってゲームを組み立てる制作面**にするのがよい。

ユーザーが常に理解する概念は、次の4つだけに絞る。

```text
素材を選ぶ → ステージへ置く → 触ったときの動きを選ぶ → Play
```

内部では現在のScene、Entity、Asset Revision、Behavior、Runtime Snapshot、Timeline、権利情報を保持する。ただし、それらを常時レールやInspectorとして露出させない。

### 推奨する初心者画面

```text
┌──────────────────────────────────────────────────────────────┐
│ PiXiEED / Project       Undo   Redo       ● 保存済み   ▶ Play │  上部Action
├───────────────┬──────────────────────────────────┬───────────┤
│ 素材を置く     │                                  │ 選択中だけ │
│               │          ステージ / Scene         │ 動作カード │
│ 絵             │                                  │           │
│ 音             │     ドラッグで配置・直接移動      │ 歩く       │
│ 用意された素材 │                                  │ 触れたら   │
│               │                                  │ 話す       │
├───────────────┴──────────────────────────────────┴───────────┤
│ Scene 1   Scene 2   ＋                                       │  Scene strip
└──────────────────────────────────────────────────────────────┘
```

- 中央のステージを最大にする
- 左は「素材を置く」ための引き出し。常時大きく表示しない
- 右は何も選択していないと空ける。選択時だけ、意味のある動作カードを表示する
- 下部はSceneの切り替えだけに使い、ゲーム制作中は大きなTimelineを常設しない
- Play中はステージを広げ、編集用の左右UIを縮退させる

現在のiGAMEにある5レールの内部契約は残してよい。ただしPC初心者表示では、複数のレールを次の4面へ投影する。

| 内部の責務 | 初心者画面での見せ方 |
| --- | --- |
| Action | 上部の固定Action rail |
| Hierarchy / Asset source | 左の素材Drawerと、必要時だけ開く一覧 |
| Viewport / Scene | 画面中央のステージ |
| Inspector / Behavior | 選択対象のContext card |
| Timeline | アニメーション・音・イベントを選択した時だけ開く |

これは機能を削除する案ではない。**常時表示する面を減らし、対象を直接操作した時だけ詳細面を投影する案**である。

---

## 2. 調査対象ごとの画面構成と制作方法

### 2.1 PICO-8：一つの制作環境に素材と実行を閉じ込める

PICO-8は、コード、スプライト、マップ、SFX、音楽を同じカートリッジ内で扱う。公式マニュアルでは、Escでコンソールとエディタを切り替え、上部のモードタブまたはショートカットでCode / Sprite / Map / SFX / Musicを切り替える構成になっている。[PICO-8公式マニュアル](https://www.lexaloffle.com/dl/docs/pico-8_manual.html)

画面の特徴は、次のように「モードは複数だが、制作物の所属先は一つ」という点である。

```text
┌────────────────────────────┐
│ Console / Code / Sprite ... │  モード切替
├────────────────────────────┤
│ 選択中の編集面              │
│ SpriteならCanvas、MapならMap│
├────────────────────────────┤
│ Sprite navigator / status    │
└────────────────────────────┘
```

スプライト編集では、クリック・ドラッグで描き、選択範囲に対してコピー、カット、貼り付け、反転、回転などをショートカットで行う。Map編集ではスプライトを選んでマップへ塗り、選択範囲をコピーして貼り付ける。音楽はSFXをパターンとして並べ、パターンのループ・停止を上部の少数ボタンで制御する。[PICO-8編集ツール](https://www.lexaloffle.com/dl/docs/pico-8_manual.html)

**PiXiEEDへの採用:**

- iDRAW / iAUDIO / iGAMEを別製品のように扱わず、同じProjectの制作面として扱う
- Playを別のビルド工程にせず、現在のProjectをすぐ試す
- 直接操作とショートカットを優先する
- ただし、PICO-8のコード入力はPiXiEEDの初心者導線には持ち込まない

### 2.2 GB Studio：PiXiEEDに最も近い「配置中心」の構成

GB StudioのProject Editorは、Game Worldを中心にScene、Actor、Triggerを組み合わせる。Editor ToolsからSelect / Add / Erase / Collision / Colorを切り替え、選択したSceneやActorの内容は右側のEditor Sidebarに表示される。[GB Studio Project Editor](https://www.gbstudio.dev/docs/project-editor/)

Project Viewは、Game Worldだけでなく、Sprites、Images、Music、Sound Effects、Palettes、Dialogue Review、Settingsへ切り替えられる。つまり、**中央の世界編集面と、素材ごとの編集面が同じProjectに属する**。[GB Studio Project Editor](https://www.gbstudio.dev/docs/project-editor/)

制作手順は次の通りである。

1. Sceneを追加し、背景を設定する
2. Actorをステージへ置く
3. Triggerを範囲として置く
4. 選択中の対象に対して、右側からOn Init / On Interact / On Hit / On Updateなどのイベントを追加する
5. Playで確認する

Actorは位置、Sprite Sheet、移動速度、アニメーション速度、Collision Groupなどを持つが、これらは選択中のActorに対して表示される。Scene typeはTop Down 2D、Adventure、Point and Click、Shoot 'Em Upなど、ゲームの挙動を決める入口になっている。[GB Studio Actors](https://www.gbstudio.dev/docs/project-editor/actors/)、[GB Studio Scene Types](https://www.gbstudio.dev/docs/project-editor/scenes/types/)

**PiXiEEDへの採用:**

- 初期のiGAMEはGame Worldを中心にする
- iDRAW素材をActor / Object / Tileとしてそのまま配置する
- 選択中だけ、動き・接触・会話などのContext cardを出す
- Collisionは別モードを常設せず、ステージ上の可視オーバーレイとして切り替える
- SceneとTriggerは現在の内部モデルに接続する

### 2.3 RPG Maker：マップを直接塗り、イベントを対象に紐付ける

RPG Maker MZのMain Windowは、Menu Bar、Toolbar、Tile Palette、Map List、Map View、Status Bar、Layer buttonで構成される。Tile Paletteからタイルを選び、Map Viewへ塗るという役割分担が明確である。[RPG Maker MZ Basic Editor Controls](https://rpgmakerofficial.com/product/MZ_help-en/01_03.html)

Map Eventは、イベント編集モードでマップをダブルクリックして作成し、置いたアイコンをドラッグして移動する。右クリックから編集、カット、コピー、貼り付け、削除、Transfer / Door / Treasure / InnなどのQuick Event Creationを実行できる。[RPG Maker Map Event Creation and Controls](https://rpgmakerofficial.com/product/MV_Help/page/01_09_02.html)

イベントの詳細は強力だが、条件、変数、Self Switch、Actor、Trigger、Contentsが増えると複雑になる。[RPG Maker Map Event Settings](https://rpgmakerofficial.com/product/MZ_help-en/01_09_03.html)

**PiXiEEDへの採用:**

- TileはPaletteからステージへ直接描く
- 空いている場所をダブルクリックして、会話・入口・取得・チェックポイントを作る
- 頻出処理はQuick Actionとしてプリセット化する
- 条件・変数・ページなどの高度な仕組みは「詳細」へ隠す
- Map / Eventというモード切替を常時見せず、ステージ上の対象を選択したときの操作で表現する

### 2.4 Construct 3：中央のLayoutとEvent Sheetを分ける

Construct 3は、Main menu、Main toolbar、View tabs、Main view、Properties bar、Project bar、Layers barというIDE構造を持つ。Layout Viewはオブジェクトを置く画面、Event Sheet Viewは条件とアクションを編集する画面である。[Construct 3 Interface](https://www.construct.net/en/make-games/manuals/construct-3/overview/the-interface)

Layoutはレベル、メニュー、タイトル画面などの事前配置されたオブジェクト集合であり、LayoutごとにEvent Sheetが紐付く。イベントは条件とアクションで構成され、条件で対象インスタンスを絞り、アクションを実行する。[Construct 3 Layouts](https://www.construct.net/en/make-games/manuals/construct-3/project-primitives/layouts)、[Construct 3 Events](https://www.construct.net/en/make-games/manuals/construct-3/project-primitives/events)

**強い点:** 表現力と拡張性が高い。  
**弱い点:** 初心者が最初からEvent Sheet、Properties、Project Barを理解する必要がある。

**PiXiEEDへの採用:**

- 内部のBehavior表現やEvent Sheet相当の構造は参考にする
- 初心者画面ではEvent Sheetを常設しない
- 「プレイヤーが触れたら」「クリックされたら」「一定時間たったら」のカードから開始する
- 高度な条件とアクションは、選択中オブジェクトの「詳細な動き」から開く

### 2.5 GDevelop：Project Manager / Scene / Events / Previewを分離する

GDevelopのProject editorsは、Project manager、Scene editor、Events editor、Preview、Debuggerに分かれる。Scene editorはオブジェクトを配置する場所、Events editorはノーコードでゲームロジックを作る場所、Previewはいつでも実行する場所である。[GDevelop Interface](https://wiki.gdevelop.io/gdevelop5/interface/)

Scene editorにはObjects panel、Instance Properties panel、Objects Groups panel、Instances panel、Layers panelがある。オブジェクトを選ぶと、位置、サイズ、レイヤー、回転、アニメーションなどのインスタンス情報が表示される。[GDevelop Scene Editor](https://wiki.gdevelop.io/gdevelop5/interface/scene-editor/)

EventsはConditionsとActionsで構成され、条件が成立した時に対象オブジェクトへアクションを行う。プログラミング知識がなくてもイベントを作れるが、対象選択や実行順序は学習要素になる。[GDevelop Events](https://wiki.gdevelop.io/gdevelop5/events/)

**PiXiEEDへの採用:**

- Project / Scene / Previewという分離は保つ
- ただし初心者には一画面の中でSceneとPreviewを連続させる
- GDevelopのイベント概念は内部Behaviorへ取り込み、UIは短い日本語カードにする
- Debuggerは通常画面から隠し、エラーが発生した時だけ該当対象へ戻す

### 2.6 GameMaker：ObjectとInstanceを分ける

GameMakerでは、Objectがゲーム内の振る舞いを持つテンプレートで、Roomへ置かれる実体はInstanceである。ObjectとInstanceを分けることで、同じObjectを複数の場所に置きながら、個別の位置や状態を持たせられる。[GameMaker Objects and Instances](https://manual.gamemaker.io/monthly/en/Quick_Start_Guide/Objects_And_Instances.htm)

GML Visualは、コードを書かずにAction blockをつなぐ仕組みで、左のToolboxから中央のWorkspaceへブロックをドラッグする。検索、Favorites、折りたたみ、Undo/Redoを備える。[GameMaker GML Visual Overview](https://manual.gamemaker.io/monthly/en/Drag_And_Drop/Drag_And_Drop_Overview/DnD_Overview.htm)

**PiXiEEDへの採用:**

- iGAMEで「置いた素材」と「再利用できるアセット定義」を分ける
- 同じキャラクターを複数配置しても、元Assetと配置Instanceを混同しない
- ただし初心者画面でObject / Instanceという用語は出さず、「素材」と「置いたもの」と表示する
- ノードグラフではなく、最初は一列のBehavior cardで開始する

### 2.7 Flowlab：レベル編集とビジュアルロジックを直接つなぐ

Flowlabはブラウザ内のゲーム制作者で、レベル上のオブジェクトを選び、EditからBehaviorsを開く。Behavior editorは左にBehaviorの一覧、右にノードを配置して接続するWorkspaceを持つ。[Flowlab Behavior Guide](https://flowlab.io/resources_behaviors)

FlowlabはPlayを押すと編集面からすぐ実行でき、Background / Game World / User Interfaceの3レイヤー、ピクセル描画、フレームアニメーション、物理、音、ノードロジックを同じ環境に持つ。[Flowlab Features](https://flowlab.io/features)

**PiXiEEDへの採用:**

- ブラウザ内で編集とPlayを近づける
- 画像を描く場所とゲームへ置く場所を分離しすぎない
- Behavior graphは上級者向けとして残せる
- 初心者には、よく使うノードの組み合わせを「歩く」「追いかける」「触れたら消える」などの一枚カードにする

### 2.8 Scratch：対象を選ぶと、ステージ・見た目・動作が同じ対象に集まる

ScratchのProject Editorは、Stage、Sprite list、Block palette、Coding areaを持つ。公式教材では、Spriteを選び、Stage上の位置を直接動かし、Blockを組み合わせて動作を追加する流れが示されている。[Scratch公式教材](https://resources.scratch.mit.edu/www/lessons/en/Scratch_BuildTheChange_FacilitatorGuide.pdf)、[Scratch Getting Started](https://scratch.mit.edu/help/studio/tips/howto/get-started-10/)

**PiXiEEDへの採用:**

- 画面上の対象を選ぶと、その対象の見た目・音・動作を続けて設定できるようにする
- Assetを選んでから別パネルを探すのではなく、対象の周辺に次の行動を出す
- ただしScratchのブロック列を全ユーザーに要求せず、PiXiEEDではプリセットカードを主役にする

### 2.9 Godot：Scene tree / Viewport / Inspectorの分離

Godotの2D workspaceは、Scene selector、main toolbar、2D viewport、左右のDockで構成される。FileSystem dockからノードをViewportへドラッグして配置でき、Scene treeでノードの階層を管理する。[Godot 2D Introduction](https://docs.godotengine.org/en/stable/tutorials/2d/introduction_to_2d.html)

キャラクターはAnimatedSprite2D、CollisionShape2Dなど複数のNodeを組み合わせ、InspectorでScaleやShapeを設定する。[Godot First 2D Game - Player Scene](https://docs.godotengine.org/en/stable/getting_started/first_2d_game/02.player_scene.html)

**PiXiEEDへの採用:**

- Sceneと配置の考え方は参考にする
- iGAMEではNode追加やCollisionShapeの組み立てを自動化する
- Inspectorで手動設定する代わりに、Pivot・当たり判定・Animator相当をAsset作成時に自動生成する
- 階層が必要な場合だけ、隠しHierarchyとして開く

### 2.10 Unity：強力な受け渡し先だが、初心者の制作画面にはしない

Unityの2D制作は、基礎、スクリプト、Sprite、環境、キャラクターアニメーション、グラフィックス、2D物理、音、UI、最適化、公開という順序で理解する構成になっている。[Unity 2D Game Creation Workflow](https://docs.unity3d.com/ja/current/Manual/2d-game-creation-wokflow.html)

TilemapはGrid、Tile Asset、Tile Palette、Brush、Tilemap Colliderという流れで構成される。[Unity Tilemap Workflow](https://docs.unity3d.com/ja/2021.2/Manual/Tilemap-workflow.html)

アニメーションはAnimation ClipをAnimator Controllerにまとめて状態遷移を管理する。[Unity Animator Controller](https://docs.unity3d.com/ja/current/Manual/AnimatorControllerCreation.html)

**PiXiEEDへの採用:**

- Unityへ渡すDelivery Artifactには、画像・フレーム・Pivot・Animation・Collider・Manifestを含める
- iGAMEの初心者画面では、Sprite Renderer、GameObject、Animator Controller、Collider Componentを表示しない
- Unity側で必要な複雑さは、エクスポート時に自動生成する
- UnityでのImport / Compile / Playは、PiXiEED側の成功とは別の受入れとして扱う

---

## 3. 画面構成パターンの比較

| パターン | 代表例 | 長所 | PiXiEEDでの扱い |
| --- | --- | --- | --- |
| 一体型モード切替 | PICO-8 | Projectへの所属感が強い、すぐ試せる | 採用。ただしモード名を減らし、Asset / Game / Playを連続させる |
| ワールド中心 + 選択サイドバー | GB Studio | 置いた結果が常に見える、対象ごとの設定が明確 | 主軸として採用 |
| Tile Palette + Map Canvas | RPG Maker / Unity | マップを塗る操作が直感的、反復配置が速い | Tile / Backgroundに採用 |
| Layout + Event Sheet | Construct / GDevelop | 複雑なルールを表現できる | 内部モデル・上級面へ採用、初心者面ではカード化 |
| Object template + Instance | GameMaker / Unity | 再利用と個別配置が整理される | UI用語を隠して内部モデルへ採用 |
| ノードグラフ | Flowlab / GameMaker / Construct | 拡張性・可視性が高い | 詳細モードのみ。初期画面には置かない |
| Scene tree + Inspector | Godot / Unity | 大規模制作に強い | 既存互換・詳細設定用。常時表示しない |
| Stage + Sprite + Blocks | Scratch | 初心者が対象中心で理解しやすい | 対象中心のContext cardに採用 |

---

## 4. PiXiEEDの推奨制作フロー

### 4.1 初回プロジェクト

初回は、エンジン名や細かい設定を聞かず、次の3つだけを選ぶ。

```text
どんなゲームにしますか？

[上から見下ろす]   [横に進む]   [自由に作る]
```

これは内部のRuntime / physics / camera presetを選ぶだけで、ユーザーに複数の設定項目を見せない。未選択時は「上から見下ろす」を既定値にする。

次に、既存の簡易導線を使う。

```text
[背景を置く] [主人公を置く] [ものを置く] [Play]
```

背景・主人公・もののAssetを持っていない場合は、iDRAWの選択範囲取得へ遷移する。素材の権利や販売設定は、この制作導線に混ぜない。

### 4.2 素材を置く

左のAsset Drawerは、次の3分類だけを常時見せる。

```text
絵       iDRAWで作ったもの
音       iAUDIOで作ったもの
用意済み Market / Project素材
```

Asset cardは、文字情報より実物を主役にする。

- 実際の画像プレビュー
- アニメーション再生
- 音なら波形と再生ボタン
- 「ゲームで使える」状態
- 必要な時だけ権利・Revisionの小さな状態表示

カードをStageへドラッグすると、Asset Revisionを参照するRuntime Instanceを生成する。元Assetを直接書き換えず、配置位置や個体差はInstance側に保存する。

### 4.3 ステージを直接編集する

- Asset cardをStageへドラッグ: 配置
- 配置したものをドラッグ: 移動
- ハンドルをドラッグ: 拡大縮小・回転
- クリック: 選択
- Delete: 削除
- 右クリック: 複製、前面／背面、置き換え
- 空白をドラッグ: 範囲選択
- マウスホイール: ズーム
- Space + ドラッグ: パン

選択中の対象の周囲には、位置・サイズ・回転のHandleだけを表示する。数値入力は必要な時だけContext cardの詳細へ出す。

### 4.4 動きを付ける

オブジェクトをダブルクリックした時、右側または対象の近くに次のカードを表示する。

```text
このものをどうしますか？

[その場で動く] [歩く] [追いかける] [触れたら反応]
[話す]         [拾う]     [壊れる]   [攻撃する]
```

カードを1回押すと、既定値でBehaviorを追加し、すぐPreviewできる。速度、範囲、条件などはカード内の小さな直接操作で変更し、空のInspectorに戻さない。

例:

```text
[歩く]
  → iDRAWのwalkアニメーションを自動選択
  → 方向入力を自動接続
  → Pivotを足元として扱う
  → 当たり判定を画像の下部から自動生成
```

### 4.5 マップと衝突

Tile / Background Assetを選択した時だけ、左DrawerをTile Paletteに切り替える。

```text
┌────────────┐  ┌────────────────────────┐
│ Tile Palette│  │                        │
│ [草][水][壁] │  │  Stageへドラッグまたは塗る │
│ [床][道][木] │  │                        │
└────────────┘  └────────────────────────┘
```

衝突は、通常の編集時には表示しない。`C`キーまたはステージ上の小さな表示アイコンで可視化する。歩けないTileはAssetの種類や作成者タグから自動設定し、手動で全TileにColliderを設定させない。

### 4.6 音を付ける

iAUDIOのTrackをiGAMEへ持ち込むときは、ゲーム側で音源を再編集させない。

- Stageの空白へBGMをドロップ: Scene BGM
- ActorへSEをドロップ: そのActorの標準SE候補
- Triggerへ音をドロップ: そのTriggerが起きた時のSE
- Behavior cardの「攻撃する」「拾う」「話す」へ音をドロップ: 対応するCue

これにより、iAUDIOは音楽制作、iGAMEは音の配置という責務になる。音量・ループ・開始位置などの精密設定は選択中の音Cueに対してだけ表示する。

### 4.7 Sceneを増やす

画面下のScene stripで、サムネイルの右にある`＋`を押す。初回は次の二択だけにする。

```text
[空のScene] [今のSceneを複製]
```

Sceneを増やした後は、Scene間をドラッグして入口・出口をつなぐ。複雑な遷移条件は最初から作らず、TriggerのContext cardに「このSceneへ移動」を表示する。

### 4.8 Play

編集とPlayを別の複雑なモードにしない。上部の同じボタンを次のように切り替える。

```text
編集時   ▶ Play
再生中   ■ Stop   ↻ Restart
```

Play中は、選択枠、Asset Drawer、Context card、Hierarchyを縮退させ、ステージを最大化する。再生状態はRuntime Snapshotから読み、編集中のProject Journalを直接変更しない。

---

## 5. 現行iGAMEへの対応

現行のiGAMEには、Game-350のScene、Hierarchy、Viewport、Inspector、Timeline、Playground、Asset Browser、Runtime、保存契約がある。今回の方向性では、これらを削除するのではなく、表示面を初心者用と詳細用に分ける。

### 5.1 そのまま活かす部分

- iDRAW / iAUDIOからGame側Asset Libraryへ投影する構造
- SceneとPlacementを分ける内部モデル
- Play / Stop / Restartのランタイム境界
- Animation / Pivot / Collisionをアセットメタデータで保持する方針
- Projectの保存・Revision・Preview Snapshot
- Unity向けDelivery Artifactの生成境界

### 5.2 初心者表示で整理する部分

| 現在見えている概念 | 初心者表示の変更案 |
| --- | --- |
| Scene / Gameの中央切り替え | Playボタン中心に統合。詳細な切替は残すが通常非表示 |
| Playgroundのモード選択 | 「背景」「主人公」「もの」「Play」の入口に置き換える |
| 左Hierarchy / Node Box | 初期はAsset Drawer。大規模Sceneで必要な時だけ開く |
| 右Inspector | 対象選択時だけContext card。精密数値と詳細Behaviorだけ残す |
| 下部Timeline | 常設しない。Animation / Event / Audioを選択した時だけ開く |
| Game UI node一覧 | 初期画面から隠す。UIを置いた時のContext操作で表示 |
| Runtime / Physics設定 | テンプレートへ吸収し、初回入力を不要にする |
| Market / Rights / Revision詳細 | 制作面から分離し、Asset cardの詳細・公開画面で扱う |

### 5.3 重要な互換性方針

初心者面を導入しても、内部の既存状態を`UNIFIED`へ一括変換したり、旧モードを削除したりしない。旧保存値は読み取り可能に保ち、表示だけを新しいBeginner Surfaceへ投影する。

これにより、既存Projectの破壊を避けながら、初回ユーザーには少ない概念だけを見せられる。

---

## 6. 推奨データモデル

ユーザーに見せる名前と、内部の正本を分ける。

```text
Project
 ├─ Scene[]
 │   ├─ backgroundAssetRef
 │   ├─ tileLayer[]
 │   ├─ instance[]
 │   └─ trigger[]
 ├─ AssetRevision[]
 ├─ BehaviorPreset[]
 ├─ AudioCue[]
 └─ RuntimeSnapshot
```

### AssetRevision

```text
assetId
revisionId
contentHash
sourceProjectId
kind: CHARACTER | OBJECT | TILE | BACKGROUND | EFFECT | AUDIO
frames / animations / directions
pivot
collisionHint
deliveryRefs
rightsSnapshot
```

### Runtime Instance

```text
instanceId
assetRevisionId
sceneId
position / scale / rotation
layer
behaviorPresetIds[]
audioCueIds[]
instanceOverrides
```

この分離により、同じAssetを複数Sceneへ置いても、元Assetのアニメーションを壊さずに個別配置を編集できる。

### BehaviorPreset

初心者向けの最小単位は、条件と結果を一つの短いカードとして保持する。

```text
BehaviorPreset
 ├─ trigger: ON_START | ON_TOUCH | ON_INTERACT | ON_INPUT | ON_TIMER
 ├─ condition?: preset condition
 ├─ action: MOVE | FOLLOW | TALK | COLLECT | DAMAGE | TRANSFER | PLAY_AUDIO
 ├─ parameters: safe defaults
 └─ generatedFrom: user preset / advanced editor
```

UIでカードを選ぶと、既存のBehavior IRまたはRuntime contractへ変換する。初心者UIと上級UIが別のルールを持たないようにする。

---

## 7. 画面ごとの表示ルール

### 常時表示

- Project名
- Undo / Redo
- Save状態
- Play / Stop
- 現在のScene名
- ステージ

### 選択時だけ表示

- 位置・回転・サイズのHandle
- アニメーションの再生状態
- Behavior card
- 音Cue
- Collision overlay
- 置き換え・複製・削除

### 詳細時だけ表示

- 数値の直接入力
- Pivotの数値
- Animationのフレーム速度
- Collisionの細かな形状
- Eventの条件・変数
- Revision / provenance / rights
- Runtimeの高度な設定

### 初心者面から外す

- 空のInspectorを常時表示
- Scene / Game / Physics / Genreの複数のモード選択
- Nodeを検索して追加するための常設Node Box
- Event Sheetやノードグラフ
- UnityのGameObject / Component / Animatorという用語
- Marketの販売形式、権利配分、Revision操作
- 使っていない機能の「後続実装」表示

---

## 8. 実装順序

### P0：初心者Surfaceの状態定義

- Empty / Partial / Ready / Playingの状態を定義
- 画面上の主役をStageに固定
- PC breakpointのみを対象にする
- 旧UIを削除せず、Beginner projectionを追加

### P1：Asset Drawerの統合

- DRAW / AUDIO / MARKET / TEMPLATEを一つの素材Drawerへ投影
- Asset cardからStageへのドラッグ配置
- 画像・アニメーション・音の実物プレビュー
- Asset revisionの解決失敗時は空Instanceを作らない

### P2：直接配置と自動初期化

- ドラッグ配置、移動、複製、削除
- CHARACTERは自動でidle / walk / direction / pivotを適用
- OBJECT / EFFECT / TILE / BACKGROUNDは種類に応じた既定値を適用
- 透明部分やPivotを可視化する選択オーバーレイ

### P3：Behavior card

- 歩く、追いかける、触れたら、話す、拾う、壊れる、攻撃する
- 1カード1操作で既存Behaviorへ変換
- 既定値のままPlay可能
- 失敗時に該当Asset・Scene・Behaviorへ戻る

### P4：Scene strip / Tile操作

- Scene追加・複製・削除
- Tile PaletteのDrawer表示
- 入口・出口・Triggerの直接作成
- Collision overlayの可視化

### P5：Audio cue

- BGM、Actor SE、Trigger SE、Behavior SEのドロップ
- iAUDIO編集とiGAME配置の責務分離
- Cueのプレビューと削除

### P6：Preview / Snapshot

- Play / Stop / Restart
- 編集中のProjectとRuntime Snapshotを分離
- Play中は初心者UIを縮退
- Scene、Animation、Audioの現在状態を一致させる

### P7：詳細・出力

- 詳細Inspector、Behavior graph、Timelineを必要時だけ開く
- Web Preview
- Unity Delivery Artifact
- 実Unity Import / Compile / Play受入れ

---

## 9. 重大なリスクと対策

| リスク | 対策 |
| --- | --- |
| 簡単にするために既存機能を消してしまう | 内部契約と詳細UIを保持し、表示Projectionだけを変える |
| Assetを置いても挙動がない | Asset kindごとに安全な既定Behaviorを生成し、空の動作を許容する |
| iDRAWのLIVE編集とGameのPreviewが混ざる | 編集参照とRuntime Snapshotを分ける。公開・BuildはPINNED revisionを読む |
| 購入済みAssetが表示されても使えない | Asset権利確認、revision解決、実ファイルMaterializationを配置前に完了させる |
| 同じキャラクターの個体差が元Assetを壊す | AssetRevisionとRuntime Instanceを分離する |
| カードが増えて別の羅列UIになる | 最初は頻出7種程度に限定し、詳細操作は対象の状態からのみ表示する |
| Sceneを増やすと難しくなる | Scene stripはサムネイルと複製だけ。遷移はTriggerの直接操作で作る |
| 既存の5レール契約とUIがずれる | 5レールを正本・責務として維持し、Beginner SurfaceをProjectionとして実装する |
| Unityへ持ち出した時に別物になる | Animation、Pivot、Collider、音、権利、hashをDelivery Manifestへ含める。Unity実環境は別受入れにする |

---

## 10. 受入れ基準

初心者Surfaceの第一段階は、次を満たした時点で合格とする。

1. 新規Projectを開いて、詳細設定を開かずに背景を置ける
2. iDRAWから主人公を選び、Stageへ戻って配置できる
3. 主人公をドラッグして移動できる
4. 主人公をPlayすると既定のidle / walk動作が確認できる
5. ものを置き、「触れたら」などのカードを1回押して動作を確認できる
6. Sceneを複製して別画面を作れる
7. BGMまたはSEをドロップしてPlayで聞ける
8. Play / Stop / Restartで編集データが壊れない
9. Asset解決に失敗した場合、空の見た目だけのInstanceを残さない
10. 既存Projectを開いた時、従来の保存値・詳細操作へ戻れる

初心者の体験評価は操作回数だけでなく、次を測る。

- 最初のPlayまでの時間
- どこを押せばよいか分かるまでの時間
- Stage以外へ視線が移る回数
- 空のInspectorや意味のない説明文が表示される時間
- Assetを置いた後に「次に何をするか」が分からず停止する割合
- Play後に元データや配置が変わる回数

---

## 11. 最終提案

PiXiEEDのiGAMEは、次の順で進める。

```text
iDRAW / iAUDIOで作る
        ↓
Asset Drawerから選ぶ
        ↓
中央Stageへドラッグ
        ↓
対象をダブルクリック
        ↓
短いBehavior cardを1つ選ぶ
        ↓
Play
```

PICO-8からは一体感と即時実行、GB StudioからはGame World中心の配置、RPG MakerからはTileとEventの直接操作、Scratchからは対象中心の理解しやすさを採用する。Construct / GDevelop / Flowlabの拡張性は内部Behaviorと詳細画面へ、GameMaker / Godot / UnityのObject・Scene・Animation・Deliveryの堅牢さは内部モデルと出力へ採用する。

**ユーザーが見るPiXiEED:** 描く、置く、選ぶ、遊ぶ。  
**内部で保持するPiXiEED:** Project、Asset Revision、Instance、Behavior、Audio Cue、Runtime Snapshot、Rights、Delivery Artifact。

この分離が、機能を失わずに「難しい操作や設定を感じさせない」ための中心方針である。

---

## Sources

1. [PICO-8 User Manual](https://www.lexaloffle.com/dl/docs/pico-8_manual.html)
2. [GB Studio Project Editor](https://www.gbstudio.dev/docs/project-editor/)
3. [GB Studio Actors](https://www.gbstudio.dev/docs/project-editor/actors/)
4. [GB Studio Scene Types](https://www.gbstudio.dev/docs/project-editor/scenes/types/)
5. [RPG Maker MZ Basic Editor Controls](https://rpgmakerofficial.com/product/MZ_help-en/01_03.html)
6. [RPG Maker Map Event Creation and Controls](https://rpgmakerofficial.com/product/MV_Help/page/01_09_02.html)
7. [RPG Maker Map Event Settings](https://rpgmakerofficial.com/product/MZ_help-en/01_09_03.html)
8. [Construct 3 Interface](https://www.construct.net/en/make-games/manuals/construct-3/overview/the-interface)
9. [Construct 3 Layouts](https://www.construct.net/en/make-games/manuals/construct-3/project-primitives/layouts)
10. [Construct 3 Events](https://www.construct.net/en/make-games/manuals/construct-3/project-primitives/events)
11. [GDevelop Interface](https://wiki.gdevelop.io/gdevelop5/interface/)
12. [GDevelop Scene Editor](https://wiki.gdevelop.io/gdevelop5/interface/scene-editor/)
13. [GDevelop Events](https://wiki.gdevelop.io/gdevelop5/events/)
14. [GameMaker Objects and Instances](https://manual.gamemaker.io/monthly/en/Quick_Start_Guide/Objects_And_Instances.htm)
15. [GameMaker GML Visual Overview](https://manual.gamemaker.io/monthly/en/Drag_And_Drop/Drag_And_Drop_Overview/DnD_Overview.htm)
16. [Flowlab Behavior Guide](https://flowlab.io/resources_behaviors)
17. [Flowlab Features](https://flowlab.io/features)
18. [Scratch Build the Change Facilitator Guide](https://resources.scratch.mit.edu/www/lessons/en/Scratch_BuildTheChange_FacilitatorGuide.pdf)
19. [Scratch Getting Started](https://scratch.mit.edu/help/studio/tips/howto/get-started-10/)
20. [Godot Introduction to 2D](https://docs.godotengine.org/en/stable/tutorials/2d/introduction_to_2d.html)
21. [Godot Creating the Player Scene](https://docs.godotengine.org/en/stable/getting_started/first_2d_game/02.player_scene.html)
22. [Unity 2D Game Creation Workflow](https://docs.unity3d.com/ja/current/Manual/2d-game-creation-wokflow.html)
23. [Unity Tilemap Workflow](https://docs.unity3d.com/ja/2021.2/Manual/Tilemap-workflow.html)
24. [Unity Animator Controller](https://docs.unity3d.com/ja/current/Manual/AnimatorControllerCreation.html)

