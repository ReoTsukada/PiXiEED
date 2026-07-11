# PiXiEEDraw ズーム・パン実装監査（本番 / DEV）

調査日: 2026-07-11

対象:

- 本番: `pixiedraw/`
- DEV: `PiXiEEDrawDEV/`

この資料は、ズーム・パン周辺を別のGPTへ渡して修正案を検討するためのコード監査資料である。現時点ではコード変更を行わず、現在の実装、入力経路、座標計算、保存、両ツリーの差を整理する。

## 1. 結論

- 画面全体の表示倍率は `state.scale`、画面上の移動量は `state.pan.x/y` で管理する。
- 表示倍率のUI値は絶対倍率ではなく、「現在の画面サイズから計算した基準倍率」に対する比率である。表示上の `100%` は原寸1倍ではなく、原則としてキャンバスがビューポートへ94%程度で収まる倍率を表す。
- ズーム中心は、ホイール位置、ピンチ中心、仮想カーソル、画面中央の順で決まり、ズーム前後で同じ画像座標が同じ画面位置へ残るよう `state.pan` を再計算する。
- パンはワークスペース全体に `translate(px, px)` を適用する。ズームは各キャンバスのCSS表示幅・高さを変える方式で、ワークスペース自体に `scale()` は掛けない。
- マウスは中ボタンドラッグ、移動ツール＋左ドラッグ、Space＋左ドラッグに対応する。タッチは1本指パンを禁止し、2本指でパン・ピンチを同時判定する。
- 単一キャンバスでは完全に画面外へ出ないようパンを補正する。マルチキャンバス・ワールド配置ではこの補正を無効にしている。
- 本番とDEVの主要ズーム・パン計算は同一ファイル内容である。確認できた差は、DEVの `resetOpenedDocumentViewport()` に `preserveLocalCanvasLayout` がある点だけである。

## 2. DOMと変形の構造

本番のDOMは次の入れ子である。DEVも同じ構造を使う。

```text
#canvasViewport                 画面内の表示窓
  #viewportWorkspace           パン用。translate(x, y)を適用
    #mainCanvasArea            メインキャンバスのパネル
      #canvasStack             表示倍率に応じてwidth/heightを変更
        #drawingCanvas         実ピクセル描画
        #overlayCanvas         ガイド・プレビュー
        #selectionCanvas       選択表示
    #localCanvasDock           追加キャンバス群
```

参照: `pixiedraw/index.html:319-333`

パンの最終反映:

```js
dom.viewportWorkspace.style.transform = `translate(${panX}px, ${panY}px)`;
```

参照: `pixiedraw/assets/js/modules/layout-viewport.js:321-344`

ズームの表示反映は、`state.scale` を各ピクセルの画面上サイズとして使い、キャンバススタックを次の大きさにする。

```js
stack.style.width = `${width * scale}px`;
stack.style.height = `${height * scale}px`;
```

参照: `pixiedraw/assets/js/modules/canvas-grid-workflow-utils.js:165-196`

`getPixelAlignedCanvasDisplayScale()` という名前だが、現実装は整数丸めをせず、最小値だけ保証してそのまま小数倍率を返す。そのため「pixel aligned」という名称と実処理には差がある。

## 3. ズーム値の意味と範囲

定数は `ui-static-config.js` にある。

```js
ZOOM_STEPS = [
  0.5, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6,
  7, 8, 9, 10, 12, 14, 16, 18, 20
];
MIN_ZOOM_SCALE = 0.05;
MAX_ZOOM_SCALE = 4096;
MAX_ZOOM_BASE_SCALE = 128;
ZOOM_WHEEL_STEP_BASE = 1.25;
WHEEL_ZOOM_RAW_RESET_MS = 160;
ZOOM_EPSILON = 1e-6;
```

参照: `pixiedraw/assets/js/modules/ui-static-config.js:202-273`

### 基準倍率

`getViewportZoomBaseScale()` は縦長画面なら横幅、横長画面なら高さを基準にする。

```js
const portraitViewport = viewportHeight >= viewportWidth;
const fitScale = portraitViewport
  ? (viewportWidth / canvasWidth)
  : (viewportHeight / canvasHeight);
return clamp(fitScale * 0.94, 0.05, 128);
```

