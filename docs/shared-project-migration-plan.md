# PiXiEEDraw Shared Project Migration Plan

## Goal

PiXiEEDraw の現在の「共同制作（master / guest / spectator）」を、
Google Drive やスプレッドシートに近い「共有プロジェクト」方式へ移行する。

目標は以下。

- 招待リンクで共有プロジェクトを配布できる
- 参加者のプロジェクト一覧にも共有プロジェクトが出る
- 参加者全員がソロ時と同じ感覚で編集できる
- レイヤー追加 / フレーム追加 / キャンバス変更 / 描画 / 選択 / 貼り付けを制限しない
- ローカル UI 状態は共有しない
- 既存 app.js と既存プロジェクト構造をできるだけ流用する

## Current Reality

現在のマルチは「共有プロジェクト」ではなく「master authoritative room」。

主要な依存点:

- role と authority: [app.js](/Users/tsukadareine/Documents/GitHub/PiXiEED/pixiedraw/assets/js/app.js#L49277)
- assignment と guest 制限: [app.js](/Users/tsukadareine/Documents/GitHub/PiXiEED/pixiedraw/assets/js/app.js#L54419)
- authoritative full sync: [app.js](/Users/tsukadareine/Documents/GitHub/PiXiEED/pixiedraw/assets/js/app.js#L55680)
- guest patch -> master relay: [app.js](/Users/tsukadareine/Documents/GitHub/PiXiEED/pixiedraw/assets/js/app.js#L55866)
- master patch receive: [app.js](/Users/tsukadareine/Documents/GitHub/PiXiEED/pixiedraw/assets/js/app.js#L56663)
- reconnect / recovery: [app.js](/Users/tsukadareine/Documents/GitHub/PiXiEED/pixiedraw/assets/js/app.js#L56377)

このため、master を消して全員自由編集にすると、以下が破綻する。

- authoritative state の起点
- full resync の返答元
- layer/frame assignment 前提の patch 適用
- role ベース UI 制限
- reconnect 時の復元ルート

## Non-Goals

以下は第1段階ではやらない。

- CRDT 全面導入
- app.js の大規模分割
- ソロ用 history を collaborative undo に作り替えること
- 現行 autosave を即廃止すること

## Design Direction

共有単位を `room` から `shared project` に移す。

### New Model

- room
  - 一時接続ではなく、shared project の realtime 配送路に降格
- master / guest / spectator
  - 廃止
- assignment
  - 廃止
- shared project
  - 永続 project 単位で存在
- member
  - shared project に対する参加者
- project revision
  - 共有ドキュメントの世代番号
- operation
  - 描画差分または構造変更

## Shared vs Local

### Shared State

- project metadata
  - sharedProjectId
  - ownerUserId
  - title
  - visibility
  - invite token
  - updatedAt
- document state
  - canvases
  - frames
  - layers
  - pixels
  - mirror document state
  - voxel document state
- structural revision
  - documentRevision
  - structureRevision

### Local State

- active tool
- color selection
- active palette index
- zoom / pan
- active tabs
- local layer visibility / local preview opacity
- local selection handles UI
- local clipboard / pending move UI

### Transient Transport State

- pending outgoing ops
- pending ack / retry
- stale request guards
- last received revision
- resync in flight token

### Reconnect Recovery State

- last confirmed revision
- last opened sharedProjectId
- local unsynced transient ops queue

## Why "No Sync Drift" Is Hard

現行の broadcast だけでは「絶対に同期ずれなし」は保証しづらい。

必要な最低条件:

1. すべての共有変更に `baseRevision` を持たせる
2. 保存真実を shared project 単位に置く
3. `baseRevision` が古い更新は reject または rebase する
4. structure change と draw patch を同じ revision 空間か、明確に分離した revision 空間で管理する

この条件なしに全員自由編集を許すと、以下が起きる。

- 古い frame/layer 構造に対する patch
- layer 削除後に古い layerId へ描画
- frame 並べ替え後に古い frameIndex へ patch
- 遅延 full snapshot で巻き戻り

## Recommended Architecture

### 1. Shared Project Store

新設する永続モデル:

- `shared_projects`
  - id
  - owner_user_id
  - title
  - invite_token
  - visibility
  - latest_revision
  - latest_structure_revision
  - latest_snapshot
  - updated_at

- `shared_project_members`
  - project_id
  - user_id
  - role
  - joined_at
  - last_opened_at

- `shared_project_ops`
  - project_id
  - revision
  - base_revision
  - op_type
  - actor_user_id
  - payload
  - created_at

第1段階では snapshot 全文保存でもよい。

## Operation Types

### Draw Ops

- pixel_patch
- fill_patch
- clear_region
- paste_patch

これらは即時反映優先。

### Structure Ops

- add_layer
- remove_layer
- reorder_layer
- add_frame
- remove_frame
- reorder_frame
- add_canvas
- remove_canvas
- reorder_canvas
- resize_canvas

これらは revision 必須。

### Meta Ops

- rename_project
- update_project_settings

## Conflict Policy

### Draw

- 同じ revision 上の draw op は到着順適用
- baseRevision 不一致なら再取得して再適用候補へ送る
- まずは last-write-wins でよい

### Structure

- structure op は必ず current structure revision を要求
- 不一致時は reject
- reject されたクライアントは latest snapshot を再取得して UI を再適用

これはソロ時と完全一致ではないが、最小安全策として妥当。

## Phased Migration

### Phase 1: Shared Project Identity

目的:

- room ではなく shared project を作る
- 招待リンクで参加する
- 参加者のプロジェクト一覧にも shared project を出す

既存流用:

- local autosave project id 管理
  - [app.js](/Users/tsukadareine/Documents/GitHub/PiXiEED/pixiedraw/assets/js/app.js#L17677)
- open project tab 管理
  - [app.js](/Users/tsukadareine/Documents/GitHub/PiXiEED/pixiedraw/assets/js/app.js#L7281)

変更点:

- `autosaveProjectId` と別に `sharedProjectId` を持つ
- project list entry に `storageKind: local | shared` を追加
- invite link から `sharedProjectId` を受け取って一覧へ追加

### Phase 2: Authority Shift

目的:

- master authoritative room を廃止
- authoritative source を shared project revision に移す

削除候補:

- `masterClientId`
- `join-request`
- `join-request-result`
- `role-change`
- `assignments`
- `participantFreeCellMove`
- `enforceGuestAssignedLayerSelection`

影響関数:

- [app.js](/Users/tsukadareine/Documents/GitHub/PiXiEED/pixiedraw/assets/js/app.js#L51792)
- [app.js](/Users/tsukadareine/Documents/GitHub/PiXiEED/pixiedraw/assets/js/app.js#L54419)
- [app.js](/Users/tsukadareine/Documents/GitHub/PiXiEED/pixiedraw/assets/js/app.js#L55866)
- [app.js](/Users/tsukadareine/Documents/GitHub/PiXiEED/pixiedraw/assets/js/app.js#L55961)

### Phase 3: Realtime Draw Path

目的:

- 描画だけは即時反映
- `guest-layer-patch -> master-layer-patch` をやめる

置換方針:

- `draw-op` を単一路線にする
- 送信者全員が `draw-op` を publish
- 受信側全員が `baseRevision` を見て apply

現行流用:

- diff/full patch encoding
  - [app.js](/Users/tsukadareine/Documents/GitHub/PiXiEED/pixiedraw/assets/js/app.js#L55146)
- patch sequence guard
  - [app.js](/Users/tsukadareine/Documents/GitHub/PiXiEED/pixiedraw/assets/js/app.js#L55061)

必要変更:

- streamKey を `client + canvas + frame + layer` から `project + target entity` へ寄せる
- assignment 前提の validation を削除

### Phase 4: Structure Sync

目的:

- レイヤー追加/削除
- フレーム追加/削除
- キャンバス変更

方針:

- これらは `structure-op` として送る
- apply 前に `baseStructureRevision` をチェック
- 不一致なら full snapshot 再取得

現行で使えるもの:

- full snapshot serialize/deserialize
  - [app.js](/Users/tsukadareine/Documents/GitHub/PiXiEED/pixiedraw/assets/js/app.js#L54860)
  - [app.js](/Users/tsukadareine/Documents/GitHub/PiXiEED/pixiedraw/assets/js/app.js#L55520)

### Phase 5: Reconnect / Resume

目的:

- shared project を reopen したら最新 revision を取る
- offline 中のローカル一時変更は discard or replay を選べる

現行から捨てるもの:

- `master-state-request`
- `guest-session-state`
- `awaitingGuestStateRecovery`

## Minimal-Safe Implementation Order

最小破壊で進めるなら順番は固定する。

1. shared project metadata と project list 対応
2. shared snapshot load/save API
3. realtime event を room ベースから project ベースへ差し替え
4. draw op 単一路線化
5. structure op revision 化
6. 旧 master/guest UI と assignment 削除

この順を崩すと、途中段階で既存マルチも通常保存も壊しやすい。

## What Can Be Reused

流用価値が高いもの:

- snapshot serialize / deserialize
- autosave project list UI
- open project tab 管理
- patch diff/full encoding
- stale token / revision helper の考え方

流用価値が低い、または最終的に消すもの:

- role ベース制御
- assignment
- guest move preview
- join request
- master recovery flow
- guest/master layer patch 二段構成

## Recommended Internal Model

app.js 内では、最終的に以下の論理層に寄せる。

- sharedProjectState
  - 永続 project 単位
- localEditorState
  - 端末ごとの UI
- realtimeSyncState
  - channel / pending ops / ack / resync
- revisionState
  - latest revision / structure revision / stale guard
- membershipState
  - member list / invite / permissions

## Key Decision

「全員が自由に編集する」ことを優先するなら、現行の assignment 中心設計は延命しない。

維持すべきなのは以下だけ。

- snapshot 基盤
- patch エンコード
- stale guard の発想
- project list / autosave 接点

master authoritative room は、shared project へ移る際の過渡機能とみなす。

## Next Concrete Step

次の実装ステップは Phase 1 のみ行う。

内容:

- shared project id の新設
- 招待リンクから shared project を受け取る
- プロジェクト一覧に shared project を出す
- shared project を開いた時の読み込み口を追加する

この段階ではまだ編集の authoritative model は旧実装のままでもよい。
まず「room ではなく project を共有する」体験へ切り替える。
