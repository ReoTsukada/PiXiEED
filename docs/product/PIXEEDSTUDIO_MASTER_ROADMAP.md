# PiXiEEDstudio Master Roadmap

更新日: 2026-08-28
対象: iDRAW / iAUDIO / iGAME / PiXYNC / Package / Publish

## ゴール

iDRAW・iAUDIO・iGAMEを別アプリとして並べるのではなく、ひとつの
`Project Session`から、どの制作モードでも開始できるStudioにする。

制作物は次の関係でつながる。

```text
iDRAW revision ──┐
                 ├─> iGAME Scene ──> Playtest ──> Package / Publish
iAUDIO revision ─┘
```

GameはDrawのピクセルやAudioのPCMを所有しない。Gameが保存するのは
Asset ID・Revision・Hash・License・配置・再生設定だけとし、原素材の編集権限は
それぞれの制作モードに残す。

## 完了判定

「UIが表示できる」だけでは段階完了としない。各段階は次の3つを分けて記録する。

段階0〜8のExit Criteria、現在の判定、必要な外部入力、実行コマンドは
[PIXEEDSTUDIO_COMPLETION_MATRIX.md](./PIXEEDSTUDIO_COMPLETION_MATRIX.md)を正規の進行表とする。

- `IMPLEMENTED`: ソースと契約が実装されている
- `ISOLATED_VERIFIED`: ローカルの型検査・単体検査・ブラウザ検証が通っている
- `PRODUCTION_VERIFIED`: staging、本番相当の認証・Storage・Realtime・端末・負荷まで確認済み

現状は段階0が `IMPLEMENTED + ISOLATED_VERIFIED`、段階1が
`IMPLEMENTED + ISOLATED_VERIFIED`、段階2が
`IMPLEMENTED + ISOLATED_VERIFIED`（Provider、再接続、耐久Catch-upを含むローカル範囲）、段階3が
`IMPLEMENTED + ISOLATED_VERIFIED`（共通UIのローカル・ブラウザ範囲）、段階4〜7が
`IMPLEMENTED + ISOLATED_VERIFIED`、段階8が
`IMPLEMENTED + ISOLATED_VERIFIED`（Readiness Gate、3クライアント分離受入れ、Runbookの範囲）である。本番の
Registry、Realtime、端末、負荷、監視、Rollback試験を通過するまではProduction完成とは表示しない。

## 段階別ロードマップ

| 段階 | 完了条件 | 実装範囲 | 現在の判定 |
|---|---|---|---|
| 0. 統合基盤 | 3モードから同じProjectを開き、状態を再読込できる | 統合Start、Project Session、モード切替、ローカル状態 | `ISOLATED_VERIFIED` |
| 1. Golden Project | Draw 1点とAudio 1点をGameへ接続し、LIVE PreviewとPINNED manifestを生成できる | Sprite、Audio Source、Scene、Preview、Revision/Hash/License | `IMPLEMENTED_ISOLATED` |
| 2. PiXYNC共同編集V1 | 2〜3人の操作が再接続後も欠落・二重適用なく収束する | Operation、ACK、Presence、再接続、競合、履歴、Checkpoint、権限 | `IMPLEMENTED_ISOLATED`（Session契約） |
| 3. 共通UI/UX | 同じ操作概念を3モードで使え、初心者導線と詳細導線を切り替えられる | Token、Command、Inspector、Undo/Redo、Shortcut、Recovery、表示密度 | `ISOLATED_VERIFIED` |
| 4. iDRAW完成度 | Layer×Frame×Cel、Sprite範囲、Pivot、Animation、Exportを一連で使える | Timeline、Palette、Transform、Pen Tablet、PXD | `IMPLEMENTED + ISOLATED_VERIFIED` |
| 5. iAUDIO完成度 | Track×Time×Clip、録音、Mixer、Automation、Effect、Renderを一連で使える | Waveform、MIDI、Freeze、BGM/SFX出力 | `IMPLEMENTED + ISOLATED_VERIFIED` |
| 6. iGAME完成度 | Sceneへ素材を配置し、Component/Event/Graphを設定してPlaytestできる | Entity、Component、Collider、Input、Debug、Playtest | `IMPLEMENTED + ISOLATED_VERIFIED` |
| 7. Package/Publish | 同じ入力から同じHashの配布物を再生成でき、権利情報を追跡できる | PXD、Audio/Game Package、Registry、Revision、Provenance、Build | `IMPLEMENTED + ISOLATED_VERIFIED + LIVE_LOCAL_ARTIFACT_VERIFIED` |
| 8. Beta/Production | stagingで2〜3人同時編集、端末・負荷・復旧を通過し、段階公開できる | 監視、Rate limit、Rollback、Native shell、公開運用 | `IMPLEMENTED + ISOLATED_VERIFIED`（実環境はUNTESTED） |