参照: `viewport-zoom-utils.js:96-137`

したがってUIの倍率は次の関係になる。

```text
表示倍率 state.scale = 基準倍率 baseScale × UI倍率 ratio
UI表示% = state.scale ÷ baseScale × 100
```

UI上の範囲は50%〜2000%。実際の `state.scale` はさらに0.05〜4096へ制限される。

注意点:

- 一般的な `min(viewportWidth/canvasWidth, viewportHeight/canvasHeight)` ではない。
- 縦長画面では横幅だけ、横長画面では高さだけを見るため、極端な縦横比のキャンバスでは反対軸が収まらない可能性がある。
- マルチキャンバス時の基準ドキュメントは原則としてプロジェクト先頭キャンバスである。アクティブキャンバス基準ではない。

参照: `viewport-zoom-utils.js:30-94`

## 4. ズーム入力経路

### 4.1 UIの＋ / −と数値入力

- ＋ / −は現在比率へ毎回 `×1.1` または `÷1.1` を適用する。
- `ZOOM_STEPS` の隣の値へ移動する処理ではない。
- 数値欄は50〜2000を比率として解釈する。
- フォーカス指定がないため、仮想カーソルが有効なら仮想カーソル、そうでなければビューポート中央をズーム中心にする。

参照:

- `canvas-zoom-workflow-utils.js:359-372`
- `controls-mirror.js:1697-1729`
- `viewport-zoom-utils.js:213-232`

### 4.2 マウスホイール / トラックパッド

イベントは各 `.canvas-stack` に `passive: false` で付く。キャンバス外の空白ではホイールズームしない。

処理順:

1. イベント対象のキャンバス面を特定する。
2. 非アクティブキャンバスなら、その面をアクティブ同期する。
3. `clientX/Y` を対象キャンバス内の `worldX/Y` に変換する。
4. `deltaMode` をピクセル相当へ変換し、`-600〜600` に制限する。
5. `wheelSteps = normalizedDelta / 100`。
6. `zoomFactor = 1.25 ** (-wheelSteps)`。
7. `requestAnimationFrame` につき最後の倍率・フォーカスを1回 `setZoom()` へ渡す。
8. 160ms入力が途切れたら連続ホイール用の生倍率を破棄する。

参照: `canvas-wheel-zoom-workflow-utils.js:34-173`、イベント登録は `app.js:17168-17176`

### 4.3 2本指ピンチ

Pointer Eventsを使い、`activeTouchPointers` に各指の `pointerId` と画面座標を保持する。2本未満ではタッチパンを開始しない。

定数:

```js
TOUCH_PAN_MIN_POINTERS = 2;
TOUCH_PINCH_SENSITIVITY = 1.35;
TOUCH_PINCH_DEADZONE_RATIO = 0.003;
TOUCH_PAN_DEADZONE_PX = 2;
TOUCH_PINCH_DEADZONE_PX = 1.5;
TOUCH_PINCH_MAX_GESTURE_RATIO = 6;
TOUCH_PINCH_MIN_RATIO = 0.05;
TOUCH_PAN_DIRECTION_DOT_MIN = 0.45;
TOUCH_PAN_VECTOR_BALANCE_MIN = 0.25;
```

参照: `app.js:9218-9226`

ピンチ倍率:

```text
rawRatio = 現在の2点間距離 / 基準の2点間距離
cappedRatio = rawRatioを1/6〜6へ制限
amplifiedRatio = 1 + (cappedRatio - 1) × 1.35
targetScale = 基準scale × max(0.05, amplifiedRatio)
```

比率差0.003以上、かつ指間距離差1.5px以上でピンチと認定する。中心点をキャンバス座標へ変換し、その点をアンカーとして `setZoom()` する。

参照: `canvas-pointer-workflow-utils.js:243-358, 916-1005`

## 5. ズーム中心を固定する計算

`setZoom(nextScale, focus)` がズームの中心処理である。

フォーカスの優先順位:

1. 呼び出し側が渡した `worldX/Y`（ホイール位置またはピンチ中心）
2. 仮想カーソル座標
3. ビューポート中央

