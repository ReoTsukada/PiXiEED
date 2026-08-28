import {
  deleteWorkspaceProjectLocalData,
  type WorkspaceProjectDataStep,
} from "../../src/workspace/project-data-deletion.ts";
import { asWorkspaceProjectId } from "../../src/workspace/project-manifest.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function createPorts(
  calls: WorkspaceProjectDataStep[],
  failing: ReadonlySet<WorkspaceProjectDataStep> = new Set(),
) {
  const port = (step: WorkspaceProjectDataStep) => ({
    clear: async (projectId: ReturnType<typeof asWorkspaceProjectId>) => {
      assert(projectId === "workspace:delete-test", "Project ID was not preserved.");
      calls.push(step);
      return !failing.has(step);
    },
  });
  return {
    draw: port("draw"),
    audio: port("audio"),
    game: port("game"),
    pixync: port("pixync"),
    manifest: port("manifest"),
  };
}

Deno.test("PROJECT-DATA-DELETE clears modules before the manifest", async () => {
  const calls: WorkspaceProjectDataStep[] = [];
  const result = await deleteWorkspaceProjectLocalData(
    "workspace:delete-test",
    createPorts(calls),
  );
  assert(result.ok, "Project-local deletion did not complete.");
  assert(
    calls.join(",") === "draw,audio,game,pixync,manifest",
    "Project data was not cleared in retry-safe order.",
  );
  assert(result.cleared.length === 5 && result.failed.length === 0, "Deletion result was incomplete.");
});

Deno.test("PROJECT-DATA-DELETE keeps the manifest when a module fails", async () => {
  const calls: WorkspaceProjectDataStep[] = [];
  const result = await deleteWorkspaceProjectLocalData(
    "workspace:delete-test",
    createPorts(calls, new Set(["audio"])),
  );
  assert(!result.ok, "Failed module deletion was reported as successful.");
  assert(
    calls.join(",") === "draw,audio,game,pixync",
    "Manifest was cleared before a failed module could be retried.",
  );
  assert(
    result.failed.length === 1 && result.failed[0] === "audio",
    "The failed module was not reported.",
  );
});

Deno.test("PROJECT-DATA-DELETE keeps the manifest when manifest cleanup fails", async () => {
  const calls: WorkspaceProjectDataStep[] = [];
  const result = await deleteWorkspaceProjectLocalData(
    "workspace:delete-test",
    createPorts(calls, new Set(["manifest"])),
  );
  assert(!result.ok, "Manifest failure was reported as successful.");
  assert(
    calls.join(",") === "draw,audio,game,pixync,manifest",
    "Manifest cleanup was not attempted after all module data cleared.",
  );
  assert(
    result.failed.length === 1 && result.failed[0] === "manifest",
    "Manifest failure was not reported.",
  );
});
