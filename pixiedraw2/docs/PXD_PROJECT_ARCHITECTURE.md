# PiXiEEDraw2 PXD Project Architecture

更新日: 2026-08-18
状態: current owner decision / local-only

## Current decision

`PXD` is the only portable PiXiEED project file. Draw、Audio、Gameを別の
`PiXiPackage`へ分けない。古い設計文書にあるPiXiPackage分離案は、現在の
Project owner decisionで廃止する。

既存のDraw専用PXD v1は互換入力として残す。3モードを含む新しい保存形式は
同じ`.pxd`拡張子のPXD v2とし、PXDの中でモジュールを分離する。

## PXD v2 contents

```text
PXD Project Archive
├─ Project Manifest
├─ Draw module
│  ├─ Layer / Frame / Cel / Timeline metadata
│  └─ indexed raster binary entries
├─ Audio module
│  ├─ canonical Project / Checkpoint / Journal metadata
│  └─ verified source audio binary entries
├─ Game module
│  └─ canonical editor state
└─ Product candidate definitions
   ├─ Game full-project selection
   ├─ Draw image / frame-range selections
   ├─ Audio revision selections
   ├─ animation clip references
   └─ local rights / edition intent
```

Manifestは参照、サイズ、ハッシュ、revisionだけを持ち、巨大な画像・音声を
JSONへBase64で埋め込まない。Undo/Redoの作業用履歴、Web Audio node、Waveform
cache、Gameの一時Runtime sessionはProjectの正本ではないため、通常のブラウザ
自動保存と同じくモジュール側の保存領域で管理する。

Product candidate definitionもManifest内の軽量な参照だけを持つ。同じPXDから、
例えば次の候補を同時に保持できる。

- Game moduleを含むゲーム本体
- 1枚のDraw Asset Definitionを参照する限定3点の画像候補
- 3〜5フレームだけを参照し、`DERIVATIVE`を付けたアニメーション候補
- `WALK_UP/DOWN/LEFT/RIGHT`と`ATTACK_UP/DOWN/LEFT/RIGHT`を参照するキャラクター候補

ここでの数量・権利は作者が作るローカル出品意図であり、価格、所有者、決済、
公開状態を確定するものではない。販売時にはサーバー側で再検証する。
DrawのASSET editorから選択範囲を軽量なAsset Definitionとして追加し、名前・種類・
Pivot・アニメーション範囲をProjectローカルへ自動保存できる。4方向Idle/Walk/Attack
の定義も同じ参照形式で保持する。商品候補のカタログ化・販売工程は引き続き別工程とする。

## Persistence and performance

- 編集中の自動保存はDraw/Audio/Gameごとに独立したIndexedDB subdocumentへ行う。
- Draw Asset DefinitionはDraw subdocument内の参照メタデータとして保存し、選択範囲の
  ピクセルを別コピーしない。
- 自動保存のたびにPXD全体を再生成しない。PXD生成は明示的なExport時だけ行う。
- PXD v2はManifestを先に検証し、モジュールとバイナリentryを個別に検証する。
- 大きな販売ファイルを扱うMarketplace経路では、Manifest先読み、Blob/Stream、
  entry単位の遅延読み込みを使う。画面表示のために全Audio/Draw/Gameを同時に
  メモリへ展開しない。
- Audio source bytesが取得できない場合は、欠落したまま成功扱いにせず、PXD
  Export/Importをfail closedする。

## Marketplace handoff

将来の「PXDを投げるだけ」経路は、PXDを商品そのものとは別に、商品化の入力と
して扱う。

```text
PXD drop
  → PXD magic/schema/hash/path validation
  → Draw / Audio / Game module inspection
  → selected asset or complete project classification
  → server-owned owner / rights / license / price validation
  → immutable package revision + Product draft
  → preview / review / publish
```

同じPXDから、Draw素材、音楽Asset、Game全部入り、または編集可能なProjectを
別商品として作れる。商品にはPXDの`packageHash`と`manifestHash`を固定参照し、
MarketplaceのProductは価格・権利・公開状態をサーバー側で確定する。クライアント
から価格、ロイヤリティ、購入権、Product ownerを受け取って権威扱いしない。

したがって、PXD v2は将来のファイル投入販売に対応できる土台である。ただし、
実際の販売にはMarketplaceのProduct draft、License Snapshot、Object Storageの
immutable revision、preview生成、owner/permission検証を別途接続する必要がある。
PXDの統合と販売処理を一つの巨大なEditor stateへ混ぜない。
