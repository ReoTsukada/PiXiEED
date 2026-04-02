# PiXiEEDraw Extension GPT Guide

PiXiEEDraw の `拡張ファイルを作る` で出る `.js` は、そのまま GPT に渡して編集できます。  
この説明書は、GPT に「何を守って編集するか」を伝えるための前提です。
現在の既定テンプレは `Host API Starter` です。
テンプレ先頭には `Name / Version / Author / Description` のメタ情報ヘッダがあります。

詳細な host API 仕様は `pixiedraw/docs/extension-host-api.md` を参照してください。  
既存ツール欄追加とキャンバス入力取得の最小例は `pixiedraw/docs/extension-host-api-sample.js` にあります。

## 渡すもの

- PiXiEEDraw が作成した `.js` テンプレファイル
- この説明書

## 実際に GPT に渡す時の形

おすすめは次の 2 点セットです。

- 生成した `.js` テンプレ本体
- この説明書

理由:

- `.js` の先頭コメントに、実行環境と禁止事項を埋め込んである
- `.js` の先頭コメントに、メタ情報ヘッダも含まれている
- この説明書には、より長い前提と依頼文の型がある
- 片方だけより、GPT が誤読しにくい

## この拡張の実行環境

- 拡張は `この端末だけ` で動く
- 拡張は `sandbox iframe` の中で実行される
- 拡張パネルの shell は最初から用意されている
- UI は `api.ui.getRoot()` で取得できる専用 root の中に作る
- `canvas` を好きな数だけ作れる
- 公開 API 経由なら既存ツール欄やキャンバス入力にも参加できる
- ローカル保存は `api.storage.get/set/remove()` を使える
- 外部通信はできない
- Supabase や課金系 API には接続できない
- 親ページ DOM には触れない
- 共有状態や他人の画面には触れない
- 本体への影響は公開 API 経由だけに制限される
- 拡張パネルには、保存済み拡張がカード状に並び、各拡張を ON / OFF 切替できる

## メタ情報ヘッダ

テンプレ先頭コメントには次の形式を含めてください。

```text
 * Name: Extension name
 * Version: 0.1.0
 * Author: Your name
 * Description: One-line summary
```

- `Name`
  拡張の表示名
- `Version`
  任意のバージョン文字列
- `Author`
  制作者名
- `Description`
  1行の説明

## 使える API

- `api.on(name, handler)`
  イベント購読
- `api.toast(message, level)`
  拡張パネル内のステータス表示
- `api.ui.getRoot() / clear() / mount(node) / append(node)`
  既存 shell の中へ UI を出す
- `api.ui.setTitle(text) / setSubtitle(text) / setStatus(text, kind)`
  shell 見出しと状態表示を変える
- `api.ui.addStyles(css)`
  拡張専用 CSS を追加する
- `api.ui.el(tag, props, children)`
  要素作成の簡易 helper
- `api.getContext()`
  現在の簡易コンテキスト取得
- `api.registerTool(tool) / unregisterTool(id) / clearTools() / activateTool(id)`
  既存ツール欄へ拡張ツールを追加・切替
- `api.capturePointer(enabled)`
  拡張ツール有効中のキャンバス入力取得
- `api.drawPixels(pixels, color) / clearPixels()`
  既存キャンバス上へ拡張オーバーレイを表示
- `api.storage.get/set/remove()`
  端末内だけの保存

## よく使う event

- `init`
- `context`
- `interval`
- `tool:pointerdown`
- `tool:pointermove`
- `tool:pointerup`
- `tool:pointercancel`

## GPT に守らせる条件

以下をそのまま渡してください。

```text
このファイルは PiXiEEDraw の拡張機能です。

必ず守ること:
- 単一の .js ファイルのまま編集する
- 外部ライブラリを使わない
- 外部通信しない
- fetch / XHR / WebSocket / Supabase など外部接続は使わない
- 親ページの DOM は触らない
- 本体への影響は公開 API 経由だけで行う
- 既存の拡張パネル shell は api.ui から使う
- PiXiEEDraw 本体の共有データは直接変更しない
- 既存のコード構造とコメントをできるだけ保つ
- 壊してよいのは依頼した機能の範囲だけ
- 完成コードだけを返す
```

## 今のテンプレの構造

テンプレは大きく 5 セクションです。

- `1) Config / State`
  ツールID、保存キー、色、描画状態
- `2) Helpers`
  色変換、描画ピクセル生成、情報表示
- `3) Panel UI`
  api.ui の shell に UI を組み立てる
- `4) Host API Wiring`
  `registerTool()` / `capturePointer()` / `drawPixels()` の接続
- `5) Events`
  `init` と `tool:*` イベントで挙動を作る

## GPT に頼みやすい変更例

- 既存ツール欄に複数の拡張ツールを出したい
  - `registerTool()` と `tool:*` の分岐を増やしてもらう
- オーバーレイを十字ではなくブラシ形状にしたい
  - `makeCrossPixels()` 相当の生成処理を変えてもらう
- 色だけでなくサイズも保存したい
  - `storage` と UI を拡張してもらう
- Shift 押下時だけ別動作にしたい
  - `tool:pointer*` の payload を使って分岐してもらう
- パネルにプレビューやメトリクスを追加したい
  - `Panel UI` と `renderInfo()` を拡張してもらう
- オーバーレイではなく独自 canvas も併用したい
  - `api.ui` 側の描画領域を増やしてもらう

## GPT に渡す依頼文の型

```text
添付した PiXiEEDraw 拡張機能テンプレを編集してください。
添付した guide の制約を守ってください。

変更したい内容:
- ここにやりたいことを書く

追加条件:
- UI は今より崩さない
- 既存の保存処理は残す
- 単一ファイルのまま返す
- 完成コードのみ返す
```

## 依頼文の具体例

### 例1: 拡張ツールを2種類に増やす

```text
添付した PiXiEEDraw 拡張機能テンプレを編集してください。
guide の制約を守ってください。

変更したい内容:
- 既存ツール欄に「塗る」と「消す」の2つの拡張ツールを追加する
- 塗るツールは現在色でオーバーレイを描く
- 消すツールは clearPixels() ではなく、通過した周辺だけを消すようにする

追加条件:
- 既存の保存処理は残す
- tool:pointer 系イベントを使う
- 単一ファイルのまま返す
- 完成コードのみ返す
```

### 例2: パネル側に設定を増やす

```text
添付した PiXiEEDraw 拡張機能テンプレを編集してください。
guide の制約を守ってください。

変更したい内容:
- オーバーレイ色に加えてブラシサイズも変更できるようにする
- ブラシサイズは 1 / 3 / 5 から選べるようにする
- 色とサイズはローカル保存する

追加条件:
- 保存処理はそのまま残す
- 完成コードのみ返す
```

## GPT に伝えると事故が減ること

- どの関数だけ触ってほしいか
- 見た目も変えたいか、機能だけ変えたいか
- 既存の保存データを壊していいか
- 既存のレイアウトを維持したいか
- 速度重視か、見た目重視か

## 向いている改造

- 独自 UI
- 独自 canvas
- ローカル保存
- 補助プレビュー
- 音や簡単なアニメーション
- 作業補助パネル

## 安全に追加しやすいもの

- 第2キャンバスや第3キャンバス
- プレビュー専用表示
- 作業メモ
- 補助UI
- ローカルだけの音
- ローカルだけの保存付き設定

## 向いていない改造

- 共有データの直接編集
- 外部API連携
- 他人の端末への反映
- 親ページそのものの改造
