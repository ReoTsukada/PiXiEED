import { strict as assert } from "node:assert";
import {
  asAudioCommandId,
  asAudioProjectId,
  type AudioJournalEntry,
} from "../../src/audio/audio-200/contracts.ts";
import {
  type AudioJournalState,
  createAudioJournal,
  dispatchAudioCommand,
} from "../../src/audio/audio-200/journal.ts";
import { createAudioProject } from "../../src/audio/audio-200/state.ts";
import {
  audioChangedAssetIds,
  PixyncAudioProductBridge,
  PixyncAudioProductBridgeError,
  type PixyncAudioProductStatePort,
} from "../../src/pixync/audio-product-bridge.ts";
import type { PixyncOperationDraft } from "../../src/pixync/contracts.ts";
import {
  committedOperationFingerprint,
  operationFingerprint,
} from "../../src/pixync/core.ts";
import type {
  PixyncTransportAck,
  PixyncTransportBinding,
} from "../../src/pixync/transport.ts";

const PROJECT = "audio-product-250";
const ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENT = "client-250";
const binding: PixyncTransportBinding = {
  projectId: PROJECT,
  roomId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  actorId: ACTOR,
  clientId: CLIENT,
  role: "editor",
  sessionGeneration: 4,
};

async function fixture(): Promise<{
  initial: AudioJournalState;
  local: AudioJournalState;
  entry: AudioJournalEntry;
}> {
  const project = await createAudioProject({
    projectId: asAudioProjectId(PROJECT),
    name: "Audio product bridge",
    createdAt: "2026-08-23T00:00:00.000Z",
  });
  assert.equal(project.ok, true);
  const initial = await createAudioJournal(project.value);
  assert.equal(initial.ok, true);
  const local = await dispatchAudioCommand(initial.value, {
    commandId: asAudioCommandId("tempo-250"),
    idempotencyKey: "tempo-250",
    projectId: project.value.projectId,
    baseProjectRevision: project.value.projectRevision,
    type: "TEMPO_SET",
    payload: { tempo: { milliBpm: 128_000 } },
    issuedAt: "2026-08-23T00:00:01.000Z",
  });
  assert.equal(local.ok, true);
  return {
    initial: initial.value,
    local: local.value,
    entry: local.value.entries.at(-1)!,
  };
}

async function ack(draft: PixyncOperationDraft): Promise<PixyncTransportAck> {
  const projectRevision = draft.baseProjectRevision + 1;
  const operation = {
    ...draft,
    projectRevision,
    aggregateRevision: draft.aggregateRevision + 1,
    committedAt: "2026-08-23T00:00:02.000Z",
  };
  return {
    kind: "COMMITTED",
    operationId: draft.operationId,
    projectId: draft.projectId,
    projectRevision,
    aggregateRevision: operation.aggregateRevision,
    operation,
    submissionFingerprint: await operationFingerprint(draft),
    committedFingerprint: await committedOperationFingerprint(operation),
  };
}

function transport(submitted: PixyncOperationDraft[], role = binding.role) {
  return {
    binding: { ...binding, role },
    snapshot: () => ({
      projectId: PROJECT,
      projectRevision: 9,
      aggregateRevisions: { draw: 7, audio: 1, game: 1 },
    }),
    submit: async (draft: PixyncOperationDraft) => {
      submitted.push(draft);
      return ack(draft);
    },
  };
}

function statePort(initial: AudioJournalState): PixyncAudioProductStatePort & {
  journal: AudioJournalState;
  applies: number;
} {
  return {
    preservesLocalHistory: true,
    journal: initial,
    applies: 0,
    current() {
      return {
        project: this.journal.project,
        undoDepth: 3,
        redoDepth: 2,
        appliedEntryIds: this.journal.entries.map((entry) =>
          String(entry.entryId)
        ),
      };
    },
    async applyRemote(input) {
      this.applies += 1;
      const applied = await dispatchAudioCommand(this.journal, input.command);
      assert.equal(applied.ok, true);
      this.journal = applied.value;
      return {
        operationId: input.operation.operationId,
        projectId: input.operation.projectId,
        actorId: input.operation.actorId,
        clientId: input.operation.clientId,
        clientSequence: input.operation.clientSequence,
        baseProjectRevision: input.operation.baseProjectRevision,
        stateHash: String(this.journal.project.stateHash),
        projectRevision: this.journal.project.projectRevision,
      };
    },
  };
}

Deno.test("PIXYNC-DRAW2-250 submits Audio after unrelated Draw revisions", async () => {
  const data = await fixture();
  const submitted: PixyncOperationDraft[] = [];
  const notices: unknown[] = [];
  const bridge = new PixyncAudioProductBridge({
    transport: transport(submitted),
    state: statePort(data.local),
    onInvalidation: (notice) => notices.push(notice),
  });
  const result = await bridge.submitLocal(data.entry);
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0]?.baseProjectRevision, 9);
  assert.equal(
    submitted[0]?.payload.command &&
      (submitted[0]?.payload.command as { baseProjectRevision: number })
        .baseProjectRevision,
    0,
  );
  assert.equal(result.invalidation.aggregateRevision, 2);
  assert.equal(notices.length, 1);
});

Deno.test("PIXYNC-DRAW2-250 remote Audio apply preserves local history", async () => {
  const data = await fixture();
  const submitted: PixyncOperationDraft[] = [];
  const source = new PixyncAudioProductBridge({
    transport: transport(submitted),
    state: statePort(data.local),
    onInvalidation: () => undefined,
  });
  const sent = await source.submitLocal(data.entry);
  const targetState = statePort(data.initial);
  const notices: unknown[] = [];
  const target = new PixyncAudioProductBridge({
    transport: transport([]),
    state: targetState,
    onInvalidation: (notice) => notices.push(notice),
  });
  await target.adapter.apply(sent.ack.operation, {
    source: "remote",
    projectRevision: sent.ack.operation.projectRevision,
    aggregateRevision: sent.ack.operation.aggregateRevision,
  });
  assert.equal(targetState.applies, 1);
  assert.equal(
    targetState.journal.project.stateHash,
    data.local.project.stateHash,
  );
  assert.equal(notices.length, 1);
});

Deno.test("PIXYNC-DRAW2-250 rejects viewer Audio submission", async () => {
  const data = await fixture();
  const bridge = new PixyncAudioProductBridge({
    transport: transport([], "viewer"),
    state: statePort(data.local),
    onInvalidation: () => undefined,
  });
  await assert.rejects(
    () => bridge.submitLocal(data.entry),
    (error) =>
      error instanceof PixyncAudioProductBridgeError &&
      error.code === "ROLE_FORBIDDEN",
  );
});

Deno.test("PIXYNC-DRAW2-250 uses bounded IDs and full refresh for ambiguous edits", async () => {
  const data = await fixture();
  assert.deepEqual(audioChangedAssetIds(data.entry.command), {
    ids: [`audio-project:${PROJECT}`],
    fullRefresh: false,
  });
  const ambiguous = {
    ...data.entry.command,
    type: "CLIP_REMOVE" as const,
    payload: { clipId: "clip:missing-context" as never },
  };
  assert.equal(audioChangedAssetIds(ambiguous).fullRefresh, true);
});
