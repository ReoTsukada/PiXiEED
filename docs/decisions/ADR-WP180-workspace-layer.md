# ADR-WP180: Isolated Draw2 Workspace Layer

Status: Accepted for WP-180 implementation  
Date: 2026-08-08

## Decision

PiXiEEDraw2のWorkspace UIは、既存のDOM-free Editor Coreを変更せず、DOMを扱う別Adapter/遅延Bundle
として実装する。DesktopのPanel/Dock構造とMobileのCanvas-first Sheet構造はPresentation Layerに
閉じ込め、Project/PXD/PiXiSYNCのCanonical Stateを共有しない。

現行PiXiEEDrawのMobile UIは操作性の参照とInventory対象に限る。現行HTML/CSS/JS、Route、Market、
PiXiSYNC、Production Dataは変更しない。WP-170 Advanced Core、WP-160 RuntimeのLazy boundaryも維持する。

## Rationale

既存CoreのCOW、Command、Timeline、Pointer StrokeをUI FrameworkのGlobal Stateから隔離すると、Stroke
sampleごとの再描画とEditor Core再生成を防げる。Workspaceを別Adapterへ置くことで、Desktop/Tablet/
Mobileの表示を変えても同じCanonical Projectを利用できる。外部UI Libraryは追加せず、既存の隔離
HTML/CSSとsemantic tokensを権威にするため、Bundleと保守境界を増やさない。

## Consequences

- Workspace stateはLocal-onlyで、PiXiSYNC/PXDへ送らない。
- PanelのOpen/CloseはLazy Mountするが、Coreは再生成しない。
- Asepriteの操作性を比較基準にするが、見た目・コードのコピーはしない。
- 実機Mobile、Stylus、30分Memory、Full compositor、Production performanceは実測までUNTESTED。
- 将来Frameworkを採用する場合はBundle、更新粒度、A11y、既存構成との共存を別ADRで比較する。
