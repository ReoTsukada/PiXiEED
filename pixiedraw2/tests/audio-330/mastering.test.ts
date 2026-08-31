import {
  asAudioProjectId,
  asAudioTick,
  createAudioWorkspaceSession,
  journalWorkspaceMasterReplace,
  journalWorkspaceNoteUpsert,
  redoWorkspaceAudio,
  undoWorkspaceAudio,
} from "../../src/audio/audio-200/index.ts";
import { renderOfflineAudio } from "../../src/audio/audio-260/render.ts";
import { MixerRuntimeAdapter } from "../../src/audio/audio-240/mixer-runtime.ts";
import {
  createMasterMeterRuntime,
  masterCeilingToLinear,
} from "../../src/audio/audio-330/index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class Param {
  value = 0;
  cancelScheduledValues(_time: number): void {}
  setTargetAtTime(value: number): void {
    this.value = value;
  }
}

class Node {
  readonly connections: Node[] = [];
  connect(target: Node): void {
    this.connections.push(target);
  }
  disconnect(): void {
    this.connections.length = 0;
  }
}

class Gain extends Node {
  readonly gain = new Param();
}

class Panner extends Node {
  readonly pan = new Param();
}

class Filter extends Node {
  type = "lowpass";
  readonly frequency = new Param();
  readonly gain = new Param();
  readonly Q = new Param();
}

class Compressor extends Node {
  readonly threshold = new Param();
  readonly ratio = new Param();
  readonly attack = new Param();
  readonly release = new Param();
}

class Context {
  readonly destination = new Node();
  readonly currentTime = 0;
  readonly sampleRate = 8_000;
  createGain(): Gain {
    return new Gain();
  }
  createStereoPanner(): Panner {
    return new Panner();
  }
  createBiquadFilter(): Filter {
    return new Filter();
  }
  createDynamicsCompressor(): Compressor {
    return new Compressor();
  }
  createConvolver(): Node {
    return new Node();
  }
  createBuffer(): { getChannelData: () => Float32Array } {
    return { getChannelData: () => new Float32Array(8) };
  }
}

async function fixture() {
  const created = await createAudioWorkspaceSession({
    projectId: asAudioProjectId("mastering-project"),
    name: "Mastering",
    createdAt: "2026-08-18T00:00:00.000Z",
    framesPerSecond: 24,
    tempoBpm: 120,
    instrumentIds: ["BGM"],
  });
  assert(created.ok, JSON.stringify(created.diagnostics));
  const noted = await journalWorkspaceNoteUpsert(
    created.value,
    {
      id: "note:master",
      pitchMidi: 69,
      startFrame: 0,
      durationFrames: 6,
      velocity: 1,
      instrument: "BGM",
    },
    { commandId: "master-note" },
  );
  assert(noted.ok, JSON.stringify(noted.diagnostics));
  return noted.value;
}

Deno.test("AUDIO-330 Master state is canonical, reversible, and affects Offline Render", async () => {
  const session = await fixture();
  const clean = await renderOfflineAudio({
    project: session.project,
    store: { get: async () => ({ ok: false, diagnostics: [] }) } as never,
    sampleRateHz: 8_000,
    durationSeconds: 0.3,
    blockFrames: 128,
  });
  assert(clean.ok, JSON.stringify(clean.diagnostics));
  const changed = await journalWorkspaceMasterReplace(
    session,
    {
      gainDb: 18,
      limiterEnabled: true,
      limiterCeilingDb: -12,
    },
    { commandId: "master-replace" },
  );
  assert(changed.ok, JSON.stringify(changed.diagnostics));
  assert(
    changed.value.project.master?.limiterEnabled === true,
    "Master state was not persisted.",
  );
  const undone = await undoWorkspaceAudio(changed.value);
  assert(
    undone.ok && undone.value.project.master?.limiterEnabled === false,
    "Master Undo failed.",
  );
  const redone = await redoWorkspaceAudio(undone.value);
  assert(
    redone.ok && redone.value.project.master?.limiterEnabled === true,
    "Master Redo failed.",
  );
  const mastered = await renderOfflineAudio({
    project: redone.value.project,
    store: { get: async () => ({ ok: false, diagnostics: [] }) } as never,
    sampleRateHz: 8_000,
    durationSeconds: 0.3,
    blockFrames: 128,
  });
  assert(mastered.ok, JSON.stringify(mastered.diagnostics));
  assert(
    mastered.value.contentHash !== clean.value.contentHash,
    "Master processing did not change the export.",
  );
  const stateHash = redone.value.project.stateHash;
  assert(stateHash.length === 64, "Master state hash was not refreshed.");
  const meter = createMasterMeterRuntime();
  meter.setActive(true);
  const left = new Float32Array(clean.value.bytes!.length > 0 ? 256 : 0).fill(
    1,
  );
  const right = new Float32Array(left.length).fill(1);
  const snapshot = meter.process(left, right, 8_000);
  assert(
    snapshot.peakLinear === 1 && Number.isFinite(snapshot.lufsIntegrated),
    "Meter did not update.",
  );
  assert(
    snapshot.truePeakLinear >= snapshot.peakLinear,
    "True peak was not bounded.",
  );
  meter.setActive(false);
  assert(
    meter.snapshot().sampleFrames === 0,
    "Inactive meter retained runtime samples.",
  );
  // The renderer's limiter utility is bounded and deterministic for export consumers.
  assert(
    Math.abs(masterCeilingToLinear(-12_000) - 0.251188) < 0.001,
    "Limiter ceiling conversion is incorrect.",
  );
});

Deno.test("AUDIO-330 Realtime Master FX/limiter nodes are disposable and bypassable", async () => {
  const session = await fixture();
  const runtime = new MixerRuntimeAdapter(
    new Context() as unknown as AudioContext,
  );
  runtime.applyMixer(session.project.mixer);
  const masterEffect = {
    effectId: "effect:master-eq" as never,
    kind: "EQ" as const,
    enabled: true,
    parameters: [{ name: "gainDb", value: 3 }],
  };
  runtime.applyMasterState({
    gainMilliDb: 0,
    limiterEnabled: true,
    limiterCeilingMilliDb: -1_000,
    bypass: false,
    effectIds: [masterEffect.effectId],
  }, [masterEffect]);
  assert(
    runtime.snapshot().masterEffectNodeCount === 2,
    "Master FX/limiter were not projected.",
  );
  runtime.applyMasterState({
    gainMilliDb: 0,
    limiterEnabled: true,
    limiterCeilingMilliDb: -1_000,
    bypass: true,
    effectIds: [masterEffect.effectId],
  }, [masterEffect]);
  assert(
    runtime.snapshot().masterEffectNodeCount === 0,
    "Master bypass did not release nodes.",
  );
  runtime.dispose();
  assert(
    runtime.snapshot().trackNodeCount === 0,
    "Master dispose left Track nodes.",
  );
});
