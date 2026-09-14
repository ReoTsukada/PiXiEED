# PiXiEED「描く → アセット化 → ゲームへ配置」総合調査・設計案

**作成日:** 2026-09-14  
**対象:** iDRAW / iAUDIO / iGAME / Unity連携 / Market・SNSでの再利用  
**状態:** 調査・設計・現状照合。実装状態と進行順の正本は [`../decisions/pixieed-current-progress-and-next-direction-20260914.md`](../decisions/pixieed-current-progress-and-next-direction-20260914.md) と [`../decisions/pixieed-vnext-implementation-status-20260906.md`](../decisions/pixieed-vnext-implementation-status-20260906.md) とする。この文書は設計根拠と受入れ条件を保持し、コードの存在だけを本番完了とは扱わない。

## 1. 結論

PiXiEEDは「キャラクターを登録するアプリ」ではなく、制作物をそのままゲームで使える形へ変換する共通アセット基盤として設計するのが最も自然です。

ユーザーに見せる導線は、次の一本に絞ります。

    iDRAWで描く
      ↓
    現在のフレーム・選択範囲・複数フレームから作成
      ↓
    アセットカードで実物を確認
      ↓
    必要な場合だけ方向・アニメーション・基準点を調整
      ↓
    iGAMEのプロジェクトライブラリへ保存
      ↓
    ビューポートへドラッグして配置
      ↓
    既定の動作で再生・確認
      ↓
    必要ならiGAMEでゲーム固有の動作を追加
      ↓
    Unity向けにPNG・メタデータ・Prefabを出力

重要なのは、編集用の元データとゲームへ渡す確定データを分けることです。

- 編集用: iDRAWのProject、Layer、Frame、Selection、Revisionへの参照
- ゲーム用: 実際に読み込めるPNGまたは画像シート、フレーム情報、方向、再生速度、Pivot、任意の衝突形状
- Unity用: 上記に加えて、Unityが再利用できるPrefab、Animation Clip、Animator Controller、必要に応じたScriptableObject

これにより、iDRAWで編集を続けられ、iGAMEにはその時点の確定版を置け、Unityにはブラウザ内の一時参照に依存しない実ファイルを渡せます。

## 2. 調査範囲と判断方法

公式マニュアル・公式製品ページを中心に、次の観点で比較しました。

1. 絵をどこで作るか
2. 1枚絵、複数フレーム、方向をどう登録するか
3. ゲーム画面へどう配置するか
4. 配置後にアニメーションや当たり判定をどう扱うか
5. 初心者が迷わない見た目になっているか
6. 外部エンジンへ持ち出すときに、どの情報が必要か

公式仕様から直接確認できた事実と、PiXiEEDへの設計提案は分けています。

- 事実: 各製品の公式仕様・現行コードから確認できること
- 提案: それらをPiXiEEDの目的に合わせて統合した設計判断

## 3. 既存サービスから得られる重要なパターン

| サービス | 公式仕様から確認できること | PiXiEEDが採用すべきパターン | 注意点 |
| --- | --- | --- | --- |
| Flowlab | ブラウザ内のゲーム編集、ピクセルエディタ、フレームアニメーション、フレームごとの時間、PNG/JPG/GIF読込、編集後すぐ再生 | 絵とゲームを同じ作業場所に置き、保存済みスプライトをすぐ配置できる | 高度な外部エンジン向け契約は別途必要 |
| GameMaker | Image EditorとRoom Editorが分かれ、スプライト、複数レイヤー、フレーム、アニメーション、タイルセット、部屋への配置を持つ | 「絵を作る場所」と「配置して確認する場所」を同じProjectの中でつなぐ | 機能が強い分、初心者には設定量が多い |
| Construct 3 | SpriteごとのAnimation Editor、画像・シートからのフレーム追加、プレビュー、リサイズ可能なペイン | フレームを画像カードとして直接並べ替え、すぐ再生する | 完全なドット絵専用導線ではない |
| GB Studio | スプライト編集、アニメーションとフレームのナビゲーション、オニオンスキン、グリッド、当たり判定枠 | フレーム、アニメーション、衝突範囲を視覚的に確認する | 対象ハードの制約が大きい |
| PICO-8 | スプライト、マップ、音、コードが同じ制作環境にあり、直接操作とショートカットで編集 | モードをまたいでも素材が同じProjectに属する感覚 | 128×128、色数などの固定制約はPiXiEEDには適用しない |
| RPG Maker | 画像・音声を素材として管理し、キャラクター画像に方向とパターンの規則がある。マップはタイルセットから配置 | 規約を知らなくても、方向やパターンが自動で正しく使われる | 自由な絵作りは外部ツールに依存する |
| Aseprite | Frame Tagでアニメーションを名前付けし、Sliceで名前・Pivot・領域を保持し、PNG/JSON/シートを出力 | 「フレームの並び」ではなく「名前付きアニメーション」として出力する | Asepriteは絵の編集が主で、ゲーム配置は別工程 |
| Godot | AnimatedSprite2DとSpriteFramesにアニメーション名・フレーム・再生速度・自動再生がある | ゲーム側はアセットを配置した時点で、既定アニメーションを再生できる | 実行時のノード設定は別途必要 |
| Unity | SpriteのSingle/Multiple、Sprite Editor、PPU、Pivot、Point Filter、Tile Palette、Prefab、Animator Controller、Sprite Library/Resolverがある | Unityでは「画像」だけでなく、画像をどう切り、動かし、配置するかを一緒に渡す | Unity Editorでの実Import・Compile・Playは別受入れが必要 |

