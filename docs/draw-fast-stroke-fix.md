# 素早いドラッグの終点取りこぼし修正（2026-10-04）

## 作業範囲

かんたんドットで素早くドラッグして離しても、指またはマウスを離した位置まで描画する。親チャットが設計・統合・受入を担当し、既存の実装担当とブラウザー担当へ限定委任した。既存の道具追加・共通アイコンの未コミット差分を保持した。

変更は js/creation/draw-page.mjs、描画画面の読み込み版（draw/index.html、js/creation/draw-entry.mjs）、限定ブラウザーハーネスと本記録。保存形式、カメラ、他ツールの入力方式、既存の道具UIは今回の変更対象ではない。コミット・プッシュ・公開は行っていない。

## IMPLEMENTED

- 原因は pointerup の座標を描画に反映せず、最後の pointermove の位置だけで履歴を確定していたこと。移動が間引かれた短いドラッグでは始点または途中までしか残らなかった。
- 描画ポインターの pointerup 終点を適用してから1ストロークを確定する。図形プレビュー、範囲選択・移動にも同じ終点処理を適用する。
- ペン・消しゴム・スプレーは getCoalescedEvents が利用できる場合、まとめられた途中の座標も順に描く。未対応の場合は通常の移動イベントで描く。
- ストロークとタップのポインター所有者を記録する。無関係なポインターの終了イベントや終了後の lostpointercapture が描画を途中で閉じないようにする。
- pointercancel、Escape、二本指への切替は既存どおり途中の変更を戻す。取り消し履歴は1ストローク1回を維持する。
- HTML → draw-entry → draw-page の読み込み版は 20261004-fast-stroke-1。他の道具資産は既存の 20261004-drawing-tools-4 を維持する。

## 検証

- 修正前: 320×568、390×844、1280×900、844×390 の4サイズでCDPマウス入力を再現。down(2,2) → up(8,2)・moveなしで終点は透明、途中moveを挟んでも離した終点は透明。塗り図形と範囲選択も途中の位置で止まった。記録: /tmp/pixieed-draw-fast-stroke-20261004/baseline/result.json。
- 修正後: 上記4サイズで34項目PASS、ブラウザーエラー0。移動なし/疎な移動からの終点、塗り図形・範囲選択の終点、1回の正確な取り消し/やり直しを確認。390pxではCDPタッチ、pointercancel・Escape、ピンチ時の復元、他ポインターの終了による非割込み、拡大時の終点、合成coalesced入力の曲がり角まで実画素を確認。記録: /tmp/pixieed-draw-fast-stroke-20261004/final/result.json。
- 補足: 390pxで通常の塗りつぶし・スポイトタップを3項目PASS、エラー0。記録: /tmp/pixieed-draw-fast-stroke-20261004/tap-check/result.json。
- node --test tests/creation-suite/draw.test.mjs tests/creation-suite/draw-animation-session.test.mjs: 22/22 PASS。構文確認と git diff --check 合格。
- 専用再現/受入: PIXIEED_FAST_STROKE_PHASE=final node scripts/draw-fast-stroke-browser-harness.mjs。

## UNIMPLEMENTED / UNTESTED

依頼された修正の未実装項目はない。実機、Safari、本番サイトは未検証。Chromium内のCDP入力と合成coalesced入力の検証であり、物理端末での保証とは区別する。利用者の編集中プロジェクトには触れず、隔離したブラウザーで検証した。

週間使用率は開始14%、終了14%（表示上の差分0ポイント）。共有アカウントの値であり、この修正だけの厳密な消費量ではない。
