# PiXiEEDstudio 完了判定表

更新日: 2026-08-28
対象: iDRAW / iAUDIO / iGAME / PiXYNC / Package / Publish / Beta / Production

## ゴール

iDRAW・iAUDIO・iGAMEを別ツールとしてではなく、同じProject Sessionに接続された
ひとつのPiXiEEDstudioとして完成させる。ユーザーはどのモードから始めても、素材を作り、
同じProjectへ接続し、複数人で安全に編集し、Playtestし、検証済みPackageとして配布できる。

本表の全行が必要なEvidenceで埋まり、最後のProduction判定がREADY_FOR_PRODUCTIONに
なるまで、ゴール達成とは表示しない。

## 判定語

| 判定 | 意味 |
|---|---|
| IMPLEMENTED | ソース、契約、画面、失敗時の境界が実装済み |
| ISOLATED_VERIFIED | ローカルの型検査・単体検査・統合検査・必要なブラウザ検証がPASS |
| LIVE_VERIFIED | 指定環境の実Provider、実認証、実Storage、実Realtimeを使った証拠がPASS |
| PRODUCTION_VERIFIED | 本番相当の運用、端末、負荷、監視、Rollbackまで証拠がPASS |
| UNTESTED | 実行に必要な環境・証拠がない。PASSへ補完しない |
| BLOCKED | 失敗または安全条件違反のため、修正・再実行が必要 |

ISOLATED_FIXTUREのPASS、ソースHash、型検査だけではLIVE_VERIFIEDへ昇格させない。

## 段階0〜8のExit Criteria

| 段階 | ゴールに必要な状態 | 正規Evidence | 現在の判定 |
|---|---|---|---|
| 0. 統合基盤 | iDRAW/iAUDIO/iGAMEのどこからでも同じProjectを開き、切替・再読込でProject identityを維持する | 3モードのブラウザ導線、Project Session、状態復元 | IMPLEMENTED + ISOLATED_VERIFIED |
| 1. Golden Project | DrawのSpriteとAudioのBGM/SFXをGameへ接続し、Playtestできる | LIVE参照、PINNED manifest、Project/Revision/Hash一致 | IMPLEMENTED + ISOLATED_VERIFIED |
| 2. PiXYNC共同編集V1 | 2〜3人のOperation、ACK、Presence、再接続、履歴、Checkpoint、権限が安全に収束する | 実stagingのactor別ログ、最終Project Hash、再接続Catch-up | IMPLEMENTED + ISOLATED_VERIFIED。実RealtimeはUNTESTED |
| 3. 共通UI/UX | 3モードで同じCommand/Inspector/Undo/Redo/保存/復旧語彙を使え、Guided/Detailedを切替できる | Desktop/Tablet/Mobileの操作記録、アクセシビリティ、復旧結果 | IMPLEMENTED + ISOLATED_VERIFIED |
| 4. iDRAW | Layer×Frame×Cel、Sprite範囲、Pivot、Animation、Exportを一連で使える | Draw機能・PXD・ペンタブ・端末検証 | IMPLEMENTED + ISOLATED_VERIFIED。実端末はUNTESTED |
| 5. iAUDIO | Track×Time×Clip、録音、波形、Mixer、Automation、Effect、Renderを一連で使える | Audio機能・BGM/SFX出力・再生・端末検証 | IMPLEMENTED + ISOLATED_VERIFIED。実入力/端末はUNTESTED |
| 6. iGAME | Scene、Entity、Component、Collider、Event/Graph、Debug、Playtest、Buildを使える | Scene/Runtime/Buildの再現性、入力・端末・負荷 | IMPLEMENTED + ISOLATED_VERIFIED。実端末/負荷はUNTESTED |
| 7. Package/Publish | PXD/Audio/Gameを同じRevisionから決定的に生成し、権利・依存・Hashを追跡できる | Manifest、Package Hash、Artifact ZIP、Build identity | IMPLEMENTED + ISOLATED_VERIFIED + LOCAL_ARTIFACT_VERIFIED |
| 8. Beta/Production | 下記8チェックをstaging、Beta、Productionの各対象で通過し、段階公開・監視・Rollbackできる | Readiness Evidence schema v2、承認、運用Receipt | IMPLEMENTED + ISOLATED_VERIFIED。実環境はUNTESTED |