### 3.1 最も再利用価値が高い共通点

成功している製品は、ユーザーに長い設定フォームを先に入力させていません。

- 画像を置く、または描く
- フレームを並べる
- 名前を付ける
- ゲーム画面へ配置する
- その場で再生する

という順番です。

逆に、アセットの種類、ライセンス、販売、方向、速度、Pivot、当たり判定を最初からすべて入力させると、制作開始までの負担が増えます。

PiXiEEDでは、ゲームで必要になる情報だけを、実物を見ながら後から追加できる構造にします。

## 4. 現行PiXiEEDとの関係

### 4.1 既にある基盤

現行コードには、設計の中心にできる要素があります。

- /Users/tsukadareine/Documents/GitHub/PiXiEED/pixiedraw2/src/game/game-350/assetization.ts
  - DrawのFrame、Layer、Region、Frame Duration、Animation Range、Asset Kindを参照する決定的なアセット化処理
  - CHARACTERだけでなくOBJECT、TILE、BACKGROUND、EFFECTへ拡張できる種別
  - 曖昧な複数フレーム入力を拒否する検証
- /Users/tsukadareine/Documents/GitHub/PiXiEED/pixiedraw2/src/draw2-asset-bridge-contract.ts
  - 現在の選択範囲、Frame、Asset Definition、Asset Packageを扱うBridge契約
  - 現在の描画を変更せずに選択範囲を取得する契約
  - 1フレームまたは複数フレームを取得する契約
- /Users/tsukadareine/Documents/GitHub/PiXiEED/pixiedraw2/src/game/game-350/asset-bridge.ts
  - iDRAWのCapture DraftからiGAME向けの参照を作る処理
  - iAUDIOの確定PackageをGame側の音声メタデータへ投影する処理
- /Users/tsukadareine/Documents/GitHub/PiXiEED/pixiedraw2/src/game/game-350/game-asset-browser.ts
  - DRAW、AUDIO、GAME、TEMPLATEを同じGame側ライブラリで表示する構造
- /Users/tsukadareine/Documents/GitHub/PiXiEED/pixiedraw2/src/game/game-350/unity-audio-export.ts
  - WAV、Manifest、Unity向けImporterを含む音声出力の先行例
  - Unity Editor内のImport、Compile、実行までは別受入れと明記されている
- /Users/tsukadareine/Documents/GitHub/PiXiEED/pixiedraw2/src/game/game-350/unity-asset-export.ts
  - 画像、Manifest、Importer、Runtime Script、Animator、Prefabを含むUnity向け出力生成器
  - Asset種別、Frame、Animation、Pivot、PPU、Point Filter、provenanceを出力する構造
- /Users/tsukadareine/Documents/GitHub/PiXiEED/pixiedraw2/src/wp180-workspace-ui.ts
  - 保存済みPackageをiGAMEのProject Libraryへ表示し、Gameへ追加する導線

### 4.2 現在の実装状態の分類

