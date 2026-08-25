# PiXiEED 取締役提出用 現状・全体計画報告

```yaml
report_id: PIXIEED-DIRECTOR-STATUS-20260815-V2
date: 2026-08-15
revision: V2
program: PIXIEED-COMPLETION-PROGRAM-002
authority: 00_START_HERE/WORK_PACKAGE_REGISTRY.json
current_package: GAME-350
current_status: IN_PROGRESS / NOT_READY
production_action: NONE
source_material_sha256: 4aa50f7c91f061a60011d6e7a1b6d27811aceccc49c0cf6079ad10b7d5ed4b21
```

## 1. 取締役向け結論

PiXiEEDは、既存サイトへ機能を継ぎ足すだけの計画ではありません。

**PiXiEED Coreを中心に、制作・共有・販売・購入・依頼・権利・収益化を一つの契約体系で接続するGlobal Creator Platformへ再構築する計画**です。

現在は、次の基盤が構築済みです。

- CoreのProject / Asset / Revision / Package / Command / Event契約
- Authorization、Aggregate Integrity、Financial Integrity、Durable Event、Privacy、Reproducibility境界
- PiXiEEDraw2のEditor Core、PXD互換、Selection、Timeline、Workspace、Preview境界
- PiXiAudioのProject / Revision / Event / Package / Workspace境界
- PiXiGameのProject / Scene / Entity / Behavior / Runtime / Build / Package境界

一方、**製品の実機資格・本番相当資格・Native配布・限定公開・Production Cutoverは未完了**です。

現在の正式停止点は`GAME-350`です。実装と隔離テストは進んでいますが、実機・Safari/Firefox・Native・Staging・RLS・Rollback等の証拠が未取得のため、`NOT_READY`を維持しています。

## 2. 私の役割

私はこの計画では、実装を無条件に進める担当ではなく、**監査役・全体Coordinator**として動きます。

主な責務は次の通りです。

1. Registry、Roadmap、Context、Work Package定義を読み、現在の正規状態を確定する。
2. 実装範囲、依存関係、書込み範囲、禁止事項を決める。
3. 実装結果をコード、Test、Benchmark、Browser、Evidenceで照合する。
4. `PASS`、`PARTIAL`、`UNTESTED`、`BLOCKED`を混同しない。
5. 実装者自身の自己証明にならないよう、独立レビューを要求する。
6. 現行サイト、現行PiXiEEDraw、PXD、PiXiSYNC、Market、Production Dataを保護する。
7. Gateを満たさない状態で次のPackageや本番変更へ進ませない。

### 実装・検証の役割分担

Canonical Framework上の役割は以下です。

| 役割 | 責務 |
|---|---|
| 取締役 / Owner | 予算、外部環境、リリース、Store、Production Cutoverの最終承認 |
| 監査役 / Coordinator | 全体把握、Scope、依存関係、証拠、停止判断、最終Checkpoint |
| Luna系実装担当 | 指定された狭い書込み範囲で実装・Test・Fixture・Benchmarkを作成 |
| 独立レビュー担当 | 実装者と別経路で差分、失敗系、証拠、過剰主張を確認 |

エージェントは数を増やすこと自体を目的にせず、契約、実装、攻撃Fixture、性能・Browser証拠など、書込み範囲が分離できる場合だけ並列化します。

私はProductionの認証情報、Storeアカウント、決済情報、公開権限を持つ担当ではありません。実装を完了と宣言したり、本番切替を自己承認したりせず、Canonical定義とEvidenceに基づいて、進行・停止・差し戻しを判断します。

## 3. 実際に作っている製品

### PiXiEED Core

全Toolを接続する共通基盤です。

```text
Identity / Account / Creator / Permission
Project / Asset / Revision / Dependency / Provenance
Command / Operation / Journal / Checkpoint / Recovery
PiXiSYNC compatibility / versioned sync
Package / Manifest / Hash / License / Import / Export
Event / Activity / Search / Notification
Market / Product / Purchase / Entitlement / License / Royalty / Ledger
App Shell / Route / Navigation / Design System / Accessibility
Feature Flag / Observability / Shadow Validation / Rollback
```

各Toolが同じ巨大ファイルを直接書き換えるのではなく、共通のAsset GraphとRevisionを使用します。

