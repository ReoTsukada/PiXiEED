# PiXiSYNC V1 最終設計

PiXiSYNC は PiXiEEDraw のリアルタイム共同制作モードである。旧 shared/multi 実装は再有効化しない。独立した同期層として段階導入し、正本の操作順序・権限・描画一致を最優先する。

## 絶対不変条件

1. 正式な操作順序は Postgres が採番する room 内連番 `revision` のみで決める。クライアント時刻、到着順、Broadcast は順序の根拠にしない。
2. 通信する描画内容は、ブラシ軌跡ではなく確定済みピクセル差分だけである。受信側で補間・筆圧・乱数を再計算しない。
3. Broadcast は配送路であり正本ではない。正本はチェックポイントと追記専用操作ログである。
4. すべての確定操作は `operationId` で冪等であり、同じ操作を二度適用しない。
5. 同一開始状態と同一 revision 列から得られる、全クライアントのピクセル値と writer revision はビット単位で一致する。
6. 単独編集の UI 状態（ズーム、パン、ツール、選択、テーマ、個人パネル状態）は共有しない。
7. 共同 Undo/Redo は履歴を削除・巻戻しせず、本人の確定操作に対する条件付き新操作である。

## V1 の対象範囲

- 認証済み owner / editor / viewer
- 既存の一つの canvas、固定済み canvas サイズ、既存 frame/layer
- palette-indexed raster layer 上の通常ペンと消しゴム
- ピクセル差分、revision queue、再接続、個人Undo/Redo、private Broadcast / Presence

V1 では塗りつぶし、図形、選択移動、貼付、ミラー、直接RGBA、パレット変更、レイヤー/フレーム/リサイズを共同変更として受理しない。これらは構造revisionを持つ後続段階で追加する。

## SYNCFORGE の責任分離

- SYNC ARCHITECT: 本文書、不変条件、統合承認
- PIXEL GUARDIAN / DELTA SMITH: Canonical PixelPatch、dense/sparse 完全一致、codec試験
- ORDER KEEPER / REALTIME COURIER: revision queue、RPC確定、private channel、再接続
- ROOM SENTINEL / JOURNAL VAULT: `collab_v1`、RLS、RPC入力検証、checkpoint
- HISTORY WARDEN: 本人限定の条件付きUndo/Redo
- STORM RUNNER: 順序逆転、重複、切断、競合、二者以上の一致試験

## Canonical PixelPatch V1

外側の envelope は JSON、差分本体は base64 化した canonical bytes とする。

```text
PiXS | version:u8(1) | flags:u8(0) | count:varuint |
  repeat count: indexDelta:varuint | paletteValue:u8
```

- 差分は `Map<index, paletteValue>` に集約し、同一indexはストローク中の最終値だけを残す。
- `index` は昇順、重複なし。transparent は runtime palette value `0`、色は `1..254`。ランタイム内部のタイル保存値と混同しない。
- decoder は magic/version、最小varint、全byte消費、昇順、範囲、色、最大件数を厳格に検証する。
- `encode(decode(bytes)) === bytes` を必須とする。
- V1 は 1 chunk あたり最大 8,192 cells / 48 KiB raw bytes / 64 KiB base64。超過は `groupId`, `part`, `partCount` を付けて連続 chunk にする。
- dense/sparse とも `getRasterLayerRuntimeStoredIndex` / `setRasterLayerRuntimeStoredIndex` 相当のアクセサだけで適用し、`layer.indices[index]` を直接操作しない。

## 正本・DB・権限

旧 `shared_projects` 系は使わない。過去の直接DMLポリシーと巨大mutable snapshotをPiXiSYNCへ持ち込まない。

非公開 schema `collab_v1` を設ける。

- `rooms`: owner、head revision、structure epoch、active checkpoint
- `room_members`: owner/editor/viewer、加入・失効状態
- `operations`: immutable append-only、`(room_id, revision)` と `(room_id, operation_id)` を一意化
- `checkpoints`: private Storage blob のメタデータ、state hash、revision
- `checkpoint_attestations`: checkpoint hash の端末検証記録
- private rate/audit records

