# ネイティブ制作スタジオ案

## 目的と前提

「かんたんドット」「ドットで音楽」「ドット絵カメラ」を、同じ作品とキャンバスを使うネイティブ制作アプリへ段階的にまとめる。iOS/iPadOSを先行対象とするのは仮定で、対象OS・対応端末・配布方法は未決定。Android対応も別途判断する。この文書は実装計画であり、ネイティブアプリやOS連携が既に動くことを示すものではない。

既存Web実装は再利用可能な仕様とデータの根拠として扱う。JavaScript画面をSwiftでそのまま動かす前提にはしない。ピクセル幾何、色から音への投影、PXDの読書き規則などの純粋処理は、現在のテストfixtureを共通の期待値としてSwiftへ移植する。操作規則とアイコンを引き継ぎ、画面はSwiftUIの状態・アクセシビリティに合わせて組み直す。

## 現在あるもの

- **描画とフレーム:** Drawは一つのピクセル文書を編集し、レイヤーとフレームを合成して表示する。ペン、消しゴム、塗りつぶし、直線・図形、スプレー、範囲移動、対称描画があり、ポインター操作と編集履歴を持つ。フレーム再生とGIF書出しもある。キャンバス表示は[draw-page.mjs](/Users/tsukadareine/Documents/GitHub/PiXiEED/js/creation/draw-page.mjs:103)、再生と共通コントロールは[draw-page.mjs](/Users/tsukadareine/Documents/GitHub/PiXiEED/js/creation/draw-page.mjs:121)、[draw-page.mjs](/Users/tsukadareine/Documents/GitHub/PiXiEED/js/creation/draw-page.mjs:157)、GIF書出しは[draw-page.mjs](/Users/tsukadareine/Documents/GitHub/PiXiEED/js/creation/draw-page.mjs:997)にある。
- **画像とPXD:** PXDは画像役割ごとの画像と、`animations/<role>/state.json`・`cels.bin`からなるフレームデータを保持する。読込み時には寸法、色、フレーム、レイヤー、タイル範囲とハッシュを検証する。[pxd-animation.mjs](/Users/tsukadareine/Documents/GitHub/PiXiEED/js/creation/pxd-animation.mjs:38)、[pxd-animation.mjs](/Users/tsukadareine/Documents/GitHub/PiXiEED/js/creation/pxd-animation.mjs:70) Drawの保存は選択フレームの画像とタイムラインをPXDへ書く。[draw-page.mjs](/Users/tsukadareine/Documents/GitHub/PiXiEED/js/creation/draw-page.mjs:1040)、[draw-page.mjs](/Users/tsukadareine/Documents/GitHub/PiXiEED/js/creation/draw-page.mjs:1075)
- **色から音:** Audioの各セルは画像の色・行・列と結び付く。列は音の開始時刻、行は音程、色は音色レーンへ対応し、未割当色には音符を作らない。画像の色を音符へ投影する処理は[pxd-draw-audio.mjs](/Users/tsukadareine/Documents/GitHub/PiXiEED/js/creation/pxd-draw-audio.mjs:154)、アニメーションから各フレームの音符を作る処理は[audio-animation.mjs](/Users/tsukadareine/Documents/GitHub/PiXiEED/js/creation/audio-animation.mjs:75)にある。Audioは現在、取り込んだアニメーションの表示レイヤー合成をAudio側の編集データへ平坦化する経路を持つ。[audio-page.mjs](/Users/tsukadareine/Documents/GitHub/PiXiEED/js/creation/audio-page.mjs:219) 静止画像からフレームへ移す処理もある。[audio-page.mjs](/Users/tsukadareine/Documents/GitHub/PiXiEED/js/creation/audio-page.mjs:255)
- **音付き動画:** Audioは音符と画像を使い、1ループの動画を書き出せる。アニメーションの全フレームを渡し、フレーム幅に対応する音楽時間で画像を切り替える。[audio-page.mjs](/Users/tsukadareine/Documents/GitHub/PiXiEED/js/creation/audio-page.mjs:1357)、[audio-video.mjs](/Users/tsukadareine/Documents/GitHub/PiXiEED/js/creation/audio-video.mjs:32) 現行経路はCanvasの`captureStream`、Web Audio、`MediaRecorder`で記録する方式で、オフライン書出しとは異なる。[audio-video.mjs](/Users/tsukadareine/Documents/GitHub/PiXiEED/js/creation/audio-video.mjs:130)
- **カメラ:** pixel-cameraは`getUserMedia`でライブ映像を得て、フレーミング・トーン調整をしたドット解像度画像から色処理済みプレビューを作る。[app.mjs](/Users/tsukadareine/Documents/GitHub/PiXiEED/js/pixel-lens/app.mjs:918)、[app.mjs](/Users/tsukadareine/Documents/GitHub/PiXiEED/js/pixel-lens/app.mjs:790)、[engine.mjs](/Users/tsukadareine/Documents/GitHub/PiXiEED/js/pixel-lens/engine.mjs:1029) 撮影画像はPNGまたはGIFになり、カメラ用PXD経路は確定した画像を共有画像として保存する。[app.mjs](/Users/tsukadareine/Documents/GitHub/PiXiEED/js/pixel-lens/app.mjs:1141)、[app.mjs](/Users/tsukadareine/Documents/GitHub/PiXiEED/js/pixel-lens/app.mjs:1986) Audioへのカメラ受け渡しは、曲とPXD参照を一時保存し、別URLから戻ったRGBAを検証して読み取るWeb向け経路である。[audio-camera-handoff.mjs](/Users/tsukadareine/Documents/GitHub/PiXiEED/js/creation/audio-camera-handoff.mjs:110)、[audio-camera-handoff.mjs](/Users/tsukadareine/Documents/GitHub/PiXiEED/js/creation/audio-camera-handoff.mjs:152)
- **ライブ色統合:** カメラは元のドット解像度画像と色処理後画像を保持し、選択色の連結領域をライブ更新できる。[app.mjs](/Users/tsukadareine/Documents/GitHub/PiXiEED/js/pixel-lens/app.mjs:506)、[live-region-merge.mjs](/Users/tsukadareine/Documents/GitHub/PiXiEED/js/pixel-lens/live-region-merge.mjs:158) これは空や物体の意味を理解する機能ではなく、画素近傍の保守的な追跡である。

