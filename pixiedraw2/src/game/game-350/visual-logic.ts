/**
 * GAME-350 visual Game Logic.
 *
 * The graph is the authoring surface. Compilation produces the canonical
 * GAME-300 Behavior IR, so the same behavior can be edited as an Event Sheet,
 * an A/B node graph, or the bounded PiXiEED TypeScript-like script below.
 * This module never evaluates user text or executes host APIs.
 */

import {
  compileNoCodeBehavior,
  type BehaviorAction,
  type BehaviorCondition,
  type BehaviorIR,
  type BehaviorTrigger,
  type BehaviorId,
} from "../game-300/core.ts";

export const GAME350_VISUAL_LOGIC_SCHEMA_VERSION = 1 as const;
export const GAME350_SCRIPT_SOURCE_SCHEMA_VERSION = 1 as const;
export const GAME350_VISUAL_LOGIC_LIMITS = Object.freeze({
  maxNodes: 128,
  maxEdges: 256,
  maxScriptBytes: 32 * 1024,
  maxScriptLines: 256,
});

export type VisualGameLogicNodeKind = "EVENT" | "CONDITION" | "ACTION" | "MERGE" | "END";
export type VisualGameLogicPort = "NEXT" | "TRUE" | "FALSE";

export interface VisualGameLogicEventNode {
  readonly nodeId: string;
  readonly kind: "EVENT";
  readonly label: string;
  readonly trigger: BehaviorTrigger;
}

export interface VisualGameLogicConditionNode {
  readonly nodeId: string;
  readonly kind: "CONDITION";
  readonly label: string;
  readonly condition: BehaviorCondition;
}

export interface VisualGameLogicActionNode {
  readonly nodeId: string;
  readonly kind: "ACTION";
  readonly label: string;
  readonly action: BehaviorAction;
}

export interface VisualGameLogicMergeNode {
  readonly nodeId: string;
  readonly kind: "MERGE";
  readonly label: string;
}

export interface VisualGameLogicEndNode {
  readonly nodeId: string;
  readonly kind: "END";
  readonly label: string;
}

export type VisualGameLogicNode =
  | VisualGameLogicEventNode
  | VisualGameLogicConditionNode
  | VisualGameLogicActionNode
  | VisualGameLogicMergeNode
  | VisualGameLogicEndNode;

export interface VisualGameLogicEdge {
  readonly edgeId: string;
  readonly from: string;
  readonly to: string;
  readonly port: VisualGameLogicPort;
}

export interface VisualGameLogicSource {
  readonly schemaVersion: typeof GAME350_VISUAL_LOGIC_SCHEMA_VERSION;
  readonly sourceKind: "VISUAL_GRAPH";
  readonly behaviorId: BehaviorId;
  readonly nodes: readonly VisualGameLogicNode[];
  readonly edges: readonly VisualGameLogicEdge[];
}

export interface BoundedGameScriptSource {
  readonly schemaVersion: typeof GAME350_SCRIPT_SOURCE_SCHEMA_VERSION;
  readonly sourceKind: "BOUNDED_SCRIPT";
  readonly behaviorId: BehaviorId;
  readonly language: "typescript";
  /** A deliberately small, host-free TypeScript-like command subset. */
  readonly sourceText: string;
}

export interface VisualGameLogicDiagnostic {
  readonly code:
    | "EMPTY_GRAPH"
    | "TOO_MANY_NODES"
    | "TOO_MANY_EDGES"
    | "INVALID_NODE"
    | "DUPLICATE_NODE"
    | "DUPLICATE_EDGE"
    | "MISSING_NODE"
    | "INVALID_PORT"
    | "DUPLICATE_PORT"
    | "MISSING_EVENT"
    | "MULTIPLE_EVENTS"
    | "MISSING_END"
    | "MISSING_BRANCH"
    | "MISSING_NEXT"
    | "CYCLE"
    | "UNREACHABLE_NODE"
    | "DEAD_END"
    | "INVALID_TRIGGER"
    | "INVALID_CONDITION"
    | "INVALID_ACTION"
    | "SCRIPT_TOO_LARGE"
    | "SCRIPT_FORBIDDEN_API"
    | "SCRIPT_SYNTAX";
  readonly path: string;
  readonly message: string;
}