## 実装順序

段階4〜6は完全な直列にはしない。ただし共有契約が固まる前に各ツールを独立拡張しない。

1. 段階0のProject identityとmode shellを固定する
2. 段階1でDraw/Audio/Gameの最小縦切りを完成させる
3. 段階2でCanonical ProjectへのOperation境界を固定する
4. 段階3で、2と3の動作を共通UIへ投影する
5. 段階4・5・6を、共有Asset Referenceと共通Commandに接続しながら並行拡張する
6. 段階7でPXD・Audio・Gameを同一Revisionから再現可能に束ねる
7. 段階8でstagingを先に完成させ、Productionは段階公開する

## 段階1 Golden Projectの契約

`pixiedraw2/src/studio/golden-project.ts` が最小縦切りの正規化点になる。

- 入力: Draw revision、Audio revision、Project/Owner identity、配置・音量・Loop
- Game出力: `SPRITE` と `AUDIO_SOURCE` を含む `GameProject`
- Package出力: `AssetBinding`、`DependencyLock`、`LicenseSnapshot`、`PackageManifest`
- `LIVE`: 制作中のPreview用。次のRevisionを追従できる
- `PINNED`: 公開・Build用。RevisionとHashを固定する
- 禁止: Project・Operation・Game canonical payloadへのpixel、PCM、raw `bytes`の混入

## PiXYNCの安全モデル

共同編集は大きなドキュメントを毎回送らず、細粒度のOperationを送る。

```text
入力
  ↓ idempotency key + client sequence
Operation journal
  ↓ canonical validation
ACK / reject
  ↓ checkpoint + reconnect replay
全クライアントが同じ Project hash へ収束
```

必須の失敗試験は、重複・順序逆転・古いRevision・権限不足・切断中・再接続・
Checkpoint直後・片方の素材Provider停止を含む。テスト用fixtureの成功だけでRealtime完成とはしない。

### 段階2で追加したSession境界

`pixiedraw2/src/pixync/project-session.ts` では、3つのAggregateを同じProject Revisionで
扱いながら、モードは各クライアントの表示状態として分離する。

- `owner` / `editor` / `viewer` を接続時に固定し、viewerのOperation/Checkpoint作成を拒否
- Presenceは引き続き一時状態で、Operation journalやCheckpointへ混入させない
- CheckpointはProject/aggregate Revision、Operation count、作成者、labelだけを保存
- Checkpoint IDの再送は同一metadataだけを冪等に受理し、metadata変更はConflictにする
- `bytes`、`pixels`、PCMなどの素材本体はSession metadataへ入れない
- クライアントとSupabase authorityの両方で、Payloadの深さ・キー数・素材本体キー・正の`clientSequence`を検査する

保留中のDraw2 authority migrationでは、重複再送を除く新規Operationに対して
ユーザー・Room単位の1秒120件のRate limitを原子的に適用する。これはmigrationの
ローカル契約と単体検証までであり、リモート適用後の通知・抑制・負荷値は段階8で別途
実測する。

これはLocal brokerによる分離検証であり、Supabase Realtime、実ユーザー認証、複数端末、
Storage checkpoint、負荷試験の完了を意味しない。

高速入力の正規状態競合については、Draw110 adapterと実画面入口の双方に確定処理キューを
追加した。これにより、同時に到着した描画・塗りつぶし・書き込み集合・パレット変更が同じ
`ProjectState`と操作番号を共有し、後から完了した非同期処理が先の変更を上書きしない。
32件同時投入の回帰テストと、実ブラウザの連続32ストロークを確認済みだが、これはローカル
単一ブラウザの順序性証拠であり、実RealtimeやProductionの性能合格値ではない。