クライアントには table DML を一切許可しない。書込みは固定 `search_path` の SECURITY DEFINER RPC のみとし、PUBLICからEXECUTEを剥奪して authenticated にだけ必要最小限を付与する。

`pixisync_commit_operation` は room を `FOR UPDATE` し、認証、active membership、role、operation id、client id/seq、codec、hash、payload上限、target、index範囲、structure epoch、頻度を検証してから revision を採番する。重複operationは同じrevisionを返す。

## Realtime と復元

topic は `pixisync:room:<room-uuid>` とし、invite token や秘密のproject keyを含めない。クライアントは `private: true` を指定する。`realtime.messages` のRLSは membership helper により以下を分離する。

- SELECT broadcast/presence: active member
- INSERT broadcast/presence: owner/editor

Realtimeのpublic accessはDashboardで無効にする。確定操作は RPC のDB保存後にのみprivate Broadcastされる。クライアント任意のBroadcastはpreview専用で、正本、履歴、タイムラプスへ適用しない。

復元手順は次に固定する。

1. private channel を購読し、到着操作をqueueへ保留する。
2. 最新verified checkpointを取得する。
3. checkpoint revision以降を `ops_since` でページ取得し、revision順に適用する。
4. 再度 `ops_since` で隙間を埋め、queueをflushする。
5. IndexedDBに残る未ACK本人操作を同じoperationIdで再送する。

欠番、hash不一致、同revisionで異なるhash、queue上限超過は入力を停止し、checkpoint+tailの完全復元へ移行する。

## Order Keeper

正式適用は `confirmedRevision + 1` のみである。高いrevisionを先に受けても保留し、2秒以内に `ops_since` を取得する。RPC応答、Broadcast、fetchは `operationId + payloadHash + revision` で一つに畳む。不一致は復元する。

## 個人Undo / Redo

Undo対象は本人が確定した、最新かつ未Undoの pixel operationだけである。過去ログを削除しない。

各セルに `lastWriterRevision` stampを持たせ、checkpointにも含める。

DBのスパースwriter stateは `(roomId, canvasId, frameId, layerId, pixelIndex)` を主キーとし、`writerRevision` と `pixelValue` を保持する。透明へ戻ったセルもV1では削除しない。

- Undo: `conditional_undo` を新revisionとして追加する。各cellは `currentStamp === sourceRevision` の時だけ before valueへ戻し、適用したcellのstampをundo revisionにする。
- Redo: `conditional_redo` を新revisionとして追加する。各cellは `currentStamp === undoRevision` の時だけ元のafter valueへ戻す。
- 他者が後から上書きしたcellは、Undo/Redoとも必ずskipする。
- RPCは source operation のactorが `auth.uid()` と一致することを強制する。
- 本人の新規確定操作後はその本人のRedo stackを破棄する。構造UndoはV1では提供しない。

### Guard付きUndo / Redoの確定規則

通常の `pixel-write` はローカル即時反映後にRPCへ送る。一方、Undo / Redoは楽観反映しない。要求には各セルの `expectedWriterRevision` と対象operation IDを含め、RPCがwriter stateを固定順でロックして一致セルだけを選ぶ。

DBの確定operation payloadには、要求ではなく実際に適用されたセルだけを保存する。要求数・適用数・skip数・target operation IDは監査metadataとして保存する。0セル適用もrevisionを消費するimmutable operationとして保存し、再送時は同じ結果を返す。Redoのguardは元operation revisionではなく、直前のUndoが実際に書いたrevisionを使う。

通常要求とguard要求はcount 1以上を必須とする。guard確定結果だけはcount 0のcanonical payloadを許可し、要求payloadとしての空操作は拒否する。

## 共有セッションのライフサイクル