| 領域 | 状態 | 判断 |
| --- | --- | --- |
| iDRAWのFrame/Layer/Regionから定義を作る | IMPLEMENTED | 共通アセットの核として再利用できる |
| 複数Frame・Animation Range・方向の参照 | IMPLEMENTED / 要UI確認 | 契約はあるが、初心者向け視覚UIとしての完成度は別評価 |
| iDRAWの選択範囲を現在表示中の合成画像として取得 | PARTIAL | Capture契約はある。実ファイルを常に生成するDelivery層は別途明確化が必要 |
| iGAMEのライブラリへDRAW/AUDIOを表示 | IMPLEMENTED | 実際にドラッグして配置できるかはブラウザ受入れが必要 |
| iGAMEで配置後にアニメーションを再生 | PARTIAL | Animation BindingとRuntime境界はある。全種別の既定動作は統一が必要 |
| Unity向け音声出力 | IMPLEMENTED / UNTESTED | 出力契約とImporter生成はある。Unity実環境は未検証 |
| Unity向け画像の1ドラッグPrefab出力 | PARTIAL / 未受入れ | 生成器は存在する。画像バイト、Prefab参照、Animator Loop、Unity実環境を受入れで確定させる必要がある |
| Marketから取得後にiGAMEで即利用 | PARTIAL / 本番未受入れ | 所有権、Revision、配信、Storage、RLSは本番環境で別途確認が必要 |
| Unity EditorでImport・Compile・Play | UNTESTED | 実際のUnityプロジェクトと対象バージョンで確認が必要 |

### 4.3 2026-09-14時点の進行更新

PC版では、iDRAW／iAUDIO／iGAMEの入力面ごとのキー所有、Spaceの再生とパンの分離、モード別Timeline記憶、PC iAUDIOの重複ツールバー非表示が実装され、ローカル契約テストを通過した。これにより、次の優先順位はUIの追加ではなく、表示中の合成画像を確定Artifactへ変換し、iGAMEとUnityで実体を受け入れることになった。

この文書に記載するP0〜P5は設計上の全体順であり、現在の実行順は次のとおりである。

1. PCブラウザで入力所有権とTimelineを受入れる
2. iDRAWの現在表示中の合成画像を1枚目としてMaterializeし、iGAMEへ実画像を配置する
3. PNG／Sheet／Manifest／PrefabをUnity EditorでImport・Compile・Playする
4. Supabase／Marketの取得、権利拒否、Revision、Storage、Stripe、Realtimeを本番相当環境で受け入れる
5. 挙動が確定した後にInspector／パネルを直接操作中心へ段階的に整理する

表示幅504pxのブラウザ確認やローカル契約テストは、1120px以上のPC表示、Unity実環境、Supabase本番相当受入れの代替にはならない。

ここで「Asset Definitionがある」ことと、「ゲームが実際に表示できる画像バイトがある」ことは同じではありません。現在の参照契約を維持しつつ、出力時に確定画像を生成するMaterialization層を追加するのが安全です。なお、現行にはUnity画像出力生成器もあるため、これは新規にゼロから作るのではなく、既存生成器を共通Delivery契約へ接続し、実Unity受入れで不足を埋める作業です。

## 5. 推奨する共通アセットモデル

### 5.1 ユーザーに見せる名前

UI上では「アセット化」という技術用語を主役にしません。

- 現在の絵から作る
- フレームを追加
- ゲームで使う
- 書き出す

を主な操作名にします。

内部ではAsset Definition、Asset Revision、Delivery Artifactを持ちますが、初心者には「作ったもの」「ゲームで使うもの」「元の編集データ」の3つに見せます。

### 5.2 内部の責務

| 概念 | 役割 | 変更方法 |
| --- | --- | --- |
| Project | iDRAW/iAUDIO/iGAMEを束ねる正本 | Projectの保存・Revision |
| Source | 元のLayer、Frame、Region、Audio Trackなど | 各制作ツールで編集 |
| Asset Definition | 何を1つの作品として扱うか | 現在の選択範囲、Frame、Trackから作成 |
| Asset Revision | その時点の不変スナップショット | 確定時に生成 |
| Delivery Artifact | PNG、シート、WAV、JSONなど実際に渡すファイル | Export時にMaterialize |
| Runtime Instance | iGAMEのシーンに置いた実体 | Game側で位置・動作を変更 |
| Listing | Marketで公開・取得する単位 | Rights/Market側で設定 |

Asset Definitionを直接Unityへ渡すのではなく、Asset RevisionからDelivery Artifactを作ります。

### 5.3 共通メタデータ

最小限、次の情報を持たせます。