ローカルDraw保存についても、IndexedDBの同一Project・同一基底Revisionからの競合を
期待Revision／State HashのCASで保護した。保存は1つのreadwrite transaction内で基底を再確認し、
別タブの同一Revision・異なるHashを`stale-write-ignored`として拒否する。実ブラウザ2タブの
同時描画で勝者1件・stale 1件を確認したが、自動マージではないため、複数端末の編集統合は
PiXYNC Operation経路と実Realtimeで別途受入れが必要である。

### 段階3で追加した共通UI密度境界

`pixiedraw2/src/wp180-workspace-ui.ts` と `pixiedraw2/index.html` の共通Commandへ
`Guided / Detailed` 切替を追加した。切替はモード固有ドックではなく共通トップレールに
置き、iDRAW・iAUDIO・iGAMEのどこからでも同じ操作で到達できる。

- `guided`: 初回操作を優先し、Advanced、Physics、Routing diagnostics、FXなどの
  詳細項目を表示しない
- `detailed`: 同じProjectと同じcanonical stateのまま、必要な技術設定を表示する
- 設定は `pixieed:draw2:detail-mode:v1` に保存し、壊れた値は `guided` へ閉じる
- 1280px幅ではトップレールを4つの高頻度操作へ限定し、Detailsメニューとの重なりを避ける

単体契約、静的型検査、実ブラウザでのDraw/Audio切替・Advanced表示・再読込保持を確認済み。
端末固有のタッチ・ペンタブ挙動とProduction UI配信は未検証である。

### 段階4〜6の機能棚卸しと統合受入れ

既存の機能を名前だけで完成扱いにせず、各モードのcanonical stateとGolden Projectの
Asset Reference境界を確認した。

- iDRAW: Layer×Frame×Cel、Raster、Selection/Transform、Timeline/Onion/Playback、
  Sprite範囲、Pivot、Animation、PXD/PNG/Atlas export。
- iAUDIO: Track×Time×Clip、MIDI/Piano Roll、Recording、Waveform、Mixer、Automation、
  Routing、Effect、Mastering、Render、Freeze/Bounce。
- iGAME: Scene/Entity/Component、Sprite/Audio Source、Collider/Physics、Input、
  Visual Graph/Behavior、Playtest、Runtime Performance、Build境界。

ローカルのscoped verificationはDraw 80件、Audio 91件、Game 120件が通過している。
さらにGolden ProjectからDraw/AudioをGameへ配置し、LIVE PreviewとPINNED Packageへ進める
統合テストを通過し、ローカル実ブラウザでPXD/WAV/Game JSONのArtifact生成と決定的ZIP取得まで確認した。
実ユーザーのProvider、実機、Production routeはこの判定に含めない。

### 段階7で追加したStudio Package／Artifact境界

`pixiedraw2/src/studio/package-publish.ts` は、既存のGAME-340、GAME-330、WP-160を
共通入力で接続する。

- PXD、Audio、Gameの3つのmetadata-only Packageを同じProject Revisionから生成し、Candidateの
  Asset ID、Revision、Hash、Owner、License、依存関係を固定する。
- Asset RegistryはAsset ID、Revision、Hash、Owner、License、byteLength、MIMEを照合する。
- LIVE、欠落したLicense、重複・stale Registry、Hash改ざん、raw bytes/pixels/PCMを拒否する。
- `createStudioBuildRequest` が固定Dependency SnapshotをWP-160 Buildへ渡す。
- 同じ入力から同じPackage Hash、再現可能Build identity、Build Plan Hashを生成する。
- `pixiedraw2/src/studio/artifact-materializer.ts` がCandidateの固定参照を再照合した後、
  iDRAWのPXD v2実体、iAUDIOの全体Render WAV、iGAMEのcanonical Game JSONを生成する。
- 3実体はサイズ、MIME、SHA-256、locked Package Hashを持ち、決定的な順序と固定パスでManifest付きZIPへ
  束ねる。ZIP、Manifest、再現可能Build identityも再検証でき、Candidate／ソース／バイト／パスの改ざんは
  fail-closedになる。
- Publishは外部操作ではなく、検証済みArtifactに対する明示的なIntentとして分離する。Artifact生成とZIP取得は
  現在ローカル処理に限定し、Storage／Market／外部公開は実行しない。
