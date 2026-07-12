# G-MEM-1: GIF `importSourceDirect` 常駐メモリ監査

対象は `PiXiEEDrawDEV/` のみ。2026-07-12 時点の静的監査であり、実行時のデータ形状、GIF decoder、V1/V2 autosave、archive codec は変更していない。

## 結論

- `importSourceDirect` は「読み込み時だけの元GIF退避」ではない。RGB描画、消去、pixel-patch Undo/Redo、local journal、history snapshot、clipboard/複製、V1 document 保存、V2 archive 保存・復元に伝播する汎用RGBA補助バッファになっている。
- GIF を RGB で読み込む経路では、`open-import-workflow-utils.js` が `direct` と別の `Uint8ClampedArray` として `importSourceDirect` を作る。両者は別 `ArrayBuffer` で、作成直後の内容は byte-for-byte 同一である。
- その後の RGB 描画と消去は両方を同じ値に更新する。従って現状に「読み込み直後の元画像を復元する」意味はなく、編集後も通常は同一内容のまま進む。
- RGB→Indexed では `palette-panel-utils.js` が `importSourceDirect` を優先する。そのため、将来の削減ではここを `direct` 正本優先に変更しない限り単純削除できない。
- GIF open 直後の常駐メモリ増加は V1 ではなく、完成RGBAフレーム列、`direct`、`importSourceDirect`、decoderの合成/復元バッファによる。V1 は autosave 時の JSON/base64 clone と recent-project snapshot の追加ピークに関与する。

## GIF 経路と二個目のRGBAコピー

`image-import-decode-utils.js` の `decodeGifFileToFrames()` は file bytes を `ArrayBuffer` として読み、現在は `decodeGifWithReader()` を呼ぶ。reader は各フレームで次を保持する。

1. encoded GIF bytes (`ArrayBuffer` / `Uint8Array`)
2. `pixels`: 現在の disposal 合成RGBA
3. `restoreBuffer`: disposal=3 用の前フレームRGBA
4. `framePixels = new Uint8ClampedArray(pixels)`: 完成フレームのコピー
5. `frames[]` の `ImageData(framePixels, width, height)`

次に `open-import-workflow-utils.js` の RGB import 正規化が `normalizedFramesData` を走査する。

```text
file bytes
  -> GifReader / disposal composition pixels + restoreBuffer
  -> completed ImageData frame list
  -> RGB project candidate
  -> layer.direct.set(frameInfo.imageData.data)
  -> new Uint8ClampedArray(frameInfo.imageData.data)  // importSourceDirect
  -> packaged/canonical/runtime commit
```

二個目の常駐RGBA copyは、上記最後から二行目で発生する。`direct.set()` は `createLayer()`/`ensureLayerDirect()` が確保済みの `direct` にコピーし、`importSourceDirect` はさらに別バッファを確保する。縮小が必要な場合は `resizeImportFrames()` の結果も、commit 完了まで完成フレーム列と重なる。

## `importSourceDirect` 参照監査

| file / function | 操作 | 対象形式 | 現在の理由 | `direct` で代替 | 遅延化 |
| --- | --- | --- | --- | --- | --- |
| `open-import-workflow-utils.js` / RGB import candidate | create/write | PNG・GIF・JPEG/WebP等の raster import | import元RGBAの複製 | 原則可。ただしIndexed変換の優先読取を変更する必要あり | 可 |
| `document-model.js` / layer create, clone, clipboard, serialize/deserialize | create/clone/read/write | runtime、V1 document | レイヤー形状の一般フィールドとして完全複製・保存 | 可（互換読取は維持） | 新規importから可 |
| `canvas-drawing-workflow-utils.js` / RGB draw, erase, direct write | read/write/create | RGB編集 | `direct` と同時更新、無ければ全バッファを複製生成 | 可。pixel patchを `direct` 正本へ寄せる必要あり | 可 |
| `pixel-patch-history-utils.js`, `local-project-journal-utils.js`, `timelapse-session-utils.js` | read/write | Undo/Redo、journal、timelapse | RGBA変更前後を4-byte patchとして記録・再適用 | 可。旧patchは互換適用する | 可 |
| `history-snapshot-workflow-utils.js` | read/write/serialize | Undo/Redo snapshot | 圧縮snapshotへ完全バッファを収録 | 可。既存snapshotは読める必要あり | 可 |
| `palette-panel-utils.js` / `buildLayerColorDataPreferDirect` | read | RGB→Indexed | **importSourceDirectを direct より優先**して減色元にする | 可。ただしG-MEM-2で正本を direct に変更必須 | 可 |
| `palette-panel-utils.js`, `imported-palette-candidate-utils.js` | delete/read | Indexed変換、palette candidate | Indexed化時に両方を消去。candidateはfallbackとして読む | 可 | 可 |
| `project-storage-v2-archive-codec.js` | serialize/deserialize | V2 archive | `importSourceCel` として別bitmap archive entryに保存・復元 | 新規V2保存では省略可能、旧archive読取は必要 | 可 |
| `canonical-v2-project-utils.js`, V2 read-shadow/recovery | validate/read | V2 validation、比較、recovery | 形式互換と差分比較 | 可（optional扱い） | 可 |
| `autosave-schema-v2-utils.js` | read/write/estimate | V2 shadow autosave | patch再生・容量見積り | 可（旧patch互換は必要） | 可 |
| `gif-import-inspection-utils.js` | read only | DEV inspection | direct/import bufferのhash・容量監査 | 可 | 該当なし |

