# PiXiSYNC V1 同時実行・RLS・Realtime 検証報告

## 結論

PiXiSYNC V1 の検証専用 Supabase プロジェクトで、独立した HTTP 接続 2 本による同時トランザクション、guard 付き Undo/Redo、冪等性、ロールバック、lock timeout、RLS、private Broadcast／Presence、DB ログ再生を検証した。

対象試験は合格した。production プロジェクトには migration、テストデータ、API キー、クライアント接続のいずれも適用していない。共同編集 UI も有効化していない。

## 検証環境

| 項目 | 値 |
| --- | --- |
| project name | `pixisync-v1-concurrency` |
| project ref | `anwzsvkvciakeypknihv` |
| region | `ap-northeast-1` (Tokyo) |
| PostgreSQL | `17.6.1.147` / engine 17 |
| 作成日時 | `2026-07-30T00:28:21.883885Z` |
| 削除日時 | `2026-07-30T03:06:10Z` (`2026-07-30 12:06:10 JST`) |
| schema SHA-256 | `71c75e4ba314dc7cfaceab5c40250cc3987829e7f0190ae27c67ab94e852a482` |

検証用 URL、publishable key、JWT、DB 接続情報はファイルへ保存せず、テストプロセス内だけで使用した。`.env` および production 環境変数の上書きは行っていない。

## 適用 migration

検証プロジェクトには次を順番に適用した。

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
11. `pixisync_realtime_authorization_helper`
12. `pixisync_guard_audit_actor_index`

同時実行試験にだけ使用した `public.pixisync_test_commit_control` は、証跡取得後に revoke と drop を行った。最終 schema で同関数が 0 件であることを確認した。
検証 project には最後に test-only migration `remove_pixisync_test_commit_control` を適用した。この cleanup は repository の production migration には含めていない。

10 と 11 は実 WebSocket 診断のため検証 project 上では段階的に適用した。production 未適用の repository 候補では `20260730025332_pixisync_realtime_active_room_only.sql` へ統合し、認可関数と policy が同一 transaction で切り替わるようにした。

## 実接続 2 本の競合試験

Supabase ツールの SQL 呼び出しは直列化されるため、競合証明には数えなかった。合格判定には、別々の JWT と独立した HTTP/PostgREST 接続から同時に RPC を開始し、DB ロック待機を実測した結果だけを使用した。

| 試験 | 結果 | 確定状態 |
| --- | --- | --- |
| 通常描画 × 通常描画 | PASS | 約 1.9 秒／1.8 秒。revision 1, 2 |
| 通常描画 × guard Undo | PASS | 約 1.4 秒／1.3 秒。直列化後 revision 2, 3 |
| Undo × Undo | PASS | 先行 Undo は 1 セル適用、後行 Undo は 0 適用・1 skip |
| Undo × Redo | PASS | Redo 確定後の競合 Undo は 0 適用・1 skip |
| 同一 operation ID の同時再送 | PASS | `committed` と `duplicate` が同じ revision 1。operation は 1 件 |
| 複数 pixel の逆順競合 | PASS | 両操作とも canonical な昇順 payload、revision 1, 2 |
| 待機中に相手を ROLLBACK | PASS | 失敗側は `P0001`、成功側だけ revision 1 |
| lock timeout | PASS | 待機側は `55P03`、保持側だけ revision 1 |

lock timeout は約 0.67 秒で発生し、ロック保持側は約 2.7 秒後に commit した。したがって、単一接続内の疑似競合ではなく、実際の DB ロック待機を通過している。

## operation ログ再生と writer state

room 11〜18 の確定 payload を `collab_v1.decode_pixel_patch(..., flags = 0, allow_empty = true)` で revision 順に再生し、各 target/cell の最終値と最終 writer revision を `writer_state` と FULL JOIN で比較した。

全 room で次を満たした。

- `head_revision = operation_count`
- revision は 1 から head まで重複・欠番なし
- payload SHA-256 が保存値と一致
- `requested = applied + skipped`
- guard operation と audit が 1 対 1
- replay と writer state の不一致 0 件
- replay hash と writer-state hash が完全一致

