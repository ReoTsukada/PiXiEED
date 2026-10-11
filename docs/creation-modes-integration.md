# PiXiEED制作ツールの共通プロジェクト統合（2026-10-11）

## 現在の仕様

描画 `/draw/`、音楽 `/audio/`、カメラ `/pixel-camera.html` の入口を残し、通常入口は同じPiXiEEDraw制作画面の描画・音楽・カメラモードを開く。モード間は再読込みやiframeを使わず、同じheader・main・viewport・board・dock・navを使用する。Electronや配布パッケージは追加していない。

制作中の作品は一つ。キャンバス寸法、パレット、選択、Drawの編集基盤、保存先、Undo/Redoを共有する。絵のフレーム列と音楽ページ列は独立させ、常設の最下段音楽レイヤーが選択中の音楽ページを表示する。通常8レイヤーと音楽1レイヤーを保持する。旧実装の描画・音楽の独立編集bankと相互画像コピーは廃止した。入口を変えても `pixieed:pxd:last:creation` の同じDraw所有プロジェクトを復帰する。テンポ・色の音色割当も同じUndoに記録した。モード変更自体では画素や履歴を変更しない。

カメラだけの色モード・保存パレット・色味・ディザ・ズーム・向きと撮影プレビューはカメラ側に保持する。幅・高さ・縦横比は共通設定を参照し、カメラのドット／比率からも同じ設定パネルを開く。撮影・画像読込みは作品を置き換えない。「適用」で現在のフレーム・レイヤー・選択範囲へ反映し、1回のUndoで戻せる。適用先は撮影時ではなく適用時に確認し、ロック中・読み取り専用なら拒否する。

カメラの色設定に「パレット固定」を追加し、初期値はOFF。OFFでは既存の白黒・GB・グレー・8／16色・写真16色・保存パレットを利用できる。ONでは共通作品の既存パレットだけでプレビュー／撮影し、色を追加しない。OFFへ戻すと選択していた色モードと保存／編集済みパレットを復元し、未編集の写真モードは従来の自動選色へ戻る。

OFFの撮影画像を作品へ適用すると、実際に選択範囲へ配置した不透明画素の新色だけを、最初に現れた順で共通パレット末尾へ追加する。プレビューやシャッターでは追加しない。既存色の順序・番号・RGBAによる音色対応を保持し、重複色を追加しない。新色の音色は従来どおり未割当。画素とパレットの追加は同じ履歴1件に入り、全モードのUndo/RedoとPXD保存へ反映する。

共通作品の上限は不透明32色で、完全透明画素は別の-1値として保持する。半透明を含む画像、または追加後32色を超える画像は適用せず、理由と撮影モード／パレット固定による再撮影の案内を表示する。黙って減色せず、撮影画像・作品・履歴を保持する。既存GIF出力は維持するが、GIFを共通作品の全コマへ直接適用する新規経路は追加していない。

## 共通設定と通常ビューポート

共通設定は1〜256px、不透明HEX1〜32色。長辺プリセット、縦横比、縦横比固定、色数、色ごとの編集、白黒／グレー／GBパレット、旧カメラの保存パレット選択を提供する。保存済みカメラパレットのlocalStorageは上書きしない。絵の倍率変更は既存の詳細機能へ接続する。

サイズ・パレット変更には明示プレビューと適用が必要。全コマ・非表示／ロックを含む全レイヤーに中央基準の余白追加・切り取り・減色を適用し、フレーム／レイヤーID・設定・透明画素を保持する。一つの不変スナップショットとしてUndo/Redoできる。プレビュー後に作品や入力値が変わると適用を無効化する。縮小で切り取られる画素数、減色される色数、幅による演奏時間と高さによる音程への影響を表示する。

音色対応はRGBA値をキーにし、パレットを並べ替えても同じ色の音を保持する。色の統合・置換は共通設定のプレビューで影響を示し、新色の音は音楽設定で確認できる。通常は横1ドット120tick、縦は音高。旧圧縮音楽は保存されたコマ時間と列への丸め配分を保持し、自動的に通常時間へ変換しない。

ユーザーの方針変更により全画面対応を撤去した。通常のビューポートと操作領域を分ける既存Drawの配置を使い、描画・音楽では左右の縦3ボタンと中央3行パレットを維持する。カメラは同じ操作領域で従来の横並びツールを使う。全画面切替、Fullscreen API、専用CSS、操作呼戻し、DOMの一時移動、全画面専用ポインター所有・経路検査コードと専用テストは残していない。元の仮想カーソル／通常UIの入力処理を保つ。カメラの色味スライダーは操作dock内に置き、狭い画面ではbounded scrollで操作する。

## 既存作品と単体ページ

旧 `/audio/?standalone=1` と `/pixel-camera.html?standalone=1` を残す。従来の受け渡しURLも維持する。通常の音楽・カメラ入口で明示指定したPXDはDraw所有の新しいコピーとして開き、元の作品ID・保存版・バイト列を変更しない。コピーには変換前のPXDを `legacy/import-source.pxd` として保持する。

複数の独立した画像roleを含む旧PXDでは、保存済み選択がなければ開く画像を選択する。黙って別画像を合成しない。初めて共通形式で保存する際は旧PXD全体を `legacy/creation-original.pxd` に保持する。main画像／animationに絵のフレーム列、audio画像／animationに音楽ページ列を保存し、音楽linkで選択ページを関連づける。旧単体音楽へも音楽ページ列を渡す。独立した旧画像は原本バックアップと元の保存作品から回収できる。

旧曲だけのPXDは必要時に画像を復元する。圧縮時間の音楽、手動音符、音符ID・強さ・未知項目、レイヤー・複数コマの既存互換処理を利用する。共通作品から旧単体音楽へコピーする際も時間情報を引き継ぎ、保存情報の整合性を検証する。

## リソース管理

音楽データモデルは最初の編集前に準備し、初期音楽ページをクリーンな履歴の基準にする。準備中は制作入力を遮断する。カメラと音楽UI／音声処理は初回利用まで遅延読込みする。カメラモードに入るだけでは端末カメラを要求しない。再生・試聴時にAudioContextを作成する。実カメラ／マイク権限は今回の検証で許可していない。

