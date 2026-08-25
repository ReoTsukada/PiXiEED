# v3.2

## Discovery First
- 1文のGOALから開始可能。
- `DISCOVERY_INTERVIEW.yaml` を追加。
- 起動時に高情報価値の質問をまとめて実施。
- 原則1バッチ、回答によって新しい重大分岐が発生した場合のみ最終2バッチ目を許可。
- AIが調査/推定できる内容、可逆な詳細は質問しない。

## Discovery Lock
- 質問完了後 `discovery_lock=true`。
- 以後、通常の商品/設計/実装質問を禁止。
- 新しい曖昧さは、既存Decision→Cache→Research→可逆Default→Option-preserving Architecture→Cheap Compare→Safe Assumption の順で自己解決。

## Approval
- 本番公開、実課金、破壊的Migration、重大な法的/安全上の判断などのみHard Approval対象。
- 可能な限り作業を先に完了し、不可逆な最後の一手だけ承認を求める。

## Cost
- 質問数もコストとして扱う。
- 情報利得・手戻り回避価値の低い質問を削減。
- A/B、Research、Review、Model escalationはEvidence Value Gateで必要時のみ。