export interface VisualGameLogicValidation {
  readonly valid: boolean;
  readonly diagnostics: readonly VisualGameLogicDiagnostic[];
}

export interface CompiledVisualGameLogic {
  readonly source: VisualGameLogicSource;
  readonly behavior: BehaviorIR;
}

function diagnostic(
  code: VisualGameLogicDiagnostic["code"],
  path: string,
  message: string,
): VisualGameLogicDiagnostic {
  return { code, path, message };
}

function validId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value);
}

function validTrigger(trigger: BehaviorTrigger): boolean {
  if (!["ACTION", "TAP", "COLLISION", "TIMER", "CUSTOM"].includes(trigger.type)) return false;
  if (["ACTION", "TAP", "COLLISION", "TIMER", "CUSTOM"].includes(trigger.type) && trigger.value !== undefined && trigger.value.length > 128) return false;
  if (trigger.type === "ACTION" && (trigger.actionId === undefined || !validId(trigger.actionId))) return false;
  return true;
}

function validCondition(condition: BehaviorCondition): boolean {
  switch (condition.kind) {
    case "ALWAYS":
    case "NEVER":
      return true;
    case "VARIABLE_EQUALS":
    case "VARIABLE_NOT_EQUALS":
      return condition.key !== undefined && condition.key.trim().length > 0 && condition.value !== undefined;
    case "HAS_COMPONENT":
    case "NOT_HAS_COMPONENT":
      return condition.key !== undefined && validId(condition.key);
    case "NOT":
      return validCondition(condition.condition);
    default:
      return false;
  }
}

function validAction(action: BehaviorAction): boolean {
  if (!validId(action.targetId)) return false;
  if (action.kind === "SET_COMPONENT_PROPERTY" && (action.property === undefined || action.property.trim().length === 0)) return false;
  if (action.kind === "SET_VARIABLE" && (action.property === undefined || action.property.trim().length === 0)) return false;
  if (action.kind === "ADD_VARIABLE" && (action.property === undefined || action.property.trim().length === 0 || typeof action.value !== "number")) return false;
  if (["SET_VARIABLE", "SET_COMPONENT_PROPERTY", "PLAY_AUDIO"].includes(action.kind) && action.value === undefined) return false;
  return true;
}

function allowedPorts(node: VisualGameLogicNode): readonly VisualGameLogicPort[] {
  return node.kind === "CONDITION" ? ["TRUE", "FALSE"] : node.kind === "END" ? [] : ["NEXT"];
}

function invertCondition(condition: BehaviorCondition): BehaviorCondition {
  switch (condition.kind) {
    case "ALWAYS": return { kind: "NEVER" };
    case "NEVER": return { kind: "ALWAYS" };
    case "VARIABLE_EQUALS": return { kind: "VARIABLE_NOT_EQUALS", key: condition.key!, value: condition.value! };
    case "VARIABLE_NOT_EQUALS": return { kind: "VARIABLE_EQUALS", key: condition.key!, value: condition.value! };
    case "HAS_COMPONENT": return { kind: "NOT_HAS_COMPONENT", key: condition.key! };
    case "NOT_HAS_COMPONENT": return { kind: "HAS_COMPONENT", key: condition.key! };
    case "NOT": return condition.condition;
  }
}

function graphIndexes(source: VisualGameLogicSource): {
  readonly nodes: ReadonlyMap<string, VisualGameLogicNode>;
  readonly outgoing: ReadonlyMap<string, ReadonlyMap<VisualGameLogicPort, VisualGameLogicEdge>>;
} {
  const nodes = new Map(source.nodes.map((node) => [node.nodeId, node]));
  const outgoing = new Map<string, Map<VisualGameLogicPort, VisualGameLogicEdge>>();
  for (const node of source.nodes) outgoing.set(node.nodeId, new Map());
  for (const edge of source.edges) {
    const ports = outgoing.get(edge.from);
    if (ports !== undefined && !ports.has(edge.port)) ports.set(edge.port, edge);
  }
  return { nodes, outgoing };
}