カメラ退出ではストリーム・video参照・フレームループ・GIF録画／再生を停止し、エンコードを中断する。遅れて返るgetUserMediaは世代番号で無効化してトラックを停止する。共有設定変更から非アクティブなプレビューを再開しない。音楽退出・タブ非表示・pagehideではタイマー・音声ノード・再生位置RAFを止め、AudioContextを閉じる。Drawの再生・仮想入力も停止する。音楽を戻っても自動再生しない。保存は一つの共通workspaceで行う。

## 初回統合の確認結果（全画面の記録は現在の仕様には含めない）

- Nodeのmjsテスト全体1,878件成功、失敗・スキップなし。`/tmp/pixieed-shared-all-tests-complete.tap`。
- 最終buildの320×568、390×844、844×390、1280×800で32項目成功。共通画素・Undo/Redo、テンポUndo、再生停止、共通寸法／パレットの変更、連続9切替、撮影と適用の分離、全画面・操作復帰・回転、WAVの `/output/work/` 出力、三入口から同じ作品の復帰。ブラウザー内エラーなし。`/tmp/pixieed-shared-build-final-v2/results.json`。
- PC／モバイル×標準16列／圧縮32列、旧PXDの4ケース成功。コピーID、原本のID・保存版・encoded bytesとバックアップhash、画素・寸法、コマ追加Undo/Redo、音符・時間、保存／再読込、旧単体コピーと原本の再生。`/tmp/pixieed-shared-build-legacy-complete/results.json`。
- 最終buildのリソース計測3シナリオ成功。音楽退出でタイマー0、音楽RAF0、AudioContext1/1終了、ノード7/7切断。描画再生RAF1→0。合成カメラ退出でstream1/1停止、video参照解除、inFlight0、停止後のフレーム公開0、カメラRAF0。`/tmp/pixieed-shared-build-resources-complete/results.json`。RAF所有元は要求時stackの分類による。GIF workerは今回の計測では生成していない。

- 音楽モードの既存Draw機能、PC／モバイル各12項目成功。範囲選択・投げ縄・修飾操作・範囲変形・仮想カーソル・色変更・全コマ／全レイヤー色調整・日本語文字とPXD往復。`/tmp/pixieed-shared-project-draw-features-final2/report.json`。未検証扱いのPXDダウンロード項目は今回の24成功項目に含めない。
- 追加UI検証、PC／モバイル各5項目成功。32色＋透明の編集／Undo、縦横比固定・長辺プリセット、RGBA音色の並べ替え保持、全3モードの全画面復帰、色味スライダーの実表示とdock内配置。`/tmp/pixieed-shared-settings-final/results.json`。ネイティブFullscreenは両幅とも利用されず、CSS fallbackを確認。
- 遅延ロード・失敗後再試行・遅延試聴／WAV取消・WAV／音付き動画出力の6ケース成功。`/tmp/pixieed-shared-lifecycle-final/results.json`。

ブラウザーテストは隔離されたheadless Chromiumで外部通信を遮断し、ローカル合成入力だけを使う。実機カメラ、Safari／WebKit、実際の音の聴取、OSの回転・ネイティブ全画面、CPU／メモリー改善量は未検証。GIFを共通Drawの全コマへ直接取り込む新規経路は未実装。制作中のPXD全体をファイルへ書き出す新規操作は追加していない。読み込んだ原本PXDの保存操作と既存のブラウザー内保存・ファイル読込みは維持する。今回のブラウザー検証はWAV・音付き動画の共通出力を確認した。PNG／GIFを含む全出力経路の実機検証は未完了。

独立bankを前提にした以前の `creation-modes-browser-harness.mjs` 等の証跡は旧仕様の記録で、今回の共通作品仕様の合格件数に含めない。

## 作業保護と配信確認

開始時の未コミット100ファイルは `/tmp/pixieed-shared-project-backup-20261011-163503` にバイト列・SHA256 manifest・tracked patchを保存済み。100ファイル中80ファイルが開始時のバイト列と一致し、残る20ファイルは制作統合・入口・検証・build・説明資料に必要な更新。ショップ・商品データ・Books CSS/JS・ナビなどの無関係な差分は一致している。照合結果は `/tmp/pixieed-shared-preservation-final.json`。

buildは一時ソーススナップショットから生成し、既存のgit管理外パズルを含めて663ファイル、イベント86ページ、パズル6ページ。入口・共有JS・CSS・共通出力の17ファイルは現在ソースとバイト単位で一致。最終buildは `/tmp/pixieed-integration-build-review-dtxN0C/site`。共通出力 `/output/work/`、Offerwallと広告設定を維持している。

コミット・プッシュ・本番公開・課金・本番API実行を行っていない。独自素材生成サービスV2の停止指示を維持している。

## Libraryの初回統合画面（全画面は廃止前の記録）

- 共通設定：`libfile_7c08e9c543ac8191b8952d87cb6bd6dd`。
- カメラの色味操作：`libfile_8be75c46eddc8191b5a7ce562e26032f`。
- 全画面制作：`libfile_4f0519b3414c819186ac81e7b22b071c`。

ローカル原本は `/tmp/pixieed-shared-deliverables/`。返却されたLibrary versionの拡張属性を3ファイルに適用済み。今回のLibrary作成結果は `/tmp/pixieed-shared-library-final.json`。

## 通常ビューポートへ戻した最終確認（2026-10-11）

全画面用の浮動UIと追加入力コードを対象限定で撤去し、単一作品・共通設定／履歴、音楽のDraw全ツール、カメラの横並び操作と色味clip解消、旧PXD互換、モード退出時停止は維持した。ラベルは「キャンバス設定」「パレット」「プリセット」「適用」へ短縮した。保存回帰で見つかった未定義の旧 `editorBank` 参照は、既存の端末保存先の有無の判定に戻した。

