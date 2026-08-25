# PiXiEEDraw2 Mobile UX Concept Comparison

調査日: 2026-08-20
対象: `pixiedraw2` の Draw／Audio Mobile presentation layer
入力: `docs/product/*`、`docs/ui/MODE_FEATURE_MATRIX.md`、`UI_STATE_MODEL.md`、`PANEL_INVENTORY.md`、`TIMELINE_MODEL.md`、添付UI構成画像

この文書は機能棚卸しをやり直すものではない。既存のCurrent／Future境界とDesktopのVisual DNAを入力にして、Mobileの情報配置と操作モデルだけを比較する。

## 1. 共通の前提

- MobileはDesktopの縮小・縦積みではなく、Workspace-first／Context-firstの別構造とする。
- 添付画像は、暗色の高精度クリエイターUI、上部Mode切替、Canvas／Editor中心、現在値のQuick Inspector、Panel一覧、Timelineという構成の視覚基準として扱う。画像内の注釈文をそのまま既存機能の保証とは扱わない。
- DesktopのCanvas配置、Toolbar／Panel構成、密度、色、境界線、Typography、Icon languageは基準として保護する。
- Mobileの常時表示は `Mode`、`Current Tool`、`Current Color`、Undo／Redo、主Workspace、DrawのSize／Brush／Opacity／Mirror Quick Inspector、最小Dockに限定する。
- Context actionはSelection stateから生成する。CSSで常時表示・非表示を切り替えない。
- DrawのTimelineは `Layer × Frame = Cel`、Audioは `Track × Time = Clip`。同じPanel操作grammarを使うが、セルの意味は共有しない。
- Gameはユーザー指定によりMode切替だけ先行公開する。Game画面は「制作途中」と明示し、Scene／Assets／Preview／Buildの既存ローカル入口だけを表示する。Collaboration、Market、Social、Publish、Shareは現行Mobileへ追加しない。
- 1:1 square gridを基本単位にし、横長controlは1:2、1:3などの整数比で組む。主要touch targetは44px以上とする。
- Canvasの一指Drawと二指Pan／PinchはCoreのInput Ownershipを尊重し、Mobile UI層から別解釈しない。

## 2. 比較対象

### A — Canvas-first Minimal

Canvasをほぼ全画面にし、下部にCurrent Tool、Color、Timeline、Moreだけを置く。ToolとContext actionは1段のPopoverで開く。Timelineは必要時のみBottom Sheet。

強みは作業面、片手操作、認知負荷。弱みは初心者の発見性、Selection時の状態理解、Audioの複数面切替。

### B — Context-adaptive Workspace

Canvas／Audio Editorを主面にし、Selection、Current Tool、Current Track／Clipに応じて下部Action RailとContext Sheetの内容を変える。Timeline、Inspector、Assetsは同じPanel lifecycleで1タップ展開する。

強みは現在文脈に必要な操作だけが近く、Draw／Audioの差を自然に吸収できる点。弱みは状態変化を知らないと操作の出現理由が分かりにくい点。

### C — Creator Dock Workspace

下部Dockを常設し、Tool、Color、Layers／Tracks、Timeline、Assets、Moreを専門Dockとして並べる。DockからEditor／Inspectorへ遷移し、Timelineは拡張Dockとして固定可能にする。

強みは中級以上の密度、Timeline操作、反復作業。弱みは小画面でWorkspaceが狭くなり、AudioとDrawでDockの意味が変わりやすい点。

## 3. 評価

配点は指定された100点基準。各案の数字は相対比較用であり、実機での最終評価はBrowser QA後に行う。

