# PiXiEED Contextual Actions

調査日: 2026-08-20
目的: 選択中のEntity・Panel・Surface・Modeによって変化する操作を台帳化する。
注意: 下表はCommand／UX inventoryであり、新しいDOM handler・Feature Flag・UI実装を追加したものではない。

## 1. Action rules

1. Actionはsemantic `commandId`で定義し、Toolbar／Menu／Shortcut／Command Palette／Helpが同じRegistryを参照する。
2. Availabilityはselection、Project lifecycle、permission、binding、modal／IME、device capabilityから決める。callerの表示claimをauthorityにしない。
3. Destructive、publish、billing、rollback、deleteはicon-onlyにしない。
4. Mobileではprimary actionをCanvas／Preview上に置き、詳細・低頻度操作はPanel／Bottom Sheet／Dialogへ移す。
5. `Current` と `Future` は同じ名前でも別の実装状態として記録する。

## 2. Global context actions

| commandId | Context | Action | Guard / disabled reason | Mobile presentation | Status |
| --- | --- | --- | --- | --- | --- |
| `project.open` | no project / project home | Open existing | file/provider unavailable、permission | full-screen project picker／dialog | Current Draw + Draw2 isolated |
| `project.create` | project home | New Project | invalid size/name、storage unavailable | guided sheet | Current Draw + Draw2 isolated |
| `project.switch` | project loaded | Switch project | dirty／pending journal requires save/confirm | project sheet | Current Draw; new Core partial |
| `project.save` | dirty | Save local / checkpoint | offline／validation／permission | primary action + status | Current Draw + isolated Core |
| `project.recover` | recovering/error | Restore checkpoint/journal | incompatible／stale/hashes | recovery dialog | Partial |
| `history.undo` | committed command | Undo one command | no history、read-only、pending lock | always reachable toolbar/command sheet | Current Draw + Draw2 |
| `history.redo` | undone command | Redo | no redo、new edit cleared redo | toolbar/command sheet | Current Draw + Draw2 |
| `preview.start` | valid Project | Start Preview | invalid/stale binding | primary toolbar／floating control | Draw2 local; Audio/Game partial |
| `preview.stop` | playing/preview | Stop and restore edit | no active preview | transport／runtime bar | Partial |
| `package.export` | valid package | Export PXD/PNG/package | validation／LIVE dependency／permission | Export sheet | Current Draw + isolated |
| `command.palette.open` | any non-IME | Search action | modal/sheet/IME active | full-screen action sheet | Draw2 DOM / Core contract |
| `help.open` | any | Help/Q&A/guide | no context only if generic | sheet/dialog | Planned common grammar |
| `workspace.focus` | any | Focus mode / close panel | unsaved modal/critical action | full Canvas/Preview | Draw2 isolated |
| `workspace.rollback` | workspace error | Kill switch / rollback | always confirm; no data deletion | destructive dialog | Draw2 safety contract |

## 3. Draw context actions

| commandId | Context | Action | Guard | Mobile presentation | Status / evidence |
| --- | --- | --- | --- | --- | --- |
| `draw.tool.pen` | Canvas | Draw stroke | valid pointer owner、editable | essential toolbar | Draw2 `tool-pen` |
| `draw.tool.eraser` | Canvas | Erase stroke | editable raster | tool group | Draw2 `tool-eraser` |
| `draw.tool.fill` | Canvas | Bounded fill | bounded region／palette valid | tool group + confirm for large fill | Draw2 Core |
| `draw.tool.eyedropper` | Canvas | Sample palette color | pixel under pointer | quick tool | Draw2 DOM |
| `draw.tool.shape` | Canvas | line/rect/circle/ellipse | shape options valid | tool sheet | Partial |
| `draw.selection.create` | Canvas | rect/ellipse/lasso/color/similar/opaque select | active raster | tool sheet | Draw2 Core |
| `draw.selection.transform.preview` | selection active | Preview transform | selection exists; no commit | bottom sheet handles | Partial |
| `draw.selection.transform.commit` | transform preview | Commit one command | preview valid | sticky sheet action | Partial |
| `draw.selection.transform.cancel` | transform preview | Cancel without mutation | preview active | visible cancel | Partial |
| `draw.canvas.pan` | Canvas | Pan viewport | second pointer／pan mode | two-finger gesture | FP-006 contract |
| `draw.canvas.pinch` | Canvas | Pinch zoom | two pointers, not one-finger draw | two-finger gesture | FP-006 contract |
| `draw.layer.add` | Layers | Add Layer | Project editable | sheet footer | Current/Draw2 |
| `draw.layer.reorder` | Layer selected | Reorder | layer not locked | drag + alternate buttons | Partial |
| `draw.layer.toggle-visibility` | Layer selected | Hide/show | valid layer | row action | Partial |
| `draw.frame.add` | Timeline | Add Frame | timeline writable | cell/row menu | Partial |
| `draw.frame.duplicate` | Frame selected | Duplicate Frame | frame exists | cell menu | Partial |
| `draw.frame.remove` | Frame selected | Remove Frame | not last protected frame; confirm | cell menu/dialog | Partial |
| `draw.cel.edit` | Cell | Edit cel | layer/frame valid | Canvas opens selected cell | Timeline model |
| `draw.onion.toggle` | Timeline | Toggle onion | adjacent frame exists | timeline sheet | Partial |
| `draw.playback.loop` | Timeline/Preview | Toggle loop | playback available | transport | Partial |
| `draw.asset.define` | selected layer/frame/region | Build Asset Definition draft | source selection valid | asset sheet | Partial |

