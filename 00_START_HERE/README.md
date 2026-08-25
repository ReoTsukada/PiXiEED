# PiXiEED 文書の入口

このディレクトリは、PiXiEEDの現行仕様を読むための入口です。巨大な旧マスター本文を直接仕様として扱わず、領域別の正本を読みます。

## 最初に読む順序

0. [PiXiEED学習用・全体Context](PIXIEED_LEARNING_CONTEXT.md)（全体像・実装入口・UX・検証を学ぶための索引）
1. [LATEST_CANONICAL_DECISIONS.md](LATEST_CANONICAL_DECISIONS.md)
2. [WORK_PACKAGE_REGISTRY.json](WORK_PACKAGE_REGISTRY.json) と [IMPLEMENTATION_QUEUE.yaml](IMPLEMENTATION_QUEUE.yaml)
3. [完成Roadmap](../09_ROADMAP/PIXIEED_COMPLETION_ROADMAP.md) と [Agent Framework](../09_ROADMAP/AGENT_EXECUTION_FRAMEWORK.md)
4. 対象領域の正本（下表）
5. 実装・契約・ADR・性能資料
6. 必要に応じて証拠・履歴資料

## 現在地

- Current ready candidate: `PLATFORM-450`（`PLANNED`、実装未開始、`autoStartNext: false`）。`OPS-440`は隔離Operations／Admin／Analytics／Ads／Revenue shadow境界の`COMPLETE_CANDIDATE`としてcloseoutし、`SOCIAL-430`も隔離境界の`COMPLETE_CANDIDATE`として保持する。production semantic qualificationは`PENDING_UNTESTED`のまま、現行SNS、Production Auth/DB/RLS/Storage、実Provider、本番統合は変更しない。active parallel packageは空で、PLATFORM-450の実装・Context生成には明示的なユーザー指示が必要。
- Core完成Gate: `CORE-120`。Core完成前に新Tool productを本線へ接続しない。
- Draw2: Core後にDesktop/Tablet/Mobileを同一Core・別Workspaceで完成させる。
- Core完了後: Draw2、Audio、Gameの独立部分を並行開始し、Game cross-tool GateとSITE-400で合流する。
- Native: Browser/PWA first。Desktop direct distribution候補、MobileはApp Store/Google Playを主経路にする。
- Qualification: `WP-900`以降。Production CutoverはOwner承認を要する別Package `CUT-001`。
- 次Packageの`PLATFORM-450`は`PLANNED`・`autoStartNext: false`を維持し、自動開始しない。OPS-440はTerra最終監査履歴のsemantic boundary PASS、唯一のP1文書whitespaceをLunaが修正しSOLが確認した状態でcloseoutするが、Terraのverdict履歴`FIX_REQUIRED`は保持する。過去のTerra記録と重いテスト/Evidenceは再実行しない。

## 現行の正本

| 領域 | 正本 | Document ID |
|---|---|---|
| PiXiGame 多言語・C#/C++・Code Workspace | [PIXIGAME_SCRIPTING_SPEC.md](../03_PRODUCTS/PIXIGAME_SCRIPTING_SPEC.md) | `PIXIGAME-MULTI-LANGUAGE-SCRIPTING-001` |
| PiXiGame 自作操作UI | [PIXIGAME_CUSTOM_CONTROL_UI_SPEC.md](../03_PRODUCTS/PIXIGAME_CUSTOM_CONTROL_UI_SPEC.md) | `PIXIGAME-CUSTOM-CONTROL-UI-001` |
| PiXiGame 統合オーサリング | [PIXIGAME_AUTHORING_SPEC.md](../03_PRODUCTS/PIXIGAME_AUTHORING_SPEC.md) | `PIXIGAME-UNIFIED-AUTHORING-001` |
| ストア提出・Export Adapter | [STORE_EXPORT_ADAPTER_SPEC.md](../03_PRODUCTS/STORE_EXPORT_ADAPTER_SPEC.md) | `PIXIEED-STORE-EXPORT-ADAPTERS-001` |
| PiXiEEDraw、PXD、広告、安全領域、重複排除、Collider責務 | [PIXIEEDRAW_PRODUCT_POLICY.md](../03_PRODUCTS/PIXIEEDRAW_PRODUCT_POLICY.md) | `PIXIEED-EDITOR-AD-POLICY-001` 他 |
| Draw・Audio・Gameの共通Projectとライブ編集 | [CROSS_TOOL_LIVE_EDIT.md](../02_ARCHITECTURE/CROSS_TOOL_LIVE_EDIT.md) | `PIXIEED-CROSS-TOOL-LIVE-EDIT-001` |
| Core完成順と責務境界 | [CORE_COMPLETION_BLUEPRINT.md](../02_ARCHITECTURE/CORE_COMPLETION_BLUEPRINT.md) | Core-first blueprint |
| Draw2 Desktop/Mobile/Tablet UX | [PIXIEEDRAW2_UX_SPEC.md](../03_PRODUCTS/PIXIEEDRAW2_UX_SPEC.md) | Aseprite + Unity/Unreal + current Mobile |
| Browser/Native/Store配布 | [PIXIEED_APP_DISTRIBUTION_SPEC.md](../03_PRODUCTS/PIXIEED_APP_DISTRIBUTION_SPEC.md) | Browser/PWA/Desktop/iOS/Android |