## Stage 8の必須チェック

各Targetで8行すべてがLIVE_VERIFIED以上にならない限り、次のTargetへ進めない。
Productionでは、実行結果だけでなくPackage Hash、Project Revision、承認者、Rollback対象を固定する。

| Check ID | 合格に必要な証拠 | 現在 |
|---|---|---|
| STAGING_DEPLOYMENT | staging URL、Deploy Revision、Package Hash一致、起動と主要導線 | UNTESTED |
| COLLABORATION_2_TO_3 | 異なる2〜3ユーザー、同時Operation、ACK、最終Project Hash収束 | UNTESTED |
| RECONNECT_RECOVERY | 切断、未配送、再接続、権威Catch-up、重複/欠落なし | UNTESTED |
| DEVICE_BROWSER_MATRIX | desktop/tablet/mobile × 対象ブラウザでCanvas、Timeline、Piano Roll、Scene、Play | UNTESTED |
| PERFORMANCE_BUDGET | startup、scene load、first frame、steady frame、memory、asset bytes、decoded bytes、Long Task | UNTESTED |
| MONITORING_ALERTS | Runtime/Realtime/Storage/Rate limitの検知、通知、抑制を実環境で再現 | UNTESTED |
| ROLLBACK | 直前Revisionへ戻し、データを失わず公開面を復旧したReceipt | UNTESTED |
| NATIVE_SHELL | Capacitor Android/iOSの起動、保存、戻る、権限、Web fallback | UNTESTED |

### Performanceの合格境界

Stage 8 live harnessは、Canvas準備時間、最初のCanvas frame、Production接続までの時間、
定常frameの最大値、取得可能なHeap、Long Task、Resource転送量をperformanceObservationとして
記録する。ただし、ブラウザResource TimingをAsset本体のbyte数やdecode後のbyte数と見なさない。
そのためassetBytesとdecodedBytesが実Asset Registry/Runtimeから提供されるまでは、観測結果が良好でも
PERFORMANCE_BUDGETをPASSへ昇格させない。

## Projectデータの保持・起動・削除Gate

Projectを増やしても重くならないことと、削除失敗時に復旧できることを、統合Studioの独立したGateとして扱う。

| 項目 | 実装した境界 | 現在の判定 |
|---|---|---|
| 自動保存の保持 | Draw2のメモリUndoは最大128件、永続Undo/Redoは最大8件かつ768KiB。旧Productionの冷却Undoは通常64件／1件512KiB、軽量モード32件／1件512KiB。タイムラプスは通常240イベント／16MiB・Checkpoint16件／32MiB、軽量モード120イベント／8MiB・Checkpoint8件／16MiBで上限到達時だけ記録を停止し、編集内容の自動保存は続ける。PiXiEEDraw旧V2は通常の復旧リビジョンを最大2件に整理し、整理失敗時は保存本体を保持したまま1回再試行して警告状態を返す。Draw2 V2のProject単位書込は同一タブで直列化し、削除後は小さなcurrent tombstoneで遅延書込を拒否する。PiXYNC IndexedDBはSnapshot本文と別の`deletedProjects` storeを持ち、削除後の遅延保存を本文を読まずに拒否する | IMPLEMENTED + ISOLATED_VERIFIED。世代圧縮と実端末の長時間負荷はUNTESTED |
| Project起動 | Start画面は一覧メタデータを先に読み、payloadは選択ProjectだけをID指定で取得する。Recentは小さなmetadata sidecarを優先し、旧V1だけ初回移行時に対象payloadを読み、同一タブのPiXYNC IndexedDB persistenceは1本に共有する。キャッシュ済みSnapshotを返す前も小さな削除印だけを確認し、CAS競合時だけキャッシュを破棄して再読込する。ChooserのDOMは初回60件、必要時に60件ずつ追加する | IMPLEMENTED + ISOLATED_VERIFIED。実Supabaseのshared openはUNTESTED |
| ローカル削除 | 自動保存の進行中書込を待ち、確認 → Draw/Audio/Game/PiXYNC local snapshot → Manifestの順で削除し、途中失敗ならManifestとカードを残して再試行できる。V1/V2形式を問わずProject ID単位のUndo／タイムラプス関連データも掃除する。Audioの参照済みOPFS revisionも先に消す。冷却UndoとタイムラプスはProject単位の書込遮断・削除・空確認を行い、Recentのメモリ／IndexedDB双方に削除印を残して遅延保存による復活を防ぐ。Draw2のPiXYNC削除は`clear()`ではなく、Snapshotをキー削除し`deletedProjects`へ恒久削除印を同一transactionで残す`remove()`を使う | IMPLEMENTED + ISOLATED_VERIFIED。実ブラウザでテスト生成Projectの全関連レコード削除まで確認。既存ユーザーProjectと実端末の長時間削除はUNTESTED |
| 共有PiXYNC削除 | UUID共有Projectは認証済みserver-owned detachを完了してからlocal cleanupを行う。所有者はローカライズ済みmember記録が存在する場合だけdetachでき、旧Production経路もRoom ID・status・generation・action/statusを検証する。未認証・権限不足・未ローカライズ・不正な応答ではカードとlocal dataを残して再試行する | IMPLEMENTED + ISOLATED_VERIFIED。実Supabase/stagingの権限・監査ReceiptはUNTESTED |

