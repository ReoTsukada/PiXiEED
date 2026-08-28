# PiXiEEDstudio Release Runbook

更新日: 2026-08-28
対象: 段階7 Package/Publish、段階8 Beta/Production

## 目的

PiXiEEDstudioのRelease Candidateを、ローカル検証・staging・Beta・Productionへ
同じ判定基準で進める。証拠がない項目は自動的に `UNTESTED` とし、未確認の環境を
公開可能と表示しない。

段階0〜8を最後まで進めるExit Criteriaと外部入力の一覧は
[PIXEEDSTUDIO_COMPLETION_MATRIX.md](./PIXEEDSTUDIO_COMPLETION_MATRIX.md)に固定する。

## 判定の入口

1. `pixiedraw2/src/studio/package-publish.ts` でPXD、Audio、Gameの3つの固定参照Packageを作る。
2. Asset RegistryのAsset ID、Revision、Hash、Owner、License、サイズ、MIMEを照合する。
3. `createStudioBuildRequest` でWP-160の固定Dependency Snapshotへ変換する。
4. Build計画のHashを再生成し、同じ入力から同じBuild identityになることを確認する。
5. `pixiedraw2/src/studio/artifact-materializer.ts` でPXD、全体Render WAV、canonical Game JSONを
   ローカルArtifactとして生成し、決定的ZIPを検証する。
6. 外部公開が必要な場合だけ、明示的な `STUDIO_PUBLISH_INTENT` を作成する。

Readinessの判定は、ローカルで作成したCandidateとEvidenceを同じGateへ渡せる。
  読み取り専用のCLIは `scripts/evaluate-pixieedstudio-readiness.ts` で、入力が足りない、
Hashが不一致、環境が不一致、またはfixtureだけの場合は `BLOCKED`／`NOT_READY` で終了する。

```text
deno run --no-remote --allow-read \
  scripts/evaluate-pixieedstudio-readiness.ts \
  --candidate /secure/release-candidate.json \
  --evidence /secure/stage8-readiness-evidence.json \
  --target BETA
```

終了コード0は指定Targetの `READY_FOR_*` だけを意味する。CLIはアップロード、公開、Deploy、
Feature Flag変更、通知を実行せず、出力にもToken、Email、User ID、素材本体を含めない。

Publish Intentはアップロードや公開を実行しない。配布・Storage・Market・ストア提出は、
承認済みの別処理として扱う。

## 外部公開・Rollbackの操作境界

`pixiedraw2/src/studio/release-operation.ts` は、Publish IntentとReadiness Reportから
対象別の操作計画を作る。`DEPLOY_STAGING`、`PROMOTE_BETA`、`PUBLISH_PRODUCTION`、
`ROLLBACK`のいずれも、作成しただけでは外部へ接続しない。

- 操作計画、Readiness Report、Package Hashを再検証してから、期限付きの明示承認を要求する。
- 実行時に外部Executorへ渡すのはProject／Package／Revision／Hashと冪等キーだけで、素材本体やTokenを渡さない。
- 実際のProviderはHost側から注入し、`operationId`を冪等キーとして扱う。Studio CoreはNetwork、Storage、Flag、Deployを所有しない。
- Providerが失敗しても自動Rollbackは行わず、失敗Receiptを残して人間承認のRollback計画へ戻す。
- RollbackはOperational Safetyが`ROLLBACK_REQUIRED`を返した同一Package／同一計画からだけ作成できる。

この契約の4件の失敗注入・承認・改ざん・Rollback試験はローカルでPASSしている。
ただし、実Provider、staging、Beta、Productionの実行結果はまだ`UNTESTED`であり、
外部Executorを接続する前に対象環境とMigrationを明示する。

## 段階8の8チェック

| Check | 必須証拠 | 合格条件 |
|---|---|---|
| `STAGING_DEPLOYMENT` | stagingのRevision、URL、rollback対象 | 対象Package Hashが一致し、起動・主要導線が確認できる |
| `COLLABORATION_2_TO_3` | 2〜3人のactor、Operation、ACK、Checkpoint | 同時編集後のProject Hashが収束する |
| `RECONNECT_RECOVERY` | 切断・再接続・再送ログ | 欠落・二重適用・古いRevisionの混入がない |
| `DEVICE_BROWSER_MATRIX` | desktop、tablet、mobile、主要ブラウザの結果 | Canvas、Timeline、Piano Roll、Scene、Playが操作できる |
| `PERFORMANCE_BUDGET` | startup、first frame、steady frame、memory、asset bytes、long task | 選択したRuntime profileの予算内 |
| `MONITORING_ALERTS` | エラー、遅延、Realtime、Storage、Rate limitの監視結果 | 検知・通知・抑制が再現できる |
| `ROLLBACK` | 直前Revisionへの復旧記録 | データを失わず、公開面だけを安全に戻せる |
| `NATIVE_SHELL` | CapacitorのAndroid／iOS起動・保存・戻る操作 | Web fallbackを保ち、端末固有の主要導線が動く |

## Target別の進め方

### STAGING

`STAGING_DEPLOYMENT` がPASSになった時点で `READY_FOR_STAGING` とする。ただし、残りの
チェックは未検証のままレポートに残す。これはstagingへ配置できるという意味であり、Betaや
Productionの承認ではない。

### BETA

8チェックすべてをstaging環境でPASSにする。特に共同編集は2〜3人を実際に接続し、
再接続、Checkpoint、権限拒否、Presenceの一時性を確認する。Performanceは測定値を記録し、
推測値や単体fixtureを合格値に使わない。

### PRODUCTION

8チェックすべてをproduction環境でPASSにし、Release CandidateのPackage Hash、Project
Revision、License snapshot、Build artifactを固定する。承認者、公開対象、Rollback対象を
記録してから、段階公開と監視を開始する。どれか一つでも `FAIL` または `BLOCKED` なら公開しない。

## 現在の証拠境界

- Package、Registry、License、再現可能Build identity、ローカルArtifact／決定的ZIP、Publish Intent:
  ローカル契約・単体検証・実ブラウザUIで検証済み。
- Draw／Audio／Gameの個別機能: ローカルの型・単体検証済み。
- PiXYNCの実Realtime、認証、Storage、stagingの2〜3人試験: `UNTESTED`。
- 実機、主要ブラウザ全組合せ、負荷、監視、Rollbackの実環境試験: `UNTESTED`。
- Capacitorのネイティブ起動・ストア署名・提出: `UNTESTED`。署名情報や外部公開は別承認が必要。

この境界は `pixiedraw2/src/studio/release-readiness.ts` のGateで保持する。Evidenceを
作成しない限り、ローカルPASSからBeta／Productionへ昇格しない。
Readiness Evidence（schema v2）は`evidenceKind=LIVE_OBSERVATION`を明示的に要求し、
`ISOLATED_FIXTURE`のPASSはハッシュが正しくてもstaging／Beta／Productionへ昇格させない。

## 2026-08-27 ローカル実装チェックポイント

- 2026-08-28時点のPiXYNC scoped testは199件、Studio integration（PiXYNC + Studio）は232件PASS。ProviderのPrivate Channel認証準備、Realtime状態伝播、再接続後の権威Catch-up、接続失敗時のChannel解放、合成Readiness Evidenceの昇格拒否、Operational Safetyの改ざん検知、Draw2 authorityのRate Window契約、初期Roomの認証済み`begin → upload → activate`境界を含む。
- SITE-400のscoped testは27件PASS。iGAMEのcreate/open/reload、Registry identity、Feature Flag rollback、直接重複createのfail-closed境界を含む。
- `deno task build`と`deno task build:workspace`でDraw2 Bundleを再生成し、入口のcache-busterを`20260828-studio-artifacts-v1`へ更新した。実ブラウザではiAUDIO起点→iGAME→iDRAWの同一Project遷移と、表示エラーなしを確認した。
- `npm run build:web`と`npm run cap:copy`は成功し、36エントリをCapacitorのWeb／Android／iOSへコピーできた。Android Debug APKにもArtifact操作UIと`20260828-studio-artifacts-v1`を含むBundleを確認した。これはローカルstaging準備の証拠であり、staging URLや公開Artifactの証拠ではない。
- Android Debug Buildは成功した。ただし接続Android端末はなく、iOS DoctorはXcode本体がないため失敗した。実機・Simulator・TestFlight・Play内部トラックは引き続き`UNTESTED`である。
- `supabase db push --dry-run`では、Draw2 authorityを含む6 Migrationが「Would push」と表示された。Database変更は
  実行していないため、実Realtime受入れは`UNTESTED`である。`supabase migration list`は成功し、remoteは
  `20260805020000`まで適用済み、6 Migrationはlocal-onlyと確認した。Productionへ誤適用しないため`db push`は実行していない。
