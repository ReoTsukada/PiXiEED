import { applyGameElementAction, applyGameElementEffect, createGameElementState } from "../../src/game/game-350/game-elements.ts";
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
Deno.test("GAME350-ELEMENTS-001 applies shared item, skill, currency and timer actions", () => {
  let state = createGameElementState();
  state = applyGameElementAction(state, { type: "ADD", id: "coin", amount: 5 });
  state = applyGameElementAction(state, { type: "USE", id: "coin", amount: 2 });
  state = applyGameElementAction(state, { type: "LEARN", id: "heal" });
  state = applyGameElementAction(state, { type: "SET_TIMER", id: "cooldown", seconds: 3 });
  state = applyGameElementAction(state, { type: "TICK", seconds: 1 });
  state = applyGameElementEffect(state, "HP +20");
  state = applyGameElementAction(state, { type: "EQUIP", id: "sword" });
  state = applyGameElementAction(state, { type: "EQUIP", id: "sword" });
  state = applyGameElementEffect(state, "HP -50");
  state = applyGameElementEffect(state, "MP：+5");
  state = applyGameElementEffect(state, "HP +20", "status:hp");
  assert(state.values.coin === 3 && state.values.HP === 0 && state.values.MP === 5 && state.values["status:hp"] === 20 && state.skills.includes("heal") && state.timers.cooldown === 2 && state.equipped.length === 1, "shared element state should update deterministically");
});
