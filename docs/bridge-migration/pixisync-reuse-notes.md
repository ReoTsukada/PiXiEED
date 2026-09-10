# PiXiSYNC設計をPiXiEED Bridgeの外部コネクターへ再利用する要点

作成日: 2026-08-30
参照スナップショット: `d8cde9d1`
位置づけ: 旧PiXiSYNC設計から、外部PiXiEED Bridgeのprotocol／Connectorへ再利用できる候補だけを整理する短い引継ぎメモ。Draw2の正規同期はPiXYNC（ローカル3モード＋オンラインprovider）であり、このメモはDraw2のtransport変更やPiXiEED Bridgeへの一本化を決めない。これは現時点の本番受入れ証明でもない。

## 再利用候補

1. **正本revision** — 接続先やクライアント到着順ではなく、共有ルームの正本が採番するrevisionで操作順を決める。BridgeではこのauthorityをConnectorやUIから分離する。
2. **冪等なoperation** — `operationId`、payload hash、revisionを識別子として扱い、再送・重複・遅延・順序逆転を安全に畳み込む。同じ操作を二度適用しない。
3. **確定差分の送信** — 描画の途中経過やブラシ軌跡を再計算せず、確定したcanonical deltaを送る。Bridgeではこれを特定アプリの内部形式から独立したoperationへ変換する。
4. **checkpoint + tail復元** — 検証済みcheckpointを起点に、checkpoint以降のoperation tailをrevision順に適用する。ローカルjournalは再送・復旧用であり、リモート正本の代替ではない。
5. **journal/hash境界** — append-only記録、前レコードhash、snapshot/checkpoint hash、重複operation検査を保つ。永続化はstage・検証・atomic replace後に公開する。
6. **競合と停止** — 欠番、hash不一致、同revisionの内容不一致、古いgeneration、権限失効、transport切断を検知したら入力を止め、checkpoint + tailへ戻す。
7. **ライフサイクル** — authenticate → member/role確認 → session初期化 → checkpoint復元 → tail追随 → private transport接続 → 再度head確認、の順序を維持する。通常のfocus復帰と本当のtransport再接続を混同しない。
8. **責務分離** — domain operation、journal、order keeper、transport、provider、Connectorを別境界にする。Bridgeの公開Protocolはtransport/providerの具体型を漏らさない。

## そのまま移植してはいけないもの

- 旧`shared_projects` / `multi`系の互換経路や、PiXiEEDrawのUI・状態管理。
- 旧Supabase migration/RPCをBridgeの正本仕様とみなすこと。署名、権限、schema、Storage、RealtimeはBridge用に再設計・再検証する。
- headless、synthetic、repository-onlyのPASSを、実Aseprite・実Unity・実Realtime・実端末・staging/productionの受入れ結果へ昇格すること。
- 大きなmutable snapshotをConnector間で直接共有すること。operationとrevisionの境界を先に確定する。
- invite token、project key、認証情報をtopic名やログへ含めること。

## Bridgeで先に検証すること

- Universal Protocolのschema、canonical JSON、operation hash、capability negotiation。
- Aseprite ConnectorとUnity Connectorを同一のlocal IPC/WebSocket transportへ接続した、二方向の小さなoperation。
- 再送、重複、欠番、順序逆転、競合、再接続、journal再起動復元。
- Connectorが未対応のoperationを拒否または隔離し、Bridge本体のrevisionを壊さないこと。
- 実アプリ・実ユーザー・実Realtime・複数端末の試験を、上記のローカル試験とは別のゲートとして記録すること。

## 削除と保全の境界

- 旧PiXiSYNCの実装、旧ツール本体、現在の未コミット修正はこの整理で削除する。
- このメモと、別作業で作成済みのBridge成果物は保持する。
- 保持されたBridge成果物: `/Users/tsukadareine/Documents/Codex/2026-08-30/referenced-chatgpt-conversation-this-is-an/outputs/pixieed-bridge`
- 旧実装を戻す場合のGit復旧参照: `cleanup/bridge-cutover-20260830`
