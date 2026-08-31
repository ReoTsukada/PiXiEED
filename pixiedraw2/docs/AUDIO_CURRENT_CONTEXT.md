# PiXiEEDraw2 Audio Current Context

更新日: 2026-08-23<br> 状態: source-verified / local-only / Project Workspace persistence + AUDIO-200/210/240
metadata persistence + Asset/Clip/Waveform/Event Graph/Playback connected / production未接続<br> 対象: `pixiedraw2/` の隔離Draw2
Entry

この文書は、Audioに関する現在の実装事実だけをまとめるCanonical
Contextである。将来仕様・Roadmap・契約の存在だけを、現在利用できる機能として扱わない。

## 1. Canonicalの優先順位

1. `src/`、`index.html`、`assets/` の現在のソース
2. この文書（現在のAudio実装の要約）
3. `docs/contracts/`、`09_ROADMAP/WORK_PACKAGES/`（設計・将来契約）

## 2. 現在動く経路

```text
index.html
  -> dist/draw2-entry.js
  -> src/draw2-entry.ts のWorkspace lazy load
  -> dist/wp180-workspace.js
  -> bootstrapDraw2Workspace()
  -> PCでAUDIOを選択
  -> Audio Timeline / MIDI Roll / DRAW preview / local preview
```

実際のAudio UIは次のファイルで構成される。

| ファイル                                   | 現在の責務                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `index.html`                               | Audio mode deck、MIDI Roll、DRAW preview、Timeline、Clip、Mixer、Automation、Marker、SettingsのDOM |
| `src/draw2-entry.ts`                       | `wp180-workspace.js`の動的ロードとEntry起動                                                       |
| `src/wp180-workspace-ui.ts`                | Audio状態、DOM描画、入力イベント、Draw同期、再生制御                                              |
| `src/workspace/project-manifest.ts`        | Draw/Audio/Game共通のProject ID、Manifest、module pointer、migration status                |
| `src/draw2-persistence.ts`                 | Draw canonical state、Journal、Undo/RedoのProject別IndexedDB保存・復元                     |
| `src/workspace/game-persistence.ts`        | Game editor deckのProject別IndexedDB保存・復元                                             |
| `src/wp180-workspace-contracts.ts`         | DRAW/GAME/AUDIOのPC mode profile                                                                  |
| `assets/draw2-shell.css`                   | Audio Workspace、MIDIセル、Timeline、Playheadの表示                                               |
| `src/audio/audio-240/chiptune.ts`          | Chipプリセット、MIDI周波数、スケジュール計算                                                      |
| `src/audio/audio-240/piano-roll.ts`        | A0〜C8、音符、Tick、長さ、フレーム、小節計算、1/64までのQuantize                        |
| `src/audio/audio-240/transport.ts`         | AudioContext時刻に対するlookahead Scheduler、pause/seek/loop                                      |
| `src/audio/audio-240/chiptune-synth.ts`    | browser-local Web Audio API発音                                                                   |
| `src/audio/audio-240/mixer-runtime.ts`     | canonical MixerをTrack Gain→StereoPanner→Masterへ投影するWeb Audio runtime graph                  |
| `src/audio/audio-200/workspace-session.ts` | Tick-based Piano RollとMixer操作をcanonical Project/Journalへ変換する遅延ロード可能なSession境界 |
| `src/audio/audio-200/assets.ts`          | Asset metadata catalog、revision chain、参照数。音声バイトは保持しない                         |
| `src/audio/audio-200/audio-asset-store.ts` | host-neutralなbyte store契約とコピー保護付きMemory実装                                   |
| `src/audio/audio-200/opfs-store.ts`     | Browser OPFSへの検証済みRevision bytes保存。OPFS非対応時はUIがMemory Previewへfail-soft |
| `src/audio/audio-200/waveform.ts`       | hash-boundなmulti-level peak cacheとviewport projection                                  |
| `src/audio/audio-200/persistence.ts`       | metadata-onlyのCheckpoint/Journalレコード、復元、破損末尾回復、世代保護                           |
| `src/audio/audio-200/indexeddb-store.ts`   | IndexedDBのbrowser-only Store境界（音声バイトは保存しない）                                       |
| `src/audio/audio-200/workspace-entry.ts`   | `audio-200-workspace.js`用のbrowser chunk entryとPersistence API                                  |
| `src/audio/audio-210/core.ts`              | Audio Event Graph、Preview状態、Playback Planのhost-neutral実行契約                         |
| `src/audio/audio-210/contracts.ts`         | Draw/Gameが参照するAudio Event Binding、Preview、Decode、Exportの型境界                   |

