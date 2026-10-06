# かんたんドット：描画面・ミラー・仮想カーソル

2026-10-06。対象は `/draw/`。ローカル実装・検証のみ。コミット、push、deploy、依存追加、新しい投稿機能の実装は行っていない。作業開始時のイベントデータと可搬公開ツールの変更は触っていない。

## 実装

- グリッドと透明背景のチェック模様を、繰り返しCSSタイルから描画面サイズのCanvasへ変更した。各境界は入力判定と同じキャンバスの実表示矩形から独立に計算し、デバイスピクセルへ丸める。小数ズーム・パンで誤差が累積せず、拡大しても補助Canvasのメモリはビューポートの範囲に収まる。サイズ変更、リサイズ、DPI変更の通知で更新する。
- 常に操作できる再生・停止ボタンと現在コマ表示を追加した。フレームパネルも再生中の列を示し、UI更新で表示が消えないようにした。編集対象のコマ選択は再生位置で変更しない。1コマしかない場合は再生を無効にする。
- ミラー操作はビューポート外の36pxの一段。X/Yのつまみで4軸共通の中心を0.5px刻みで移動し、中央へ戻せる。4軸を個別に平行移動する仕様ではなく、有限な最大8個の対称コピーを保つ共通中心方式。ペン、消しゴム、直線、図形、スプレー、塗りつぶし、カーソル表示で同じ中心を使う。中心と軸の設定はPXDに保存する。
- 仮想カーソルを切り替えられる。移動パッド、左クリック、ドラッグ保持、右クリックを用意した。実マウスと矢印キーでも操作でき、カーソルの作用位置は可視キャンバスとビューポートの交差範囲に制限する。OSのカーソルは移動しない。右クリックは既存の道具メニューを開き、通常のキャンバス右クリックとも揃えた。
- モード解除・保存は受け入れ済みのストロークを確定する。Escape、pointercancel、ウィンドウのフォーカス喪失は描画を取り消して押下を解除する。意図しないキャプチャ喪失も押下を終える。仮想カーソルの有効状態と押下状態は保存しない。短い画面では操作欄を縮めずスクロールさせる。

## 再生についての確認済み範囲

変更前にも、異なる絵を持つ2コマの実画素は交互に変化した。申告された「フレームが再生しない」症状そのものは未再現で、根本原因を特定・修正したとは扱わない。

変更後は通常の16px、128px、256px、フレーム選択・編集の直後、パネル開閉中、保存した複数コマの再読込後を確認した。パネル内・外の両再生操作で画素の切替を確認し、停止後は編集コマへ戻って画素が安定する。複製元と同じ絵のままのコマは再生しても見た目が変わらない。

## 検証結果

- Mac上のChromium、1280×800/DPR 1・2、390×844/DPR 3、320×568/DPR 2、844×390/DPR 2で各12項目、計60項目PASS。外部通信は遮断した。画面のpageerrorは0。
- グリッドは32/128/256px、小数倍率2条件とパンで境界と入力先を検査。境界の丸め誤差は全条件で0.5デバイスピクセル以下、境界の欠落0。背景・グリッドをズームサイズの巨大Canvasにしないことも確認。
- 移動中心で4軸を同時使用し、期待する8画素の描画と1回のUndo、外側の36pxレールを確認。最も短い画面の描画領域は320×568で308×154px、844×390で約562×149px。横スクロールなし。
- 仮想カーソルの左クリック、連続ドラッグとUndo、表示範囲の制限、実マウス描画、3回の切替、Escape・blur・pointercancel・lostpointercapture、Chromiumの実タッチイベントのtouchCancel、通常と仮想の右クリックを確認。
- PXDの保存・再読込で軸・移動中心・複数コマの再生を確認。押下中の保存から再読込しても押下状態を復元しない。
- 関連Nodeテスト29件PASS。既存の対称描画ブラウザー検証9項目、アニメーション編集4画面、フレームグリッド4画面もPASS。構文確認、`git diff --check`もPASS。

実行例：

```sh
node --test tests/creation-suite/drawing-symmetry.test.mjs tests/creation-suite/draw-tool-operations.test.mjs tests/creation-suite/draw-animation-session.test.mjs tests/creation-suite/animation-controls.test.mjs
PIXIEED_BROWSER_BASE_URL=http://127.0.0.1:4188 node scripts/draw-viewport-browser-harness.mjs
```

ローカル結果は `/tmp/pixieed-draw-viewport-20261006/results.json`、画像5枚も同ディレクトリに保存。ユーザーの許可後、画像5枚はChatGPT Libraryにも保存した。

## 未検証・制限

- 手元のWebKitはページ生成時に `Page.overrideSetting: Unknown setting: PushAPIEnabled` を返した。検証プロセスを停止し、WebKitをPASSには含めない。実機Safari、iPhone、Androidは未検証。
- DPI 1・2・3は検証したが、実際のモニター間移動によるDPI変更通知は未検証。
- 本番環境、外部投稿、認証・公開経路は今回の検証対象外。再生不具合の元の条件が特定できた場合は追加の再現確認が必要。

## 対象ファイル

`draw/index.html`、`css/draw-viewport.css`、`js/creation/draw-entry.mjs`、`draw-page.mjs`、`draw-viewport-overlays.mjs`、`draw-virtual-cursor.mjs`、`drawing-symmetry.mjs`、`animation-controls.mjs`。検証は `scripts/draw-viewport-browser-harness.mjs` と関連テスト3ファイル。

## 最新修正：固定配置とビューポートパッド（2026-10-06）

この節が現在の仮想カーソルUIの仕様。上記の前回報告にある「移動パッド」「ドラッグ保持」の専用ボタンは現在は廃止されている。作業開始時の現行ソースには今回のUI変更が一部入っていたため、その変更を保持し、入力の作用範囲を補完して検証スクリプトを現行操作へ更新した。

### 実装済み

- 対称中心の36px欄と左右クリック欄を常に確保する。ミラーOFF・仮想カーソルOFFは非表示にせず、無効色とdisabledで示す。キャンバスと周囲の配置をON/OFFで変更しない。
- 仮想カーソルの切替は既存の描き方・表示設定ON/OFFパネル内。専用の移動・ドラッグ保持ボタンはない。
- 描画ビューポートを相対移動パッドにする。触れた位置へカーソルは飛ばず、指の移動量だけ動く。別の指で左クリックを押しながらパッドを動かすと描画する。左右ボタンとパッドのpointerId・キャプチャを分け、追加のパッド指は現在の移動指を奪わない。
- 左指または移動指の離れ、pointercancel、キャプチャ喪失、モードOFF、Escape、blur等で押下を解除する。OFFは受け入れ済みストロークを確定し、キャンセル・blurは取り消す。再ONで古い押下を復元しない。
- 今回補完した処理：キャプチャ中もパッドの作用をビューポート内に限定する。外へ出たサンプルは移動しない。再入域の最初のサンプルを新しい基準とし、飛びを防ぐ。pointerleaveはその指の基準だけを更新する。仮想モード中の描画面の読み上げ説明もパッド操作へ更新する。
- 左が1.35、右が1の幅比のマウス風パネルを描画面の外に固定。左右ラベルと半分を塗ったマウスアイコンで区別し、押下した側を水色で強調する。既存の色・角丸・余白に合わせ、主操作である左を押しやすくする。右は既存の道具メニューを開く。
- 320px・横向きでもクリック欄は描画面を覆わず、短い操作欄は独立してスクロールする。初めて設定を開くとブラウザーが設定ボタンへ操作欄をスクロールする場合がある。ON/OFFの矩形比較はその初期フォーカス位置を揃えて行う。