### 2026-08-28 保持量の測定結果

256×256の合成Projectへ128回の広範囲描画を投入した比較では、永続Undo/Redoのシリアライズ量が
約5.98MBから約0.68MBへ減少し、Checkpointを含む1回の保存レコードは約6.08MBから約0.80MBへ減少した。
これは履歴を全セッションのアーカイブにしないためのローカル合成測定であり、端末・ブラウザ・Productionの
PERFORMANCE_BUDGET合格値ではない。

同日のローカル実ブラウザ自動保存試験では、同一Projectのrevisionが1から2へ進み、同一Projectのrecent
行は1件、復旧リビジョンは2件、常駐payloadは0件、セッション不一致は0件だった。空のINDEXレイヤーは
`uint8-palette-zero-transparent-v2`の型付き配列で保存されるため、Int16Arrayだけを要求しない。

同日の更新Bundleで既存Projectを3回再オープンしたところ、ナビゲーションは100〜109ms、Draw persistence復元・
PiXYNC local session確認までの総時間は307〜393msだった。これはローカル単一ブラウザの測定値であり、実Supabaseの
ネットワーク遅延やStage 8の性能合格値ではない。Recent indexはpayloadを持たないメタデータ投影として読み、既存Projectを
勝手に件数削除しない。Chooserは125件の合成Projectで初回60件→120件→125件を確認した。

同日、アプリ内ブラウザから同じProject IDへ直リンクで1回開いた測定でも、337msで`restored / active`へ到達し、
Project Startは非表示、ページ上のエラー表示は0件だった。これもローカル単一ブラウザの1回測定であり、端末・ネットワーク・
複数ユーザーのPiXYNC性能予算へは昇格させない。

同日の実ブラウザ内合成試験では、256×256 Canvasへ180回の全幅ストロークを連続投入し、ページエラー0、自動保存dirty=false、
live履歴80件、冷却履歴57件／上限64件を確認した。入力イベントをブラウザ内で合成した測定であり、OS入力・実端末の性能合格値ではない。
タイムラプスは容量到達時に3イベントを保持したまま停止し、Undo状態変更後も使用量メタデータを維持し、削除と同時に来た遅延書込を残さないことを確認した。

500件の既存Projectメタデータを同じブラウザへ投入した追加計測では、対象Projectの自動保存中にRecent storeの全件`openCursor`は0回、
対象Recent payload行の`get`は0回、対象行の`put`は1回、同じIDの小さなメタデータ・サイドカーは`get`／`put`各1回以上で、保存後の`dirty=false`と
ページエラー0を維持した。これは自動保存の対象行更新が全Project走査やpayload読込へ戻っていないことを示すローカル実ブラウザ証拠である。
旧V1 payloadを8件×1MiB投入した移行試験では、初回起動だけが不足サイドカーごとに本体を読む一方、2回目の起動はRecent payloadの`get` 0回、
`getAll` 0回、sidecarの`getAll` 0回でカードを復元し、旧payload自体も保持した。初回Start一覧の全件読込、実端末の性能合格値は別途`UNTESTED`である。

