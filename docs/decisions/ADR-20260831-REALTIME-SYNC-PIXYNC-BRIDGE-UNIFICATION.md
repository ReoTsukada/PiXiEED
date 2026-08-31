# ADR-20260831: リアルタイム同期 — PiXYNC＝Bridge統合方針

## 位置づけ

これはOwner（アルタ様）本人による直接指示を記録したものであり、`00_START_HERE/LATEST_CANONICAL_DECISIONS.md` の優先順位で最上位（現在のユーザー指示）に属する。`docs/decisions/2026-08-31-site-direction-briefing.md`（Claude作成、`BRIEFING_ANALYSIS`＝Claude自身の分析にすぎない）第4節「リアルタイム同期」の内容は、本ADRの内容で更新・上書きされる。実装の詳細（プロトコル拡張、認証方式、リレー構築など）はCodexが担当する対象であり、本ADRは方向性と境界を確定するための文書である。

## 決定

1. **PiXiSYNC**（現行 `/pixiedraw/` の本番同期。`collab_v1` RPC・Supabase Realtime・`pixisync-checkpoints`）は今後廃止する。**触らない**。延命・拡張・新機能追加の対象にしない。廃止に伴う実際のコード削除・移行は別途明示的な承認を得てから行う。
2. **Cross-Tool Live Edit**（Draw2/Audio/Game間でProjectを同期する仕組み）の同期手段は、**PiXiEED Bridge を正本とする**。より良い方法が今後現れれば採用を検討するが、現時点でBridgeに一本化する。
3. **PiXiEED Bridge** は現在ローカルloopback限定のテスト段階だが、これを**実際にオンラインで複数人がリアルタイム同期できる**ものへ発展させる。
4. 上記を要約して **「PiXYNC＝Bridge」** とする。すなわち、pixiedraw2内部の同期抽象層である「PiXYNC」（`pixiedraw2/src/pixync/`）は、その一次的な transport 実装として PiXiEED Bridge を使うことを正式な方針とする。

## 用語の整理（今回の指示で明確になった区別）

現行ドキュメント群には「PiXiSYNC」と「PiXYNC」という似た名称が混在しており、今回の指示で意味が確定した。

| 名称 | 実体 | 状態 |
| --- | --- | --- |
| **PiXiSYNC** | 旧 `/pixiedraw/`（現行本番）の同期システム。`collab_v1`、Supabase Realtime、`pixisync-checkpoints`。 | 今後廃止。触らない。 |
| **PiXYNC** | `pixiedraw2/src/pixync/` にある、アプリ内部の同期抽象層（`PixyncOrderKeeper`／`PixyncDurableJournal`／`PixyncLazyAggregateSync`／`PixyncTransportAdapter`など）。transport実装を差し替え可能なポート設計。 | 継続。transportをBridgeにする。 |
| **PiXiEED Bridge** | 別リポジトリ（`pixieed-bridge`）のTauri 2 / Rustネイティブランタイム。`pixieed.realtime/1` プロトコルを話すWebSocketハブ。 | オンライン対応へ拡張する対象。 |

補足: `pixiedraw2/src/pixync/bridge-provider.ts` のヘッダコメントによれば、PiXYNCが使っていた旧Supabaseベースのprovider（`supabase-provider.ts`）は **2026-08-30時点で既に削除済み**で、PiXYNCは既にBridgeの `pixieed.realtime/1` エンベロープを話す `PixyncBridgeProvider` に切り替わっている（`docs/bridge-migration/pixisync-reuse-notes.md` およびBridgeリポジトリ側の「ADR-015」参照、とコメントにある）。つまり **「PiXYNC＝Bridge」は名称の統一というより、内部transportとしては既に実装済みの方針**であり、今回のOwner指示はこれを正式な決定として追認し、その先（本当のオンライン化）に進める、という位置づけになる。

