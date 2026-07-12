# PiXiEEDraw DEV: V2 正本化・交換契約

対象は `PiXiEEDrawDEV/`。V1 は既存データの読込互換のみに残し、新規の端末内保存・recent project・外部交換を V2 に統一するための契約である。

## 目的

- 大きなRGBAデータをV1 JSON/base64としてrecent projectへ丸ごと重複保存しない。
- 通常の編集では、変更されたsheetのcheckpoint/journalだけを更新できるようにする。
- 将来の売買・譲渡・公開では、端末固有のruntime状態を含まない不変のV2 archiveを渡せるようにする。
- V2書込失敗時でも、既存V1データを読める状態を維持する。

## V2の二つの用途

| 用途 | 正本 | 性質 | 含めないもの |
| --- | --- | --- | --- |
| 端末内autosave/recent | `autosave-schema-v2` IndexedDB revision | 可変・差分journal・直近2世代保持 | File System handle、DOM、runtime cache |
| ファイル/売買/譲渡 | `pixieedraw-v2` archive | 不変・portable・検証可能 | 端末local ID、autosave journal、個人認証情報 |

両者は同じdocument/sheet/layerのV2正規表現を利用するが、autosave revisionをそのまま売買データとして公開しない。

## recent metadataの契約

`recentProjects` ストアに残すV2 entryは軽量metadataのみとする。

```js
{
  id,
  autosaveSchemaVersion: 2,
  manifestKey,
  name,
  fileName,
  updatedAt,
  thumbnail,
  dotStats,
  accountUserId
}
```

`project`、V1 `projectJournal`、base64 pixel dataは新規V2 entryに書かない。実データはV2 manifestからcheckpoint/journalを辿る。

## 読込優先順位

1. `autosaveSchemaVersion === 2` かつV2 manifestが有効ならV2を復元する。
2. V2 manifestまたはcheckpointが壊れていれば、直前の有効V2 revisionへfallbackする。
3. V2が存在しない既存entryだけ、V1 `project` / `projectJournal` / file handleから復元する。
4. V1を読めても、読込自体でV2へ上書き移行しない。次の正常なautosaveでV2正本になる。

## 書込の順序

1. current runtimeから1回だけsnapshot/candidateを作る。
2. V2 revisionをIndexedDB transactionでcommitする。
3. V2 manifest参照だけをrecent metadataへ書く。
4. recent metadataの書込に失敗した場合は、V2 revisionを残し、一覧へ出ない孤立revisionを後続cleanup対象にする。
5. V1 payloadを同時に書かない。V2 commit失敗時だけ既存V1 entryを保持し、失敗を通知する。

## 昇格条件

- V2 primaryのrecent open、sheet切替、削除、recoveryがV1と同じ結果になる。
- GIF/PNG、RGB/Indexed、multi-sheet、journal replay、thumbnailが回帰しない。
- manifest/revision/checkpoint/journalの参照整合が検証できる。
- V1 readerは削除しない。

## 交換・売買の安全境界

- 出品/譲渡はV2 archiveを新規生成し、source作者・license・公開可否・content hashを別metadataとして扱う。
- autosave DBのmanifest key、account namespace、recent project ID、ローカルfile handleを交換データへ含めない。
- archive hashは「公開する完成内容」の識別用であり、作業中autosave revisionの識別子として再利用しない。
- 交換前のarchive validationに失敗したデータは公開・購入・読込対象にしない。

### 一致・重複の自動検知

- PiXiEEDraw本体はcontent hashや近似特徴量を常時計算・保存しない。描画・autosave・タブ切替のメインスレッド負荷を増やさないためである。
- PiXiEEDrawが担当するのは、portable archiveのvalidationと、外部側が決定的hashを算出できる正規化済みV2 archiveの出力までとする。
- 出品時に、validation済みV2 archiveから決定的なcontent hashを生成する。同じ完成内容は同じhashになる必要がある。
- hash対象はdocument、sheet順序、palette、frame/layer pixel data、公開対象のmetadataだけとする。作者ID、購入者ID、端末ID、autosave revision、thumbnail生成時刻は含めない。
- 完全一致はcontent hashで検出し、近似一致の検出は別のperceptual hash/特徴量として保存する。両者を同じ判定に使わない。
- 一致検出は出品時・更新時・購入前に実行し、重複、再出品、権利情報の矛盾を警告できるようにする。自動拒否の条件はlicense/権利ポリシーと分離して決める。

## 実装フェーズ

1. V2 primary metadataとV2読込境界を追加する。
2. new autosave/recentをV2 primaryへ切替える。
3. V2のsheet切替・delete・recoveryを接続する。
4. V1 new writeを停止し、readerのみ残す。
5. V2 archiveの売買/譲渡metadataを別機能として追加する。
