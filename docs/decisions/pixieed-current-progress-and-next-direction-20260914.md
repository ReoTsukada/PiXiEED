# PiXiEED 現在の進行状況と今後の進行方向

更新日: 2026-09-14  
対象: PC版 iDRAW / iAUDIO / iGAME、共通アセット、Unity出力、Market／PiXYNC

この文書を、2026-09-14時点の進行方向の正本とする。実装状態の詳細は [`pixieed-vnext-implementation-status-20260906.md`](./pixieed-vnext-implementation-status-20260906.md)、アセットからゲームへの設計根拠は [`../research/draw-to-game-pipeline-20260914.md`](../research/draw-to-game-pipeline-20260914.md) を参照する。

## 1. 現在のフェーズ

PiXiEEDは、機能を無制限に増やす段階から、**PC版で「作る → ゲームに置く → 動かす」を実体で受け入れる段階**へ移行する。

現在の判定は次の通り。

- PCの入力所有権、Spaceの再生／パン分離、モード別Timeline記憶は実装済み。
- iDRAW／iAUDIO／iGAMEの既存データ契約、アセット定義、Unity出力生成器、Market権利境界は存在する。
- iDRAWの表示中合成画像を確定画像として取り込み、iGAMEで実画像を配置し、Unity実環境で動かす一連の受入れは未完了。
- Supabaseの対象MigrationとEdge Functionは本番Projectへ反映済み。ただしStripe決済、Storage配信、Realtime、2ユーザー再接続の成功系受入れは未完了。
- タブレット／モバイルは今回の進行対象外とし、PC受入れ後に別工程で扱う。

したがって、現時点を「全機能完成」ではなく、**PC制作基盤のローカル検証済み・外部縦断受入れ前**と表現する。

## 2. 固定する責務の境界

| 領域 | 正本となる情報 | 次の領域へ渡すもの |
| --- | --- | --- |
| iDRAW | Canvas、Frame、Layer、Selection、表示中の合成結果 | 画像バイト、Frame、方向、Animation、duration、Pivotを含むAsset Revision |
| iAUDIO | Audio Project、Track、Clip、Note、Tick／PPQ | 音声ファイル、Track／Clip情報、再生条件を含むAudio Package |
| iGAME | Project、Scene、Stage、Runtime Instance | 確定済みAsset Revisionを参照する配置情報とゲーム固有設定 |
| PiXYNC | Draw2のローカル3モード同期と、接続時のオンライン同期 | 同じProject／Revisionを扱うための同期イベントと保存結果 |
| Market | Listing、Entitlement、License Snapshot、Provenance、Revenue Snapshot | 権利確認済みの取得可能なArtifact |
| 外部PiXiEED Bridge | 任意のNative connector、Aseprite／Unity連携 | PiXYNCとは別に動作する外部接続。Draw2の同期機構とは同一視しない |

「参照がある」ことと「実際に表示・再生できるファイルがある」ことは分ける。iGAME、Unity、Marketへ渡す直前に、画像・音声の実体とManifestを検証する。

## 3. 直近で完了した実装

### PC入力・レイアウト

- iDRAWの矢印キーはCanvas／Selection／Timeline上でのみ有効にする。
- iAUDIOの矢印キーはPiano Roll上の編集に限定する。
- iGAMEの矢印キー／WASDはStage／Runtime上に限定し、他モードへ漏らさない。
- Spaceは短押しで再生、Canvas／Piano Roll上のドラッグではパンとし、フォーカス中のボタンを誤って起動しない。
- iDRAW／iAUDIO／iGAMEでTimelineの高さを個別に記憶し、モード切替で別モードのレイアウトを引き継がない。
- PCのiAUDIOでは、直接操作で代替できる重複ツールバーを非表示にする。狭い表示では操作を失わないための退避表示を残す。

### 検証済み範囲

- `deno task check`: PASS
- `deno task test`: 97件 PASS
- 入力所有権／Workspace UI対象テスト: 48件 PASS
- `deno task build`、`deno task build:workspace:min`: PASS
- `git diff --check`: PASS
- 現在のブラウザでモード切替、Timeline保持、Consoleエラーなしを確認

