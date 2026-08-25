# Future UI Constraints

調査日: 2026-08-20
目的: 今後Draw／Audio／GameのモバイルUIを作る際に、現在実装・将来機能・既存データを混同しないための拘束条件を定める。

## 1. Product boundary constraints

| Constraint | Required rule | Evidence |
| --- | --- | --- |
| One Core | Desktop／Tablet／Mobile／Browser／NativeでCore semanticsを分けない | `00_START_HERE/LATEST_CANONICAL_DECISIONS.md`, `CORE-120` |
| One Project / PXD | Draw／Audio／Gameを別Projectに切断せず、一つのProject／PXDで参照を保つ | `PIXIEED_LEARNING_CONTEXT.md`, `02_ARCHITECTURE/INTEGRATED_PACKAGE_FORMAT.md` |
| Current fallback | Draw2はcurrent PiXiEEDrawをacceptanceまで置換しない | current reality inventory、release readiness |
| Current data preservation | 既存Project、PXD、PiXiSYNC、Market、Auth、URL、DB、Storage、rightsを変更しない | `IMPLEMENTATION_STATE.yaml`, current production boundaries |
| No implicit authority | UI state、feature flag、caller claim、role表示でpermission／ownership／entitlementを決めない | FP-001、FP-003AA、Market contracts |
| Package separation | PXD（編集原本）、PiXiPackage／Game package（配布・実行）、PNG／Audio outputを別Entityにする | canonical decisions、Audio/Game package contracts |

## 2. Workspace and viewport constraints

1. document/page-level horizontal／vertical scrollは禁止。
2. rootはsafe-area込みのusable `100dvh`に収める。
3. 長いLayer／Frame／Track／Clip／Scene／Entity／Logはowner Panel内だけscrollまたはvirtualizeする。
4. Hidden Panelはlazy。hidden状態でdecode、network、subscription、heavy projectionを走らせない。
5. Desktopは視覚密度と作業効率の参照。古いUIとして縮小・廃棄しない。
6. MobileはDesktopの縮小版にせず、Canvas／Preview-first、essential actions、contextual Sheet／Drawerで組む。
7. TabletはCanvas／Timelineを優先し、一つのpersistent contextual Panelに抑える。

根拠: `09_ROADMAP/AGENT_EXECUTION_FRAMEWORK.md`、`docs/contracts/wp180-workspace-contract.md`、
`docs/contracts/AUDIO-230-workspace-device-ux.md`。

## 3. Interaction and accessibility constraints

| Area | Constraint |
| --- | --- |
| Touch | Drawは一指、Canvas Pan／Pinchは二指。二指へ遷移する際は未commit strokeをcancelして重複Undoを作らない。 |
| Ownership | Draw、Pan、Pinch、PanelScroll、Timeline、RuntimeControlのpointer ownerを同時にしない。 |
| Focus | Dialog／Sheet／Panelを閉じた後は有効なoriginへ復帰。存在しない／disabled targetを推測しない。 |
| Keyboard / IME | input／textarea／select／IME中はglobal shortcutを抑止。hardware keyboardがない場合もCommand Palette／Help／visible alternativeを用意する。 |
| Icon | accessible name、tooltip、shortcut hint、disabled reasonを持つ。destructive／publish／billing／rollbackはicon-only禁止。 |
| Text scale | 200% text scaleでもlabel／controlを重ねない。page overflowではなくPanel internal scrollへ逃がす。 |
| Screen reader | role、selected／pressed／expanded、live status、Timeline cell／Audio clip／Game Entity nameを公開する。 |
| Error | stale／hash mismatch／permission／offline／unsupportedを黙ってfallbackせず、原因とrecover／cancelを表示する。 |

## 4. Mode constraints

### Draw