処理の考え方:

```text
ズーム前のアンカー画面位置
  = pan + パネル配置 + canvas内オフセット + world座標 × 旧表示倍率

新しいpan
  = ズーム前のアンカー画面位置
    - (パネル配置 + canvas内オフセット + world座標 × 新表示倍率)
```

実際にはDOMをリサイズした後、`getBoundingClientRect()` でアンカーのずれを再計測し、0.01pxを超える誤差があれば `state.pan` をもう一度補正する。

参照: `canvas-zoom-workflow-utils.js:219-357`

ズーム後は以下を更新する。

- キャンバス寸法
- マルチキャンバスの共有ワールド配置
- ミラーガイド
- キャンバスサイズつまみ
- 選択・オーバーレイ
- ズームUIと1.8秒表示のインジケーター
- 90ms後（大規模ドキュメントは180ms後）にグリッド等を再同期
- ピクセルスナップショットを含めずセッション保存を予約

## 6. パン入力経路

### マウス / ペン

パン開始条件:

- マウス中ボタン
- 移動（pan）ツールで左ボタン
- Spaceを押して左ボタン

開始時に `panOrigin` と `startClient` を保存し、移動中は次で更新する。

```js
state.pan.x = Math.round(originX + event.clientX - startClient.x);
state.pan.y = Math.round(originY + event.clientY - startClient.y);
applyViewportTransform();
```

Spaceを離した時、Spaceパン中なら即座にパンを終了する。

参照:

- `canvas-pointer-workflow-utils.js:360-441`
- `canvas-pointer-workflow-utils.js:1007-1021`
- `canvas-pointer-workflow-utils.js:4196-4335`
- `keyboard-workflow-utils.js:141, 218, 245`

### 2本指パン

2本の移動ベクトルが同方向で、両方の移動量が極端に偏っていない場合だけパンと認定する。

```text
平均移動距離 >= 2px
移動ベクトルの正規化内積 >= 0.45
短い方の移動量 / 長い方の移動量 >= 0.25
```

パン認定後は2点の重心差を現在の `state.pan` に加算する。各move後に基準点を更新するため、差分加算型である。ピンチが同時に有効な場合は、まず `setZoom()` でアンカー補正し、その後パン条件が成立していれば重心差も加える。

## 7. パンの画面外制限

単一キャンバスでは、対象キャンバス矩形がビューポートと1pxも交差しなくなった時だけ `state.pan` を補正する。つまりキャンバスの大部分を画面外へ出すことは可能だが、完全には消せない。

マルチキャンバス・ワールド配置では常に補正なしを返す。

```js
if (isMultiCanvasWorldLayoutActive()) {
  return { clampedX: false, clampedY: false };
}
```

参照: `layout-viewport.js:198-238`

検討点: マルチキャンバスでは全キャンバスを画面外へ移動でき、UIからの復帰手段が別途必要になる。意図的な無制限ワールドか、最低1面可視を保証すべきかを仕様として決める必要がある。

## 8. マルチキャンバスとの関係

- `state.scale` は共有ビューポート倍率である。
- 各キャンバス文書には `viewScale` があるが、現実装の `storeProjectCanvasViewScale()` は全キャンバスへ同じ値を書き込む。
- `getProjectCanvasDisplayScale()` も実質的に共有 `state.scale` を優先する。
- ズーム後、全キャンバス面の寸法とワールド配置を同期する。
- パネル固有の位置は別のローカルキャンバス配置状態であり、`state.pan` とは別概念である。

参照: `local-viewport-canvas-workflow-utils.js:581-646`

注意点: データモデル上は「キャンバス別 `viewScale`」に見えるが、実際の操作は共有倍率として扱う。将来、キャンバス別倍率を本当に許可するなら、現在の全キャンバス一括書き込みとズーム基準計算を見直す必要がある。

## 9. 保存・復元・履歴

`makeHistorySnapshot()` は `scale` と `pan` を含む。

```js
scale: state.scale,
pan: { x: state.pan.x, y: state.pan.y },
```

復元時は `scale` を正規化し、ズーム比率を再計算してから `pan` を復元する。

