# ADR-20260825: iGAMEをジャンル拡張型のリアルタイム制作基盤へ拡張する

## Decision

GAME-351のPixel RPGは、iGAMEの最初の実装テンプレートとして維持する。ただし、RPG専用エンジンを
最終製品の境界にはしない。最終的なiGAMEは、共通のProject / Scene / Entity / Component / Input /
Behavior / Save / Buildモデルに、ジャンル別Runtime Moduleを追加できる制作基盤とする。

対象には、2D Action、Shooter、Racing、Rhythm、3D Action、Open World、Online、Simulation、
Interactive 3Dなどを含める。文字通りすべての仕組みを最初からノーコードで提供するのではなく、
共通Core、ジャンルModule、Script/Plugin拡張口、Target Adapterを組み合わせて未対応ジャンルを追加できる
ことを製品能力とする。

## Architecture boundary

```text
Canonical Game Project / Journal
              ↓
Genre-neutral Runtime Core
  lifecycle / fixed-step or clock / input sequence / save boundary
              ↓
Runtime Modules
  RPG / Action / Shooter / Racing / Rhythm / 3D / Online / Custom
              ↓
Presentation and Target Adapters
  Canvas/Web / mobile / native handoff / site embed
```

- GAME-300はProject identity、revision、Scene、Entity、Component、Behavior、Journalの正本を保持する。
- GAME-350のRuntime Coreは、Play/Stop/Restart、入力順序、固定ステップ、Runtime SnapshotとJournalの分離を保持する。
- Genre Moduleは、移動、衝突、物理、車両、音楽同期、AI、ネットワークなどの専門的な意味論だけを持つ。
- Runtime tickはRegistry、Storage、DOM、Renderer、Networkを直接所有しない。
- iDRAW/iAUDIOはAsset ID、Revision ID、Hash、provenanceの参照で接続し、原本バイトを複製しない。
- iSITEは通常のHTML/CSS/JavaScriptサイトを担当し、iGAMEはゲーム・3D・インタラクティブ体験を埋め込む。

## Complexity boundary

次の機能は単なるテンプレート追加ではなく、専用ModuleまたはPlatform層として扱う。

- Open World：world streaming、LOD、navigation、巨大Asset管理、ロード境界
- Online：server authority、replication、matchmaking、persistence、anti-cheat、reconnect
- Rhythm：Audio clock、latency calibration、判定窓、譜面同期
- Racing：vehicle physics、入力補間、リプレイ、コース・ランキング
- 3D Action：animation、physics、camera、AI、shader/material、性能予算

未実装のModuleは `PLANNED` または `FOUNDATION` と明示し、RPG Previewを別ジャンルの完成証拠として扱わない。

## Consequence

短期の完成判定はRPG Golden Projectで行い、長期の完成判定は「新しいジャンルModuleを既存Projectへ追加し、
既存の保存・Preview・Build・同期境界を壊さず検証できること」で行う。Unity / Godot / Unrealはまず
明示的なHandoff Targetとして扱い、iGAME側が各Native Engineのコンパイル成功を過剰に主張しない。

この決定は、RPGを初期リリースへ限定した
`ADR-20260825-IGAME-PIXEL-RPG-FIRST.md` の短期スコープを維持しつつ、最終製品の方向だけを拡張する。