| room suffix | head | replay / writer SHA-256 |
| --- | ---: | --- |
| 11 | 2 | `d46c424cbebb9f3208bf73c8d774832766279ffcf296b9394018deefa0473180` |
| 12 | 3 | `b5a106b3905d9e2dc0cc2bacc79c9b805283f7b2bb9ae5dd901b349968595d6e` |
| 13 | 3 | `bfa0f183acd003e5ed073b5776b33ca0bebb4b422012ec11952597405e47f47b` |
| 14 | 4 | `cd118ee303531448a5513d56dcbee897e7d6d3a363e46901d8dfec014e3a3678` |
| 15 | 1 | `d595914f727b21b2726ed33a1fea945eaf64d6f3fb4ec6a5b32aeeab99241506` |
| 16 | 2 | `cc7db4a4d73bd09ea3b5907a94c914a205fd1b33a48e9e4db5b4727945de0c60` |
| 17 | 1 | `f4a023cd3f407c3c02ad9bf55ba5d43630d9eea6f492cceb7ad6cb996e776343` |
| 18 | 1 | `d595914f727b21b2726ed33a1fea945eaf64d6f3fb4ec6a5b32aeeab99241506` |

0 セル Undo は canonical empty payload `50695853010000` として確定され、同じ operation ID の再送結果も維持された。強制 rollback と timeout 側の operation、writer state、audit は残っていない。

## RLS・権限

実ロール切替と rollback 付き SQL 試験で次を確認した。

- `anon` と `PUBLIC` は PiXiSYNC RPC を実行できない
- `authenticated` の active member だけが対象 RPC を実行できる
- nonmember と revoked member の operation 取得は `not_active_member`
- archived room の commit は `room_not_active`
- `collab_v1` テーブルは browser role に直接開放していない
- writer state、guard audit、rate window は直接読み書きできない
- RPC は `SECURITY DEFINER` かつ `search_path = ''`、内部で `auth.uid()`、membership、role、room status を検査する

## private Broadcast／Presence

実 JWT と WebSocket で確認した。

| 試験 | 結果 |
| --- | --- |
| active owner / editor の private join | `ok` / `ok` |
| owner の Broadcast ack | `ok` |
| editor への Broadcast 到達 | PASS |
| Presence track ack | `ok` |
| nonmember join | `error` |
| `pixisync:room:<uuid>` 以外の topic | `error` |
| archived room join | `error` |
| revoked member join | `error` |
| Broadcast 欠落想定から DB tail 回収 | HTTP 200、revision 1, 2 |

当初の policy は archived room を検査しておらず、追加修正後も private schema のテーブルを Realtime 接続 role が直接参照できず active member まで拒否された。テーブル権限を広げず、現在の `auth.uid()` と完全一致 topic だけを判定する `public.pixisync_can_access_realtime_topic` に認可を集約して解決した。

Realtime 認可は接続中にキャッシュされるため、room archive／退出の UI フローでは channel の明示切断も必須とする。DB policy は新規 join、再接続、token refresh を拒否する。

## Advisor

Security Advisor の `SECURITY DEFINER` 警告は、認証済みクライアントへ意図して公開する狭い RPC と Realtime 認可関数に対するものだった。すべて `search_path = ''` と内部認可を持つ。検証用プロジェクトの leaked-password-protection 警告は、使い捨て Auth fixture に限定される。

Performance Advisor が検出した `operation_guard_audits.actor_user_id` の未索引 FK は、追加 migration で解消した。残る unused-index 情報はテスト traffic が少ないことによるため、この段階では削除していない。

## 発生した問題と対処

- Supabase branch は Pro 前提だったため作成せず、費用 0 の完全分離 project を作成した。
- 初回は Realtime の基盤 migration 前で `realtime.messages` が存在せず access migration が rollback された。公式 Realtime の初期化完了後に migration を最初から順に適用した。
- Auth fixture の初期作成では signup domain と直接 fixture token の問題があり、検証 project 内だけの確定済み Auth fixtureへ切り替えた。
- Supabase SQL ツールの並列呼び出しは直列化されたため競合証明から除外し、独立 HTTP 接続へ切り替えた。
- Realtime の room status 漏れと private-table 直接参照を実 WebSocket 試験で検出し、追加 migration 2 本で修正した。
- テスト専用 lock/rollback wrapper は検証後に完全削除した。

## ローカル検証

- `node scripts/test-pixisync-operation-codec.mjs`: PASS
- PiXiSYNC JavaScript 7 module の `node --check`: PASS
- `git diff --check`: PASS

codec、Order Keeper、Realtime RPC adapter、PixelMutation bridge、session state のヘッドレス試験がすべて通過した。

## 判定

DB concurrency、guard、冪等性、rollback、RLS、private Realtime、DB replay の検証ゲートは合格。

これは production migration の適用承認や共同編集 UI の公開承認ではない。次工程は、削除済み検証環境の証跡を正本として、確定 PixelMutation bridge を通常ペン／消しゴムへ限定接続し、二者ヘッドレス E2E を継続すること。

検証 project の削除後、project 一覧には production ref `kyyiuakrqomzlikfaire` だけが残り、`anwzsvkvciakeypknihv` の再取得が失敗することを確認した。検証用 project は残存しておらず、その課金対象も停止している。
