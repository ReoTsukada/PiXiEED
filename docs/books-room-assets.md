# ドットのお店の素材

本棚・お店は一般公開前の試作です。道具一覧・サイトマップへの掲載とGitHub Pagesへの公開は保留しています。 `scripts/build-pages-site.mjs` でBooksのHTML・専用素材・CSS・JSを公開成果物から除外します。
試作は `/books/room-preview.html`。作成済みの `/books/` と素材もローカルで維持しています。
店内と商品の絵は仮素材です。実際の商品写真・表紙ではありません。

## 絵の差し替え

描いたPNGを `assets/books/` 以下に置き、`assets/books/room-scene.json` の `assets` へ登録します。画像が読めない場合は仮の絵を表示します。

### 基本の作画単位

店内の基本単位は **1ワールドピクセル = 元絵の1ピクセル** です。キャラクター・商品・記事の静止絵は、まず透明背景の16×16 PNGで描きます。ゲーム内で拡大・縮小して見せず、カメラの表示倍率だけで画面上の大きさが変わります。16×16は基本寸法で、表現に必要なら設定に実寸を明記した大きな絵も使えます。

人物は `character.src` に登録し、足元が位置の基準です。設定を省略した場合の1コマは16×16、静止表示は1コマ・下向きです。16×16 PNG 1枚でも使えます。4方向に各4コマの歩行絵を作る場合は、1コマ16×16の4列×4行、全体で64×64ピクセルのシートにします。設定例:

```json
"character": {
  "src": "/assets/books/my-character.png",
  "frameWidth": 16,
  "frameHeight": 16,
  "frames": 4,
  "fps": 6,
  "directionRows": ["down", "left", "right", "up"]
}
```

方向は上から `directionRows` の順に並べ、各行は左から歩行コマを置きます。静止絵なら `frames: 1` とし、必要なら `directionRows: ["down"]` を指定します。明示的な `frameWidth` / `frameHeight` は16より大きくても構いません。指定サイズに合わせてシートも作ってください。

`assets.products` には商品IDまたは記事IDをキーにした画像設定を置きます。16×16の静止画なら寸法設定を省略できます。アニメーションは1コマ16×16の絵を横に並べます。`frames` を省略すると画像の横幅を1コマの幅で割ってコマ数を判定します。コマ数を明示したい場合は `frames` に設定します。例:

```json
"product-dot-classroom": {
  "src": "/assets/books/my-book.png",
  "frameWidth": 16,
  "frameHeight": 16,
  "frames": 1
}
```

記事IDも同じ `assets.products` に指定できます。記事用の画像がない場合は内蔵の仮絵が表示されます。商品・記事も必要に応じて16×16より大きいコマを明示できます。動きを減らす設定では1コマ目を表示します。

## 配置と商品説明

`room-scene.json` の `productSpots` が商品配置、`articleSpots` が記事配置です。`x` は絵の中心、`y` は足元のワールド座標です。人物も `x` が中心、`y` が足元です。商品・記事の絵はスポット中心から8ピクセル上 (`y - 8`) に描画されます。商品IDは `room-products.json`、記事IDは `room-articles.json` と一致させます。

16×16の絵自体は拡大せず、タップ判定だけを広げて画面上で最低44×44 CSSピクセルの操作領域を確保します。近くに複数の絵がある場合は、タップ位置から中心が最も近いものを選びます。

商品名・説明・Amazonリンクは `assets/books/room-products.json` に登録します。商品リンクは `https://www.amazon.co.jp/dp/商品ASIN?tag=pixieed-22&linkCode=ll2` の形式です。

## 操作と試作の範囲

スワイプして指を置いたままにするとその方向へ歩き、離すと止まります。商品・記事を短くタップすると説明が開きます。PCでは店内を選択して矢印キー・WASDで移動し、棚の近くでEnterまたはEを押すと近くの商品・記事を選べます。画面下の一覧からも選べます。

ページはスクロールしません。小さな画面では店内が人物に追従します。タイル地図を使う場合は通行不可セルの衝突判定が働きます。素材の管理画面・複数人の入店は実装していません。