`wp180-workspace-ui.ts`はAudio-200のbrowser chunkを遅延ロードし、Audio-210のEvent GraphとPlayback Planを直接利用する。Audio-220のRegistry／License権威は接続しない。

## 3. 初期化順序

1. `bootstrapDraw2Workspace()`が`ChipTuneSynth`を生成する。
2. `?workspace`と`?audio`を読み、未知値はOFFにする。
3. DOM参照、mode profile、local workspace stateを準備する。
4. BGM/SFX/Voice、初期ノート、FPS/BPM/PPQをメモリ上へ作る。
5. 起動直後はAudioの重いセルを生成せず、summary/statusだけ更新する。
6. PCでAUDIO modeを選ぶとDraw用Timelineと描画Toolを隠し、Audio mode
   deckを表示する。
7. `audio-timeline`選択後、`requestAnimationFrame()`を2回待ってAudio
   surfacesを生成する。
8. ruler、animation cells、track lanes、instrument lanes、Piano
   Roll、Clip、Mixer、Automation、Markersを描画する。
9. Audio
   surfaceの描画開始時だけ`audio-200-workspace.js`を遅延ロードし、初期Piano
   Rollをcanonical Audio Projectへ投影する。
10. Projectのnote
    add/remove/resize、tempo変更、Mixerのgain/pan/mute/solo変更は、
    順序付きAudio-200
    Journalへ記録する。描画UIのMapが直接Project正本になることはない。
11. Audio mode初回表示時にIndexedDBのmetadata-only recordを読み、Checkpointと
    Journalを検証して復元する。保存は編集後の自動保存またはSaveボタンで行い、
    Project revisionの古い書込みは無視する。
    保存キーは親Workspaceの`projectId`から導出し、Draw・Audio・Gameは同じ
    `projectId`を共有しながらCanonical State、Journal、Undo/Redoを別の
    subdocument storeへ保存する。Manifestは参照・revision・hash・statusだけを
    保持し、モジュールの実データを埋め込まない。旧`audio:draw2:workspace`は
    既定Projectの初回表示時だけ新しいProject IDへ移行し、旧レコードは削除しない。
12. Audio file import時はFile bytesを一度だけcanonical metadata authorityへ渡し、
    `AudioRevision`、`AudioAssetCatalog`、Timeline `AudioClip`をJournalへ登録する。
    bytesはOPFSへ保存し、OPFSがないhostでは`MEMORY_PREVIEW`へ明示的に降格する。
    Project/Journal/IndexedDBにはraw bytesを入れない。
13. `ChipTuneSynth.prepare()`でWeb Audio graphを準備する。Synthとlocal clipは
    `MixerRuntimeAdapter`のTrack
    inputを経由し、Gain/Pan/Mute/Solo/Masterを適用する。
14. `pagehide`時にtimer、source、Mixer runtime node、Object URLを解放する。

Notes Preview開始時だけ、現在のPiano
Rollノートを`SampleAccurateScheduler`へ読み込み、AudioContextの絶対時刻へ予約する。UIフレーム更新用のtimerは表示同期だけを担当し、音符の発音時刻を決めない。

## 4. 現在の初期状態

```text
FPS       24
BPM       120
Meter     4/4
PPQ       480
Quantize  1/16（MIDI Rollの配置・ドラッグ時にSnap。Offは自由Tick）
Frame     256（下部Timelineの安全Window）
```

