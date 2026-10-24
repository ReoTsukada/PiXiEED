# PiXiEED 全ページUI監査 — 2026-10-24

## 対象と確認範囲

- 公開ビルドのHTML 189件。イベント詳細134件と、その他の入口・イベント一覧55件。
- 57画面（55入口と検索/エラーの追加2状態）を390×844、320×568、844×390、1280×800で確認。イベント詳細134件も390×844で全件確認。合計362回の表示チェック。
- 初期表示の横はみ出し、可視ボタン/summaryの名前、読み込み済み画像の欠落、共通ヘッダーの多段化をDOMで計測。手動でヘルプ、検索0件、解除、下書き、形式変更を確認。
- 全189 HTMLのローカルhref/src 3,894参照に欠落なし（初回監査）。新しい戻るSVG等は最終ビルドでも確認。
- 非公開・ローカル確認専用のdocs/tests/work、Books room preview、camera media test等は公開対象外。管理/互換入口は存在と初期表示のみ確認し、認証/公開設定は変更していない。

## 実装した改善

| 分類 | 問題 | 対応 |
|---|---|---|
| SNS | 検索がフィルターの中に埋もれ、0件の次操作がない | 検索を独立、状態別の解除/投稿/下書き操作を表示 |
| SNS | 一部取得失敗の長文が作業ビューにも残る | 短い状態＋開閉詳細。保存/下書きでは無関係な警告を除く |
| SNS | 二重の制作紹介帯と音声管理の長文 | 共有ナビの制作入口を再利用。音声管理を必要時に開く |
| 店舗 | 0件からの回復操作と結果通知不足 | ライブ件数、検索解除、掲載0件時の地図入口 |
| 自分 | いいね取得失敗でリロードしかない | ページ内再試行。空状態に地図入口 |
| ヘルプ | 古い別ヘッダーと長い重複案内 | 共通ナビ、SVG付き目的別6カード、モード説明を開閉式に |
| 用語集 | 検索0件で全カテゴリ見出しだけ残る | 非該当カテゴリを隠し、検索解除とフォーカス復帰 |
| 利用ガイド | 地図中心の案内と現行SNSが不一致 | 目的別入口を最初に提示。投稿・保存先・規約確認は開閉式に |
| 制作ヘルプ | 中央が保存という旧説明、全操作の長文表示 | 現行の再生/出力操作へ修正、操作別の開閉、モード別案内 |
| 制作ヘルプ | 戻るが巻戻しアイコン、閉じるが横長 | 戻る用SVG、44pxの閉じる/戻る、読み上げ番号重複を解消 |
| ツール一覧 | ブランド名だけで用途が分かりにくい | 行動名に統一。画面例は必要時に展開 |
| 出力 | 小さいファイル選択、形式変更が拡張子だけ | 選択面全体がボタン。形式変更を明示。短い3段階の流れ |
| 出力 | 読込失敗後の選び直しが遠い | 同じ画面に素材選び直しを用意。元のファイルを変更しない |
| 出力 | スマホの固定ナビと保存操作が重なる | 保存操作をナビより上に配置 |
| 共通ヘッダー | header自身がinnerの場合に縦積みになる | 同一要素のときもflex表示を保持 |
| 配信 | URL正規化が公開output/workを作業用フォルダ扱いで除外 | 公開出力画面を明示的に含め、キャッシュ参照テストを拡張 |

## 実操作の確認

- SNS: 部分取得警告中でも検索0件から解除、入力へフォーカス復帰。下書き切替で警告/再試行を隠す。
- 店舗: 検索0件から解除し入力へフォーカス復帰。掲載データ自体が0件なら別の空状態。
- 用語集: 0件から解除し144項目へ復帰、入力フォーカスを維持。
- ツールヘルプ: 一覧→描画ガイド→閉じる。6つの操作説明は初期折りたたみ、元のボタンへ復帰。
- 出力: 公開ロゴPNGを端末内で読み込み、96×96プレビュー、JPEG変換、保存形式の表示更新、保存開始メッセージを確認。
- 出力の保存リンクは明示スクロール後にnavより上にあることを計測。IABのdownload-event取得はタイムアウトがあり、端末上のファイル受取完了までの証明には含めない。