```text
Draw2 / Audio / Gameで編集
        ↓
新しいAsset Revision
        ↓
Project参照を更新
        ↓
Core Event
        ↓
Preview / Game / Timeline / Package候補を更新
```

### 最終目標：全プロジェクトをつなぐRealtime Creator Platform

PiXiEEDの最終完成形は、Draw2、Audio、Gameを個別に完成させることではありません。**PiXiEED Coreを唯一の契約・権限・Revision・Eventの基盤とし、制作、実行、公開、販売、購入、依頼、SNS、通知、権利、課金を、Project単位でリアルタイムに接続すること**です。

```text
Account / Tenant / Permission
            ↓
Project + Asset Graph + Revision
            │
   ┌────────┼─────────┬──────────┬──────────┐
   ↓        ↓         ↓          ↓          ↓
 Draw2    Audio     Game       Package    Community
   │        │         │          │          │
   └────────┴────┬────┴──────────┴──────────┘
                 ↓
          PiXiEED Core Event
                 │
     ┌───────────┼─────────────┬─────────────┐
     ↓           ↓             ↓             ↓
  Preview      Runtime       Market       Direct Work
                             │             │
                             ↓             ↓
                    Purchase / Rights   Agreement / Payment
                             │             │
                             └──────┬──────┘
                                    ↓
                          Entitlement / License
                          Royalty / Ledger / Notice
```

「リアルタイム接続」は、各画面が同じ巨大ファイルやDatabase行を直接書き換える意味ではありません。以下の契約を通じて接続します。

| 連携の中心 | 連携内容 |
|---|---|
| Asset Graph | Draw、Audio、Game、Packageが同じAsset IDとDependencyを参照 |
| Revision | 編集結果を不変Revisionとして扱い、参照先を安全に更新 |
| Core Event | Revision、Project、Purchase、Rights、Notificationの変更を購読 |
| Command / Operation | 編集や構造変更をCanonical OperationとしてJournal・PiXiSYNCへ接続 |
| LIVE / REVIEW / PINNED / FORKED | Previewは追従、公開・販売物は固定、検証中は承認待ち、派生物は分岐 |
| Package / Dependency Lock | 販売・移動・バックアップ時に必要な素材、License、Hash、依存関係を固定 |
| Authorization / Transaction | すべてのProject、Market、Direct Work、SNS、Admin操作を共通の権限・取引境界で検証 |

### 代表的なリアルタイム連携

```text
Draw2でキャラクターを編集
  → Draw Asset Revisionを確定
  → Game Previewと映像・Timelineへ更新通知
  → Package候補とMarket Previewを更新候補として表示
  → 公開済みPINNED商品は自動変更せず、次Revisionとして審査
```

```text
PiXiAudioでBGM・効果音を編集
  → Audio RevisionとWaveform情報を確定
  → Game Runtime PreviewとTimelineを安全な境界で更新
  → PackageのDependency Lockを再評価
  → LicenseとMarket商品への影響を通知
```

```text
MarketでProductを購入
  → Provider Eventを検証
  → Purchase / Entitlement / Licenseを確定
  → 購入者のProject・Packageアクセスを更新
  → CreatorへのRoyalty / Ledgerを導出
  → Notificationと監査証跡を発行
```

```text
Direct Workを受注
  → Request → Quote → Agreement → Milestone
  → Delivery → Acceptance → Rights → Payment
  → Product / Asset / Licenseの関係を固定
  → Event、Notification、Ledgerへ接続
```

この完成形では、Marketは独立した商品一覧ではなく、Core上のProject・Asset・Revision・License・Entitlementを利用する一つの重要な利用面です。ただし、Marketが制作中のLIVE Revisionを勝手に販売物へ反映することは許可せず、販売物はContributor Snapshot、License Snapshot、Dependency Lock、Content Hashを固定したProduct Revisionとして扱います。

### 完成判定の意味

PiXiEED全体の完成とは、各Packageの単体テストが通ることだけではありません。最終的には次の横断フローを、隔離環境、Staging、本番相当環境の順に証明します。