| 項目 | 必須 | 内容 |
| --- | --- | --- |
| assetId | 必須 | アセットの安定したID |
| revisionId / contentHash | 必須 | どの確定版か、改ざんされていないか |
| sourceProjectId | 必須 | 元Project |
| sourceRefs | 必須 | Layer、Frame、Region、Track等の参照 |
| kind | 必須 | CHARACTER / OBJECT / TILE / BACKGROUND / EFFECT / AUDIO等 |
| canvasSize / frameSize | 必須 | 元画像と1フレームのサイズ |
| frames | 必須 | 順序、画像ファイル、durationMs |
| animations | 必須 | 名前、Frame列、Loop |
| directions | 必須 | 1/2/4/8方向と各方向のFrame列 |
| pivot | 推奨 | center、bottom-center、custom |
| pixelPolicy | 推奨 | PPU、Point Filter、Alpha、Compression方針 |
| collision | 任意 | 矩形またはポリゴン。初期値は未設定 |
| tags | 任意 | idle、walk、attack、open、hit等 |
| provenance | 必須 | 元作品、派生元、権利スナップショット |

Revision名だけで固定版を識別してはいけません。PINNEDと表示されていても、現在の定義を読み直して同じRevision名を返す経路が残ると、元の絵を再現できません。固定版はrevisionIdとcontentHashを組にし、描画・Materialize・iGAME・Unity・Marketのすべてでこの組を渡して検証します。

### 5.4 方向とアニメーション

方向の数を画像の並び順から推測しません。明示的な方向配列で管理します。

    directions: 1 / 2 / 4 / 8
    direction: south / west / east / north / southWest / southEast / northWest / northEast
    animation: idle / walk / run / attack / hit / custom
    frames: [frame-01, frame-02, ...]
    durationMs: [120, 100, 100, 120]

2方向だけ作る場合は2方向として保持します。4方向や8方向に自動複製して「作ったことにする」ことはしません。

不足方向がある場合、ゲーム側は次の順で明示的に解決します。

1. 指定方向が存在する
2. 作成者が設定した代替方向がある
3. 代替がない場合は静止画または既定方向を使う
4. UIに「この方向の絵は未設定」と表示する

## 6. iDRAWの制作方法

### 6.1 基本画面

画面の主役はCanvasです。アセット設定を最初から全面表示しません。

- 左: レイヤーと現在のFrame
- 中央: Canvas
- 下: Frame Timeline。アニメーションを選んだ時だけ広がる
- 右: 選択中のFrame、方向、PivotなどのContext設定
- Asset Library: 下部レールのタブから開く。常時大きなパネルを占有しない

### 6.2 最短操作

1. iDRAWで絵を描く
2. 選択範囲を作る
3. 選択範囲の近くに表示される「この絵を使う」を押す
4. 現在表示中の合成結果を1枚目としてアセットカードに入れる
5. Timelineのフレームをドラッグして追加、並べ替え、削除
6. 必要なら方向レイアウトへ切り替え、同じ操作で方向別Frameを入れる
7. 「ゲームで使う」でiGAMEのProject Libraryへ保存

現在表示中のレイヤー合成を取得する要求に対しては、元のLayerを破壊せず、表示中の合成結果を画像としてCaptureします。アセット作成後の編集は、元Projectを変更するか、Asset側へ複製するかを明示します。

### 6.3 直接操作を主役にする

- Frameカードをドラッグして順番を変える
- Frameカードの端をドラッグして表示時間を変える
- Canvas上のPivotをドラッグする
- 方向はSelectの長いリストではなく、8方向の空間配置で選ぶ
- 透明なスロットは「ここに絵を入れられる」Empty Slotとして表示する
- 既存Frameをダブルクリックすると、そのFrameを編集する
- シングルクリックは選択、ドラッグは移動または範囲選択
- 削除は選択中のカードまたはFrameに対するDelete

ボタンは「作成」「ゲームへ追加」「書き出し」など、状態を変える主操作だけ残します。

### 6.4 アセット種別ごとの初期表示

種類は初期値を決めるプリセットとして使い、別の制作システムには分けません。

| 種類 | 初期表示 | 追加設定 |
| --- | --- | --- |
| CHARACTER | 8方向の空間スロット、idle/walkのFrame列 | attack等は必要な時に追加 |
| OBJECT | 正面1スロット、idleまたはstatic | open、break、active等 |
| EFFECT | 中央配置のFrame列 | 発生、展開、消滅、Loop |
| TILE | 1マスまたはグリッド | Tileサイズ、接続辺 |
| BACKGROUND | 単一画像またはレイヤー | ParallaxやサイズはiGAME側 |
| AUDIO | 選択したTrack/Range | iGAME側で再生イベントへ接続 |

## 7. iGAMEへの反映方法

### 7.1 Project Libraryから配置

iGAMEを開いた時、下部または左側のProject Libraryに、現在Projectで使える確定アセットを表示します。

