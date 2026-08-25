/// <reference lib="dom" />

/**
 * Runtime projection of the canonical AUDIO-200 Mixer.
 *
 * AUDIO-200 remains the Project/Journal authority. This module owns only
 * browser Web Audio nodes and can be discarded/rebuilt without changing the
 * Project. Track input -> StereoPanner -> master is the sole runtime path for
 * instrument/clip sources that opt into the adapter.
 */

import type {
  AudioEffect,
  AudioMasterState,
  AudioMixer,
} from "../audio-200/contracts.ts";
import { masterCeilingToLinear } from "../audio-330/index.ts";
import { AUDIO_EQ_BANDS, effectParameterValue } from "../audio-320/index.ts";

const MIN_LINEAR_GAIN = 0.0001;
const MAX_LINEAR_GAIN = 16;
const DEFAULT_TRACK_ID = "instrument:preview";

export interface MixerRuntimeSnapshot {
  readonly trackNodeCount: number;
  readonly sendNodeCount: number;
  readonly effectNodeCount: number;
  readonly routingReady: boolean;
  readonly masterGain: number;
  readonly masterEffectNodeCount: number;
  readonly outputGain: number;
  readonly tracks: Readonly<
    Record<string, {
      readonly gain: number;
      readonly pan: number;
      readonly muted: boolean;
      readonly solo: boolean;
    }>
  >;
}

interface RuntimeTrack {
  readonly input: GainNode;
  readonly fader: GainNode;
  readonly panner: StereoPannerNode;
  readonly filter?: BiquadFilterNode;
  readonly effectNodes: AudioNode[];
  readonly effectParams: Map<string, AudioParam>;
}

interface RuntimeSend {
  readonly node: GainNode;
  readonly sourceId: string;
  readonly destinationId: string;
}

function dbToLinear(milliDb: number): number {
  const db = Number.isFinite(milliDb) ? milliDb / 1_000 : 0;
  return Math.min(MAX_LINEAR_GAIN, Math.max(MIN_LINEAR_GAIN, 10 ** (db / 20)));
}

function normalizedPan(panMilli: number): number {
  if (!Number.isFinite(panMilli)) return 0;
  return Math.min(1, Math.max(-1, panMilli / 1_000));
}

function setSmoothed(param: AudioParam, value: number, now: number): void {
  try {
    param.cancelScheduledValues(now);
    param.setTargetAtTime(value, now, 0.01);
  } catch {
    // A closed/fake context may not expose the scheduling methods. The
    // runtime still fails safe by assigning the bounded value directly.
    param.value = value;
  }
}

/** Web Audio graph for one canonical Mixer snapshot. */
export class MixerRuntimeAdapter {
  private readonly tracks = new Map<string, RuntimeTrack>();
  private mixer: AudioMixer | undefined;
  private readonly master: GainNode;
  /** Gesture-time audition bus; never becomes a canonical Project Track. */
  private readonly previewInput: GainNode;
  private readonly output: GainNode;
  private readonly destination: AudioNode;
  private meterAnalyser: AnalyserNode | undefined;
  private readonly sends: RuntimeSend[] = [];
  private routingReady = true;
  private effectsByTrack = new Map<string, readonly AudioEffect[]>();
  private masterState: AudioMasterState | undefined;
  private masterEffectNodes: AudioNode[] = [];
  private readonly masterEffectParams = new Map<string, AudioParam>();

  constructor(
    private readonly context: AudioContext,
    destination: AudioNode = context.destination,
  ) {
    this.destination = destination;
    this.master = context.createGain();
    this.previewInput = context.createGain();
    this.output = context.createGain();
    this.master.gain.value = 1;
    this.previewInput.gain.value = 1;
    this.output.gain.value = 1;
    this.previewInput.connect(this.master);
    this.master.connect(this.output);
    this.output.connect(destination);
  }