- Draw2 → Asset Revision → Game / Audio Preview → Package → Runtime
- Project → Product → Checkout → Purchase → Entitlement → License
- Collaborative Work → Contributor Snapshot → Royalty → Ledger
- Direct Work → Agreement → Delivery → Acceptance → Rights → Payment
- Published Work → SNS → Search → Notification → Market / Project
- Offline Journal → Reconnect → PiXiSYNC → Conflict / Recovery → Confirmed Revision

これが、PiXiEEDの「全プロジェクトをリアルタイムでリンクし、Marketを含む全サービスを一つのCoreで接続する」という最終目標です。現在のGAME-350はこの最終目標のGame側の完了Gateであり、ここを閉じた後にSITE-400以降でサイト・Market・Communityとの横断接続を進めます。

### PiXiEEDraw2

現行PiXiEEDrawを直接破壊的改修せず、別Entry / Moduleとして新規構築しています。

目標は、Aseprite級のPixel制作効率に、Unity・Unreal系Creator Workspaceの整理能力を加えたWeb Editorです。

主な対象は次です。

- Pencil、Eraser、Fill、Line、Rectangle、Ellipse、Circle
- Selection、移動、回転、反転、拡大縮小、Clipboard
- Pixel Perfect Stroke、Bresenham系の決定論的Line / Shape計算
- Layer、Frame、Cel、Timeline、Onion Skin、Animation Tag
- Palette、HSV / Hue、Alpha、Index Color、Color History
- Mirror、Grid、Major Grid、Preview、Reference Image
- Brush Pattern、Dither、Custom Brush、Tile、Slice、Sprite Sheet
- PXD Import / Export、PNG Export、Legacy Adapter
- Undo / Redo、Journal、Checkpoint、Autosave境界
- Desktop Dock、Tablet Adaptive Workspace、Mobile Canvas-first UI
- Shortcut Registry、Command Palette、Help、Guided Creation

DesktopはAsepriteの制作効率とUnity / Unreal / Figma系のPanel整理を参照し、Mobileは現行PiXiEEDrawの縦型Canvas-firstを基準にしています。

### PiXiAudio

Audio ProjectとRevisionをCoreへ接続するToolです。

- Audio Project / Source / Revision
- BGM、効果音、Mixer、Marker、Waveform Preview
- Game・映像TimelineとのEvent接続
- Audio Package、License、Dependency Lock
- 大容量BlobをUIやDatabaseへ直接持ち込まない保存境界

### PiXiGame / PiXiRuntime

制作側と実行側を分離したGame Toolです。

- Scene、Entity、Component
- No-code / Graph / Code Behavior IR
- Input Map、Custom Control、Collider、Physics参照
- Runtime Preview、Save State、Build Artifact
- Draw Asset / Audio AssetのLIVE・PINNED参照
- Package、Hash、License、Dependency Lock
- Project StateとRuntime Save Stateの分離

### Integrated PiXiPackage

作品を移動・保存・販売できる統合Packageです。

```text
Manifest
Draw Data
Audio Data
Game Data
Video / Timeline / Input
Asset Graph
Dependency Lock
License Snapshot
Journal / Checkpoint
Hashes / Provenance
```

作業中はProject Manifest、Index、Journal、OPFS等に分け、Export・Backup・販売時にReference形式または完全内包形式へ materializeします。

現行PXDは破壊的に変更しません。Legacy PXDはDraw2へLossless Importし、統合Packageから現行PXDへ戻す場合は非対応データを明示します。

### Market / Direct Work / SNS / Creator Economy

最終的には次のサイト機能をCoreで接続します。

- Market：素材、完成品、Package、License、Purchase、Entitlement
- 共同制作：Contributor Snapshot、均等配分、Product Lead、Royalty、Ledger
- Direct Work：Request → Quote → Agreement → Milestone → Delivery → Acceptance → Rights → Payment
- SNS / Community：作品、Creator、検索、通知、Moderation
- Subscription：定期課金、権限、利用範囲
- Creator Economy：売上、控除、Royalty、Ledger、監査
- Admin / Operations：権限、広告、通知、分析、Rollback

これらは既存Marketの置換を意味しません。新しい契約を隔離して検証し、互換性とRollbackを確認してから段階的に接続します。

### リポジトリ上の主な実装領域

