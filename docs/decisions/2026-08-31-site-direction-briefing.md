---
document_id: PIXIEED-SITE-DIRECTION-BRIEFING-2026-08-31
status: BRIEFING_ANALYSIS
classification: PRIVATE_INTERNAL_ONLY
authored_by: Claude (Cowork) — サイト全体統括ロールとして、アルタさんの直接指示により作成
date: 2026-08-31
supersedes: なし(既存CANONICAL文書を置き換えない。参照・現状整理・方向性提案のみ)
---

# PiXiEED.jp サイト全体構成・リアルタイム同期 現状評価と方向性

## 0. この文書の位置づけ

この文書は **CANONICAL ではありません**。`00_START_HERE/WORK_PACKAGE_REGISTRY.json` と
`00_START_HERE/LATEST_CANONICAL_DECISIONS.md` が定める正本の優先順位を変更・上書きするものではなく、
既存の正本群を実際に読んで突き合わせた**現状評価**と、次にどう進めるかの**方向性提案**です。
コードは一切変更していません。Codexへの作業材料として使うことを想定しています。

権威の優先順位はこれまで通りです。

```text
1. 現在のユーザー指示(アルタさんの直接指示)
2. AGENTS.md / docs/codex-workflow-notes.md
3. CURRENT_SYSTEM_PRESERVATION_GATE.md
4. 00_START_HERE/LATEST_CANONICAL_DECISIONS.md が指す領域別CANONICAL正本
5. その他のアーキテクチャ・製品・実装・契約・ADR
6. コード/テスト/DB/現行画面(証拠であって仕様の根拠ではない)
```

---

## 1. エグゼクティブサマリー

- **PiXiEEDにはすでに非常に成熟したガバナンス体制がある。** Work Package Registry、Roadmap、
  Preservation Gate、ADR群、Agent Orchestration(sol_max=統括・read-only、luna=実装、terra=独立レビュー)
  が揃っており、「行き当たりばったりの全面リニューアル」を防ぐ設計になっています。今回の依頼(サイト全体の統括)は、
  この体制でいう **`sol_max`(coordinator, read-only)に近い役割**です。実装そのものより、方向性の確定と
  Codexへの作業材料提供が中心になります。
- **「現行サイト」と「進行中の新実装」は分けて考える必要がある。** 2026-08-30に「Bridge cutover」が実行され、
  旧制作ツール群(pixiedraw、pixfind、pixiee-lensなど)が一度公開ルートから外され、その後 `pixiedraw` だけ
  復元されています。一方 `pixiedraw2/`(このセッションでUI改善してきたDraw2)は**Gitに一度もコミットされていない
  未追跡ディレクトリ**であり、現行の公開サイトには含まれていません。SITE-400〜SITE-460・PLATFORM-450という
  一連のWork Packageが「COMPLETE_CANDIDATE(実装済みだが本番未検証)」まで進んでいますが、これは
  ローカル/隔離スコープでの話で、本番切替(CUT-001)には別途Owner承認が必要です。
- **リアルタイム同期は「1つ」ではなく「3層」ある。** (詳細は4章)
  1. **PiXiSYNC** — 現行 `pixiedraw` を支える本番同期。Preservation Gateで明示的に保護されており、
     互換性が証明されるまで置き換え禁止。
  2. **Cross-Tool Live Edit**(`02_ARCHITECTURE/CROSS_TOOL_LIVE_EDIT.md`, CANONICAL) — Draw2/Audio/Game
     を「同じProjectを別ウィンドウで開く」体験として繋ぐための設計。まだ実装/検証は進行中。
  3. **PiXiEED Bridge**(別リポジトリ `pixieed-bridge`) — Tauri製ネイティブランタイムの **loopback限定**
     WebSocketハブ(`pixieed.realtime/1`)。これは複数ユーザーのクラウド同期ではなく、**同一マシン上の
     別アプリ(Aseprite/Unity等)とPiXiEEDを繋ぐ**ための仕組みです。`pixiedraw2/src/pixync/bridge-provider.ts`
     はすでにこのBridgeに接続するクライアントとして実装済みです。
  「サイトのリアルタイム同期」という言葉が上記のどれを指すかで実装方針が大きく変わるため、2章末で選択肢を提示します。