アセットカードには、文字を詰め込まず次を見せます。

- 実際のプレビュー画像
- アニメーションの再生
- 方向数
- Frame数
- 「ゲームで使用可能」の状態
- 更新がある場合の小さなバッジ

カードをビューポートへドラッグすると、Runtime Instanceを生成します。

### 7.2 配置直後にできること

配置直後にユーザーがすることは、次の3つまでに絞ります。

1. 位置を動かす
2. 大きさを変える
3. Playで動作を確認する

CHARACTERなら、初期値として次を自動設定します。

- idleアニメーション
- walkアニメーション
- 方向入力との接続
- Pivotを足元または作成者指定位置
- 物理・衝突は未設定または種類の既定値

ただし、iDRAWで役割、SE、ゲームルールを設定しません。キャラクターの役割、攻撃判定、歩行音、ボイス、イベント接続はiGAMEのRuntime設定として扱います。

### 7.3 直接操作とContext UI

- Canvas上のオブジェクトを選択すると、周囲に移動・拡大縮小・回転Handleを表示
- アニメーション再生中は、対象の上に現在のAnimation名とFrame位置を小さく表示
- 衝突範囲を編集する時だけ、枠と頂点Handleを表示
- Inspectorには、直接操作できない数値、Runtimeイベント、詳細な参照だけを残す
- 「選択中」や「オブジェクトを選択」の常時表示テキストは置かない

## 8. Unityへ持ち出す3段階

### 8.1 レベルA: 画像をそのまま使う

出力物:

- PNG単体
- PNG連番
- PNGスプライトシート

用途:

- Unity以外のエンジン
- 手作業での配置
- 画像だけ欲しいMarket購入者

このレベルでも、ファイル名は決定的にします。

    asset-id/
      preview.png
      frames/
        idle_south_000.png
        idle_south_001.png
      sheet.png

### 8.2 レベルB: 画像 + Manifest

出力物:

- PNGまたはシート
- JSON Manifest
- 方向、アニメーション、Frame順、durationMs、Pivot、サイズ、ハッシュ、権利情報

用途:

- Unity、Godot、GameMakerなどでImporterを用意する
- 自作エンジンへ読み込む
- Marketで「元ファイルを含めず、ゲーム利用可能な素材」として販売する

Manifestの論理構造:

    asset
      id / revision / kind / contentHash
      texture
        width / height / frameWidth / frameHeight
        ppu / filter / compression
      pivot
      animations[]
        name / loop / frames[]
      directions[]
        id / label / animations[]
      collision?
      provenance

### 8.3 レベルC: 1ドラッグで使えるUnity Package

出力物:

- PNGまたはシート
- Manifest
- Unity Editor Importer
- Animation Clip
- Animator Controller
- Prefab
- 必要に応じたSprite Library / Sprite Resolver
- 任意のCollider設定
- 任意のAudio Event参照

UnityプロジェクトのAssetsへコピーまたはPackageとして導入すると、PrefabをSceneへ置くだけで既定アニメーションが動く状態を目指します。

このレベルは「画像をUnityへ放り込める」と「Prefabを置くだけで動く」を分けて実装します。初期リリースでは、画像とManifestを安定させてから、PrefabとAnimatorを生成する方が手戻りが少なくなります。

### 8.4 現行Unity出力の評価

現行の unity-asset-export.ts には、Asset種別、Manifest、画像、Runtime Script、Importer、Animator、Prefabをまとめる生成器があります。したがって、Unity出力は未着手ではなく、**実環境での受入れ前の実装済み基盤**です。

残る確認・修正候補は次です。

- ZIPをAssetsへ展開するだけでなく、Prefabを確実に生成してSceneへ置けるかを実Unityで確認する
- 生成されるPNGの実バイト、Frame順、画像サイズ、透明余白を確認する
- PrefabのSpriteRenderer、Animator、ScriptableObjectの参照切れを確認する
- Collider2DをManifestのcollisionから生成できるか確認する
- LoopやPing-pongをAnimatorの正しい設定で再現する
- Unityの対応バージョンを固定し、Importerの再実行が冪等であることを確認する

特に、Animatorで再生するClipをLegacy用のwrapModeだけで制御しないことが重要です。Loop Time、遷移、または必要な逆再生Stateを生成し、ManifestのloopModeと実行結果を一致させます。

## 9. Unity向けの固定ルール

ドット絵がぼやけたり、Frameごとに足元が揺れたりしないために、以下をアセットの共通既定値にします。