## 保持した判断と境界

- 公開/削除/権利/同意/カメラ許可/保存先の重要表示は保持。利用規約・プライバシー文書、DB/API・認証・投稿受付状態、広告の管理設定は変更していない。
- 説明のためのページ（About、用語本文、規約等）は本文を消す対象にせず、入口/検索/構造を確認。
- カメラ実機撮影、Safari/iOS、実際のスクリーンリーダー、実ユーザーでの公開投稿/削除、広告配信の全条件は未検証。
- 既知の一部公開元/地図連携API取得失敗とGoogle Offerwallの一部環境での表示は残存。UIの回復/詳細表示を整えたが、外部配信設定やバックエンド契約を変えて解消したとは扱わない。
- 全体テストは既知22件の失敗との比較を行う。UI表示監査や静的テストを全機能の本番動作保証とはしない。

## 最終テスト

所有する一時コピーで `npm test` を実行: 2,335件中2,313成功、既知22失敗。既存の失敗名集合との比較で新規失敗なし。`node scripts/performance-normalize-module-urls.mjs --check` は529ソースの参照一致。

## 本番確認での最終調整

ガイドの見出しに旧ルールの67.2pxが優先されていたため、限定セレクターで44px（320px幅では28px）へ修正。PCの目的カードは3列にし、長い日本語ラベルの1文字だけの折返しを解消。1280/320pxで再計測し横はみ出し0。task-ui.cssは専用の新版URLへ更新。

CIで追加生成される公開パズルの個別共有URLは、共通プレイヤーへ転送するラッパーで、ここに列挙した189 HTMLとは別枠。プレイヤー入口は4画面幅で確認しているが、すべての個別作品IDでゲーム完了まで操作したという意味ではない。

## 公開ページ台帳

全行をビルド出力から抽出。互換入口は遷移先も確認し、独立機能として作り直していない。

