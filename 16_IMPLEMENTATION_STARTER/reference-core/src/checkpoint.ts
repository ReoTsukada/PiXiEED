import { sha256Hex } from "./canonical-json.js";
import type { ProjectState } from "./types.js";

export interface Checkpoint {
  readonly checkpointVersion: 1;
  readonly projectId: string;
  readonly stateHash: string;
  readonly journalLength: number;
  readonly lastOperationId: string | null;
  readonly state: ProjectState;
}

export async function createCheckpoint(
  state: Readonly<ProjectState>,
  journalLength: number,
  lastOperationId: string | null
): Promise<Checkpoint> {
  const clonedState = structuredClone(state) as ProjectState;
  return {
    checkpointVersion: 1,
    projectId: state.projectId,
    stateHash: await sha256Hex(clonedState),
    journalLength,
    lastOperationId,
    state: clonedState,
  };
}

export async function validateCheckpoint(
  checkpoint: Readonly<Checkpoint>
): Promise<{
  readonly ok: boolean;
  readonly error?: string;
}> {
  if (checkpoint.checkpointVersion !== 1) {
    return {
      ok: false,
      error: `Unsupported checkpoint version: ${String(checkpoint.checkpointVersion)}.`,
    };
  }

  if (checkpoint.projectId !== checkpoint.state.projectId) {
    return {
      ok: false,
      error: "Checkpoint project ID does not match the embedded state.",
    };
  }

  if (!Number.isSafeInteger(checkpoint.journalLength) || checkpoint.journalLength < 0) {
    return {
      ok: false,
      error: "Checkpoint journal length is invalid.",
    };
  }

  const actualHash = await sha256Hex(checkpoint.state);
  if (actualHash !== checkpoint.stateHash) {
    return {
      ok: false,
      error: "Checkpoint state hash mismatch.",
    };
  }

  return { ok: true };
}
