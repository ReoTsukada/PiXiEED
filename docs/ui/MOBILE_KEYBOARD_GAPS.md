# Mobile Keyboard and Input Gaps

調査日: 2026-08-20
目的: Mobile本格UIに入る前に、software keyboard／IME、hardware keyboard、touch、stylus、safe-area、focusを洗い出す。

## 1. Evidence boundary

`FP-006` と `AUDIO-230` は keyboard inset、IME、safe-area、focus restoration、keyboard alternativesを契約に含める。
`WP-190` の responsive safety は CSS env inset と契約の存在、Chromium viewport geometryを確認したが、software keyboardを手動測定していない。
physical mobile、stylus、Safari／Firefox、screen reader、30-minute sessionは `UNTESTED`。

## 2. Gap inventory

| ID | Gap | Impact | Current evidence | Required evidence / decision | Status |
| --- | --- | --- | --- | --- | --- |
| K-001 | Software keyboardで`100dvh`／safe-area／Sheetのusable heightが変わる | Canvas縮小、Sheet内容の隠れ、buttonsの押下不能 | `wp190-responsive-safety.json`: IME contract present, not manually measured | iOS／Android実機でopen/close、portrait／landscape、split／floating keyboard | `OPEN` |
| K-002 | IME composition中にglobal shortcutが発火する可能性 | Project name、Layer name、Marker、BPM入力を壊す | contractはmodal／IME中shortcut抑止 | 各input typeでcompositionstart/update/endとshortcut test | `PARTIAL` |
| K-003 | Focus restoration先がunavailable／lazyになる | キーボード閉じ後にCanvasやCellへ戻れない | FP-006はinvalid focus targetを推測しない | Panel／Sheet／Dialogを全モードでfocus matrix化 | `OPEN` |
| K-004 | Project／Layer／Frame／Clip／Entity renameの入力導線 | icon-only／long press依存でdiscoverability低下 | Draw2 dialogs／fieldsの存在、Audio/Game state contract | tap／long press／keyboard alternative／cancel／confirmを各Entityで決定 | `OPEN` |
| K-005 | Drawの一指Drawと二指Pan／Pinchの切替 | open strokeの誤commit、gesture競合 | FP-006: second pointerで未commit strokeをcancel | physical touchでstroke rollback、pointercancel、lost captureを検証 | `PARTIAL` contract / `UNTESTED` device |
| K-006 | Timeline／Layer Sheetの内部scrollとCanvas gesture | page scroll、意図しないCanvas stroke | page scroll禁止、Panel owner scroll contract | nested touch／momentum／two-finger behaviorを実機確認 | `OPEN` |
| K-007 | Draw selection／transform numeric input | keyboardがCanvasを隠す、preview stateが失われる | selection contractはsheet／handle／keyboard alternative要求 | keyboard open時のpreview／commit／cancel／restore | `OPEN` |
| K-008 | Palette／Color RGB／Hex入力 | IME／paste／invalid valueでcolor stateが壊れる | Draw2 color editorとinput exists | invalid input、paste、locale、screen reader、focus | `OPEN` |
| K-009 | Audio BPM／Meter／Snap／Marker入力 | transport停止、playhead jump、IME overlap | Draw2 Audio global fields、AUDIO-230 metadata | playing中編集、IME、record arm、safe commit | `OPEN`; Audio route disabled |
| K-010 | Audio clip trim／fade／gain numeric alternative | drag-only操作が困難、precision不足 | AUDIO-230 requires keyboard alternatives | touch handle＋numeric input＋undoを実機確認 | `OPEN` |
| K-011 | Audio recording permission／native keyboard/transport coexistence | permission dialogとfocus／route stateの混乱 | Audio CoreはAudioContext／deviceなし | browser permission＋native permission＋deny/retry state | `OPEN`; candidate |
| K-012 | Game ActionMap binding | mobileにphysical keyboardがない、touch/gamepad ambiguity | GAME-310 semantic ActionId＋safe-area metadata | touch overlay editor、gamepad、hardware keyboardのsame action resolution | `OPEN`; Game route future |
| K-013 | Game Inspector property editing | numeric／boolean／enum入力でRuntimeとauthoringを混同 | Studio state modelとRuntime isolation | editor keyboard、preview stop、save state separation | `OPEN` |
| K-014 | Command Palette／Help search on mobile | keyboard shortcutなしで操作発見不能 | Draw2 command palette／shortcuts DOM | search field focus、IME、action filtering、disabled reasons | `PARTIAL` |
| K-015 | Hardware keyboard attached to tablet/mobile | shortcut priorityとtouch UIが異なる | FP-006 shortcut suppression contract | iPad keyboard／Android keyboard、input focus、key repeat | `OPEN` |
| K-016 | Screen Reader and accessible names | compact icon UIの意味が伝わらない | accessible name／tooltip／disabled reason contract | VoiceOver／TalkBack、cell／clip／entity role、live regions | `OPEN` |
| K-017 | Text scale 200% / dynamic type | labels／inputs／transportのoverlap | contract present, manual measure未実施 | 200% text scaleでno page overflow、panel internal only | `OPEN` |
| K-018 | Browser virtual keyboard differences | Safari／Firefox／Chromiumでinset/resizeが異なる | current safety is Chromium reference | browser matrix + real devices | `OPEN` |

## 3. Input ownership matrix

| Input | DRAW | AUDIO | GAME | Must win over |
| --- | --- | --- | --- | --- |
| one-finger pointer on primary surface | Draw stroke | select/drag clip or note | runtime control／selection | page scroll |
| second touch pointer | cancel stroke → Pan/Pinch | timeline zoom/pan | preview camera/control only if enabled | single pointer action |
| panel touch | bounded Panel scroll / action | clip/track panel | scene/entity panel | Canvas stroke |
| Timeline touch | Cell/Frame/Layer action | playhead/clip/marker | event/debug surface | primary surface edit |
| IME input | text fields only | BPM/marker/clip fields | property/action fields | global shortcuts |
| hardware key | semantic command/navigation | transport/editor command | ActionMap/editor command | text input / IME |

## 4. Priority before new mobile UI

P0は `K-001`, `K-002`, `K-003`, `K-005`, `K-006`, `K-016`。これらは見た目より先にinteraction safety／data preservationを決める。

P1は `K-004`, `K-007`〜`K-015`, `K-017`, `K-018`。各ModeのPanel／Action inventoryと結び、Draw／Audioの完成Flowを作る。

## 5. Current vs future separation

- Current PiXiEEDraw mobileは比較用のread-only reference。Draw2 Mobile fixtureはCurrent replacementではない。
- Audio／Gameのkeyboard gapは、現行routeがないためFuture/qualification gap。Draw2 DOMにfieldがあることだけでCurrent Audio/Game完成とはしない。
- `CSS env(safe-area-inset-*)` や `100dvh` の存在は、実機でのusable geometryを証明しない。