- `pixiedraw2/src/studio/operational-safety.ts`に、Runtime budget、Runtime／Realtime／Storage異常、Rate limit、Rollback対象のハッシュを一つのローカル安全判定へ束ねる契約を追加した。観測値とRollback計画の改ざんはfail-closedになり、異常時は`HOLD`、承認済みRollback計画がある場合だけ`ROLLBACK_REQUIRED`になる。Telemetry収集・Feature Flag変更・Rollback実行は行わないため、実環境の`MONITORING_ALERTS`／`ROLLBACK`証拠には昇格させない。Draw2 authority側にも、重複再送を除く新規Operationの1秒120件制限をmigration契約として追加した。
- `deno task test:stage8`を追加し、3クライアント分離受入れ、Runtime Observation、Operational Safety、Readiness Gateを一括検証できるようにした。分離受入れでは240操作、順序逆転、重複配送、切断中の未配送、再接続Catch-up、最終Project Revision一致を確認する。Stage 8 scoped testは14件PASSしている。
- `pixiedraw2/src/pixync/room-provisioning.ts`に、認証確認→サーバー発行Room／Checkpoint ID・Storageパスの照合→PXDアップロード→revision 0有効化を直列化した。入力改ざん、未認証、Storage失敗、異常な有効化結果はfail-closedで、未適用の実Supabaseへは接続していない。
- `pixiedraw2/src/pixync/remote-checkpoint.ts`に、`open_session`のRoom／Revision／Storage path／サイズ／SHA-256／PXD内部Hashを検証してから復元する境界を追加した。`pixiedraw2/src/pixync/checkpoint-publishing.ts`は`prepare → upload → register → attest → activate`を直列化し、2人以上の検証待ちではcandidateをactiveにしない。いずれもローカル契約検証であり、実Supabaseへの適用・接続は引き続き`UNTESTED`である。

### 2026-08-27 実ブラウザ反復描画チェック

- ローカルの実ブラウザ上で、256×256 Canvasにペン1pxのほぼ全幅ストロークを8周×32行、合計256入力として実行した。入力時間は16.7秒で、停止・表示エラー・`role=alert`は発生しなかった。
- Draw2の実行時メトリクスは`backend=reference-indexed`、`prep=65536px`、`present=65536px`、`journal=33`、`checkpoints=1`、`allocatedTiles=64`、`scope=CANONICAL`だった。保存状態は`saved`、同じProjectを再読込後は`restored`になった。
- 描画後の42点サンプル、再読込後の10点サンプル、Undo 1回、Redo 1回を確認し、色の保持・復元・履歴の往復に不整合はなかった。ブラウザ開発ログは0件だった。
- 同じ失敗条件を`pixiedraw2/deno.json`の`test:rapid-broad-stroke`にも固定し、256×256を4周（1024本、各256px）上書きして、最終Raster、64タイル、1024操作、32 Checkpoint、Golden全画素描画の一致を確認した（1件PASS）。
- これはローカルの単一ブラウザによる反復描画証拠であり、`PERFORMANCE_BUDGET`、実端末、複数人Realtime、Productionの合格証拠には昇格させない。

### 2026-08-28 高速・広範囲の反復描画／再読込チェック

- ローカルの実ブラウザ上で、256×256 Canvasに対して全幅の水平ストロークを短時間に反復した。初回512入力（256件の実変更と256件の同値再描画）に続けて、同じ範囲を反対色で256入力上書きし、合計768入力・512件の実変更を確認した。
- 上書き周回後もCanvasは全面表示を維持し、`backend=reference-indexed`、`prep=256px`、`present=256px`、`journal=512`、`checkpoints=128`、`allocatedTiles=64`、`scope=CANONICAL`、`role=alert=0`、ブラウザ開発ログ0件だった。
- Project IDを保持したまま再読込し、保存状態`restored`、`prep=65536px`、`present=65536px`、`journal=32`、`checkpoints=1`、`allocatedTiles=64`を確認した。再読込後のスクリーンショットでも256×256の全面描画が保持され、Undo→Redo→再読込の往復にも破綻はなかった。
- 再読込後の`journal=32`は、永続化する操作履歴を最新32件に制限する既存仕様であり、Canvas本体の欠落ではない。保存された正規化Snapshotから全面描画が復元されていることを別途確認した。
- これはローカル単一ブラウザでの実画面回帰証拠であり、実端末・主要ブラウザ組合せ・複数人Realtime・`PERFORMANCE_BUDGET`・Productionの合格証拠には昇格させない。

### 2026-08-28 高速描画の最終反復チェック

- 現行Bundleの実ブラウザで、256×256 Canvasへ全幅水平ストロークを4周×64行、合計256入力として約8.2秒で実行した。描画後は`saved`、`prep=65536px`、`present=65536px`、`journal=96`、`checkpoints=17`、`allocatedTiles=64`、`scope=CANONICAL`、`role=alert=0`だった。
- 同じProjectを再読込して`restored`、`prep=65536px`、`present=65536px`、`journal=32`、`checkpoints=1`、`allocatedTiles=64`を確認した。Undo→Redoも復元し、警告表示・Drawエラーは0件だった。
- これはローカル単一ブラウザでの追加回帰証拠であり、実端末・主要ブラウザ組合せ・複数人Realtime・`PERFORMANCE_BUDGET`・Productionの合格証拠には昇格させない。

### 2026-08-28 高密度ストロークと履歴往復の追加確認

- 現行ブラウザで、256×256 Canvasへ25点の全幅ジグザグストロークを16回、全域消去を8回、別色での全幅再描画を8回、待ち時間を挟まず実行した。実行時間は約569msと287msで、`role=alert`は0件、ブラウザ開発ログも0件だった。
- 最終状態は`drawPersistenceState=saved`、`prep=65536px`、`present=65536px`、`journal=7`、`checkpoints=1`、`allocatedTiles=16`、`scope=CANONICAL`。CanvasとOverlayは256×256、ドキュメントのscroll幅・高さは1280×720で、はみ出しはなかった。
- Undo 1回後にUndo 3回→Redo 3回を連続実行してもエラーはなく、Project IDを明示して再読込した後は`drawPersistenceState=restored`、同じCanvas、`undo=6`、`redo=1`を確認した。`new_project=1`は再読込時にも新規Projectを作る仕様のため、保存確認は`project=`で行った。
- これは同一ブラウザのローカル実画面回帰であり、実端末・別ブラウザ・複数人Realtime・負荷予算・Productionの合格証拠には昇格させない。

### 2026-08-27 iDRAW Sprite → iGAME 接続チェック

- 同じProject IDを開いた状態で、iDRAWのAssetパネルを表示し、新規Assetを作成した。
- AssetタブとAsset編集面の初期`inert`が解除されること、空きセル選択→Canvas範囲選択で
  `Hero`の待機・正面を1コマ登録できること、保存状態が`saved`になることを実ブラウザで確認した。
- iGAMEへ切り替え、Game配置を追加してiDRAWの`LIVE`参照を接続した。Game側には
  `iDRAW参照 · draw2-project-mtblzpee-96eb67b1-666:draw:main`と表示され、原素材は参照専用になった。
- iGAMEのAsset catalogでDraw由来の`Hero`と`IDLE`クリップ（1フレーム、12 FPS）を確認し、Game側のアニメーションとして割り当てた。再生→停止も通過し、Game側の割り当て状態と原素材の編集不可境界は維持された。
- 再読込後も同じProject ID、1 Game配置、iDRAW参照が復元され、iAUDIO→iDRAW→iGAMEのモード切替でも
  Project IDが変わらず、`role=alert`は0件だった。
- 再読込後も`IDLEをGame設定として割り当てました`の状態が保持され、Animation previewの再生・停止で
  `編集状態は変更されません`を確認した。
- これはローカル単一ブラウザの統合導線証拠であり、実Realtime、複数ユーザー、staging、Productionの
  合格証拠には昇格させない。

### 2026-08-27 iAUDIO → iGAME 接続・Playtestチェック

- iAUDIOから新規Projectを開始し、Piano Rollへノートを追加した。保存状態が`saved`になり、
  1小節・120 BPM・4/4のCompositionと2 MIDIイベントが表示された。
- iGAMEでGame配置を追加し、`Audio全体ミックス`を`iAUDIO LIVE`参照として接続した。Game側には
  `参照のみ · 原素材は編集不可`と表示され、`role=alert`は0件だった。
- Projectカードから再オープンした後も、iAUDIOの2 MIDIイベントとiGAMEの
  `New Asset 1 · iAUDIO参照LIVE · Audio全体ミックス参照のみ`が保持された。
- GameのガイドからPlayを開始して`Runtime READY`、停止して`Runtime STOPPED`を確認した。
  Playtestの実行状態は編集状態と分離され、Project IDは維持された。
- これはローカル単一ブラウザの統合導線証拠であり、実Realtime、複数ユーザー、staging、Productionの
  合格証拠には昇格させない。

### 2026-08-28 iGAME初期Route競合の回帰チェック

- `?new_project=1&mode=GAME&igame=on` を修正後に5回連続で起動し、すべて
  `site400IgameRoute=ready`、Route理由なし、`role=alert` 0件、Project永続状態`saved`を確認した。
- 競合原因だった初期化中の重複`create`はStudio側で順序化し、受理済みProjectへの後続要求を`open`へ
  収束させた。SITE-400共通Controllerの重複Create拒否契約は変更していない。
- 同じブラウザでRPGスターター配置、NPCイベント保存、Play開始、矢印キー2回の入力を行い、
  `Runtime READY`とPlayer `1,1`→`2,2`を確認した。
- これはローカル単一ブラウザの回帰証拠であり、実Realtime、複数ユーザー、staging、Productionの
  合格証拠には昇格させない。

