# Ad Manager Webリワード・隔離モック

`/admanager-rewarded-test/` は、既存の出力・AdSense・Offerwallから独立したテストページです。初期状態は外部通信なしのモック。GPT実配信はコードでfalseに固定され、方式選択・視聴opt-in・URL・無効ボタンの強制イベントでも配信されません。

[PC](screens/rewarded-mock-ready-1280x800.png) · [320px](screens/rewarded-mock-ready-320x568.png) · [横画面](screens/rewarded-mock-ready-844x390.png) · [模擬視聴](screens/rewarded-mock-visible-390x844.png) · [最終検証](../release-review-20261012/README.md)

準備完了は視聴操作を待ちます。明示opt-inと表示開始の成功後に届く、同じ試行のgrantedだけでページ内カウントを一度増やします。動画完了、closed、時間経過は報酬の証拠にしません。カウントに金銭・商品・出力解除・アカウント特典はなく、再読み込みで消えます。

closedでスロットを破棄し、同じ試行の遅いgrantedを受け取れる状態を保持します。手動再試行・中止・ページ離脱は古いイベントを無効にし、リスナーとタイマーを破棄します。null slot、no-fill、SDKエラー、準備タイムアウトを区別します。SDKはページ内で一度だけ読み、失敗時は重複要求せずページ再読み込みを案内します。

純粋テスト24件、広告・Passの関連134件、Chromiumの4画面幅と10シナリオが通過しました。GPT試験はメモリ内の偽SDKです。モックページからの外部通信試行は0件。生ログ・内部アカウントの観測情報はローカル保管で、公開資料には含めません。

noindex・nofollow・noarchiveを指定し、ホーム・共通ナビ・sitemapには入口を追加していません。静的ビルドに含めた場合、URLを知っていればアクセスできます。noindexはアクセス制御ではありません。

公開識別子として使用する対象パスは `/23379831154/pixieed_rewarded`。アダプターの実装は需要設定や配信可能性の確認を意味しません。実広告、需要・クリエイティブ設定、プライバシー同意、実機、Safari、本番応答は未検証です。AdSense需要が設定済みとは表示しません。実配信は別途明示承認後の確認が必要です。

公式referenceではclosedがgrantedより先に届く場合がありますが、destroySlots後の配達保証や期限は確認できませんでした。[GPTリワード例](https://developers.google.com/publisher-tag/samples/display-rewarded-ad)、[Closed event](https://developers.google.com/publisher-tag/reference#googletag.events.RewardedSlotClosedEvent)、[リワードのポリシー](https://support.google.com/admanager/answer/9116812?hl=en)に沿って受領状態を分離しています。

ローカル確認はリポジトリで `python3 -m http.server 4173 --bind 127.0.0.1` を起動し、`http://127.0.0.1:4173/admanager-rewarded-test/` を開きます。ブラウザ検証ハーネスは既存のPlaywrightを利用し、必要ならPIXIEED_PLAYWRIGHT_MODULEでインストール済みモジュールのパスを指定します。
