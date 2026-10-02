# OGPと検索文言の検討：保留中

2026-10-02。ローカルの採用レビュー用資料。現行HTML、公開OGP画像、canonicalは変更していない。commit・push・公開も行っていない。

## 最新の画像方針

ユーザーが「ドット絵は不要」「イラストというよりも高品質なデザイン性で画期的なOGP」「Figma AIの使用も考慮」と方針を変更したため、均一セル・整数グリッド・平面ピクセル表現の制約は撤回した。音符やコントローラーのピクセル案は過去案として保持する。

最新完成案は、赤い一点から紙・ガラス・金属のような色と形が開花するビジュアル。生成りの余白に黒い文字を置き、右側に赤・青・金色の立体的な造形を大きく配置する。コピーは「一つのドットから、ひろがる。」「ドットであそぼう」で固定。主コピーは画像上で2行に組まれている。PiXiEEDのワードマークと `pixieed.jp` も目視確認した。ワードマークを既存正式ロゴと同一の素材とは扱わない。

完成PNGは親スレッドで実画像を確認してユーザーへ納品済み。Library ID `libfile_1f32776943dc81919f25cdaa2dada9ce`、Library上のファイル名 `PiXiEED-OGP-1200x630.png`。MacへLibraryから取得し、別名 `ogp-design-bloom-1200x630.png` で保存した。Mac側でも目視と1200×630の寸法を確認済み。**完成画像の最新レビュー案であり、採用・本番反映は保留。** 新たな画像生成は行っていない。

## 制作手段とFigmaの状態

親スレッドでの制作手段はOpenAI画像生成とFigmaのネイティブ文字組み。Figma AI / Weaveは有料利用の承認が必要なため未使用。Figma AIで制作した画像とは記録しない。

[Figma編集用リンク](https://www.figma.com/design/dS2zyoZW1BjH9xlVb4BDce?node-id=2-2) はネイティブの文字組みのみ。親スレッドの報告では公式uploadがHTTP 405となり、画像配置は未完了。したがってFigmaファイルを完成PNG全体の編集元とは扱わない。今回Mac側でFigmaへの画像配置は再試行していない。

検索・OG文言は下記の候補として保持し、画像採用時に `og:title` と `og:image:alt` の意味を揃える。新投稿・販売・制作依頼や未公開ゲームを利用可能な機能として宣伝しない。

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
| [最新完成PNG](ogp-review/ogp-design-bloom-1200x630.png) | **最新案・採用待ち**。1200×630。Library ID `libfile_1f32776943dc81919f25cdaa2dada9ce`、Library名 `PiXiEED-OGP-1200x630.png`。LibraryからMacへ取得し、目視・寸法を確認。 |
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

最新完成PNGはLibraryの既存ID `libfile_1f32776943dc81919f25cdaa2dada9ce` を保持してMacへ保存した。新規Libraryファイルは作成していない。過去の画像は削除・上書きしていない。現行HTML、公開画像、canonicalは変更せず、commit・push・公開も行っていない。

## 検索表示の根拠と検証境界

Googleはページのtitle、主要見出し、本文、`og:title`等から検索結果のタイトルを自動生成する。ページを具体的に説明し、主要な見出しと意味を揃えることを重視する。変更の認識には再クロール・再処理が必要で、指定文がそのまま表示される保証はない。[Google検索セントラル：タイトルリンク](https://developers.google.com/search/docs/appearance/title-link?hl=ja)

検索結果の説明は主に本文から生成され、ページを適切に表す場合にはmeta descriptionも使われる。検索語によって表示内容が変わるため、説明文の設定だけで検索表示や順位の改善を保証しない。[Google検索セントラル：スニペット](https://developers.google.com/search/docs/appearance/snippet?hl=ja)

本文との整合、最終画像の目視、小さいカードでの読みやすさ、共有画像URL・寸法・alt、検索メタとOG/Twitterメタの整合は採用時に確認する。検索順位、検索エンジンの再クロール、SNS上のカード表示はこの資料の保存では検証していない。
