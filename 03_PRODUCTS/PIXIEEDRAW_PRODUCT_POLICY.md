---
document_id: PIXIEEDRAW-PRODUCT-POLICY-INDEX-001
status: CANONICAL
version: 2.0.0
verified_at: 2026-08-10
derived_decisions:
  - PIXIEED-EDITOR-AD-POLICY-001 v1.8.0
  - PIXIEED-MOBILE-UI-AND-AD-SAFE-AREA-001 v1.7.0
  - PIXIEED-DRAW-NAME-AND-COLLIDER-GUIDE-001 v1.6.0
  - PIXIEED-NAMING-AND-PXD-FORMAT-001 v1.5.0
  - PIXIEED-DEDUP-AND-GAME-PHYSICS-001 v1.4.0
---

# PiXiEEDraw 製品ポリシー {#pixieedraw-policy}

## 名称と切替

開発中の第2世代は `PiXiEEDraw2`。`PXD2`を製品名・画面名・正式略称にしない。完成・移行検証後の一般向け名称は `PiXiEEDraw` とし、既存正式URLを引き継ぐ。既存版は新世代が完成するまで維持する。

廃止・切替には、主要Project読込、保存欠損なし、Layer/Frame/Palette/Transparency/Animation一致、自動保存・復旧・Undo/Redo・出力安定、PC/スマホ/主要Browser受入、既存URL/Embed維持、Hash/視覚比較、Rollback、段階公開・監視、所有者承認を要求する。切替後も既存User、Project、公開作品、購入権、投稿リンクを維持し、旧データを即削除せず、旧実装を監査・移行・緊急Rollback用に保管し、旧URLを404にしない。

内部IDは表示名と分離し、`product_family_id: pixiedraw`、generation、Project ID、Asset ID、Revision ID、公開URL IDを名称変更で再生成しない。

## 共通PXD

PiXiEEDraw、PiXiAudio、PiXiGame、Mixed Project、素材、販売/納品、Backup、Offline handoffは小文字`.pxd`を共通編集形式とする。`PXD`は形式名で、製品名ではない。Manifestで `format_id`、version、package_kind、project_id、primary_domain、required_tools、assets、dependency_lock、license_snapshot、provenance、content_hashesを識別し、Draw/Audio/Game/Mixedに案内する。複合PXDを勝手に一素材へ切り離さない。

PXDは単なるPNG/ZIP/JSONの別名ではなく、Project/Asset/Revision ID、Asset Graph、Layer/Frame/Palette、Audio/MIDI、Scene/Component/Script参照、Dependency Lock、Hash、Provenance/Lineage、License、Version、Blob/外部検証情報を保持する編集可能Package。オンライン正本はMemory + IndexedDB/OPFS、Cloud PostgreSQL + Object Storage + Revision、PXDは選択Revisionから再現可能にする。

物理形式はManifest + Content Addressed Blobコンテナ候補。Canonical HashはFile順序・圧縮日時に依存せず、展開安全、Path Traversal/圧縮爆弾/サイズ個数制限、Manifest先行検証、未知セクション保持、部分Index、破損データで既存正本を上書きしない。Portable、Linked、Hybridを持ち、販売/納品/BackupはPortableまたは固定済みHybrid、購入者がアクセスできない私有URLだけを販売Packageへ入れない。

最終出力はPNG/GIF/WebP/APNG/sprite sheet、WAV/FLAC/OGG/MP3、Web/Platform Build、MP4/WebM等の標準形式を維持する。PXDに改名しない。MIMEは `application/vnd.pixieed.pxd` 候補、拡張子だけで安全判定しない。Readerはversion→Migration→未知機能警告→安全Preview→元ファイル非変更→新Revision/PXD保存とし、旧データは読取保持・変換・内容検証・新PXD・対応関係記録を行う。

## Collider Guideと物理の責務

Drawが編集できるのはPivot/Anchor、足元、Body/Hitbox/Hurtbox/Interaction Guide、Frame別Guide、Tile Collision Guide、名前付き領域、形状/位置/サイズ/用途。PiXiGameが正本とするのは実Collider、Rigidbody、Layer/Mask、Material、Trigger、Joint、Solver、Physics、Navigation、Game logic。

Guideは画像に付属する初期候補、Game ComponentがRuntimeの最終設定。Guideから独立Colliderを初期生成できるが、生成元Revisionを記録し、Guide更新でGame Colliderを自動上書きしない。標準は現状維持で、更新・比較・別Collider追加を提示する。

1ドットの画像RevisionだけならSprite表示を更新し、Guide未変更ならCollider/Physicsを維持する。Canvas寸法、切出し、Frame構成/ID、Pivot/Anchor、Guide形状、Tile寸法、大幅な透明領域変化は影響表示と確認を要求する。同じAssetを複数Entityが使っても実ColliderはEntityごとに独立できる。

Gameからは対象の同一source Asset ID、Revision、Canvas、Frame、Layerへ `PiXiEEDrawで編集` で開き、DrawからはGame使用箇所を確認する。Gameの実ColliderはDrawへ読取専用Overlay（Guide=青、実Collider=黄）として表示できるが、Drawで直接変更しない。Tile画像/Grid/Tile ID/Guide候補はDraw、TileMap/実Collision/通行/Layer/Material/Trigger/NavigationはGame。Guideは販売時に画像のみ、Animation付き、Guide付きから選べ、動作保証ではない。

## Mobile UI