初期Track:

```text
BGM   MUSIC   [0, 1, 2, 3]
SFX   EFFECT  [4, 8]
Voice VOICE   []
```

Audio-200の初期Sessionでは、上記3つのclip laneに加えて
`instrument:PIANO`、`instrument:GUITAR`、`instrument:CHIP`、`instrument:BASS`、
`instrument:DRUMS`を同じMixer graphへ作成する。BGM/SFX/Voiceの短いUIキーも
`instrument:bgm`等へ正規化され、Mixerのcanonical channelを共有する。

初期Note:

```text
PIANO  MIDI 72  start 0  duration 4
GUITAR MIDI 64  start 4  duration 5
CHIP   MIDI 67  start 8  duration 2
```

Piano Rollの編集状態はUI用`Map`で即時反映し、同じ変更を遅延ロードしたAudio-200
Workspace SessionへJournal commandとして順序付ける。Project
metadata、Checkpoint、 Journal、Undo/Redo stackはIndexedDBへ保存する。Audio
bytesは保存せず、OPFS、Supabase、 Networkへ接続しない。

通常SessionのProject IDは親Workspaceの`projectId`から導出する。初期Track/Noteは
bootstrap baselineとしてJournalへ入れず、最初のユーザー編集からJournal sequenceを
開始する。旧`audio:draw2:workspace`は移行元としてのみ残る。rootには
`data-audio-project-state`、`data-audio-project-revision`、`data-audio-project-hash`、
`data-audio-journal-sequence`、`data-audio-persistence-state`、
`data-audio-persistence-revision`を診断用に反映する。

## 5. UIとデータの実態

- MIDI RollはA0〜C8の88鍵。
- MIDI RollはProject全体の連続したTick軸を横スクロールでき、初期表示だけ1小節を基準にする。
- MIDI Rollのノート位置・長さはPPQ Tickを正本とし、QuantizeはOff、1/4、1/8、1/16、1/32、1/64を選べる。ノート長プリセットは1/64（30 Tick）から2小節までで、Offではクリック位置を丸めずに保存する。
- 軽量音源カタログはPiano、Electric Piano、Organ、Guitar、Electric Guitar、Bass、Strings、Violin、Cello、Harp、Marimba、Kalimba、Vibraphone、Xylophone、Celesta、Tubular Bells、Steel Drum、Flute、Clarinet、Saxophone、Trumpet、Brass、Synth Lead、Synth Pad、Chip、Drums、Tambourine、Shakerを含む。追加時は必要なレーンだけを生成する。
- 上記の音源名は現段階では5種類のWeb Audio手続き音（pulse、triangle、saw、noise）へ遅延マッピングする軽量ボイスであり、巨大なサンプルバンクを初期読込しない。高品位サンプル／奏法切替は別の音源アセットを追加できる境界にしている。
- Audioは上部Transport、左Track Navigator、中央Timeline＋MIDI Roll／DRAW preview、右Inspector、必要時だけ開く下部Detail Deckの5ゾーンで構成する。左はBrowser／Mixer／FXの要約ではなく、BGM/SFX/Voiceと選択済みMIDIレーンのナビゲーションを担当する。その他のパネルは左の＋から必要時だけ追加する。
- Track追加は常設セレクトから即時追加するのではなく、`＋ Track`からAudio TrackまたはInstrument Trackのテンプレートを選ぶDAW型ポップオーバーを使う。DrumsもInstrument TrackとしてMIDI Rollへ追加し、音源の追加とレーンの生成を一つの操作にまとめる。追加後は新しいレーンを選択状態にする。
- 論理上はProjectのTick×88音域だが、DOMはViewport周辺のcanvasタイルだけを描画する。
- `draw2-audio-midi-canvas-layer`が全体のスクロール領域を保持し、空セルのbuttonを全件生成しない。
- 仮想化の固定値は行高20px、鍵盤列44px、行overscan 4、列overscan 3。
- 下部Timelineは最大256フレームを表示する。
- ノート検索はsparse `Map` lookupを使う。
- 空セルにはノート情報を付与せず、生成コストを抑える。
- ノート追加・選択・削除・複製・長さ・Velocity変更はUIの`audioMidiNotes`へ即時反映し、同じ操作をAudio-200
  Journalへ順序付けて反映する。
