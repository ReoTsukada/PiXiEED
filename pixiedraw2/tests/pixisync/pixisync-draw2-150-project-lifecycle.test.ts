import { strict as assert } from "node:assert";
import { PixisyncInMemorySnapshotPersistence } from "../../src/pixisync/durability.ts";
import { PixisyncProjectLifecycleCoordinator } from "../../src/pixisync/project-lifecycle.ts";

const EVENT = "pixiedraw2:project-changed";
const change = (
  target: EventTarget,
  projectId: string,
  kind: "OPEN" | "NEW" = "OPEN",
) =>
  target.dispatchEvent(new CustomEvent(EVENT, { detail: { projectId, kind } }));

function fixture(open?: (projectId: string) => Promise<{ projectId: string }>) {
  const target = new EventTarget();
  const calls: string[] = [];
  const states: string[] = [];
  const coordinator = new PixisyncProjectLifecycleCoordinator({
    eventTarget: target,
    eventName: EVENT,
    initialProjectId: "project-a",
    createPersistence(projectId) {
      calls.push(`persistence:${projectId}`);
      return new PixisyncInMemorySnapshotPersistence();
    },
    async openJournal(projectId) {
      calls.push(`open:${projectId}`);
      return open === undefined ? { projectId } : open(projectId);
    },
    async flushProject(projectId) {
      calls.push(`flush:${projectId}`);
    },
    async stopProject(projectId) {
      calls.push(`stop:${projectId}`);
    },
    onState(state) {
      states.push(`${state.phase}:${state.projectId}`);
    },
  });
  return { target, calls, states, coordinator };
}

Deno.test("PIXISYNC-DRAW2-150 initial open and ordered project switch", async () => {
  const f = fixture();
  await f.coordinator.start();
  change(f.target, "project-b");
  await f.coordinator.settled();
  assert.equal(f.coordinator.state().phase, "ACTIVE");
  assert.equal(f.coordinator.activeJournal()?.projectId, "project-b");
  assert.deepEqual(f.calls, [
    "persistence:project-a",
    "open:project-a",
    "flush:project-a",
    "stop:project-a",
    "persistence:project-b",
    "open:project-b",
  ]);
});

Deno.test("PIXISYNC-DRAW2-150 same OPEN is no-op and NEW reopens", async () => {
  const f = fixture();
  await f.coordinator.start();
  change(f.target, "project-a", "OPEN");
  await f.coordinator.settled();
  assert.equal(f.calls.filter((x) => x === "open:project-a").length, 1);
  change(f.target, "project-a", "NEW");
  await f.coordinator.settled();
  assert.equal(f.calls.filter((x) => x === "open:project-a").length, 2);
});

Deno.test("PIXISYNC-DRAW2-150 stale intermediate open never becomes active", async () => {
  let releaseB!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseB = resolve;
  });
  const f = fixture(async (projectId) => {
    if (projectId === "project-b") await gate;
    return { projectId };
  });
  await f.coordinator.start();
  change(f.target, "project-b");
  await Promise.resolve();
  change(f.target, "project-c");
  releaseB();
  await f.coordinator.settled();
  assert.equal(f.coordinator.activeJournal()?.projectId, "project-c");
  assert.equal(f.states.includes("ACTIVE:project-b"), false);
});

Deno.test("PIXISYNC-DRAW2-150 failed open does not reuse old journal", async () => {
  const f = fixture(async (projectId) => {
    if (projectId === "project-b") throw new Error("open failed");
    return { projectId };
  });
  await f.coordinator.start();
  change(f.target, "project-b");
  await f.coordinator.settled();
  assert.equal(f.coordinator.state().phase, "UNAVAILABLE");
  assert.equal(f.coordinator.activeJournal(), undefined);
  assert.ok(f.calls.includes("flush:project-a"));
  assert.ok(f.calls.includes("stop:project-a"));
});

Deno.test("PIXISYNC-DRAW2-150 dispose removes listener and drains active journal", async () => {
  const f = fixture();
  await f.coordinator.start();
  await f.coordinator.dispose();
  change(f.target, "project-b");
  await f.coordinator.settled();
  assert.equal(f.coordinator.state().phase, "DISPOSED");
  assert.equal(f.calls.includes("open:project-b"), false);
  assert.ok(f.calls.includes("flush:project-a"));
  assert.ok(f.calls.includes("stop:project-a"));
});

Deno.test("PIXISYNC-DRAW2-150 rejects substituted journal identity", async () => {
  const f = fixture(async () => ({ projectId: "substituted" }));
  await f.coordinator.start();
  assert.equal(f.coordinator.state().phase, "UNAVAILABLE");
  assert.equal(f.coordinator.activeJournal(), undefined);
});

Deno.test("PIXISYNC-DRAW2-150 flush failure stays recoverable", async () => {
  const target = new EventTarget();
  let failFlush = true;
  const opened: string[] = [];
  const coordinator = new PixisyncProjectLifecycleCoordinator({
    eventTarget: target,
    eventName: EVENT,
    initialProjectId: "project-a",
    createPersistence: () => new PixisyncInMemorySnapshotPersistence(),
    async openJournal(projectId) {
      opened.push(projectId);
      return { projectId };
    },
    async flushProject() {
      if (failFlush) throw new Error("disk unavailable");
    },
    async stopProject() {},
  });
  await coordinator.start();
  change(target, "project-b");
  await coordinator.settled();
  assert.equal(coordinator.state().phase, "UNAVAILABLE");
  assert.equal(coordinator.activeJournal(), undefined);

  failFlush = false;
  change(target, "project-c");
  await coordinator.settled();
  assert.equal(coordinator.activeJournal()?.projectId, "project-c");
  assert.deepEqual(opened, ["project-a", "project-c"]);
});
