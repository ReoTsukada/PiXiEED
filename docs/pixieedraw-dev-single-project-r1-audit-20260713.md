# PiXiEEDrawDEV 単一プロジェクト化・描画専用化 Phase R1 構造監査

- 監査日: 2026-07-13
- 対象: `PiXiEEDrawDEV/` のみ
- 基準ビルド: `20260713-039`
- 本番 `pixiedraw/`: 対象外・未変更
- 方針: `1 editor instance = 1 project session = 1 active document = 1 persistence identity`

## 0. 結論

現在の DEV は、タブDOMとプロジェクト一覧DOMを既に撤去しているが、内部では複数プロジェクト対応の互換層が存続している。特に `openProjectTabs`、`activeOpenProjectTabId`、`project/deferredProjectPayload`、タブ別保存handle、V2の `sheets/sheetOrder/activeSheetId` が保存・復元経路を兼務している。

したがって次の削除はまだ安全ではない。

- `openProjectTabs` を直接 `state` へ置換する
- `activeOpenProjectTabId` を先に削除する
- V2の `sheets` をschemaから削除する
- `projectSaveHandle` をタブコードと一緒に削除する
- `recentProjects` の保存メタデータをUIと一緒に削除する

Phase R2ではschemaを変更せず、単一の `activeProjectSession` が既存の保存責務を所有する契約を先に作る。その後、既存タブ関数をその契約への互換アダプターへ縮退させる。

## 1. 現行アーキテクチャ

### 1.1 起動構造

`PiXiEEDrawDEV/index.html` は157本のローカルJavaScriptを初期scriptとして列挙する。合計ファイルサイズは5,582,838 bytes（5.32 MiB、非圧縮）で、ES module bundleではなく `window.PiXiEEDrawModules` を共有レジストリとして順次登録する構造である。

`assets/js/app.js` は約1.35 MBあり、次を一つのクロージャで所有する。

- `state`: 編集中document/canvas/frame/layer/palette/UI状態
- `dom`: IDベースで収集したDOM参照
- `openProjectTabs` と `activeOpenProjectTabId`
- autosave/recovery/reload/recentProjects
- import/export/codec/workerへの結線
- 共有機能、アカウント、広告、PWA、外部ツール導線

145モジュールが `window.PiXiEEDrawModules` へ登録され、84モジュールが `with (scope)` + `Proxy` により未定義名を `globalThis` へフォールバックする。これは分割ファイル数に対して実質的なグローバル結合が強い構造である。

### 1.2 現在の単一化状況

完了済み:

- タブ帯DOMは `index.html` から撤去済み
- タブ用CSS高さはPC/モバイルとも `0px`
- ホームのrecent project card DOMは撤去済み
- 開始画面は新規作成、ファイルを開く、PiXiEEDマイページ導線のみ
- 旧複数タブpackageを個別V2 projectへ分割する互換処理を追加済み

未完了:

- 内部配列 `openProjectTabs`
- 選択子 `activeOpenProjectTabId`
- タブ切替、追加、削除、長押し、resident/deferred payload
- タブ単位の保存handleとpersistence metadata
- package/autosave V2の複数sheet表現
- startup/recentProjects/account/shared関連モジュールの初期ロード

## 2. tab / project / sheet / canvas の関係

| 概念 | 現在のID | 実体 | 所有データ | 単一化後 |
|---|---|---|---|---|
| tab | `project-tab-<time>-<seq>` | `openProjectTabs[]` の要素 | project全体、保存handle、source metadata、resident/deferred payload | `DELETE`（R4以降） |
| project | `local-<uuid>` 等 | autosave/recent/V2 manifestの保存単位 | persistence identity、更新時刻、manifest | `KEEP` |
| V2 sheet | 現状は主にtab IDを流用 | `package.sheets[].project` | 一つの完全なpackaged project | R2では1要素固定、schema互換のため `TEMPORARY_COMPATIBILITY` |
| document | `project.document` | 編集対象のdocument snapshot | canvases、palette、documentName | `KEEP` |
| canvas | UUIDまたは `canvas-*` | `document.canvases[]` | frames、activeFrame、selection、mirror、size | `KEEP` |
| frame | frame ID | canvas配下 | layers、duration等 | `KEEP` |
| layer | layer ID | frame配下 | indices/direct RGBA等 | `KEEP` |
| persistence identity | `sourceProjectToken` + project ID | source/adapterの同一性 | sourceKind、adapter、lastSaved adapter | `COLLAPSE_TO_SESSION` |
| autosave identity | `autosaveProjectId` | V2 DBのproject ID | manifest/checkpoint/journal/current ref | `KEEP`、sessionへ所有移管 |
| recovery identity | project ID + revision/checkpoint session ID | V2 recovery/U3 | pre-update checkpoint、reload snapshot | `KEEP` |
| file handle identity | `projectSaveHandle` + meta | File System Access handle | fileName、adapterId、permission、boundAt | `KEEP`、sessionへ所有移管 |