| 領域 | 主な場所 | 役割 | 現行系への扱い |
|---|---|---|---|
| 現行Pixel Editor | `pixiedraw/` | 既存PiXiEEDraw、既存URL、既存PXD利用者 | 保守・互換性確認。破壊的変更禁止 |
| 新Pixel Editor | `pixiedraw2/`、`DRAW-*`関連資料 | PiXiEEDraw2のEditor、Workspace、Timeline、Export | 隔離Entry / Feature Flagで検証 |
| 共通Core | `core-shell/`、`src/`、`CORE-*`関連資料 | ID、Project、Asset、Revision、Command、Event、Package、権限 | Adapterと契約を通じて段階接続 |
| Audio / Game | Audio・Game関連の`src/`、`AUDIO-*`、`GAME-*` | PiXiAudio、PiXiGame、Runtime、Build、Package | RuntimeとAuthoringを分離 |
| サイト機能 | `site/`、`account/`、`post/`、`help/`、`maoitu/` | App Shell、Account、SNS、Help、通知入口 | 新Shell側で隔離統合。現行Route非侵入 |
| Market / Commerce | `market/`、`supabase/` | 商品、購入、権利、依頼、Royalty、Ledger | 現行販売・購入・権利データを保護 |
| Lens / Find / 周辺Tool | `pixiee-lens/`、`pixfind/`、`character-dots/`等 | 画像取込、検索、公開、補助制作体験 | Core接続は契約・Gate後 |
| Native配布 | `app-shell/pixieed-capacitor/` | BrowserをNative Hostへ包む候補 | Build評価のみ。Store提出・署名は未承認 |
| Canonical文書・Evidence | `00_START_HERE/`、`02_ARCHITECTURE/`、`09_ROADMAP/`、`docs/` | 状態、設計、Roadmap、検証証拠 | 実装より優先する正規の判断資料 |

この表の「扱う」は、すべてを同時に書き換える意味ではありません。各Packageが許可されたPathだけを変更し、現行系は保存・比較・Adapter・Rollbackの対象として扱います。

## 4. 保存・同期の基本設計

全てをIndexedDBへ入れる設計ではありません。

| 層 | 主な用途 |
|---|---|
| Memory | 現在編集中の状態、Canvas、Tool、Preview、再生状態 |
| IndexedDB | Journal、未同期Operation、Index、Metadata、Offline Queue |
| OPFS | 大きなTile、Audio Blob、Waveform、Build Cache、Checkpoint |
| Server Database | Account、Permission、Project Metadata、Revision、Event、Commerce参照 |
| Object Storage | PXD、PiXiPackage、PNG、Audio、Game Package、Immutable Blob |

PiXiSYNCはファイル全体を毎回送らず、Command、Canonical Operation、Tile差分、Revision、Metadataを同期します。

WorkspaceのPanel配置、Zoom、Scroll、Selected Tool、Mobile SheetなどはPersonal Local Stateであり、Canonical ProjectやPiXiSYNCへ混入させません。

## 5. 現在の実装進捗

### Canonical Registry上の状態

Registryの40 Packageは次の状態です。

| 状態 | 件数 |
|---|---:|
| COMPLETE | 19 |
| IN_PROGRESS | 1 |
| PLANNED | 19 |
| BLOCKED | 1 |

これはRelease完成率ではありません。隔離実装Packageの状態を示す管理値です。

### 完了扱いの主な範囲

- WP-000〜WP-250：Repository、Core、Shell、Registry、Draw2、Audio、Game、Market等の設計・実装Package
- FP-001〜FP-005、FP-007：Authorization、Aggregate、Financial、Durable Event、Privacy、Reproducibility境界
- CORE-100〜CORE-120：Canonical Core Completion
- FP-006、DRAW-110〜DRAW-170：Draw2実装、Workspace、Export、Legacy、Runtime、Advanced Tool
- AUDIO-200〜AUDIO-240：Audio Project、Revision、Package、Workspace、Completion Gate
- GAME-300〜GAME-340：Game Project、Input、Runtime、Build、Draw/Audio Package Integration

### 現在のGAME-350

GAME-350はGame Completion Gateです。実装と隔離検証の結果は次の通りです。