export function validateVisualGameLogic(source: VisualGameLogicSource): VisualGameLogicValidation {
  const diagnostics: VisualGameLogicDiagnostic[] = [];
  if (source.schemaVersion !== GAME350_VISUAL_LOGIC_SCHEMA_VERSION || source.sourceKind !== "VISUAL_GRAPH") diagnostics.push(diagnostic("INVALID_NODE", "schemaVersion", "Visual Logic Graph schema is unsupported."));
  if (source.nodes.length === 0) diagnostics.push(diagnostic("EMPTY_GRAPH", "nodes", "Add an Event, a condition or action, and an End node."));
  if (source.nodes.length > GAME350_VISUAL_LOGIC_LIMITS.maxNodes) diagnostics.push(diagnostic("TOO_MANY_NODES", "nodes", "Visual Logic Graph exceeds the node limit."));
  if (source.edges.length > GAME350_VISUAL_LOGIC_LIMITS.maxEdges) diagnostics.push(diagnostic("TOO_MANY_EDGES", "edges", "Visual Logic Graph exceeds the connection limit."));
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  const indexes = graphIndexes(source);
  for (const [index, node] of source.nodes.entries()) {
    if (!validId(node.nodeId) || node.label.trim().length === 0) diagnostics.push(diagnostic("INVALID_NODE", `nodes[${index}]`, "Node ID and label must be stable and non-empty."));
    if (nodeIds.has(node.nodeId)) diagnostics.push(diagnostic("DUPLICATE_NODE", `nodes[${index}].nodeId`, `Node ${node.nodeId} is duplicated.`));
    nodeIds.add(node.nodeId);
    if (node.kind === "EVENT" && !validTrigger(node.trigger)) diagnostics.push(diagnostic("INVALID_TRIGGER", `nodes[${index}].trigger`, "Event trigger is invalid."));
    if (node.kind === "CONDITION" && !validCondition(node.condition)) diagnostics.push(diagnostic("INVALID_CONDITION", `nodes[${index}].condition`, "Condition is not supported by the bounded Runtime IR."));
    if (node.kind === "ACTION" && !validAction(node.action)) diagnostics.push(diagnostic("INVALID_ACTION", `nodes[${index}].action`, "Action is not supported by the bounded Runtime IR."));
  }
  for (const [index, edge] of source.edges.entries()) {
    if (!validId(edge.edgeId)) diagnostics.push(diagnostic("DUPLICATE_EDGE", `edges[${index}].edgeId`, "Edge ID must be a stable identifier."));
    if (edgeIds.has(edge.edgeId)) diagnostics.push(diagnostic("DUPLICATE_EDGE", `edges[${index}].edgeId`, `Edge ${edge.edgeId} is duplicated.`));
    edgeIds.add(edge.edgeId);
    const from = indexes.nodes.get(edge.from);
    const to = indexes.nodes.get(edge.to);
    if (from === undefined || to === undefined) {
      diagnostics.push(diagnostic("MISSING_NODE", `edges[${index}]`, "Every connection must reference existing nodes."));
      continue;
    }
    if (!allowedPorts(from).includes(edge.port)) diagnostics.push(diagnostic("INVALID_PORT", `edges[${index}].port`, `Port ${edge.port} is not valid for ${from.kind}.`));
    const ports = indexes.outgoing.get(edge.from);
    if (ports !== undefined && ports.has(edge.port)) {
      const first = ports.get(edge.port);
      if (first?.edgeId !== edge.edgeId) diagnostics.push(diagnostic("DUPLICATE_PORT", `edges[${index}].port`, `Node ${edge.from} already has a ${edge.port} connection.`));
    }
  }
  const events = source.nodes.filter((node) => node.kind === "EVENT");
  if (events.length === 0) diagnostics.push(diagnostic("MISSING_EVENT", "nodes", "A graph needs one Event node as its entry point."));
  if (events.length > 1) diagnostics.push(diagnostic("MULTIPLE_EVENTS", "nodes", "A behavior graph must have one Event node; split separate events into separate behaviors."));
  if (!source.nodes.some((node) => node.kind === "END")) diagnostics.push(diagnostic("MISSING_END", "nodes", "Every graph needs an End node."));
  for (const node of source.nodes) {
    const ports = indexes.outgoing.get(node.nodeId) ?? new Map();
    if (node.kind === "CONDITION") {
      if (!ports.has("TRUE") || !ports.has("FALSE")) diagnostics.push(diagnostic("MISSING_BRANCH", `nodes.${node.nodeId}`, "A condition needs both A (true) and B (false) connections."));
    } else if (node.kind !== "END" && !ports.has("NEXT")) {
      diagnostics.push(diagnostic("MISSING_NEXT", `nodes.${node.nodeId}`, `${node.kind} needs a next connection.`));
    }
  }
  const start = events[0];
  const colours = new Map<string, "VISITING" | "VISITED">();
  const reachable = new Set<string>();
  const visit = (nodeId: string): void => {
    const colour = colours.get(nodeId);
    if (colour === "VISITING") {
      diagnostics.push(diagnostic("CYCLE", `nodes.${nodeId}`, "A visual game graph cannot contain a cycle."));
      return;
    }
    if (colour === "VISITED") return;
    colours.set(nodeId, "VISITING");
    reachable.add(nodeId);
    for (const edge of indexes.outgoing.get(nodeId)?.values() ?? []) visit(edge.to);
    colours.set(nodeId, "VISITED");
  };
  if (start !== undefined) visit(start.nodeId);
  for (const node of source.nodes) if (!reachable.has(node.nodeId)) diagnostics.push(diagnostic("UNREACHABLE_NODE", `nodes.${node.nodeId}`, "Every visual node must be reachable from the Event node."));
  const canReachEnd = new Set<string>();
  const reverse = new Map<string, string[]>();
  for (const edge of source.edges) reverse.set(edge.to, [...(reverse.get(edge.to) ?? []), edge.from]);
  const pending = source.nodes.filter((node) => node.kind === "END").map((node) => node.nodeId);
  while (pending.length > 0) {
    const nodeId = pending.pop()!;
    if (canReachEnd.has(nodeId)) continue;
    canReachEnd.add(nodeId);
    pending.push(...(reverse.get(nodeId) ?? []));
  }
  for (const nodeId of reachable) if (!canReachEnd.has(nodeId)) diagnostics.push(diagnostic("DEAD_END", `nodes.${nodeId}`, "Every A/B path must reach an End node."));
  return { valid: diagnostics.length === 0, diagnostics };
}