通常projectと共同編集sessionを分離する。共有開始は、ownerが現在のproject状態をrevision 0のprivate checkpointとして保存し、`roomId`、checkpoint revision、owner、session statusをproject collaboration metadataへ結び付ける。共有開始前のローカルUndo/Redoをcollab operationへ移植しない。

参加は、期限・使用回数・失効状態・roleを持つinviteを介し、認証済みユーザーだけがjoin RPCでmemberになる。open時は checkpoint → operation tail → private Realtime接続 → tail再取得 の順で正本へ追いつく。IndexedDBは起動用キャッシュであり正本ではない。

切断時は新規描画を一時停止し、再接続・tail追随後にだけ再開する。退出はmembershipを失効させchannelを離脱する。owner終了はroomをclosedにし、新規operationを拒否して最終checkpointを固定する。過去operationは削除しない。

## Checkpoint / hash

checkpointは 200 operations、30秒idle、構造操作、最後の参加者退出、owner保存でcandidateを作る。blobはprivate Storageへ置き、metadataだけをDBへ保存する。active checkpointは二つの異なるactive deviceのattestation、または一人部屋でのowner verificationを必要とする。最新3つのverified checkpointと完全な操作tailを保持し、V1ではoperationsをpruneしない。

## 検証ゲート

実装は次のゲートを満たしたものだけ次段階へ進める。

1. codec roundtrip / 不正payload拒否 / dense-sparse hash一致
2. revision順序逆転、重複、再送、欠番回収、再接続
3. 同一pixel競合のLWW、本人Undo/Redoの他者上書き保護
4. viewer拒否、foreign target拒否、payload/rate制限、revoked member遮断
5. 2 browser contextでの長時間描画、reload後のcheckpoint+tail復元、最終pixel+stamp hash一致

## 2026-07-30 確定履歴ブリッジ実装状況

通常ペン／消しゴムの送信入口は `commitHistory()` が finalized entry を `history.past` へ追加した直後の `onCommittedHistoryEntry` 一箇所へ接続した。pointermove中のbrush stamp、補間点、previewは送信しない。

`pixisync-collaboration-controller-utils.js` は次を担当する。

- sessionが`active`かつ`canDraw()`の時だけpen/eraserを受理する
- finalized pixel-patch／raster-tile-patchを最大8,192 cellのcanonical mutationへ変換する
- 通常描画をpending optimisticとしてRPCへ渡す
- remote確定がpendingより先着した場合は、pendingを逆順rollbackし、確定revisionを共通pixel setterで適用後、残pendingを再合成する
- remote競合がない自己確定はpixelを再書込みせず、writer stampだけを確定revisionへ昇格する
- guard付きUndo/Redoのcanonical applied payloadは楽観適用せず、確定後だけ共通pixel setterへ通す
- pending数、confirmed operation ID、applied revision、target別writer stampを診断snapshotとして公開する

app側runtimeはまだ未設定であり、通常の単独編集動作は変えない。共有開始・参加・open lifecycleが完成するまで一般利用からPiXiSYNC controllerを有効化しない。

`scripts/test-pixisync-two-client-e2e.mjs` は、二つの独立client、room連番revision、canonical operation log、sparse writer stateを持つheadless authoritative serverで、pen、eraser、同一cell競合、逆順受信、同一operation ID再送、Broadcast欠落、再接続gate、Undo競合、Redo競合、全hash一致を検証する。

このheadless E2Eと、分離Supabase projectで既に完了した実DB／private WebSocket検証は別の証拠である。次のlifecycle E2Eでは両者を一つの実環境試験へ統合する。

## 2026-07-30 Session lifecycle headless E2E

共有開始は、Storage uploadをDB transactionの一部と誤認しない。未適用migration
`20260730033021_pixisync_session_lifecycle.sql` は次の二段階を採用する。

1. `pixisync_begin_session`でroomを`initializing`として予約し、owner membershipを作る
2. revision 0 checkpointをprivate Storageへuploadし、`pixisync_activate_initial_checkpoint`がmetadataとactive化を同一DB transactionで確定する