なお、参照先の「Bridgeリポジトリ側のDECISIONS.md ADR-015」および `TASKS.md` は、接続済みの `pixieed-bridge` フォルダ内には実ファイルが見当たらなかった（`README.md` と `pixync-store.mjs` のコメントが言及するのみ）。`docs/bridge-migration/pixisync-reuse-notes.md` には、Bridge成果物の一部が別マシンパス（`/Users/tsukadareine/Documents/Codex/2026-08-30/.../outputs/pixieed-bridge`）に保持されている旨の記載があり、そちらに存在する可能性がある。Codexへの実装依頼時は、この参照切れを解消（該当ファイルの所在確認、または参照の除去）してから進めることを推奨する。

## 現状（既に実装されているもの）

- `pixiedraw2/src/pixync/bridge-provider.ts`: `PixyncTransportProvider` の実装として、Bridgeの `pixieed.realtime/1` を話す `PixyncBridgeProvider` が既に存在する。`hello`/`welcome`/`operation`/`ack`/`presence`/`snapshot.request`/`error`/`goodbye` を実装し、固定バックオフでの自動再接続を持つ。
- Bridge側 (`pixieed-bridge`): `PROTOCOL_SPEC.md` にトランスポート非依存の envelope 仕様（`pixieed.realtime/1`）、operation family ごとの競合ポリシー（`property-lww`／`pixel-region-merge`／`object-lock`／`asset-lock`／`manual-review`。**last-write-winsを万能フォールバックにしない**という明文規定あり）が定義済み。`TECHNICAL_DESIGN.md` にRust側のhub実装方針（sequence採番、`operationId`での重複排除、broadcast）が定義済み。
- 現状のBridge hubは **loopback限定**（`127.0.0.1:<ephemeral-port>`）。アカウント、cloud relay、TLS、remote authenticationは無し。`0.0.0.0` へのbindは明示的に禁止されている。

## 「オンライン化」に必要な追加要素（未実装のギャップ）

Bridge自身の `TECHNICAL_DESIGN.md` セクション7「セキュリティ計画」が、リモート対応前に必要な項目を既に列挙している。これはCodexへの実装スコープの土台になる。

1. **project単位の識別と短命Connectorトークン**（現状: 認証なし。全クライアントが一律 `role: "editor"` として扱われる — `bridge-provider.ts` に明記された既知の制限）
2. **明示的なユーザー同意とConnector権限**
3. **TLSまたは認証付きリレー**（現状: 平文WebSocket、loopbackのみ）
4. **リプレイ防止とメッセージサイズ上限**
5. **ファイル監視・取り込み用のpath allowlist**
6. **Connectorインストール・operationの監査ログ**

これに加え、`bridge-provider.ts` のコメントに明記された既知の制限として、再接続ロジック（固定バックオフ）がPixyncの `DURABLE-TRANSPORT` テストバッテリー（モックprovider向け）に対して実機ソケットで検証されていない、という点がある。オンライン化する場合はネットワーク断・再接続シナリオの実地検証が追加で必要になる。

**この一覧はCodexが実装計画に落とし込むための出発点であり、本ADRの時点ではどれも未着手・未承認である。** ネットワーク境界を開く（loopback→到達可能なリレー）作業は、Bridge自身のREADME/TECHNICAL_DESIGN.mdが明示的に「別のsecurity・service・legal gateで設計する」としている領域であり、認証方式・ホスティング方式（自前リレー／マネージドサービス／P2P等）を含む設計レビューを経てから着手すべきである。

## 再利用すべきPiXiSYNCの設計原則

`docs/bridge-migration/pixisync-reuse-notes.md`（2026-08-30付、旧PiXiSYNC実装削除時の引継ぎメモ）が、オンラインBridgeの設計に持ち込むべき原則を既に整理している。オンライン化の設計・実装時はこれを踏襲する。

