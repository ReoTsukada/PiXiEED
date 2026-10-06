# GitHubに依存しない公開経路

2026-10-06。現在の通常経路は `.github/workflows/pages.yml` による GitHub Actions → GitHub Pages。予備経路は、ローカルのGit作業コピー → 公開用ZIP → Netlifyへの手動アップロード。ソース取得と作成・送信の処理をGitHubの稼働状態から切り離す。

## 今回用意したもの

`scripts/build-portable-release.mjs` は既存の公開ビルダーを再利用し、新規の出力ディレクトリへ `site/`、`site.zip`、`release.json` を作る。ZIPはサイト直下のファイルから始まり、配信用フォルダの余計な親階層を持たない。公開用ファイルと公開済みパズル共有ページだけを含む。DBスクリプト、テスト、非公開文書、未追跡ファイル、未公開Booksは含めない。作成日時、ローカルGitリビジョン、追跡済み変更の有無、ファイル／ZIPのSHA256は、配信対象外の `release.json` に保存する。

ZIPの生成にGitHubのネットワーク接続は必要ない。ただし事前にソースの作業コピーが必要。使用するのはNode.js 22以上、ローカルGit、システムのzip。通常のパズル更新には既存ChromeまたはPlaywrightと、公開データの読み取り接続が必要。依存パッケージの自動インストールは行わない。

```sh
PIXIEED_CHROME_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  node scripts/build-portable-release.mjs --output /tmp/pixieed-release-new
```

通常は最新の公開パズル情報を読み直す。取得／生成に失敗した場合はZIPを作成しない。出力先はリポジトリ外の、まだ存在しないディレクトリを指定する。既存の出力は上書き・削除しない。

保存済みパズルを明示的に再利用する緊急用／ローカル検証用の経路:

```sh
node scripts/build-portable-release.mjs --output /tmp/pixieed-release-offline --reuse-puzzles
```

このモードは両ゲームの生成済みディレクトリの存在・形式を検査し、欠落したパズルを黙って省略しない。ただし保存後の新規投稿・公開取消・削除は反映されない。通常の公開には最新情報を読み直す経路を使う。どちらのモードも、コマンド単体では外部アップロード・DNS変更・コミット・pushを行わない。

## 予備配信先を接続する手順

1. Netlifyアカウントで、GitHub連携なしの静的サイトとして予備プロジェクトを作る。最初は `*.netlify.app` の予備URLで確認する。
2. Git未接続の既存siteは、ログイン後のDeploysページにあるProduction deploysのdropzoneへ `site/` フォルダをドラッグして更新する。ZIPから作業する場合は先に解凍し、`index.html` が直下にあるフォルダを渡す。APIを利用する場合は、既存siteへのdeploy APIへ `site.zip` を送る。APIは `POST https://api.netlify.com/api/v1/sites/{site_id}/deploys?production=true` に ZIP raw body、`Content-Type: application/zip`、Bearer認証を渡す。認証トークンはローカルで扱い、Git・公開フォルダ・チャットへ保存しない。
3. マイページ、地図、作品表示、共有ページ、スマートフォンの操作と読み込みを予備URLで確認する。別ホスト名のログイン、カメラ、埋め込み、ブラウザ保存の互換性は別途検証する。共有ページのcanonicalは既存の `https://pixieed.jp` を維持している。
4. `pixieed.jp` をNetlify側へ登録し、TLSが用意できる状態か確認する。予備サイトが正常と確かめられてからDNSを切り替える。
5. 現行DNSは `01.dnsv.jp`〜`04.dnsv.jp`。DNS事業者を維持する場合、Netlify公式案内に従ってapex AをNetlify向けへ変更する（現在の案内は `75.2.60.5`、変更時に再確認）。wwwを使用する場合はそのCNAMEも切り替える。旧設定を記録して戻せるようにする。
6. 本番のHTML/CSSと主要操作が同じリリースになったことを確認する。GitHub Pagesは予備として保持する。以降も同じZIPを使って配信先を更新できる。

DNSキャッシュによって切替中に旧／新の配信先へ分かれるため、即時切替や自動フェイルオーバーではない。サイトを止めずに更新するには両方を有効に保ち、最後に配信先のDNSを切り替える。この文書はアカウント作成、課金、DNS変更を実施した記録ではない。

## 無料枠と他の候補

Netlifyの新しいFreeプランは月300 creditsの上限があり、本番deployは1回15 creditsを消費する。通信量・リクエストも消費するため、無料で無制限に運用できる構成ではない。現在のGitHubの15分ごとのOGP同期をそのまま予備サイトへ複製しない。最初は必要時の手動公開に限定し、使用プランと残量を確認する。有料プラン／自動課金は今回設定しない。

Cloudflare Pages Direct UploadもGitHubなしで使えるが、1ファイル25MiBまで。現行の公開対象 `assets/pixel-studio/test-media/street.webm` は31,210,739 bytesで、このままの成果物は上限に収まらない。今回この素材を除外・移動する変更は行わない。また `pixieed.jp` のapexをCloudflare Pagesへ載せるにはCloudflareへのnameserver変更が必要。Cloudflareはサイズ調整とDNS方式の検討を行う将来候補とする。

投稿データ・認証のバックエンド、DNS事業者、端末内のデータはこの作業では複製しない。公開用ZIPのコピーをPC以外にも保管すると、作業PC一台への依存も減らせる。別Gitサービスのミラーは別途選定する。

## 今回の検証結果

- IMPLEMENTED: 可搬ZIP作成ツールと手順。限定テスト `node --test tests/creation-suite/portable-release.test.mjs` は5/5 PASS（refresh成功・失敗、保存済みページ、公開除外、出力先保護）。JS構文確認もPASS。
- 実作業コピーの `--reuse-puzzles` で476ファイル・6共有ページのZIPを作成。61,484,798 bytes。ZIPと収録全ファイルのSHA256一致、非公開ファイルの除外を確認。
- UNIMPLEMENTED: Netlifyアカウント／予備siteの接続、DNS切替、自動フェイルオーバー、バックエンドの複製。契約・課金設定は行っていない。
- UNTESTED: 実公開データによる今回のrefresh、予備ホストでのブラウザ／実機／本番動作。fixture成功はこれらの証明ではない。
- 作業時の週間使用量は62% → 62%（表示上の差0ポイント）。

## 公式資料

- [Netlify手動公開と既存site更新](https://docs.netlify.com/deploy/create-deploys/)
- [Netlify deploy API](https://open-api.netlify.com/)
- [Netlify外部DNS設定](https://docs.netlify.com/manage/domains/configure-domains/configure-external-dns/)
- [Netlify現行料金・credit制限](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/)
- [Cloudflare Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Cloudflare Pages制限](https://developers.cloudflare.com/pages/platform/limits/)
- [Cloudflare独自ドメインの条件](https://developers.cloudflare.com/pages/configuration/custom-domains/)
