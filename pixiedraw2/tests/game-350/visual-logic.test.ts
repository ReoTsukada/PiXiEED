import { asBehaviorId } from "../../src/game/game-300/core.ts";
import {
  compileBoundedGameScript,
  compileVisualGameLogicGraph,
  createVisualGameLogicStarter,
  validateBoundedGameScript,
  validateVisualGameLogic,
  type VisualGameLogicSource,
} from "../../src/game/game-350/visual-logic.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("GAME350-LOGIC-001 compiles a visual A/B graph into canonical Behavior IR", () => {
  const source = createVisualGameLogicStarter(asBehaviorId("behavior-door"), "player");
  const compiled = compileVisualGameLogicGraph(source);
  assert(compiled.behavior.rules.length === 2, "A/B graph must compile to two deterministic paths");
  assert(compiled.behavior.rules.some((rule) => rule.conditions.some((condition) => condition.kind === "VARIABLE_EQUALS")), "A path must retain the condition");
  assert(compiled.behavior.rules.some((rule) => rule.conditions.some((condition) => condition.kind === "VARIABLE_NOT_EQUALS")), "B path must compile to the inverse condition");
  assert(compiled.behavior.ownership === "CANONICAL_IR", "all authoring modes must converge on canonical IR");
});

Deno.test("GAME350-LOGIC-002 rejects incomplete branches, cycles, and unreachable nodes", () => {
  const source = createVisualGameLogicStarter(asBehaviorId("behavior-invalid"));
  const missingBranch: VisualGameLogicSource = { ...source, edges: source.edges.filter((edge) => edge.port !== "FALSE") };
  assert(!validateVisualGameLogic(missingBranch).valid && validateVisualGameLogic(missingBranch).diagnostics.some((item) => item.code === "MISSING_BRANCH"), "both A and B ports are required");
  const cyclic: VisualGameLogicSource = { ...source, edges: [...source.edges, { edgeId: "edge-cycle", from: "end-open", to: "condition-has-key", port: "NEXT" }] };
  assert(!validateVisualGameLogic(cyclic).valid && validateVisualGameLogic(cyclic).diagnostics.some((item) => item.code === "INVALID_PORT"), "End nodes cannot create an executable cycle");
  const unreachable: VisualGameLogicSource = { ...source, nodes: [...source.nodes, { nodeId: "unreachable", kind: "END", label: "Unused" }] };
  assert(!validateVisualGameLogic(unreachable).valid && validateVisualGameLogic(unreachable).diagnostics.some((item) => item.code === "UNREACHABLE_NODE"), "unreachable nodes must be rejected");
});

Deno.test("GAME350-LOGIC-003 compiles bounded script syntax into the same graph and IR", () => {
  const source = {
    schemaVersion: 1 as const,
    sourceKind: "BOUNDED_SCRIPT" as const,
    behaviorId: asBehaviorId("behavior-script-door"),
    language: "typescript" as const,
    sourceText: [
      'on action("rpg.interact")',
      'if variable("hasKey") == true',
      'set variable("doorOpen") = true',
      "else",
      'set variable("dialogue") = "鍵が必要です"',
      "end",
    ].join("\n"),
  };
  assert(validateBoundedGameScript(source).valid, "bounded script syntax must validate");
  const compiled = compileBoundedGameScript(source);
  assert(compiled.source.nodes.some((node) => node.kind === "CONDITION") && compiled.behavior.rules.length === 2, "script must produce a visible A/B graph and two runtime paths");
});

Deno.test("GAME350-LOGIC-004 fails closed for host APIs and unbounded code", () => {
  const source = {
    schemaVersion: 1 as const,
    sourceKind: "BOUNDED_SCRIPT" as const,
    behaviorId: asBehaviorId("behavior-unsafe-script"),
    language: "typescript" as const,
    sourceText: 'on action("start")\nfetch("https://outside.invalid")',
  };
  const validation = validateBoundedGameScript(source);
  assert(!validation.valid && validation.diagnostics.some((item) => item.code === "SCRIPT_FORBIDDEN_API"), "host API access must never enter the Runtime compiler");
});
