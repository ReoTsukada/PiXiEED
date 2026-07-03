# PiXiEEDraw Extension Host API

PiXiEEDraw の拡張機能は `sandbox iframe` 内で動きます。  
本体へ影響を与える時は、直接 DOM を触るのではなく、この host API を経由します。

## 目的

- 同じ `.js` を共有すれば、他の人も同じ拡張機能を再現できる
- 本体機能への参加は許可する
- ただし課金や共有破壊につながる外部接続・直接変更は防ぐ

## メタ情報ヘッダ

拡張ファイル先頭コメントには、次のメタ情報を付けられます。

```text
 * Name: Extension name
 * Version: 0.1.0
 * Author: Your name
 * Description: One-line summary
```

この値は拡張パネルの保存済み拡張カードに表示されます。

## 禁止事項

- `fetch / XMLHttpRequest / WebSocket / EventSource / Worker / SharedWorker`
- `Supabase` やその他の従量課金 API への接続
- 親ページ DOM の直接編集
- 共有状態の直接変更
- 他ユーザー端末への直接反映

## 利用可能 API

### Panel API

- `api.ui.getRoot()`
  - 拡張パネル内の root を返す
- `api.ui.clear()`
  - root の内容を消す
- `api.ui.mount(node)`
  - root を `node` で置き換える
- `api.ui.append(node)`
  - root の末尾へ追加する
- `api.ui.setTitle(text)`
- `api.ui.setSubtitle(text)`
- `api.ui.setStatus(text, kind)`
- `api.ui.addStyles(css)`
- `api.ui.el(tag, props, children)`

### State API

- `api.getContext()`
  - 現在の簡易状態スナップショットを返す
- `api.storage.get(key, fallback)`
- `api.storage.set(key, value)`
- `api.storage.remove(key)`

### Host Interaction API

- `api.registerTool({ id, label, hint })`
  - 既存ツール欄に拡張ツールを追加する
- `api.unregisterTool(id)`
- `api.clearTools()`
- `api.activateTool(id)`
  - 追加済み拡張ツールをアクティブにする
- `api.capturePointer(enabled)`
  - 拡張ツール有効中にキャンバス入力を受け取る
- `api.drawPixels(pixels, color)`
  - 既存キャンバス上に拡張オーバーレイを描く
- `api.clearPixels()`
  - 拡張オーバーレイを消す

## イベント

### 共通イベント

- `init`
- `context`
- `interval`

### 拡張ツールイベント

- `tool:pointerdown`
- `tool:pointermove`
- `tool:pointerup`
- `tool:pointercancel`

各 `tool:*` イベントでは以下のような payload を受け取ります。

```js
{
  toolId: 'host-sample',
  pointerId: 1,
  pointerType: 'mouse',
  button: 0,
  buttons: 1,
  pressure: 0.5,
  isPrimary: true,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  trackedByPointer: false,
  now: 1700000000000,
  targetId: 'localExtensionInputLayer',
  targetClass: 'local-ext-input-layer is-active',
  client: { x: 300, y: 220 },
  cell: {
    x: 10,
    y: 12,
    clampedX: 10,
    clampedY: 12,
    inside: true,
    width: 64,
    height: 64
  }
}
```

## `api.getContext()` の内容

現状は次の情報を返します。

```js
{
  href,
  language,
  now,
  isMobileLayout,
  activeTool,
  activeLeftTab,
  activeRightTab,
  multiStatus,
  isMultiActive,
  localToolCount,
  activeLocalToolId,
  localToolCapture,
  localPaintPixelCount
}
```

これは将来増える可能性があります。  
拡張側では「必要なキーだけ使う」前提にしてください。

## `api.drawPixels()` の仕様

- `pixels` は `{ x, y }` の配列
- 最大処理数は 1 回あたり `32768`
- 範囲外ピクセルは無視される
- 描画はメイン絵に直接反映されず、拡張オーバーレイとして重なる

`color` は以下の形です。

```js
{ r: 124, g: 227, b: 255, a: 255 }
```

- `a` は `0-255` または `0-1`

## 設計指針

- 本体に作用させたい時ほど、直接操作ではなく API を増やす
- API はローカル完結・再現可能・課金安全を優先する
- 共有状態へ入れたい要素は、拡張 API ではなく本体機能として別途設計する

## サンプル

- host API 使用例: `pixiedraw/docs/extension-host-api-sample.js`