重要な混同箇所は `buildProjectSheetsPayload()` である。ここでは `openProjectTabs` の各要素をV2 `sheets[]` へ変換し、tab IDをsheet IDとして保存する。現在の「sheet」はcanvas/frame/layerではなく、実質的に「別projectを内包する保存slot」である。よってproject tabだけを廃止しても、`document.canvases`、frame、layerは削除対象ではない。

## 3. タブ関連symbol一覧

主要8モジュールに101個のfunction宣言がある。`app.js` 内のscope getter/setterや薄いwrapperはこの数に含めない。

### 3.1 `open-project-tab-model.js`（10）

`createOpenProjectTabModel`, `resolveTabPersistenceState`, `resolveTabProjectSaveHandle`, `resolveTabProjectSaveHandleMeta`, `getProjectPersistenceStateFromTab`, `buildOpenProjectTabPayloadFromCurrentState`, `createOpenProjectTabFromCurrentState`, `createLocalOpenProjectTabFromCurrentState`, `createOpenProjectSheetTabFromPackagedProject`, `normalizePackagedProjectSheets`

- role: tab object生成、project payload保持、source/save metadata正規化
- owner: `openProjectTabs[]`
- readers: lifecycle、workflow、package/autosave、open/import
- writers: new/open/recent/recovery/load
- side effects: full snapshot生成、resident/deferred payload参照保持
- 判定: persistence関連は `COLLAPSE_TO_SESSION`、packaged sheets読込は `TEMPORARY_COMPATIBILITY`、残りはR9で `DELETE`

### 3.2 `open-project-tab-helpers.js`（23）

`createOpenProjectTabHelpers`, `createOpenProjectTabId`, `findOpenProjectTabIndex`, `findOpenProjectTabIndexByProjectId`, `queueProjectTabViewportReset`, `getSharedProjectKeyFromProjectId`, `getSharedRecentProjectEntryForTab`, `getOpenProjectTabSharedKey`, `retainOpenProjectTabProjectWriteGuard`, `releaseOpenProjectTabProjectWriteGuard`, `isOpenProjectTabProjectWriteGuarded`, `matchesDeletedProjectOpenTab`, `getRecentProjectOpenTabProjectId`, `findOpenProjectTabIndexForRecentProjectEntry`, `getActiveOpenProjectTab`, `isSharedOpenProjectTab`, `clearOpenProjectTabLongPressTimer`, `cleanupOpenProjectTabLongPressTracking`, `suppressNextOpenProjectTabClick`, `shouldSuppressOpenProjectTabClick`, `beginOpenProjectTabLongPress`, `updateOpenProjectTabLongPress`, `endOpenProjectTabLongPress`

- role: tab検索、ID生成、write guard、長押しUI、shared判定
- side effects: timer、rAF、viewport reset、write guard Map
- 判定: project ID/shared key正規化は `KEEP/RENAME`、viewport resetはdocument openへ移管、長押し・tab検索・tab guardは `DELETE`

### 3.3 `open-project-tab-workflow-utils.js`（18）

`createOpenProjectTabWorkflowUtils`, `createRemoveProjectSheetCommandOwner`, `logProjectSheetRemovalTransaction`, `releaseAutosaveProjectId`, `buildActiveSharedProjectSheetTabFields`, `queueSharedProjectSheetsSnapshot`, `switchToOpenProjectTabForRecentProjectEntry`, `closeOpenProjectTabsForDeletedProject`, `retargetAutosaveProjectId`, `clearDeletedSharedProjectLocalState`, `purgeDeletedSharedProjectLocalReferences`, `confirmCloseOpenProjectTab`, `planProjectSheetRemoval`, `rollbackProjectSheetRemoval`, `commitProjectSheetRemoval`, `renameOpenProjectTab`, `activateOpenProjectTab`, `closeOpenProjectTab`

