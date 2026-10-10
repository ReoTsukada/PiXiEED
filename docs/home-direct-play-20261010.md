# ホーム直接描画・カード整理の実装検証

2026-10-10。開始時のHEADは `281b2dbb96d102ebaa20febf657a66edb819a324`、作業ツリーはclean。依頼記載の `2f79456…` より新しい現況を基準に、ホームだけを修正。commit / push / 公開は行っていない。

## 原因の確認範囲

修正前のローカルChromeでは通常設定の自動アニメーションは動いていた。「動かない」の利用者環境そのものは再現できていない。既存のreduced-motion設定では自動物理運動を抑制し、以前の停止状態も保存・復元するため、停止に見える条件は存在する。これらの利用者設定は尊重した。

旧 `canDraw` はマウスを常に許可する一方、touchは「描く」を選ばないとドラッグ描画も空白への点描も許可しなかった。PCでは描くボタンが入力可否を変えず、スマホでは選択前にcanvasの `touch-action: pan-y` がスクロールを優先していた。旧音声は `soundOn=false` で始まり、「聴く」を別に押す必要があった。

## 実装

- canvasに最初から直接描画。描くモードを撤去し、描画領域だけ `touch-action:none`。その他の領域・カードは通常スクロールできる。
- 最初の信頼されたcanvas入力（タップ・ドラッグ、Space/Enter）で音声を起動。初期ロードでは音声コンテキストを生成しない。停止操作は起動しない。音声開始失敗でも描画を継続する。
- 動き停止・演奏停止/再開・収納された色と編集に操作を整理。Undo、作品のセッション保持、確認付き消去、キーボード、44px以上のボタンを維持。
- 演奏停止はセッション内でリロード後も保持。停止後の描画で再開しない。画面外・非表示・pagehideで即ミュートとsuspend。復帰だけでは再開せず、次の描画入力または明示再開が必要。
- 実際のAudioContext状態に合わせて「演奏中 / 演奏待機 / 演奏停止 / 音を開始できません」を表示。出力ゲイン0.55で既存の控えめな発音を減衰し、終了ノードを解放。
- 主要4カードは PiXiEEDraw → 写真ドット変換 → ドットで音楽 → 画像・音楽の合成変換。続いて3パズル、世界地図・イベント・店舗。作品例、静的見出し、短文、通常のaリンクを用意。リンク上のプレビューを操作モードにせず、直接遷移する。
- canonical / title / description / OG整合を維持。世界地図の重複セクションを削減。既存URL、86イベント記事、PiXiEEDraw名称を維持し、望遠鏡・非公開Amazon導線は追加していない。Offerwall、出力機能、GA4設定の変更なし。
- ビルドは未追跡ファイルを原則除外するため、新規 `js/home-audio.mjs` を既存の明示許可一覧へ追加。任意の未追跡ファイルを公開しないテストも維持。

## 実ブラウザー確認

Chromeの実入力と現在のHTML・JSを読み込む `tests/home/home-review.browser.html` を使用。描画ピクセル、フレーム、AudioContext、発音ソース、出力につないだAnalyserのRMSを記録した。fixtureは本番ビルドに含まれない。