| 評価軸 | 配点 | A | B | C | D |
| --- | ---: | ---: | ---: | ---: | ---: |
| Workspace優先度 | 15 | 15 | 13 | 10 | 15 |
| Primary action到達性 | 15 | 15 | 14 | 13 | 15 |
| Context操作 | 15 | 9 | 15 | 12 | 15 |
| 認知負荷 | 15 | 14 | 12 | 9 | 14 |
| Discoverability | 10 | 6 | 9 | 8 | 9 |
| 片手操作 | 10 | 10 | 8 | 6 | 9 |
| Timeline | 5 | 3 | 4 | 5 | 5 |
| Cross-mode consistency | 5 | 5 | 5 | 5 | 5 |
| Visual quality | 5 | 5 | 4 | 5 | 5 |
| Future extensibility | 5 | 3 | 5 | 5 | 5 |
| **合計** | **100** | **85** | **89** | **78** | **97** |

## 4. Final Concept D — Adaptive Creator Surface

Concept Dは、AのCanvas／Editor優先、BのContext適応、Cの反復作業用Dockを組み合わせる。ただしDockを常時増やすのではなく、内容をModeとSelectionに応じて置き換える。

### Persistent zones

```text
Safe-area Top
  Project identity / save status · Draw | Audio · Undo / Redo

Primary Workspace
  Draw: Canvas + current tool/value HUD
  Audio: Editor + transport context

Quick Inspector (Draw only)
  Size · Brush shape/pattern · Opacity · Mirror

Context Rail (selectionがある場合のみ)
  Draw: Copy / Cut / Duplicate / Delete / Transform / Deselect
  Audio: Split / Duplicate / Delete / Move / Properties

Square Dock
  Current Tool · Current Color · Layers/Tracks · Timeline · More

Panel lifecycle
  Compact Popover → Partial Sheet → Expanded Sheet
```

### Draw behavior

1. Canvasが初期Workspace。Current ToolはDockの一番左に常時表示し、タップでTool Panelを開く。
2. Tool Panelは`Essentials`を初期表示し、低頻度のShape／Color／Selection／Tile系は`More tools`へ折りたたむ。Toolを選ぶとPanelを閉じ、DockのCurrent Tool表示を即時更新する。
3. Current Colorは実色Swatchで表示し、Palette／Recent／Picker／IndexedをPanel内にまとめる。
4. Selectionがない間はContext Railを出さない。Selectionが成立した時だけ、CanvasとDockの間にAction Railを挿入する。
5. Timelineは初期表示でCanvasを奪わず、タップでPartial Sheetを開く。必要ならExpanded Sheetへ拡張し、DrawではCelの構造を明示する。

### Audio behavior

1. Drawと同じTop／Dock／Panel lifecycleを使うが、主WorkspaceはAudio Editorとする。
2. EditorはPiano／Wave／Drum／Samplerの現在タブを内部で切り替える。Audio timelineはDockのTimelineから開く。
3. TransportはModeの重要操作としてTopの短い帯に置き、BPM／Meter／Snapは長い1:2〜1:3 controlとしてまとめる。
4. Clip／Note／TrackのSelectionがある時だけ、Split／Duplicate／Delete／PropertiesをContext Railへ出す。
5. Mixer／Browser／InspectorはMoreではなく、文脈に応じたPanelへ遷移する。未接続Candidateは表示しない。
6. Audio Timelineを開いたときはAudioの`Track × Time = Clip`だけを表示し、DrawのLayer／Frame Timelineを同じSheetへ混在させない。

### Game boundary

GameはこのShellのMode Switch位置とPanel lifecycleを再利用する。現行Mobileには切替Tabと制作途中のStatus Surfaceを表示するが、Draw／Audioの完成済みSurfaceとは分離する。Draw→Game asset flowのDefine／Region／Animation／Pivot／Slice／Tile／Previewは、Asset stateが存在する文脈でだけ追加する。

## 5. 競合比較の判定軸

比較は「機能数が多いか」ではなく、モバイルで作業を始めてから主要機能へ到達するまでの迷いと遷移を判定する。公式掲載機能を基準にし、未確認のレビューや推測は採点へ入れない。

