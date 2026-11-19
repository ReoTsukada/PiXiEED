# CORE DESCENT — PiXiEED

数字を組み、一発を育てる。多層2Dスプライトで描く自動射撃サバイバル。

公開入口: `https://pixieed.jp/core-descent/`（0.5.0 公開アルファ版）

## 開発

Node.js 22以降、実行時依存なし。`npm run build` / `npm test` / `npm run balance`。

- `src/sprites.mjs`: 独自スプライトの層・姿勢キャッシュ
- `src/renderer.mjs`: 2.5D投影、奥行き、地形、影・演出
- `src/app.mjs`: 拠点、編成、探索、保存、自己記録
- `src/engine.mjs`: 描画非依存のシミュレーション
- `docs/RELEASE_V05.md`: 今回の公開範囲と続きの工程

ビルド後のindex.htmlをPiXiEEDの既存静的配信で公開する。オンライン順位と実プレイヤー間オークションは未接続。通常所持品と実験室は別資産。既存セーブの互換性を維持。
