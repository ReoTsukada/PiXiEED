/** Authenticated server revision store used by metadata-only Game operations. */
import {
  createGameProject,
  type CallerContext,
  type GameProject,
} from "../game/game-300/core.ts";
import type { PixyncSupabaseSdkClient } from "./supabase-sdk-port.ts";
import type { PixyncTransportBinding } from "./transport.ts";

export class PixyncGameRevisionRemoteStore {
  readonly #client: PixyncSupabaseSdkClient;
  readonly #binding: () => PixyncTransportBinding | undefined;

  constructor(
    client: PixyncSupabaseSdkClient,
    binding: () => PixyncTransportBinding | undefined,
  ) {
    this.#client = client;
    this.#binding = binding;
  }

  async put(project: GameProject): Promise<void> {
    const binding = this.#requireBinding();
    if (String(project.projectId) !== binding.projectId) {
      throw new Error("Game revision belongs to another PiXYNC project.");
    }
    const result = await this.#client.rpc(
      "pixync_draw2_put_game_revision_v1",
      {
        p_project_id: binding.projectId,
        p_client_id: binding.clientId,
        p_session_generation: binding.sessionGeneration,
        p_snapshot_hash: String(project.revision.snapshotHash),
        p_revision_id: String(project.revision.revisionId),
        p_sequence: project.revision.sequence,
        p_game_project: project,
      },
    );
    if (result.error !== null) throw result.error;
  }

  async get(
    snapshotHash: string,
    revisionId: string,
  ): Promise<GameProject | undefined> {
    const binding = this.#requireBinding();
    const result = await this.#client.rpc(
      "pixync_draw2_get_game_revision_v1",
      {
        p_project_id: binding.projectId,
        p_client_id: binding.clientId,
        p_session_generation: binding.sessionGeneration,
        p_snapshot_hash: snapshotHash,
        p_revision_id: revisionId,
      },
    );
    if (result.error !== null) throw result.error;
    if (result.data === null || typeof result.data !== "object") return undefined;
    const candidate = result.data as GameProject;
    if (
      String(candidate.projectId) !== binding.projectId ||
      String(candidate.revision.snapshotHash) !== snapshotHash ||
      String(candidate.revision.revisionId) !== revisionId
    ) throw new Error("Server returned a mismatched Game revision.");
    const { snapshotHash: _snapshotHash, ...revision } = candidate.revision;
    const caller: CallerContext = {
      projectId: candidate.projectId,
      ownerId: candidate.ownerId,
      revisionId: candidate.revision.revisionId,
    };
    const verified = await createGameProject(
      { ...candidate, revision },
      caller,
    );
    if (verified.revision.snapshotHash !== candidate.revision.snapshotHash) {
      throw new Error("Server Game revision failed canonical hash verification.");
    }
    return candidate;
  }

  #requireBinding(): PixyncTransportBinding {
    const binding = this.#binding();
    if (binding === undefined) throw new Error("PiXYNC session is unavailable.");
    return binding;
  }
}