- 正本revision（接続順ではなく共有ルームの正本が採番する）
- 冪等なoperation（`operationId`／payload hash／revisionで重複排除）
- 確定差分（canonical delta）の送信。途中経過の再計算はしない
- checkpoint + tail復元（ローカルjournalは復旧用、リモート正本の代替ではない）
- journal/hash境界（append-only、hash連鎖、重複検査）
- 競合・停止条件（欠番・hash不一致・古いgeneration・権限失効・切断で入力を止めcheckpoint+tailへ戻す）
- ライフサイクル順序: authenticate → member/role確認 → session初期化 → checkpoint復元 → tail追随 → private transport接続 → 再head確認
- 責務分離（domain operation／journal／order keeper／transport／provider／Connectorを別境界に保つ）

同メモは「そのまま移植してはいけないもの」も明記している: 旧`shared_projects`系のUI・状態管理、旧SupabaseのRPCをBridgeの正本仕様とみなすこと（署名・権限・schema・Storage・Realtimeは再設計・再検証する）、headless/syntheticテストのみでの本番受入れ格上げ、大きなmutable snapshotの直接共有、invite token/project key/認証情報をtopic名やログに含めること。

## 対象外・境界（触らないもの）

- 現行 `/pixiedraw/` のPiXiSYNC実装・データ・本番稼働は本ADRの対象外。「今後廃止する」は方針であり、実際の削除・移行・切替は別途明示的な承認を得てから行う。
- 本ADRはネットワーク露出（loopback→LAN/WAN到達可能化）そのものを承認するものではない。上記ギャップの解消と設計レビューが先。
- Marketplace/決済/権利周りのBridge統合（`MARKETPLACE_CONTRACT.md` にある将来スコープ）は本ADRの対象外。

## 追記(2026-08-31): 実装のズレを1件発見

`pixiedraw2/src/pixync/composition-root.ts`(「Authenticated production composition root for Draw2 PiXYNC」とコメントされた、実際にdraw2-entry.tsから呼ばれる本番配線)は、現時点でもまだ `PixyncSupabaseProvider`(`./supabase-provider.ts`)をimport・使用しており、`PixyncBridgeProvider` は未配線・未使用でした。つまり `bridge-provider.ts` のヘッダコメントが述べる「Supabaseから既に切替済み」は、providerの実装としては存在するが、実際の本番DIには反映されていません。

実害の範囲は限定的です。共有プロジェクト(room)ではない通常のローカル編集は `PIXYNC_ROOM_ID` に一致しないため、この経路自体を通らず影響を受けません。room形式のプロジェクトを開いた場合のみ `PixyncSupabaseProvider` 経由の認証・checkpoint取得を試み、失敗時は `awaiting-auth`/`OFFLINE` へ安全側にフォールバックし、ローカル編集は保持されます(強制エラー落ちはしない設計)。とはいえ、共有編集機能そのものは実質的に動作していない状態です。

**Codexへの最初の具体的な実装タスクとして明記します**: `composition-root.ts` の `PixyncSupabaseProvider` を `PixyncBridgeProvider` に差し替える配線変更。ただし、これは「オンライン化に必要な追加要素」(認証・TLS/認証付きリレー等)が揃うまでは、'ws://127.0.0.1:8790/bridge/ws' のようなloopback接続を試みて別の形で失敗するだけであり、真の解決にはならない点に注意してください。配線の差し替えと、オンライン化(認証・リレー)の設計は、Codex側で一体の計画として順序立てることを推奨します。

## 次のステップ・役割分担

- **Claude（サイト統括）**: 本ADRを含む戦略・整合性の管理。次は未コミットのsite-shell差分の確認、PLATFORM-450のステータス矛盾の解消提案など、既存ブリーフィング文書の残タスクを継続する。
- **Codex（ツール詳細実装）**: 上記「オンライン化に必要な追加要素」を実装計画（Work PackageまたはPLANS.md準拠の実行計画）に落とし込み、認証・トークン発行・リレー方式・TLS・再接続の実機検証を設計・実装する。着手前に `PLANS.md` の実行プロトコル（READY状態、allowed_write_globs、forbidden_actions、acceptance_idsの確定）に従うこと。
- 「ADR-015」参照切れの解消（該当ファイルの所在確認、または参照テキストの更新）はCodex側のタスクとして依頼する。
