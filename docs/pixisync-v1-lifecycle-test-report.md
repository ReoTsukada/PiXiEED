# PiXiSYNC V1 ライフサイクル実環境検証報告

## 結論

本番から完全分離した Supabase 検証プロジェクトで、PiXiSYNC V1 の共有開始、revision 0 checkpoint、招待・参加、open 時の tail／re-tail、private Broadcast／Presence、退出、最終 checkpoint、archive、Storage RLS を検証した。

最終の一続きの統合試験は PASS。operation ログ再生結果と sparse writer state も完全一致した。本番プロジェクト、本番データ、本番キー、共同編集 UI の公開設定には触れていない。

## 検証環境

| 項目 | 値 |
| --- | --- |
| project name | `pixisync-v1-lifecycle` |
| project ref | `sdovvduiwlhwfsohvwra` |
| region | `ap-northeast-1` (Tokyo) |
| PostgreSQL | `17.6.1.147` / engine 17 |
| 作成日時 | `2026-07-30T02:40:58.519653Z` |
| 最終検証日時 | `2026-07-30T04:38:51Z` (`2026-07-30 13:38:51 JST`) |
| 削除日時 | `2026-07-30T04:40:11Z` (`2026-07-30 13:40:11 JST`) |
| lifecycle migration SHA-256 | `985b2e0a82ff2a074b130cbccbde4259dff833e3410c89f0c5dff65b6123178d` |
| integration script SHA-256 | `e641a3ded40700e2c4eb6ac4208d5d5c96ca2e35aa53eb9eb37be39fc0d91f30` |

作成前の費用確認は月額 `$0`。検証用 URL、publishable key、Auth password、JWT、DB password はファイルへ保存せず、テストプロセス内だけで使用した。`.env` と production 環境変数は変更していない。

## 適用 migration

repository の候補 migration を次の順で適用した。

1. `pixisync_collab_v1_foundation`
2. `pixisync_collab_v1_access_rpc`
3. `pixisync_rate_window_explicit_deny`
4. `pixisync_foreign_key_indexes`
5. `pixisync_operation_targets`
6. `pixisync_server_codec_validation`
7. `pixisync_palette_zero_canonicalization`
8. `pixisync_restore_palette_range`
9. `pixisync_sparse_writer_state`
10. `pixisync_realtime_active_room_only`
11. `pixisync_guard_audit_actor_index`
12. `pixisync_session_lifecycle`

実環境で検出した問題の確認用に、検証プロジェクトへ次の小さい修正 migration も適用した。

- `pixisync_lifecycle_storage_helper_fix`
- `pixisync_lifecycle_qualified_rpc_fix`
- `pixisync_lifecycle_prepare_conflict_fix`
- `pixisync_lifecycle_attestation_conflict_fix`
- `pixisync_lifecycle_archive_generation_fix`
- `pixisync_lifecycle_fk_indexes`

これらは production 用 migration を分割するものではない。修正内容はすべて未適用の正本 `20260730033021_pixisync_session_lifecycle.sql` へ統合済みであり、本番では lifecycle migration 一件として適用する。

## 実環境で検出・修正した問題

1. 新規 Supabase プロジェクトの Realtime schema 初期化前は `realtime.messages` が存在せず、access migration が安全に rollback された。初回 WebSocket 接続で Realtime 初期化完了を確認してから再適用した。
2. Storage policy が呼ぶ `can_write_checkpoint_object` / `can_read_checkpoint_object` の実行権限まで revoke され、正規 owner の upload が拒否された。関数を `auth.uid()` 固定の一引数へ狭め、`authenticated` へ関数実行のみ許可した。
3. PL/pgSQL の `RETURNS TABLE` 出力名と未修飾列が衝突した。対象列をテーブル別名または constraint 名で明示した。
4. lifecycle 追加テーブルの `created_by` 外部キー二本に索引がなかった。FK 索引を正本 migration へ追加した。

いずれも production 未適用の段階で検出し、正本 migration に統合した。

## ライフサイクル・Storage・Realtime 統合試験

再利用可能な検証スクリプトは `scripts/test-pixisync-lifecycle-supabase.mjs`。環境値はプロセスへ一時注入し、出力へ秘密値を含めない。

最終 PASS room:

`dcc320ef-5ad2-4ee2-8868-37826a0efa27`

