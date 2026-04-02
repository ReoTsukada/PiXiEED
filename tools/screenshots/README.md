# Screenshot Automation

HTML/CSS を実際に描画した状態から、各ツールのスクリーンショットを自動生成するための簡易ツールです。

## 使い方

1. `cd tools/screenshots`
2. `npm install`
3. `npx playwright install chromium`
4. `npm run capture`

## 設定

`pages.json` にエントリを追加します。

- `urlPath`: ローカル静的サーバー上の対象パス
- `waitFor`: 描画完了待ちのセレクタ
- `viewport`: 撮影時の幅と高さ
- `selector`: 指定時はその要素だけ撮影
- `fullPage`: `true` ならページ全体を撮影
- `evaluateScripts`: 撮影前にページ内で実行する JS
- `setInputFiles`: ファイル入力へ差し込むローカル画像
- `output`: 出力先

## 登録済みプロジェクト

- `pixiedraw`
- `jerin-maker`
- `pixiee-lens`
- `qr-maker`
- `pixfind`
- `maoitu`
- `maou-war`

各プロジェクトは基本的に `OGP/代表画像 + 実画面2枚` を作る前提で、状態差分が分かるスクリーンショットを登録しています。

## 備考

- 画像生成は `scripts/static-server.mjs` を使ってローカル配信したページを Playwright で撮影します。
- `pixiee-lens` のようにカメラ権限が絡むページは、必要に応じて別途ダミー状態を作る初期化処理を追加してください。
