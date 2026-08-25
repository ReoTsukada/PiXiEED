# PiXiEED Product Feature Map

調査スナップショット: 2026-08-20
対象: PiXiEED 全体。特に Draw / Audio / Game の新しいモバイル UI を作る前の棚卸し。
この文書群は調査成果物であり、新しい製品仕様・Roadmap authority・UI実装指示ではない。

## 1. 判定方法

### 1.1 Status

| Status | この棚卸しでの意味 |
| --- | --- |
| `IMPLEMENTED` | 現行の製品入口・現行データ経路から呼び出される実装がある。デプロイ済み・本番動作済みとは別に扱う。 |
| `PARTIAL` | 実装の一部、隔離 Entry、Core／契約、または既存実装と新経路の片方だけがある。 |
| `DISABLED` | ファイル・契約・参照は残るが、現行 flag／Entry／route では実行されない。削除済みとは扱わない。 |
| `PLANNED` | Roadmap／Canonical文書にあり、現時点の実装・本番入口を確認できない。 |
| `CANDIDATE` | 将来候補、拡張、または作業パッケージ上の候補。採用・実装開始は未確定。 |
| `DEPRECATED` | 後継の境界・形式・経路が定義され、旧経路は互換・読み取り・保存のためだけに残る。 |

### 1.2 Evidence strength

`source/runtime` は現行ソースからの入口確認、`isolated` は Draw2/Core の隔離実装、
`contract` は仕様・型・schema、`browser` はローカルブラウザの限定的証拠、
`production` は本番意味論ではない。現行 inventory も、source-level integration と
production/provider/device qualification を分離している。

## 2. 製品全体の結論

PiXiEED は単独のDrawアプリではなく、`Project / Asset / Revision / Permission / Event`
を共有する Creator Platform である。ユーザーが保つ主語は一つの Project／PXD で、Draw・Animate・Asset・Game・Audio・Export は責務を分けた Mode として接続する。

ただし、現在確認できる入口は二層に分かれる。

1. **現行製品層**: `/pixiedraw/`、`/market/`、`/post/`、`/pixfind/`、`/account/` など。既存の URL、Project、Market、PiXiSYNC、Auth、Storage、DB を保護する対象。
2. **新Creator Workspace層**: `pixiedraw2/index.html` と `core-shell/`。`noindex`、local-only、default-off／Coming Later を持つ隔離・検証入口であり、現行製品の置換ではない。

Registry は `SITE-460` を `currentReadyPackage` としている一方、個別 Evidence は多くが `PARTIAL`、
`ISOLATED_REFERENCE`、`PENDING_UNTESTED` である。このため「パッケージの作業状態」と
「製品として利用可能か」を同じStatusにしない。

## 3. Domain map

