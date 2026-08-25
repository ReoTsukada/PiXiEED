# PiXiEEDraw2 Creator Workspace Reference Contract

この文書は、PiXiEEDraw2をPiXiEEDのDraw／Game／Audioへ展開するための、PC Creator Workspaceの設計基準です。参照元の見た目を複製せず、操作性・情報密度・状態分離・拡張性だけを採用します。

Visual Token、Icon、Control State、Tool Flyoutの権威は
`docs/contracts/PIXIEED-PIXEL-UI-DESIGN-SYSTEM.md`とする。

## 1. 参照元ごとの採用範囲

| 参照元 | 採用する原則 | PiXiEEDでの適用 |
| --- | --- | --- |
| Clip Studio／Adobe | Dock、Panel、Inspector、ショートカット、コンテキスト操作 | Editor共通Panel基盤、Tool Options、Workspace Preset |
| Unity／Unreal Engine | 高密度Workspace、Viewport中心、Hierarchy／Inspector／Asset Browser | Draw／GameのViewport、Object／Layer、Property、Asset境界 |
| Aseprite | Pixel制作の速度、Palette、Layer×Frame×Cel、Onion Skin、短い操作経路 | Draw2のRaster／Timeline／Palette／Shortcut最低基準 |
| Figma／Canva | 選択・変形・整列、検索可能な操作、初見の分かりやすさ | Selection／Transform、Command Palette、Empty／Loading／Error状態 |
| LMMS／ACE Studio | Track／Lane／Timeline、素材と演出の統合、用途ごとの専用編集面 | Audio Track、Game Event、MV／Preview、Package構成 |

ACE Studioについては、公式サイトがボーカルシンセ、AI楽器、ボイス関連、ステム分離、ビデオコンポーザーを一つのAI音楽ワークステーションへ集約する構成を示している。この「機能を一つの制作環境へ集約しつつ、編集面は用途ごとに分ける」考え方をPiXiEED Coreへ適用する。

## 2. Draw2の基準Workspace

### 常設する領域

- 上部1段目：File／Edit／View／Tools／Helpなどのアプリケーション操作
- 上部2段目：Undo／Redo／Export／Previewなどの頻出操作
- 左：Palette Grid、Color Editor
- 中央：Canvas／Viewportのみ
- 右：基本Pixel Tool Rail
- 下：Timeline／Frame／Cel

### 上部メニューから開く領域

- Layers
- Inspector／Transform
- Advanced Tools
- Preview／Play
- Assets
- Game Metadata、Package Preparation、Audio／Event編集面

常設レールは、切替頻度が高くCanvas作業を止めると損失が大きい操作に限定する。その他は上部メニュー、Command Palette、Context Panelから開く。常設表示のために同じ意味のボタンを複製しない。

## 3. PiXiEED独自の不変条件

- Canvasは制作面であり、説明文・広告・大型Cardを置かない。
- Theme変更はCanonical Pixel／Preview／Thumbnailの色を変更しない。
- File／Edit／View／Tools／Helpは切替式メニューとし、同時に複数のPopoverを開かない。外側クリックまたはEscapeで閉じる。
- Desktopの頻出アイコン・ツール・Panel入口は40pxの共通リズム、Mobileは40pxのTouch Targetを使い、レール余白はCanvasを圧迫しない最小値にする。
- Canvas／Raster／Command／Undo／PXDはDeviceごとに分岐しない。Desktop／Tablet／Mobileで変えるのはPresentationだけ。
- Workspace State（Panel配置、Local Zoom、Tool、Sheet状態）はProject Canonical Stateと分離する。
- Pointer Stroke中にTimeline、Layer、Palette、Inspector全体を再描画しない。
- 非表示Panelは重いList計算、Thumbnail生成、Polling、Decodeを継続しない。
- 未実装機能は操作できるように見せず、UnavailableまたはComing Laterを表示する。
- Draw2のUIアイコンは`pixiedraw2/assets/icons/draw2-icons.svg`を唯一のSource of Truthとする。現行PiXiEEDrawのアイコンは参照しない。
- アイコンは16／20基準の整数Pixel Grid、Hard edge、統一した線幅・密度、`currentColor`によるTheme／Active状態で統一する。意味はaccessible nameとShortcutで補い、アイコン内へ説明文字を入れない。
- 親Toolは普通の1:1 Tool Buttonとして並べ、展開Markerを表示しない。選択した子Tool Iconを親へ反映し、子Toolは最大3列程度の小型Flyoutへ表示する。
- 現行PiXiEEDraw、PXD、PiXiSYNC、Market、既存Routeへ非侵入であること。

## 4. 3つのPresentation Profile