- 型検査：PASS
- GAME-350テスト：9/9 PASS
- Core / Studio Benchmark：決定論PASS
- Context検証：PASS
- Evidence形式検証：PASS
- Browser Runtime Preview：LIVE / PINNED / 再読込を確認
- 1280×720ページOverflow：なし
- 現行Route、Market、PiXiSYNC、本番Data：変更なし

追加証拠：

[game-350-browser-audit-20260815.json](/Users/tsukadareine/Documents/GitHub/PiXiEED/docs/inventory/game-350-browser-audit-20260815.json)

ただし、GAME-350の総合資格はまだ`PARTIAL / NOT_READY`です。

## 6. 未実施・未承認の項目

以下は実施していないため、PASSへ変更していません。

- 実機スマートフォン、タブレット、Stylus、Gamepad
- Safari / Firefoxの実運用確認
- 30分以上のMemory・Long Task・GC・Page Memory確認
- Game Studio全体の実Browser操作とVisual Regression
- Native Android / iOS / Desktop Build、Signing、Notarization
- Staging上のProvider、RLS、RPC、Rollback
- Production-equivalent Migration / Reconciliation / Restore
- Real Legacy PXD、実ユーザーProject、実PiXiSYNCデータとの互換性
- Google Play、App Storeへの公開申請
- Production Deploy、Publish、Route Cutover

この区別を維持することが本計画の重要な安全条件です。

## 7. 全体ロードマップ

```text
Foundation
  FP-004 Durable Event
  → FP-005 Privacy / Storage / Input
  → FP-007 Schema / Dependency / Reproducibility

Core
  CORE-100 → CORE-110 → CORE-120

Creation Tools
  Draw2: FP-006 → DRAW-110..170
  Audio: AUDIO-200..240
  Game: GAME-300..350

Site / Economy / Community
  SITE-400
  → MARKET-410
  → WORK-420
  → SOCIAL-430
  → OPS-440
  → PLATFORM-450

Native
  NATIVE-500 Host Boundary
  → NATIVE-510 Desktop Distribution Candidate
  → NATIVE-520 Mobile Store Distribution Candidate

Qualification
  WP-900 Gap Authority
  → WP-910 Canonical Completeness
  → WP-920 Functional Completeness
  → WP-930 UX / Device
  → WP-940 Performance / Memory
  → WP-950 Legacy Compatibility
  → WP-960 Security / Permission / RLS
  → WP-970 Production Integration Rehearsal
  → WP-980 Migration / Rollback Rehearsal
  → WP-990 Limited Rollout / Owner Decision Packet

Cutover
  CUT-001
```

### 次の実行順

1. GAME-350の未実施資格を実機・Browser・Staging環境で取得する。
2. GAME-350を独立レビュー付きで`COMPLETE`または`NOT_READY`判定する。
3. Gateが通った場合のみSITE-400を開始する。
4. SITE-400で新App ShellへAccount、Project、Asset、Tool、Search、Notification、Market、SNSの入口契約を接続する。
5. Market、Direct Work、SNS、Operationsを横断統合する。
6. Native HostとStore配布候補を評価する。
7. WP-900で全体のRelease Readiness Gapを再構成する。
8. WP-910〜WP-990で実機、互換、Security、Staging、Rollbackを証明する。
9. Ownerが明示承認した場合だけCUT-001を別途実施する。

## 8. 取締役に必要な判断事項

現時点でProduction Cutoverの承認を求めていません。まず次の判断が必要です。

### A. 検証環境の承認

- 実機スマートフォン、タブレット、Stylus、Gamepadの検証環境
- Safari / Firefox検証環境
- 30分以上の長時間Performance計測環境
- Productionを変更しないStaging、RLS、Provider、Rollback環境

### B. Native配布方針

- Browser/PWAを第一配布面として維持するか
- Desktop Nativeを配布候補として進めるか
- Android / iOSをGoogle Play / App Store評価へ進めるか
- Signing、Notarization、Storeアカウント管理者を誰にするか

### C. リリース方針

- Draw2、Audio、Gameを同時に限定公開するか
- Draw2を先行し、Audio/Gameを段階公開するか
- Current PiXiEEDrawをどの期間Fallbackとして維持するか
- Market・購入権・既存URLの互換期間をどの程度にするか

### D. 本番切替権限

Production Migration、Deploy、Publish、Store Submission、Route Cutoverは、Ownerの明示承認が必要です。