export function compileVisualGameLogicGraph(source: VisualGameLogicSource): CompiledVisualGameLogic {
  const validation = validateVisualGameLogic(source);
  if (!validation.valid) throw new Error(validation.diagnostics.map((item) => `${item.code}:${item.path}`).join("; "));
  const indexes = graphIndexes(source);
  const event = source.nodes.find((node): node is VisualGameLogicEventNode => node.kind === "EVENT")!;
  const rules: { readonly conditions: readonly BehaviorCondition[]; readonly actions: readonly BehaviorAction[] }[] = [];
  const walk = (nodeId: string, conditions: readonly BehaviorCondition[], actions: readonly BehaviorAction[], path: ReadonlySet<string>): void => {
    if (path.has(nodeId)) throw new Error(`CYCLE:nodes.${nodeId}`);
    const nextPath = new Set(path).add(nodeId);
    const node = indexes.nodes.get(nodeId)!;
    if (node.kind === "END") {
      rules.push({ conditions: conditions.length === 0 ? [{ kind: "ALWAYS" }] : conditions, actions });
      return;
    }
    if (node.kind === "CONDITION") {
      walk(indexes.outgoing.get(nodeId)!.get("TRUE")!.to, [...conditions, node.condition], actions, nextPath);
      walk(indexes.outgoing.get(nodeId)!.get("FALSE")!.to, [...conditions, invertCondition(node.condition)], actions, nextPath);
      return;
    }
    const next = indexes.outgoing.get(nodeId)!.get("NEXT")!.to;
    walk(next, conditions, node.kind === "ACTION" ? [...actions, node.action] : actions, nextPath);
  };
  walk(event.nodeId, [], [], new Set());
  const behavior = compileNoCodeBehavior({
    behaviorId: source.behaviorId,
    rules: rules.map((rule, index) => ({
      ruleId: `${String(source.behaviorId)}:path:${String(index + 1).padStart(3, "0")}`,
      enabled: true,
      trigger: event.trigger,
      conditions: rule.conditions,
      actions: rule.actions,
    })),
  });
  return { source, behavior };
}

