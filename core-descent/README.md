# CORE DESCENT — PiXiEED

数字を組み、武器と魔法を育てる。32×32多層スプライトのファンタジーRPG。

公開入口: https://pixieed.jp/core-descent/ （0.8.0 公開アルファ版）

視界は主人公から離れるほど滑らかに暗くなる。基本の8武器は移動中も攻撃し、大剣・槌は短く足を止めて高威力の一撃を放つ。全32種のコアを全10武器で使用できる。

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
- docs/RELEASE_V08.md: 視界の明暗、武器の構え、数値と保存互換性
- docs/RELEASE_V07.md: 5フィールド、敵、戦利品・装備・工房の継続仕様

index.htmlをPiXiEEDの既存静的配信で公開する。オンライン順位と実プレイヤー間オークションは未接続。通常所持品は引き継ぎ、v0.8の自己記録は新しい戦闘ルールで保存する。