### 検証の記録

最終結果は `/tmp/pixieed-draw-viewport-fixed-20261006/results.json`。各画面の仮想OFF・ON・左押下中のPNGも同ディレクトリへ保存。実行コマンドは前掲の `scripts/draw-viewport-browser-harness.mjs` と同じ。

- Chromium 1280×800/DPR 1・2、390×844/DPR 3、320×568/DPR 2、844×390/DPR 2の5条件、各14項目・計70項目PASS、pageerror 0。全32組合せ（4ミラー軸の16通り × 仮想ON/OFF）で、ビューポート、キャンバス、36px欄、クリック欄、操作ドック、道具・編集行のbounding rectを比較する。
- Chromiumの実タッチ入力を使って相対移動、左右押下、2指描画、指ごとの解放、追加指の独立性、touchCancelを検証。pointercancel・blurはブラウザー内イベントを発火し、キャプチャ喪失は実際のキャプチャを解放して確認する。押下中のモードOFFは切替ボタンのclickを発火し、再ONと古い指の終了を確認する。
- ビューポート外への移動停止、戻った際の基準取り直し、可視キャンバスへのカーソル制限、実マウス描画、右クリック道具メニュー、Undo、グリッド、複数コマ再生、PXD保存・再読込も対象。
- 関連Nodeテスト29件PASS。既存の対称描画ブラウザー検証9項目PASS。高速描画ブラウザー検証4画面・34項目PASS。構文確認と `git diff --check` PASS。
- 既存のコマグリッド検証は1280×720と390×844がPASS。320×568で「色とペンが同時にスクロールなしで到達できる」という断言が失敗した。固定クリック欄により操作欄の表示高さが減り、色・道具・編集はスクロールが必要。今回の検証では各操作がスクロールで到達でき、その間も描画面が動かないことを確認済み。旧検証の後続の横向きコマ編集チェックは未実行。これを全回帰PASSとは扱わない。

実機Safari・iPhone・Android、WebKit、実モニター間のDPI移動、本番は今回未検証。元の再生不能症状は前回も未再現であり、今回の再生回帰PASSを根本原因修正の証明とは扱わない。コミット・push・deploy・公開なし。イベントデータ、可搬公開ツール等の無関係変更は保持した。

## 追加修正：左右独立のツール・色と操作欄配置（2026-10-06）

この節が最新仕様。前節の「左が広い」「右クリックで道具メニュー」は今回の依頼により置き換えた。ローカルのみで、既存変更を保持した。

### 操作

- 左右のクリック欄は等幅。各欄にツールアイコン、左右・道具名、色見本を表示する。仮想OFFでも欄と寸法を残し、無効状態を示す。
- 共通パレットの現在色の隣にある **L / R** で「編集するボタン」を選び、既存パレット・道具メニュー・ショートカットからその側のツールと色を設定する。巨大な左右別パネルは増やさない。描画そのものは押した論理ボタンの割当を使い、編集先のL/Rとは独立する。通常の指で直接描く場合は編集先を使う。
- 初期状態は左＝赤ペン、右＝青ペン。左＝赤直線・右＝青ペンのような組合せも可能。既存の共通パレットの色を参照するため、色そのものを編集すると従来どおりそのパレット色を使う画素も変わる。
- 実マウスの左・右とも描画し、右クリックで道具メニューは開かない。道具選択は既存の道具ボタンから行う。仮想ON中も実マウスの移動量でカーソルを動かし、実左右ボタンで描ける。指では左右の仮想ボタンを別指で押しながらビューポートを相対移動パッドにする。
- 押下時のツールと色インデックスをストロークの終了まで固定する。割当を編集した場合は次のストロークから反映する。左右同時押しは **先に押した側が優先**。後から押した側はその操作中に引き継がず、いったん離して次に押す。物理マウスの複数ボタンが同じpointerIdでpointermoveとして通知される場合も、所有側のbuttonsビットを確認する。
- 右の直線・図形はプレビューを置き換え、ペン・スプレーは移動サンプルを描く。塗りつぶし・スポイトはクリック確定、範囲移動は共有の1つの選択範囲を操作する。既存のUndo/Redo・取り消しの意味を保持する。
- 所有する指・ボタンの解放で確定、pointercancel・blur・Escapeで取り消す。仮想モード切替では受け入れ済みの描画／クリックを確定して押下を解放する。操作欄の配置変更と初期値復元は進行中の入力を取り消す。再ON・再読込で押下を復元しない。
- 描画ビューポート・仮想ボタンでブラウザーcontextmenuを抑制する。以前のサイト全体の抑制から `/draw/` の描画操作部分を限定し、ヘッダー等では標準メニューを使用できる。既存パレットの色編集用の抑制は維持する。

### 設定と移行

既存のON/OFF設定パネル内に「操作欄：左／右」と「操作設定を初期値に戻す」を追加した。横向き／デスクトップではキャンバスと操作ドックを交換する。縦画面はキャンバスが上のまま。左右配置は論理マウスボタン・ツール・色を入れ替えない。表示順に合わせてDOM順も変更し、Tab順が一致するようにした。横画面の左右safe areaを余白に反映する。

左右割当・編集先・配置は、検証付きの `pixieed:draw:input-settings:v1` とPXDの `editorState.draw.inputSettings` に保存する。旧PXDの `tool` と `selectedColor` / `selectedHex` は左へ移行し、右は既存パレットで有効な初期値を使う。旧フィールドも保存し、旧リーダーの読込を妨げない。色は保存時のHexが読み込んだパレットにあればその位置を使い、なければ有効なインデックス／初期値へ戻す。作品の画素・パレットへ設定用の色を勝手に追加しない。破損／アクセス不能の端末設定は初期値へフォールバックする。

初期値復元は左右の道具・色、L/R編集先、操作欄位置だけを対象とし、作品・ミラー・グリッド等を消さない。

### ローカル検証

