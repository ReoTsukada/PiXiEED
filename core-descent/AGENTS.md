# Repository guidance

## Project
CORE DESCENT: 数字パズルで武器と魔法を構築する、職業制限のない主人公1人の自動攻撃ファンタジーRPG。ユーザー向け説明は日本語。ユーザーの2026-11-19の明示依頼により、PiXiEEDの新ゲーム /core-descent/ として統合・公開する。変更は本ゲームとその必要な導線・配信設定に限定する。

## Invariants
- 数字0〜9はアイテム個体に固定。装備・戦闘で変更しない。
- 上の数字は下2個の和の1の位。同じ段では数字重複不可。最大9段45枠。
- 各コア出力 = 左下の出力 + 右下の出力 + 自身の効果。経路の重複を勝手に除去しない。
- 頂点は武器核（保存上はemitter）。固定数字0〜9が10武器系統に対応。通常編成は武器変更後も数字条件が必要。直下2枠に固定の役割を導入しない。
- 主人公1人。移動を操作し、自動照準・自動攻撃。45キャラが独立攻撃する方式にしない。
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
- 現行仕様と次の作業: docs/RELEASE_V08.md。5フィールド・戦利品の継続仕様はdocs/RELEASE_V07.md。

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

## v0.6 ファンタジー・武器核・部屋探索の履歴
- ユーザーの変更指示により、v0.5の射撃固定と表示だけの変更方針を更新。職業は追加しない。
- 主人公/敵/武器の原画層は32×32。tileも32。ボスの表示倍率は独立。
- 武器核は0〜9を初期所持し自由に交換。既存のアイテムID/個体値/配置を保つ冪等な移行。
- 近接は斬撃/突き、遠隔は矢/往復刃/魔法など固有の命中判定。全武器に同じコア効果を組み合わせる。
- src/weapons.mjsを武器数値の正本とする。射程・視界コアを含む27定義はcatalog.mjs。
- 部屋を短い2マス通路でつなぐ。map生成の全床接続とループを維持。完全迷路へ戻さない。
- fog.mjsが現在視界と既探索を保持。壁越しの視線と未発見の敵/出口/ミニマップを開示しない。
- 所持セーブv4キーは維持。記録条件は0.6.0・fantasy-rooms-01でv6キーへ保存し、旧記録を削除しない。
- 自動完成は実験室だけ。通常武器変更で数字を勝手に変えない。

## v0.7 フィールド・固有戦利品の履歴
- ユーザーの追加要件: 草原・砂漠・溶岩・毒沼・氷原、固有モンスターと5階ごとのボス、敵別の行動、コア以外の戦利品。
- world.mjs がフィールド/敵の数値正本。5階ずつの帯を25階周期で繰り返し、絶対階層で難度を上げる。
- 32種のコアすべてを10種の武器で使える。固有ドロップ5種も武器制限を追加しない。
- items.mjs / loot.mjs が素材・防具/護符/靴・消耗品・固有ドロップの正本。所持コア配列と追加資産を混同しない。
- 全戦利品は回収後も未確保。bankRunの第5引数cargoまで全検証し、帰還時に一括確定。死亡で出発前資産を失わない。使用した道具は消費済み。
- 装備はコア合成後の最終補正。コア経路で増幅せず、使用武器により無効にしない。
- ボス限定コアは通常rollItemから除外。限定素材/装備も定義した敵以外から抽選しない（素材による工房製作は可）。
- 危険床や敵の攻撃予告は可視範囲に限って描画。攻撃は壁を越えず、未探索情報を開示しない。
- 所持品の保存キーv4を保持、追加フィールドを冪等に移行。0.7.0 / fantasy-worlds-01の記録をv7キーに保存。旧記録は消さない。
- フィールド/ボスからの試遊は実験室のみ。通常探索と階層チャレンジは1階から。無限ボス試験は階層ボスと別で、道具使用不可。
- 公開対象は生成index.htmlのみ。QAファイル・スクリーンショット・開発サーバー設定は配信対象外。

## v0.8 滑らかな視界・武器の構え（現行）
- 明暗は主人公の連続した位置から距離に応じて滑らかに変える。原画スプライトはぼかさず、低画質でも滑らかな暗転を維持。
- 光と霧の変更は描画のみ。視界半径・壁の遮蔽・自動照準・命中・探索済み記録を変えず、未発見の敵・戦利品・出口を開示しない。
- 基本の8武器は移動中も攻撃可能。大剣(2)は0.18秒、槌(5)は0.28秒の静止を必要とし、基礎威力はそれぞれ90・88。
- 移動入力で構えをリセット。攻撃後の移動固定は追加しない。移動中も攻撃間隔を進め、未発動の通常攻撃を蓄積しない。回復由来の追加攻撃も同じ構え条件で判定。
- 攻撃速度は攻撃間隔へ適用し、武器固有の構え時間は短縮しない。通常探索・階層ボス・無限ボス試験で条件を統一。
- 武器の攻撃状態を戦闘画面で表示し、説明・理論DPSの前提・実戦挙動を一致させる。全32コアの共通利用を維持。
- 所持品v4キーを保持。自己記録は0.8.0 / fantasy-stance-01 / core-descent-records-v8。以前の記録キーを削除しない。