- role: switch/remove/rollback、project ID retarget、削除cleanup
- side effects: autosave flush、document差替え、history/timelapse復元、recent削除、shared cleanup
- 判定: project ID retarget/cleanupはsession/repository serviceへ `COLLAPSE_TO_SESSION`、一覧削除は `MOVE_TO_MYPAGE`、switch/remove/renameは `DELETE`

### 3.4 `open-project-tab-lifecycle.js`（24）

`createOpenProjectTabLifecycle`, `normalizeBindingHandleState`, `normalizeBindingAdapterId`, `normalizeBindingMeta`, `getProjectSaveBindingFromTab`, `getActiveProjectSaveBinding`, `updateOpenProjectTabSaveBinding`, `bindOpenProjectTabSaveHandle`, `bindActiveProjectSaveHandle`, `clearOpenProjectTabSaveHandle`, `clearActiveProjectSaveHandle`, `markOpenProjectTabSaveHandleUnavailable`, `markActiveProjectSaveHandleUnavailable`, `ensureOpenProjectTabsInitialized`, `setProjectHomeVisible`, `showProjectHomeScreen`, `hideProjectHomeScreen`, `revealActiveProjectAfterOpen`, `appendOpenProjectTabFromCurrentState`, `replaceActiveOpenProjectTabFromCurrentState`, `canReuseActiveOpenProjectTabForRecentEntry`, `persistActiveOpenProjectTab`, `resetOpenProjectTabsToCurrentProject`, `closeAllOpenProjectTabsForProjectReplacement`

- role: 保存handle bindingとtab lifecycleが同居
- side effects: handle状態更新、autosave flush、home/start表示、payload snapshot
- 判定: handle関連12関数は `COLLAPSE_TO_SESSION` で削除禁止。home/startは最小launcherへ `RENAME`。append/replace/persist/close tabsはR4-R9で互換adapter化後 `DELETE`

### 3.5 `open-project-tab-view.js`（8）

`createOpenProjectTabView`, `getOpenProjectTabDisplayLabel`, `getOpenProjectTabRenderLabel`, `buildOpenProjectTabsStructureSignature`, `syncOpenProjectTabActiveState`, `resolveProjectTabAddAvailability`, `syncProjectTabAddButtonAvailability`, `renderOpenProjectTabs`

- 現在DOMが存在しないため `renderOpenProjectTabs()` は早期returnする
- 判定: R9で全て `DELETE`

### 3.6 `open-project-tab-sheet-actions.js`（9）

`createOpenProjectTabSheetActions`, `createBlankSheetPackagedProject`, `restoreTransactionRuntime`, `commitSheetCandidate`, `createNewSheetTab`, `openProjectTabAddPicker`, `closeProjectTabAddMenu`, `getProjectTabAddDebugState`, `setupOpenProjectTabs`

- 現在tab list DOMが存在しないためUIはbindされない
- 判定: 旧package移行完了確認後R9で全て `DELETE`

### 3.7 `project-sheet-collection-utils.js`（5）

`createProjectSheetCollectionUtils`, `validateSheetCanvasCount`, `validateProjectSheetsCollection`, `prepareSheetCandidate`, `validateSheetCandidate`

- 判定: 旧複数sheet reader期間は `TEMPORARY_COMPATIBILITY`。canvas上限検証はdocument validatorへ `RENAME`、候補collectionは `DELETE`

### 3.8 `project-sheet-transaction-utils.js`（4）

`createProjectSheetTransactionUtils`, `createTransactionSnapshot`, `validateCandidates`, `rollbackSheetCandidate`

- 判定: R9で全て `DELETE`

### 3.9 タブ状態フィールド

現在 `openProjectTabs[]` は少なくとも次を保持する。