- 左右操作検証は4画面・各6ケース・計24ケースPASS、pageerror 0。左赤直線／右青ペンの実マウスと仮想2指入力、仮想ON中の実マウスが、同じ始点・経路でRGBA全画素一致。左・右の幅も同じ。
- ネイティブ左右どちらを先に押した同時押しでも、後の側に切り替わらず単色で確定。仮想右を保持して左を追加・解放しても右の所有を保持する。描画中の割当変更はそのストロークへ混入しない。
- 右ドラッグ、右pointercancel／blur、仮想touchCancel、描画中のモード切替を確認。右の四角塗り・塗りつぶし・消しゴム・スポイト・範囲移動と原子的Undoを確認。スポイトは押した側だけの色・道具を更新する。
- 1280×800、390×844、320×568、844×390で左右配置、縦画面固定、DOM順、各配置の仮想ON/OFF矩形不変、横溢れなし、端末設定／PXD保存・再読込、初期値復元を確認。PXD再読込の前に端末設定を別の道具・色・配置へ変更し、PXD自身の保存値が復元されることも確認した。
- 固定UI回帰は1280×800/DPR 1・2、390×844/DPR 3、320×568/DPR 2、844×390/DPR 2の5条件、各14項目・計70項目PASS、pageerror 0。全32ミラー／仮想組合せ、グリッド、移動した中心、再生、保存を含む。右メニューを開く旧条件は右描画の条件へ更新した。
- Node 37件PASS（設定正常化・破損フォールバック・色並び替え、contextmenu作用範囲、対称描画・ツール・アニメーション）。高速描画の既存回帰は4画面・34項目PASS。ツール選択が再読込で保存される新仕様に合わせ、旧テストのペン初期化を明示した。構文・`git diff --check` PASS。

左右操作の結果と左右配置画像は `/tmp/pixieed-draw-buttons-20261006/`。固定UI回帰の結果・OFF／ON／押下画像は `/tmp/pixieed-draw-viewport-dual-20261006/`。実行：

```sh
node scripts/draw-button-bindings-browser-harness.mjs
node scripts/draw-viewport-browser-harness.mjs
PIXIEED_BROWSER_BASE_URL=http://127.0.0.1:4188 PIXIEED_FAST_STROKE_PHASE=final node scripts/draw-fast-stroke-browser-harness.mjs
```

実機Safari・iPhone・Android、WebKit、実際のノッチsafe area・モニター間DPI変更、本番は未検証。320pxの操作欄スクロールと、前節に記録した旧コマグリッド検証の同時常時表示条件の制限は継続する。元の再生不能症状は未再現であり、今回の回帰PASSをその症状の根本修正とは扱わない。push・deploy・公開なし。

今回の追加対象：`draw/index.html`、`css/draw-viewport.css`、`js/creation/draw-page.mjs`、`draw-entry.mjs`、`draw-virtual-cursor.mjs`、新規 `draw-input-settings.mjs`、`js/site-interactions.mjs` のDraw限定分岐、関連検証スクリプト・テスト。イベントデータ、可搬公開ツール等の無関係な既存変更は保持した。

## 追加確認：左右キャンセルと選択の角印（2026-10-06）

選択枠の四隅へ、9×9 CSS px・線幅2pxの黄色いL字と暗い縁を追加した。ズームやDPRが変わっても画面上の大きさを保ち、選択枠の角に追従する。小さな選択の絵を覆いにくいよう外側へ置く。範囲を判断するための表示のみで、リサイズ機能は追加していない。`aria-hidden`・`pointer-events: none` のDOMオーバーレイなので、従来の範囲移動の当たり判定を変えない。

`scripts/draw-selection-corners-browser-harness.mjs` で1280×800/DPR 1・390×844/DPR 3、各5ケース・計10ケースPASS、pageerror 0。明るい絵・暗い絵、225%ズームとパン追従、1画素選択、四隅の位置・実際の線幅・ポインター非干渉、範囲移動と1回のUndoを確認した。実際の「画像を保存」から取得した2048×2048 PNGを復号し、全画素が元の16×16作品の整数拡大と一致することを確認した。角印・選択枠はPNGに含まれない。確認画像・出力PNG・結果JSONは `/tmp/pixieed-draw-selection-corners-20261006/`。

左右キャンセルは `scripts/draw-button-cancellation-browser-harness.mjs` で390×844・1280×800、各12群・計24群PASS、pageerror 0。両画面ともネイティブは左右×ペン／直線×pointercancel／Escape／blurの12条件、仮想は左右×ペン／直線×touchCancel／Escape／blur／lostpointercaptureの16条件を確認した。それぞれストローク全体・図形プレビューが取り消され、押下表示が残らず、新しい操作で描けて1回のUndoで戻る。仮想タッチのキャプチャ喪失は実際のpointerIdでキャプチャを解放し、次の移動時にブラウザーが生成した新しいlostpointercapture通知を確認した。最終実行の左右・道具4通り×2画面すべてで `browserGeneratedEvent: true`。人工通知へのフォールバックは最終実行では使っていない。

先に押した側の所有、後の側だけを離しても継続すること、所有側の解放後にもう一方が引き継がないこと、左右の指／パッド指の解放と原子的Undo、外で停止して戻る際の基準取り直し、配置変更による取り消し、仮想ON/OFFによる確定・解放も確認した。外での通常解放は受け入れ済みの描画を確定するため、明示的キャンセルとは区別する。ネイティブのキャプチャ喪失は既存仕様どおり最後に受け入れたサンプルで確定して1回のUndo対象、仮想入力のキャプチャ喪失は取り消す。モードOFF後の古い指・ボタンの移動では描画が続かない。

最終のキャンセル結果・画面は `/tmp/pixieed-draw-button-cancel-20261006-verified/`。実行：

```sh
PIXIEED_DRAW_BUTTON_CANCEL_OUTPUT=/tmp/pixieed-draw-button-cancel-20261006-verified node scripts/draw-button-cancellation-browser-harness.mjs
node scripts/draw-selection-corners-browser-harness.mjs
```

関連Node 37件と構文・差分確認もPASS。実機Safari・iPhone・Android、WebKit、実際のsafe areaとモニター間DPI変更は未検証。前節の320px操作欄スクロール／旧コマグリッド検証の常時表示条件の制限は残る。元の再生不能症状は未再現であり、根本原因を修正したとは扱わない。今回もコミット・push・deploy・公開なし。

## 最新仕様：直接割り当て・キーボード・指操作（2026-10-06）

この節が現在の仕様で、前節のL/R編集先切替と常設の現在色ボタンを置き換える。実際に描画する左右の等幅クリック欄、左右独立の道具・色、固定36pxミラー欄、ON/OFFでも領域を残す配置、選択の角印は維持した。