- **現在Gitの作業ツリーには、サイト共通シェル(ナビ・多言語・プロフィールヘッダー・ページ遷移アニメーション)への
  未コミットの変更が既にあります**(約16ファイル・250行規模)。これは今回の依頼と直接関係する領域なので、
  重複作業を避けるため、まずこの差分の内容を確認・整理することを推奨します。

---

## 2. 現状評価: ページ構成

### 2.1 現行の公開ルート(2026-08-30時点、`docs/inventory/current-public-routes.md`)

```text
Bridge/site : /, /help/, /contact/, /community/, /notes/, /glossary/, /events/, /notice/
Account     : /account/, /account/admin.html, /account-deletion/
Market      : /market/, /market/about.html, /market/help.html, /market/item.html,
              /market/review.html, /market/sell.html, /market/seller.html,
              /market/items/<uuid>/ ×4
Policy      : /privacy/, /terms/, /legal/
```

`/pixiedraw/`, `/pixiedraw2/`, `/pixfind/`, `/pixiee-lens/`, `/qr/`, `/qr-maker/`, `/maoitu/`, `/studio/`、
旧Projects/Portfolio系は、この時点でアクティブな公開ルートから除外されています。

ただし直近のコミット `restore PiXiEEDraw and remove obsolete image assets` で `/pixiedraw/` 自体は
復元されており(`pixiedraw/index.html` は現在 working tree でも変更中)、この一覧を鵜呑みにせず
**実際の公開状態は別途確認が必要**です(このinventoryファイル自体、更新が追いついていない可能性があります)。

参考: `pixieed-bridge/README.md` に書かれている「現行サイトの残存4領域(Marketplace / 購入済み商品 /
PiXiEEDraw / My Page)」は、**Bridge製品自身の説明文であり、PiXiEED.jp全体のルート一覧そのものではありません**。
実際にはhelp/contact/community/notes/glossary/events/noticeなど、コンテンツ系ページも現役です。混同しないでください。

### 2.2 進行中の新実装(`pixiedraw2/src/platform/**`, 未追跡)

`00_START_HERE/WORK_PACKAGE_REGISTRY.json` によれば、Site/Commerce/Social/Ops系は以下の順で
「COMPLETE_CANDIDATE(隔離スコープで実装・レビュー済み、本番未検証)」まで到達しています。

```text
SITE-400 → MARKET-410 → WORK-420 → SOCIAL-430 → OPS-440 → PLATFORM-450 → SITE-460
```

次候補は `NATIVE-500`(デスクトップ/モバイルのネイティブ配布境界)で、`auto_start_next: false` により
自動着手はされません。**注意**: `09_ROADMAP/WORK_PACKAGES/PLATFORM-450.md` 本文の `status` は
`IN_PROGRESS` である一方、Registry JSON側は `COMPLETE_CANDIDATE` と記録されており、**2つの正本間で
ステータスの矛盾があります**。`00_START_HERE/LATEST_CANONICAL_DECISIONS.md` の規則上、矛盾は勝手に
統合せず確認を取るべき事項です。次にPLATFORM-450/NATIVE-500に着手する前に、この矛盾をCodex側で
解消してもらうのが安全です。

`SITE-460` の実装は `pixiedraw2/index.html` と `pixiedraw2/dist/site460-browser-entry.js` を明示的な
書き込み許可範囲としており、今回のセッションで私が行ったDraw2パネルのUI改善(アセットビルダー、詳細設定カード等)は
この許可範囲内の `pixiedraw2/index.html` / `assets/draw2-shell.css` に対する変更で、SITE-460の枠組みと
矛盾しません。ただし `dist/draw2-entry.js` への直接パッチ(i18nロケールのデフォルト値修正など)は、
SITE-460の `allowedWriteGlobs` には明記されていない領域への変更である点は明確にしておきます
(壊れてはいませんが、正式な書き込み許可の外です)。

### 2.3 進行中・未コミットのサイトシェル変更

`git status` の時点で、以下がステージされずに残っています。

