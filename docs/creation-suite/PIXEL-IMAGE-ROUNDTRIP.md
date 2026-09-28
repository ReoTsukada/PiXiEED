# PNGの拡大保存とドット寸法の復元

## 保存と読み込みの契約

- カメラ・描画・ドットで音楽の静止画保存は、アンチエイリアスなしの整数倍PNG。長辺を約2048pxにする（48×16なら2016×672）。作品の作業寸法は変更しない。
- PNGの `tEXt`、キーワード `PiXiEED-pixels` に `{ "version": 1, "width": 48, "height": 16, "scale": 42 }` を保存する。既存の画像データは再圧縮せず、そのまま保持する。
- 読み込みはPNGの寸法・チャンク境界・メタデータのCRCと内容を確認する。指定倍率の各ブロックが同じ画素であることも照合し、一つの画素へ戻す。単色や2セル単位の繰り返しでも、記録した元寸法を優先する。
- 復元したPNGにも元寸法と倍率1を記録する。再取り込みを繰り返しても、面や繰り返し模様を追加で縮めない。
- メタデータがないPNG/WebPは、色が完全に一致する整数ブロックだけを縮小する。最小ドット数は短辺8。これは見た目からの推定であり、外部画像の元のキャンバス寸法を確定する仕組みではない。
- 寸法の主張と画素が一致しない画像は、その主張で縮小しない。平均化・減色・ぼかしはこの共通処理には含めない。

## ツール間の扱い

端末から選ぶ画像には共通の復元処理を使う。カメラや描画・パズルから直接渡したPNGは、確定済みのドット寸法を維持する。PXD内の画像および登録済みの公開パズル画像は復元処理の対象外で、作品の寸法・URL・内容照合を維持する。

PNGに所有者情報は記録しない。この情報の有無によって保存・投稿の権限は変わらず、既存の所有権確認を引き続き使う。PNGは画像の交換用、PXDは音楽・パズル・編集情報を含む作品の保存用として扱う。

入力は展開前にファイル量と画像の寸法を検査する。共通入力は最大10MB、各辺4096px、約1600万画素。投稿入口は最大8MBを受け付け、復元後に既存の投稿制限（8〜512px、128色、PNG 512KB）を検査する。旧投稿入口の128px・512色の制限は変更しない。

GIF、JPEGやSNSで再圧縮された画像には元寸法の保証を広げない。PNG内のメタデータが削除された場合は推定で扱う。

## 検証

```sh
node --test tests/export/pixel-roundtrip.test.mjs tests/creation-suite/audio-export.test.mjs tests/pixel-studio/png-export.test.mjs
node scripts/pixel-roundtrip-browser-harness.mjs
PIXIEED_PIXEL_ENGINE=webkit PIXIEED_WEBKIT_EXECUTABLE=/Users/tsukadareine/Library/Caches/ms-playwright/webkit-2272/pw_run.sh node scripts/pixel-roundtrip-browser-harness.mjs
node scripts/creation-suite-harness.mjs --all
node scripts/work-save-browser-harness.mjs
```

ブラウザー検証はlocalhostの隔離されたテスト環境で行う。実端末の写真アプリ・外部SNS・本番投稿・本番保存の証明にはしない。