ブラウザで確認した表示幅は504pxであり、1120px以上のPCレイアウトを受け入れた証拠ではない。Unity実環境と本番Supabase環境も未受入れである。

### 本番反映状況（2026-09-14）

対象Project `kyyiuakrqomzlikfaire`へ、履歴を確認したうえで対象MigrationとEdge Functionを反映した。現在の判定は `EXTERNAL_PARTIAL` とする。

- リモートDBはPostgreSQL 17.6。リモートだけに存在した過去Migration 35件は、SQLを取り消さず履歴上のみ `reverted` として整理し、ローカルに存在する2026-08-24以降の11 migrationを順番に適用した。既存テーブル・データのロールバックは行っていない。
- `market_asset_revisions`、`market_asset_entitlements`、`market_asset_bindings`、`collab_v1.room_scope_assignments`、`collab_v1.room_participation_consents`、Draw2 aggregate tablesが存在することを確認した。
- ローカル管理下の13 Functionを反映し、全て `ACTIVE`。`market-download`、`igame-player-bootstrap`、`market-verify-listing-package`等の認証必須入口はJWT検証を有効化した。リモート専用の既存Function 3件は削除・変更していない。
- 未認証HTTPスモークは、`market-download`、`igame-player-bootstrap`、`market-verify-listing-package`、`market-create-checkout`が401、公開`market-public-preview`が200（空入力で空結果）だった。
- Security AdvisorにはRLSポリシーなし34件、mutable search_path、Security Definer実行権限、匿名アクセス方針、漏洩パスワード保護無効などの既存警告が残る。新規のservice role専用テーブルを含む意図的なfail-closed設計もあるため、一括削除・変更は行わず、別のセキュリティ対応工程に分離する。
- Stripeの実決済、無料取得成功、Storage署名URLの所有者配信、期限切れ／Revision無効化／改ざん拒否、Realtimeの2ユーザー再接続、Unity Editor Importは、実ユーザー・実商品・Unity環境が必要なため未受入れ。

本番のコード・DB反映は完了したが、成功系と外部クライアントの受入れが終わるまで `PRODUCTION_ACCEPTED` とは表現しない。

## 4. これからの実装順序

### P0-A: PC入力の受入れを固定する

対象は既存実装の仕上げであり、新機能追加ではない。

1. 1120px以上のPCブラウザでDRAW／AUDIO／GAMEを確認する。
2. 各モードで矢印、Space、WASD、Enter、Escape、Delete、Cmd／Ctrl系ショートカットの所有面を確認する。
3. ノート、範囲、Canvas、Stage、ボタンにフォーカスを移しても、別モードの操作が発火しないことを確認する。
4. Space再生時に直前のボタンが再発火しないことをブラウザで受け入れる。

完了条件は、直接操作とショートカットが対象面から外へ漏れず、モード切替後もTimeline表示が壊れないことである。

### P1-A: iDRAWからiGAMEまでの最小縦断を完成する

最優先のユーザー価値は、**描いたものが実際にゲーム画面へ出て動くこと**とする。

1. iDRAWで現在表示中のレイヤー合成結果を、選択範囲の透明部分を保ったまま1枚目としてMaterializeする。
2. 現在Frame、複数Frame、Animation、1／2／4／8方向、duration、Pivotを一つのManifestへ確定する。
3. Asset Cardで実画像とフレーム順を表示し、空の参照カードを作らない。
4. iGAMEのProject Libraryへ保存し、Stageへドラッグして配置する。
5. 配置直後に既定Animationを再生し、保存・再読込後も同じ実体を表示する。
6. 古いRevisionと現在のRevisionを区別し、権利のないArtifactは配置しない。

この工程では、役割、SE、販売条件などをiDRAWへ戻さない。視覚アセットの作成とアニメーションに集中する。

### P1-B: Unity出力を実環境で確定する

既存の出力生成器を利用し、次の順で受け入れる。

1. PNG単体と連番PNG
2. Sprite SheetとManifest
3. Point Filter、PPU、Pivot、Frame順、duration
4. Animation Clip、Animator Controller、Prefab
5. Unity EditorでImport、Compile、Scene配置、Play

生成契約のテストがPASSでも、Unity Editorでの確認までは「実装済み」としない。対象Unityバージョンを固定し、最小の検証用Projectを残す。

