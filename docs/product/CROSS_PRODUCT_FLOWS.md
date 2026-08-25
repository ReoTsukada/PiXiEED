# PiXiEED Cross-Product Flows

調査日: 2026-08-20
目的: Draw / Audio / Game / Asset / Market / Social / Collaboration のユーザーFlowを、現在実装と将来Flowに分ける。

## 1. Flow status rule

- **Current**: 現行route／sourceから呼ばれる経路。source-levelでの存在を記録し、本番provider／実データの確認とは分ける。
- **Isolated**: Draw2/Coreのlocal／synthetic／Browser reference。将来Flowの形を示すが現行製品の利用可能性を示さない。
- **Future**: Roadmap／contractにあるが、Current Entryまたは接続証拠がない。
- **Disabled**: 旧経路の参照・互換コードはあるが、現行flag／routeで実行されない。

## 2. Core creation flow

```text
Account / Project
   → Create or Open Project
   → Draw Canvas / Raster
   → Layer × Frame × Cel / Timeline
   → Asset Definition draft
   → Validate Asset Revision
   → Audio / Game modeへ参照
   → Preview / Package / Export
```

| Step | Current evidence | Future / missing |
| --- | --- | --- |
| Create/Open | `/pixiedraw/` current flow; Draw2 local Project dialog | Draw2をcurrent Project Registryへ接続 |
| Draw edit | Current PiXiEEDraw source; Draw2 isolated Core／Entry | same Project/PXD stateのproduction adapter |
| Timeline | current Draw animation state; Draw2 Timeline／Cell structure | real project import、large timeline／device qualification |
| Asset Definition | Draw2 draft／validation／bridge contracts | server-authorized Registry registration |
| Save/recover | current local autosave／journal; Draw2 local persistence | durable checkpoint／real legacy data／PiXiSYNC convergence |

## 3. Draw → Asset → Game flow

```text
Draw source layers / frames
        ↓ select source
Asset Definition (region / animation / pivot / lock)
        ↓ validate
REGISTERED Asset Revision
        ↓ Game reference
Scene → Entity → Sprite Component
        ↓ preview/build
Runtime Snapshot → Build Plan → Package Manifest
```

現状は `DRAW-160`／`DRAW-170`／`GAME-340` のtyped boundaryとisolated testがある。raw pixel bytesをGameへ複製しない規約は存在するが、Registry provider・blob materialization・current Game Studio routeは未接続。したがってこのFlowは **Isolated / PARTIAL**。

## 4. Audio → Game flow

```text
Audio Project
  → Track / Clip / Waveform / Marker
  → AudioRevision + content hash
  → Event graph (LIVE for preview / PINNED for package)
  → Game Audio Source component
  → Runtime snapshot asset lock
  → Game package / license snapshot
```

`AUDIO-210`はevent idをProject／Asset／Revision／hashに結び、`AUDIO-220`はpackage inputをPINNEDに固定する。`GAME-340`はDraw／Audioのcanonical revisionをGameへlockする。Audio hardware／AudioContext／production packageはこのrepository evidenceからは確認できないため、 **Isolated / PARTIAL**。

## 5. Draw → Play flow

```text
Draw Project revision
        → resolve Draw asset
        → Game preview session
        → LIVE/PINNED selection
        → Runtime READY / tick
        → stop/reset without mutating authoring Project
```

`DRAW-160`、`GAME-320`、`GAME-350`のlocal browser evidenceでRuntime READYは観測されている。しかしこれは `/pixiedraw/`のcurrent Draw、production Registry、Market、PiXiSYNCを経由しない。 **Isolated browser reference** と分類する。

## 6. PXD / package / export flow

```text
Project + Draw + Asset Definitions + Audio/Game references
    → validate identity / revision / hash / dependency / license
    → PXD (editing source)
    → PNG/GIF/Sprite Sheet or Audio output
    → PiXiPackage / Game Package (distribution/runtime)
    → optional Market Product
```

