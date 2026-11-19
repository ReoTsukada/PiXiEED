# CORE DESCENT — PiXiEED

数字を組み、武器と魔法を育てる。32×32多層スプライトのファンタジーRPG。

公開入口: https://pixieed.jp/core-descent/ （0.7.0 公開アルファ版）

## 開発

Node.js 22以降、実行時依存なし。npm run build / npm test / npm run balance。

- src/weapons.mjs: 0〜9の武器系統と基礎数値
- src/core.mjs / catalog.mjs: 数字パズル、32種の効果、所持品と移行
- src/world.mjs: 5フィールド、15通常敵、5階層ボスと行動数値
- src/items.mjs / loot.mjs: 装備18種・素材20種・消耗品2種、固有ドロップ、製作
- src/map.mjs / fog.mjs: 部屋生成と視界・既探索
- src/sprites.mjs / renderer.mjs: 32×32原画の積層、奥行き、霧、戦闘表示
- src/engine.mjs / boss.mjs: 表示に依存しない戦闘
- src/app.mjs / camp-ui.mjs: 拠点、フィールド体験、編成、持ち物・工房、図鑑、保存、自己記録
- docs/RELEASE_V07.md: 現行仕様、数値、保存互換性

index.htmlをPiXiEEDの既存静的配信で公開する。オンライン順位と実プレイヤー間オークションは未接続。通常所持品は引き継ぎ、v0.7の自己記録は新しいルールで保存する。