### P0-B: Supabase／Marketの本番相当受入れ

MigrationとFunctionの反映は完了。残りは実ユーザーを用いた受入れである。

1. private Storage、署名URL、RLS、Entitlement、License Snapshotを実商品で確認する。
2. 無料取得、有料購入、所有者再生、期限切れ、Revision無効化、改ざん、権利不足を確認する。
3. Stripe webhookの冪等性、返金・取消、Realtime、2ユーザー再接続を確認する。
4. iGAMEで取得直後に実画像／音声を使えることを確認する。

履歴修復は完了済みだが、既存のリモート専用Functionを削除する `prune` は使用していない。

### P2: Inspectorとパネルの段階的な再配置

アセット縦断の挙動が確定した後に行う。目的はInspectorをきれいにすることではなく、操作の主役を対象そのものへ戻すことである。

- Canvasの変形、Timelineのノート編集、Layerの並べ替え、Paletteの色選択は直接操作を主役にする。
- 選択中だけContext UIを表示する。
- 数値入力、高度設定、補助情報だけをInspectorへ残す。
- 既存操作性を壊す一括置換、単なるAccordion化、アイコン化だけの変更は行わない。

### P3: タブレット／モバイル

PCの入力、アセット縦断、Unity、Marketの受入れが完了してから、別の画面密度・タッチ操作として設計する。今回のPC変更をそのまま縮小して適用しない。

## 5. 並列実行の単位

依存しない作業は次の4ストリームで進める。

| ストリーム | 内容 | 依存 |
| --- | --- | --- |
| A | PCブラウザの入力所有権、Timeline、Space、表示幅受入れ | 現行コード。すぐ開始可能 |
| B | iDRAWの合成画像Materialize、共通Manifest、iGAME実画像配置 | 共通Delivery契約を確認 |
| C | Unity検証用Project、PNG／Sheet／Prefab／Animator受入れ | Manifest確定後に本実行。準備は先行可能 |
| D | Supabase Staging、Migration履歴、Edge／Storage／RLS／Stripe確認 | 接続情報と安全な検証環境が必要 |

BがManifestを確定した時点でCを本実行し、Dは本番適用前の準備を進める。最後に一人の統合担当が、iDRAW → iGAME → Unity → MarketのRevision、実体、権利を突き合わせる。

## 6. 完了判定の言葉

- `IMPLEMENTED`: コードまたは契約が存在する。
- `VERIFIED_LOCAL`: ローカルの型検査・単体／契約テストを通過した。
- `BROWSER_VERIFIED`: 対象ブラウザ・対象表示幅で操作を確認した。
- `EXTERNAL_VERIFIED`: Unity、Supabase、Stripeなど実環境で確認した。
- `PRODUCTION_ACCEPTED`: 本番相当の権利、配信、再接続、失敗系まで受入れた。
- `UNTESTED`: 対象環境がない、または確認をまだ行っていない。

下位の判定を飛ばして上位の判定にはしない。特に、ローカルの「参照契約PASS」をUnity表示やMarket購入完了の証拠にしない。

## 7. 今後の停止ルール

次の条件を満たすまで、不要な新機能や全面UI改修を増やさない。

- P0-AのPC入力受入れが完了している。
- P1-Aで1枚絵と複数Frameの両方をiGAMEへ実体配置できる。
- P1-Bで最低1種類の画像アセットをUnity EditorへImportして再生できる。
- P0-BでMarketの取得・権利拒否・Revision拒否・Storage配信を確認できる。
- 必須テストと最終差分検査がPASSしている。

この条件を満たした後に、追加のエフェクト、タイル、背景、音声連携、共同制作UI、SNS／世界図鑑の高度化を、実際の縦断結果に基づいて優先順位付けする。

## 8. 変えないもの

- PiXYNCと外部PiXiEED Bridgeを同じ同期方式として説明しない。
- 既存のProject、PXD、Market、履歴、バックアップの互換契約を、縦断に不要な理由で削除しない。
- 権利情報が確認できない場合に、推測で「使用可能」と表示しない。
- 生成Packageの存在だけでUnity／本番対応済みと宣言しない。
- 直接操作へ移す項目を、単にInspector内の別タブへ移動して完了としない。