現行PiXiEEDrawの良い操作（Canvas中心、下部から主要操作、Layer×Frame、即時Tool切替、画面内完結）を実機比較で基準にするが、単純縮小や無批判なコピーはしない。高度なCollider、Tile、Sprite、Export、公開/販売、Revision、依存、使用箇所、Audio参照、Palette、Extensionは必要な選択・作業・次操作に関係するときだけ表示する。

縦画面は `Safe Area → Optional Ad Slot → App Bar → Canvas → Context Controls → Layer×Frame → Primary Tools → Bottom Safe Area`。App Barは戻る、Project/Canvas、保存、Undo/Redo、その他。Canvasは最大面積、指Pan/Zoom、Penと指の分離、拡大補助、画面全体横Scroll禁止。Timelineは内部だけ横Scroll、Layer名固定、高さDrag、Minimize、Frame自動Reveal、長押しCell Menu、複数Cell選択、Scroll中誤編集防止。Primary Toolは親指範囲、頻用優先、並替え可能、勝手な頻繁変更をしない。

初回は最小操作、高度機能は説明と戻り道、破壊操作はUndo/確認、Modeと特殊Guide終了を明示し、Bottom SheetはSwipeで閉じ、PC/スマホの概念名・データ構造を変えない。Responsive判定はViewport、Orientation、Safe Insets、Touch/Pen/Mouse、Keyboard、Hover、DPR、Memory tier、Foldable segment、Visual Viewportを使い、手動Overrideを許可する。Panel、Timeline高さ、Tool順、Scale、左右利き、Zoom/Scroll、Context Panelは端末/Windowごとに保存し、共有正本にしない。

## 広告とSafe Area

アクティブな制作画面（Canvas、Timeline、Tool、Undo/Redo、Save、Guide、Tile、録音、Sync、集中Mode、Export設定）は広告なし。広告はHome、Project一覧、公開、Market、SNS、検索、Help、Tool起動前、主要操作完了後のResult面に限る。Canvas、Timeline、Tool間、Undo/Save付近、Guide、録音中、Game Debug中へ置かない。

初期契約は `editor_ad_enabled: false`、`editor_ad_runtime_loaded: false`、`editor_ad_slot_height: 0`、`editor_ad_slot_reserved_in_layout_contract: true`。将来の有効化には新決定、性能・誤操作試験、Policy確認を要求し、広告をCanvas/App Barへ重ねない。CSSのSafe Insets、Visual Viewportに追従する。

Slotは未取得時に空白を残さず、予約高さを事前確定し、Layout Shiftを継続させない。Safe Area/Notch/Home Indicator/Dynamic Islandを避け、Landscape、小画面、Keyboard、Fullscreen、集中、Pen/Drag/再生/録音中は非表示または新規差込なし。広告をSave/Export/Closeに見せず、誤タップを誘発しない。Paid/ad-freeは0pxにできる。

広告RuntimeとEditor Canvas/Worker/Audio/Save/Syncを分離し、広告失敗でEditor停止・再初期化・データ変更を起こさず、Cross-origin isolation等を壊さない。制作面の広告通信・Bundle混入を禁止し、公開面の広告障害をEditorへ波及させない。

## 重複排除

判定順は Package ID → Asset ID + Revision ID → Byte完全一致 → 正規化Content → 類似 → 別データ。Level 1〜4のみ安全条件で自動再利用、類似は警告・比較だけで自動統合/削除/権利移転/販売停止しない。正規化で日時、File名、ZIP順序/圧縮、端末Path、Cache/Preview時刻、Session IDを除外するが、Pixel、Frame順/時間、Layer、意味あるPalette、PCM、MIDI、Mixer、Scene/Logic、Dependency Revision、権利情報は除外しない。

ManifestはStable Package/Project/Asset/Revision/Release ID、Blob Hash、Canonical Content Hash、形式別Semantic Hash、署名、License、Dependencyを持ち、IDだけで上書きしない。Content Addressed Storageで同一Blobを再利用するが、Owner、Purchase、License、Contract、Lineage、Release、納品証拠、監査記録は別管理する。同一Assetを複数Entityで使ってもBlobを複製せず、Copy-on-writeで独立編集する。

読み込みUIは既存使用、別名参照、独立複製、差分/権利比較、Cancelを提示し、標準は既存再利用。同じID・異なるHashは自動上書き禁止で、差分・正当Revision・別Asset・Cancelを提示。類似は審査補助に留める。販売Releaseは選択Revisionから不変生成し、購入済みを後続編集で差し替えず、新Revision/Releaseとする。削除は参照数確認、使用中Blobを消さず、GCは監査可能な猶予後に行う。

## 完成条件

- 名称切替が既存URL/ID/権利/データを壊さず、受入・監視・Rollback後だけ旧版を置換する。
- PXDでDraw/Audio/Game/MixedをManifest判別し、安全にMigration・Preview・再生成できる。
- Guideから独立Colliderを生成でき、Guide更新・1ドット修正でGameの実設定を勝手に消さない。
- Mobileで画面全体横Scrollを起こさず、Timeline内部、Safe Area、端末別UI状態を正しく扱う。
- Editor広告通信/Bundle混入がなく、0px時の余白、Safe Area、Layout Shift、失敗分離を検証できる。
- 同一内容を再利用し、1ドット差、異なるID/Hash、権利差、Release不変性、Copy-on-write、GC猶予を守る。
