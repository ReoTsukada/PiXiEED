/** Standard MIDI File (SMF) import/export for the Audio workspace. */

export interface StandardMidiNote {
  readonly channel: number;
  readonly pitchMidi: number;
  readonly startTick: number;
  readonly durationTick: number;
  readonly velocity: number;
  readonly releaseVelocity?: number;
}

export interface StandardMidiControlChange {
  readonly channel: number;
  readonly tick: number;
  readonly controller: number;
  readonly value: number;
}

export interface StandardMidiPitchBend {
  readonly channel: number;
  readonly tick: number;
  /** MIDI pitch-bend value in the canonical -8192..8191 range. */
  readonly value: number;
}

export interface StandardMidiTrack {
  readonly name: string;
  readonly channel: number;
  readonly program?: number;
  readonly notes: readonly StandardMidiNote[];
  readonly controlChanges?: readonly StandardMidiControlChange[];
  readonly pitchBends?: readonly StandardMidiPitchBend[];
}

export interface StandardMidiFile {
  readonly format: 0 | 1 | 2;
  readonly ticksPerQuarter: number;
  readonly tempoMilliBpm: number;
  readonly numerator: number;
  readonly denominator: number;
  readonly tracks: readonly StandardMidiTrack[];
}

export interface StandardMidiWriteTrack extends StandardMidiTrack {
  readonly instrumentName?: string;
}

export interface StandardMidiWriteOptions {
  readonly ticksPerQuarter: number;
  readonly tempoMilliBpm?: number;
  readonly numerator?: number;
  readonly denominator?: number;
  readonly tracks: readonly StandardMidiWriteTrack[];
}

const MAX_VARLEN = 0x0fffffff;

class MidiReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  get position(): number {
    return this.offset;
  }

  get remaining(): number {
    return this.bytes.length - this.offset;
  }

  seek(position: number): void {
    if (
      !Number.isSafeInteger(position) || position < 0 ||
      position > this.bytes.length
    ) {
      throw new RangeError("MIDI reader seek is outside the file.");
    }
    this.offset = position;
  }

  byte(): number {
    const value = this.bytes[this.offset++];
    if (value === undefined) {
      throw new RangeError("Unexpected end of MIDI file.");
    }
    return value;
  }

  bytesOf(length: number): Uint8Array {
    if (
      !Number.isSafeInteger(length) || length < 0 || this.remaining < length
    ) {
      throw new RangeError("MIDI chunk length exceeds the file.");
    }
    const result = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }

  uint16(): number {
    return (this.byte() << 8) | this.byte();
  }

  uint32(): number {
    return (this.byte() * 0x1000000) +
      (this.byte() << 16) +
      (this.byte() << 8) +
      this.byte();
  }

  text(length: number): string {
    return new TextDecoder().decode(this.bytesOf(length));
  }
}

function readVariableLength(reader: MidiReader): number {
  let value = 0;
  for (let count = 0; count < 4; count += 1) {
    const byte = reader.byte();
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return Math.min(MAX_VARLEN, value);
  }
  throw new RangeError("Invalid MIDI variable-length value.");
}

function boundedChannel(value: number): number {
  return Math.min(15, Math.max(0, Math.trunc(value)));
}

function boundedPitch(value: number): number {
  return Math.min(127, Math.max(0, Math.trunc(value)));
}

function boundedVelocity(value: number): number {
  return Math.min(127, Math.max(1, Math.trunc(value)));
}

