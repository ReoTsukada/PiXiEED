# PiXiSYNC V1 実ブラウザ2者スモーク試験報告

実施日: 2026-07-30

対象は隔離 Supabase project `jyfafgyfwttpghtoepvo` のみとし、本番 project `kyyiuakrqomzlikfaire` には接続・変更していない。

## 実測結果

| 項目 | 結果 | 根拠 |
| --- | --- | --- |
| 通常プロジェクトで PiXiSYNC UI/RPC/Realtime が無効 | PASS | `http://localhost:8000/pixiedraw/` で panel は `hidden`、`data-pixisync-phase=disabled`、runtime は未生成。 |
| owner の既存プロジェクトから共有開始 | PASS | 隔離 owner ページで「共有を開始」を実行。 |
| revision 0 checkpoint 作成から active 化 | PASS | 一時的な `syncing`/描画lock 後、`active` と `data-pixisync-draw-locked=false` を確認。 |
| active 中の招待リンク発行 UI | PASS | owner の「招待リンクをコピー」が表示され、操作完了通知を確認。 |
| console error / 未処理 rejection | PASS（実測範囲） | error は未検出。Supabase の同一Browser context由来の GoTrue warning は発生。 |

## ブロックされた項目

この in-app Browser では別プロファイル/別contextを作れず、owner/editor を別タブにしても同一 origin の端末プロジェクトDBを共有した。従って、要求された独立した2ブラウザセッションとしては不適格である。

また、招待リンクの browser clipboard 読み取りが空文字となり、UIで発行されたtokenをparticipantタブへ安全に渡せなかった。よって以下は未検証であり、PASSとして扱わない。

- participant参加、URLからのtoken除去、checkpoint/tail/head/re-tail
- pen/eraser/同一pixel競合、pending巻戻し・確定・再適用
- Undo/Redoの競合安全性、復帰追随、offline/reconnect
- owner不在editor、退出後/archived後のRPC・Realtime・Storage拒否
- compact/モバイルhalf、operation replay/writer state/hash、最終revision/member状態

## 検証ハーネス修正

`/private/tmp/pixisync-v1-browser-smoke/server.mjs` の検証専用ハーネスで、callback版 `fs.readFile/stat` を `await` して全リクエストが404になる不具合を検出し、`node:fs/promises` に修正した。プロダクトファイルは変更していない。

## 最終ハッシュ

2者同期・operation replay・writer state の最終ハッシュは、上記ブロックにより未取得。

## 判定

本スモーク試験は **未完了**。自動試験および既存の隔離DB/Storage/RLS/Realtime lifecycle試験の成功を、独立2者の実ブラウザ試験成功に読み替えてはならない。

## クリーンアップ

- 隔離 project `jyfafgyfwttpghtoepvo` は削除済み。project一覧には本番 `kyyiuakrqomzlikfaire` のみが残ることを確認した。
- 削除済み project の REST endpoint は HTTP 410 `Project removed.` を返した。Supabaseの現行応答文言は `Project not found` ではなかったが、削除済みであることは確認できる。
- project削除により、同project内の試験DB/Storage/Realtimeデータも削除済み。ローカル検証サーバーも停止済み。