`initializing`中はinvite、join、open、commit、private Realtimeをすべて拒否する。通常projectのUndo/Redo履歴はcheckpoint 0より前の個人履歴として維持し、operation logへ移植しない。

archive後は新規checkpoint書込み、既存object上書き、operation commit、Realtime再購読を拒否する。一方、archive時点で失効していないmemberには最終状態の復元用checkpoint読取りだけを許可する。退出・権限失効済みmemberとnonmemberにはarchive後もStorageを公開しない。

同migrationはhashだけを保存するinvite、join/open/leave/archive RPC、checkpoint candidate・attestation、room generationを追加する。archiveはverifiedなhead checkpointを必須とし、roomを`archived`へ移行してgenerationを増やす。archive RPCはinvite rowをlock/updateせず、join側がroom statusを確認して拒否することで、invite→roomとroom→inviteのlock循環を作らない。

`pixisync-session-state.js` のactive gateは次をすべて必須とする。

- room/memberがactiveでeditor権限を持つ
- topicが正確に`pixisync:room:<roomId>`で`private: true`
- checkpoint復元、initial tail、authoritative head、接続後re-tailが完了
- re-tail revisionがserver headと完全一致
- server session generationと非同期event generationが一致
- pending gapがなく、pending operation数が上限未満

revision後退、public/別topic購読、古いepoch/generation、socket切断、room archive、membership revokeは直ちに描画を停止する。archive/revoke時はpendingを隔離し、Presenceとchannelを明示的に終了する。

`scripts/test-pixisync-session-lifecycle-e2e.mjs` は、owner begin、checkpoint 0、invite、participant join、checkpoint+tail+re-tail、二者描画、切断停止、stale callback拒否、再接続、退出後RPC/Realtime拒否、verified head archive、archive後の全面拒否を決定論的authorityで検証する。

この試験はライフサイクル状態機械とDB契約のheadless検証である。実Supabase Storage/RPC/private WebSocketと二つの実ブラウザを組み合わせる公開前smoke gateは、最小共有UI接続後に別途実施する。

## 2026-07-30 最小共有UI

最小UIはファイルパネル内のPiXiSYNC cardへ限定し、共有開始、招待リンクコピー、参加者・接続状態、共有プロジェクトopen、退出、共同編集終了だけを表示する。旧`shared`／`multi` UIは再利用せず、Presence cursor、chat、細分化権限、公開参加を追加しない。

`pixisync-minimal-ui-utils.js` はsession stateのsnapshotと`canDraw()`を表示へ反映するだけで、独自の描画許可判定を持たない。実際のpointer入力は引き続きcollaboration controllerのsession gateが拒否する。UIは明示的に`uiEnabled: true`を渡した隔離runtimeでだけ表示され、通常projectと現行公開buildではhiddenのままとする。

状態変更はsession stateの`subscribe()`でUIへ通知する。creating／joining／syncing／reconnecting／leaving／closing／archivedではcanvas上に軽量なlock statusを表示し、active editorで`session.canDraw() === true`になった場合だけ消す。local通常projectはPiXiSYNC runtime未接続のためlockしない。

各UI actionは一つのin-flight処理だけを許し、共有開始中の二重clickとjoin再実行を拒否する。archiveはpending operationが1件以上ある間disabledとする。招待tokenはlocalStorage／IndexedDBへ保存せず、URLから取得した直後、join RPCより先に`history.replaceState`でquery/hashから除去する。招待リンクコピー時も返却値はclipboard書込み後に保持しない。

compactな右railとmobile half drawerではPiXiSYNC card全体を非表示にし、既存のFile quick actionsの高さとscroll禁止を維持する。full/open時だけ参加者と全actionを表示する。

`scripts/test-pixisync-minimal-ui.mjs` はfeature gate、状態表示、二重click、owner/editor action分離、pending中archive禁止、reconnecting lock、招待tokenのURL先行除去、通常projectでのhidden回帰を検証する。
