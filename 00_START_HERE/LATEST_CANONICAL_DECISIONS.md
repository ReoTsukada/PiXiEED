---
document_id: PIXIEED-CANONICAL-AUTHORITY-INDEX-001
status: CANONICAL
version: 4.0.0
verified_at: 2026-08-10
---

# PiXiEED 現行Canonical決定インデックス

このファイルは仕様本文ではなく、現行の正本・権威の優先順位・保存境界を示す索引です。旧来の4905行の混在マスターは、製品規範を下表の正本へ分割したうえで、この索引に置き換えました。旧パスは維持し、他の資料を削除・移動していません。

## 1. 正本一覧

### Program / implementation authority

| 領域 | 現行正本 | 決定 |
|---|---|---|
| 実行順・状態・Agent route | [WORK_PACKAGE_REGISTRY.json](WORK_PACKAGE_REGISTRY.json) | SITE-400、MARKET-410、WORK-420、SOCIAL-430の隔離縦切りは`COMPLETE_CANDIDATE`として保持し、明示的な継続指示により現在はOPS-440の隔離Operations/Admin/Analytics/Ads/Revenue shadow統合を進行する。production semantic qualificationは`PENDING/UNTESTED`、現行Market、Commission/Direct Work、決済、購入権、URL、Production Auth/DB/RLS/Storage、実Provider/検索・通知・Moderation、本番統合は変更・検証しない |
| 完成Roadmap | [PIXIEED_COMPLETION_ROADMAP.md](../09_ROADMAP/PIXIEED_COMPLETION_ROADMAP.md) | Core→Draw2→Audio→Game→Site/Commerce/Social/Ops→Native→Qualification→Cutover |
| Core完成 | [CORE_COMPLETION_BLUEPRINT.md](../02_ARCHITECTURE/CORE_COMPLETION_BLUEPRINT.md) | FP-004/005/007とCORE-100/110/120をTool本実装より先に完了 |
| Draw2 UX | [PIXIEEDRAW2_UX_SPEC.md](../03_PRODUCTS/PIXIEEDRAW2_UX_SPEC.md) | PC=Aseprite即応性+Unity/Unreal Workspace、Mobile=現行PiXiEEDraw Canvas-first、page scrollなし |
| App配布 | [PIXIEED_APP_DISTRIBUTION_SPEC.md](../03_PRODUCTS/PIXIEED_APP_DISTRIBUTION_SPEC.md) | Browser/PWA first、Desktop direct candidate、Mobile=App Store/Google Play primary |

### Product decisions recovered from the former mixed master