### 2026-08-28 iGAME新規作成UIのコンパクトデスクトップ確認

- 1280×720の実ブラウザで、新規iGAMEの「RPGテンプレート／空のScene」選択カードが右ドック下端で
  クリップされ、ボタン全体を押せない表示不具合を再現した。
- `pixiedraw2/assets/draw2-shell.css`で新規Gameの作成選択をスクロール可能なGameパネルの先頭へ
  配置し、CSS cache-busterを更新した。修正後は選択カード全体が表示され、RPGテンプレートの実クリックで
  4オブジェクト生成、作成案内表示、Route `ready`、`role=alert` 0件を確認した。
- これはローカル単一ブラウザのUI回帰証拠であり、他端末・主要ブラウザ全組合せの証拠には昇格させない。

### 2026-08-28 Native/Web Release Candidate同期確認

- `npm run doctor`、`npm run build:web`、`npm run cap:copy`を実行し、36エントリをCapacitorのWeb／Android／iOSへ同期した。
- Android Debug Buildは成功し、生成APK内にPiXiEEDstudioのHTML、`draw2-shell.css`、`draw2-entry.js`、Artifact操作UIを含むBundleが存在し、`20260828-studio-artifacts-v1`も反映されていることを確認した。
- iOS `doctor`はCommand Line ToolsのみでXcode本体が選択されていないため失敗した。iOS Simulator／実機／署名／App Store提出は引き続き`UNTESTED`である。
- これはローカルRelease Candidate準備の証拠であり、staging URL、実機、ストア公開の証拠には昇格させない。

### 2026-08-28 Studio Release Candidate UI接続確認

- iGAMEのGame Build画面から、iDRAW・iAUDIO・iGAMEを同一Projectの`PINNED`参照として固定し、PXD／AUDIO／GAMEの3Packageを検証できる導線を追加した。
- CandidateのManifestはAsset ID、Revision、Hash、Owner、License、MIMEなどのメタデータだけを表示し、素材本体のバイト・ピクセル・PCMは含めない。Candidate自体は`metadata-only`のまま、次のArtifact生成へ明示的に進める。
- `Publish Intentを作成`はCandidate検証後の明示操作に限定し、Intent作成後もアップロード・公開・Storage・Market変更は行わない。
- Game編集Revision、iDRAW参照、iAUDIO参照の再照合を行い、Candidate作成後の変更がある場合は古いIntentを拒否する。
- 実ブラウザでRPGスターターを配置後、Candidate検証、Manifest表示、Publish Intent作成、`role=alert` 0件を確認した。これはローカル単一ブラウザのUI／契約証拠であり、実Storage、staging、Production配布物の証拠には昇格させない。

### 2026-08-28 ローカルArtifact生成・決定的ZIP検証

- `pixiedraw2/src/studio/artifact-materializer.ts`を追加し、CandidateのProject／Revision／Hash／License参照を
  再照合してから、iDRAWのPXD v2、iAUDIOの全体Render WAV、iGAMEのcanonical Game JSONを同じGolden Revisionから
  materializeするようにした。各実体には固定MIME、byteLength、SHA-256、元Package Hashを記録する。
- ZIPは`packages/pxd/project.pxd`、`packages/audio/master.wav`、`packages/game/game-project.json`の固定パスへ
  決定的順序で収録し、Artifact Manifest、manifest hash、reproducible build identityを含める。同じ入力から
  同じZIPを再生成でき、Candidate改ざん、ソースHash不一致、実体バイト変更、サイズ変更、パストラバーサルを
  fail-closedで拒否する。`tests/studio/artifact-materializer.test.ts` 3件、Studio integration 206件がPASSした。
- 実ブラウザでRPGスターターとiAUDIO MIDI状態を同じProjectへ保持したまま、Candidate検証→Artifact生成→ZIP取得を
  実行した。表示結果はPXD 85,202B、AUDIO 32,044B、GAME 2,843B、ZIP 122,005B、ZIP Hash prefix
  `5c7b14ae0cd8`で、Manifestには3種のArtifact、`manifestHash`、`reproducibleBuildIdentity`が表示され、
  raw bytes／pixels／PCMキーは含まれなかった。ブラウザ開発ログは0件だった。
- Artifact生成とZIP取得は現在ローカル処理だけで、Supabase Storage、Marketplace、外部公開、Store提出は実行していない。
  実Storage・staging・Productionの配布物証拠には昇格させず、Stage 8の`UNTESTED`境界を維持する。

### 2026-08-28 Stage 8ローカル3クライアント受入れ

- `tests/pixync/pixync-draw2-400-stage8-acceptance.test.ts`で、Draw／Audio／Gameを含む240操作を3クライアント
  から同時Commitした。配送順を逆転させ、全操作を重複配送しても各クライアントの適用回数は一意になり、
  Serverと3クライアントのProject Revision、Aggregate Revision、Operation ID列が一致した。
- 1クライアントを切断している間はそのクライアントへ操作が配送されず、再接続後のCatch-upだけで欠落した
  操作を回復した。ローカル実行時間は82.92msだったが、これは分離fixtureの観測値であり、Productionの
  latency／throughput予算や実Realtimeの合格値には使わない。
- 同時CommitでIn-memory SequencerがRevisionを競合発行し得る問題を検出し、Commit入口を直列化した。
  修正後は`deno task test:stage8` 14件、`deno task test:studio-integration` 232件がPASSした。
- この受入れは`ISOLATED_FIXTURE`であり、実Supabase認証／Realtime、staging、Production Evidenceへは昇格させない。

### 2026-08-28 2ブラウザProduction Composition境界チェック

- `pixiedraw2/tests/pixync/pixync-draw2-350-two-browser-production.cjs`を、異なるactorを持つ2つの
  ブラウザContextで実行した。生成したPXD v2 CheckpointをStorageモック経由で復元し、双方が
  `production/subscribed`へ到達した後、Drawのリモート反映、iAUDIOのBPM変更、iGAMEのGame Object追加を
  同一Projectへ順にCommitできた。Drawでは、色を変えながら左右反転させる64本の高速・全幅ストロークを
  同じProjectへ追加した。
- Realtime通知を各Revision 2回分として配送してもOperationは1回だけ適用され、ローカルUndo/Redoが
  リモートOperationを再送しないこと、閉じたClient Bが再接続後にDrawとGameをCatch-upできることを確認した。
  最新結果は`pass=true`、`operations=185`、`aggregateOperationCounts=draw:183/audio:1/game:1`、
  `rapidBroadDraws=64`、`rapidTileStamps=64`、`rapidMirroredDraws=32`、`rapidSelectionFills=1`、
  `rapidSelectionStrokes=1`、`rapidSelectionShapes=1`、
  `rapidEllipseSelectionStrokes=16`、`rapidSelectionTransforms=1`、
  `rapidCanvasConverged=true`、`rapidDrawSaved=true`、`duplicateHintsPerRevision=2`、
  `reconnectCaughtUp=true`、`remoteUndoDepthPreserved=true`、`gameCaughtUp=true`、ページエラー0件だった。
  256×256全面の`rect-fill`、X軸ミラー付き全幅ストローク、矩形選択内Fill／Stroke／Shapeも実行し、
  同じ2クライアント間でそれぞれのCanvasが収束することを確認した。さらに楕円選択を保持したまま
  全幅Strokeを16回反復し、選択外へ漏れず、同じ2クライアント間でCanvasが収束することを確認した。
- Bundle再生成後に同じ2ブラウザCompositionを3回実行し、3回とも同じ185操作（Draw 183／Audio 1／Game 1）、
  保存完了、Canvas収束、再接続Catch-up、重複通知抑止、ページエラー0件を確認した。これはタイミング依存の
  再現性を確認するための反復結果であり、実端末や実Realtimeの負荷試験ではない。
- 初回の高速Drawでは、ローカルCanvasと保存は進む一方、展開Bundleの通常ペンが全塗布ピクセルを
  `writeSet`へ展開し、PiXYNCの配列上限96で拒否される不具合を検出した。通常ペン／消しゴム／
  Pixel Perfect Pen／1px Line／太いブラシはポインタ経路とブラシ設定だけを送ってEditorCore側で補間・展開する方式へ変更した。
  さらに、矩形・楕円・円・太線Lineは座標・ブラシ設定だけを送る`shapeCommit`へ切り替え、
  サーバーの上限を緩めず再実行した。高速反復の1周目はLine、2周目はPixel Perfect Penである。
