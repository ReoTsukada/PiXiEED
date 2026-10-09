# /draw/ 選択確定解除とキャンバス外ポインタ継続

## 採用動作

- 選択ツールの既存選択外への単タップは、所有ポインタのupで変形を確定し、その1回で選択枠を解除する。画素は戻さない。確定に失敗したときはプレビュー・選択・取消ボタンを維持する。
- 選択外から新しい矩形をドラッグすると、前の変形を確定してから新範囲を選ぶ。途中で開始点へ戻っても、一度ドラッグ閾値を超えた操作を単タップへ変更しない。
- ペン等の別ツールによる選択外タップは選択を解除しない。選択マスクの内側だけ描く。既存の×／Esc、右側ボタン割当・取消は別の経路を維持する。
- Shiftで追加、Ctrl／⌘で減算。down時の修飾キーを操作終了まで固定する。既存のAltによる選択内移動と角の自由回転、角のShiftスナップを維持する。角・中心・反転の明示的ハンドルはそれぞれの操作を優先する。
- マスク合成は透明セルと離れた領域・穴を保持する。全減算は選択解除。進行中変形へ追加／減算する場合、upまで前の変形を保ち、確定成功後のマスクへ合成する。cancelは開始時の選択へ戻す。

## 入力経路と境界

| 経路 | 継続・終了規則 |
| --- | --- |
| 直接ペン／消しゴム／直線／図形／スプレー | canvasで開始したpointerIdをcaptureし、外でのmove/upも受ける。座標を画素走査前にclip、図形はcanvasの行・列だけ走査する。1ストローク1履歴。 |
| 矩形選択／移動／変形 | 同じpointerIdを追跡。画面外upで選択を取消しない。選択矩形はcanvasと交差、変形・中心の座標は既存上限を維持。 |
| 塗りつぶし／スポイト／同じ色選択 | downで選んだセルをupで処理する既存タップ操作。cancel／capture喪失では実行しない。 |
| 仮想カーソルのpad／マウス | 毎moveでraw指位置を更新し、前回との差分をcursorへ加えてcursorだけclampする。外へ出た距離を戻すdeadzoneを作らない。pad所有者を維持。 |
| 仮想padの2本指 | 既にpadで開始した接触は外でもpinch／panを継続。画面内判定で停止しない。pinch中のcursorは画面座標を維持し、2→1の指復帰で古い移動を描画へ転用しない。 |
| middle／Space pan、直接2本指 | 登録した所有ポインタだけを処理。外で続行しupで終了。異常cancelは指ジェスチャーのUndo／Redoへ変換しない。 |
| UIの道具割当・パネル移動・Undo長押し | それぞれの既存UI規則。道具割当controlを離れると取消す処理は描画継続とは別。UI／canvas外で開始した入力をcanvasへ引き継がない。 |

pointerleaveは終了通知にしない。documentの継続フォールバックもcanvas／選択controlで登録したポインタだけに限定する。通常up後は登録を先に消すので、暗黙capture解除のlostpointercaptureや無関係の指は確定結果を変更しない。

異常喪失は用途別に処理する。touch／pen、選択、未確定タップは進行中操作の取消・開始checkpointへ復帰。blur／pagehide／非表示化は安全cleanup。所有する直接mouse描画のcapture喪失だけは、既存のマウス解除修正どおり最後に受理した画素までを1履歴として確定する。Chromiumの左右同時押下ではsecondary mouseup後、ownerがまだ押されていても次move前にlostcaptureが来ることをblank pageでも確認したため、一律rollbackを避ける。喪失イベントの座標を新たに描かず、tapや選択変形を暗黙確定しない。

## 再現手順

1. 絵を描き、四角形選択して内側をAlt＋ドラッグで移動する。外を1回タップする。移動後の絵は残り、枠だけ消える。Undoを1回押すと移動前へ戻る。
2. 選択したままペンへ切り替え、選択外をタップする。枠は残り、選択外の画素は変わらない。
3. ペン／図形／選択をcanvas内で開始し、押したままcanvas・boardの外へ出て戻る。再入場も同じ操作が継続し、外で離しても正常終了する。
4. 仮想カーソルを有効にし、padの指を外へ動かしてcursorを端まで送る。指が外にあるまま8px逆方向へ動かす。cursorは直ちに8px戻る。
5. Shiftで離れた範囲を追加、Ctrl／⌘でその範囲を減算する。穴と透明セルの選択制限が維持される。cancel時は開始選択へ戻る。

## 検証と限界

最終検証:

- `rg --files -0 tests -g '*.test.mjs' | xargs -0 node --test`: 1766/1766 PASS。描画関連だけの実行は163/163 PASS。
- `node scripts/creation-suite-harness.mjs --all`: 全suite PASS。
- `deno test --allow-env supabase/functions/_shared/*.test.ts supabase/functions/{create-post,delete-post,moderate-post,public-post-puzzle,set-author-name}/index.test.ts`: 51/51 PASS（実行時は各パスを列挙）。DB専用integrationは今回の対象外。
- `node scripts/build-pages-site.mjs --output /tmp/pixieed-draw-pointer-build-20261009-v1`: PASS。新規inputモジュールもbuildへ含まれることを確認。
- Chromium context harness: 320×568／390×844／1280×800／844×390、17項目×4=68 PASS。PXD保存、共通出力からのPNG取得と画素一致、失敗時の確定保護、touch取消、右側独立ツールを含む。
- Chromium virtual gestures: 同4サイズ、13項目×4=52 PASS。端へのclamp後に外で8px戻す操作、2本指／2→1復帰とPNG画素一致を含む。
- 新規pointer continuation harness: 390×844／1280×800、34 PASS。mouseとCDP touch、外での描画・選択・pan、Undo、UI開始の除外、異常喪失／late通知を確認。
- 新規selection modifiers harness: 同2サイズ、7項目×2=14 PASS。Ctrl／⌘、透明領域・穴、変形確定と取消、外touch単タップを確認。
- 既存button cancellation: 同2サイズ、12項目×2=24 PASS。高速strokeのfinalモード: 4サイズ34 PASS。同じ色選択: Chromium4サイズ、7項目×4=28 PASS。最後に回転マスク6セル／外タップ後画素一致を4サイズで再確認。
- `node --check`、`git diff --check`: PASS。

証拠は `/tmp/pixieed-draw-selection-context-20261006/results.json`、`/tmp/pixieed-draw-virtual-gestures-20261006/results.json`、`/tmp/pixieed-draw-selection-modifiers-20261009/report.json` と各ハーネス標準出力。生の `node --test` 自動探索はブラウザ専用media-test、Deno用TS、DB専用integrationをNodeとして実行して11件失敗するため、上記のランタイム別指定で全Node用テストとDenoテストを確認した。

ChromiumのmouseとCDP touch emulationが証拠。物理touch／pen、Safari、ブラウザ画面外でOSからイベントが届かない区間、本番反映は未検証。push／deployは行わない。PXD直接保存・共通出力・Offerwall・Amazon非公開・望遠鏡は変更対象外で、他担当の出力hero・デモ素材を編集・stage・commitしない。

親から提供された公式仕様の確認内容: [Aseprite transformations](https://www.aseprite.org/docs/transformations/)、[selection](https://www.aseprite.org/docs/selecting/)、[move selection](https://www.aseprite.org/docs/move-selection/)、[Pointer Events](https://www.w3.org/TR/pointerevents4/)。確定＋枠解除を選択ツールの外単タップに限定する点は今回の利用者要件。