function parseTrack(bytes: Uint8Array, trackIndex: number): {
  readonly track: StandardMidiTrack;
  readonly tempoMilliBpm?: number;
  readonly numerator?: number;
  readonly denominator?: number;
} {
  const reader = new MidiReader(bytes);
  let tick = 0;
  let runningStatus = 0;
  let trackName = `MIDI ${trackIndex + 1}`;
  let channel = 0;
  let program: number | undefined;
  let tempoMilliBpm: number | undefined;
  let numerator: number | undefined;
  let denominator: number | undefined;
  const notes: StandardMidiNote[] = [];
  const controls: StandardMidiControlChange[] = [];
  const pitchBends: StandardMidiPitchBend[] = [];
  const active = new Map<
    string,
    { readonly startTick: number; readonly velocity: number }[]
  >();

  const closeNote = (
    noteChannel: number,
    pitch: number,
    releaseVelocity: number,
  ): void => {
    const key = `${noteChannel}:${pitch}`;
    const pending = active.get(key);
    const start = pending?.pop();
    if (pending !== undefined && pending.length === 0) active.delete(key);
    if (start === undefined) return;
    notes.push({
      channel: noteChannel,
      pitchMidi: pitch,
      startTick: Math.max(0, start.startTick),
      durationTick: Math.max(1, tick - start.startTick),
      velocity: boundedVelocity(start.velocity),
      releaseVelocity: Math.min(127, Math.max(0, Math.trunc(releaseVelocity))),
    });
  };

  while (reader.remaining > 0) {
    tick += readVariableLength(reader);
    let status = reader.byte();
    if (status < 0x80) {
      if (runningStatus < 0x80) {
        throw new RangeError("MIDI running status is missing.");
      }
      reader.seek(reader.position - 1);
      status = runningStatus;
    } else if (status < 0xf0) {
      runningStatus = status;
    }

    if (status === 0xff) {
      const metaType = reader.byte();
      const length = readVariableLength(reader);
      const payload = reader.bytesOf(length);
      if (metaType === 0x2f) break;
      if (metaType === 0x03) {
        trackName = new TextDecoder().decode(payload).trim() || trackName;
      }
      if (metaType === 0x51 && payload.length === 3) {
        const microsPerQuarter = (payload[0]! << 16) | (payload[1]! << 8) |
          payload[2]!;
        if (microsPerQuarter > 0) {
          tempoMilliBpm = Math.round(60_000_000_000 / microsPerQuarter);
        }
      }
      if (metaType === 0x58 && payload.length >= 2) {
        numerator = payload[0]!;
        denominator = 2 ** payload[1]!;
      }
      continue;
    }
    if (status === 0xf0 || status === 0xf7) {
      const length = readVariableLength(reader);
      reader.bytesOf(length);
      continue;
    }
    if (status >= 0xf0) {
      // F1/F2/F3/F6 have one or two data bytes; realtime/status bytes are
      // ignored. They do not affect note timing or the canonical project.
      if (status === 0xf1 || status === 0xf3 || status === 0xf6) reader.byte();
      if (status === 0xf2) {
        reader.byte();
        reader.byte();
      }
      continue;
    }

    const eventType = status & 0xf0;
    channel = status & 0x0f;
    if (eventType === 0xc0 || eventType === 0xd0) {
      const value = reader.byte();
      if (eventType === 0xc0) program = value & 0x7f;
      continue;
    }
    const first = reader.byte();
    const second = reader.byte();
    if (eventType === 0x80) {
      closeNote(channel, boundedPitch(first), second);
    } else if (eventType === 0x90) {
      const pitch = boundedPitch(first);
      if (second === 0) {
        closeNote(channel, pitch, 0);
      } else {
        const key = `${channel}:${pitch}`;
        const pending = active.get(key) ?? [];
        pending.push({ startTick: tick, velocity: second });
        active.set(key, pending);
      }
    } else if (eventType === 0xb0) {
      controls.push({
        channel,
        tick,
        controller: first & 0x7f,
        value: second & 0x7f,
      });
    } else if (eventType === 0xe0) {
      pitchBends.push({
        channel,
        tick,
        value: ((second & 0x7f) << 7 | (first & 0x7f)) - 8192,
      });
    }
  }

  // A malformed or truncated file should still import the notes that began
  // before the end marker. Give them a one-tick tail instead of dropping them.
  for (const [key, pending] of active) {
    const [channelValue, pitchValue] = key.split(":").map(Number);
    for (const start of pending) {
      notes.push({
        channel: boundedChannel(channelValue ?? 0),
        pitchMidi: boundedPitch(pitchValue ?? 60),
        startTick: start.startTick,
        durationTick: Math.max(1, tick - start.startTick),
        velocity: boundedVelocity(start.velocity),
      });
    }
  }
  notes.sort((left, right) =>
    left.startTick - right.startTick || left.pitchMidi - right.pitchMidi
  );
  controls.sort((left, right) => left.tick - right.tick);
  pitchBends.sort((left, right) => left.tick - right.tick);
  return {
    track: {
      name: trackName,
      channel: boundedChannel(channel),
      ...(program === undefined ? {} : { program }),
      notes,
      ...(controls.length === 0 ? {} : { controlChanges: controls }),
      ...(pitchBends.length === 0 ? {} : { pitchBends }),
    },
    ...(tempoMilliBpm === undefined ? {} : { tempoMilliBpm }),
    ...(numerator === undefined ? {} : { numerator }),
    ...(denominator === undefined ? {} : { denominator }),
  };
}

