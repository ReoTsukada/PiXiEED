# OGPと検索文言の検討：保留中

2026-10-02。ローカルの採用レビュー用資料。現行HTML、公開OGP画像、canonicalは変更していない。commit・push・公開も行っていない。

## 最新の画像方針

ユーザーの「全くサイトらしさがありません。もっとサイトの要素にちなんだデザインで」という評価により、赤い一点から紙・ガラス・金属状の造形が開花する抽象案は不採用。前案の微修正ではなく、現在のローカルサイトの実画面から設計し直した。「ドット絵不要」は広告全体のピクセルアート制約の撤回であり、本物のUIや作品例の小さなピクセルは使用できる。

描画・音楽・ジグソー・地球儀・カメラ・ホームの現行画面を専用ブラウザーで実際に確認した。すべて外部通信を遮断し、ユーザー投稿・個人画像・本番データは広告素材に使用していない。描画とジグソーには今回自作した32×32の風景を読み込んだ。音楽の譜面も実UI上で今回作成した。カメラ確認は自作風景の模擬映像のみで、実機のカメラ・マイク権限は要求していない。素材確認記録は [material-audit.json](ogp-review/product-materials/material-audit.json)。

最新完成案は、濃紺と白の二つの面に、大きな文字と実際の描画ワークベンチを配置したプロダクト広告。主役は自作の風景を載せた制作キャンバス。前面に実際の色の譜面、手前に同じ絵からできた実ジグソー片、背景に実地球儀を配置し、主役・補助の大きさと重なりを付けた。カメラの画面は確認素材として保持し、完成構図へ小さく詰め込んでいない。

正式48pxロゴを原寸で使用し、ホームの多色PiXiEEDワードマークの実装から文字マスクと配色を再利用した。背景の濃紺 `#0f1822`、白 `#f7f8f6`、黄色 `#ffd35a`、珊瑚色 `#e75445` は実サイト由来。キャンバス・パレット・黄色の道具選択・音楽譜面は実画面の切り取りを使い、汎用の描画アイコンで置き換えていない。

コピーは「一つのドットから、ひろがる。」「ドットであそぼう」で固定。主コピーは画像上で2行に組んだ。1200×630の寸法、指定コピーと文字のキャンバス内収まりをコードで確認し、実寸と600×315の縮小表示を目視確認した。下端の切れと重なった小ラベルを調整した完成案をLibraryへ保存した。

**画像制作は完了、採用・本番反映は保留。** Library ID `libfile_43bcd052086c81918a5e5b8820bd4e69`、ファイル名 `ogp-product-workbench-1200x630.png`、version 0。編集元HTMLは実画面素材を埋め込んだ単体ファイル。今回の完成案はコードによる構成と実画面素材で制作し、AI画像生成やFigmaは使用していない。

## 過去案の制作手段とFigmaの状態

不採用の抽象開花案は親スレッドでOpenAI画像生成とFigmaのネイティブ文字組みを使用。Figma AI / Weaveは有料利用の承認が必要なため未使用。