- Texture Type: Sprite (2D and UI)
- Sprite Mode: SingleまたはMultiple
- Filter Mode: Point
- Compression: Noneを基本
- Mipmap: Off
- PPU: Project内で統一し、エクスポート時にManifestへ記録
- Pivot: 作成者指定。未指定時は種別ごとの既定値
- Sprite Sheet: frameWidth / frameHeight / padding / cell orderを記録
- 透明余白: 画像を勝手に詰めず、PivotとCanvas基準を保持
- Collider: 自動生成だけに依存せず、必要なら作成者が確認する

CHARACTERはbottom-center、OBJECTはcenter、EFFECTはcenterを初期値にします。作成者が変更したPivotはUnity出力でも同じ値にします。

UnityのSprite Editorはシート分割、Pivot、Physics Shapeを扱えます。PiXiEED側でそれらをManifestに出せば、Importerが同じ結果を再現できます。

## 10. 音声を含む場合

iAUDIOはiDRAWのレイヤーへ音声設定を混ぜません。

音声の最短導線は次です。

1. iAUDIOでTrackを作る
2. 必要なTrackまたは時間範囲を選ぶ
3. 「この範囲をアセットにする」
4. クリップの実音声とManifestを生成する
5. iGAMEのProject Libraryへ表示する
6. BGM、SE、Voice、Music Eventとしてゲーム側で接続する

「Track × time range = Clip」を時間の正本とし、PPQ/Tickを壊さないようにします。ゲーム側へ渡す時だけ、実時間、WAV、Loop範囲、再生イベントへ変換します。

キャラクターの歩行音、攻撃音、ボイスは、アセットそのものの必須属性ではありません。

- iDRAW: 見た目、Frame、方向、アニメーション
- iAUDIO: 音声素材、Track、Clip
- iGAME: walk時にこのClipを鳴らす、攻撃時にこのVoiceを鳴らす、という接続

この分離により、同じキャラクターを別の音声セットでも使えます。

## 11. Market・派生・元ファイルの扱い

制作工程と販売工程を分離します。

- iDRAW/iAUDIOで作ったものは、まず通常のアセット
- iGAMEで使用するのも同じアセット
- Marketへ出す時だけListingを作る
- 元Project、編集可能なPXD、PNG、GIF、JSON、Unity Packageは別々のDelivery Artifactとして選択する

販売者は「プロジェクト全体」「音楽の全Track」「iDRAWの元ファイル」「確定アセットのみ」「選択した複数アセット」のように、Delivery Artifactを選べます。

ただし、ユーザーが権利ツリーを手で組み立てるUIにはしません。

- 基本は「このアセット」
- 追加は「＋このアセットを含める」
- 元ファイルを付ける場合は「編集用ファイルも含める」
- Project全体は「Projectを引き継ぐ」

Rights Engineは、元作品、派生元、共同制作者、分配条件を内部で保持し、ユーザーには公開前に要約だけを表示します。

## 12. 実装優先順位

### P0: 共通Delivery契約を固定

- Asset Revisionから画像バイトとManifestを確定する型を追加
- source referenceだけでなく、materialized outputの存在を検証
- Frame、Direction、Animation、Pivot、durationMsの一貫したスキーマ
- contentHashとdeterministic file name
- PINNEDをrevisionIdだけでなくcontentHashと実バイトで固定
- 不足方向や空Frameを明示的にエラーまたは未設定表示

### P1: iDRAWの「現在の絵から作る」

- 現在表示中の合成結果を1枚目としてCapture
- 現在Frame、Frame範囲、選択Frameを選択
- Frameカードの追加、削除、並べ替え
- 方向を1/2/4/8から選び、空きSlotを視覚表示
- Save時にAsset Revisionを生成

### P2: iGAME Project Libraryとの縦断

- 実画像プレビューを表示
- iDRAWで保存したアセットを一覧へ出す
- ドラッグで配置
- 配置直後の既定Animationを再生
- 古いRevisionと更新Revisionを区別
- 保存・再読込後も同じ実体を復元

なお、「Gameオブジェクトを先に作り、Draw参照を後から接続する」部分成功方式は避けます。参照解決に失敗すると空の配置だけが残り、ユーザーは絵が消えたと判断するためです。Asset Revisionの検証と実体の登録が完了してからRuntime Instanceを作る、または失敗時に作成したInstanceを原子的に取り消す契約にします。

### P3: Unity画像出力

- PNG単体・連番・Sheetを出力
- Manifestを出力
- Point、PPU、Pivot、Frame順を再現
- まず画像Importを受入れ
- 次にAnimation Clip / Animator Controller / Prefabを生成