export function createVisualGameLogicStarter(behaviorId: BehaviorId, targetId = "player"): VisualGameLogicSource {
  return {
    schemaVersion: GAME350_VISUAL_LOGIC_SCHEMA_VERSION,
    sourceKind: "VISUAL_GRAPH",
    behaviorId,
    nodes: [
      { nodeId: "event-interact", kind: "EVENT", label: "Interact / Enter", trigger: { type: "ACTION", actionId: "rpg.interact" } },
      { nodeId: "condition-has-key", kind: "CONDITION", label: "Has Key? · A / B", condition: { kind: "VARIABLE_EQUALS", key: "hasKey", value: true } },
      { nodeId: "action-open-door", kind: "ACTION", label: "A: Open Door", action: { kind: "SET_VARIABLE", targetId, property: "doorOpen", value: true } },
      { nodeId: "action-need-key", kind: "ACTION", label: "B: Show Message", action: { kind: "SET_VARIABLE", targetId, property: "dialogue", value: "鍵が必要です。" } },
      { nodeId: "end-open", kind: "END", label: "A End" },
      { nodeId: "end-locked", kind: "END", label: "B End" },
    ],
    edges: [
      { edgeId: "edge-event-condition", from: "event-interact", to: "condition-has-key", port: "NEXT" },
      { edgeId: "edge-condition-a", from: "condition-has-key", to: "action-open-door", port: "TRUE" },
      { edgeId: "edge-condition-b", from: "condition-has-key", to: "action-need-key", port: "FALSE" },
      { edgeId: "edge-open-end", from: "action-open-door", to: "end-open", port: "NEXT" },
      { edgeId: "edge-locked-end", from: "action-need-key", to: "end-locked", port: "NEXT" },
    ],
  };
}

const SCRIPT_FORBIDDEN = /\b(?:eval|Function|import|export|document|window|globalThis|fetch|WebSocket|localStorage|indexedDB|Deno|while|for|setInterval|setTimeout|WebAssembly)\b/u;

function parseLiteral(value: string, path: string): string | number | boolean {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "string") return parsed;
    } catch { /* handled below */ }
  }
  throw new Error(`SCRIPT_SYNTAX:${path}:literal must be true, false, a number, or a double-quoted string`);
}

function quoted(value: string, path: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) throw new Error(`SCRIPT_SYNTAX:${path}:expected a double-quoted identifier`);
  const parsed = JSON.parse(trimmed) as unknown;
  if (typeof parsed !== "string" || !validId(parsed)) throw new Error(`SCRIPT_SYNTAX:${path}:identifier is invalid`);
  return parsed;
}

interface ScriptActionStatement { readonly type: "ACTION"; readonly action: BehaviorAction; }
interface ScriptIfStatement { readonly type: "IF"; readonly condition: BehaviorCondition; readonly then: readonly ScriptStatement[]; readonly otherwise: readonly ScriptStatement[]; }
type ScriptStatement = ScriptActionStatement | ScriptIfStatement;

function parseConditionText(value: string, path: string): BehaviorCondition {
  const variable = /^variable\((".*")\)\s*(==|!=)\s*(.+)$/u.exec(value.trim());
  if (variable !== null) return { kind: variable[2] === "==" ? "VARIABLE_EQUALS" : "VARIABLE_NOT_EQUALS", key: quoted(variable[1]!, `${path}.key`), value: parseLiteral(variable[3]!, `${path}.value`) };
  const has = /^(!)?hasComponent\((".*")\)$/u.exec(value.trim());
  if (has !== null) return { kind: has[1] === "!" ? "NOT_HAS_COMPONENT" : "HAS_COMPONENT", key: quoted(has[2]!, `${path}.key`) };
  throw new Error(`SCRIPT_SYNTAX:${path}:use variable("key") == value or hasComponent("type")`);
}

