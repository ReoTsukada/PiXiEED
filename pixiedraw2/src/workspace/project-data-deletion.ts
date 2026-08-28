/// <reference lib="dom" />

/**
 * Project-local data deletion boundary for the integrated Draw2 workspace.
 *
 * The parent Project manifest is deliberately cleared last. If any module
 * cannot be removed, the manifest remains as a retry pointer and the recent
 * project card is not allowed to disappear. Remote PiXYNC room detachment is
 * not performed here; callers must complete that authority-bound operation
 * before invoking this local cleanup.
 */

import {
  asWorkspaceProjectId,
  type WorkspaceProjectId,
} from "./project-manifest.ts";

export type WorkspaceProjectDataStep =
  | "draw"
  | "audio"
  | "game"
  | "pixync"
  | "manifest";

export interface WorkspaceProjectDataClearPort {
  clear(projectId: WorkspaceProjectId): Promise<boolean>;
}

export interface WorkspaceProjectDataDeletionPorts {
  readonly draw: WorkspaceProjectDataClearPort;
  readonly audio: WorkspaceProjectDataClearPort;
  readonly game: WorkspaceProjectDataClearPort;
  readonly pixync: WorkspaceProjectDataClearPort;
  readonly manifest: WorkspaceProjectDataClearPort;
}

export interface WorkspaceProjectDataDeletionResult {
  readonly ok: boolean;
  readonly projectId: WorkspaceProjectId;
  readonly cleared: readonly WorkspaceProjectDataStep[];
  readonly failed: readonly WorkspaceProjectDataStep[];
}

const MODULE_STEPS: readonly WorkspaceProjectDataStep[] = [
  "draw",
  "audio",
  "game",
  "pixync",
];

export async function deleteWorkspaceProjectLocalData(
  projectId: string,
  ports: WorkspaceProjectDataDeletionPorts,
): Promise<WorkspaceProjectDataDeletionResult> {
  const normalizedProjectId = asWorkspaceProjectId(projectId);
  const cleared: WorkspaceProjectDataStep[] = [];
  const failed: WorkspaceProjectDataStep[] = [];

  for (const step of MODULE_STEPS) {
    try {
      const removed = await ports[step].clear(normalizedProjectId);
      if (removed === true) cleared.push(step);
      else failed.push(step);
    } catch {
      failed.push(step);
    }
  }

  if (failed.length === 0) {
    try {
      const removed = await ports.manifest.clear(normalizedProjectId);
      if (removed === true) cleared.push("manifest");
      else failed.push("manifest");
    } catch {
      failed.push("manifest");
    }
  }

  return {
    ok: failed.length === 0,
    projectId: normalizedProjectId,
    cleared,
    failed,
  };
}
