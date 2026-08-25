---
contract_id: WP-110-PALETTE-RASTER-PEN-ERASER
status: IMPLEMENTED_ISOLATED_UNTESTED_DEVICE_PERFORMANCE
version: 1.0.0
updated: 2026-08-07
---

# WP-110 Palette Raster / Pen / Eraser / Bounded Fill

## Scope

WP-100の隔離`pixiedraw2/`だけに、Indexed Raster上のPen、Eraser、Palette選択・定義、
bounded/cancellable Fill、Dirty Region表示、local-first Journal/Checkpoint、Renderer fallbackを追加した。
現行Route、PiXiEEDraw、PXD、PiXiSYNC、Market、既存Project/Asset/Package、Production
Database/Storageには接続しない。

## Canonical contract

- Canonical palette packingは既存PiXiEEDの`RRGGBBAA`を使用し、transparent index `0`、編集可能な
  palette index `1..255`を維持する。
- Pen/Eraserは`raster.setPixel`または`raster.strokeCommit`へ変換する。Pointer sampleをNetworkへ送らない。
- Fillは4近傍Flood Fillを事前計画し、`maxPixels`境界と`cancelRequested`を検査してからCanonical Stateを変更する。
  `FILL_PIXEL_LIMIT_EXCEEDED`と`FILL_CANCELLED`ではcommitしない。将来Workerへ移せるよう、DOM/Canvas/
  Networkに依存しないCore APIとworker transfer境界を保つ。
- Palette変更はpalette配列とrevisionだけを更新し、indexed pixel配列を全書換えしない。
- Active presentationはDirty Regionの`readRegion()`だけを読み、全Raster read/hashはGolden専用とする。
- Optional Rendererが失敗した場合はCanonical Stateを変更せず、Reference Rendererへfallbackする。
- AutosaveはCommand→Journal→Dirty Tile→周期Checkpointのlocal-first順序で、同期・公開・販売処理は行わない。

## Failure fixtures

`pixiedraw2/tests/core.test.ts`で、malformed command、duplicate/sequence boundary、fill cancellation、
fill pixel limit、fill seed bounds、palette index/color、transparent eraser、palette pixel non-remap、
renderer failure fallback、COW source immutabilityを検証する。`scripts/test-pixiedraw2-wp110.mjs`は
CoreのDOM/Canvas/Network/storage実装非依存、pointer networkなし、feature flag OFF、checkpointの
UNTESTED/DECISION_PENDING境界を検証する。

## Evidence boundary

Node Core testは10/10、隔離Browser UIは390×844と1280×900でPen/Eraser/Palette/Fill、透明表示、
local Journal、noindex、Feature Flag OFF、overflowなしを確認した。正式なdevice/p95、30分memory、
full layer/frame compositor、Worker/WebGL2 equivalence、実機・Safari/Firefox、production integrationは
未測定であり、PASSへ昇格しない。