- `pixiedraw2/src/studio/release-operation.ts` で、IntentとReadiness Reportを対象別の
  `DEPLOY_STAGING`／`PROMOTE_BETA`／`PUBLISH_PRODUCTION`／`ROLLBACK`計画へ変換する。
  期限付き明示承認とProvider注入を必須にし、Executorへはmetadata-onlyのRequestだけを渡す。
  Provider失敗時の自動Rollbackは禁止し、失敗Receiptから承認済みRollbackへ戻す。

### 段階8で追加したReadiness Gate

`pixiedraw2/src/studio/release-readiness.ts` は、8つの実環境チェックを必須項目として
管理する。STAGINGは配置確認、BETAは8項目すべてのstaging PASS、PRODUCTIONは8項目
すべてのproduction PASSを要求する。EvidenceはPackage Hashとcapture hashに結び付き、
改ざん・重複・欠落・環境違いを拒否する。さらに`LIVE_OBSERVATION`と
`ISOLATED_FIXTURE`を区別し、後者のPASSはリリース判定へ昇格させない。

具体的な実施順序と未検証境界は
`docs/product/PIXEEDSTUDIO_RELEASE_RUNBOOK.md` に固定した。Readiness Gateの単体検証は
通過しているが、stagingの実Realtime、2〜3人、端末、負荷、監視、Rollback、Native shell、
Production公開はまだ `UNTESTED` である。

初期Roomの作成については、`pixiedraw2/src/pixync/room-provisioning.ts` に
認証確認→サーバー発行のRoom／Checkpoint identity照合→private Storage upload→revision 0
activateの直列境界を追加した。これは初期データの欠落・別Roomへの誤書き込み・有効化前の
誤表示を防ぐための実装とローカル検証であり、リモートMigration適用後の実Realtime受入れ
および初期PXDの他端末復元は段階8の別Evidenceとして残す。

さらに、`pixiedraw2/src/pixync/remote-checkpoint.ts`でactive CheckpointのRoom／Revision／
Storage path／サイズ／SHA-256／PXD内部Hashを検証してから起動時に復元し、
`pixiedraw2/src/pixync/checkpoint-publishing.ts`で`prepare → upload → register → attest → activate`
を直列化した。2人以上の検証待ちcandidateはactiveへ昇格させない。これらはローカル契約と
失敗境界の実装であり、実SupabaseへのMigration適用、Storage復元、複数ユーザーの
Checkpoint受入れは段階8の`UNTESTED`境界に残す。

2026-08-28に、iGAME新規Project起動時の初期化競合を修正した。Studio側のRoute要求を
順序化し、受理済みProjectへの重複`create`を`open`へ収束させている。SITE-400共通Controllerの
直接重複create拒否は維持し、実ブラウザ5回連続起動、RPGスターター、イベント保存、Play、入力を確認済み。

さらに`tests/pixync/pixync-draw2-400-stage8-acceptance.test.ts`で、3クライアントが240操作を
同時Commitし、順序逆転・重複配送・切断中の未配送・再接続Catch-upを経ても同じProject Revisionへ
収束することを確認した。分離Sequencerで同時Commitが同一Revisionを発行し得る問題を検出し、
`src/pixync/in-memory.ts`のCommit入口を直列化して解消した。この結果は`ISOLATED_FIXTURE`であり、
実Supabase Realtimeの受入れ結果ではない。さらに`src/studio/runtime-observation.ts`で、
ブラウザのmonotonic clock、heap、Long Task、Asset byte、Runtime／Realtime／Storage／操作数を
外部送信なしでPackage Hashへ束ねる観測セッションを追加した。欠測値は性能判定をPASSへ補完せず、
実環境のMonitoring Evidenceへは昇格させない。

2026-08-28に、Production composition rootへPrivate Realtime ChannelのPresence接続を追加した。同期対象は
表示名・iDRAW／iAUDIO／iGAMEの現在モード・選択対象に限定し、Operation、ACK、素材本体、Checkpointとは分離する。
SDK Port、Provider、Durable Transport、Composition Root、Studio UIまでのローカル接続契約と、Presenceの不正値破棄・
再接続時の再`track`・切断時の`untrack`・journal非混入を検証済みである。Broadcastのeditor送信権限とPresenceの
active member送受信権限も別Migrationへ固定したが、実Supabaseへの適用はまだ行っていない。そのため段階2は
`IMPLEMENTED + ISOLATED_VERIFIED`、段階8の実Realtime／staging受入れは引き続き`UNTESTED`とする。