- identity: `id`, `projectId`, `runtimeProjectId`, `sheetRuntimeId`, `sheetPersistenceKey`, `autosaveV2SheetId`
- display: `fileName`, `label`, `source`, `updatedAt`
- payload: `project`, `deferredProjectPayload`, `deferredPayloadKey`, `residentProjectLoaded`, `deferredRestore`
- dirty/history: `unsaved`, `historyOwnerId`, `timelapseOwnerId`
- persistence: `sourceKind`, `sourceStorageAdapterId`, `sourceProjectToken`, `lastSavedStorageAdapterId`, `projectSaveHandleState`, `projectSaveHandle`, `projectSaveHandleMeta`
- import: `sourceProjectId`, `sourceSheetId`, `isImportedSheet`, canonical V2 metadata
- shared/QR: shared IDs/revisions/role、`qrEditPayload`

project/file/autosave/recoveryに必要なフィールドだけをR2 sessionへ移し、payloadの二重参照とtab専用owner IDは廃止候補とする。

## 4. ホーム・プロジェクト一覧関連

| 機能 | 現行symbol/場所 | 現在 | 移行先 |
|---|---|---|---|
| launcher | `projectHomeScreen`, `showProjectHomeScreen` | 開始3導線のみ | 描画画面に最小限残す |
| startup dialog | `startupScreen`, `showStartupScreen`, `setupStartupScreen` | resume/list DOMは撤去済み | launcherと統合して縮小 |
| recent取得 | `loadRecentProjectsMetadata` | IndexedDB metadata読込 | repository APIは共有、UIはMy Page |
| cache | `recentProjectsCache`, `setRecentProjectsCache` | editor heapのMap | editorはactive project metadataだけ。全一覧はMy Page |
| card render | `renderRecentProjectsList` | container不在でreturn | `MOVE_TO_MYPAGE` |
| open | `openRecentProject`, `openRecentProjectAsTab` | list/deep link兼用 | My Pageからproject IDで起動。editor側は単一 `openProject` |
| delete | `removeRecentProjectEntry` | DB/V2 cleanup | `MOVE_TO_MYPAGE` |
| duplicate | 専用UIなし。tab append/packaged copyで代替 | tab依存 | `MOVE_TO_MYPAGE` |
| empty state | recent renderer内 | DOM撤去済み | `MOVE_TO_MYPAGE` |
| URL/deep link | reload target、shared invite、lens/QR query | editor起動と混在 | project ID起動だけKEEP、一覧選択はMy Page |
| File System Access | open/save picker、handle store | editor保存の中核 | 最小限KEEP |
| My Page link | `../account/index.html` | launcher/file panelに存在 | KEEP |

`recentProjects` という名称でも、V2 manifest参照やactive project metadataの更新はautosaveに必要である。削除対象は一覧UIと全件cache常駐であり、保存repository自体ではない。

## 5. 保存・autosave・recovery依存

### 5.1 削除禁止

| 責務 | 主なsymbol | 理由 |
|---|---|---|
| project ID | `autosaveProjectId`, `createAutosaveProjectId`, `setActiveAutosaveProjectId` | V2 manifest/current refの主キー |
| source metadata | `normalizeProjectPersistenceState` | same-handle saveとconversion判断 |
| file binding | `projectSaveHandle`, `projectSaveHandleMeta`, `projectSaveHandleState` | 明示保存先と権限状態 |
| autosave scheduling | `scheduleAutosaveSnapshot`, `writeAutosaveSnapshot` | durable save |
| V2 checkpoint/journal | `writeSchemaV2Project`, `writeSchemaV2JournalRevision`, `readSchemaV2Project` | recoveryと差分保存 |
| dirty | `hasDocumentUnsavedChanges`, autosave dirty flags | loss prevention |
| reload recovery | `persistReloadSessionSnapshot`, `restoreReloadSessionSnapshot` | reload/update事故対策 |
| U3 | pre-update checkpoint API | 更新前復旧 |
| adapters | V1 JSON、V2 archive/zip、adapter resolver | 既存ファイル互換 |

### 5.2 tab依存している保存処理

1. `getActiveProjectPersistenceState()` がactive tabからsource metadataを読む。
2. `getActiveProjectSaveBinding()` がactive tabからhandleを読む。
3. `persistActiveOpenProjectTab()` がsnapshotをtab payloadへ戻してからautosaveする。
4. `buildProjectSheetsPayload()` がtab配列をV2 sheetsへ変換する。
5. `writeAutosaveV2Primary()` がactive tab IDをsheet ID/journal keyとして使う。
6. recovery openがcandidateを新しいtabとしてappendする。
7. reload/session payloadがtab/sheet collectionを保持する。

