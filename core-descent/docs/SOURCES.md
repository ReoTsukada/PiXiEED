# 技術上の参照資料

確認日：2026-11-17。ゲームの能力・数値・経済案はこのプロジェクト用の設計であり、下記資料のゲーム仕様ではありません。

- MDN, requestAnimationFrame：タイムスタンプで経過時間を計算し、表示更新とシミュレーションを分ける。
  https://developer.mozilla.org/ja/docs/Web/API/Window/requestAnimationFrame
- MDN, Page Visibility API：非表示時の更新・一時停止を考慮する。
  https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
- MDN, localStorage：file URLの保存挙動は規定されず、ブラウザーにより異なる。例外と書き出し手段を用意。
  https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
- Node.js, Test runner：標準のnode --testを使用。
  https://nodejs.org/api/test.html
- PostgreSQL, Explicit locking：本番取引で行ロックを使用する設計の根拠。
  https://www.postgresql.org/docs/current/explicit-locking.html
- PostgreSQL, Transaction isolation：分離レベルとトランザクション再試行の検討。
  https://www.postgresql.org/docs/current/transaction-iso.html
- OpenAI, Iterating Development Workflows with Codex：AGENTS.mdと工程/合格条件を分けた開発用手順。
  https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex

数字の160解・80反転クラス・経路係数は引用した外部知識ではなく、tools/puzzle-audit.mjsおよびtests/core.test.mjsでこの実装が計算した値です。