- MIDI Rollはクリック選択、ドラッグ入力、Delete／Backspace、右クリック削除、Ctrl／⌘+D複製を使う。Drumsも同じMIDIノート編集経路を使う。
- DrawのFrame/FPSは`MutationObserver`でAudioへ同期できる。
- Playheadは`setInterval()`でフレームを進める。

### 5.1 P0表示負荷対策

`src/wp180-workspace-ui.ts`の`renderAudioMidiGrid()`は、現在のスクロール位置からTickの表示範囲を計算し、MIDI
Rollの可視canvasタイルだけを生成する。スクロールは`requestAnimationFrame()`でまとめて再描画し、再描画前後の`scrollTop`/`scrollLeft`を維持する。ノートの追加・削除・選択・複製・Velocity変更・フレーム同期はMap/イベント経路を使用する。

Safari実測JSON（`/Users/tsukadareine/Downloads/index.html-recording.json`）では、変更前のPaint
8,559件中8,453件が1,724×1,780pxの巨大Paintだった。現在のMIDI Rollは空セルのbuttonを全件生成せず、Tick軸の可視範囲をcanvasタイルへ描画する。Safari収録の再取得はまだ行っていないため、Paint時間の改善値は未確定である。

## 6. 再生経路

### Audio Asset / Clip

```text
file input -> Uint8Array verifier boundary
           -> canonical AudioRevision + AssetCatalog
           -> OPFS (or explicit MEMORY_PREVIEW fallback)
           -> Journal: REVISION_ATTACH + CLIP_ADD
           -> URL.createObjectURL(file) / HTMLAudioElement
           -> MediaElementAudioSourceNode -> Mixer Track (BGM) -> Master
```

AssetとClipは分離される。同じRevisionを複数Clipが参照し、ClipのMove/Trim/
Duplicate/Deleteは非破壊の`CLIP_UPDATE`/`CLIP_REMOVE` Journal commandで処理する。
複数Trackのruntime MixはMixer Runtime Adapterが担当する。OPFSの再読込復元は
metadataとlocatorを復元し、ローカルClipのbrowser chunk readerとWaveform peak
cacheを必要時に再構築する。HTMLAudioのlocal previewはMixer Runtimeへ接続済みで、
Audio-210は再生前にEvent GraphとPlayback Planを検証する。host-neutralなDecode／
Export adapter自体はこのEntryの権威境界へ接続しない。

### MIDI Roll / Chip Synth

```text
Piano Roll notes -> SampleAccurateScheduler lookahead queue
                 -> AudioContext.currentTime absolute time
                 -> ChipTuneSynth.scheduleNoteAt()
                 -> Track Gain -> StereoPanner -> Mixer Master -> output
```

`ChipTuneSynth`は`AudioContext`、`GainNode`、`OscillatorNode`、`AudioBufferSourceNode`、`PeriodicWave`を使用する。
Audio-200 Mixerの`gainMilliDb` / `panMilli` / `muted` / `solo` /
`masterGainMilliDb`は
`MixerRuntimeAdapter`へ投影され、Gain変更とPan変更には約10msのAudioParam
smoothingを使う。
ローカルHTMLAudioElementも`MediaElementAudioSourceNode`から同じTrack
inputへ接続する。 AudioWorklet、Worker、WASM、DSP Effect graphはない。

`setInterval()`は現在もUIのFrame表示同期とローカルClipの追従に残っているが、Chip
Previewの音符タイミングには使用しない。Schedulerのlookaheadは120ms、pump間隔は25msで、遅延が発生した場合も未予約イベントを現在時刻へ追い付かせる。

