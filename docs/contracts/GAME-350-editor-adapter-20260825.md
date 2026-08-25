# GAME-350 Canonical Editor Adapter

## 目的

GAME-350 は、既存の GAME-300（Project / Scene / Entity / Component）、GAME-340（Draw / Audio の LIVE・PINNED 連携）、GAME-330（BuildPlan / asset lock）を再利用し、iGAME の編集UIが扱う最小の純粋な境界を提供する。

この文書と `pixiedraw2/src/game/game-350/editor-adapter.ts` は、UI・DOM・Storage・PiXYNC・Runtime Save State・Registryを実装しない。入力を値として受け取り、値を返すだけである。

## EditorSnapshot

`Game350EditorSnapshot` は以下だけを持つ。

- canonical な `GameProject`
- 5レールUIの現在位置を表す `activeRail`
- Scene / Entity / Component のローカル選択

5レールは、UI側で次の役割へ写像できる表示上の座標である。

1. `ACTION`: モード、Preview、保存、Buildなどの操作
2. `HIERARCHY`: Scene / Entity
3. `VIEWPORT`: SceneまたはRuntime Preview
4. `INSPECTOR`: 選択中ComponentとDraw / Audio参照
5. `TIMELINE`: Game Track / Event / Animation

これは現在のUIレイアウトを直接変更する契約ではない。Runtimeのtick、入力状態、Save State、Audio再生位置はSnapshotへ入れない。

## Canonical commands

`applyGame350EditorCommand` は入力Snapshotを変更せず、新しいRevisionを持つSnapshotを返す。

- `ADD_SCENE`
- `ADD_ENTITY`
- `ADD_COMPONENT`
- `BIND_ASSET`

すべてのProject変更コマンドは `baseRevisionId` と `nextRevisionId` を要求する。baseが現在のRevisionと違う場合、またはnextが同一の場合は拒否する。Project/owner/revision/hash、Scene/Entity/Componentの所属、重複ID、親Entity、Component種別、Draw/Audioのasset kindを検証し、失敗時はProjectを返さない。

選択だけは `selectGame350EditorTarget` で扱い、Project Revisionを進めない。

## Draw / Audio とBuild

`projectGame350BuildPlanRequest` は、Project内のSprite / Audio Sourceに含まれる既存 `AssetRevisionReference` をGAME-330の `AssetRevisionLock`へ投影する。

- `PINNED` はBuild候補へ投影する。
- `LIVE` はPreview専用としてBuild投影を拒否する。
- owner、asset id、revision id、SHA-256が不正なら拒否する。
- dependency lock、license、target、capabilityの最終判定は重複実装せずGAME-330の `createBuildPlan`へ委譲する。

`prepareGame350BuildPlan` はこの投影後にGAME-330の既存検証を呼び出すだけで、Draw/AudioのProjectを変更しない。

## Fail-closed 境界

次の入力は成功値を返さない。

- callerとProjectのproject / owner / revision不一致
- 現在Revisionと異なるcommand base
- 所属しないScene / Entity / Component
- 他ownerのAsset、形式不正のID、SHA-256不正
- SpriteへAudio、Audio SourceへDrawをBind
- LIVE AssetをBuildへ投影

## 完了範囲と未テスト

この追加で、GAME-350の純粋な編集境界、Draw/Audio参照、Build投影のfocused testを追加する。実UI、実ブラウザ、Registry、Storage、PiXYNC、Runtime、Unity/Godot/Unrealの実プロジェクト出力、Market販売はこの契約の範囲外であり、別統合ゲートで実測する。