- Node全1,878件成功。`/tmp/pixieed-viewport-all-tests-complete.tap`。並列実行では処理時間上限に依存する既存region-mergeテストが一度失敗し、単独と全体の逐次実行では成功した。処理時間上限や製品コードは変更していない。
- 320×568、390×844、844×390、1280×800の通常画面32項目成功。共通画素／Undo／設定／音楽再生退出停止、連続切替、撮影から描画への明示適用、通常viewportと3列パレット、向き変更、WAV共通出力、三入口で同じ保存作品を復帰。全画面UI要素が存在しないことも確認。`/tmp/pixieed-normal-viewport-final/results.json`。
- 仮想マウスの通常操作40項目成功。配置取消、左右ボタン、描画、Undo/Redo、capture loss／blur／mode OFF、向き変更と保存位置、同じ操作欄の形状を4画面サイズで検証。`/tmp/pixieed-normal-viewport-virtual/results.json`。
- カメラの合成画像で4画面サイズとも横並び6ツールと色味スライダー実クリック可能を確認。実カメラ要求0。`/tmp/pixieed-normal-camera-final/results.json`。
- 最終コードの遅延処理／保存／旧曲指定／WAVと動画出力の7シナリオ成功、および音声・描画・合成カメラ退出の3リソースシナリオ成功。証跡はそれぞれ `/tmp/pixieed-normal-viewport-lifecycle/results.json`、`/tmp/pixieed-normal-viewport-resources/results.json` に記録した。

全画面専用の途中検証は取消済みの仕様の記録で、現在の合格件数には含めない。実機カメラ・マイク、Safari、物理ペン、実際の音の聴取、実機GIF長押し撮影は未検証。モード統合の共通作品・PXD保存・出力仕様は初回統合と同じ。

最終buildは `/tmp/pixieed-integration-build-review-uYpYSo/site`、663ファイル、イベント86ページ、パズル6ページ。17対象ファイルをソースとバイト単位で照合した。開始時の110未コミットファイルは `/tmp/pixieed-floating-ui-backup-20261011` に保存済み。ショップ・Books・ナビ・共通出力・Offerwallの無関係な変更を保持している。V2停止、コミット／プッシュ／公開／課金／本番API実行禁止を維持した。

現在の通常表示のLibrary画面：音楽モード `libfile_2ba5e567e9d48191b70879bce0fc3763`。原本 `/tmp/pixieed-viewport-library-helper/PiXiEED-normal-music.png`。Library IDとversion属性を原本に保存済み。

## カメラ色・現在の適用先を含む最終確認（2026-10-11）

描画・音楽・カメラの入口は別々に残し、制作画面では同じアプリのモードを切り替える。旧Drawヘッダーの別ページ撮影ボタンとページ移動処理、統合カメラ内の単体ページ戻りリンクを撤去した。既存の単体URLと旧撮影受け渡しURLの復元処理は維持した。

撮影結果の適用欄に、現在のフレーム番号・レイヤー名・選択範囲の寸法とドット数を表示する。矩形・投げ縄・複数選択・透明セルを含む現在のマスクを参照し、範囲外のセルと他のフレーム／レイヤーは変更しない。選択なしなら現在のフレーム／レイヤー全体へ適用する。非表示の編集可能レイヤーは既存Drawと同様に編集でき、非表示設定を保持する。ロック中・読み取り専用原本・未確定の編集は拒否する。撮影後に対象を変更した場合は適用時の対象を使い、適用処理中に作品・選択が変わった場合は拒否する。

適用失敗の理由は撮影結果の操作欄にも表示し、撮影結果と作品を保持する。統合撮影でも既存のPNG準備処理を通して適用ボタンを実表示する。パレット固定切替直後の古いプレビューは撮影せず、新しい設定のフレームを待つ。再撮影ではパレット固定を再び操作できる。

- Node全1,884件成功、失敗・スキップなし。`/tmp/pixieed-camera-target-all-tests.tap`。
- PC・モバイル各10項目、全20項目成功。現在の対象表示、矩形、タッチ投げ縄、複数選択、仮想カーソル、撮影後の対象変更、選択なし、非表示レイヤー、ロック、読み取り専用原本を検証。全セル・全コマ・全レイヤーの比較とUndo/Redoで、対象外の保持と画素／追加色の一括履歴を確認。`/tmp/pixieed-camera-target/results.json`。
- PC・モバイル各9項目、全18項目成功。既存6色モードと保存パレット、固定ON/OFF、プレビュー／撮影時の作品非変更、実表示ボタンからの適用、新色追加と重複抑止、PXD保存／再読込み、32色上限と半透明の拒否理由を確認。`/tmp/pixieed-camera-colors-palette-final/results.json`。
- 4画面サイズの共通制作画面32項目成功。連続切替、共通作品・設定・Undo/Redo、音楽の再生と退出停止、撮影から描画への適用、通常viewport、WAVの共通出力、別々の3入口から同じ保存作品を復帰。`/tmp/pixieed-camera-target-shared-final/results.json`。
- 退出時リソース3シナリオ成功。音楽タイマー0、AudioContext1/1終了、ノード7/7切断、描画RAF解放、合成カメラのストリーム停止・遅延フレーム公開0を確認。`/tmp/pixieed-camera-colors-resources/results.json`。
- 既存単体カメラ・音楽ページの回帰成功。カメラの6モード・保存パレット・PNG撮影／再撮影・従来横並びUI、音楽の5トラック・描画・再生／停止を確認。`/tmp/pixieed-camera-standalone-qa-result.txt`。

ブラウザー検証はローカルの合成画像のみで、外部通信を遮断し、実カメラ権限要求0・ブラウザー内例外0。実機カメラ／マイク・Safari・物理ペン・実際の音の聴取・実機GIF撮影は未検証。GIFを共通作品の全コマへ直接適用する新規経路は未実装。既存の出力・単体ページ・Offerwall設定を維持する。

最終buildは `/tmp/pixieed-integration-build-review-1zOvSg/site`。663ファイル・イベント86ページ・パズル6ページ、入口／共有コード／出力17ファイルとカメラ変換コアをソースとバイト単位で照合した。今回開始時の110未コミットファイル中102ファイルは同一、残り8ファイルのみが今回の統合カメラ・検証・資料に必要な更新で、欠落0。照合結果 `/tmp/pixieed-camera-target-preservation-final.json`。ショップ・Books・ナビ等の無関係な作業を保護し、V2停止、コミット／プッシュ／公開／課金／本番API実行禁止を維持した。

