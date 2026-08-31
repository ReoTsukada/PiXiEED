# PiXiEEDraw2 PC Mode Framework

## 目的

PC版のCreator Workspaceは、機能を一つの巨大なDraw画面へ混在させず、次の3モードだけを最上位ナビゲーションとして扱う。

| モード | 主画面 | 表示するパネル | 非表示にするもの |
| --- | --- | --- | --- |
| `DRAW` | Pixel canvas | Color、Layers、Inspector、Timeline、Animation、Advanced、Export | なし |
| `GAME` | Play workspace + Scene/Asset Timeline | Play、Scene、Game Inspector、Game Assets、Build、下部Tracks | Color、Palette、Draw用Timeline、Draw tool rail |
| `AUDIO` | Artwork preview + central MIDI-like Piano Roll | Audio、Mixer、Clips、Audio Preview、BGM／SFX／Voice、下部Clip Timeline | Color、Palette、Draw用Timeline、Draw tool rail |

## 実装境界

- 内部の `CreatorWorkspaceMode`（`ANIMATE` / `ASSET` / `EXPORT`を含む）は、モバイル投影・既存fixtureとの互換性のため残す。
- PCの表示層だけが `DRAW` / `GAME` / `AUDIO`へ投影し、PCで旧モードが選ばれた場合は`DRAW`へfail-safeで正規化する。
- モードごとの許可Panelは `src/wp180-workspace-contracts.ts` の `DESKTOP_CREATOR_MODE_PROFILES` を唯一の定義とする。
- `GAME`の`Play`は既存の隔離Local Runtime PreviewをWorkspace内へマウントする。下部TimelineはUnity風のScene／Asset／Event Trackを表示し、Build/Publishや本番データには接続しない。
- `AUDIO`はキャンバスを視覚リファレンスとして残し、中央WorkspaceにMIDI風Piano Rollを常時表示する。下部TimelineはBGM／SFX／VoiceのTrack stripとアニメーションCelを扱い、Piano Rollの表示切替ボタンは設けない。Draw Timelineの現在FrameはPiano Rollの縦ガイドへ反映し、音符クリックも該当Frameへ寄せる。Clipはローカルファイルから取り込み、metadata／Journal／CheckpointをProject別に保存する。音声バイトはIndexedDBの正本へ混ぜず、OPFSまたはMemory Previewへ分離し、PXD書き出し時だけ検証済みsource bytesを同じPXDへ格納する。外部アップロード・Registry・Production接続は行わない。
- `GAME` / `AUDIO`ではColor Panel、Palette、Draw用Timeline、Draw tool railをDOM上でも非活性化し、キーボードやPanel切替からも到達できない。
- `DRAW`ではDraw用Timelineを常時表示し、Animation操作をDrawの一部として扱う。
- 右DockのカスタムPanel追加は、同じmode profileの`allowedPanels`だけを候補にする。別モードのPanelは検索結果にも出さない。

## 変更対象

- `src/wp180-workspace-contracts.ts`: PCモードのPanel profileと専用Panel ID。
- `src/wp180-workspace-ui.ts`: PCモード投影、許可Panel制御、Play/Audio/Sceneの表示枠。
- `assets/draw2-shell.css`: PCの3モード用レイアウト、Color/Palette/Timelineの可視性、専用下部Deck。
- `index.html`: 現在モードのサマリーとGAME/AUDIO専用下部Deck。旧モードのボタンはモバイル互換のためDOMに残す。

## 現在の状態

### AUDIO timebase / production panels

- Audio TimelineはアニメーションCel、BGM／SFX／VoiceのClip lane、Bar.Beat rulerを同じ列で表示する。
- Audioでは編集用Canvasを前面に出さず、Drawと同じ位置・サイズの小窓Artwork Previewとして表示する。Piano RollはAudioモードの中央Workspaceに常時表示し、下部はClip Timeline、Clips、Mixer、Automation、Sync、Settingsだけを切り替える。
- AudioのPiano RollはPulse 25%／Pulse 50%／Triangle／Saw／Noise DrumsのローカルChip Synthに接続する。音符セルのクリックで短い試聴ができ、Chip Previewでフレーム列を再生し、Loop・FPS同期・音量を反映する。Web Audio未対応環境では音符編集を維持したまま再生だけを安全に無効化する。
- DrawとAudioのTimelineには現在再生位置を示す再生ヘッドを表示し、Frame変更・Preview transport・Loopに追従させる。
- Draw TimelineはDraw固有のFrame／Layer／Cel／Tags／Markersだけを表示し、Audio用タブは表示しない。FPSとRepeatは既存のDraw操作として維持する。
- 時間軸は tick = round(frame * BPM * PPQ / (60 * FPS)) で算出し、FPS、BPM、Meter、PPQ、Snap／Quantize変更時にCel・MIDI・Markerを再計算する。
- 中央WorkspaceはPiano Roll専用とし、下部PanelはTimeline、Clips、Mixer、Automation、Sync、Settingsに分離する。MixerはGain／Mute／Solo、AutomationはTrack Gain／Pan／Filter、SyncはFrame Markerを扱う。
- PreviewはFPSに合わせたFrame transport、Loop、Draw frame follow、Metronome設定を持ち、音源が未選択でも時間軸設定を壊さない。
- 長いアニメーションは最大256フレームの可視Windowへ制限し、現在Frame周辺を再投影する。Canvas／Coreの再生成や波形全件走査は行わない。

`GAME`のPlayは実装済みの隔離Runtime Previewを利用でき、下部DeckにはローカルのAsset／Event Trackを追加・セル編集し、Project別に自動保存できる。`AUDIO`は中央Piano Rollへ音符を置き、下部Clip TimelineとArtwork Previewを同時に見ながら一時Previewでき、Project metadata／Journal／CheckpointもProject別に保存・復元する。Registry、Build/Publish、本番データ接続は未接続で、実装済みの表示・操作範囲と未接続範囲を分けて扱う。
