export type GameElementKind = "ITEM" | "SKILL" | "CURRENCY" | "STATUS" | "TIMER";
export interface GameElementState { readonly values: Readonly<Record<string, number>>; readonly skills: readonly string[]; readonly timers: Readonly<Record<string, number>>; readonly equipped: readonly string[]; }
export type GameElementAction =
  | { readonly type: "ADD"; readonly id: string; readonly amount?: number }
  | { readonly type: "SET"; readonly id: string; readonly value: number }
  | { readonly type: "USE"; readonly id: string; readonly amount?: number }
  | { readonly type: "EQUIP"; readonly id: string }
  | { readonly type: "LEARN"; readonly id: string }
  | { readonly type: "SET_TIMER"; readonly id: string; readonly seconds: number }
  | { readonly type: "TICK"; readonly seconds: number };

export function createGameElementState(): GameElementState { return { values: {}, skills: [], timers: {}, equipped: [] }; }
export function applyGameElementEffect(state: GameElementState, effect: string | undefined, targetId?: string): GameElementState {
  if (effect === undefined) return state;
  const match = /^\s*([^+\-=:：]+?)\s*(?:[=:：]\s*)?([+\-])\s*(\d+(?:\.\d+)?)\s*$/u.exec(effect);
  if (match === null) return state;
  const id = targetId?.trim() || match[1]?.trim(); const amount = Number(match[3]);
  if (!id || !Number.isFinite(amount)) return state;
  const delta = match[2] === "-" ? -amount : amount;
  return { ...state, values: { ...state.values, [id]: Math.max(0, (state.values[id] ?? 0) + delta) } };
}
export function applyGameElementAction(state: GameElementState, action: GameElementAction): GameElementState {
  if (action.type === "LEARN") return state.skills.includes(action.id) ? state : { ...state, skills: [...state.skills, action.id] };
  if (action.type === "EQUIP") return state.equipped.includes(action.id) ? state : { ...state, equipped: [...state.equipped, action.id] };
  if (action.type === "TICK") {
    const timers = Object.fromEntries(Object.entries(state.timers).map(([id, value]) => [id, Math.max(0, value - Math.max(0, action.seconds))]));
    return { ...state, timers };
  }
  if (action.type === "SET_TIMER") return { ...state, timers: { ...state.timers, [action.id]: Math.max(0, action.seconds) } };
  const current = state.values[action.id] ?? 0;
  const next = action.type === "SET" ? Math.max(0, action.value) : action.type === "USE" ? Math.max(0, current - (action.amount ?? 1)) : current + (action.amount ?? 1);
  return { ...state, values: { ...state.values, [action.id]: next } };
}