## 7. 現在のMixer接続と未接続機能

- Mixerの各TrackはAudio-200のcanonical Mixer channelへ解決される。GainはdBから
  `gainMilliDb`、Panは-1〜+1から`panMilli`（-1000〜+1000）へ固定小数化し、
  Mute/Soloと一緒に1つの`MIXER_REPLACE` Journal commandへ記録する。
- Mixer UIはBGM/SFX/VoiceとMIDI Rollのinstrument Trackを同じcanonical graphへ
  投影する。Notes Previewとlocal clip previewも同じruntime graphを通る。
- Runtime Soloは「1つでもSoloがあればSolo Trackだけ」、Muteは常に優先する。
- Runtime
  nodeはTrackごとに一度だけ生成し、`dispose()`で切断する。ProjectのHash/Journalには
  Web Audio nodeを保存しない。
- AutomationのGain/Pan/Filterはlocal pointのみ。
- Metronomeはbar gridのPreview中にbrowser-local clickを発音する。
- QuantizeはMIDI Rollのnote追加・ドラッグ時に音楽グリッドへSnapする。
- Clip Libraryの`Use`は選択Trackを変更し、新規import・録音・Automationの対象へ反映する。
- Track追加はAudio-200のcanonical `TRACK_ADD` JournalとProject autosaveへ接続する。
- Track追加の表示基準は、一般的なDAWに合わせて「Track Type → Source / Instrument → Track created and selected」の順とする。将来のBus／Aux／VCA、外部MIDI、入力・出力ルーティングはこのテンプレート境界へ追加し、未接続の機能を先に表示しない。
- Sync Markerの追加・削除はAudio-200のJournalへ保存し、Project再読込時に復元する。
- Clip LibraryはOPFSからWaveform peak cacheを遅延構築し、Clip canvasへ投影する。
- Audio-210のEvent Graphはcanonical Clip/Revisionから再構築し、Preview前にPlayback Planを検証する。
- `audio-240/chiptune.ts`の`buildChipTuneSchedule()`は存在するが、live再生はMapをフレームごとに走査する。
- Audio-200はProject、Mixer、FPS/PPQ、Checkpoint、Journal、Undo/Redo
  stackをIndexedDBへ保存し、Audio
  mode再表示時に復元する。壊れたJournal末尾はCheckpointへfail-closed回復し、壊れた履歴は新しい空Journalへ切り替える。
- 親WorkspaceのProject切替では、先に旧ProjectのDraw・Audio・Game保存キューを
  flushしてから各subdocumentを切り替える。別Projectの状態を混ぜず、Drawの
  autosave/reload、Audioのautosave/reload、Game editor stateのautosave/reloadを
  独立して復元する。
- DrawのIndexedDB autosaveは250msの短いdebounceで連続編集をまとめ、保存処理の
  backlogを作らない。Audioの永続化レコードではJournal entryを一度だけ保存し、
  Undo/Redo stackはentry ID参照へ圧縮してからIndexedDBへ渡す。旧来のstack entry
  本体を持つレコードも復元時に読み替える。現在のJournal entry自体は
  `beforeState`/`afterState`を持つため、履歴長に応じた保存コストは残っており、
  Checkpoint/Journal compactionと永続Undo上限は未接続である。
- 保存レコードはmetadata-onlyで、Audio bytes、Blob、PCMは含まない。AssetCatalogは
  persistence recordへ保存され、Audio bytesはOPFSまたはMemory Preview storeへ分離する。
- `waveform.ts`はRevision hashに束縛されたpeak cacheを生成し、表示領域だけをClip
  canvasへ投影する。Worker decode、差分圧縮、バックグラウンドCheckpointは未接続。

### 7.1 Project Workspace persistence boundary

```text
Workspace Manifest (projectId / pointers / revisions / hashes / status)
├─ Draw subdocument + journal + Undo/Redo
├─ Audio subdocument + journal + Undo/Redo
└─ Game editor subdocument
```