## 記事リンクと店内リーダー

記事は商品とは別の `assets/books/room-articles.json` に登録します。商品manifestには記事を混在させず、`type` フィールドも使いません。記事レコードの形式は `id`、`title`、`description`、`source`、`url`、`embedUrl` です。`url` は公開元の通常ページ、`embedUrl` は iframe で表示するURL、`source` は画面に表示する出典名です。

```json
{
  "id": "article-pixel-start",
  "title": "ドット絵を楽しむ、最初の一歩",
  "description": "小さなマス目から始める自作の試読デモです。",
  "source": "PiXiEED・試読デモ",
  "url": "/books/pixel-guide.html",
  "embedUrl": "/books/pixel-guide.html"
}
```

店内への配置は `assets/books/room-scene.json` の `articleSpots` に記事IDと座標を登録します。商品配置の `productSpots` とは別に管理してください。記事用の絵を設定する場合は、シーン素材の `assets.products` に記事IDをキーとして登録できます。記事IDの画像がない場合は新聞風の仮絵になります。記事のリンク先や内容は商品manifestに登録しません。

店内では「ここで読む」を押した後にだけ `embedUrl` を iframe に読み込みます。iframe表示を拒否するサイト、または内容が正しく表示されないサイトは「元の記事を開く」から閲覧します。すべてのサイトが iframe に対応するわけではありません。現在は外部サイトの記事URLを登録していません。`/books/pixel-guide.html` は動作確認用に作成した自作デモで、商品や書籍本文ではありません。

読み終わったら常時表示される「閉じる」ボタンでリーダーを閉じられます。iframe内にフォーカスがあるとEscapeキーが親ページに届かない場合があるため、ボタンで閉じる操作も案内してください。

## タイル地図

`room-scene.json` の `tilemap.src` から `/assets/books/room-tilemap.json` を読み込みます。現在はタイル1枚が16×16ピクセル、横56枚・縦40枚です。JSONの `width` と `height` はタイル枚数、`tileSize` は1枚のピクセル寸法で、積が店内の描画サイズになります。座標、スポット、移動位置は従来どおりピクセル単位です。寸法を変える場合は、地図サイズに合わせて棚、商品・記事スポット、移動範囲も配置してください。地図外のスポットは表示されません。

地図JSONは次の構造です。`layers` は配列の順に重ね、各 `rows` は `height` 行×`width` 列のタイルIDを持ちます。`0` は透明、1以上のIDは `tiles` の定義を参照します。`tileset.src` は任意の `/assets/books/` 以下のPNGで、`columns` 枚ずつ並べたタイル画像を使います。ID 1が画像左上、ID 2がその右隣です。画像を登録しない場合や読めない場合は、`key` に対応する内蔵の仮タイルで表示します。現在のrendererは縦横各256枚まで、描画画像は最大16,777,216ピクセルまでに制限しています。

```json
{
  "tileSize": 16,
  "width": 2,
  "height": 1,
  "tileset": { "src": null, "columns": 4 },
  "tiles": [{ "id": 1, "key": "wood-floor", "label": "木の床" }],
  "layers": [{ "name": "ground", "rows": [[1, 1]] }],
  "collision": [[0, 1]]
}
```

この例は説明用の2×1タイル地図です。実データも `rows` と `collision` は必ず `height` 行×`width` 列にします。`collision` は見た目やtile定義とは独立したグリッドで、`0` が通行可能、`1` が通行不可です。全景 `assets.background` を設定すると描画はその画像を優先しますが、読み込めたタイル地図の衝突情報は引き続き使います。全景画像が読めないときはタイル地図、タイル地図も無効・未読込の場合は従来の背景に戻り、移動は従来の `movementBounds` のみで制限します。

衝突判定では人物の足元を半径約3ピクセルとして調べます。指定した出発位置が通れないセルにある場合は、範囲内の近い通行可能セルへ開始位置を補正します。通れる場所がない場合も画面下の商品・記事一覧は使用できます。