### 5.3 R2で想定するsession（今回は未実装）

```js
{
  projectId,
  documentId,
  sourceKind,
  sourceAdapterId,
  canonicalPayloadFormat,
  canonicalSchemaVersion,
  sourceProjectToken,
  projectSaveHandle,
  projectSaveHandleMeta,
  projectSaveHandleState,
  autosaveIdentity,
  recoveryIdentity,
  dirty,
  openedAt,
  updatedAt
}
```

R2ではV2 schemaを変えない。writer境界で `sheets: [{ id: stableDocumentSlotId, project }]` を生成し、readerは旧複数sheetを個別projectへ移行した後、選択した1件だけをsessionへ渡す。

## 6. 拡張ツール一覧

| 機能 | entry/UI | 主処理・依存 | 起動時 | 推奨扱い/transport |
|---|---|---|---|---|
| PiXiEELENS | camera buttons | `navigation`, `external-tool-workflow-utils` | 小 | 既存redirectをKEEP。結果はMessageChannel/IndexedDB |
| QR editor/reader | QR buttons、`qrEditPanel` | `qr-edit-*`, `qr-utils`, `jsQR.min.js` | 155KB級を常時load | `MOVE_TO_EXTERNAL_TOOL`; redirectまたは破棄型iframe、結果ArrayBuffer |
| GIF decode | file open | `image-import-decode-utils`, `color-codec-utils` | 常時load | 外部import tool; ArrayBuffer transferable / IndexedDB |
| PNG/JPEG/SVG/GIF encode | export dialog | `export-rendering`, `export-format-*`, codecs | 200KB超を常時load | 外部export tool; IndexedDB handoff + Blob result |
| SpriteMap/grid split | export dialog toggles | `export-rendering`, `sprite-scale`, planning | 常時load | 外部export tool; IndexedDB/Blob |
| GLB/voxel | export + preview | voxel 4 modules、local viewport連携 | 約99KB常時load | 外部tool; snapshot ArrayBuffer + new window/iframe |
| timelapse capture/export | file panel/export toggle | `timelapse-session-utils`, session serialization | 約39KB + heapログ | 記録はdurable journalへ、変換は外部tool; IndexedDB |
| PixFind export | hidden/utility | `pixfind-mode-utils` | 約13KB | external redirect/IndexedDB |
| simulation playback | canvas utility | `simulation-playback-workflow-utils` | 約7KB | state依存が強いため当面dynamic import、後にiframe検討 |
| image resize/upscale | import/export paths | import decode、canvas resize、scale planning | 混在 | document canvas resizeはKEEP、出力upscaleはexternal |
| palette generation | import/preset | palette modules | coreと混在 | palette編集はKEEP、画像解析generationのみdynamic/external |
| floating preview | editor UI | floating preview + object URLs | 常時load | editor state依存。R7ではdynamic import候補 |
| project V1/V2 encode/decode | save/open | storage adapters + lazy worker | 常時bridge、workerは遅延 | 最小保存読込なのでKEEP |

注意: `color-codec-utils.js` はGIFだけでなく色変換にも使われるため、ファイル単位で外す前に純粋color coreとGIF codecを分離する必要がある。

## 7. worker / bundle / 依存ライブラリ

### 7.1 静的計測

| 指標 | 現在値 |
|---|---:|
| startup script tags | 157 |
| 初期local JS合計 | 5,582,838 bytes (5.32 MiB) |
| `app.js` | 1,345,419 bytes |
| 静的 `addEventListener` 箇所 | 569 |
| dynamic import箇所 | 2 |
| Worker生成箇所 | 1（V2 storage、遅延生成） |
| SharedWorker | 0 |
| WASM | 0 |
| iframe DOM/事前読込 | 0 |
| `window.__*` 名 | 50 |
| Service Worker core precache | 1,836,219 bytes / 12 assets |

`parsedJsBytes`、実際にbindされたlistener数、heap/CPUは静的解析では確定できない。

### 7.2 初期ロード削減候補

重複分類を含むため合計値は単純加算しない。