### P4: Market・権利・購入後の利用

- Listingが選んだArtifactを配信
- 無料取得・購入後にProject Libraryへ表示
- 所有権とRevisionを検証
- 期限切れ、無効Revision、改ざん、権利不足を拒否

### P5: 実環境受入れ

- 実ブラウザでiDRAW → Asset → iGAME
- 実UnityプロジェクトでImport / Compile / Play
- 2ユーザーの購入・再接続
- Storage署名URLとRLS
- 対応Unityバージョンの固定

## 13. 受入れ条件

### iDRAW

- 選択範囲を作成すると、現在表示中の合成結果が1枚目として見える
- 透明部分を含む範囲でも元画像を壊さない
- Frameを追加、削除、移動、並べ替えできる
- Frameごとの時間を変更できる
- 1/2/4/8方向を作成できる
- 未設定方向は未設定として見え、勝手に複製されない
- 保存後に再読込しても画像、順序、Pivot、時間が一致する

### iGAME

- 保存済みアセットが実画像で表示される
- Project LibraryからViewportへ配置できる
- 配置直後に既定Animationを再生できる
- 位置、Pivot、衝突範囲を直接確認できる
- iDRAWの編集途中の参照と、確定したGame Revisionが混同されない

### Unity

- PNG単体をUnityが読み込める
- SheetをMultiple Spriteとして読み込める
- Point FilterとPPUが適用される
- Frame順とdurationMsがAnimation Clipへ一致する
- PivotがiGAMEと一致する
- PrefabをSceneへ置いて再生できる
- Unity EditorのImport、Compile、Playを実環境で記録する

### Market

- 取得後に空のアセットカードが表示されない
- 権利のないArtifactはProject Libraryへ追加できない
- Revisionが変わった場合は更新を明示する
- 元ファイル付き、アセットのみ、複数選択の各Deliveryが一致する
- 派生・共同制作の分配情報がListing確定時のSnapshotと一致する

## 14. 主なリスクと対策

| リスク | 原因 | 対策 |
| --- | --- | --- |
| iGAMEに枠だけ表示される | Source referenceしかなく画像バイトがない | Save/Export時にMaterializeし、画像存在を受入れ条件にする |
| iGAMEに空オブジェクトだけ残る | オブジェクト生成とDraw参照接続が別処理 | 実体検証後に一括作成し、失敗時は全体をRollback |
| Unityでぼやける | Bilinear、PPU不一致、圧縮 | Point、PPU、CompressionをManifestとImporterで固定 |
| Frameごとに位置が揺れる | 透明余白の自動トリミング | Canvas基準とPivotを保持し、勝手に詰めない |
| 8方向を作ったつもりになる | 足りない方向を自動複製 | directionsを明示し、未設定を表示 |
| PINNEDなのに以前の絵が再現されない | Revision名だけで現在の定義を再参照する | revisionId + contentHash + materialized bytesを固定し、全経路で検証 |
| 元絵とゲーム側が同時に変わる | Live参照と確定版の混同 | GameはAsset Revisionを使い、更新通知で差し替える |
| iDRAWがゲーム設定で複雑になる | 役割・SE・Runtimeルールの混在 | iDRAWは視覚情報だけ、iGAMEで動作を接続 |
| Market購入後に使えない | Listing、所有権、Deliveryの分離不足 | ListingがArtifactとRevisionを固定し、取得時に権利検証 |
| Unity出力が環境依存になる | Unityバージョン、Importer差異 | 対応バージョン、出力Schema、実Unity受入れを固定 |

## 15. 最終的な画面イメージ

### iDRAW

    ┌──────────────┬─────────────────────────────┬─────────────┐
    │ Layer / Frame │             Canvas           │ Context     │
    │              │  選択範囲の近くに            │ 選択中Frame  │
    │              │  「この絵を使う」            │ Pivot        │
    │              │                              │ 方向Slot     │
    ├──────────────┴─────────────────────────────┴─────────────┤
    │ Frame 01  Frame 02  ＋  ···   [再生]       Asset Library │
    └───────────────────────────────────────────────────────────┘

### iGAME

    ┌──────────────┬─────────────────────────────┬─────────────┐
    │ Project      │           Viewport            │ Context     │
    │ Library      │    ドラッグして配置            │ 選択Object   │
    │ [Asset]      │    そのままPlay確認            │ 位置/Pivot   │
    │ [Asset]      │                               │ 動作/衝突    │
    ├──────────────┴─────────────────────────────┴─────────────┤
    │ Scene / Animation / Audio Event / Play                    │
    └───────────────────────────────────────────────────────────┘