V2の整理失敗を合成注入した検証では、最新Manifestのコミットを維持したまま一時的に3世代となり、次の正常保存で
Manifest／Checkpoint／Journal／Thumbnailが各2件へ戻った。保存本体と履歴整理を分離するための安全境界であり、
永続的な端末容量不足・実端末の再起動復旧は別途`UNTESTED`である。

大容量Checkpointを含む追加の実ブラウザ検証では、Journal保存と世代整理がCheckpoint／Journal／Thumbnail本文を
`getAll`で読み込まず、Manifestの`getAll` 1回とキー列挙だけで完了した。Project削除も4ストアの`getAllKeys`だけを
使い、削除後のManifest／Checkpoint／Journal／Thumbnailと通常current参照は0件だった（current storeには小さな削除印のみ残る）。`node scripts/test-pixiedraw-v2-key-only-maintenance-runtime.mjs`
で固定したローカル証拠であり、IndexedDB実装差・実端末の長時間負荷・容量不足時の挙動は別途`UNTESTED`である。

削除と遅延保存の競合を追加検証した。V2は同一Projectの保存を直列化し、別タブ相当の遅延書込が削除後に到着した場合は
`ERR_AUTOSAVE_PROJECT_DELETED`で拒否する。削除後の本文4ストアは0件で、current storeには本文を持たない小さな削除印だけが残る。
Recentも削除行とmetadata sidecarを消したうえで削除印を残し、同じIDの遅延metadata移行・thumbnail更新がカードを復活させない。
`node scripts/test-pixiedraw-v2-key-only-maintenance-runtime.mjs`、`node scripts/test-pixiedraw-autosave-new-project-runtime.mjs`、
`node scripts/test-pixiedraw-recent-project-metadata-runtime.mjs`で確認した。これはローカルChromium・合成fixtureと同一タブの証拠であり、
複数OSプロセス、実端末、既存ユーザーの復旧・削除は`UNTESTED`である。

Draw2 PiXYNCのローカル削除境界も追加検証した。`snapshots`本文を読み込まず、`deletedProjects`の小さな管理レコードと
Snapshotのキー削除を同一transactionで確定し、別インスタンスの遅延`atomicReplace`・Journal再オープンを
`PROJECT_DELETED`で拒否した。削除後の`clear()`でも削除印は消えず、同じProject IDの再作成を防ぐ。
`deno test --no-remote --check tests/pixync/pixync-draw2-130-indexeddb.test.ts tests/pixync/pixync-draw2-170-cross-tab-cas.test.ts`
で16件PASSしたが、これは注入Factoryの契約試験であり、別OSプロセス・実端末・容量不足時の受入れには昇格させない。

独立したローカル実ブラウザの削除試験では、3件のRecent Project（共有2件、ローカル1件）をfixtureとして投入し、共有Project 1件だけを
UIから削除した。remote detachのfixture RPCは1回だけ呼ばれ、対象Snapshotは消え、`deletedProjects`の削除印は残り、別の共有ProjectのSnapshotと
ローカルProjectのRecentカードは保持された。同じBrowser Contextをreloadした後もRecentは2件のままで、削除対象は復活しなかった。ページエラー0、
Console error 0も確認した。
`node scripts/test-pixiedraw2-project-delete-runtime.mjs`の結果は`pass=true`であり、これは実Supabaseや実ユーザーProjectを変更しないローカル
Browser Contextの証拠である。実remote detachの監査Receipt、既存ユーザーProject、実端末は引き続き`UNTESTED`である。

## 実装順序と停止条件

~~~text
Stage 0/1: Project + Golden vertical slice
       ↓
Stage 2/3: Operation/PiXYNC + 共通Command/UI
       ↓
Stage 4/5/6: Draw/Audio/Gameの本格機能
       ↓
Stage 7: Hash固定Package + Publish Intent
       ↓
Stage 8A: staging実接続・2〜3人・再接続
       ↓
Stage 8B: 端末/ブラウザ・性能・監視・Rollback・Native
       ↓
Stage 8C: Beta → 段階Production公開
~~~

