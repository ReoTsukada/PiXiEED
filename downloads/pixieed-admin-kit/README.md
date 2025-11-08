# PiXiEED 管理者向けメモ

## ドットギャラリーの更新
- `portfolio/dots/` に PNG / JPG / GIF / WebP の作品を追加し、以下のコマンドを実行するとギャラリー用の `manifest.json` が再生成されます。

  
  `node tools/gallery/build.mjs`

- コマンド実行後に `portfolio/index.html` を再読み込みすると、追加した作品がビュアーに表示されます。

## 画面の更新
- `index.html` や `games.html` の表示は静的に管理しています。制作物の差し替え後はブラウザで再読み込みして見た目を確認してください。
- コンタクト導線のメールアドレスやリンクが変更になった場合は `contact/index.html` とフッターのリンクを合わせて更新します。

## 動作要件
- Node.js 18 以上（`node tools/gallery/build.mjs` が依存しています）。

以上です。
