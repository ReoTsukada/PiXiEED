---
document_id: PIXIEED-CROSS-TOOL-LIVE-EDIT-001
status: CANONICAL
version: 1.3.0
verified_at: 2026-08-10
---

# 共通Projectとツール間Live Edit {#cross-tool-live-edit}

## 共通Project

PiXiEEDraw2/PiXiEEDraw、PiXiAudio、PiXiGameは別ページ・別UIだが、同じPiXiEED Project、Account、Asset Graph、保存・権利基盤を使う。ProjectはDraw Asset、Audio Asset、Game Scene/Runtime、Links/Dependencies、Revisions、License/Provenance、Publishing stateを持ち、画像・音声を書き出して再アップロードさせない。PCは同一/別Tab・Window・Monitor、Mobileは原則同一Tabで安全に切替え、一方を閉じてもProjectと他Toolを壊さない。

共通Projectは空→一枚絵→Frame→Animation→Sprite/Tile/Map→Gameへ発展でき、Templateは初期設定だけで機能を制限しない。Draw中心UIはCanvas、Layer×Frame Cell、周辺Tool/Color/Selection。常設の別Animation Timelineを作らず、Sprite/Tileは文脈表示、Collider/Hit/Hurt GuideはDraw、実Collider/Rigidbody/PhysicsはGame。画面全体の横Scrollを禁止し、Mobile Timelineだけ折畳み・高さ変更、Layer名固定とする。

## 共有データと独立UI状態

Window間で共有するのは作品出力に関係する正式データのみ。Asset Revision、Frame ID、FPS、Timing Marker、Asset Graph、公開/License/Project settings、Scene使用Asset Versionを共有する。Zoom、Scroll、Tool、Selection、Panel、Timeline/Mixer高さ、FocusなどUI状態はWindowごとに独立し、PiXiSYNC等の共有正本へ同期しない。

各Assetは独立Revision、Project Revisionは各参照Revisionを持つ。Draw/Audio保存でRevisionを確定し、Gameは参照更新を検知する。保存中に他Toolを全面Lockせず、旧Revisionを保持しRollback可能にする。

## 編集・Preview・確定

```text
編集中              → Window内だけ
明示的な一時Preview  → 同一端末の別Windowへ共有可
保存済み             → 共通Projectの正式Revision
```

Preview表示側は「未保存のPiXiEEDraw/PiXiAudio Preview」を明示し、購入物、公開物、共同編集の確定状態、Export正本に使わない。再生中に新Revisionが届いても無条件に差し替えず、終了・停止・利用者の今すぐ更新で反映する。安全な変更はHot Reload候補とし、Texture領域/Animation metadataのみ更新、World state/参照ID/配置/ゲーム状態を維持、失敗時は直前Revisionへ戻す。

## GameからDrawへの直接編集

Game上のEntity、Sprite、UI画像、Tileから `PiXiEEDrawで編集` を実行すると、同一source Asset ID/Revisionの正しいCanvas、Frame、Layer、使用領域を開く。保存で新Asset Revisionを確定し、Gameは安全な境界で更新する。

PNG手動再Upload、無関係な新Asset複製、Game配置/Logicの損失、古いAsset URLの破壊を禁止する。Revision更新後も原則としてEntity ID、Scene位置、Scale、Rotation、Order、Component、Animation binding、Event/Logic、Asset ID、未変更のAnchor、Game側Collider/Physics、Save DataのEntity状態を維持する。寸法、Frame構成、Anchor等の互換性を壊す変更は影響を事前表示する。

## 複数使用箇所・派生

保存前に使用箇所を列挙し、すべて更新／この箇所だけ別Assetを選ばせる。派生時は元Assetを壊さず、新しいAsset ID、選択箇所だけの参照差替え、Provenance/Lineage、権利・License再評価を記録し、Copy-on-write/差分保存を優先する。

## 競合・Frame ID・Offline

Project名、FPS、Timecode、Marker、Asset名、使用Revision、公開設定など共有設定の変更はLast-write-winsで黙って上書きしない。現在の確定値と各変更を比較し、利用者または安全なMergeで解決する。

Audio Markerは表示連番ではなくStable Frame IDを参照する。Frame追加後もIDへ追従し、参照Frame削除時に近いFrameへ黙って移さず、近いFrameへ移動・Marker削除・Drawで確認を提示する。

片方のWindowがOfflineでも編集を継続し、再接続時は最後の確認済みRevision以降を取得、Local変更を検証、非競合Asset変更を送信、共有設定競合だけ解決する。不正または古すぎるCheckpointを正本にしない。

## 実ブラウザ完了条件

- Gameの使用画像から正しいAsset、Canvas、Frame、LayerをDrawで開ける。
- 1ドット修正が新Revisionとなり、Gameが検知し、配置・Logic・Save状態を維持する。
- 再Upload不要、使用箇所表示、1箇所だけの派生、旧Revisionへの復帰ができる。
- Previewと正式Revision、再生中安全更新、Window独立UIを区別できる。
- 共有設定の競合を黙って上書きせず、Offline復帰で収束する。
- 上記は静的読解だけで完了扱いせず、実Browserで検証する。