  /**
   * Attach a tiny, opt-in analyser to the Master output.  It is deliberately
   * absent while the Master panel is hidden so idle Audio mode pays no FFT
   * or analyser cost.
   */
  setMeterActive(active: boolean): void {
    if (active) {
      if (this.meterAnalyser !== undefined) return;
      const contextWithAnalyser = this.context as AudioContext & {
        createAnalyser?: () => AnalyserNode;
      };
      const analyser = contextWithAnalyser.createAnalyser?.();
      if (analyser === undefined) return;
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      try {
        this.output.disconnect();
        this.output.connect(analyser);
        analyser.connect(this.destination);
        this.meterAnalyser = analyser;
      } catch {
        try {
          this.output.disconnect();
          this.output.connect(this.destination);
          analyser.disconnect();
        } catch {
          // A closed/fake context remains silent and fail-safe.
        }
      }
      return;
    }
    const analyser = this.meterAnalyser;
    if (analyser === undefined) return;
    try {
      this.output.disconnect();
      analyser.disconnect();
      this.output.connect(this.destination);
    } catch {
      // The context may already be closed.
    }
    this.meterAnalyser = undefined;
  }

  getMeterAnalyser(): AnalyserNode | undefined {
    return this.meterAnalyser;
  }

  /** UI preview volume; this is runtime-only and never enters Project state. */
  setOutputVolume(value: number): void {
    const bounded = Number.isFinite(value)
      ? Math.min(1, Math.max(0, value))
      : 1;
    setSmoothed(this.output.gain, bounded, this.context.currentTime);
  }

  /** Project Master state and FX chain projected onto the runtime graph. */
  applyMasterState(
    master: AudioMasterState | undefined,
    effects: readonly AudioEffect[] = [],
  ): void {
    this.masterState = master;
    this.rebuildMasterEffects(effects);
    if (this.mixer !== undefined) this.applyMasterGain(this.mixer);
  }

  /** Apply a canonical snapshot; no Web Audio node is placed in Project state. */
  applyMixer(
    mixer: AudioMixer,
    effectsByTrack?: ReadonlyMap<string, readonly AudioEffect[]>,
  ): void {
    this.mixer = mixer;
    if (effectsByTrack !== undefined) {
      this.effectsByTrack = new Map(effectsByTrack);
    }
    const now = this.context.currentTime;
    this.clearDynamicRouting();
    const routing = runtimeRouting(mixer);
    this.routingReady = routing !== undefined;
    if (routing === undefined) {
      for (const runtime of this.tracks.values()) {
        setSmoothed(runtime.fader.gain, 0, now);
      }
      this.applyMasterGain(mixer);
      return;
    }
    const anySolo = mixer.channels.some((channel) => channel.solo);
    const audible = runtimeAudibility(mixer, routing, anySolo);
    const activeChannelIds = new Set<string>();
    for (const channel of mixer.channels) {
      const runtime = this.ensureTrack(channel.trackId);
      activeChannelIds.add(channel.trackId);
      setSmoothed(runtime.input.gain, 1, now);
      const gain = audible.get(channel.trackId) === true
        ? dbToLinear(channel.gainMilliDb)
        : 0;
      setSmoothed(runtime.fader.gain, gain, now);
      setSmoothed(runtime.panner.pan, normalizedPan(channel.panMilli), now);
      this.rebuildEffects(
        runtime,
        this.effectsByTrack.get(channel.trackId) ?? [],
      );
    }
    // Sources created with a stale/unknown Track ID are muted until a
    // canonical channel is supplied. This prevents a caller from bypassing
    // the Mixer by inventing a runtime-only route.
    for (const [trackId, runtime] of this.tracks) {
      if (!activeChannelIds.has(trackId)) {
        setSmoothed(runtime.fader.gain, 0, now);
        this.disconnectTrack(trackId, runtime);
      }
    }
    // Build Track -> Bus/Return -> Master edges after all nodes exist. A
    // malformed runtime snapshot remains silent rather than creating a
    // feedback loop or bypassing the Master.
    for (const channel of mixer.channels) {
      const source = this.ensureTrack(channel.trackId);
      const destination = channel.outputTrackId === undefined
        ? this.master
        : this.ensureTrack(channel.outputTrackId).input;
      source.panner.connect(destination);
    }
    for (const send of mixer.sends ?? []) {
      const source = this.ensureTrack(send.sourceTrackId);
      const destination = this.ensureTrack(send.destinationTrackId);
      const node = this.context.createGain();
      setSmoothed(node.gain, dbToLinear(send.amountMilliDb), now);
      (send.preFader ? source.input : source.panner).connect(node);
      node.connect(destination.input);
      this.sends.push({
        node,
        sourceId: String(send.sourceTrackId),
        destinationId: String(send.destinationTrackId),
      });
    }
    this.applyMasterGain(mixer);
  }

