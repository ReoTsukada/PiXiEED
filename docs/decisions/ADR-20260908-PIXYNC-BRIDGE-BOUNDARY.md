# ADR-20260908: PiXYNCとPiXiEED Bridgeの責務境界

- Status: Accepted
- Date: 2026-09-08
- Scope: PiXiEEDraw2（Draw2）の同期とBridge表記

## 決定

1. **PiXYNCがDraw2の同期抽象層である。** Draw・Audio・Gameの3モードをまたぐProject操作、順序、revision、journal、transportの責務はPiXYNCの契約で扱う。
2. **ローカル同期は3モードのセッションである。** `LocalProjectSessionBroker` は `draw`・`audio`・`game` の存在、順序、presence、checkpointなどのセッション状態を扱う。各モードの実データの正本・書き込み責務は、引き続き各モードのProduct Adapterが持つ。ローカルセッションは全データを一つに置き換える汎用ストアではない。
3. **オンライン同期もPiXYNCのSupabase providerを使う。** Draw2のproduction composition rootは `PixyncSupabaseProvider` を選択する。これはソース上の配線であり、Supabase、認証、Storage、Realtime、2ユーザー再接続などの本番受入れが完了したことを意味しない。
4. **PiXiEED Bridgeは別製品である。** Aseprite／Unityなどと接続する外部のネイティブ・スタンドアロン製品であり、Draw2の標準同期、Projectの正本、PiXYNCのオンラインtransportではない。
5. `pixiedraw2/src/pixync/bridge-provider.ts` は、外部PiXiEED Bridgeを別途起動する利用者向けの**任意・既定OFFの相互運用アダプター**である。Draw2の標準composition rootからは選択されない。製品の同期経路へ採用する場合は、別の設計判断と受入れを必要とする。

## 所有権

- Drawの描画データはDraw、Audioの音楽データはAudio、GameのゲームデータはGameがそれぞれ書き込み主体になる。
- 他モードからの参照、プレビュー、再生、監視、時刻連携、exportは読み取り・投影として扱い、他モードの正本を直接書き換えない。
- PiXYNCのoperationは、所有するsubdocumentのProduct Adapterへ適用する。
- `creator-project-bridge.js` のProjectイベント連携は、Project作成・workspace manifest連携の薄い入口であり、全モードの内容を同期する正本ではない。

## 用語規則

| 表記 | 意味 | 標準経路か |
| --- | --- | --- |
| PiXYNC | Draw2の同期契約・順序・journal・transportの抽象層 | はい |
| ローカル3モードセッション | Draw／Audio／Gameのセッション状態をまとめるローカル経路 | はい（ローカル） |
| PiXYNC online | Draw2のPiXYNCに接続されたSupabase provider経路 | はい（オンライン用の実装） |
| PiXiEED Bridge | Aseprite／Unity等を接続する別製品のネイティブBridge | いいえ（任意連携） |
| Asset／Registry／Workspace／Tool Bridge | Draw2またはCore内部の参照・能力・アダプター契約 | 用語を明記した内部契約 |

「Bridge」とだけ書く場合は、外部PiXiEED Bridgeなのか、内部アダプターなのかを必ず明記する。「PiXYNC＝Bridge」「BridgeをDraw2のオンライン同期正本とする」という表現は使用しない。

## 変更時のルール

- Draw2の標準同期providerを変更する場合は、composition root、認証・権限、revision／checkpoint、再接続、2ユーザー収束、fallbackを含む設計判断を先に更新する。
- 外部PiXiEED BridgeのprotocolやConnectorを変更する場合は、Bridge側のリポジトリと受入れ条件を別途更新する。Draw2のPiXYNC変更として扱わない。
- 既存の内部型名に含まれる `Bridge` は、互換性のため機械的に改名しない。コメント、UI、エラー文、設計資料では上表の責務を明記する。