| 旧章 Document ID | 現行正本 | 保存した規範 |
|---|---|---|
| `PIXIGAME-MULTI-LANGUAGE-SCRIPTING-001` v2.2.0 | [03_PRODUCTS/PIXIGAME_SCRIPTING_SPEC.md](../03_PRODUCTS/PIXIGAME_SCRIPTING_SPEC.md#pixigame-scripting) | TypeScript、C#、C++、Godot、Lua、Rust/Wasm、Behavior IR、共通API、Code Workspace、Build Profile、Adapter、Sandbox |
| `PIXIGAME-CUSTOM-CONTROL-UI-001` v2.1.0 | [03_PRODUCTS/PIXIGAME_CUSTOM_CONTROL_UI_SPEC.md](../03_PRODUCTS/PIXIGAME_CUSTOM_CONTROL_UI_SPEC.md#custom-control-ui) | Asset/Frame/Region、Control、Input Action、Hit Area、D-Pad、Analog、Multi-touch、Responsive、Safe Area、Feedback、TypeScript API、保存、Accessibility |
| `PIXIGAME-UNIFIED-AUTHORING-001` v2.0.0 | [03_PRODUCTS/PIXIGAME_AUTHORING_SPEC.md](../03_PRODUCTS/PIXIGAME_AUTHORING_SPEC.md#pixigame-authoring) | かんたん・詳細・コードの同一Project、Input Action、Gesture、No-code、Event Sheet/Visual Graph、Behavior IR、Runtime、Scene/Entity/Component、Template、同期、Undo、PXD、Export、SDK |
| `PIXIEED-STORE-EXPORT-ADAPTERS-001` v1.9.0 | [03_PRODUCTS/STORE_EXPORT_ADAPTER_SPEC.md](../03_PRODUCTS/STORE_EXPORT_ADAPTER_SPEC.md#store-export-adapter) | 1提出先500円買切り、Adapter境界、各ストア、Template、Local/Cloud Build、Secret、Release不変性、PXD、Entitlement、UI、完了条件 |
| `PIXIEED-EDITOR-AD-POLICY-001` v1.8.0、`PIXIEED-MOBILE-UI-AND-AD-SAFE-AREA-001` v1.7.0、`PIXIEED-DRAW-NAME-AND-COLLIDER-GUIDE-001` v1.6.0、`PIXIEED-NAMING-AND-PXD-FORMAT-001` v1.5.0、`PIXIEED-DEDUP-AND-GAME-PHYSICS-001` v1.4.0 | [03_PRODUCTS/PIXIEEDRAW_PRODUCT_POLICY.md](../03_PRODUCTS/PIXIEEDRAW_PRODUCT_POLICY.md#pixieedraw-policy) | PiXiEEDraw広告、モバイルUI、Safe Area、名称切替、共通PXD、重複排除、Collider GuideとPiXiGame物理の責務分離 |
| `PIXIEED-CROSS-TOOL-LIVE-EDIT-001` v1.3.0 | [02_ARCHITECTURE/CROSS_TOOL_LIVE_EDIT.md](../02_ARCHITECTURE/CROSS_TOOL_LIVE_EDIT.md#cross-tool-live-edit) | 共通Project/Asset Graph、別UI、共有Revision、未保存Preview、Hot Reload、直接編集、競合、Frame ID、Offline、ブラウザ完了条件 |

各分割正本は、旧章の規範を圧縮せず、禁止事項・境界・データ正本・互換性・完了条件まで保持します。版番号は旧章の決定履歴を追跡するための値であり、実装済みであることを意味しません。

## 2. 権威の優先順位

1. 現在のユーザー指示。
2. `AGENTS.md` と `docs/codex-workflow-notes.md`。
3. 現行システム保存ゲートと、既存データ・権利・URLを守る明示的な決定。
4. 本索引が指す領域別CANONICAL正本。具体的な領域仕様を一般仕様より優先する。
5. その他のアーキテクチャ・製品・性能・実装・契約・ADRの正本。
6. コード、テスト、DB定義、Migration、現行画面は現状の証拠。未決定の製品方針を推測する根拠にはしない。
7. `docs/inventory/`、`docs/manual/`、`docs/worklogs/`、`CODEX_TASK_PROMPTS`、旧プロンプト、生成コンテキスト、状態スナップショットは、それぞれ EVIDENCE / HISTORY / GENERATED として参照するだけで、CANONICALではない。

### Draw2同期とBridgeの用語境界

Draw2の現行同期境界は [ADR-20260908-PIXYNC-BRIDGE-BOUNDARY.md](../docs/decisions/ADR-20260908-PIXYNC-BRIDGE-BOUNDARY.md) を参照する。PiXYNCがローカル3モードセッションとオンラインproviderを担い、外部PiXiEED BridgeはAseprite／Unity等を接続する別製品の任意アダプターである。Core内部のAsset／Registry／Workspace／Tool Bridgeは別の内部契約であり、これらを同一transportとして記述しない。

解消不能な矛盾は、勝手に統合せず停止して確認する。正本の版が古い場合も、実装が存在することだけを理由に仕様を変更しない。

## 3. 現行システム保存・実行境界

- 現在のPiXiEEDraw、PiXiSYNC、Market、Account/Auth、公開URL、Project/Asset/Revision ID、購入権、Entitlement、公開・販売Release、外部Storage、DBデータを保護する。
- PiXiEEDraw2は開発中の名称であり、完成・移行検証・受入・監視・ロールバック承認までは既存PiXiEEDrawを廃止しない。
- `.pxd`は編集可能な共通Project/Asset Packageであり、PNG、WAV、Build成果物、ストア提出物と混同しない。
- アクティブなPiXiEEDraw制作画面は広告なし。広告は制作外面に限定し、将来Slotは通常0px・Editor広告Runtime未読込とする。
- Guideは画像側の初期候補、実Collider・Rigidbody・PhysicsはPiXiGame側の正本。Guide更新で実設定を自動上書きしない。
- 本文書の再編自体は、本番Deploy、Publish、DB/Storage Migration、ストア提出、データ書込み、Commit、Pushを許可しない。

## 4. 旧マスター本文と配布資料の扱い

旧マスターにあった冒頭のCodex実行プロトコルは、作業入口の [README.md](README.md) に保存しました。末尾の `PiXiEED AI Full Context v1.2` は旧仕様の再掲ヘッダーであり、この再編対象の正本とはしません。新しい規範が必要な場合は必ず該当する分割正本へ追記します。

この索引は、旧本文を再び一つの巨大な権威ファイルへ戻すことを禁止する。Inventory、Worklog、旧Prompt、生成Contextは、根拠・経緯・再現用入力として保持し得るが、現行仕様の変更は行わない。

## 5. 2026-08-16 current handoff

- `SOCIAL-430`は隔離Social/Community/Creator境界の`COMPLETE_CANDIDATE`。production semantic qualificationは`PENDING/UNTESTED`であり、本番接続・実Provider・既存ルート/データ変更を意味しない。
- ユーザーの明示的な「では進めてください」により、`OPS-440`を`IN_PROGRESS`として開始する。生成Contextは`.codex/context/OPS-440.md`、次の`PLATFORM-450`は`PLANNED`・`autoStartNext: false`のまま保持する。
- このhandoffでは監査用Terraを起用しない。Lunaの一回の自己精査とSOLのread-only Canonical統合確認を採用し、過去のTerra監査・SOCIAL-430の重いテスト/Evidenceは再実行しない。

## 6. 2026-08-16 OPS-440 canonical closeout

- `OPS-440`は隔離semantic boundaryの`COMPLETE_CANDIDATE`としてcloseoutする。`OPS440-SCOPE-001`、`OPS440-EVIDENCE-001`、`OPS440-STOP-001`の3 acceptance rowsは、Terra最終監査履歴のsemantic boundary判定で`PASS`として記録し、production semantic qualificationは`PENDING_UNTESTED`のまま保持する。
- Terra verdict履歴の唯一の`FIX_REQUIRED`は、`docs/contracts/OPS-440-COMPOSITION.md`末尾の余分な空行というP1 document-hygiene finding。Lunaが契約文書だけを修正し、SOLがcloseoutを確認した。履歴は`FIX_REQUIRED`のまま保持し、Terraを現行レビュー経路へ再起用しない。
- Registry/Queue/State/Roadmapのcurrent ready candidateは`PLATFORM-450`、statusは`PLANNED`、`autoStartNext: false`、active parallel packageは空。PLATFORM-450のContext生成・実装は未開始で、明示的なユーザー指示を要する。