## 9. 監査上の非交渉条件

- 現行PiXiEEDrawはDraw2完成まで保守可能な状態で残す。
- 現行PXDを破壊的に変更しない。
- 現行PiXiSYNC、Market、URL、Project、Asset、Purchase、Entitlement、License、Royalty、Ledgerを変更しない。
- Feature Flagは初期OFF、Kill SwitchとRollback経路を用意する。
- 不明なファイルや用途不明の完全重複を、検索結果だけで削除しない。
- 実測していないものをPASSにしない。
- Isolated FixtureをProduction証拠へ昇格させない。
- 各Packageは指定範囲だけを書き、独立レビューとEvidenceを残す。
- Package完了後に次Packageを自動開始しない。
- WP-990はOwner判断資料であり、Production許可ではない。
- CUT-001はOwnerの明示許可がない限りBLOCKEDのままにする。

## 10. V2で追加した不足事項

添付された新資料は、V1として作成済みの報告書と内容・SHA-256が一致していました。したがってV2では、全体構想を変えず、取締役が今後の承認判断を行うために不足していた定義を追加します。

これらはすべてを直ちに実装するという意味ではありません。現在のGAME-350を不必要に差し戻さず、該当するGateまでに仕様・証拠・Owner判断を揃えるための不足項目です。

| 不足している定義 | 必要な理由 | 確定すべき時期 |
|---|---|---|
| Realtime SLO | Revision反映、通知、Preview更新の許容遅延、再送、順序逆転、重複処理を判定するため | SITE-400 / WP-910前 |
| Offline / Conflict方針 | 切断中編集、再接続、同時編集、競合解決、復旧結果を製品契約にするため | WP-910 |
| API / Schema Versioning | Core、Tool、Native、旧PXD、PiXiSYNCを長期共存させるため | SITE-400開始前 |
| Project Visibility / Data Governance | 非公開Project、共有Project、購入Asset、削除・Export・保持期間を区別するため | SITE-400 / WP-950前 |
| Commerce Operations | Refund、Chargeback、税・手数料、Payout、Dispute、Settlement失敗を扱うため | MARKET-410 / WP-960前 |
| Rights / Moderation / Takedown | SNS・Market・依頼成果物の侵害申告、削除、復元、異議申立てを扱うため | SOCIAL-430 / WP-950前 |
| Reliability SLO / BCP | Backup、Restore、RTO、RPO、障害レベル、Incident対応を決めるため | OPS-440 / WP-970前 |
| Security Operations | Secret、鍵ローテーション、Provider障害、RLS監査、Audit Log保持を運用するため | OPS-440 / WP-960前 |
| Scale / Cost Guardrail | Storage、Event、Preview、Search、通知、Buildの上限と費用暴走を防ぐため | PLATFORM-450前 |
| Product Acceptance Matrix | Draw2、Audio、Game、Marketの「使える」の条件を実操作・性能・互換で判定するため | WP-900 |
| Native Lifecycle | Desktop / Android / iOSの更新、署名、権限、オフライン、Rollback、Store審査を管理するため | NATIVE-500〜520 |
| Support / Localization | 日本語・英語、Help、障害通知、問い合わせ、データ削除依頼を運用するため | SITE-400 / OPS-440 |

### V2で固定するリアルタイム境界

- 「全プロジェクトをリンクする」は、全利用者が全Projectを閲覧できる意味ではない。Tenant、Project、Asset、Product、購入権、Contributor、RoleごとのAuthorizationProofで可視範囲を拘束する。
- Toolは同じDatabase行を直接書き換えず、Server-authorized Command / Operation / Eventを発行する。正式状態はServer側のConfirmed Revisionで決める。
- Realtime通知は、UI更新・Preview更新・検索更新・通知候補を伝える。大容量Blobを毎回イベントへ内包せず、HashとStorageLocatorで取得する。
- LIVEは制作中の参照、REVIEWは承認待ち、PINNEDは公開・販売物の固定、FORKEDは派生編集として扱う。Market商品と購入済み権利はPINNEDを基準にする。
- Eventが遅延・重複・順序逆転・再送されても、Idempotency、Inbox / Outbox、Revision拘束、Ledger一回性で結果を決定論的に保つ。
- Project、Package、Product、Purchase、Entitlement、License、Ledgerの因果関係を監査可能なTrace IDで追跡できるようにする。