| Domain | 製品上の役割 | 現在確認できる入口／実装 | Roadmap・契約 | Status | Current Entry / UI / State | 根拠 |
| --- | --- | --- | --- | --- | --- | --- |
| GLOBAL | Identity、Project、Asset、Revision、Command、Journal、Package、Event、Route、Recoveryを横断するCore | `core-shell/` の契約・local route、`pixiedraw/` の現行Project／保存／操作 | `CORE-100`〜`CORE-120`、`WP-091`〜`WP-098` | `PARTIAL` | 現行製品は既存経路、新Coreは隔離・default-off | `02_ARCHITECTURE/PIXIEED_CORE_SYSTEM.md`, `docs/inventory/current-implementation-reality-20260810.md` |
| DRAW | Pixel編集、Palette、Layer、Frame、Cel、Timeline、Selection、Transform、Preview、Export | 現行 `/pixiedraw/` は現行Editorとして稼働。`pixiedraw2/` はDraw2隔離Entry | `DRAW-110`〜`DRAW-170`、`WP-100`〜`WP-190` | `PARTIAL` | 現行Draw UI／Stateは保護対象。Draw2は `data-feature-flag="off"`、local-only | `pixiedraw/index.html`, `pixiedraw/assets/js/app.js`, `pixiedraw2/index.html`, `docs/inventory/wp190-final-gap-inventory.json` |
| AUDIO | Audio Project、Track、Clip、Waveform、Timebase、Marker、MIDI、Mixer、Package、Game binding | `pixiedraw2/src/audio/audio-200`〜`audio-240` のhost-neutral Core／workspace projection。現行本番Audio入口は未確認 | `AUDIO-200`〜`AUDIO-240`、拡張候補 `audio-250`〜`audio-330` | `PARTIAL` | Audio controlsはDraw2 DOMに存在するが Audio flag は `off`、CoreはDOM／AudioContextなし | `pixiedraw2/index.html`, `pixiedraw2/src/audio/`, `docs/inventory/audio-230-evidence.json` |
| GAME | GameProject、Scene、Entity、Component、Prefab、Behavior IR、Input、Runtime、Build、Preview | `pixiedraw2/src/game/game-300`〜`game-350` の隔離Core／local browser preview。Core Shell routeはComing Later | `GAME-300`〜`GAME-350` | `PARTIAL` | Game studio modelとRuntime stateは分離。現行本番Game routeは未接続 | `core-shell/assets/routes/game-route.js`, `pixiedraw2/src/game/`, `docs/inventory/game-350-browser-audit-20260815-rerun.json` |
| COLLABORATION | PiXiSYNC、Operation、Session、Checkpoint、shared project binding、participants | 現行 `/pixiedraw/` の PiXiSYNC V1 source path。旧shared-project flowは無効 | `WP-050`、`WP-180`、将来の統合資格化 | `PARTIAL` | `PIXISYNC_V1_ENABLED=true`、`SHARED_PROJECTS_ENABLED=false`。既存共有経路を削除しない | `docs/inventory/pixisync-current-baseline.md`, `docs/inventory/current-production-boundaries.md` |
| ASSET | Asset Registry、Asset Revision、Definition、Region、Animation、Pivot、Reference、Dependency、Bridge | Current DrawのProject asset。新しいAsset Definition／Registry／Tool Bridgeは隔離契約 | `WP-040`、`WP-092`、`DRAW-160`、`DRAW-170`、`GAME-340` | `PARTIAL` | 未登録 Definition を Game／Audio／Marketへ流さない。BlobとRegistry metadataを分離 | `02_ARCHITECTURE/ASSET_REGISTRY_CORE.md`, `docs/contracts/DRAW-170-ASSET-REGISTRY-BRIDGE.md` |
| MARKET | Product、Listing、Purchase、Entitlement、License、Royalty、Ledger、Checkout、Download | `/market/` の現行HTML／JS、Supabase function／RPC source | `MARKET-410`、`WP-210`、`FP-003` | `IMPLEMENTED` | 現行Market routeとデータを保持。新WP-210経路は隔離・provider未資格 | `market/index.html`, `market/market.js`, `docs/inventory/market-current-baseline.md`, `docs/inventory/current-implementation-reality-20260810.md` |
| SOCIAL | Home feed、Post、Comment、Like、Follow、Notification、OGP、Moderation、Analytics | Root home、`/post/`、`scripts/social-posts.js`、`pixfind/app.js` から現行参照 | `SOCIAL-430`、`WP-230`、`WP-240` | `PARTIAL` | 現行Social source／URLを保持。新SOCIAL compositionはisolated、DB/RLS適用状態は未確認 | `docs/inventory/legacy-sns-remnants-inventory.md`, `docs/inventory/social-430-evidence.json` |
| PLATFORM | Core Shell、Route、Search、Notification、Ops、Ads、Browser/PWA、Native boundary | 現行公開route群。`core-shell/` と `SITE-460` はlocal browser connection | `SITE-400`、`OPS-440`、`PLATFORM-450`、`SITE-460`、`NATIVE-500`〜`520` | `PARTIAL` | Browser/PWA first。Native／Storeは未着手・資格化前。Route cutoverは禁止 | `docs/inventory/current-public-routes.md`, `docs/inventory/site-460-browser-evidence.json`, `00_START_HERE/WORK_PACKAGE_REGISTRY.json` |

## 4. 入口の層別

| 層 | 入口／状態 | この棚卸しでの扱い |
| --- | --- | --- |
| Current production | `pixiedraw/`, `market/`, `post/`, `pixfind/`, `account/`, shared scripts、Supabase source | 現行データ・URL・権利を保護。source integrationは本番資格化と分離。 |
| Isolated creator workspace | `pixiedraw2/index.html`, `pixiedraw2/src/draw2-entry.ts` | Draw2のCore・Workspace・Browser reference。現行PiXiEEDrawを置換しない。 |
| Isolated Core / contract | `pixiedraw2/src/core`, `audio`, `game`, `platform`、`docs/contracts/` | 実装の存在と型／境界を記録。本番入口・provider・実機の証明には昇格しない。 |
| Disabled / compatibility | `SHARED_PROJECTS_ENABLED=false`、`MULTI_CANVAS_FEATURE_ENABLED=false`、Core Shell default-off、旧route／legacy adapter | 削除せず、依存・URL・保存・互換性を確認してから扱う。 |
| Future distribution | `NATIVE-500`〜`NATIVE-520`、Capacitor staging | Browser/PWAをfallbackに維持。signing／store／physical deviceは未検証。 |

## 5. Product completion gate

この棚卸し時点では **NOT READY**。理由は、Draw／Audio／Gameの隔離CoreとローカルBrowser evidenceはあるが、
次が未完だからである。

- 現行Project／PXD／PiXiSYNC／Market／Auth／DB／Storageとの意味論統合。
- Audioの実機出力・録音・長時間・Safari／Firefox・Screen Reader。
- Gameの現行Core Shell route、Registry provider、Storage artifact、実機／gamepad／runtime qualification。
- Draw2の実機touch／stylus、long-session memory、real legacy PXD、production cache／distribution。
- `WP-900`以降のG0〜G9資格化と、`CUT-001`の明示的Owner authorization。

次のUI設計は、このMapの `Current` と `Future` を混ぜないことを前提にする。
