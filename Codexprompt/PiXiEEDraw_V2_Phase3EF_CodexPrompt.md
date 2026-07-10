# PiXiEEDraw V2 Phase 3-E/F Codex Prompt

## 目的

Phase 3-Dまで完了している前提で、次のステップに進む。

目的は、DEV環境だけで `includeSheets:true` の experimental v2 保存を手動検証できる導線を追加し、実ファイルで保存・再読込・サイズ比較を確認すること。

通常保存・autosave・recentProjects・旧shared syncには接続しない。

---

## Codexへ渡すプロンプト

```text
Phase 3-Dまで完了している前提で、次のステップに進んでください。

現在の到達点：
- Phase 3-A 設計メモ化済み
- Phase 3-B hash key を `encoding + w + h + bytes` 含みに強化済み
- Phase 3-C bitmap collision fixture / test 追加済み
- Phase 3-D sheet archive schema 実装済み
- `includeSheets:true` のv2 archiveで、active sheet / non-active sheet / multi-canvas / shared bitmap / directOnly / indexed / mixed / importSourceDirect / timelapse のround-trip確認済み
- 通常保存、上書き保存、autosave、recentProjects、旧shared syncには未接続
- 対象は `PiXiEEDrawDEV/` のみ
- 本番 `pixiedraw/` には触れない

次の目的：
Phase 3-E / 3-Fとして、DEV環境だけで `includeSheets:true` のexperimental v2保存を手動検証できる導線を追加し、実ファイルで保存・再読込・サイズ比較を確認する。

やってよいこと：
1. `PiXiEEDrawDEV/` のみに変更する
2. DEV限定の隠し導線を追加する
3. `saveProjectAsPixieedrawV2Experimental()` を `includeSheets:true` で呼べるようにする
4. v2保存は必ず新規保存扱いにする
5. 既存ファイルハンドルには絶対に上書きしない
6. 保存後にv1/v2サイズ比較をconsoleへ出す
7. UI導線を付ける場合は、明確に `Experimental V2 / DEV only / includeSheets:true` と表示する
8. 保存したv2ファイルをPiXiEEDrawDEVで開き直せるか確認する
9. 手動確認用チェックリストを `docs/` か `codex-workflow-notes.md` に追記する

やってはいけないこと：
1. 通常保存ボタンへ接続しない
2. 既定保存形式をv2にしない
3. autosaveをv2化しない
4. recentProjectsをv2化しない
5. historyをv2化しない
6. 旧shared syncへ接続しない
7. 本番 `pixiedraw/` に触れない
8. timelapse分離はまだしない
9. Web Worker化はまだしない
10. 販売用元ファイルとして正式採用しない

実装方針：
- まず既存の `saveProjectAsPixieedrawV2Experimental()` が `includeSheets:true` を明示的に受け取れるか確認する
- すでに受け取れるなら、DEV限定の呼び出し口だけ追加する
- 受け取れないなら、既存v2 experimental保存の通常挙動を壊さず、明示オプションとして `includeSheets:true` を渡せるようにする
- v2保存後、保存対象のBlobサイズを取得し、v1保存時のBlobサイズと比較できるようにする
- 比較ログは最低限 `v1 bytes`, `v2 bytes`, `saved bytes`, `reduction percent` を出す

DEV hidden導線の候補：
A. console用関数として `window.__pixieedrawSaveV2ExperimentalIncludeSheets()` を追加する
B. DEV専用メニューまたは隠しボタンを追加する

推奨はAです。
理由は、通常UIに誤って露出するリスクが低く、検証が終わったら削除しやすいためです。

console関数案：
`window.__pixieedrawSaveV2ExperimentalIncludeSheets = async function () { ... }`

この関数で行うこと：
1. 現在のactive projectを取得
2. v1保存Blobを生成してサイズを記録
3. v2 experimental保存Blobを `includeSheets:true` で生成
4. v1/v2サイズ比較をconsole出力
5. `showSaveFilePicker` または既存の新規保存処理でv2ファイルを保存
6. 既存ファイルハンドルへは保存しない
7. 成功・失敗をconsoleに出す

console出力例：
[PiXiEEDraw V2 Experimental]
includeSheets: true
v1 bytes: 58185
v2 bytes: 18094
reduction: 68.9%
saved as new file: true

手動確認チェックリスト：
- [ ] 通常保存はv1 JSONのまま
- [ ] autosaveはv1のまま
- [ ] recentProjectsはv1のまま
- [ ] 旧shared syncには接続されていない
- [ ] DEV console関数からv2 includeSheets:true保存ができる
- [ ] 既存ファイルを上書きしない
- [ ] 保存したv2ファイルをPiXiEEDrawDEVで開き直せる
- [ ] active sheetが復元される
- [ ] non-active sheetが復元される
- [ ] activeSheetIdが維持される
- [ ] 各sheet内のmulti-canvasが維持される
- [ ] directOnly layerが壊れない
- [ ] indexed layerが壊れない
- [ ] mixed indexed + direct layerが壊れない
- [ ] importSourceDirectが壊れない
- [ ] timelapseが消えない
- [ ] v1/v2サイズ比較がconsoleに出る

追加で確認してほしい端ケース：
1. duplicate sheet.id がある場合、安全にエラーになるか
2. sheetId にpath separatorや危険文字がある場合、安全にsanitizeされるか
3. `shared*` metadataが残っている場合、意図せず削除されないか
4. root session と sheet.project.session が両方ある場合、復元方針が一貫しているか

完了後に報告してほしいこと：
1. 変更ファイル
2. 追加したDEV hidden導線
3. 通常保存・autosave・recentProjects・旧shared syncに接続していない根拠
4. `includeSheets:true` で保存されることの根拠
5. 既存ファイルハンドルへ上書きしない根拠
6. 手動検証手順
7. v1/v2サイズ比較結果
8. 保存したv2ファイルを開き直した結果
9. 残リスク

まずは実装前に、どの導線で進めるかだけ短く確認してください。
推奨は console用関数です。
```

---

## 補足判断

前回の設計メモはそのままでよい。

次は通常UIに出さず、まず console用のDEV限定関数で手動検証するのが安全。

通常保存、autosave、recentProjects、旧shared sync、history、販売用元ファイル正式採用にはまだ接続しない。