`direct` を使用せず `importSourceDirect` だけが必要な正式な「原画像へ戻す」UI/コマンドは、対象ツリーから確認できなかった。clipboard/duplicate/history/保存はフィールドを丸ごと保持する互換経路であり、元画像復元機能の根拠ではない。

## 同一性と編集後の差異

| 時点 | buffer参照 | 内容 | 備考 |
| --- | --- | --- | --- |
| GIF RGB import直後 | 別 `ArrayBuffer` | 同一 | `direct.set()` と `new Uint8ClampedArray(imageData.data)` |
| RGB描画・消去後 | 別 `ArrayBuffer` | 通常同一 | draw/eraseは両方を同時更新。欠損時は `new Uint8ClampedArray(direct)` を生成 |
| RGB→Indexed完了後 | 両方 `null` | 該当なし | `palette-panel-utils.js` が両方を消去 |
| history/clipboard/duplicate | clone または共有 | 保存時点の値 | clonePixelData=falseでは参照共有、通常snapshot/clipboardでは別clone |
| V1/V2 restore | 新規復元バッファ | 保存値 | V1 base64/V2 `importSourceCel` から再構築 |

編集後に `direct` と `importSourceDirect` が意図的に異なる経路は確認できなかった。ただし「旧データに不一致がある」場合、Indexed化が `importSourceDirect` を優先するため、現在はその古い値を採用し得る。

## 形式別の必要性

- GIF専用ではない。PNGなど外部raster importでも同じRGB import candidateが生成する。
- V1 document serializerは `importSourceDirect` をbase64化して保存する。
- V2 archiveは別bitmap (`importSourceCel`) として保存する。
- V1/V2 autosave/recent/recovery は、現状このフィールドを含むsnapshot/patchを保持・比較できる。
- Undo/Redoは `direct` とは別に `importSourceDirect` の4-byte patchとsnapshotを保持するが、元画像復元ではない。

## decoder 中間バッファの寿命

| buffer | owner | allocation | 解放/寿命 | 重複 |
| --- | --- | --- | --- | --- |
| encoded bytes | `decodeGifFileToFrames` | `file.arrayBuffer()` | decode promise完了後に参照切れ | decode中の全期間 |
| `GifReader` | `decodeGifWithReader` | reader構築 | 関数return後に参照切れ | decode中の全期間 |
| `pixels` | reader compositing | `new Uint8ClampedArray(w*h*4)` | 関数return後 | decode中の全期間 |
| `restoreBuffer` | disposal=3 | 同上 | 関数return後 | decode中の全期間 |
| `framePixels` / `ImageData` | `frames[]` | フレームごとにclone | runtime layer作成・candidate正規化まで | フレーム数ぶん常駐 |
| resize frame list | RGB import | `resizeImportFrames` | candidate commitまで | 縮小時に元framesと重複 |
| `direct` | runtime layer | `ensureLayerDirect` | document/layer lifetime | 以降常駐 |
| `importSourceDirect` | runtime layer | import candidate | document/layer lifetime | 以降常駐、`direct`と二重 |
| history/autosave snapshot | history/IndexedDB write | commit/autosave | GC/IndexedDB write完了まで | 操作・autosave時の追加ピーク |