- 非矩形選択のFill／Stroke／Shape／通常Tile Stampは、選択点をJSON配列に展開せず、行スパンRLEをBase64化した
  `selectionMask`メタデータとして送るcanonical commandへ切り替えた。Core／Draw adapterの契約テストで、
  256×256楕円マスクのFill・Stroke・Shape・Tile Stampが選択外へ漏れず、`writeSet`を生成しないこと、
  マスクデータが文字列としてboundedに送られることを確認した。Draw adapterでは同マスクのWire JSONが8KiB未満、
  Production CompositionではPayload全体を16KiBでfail-closedする。実ブラウザでも楕円選択付き全幅Stroke 16回と
  Move Transform 1回の反復、2クライアント収束を確認した。
  一方、矩形選択のFill・Stroke・Shapeは、範囲を4整数で伝える`clip`メタデータ付きの
  `raster.fill`／`raster.strokeCommit`／`raster.shapeCommit`へ統一し、矩形外へ漏れないことと2ブラウザ収束を確認した。
  ミラー付きPen／Shapeも、同じくboundedなミラー記述子付きcanonical commandへ統一した。選択範囲なしの通常Fillと方向付き
  グラデーションFillは、開始点・終了点・色・`maxCells`だけを送る`raster.fill`へ、通常のTile Stampは
  source Assetの範囲・Revision・原点・倍率だけを送る`raster.tileStamp`へ統一した。
  非矩形選択付き変形は、RLE `selectionMask`・選択範囲Bounds・変形記述子だけを送る
  `selection.transformCommit`へ統一し、Core／Undo履歴rebase／Draw adapterの遠隔適用で同じRasterへ収束することを確認した。
  実画面での2ブラウザ変形反復も同じCompositionで確認済みであり、保存済み選択スタンプは引き続き画素集合経路が残る。
  本番Composition接続中は、残る`writeSet`または変形Payloadが96配列要素／16KiBを超える場合にローカル状態へ適用する前に拒否し、
  同期されない変更を残さない。
- 初回実行では、v2判定を持たない古い`dist/draw2-legacy-compat.js`と、旧UIのGameセルを前提にした
  フィクスチャの不整合を検出した。Legacy互換Bundleを再生成し、Checkpoint／Storage／Presenceのモックと
  現行の「オブジェクト追加」導線へ更新してから再実行し、PASSへ戻した。
- さらに、1ストロークへ大量のcoalesced pointerサンプルが入る場合を想定し、512サンプルを始点・終点保持の
  決定的圧縮で96点へ収める契約テストを追加した。圧縮後の`strokeCommit`はPayload検証、別クライアントへの
  適用、Raster Hash一致まで通過し、実際の送信配列がPiXYNC上限を超えないことを確認した。ブラウザの実機
  coalesced-event全組合せは別途`UNTESTED`である。
- 64回のTile Stamp連続入力を追加した再実行では、約100操作で発生していた耐久Snapshotの512KiB超過を検出した。
  適用済み操作のEnvelope全体を保持していたことが原因だったため、適用Receiptへ集約し、未処理／クラッシュ復旧中の
  記録を残したまま、完了済みEnvelopeとOutboxは直近8件だけ保持するようにした。160回連続Commit後のSnapshot、
  再起動後のOrderKeeper復元、古い操作のDuplicate再送も契約テストで確認した。
- 高速入力で遅れて届く自己Echoが後続Canvasを過去のRaster Hashと比較して失敗する問題も検出した。既適用Command IDを
  正規マーカーとして再適用せず処理するようにし、遅延自己Echoの回帰テストと2ブラウザ実画面で確認した。
- これは疑似権威とローカルBundleによる`ISOLATED_FIXTURE`であり、実Supabase Realtime、staging、実端末、
  Productionの合格証拠には昇格させない。実環境のStage 8は引き続き`UNTESTED`である。

### 2026-08-28 Runtime Observation境界

- `pixiedraw2/src/studio/runtime-observation.ts`に、実行時の起動・Scene読込・初回Frame・定常Frame、heap、Asset byte／decoded byte、Long Taskを記録する注入式セッションを追加した。Asset IDは重複計上せず、Asset計測完了の明示がない場合は欠測として扱う。
- 同じセッションでRuntime／Realtime／Storage／Monitoring／Operationのカウンタを限定的に記録し、`createStudioOperationalObservation`へPackage Hash、capture時刻、性能評価、Rate Windowを結びつける。`finish()`は冪等で、完了後の追記を受け付けない。
- browser adapterは`performance.now()`、`performance.memory.usedJSHeapSize`、Long Task counterの読み取りだけを担当する。Telemetry送信、Feature Flag変更、Rollback実行は行わないため、実staging／Productionの`MONITORING_ALERTS`と`PERFORMANCE_BUDGET` Evidenceは引き続き`UNTESTED`である。
- PiXYNC authority SQLも同じPayloadの深さ・キー数・素材本体キー・正の`clientSequence`制限を検査する。クライアント側の検査だけでは実環境の安全性を証明しないため、Migration適用後にSQL実行結果を別Evidenceとして取得する。

このチェックポイントはローカル／分離環境の証拠を追加しただけで、8項目のProduction Evidenceを自動的にPASSへ昇格させない。

### 2026-08-28 高速入力時の正規状態キュー回帰

- 高速入力を模した`Draw110Editor.commitPencil`の同時32件投入で、修正前は全操作が成功扱いでも最終Rasterに最後の1点しか残らず、Undoの「変更前」状態も同じ初期状態になる競合を再現した。
- `pixiedraw2/src/draw2/draw-110/raster-editor.ts`に確定処理の直列キューを追加し、同時投入でも全32点、連続した`clientSequence`、32段のUndo履歴を保持するよう修正した。キューが失敗した後も次の操作を受け付ける境界を含めて`tests/draw-110/raster-editor.test.ts`へ固定した。
- 実画面側でも`commitPointerPoints`、`commitWriteSet`、塗りつぶし、パレット変更を共通の`enqueueCanonicalOperation`へ通し、リモート操作・タイムライン操作と正規状態の更新順を統一した。入口契約テスト4件、Draw110テスト6件、型検査をPASSした。
- Bundle再生成後、実ブラウザでCanvasへ連続32ストロークを待ち時間なしで入力し、`drawPersistenceState=saved`、`journal=32`、`checkpoints=8`、Canvas 256×256、`role=alert=0`、ブラウザ開発ログ0件を確認した。
- これはローカルの順序性・回帰証拠であり、複数端末Realtime、実機、stagingの性能予算、Production Evidenceへは昇格させない。

### 2026-08-28 同一Projectの複数タブ保存CAS回帰

- `draw2-persistence.ts`の旧実装は同じRevisionの保存を`savedAt`で比較していたため、別タブの
  スナップショットが後から完了すると、もう一方の編集を静かに上書きできる余地があった。
- 保存APIへ期待Revision／期待State Hashを追加し、IndexedDBの1つのreadwrite transaction内で基底一致を確認してから
  書き込むCAS境界へ変更した。同一RevisionでHashが異なる候補、および基底が古い候補は
  `stale-write-ignored`として保存しない。Memory Storeにも同じ規則を適用した。
- 回帰テストでは同一基底から2候補を同時保存し、成功1件・stale 1件、保存結果が勝者のどちらかであることを確認した。
  `test:workspace-manifest`は12件、通常Drawテストは60件、Studio／PiXYNC統合は206件、Stage 8は14件PASSした。
- 実ブラウザで同じProjectを2タブから同時描画し、片方が`state=saved`、もう片方が
  `state=stale-write-ignored`となることを確認した。双方とも`role=alert`は0件だった。
- これはローカルIndexedDBのタブ競合証拠であり、実Supabase RealtimeのOperation merge、複数端末、staging、Productionの
  受入れには昇格させない。stale側の編集を自動マージする機能はPiXYNCのサーバーOperation経路の責務として別途確認する。

### 2026-08-28 iAUDIO/iGAME同一Project保存CAS回帰

- iAUDIOはFPS／PPQなどの同一Revisionメタデータ更新を維持しつつ、期待するProject RevisionとCheckpoint Hashを
  保存時に比較するようにした。同じRevisionでもCanonical Audio State Hashが異なる候補は、Timestampだけで勝たせない。
- iGAMEにも同じ期待Revision／State HashのCASを追加し、IndexedDBのreadwrite transaction内で基底一致を確認する。
  保存がstaleになった場合はローカルのCommitイベントとManifest更新を行わず、`stale-write-ignored`を表示する。
- `tests/audio-200/persistence.test.ts`の31件、`tests/workspace/project-subdocuments.test.ts`の9件、通常Draw 60件、
  Studio／PiXYNC統合206件、Stage 8 14件、全体型検査をPASSした。
- 実ブラウザ2タブで同一ProjectのPiano Roll編集を同時に行い、iAUDIOは`saved` 1件／`stale-write-ignored` 1件、
  `role=alert` 0件、警告・エラー0件を確認した。同じくiGAMEのScene配置を同時に行い、`saved` 1件／
  `stale-write-ignored` 1件、`role=alert` 0件、警告・エラー0件を確認した。
- これはローカルIndexedDBの保存競合を止める証拠であり、stale側の編集を自動マージするものではない。実Supabase
  RealtimeのOperation merge、複数端末、staging、Productionの受入れには昇格させない。

### 2026-08-28 現行Bundleの高速全幅描画128回回帰

- cache-buster `20260828-pixync-presence-v1` の現行Bundleを実ブラウザで開き、ペンを明示選択して256×256 Canvasへ
  全幅水平ストロークを待ち時間なしで128回投入した。描画直後は`drawPersistenceState=saved`、`journal=128`、
  `checkpoints=32`、`allocatedTiles=64`、`scope=CANONICAL`、Canvas 256×256、`role=alert=0`だった。
- 同じProject IDを指定して再読込したところ、`drawPersistenceState=restored`、`prep=65536px`、`present=65536px`、
  `journal=32`、`checkpoints=1`、`allocatedTiles=64`、Canvas 256×256、エラー表示0件を確認した。再読込後の
  `journal=32`は永続化履歴の上限であり、保存Snapshotから全面描画が復元されている。