現在のカメラ色設定のLibrary画面：`libfile_910965d6a90c81918be95f1854a18712`。原本 `/tmp/pixieed-camera-library-final/PiXiEED-camera-color-modes.png`。Library IDとversion属性を原本に保存済み。

## カメラ操作の下寄せ・親コンテナ透明化（2026-10-11）

カメラモードだけを上下2段にし、PC／横画面の右欄上部にあった操作をプレビューの下へ移した。縦画面では既存の下部操作領域内で下寄せする。通常の6ボタン横並びを維持し、色味スライダーを含む長い設定は必要時に欄内スクロールできる。操作領域の高さは画面高に合わせて制限し、短い横画面でもプレビューを残す。カメラの共通キャンバス設定パネルも既存の下部ナビ余白の上へ固定し、プレビュー／適用／閉じるをスクロールで操作できる。短い画面のモードメニューには高さ上限とスクロールを追加した。

共通操作領域・Draw／音楽の操作親・カメラの操作親から背景・枠の見える色・影を取り除いた。旧arcade CSSの親背景だけを対象限定で上書きし、opacityやpointer-eventsは変更しない。子のボタン・入力・設定パネル、キャンバス背景と透明チェッカー、ヘッダー・ナビの背景は保持する。Draw／音楽の配置とキャンバスの論理寸法・作品・パレットは変更しない。全画面／floating UIは追加していない。

通常の6ボタン欄の上端の前後（画面上端からのpx）：PC 1280×800は69→634、390×844は544→678、320×568は273→402、横844×390は69→239。PCは右上→下部、縦画面は下部領域の上寄せ→下寄せとなった。ヘッダー・ナビの位置は同一。

- 1280×800・390×844・320×568・844×390・320×480・844×320の6サイズ、48項目成功。変更前CSSとのDraw／音楽配置比較、透明な親と不透明な子、空き領域からの描画貫通なし、プレビュー／ナビ非重複、色味調整と戻る、6色モードと固定オプション、設定プレビュー／適用／閉じる、撮影結果から戻る／作品へ適用／一括Undo、連続切替、34px下端余白を模した配置を確認。`/tmp/pixieed-camera-bottom-qa/results.json`。テストスクリプトは `/tmp/pixieed-camera-bottom-qa.mjs`。
- 共通制作32項目、カメラ色18項目、現在の選択／レイヤー／フレーム適用20項目の回帰成功。それぞれ `/tmp/pixieed-camera-bottom-shared-final/results.json`、`/tmp/pixieed-camera-bottom-palette/results.json`、`/tmp/pixieed-camera-bottom-target/results.json`。
- 音楽・描画・合成カメラ退出のリソース3シナリオ成功。`/tmp/pixieed-camera-bottom-resources/results.json`。今回対象のbuild／接続／色追加Nodeテスト12件成功。`/tmp/pixieed-camera-bottom-node.tap`。全1,884件の前回結果と今回の局所12件は別の実行記録で、合算しない。

ブラウザー内例外0、端末カメラ権限は要求・許可していない。実機のsafe area・Safari・実カメラは未検証。スクリーンショットは `/tmp/pixieed-camera-bottom-qa/` と変更前 `/tmp/pixieed-camera-bottom-before/` に保存。現在のモバイル画面をLibraryへ保存済み：`libfile_d17ee2a4b74881919a69efa41f0a208f`、原本 `/tmp/pixieed-camera-bottom-library/PiXiEED-camera-bottom-transparent.png`。

最終の一時buildは `/tmp/pixieed-integration-build-review-zRkPtX/site`、663ファイル・イベント86ページ・パズル6ページ。17対象ファイルはソースとバイト単位で一致。今回の開始時114未コミットファイルは `/tmp/pixieed-camera-bottom-backup-20261011/` に保存し、無関係なショップ／Books／ナビ等の差分を保護した。共通出力・Offerwall・V2停止を維持し、コミット・プッシュ・公開・課金・本番API実行は行っていない。

## モード切替モーション・追加下寄せ（2026-10-11）

入口は描画・カメラ・音楽で別々に残し、開いた先は同じPiXiEEDrawの制作画面のモードとする。カメラ操作欄だけさらに12px下げた。描画・音楽・ヘッダー・ナビの配置は保持する。カメラ入場はシャッターを開き、退出は閉じる。描画と音楽は同じ色調の描線／バー演出。退出110ms・入場170msで、UIのtransform/opacityだけを動かす。最新の切替要求で演出と初期化スコープを取り消し、古い読み込み結果を採用しない。

切替の冒頭で描画再生・音声・カメラを停止する。音声は既存8msフェード／28ms解放を保持し、110msの退出演出完了より前に解放する。切替中は制作画面の入力を遮断し、モードメニューは最新要求を受け付ける。演出面自体は常にpointer-events:none。終了・取消・失敗時にhidden、animation、inert、busy属性を解除する。モーション低減・非表示文書では演出を省略し、animation.finishedが返らなくても時間上限で操作を復帰する。

- 6画面サイズ48項目成功。追加下寄せ、透明な親と操作可能な子、ナビ非重複、色調整／6色モード／パレット固定、設定／撮影／適用／一括Undo、連続切替、34px下端余白を模した配置。`/tmp/pixieed-mode-motion-layout/results.json`。
- 6サイズと初回読み込み失敗・遅延／最新要求の9シナリオ成功。入力遮断、元モード復帰、reduced motion、未完了animationのタイムアウト、模擬visibility復帰と終了後のブロッカー不在。`/tmp/pixieed-mode-motion-qa/results.json`。
- 共通制作32項目、カメラ色18項目、適用対象20項目成功。`/tmp/pixieed-mode-motion-shared/results.json`、`/tmp/pixieed-mode-motion-palette/results.json`、`/tmp/pixieed-mode-motion-target/results.json`。
- 音声・描画・合成カメラのリソース3シナリオ成功。途中4切替の記録で、演出中に音楽タイマー／描画RAF／音楽RAFが0、カメラポンプ停止、合成ストリーム停止を確認。`/tmp/pixieed-mode-motion-resources/results.json`。