- 共有Project/Asset/Operation契約が壊れた場合は、各モードの機能追加を止めて契約を先に直す。
- 失敗時に保存状態、権限、Revision、Hashを説明できない場合は、UI改善より先に復旧境界を直す。
- 実環境Evidenceの欠落をfixture PASSで埋めない。
- Deploy、Migration適用、Rollback、公開、Store提出は、対象環境・Package Hash・承認が揃うまで実行しない。
- Stage 8のどれかがFAILまたはBLOCKEDならBeta/Productionへ進めない。

## 現在からゴールまでの具体的な実行表

### 1. ローカルGateを固定する

以下を変更ごとに通す。失敗したら次の段階へ進めない。

~~~text
cd /Users/tsukadareine/Documents/GitHub/PiXiEED/pixiedraw2
deno task check
deno task test
deno task test:pixync
deno task test:studio
deno task test:studio-integration
deno task test:stage8
deno task build
cd /Users/tsukadareine/Documents/GitHub/PiXiEED
node --check scripts/test-pixiedraw2-stage8-live.mjs
node scripts/test-pixiedraw-autosave-new-project-runtime.mjs
node scripts/test-pixiedraw-autosave-recent-key-runtime.mjs
node scripts/test-pixiedraw-recent-metadata-sidecar-runtime.mjs
node scripts/test-pixisync-project-delete.mjs
git diff --check
~~~

実ブラウザでは、通常操作、iDRAW→iGAME Sprite、iAUDIO→iGAME Audio、Project再読込、
広範囲高速描画、Undo/Redo、2ブラウザ収束を記録する。

### 2. stagingを用意する

Productionと別のSupabase Project、別の公開URL、Realtime Authorization、private Storage、
Room/active membership、初期Checkpoint、2つの異なる認証ユーザーを用意する。認証Stateとキーは
リポジトリへ置かない。Migration適用前にsupabase db push --dry-runで対象を確認し、Productionの
リンク先へ誤適用しない。

### 3. 実staging Evidenceを作る

~~~text
PIXIEED_STAGE8_BASE_URL=https://<staging-host>
PIXIEED_STAGE8_PROJECT_ID=<staging-room-uuid>
PIXIEED_STAGE8_STORAGE_STATE_A=/secure/stage8-user-a.json
PIXIEED_STAGE8_STORAGE_STATE_B=/secure/stage8-user-b.json
PIXIEED_STAGE8_SUPABASE_URL=https://<staging-ref>.supabase.co
PIXIEED_STAGE8_SUPABASE_PUBLISHABLE_KEY=<staging-publishable-or-anon-key>
PIXIEED_STAGE8_PACKAGE_HASH=<release-candidate-package-sha256>
PIXIEED_STAGE8_EVIDENCE_OUT=/secure/stage8-live-observation.json
node /Users/tsukadareine/Documents/GitHub/PiXiEED/scripts/test-pixiedraw2-stage8-live.mjs
~~~

このハーネスが生成するのはLIVE_OBSERVATION / STAGINGであり、Production合格ではない。
出力のperformanceObservationは測定の入口で、assetBytes/decodedBytes欠測中は性能Gateの
Evidenceにしない。

### 4. Readinessを対象別に判定する

- staging: STAGING_DEPLOYMENTをPASSにしてから、残り7チェックを埋める。
- beta: stagingの8チェックをすべてPASSにし、明示承認付きPROMOTE_BETAだけを作る。
- production: productionで8チェックを再実行し、PUBLISH_PRODUCTIONとRollback対象を固定する。
- Readiness CLIがREADY_FOR_*を返すまでExecutor、公開、通知、Feature Flag変更を呼ばない。

## ゴール到達を阻む現在の外部入力

現在のローカル実装・分離検証は進行可能だが、以下が揃わない限りStage 8の実環境判定は確定しない。

1. Productionと分離されたstaging URL / Supabase Project UUID / publishable key
2. stagingへ適用してよいMigration承認と、Room・Storage・Realtime権限の準備
3. 異なる2ユーザーの認証済みPlaywright storageState
4. Release CandidateのPackage Hashと対象Project Revision
5. Desktop/tablet/mobileの実端末、対象ブラウザ、テスト担当者
6. Performance Budgetを測るAsset Registry/Runtime byte計測と、負荷試験条件
7. Monitoring/Alert/Rate limit/Incident/rollbackの実運用アクセス
8. Android/iOSのビルド・起動・署名・配布を確認できる環境