- これは現行Bundleの単一ブラウザ回帰であり、実端末、別ブラウザ、複数人Realtime、`PERFORMANCE_BUDGET`、Productionの
  合格証拠には昇格させない。大量入力の正規状態・完全描画・再読込復元は、静的1024操作テストと合わせて判定する。

### 2026-08-28 現行Bundleの高速反復・別色上書き回帰（再実行）

- 新しいローカルブラウザタブで256×256 Canvasへ全幅ストロークを64行×往復（128入力）投入し、続けて別色の全幅
  上書きを64回、待ち時間を挟まず実行した。同色往復の同値書き込みは正規化されるため、最初の周回後のJournalは64件、
  別色上書き後は`journal=128`となった。上書き後の保存状態は`saved`、`revision=76`、`checkpoints=32`、
  `allocatedTiles=64`、`scope=CANONICAL`、Canvas 256×256、`role=alert=0`、`pixyncError`空、ブラウザ警告・エラー0件だった。
- 同じProject IDを`project=`で開き直し、`drawPersistenceState=restored`、`prep=65536px`、`present=65536px`、
  `journal=32`、`checkpoints=1`、`allocatedTiles=64`、Canvas 256×256、Project ID維持、`role=alert=0`を確認した。
- これは現行Bundleのローカル単一ブラウザ実画面回帰である。同色再描画のno-op正規化、別色上書き、保存・再読込の状態境界は
  確認済みだが、実端末、別ブラウザ、複数人Realtime、`PERFORMANCE_BUDGET`、Productionの合格証拠には昇格させない。

### 2026-08-28 PiXYNC PresenceのProduction接続境界

- Production composition rootからPrivate Realtime ChannelのPresenceを接続し、表示名・現在モード・選択対象だけを
  一時同期するようにした。Operation、ACK、描画データ、PCM、Game本体、CheckpointはPresenceへ載せず、既存の耐久
  journal／権威RPC経路から分離している。
- `pixiedraw2/src/pixync/supabase-sdk-port.ts`はSupabase SDKのPresenceイベント・状態・`track`／`untrack`を内部Portへ
  変換し、`pixiedraw2/src/pixync/supabase-provider.ts`は接続時の再検証、再接続時の再`track`、切断時の`untrack`、
  不正または過大な受信値の破棄を行う。`pixiedraw2/src/draw2-entry.ts`ではPresenceを共同編集UIの人数・モード表示へ
  投影する。
- `supabase/migrations/20260827202238_pixync_draw2_presence_authorization.sql`で、Broadcastはowner／editor送信のまま、
  Presenceだけを認証済みactive memberの送受信へ分離した。Migrationはローカルに追加しただけで、リモートDatabaseへ
  は適用していない。`supabase db push --dry-run`では、このMigrationを含むローカル未適用Migrationが6件「Would push」と表示される。
- `deno task test:pixync`は199件、`deno task test:studio-integration`は232件、`deno task test:stage8`は14件、通常Drawの
  `deno task test`は60件すべてPASSし、`deno task check`と現行Bundleの再生成もPASSした。Presenceの境界試験には、
  bounded metadata、identity binding、sync／join／leave、再接続、切断、journal非混入、SDK fallbackを含む。
- これは実Supabaseの接続成功やstagingの2〜3人受入れを意味しない。Migration適用後の認証済み実ユーザー、Realtime
  Presence、権限拒否、再接続、端末、負荷、監視、Rollbackは引き続き`UNTESTED`であり、Production Evidenceへ昇格させない。

### Stage 8 staging実接続ハーネス

- `scripts/test-pixiedraw2-stage8-live.mjs`は、明示されたstaging URL、staging Supabase URL、公開キー、別々の認証済み
  Playwright `storageState` 2個、UUID形式のProject IDが揃った場合だけ起動する。未設定時は即時終了し、現行Productionの
  PiXiEED host／Supabase projectは安全弁で拒否する。検証結果にはProject IDのSHA-256だけを出し、Token・Email・User IDは
  出力しない。
- 2クライアントが同一Projectへ`production/subscribed`で接続し、Presence Membersが双方2以上になることを確認する。
  その後、Aクライアントからデフォルトで48行×2往復（96 Stroke、各Stroke 8サンプル）の全幅描画を待ち時間なしで投入し、
  Aの保存Revision更新、BのCanvas変化、A/Bの全Canvas PNGダイジェスト一致、Project ID維持、同期状態、`role=alert`、ページ／Consoleエラーなしを確認する。描画の非同期反映が落ち着くまで待ってから比較する。続けてBだけを
  Playwrightのoffline emulationで切断し、Aから追加描画、Bの`offline`／`reconnecting`、復帰後の`subscribed`、Canvas変化を
  確認する。96 Strokeは1ユーザーあたり120操作／分のMigration上限を越えない設定である。
- 実行例（`storageState`ファイルはリポジトリへ追加しない）。

  ```text
  PIXIEED_STAGE8_BASE_URL=https://staging.example.invalid \
  PIXIEED_STAGE8_PROJECT_ID=<staging-room-uuid> \
  PIXIEED_STAGE8_STORAGE_STATE_A=/secure/stage8-user-a.json \
  PIXIEED_STAGE8_STORAGE_STATE_B=/secure/stage8-user-b.json \
  PIXIEED_STAGE8_SUPABASE_URL=https://<staging-ref>.supabase.co \
  PIXIEED_STAGE8_SUPABASE_PUBLISHABLE_KEY=<staging-publishable-or-anon-key> \
  PIXIEED_STAGE8_PACKAGE_HASH=<release-candidate-package-sha256> \
  PIXIEED_STAGE8_EVIDENCE_OUT=/secure/stage8-live-observation.json \
  node scripts/test-pixiedraw2-stage8-live.mjs
  ```

- このハーネスは`LIVE_OBSERVATION / STAGING`を生成するが、Production合格へ自動昇格させない。実行には、Room／active
  membership／初期Checkpoint、2つの異なる認証ユーザー、Realtime Authorization、Storage権限の準備が必要である。Release
  CandidateのPackage Hashを渡した場合は、Readiness Gateへ入力できる`COLLABORATION_2_TO_3`と`RECONNECT_RECOVERY`の
  schema v2 evidenceを同じ出力へ追加する。Package Hashを省略した観測、または再接続確認に失敗した観測はGate evidenceへ
  昇格しない。
  現在はMigration適用前であり、実行環境・認証Stateも未提供のため、上記の実staging実行結果は`UNTESTED`のまま保持する。

### 2026-08-28 Stage 8実接続ハーネスの収束検証強化

- Stage 8 live harnessは、B側Canvasの一部サンプルが変わったことだけでなく、描画が落ち着いた後のA/B全CanvasをPNG
  ダイジェスト化して比較するようにした。再接続後も同じ全Canvasダイジェストを比較し、部分収束や過去Rasterの残留を見逃さない。
- stagingクライアントのページエラー／Console errorは、結果を`PASS`として出さずに失敗させる。既存のPresence、Project ID、
  保存Revision、offline／reconnect、`role=alert`確認と合わせ、実接続時の検出境界を固定した。
- `node --check scripts/test-pixiedraw2-stage8-live.mjs`、Stage 8 14件、PiXYNC 199件、Studio 33件、Studio integration 233件、
  Readiness CLI 3件を再実行してPASSした。Production hostと現在リンク中のProduction Supabase URLを入力した場合も、接続前に拒否した。
- これはハーネスとローカル回帰の強化であり、実stagingの認証・Migration適用・Realtime／Storage・端末・監視・Rollback・Production
  公開を実行したものではない。これらの証拠は引き続き`UNTESTED`である。

### 2026-08-28 Stage 8性能観測入口

- Stage 8 live harnessの各ブラウザへ起動前の観測フックを注入し、Canvas準備時刻、最初のCanvas frame、Production接続時刻、
  30 frameの定常最大時間、取得可能なHeap、Long Task数、Resource転送量を`drawing.performanceObservation`へ記録するようにした。
- この結果は計測値であり、機能テストの`PASS`を置き換えない。`readinessEligible=false`を固定し、Asset Registry由来の`assetBytes`と
  decode後の`decodedBytes`を推測しないため、欠測中の`PERFORMANCE_BUDGET`は`UNTESTED`のままにする。
- `PerformanceObserver`、Heap、Resource Timingがブラウザで利用できない場合も、該当metricを欠測として出力し、実接続試験全体を
  見かけ上の性能PASSへ変換しない。Token、User ID、URLは観測結果へ保存しない。
- 最新のローカル回帰は、通常Draw 65件、PiXYNC 199件、Studio 33件、Studio integration 233件、Stage 8 14件、型検査、Bundle生成、
  2ブラウザProduction CompositionをPASSした。実stagingの性能予算、端末、監視、Rollback、Production公開は未実行である。

### 2026-08-28 Readiness Gate CLI

- `scripts/evaluate-pixieedstudio-readiness.ts`を追加し、Release CandidateとReadiness Evidenceを同じ
  `evaluateStudioReadiness`へ渡す読み取り専用の運用入口を固定した。Evidenceは配列、または`evidence`配列を持つ
  JSONとして受け付け、Candidateも直接形式／`candidate`ラッパー形式を受け付ける。