実際のローカル画面を録画したGIF、WebM、スクリーンショットは `/tmp/pixieed-mode-motion-deliverables/` に保持。GIFは実ブラウザーの104キャプチャから作成し、演出時間を延長していない。Library保存は今回の接続で完了できず、新しいLibrary IDは取得していない。過去のLibrary IDを今回の画像として返さない。

## BPM／FPSと常設音楽レイヤーの追加要件：第1段階の履歴（2026-10-11）

この節は基盤実装時点の記録。未実装・回答待ちと記した接続は次節で完了した。

BPMと絵のFPSを独立させた。Draw frame.durationMsだけの変更では音列投影を再生成せず、最新のフレーム時間は保存する。音楽側ではsong/linkの実値が変わった場合だけ音声を停止する。絵の再生・停止・コマ移動は音声を止めたり再始動しない。音楽モードでの絵の再生は既存レイヤー／フレーム欄の再生操作を使い、下部ナビの音楽再生ボタンと重ねない。モード退出・文書非表示での未使用処理停止は維持する。

`ensureAnimationMusicLayer()`は専用roleを最下段に1枚追加する基盤。通常8枚＋音楽1枚を許容し、音楽celを全コマで共有する。先頭コマの並替・削除、追加・空白コマ、resize、palette、Undo/Redo、PXD往復でも共有内容を保持する。削除・最下段以外への移動・役割の付替えを拒否する。PXDでは共有celを1件で保存し、曖昧な非共有保存は拒否する。`composeAnimationFrame({excludeMusic:true})`で専用層を除外できる。

この基盤はまだ通常制作画面へ自動適用していない。既存作品へ勝手に専用層を追加・変換せず、画面表示／通常出力に含める既定値について回答を待つ。既存音楽は全フレーム合成の連続音列であり、新しい専用層のみの音列への接続・旧曲移行UIは未実装。

調査では、旧曲のstartTick／durationTicks／音高／音色／velocity／未知フィールド／圧縮タイミングを保持できる既存保存方式を確認した。複数コマの音列を現在の幅の1枚の画素へ圧縮する変換は、長さ・同セルの衝突・コマごとの音程で非可逆になり得る。旧曲は原本と正確な音列を保持し、音楽専用ページとして連続音列を扱う案、または無損失条件を満たす曲だけを単一グリッドへ移す案が必要。音色の4レーンを消して単一楽器へまとめない。詳細は `/tmp/pixieed-music-track-research.md` と `/tmp/pixieed-music-layer-inventory.md`。

音楽付き動画の提案は、音楽尺×再生回数を終了時刻として、絵を各コマのFPSのまま必要回数ループし、末尾は音楽尺で打ち切る。静止画も音声付き動画にできる。新規 `music-video-timing.mjs` はその時間計算とフレーム選択を実装し、非整数フレーム時間を維持する。現在のencoderへは未接続。現encoderはMP4対応ならMP4、非対応ならWebM。GIF／APNGは音声を持たない。新しい依存・有料APIは追加していない。

- Nodeテスト全1,896件成功、失敗／スキップなし。`/tmp/pixieed-music-motion-node-final.tap`。その後の非整数FPS対応は追加テストを含む関連13件で成功。`/tmp/pixieed-music-motion-local-final.tap`。件数は合算しない。
- PC1280×800・モバイル390×844の10項目成功。音声play／stop呼出を計測し、FPS変更・絵の再生／停止・seek後も音声再生が継続し、再始動しないことを確認。`/tmp/pixieed-music-clocks-browser/results.json`。
- BPM/FPS変更後の共通制作32項目再検証成功。`/tmp/pixieed-music-motion-shared-final/results.json`。
- 外部通信を明示遮断した既存単体カメラ／音楽の2シナリオ成功。6色モード・保存パレット・PNG撮影／再撮影、5トラック・描画・再生／停止を確認。`/tmp/pixieed-music-motion-standalone-blocked-result.txt`。

実カメラ・マイク・Safari・実タブの背景化・実際の音の聴取・実機safe areaは未検証。専用音楽レイヤーのUI／移行／新規動画時間方式のencoder接続は未実装で、既存出力経路は維持する。

一時buildは `/tmp/pixieed-integration-build-review-jg6ZMC/site`、665ファイル・イベント86ページ・パズル6ページ。追加モジュールを含む19対象ファイルを現在ソースとバイト単位で照合した。buildテストは追加モジュールの配信も検証する。今回の開始時114未コミットファイルのうち104ファイルは同一、変更10・欠落0。保存原本は `/tmp/pixieed-mode-motion-backup-20261011/`、照合 `/tmp/pixieed-music-motion-preservation-final.json`。通常アニメーションcore／PXDの追加はこの依頼のための変更。無関係なショップ・Books・ナビの差分、共通出力／Offerwall、V2停止を維持した。コミット・プッシュ・本番公開・課金・本番API実行は行っていない。


## 常設音楽レイヤー・出力・黒いモーションの最終実装（2026-10-11）

別々の3入口から同じ制作画面のモードを開く。音楽専用レイヤーを最下段に常設し、削除・移動・役割変更を拒否する。絵の全コマで選択中音楽ページのcelを共有し、絵のフレーム追加・移動・削除・FPS・再生・seekでは曲を変えない。音楽設定へページ選択・追加・複製・並べ替え・削除を追加した。音楽ページ列には旧曲のコマID・列時刻・音高・圧縮タイミングを保持し、音符ID・velocity・未知項目も保存往復で保持する。音色割当・音楽ページの編集は既存Drawの共通Undoへ音楽メタデータのスナップショットとして記録し、絵の画素と音列の投影を分離する。