Stage 8の実接続入口として`/Users/tsukadareine/Documents/GitHub/PiXiEED/scripts/test-pixiedraw2-stage8-live.mjs`を追加した。
明示的なstaging URL・別ユーザー2個の認証済みstorageState・staging Supabase公開キー・UUID Projectだけを受け付け、
Production host／Production Supabase projectへの誤接続を拒否する。Presence 2人表示、Aからの高速全幅描画、BへのCanvas
反映、保存Revision、Bのoffline／reconnect後のCatch-up、同期状態、エラー表示を`LIVE_OBSERVATION / STAGING`として出力できる。
Package Hashを渡した場合は`COLLABORATION_2_TO_3`と`RECONNECT_RECOVERY`のEvidenceも生成できるが、実stagingの認証Stateと
Migration適用がまだないため、段階8の実環境判定は`UNTESTED`のまま保持する。

## UI/UXの設計原則

- Projectを中心に置き、制作開始点はiDRAW・iAUDIO・iGAMEのどこでもよい
- 初心者は「素材を作る → 配置する → Play」の3段階で進める
- 詳細モードでは、同じ対象をLayer/Track/Entity/Component/Inspectorで深掘りできる
- 原素材とGame配置を表示上も操作権限上も分離する
- Undo/Redo、保存、同期、復旧は全モードで同じ位置・同じ語彙にする
- エラーは「何が止まったか」「安全に残っているか」「次に何を押すか」を必ず示す
- Pointer、Touch、Keyboardを同じCommandへ正規化し、表示だけを端末に合わせる

## 軽さ・安全性の目標

目標値は実測で更新する。未計測の値を合格実績として扱わない。

- 描画中の通常操作はメインスレッドを長時間塞がない
- 同期は差分Operationを優先し、素材本体を再送しない
- 大きなRaster/WaveformはTile/Peak cacheとして遅延読込する
- Saveはcheckpointとjournalを分離し、再起動後に最後の確定状態へ戻せる
- PackageはHash、Revision、License、依存関係を検証してから生成する
- 失敗時は fail-closed。未検証の外部参照を「公開可能」と表示しない

## エージェント分担

- Product: 段階ゲート、ユーザーストーリー、公開基準
- UX/UI: Start、Mode、Inspector、Recovery、初心者/詳細の情報設計
- Frontend: Canvas、Timeline、Piano Roll、Scene、Command投影
- Backend/Realtime: Operation、Presence、ACK、Checkpoint、権限、監視
- Runtime: Sprite/Audio解決、Playtest、固定step、再現可能Build
- QA/Security: 失敗注入、競合、再接続、端末、負荷、権利境界

各担当は「問題点 → 改善案 → 実装案 → 実装 → scoped verification」の順に記録し、
Production判定は別担当の再現確認を要求する。

## 次の実装ゲート

1. authorized stagingへRelease Candidateを配置し、Package HashとProject Revisionを照合する
2. 2〜3人のPiXYNC実RealtimeでOperation、ACK、再接続、Checkpoint、権限拒否を確認する
3. desktop／tablet／mobileと主要ブラウザでCanvas、Timeline、Piano Roll、Scene、Playを確認する
4. Runtime profileのstartup、first frame、steady frame、memory、asset bytes、long taskを実測する
5. 監視・Rate limit・Rollback・Capacitor native shellを確認し、Evidenceを作成する
6. 8項目のProduction Evidenceと明示的承認が揃った後にだけ段階公開へ進む

2026-08-28に、Release Candidateと8項目のEvidenceを共通Readiness Gateへ渡す読み取り専用CLI
`scripts/evaluate-pixieedstudio-readiness.ts`を追加した。Candidate／EvidenceのJSONを再検証し、
指定Targetの`READY_FOR_*`だけを終了コード0として返すため、Beta／Production判定を手作業の表示に
依存させない。外部公開やMigration適用は実行せず、実staging Evidenceがない間は`UNTESTED`を維持する。

2026-08-28に、外部公開・Rollbackの承認境界を`src/studio/release-operation.ts`へ追加した。
これは操作計画と期限付き承認をHashで固定し、実際のProviderはHostから注入する契約である。
ローカルの承認・期限切れ・改ざん・Provider失敗・Rollback連携を検証済みだが、実Providerと
実環境のDeploy／Rollbackは引き続き`UNTESTED`である。

