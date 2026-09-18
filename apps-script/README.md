# PiXiEED のGoogle Sheets連携

このフォルダの `Code.gs` は、PiXiEEDの公開データ配信と匿名アクセスイベントの受け口です。

## 初回設定

1. Googleスプレッドシートを作成する。
2. 拡張機能の「Apps Script」を開き、`Code.gs`を貼り付ける。
3. `SPREADSHEET_ID`を、スプレッドシートURLの`/d/`と`/edit`の間のIDに置き換える。
4. `setupPiXiEEDSheets()`を一度実行する。
5. `installPiXiEEDTriggers()`を一度実行し、イベントの自動更新（6時間ごと）を登録する。アクセス集計は`rollupAnalytics()`を時間主導トリガーで1日1回実行する。
6. ウェブアプリとしてデプロイし、公開URLを`data/site-config.js`の`publicDataEndpoint`と`analyticsEndpoint`へ設定する。
7. `data/admin-config.js`にOAuthクライアントID、スプレッドシートID、あなたの管理者メールアドレスを設定する。

## ホームの地図

ホームはGoogle Maps APIを使わず、都道府県SVGの独自マップで表示します。`map_x`と`map_y`を入力しないイベントは、都道府県の近似位置へ自動配置されます。正確な会場位置を見せたいイベントだけ、スプレッドシートへ座標を入力してください。

`Stores` / `PublishedStores` の `lat` と `lng` に、Google Mapsで確認した店舗の緯度・経度を入力してください。公開済みデータに座標がある店舗だけが、実地図上のPiXiEEDピンとして表示されます。住所だけから推測せず、Place IDも併記できる構成にしています。

公開データは`PublishedWorks`、`PublishedStores`、`PublishedStoreWorks`、`PublishedEvents`だけから返します。下書き用の`Works`、`Stores`、`StoreWorks`、`Events`は公開APIから返しません。

イベントは全国47都道府県を対象にできます。`Events`に登録し、公開する行だけを管理室の「公開する」で`PublishedEvents`へ反映します。`prefecture`、`date_label`、`start_date`、`venue`、`source_url`、`map_x`、`map_y`を入力すると、県のイベントピンと公式情報カードに表示されます。開催日が未発表の情報は`status`を`watch`にして、開催予定と区別してください。

## イベントの自動更新

`setupPiXiEEDSheets()`を実行すると、`EventSources`シートに自動取得元の一覧が作られます。取得元ごとに次の項目を設定できます。

- `source_type`: `jsonld`（公式ページ）、`rss` / `atom`、`ics`、`json`
- `prefecture` / `area`: 情報元に場所がない場合の補完値
- `keywords`: `ドット|pixel|ピクセル`のような絞り込み語
- `enabled`: `TRUE`で取得
- `auto_publish`: `TRUE`なら取得した開催予定を自動で公開

`installPiXiEEDTriggers()`を一度実行すると、6時間ごとに公式情報を取得し、`Events`と`PublishedEvents`を更新します。終了したイベントは公開データから自動的に除外されます。

SNSの画面を無断で巡回する方式は、仕様変更・利用規約・API制限によって壊れやすいため採用していません。SNSを対象にする場合は、公式APIや公式RSSなど、許可されたフィードを`EventSources`に登録してください。JSON-LDを公開している公式イベントページなら、ページURLだけで取得できます。

管理ページのOAuth設定では、このスプレッドシートをあなたのGoogleアカウントだけに共有してください。秘密鍵やサービスアカウントJSONはリポジトリへ置かないでください。

## QRコードのURL

作品と店舗を紐付けたQRコードは、次の形式のURLをQR化します。

`https://pixieed.jp/works/sea-cat.html?source=qr&qr=sea-cat-cafe-hoshi&work=sea-cat&store=cafe-hoshi`

`qr`はQRごとに重複しない管理IDにしてください。読み込み時に、作品ID・店舗ID・QR ID・匿名セッションが`AnalyticsRaw`へ記録されます。
