/**
 * AUDIO-310 canonical routing graph.
 *
 * The graph is deliberately host-neutral.  It contains identifiers and
 * fixed-point values only; Web Audio nodes and render buffers are projections
 * owned by their respective runtime adapters.
 */

import {
  type Audio200Result,
  audioFail,
  type AudioMixer,
  type AudioMixerSend,
  audioOk,
  type AudioProject,
  type AudioTrack,
  type AudioTrackId,
} from "../audio-200/contracts.ts";

export interface AudioRoutingGraph {
  readonly order: readonly AudioTrackId[];
  readonly outputBySource: ReadonlyMap<string, string | undefined>;
  readonly sendsBySource: ReadonlyMap<string, readonly AudioMixerSend[]>;
  readonly incomingByTarget: ReadonlyMap<string, readonly string[]>;
  readonly outgoingBySource: ReadonlyMap<string, readonly string[]>;
}

const AUXILIARY_KINDS = new Set(["BUS", "RETURN"]);

function invalid(message: string, path: string): Audio200Result<never> {
  return audioFail("AUDIO_INVALID_MIXER", message, path);
}

function trackKind(
  tracksById: ReadonlyMap<string, AudioTrack>,
  trackId: string,
): string | undefined {
  return tracksById.get(trackId)?.kind;
}

function addEdge(
  outgoing: Map<string, Set<string>>,
  incoming: Map<string, Set<string>>,
  source: string,
  destination: string,
): void {
  (outgoing.get(source) ?? outgoing.set(source, new Set()).get(source)!)
    .add(destination);
  (incoming.get(destination) ??
    incoming.set(destination, new Set()).get(destination)!)
    .add(source);
}

