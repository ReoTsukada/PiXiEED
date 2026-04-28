# PiXiEEDraw Shared Collaboration Simplification Plan

## Goal

PiXiEEDraw の shared collaboration を、復旧ロジックの積み増し型から、
「単純で順序保証のある共同編集モデル」へ段階的に移行する。

優先順位は以下とする。

1. 正しさ
2. 再接続時の収束性
3. 実装と保守の単純さ
4. 体感速度

## Current Problems

現行実装は以下の複数経路が重なっている。

- broadcast provisional apply
- shared_project_ops の INSERT realtime
- shared_projects revision 更新の realtime
- fetch-ops-since gap recovery
- snapshot refresh
- provisional replay

この結果、以下の問題が起きやすい。

- reload / reconnect 中に一部 op が別経路で重複・欠落する
- structure change と draw change が同じ復旧経路で干渉する
- provisional draw が structure revision mismatch で落ちる
- warning / preflight failure が多く、shared 本体の問題を追いづらい

## Target Model

共同編集モデルは次へ寄せる。

- サーバー確定済み op を唯一の正本にする
- クライアント間の最終同期は revision 順の committed op のみで行う
- realtime broadcast は「未確定描画の直接適用」ではなく「差分取得の高速トリガー」とする
- structure op と draw op は扱いを分ける
- 接続不安定中は shared draw を止める

## Phases

### Phase 1: Confirmed-Only Remote Draw

目的:
- remote provisional draw をやめる
- remote draw は committed op のみで反映する

変更:
- broadcast 受信時、draw op は provisional apply しない
- broadcast は gap recovery のトリガーに限定する
- remote draw の最終適用は shared_project_ops / fetch-ops-since の committed path に寄せる

期待効果:
- structure mismatch による provisional failure を大幅に減らす
- remote draw の反映順を 1 本化できる

### Phase 2: Structure / Draw Split

目的:
- structure op と draw op の復旧経路を明確に分離する

変更:
- structure revision 不一致時は draw provisional ではなく canonical refresh を優先
- structure op 実行中は draw input を一時停止

### Phase 3: Strict Ordered Local Commit Queue

目的:
- local pending op を常に createdAt 順で commit

変更:
- local queue は FIFO のみ
- 未確定 op がある間は後続 op を commit しない
- conflict 時は先頭 op から順に再試行

### Phase 4: Shared Recent / Membership Isolation

目的:
- shared UI 周辺通信の失敗を draw sync 本体から切り離す

変更:
- memberships / recent / dot count 失敗は silent degrade
- shared drawing session の lifecycle と recent sync の lifecycle を分離

### Phase 5: Optional Optimistic UX

目的:
- 正しさを崩さず見た目だけ高速化

変更:
- 自分の local draw だけ optimistic 表示
- remote は confirmed only を維持

## Acceptance Criteria

### Phase 1 完了条件

- A/B 2台で reload 中に B が描いた committed draw が A に欠落しない
- `draw-apply-skipped:structure-revision-mismatch` が大幅に減る
- remote draw の最終適用が committed path に揃う

### Phase 2 完了条件

- structure change 後に draw recovery が stalled loop に入りにくい
- canonical refresh へ速やかに昇格する

### Phase 3 完了条件

- 接続不良中に A が複数描いても、復帰後に順番が崩れない

## Implementation Notes

- まずは「速いけれど複雑な provisional path」を減らす
- その後に queue / refresh の責務を整理する
- いきなり CRDT 化はしない
- append-only ordered ops を軸にする