- パレットの各色・道具は、タップ／左クリックで左へ、長押し（500ms）／右クリックで右へ割り当てる。触れた瞬間には左へ設定しない。長押し後の合成clickを消費し、左への二重割り当てを防ぐ。移動8px超、スクロール、別指、pointercancel／capture喪失、領域離脱、メニュー閉鎖、Escape／blurで未確定の長押しを中止する。通常の新しい操作は直ちに受け付ける。
- 個々の色・道具にフォーカスしてEnter／Spaceで左、Shift＋Enter／Shift＋Spaceで右へ設定できる。親の道具メニューを長押ししても未選択の道具を割り当てない。標準contextmenuを抑制する場所は、描画面・仮想左右ボタン・個々の割り当て対象だけ。
- パレット左の現在色変更ボタンを削除した。パレットは横幅を使い、色の編集は設定内の「ショートカット」→「現在の色を編集」から既存の色パネルを開く。色み・明るさ等は既存スライダーの矢印操作を使う。恒常表示の代替ボタンは増やしていない。
- 仮想カーソルを中央がホットスポットの＋型に変更。外枠20×20 CSS px、腕19px、白い線と暗い縁、押下中は黄色。OSのcrosshairは環境で異なるため、同一画像ではなく通常キャンバスのcrosshairに合わせた表現とする。DOMの受動オーバーレイで、拡大率によりサイズを変えず、作品の画素や画像出力には入らない。
- 仮想モードは1本指＝相対カーソル、未押下の2本指＝指間中心を基準とするパン・ピンチ拡大。2→1本指で残った指の基準を取り直し、カーソルを飛ばさない。左右描画ボタンの指は2本指判定へ数えず、押下中は描画を優先する。ビューポート外の取得サンプルは停止し、戻る際に基準を取り直す。capture喪失・キャンセル・blur・モード切替で指と押下状態を解放する。通常モードの既存2本指操作は同じ描画・表示処理を使う。

### キーボード操作の整理