画面の入口は現在別々で、DrawとAudioはそれぞれのHTMLから別の編集ページを読み込む。[draw/index.html](/Users/tsukadareine/Documents/GitHub/PiXiEED/draw/index.html:86)、[audio/index.html](/Users/tsukadareine/Documents/GitHub/PiXiEED/audio/index.html:69) 別ツールへ作品を複製する経路では、Drawのアニメーションを複製してAudio用roleへ変換し、音符投影と先頭フレーム画像を用意する。[tool-project-import.mjs](/Users/tsukadareine/Documents/GitHub/PiXiEED/js/creation/tool-project-import.mjs:21)、[project-components.mjs](/Users/tsukadareine/Documents/GitHub/PiXiEED/js/creation/project-components.mjs:47)、[project-components.mjs](/Users/tsukadareine/Documents/GitHub/PiXiEED/js/creation/project-components.mjs:52) これは別プロジェクトへの複製経路であり、現状のAudio編集は取り込んだ表示合成をAudio側データへ平坦化する。[audio-page.mjs](/Users/tsukadareine/Documents/GitHub/PiXiEED/js/creation/audio-page.mjs:219) 統合に必要なのはタイムライン変換そのものではなく、同一ドキュメント・同一画面での編集と、元のDrawレイヤーを保ったままAudioが表示合成を読む接続である。

## 提案する共通体験

一つの**制作ドキュメント**がキャンバス寸法、パレット、フレーム、Drawレイヤー、音符と色→音色対応を持つ。PXDの現行画像・アニメーション部品を読み書きするアダプターを保存境界に置き、原本を保護した編集コピーを作る。Drawレイヤーはそのまま維持し、Audioは選択フレームの表示合成を読む。音楽の編集内容は画像レイヤーへ混ぜず、色・セルとの対応を介して再生する。既存Audioの「取り込み時に平坦化する」実装とは分け、統合ドキュメントではレイヤー構造を保持する。

中央の主操作はモードで切り替える。Drawではフレームを再生し、必要なら音を有効・無効にする。Audioでは同じタイムラインを音付きで再生する。Cameraだけは撮影操作を主操作とする。ペン、消しゴム、色・音色設定、フレーム、ファイルを意味でまとめ、使わない項目は隠す。既存のアイコンと短いパネル操作を参考にし、常時ボタンを増やさない。これは既存Web UIの移植ではなく、操作の意味を合わせたSwiftUI設計とする。ツールバーは明確な意味・適切なグループ・一貫した配置を保ち、項目を詰め込みすぎない。[Apple Human Interface Guidelines: Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)