function parseActionText(value: string, path: string): BehaviorAction {
  const setVariable = /^set\s+variable\((".*")\)\s*=\s*(.+)$/u.exec(value.trim());
  if (setVariable !== null) return { kind: "SET_VARIABLE", targetId: "variables", property: quoted(setVariable[1]!, `${path}.key`), value: parseLiteral(setVariable[2]!, `${path}.value`) };
  const addVariable = /^add\s+variable\((".*")\)\s*\+=\s*(.+)$/u.exec(value.trim());
  if (addVariable !== null) return { kind: "ADD_VARIABLE", targetId: "variables", property: quoted(addVariable[1]!, `${path}.key`), value: parseLiteral(addVariable[2]!, `${path}.value`) };
  const setComponent = /^set\s+component\((".*"),(".*")\)\s*=\s*(.+)$/u.exec(value.trim());
  if (setComponent !== null) return { kind: "SET_COMPONENT_PROPERTY", targetId: quoted(setComponent[1]!, `${path}.targetId`), property: quoted(setComponent[2]!, `${path}.property`), value: parseLiteral(setComponent[3]!, `${path}.value`) };
  const playAudio = /^play\s+audio\((".*")\)$/u.exec(value.trim());
  if (playAudio !== null) return { kind: "PLAY_AUDIO", targetId: quoted(playAudio[1]!, `${path}.assetId`), value: true };
  const spawn = /^spawn\s+entity\((".*")\)$/u.exec(value.trim());
  if (spawn !== null) return { kind: "SPAWN_ENTITY", targetId: quoted(spawn[1]!, `${path}.entityId`) };
  throw new Error(`SCRIPT_SYNTAX:${path}:unknown action`);
}

function parseScriptStatements(lines: readonly string[], start: number, stopAtElse: boolean): { readonly statements: readonly ScriptStatement[]; readonly next: number; readonly stoppedAtElse: boolean } {
  const statements: ScriptStatement[] = [];
  let index = start;
  while (index < lines.length) {
    const line = lines[index]!.trim();
    if (line === "else" && stopAtElse) return { statements, next: index + 1, stoppedAtElse: true };
    if (line === "end") return { statements, next: index + 1, stoppedAtElse: false };
    if (line.startsWith("if ")) {
      const condition = parseConditionText(line.slice(3), `line.${index + 1}`);
      const thenBlock = parseScriptStatements(lines, index + 1, true);
      let otherwise: readonly ScriptStatement[] = [];
      let next = thenBlock.next;
      if (thenBlock.stoppedAtElse) {
        const elseBlock = parseScriptStatements(lines, thenBlock.next, false);
        otherwise = elseBlock.statements;
        next = elseBlock.next;
      }
      statements.push({ type: "IF", condition, then: thenBlock.statements, otherwise });
      index = next;
      continue;
    }
    if (line.startsWith("set ") || line.startsWith("add ") || line.startsWith("play ") || line.startsWith("spawn ")) statements.push({ type: "ACTION", action: parseActionText(line, `line.${index + 1}`) });
    else throw new Error(`SCRIPT_SYNTAX:line.${index + 1}:unknown statement`);
    index += 1;
  }
  return { statements, next: index, stoppedAtElse: false };
}

