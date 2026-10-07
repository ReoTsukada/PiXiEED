# ジグソーのリサイズアイコン・撮影画像の難易度選択（2026-10-06依頼）

ローカル修正・検証のみ。開始時HEADは `5410e54033de3e04264cd252ac25f2ef6c040c85`、作業ツリーはクリーンだった。途中に別作業が変更したイベントデータ2ファイルは今回の範囲外として保護。コミット、プッシュ、デプロイ、実作品の投稿は行っていない。

この冒頭は実装完了時点の記録。2026-10-07に今回の2点のコミット・プッシュ承認を受けた。公開対象はジグソーHTML/CSS/page/arcade、完成図ハーネス、新しい撮影転送ハーネス、この記録の7ファイルのみ。イベント調査などの別作業は今回のコミットへ含めない。公開前に最新main上で単体・両engineの撮影転送/完成図操作・公開サイトのローカルビルドを再確認する。実作品の投稿と物理カメラは対象外。

リポジトリと祖先に `AGENTS.md` はなく、`.agents/skills` と `.codex` も存在しない。`pixieed-luna-workflow` と Library スキル、既存の [完成図・難易度の記録](jigsaw-preview-controls-update-20261006.md)、[結果一覧の記録](puzzle-result-list-update-20261006.md) に従った。

## 修正

- 完成図右下は、右下へ伸縮する方向に合うNW↔SE両矢印のSVGに変更。26pxの図形、2px線幅、白地と濃色、黄色のhover/押下、青いfocus表示。ボタンは押下中も44×44px。縮小transformは検証で44px未満になるため外した。操作controllerは変更していない。
- 撮影からツール転送で受け取るPXDにジグソーがない場合、以前は `createPxdPuzzleFromMain()` の自動盤面を `showGame()` へ直結していた。今回、原画RGBAと参照を開始待ちの画像として保持し、難易度カードを押すまで開始を無効にする。
- 開始待ち画像は「写真・画像」の選択と画像サムネイル・寸法を表示。ページとArcadeの読込順にかかわらず反映し、同じ画像タイルを押しても画像を失わない。別の画像を明示選択したときは、その画像で開始する。
- 保存済みジグソーのPXDは従来の復元経路を使い、配置・回転・トレー・partitionを保持。PXDインポートは従来どおり新しいrun IDと所有者内参照を発行する。端末内の「つづきから」は元のIDと文書を保持する。
- 原画・解像度・縦横比をCSSで変更しない。PXDの既存成分と元の撮影作品を保持。開始前のPX数selectはhiddenのまま。

## 検証

既存Macのタブや保存領域へ接続せず、新しいPlaywright browser/contextだけを使用。通信はlocalhost以外を遮断。`getUserMedia` を合成canvas streamへ置換し、物理カメラと権限を使わず実際の「撮影→他のツールへ→ジグソー」UIを通した。

- `scripts/jigsaw-camera-handoff-browser-harness.mjs` の `PIXIEED_JIGSAW_BASELINE=1` は元コミットのpage/arcadeを応答し、実転送から選択を飛ばしてplayを表示する症状を再現。
- 修正後はChromium/WebKitの320×568、390×844、844×390、1280×800。正方形、3:4、16:9、4:3の原画を使用。開始無効・未選択、正しい画像タイルとサムネイル、閉じる/戻る/進む/再読込、選択後のpartition、RGBA完全一致、配置/回転保存と再開、元のcamera作品保持、別の画像への切替を確認。
- `scripts/jigsaw-preview-browser-harness.mjs` は各engine13条件。四画面×正方形/横長/縦長と極端な縦長を含む。移動/リサイズ、44px、hover/focus/押下、比率/境界、矢印/Shift/Home/End/Escape、capture/cancel/blur/閉じる、回転、ピースや保存データへの漏れなし、保存再開を確認。390のChromiumはCDP実touch入力も使用。
- 関連単体は `node --test tests/creation-suite/*.test.mjs tests/arcade/jigsaw-arcade.test.mjs tests/pixel-lens/*.test.mjs tests/pixel-scale.test.mjs`。
- 既存の結果一覧4画面とChromiumピースfeedback4条件も確認。古い `pxd-puzzle-camera-browser-harness.mjs` はHEADから既に削除済みのPXD UI/statusを期待して止まるため、書き換えず新しい実転送ハーネスで今回の回帰を確認した。

ログは `/tmp/pixieed-jigsaw-local-review-20261006/`、完成図集計は `/tmp/pixieed-jigsaw-preview-{chromium,webkit}-20261006/results.json`、撮影経路集計と画像は `/tmp/pixieed-jigsaw-camera-handoff-{chromium,webkit}-final-20261006/`。修正前の実転送画像は `/tmp/pixieed-jigsaw-camera-handoff-chromium-before-20261006/camera-auto-start-before.png`。

最終ソースの結果：関連単体857/857、撮影経路Chromium4/4＋WebKit4/4、完成図Chromium13/13＋WebKit13/13 PASS。両ハーネスの全条件でpageerror 0。撮影経路の390pxカード選択はChromiumの実touch（Playwright tap）、完成図はCDP touchを使用。結果一覧4/4、Chromium feedback4/4もPASS。構文確認と `git diff --check` PASS。

## 最新の確認画像

今回の最終ソースで合成カメラの実転送を確認し、Libraryへ保存成功とローカルのLibrary識別情報を確認した。

| 画像 | ローカルパス | 確認済みlibrary_file_id |
|---|---|---|
| 390px・難易度選択前 | `/tmp/pixieed-jigsaw-camera-handoff-chromium-final-20261006/jigsaw-camera-390-difficulty.png` | `libfile_046fb77e3d6c81919fe470e6f7c79965` |
| 390px・保存再開後の完成図と新アイコン | `/tmp/pixieed-jigsaw-camera-handoff-chromium-final-20261006/jigsaw-camera-390-play.png` | `libfile_f90756affebc8191938851ed3988589e` |

その他のhover/focus/押下の画像は `/tmp/pixieed-jigsaw-preview-{chromium,webkit}-20261006/jigsaw-390-resize-{hover,focus,pressed}.png`。各engineの四画面画像も上記のディレクトリに保存。

## 未検証

実機カメラ、物理端末のタッチ、実Safari/iOS/Android、OS権限とスクリーンリーダーは未検証。WebKitはheadless実ブラウザーの合成stream・mouse/keyboardで確認。実BFCacheヒットは主張しない。