/** Parse a format-0/1/2 Standard MIDI File without external dependencies. */
export function parseStandardMidi(
  input: ArrayBuffer | Uint8Array,
): StandardMidiFile {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const reader = new MidiReader(bytes);
  if (reader.text(4) !== "MThd") {
    throw new RangeError("Not a Standard MIDI File.");
  }
  const headerLength = reader.uint32();
  if (headerLength < 6) throw new RangeError("MIDI header is too short.");
  const formatValue = reader.uint16();
  if (formatValue > 2) throw new RangeError("Unsupported MIDI format.");
  const trackCount = reader.uint16();
  const division = reader.uint16();
  if ((division & 0x8000) !== 0) {
    throw new RangeError("SMPTE MIDI timing is not supported.");
  }
  if (headerLength > 6) reader.bytesOf(headerLength - 6);
  const tracks: StandardMidiTrack[] = [];
  let tempoMilliBpm = 120_000;
  let numerator = 4;
  let denominator = 4;
  for (let index = 0; index < trackCount; index += 1) {
    if (reader.remaining < 8 || reader.text(4) !== "MTrk") {
      throw new RangeError("MIDI track chunk is missing.");
    }
    const length = reader.uint32();
    const parsed = parseTrack(reader.bytesOf(length), index);
    tracks.push(parsed.track);
    if (parsed.tempoMilliBpm !== undefined && tempoMilliBpm === 120_000) {
      tempoMilliBpm = parsed.tempoMilliBpm;
    }
    if (parsed.numerator !== undefined) numerator = parsed.numerator;
    if (parsed.denominator !== undefined) denominator = parsed.denominator;
  }
  return {
    format: formatValue as 0 | 1 | 2,
    ticksPerQuarter: Math.max(1, division & 0x7fff),
    tempoMilliBpm,
    numerator,
    denominator,
    tracks,
  };
}

function pushUint16(target: number[], value: number): void {
  target.push((value >>> 8) & 0xff, value & 0xff);
}

function pushUint32(target: number[], value: number): void {
  target.push(
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  );
}

function writeVariableLength(value: number): number[] {
  let remaining = Math.min(MAX_VARLEN, Math.max(0, Math.trunc(value)));
  const bytes = [remaining & 0x7f];
  while ((remaining >>= 7) > 0) bytes.unshift((remaining & 0x7f) | 0x80);
  return bytes;
}

function writeTrack(
  events: readonly {
    readonly tick: number;
    readonly order: number;
    readonly bytes: readonly number[];
  }[],
): Uint8Array {
  const sorted = [...events].sort((left, right) =>
    left.tick - right.tick || left.order - right.order
  );
  const body: number[] = [];
  let previousTick = 0;
  for (const event of sorted) {
    const tick = Math.max(previousTick, Math.trunc(event.tick));
    body.push(...writeVariableLength(tick - previousTick), ...event.bytes);
    previousTick = tick;
  }
  body.push(0x00, 0xff, 0x2f, 0x00);
  const chunk: number[] = [0x4d, 0x54, 0x72, 0x6b];
  pushUint32(chunk, body.length);
  chunk.push(...body);
  return new Uint8Array(chunk);
}

function programForTrack(track: StandardMidiWriteTrack): number | undefined {
  if (track.program === undefined) return undefined;
  return Math.min(127, Math.max(0, Math.trunc(track.program)));
}