既存の `03_PRODUCTS/PIXIGAME_SPEC.md` は総合案内として利用できますが、上表の分割正本と矛盾する場合は分割正本を優先します。

## 権威の優先順位

1. 現在のユーザー指示（保存境界・禁止操作を含む）。
2. `AGENTS.md` と `docs/codex-workflow-notes.md` の作業上の指示。
3. 現行システム保存ゲート、既存データ・権利・URLを守る明示的な決定。
4. 上表の領域別CANONICAL仕様。領域が重なる場合は、より具体的な仕様を優先する。
5. `02_ARCHITECTURE/`、`03_PRODUCTS/`、`05_PERFORMANCE/`、`08_IMPLEMENTATION/`、`docs/contracts/`、`docs/decisions/` の個別正本。
6. 実装、テスト、マイグレーション、現行画面は「現在何が存在するか」の証拠であり、未記載の製品方針を推測して上書きしない。
7. `docs/inventory/`、`docs/manual/`、`docs/worklogs/`、旧 `CODEX_TASK_PROMPTS`、生成コンテキスト、作業スナップショットは EVIDENCE/HISTORY/GENERATED であり、単独では仕様の権威にならない。

矛盾を安全に解消できない場合は、実装や本番操作を続行せず、矛盾箇所・影響・確認事項を報告します。

## 現行システム保存ゲート

- 現在のPiXiEEDraw、PiXiSYNC、Market、アカウント、公開URL、Project ID、Asset ID、Revision、購入権、公開・販売データを保護する。
- 仕様整理を理由に、既存データ、権利、外部Storage、DB行、リンク、購入済みReleaseを削除・移行・上書きしない。
- 新しい描画実装は完成・受入・監視・ロールバック条件を満たすまで既存PiXiEEDrawを廃止しない。
- 追加機能は既存契約を壊さず、明示的な切替、互換層、検証、ロールバックを持つ。
- 本文書の再編だけでは、デプロイ、公開、DB変更、Storage変更、ストア提出、コミット、プッシュを行わない。

## Codex作業規範

- 正本を先に読み、実装・テスト・修正・再テスト・完了確認を一つの作業単位として扱う。
- 既存の未完作業を状態資料で確認し、完了済み作業を無断で繰り返さない。
- 自動的に決めてよいのは、既存契約を保つ局所実装、テスト、文書整理、可逆な診断だけとする。
- 本番データの変更、権利・課金・認証への影響、不可逆操作、仕様間の解消不能な矛盾は停止して確認する。
- 「コードを書いた」だけを完了とせず、対象範囲の検証、失敗時の扱い、未完項目を確認する。
- 証拠・履歴・生成物は、現行正本へのリンク元として扱い、正本の代替にしない。

## このリセットの範囲

`LATEST_CANONICAL_DECISIONS.md` は、旧本文を削除して仕様を失わせるためではなく、旧本文に混在していた規範を領域別ファイルへ移し、索引と優先順位だけを担うファイルへ戻すために更新しました。旧ファイル自体のパスは維持しています。既存の他ファイルは削除・移動していません。