共有設定のサイズ・パレット変更は全音楽ページにも適用し、全ページの切り取り画素数と時間・音高・音色への影響を事前表示する。パレットの並べ替えは色の音色対応を保持し、追加色は未割当とする。モード切替・音楽ページ表示のための自動cel切替は絵のタイムラプス履歴を消さず、音楽編集を絵のタイムラプスへ記録しない。

通常出力は音楽レイヤーを除外する。既存設定欄の「音楽レイヤーを出力に含める」で任意に含め、編集表示が非表示でも選択中音楽ページを合成する。出力のためにレイヤー表示・画素・Undoを変更しない。動画は別の「音声を含める」（初期ON）で制御する。静止画・絵のアニメーションの両方を曲の尺×再生回数まで記録し、絵は各コマの独立したdurationMsでループする。音声OFFはAudioContext／音声ノードを作らない。新経路は終了後のrelease tailを追加せず、35msの録画開始余白だけを持つ。MP4対応ブラウザーはMP4、それ以外はWebM、共通出力は従来の `/output/work/`。

無損失条件を満たす旧曲は独立した音楽ページへ移行する。旧ページと共通設定の寸法・パレット（色集合・重複数）が異なる場合、旧画像に半透明や共通パレットにない色がある場合、音楽が参照する画像／ページが欠落する場合、保存済み音楽レイヤーとページの対応が壊れている場合は、勝手に減色・短縮せず原曲・元の保存情報を保持し、音楽グリッドを読み取り専用にする。再生・保存・テンポだけの変更は可能で、理由を画面へ表示する。この条件の編集移行UIは未実装。原本audio-source archiveが別内容と衝突する場合は保存を中止して保持し、これは読込時の読み取り専用化とは別の保護である。保存データはmainを絵の正本、audioを音楽ページとして明示し、原本と未知PXD entryを保持する。

切替演出を透明背景の純黒SVGへ変更した。描画はインク塊の落下・潰れ・広がりと飛沫、音楽は別軌道と時差で飛ぶ音符、カメラは6枚の機械シャッター。色・光彩・グラデーションを加えていない。退出110ms・入場170ms、最新要求優先・取消・時間上限・reduced motion・非表示・失敗後再試行・inert解除は保持する。

最終コードの確認記録（別実行の件数は合算しない）：

- Node mjs全1,916件成功、失敗・スキップ0。`/tmp/pixieed-music-wiring-all-tests-final.tap`。
- PC1280×800／モバイル390×844で18項目成功。実画素編集、音色割当、ページ追加／複製／移動／削除、Undo/Redo、絵の追加／seek／FPS後の曲不変、ネイティブ出力チェック操作、モード間保持、PXD保存／再読込み、再生／停止、音声OFF動画。旧audio-only PXDの原曲全体一致・音符ID・未知項目・main/audio独立保存も両サイズで確認。`/tmp/pixieed-music-layer-browser/results.json`。
- 音声呼出を計測した独立BPM／FPS・再生／seekはPC／モバイル計10項目成功。`/tmp/pixieed-shared-music-clocks-browser/results.json`。
- PNG／GIFそれぞれ音楽画素ON/OFFの4条件で、実保存ファイルの絵の画素と音楽の透明／色付き画素を読み戻して確認。`/tmp/pixieed-music-image-output/results.json`。
- 実MediaRecorderでPC／モバイル計8条件、静止画／アニメーション×音声ON/OFF成功。非整数24FPS、BPM120／180、再生1／2回を含み、音楽尺・実ファイル・音声トラック有無・全トラック解放・共有出力メタデータを確認。`/tmp/pixieed-music-video-browser/results.json`。
- 現在のカメラ適用先・範囲・他セル保持・Undo/RedoをPC／モバイル20項目で再確認。`/tmp/pixieed-music-wiring-target/results.json`。
- 黒モーションの6画面サイズ48項目とロード失敗／遅延3シナリオ成功。`/tmp/pixieed-black-music-motion-qa/results.json`。
- 退出リソース3シナリオと途中切替4件成功。タイマー・RAF停止、AudioContext1/1終了、ノード7/7切断、合成カメラ停止。`/tmp/pixieed-shared-music-resources/results.json`。
- 既存単体カメラ／音楽の2シナリオ成功。`/tmp/pixieed-shared-music-standalone.log`。

ブラウザー内例外0。外部通信と実getUserMediaを遮断し、実カメラ／マイク権限は要求・許可していない。実機カメラ、Safari、実タブの背景化、OS safe area、音の実聴取は未検証。GIFを共通作品の全コマへ直接適用する新経路は未実装。

最終の隔離buildは `/tmp/pixieed-integration-build-review-r0WVHL/site`、667ファイル・イベント86ページ・パズル6ページ。主要入口／共有コード／出力24ファイルがソースとバイト単位で一致。122ファイルの開始時保存は `/tmp/pixieed-music-layer-wiring-backup-20261011/`。資料更新前の照合で109ファイル同一・13ファイルは今回の更新・欠落0、ショップ／Books／navの無関係な差分は同一。

新しい黒モーションの実画面GIF・WebM・PNGは `/tmp/pixieed-black-motion-deliverables/`。Library uploadは現在の接続でprepare_uploadsを利用できず、今回の新しいLibrary IDは取得できていない。過去節のIDを今回の黒モーション画像として返さない。

ユーザーが実装完了後のコミット・通常pushを承認したため、最終差分と既存ショップ／navの作業を確認後に実行する。V2別workspace停止、課金・API実行・広告／Offerwall設定変更の禁止は維持する。


## 公開前の読み取り監査・保留（2026-10-11）

親タスク側の自動承認レビューが「未特定のリモートへの未確認作業ツリー全体の共有」を拒否したため、ユーザーのコミット／push希望は保持しつつ実行を保留した。コミット・stage・pushは行っていない。読み取りで確認したbranchは `main`、originは `https://github.com/ReoTsukada/PiXiEED.git`。変更はtracked96・untracked37・計133ファイル、stage0。分類はサイト入口／nav48、カタログ公開データ2、制作統合36、カタログUI／prototype7、資料2、テスト／ローカルbuild harness38。詳細のpath一覧は `/tmp/pixieed-release-readonly-audit.json`。