`draw-shortcuts.mjs` の単一カタログを、表示・設定・dispatch・検証に使う。実行先は `draw-page.mjs` の既存UIや描画／アニメーションの共通処理で、別のキー用描画エンジンは持たない。操作一覧は設定から、またはキャンバス等の編集領域で `\`／`?` から開く。検索・実行・キー変更・解除・OS別初期化をTab／Enterで操作できる。閉じるとキャンバスへフォーカスを戻す。未設定のコマンドも一覧から実行できる。

| 操作範囲 | 到達方法 |
| --- | --- |
| 左右の全道具、左右の色 | 個々の対象のEnter／Shift＋Enter、または道具コマンド。色はパレットへフォーカスしてTabで選ぶ |
| ミラー4種・中心・グリッド・オニオン・仮想ON/OFF | 各コマンド。中心X/Yは対応スライダーへ移動して矢印 |
| Undo/Redo・消去・操作欄左右・初期化 | 各コマンド |
| 拡大・縮小・全体表示 | `+`／`−`／`0` または一覧 |
| カーソル／選択移動 | キャンバスで矢印、Shiftで5倍。仮想左右押下はEnter／Shift＋Enter |
| パン | キャンバスでSpaceを保持してマウスドラッグ／矢印。ズーム中の矢印でも移動 |
| コマ・レイヤー | 一覧から選択・複製／空白追加・削除・並べ替え・表示／ロック・再生。コマ一覧はTabと矢印、メニューはShift＋F10 |
| 表示時間・レイヤー名・キャンバス寸法・色設定 | 一覧から該当する既存入力へフォーカスし、通常の入力操作 |
| 保存・作品管理・画像読込・PNG/GIF/過程書出・前回作品 | 各コマンドで既存ファイル／作品UIへ。外部投稿は従来の投稿UIへ移るだけで自動投稿しない |

macOSの初期Undo/Redoは⌘Z／⌘⇧Z、WindowsはCtrl＋Z／Ctrl＋Y（Ctrl＋Shift＋Zも初期エイリアス）。両OSのプロフィールを `pixieed:draw:shortcuts:v1` に保存し、設定画面でOSを選んで編集できる。選択したOSだけを初期化する。破損・危険なキー・重複・初期エイリアスとの衝突は安全な初期値へ戻し、明示的な解除はnullとして保持する。初期エイリアスは対応コマンドのキーを変更／解除した時に止める。

ブラウザーの再読込・アドレス・タブ・コピー／貼付等やOS用の予約組合せを登録しない。input／textarea／select／contenteditable、IME変換中・keyCode 229、開いたダイアログ／設定／色／アニメーションパネルでは描画のグローバルキーを実行しない。Escapeは各開いたUIに任せ、通常画面では描画取消・選択解除。キー保持はkeyup、フォーカス移動、blur、パネル開閉、非表示、モード破棄で解放し、一覧の「実行」から押下コマンドを実行した場合は1回のクリックとして解放する。

### 最新の検証結果

- ショートカット：macOS Chromium、Windowsプロフィールのシミュレーション、390×844・320×568の4条件で35群PASS、pageerror 0。Undo/Redoと反対OSの修飾キー無反応、入力／contenteditable／IME229、ポップアップ抑制とフォーカス復帰、検索実行、競合・予約キー・再読込・OS別保存／初期化・破損復帰、左右の道具・設定・色／寸法入力・空白コマ／レイヤー／表示時間・作品保存UI、仮想左右キー保持と矢印、keyup／blur／ダイアログでの解放、Spaceパンと修飾キー変更を確認した。実行したMacのブラウザー環境と、navigator／userAgentDataを上書きしたWindowsプロフィール検証は区別する。Windows実機でのOSキー挙動は未検証。
- 直接割り当て：390×844はタッチ・マウス8群、1280×800はマウス6群、計14群PASS。長押し後の合成click、スクロール・移動・別指・取消・leave・閉メニュー、次の正常な操作、Shift＋Enter、対象外contextmenuを含む。
- 固定レイアウト：5画面／DPR条件・70項目PASS。ミラー4種と仮想モードの全32組合せで主要bounding rect不変。320px／横向きの描画領域と操作欄スクロールを確認。色ボタンを除いたパレット・ペン・設定・Undoへの到達性を検証した。
- 選択角印：2画面・14項目PASS。実際のPNG取得・全RGBA比較と、キーボードの範囲移動／OS別Undoも再確認。高速描画は4画面・34項目PASS。関連Nodeは46件PASS、構文と差分確認もPASS。

確定済みの結果・画像：`/tmp/pixieed-draw-shortcuts-20261006/`、`/tmp/pixieed-draw-assignment-input-20261006-final2/`、`/tmp/pixieed-draw-viewport-final-20261006/`、`/tmp/pixieed-draw-selection-corners-20261006/`、`/tmp/pixieed-draw-fast-stroke-20261004/final/`。Nodeログ：`/tmp/pixieed-draw-node-final-20261006.log`。

- 指ジェスチャー：1280×800、390×844、320×568、844×390の4画面・各12群・計48群PASS、pageerror 0。通常モードのピンチ、1本指相対移動、100%でのパンの境界、2本指パン／ピンチと実pointerIdでの2→1遷移、外で停止／戻りの基準取り直し、pointercancel／lostpointercaptureによる全指と兄弟captureの解放、古い移動通知の無効化、blur／OFF→ON、左右の描画優先、右の実マウス、20px外枠／19px腕のサイズ不変を確認。仮想ONで実際に書き出した2048×2048 PNGも全RGBAが作品の整数拡大と一致し、＋型を含まない。結果・PNG・画像は `/tmp/pixieed-draw-virtual-gestures-20261006/`。
- 左右描画：4画面・24群PASS。クリック用／パッド用のどちらの指離れでも確定・押下解放、独立した左右の道具と色、右スポイトが右だけを更新、native／virtual画素一致、所有・保存・配置を再確認。結果は `/tmp/pixieed-draw-buttons-20261006/`。
- キャンセル最終実行：390×844、1280×800・24群PASS、pageerror 0。指を実際に離すCDP操作と、ビューポート内に収まる相対移動の基準を使い、ネイティブ左右／仮想左右のペン・直線、キャンセル・capture喪失・再操作を確認。結果は `/tmp/pixieed-draw-button-cancel-20261006-final3/`。古い失敗ログは未定義変数の修正前や、指離れ・画面外の移動を誤って送ったテスト条件なので最終結果に含めない。

今回追加のスクリプトは `draw-assignment-input-browser-harness.mjs`、`draw-shortcuts-browser-harness.mjs`、`draw-virtual-gestures-browser-harness.mjs`。viewportハーネスの空のtouchEnd指定は、現在追跡中の指すべてを明示して離すテスト用cleanupと定義した。非空の指定はその指だけを離す。CDPへ単に空配列を送って指離れを確認したことにはしない。

実機Safari／iPhone／Android、実WindowsのキーボードとOS予約キー、WebKit、物理タッチの感触、実モニター間DPIとsafe area、本番／投稿／公開は未検証。320pxの操作欄は必要に応じてスクロールする。既存の旧コマグリッドハーネスの同時常時表示条件の制限は引き続き前節を参照。元の再生不能症状は今回も未再現で、回帰の再生確認をその根本修正とは扱わない。既存変更を保持し、コミット・push・deploy・公開はしていない。

＋カーソルの明暗確認は1280×800と390×844で、キャンバス全体を暗色／明色で埋めた4画像を追加して目視確認した。白い腕と暗い縁が両方の背景で見える。画像・20×20pxの矩形記録は `/tmp/pixieed-draw-crosshair-visual-20261006/`。320px操作一覧の画像は `/tmp/pixieed-draw-shortcuts-20261006/small-mobile-mac.png`。物理OSカーソルとの画像完全一致は検証していない。

既存 `draw-cel-grid-browser-harness.mjs` も最新UIに更新して全4画面PASS（1280×720、390×844、320×568、844×390）。削除済み現在色ボタンの常時表示条件を除き、実際のパレットとペンが操作欄のスクロールで到達でき、描画矩形を動かさないことを確認する。セル内容印、原子的なコマ／レイヤー選択、Undo/Redo、44pxセル、2桁番号、ポータル内のキー処理もPASS。前節の旧ハーネス条件に関する未PASS記録は、現在の実装不具合ではなく旧検証条件の履歴であり、この最終実行で更新済み。ログは `/tmp/pixieed-draw-cel-grid-final-20261006.log`。

2本指のcapture喪失検証では、実際にcaptureフラグを解放してからDOM通知を明示するケースも含む。ブラウザーが通知を自動生成したケースと人工通知を混同しない。別の左右キャンセルハーネスの最終実行では、実際のタッチcaptureを解放して次の移動時に生成された通知を記録している。いずれも実機での指の挙動を検証したという意味ではない。


## 追加：パネル閉鎖・配置1アイコン・原寸キャンバス変更（2026-10-06）

対象は `/draw/` の「かんたんドット」。既存の固定レイアウト・左右の道具／色・仮想入力・ショートカットを保持した。ローカルのみで、操作中のChromeタブは再読み込みしていない。commit／push／deploy／公開なし。地図・イベント・ポータブル公開などの別作業の変更には手を加えていない。

### 再現と修正

320×568、390×844、1280pxで、仮想カーソルON時に描画エリアの外側クリックで設定パネルが閉じないことを再現した。設定summary自体の開閉は動いた。仮想入力のboard captureハンドラーが `stopImmediatePropagation` を実行し、documentのバブル段階にある既存の外側閉鎖処理へ届かないのが原因。ボタン追加だけではなく、Draw専用 `draw-panel-dismissals.mjs` のdocument capture処理を各パネルの外側処理・board入力より先に登録した。

パネルを閉じるための描画面接触はそこで消費し、描画には使わない。パネルの実操作に入ると進行中の入力をキャンセル・押下解放し、以前の指の移動／解放は既存のpointerId隔離で無害化する。仮想OFFは既存の「受け入れ済み画素を確定して解放」の経路を維持する。作品ダイアログを閉じる際に内側のdetailsも閉じ、見えない小メニューがショートカットを抑制しないようにした。Escapeは最前面の子モーダルを優先し、その後は内側の開いたパネルから閉じ、summaryまたは起点へフォーカスを戻す。

棚卸し：

| パネル | 閉じるUI |
| --- | --- |
| 描き方・表示（ON/OFF）／道具／キャンバス設定 | スクロールしても上部に残る44×44pxの×、aria-label/titleあり |
| ファイル | 上部の×へ統一。以前summaryを固定位置の×として表示していたCSSはDrawだけで解除し、重複を避けた |
| 色調整 | 既存「完了」ボタンを上部の×として再利用。色変更の確定経路は同じ |
| レイヤー・フレーム一覧／レイヤー／表示時間 | 既存の閉じるボタンを維持し、必要なフォーカス復帰を整合 |
| コマ／レイヤーの操作メニュー | Drawだけで上部×を追加。Escでメニューを閉じて一覧に戻る |
| 作品一覧 | 既存のstickyヘッダー×を維持 |
| 作品一覧内「その他」「取り込む」「削除した作品」 | 内側を閉じる上部×を追加。Escもまず内側を閉じる |
| 作品の削除確認／カード操作／変換確認／ショートカット一覧 | 既存×／キャンセル／やめるを再利用、重複追加なし |
| 画像・動画の出力結果 | 既存「描画に戻る」を維持 |

横向きでsticky見出ししか見えなくなるケースは、設定／道具の配置をヘッダー・作品ボタン・下部ナビの間に収めるフォールバックで解消。キャンバス設定の位置計算にも作品ボタンの領域を反映した。

操作欄の位置は `#draw-controls-side-toggle` のアイコン1個で左右を反転する。絵は現在の操作欄の側を示し、aria-label/titleは現在位置と次の操作を伝える。aria-pressed=trueは左配置。既存 `controlsSide` の永続化と `controls.left/right` コマンドが同じ関数を使い、左右の道具／色の割り当ては交換しない。

### 原寸を保つサイズ変更

サイズ変更は `resizeAnimation(..., { anchor: 'center' })` に変更。全フレーム・全レイヤー（非表示／ロック済みを含む）の画素と透明セルを1:1で移し、増えた領域は透明にする。中央基準は親から示された暫定既定であり、ユーザーが位置を明示指定したことにはしない。共有APIの既存top-leftやnearestの既定・他ツールの呼び出しは保持した。絵のリサンプル用の新しいUIは追加していない。