## 概算（RGBAは 4 bytes/pixel）

下表は「1レイヤー/フレーム、RGB import、decoder reader経路」の下限寄り概算。completed frame list、`direct`、`importSourceDirect` は全フレーム分。composition は `pixels + restoreBuffer` の2枚。canonical/history/autosaveはフルcloneが同時に発生する場合の追加上限であり、常時ではない。

| size / frames | 1 frame RGBA | completed frames | `direct` | `importSourceDirect` | composition 2枚 | 3つの追加フルclone（candidate/history/autosave） | 例示上限 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 256×256 / 30 | 0.25 MiB | 7.5 MiB | 7.5 MiB | 7.5 MiB | 0.5 MiB | 22.5 MiB | 約45.5 MiB |
| 512×512 / 60 | 1 MiB | 60 MiB | 60 MiB | 60 MiB | 2 MiB | 180 MiB | 約362 MiB |
| 1024×1024 / 100 | 4 MiB | 400 MiB | 400 MiB | 400 MiB | 8 MiB | 1,200 MiB | 約2.41 GiB |

これは、すべてのフルcloneが同時に生存することを保証する値ではない。candidate/history/autosave の重複は実行順序、GC、保存処理のタイミングで変動する。V1→V2に変えても `direct + importSourceDirect` の常駐二重化（上表の60/400 MiB部分）は解消しない。

## 代替案の比較と推奨

| 案 | 常駐メモリ | 実装/互換性 | 判定 |
| --- | --- | --- | --- |
| A: directのみ、元GIF Blobを保持し必要時redecode | 最小、Blobサイズ依存 | provenanceとredecode UIが必要。session restore時のblob保持方針も必要 | 原画像復元機能を将来追加する場合に適切 |
| B: directのみ、必要操作時にcandidate生成 | 最小 | Indexed変換、patch、旧保存読取を `direct` 正本へ統一する必要 | **推奨**。現状の明示的な元画像復元機能はない |
| C: 同一buffer共有 + copy-on-write | 初期は半減 | 全描画、history、clone、archiveに所有権/COWを導入する必要 | 現段階では複雑すぎる |
| 現状維持 | 最大 | 互換性はあるが、GIFで二重常駐 | 不採用 |

## 最小実装フェーズ

G-MEM-2では、新規GIF importの生成行を先に消さない。`layer.importSourceDirect = new Uint8ClampedArray(direct)` のような欠損時の暗黙再生成を残すと、最初の描画・Undo/Redoで二重RGBAが復活するためである。

1. **G-MEM-2A: direct正本化**
   - RGB→Indexed は `direct` を正本とし、旧データで `direct` が欠損するときだけ `importSourceDirect` をfallbackにする。
   - RGB drawing、pixel patch、local journal、history を `importSourceDirect` 欠損で動作させ、新規生成しない。
   - 回帰テストは import後、draw、undo、redoの各時点で `importSourceDirect === null` を固定する。
2. **G-MEM-2B: 欠損互換**
   - V1/V2 restore、archive、recovery、clipboard、sheet/frame/layer duplicationを確認する。
   - 両方が存在し内容が不一致なら `direct` を正本とし、`importSourceDirect` はlegacy fallbackに限定する。
3. **G-MEM-2C: 新規external raster importでの生成停止**
   - PNG/GIF等で共通のRGB import経路を対象にする。ただしPNG等に別の元画像復元用途がないことを再確認してから対象を確定する。
4. **G-MEM-2D: 新規V1/V2保存での省略検証**
   - 先にruntimeで欠損を許容し、canonical validation、shadow比較、V1/V2 readerがoptional fieldを許容することを確認する。
   - 最初は `importSourceDirect: null` を保存する選択肢を含め、base64/bitmapデータを出さないことを検証する。フィールド自体の完全省略は別の互換性確認後に行う。
5. **G-MEM-3: decoder/candidate中間バッファの短縮**
   - disposal処理を変えず、completed frame list、resize結果、candidate cloneの重複期間を短縮する。

残リスクは、external raster import全体での従来保存物、shared/local journal、history snapshot、V2 archiveの旧payload互換である。G-MEM-2は1段階ずつ実機のGIF・PNG・RGB↔Indexed・Undo/Redo・sheet複製で検証する。