Cameraモードではライブ映像を同じキャンバス枠に表示し、既存ドット絵をどう重ねるかは未決定とする。撮影結果は新しいフレームとして追加するのを既定にし、選択中の絵や未保存編集を置き換えない。ライブ映像の各フレームから音符を自動生成する処理は初期対象外。まず静止撮影画像をユーザーが確認・採用し、その後に選択フレームの表示画像を音へ投影する。カメラ許可、拒否、取り消し、アプリ中断後の復帰を画面遷移をまたぐsessionStorageに依存させず、ネイティブのセッション状態として扱う。

色→音の初期規則は既存モデルを維持する。割り当てのない色は無音、列は時間、行は音程。音符が過密な場合に備えて投影密度の上限と確認表示を設け、既存の手動音符を自動投影で消さない。フレーム表示時間と音楽上の時間単位は別物として保ち、共有タイムラインでの同期規則を定義する。音付き動画には選択範囲またはループ範囲の画像・音を含める。通常の動画書出しはタイムラインと音をオフラインで描画し、ライブ撮影の実時間収録とは別機能として区別する。

## iOS/iPadOSの仮構成

- **SwiftUI:** モード、ツールバー、パネル、フレーム一覧、確認・保存画面を担当する。
- **AVFoundation:** `AVCaptureSession`を使うカメラプレビューと撮影。AppleのAVCam例はSwiftUI画面とAVFoundationのカメラセッションを組み合わせる参考になるが、PiXiEEDでの実装証明ではない。[AVCam: Building a Camera App](https://developer.apple.com/documentation/avfoundation/avcam-building-a-camera-app)
- **Metal:** ドット表示、nearest-neighbor拡大、必要になった場合のライブ色処理を担当する。まずCPU上の純粋処理と実測を行い、GPU化は性能測定後に限定する。[Metal](https://developer.apple.com/metal/)
- **AVAudioEngine:** 編集時の再生と、可能ならオフライン音声レンダリングを担当する。[Performing Offline Audio Processing](https://developer.apple.com/documentation/avfaudio/performing-offline-audio-processing)
- **AVAssetWriter:** 画像フレームと音声を複数メディア入力として動画ファイルへ書く候補とする。[AVAssetWriter](https://developer.apple.com/documentation/avfoundation/avassetwriter)、[AVAssetWriterInput](https://developer.apple.com/documentation/avfoundation/avassetwriterinput)

## 実装順と受け入れ

1. **縦切り:** PXDを読み、選択フレームの合成画像を表示し、描画・Undo/Redo・保存・再読込を行う。入力PXDと編集中コピーの識別、画素・透明度・フレーム選択の一致をfixtureで検証する。
2. **音楽とフレーム:** 全フレームの表示合成、色→音色割当、未割当色の無音、密度制御、再生・停止後の編集位置復元を加える。音符投影が既存の手動音符・時間配置を壊さないことを確認する。
3. **撮影と書出し:** 撮影結果を新規フレームへ追加し、拒否・キャンセル・バックグラウンド復帰・未保存絵の保持を確認する。offline音付き動画の音画同期、実時間収録、失敗・キャンセル時のファイル後始末を個別に検証する。

各段階でiPhoneとiPadの実機確認を行う。カメラ許可と拒否、縦横切替、長時間再生、アプリ中断、メモリ上限、フレーム切替の同期、最近傍表示、PXDの再読込を確認し、シミュレーター・合成画像・単体テストの結果だけで実機品質を主張しない。

## 実装状態と未確認事項

**実装済み（Web）:** 描画・フレーム・PXD保存、色から音への投影、Audioのフレーム再生、音付き動画のブラウザー書出し、pixel-cameraのライブ処理・静止撮影、Audio向けカメラ往復、ライブ色統合。

**未実装:** 共通ネイティブドキュメントとSwiftUI画面、AVFoundationカメラ統合、Metal描画、AVAudioEngine再生、AVAssetWriter書出し、保存・権限・バックグラウンド復帰を含むネイティブの統合状態管理。カメラ映像と既存絵の重ね方、共有タイムラインの具体的同期規則、対象OSとAndroid対応も未決定。

**未検証:** この提案のネイティブ構成、実機性能、ライブ撮影と編集の統合、ネイティブでの音画同期・書出し。現行ブラウザー実装や純粋処理のテストは、これらの受け入れ証拠にはならない。