| URL | タイトル | 系統 |
|---|---|---|
| /404.html | ページが見つかりません｜PiXiEED | 個別・互換入口 |
| /PiXiEEDraw/ | PiXiEEDraw のエディターを開く｜PiXiEED | 個別・互換入口 |
| /about/ | PiXiEEDについて｜つくる・あそぶ・見つける | 個別・互換入口 |
| /admin/ | 管理室｜PiXiEED | 個別・互換入口 |
| /audio/editor.html | 音楽をつくる｜PiXiEEaudio｜PiXiEEDraw | 個別・互換入口 |
| /audio/ | 短いループ曲をつくる｜PiXiEEaudio | 個別・互換入口 |
| /books/ | ドット絵の本と道具｜PiXiEED | 個別・互換入口 |
| /camera/ | 写真・画像をドット絵に変換｜PiXiEEDraw カメラモード | 個別・互換入口 |
| /collection/ | 見つけた記録｜PiXiEED | 個別・互換入口 |
| /draw/about/ | ドット絵を描く｜PiXiEEDraw | 個別・互換入口 |
| /draw/editor.html | ドット絵エディター・アニメーション制作｜PiXiEEDraw | 個別・互換入口 |
| /draw/ | ドット絵・ピクセルアートを描く｜アニメーションGIF作成｜PiXiEEDraw | 個別・互換入口 |
| /events/all-in-pixel-jam-2-2026/ | All In Pixel Jam #2 — Pixel Art game theme｜2026年・オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/altg-six-senses-dot-art-live-2026-10-09/ | 제2회 ALT+G SIX SENSES — ドット似顔絵ライブアート／ドット絵ゲーム展示｜2026年・ソウル特別市・城東区・聖水｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/asaha-mendako-tokyo-pixel-2026/ | asaha個展2026夏「メンダコ天国 -Dokkoi Show-」｜東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/asaha-tokyo-pixel-exhibition-2023/ | asaha個展「ようこそ、お寿司もうさぎもメンダコも住む町へ」｜2023年・東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/beyond-pixel-art-award-exhibition-2021/ | Beyond Pixel Art賞 2020・2021 受賞展示｜東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/binomio-bitsy3d-pixel-art-game-workshop-2027-03-20/ | Taller 26/27: Creación de juegos — Bitsy 3DでモノクロPixel Artゲーム制作｜2027年・Deusto, Bilbao｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/binomio-txiki-bitsy3d-pixel-art-game-workshop-2027-03-06/ | Taller txiki 26/27 — Bitsy 3DでモノクロPixel Artゲーム制作｜2027年・Deusto, Bilbao｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/binomio-whimtale-pixel-art-game-workshop-2026-10-24/ | Taller 26/27: Creación de juegos — Whimtaleでピクセルアートゲーム制作｜2026年・Deusto, Bilbao｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/brignais-pixel-art-workshop-2026-10-31/ | Atelier numérique – Pixel Art（Briscope）｜2026年・Brignais, Métropole de Lyon｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/brignais-pixel-art-workshop-2026-11-15/ | Atelier numérique – Pixel Art（Médiathèque）｜2026年・Brignais, Métropole de Lyon｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/caviar-pixel-art-en-mosaique-2026-12-19/ | Pixel Art en mosaïque 2026/27 — Rezé開催回｜Rezé, Loire-Atlantique｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/caviar-pixel-art-en-mosaique-2027-03-03/ | Pixel Art en mosaïque 2026/27 — Rezé開催回｜2027年・Rezé, Loire-Atlantique｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/chateaubourg-pixel-art-workshop-2026-10-07/ | Atelier Pixel Art — Médiathèque Les Curiosités｜2026年・Châteaubourg｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/cheltenham-spooky-pixel-art-gifs-2026-10-28/ | Cheltenham Lab — Spooky Pixel Art GIFs｜2026年・Cheltenham, Gloucestershire｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/chipping-campden-spooky-pixel-art-gifs-2026-10-30/ | Chipping Campden Lab — Spooky Pixel Art GIFs｜2026年・Chipping Campden, Gloucestershire｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/coloring-pixels-8th-anniversary-art-competition-2026/ | Coloring Pixels 8周年 — ピクセルアート作品募集｜2026年・オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/connecting-dots-256-pacman-ip-art-exhibition-bna-2026/ | Connecting Dots:256 — IP-ART EXHIBITION：PAC-MAN｜2026年・京都府｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/connecting-dots-256-pacman-pixel-dot-field-kyoto-station-2026/ | Connecting Dots:256 — PIXEL DOT FIELD／ドットのひろば（PAC-MAN）｜2026年・京都府｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/crosspico-nagoya-vol-3-2026/ | CROSS PICO（クロスピコ）名古屋vol.3 × 名古屋ぴくせるあーと すぽっと｜2026年・愛知県｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/dfwyas-pixel-art-cube-workshop-2026-04-11/ | Pixel Art Cube Crafting Workshop — DFW Young & Social Club｜2026年・Farmers Branch, Texas｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/digital-jove-pixel-art-workshop-2026/ | Digital Jove 2026 — ピクセルアート入門ワークショップ｜バレンシア｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/doom-loophole-center-sanuki-2026/ | ヘルミッペ × m7kenji 二人展「Doom Loophole」｜2026年・香川県｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/e-topia-kagawa-dot-art-gif-workshop-2026-10-08/ | 絵が動く！ドット絵GIFアニメづくり｜2026年・香川県｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/festival-fps-pixel-art-workshop-2026/ | Festival FPS 2026 — Pixel Artワークショップ｜アルメンドラレホ（バダホス）｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/fontenay-vendee-serigne-pixel-art-lego-2026-11-18/ | Atelier Pixel Art Lego®｜2026年・Sérigné｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/frosted-vibes-sapporo-2025/ | Frosted Vibes 2025 — 北海道銘菓のドット絵展示｜北海道｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/gb-pixel-art-jam-2023/ | GB Pixel Art Jam 2023｜オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/gb-pixel-art-jam-2024/ | GB Pixel Art Jam 2024｜オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/gb-pixel-art-jam-2025/ | GB Pixel Art Jam 2025｜オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/gb-pixel-art-jam-2026/ | GB Pixel Art Jam 2026｜オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/gcmx-del-arte-a-pixel-art-2026/ | GCMX 2026 —「Del arte a mano al Pixel Art」トーク｜グアダラハラ・ハリスコ州｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/graphite-academy-heroverse-pixel-art-game-camp-2026-11-23/ | Heroverse: Marvel-Inspired Coding — Pixel Art＆レトロゲームキャンプ｜2026年・Singapore｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/graphite-academy-pokemon-pixel-art-game-camp-2026-11-30/ | Pokémon-Inspired Coding Adventure — Pixel Artゲーム制作キャンプ｜2026年・Singapore｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/herofestival-marseille-dendrob-pixel-art-2026/ | HeroFestival Marseille — Le Dendrob’AtelierのPixel Art作品出展｜2026年・Marseille｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/hk-museum-festival-carnival-pixel-public-art-2026/ | 香港博物館節2026 — 繽FUN博物館嘉年華（巨型像素蛋撻・公共藝術）｜九龍・尖沙咀｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/hokkaido-comitia-24-juni-pixel-art-2026/ | 北海道COMITIA24 — ジュウニ（ドット絵本・委託参加予定）｜2026年・北海道｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/honkbooks-asobanight-special-weekend-pixel-art-2026/ | 小光とあそばnight! SPECIAL WEEKEND（ドット絵作家参加展示）｜2026年・東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/howard-county-library-pixel-perfect-art-2026-10-17/ | Pixel Perfect Art（11〜13歳向け）｜2026年・Howard County, Maryland｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/ | ドット絵イベント一覧｜展示・即売会・ワークショップ・ゲームジャム / PiXiEED | 個別・互換入口 |
| /events/ingwiller-maison-famille-pixel-art-2026-11-04/ | Atelier création de pixel art — Maison de la famille｜2026年・Ingwiller｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/iwamisawa-ibox-tahara-2025/ | 田原実織展「暗渠を往く末に酸欠」｜2025年・北海道｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/jeumont-fete-bd-pixel-art-workshop-2026-10-17/ | Fête de la BD — Pixel Artワークショップ｜2026年・Jeumont｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/jumpzip-pixel-art-market-seoul-2026/ | 점집 JumpZip — 韓国初のピクセルアート限定即売展示｜2026年・ソウル特別市・龍山区・梨泰院｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/juuni-comitia-158-pixel-art-2026/ | COMITIA158 — ジュウニ（ドット絵本・出展予定）｜2026年・東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/juuni-niigata-comitia-63-2026/ | 新潟コミティア63 — ジュウニ（ドット絵本・出展予定）｜2026年・新潟県｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/kac-hermippe-pointless-2025/ | ヘルミッペ 個展「ポイントレス」｜2025年・東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/kac-super-nice-thankass-2025/ | SUPER NICE THANKASS — モトクロス斉藤 × ヘルミッペ｜2025年・東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/kac-ultra-dope-motocross-2026/ | モトクロス斉藤 個展「ウルトラドープ」｜2026年・東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/keisuke-katsuki-afterglows-2026/ | 香月恵介個展「Afterglow(s)」｜2026年・東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/keisuke-katsuki-on-screen-2026/ | 香月恵介個展「ON-SCREEN」｜2026年・東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/kyushu-pixel-marche-2024-05/ | 九州ピクセルマルシェ 2024年5月｜福岡県｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/kyushu-pixel-marche-2026/ | 九州ピクセルマルシェ2｜2026年・福岡県｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/la-bourboule-pixel-art-serigraphie-2026-11-07/ | Atelier Pixel Art / Sérigraphie — Festival Connexions 2026｜La Bourboule｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/les-garennes-sur-loire-atelier-pixel-art-waldo-2026-10-21/ | Atelier Pixel Art avec Waldo｜2026年・Les Garennes-sur-Loire｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/liquidy-jam-2026/ | The Liquidy Jam!｜2026年・オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/lucinges-bibliotheque-michel-butor-pixel-art-2026-12-16/ | Atelier Pixel Art｜2026年・Lucinges｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/lyon-pixel-art-de-bibliotheque-2026-11-14/ | Ateliers numériques : Pixel art de bibliothèque｜2026年・リヨン・6区｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/lyon-pixel-art-graffiti-la-duchere-2026-11-25/ | Pixel Art & graffiti — La Duchère開催回｜2026年・Lyon｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/lyon-pixel-art-graffiti-part-dieu-2026-11-07/ | Pixel Art & graffiti — Part-Dieu開催回｜2026年・Lyon / Part-Dieu｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/lyon-pixel-art-graffiti-saint-rambert-2026-10-21/ | Pixel Art & graffiti — Saint-Rambert開催回｜2026年・Lyon / Saint-Rambert｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/maakmiddag-pixelart-hardenberg-2026-10-28/ | Maak-Middag Pixel-art｜2026年・Hardenberg｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/med1-gamejam-pixel-art-2026-10-12/ | MED1 GameJam 2026 — 8-bit / Pixel Art｜オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/mis-ce-fortaleza-pixel-art-workshop-2026-10-17/ | Oficina de Pixel Art — MIS Ceará｜2026年・Ceará｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/moertel-polaris-2026/ | Moertel ドット絵作品出展（Polaris 2026）｜ハンブルク｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/moertel-spiel-2026/ | Moertel ドット絵作品出展（SPIEL 2026）｜エッセン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/moertel-viecc-2026/ | Moertel ドット絵作品出展（VIECC 2026）｜ウィーン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/montreal-mixlab-pixel-art-character-workshop-2026-11-05/ | Mixlab : dessiner un personnage et le faire vivre dans un jeu vidéo｜2026年・Québec｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/montreal-mixlab-pixel-art-club-2026-10-22/ | Mixlab : Club d'art du pixel｜2026年・Montréal・Saint-Laurent, Québec｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/mplus-pixel-monster-workshop-2026-11-07-08/ | Drop-in Activity: Pixel Monster｜2026年・西九文化區・九龍｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/musee-chateau-mayenne-pixel-art-family-workshop-2026-11-01/ | Pixel Art — animation en famille｜2026年・Mayenne, Pays de la Loire｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/newgrounds-pixel-day-2017/ | Newgrounds Pixel Day 2017｜オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/newgrounds-pixel-day-2018/ | Newgrounds Pixel Day 2018｜オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/newgrounds-pixel-day-2019/ | Newgrounds Pixel Day 2019｜オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/newgrounds-pixel-day-2020/ | Newgrounds Pixel Day 2020｜オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/newgrounds-pixel-day-2021/ | Newgrounds Pixel Day 2021｜オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/newgrounds-pixel-day-2022/ | Newgrounds Pixel Day 2022｜オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/newgrounds-pixel-day-2023/ | Newgrounds Pixel Day 2023｜オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/newgrounds-pixel-day-2024/ | Newgrounds Pixel Day 2024｜オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/newgrounds-pixel-day-2025/ | Newgrounds Pixel Day 2025｜オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/newgrounds-pixel-day-2026/ | Newgrounds Pixel Day 2026｜オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/noboribetsu-barrier-free-toy-expo-dot-art-2026/ | バリアフリーおもちゃ博 in のぼりべつ — 立体ドット絵の共同制作｜2026年・北海道｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/nova-fct-pixel-art-alternative-interfaces-2026/ | Pixel Art & Alternative Interfaces — NOVA FCT｜2026年・ポルトガル｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/nrg-pixel-art-awards-2026/ | NRG Awards 2026 — Pixel Art部門｜ポズナン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/ntv-imaginarium-2023/ | 日テレイマジナリウム ドット絵展示｜2024年・東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/peymeinade-manga-japanese-culture-festival-pixel-art-2026-10-24-25/ | Festival Manga et arts japonais（Pixel Artワークショップ併催）｜2026年・Peymeinade, Alpes-Maritimes｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/pixel-art-park-2/ | Pixel Art Park 2｜2015年・東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/pixel-art-park-3/ | Pixel Art Park 3｜2016年・東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/pixel-art-park-4/ | Pixel Art Park 4｜2017年・東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/pixel-art-park-5/ | Pixel Art Park 5｜2018年・東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/pixel-art-park-6/ | Pixel Art Park 6｜2019年・東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/pixel-art-park-9/ | Pixel Art Park 9｜2026年・神奈川県｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/pixel-deck-jam-1-2026/ | PIXEL-DECK JAM #1｜2026年・オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/pixel-dot-party-2024/ | Pixel Dot Party 2024｜オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/pixel-layered-hermippe-shibuya-2026/ | PIXEL LAYERED 第三弾 hermippe「円環」｜2026年・東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/pixel-school-stage-2-2024/ | ピクセルアートの学校 第2ステージ｜2024年・東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/pixelgirls-side-b-2025/ | PIXELGIRLS: SIDE B｜2025年・東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/pixelverse-jam-2026/ | Pixelverse Jam 2026 — Pixel Art・レトロゲーム制作ジャム｜オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/pixelween-2020/ | Pixelween 2020｜オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/pixelween-2021/ | Pixelween 2021｜オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/pixelween-2022/ | Pixelween 2022｜オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/pixelween-2023/ | Pixelween 2023｜オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/pixelween-2024/ | Pixelween 2024｜オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/pixelween-2025/ | Pixelween 2025｜オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/pixelween-2026/ | Pixelween 2026｜オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/pixxelpoint-pixel-art-workshop-2026-10-21/ | Pixxelpoint 2026 — Pixel-artワークショップ（Marko Drpić / tipoRenesansa）｜Nova Gorica｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/pont-de-beauvoisin-pixel-art-geant-2026-11-25/ | Atelier — Pixel art géant｜2026年・Pont-de-Beauvoisin｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/retro-game-summit-lv6-dot-art-2026-11-07/ | RETRO GAME SUMMIT Lv.6（ドットアート出展・展示販売）｜2026年・東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/retro-pixel-jam-2026/ | Retro Pixel Jam 2026（レトロ／ドット絵ゲーム制作ジャム）｜オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/retrocon-saar-17-pixel-art-2026/ | 17. RetroCon Saar — Creative Zone（Pixel Art）｜2026年・フェルクリンゲン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/riedisheim-en-pixel-closing-2026/ | Riedisheim en Pixel — Conseil des Jeunes展示・締めくくり企画｜2026年・Riedisheim｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/sable-sur-sarthe-pixel-art-mosaic-workshop-2026-10-27/ | Atelier mosaïque pour pratiquer le Pixel Art｜2026年・Sablé-sur-Sarthe, Pays de la Loire｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/sapporo-game-odyssey-commentator-2026/ | SAPPORO GAME ODYSSEY 2026 — コメンテーター（ピクセルアートゲーム）出展｜北海道｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/scratch-day-pioneiro-pixel-art-2026/ | Scratch Day 2026 — Pixel Artコンテストと学生作品展示｜ブラジル｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/segment-pixel-jam-2026/ | Segment Pixel Jam 2026｜オンライン｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/shibuya-pixel-art-2018/ | SHIBUYA PIXEL ART 2018｜東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/shibuya-pixel-art-2020/ | SHIBUYA PIXEL ART 2020｜東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/shibuya-pixel-art-2021/ | SHIBUYA PIXEL ART 2021 Reboot｜東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/shibuya-pixel-art-2022/ | SHIBUYA PIXEL ART 2022｜東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/shibuya-pixel-art-2023/ | SHIBUYA PIXEL ART 2023 HAKKO｜東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/shibuya-pixel-art-2024/ | SHIBUYA PIXEL ART 2024 BIT VALLEY, BIT FLOWERS｜東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/shibuya-pixel-art-2025/ | SHIBUYA PIXEL ART 2025｜東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/sofa-nigromante-pixel-art-talk-2026/ | SOFA 2026 — El Nigromante y el arte del pixel art｜Bogotá｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/summer-dot-daisakusen-2024/ | 夏休みドット大作戦 2024｜東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/sydney-haymarket-pixel-art-workshop-2026-10-20/ | Homeschool maker time: Pixel art（公式タイトル10–15歳、本文12–16歳）｜2026年・Sydney / Haymarket｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/syntax-demoparty-pixel-art-2026/ | Syntax DemoParty 2026 — pixel graphics / pixel art competitions｜Melbourne｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/the-pixel-street-2023/ | THE PIXEL STREET｜2023年・東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/valedkids-meieki-pixel-workshop-autumn-2026/ | 名駅教室 — Excel関数でドット絵を作ろう！｜2026年・愛知県｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/vila-geek-pixel-art-workshop-fortaleza-2026-10-20/ | Vila Geek — Oficina de Pixel Art｜2026年・Fortaleza, Centro｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/vila-geek-pixel-art-workshop-fortaleza-2026-10-22/ | Vila Geek — Oficina de Pixel Art (22 October)｜2026年・Fortaleza, Centro｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/villa-pelle-analog-pixel-art-2026-11-22/ | ART & PLAY 2026/2027 — Analogový pixel art｜Praha 6｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/villeneuve-forum-des-sciences-pixel-art-lego-2026-10-17/ | Pixel Art LEGO®｜2026年・Villeneuve-d’Ascq, Hauts-de-France｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/west-vancouver-library-scary-simbrix-pixel-art-2026-10-21/ | Scary Simbrix: Halloween Pixel Art（3〜5年生）｜2026年・West Vancouver, British Columbia｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/winter-dot-daisakusen-2026/ | 冬休みドット大作戦 2026｜東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/yilan-lanrenju-pixel-brick-workshop-2026-10-24/ | 《蘭人聚》拼出你的像素世界 — 積木像素磚掛畫手作體驗｜2026年・宜蘭縣・宜蘭市｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /events/yusuke-shigeta-continuous-discontinuous-migiwa-2026/ | 重田佑介個展「連続と非連続の汀で」｜2026年・東京都｜ドット絵イベント情報｜PiXiEED | イベント詳細・共通テンプレート |
| /explore/ | 作品・作者を探す｜PiXiEED | 個別・互換入口 |
| /feed/ | 作品フィード｜PiXiEED | 個別・互換入口 |
| /game/ | かんたんゲーム｜絵を選んで作る｜PiXiEED | 個別・互換入口 |
| /globe/ | ドット絵のイベント・作品を世界地図で探す｜PiXiEED | 個別・互換入口 |
| /globe-prototype.html | PiXiEED地図 | 個別・互換入口 |
| /glossary/ | ドット絵・ピクセルアート用語集 / PiXiEED | 個別・互換入口 |
| /guide/ | 利用ガイド｜PiXiEEDの使い方 | 個別・互換入口 |
| /help/ | PiXiEEDヘルプ｜描く・カメラ・音楽 | 個別・互換入口 |
| /hidden-object/ | かんたんもの探し｜問題を作って遊ぶ｜PiXiEED | 個別・互換入口 |
| /home/ | PiXiEED | 個別・互換入口 |
| / | PiXiEED｜みんなの作品とつくる道具 | 個別・互換入口 |
| /jigsaw/ | 好きな写真でジグソーパズルを作って遊ぶ｜PiXiEED | 個別・互換入口 |
| /output/ | PNG・JPEG変換とGIF・音楽の合成｜PiXiEED | 個別・互換入口 |
| /output/work/ | 作品のプレビュー・保存｜PiXiEED | 個別・互換入口 |
| /pass/ | 無料で使えます｜PiXiEED | 個別・互換入口 |
| /pixel-camera-studio.html | ドット絵カメラ｜PiXiEED | 個別・互換入口 |
| /pixel-camera.html | 写真をドット絵に変換｜画像・カメラから作成｜PiXiEED | 個別・互換入口 |
| /pixfind/ | PiXiEED | 個別・互換入口 |
| /pixiedraw/ | 以前の PiXiEEDraw をお使いの方へ｜PiXiEED | 個別・互換入口 |
| /pixiedraw2/ | 以前の Studio Draw2 をお使いの方へ｜PiXiEED | 個別・互換入口 |
| /pixiee-lens/ | PiXiEELENSの移行案内｜PiXiEED | 個別・互換入口 |
| /play/hidden-object/ | ドット絵もの探し｜絵の中にかくれたものを探す｜PiXiEED | 個別・互換入口 |
| /play/spot-difference/ | ドット絵間違い探し｜2枚の絵のちがいを見つける｜PiXiEED | 個別・互換入口 |
| /privacy/ | プライバシーについて｜PiXiEED | 個別・互換入口 |
| /profile/ | 自分のページ｜PiXiEED | 個別・互換入口 |
| /projects/pixfind/ | PiXFiND｜ドット絵の間違い探し・もの探し | 個別・互換入口 |
| /projects/pixiedraw/ | PiXiEEDrawの移転案内｜PiXiEED | 個別・互換入口 |
| /spot-difference/ | かんたん間違い探し｜問題を作って遊ぶ｜PiXiEED | 個別・互換入口 |
| /stores/cafe-hoshi.html | Cafe Hoshi｜PiXiEED | 個別・互換入口 |
| /stores/ecowashcafe-nakanoshima.html | ECOWASHCAFE 中野島｜PiXiEED | 個別・互換入口 |
| /stores/ | お店を探す｜PiXiEED | 個別・互換入口 |
| /stores/kaze-machi.html | 風待ち珈琲｜PiXiEED | 個別・互換入口 |
| /stores/yoru-akari.html | 夜灯り文庫｜PiXiEED | 個別・互換入口 |
| /studio/ | 以前の Studio からのご案内｜PiXiEED | 個別・互換入口 |
| /telescope/ | 望遠鏡｜星空や天文イベントを見る｜PiXiEED | 個別・互換入口 |
| /terms/ | 利用規約｜PiXiEED | 個別・互換入口 |
| /tools/ | ドット絵・音楽・カメラ・パズルのツール｜PiXiEED | 個別・互換入口 |
| /welcome/ | 描く・写真を加工する・音楽をつくる、パズルで遊ぶ｜PiXiEED | 個別・互換入口 |
| /works/ | 作品を見る｜世界地図へ移動 / PiXiEED | 個別・互換入口 |
| /works/night-lantern.html | この作品は公開していません｜PiXiEED | 個別・互換入口 |
| /works/rainy-window.html | この作品は公開していません｜PiXiEED | 個別・互換入口 |
| /works/sea-cat.html | この作品は公開していません｜PiXiEED | 個別・互換入口 |