参照:

- `history-snapshot-workflow-utils.js:34-47`
- `history-snapshot-workflow-utils.js:199-204`
- `app.js:9888-9893`

ズーム完了とパン終了はセッション保存を予約するが、ズーム中・パン中の毎イベントでは保存しない。ピクセル内容のスナップショットも要求しない。

開いた文書のビューポートをリセットする時、単一キャンバスでは100%相当へ戻し、`pan = 0, 0` の後に中央配置する。マルチキャンバスではズーム・パンを同じ方法ではリセットしない。

参照: `layout-viewport.js:240-319`

## 10. 本番とDEVの一致状況

SHA-256比較で次の主要ファイルは完全一致した。

- `viewport-zoom-utils.js`
- `canvas-wheel-zoom-workflow-utils.js`
- `canvas-zoom-workflow-utils.js`
- `canvas-pointer-workflow-utils.js`
- `ui-static-config.js`
- `canvas-control-actions-workflow-utils.js`
- `keyboard-workflow-utils.js`

`app.js` 全体はDEV固有機能があるため不一致だが、上記モジュールへズーム・パン処理を委譲する構造は同じである。

`layout-viewport.js` の差は次だけである。

```diff
- function resetOpenedDocumentViewport({ defer = false } = {})
+ function resetOpenedDocumentViewport({ defer = false, preserveLocalCanvasLayout = false } = {})
```

DEVでは `preserveLocalCanvasLayout === true` の時、文書を開いた際のローカルキャンバス配置リセットを省略する。本番は必ずリセットする。この差は通常のズーム・パン操作ではなく、文書オープン直後の配置復元に影響する。

## 11. GPTに特に検討してほしい論点

1. UIの100%を「画面フィット倍率」とする現在の仕様が利用者の期待と一致するか。原寸1px=1CSS pxの100%と混同しやすい。
2. 基準倍率を画面向きで片軸だけ選ぶ方式を、一般的な両軸の最小フィットへ変えるべきか。
3. `getPixelAlignedCanvasDisplayScale()` が小数倍率をそのまま返していることによる、グリッドのぼけ、ピクセル境界の揺れ、ズームアンカー誤差がないか。
4. UIの＋ / −が `ZOOM_STEPS` を使わず1.1倍刻みである一方、定数には段階表が存在する不整合をどう整理するか。
5. ホイールリスナーがキャンバススタック上だけなので、余白上のトラックパッドズームを許可すべきか。
6. マルチキャンバスで画面外制限が完全に無効なため、全キャンバスを見失うケースへの「全体表示」「中央へ戻す」が必要か。
7. `canvas.viewScale` をキャンバス別値として残すか、共有ズーム値としてデータモデルを明確化するか。
8. ピンチ中に `setZoom()` のアンカー補正と重心パンを同一moveで連続適用し、さらに毎move基準を更新する方式が、端末のPointer Events頻度差で揺れを生まないか。
9. 本番とDEVの `preserveLocalCanvasLayout` 差を意図したままにするか、本番へ合わせるか。
10. ズーム・パンをundo/redo対象の編集履歴とするか、セッション表示設定だけにするか。現状はスナップショット構造に含まれるため、別の編集復元経路から表示位置も戻り得る。

## 12. GPTへ渡す短い依頼文

```text
添付の「PiXiEEDraw ズーム・パン実装監査」を読み、現在の操作感が不安定になる可能性をコード設計レベルで精査してください。

特に、(1) 100%=フィット倍率の比率モデル、(2) 縦横どちらか片軸だけで決める基準倍率、(3) 小数CSS倍率、(4) ピンチ中のアンカー補正と重心パンの二重更新、(5) マルチキャンバスでの無制限パン、(6) canvas.viewScaleと共有state.scaleの意味の重複を確認してください。

修正案は「症状」「根本原因」「変更対象関数」「具体的な式または疑似コード」「既存保存データとの互換性」「PC/スマホ/マルチキャンバス別のテスト項目」の順で示してください。本番 pixiedraw/ と DEV PiXiEEDrawDEV/ の両方を同じ挙動に保つ前提です。
```