[過去案のFigma編集用リンク](https://www.figma.com/design/dS2zyoZW1BjH9xlVb4BDce?node-id=2-2) は文字組みのみ。親スレッドの報告では公式uploadがHTTP 405となり画像配置は未完了。最新の実UI広告や完成PNG全体の編集元ではない。今回はFigmaへの配置を再試行していない。

検索・OG文言は下記の候補として保持し、採用時に画像と `og:title`、`og:image:alt` の意味を揃える。新投稿・販売・制作依頼や未公開ゲームを利用可能な機能として宣伝しない。

## ホームの文言候補

以下は推奨候補であり、未反映・採用保留。

| 対象 | 文言 |
| --- | --- |
| `title` | ドット絵を描く・撮る・遊ぶ｜PiXiEED |
| `meta description` | ブラウザでドット絵を描いたり、景色をドット絵で撮ったり。色を置いて作曲し、絵や写真をジグソーパズルにして遊べるPiXiEED。間違い探しやもの探しも楽しめます。 |
| `og:title` | ドット絵で、つくる。あそぶ。｜PiXiEED |
| `og:description` | 描いた絵、目の前の景色、色から生まれる音。ブラウザで気軽に楽しめる、ドット絵と音楽、パズルのあそび場。 |

Twitterのタイトル・説明、`og:image:alt` は最終画像と各メタ文言の採用後に揃える。新画像のURLはまだ決めず、現在の `https://pixieed.jp/assets/og/site.png` を差し替えない。

## ツール別タイトル候補

| ページ | 文言 |
| --- | --- |
| `/draw/` | ドット絵をブラウザで描く｜かんたんドット｜PiXiEED |
| `/pixel-camera.html` | ドット絵カメラ｜景色をドット絵で撮影・PNG保存｜PiXiEED |
| `/audio/` | 絵を描いて作曲｜ブラウザで楽しむドットで音楽｜PiXiEED |
| `/jigsaw/` | 写真や絵でジグソーパズル｜かんたんジグソー｜PiXiEED |

各ページの本文・主要見出し・タイトルの意味を揃える。未公開ゲームの制作、販売、新SNS機能は候補へ追加しない。説明には検索語だけを並べず、実際に何ができるかを具体的に書く。

## 確認済みの現行状態

公開URLは `https://pixieed.jp/`。2026-10-02 10:08 UTCの隔離ブラウザー調査では `/` と `/index.html` は両方HTTP 200、HTMLのSHA-256も一致し、canonicalは両方とも `https://pixieed.jp/` だった。ローカルの `index.html` も同じ内容。canonical変更や転送追加は今回の提案に含めない。

現行titleは「ホーム｜ドット絵であそぶ PiXiEED」。descriptionにはゲーム制作が含まれるが、ホームのかんたんゲームは「もうすぐ」表示のため、候補では公開済みの機能へ絞った。古い検索結果のMarket等の文言だけで、現在販売可能とは判断しない。

## 保存済み画像と状態

以下は現在のレビュー対象と過去案を区別した保存記録。いずれも現行サイトから参照していない。

| ファイル | 状態・由来 |
| --- | --- |
| [最新の実UI広告PNG](ogp-review/ogp-product-workbench-1200x630.png) | **最新案・採用待ち**。1200×630。Library ID `libfile_43bcd052086c81918a5e5b8820bd4e69`、Library名 `ogp-product-workbench-1200x630.png`、version 0。 |
| [編集元HTML](ogp-review/ogp-product-workbench.html) | 実素材を埋め込んだ単体HTML/CSS。文字組み・配色・配置を編集可能。 |
| [縮小プレビュー](ogp-review/ogp-product-workbench-preview-600x315.png) | 600×315で主コピー・描画キャンバス・譜面・パレットの可読性を目視確認。 |
| [制作コード](ogp-review/render-product-ogp.mjs) | 確認済み素材からHTML・PNG・プレビュー・検証記録を生成する。 |
| [検証記録](ogp-review/ogp-product-workbench-verification.json) | 寸法・指定コピー・文字の収まり・素材由来・外部通信遮断を記録。 |
| [素材撮影コード](ogp-review/capture-product-materials.mjs) | 現行サイトをループバックで表示し、自作デモを読み込んだ実UIを保存。実機の撮影・本番書込みなし。 |
| [抽象開花案](ogp-review/ogp-design-bloom-1200x630.png) | **不採用・サイトらしさがないとの評価**。1200×630。Library ID `libfile_1f32776943dc81919f25cdaa2dada9ce`、Library名 `PiXiEED-OGP-1200x630.png`。LibraryからMacへ取得し、目視・寸法を確認。 |
| [ピクセルポスター案](ogp-review/ogp-pixel-poster-1200x630.png) | **過去案・方針変更により置き換え**。1200×630、濃紺背景。Library ID `libfile_d4506f6e6f3081918b3aec28a298eddf`、保存名 `ogp-pixel-poster-1200x630.png`、version 0。 |
| [過去ピクセル案の編集元SVG](ogp-review/ogp-pixel-poster.svg) | 正式ロゴを埋め込んだ編集可能SVG。モチーフは均一10pxセル。 |
| [過去ピクセル案の縮小プレビュー](ogp-review/ogp-pixel-poster-preview-600x315.png) | 600×315でコピーと主役の形を目視確認。 |
| [過去ピクセル案の制作・書き出しコード](ogp-review/render-pixel-poster.mjs) | セルマスク・配色・文字組みを編集でき、明暗の比較画像と検証記録を再生成する。 |
| [過去ピクセル案の検証記録](ogp-review/ogp-pixel-poster-verification.json) | 各案1200×630、10pxグリッド、893セル・89,300ピクセル一致、指定コピーと文字の収まり。 |
| [明るい背景の比較案](ogp-review/ogp-pixel-poster-light-1200x630.png) | 同じ構図の生成り背景。比較用として保持。 |
| [前の組み上げ案](ogp-review/ogp-pixel-assembly-1200x630.png) | **過去案**。ユーザーのチープさへの指摘で改稿。Library ID `libfile_c61dc49aa3c08191ba44b53a85905d4b`。旧SVG・コード・プレビュー・検証記録も保持。 |
| [滑らかなリボン版の元画像](ogp-review/ogp-flow-review-original.png) | **過去案・最新方針で置き換え**。1730×909 PNG。Library ID `libfile_f7f174d0abec8191b3bea1a40b2a8854`、元ファイル名 `exec-4a98effb-40e3-485f-9c5e-0f97883f3493.png`。生成画像の履歴として保持。旧見出しは「ひとつのドットから、ひろがる。」。 |
| [滑らかなリボン版の1200×630画像](ogp-review/ogp-flow-review-1200x630.png) | **過去案**。元画像を1199×630へ縮小し右端1pxを延長した版。現行サイトから参照せず、最新案として使わない。 |
| [生成イラスト初案の元画像](ogp-review/ogp-initial-original.png) | **不採用**。1731×909 PNG。指定Library ID `libfile_002e02aadbd88191b746566bacebfb80` の画像をMacへ実体化し、読取りと目視を確認。ピクセルパーフェクトでない生成イラストへのユーザー指摘により、サイズ調整せず停止。生成ロゴを正式ロゴと同一扱いしない。 |
| [正式ロゴと文字の案](ogp-review/ogp-brand-1200x630.png) | **未採用・方向変更で停止**。最新指示が到着する前に書き出し済みの1200×630 PNG。新方針の代替として使わない。Libraryへの保存は行っていない。 |
| [文字案の編集元](ogp-review/ogp-brand.html) | 未採用案のHTML/CSS。正式48pxロゴを3倍の144px、整数座標で配置。 |
| [文字案の小サイズ画像](ogp-review/ogp-brand-preview-600x315.png) | 停止前に出力済みの600×315プレビュー。目視採用レビューは未実施。 |
| [書き出し用スクリプト](ogp-review/render-ogp.mjs) | 停止した文字案の再現用。既存Playwrightモジュールが必要。新方向の画像を制作するものではない。 |
| [書き出し検証記録](ogp-review/ogp-brand-verification.json) | PNG寸法、要素の収まり、ロゴ3倍拡大の20,736ピクセル一致を確認した記録。採用・公開や新方向の検証を意味しない。 |

最新PNGをLibraryへ新規保存し、識別情報とversion 0をMac側にも保持した。抽象案のLibrary ID `libfile_1f32776943dc81919f25cdaa2dada9ce` と過去の画像は削除・上書きしていない。現行HTML、公開画像、canonicalは変更せず、commit・push・公開も行っていない。

## 検索表示の根拠と検証境界

Googleはページのtitle、主要見出し、本文、`og:title`等から検索結果のタイトルを自動生成する。ページを具体的に説明し、主要な見出しと意味を揃えることを重視する。変更の認識には再クロール・再処理が必要で、指定文がそのまま表示される保証はない。[Google検索セントラル：タイトルリンク](https://developers.google.com/search/docs/appearance/title-link?hl=ja)

検索結果の説明は主に本文から生成され、ページを適切に表す場合にはmeta descriptionも使われる。検索語によって表示内容が変わるため、説明文の設定だけで検索表示や順位の改善を保証しない。[Google検索セントラル：スニペット](https://developers.google.com/search/docs/appearance/snippet?hl=ja)

本文との整合、最終画像の目視、小さいカードでの読みやすさ、共有画像URL・寸法・alt、検索メタとOG/Twitterメタの整合は採用時に確認する。検索順位、検索エンジンの再クロール、SNS上のカード表示はこの資料の保存では検証していない。