| 群 | script数 | bytes | 判断 |
|---|---:|---:|---|
| tab/sheet compatibility | 9 | 142,643 | R4-R9で縮退・削除 |
| home/recent/account | 7 | 195,840 | UIはMy Page、active metadata serviceのみ残す |
| encode/decode/voxel/QR/timelapse候補 | 18 | 532,024 | R7で個別外部化 |
| shared/multi/account群 | 22 | 984,342 | `SHARED_PROJECTS_ENABLED=false`。R8最優先の初期load除外候補 |

`jsQR.min.js` だけで130,501 bytesあり、QR panelを描画画面で使わない方針なら明確な先行削減対象である。

### 7.3 Worker

`project-storage-v2-worker-bridge.js` はV2 archive encode/decode時にだけ `project-storage-v2.worker.js` を生成する。起動時worker常駐ではないためKEEP。外部media codec用workerは現時点では存在せず、重いmedia処理がmain thread moduleとして初期parseされる。

### 7.4 Service Worker

core precacheは主に `app.js`, CSS, HTML, iconsであり、157 module全件はinstall時precacheされない。ただしfetch後はruntime cacheされる。外部tool bundleを新設する場合、PiXiEEDrawのCORE_ASSETSへ追加しない。

## 8. グローバル依存

外部化を妨げる主な依存:

1. `window.PiXiEEDrawModules` に145モジュールを登録する共有registry。
2. 84モジュールの `with(scope)` が `state`, `dom`, helperを暗黙参照する。
3. `app.js` の巨大な `state`/`dom` singleton。
4. 50種類の `window.__*` feature flag/debug API。
5. canvas/frame/layerを関数引数ではなくactive globalから解決するexport/timelapse/voxel処理。
6. DOM IDを直接読むdialog/export/QR/account処理。
7. `import-utils.js` のmessage listenerが `event.origin` と `event.source` を検証しない。
8. `notifyLensImportReady()` が `postMessage(message, '*')` を使用する。
9. account/sharedがSupabaseをdynamic importし、clientを `window.__PIXIEED_ACCOUNT_*` に保持する。

外部toolは `state` やDOMを受け取らず、明示的なimmutable input payloadだけで動作させる。

## 9. 削除可能部分

R2-R5完了後:

- tab DOM renderer、add/close/rename/switch/long-press
- tab order、render signature、viewport switch token
- resident/deferred payloadの複数保持
- sheet add transaction/rollback
- missing-target-project防御
- recent card renderer、delete/open card handlers
- startup resume/project selector
- inactive tab history/timelapse owner IDs

R7-R8完了後:

- QR panel/jsQR
- voxel UI/GLB encoder
- media export dialogの重いcodec実装
- GIF decode/encodeの常時load
- timelapse GIF変換の常時load
- shared disabled modulesの初期load

## 10. sessionへ縮退する部分

- active tabの `projectId`
- source/adapter/canonical metadata
- save handle/meta/state
- dirty/openedAt/updatedAt
- autosave/recovery identity
- command lockのproject replacement範囲
- open後viewport reset
- recovery candidateのcommit先

`project` full payloadはsession objectへ複製せず、編集stateを唯一のruntime authorityとする。保存時だけserializerがsnapshotを作る。

## 11. PiXiEEDマイページへ移動する部分

- project一覧、thumbnail、empty state
- project作成入口（editor起動URL生成を含む）
- project削除、複製、名称変更
- account別recent filter/transfer
- 販売設定、ライセンス設定
- shared project管理
- recovery一覧UI（復旧実行はeditor API）

My Pageとeditorは同一originのIndexedDB repositoryを共有する。ただしMy Pageがeditor heapやDOMへ直接アクセスしてはいけない。

## 12. 外部ツールへ移動する部分

- raster/GIF decodeとimport変換
- PNG/JPEG/SVG/GIF/SpriteMap/grid/GLB encode
- image optimization/upscale
- voxel生成/preview
- QR encode/decode
- timelapse組立/encode
- PixFind等の便利変換
- 画像由来palette生成

## 13. 外部通信契約案

### 13.1 request / response

```js
{
  type: 'PIXIEED_TOOL_REQUEST',
  version: 1,
  requestId: crypto.randomUUID(),
  tool: 'gif-encoder',
  action: 'encode',
  projectId,
  payload: {
    handoffId,
    options
  }
}
```

```js
{
  type: 'PIXIEED_TOOL_RESPONSE',
  version: 1,
  requestId,
  ok: true,
  result: {
    handoffId,
    mimeType,
    byteLength,
    width,
    height
  },
  error: null
}
```