  /** Return a Track input for a source. The input is always routed via Mixer. */
  getTrackInput(trackId = DEFAULT_TRACK_ID): GainNode {
    const runtime = this.ensureTrack(trackId);
    if (this.mixer === undefined) return runtime.input;
    const channel = this.mixer.channels.find((item) =>
      item.trackId === trackId
    );
    if (channel === undefined) {
      // Unknown sources are not allowed to become an audible bypass. Solo
      // state is also respected for the short-lived preview fallback.
      setSmoothed(runtime.fader.gain, 0, this.context.currentTime);
    }
    return runtime.input;
  }

  /**
   * Return the transient audition input. It follows Master FX/output but does
   * not require a saved Track/Note to exist, so note preview never waits for a
   * Journal write or risks muting a brand-new lane.
   */
  getPreviewInput(): GainNode {
    return this.previewInput;
  }

  /** Runtime-only AudioParam targets used by AUDIO-300 Automation. */
  getTrackGainParam(trackId: string): AudioParam {
    return this.ensureTrack(trackId).fader.gain;
  }

  /** Runtime-only expression gain before the canonical channel fader. */
  getTrackExpressionGainParam(trackId: string): AudioParam {
    return this.ensureTrack(trackId).input.gain;
  }

  getTrackPanParam(trackId: string): AudioParam {
    return this.ensureTrack(trackId).panner.pan;
  }

  /** Returns undefined on hosts/fakes without a BiquadFilter node. */
  getTrackFilterCutoffParam(trackId: string): AudioParam | undefined {
    return this.ensureTrack(trackId).filter?.frequency;
  }

  /** Runtime-only Effect parameter target used by AUDIO-320 Automation. */
  getEffectParameterParam(
    trackId: string,
    effectId: string,
    parameterName: string,
  ): AudioParam | undefined {
    const runtime = this.ensureTrack(trackId);
    return runtime.effectParams.get(`${effectId}:${parameterName}`);
  }

  getMasterEffectParameterParam(
    effectId: string,
    parameterName: string,
  ): AudioParam | undefined {
    return this.masterEffectParams.get(`${effectId}:${parameterName}`);
  }

  getMasterGainParam(): AudioParam {
    return this.master.gain;
  }

  /** Disconnect all runtime nodes. The canonical Project is untouched. */
  dispose(): void {
    for (const runtime of this.tracks.values()) {
      try {
        runtime.input.disconnect();
        runtime.fader.disconnect();
        runtime.filter?.disconnect();
        runtime.panner.disconnect();
        for (const node of runtime.effectNodes) node.disconnect();
      } catch {
        // Disconnection is idempotent across browser and test AudioNodes.
      }
    }
    this.clearDynamicRouting();
    this.tracks.clear();
    try {
      this.master.disconnect();
      this.previewInput.disconnect();
      this.output.disconnect();
      this.meterAnalyser?.disconnect();
      for (const node of this.masterEffectNodes) node.disconnect();
    } catch {
      // The context may already be closed.
    }
    this.mixer = undefined;
    this.routingReady = true;
    this.effectsByTrack.clear();
    this.masterState = undefined;
    this.masterEffectNodes = [];
    this.masterEffectParams.clear();
    this.meterAnalyser = undefined;
  }

  snapshot(): MixerRuntimeSnapshot {
    const tracks: Record<string, {
      readonly gain: number;
      readonly pan: number;
      readonly muted: boolean;
      readonly solo: boolean;
    }> = {};
    const channelsByTrack = new Map<string, AudioMixer["channels"][number]>(
      this.mixer?.channels.map((
        channel,
      ) => [String(channel.trackId), channel]) ??
        [],
    );
    for (const [trackId, runtime] of this.tracks) {
      const channel = channelsByTrack.get(trackId);
      tracks[trackId] = {
        gain: runtime.fader.gain.value,
        pan: runtime.panner.pan.value,
        muted: channel?.muted ?? runtime.fader.gain.value === 0,
        solo: channel?.solo ?? false,
      };
    }
    return {
      trackNodeCount: this.tracks.size,
      sendNodeCount: this.sends.length,
      effectNodeCount: [...this.tracks.values()].reduce(
        (total, runtime) => total + runtime.effectNodes.length,
        0,
      ),
      routingReady: this.routingReady,
      masterGain: this.master.gain.value,
      masterEffectNodeCount: this.masterEffectNodes.length,
      outputGain: this.output.gain.value,
      tracks,
    };
  }

