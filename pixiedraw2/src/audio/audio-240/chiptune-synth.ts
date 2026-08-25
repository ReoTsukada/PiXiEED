/// <reference lib="dom" />

/** Browser-local Web Audio chip synthesizer. No network or persistence. */

import {
  type ChipSynthPresetId,
  type ChipSynthVoiceOverride,
  type ChipSynthVoiceProfile,
  getChipSynthVoice,
  midiToFrequency,
} from "./chiptune.ts";
import type {
  AudioAutomation,
  AudioEffect,
  AudioMasterState,
  AudioMixer,
  AudioTrack,
} from "../audio-200/contracts.ts";
import {
  automationValueAtTick,
  compileAudioAutomation,
  scheduleAudioAutomation,
} from "../audio-300/index.ts";
import { mixerGainToLinear, MixerRuntimeAdapter } from "./mixer-runtime.ts";

type WebkitAudioContextConstructor = new () => AudioContext;

type AudioContextWindow = Window & {
  AudioContext?: WebkitAudioContextConstructor;
  webkitAudioContext?: WebkitAudioContextConstructor;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export type ChipTuneAudioContextState =
  | AudioContextState
  | "uninitialized"
  | "unavailable";

/** Read-only lifecycle information used by the host before scheduling. */
export interface ChipTunePlaybackDiagnostics {
  readonly contextState: ChipTuneAudioContextState;
  readonly runtimeReady: boolean;
  readonly mixerReady: boolean;
  readonly routingReady: boolean;
  readonly trackIds: readonly string[];
  readonly missingTrackIds: readonly string[];
  readonly silentTrackIds: readonly string[];
  readonly effectiveGain: number;
  readonly masterGain: number;
  readonly outputGain: number;
  readonly activeSourceCount: number;
}

/**
 * A deliberately small, lazy synth. The AudioContext is created only after a
 * user gesture (note audition or Chip Preview), which keeps page startup and
 * mobile autoplay policy safe.
 */
export class ChipTuneSynth {
  private context: AudioContext | undefined;
  private mixerRuntime: MixerRuntimeAdapter | undefined;
  private mixer: AudioMixer | undefined;
  private readonly activeSources = new Set<AudioScheduledSourceNode>();
  private readonly activeNoteGains = new Set<GainNode>();
  private readonly mediaSources = new Map<
    HTMLMediaElement,
    MediaElementAudioSourceNode
  >();
  private automations: readonly AudioAutomation[] = [];
  private effectsByTrack = new Map<string, readonly AudioEffect[]>();
  private masterState: AudioMasterState | undefined;
  private masterEffects: readonly AudioEffect[] = [];
  private voiceOverrides = new Map<string, ChipSynthVoiceOverride>();
  private automationTempoMilliBpm = 120_000;
  private automationPpq = 480;
  private volume = 0.22;
  private resumePromise: Promise<boolean> | undefined;
  private suspendPromise: Promise<void> | undefined;
  private readonly contextStateListeners = new Set<
    (state: ChipTuneAudioContextState) => void
  >();

  constructor(private readonly windowRef: Window) {}

  setVolume(value: number): void {
    this.volume = clamp(Number.isFinite(value) ? value : 0.22, 0, 1);
    this.mixerRuntime?.setOutputVolume(this.volume);
  }

  getVolume(): number {
    return this.volume;
  }

  /** Runtime-only AudioContext access for the long-audio adapter. */
  getAudioContext(): AudioContext | undefined {
    return this.context;
  }

  /** Runtime-only Mixer graph access; canonical Mixer remains the authority. */
  getMixerRuntime(): MixerRuntimeAdapter | undefined {
    return this.mixerRuntime;
  }

  /** Subscribe to AudioContext lifecycle changes without exposing the graph. */
  onContextStateChange(
    listener: (state: ChipTuneAudioContextState) => void,
  ): () => void {
    this.contextStateListeners.add(listener);
    return () => this.contextStateListeners.delete(listener);
  }

  /** Snapshot the conditions that must be true before starting playback. */
  getPlaybackDiagnostics(
    trackIds: readonly string[] = [],
  ): ChipTunePlaybackDiagnostics {
    const contextState: ChipTuneAudioContextState = this.context === undefined
      ? "uninitialized"
      : String(this.context.state) as ChipTuneAudioContextState;
    const snapshot = this.mixerRuntime?.snapshot();
    const ids = [...new Set(trackIds.map((id) => String(id)).filter(Boolean))];
    const channels = this.mixer?.channels ?? [];
    const channelByTrack = new Map(
      channels.map((channel) => [String(channel.trackId), channel]),
    );
    const anySolo = channels.some((channel) => channel.solo);
    const missingTrackIds = ids.filter((id) =>
      channelByTrack.get(id) === undefined || snapshot?.tracks[id] === undefined
    );
    const silentTrackIds = ids.filter((id) => {
      const channel = channelByTrack.get(id);
      const track = snapshot?.tracks[id];
      return channel === undefined || channel.muted ||
        (anySolo && !channel.solo) ||
        mixerGainToLinear(channel.gainMilliDb) <= 0.0001 || track === undefined;
    });
    const trackGains = ids
      .map((id) => {
        const channel = channelByTrack.get(id);
        if (
          channel === undefined || channel.muted || (anySolo && !channel.solo)
        ) return 0;
        return mixerGainToLinear(channel.gainMilliDb);
      })
      .filter((gain) => Number.isFinite(gain));
    const masterMilliDb = this.mixer?.masterGainMilliDb ?? 0;
    const masterEffectMilliDb = this.masterState?.bypass === true
      ? 0
      : (this.masterState?.gainMilliDb ?? 0);
    const masterGain = mixerGainToLinear(masterMilliDb + masterEffectMilliDb);
    const outputGain = this.volume;
    const effectiveGain = trackGains.length > 0
      ? Math.max(0, Math.max(...trackGains)) * masterGain * outputGain
      : masterGain * outputGain;
    return {
      contextState,
      runtimeReady: contextState !== "uninitialized" &&
        contextState !== "unavailable" && contextState !== "closed" &&
        this.mixerRuntime !== undefined,
      mixerReady: this.mixer !== undefined && this.mixerRuntime !== undefined,
      routingReady: snapshot?.routingReady === true,
      trackIds: ids,
      missingTrackIds,
      silentTrackIds,
      effectiveGain,
      masterGain,
      outputGain,
      activeSourceCount: this.activeSources.size,
    };
  }

  /** Enable the Master analyser only while a visible meter needs it. */
  setMasterMeterActive(active: boolean): void {
    this.mixerRuntime?.setMeterActive(active);
  }

  /** Runtime-only analyser access for the low-frequency UI meter. */
  getMasterMeterAnalyser(): AnalyserNode | undefined {
    return this.mixerRuntime?.getMeterAnalyser();
  }

  /** Project Mixer snapshot projected onto the current runtime graph. */
  setMixer(mixer: AudioMixer): void {
    this.mixer = mixer;
    this.mixerRuntime?.applyMixer(mixer, this.effectsByTrack);
    this.mixerRuntime?.applyMasterState(this.masterState, this.masterEffects);
    this.applyAutomationRuntime();
  }

  /** Project custom presets onto future notes without rebuilding the graph. */
  setVoiceOverrides(
    overrides: ReadonlyMap<string, ChipSynthVoiceOverride>,
  ): void {
    this.voiceOverrides = new Map<string, ChipSynthVoiceOverride>(
      [...overrides.entries()].map(([key, value]) => {
        const filter = value.filter;
        return [
          String(key).trim().toUpperCase().replace(/^INSTRUMENT:/u, ""),
          {
            ...value,
            ...(filter === undefined
              ? {}
              : { filter: filter === null ? null : { ...filter } }),
          },
        ];
      }),
    );
  }

  /** Project Effect chains are runtime projections, never Web Audio state. */
  setEffects(
    effects: readonly AudioEffect[],
    tracks: readonly AudioTrack[],
  ): void {
    const byId = new Map(effects.map((effect) => [effect.effectId, effect]));
    this.effectsByTrack = new Map(
      tracks.map((track) => [
        String(track.trackId),
        track.effectIds.map((effectId) => byId.get(effectId)).filter(
          (effect): effect is AudioEffect => effect !== undefined,
        ),
      ]),
    );
    if (this.mixer !== undefined) {
      this.mixerRuntime?.applyMixer(this.mixer, this.effectsByTrack);
      this.mixerRuntime?.applyMasterState(this.masterState, this.masterEffects);
    }
    this.applyAutomationRuntime();
  }

  /** Project Master state and chain are runtime projections, never persisted nodes. */
  setMasterState(
    master: AudioMasterState | undefined,
    effects: readonly AudioEffect[] = [],
  ): void {
    this.masterState = master;
    this.masterEffects = effects.map((effect) => ({
      ...effect,
      parameters: effect.parameters.map((parameter) => ({ ...parameter })),
    }));
    this.mixerRuntime?.applyMasterState(this.masterState, this.masterEffects);
    this.applyAutomationRuntime();
  }

  /** Store canonical curves and project them onto AudioParams when available. */
  setAutomation(
    automations: readonly AudioAutomation[],
    tempoMilliBpm = 120_000,
    ticksPerQuarter = 480,
  ): void {
    this.automations = automations.map((automation) => ({
      ...automation,
      target: { ...automation.target },
      points: automation.points.map((point) => ({ ...point })),
    }));
    this.automationTempoMilliBpm = tempoMilliBpm;
    this.automationPpq = ticksPerQuarter;
    // Clearing/replacing a curve must also clear any future AudioParam events
    // from the previous Project snapshot. Re-applying the canonical Mixer
    // gives every Track its current base gain/pan before new ramps are added.
    if (this.mixer !== undefined) {
      this.mixerRuntime?.applyMixer(this.mixer, this.effectsByTrack);
    }
    this.applyAutomationRuntime();
  }

  /** Rebuild all AudioParam schedules after seek/loop/tempo changes. */
  rescheduleAutomation(fromTick = 0): void {
    this.applyAutomationRuntime(fromTick);
  }

  private automationValueAtTick(
    trackId: string,
    parameterName: string,
    tick: number,
  ): number | undefined {
    const automation = this.automations.find((candidate) =>
      candidate.target.kind === "SYNTH_PARAMETER" &&
      candidate.target.targetId === trackId &&
      candidate.target.parameterName === parameterName
    );
    if (automation === undefined) return undefined;
    const compiled = compileAudioAutomation(automation);
    return compiled.ok
      ? automationValueAtTick(compiled.value, tick)
      : undefined;
  }

  /** Route a local clip through the same canonical Mixer Track graph. */
  attachMediaElement(
    element: HTMLMediaElement,
    trackId = "instrument:bgm",
  ): boolean {
    const context = this.ensureContext();
    if (context === undefined || this.mixerRuntime === undefined) return false;
    let source = this.mediaSources.get(element);
    if (source === undefined) {
      try {
        source = context.createMediaElementSource(element);
        this.mediaSources.set(element, source);
      } catch {
        // A MediaElementAudioSourceNode can only be created once per element.
        return false;
      }
    }
    try {
      source.disconnect();
    } catch {
      // Reconnecting an already routed source is safe.
    }
    source.connect(this.mixerRuntime.getTrackInput(trackId));
    return true;
  }

  /** Stop notes and release the runtime graph on host teardown. */
  dispose(): void {
    this.resumePromise = undefined;
    this.suspendPromise = undefined;
    this.contextStateListeners.clear();
    this.stopAll();
    this.mixerRuntime?.dispose();
    this.mixerRuntime = undefined;
    for (const source of this.mediaSources.values()) {
      try {
        source.disconnect();
      } catch {
        // The source may already be disconnected by the browser.
      }
    }
    this.mediaSources.clear();
    const context = this.context;
    this.context = undefined;
    if (context !== undefined && context.state !== "closed") {
      void context.close();
    }
  }

  isAvailable(): boolean {
    const candidate = this.getContextConstructor();
    return candidate !== undefined;
  }

  /** Prime the lightweight audio graph outside the note-input critical path. */
  prepare(): boolean {
    return this.ensureContext() !== undefined;
  }

  /**
   * Resume the context from a user-activation path before scheduling audio.
   * Safari/iOS may leave a previously-created context suspended after memory
   * pressure or a page lifecycle transition. Awaiting this boundary prevents
   * the scheduler from advancing while every source is still silent.
   */
  async resume(): Promise<boolean> {
    if (this.resumePromise !== undefined) return this.resumePromise;
    const promise = this.resumeContext();
    this.resumePromise = promise;
    try {
      return await promise;
    } finally {
      if (this.resumePromise === promise) this.resumePromise = undefined;
    }
  }

  private async resumeContext(): Promise<boolean> {
    const pendingSuspend = this.suspendPromise;
    if (pendingSuspend !== undefined) {
      await Promise.race([
        pendingSuspend,
        new Promise<void>((resolve) => setTimeout(resolve, 250)),
      ]).catch(() => undefined);
    }
    let context = this.ensureContext();
    if (context === undefined || String(context.state) === "closed") {
      return false;
    }
    if (String(context.state) === "running") return true;

    // Safari may report `interrupted`/`suspended` briefly after a lifecycle
    // transition. Retry once, but keep a hard bound for hosts with no output.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const settled = await new Promise<boolean>((resolve) => {
          let completed = false;
          const finish = (value: boolean): void => {
            if (completed) return;
            completed = true;
            resolve(value);
          };
          const timeoutId = setTimeout(() => finish(false), 600);
          void Promise.resolve(context!.resume()).then(
            () => {
              clearTimeout(timeoutId);
              finish(true);
            },
            () => {
              clearTimeout(timeoutId);
              finish(false);
            },
          );
        });
        if (settled && String(context.state) === "running") {
          this.notifyContextState();
          return true;
        }
      } catch {
        // Retry once below. A closed context is rebuilt by ensureContext().
      }
      if (String(context.state) === "closed") {
        context = this.ensureContext();
        if (context === undefined) return false;
      }
      if (String(context.state) === "running") return true;
      await new Promise<void>((resolve) => setTimeout(resolve, 24));
    }
    this.notifyContextState();
    return String(context.state) === "running";
  }

  playNote(
    pitchMidi: number,
    durationMs: number,
    presetId: ChipSynthPresetId,
    velocity = 0.8,
    trackId?: string,
    voiceId?: string,
  ): boolean {
    const context = this.ensureContext();
    return this.scheduleNoteAt(
      pitchMidi,
      durationMs,
      presetId,
      velocity,
      context === undefined ? Number.NaN : context.currentTime + 0.005,
      trackId,
      undefined,
      voiceId,
    );
  }

  /**
   * Play a transient Piano Roll/Drum Roll audition through the Master path.
   * This is intentionally independent from the canonical Track graph: a note
   * can be heard while its NOTE_UPSERT/Track creation is still being journaled.
   */
  playPreviewNote(
    pitchMidi: number,
    durationMs: number,
    presetId: ChipSynthPresetId,
    velocity = 0.8,
    voiceId?: string,
  ): boolean {
    const context = this.ensureContext();
    if (
      context === undefined || this.mixerRuntime === undefined ||
      String(context.state) !== "running"
    ) return false;
    return this.scheduleNoteOnInput(
      context,
      pitchMidi,
      durationMs,
      presetId,
      velocity,
      context.currentTime + 0.005,
      this.mixerRuntime.getPreviewInput(),
      0,
      voiceId,
    );
  }

  /** Return the Web Audio clock without creating an AudioContext. */
  getCurrentTime(): number {
    return this.context?.currentTime ?? 0;
  }

  /** Schedule a note at an absolute AudioContext time. */
  scheduleNoteAt(
    pitchMidi: number,
    durationMs: number,
    presetId: ChipSynthPresetId,
    velocity = 0.8,
    startTimeSeconds: number,
    trackId?: string,
    startTick?: number,
    voiceId?: string,
  ): boolean {
    const context = this.ensureContext();
    const frequency = midiToFrequency(pitchMidi);
    if (
      context === undefined || frequency <= 0 ||
      this.mixerRuntime === undefined || String(context.state) !== "running"
    ) {
      return false;
    }
    const pitchBend = trackId === undefined || startTick === undefined
      ? 0
      : clamp(
        this.automationValueAtTick(
          trackId,
          "midi.pitch-bend",
          startTick,
        ) ?? 0,
        -1,
        1,
      );
    return this.scheduleNoteOnInput(
      context,
      pitchMidi,
      durationMs,
      presetId,
      velocity,
      startTimeSeconds,
      this.mixerRuntime.getTrackInput(trackId),
      pitchBend,
      voiceId ?? trackId?.replace(/^instrument:/u, ""),
    );
  }

  private scheduleNoteOnInput(
    context: AudioContext,
    pitchMidi: number,
    durationMs: number,
    presetId: ChipSynthPresetId,
    velocity: number,
    startTimeSeconds: number,
    destination: AudioNode,
    pitchBend = 0,
    voiceId?: string,
  ): boolean {
    const frequency = midiToFrequency(pitchMidi) *
      2 ** (clamp(pitchBend, -1, 1) * 2 / 12);
    if (frequency <= 0) return false;
    const voice = getChipSynthVoice(
      voiceId,
      pitchMidi,
      presetId,
      this.voiceOverrides,
    );
    const requestedStart = Number.isFinite(startTimeSeconds)
      ? startTimeSeconds
      : context.currentTime + 0.005;
    const start = Math.max(context.currentTime + 0.001, requestedStart);
    const duration = clamp(
      Number.isFinite(durationMs) ? durationMs / 1_000 : 0.12,
      0.025,
      4,
    );
    const release = Math.min(duration * 0.35, voice.releaseMs / 1_000);
    const attack = Math.min(duration * 0.2, voice.attackMs / 1_000);
    const decay = Math.min(duration * 0.45, voice.decayMs / 1_000);
    const releaseStart = Math.max(
      start + attack,
      Math.min(start + duration - release, start + attack + decay),
    );
    const peak = clamp(
      (Number.isFinite(velocity) ? velocity : 0.8) * 0.72,
      0.02,
      0.8,
    );
    const sustain = Math.max(0.02, peak * clamp(voice.sustain, 0.02, 1));
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(sustain, releaseStart);
    gain.gain.setValueAtTime(sustain, releaseStart);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    const voiceBus: AudioNode = voice.filter === undefined
      ? gain
      : context.createBiquadFilter();
    const filterNode = voice.filter === undefined
      ? undefined
      : voiceBus as BiquadFilterNode;
    if (filterNode !== undefined && voice.filter !== undefined) {
      filterNode.type = voice.filter.type;
      filterNode.frequency.setValueAtTime(
        clamp(voice.filter.frequencyHz, 40, 20_000),
        start,
      );
      filterNode.Q.setValueAtTime(clamp(voice.filter.q, 0.1, 18), start);
      filterNode.connect(gain);
    }
    gain.connect(destination);
    this.activeNoteGains.add(gain);

    const scheduledSources: readonly {
      readonly source: AudioScheduledSourceNode;
      readonly stopTime: number;
    }[] = (() => {
      const entries: {
        source: AudioScheduledSourceNode;
        stopTime: number;
      }[] = [];
      const mainSource = voice.waveform === "noise"
        ? this.createNoiseSource(context, duration, voice.noiseColor)
        : this.createOscillatorSource(
          context,
          voice.waveform,
          voice.dutyCycle,
        );
      const mainOscillator = voice.waveform === "noise"
        ? undefined
        : mainSource as OscillatorNode;
      if (mainOscillator !== undefined) {
        this.scheduleOscillatorPitch(
          mainOscillator,
          frequency,
          voice,
          start,
        );
        mainSource.connect(voiceBus);
      } else {
        mainSource.connect(voiceBus);
      }
      entries.push({
        source: mainSource,
        stopTime: start + duration + 0.025,
      });

      for (const partial of voice.secondary) {
        const oscillator = this.createOscillatorSource(
          context,
          partial.waveform,
          partial.dutyCycle,
        );
        oscillator.detune.setValueAtTime(partial.detuneCents, start);
        oscillator.frequency.setValueAtTime(
          clamp(frequency * partial.ratio, 20, 20_000),
          start,
        );
        const partialGain = context.createGain();
        partialGain.gain.setValueAtTime(clamp(partial.gain, 0, 1), start);
        oscillator.connect(partialGain);
        partialGain.connect(voiceBus);
        entries.push({
          source: oscillator,
          stopTime: start + duration + 0.025,
        });
      }

      if (voice.transientLevel > 0) {
        const transientDuration = Math.min(
          duration,
          Math.max(0.004, voice.transientMs / 1_000),
        );
        const transient = this.createNoiseSource(
          context,
          transientDuration,
          voice.noiseColor,
        );
        const transientGain = context.createGain();
        const transientPeak = clamp(
          peak * voice.transientLevel,
          0.0001,
          0.7,
        );
        transientGain.gain.setValueAtTime(0.0001, start);
        transientGain.gain.linearRampToValueAtTime(
          transientPeak,
          start + Math.min(0.003, transientDuration * 0.25),
        );
        transientGain.gain.exponentialRampToValueAtTime(
          0.0001,
          start + transientDuration,
        );
        transient.connect(transientGain);
        transientGain.connect(voiceBus);
        entries.push({
          source: transient,
          stopTime: start + transientDuration + 0.012,
        });
      }

      if (voice.vibratoDepthCents > 0 && mainOscillator !== undefined) {
        const lfo = context.createOscillator();
        const lfoGain = context.createGain();
        lfo.type = "sine";
        lfo.frequency.setValueAtTime(
          clamp(voice.vibratoRateHz, 0.5, 16),
          start,
        );
        lfoGain.gain.setValueAtTime(
          clamp(voice.vibratoDepthCents, 0, 40),
          start,
        );
        lfo.connect(lfoGain);
        lfoGain.connect(mainOscillator.detune);
        entries.push({
          source: lfo,
          stopTime: start + duration + 0.025,
        });
      }
      return entries;
    })();
    let endedSources = 0;
    let cleanedUp = false;
    const cleanup = (): void => {
      if (cleanedUp) return;
      cleanedUp = true;
      for (const entry of scheduledSources) {
        try {
          entry.source.disconnect();
        } catch {
          // The browser may have disconnected a source during teardown.
        }
      }
      try {
        voiceBus.disconnect();
      } catch {
        // The voice bus may already be disconnected by stopAll().
      }
      try {
        gain.disconnect();
      } catch {
        // The gain may already be disconnected by stopAll().
      }
      this.activeNoteGains.delete(gain);
    };
    for (const entry of scheduledSources) {
      const { source, stopTime } = entry;
      this.activeSources.add(source);
      source.addEventListener("ended", () => {
        this.activeSources.delete(source);
        endedSources += 1;
        if (endedSources >= scheduledSources.length) cleanup();
      }, { once: true });
      source.start(start);
      source.stop(stopTime);
    }
    return true;
  }

  stopAll(): void {
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // A source may already have ended between iteration and stop().
      }
    }
    this.activeSources.clear();
    for (const gain of this.activeNoteGains) {
      try {
        gain.disconnect();
      } catch {
        // A note gain may already have been disconnected by its source.
      }
    }
    this.activeNoteGains.clear();
  }

  suspend(): void {
    const context = this.context;
    if (context?.state !== "running") return;
    try {
      const pending = Promise.resolve(context.suspend());
      this.suspendPromise = pending;
      void pending.then(
        () => {
          if (this.suspendPromise === pending) this.suspendPromise = undefined;
        },
        () => {
          if (this.suspendPromise === pending) this.suspendPromise = undefined;
        },
      );
    } catch {
      this.suspendPromise = undefined;
    }
  }

  private ensureContext(): AudioContext | undefined {
    const Constructor = this.getContextConstructor();
    if (Constructor === undefined) return undefined;
    // Safari/mobile browsers can close an AudioContext after memory pressure
    // or a page lifecycle transition.  Never keep a closed graph around: the
    // canonical Mixer is still retained and will be projected onto the new
    // runtime below.
    if (this.context?.state === "closed") {
      this.suspendPromise = undefined;
      this.mixerRuntime?.dispose();
      this.mixerRuntime = undefined;
      for (const source of this.mediaSources.values()) {
        try {
          source.disconnect();
        } catch {
          // The closed context may already have discarded the source.
        }
      }
      this.mediaSources.clear();
      this.context = undefined;
    }
    if (this.context === undefined) {
      try {
        this.context = new Constructor();
        const createdContext = this.context;
        createdContext.addEventListener?.("statechange", () => {
          this.notifyContextState();
        });
        this.mixerRuntime = new MixerRuntimeAdapter(this.context);
        this.mixerRuntime.setOutputVolume(this.volume);
        if (this.mixer !== undefined) {
          this.mixerRuntime.applyMixer(this.mixer, this.effectsByTrack);
        }
        this.mixerRuntime.applyMasterState(
          this.masterState,
          this.masterEffects,
        );
        this.applyAutomationRuntime();
      } catch {
        this.context = undefined;
        this.mixerRuntime = undefined;
        return undefined;
      }
    }
    return this.context;
  }

  private notifyContextState(): void {
    const state: ChipTuneAudioContextState = this.context === undefined
      ? "uninitialized"
      : String(this.context.state) as ChipTuneAudioContextState;
    for (const listener of this.contextStateListeners) {
      try {
        listener(state);
      } catch {
        // A diagnostic listener must never break AudioContext recovery.
      }
    }
  }

  private getContextConstructor(): WebkitAudioContextConstructor | undefined {
    const candidate = this.windowRef as AudioContextWindow;
    return candidate.AudioContext ?? candidate.webkitAudioContext;
  }

  private applyAutomationRuntime(fromTick = 0): void {
    const context = this.context;
    const mixer = this.mixer;
    const runtime = this.mixerRuntime;
    if (context === undefined || mixer === undefined || runtime === undefined) {
      return;
    }
    const channelById = new Map(
      mixer.channels.map((channel) => [String(channel.channelId), channel]),
    );
    for (const automation of this.automations) {
      const compiled = compileAudioAutomation(automation);
      if (!compiled.ok) continue;
      let trackId: string | undefined;
      if (
        automation.target.kind === "TRACK_GAIN" ||
        automation.target.kind === "TRACK_PAN" ||
        automation.target.kind === "FILTER_CUTOFF" ||
        automation.target.kind === "SYNTH_PARAMETER"
      ) trackId = automation.target.targetId;
      if (
        automation.target.kind === "MIXER_CHANNEL_GAIN" ||
        automation.target.kind === "MIXER_CHANNEL_PAN"
      ) trackId = channelById.get(automation.target.targetId)?.trackId;
      if (automation.target.kind === "EFFECT_PARAMETER") {
        for (const [candidateTrackId, effects] of this.effectsByTrack) {
          if (
            effects.some((effect) =>
              String(effect.effectId) === automation.target.targetId
            )
          ) {
            trackId = candidateTrackId;
            break;
          }
        }
        if (
          trackId === undefined &&
          this.masterEffects.some((effect) =>
            String(effect.effectId) === automation.target.targetId
          )
        ) {
          trackId = "__master__";
        }
      }
      if (trackId === undefined) continue;
      const synthParameter = automation.target.kind === "SYNTH_PARAMETER"
        ? automation.target.parameterName ?? ""
        : "";
      const midiController = /^midi\.cc\.(\d+)$/u.exec(synthParameter)?.[1];
      const expressionFilter = midiController === "1" ||
        midiController === "74";
      let param: AudioParam | undefined;
      if (midiController === "11") {
        param = runtime.getTrackExpressionGainParam(String(trackId));
      } else if (expressionFilter) {
        param = runtime.getTrackFilterCutoffParam(String(trackId));
      } else if (
        automation.target.kind === "TRACK_GAIN" ||
        automation.target.kind === "MIXER_CHANNEL_GAIN" ||
        (automation.target.kind === "SYNTH_PARAMETER" &&
          ["gain", "volume"].includes(
            automation.target.parameterName ?? "",
          ))
      ) param = runtime.getTrackGainParam(String(trackId));
      else if (
        automation.target.kind === "TRACK_PAN" ||
        automation.target.kind === "MIXER_CHANNEL_PAN" ||
        (automation.target.kind === "SYNTH_PARAMETER" &&
          automation.target.parameterName === "pan")
      ) param = runtime.getTrackPanParam(String(trackId));
      else if (
        automation.target.kind === "FILTER_CUTOFF" ||
        (automation.target.kind === "SYNTH_PARAMETER" &&
          automation.target.parameterName === "filterCutoff")
      ) param = runtime.getTrackFilterCutoffParam(String(trackId));
      else if (automation.target.kind === "EFFECT_PARAMETER") {
        param = trackId === "__master__"
          ? runtime.getMasterEffectParameterParam(
            automation.target.targetId,
            automation.target.parameterName ?? "",
          )
          : runtime.getEffectParameterParam(
            String(trackId),
            automation.target.targetId,
            automation.target.parameterName ?? "",
          );
      }
      if (param === undefined) continue;
      const curve = expressionFilter
        ? {
          ...compiled.value,
          points: compiled.value.points.map((point) => ({
            ...point,
            value: 300 + clamp(point.value, 0, 1) * 17_700,
          })),
        }
        : compiled.value;
      scheduleAudioAutomation(param, curve, {
        nowSeconds: context.currentTime,
        tempoMilliBpm: this.automationTempoMilliBpm,
        ticksPerQuarter: this.automationPpq,
        fromTick,
      });
    }
  }

  private scheduleOscillatorPitch(
    oscillator: OscillatorNode,
    frequency: number,
    voice: ChipSynthVoiceProfile,
    start: number,
  ): void {
    const targetFrequency = clamp(frequency, 20, 20_000);
    if (voice.pitchStartRatio > 1 && voice.pitchSweepMs > 0) {
      oscillator.frequency.setValueAtTime(
        clamp(targetFrequency * voice.pitchStartRatio, 20, 20_000),
        start,
      );
      oscillator.frequency.exponentialRampToValueAtTime(
        targetFrequency,
        start + Math.max(0.004, voice.pitchSweepMs / 1_000),
      );
    } else {
      oscillator.frequency.setValueAtTime(targetFrequency, start);
    }
  }

  private createOscillatorSource(
    context: AudioContext,
    waveform: Exclude<ChipSynthVoiceProfile["waveform"], "noise">,
    dutyCycle: number,
  ): OscillatorNode {
    const oscillator = context.createOscillator();
    if (waveform === "pulse") {
      oscillator.setPeriodicWave(this.createPulseWave(context, dutyCycle));
    } else {
      oscillator.type = waveform;
    }
    return oscillator;
  }

  private createNoiseSource(
    context: AudioContext,
    durationSeconds: number,
    color: "white" | "pink" = "white",
  ): AudioBufferSourceNode {
    const frameCount = Math.max(
      1,
      Math.ceil(context.sampleRate * durationSeconds),
    );
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const data = buffer.getChannelData(0);
    let pinkB0 = 0;
    let pinkB1 = 0;
    let pinkB2 = 0;
    let pinkB3 = 0;
    let pinkB4 = 0;
    let pinkB5 = 0;
    let pinkB6 = 0;
    for (let index = 0; index < data.length; index += 1) {
      const white = Math.random() * 2 - 1;
      if (color === "pink") {
        pinkB0 = 0.99886 * pinkB0 + white * 0.0555179;
        pinkB1 = 0.99332 * pinkB1 + white * 0.0750759;
        pinkB2 = 0.96900 * pinkB2 + white * 0.1538520;
        pinkB3 = 0.86650 * pinkB3 + white * 0.3104856;
        pinkB4 = 0.55000 * pinkB4 + white * 0.5329522;
        pinkB5 = -0.7616 * pinkB5 - white * 0.0168980;
        data[index] = (pinkB0 + pinkB1 + pinkB2 + pinkB3 + pinkB4 + pinkB5 +
          pinkB6 + white * 0.5362) * 0.11;
        pinkB6 = white * 0.115926;
      } else {
        data[index] = white;
      }
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    return source;
  }

  private createPulseWave(
    context: AudioContext,
    dutyCycle: number,
  ): PeriodicWave {
    const duty = clamp(dutyCycle, 0.05, 0.95);
    const harmonics = 32;
    const real = new Float32Array(harmonics + 1);
    const imag = new Float32Array(harmonics + 1);
    real[0] = 2 * duty - 1;
    for (let harmonic = 1; harmonic <= harmonics; harmonic += 1) {
      real[harmonic] = Math.sin(2 * Math.PI * harmonic * duty) /
        (Math.PI * harmonic);
      imag[harmonic] = (1 - Math.cos(2 * Math.PI * harmonic * duty)) /
        (Math.PI * harmonic);
    }
    return context.createPeriodicWave(real, imag, {
      disableNormalization: false,
    });
  }
}