- CLIはCandidateの再検証、Package Hash、Evidence Hash、8チェックの欠落・重複・環境違い・fixture昇格拒否を
  共通Gateで判定する。指定Targetの`READY_FOR_*`だけが終了コード0で、それ以外はJSONの`BLOCKED`／`NOT_READY`と
  終了コード1になる。アップロード、公開、Deploy、通知、Feature Flag変更は行わない。
- `deno task check:studio-readiness-cli`、`deno task test:studio-readiness-cli`、`deno task test` 65件、
  `deno task test:studio` 33件、`deno task test:pixync` 199件、`deno task test:studio-integration` 233件、
  `deno task test:stage8` 14件、`deno task check`、`deno task build`を再実行し、すべてPASSした。
- これは運用入口のローカル検証であり、実stagingの8 Evidenceを生成したものではない。Migration適用、2〜3人の
  実Realtime、端末／ブラウザ行列、性能予算、監視、Rollback、Native、Production公開は引き続き`UNTESTED`である。

### 2026-08-28 外部公開・Rollback操作境界

- `pixiedraw2/src/studio/release-operation.ts`を追加し、Readiness Reportと明示的なPublish Intentから
  `DEPLOY_STAGING`、`PROMOTE_BETA`、`PUBLISH_PRODUCTION`の操作計画を作れるようにした。
- 操作計画はPackage／Project／Revision／Hashに固定され、期限付き承認がなければExecutorを呼ばない。
  Executorへ渡すRequestはmetadata-onlyで、`operationId`を冪等キーとして保持する。
- `ROLLBACK_REQUIRED`のOperational Evaluationと同じRollback PlanからだけRollback操作を作成できる。
  Provider失敗時は自動Rollbackせず、失敗Receiptを返す。
- STUDIO-050の6件のテストはPASSしているが、実Provider、staging、Beta、ProductionのDeploy／Rollbackは
  まだ`UNTESTED`である。

### 2026-08-28 iAUDIO／iGAME開始とGolden Projectの統合ブラウザ確認

- 現行Bundleのローカルブラウザで`?new_project=1&mode=AUDIO`と`?new_project=1&mode=GAME`を
  それぞれ直接開き、iAUDIO／iGAMEの各モードが同じStudio Entryから起動することを確認した。
  どちらも`Project Session`が生成され、`syncState=active`、`drawPersistenceState=saved`、
  `role=alert=0`、エラー表示0件だった。
- iGAMEで`Golden プロジェクトをゲームへ適用`を実行し、Draw SpriteとAudio Sourceを含む2つの
  Game ObjectがSceneへ反映された。続けて`プレビューを読み込み / 開始`を実行し、
  `fixed-step runtime active`、Project ID維持、保存済み、エラー表示0件を確認した。
- 同じProjectでiAUDIOへ切り替えてSE波形トラックを追加し、その後iGAMEへ戻った。Project IDは維持され、
  iGAMEのAudio参照領域とGame Sceneは表示された。モード切替中の警告・エラーは0件だった。
- これはローカルBundleの統合導線とGolden／Runtimeのブラウザ確認である。実Audio入力、実Storage／Registry、
  実Realtime、実機、Performance Budget、Production公開の証拠には昇格させず、Stage 8は引き続き`UNTESTED`とする。

### 2026-08-28 通常のiDRAW Asset → iGAME Sprite割り当てブラウザ確認

- 新規ProjectのiDRAWで矩形範囲を選択し、待機／正面スロットへ登録した。Asset editorには`Hero`、
  `Character`、`1 Animation Clip`、`1 Direction`が表示され、保存後も同じProjectのAssetとして残った。
- iGAMEのGame Asset Browserで`Hero · iDRAW · CHARACTER · 1 Animation Clip`を選択すると、iDRAWの原素材を
  参照専用として表示できた。Game側の`ゲーム配置を追加`でScene Objectを作成し、`iDRAW参照を追加`で
  `LIVE`参照を割り当てた結果、Game InspectorのSpriteは`iDRAW参照 · ... · 原素材は編集不可`となった。
- 同じObjectをPlaytestすると`fixed-step runtime active`、`drawPersistenceState=saved`、Project ID維持、
  `role=alert=0`、ページ警告・エラー0件を確認した。iDRAWの元データをGame側操作で変更していない。
- 従来の明示的な2段階操作に加え、Game Asset Browserで`Hero`を選択した状態では`ゲーム配置を追加`の1操作で
  新しいGame Objectの作成と、その名前付きAsset DefinitionへのiDRAW LIVE参照追加を連続実行する。Game Inspectorには
  `iDRAW参照 · Hero · 原素材は編集不可`と表示され、Game保存にも`assetDefinitionId`を含む参照メタデータだけが残る。
  選択を解除した通常の`iDRAW参照を追加`は、従来どおりアクティブDrawソースを参照する。
- これは現行Bundleのローカル単一ブラウザ確認で、実Realtime、複数端末、実機、Performance Budget、Productionの
  合格証拠には昇格させない。

### 2026-08-28 名前付きiDRAW Assetの直接Game配置

- 再読込後の同一ProjectでGame Asset Browserから`Hero`を選択し、`ゲーム配置を追加`を1回押すと、`New Asset 1`へ
  `Hero`の名前付きiDRAW参照が追加された。Asset Browserの選択状態、Game binding、Sprite Inspectorの3箇所で同じ
  名前を確認し、参照対象がアクティブRasterへ曖昧に戻らないことを確認した。
- その後iDRAWへ戻り256×256 Canvasの全幅ストロークを5波、合計112ストロークセッションで待ち時間なしに投入した。
  水平往復、縦方向、斜め方向を混ぜた各波の後に保存状態`saved`を確認し、最終`drawPersistenceRevision=79`、
  `pixyncState=active`、警告・エラー0件、ブラウザ開発ログ0件を維持した。iGAMEへ戻った後も`Hero`参照、固定step
  Playtest、編集状態保護を維持した。
- `project=`付き再読込後も`drawPersistenceState=restored`、1 Game Object、`Hero` Sprite参照、警告・エラー0件を確認した。
  この結果は、名前付きDefinition IDをGameの参照メタデータとして保存することで、高速描画後もSpriteの参照先が切れない
  ローカル境界証拠である。実Supabase Realtime、別端末、実機、Performance Budget、Productionの証拠ではない。

### 2026-08-28 高速描画後のiDRAW→iGAME参照維持

- 新規ローカルProjectで実際に描いたキャラクターをiDRAWの`待機／正面`へ範囲登録し、`Hero` Assetとして保存した後、
  iGAMEに1つのGame Objectを配置してiDRAW LIVE参照を追加した。
- その同じProjectで256×256 Canvasへ全幅ストロークを64回、待ち時間なしで投入した。直後も
  `drawPersistenceState=saved`、Canvas 256×256、`role=alert=0`、エラー表示0件を維持した。
- iGAMEへ戻るとGame InspectorのSpriteは`iDRAW参照 · ... · 原素材は編集不可`を維持し、Playtestは
  `fixed-step runtime active`かつ`edit state is protected`で起動した。Project IDと1オブジェクトも維持された。
- 同じProject IDを`project=`で再読込した後も`drawPersistenceState=restored`、Scene 1オブジェクト、SpriteのiDRAW参照、
  `role=alert=0`、エラー表示0件を確認した。
- この確認は高速描画による参照切れ・保存破損・Playtest起動不良がないことを示すローカル境界証拠である。なお、
  `iDRAW参照を追加`はアクティブなDrawソースを結ぶ詳細導線として残し、選択した名前付きAsset定義を`ゲーム配置を追加`
  の1クリックで直接配置する導線は実装済みである。実Realtime、複数端末、実機、Performance Budget、Productionの
  合格証拠には昇格させない。

### 2026-08-28 Project自動保存・起動・削除ライフサイクル

- Draw2のライブUndo/Redoを128件、永続Undo/Redoを最新8件かつ768KiBに制限した。256×256の128回広範囲描画では、
  永続履歴の合成サイズが約5.98MBから約0.68MBへ減少し、Checkpointを含む保存レコードが約6.08MBから約0.80MBへ
  減少した。これは端末横断の性能合格値ではなく、保持量を監視するローカル測定である。
- 旧Productionの冷却Undoは通常64件／1件512KiB、軽量モード32件／1件512KiBに制限した。タイムラプスは通常240イベント／16MiB・
  Checkpoint16件／32MiB、軽量モード120イベント／8MiB・Checkpoint8件／16MiBで上限到達時に記録だけを停止し、編集内容の自動保存は続行する。
  replay中の履歴を古い順に物理削除する圧縮は、世代Checkpointとhash検証が未実装のため別ゲートとして保留する。
- Draw2は同一タブのPiXYNC IndexedDB persistenceをProjectごとに1本へ共有する。Open時の重複loadを避け、CAS競合が
  発生した場合だけキャッシュを破棄して再読込する。Start画面のrecent一覧はメタデータのみを先に読み、全Projectの
  canonical payloadを起動時に展開しない。
- StartのProject chooserは初回60カードだけをDOMへ描画し、追加表示ボタンで60件ずつ増やす。125件の合成Projectで60→120→125件を
  確認し、古いProjectを不可視にして削除不能にすることなく、検索・追加表示から操作できることを確認した。
