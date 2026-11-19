# CORE DESCENT — PiXiEED

数字を組み、武器と魔法を育てる。32×32多層スプライトのファンタジーRPG。

公開入口: https://pixieed.jp/core-descent/ （0.9.0 公開アルファ版）

視界は主人公から離れるほど滑らかに暗くなる。基本の7武器は移動中も攻撃し、大剣・槌・杖は足を止めて高威力の一撃を放つ。杖は0.35秒の静止詠唱、魔導書は移動詠唱の3連追尾魔弾。全32種のコアを全10武器で使用できる。

## Codex / Astraで引き継ぐ

[CODEX_HANDOFF.md](CODEX_HANDOFF.md) に、現行仕様、ソースの入口、起動手順、保存互換、検証実績、未実装部分とCodexに渡す開始文をまとめている。GitHubの `main` を取得し、最初に [AGENTS.md](AGENTS.md) と併せて読む。

## 開発

Node.js 22以降、実行時依存なし。npm run build / npm test / npm run balance。

- src/weapons.mjs: 0〜9の武器系統と基礎数値
- src/core.mjs / catalog.mjs: 数字パズル、32種の効果、所持品と移行
- src/world.mjs: 5フィールド、15通常敵、5階層ボスと行動数値
- src/items.mjs / loot.mjs: 装備18種・素材20種・消耗品2種、固有ドロップ、製作
- src/map.mjs / fog.mjs: 部屋生成と視界・既探索
- src/actor-art.mjs / terrain-art.mjs: 32×32の人物・モンスター・地形の原画
- src/sprites.mjs / scenery.mjs / renderer.mjs: 原画の積層、部屋ごとの景観、奥行き、霧、戦闘表示
- src/engine.mjs / boss.mjs: 表示に依存しない戦闘
- src/app.mjs / camp-ui.mjs: 拠点、フィールド体験、編成、持ち物・工房、図鑑、保存、自己記録
- docs/RELEASE_V09.md: 二系統の魔法、人物・地形の原画、5フィールドの景観
- docs/RELEASE_V08.md: 視界の明暗、武器の構えの継続仕様
- docs/RELEASE_V07.md: 5フィールド、敵、戦利品・装備・工房の継続仕様

index.htmlをPiXiEEDの既存静的配信で公開する。オンライン順位と実プレイヤー間オークションは未接続。通常所持品は引き継ぎ、v0.9の自己記録は新しい戦闘ルールで保存する。