```text
account/index.html, community/index.html, contact/index.html, events/index.html,
help/index.html, index.html, market/index.html, notes/index.html, notice/index.html,
pixiedraw/index.html, post/index.html, posts/<uuid>/index.html,
scripts/shared-bottom-nav.js, scripts/shared-locale.js, scripts/shared-profile-header.js,
site/home-shell.css, site/public-design-system.css
(未追跡の新規ファイル: scripts/shared-page-motion.js, site/shared-ui-transition.css)
```

`shared-locale.js` だけで140行規模の差分があり、`shared-bottom-nav.js`・`shared-profile-header.js` も
変更中です。ファイル名から判断する限り、**共通ナビゲーション・多言語表示・プロフィールヘッダー・
ページ遷移モーションの並行改修がすでに走っています**。誰(Codexか、以前のセッションか)の変更かは
コミットログからは分かりません。今回の「サイト全体構成の見直し」を進める前に、**この差分の内容を
先にレビューし、意図と完成度を確認する**のが最優先だと考えます。ここを把握せずに新しい構成案を出すと、
並行作業と衝突します。

### 2.4 ナビゲーション設計の正本

`02_ARCHITECTURE/APP_SHELL_NAVIGATION_DESIGN_SYSTEM_CORE.md`(NORMATIVE_ISOLATED)が、将来の
`/core-shell/` エントリのナビゲーション構造(`home / projects / assets / tools / search /
notifications / market / sns / account / help`)とレスポンシブ規約(Phone <720px / Tablet 720–1099px /
Desktop 1100–1439px / Wide ≥1440px、横スクロール禁止、`dvh`+`safe-area`)を定義済みです。
`core-shell/` は `noindex,nofollow` の隔離プレビューであり、現行ナビゲーションの置き換えではありません。
「ページ構成の最適化」を進めるなら、まずこの正本のナビゲーションマップを土台にするのが二重投資を避ける道です。

---

## 3. 現状評価: アプリとしての動き

`00_START_HERE/LATEST_CANONICAL_DECISIONS.md` が指す `03_PRODUCTS/PIXIEEDRAW2_UX_SPEC.md` により、
ワークスペースの挙動はすでに決まっています。

- **PC**: Asepriteレベルの即応性 + Unity/Unreal/Figma的なDock/Inspector/Asset整理を構造参照(コピーではない)。
- **Tablet**: landscapeはcompact dock、portraitはCanvas-first + Side/Bottom Sheet。
- **Mobile**: 現行PiXiEEDraw同様、Canvas-first・縦画面優先。
- **共通規約**: ページ全体の横/縦スクロール禁止(`100dvh` + safe-area、パネル内スクロールのみ)。
  ハイリスクな操作はアイコンのみ禁止、必ず可視ラベル付き。全アイコンにアクセシブルネーム・ツールチップ・
  ショートカット・disabled理由が必要。

今回のセッションでDraw2の詳細設定カード・アセットビルダーに行ったUI改善(アイコン+タイトル+説明文の
「ツールタイル」化)は、この規約(アイコンのみ禁止、disabled理由の明示)に沿っています。この路線を
他のパネル(Export設定、Game詳細設定、Audio関連)にも広げるのは正本と矛盾しません。

---

## 4. 現状評価: リアルタイム同期の実装方針

> **[2026-08-31 追記] この節はOwnerの決定により更新されました。**
> 本節はClaudeによる現状分析(`BRIEFING_ANALYSIS`)であり、Owner自身の決定ではありません。
> Ownerは2026-08-31付で「PiXiSYNCは今後廃止・触らない」「Cross-Tool Live Editおよびオンライン複数人同期はPiXiEED Bridgeに一本化する(PiXYNC＝Bridge)」と明示的に決定しました。
> 詳細・用語整理・ギャップ一覧は `ADR-20260831-REALTIME-SYNC-PIXYNC-BRIDGE-UNIFICATION.md` を正とします。以下は決定前時点の分析として履歴保存のみを目的に残します。

「リアルタイム同期をどう実装するか」への回答は、**どのレイヤーの同期を指すか**で全く別の答えになります。

