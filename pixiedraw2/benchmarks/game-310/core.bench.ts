import { asActionId, asContextId, asControlId, resolveInput, type ActionMap } from "../../src/game/game-310/core.ts";

const ownerId = "benchmark-owner";
const projectId = "benchmark-project";
const controlId = asControlId("jump-control");
const map: ActionMap = { mapId: "benchmark-map", ownerId, projectId, contexts: [{ contextId: asContextId("gameplay"), priority: 10, enabled: true, actions: [{ actionId: asActionId("jump"), label: "Jump", bindings: [{ device: "KEYBOARD", code: "Space" }, { device: "TOUCH", controlId, gesture: "TAP" }, { device: "GAMEPAD", control: "A" }, { device: "CUSTOM", controlId, signal: "jump" }] }] }] };
const iterations = 1000;
const start = performance.now();
let resolved = 0;
for (let index = 0; index < iterations; index += 1) if (resolveInput(map, { device: "KEYBOARD", code: "Space" }, { ownerId, projectId })) resolved += 1;
const totalMs = Number((performance.now() - start).toFixed(3));
console.log(JSON.stringify({ workPackage: "GAME-310", status: "MEASURED_LOCAL_SYNTHETIC", iterations, resolved, totalMs, averageMs: Number((totalMs / iterations).toFixed(4)) }));