/** Validate routing references and return a stable children-before-parents order. */
export function buildAudioRoutingGraph(
  mixer: AudioMixer,
  tracks: readonly AudioTrack[],
): Audio200Result<AudioRoutingGraph> {
  const tracksById = new Map(
    tracks.map((track) => [String(track.trackId), track]),
  );
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  const outputBySource = new Map<string, string | undefined>();
  const sendsBySource = new Map<string, readonly AudioMixerSend[]>();
  for (const track of tracks) {
    outputBySource.set(String(track.trackId), undefined);
    outgoing.set(String(track.trackId), new Set());
    incoming.set(String(track.trackId), new Set());
  }
  for (const channel of mixer.channels) {
    const sourceId = String(channel.trackId);
    if (!tracksById.has(sourceId)) {
      return invalid(
        "Mixer channel source Track does not exist.",
        `mixer.channels.${String(channel.channelId)}.trackId`,
      );
    }
    if (channel.outputTrackId !== undefined) {
      const destinationId = String(channel.outputTrackId);
      if (!tracksById.has(destinationId)) {
        return invalid(
          "Mixer output destination Track does not exist.",
          `mixer.channels.${String(channel.channelId)}.outputTrackId`,
        );
      }
      if (!AUXILIARY_KINDS.has(trackKind(tracksById, destinationId) ?? "")) {
        return invalid(
          "Track output may target only a Bus or Return Track.",
          `mixer.channels.${String(channel.channelId)}.outputTrackId`,
        );
      }
      if (destinationId === sourceId) {
        return invalid(
          "A Track cannot route its output to itself.",
          `mixer.channels.${String(channel.channelId)}.outputTrackId`,
        );
      }
      outputBySource.set(sourceId, destinationId);
      addEdge(outgoing, incoming, sourceId, destinationId);
    }
  }
  const sends = mixer.sends ?? [];
  const sendIds = new Set<string>();
  for (const send of sends) {
    const sendId = String(send.sendId);
    if (sendIds.has(sendId)) {
      return invalid(
        "Mixer Send identifiers must be unique.",
        `mixer.sends.${sendId}`,
      );
    }
    sendIds.add(sendId);
    const sourceId = String(send.sourceTrackId);
    const destinationId = String(send.destinationTrackId);
    if (!tracksById.has(sourceId) || !tracksById.has(destinationId)) {
      return invalid(
        "Send source and destination Tracks must exist.",
        `mixer.sends.${sendId}`,
      );
    }
    if (!AUXILIARY_KINDS.has(trackKind(tracksById, destinationId) ?? "")) {
      return invalid(
        "Send destination must be a Bus or Return Track.",
        `mixer.sends.${sendId}.destinationTrackId`,
      );
    }
    if (sourceId === destinationId) {
      return invalid("A Track cannot Send to itself.", `mixer.sends.${sendId}`);
    }
    if (
      !Number.isSafeInteger(send.amountMilliDb) ||
      send.amountMilliDb < -120_000 || send.amountMilliDb > 24_000
    ) {
      return invalid(
        "Send amount is outside the bounded dB range.",
        `mixer.sends.${sendId}.amountMilliDb`,
      );
    }
    if (typeof send.preFader !== "boolean") {
      return invalid(
        "Send pre/post-fader flag must be boolean.",
        `mixer.sends.${sendId}.preFader`,
      );
    }
    const existing = sendsBySource.get(sourceId) ?? [];
    sendsBySource.set(sourceId, [...existing, send]);
    addEdge(outgoing, incoming, sourceId, destinationId);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const order: string[] = [];
  const visit = (trackId: string): boolean => {
    if (visiting.has(trackId)) return false;
    if (visited.has(trackId)) return true;
    visiting.add(trackId);
    for (const destinationId of outgoing.get(trackId) ?? []) {
      if (!visit(destinationId)) return false;
    }
    visiting.delete(trackId);
    visited.add(trackId);
    order.push(trackId);
    return true;
  };
  for (const track of tracks) {
    if (!visit(String(track.trackId))) {
      return invalid(
        "Mixer routing cycle detected; the graph was rejected fail-closed.",
        "mixer.routing",
      );
    }
  }
  // DFS post-order is destination-first; renderers consume sources before
  // their Bus/Return parents, so reverse it after cycle validation.
  order.reverse();
  return audioOk({
    order: order as AudioTrackId[],
    outputBySource,
    sendsBySource,
    incomingByTarget: new Map(
      [...incoming.entries()].map(([key, value]) => [key, [...value]]),
    ),
    outgoingBySource: new Map(
      [...outgoing.entries()].map(([key, value]) => [key, [...value]]),
    ),
  });
}

/** Build a validated graph from a complete canonical Project. */
export function buildProjectAudioRoutingGraph(
  project: AudioProject,
): Audio200Result<AudioRoutingGraph> {
  return buildAudioRoutingGraph(project.mixer, project.tracks);
}

/** Fixed-point Send gain projection used by runtime and Offline Render. */
export function audioSendAmountToLinear(amountMilliDb: number): number {
  const bounded = Math.min(24_000, Math.max(-120_000, amountMilliDb));
  return 10 ** (bounded / 20_000);
}

/**
 * Resolve effective Mute/Solo audibility for a routing graph.  A soloed node
 * keeps its connected Bus/Return path audible, while explicit mute always wins.
 */
export function effectiveAudioTrackAudibility(
  project: AudioProject,
  graph: AudioRoutingGraph,
  respectMuteSolo = true,
): ReadonlyMap<string, boolean> {
  const channels = new Map(
    project.mixer.channels.map((channel) => [String(channel.trackId), channel]),
  );
  const base = new Map<string, boolean>();
  const soloIds = new Set<string>();
  for (const track of project.tracks) {
    const channel = channels.get(String(track.trackId));
    const muted = track.muted || channel?.muted === true;
    base.set(String(track.trackId), !muted);
    if (track.solo || channel?.solo === true) {
      soloIds.add(String(track.trackId));
    }
  }
  if (!respectMuteSolo || soloIds.size === 0) return base;

  // Solo follows the connected routing component (both upstream and
  // downstream) so soloing a Bus/Return remains useful for its inputs.
  const connected = new Map<string, Set<string>>();
  for (const track of project.tracks) {
    connected.set(String(track.trackId), new Set());
  }
  for (const [source, targets] of graph.outgoingBySource) {
    for (const target of targets) {
      connected.get(source)?.add(target);
      connected.get(target)?.add(source);
    }
  }
  const audibleBySolo = new Set<string>();
  const queue = [...soloIds];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (audibleBySolo.has(id)) continue;
    audibleBySolo.add(id);
    for (const neighbour of connected.get(id) ?? []) {
      if (!audibleBySolo.has(neighbour)) queue.push(neighbour);
    }
  }
  return new Map(
    [...base.entries()].map(([id, audible]) => [
      id,
      audible && audibleBySolo.has(id),
    ]),
  );
}