| レイヤー | 目的 | 現状 | 保護レベル |
| --- | --- | --- | --- |
| **PiXiSYNC** | 現行`pixiedraw`の保存・共同編集同期(Realtime、RPC、Table、Policy、Migration契約) | 本番稼働中 | Preservation Gateで明示保護。互換性証明なしに置換禁止。チェックポイント取得・再接続・オフラインキュー・2クライアント収束を壊してはならない |
| **Cross-Tool Live Edit** | 同一Projectを開くDraw2/Audio/Game **別ウィンドウ間**の状態共有(Asset Revision, Frame ID, FPS, Marker等の「作品出力に関係する正式データ」のみ共有。Zoom/Tool/Selection等のUI状態は共有しない) | CANONICAL仕様確定、実装は進行中 | 実ブラウザでの完了条件(1ドット修正が新Revisionとして検知される等)が明記済み。競合はLast-write-winsで黙って上書きしない設計 |
| **PiXiEED Bridge** | **同一マシン上の別ネイティブアプリ**(Aseprite/Unity等)とPiXiEEDを繋ぐloopback WebSocketハブ(`pixieed.realtime/1`)。アカウント・クラウドリレー・TLS・複数ユーザールームは対象外(MVP境界) | 別リポジトリで契約(schema/protocol)は確定。`pixiedraw2/src/pixync/bridge-provider.ts` が接続クライアントとして実装済み | LAN/WANへの公開は明示的に禁止。外部公開・複数ユーザー化は別のsecurity/service/legal gateで設計する方針 |

### 提案する切り分け

- **「複数人が同時に同じ作品を編集する」体験** → 既存PiXiSYNCの延長線上で考える。ゼロから作り直すのではなく、
  Preservation Gateの手順(baseline評価 → compatibility adapter → shadow比較 → staged canary → rollback証明 →
  owner承認)に沿う。
- **「同じ人が開いたDraw/Audio/Gameのウィンドウ同士を同期する」体験** → Cross-Tool Live Edit仕様の実装を進める。
  これは新規のサーバー同期基盤ではなく、既存Asset Graph/Revision機構の上に成り立つ設計。
- **「PiXiEEDと外部ツール(Aseprite/Unity等)を繋ぐ」体験** → 別製品であるBridge(Tauriネイティブ)の話。
  ブラウザ版サイトの「ページ」の話ではないので、サイト構成の最適化とは切り離して扱うべき。

**この3つを1つの「リアルタイム同期」として一緒くたに設計すると、Preservation Gateの禁止事項
(現行PiXiSYNCの無断置換)に抵触するリスクが高いです。** サイト全体の統括としては、まずどの体験を
今回のスコープにするかをCodexとも共有した上で着手することを推奨します。

---

## 5. ギャップとリスク(見つかった矛盾・要確認事項)

1. **PLATFORM-450のステータス矛盾**: `WORK_PACKAGES/PLATFORM-450.md` = `IN_PROGRESS` vs
   `WORK_PACKAGE_REGISTRY.json` = `COMPLETE_CANDIDATE`。着手前に解消が必要。
2. **`pixieed-bridge/README.md`の「現行サイト残存4領域」という記述と、実際の`current-public-routes.md`の
   ルート一覧に乖離がある**。前者はBridge製品の自己紹介文であり、サイト全体のルート権威ではない。
3. **`pixiedraw2/`はGit未追跡**。SITE-400〜SITE-460という正式なWork Packageの実装対象でありながら、
   一度もコミットされていない。ローカルでの作業内容が失われるリスクがあるため、コミットを検討するタイミングを
   Codex側と合わせるべき(このセッションでは指示がない限りコミットしません)。
4. **サイト共通シェル(nav/locale/profile-header/motion)に未コミットの並行変更がある**。今回の「ページ構成見直し」を
   始める前に、この差分の意図・完成度を確認しないと、重複または衝突した変更になる可能性が高い。
5. **`dist/draw2-entry.js`への直接パッチはSITE-460の正式な書き込み許可範囲外**。今回のUI改善(ロケールのデフォルト値、
   ボタン再設計)はローカル検証では正しく動作を確認済みですが、正式なWork Package手続きの外で行った変更である旨を
   明記しておきます。Codex側でSITE-460のContext/Evidenceに正式反映するか、別途整理が必要です。

