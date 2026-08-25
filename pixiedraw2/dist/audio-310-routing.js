// src/wp160-contracts.ts
var AUTHORIZATION_PROOF_ALLOWED_CLOCK_SKEW_MS = 5 * 60 * 1e3;
var AUTHORIZATION_PROOF_MAX_LIFETIME_MS = 24 * 60 * 60 * 1e3;
var DEFAULT_WP160_FEATURE_FLAGS = Object.freeze({
  "game-core-read": false,
  "game-core-write": false,
  "runtime-preview": false,
  "runtime-execution": false,
  "game-build": false,
  "game-build-cache": false,
  "game-publish": false
});

// src/audio/audio-200/contracts.ts
function audioOk(value, diagnostics = []) {
  return {
    ok: true,
    value,
    diagnostics
  };
}
function audioFail(code, message, path, recoverable = false) {
  const diagnostic = {
    code,
    message,
    ...path === void 0 ? {} : {
      path
    },
    recoverable
  };
  return {
    ok: false,
    diagnostics: [
      diagnostic
    ]
  };
}

// src/audio/audio-310/routing.ts
var AUXILIARY_KINDS = /* @__PURE__ */ new Set([
  "BUS",
  "RETURN"
]);
function invalid(message, path) {
  return audioFail("AUDIO_INVALID_MIXER", message, path);
}
function trackKind(tracksById, trackId) {
  return tracksById.get(trackId)?.kind;
}
function addEdge(outgoing, incoming, source, destination) {
  (outgoing.get(source) ?? outgoing.set(source, /* @__PURE__ */ new Set()).get(source)).add(destination);
  (incoming.get(destination) ?? incoming.set(destination, /* @__PURE__ */ new Set()).get(destination)).add(source);
}
function buildAudioRoutingGraph(mixer, tracks) {
  const tracksById = new Map(tracks.map((track) => [
    String(track.trackId),
    track
  ]));
  const outgoing = /* @__PURE__ */ new Map();
  const incoming = /* @__PURE__ */ new Map();
  const outputBySource = /* @__PURE__ */ new Map();
  const sendsBySource = /* @__PURE__ */ new Map();
  for (const track of tracks) {
    outputBySource.set(String(track.trackId), void 0);
    outgoing.set(String(track.trackId), /* @__PURE__ */ new Set());
    incoming.set(String(track.trackId), /* @__PURE__ */ new Set());
  }
  for (const channel of mixer.channels) {
    const sourceId = String(channel.trackId);
    if (!tracksById.has(sourceId)) {
      return invalid("Mixer channel source Track does not exist.", `mixer.channels.${String(channel.channelId)}.trackId`);
    }
    if (channel.outputTrackId !== void 0) {
      const destinationId = String(channel.outputTrackId);
      if (!tracksById.has(destinationId)) {
        return invalid("Mixer output destination Track does not exist.", `mixer.channels.${String(channel.channelId)}.outputTrackId`);
      }
      if (!AUXILIARY_KINDS.has(trackKind(tracksById, destinationId) ?? "")) {
        return invalid("Track output may target only a Bus or Return Track.", `mixer.channels.${String(channel.channelId)}.outputTrackId`);
      }
      if (destinationId === sourceId) {
        return invalid("A Track cannot route its output to itself.", `mixer.channels.${String(channel.channelId)}.outputTrackId`);
      }
      outputBySource.set(sourceId, destinationId);
      addEdge(outgoing, incoming, sourceId, destinationId);
    }
  }
  const sends = mixer.sends ?? [];
  const sendIds = /* @__PURE__ */ new Set();
  for (const send of sends) {
    const sendId = String(send.sendId);
    if (sendIds.has(sendId)) {
      return invalid("Mixer Send identifiers must be unique.", `mixer.sends.${sendId}`);
    }
    sendIds.add(sendId);
    const sourceId = String(send.sourceTrackId);
    const destinationId = String(send.destinationTrackId);
    if (!tracksById.has(sourceId) || !tracksById.has(destinationId)) {
      return invalid("Send source and destination Tracks must exist.", `mixer.sends.${sendId}`);
    }
    if (!AUXILIARY_KINDS.has(trackKind(tracksById, destinationId) ?? "")) {
      return invalid("Send destination must be a Bus or Return Track.", `mixer.sends.${sendId}.destinationTrackId`);
    }
    if (sourceId === destinationId) {
      return invalid("A Track cannot Send to itself.", `mixer.sends.${sendId}`);
    }
    if (!Number.isSafeInteger(send.amountMilliDb) || send.amountMilliDb < -12e4 || send.amountMilliDb > 24e3) {
      return invalid("Send amount is outside the bounded dB range.", `mixer.sends.${sendId}.amountMilliDb`);
    }
    if (typeof send.preFader !== "boolean") {
      return invalid("Send pre/post-fader flag must be boolean.", `mixer.sends.${sendId}.preFader`);
    }
    const existing = sendsBySource.get(sourceId) ?? [];
    sendsBySource.set(sourceId, [
      ...existing,
      send
    ]);
    addEdge(outgoing, incoming, sourceId, destinationId);
  }
  const visiting = /* @__PURE__ */ new Set();
  const visited = /* @__PURE__ */ new Set();
  const order = [];
  const visit = (trackId) => {
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
      return invalid("Mixer routing cycle detected; the graph was rejected fail-closed.", "mixer.routing");
    }
  }
  order.reverse();
  return audioOk({
    order,
    outputBySource,
    sendsBySource,
    incomingByTarget: new Map([
      ...incoming.entries()
    ].map(([key, value]) => [
      key,
      [
        ...value
      ]
    ])),
    outgoingBySource: new Map([
      ...outgoing.entries()
    ].map(([key, value]) => [
      key,
      [
        ...value
      ]
    ]))
  });
}
function buildProjectAudioRoutingGraph(project) {
  return buildAudioRoutingGraph(project.mixer, project.tracks);
}
function audioSendAmountToLinear(amountMilliDb) {
  const bounded = Math.min(24e3, Math.max(-12e4, amountMilliDb));
  return 10 ** (bounded / 2e4);
}
function effectiveAudioTrackAudibility(project, graph, respectMuteSolo = true) {
  const channels = new Map(project.mixer.channels.map((channel) => [
    String(channel.trackId),
    channel
  ]));
  const base = /* @__PURE__ */ new Map();
  const soloIds = /* @__PURE__ */ new Set();
  for (const track of project.tracks) {
    const channel = channels.get(String(track.trackId));
    const muted = track.muted || channel?.muted === true;
    base.set(String(track.trackId), !muted);
    if (track.solo || channel?.solo === true) {
      soloIds.add(String(track.trackId));
    }
  }
  if (!respectMuteSolo || soloIds.size === 0) return base;
  const connected = /* @__PURE__ */ new Map();
  for (const track of project.tracks) {
    connected.set(String(track.trackId), /* @__PURE__ */ new Set());
  }
  for (const [source, targets] of graph.outgoingBySource) {
    for (const target of targets) {
      connected.get(source)?.add(target);
      connected.get(target)?.add(source);
    }
  }
  const audibleBySolo = /* @__PURE__ */ new Set();
  const queue = [
    ...soloIds
  ];
  while (queue.length > 0) {
    const id = queue.shift();
    if (audibleBySolo.has(id)) continue;
    audibleBySolo.add(id);
    for (const neighbour of connected.get(id) ?? []) {
      if (!audibleBySolo.has(neighbour)) queue.push(neighbour);
    }
  }
  return new Map([
    ...base.entries()
  ].map(([id, audible]) => [
    id,
    audible && audibleBySolo.has(id)
  ]));
}
export {
  audioSendAmountToLinear,
  buildAudioRoutingGraph,
  buildProjectAudioRoutingGraph,
  effectiveAudioTrackAudibility
};
