# PiXiEEDstudio Research Notes

更新日: 2026-08-27
目的: iDRAW / iAUDIO / iGAMEをひとつの制作体験へ統合するための技術・UI/UX調査

## 調査方針

GitHubの公開ソース、公式ドキュメント、公式リリース情報を優先する。SNSやコミュニティの
反応はアイデア発見の補助にとどめ、採用判断は一次資料・実測・PiXiEEDの安全要件で行う。
既存アプリのコードや見た目をコピーせず、構造・操作モデル・失敗時の設計だけを参照する。

## 共同編集 / データ同期

### Yjs

YjsはMap/ArrayなどのShared Typeを中心に、同時変更を順不同で適用できるCRDTとして設計され、
WebSocketやWebRTCなどのProviderを差し替えられる。Awarenessはドキュメントに永続化しない
Presence用の別プロトコルで、切断時に状態を削除する設計になっている。

参照:

- https://docs.yjs.dev/
- https://github.com/yjs/docs/blob/main/getting-started/adding-awareness.md
- https://github.com/yjs/yjs

PiXiEEDへの判断:

- PresenceをOperation/Checkpointから分離する方針の根拠として採用する
- 画像Raster、波形、PCMを巨大な共有ドキュメントへ入れず、既存の細粒度Operationと
  canonical Revision/ACKを正規経路として維持する
- 将来、コメント・選択範囲・Inspectorの一時共有を比較検証する候補にする

### Automerge

AutomergeはJSONに近いデータ構造を同時編集できるCRDTとして提供し、同期プロトコルと
Rust/WASM実装を持つ。設定、Graphのノード属性、Inspectorの小さなメタデータには候補になるが、
PiXiEEDの権利・Revision・サーバーACKの権威を自動Mergeだけへ委ねない。

参照:

- https://github.com/automerge/automerge

### Managed realtimeサービス

LiveblocksはPresence、History、Storage、同時編集をまとめたプロダクトとして設計されている。
UXの比較対象として有用だが、現在のPiXiEEDは認証されたSupabase/PiXYNC境界、独自ACK、
Asset権限、Checkpoint要件を持つため、この調査だけでは依存追加・置換を決めない。

参照:

- https://liveblocks.io/docs
- https://liveblocks.io/docs/collaboration-features/multiplayer

## ゲーム制作 / Runtime

### Godot

Godotは2D/3Dを統合したEditorとRuntimeを持ち、Scene/Node中心で編集と実行を近づけている。
Editor自体がEngine上で動くという考え方は、iGAMEのScene View、Playtest、Debugを同じ
Projectの中で扱う設計に向く。

参照:

- https://github.com/godotengine/godot
- https://github.com/godotengine/godot-docs/blob/master/getting_started/introduction/godot_design_philosophy.rst

PiXiEEDへの判断:

- `Scene → Entity → Component → Event/Graph` の表示順を採用候補にする
- PlaytestはEditorの保存状態を直接破壊せず、固定されたRuntime projectionを起動する
- Sprite/Audioの原素材はGameが所有せず、Asset ID / Revision / Hash / Licenseだけ参照する

### Phaser

PhaserはCanvas/WebGLを使うWeb向け2Dフレームワークで、Sceneのライフサイクルや軽量な
ブラウザ実行を重視している。PiXiEEDの既存GAME-350/351実行系と比較し、Scene切替、
カメラ、Render loop、入力の境界を検証する参照にする。

参照:

- https://github.com/phaserjs/phaser
- https://github.com/phaserjs/phaser/blob/master/skills/scenes/references/REFERENCE.md

PiXiEEDへの判断:

- 現時点でPhaserを組み込まず、既存Runtimeの固定step・Asset解決・Playtest契約を優先する
- 外部Frameworkを採用する場合も、canonical Game ProjectとPackage/License境界を先に固定する

## UI / UX / Design System

### Penpot

Penpotはオープンソースのデザイン・コード協業ツールで、Design Token、Component/Variant、
SVG/CSS/HTML/JSON、リアルタイム共同編集を同じ設計思想で扱う。PiXiEEDの共通UIを
「見た目の部品」だけでなく、Token・状態・Inspector・Code/Previewの契約として設計する
根拠になる。

参照:

- https://github.com/penpot/penpot

PiXiEEDへの判断:

- 段階3でColor、Spacing、Radius、Typography、Motion、Focus、ErrorのTokenを固定する
- iDRAW/iAUDIO/iGAMEをまたぐCommand名・Inspectorの状態表現を共通化する
- 初心者向けの簡易表示と、同じ対象を詳細表示するProfessional表示を同じデータから投影する

### Unity UI Toolkit / USS

Unityの公式資料は、UIの構造をUXML、スタイルをUSS、視覚的な構築をUI Builderへ分ける
考え方を示している。これはWeb実装をUnity風にするという意味ではなく、構造・スタイル・
状態を分離し、再利用可能なInspector/Panelを作る際の設計参考とする。

参照:

- https://docs.unity.cn/Manual/UIE-about-uss.html
- https://learn.unity.com/tutorial/getting-started-with-ui-toolkit?version=6.0

PiXiEEDへの判断:

- 既存CSSのDesign Tokenを段階3で正規化する
- Hover/Focus/Pressed/Disabled/Busy/Error/Offlineを部品の標準状態にする
- アニメーションは装飾ではなく、モード切替・保存・同期・復旧の状態理解を助ける範囲に限定する

## PiXiEEDstudioへの統合判断

調査から、次の順序を固定する。

1. `Project Session`を唯一の入口にし、開始モードはiDRAW/iAUDIO/iGAMEのどれでもよい
2. Product Aggregateは分離したまま、Asset ReferenceとRevisionでGameへ接続する
3. Durable Operation、ACK、権限、Checkpointを正規状態にし、Presenceは一時状態にする
4. 共通Command/Inspector/Tokenを先に作り、各ツールの機能追加が別UIへ分裂しないようにする
5. 大きなRaster/Waveform/PCMは遅延・Tile・Peak cacheで扱い、同期メッセージへ素材本体を入れない
6. Yjs/Automerge/Managed realtimeは、既存契約を満たすかを小さな実測fixtureで比較してから採用する

現在の実装では、段階1のGolden Project、段階2のLocal Project Session、Role、
metadata-only Checkpointまでを分離検証済みとする。Realtime provider、認証、端末、負荷、
本番Storageは未検証であり、Research結果だけで完了扱いにしない。