| Profile | 常設面 | 開閉面 | 目標 |
| --- | --- | --- | --- |
| Desktop Professional | Palette／Color、Tool Rail、Timeline | Layers、Inspector、Advanced、Assets、Preview | Aseprite級のPixel効率＋Creator Workspace密度 |
| Tablet Adaptive | Canvas、Palette／Color、主要Tool | Sheet／Drawer、Timeline、Inspector | StylusとCanvas面積の両立 |
| Mobile Canvas-first | Canvas、Tool 1列、2行Quick Palette、Color入口 | Bottom Sheet、Timeline、Layers、Advanced | 現行PiXiEEDrawの縦型Canvas中心を維持 |

### Mobile PiXiEEDraw reference contract

Draw2 mobile intentionally reuses the current PiXiEEDraw interaction rhythm instead of shrinking the desktop dock:

1. Canvas occupies the dominant center area.
2. The lower rail keeps the current Draw tool icons in one compact row.
3. The quick palette is a two-row color grid; new colors fill toward the right and remain reachable without opening the Color editor.
4. The Color button opens the full Color editor sheet; it does not duplicate or hide the quick palette.
5. The Timeline button opens a clearly bounded Timeline sheet using the existing Layer/Frame/Cel projection. The top row owns the frame numbers, the first column owns layer names, and every cel below is a square 1:1 grid cell aligned to that frame. Tapping a cel selects both its Layer Track and Frame. It closes when another sheet is selected.
6. Mobile rail controls use one touch-size rhythm, `2px` timeline/cell corners, safe-area padding, and no page-level horizontal or vertical scrolling.

### Color editor contract

The Color panel uses the current PiXiEEDraw palette wheel model rather than a new Draw2-specific color-map model. The isolated implementation keeps the same single raster surface, ring geometry, cursor behavior, and HSV conversion rules:

- the central square is the saturation/value map;
- its upper-left corner is white (zero saturation, full value);
- moving right increases saturation;
- moving down reduces value toward black;
- the hue control is a circular wheel surrounding the square;
- RGB sliders and the HEX field remain the deterministic numeric editing path.

The hue wheel and square update the local draft only. 編集中はAlphaを含むPalette Button、Stroke Preview、既存の同Index Pixelをlocal draftで同時Previewし、Pointer／Keyboard操作の終了時に1回だけCanonical Palette CommandとUndo履歴へCommitする。途中sampleごとには履歴を追加しない。Index 0 remains the transparent color. Theme changes affect the panel surface only and never alter canonical pixel colors.

### Timeline panel contract

Timeline is presented as a bounded workspace panel, not as an unexplained text block. It follows the current PiXiEEDraw matrix semantics: a compact frame-number header row, a sticky layer-name column, and virtualized square 1:1 Layer × Frame cel cells with 2px corners. The visible heading and diagnostic string are omitted because the icon, frame row, layer column, and cell grid provide the context; semantic names remain available to assistive technology. Cel bodies do not repeat frame text; an occupied cel uses only a small visual marker and accessible state. The matrix corner adds a layer and the trailing frame-header cell adds a frame, while the permanent action rail keeps only functional display controls such as Onion Skin. Duplicate, remove, reorder, and visibility operations remain on the existing command boundary without filling the panel with duplicate buttons. The viewport owns its scrolling; the page itself must not scroll to reach Timeline controls. Mobile uses the same projection and commands inside a taller fixed bottom sheet above the always-visible tool and palette rails, without mounting the full desktop workspace.

The isolated Draw2 entry uses the Draw2-owned sprite at `pixiedraw2/assets/icons/draw2-icons.svg`. It does not import or mutate production PiXiEEDraw icon files or assets.

## 5. Draw2から他ツールへの展開

```text
Draw2 Workspace
├─ Draw: Raster／Layer／Frame／Cel／Palette／PXD
├─ Game: Scene／Object／Event／Preview／Runtime
├─ Audio: Track／Note／Waveform／Mixer／Preview
└─ Shared Core: Project／Asset／Revision／Command／Event／Package
```

各Toolは独立した編集体験を持つが、Project／Asset／Revision／Command／Event／Packageの契約は共有する。UIを共有しすぎて各Toolの操作性を落とさない。

## 6. 各UI改修の受入条件

1. どの参照元の原則を採用したかを記録する。
2. 既存の操作手順より増えていないか確認する。
3. 1280×900、390×844、Tablet幅でCanvasと主要操作が利用可能である。
4. ページ全体の意図しないScroll、重複ボタン、意味不明な閉じる操作がない。
5. Keyboard、Touch、Focus、Screen Reader名、Reduced Motionを確認する。
6. Canvas色、PXD、Undo、PiXiSYNC候補、Runtime、Marketへの非侵入を確認する。
7. 実測していないものはPASSにせず、UNTESTEDとして残す。

## 7. 現在の段階

現在はDraw2のWorkspaceを最終UIとして固定する段階ではなく、この契約を基準にProfessional Pixel Creation Applicationとしての操作性を収束させる段階である。Draw2のWorkspace、実操作、性能、Device UXが一定基準を満たすまで、Audio／Gameの高度なUIを常設面へ混ぜない。