移動量は各軸 `floor(newSize / 2) - floor(oldSize / 2)`。16→17は右／下へ1pxの余白、17→18は左／上へ1pxの余白となり、差分を合計しても往復でずれない。範囲外を切る縮小は設定内の説明に明示し、1回のUndoで全セルごと戻る。Redoも可能。選択矩形を平行移動・クリップし、ミラー中心と仮想カーソルの画素座標も同じ整数差分で追従する。新サイズは全体表示（100%）に戻し、サイズUndoでは以前の選択・ミラー・ビュー／カーソル状態を復帰する。保存されるミラー／ビュー／フレーム／レイヤー状態と保存再読み込みも確認した。

キャンバス設定の遅延toggle通知で、開いた直後に入力した幅／高さを現在値へ戻してしまう競合も解消。表示時の入力初期化はsummaryのclick処理で先に行い、遅延toggleは編集中の入力値を上書きしない。

### 検証と確認方法

- パネル：`draw-panel-dismissals-browser-harness.mjs`、320×568・390×844・1280×800・844×390、各24群・計96群PASS、pageerror 0。仮想ON/OFF×左右配置、全対象のスクロール・ネイティブタッチの×・再開・Esc／フォーカス・モード切替・描画非干渉、実際の複数指UI接触でのキャンセルと古い指の無害化を確認。実タッチ保持中のOFFは、モバイルでは設定がクリック欄を覆うため同じトグルのDOM activationで実行し、確定・解放・1回のUndoを確認した（隠れた座標への実クリックとは扱わない）。子モーダルのEsc優先、作品を閉じた後の再描画／キー操作も確認。`/tmp/pixieed-draw-panel-dismissals-20261006-final/results.json`。
- 原寸変更：`draw-canvas-resize-browser-harness.mjs`、1280×800・390×844・320×568、各8群・計24群PASS、pageerror 0。17×15の2フレーム×2レイヤーのPXDを実際に読み込み、画面のサイズ設定から変更し、保存PXDの各celの全画素を照合。余白、縮小、Undo/Redo、奇数サイズ往復、選択・ミラー・カーソル、保存再読み込みを確認。`/tmp/pixieed-draw-canvas-resize-20261006/results.json`。
- 固定レイアウト：5画面／DPR、70項目PASS。ミラー4種×仮想ON/OFFの32組合せでbounding rect不変。再生検証は今回の原寸配置に応じた画素座標へ更新。`/tmp/pixieed-draw-viewport-panels-final-20261006/results.json`。
- 主要回帰：ショートカット35群、仮想ジェスチャー48群、割り当て14群、左右描画24群、キャンセル24群、選択角印14項目、コマグリッド4画面、高速描画4画面PASS。関連Node88件PASS（原寸変更の5件を含む）。構文・差分確認もPASS。
- 原寸変更の確認画像：`/tmp/pixieed-draw-canvas-resize-20261006/320x568-canvas-settings.png` ほか各画面。パネル画像・結果は `/tmp/pixieed-draw-panel-dismissals-20261006-final/`。

検証は独立したChromiumコンテキストと保存領域を使い、ユーザーの作品を実際にリサイズしていない。削除確認もキャンセルだけで、ユーザー作品は削除していない。空の削除済み作品detailsは表示fixture、変換確認もfixtureとして区別する。実機Safari／iPhone／Android／Windows、物理タッチの感触、safe area、本番／公開は未検証。元の再生不能症状は今回も未再現で、回帰の再生PASSを根本修正とは扱わない。

最新版は `http://127.0.0.1:4188/draw/`。操作中のタブへ自動で新コードは適用されない。ユーザー自身が「作品を管理」→「今の作品」→「その他」→「保存し直す」を完了し、それから再読み込みする。保存に成功するまでは再読み込みしない。サーバーは127.0.0.1のみで稼働を維持している。

## 2026-10-06：選択のコピー・カット・貼付・拡縮・90度回転・反転

### 参照と採用理由

Gitの読取で、公開ページ削除直前の `be270d18a5be8af43342636dcbf4416c141a36cc` にある `pixiedraw2/src/draw2-selection.ts`、`draw2-selection-edit.ts`、`draw2/draw-120/selection-transform.ts`、`draw2-entry.ts` を確認した。透明を貼付先へ書かない、矩形内部の透明穴からも移動できる、プレビューと確定を分ける、90度回転・左右上下反転へ直接アクセスする方向を採用した。旧ツールの復活や一括移植は行っていない。旧ファイルに残る作業指示は許可として扱っていない。

