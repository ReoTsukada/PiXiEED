# Creator Workspace Mobile Architecture

対象: `pixiedraw2` isolated Entry
採用案: `Adaptive Creator Surface`（Concept D）
初期実装: Draw／Audioの本画面。Gameは切替UIと制作途中の入口のみ先行。

## 1. Presentation boundary

```text
Draw2 Core
  Project / Command / State / Asset / Persistence / PXD / Timeline / Audio / Game
                         ↑ existing DOM command and state contracts
Mobile Presentation Layer
  zones / dock / panel lifecycle / context rail / focus restore / responsive geometry
```

Mobile層はCore stateを所有しない。既存の`data-workspace-command`、`data-workspace-tool`、`data-creator-mode`、Audio editor／right-panel tabを呼び出し、状態表示だけをProjectionする。

旧Mobileのdrawer／rail layoutは参照しない。既存の旧ファイルは削除せず、現行Runtimeから外し、新しいMobile layerを別Entry層として切り替える。

## 2. Zone contract

| Zone | Initial state | Draw | Audio | Game |
| --- | --- | --- | --- | --- |
| `top` | visible | Project status、Draw／Audio／Game、Undo／Redo | Project status、Draw／Audio／Game、Undo／Redo | Project status、Draw／Audio／Game、Undo／Redo |
| `workspace` | visible | Canvas | Audio Editor | 制作途中Status Surface |
| `quick` | Drawでvisible | Size、Brush、Opacity、Mirror | hidden（AudioのTransportを優先） | hidden |
| `context` | hidden | Selection actions | Clip／Note／Track actions | hidden |
| `dock` | visible | Tool、Color、Layers、Timeline、More | Editor、Timeline、Tracks、Assets、More | Scene、Assets、Preview、Build、More |
| `panel` | hidden | Tool／Color／Layers／Timeline／Assets／More | Editor／Timeline／Inspector／Assets／More | Scene／Assets／Inspector／Build |
| `game-surface` | Game選択時のみ | — | — | 制作途中Status、Scene、Assets、Preview、Build |

Dock buttons are square units. Text is secondary; icon, current value, selected state, and accessible name are required.

## 3. Panel lifecycle

```text
closed
  → compact popover (Tool / Color / More)
  → partial sheet (Layers / Timeline / Inspector)
  → expanded sheet (Assets / Audio Editor / long content)
  → closed with focus restored to opener
```

- 1 tapで開く、1 tapで切り替える、Escape／Closeで戻る。
- Toolは`Essentials`を初期表示し、低頻度のToolは`More tools`へ折りたたむ。初期Panelで全Toolを同時に見せて認知負荷を上げない。
- DrawのQuick Inspectorは既存Coreの`.draw2-workspace-context-row`を1回だけMobileへ移動し、Size、Brush shape／pattern、Opacity、Mirrorを常時表示する。ColorはDockの現在色SwatchからPickerへ遷移する。Desktop復帰時は元の親／兄弟位置へ戻す。
- Panelごとの内部scrollだけを許可する。Page-level scrollは許可しない。
- Heavy contentはopen時にだけ表示し、hidden stateで新しいnetwork／decode／subscriptionを開始しない。
- Core nodeを二重mountしない。移動する場合はoriginal parent／sibling／hidden stateを保存してDesktopへ復元する。
- Audio Timelineでは非該当のDraw Timeline nodeをhiddenのまま維持し、Draw／Audioの時間モデルを同一Sheetへ混在させない。

## 4. Context contract

Context actionはselection projectionから計算する。

| Context | Actions |
| --- | --- |
| Draw Selection | Copy、Cut、Paste、Duplicate、Delete、Transform、Flip、Move、Deselect |
| Audio Clip | Split、Duplicate、Delete、Move、Properties |
| Audio Note／Track | Duplicate、Delete、Move、Properties |

No selectionではContext Railをmountしない。破壊操作にはCore側のUndo／confirmation semanticsを残し、UI層が直接canonical stateを変更しない。

## 5. Timeline contract

- Draw: `Layer × Frame = Cel`。Current layer、frame、cel、empty／selected stateを表示する。
- Audio: `Track × Time = Clip`。Track、clip、playhead、timebaseを表示する。
- Game: `Object/Event × Time`のfuture adapter。現行Mobileでは切替UIと制作途中Surfaceだけをvisibleにし、完成済みEditorとして扱わない。
- Open／close、expand、select、add、delete、move、context actionsの操作grammarは共有する。
- Timeline open時もCanvas／Editorの主語を失わず、partial sheetからexpanded sheetへ移れる。

## 6. Responsive rules

```text
Mobile portrait  = top + workspace + Draw quick inspector + optional context + square dock
Mobile landscape = compact top + workspace + compact quick inspector + square dock; panel may use side sheet
Desktop          = existing Draw2 layout untouched
```

- `max-width:700px`または短いlandscapeだけを新Mobile layerの適用範囲とする。
- Safe-areaはtop／bottom paddingへ反映する。
- Main workspaceは`min-width:0; min-height:0; overflow:hidden`。長い内容はPanel ownerだけがscrollする。
- Touch targetは44px以上、主要square unitは48pxを基準にする。
- Focus ring、aria-label、aria-selected／aria-pressed、live statusを持つ。

## 7. Current / Future boundary

Current Mobile UIで完成判定するのは、既存のDraw2 DOM／Coreに接続済みのDraw／Audio操作である。Gameはユーザー指定によりMode切替と制作途中の既存ローカル入口を表示するが、完成済みの機能としては扱わない。Collaboration、Market、Social、Publish、ShareのUIは表示しない。

将来機能のために残すのは以下の意味契約だけである。

- shared Mode／Panel／Context／Timeline grammar
- Project／Asset／Revisionの識別子を表示できる場所
- Draw→Game asset flowの状態を後から挿入できるPanel slot
- Audio／Game previewとPackageのstateを混同しないfocus／lifecycle

## 8. QA gates

1. Static: TypeScript bundle、test、`git diff --check`。
2. Runtime: Draw2のMobile portrait、small mobile、large mobile、landscape、Desktop。
3. Interaction: Tool／Color／Canvas／Selection／Timeline／Undo／Redo、Audio Mode／Editor／Transport／Timeline／Context、Game Mode／Scene入口。
4. Visual: workspace dominance、alignment、1:1 grid、spacing、icon／type scale、contrast、safe-area、panel balance、Draw Quick Inspectorの可読性。
5. Regression: DesktopのCanvas placement、left/right dock、timeline、Audio desktop layoutが変化していない。

Browser QAで確認済みの2タップ経路はDrawのTool／Color／Layers／Timeline／Export、AudioのEditor／Wave／Timeline／Track／Assets、Gameの切替／Sceneである。実機touch、実際のStroke Commit、二本指Pan／Pinch、screen reader、Safari／Firefox、text scale 200%は別のqualificationとして未完了を明示する。