### V2で追加する横断受入証拠

今後の「全体完成」は、次の結果を個別に記録して初めて認定します。

1. Draw2で作成したAssetが、権限を保ったままAudio / Game / Package / Market Previewへ反映される。
2. Audio変更がGame Runtime・Timeline・Package Dependencyへ安全に反映される。
3. Game、Audio、Draw Assetを含むProductが、固定RevisionとLicense Snapshotで再現できる。
4. 購入・返金・Provider再送・重複Eventが、EntitlementとLedgerを二重計上しない。
5. Direct WorkのAcceptance、Rights、Paymentが別Request・別Quote・古いPaymentへ差し替えられない。
6. 非公開Project、購入Asset、共同制作Contributor情報、個人依頼内容がSearch・SNS・通知・Auditへ漏れない。
7. Offline編集、再接続、Conflict、Rollback、Restore後にConfirmed RevisionとPackage Hashが一致する。
8. Browser、Tablet、Mobile、Native候補で、Canvas・Timeline・Audio・Game Previewの入力・表示・メモリ性能を実測する。

## 11. 取締役への追加判断事項

V1の判断事項に加えて、次を早期に決める必要があります。

### E. サービス運用の責任範囲

- 障害対応の責任者と連絡経路
- Refund、Chargeback、紛争、著作権申立て、Takedownの承認者
- データ削除、Export、アカウント閉鎖、購入権の扱い
- 保存地域、保持期間、バックアップ、復旧期限

### F. 目標値と費用上限

- Realtime反映の目標遅延
- Preview / Build / Search / Notificationの許容待ち時間
- Project、Asset、Package、Storage、Eventの利用上限
- Staging、Production-equivalent、Native配布の予算上限

### G. 公開単位

- Draw2先行、Audio / Game後追いの段階公開か
- 3Toolを一つの統合Packageとして公開するか
- Market、SNS、Direct Workのどの機能を限定公開に含めるか
- 旧PiXiEEDrawと新Draw2のFallback期間

## 12. 取締役への最終報告

PiXiEEDは、基盤・契約・Core・Draw2・Audio・Gameの隔離実装がかなり進んだ段階です。

しかし現在は、**「実装できた」段階から「実際の利用者・端末・環境・運用で安全に動くことを証明する」段階へ移る境界**です。

この先の最大のリスクは、Core単体の不足ではなく、次の横断的な未証明領域です。

- Draw2 / Audio / Gameを組み合わせた実ユーザーフロー
- Device UXと長時間性能
- Legacy PXD / PiXiSYNC / Market互換
- Authorization / RLS / Provider / Ledger / EventのProduction-equivalent動作
- Native配布とRollback
- 限定公開からProduction Cutoverまでの運用

したがって、現在の正しい判断は次です。

> PiXiEEDの新しい全体設計と主要Coreは継続可能。GAME-350の資格証拠を閉じ、SITE-400以降の統合へ進む。ただし、Production CutoverやStore公開はまだ承認しない。

この判断により、開発速度を維持しながら、既存ユーザー・既存データ・既存販売・既存URLを守ったまま、最終的なPiXiEED全体へ進めます。

## 参照したCanonical資料

- `00_START_HERE/WORK_PACKAGE_REGISTRY.json`
- `00_START_HERE/IMPLEMENTATION_QUEUE.yaml`
- `.codex/PIXIEED_IMPLEMENTATION_STATE.yaml`
- `09_ROADMAP/PIXIEED_COMPLETION_ROADMAP.md`
- `09_ROADMAP/AGENT_EXECUTION_FRAMEWORK.md`
- `02_ARCHITECTURE/PIXIEED_CORE_SYSTEM.md`
- `02_ARCHITECTURE/PIXIEED_PRODUCT_STRATEGY.md`
- `02_ARCHITECTURE/INTEGRATED_PACKAGE_FORMAT.md`
- `CURRENT_SYSTEM_PRESERVATION_GATE.md`
- `09_ROADMAP/WORK_PACKAGES/GAME-350.md`
- `docs/inventory/game-350-evidence.json`
- `docs/inventory/game-350-browser-audit-20260815.json`