| 参考アプリ | 公式掲載の強み | PiXiEEDraw2が越えるべき操作課題 | PiXiEEDraw2の設計回答 |
| --- | --- | --- | --- |
| [dotpict App Store](https://apps.apple.com/us/app/dotpict/id995653343) / [Google Play](https://play.google.com/store/apps/details?id=net.dotpicko.dotpict) | 精密カーソル、トレース、ピクセル向けツール、自動保存、アニメーション、コミュニティ | すぐ描ける一方、専門機能の発見性と現在値の把握を同時に保つ | Tool／ColorをDock常設、EssentialsとMore toolsを分離、現在色とTool名をCanvas HUDへ投影 |
| [Pixel Studio](https://play.google.com/store/apps/details?id=com.PixelStudio) | モバイル／デスクトップの同期、オニオンスキンなどアニメーション向け機能 | 機能が増えたときに編集面が埋もれないこと | Layers／Timelineを常設Dock、TimelineはLayer × Frameの専用Sheetへ限定 |
| [GarageBand for iOS](https://www.apple.com/ios/garageband/) | Touch Instruments、Live Loops、Sound Library、録音、最大32トラック、Mix／Automation | 音楽制作の入口が多く、Instrument／Tracks／Libraryの往復が増える | Editor／Timeline／Track／Assetsを役割別に固定、Transportは常時上部、Audio TimelineはTrack × Time専用 |
| [FL Studio Mobile](https://www.image-line.com/fl-studio-mobile) | Piano Roll、Mixer、Instrument／Effect、Automation | 強力な編集面を小画面で同時に見せると密度が過剰になる | Editorを主面にし、Track／Assets／Moreを1タップPanelへ分離。現在の選択だけContext Railへ |
| [BandLab Studio](https://help.bandlab.com/hc/en-us/articles/115002945153-Getting-Started-with-the-BandLab-Studio) | 録音、Instrument、Audio／MIDI、Sounds、モバイルLooper | 初心者向け入口と制作中の専門操作が同じ画面で競合しやすい | ModeとEditorを固定し、2タップ目で目的Panelへ着地。機能を無差別に常時表示しない |

### 2タップ到達契約

| Mode | 1タップ目 | 2タップ目／着地点 | Browser QA |
| --- | --- | --- | --- |
| Draw | Tool | Essentials → 直線などのCore Tool | PASS |
| Draw | Color | HEX／Picker／Indexed Color Editor | PASS |
| Draw | Layers / Timeline | それぞれのPanel／Draw Cel Timeline | PASS |
| Draw | More | Export Panel、Project、Previewなど | PASS |
| Audio | Editor | Piano／Wave／Drum／Sampler | PASS |
| Audio | Timeline | Audio Track × Time Timelineのみ | PASS |
| Audio | Track / Assets | Inspector／Browser | PASS |
| Game | Game | Scene／Assets／Preview／Buildの制作途中Surface | PASS（完成判定外） |

### 現時点の判定

Browser上の設計・表示・到達性スコアは **97／100**。Dotpict、Pixel Studio、GarageBand、FL Studio Mobile、BandLabの全機能を実装済みという意味ではなく、Draw／Audioの主要操作について、常時表示・状態投影・2タップ到達・Panel分離を満たした評価である。実機の指描画、二本指Pan／Pinch、スタイラス、VoiceOver／TalkBack、Safari／Firefoxは別qualificationであり、そこをPASSするまで「全てにおいて優越」とは断定しない。

## 6. Acceptance boundary

- Desktopの`data-workspace-profile="desktop"`では新Mobile layerがレイアウトへ影響しない。
- Mobile portrait／small mobile／large mobile／landscapeでpage scroll、control overlap、safe-area欠落がない。
- DrawのTool／Color／Selection／Timeline／Undo／Redoが共通Commandへ到達する。
- AudioのMode、Editor tab、Transport、Timeline、Clip／Track contextが既存Coreのイベントへ到達する。
- Draw／AudioはCurrent UIだけを表示し、Future／Planned／Candidate／Disabledの機能を「使える機能」として追加しない。Gameは明示した制作途中境界の範囲だけ例外として表示する。
- Screenshot reviewでWorkspace dominance、1:1 grid、density、alignment、focus／selected state、long-session comfortを確認する。