  private ensureTrack(trackId: string): RuntimeTrack {
    const existing = this.tracks.get(trackId);
    if (existing !== undefined) return existing;
    const input = this.context.createGain();
    const fader = this.context.createGain();
    const panner = this.context.createStereoPanner();
    input.gain.value = 1;
    fader.gain.value = 1;
    panner.pan.value = 0;
    const contextWithFilter = this.context as AudioContext & {
      createBiquadFilter?: () => BiquadFilterNode;
    };
    const filter = contextWithFilter.createBiquadFilter?.();
    if (filter !== undefined) {
      filter.type = "lowpass";
      filter.frequency.value = 20_000;
      input.connect(fader);
      fader.connect(filter);
      filter.connect(panner);
    } else {
      input.connect(fader);
      fader.connect(panner);
    }
    const runtime = filter === undefined
      ? {
        input,
        fader,
        panner,
        effectNodes: [],
        effectParams: new Map<string, AudioParam>(),
      }
      : {
        input,
        fader,
        panner,
        filter,
        effectNodes: [],
        effectParams: new Map<string, AudioParam>(),
      };
    this.tracks.set(trackId, runtime);
    return runtime;
  }

  private disconnectTrack(trackId: string, runtime: RuntimeTrack): void {
    try {
      runtime.input.disconnect();
      runtime.fader.disconnect();
      runtime.filter?.disconnect();
      runtime.panner.disconnect();
      for (const node of runtime.effectNodes) node.disconnect();
    } catch {
      // Disconnection is idempotent across browser and test AudioNodes.
    }
    this.tracks.delete(trackId);
  }

  private rebuildEffects(
    runtime: RuntimeTrack,
    effects: readonly AudioEffect[],
  ): void {
    try {
      runtime.input.disconnect();
      for (const node of runtime.effectNodes) node.disconnect();
    } catch {
      // The context may already be closed.
    }
    runtime.effectNodes.length = 0;
    runtime.effectParams.clear();
    let previous: AudioNode = runtime.input;
    for (const effect of effects) {
      if (!effect.enabled) continue;
      const nodes = this.createEffectNodes(effect, runtime.effectParams);
      for (const node of nodes) {
        previous.connect(node);
        previous = node;
        runtime.effectNodes.push(node);
      }
    }
    previous.connect(runtime.fader);
  }

