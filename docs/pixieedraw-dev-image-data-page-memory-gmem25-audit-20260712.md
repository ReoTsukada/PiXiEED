# G-MEM-2.5: ImageData / Canvas Pageメモリ寿命監査

対象は `PiXiEEDrawDEV/` の外部raster import。G-MEM-2C後の静的監査であり、実行時の挙動は変更していない。Safari Web Inspectorの「Page」がJavaScript heapより大きく増加した報告を前提に、`ImageData`、HTMLCanvasElement backing store、ImageBitmap、完成フレーム列の寿命を追う。

## 結論

`importSourceDirect` を削減しても、Pageメモリが支配的になることはコード上あり得る。主な候補は次の重複期間である。

1. GIF decoderの完成 `ImageData[]` 全フレーム
2. 縮小時の元 `framesData` と新しい `normalizedFramesData` の全フレーム
3. `ImageDecoder` / `createImageBitmap` / `<img>` から `ImageData` を作る一時canvas backing store
4. import candidateの `direct` と `applyHistorySnapshot()` のcanvas/state clone
5. import関数がreturnするまで残る `importResult`、`framesData`、`normalizedFramesData`、`snapshot`

Safariでは `ImageData` backing storeや2D canvas backing storeがJavaScriptではなくPage側に計上されることがある。従って「JavaScript 1.33GB / Page 4.90GB」の比率は、G-MEM-2CのTypedArray削減と矛盾しない。G-MEM-2CはruntimeのRGBA重複を減らすが、decode・resize・canvas backing storeのピークを消してはいない。

## 所有者と寿命

| 段階 | オブジェクト | owner | 解放候補時点 | Page計上の可能性 |
| --- | --- | --- | --- | --- |
| file decode | encoded `ArrayBuffer` / `Uint8Array` | `decodeGifFileToFrames` | decoder return後 | 低〜中 |
| GIF composition | `pixels`, `restoreBuffer` | `decodeGifWithReader` | decoder return後 | 通常JS側 |
| completed frames | `new ImageData(framePixels, w, h)` × frameCount | `importResult.frames` | import関数return後（または参照を切った後） | **高** |
| ImageDecoder path | `ImageBitmap` + temporary `<canvas>` + `getImageData` | `decodeGifWithImageDecoder` | bitmapは即 `close()`、canvasは関数return後 | **高** |
| static image path | temporary `<canvas>` + `getImageData` | `imageBitmapToImageData` / `imageElementToImageData` | 関数return後 | **高** |
| resize | 元 `ImageData[]` + 新 `ImageData[]` | `framesData` + `normalizedFramesData` | import関数return後 | **高、縮小時に約二重** |
| candidate | layer `direct` × frameCount | `frames` / `snapshot` | apply完了後にsnapshot参照を切った後 | JS/Page双方 |
| runtime commit | project-canvas clone + `state.frames` clone | `applyHistorySnapshot` | replace/GC後 | JS/Page双方 |

## 実際のデータフロー

```text
file bytes
  -> decodeGifWithReader(): pixels + restoreBuffer
  -> framesData / importResult.frames: ImageData[]
  -> (scaled only) resizeImportFrames(): normalizedFramesData ImageData[]
  -> frames[]: layer.direct copies
  -> snapshot.frames (same layer objects)
  -> applyHistorySnapshot()
       -> replaceProjectCanvasDocuments(snapshot frames)
       -> state.frames = snapshot.frames.map(...cloneLayerForSnapshot)
```

`normalizedFramesData === framesData` の場合でも、両方のローカル変数が同じ完成ImageData列を指す。縮小時は別列になるため、元と縮小後のImageDataが少なくともcandidate copy完了まで同時に生きる。`importResult` も同じ関数スコープに残るため、G-MEM-3では各フレームを `direct` へ移譲した後に `imageData` 参照を明示的に切る設計が必要になる。

## Canvas / ImageBitmap経路

- `decodeGifWithImageDecoder()` は frameごとに `decoder.decode()` -> `ImageBitmap` -> `imageBitmapToImageData()` を行い、bitmapは直後に `close()` する。これは正しいが、`imageBitmapToImageData()` 内のtemporary canvasはlocal scope終了までbacking storeを持ち得る。
- `imageBitmapToImageData()` と `imageElementToImageData()` は `document.createElement('canvas')`, `drawImage`, `getImageData` を用いる。DOMへ追加されないcanvasでも、SafariのPageメモリに一時backing storeとして現れ得る。
- reader経路はcanvasを使わない一方、全フレームの `ImageData` を `frames[]` に保持する。

## G-MEM-3へ向けた最小方針

今回の監査では変更しない。次の実装は、decoder/disposalの仕様を変えずに段階化する。

1. completed frameを一括 `ImageData[]` として保持せず、可能ならdecode/resize/direct copyを順次行う。
2. 一括構造を維持する場合でも、`direct.set()` 後に元frameの `imageData` 参照を切り、`importResult` / `framesData` / `normalizedFramesData` の寿命をcommit前後で短縮する。
3. resizeは全フレームの元・先を併存させず、1フレームずつ縮小・移譲する。
4. temporary canvasは寸法を0へ戻すか、スコープを小さくしてGC候補化する。ただしSafari実機計測で効果を確認してから採用する。
5. `applyHistorySnapshot()` のproject canvas/state二重cloneは別途測定する。これを先に変えるとUndo/復元仕様へ広く影響するため、decoder入力の寿命短縮より後にする。

## 測定時の確認項目

- decode完了直後、resize完了直後、`direct` candidate生成直後、commit直後、autosave完了後の各時点でPage/JavaScriptを採取する。
- Safari Web InspectorのCanvas / Images / GPU/Rendering項目が使える場合、`ImageData` と2D canvas backing storeの増減を対応付ける。
- 同じGIFを縮小あり・なしで比較する。縮小ありだけPageピークが大きく増えるなら `resizeImportFrames()` の二重ImageDataが有力。
- import関数完了後にもPageが減らない場合、runtime canvas/stateまたはSafariの遅延解放を疑う。

G-MEM-3の完了条件は、少なくともcompleted `ImageData[]` とresize元列がruntime commit後に参照されず、Pageピークとimport CPU時間を実機で比較できる状態にすることである。
