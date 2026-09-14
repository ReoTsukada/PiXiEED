import {
  asAudioCommandId,
  asAudioProjectId,
  AUDIO_DEFAULT_MUSICAL_CONTEXT,
  AUDIO_MUSICAL_KEYS,
  AUDIO_MUSICAL_SCALE_IDS,
  createAudioJournal,
  createAudioProject,
  dispatchAudioCommand,
} from "../../src/audio/audio-200/index.ts";
import {
  audioMusicalKeyPitchClass,
  audioMusicalPitchForInput,
  audioMusicalScaleDefinition,
  audioMusicalScalePitchClasses,
  isAudioPitchInMusicalScale,
  snapAudioPitchToMusicalScale,
} from "../../src/audio/audio-240/musical-context.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("Audio musical context supports every key and configured scale", () => {
  assert(
    AUDIO_MUSICAL_KEYS.length === 12,
    "all twelve pitch classes are required",
  );
  assert(
    AUDIO_MUSICAL_SCALE_IDS.length >= 13,
    "common scale families are required",
  );
  for (const key of AUDIO_MUSICAL_KEYS) {
    for (const scale of AUDIO_MUSICAL_SCALE_IDS) {
      const context = { key, scale } as const;
      const classes = audioMusicalScalePitchClasses(context);
      assert(classes.size > 0, `${key} ${scale} must contain notes`);
      assert(
        classes.has(audioMusicalKeyPitchClass(key)),
        `${key} ${scale} must contain its root`,
      );
      assert(
        audioMusicalScaleDefinition(scale).id === scale,
        `${scale} must resolve to its definition`,
      );
    }
  }
});

Deno.test("Audio musical context provides readable minor guidance and deterministic snapping", () => {
  const context = { key: "C", scale: "minor" } as const;
  assert(isAudioPitchInMusicalScale(60, context), "C must be in C minor");
  assert(isAudioPitchInMusicalScale(63, context), "D# must be in C minor");
  assert(!isAudioPitchInMusicalScale(61, context), "C# must not be in C minor");
  assert(
    snapAudioPitchToMusicalScale(61, context, 21, 108) === 60,
    "a tie between C and D must prefer the lower pitch",
  );
  assert(
    audioMusicalScalePitchClasses({ key: "C", scale: "chromatic" }).size === 12,
    "chromatic mode must allow every pitch class",
  );
  assert(
    audioMusicalPitchForInput(61, context, "DISPLAY", 21, 108) === 61,
    "Guide mode must preserve the clicked pitch",
  );
  assert(
    audioMusicalPitchForInput(61, context, "SNAP", 21, 108) === 60,
    "Snap mode must move a new pitch into the selected scale",
  );
  assert(
    audioMusicalPitchForInput(61, context, "RESTRICT", 21, 108) === undefined,
    "Lock mode must reject a new pitch outside the selected scale",
  );
});

Deno.test("Audio project persists key and scale as one journal command", async () => {
  const created = await createAudioProject({
    projectId: asAudioProjectId("musical-context-project"),
    name: "Musical Context",
    createdAt: "2026-09-13T00:00:00.000Z",
  });
  assert(created.ok, JSON.stringify(created.diagnostics));
  assert(
    created.value.musicalContext?.key === AUDIO_DEFAULT_MUSICAL_CONTEXT.key &&
      created.value.musicalContext?.scale ===
        AUDIO_DEFAULT_MUSICAL_CONTEXT.scale,
    "new Audio projects must start with an explicit musical context",
  );
  const journal = await createAudioJournal(created.value);
  assert(journal.ok, JSON.stringify(journal.diagnostics));
  const updated = await dispatchAudioCommand(journal.value, {
    commandId: asAudioCommandId("command-musical-context"),
    idempotencyKey: "command-musical-context",
    projectId: created.value.projectId,
    baseProjectRevision: created.value.projectRevision,
    type: "MUSICAL_CONTEXT_SET",
    payload: { musicalContext: { key: "F♯", scale: "dorian" } },
    issuedAt: "2026-09-13T00:00:00.000Z",
  });
  assert(updated.ok, JSON.stringify(updated.diagnostics));
  assert(
    updated.value.project.musicalContext?.key === "F♯" &&
      updated.value.project.musicalContext?.scale === "dorian",
    "the journal command must persist the selected key and scale",
  );
});