  private createEffectNodes(
    effect: AudioEffect,
    effectParams: Map<string, AudioParam>,
  ): readonly AudioNode[] {
    const contextWithEffects = this.context as AudioContext & {
      createBiquadFilter?: () => BiquadFilterNode;
      createDynamicsCompressor?: () => DynamicsCompressorNode;
      createDelay?: (maxDelayTime?: number) => DelayNode;
      createConvolver?: () => ConvolverNode;
    };
    if (effect.kind === "EQ") {
      const isMultiBand = AUDIO_EQ_BANDS.some((band) =>
        effect.parameters.some((parameter) =>
          parameter.name === band.parameterName
        )
      );
      if (isMultiBand) {
        const q = Math.min(
          30,
          Math.max(
            0.05,
            effectParameterValue(
              effect,
              "eqQ",
              effectParameterValue(effect, "q", 1),
            ),
          ),
        );
        const nodes: BiquadFilterNode[] = [];
        for (const band of AUDIO_EQ_BANDS) {
          const node = contextWithEffects.createBiquadFilter?.();
          if (node === undefined) continue;
          node.type = "peaking";
          node.frequency.value = band.frequencyHz;
          node.gain.value = effectParameterValue(
            effect,
            band.parameterName,
            0,
          );
          node.Q.value = q;
          this.bindEffectParam(
            effectParams,
            effect,
            band.parameterName,
            node.gain,
          );
          nodes.push(node);
        }
        return nodes;
      }
      const node = contextWithEffects.createBiquadFilter?.();
      if (node === undefined) return [];
      node.type = "peaking";
      node.frequency.value = Math.min(
        20_000,
        Math.max(20, effectParameterValue(effect, "frequency", 1_000)),
      );
      node.gain.value = effectParameterValue(effect, "gainDb", 0);
      node.Q.value = Math.min(
        30,
        Math.max(0.05, effectParameterValue(effect, "q", 1)),
      );
      this.bindEffectParam(effectParams, effect, "frequency", node.frequency);
      this.bindEffectParam(effectParams, effect, "gainDb", node.gain);
      this.bindEffectParam(effectParams, effect, "q", node.Q);
      return [node];
    }
    if (effect.kind === "COMPRESSOR") {
      const node = contextWithEffects.createDynamicsCompressor?.();
      if (node === undefined) return [];
      node.threshold.value = effectParameterValue(effect, "thresholdDb", -18);
      node.ratio.value = Math.min(
        20,
        Math.max(1, effectParameterValue(effect, "ratio", 4)),
      );
      node.attack.value = Math.max(
        0.0001,
        effectParameterValue(effect, "attackMs", 10) / 1_000,
      );
      node.release.value = Math.max(
        0.001,
        effectParameterValue(effect, "releaseMs", 100) / 1_000,
      );
      this.bindEffectParam(effectParams, effect, "thresholdDb", node.threshold);
      this.bindEffectParam(effectParams, effect, "ratio", node.ratio);
      this.bindEffectParam(effectParams, effect, "attackMs", node.attack);
      this.bindEffectParam(effectParams, effect, "releaseMs", node.release);
      return [node];
    }
    if (effect.kind === "DELAY") {
      const node = contextWithEffects.createDelay?.(2);
      if (node === undefined) return [];
      node.delayTime.value = Math.min(
        2_000,
        Math.max(1, effectParameterValue(effect, "delayMs", 250)),
      ) / 1_000;
      this.bindEffectParam(effectParams, effect, "delayMs", node.delayTime);
      return [node];
    }
    if (effect.kind === "REVERB") {
      const node = contextWithEffects.createConvolver?.();
      const contextWithBuffer = this.context as AudioContext & {
        createBuffer?: (
          channels: number,
          length: number,
          sampleRate: number,
        ) => AudioBuffer;
      };
      if (node === undefined || contextWithBuffer.createBuffer === undefined) {
        return [];
      }
      const seconds = Math.min(
        2,
        Math.max(0.05, effectParameterValue(effect, "delayMs", 120) / 1_000),
      );
      const buffer = contextWithBuffer.createBuffer(
        2,
        Math.max(1, Math.round(this.context.sampleRate * seconds)),
        this.context.sampleRate,
      );
      const decay = Math.min(
        0.95,
        Math.max(0.05, effectParameterValue(effect, "decay", 0.35)),
      );
      for (let channel = 0; channel < 2; channel += 1) {
        const data = buffer.getChannelData(channel);
        for (let index = 0; index < data.length; index += 1) {
          data[index] = (Math.random() * 2 - 1) *
            (1 - index / data.length) ** (1 + decay * 8);
        }
      }
      node.buffer = buffer;
      return [node];
    }
    return [];
  }

  private bindEffectParam(
    effectParams: Map<string, AudioParam>,
    effect: AudioEffect,
    name: string,
    param: AudioParam,
  ): void {
    effectParams.set(`${String(effect.effectId)}:${name}`, param);
  }

  private applyMasterGain(mixer: AudioMixer): void {
    const masterGain = this.masterState?.bypass === true
      ? mixer.masterGainMilliDb
      : mixer.masterGainMilliDb + (this.masterState?.gainMilliDb ?? 0);
    setSmoothed(
      this.master.gain,
      dbToLinear(masterGain),
      this.context.currentTime,
    );
  }

  private rebuildMasterEffects(effects: readonly AudioEffect[]): void {
    try {
      this.master.disconnect();
      for (const node of this.masterEffectNodes) node.disconnect();
    } catch {
      // Disconnection is idempotent across browser and test AudioNodes.
    }
    this.masterEffectNodes = [];
    this.masterEffectParams.clear();
    let previous: AudioNode = this.master;
    const master = this.masterState;
    if (master?.bypass !== true) {
      for (const effect of effects) {
        if (!effect.enabled) continue;
        const nodes = this.createEffectNodes(effect, this.masterEffectParams);
        for (const node of nodes) {
          previous.connect(node);
          previous = node;
          this.masterEffectNodes.push(node);
        }
      }
      if (master?.limiterEnabled === true) {
        const contextWithCompressor = this.context as AudioContext & {
          createDynamicsCompressor?: () => DynamicsCompressorNode;
        };
        const limiter = contextWithCompressor.createDynamicsCompressor?.();
        if (limiter !== undefined) {
          const ceiling = 20 * Math.log10(
            masterCeilingToLinear(master.limiterCeilingMilliDb),
          );
          limiter.threshold.value = ceiling;
          limiter.ratio.value = 20;
          limiter.attack.value = 0.001;
          limiter.release.value = 0.05;
          previous.connect(limiter);
          previous = limiter;
          this.masterEffectNodes.push(limiter);
        }
      }
    }
    previous.connect(this.output);
  }