全133ファイルはテキストで、1MiB超・binary・symlink・秘密ファイル／一時出力path・既知の秘密鍵／サービスtoken形式の一致はない。出典としてconversation message IDが商品データ・資料・harness・testsの4ファイルにあり、商品公開JSONにも含まれる。秘密鍵ではないが、外部共有範囲判断で明示する。Amazon登録確認は既存資料にユーザー確認済みと記録されているため、この統合作業でgateや設定を変更していない。V2別workspaceは対象外。検査は既知パターンと差分レビューの範囲で、あらゆる秘密情報の不存在を保証するものではない。

公開用隔離buildのPC／モバイル音楽18項目も成功した。`/tmp/pixieed-music-layer-built-final/results.json`。共有宛先・内容が確認され、保留解除されるまでpushを実行しない。


既存ショップの現ソース74項目と公開build本体54項目も成功。`/tmp/pixieed-shop-current-final.log`、`/tmp/pixieed-shop-public-built-final.log`。公開buildでは意図的に除外している `/books/room-preview.html` を一般harnessで待機した初回はtimeoutとなったため、公開対象だけを検証する一時harnessで再実行した。prototypeは現ソース74項目に含まれる。製品コード・広告設定は変更していない。最終保護照合は108ファイル同一・今回更新14・欠落0。


## 会話出典の公開データからの除去（2026-10-11）

最新依頼に従い、商品JSON・Books資料・ブラウザーharness・catalog testsの4ファイルから会話出典IDを削除した。JSONのregistrationSource／latestRegistrationSourceと私的な提供時刻は除去し、資料は件数と公開ASINで履歴を説明する。検証対象の選別は公開ASINへ置換した。除去したmetadata以外の商品レコード・URL・URLパラメーターは変更前と完全一致する。新しい秘密／私有ID検査は全133変更ファイルで一致0。tracked96・untracked37のまま増減0。`/tmp/pixieed-release-readonly-audit-after-cleanup.json`。catalog関連15件と音楽移行／読み取り専用関連9件は成功。コミット／pushは保留。

音楽の「ページ」は同じ作品の音楽トラック内部のグリッド列で、別Webページ・別URL・別ツールではない。絵のフレーム列と独立した音楽ページ列を一つのPXD・workspaceで保存し、同じ制作画面内で選択する。読み取り専用fallbackでは音楽画素の描画・ページ追加／複製／移動／削除・音色割当を禁止する。原曲の再生・保存・WAV／動画出力とテンポだけの変更は可能。通常の絵のレイヤーは既存制限の範囲で編集でき、共通設定変更はfallback原曲へ投影しない。

会話出典除去後のショップ回帰74項目も成功。`/tmp/pixieed-shop-provenance-cleanup.log`。隔離公開buildは `/tmp/pixieed-integration-build-review-LSH6ZG/site`（667ファイル）で、商品JSONは現在ソースとバイト一致し、公開テキストにも会話IDは残っていない。詳細は再監査JSONに記録した。


宛先・内容監査と会話情報除去の後、ユーザー承認に基づき監査済み133ファイルの限定コミット・通常pushを再開する。宛先は確認済みの公開リポジトリ `https://github.com/ReoTsukada/PiXiEED.git`、branch `main`。新しいファイルの増減はない。最終の全体テストとstage差分を確認し、既存のCI／Pages公開結果を確認する。

再開時の最終全体テストは277 mjsファイル・1,917件成功、失敗／skip0（会話metadataの回帰1件追加）。`/tmp/pixieed-release-all-tests-final.tap`。fetch後のHEADとorigin/mainの分岐は0／0。Offerwall／広告設定／CI workflow／V2別workspaceは今回変更していない。

## 共有制作画面の操作・保存の追加改善（2026-10-11、ローカル未公開）

別々の入口から同じPiXiEEDrawの各モードを開く構成と既存配置を維持した。今回の変更は次の範囲。

- 空の曲・未割当色・旧曲の編集制限を再生操作の近くへ表示し、音色設定／原本保存への操作と閉じるボタンを追加。音色設定へキーボードフォーカスを移し、状態を読み上げる。明示的な再生再試行では閉じた理由を再表示する。
- 共通設定のEscape・外側クリック・フォーカス復帰をDrawの入力管理へ接続。キャンバス上の最初の外側操作はパネルを閉じるだけで画素を変えない。適用中はフォームを無効化し、同期通知による成功表示の上書きを防止。未適用入力・無変更・失敗・Undo/Redo後を区別する。
- 音楽画素出力／動画音声／再生回数を作品の `creationProject.musicOutput` にversion 1で保存。値を検証し、旧作品・未知version・不正値は既定false／true／1へ復帰。同じversionの未知項目と他のmanifest情報は保持。作品切替・再読込み・プレビュー・実出力の条件を揃え、動画出力条件を画面へ表示する。
- カメラの32色超過に固定パレットでの撮り直し・共通設定・画像選び直しを追加。半透明拒否は別の理由と不透明画像の選択案内を返す。自動減色や透過除去は行わない。
- 旧曲の編集制限から作品操作を開ける。読み込んだ原本または統合前PXDの保存は現在作品の再保存を必要とせず、保管済みbytesをそのまま出力。複製は別作品となり、元作品と原曲を保持するが、編集制限は引き継ぐ。

最終コードでNode 279 mjsファイル・1,921テスト成功、失敗・skip 0。`/tmp/pixieed-polish-all-tests-complete.tap`。隔離buildは `/tmp/pixieed-polish-build-complete-20261011`、669ファイル・イベント86ページ・パズル6ページ。変更した配信16ファイルはソースとbytes一致。`/tmp/pixieed-polish-build-byte-audit.json`。

ChromiumのPC1280×800／モバイル390×844／320×568で共有設定・音楽案内・フォーカス・保存／作品切替・ネイティブBack/Forwardを36項目成功。現ソース `/tmp/pixieed-polish-chromium/results.json`、隔離build `/tmp/pixieed-polish-built-complete/results.json`。音楽ページ・Undo/Redo・保存再読込みの18項目も成功。`/tmp/pixieed-polish-music-layer/results.json`。カメラの模擬権限拒否から画像選択／撮影／適用と32色超過の回復操作はPC／モバイルで成功。`/tmp/pixieed-shared-camera-audit.mjs`。半透明の拒否はNodeで確認し、ブラウザーでの回復操作全体は未検証。