/** Encode project notes/events as a format-1 Standard MIDI File. */
export function writeStandardMidi(
  options: StandardMidiWriteOptions,
): Uint8Array {
  const ppq = Math.min(
    0x7fff,
    Math.max(1, Math.trunc(options.ticksPerQuarter)),
  );
  const tempoMilliBpm = Math.min(
    300_000,
    Math.max(20_000, Math.round(options.tempoMilliBpm ?? 120_000)),
  );
  const microsPerQuarter = Math.max(
    1,
    Math.round(60_000_000_000 / tempoMilliBpm),
  );
  const numerator = Math.min(
    32,
    Math.max(1, Math.trunc(options.numerator ?? 4)),
  );
  const denominatorValue = Math.min(
    8,
    Math.max(0, Math.round(Math.log2(Math.max(1, options.denominator ?? 4)))),
  );
  const tempoTrackName = new TextEncoder().encode("PiXiEED Audio");
  const tempoTrackEvents: {
    readonly tick: number;
    readonly order: number;
    readonly bytes: readonly number[];
  }[] = [
    {
      tick: 0,
      order: 0,
      bytes: [0xff, 0x03, tempoTrackName.length, ...tempoTrackName],
    },
    {
      tick: 0,
      order: 1,
      bytes: [
        0xff,
        0x51,
        0x03,
        (microsPerQuarter >>> 16) & 0xff,
        (microsPerQuarter >>> 8) & 0xff,
        microsPerQuarter & 0xff,
      ],
    },
    {
      tick: 0,
      order: 2,
      bytes: [0xff, 0x58, 0x04, numerator, denominatorValue, 24, 8],
    },
  ];
  const trackChunks = [writeTrack(tempoTrackEvents)];
  for (const track of options.tracks) {
    const events: {
      readonly tick: number;
      readonly order: number;
      readonly bytes: readonly number[];
    }[] = [];
    const channel = boundedChannel(track.channel);
    const program = programForTrack(track);
    if (track.name.trim()) {
      const encoded = new TextEncoder().encode(track.name.trim()).slice(0, 120);
      events.push({
        tick: 0,
        order: 0,
        bytes: [0xff, 0x03, encoded.length, ...encoded],
      });
    }
    if (program !== undefined) {
      events.push({ tick: 0, order: 1, bytes: [0xc0 | channel, program] });
    }
    for (const control of track.controlChanges ?? []) {
      events.push({
        tick: Math.max(0, Math.trunc(control.tick)),
        order: 2,
        bytes: [
          0xb0 | boundedChannel(control.channel),
          Math.min(127, Math.max(0, Math.trunc(control.controller))),
          Math.min(127, Math.max(0, Math.trunc(control.value))),
        ],
      });
    }
    for (const bend of track.pitchBends ?? []) {
      const value = Math.min(
        16_383,
        Math.max(0, Math.trunc(bend.value) + 8_192),
      );
      events.push({
        tick: Math.max(0, Math.trunc(bend.tick)),
        order: 2,
        bytes: [
          0xe0 | boundedChannel(bend.channel),
          value & 0x7f,
          (value >>> 7) & 0x7f,
        ],
      });
    }
    for (const note of track.notes) {
      const start = Math.max(0, Math.trunc(note.startTick));
      const end = start + Math.max(1, Math.trunc(note.durationTick));
      const noteChannel = boundedChannel(note.channel);
      events.push({
        tick: start,
        order: 3,
        bytes: [
          0x90 | noteChannel,
          boundedPitch(note.pitchMidi),
          boundedVelocity(note.velocity),
        ],
      });
      events.push({
        tick: end,
        order: 1,
        bytes: [
          0x80 | noteChannel,
          boundedPitch(note.pitchMidi),
          Math.min(127, Math.max(0, Math.trunc(note.releaseVelocity ?? 0))),
        ],
      });
    }
    trackChunks.push(writeTrack(events));
  }
  const file: number[] = [0x4d, 0x54, 0x68, 0x64];
  pushUint32(file, 6);
  pushUint16(file, 1);
  pushUint16(file, trackChunks.length);
  pushUint16(file, ppq);
  for (const chunk of trackChunks) file.push(...chunk);
  return new Uint8Array(file);
}
