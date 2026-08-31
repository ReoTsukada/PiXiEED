import { strict as assert } from "node:assert";
import {
  appendJournalCommand,
  asOwnerId,
  asProjectId,
  asRevisionId,
  createGameProject,
  createJournal,
  type CallerContext,
  type GameProject,
} from "../../src/game/game-300/core.ts";
import type { GameApplyReceipt } from "../../src/pixync/adapters.ts";
import {
  PixyncGameProductBridge,
  PixyncGameProductBridgeError,
  type PixyncGameProductSnapshot,
} from "../../src/pixync/game-product-bridge.ts";
import type { PixyncOperationDraft } from "../../src/pixync/contracts.ts";
import type { PixyncTransportBinding } from "../../src/pixync/transport.ts";

const PROJECT = "game-product-270";
const ACTOR = "actor-270";
const CLIENT = "client-270";

function caller(project: GameProject): CallerContext {
  return {
    projectId: project.projectId,
    ownerId: project.ownerId,
    revisionId: project.revision.revisionId,
  };
}

async function fixture() {
  const projectId = asProjectId(PROJECT);
  const ownerId = asOwnerId("owner-270");
  const revision1 = asRevisionId("game-revision-1");
  const revision2 = asRevisionId("game-revision-2");
  const base = {
    schemaVersion: 1 as const,
    projectId,
    ownerId,
    name: "Game 270",
    scenes: [],
    prefabs: [],
    dependencies: [],
    behaviors: [],
  };
  const initial = await createGameProject({
    ...base,
    revision: {
      revisionId: revision1,
      projectId,
      ownerId,
      sequence: 1,
    },
  }, { projectId, ownerId, revisionId: revision1 });
  const next = await createGameProject({
    ...base,
    name: "Game 270 next",
    revision: {
      revisionId: revision2,
      projectId,
      ownerId,
      sequence: 2,
      parentRevisionId: revision1,
    },
  }, { projectId, ownerId, revisionId: revision2 });
  const journal = await appendJournalCommand(
    createJournal(initial, caller(initial)),
    next,
    caller(next),
    "game-command-270",
  );
  return { initial, next, command: journal.past.at(-1)! };
}

function binding(role: PixyncTransportBinding["role"] = "editor") {
  return {
    projectId: PROJECT,
    roomId: "room-270",
    actorId: ACTOR,
    clientId: CLIENT,
    role,
    sessionGeneration: 4,
  } satisfies PixyncTransportBinding;
}

Deno.test("PIXYNC-DRAW2-270 submits Game after unrelated Draw and Audio revisions", async () => {
  const value = await fixture();
  let submitted: PixyncOperationDraft | undefined;
  const notices: unknown[] = [];
  const bridge = new PixyncGameProductBridge({
    transport: {
      binding: binding(),
      snapshot: () => ({
        projectId: PROJECT,
        projectRevision: 8,
        aggregateRevisions: { draw: 4, audio: 3, game: 1 },
      }),
      submit: async (draft) => {
        submitted = draft;
        const operation = {
          ...draft,
          projectRevision: 9,
          aggregateRevision: 2,
          committedAt: "2026-08-24T00:00:00.000Z",
        };
        return {
          kind: "COMMITTED",
          operationId: draft.operationId,
          projectId: draft.projectId,
          projectRevision: 9,
          aggregateRevision: 2,
          submissionFingerprint: "submission",
          committedFingerprint: "committed",
          operation,
        };
      },
    },
    state: {
      preservesLocalHistory: true,
      current: () => ({}) as PixyncGameProductSnapshot,
      resolveCanonicalRevision: async () => undefined,
      appendRemoteJournalCommand: async () => ({}) as GameApplyReceipt,
    },
    onInvalidation: (notice) => notices.push(notice),
  });
  await bridge.submitLocal(value.command);
  assert.equal(submitted?.baseProjectRevision, 8);
  assert.equal(submitted?.aggregateRevision, 1);
  assert.equal(notices.length, 1);
});

Deno.test("PIXYNC-DRAW2-270 rejects viewer Game submission", async () => {
  const value = await fixture();
  const bridge = new PixyncGameProductBridge({
    transport: {
      binding: binding("viewer"),
      snapshot: () => ({
        projectId: PROJECT,
        projectRevision: 0,
        aggregateRevisions: { draw: 0, audio: 0, game: 0 },
      }),
      submit: async () => {
        throw new Error("must not submit");
      },
    },
    state: {
      preservesLocalHistory: true,
      current: () => ({}) as PixyncGameProductSnapshot,
      resolveCanonicalRevision: async () => undefined,
      appendRemoteJournalCommand: async () => ({}) as GameApplyReceipt,
    },
    onInvalidation: () => {},
  });
  await assert.rejects(
    () => bridge.submitLocal(value.command),
    (error) =>
      error instanceof PixyncGameProductBridgeError &&
      error.code === "ROLE_FORBIDDEN",
  );
});
