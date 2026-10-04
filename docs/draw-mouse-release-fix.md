# マウスの入力解除で描画が戻る問題（2026-10-04）

## 作業範囲

利用者の報告は、マウスを動かしながら左ボタンを離すと描画が元に戻ること。道具はペンの回答後「全て」と訂正されたため、道具共通の終了処理を対象にした。親が設計・統合・最終受入、既存担当が限定ソース修正と隔離ブラウザー再現／確認を分担した。

変更は js/creation/draw-page.mjs とDraw HTML/entryの読み込み版、本記録。既存の未コミット道具・設定・アイコン差分と利用者の編集中プロジェクトを保持した。コミット・プッシュ・公開は行っていない。

## IMPLEMENTED

- lostpointercaptureをpointercancelと同じ取消扱いにしていたため、マウスの入力取得がpointerupより先に解除されると、受理済みの画素までcancelDrawStrokeで元に戻り、後続upも無視された。
- 所有するマウスのlostpointercaptureでは、最後に受理した位置までを1履歴として確定する。解除通知の座標は描画へ追加しない。後続up／lost通知は同じストロークを変更しない。
- 所有マウスの移動イベントで主ボタンが離れていれば、まとめられた座標も適用して描画を確定する。右ボタンだけが残る同時押しでは左ボタン解放がpointermoveになるため、この経路でも描画を止める。
- document側のmouse pointerupを同じ終了処理へ接続し、キャンバス側のupが届かなかった場合を補う。ポインター所有者とactive状態の既存ガードで二重処理を防ぐ。
- 塗りつぶし・スポイトの未確定タップはcapture喪失で実行しない。pointercancel、タッチのcapture喪失、ピンチへの切替、Escapeの意図的な取消は維持する。
- 読み込み版はDraw HTML → draw-entry → draw-pageで 20261004-mouse-release-1。他の設定CSS・共有部品の版は変更していない。

## 再現と検証

- 修正前: 隔離Chromium 1280×900で通常upとキャンバス外upは筆跡保持。押下中のcaptureを明示解除して実lostpointercapture(mouse, buttons=1)を発生させると、画素は開始前へ戻り、Undo無効、後続upも無視された。同時押しでは左解放がpointermove(buttons=2)、右も離すとpointerupになった。記録: /tmp/pixieed-mouse-release-20261004/repro.json。
- 修正後: 13シナリオを親で受入。ペン・消しゴム・スプレー・直線・四角形・塗り四角形・楕円・塗り楕円・範囲移動で、実capture喪失後の画素保持、up後の不変、1回の取り消し／やり直しが画像単位で一致。
- 塗りつぶし・スポイトではgotcapture→lostを実際に発生させ、喪失時／up後に意図しない操作がなく、道具状態が維持されることを確認。同時押しは左解放時にUndo有効、以後の右のみ移動で不変、Undo/Redo一致。capture取得をfixtureで無効化したdocument pointerup経路も画素14個とUndoを保持した。
- 統合受入: /tmp/pixieed-mouse-release-20261004/acceptance-final.json。ブラウザー実行エラー0、現在のソースハッシュ一致。途中の誤ったpending capture fixtureはsupersededFixturesに理由付きで区別し、元のfinal.json／remaining-final.jsonも保存した。
- node --check js/creation/draw-page.mjs と node --test tests/creation-suite/draw.test.mjs tests/creation-suite/draw-animation-session.test.mjs: 22/22 PASS。
- PIXIEED_FAST_STROKE_PHASE=final node scripts/draw-fast-stroke-browser-harness.mjs: 320×568、390×844、1280×900、844×390の4サイズ、34項目PASS。通常の素早い終点、疎な移動、塗り図形・範囲選択、取消／ピンチ／Escape、他ポインター、ズーム、coalescedサンプルを再確認。
- PIXIEED_FAST_STROKE_PHASE=tap-check node scripts/draw-fast-stroke-browser-harness.mjs: 通常の塗りつぶし・スポイトの3項目PASS。
- 既存ハーネスを専用名で最初に起動した際はfinal限定の追加項目が実行されなかったため、上記finalモードで改めて確認した。必要な回帰結果はfinalとtap-checkの記録を根拠とする。

## UNIMPLEMENTED / UNTESTED

再現できた入力解除時の線消失への修正に未実装項目はない。実機、Safari、本番、利用者の現行プロジェクトでの同じイベント列は未確認。明示的capture解除・CDP入力・一部の制御されたfixtureを使った隔離Chromiumの確認であり、物理端末での同一発生条件の保証とは区別する。

次の最小確認は、描画を保存して再読み込みし、普段のマウス操作で線を引いて離すこと。

週間使用率は開始15%、終了15%（同一リセット期間、表示上0ポイント）。共有アカウントの値であり、この修正だけの厳密な消費量ではない。
