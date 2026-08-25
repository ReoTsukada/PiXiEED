import {
  parseStandardMidi,
  writeStandardMidi,
} from "../../src/audio/audio-240/midi-file.ts";

Deno.test("Standard MIDI writer round-trips notes, tempo and expression events", () => {
  const bytes = writeStandardMidi({
    ticksPerQuarter: 480,
    tempoMilliBpm: 128_000,
    numerator: 3,
    denominator: 4,
    tracks: [{
      name: "Chip Lead",
      channel: 2,
      program: 80,
      notes: [{
        channel: 2,
        pitchMidi: 72,
        startTick: 480,
        durationTick: 240,
        velocity: 110,
        releaseVelocity: 44,
      }],
      controlChanges: [{ channel: 2, tick: 480, controller: 1, value: 64 }],
      pitchBends: [{ channel: 2, tick: 600, value: -256 }],
    }],
  });
  const parsed = parseStandardMidi(bytes);
  if (
    parsed.format !== 1 || parsed.ticksPerQuarter !== 480 ||
    parsed.tempoMilliBpm !== 128_000 || parsed.numerator !== 3 ||
    parsed.denominator !== 4
  ) throw new Error("MIDI header/meta events did not round-trip");
  const track = parsed.tracks[1];
  const note = track?.notes[0];
  const control = track?.controlChanges?.[0];
  const bend = track?.pitchBends?.[0];
  if (
    track === undefined || note === undefined || control === undefined ||
    bend === undefined || note.pitchMidi !== 72 || note.startTick !== 480 ||
    note.durationTick !== 240 || note.velocity !== 110 ||
    control.controller !== 1 || control.value !== 64 || bend.value !== -256
  ) throw new Error("MIDI note/expression events did not round-trip");
});

Deno.test("Standard MIDI parser closes running-status notes at track end", () => {
  const bytes = new Uint8Array([
    0x4d,
    0x54,
    0x68,
    0x64,
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    1,
    1,
    0,
    0x4d,
    0x54,
    0x72,
    0x6b,
    0,
    0,
    0,
    8,
    0,
    0x90,
    60,
    100,
    60,
    0x80,
    60,
    0,
  ]);
  const parsed = parseStandardMidi(bytes);
  const note = parsed.tracks[0]?.notes[0];
  if (note === undefined || note.pitchMidi !== 60 || note.durationTick < 1) {
    throw new Error("MIDI parser did not close the note");
  }
});