### 2026-08-28 保存競合の追加受入れ境界

iDRAWだけでなく、iAUDIO／iGAMEの同一Project保存も期待RevisionとState HashのCASで保護した。iAUDIOは
FPS／PPQの同一Revisionメタデータ更新を維持し、Canonical State Hashが異なる競合スナップショットだけを
拒否する。iGAMEはstale時にCommitイベントとManifest更新を止める。

単体・統合テストに加え、実ブラウザ2タブでiAUDIOのPiano Roll、iGAMEのScene配置を同時編集し、各々
`saved` 1件／`stale-write-ignored` 1件、警告・エラー0件を確認した。これはローカルIndexedDBの競合防止であり、
サーバー側の自動マージ、実Supabase Realtime、staging、Productionの合格証拠には昇格させない。

### 2026-08-28 高速描画反復とCross-tool境界の確認

静的回帰では、256×256 Canvasに全幅描画を4パス・256行、合計1024操作として実行し、全行の最終色、64タイル、
65536pxの描画、Journal、Checkpoint、Applied Command ID、Rendererの一致を確認した。現行Bundleの実ブラウザでも、
全幅64行×往復と別色64行の上書き、X軸ミラー付き32ストローク、矩形選択内Fill／Stroke／Shapeを待ち時間なしで実行し、
保存・再読込・2ブラウザCanvas収束・no-op正規化・警告／エラー0件を確認済みである。矩形選択は4整数の`clip`メタデータへ圧縮し、
非矩形選択は行スパンRLE＋Base64の`selectionMask`へ圧縮し、ミラーPen／Shapeはboundedなミラー記述子へ圧縮して、
広範囲の画素配列をPiXYNCへ送らない。Core／Draw adapterでは非矩形選択のFill／Stroke／Shape／Tile Stamp／Transform、実ブラウザでは
楕円選択を保持した全幅Stroke 16回とMove Transform 1回を確認し、選択外への漏れ、`writeSet`化、2ブラウザ収束の問題がないことを確認した。
Bundle再生成後の同一Composition 3回実行でも、毎回185操作（Draw 183／Audio 1／Game 1）、保存、収束、再接続Catch-up、
重複通知抑止を維持した。

さらに、実際に作成したiDRAWキャラクターをAsset化してiGAMEのSprite参照へ接続し、高速描画後も参照、固定step
Playtest、Project ID、再読込後のSceneを維持できることを確認した。これはローカル単一ブラウザの合格証拠であり、
実端末、別ブラウザ、実Supabase Realtime、Performance Budget、Productionの合格値ではない。

現状の初心者導線は、名前付きAssetを選択して`ゲーム配置を追加`を押す1操作でGame ObjectとiDRAW Sprite参照を作成でき、
原素材は読み取り専用のまま保つ。明示的な`iDRAW参照を追加`は、選択したGame ObjectへアクティブDrawソースを結ぶ従来の
詳細導線として残している。Gameの参照メタデータには`assetDefinitionId`を追加し、Animation検索も名前付きDefinitionを
優先するため、同一Rasterに複数Definitionがある場合も選択対象を維持できる。

### 2026-08-28 名前付きAssetのGame Sprite接続を実装

`Draw2AssetBridge`へ名前付きDefinitionをSHA-256付き参照へ変換する`resolveDefinitionReference`を追加し、Gameの
reference-only bindingへ任意の`assetDefinitionId`を保存できるようにした。Game Asset Browserで選択したDraw Assetは
カード上の選択状態と状態メッセージを保持し、`ゲーム配置を追加`からGame Object作成とSprite参照追加を連続実行する。
既存のLIVE／PINNED、旧保存データ、原素材の書込み拒否は維持し、Audio bindingへDefinition IDが混入する場合は検証で拒否する。

ローカルブラウザでは、再読込後に`Hero`を1クリック配置し、Game Inspectorの`iDRAW参照 · Hero · 原素材は編集不可`、
5波112ストロークセッションの待ち時間なし全幅描画後の参照維持、`project=`再読込後の復元、固定step Playtestを確認した。これはStage 1／3の
ローカルCross-tool境界を前進させる証拠であり、実Realtime、別端末、実機、Performance Budget、Productionの合格証拠には
昇格させず、Stage 8の実環境受入れは`UNTESTED`のままとする。