PXDは編集原本、PiXiPackageは配布・販売・実行用、PNG／WAV等は出力物であり、同じEntityではない。Market Productは価格・所有・Entitlement・publication authorityを持つが、PXD編集stateを直接持たない。

## 7. Package → Market flow

| Flow state | Current | Future / constraint |
| --- | --- | --- |
| Product/listing | `/market/` current route／JSが存在 | new Core package bridgeはMARKET-410 isolated |
| Checkout/payment | current Edge Function／Stripe source | live webhook／provider／RLS／refund replay未検証 |
| Download | current Market download path／private bucket contract | signed URL／Storage object／entitlementのlive proof未確認 |
| Rights/provenance | existing Market contracts + FP-003 boundaries | caller/UI表示では権限を付与しない |
| Sell from Draw/Audio/Game | current separate Market flow | Asset/Package/License snapshotをPINNEDで渡す新bridgeが必要 |

## 8. Project → Social / public flow

```text
Project / Package / Product
   → public URL or Post
   → OGP / Card / feed
   → Like / Comment / Follow
   → Notification / Moderation / Analytics
```

Root home、`post/`、`scripts/social-posts.js`、`pixfind/app.js`が現在参照される。Social migrations／RLS sourceは存在するが、適用済みproduction stateは未確認。新 `SOCIAL-430` はserver boundaryを定義するだけなので、 **Current source + Isolated new Core** と分ける。

## 9. Project ↔ Collaboration flow

```text
authenticate
  → confirmed local autosave / project snapshot
  → resolve shared binding
  → start / join PiXiSYNC session
  → send / order / confirm operations
  → checkpoint / raster reference recovery
  → leave / archive explicitly
```

PiXiSYNC V1のoperation／order／checkpoint sourceは現行 `/pixiedraw/`にある。一方、旧 shared-project flowは `SHARED_PROJECTS_ENABLED=false`。active focus recoveryは `active → active` を維持する設計で、無条件にsessionを再作成しない。旧機能は **Disabled**, V1 transportは **Current source / production unverified**。

## 10. Mobile critical flow

### Draw

1. Canvasを主面として開く。
2. 一指はDraw。二指が入ったら未commit strokeをcancelしてPan／Pinchへ移る。
3. Tool／Color／Layer／Timeline／Inspectorは必要時にSheet／Panelとして開く。
4. Undo／Redo、Preview、Save／Export、Cancelを常に発見できる状態にする。
5. IME・modal・sheet中はglobal shortcutを抑止し、focusを復元する。

### Audio

1. Preview／Transportを主面にする。
2. Track／Clip／Waveformはbounded timeline、詳細はcontextual sheet。
3. BPM／Meter／Snap、Record、Loop、Mute／Solo、Marker、Clip editをcontextで提示する。
4. ただし録音・hardware・AudioContextは現在未資格なので、UI候補と製品機能を混同しない。

### Game

1. Runtime Preview／Playtestを主面にする。
2. Scene／Entity／Inspector／Input／Buildはcontext panelへ分割する。
3. touch／gamepad／keyboardは同じsemantic ActionIdに変換する。
4. Game Studio routeは現在Coming Laterのため、上記はFuture UI constraintでありCurrent UIではない。

## 11. Cross-product failure paths

| Failure | Preserve | User-facing context |
| --- | --- | --- |
| stale Project/Revision | current Project, pending journal | Save／Conflict state、source of truthを表示 |
| Asset missing／hash mismatch | source project、definition draft | Asset panelで再解決／保留。Game/Audioへguessで流さない |
| LIVE hot swap during playback | current playback、safe boundary | pending／deferred stateを表示 |
| package has LIVE dependency | package/exportをfail-closed | exact itemとPINNED化の導線 |
| offline／provider unavailable | local draft／journalを保持 | OfflineはSavedと表示しない |
| permission／entitlement denied | dataを削除しない | disabled reasonと権利の出所 |
| second touch during stroke | open strokeをrollback/cancel | Canvas gesture stateを明示 |
| native/production unavailable | current browser fallback | Coming Later／UnavailableをCurrent完成と見せない |