### 13.2 negotiation / cancellation

- `PIXIEED_TOOL_HELLO`: tool ID、protocol version、capabilities、最大payloadを返す
- `PIXIEED_TOOL_CANCEL`: request ID単位でAbortControllerを中断
- request state: `created -> accepted -> running -> completed|failed|cancelled|timed-out`
- control timeout: 30秒、encode/decode job: 120秒を初期値とする

### 13.3 transport選択

| データ | transport |
|---|---|
| 256KB以下のoptions/metadata | MessageChannel structured clone |
| 256KB〜8MiBのpixel/binary | ArrayBuffer transferable |
| 8MiB超、複数frame、project snapshot | IndexedDB handoff ID |
| 完成出力 | IndexedDB Blob、同一window内のみ短命Blob URL |
| ページ遷移 | project ID + handoff IDだけをquery/fragmentで渡す |

Blob URLをURL queryへ入れない。利用後は必ず `URL.revokeObjectURL()`。ArrayBuffer transfer後はsender側がdetachedになる前提で、editor authorityのbufferそのものを渡さずexport用copyを作る。

### 13.4 security / validation

- `event.origin === expectedOrigin` を必須化
- `event.source === iframe.contentWindow` または保持したwindow参照を検証
- `targetOrigin='*'` 禁止
- type/version/tool/action/requestIdをschema検証
- allowlist外tool/actionを拒否
- control payload 256KB、single transfer 64MiBをhard limit候補とする
- project IDだけで他account dataを読めないrepository access checkを設ける

### 13.5 iframe lifecycle

iframeはmodal open時に生成し、close時に次を実行する。

1. cancel送信
2. MessagePort close
3. event listener解除
4. pending promise reject
5. Blob URL revoke
6. `iframe.src = 'about:blank'`
7. iframe DOM remove

常設hidden iframeは禁止する。

### 13.6 failure recovery

- toolはeditor stateを直接変更しない
- resultを受け取った後、editor側がvalidationして一度だけcommit
- timeout/crash時はhandoff recordをTTL cleanupし、元documentは保持
- import結果の適用前にU3/recovery checkpointを作成可能にする

## 14. 削除・移行順

1. **R1 監査**: 本文書。現状基準値を固定。
2. **R2 single project session契約**: schema非変更。active tabから保存責務をsessionへ二重書きし一致をassert。
3. **R3 UI非表示**: 現在ほぼ完了。DOM不在を回帰テスト化。
4. **R4 tab state縮退**: runtime arrayを常に1要素に固定し、reader/writerをsession authorityへ変更。
5. **R5 My Page移行**: recent list/delete/duplicateをMy Pageへ移し、editorはproject ID起動だけ受理。
6. **R6 外部tool API**: MessageChannel + IndexedDB handoffの小さなbridgeを実装。
7. **R7 個別分離**: QR -> voxel -> GIF/media export -> import decode -> timelapseの順。1機能ずつ測定。
8. **R8 startup削減**: index script、disabled shared/account、listener、DOM、runtime cacheを削減。
9. **R9 互換層削除**: 移行済み判定とバックアップ期間後、tab/sheet transactionとmulti-sheet writerを削除。旧readerは別adapterに隔離。
10. **R10 本番移行**: DEVの実測、旧ファイルread、save/recovery試験後に段階移植。DEVの丸ごと上書きは禁止。

## 15. リスク

| リスク | 影響 | 防止策 |
|---|---|---|
| handleをtabと一緒に削除 | 自動保存先喪失 | R2 sessionへ先に移管し同一性assert |
| V2 sheetを即削除 | 旧project読込不能 | reader互換を維持しwriterだけ1要素固定 |
| active tab IDを即削除 | journal sheet key不一致 | stable document slot IDへ段階移行 |
| recent repositoryをUIと一緒に削除 | manifest参照喪失 | metadata storageとUIを分離 |
| iframe常設 | メモリ削減にならない | open時生成/close時破棄 |
| pixel array postMessage複製 | peak heap増大 | transferable/IndexedDB handoff |
| wildcard postMessage | 不正payload受理 | origin/source/schema validation |
| media codecを一括外部化 | import/export回帰 | 1codecずつgolden file round-trip |
| shared disabledコードの即削除 | hidden依存破損 | startup load除外を先行し、後でsource削除 |