function scriptToGraph(source: BoundedGameScriptSource): VisualGameLogicSource {
  const lines = source.sourceText.split(/\r?\n/u).map((line) => line.replace(/\/\/.*$/u, "").trim()).filter((line) => line.length > 0);
  const header = lines.shift();
  const match = header === undefined ? null : /^on\s+(action|tap|collision|timer|custom)\((".*")\)$/u.exec(header);
  if (match === null) throw new Error("SCRIPT_SYNTAX:line.1:on action(\"id\") is required");
  const triggerType = match[1]!.toUpperCase() as BehaviorTrigger["type"];
  const triggerValue = quoted(match[2]!, "line.1.trigger");
  const parsed = parseScriptStatements(lines, 0, false);
  if (parsed.next !== lines.length) throw new Error("SCRIPT_SYNTAX:script did not consume all statements");
  const nodes: VisualGameLogicNode[] = [{ nodeId: "event-script", kind: "EVENT", label: `Script · ${triggerValue}`, trigger: { type: triggerType, ...(triggerType === "ACTION" ? { actionId: triggerValue } : { value: triggerValue }) } }];
  const edges: VisualGameLogicEdge[] = [];
  let edgeNumber = 0;
  const addEdge = (from: string, to: string, port: VisualGameLogicPort): void => { edgeNumber += 1; edges.push({ edgeId: `edge-script-${edgeNumber}`, from, to, port }); };
  let nodeNumber = 0;
  const addNode = (node: VisualGameLogicNode): void => { nodes.push(node); };
  const build = (entry: string, statements: readonly ScriptStatement[]): string => {
    let cursor = entry;
    for (const statement of statements) {
      nodeNumber += 1;
      if (statement.type === "ACTION") {
        const nodeId = `action-script-${nodeNumber}`;
        addNode({ nodeId, kind: "ACTION", label: statement.action.kind, action: statement.action });
        addEdge(cursor, nodeId, "NEXT");
        cursor = nodeId;
        continue;
      }
      const conditionId = `condition-script-${nodeNumber}`;
      const mergeId = `merge-script-${nodeNumber}`;
      addNode({ nodeId: conditionId, kind: "CONDITION", label: "A / B", condition: statement.condition });
      addNode({ nodeId: mergeId, kind: "MERGE", label: "A / B merge" });
      addEdge(cursor, conditionId, "NEXT");
      const thenTail = build(conditionId, statement.then);
      const elseTail = build(conditionId, statement.otherwise);
      // A recursive sequence initially attaches its first node through NEXT.
      // Convert those temporary edges to the condition's A/B ports after both
      // blocks are built; empty blocks connect directly to the merge node.
      const pending = edges.filter((edge) => edge.from === conditionId && edge.port === "NEXT");
      const replacePending = (port: VisualGameLogicPort): void => {
        const edge = pending.shift();
        if (edge === undefined) addEdge(conditionId, mergeId, port);
        else edges.splice(edges.indexOf(edge), 1, { ...edge, port });
      };
      replacePending("TRUE");
      if (statement.then.length > 0) addEdge(thenTail, mergeId, "NEXT");
      replacePending("FALSE");
      if (statement.otherwise.length > 0) addEdge(elseTail, mergeId, "NEXT");
      cursor = mergeId;
    }
    return cursor;
  };
  const tail = build("event-script", parsed.statements);
  addNode({ nodeId: "end-script", kind: "END", label: "End" });
  addEdge(tail, "end-script", "NEXT");
  return { schemaVersion: GAME350_VISUAL_LOGIC_SCHEMA_VERSION, sourceKind: "VISUAL_GRAPH", behaviorId: source.behaviorId, nodes, edges };
}

export function validateBoundedGameScript(source: BoundedGameScriptSource): VisualGameLogicValidation {
  const diagnostics: VisualGameLogicDiagnostic[] = [];
  if (source.schemaVersion !== GAME350_SCRIPT_SOURCE_SCHEMA_VERSION || source.sourceKind !== "BOUNDED_SCRIPT" || source.language !== "typescript") diagnostics.push(diagnostic("SCRIPT_SYNTAX", "source", "Only the bounded TypeScript-like Game Script is supported."));
  const bytes = new TextEncoder().encode(source.sourceText).byteLength;
  if (bytes > GAME350_VISUAL_LOGIC_LIMITS.maxScriptBytes) diagnostics.push(diagnostic("SCRIPT_TOO_LARGE", "sourceText", "Game Script exceeds the source size limit."));
  if (source.sourceText.split(/\r?\n/u).length > GAME350_VISUAL_LOGIC_LIMITS.maxScriptLines) diagnostics.push(diagnostic("SCRIPT_TOO_LARGE", "sourceText", "Game Script exceeds the line limit."));
  if (SCRIPT_FORBIDDEN.test(source.sourceText)) diagnostics.push(diagnostic("SCRIPT_FORBIDDEN_API", "sourceText", "Game Script cannot access host APIs, dynamic code, unbounded loops, or storage/network."));
  if (diagnostics.length > 0) return { valid: false, diagnostics };
  try {
    const graph = scriptToGraph(source);
    return validateVisualGameLogic(graph);
  } catch (error) {
    diagnostics.push(diagnostic("SCRIPT_SYNTAX", "sourceText", error instanceof Error ? error.message : "Game Script syntax is invalid."));
    return { valid: false, diagnostics };
  }
}

export function compileBoundedGameScript(source: BoundedGameScriptSource): CompiledVisualGameLogic {
  const validation = validateBoundedGameScript(source);
  if (!validation.valid) throw new Error(validation.diagnostics.map((item) => `${item.code}:${item.path}`).join("; "));
  const graph = scriptToGraph(source);
  return compileVisualGameLogicGraph(graph);
}