- タイムラプスの同一Project書込はstore instance間で共有し、削除時は書込flush→新規書込遮断→全関連store削除→空確認を行う。冷却Undoも削除中の遅延書込を遮断し、セッション初期化では同じProjectを再オープンできることを確認する。
  容量停止と削除レースを含む`node scripts/test-pixiedraw-timelapse-safety-runtime.mjs`をPASSした。
- ローカル削除は、確認後にDraw／Audio／Game／PiXYNC snapshotを順に削除し、V1/V2形式を問わず同一Project IDのUndo／タイムラプス関連データも掃除してから、最後に共通Manifestを削除する。
  Audioは保存済みrevisionが参照するOPFSバイトを先に消す。どれかが失敗した場合はManifestとrecentカードを残し、
  再試行できる状態を維持する。成功後だけProject固有preferenceとrecentカードを削除する。
- 共有PiXYNCのUUID Projectは、認証済み`detachPixyncProject`がserver-owned remote detachを完了してから
  local cleanupへ進む。所有者はローカライズ済みmember記録が存在する場合だけdetachできる。未認証・権限不足・未ローカライズ・Room identity不一致・RPC失敗ではlocal-only削除をせず、
  Project dataとrecentカードを残して再試行可能にする。旧PiXiEEDrawの削除経路もremote detach→local cleanup→
  recent metadata更新の順を取る。
- `node scripts/test-pixiedraw-autosave-new-project-runtime.mjs`は、案内ダイアログを閉じた後の実ブラウザでrevision
  1→2、recent 1行、復旧リビジョン2件以内、常駐payload 0、セッション不一致0を確認してPASSした。空のINDEXは
  `uint8-palette-zero-transparent-v2`の型付き配列として検証する。
- `deno task --cwd pixiedraw2 test:draw2-entry` 6件、Project deletion／Manifest／subdocument／PiXYNC IndexedDBの
  scoped test 34件、`node scripts/test-pixisync-project-delete.mjs`をPASSした。Start画面は390×844、844×390、1440×900
  でOpen/Delete操作が分離され、横方向のはみ出しなし、ブラウザエラー0件を確認した。別の実ブラウザ試験ではテスト生成Projectを
  UIから削除し、Recent／通常current参照／V2 manifest／Checkpointが残らないことまで確認した（遅延書込を止める小さな削除印は残る）。既存ユーザーProjectの実削除は行っていない。
- `node scripts/test-pixiedraw-project-list-window-runtime.mjs`は、125件を投入して起動直後のDOMを60件に制限し、明示的な追加表示で
  120件、125件まで到達できることとページエラー0を確認した。`node scripts/test-pixiedraw-rapid-broad-history-runtime.mjs`は、
  180回の全幅ストロークでページエラー0、自動保存完了、live履歴80件、冷却履歴57件／上限64件を確認した。いずれもブラウザ内合成入力であり、
  実OS入力・実端末・実Supabaseの性能合格値ではない。
- `node scripts/test-pixiedraw-autosave-recent-key-runtime.mjs`は、500件の既存Projectを保持した状態で対象Projectを保存し、Recent storeの全件走査0回、
  対象Recent payload行の`get` 0回・対象行の`put` 1回、同じIDの小さなメタデータ・サイドカーの`get`／`put`各1回以上、`dirty=false`、ページエラー0を確認した。
  `node scripts/test-pixiedraw-recent-metadata-sidecar-runtime.mjs`は旧V1 payloadを8件×1MiB投入し、初回だけサイドカー移行のため本体を読み、2回目は
  Recent payloadの`get` 0回・`getAll` 0回、sidecarの`getAll` 0回で一覧を復元し、旧payloadも保持することを確認した。これは自動保存ごとの一覧再走査と
  通常起動時の大容量payload複製を抑えるローカルブラウザ証拠であり、Start初回読込や実端末の長時間性能は別途`UNTESTED`である。
- V2の復旧履歴整理が失敗した場合は、コミット済みのProject本体を保持したまま整理だけを1回再試行する。再試行も失敗した場合は
  自動保存の状態を「内容は保存済み・古い履歴の整理が保留中」として警告表示し、次回の保存で再度整理を試みる。
  `node scripts/test-pixiedraw-v2-current-read-fast-path.mjs`では、整理失敗時の3世代保持と正常保存後の各2件への回復を確認している。
- 大容量V2メンテナンスでは、Journal保存／整理時にCheckpoint／Journal／Thumbnail本文を複製せず、Manifest本文と各ストアの
  キーだけを読む。削除も同一readwrite transaction内の`getAllKeys`（未対応時はkey cursor）で行う。
  `node scripts/test-pixiedraw-v2-key-only-maintenance-runtime.mjs`は大容量Checkpointを含むProjectで、本文`getAll` 0回、
  Manifestの整理読込1回、4ストアのキー削除、削除後の全レコード0件を実ブラウザで確認する。古いWebView／実端末の長時間負荷は別途`UNTESTED`とする。

### 2026-08-28 Draw2 shared Project deletion bridge

- `pixiedraw2/src/pixync/project-deletion.ts`を追加し、認証済みユーザーだけが
  `pixisync_detach_deleted_project(uuid)`を呼べるserver-owned境界を固定した。応答はRoom ID、action、Room status、
  session generationのキー・型・identity、既知のRoom status、action/statusの組合せを検証し、`owner_archived`など
  旧契約のactionはfail-closedで拒否する。
- Draw2 Start画面はremote detach成功後にだけDraw／Audio／Game／PiXYNC snapshotとManifestを削除する。
  localization required、認証エラー、RPCエラー、local cleanup失敗のいずれでもProject dataとrecentカードを残し、
  再試行できる。アクティブProjectはStart画面が表示中でも削除できない。
- 旧Productionの参加者detach応答もRoom ID・status・session generation・action/statusの組合せを検証し、
  不一致や未知のactionを`remote-detach-unconfirmed`で拒否してからlocal cleanupへ進む。
- `pixync-draw2-410-project-deletion.test.ts` 8件、migration契約3件、Draw2 entry canonical 6件、旧Productionの削除失敗保持・
  cache-buster・テスト生成Project削除を含む実ブラウザ試験をPASSした。

この記録はローカル・単一ブラウザの受入れであり、実端末の長時間保存、既存ユーザーProjectの削除、実Supabaseのremote
detach、stagingの複数ユーザー削除権限、監査Receiptはまだ`UNTESTED`である。これらを確認するまで、Project削除を
Production-readyとは扱わない。

### 2026-08-28 Native配布物の実行時ファイル境界

- CapacitorのWeb stagingで、`pixiedraw2`をリポジトリ全体から再帰コピーせず、iDRAW／iAUDIO／iGAME／iGAME Playerと
  その遅延ロードChunkだけを含む24ファイルの明示allowlistへ切り替えた。`src`、`tests`、`benchmarks`、`docs`、`fixtures`、
  `deno.json`、`deno.lock`、開発用icon exportは配布対象外とした。
- `node scripts/test-capacitor-stage-manifest.mjs`、`node scripts/test-fp007-real-qualification.mjs`、
  `npm run build:web`、`npm run cap:sync`、`npm run android:build:debug`をPASSした。staged Webの`pixiedraw2`は約6.5MB、
  同期後Android assetは約4.7MBとなり、APK内の`pixiedraw2`ファイル数は24件だった。
- APK内で`draw2-entry.js`、`wp180-workspace.js`、iAUDIOの録音／Render／Freeze／長時間Runtime、iGAME Player、
  Project Session、Project Data Storage、Export、Presence／Integrationの遅延Chunkを確認した。不要な開発ツリーは0件だった。
- staged URLをPlaywrightで開き、Start画面→新規Project→Workspace、`drawPersistenceState=saved`、404、ページエラー、Console errorが
  すべて0件であることを確認した。これは配布物とローカルWeb起動の証拠であり、Android実機の起動・保存・戻る操作、iOS、
  署名、Store提出を含む`NATIVE_SHELL`のLIVE/PRODUCTION合格には昇格させない。

### 2026-08-28 継続監査の最終ローカル結果

- 自動保存の対象行更新、125件Chooser窓、180回全幅描画、冷却Undo、タイムラプス容量停止／削除レース、V2現在読込と
  整理失敗回復、既存Project削除を再実行し、すべてPASSした。500件の既存Projectを保持した自動保存も、全件Recent走査0回、
  対象Recent payload行の`get` 0回、対象行の`put` 1回、同じIDのメタデータ・サイドカーの`get`／`put`各1回以上、`dirty=false`、ページエラー0件を維持した。
- 旧V1 payloadを8件×1MiB投入した移行試験もPASSした。初回起動だけが不足サイドカーのために本体をID指定で読み、2回目の起動は
  Recent payloadの`get` 0回・`getAll` 0回、sidecarの`getAll` 0回で一覧を復元し、旧payloadを保持した。サイドカー列挙には専用キー範囲を使い、
  削除後はRecent行・V2データ・同じProject IDのサイドカーが残らない。
- `deno task test:pixync`は214件、`deno task test:studio-integration`は247件、`deno task test:stage8`は14件をPASSした。
  Native側は`npm run build:web`、`npm run cap:sync`、`npm run android:build:debug`、`npm run test:native-runtime`をPASSし、
  Web／Android／iOS／debug APKの実行時`pixiedraw2`ファイル24件がallowlistと一致、開発用ファイル混入0件だった。