## 4. Audio context actions

| commandId | Context | Action | Guard | Mobile presentation | Status |
| --- | --- | --- | --- | --- | --- |
| `audio.transport.play` | Audio workspace | Play | valid graph／decode state | primary transport | Isolated / Audio flag off |
| `audio.transport.stop` | playing | Stop | active transport | primary transport | DOM command exists |
| `audio.transport.record-arm` | track | Arm record | permission／track capability | transport + status | Candidate; hardware untested |
| `audio.transport.loop` | timeline | Loop | valid range | transport | Partial |
| `audio.transport.tempo` | Audio project | Set BPM | 20–300／IME safe | compact field sheet | DOM isolated |
| `audio.transport.meter` | Audio project | Set meter | allowed signature | field sheet | DOM isolated |
| `audio.transport.snap` | timeline | Set snap | allowed division | field sheet | DOM isolated |
| `audio.clip.trim` | clip selected | Trim start/end | clip bounds valid | clip sheet handles + numeric alternative | Partial contract |
| `audio.clip.split` | clip selected | Split at playhead | playhead inside clip | clip menu | Partial |
| `audio.clip.fade` | clip selected | Set fade | finite range | inspector sheet | Partial |
| `audio.track.mute` | track selected | Mute | track exists | row action | Partial |
| `audio.track.solo` | track selected | Solo | track exists | row action | Partial |
| `audio.marker.add` | playhead | Add marker | writable project | transport action | Candidate/partial |
| `audio.editor.piano` | Audio mode | Open Piano Roll | Audio feature enabled | mode sheet | Audio flag off / future entry |
| `audio.editor.wave` | Audio mode | Open waveform editor | clip/source valid | mode sheet | Audio flag off |
| `audio.editor.drum` | Audio mode | Open drum editor | supported project | mode sheet | Audio flag off |
| `audio.editor.sampler` | Audio mode | Open sampler | source/permission valid | mode sheet | Audio flag off |
| `audio.package.pin` | package | Pin all graph dependencies | every revision/license valid | package lock dialog | Partial |
| `audio.render` | package/export | Render audio | graph valid、no LIVE package dependency | progress sheet | Candidate / isolated |

## 5. Game context actions

| commandId | Context | Action | Guard | Mobile presentation | Status |
| --- | --- | --- | --- | --- | --- |
| `game.scene.select` | Scene tree | Select Scene | declared scene | compact sheet | Future Studio |
| `game.scene.add` | Scene tree | Add Scene | project editable | creation sheet | Future |
| `game.entity.select` | Scene | Select Entity | entity exists | bottom sheet list | Studio state only |
| `game.entity.add` | Scene | Add Entity | scene editable | creation sheet | Future |
| `game.component.add` | Entity | Add Component | component supported | component picker | Future |
| `game.inspector.open` | Entity/Component | Inspect/edit props | permission／valid selection | contextual sheet | Studio state only |
| `game.asset.bind` | Sprite/Audio component | Bind Asset Revision | registered／owner/project/hash valid | asset picker sheet | GAME-340 partial |
| `game.behavior.edit` | Behavior component | Edit No-code/Graph/Code | source valid; compile boundary | mode sheet／full-screen graph | Future |
| `game.input.edit` | Input | Edit ActionMap | duplicate/ambiguous bindings rejected | action editor sheet | GAME-310 partial |
| `game.preview.start` | valid GameProject | Start Runtime | snapshot／locks valid | full-screen preview | Isolated browser |
| `game.preview.pause` | playing | Pause | runtime active | runtime overlay | Isolated |
| `game.preview.step` | paused | Advance tick | deterministic input valid | debug menu | Isolated |
| `game.preview.save-state` | runtime | Save Runtime State | valid snapshot | runtime menu | Isolated |
| `game.preview.restore` | runtime | Restore Save State | lock/hash match | dialog | Isolated |
| `game.build.validate` | Game Project | Validate BuildPlan | dependencies／licenses pinned | build sheet | Isolated |
| `game.build.manifest` | Build | View manifest/provenance | build plan valid | diagnostics sheet | Isolated |
| `game.playtest.pin` | runtime | Pin selected assets | LIVE preview only; package guard | lock dialog | Partial |

## 6. Cross-mode contextual actions

| Context | Available role | Draw behavior | Audio behavior | Game behavior | Status |
| --- | --- | --- | --- | --- | --- |
| Project dirty | save/recover | save raster/journal | save audio graph | save scene/project | common semantic; adapters partial |
| Selected asset | inspect/define/pin | layer/frame/region/pivot | source/revision/event | sprite/audio component | bridge partial |
| Playing | stop/pause/loop | animation preview | transport | runtime session | separate preview owners |
| Stale revision | resolve/review/fork | source raster | audio source/graph | asset lock/build plan | fail-closed contract |
| Package candidate | validate/export | PXD/PNG/package | PINNED audio | build manifest/package | isolated; Market separate |
| Mobile IME open | commit/cancel/focus restore | project/layer/transform text | BPM/marker/name | entity/property/action text | keyboard gap open |

## 7. Command registry gaps

- `pixiedraw2/index.html`には多数の`data-workspace-command`があるが、Audit時点でそれらがCurrent production Command Registryと同一のversioned authorityに集約された証拠はない。
- Audio／Game command名はDOM・Core・Roadmapで先行しているが、Audio flag／Game routeがdefault-offまたはComing Laterである。
- Mobileではpointer／touch gesture、Panel／Timeline scroll、IME、keyboard shortcutのpriorityを全Actionで明示する必要がある。
