# Repository guidance

## Project
CORE DESCENT: 数字パズルで銃の能力を構築する、主人公1人の自動射撃サバイバル。ユーザー向け説明は日本語。ユーザーの2026-11-19の明示依頼により、PiXiEEDの新ゲーム /core-descent/ として統合・公開する。変更は本ゲームとその必要な導線・配信設定に限定する。

## Invariants
- 数字0〜9はアイテム個体に固定。装備・戦闘で変更しない。
- 上の数字は下2個の和の1の位。同じ段では数字重複不可。最大9段45枠。
- 各コア出力 = 左下の出力 + 右下の出力 + 自身の効果。経路の重複を勝手に除去しない。
- 頂点は弾丸生成。直下2枠に攻撃/支援等の固定役割を導入しない。
- 主人公1人。移動を操作し、自動照準・自動射撃。45キャラが独立攻撃する方式にしない。
- 通常モードにパズルの自動完成や数字の自由変更を導入しない。実験室は別資産。
- 帰還で今回の戦利品を確保。失敗時に出発前の資産を没収しない。
- 将来の市場は全アイテムが取引対象。出品中/探索中の一時ロックは必要。無断で永続バインドを導入しない。
- レア度はコモン/アンコモン/レア/エピック/レジェンダリー。個体値は取得時に固定し、装着/帰還/取引で再抽選しない。
- 増幅は直属の上側コア自身の数値へ1回ずつ適用。通常効果への加算や経路数べき乗を禁止。詳細はdocs/RARITY_AMPLIFIERS.md。
- 特殊効果の端数を黙って捨てない。強化は計算式・画面表示・テストを一致させる。

## Files to consult by task
- ルール/新機能: docs/GAME_DESIGN.md
- 能力/合成: docs/CORE_SYSTEM.md、docs/ABILITIES.md、docs/RARITY_AMPLIFIERS.md
- オンライン/取引: docs/ONLINE_DESIGN.md
- 次の作業: docs/RELEASE_V05.md

## Verification
Run `npm run build` and `npm test` after code changes. When modifying UI, inspect the game in an actual browser at desktop and mobile viewport sizes. Keep any local QA outputs in qa/ and do not publish them. Record untested areas honestly. dist/index.html is generated; edit src/ instead. Runtime has no dependencies; adding services or libraries requires a concrete need.

## Security boundary
Client saves and AuctionBook are LOCAL demonstrations, not trusted production state. Do not expose production keys, deploy paid resources, publish externally, or connect local assets to real players without explicit authorization. Database changes require migration review and an isolated test database. No claim of concurrency safety without actual DB concurrency tests.

## v0.3の履歴
- 数値変更はdocs/BALANCE_V03.md、src/catalog.mjs、engine.mjs、combat-math.mjsを整合させる。
- v0.3のPvP案はv0.4で採用中止。旧係数は回帰試験用の履歴としてのみ扱う。
- `npm run balance`も実行し、固定命中試験と移動を含む実戦試験を区別する。

## v0.4の優先方針
- PvP/PvPvEは作らず、攻略階層・無限ボスの記録を競う。docs/RANKINGS_V04.mdを読む。
- 主順位は所有コアのレア度・個体値を活かす。PvP標準化を無断適用しない。
- 攻略済み階と到達階を区別。戦利品の帰還確保と記録保持を混同しない。
- 実験室・通常所持品・別ルール版・別チャレンジを混ぜない。
- ローカル記録は未検証。サーバー検証やオンライン順位を実装済みと扱わない。
- UI変更後は実ブラウザーで通常探索・実験室・自己記録・ボス画面を確認し、廃止したPvP表示を現仕様へ戻さない。

## v0.5 多層スプライト公開アルファ版
- 表示のみ2.5D化。floor/ability/scoring rulesはv0.4と同じで、既存セーブと分離記録を維持。
- src/sprites.mjs は2D画像素材をコードから生成し、src/renderer.mjsが高さ別に積層。engineはDOM/描画に依存しない。
- 画質設定や演出軽減で命中/ダメージ/速度/スコアを変えない。画面上の移動入力はrenderer.screenInputを介す。
- src/shell.htmlとstyle.cssが編集元。tools/build.mjsがindex.html/distを生成。
- 一般向け公開ページにNPC取引テストを露出しない。オンライン順位/ログイン/本物の市場は未実装であり、実装済みと表示しない。
- プレビュー・QA画像を公開サイトやLibraryへアップロードしない。ゲーム本体のコードによるスプライトは公開対象。
- 固定DPS、数値合成、帰還、ボス、表示投影をテスト。実機確認とサーバー検証は別工程。