- Canvasが主面。Tool、Palette、Layer、Inspector、Advanced、Asset、Timeline、Exportはcontextualに切り替える。
- `Frame × Layer = Cel` をTimelineの主語として保持する。Timelineを単なる横スクロールのthumbnail stripにしない。
- Selection／Transformはpreview／commit／cancelを分け、Panel stateをProjectへ混ぜない。
- PXD／PNG／packageはvalidation／progress／cancel／recoveryを含める。
- Legacy PXDはread-only／warning／preserveを基本とし、新PXDへ暗黙変換しない。

### Audio

- AudioはTrack／Clip／Waveform／Timebaseを主語にする。DrawのLayer／Celモデルをそのまま再利用しない。
- Preview／Transportは主作業面で、BPM／Meter／Snap／Loop／Recordはcontextualだが発見可能にする。
- AudioContext／native hardware／record permissionのstateをUIだけで成功扱いにしない。
- `LIVE`はpreview／bridge、`PINNED`はpackage／build／Marketのlockとする。
- waveform bins／timeline itemsはbounded projection。大音源を全描画・全decodeしない。

### Game

- Scene／Entity／Component／Behavior／Input／Preview／Buildを分ける。
- Runtime world／Save Stateはauthoring GameProject／Journal／PiXiSYNCと分ける。
- Draw／Audio AssetはID／Revision／hash／license lockで参照し、raw bytesを複製しない。
- touch／gamepad／keyboardはsemantic ActionIdへ集約する。
- Game Studio routeは現時点でComing Later。新UIをCurrent Game機能として見せない。

## 5. Future feature constraints

| Future item | Constraint before UI |
| --- | --- |
| Audio recording | permission、device、latency、cancel／partial take、storage／privacyを先に定義。 |
| Audio mixer／FX／automation | Clip／Track／MixerGraph／render boundaryを定義し、hidden panelでdecodeしない。 |
| Game Graph／Code | No-code／Graph／bounded Scriptを同じBehaviorIRへ変換し、任意script実行をEditor UIに持ち込まない。 |
| Game profiler／debug | Runtime-only state、sampling／long-task budget、mobile overlay ownershipを定義。 |
| Market from workspace | Product／License／Entitlement／payment／RLS／private Storageのserver authorityを先に接続。 |
| Social from workspace | public URL／OGP／moderation／notification／privacyを現行Socialとのadapterとして定義。 |
| Collaboration | existing PiXiSYNC V1とlegacy shared-project disabled pathを分け、session／revision／leave／archiveを明示。 |
| Native / Store | Browser/PWA fallback、host boundary、signing、store、rollback、physical device evidenceを完了するまでUIをCurrent扱いしない。 |

## 6. Flags and entry constraints

- Unknown／OFF feature flagはfail-closed。UIに存在するDOMはfeature availabilityの証拠ではない。
- `pixiedraw2/index.html`の`data-feature-flag="off"`、Audio flag `off`、Core Shellのdefault-off／Coming Laterを、UI作成時にONへ変更しない。
- 新しい route／navigation／bottom tabを作る前に、current public URL inventory、preservation gate、PXD／PiXiSYNC／Market contractを確認する。
- Current routeとFuture surfaceを同じURL／同じdata storeへ黙って接続しない。

## 7. Completion gate for UI design phase

UI設計へ進むための最低条件:

1. Feature Inventoryの全Domainが埋まり、`Current`／`Disabled`／`Future`の混同がない。
2. DrawのLayer／Frame／Cel／Timeline、AudioのTrack／Clip／Timebase、GameのScene／Entity／Runtimeが確定している。
3. Mode Feature Matrix、UI State、Context Actions、Panel Inventory、Mobile Keyboard Gapsが相互参照で一致している。
4. Current route／data／flagsを変更せずに、Draw／Audioの完成対象とFuture Gameを分離できる。
5. physical device／keyboard／IME／stylus／screen readerの未検証項目を、見た目の完成度で隠していない。

この条件を満たすまで、本格モバイルUIのCSS／Component／Layout実装は開始しない。