### 2026-08-28 Projectデータライフサイクルの統合

Project数の増加、広範囲描画、モード切替、削除失敗が、別々のツール状態を残してStudioを重くしたり、
復旧不能にしたりしないように、保持・起動・削除を共通Projectの責務として固定した。

- 自動保存は「1 Project = 1 current record」を基本とし、Draw2のライブUndo/Redoは最大128件、永続履歴は
  最新8件かつ768KiBまでに制限する。旧Productionの冷却Undoは通常64件／1件512KiB、軽量モード32件／1件512KiB、
  タイムラプスは通常240イベント／16MiB・Checkpoint16件／32MiB、軽量モード120イベント／8MiB・Checkpoint8件／16MiBで
  上限到達時にタイムラプスだけを一時停止し、編集内容の自動保存は継続する。履歴は全セッションのアーカイブではなく、短い端末復旧窓とする。
  PiXiEEDraw旧V2の世代整理が失敗したときは、保存本体を残して整理を1回再試行し、解消しなければ警告状態で次回保存へ引き継ぐ。
- Draw2 V2のProject単位保存は同一タブの書込を直列化し、Project削除時は新規書込を即時遮断してから既存キューをflushする。
  削除 transaction後は本文を持たないcurrent tombstoneを残すため、別タブの遅延保存も`ERR_AUTOSAVE_PROJECT_DELETED`で拒否される。
- Draw2 PiXYNCのIndexedDB snapshot削除は`clear()`（一時的な本文リセット）と`remove()`（Project削除）を分離する。
  `remove()`はSnapshot本文を読まず、`snapshots`のキー削除と別storeの`deletedProjects` tombstoneを同一transactionで確定し、
  別タブの遅延保存・キャッシュ済みSnapshot・Journal再オープンを`PROJECT_DELETED`で拒否する。削除印は本文ではなく小さな管理レコードである。
- StartのRecent indexはpayloadを含まないメタデータ投影として読み、旧バージョン由来の同一Project ID重複を表示前に排除する。
  既存Projectを暗黙に削除する件数上限は設けず、ChooserのDOMだけ初回60件・追加60件の窓で描画するため、古いProjectも検索・追加表示から削除できる。
- 旧V1 Recent行は小さなmetadata sidecarへ段階移行する。初回の不足sidecar補完だけが該当IDのlegacy payloadを読み、
  以後の一覧・自動保存はpayloadを読み込まない。削除時はRecent行・sidecarを消し、削除tombstoneで遅延migrationやthumbnail更新の復活を止める。
- PiXiEEDraw旧V2の復旧リビジョンは通常2件以内に整理し、起動時は全Projectのpayloadを復元せず、Start一覧の
  メタデータと開く対象だけを読む。Draw2の同一タブではPiXYNC IndexedDB persistenceを1本へ共有し、CAS競合時だけ
  キャッシュを無効化して再読込する。キャッシュ済みSnapshotを返す前も削除storeだけを確認し、別タブ削除後の再オープンを防ぐ。
- ローカル削除は、ユーザー確認後にDraw・Audio・Game・PiXYNCのProject単位データを消し、V1/V2形式を問わず同一Project IDのUndo／タイムラプス関連データも掃除し、最後に共通Manifestを消す。
  Audioは保存済みrevisionが参照するOPFSバイトを先に消し、失敗時はManifestとrecentカードを残して再試行可能にする。
  削除成功後だけProject固有のEditor preferenceとrecentカードを消す。
- 共有PiXYNCの削除は認証済みserver-owned remote detachを先に完了させる。所有者はローカライズ済みmember記録が
  存在する場合だけdetachできる。Draw2のStart画面からUUID共有Projectを操作した場合も、未認証・権限不足・未ローカライズ・
  不正なRoom応答ではlocal-only削除へフォールバックしない。
  remote detach成功後にだけlocal cleanup→recent metadata更新へ進み、失敗時はカードとProject dataを残して再試行する。
  既存のPiXiEEDraw経路でもremote detach→local cleanup→recent metadata更新の順序を維持し、detach応答のRoom ID・status・
  generation・action/statusを検証する。