ここで右側のContextは、対象を選択した時だけ現れます。常時テキストを縦に並べず、Canvas、Frame、Library、Timelineそのものを操作面にします。

## 16. 公式資料

### 統合型制作ツール

- [Flowlab Features](https://flowlab.io/features)
- [Flowlab](https://flowlab.io/)
- [GameMaker Features](https://gamemaker.io/en/features)
- [GameMaker Image Editor](https://gamemaker.io/en/help/articles/using-the-gamemaker-image-editor)
- [GameMaker Room Editor](https://gamemaker.io/en/help/articles/using-the-gamemaker-room-editor)
- [Construct 3 Animations Editor](https://www.construct.net/en/make-games/manuals/construct-3/interface/animations-editor)
- [Construct 3](https://www.construct.net/en)
- [PICO-8 Manual](https://www.lexaloffle.com/dl/docs/pico-8_manual.html)
- [PICO-8 FAQ](https://www.lexaloffle.com/pico-8.php?page=faq)
- [GB Studio Sprite Documentation](https://www.gbstudio.dev/docs/assets/sprites/)
- [RPG Maker MZ Character Images](https://rpgmakerofficial.com/product/MZ_help-en/01_11_01.html)
- [RPG Maker MZ](https://www.rpgmakerweb.com/products/rpg-maker-mz)

### アセットとゲームエンジン

- [Unity Sprite Import Settings](https://docs.unity3d.com/cn/6000.0/Manual/texture-type-sprite.html)
- [Unity Sprite Editor](https://docs.unity3d.com/cn/2023.2/Manual/SpriteEditor.html)
- [Unity 2D Game Creation Workflow](https://docs.unity3d.com/6000.1/Documentation/Manual/2d-game-creation-wokflow.html)
- [Unity Tilemap Workflow](https://docs.unity3d.com/es/2021.1/Manual/Tilemap-workflow.html)
- [Unity Prefabs](https://docs.unity3d.com/cn/2018.3/Manual/Prefabs.html)
- [Unity Animator Controller](https://docs.unity3d.com/cn/2018.3/Manual/class-AnimatorController.html)
- [Unity Sprite Library / Resolver](https://docs.unity3d.com/ja/Packages/com.unity.2d.animation%4013.0/manual/SLAsset.html)
- [Unity Aseprite Importer Features](https://docs.unity3d.com/ja/Packages/com.unity.2d.aseprite%403.0/manual/ImporterFeatures.html)
- [Unity Pixel Perfect Sprite Preparation](https://docs.unity3d.com/kr/6000.0/Manual/urp/2d-pixelperfect-prep-sprites.html)
- [Godot AnimatedSprite2D](https://docs.godotengine.org/en/latest/classes/class_animatedsprite2d.html)
- [Godot Player Scene with SpriteFrames](https://docs.godotengine.org/en/stable/getting_started/first_2d_game/02.player_scene.html)

### 絵の編集・出力仕様

- [Aseprite Exporting](https://www.aseprite.org/docs/exporting)
- [Aseprite Sprite Sheets](https://www.aseprite.org/docs/sprite-sheet/)
- [Aseprite Frame Tags](https://www.aseprite.org/docs/tags/)
- [Aseprite Slices](https://www.aseprite.org/docs/slices/)
- [Aseprite CLI](https://www.aseprite.org/docs/cli/)
- [Aseprite Sprite Frames](https://www.aseprite.org/docs/sprite/)

## 17. この文書の次の使い方

進行の判断は、実装状態の正本とこの設計資料を分けて行う。次の実装では、いきなりUnity Prefab生成だけを進めません。

1. PCの直接操作とキー所有をブラウザで固定
2. 共通Delivery Manifestと実体化条件を固定
3. iDRAWで現在の合成画像を1枚目にする
4. iDRAWのFrame／Direction編集を完成
5. iGAMEで実画像を表示して配置・保存・再読込
6. PNG／Sheet／Manifestを出力
7. 実UnityプロジェクトでImport／Compile／Play
8. その後にPrefab／AnimatorとMarket配信を接続
9. 最後に、受入れ結果を壊さない範囲でInspector／パネルを整理

この順番なら、ユーザーが最初に体験する価値である「描いたものがゲーム画面に出て動く」を早く検証でき、Unityと販売の複雑さをiDRAWの制作画面へ逆流させずに済みます。
