# ゲームのアイコン操作と共有（2026-10-06・ローカル）

この初回記録の再挑戦仕様は追加依頼で更新した。現在の結果は「共有する」「問題一覧に戻る」で、詳細と最新検証は [結果・初期化の記録](puzzle-result-list-update-20261006.md) を参照。

対象は `/play/spot-difference/` と `/play/hidden-object/`。制作側の変更は別担当の記録を参照。本件ではコミット、プッシュ、デプロイ、実作品の投稿、第三者への送信は行っていない。

## 実装

- 既存 `mountToolHeaderControls` を使い、戻る・共有URLコピー・ヒントを44pxの上部アイコンへ移動。共通ヘッダーや共通CSSは変更していない。移動前の祖先を監視する既存ヘルパーにより、一覧・ローカル下書き・結果画面では該当操作の表示/操作可否を引き継ぐ。
- 常設の大きい共有行と重複HUDを外し、画像を可変高の中央行へ配置。コピー結果/エラーだけを一時表示する。結果画面ではゲーム用ヘッダー操作を隠し、結果内の共有ボタンを使用する。
- もの探しは画像の上に「探すもの」と対象名を表示し、通常13.6px・短い横向き12.8pxの対象表示を確保。未発見○・発見済み✓の状態を保ち、対象が多いときは対象帯がスクロールする。
- ヒントは未発見箇所を2.6秒示す既存動作を維持し、正解数には加えない。意味をアクセシブル名称/ツールチップに明記し、処理中はdisabled/aria-busy、完了時は非表示にする。
- 既存 `createToolResultView` のactions/controls APIで「共有する」「もう一度遊ぶ」を追加。公開HTMLとOGP画像を既存検証処理で確認してからWeb Shareを試し、非対応・キャンセル・失敗ではURLコピーへ進む。コピー不能なら結果内の読取専用URLを選択して手動コピーできる。検証不能な公開ページは共有しない。ローカル下書きには共有を出さない。
- 既存のArcadeお祝いとTool Resultが同時に出て、再挑戦後も旧お祝いが入力を塞ぐ問題を実操作で再現。両ゲーム専用CSSで既存Tool Resultを表示窓口に統一し、再挑戦とEscape後の操作を確認した。
- 新しい専用CSSとプレイヤーモジュールの参照revisionは `20261006-game-controls-1`。

## 検証

新規 `scripts/puzzle-player-layout-browser-harness.mjs`：Chromium、2ゲーム×320×568 / 390×844 / 844×390 / 1280×800、計8条件PASS。

実ポインタークリック、elementFromPointのアイコン中央ヒット、44px寸法、横方向overflowなし、画像がヘッダー/下部ナビと重ならないこと、キーボードEnterでヒント/コピー、正解完了、結果共有、再挑戦、Escape、一覧戻り、対象名と発見状態を確認。Web Share成功・キャンセル・非対応、Clipboard拒否時のURL選択を合成APIで確認し、実OS共有/Clipboardや第三者送信は行っていない。外部通信は合成公開問題・PNG・共有HTML/OGPのローカル応答に置き換えた。

既存 `scripts/pixfind-hit-feedback-browser-harness.mjs`：両ゲーム×同4画面、8条件PASS。正解/ミス、再タップ、ドラッグ/複数pointerキャンセル、比較2画面同期、ズーム、フィードバックでの寸法不変、リセット、reduced-motionを確認。関連pixfind・hint・share単体テスト69/69 PASS。

`HEAD` のHTMLとプレイヤーJSを読み取り専用で別の隔離ブラウザへ供給し、同じ合成問題で画像領域の高さを比較した。間違い探し縦画面の値は1枚あたり。

| 画面 | 間違い探し・前→後(px) | もの探し・前→後(px) |
| --- | ---: | ---: |
| 320×568 | 114.5 → 181.5 | 137.1 → 318.7 |
| 390×844 | 252.5 → 316.4 | 413.1 → 594.7 |
| 844×390 | 113 → 193 | 62 → 166 |
| 1280×800 | 466 → 593.7 | 389.1 → 549.7 |

結果JSON：`/tmp/pixieed-game-layout-20261006/results.json`、改修前比較：`/tmp/pixieed-game-layout-before-20261006/results.json`。ログ：`/tmp/pixieed-game-layout-20261006.log`、`/tmp/pixieed-game-feedback-20261006.log`。

スクリーンショットは `/tmp/pixieed-game-layout-20261006/` の `{spot-difference,hidden-object}-{320,390,844,1280}-{initial,play,result}.png`。initialは未発見、playはコピー通知あり、resultはClipboard拒否時の手動URL表示。

## 未検証

実機Safari/iOS/AndroidのOS共有・Clipboard・実タッチは未検証。公開ページ検証の非同期待ちでWeb Shareのuser activationを失うブラウザも、同じ失敗時フォールバックへ進む。OS共有成功そのものは本検証では主張しない。320px/横向き/PCはエミュレーション。実ユーザー作品や既存の未保存ブラウザータブは開いていない。
