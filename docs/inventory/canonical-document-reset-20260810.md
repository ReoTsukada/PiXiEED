# Canonical Document Reset Inventory — 2026-08-10

```yaml
document_id: PIXIEED-CANONICAL-DOCUMENT-RESET-INVENTORY-001
status: EVIDENCE
scope: repository_documents_and_generated_codex_inputs
production_effect: none
```

## Purpose

PiXiEED の完成までを一つの巨大なメモや手書きPromptへ依存させず、Canonical仕様、機械可読なWork Package Registry、生成Prompt、生成Context、検証証拠へ責務を分離する。削除は「古い」だけを理由にせず、再生成可能性、現行正本との重複、監査証拠としての必要性を確認して判断する。

## Classification

| Class | Treatment | Examples |
|---|---|---|
| `CANONICAL` | 保持し、現行Indexから参照する | Architecture、Product Specification、Performance Contract、Current Preservation Gate |
| `CONTRACT` | 保持する | `docs/contracts/`、Schema、Compatibility Contract |
| `DECISION` | 保持する | `docs/decisions/` のADR、決定履歴 |
| `EVIDENCE` | 保持する | Inventory、Baseline、Fixture、Visual Regression、監査結果 |
| `STATE` | 現行Registryと整合させて更新する | `.codex/PIXIEED_IMPLEMENTATION_STATE.yaml`、Blocker、Test Result |
| `GENERATED_ACTIVE` | Active Packageだけ再生成する | `.codex/context/<ACTIVE>.md`、生成Prompt、Manifest |
| `GENERATED_COMPLETED` | Registryで完了履歴を保持後に削除可能 | 完了済みWPのContextとStart Prompt |
| `TRANSIENT_DUPLICATE` | Hashと役割を確認後に削除 | `.codex/preview/` の適用済み差分パック再帰複製、`__pycache__` |
| `UNKNOWN` | 削除禁止 | 用途・参照経路・復元方法を証明できない資料 |

## Proven cleanup targets

### `.codex/preview/`

- Git未追跡のWP-005差分適用用pack。
- `payload/scripts/preview/` 以下に同じpackが再帰複製されている。
- 対応するPolicy、Prompt template、Inventory script、Report templateはRepository本体側へ既に存在する。
- WP-005は完了履歴としてRegistryに残す。
- 新Frameworkの検証後はdirectory全体を削除できる。対象はRepository内生成物だけであり、元ZIP、Production Storage、Databaseには触れない。

### `scripts/__pycache__/`

- Python実行時の再生成可能なbytecode cache。
- Source、Contract、Evidenceではない。
- 新Framework検証後に削除できる。

### Completed generated Contexts and Start Prompts

- `.codex/context/*.md` はsource of truthではなく、RegistryとCanonical文書から作る生成物とする。
- `CODEX_TASK_PROMPTS/` の完了済み開始Promptもsource of truthにしない。
- Active PackageのContext、Prompt、Manifestを再生成して検証後、完了済みの生成物は削除できる。
- 完了状態、Acceptance Evidence、Baseline identity、ADR、Contract、Inventoryは削除しない。

## Explicit preservation

次は削除しない。

- `docs/contracts/`
- `docs/decisions/`
- `docs/inventory/`
- `docs/visual-regression/`
- `CURRENT_SYSTEM_PRESERVATION_GATE.md`
- 現行PiXiEEDraw、PiXiSYNC、Market、公開URL、Project/Asset/Revision、PXD、購入権、License、Royalty、Ledgerに関する実装と証拠
- 既存BaselineのTest identityと既知失敗
- 用途不明、外部参照不明、動的参照の可能性があるファイル

## Deletion gate

削除は次をすべて満たした後だけ行う。

1. Work Package Registry v2がvalid。
2. Active PackageのPromptとContextがRegistryから生成できる。
3. 完了済みPackageを誤って再開できない。
4. Active Package以外を自動開始しない。
5. Context manifestにsource path、hash、生成時刻が残る。
6. `git diff --check` が成功する。
7. 削除対象が上記の明示対象だけであることを直前に再確認する。

## Recovery

削除対象はGit未追跡の生成物であるため、旧ContextやPromptそのものをGitから復元することはできない。必要な履歴はCanonical文書、Registry、Contract、ADR、Inventoryから再生成する。再生成不能な情報が検出された場合は削除せず `UNKNOWN` へ戻す。

## Executed cleanup result

Framework検証とFP-004の再生成後、次だけを削除した。

- 完了済み生成Context: 44 files（旧 `.codex/context/*.md`）。
- 完了済みStart Prompt: 39 files（旧 `CODEX_TASK_PROMPTS/*.md`）。
- WP-005適用済み再帰preview pack: `.codex/preview/` 全体（18 files、約104 KiB）。
- Python bytecode cache: 初回2 filesと最終検証で再生成された4 filesを削除し、directory不在を確認。
- `.codex/PIXIEED_IMPLEMENTATION_STATE.yaml` の重複していた長文完了履歴を、現行Package、
  依存DAG、製品方向、Preservation、Evidence参照だけのCurrent Snapshotへ圧縮した。
  詳細な完了証拠はTest Results、Registry、Contract、ADR、Inventoryに保持した。

保持したActive生成物:

- `.codex/context/FP-004.md`
- `.codex/context/FP-004.manifest.json`
- `.codex/prompts/FP-004.md`
- `CODEX_TASK_PROMPTS/FP-004.md`

削除後もRegistry validator、Framework test、Active Prompt/Context生成を再実行できる。Production、
Database、Storage、Market、PiXiSYNC、PXD、現行Route、画像asset、Contract、ADR、Inventory、Baseline、
Visual Regressionは変更・削除していない。