PNG/GIF実保存画素4条件成功。`/tmp/pixieed-music-image-output/results.json`。実MediaRecorder動画の静止画／アニメーション・音声ON/OFFはPC／モバイル8条件成功。`/tmp/pixieed-music-video-browser/results.json`。音声OFFではAudioContext生成0、全録画トラックの終了と共通 `/output/work/` の保存を確認。退出リソース3シナリオと途中切替で音声Context終了・ノード切断・タイマー／RAF／合成ストリーム停止を確認。`/tmp/pixieed-polish-resources-final/results.json`。既存単体カメラ／音楽の6色・保存パレット・撮影／再撮影・5トラック・再生／停止も成功。旧独立ツールの全コピー操作harnessは現在の非表示コマUIへ未対応で、全体の検証完了とはしていない。

旧PXDは読み込み・保存・原本ダウンロード・複製後に音符の全項目、参照画像RGBA、未知manifest／entry、原本SHA-256が一致。複製元のrevisionとPXDハッシュも不変。`/tmp/pixieed-legacy-polish-fixed-qa/summary.json`。文字列化時のキー順による比較結果は判定に使わず、構造とbytesを比較した。

仮想カーソルの初回検査はPC／390px成功、320pxの相対移動assertionは変更前と現行で同じ失敗。その後、下記の追調査で検査のタッチ対象が操作パネルであることを特定し、検査準備だけを修正して4サイズ成功した。floating mouseは変更前・現行とも4画面40項目成功。実機Safari・カメラ・音の聴取・OS safe area・実際の背景化は未検証。既存WebKitバイナリは起動できたが、現Playwrightとの組合せでページ作成が完了せず、WebKitの画面検証には使用できなかった。ブラウザーや依存のインストールはしていない。

実機での最小確認は、カメラ拒否後に画像選択で復帰できること、許可した場合に撮影→描画→Undo/Redo→再入場でカメラが解放／再開すること、音楽の再生／停止とモード退出で実音が止まること。権限許可は端末利用者の操作で行う。

画面PNGは `/tmp/pixieed-polish-built-complete/1280-settings-success.png`、`/tmp/pixieed-polish-built-complete/390-empty-play-visible.png`。Libraryのprepared uploadで `prepare_uploads` を利用できず、新しいLibrary IDは取得していない。ショップ／Books／nav・Offerwall・共通出力設定・V2停止を保持。HEADは `dd17f5e315a7bf3d36a780b14b50f25e1ebcc02b` のまま、今回コミット・push・本番公開はしていない。

### QA1〜5対応と320px仮想カーソルの追調査

QA1は再生付近の理由表示・音色設定へのボタン・フォーカス／ARIA、QA2は共通設定のEscape／外側操作・最初のパッド操作の入力消費・Back後の状態保持、QA3は適用と同期通知の競合・成功／未適用／失敗／無変更・Undo/Redo後の値、QA4は作品別の出力3設定の保存と値検証・再読込／他作品への独立性・プレビュー／出力の条件一致、QA5は色数／半透明／旧曲制限の理由と次操作・原本保存／元を変えない複製に対応した。半透明のブラウザー回復操作全体だけは未検証である。

320px再現はChromium、viewport320×568、DPR3、touchあり、空作品で `/draw/` を開き、仮想カーソルOFFで中央付近の2本指ピンチ後に0キーで100%へ戻し、仮想カーソルONにして描画面中央 `(160,182)` へ1本指を置き、右へ12px動かす。元のassertionは `abs(actualDelta - 12) < 1.5`。開始／終了のカーソルはともに `(160,182)`、実測0pxだった。描画boardは `(6,104)`、308×156px、操作パネルは `(120,180)`、184×70pxで、`elementFromPoint(160,182)` は描画boardでなく `.draw-virtual-controls.draw-floating-mouse` を返す。パッドのpointerdownも生成されていない。つまり操作パネル上のタッチをパッド移動として期待していた検査前提の不一致。

変更前の `/tmp/pixieed-integration-build-review-LSH6ZG/site` と現行workspaceを同じ診断harnessで別localhostポートへ配信し、外部通信遮断・同じ座標／viewport／DPR／assertionで再実行した。両方が同じpanel boundsと0pxを記録。診断は `/tmp/pixieed-virtual-baseline-diagnostic/diagnostic.json`、`/tmp/pixieed-virtual-current-diagnostic/diagnostic.json`。HEAD／変更前build／現行の `draw-virtual-cursor.mjs` SHA-256は全て `fcc93c5b9bc21e5a08ea0214f6def94ef6edf4aa8b5090b53ea28027b91800bd` で、製品入力コードは今回未変更。

検査を削除したり誤差を緩めず、中央がパネルに隠れている場合だけ通常のボタンドラッグでパネルをboard下へ移す前処理をharnessへ追加した。移動時の画素不変と開始点が実際にboardへhitすることもassertする。準備後は320pxで `(160,182) → (172,182)`、期待／実測とも12px。元の全52項目と配置の画素保持1項目、計53項目が4サイズで変更前／現行とも成功。現行 `/tmp/pixieed-virtual-gestures-exposed-pad/results.json`、変更前 `/tmp/pixieed-virtual-exposed-baseline/results.json`、実測 `/tmp/pixieed-virtual-exposed-current-numeric/relative-motion.json`。製品UIの初期位置と入力処理は維持した。

ユーザー影響は、操作パネルに隠れた場所ではパッド移動ができないこと。露出した描画面へ触れるか、既存のボタンドラッグでパネルを移せば操作できる。パッド自体の移動・描画・ピンチ・キャンセル／capture喪失・左右ボタン・Undo・実PNG出力は修正後の検査で成功し、この再現で作品の消失は確認されていない。初期位置を変える製品改修は既存外観保持の要望に反するため行っていない。commit／pushは引き続き行っていない。