タイムラプスのIndexedDBは、同一タブの全store instanceでProjectごとの書込キューを共有する。削除開始後は新規書込を
拒否し、既存キューをflushしてから4つのstoreを削除し、削除後に全storeが空であることを確認する。冷却Undoも削除中の
遅延書込を拒否し、セッション初期化と明示削除を別扱いにする。イベント数・概算byte数・
Checkpoint数・概算byte数をProject metadataへ保存し、上限到達時はreplay可能な既存履歴を物理削除せず、記録だけを停止する。
世代境界を壊さない圧縮は別ゲートとし、active／undone／baselineを安全に引き継ぐCheckpointとhash検証が揃うまで実装完了扱いにしない。

Recent削除は同一タブのメモリcacheにも削除barrierを置き、削除処理中または削除完了後の遅延autosaveがカードを再追加しない。
remote detach失敗やlocal cleanup失敗ではbarrierを解除してカードを残し、成功時だけ削除状態を確定する。削除印は本文ではなく
小さな管理レコードであり、大量の自動保存履歴を増やさない。

このゲートのローカル検証では、256×256の128回描画で永続履歴を約5.98MBから約0.68MBへ縮小し、同一Projectの
自動保存revision 1→2、recent 1行、復旧リビジョン2件以内、常駐payload 0を確認した。Project削除の失敗時保持、
Manifest最後の削除、PiXYNC snapshotのProject分離、Start画面のOpen/Delete分離、125件のChooser窓描画、タイムラプス容量停止・
削除レース、テスト生成Projectの実ブラウザ削除も検証済みである。
500件の既存Projectを保持した自動保存では、大きなRecent payload行を読まず、対象行と同じIDの小さなメタデータ・サイドカーだけを更新し、Recent storeの全件走査を
発生させないことを実ブラウザで確認した。旧V1 payloadを8件×1MiB投入した移行試験でも、初回移行後の2回目起動はRecent payloadを読まずに一覧を復元し、
旧payloadを保持した。`node scripts/test-pixiedraw-recent-metadata-sidecar-runtime.mjs`で固定したローカル証拠であり、実端末・古いWebView・長時間負荷には昇格させない。
V2の大容量メンテナンスでは、Journal保存と履歴整理が大きなCheckpoint／Journal／Thumbnail本文を読まず、Manifest本文と
ストアキーだけを扱うことを`node scripts/test-pixiedraw-v2-key-only-maintenance-runtime.mjs`で確認した。Project削除後の
4ストアと通常current参照は0件で、current storeには遅延書込を拒否する小さな削除印だけが残る。これはローカルChromiumの実ブラウザ証拠であり、実端末・古いWebView・容量不足時の受入れには昇格させない。
Draw2では`pixiedraw2/src/pixync/project-deletion.ts`と`pixisync_detach_deleted_project(uuid)`の契約を接続し、
認証確認・Room identity応答・許可されたdetach actionを検証する。local cleanupはこの成功後にのみ実行し、
RPC失敗やlocal module失敗時はrecentカード・Manifestを削除しない。単体・契約検証は通過しているが、実端末の
長時間負荷、既存ユーザーProjectを対象にした実削除、実Supabaseのremote detach、stagingの複数ユーザー受入れは、
データ保護のため未実行であり、Stage 8の`UNTESTED`境界に残す。

次の実装ゲートは、remote detach bridgeの認証済みstaging試験、削除対象の権限確認・監査Receipt、端末別の大量保存・
再起動試験である。これらが揃うまで、削除済み・公開済み・Production-readyとは表示しない。

### 2026-08-28 Native配布物の軽量化Gate

Capacitorへ渡す`pixiedraw2`は、リポジトリ全体を同梱せず、実行時に必要なHTML・CSS・ブランド画像・icon sprite・
iDRAW／iAUDIO／iGAMEのBundleと遅延Chunkだけを明示allowlistで同期する。これにより、開発用ソース・テスト・Benchmark・
fixture・設計資料がNative配布物へ混入する経路を閉じた。

ローカルでは、allowlist検査、FP-007のstaging資格検査、Web staging、Capacitor同期、Android debug build、staged URLの
新規Project起動を確認済みである。これは軽量化と配布物整合性のGateであり、Android実機／iOS／署名／Store、実staging Realtime、
監視・RollbackのEvidenceではない。したがってStage 8は引き続き実環境`UNTESTED`とし、次は認証済みstagingと実端末で同じ
Package Hashを検証する。