ManifestへDraw画像、Audio bytes、Blob、Web Audio node、Game runtime sessionを
直接格納しない。Draw専用PXD v1は互換入力として残し、統合Projectは同じ`.pxd`
拡張子のPXD v2へ書き出す。PXD v2はDraw raster、Audio canonical stateと取得
できるsource bytes、Game editor stateを独立entryとして保持する。Audio source
bytesが取得できない場合は、欠落したままの部分保存を成功扱いにしない。

通常のProject復帰は引き続き各subdocumentのIndexedDB保存を使い、編集のたびに
PXD全体を再生成しない。PXDは明示的な持ち運び・バックアップ・将来のMarketplace
投入用の統合ファイルである。

## 8. 将来契約と現在UIの分離

| 層        | 内容                                                                       | 現在のUI接続                                                                                                |
| --------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| AUDIO-200 | Project、Revision、State、Metadata、Command、Journal、Checkpoint、Recovery | Workspace Sessionへ接続。Project metadata、AssetCatalog、JournalをIndexedDBへ保存・再起動復元 |
| AUDIO-200 Phase 2-A | Asset Authority、Memory/OPFS byte store、Audio Clip、Waveform peak cache | File import、Asset/Clip Journal、OPFS optional、hash-bound peak/viewport APIを接続 |
| AUDIO-210 | Event Graph、Preview、Playback、Decode、Export契約                         | Event Graph／Preview前Playback PlanをWorkspaceへ接続。host Decode／Export adapterは未接続 |
| AUDIO-220 | Package、License、Provenance、Dependency Lock                              | PXD v2のAudio entry/hash境界へ接続。License/販売は未接続                                                  |
| AUDIO-230 | Device、Geometry、Projection、Performance Counter                          | 契約・テストのみ                                                                                            |
| AUDIO-240 | Gate、Evidence、MIDI Roll、ChipTune、Synth                                | MIDI Roll/ChipTune/Synthのみ直接利用                                                                       |
| WP-190    | 別系統のAudio Project/Revision/Bridge契約                                  | `?audio=on`でBridgeだけlazy load                                                                            |

`?audio=on`はWP-190 bundleをロードするだけで、Audio-200
Projectや永続Storageへ接続しない。AUDIO
modeのローカルUI表示条件とは別のフラグである。

## 9. 端末別の現在状態

- PC: 専用AUDIO mode、Audio Timeline、MIDI Roll、DRAW previewを表示可能。
- Tablet/Mobile: 専用Audio mode
  deckはmountしない。既存の汎用Timeline投影とこのAudio editorを混同しない。
- 2026-08-21に試作した専用Mobile IAは廃止済みで、現在のRuntime Entryには読み込まない。

## 10. 検証対象

```text
deno task build:workspace
deno task build:audio-200-workspace
deno task build:audio
deno task check:audio-200
deno task test:audio-200
deno task test:workspace-ui
deno task test:audio-chiptune
deno task test:wp190
```

関連テストは`tests/audio-200`、`audio-210`、`audio-220`、`audio-230`、`audio-240`、`tests/wp190-*`に分かれている。契約テストのPASSは、現在のUIが永続Audio製品として完成したことを意味しない。

## 11. 現在の結論

現在のAudioは「Drawのフレームに同期するMIDI Roll／DRAW preview／sample-accurate Chip Synth
Preview／Audio Clip preview」に加え、Audio-200のcanonical Project State、Asset
Catalog、非破壊Clip操作、Journal、Checkpointをmetadata-onlyでIndexedDBへ保存・
復元する。File importは検証済みRevisionをOPFSへ保存し、OPFS非対応時は明示的な
Memory Previewへ降格する。Waveformはhash-bound peak/viewport APIとClip canvasへ
接続し、Audio-210のEvent Graph／Playback PlanもPreview境界へ接続した。Effectの
完全な編集・MIDI入出力・host Decode／Export adapter・Mobile Audio UI・Registry／License・
Production接続は未実装または未接続であり、将来契約と現在機能を分けて扱う。