## 16. 削減効果の計測地点

### 16.1 現在取得済み

```js
{
  initialJsBytes: 5582838,
  startupModuleCount: 157,
  staticListenerRegistrationSites: 569,
  startupWorkerConstructorSites: 1,
  startupIframeCount: 0,
  serviceWorkerPrecacheBytes: 1836219
}
```

Workerはlazyなので「生成箇所1」と「起動直後実体0」を別に計測する。

### 16.2 runtime計測

`window.__pixieedrawGetMemoryDiagnostics()` とDevTools/CDPで次の時点を採る。

1. `DOMContentLoaded` 後、project未open、GC後
2. 32x32 single-frame project open後
3. 大型GIF project open後
4. 10分idle後
5. 1,000 stroke後
6. export tool open/close後

記録項目:

```js
{
  parsedJsBytes,
  heapAfterStartup,
  heapAfterProjectOpen,
  heapAfterToolClose,
  listenerCount,
  workerCount,
  iframeCount,
  cpuDuringIdle,
  cpuDuringDrawing,
  longTaskCount,
  eventLoopLagP95
}
```

R7では外部tool close後にheapが開始前近傍へ戻ることを合格条件にする。

## 17. 推奨Phase R2

変更範囲は次に限定する。

1. 新規pure module `active-project-session-utils.js` を作る。
2. 上記session shapeのnormalize/read/update APIを作る。
3. `getActiveProjectPersistenceState()` と `getActiveProjectSaveBinding()` の読み元をsession優先、tab fallbackにする。
4. handle bind/clear/unavailableをsessionとtabへ一時二重書きする。
5. project open/new/recovery時にsessionを一度だけreplaceする。
6. DEV assertで `session.projectId === autosaveProjectId === active tab.projectId` を検証する。
7. schema、V1/V2 adapter、autosave writer、recovery recordは変更しない。

R2の完了条件:

- new/file/V1/V2/GIF/PNG openでidentity一致
- same-handle overwrite維持
- destination未設定時の確認維持
- journal/checkpoint/recovery維持
- reload後のproject ID維持
- tab fallbackを切っても単一projectで保存可能になる準備が整う

## 18. test結果

R1では監査文書以外の挙動変更を行っていない。静的計測は現行dirty worktreeを保護したまま実行した。

- `node --check PiXiEEDrawDEV/assets/js/app.js`: pass
- `node --check`（直近変更モジュール群）: pass
- `node scripts/check-pixiedraw-dev-tdz.mjs`: pass
- `git diff --check -- PiXiEEDrawDEV`: pass
- 初期script解決: 157/157 files found
- iframe静的検索: 0
- SharedWorker/WASM静的検索: 0
- runtime heap/CPU benchmark: 未実施（この実行環境ではブラウザ操作接続なし）

## 19. 完了報告用要約

1. 変更ファイル: 本監査文書のみ（既存dirty変更は保持）
2. タブ関連symbol数: 主要8モジュール101 function
3. タブ削除で影響する保存処理: handle binding、autosave ID、V2 sheet/journal、reload/recovery
4. tabとsheetの混同: tab IDがV2 sheet ID、sheet payloadが完全project
5. ホーム・一覧の移動対象: card/open/delete/duplicate/account filterをMy Pageへ
6. editorに残す: drawing/layer/frame/palette/history/viewport/project save/autosave/recovery
7. 外部化: QR、voxel、media encode/decode、timelapse変換、便利変換
8. 起動時不要bundle: 外部化候補18 scripts/532,024 bytes（重複分類あり）
9. 起動時不要worker: なし。V2 workerはlazyで保存coreのためKEEP
10. グローバル依存: module registry 145、with-scope 84、window flag 50、state/dom singleton
11. 推奨通信: MessageChannel制御 + ArrayBuffer transfer + IndexedDB handoff
12. 順序: R2 session -> R4 state縮退 -> R5 My Page -> R6 API -> R7個別分離 -> R8 load削減 -> R9互換削除
13. リスク: file handle/autosave/recoveryとtabの混在
14. test: 静的検証pass、runtime benchmark未実施
15. R2範囲: session契約と二重書きassertのみ。schema/adapterは変更しない