| 試験 | 結果 |
| --- | --- |
| Owner が共有開始、revision 0 metadata生成 | PASS |
| blob不存在で初期checkpoint確定拒否 | PASS |
| client指定の別roomパスへのupload拒否 | PASS |
| ownerによる正規固定パスupload | PASS |
| `x-upsert`を使った確定blob上書き拒否 | PASS |
| revision 0を確定してroomをactive化 | PASS |
| invite発行、Editor join、双方open | PASS |
| memberだけがcheckpointを取得 | PASS |
| download bytesとDB SHA-256一致 | PASS |
| private Broadcast ackと相手への到達 | PASS |
| private Presence track ack | PASS |
| nonmember／別topicのprivate join拒否 | PASS |
| open後のinitial tail取得 | PASS |
| open中にheadが増えた後のre-tail取得 | PASS |
| Participant leave後のRPC拒否 | PASS |
| Participant leave後のRealtime再join拒否 | PASS |
| Participant leave後のStorage読取り拒否 | PASS |
| checkpoint hash不一致attestation拒否 | PASS |
| owner＋editorの一致attestationでverified | PASS |
| verified head checkpointでarchive | PASS |
| archive後の新規operation拒否 | PASS |
| archive後の新規private join拒否 | PASS |
| archive時active memberの最終checkpoint読取り | PASS |
| revoked memberのarchive後読取り拒否 | PASS |

archive後の仕様は次で固定した。

- archive 時点で active な member は最終 checkpoint を復元用に読める。
- left / revoked / nonmember は読めない。
- 全員の新規 upload、上書き、RPC書込み、Realtime再joinは拒否する。
- 接続中channelの認可はキャッシュされるため、archive / leave時にクライアントが明示切断する。

## DB正本整合

最終 PASS room は次の状態になった。

- `status = archived`
- `head_revision = 2`
- `session_generation = 2`
- operation revision = `[1, 2]`
- writer cell 0 = value 7 / revision 1
- writer cell 1 = value 8 / revision 2
- final checkpoint revision = 2 / status = `verified`
- DB `encoded_bytes = 40`
- Storage metadata `size = 40`
- DB checkpoint SHA-256 = download bytes SHA-256

operation payloadをrevision順にdecodeして再構築し、writer stateとFULL JOIN比較した。

| 項目 | 値 |
| --- | --- |
| mismatch count | `0` |
| operation replay SHA-256 | `48450c5026520a882c11dda5a5d2b3ad32771c3fb81c8561bbd8c762be99d2c5` |
| writer state SHA-256 | `48450c5026520a882c11dda5a5d2b3ad32771c3fb81c8561bbd8c762be99d2c5` |
| final checkpoint SHA-256 | `c2ffe0a6d18f1b1e109bd24f5b48eedbdab4c91ddaf59ba159fb17fa64c806d3` |

## RLS・権限

実HTTP／WebSocketとDB ACLで次を確認した。

- `PUBLIC` と `anon` は lifecycle RPCを実行できない。
- `authenticated` だけに必要なRPC実行権限がある。
- RPC内部で owner / editor / active membership / room statusを再検証する。
- private内部テーブルはRLSを有効にし、browser roleへ直接権限を与えない。
- `session_initializations`、`checkpoint_uploads`、`room_invites` はRPC専用のため、意図的に直接RLS policyを持たせずdefault denyとする。
- Storageはowner insertとactive/archived member selectだけを許可し、update policyを持たない。

Security Advisor の `SECURITY DEFINER` 警告は、認証済みクライアントへ意図して公開する狭いRPCとRealtime認可関数に対するもの。対象はすべて空の `search_path` と内部認可を持つ。leaked-password-protection警告は削除前提の検証Auth fixtureに限定される。

Performance Advisor の lifecycle FK索引不足は修正後に0件。残る unused-index情報は使い捨て検証環境のtraffic不足によるため、削除判断には使用しない。

## ローカル回帰試験

- `node --check scripts/test-pixisync-lifecycle-supabase.mjs`: PASS
- `node scripts/test-pixisync-operation-codec.mjs`: PASS
- `node scripts/test-pixisync-two-client-e2e.mjs`: PASS
- `node scripts/test-pixisync-session-lifecycle-e2e.mjs`: PASS
- `node scripts/test-pixisync-minimal-ui.mjs`: PASS
- 対象ファイルの `git diff --check`: PASS

## 判定

isolated Supabase上の lifecycle、Storage RLS、private Realtime、checkpoint整合、operation replayは合格。

これは本番 migration 適用や共同編集UI公開の承認ではない。次工程は検証プロジェクト削除確認後、実ブラウザ2つのpointer／切断復帰スモーク試験である。本番適用判断はその後に分離する。

検証 project の削除後、project 一覧には production ref `kyyiuakrqomzlikfaire` だけが残り、`sdovvduiwlhwfsohvwra` の再取得は `Project not found` になった。検証専用 project と固定課金対象は残存していない。
