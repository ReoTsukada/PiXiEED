ここに表示したいドット絵（PNG / JPG / GIF / WebP）を配置してください。
例: ARTA_HinyariToNyanbiri.gif / ARTA_TabunnItumonoShibuya.gif

配置後、以下のコマンドを実行すると `manifest.json` が自動生成され、トップページのドット絵ギャラリーに反映されます。

```
node tools/gallery/build.mjs
```

コマンドを実行すると `portfolio/dots/manifest.json` が上書きされます。ブラウザで `index.html` を再読み込みすると、ビュアーとボタンに新しい作品が表示されます。