- これらはローカル・合成入力・debug配布物の証拠であり、stagingの実Supabase、異なる認証ユーザー、実端末、性能予算、監視、Rollback、
  iOS Xcode環境、署名、Store公開を完了した証拠ではない。Stage 8の8チェックは引き続き`UNTESTED`として扱う。
- `npm run test:native-runtime`を追加し、Web staging、Android asset、iOS asset、debug APKの`pixiedraw2`ファイル集合を
  同じallowlistと比較できるようにした。同期漏れ、余分な開発ファイル、APKへの混入は自動的に失敗する。

### 2026-08-28 削除後の遅延保存復活を防ぐ最終境界

- V2 IndexedDBはProjectごとに保存・Journal・cleanupを直列化する。同一Projectで同時に2回保存してもRevisionは`[2, 3]`へ
  分離され、同じProjectを別タブ相当のFactoryから保存中に削除した場合は、処理の勝敗にかかわらず削除後の遅延保存を
  `ERR_AUTOSAVE_PROJECT_DELETED`で拒否する。
- V2削除は大きな本文を`getAll`で複製せず、Manifestと4ストアのキーだけを扱う。1.5MiB本文のfixtureで本文`getAll` 0回、
  Manifest読込1回、4ストア削除、削除後のManifest／Checkpoint／Journal／Thumbnail 0件を確認した。currentには本文を持たない
  deleted tombstoneだけを残し、通常のProject読込からは不可視にする。
- Recent削除は自動保存の進行中書込を待ってから開始し、同一タブのメモリcacheにもdelete barrierを置く。削除成功時はRecent行と
  metadata sidecarを削除して小さな削除tombstoneを残し、遅れて到着するsidecar移行・thumbnail更新がカードを復活させない。
  remote detachまたはlocal cleanupが失敗した場合はbarrierを解除し、カードを残して再試行可能にする。
- `node scripts/test-pixiedraw-v2-key-only-maintenance-runtime.mjs`、`node scripts/test-pixiedraw-autosave-new-project-runtime.mjs`、
  `node scripts/test-pixiedraw-recent-metadata-sidecar-runtime.mjs`、`node scripts/test-pixiedraw-recent-project-metadata-runtime.mjs`、
  `node scripts/test-pixisync-project-delete.mjs`、`node scripts/test-pixiedraw-release-cache.mjs`を再実行し、PASSした。
  Recent公開APIは現行ビルドで公開されていないため、最後のテストは`PASS_WITH_PUBLIC_LIST_UNTESTED`として記録する。
- Draw2 PiXYNCのProject削除は、Snapshot本文を読み込まずに`snapshots`のキー削除と`deletedProjects` tombstoneを
  同一IndexedDB transactionで確定する`remove()`へ切り替えた。別インスタンス／別タブ相当の遅延保存、Journal再オープン、
  削除後の`clear()`は`PROJECT_DELETED`で閉じ、削除印はキャッシュ済みSnapshotの返却前にも確認する。注入Factoryの16件テストと
  `deno task test:pixync` 214件をPASSしたが、別OSプロセス・実端末・容量不足時の受入れには昇格させない。

### 2026-08-28 Draw2 PiXYNC既存Project削除の実ブラウザ境界

- `node scripts/test-pixiedraw2-project-delete-runtime.mjs`で独立Browser ContextにRecent Projectを3件（共有2件、ローカル1件）投入し、共有Project 1件の
  `削除`操作を実行した。確認ダイアログを承認するとfixtureのremote detach RPCは1回だけ呼ばれ、対象Snapshotは残らず、
  `deletedProjects` tombstoneは残り、別共有ProjectのSnapshotとローカルProjectは変更されなかった。
- 結果は`pass=true`、reload前後のRecent残存2件、対象Snapshot残存`false`、削除印`true`、生存Snapshot`true`、reload後の対象カード不在、page error 0、
  Console error 0だった。これは既存Projectを1件だけ消すUI・local cleanup・PiXYNC削除印の統合境界を実ブラウザで確認したものだが、fixture RPCであり、実Supabaseのremote detach、
  実ユーザーProject、実端末の受入れには昇格させない。

この境界により「自動保存を無期限に積み上げる」「Project一覧を開くたびに大きなpayloadを全件複製する」「削除後に遅延保存で
同じProjectが復活する」経路はローカル実装上閉じた。ただし、別OSプロセス、古いWebView、実端末の容量不足、実Supabaseの
remote detach、stagingの複数ユーザー権限と監査Receiptは引き続き`UNTESTED`であり、Stage 8の合格条件を変更しない。

### 2026-08-28 iGAME Playtest回帰の現行開始導線追随

- `node scripts/test-game351-browser.mjs`を現行の新規Game開始UIに合わせ、RPGスターター選択を経由して再実行した。
  イベント編集・保存、Play、キーボード移動、会話、Stop、Restart、Project reload、SITE-400 iGAME feature-offの安全停止を確認し、
  `GAME-351 browser: event edit/play/stop/restart/reload and SITE-400 route passed`、`SITE-400 iGAME feature-off browser: safe stop passed`を得た。
- 旧テストが開始方式の選択を飛ばしていたためenemy Trackを取得できずタイムアウトしていた。これは現行UIとのテスト不一致であり、
  RPGスターターを選択する手順へ修正した。実端末、実Realtime、Performance Budget、Production公開の証拠には昇格させない。

### 2026-08-28 Supabase／Stage 8外部状態の再監査

- `supabase projects list`で確認できるProjectはProductionの1件（`kyyiuakrqomzlikfaire`）だけだった。Preview Branchの一覧取得はAccess Token未提供で実行できず、分離stagingは確認できていない。
- `supabase db push --dry-run`は成功し、未適用候補6本を表示した。実Migration適用は行っていない。
- `supabase migration list`は今回の再実行で`cli_login_postgres`のpassword authentication failedとなった。Runbook中の過去の成功記録は履歴として残すが、今回の再監査でremote適用状態を更新確認できなかったため、現在の適用状態は`UNTESTED`として扱う。
- Stage 8 live harnessは`PIXIEED_STAGE8_BASE_URL`未設定で必須入力エラーとなり、外部環境なしでは実行を開始しないことを確認した。これは安全なfail-closedであり、staging PASSではない。
- `adb devices`は接続端末0件、`simctl`は利用可能なDeveloper toolなし、`xcodebuild -version`もXcode本体未選択で終了した。Android debug buildの成功を実機起動の証拠へ昇格させず、Nativeの実機／Simulator受入れは`UNTESTED`とする。

### 2026-08-28 ローカル最終Gate再実行

- `node ../../pixiedraw2/tests/pixync/pixync-draw2-350-two-browser-production.cjs`を正しい`tools/screenshots`基準で再実行し、`pass=true`、185操作（Draw183／Audio1／Game1）、高速Draw64、Tile Stamp64、Mirror32、楕円選択Stroke16、Selection Transform1、`rapidCanvasConverged=true`、`rapidDrawSaved=true`、`reconnectCaughtUp=true`、`remoteUndoDepthPreserved=true`、`gameCaughtUp=true`を確認した。
- `node scripts/test-pixiedraw2-project-delete-runtime.mjs`は、対象Snapshot消去・削除barrier保持・生存Snapshot保持・reload後対象カード不在、remote detach 1回、page error／console error 0件を再確認した。
- `node scripts/test-pixiedraw-rapid-broad-history-runtime.mjs`は180回描画を873msで完了し、page error 0、`historyPast=80`、`coldPastCount=57`、上限64、`autosaveDirty=false`だった。`pointerPerfSamples=0`のため、OS入力のframe budget測定には昇格させない。
- これは現行ローカルBundle・合成入力の最終回帰であり、実staging Realtime、実端末、性能予算、監視、Rollback、Production公開のEvidenceではない。

### 2026-08-28 iGAME Scene／Inspector／Assets／Build回帰の現行UI追随

- `node scripts/test-game350-browser.mjs`を現行の新規Game開始導線に合わせ、RPGスターターを選択してからScene、Inspector、Assets、Buildを順に確認した。
  1440×900と1024×768の両方で、Previewの起動、Scene階層4件、Transform／Collider／Rigidbodyを含むComponent Inspector、Game Assetsの表示を確認した。
- Game Assetsは現行仕様どおり`GAME OWNED`（Game側の配置を所有）と表示され、iDRAW／iAUDIOの原素材は参照・配置のみで編集・削除不可、参照追加ボタンが存在し、Game側のsource edit controlは0件だった。
- Unity／Godot／Unrealを切り替え、各ターゲットで検証後に決定的なPackage ZIPを取得できることを確認した。結果は両viewportで
  `GAME-350 browser 1440x900: rails/preview/build passed`、`GAME-350 browser 1024x768: rails/preview/build passed`だった。
- 旧テストはGame Assetsのバッジを`REFERENCE ONLY`と誤って期待していたため、現行の所有境界に合わせてテスト期待値だけを更新した。これはローカル単一ブラウザのiGAME回帰証拠であり、実端末、実Realtime、Performance Budget、Production配布物の合格には昇格させない。
