# ツール間で渡す作品の最小契約

各ツールの内部形式は統一しない。共通にするのは「どの作品の、どの版を、どんな許可で使うか」と、表示用の小さいプレビューだけ。大きな編集データをページ遷移ごとに複製しない。旧投稿も同じ読み取り用の形へ投影するが、元 DB 行や Storage オブジェクトは上書きしない。

```json
{
  "schemaVersion": 1,
  "assetId": "stable-id",
  "revisionId": "immutable-revision",
  "contentHash": "sha256-hex-or-null-for-unverified-legacy",
  "hashScheme": "sha256-file-v1",
  "kind": "pixel_art",
  "source": { "type": "hand_drawn", "assetId": null, "revisionId": null },
  "owner": { "type": "account", "id": "opaque-id" },
  "visibility": "draft",
  "reusePermission": "owner_only",
  "preview": { "mimeType": "image/png", "width": 64, "height": 64, "locator": "opaque-local-or-public-id" }
}
```

値は初版では `kind = pixel_art | pixel_camera | song | character | game | jigsaw | spot_difference | hidden_object`、`visibility = draft | pending | published | hidden`、`reusePermission = owner_only | playable | derivative_allowed` を想定する。`derivative_allowed` は旧データとの互換のため読み取るが、現在の体験では他人の投稿作品の編集・派生公開許可として使わない。二次制作の入力は本人の保存絵・端末内のカメラ画像に限定する。ただしジグソーの一時プレイだけは公開中の投稿画像を読み込める。これらは**新しい正本スキーマの確定ではなく受け渡し契約案**。現行 `user_posts.status` の `rejected` を省略してよい意味ではない。各ソースの状態を正確に投影し、未知値は公開・再利用を拒否する。

`contentHash` の計算方法は `hashScheme` で明示する。現行 `user_posts.content_hash` は画像ファイルのバイト列由来として保持し、新しい編集文書は定義済みの正規形で `sha256-canonical-v1` を使う。両者を同じハッシュとして比較しない。作成時には内容と親版を記録し、公開版は固定参照とする。作成者が後に編集しても既に公開した音・ゲーム・問題の中身は変わらない。旧データに元の hash がない場合は `contentHash: null` と `legacyRef` を持ち、実画像の検証が完了するまで推測 hash を正本にしない。

権限判定は画面のボタン表示と保存 API の両方で行う。端末内の下書きは端末だけにあり、公開作品と同じ `assetId` を勝手に持たせない。旧作品や他人の投稿作品は閲覧・プレイまで。本人確認済みの自作品でも `playable` の場合は加工しない。地図の公開セルは作品の表示情報にだけ渡し、精密緯度経度や審査前の画像 locator を共有 manifest に入れない。

読み込みはツール起動時に必要な固定版とプレビューだけ取得する。元の編集文書、音声バッファ、ゲーム状態は使う画面で遅延読込し、終了時に解放する。初版は同一端末の IndexedDB と現行公開 URL のアダプターで接続し、全ツール一括の依存読み込みや新しい同期基盤は設けない。

**ハーネス設計:** `AST-01` 同じ版は同じ正規内容 hash。`AST-02` 自作品の加工先を保存しても元作品の bytes/hash/公開状態が不変。`AST-03` 旧投稿の ID と URL を維持してプレビューに投影。`AST-04` 権限表示に関係なく他人の投稿作品は閲覧できても加工不可。`AST-05` 未知状態/欠損 locator/不正 hash は fail closed。`AST-06` 精密位置と審査前 locator は共有データに現れない。`AST-07` 大画像/音を読み込まない画面では対応バッファが読み込まれない。ブラウザー/端末の遅延読込とメモリは別に測る。

**IMPLEMENTED（既存の一部）:** 投稿 ID、content hash、公開画像。手描き/カメラの新しい区分は作業ツリーにあり、本番 DB への適用は未確認ではなく未実施。**UNIMPLEMENTED:** ここで定義した共通作品 manifest と許可 API。**UNTESTED:** 旧 DB からの実データ変換、各端末の負荷。