[Asepriteのclipboard API](https://www.aseprite.org/api/app_clipboard) は画像・選択・元パレットを保持する。[透明色の仕様](https://www.aseprite.org/docs/transparent-color/) は透明indexが常に0であると仮定できない。PiXiEEDでは実コードの不変条件に合わせる。[Pixeloramaの選択処理](https://raw.githubusercontent.com/Orama-Interactive/Pixelorama/master/src/UI/Canvas/Selection.gd) の独立した画像・選択とプレビュー／確定も比較した。[RGB→indexed処理](https://raw.githubusercontent.com/Orama-Interactive/Pixelorama/master/src/Classes/ImageExtended.gd) の最近色への近似は今回採用せず、完全一致で色を保持する。

### データ契約 v1

画面の編集documentは通常のArrayで `-1=透明、0..N-1=palette[index]`。アニメーション保存のUint8Arrayは `0=透明、1..N=palette[index-1]`。パレットUI先頭の透明ボタンは `data-color-index=-1` の別枠であり、palette[0]は不透明色。この既存形式を変更していない。

内部clipboardは `format: PiXiEED_DRAW_SELECTION`、`version: 1`、1〜256pxのwidth/height、origin、row-major Uint8Array indices、コピー時点のRGB色値のpalette。indicesの0は透明穴、1..Nはclipboard自身のpalette[index-1]。矩形内の穴と相対配置を保持する。不透明なpalette[0]はclipboardの正の番号へ変換し、-1をUint8Arrayへ直接格納しない。

clipboard所有バッファをcloneして保持し、readもcloneを返す。元document・元palette・呼出側bufferへの参照を保持しない。変形もclipboardからさらに独立した原本を保持する。元palette編集・Undo・作品切替・読出した配列の変更でコピーした色は変わらない。clipboardは同じタブ内の作品切替で維持し、再読込では消える。PXD・localStorage・システムclipboardには保存しない。

任意のmaskをv1で扱える契約も定義した。maskは同じ寸法のUint8Arrayで `0=未選択、1=選択`。透明と選択所属を別に表すためのもので、今回の矩形UIはmaskを必要としない。未知version、寸法、長さ、palette色／alpha、色番号、mask長さ／値、originを検証し、不正な値をbyte化する前に拒否する。

| 原本の画素表現 | 256×256の画素buffer | 今回の判断 |
| --- | ---: | --- |
| Uint8番号＋独立palette、0を透明予約 | 64KiB＋小さいpalette | 現行のbinary alpha・32枠に適合。透明maskを別配列に重複保持しない |
| Int16番号 | 128KiB＋palette | 負数／256以上の色には拡張余地があるが、今回不要 |
| RGBA snapshot | 256KiB | 半透明・外部画像のadapter向き。今回の編集原本としては不要 |

一般に0を透明予約するUint8番号は不透明255色まで。256不透明色が必要になればUint16、または独立mask＋0..255番号などへ明示的に版を拡張する。現在のアニメーションは不透明palette32枠までで、使用色の編集上限は透明も含め作品全frame/layerで32色。半透明を持つ旧原本は既存の読取専用保護を維持し、暗黙に不透明化しない。

### 貼付・移動・履歴

- 貼付先の番号は作品IDや番号一致だけで流用しない。正規化した色値が完全一致するslotを使い、不足する色だけ追加する。既存paletteの並替え、使用中／未使用slotの勝手な書換え、暗黙の減色は行わない。
- 変形とcanvas外のcropを計算した後、canvas内に実際に書く不透明色だけを計画する。palette32枠と、他の全frame/layerを含む透明込みの使用色数を両方検査する。超過は未確定のまま拒否し、元pixels/paletteと保存データを変えない。
- `visitOpaqueDrawSelection` を移動・削除・貼付で共用する。透明は貼付先を消さない。移動・変形は原本の不透明footprintだけを消して、その上に変形後の不透明画素を置く。重なりは開始時のsnapshotから計算し、読出し順による破壊を防ぐ。全透明Copy/Cutは絵・履歴・既存clipboardを変えない。
- プレビューはstaging documentとして描画する。実document、animation、保存／自動保存、PNG/GIF、timelapseの原本へ混入しない。更新はrequestAnimationFrame単位にまとめ、画素ごとのtuple一覧や全timelineの複製を作らない。
- 確定前にアニメーションのpalette・画素・tile予算まで準備／検証する。確定はpixels＋paletteを同じ1履歴に記録し、Undo/Redoの選択枠も対応するanimation snapshotへ記録する。
- Cutは即削除で1履歴。後のPaste確定は別の1履歴。PasteのEsc／取消／×はCutを戻さない。「戻す」でCutを復元する。パネルの説明とCut時の案内にも明記した。
- 移動／拡縮／回転／反転を同じ浮動sessionで調整し、確定1回で1Undo。未確定Undoはまずプレビューを取消し、直前の確定操作はまだ戻さない。全体が外、または拡縮で全不透明画素が消えた確定は拒否する。部分的には外側を切り取り、Undoで復元できる。

### 操作と終了条件

範囲選択はVまたは道具メニュー。内側をドラッグして移動し、9pxの四隅L印の周辺を拡縮に使う。28px相当の判定は画面上の寸法で計算し、実マウス・指・仮想cursorの同じ論理座標で使う。小さい選択の中央は移動用に残し、数値の幅・高さでも操作できる。L印の描画自体はpointer-events:noneのままで、外側の判定もviewport内だけに限定した。

道具欄の「選択の操作」ボタンでCopy/Cut/Paste、幅・高さ、縦横比固定、左右90度回転、左右／上下反転、確定／取消を開く。小画面は画面下へ寄せたscroll sheetにし、描画viewport上半分を残す。×は上部、確定／取消は下部の固定欄へ置く。パネル表示によるcanvas／周囲UIのbounding rect変化はない。320px・390px・desktop・横向きで実操作を確認する。

拡縮は最近傍で毎回session開始時の原画像から再生成する。整数の丸めを含め縦横比固定を既定にし、自由比率はcheckboxで明示する。90度回転と反転は正確なindex置換。回転の整数中心はfloor(width/2), floor(height/2)で固定し、奇数・偶数の4回転往復で位置がずれない。任意角の回転は今回追加しない。確定後に新しく縮小した絵から再拡大すると失った画素は復元できないため、確定前の調整かUndoを使う。

確定はパネルまたはcanvasにフォーカスしたEnter。仮想modeでも未確定時のEnterは確定を優先し、通常時のEnter／Shift+Enterの左右保持は維持する。Cmd/Ctrl+C/X/Vは当該選択commandにだけ許可し、canvas編集領域に限る。入力欄・contenteditable・IME・dialog等の標準操作を奪わず、内部bufferがないPasteは無効。左右の道具／色の割当は独立したまま。

pointercancelはそのgesture開始時の変形へ戻し押下を解放する。Esc・取消・×・未確定Undo・blur／pagehide・別パネル／別道具／作品／frame／layer切替は未確定sessionを取り消す。clipboardは別状態なので保持する。viewportへ戻る接触はシートを隠して調整を続けられる。仮想ON/OFFは入力方式の変更として押下を解放し、浮動変形の自動確定はしない。ロックlayerは範囲選択とCopyだけ許可し、Cut/Paste/変形は無効。対象は現在のframeの現在のlayerのみ。

### ファイルと検証

追加：`draw-selection-operations.mjs`、`draw-selection-session.mjs`、`draw-selection-panel.mjs`、選択単体テスト、`draw-selection-transform-browser-harness.mjs`。統合：`draw-page.mjs`、`draw-animation-session.mjs`、`draw-shortcuts.mjs`、`draw-tool-operations.mjs`、`draw-viewport.css`。entry/HTMLのrevisionは `20261006-draw-selection-1`。既存PXD schema／codecと以前の変更を維持。関連する旧テストは透明保護、明示確定と次フレームのpreviewを待つ仕様に合わせた。

Nodeのcreation-suite全660件PASS。unknown version／色番号wrap／alpha／mask、opaque slot0、穴と重なり、コピー原本／読出しbufferの独立、palette編集・並替え・同色別slot、別palette、容量／使用色のatomic拒否、crop、nearest復帰、奇偶サイズ4回転／反転2回、Cut/Paste履歴、prepared commit、全celのpalette Undo/RedoとPXD roundtripを含む。ログ：`/tmp/pixieed-selection-all-node-final.log`。

新機能ブラウザーは320×568 macOS、390×844 Windows profile、1280×800 macOS、844×390 Windows profileの4条件×17群＝68群PASS、pageerror 0。実UI・実マウス、コピー後の色編集、作品間貼付、他frameを含む使用色とpalette容量の2種の上限、preview中のPXD保存、確定／Undo、Cut/Paste取消、ロック、全透明、外側、blur／frame変更、保存再読込、native 2pointerの仮想左右／pointercancelを検証。小画面の描画上半分と、固定の確定／取消の配置も確認した。Windows profileはnavigatorとuserAgentDataのシミュレーションでありWindows実機ではない。結果と画像：`/tmp/pixieed-draw-selection-transform-20261006/`。確認画像は各サイズの `*-selection-panel.png` と `*-move-preview.png`。

既存回帰の最終実行ログは `/tmp/pixieed-selection-final-draw-*.log`。固定layout70項目、パネル閉鎖96群、キー35群、仮想gesture48群、割当14群、左右24群、キャンセル24群、角印14群、原寸canvas変更24群、celグリッド4画面、速いstroke4画面すべてPASS。viewport結果は `/tmp/pixieed-draw-viewport-selection-final-20261006/results.json`、パネル結果は `/tmp/pixieed-draw-panels-selection-final-20261006/results.json`。

実機Safari／iPhone／Android／Windows、物理タッチの使い心地、safe area、本番は未検証。任意角回転・外部clipboard・非矩形選択・複数cel同時変形は対象外。元の再生不能症状は今回も未再現であり、再生回帰PASSをその根本修正とは扱わない。commit／push／deploy／公開、作業中Chromeタブの再読込はしていない。


## 2026-10-06：選択の直接拡縮・自由回転・移動できる回転中心

前節の「90度のみ」という制限を、この追加依頼に合わせて自由角まで拡張した。既存のclipboard契約、透明skip、元snapshotからのプレビュー、明示確定／取消、pixels＋paletteのatomic Undoを保持する。

### 操作と目印

四隅の12pxつまみをドラッグして拡縮する。二重リング20pxと中心点は回転中心であり、つまんで移動しても絵や枠は動かない。枠外の22pxの↻ハンドルを中心の周囲へドラッグして自由回転する。マウス24px径・タッチ44px径の論理判定を画面寸法で行い、目印はzoomやDPIで論理表示サイズが変わらない。明暗両方に見える縁を持ち、hover／drag中を強調する。全てDOM/CSSでありpixel surfaceや書出しに描かない。

回転ハンドルは上辺を優先し、viewportに収まらなければ他辺へ配置する。全面選択など枠外にスペースがない場合はviewport内へ寄せる。四隅・中心・回転が重なる小さい選択では最も近い中心を優先し、同距離は四隅を優先する。内側は移動、Alt＋内側ドラッグは目印の判定を避けて移動する。補助パネルに幅・高さ、角度、回転中心X/Y、枠位置X/Yを用意し、狭い選択や画面外の中心にも代替操作を残す。重複する操作ボタンは追加していない。

回転は90度付近±3度だけ自動吸着する。Shiftは90度刻み、Altは吸着を解除する（内側の移動代替と回転ハンドルを区別する）。90度ボタンも残す。自由角はnearest-neighborで画素の形が変わる場合がある。確定前に角度／寸法を戻せば原本に復帰できるが、自由角を確定した後の逆回転は再サンプルとなるため完全復元にはUndoを使う。

### 座標とpivotの規約

追加した `draw-selection-geometry.mjs` はDOMに依存しない。frameのx/yは回転した枠の元左上頂点を表すcanvas座標、width/heightは枠の局所軸での整数寸法、angleは時計回りの度数、pivotはcanvas座標の独立した点。初期pivotは矩形の幾何中心なので奇数／偶数が混在する寸法では小数を保持する。確定後の選択はcanvas内へ切り取った整数AABBで、pivotはcanvas位置を引き継ぐ。pivot変更だけの確定は画素のUndoを増やさない。

画素写像はorigin＋rotation＋scale＋flipで表し、pivotをoriginから独立させる。pivot移動時は写像を変えず、次の回転だけが新しいpivotを使う。回転はpivot相対の基準offsetを保持し、角度ごとにそこから計算するため、中間の回転位置を繰り返し丸めない。4回90度や自由角の往復で積算ずれを防ぐ。90度は三角関数を使わず0／±1の軸を使い、画素の正確な添字置換を維持する。任意小数pivotで回転した配置は、描画時に整数の画素格子へ最近傍で写す。

回転後の拡縮はpointer移動を枠の局所軸へ戻して計算し、対角のworld頂点を固定する。比率固定は元画像の比率を使い、連続量で軸を決めた後に整数化する。小さい絵の整数寸法では比率は近似になる。pivotは枠内の相対位置を保って拡縮し、枠の移動では同じdeltaで移動する。左右／上下反転は局所軸の反転で、枠とworld pivotを変えない。

`rasterDrawSelection` は変形後AABBの出力画素中心を逆変換し、immutableなclipboard原本から一度だけ最近傍sampleする。縮小→拡大や回転→拡縮→反転でも、中間画像を新たな原本にしない。透明／maskを適用してからcanvas内の不透明画素だけに色を割り当てる。全体がcanvas外、または不透明画素が全て消える確定は拒否する。部分的には外側を切り取り、その旨を表示する。パレット／他celを含む使用色制限は確定前に検査する。

### 入力終了と仮想操作

マウス・実タッチ・仮想左右は同じcanvas座標とハンドル判定を使う。実pointercancel／capturelostはgesture開始時のcheckpointへ戻して終了し、遅れて届くupで再適用しない。Esc／blur／別パネル／frame／layer／作品変更は浮動sessionを取消す。2指pan/pinchへの切替時は進行中のハンドル操作を止め、viewだけを動かす。

仮想左右はbuttonとpadのpointerIdを分けた既存仕様を維持する。選択中はviewport内のcanvas外へもhotspotを動かせ、枠外の回転ハンドルへ届く。padの作用範囲はviewport内のまま。保持しているクリックがある間、別pad指は変形操作となり、2指view gestureへ切り替えない。仮想イベントにもShift／Altの状態を渡す。通常描画のcursor領域は既存のcanvas範囲を維持する。

### 変更と検証

追加：`draw-selection-geometry.mjs`、`draw-selection-overlay.mjs`、幾何テスト、`draw-selection-handles-browser-harness.mjs`。選択session／operations／panel、draw-page、仮想cursor、CSSを局所変更。既存テストは旧L印から12pxつまみの表示、中心がpivotになった小選択のAlt移動代替へ合わせた。HTML／entry revisionは `20261006-draw-selection-handles-1`。

Node creation-suite 670件PASS。追加10件はpivot不変、自由角往復、任意小数pivotの4回90度、混在奇偶寸法の正確な90度並び、全4角×4角度の対角固定／pivot相対位置、丸め順序、flip、hit優先順位、snap、透明skip／clipping／palette拒否を含む。ログ `/tmp/pixieed-draw-handles-all-node-final.log`。

直接操作ブラウザー57群PASS：320×568 DPR2、390×844 DPR3、1280×800 DPR1/2、844×390 DPR2。実mouse左右、native CDP touchの44px判定・回転・pivot・cancel、実captureloss、2指pan/pinch、zoom/pan後の全目印位置、仮想左右＋別pad指、canvas外ハンドルへの到達、partial clipping／全体外側拒否、blur、1px選択、数値代替、周囲bounding rect不変、未確定時の実PNG書出しに目印／previewが混じらないことを確認。結果と画像 `/tmp/pixieed-draw-selection-handles-20261006/`。

既存回帰の記録は `/tmp/pixieed-draw-handles-regressions-20261006/`。既存選択68群、角印／PNG14群、layout70項目、パネル96群、キー35群、仮想gesture48群、割当14群、左右24群、cancel24群、canvas変更24群をPASS確認。celグリッドと速いstrokeのharnessは既定ポート4176への接続失敗があったため、実サーバー4188を明示して再確認し、両方とも4画面PASS（速いstrokeはbaseline 5項目、症状未再現）。これは試験起動設定で、Draw画面でのJS例外ではない。

実機Safari／iPhone／Android／Windows、物理タッチの使い心地、本番は未検証。元の再生不能症状は未再現であり、今回の修正済みとは扱わない。ユーザーの既存Chromeタブは再読込していない。commit／push／deploy／公開なし。