これらは推測で埋めず、受領後に一つずつEvidenceへ変換する。現時点で確認できているのは、
ローカル契約・分離テスト・ローカル実ブラウザ・Artifact生成までである。

### 2026-08-28 外部状態の監査結果

- Supabaseの接続一覧は現在のリンク先1件だけで、Productionと分離されたstagingは確認できない。
- `supabase db push --dry-run`は成功し、Draw2 authority、Market、Format capacity、Presence authorization、所有者ローカライズ記録の
  fail-closed修正を含む6 Migrationを「Would push」と表示した。実適用は行っていないため、Migration適用済みとは扱わない。
- `supabase migration list`は成功し、現在のremoteは`20260805020000`まで適用済み、上記6 Migrationはlocal-onlyと確認した。
  Productionへ誤適用しないため、今回も`db push`は実行していない。
- `supabase status`はDocker daemonへ接続できず、ローカルSupabase環境の起動も確認できない。
- よって、現在のStage 8判定はコード不足ではなく、staging環境・認証・Migration・実運用Evidence待ちである。

### 2026-08-28 外部状態の再監査

- `supabase projects list`では、現在のCLIセッションから見えるProjectはProductionの1件（`kyyiuakrqomzlikfaire`）だけだった。
  `supabase branches list --project-ref kyyiuakrqomzlikfaire`はAccess Token未提供で実行できず、Preview Branchをstagingとして確認できていない。
- `supabase db push --dry-run`は再度成功し、未適用候補6本を表示した。実適用はしていない。
- `supabase migration list`の再実行は`cli_login_postgres`のpassword authentication failedで終了した。過去の成功記録（remoteが`20260805020000`までという記録）は履歴として保持するが、今回の再監査でremote状態を再確認できなかったため、現在のMigration適用状態は`UNTESTED`として扱う。
- `scripts/test-pixiedraw2-stage8-live.mjs`は必須の`PIXIEED_STAGE8_BASE_URL`がない状態でfail-closedした。これはハーネスの安全動作であり、staging受入れのPASSではない。
- `adb devices`は接続端末0件、`simctl`は利用可能なDeveloper toolなし、`xcodebuild -version`もXcode本体未選択で終了した。Android debug buildの成功は確認済みだが、Android実機／iOS Simulator／iOS実機の起動・保存・戻る操作は`UNTESTED`のままにする。

### 2026-08-28 Native配布物のローカルGate

- Capacitor stagingの`pixiedraw2`は実行時allowlistへ限定し、iDRAW／iAUDIO／iGAME／Playerと遅延Chunkの24ファイルだけを
  Web／Android assetへ同期する。開発用`src`、`tests`、`benchmarks`、`docs`、`fixtures`、Deno設定はAPKへ含めない。
- `node scripts/test-capacitor-stage-manifest.mjs`、`node scripts/test-fp007-real-qualification.mjs`、`npm run build:web`、
  `npm run cap:sync`、`npm run android:build:debug`、staged URLの実ブラウザ起動をPASSした。これは`NATIVE_SHELL`のローカル
  配布物Gateを満たす証拠だが、実機起動・保存・戻る操作・iOS・署名・Store運用の`UNTESTED`を変更しない。
- `npm run test:native-runtime`でWeb／Android／iOS／debug APKの`pixiedraw2` runtime集合を24ファイルallowlistと照合し、
  開発用ファイルの混入0件を確認する。

## 最終判定

次の条件をすべて満たしたときだけ、PiXiEEDstudioをゴール到達とする。

- Stage 0〜7がIMPLEMENTED + ISOLATED_VERIFIED以上
- Stage 7のPackage Hash、Revision、License、Artifact、Build identityが固定
- stagingのStage 8全8項目がLIVE_VERIFIED
- BetaのStage 8全8項目がLIVE_VERIFIED
- ProductionのStage 8全8項目がPRODUCTION_VERIFIED
- 未適用Migration、未確認端末、未確認監視、未確認Rollbackが残っていない
- Readiness CLIが対象TargetでREADY_FOR_*を返す
- 承認済みPackageとRollback対象が一致し、公開後の監視結果が記録される

この最終条件を満たすまで、表示上の完成度が高くても判定はIN_PROGRESSとする。
