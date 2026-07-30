# PiXiSYNC V1 リリース手順

この機能は、migration を適用しただけでは公開しない。旧 `shared_*` と併用・再有効化しない。

1. `20260730013606_pixisync_sparse_writer_state.sql` は、writer state、通常/guard RPC、canonical payload、guard監査、RLSを一つの公開単位として扱う。事前に `BEGIN` 内でmigrationと試験fixtureを実行し、正常系・0セルguard・冪等再送・`bigint`境界を確認して必ず `ROLLBACK` する。
2. 同じrollback試験で、canonical生成後、operation保存後、writer state更新後、guard監査保存後に一時triggerで例外を発生させる。各段階でroom head、operation、writer state、監査が呼出前と完全一致しなければ適用しない。公開RPCへfailpoint引数を追加してはならない。
3. ステージングへ全PiXiSYNC migrationを適用し、`anon`、viewer、失効member、他room member、直接DML、actor偽装、壊れたpayloadが全て拒否されることを確認する。
4. Supabase Dashboard の Realtime Settings で public channel access を無効化する。PiXiSYNC は `config.private: true` の `pixisync:room:<uuid>` のみを使う。
5. authenticated の二つの別ユーザー・別ブラウザで、順序逆転、重複再送、切断復帰、同一pixel競合、本人Undo/Redoを検証する。最終のpixel値とwriter revision hashが一致することがリリース条件である。
6. private Storage bucket `pixisync-checkpoints` とcheckpoint attestationを追加した後にのみ、checkpoint復元を有効化する。V1初期リリースでは操作ログの削除は禁止する。
7. 全ゲートに合格後、owner/editor最大2人の内部betaをfeature flagで段階的に有効化する。一般公開、構造変更、直接RGBA同期は別リリースとする。