---

## 6. 推奨する次のステップ

優先順位が高い順に並べています。いずれも**コード変更・Git操作・本番影響は伴いません**。

1. **未コミットのサイトシェル差分(2.3)の内容を確認する。** `git diff` を読み、意図(誰が何のために
   進めていた変更か)を明らかにする。これをせずに新しいページ構成案を出すと二重作業になります。
2. **PLATFORM-450のステータス矛盾(5-1)をCodexに確認してもらう。** Registry/定義ファイルのどちらが
   正しいかを明確にしてから、NATIVE-500着手可否を判断する。
3. **「リアルタイム同期」のスコープをアルタさんと確定する(4章の3レイヤーのどれか、または組み合わせ)。**
   これによって実装がPiXiSYNC延長線か、Cross-Tool Live Edit実装か、Bridge連携強化かが変わります。
4. **ナビゲーション再設計は`APP_SHELL_NAVIGATION_DESIGN_SYSTEM_CORE.md`のマップを土台にする。** ゼロから
   新しいIA(情報設計)を考えるのではなく、既存正本のNavigation Map(home/projects/assets/tools/search/
   notifications/market/sns/account/help)を実際のページ構成にどう対応させるかを詰める。
5. **`pixiedraw2/`のコミット方針を決める。** 未追跡のまま作業を続けるとローカル環境依存になり、Codexとの
   分業(コードの受け渡し)がしづらくなります。

---

## 7. Claude/Codexの役割分担案

依頼のとおり「私がサイト全体を統括、Codexがツール詳細を改善」という前提で、既存のAgent Orchestration
(`sol_max`=coordinator read-only、`luna`=implementation、`terra`=independent review)と矛盾しない形の
分担案です。

| 役割 | 担当 | 内容 |
| --- | --- | --- |
| 方向性・優先順位の確定 | 私(Claude) | 本書のような現状評価、Work Package間の矛盾の指摘、どのCanonical文書を土台にするかの整理、リアルタイム同期のスコープ選定の支援 |
| 横断的なUXの一貫性チェック | 私(Claude) | 複数パネル・複数ページにまたがる操作性・言い回し・アイコン運用の一貫性(今回のDraw2パネル改善はこの延長) |
| Work Package単位の実装 | Codex | `allowedWriteGlobs`内での実装、`node --check`等の検証、ADR/Contracts/Inventoryの更新 |
| 独立レビュー | 既存のterra_high等の枠組み | 正式なWork Packageとして進める場合は、既存のレビュー体制を踏襲 |

私からCodexに渡す際は、この文書のほか、関連するCanonical文書のパスと、5章で挙げた矛盾点を
明示的に伝えることを推奨します。

---

## 8. 参照した既存正本(このセッションで実際に読んだもの)

```text
AGENTS.md
PLANS.md
CURRENT_SYSTEM_PRESERVATION_GATE.md
00_START_HERE/LATEST_CANONICAL_DECISIONS.md
00_START_HERE/WORK_PACKAGE_REGISTRY.json
00_START_HERE/PRESERVATION_FIRST.md
09_ROADMAP/PIXIEED_COMPLETION_ROADMAP.md
09_ROADMAP/WORK_PACKAGES/SITE-460.md
09_ROADMAP/WORK_PACKAGES/PLATFORM-450.md
02_ARCHITECTURE/CROSS_TOOL_LIVE_EDIT.md
02_ARCHITECTURE/PIXIEED_PRODUCT_STRATEGY.md
02_ARCHITECTURE/APP_SHELL_NAVIGATION_DESIGN_SYSTEM_CORE.md
02_ARCHITECTURE/PUBLIC_URL_ROUTING_CORE.md
02_ARCHITECTURE/TOOL_BRIDGE_CORE.md
docs/codex-workflow-notes.md
docs/inventory/current-public-routes.md
CODEX_TASK_PROMPTS/README.md
pixieed-bridge/README.md (別リポジトリ)
git log / git status(作業ツリーの実状態)
```