  private clearDynamicRouting(): void {
    for (const runtime of this.tracks.values()) {
      try {
        runtime.panner.disconnect();
      } catch {
        // Disconnection is idempotent across browser and test AudioNodes.
      }
    }
    for (const send of this.sends) {
      try {
        send.node.disconnect();
      } catch {
        // The context may already be closed.
      }
    }
    this.sends.length = 0;
  }
}

interface RuntimeRouting {
  readonly tracks: readonly string[];
  readonly outgoing: ReadonlyMap<string, readonly string[]>;
}

function runtimeRouting(mixer: AudioMixer): RuntimeRouting | undefined {
  const ids = new Set<string>();
  for (const channel of mixer.channels) {
    const trackId = String(channel.trackId);
    // Runtime receives a canonical Mixer projection.  Reject duplicate or
    // empty channel identities instead of allowing a malformed snapshot to
    // create an unbound runtime Track.
    if (trackId.length === 0 || ids.has(trackId)) return undefined;
    ids.add(trackId);
  }
  const outgoing = new Map<string, string[]>();
  for (const id of ids) outgoing.set(id, []);
  for (const channel of mixer.channels) {
    if (channel.outputTrackId !== undefined) {
      const source = String(channel.trackId);
      const destination = String(channel.outputTrackId);
      // A runtime projection may only route to a channel present in the
      // canonical snapshot.  Do not synthesize phantom Bus/Return nodes.
      if (!outgoing.has(source) || !outgoing.has(destination)) {
        return undefined;
      }
      outgoing.get(source)!.push(destination);
    }
  }
  for (const send of mixer.sends ?? []) {
    const source = String(send.sourceTrackId);
    const destination = String(send.destinationTrackId);
    if (
      !outgoing.has(source) || !outgoing.has(destination) ||
      typeof send.preFader !== "boolean" ||
      !Number.isSafeInteger(send.amountMilliDb) ||
      send.amountMilliDb < -120_000 || send.amountMilliDb > 24_000
    ) return undefined;
    outgoing.get(source)!.push(destination);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    for (const target of outgoing.get(id) ?? []) {
      if (!visit(target)) return false;
    }
    visiting.delete(id);
    visited.add(id);
    return true;
  };
  for (const id of ids) if (!visit(id)) return undefined;
  return { tracks: [...ids], outgoing };
}

function runtimeAudibility(
  mixer: AudioMixer,
  routing: RuntimeRouting,
  anySolo: boolean,
): ReadonlyMap<string, boolean> {
  const channels = new Map(
    mixer.channels.map((channel) => [String(channel.trackId), channel]),
  );
  const base = new Map(
    routing.tracks.map((id) => [id, channels.get(id)?.muted !== true]),
  );
  if (!anySolo) return base;
  const connected = new Map<string, Set<string>>(
    routing.tracks.map((id) => [id, new Set<string>()]),
  );
  for (const [source, targets] of routing.outgoing) {
    for (const target of targets) {
      connected.get(source)?.add(target);
      connected.get(target)?.add(source);
    }
  }
  const queue = mixer.channels.filter((channel) => channel.solo).map((
    channel,
  ) => String(channel.trackId));
  const connectedToSolo = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (connectedToSolo.has(id)) continue;
    connectedToSolo.add(id);
    for (const next of connected.get(id) ?? []) queue.push(next);
  }
  return new Map(
    [...base.entries()].map((
      [id, value],
    ) => [id, value && connectedToSolo.has(id)]),
  );
}

export function mixerGainToLinear(milliDb: number): number {
  return dbToLinear(milliDb);
}

export function mixerPanToNormalized(panMilli: number): number {
  return normalizedPan(panMilli);
}