| 確認 | 根拠・結果 |
| --- | --- |
| 初期表示の動き | 操作前に657フレーム、描画内容の変化656回。AudioContext生成0、発音0。 |
| 初回の直接描画と音声 | 赤いセル90→178、AudioContext running、resume 1回、発音7、出力RMS最大0.02045。通常ページでもドラッグした赤い絵を目視確認。 |
| 演奏停止後の描画 | Context suspended。描いてもresume数1・発音数45から増えず、描画は増えた。初回入力前の停止でもContext生成0のまま描けた。 |
| 動き停止・再開 | 停止中は描画内容の変化数1222とchecksumが同じ。再開後は変化数1239へ増加。 |
| 明示演奏再開 | running、resume数2へ増加し発音。停止状態はリロード後も維持。 |
| 非表示・復帰 | visibilitychangeをfixtureで再現。非表示中はフレーム/内容変化停止、音声suspended。復帰でresume・発音が増えず待機。新しい描画でのみ再開。 |
| pagehide・pageshow | persistedイベントをfixtureで再現。pagehide中はフレーム停止・suspend。pageshowで動きは戻るが音声は待機。実際のBFCache遷移は未確認。 |
| 画面外・スクロール | 通常スクロールでheroを画面外へ移動。2回の取得で2090フレーム/内容変化2088/同checksumが一致。戻っても音声はsuspended・resume1・発音119のまま。Observerがない場合もscroll/resize補助経路を確認。 |
| reduced-motion | 初期の自動変化0、操作後は赤セル172・変化5。ドラッグとSpace/矢印キーで描画可能。音声RMS0.00979。自動落下は抑制。 |
| touch分岐 | ネイティブ入力のpointerTypeをfixtureでtouchに置換。モード選択なしで赤セル180、running、音声RMS0.0183。物理スマホ検証ではない。 |
| 音声失敗 | AudioContext生成をfixtureで失敗させても赤セル171、動き継続、適切な失敗表示、未処理errorなし。 |
| 広告スクリプトなし | fixtureで広告関連scriptを除去。描画・音声停止・明示再開を確認。実際の広告遮断拡張機能は未使用。 |
| 編集 | パレット初期収納、消去ダイアログ、取消で作品維持、確認付き消去後にUndoで復元することを実画面で確認。 |
| console | 通常ページの最終error/warn一覧は空。fixtureにも未処理errorなし。 |

音声の非ゼロ信号は確認したが、スピーカーを通じた実聴、実機iPhone/Android・Safari、実OSによるタブ背景化は未確認。ブラウザー音声自動再生制約のため、ロード直後の有音を保証する設計ではない。

## 初画面

| viewport | 描画領域の高さ | 最初のカード上端 | 横はみ出し |
| --- | --- | --- | --- |
| 1280×800 | 304px（旧400px） | 約713px（旧約820px） | なし |
| 390×844 | 240px（旧約405px） | 約632px | なし |
| 320×740 | 222px | 約615px（最終ボタン調整前） | なし |

390px幅では最初のPiXiEEDrawカード全体と次カード上端が見える。PCでは主要カード列上部が初画面に入り、既存の固定ナビゲーションが下端に重なる。320px幅の停止ボタンは76×44pxへ調整し、文字の折返しを解消。

## テスト・ビルド

- `node --test tests/**/*.test.mjs`: **1811 / 1811 pass**（約32秒）。ログ `/tmp/pixieed-home-review-20261010/all-tests-final.log`。
- 最終配置調整後の関連home / ads / pages-buildテスト: **78 / 78 pass**。ログ `/tmp/pixieed-home-review-20261010/final-home-checks.log`。
- `node scripts/build-pages-site.mjs --output ...`: **633 files / 6 puzzle pages / 86 event pages**。新規音声モジュールを含む。
- `git diff --check`: 成功。
- 既存の独立Chrome/WebKit harnessはカード数とreduced-motion期待値を更新したが、この環境では実行していない。実ブラウザー検証は上記のChrome/CUA経路。
- ビルドがcatalogから再生成したイベントHTMLの差分は退避後、開始時のHEADへ戻した。イベント調査の変更は今回に含めていない。

## 比較画像・記録

保存先 `/tmp/pixieed-home-review-20261010/`:

- `home-390-before.jpg` / `home-390-after.jpg`
- `home-1280-before.jpg` / `home-1280-after.jpg`
- `home-390-drawing-after.jpg`（通常ページで直接描画した画面）
- `home-390-full-after.jpg` / `home-1280-full-after.jpg`
- `browser-evidence.json`（観測値）

Libraryの正規保存経路を1回試したが、接続制約で保存を完了できなかった。画像は上記ローカルパスに残している。検索順位の上昇は検証・保証していない。
